'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useSocketActions, getSocket } from '@/hooks/useSocket';
import { mario_jump, mario_blockHit, mario_powerUp, mario_stomp, mario_finish } from '@/hooks/useGameSounds';

// ── Level constants (must match backend) ──────────────────────────────────────

const LEVEL_WIDTH = 6600;
const GROUND_Y = 520;
const CANVAS_W = 900;
const CANVAS_H = 600;
const PLAYER_W = 36;
const PLAYER_H = 48;
const BLOCK_SIZE = 32;
const GOOMBA_W = 36;
const GOOMBA_H = 36;
const GRAVITY = 1800;
const JUMP_FORCE = -700;
const WALK_SPEED = 260;
const SPEED_MULT = 1.8;

const PLATFORMS = [
  { x: 300, y: 420, w: 180, h: 20 },
  { x: 560, y: 360, w: 140, h: 20 },
  { x: 800, y: 430, w: 160, h: 20 },
  { x: 1060, y: 380, w: 140, h: 20 },
  { x: 1300, y: 320, w: 160, h: 20 },
  { x: 1540, y: 390, w: 140, h: 20 },
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
  // Star Road section (x=4700-6100)
  { x: 4700, y: 380, w: 140, h: 20 },
  { x: 4900, y: 320, w: 120, h: 20 },
  { x: 5080, y: 400, w: 140, h: 20 },
  { x: 5280, y: 340, w: 120, h: 20 },
  { x: 5450, y: 260, w: 140, h: 20 },
  { x: 5650, y: 380, w: 120, h: 20 },
  { x: 5820, y: 310, w: 140, h: 20 },
  { x: 6000, y: 360, w: 140, h: 20 },
];

// All blocks placed exactly 80px above the player's head when standing on the
// nearest ground/platform so every block is hittable with a single jump.
// Formula: block.y = platform.y - PLAYER_H - 80 = platform.y - 128
// From GROUND_Y (520): block.y = 520 - 128 = 392
const QUESTION_BLOCKS = [
  // b0 — above ground at start (easy intro block)
  { id: 'b0', x: 140,  y: 392, powerUp: 'speed' as const },
  // b1 — above platform (560, 360): 360-128=232
  { id: 'b1', x: 590,  y: 232, powerUp: 'speed' as const },
  // b2 — above ground between platforms (player runs through here)
  { id: 'b2', x: 1200, y: 392, powerUp: 'star' as const },
  // b3 — above platform (1300, 320): 320-128=192
  { id: 'b3', x: 1340, y: 192, powerUp: 'speed' as const },
  // b4 — above platform (1540, 390): 390-128=262
  { id: 'b4', x: 1570, y: 262, powerUp: 'speed' as const },
  // b5 — above platform (2300, 340): 340-128=212
  { id: 'b5', x: 2330, y: 212, powerUp: 'fire' as const },
  // b6 — above ground (runner just cruised off platform)
  { id: 'b6', x: 2740, y: 392, powerUp: 'speed' as const },
  // b7 — above platform (3060, 310): 310-128=182
  { id: 'b7', x: 3090, y: 182, powerUp: 'speed' as const },
  // b8 — above platform (3800, 410): 410-128=282
  { id: 'b8', x: 3830, y: 282, powerUp: 'fire' as const },
  // b9 — above platform (4300, 300): 300-128=172
  { id: 'b9', x: 4330, y: 172, powerUp: 'star' as const },
  // b10 — above platform (5080, 400): 400-128=272
  { id: 'b10', x: 5100, y: 272, powerUp: 'fire' as const },
  // b11 — above platform (5450, 260): 260-128=132  (high-skill reward)
  { id: 'b11', x: 5470, y: 132, powerUp: 'star' as const },
  // b12 — above platform (6000, 360): 360-128=232
  { id: 'b12', x: 6020, y: 232, powerUp: 'speed' as const },
];

// Piranha plants at these pipe positions (client-side time-based animation)
const PIRANHA_PIPES = [
  { x: 2310, pipeW: 80, pipeH: 80 },
  { x: 3720, pipeW: 80, pipeH: 80 },
];

const PIPE = { x: 6180, y: 360, w: 100, h: 160 };
const PLAYER_START = { x: 80, y: GROUND_Y - PLAYER_H };

// ── Types ──────────────────────────────────────────────────────────────────────

interface LocalPlayer {
  x: number; y: number; vx: number; vy: number;
  onGround: boolean; facing: 1 | -1;
  powerUp: null | 'speed' | 'star' | 'fire'; powerUpExpiry: number;
  finished: boolean; dead: boolean; respawnAt: number;
  jumpPressed: boolean;
  walkPhase: number; // for shoe animation
  slowed: boolean; slowUntil: number;
  fireballCooldown: number;
}

interface RemotePlayer { x: number; y: number; powerUp: string | null; finished: boolean; dead: boolean; rank: number; facing?: number; slowed: boolean }
interface GoombaClient { id: string; x: number; y: number; alive: boolean; squishAt: number }
interface BlockClient { id: string; x: number; y: number; hit: boolean; bounceAt: number; powerUp: 'speed' | 'star' | 'fire' | null }
interface PowerUpClient { id: string; x: number; y: number; type: 'speed' | 'star' | 'fire' }
interface Fireball { id: number; x: number; y: number; vx: number; vy: number; spawnedAt: number; bounced: boolean; bounceCount: number }

// ── Mario sprite drawing ──────────────────────────────────────────────────────

function drawMario(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  facing: 1 | -1,
  walking: boolean,
  walkPhase: number,
  starMode = false,
  speedMode = false,
  dead = false,
  fireMode = false,
) {
  const SKIN = '#fcd5b5';
  const HAIR = '#3a1f0a';
  const NAVY = '#1e3a8a';
  const SHOE = '#3d1b07';
  const BTN = '#fcd34d';

  // Star mode: shift hue rapidly using a tint color
  let capColor = color;
  let shirtColor = color;
  if (starMode) {
    const hue = (performance.now() / 30) % 360;
    capColor = `hsl(${hue},90%,55%)`;
    shirtColor = `hsl(${(hue + 180) % 360},90%,55%)`;
  } else if (fireMode) {
    capColor = '#dc2626';
    shirtColor = '#f97316';
  } else if (speedMode) {
    capColor = color;
    shirtColor = '#f97316';
  }
  if (dead) {
    capColor = '#7f1d1d';
    shirtColor = '#7f1d1d';
  }

  ctx.save();
  if (facing === -1) {
    ctx.translate(x + PLAYER_W, y);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(x, y);
  }

  // px() pixel grid: we want a 9-wide x 12-tall sprite at 4x scale = 36x48
  const P = 4;

  // Cap (top)
  ctx.fillStyle = capColor;
  // crown
  ctx.fillRect(2 * P, 0, 5 * P, 2 * P);
  // brim - extends further out
  ctx.fillRect(P, 2 * P, 7 * P, P);
  // small brim front piece
  ctx.fillRect(0, 2 * P, P, P);

  // Hair (sides under cap)
  ctx.fillStyle = HAIR;
  ctx.fillRect(P, 3 * P, P, P);
  ctx.fillRect(7 * P, 3 * P, P, P);
  // sideburns
  ctx.fillRect(P, 4 * P, P, P);

  // Face
  ctx.fillStyle = SKIN;
  ctx.fillRect(2 * P, 3 * P, 5 * P, 2 * P);
  // ear bumps
  ctx.fillRect(7 * P, 4 * P, P, P);

  // Eyes (whites)
  ctx.fillStyle = '#fff';
  ctx.fillRect(3 * P, 3 * P + P / 2, P, P);
  ctx.fillRect(5 * P, 3 * P + P / 2, P, P);
  // Pupils
  ctx.fillStyle = '#0a1a2f';
  ctx.fillRect(3 * P + P / 2, 3 * P + P, P / 2, P / 2);
  ctx.fillRect(5 * P + P / 2, 3 * P + P, P / 2, P / 2);

  // Nose (big Mario nose)
  ctx.fillStyle = SKIN;
  ctx.fillRect(4 * P, 4 * P, P, P);
  // nose shadow
  ctx.fillStyle = '#e8b48e';
  ctx.fillRect(4 * P, 4 * P + P - 1, P, 1);

  // Mustache
  ctx.fillStyle = HAIR;
  ctx.fillRect(3 * P, 5 * P, 3 * P, P);
  ctx.fillRect(2 * P, 5 * P + P / 2, P, P / 2);

  // Neck/lower face
  ctx.fillStyle = SKIN;
  ctx.fillRect(3 * P, 5 * P + P, 2 * P, P / 2);

  // Shirt / shoulder area
  ctx.fillStyle = shirtColor;
  ctx.fillRect(P, 6 * P, 7 * P, 2 * P);

  // Overalls (navy)
  ctx.fillStyle = NAVY;
  ctx.fillRect(2 * P, 8 * P, 5 * P, 2 * P);
  // Overalls straps over shirt
  ctx.fillRect(2 * P + P / 2, 6 * P + P / 2, P, 2 * P);
  ctx.fillRect(5 * P + P / 2, 6 * P + P / 2, P, 2 * P);
  // Overalls buttons
  ctx.fillStyle = BTN;
  ctx.fillRect(2 * P + P / 2, 8 * P, P / 2, P / 2);
  ctx.fillRect(6 * P, 8 * P, P / 2, P / 2);

  // Arms (shirt-colored sleeves)
  ctx.fillStyle = shirtColor;
  // Left arm
  ctx.fillRect(0, 6 * P + P, P, 2 * P);
  // Right arm
  ctx.fillRect(8 * P, 6 * P + P, P, 2 * P);

  // Hands (skin)
  ctx.fillStyle = SKIN;
  ctx.fillRect(0, 8 * P + P, P, P);
  ctx.fillRect(8 * P, 8 * P + P, P, P);
  // White gloves
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 9 * P, P, P);
  ctx.fillRect(8 * P, 9 * P, P, P);

  // Shoes — alternate when walking
  ctx.fillStyle = SHOE;
  if (walking) {
    // Walking pose: one foot forward, one back
    if (Math.floor(walkPhase) % 2 === 0) {
      ctx.fillRect(0, 10 * P, 4 * P, 2 * P);   // back foot back
      ctx.fillRect(5 * P, 10 * P + P, 4 * P, P); // front foot slightly forward
    } else {
      ctx.fillRect(P, 10 * P + P, 3 * P, P);
      ctx.fillRect(4 * P, 10 * P, 4 * P, 2 * P);
    }
  } else {
    ctx.fillRect(P, 10 * P, 3 * P, 2 * P);
    ctx.fillRect(5 * P, 10 * P, 3 * P, 2 * P);
  }

  // Speed mode: motion lines behind
  if (speedMode && !fireMode) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-P * 2, 7 * P, P, P / 2);
    ctx.fillRect(-P * 3, 8 * P + P, P * 2, P / 2);
    ctx.fillRect(-P * 2, 9 * P + P, P, P / 2);
  }

  // Fire mode: flame effect around player
  if (fireMode) {
    ctx.globalAlpha = 0.6 + Math.sin(performance.now() / 80) * 0.3;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(-P, 7 * P, P, P * 2);
    ctx.fillRect(9 * P, 7 * P, P, P * 2);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Goomba drawing ────────────────────────────────────────────────────────────

function drawGoomba(ctx: CanvasRenderingContext2D, x: number, y: number, squished: boolean) {
  if (squished) {
    // Squished goomba — flat shape
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x, y + GOOMBA_H - 8, GOOMBA_W, 8);
    ctx.fillStyle = '#3d2410';
    ctx.fillRect(x + 4, y + GOOMBA_H - 4, GOOMBA_W - 8, 2);
    return;
  }

  // Body cap (rounded top)
  ctx.fillStyle = '#8b4513';
  // Cap upper
  ctx.fillRect(x + 4, y, GOOMBA_W - 8, 6);
  ctx.fillRect(x + 2, y + 4, GOOMBA_W - 4, 6);
  ctx.fillRect(x, y + 8, GOOMBA_W, 10);

  // Underbelly (slightly lighter)
  ctx.fillStyle = '#d2a679';
  ctx.fillRect(x + 6, y + 18, GOOMBA_W - 12, 8);

  // Feet
  ctx.fillStyle = '#3d2410';
  ctx.fillRect(x + 2, y + GOOMBA_H - 8, 12, 8);
  ctx.fillRect(x + GOOMBA_W - 14, y + GOOMBA_H - 8, 12, 8);

  // Eyes (whites)
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 7, y + 10, 8, 8);
  ctx.fillRect(x + GOOMBA_W - 15, y + 10, 8, 8);

  // Pupils (angry — looking down-out)
  ctx.fillStyle = '#0a1a2f';
  ctx.fillRect(x + 7, y + 13, 4, 4);
  ctx.fillRect(x + GOOMBA_W - 11, y + 13, 4, 4);

  // Angry eyebrows
  ctx.fillStyle = '#3d2410';
  ctx.fillRect(x + 5, y + 8, 8, 2);
  ctx.fillRect(x + GOOMBA_W - 13, y + 8, 8, 2);
}

// ── Question block drawing ────────────────────────────────────────────────────

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, hit: boolean, powerUp?: string) {
  if (hit) {
    // Used block — brick texture
    ctx.fillStyle = '#a16207';
    ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(x, y, BLOCK_SIZE, 2);
    ctx.fillRect(x, y + BLOCK_SIZE - 2, BLOCK_SIZE, 2);
    ctx.fillRect(x, y, 2, BLOCK_SIZE);
    ctx.fillRect(x + BLOCK_SIZE - 2, y, 2, BLOCK_SIZE);
    // Rivets
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x + 4, y + 4, 3, 3);
    ctx.fillRect(x + BLOCK_SIZE - 7, y + 4, 3, 3);
    ctx.fillRect(x + 4, y + BLOCK_SIZE - 7, 3, 3);
    ctx.fillRect(x + BLOCK_SIZE - 7, y + BLOCK_SIZE - 7, 3, 3);
    return;
  }

  // Fire block: orange tinted
  const isFireBlock = powerUp === 'fire';

  // Question block — yellow with ?
  // Outer dark border
  ctx.fillStyle = isFireBlock ? '#7c2d12' : '#854d0e';
  ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
  // Yellow/orange face
  ctx.fillStyle = isFireBlock ? '#f97316' : '#fbbf24';
  ctx.fillRect(x + 2, y + 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
  // Lighter highlight on top
  ctx.fillStyle = isFireBlock ? '#fdba74' : '#fde68a';
  ctx.fillRect(x + 4, y + 4, BLOCK_SIZE - 8, 4);
  // Darker shadow on bottom
  ctx.fillStyle = isFireBlock ? '#ea580c' : '#d97706';
  ctx.fillRect(x + 4, y + BLOCK_SIZE - 8, BLOCK_SIZE - 8, 4);
  // Rivet pixels in corners
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x + 4, y + 4, 3, 3);
  ctx.fillRect(x + BLOCK_SIZE - 7, y + 4, 3, 3);
  ctx.fillRect(x + 4, y + BLOCK_SIZE - 7, 3, 3);
  ctx.fillRect(x + BLOCK_SIZE - 7, y + BLOCK_SIZE - 7, 3, 3);

  if (isFireBlock) {
    // Draw flame symbol instead of ?
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 13, y + 8, 6, 2);
    ctx.fillRect(x + 11, y + 10, 10, 2);
    ctx.fillRect(x + 11, y + 12, 4, 6);
    ctx.fillRect(x + 17, y + 12, 4, 4);
    ctx.fillRect(x + 13, y + 18, 6, 2);
    ctx.fillRect(x + 14, y + 24, 4, 3);
  } else {
    // The "?" — drawn as pixels
    ctx.fillStyle = '#fff';
    // top curve
    ctx.fillRect(x + 11, y + 8, 10, 3);
    ctx.fillRect(x + 9, y + 11, 3, 3);
    ctx.fillRect(x + 20, y + 11, 3, 3);
    // turn
    ctx.fillRect(x + 17, y + 14, 6, 3);
    // descender
    ctx.fillRect(x + 14, y + 17, 4, 3);
    // dot
    ctx.fillRect(x + 14, y + 23, 4, 4);
    // Outline
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x + 11, y + 8, 10, 1);
    ctx.fillRect(x + 14, y + 26, 4, 1);
  }
}

// ── Fire Flower drawing ───────────────────────────────────────────────────────

function drawFireFlower(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const cx = x + 16;
  const floatOff = Math.sin(performance.now() / 350) * 4;
  const fy = y - floatOff;

  // Stem
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(cx - 2, fy + 18, 4, 14);

  // Leaves
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 8, fy + 20, 8, 5);
  ctx.fillRect(cx + 2, fy + 24, 8, 5);

  // 4 petals (orange)
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.arc(cx, fy + 10, 6, 0, Math.PI * 2); ctx.fill();  // top
  ctx.beginPath(); ctx.arc(cx + 9, fy + 16, 6, 0, Math.PI * 2); ctx.fill();  // right
  ctx.beginPath(); ctx.arc(cx, fy + 22, 6, 0, Math.PI * 2); ctx.fill();  // bottom
  ctx.beginPath(); ctx.arc(cx - 9, fy + 16, 6, 0, Math.PI * 2); ctx.fill();  // left

  // Inner red petals
  ctx.fillStyle = '#dc2626';
  ctx.beginPath(); ctx.arc(cx, fy + 10, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 9, fy + 16, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, fy + 22, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx - 9, fy + 16, 3.5, 0, Math.PI * 2); ctx.fill();

  // Center white
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath(); ctx.arc(cx, fy + 16, 5, 0, Math.PI * 2); ctx.fill();
}

// ── Fireball drawing ──────────────────────────────────────────────────────────

function drawFireball(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const flicker = 0.7 + Math.sin(now / 40) * 0.3;

  ctx.save();
  ctx.shadowBlur = 16;
  ctx.shadowColor = '#f97316';

  // Outer glow
  ctx.globalAlpha = 0.4 * flicker;
  ctx.fillStyle = '#fde68a';
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();

  // Mid
  ctx.globalAlpha = 0.7 * flicker;
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();

  // Core
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fef08a';
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Piranha Plant drawing ─────────────────────────────────────────────────────

function drawPiranhaPlant(
  ctx: CanvasRenderingContext2D,
  x: number, pipeW: number, pipeH: number,
  visible: boolean, cam: number,
) {
  const platY = GROUND_Y - pipeH;
  const px = x - cam;

  // Pipe body
  ctx.fillStyle = '#15803d';
  ctx.fillRect(px, platY, pipeW, pipeH);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(px, platY, 6, pipeH);
  ctx.fillStyle = '#166534';
  ctx.fillRect(px + pipeW - 5, platY, 5, pipeH);
  // Pipe rim
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(px - 5, platY, pipeW + 10, 20);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(px - 5, platY, pipeW + 10, 4);
  ctx.fillStyle = '#166534';
  ctx.fillRect(px - 5, platY + 16, pipeW + 10, 4);

  if (!visible) return;

  // Stem poking out of top of pipe
  const stemX = px + pipeW / 2 - 6;
  const stemY = platY - 30;
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(stemX, stemY, 12, 38);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(stemX, stemY, 3, 38);

  // Head (open mouth facing up/right)
  const hx = px + pipeW / 2;
  const hy = stemY - 8;

  // Head body — green oval
  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.ellipse(hx, hy, 20, 16, 0, 0, Math.PI * 2); ctx.fill();

  // Inner mouth (red)
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(hx, hy - 4, 14, Math.PI, 0); // top half = open mouth
  ctx.fill();

  // Lips
  ctx.fillStyle = '#15803d';
  ctx.fillRect(hx - 20, hy - 6, 40, 5);

  // Teeth (white)
  ctx.fillStyle = '#fff';
  for (let t = 0; t < 4; t++) {
    ctx.fillRect(hx - 14 + t * 8, hy - 16, 5, 7);
    ctx.fillRect(hx - 10 + t * 8, hy - 4, 5, 6);
  }

  // Eyes (white circles with black pupils)
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(hx - 10, hy + 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 10, hy + 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a1a2f';
  ctx.beginPath(); ctx.arc(hx - 9, hy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 11, hy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MarioGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { sendInput } = useSocketActions();

  const playerRef = useRef<LocalPlayer>({
    x: PLAYER_START.x, y: PLAYER_START.y, vx: 0, vy: 0,
    onGround: false, facing: 1,
    powerUp: null, powerUpExpiry: 0,
    finished: false, dead: false, respawnAt: 0, jumpPressed: false,
    walkPhase: 0,
    slowed: false, slowUntil: 0,
    fireballCooldown: 0,
  });

  const remotePlayers = useRef<Map<string, RemotePlayer & { lastX?: number }>>(new Map());
  const goombasRef = useRef<GoombaClient[]>([]);
  const blocksRef = useRef<BlockClient[]>(QUESTION_BLOCKS.map(b => ({ ...b, hit: false, bounceAt: 0 })));
  const powerUpsRef = useRef<PowerUpClient[]>([]);
  const fireballsRef = useRef<Fireball[]>([]);
  const camRef = useRef({ x: 0 });
  const inputRef = useRef({ left: false, right: false, jump: false, fire: false, firePrev: false });
  const lastSendRef = useRef(0);
  const animRef = useRef(0);
  const lastTimeRef = useRef(0);
  const finishedMsgRef = useRef('');
  const fireballIdRef = useRef(0);

  // ── Server state sync ──────────────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = getSocket() as any;
    const myId = getSocket().id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onState = (data: any) => {
      for (const [id, s] of Object.entries(data.players as Record<string, RemotePlayer>)) {
        if (id === myId) continue;
        const prev = remotePlayers.current.get(id);
        const facing = prev?.lastX !== undefined && s.x !== prev.lastX
          ? (s.x > prev.lastX ? 1 : -1)
          : prev?.facing ?? 1;
        remotePlayers.current.set(id, { ...s, lastX: s.x, facing });
      }
      // Server-authoritative goombas
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      goombasRef.current = (data.goombas as any[]).map((g: any) => {
        const existing = goombasRef.current.find(e => e.id === g.id);
        return { id: g.id, x: g.x, y: g.y, alive: g.alive, squishAt: existing?.squishAt ?? 0 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      powerUpsRef.current = (data.powerUps as any[]).map((p: any) => ({ id: p.id, x: p.x, y: p.y, type: p.type }));
      // Sync block state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const sb of (data.blocks as any[])) {
        const local = blocksRef.current.find(b => b.id === sb.id);
        if (local && sb.hit && !local.hit) {
          local.hit = true;
          local.bounceAt = performance.now();
        }
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onBlockHit = (data: any) => {
      const block = blocksRef.current.find(b => b.id === data.blockId);
      if (block) { block.hit = true; block.bounceAt = performance.now(); }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onStomp = (data: any) => {
      const g = goombasRef.current.find(g => g.id === data.goombaId);
      if (g) { g.alive = false; g.squishAt = performance.now(); }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onFinish = (data: any) => {
      if (data.playerId === myId) {
        finishedMsgRef.current = `🏁 You finished #${data.rank}! +${data.points} pts`;
        playerRef.current.finished = true;
        mario_finish();
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onHit = (data: any) => {
      if (data.targetId === myId) {
        const p = playerRef.current;
        p.dead = true;
        p.respawnAt = performance.now() + 3000;
        p.x = Math.max(80, p.x - 200);
        p.y = PLAYER_START.y;
        p.vx = 0; p.vy = 0;
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSlow = (data: any) => {
      if (data.targetId === myId) {
        const p = playerRef.current;
        p.slowed = true;
        p.slowUntil = performance.now() + 3000;
      }
    };

    socket.on('mario:state', onState);
    socket.on('mario:block_hit', onBlockHit);
    socket.on('mario:goomba_stomped', onStomp);
    socket.on('mario:player_finished', onFinish);
    socket.on('mario:player_hit', onHit);
    socket.on('mario:player_slow', onSlow);

    return () => {
      socket.off('mario:state', onState);
      socket.off('mario:block_hit', onBlockHit);
      socket.off('mario:goomba_stomped', onStomp);
      socket.off('mario:player_finished', onFinish);
      socket.off('mario:player_hit', onHit);
      socket.off('mario:player_slow', onSlow);
    };
  }, []);

  // ── Input ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        if (!e.repeat) inputRef.current.jump = true;
        e.preventDefault();
      }
      if (e.key === 'f' || e.key === 'F') inputRef.current.fire = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') inputRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') inputRef.current.jump = false;
      if (e.key === 'f' || e.key === 'F') inputRef.current.fire = false;
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

    // Power-up expiry (fire doesn't expire on time, consumed on throw)
    if (p.powerUp && p.powerUp !== 'fire' && now > p.powerUpExpiry) p.powerUp = null;

    // Slow effect expiry
    if (p.slowed && now > p.slowUntil) p.slowed = false;

    const speed = WALK_SPEED * (p.powerUp === 'speed' ? SPEED_MULT : 1) * (p.slowed && now < p.slowUntil ? 0.45 : 1);

    if (inp.left) { p.vx = -speed; p.facing = -1; }
    else if (inp.right) { p.vx = speed; p.facing = 1; }
    else p.vx = 0;

    // Walk animation phase
    if (Math.abs(p.vx) > 5 && p.onGround) p.walkPhase += dt * 8;

    // Jump
    if (inp.jump && p.onGround && !p.jumpPressed) {
      p.vy = JUMP_FORCE;
      p.onGround = false;
      mario_jump();
    }
    p.jumpPressed = inp.jump;

    // Fire flower throw (F key)
    if (inp.fire && !inp.firePrev && p.powerUp === 'fire' && p.fireballCooldown < now) {
      // Spawn fireball
      const fb: Fireball = {
        id: fireballIdRef.current++,
        x: p.x + PLAYER_W / 2,
        y: p.y + PLAYER_H / 2,
        vx: p.facing * 500,
        vy: -200,
        spawnedAt: now,
        bounced: false,
        bounceCount: 0,
      };
      fireballsRef.current.push(fb);
      // Consume fire powerup
      p.powerUp = null;
      p.fireballCooldown = now + 500;
    }
    inp.firePrev = inp.fire;

    // Gravity
    p.vy += GRAVITY * dt;
    if (p.vy > 1200) p.vy = 1200;

    // Save prev for "was above/below" checks
    const prevBottom = p.y + PLAYER_H;
    const prevTop = p.y;

    // Apply velocity
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Clamp horizontal
    p.x = Math.max(0, Math.min(LEVEL_WIDTH - PLAYER_W, p.x));

    // ── Ground ──
    p.onGround = false;
    if (p.y + PLAYER_H >= GROUND_Y) {
      p.y = GROUND_Y - PLAYER_H;
      p.vy = 0;
      p.onGround = true;
    }

    // ── Platforms (one-way: land on top only) ──
    for (const plat of PLATFORMS) {
      const inX = p.x + PLAYER_W > plat.x + 2 && p.x < plat.x + plat.w - 2;
      if (!inX) continue;
      const playerBottom = p.y + PLAYER_H;
      const wasAbove = prevBottom <= plat.y + 1;
      if (wasAbove && playerBottom >= plat.y && playerBottom <= plat.y + plat.h + 5 && p.vy >= 0) {
        p.y = plat.y - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
      }
    }

    // ── Question blocks (solid; hit from below = activate) ──
    for (const block of blocksRef.current) {
      const blockLeft = block.x;
      const blockRight = block.x + BLOCK_SIZE;
      const blockTop = block.y;
      const blockBottom = block.y + BLOCK_SIZE;

      const inX = p.x + PLAYER_W > blockLeft + 2 && p.x < blockRight - 2;
      const inY = p.y + PLAYER_H > blockTop && p.y < blockBottom;

      if (!inX || !inY) continue;

      // Hit from below: player's top was below the block last frame, now overlapping
      const wasBelow = prevTop >= blockBottom - 1;
      if (wasBelow && p.vy < 0) {
        p.y = blockBottom;
        p.vy = 60; // small bounce down
        if (!block.hit) {
          block.hit = true; // mark locally to prevent re-sends
          block.bounceAt = now;
          mario_blockHit();
          sendInput('block_hit', { blockId: block.id });
        }
        continue;
      }

      // Land on top
      const wasAbove = prevBottom <= blockTop + 1;
      if (wasAbove && p.vy >= 0) {
        p.y = blockTop - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
        continue;
      }

      // Side collision: push player out horizontally
      const playerCenterX = p.x + PLAYER_W / 2;
      const blockCenterX = blockLeft + BLOCK_SIZE / 2;
      if (playerCenterX < blockCenterX) {
        p.x = blockLeft - PLAYER_W;
      } else {
        p.x = blockRight;
      }
    }

    // ── Power-up collection ──
    powerUpsRef.current = powerUpsRef.current.filter(pu => {
      const dx = Math.abs(p.x + PLAYER_W / 2 - (pu.x + 16));
      const dy = Math.abs(p.y + PLAYER_H / 2 - (pu.y + 16));
      if (dx < 32 && dy < 36) {
        mario_powerUp();
        sendInput('powerup_collect', { powerUpId: pu.id });
        p.powerUp = pu.type;
        p.powerUpExpiry = now + 8000;
        return false;
      }
      return true;
    });

    // ── Fireball physics ──
    fireballsRef.current = fireballsRef.current.filter(fb => {
      // Remove after 2.5s or if bounced twice
      if (now - fb.spawnedAt > 2500 || fb.bounceCount >= 2) return false;

      fb.x += fb.vx * dt;
      fb.vy += GRAVITY * dt;
      fb.y += fb.vy * dt;

      // Bounce off ground
      if (fb.y >= GROUND_Y - 8 && !fb.bounced) {
        fb.vy *= -0.6;
        fb.y = GROUND_Y - 8;
        fb.bounced = true;
        fb.bounceCount++;
      } else if (fb.y >= GROUND_Y - 8 && fb.bounced) {
        fb.bounceCount++;
      }

      // Check fireball vs remote players
      for (const [id, rp] of remotePlayers.current) {
        if (rp.dead || rp.finished) continue;
        const dx = Math.abs(fb.x - (rp.x + PLAYER_W / 2));
        const dy = Math.abs(fb.y - (rp.y + PLAYER_H / 2));
        if (dx < 40 && dy < 60) {
          sendInput('fire_hit', { targetId: id });
          return false; // remove fireball on hit
        }
      }

      return true;
    });

    // ── Piranha Plant collision ──
    for (const pipe of PIRANHA_PIPES) {
      const pipeH = pipe.pipeH;
      const platY = GROUND_Y - pipeH;
      // Piranha is up when sin > 0
      const up = Math.sin(now / 1500) > 0;
      if (up) {
        // Plant box (head area)
        const plantBox = { x: pipe.x + 10, y: platY - 48, w: pipe.pipeW - 20, h: 48 };
        const inX = p.x + PLAYER_W > plantBox.x && p.x < plantBox.x + plantBox.w;
        const inY = p.y + PLAYER_H > plantBox.y && p.y < plantBox.y + plantBox.h;
        if (inX && inY && !p.dead) {
          p.dead = true;
          p.respawnAt = now + 2500;
          p.vy = -350;
        }
      }
    }

    // ── Goombas ──
    for (const g of goombasRef.current) {
      if (!g.alive) continue;
      const goombaTop = g.y;
      const goombaBottom = g.y + GOOMBA_H;
      const goombaLeft = g.x;
      const goombaRight = g.x + GOOMBA_W;

      const xOver = p.x + PLAYER_W > goombaLeft + 2 && p.x < goombaRight - 2;
      const yOver = p.y + PLAYER_H > goombaTop && p.y < goombaBottom;
      if (!xOver || !yOver) continue;

      // Stomping = player was above goomba's top last frame AND moving downward
      const wasAbove = prevBottom <= goombaTop + 4;
      const stomping = wasAbove && p.vy > 0;

      if (stomping) {
        g.alive = false;
        g.squishAt = now;
        p.vy = -380;
        p.y = goombaTop - PLAYER_H;
        mario_stomp();
        sendInput('goomba_stomp', { goombaId: g.id });
      } else if (p.powerUp === 'star') {
        g.alive = false;
        g.squishAt = now;
        sendInput('goomba_stomp', { goombaId: g.id });
      } else if (!p.dead) {
        p.dead = true;
        p.respawnAt = now + 2500;
        p.vy = -350;
      }
    }

    // Star: hit other players
    if (p.powerUp === 'star') {
      for (const [id, rp] of remotePlayers.current) {
        if (rp.finished || rp.dead || rp.powerUp === 'star') continue;
        const dx = Math.abs(p.x - rp.x);
        const dy = Math.abs(p.y - rp.y);
        if (dx < 50 && dy < 60) sendInput('player_hit', { targetId: id });
      }
    }

    // Reach pipe
    if (!p.finished && p.x + PLAYER_W > PIPE.x + 10 && p.y + PLAYER_H > PIPE.y + 20) {
      p.finished = true;
      sendInput('level_complete', {});
    }

    // Camera follow
    const targetCamX = p.x - CANVAS_W * 0.35;
    camRef.current.x += (targetCamX - camRef.current.x) * Math.min(1, dt * 6);
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

    // RESET state — fixes after-image
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.imageSmoothingEnabled = false;

    const cam = camRef.current.x;
    const now = performance.now();
    const p = playerRef.current;

    // Sky — Star Road section has a slightly different sky tint
    const starRoadFactor = Math.min(1, Math.max(0, (p.x - 4600) / 400));
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    if (starRoadFactor > 0.5) {
      // Purple star road sky
      grad.addColorStop(0, '#2d1b69');
      grad.addColorStop(1, '#7c3aed');
    } else {
      grad.addColorStop(0, '#5b9bd5');
      grad.addColorStop(1, '#9ed0f5');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Star Road: draw stars in background
    if (starRoadFactor > 0.3) {
      ctx.globalAlpha = starRoadFactor * 0.8;
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 137 + 50 - cam * 0.05) % CANVAS_W + CANVAS_W) % CANVAS_W;
        const sy = ((i * 89 + 20) % 200);
        const size = 1 + (i % 3);
        ctx.fillRect(sx, sy, size, size);
      }
      ctx.globalAlpha = 1;
    }

    // Background hills (parallax)
    ctx.fillStyle = starRoadFactor > 0.5 ? 'rgba(109,40,217,0.35)' : 'rgba(34,139,80,0.45)';
    for (let i = 0; i < 12; i++) {
      const hx = ((i * 500 - cam * 0.25) % 2400 + 2400) % 2400 - 200;
      ctx.beginPath();
      ctx.arc(hx, GROUND_Y, 240, Math.PI, 0);
      ctx.fill();
    }

    // Clouds
    ctx.fillStyle = starRoadFactor > 0.5 ? 'rgba(167,139,250,0.7)' : '#fff';
    const clouds = [{ x: 150, y: 90 }, { x: 700, y: 60 }, { x: 1200, y: 110 }, { x: 1700, y: 70 }, { x: 2300, y: 90 }];
    for (const c of clouds) {
      const cx = ((c.x - cam * 0.15) % 2200 + 2200) % 2200 - 100;
      ctx.beginPath(); ctx.arc(cx, c.y, 22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 26, c.y - 8, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 48, c.y, 22, 0, Math.PI * 2); ctx.fill();
    }

    // Ground
    // Grass top stripe — purple in star road
    ctx.fillStyle = starRoadFactor > 0.5 ? '#7c3aed' : '#5fc34a';
    ctx.fillRect(-cam, GROUND_Y, LEVEL_WIDTH, 16);
    ctx.fillStyle = starRoadFactor > 0.5 ? '#6d28d9' : '#3f9c2b';
    ctx.fillRect(-cam, GROUND_Y + 14, LEVEL_WIDTH, 4);
    // Dirt
    ctx.fillStyle = '#c97e2c';
    ctx.fillRect(-cam, GROUND_Y + 18, LEVEL_WIDTH, CANVAS_H - GROUND_Y - 18);
    // Dirt block pattern
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let bx = Math.floor(cam / 40) * 40; bx < cam + CANVAS_W + 40; bx += 40) {
      for (let by = GROUND_Y + 18; by < CANVAS_H; by += 40) {
        const offset = (Math.floor(by / 40) % 2) * 20;
        ctx.strokeRect(bx + offset - cam, by, 40, 40);
      }
    }
    // Dark line below grass
    ctx.fillStyle = '#7a4c1a';
    ctx.fillRect(-cam, GROUND_Y + 18, LEVEL_WIDTH, 2);

    // Platforms — brick style
    for (const plat of PLATFORMS) {
      const px = plat.x - cam;
      if (px + plat.w < -20 || px > CANVAS_W + 20) continue;
      // Star Road platforms: slightly purple tinted
      const isStarRoad = plat.x >= 4700;
      ctx.fillStyle = isStarRoad ? '#5b21b6' : '#8b4513';
      ctx.fillRect(px, plat.y, plat.w, plat.h);
      ctx.fillStyle = isStarRoad ? '#7c3aed' : '#a0623c';
      ctx.fillRect(px, plat.y, plat.w, 3);
      ctx.fillStyle = isStarRoad ? '#4c1d95' : '#6b3410';
      ctx.fillRect(px, plat.y + plat.h - 3, plat.w, 3);
      // Brick lines
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let bx = 0; bx < plat.w; bx += 20) {
        ctx.beginPath();
        ctx.moveTo(px + bx, plat.y);
        ctx.lineTo(px + bx, plat.y + plat.h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(px, plat.y + plat.h / 2);
      ctx.lineTo(px + plat.w, plat.y + plat.h / 2);
      ctx.stroke();
    }

    // Question blocks
    for (const block of blocksRef.current) {
      const bx = block.x - cam;
      if (bx + BLOCK_SIZE < -10 || bx > CANVAS_W + 10) continue;
      const bounce = block.bounceAt > 0 && now - block.bounceAt < 300
        ? -Math.sin(((now - block.bounceAt) / 300) * Math.PI) * 10
        : 0;
      drawBlock(ctx, bx, block.y + bounce, block.hit, block.powerUp ?? undefined);
    }

    // Power-ups
    for (const pu of powerUpsRef.current) {
      const px = pu.x - cam;
      if (px < -40 || px > CANVAS_W + 40) continue;
      const floatY = pu.y - Math.sin(now / 350) * 4;
      if (pu.type === 'fire') {
        // Fire flower
        drawFireFlower(ctx, px, floatY);
      } else if (pu.type === 'speed') {
        // Mushroom
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(px + 4, floatY + 2, 24, 14);
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + 8, floatY + 6, 5, 5);
        ctx.fillRect(px + 19, floatY + 6, 5, 5);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(px + 6, floatY + 16, 20, 12);
        ctx.fillStyle = '#0a1a2f';
        ctx.fillRect(px + 11, floatY + 19, 3, 4);
        ctx.fillRect(px + 18, floatY + 19, 3, 4);
      } else {
        // Star
        const flash = Math.floor(now / 100) % 2 === 0;
        ctx.fillStyle = flash ? '#fde047' : '#fbbf24';
        // 5-point star approximation
        const cx = px + 16, cy = floatY + 16;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 14 : 6;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const sx = cx + Math.cos(a) * r;
          const sy = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0a1a2f';
        ctx.fillRect(cx - 4, cy - 2, 2, 3);
        ctx.fillRect(cx + 2, cy - 2, 2, 3);
      }
    }

    // Piranha plants
    for (const pipe of PIRANHA_PIPES) {
      const pipeX = pipe.x - cam;
      if (pipeX + pipe.pipeW < -100 || pipeX > CANVAS_W + 100) continue;
      const visible = Math.sin(now / 1500) > 0;
      drawPiranhaPlant(ctx, pipe.x, pipe.pipeW, pipe.pipeH, visible, cam);
    }

    // End pipe
    const pipeX = PIPE.x - cam;
    if (pipeX < CANVAS_W + 120 && pipeX > -PIPE.w - 20) {
      // Pipe body
      ctx.fillStyle = '#15803d';
      ctx.fillRect(pipeX, PIPE.y + 28, PIPE.w, PIPE.h - 28);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(pipeX, PIPE.y + 28, 8, PIPE.h - 28);
      ctx.fillStyle = '#166534';
      ctx.fillRect(pipeX + PIPE.w - 6, PIPE.y + 28, 6, PIPE.h - 28);
      // Pipe rim
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(pipeX - 6, PIPE.y, PIPE.w + 12, 28);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(pipeX - 6, PIPE.y, PIPE.w + 12, 5);
      ctx.fillStyle = '#166534';
      ctx.fillRect(pipeX - 6, PIPE.y + 23, PIPE.w + 12, 5);
      // Flag above
      ctx.font = '32px serif';
      ctx.fillText('🏁', pipeX + PIPE.w / 2 - 16, PIPE.y - 10);
    }

    // Goombas
    for (const g of goombasRef.current) {
      const gx = g.x - cam;
      if (gx + GOOMBA_W < -10 || gx > CANVAS_W + 10) continue;
      const deadFor = g.squishAt > 0 ? now - g.squishAt : -1;
      if (!g.alive && deadFor > 800) continue;
      const squished = !g.alive && deadFor >= 0;
      drawGoomba(ctx, gx, g.y, squished);
    }

    // Fireballs
    for (const fb of fireballsRef.current) {
      const fbx = fb.x - cam;
      if (fbx < -30 || fbx > CANVAS_W + 30) continue;
      drawFireball(ctx, fbx, fb.y, now);
    }

    // Remote players
    const room = useGameStore.getState().room;
    for (const [id, rp] of remotePlayers.current) {
      if (rp.dead) continue;
      const rpx = rp.x - cam;
      if (rpx + PLAYER_W < -50 || rpx > CANVAS_W + 50) continue;
      const pl = room?.players.find(pl => pl.socketId === id);
      if (!pl) continue;
      const facing = (rp.facing as 1 | -1) ?? 1;
      const walking = rp.lastX !== undefined && Math.abs(rp.x - (rp.lastX ?? rp.x)) > 0.5;
      drawMario(ctx, rpx, rp.y, pl.color, facing, walking, now / 100, rp.powerUp === 'star', rp.powerUp === 'speed', false, rp.powerUp === 'fire');

      // Slowed: blue sparkle overlay
      if (rp.slowed) {
        ctx.globalAlpha = 0.4 + Math.sin(now / 150) * 0.2;
        ctx.fillStyle = '#93c5fd';
        ctx.fillRect(rpx - 2, rp.y - 2, PLAYER_W + 4, PLAYER_H + 4);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3b82f6';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❄️', rpx + PLAYER_W / 2, rp.y - 4);
        ctx.textAlign = 'left';
      }

      // Name above
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(rpx + PLAYER_W / 2 - 30, rp.y - 18, 60, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pl.username.slice(0, 8), rpx + PLAYER_W / 2, rp.y - 8);
      ctx.textAlign = 'left';

      if (rp.finished) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '16px serif';
        ctx.fillText(`🏆#${rp.rank}`, rpx + PLAYER_W / 2 - 16, rp.y - 22);
      }
    }

    // Local player
    if (!p.dead) {
      const myRoom = useGameStore.getState().room;
      const myId = getSocket().id;
      const myPlayer = myRoom?.players.find(pl => pl.id === myId);
      const color = myPlayer?.color ?? '#dc2626';
      const lx = p.x - cam;
      const walking = Math.abs(p.vx) > 5 && p.onGround;

      // Slow: ice blue overlay
      if (p.slowed && now < p.slowUntil) {
        ctx.globalAlpha = 0.35 + Math.sin(now / 120) * 0.15;
        ctx.fillStyle = '#bfdbfe';
        ctx.fillRect(lx - 2, p.y - 2, PLAYER_W + 4, PLAYER_H + 4);
        ctx.globalAlpha = 1;
      }

      drawMario(ctx, lx, p.y, color, p.facing, walking, p.walkPhase, p.powerUp === 'star', p.powerUp === 'speed', false, p.powerUp === 'fire');

      // YOU label — pulsing arrow above player
      const youPulse = 0.6 + 0.4 * Math.sin(now * 0.004);
      ctx.fillStyle = `rgba(255,255,255,${youPulse})`;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      const youX = lx + PLAYER_W / 2;
      // Pill background
      ctx.fillStyle = `rgba(0,0,0,${0.45 * youPulse})`;
      ctx.beginPath();
      (ctx as CanvasRenderingContext2D & { roundRect: (x:number, y:number, w:number, h:number, r:number) => void })
        .roundRect?.(youX - 22, p.y - 22, 44, 14, 4) ?? ctx.fillRect(youX - 22, p.y - 22, 44, 14);
      ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${youPulse})`;
      ctx.fillText('YOU ▼', youX, p.y - 12);
      ctx.textAlign = 'left';
    } else {
      const remaining = Math.ceil((p.respawnAt - now) / 1000);
      const lx = p.x - cam;
      ctx.fillStyle = 'rgba(239,68,68,0.8)';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`💀 ${Math.max(0, remaining)}`, lx + PLAYER_W / 2, p.y + 20);
      ctx.textAlign = 'left';
    }

    // HUD power-up
    if (p.powerUp) {
      const remaining = Math.max(0, (p.powerUpExpiry - now) / 1000);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(10, 10, 200, 36);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      if (p.powerUp === 'star') {
        ctx.fillText(`⭐ STAR  ${remaining.toFixed(1)}s`, 18, 33);
      } else if (p.powerUp === 'speed') {
        ctx.fillText(`🍄 SPEED  ${remaining.toFixed(1)}s`, 18, 33);
      } else if (p.powerUp === 'fire') {
        ctx.fillText('🔥 FIRE FLOWER  [F] to throw', 18, 33);
      }
    }

    // HUD slow indicator
    if (p.slowed && now < p.slowUntil) {
      const slowRemaining = ((p.slowUntil - now) / 1000).toFixed(1);
      ctx.fillStyle = 'rgba(59,130,246,0.7)';
      ctx.fillRect(10, 52, 150, 28);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`❄️ SLOWED  ${slowRemaining}s`, 18, 71);
    }

    // Progress bar
    const progress = Math.min(1, p.x / (PIPE.x - 100));
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(CANVAS_W / 2 - 160, CANVAS_H - 28, 320, 14);
    ctx.fillStyle = p.powerUp === 'star' ? '#fde047' : p.powerUp === 'fire' ? '#f97316' : '#7c3aed';
    ctx.fillRect(CANVAS_W / 2 - 158, CANVAS_H - 26, 316 * progress, 10);
    ctx.font = '11px serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('🏁', CANVAS_W / 2 + 145, CANVAS_H - 17);

    // Finish msg
    if (finishedMsgRef.current) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(CANVAS_W / 2 - 180, CANVAS_H / 2 - 30, 360, 60);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(finishedMsgRef.current, CANVAS_W / 2, CANVAS_H / 2 + 8);
      ctx.textAlign = 'left';
    }
  }, []);

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
        Arrows / WASD to move • Space / Up to jump • Stomp Goombas from above • Jump UP into ? blocks • [F] throw fireball
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="rounded-xl border border-white/10 bg-black"
        style={{ maxWidth: '100%', touchAction: 'none', imageRendering: 'pixelated' }}
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
        <button
          className="w-14 h-14 rounded-xl bg-orange-500/40 border border-orange-500/60 text-white font-bold text-lg flex items-center justify-center active:bg-orange-500/60"
          onPointerDown={() => { inputRef.current.fire = true; }}
          onPointerUp={() => { inputRef.current.fire = false; }}
          onPointerCancel={() => { inputRef.current.fire = false; }}
        >🔥</button>
      </div>
    </div>
  );
}
