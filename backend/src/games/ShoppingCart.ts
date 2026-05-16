/**
 * Shopping Cart Racing — 3D downhill racer.
 *
 * Coordinate system:
 *   x  = forward distance down the mountain  (0 → FINISH_X)
 *   y  = vertical (height above slope)       (0 = on terrain)
 *   z  = lateral position                    (-LANE_HALF → +LANE_HALF)
 */
import { GameResults, PlayerResult } from '../types';
import { BaseGame } from './BaseGame';

export const TRACK_LENGTH = 7000;
export const FINISH_X = 6800;
export const LANE_HALF = 220;
const CART_R = 22;
const PHYSICS_HZ = 30;
const BROADCAST_HZ = 20;

// Forward physics
const GRAVITY_FORWARD = 100;
const GAS_ACCEL = 200;
const BRAKE_DECEL = 320;
const FORWARD_MAX = 620;
const FORWARD_DRAG = 0.16;

// Lateral steering
const STEER_ACCEL = 700;
const LATERAL_FRICTION = 5.0;
const LATERAL_MAX = 300;

// Drift
const DRIFT_LATERAL_FRICTION = 1.2;   // much less grip while drifting
const DRIFT_STEER_MULT = 1.6;          // wider turning radius
const DRIFT_SPEED_PENALTY = 0.88;      // slight speed reduction while drifting
const DRIFT_CHARGE_RATE = 1.0;         // charge per second
const DRIFT_BOOST_THRESHOLD = 0.4;     // minimum charge to earn boost
const DRIFT_BOOST_DURATION = 2200;     // ms
const DRIFT_BOOST_MULT = 1.55;

// Vertical
const GRAVITY_DOWN = 1900;
const JUMP_IMPULSE = -700;
const RAMP_LAUNCH = -850;

// Items
const BOOST_DURATION = 3000;
const BOOST_MULT = 1.7;
const SPIN_DURATION = 1200;

export const RAMPS = [
  { x: 1400, halfWidth: 80 },
  { x: 2800, halfWidth: 80 },
  { x: 4200, halfWidth: 80 },
  { x: 5600, halfWidth: 80 },
];

export const OBSTACLES: Array<{ id: string; x: number; z: number; type: 'tree' | 'rock' | 'shelf' | 'forklift' }> = [
  { id: 'o0', x: 600, z: -120, type: 'tree' },
  { id: 'o1', x: 850, z: 80,   type: 'rock' },
  { id: 'o2', x: 1100, z: -40, type: 'tree' },
  { id: 'o3', x: 1800, z: 100, type: 'shelf' },
  { id: 'o4', x: 2100, z: -160, type: 'rock' },
  { id: 'o5', x: 2400, z: 50,  type: 'tree' },
  { id: 'o6', x: 3100, z: -100, type: 'shelf' },
  { id: 'o7', x: 3400, z: 130, type: 'tree' },
  { id: 'o8', x: 3700, z: 0,   type: 'shelf' },
  { id: 'o9', x: 4500, z: -150, type: 'rock' },
  { id: 'o10', x: 4800, z: 90, type: 'tree' },
  { id: 'o11', x: 5100, z: -60, type: 'shelf' },
  { id: 'o12', x: 5300, z: 160, type: 'rock' },
  { id: 'o13', x: 5900, z: -80, type: 'tree' },
  { id: 'o14', x: 6200, z: 50,  type: 'rock' },
];

// Moving forklifts — patrol laterally
export const FORKLIFTS = [
  { id: 'f0', x: 1600, zMin: -160, zMax: 160, speed: 90 },
  { id: 'f1', x: 3200, zMin: -140, zMax: 140, speed: 120 },
  { id: 'f2', x: 4900, zMin: -180, zMax: 80, speed: 150 },
  { id: 'f3', x: 6000, zMin: -100, zMax: 180, speed: 100 },
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

export function terrainHeight(x: number): number {
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

interface CartState {
  socketId: string;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;             // cart facing angle in XZ plane
  onGround: boolean;
  boostUntil: number;
  spinOutUntil: number;
  drifting: boolean;
  driftCharge: number;     // 0-1
  driftBoostUntil: number;
  finished: boolean;
  finishRank: number;
  input: {
    accel: boolean;
    brake: boolean;
    left: boolean;
    right: boolean;
    jump: boolean;
    drift: boolean;
  };
  jumpRequestedAt: number;
  lastRampX: number;
  pickupsTaken: Set<string>;
  collisionCooldown: number;
}

interface ForkState { id: string; x: number; z: number; dir: 1 | -1; speed: number; zMin: number; zMax: number }
interface PickupState { id: string; x: number; z: number; type: 'turbo'; active: boolean; respawnAt: number }

export class ShoppingCart extends BaseGame {
  readonly gameType = 'shopping-cart-racing' as const;
  readonly displayName = 'Shopping Cart Downhill 🛒';

  private carts = new Map<string, CartState>();
  private pickups: PickupState[] = [];
  private forks: ForkState[] = [];
  private finishCount = 0;
  private physicsInterval: NodeJS.Timeout | null = null;
  private broadcastInterval: NodeJS.Timeout | null = null;
  private lastTick = Date.now();
  private pendingEvents: Array<{ type: string; data: Record<string, unknown> }> = [];
  private endingEarly = false;

  protected async onStart(): Promise<void> {
    const ids = [...this.config.playerIds];
    ids.forEach((id, idx) => {
      const lateral = ((idx % 5) - 2) * 60;
      this.carts.set(id, {
        socketId: id,
        x: 30 + Math.floor(idx / 5) * 10,
        y: 0, z: lateral,
        vx: 0, vy: 0, vz: 0,
        yaw: 0,
        onGround: true,
        boostUntil: 0,
        spinOutUntil: 0,
        drifting: false,
        driftCharge: 0,
        driftBoostUntil: 0,
        finished: false,
        finishRank: 0,
        input: { accel: false, brake: false, left: false, right: false, jump: false, drift: false },
        jumpRequestedAt: 0,
        lastRampX: -1000,
        pickupsTaken: new Set(),
        collisionCooldown: 0,
      });
    });
    this.pickups = PICKUPS.map(p => ({ ...p, active: true, respawnAt: 0 }));
    this.forks = FORKLIFTS.map(f => ({
      id: f.id, x: f.x, z: (f.zMin + f.zMax) / 2,
      dir: 1 as 1 | -1, speed: f.speed, zMin: f.zMin, zMax: f.zMax,
    }));
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
        c.input.drift = !!input.payload.drift;
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

    // Move forklifts
    for (const f of this.forks) {
      f.z += f.dir * f.speed * dt;
      if (f.z >= f.zMax) { f.z = f.zMax; f.dir = -1; }
      if (f.z <= f.zMin) { f.z = f.zMin; f.dir = 1; }
    }

    for (const c of this.carts.values()) {
      if (c.finished) continue;
      const spinning = now < c.spinOutUntil;
      const boosted = now < c.boostUntil || now < c.driftBoostUntil;
      const mult = boosted ? (now < c.boostUntil ? BOOST_MULT : DRIFT_BOOST_MULT) : 1;

      // ── Drift state ──
      const wasDrifting = c.drifting;
      if (!spinning && c.onGround) {
        const steering = c.input.left || c.input.right;
        c.drifting = c.input.drift && steering;
      } else {
        c.drifting = false;
      }

      // Drift released — award boost
      if (wasDrifting && !c.drifting && c.driftCharge >= DRIFT_BOOST_THRESHOLD) {
        c.driftBoostUntil = now + Math.round(DRIFT_BOOST_DURATION * c.driftCharge);
        this.pendingEvents.push({ type: 'cart:drift_boost', data: { id: c.socketId, charge: c.driftCharge } });
        c.driftCharge = 0;
      } else if (!c.drifting) {
        c.driftCharge = 0;
      }

      if (c.drifting) {
        c.driftCharge = Math.min(1, c.driftCharge + DRIFT_CHARGE_RATE * dt);
      }

      // ── Forward ──
      c.vx += GRAVITY_FORWARD * mult * dt;
      if (!spinning) {
        if (c.input.accel) c.vx += GAS_ACCEL * mult * dt;
        if (c.input.brake) c.vx -= BRAKE_DECEL * dt;
        if (c.drifting) c.vx *= Math.pow(DRIFT_SPEED_PENALTY, dt * 10);
      }
      c.vx -= c.vx * FORWARD_DRAG * dt;
      if (c.vx < 30) c.vx = 30;
      const fmax = FORWARD_MAX * mult;
      if (c.vx > fmax) c.vx = fmax;

      // ── Lateral steering ──
      const latFriction = c.drifting ? DRIFT_LATERAL_FRICTION : LATERAL_FRICTION;
      const steerMult = c.drifting ? DRIFT_STEER_MULT : 1;
      if (!spinning) {
        if (c.input.left) c.vz -= STEER_ACCEL * steerMult * dt;
        if (c.input.right) c.vz += STEER_ACCEL * steerMult * dt;
      }
      c.vz -= c.vz * latFriction * dt;
      const lmax = c.drifting ? LATERAL_MAX * 1.5 : LATERAL_MAX;
      if (c.vz > lmax) c.vz = lmax;
      if (c.vz < -lmax) c.vz = -lmax;

      // Smooth yaw from velocity
      if (c.vx > 10) {
        const targetYaw = Math.atan2(c.vz, c.vx);
        c.yaw += (targetYaw - c.yaw) * Math.min(1, dt * 6);
      }

      // ── Vertical ──
      if (!c.onGround) {
        c.vy += GRAVITY_DOWN * dt;
      }

      if (c.onGround && now - c.jumpRequestedAt < 100) {
        c.vy = JUMP_IMPULSE;
        c.onGround = false;
        c.jumpRequestedAt = 0;
      }

      // ── Integrate ──
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;

      if (c.z > LANE_HALF) { c.z = LANE_HALF; c.vz = -c.vz * 0.35; }
      if (c.z < -LANE_HALF) { c.z = -LANE_HALF; c.vz = -c.vz * 0.35; }

      if (c.y >= 0) {
        if (!c.onGround && c.vy > 250) c.vx *= 0.82;
        c.y = 0;
        c.vy = 0;
        c.onGround = true;
      } else {
        c.onGround = false;
      }

      // Ramp launch
      for (const r of RAMPS) {
        if (c.lastRampX !== r.x && Math.abs(c.x - r.x) < r.halfWidth * 0.3 && c.onGround && c.vx > 180) {
          c.vy = RAMP_LAUNCH;
          c.onGround = false;
          c.lastRampX = r.x;
          this.pendingEvents.push({ type: 'cart:ramp', data: { id: c.socketId } });
        }
      }

      // ── Static obstacles ──
      if (!spinning) {
        for (const o of OBSTACLES) {
          const dx = c.x - o.x;
          const dz = c.z - o.z;
          const obsHeight = o.type === 'tree' ? 90 : (o.type === 'shelf' ? 80 : 30);
          if (c.y < -obsHeight) continue;
          const hitR = (o.type === 'shelf') ? 30 : 18;
          if (dx * dx + dz * dz < (CART_R + hitR) ** 2) {
            c.spinOutUntil = now + SPIN_DURATION;
            c.vx *= 0.5;
            c.vz = -c.vz * 0.4;
            this.pendingEvents.push({ type: 'cart:hit', data: { id: c.socketId, obstacleId: o.id } });
            break;
          }
        }
      }

      // ── Forklift collision ──
      if (!spinning) {
        for (const f of this.forks) {
          const dx = c.x - f.x;
          const dz = c.z - f.z;
          if (dx * dx + dz * dz < (CART_R + 28) ** 2) {
            c.spinOutUntil = now + SPIN_DURATION;
            c.vx *= 0.4;
            c.vz += f.dir * 80;
            this.pendingEvents.push({ type: 'cart:hit', data: { id: c.socketId, obstacleId: f.id } });
          }
        }
      }

      // ── Pickups ──
      for (const p of this.pickups) {
        if (!p.active) {
          if (now >= p.respawnAt) p.active = true;
          else continue;
        }
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        if (dx * dx + dz * dz < (CART_R + 20) ** 2) {
          p.active = false;
          p.respawnAt = now + 6000;
          c.boostUntil = now + BOOST_DURATION;
          this.pendingEvents.push({ type: 'cart:turbo', data: { id: c.socketId } });
        }
      }

      // ── Finish ──
      if (c.x >= FINISH_X) {
        c.finished = true;
        this.finishCount++;
        c.finishRank = this.finishCount;
        const rankPts = [1000, 700, 500, 350, 250, 200, 150];
        const pts = rankPts[c.finishRank - 1] ?? 100;
        this.addScore(c.socketId, pts);
        this.pendingEvents.push({ type: 'cart:finished', data: { id: c.socketId, rank: c.finishRank, points: pts } });
        if (!this.endingEarly && this.finishCount >= this.carts.size) {
          this.endingEarly = true;
          setTimeout(() => this.endEarly(), 1800);
        }
      }
    }

    // ── Cart-cart collisions ──
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
          // Separate
          a.x -= nx * overlap * 0.5;
          a.z -= nz * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.z += nz * overlap * 0.5;
          // Impulse exchange along normal
          const relVx = b.vx - a.vx;
          const relVz = b.vz - a.vz;
          const relDotN = relVx * nx + relVz * nz;
          if (relDotN < 0) {
            const restitution = 0.5;
            const j2 = -(1 + restitution) * relDotN * 0.5;
            a.vx -= j2 * nx; a.vz -= j2 * nz;
            b.vx += j2 * nx; b.vz += j2 * nz;
          }
          this.pendingEvents.push({ type: 'cart:collision', data: { a: a.socketId, b: b.socketId } });
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
      vz: Math.round(c.vz * 10) / 10,
      yaw: Math.round(c.yaw * 100) / 100,
      bs: now < c.boostUntil ? 1 : 0,
      db: now < c.driftBoostUntil ? 1 : 0,
      sp: now < c.spinOutUntil ? 1 : 0,
      dr: c.drifting ? 1 : 0,
      dc: Math.round(c.driftCharge * 100),
      og: c.onGround ? 1 : 0,
      fn: c.finished ? c.finishRank : 0,
    }));
    const forks = this.forks.map(f => ({ id: f.id, z: Math.round(f.z) }));
    const pickups = this.pickups.map(p => ({ id: p.id, a: p.active ? 1 : 0 }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('cart:state' as any, { t: now, carts, pickups, forks });

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
