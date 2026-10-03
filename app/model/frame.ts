import type { Vec2 } from './schema';

/**
 * A local frame on the ground plane: an origin and a heading. One convention
 * everywhere (community pads, facility instances, vehicles): `heading` turns
 * the frame like three.js `Object3D.rotation.y`, so local +z maps to the world
 * direction (sin h, cos h) and local +x to (cos h, −sin h). Metres, +x east,
 * +z south (`COMPASS`). Pure math, no three.js.
 */
export type Frame = { position: Vec2; heading: number };
/**
 * The real compass on the world's ground plane. The center stands on the
 * north side of Valley Blvd with Ethel Avenue to its west, so +x is east and
 * +z is south. The code's street and heading names are the plan's, not the
 * compass's: `north` is Valley Blvd (+z) and `south` the alley (−z), and the
 * fleet's `NORTH` heading points +z. Anything that needs real directions (the
 * sun) reads them from here.
 */
export const COMPASS = {
  north: [0, -1] as Vec2,
  east: [1, 0] as Vec2,
};
type Placed = Pick<Frame, 'position' | 'heading'>;

/** A local point in the world. */
export function toWorld(f: Placed, p: Vec2): Vec2 {
  const c = Math.cos(f.heading),
    s = Math.sin(f.heading);
  return [
    f.position[0] + p[0] * c + p[1] * s,
    f.position[1] - p[0] * s + p[1] * c,
  ];
}
/** A world point in the frame. */
export function toLocal(f: Placed, p: Vec2): Vec2 {
  const c = Math.cos(f.heading),
    s = Math.sin(f.heading),
    dx = p[0] - f.position[0],
    dz = p[1] - f.position[1];
  return [dx * c - dz * s, dx * s + dz * c];
}
/** A local direction in the world (no translation). */
export function worldDir(f: Pick<Frame, 'heading'>, d: Vec2): Vec2 {
  const c = Math.cos(f.heading),
    s = Math.sin(f.heading);
  return [d[0] * c + d[1] * s, -d[0] * s + d[1] * c];
}
/** `inner`, authored in `outer`'s local frame, as a world frame. */
export function composeFrames(outer: Placed, inner: Placed): Frame {
  return {
    position: toWorld(outer, inner.position),
    heading: outer.heading + inner.heading,
  };
}
/** A local polygon in the world. */
export function transformPolygon(f: Placed, poly: readonly Vec2[]): Vec2[] {
  return poly.map((p) => toWorld(f, p));
}
/** Even-odd point-in-polygon test on the ground plane. */
export function insidePolygon(p: Vec2, poly: readonly Vec2[]) {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      odd = !odd;
  }
  return odd;
}
