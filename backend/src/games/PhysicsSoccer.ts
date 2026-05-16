/**
 * Physics Soccer — server-authoritative 2D physics (x/z plane).
 * Physics tick: 60 Hz. Broadcast: 20 Hz.
 */
import { GameResults, PlayerResult } from '../types';
import { BaseGame } from './BaseGame';

// ── Physics constants ─────────────────────────────────────────────────────────

const PHYSICS_HZ   = 60;
const BROADCAST_HZ = 20;
const DT           = 1 / PHYSICS_HZ;

// Arena (x = left/right, z = top/bottom)
const AW  = 40;  // total width  (x: −20 → +20)
const AH  = 26;  // total depth  (z: −13 → +13)
const GW  = 8;   // goal mouth width (z span)

// Ball
const BALL_R_BASE = 1.1;
const BALL_E      = 0.78;    // restitution on wall bounce
const BALL_DRAG   = 0.992;
const BALL_MASS   = 1;

// Player
const PL_R          = 0.85;
const PL_MASS       = 3;
const PL_ACCEL      = 52;
const PL_MAX_SPD    = 17;
const PL_BOOST_SPD  = 34;
const PL_DRAG       = 0.80;
const BOOST_DUR_MS  = 700;
const BOOST_CD_MS   = 3800;
const DASH_IMPULSE  = 25;

// Ball-player collision
const COL_REST = 1.5;
const KICK_MULT_BOOST = 1.9;
const BALL_MAX_SPD = 38;

// Spawn (alternating left/right, z spread)
const TEAM_SPAWN_X   = [-12, 12] as const;
const TEAM_SPAWN_Z   = [0, -5, 5, -9, 9, -12, 12] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type ChaosKind = 'low_gravity' | 'ice_floor' | 'giant_ball' | 'super_speed' | 'turbo_ball' | 'mini_mode';

interface ActiveChaos { kind: ChaosKind; endsAt: number; label: string }

interface SoccerBall  { x: number; z: number; vx: number; vz: number; spin: number; r: number }

interface SoccerPlayer {
  socketId: string;
  team: 0 | 1;
  x: number; z: number;
  vx: number; vz: number;
  input: { dx: number; dz: number; boost: boolean; dashEdge: boolean };
  boosting: boolean;
  boostUntil: number;
  boostCooldownUntil: number;
  goals: number; assists: number;
}

// ── Game ──────────────────────────────────────────────────────────────────────

export class PhysicsSoccer extends BaseGame {
  readonly gameType = 'physics-soccer' as const;
  readonly displayName = 'Physics Soccer ⚽';

  private sp    = new Map<string, SoccerPlayer>();
  private ball: SoccerBall = this.freshBall();
  private score: [number, number] = [0, 0];

  // Assist tracking: last two distinct touchers
  private touchers: string[] = [];
  private inReset = false;

  private activeChaos: ActiveChaos | null = null;
  private physInt: NodeJS.Timeout | null = null;
  private bcastInt: NodeJS.Timeout | null = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  protected async onStart(): Promise<void> {
    this.score = [0, 0];
    this.ball  = this.freshBall();
    this.touchers = [];

    let idx = 0;
    for (const id of this.config.playerIds) {
      const team = (idx % 2) as 0 | 1;
      const ti   = Math.floor(idx / 2);
      this.sp.set(id, {
        socketId: id, team,
        x: TEAM_SPAWN_X[team] + (Math.random() - 0.5),
        z: (TEAM_SPAWN_Z[ti] ?? 0) + (Math.random() - 0.5),
        vx: 0, vz: 0,
        input: { dx: 0, dz: 0, boost: false, dashEdge: false },
        boosting: false,
        boostUntil: 0,
        boostCooldownUntil: 0,
        goals: 0, assists: 0,
      });
      idx++;
    }
  }

  protected async onPlayStart(): Promise<void> {
    this.physInt  = setInterval(() => this.step(), 1000 / PHYSICS_HZ);
    this.bcastInt = setInterval(() => this.broadcast(), 1000 / BROADCAST_HZ);
  }

  protected override clearTimers(): void {
    super.clearTimers();
    if (this.physInt)  clearInterval(this.physInt);
    if (this.bcastInt) clearInterval(this.bcastInt);
    this.physInt = this.bcastInt = null;
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  protected onInput(id: string, msg: { type: string; payload: Record<string, unknown> }): void {
    if (msg.type !== 'soccer_input') return;
    const p = this.sp.get(id);
    if (!p) return;

    const { dx = 0, dz = 0, boost = false, dash = false } = msg.payload as {
      dx?: number; dz?: number; boost?: boolean; dash?: boolean;
    };

    const wasBoost = p.input.boost;
    p.input.dx = Math.max(-1, Math.min(1, Number(dx)));
    p.input.dz = Math.max(-1, Math.min(1, Number(dz)));
    p.input.boost = !!boost;

    // Dash rising edge
    if (dash && !p.input.dashEdge) {
      const now = Date.now();
      if (now >= p.boostCooldownUntil) {
        p.boosting = true;
        p.boostUntil = now + BOOST_DUR_MS;
        p.boostCooldownUntil = now + BOOST_CD_MS;
        const len = Math.hypot(p.input.dx, p.input.dz);
        if (len > 0.01) {
          p.vx += (p.input.dx / len) * DASH_IMPULSE;
          p.vz += (p.input.dz / len) * DASH_IMPULSE;
        }
      }
    }
    p.input.dashEdge = !!dash;
  }

  // ── Physics step ──────────────────────────────────────────────────────────

  private step(): void {
    if (!this.isRunning || this.inReset) return;
    const now = Date.now();

    // Expire chaos
    if (this.activeChaos && now > this.activeChaos.endsAt) {
      if (this.activeChaos.kind === 'giant_ball') this.ball.r = BALL_R_BASE;
      this.activeChaos = null;
    }

    // Chaos multipliers
    let spdMult  = 1;
    let platDrag = PL_DRAG;
    let ballDrag = BALL_DRAG;
    const chaos  = this.activeChaos?.kind;
    if (chaos === 'super_speed') spdMult  = 1.7;
    if (chaos === 'ice_floor')   platDrag = 0.97; // slippery = less friction
    if (chaos === 'low_gravity') ballDrag = 0.999;
    if (chaos === 'turbo_ball')  ballDrag = 0.998;

    const players = [...this.sp.values()];

    // ── Players ────────────────────────────────────────────────────────────
    for (const p of players) {
      if (now > p.boostUntil) p.boosting = false;
      const maxSpd = (p.boosting ? PL_BOOST_SPD : PL_MAX_SPD) * spdMult;

      const len = Math.hypot(p.input.dx, p.input.dz);
      if (len > 0.01) {
        p.vx += (p.input.dx / len) * PL_ACCEL * DT;
        p.vz += (p.input.dz / len) * PL_ACCEL * DT;
      }
      const spd = Math.hypot(p.vx, p.vz);
      if (spd > maxSpd) { p.vx *= maxSpd / spd; p.vz *= maxSpd / spd; }

      p.vx *= platDrag;
      p.vz *= platDrag;
      p.x  += p.vx * DT;
      p.z  += p.vz * DT;

      // Arena boundary
      const bx = AW / 2 - PL_R, bz = AH / 2 - PL_R;
      if (p.x < -bx) { p.x = -bx; p.vx =  Math.abs(p.vx) * 0.25; }
      if (p.x >  bx) { p.x =  bx; p.vx = -Math.abs(p.vx) * 0.25; }
      if (p.z < -bz) { p.z = -bz; p.vz =  Math.abs(p.vz) * 0.25; }
      if (p.z >  bz) { p.z =  bz; p.vz = -Math.abs(p.vz) * 0.25; }
    }

    // ── Player-player collisions ───────────────────────────────────────────
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i], b = players[j];
        const ddx = b.x - a.x, ddz = b.z - a.z;
        const d   = Math.hypot(ddx, ddz);
        const min = PL_R * 2;
        if (d < min && d > 0.001) {
          const nx = ddx / d, nz = ddz / d;
          const ov = (min - d) * 0.52;
          a.x -= nx * ov; a.z -= nz * ov;
          b.x += nx * ov; b.z += nz * ov;
          const rv  = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (rv < 0) {
            const imp = rv * 0.55;
            a.vx += imp * nx; a.vz += imp * nz;
            b.vx -= imp * nx; b.vz -= imp * nz;
          }
        }
      }
    }

    // ── Ball ──────────────────────────────────────────────────────────────
    this.ball.vx *= ballDrag;
    this.ball.vz *= ballDrag;
    this.ball.spin *= 0.97;
    this.ball.x   += this.ball.vx * DT;
    this.ball.z   += this.ball.vz * DT;

    const br  = this.ball.r;
    const wbx = AW / 2 - br;
    const wbz = AH / 2 - br;

    // Left wall / left goal
    if (this.ball.x < -wbx) {
      if (Math.abs(this.ball.z) < GW / 2) { this.onGoal(1); return; }
      this.ball.x  = -wbx;
      this.ball.vx = Math.abs(this.ball.vx) * BALL_E;
      this.ball.spin += this.ball.vz * 0.08;
    }
    // Right wall / right goal
    if (this.ball.x > wbx) {
      if (Math.abs(this.ball.z) < GW / 2) { this.onGoal(0); return; }
      this.ball.x  = wbx;
      this.ball.vx = -Math.abs(this.ball.vx) * BALL_E;
      this.ball.spin -= this.ball.vz * 0.08;
    }
    // Top/bottom
    if (this.ball.z < -wbz) { this.ball.z = -wbz; this.ball.vz =  Math.abs(this.ball.vz) * BALL_E; }
    if (this.ball.z >  wbz) { this.ball.z =  wbz; this.ball.vz = -Math.abs(this.ball.vz) * BALL_E; }

    // ── Ball-player collisions ─────────────────────────────────────────────
    let touched: string | null = null;
    for (const p of players) {
      const ddx = this.ball.x - p.x, ddz = this.ball.z - p.z;
      const d   = Math.hypot(ddx, ddz);
      const min = br + PL_R;
      if (d >= min || d < 0.001) continue;

      const nx = ddx / d, nz = ddz / d;
      // Separate
      this.ball.x = p.x + nx * (min + 0.01);
      this.ball.z = p.z + nz * (min + 0.01);

      // Elastic impulse
      const rvn = (this.ball.vx - p.vx) * nx + (this.ball.vz - p.vz) * nz;
      if (rvn < 0) {
        const j = -(1 + COL_REST) * rvn / (1 / BALL_MASS + 1 / PL_MASS);
        this.ball.vx += (j / BALL_MASS) * nx;
        this.ball.vz += (j / BALL_MASS) * nz;
        p.vx         -= (j / PL_MASS)   * nx;
        p.vz         -= (j / PL_MASS)   * nz;
      }

      // Kick bonus from player velocity
      const ps = Math.hypot(p.vx, p.vz);
      if (ps > 0.5) {
        const km = p.boosting ? KICK_MULT_BOOST : 1.0;
        const kick = Math.min(ps * 1.4, 20) * km;
        this.ball.vx += (p.vx / ps) * kick * 0.35;
        this.ball.vz += (p.vz / ps) * kick * 0.35;
        this.ball.spin += p.vx * 0.06;
      }

      // Clamp ball speed
      const bs = Math.hypot(this.ball.vx, this.ball.vz);
      if (bs > BALL_MAX_SPD) { this.ball.vx *= BALL_MAX_SPD / bs; this.ball.vz *= BALL_MAX_SPD / bs; }

      touched = p.socketId;
    }

    // Track last two distinct touchers for assists
    if (touched && touched !== this.touchers[0]) {
      this.touchers.unshift(touched);
      if (this.touchers.length > 2) this.touchers.pop();
    }
  }

  // ── Goal ──────────────────────────────────────────────────────────────────

  private onGoal(scoringTeam: 0 | 1): void {
    if (this.inReset) return;
    this.inReset = true;
    this.score[scoringTeam]++;

    const scorerId   = this.touchers[0] ?? null;
    const assisterId = this.touchers[1] ?? null;
    const scorer     = scorerId   ? this.sp.get(scorerId)   : null;
    const assister   = assisterId ? this.sp.get(assisterId) : null;

    if (scorer) {
      if (scorer.team === scoringTeam) {
        scorer.goals++;
        this.addScore(scorerId!, 100);
      } else {
        // Own goal — award nothing extra, scoreboard still counts
      }
    }
    if (assister && assister !== scorer && assister.team === scoringTeam) {
      assister.assists++;
      this.addScore(assisterId!, 50);
    }

    this.touchers = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('soccer:goal' as any, {
      team: scoringTeam,
      score: [...this.score],
      scorer: scorer?.team === scoringTeam ? scorerId : null,
      assister: assister?.team === scoringTeam ? assisterId : null,
    });

    setTimeout(() => {
      if (!this.isRunning) return;
      this.resetField();
      this.inReset = false;
    }, 2200);
  }

  private resetField(): void {
    this.ball = this.freshBall();
    let idx = 0;
    for (const p of this.sp.values()) {
      const ti = Math.floor(idx / 2);
      p.x  = TEAM_SPAWN_X[p.team] + (Math.random() - 0.5) * 1.5;
      p.z  = (TEAM_SPAWN_Z[ti] ?? 0) + (Math.random() - 0.5) * 1.5;
      p.vx = p.vz = 0;
      idx++;
    }
  }

  private freshBall(): SoccerBall {
    const angle = (Math.random() - 0.5) * Math.PI * 0.5;
    const dir   = Math.random() > 0.5 ? 1 : -1;
    return {
      x: 0, z: 0,
      vx: Math.cos(angle) * dir * 5,
      vz: Math.sin(angle) * 5,
      spin: 0,
      r: BALL_R_BASE,
    };
  }

  // ── Chaos ──────────────────────────────────────────────────────────────────

  protected override triggerChaos(): void {
    const opts: { kind: ChaosKind; label: string }[] = [
      { kind: 'low_gravity', label: '🌙 LOW GRAVITY — ball floats!' },
      { kind: 'ice_floor',   label: '🧊 ICE FLOOR — no brakes!' },
      { kind: 'giant_ball',  label: '🔵 GIANT BALL!' },
      { kind: 'super_speed', label: '⚡ SUPER SPEED — everyone faster!' },
      { kind: 'turbo_ball',  label: '🔥 TURBO BALL — it never slows down!' },
      { kind: 'mini_mode',   label: '🐜 MINI MODE — tiny players!' },
    ];
    const pick = opts[Math.floor(Math.random() * opts.length)];
    const dur  = 6000 + Math.random() * 4000;

    this.activeChaos = { kind: pick.kind, endsAt: Date.now() + dur, label: pick.label };
    if (pick.kind === 'giant_ball') this.ball.r = BALL_R_BASE * 2.4;

    this.io.to(this.config.roomId).emit('chaos:announcement', pick.label);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('soccer:chaos' as any, {
      kind: pick.kind,
      label: pick.label,
      duration: dur,
    });
  }

  // ── Broadcast ──────────────────────────────────────────────────────────────

  private broadcast(): void {
    if (!this.isRunning) return;
    const players = [...this.sp.values()].map(p => ({
      id:       p.socketId,
      team:     p.team,
      x:        Math.round(p.x  * 10) / 10,
      z:        Math.round(p.z  * 10) / 10,
      vx:       Math.round(p.vx * 10) / 10,
      vz:       Math.round(p.vz * 10) / 10,
      boosting: p.boosting,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.io.to(this.config.roomId).emit('soccer:state' as any, {
      t: Date.now(),
      ball: {
        x:    Math.round(this.ball.x    * 10) / 10,
        z:    Math.round(this.ball.z    * 10) / 10,
        vx:   Math.round(this.ball.vx   * 10) / 10,
        vz:   Math.round(this.ball.vz   * 10) / 10,
        spin: Math.round(this.ball.spin * 10) / 10,
        r:    this.ball.r,
      },
      players,
      score:  [...this.score],
      chaos:  this.activeChaos?.kind ?? null,
      inReset: this.inReset,
    });
  }

  // ── Bookkeeping ────────────────────────────────────────────────────────────

  protected onTick(_r: number): void {}

  protected getGameData(): unknown {
    return { score: this.score, ball: { x: this.ball.x, z: this.ball.z }, chaos: this.activeChaos?.kind };
  }

  protected buildResults(): GameResults {
    const winner =
      this.score[0] > this.score[1] ? 0 :
      this.score[1] > this.score[0] ? 1 : -1;

    for (const p of this.sp.values()) {
      const bonus = winner === -1 ? 75 : p.team === winner ? 200 : 30;
      this.addScore(p.socketId, bonus);
    }

    const lb = this.getLeaderboard();
    const resultPlayers: PlayerResult[] = lb.map((e, idx) => {
      const p = this.sp.get(e.playerId)!;
      return {
        playerId:   e.playerId,
        username:   '', avatar: '', color: '',
        roundScore: e.score,
        totalScore: this.totalScores[e.playerId] ?? 0,
        rank: idx + 1,
        stats: { team: p.team === 0 ? 'Red' : 'Blue', goals: p.goals, assists: p.assists },
      };
    });

    const [r, b] = this.score;
    const highlights = [
      r > b ? `🔴 Red Team wins ${r}–${b}!` :
      b > r ? `🔵 Blue Team wins ${b}–${r}!` :
              `⚽ Draw — ${r}–${b}!`,
    ];

    return { gameType: this.gameType, scores: resultPlayers, mvp: lb[0]?.playerId ?? '', highlights };
  }
}
