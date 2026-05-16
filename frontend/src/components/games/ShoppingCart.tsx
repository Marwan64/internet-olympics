'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';

// ── Constants (must match backend) ────────────────────────────────────────────

const TRACK_WIDTH = 6000;
const GROUND_BASE = 480;
const FINISH_X = 5800;
const CART_W = 56;
const CART_H = 40;
const CANVAS_W = 900;
const CANVAS_H = 600;
const INPUT_HZ = 20;

function groundAt(x: number): number {
  if (x < 0) return GROUND_BASE;
  if (x > TRACK_WIDTH) return GROUND_BASE;
  let y = GROUND_BASE;
  y += Math.sin(x / 90) * 14;
  y += Math.cos(x / 240) * 28;
  if (x > 1400 && x < 1700) y -= (x - 1400) * 0.35;
  if (x >= 1700 && x < 1900) y -= 105 - (x - 1700) * 0.55;
  if (x > 2400 && x < 2800) y += Math.sin(((x - 2400) / 400) * Math.PI) * 70;
  if (x > 3300 && x < 3700) y += Math.sin(x / 30) * 18;
  if (x > 4200 && x < 4500) y -= (x - 4200) * 0.3;
  if (x >= 4500 && x < 4700) y -= 90 - (x - 4500) * 0.45;
  return y;
}

interface RemoteCart {
  id: string; x: number; y: number; a: number; vx: number;
  bs: number; sp: number; fn: number;
}
interface Item { id: string; x: number; t: 'turbo' | 'banana'; a: number }
interface Snapshot { t: number; carts: Map<string, RemoteCart>; items: Item[] }

export default function ShoppingCart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { sendInput } = useSocketActions();

  const snapshotsRef = useRef<Snapshot[]>([]);
  const ownServerRef = useRef<RemoteCart | null>(null);
  const itemsRef = useRef<Item[]>([]);

  const turboVfxRef = useRef<Array<{ id: string; at: number }>>([]);
  const bananaVfxRef = useRef<Array<{ id: string; at: number }>>([]);
  const finishMsgRef = useRef('');

  const inputRef = useRef({ left: false, right: false, brake: false });
  const lastInputSentRef = useRef({ left: false, right: false, brake: false, time: 0 });

  const animRef = useRef(0);
  const lastTimeRef = useRef(0);
  const camXRef = useRef(0);

  // ── Server sync ────────────────────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = getSocket() as any;
    const myId = useGameStore.getState().playerId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onState = (data: { t: number; carts: any[]; items: any[] }) => {
      const map = new Map<string, RemoteCart>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of data.carts as any[]) {
        map.set(c.id, c as RemoteCart);
        if (c.id === myId) ownServerRef.current = c;
      }
      itemsRef.current = data.items as Item[];
      snapshotsRef.current.push({ t: data.t, carts: map, items: data.items as Item[] });
      if (snapshotsRef.current.length > 5) snapshotsRef.current.shift();
    };
    const onTurbo = (data: { id: string }) => {
      turboVfxRef.current.push({ id: data.id, at: performance.now() });
    };
    const onBanana = (data: { id: string }) => {
      bananaVfxRef.current.push({ id: data.id, at: performance.now() });
    };
    const onFinished = (data: { id: string; rank: number; points: number }) => {
      if (data.id === myId) {
        finishMsgRef.current = `🏁 You finished #${data.rank}! +${data.points}`;
      }
    };

    socket.on('cart:state', onState);
    socket.on('cart:turbo', onTurbo);
    socket.on('cart:banana', onBanana);
    socket.on('cart:finished', onFinished);
    return () => {
      socket.off('cart:state', onState);
      socket.off('cart:turbo', onTurbo);
      socket.off('cart:banana', onBanana);
      socket.off('cart:finished', onFinished);
    };
  }, []);

  // ── Input ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const send = () => {
      sendInput('cart_input', {
        left: inputRef.current.left,
        right: inputRef.current.right,
        brake: inputRef.current.brake,
      });
      lastInputSentRef.current = { ...inputRef.current, time: performance.now() };
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let changed = false;
      if ((k === 'arrowright' || k === 'd') && !inputRef.current.right) { inputRef.current.right = true; changed = true; }
      if ((k === 'arrowleft' || k === 'a') && !inputRef.current.left) { inputRef.current.left = true; changed = true; }
      if ((k === 'arrowdown' || k === 's') && !inputRef.current.brake) { inputRef.current.brake = true; changed = true; }
      if (k === ' ' || k === 'arrowup' || k === 'w') { e.preventDefault(); sendInput('cart_jump', {}); }
      if (changed) send();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let changed = false;
      if ((k === 'arrowright' || k === 'd') && inputRef.current.right) { inputRef.current.right = false; changed = true; }
      if ((k === 'arrowleft' || k === 'a') && inputRef.current.left) { inputRef.current.left = false; changed = true; }
      if ((k === 'arrowdown' || k === 's') && inputRef.current.brake) { inputRef.current.brake = false; changed = true; }
      if (changed) send();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    // Keepalive every 1/INPUT_HZ
    const ka = setInterval(send, 1000 / INPUT_HZ);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      clearInterval(ka);
    };
  }, [sendInput]);

  // ── Interpolation ──────────────────────────────────────────────────────────

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
      a: pa.a + (pb.a - pa.a) * tt,
    };
  }, []);

  // ── Drawing helpers ────────────────────────────────────────────────────────

  function drawCart(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, color: string, boosted: boolean, spinning: boolean) {
    ctx.save();
    ctx.translate(cx + CART_W / 2, cy + CART_H / 2);
    ctx.rotate(angle);

    // Shadow on ground (drawn back in world space ideally; here just under cart)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, CART_H / 2 + 4, CART_W / 2 + 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cart basket (the shopping cart wire frame, drawn as a trapezoid + cross hatches)
    // Outer basket trapezoid
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-CART_W / 2 + 6, -CART_H / 2 + 4);
    ctx.lineTo(CART_W / 2 - 2, -CART_H / 2 + 4);
    ctx.lineTo(CART_W / 2 - 8, CART_H / 2 - 8);
    ctx.lineTo(-CART_W / 2 + 12, CART_H / 2 - 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Wire-mesh cross-hatches
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(-CART_W / 2 + 6 + (CART_W - 8) * t, -CART_H / 2 + 4);
      ctx.lineTo(-CART_W / 2 + 12 + (CART_W - 20) * t, CART_H / 2 - 8);
      ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const t = i / 3;
      ctx.beginPath();
      ctx.moveTo(-CART_W / 2 + 6, -CART_H / 2 + 4 + (CART_H - 12) * t);
      ctx.lineTo(CART_W / 2 - 5, -CART_H / 2 + 4 + (CART_H - 12) * t);
      ctx.stroke();
    }

    // Handle (going up-back from rear of cart)
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-CART_W / 2 + 8, CART_H / 2 - 8);
    ctx.lineTo(-CART_W / 2 - 4, -CART_H / 2 - 4);
    ctx.stroke();
    // Handle bar
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-CART_W / 2 - 12, -CART_H / 2 - 4);
    ctx.lineTo(-CART_W / 2 + 4, -CART_H / 2 - 4);
    ctx.stroke();

    // Wheels
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(-CART_W / 2 + 14, CART_H / 2, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(CART_W / 2 - 10, CART_H / 2, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath(); ctx.arc(-CART_W / 2 + 14, CART_H / 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(CART_W / 2 - 10, CART_H / 2, 3, 0, Math.PI * 2); ctx.fill();

    // Spin effect
    if (spinning) {
      ctx.strokeStyle = 'rgba(252,211,77,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, CART_W / 2 + 12, 0, Math.PI * 1.6);
      ctx.stroke();
    }

    // Boost flame trail (drawn in cart space)
    if (boosted) {
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(-CART_W / 2 + 4, 0);
      ctx.lineTo(-CART_W / 2 - 20, -8);
      ctx.lineTo(-CART_W / 2 - 28, 0);
      ctx.lineTo(-CART_W / 2 - 20, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(-CART_W / 2 + 2, 0);
      ctx.lineTo(-CART_W / 2 - 12, -4);
      ctx.lineTo(-CART_W / 2 - 16, 0);
      ctx.lineTo(-CART_W / 2 - 12, 4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawRider(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, avatar: string) {
    ctx.save();
    ctx.translate(cx + CART_W / 2, cy + CART_H / 2);
    ctx.rotate(angle);
    // Little body bobbing on cart
    const bob = Math.sin(performance.now() / 100) * 1;
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.fillText(avatar, 4, -CART_H / 2 - 6 + bob);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Camera follows local cart
    const myId = useGameStore.getState().playerId;
    const own = ownServerRef.current;
    if (own) {
      const targetCamX = own.x - CANVAS_W * 0.3;
      camXRef.current += (targetCamX - camXRef.current) * 0.12;
      camXRef.current = Math.max(0, Math.min(TRACK_WIDTH - CANVAS_W, camXRef.current));
    }
    const cam = camXRef.current;
    const now = performance.now();

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    sky.addColorStop(0, '#fde68a');
    sky.addColorStop(0.5, '#fdba74');
    sky.addColorStop(1, '#fb7185');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Sun
    ctx.fillStyle = 'rgba(254,240,138,0.8)';
    ctx.beginPath(); ctx.arc(CANVAS_W - 80, 90, 50, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(254,240,138,0.4)';
    ctx.beginPath(); ctx.arc(CANVAS_W - 80, 90, 80, 0, Math.PI * 2); ctx.fill();

    // Background hills (parallax)
    ctx.fillStyle = 'rgba(168,85,247,0.5)';
    for (let i = 0; i < 10; i++) {
      const hx = ((i * 500 - cam * 0.3) % 4000 + 4000) % 4000 - 200;
      ctx.beginPath();
      ctx.arc(hx, GROUND_BASE - 50, 200, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(139,92,246,0.7)';
    for (let i = 0; i < 8; i++) {
      const hx = ((i * 700 - cam * 0.5) % 4900 + 4900) % 4900 - 300;
      ctx.beginPath();
      ctx.arc(hx, GROUND_BASE - 20, 280, Math.PI, 0);
      ctx.fill();
    }

    // Ground curve
    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.moveTo(-10, CANVAS_H);
    const step = 8;
    for (let sx = 0; sx < CANVAS_W + step; sx += step) {
      const worldX = sx + cam;
      const y = groundAt(worldX);
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(CANVAS_W + 10, CANVAS_H);
    ctx.closePath();
    ctx.fill();

    // Grass topline
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let sx = 0; sx < CANVAS_W + step; sx += step) {
      const worldX = sx + cam;
      const y = groundAt(worldX);
      if (sx === 0) ctx.moveTo(sx, y);
      else ctx.lineTo(sx, y);
    }
    ctx.stroke();

    // Ground dirt highlights
    ctx.fillStyle = '#1f2937';
    for (let sx = 0; sx < CANVAS_W + 80; sx += 80) {
      const worldX = sx + cam;
      const y = groundAt(worldX);
      ctx.fillRect(sx, y + 30, 6, 3);
    }

    // Items
    for (const it of itemsRef.current) {
      if (!it.a) continue;
      const sx = it.x - cam;
      if (sx < -50 || sx > CANVAS_W + 50) continue;
      const groundY = groundAt(it.x);
      const float = Math.sin(now / 250) * 6;
      const iy = groundY - 50 + float;

      if (it.t === 'turbo') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(sx, iy, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px serif';
        ctx.textAlign = 'center';
        ctx.fillText('🚀', sx, iy + 8);
        ctx.textAlign = 'left';
      } else {
        // Banana
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.ellipse(sx, iy, 16, 8, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Finish line
    const finishSx = FINISH_X - cam;
    if (finishSx > -100 && finishSx < CANVAS_W + 100) {
      const fGround = groundAt(FINISH_X);
      // Pole
      ctx.fillStyle = '#fff';
      ctx.fillRect(finishSx, fGround - 200, 4, 200);
      // Checkered flag (drawn as small grid)
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 6; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#000' : '#fff';
          ctx.fillRect(finishSx + 4 + c * 10, fGround - 200 + r * 12, 10, 12);
        }
      }
      ctx.font = '20px serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('🏁', finishSx - 14, fGround - 210);
    }

    // Carts
    const lastSnap = snapshotsRef.current[snapshotsRef.current.length - 1];
    const room = useGameStore.getState().room;
    const seen = new Set<string>();
    if (lastSnap) for (const id of lastSnap.carts.keys()) seen.add(id);

    // Draw in finish-rank order so leaders are on top
    const sortedIds = [...seen].sort((a, b) => {
      const ca = lastSnap?.carts.get(a)?.x ?? 0;
      const cb = lastSnap?.carts.get(b)?.x ?? 0;
      return ca - cb;
    });

    for (const id of sortedIds) {
      const cart = id === myId ? lastSnap?.carts.get(id) : getInterp(id);
      if (!cart) continue;
      const sx = cart.x - cam;
      if (sx + CART_W < -50 || sx > CANVAS_W + 50) continue;
      const pl = room?.players.find(pp => pp.socketId === id);
      const color = pl?.color ?? '#7c3aed';

      drawCart(ctx, sx, cart.y, cart.a, color, cart.bs === 1, cart.sp === 1);
      if (pl) drawRider(ctx, sx, cart.y, cart.a, pl.avatar);

      // Name label
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx + CART_W / 2 - 30, cart.y - 32, 60, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      const label = id === myId ? 'YOU' : (pl?.username ?? '?').slice(0, 8);
      ctx.fillText(label, sx + CART_W / 2, cart.y - 22);
      if (cart.fn > 0) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 12px serif';
        ctx.fillText(`🏆 #${cart.fn}`, sx + CART_W / 2, cart.y - 38);
      }
      ctx.textAlign = 'left';
    }

    // VFX
    turboVfxRef.current = turboVfxRef.current.filter(v => now - v.at < 600);
    bananaVfxRef.current = bananaVfxRef.current.filter(v => now - v.at < 800);
    for (const v of turboVfxRef.current) {
      const c = lastSnap?.carts.get(v.id);
      if (!c) continue;
      const sx = c.x - cam;
      const age = (now - v.at) / 600;
      ctx.fillStyle = `rgba(252,211,77,${1 - age})`;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚀', sx + CART_W / 2, c.y - 30 - age * 40);
      ctx.textAlign = 'left';
    }
    for (const v of bananaVfxRef.current) {
      const c = lastSnap?.carts.get(v.id);
      if (!c) continue;
      const sx = c.x - cam;
      const age = (now - v.at) / 800;
      ctx.fillStyle = `rgba(245,158,11,${1 - age})`;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍌💫', sx + CART_W / 2, c.y - 20 - age * 30);
      ctx.textAlign = 'left';
    }

    // HUD
    if (own) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(10, 10, 180, 50);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`Speed ${Math.round(Math.abs(own.vx))} px/s`, 18, 28);
      ctx.fillText(own.bs ? '🚀 TURBO' : own.sp ? '🍌 SPIN!' : 'D/Right→  Space=Jump', 18, 48);
    }

    // Progress bar
    const myCart = lastSnap?.carts.get(myId ?? '');
    if (myCart) {
      const progress = Math.min(1, myCart.x / FINISH_X);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(CANVAS_W / 2 - 160, CANVAS_H - 30, 320, 14);
      ctx.fillStyle = myCart.bs ? '#fb923c' : '#7c3aed';
      ctx.fillRect(CANVAS_W / 2 - 158, CANVAS_H - 28, 316 * progress, 10);
      ctx.fillStyle = '#fff';
      ctx.font = '11px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏁', CANVAS_W / 2 + 152, CANVAS_H - 19);
      ctx.textAlign = 'left';
    }

    // Finish message
    if (finishMsgRef.current) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(CANVAS_W / 2 - 200, CANVAS_H / 2 - 30, 400, 60);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(finishMsgRef.current, CANVAS_W / 2, CANVAS_H / 2 + 8);
      ctx.textAlign = 'left';
    }
  }, [getInterp]);

  // ── Loop ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loop = (time: number) => {
      lastTimeRef.current = time;
      render();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white/60 text-xs text-center mb-1 px-2">
        D / → to accelerate • A / ← to reverse • S / ↓ brake • SPACE jump • Grab 🚀 turbos, avoid 🍌 bananas
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="rounded-xl border border-white/10 bg-black"
        style={{ maxWidth: '100%', touchAction: 'none' }}
      />

      {/* Mobile controls */}
      <div className="flex gap-3 mt-2 lg:hidden flex-wrap justify-center">
        <button
          className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl"
          onPointerDown={() => { inputRef.current.left = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.left = false; sendInput('cart_input', inputRef.current); }}
        >◀</button>
        <button
          className="w-16 h-14 rounded-xl bg-brand-purple/40 border border-brand-purple/60 text-white font-bold"
          onPointerDown={() => sendInput('cart_jump', {})}
        >JUMP</button>
        <button
          className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl"
          onPointerDown={() => { inputRef.current.right = true; sendInput('cart_input', inputRef.current); }}
          onPointerUp={() => { inputRef.current.right = false; sendInput('cart_input', inputRef.current); }}
        >▶</button>
      </div>
    </div>
  );
}
