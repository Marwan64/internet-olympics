'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, useGameState } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';
import { soccer_kick, soccer_goal, soccer_dash, soccer_wallHit } from '@/hooks/useGameSounds';

// ── Arena constants (must match backend) ──────────────────────────────────────
const AW = 40;
const AH = 26;
const GW = 8;
const BALL_R_BASE = 0.7;
const PL_R = 0.85;
const PL_DRAG = 0.91;          // must match backend
const PL_DRAG_EXP = 60;        // backend physics Hz — used for frame-rate independent drag
const PL_ACCEL = 100;          // must match backend
const PL_MAX_SPD = 22;
const PL_BOOST_SPD = 40;
const DT_CAP = 0.05;

const TEAM_COLOR  = [0xef4444, 0x3b82f6] as const; // red, blue
const TEAM_HEX    = ['#ef4444', '#3b82f6'] as const;
const TEAM_NAME   = ['Red', 'Blue'] as const;

// ── Helper: build arena scene objects ────────────────────────────────────────

function buildScene(scene: THREE.Scene) {
  // Pitch
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(AW, AH),
    new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.9 })
  );
  pitch.rotation.x = -Math.PI / 2;
  scene.add(pitch);

  // Centre circle
  const circleGeo = new THREE.RingGeometry(3.8, 4.2, 48);
  const lineMat   = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const circle    = new THREE.Mesh(circleGeo, lineMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.01;
  scene.add(circle);

  // Centre dot
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), lineMat.clone());
  dot.rotation.x = -Math.PI / 2;
  dot.position.y = 0.01;
  scene.add(dot);

  // Centre line
  const clGeo = new THREE.PlaneGeometry(0.25, AH);
  const cl    = new THREE.Mesh(clGeo, lineMat.clone());
  cl.rotation.x = -Math.PI / 2;
  cl.position.y = 0.01;
  scene.add(cl);

  // Boundary lines
  const border = new THREE.Mesh(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(AW, 0.01, AH)),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  );
  border.position.y = 0.02;
  scene.add(border);

  // Goals (left = blue scores, right = red scores)
  const goalDepth = 2.5;
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.6 });
  for (const side of [-1, 1]) {
    const teamIdx = side === -1 ? 1 : 0;
    const color   = TEAM_COLOR[teamIdx === 0 ? 1 : 0];
    const gxFace  = side * AW / 2;                      // goal-line x (front face)
    const gxBack  = side * (AW / 2 + goalDepth);        // back-net x

    // Back net — vertical plane, normal faces along X axis
    const backNet = new THREE.Mesh(
      new THREE.PlaneGeometry(GW, 2.4),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    backNet.rotation.y = Math.PI / 2;                   // PlaneGeometry is XY; rotate Y so normal faces X
    backNet.position.set(gxBack, 1.2, 0);
    scene.add(backNet);

    // Side nets — vertical planes at z = ±GW/2, spanning the goal depth
    for (const zs of [-1, 1]) {
      const sideNet = new THREE.Mesh(
        new THREE.PlaneGeometry(goalDepth, 2.4),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
      );
      // No Y rotation: XY plane faces Z direction — correct for side walls
      sideNet.position.set(gxFace + side * goalDepth / 2, 1.2, zs * GW / 2);
      scene.add(sideNet);
    }

    // Goal posts — vertical cylinders at z = ±GW/2 on the goal line
    for (const zs of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 2.4, 10),
        postMat
      );
      post.position.set(gxFace, 1.2, zs * GW / 2);
      scene.add(post);
    }

    // Crossbar — cylinder spanning Z axis between the two posts
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, GW + 0.3, 10),
      postMat
    );
    bar.rotation.x = Math.PI / 2;                       // rotate Y-up cylinder to lie along Z
    bar.position.set(gxFace, 2.4, 0);
    scene.add(bar);

    // Goal zone tint on pitch (inside field)
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(4, GW),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(side * (AW / 2 - 2), 0.02, 0);
    scene.add(zone);
  }

  // Boost pad markers (4 pads)
  const padPositions = [[-10, -7], [-10, 7], [10, -7], [10, 7]];
  for (const [px, pz] of padPositions) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 24),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: new THREE.Color(0xfbbf24), emissiveIntensity: 0.5, transparent: true, opacity: 0.8 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(px, 0.03, pz);
    scene.add(pad);

    // Pad glow ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.55, 24),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(px, 0.04, pz);
    scene.add(ring);
  }
}

// ── Particle burst for goal celebration ───────────────────────────────────────

function spawnGoalParticles(scene: THREE.Scene, x: number, z: number, color: number) {
  const count = 80;
  const geo   = new THREE.BufferGeometry();
  const pos   = new Float32Array(count * 3);
  const vel: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = 1; pos[i * 3 + 2] = z;
    const ang = Math.random() * Math.PI * 2;
    const spd = 4 + Math.random() * 12;
    vel.push([Math.cos(ang) * spd, 2 + Math.random() * 8, Math.sin(ang) * spd]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat  = new THREE.PointsMaterial({ color, size: 0.4, transparent: true });
  const pts  = new THREE.Points(geo, mat);
  scene.add(pts);

  let life = 0;
  const tick = () => {
    life += 0.016;
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      p.setXYZ(i,
        p.getX(i) + vel[i][0] * 0.016,
        Math.max(0, p.getY(i) + vel[i][1] * 0.016),
        p.getZ(i) + vel[i][2] * 0.016,
      );
      vel[i][1] -= 12 * 0.016;
    }
    p.needsUpdate = true;
    mat.opacity = Math.max(0, 1 - life / 1.8);
    if (life < 1.8) requestAnimationFrame(tick);
    else { scene.remove(pts); geo.dispose(); mat.dispose(); }
  };
  tick();
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ServerPlayer { id: string; team: 0 | 1; x: number; z: number; vx: number; vz: number; boosting: boolean }
interface ServerBall   { x: number; z: number; vx: number; vz: number; spin: number; r: number }

export default function PhysicsSoccer() {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const gameState  = useGameState();
  const { sendInput } = useSocketActions();
  const mySocketId = useRef<string>('');

  // ── Mobile touch input refs (readable inside the game loop) ───────────────
  const touchJoyRef  = useRef({ dx: 0, dz: 0 });
  const touchDashRef = useRef(false);
  const joyOriginRef = useRef({ x: 0, y: 0 });
  const [joyVisual, setJoyVisual] = useState({ x: 0, y: 0 });

  // ── HUD state ──────────────────────────────────────────────────────────────
  const [score, setScore]         = useState<[number, number]>([0, 0]);
  const [myTeam, setMyTeam]       = useState<0 | 1 | null>(null);
  const [boostPct, setBoostPct]   = useState(1);
  const [chaos, setChaos]         = useState<string | null>(null);
  const [goalBanner, setGoalBanner] = useState<{ team: 0 | 1; msg: string; scorer?: string } | null>(null);
  const [inReset, setInReset]     = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const container = canvasRef.current;
    mySocketId.current = getSocket().id ?? '';

    // ── Renderer ────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.018);

    // ── Camera (slightly angled top-down) ────────────────────────────────────
    const aspect = container.clientWidth / container.clientHeight;
    const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
    camera.position.set(0, 32, 16);
    camera.lookAt(0, 0, 0);

    // ── Lights ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(15, 30, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -30; sun.shadow.camera.right  = 30;
    sun.shadow.camera.top  =  20; sun.shadow.camera.bottom = -20;
    scene.add(sun);
    const blueGoalLight = new THREE.PointLight(0x3b82f6, 2.5, 22);
    blueGoalLight.position.set(-20, 3, 0);
    scene.add(blueGoalLight);
    const redGoalLight = new THREE.PointLight(0xef4444, 2.5, 22);
    redGoalLight.position.set(20, 3, 0);
    scene.add(redGoalLight);

    // Build static arena
    buildScene(scene);

    // ── Ball mesh ────────────────────────────────────────────────────────────
    const ballGeo  = new THREE.SphereGeometry(BALL_R_BASE, 24, 16);
    const ballMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    // Ball glow sprite
    const glowTex = (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0,   'rgba(255,255,200,0.9)');
      gr.addColorStop(0.4, 'rgba(255,255,100,0.4)');
      gr.addColorStop(1,   'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowSprite.scale.set(3, 3, 1);
    scene.add(glowSprite);

    // Ball shadow blob
    const shadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
    );
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.05;
    scene.add(shadowMesh);

    // ── Player meshes — flat emoji discs ─────────────────────────────────────
    const playerMeshes = new Map<string, THREE.Group>();

    function makeEmojiTexture(emoji: string, teamColor: number, isLocal: boolean): THREE.CanvasTexture {
      const size = 256;
      const cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      const g = cv.getContext('2d')!;
      // Team-colored filled circle
      const hex = '#' + teamColor.toString(16).padStart(6, '0');
      g.fillStyle = hex;
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
      g.fill();
      // White border (thicker for local player)
      g.strokeStyle = isLocal ? '#ffffff' : 'rgba(255,255,255,0.85)';
      g.lineWidth = isLocal ? 14 : 10;
      g.stroke();
      // Inner ring (subtle depth)
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 22, 0, Math.PI * 2);
      g.stroke();
      // Emoji centered
      g.font = `${Math.round(size * 0.44)}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(emoji, size / 2, size / 2 + 4);
      return new THREE.CanvasTexture(cv);
    }

    function makeYouLabel(): THREE.Sprite {
      const cv = document.createElement('canvas');
      cv.width = 160; cv.height = 56;
      const g2d = cv.getContext('2d')!;
      g2d.clearRect(0, 0, 160, 56);
      // Pill background
      g2d.fillStyle = 'rgba(0,0,0,0.55)';
      g2d.beginPath();
      g2d.roundRect(4, 4, 152, 48, 14);
      g2d.fill();
      // Text
      g2d.font = 'bold 26px sans-serif';
      g2d.fillStyle = '#ffffff';
      g2d.textAlign = 'center';
      g2d.textBaseline = 'middle';
      g2d.fillText('YOU ▼', 80, 28);
      const tex = new THREE.CanvasTexture(cv);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.scale.set(2.8, 0.9, 1);
      spr.position.set(0, 2.6, 0);
      return spr;
    }

    function getOrCreatePlayer(id: string, team: 0 | 1): THREE.Group {
      if (playerMeshes.has(id)) return playerMeshes.get(id)!;
      const g   = new THREE.Group();
      const col = TEAM_COLOR[team];
      const isLocal = id === sock.id;

      // Look up this player's avatar from the room state
      const room = useGameStore.getState().room;
      const roomPlayer = room?.players.find(rp => rp.id === id);
      const emoji = roomPlayer?.avatar ?? (team === 0 ? '🔴' : '🔵');

      // Flat disc — visible from the top-down camera
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(PL_R, PL_R, 0.38, 32),
        new THREE.MeshStandardMaterial({
          map: makeEmojiTexture(emoji, col, isLocal),
          roughness: 0.3,
          metalness: 0.15,
          emissive: new THREE.Color(col),
          emissiveIntensity: isLocal ? 0.25 : 0.1,
        })
      );
      disc.castShadow = true;
      disc.position.y = 0.19;
      g.add(disc); // children[0]

      // Shadow ring on pitch
      const shadowRing = new THREE.Mesh(
        new THREE.RingGeometry(PL_R * 0.75, PL_R * 1.08, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })
      );
      shadowRing.rotation.x = -Math.PI / 2;
      shadowRing.position.y = 0.01;
      g.add(shadowRing); // children[1]

      // YOU indicator ring — pulsing outer glow, only visible for local player
      const youRing = new THREE.Mesh(
        new THREE.RingGeometry(PL_R * 1.22, PL_R * 1.55, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0 })
      );
      youRing.rotation.x = -Math.PI / 2;
      youRing.position.y = 0.03;
      youRing.visible = isLocal;
      g.add(youRing); // children[2]

      // YOU label sprite — floats above, only for local player
      const youLabel = makeYouLabel();
      youLabel.visible = isLocal;
      g.add(youLabel); // children[3]

      scene.add(g);
      playerMeshes.set(id, g);
      return g;
    }

    // ── Server state ──────────────────────────────────────────────────────────
    interface Snap {
      t: number;
      ball: ServerBall;
      players: ServerPlayer[];
      score: [number, number];
      chaos: string | null;
      inReset: boolean;
    }
    let snap: Snap | null = null;
    let clientT = Date.now();

    // ── Local player physics (client prediction) ──────────────────────────────
    const local = {
      x: 0, z: 0, vx: 0, vz: 0,
      boosting: false,
      boostUntil: 0,
      boostCooldownUntil: 0,
      team: 0 as 0 | 1,
      assigned: false,
    };

    // ── Input ─────────────────────────────────────────────────────────────────
    const keys = { w: false, a: false, s: false, d: false, shift: false };
    let shiftEdge = false;
    let pendingDash = false;
    let lastSend  = 0;
    let boostCDUntil = 0;

    const onKD = (e: KeyboardEvent) => {
      if (e.code === 'KeyW')     keys.w     = true;
      if (e.code === 'KeyA')     keys.a     = true;
      if (e.code === 'KeyS')     keys.s     = true;
      if (e.code === 'KeyD')     keys.d     = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = true;
    };
    const onKU = (e: KeyboardEvent) => {
      if (e.code === 'KeyW')     keys.w     = false;
      if (e.code === 'KeyA')     keys.a     = false;
      if (e.code === 'KeyS')     keys.s     = false;
      if (e.code === 'KeyD')     keys.d     = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.shift = false;
    };
    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup',   onKU);

    // ── Socket ────────────────────────────────────────────────────────────────
    const sock = getSocket();

    const onState = (data: Snap) => {
      snap   = data;
      clientT = Date.now();
      setScore(data.score);
      setInReset(data.inReset);

      // Find own player to set team
      const me = data.players.find(p => p.id === sock.id);
      if (me && !local.assigned) {
        local.x = me.x; local.z = me.z;
        local.vx = me.vx; local.vz = me.vz;
        local.team = me.team;
        local.assigned = true;
        setMyTeam(me.team);
      }
      // Reconcile: gently nudge toward server position to correct drift without snapping
      if (me) {
        local.x += (me.x - local.x) * 0.12;
        local.z += (me.z - local.z) * 0.12;
      }
    };

    const onGoal = (data: { team: 0 | 1; score: [number, number]; scorer?: string | null }) => {
      setScore(data.score);
      soccer_goal();
      const isMyTeam = data.team === local.team;
      const msg = isMyTeam ? '⚽ GOAL!' : '😬 THEY SCORED!';
      // Look up scorer name
      const room = useGameStore.getState().room;
      const scorerPlayer = data.scorer ? room?.players.find(p => p.id === data.scorer) : null;
      const scorerName = scorerPlayer?.username ?? null;
      setGoalBanner({ team: data.team, msg, scorer: scorerName ?? undefined });
      setTimeout(() => setGoalBanner(null), 2600);
      spawnGoalParticles(scene, data.team === 1 ? -AW / 2 + 1 : AW / 2 - 1, 0, TEAM_COLOR[data.team]);
    };

    const onChaos = (data: { kind: string; label: string; duration: number }) => {
      setChaos(data.label);
      setTimeout(() => setChaos(null), data.duration);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('soccer:state', onState);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('soccer:goal',  onGoal);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('soccer:chaos', onChaos);

    // ── Camera shake state (smooth damped oscillation, not raw random) ────────
    let shakeAmt = 0;
    let shakeOffX = 0, shakeOffZ = 0;
    let shakeVX = 0, shakeVZ = 0;
    let lastKickSound = 0; // debounce kick sfx

    // ── Ball render position (lerped to smooth out collision snaps) ───────────
    let ballRx = 0, ballRz = 0;
    let ballInitialized = false;

    // ── Game loop ─────────────────────────────────────────────────────────────
    const clock = new THREE.Clock(true);
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt  = Math.min(clock.getDelta(), DT_CAP);
      const now = performance.now();

      // ── Client-side player prediction ────────────────────────────────────
      const phase = useGameStore.getState().gameState?.phase;
      if (local.assigned && phase === 'playing' && !inReset) {
        // Keyboard + touch joystick combined
        let dx = touchJoyRef.current.dx;
        let dz = touchJoyRef.current.dz;
        if (keys.w) dz -= 1;
        if (keys.s) dz += 1;
        if (keys.a) dx -= 1;
        if (keys.d) dx += 1;
        const len = Math.hypot(dx, dz);
        if (len > 0) { dx /= len; dz /= len; }

        // Dash rising edge — latch until the next network send so it isn't missed
        const isDash = (keys.shift && !shiftEdge) || touchDashRef.current;
        touchDashRef.current = false;
        shiftEdge = keys.shift;
        if (isDash) pendingDash = true;

        if (isDash && now > boostCDUntil) {
          soccer_dash();
          local.boosting = true;
          local.boostUntil = now + 700;
          boostCDUntil = now + 3800;
          if (len > 0) { local.vx += dx * 25; local.vz += dz * 25; }
        }
        if (now > local.boostUntil) local.boosting = false;

        const maxSpd = local.boosting ? PL_BOOST_SPD : PL_MAX_SPD;
        local.vx += dx * PL_ACCEL * dt;
        local.vz += dz * PL_ACCEL * dt;
        const spd = Math.hypot(local.vx, local.vz);
        if (spd > maxSpd) { local.vx *= maxSpd / spd; local.vz *= maxSpd / spd; }
        // Frame-rate independent drag: PL_DRAG is defined per backend tick (1/60s)
        // Raising it to (dt * PL_DRAG_EXP) keeps physics consistent at any refresh rate
        const dragFactor = Math.pow(PL_DRAG, dt * PL_DRAG_EXP);
        local.vx *= dragFactor;
        local.vz *= dragFactor;
        local.x  += local.vx * dt;
        local.z  += local.vz * dt;
        local.x = Math.max(-AW / 2 + PL_R, Math.min(AW / 2 - PL_R, local.x));
        local.z = Math.max(-AH / 2 + PL_R, Math.min(AH / 2 - PL_R, local.z));

        // Boost meter
        const cd = boostCDUntil - now;
        setBoostPct(cd > 0 ? Math.max(0, 1 - cd / 3800) : 1);

        // Send input at 20 Hz — flush pendingDash so the rising edge is never dropped
        if (now - lastSend > 50) {
          lastSend = now;
          sendInput('soccer_input', { dx, dz, boost: local.boosting, dash: pendingDash });
          pendingDash = false;
        }
      }

      // ── Interpolate server state ──────────────────────────────────────────
      if (snap) {
        const msSince = Math.min(Date.now() - clientT, 80);
        const frac    = msSince / 50; // 20Hz = 50ms interval

        // Ball — extrapolate forward from snapshot, then lerp render position to smooth collision snaps
        const targetBx = snap.ball.x + snap.ball.vx * (msSince / 1000);
        const targetBz = snap.ball.z + snap.ball.vz * (msSince / 1000);
        const br = snap.ball.r;

        if (!ballInitialized) {
          ballRx = targetBx; ballRz = targetBz;
          ballInitialized = true;
        } else {
          // Snap immediately if ball teleports (goal reset), lerp otherwise
          const distToTarget = Math.hypot(targetBx - ballRx, targetBz - ballRz);
          if (distToTarget > 6) {
            ballRx = targetBx; ballRz = targetBz;
          } else {
            const lerpSpeed = Math.min(1, 22 * dt); // ~22/s convergence
            ballRx += (targetBx - ballRx) * lerpSpeed;
            ballRz += (targetBz - ballRz) * lerpSpeed;
          }
        }

        ballMesh.position.set(ballRx, br, ballRz);
        ballMesh.rotation.y += snap.ball.spin * dt;
        ballMesh.rotation.x += Math.hypot(snap.ball.vx, snap.ball.vz) * 0.05;

        // Kick sound: local player close to ball and moving fast toward it
        if (local.assigned) {
          const ballSpd = Math.hypot(snap.ball.vx, snap.ball.vz);
          const distToBall = Math.hypot(local.x - ballRx, local.z - ballRz);
          const playerSpd = Math.hypot(local.vx, local.vz);
          if (distToBall < PL_R + BALL_R_BASE + 0.5 && ballSpd > 6 && playerSpd > 3 && performance.now() - lastKickSound > 300) {
            soccer_kick();
            lastKickSound = performance.now();
          }
          // Wall hit sound for ball
          if ((Math.abs(ballRx) > AW / 2 - BALL_R_BASE - 0.2 || Math.abs(ballRz) > AH / 2 - BALL_R_BASE - 0.2) && ballSpd > 3 && performance.now() - lastKickSound > 200) {
            soccer_wallHit();
            lastKickSound = performance.now();
          }
        }
        // Scale ball mesh if giant_ball
        const scale = br / BALL_R_BASE;
        ballMesh.scale.setScalar(scale);
        glowSprite.position.set(ballRx, br + 0.2, ballRz);
        glowSprite.scale.set(5 * scale, 5 * scale, 1);
        shadowMesh.position.set(ballRx, 0.05, ballRz);
        shadowMesh.scale.set(scale, scale, scale);

        // Players
        const seen = new Set<string>();
        for (const sp of snap.players) {
          seen.add(sp.id);
          const g   = getOrCreatePlayer(sp.id, sp.team);
          const isMe = sp.id === sock.id;

          if (isMe) {
            g.position.set(local.x, 0, local.z);
            const mx = local.vx, mz = local.vz;
            if (Math.hypot(mx, mz) > 0.5) g.rotation.y = Math.atan2(mx, mz);
          } else {
            const px  = sp.x + sp.vx * (msSince / 1000);
            const pz  = sp.z + sp.vz * (msSince / 1000);
            g.position.lerp(new THREE.Vector3(px, 0, pz), 0.25);
            if (Math.hypot(sp.vx, sp.vz) > 0.3) {
              g.rotation.y = Math.atan2(sp.vx, sp.vz);
            }
          }

          // Boost pulse on disc
          const disc = g.children[0] as THREE.Mesh;
          const mat  = disc.material as THREE.MeshStandardMaterial;
          const bi   = (isMe ? local.boosting : sp.boosting) ? 0.55 + 0.35 * Math.sin(now * 0.02) : (isMe ? 0.2 : 0.08);
          mat.emissive.set(TEAM_COLOR[sp.team]);
          mat.emissiveIntensity = bi;

          // YOU ring pulse — only on local player
          if (isMe) {
            const youRing = g.children[2] as THREE.Mesh;
            const youMat  = youRing.material as THREE.MeshBasicMaterial;
            // Pulse between 0.5 and 1.0
            youMat.opacity = 0.55 + 0.45 * Math.sin(now * 0.004);
            // When boosting, tint to team color + white flash
            if (local.boosting) {
              youMat.color.set(TEAM_COLOR[sp.team]);
              youMat.opacity = Math.min(1, youMat.opacity + 0.2);
            } else {
              youMat.color.set(0xffffff);
            }
          }
        }

        // Hide removed players
        for (const [id, g] of playerMeshes) {
          if (!seen.has(id)) g.visible = false;
          else g.visible = true;
        }
      }

      // ── Camera shake — smooth damped spring oscillator, not raw random ────
      if (shakeAmt > 0.005) {
        // Spring: frequency ~14Hz, damping ratio 0.6 → quick settle, no jitter
        const freq = 14, damp = 0.6;
        const k = freq * freq, c = 2 * freq * damp;
        shakeVX += (-k * shakeOffX - c * shakeVX) * dt;
        shakeVZ += (-k * shakeOffZ - c * shakeVZ) * dt;
        shakeOffX += shakeVX * dt;
        shakeOffZ += shakeVZ * dt;
        shakeAmt *= Math.pow(0.75, dt * 60); // frame-rate independent decay
      } else {
        shakeAmt = 0; shakeOffX = 0; shakeOffZ = 0; shakeVX = 0; shakeVZ = 0;
      }
      camera.position.set(shakeOffX, 32, 16 + shakeOffZ);

      renderer.render(scene, camera);
    };

    animate();

    // Shake on goal — give the spring an initial velocity impulse instead of raw displacement
    const onGoalShake = () => {
      shakeAmt = 0.3; // reduced from 1.2 — still satisfying but not violently disorienting
      shakeVX = (Math.random() - 0.5) * 5;
      shakeVZ = (Math.random() - 0.5) * 5;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sock as any).on('soccer:goal', onGoalShake);

    // ── Resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKD);
      window.removeEventListener('keyup',   onKU);
      window.removeEventListener('resize',  onResize);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('soccer:state', onState);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('soccer:goal',  onGoal);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('soccer:goal',  onGoalShake);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sock as any).off('soccer:chaos', onChaos);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── HUD ───────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full" style={{ height: '68vh', minHeight: 440 }}>
      <div ref={canvasRef} className="w-full h-full" />

      {/* Score bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-4 glass rounded-2xl px-6 py-2 pointer-events-none select-none">
        <span className="font-display font-black text-2xl" style={{ color: TEAM_HEX[0] }}>
          🔴 {TEAM_NAME[0]}
        </span>
        <span className="font-display font-black text-3xl text-white tabular-nums">
          {score[0]} – {score[1]}
        </span>
        <span className="font-display font-black text-2xl" style={{ color: TEAM_HEX[1] }}>
          {TEAM_NAME[1]} 🔵
        </span>
      </div>

      {/* My team indicator — shows which team you're on */}
      {myTeam !== null && (
        <div className="absolute top-3 left-3 pointer-events-none select-none flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: `${TEAM_HEX[myTeam]}33`, border: `2px solid ${TEAM_HEX[myTeam]}`, backdropFilter: 'blur(8px)' }}>
          <div className="w-4 h-4 rounded-full border-2 border-white" style={{ background: TEAM_HEX[myTeam] }} />
          <span className="text-white text-sm font-black tracking-wide">{TEAM_NAME[myTeam]} Team</span>
          <span className="text-xs font-bold opacity-60" style={{ color: TEAM_HEX[myTeam] }}>← YOU</span>
        </div>
      )}

      {/* Boost meter */}
      <div className="absolute bottom-4 right-4 pointer-events-none select-none flex flex-col items-end gap-1">
        <span className="text-white/50 text-xs font-mono">BOOST</span>
        <div className="w-28 h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: `${boostPct * 100}%`,
              background: boostPct === 1
                ? 'linear-gradient(90deg, #fbbf24, #f97316)'
                : 'linear-gradient(90deg, #374151, #4b5563)',
            }}
          />
        </div>
        <span className="text-white/40 text-xs font-mono">SHIFT to dash</span>
      </div>

      {/* Controls hint (desktop) */}
      <div className="absolute bottom-4 left-3 text-white/25 text-xs font-mono pointer-events-none select-none hidden sm:block">
        WASD move · SHIFT dash
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

        {/* Dash button — bottom right */}
        <div
          className="absolute pointer-events-auto select-none flex items-center justify-center"
          style={{
            bottom: 20, right: 20, width: 76, height: 76, borderRadius: '50%',
            background: 'rgba(251,191,36,0.7)', border: '2px solid rgba(251,191,36,0.9)',
            touchAction: 'none', fontWeight: 900, fontSize: 14, color: '#fff', letterSpacing: 1,
          }}
          onTouchStart={e => { e.preventDefault(); touchDashRef.current = true; }}
        >
          DASH
        </div>
      </div>

      {/* Chaos label */}
      <AnimatePresence>
        {chaos && (
          <motion.div
            key={chaos}
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none select-none"
          >
            <div className="bg-orange-500/90 text-white font-display font-black text-xl px-6 py-2 rounded-xl shadow-lg">
              {chaos}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Goal banner */}
      <AnimatePresence>
        {goalBanner && (
          <motion.div
            key="goal"
            initial={{ opacity: 0, scale: 0.5, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          >
            <div
              className="font-display font-black text-6xl text-white text-center px-10 py-6 rounded-3xl shadow-2xl"
              style={{ background: `${TEAM_HEX[goalBanner.team]}cc`, border: `4px solid ${TEAM_HEX[goalBanner.team]}` }}
            >
              {goalBanner.msg}
              <div className="text-xl mt-1 font-sans font-normal opacity-90">
                {goalBanner.scorer ? `${goalBanner.scorer} scored for ` : ''}{TEAM_NAME[goalBanner.team]}!
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset overlay */}
      <AnimatePresence>
        {inReset && !goalBanner && (
          <motion.div
            key="reset"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none select-none"
          >
            <div className="glass text-white/60 font-mono text-sm px-4 py-2 rounded-xl">
              Resetting…
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
