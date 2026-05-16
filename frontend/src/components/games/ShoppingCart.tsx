'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';

// ── Constants (must match backend) ────────────────────────────────────────────

const TRACK_LENGTH = 7000;
const FINISH_X = 6800;
const LANE_HALF = 220;
const CANVAS_W = 900;
const CANVAS_H = 600;
const INPUT_HZ = 20;

const RAMPS = [
  { x: 1400, halfWidth: 80 },
  { x: 2800, halfWidth: 80 },
  { x: 4200, halfWidth: 80 },
  { x: 5600, halfWidth: 80 },
];

const OBSTACLES = [
  { id: 'o0', x: 600, z: -120, type: 'tree' as const },
  { id: 'o1', x: 850, z: 80, type: 'rock' as const },
  { id: 'o2', x: 1100, z: -40, type: 'tree' as const },
  { id: 'o3', x: 1800, z: 100, type: 'shelf' as const },
  { id: 'o4', x: 2100, z: -160, type: 'rock' as const },
  { id: 'o5', x: 2400, z: 50, type: 'tree' as const },
  { id: 'o6', x: 3100, z: -100, type: 'shelf' as const },
  { id: 'o7', x: 3400, z: 130, type: 'tree' as const },
  { id: 'o8', x: 3700, z: 0, type: 'shelf' as const },
  { id: 'o9', x: 4500, z: -150, type: 'rock' as const },
  { id: 'o10', x: 4800, z: 90, type: 'tree' as const },
  { id: 'o11', x: 5100, z: -60, type: 'shelf' as const },
  { id: 'o12', x: 5300, z: 160, type: 'rock' as const },
  { id: 'o13', x: 5900, z: -80, type: 'tree' as const },
  { id: 'o14', x: 6200, z: 50, type: 'rock' as const },
];

const FORKLIFTS = [
  { id: 'f0', x: 1600, zMin: -160, zMax: 160 },
  { id: 'f1', x: 3200, zMin: -140, zMax: 140 },
  { id: 'f2', x: 4900, zMin: -180, zMax: 80 },
  { id: 'f3', x: 6000, zMin: -100, zMax: 180 },
];

const PICKUPS = [
  { id: 'p0', x: 500, z: 0 }, { id: 'p1', x: 1200, z: -100 }, { id: 'p2', x: 2000, z: 100 },
  { id: 'p3', x: 2700, z: 0 }, { id: 'p4', x: 3500, z: -80 }, { id: 'p5', x: 4300, z: 120 },
  { id: 'p6', x: 5000, z: -60 }, { id: 'p7', x: 5700, z: 80 }, { id: 'p8', x: 6400, z: 0 },
];

function terrainHeight(x: number): number {
  if (x < 0) return 0;
  if (x > TRACK_LENGTH) return -TRACK_LENGTH * 0.15;
  let h = -x * 0.12;
  h += Math.sin(x / 110) * 14;
  h += Math.cos(x / 270) * 22;
  for (const r of RAMPS) {
    if (Math.abs(x - r.x) < r.halfWidth) {
      const t = 1 - Math.abs(x - r.x) / r.halfWidth;
      h += Math.sin(t * Math.PI) * 55;
    }
  }
  return h;
}

// ── Particle System ───────────────────────────────────────────────────────────

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; maxLife: number; size: number; type: 'smoke' | 'spark' | 'boost' }

function updateParticles(particles: Particle[], dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.type === 'smoke') p.vy += 8 * dt; // slight float up
    if (p.type === 'spark') p.vy += 200 * dt; // sparks arc
  }
}

function spawnDriftSmoke(particles: Particle[], x: number, y: number, z: number, side: number): void {
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 10,
      y: y + 2,
      z: z + side * 12 + (Math.random() - 0.5) * 8,
      vx: -30 - Math.random() * 20,
      vy: 5 + Math.random() * 15,
      vz: (Math.random() - 0.5) * 30,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 1.0,
      size: 6 + Math.random() * 8,
      type: 'smoke',
    });
  }
}

function spawnDriftSparks(particles: Particle[], x: number, y: number, z: number): void {
  for (let i = 0; i < 5; i++) {
    particles.push({
      x, y: y + 3, z,
      vx: -80 - Math.random() * 60,
      vy: -20 - Math.random() * 40,
      vz: (Math.random() - 0.5) * 60,
      life: 0.3 + Math.random() * 0.2,
      maxLife: 0.5,
      size: 2,
      type: 'spark',
    });
  }
}

function spawnBoostFlame(particles: Particle[], x: number, y: number, z: number): void {
  for (let i = 0; i < 4; i++) {
    particles.push({
      x: x - 15,
      y: y + 8 + (Math.random() - 0.5) * 6,
      z: z + (Math.random() - 0.5) * 10,
      vx: -120 - Math.random() * 80,
      vy: (Math.random() - 0.5) * 20,
      vz: (Math.random() - 0.5) * 20,
      life: 0.15 + Math.random() * 0.15,
      maxLife: 0.3,
      size: 5 + Math.random() * 5,
      type: 'boost',
    });
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RemoteCart {
  id: string; x: number; y: number; z: number; vx: number; vz: number; yaw: number;
  bs: number; db: number; sp: number; dr: number; dc: number; og: number; fn: number;
}
interface Snapshot { t: number; clientT: number; carts: Map<string, RemoteCart> }

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShoppingCart() {
  const mountRef = useRef<HTMLDivElement>(null);
  const { sendInput } = useSocketActions();

  const snapshotsRef = useRef<Snapshot[]>([]);
  const ownServerRef = useRef<RemoteCart | null>(null);
  const finishMsgRef = useRef('');
  const inputRef = useRef({ accel: false, brake: false, left: false, right: false, drift: false });
  const lastInputRef = useRef({ accel: false, brake: false, left: false, right: false, drift: false });
  const lastFrameTimeRef = useRef<number>(0);

  // Camera state
  const camYawRef = useRef(0);           // camera yaw (follows cart heading)
  const camPosRef = useRef(new THREE.Vector3(-160, 100, 0));
  const camLookRef = useRef(new THREE.Vector3(0, 0, 0));
  const camShakeRef = useRef(0);         // shake intensity, decays

  // Cart local state
  const cartYawRef = useRef(0);          // smooth local yaw for rendering
  const particlesRef = useRef<Particle[]>([]);
  const forkMeshesRef = useRef<Map<string, THREE.Group>>(new Map());

  const sceneStateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    cartMeshes: Map<string, THREE.Group>;
    pickupMeshes: Map<string, THREE.Mesh>;
    particleMeshes: THREE.Points[];
    animId: number;
  } | null>(null);

  // ── Build scene ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87ceeb');
    scene.fog = new THREE.Fog('#c9e8f5', 900, 2800);

    const camera = new THREE.PerspectiveCamera(70, CANVAS_W / CANVAS_H, 1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(CANVAS_W, CANVAS_H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    mountRef.current.appendChild(renderer.domElement);
    renderer.domElement.style.maxWidth = '100%';
    renderer.domElement.style.borderRadius = '12px';

    // ── Sunny day lighting ──
    scene.add(new THREE.AmbientLight(0xfff8e7, 0.8));
    const sun = new THREE.DirectionalLight(0xfff5d0, 2.2);
    sun.position.set(400, 900, 300);
    scene.add(sun);
    // Soft fill from below (bounced ground light)
    const fill = new THREE.HemisphereLight(0x87ceeb, 0x5a9e3a, 0.5);
    scene.add(fill);

    // ── Grassy ground planes outside the road ──
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x5aad3a });
    for (const side of [-1, 1]) {
      const grassGeom = new THREE.PlaneGeometry(TRACK_LENGTH, 1200, 1, 1);
      grassGeom.rotateX(-Math.PI / 2);
      grassGeom.translate(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07, side * (LANE_HALF + 660));
      scene.add(new THREE.Mesh(grassGeom, grassMat));
    }

    // ── Road (asphalt) ──
    const TRACK_WIDTH_VIS = LANE_HALF * 2 + 80;
    const segments = 300;
    const trackGeom = new THREE.PlaneGeometry(TRACK_LENGTH, TRACK_WIDTH_VIS, segments, 8);
    trackGeom.rotateX(-Math.PI / 2);
    trackGeom.translate(TRACK_LENGTH / 2, 0, 0);
    const pos = trackGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setY(i, terrainHeight(x));
    }
    pos.needsUpdate = true;
    trackGeom.computeVertexNormals();

    // Asphalt texture via canvas
    const asphaltCanvas = document.createElement('canvas');
    asphaltCanvas.width = 128; asphaltCanvas.height = 128;
    const ac = asphaltCanvas.getContext('2d')!;
    ac.fillStyle = '#3a3a3a';
    ac.fillRect(0, 0, 128, 128);
    // Subtle noise for asphalt grain
    for (let n = 0; n < 300; n++) {
      const nx = Math.random() * 128, ny = Math.random() * 128;
      const shade = Math.floor(Math.random() * 20 + 45);
      ac.fillStyle = `rgb(${shade},${shade},${shade})`;
      ac.fillRect(nx, ny, 2, 2);
    }
    const asphaltTex = new THREE.CanvasTexture(asphaltCanvas);
    asphaltTex.wrapS = THREE.RepeatWrapping;
    asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(TRACK_LENGTH / 60, TRACK_WIDTH_VIS / 60);
    scene.add(new THREE.Mesh(trackGeom, new THREE.MeshLambertMaterial({ map: asphaltTex })));

    // ── White dashed center line ──
    const dashLen = 80, dashGap = 60;
    const totalDashes = Math.floor(TRACK_LENGTH / (dashLen + dashGap));
    for (let d = 0; d < totalDashes; d++) {
      const dx = d * (dashLen + dashGap) + dashLen / 2;
      const ty0 = terrainHeight(dx);
      const dashMesh = new THREE.Mesh(
        new THREE.BoxGeometry(dashLen, 1.5, 5),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      dashMesh.position.set(dx, ty0 + 0.8, 0);
      scene.add(dashMesh);
    }

    // ── Curb / kerb strips on edges ──
    for (const side of [-1, 1]) {
      const curbGeom = new THREE.BoxGeometry(TRACK_LENGTH, 8, 16);
      const curbMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
      const curb = new THREE.Mesh(curbGeom, curbMat);
      curb.position.set(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07 + 4, side * (LANE_HALF + 8));
      scene.add(curb);
      // Red/white striped kerb pattern
      for (let k = 0; k < 40; k++) {
        if (k % 2 === 0) continue;
        const kx = k * (TRACK_LENGTH / 40) + TRACK_LENGTH / 80;
        const kMesh = new THREE.Mesh(
          new THREE.BoxGeometry(TRACK_LENGTH / 40 - 4, 9, 17),
          new THREE.MeshLambertMaterial({ color: 0xee2222 })
        );
        kMesh.position.set(kx, -TRACK_LENGTH * 0.07 + 4, side * (LANE_HALF + 8));
        scene.add(kMesh);
      }
    }

    // ── Park fence along the grass edges ──
    const postMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e8 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let i = 0; i < 55; i++) {
      const fx = i * 130;
      for (const side of [-1, 1]) {
        const fty = terrainHeight(fx);
        const post = new THREE.Mesh(new THREE.BoxGeometry(6, 40, 6), postMat);
        post.position.set(fx, fty + 20, side * (LANE_HALF + 55));
        scene.add(post);
      }
    }
    for (const side of [-1, 1]) {
      for (const railY of [15, 30]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(TRACK_LENGTH, 4, 4),
          railMat
        );
        rail.position.set(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07 + railY, side * (LANE_HALF + 55));
        scene.add(rail);
      }
    }

    // ── Ramps (speed bumps — yellow painted) ──
    for (const r of RAMPS) {
      const ty = terrainHeight(r.x);
      const rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(r.halfWidth * 2, 6, LANE_HALF * 1.85),
        new THREE.MeshLambertMaterial({ color: 0xf5c518 })
      );
      rampMesh.position.set(r.x, ty + 4, 0);
      scene.add(rampMesh);
      // Black warning stripes
      for (let s = -3; s <= 3; s++) {
        if (Math.abs(s) % 2 === 0) continue;
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(r.halfWidth * 2, 7, 18),
          new THREE.MeshLambertMaterial({ color: 0x222222 })
        );
        stripe.position.set(r.x, ty + 4, s * (LANE_HALF * 0.28));
        scene.add(stripe);
      }
    }

    // ── Obstacles ──
    for (const o of OBSTACLES) {
      const ty = terrainHeight(o.x);
      let mesh: THREE.Object3D;
      if (o.type === 'tree') {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 30, 8),
          new THREE.MeshLambertMaterial({ color: 0x6b3a0f }));
        trunk.position.y = 15;
        // Layered canopy for a rounder park tree look
        for (let layer = 0; layer < 3; layer++) {
          const canopy = new THREE.Mesh(
            new THREE.SphereGeometry(22 - layer * 5, 8, 6),
            new THREE.MeshLambertMaterial({ color: layer === 0 ? 0x2d8a1e : layer === 1 ? 0x3aa825 : 0x4ec030 })
          );
          canopy.position.y = 38 + layer * 14;
          g.add(canopy);
        }
        g.add(trunk);
        mesh = g;
      } else if (o.type === 'shelf') {
        // In a park context: park bench
        const g = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(55, 5, 22),
          new THREE.MeshLambertMaterial({ color: 0x8B5E3C }));
        seat.position.y = 22;
        g.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(55, 20, 4),
          new THREE.MeshLambertMaterial({ color: 0x8B5E3C }));
        back.position.set(0, 32, -9);
        g.add(back);
        for (const lx of [-22, 22]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(5, 22, 20),
            new THREE.MeshLambertMaterial({ color: 0x555555 }));
          leg.position.set(lx, 11, 0);
          g.add(leg);
        }
        mesh = g;
      } else {
        // Rock — rounded grey boulder
        mesh = new THREE.Mesh(
          new THREE.DodecahedronGeometry(22, 1),
          new THREE.MeshLambertMaterial({ color: 0x8a8a7a })
        );
        mesh.position.y = 10;
      }
      mesh.position.x = o.x;
      mesh.position.z = o.z;
      (mesh.position as THREE.Vector3).y += ty;
      scene.add(mesh);
    }

    // ── Forklifts (rebranded as park maintenance vehicles — orange ride-on lawnmowers) ──
    const forkMeshes = forkMeshesRef.current;
    for (const f of FORKLIFTS) {
      const ty = terrainHeight(f.x);
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 26),
        new THREE.MeshLambertMaterial({ color: 0xff8800 }));
      body.position.y = 16;
      g.add(body);
      // Blade deck (flat, under the front)
      const deck = new THREE.Mesh(new THREE.BoxGeometry(36, 6, 28),
        new THREE.MeshLambertMaterial({ color: 0xcc6600 }));
      deck.position.set(12, 5, 0);
      g.add(deck);
      // Seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 16),
        new THREE.MeshLambertMaterial({ color: 0x222222 }));
      seat.position.set(-10, 30, 0);
      g.add(seat);
      // Steering wheel
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(6, 1.5, 6, 12),
        new THREE.MeshLambertMaterial({ color: 0x111111 }));
      wheel.position.set(-6, 36, 0);
      wheel.rotation.x = Math.PI / 3;
      g.add(wheel);
      // Wheels
      const wGeom = new THREE.CylinderGeometry(8, 8, 6, 12);
      const wMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      for (const [wx, wz] of [[14, 14], [14, -14], [-14, 14], [-14, -14]]) {
        const wm = new THREE.Mesh(wGeom, wMat);
        wm.rotation.x = Math.PI / 2;
        wm.position.set(wx, 8, wz);
        g.add(wm);
      }
      g.position.set(f.x, ty, (f.zMin + f.zMax) / 2);
      scene.add(g);
      forkMeshes.set(f.id, g);
    }

    // ── Park lamp posts every 500 units ──
    for (let i = 0; i < 15; i++) {
      const lx = 300 + i * 460;
      const lside = i % 2 === 0 ? -1 : 1;
      const lty = terrainHeight(lx);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 90, 8),
        new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
      pole.position.set(lx, lty + 45, lside * (LANE_HALF + 50));
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffeeaa, emissiveIntensity: 0.5 }));
      lamp.position.set(lx, lty + 93, lside * (LANE_HALF + 50));
      scene.add(lamp);
    }

    // ── Dense park trees outside the fence ──
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * TRACK_LENGTH;
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = side * (LANE_HALF + 90 + Math.random() * 350);
      const tx = terrainHeight(x);
      const tsize = 18 + Math.random() * 14;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 26, 7),
        new THREE.MeshLambertMaterial({ color: 0x6b3a0f }));
      trunk.position.set(x, tx + 13, z);
      scene.add(trunk);
      const leafCol = [0x2d8a1e, 0x3aa825, 0x4db82a, 0x5cc936][Math.floor(Math.random() * 4)];
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(tsize, 7, 5),
        new THREE.MeshLambertMaterial({ color: leafCol }));
      canopy.position.set(x, tx + 36 + tsize * 0.5, z);
      scene.add(canopy);
    }

    // ── Flower patches along the grass ──
    for (let i = 0; i < 60; i++) {
      const fx = 200 + Math.random() * (TRACK_LENGTH - 200);
      const fside = Math.random() < 0.5 ? -1 : 1;
      const fz = fside * (LANE_HALF + 20 + Math.random() * 30);
      const fty = terrainHeight(fx);
      const flowerColors = [0xff4488, 0xff88cc, 0xffff44, 0xffffff, 0xff6622];
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 10, 4),
        new THREE.MeshLambertMaterial({ color: 0x4ec030 }));
      stem.position.set(fx, fty + 5, fz);
      scene.add(stem);
      const petal = new THREE.Mesh(new THREE.SphereGeometry(5, 6, 4),
        new THREE.MeshLambertMaterial({ color: flowerColors[i % flowerColors.length] }));
      petal.position.set(fx, fty + 11, fz);
      scene.add(petal);
    }

    // ── Pickup meshes (golden star coins — bright & friendly) ──
    const pickupMeshes = new Map<string, THREE.Mesh>();
    for (const p of PICKUPS) {
      const ty = terrainHeight(p.x);
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(13, 0),
        new THREE.MeshLambertMaterial({ color: 0xffdd00, emissive: 0xffaa00, emissiveIntensity: 0.6 })
      );
      m.position.set(p.x, ty + 28, p.z);
      scene.add(m);
      pickupMeshes.set(p.id, m);
    }

    // ── Finish gate ──
    const fy = terrainHeight(FINISH_X);
    const gateMat = new THREE.MeshLambertMaterial({ color: 0xf5c518 });
    for (const zs of [-LANE_HALF, LANE_HALF]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(8, 180, 8), gateMat);
      post.position.set(FINISH_X, fy + 90, zs);
      scene.add(post);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(10, 28, LANE_HALF * 2), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    banner.position.set(FINISH_X, fy + 170, 0);
    scene.add(banner);
    for (let i = -5; i <= 5; i++) {
      if (i % 2 === 0) continue;
      const sq = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 36), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      sq.position.set(FINISH_X, fy + 170, i * 38);
      scene.add(sq);
    }
    // Finish light
    const finLight = new THREE.PointLight(0xffff00, 3, 300);
    finLight.position.set(FINISH_X, fy + 150, 0);
    scene.add(finLight);

    sceneStateRef.current = {
      renderer, scene, camera,
      cartMeshes: new Map(),
      pickupMeshes,
      particleMeshes: [],
      animId: 0,
    };

    const animate = () => {
      const s = sceneStateRef.current;
      if (!s) return;
      drawFrame();
      s.animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      const s = sceneStateRef.current;
      if (!s) return;
      cancelAnimationFrame(s.animId);
      s.renderer.dispose();
      if (mountRef.current && s.renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(s.renderer.domElement);
      }
      s.scene.traverse(obj => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = obj as any;
        if (m.geometry?.dispose) m.geometry.dispose();
        if (m.material?.dispose) m.material.dispose();
      });
      sceneStateRef.current = null;
    };
  }, []);

  // ── Cart mesh builder ─────────────────────────────────────────────────────

  const ensureCartMesh = useCallback((id: string, color: number): THREE.Group => {
    const state = sceneStateRef.current;
    if (!state) throw new Error('scene not ready');
    let group = state.cartMeshes.get(id);
    if (group) return group;
    group = new THREE.Group();

    const basketMat = new THREE.MeshLambertMaterial({ color });
    const basket = new THREE.Mesh(new THREE.BoxGeometry(44, 28, 30), basketMat);
    basket.position.y = 20;
    group.add(basket);

    // Wire overlay
    const wire = new THREE.Mesh(new THREE.BoxGeometry(45, 29, 31),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 }));
    wire.position.y = 20;
    group.add(wire);

    // Handle
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 22),
      new THREE.MeshLambertMaterial({ color: 0x1f2937 }));
    handle.position.set(-22, 28, 0);
    handle.rotation.z = -0.35;
    group.add(handle);
    const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 28),
      new THREE.MeshLambertMaterial({ color: 0x1f2937 }));
    handleBar.position.set(-30, 38, 0);
    handleBar.rotation.x = Math.PI / 2;
    group.add(handleBar);

    // Wheels
    const wheelGeom = new THREE.CylinderGeometry(7, 7, 5, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
    for (const [wx, wz] of [[16, 13], [16, -13], [-16, 13], [-16, -13]]) {
      const w = new THREE.Mesh(wheelGeom, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 7, wz);
      group.add(w);
    }

    // Exhaust pipes (two small cylinders at the back)
    for (const ez of [-8, 8]) {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0x555566 }));
      ex.rotation.z = Math.PI / 2;
      ex.position.set(-24, 12, ez);
      group.add(ex);
    }

    // Avatar sprite
    const avCanvas = document.createElement('canvas');
    avCanvas.width = 64; avCanvas.height = 64;
    const ctx = avCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '38px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎮', 32, 46);
    const tex = new THREE.CanvasTexture(avCanvas);
    const avMat = new THREE.SpriteMaterial({ map: tex });
    const avSprite = new THREE.Sprite(avMat);
    avSprite.scale.set(22, 22, 1);
    avSprite.position.y = 55;
    avSprite.name = 'avatar';
    group.add(avSprite);

    state.scene.add(group);
    state.cartMeshes.set(id, group);
    return group;
  }, []);

  const updateAvatarSprite = useCallback((group: THREE.Group, avatar: string, username: string, isMe: boolean) => {
    const sprite = group.getObjectByName('avatar') as THREE.Sprite | undefined;
    if (!sprite) return;
    const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    if (!tex?.image) return;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = isMe ? 'rgba(124,58,237,0.9)' : 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '34px serif';
    ctx.textAlign = 'center';
    ctx.fillText(avatar, 32, 42);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText((isMe ? 'YOU' : username).slice(0, 8), 32, 58);
    tex.needsUpdate = true;
  }, []);

  // ── Server sync ───────────────────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = getSocket() as any;
    const myId = getSocket().id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onState = (data: { t: number; carts: any[]; forks?: any[] }) => {
      const map = new Map<string, RemoteCart>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of data.carts as any[]) {
        map.set(c.id, c as RemoteCart);
        if (c.id === myId) ownServerRef.current = c;
      }
      // Update forklift positions from server
      if (data.forks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const fData of data.forks as any[]) {
          const fMesh = forkMeshesRef.current.get(fData.id);
          if (fMesh) fMesh.position.z = fData.z;
        }
      }
      snapshotsRef.current.push({ t: data.t, clientT: Date.now(), carts: map });
      if (snapshotsRef.current.length > 5) snapshotsRef.current.shift();
    };

    const onFinish = (data: { id: string; rank: number; points: number }) => {
      if (data.id === myId) finishMsgRef.current = `🏁 You finished #${data.rank}! +${data.points}`;
    };

    const onCollision = () => {
      camShakeRef.current = Math.max(camShakeRef.current, 8);
    };

    socket.on('cart:state', onState);
    socket.on('cart:finished', onFinish);
    socket.on('cart:collision', onCollision);
    socket.on('cart:hit', onCollision);
    return () => {
      socket.off('cart:state', onState);
      socket.off('cart:finished', onFinish);
      socket.off('cart:collision', onCollision);
      socket.off('cart:hit', onCollision);
    };
  }, []);

  // ── Input ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const sendNow = () => {
      sendInput('cart_input', { ...inputRef.current });
      lastInputRef.current = { ...inputRef.current };
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let changed = false;
      if ((k === 'w' || k === 'arrowup') && !inputRef.current.accel) { inputRef.current.accel = true; changed = true; }
      if ((k === 's' || k === 'arrowdown') && !inputRef.current.brake) { inputRef.current.brake = true; changed = true; }
      if ((k === 'a' || k === 'arrowleft') && !inputRef.current.left) { inputRef.current.left = true; changed = true; }
      if ((k === 'd' || k === 'arrowright') && !inputRef.current.right) { inputRef.current.right = true; changed = true; }
      if ((k === 'shift' || k === 'x') && !inputRef.current.drift) { inputRef.current.drift = true; changed = true; }
      if (k === ' ') { e.preventDefault(); sendInput('cart_jump', {}); }
      if (changed) sendNow();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let changed = false;
      if ((k === 'w' || k === 'arrowup') && inputRef.current.accel) { inputRef.current.accel = false; changed = true; }
      if ((k === 's' || k === 'arrowdown') && inputRef.current.brake) { inputRef.current.brake = false; changed = true; }
      if ((k === 'a' || k === 'arrowleft') && inputRef.current.left) { inputRef.current.left = false; changed = true; }
      if ((k === 'd' || k === 'arrowright') && inputRef.current.right) { inputRef.current.right = false; changed = true; }
      if ((k === 'shift' || k === 'x') && inputRef.current.drift) { inputRef.current.drift = false; changed = true; }
      if (changed) sendNow();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const ka = setInterval(sendNow, 1000 / INPUT_HZ);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      clearInterval(ka);
    };
  }, [sendInput]);

  // ── Interpolation ─────────────────────────────────────────────────────────

  const getInterp = useCallback((id: string): RemoteCart | null => {
    const snaps = snapshotsRef.current;
    if (snaps.length === 0) return null;
    const renderTime = Date.now() - 100;
    let a: Snapshot | null = null;
    let b: Snapshot | null = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].t <= renderTime) { a = snaps[i]; b = snaps[i + 1] || null; break; }
    }
    if (!a) a = snaps[0];
    const pa = a.carts.get(id);
    if (!pa) return null;
    if (!b) return pa;
    const pb = b.carts.get(id);
    if (!pb) return pa;
    const span = b.t - a.t;
    const tt = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.t) / span)) : 1;
    return {
      ...pb,
      x: pa.x + (pb.x - pa.x) * tt,
      y: pa.y + (pb.y - pa.y) * tt,
      z: pa.z + (pb.z - pa.z) * tt,
    };
  }, []);

  // ── Per-frame draw ────────────────────────────────────────────────────────

  const drawFrame = useCallback(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    const { renderer, scene, camera, cartMeshes, pickupMeshes } = state;
    const room = useGameStore.getState().room;
    const myId = getSocket().id;
    const now = performance.now();

    const dt = lastFrameTimeRef.current > 0
      ? Math.min((now - lastFrameTimeRef.current) / 1000, 0.05)
      : 1 / 60;
    lastFrameTimeRef.current = now;

    // Animate pickups
    for (const m of pickupMeshes.values()) {
      if (!m.userData.baseY) m.userData.baseY = m.position.y;
      m.rotation.y = now / 400;
      m.rotation.x = now / 600;
      m.position.y = m.userData.baseY + Math.sin(now / 220) * 4;
    }


    // Get latest snapshot
    const lastSnap = snapshotsRef.current[snapshotsRef.current.length - 1];
    const seen = new Set<string>();
    if (lastSnap) for (const id of lastSnap.carts.keys()) seen.add(id);

    for (const [id, group] of cartMeshes) {
      if (!seen.has(id)) { scene.remove(group); cartMeshes.delete(id); }
    }

    let myCartData: RemoteCart | null = null;

    for (const id of seen) {
      const cart = id === myId ? lastSnap!.carts.get(id)! : getInterp(id)!;
      if (!cart) continue;
      if (id === myId) myCartData = cart;

      const pl = room?.players.find(pp => pp.socketId === id);
      const colorHex = pl ? new THREE.Color(pl.color).getHex() : 0x7c3aed;
      const group = ensureCartMesh(id, colorHex);

      const ty = terrainHeight(cart.x);
      const cartVisY = ty - cart.y + 2;

      // Slope tilt
      const dx2 = 30;
      const slope = (terrainHeight(cart.x + dx2) - terrainHeight(cart.x - dx2)) / (dx2 * 2);

      // Drift lean: lean into the turn
      const driftLean = cart.dr ? (cart.vz / 300) * 0.35 : 0;

      group.position.set(cart.x, cartVisY, cart.z);
      group.rotation.z = slope + driftLean;
      group.rotation.y = -cart.yaw;

      // Emissive tint
      const basket = group.children[0] as THREE.Mesh;
      const bMat = basket.material as THREE.MeshLambertMaterial;
      if (cart.db) {
        bMat.emissive.setHex(0xaa00ff);
        bMat.emissiveIntensity = 0.6 + Math.sin(now / 80) * 0.3;
      } else if (cart.bs) {
        bMat.emissive.setHex(0xff5500);
        bMat.emissiveIntensity = 0.5;
      } else if (cart.sp) {
        bMat.emissive.setHex(0xffee00);
        bMat.emissiveIntensity = 0.7;
      } else if (cart.dr) {
        bMat.emissive.setHex(0x0055ff);
        bMat.emissiveIntensity = 0.3;
      } else {
        bMat.emissive.setHex(0x000000);
        bMat.emissiveIntensity = 0;
      }

      if (pl) updateAvatarSprite(group, pl.avatar, pl.username, id === myId);

      // Spawn particles for my cart
      if (id === myId) {
        if (cart.dr) {
          const driftSide = cart.vz > 0 ? -1 : 1;
          spawnDriftSmoke(particlesRef.current, cart.x, cartVisY, cart.z, driftSide);
          if (cart.dc > 40) spawnDriftSparks(particlesRef.current, cart.x, cartVisY, cart.z);
        }
        if (cart.bs || cart.db) {
          spawnBoostFlame(particlesRef.current, cart.x, cartVisY, cart.z);
        }
      }
    }

    // Update and render particles as billboarded sprites
    updateParticles(particlesRef.current, dt);

    // ── 3rd-person camera ──
    if (myCartData) {
      const snap = snapshotsRef.current[snapshotsRef.current.length - 1];
      const msSinceSnap = snap ? Math.min(Date.now() - snap.clientT, 80) : 0;
      const predX = myCartData.x + (myCartData.vx * msSinceSnap) / 1000;
      const ty = terrainHeight(predX);
      const cartVisY = ty - myCartData.y + 2;

      // Smooth cart yaw from server yaw
      const serverYaw = myCartData.yaw;
      const yawDiff = serverYaw - cartYawRef.current;
      const yawDiffWrapped = ((yawDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
      cartYawRef.current += yawDiffWrapped * Math.min(1, dt * 8);

      const cYaw = cartYawRef.current;

      // Speed-based FOV
      const speedRatio = Math.min(1, myCartData.vx / 620);
      const targetFOV = 65 + speedRatio * 25 + (myCartData.db ? 15 : 0);
      camera.fov += (targetFOV - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();

      // Camera arm: 180 behind, 90 up, offset in direction OPPOSITE cart heading
      const armDist = 180 + speedRatio * 40;
      const armH = 85 + speedRatio * 20;

      const targetCamX = predX - Math.cos(cYaw) * armDist;
      const targetCamZ = myCartData.z - Math.sin(cYaw) * armDist;
      const targetCamY = cartVisY + armH;

      // Drift tilt: camera rolls slightly during drift
      const driftTilt = myCartData.dr ? (myCartData.vz / 300) * 0.12 : 0;

      // Spring damping
      const kPos = 1 - Math.exp(-7 * dt);
      const kY = 1 - Math.exp(-4 * dt);

      const cp = camPosRef.current;
      cp.x += (targetCamX - cp.x) * kPos;
      cp.y += (targetCamY - cp.y) * kY;
      cp.z += (targetCamZ - cp.z) * kPos;

      // Camera shake
      const shakeAmt = camShakeRef.current;
      camShakeRef.current = Math.max(0, shakeAmt - dt * 25);
      const shakeX = (Math.random() - 0.5) * shakeAmt;
      const shakeY = (Math.random() - 0.5) * shakeAmt * 0.5;

      camera.position.set(cp.x + shakeX, cp.y + shakeY, cp.z);
      camera.rotation.z = driftTilt;

      // LookAt: slightly ahead of cart
      const lookTargetX = predX + Math.cos(cYaw) * 120;
      const lookTargetZ = myCartData.z + Math.sin(cYaw) * 120;
      const lookTargetY = cartVisY + 18;

      const cl = camLookRef.current;
      cl.x += (lookTargetX - cl.x) * kPos;
      cl.y += (lookTargetY - cl.y) * kY;
      cl.z += (lookTargetZ - cl.z) * kPos;

      camera.lookAt(cl.x, cl.y, cl.z);
      // Re-apply drift roll after lookAt
      camera.rotation.z += driftTilt;
    }

    renderer.render(scene, camera);
  }, [ensureCartMesh, getInterp, updateAvatarSprite]);

  // ── HUD ───────────────────────────────────────────────────────────────────

  const hudRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let id = 0;
    const draw = () => {
      const canvas = hudRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const own = ownServerRef.current;
      if (own) {
        // Speed display
        ctx.fillStyle = 'rgba(0,0,10,0.75)';
        roundRect(ctx, 10, 10, 200, 62, 10);
        ctx.fill();
        const speedColor = own.db ? '#cc44ff' : own.bs ? '#ff6600' : '#00ffcc';
        ctx.fillStyle = speedColor;
        ctx.font = 'bold 28px monospace';
        ctx.fillText(`${Math.round(own.vx)}`, 22, 48);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '11px sans-serif';
        ctx.fillText('km/h', 95, 48);

        // Status badge
        const badge = own.db ? '💜 DRIFT BOOST!' : own.bs ? '🚀 TURBO!' : own.sp ? '🍌 SPIN OUT!' : own.dr ? '🔵 DRIFTING' : '';
        if (badge) {
          ctx.fillStyle = own.db ? 'rgba(120,0,200,0.85)' : own.bs ? 'rgba(200,80,0,0.85)' : own.sp ? 'rgba(180,160,0,0.85)' : 'rgba(0,80,200,0.85)';
          roundRect(ctx, 10, 78, 200, 28, 6);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(badge, 22, 97);
        }

        // Drift charge meter
        if (own.dr || own.dc > 0) {
          const charge = own.dc / 100;
          ctx.fillStyle = 'rgba(0,0,20,0.8)';
          roundRect(ctx, 10, 112, 200, 16, 4);
          ctx.fill();
          const chargeColor = charge > 0.6 ? '#ff00ff' : charge > 0.3 ? '#8844ff' : '#4466ff';
          ctx.fillStyle = chargeColor;
          roundRect(ctx, 12, 114, 196 * charge, 12, 3);
          ctx.fill();
          ctx.fillStyle = '#aaa';
          ctx.font = '9px monospace';
          ctx.fillText('DRIFT CHARGE', 12, 123);
        }

        // Progress bar (bottom center)
        const progress = Math.min(1, own.x / FINISH_X);
        ctx.fillStyle = 'rgba(0,0,10,0.7)';
        roundRect(ctx, CANVAS_W / 2 - 175, CANVAS_H - 32, 350, 20, 5);
        ctx.fill();
        const gradProg = ctx.createLinearGradient(CANVAS_W / 2 - 173, 0, CANVAS_W / 2 + 173, 0);
        gradProg.addColorStop(0, '#7c3aed');
        gradProg.addColorStop(0.5, '#00ffcc');
        gradProg.addColorStop(1, '#ff6600');
        ctx.fillStyle = gradProg;
        roundRect(ctx, CANVAS_W / 2 - 173, CANVAS_H - 30, 346 * progress, 16, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '13px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏁', CANVAS_W / 2 + 170, CANVAS_H - 17);
        ctx.textAlign = 'left';

        // Controls hint (top right)
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('W gas  S brake  A/D steer  SHIFT drift  SPACE jump', CANVAS_W - 10, CANVAS_H - 12);
        ctx.textAlign = 'left';
      }

      if (finishMsgRef.current) {
        ctx.fillStyle = 'rgba(0,0,20,0.88)';
        roundRect(ctx, CANVAS_W / 2 - 210, CANVAS_H / 2 - 36, 420, 72, 14);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(finishMsgRef.current, CANVAS_W / 2, CANVAS_H / 2 + 10);
        ctx.textAlign = 'left';
      }

      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white/50 text-xs text-center mb-1 px-2">
        W gas · S brake · A/D steer · <span className="text-purple-400 font-bold">SHIFT = DRIFT</span> (hold + steer for drift boost!) · SPACE jump
      </div>
      <div className="relative" style={{ width: CANVAS_W, maxWidth: '100%' }}>
        <div ref={mountRef} />
        <canvas
          ref={hudRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="absolute inset-0 pointer-events-none"
          style={{ maxWidth: '100%' }}
        />
      </div>

      {/* Mobile controls */}
      <div className="flex gap-2 mt-2 lg:hidden flex-wrap justify-center">
        <button className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl touch-target"
          onPointerDown={() => { inputRef.current.left = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.left = false; sendInput('cart_input', inputRef.current); }}
          onPointerLeave={() => { inputRef.current.left = false; sendInput('cart_input', inputRef.current); }}
        >◀</button>
        <button className="w-14 h-14 rounded-xl bg-green-500/40 border border-green-500/60 text-white font-bold touch-target"
          onPointerDown={() => { inputRef.current.accel = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.accel = false; sendInput('cart_input', inputRef.current); }}
          onPointerLeave={() => { inputRef.current.accel = false; sendInput('cart_input', inputRef.current); }}
        >GAS</button>
        <button className="w-16 h-14 rounded-xl bg-purple-600/60 border border-purple-400/60 text-white font-bold touch-target text-xs"
          onPointerDown={() => { inputRef.current.drift = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.drift = false; sendInput('cart_input', inputRef.current); }}
          onPointerLeave={() => { inputRef.current.drift = false; sendInput('cart_input', inputRef.current); }}
        >DRIFT</button>
        <button className="w-14 h-14 rounded-xl bg-brand-purple/40 border border-brand-purple/60 text-white font-bold touch-target"
          onPointerDown={() => sendInput('cart_jump', {})}
        >JUMP</button>
        <button className="w-14 h-14 rounded-xl bg-red-500/40 border border-red-500/60 text-white touch-target"
          onPointerDown={() => { inputRef.current.brake = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.brake = false; sendInput('cart_input', inputRef.current); }}
          onPointerLeave={() => { inputRef.current.brake = false; sendInput('cart_input', inputRef.current); }}
        >BRAKE</button>
        <button className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl touch-target"
          onPointerDown={() => { inputRef.current.right = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.right = false; sendInput('cart_input', inputRef.current); }}
          onPointerLeave={() => { inputRef.current.right = false; sendInput('cart_input', inputRef.current); }}
        >▶</button>
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
