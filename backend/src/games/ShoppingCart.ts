/**
 * Shopping Cart Racing — 3D downhill racer.
 *
 * Coordinate system:
 *   x  = forward distance down the mountain  (0 → FINISH_X)
 *   y  = vertical (height above slope)       (0 = on terrain)
 *   z  = lateral position                    (-LANE_HALF → +LANE_HALF)
 *
 * Forward motion is gravity-driven (downhill). Players steer left/right with
 * A/D, accelerate with W (extra gas), brake with S, and can jump (Space) when
 * grounded — useful for clearing obstacles. Ramps give a free jump.
 *
 * Server runs physics at 30Hz, broadcasts at 15Hz, sends action events
 * (turbo, hit, finish) immediately.
 */
import { GameResults, PlayerResult } from '../types';
import { BaseGame } from './BaseGame';

export const TRACK_LENGTH = 7000;
export const FINISH_X = 6800;
export const LANE_HALF = 220;     // track is 440 wide
const CART_R = 22;                // collision radius
const PHYSICS_HZ = 30;
const BROADCAST_HZ = 20;

// Forward physics
const GRAVITY_FORWARD = 90;       // constant downhill acceleration
const GAS_ACCEL = 180;            // extra accel from W
const BRAKE_DECEL = 280;          // S braking
const FORWARD_MAX = 540;          // top speed
const FORWARD_DRAG = 0.18;        // air drag

// Lateral steering
const STEER_ACCEL = 600;
const LATERAL_FRICTION = 4.5;
const LATERAL_MAX = 280;

// Vertical
const GRAVITY_DOWN = 1900;
const JUMP_IMPULSE = -650;
const RAMP_LAUNCH = -780;         // when crossing a ramp at speed

// Items
const BOOST_DURATION = 3000;
const BOOST_MULT = 1.7;
const SPIN_DURATION = 1200;

// Course features
export const RAMPS = [
  { x: 1400, halfWidth: 80 },
  { x: 2800, halfWidth: 80 },
  { x: 4200, halfWidth: 80 },
  { x: 5600, halfWidth: 80 },
];

export const OBSTACLES: Array<{ id: string; x: number; z: number; type: 'tree' | 'rock' }> = [
  { id: 'o0', x: 600, z: -120, type: 'tree' },
  { id: 'o1', x: 850, z: 80,   type: 'rock' },
  { id: 'o2', x: 1100, z: -40, type: 'tree' },
  { id: 'o3', x: 1800, z: 100, type: 'tree' },
  { id: 'o4', x: 2100, z: -160, type: 'rock' },
  { id: 'o5', x: 2400, z: 50,  type: 'tree' },
  { id: 'o6', x: 3100, z: -100, type: 'rock' },
  { id: 'o7', x: 3400, z: 130, type: 'tree' },
  { id: 'o8', x: 3700, z: 0,   type: 'tree' },
  { id: 'o9', x: 4500, z: -150, type: 'rock' },
  { id: 'o10', x: 4800, z: 90, type: 'tree' },
  { id: 'o11', x: 5100, z: -60, type: 'tree' },
  { id: 'o12', x: 5300, z: 160, type: 'rock' },
  { id: 'o13', x: 5900, z: -80, type: 'tree' },
  { id: 'o14', x: 6200, z: 50,  type: 'rock' },
];

export const PICKUPS: Array<{ id: string; x: number; z: number; type: 'turbo' }> = [
  { id: 'p0', x: 500, z: 0, type: 'turbo' },
  { id: 'p1', x: 1200, z: -100, type: 'turbo' },
  { id: 'p2', x: 2000, z: 100, type: 'turbo' },
  { id: 'p3', x: 2700, z: 0, type: 'turbo' },
  { id: 'p4', x: 3500, z: -80, type: 'turbo' },
  { id: 'p5', x: 4300, z: 120, type: 'turbo' },
  { id: 'p6', x: 5000, z: -60, type: 'turbo' },
  { id: 'p7', x: 5700, z: 80, type: 'turbo' },
  { id: 'p8', x: 6400, z: 0, type: 'turbo' },
];

// Terrain height: gentle downhill + bumps. Smaller bumps = more controllable.
// Note: the cart's "y" coordinate is relative ground level (0 = on terrain).
// Visual elevation comes from this function purely for the renderer.
export function terrainHeight(x: number): number {
  if (x < 0) return 0;
  if (x > TRACK_LENGTH) return -TRACK_LENGTH * 0.15;
  // Overall downhill drop (each x unit = -0.12 height)
  let h = -x * 0.12;
  // Rolling bumps
  h += Math.sin(x / 110) * 14;
  h += Math.cos(x / 270) * 22;
  // Pronounced ramps
  for (const r of RAMPS) {
    if (Math.abs(x - r.x) < r.halfWidth) {
      const t = 1 - Math.abs(x - r.x) / r.halfWidth;
      h += Math.sin(t * Math.PI) * 55;
    }
  }
  return h;
}

// ── State ─────────────────────────────────────────────────────────────────────

interface CartState {
  socketId: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  onGround: boolean;
  boostUntil: number;
  spinOutUntil: number;
  finished: boolean;
  finishRank: number;
  input: {
    accel: boolean;
    brake: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
  };
  jumpRequestedAt: number;
  lastRampX: number;
  pickupsTaken: Set<string>;
}

interface PickupState { id: string; x: number; z: number; type: 'turbo'; active: boolean; respawnAt: number }

// ── Game ──────────────────────────────────────────────────────────────────────

export class ShoppingCart extends BaseGame {
  readonly gameType = 'shopping-cart-racing' as const;
  readonly displayName = 'Shopping Cart Downhill 🛒';

  private carts = new Map<string, CartState>();
  private pickups: PickupState[] = [];
  private finishCount = 0;
  private physicsInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private lastTick = Date.now();
  private pendingEvents: Array<{ type: string; data: Record<string, unknown> }> = [];
  private endingEarly = false;

  protected async onStart(): Promise<void> {
    const ids = [...this.config.playerIds];
    ids.forEach((id, idx) => {
      // Spread starting carts across the lane
      const lateral = ((idx % 5) - 2) * 60;
      this.carts.set(id, {
        socketId: id,
        x: 30 + Math.floor(idx / 5) * 10,
        y: 0, z: lateral,
        vx: 0, vy: 0, vz: 0,
        onGround: true,
        boostUntil: 0,
        spinOutUntil: 0,
        finished: false,
        finishRank: 0,
        input: { accel: false, brake: false, left: false, right: false, jump: false },
        jumpRequestedAt: 0,
        lastRampX: -1000,
        pickupsTaken: new Set(),
      });
    });
    this.pickups = PICKUPS.map(p => ({ ...p, active: true, respawnAt: 0 }));
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
        c.input.accel = !!input.payload.accel;
        c.input.brake = !!input.payload.brake;
        c.input.left = !!input.payload.left;
        c.input.right = !!input.payload.right;
        break;
      case 'cart_jump':
        c.jumpRequestedAt = Date.now();
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
      const spinning = now < c.spinOutUntil;
      const boosted = now < c.boostUntil;
      const mult = boosted ? BOOST_MULT : 1;

      // ── Forward ──
      // Always-on downhill gravity
      c.vx += GRAVITY_FORWARD * mult * dt;
      if (!spinning) {
        if (c.input.accel) c.vx += GAS_ACCEL * mult * dt;
        if (c.input.brake) c.vx -= BRAKE_DECEL * dt;
      }
      // Drag scales with speed²
      c.vx -= c.vx * FORWARD_DRAG * dt;
      if (c.vx < 30) c.vx = 30; // never fully stop; this is a downhill race
      const fmax = FORWARD_MAX * mult;
      if (c.vx > fmax) c.vx = fmax;

      // ── Lateral steering ──
      if (!spinning) {
        if (c.input.left) c.vz -= STEER_ACCEL * dt;
        if (c.input.right) c.vz += STEER_ACCEL * dt;
      }
      c.vz -= c.vz * LATERAL_FRICTION * dt;
      if (c.vz > LATERAL_MAX) c.vz = LATERAL_MAX;
      if (c.vz < -LATERAL_MAX) c.vz = -LATERAL_MAX;

      // ── Vertical ──
      if (!c.onGround) {
        c.vy += GRAVITY_DOWN * dt;
      }

      // Jump (if requested within last 100ms and grounded)
      if (c.onGround && now - c.jumpRequestedAt < 100) {
        c.vy = JUMP_IMPULSE;
        c.onGround = false;
        c.jumpRequestedAt = 0;
      }

      // ── Integrate ──
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;

      // Lateral wall bounce
      if (c.z > LANE_HALF) { c.z = LANE_HALF; c.vz = -c.vz * 0.4; }
      if (c.z < -LANE_HALF) { c.z = -LANE_HALF; c.vz = -c.vz * 0.4; }

      // Ground collision: y=0 is "on terrain"
      if (c.y >= 0) {
        if (!c.onGround && c.vy > 200) c.vx *= 0.85; // hard landing
        c.y = 0;
        c.vy = 0;
        c.onGround = true;
      } else {
        c.onGround = false;
      }

      // Ramp launch: when crossing a ramp at speed, get auto-air
      for (const r of RAMPS) {
        if (c.lastRampX !== r.x && Math.abs(c.x - r.x) < r.halfWidth * 0.3 && c.onGround && c.vx > 200) {
          c.vy = RAMP_LAUNCH;
          c.onGround = false;
          c.lastRampX = r.x;
          this.pendingEvents.push({ type: 'cart:ramp', data: { id: c.socketId } });
        }
      }

      // ── Obstacles ──
      if (!spinning) {
        for (const o of OBSTACLES) {
          const dx = c.x - o.x;
          const dz = c.z - o.z;
          // Trees taller, rocks shorter; only collide if cart isn't above the obstacle
          const obsHeight = o.type === 'tree' ? 90 : 30;
          if (c.y < -obsHeight) continue; // jumped over it
          if (dx * dx + dz * dz < (CART_R + 18) ** 2) {
            c.spinOutUntil = now + SPIN_DURATION;
            c.vx *= 0.45;
            c.vz = -c.vz * 0.3;
            this.pendingEvents.push({ type: 'cart:hit', data: { id: c.socketId, obstacleId: o.id } });
            break;
          }
        }
      }

      // ── Pickups ──
      for (const p of this.pickups) {
        if (!p.active) {
          if (now >= p.respawnAt) p.active = true;
          else continue;
        }
        if (!p.active) continue;
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        if (dx * dx + dz * dz < (CART_R + 20) ** 2) {
          p.active = false;
          p.respawnAt = now + 6000;
          c.boostUntil = now + BOOST_DURATION;
          this.pendingEvents.push({ type: 'cart:turbo', data: { id: c.socketId } });
        }
      }

      // ── Finish line ──
      if (c.x >= FINISH_X) {
        c.finished = true;
        this.finishCount++;
        c.finishRank = this.finishCount;
        const rankPts = [1000, 700, 500, 350, 250, 200, 150];
        const pts = rankPts[c.finishRank - 1] ?? 100;
        this.addScore(c.socketId, pts);
        this.pendingEvents.push({
          type: 'cart:finished',
          data: { id: c.socketId, rank: c.finishRank, points: pts },
        });
        if (!this.endingEarly && this.finishCount >= this.carts.size) {
          this.endingEarly = true;
          setTimeout(() => this.endEarly(), 1800);
        }
      }
    }

    // Cart-cart collisions (top-down xz plane)
    const arr = [...this.carts.values()].filter(c => !c.finished);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const minD = CART_R * 2;
        if (d2 < minD * minD && d2 > 0) {
          const d = Math.sqrt(d2);
          const overlap = minD - d;
          const nx = dx / d, nz = dz / d;
          a.x -= nx * overlap * 0.5;
          a.z -= nz * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.z += nz * overlap * 0.5;
          // Push velocity transfer
          if (Math.abs(a.vx) > Math.abs(b.vx)) {
            b.vx = a.vx * 0.7;
            a.vx *= 0.9;
          } else {
            a.vx = b.vx * 0.7;
            b.vx *= 0.9;
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
      z: Math.round(c.z * 10) / 10,
      vx: Math.round(c.vx),
      bs: now < c.boostUntil ? 1 : 0,
      sp: now < c.spinOutUntil ? 1 : 0,
      og: c.onGround ? 1 : 0,
      fn: c.finished ? c.finishRank : 0,
    }));
    const pickups = this.pickups.map(p => ({ id: p.id, a: p.active ? 1 : 0 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('cart:state' as any, { t: now, carts, pickups });

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
      for (const c of this.carts.values()) {
        if (!c.finished) c.boostUntil = Date.now() + 2500;
      }
      this.io.to(this.config.roomId).emit('chaos:announcement', '🚀 EVERYONE GETS TURBO!');
    } else {
      // Spin out random half
      const arr = [...this.carts.values()].filter(c => !c.finished);
      arr.sort(() => Math.random() - 0.5).slice(0, Math.ceil(arr.length / 2)).forEach(c => {
        c.spinOutUntil = Date.now() + 1500;
        this.pendingEvents.push({ type: 'cart:hit', data: { id: c.socketId, obstacleId: 'chaos' } });
      });
      this.io.to(this.config.roomId).emit('chaos:announcement', '🍌 BANANA STORM!');
    }
  }

  protected getGameData(): unknown {
    const summary: Record<string, { x: number; finished: number; rank: number }> = {};
    for (const [id, c] of this.carts) summary[id] = { x: Math.round(c.x), finished: c.finished ? 1 : 0, rank: c.finishRank };
    return { summary };
  }

  protected buildResults(): GameResults {
    for (const c of this.carts.values()) {
      if (!c.finished) {
        const distPts = Math.round((c.x / FINISH_X) * 100);
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
    if (this.finishCount > 0) highlights.push(`🏁 ${this.finishCount} crossed the line!`);
    else highlights.push('⏱️ Nobody finished — gnarly run!');
    return {
      gameType: this.gameType,
      scores: resultPlayers,
      mvp: lb[0]?.playerId ?? '',
      highlights,
    };
  }
}
