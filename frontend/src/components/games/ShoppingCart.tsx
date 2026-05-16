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
    scene.background = new THREE.Color('#1a0a2e');
    scene.fog = new THREE.FogExp2('#1a0a2e', 0.0006);

    const camera = new THREE.PerspectiveCamera(70, CANVAS_W / CANVAS_H, 1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(CANVAS_W, CANVAS_H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    mountRef.current.appendChild(renderer.domElement);
    renderer.domElement.style.maxWidth = '100%';
    renderer.domElement.style.borderRadius = '12px';

    // ── Lighting ──
    scene.add(new THREE.AmbientLight(0x220033, 1.2));
    const sun = new THREE.DirectionalLight(0xffe4ff, 1.4);
    sun.position.set(200, 600, -200);
    scene.add(sun);

    // Neon strip lights along track sides
    const neonColors = [0xff00ff, 0x00ffff, 0xff6600, 0x00ff88];
    for (let i = 0; i < 28; i++) {
      const x = 200 + i * 240;
      const side = i % 2 === 0 ? -1 : 1;
      const col = neonColors[i % neonColors.length];
      const light = new THREE.PointLight(col, 1.5, 280);
      light.position.set(x, terrainHeight(x) + 40, side * (LANE_HALF + 10));
      scene.add(light);

      // Glowing pillar
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 3, 50, 6),
        new THREE.MeshBasicMaterial({ color: col })
      );
      pillar.position.set(x, terrainHeight(x) + 25, side * (LANE_HALF + 10));
      scene.add(pillar);
    }

    // ── Track (tiled floor pattern) ──
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

    // Supermarket floor — dark tile texture via canvas
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 128; floorCanvas.height = 128;
    const fc = floorCanvas.getContext('2d')!;
    fc.fillStyle = '#1c1c2e';
    fc.fillRect(0, 0, 128, 128);
    fc.strokeStyle = '#2a2a4a';
    fc.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { fc.beginPath(); fc.moveTo(i * 32, 0); fc.lineTo(i * 32, 128); fc.stroke(); }
    for (let i = 0; i <= 4; i++) { fc.beginPath(); fc.moveTo(0, i * 32); fc.lineTo(128, i * 32); fc.stroke(); }
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(TRACK_LENGTH / 80, TRACK_WIDTH_VIS / 80);
    const trackMat = new THREE.MeshLambertMaterial({ map: floorTex });
    scene.add(new THREE.Mesh(trackGeom, trackMat));

    // ── Lane markings (center line + edges) ──
    const lineGeom = new THREE.PlaneGeometry(TRACK_LENGTH, 4, 1, 1);
    lineGeom.rotateX(-Math.PI / 2);
    lineGeom.translate(TRACK_LENGTH / 2, 0.5, 0);
    // shift Y to terrain; approximate flat for the marking
    scene.add(new THREE.Mesh(lineGeom, new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 })));

    // ── Side barriers with neon trim ──
    const barrierMat = new THREE.MeshLambertMaterial({ color: 0x111128 });
    const barrierH = 35;
    const barrierGeom = new THREE.BoxGeometry(TRACK_LENGTH, barrierH, 18);
    const barrierL = new THREE.Mesh(barrierGeom, barrierMat);
    barrierL.position.set(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07 + barrierH / 2, -LANE_HALF - 14);
    scene.add(barrierL);
    const barrierR = new THREE.Mesh(barrierGeom, barrierMat);
    barrierR.position.set(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07 + barrierH / 2, LANE_HALF + 14);
    scene.add(barrierR);

    // Neon trim on barriers
    for (const side of [-1, 1]) {
      const trimGeom = new THREE.BoxGeometry(TRACK_LENGTH, 4, 2);
      const trimMat = new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff00ff : 0x00ffff });
      const trim = new THREE.Mesh(trimGeom, trimMat);
      trim.position.set(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07 + barrierH, side * (LANE_HALF + 14));
      scene.add(trim);
    }

    // ── Ramps (glowing chevrons) ──
    for (const r of RAMPS) {
      const ty = terrainHeight(r.x);
      const rampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(r.halfWidth * 2, 5, LANE_HALF * 1.8),
        new THREE.MeshLambertMaterial({ color: 0x0055ff, emissive: 0x0033aa, emissiveIntensity: 0.6 })
      );
      rampMesh.position.set(r.x, ty + 4, 0);
      scene.add(rampMesh);
      // Arrow stripes
      for (let s = -1; s <= 1; s += 2) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(12, 6, LANE_HALF * 0.6),
          new THREE.MeshBasicMaterial({ color: 0x00ffff })
        );
        stripe.position.set(r.x + s * 30, ty + 7, s * LANE_HALF * 0.3);
        scene.add(stripe);
      }
      // Light on ramp
      const rl = new THREE.PointLight(0x0088ff, 2.5, 200);
      rl.position.set(r.x, ty + 40, 0);
      scene.add(rl);
    }

    // ── Obstacles ──
    for (const o of OBSTACLES) {
      const ty = terrainHeight(o.x);
      let mesh: THREE.Object3D;
      if (o.type === 'tree') {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 28, 7),
          new THREE.MeshLambertMaterial({ color: 0x3d1a08 }));
        trunk.position.y = 14;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(28, 65, 7),
          new THREE.MeshLambertMaterial({ color: 0x0a4d1a, emissive: 0x003308, emissiveIntensity: 0.3 }));
        leaves.position.y = 48;
        g.add(trunk); g.add(leaves);
        mesh = g;
      } else if (o.type === 'shelf') {
        // Supermarket shelf unit
        const g = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(20, 70, 60),
          new THREE.MeshLambertMaterial({ color: 0x888899 }));
        frame.position.y = 35;
        g.add(frame);
        // Shelves
        for (let sh = 0; sh < 3; sh++) {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(22, 3, 62),
            new THREE.MeshLambertMaterial({ color: 0xaaaacc }));
          shelf.position.set(0, 16 + sh * 20, 0);
          g.add(shelf);
          // Colorful product blocks on shelves
          for (let pr = 0; pr < 4; pr++) {
            const prodCol = [0xff4444, 0x44ff88, 0xffcc00, 0x4488ff][pr];
            const prod = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 10),
              new THREE.MeshLambertMaterial({ color: prodCol, emissive: prodCol, emissiveIntensity: 0.2 }));
            prod.position.set(2, 22 + sh * 20, -22 + pr * 14);
            g.add(prod);
          }
        }
        mesh = g;
      } else {
        mesh = new THREE.Mesh(
          new THREE.DodecahedronGeometry(20, 0),
          new THREE.MeshLambertMaterial({ color: 0x4a4a5a })
        );
        mesh.position.y = 10;
      }
      mesh.position.x = o.x;
      mesh.position.z = o.z;
      (mesh.position as THREE.Vector3).y += ty;
      scene.add(mesh);
    }

    // ── Forklifts ──
    const forkMeshes = forkMeshesRef.current;
    for (const f of FORKLIFTS) {
      const ty = terrainHeight(f.x);
      const g = new THREE.Group();
      // Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(35, 30, 22),
        new THREE.MeshLambertMaterial({ color: 0xffaa00, emissive: 0x885500, emissiveIntensity: 0.3 }));
      body.position.y = 18;
      g.add(body);
      // Forks
      for (const fz of [-8, 8]) {
        const fork = new THREE.Mesh(new THREE.BoxGeometry(30, 3, 4),
          new THREE.MeshLambertMaterial({ color: 0xcccccc }));
        fork.position.set(18, 8, fz);
        g.add(fork);
      }
      // Warning light
      const warnLight = new THREE.PointLight(0xff6600, 1.5, 80);
      warnLight.position.set(0, 45, 0);
      g.add(warnLight);
      // Stripes
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(37, 6, 24),
        new THREE.MeshBasicMaterial({ color: 0x000000 }));
      stripe.position.y = 18;
      g.add(stripe);
      g.position.set(f.x, ty, (f.zMin + f.zMax) / 2);
      scene.add(g);
      forkMeshes.set(f.id, g);
    }

    // ── Neon signs on barrier walls ──
    const signTexts = ['SUPERMARKET', 'SPEED ZONE', 'NO BRAKES', 'DANGER', 'FRESH DEALS'];
    for (let i = 0; i < 10; i++) {
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256; signCanvas.height = 64;
      const sc = signCanvas.getContext('2d')!;
      const col = neonColors[i % neonColors.length];
      const hexCol = '#' + col.toString(16).padStart(6, '0');
      sc.fillStyle = '#000011';
      sc.fillRect(0, 0, 256, 64);
      sc.strokeStyle = hexCol;
      sc.lineWidth = 3;
      sc.strokeRect(3, 3, 250, 58);
      sc.fillStyle = hexCol;
      sc.font = 'bold 20px monospace';
      sc.textAlign = 'center';
      sc.fillText(signTexts[i % signTexts.length], 128, 40);
      const signTex = new THREE.CanvasTexture(signCanvas);
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 25),
        new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
      );
      const x = 400 + i * 620;
      const side = i % 2 === 0 ? -1 : 1;
      const ty = terrainHeight(x);
      signMesh.position.set(x, ty + 60, side * (LANE_HALF + 5));
      signMesh.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(signMesh);
    }

    // ── Pickup meshes (glowing turbo crates) ──
    const pickupMeshes = new Map<string, THREE.Mesh>();
    for (const p of PICKUPS) {
      const ty = terrainHeight(p.x);
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(14, 0),
        new THREE.MeshLambertMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.8 })
      );
      m.position.set(p.x, ty + 28, p.z);
      scene.add(m);
      const pLight = new THREE.PointLight(0xff4400, 1.8, 100);
      pLight.position.set(p.x, ty + 28, p.z);
      scene.add(pLight);
      pickupMeshes.set(p.id, m);
    }

    // ── Finish gate ──
    const fy = terrainHeight(FINISH_X);
    const gateMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
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

    // Update forklift light flicker
    for (const g of forkMeshesRef.current.values()) {
      g.traverse(obj => {
        if (obj instanceof THREE.PointLight) {
          obj.intensity = 1.2 + Math.sin(now / 300) * 0.5;
        }
      });
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
