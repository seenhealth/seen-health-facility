import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Vec2 } from './schema';
import type { VehiclePose } from './activity';
import { deliveryStops } from './deliveries';
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
};
export type VehicleLeg = Dwell | Drive;
export type CommunityVehicle = {
  id: string;
  kind: CommunityVehicleKind;
  name: string;
  accent: string;
  /** Pose outside the legs (hidden when `visible` is false). */
  rest: { at: Vec2; dir: Vec2; visible: boolean; phase: string };
  legs: VehicleLeg[];
  /** Seats in the vehicle frame (x right, y up, z rear) for riders. */
  seats: Record<string, [number, number, number]>;
};

// --- Ring-street lanes (traffic-routes.ts circuits) and turning helpers -----
export type Lane = { x?: number; z?: number; dir: Vec2 };
/** Lane centre-lines and the direction traffic flows on each. */
export const RING: Record<
  'west' | 'east' | 'north' | 'south',
  { in: Lane; out: Lane }
> = {
  west: { in: { x: -43.8, dir: [0, 1] }, out: { x: -47.1, dir: [0, -1] } },
  east: { in: { x: 52.2, dir: [0, -1] }, out: { x: 55.5, dir: [0, 1] } },
  north: { in: { z: 39.4, dir: [1, 0] }, out: { z: 42.7, dir: [-1, 0] } },
  south: { in: { z: -30.7, dir: [-1, 0] }, out: { z: -34, dir: [1, 0] } },
};
export const TURN_RADIUS = 6.4;
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
  extra: Partial<Pick<Drive, 'easeIn' | 'easeOut' | 'pre' | 'post'>> = {},
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
const home = careSettingById('home-lin')!,
  pharmacy = careSettingById('pharmacy')!,
  hospital = careSettingById('hospital')!,
  specialist = careSettingById('specialist')!;
const W = RING.west,
  E = RING.east,
  N = RING.north,
  S = RING.south,
  R = TURN_RADIUS;
/** Entry/exit leg z (or x) of a setting's lane plus the clearance a turn needs. */
const legAt = (s: CareSetting, lane: 0 | 1, side: 'entry' | 'exit') =>
  legPoint(s, lane, side, 'street');
/** Rear receiving: the door the package truck delivers to. */
const receiving = deliveryStops.find((d) => d.kind === 'package')!.door;
/** The Seen center's rear lot: meals car home and the courier's stop by receiving. */
export const CENTER_LOT = {
  meals: { at: [-4, -26.8] as Vec2, dir: [1, 0] as Vec2 },
  courier: { at: [-16, -26.8] as Vec2, dir: [1, 0] as Vec2 },
  /** On foot from the lot edge across the yard to rear receiving. */
  receivingWalk: [
    [-14, -24.5],
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
const homeStall = { at: home.anchors.stall, dir: worldDir(home, [0, 1]) };
const homeExitTurn = turnOutOf(
  legPoint(home, 1, 'exit', 'street'),
  outwardOf(home),
  W.in,
);
export const communityVehicles: CommunityVehicle[] = [
  {
    id: 'van-community',
    kind: 'van',
    name: 'Seen van · community runs',
    accent: '#174a49',
    rest: { ...stop(home, 0), visible: true, phase: 'Waiting at the home' },
    seats: {
      driver: [-0.55, 0.58, -1.9],
      participant: [0.5, 0.58, 1.0],
      escort: [-0.35, 0.58, 0.8],
      wheelchair: [0.2, 0.58, 1.3],
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
          ...depart(home, 0, 0, W.in),
          ...zRun(W.in, legAt(home, 0, 'exit')[1] + R + 2, N.in.z! - R),
          ...corner(W.in, N.in),
          ...xRun(N.in, W.in.x! + R, legAt(specialist, 0, 'entry')[0] - R - 2),
          ...arrive(specialist, 0, N.in, 0),
        ],
        'Driving to the specialist',
        { pre: beyond(home, 0, 0, 10), post: beyond(specialist, 0, 0, -10) },
      ),
      dwell(172.5, 268, stop(specialist, 0), 'Waiting at the clinic', {
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
        268,
        330,
        [
          ...depart(specialist, 0, 0, N.out),
          ...xRun(N.out, legAt(specialist, 0, 'exit')[0] - R - 2, W.out.x! + R),
          ...corner(N.out, W.out),
          ...zRun(W.out, N.out.z! - R, legAt(home, 0, 'entry')[1] + R + 2),
          ...arrive(home, 0, W.out, 0),
        ],
        'Bringing Mrs. Lin home',
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
          ...viaNorthEastbound(
            legAt(home, 0, 'exit')[1] + R + 2,
            legAt(hospital, 0, 'entry')[1] + R + 2,
          ),
          ...arrive(hospital, 0, E.in, 0),
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
          ...depart(hospital, 0, 0, E.out),
          ...viaNorthWestbound(
            legAt(hospital, 0, 'exit')[1] + R + 2,
            legAt(home, 0, 'entry')[1] + R + 2,
          ),
          ...arrive(home, 0, W.out, 0),
        ],
        'Bringing Mr. Lin home from hospital',
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
          [-26, -30.6],
          [-21, -27.8],
          [-18.5, -26.9],
          CENTER_LOT.courier.at,
        ],
        'Driving to the center',
        { pre: beyond(home, 0, 0, 10), post: past(CENTER_LOT.courier, 2) },
      ),
      dwell(186, 300, CENTER_LOT.courier, 'Pill packs to rear receiving'),
      drive(
        300,
        420,
        [
          CENTER_LOT.courier.at,
          [-13, -26.8],
          [-9, -28.0],
          [-4, -30.8],
          [1, -32.8],
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
      at: [W.out.x!, 40],
      dir: [0, -1],
      visible: false,
      phase: 'Off duty',
    },
    seats: { driver: [-0.42, 0.3, -0.2] },
    legs: [
      drive(
        1,
        18,
        [
          ...zRun(W.out, 40, legAt(home, 1, 'entry')[1] + R + 2),
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
        { easeIn: false, post: past(homeStall, 2) },
      ),
      dwell(18, 394, homeStall, 'Parked in the stall'),
      drive(
        394,
        476,
        [
          ...straight(homeStall.at, homeExitTurn[0]).slice(0, -1),
          ...homeExitTurn,
          ...viaNorthEastbound(legAt(home, 1, 'exit')[1] + R + 2, -36),
        ],
        'Leaving for the next client',
        { easeOut: false, pre: past(homeStall, -2) },
      ),
    ],
  },
  {
    id: 'meals-car',
    kind: 'car',
    name: 'Home-delivered meals',
    accent: '#eef0ea',
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
          [-1, -26.8],
          [3, -27.7],
          [8, -30.2],
          [13, -32.6],
          [18, -33.9],
          ...viaEastNorthWestbound(22, legAt(home, 1, 'entry')[1] + R + 2),
          ...arrive(home, 1, W.out, 0),
        ],
        'Delivering meals to the home',
        { pre: past(CENTER_LOT.meals, -2), post: beyond(home, 1, 0, -10) },
      ),
      // Held four seconds longer than the drop needs so the car crosses the
      // westbound lane into the lot behind van F's afternoon pull-out.
      dwell(367.5, 412, stop(home, 1), 'Meal bag drop'),
      drive(
        412,
        442,
        [
          ...depart(home, 1, 0, W.out),
          ...zRun(W.out, legAt(home, 1, 'exit')[1] - R - 2, S.out.z! + R),
          ...corner(W.out, S.out),
          ...xRun(S.out, W.out.x! + R, -30),
          [-25, -33.2],
          [-19, -30.6],
          [-13, -27.9],
          [-9, -26.95],
          [-6, -26.8],
          CENTER_LOT.meals.at,
        ],
        'Back to the center',
        { pre: beyond(home, 1, 0, 10), post: past(CENTER_LOT.meals, 2) },
      ),
      dwell(442, 720, CENTER_LOT.meals, 'At the center kitchen'),
    ],
  },
  {
    id: 'ambulance',
    kind: 'ambulance',
    name: 'Ambulance',
    accent: '#c25b52',
    rest: {
      at: [E.out.x!, -36],
      dir: [0, 1],
      visible: false,
      phase: 'Off site',
    },
    seats: {},
    legs: [
      drive(
        58,
        75,
        [
          ...zRun(E.out, -36, legAt(hospital, 0, 'entry')[1] - R - 2),
          ...arrive(hospital, 0, E.out, 45),
        ],
        'Arriving at the emergency department',
        { easeIn: false, post: beyond(hospital, 0, 45, -10) },
      ),
      dwell(75, 98, stop(hospital, 0, 45), 'At the ED bay'),
      drive(
        98,
        111,
        [
          ...depart(hospital, 0, 45, E.in, 9.7),
          ...zRun(E.in, legAt(hospital, 0, 'exit')[1] - 9.7 - 2, -36),
        ],
        'Leaving the hospital',
        { easeOut: false, pre: beyond(hospital, 0, 45, 10) },
      ),
    ],
  },
];
export const communityVehicleById = (id: string) =>
  communityVehicles.find((v) => v.id === id);

// --- Sampling ---------------------------------------------------------------
type Spline = { curve: T.CatmullRomCurve3; u0: number; u1: number };
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
    };
    curves.set(leg, c);
  }
  return c;
}
/** Distance fraction for a time fraction: eased starts/stops, cruise between. */
export function driveProgress(u: number, easeIn = true, easeOut = true) {
  const r = 0.22,
    x = T.MathUtils.clamp(u, 0, 1),
    a = easeIn ? r : 0,
    b = easeOut ? r : 0,
    cruise = 1 - a / 2 - b / 2;
  let d: number;
  if (x < a) d = (x * x) / (2 * a);
  else if (x > 1 - b) d = cruise - (1 - x) ** 2 / (2 * b);
  else d = x - a / 2;
  return d / cruise;
}
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
  const { curve, u0, u1 } = curveOf(leg),
    u =
      u0 +
      (u1 - u0) *
        driveProgress(
          (t - leg.from) / (leg.to - leg.from),
          leg.easeIn,
          leg.easeOut,
        ),
    position = curve.getPointAt(u),
    d = curve.getTangentAt(u);
  return {
    position,
    heading: Math.atan2(d.x, d.z) + Math.PI,
    visible: true,
    phase: leg.phase,
    door: 0,
    ramp: 0,
  };
}
/** World position of a seat at a moment (for authoring boarding walks). */
export function seatWorld(id: string, seat: string, time: number) {
  const v = communityVehicleById(id)!,
    pose = sampleCommunityVehicle(id, time),
    [sx, sy, sz] = v.seats[seat],
    c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading);
  return {
    x: pose.position.x + sx * c + sz * sn,
    y: pose.position.y + sy,
    z: pose.position.z - sx * sn + sz * c,
  };
}
/** Where a car's driver steps out: beside the driver door (local x −1.05). */
export function carDoorWorld(pose: VehiclePose): Vec2 {
  const c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading),
    [x, z] = [-1.05, 0.2];
  return [pose.position.x + x * c + z * sn, pose.position.z - x * sn + z * c];
}
/** Door sill and ramp foot of a fleet van in a pose (ramp on the right side). */
export function vanRampWorld(pose: VehiclePose) {
  const c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading),
    at = (x: number, z: number): Vec2 => [
      pose.position.x + x * c + z * sn,
      pose.position.z - x * sn + z * c,
    ];
  return { sill: at(1.0, -0.19), foot: at(4.15, -0.19) };
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
export function decorateCourier(car: T.Group) {
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
export function decorateMeals(car: T.Group) {
  const cooler = new T.Mesh(
    new RoundedBoxGeometry(0.9, 0.36, 0.7, 2, 0.05),
    new T.MeshStandardMaterial({ color: '#25777c', roughness: 0.6 }),
  );
  cooler.position.set(0, 1.6, 0.35);
  cooler.castShadow = true;
  car.add(cooler);
}
