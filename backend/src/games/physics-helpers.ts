// Reusable physics primitives for top-down / side-view physics games.
// Used by KnockbackArena; intended to be shared by future physics games.

export interface Vec2 { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export function vlen(v: Vec2): number { return Math.hypot(v.x, v.y); }

export function vnorm(v: Vec2): Vec2 {
  const l = vlen(v);
  if (l < 0.0001) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

// Closest point on a rect to a circle center — used for circle-rect collision
export function closestPointOnRect(cx: number, cy: number, r: Rect): Vec2 {
  return {
    x: Math.max(r.x, Math.min(cx, r.x + r.w)),
    y: Math.max(r.y, Math.min(cy, r.y + r.h)),
  };
}

// Returns true if a point (cx, cy) is inside the rect (with optional tolerance)
export function pointInRect(cx: number, cy: number, r: Rect, tol = 0): boolean {
  return cx >= r.x - tol && cx <= r.x + r.w + tol && cy >= r.y - tol && cy <= r.y + r.h + tol;
}

// Resolve a circle that may have penetrated a static rect — push out by normal.
// Returns the new {x, y} position. Used to keep players from clipping into platform edges.
export function resolveCircleRect(cx: number, cy: number, r: number, rect: Rect): Vec2 | null {
  const closest = closestPointOnRect(cx, cy, rect);
  const dx = cx - closest.x;
  const dy = cy - closest.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2) || 0.0001;
  return { x: closest.x + (dx / d) * r, y: closest.y + (dy / d) * r };
}

// Resolve overlap between two circles — pushes them apart by half the overlap each
export function resolveCircles(
  a: { x: number; y: number; r: number },
  b: { x: number; y: number; r: number }
): { ax: number; ay: number; bx: number; by: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const minD = a.r + b.r;
  if (d2 >= minD * minD) return null;
  const d = Math.sqrt(d2) || 0.0001;
  const overlap = minD - d;
  const nx = dx / d, ny = dy / d;
  return {
    ax: a.x - nx * overlap * 0.5,
    ay: a.y - ny * overlap * 0.5,
    bx: b.x + nx * overlap * 0.5,
    by: b.y + ny * overlap * 0.5,
  };
}

// Returns true if angle from origin→target is within `arc/2` of `facingRad`
export function inArc(
  origin: Vec2, target: Vec2, facingRad: number, arc: number, range: number
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > range * range) return false;
  const angTo = Math.atan2(dy, dx);
  let diff = angTo - facingRad;
  // wrap to [-π, π]
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff) <= arc / 2;
}
