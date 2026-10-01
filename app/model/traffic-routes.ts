import * as T from 'three';
import schedule from '../data/street-traffic.json';
import type { Vec2 } from './schema';
import { pathAt, pathLength, roundedPath } from './vehicle-path';

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
/** Radius of every turn at a ring-street corner (street cars, fleet, community vehicles). */
export const STREET_CORNER_RADIUS = 6.4;
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

// One closed circuit per lane, round the block with every corner a
// STREET_CORNER_RADIUS arc, and a holding point upstream of the site's
// driveways on each. Street car 0 drives lane 0's circuit forward, street car
// 1 lane 1's backward (each lane's own flow).
const circuits = ([0, 1] as const).map((lane) => {
  const north = laneLine('north', lane),
    south = laneLine('south', lane),
    east = laneLine('east', lane),
    west = laneLine('west', lane);
  const pieces = roundedPath(
    [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ],
    STREET_CORNER_RADIUS,
    true,
  );
  return { pieces, length: pathLength(pieces) };
});
const holding = circuits.map(({ pieces, length }, i) => {
  const [tx, tz] = i ? [laneLine('west', 1), -20] : [42, laneLine('south', 0)];
  let best = 0,
    distance = Infinity;
  for (let j = 0; j < 3000; j++) {
    const p = pathAt(pieces, (j / 3000) * length),
      d = (p.x - tx) ** 2 + (p.z - tz) ** 2;
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
  const direction = index ? -1 : 1,
    { pieces, length } = circuits[index];
  const phase = (((holding[index] + progress * direction) % 1) + 1) % 1;
  const p = pathAt(pieces, phase * length);
  return {
    position: new T.Vector3(p.x, -0.18, p.z),
    // Street cars' noses are local +z: heading is the travel direction.
    heading: p.dir + (direction < 0 ? Math.PI : 0),
    visible: true,
  };
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
