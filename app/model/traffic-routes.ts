import * as T from 'three';
import schedule from '../data/street-traffic.json';
import type { Vec2 } from './schema';

/**
 * Ring-street lane centre-lines around the Alhambra block (metres). Each side
 * has an inner lane (closest to the site) and an outer lane `offset` further
 * out. Inner lanes circulate north → east → south → west (eastbound on the
 * north street, southbound/−z on the east street, westbound on the south
 * street, northbound/+z on the west street); outer lanes run the other way.
 */
export const STREET_LANES = {
  north: 39.4,
  south: -30.7,
  east: 52.2,
  west: -43.8,
  offset: 3.3,
};
export type StreetSide = 'north' | 'south' | 'east' | 'west';
const OUTWARD: Record<StreetSide, number> = {
  north: 1,
  south: -1,
  east: 1,
  west: -1,
};
/** Centre-line coordinate of a lane: z for the north/south streets, x for the east/west streets. */
export function laneLine(side: StreetSide, lane: 0 | 1) {
  return STREET_LANES[side] + OUTWARD[side] * STREET_LANES.offset * lane;
}
const INNER_FLOW: Record<StreetSide, Vec2> = {
  north: [1, 0],
  east: [0, -1],
  south: [-1, 0],
  west: [0, 1],
};
/** Unit direction traffic flows on a lane. */
export function laneFlow(side: StreetSide, lane: 0 | 1): Vec2 {
  const [x, z] = INNER_FLOW[side];
  return lane ? [-x, -z] : [x, z];
}

/**
 * Distance fraction covered after `t` of a drive lasting `seconds`: constant
 * acceleration over the first `rampIn` and last `rampOut` seconds, constant
 * speed between. Shared easing for every vehicle sampler.
 */
export function easeDistance(
  t: number,
  seconds: number,
  rampIn: number,
  rampOut: number,
) {
  const x = T.MathUtils.clamp(t, 0, seconds),
    v = 1 / (seconds - rampIn / 2 - rampOut / 2);
  if (x < rampIn) return (v / (2 * rampIn)) * x * x;
  if (x > seconds - rampOut)
    return 1 - (v / (2 * rampOut)) * (seconds - x) ** 2;
  return v * (x - rampIn / 2);
}

// Separate street lanes, with holding points upstream of the site's driveways.
const circuits = ([0, 1] as const).map((lane) => {
  const north = laneLine('north', lane),
    south = laneLine('south', lane),
    east = laneLine('east', lane),
    west = laneLine('west', lane);
  return new T.CatmullRomCurve3(
    [
      [-40.5, north],
      [49, north],
      [east, 36],
      [east, -27.5],
      [49, south],
      [-40.5, south],
      [west, -27.5],
      [west, 36],
    ].map((p) => new T.Vector3(p[0], -0.18, p[1])),
    true,
    'catmullrom',
    0.15,
  );
});
const holding = circuits.map((curve, i) => {
  const target = new T.Vector3(
    ...((i
      ? [laneLine('west', 1), -0.18, -20]
      : [42, -0.18, laneLine('south', 0)]) as [number, number, number]),
  );
  let best = 0,
    distance = Infinity;
  for (let j = 0; j < 3000; j++) {
    const d = curve.getPointAt(j / 3000).distanceToSquared(target);
    if (d < distance) {
      best = j / 3000;
      distance = d;
    }
  }
  return best;
});
export function streetTripProgress(elapsed: number, duration: number) {
  return easeDistance(elapsed, duration, 3, 3);
}
export function streetRoute(index: number, progress: number) {
  const direction = index ? -1 : 1;
  const phase = (((holding[index] + progress * direction) % 1) + 1) % 1;
  const position = circuits[index].getPointAt(phase),
    d = circuits[index].getTangentAt(phase).multiplyScalar(direction);
  return { position, heading: Math.atan2(d.x, d.z), visible: true };
}
export function sampleStreetCar(index: number, time: number) {
  const t =
    ((time % schedule.duration) + schedule.duration) % schedule.duration;
  const trip = (schedule.trips[index] as number[][]).find(
    ([start, end]) => t >= start && t < end,
  );
  return {
    ...streetRoute(
      index,
      trip ? streetTripProgress(t - trip[0], trip[1] - trip[0]) : 0,
    ),
    phase: trip ? 'Driving' : 'Yielding at driveway approach',
  };
}
