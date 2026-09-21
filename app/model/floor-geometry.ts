import * as T from 'three';
import type { Vec2 } from './schema';
export type FloorOpening = {
  id: string;
  connectionId: string;
  zoneId: string;
  levelId: string;
  bounds: [Vec2, Vec2];
};
// Subtract rectangular apertures by clipping into non-overlapping strips. Unlike
// Shape.holes this also handles an opening crossing a room finish boundary.
function clip(poly: Vec2[], axis: 0 | 1, value: number, less: boolean): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const ina = less ? a[axis] <= value : a[axis] >= value,
      inb = less ? b[axis] <= value : b[axis] >= value;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (value - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}
function area(p: Vec2[]) {
  return (
    Math.abs(
      p.reduce((a, v, i) => {
        const n = p[(i + 1) % p.length];
        return a + v[0] * n[1] - n[0] * v[1];
      }, 0),
    ) / 2
  );
}
export function floorShapes(
  polygon: Vec2[],
  openings: FloorOpening[],
): T.Shape[] {
  let pieces = [polygon];
  for (const {
    bounds: [[x0, z0], [x1, z1]],
  } of openings) {
    pieces = pieces
      .flatMap((p) => {
        const mid = clip(clip(p, 0, x0, false), 0, x1, true);
        return [
          clip(p, 0, x0, true),
          clip(p, 0, x1, false),
          clip(mid, 1, z0, true),
          clip(mid, 1, z1, false),
        ];
      })
      .filter((p) => p.length >= 3 && area(p) > 1e-8);
  }
  return pieces.map((p) => {
    const s = new T.Shape();
    s.moveTo(p[0][0], -p[0][1]);
    for (const v of p.slice(1)) s.lineTo(v[0], -v[1]);
    s.closePath();
    return s;
  });
}
