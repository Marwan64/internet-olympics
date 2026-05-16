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
  { id: 'o3', x: 1800, z: 100, type: 'tree' as const },
  { id: 'o4', x: 2100, z: -160, type: 'rock' as const },
  { id: 'o5', x: 2400, z: 50, type: 'tree' as const },
  { id: 'o6', x: 3100, z: -100, type: 'rock' as const },
  { id: 'o7', x: 3400, z: 130, type: 'tree' as const },
  { id: 'o8', x: 3700, z: 0, type: 'tree' as const },
  { id: 'o9', x: 4500, z: -150, type: 'rock' as const },
  { id: 'o10', x: 4800, z: 90, type: 'tree' as const },
  { id: 'o11', x: 5100, z: -60, type: 'tree' as const },
  { id: 'o12', x: 5300, z: 160, type: 'rock' as const },
  { id: 'o13', x: 5900, z: -80, type: 'tree' as const },
  { id: 'o14', x: 6200, z: 50, type: 'rock' as const },
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

interface RemoteCart {
  id: string; x: number; y: number; z: number; vx: number;
  bs: number; sp: number; og: number; fn: number;
}
interface Snapshot { t: number; clientT: number; carts: Map<string, RemoteCart> }

// ── Component ─────────────────────────────────────────────────────────────────

export default function ShoppingCart() {
  const mountRef = useRef<HTMLDivElement>(null);
  const { sendInput } = useSocketActions();

  const snapshotsRef = useRef<Snapshot[]>([]);
  const ownServerRef = useRef<RemoteCart | null>(null);
  const finishMsgRef = useRef('');
  const lastInputRef = useRef({ accel: false, brake: false, left: false, right: false });
  const inputRef = useRef({ accel: false, brake: false, left: false, right: false });
  const lastFrameTimeRef = useRef<number>(0);
  const smoothLookRef = useRef({ x: 0, y: 0, z: 0 });
  const sceneStateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    cartMeshes: Map<string, THREE.Group>;
    pickupMeshes: Map<string, THREE.Mesh>;
    boostFlames: Map<string, THREE.Mesh>;
    animId: number;
  } | null>(null);

  // ── Set up three.js scene once ────────────────────────────────────────────

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87ceeb');
    scene.fog = new THREE.Fog('#87ceeb', 600, 2200);

    const camera = new THREE.PerspectiveCamera(70, CANVAS_W / CANVAS_H, 1, 5000);
    camera.position.set(-150, 120, 0);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(CANVAS_W, CANVAS_H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    mountRef.current.appendChild(renderer.domElement);
    renderer.domElement.style.maxWidth = '100%';
    renderer.domElement.style.borderRadius = '12px';

    // ── Lighting ──
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.0);
    sun.position.set(300, 800, -300);
    scene.add(sun);

    // ── Terrain (track) — a long strip with displaced vertices ──
    const TRACK_WIDTH_VIS = LANE_HALF * 2 + 80;
    const segments = 300;
    const trackGeom = new THREE.PlaneGeometry(TRACK_LENGTH, TRACK_WIDTH_VIS, segments, 8);
    // Rotate so the plane is on the ground, x runs forward, z runs lateral
    trackGeom.rotateX(-Math.PI / 2);
    // Shift so x=0 is start
    trackGeom.translate(TRACK_LENGTH / 2, 0, 0);
    const pos = trackGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setY(i, terrainHeight(x));
    }
    pos.needsUpdate = true;
    trackGeom.computeVertexNormals();

    const trackMat = new THREE.MeshLambertMaterial({ color: 0xf5f5fa });
    const track = new THREE.Mesh(trackGeom, trackMat);
    scene.add(track);

    // ── Side walls/snow banks ──
    const wallGeom = new THREE.BoxGeometry(TRACK_LENGTH, 30, 25);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xb8c5d6 });
    const wallL = new THREE.Mesh(wallGeom, wallMat);
    const wallR = new THREE.Mesh(wallGeom, wallMat);
    // Walls sit above the terrain at x=center; we'll keep them simple
    wallL.position.set(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07, -LANE_HALF - 25);
    wallR.position.set(TRACK_LENGTH / 2, -TRACK_LENGTH * 0.07, LANE_HALF + 25);
    scene.add(wallL);
    scene.add(wallR);

    // ── Ramps (visible blue chevrons on the track) ──
    for (const r of RAMPS) {
      const rampGeom = new THREE.BoxGeometry(r.halfWidth * 2, 4, LANE_HALF * 1.6);
      const rampMat = new THREE.MeshLambertMaterial({ color: 0x60a5fa });
      const rampMesh = new THREE.Mesh(rampGeom, rampMat);
      rampMesh.position.set(r.x, terrainHeight(r.x) + 4, 0);
      scene.add(rampMesh);
      // Chevron stripe
      const stripeGeom = new THREE.BoxGeometry(20, 2, LANE_HALF * 1.6);
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
      const stripe = new THREE.Mesh(stripeGeom, stripeMat);
      stripe.position.set(r.x, terrainHeight(r.x) + 6, 0);
      scene.add(stripe);
    }

    // ── Obstacles ──
    for (const o of OBSTACLES) {
      const ty = terrainHeight(o.x);
      let mesh: THREE.Object3D;
      if (o.type === 'tree') {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(6, 8, 30, 8),
          new THREE.MeshLambertMaterial({ color: 0x6b3410 })
        );
        trunk.position.y = 15;
        const leaves = new THREE.Mesh(
          new THREE.ConeGeometry(30, 70, 8),
          new THREE.MeshLambertMaterial({ color: 0x166534 })
        );
        leaves.position.y = 50;
        const group = new THREE.Group();
        group.add(trunk);
        group.add(leaves);
        mesh = group;
      } else {
        mesh = new THREE.Mesh(
          new THREE.DodecahedronGeometry(20, 0),
          new THREE.MeshLambertMaterial({ color: 0x6b7280 })
        );
        mesh.position.y = 10;
      }
      mesh.position.x = o.x;
      mesh.position.z = o.z;
      mesh.position.y += ty;
      scene.add(mesh);
    }

    // ── Decorative trees outside the track ──
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * TRACK_LENGTH;
      const side = Math.random() < 0.5 ? -1 : 1;
      const z = side * (LANE_HALF + 80 + Math.random() * 200);
      const ty = terrainHeight(x);
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 7, 24, 6),
        new THREE.MeshLambertMaterial({ color: 0x6b3410 })
      );
      trunk.position.set(x, ty + 12, z);
      scene.add(trunk);
      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(22, 55, 6),
        new THREE.MeshLambertMaterial({ color: 0x14532d })
      );
      leaves.position.set(x, ty + 45, z);
      scene.add(leaves);
    }

    // ── Pickup meshes (turbo crates) ──
    const pickupMeshes = new Map<string, THREE.Mesh>();
    for (const p of PICKUPS) {
      const ty = terrainHeight(p.x);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(24, 24, 24),
        new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0x991b1b, emissiveIntensity: 0.5 })
      );
      m.position.set(p.x, ty + 30, p.z);
      scene.add(m);
      pickupMeshes.set(p.id, m);
    }

    // ── Finish line gate ──
    const fy = terrainHeight(FINISH_X);
    const gatePost = new THREE.BoxGeometry(8, 200, 8);
    const gateMat = new THREE.MeshLambertMaterial({ color: 0xfde047 });
    const postL = new THREE.Mesh(gatePost, gateMat);
    postL.position.set(FINISH_X, fy + 100, -LANE_HALF);
    scene.add(postL);
    const postR = new THREE.Mesh(gatePost, gateMat);
    postR.position.set(FINISH_X, fy + 100, LANE_HALF);
    scene.add(postR);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(8, 30, LANE_HALF * 2),
      new THREE.MeshLambertMaterial({ color: 0x000000 })
    );
    banner.position.set(FINISH_X, fy + 180, 0);
    scene.add(banner);
    // Checkered banner pattern: a few yellow squares
    for (let i = -5; i <= 5; i++) {
      if (i % 2 === 0) continue;
      const sq = new THREE.Mesh(
        new THREE.BoxGeometry(9, 14, 38),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      sq.position.set(FINISH_X, fy + 180, i * 40);
      scene.add(sq);
    }

    sceneStateRef.current = {
      renderer, scene, camera,
      cartMeshes: new Map(),
      pickupMeshes,
      boostFlames: new Map(),
      animId: 0,
    };

    // Animation loop
    const animate = () => {
      const state = sceneStateRef.current;
      if (!state) return;
      drawFrame();
      state.animId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      const state = sceneStateRef.current;
      if (!state) return;
      cancelAnimationFrame(state.animId);
      state.renderer.dispose();
      if (mountRef.current && state.renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(state.renderer.domElement);
      }
      // Dispose geometries/materials
      state.scene.traverse(obj => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const m = obj as any;
        if (m.geometry?.dispose) m.geometry.dispose();
        if (m.material?.dispose) m.material.dispose();
      });
      sceneStateRef.current = null;
    };
  }, []);

  // ── Build/update cart meshes from room state ──────────────────────────────

  const ensureCartMesh = useCallback((id: string, color: number): THREE.Group => {
    const state = sceneStateRef.current;
    if (!state) throw new Error('scene not ready');
    let group = state.cartMeshes.get(id);
    if (group) return group;
    group = new THREE.Group();

    // Basket (the cart body)
    const basketMat = new THREE.MeshLambertMaterial({ color });
    const basket = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 28), basketMat);
    basket.position.y = 20;
    group.add(basket);

    // Wire mesh inside (suggested with white wireframe overlay)
    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(41, 31, 29),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.4 })
    );
    wire.position.y = 20;
    group.add(wire);

    // Handle (back, going up)
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 22),
      new THREE.MeshLambertMaterial({ color: 0x1f2937 })
    );
    handle.position.set(-20, 30, 0);
    handle.rotation.z = -0.35;
    group.add(handle);
    const handleBar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 24),
      new THREE.MeshLambertMaterial({ color: 0x1f2937 })
    );
    handleBar.position.set(-28, 40, 0);
    handleBar.rotation.x = Math.PI / 2;
    group.add(handleBar);

    // Wheels (4)
    const wheelGeom = new THREE.CylinderGeometry(6, 6, 4, 12);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
    for (const [x, z] of [[14, 12], [14, -12], [-14, 12], [-14, -12]]) {
      const w = new THREE.Mesh(wheelGeom, wheelMat);
      w.rotation.x = Math.PI / 2;
      w.position.set(x, 6, z);
      group.add(w);
    }

    // Avatar sprite (canvas texture)
    const avCanvas = document.createElement('canvas');
    avCanvas.width = 64; avCanvas.height = 64;
    const ctx = avCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, 64, 64);
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎮', 32, 50);
    const tex = new THREE.CanvasTexture(avCanvas);
    const avMat = new THREE.SpriteMaterial({ map: tex });
    const avSprite = new THREE.Sprite(avMat);
    avSprite.scale.set(20, 20, 1);
    avSprite.position.y = 50;
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
    if (!tex || !tex.image) return;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Avatar emoji
    ctx.font = '40px serif';
    ctx.textAlign = 'center';
    ctx.fillText(avatar, 32, 36);
    // Name pill
    ctx.fillStyle = isMe ? 'rgba(124,58,237,0.85)' : 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 44, 64, 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText((isMe ? 'YOU' : username).slice(0, 8), 32, 58);
    tex.needsUpdate = true;
  }, []);

  // ── Server sync ────────────────────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = getSocket() as any;
    const myId = getSocket().id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onState = (data: { t: number; carts: any[] }) => {
      const map = new Map<string, RemoteCart>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of data.carts as any[]) {
        map.set(c.id, c as RemoteCart);
        if (c.id === myId) ownServerRef.current = c;
      }
      snapshotsRef.current.push({ t: data.t, clientT: Date.now(), carts: map });
      if (snapshotsRef.current.length > 5) snapshotsRef.current.shift();
    };

    const onFinish = (data: { id: string; rank: number; points: number }) => {
      if (data.id === myId) finishMsgRef.current = `🏁 You finished #${data.rank}! +${data.points}`;
    };

    socket.on('cart:state', onState);
    socket.on('cart:finished', onFinish);
    return () => {
      socket.off('cart:state', onState);
      socket.off('cart:finished', onFinish);
    };
  }, []);

  // ── Input ──────────────────────────────────────────────────────────────────

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

  // ── Get interpolated remote cart ──────────────────────────────────────────

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

  // ── Per-frame draw ─────────────────────────────────────────────────────────

  const drawFrame = useCallback(() => {
    const state = sceneStateRef.current;
    if (!state) return;
    const { renderer, scene, camera, cartMeshes, pickupMeshes } = state;
    const room = useGameStore.getState().room;
    const myId = getSocket().id;
    const now = performance.now();

    // Animate pickups (bob + rotate)
    for (const m of pickupMeshes.values()) {
      m.rotation.y = now / 500;
      m.position.y = m.userData.baseY ?? m.position.y;
      if (m.userData.baseY === undefined) m.userData.baseY = m.position.y;
      m.position.y = m.userData.baseY + Math.sin(now / 250) * 3;
    }

    // Update cart positions from interp/own
    const lastSnap = snapshotsRef.current[snapshotsRef.current.length - 1];
    const seen = new Set<string>();
    if (lastSnap) for (const id of lastSnap.carts.keys()) seen.add(id);

    // Remove meshes for players who left
    for (const [id, group] of cartMeshes) {
      if (!seen.has(id)) {
        scene.remove(group);
        cartMeshes.delete(id);
      }
    }

    for (const id of seen) {
      const cart = id === myId ? lastSnap!.carts.get(id)! : getInterp(id)!;
      if (!cart) continue;
      const pl = room?.players.find(pp => pp.socketId === id);
      const colorHex = pl ? new THREE.Color(pl.color).getHex() : 0x7c3aed;
      const group = ensureCartMesh(id, colorHex);
      // Apply terrain height.
      // Physics y=0 means on terrain, y<0 means ABOVE terrain (jump impulse is negative).
      // Visual position: terrain_y MINUS cart.y so negative cart.y lifts the cart up.
      const ty = terrainHeight(cart.x);
      group.position.set(cart.x, ty - cart.y + 2, cart.z);
      // Tilt nose down on downhill terrain (slope is negative going downhill,
      // rotation.z negative tilts +X axis downward in Three.js right-hand coords).
      const dx = 30;
      const slope = (terrainHeight(cart.x + dx) - terrainHeight(cart.x - dx)) / (dx * 2);
      group.rotation.z = slope;
      group.rotation.x = 0;
      // Body color tint when boosting
      const basket = group.children[0] as THREE.Mesh;
      const basketMat = basket.material as THREE.MeshLambertMaterial;
      if (cart.bs) {
        basketMat.emissive.setHex(0xfb923c);
        basketMat.emissiveIntensity = 0.4;
      } else if (cart.sp) {
        basketMat.emissive.setHex(0xfde047);
        basketMat.emissiveIntensity = 0.6;
      } else {
        basketMat.emissive.setHex(0x000000);
        basketMat.emissiveIntensity = 0;
      }
      // Update avatar label
      if (pl) updateAvatarSprite(group, pl.avatar, pl.username, id === myId);
    }

    // Camera follows local player
    // Delta-time for frame-rate-independent smoothing
    const dt = lastFrameTimeRef.current > 0
      ? Math.min((now - lastFrameTimeRef.current) / 1000, 0.05)
      : 1 / 60;
    lastFrameTimeRef.current = now;

    const own = ownServerRef.current;
    if (own) {
      // Predict cart X position forward between 20Hz server ticks using velocity.
      // This eliminates the discrete "jump" every 50ms and makes the camera silky smooth.
      const snap = snapshotsRef.current[snapshotsRef.current.length - 1];
      const msSinceSnap = snap ? Math.min(Date.now() - snap.clientT, 80) : 0;
      const predX = own.x + (own.vx * msSinceSnap) / 1000;

      // Actual cart visual height (ty - own.y lifts cart upward when own.y is negative = airborne)
      const ty = terrainHeight(predX);
      const cartVisY = ty - own.y;

      // Camera sits 160 units behind and 100 units above the cart, partially follows lateral
      const targetCamX = predX - 160;
      const targetCamY = cartVisY + 100;
      const targetCamZ = own.z * 0.5;

      // kXZ fast (~11%/frame @60fps), kY slower (~5%/frame) so vertical is still stable
      const kXZ = 1 - Math.exp(-7 * dt);
      const kY  = 1 - Math.exp(-3 * dt);

      camera.position.x += (targetCamX - camera.position.x) * kXZ;
      camera.position.y += (targetCamY - camera.position.y) * kY;
      camera.position.z += (targetCamZ - camera.position.z) * kXZ;

      // lookAt target: 160 units ahead of cart at cart's actual height
      const sm = smoothLookRef.current;
      sm.x += (predX + 160 - sm.x) * kXZ;
      sm.y += (cartVisY + 20 - sm.y) * kY;
      sm.z += (own.z * 0.7 - sm.z) * kXZ;
      camera.lookAt(sm.x, sm.y, sm.z);
    }

    renderer.render(scene, camera);
  }, [ensureCartMesh, getInterp, updateAvatarSprite]);

  // Plug drawFrame into the animation loop (the loop just calls drawFrame())
  // We achieve this by having the setup useEffect call drawFrame() from
  // sceneStateRef directly — but drawFrame is a stable callback, so this works.
  // (The setup effect calls a local animate() which calls drawFrame via closure.)

  // ── HUD overlay (2D canvas on top) ─────────────────────────────────────────

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
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(10, 10, 200, 56);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(`${Math.round(own.vx)} km/h`, 18, 32);
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(own.bs ? '🚀 TURBO!' : own.sp ? '🍌 SPIN OUT!' : 'W gas • A/D steer • SPACE jump', 18, 52);

        // Progress bar
        const progress = Math.min(1, own.x / FINISH_X);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(CANVAS_W / 2 - 160, CANVAS_H - 30, 320, 16);
        ctx.fillStyle = own.bs ? '#fb923c' : '#10b981';
        ctx.fillRect(CANVAS_W / 2 - 158, CANVAS_H - 28, 316 * progress, 12);
        ctx.fillStyle = '#fff';
        ctx.font = '14px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🏁', CANVAS_W / 2 + 154, CANVAS_H - 17);
        ctx.textAlign = 'left';
      }

      if (finishMsgRef.current) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(CANVAS_W / 2 - 200, CANVAS_H / 2 - 30, 400, 60);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(finishMsgRef.current, CANVAS_W / 2, CANVAS_H / 2 + 8);
        ctx.textAlign = 'left';
      }

      id = requestAnimationFrame(draw);
    };
    id = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white/60 text-xs text-center mb-1 px-2">
        W = gas • S = brake • A/D = steer • SPACE = jump • Dodge trees, hit ramps & 🚀 turbo crates!
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
      <div className="flex gap-3 mt-2 lg:hidden flex-wrap justify-center">
        <button
          className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl"
          onPointerDown={() => { inputRef.current.left = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.left = false; sendInput('cart_input', inputRef.current); }}
        >◀</button>
        <button
          className="w-14 h-14 rounded-xl bg-green-500/40 border border-green-500/60 text-white font-bold"
          onPointerDown={() => { inputRef.current.accel = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.accel = false; sendInput('cart_input', inputRef.current); }}
        >GAS</button>
        <button
          className="w-16 h-14 rounded-xl bg-brand-purple/40 border border-brand-purple/60 text-white font-bold"
          onPointerDown={() => sendInput('cart_jump', {})}
        >JUMP</button>
        <button
          className="w-14 h-14 rounded-xl bg-red-500/40 border border-red-500/60 text-white"
          onPointerDown={() => { inputRef.current.brake = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.brake = false; sendInput('cart_input', inputRef.current); }}
        >BRAKE</button>
        <button
          className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl"
          onPointerDown={() => { inputRef.current.right = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.right = false; sendInput('cart_input', inputRef.current); }}
        >▶</button>
      </div>
    </div>
  );
}
