'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';
import { arena_punch, arena_punchHit, arena_ko, arena_dash } from '@/hooks/useGameSounds';

// ── Constants (must match backend) ────────────────────────────────────────────

const ARENA_W = 1000;
const ARENA_H = 700;
const PLATFORMS = [
  { x: 100, y: 150, w: 800, h: 400 },
  { x: 20, y: 70, w: 160, h: 60 },
  { x: 820, y: 70, w: 160, h: 60 },
  { x: 20, y: 570, w: 160, h: 60 },
  { x: 820, y: 570, w: 160, h: 60 },
];
const PLAYER_R = 22;
const CANVAS_W = 900;
const CANVAS_H = 630;
const PLAYER_ACCEL = 1800;
const PLAYER_MAX_SPEED = 280;
const FRICTION = 6.0;

const INPUT_HZ = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RemotePlayer {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  f: number;          // facing radians
  lv: number;         // lives
  ko: number;         // kos
  al: number;         // alive flag
  el: number;         // eliminated flag
  ds: number;         // dashing
  iv: number;         // invulnerable
  fs: number;         // falling time remaining (ms)
}

interface Snapshot { t: number; players: Map<string, RemotePlayer> }

// ── Component ─────────────────────────────────────────────────────────────────

export default function KnockbackArena() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { sendInput } = useSocketActions();

  // Local prediction state for own player
  const localRef = useRef({
    x: 500, y: 350, vx: 0, vy: 0, facing: 0,
    dashUntil: 0, lastServerCorrection: 0,
  });

  // Snapshots from server (we interpolate between the most recent two for remotes)
  const snapshotsRef = useRef<Snapshot[]>([]);
  // Authoritative state for own player (overwritten each broadcast)
  const ownServerRef = useRef<RemotePlayer | null>(null);

  // Visual effects
  const punchVfxRef = useRef<Array<{ id: string; facing: number; at: number }>>([]);
  const dashVfxRef = useRef<Array<{ id: string; at: number; trail: Array<{ x: number; y: number }> }>>([]);
  const koVfxRef = useRef<Array<{ id: string; at: number }>>([]);

  // Input state
  const inputRef = useRef({ left: false, right: false, up: false, down: false });
  const lastInputSentRef = useRef({ mx: 0, my: 0, time: 0 });

  const animRef = useRef(0);
  const lastTimeRef = useRef(0);

  // ── Server listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = getSocket() as any;
    const myId = getSocket().id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onState = (data: { t: number; players: any[] }) => {
      const map = new Map<string, RemotePlayer>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of data.players as any[]) {
        map.set(p.id, p as RemotePlayer);
        if (p.id === myId) {
          ownServerRef.current = p;
          // Update local prediction with server position (reconciliation)
          const local = localRef.current;
          const dx = p.x - local.x;
          const dy = p.y - local.y;
          // If divergence is large, snap. Otherwise lerp gradually.
          const dist = Math.hypot(dx, dy);
          if (dist > 80) {
            local.x = p.x; local.y = p.y;
            local.vx = p.vx; local.vy = p.vy;
          }
          local.lastServerCorrection = performance.now();
        }
      }
      const snap = { t: data.t, players: map };
      snapshotsRef.current.push(snap);
      // Keep only the last 5 snapshots
      if (snapshotsRef.current.length > 5) snapshotsRef.current.shift();
    };

    const _myId = getSocket().id;
    const onPunch = (data: { id: string; facing: number; hits: string[] }) => {
      punchVfxRef.current.push({ id: data.id, facing: data.facing, at: performance.now() });
      const hitMe = data.hits.includes(_myId ?? '');
      if (data.hits.length > 0) { arena_punchHit(); } else { arena_punch(); }
      for (const h of data.hits) {
        koVfxRef.current.push({ id: h + '_hit', at: performance.now() });
        if (hitMe) { /* already played punchHit */ }
      }
    };
    const onDash = (data: { id: string }) => {
      dashVfxRef.current.push({ id: data.id, at: performance.now(), trail: [] });
      if (data.id === _myId) arena_dash();
    };
    const onKO = (data: { id: string; killer: string | null; livesLeft: number }) => {
      koVfxRef.current.push({ id: data.id, at: performance.now() });
      arena_ko();
    };

    socket.on('arena:state', onState);
    socket.on('arena:punch', onPunch);
    socket.on('arena:dash', onDash);
    socket.on('arena:ko', onKO);
    return () => {
      socket.off('arena:state', onState);
      socket.off('arena:punch', onPunch);
      socket.off('arena:dash', onDash);
      socket.off('arena:ko', onKO);
    };
  }, []);

  // ── Input handlers ─────────────────────────────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') inputRef.current.left = true;
      if (k === 'arrowright' || k === 'd') inputRef.current.right = true;
      if (k === 'arrowup' || k === 'w') inputRef.current.up = true;
      if (k === 'arrowdown' || k === 's') inputRef.current.down = true;
      if (k === ' ' || k === 'enter') { e.preventDefault(); sendInput('arena_punch', {}); }
      if (k === 'shift') { e.preventDefault(); sendInput('arena_dash', {}); }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') inputRef.current.left = false;
      if (k === 'arrowright' || k === 'd') inputRef.current.right = false;
      if (k === 'arrowup' || k === 'w') inputRef.current.up = false;
      if (k === 'arrowdown' || k === 's') inputRef.current.down = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [sendInput]);

  // ── Update (local prediction) ──────────────────────────────────────────────

  const update = useCallback((dt: number) => {
    const local = localRef.current;
    const i = inputRef.current;
    const myServer = ownServerRef.current;
    if (myServer && myServer.el) return; // eliminated — no movement
    if (myServer && !myServer.al) return; // dead, waiting for respawn

    const mx = (i.right ? 1 : 0) + (i.left ? -1 : 0);
    const my = (i.down ? 1 : 0) + (i.up ? -1 : 0);
    const mag = Math.hypot(mx, my);
    if (mag > 0.05) {
      const nx = mx / mag, ny = my / mag;
      local.vx += nx * PLAYER_ACCEL * dt;
      local.vy += ny * PLAYER_ACCEL * dt;
      local.facing = Math.atan2(ny, nx);
    }
    const damp = Math.exp(-FRICTION * dt);
    local.vx *= damp;
    local.vy *= damp;
    const sp = Math.hypot(local.vx, local.vy);
    if (sp > PLAYER_MAX_SPEED && mag > 0.05) {
      const align = (local.vx * mx + local.vy * my) / (sp * mag);
      if (align > 0.5) {
        const k = PLAYER_MAX_SPEED / sp;
        local.vx *= k;
        local.vy *= k;
      }
    }
    local.x += local.vx * dt;
    local.y += local.vy * dt;

    // Send input state at INPUT_HZ
    const now = performance.now();
    if (now - lastInputSentRef.current.time > 1000 / INPUT_HZ ||
        mx !== lastInputSentRef.current.mx || my !== lastInputSentRef.current.my) {
      sendInput('arena_input', { mx, my });
      lastInputSentRef.current = { mx, my, time: now };
    }

    // Lerp local toward server position (continuous reconciliation)
    if (myServer) {
      const lerpRate = 4; // higher = snap faster to server
      const dx = myServer.x - local.x;
      const dy = myServer.y - local.y;
      local.x += dx * Math.min(1, dt * lerpRate);
      local.y += dy * Math.min(1, dt * lerpRate);
    }
  }, [sendInput]);

  // ── Get interpolated remote player position ────────────────────────────────

  const getInterpolated = useCallback((id: string): RemotePlayer | null => {
    const snaps = snapshotsRef.current;
    if (snaps.length === 0) return null;
    // Interpolate between snapshot[n-2] and snapshot[n-1] with 100ms render delay
    const renderTime = Date.now() - 100;
    let a: Snapshot | null = null;
    let b: Snapshot | null = null;
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].t <= renderTime) { a = snaps[i]; b = snaps[i + 1] || null; break; }
    }
    if (!a) a = snaps[0];
    const pa = a.players.get(id);
    if (!pa) return null;
    if (!b) return pa;
    const pb = b.players.get(id);
    if (!pb) return pa;
    const span = b.t - a.t;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - a.t) / span)) : 1;
    return {
      ...pb,
      x: pa.x + (pb.x - pa.x) * t,
      y: pa.y + (pb.y - pa.y) * t,
      f: pa.f + (pb.f - pa.f) * t,
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // RESET state
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Camera: scale arena to canvas
    const sx = CANVAS_W / ARENA_W;
    const sy = CANVAS_H / ARENA_H;
    const s = Math.min(sx, sy);
    const ox = (CANVAS_W - ARENA_W * s) / 2;
    const oy = (CANVAS_H - ARENA_H * s) / 2;
    ctx.setTransform(s, 0, 0, s, ox, oy);

    const now = performance.now();

    // Background — starfield void
    ctx.fillStyle = '#0b1024';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 60; i++) {
      const seed = i * 37;
      const x = (seed * 13) % ARENA_W;
      const y = (seed * 7) % ARENA_H;
      const tw = ((now / 30 + seed) % 200) / 200;
      ctx.globalAlpha = 0.2 + tw * 0.4;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;

    // Platforms — drawn as floating stone slabs
    for (const plat of PLATFORMS) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(plat.x + 6, plat.y + 6, plat.w, plat.h);
      // Slab
      ctx.fillStyle = '#475569';
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      // Top highlight
      ctx.fillStyle = '#64748b';
      ctx.fillRect(plat.x, plat.y, plat.w, 8);
      // Edge accent
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(plat.x, plat.y + plat.h - 6, plat.w, 6);
      // Border
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
      // Cracks (decorative)
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < Math.floor(plat.w / 60); i++) {
        const cx = plat.x + 30 + i * 60;
        ctx.beginPath();
        ctx.moveTo(cx, plat.y + 12);
        ctx.lineTo(cx + 4, plat.y + plat.h - 10);
        ctx.stroke();
      }
    }

    const room = useGameStore.getState().room;
    const myId = getSocket().id;

    // ── Draw all players (interpolated for remotes, predicted for local) ──
    const allIds = new Set<string>();
    const lastSnap = snapshotsRef.current[snapshotsRef.current.length - 1];
    if (lastSnap) for (const id of lastSnap.players.keys()) allIds.add(id);

    for (const id of allIds) {
      const isMe = id === myId;
      // Find the player record (use the most-recent snapshot for live data)
      const serverP = lastSnap?.players.get(id);
      if (!serverP) continue;
      if (serverP.el) continue; // eliminated — don't draw

      let drawX: number, drawY: number;
      if (isMe) {
        drawX = localRef.current.x;
        drawY = localRef.current.y;
      } else {
        const interp = getInterpolated(id);
        if (!interp) continue;
        drawX = interp.x;
        drawY = interp.y;
      }

      const pl = room?.players.find(pp => pp.socketId === id);
      const color = pl?.color ?? '#7c3aed';

      // Falling / dead — draw shrinking ghost
      if (!serverP.al) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(drawX, drawY, PLAYER_R * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }

      // Falling blink
      const blinking = serverP.fs > 0 && Math.floor(now / 100) % 2 === 0;

      // Body shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(drawX, drawY + PLAYER_R - 2, PLAYER_R * 0.85, PLAYER_R * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = serverP.iv ? 'rgba(255,255,255,0.7)' : color;
      if (blinking) ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(drawX, drawY, PLAYER_R, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = isMe ? '#fff' : '#0a1024';
      ctx.lineWidth = isMe ? 3 : 2;
      ctx.stroke();

      // Extra glow ring for local player
      if (isMe) {
        const glowPulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + glowPulse * 0.45})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(drawX, drawY, PLAYER_R + 5 + glowPulse * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Facing indicator (small spike)
      const fx = drawX + Math.cos(serverP.f) * (PLAYER_R + 6);
      const fy = drawY + Math.sin(serverP.f) * (PLAYER_R + 6);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Dash trail
      if (serverP.ds) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        for (let i = 1; i <= 4; i++) {
          const tx = drawX - Math.cos(serverP.f) * i * 8;
          const ty = drawY - Math.sin(serverP.f) * i * 8;
          ctx.beginPath();
          ctx.arc(tx, ty, PLAYER_R - i * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Avatar emoji
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.fillText(pl?.avatar ?? '🎮', drawX, drawY + 8);

      // Name tag
      const nameStr = ((isMe ? 'YOU ▼' : pl?.username) ?? '?').slice(0, 10);
      ctx.font = `bold ${isMe ? 12 : 11}px sans-serif`;
      const nameW = ctx.measureText(nameStr).width + 10;
      ctx.fillStyle = isMe ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect: (x:number, y:number, w:number, h:number, r:number) => void })
        .roundRect?.(drawX - nameW / 2, drawY - PLAYER_R - 26, nameW, 16, 4) ??
        ctx.fillRect(drawX - nameW / 2, drawY - PLAYER_R - 26, nameW, 16);
      ctx.fill();
      ctx.fillStyle = isMe ? '#ffffffee' : '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(nameStr, drawX, drawY - PLAYER_R - 14);

      // Lives pips
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < serverP.lv ? '#ef4444' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(drawX - 12 + i * 12, drawY - PLAYER_R - 32, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'left';
    }

    // ── Punch VFX ──
    punchVfxRef.current = punchVfxRef.current.filter(v => now - v.at < 250);
    for (const v of punchVfxRef.current) {
      const age = (now - v.at) / 250;
      const p = lastSnap?.players.get(v.id);
      if (!p) continue;
      const cx = v.id === myId ? localRef.current.x : (getInterpolated(v.id)?.x ?? p.x);
      const cy = v.id === myId ? localRef.current.y : (getInterpolated(v.id)?.y ?? p.y);
      ctx.fillStyle = `rgba(252,211,77,${1 - age})`;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(v.facing) * 35,
        cy + Math.sin(v.facing) * 35,
        25 + age * 25, 0, Math.PI * 2
      );
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.8 - age * 0.8})`;
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💥',
        cx + Math.cos(v.facing) * 40,
        cy + Math.sin(v.facing) * 40 + 8
      );
      ctx.textAlign = 'left';
    }

    // ── KO VFX (red flash) ──
    koVfxRef.current = koVfxRef.current.filter(v => now - v.at < 600);
    for (const v of koVfxRef.current) {
      const age = (now - v.at) / 600;
      const cleanId = v.id.replace('_hit', '');
      const p = lastSnap?.players.get(cleanId);
      if (!p) continue;
      const cx = cleanId === myId ? localRef.current.x : (getInterpolated(cleanId)?.x ?? p.x);
      const cy = cleanId === myId ? localRef.current.y : (getInterpolated(cleanId)?.y ?? p.y);
      ctx.strokeStyle = `rgba(239,68,68,${1 - age})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, PLAYER_R + age * 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Reset transform for HUD
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // HUD: cooldown indicators
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(10, 10, 200, 50);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('SPACE — Punch', 18, 28);
    ctx.fillText('SHIFT — Dash', 18, 48);

    // Leaderboard top-right
    const me = ownServerRef.current;
    if (me) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(CANVAS_W - 170, 10, 160, 50);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`KOs: ${me.ko}`, CANVAS_W - 160, 28);
      ctx.fillText(`Lives: ${'❤️'.repeat(me.lv)}`, CANVAS_W - 160, 48);
    }
  }, [getInterpolated]);

  // ── Game loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const loop = (time: number) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.04) : 0.016;
      lastTimeRef.current = time;
      update(dt);
      render();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [update, render]);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white/60 text-xs text-center mb-1 px-2">
        WASD / arrows to move • SPACE to punch • SHIFT to dash • Knock everyone off!
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="rounded-xl border border-white/10 bg-black"
        style={{ maxWidth: '100%', touchAction: 'none', imageRendering: 'pixelated' }}
      />

      {/* Mobile controls */}
      <div className="flex gap-3 mt-2 lg:hidden flex-wrap justify-center">
        <div className="grid grid-cols-3 gap-1">
          <div />
          <button
            className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 text-white"
            onPointerDown={() => { inputRef.current.up = true; }}
            onPointerUp={() => { inputRef.current.up = false; }}
            onPointerCancel={() => { inputRef.current.up = false; }}
          >▲</button>
          <div />
          <button
            className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 text-white"
            onPointerDown={() => { inputRef.current.left = true; }}
            onPointerUp={() => { inputRef.current.left = false; }}
            onPointerCancel={() => { inputRef.current.left = false; }}
          >◀</button>
          <button
            className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 text-white"
            onPointerDown={() => { inputRef.current.down = true; }}
            onPointerUp={() => { inputRef.current.down = false; }}
            onPointerCancel={() => { inputRef.current.down = false; }}
          >▼</button>
          <button
            className="w-12 h-12 rounded-lg bg-white/10 border border-white/20 text-white"
            onPointerDown={() => { inputRef.current.right = true; }}
            onPointerUp={() => { inputRef.current.right = false; }}
            onPointerCancel={() => { inputRef.current.right = false; }}
          >▶</button>
        </div>
        <div className="flex gap-2">
          <button
            className="w-20 h-12 rounded-lg bg-red-500/40 border border-red-500/60 text-white font-bold"
            onPointerDown={() => sendInput('arena_punch', {})}
          >PUNCH</button>
          <button
            className="w-20 h-12 rounded-lg bg-cyan-500/40 border border-cyan-500/60 text-white font-bold"
            onPointerDown={() => sendInput('arena_dash', {})}
          >DASH</button>
        </div>
      </div>
    </div>
  );
}
