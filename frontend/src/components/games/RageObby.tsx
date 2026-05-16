'use client';

import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';

// ── World constants ──────────────────────────────────────────────────────────────

const CW = 900;   // canvas width
const CH = 500;   // canvas height
const WW = 6200;  // world width
const PW = 24;    // player width
const PH = 36;    // player height
const GY = 420;   // top of standard ground platforms
const KILL_Y = CH + 80;
const FINISH_X = 5860;

const GRAVITY   = 1500;
const JUMP_VEL  = -730;
const WALK_SPD  = 290;
const MAX_FALL  = 900;
const COYOTE_MS = 110;

// ── Level Data ───────────────────────────────────────────────────────────────────

interface Plat {
  x: number; y: number; w: number; h: number;
  type: 'static' | 'moving';
  cx?: number; amp?: number; spd?: number; axis?: 'x' | 'y';
  color?: string;
}
interface Spike  { x: number; y: number; w: number; h: number }
interface CPDef  { id: number; trigX: number; spawnX: number; spawnY: number }

const PLATS: Plat[] = [
  // ── Start island ──
  { x:0,    y:GY,     w:380, h:80, type:'static', color:'#78350f' },

  // ── Section 1: Stepping stones (warmup jumps + one spike) ──
  { x:430,  y:GY,     w:100, h:80,  type:'static', color:'#78350f' },
  { x:590,  y:GY,     w:130, h:80,  type:'static', color:'#78350f' },  // has spike
  { x:780,  y:GY-40,  w:100, h:120, type:'static', color:'#78350f' },  // step up
  { x:940,  y:GY-80,  w:100, h:160, type:'static', color:'#78350f' },  // higher
  { x:1090, y:GY-40,  w:100, h:120, type:'static', color:'#78350f' },  // step down
  { x:1240, y:GY,     w:120, h:80,  type:'static', color:'#78350f' },  // CP1 pad

  // ── Section 2: Moving platforms over pit ──
  { x:1420, y:GY,      w:80,  h:80,  type:'static', color:'#78350f' },  // launch ledge
  { x:0,    y:GY-90,   w:90,  h:18,  type:'moving', cx:1590, amp:88,  spd:0.4,  axis:'x', color:'#15803d' },
  { x:0,    y:GY-140,  w:80,  h:18,  type:'moving', cx:1870, amp:98,  spd:0.5,  axis:'x', color:'#15803d' },
  { x:0,    y:GY-90,   w:90,  h:18,  type:'moving', cx:2100, amp:82,  spd:0.45, axis:'x', color:'#15803d' },
  { x:2220, y:GY,      w:120, h:80,  type:'static', color:'#78350f' },  // CP2 landing

  // ── Section 3: Spike gauntlet ──
  { x:2400, y:GY,  w:780, h:80, type:'static', color:'#78350f' },
  { x:3230, y:GY,  w:110, h:80, type:'static', color:'#78350f' },  // CP3 island

  // ── Section 4: Narrow ledges + elevated combo ──
  { x:3400, y:GY,     w:55,  h:80,  type:'static', color:'#78350f' },
  { x:3520, y:GY,     w:55,  h:80,  type:'static', color:'#78350f' },
  { x:3645, y:GY,     w:55,  h:80,  type:'static', color:'#78350f' },
  { x:3770, y:GY-90,  w:100, h:170, type:'static', color:'#78350f' },
  { x:3930, y:GY-90,  w:100, h:170, type:'static', color:'#78350f' },  // spikes on top
  { x:4090, y:GY-90,  w:100, h:170, type:'static', color:'#78350f' },
  { x:4250, y:GY,     w:120, h:80,  type:'static', color:'#78350f' },  // CP4

  // ── Section 5: Final sprint ──
  { x:4440, y:GY,      w:80,  h:80,  type:'static', color:'#78350f' },
  { x:0,    y:GY-90,   w:80,  h:18,  type:'moving', cx:4650, amp:88,  spd:0.55, axis:'x', color:'#15803d' },
  { x:0,    y:GY-130,  w:70,  h:18,  type:'moving', cx:4920, amp:78,  spd:0.65, axis:'x', color:'#15803d' },
  { x:5160, y:GY,      w:700, h:80,  type:'static', color:'#78350f' },  // final gauntlet

  // ── Finish ──
  { x:FINISH_X, y:GY, w:340, h:80, type:'static', color:'#854d0e' },
];

const SPIKES: Spike[] = [
  { x:622,  y:GY-14, w:26, h:14 },                              // S1 intro spike

  { x:2460, y:GY-14, w:24, h:14 },                              // S3 escalating
  { x:2550, y:GY-14, w:24, h:14 },
  { x:2640, y:GY-14, w:24, h:14 },
  { x:2730, y:GY-14, w:24, h:14 }, { x:2764, y:GY-14, w:24, h:14 },
  { x:2856, y:GY-14, w:24, h:14 },
  { x:2896, y:GY-14, w:24, h:14 },
  { x:2936, y:GY-14, w:24, h:14 },
  { x:2992, y:GY-14, w:24, h:14 }, { x:3030, y:GY-14, w:24, h:14 }, { x:3068, y:GY-14, w:24, h:14 },
  { x:3120, y:GY-14, w:24, h:14 },

  { x:3952, y:GY-104, w:28, h:14 }, { x:3990, y:GY-104, w:28, h:14 },  // S4 elevated

  { x:5210, y:GY-14, w:24, h:14 }, { x:5258, y:GY-14, w:24, h:14 },   // S5 gauntlet
  { x:5318, y:GY-14, w:24, h:14 }, { x:5366, y:GY-14, w:24, h:14 },
  { x:5426, y:GY-14, w:24, h:14 }, { x:5474, y:GY-14, w:24, h:14 },
  { x:5540, y:GY-14, w:24, h:14 }, { x:5588, y:GY-14, w:24, h:14 },
  { x:5655, y:GY-14, w:24, h:14 }, { x:5705, y:GY-14, w:24, h:14 },
  { x:5770, y:GY-14, w:24, h:14 }, { x:5820, y:GY-14, w:24, h:14 },
];

const CPS: CPDef[] = [
  { id:0, trigX:0,    spawnX:80,   spawnY:GY-PH },
  { id:1, trigX:1240, spawnX:1260, spawnY:GY-PH },
  { id:2, trigX:2220, spawnX:2240, spawnY:GY-PH },
  { id:3, trigX:3230, spawnX:3250, spawnY:GY-PH },
  { id:4, trigX:4250, spawnX:4270, spawnY:GY-PH },
];

// ── Physics helpers ──────────────────────────────────────────────────────────────

function getPlatX(p: Plat, t: number): number {
  if (p.type !== 'moving' || p.axis !== 'x') return p.x;
  return (p.cx ?? 0) + (p.amp ?? 0) * Math.sin(t * (p.spd ?? 0) * Math.PI * 2) - p.w / 2;
}
function getPlatY(p: Plat, t: number): number {
  if (p.type !== 'moving' || p.axis !== 'y') return p.y;
  return (p.cx ?? 0) + (p.amp ?? 0) * Math.sin(t * (p.spd ?? 0) * Math.PI * 2) - p.h / 2;
}
function aabb(ax: number, ay: number, aw: number, ah: number,
              bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ── Types ────────────────────────────────────────────────────────────────────────

interface PhysState {
  x: number; y: number; vx: number; vy: number;
  onGround: boolean; jumpsLeft: number; coyoteMs: number;
  checkpoint: number; deaths: number; finished: boolean;
  facing: 1 | -1; flashMs: number;
}
interface Ghost { x: number; y: number; cp: number }

interface ResolvedPlat { x: number; y: number; w: number; h: number; idx: number; ref: Plat }

// ── Component ────────────────────────────────────────────────────────────────────

export default function RageObby() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stateRef   = useRef<PhysState>({
    x:80, y:GY-PH, vx:0, vy:0,
    onGround:true, jumpsLeft:1, coyoteMs:0,
    checkpoint:0, deaths:0, finished:false,
    facing:1, flashMs:0,
  });
  const inputRef   = useRef({ left:false, right:false, jump:false, jumpPrev:false });
  const ghostsRef  = useRef<Map<string, Ghost>>(new Map());
  const stoodRef   = useRef<{ idx: number; prevX: number } | null>(null);
  const animRef    = useRef(0);
  const sendRef    = useRef(0);
  const { sendInput } = useSocketActions();

  // ── Socket ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = getSocket() as any;
    const myId = getSocket().id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onState = (data: { players: any[] }) => {
      for (const p of data.players) {
        if (p.id === myId) continue;
        ghostsRef.current.set(p.id, { x: p.x, y: p.y, cp: p.cp });
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onFinished = (data: { id: string }) => {
      if (data.id === myId) stateRef.current.finished = true;
    };
    socket.on('obby:state', onState);
    socket.on('obby:finished', onFinished);
    return () => { socket.off('obby:state', onState); socket.off('obby:finished', onFinished); };
  }, []);

  // ── Main loop ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let lastTs = 0;

    // Reset on mount
    Object.assign(stateRef.current, {
      x:80, y:GY-PH, vx:0, vy:0,
      onGround:true, jumpsLeft:1, coyoteMs:0,
      checkpoint:0, deaths:0, finished:false, facing:1 as const, flashMs:0,
    });

    const loop = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      const t = ts / 1000; // seconds for oscillation

      // Compute live platform positions
      const pp: ResolvedPlat[] = PLATS.map((p, idx) => ({
        x: getPlatX(p, t), y: getPlatY(p, t), w: p.w, h: p.h, idx, ref: p,
      }));

      const s = stateRef.current;
      const inp = inputRef.current;

      // ── Carry player on moving platform ──
      if (stoodRef.current && s.onGround) {
        const { idx, prevX } = stoodRef.current;
        const cur = pp[idx];
        if (cur) { s.x += cur.x - prevX; stoodRef.current.prevX = cur.x; }
      }

      // ── Death flash cooldown ──
      if (s.flashMs > 0) s.flashMs = Math.max(0, s.flashMs - dt * 1000);

      // ── Input ──
      const jumpJust = inp.jump && !inp.jumpPrev;
      inp.jumpPrev = inp.jump;
      const tgtVx = inp.left ? -WALK_SPD : inp.right ? WALK_SPD : 0;
      s.vx += (tgtVx - s.vx) * Math.min(1, (s.onGround ? 20 : 7) * dt);
      if (inp.right) s.facing = 1;
      if (inp.left)  s.facing = -1;

      // ── Gravity ──
      if (!s.onGround) s.vy = Math.min(s.vy + GRAVITY * dt, MAX_FALL);

      // ── Coyote time ──
      if (!s.onGround && s.coyoteMs > 0) s.coyoteMs = Math.max(0, s.coyoteMs - dt * 1000);

      // ── Jump ──
      if (jumpJust) {
        if (s.onGround || s.coyoteMs > 0) {
          s.vy = JUMP_VEL; s.onGround = false; s.coyoteMs = 0; s.jumpsLeft = 1;
        } else if (s.jumpsLeft > 0) {
          s.vy = JUMP_VEL * 0.82; s.jumpsLeft = 0;
        }
      }

      // ── Move X ──
      const prevX = s.x;
      s.x = Math.max(0, s.x + s.vx * dt);
      for (const p of pp) {
        if (!aabb(s.x, s.y, PW, PH, p.x, p.y, p.w, p.h)) continue;
        if (prevX + PW <= p.x + 6 && s.vx >= 0)  { s.x = p.x - PW; s.vx = 0; }
        else if (prevX >= p.x + p.w - 6 && s.vx <= 0) { s.x = p.x + p.w; s.vx = 0; }
      }

      // ── Move Y ──
      const prevY = s.y;
      const wasGround = s.onGround;
      s.onGround = false;
      s.y += s.vy * dt;
      stoodRef.current = null;

      for (const p of pp) {
        if (!aabb(s.x, s.y, PW, PH, p.x, p.y, p.w, p.h)) continue;
        if (prevY + PH <= p.y + 10 && s.vy >= 0) {
          // Land on top
          s.y = p.y - PH; s.vy = 0; s.onGround = true;
          if (!wasGround) s.jumpsLeft = 1;
          s.coyoteMs = COYOTE_MS;
          stoodRef.current = { idx: p.idx, prevX: p.x };
        } else if (prevY >= p.y + p.h - 10 && s.vy < 0) {
          // Ceiling
          s.y = p.y + p.h; s.vy = 0;
        }
      }

      // ── Kill: fall or spike ──
      let died = s.y + PH > KILL_Y;
      if (!died) {
        for (const sp of SPIKES) {
          if (aabb(s.x + 3, s.y + 3, PW - 6, PH - 6, sp.x, sp.y, sp.w, sp.h)) { died = true; break; }
        }
      }
      if (died) {
        s.deaths++;
        s.flashMs = 280;
        sendInput('obby_death', {});
        const cp = CPS[s.checkpoint];
        s.x = cp.spawnX; s.y = cp.spawnY;
        s.vx = 0; s.vy = 0; s.onGround = false;
        stoodRef.current = null;
      }

      // ── Checkpoint / finish ──
      if (!s.finished) {
        for (const cp of CPS) {
          if (cp.id > s.checkpoint && s.x + PW >= cp.trigX) {
            s.checkpoint = cp.id;
            sendInput('obby_checkpoint', { id: cp.id });
          }
        }
        if (s.x >= FINISH_X) {
          s.finished = true;
          sendInput('obby_finish', {});
        }
      }

      // ── Send position 15 Hz ──
      const now = Date.now();
      if (now - sendRef.current > 67) {
        sendRef.current = now;
        sendInput('obby_pos', { x: Math.round(s.x), y: Math.round(s.y) });
      }

      // ── Render ──
      render(ctx, s, pp, t, ghostsRef.current);

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft')  inputRef.current.left  = true;
      if (k === 'd' || k === 'arrowright') inputRef.current.right = true;
      if (k === ' ' || k === 'arrowup' || k === 'w') { e.preventDefault(); inputRef.current.jump = true; }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft')  inputRef.current.left  = false;
      if (k === 'd' || k === 'arrowright') inputRef.current.right = false;
      if (k === ' ' || k === 'arrowup' || k === 'w') inputRef.current.jump = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white/60 text-xs text-center mb-1">
        A / D or ← → to move &nbsp;•&nbsp; Space / W / ↑ to jump &nbsp;•&nbsp; Double jump in the air!
      </div>
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        style={{ borderRadius: '12px', display: 'block', maxWidth: '100%' }}
      />
      <div className="flex gap-3 mt-2 lg:hidden flex-wrap justify-center">
        <button
          className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl select-none"
          onPointerDown={() => { inputRef.current.left = true; }}
          onPointerUp={() => { inputRef.current.left = false; }}
          onPointerLeave={() => { inputRef.current.left = false; }}
        >◀</button>
        <button
          className="w-20 h-14 rounded-xl bg-brand-purple/40 border border-brand-purple/60 text-white font-bold select-none"
          onPointerDown={() => { inputRef.current.jump = true; }}
          onPointerUp={() => { inputRef.current.jump = false; }}
          onPointerLeave={() => { inputRef.current.jump = false; }}
        >JUMP</button>
        <button
          className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl select-none"
          onPointerDown={() => { inputRef.current.right = true; }}
          onPointerUp={() => { inputRef.current.right = false; }}
          onPointerLeave={() => { inputRef.current.right = false; }}
        >▶</button>
      </div>
    </div>
  );
}

// ── Renderer (module-level) ──────────────────────────────────────────────────────

function render(
  ctx: CanvasRenderingContext2D,
  state: PhysState,
  pp: ResolvedPlat[],
  _t: number,
  ghosts: Map<string, Ghost>,
) {
  const room       = useGameStore.getState().room;
  const mySocketId = getSocket().id;

  // Camera: slightly look ahead in movement direction
  const camX = Math.max(0, Math.min(WW - CW,
    state.x + PW / 2 - CW * 0.38 + state.vx * 0.12));

  // ── Sky gradient ──
  const sky = ctx.createLinearGradient(0, 0, 0, CH);
  sky.addColorStop(0, '#0f172a');
  sky.addColorStop(0.65, '#1e3a5f');
  sky.addColorStop(1, '#0f2027');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CW, CH);

  // ── Parallax mountains ──
  ctx.fillStyle = 'rgba(30,58,95,0.55)';
  for (let i = 0; i < 9; i++) {
    const mx = ((i * 760 - camX * 0.28) % (CW + 300) + CW + 300) % (CW + 300) - 150;
    const mh = 90 + ((i * 97) % 90);
    ctx.beginPath();
    ctx.moveTo(mx, CH); ctx.lineTo(mx + 110, CH - mh); ctx.lineTo(mx + 220, CH); ctx.fill();
  }

  ctx.save();
  ctx.translate(-camX, 0);

  // ── Platforms ──
  for (const p of pp) {
    if (p.x + p.w < camX - 10 || p.x > camX + CW + 10) continue;
    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(p.x + 3, p.y + 4, p.w, p.h);
    // Body
    ctx.fillStyle = p.ref.color ?? '#78350f';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // Top surface
    ctx.fillStyle = p.ref.type === 'moving' ? '#4ade80' :
                    p.ref.color === '#854d0e' ? '#fbbf24' : '#a16207';
    ctx.fillRect(p.x, p.y, p.w, Math.min(7, p.h));
    // Finish label
    if (p.ref.color === '#854d0e') {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏁 FINISH!', p.x + p.w / 2, p.y - 12);
    }
  }

  // ── Spikes ──
  ctx.fillStyle = '#ef4444';
  for (const sp of SPIKES) {
    const sx = sp.x;
    if (sx + sp.w < camX - 10 || sx > camX + CW + 10) continue;
    const count = Math.max(1, Math.round(sp.w / 14));
    const tw = sp.w / count;
    for (let i = 0; i < count; i++) {
      const bx = sx + i * tw;
      ctx.beginPath();
      ctx.moveTo(bx, sp.y + sp.h);
      ctx.lineTo(bx + tw / 2, sp.y);
      ctx.lineTo(bx + tw, sp.y + sp.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Checkpoint flags ──
  for (const cp of CPS) {
    if (cp.id === 0) continue;
    const fx = cp.trigX + 10;
    if (fx < camX - 60 || fx > camX + CW + 60) continue;
    const reached = state.checkpoint >= cp.id;
    ctx.strokeStyle = reached ? '#fbbf24' : '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(fx, GY); ctx.lineTo(fx, GY - 62); ctx.stroke();
    ctx.fillStyle = reached ? '#22c55e' : '#475569';
    ctx.beginPath();
    ctx.moveTo(fx, GY - 62); ctx.lineTo(fx + 32, GY - 50); ctx.lineTo(fx, GY - 38);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(cp.id), fx + 11, GY - 47);
  }

  // ── Ghost players ──
  for (const [id, g] of ghosts) {
    const pl = room?.players.find(p => p.socketId === id);
    const color = pl?.color ?? '#7c3aed';
    const avatar = pl?.avatar ?? '👤';
    drawChar(ctx, g.x, g.y, color, avatar, true);
  }

  // ── Local player ──
  const myPl  = room?.players.find(p => p.socketId === mySocketId);
  const color = myPl?.color ?? '#7c3aed';
  const avatar = myPl?.avatar ?? '🎮';
  if (state.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(state.x + PW / 2, state.y + PH + 3, PW * 0.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawChar(ctx, state.x, state.y, color, avatar, false);

  ctx.restore();

  // ── HUD ──
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(10, 10, 200, 58);
  ctx.fillStyle = '#f87171';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`💀 ${state.deaths} death${state.deaths !== 1 ? 's' : ''}`, 18, 33);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '13px sans-serif';
  ctx.fillText(`Checkpoint ${state.checkpoint} / ${CPS.length - 1}`, 18, 54);

  // Progress bar
  const prog = Math.min(1, state.x / (FINISH_X + 340));
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(CW / 2 - 180, CH - 26, 360, 13);
  ctx.fillStyle = state.finished ? '#fbbf24' : '#22c55e';
  ctx.fillRect(CW / 2 - 178, CH - 24, 356 * prog, 9);
  ctx.fillStyle = '#fff';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🏁', CW / 2 + 176, CH - 13);
  ctx.textAlign = 'left';

  // Death flash
  if (state.flashMs > 0) {
    ctx.fillStyle = `rgba(220,38,38,${(state.flashMs / 280) * 0.5})`;
    ctx.fillRect(0, 0, CW, CH);
  }

  // Finish banner
  if (state.finished) {
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(CW / 2 - 220, CH / 2 - 42, 440, 84);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏁 YOU MADE IT!', CW / 2, CH / 2 + 12);
    ctx.textAlign = 'left';
  }
}

function drawChar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  color: string, avatar: string, ghost: boolean,
) {
  ctx.globalAlpha = ghost ? 0.42 : 1;
  ctx.fillStyle = color;
  // Body
  ctx.beginPath();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx as any).roundRect?.(x, y + PH * 0.38, PW, PH * 0.62, 4) ?? ctx.rect(x, y + PH * 0.38, PW, PH * 0.62);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.arc(x + PW / 2, y + PH * 0.28, PW * 0.56, 0, Math.PI * 2);
  ctx.fill();
  // Outline
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Avatar
  ctx.font = `${Math.round(PW * 0.85)}px serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.fillText(avatar, x + PW / 2, y + PH * 0.45);
  ctx.globalAlpha = 1;
}
