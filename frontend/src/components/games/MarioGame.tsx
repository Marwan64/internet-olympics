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

const QUESTION_BLOCKS = [
  { id: 'b0',  x: 140,  y: 392, powerUp: 'speed' as const },
  { id: 'b1',  x: 590,  y: 232, powerUp: 'speed' as const },
  { id: 'b2',  x: 1200, y: 392, powerUp: 'star'  as const },
  { id: 'b3',  x: 1340, y: 192, powerUp: 'speed' as const },
  { id: 'b4',  x: 1570, y: 262, powerUp: 'speed' as const },
  { id: 'b5',  x: 2330, y: 212, powerUp: 'fire'  as const },
  { id: 'b6',  x: 2740, y: 392, powerUp: 'speed' as const },
  { id: 'b7',  x: 3090, y: 182, powerUp: 'speed' as const },
  { id: 'b8',  x: 3830, y: 282, powerUp: 'fire'  as const },
  { id: 'b9',  x: 4330, y: 172, powerUp: 'star'  as const },
  { id: 'b10', x: 5100, y: 272, powerUp: 'fire'  as const },
  { id: 'b11', x: 5470, y: 132, powerUp: 'star'  as const },
  { id: 'b12', x: 6020, y: 232, powerUp: 'speed' as const },
];

const PIRANHA_PIPES = [
  { x: 2310, pipeW: 80, pipeH: 80 },
  { x: 3720, pipeW: 80, pipeH: 80 },
];

// Decorative bushes along ground
const GROUND_BUSHES = [
  { x: 220,  w: 80,  h: 28, layers: 3 },
  { x: 650,  w: 60,  h: 22, layers: 2 },
  { x: 1150, w: 90,  h: 32, layers: 3 },
  { x: 1900, w: 70,  h: 26, layers: 2 },
  { x: 2500, w: 80,  h: 28, layers: 3 },
  { x: 3400, w: 65,  h: 24, layers: 2 },
  { x: 4100, w: 85,  h: 30, layers: 3 },
  { x: 5000, w: 75,  h: 28, layers: 2 },
  { x: 5700, w: 90,  h: 32, layers: 3 },
  { x: 6100, w: 60,  h: 22, layers: 2 },
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
  walkPhase: number;
  squashY: number;    // spring scale Y (1 = normal)
  squashVY: number;   // spring velocity
  slowed: boolean; slowUntil: number;
  fireballCooldown: number;
}

interface RemotePlayer { x: number; y: number; powerUp: string | null; finished: boolean; dead: boolean; rank: number; facing?: number; slowed: boolean }
interface GoombaClient { id: string; x: number; y: number; alive: boolean; squishAt: number }
interface BlockClient  { id: string; x: number; y: number; hit: boolean; bounceAt: number; powerUp: 'speed' | 'star' | 'fire' | null }
interface PowerUpClient { id: string; x: number; y: number; type: 'speed' | 'star' | 'fire' }
interface Fireball { id: number; x: number; y: number; vx: number; vy: number; spawnedAt: number; bounced: boolean; bounceCount: number }

// ── Particle system ───────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  born: number; duration: number;
  type: 'dust' | 'coin' | 'star' | 'spark' | 'confetti';
  color: string;
  size: number;
  rotation: number;
  rotV: number;
  gravity: number; // per-particle gravity
}

function mkParticle(partial: Omit<Particle, 'rotation' | 'rotV' | 'gravity'> & Partial<Particle>): Particle {
  return {
    rotation: 0, rotV: 0, gravity: 500,
    ...partial,
  };
}

function emitDust(particles: Particle[], x: number, y: number, speedX: number, now: number) {
  const count = 5;
  for (let i = 0; i < count; i++) {
    const spread = 0.9 + Math.random() * 0.8;
    const angle = Math.PI + (Math.random() - 0.5) * 1.4;
    const speed = 45 + Math.abs(speedX) * 0.2 + Math.random() * 55;
    particles.push(mkParticle({
      x: x + (Math.random() - 0.5) * 18,
      y: y + Math.random() * 4,
      vx: Math.cos(angle) * speed * spread,
      vy: -15 - Math.random() * 35,
      born: now, duration: 280 + Math.random() * 150,
      type: 'dust', color: '#c9904a', size: 2 + Math.random() * 3.5,
      gravity: 220,
    }));
  }
}

function emitCoin(particles: Particle[], x: number, y: number, now: number) {
  particles.push(mkParticle({
    x, y,
    vx: (Math.random() - 0.5) * 25,
    vy: -260,
    born: now, duration: 600,
    type: 'coin', color: '#fbbf24', size: 9,
    gravity: 700, rotV: 4 + Math.random() * 4,
  }));
}

function emitStomp(particles: Particle[], x: number, y: number, now: number) {
  for (let i = 0; i < 7; i++) {
    const angle = ((i / 7) * Math.PI * 2) - Math.PI / 2;
    const speed = 90 + Math.random() * 70;
    particles.push(mkParticle({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      born: now, duration: 380 + Math.random() * 180,
      type: 'star', color: i % 2 === 0 ? '#fbbf24' : '#fde047', size: 4 + Math.random() * 3,
      gravity: 380, rotV: (Math.random() - 0.5) * 10,
    }));
  }
}

function emitSpeedTrail(particles: Particle[], x: number, y: number, facing: number, now: number) {
  const trailX = x + (facing === 1 ? 2 : PLAYER_W - 2);
  particles.push(mkParticle({
    x: trailX + (Math.random() - 0.5) * 8,
    y: y + 18 + Math.random() * 18,
    vx: -facing * (30 + Math.random() * 40),
    vy: (Math.random() - 0.5) * 25,
    born: now, duration: 160 + Math.random() * 80,
    type: 'spark', color: Math.random() < 0.5 ? '#f97316' : '#fde68a',
    size: 2.5 + Math.random() * 3.5,
    gravity: 30,
  }));
}

function emitStarSparkle(particles: Particle[], x: number, y: number, now: number) {
  const hue = Math.floor(Math.random() * 360);
  particles.push(mkParticle({
    x: x + (Math.random() - 0.5) * PLAYER_W * 2.2,
    y: y + (Math.random() - 0.5) * PLAYER_H * 2,
    vx: (Math.random() - 0.5) * 90,
    vy: -70 - Math.random() * 90,
    born: now, duration: 380 + Math.random() * 250,
    type: 'star', color: `hsl(${hue},100%,62%)`, size: 3.5 + Math.random() * 4,
    gravity: 200, rotV: (Math.random() - 0.5) * 9,
  }));
}

function emitPowerUpCollect(particles: Particle[], x: number, y: number, color: string, now: number) {
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const speed = 70 + Math.random() * 90;
    particles.push(mkParticle({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      born: now, duration: 450,
      type: 'spark', color, size: 4 + Math.random() * 4,
      gravity: 350,
    }));
  }
}

function emitFinishConfetti(particles: Particle[], camX: number, now: number) {
  const colors = ['#f87171','#fb923c','#fbbf24','#4ade80','#60a5fa','#c084fc','#f472b6','#fff'];
  for (let i = 0; i < 48; i++) {
    particles.push(mkParticle({
      x: camX + Math.random() * CANVAS_W,
      y: -30 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 140,
      vy: 60 + Math.random() * 130,
      born: now, duration: 2800 + Math.random() * 1200,
      type: 'confetti', color: colors[Math.floor(Math.random() * colors.length)],
      size: 5 + Math.random() * 6,
      gravity: 80, rotV: (Math.random() - 0.5) * 10,
    }));
  }
}

// ── Mario sprite drawing ──────────────────────────────────────────────────────

function drawMario(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  facing: 1 | -1,
  walkPhase: number,
  moving: boolean,
  airborne: boolean,
  ascending: boolean,
  squashY = 1.0,
  starMode = false,
  speedMode = false,
  dead = false,
  fireMode = false,
) {
  const SKIN = '#fcd5b5';
  const HAIR = '#3a1f0a';
  const NAVY = '#1e3a8a';
  const SHOE = '#3d1b07';
  const BTN  = '#fcd34d';

  let capColor   = color;
  let shirtColor = color;
  if (starMode) {
    const hue = (performance.now() / 28) % 360;
    capColor   = `hsl(${hue},95%,55%)`;
    shirtColor = `hsl(${(hue + 180) % 360},95%,55%)`;
  } else if (fireMode) {
    capColor   = '#dc2626';
    shirtColor = '#f97316';
  } else if (speedMode) {
    shirtColor = '#f97316';
  }
  if (dead) { capColor = '#7f1d1d'; shirtColor = '#7f1d1d'; }

  const P = 4; // pixel unit

  // Walk frame (0-3)
  const walkFrame = moving && !airborne ? Math.floor(walkPhase * 2) % 4 : 0;

  // Squash/stretch: pivot at feet (bottom center)
  const clampedSY = Math.max(0.5, Math.min(1.5, squashY));
  const clampedSX = 1 + (1 - clampedSY) * 0.45;

  ctx.save();
  // Squash pivot = bottom-center of player
  const pivotX = x + PLAYER_W / 2;
  const pivotY = y + PLAYER_H;
  ctx.translate(pivotX, pivotY);
  ctx.scale(facing === -1 ? -clampedSX : clampedSX, clampedSY);
  ctx.translate(-PLAYER_W / 2, -PLAYER_H);

  // ── Dead spin (draw X eyes + grey) ──
  if (dead) {
    ctx.fillStyle = shirtColor;
    ctx.fillRect(0, P, 9 * P, 11 * P);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💀', PLAYER_W / 2, PLAYER_H * 0.6);
    ctx.restore();
    return;
  }

  // ── Cap ──
  ctx.fillStyle = capColor;
  ctx.fillRect(2 * P, 0, 5 * P, 2 * P);          // crown
  ctx.fillRect(P, 2 * P, 7 * P, P);               // brim
  ctx.fillRect(0, 2 * P, P, P);                   // brim tip

  // ── Hair ──
  ctx.fillStyle = HAIR;
  ctx.fillRect(P, 3 * P, P, P);
  ctx.fillRect(7 * P, 3 * P, P, P);
  ctx.fillRect(P, 4 * P, P, P);

  // ── Face ──
  ctx.fillStyle = SKIN;
  ctx.fillRect(2 * P, 3 * P, 5 * P, 2 * P);
  ctx.fillRect(7 * P, 4 * P, P, P); // ear

  // ── Eyes ──
  ctx.fillStyle = '#fff';
  ctx.fillRect(3 * P, 3 * P + P / 2, P, P);
  ctx.fillRect(5 * P, 3 * P + P / 2, P, P);
  ctx.fillStyle = '#0a1a2f';
  ctx.fillRect(3 * P + P / 2, 3 * P + P, P / 2, P / 2);
  ctx.fillRect(5 * P + P / 2, 3 * P + P, P / 2, P / 2);

  // ── Nose ──
  ctx.fillStyle = SKIN;
  ctx.fillRect(4 * P, 4 * P, P, P);
  ctx.fillStyle = '#e8b48e';
  ctx.fillRect(4 * P, 4 * P + P - 1, P, 1);

  // ── Mustache ──
  ctx.fillStyle = HAIR;
  ctx.fillRect(3 * P, 5 * P, 3 * P, P);
  ctx.fillRect(2 * P, 5 * P + P / 2, P, P / 2);

  // ── Neck ──
  ctx.fillStyle = SKIN;
  ctx.fillRect(3 * P, 5 * P + P, 2 * P, P / 2);

  // ── Shirt / torso ──
  ctx.fillStyle = shirtColor;
  ctx.fillRect(P, 6 * P, 7 * P, 2 * P);

  // ── Overalls ──
  ctx.fillStyle = NAVY;
  ctx.fillRect(2 * P, 8 * P, 5 * P, 2 * P);
  ctx.fillRect(2 * P + P / 2, 6 * P + P / 2, P, 2 * P); // left strap
  ctx.fillRect(5 * P + P / 2, 6 * P + P / 2, P, 2 * P); // right strap
  ctx.fillStyle = BTN;
  ctx.fillRect(2 * P + P / 2, 8 * P, P / 2, P / 2);
  ctx.fillRect(6 * P,          8 * P, P / 2, P / 2);

  // ── Arms — vary by walk frame / air pose ──
  ctx.fillStyle = shirtColor;
  if (airborne && ascending) {
    // Arms raised overhead
    ctx.fillRect(0,      4 * P, P, 3 * P);  // left arm up
    ctx.fillRect(8 * P,  4 * P, P, 3 * P);  // right arm up
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,     3 * P, P, P);       // left glove
    ctx.fillRect(8 * P, 3 * P, P, P);
  } else if (airborne) {
    // Arms spread wide (falling)
    ctx.fillRect(0,      7 * P, P, 2 * P);
    ctx.fillRect(8 * P,  7 * P, P, 2 * P);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,     9 * P, P, P);
    ctx.fillRect(8 * P, 9 * P, P, P);
  } else if (walkFrame === 1) {
    // Right leg forward → left arm swings forward (up)
    ctx.fillRect(0,     6 * P,     P, 2 * P); // left arm up
    ctx.fillRect(8 * P, 7 * P + 2, P, 2 * P); // right arm back/down
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,     8 * P, P, P);
    ctx.fillRect(8 * P, 9 * P, P, P);
  } else if (walkFrame === 3) {
    // Left leg forward → right arm swings forward
    ctx.fillRect(0,     7 * P + 2, P, 2 * P); // left arm back
    ctx.fillRect(8 * P, 6 * P,     P, 2 * P); // right arm up
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,     9 * P, P, P);
    ctx.fillRect(8 * P, 8 * P, P, P);
  } else {
    // Stand / mid-stride
    ctx.fillRect(0,     6 * P + P, P, 2 * P);
    ctx.fillRect(8 * P, 6 * P + P, P, 2 * P);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,     9 * P, P, P);
    ctx.fillRect(8 * P, 9 * P, P, P);
  }

  // ── Shoes — vary by walk frame / air pose ──
  ctx.fillStyle = SHOE;
  if (airborne && ascending) {
    // Legs tucked together forward
    ctx.fillRect(2 * P, 10 * P, 5 * P, 2 * P);
    // Sole highlight
    ctx.fillStyle = '#5a2e0f';
    ctx.fillRect(2 * P, 11 * P + 3, 5 * P, 1);
  } else if (airborne) {
    // Legs trailing behind/below
    ctx.fillRect(P,     10 * P + P / 2, 3 * P, P + 2);
    ctx.fillRect(5 * P, 10 * P + P / 2, 3 * P, P + 2);
  } else if (walkFrame === 1) {
    // Right leg forward, left trailing back
    ctx.fillRect(0,     10 * P + P / 2, 3 * P, P + 2); // left back
    ctx.fillRect(5 * P, 10 * P,         4 * P, 2 * P); // right forward
    ctx.fillStyle = '#5a2e0f';
    ctx.fillRect(5 * P, 11 * P + 3, 4 * P, 1);
  } else if (walkFrame === 3) {
    // Left leg forward, right trailing back
    ctx.fillRect(P,     10 * P,         4 * P, 2 * P); // left forward
    ctx.fillRect(6 * P, 10 * P + P / 2, 3 * P, P + 2); // right back
    ctx.fillStyle = '#5a2e0f';
    ctx.fillRect(P, 11 * P + 3, 4 * P, 1);
  } else {
    // Stand
    ctx.fillRect(P,     10 * P, 3 * P, 2 * P);
    ctx.fillRect(5 * P, 10 * P, 3 * P, 2 * P);
    ctx.fillStyle = '#5a2e0f';
    ctx.fillRect(P, 11 * P + 3, 3 * P, 1);
    ctx.fillRect(5 * P, 11 * P + 3, 3 * P, 1);
  }

  // ── Speed mode: motion streaks behind ──
  if (speedMode && !fireMode && !airborne) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-P * 2, 7 * P,        P * 1.5, P / 2);
    ctx.fillRect(-P * 3, 8 * P + P,    P * 2,   P / 2);
    ctx.fillRect(-P * 2, 9 * P + P,    P * 1.5, P / 2);
  }

  // ── Fire mode: side flames ──
  if (fireMode) {
    ctx.globalAlpha = 0.55 + Math.sin(performance.now() / 75) * 0.3;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(-P,    7 * P, P, P * 2);
    ctx.fillRect(9 * P, 7 * P, P, P * 2);
    ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 50) * 0.2;
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(-P - 2, 8 * P, 2, P);
    ctx.fillRect(9 * P + P, 8 * P, 2, P);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Goomba drawing ────────────────────────────────────────────────────────────

function drawGoomba(ctx: CanvasRenderingContext2D, x: number, y: number, squished: boolean, now: number) {
  if (squished) {
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x, y + GOOMBA_H - 8, GOOMBA_W, 8);
    ctx.fillStyle = '#3d2410';
    ctx.fillRect(x + 4, y + GOOMBA_H - 4, GOOMBA_W - 8, 2);
    // Stars burst for fresh squish
    return;
  }

  // Body
  ctx.fillStyle = '#8b4513';
  ctx.fillRect(x + 4, y,     GOOMBA_W - 8, 6);
  ctx.fillRect(x + 2, y + 4, GOOMBA_W - 4, 6);
  ctx.fillRect(x,     y + 8, GOOMBA_W,     10);
  // Underbelly
  ctx.fillStyle = '#d2a679';
  ctx.fillRect(x + 6, y + 18, GOOMBA_W - 12, 8);

  // Animated feet (2-frame based on time)
  const footFrame = Math.floor(now / 180) % 2;
  ctx.fillStyle = '#3d2410';
  if (footFrame === 0) {
    ctx.fillRect(x + 2,            y + GOOMBA_H - 9, 11, 9);
    ctx.fillRect(x + GOOMBA_W - 13, y + GOOMBA_H - 7, 11, 7);
  } else {
    ctx.fillRect(x + 2,            y + GOOMBA_H - 7, 11, 7);
    ctx.fillRect(x + GOOMBA_W - 13, y + GOOMBA_H - 9, 11, 9);
  }

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 7,            y + 10, 8, 8);
  ctx.fillRect(x + GOOMBA_W - 15, y + 10, 8, 8);
  ctx.fillStyle = '#0a1a2f';
  ctx.fillRect(x + 7,            y + 13, 4, 4);
  ctx.fillRect(x + GOOMBA_W - 11, y + 13, 4, 4);
  // Angry eyebrows
  ctx.fillStyle = '#3d2410';
  ctx.fillRect(x + 5,            y + 8, 8, 2);
  ctx.fillRect(x + GOOMBA_W - 13, y + 8, 8, 2);
}

// ── Question block drawing ────────────────────────────────────────────────────

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, hit: boolean, powerUp?: string) {
  if (hit) {
    ctx.fillStyle = '#a16207';
    ctx.fillRect(x, y, BLOCK_SIZE, BLOCK_SIZE);
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(x, y, BLOCK_SIZE, 2);
    ctx.fillRect(x, y + BLOCK_SIZE - 2, BLOCK_SIZE, 2);
    ctx.fillRect(x, y, 2, BLOCK_SIZE);
    ctx.fillRect(x + BLOCK_SIZE - 2, y, 2, BLOCK_SIZE);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x + 4, y + 4, 3, 3);
    ctx.fillRect(x + BLOCK_SIZE - 7, y + 4, 3, 3);
    ctx.fillRect(x + 4, y + BLOCK_SIZE - 7, 3, 3);
    ctx.fillRect(x + BLOCK_SIZE - 7, y + BLOCK_SIZE - 7, 3, 3);
    return;
  }

  const isFireBlock = powerUp === 'fire';
  const wobble = Math.sin(performance.now() / 400) * 1.5;

  ctx.fillStyle = isFireBlock ? '#7c2d12' : '#854d0e';
  ctx.fillRect(x, y + wobble, BLOCK_SIZE, BLOCK_SIZE);
  ctx.fillStyle = isFireBlock ? '#f97316' : '#fbbf24';
  ctx.fillRect(x + 2, y + 2 + wobble, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
  ctx.fillStyle = isFireBlock ? '#fdba74' : '#fde68a';
  ctx.fillRect(x + 4, y + 4 + wobble, BLOCK_SIZE - 8, 4);
  ctx.fillStyle = isFireBlock ? '#ea580c' : '#d97706';
  ctx.fillRect(x + 4, y + BLOCK_SIZE - 8 + wobble, BLOCK_SIZE - 8, 4);
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x + 4, y + 4 + wobble, 3, 3);
  ctx.fillRect(x + BLOCK_SIZE - 7, y + 4 + wobble, 3, 3);
  ctx.fillRect(x + 4, y + BLOCK_SIZE - 7 + wobble, 3, 3);
  ctx.fillRect(x + BLOCK_SIZE - 7, y + BLOCK_SIZE - 7 + wobble, 3, 3);

  if (isFireBlock) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 13, y + 8 + wobble, 6, 2);
    ctx.fillRect(x + 11, y + 10 + wobble, 10, 2);
    ctx.fillRect(x + 11, y + 12 + wobble, 4, 6);
    ctx.fillRect(x + 17, y + 12 + wobble, 4, 4);
    ctx.fillRect(x + 13, y + 18 + wobble, 6, 2);
    ctx.fillRect(x + 14, y + 24 + wobble, 4, 3);
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 11, y + 8 + wobble, 10, 3);
    ctx.fillRect(x + 9,  y + 11 + wobble, 3, 3);
    ctx.fillRect(x + 20, y + 11 + wobble, 3, 3);
    ctx.fillRect(x + 17, y + 14 + wobble, 6, 3);
    ctx.fillRect(x + 14, y + 17 + wobble, 4, 3);
    ctx.fillRect(x + 14, y + 23 + wobble, 4, 4);
  }
}

// ── Fire Flower drawing ───────────────────────────────────────────────────────

function drawFireFlower(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const cx = x + 16;
  const floatOff = Math.sin(performance.now() / 350) * 5;
  const fy = y - floatOff;

  ctx.fillStyle = '#16a34a';
  ctx.fillRect(cx - 2, fy + 18, 4, 14);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 8, fy + 20, 8, 5);
  ctx.fillRect(cx + 2, fy + 24, 8, 5);

  const spinAngle = performance.now() / 1200;
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle)       * 9, fy + 16 + Math.sin(spinAngle) * 6,       6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle + 1.57) * 9, fy + 16 + Math.sin(spinAngle + 1.57) * 6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle + 3.14) * 9, fy + 16 + Math.sin(spinAngle + 3.14) * 6, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle + 4.71) * 9, fy + 16 + Math.sin(spinAngle + 4.71) * 6, 6, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#dc2626';
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle)       * 9, fy + 16 + Math.sin(spinAngle) * 6,       3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle + 1.57) * 9, fy + 16 + Math.sin(spinAngle + 1.57) * 6, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle + 3.14) * 9, fy + 16 + Math.sin(spinAngle + 3.14) * 6, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + Math.cos(spinAngle + 4.71) * 9, fy + 16 + Math.sin(spinAngle + 4.71) * 6, 3.5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#fef9c3';
  ctx.beginPath(); ctx.arc(cx, fy + 16, 5, 0, Math.PI * 2); ctx.fill();
}

// ── Fireball drawing ──────────────────────────────────────────────────────────

function drawFireball(ctx: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const flicker = 0.65 + Math.sin(now / 35) * 0.35;
  ctx.save();
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#f97316';
  ctx.globalAlpha = 0.35 * flicker;
  ctx.fillStyle = '#fde68a';
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.7 * flicker;
  ctx.fillStyle = '#f97316';
  ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fef08a';
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ── Piranha Plant drawing ─────────────────────────────────────────────────────

function drawPiranhaPlant(
  ctx: CanvasRenderingContext2D,
  x: number, pipeW: number, pipeH: number,
  visible: boolean, cam: number, now: number,
) {
  const platY = GROUND_Y - pipeH;
  const px = x - cam;

  ctx.fillStyle = '#15803d';
  ctx.fillRect(px, platY, pipeW, pipeH);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(px, platY, 6, pipeH);
  ctx.fillStyle = '#166534';
  ctx.fillRect(px + pipeW - 5, platY, 5, pipeH);
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(px - 5, platY, pipeW + 10, 20);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(px - 5, platY, pipeW + 10, 4);
  ctx.fillStyle = '#166534';
  ctx.fillRect(px - 5, platY + 16, pipeW + 10, 4);

  if (!visible) return;

  const stemX = px + pipeW / 2 - 6;
  const stemY = platY - 30;
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(stemX, stemY, 12, 38);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(stemX, stemY, 3, 38);

  const hx = px + pipeW / 2;
  const hy = stemY - 8;
  const mouthOpen = 0.6 + Math.sin(now / 600) * 0.4; // jaw animation

  ctx.fillStyle = '#22c55e';
  ctx.beginPath(); ctx.ellipse(hx, hy, 20, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(hx, hy - 4 * mouthOpen, 14 * mouthOpen, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#15803d';
  ctx.fillRect(hx - 20, hy - 6 * mouthOpen, 40, 5 * mouthOpen);
  ctx.fillStyle = '#fff';
  for (let t = 0; t < 4; t++) {
    ctx.fillRect(hx - 14 + t * 8, hy - 16 * mouthOpen, 5, 7 * mouthOpen);
    ctx.fillRect(hx - 10 + t * 8, hy - 4 * mouthOpen, 5, 6 * mouthOpen);
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(hx - 10, hy + 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 10, hy + 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0a1a2f';
  ctx.beginPath(); ctx.arc(hx - 9,  hy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 11, hy + 4, 2.5, 0, Math.PI * 2); ctx.fill();
}

// ── Cloud drawing ─────────────────────────────────────────────────────────────

function drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, starRoad: boolean) {
  const fill = starRoad ? 'rgba(167,139,250,0.75)' : '#ffffff';
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(cx,      cy,     22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 26, cy - 8, 18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 48, cy,     22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 20, cy - 14, 14, 0, Math.PI * 2); ctx.fill();
  // Highlight on top
  ctx.fillStyle = starRoad ? 'rgba(216,180,254,0.6)' : 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(cx + 22, cy - 12, 10, 0, Math.PI * 2); ctx.fill();
  // Shadow on bottom
  ctx.fillStyle = starRoad ? 'rgba(109,40,217,0.15)' : 'rgba(180,200,230,0.4)';
  ctx.fillRect(cx - 2, cy + 10, 52, 10);
}

// ── Bush drawing ──────────────────────────────────────────────────────────────

function drawBush(ctx: CanvasRenderingContext2D, bx: number, w: number, h: number, layers: number, starRoad: boolean) {
  const dark  = starRoad ? '#4c1d95' : '#15803d';
  const mid   = starRoad ? '#6d28d9' : '#16a34a';
  const light = starRoad ? '#8b5cf6' : '#4ade80';
  const y     = GROUND_Y - 2;

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(bx + w * 0.25, y, h * 0.7, Math.PI, 0);
  ctx.arc(bx + w * 0.6,  y, h * 0.9, Math.PI, 0);
  ctx.arc(bx + w * 0.85, y, h * 0.6, Math.PI, 0);
  ctx.fill();

  if (layers >= 2) {
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.arc(bx + w * 0.2,  y + 2, h * 0.55, Math.PI, 0);
    ctx.arc(bx + w * 0.55, y,     h * 0.75, Math.PI, 0);
    ctx.arc(bx + w * 0.82, y + 3, h * 0.5,  Math.PI, 0);
    ctx.fill();
  }

  if (layers >= 3) {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(bx + w * 0.5, y - h * 0.1, h * 0.4, Math.PI, 0);
    ctx.fill();
  }
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
    squashY: 1, squashVY: 0,
    slowed: false, slowUntil: 0,
    fireballCooldown: 0,
  });

  const remotePlayers  = useRef<Map<string, RemotePlayer & { lastX?: number }>>(new Map());
  const goombasRef     = useRef<GoombaClient[]>([]);
  const blocksRef      = useRef<BlockClient[]>(QUESTION_BLOCKS.map(b => ({ ...b, hit: false, bounceAt: 0 })));
  const powerUpsRef    = useRef<PowerUpClient[]>([]);
  const fireballsRef   = useRef<Fireball[]>([]);
  const particlesRef   = useRef<Particle[]>([]);
  const camRef         = useRef({ x: 0 });
  const spectatingRef  = useRef<{ name: string; id: string } | null>(null);
  const inputRef       = useRef({ left: false, right: false, jump: false, fire: false, firePrev: false });
  const lastSendRef    = useRef(0);
  const animRef        = useRef(0);
  const lastTimeRef    = useRef(0);
  const finishedMsgRef = useRef('');
  const fireballIdRef  = useRef(0);
  const prevOnGround   = useRef(false);
  const confettiDone   = useRef(false);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      goombasRef.current = (data.goombas as any[]).map((g: any) => {
        const existing = goombasRef.current.find(e => e.id === g.id);
        return { id: g.id, x: g.x, y: g.y, alive: g.alive, squishAt: existing?.squishAt ?? 0 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      powerUpsRef.current = (data.powerUps as any[]).map((p: any) => ({ id: p.id, x: p.x, y: p.y, type: p.type }));
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
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') inputRef.current.left  = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') inputRef.current.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        if (!e.repeat) inputRef.current.jump = true;
        e.preventDefault();
      }
      if (e.key === 'f' || e.key === 'F') inputRef.current.fire = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') inputRef.current.left  = false;
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
    const p   = playerRef.current;
    const inp = inputRef.current;
    const now = performance.now();
    const pts = particlesRef.current;

    // Particle physics update
    for (let i = pts.length - 1; i >= 0; i--) {
      const pt = pts[i];
      if (now - pt.born >= pt.duration) { pts.splice(i, 1); continue; }
      pt.x  += pt.vx * dt;
      pt.y  += pt.vy * dt;
      pt.vy += pt.gravity * dt;
      pt.vx *= 0.98;
      pt.rotation += pt.rotV * dt;
    }

    // Squash/stretch spring (always update)
    const springFreq = 22, springDamp = 0.55;
    p.squashVY += (springFreq * springFreq * (1 - p.squashY) - 2 * springFreq * springDamp * p.squashVY) * dt;
    p.squashY  += p.squashVY * dt;

    if (p.dead) {
      if (now >= p.respawnAt) { p.dead = false; p.vy = 0; p.vx = 0; p.squashY = 1.15; p.squashVY = -4; }
      else return;
    }
    if (p.finished) return;

    if (p.powerUp && p.powerUp !== 'fire' && now > p.powerUpExpiry) p.powerUp = null;
    if (p.slowed  && now > p.slowUntil)  p.slowed = false;

    const speed = WALK_SPEED * (p.powerUp === 'speed' ? SPEED_MULT : 1) * (p.slowed && now < p.slowUntil ? 0.45 : 1);

    if (inp.left)       { p.vx = -speed; p.facing = -1; }
    else if (inp.right) { p.vx =  speed; p.facing =  1; }
    else p.vx = 0;

    // Walk phase — velocity-scaled for better feel
    if (Math.abs(p.vx) > 5 && p.onGround)
      p.walkPhase += dt * (6 + Math.abs(p.vx) / 45);

    // Jump
    if (inp.jump && p.onGround && !p.jumpPressed) {
      p.vy = JUMP_FORCE;
      p.onGround = false;
      p.squashY  = 1.22;   // stretch on takeoff
      p.squashVY = -8;
      mario_jump();
      // Dust burst on jump
      emitDust(pts, p.x + PLAYER_W / 2, p.y + PLAYER_H, p.vx, now);
    }
    p.jumpPressed = inp.jump;

    // Fire flower throw
    if (inp.fire && !inp.firePrev && p.powerUp === 'fire' && p.fireballCooldown < now) {
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
      p.powerUp = null;
      p.fireballCooldown = now + 500;
    }
    inp.firePrev = inp.fire;

    // Gravity
    p.vy += GRAVITY * dt;
    if (p.vy > 1200) p.vy = 1200;

    const prevBottom = p.y + PLAYER_H;
    const prevTop    = p.y;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x  = Math.max(0, Math.min(LEVEL_WIDTH - PLAYER_W, p.x));

    const wasOnGround = prevOnGround.current;
    p.onGround = false;

    if (p.y + PLAYER_H >= GROUND_Y) {
      p.y = GROUND_Y - PLAYER_H;
      p.vy = 0;
      p.onGround = true;
    }

    for (const plat of PLATFORMS) {
      const inX = p.x + PLAYER_W > plat.x + 2 && p.x < plat.x + plat.w - 2;
      if (!inX) continue;
      const playerBottom = p.y + PLAYER_H;
      const wasAbove     = prevBottom <= plat.y + 1;
      if (wasAbove && playerBottom >= plat.y && playerBottom <= plat.y + plat.h + 5 && p.vy >= 0) {
        p.y = plat.y - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
      }
    }

    for (const block of blocksRef.current) {
      const blockLeft   = block.x;
      const blockRight  = block.x + BLOCK_SIZE;
      const blockTop    = block.y;
      const blockBottom = block.y + BLOCK_SIZE;

      const inX = p.x + PLAYER_W > blockLeft + 2 && p.x < blockRight - 2;
      const inY = p.y + PLAYER_H  > blockTop  && p.y < blockBottom;
      if (!inX || !inY) continue;

      const wasBelow = prevTop >= blockBottom - 1;
      if (wasBelow && p.vy < 0) {
        p.y  = blockBottom;
        p.vy = 60;
        if (!block.hit) {
          block.hit = true;
          block.bounceAt = now;
          mario_blockHit();
          sendInput('block_hit', { blockId: block.id });
          // Coin particle from top of block
          emitCoin(pts, block.x - camRef.current.x + BLOCK_SIZE / 2, block.y, now);
        }
        continue;
      }

      const wasAbove = prevBottom <= blockTop + 1;
      if (wasAbove && p.vy >= 0) {
        p.y = blockTop - PLAYER_H;
        p.vy = 0;
        p.onGround = true;
        continue;
      }

      const playerCenterX = p.x + PLAYER_W / 2;
      const blockCenterX  = blockLeft + BLOCK_SIZE / 2;
      if (playerCenterX < blockCenterX) p.x = blockLeft - PLAYER_W;
      else                              p.x = blockRight;
    }

    // Landing detection — squash + dust
    if (!wasOnGround && p.onGround) {
      const impactSpeed = Math.abs(p.vy) + Math.abs(p.vx);
      const squashAmt   = Math.min(0.62, 0.78 - impactSpeed / 5000);
      p.squashY  = squashAmt;
      p.squashVY = 0;
      emitDust(pts, p.x + PLAYER_W / 2, p.y + PLAYER_H, p.vx, now);
    }
    prevOnGround.current = p.onGround;

    // Power-up collection
    powerUpsRef.current = powerUpsRef.current.filter(pu => {
      const dx = Math.abs(p.x + PLAYER_W / 2 - (pu.x + 16));
      const dy = Math.abs(p.y + PLAYER_H / 2 - (pu.y + 16));
      if (dx < 32 && dy < 36) {
        mario_powerUp();
        sendInput('powerup_collect', { powerUpId: pu.id });
        p.powerUp     = pu.type;
        p.powerUpExpiry = now + 8000;
        const puColor = pu.type === 'star' ? '#fde047' : pu.type === 'speed' ? '#dc2626' : '#f97316';
        emitPowerUpCollect(pts, p.x - camRef.current.x + PLAYER_W / 2, p.y + PLAYER_H / 2, puColor, now);
        return false;
      }
      return true;
    });

    // Speed trail particles
    if (p.powerUp === 'speed' && Math.abs(p.vx) > 80) {
      if (Math.random() < 0.6) emitSpeedTrail(pts, p.x - camRef.current.x, p.y, p.facing, now);
    }

    // Star sparkle aura
    if (p.powerUp === 'star' && Math.random() < 0.35) {
      emitStarSparkle(pts, p.x - camRef.current.x + PLAYER_W / 2, p.y + PLAYER_H / 2, now);
    }

    // Fireball physics
    fireballsRef.current = fireballsRef.current.filter(fb => {
      if (now - fb.spawnedAt > 2500 || fb.bounceCount >= 2) return false;
      fb.x  += fb.vx * dt;
      fb.vy += GRAVITY * dt;
      fb.y  += fb.vy * dt;

      if (fb.y >= GROUND_Y - 8 && !fb.bounced) {
        fb.vy *= -0.6;
        fb.y   = GROUND_Y - 8;
        fb.bounced = true;
        fb.bounceCount++;
      } else if (fb.y >= GROUND_Y - 8 && fb.bounced) {
        fb.bounceCount++;
      }

      for (const [id, rp] of remotePlayers.current) {
        if (rp.dead || rp.finished) continue;
        const dx = Math.abs(fb.x - (rp.x + PLAYER_W / 2));
        const dy = Math.abs(fb.y - (rp.y + PLAYER_H / 2));
        if (dx < 40 && dy < 60) {
          sendInput('fire_hit', { targetId: id });
          return false;
        }
      }
      return true;
    });

    // Piranha plant collision
    for (const pipe of PIRANHA_PIPES) {
      const platY = GROUND_Y - pipe.pipeH;
      const up    = Math.sin(now / 1500) > 0;
      if (up) {
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

    // Goombas
    for (const g of goombasRef.current) {
      if (!g.alive) continue;
      const xOver = p.x + PLAYER_W > g.x + 2 && p.x < g.x + GOOMBA_W - 2;
      const yOver = p.y + PLAYER_H > g.y      && p.y < g.y + GOOMBA_H;
      if (!xOver || !yOver) continue;

      const wasAbove = prevBottom <= g.y + 4;
      const stomping = wasAbove && p.vy > 0;

      if (stomping) {
        g.alive    = false;
        g.squishAt = now;
        p.vy       = -380;
        p.y        = g.y - PLAYER_H;
        p.squashY  = 0.7;
        mario_stomp();
        sendInput('goomba_stomp', { goombaId: g.id });
        emitStomp(pts, g.x - camRef.current.x + GOOMBA_W / 2, g.y + GOOMBA_H / 2, now);
      } else if (p.powerUp === 'star') {
        g.alive    = false;
        g.squishAt = now;
        sendInput('goomba_stomp', { goombaId: g.id });
        emitStomp(pts, g.x - camRef.current.x + GOOMBA_W / 2, g.y + GOOMBA_H / 2, now);
      } else if (!p.dead) {
        p.dead      = true;
        p.respawnAt = now + 2500;
        p.vy        = -350;
      }
    }

    // Star power: hit remote players
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

    // Finish confetti (once)
    if (p.finished && !confettiDone.current) {
      confettiDone.current = true;
      emitFinishConfetti(pts, camRef.current.x, now);
    }

    // Camera — look-ahead based on velocity, smooth
    let targetCamX: number;
    if (p.finished) {
      let leadX = -1, leadId = '';
      for (const [id, rp] of remotePlayers.current) {
        if (!rp.finished && rp.x > leadX) { leadX = rp.x; leadId = id; }
      }
      if (leadX >= 0) {
        targetCamX = leadX - CANVAS_W * 0.35;
        const room = useGameStore.getState().room;
        const pl   = room?.players.find(p2 => p2.socketId === leadId || p2.id === leadId);
        spectatingRef.current = pl ? { name: pl.username, id: leadId } : null;
      } else {
        targetCamX = camRef.current.x;
        spectatingRef.current = null;
      }
    } else {
      // Look-ahead: camera leads in direction of travel
      const lookAhead = p.vx * 0.18;
      targetCamX = p.x + lookAhead - CANVAS_W * 0.35;
      spectatingRef.current = null;
    }
    camRef.current.x += (targetCamX - camRef.current.x) * Math.min(1, dt * 7);
    camRef.current.x  = Math.max(0, Math.min(LEVEL_WIDTH - CANVAS_W, camRef.current.x));

    // Send position 10 Hz
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

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.imageSmoothingEnabled = false;

    const cam = camRef.current.x;
    const now = performance.now();
    const p   = playerRef.current;

    // Sky gradient — Star Road section has purple sky
    const starRoadFactor = Math.min(1, Math.max(0, (cam - 4200) / 500));
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    if (starRoadFactor > 0.5) {
      grad.addColorStop(0, '#1a0536');
      grad.addColorStop(0.6, '#2d1b69');
      grad.addColorStop(1, '#7c3aed');
    } else {
      grad.addColorStop(0, '#4a90d9');
      grad.addColorStop(0.6, '#7bb8e8');
      grad.addColorStop(1, '#b8daf5');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Star Road: twinkling stars
    if (starRoadFactor > 0.2) {
      ctx.globalAlpha = starRoadFactor * 0.9;
      for (let i = 0; i < 40; i++) {
        const sx   = ((i * 137 + 50 - cam * 0.04) % CANVAS_W + CANVAS_W) % CANVAS_W;
        const sy   = ((i * 89  + 20) % 220);
        const twinkle = 0.5 + 0.5 * Math.sin(now / 600 + i * 1.3);
        ctx.fillStyle = `rgba(255,255,255,${twinkle})`;
        const s = 1 + (i % 3) * 0.5;
        ctx.fillRect(sx, sy, s, s);
      }
      ctx.globalAlpha = 1;
    }

    // Distant mountains / hills (parallax layer 1)
    const hillColor = starRoadFactor > 0.5 ? 'rgba(74,20,140,0.45)' : 'rgba(30,100,60,0.35)';
    ctx.fillStyle = hillColor;
    for (let i = 0; i < 8; i++) {
      const hx = ((i * 620 - cam * 0.18) % 2800 + 2800) % 2800 - 200;
      const hh = 100 + (i * 47) % 80;
      ctx.beginPath();
      ctx.arc(hx + 180, GROUND_Y - 10, hh + 80, Math.PI, 0);
      ctx.fill();
    }

    // Closer hills (parallax layer 2)
    const hill2 = starRoadFactor > 0.5 ? 'rgba(90,30,170,0.3)' : 'rgba(40,140,70,0.3)';
    ctx.fillStyle = hill2;
    for (let i = 0; i < 10; i++) {
      const hx = ((i * 450 - cam * 0.3) % 3000 + 3000) % 3000 - 150;
      ctx.beginPath();
      ctx.arc(hx + 120, GROUND_Y, 80 + (i * 31) % 60, Math.PI, 0);
      ctx.fill();
    }

    // Clouds (parallax)
    const cloudPositions = [
      { x: 100, y: 80 }, { x: 580, y: 55 }, { x: 1100, y: 100 },
      { x: 1650, y: 65 }, { x: 2200, y: 85 }, { x: 2800, y: 50 },
      { x: 3400, y: 90 }, { x: 3900, y: 70 },
    ];
    for (const c of cloudPositions) {
      const cx = ((c.x - cam * 0.12) % 3200 + 3200) % 3200 - 80;
      drawCloud(ctx, cx, c.y, starRoadFactor > 0.5);
    }

    // Ground
    ctx.fillStyle = starRoadFactor > 0.5 ? '#5b21b6' : '#4caf50';
    ctx.fillRect(-cam, GROUND_Y, LEVEL_WIDTH, 16);
    ctx.fillStyle = starRoadFactor > 0.5 ? '#4c1d95' : '#388e3c';
    ctx.fillRect(-cam, GROUND_Y + 14, LEVEL_WIDTH, 5);
    // Dirt
    ctx.fillStyle = starRoadFactor > 0.5 ? '#6d28d9' : '#c97e2c';
    ctx.fillRect(-cam, GROUND_Y + 18, LEVEL_WIDTH, CANVAS_H - GROUND_Y - 18);
    // Dirt block grid
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1;
    for (let bx = Math.floor(cam / 40) * 40; bx < cam + CANVAS_W + 40; bx += 40) {
      for (let by = GROUND_Y + 18; by < CANVAS_H; by += 40) {
        const offset = (Math.floor(by / 40) % 2) * 20;
        ctx.strokeRect(bx + offset - cam, by, 40, 40);
      }
    }
    // Ground top edge shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(-cam, GROUND_Y + 18, LEVEL_WIDTH, 3);

    // Bushes along ground (drawn between ground and platforms)
    for (const bush of GROUND_BUSHES) {
      const bx = bush.x - cam;
      if (bx + bush.w < -10 || bx > CANVAS_W + 10) continue;
      drawBush(ctx, bx, bush.w, bush.h, bush.layers, starRoadFactor > 0.5);
    }

    // Platforms — brick style
    for (const plat of PLATFORMS) {
      const px = plat.x - cam;
      if (px + plat.w < -20 || px > CANVAS_W + 20) continue;
      const isStarRoad = plat.x >= 4700;
      ctx.fillStyle = isStarRoad ? '#4c1d95' : '#7c4a2a';
      ctx.fillRect(px, plat.y, plat.w, plat.h);
      // Top highlight
      ctx.fillStyle = isStarRoad ? '#7c3aed' : '#a0623c';
      ctx.fillRect(px, plat.y, plat.w, 4);
      // Bottom shadow
      ctx.fillStyle = isStarRoad ? '#3b0764' : '#5a2e0f';
      ctx.fillRect(px, plat.y + plat.h - 3, plat.w, 3);
      // Brick lines
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      for (let bx = 0; bx < plat.w; bx += 22) {
        ctx.beginPath(); ctx.moveTo(px + bx, plat.y); ctx.lineTo(px + bx, plat.y + plat.h); ctx.stroke();
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
        ? -Math.sin(((now - block.bounceAt) / 300) * Math.PI) * 12
        : 0;
      drawBlock(ctx, bx, block.y + bounce, block.hit, block.powerUp ?? undefined);
    }

    // Power-ups
    for (const pu of powerUpsRef.current) {
      const px = pu.x - cam;
      if (px < -40 || px > CANVAS_W + 40) continue;
      const floatY = pu.y - Math.sin(now / 350) * 5;
      if (pu.type === 'fire') {
        drawFireFlower(ctx, px, floatY);
      } else if (pu.type === 'speed') {
        // Mushroom with shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(px + 16, floatY + 32, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(px + 4, floatY + 2, 24, 14);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(px + 4, floatY + 2, 24, 4); // highlight
        ctx.fillStyle = '#fff';
        ctx.fillRect(px + 8, floatY + 6, 5, 5);
        ctx.fillRect(px + 19, floatY + 6, 5, 5);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(px + 6, floatY + 16, 20, 12);
        ctx.fillStyle = '#0a1a2f';
        ctx.fillRect(px + 11, floatY + 19, 3, 4);
        ctx.fillRect(px + 18, floatY + 19, 3, 4);
        ctx.fillStyle = '#fcd5b5';
        ctx.fillRect(px + 14, floatY + 24, 3, 2);
      } else {
        // Star — twinkling
        const flash = Math.sin(now / 120) > 0;
        ctx.fillStyle = flash ? '#fde047' : '#fbbf24';
        const cx = px + 16, cy = floatY + 16;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.sin(now / 400) * 0.15);
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 15 : 6;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0a1a2f';
        ctx.fillRect(-3, -2, 2, 3);
        ctx.fillRect(1,  -2, 2, 3);
        ctx.restore();
      }
    }

    // Piranha plants
    for (const pipe of PIRANHA_PIPES) {
      const pipeX = pipe.x - cam;
      if (pipeX + pipe.pipeW < -100 || pipeX > CANVAS_W + 100) continue;
      const visible = Math.sin(now / 1500) > 0;
      drawPiranhaPlant(ctx, pipe.x, pipe.pipeW, pipe.pipeH, visible, cam, now);
    }

    // End pipe
    const pipeX = PIPE.x - cam;
    if (pipeX < CANVAS_W + 120 && pipeX > -PIPE.w - 20) {
      ctx.fillStyle = '#15803d';
      ctx.fillRect(pipeX, PIPE.y + 28, PIPE.w, PIPE.h - 28);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(pipeX, PIPE.y + 28, 8, PIPE.h - 28);
      ctx.fillStyle = '#166534';
      ctx.fillRect(pipeX + PIPE.w - 6, PIPE.y + 28, 6, PIPE.h - 28);
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(pipeX - 6, PIPE.y, PIPE.w + 12, 28);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(pipeX - 6, PIPE.y, PIPE.w + 12, 5);
      ctx.fillStyle = '#166534';
      ctx.fillRect(pipeX - 6, PIPE.y + 23, PIPE.w + 12, 5);
      ctx.font = '32px serif';
      ctx.fillText('🏁', pipeX + PIPE.w / 2 - 16, PIPE.y - 10);
    }

    // Goombas
    for (const g of goombasRef.current) {
      const gx = g.x - cam;
      if (gx + GOOMBA_W < -10 || gx > CANVAS_W + 10) continue;
      const deadFor = g.squishAt > 0 ? now - g.squishAt : -1;
      if (!g.alive && deadFor > 700) continue;
      const squished = !g.alive && deadFor >= 0;
      drawGoomba(ctx, gx, g.y, squished, now);
    }

    // Fireballs
    for (const fb of fireballsRef.current) {
      const fbx = fb.x - cam;
      if (fbx < -30 || fbx > CANVAS_W + 30) continue;
      drawFireball(ctx, fbx, fb.y, now);
    }

    // ── Particles ──
    for (const pt of particlesRef.current) {
      const age  = now - pt.born;
      const life = Math.max(0, 1 - age / pt.duration);

      ctx.save();
      ctx.globalAlpha = life;
      ctx.translate(pt.x, pt.y);
      ctx.rotate(pt.rotation);

      if (pt.type === 'dust') {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(0, 0, pt.size * life, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.type === 'coin') {
        // Draw coin as a small rectangle (pixel coin)
        const w = Math.max(1, pt.size * Math.abs(Math.cos(pt.rotation)));
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(-w / 2, -pt.size / 2, w, pt.size);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(-w / 2, -pt.size / 2, w, 2);
      } else if (pt.type === 'star') {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const r = i % 2 === 0 ? pt.size : pt.size * 0.45;
          const a = (i * Math.PI) / 3;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      } else if (pt.type === 'spark') {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(0, 0, pt.size * life, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.type === 'confetti') {
        ctx.fillStyle = pt.color;
        ctx.fillRect(-pt.size / 2, -pt.size / 4, pt.size, pt.size / 2);
      }
      ctx.restore();
    }

    // ── Remote players ──
    const room = useGameStore.getState().room;
    for (const [id, rp] of remotePlayers.current) {
      if (rp.dead) continue;
      const rpx = rp.x - cam;
      if (rpx + PLAYER_W < -50 || rpx > CANVAS_W + 50) continue;
      const pl = room?.players.find(pl => pl.socketId === id);
      if (!pl) continue;
      const facing  = (rp.facing as 1 | -1) ?? 1;
      const moving  = rp.lastX !== undefined && Math.abs(rp.x - (rp.lastX ?? rp.x)) > 0.5;

      // Drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(rpx + PLAYER_W / 2, rp.y + PLAYER_H + 2, PLAYER_W * 0.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      drawMario(ctx, rpx, rp.y, pl.color, facing, now / 130, moving, !rp.dead,
        false, 1, rp.powerUp === 'star', rp.powerUp === 'speed', false, rp.powerUp === 'fire');

      if (rp.slowed) {
        ctx.globalAlpha = 0.35 + Math.sin(now / 140) * 0.15;
        ctx.fillStyle = '#bfdbfe';
        ctx.fillRect(rpx - 2, rp.y - 2, PLAYER_W + 4, PLAYER_H + 4);
        ctx.globalAlpha = 1;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('❄️', rpx + PLAYER_W / 2, rp.y - 4);
      }

      // Name tag — pill style
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(rpx + PLAYER_W / 2 - 28, rp.y - 20, 56, 14, 5) ??
        ctx.fillRect(rpx + PLAYER_W / 2 - 28, rp.y - 20, 56, 14);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pl.username.slice(0, 9), rpx + PLAYER_W / 2, rp.y - 10);
      ctx.textAlign = 'left';

      if (rp.finished) {
        ctx.font = '14px serif';
        ctx.fillText(`🏆#${rp.rank}`, rpx + PLAYER_W / 2 - 14, rp.y - 24);
      }
    }

    // ── Local player ──
    if (!p.dead) {
      const myRoom   = useGameStore.getState().room;
      const myId     = getSocket().id;
      const myPlayer = myRoom?.players.find(pl => pl.id === myId);
      const color    = myPlayer?.color ?? '#dc2626';
      const lx       = p.x - cam;
      const moving   = Math.abs(p.vx) > 5;

      // Drop shadow
      ctx.fillStyle = `rgba(0,0,0,${p.onGround ? 0.22 : 0.1})`;
      const shadowScale = p.onGround ? 1 : Math.max(0.4, 1 - (GROUND_Y - p.y - PLAYER_H) / 300);
      ctx.beginPath();
      ctx.ellipse(lx + PLAYER_W / 2, GROUND_Y + 2, PLAYER_W * 0.55 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Slow overlay
      if (p.slowed && now < p.slowUntil) {
        ctx.globalAlpha = 0.3 + Math.sin(now / 110) * 0.12;
        ctx.fillStyle = '#bfdbfe';
        ctx.fillRect(lx - 2, p.y - 2, PLAYER_W + 4, PLAYER_H + 4);
        ctx.globalAlpha = 1;
      }

      const airborne  = !p.onGround;
      const ascending = p.vy < 0;
      drawMario(ctx, lx, p.y, color, p.facing, p.walkPhase, moving,
        airborne, ascending, p.squashY,
        p.powerUp === 'star', p.powerUp === 'speed', false, p.powerUp === 'fire');

      // YOU label — pulsing pill
      const youPulse = 0.65 + 0.35 * Math.sin(now * 0.004);
      const youX     = lx + PLAYER_W / 2;
      ctx.globalAlpha = youPulse;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(youX - 22, p.y - 24, 44, 15, 5) ??
        ctx.fillRect(youX - 22, p.y - 24, 44, 15);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('YOU ▼', youX, p.y - 13);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    } else {
      // Dead: show countdown + skull
      const remaining = Math.ceil((p.respawnAt - now) / 1000);
      const lx = p.x - cam;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(lx - 10, p.y - 10, PLAYER_W + 20, 50, 8) ??
        ctx.fillRect(lx - 10, p.y - 10, PLAYER_W + 20, 50);
      ctx.fill();
      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`💀 ${Math.max(0, remaining)}s`, lx + PLAYER_W / 2, p.y + 28);
      ctx.textAlign = 'left';
    }

    // ── HUD ──

    // Power-up indicator
    if (p.powerUp) {
      const remaining = Math.max(0, (p.powerUpExpiry - now) / 1000);
      const maxDur    = 8;
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(10, 10, 210, 44, 8) ?? ctx.fillRect(10, 10, 210, 44);
      ctx.fill();
      const barPct = Math.min(1, remaining / maxDur);
      const barColor = p.powerUp === 'star' ? '#fde047' : p.powerUp === 'speed' ? '#f97316' : '#ef4444';
      ctx.fillStyle = barColor;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(14, 40, 200 * barPct, 8, 4) ?? ctx.fillRect(14, 40, 200 * barPct, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      if (p.powerUp === 'star') {
        ctx.fillText(`⭐ STAR  ${remaining.toFixed(1)}s`, 18, 32);
      } else if (p.powerUp === 'speed') {
        ctx.fillText(`🍄 SPEED  ${remaining.toFixed(1)}s`, 18, 32);
      } else {
        ctx.fillText('🔥 FIRE FLOWER  [F] throw', 18, 32);
      }
    }

    // Slow indicator
    if (p.slowed && now < p.slowUntil) {
      const slowLeft = ((p.slowUntil - now) / 1000).toFixed(1);
      ctx.fillStyle = 'rgba(59,130,246,0.75)';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(10, 60, 160, 28, 6) ?? ctx.fillRect(10, 60, 160, 28);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`❄️ SLOWED  ${slowLeft}s`, 18, 79);
    }

    // Progress bar with sliding icon
    const progress = Math.min(1, p.x / (PIPE.x - 100));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).roundRect?.(CANVAS_W / 2 - 165, CANVAS_H - 30, 330, 16, 8) ??
      ctx.fillRect(CANVAS_W / 2 - 165, CANVAS_H - 30, 330, 16);
    ctx.fill();
    const barColor = p.powerUp === 'star' ? '#fde047' : p.powerUp === 'fire' ? '#f97316' : '#7c3aed';
    ctx.fillStyle = barColor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx as any).roundRect?.(CANVAS_W / 2 - 162, CANVAS_H - 27, 324 * progress, 10, 5) ??
      ctx.fillRect(CANVAS_W / 2 - 162, CANVAS_H - 27, 324 * progress, 10);
    ctx.fill();
    // Sliding player dot on bar
    const dotX = CANVAS_W / 2 - 162 + 324 * progress;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(dotX, CANVAS_H - 22, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '11px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏁', CANVAS_W / 2 + 155, CANVAS_H - 17);
    ctx.textAlign = 'left';

    // Finish banner
    if (finishedMsgRef.current) {
      const bannerAlpha = 0.8 + 0.08 * Math.sin(now * 0.003);
      ctx.fillStyle = `rgba(0,0,0,${bannerAlpha})`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(CANVAS_W / 2 - 190, CANVAS_H / 2 - 36, 380, 70, 14) ??
        ctx.fillRect(CANVAS_W / 2 - 190, CANVAS_H / 2 - 36, 380, 70);
      ctx.fill();
      // Gold border pulse
      ctx.strokeStyle = `rgba(251,191,36,${0.7 + 0.3 * Math.sin(now * 0.005)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(finishedMsgRef.current, CANVAS_W / 2, CANVAS_H / 2 + 10);
      ctx.textAlign = 'left';
    }

    // Spectator HUD
    const spec = spectatingRef.current;
    if (spec && p.finished) {
      const pulse = 0.72 + 0.28 * Math.sin(now * 0.004);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = 'rgba(0,0,0,0.68)';
      const label = `👁  SPECTATING  ${spec.name}`;
      ctx.font = 'bold 14px sans-serif';
      const tw = ctx.measureText(label).width;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).roundRect?.(CANVAS_W / 2 - tw / 2 - 14, 12, tw + 28, 32, 10) ??
        ctx.fillRect(CANVAS_W / 2 - tw / 2 - 14, 12, tw + 28, 32);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(label, CANVAS_W / 2, 33);
      ctx.globalAlpha = 1;
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
        Arrows / WASD to move &nbsp;•&nbsp; Space / Up to jump &nbsp;•&nbsp;
        Stomp Goombas from above &nbsp;•&nbsp; Jump UP into ? blocks &nbsp;•&nbsp; [F] throw fireball
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
