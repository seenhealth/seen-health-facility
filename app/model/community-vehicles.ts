import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Vec2 } from './schema';
import type { VehiclePose, VehicleRegistry } from './activity';
import { FLEET_LOT } from './alhambra-fleet';
import { deliveryStops } from './deliveries';
import { STREET_EXTENT } from './neighborhood';
import { FLEET_VAN_RAMP, FLEET_VAN_SEATS } from './photo-assets';
import {
  easeDistance,
  laneFlow,
  laneLine,
  type StreetSide,
} from './traffic-routes';
import {
  arcPoint,
  careSettingById,
  frontZ,
  lanePose,
  laneRadius,
  streetZ,
  STREET_Y,
  toWorld,
  worldDir,
  type CareSetting,
} from './community-settings';

/**
 * Community vehicles: pure, deterministic samplers on the 720 s care-day
 * clock plus simple presentation bodies. Same conventions as the fleet: the
 * nose is local -z, so `heading = atan2(dx, dz) + π` drives nose first; every
 * path is a centripetal Catmull-Rom through straight lane runs, radius ≥ 6.4 m
 * corner arcs and the settings' horseshoe drives, so nothing hairpins or
 * reverses. Times are loop seconds (1 s = 40 clock seconds, 8 AM = 0).
 */
export type CommunityVehicleKind = 'car' | 'van' | 'ambulance';
type Dwell = {
  kind: 'dwell';
  from: number;
  to: number;
  at: Vec2;
  dir: Vec2;
  phase: string;
  /** Sliding-door and ramp open windows while stopped. */
  door?: [number, number][];
  ramp?: [number, number][];
};
type Drive = {
  kind: 'drive';
  from: number;
  to: number;
  path: Vec2[];
  phase: string;
  /** False when the vehicle enters or leaves the map at speed. */
  easeIn?: boolean;
  easeOut?: boolean;
  /**
   * Phantom continuation points before the first and after the last path
   * point: the spline is built through them but only the interior span is
   * driven, so headings at stops are exact instead of end-extrapolated.
   */
  pre?: Vec2;
  post?: Vec2;
  /**
   * Entering or leaving the map: opacity ramps in over the leg's first
   * `FLEET_LOT.fade` metres or out over its last, beyond the Community
   * framing (the same fade as the fleet vans).
   */
  fade?: 'in' | 'out';
};
export type VehicleLeg = Dwell | Drive;
/** Roof dressing that says what a car is for (built by `VEHICLE_DECOR`). */
export type VehicleDecor = 'pharmacy-cross' | 'meal-cooler';
export type CommunityVehicle = {
  id: string;
  kind: CommunityVehicleKind;
  /** Display name: the trace, the follow bar and the registry label. */
  name: string;
  accent: string;
  /** Roof dressing for cars. */
  decor?: VehicleDecor;
  /** Livery letter of a Seen fleet-body van (after the center's own fleet). */
  variant?: string;
  /** Pose outside the legs (hidden when `visible` is false). */
  rest: { at: Vec2; dir: Vec2; visible: boolean; phase: string };
  legs: VehicleLeg[];
  /** Seats in the vehicle frame (x right, y up, z rear) for riders. */
  seats: Record<string, [number, number, number]>;
};

// --- Ring-street lanes (traffic-routes.ts) and turning helpers -------------
export type Lane = { x?: number; z?: number; dir: Vec2 };
/** A ring-street lane's centre-line and the direction traffic flows on it. */
const ringLane = (side: StreetSide, lane: 0 | 1): Lane =>
  side === 'north' || side === 'south'
    ? { z: laneLine(side, lane), dir: laneFlow(side, lane) }
    : { x: laneLine(side, lane), dir: laneFlow(side, lane) };
/** A ring street's inner (`in`, lane 0) and outer (`out`, lane 1) lanes. */
const ring = (side: StreetSide) => ({
  in: ringLane(side, 0),
  out: ringLane(side, 1),
});
/** Street-corner radius, shared with the fleet's street corners. */
const TURN_RADIUS = FLEET_LOT.streetRadius;
const add = (a: Vec2, b: Vec2, k = 1): Vec2 => [
  a[0] + b[0] * k,
  a[1] + b[1] * k,
];
/** Circular arc from `from` heading `fromDir` onto the perpendicular `toDir`. */
/** Spacing of path samples; even spacing keeps the centripetal spline circular. */
const SAMPLE = 0.8;
export function turnArc(
  from: Vec2,
  fromDir: Vec2,
  toDir: Vec2,
  radius = TURN_RADIUS,
  steps = Math.max(4, Math.round((radius * Math.PI) / 2 / SAMPLE)),
): Vec2[] {
  const centre = add(from, toDir, radius),
    pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((i / steps) * Math.PI) / 2;
    pts.push([
      centre[0] -
        toDir[0] * radius * Math.cos(a) +
        fromDir[0] * radius * Math.sin(a),
      centre[1] -
        toDir[1] * radius * Math.cos(a) +
        fromDir[1] * radius * Math.sin(a),
    ]);
  }
  return pts;
}
/** Where a stub leg (through `legPoint`, running along ±axis) meets a lane. */
const crossing = (legPoint: Vec2, lane: Lane): Vec2 =>
  lane.x !== undefined ? [lane.x, legPoint[1]] : [legPoint[0], lane.z!];
/** Leave a lane (travelling `lane.dir`) and turn onto a stub leg heading `inward`. */
export function turnInto(
  legPoint: Vec2,
  inward: Vec2,
  lane: Lane,
  radius = TURN_RADIUS,
) {
  const i = crossing(legPoint, lane);
  return turnArc(add(i, lane.dir, -radius), lane.dir, inward, radius);
}
/** Leave a stub leg (heading `outward`) and merge onto a lane's flow. */
export function turnOutOf(
  legPoint: Vec2,
  outward: Vec2,
  lane: Lane,
  radius = TURN_RADIUS,
) {
  const i = crossing(legPoint, lane);
  return turnArc(add(i, outward, -radius), outward, lane.dir, radius);
}
const unit = (d: Vec2): Vec2 => {
  const l = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / l, d[1] / l];
};
/** Points on a lane's arc from `fromDeg` to `toDeg` (~1.6 m apart), world coords. */
export function arcPath(
  s: CareSetting,
  lane: 0 | 1,
  fromDeg: number,
  toDeg: number,
): Vec2[] {
  const span = Math.abs(toDeg - fromDeg),
    n = Math.max(
      2,
      Math.round((((span * Math.PI) / 180) * laneRadius(s, lane)) / SAMPLE),
    ),
    pts: Vec2[] = [];
  for (let i = 0; i <= n; i++)
    pts.push(
      toWorld(s, arcPoint(s, lane, fromDeg + ((toDeg - fromDeg) * i) / n)),
    );
  return pts;
}
/** A stub leg point: entry (+r) or exit (-r) lane, at the street edge or the pad edge. */
export function legPoint(
  s: CareSetting,
  lane: 0 | 1,
  side: 'entry' | 'exit',
  where: 'street' | 'edge',
): Vec2 {
  const r = laneRadius(s, lane) * (side === 'entry' ? 1 : -1);
  return toWorld(s, [r, where === 'street' ? streetZ(s) : frontZ(s)]);
}
const inwardOf = (s: CareSetting) => worldDir(s, [0, -1]);
const outwardOf = (s: CareSetting) => worldDir(s, [0, 1]);
/** Street lane → stub → arc down to `stopDeg`. */
function arrive(
  s: CareSetting,
  lane: 0 | 1,
  from: Lane,
  stopDeg: number,
  radius?: number,
): Vec2[] {
  const turn = turnInto(
    legPoint(s, lane, 'entry', 'street'),
    inwardOf(s),
    from,
    radius,
  );
  return [
    ...turn,
    ...straight(turn.at(-1)!, legPoint(s, lane, 'entry', 'edge')).slice(1),
    ...arcPath(s, lane, 90, stopDeg),
  ];
}
/** Arc from `startDeg` → exit stub → merge onto the street lane. */
function depart(
  s: CareSetting,
  lane: 0 | 1,
  startDeg: number,
  to: Lane,
  radius?: number,
): Vec2[] {
  const turn = turnOutOf(
    legPoint(s, lane, 'exit', 'street'),
    outwardOf(s),
    to,
    radius,
  );
  return [
    ...arcPath(s, lane, startDeg, -90),
    ...straight(legPoint(s, lane, 'exit', 'edge'), turn[0]).slice(0, -1),
    ...turn,
  ];
}
/**
 * Like `depart` from the outer lane, but pulling round onto the inner lane's
 * exit leg: the outer arc to `fromDeg`, then a cubic curve tangent to it that
 * joins the inner exit leg at local z `joinZ`, then the inner leg to the
 * street. For when the outer exit leg is occupied (the home's stall sits on
 * it); the curve keeps a ≥ 5 m turn radius and passes the van at the inner
 * apex and a car in the stall (z 9–13) with ≥ 0.5 m to spare.
 */
function departInner(
  s: CareSetting,
  startDeg: number,
  fromDeg: number,
  joinZ: number,
  to: Lane,
): Vec2[] {
  const r1 = laneRadius(s, 1),
    r0 = laneRadius(s, 0),
    cz = frontZ(s) - s.drive.depth,
    a = (fromDeg * Math.PI) / 180,
    p0: Vec2 = [r1 * Math.sin(a), cz - r1 * Math.cos(a)],
    p1: Vec2 = [p0[0] - Math.cos(a) * 7, p0[1] - Math.sin(a) * 7],
    p3: Vec2 = [-r0, joinZ],
    p2: Vec2 = [p3[0], p3[1] - 1.5];
  const at = (t: number): Vec2 => {
    const u = 1 - t,
      k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [0, 1].map(
      (i) => k[0] * p0[i] + k[1] * p1[i] + k[2] * p2[i] + k[3] * p3[i],
    ) as Vec2;
  };
  // Resample evenly (SAMPLE apart) so the spline through it stays smooth.
  const dense = Array.from({ length: 401 }, (_, i) => at(i / 400)),
    curve: Vec2[] = [];
  let run = 0;
  for (let i = 1; i < dense.length; i++) {
    run += Math.hypot(
      dense[i][0] - dense[i - 1][0],
      dense[i][1] - dense[i - 1][1],
    );
    if (run >= SAMPLE || i === dense.length - 1) {
      curve.push(toWorld(s, dense[i]));
      run = 0;
    }
  }
  const turn = turnOutOf(legPoint(s, 0, 'exit', 'street'), outwardOf(s), to);
  return [
    ...arcPath(s, 1, startDeg, fromDeg),
    ...curve,
    ...straight(curve.at(-1)!, turn[0]).slice(1, -1),
    ...turn,
  ];
}
/** Apex stop of a lane as a dwell pose. */
function stop(s: CareSetting, lane: 0 | 1, deg = 0) {
  const p = lanePose(s, lane, deg);
  return { at: p.position, dir: p.direction };
}
const dwell = (
  from: number,
  to: number,
  pose: { at: Vec2; dir: Vec2 },
  phase: string,
  extra: Partial<Pick<Dwell, 'door' | 'ramp'>> = {},
): Dwell => ({ kind: 'dwell', from, to, ...pose, phase, ...extra });
const drive = (
  from: number,
  to: number,
  path: Vec2[],
  phase: string,
  extra: Partial<
    Pick<Drive, 'easeIn' | 'easeOut' | 'pre' | 'post' | 'fade'>
  > = {},
): Drive => ({ kind: 'drive', from, to, path: dedupe(path), phase, ...extra });
/** A point `delta` degrees further along a lane's arc from a stop: the phantom beyond it. */
const beyond = (
  s: CareSetting,
  lane: 0 | 1,
  deg: number,
  delta: number,
): Vec2 => toWorld(s, arcPoint(s, lane, deg + delta));
/** A point `m` metres past a straight dwell pose (along +dir) or before it (-m). */
const past = (pose: { at: Vec2; dir: Vec2 }, m: number): Vec2 =>
  add(pose.at, unit(pose.dir), m);
function dedupe(path: Vec2[]) {
  const out: Vec2[] = [];
  for (const p of path)
    if (
      !out.length ||
      Math.hypot(p[0] - out.at(-1)![0], p[1] - out.at(-1)![1]) > 0.05
    )
      out.push(p);
  return out;
}
/** A straight run subdivided every ~1.6 m so the spline stays evenly parametrised. */
const straight = (a: Vec2, b: Vec2): Vec2[] => {
  const n = Math.max(
      1,
      Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE),
    ),
    pts: Vec2[] = [];
  for (let i = 0; i <= n; i++)
    pts.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return pts;
};
/** Run along a west/east street lane between two z, or a north/south lane between two x. */
const zRun = (lane: Lane, fromZ: number, toZ: number) =>
  straight([lane.x!, fromZ], [lane.x!, toZ]);
const xRun = (lane: Lane, fromX: number, toX: number) =>
  straight([fromX, lane.z!], [toX, lane.z!]);
/** Ring corners as radius-6.4 arcs between a lane and the next. */
const corner = (from: Lane, to: Lane): Vec2[] => {
  const i: Vec2 = [from.x ?? to.x!, from.z ?? to.z!];
  return turnArc(add(i, from.dir, -TURN_RADIUS), from.dir, to.dir);
};

// --- Itineraries ------------------------------------------------------------
const home = careSettingById('home-wong')!,
  pharmacy = careSettingById('pharmacy')!,
  hospital = careSettingById('hospital')!,
  specialist = careSettingById('specialist')!;
const W = ring('west'),
  E = ring('east'),
  N = ring('north'),
  S = ring('south'),
  R = TURN_RADIUS;
/**
 * Where vehicles enter and leave the map: just short of the ends of the drawn
 * streets (`STREET_EXTENT`), beyond every pad and the Community framing.
 * Vehicles fade in or out over the last `FLEET_LOT.fade` metres before them.
 */
const OFF_MAP = {
  east: STREET_EXTENT.x - 6,
  west: 6 - STREET_EXTENT.x,
  north: STREET_EXTENT.z - 5,
  south: 5 - STREET_EXTENT.z,
};
/** Entry/exit leg z (or x) of a setting's lane plus the clearance a turn needs. */
const legAt = (s: CareSetting, lane: 0 | 1, side: 'entry' | 'exit') =>
  legPoint(s, lane, side, 'street');
/** Rear receiving: the door the package truck delivers to. */
const receiving = deliveryStops.find((d) => d.kind === 'package')!.door;
/**
 * The Seen center's rear kerb: the meals car's home and the courier's stop by
 * receiving, in the 2.4 m strip between the south street slab (z ≤ -28.8)
 * and the raised sidewalk (z ≥ -26.4), so a 1.76 m car clears both.
 */
export const CENTER_LOT = {
  meals: { at: [-4, -27.7] as Vec2, dir: [1, 0] as Vec2 },
  courier: { at: [-16, -27.7] as Vec2, dir: [1, 0] as Vec2 },
  /**
   * On foot from the courier's door (street side) round the car's nose,
   * across the sidewalk and the yard to rear receiving.
   */
  receivingWalk: [
    [-13.2, -29.0],
    [-13.0, -25.6],
    [-2, -24.0],
    [2.4, -16],
  ] as Vec2[],
  /** Where a courier stands to hand packs in, and the door it faces. */
  receivingDoor: [receiving[0], receiving[1] - 0.83] as Vec2,
  receivingFace: [receiving[0], receiving[1]] as Vec2,
};
/** west.in → north.in → east.in, from a z on the west street to a z on the east street. */
const viaNorthEastbound = (fromZ: number, toZ: number): Vec2[] => [
  ...zRun(W.in, fromZ, N.in.z! - R),
  ...corner(W.in, N.in),
  ...xRun(N.in, W.in.x! + R, E.in.x! - R),
  ...corner(N.in, E.in),
  ...zRun(E.in, N.in.z! - R, toZ),
];
/** east.out → north.out → west.out. */
const viaNorthWestbound = (fromZ: number, toZ: number): Vec2[] => [
  ...zRun(E.out, fromZ, N.out.z! - R),
  ...corner(E.out, N.out),
  ...xRun(N.out, E.out.x! - R, W.out.x! + R),
  ...corner(N.out, W.out),
  ...zRun(W.out, N.out.z! - R, toZ),
];
/** south.out → east.out → north.out → west.out (the courier and meals loop). */
const viaEastNorthWestbound = (fromX: number, toZ: number): Vec2[] => [
  ...xRun(S.out, fromX, E.out.x! - R),
  ...corner(S.out, E.out),
  ...viaNorthWestbound(S.out.z! + R, toZ),
];
/** Mrs. Lin's home, south of the pharmacy (its van is the last itinerary). */
const homeLin = careSettingById('home-lin')!;
const homeStall = { at: home.anchors.stall, dir: worldDir(home, [0, 1]) };
const homeExitTurn = turnOutOf(
  legPoint(home, 1, 'exit', 'street'),
  outwardOf(home),
  W.in,
);
// --- Mrs. Lin's Seen van ------------------------------------------------------
/**
 * In from the south end of the west street on its inner lane and round Mrs.
 * Lin's drive to the inner apex by the porch; out by the exit leg and south
 * on the outer lane, off the map. The west street's southern reach carries
 * only the fleet's off-site runs, so the van keeps to their gaps: in ahead of
 * Van A's first arrival (on that reach from 15.8 s) and across the outer lane
 * into her drive before Van B, out of the lot's exit, comes south past it
 * (16.7 s). In the afternoon it comes back on only once Van A has left the
 * map with the center's Mrs. Lin (faded out by 624 s), so she is never on
 * screen in both vans: 7 s for the 69 m in (the morning's 11.5 s), at most
 * 11.3 m/s (the fleet vans reach 9.6 m/s on this street), and at the apex
 * by 631 s, before Van B comes back on (635.8 s).
 */
const linIn: Vec2[] = [
    ...zRun(W.in, OFF_MAP.south, legAt(homeLin, 0, 'entry')[1] - R - 2),
    ...arrive(homeLin, 0, W.in, 0),
  ],
  linOut: Vec2[] = [
    ...depart(homeLin, 0, 0, W.out),
    ...zRun(W.out, legAt(homeLin, 0, 'exit')[1] - R - 2, OFF_MAP.south),
  ];
const linVan: CommunityVehicle = {
  id: 'van-lin',
  kind: 'van',
  name: 'Seen van · door to door',
  accent: '#174a49',
  variant: 'J',
  rest: {
    at: [W.in.x!, OFF_MAP.south],
    dir: [0, 1],
    visible: false,
    phase: 'Off site',
  },
  // Mrs. Lin on the aisle seat of the first bench, the shortest step from
  // the ramp with her cane.
  seats: {
    driver: FLEET_VAN_SEATS.driver,
    participant: FLEET_VAN_SEATS.benches[1],
  },
  legs: [
    drive(11, 22.5, linIn, 'Arriving for Mrs. Lin', {
      easeIn: false,
      fade: 'in',
      post: beyond(homeLin, 0, 0, -10),
    }),
    // Her daughter walks her out; the driver sees her up the ramp (on board
    // 43.7 s) and steps through to his seat before it folds.
    dwell(22.5, 50, stop(homeLin, 0), 'Picking up Mrs. Lin', {
      door: [[24.5, 47.7]],
      ramp: [[26.5, 47.2]],
    }),
    drive(50, 62, linOut, 'Taking Mrs. Lin to the center', {
      easeOut: false,
      fade: 'out',
      pre: beyond(homeLin, 0, 0, 10),
    }),
    drive(624, 631, linIn, 'Bringing Mrs. Lin home', {
      easeIn: false,
      fade: 'in',
      post: beyond(homeLin, 0, 0, -10),
    }),
    // She is down the ramp by 639.5 s; the van waits, shut, while the driver
    // walks her to the porch ramp and comes back.
    dwell(631, 667.5, stop(homeLin, 0), 'Dropping Mrs. Lin off', {
      door: [[632, 644]],
      ramp: [[634, 643]],
    }),
    drive(667.5, 679.5, linOut, 'Off to the next ride', {
      easeOut: false,
      fade: 'out',
      pre: beyond(homeLin, 0, 0, 10),
    }),
  ],
};
export const communityVehicles: CommunityVehicle[] = [
  {
    id: 'van-community',
    kind: 'van',
    name: 'Seen van · community runs',
    accent: '#174a49',
    variant: 'I',
    rest: { ...stop(home, 0), visible: true, phase: 'Waiting at the home' },
    // The fleet body's own furniture: Mrs. Wong on the aisle seat of the first
    // bench (the shortest step from the ramp with her walker), her escort
    // beside her at the window, Mr. Wong's chair on the wheelchair plate.
    seats: {
      driver: FLEET_VAN_SEATS.driver,
      participant: FLEET_VAN_SEATS.benches[1],
      escort: FLEET_VAN_SEATS.benches[0],
      wheelchair: FLEET_VAN_SEATS.wheelchair,
    },
    legs: [
      dwell(0, 113, stop(home, 0), 'Boarding at the porch', {
        door: [[75, 110.5]],
        ramp: [[77, 110]],
      }),
      drive(
        113,
        172.5,
        [
          // Round by the north and east streets: the south street's
          // eastbound lane carries the street traffic at this hour.
          ...depart(home, 0, 0, W.in),
          ...viaNorthEastbound(legAt(home, 0, 'exit')[1] + R + 2, S.out.z! + R),
          ...corner(E.in, S.out),
          ...xRun(S.out, E.in.x! + R, legAt(specialist, 0, 'entry')[0] - R - 2),
          ...arrive(specialist, 0, S.out, 0),
        ],
        'Driving to the specialist',
        { pre: beyond(home, 0, 0, 10), post: beyond(specialist, 0, 0, -10) },
      ),
      dwell(172.5, 274, stop(specialist, 0), 'Waiting at the clinic', {
        door: [
          [175, 190],
          [248, 261.5],
        ],
        ramp: [
          [177, 189],
          [250, 261],
        ],
      }),
      drive(
        274,
        330,
        [
          // Leaves at 274 so it passes the rear lot after the package truck
          // has turned in and before the courier pulls out (312).
          ...depart(specialist, 0, 0, S.in),
          ...xRun(S.in, legAt(specialist, 0, 'exit')[0] - R - 2, W.in.x! + R),
          ...corner(S.in, W.in),
          ...zRun(W.in, S.in.z! + R, legAt(home, 0, 'entry')[1] - R - 2),
          ...arrive(home, 0, W.in, 0),
        ],
        'Bringing Mrs. Wong home',
        { pre: beyond(specialist, 0, 0, 10), post: beyond(home, 0, 0, -10) },
      ),
      dwell(330, 480, stop(home, 0), 'Waiting at the home', {
        door: [[332, 352]],
        ramp: [[334, 351]],
      }),
      drive(
        480,
        540,
        [
          ...depart(home, 0, 0, W.in),
          ...zRun(W.in, legAt(home, 0, 'exit')[1] + R + 2, N.in.z! - R),
          ...corner(W.in, N.in),
          ...xRun(N.in, W.in.x! + R, legAt(hospital, 0, 'entry')[0] - R - 2),
          ...arrive(hospital, 0, N.in, 0),
        ],
        'Driving to the hospital for a discharge',
        { pre: beyond(home, 0, 0, 10), post: beyond(hospital, 0, 0, -10) },
      ),
      dwell(540, 575, stop(hospital, 0), 'Discharge pickup under the canopy', {
        door: [[543, 572]],
        ramp: [[545, 571.5]],
      }),
      drive(
        575,
        642,
        [
          ...depart(hospital, 0, 0, N.out),
          ...xRun(N.out, legAt(hospital, 0, 'exit')[0] - R - 2, W.out.x! + R),
          ...corner(N.out, W.out),
          ...zRun(W.out, N.out.z! - R, legAt(home, 0, 'entry')[1] + R + 2),
          ...arrive(home, 0, W.out, 0),
        ],
        'Bringing Mr. Wong home from hospital',
        { pre: beyond(hospital, 0, 0, 10), post: beyond(home, 0, 0, -10) },
      ),
      dwell(642, 720, stop(home, 0), 'Waiting at the home', {
        door: [[644, 666]],
        ramp: [[646, 665]],
      }),
    ],
  },
  {
    id: 'courier-car',
    kind: 'car',
    name: 'Pharmacy courier',
    accent: '#e4e7df',
    decor: 'pharmacy-cross',
    rest: { ...stop(pharmacy, 0), visible: true, phase: 'At the pharmacy' },
    seats: { driver: [-0.42, 0.3, -0.2] },
    legs: [
      dwell(0, 92, stop(pharmacy, 0), 'Loading pill packs'),
      drive(
        92,
        130,
        [
          ...depart(pharmacy, 0, 0, W.in),
          ...zRun(
            W.in,
            legAt(pharmacy, 0, 'exit')[1] + R + 2,
            legAt(home, 0, 'entry')[1] - R - 2,
          ),
          ...arrive(home, 0, W.in, 0),
        ],
        'Delivering pill packs to the home',
        { pre: beyond(pharmacy, 0, 0, 10), post: beyond(home, 0, 0, -10) },
      ),
      dwell(130, 150, stop(home, 0), 'Pill-pack drop'),
      drive(
        150,
        186,
        [
          ...depart(home, 0, 0, W.out),
          ...zRun(W.out, legAt(home, 0, 'exit')[1] - R - 2, S.out.z! + R),
          ...corner(W.out, S.out),
          ...xRun(S.out, W.out.x! + R, -36),
          [-32, -33.2],
          [-26, -31.0],
          [-21, -28.5],
          [-18.5, -27.8],
          CENTER_LOT.courier.at,
        ],
        'Driving to the center',
        { pre: beyond(home, 0, 0, 10), post: past(CENTER_LOT.courier, 2) },
      ),
      // Pulls out at 312, once the Seen van has passed on its way home.
      dwell(186, 312, CENTER_LOT.courier, 'Pill packs to rear receiving'),
      drive(
        312,
        420,
        [
          CENTER_LOT.courier.at,
          [-13, -27.7],
          [-9, -28.7],
          [-4, -31.2],
          [1, -32.9],
          [6, -33.9],
          ...viaEastNorthWestbound(10, legAt(pharmacy, 0, 'entry')[1] + R + 2),
          ...arrive(pharmacy, 0, W.out, 0),
        ],
        'Returning to the pharmacy',
        {
          pre: past(CENTER_LOT.courier, -2),
          post: beyond(pharmacy, 0, 0, -10),
        },
      ),
      dwell(420, 720, stop(pharmacy, 0), 'At the pharmacy'),
    ],
  },
  {
    id: 'home-care-car',
    kind: 'car',
    name: 'Personal care aide · car',
    accent: '#b9c4b0',
    rest: {
      at: [OFF_MAP.west, N.in.z!],
      dir: [1, 0],
      visible: false,
      phase: 'Off duty',
    },
    seats: { driver: [-0.42, 0.3, -0.2] },
    // In and out by the north street's western reach, clear of the fleet's
    // west-street runs and beyond the Community framing.
    legs: [
      drive(
        0,
        28,
        [
          ...xRun(N.in, OFF_MAP.west, W.out.x! - R),
          ...corner(N.in, W.out),
          ...zRun(W.out, N.in.z! - R, legAt(home, 1, 'entry')[1] + R + 2),
          ...arrive(home, 1, W.out, -90),
          ...straight(
            toWorld(home, [
              -laneRadius(home, 1),
              frontZ(home) - home.drive.depth,
            ]),
            homeStall.at,
          ).slice(1),
        ],
        'Arriving for the morning visit',
        { easeIn: false, fade: 'in', post: past(homeStall, 2) },
      ),
      // The aide's visit runs to 1:12 PM: the post-clinic toileting, shower,
      // dressing and lunch set-up happen indoors before she leaves.
      dwell(28, 469, homeStall, 'Parked in the stall'),
      drive(
        469,
        491,
        [
          ...straight(homeStall.at, homeExitTurn[0]).slice(0, -1),
          ...homeExitTurn,
          ...zRun(W.in, legAt(home, 1, 'exit')[1] + R + 2, N.out.z! - R),
          ...corner(W.in, N.out),
          ...xRun(N.out, W.in.x! - R, OFF_MAP.west),
        ],
        'Leaving for the next client',
        { easeOut: false, fade: 'out', pre: past(homeStall, -2) },
      ),
    ],
  },
  {
    id: 'meals-car',
    kind: 'car',
    name: 'Home-delivered meals',
    accent: '#eef0ea',
    decor: 'meal-cooler',
    rest: {
      ...CENTER_LOT.meals,
      visible: true,
      phase: 'At the center kitchen',
    },
    seats: { driver: [-0.42, 0.3, -0.2] },
    legs: [
      dwell(0, 232, CENTER_LOT.meals, 'Loading meal bags at the kitchen'),
      drive(
        232,
        367.5,
        [
          CENTER_LOT.meals.at,
          [-1, -27.7],
          [3, -28.4],
          [8, -30.6],
          [13, -32.7],
          [18, -33.9],
          ...viaEastNorthWestbound(22, legAt(home, 1, 'entry')[1] + R + 2),
          ...arrive(home, 1, W.out, 0),
        ],
        'Delivering meals to the home',
        { pre: past(CENTER_LOT.meals, -2), post: beyond(home, 1, 0, -10) },
      ),
      // Held after the drop so the car turns onto the south street behind
      // the fleet's afternoon runs at the west corner and crosses into the lot
      // after van F's pull-out.
      dwell(367.5, 421, stop(home, 1), 'Meal bag drop'),
      drive(
        421,
        451,
        [
          // The aide's car is parked in the stall on the outer exit leg until
          // 469 s, so the meals car pulls round onto the inner lane's exit.
          ...departInner(home, 0, -32.5, 10.5, W.out),
          ...zRun(W.out, legAt(home, 0, 'exit')[1] - R - 2, S.out.z! + R),
          ...corner(W.out, S.out),
          ...xRun(S.out, W.out.x! + R, -30),
          [-25, -33.2],
          [-19, -31.0],
          [-13, -28.6],
          [-9, -27.8],
          [-6, -27.7],
          CENTER_LOT.meals.at,
        ],
        'Back to the center',
        { pre: beyond(home, 1, 0, 10), post: past(CENTER_LOT.meals, 2) },
      ),
      dwell(451, 720, CENTER_LOT.meals, 'At the center kitchen'),
    ],
  },
  {
    id: 'ambulance',
    kind: 'ambulance',
    name: 'Ambulance',
    accent: '#c25b52',
    rest: {
      at: [OFF_MAP.east, N.out.z!],
      dir: [-1, 0],
      visible: false,
      phase: 'Off site',
    },
    // The crew in the cab (the nose is at local −z).
    seats: { driver: [-0.45, 0.55, -1.55], attendant: [0.45, 0.55, -1.55] },
    legs: [
      drive(
        58,
        75,
        [
          ...xRun(N.out, OFF_MAP.east, legAt(hospital, 0, 'entry')[0] + R + 2),
          ...arrive(hospital, 0, N.out, 45),
        ],
        'Arriving at the emergency department',
        { easeIn: false, fade: 'in', post: beyond(hospital, 0, 45, -10) },
      ),
      dwell(75, 98, stop(hospital, 0, 45), 'At the ED bay'),
      drive(
        98,
        111,
        [
          ...depart(hospital, 0, 45, N.in, 9.7),
          ...xRun(N.in, legAt(hospital, 0, 'exit')[0] + 9.7 + 2, OFF_MAP.east),
        ],
        'Leaving the hospital',
        { easeOut: false, fade: 'out', pre: beyond(hospital, 0, 45, 10) },
      ),
    ],
  },
  linVan,
];
export const communityVehicleById = (id: string) =>
  communityVehicles.find((v) => v.id === id);

// --- Sampling ---------------------------------------------------------------
type Spline = {
  curve: T.CatmullRomCurve3;
  u0: number;
  u1: number;
  /** Arc length of the whole spline (phantom spans included). */
  length: number;
};
const curves = new WeakMap<Drive, Spline>();
function curveOf(leg: Drive): Spline {
  let c = curves.get(leg);
  if (!c) {
    const pts = [
      ...(leg.pre ? [leg.pre] : []),
      ...leg.path,
      ...(leg.post ? [leg.post] : []),
    ];
    const curve = new T.CatmullRomCurve3(
      pts.map((p) => new T.Vector3(p[0], STREET_Y, p[1])),
      false,
      'centripetal',
    );
    // A multiple of the segment count puts every control point exactly on a
    // table sample, so the driven span starts and ends on the stop points.
    const per = Math.max(16, Math.ceil(600 / (pts.length - 1)));
    curve.arcLengthDivisions = (pts.length - 1) * per;
    const lengths = curve.getLengths(curve.arcLengthDivisions),
      total = lengths.at(-1)!,
      at = (k: number) => lengths[k * per] / total;
    c = {
      curve,
      u0: leg.pre ? at(1) : 0,
      u1: leg.post ? at(pts.length - 2) : 1,
      length: total,
    };
    curves.set(leg, c);
  }
  return c;
}
/** Share of a leg's time spent speeding up (or slowing down) at an eased end. */
const EASE = 0.22;
const headingOf = (d: Vec2) => Math.atan2(d[0], d[1]) + Math.PI;
const rise = (t: number, a: number, b: number) =>
  T.MathUtils.smoothstep(t, a, b);
/** Doors slide open over the 2 s before `open` and shut over the 2 s after `close`. */
const doorValue = (t: number, windows: [number, number][] = []) =>
  Math.max(
    0,
    ...windows.map(([a, b]) => rise(t, a - 2, a) * (1 - rise(t, b, b + 2))),
  );
/** The ramp unfolds after the door and folds away before it closes. */
const rampValue = (t: number, windows: [number, number][] = []) =>
  Math.max(
    0,
    ...windows.map(
      ([a, b]) => rise(t, a - 1, a + 2) * (1 - rise(t, b - 2, b + 1)),
    ),
  );
function dwellPose(leg: Dwell, t: number): VehiclePose {
  const door = doorValue(t, leg.door),
    ramp = rampValue(t, leg.ramp);
  return {
    position: new T.Vector3(leg.at[0], STREET_Y, leg.at[1]),
    heading: headingOf(unit(leg.dir)),
    visible: true,
    phase: leg.phase,
    door,
    ramp,
  };
}
export function sampleCommunityVehicle(id: string, time: number): VehiclePose {
  const v = communityVehicleById(id);
  if (!v) throw new Error(`Unknown community vehicle ${id}`);
  const t = ((time % 720) + 720) % 720;
  const leg = v.legs.find((l) => t >= l.from && t < l.to);
  if (!leg)
    return {
      position: new T.Vector3(v.rest.at[0], STREET_Y, v.rest.at[1]),
      heading: headingOf(unit(v.rest.dir)),
      visible: v.rest.visible,
      phase: v.rest.phase,
      door: 0,
      ramp: 0,
    };
  if (leg.kind === 'dwell') return dwellPose(leg, t);
  const { curve, u0, u1, length } = curveOf(leg),
    u =
      u0 +
      (u1 - u0) *
        easeDistance(
          (t - leg.from) / (leg.to - leg.from),
          1,
          leg.easeIn === false ? 0 : EASE,
          leg.easeOut === false ? 0 : EASE,
        ),
    position = curve.getPointAt(u),
    d = curve.getTangentAt(u),
    // Metres from the map edge for a leg that enters or leaves the map.
    edge =
      leg.fade === 'in'
        ? (u - u0) * length
        : leg.fade === 'out'
          ? (u1 - u) * length
          : Infinity,
    opacity = T.MathUtils.clamp(edge / FLEET_LOT.fade, 0, 1);
  return {
    position,
    heading: Math.atan2(d.x, d.z) + Math.PI,
    visible: opacity > 0,
    opacity,
    phase: leg.phase,
    door: 0,
    ramp: 0,
  };
}
/**
 * Register every community vehicle's sampler under its id and display name
 * (the viewer's engine registry, or `alhambraVehicles()` for Node).
 */
export function registerCommunityVehicles(
  registry: Pick<VehicleRegistry, 'register'>,
) {
  for (const v of communityVehicles)
    registry.register(v.id, (t) => sampleCommunityVehicle(v.id, t), {
      label: v.name,
    });
}
/** Where a car's driver steps out: beside the driver door (local x −1.05). */
export function carDoorWorld(pose: VehiclePose): Vec2 {
  const c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading),
    [x, z] = [-1.05, 0.2];
  return [pose.position.x + x * c + z * sn, pose.position.z - x * sn + z * c];
}
/** Door sill and ramp foot of a fleet van in a pose (`FLEET_VAN_RAMP`, right side). */
export function vanRampWorld(pose: VehiclePose) {
  const c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading),
    at = ([x, z]: [number, number]): Vec2 => [
      pose.position.x + x * c + z * sn,
      pose.position.z - x * sn + z * c,
    ];
  return { sill: at(FLEET_VAN_RAMP.sill), foot: at(FLEET_VAN_RAMP.foot) };
}

// --- Bodies -----------------------------------------------------------------
const BODY = {
  glass: '#56605f',
  tyre: '#3d4040',
  lamp: '#f7f4ea',
  cross: '#4f9a63',
  red: '#c25b52',
  white: '#f2f1ec',
  tail: '#b7645a',
};
/** Presentation bodies; nose at local -z, origin at street level. */
export function buildCommunityVehicleBody(
  kind: CommunityVehicleKind,
  accent: string,
) {
  const g = new T.Group();
  const cache = new Map<string, T.MeshStandardMaterial>();
  const mat = (color: string, roughness = 0.85) => {
    if (!cache.has(color))
      cache.set(color, new T.MeshStandardMaterial({ color, roughness }));
    return cache.get(color)!;
  };
  const put = (
    geo: T.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new T.Mesh(geo, mat(color, color === BODY.glass ? 0.3 : 0.85));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => put(new T.BoxGeometry(w, h, d), color, x, y + h / 2, z);
  const rounded = (
    w: number,
    h: number,
    d: number,
    r: number,
    color: string,
    y: number,
    z = 0,
  ) => put(new RoundedBoxGeometry(w, h, d, 3, r), color, 0, y + h / 2, z);
  const wheel = (x: number, z: number, r = 0.31) => {
    const w = put(new T.CylinderGeometry(r, r, 0.2, 18), BODY.tyre, x, r, z);
    w.rotation.z = Math.PI / 2;
  };
  if (kind === 'car') {
    rounded(1.76, 0.58, 3.94, 0.16, accent, 0.3);
    rounded(1.5, 0.52, 2.05, 0.14, BODY.glass, 0.84, 0.12);
    rounded(1.46, 0.08, 1.7, 0.04, accent, 1.33, 0.14);
    for (const sx of [-0.8, 0.8]) for (const sz of [-1.27, 1.27]) wheel(sx, sz);
    for (const sx of [-0.56, 0.56])
      box(sx, 0.62, -1.955, 0.32, 0.1, 0.03, BODY.lamp);
    box(0, 0.6, 1.955, 1.2, 0.08, 0.03, BODY.tail);
  } else if (kind === 'ambulance') {
    box(0, 0.38, 0.55, 2.1, 0.5, 5.2, accent);
    box(0, 0.86, 0.95, 2.14, 1.55, 3.9, BODY.white);
    box(0, 0.86, -1.6, 1.98, 1.1, 1.3, BODY.white);
    box(0, 1.3, -2.26, 1.7, 0.6, 0.04, BODY.glass);
    box(0, 1.45, 0.95, 2.16, 0.22, 3.92, BODY.red);
    box(0, 2.41, -0.85, 1.3, 0.14, 0.32, '#e0a35f');
    for (const side of [-1.08, 1.08]) {
      box(side, 1.62, 0.95, 0.03, 0.55, 0.55, BODY.red);
      box(side, 1.81, 0.95, 0.035, 0.16, 0.55, BODY.white);
      box(side, 1.62, 0.95, 0.035, 0.55, 0.16, BODY.white);
    }
    for (const sx of [-0.92, 0.92])
      for (const sz of [-1.5, 1.6]) wheel(sx, sz, 0.36);
    for (const sx of [-0.62, 0.62])
      box(sx, 0.7, -2.6, 0.3, 0.14, 0.04, BODY.lamp);
  }
  g.name = `community-${kind}`;
  return g;
}
/** A rooftop green cross for the pharmacy courier. */
function decorateCourier(car: T.Group) {
  const green = new T.MeshStandardMaterial({
      color: BODY.cross,
      roughness: 0.7,
    }),
    white = new T.MeshStandardMaterial({ color: BODY.white, roughness: 0.7 });
  const sign = new T.Mesh(new T.BoxGeometry(0.6, 0.34, 0.12), white);
  sign.position.set(0, 1.58, 0.1);
  sign.castShadow = true;
  car.add(sign);
  for (const [w, h] of [
    [0.3, 0.09],
    [0.09, 0.3],
  ]) {
    const bar = new T.Mesh(new T.BoxGeometry(w, h, 0.14), green);
    bar.position.set(0, 1.58, 0.1);
    car.add(bar);
  }
}
/** A cool box on the meals car roof in Seen teal. */
function decorateMeals(car: T.Group) {
  const cooler = new T.Mesh(
    new RoundedBoxGeometry(0.9, 0.36, 0.7, 2, 0.05),
    new T.MeshStandardMaterial({ color: '#25777c', roughness: 0.6 }),
  );
  cooler.position.set(0, 1.6, 0.35);
  cooler.castShadow = true;
  car.add(cooler);
}
/** Roof dressings by registry `decor` value. */
export const VEHICLE_DECOR: Record<VehicleDecor, (car: T.Group) => void> = {
  'pharmacy-cross': decorateCourier,
  'meal-cooler': decorateMeals,
};
