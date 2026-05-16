'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';

// ── Level constants (must match backend) ──────────────────────────────────────

const LEVEL_WIDTH = 5000;
const GROUND_Y = 520;
const CANVAS_W = 900;
const CANVAS_H = 600;
const PLAYER_W = 36;
const PLAYER_H = 48;
const BLOCK_SIZE = 32;
const GOOMBA_W = 36;
const GOOMBA_H = 36;
const GRAVITY = 1800;
const JUMP_FORCE = -680;
const WALK_SPEED = 260;
const SPEED_MULT = 1.8;

const PLATFORMS = [
  { x: 300, y: 420, w: 160, h: 20 },
  { x: 560, y: 360, w: 140, h: 20 },
  { x: 800, y: 430, w: 160, h: 20 },
  { x: 1060, y: 380, w: 140, h: 20 },
  { x: 1300, y: 320, w: 160, h: 20 },
  { x: 1560, y: 390, w: 140, h: 20 },
  { x: 1800, y: 340, w: 160, h: 20 },
  { x: 2060, y: 410, w: 140, h: 20 },
  { x: 2300, y: 340, w: 160, h: 20 },
  { x: 2560, y: 280, w: 140, h: 20 },
  { x: 2800, y: 370, w: 160, h: 20 },
  { x: 3060, y: 310, w: 140, h: 20 },
  { x: 3300, y: 390, w: 160, h: 20 },
  { x: 3560, y: 330, w: 140, h: 20 },
  { x: 3800, y: 410, w: 160, h: 20 },
  { x: 4060, y: 360, w: 140, h: 20 },
  { x: 4300, y: 300, w: 160, h: 20 },
];

const QUESTION_BLOCKS = [
  { id: 'b0', x: 350, y: 355, powerUp: 'speed' as const },
  { id: 'b1', x: 610, y: 295, powerUp: 'star' as const },
  { id: 'b2', x: 1110, y: 315, powerUp: 'speed' as const },
  { id: 'b3', x: 1350, y: 255, powerUp: 'star' as const },
  { id: 'b4', x: 1850, y: 275, powerUp: 'speed' as const },
  { id: 'b5', x: 2350, y: 275, powerUp: 'star' as const },
  { id: 'b6', x: 2610, y: 215, powerUp: 'speed' as const },
  { id: 'b7', x: 3110, y: 245, powerUp: 'star' as const },
  { id: 'b8', x: 3610, y: 265, powerUp: 'speed' as const },
  { id: 'b9', x: 4110, y: 295, powerUp: 'star' as const },
];

const PIPE = { x: 4650, y: 360, w: 100, h: 160 };
const PLAYER_START = { x: 80, y: GROUND_Y - PLAYER_H };

// ── Types ──────────────────────────────────────────────────────────────────────

interface LocalPlayer {
  x: number; y: number; vx: number; vy: number;
  onGround: boolean; facing: 1 | -1;
  powerUp: null | 'speed' | 'star'; powerUpExpiry: number;
  finished: boolean; dead: boolean; respawnAt: number;
  jumpPressed: boolean;
}

interface RemotePlayer { x: number; y: number; powerUp: string | null; finished: boolean; dead: boolean; rank: number }
interface GoombaClient { id: string; x: number; y: number; alive: boolean; squishAt: number }
interface BlockClient { id: string; x: number; y: number; hit: boolean; bounceAt: number; powerUp: 'speed' | 'star' | null }
interface PowerUpClient { id: string; x: number; y: number; type: 'speed' | 'star' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function MarioGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { sendInput } = useSocketActions();

  const playerRef = useRef<LocalPlayer>({
    x: PLAYER_START.x, y: PLAYER_START.y, vx: 0, vy: 0,
    onGround: false, facing: 1,
    powerUp: null, powerUpExpiry: 0,
    finished: false, dead: false, respawnAt: 0, jumpPressed: false,
  });

  const remotePlayers = useRef<Map<string, RemotePlayer>>(new Map());
  const goombasRef = useRef<GoombaClient[]>([]);
  const blocksRef = useRef<BlockClient[]>(QUESTION_BLOCKS.map(b => ({ ...b, hit: false, bounceAt: 0 })));
  const powerUpsRef = useRef<PowerUpClient[]>([]);
  const camRef = useRef({ x: 0 });
  const inputRef = useRef({ left: false, right: false, jump: false });
  const lastSendRef = useRef(0);
  const animRef = useRef(0);
  const lastTimeRef = useRef(0);
  const finishedMsgRef = useRef('');

  // ── Server state sync ──────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getSocket() as any;

    socket.on('mario:state', (data: any) => {
      const playerId = useGameStore.getState().playerId;
      // Update remote players
      for (const [id, s] of Object.entries(data.players as Record<string, RemotePlayer>)) {
        if (id === playerId) continue;
        remotePlayers.current.set(id, s as RemotePlayer);
      }
      // Server is authoritative for goombas
      goombasRef.current = (data.goombas as any[]).map((g: any) => {
        const existing = goombasRef.current.find(e => e.id === g.id);
        return { id: g.id, x: g.x, y: g.y, alive: g.alive, squishAt: existing?.squishAt ?? 0 };
      });
      // Sync power-ups
      powerUpsRef.current = (data.powerUps as any[]).map((p: any) => ({
        id: p.id, x: p.x, y: p.y, type: p.type,
      }));
    });

    socket.on('mario:block_hit', (data: any) => {
      const block = blocksRef.current.find(b => b.id === data.blockId);
      if (block) { block.hit = true; block.bounceAt = performance.now(); }
    });

    socket.on('mario:goomba_stomped', (data: any) => {
      const g = goombasRef.current.find(g => g.id === data.goombaId);
      if (g) { g.alive = false; g.squishAt = performance.now(); }
    });

    socket.on('mario:player_finished', (data: any) => {
      const playerId = useGameStore.getState().playerId;
      if (data.playerId === playerId) {
        finishedMsgRef.current = `🏁 You finished #${data.rank}! +${data.points} pts`;
        playerRef.current.finished = true;
      }
    });

    socket.on('mario:player_hit', (data: any) => {
      const playerId = useGameStore.getState().playerId;
      if (data.targetId === playerId) {
        const p = playerRef.current;
        p.dead = true;
        p.respawnAt = performance.now() + 3000;
        p.x = Math.max(80, p.x - 200);
        p.y = PLAYER_START.y;
        p.vx = 0; p.vy = 0;
      }
    });

    return () => {
      socket.off('mario:state');
      socket.off('mario:block_hit');
      socket.off('mario:goomba_stomped');
      socket.off('mario:player_finished');
      socket.off('mario:player_hit');
    };
  }, []);

  // ── Input ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') inputRef.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') inputRef.current.right = true;
      if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') && !e.repeat) inputRef.current.jump = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') inputRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') inputRef.current.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') inputRef.current.jump = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // ── Physics ────────────────────────────────────────────────────────────────

  const update = useCallback((dt: number) => {
    const p = playerRef.current;
    const inp = inputRef.current;
    const now = performance.now();

    // Respawn
    if (p.dead) {
      if (now >= p.respawnAt) { p.dead = false; p.vy = 0; p.vx = 0; }
      else return;
    }
    if (p.finished) return;

    // Power-up expiry
    if (p.powerUp && now > p.powerUpExpiry) p.powerUp = null;

    const speed = WALK_SPEED * (p.powerUp === 'speed' ? SPEED_MULT : 1);

    // Horizontal
    if (inp.left) { p.vx = -speed; p.facing = -1; }
    else if (inp.right) { p.vx = speed; p.facing = 1; }
    else p.vx = 0;

    // Jump
    if (inp.jump && p.onGround && !p.jumpPressed) {
      p.vy = JUMP_FORCE;
      p.onGround = false;
    }
    p.jumpPressed = inp.jump;

    // Gravity
    p.vy += GRAVITY * dt;
    if (p.vy > 1200) p.vy = 1200; // terminal velocity

    // Move
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Clamp horizontal
    p.x = Math.max(0, Math.min(LEVEL_WIDTH - PLAYER_W, p.x));

    // Ground collision
    p.onGround = false;
    if (p.y + PLAYER_H >= GROUND_Y) {
      p.y = GROUND_Y - PLAYER_H;
      p.vy = 0;
      p.onGround = true;
    }

    // Platform collision (land on top)
    for (const plat of PLATFORMS) {
      const wasAbove = (p.y + PLAYER_H - p.vy * dt) <= plat.y + 2;
      const inX = p.x + PLAYER_W > plat.x + 4 && p.x < plat.x + plat.w - 4;
      const nowInY = p.y + PLAYER_H > plat.y && p.y + PLAYER_H < plat.y + plat.h + 20;
      if (wasAbove && inX && nowInY && p.vy >= 0) {
        p.y = plat.y - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
      }
    }

    // Block collision (hit from below)
    for (const block of blocksRef.current) {
      if (block.hit) continue;
      const bx = block.x, by = block.y;
      const inX = p.x + PLAYER_W > bx + 2 && p.x < bx + BLOCK_SIZE - 2;
      const hitsBottom = p.y < by + BLOCK_SIZE && p.y > by && p.vy < 0 && inX;
      if (hitsBottom) {
        p.vy = 0;
        p.y = by + BLOCK_SIZE;
        sendInput('block_hit', { blockId: block.id });
      }
      // Solid from top
      const wasAbove = (p.y + PLAYER_H - p.vy * dt) <= by + 2;
      const nowIn = p.y + PLAYER_H > by && p.y < by + BLOCK_SIZE && inX;
      if (wasAbove && nowIn && p.vy >= 0) {
        p.y = by - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
      }
    }

    // Power-up collection
    powerUpsRef.current = powerUpsRef.current.filter(pu => {
      const dx = Math.abs(p.x + PLAYER_W / 2 - (pu.x + 16));
      const dy = Math.abs(p.y + PLAYER_H / 2 - (pu.y + 16));
      if (dx < 36 && dy < 36) {
        sendInput('powerup_collect', { powerUpId: pu.id });
        p.powerUp = pu.type;
        p.powerUpExpiry = now + 8000;
        return false;
      }
      return true;
    });

    // Goomba collision
    for (const g of goombasRef.current) {
      if (!g.alive) continue;
      const dx = Math.abs(p.x + PLAYER_W / 2 - (g.x + GOOMBA_W / 2));
      const dy = p.y + PLAYER_H - (g.y + GOOMBA_H / 2);
      const inX = dx < PLAYER_W / 2 + GOOMBA_W / 2 - 6;
      if (!inX) continue;

      const stompingFrom = dy > 0 && dy < 30 && p.vy > 0;
      if (stompingFrom) {
        g.alive = false;
        g.squishAt = now;
        p.vy = -350;
        sendInput('goomba_stomp', { goombaId: g.id });
      } else if (Math.abs(p.y + PLAYER_H / 2 - (g.y + GOOMBA_H / 2)) < GOOMBA_H / 2 + PLAYER_H / 2 - 8) {
        if (p.powerUp === 'star') {
          g.alive = false;
          g.squishAt = now;
          sendInput('goomba_stomp', { goombaId: g.id });
        } else if (!p.dead) {
          p.dead = true;
          p.respawnAt = now + 3000;
          p.vy = -400;
        }
      }
    }

    // Star: check hit other players
    if (p.powerUp === 'star') {
      const room = useGameStore.getState().room;
      const myId = useGameStore.getState().playerId;
      for (const [id, rp] of remotePlayers.current) {
        if (rp.finished || rp.dead) continue;
        const rplayer = room?.players.find(pl => pl.socketId === id);
        if (!rplayer) continue;
        const dx = Math.abs(p.x - rp.x);
        const dy = Math.abs(p.y - rp.y);
        if (dx < 60 && dy < 60) {
          sendInput('player_hit', { targetId: id });
        }
      }
    }

    // Reach pipe
    if (!p.finished && p.x + PLAYER_W > PIPE.x && p.y + PLAYER_H > PIPE.y) {
      p.finished = true;
      sendInput('level_complete', {});
    }

    // Camera: smoothly follow player, clamp to level
    const targetCamX = p.x - CANVAS_W * 0.35;
    camRef.current.x += (targetCamX - camRef.current.x) * Math.min(1, dt * 8);
    camRef.current.x = Math.max(0, Math.min(LEVEL_WIDTH - CANVAS_W, camRef.current.x));

    // Send position at 10Hz
    if (now - lastSendRef.current > 100) {
      sendInput('position_update', { x: p.x, y: p.y });
      lastSendRef.current = now;
    }
  }, [sendInput]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cam = camRef.current.x;
    const now = performance.now();
    const p = playerRef.current;

    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#3b82f6');
    grad.addColorStop(1, '#60a5fa');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Background hills
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 8; i++) {
      const hx = (i * 700 - (cam * 0.3) % 700) - 100;
      ctx.beginPath();
      ctx.arc(hx, CANVAS_H - 60, 180, Math.PI, 0);
      ctx.fill();
    }

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const cloudOffsets = [{ x: 200, y: 80 }, { x: 600, y: 50 }, { x: 1050, y: 100 }, { x: 1500, y: 60 }];
    for (const cloud of cloudOffsets) {
      const cx = ((cloud.x - cam * 0.2) % (CANVAS_W + 200) + CANVAS_W + 200) % (CANVAS_W + 200) - 100;
      ctx.beginPath(); ctx.arc(cx, cloud.y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 35, cloud.y - 10, 22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 60, cloud.y, 28, 0, Math.PI * 2); ctx.fill();
    }

    // Ground
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(-cam, GROUND_Y, LEVEL_WIDTH, 20);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(-cam, GROUND_Y + 20, LEVEL_WIDTH, CANVAS_H);

    // Brick pattern on ground
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    const brickW = 60, brickH = 20;
    const startBrickX = Math.floor(cam / brickW) * brickW;
    for (let bx = startBrickX; bx < cam + CANVAS_W + brickW; bx += brickW) {
      for (let by = GROUND_Y + 20; by < CANVAS_H; by += brickH) {
        const offset = (Math.floor(by / brickH) % 2) * 30;
        ctx.strokeRect(bx + offset - cam, by, brickW, brickH);
      }
    }

    // Platforms
    for (const plat of PLATFORMS) {
      const px = plat.x - cam;
      if (px + plat.w < 0 || px > CANVAS_W) continue;
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(px, plat.y, plat.w, plat.h);
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(px, plat.y, plat.w, 5);
      ctx.fillStyle = '#6d28d9';
      ctx.fillRect(px, plat.y + plat.h - 4, plat.w, 4);
    }

    // Question blocks
    for (const block of blocksRef.current) {
      const bx = block.x - cam;
      if (bx + BLOCK_SIZE < 0 || bx > CANVAS_W) continue;
      const bounce = block.bounceAt > 0 && now - block.bounceAt < 300
        ? -Math.sin((now - block.bounceAt) / 300 * Math.PI) * 10
        : 0;
      const by = block.y + bounce;

      if (block.hit) {
        ctx.fillStyle = '#78716c';
        ctx.fillRect(bx, by, BLOCK_SIZE, BLOCK_SIZE);
        ctx.fillStyle = '#57534e';
        ctx.fillRect(bx + 2, by + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
      } else {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(bx, by, BLOCK_SIZE, BLOCK_SIZE);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(bx + 2, by + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px serif';
        ctx.textAlign = 'center';
        ctx.fillText('?', bx + BLOCK_SIZE / 2, by + BLOCK_SIZE - 8);
        ctx.textAlign = 'left';
      }
    }

    // Power-ups (floating)
    for (const pu of powerUpsRef.current) {
      const px = pu.x - cam;
      if (px < -40 || px > CANVAS_W + 40) continue;
      const floatY = pu.y - Math.sin(now / 400) * 5;
      ctx.fillStyle = pu.type === 'speed' ? '#f97316' : '#fde68a';
      ctx.beginPath();
      ctx.arc(px + 16, floatY + 16, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '16px serif';
      ctx.fillText(pu.type === 'speed' ? '⚡' : '⭐', px + 5, floatY + 22);
    }

    // End pipe
    const pipeX = PIPE.x - cam;
    if (pipeX < CANVAS_W + 120) {
      // Pipe body
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(pipeX, PIPE.y + 30, PIPE.w, PIPE.h - 30);
      // Pipe rim
      ctx.fillStyle = '#15803d';
      ctx.fillRect(pipeX - 5, PIPE.y, PIPE.w + 10, 30);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(pipeX, PIPE.y + 30, 6, PIPE.h - 30);
      // Flag/label
      ctx.font = '28px serif';
      ctx.fillText('🏁', pipeX + 25, PIPE.y - 10);
    }

    // Goombas
    for (const g of goombasRef.current) {
      const gx = g.x - cam;
      if (gx + GOOMBA_W < 0 || gx > CANVAS_W) continue;
      const deadTime = g.squishAt > 0 ? now - g.squishAt : -1;
      if (!g.alive && deadTime > 600) continue;

      const squished = !g.alive && deadTime >= 0;
      const gy = squished ? GROUND_Y - 10 : g.y;
      const gh = squished ? 10 : GOOMBA_H;

      ctx.fillStyle = '#92400e';
      ctx.fillRect(gx, gy, GOOMBA_W, gh);
      if (!squished) {
        // Head/cap
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.arc(gx + GOOMBA_W / 2, gy + 10, GOOMBA_W / 2, Math.PI, 0);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(gx + 5, gy + 10, 9, 9);
        ctx.fillRect(gx + 20, gy + 10, 9, 9);
        ctx.fillStyle = '#000';
        ctx.fillRect(gx + 8, gy + 13, 4, 4);
        ctx.fillRect(gx + 23, gy + 13, 4, 4);
        // Angry eyebrows
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(gx + 4, gy + 9); ctx.lineTo(gx + 14, gy + 11); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx + 30, gy + 9); ctx.lineTo(gx + 20, gy + 11); ctx.stroke();
        // Feet
        ctx.fillStyle = '#78350f';
        ctx.fillRect(gx + 2, gy + GOOMBA_H - 8, 12, 8);
        ctx.fillRect(gx + GOOMBA_W - 14, gy + GOOMBA_H - 8, 12, 8);
      }
    }

    // Remote players
    const room = useGameStore.getState().room;
    for (const [id, rp] of remotePlayers.current) {
      if (rp.dead) continue;
      const rpx = rp.x - cam;
      if (rpx + PLAYER_W < -50 || rpx > CANVAS_W + 50) continue;
      const pl = room?.players.find(pl => pl.socketId === id);
      if (!pl) continue;

      const isStar = rp.powerUp === 'star';
      ctx.globalAlpha = 0.85;
      if (isStar) { ctx.shadowColor = '#fde68a'; ctx.shadowBlur = 15; }
      ctx.fillStyle = pl.color;
      ctx.fillRect(rpx, rp.y, PLAYER_W, PLAYER_H);
      if (isStar) ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      // Avatar + name
      ctx.font = '22px serif';
      ctx.fillText(pl.avatar, rpx + 5, rp.y - 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pl.username, rpx + PLAYER_W / 2, rp.y - 14);
      ctx.textAlign = 'left';

      // Finished badge
      if (rp.finished) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '14px serif';
        ctx.fillText(`#${rp.rank}`, rpx + PLAYER_W / 2 - 6, rp.y - 26);
      }
    }

    // Local player
    if (!p.dead) {
      const lx = p.x - cam;
      const isStar = p.powerUp === 'star';
      const isSpeed = p.powerUp === 'speed';

      if (isStar) {
        ctx.shadowColor = '#fde68a';
        ctx.shadowBlur = 20;
        // Rainbow flash
        const hue = (now / 20) % 360;
        ctx.fillStyle = `hsl(${hue},100%,60%)`;
      } else if (isSpeed) {
        ctx.fillStyle = '#f97316';
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 10;
      } else {
        const myRoom = useGameStore.getState().room;
        const myId = useGameStore.getState().playerId;
        const myPlayer = myRoom?.players.find(pl => pl.id === myId);
        ctx.fillStyle = myPlayer?.color ?? '#7c3aed';
      }

      ctx.fillRect(lx, p.y, PLAYER_W, PLAYER_H);
      ctx.shadowBlur = 0;

      // Avatar
      const myRoom = useGameStore.getState().room;
      const myId = useGameStore.getState().playerId;
      const myPlayer = myRoom?.players.find(pl => pl.id === myId);
      ctx.font = '22px serif';
      ctx.save();
      if (p.facing === -1) {
        ctx.scale(-1, 1);
        ctx.fillText(myPlayer?.avatar ?? '🎮', -(lx + PLAYER_W - 3), p.y - 2);
      } else {
        ctx.fillText(myPlayer?.avatar ?? '🎮', lx + 5, p.y - 2);
      }
      ctx.restore();

      // YOU label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('YOU', lx + PLAYER_W / 2, p.y - 14);
      ctx.textAlign = 'left';
    } else {
      // Death respawn countdown
      const remaining = Math.ceil((p.respawnAt - now) / 1000);
      const lx = p.x - cam;
      ctx.fillStyle = 'rgba(239,68,68,0.8)';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`💀 ${remaining}s`, lx + PLAYER_W / 2, p.y - 10);
      ctx.textAlign = 'left';
    }

    // HUD: power-up indicator
    if (p.powerUp) {
      const remaining = Math.max(0, (p.powerUpExpiry - now) / 1000);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(10, 10, 140, 36);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`${p.powerUp === 'star' ? '⭐ STAR' : '⚡ SPEED'} ${remaining.toFixed(1)}s`, 16, 32);
    }

    // HUD: finish message
    if (finishedMsgRef.current) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(CANVAS_W / 2 - 160, CANVAS_H / 2 - 30, 320, 60);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(finishedMsgRef.current, CANVAS_W / 2, CANVAS_H / 2 + 8);
      ctx.textAlign = 'left';
    }

    // Progress bar (minimap)
    const progress = Math.min(1, p.x / (PIPE.x - 100));
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(CANVAS_W / 2 - 150, CANVAS_H - 20, 300, 10);
    ctx.fillStyle = p.powerUp === 'star' ? '#fde68a' : '#7c3aed';
    ctx.fillRect(CANVAS_W / 2 - 150, CANVAS_H - 20, 300 * progress, 10);
    ctx.fillStyle = '#fff';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏁', CANVAS_W / 2 + 150 - 4, CANVAS_H - 12);
    ctx.textAlign = 'left';
  }, []);

  // ── Game loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const loop = (time: number) => {
      const dt = lastTimeRef.current ? Math.min((time - lastTimeRef.current) / 1000, 0.05) : 0.016;
      lastTimeRef.current = time;
      update(dt);
      render();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [update, render]);

  // ── Touch controls ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-white/50 text-xs text-center mb-1">
        Arrow keys / WASD to move • Up/W/Space to jump • Stomp Goombas • Hit ? blocks • Reach the 🏁
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="rounded-xl border border-white/10"
        style={{ maxWidth: '100%', touchAction: 'none' }}
      />

      {/* Mobile controls */}
      <div className="flex gap-4 mt-2 lg:hidden">
        <div className="flex gap-2">
          <button
            className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl flex items-center justify-center active:bg-white/20"
            onPointerDown={() => { inputRef.current.left = true; }}
            onPointerUp={() => { inputRef.current.left = false; }}
            onPointerCancel={() => { inputRef.current.left = false; }}
          >◀</button>
          <button
            className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 text-white text-xl flex items-center justify-center active:bg-white/20"
            onPointerDown={() => { inputRef.current.right = true; }}
            onPointerUp={() => { inputRef.current.right = false; }}
            onPointerCancel={() => { inputRef.current.right = false; }}
          >▶</button>
        </div>
        <button
          className="w-20 h-14 rounded-xl bg-brand-purple/40 border border-brand-purple/60 text-white font-bold text-lg flex items-center justify-center active:bg-brand-purple/60"
          onPointerDown={() => { inputRef.current.jump = true; }}
          onPointerUp={() => { inputRef.current.jump = false; }}
          onPointerCancel={() => { inputRef.current.jump = false; }}
        >JUMP</button>
      </div>
    </div>
  );
}
