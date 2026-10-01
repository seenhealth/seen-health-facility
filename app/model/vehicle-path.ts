import type { Vec2 } from './schema';

/**
 * Vehicle routes as chains of straight runs and circular arcs of the vehicle's
 * centre (no spline overshoot), so turning radii are exact. Directions are
 * `atan2(dx, dz)`: 0 runs toward +z, π/2 toward +x. Shared by the fleet, the
 * delivery trucks, the street cars and the other sites' vans.
 */

/** A straight (curvature 0) or circular piece starting at (x, z) travelling along `dir`. */
export type Piece = {
  x: number;
  z: number;
  dir: number;
  length: number;
  curvature: number;
};
export function pieceAt(p: Piece, s: number) {
  if (!p.curvature)
    return {
      x: p.x + s * Math.sin(p.dir),
      z: p.z + s * Math.cos(p.dir),
      dir: p.dir,
    };
  const d = p.dir + p.curvature * s;
  return {
    x: p.x + (Math.cos(p.dir) - Math.cos(d)) / p.curvature,
    z: p.z + (Math.sin(d) - Math.sin(p.dir)) / p.curvature,
    dir: d,
  };
}
/** Turtle that lays pieces end to end. Positive arc angles turn right (+z → +x). */
export class Pen {
  pieces: Piece[] = [];
  constructor(
    public x: number,
    public z: number,
    public dir: number,
  ) {}
  private add(length: number, curvature: number) {
    if (length < 1e-9) return this;
    const piece = { x: this.x, z: this.z, dir: this.dir, length, curvature };
    this.pieces.push(piece);
    ({ x: this.x, z: this.z, dir: this.dir } = pieceAt(piece, length));
    return this;
  }
  line(length: number) {
    if (length < -1e-6)
      throw new Error(`Vehicle route runs backwards (${length} m)`);
    return this.add(length, 0);
  }
  /** Straight on until reaching `x` (or `z`) along the current direction. */
  lineToX(x: number) {
    return this.line((x - this.x) / Math.sin(this.dir));
  }
  lineToZ(z: number) {
    return this.line((z - this.z) / Math.cos(this.dir));
  }
  arc(radius: number, angle: number) {
    return this.add(Math.abs(angle) * radius, Math.sign(angle) / radius);
  }
  /** Lane change: two opposite arcs; `lateral` is positive to the right of travel. */
  jog(lateral: number, radius: number) {
    const a = Math.acos(1 - Math.abs(lateral) / (2 * radius)),
      s = Math.sign(lateral);
    return this.arc(radius, s * a).arc(radius, -s * a);
  }
  /** Take the pieces laid since the last take. */
  take() {
    const out = this.pieces;
    this.pieces = [];
    return out;
  }
}
/** Distance a lane change of `lateral` metres covers along the road. */
export const jogLength = (lateral: number, radius: number) =>
  2 * radius * Math.sin(Math.acos(1 - Math.abs(lateral) / (2 * radius)));
export const pathLength = (pieces: Piece[]) =>
  pieces.reduce((s, p) => s + p.length, 0);
/** Point and travel direction `s` metres along a chain of pieces (clamped to its ends). */
export function pathAt(pieces: Piece[], s: number) {
  let local = Math.max(0, s);
  for (const p of pieces) {
    if (local <= p.length) return pieceAt(p, local);
    local -= p.length;
  }
  const last = pieces.at(-1)!;
  return pieceAt(last, last.length);
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/**
 * Pieces through corner points with every corner rounded to a tangent arc of
 * `radius` (one radius for all corners, or one per corner point; the ends of
 * an open path take none). A closed path starts where the arc at its first
 * point ends. Throws when two neighbouring arcs would overlap on a side.
 */
export function roundedPath(
  points: Vec2[],
  radius: number | number[],
  closed = false,
): Piece[] {
  const n = points.length,
    sides = closed ? n : n - 1;
  const side = (i: number) => {
    const [a, b] = [points[i % n], points[(i + 1) % n]];
    return {
      length: Math.hypot(b[0] - a[0], b[1] - a[1]),
      dir: Math.atan2(b[0] - a[0], b[1] - a[1]),
    };
  };
  const s = Array.from({ length: sides }, (_, i) => side(i));
  // Turn and tangent length at each corner point (0 at an open path's ends).
  const corners = points.map((_, i) => {
    if (!closed && (i === 0 || i === n - 1)) return { turn: 0, cut: 0, r: 0 };
    const turn = wrap(s[i % sides].dir - s[(i - 1 + sides) % sides].dir),
      r = Array.isArray(radius) ? radius[i] : radius;
    return { turn, cut: r * Math.tan(Math.abs(turn) / 2), r };
  });
  s.forEach((sd, i) => {
    const used = corners[i].cut + corners[(i + 1) % n].cut;
    if (used > sd.length + 1e-6)
      throw new Error(
        `Rounded corners overlap on side ${i} (${used.toFixed(2)} m of ${sd.length.toFixed(2)} m)`,
      );
  });
  const [x0, z0] = points[0],
    first = s[0];
  const pen = new Pen(
    x0 + corners[0].cut * Math.sin(first.dir),
    z0 + corners[0].cut * Math.cos(first.dir),
    first.dir,
  );
  s.forEach((sd, i) => {
    const end = corners[(i + 1) % n];
    pen.line(sd.length - corners[i].cut - end.cut);
    if (end.turn) pen.arc(end.r, end.turn);
  });
  return pen.take();
}
