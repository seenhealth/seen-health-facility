/**
 * Walking routes around parked vehicles on the live lot. Each vehicle is an
 * oriented rectangle (centre, heading, half width across, half length along),
 * padded by a body's clearance; a leg that would cut through one is replaced by
 * the shortest chain of padded corners that does not (a visibility graph over
 * the corners, Dijkstra). Pure, so it is unit tested (test/walk-route.test.ts).
 */
export type Footprint = {
  x: number;
  z: number;
  /** Heading as the scene sets `rotation.y`: local +z (rear) points to (sin h, cos h). */
  heading: number;
  halfWidth: number;
  halfLength: number;
};
export type Pt = [number, number];

/** Clearance a walker keeps from a body, and a little more for the corner points it walks through. */
export const WALK_CLEARANCE = 0.35;
const CORNER_EXTRA = 0.08;

function toLocal(f: Footprint, [x, z]: Pt): Pt {
  const dx = x - f.x,
    dz = z - f.z,
    c = Math.cos(f.heading),
    s = Math.sin(f.heading);
  // Inverse of local (lx, lz) -> world (lx c + lz s, -lx s + lz c).
  return [dx * c - dz * s, dx * s + dz * c];
}
function toWorld(f: Footprint, [lx, lz]: Pt): Pt {
  const c = Math.cos(f.heading),
    s = Math.sin(f.heading);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}

/** Whether a point lies inside the footprint grown by `pad`. */
export function inside(f: Footprint, p: Pt, pad = WALK_CLEARANCE) {
  const [lx, lz] = toLocal(f, p);
  return (
    Math.abs(lx) < f.halfWidth + pad - 1e-6 &&
    Math.abs(lz) < f.halfLength + pad - 1e-6
  );
}

/** Whether segment a–b passes through the footprint grown by `pad` (slab test in its frame). */
export function crosses(f: Footprint, a: Pt, b: Pt, pad = WALK_CLEARANCE) {
  const [ax, az] = toLocal(f, a),
    [bx, bz] = toLocal(f, b);
  const hx = f.halfWidth + pad - 1e-6,
    hz = f.halfLength + pad - 1e-6;
  let t0 = 0,
    t1 = 1;
  for (const [p, d, h] of [
    [ax, bx - ax, hx],
    [az, bz - az, hz],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(p) >= h) return false;
      continue;
    }
    let ta = (-h - p) / d,
      tb = (h - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1) return false;
  }
  return t1 - t0 > 1e-6;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Points to walk through between `a` and `b` (exclusive) so the walk stays
 * clear of every footprint. A footprint that holds an end of the leg (the
 * walker's own car, a door in a tight bay) is ignored for that leg. With no
 * clear route the straight leg is returned (empty list).
 */
export function routeAround(a: Pt, b: Pt, footprints: Footprint[]): Pt[] {
  const obs = footprints.filter((f) => !inside(f, a) && !inside(f, b));
  const blocked = (p: Pt, q: Pt) => obs.some((f) => crosses(f, p, q));
  if (!blocked(a, b)) return [];
  const pad = WALK_CLEARANCE + CORNER_EXTRA;
  const nodes: Pt[] = [a, b];
  for (const f of obs)
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const p = toWorld(f, [
        sx * (f.halfWidth + pad),
        sz * (f.halfLength + pad),
      ]);
      if (!obs.some((g) => inside(g, p))) nodes.push(p);
    }
  const n = nodes.length,
    best: number[] = Array.from({ length: n }, () => Infinity),
    prev: number[] = Array.from({ length: n }, () => -1),
    done: boolean[] = Array.from({ length: n }, () => false);
  best[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++)
      if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const w = best[u] + dist(nodes[u], nodes[v]);
      if (w < best[v] && !blocked(nodes[u], nodes[v])) {
        best[v] = w;
        prev[v] = u;
      }
    }
  }
  if (prev[1] < 0) return [];
  const path: Pt[] = [];
  for (let v = prev[1]; v > 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}
