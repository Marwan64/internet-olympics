/**
 * Shopping Cart Racing — side-scrolling chaotic race.
 *
 * Carts roll along a bumpy heightmap track. Touch turbo items for a 3s boost,
 * touch banana items to spin out for 1.2s. First to the finish line wins, with
 * distance-based fallback if the timer runs out.
 *
 * Same architecture as Knockback Arena: 30Hz physics, 15Hz broadcast, action
 * events flushed alongside state.
 */
import { GameResults, PlayerResult } from '../types';
import { BaseGame } from './BaseGame';

export const TRACK_WIDTH = 6000;
const GROUND_BASE = 480;
export const FINISH_X = 5800;
const CART_W = 56;
const CART_H = 40;
const GRAVITY = 1600;
const ACCEL = 620;
const REVERSE_ACCEL = 340;
const MAX_SPEED = 380;
const BOOST_MULT = 1.7;
const FRICTION = 0.55;
const JUMP_IMPULSE = -520;
const PHYSICS_HZ = 30;
const BROADCAST_HZ = 15;

// Shared by client + server. Same exact formula on both sides.
export function groundAt(x: number): number {
  if (x < 0) return GROUND_BASE;
  if (x > TRACK_WIDTH) return GROUND_BASE;
  let y = GROUND_BASE;
  // Rolling hills
  y += Math.sin(x / 90) * 14;
  y += Math.cos(x / 240) * 28;
  // Up ramp
  if (x > 1400 && x < 1700) y -= (x - 1400) * 0.35;
  if (x >= 1700 && x < 1900) y -= 105 - (x - 1700) * 0.55;
  // Dip
  if (x > 2400 && x < 2800) y += Math.sin(((x - 2400) / 400) * Math.PI) * 70;
  // Bumpy patch
  if (x > 3300 && x < 3700) y += Math.sin(x / 30) * 18;
  // Steep climb
  if (x > 4200 && x < 4500) y -= (x - 4200) * 0.3;
  if (x >= 4500 && x < 4700) y -= 90 - (x - 4500) * 0.45;
  // Final flat-ish
  return y;
}

export const ITEMS: Array<{ id: string; x: number; type: 'turbo' | 'banana' }> = [
  { id: 'i0', x: 500, type: 'turbo' },
  { id: 'i1', x: 1100, type: 'turbo' },
  { id: 'i2', x: 1800, type: 'banana' },
  { id: 'i3', x: 2200, type: 'turbo' },
  { id: 'i4', x: 2600, type: 'banana' },
  { id: 'i5', x: 3000, type: 'turbo' },
  { id: 'i6', x: 3400, type: 'banana' },
  { id: 'i7', x: 3800, type: 'turbo' },
  { id: 'i8', x: 4400, type: 'banana' },
  { id: 'i9', x: 5000, type: 'turbo' },
  { id: 'i10', x: 5500, type: 'turbo' },
];

interface CartState {
  socketId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  onGround: boolean;
  boostUntil: number;
  spinOutUntil: number;
  finished: boolean;
  finishRank: number;
  bestSpeed: number;
  input: { left: boolean; right: boolean; brake: boolean; jumpRequested: boolean };
}

interface ItemPickup {
  id: string;
  x: number;
  type: 'turbo' | 'banana';
  active: boolean;
  respawnAt: number;
}

export class ShoppingCart extends BaseGame {
  readonly gameType = 'shopping-cart-racing' as const;
  readonly displayName = 'Shopping Cart Racing 🛒';

  private carts = new Map<string, CartState>();
  private items: ItemPickup[] = [];
  private finishCount = 0;
  private physicsInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private lastTick = Date.now();
  private pendingEvents: Array<{ type: string; data: Record<string, unknown> }> = [];

  protected async onStart(): Promise<void> {
    const ids = [...this.config.playerIds];
    ids.forEach((id, idx) => {
      const lane = idx % 4;
      const row = Math.floor(idx / 4);
      const startX = 60 + lane * 70 + row * 8;
      this.carts.set(id, {
        socketId: id,
        x: startX,
        y: groundAt(startX + CART_W / 2) - CART_H,
        vx: 0, vy: 0,
        angle: 0,
        onGround: true,
        boostUntil: 0,
        spinOutUntil: 0,
        finished: false,
        finishRank: 0,
        bestSpeed: 0,
        input: { left: false, right: false, brake: false, jumpRequested: false },
      });
    });
    this.items = ITEMS.map(it => ({ ...it, active: true, respawnAt: 0 }));
  }

  protected async onPlayStart(): Promise<void> {
    this.lastTick = Date.now();
    this.physicsInterval = setInterval(() => this.physicsTick(), 1000 / PHYSICS_HZ);
    this.broadcastInterval = setInterval(() => this.broadcast(), 1000 / BROADCAST_HZ);
  }

  protected override clearTimers(): void {
    super.clearTimers();
    if (this.physicsInterval) clearInterval(this.physicsInterval);
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.physicsInterval = null;
    this.broadcastInterval = null;
  }

  protected onInput(playerId: string, input: { type: string; payload: Record<string, unknown> }): void {
    const c = this.carts.get(playerId);
    if (!c || c.finished) return;

    switch (input.type) {
      case 'cart_input':
        c.input.left = !!input.payload.left;
        c.input.right = !!input.payload.right;
        c.input.brake = !!input.payload.brake;
        break;
      case 'cart_jump':
        c.input.jumpRequested = true;
        break;
    }
  }

  private physicsTick(): void {
    if (!this.isRunning || this.phase !== 'playing') return;
    const now = Date.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;

    for (const c of this.carts.values()) {
      if (c.finished) continue;

      const spunOut = now < c.spinOutUntil;
      const boosted = now < c.boostUntil;

      if (!spunOut) {
        const mult = boosted ? BOOST_MULT : 1;
        if (c.input.right) c.vx += ACCEL * mult * dt;
        if (c.input.left)  c.vx -= REVERSE_ACCEL * dt;
        if (c.input.brake) c.vx *= Math.exp(-3 * dt);
        // Jump
        if (c.input.jumpRequested && c.onGround) {
          c.vy = JUMP_IMPULSE;
          c.onGround = false;
        }
        c.input.jumpRequested = false;
      } else {
        // Spin out — tumble
        c.vx *= Math.exp(-1.6 * dt);
        c.angle += dt * 9;
      }

      // Friction on ground
      if (c.onGround && !c.input.right && !c.input.left) c.vx *= Math.exp(-FRICTION * dt);

      // Speed cap
      const cap = boosted ? MAX_SPEED * BOOST_MULT : MAX_SPEED;
      if (c.vx > cap) c.vx = cap;
      if (c.vx < -cap * 0.4) c.vx = -cap * 0.4;

      // Gravity if airborne
      if (!c.onGround) c.vy += GRAVITY * dt;

      // Integrate
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.x = Math.max(0, Math.min(TRACK_WIDTH - CART_W, c.x));

      // Ground collision
      const cartFootX = c.x + CART_W / 2;
      const groundY = groundAt(cartFootX) - CART_H;
      if (c.y >= groundY) {
        const landed = !c.onGround && c.vy > 200;
        c.y = groundY;
        c.vy = 0;
        c.onGround = true;
        if (landed) c.vx *= 0.75; // hard landing penalty
      } else {
        c.onGround = false;
      }

      // Angle: in the air, lean; on ground, follow terrain slope
      if (c.onGround && !spunOut) {
        const dx = 28;
        const ahead = groundAt(cartFootX + dx);
        const behind = groundAt(cartFootX - dx);
        c.angle = Math.atan2(ahead - behind, dx * 2);
      } else if (!spunOut) {
        c.angle += (c.vx > 0 ? 1 : -1) * dt * 0.4;
        c.angle = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, c.angle));
      }

      if (Math.abs(c.vx) > c.bestSpeed) c.bestSpeed = Math.abs(c.vx);

      // Finish
      if (!c.finished && c.x + CART_W / 2 >= FINISH_X) {
        c.finished = true;
        this.finishCount++;
        c.finishRank = this.finishCount;
        const rankPts = [1000, 700, 500, 300, 200, 150];
        const pts = rankPts[c.finishRank - 1] ?? 100;
        this.addScore(c.socketId, pts);
        this.pendingEvents.push({
          type: 'cart:finished',
          data: { id: c.socketId, rank: c.finishRank, points: pts },
        });
        if (this.finishCount >= this.carts.size) {
          setTimeout(() => this.endEarly(), 1800);
        }
      }
    }

    // Items
    for (const it of this.items) {
      if (!it.active && now >= it.respawnAt) it.active = true;
      if (!it.active) continue;
      const itGroundY = groundAt(it.x);
      for (const c of this.carts.values()) {
        if (c.finished) continue;
        const cartCenterX = c.x + CART_W / 2;
        const cartCenterY = c.y + CART_H / 2;
        if (Math.abs(cartCenterX - it.x) < 28 && Math.abs(cartCenterY - (itGroundY - 24)) < 36) {
          it.active = false;
          it.respawnAt = now + 6000;
          if (it.type === 'turbo') {
            c.boostUntil = now + 3000;
            this.pendingEvents.push({ type: 'cart:turbo', data: { id: c.socketId } });
          } else {
            c.spinOutUntil = now + 1200;
            this.pendingEvents.push({ type: 'cart:banana', data: { id: c.socketId } });
          }
        }
      }
    }

    // Cart-cart collision
    const arr = [...this.carts.values()];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a.finished || b.finished) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dx) < CART_W && Math.abs(dy) < CART_H) {
          const overlap = CART_W - Math.abs(dx);
          if (dx >= 0) { a.x -= overlap * 0.5; b.x += overlap * 0.5; }
          else         { a.x += overlap * 0.5; b.x -= overlap * 0.5; }
          // Faster cart pushes slower one
          if (Math.abs(a.vx) > Math.abs(b.vx)) {
            b.vx = a.vx * 0.65;
            a.vx *= 0.85;
          } else {
            a.vx = b.vx * 0.65;
            b.vx *= 0.85;
          }
        }
      }
    }
  }

  private endEarly(): void {
    if (!this.isRunning) return;
    this.clearTimers();
    this.isRunning = false;
    this.phase = 'results';
    this.broadcastState();
    const results = this.buildResults();
    this.io.to(this.config.roomId).emit('game:end', results);
    this.emit('ended', results);
  }

  private broadcast(): void {
    if (!this.isRunning) return;
    const now = Date.now();
    const carts = [...this.carts.values()].map(c => ({
      id: c.socketId,
      x: Math.round(c.x * 10) / 10,
      y: Math.round(c.y * 10) / 10,
      a: Math.round(c.angle * 100) / 100,
      vx: Math.round(c.vx),
      bs: now < c.boostUntil ? 1 : 0,
      sp: now < c.spinOutUntil ? 1 : 0,
      fn: c.finished ? c.finishRank : 0,
    }));
    const items = this.items.map(it => ({ id: it.id, x: it.x, t: it.type, a: it.active ? 1 : 0 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('cart:state' as any, { t: now, carts, items });

    for (const ev of this.pendingEvents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.io.to(this.config.roomId).emit(ev.type as any, ev.data);
    }
    this.pendingEvents = [];
  }

  protected onTick(_remaining: number): void {}

  protected override triggerChaos(): void {
    const roll = Math.random();
    if (roll < 0.5) {
      // Boost everyone briefly
      for (const c of this.carts.values()) {
        if (!c.finished) c.boostUntil = Date.now() + 2500;
      }
      this.io.to(this.config.roomId).emit('chaos:announcement', '🚀 EVERYONE GETS TURBO!');
    } else {
      // Banana rain — spin out random half of players
      const arr = [...this.carts.values()].filter(c => !c.finished);
      arr.sort(() => Math.random() - 0.5).slice(0, Math.ceil(arr.length / 2)).forEach(c => {
        c.spinOutUntil = Date.now() + 1500;
        this.pendingEvents.push({ type: 'cart:banana', data: { id: c.socketId } });
      });
      this.io.to(this.config.roomId).emit('chaos:announcement', '🍌 BANANA RAIN!');
    }
  }

  protected getGameData(): unknown {
    const summary: Record<string, { x: number; finished: number; rank: number }> = {};
    for (const [id, c] of this.carts) summary[id] = { x: Math.round(c.x), finished: c.finished ? 1 : 0, rank: c.finishRank };
    return { summary };
  }

  protected buildResults(): GameResults {
    // Award points for distance traveled if not finished
    for (const c of this.carts.values()) {
      if (!c.finished) {
        const distPts = Math.round((c.x / FINISH_X) * 80);
        this.addScore(c.socketId, distPts);
      }
    }
    const lb = this.getLeaderboard();
    const resultPlayers: PlayerResult[] = lb.map((entry, idx) => ({
      playerId: entry.playerId,
      username: '',
      avatar: '',
      color: '',
      roundScore: entry.score,
      totalScore: this.totalScores[entry.playerId] ?? 0,
      rank: idx + 1,
      stats: { finishRank: this.carts.get(entry.playerId)?.finishRank ?? 0 },
    }));
    const highlights: string[] = [];
    if (this.finishCount > 0) highlights.push(`🏁 ${this.finishCount} finishers!`);
    else highlights.push('⏱️ Nobody finished — ran out of time!');
    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: lb[0]?.playerId ?? '',
      highlights,
    };
  }
}
