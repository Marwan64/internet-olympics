'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, useGameState } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';
import { lava_batSwing, lava_jump, lava_death, lava_hitPlayer } from '@/hooks/useGameSounds';

// ── Physics constants ─────────────────────────────────────────────────────────
const GRAVITY     = 18;   // units/s² downward
const JUMP_VEL    = 14;   // units/s upward on jump
const MOVE_SPD    = 8;    // units/s walk
const SPRINT_SPD  = 13;   // units/s sprint
const MAX_FALL    = 28;   // max downward speed
const PL_HH       = 0.9;  // player half-height (center-based)
const PL_R        = 0.4;  // player collision radius (horizontal)
const COYOTE_MS   = 110;  // grace ms after leaving ledge

// ── Camera ────────────────────────────────────────────────────────────────────
const CAM_DIST   = 14;
const CAM_H      = 9;
const CAM_K      = 6;   // exponential smoothing rate

// ── Platform layout ───────────────────────────────────────────────────────────
// pos = box CENTER in Three.js coords (Y-up). top surface = cy + h/2.
interface PlatDef {
  idx:  number;
  cx: number; cy: number; cz: number;
  w: number;  h: number;  d: number;
  color: number;
  moving?: { axis: 'x' | 'z'; amp: number; spd: number };
}

function buildPlatforms(): PlatDef[] {
  // Layer tops every 4 units: 1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49
  const raw: Omit<PlatDef, 'idx'>[] = [
    // ── Ground (top=1) ────────────────────────────────────────────────────
    { cx:  0, cy: 0.5, cz:  0, w: 50, h: 1, d: 50, color: 0x4ade80 },

    // ── Layer 1 (top=5, cy=4.5) ───────────────────────────────────────────
    { cx:-14, cy:4.5, cz: -7, w:12, h:1, d: 9, color: 0x60a5fa },
    { cx:  6, cy:4.5, cz: 11, w:12, h:1, d: 8, color: 0x60a5fa },
    { cx: 16, cy:4.5, cz: -3, w:10, h:1, d: 9, color: 0x60a5fa },
    { cx: -6, cy:4.5, cz: 14, w:10, h:1, d: 8, color: 0x60a5fa },
    { cx:  5, cy:4.5, cz:-14, w:12, h:1, d: 8, color: 0x60a5fa },

    // ── Layer 2 (top=9, cy=8.5) ───────────────────────────────────────────
    { cx:-13, cy:8.5, cz:  3, w:10, h:1, d: 8, color: 0xa78bfa },
    { cx:  3, cy:8.5, cz:  6, w:10, h:1, d: 8, color: 0xa78bfa },
    { cx: 14, cy:8.5, cz:-10, w: 9, h:1, d: 8, color: 0xa78bfa },
    { cx: -4, cy:8.5, cz:-12, w: 9, h:1, d: 7, color: 0xa78bfa },

    // ── Layer 3 (top=13, cy=12.5) ─────────────────────────────────────────
    { cx:-10, cy:12.5, cz:  6, w:8, h:1, d:7, color: 0xf472b6 },
    { cx:  6, cy:12.5, cz: -6, w:9, h:1, d:7, color: 0xf472b6 },
    { cx: 12, cy:12.5, cz:  8, w:8, h:1, d:6, color: 0xf472b6 },
    { cx: -2, cy:12.5, cz:-13, w:8, h:1, d:6, color: 0xf472b6,
      moving: { axis:'x', amp:5, spd:0.28 } },

    // ── Layer 4 (top=17, cy=16.5) ─────────────────────────────────────────
    { cx: -8, cy:16.5, cz: -4, w:8, h:1, d:6, color: 0xfb923c },
    { cx:  6, cy:16.5, cz:  4, w:7, h:1, d:6, color: 0xfb923c },
    { cx: -2, cy:16.5, cz: 12, w:7, h:1, d:6, color: 0xfb923c,
      moving: { axis:'z', amp:5, spd:0.33 } },
    { cx: 14, cy:16.5, cz: -2, w:7, h:1, d:6, color: 0xfb923c },

    // ── Layer 5 (top=21, cy=20.5) ─────────────────────────────────────────
    { cx: -6, cy:20.5, cz:  2, w:7, h:1, d:5, color: 0xfbbf24 },
    { cx:  6, cy:20.5, cz: -8, w:7, h:1, d:5, color: 0xfbbf24 },
    { cx:  1, cy:20.5, cz:  9, w:6, h:1, d:5, color: 0xfbbf24,
      moving: { axis:'x', amp:6, spd:0.38 } },

    // ── Layer 6 (top=25, cy=24.5) ─────────────────────────────────────────
    { cx: -4, cy:24.5, cz: -4, w:6, h:1, d:5, color: 0x34d399 },
    { cx:  8, cy:24.5, cz:  4, w:6, h:1, d:5, color: 0x34d399 },
    { cx:-10, cy:24.5, cz:  8, w:6, h:1, d:5, color: 0x34d399,
      moving: { axis:'z', amp:4, spd:0.43 } },

    // ── Layer 7 (top=29, cy=28.5) ─────────────────────────────────────────
    { cx:  0, cy:28.5, cz:  0, w:6, h:1, d:5, color: 0x38bdf8 },
    { cx: -8, cy:28.5, cz: -6, w:5, h:1, d:5, color: 0x38bdf8 },
    { cx:  8, cy:28.5, cz: -4, w:5, h:1, d:5, color: 0x38bdf8,
      moving: { axis:'x', amp:5, spd:0.48 } },

    // ── Layer 8 (top=33, cy=32.5) ─────────────────────────────────────────
    { cx: -4, cy:32.5, cz:  4, w:5, h:1, d:4, color: 0xc084fc },
    { cx:  6, cy:32.5, cz: -4, w:5, h:1, d:4, color: 0xc084fc },
    { cx:  0, cy:32.5, cz: -8, w:5, h:1, d:4, color: 0xc084fc,
      moving: { axis:'z', amp:5, spd:0.5 } },

    // ── Layer 9 (top=37, cy=36.5) ─────────────────────────────────────────
    { cx: -2, cy:36.5, cz:  2, w:5, h:1, d:4, color: 0xf87171 },
    { cx:  6, cy:36.5, cz: -2, w:5, h:1, d:4, color: 0xf87171 },
    { cx: -6, cy:36.5, cz: -4, w:5, h:1, d:4, color: 0xf87171,
      moving: { axis:'x', amp:4, spd:0.52 } },

    // ── Layer 10 (top=41, cy=40.5) ────────────────────────────────────────
    { cx:  0, cy:40.5, cz:  0, w:5, h:1, d:4, color: 0xfde68a },
    { cx: -6, cy:40.5, cz:  4, w:4, h:1, d:4, color: 0xfde68a,
      moving: { axis:'x', amp:4, spd:0.55 } },

    // ── Layer 11 – golden (top=45, cy=44.5) ───────────────────────────────
    { cx:  2, cy:44.5, cz: -2, w:4, h:1, d:4, color: 0xfbbf24 },
    { cx: -4, cy:44.5, cz:  2, w:4, h:1, d:4, color: 0xfbbf24,
      moving: { axis:'z', amp:3, spd:0.58 } },

    // ── Old apex platform (top=49, cy=48.5) ──────────────────────────────
    { cx:  0, cy:48.5, cz:  0, w:5, h:1, d:5, color: 0xfde047 },

    // ── Layer 12 (top=53, cy=52.5) ────────────────────────────────────────
    { cx: -3, cy:52.5, cz:  3, w:4, h:1, d:3, color: 0xe879f9,
      moving: { axis:'x', amp:3, spd:0.6 } },
    { cx:  5, cy:52.5, cz: -3, w:4, h:1, d:3, color: 0xe879f9 },

    // ── Layer 13 (top=57, cy=56.5) ────────────────────────────────────────
    { cx: -2, cy:56.5, cz: -2, w:4, h:1, d:3, color: 0xfda4af,
      moving: { axis:'z', amp:2, spd:0.65 } },
    { cx:  4, cy:56.5, cz:  2, w:3, h:1, d:3, color: 0xfda4af },

    // ── Layer 14 (top=61, cy=60.5) ────────────────────────────────────────
    { cx:  0, cy:60.5, cz:  0, w:4, h:1, d:3, color: 0xfef08a,
      moving: { axis:'x', amp:2, spd:0.7 } },

    // ── Layer 15 (top=65, cy=64.5) ────────────────────────────────────────
    { cx: -3, cy:64.5, cz:  2, w:4, h:1, d:3, color: 0xa5f3fc,
      moving: { axis:'z', amp:3, spd:0.72 } },
    { cx:  4, cy:64.5, cz: -2, w:3, h:1, d:3, color: 0xa5f3fc },

    // ── Layer 16 (top=69, cy=68.5) ────────────────────────────────────────
    { cx:  0, cy:68.5, cz: -3, w:4, h:1, d:3, color: 0x86efac,
      moving: { axis:'x', amp:3, spd:0.75 } },
    { cx: -4, cy:68.5, cz:  3, w:3, h:1, d:3, color: 0x86efac },

    // ── Layer 17 (top=73, cy=72.5) ────────────────────────────────────────
    { cx:  3, cy:72.5, cz:  1, w:3, h:1, d:3, color: 0xfca5a5,
      moving: { axis:'z', amp:2.5, spd:0.78 } },
    { cx: -3, cy:72.5, cz: -1, w:3, h:1, d:2, color: 0xfca5a5 },

    // ── Layer 18 (top=77, cy=76.5) ────────────────────────────────────────
    { cx:  0, cy:76.5, cz:  2, w:3, h:1, d:2, color: 0xc4b5fd,
      moving: { axis:'x', amp:2.5, spd:0.82 } },
    { cx:  3, cy:76.5, cz: -3, w:3, h:1, d:2, color: 0xc4b5fd },

    // ── Layer 19 (top=81, cy=80.5) ────────────────────────────────────────
    { cx: -2, cy:80.5, cz: -1, w:3, h:1, d:2, color: 0xfdba74,
      moving: { axis:'z', amp:2, spd:0.86 } },
    { cx:  3, cy:80.5, cz:  2, w:3, h:1, d:2, color: 0xfdba74,
      moving: { axis:'x', amp:2, spd:0.88 } },

    // ── Layer 20 (top=85, cy=84.5) ────────────────────────────────────────
    { cx:  0, cy:84.5, cz:  0, w:3, h:1, d:2, color: 0x6ee7b7 },
    { cx: -3, cy:84.5, cz:  3, w:2, h:1, d:2, color: 0x6ee7b7,
      moving: { axis:'x', amp:2, spd:0.9 } },

    // ── Layer 21 (top=89, cy=88.5) ────────────────────────────────────────
    { cx:  2, cy:88.5, cz: -2, w:3, h:1, d:2, color: 0x93c5fd,
      moving: { axis:'z', amp:2, spd:0.93 } },
    { cx: -2, cy:88.5, cz:  1, w:2, h:1, d:2, color: 0x93c5fd },

    // ── Layer 22 (top=93, cy=92.5) ────────────────────────────────────────
    { cx:  0, cy:92.5, cz:  0, w:3, h:1, d:2, color: 0xf9a8d4,
      moving: { axis:'x', amp:2, spd:0.96 } },
    { cx:  3, cy:92.5, cz:  3, w:2, h:1, d:2, color: 0xf9a8d4 },

    // ── Layer 23 (top=97, cy=96.5) ────────────────────────────────────────
    { cx: -2, cy:96.5, cz: -2, w:2, h:1, d:2, color: 0xfde68a,
      moving: { axis:'z', amp:1.5, spd:1.0 } },
    { cx:  2, cy:96.5, cz:  2, w:2, h:1, d:2, color: 0xfde68a },

    // ── Layer 24 (top=101, cy=100.5) ──────────────────────────────────────
    { cx:  0, cy:100.5, cz:  0, w:2, h:1, d:2, color: 0xe9d5ff,
      moving: { axis:'x', amp:1.5, spd:1.05 } },

    // ── Layer 25 (top=105, cy=104.5) ──────────────────────────────────────
    { cx:  0, cy:104.5, cz:  0, w:2, h:1, d:2, color: 0xfef3c7 },

    // ── Layer 26 (top=109, cy=108.5) ──────────────────────────────────────
    { cx: -1, cy:108.5, cz:  1, w:2, h:1, d:2, color: 0xbfdbfe,
      moving: { axis:'z', amp:1, spd:1.1 } },

    // ── FINAL APEX – throne in the sky (top=113, cy=112.5) ────────────────
    { cx:  0, cy:112.5, cz:  0, w:5, h:1, d:5, color: 0xfef9c3 },
  ];

  return raw.map((p, idx) => ({ ...p, idx }));
}

const PLATFORMS = buildPlatforms();

// ── Ghost management ──────────────────────────────────────────────────────────

function makeGhost(scene: THREE.Scene): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.9 })
  );
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.65, 0.65),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.9 })
  );
  head.position.y = 1.2;
  g.add(body, head);
  scene.add(g);
  return g;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloorIsLava() {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const gameState  = useGameState();
  const playerId   = useGameStore(s => s.playerId);
  const { sendInput } = useSocketActions();

  // ── Mobile touch input refs (readable inside the game loop) ───────────────
  const touchJoyRef   = useRef({ dx: 0, dz: 0 });
  const touchJumpRef  = useRef(false);
  const touchSwingRef = useRef(false);
  const joyOriginRef  = useRef({ x: 0, y: 0 });
  const [joyVisual, setJoyVisual] = useState({ x: 0, y: 0 });
  const [batReady, setBatReady]   = useState(true);

  const [eliminated, setEliminated] = useState(false);
  const [aliveCount, setAliveCount] = useState(0);
  const [heightM, setHeightM]       = useState(0);
  const [lavaWarn, setLavaWarn]     = useState(false);
  const [chaos, setChaos]           = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const container = canvasRef.current;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0a1a);
    scene.fog = new THREE.Fog(0x0d0a1a, 60, 200);

    // ── Camera ────────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(
      70, container.clientWidth / container.clientHeight, 0.1, 200
    );
    camera.position.set(0, 12, 16);

    // ── Lights ────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.1);
    sun.position.set(20, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 350;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 130;
    sun.shadow.camera.bottom = -20;
    scene.add(sun);

    const lavaLight = new THREE.PointLight(0xff4400, 4, 35);
    lavaLight.position.set(0, -3, 0);
    scene.add(lavaLight);

    // Apex spotlight to draw the eye upward
    const apexLight = new THREE.PointLight(0xfde047, 4, 30);
    apexLight.position.set(0, 120, 0);
    scene.add(apexLight);

    // ── Platforms ─────────────────────────────────────────────────────────────
    const platMeshes: THREE.Mesh[] = [];
    for (const p of PLATFORMS) {
      const isApex = p.idx === PLATFORMS.length - 1;
      const mat = new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: isApex ? 0.2 : 0.65,
        metalness: isApex ? 0.5 : 0.05,
        emissive: isApex ? new THREE.Color(0xfde047) : undefined,
        emissiveIntensity: isApex ? 0.2 : 0,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), mat);
      mesh.position.set(p.cx, p.cy, p.cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      platMeshes.push(mesh);
    }

    // ── Lava ──────────────────────────────────────────────────────────────────
    const lavaGeo = new THREE.PlaneGeometry(300, 300, 1, 1);
    const lavaMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: new THREE.Color(0xff2200),
      emissiveIntensity: 0.7,
      roughness: 0.2,
    });
    const lavaMesh = new THREE.Mesh(lavaGeo, lavaMat);
    lavaMesh.rotation.x = -Math.PI / 2;
    lavaMesh.position.y = -3;
    scene.add(lavaMesh);

    // Lava particles — small floating orbs above the surface
    const particleGeo = new THREE.BufferGeometry();
    const pcCount = 120;
    const pcPositions = new Float32Array(pcCount * 3);
    for (let i = 0; i < pcCount; i++) {
      pcPositions[i * 3]     = (Math.random() - 0.5) * 60;
      pcPositions[i * 3 + 1] = Math.random() * 4;
      pcPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    const pcOffsets = new Float32Array(pcCount); // random phase
    for (let i = 0; i < pcCount; i++) pcOffsets[i] = Math.random() * Math.PI * 2;
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pcPositions, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0xff6600, size: 0.25, transparent: true, opacity: 0.7 });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // ── Player mesh ───────────────────────────────────────────────────────────
    const playerGroup = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.8, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.6 })
    );
    bodyMesh.castShadow = true;
    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x9d4edd, roughness: 0.5 })
    );
    headMesh.position.y = 1.25;
    headMesh.castShadow = true;
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.1, 6, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.15, 1.32, -0.31);
    eyeR.position.set( 0.15, 1.32, -0.31);
    playerGroup.add(bodyMesh, headMesh, eyeL, eyeR);

    // Bat — wooden cylinder held at player's right side
    const batPivot = new THREE.Group();
    batPivot.position.set(0, 0.5, 0);
    batPivot.rotation.y = 1.2; // rest: pulled back right
    const batGeo = new THREE.CylinderGeometry(0.05, 0.1, 1.1, 8);
    const batMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.7 });
    const batMeshObj = new THREE.Mesh(batGeo, batMat);
    batMeshObj.position.set(0.45, 0.4, 0);
    batMeshObj.rotation.z = -0.5;
    batMeshObj.castShadow = true;
    batPivot.add(batMeshObj);
    playerGroup.add(batPivot);

    scene.add(playerGroup);

    // Shadow blob under player
    const blobMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 })
    );
    blobMesh.rotation.x = -Math.PI / 2;
    scene.add(blobMesh);

    // ── Ghost registry ────────────────────────────────────────────────────────
    const ghosts = new Map<string, THREE.Group>();

    // ── Physics state ─────────────────────────────────────────────────────────
    const ps = {
      pos: new THREE.Vector3(0, 1.9, 0),
      vel: new THREE.Vector3(0, 0, 0),
      onGround: false,
      coyoteMs: 0,
      yaw: 0,
      alive: true,
    };

    // ── Camera state ──────────────────────────────────────────────────────────
    const camPos    = new THREE.Vector3(0, 12, 16);
    const camTarget = new THREE.Vector3(0, 4, 0);
    let spectatorT  = 0;

    // ── Lava tracking ─────────────────────────────────────────────────────────
    let lavaY    = -3;
    let serverLavaY = -3;

    // ── Moving platform carry ─────────────────────────────────────────────────
    let stoodIdx  = -1;
    const platPrevX = new Float32Array(PLATFORMS.length);
    const platPrevZ = new Float32Array(PLATFORMS.length);
    for (const p of PLATFORMS) {
      platPrevX[p.idx] = p.cx;
      platPrevZ[p.idx] = p.cz;
    }

    // ── Chaos ─────────────────────────────────────────────────────────────────
    const chaosState = { lowGravity: false, slippery: false };

    // ── Input ─────────────────────────────────────────────────────────────────
    const keys = { w:false, a:false, s:false, d:false, space:false, shift:false, q:false, e:false, f:false };
    let spaceWas = false;
    let fWas     = false;
    const batState = { swinging: false, t: 0, cooldown: 0, hitSent: false };
    let isEliminated = false;

    const onKD = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':    keys.w     = true; break;
        case 'KeyA':    keys.a     = true; break;
        case 'KeyS':    keys.s     = true; break;
        case 'KeyD':    keys.d     = true; break;
        case 'Space':   keys.space = true; e.preventDefault(); break;
        case 'ShiftLeft': keys.shift = true; break;
        case 'KeyQ':    keys.q     = true; break;
        case 'KeyE':    keys.e     = true; break;
        case 'KeyF':    keys.f     = true; break;
      }
    };
    const onKU = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':    keys.w     = false; break;
        case 'KeyA':    keys.a     = false; break;
        case 'KeyS':    keys.s     = false; break;
        case 'KeyD':    keys.d     = false; break;
        case 'Space':   keys.space = false; break;
        case 'ShiftLeft': keys.shift = false; break;
        case 'KeyQ':    keys.q     = false; break;
        case 'KeyE':    keys.e     = false; break;
        case 'KeyF':    keys.f     = false; break;
      }
    };
    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup',   onKU);

    // Pointer lock for mouse-look yaw
    const cvs = renderer.domElement;
    cvs.addEventListener('click', () => cvs.requestPointerLock());
    const onMM = (e: MouseEvent) => {
      if (document.pointerLockElement === cvs) {
        ps.yaw -= e.movementX * 0.003;
      }
    };
    window.addEventListener('mousemove', onMM);

    // ── Socket events ─────────────────────────────────────────────────────────
    const sock = getSocket();

    const onLavaState = (data: {
      t: number; lavaY: number;
      players: { id: string; x: number; y: number; z: number; alive: boolean }[];
    }) => {
      serverLavaY = data.lavaY;
      const alive = data.players.filter(p => p.alive).length;
      setAliveCount(alive);

      const myId = sock.id;
      for (const p of data.players) {
        if (p.id === myId) continue;
        if (!ghosts.has(p.id)) ghosts.set(p.id, makeGhost(scene));
        const g = ghosts.get(p.id)!;
        g.position.set(p.x, p.y, p.z);
        g.visible = p.alive;
      }
      // Hide ghosts for players no longer in state
      const ids = new Set(data.players.map(p => p.id));
      for (const [id, g] of ghosts) {
        if (!ids.has(id)) g.visible = false;
      }
    };

    const onEliminated = (data: { id: string; rank: number }) => {
      if (data.id === sock.id) {
        isEliminated = true;
        ps.alive = false;
        setEliminated(true);
      }
    };

    const onChaos = (data: { type: string; duration: number }) => {
      if (data.type === 'low_gravity') {
        chaosState.lowGravity = true;
        setTimeout(() => { chaosState.lowGravity = false; }, data.duration);
      }
      if (data.type === 'slippery') {
        chaosState.slippery = true;
        setChaos('🧊 SLIPPERY!');
        setTimeout(() => { chaosState.slippery = false; setChaos(null); }, data.duration);
      }
      if (data.type === 'low_gravity') setChaos('🌙 LOW GRAVITY!');
      if (data.type === 'lava_surge') setChaos('🌋 SURGE!');
      if (data.type === 'collapsing') setChaos('💥 COLLAPSING!');
      setTimeout(() => setChaos(null), data.duration);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('lava:state', onLavaState);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('lava:eliminated', onEliminated);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('lava:chaos', onChaos);

    const onLavaHit = (data: { id: string; vx: number; vy: number; vz: number }) => {
      if (data.id === sock.id && ps.alive) {
        ps.vel.x += data.vx;
        ps.vel.y += data.vy;
        ps.vel.z += data.vz;
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('lava:hit', onLavaHit);

    // ── Position send throttle ────────────────────────────────────────────────
    let lastSend = 0;

    // ── Game loop ─────────────────────────────────────────────────────────────
    const clock = new THREE.Clock(true);
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt  = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();

      // ── Lava interpolation ──────────────────────────────────────────────
      lavaY += (serverLavaY - lavaY) * (1 - Math.exp(-5 * dt));
      lavaMesh.position.y = lavaY;
      lavaLight.position.y = lavaY + 1;
      lavaMat.emissiveIntensity = 0.5 + 0.25 * Math.sin(now * 0.003);

      // Lava particles — bob above lava surface
      const pcPos = particleGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pcCount; i++) {
        pcPos.setY(i, lavaY + 0.5 + 1.5 * Math.sin(now * 0.001 + pcOffsets[i]));
      }
      pcPos.needsUpdate = true;
      particles.position.y = 0;

      // ── Moving platforms ─────────────────────────────────────────────────
      const tSec = now / 1000;
      for (const p of PLATFORMS) {
        if (!p.moving) continue;
        const mesh = platMeshes[p.idx];
        const { axis, amp, spd } = p.moving;
        const offset = amp * Math.sin(tSec * spd * Math.PI * 2);
        const newX = axis === 'x' ? p.cx + offset : p.cx;
        const newZ = axis === 'z' ? p.cz + offset : p.cz;

        // Carry player if they were standing on this platform
        if (stoodIdx === p.idx && ps.onGround) {
          ps.pos.x += newX - platPrevX[p.idx];
          ps.pos.z += newZ - platPrevZ[p.idx];
        }

        platPrevX[p.idx] = newX;
        platPrevZ[p.idx] = newZ;
        mesh.position.x = newX;
        mesh.position.z = newZ;
      }

      // ── Player physics ───────────────────────────────────────────────────
      const phase = useGameStore.getState().gameState?.phase;
      if (ps.alive && phase === 'playing') {
        const grav = chaosState.lowGravity ? GRAVITY * 0.33 : GRAVITY;

        // Horizontal movement (camera-relative)
        const sy = Math.sin(ps.yaw), cy2 = Math.cos(ps.yaw);
        let mx = 0, mz = 0;
        if (keys.w) { mx -= sy; mz -= cy2; }
        if (keys.s) { mx += sy; mz += cy2; }
        if (keys.a) { mx -= cy2; mz += sy; }
        if (keys.d) { mx += cy2; mz -= sy; }
        // Touch joystick (joyDx = strafe, joyDz = forward/back in screen space)
        const joyForward = -touchJoyRef.current.dz; // screen up (neg Y) = game forward
        const joyRight   =  touchJoyRef.current.dx;
        mx += joyForward * (-sy) + joyRight * cy2;
        mz += joyForward * (-cy2) + joyRight * (-sy);
        const ml = Math.sqrt(mx * mx + mz * mz);
        if (ml > 0) { mx /= ml; mz /= ml; }

        const spd = keys.shift ? SPRINT_SPD : MOVE_SPD;

        if (chaosState.slippery) {
          ps.vel.x += (mx * spd - ps.vel.x) * 1.5 * dt;
          ps.vel.z += (mz * spd - ps.vel.z) * 1.5 * dt;
        } else {
          ps.vel.x = mx * spd;
          ps.vel.z = mz * spd;
        }

        // Keyboard yaw fallback
        if (keys.q) ps.yaw += 1.5 * dt;
        if (keys.e) ps.yaw -= 1.5 * dt;

        // Gravity
        ps.vel.y -= grav * dt;
        if (ps.vel.y < -MAX_FALL) ps.vel.y = -MAX_FALL;

        // Jump (keyboard or touch button)
        const jumpPressed = (keys.space && !spaceWas) || touchJumpRef.current;
        if (touchJumpRef.current) touchJumpRef.current = false; // consume
        if (jumpPressed) {
          if (ps.onGround || ps.coyoteMs > 0) {
            ps.vel.y = chaosState.lowGravity ? JUMP_VEL * 1.5 : JUMP_VEL;
            ps.onGround = false;
            ps.coyoteMs = 0;
            lava_jump();
          }
        }
        spaceWas = keys.space;

        // Bat swing
        if (batState.swinging) {
          const progress = Math.min(1, batState.t / 0.35);
          batPivot.rotation.y = 1.2 + (-2.8 - 1.2) * progress;
          batState.t += dt;
          if (!batState.hitSent && progress >= 0.5) {
            batState.hitSent = true;
            let closest: string | null = null;
            let closestDist = 2.8;
            for (const [ghostId, ghost] of ghosts) {
              if (!ghost.visible) continue;
              const d = ghost.position.distanceTo(playerGroup.position);
              if (d < closestDist) { closestDist = d; closest = ghostId; }
            }
            if (closest) { sendInput('lava_bat', { targetId: closest }); lava_hitPlayer(); }
          }
          if (batState.t >= 0.35) {
            batState.swinging = false;
            batState.t = 0;
            batState.cooldown = 1500;
            batPivot.rotation.y = 1.2;
            setBatReady(false);
          }
        } else {
          if (batState.cooldown > 0) {
            batState.cooldown -= dt * 1000;
            if (batState.cooldown <= 0) { batState.cooldown = 0; setBatReady(true); }
          }
          const swingPressed = (keys.f && !fWas) || touchSwingRef.current;
          if (touchSwingRef.current) touchSwingRef.current = false;
          if (swingPressed && batState.cooldown <= 0) {
            batState.swinging = true;
            batState.t = 0;
            batState.hitSent = false;
            lava_batSwing();
          }
        }
        fWas = keys.f;

        // Coyote countdown
        if (ps.coyoteMs > 0) ps.coyoteMs -= dt * 1000;

        // Integrate positions
        ps.pos.x += ps.vel.x * dt;
        ps.pos.z += ps.vel.z * dt;

        const prevFeetY = ps.pos.y - PL_HH;
        ps.pos.y += ps.vel.y * dt;
        const currFeetY = ps.pos.y - PL_HH;

        // Platform collision
        const wasGround = ps.onGround;
        ps.onGround = false;
        stoodIdx = -1;

        for (const p of PLATFORMS) {
          const mesh = platMeshes[p.idx];
          const px   = mesh.position.x;
          const py   = mesh.position.y;
          const pz   = mesh.position.z;
          const platTop = py + p.h / 2;
          const hw = p.w / 2 + PL_R;
          const hd = p.d / 2 + PL_R;

          if (Math.abs(ps.pos.x - px) > hw) continue;
          if (Math.abs(ps.pos.z - pz) > hd) continue;

          // Land on top
          if (prevFeetY >= platTop - 0.15 && currFeetY <= platTop && ps.vel.y <= 0) {
            ps.pos.y = platTop + PL_HH;
            ps.vel.y = 0;
            ps.onGround = true;
            if (!wasGround) ps.coyoteMs = COYOTE_MS;
            stoodIdx = p.idx;
          }
          // Head bump from below
          else {
            const platBot = py - p.h / 2;
            const headY   = ps.pos.y + PL_HH;
            if (headY > platBot && prevFeetY < platBot && ps.vel.y > 0) {
              ps.vel.y = 0;
            }
          }
        }

        // Boundary walls (prevent flying off the tower)
        ps.pos.x = Math.max(-30, Math.min(30, ps.pos.x));
        ps.pos.z = Math.max(-30, Math.min(30, ps.pos.z));

        // Lava death check (using current lavaY, not interpolated)
        if (ps.pos.y - PL_HH < serverLavaY + 0.1 && !isEliminated) {
          isEliminated = true;
          ps.alive = false;
          setEliminated(true);
          lava_death();
          sendInput('lava_die', {});
        }

        // Position broadcast (20 Hz)
        if (now - lastSend > 50) {
          lastSend = now;
          sendInput('lava_pos', { x: ps.pos.x, y: ps.pos.y, z: ps.pos.z });
        }

        // Update mesh
        playerGroup.position.copy(ps.pos);
        playerGroup.rotation.y = ps.yaw;
        playerGroup.visible = true;

        // Shadow blob on ground
        blobMesh.position.set(ps.pos.x, lavaY + 0.01, ps.pos.z);
        const blobScale = Math.max(0.2, 1 - (ps.pos.y - lavaY) * 0.03);
        blobMesh.scale.set(blobScale, blobScale, blobScale);

        // HUD updates
        setHeightM(Math.max(0, Math.round((ps.pos.y - 1) * 2) / 2));
        setLavaWarn(ps.pos.y - PL_HH < lavaY + 5);
      } else if (isEliminated) {
        playerGroup.visible = false;
      }

      // ── Camera ───────────────────────────────────────────────────────────
      let targetLook: THREE.Vector3;
      let desiredCam: THREE.Vector3;

      if (isEliminated) {
        // Spectator orbit — circle above midpoint of action
        spectatorT += dt * 0.3;
        const radius = 25;
        const watchH = lavaY + 18;
        targetLook = new THREE.Vector3(0, watchH - 4, 0);
        desiredCam = new THREE.Vector3(
          Math.sin(spectatorT) * radius,
          watchH,
          Math.cos(spectatorT) * radius,
        );
      } else {
        const lookTarget = ps.pos.clone().add(new THREE.Vector3(0, 1, 0));
        const back = new THREE.Vector3(
          Math.sin(ps.yaw) * CAM_DIST,
          CAM_H,
          Math.cos(ps.yaw) * CAM_DIST,
        );
        targetLook = lookTarget;
        desiredCam = lookTarget.clone().add(back);
      }

      const k = 1 - Math.exp(-CAM_K * dt);
      camPos.lerp(desiredCam, k);
      camTarget.lerp(targetLook, k * 1.5);

      camera.position.copy(camPos);
      camera.lookAt(camTarget);

      renderer.render(scene, camera);
    };

    animate();

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKD);
      window.removeEventListener('keyup',   onKU);
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('resize', onResize);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('lava:state', onLavaState);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('lava:eliminated', onEliminated);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('lava:chaos', onChaos);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('lava:hit', onLavaHit);
      if (document.pointerLockElement === cvs) document.exitPointerLock();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full" style={{ height: '65vh', minHeight: 420 }}>
      {/* Three.js mount target */}
      <div ref={canvasRef} className="w-full h-full" style={{ cursor: 'crosshair' }} />

      {/* HUD overlay */}
      <div className="absolute inset-0 pointer-events-none select-none">

        {/* Top-left: alive count */}
        <div className="absolute top-3 left-3 glass rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="text-lg">👥</span>
          <span className="text-white font-mono text-sm font-bold">{aliveCount} alive</span>
        </div>

        {/* Bat cooldown indicator */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 glass rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="text-lg">🏏</span>
          <span className={`font-mono text-sm font-bold ${batReady ? 'text-yellow-300' : 'text-white/40'}`}>
            {batReady ? 'BAT READY [F]' : 'COOLDOWN...'}
          </span>
        </div>

        {/* Top-right: height meter */}
        <div className="absolute top-3 right-3 glass rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="text-lg">📏</span>
          <span className="text-white font-mono text-sm font-bold">{heightM}m high</span>
        </div>

        {/* Chaos label */}
        <AnimatePresence>
          {chaos && (
            <motion.div
              key={chaos}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute top-14 left-1/2 -translate-x-1/2"
            >
              <div className="bg-orange-500/90 text-white font-display font-black text-xl px-5 py-2 rounded-xl shadow-lg">
                {chaos}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lava warning */}
        <AnimatePresence>
          {lavaWarn && !eliminated && (
            <motion.div
              key="warn"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: [0.7, 1, 0.7], y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ repeat: Infinity, duration: 0.6 }}
              className="absolute bottom-14 left-1/2 -translate-x-1/2"
            >
              <div className="bg-red-600/85 text-white font-display font-black text-2xl px-7 py-3 rounded-2xl shadow-lg border border-red-400/50">
                🌋 LAVA RISING — CLIMB!
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Eliminated banner */}
        <AnimatePresence>
          {eliminated && (
            <motion.div
              key="elim"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <div className="glass rounded-3xl px-10 py-8 text-center shadow-2xl">
                <div className="text-7xl mb-4">🌋</div>
                <div className="font-display font-black text-4xl text-white mb-2">ELIMINATED!</div>
                <div className="text-white/50 text-base">Spectating the survivors...</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls hint (desktop) */}
        <div className="absolute bottom-3 left-3 text-white/25 text-xs font-mono leading-relaxed hidden sm:block">
          WASD move · SPACE jump · SHIFT sprint · F swing bat · Click canvas to lock mouse
        </div>

        {/* Mobile touch controls */}
        <div className="absolute inset-0 pointer-events-none sm:hidden">
          {/* Virtual joystick — bottom left */}
          <div
            className="absolute pointer-events-auto select-none"
            style={{ bottom: 20, left: 20, width: 90, height: 90, touchAction: 'none' }}
            onTouchStart={e => {
              e.preventDefault();
              const t = e.changedTouches[0];
              joyOriginRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchMove={e => {
              e.preventDefault();
              const t = e.changedTouches[0];
              const rawX = t.clientX - joyOriginRef.current.x;
              const rawY = t.clientY - joyOriginRef.current.y;
              const dist = Math.hypot(rawX, rawY);
              const max = 40;
              const cX = dist > max ? (rawX / dist) * max : rawX;
              const cY = dist > max ? (rawY / dist) * max : rawY;
              touchJoyRef.current = { dx: cX / max, dz: cY / max };
              setJoyVisual({ x: cX, y: cY });
            }}
            onTouchEnd={() => {
              touchJoyRef.current = { dx: 0, dz: 0 };
              setJoyVisual({ x: 0, y: 0 });
            }}
          >
            <div style={{
              width: 90, height: 90, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(255,255,255,0.45)',
                border: '2px solid rgba(255,255,255,0.65)',
                left: `calc(50% - 19px + ${joyVisual.x * 0.55}px)`,
                top: `calc(50% - 19px + ${joyVisual.y * 0.55}px)`,
              }} />
            </div>
          </div>

          {/* Jump button — bottom right */}
          <div
            className="absolute pointer-events-auto select-none flex items-center justify-center"
            style={{
              bottom: 20, right: 20, width: 76, height: 76, borderRadius: '50%',
              background: 'rgba(251,191,36,0.7)', border: '2px solid rgba(251,191,36,0.9)',
              touchAction: 'none', fontWeight: 900, fontSize: 14, color: '#fff', letterSpacing: 1,
            }}
            onTouchStart={e => { e.preventDefault(); touchJumpRef.current = true; }}
          >
            JUMP
          </div>

          {/* Swing button — above jump */}
          <div
            className="absolute pointer-events-auto select-none flex items-center justify-center"
            style={{
              bottom: 110, right: 20, width: 64, height: 64, borderRadius: '50%',
              background: batReady ? 'rgba(139,94,60,0.85)' : 'rgba(80,50,30,0.45)',
              border: `2px solid ${batReady ? 'rgba(180,120,70,0.9)' : 'rgba(100,70,40,0.5)'}`,
              touchAction: 'none', fontWeight: 900, fontSize: 11, color: '#fff', letterSpacing: 1,
              transition: 'background 0.2s, border 0.2s',
            }}
            onTouchStart={e => { e.preventDefault(); if (batReady) touchSwingRef.current = true; }}
          >
            🏏 BAT
          </div>
        </div>
      </div>
    </div>
  );
}
