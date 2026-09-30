import * as T from 'three';
import type { Vec2 } from './schema';
/**
 * Where the fleet sleeps. Six bays line the west side of the lot, nose toward
 * the aisle; the two bays beside the driveway sit against the curb island at
 * the lot's south-east corner and cannot be backed into from the street, so
 * the two spare vans (G, H) park in the west-street parking lane instead.
 */
export const fleetParking = [
  ...[-19, -16.2, -13.4, -10.6, -7.8, -5].map((z) => ({
    x: -28.1,
    z,
    heading: -Math.PI / 2,
  })),
  ...[-11.5, -19].map((z) => ({ x: -38.7, z, heading: Math.PI })),
];
// Vans C and D bring mid-day arrivals. Unload windows end once the last rider
// has left the ramp and the driver has stowed it (see fleet-crew.ts), so the
// van can be under way at the start of its outbound window.
export const extraVanWindows = [
  {
    id: 'van-c',
    name: 'Van C',
    inbound: [278, 300],
    unload: [306, 349],
    outbound: [358, 386],
    returning: [-2, -2],
    boarding: [-2, -2],
    leaving: [-2, -2],
  },
  {
    id: 'van-d',
    name: 'Van D',
    inbound: [390, 414],
    unload: [420, 463],
    outbound: [472, 502],
    returning: [-2, -2],
    boarding: [-2, -2],
    leaving: [-2, -2],
  },
];
type Window = {
  inbound: number[];
  unload: number[];
  outbound: number[];
  returning: number[];
  boarding: number[];
  leaving: number[];
};
// Reserve the shared driveway for one maneuver at a time. Passenger service
// has priority so the door/ramp and escort timelines stay synchronized.
export type FleetReservation = {
  van: number;
  start: number;
  end: number;
  requested: number;
};
const reservationCache = new WeakMap<Window[], FleetReservation[]>();
export function fleetReservations(windows: Window[]) {
  let booked = reservationCache.get(windows);
  if (booked) return booked;
  booked = windows.flatMap((v, van) =>
    [v.inbound, v.outbound, v.returning, v.leaving]
      .filter(([start, end]) => start >= 0 && end > start)
      .map(([start, end]) => ({ van, start, end, requested: start })),
  );
  // Vans E and F each make a morning and an afternoon neighborhood run; the
  // spare vans at the curb have no reservations and stay parked.
  const requests = [
    [4, 30, 64],
    [5, 155, 64],
    [4, 295, 48],
    [5, 405, 48],
  ];
  for (const [van, requested, duration] of requests) {
    let start = requested;
    for (const occupied of [...booked].sort((a, b) => a.start - b.start)) {
      if (start < occupied.end + 4 && start + duration > occupied.start - 4)
        start = occupied.end + 4;
    }
    booked.push({ van, requested, start, end: start + duration });
  }
  booked.sort((a, b) => a.start - b.start);
  reservationCache.set(windows, booked);
  return booked;
}

// ---------------------------------------------------------------------------
// Route network. Every van movement is a sequence of named legs from this
// table; a trip concatenates legs into continuous drives, so adding a "home
// pad" or a second driveway is a data change here, not new sampling code.
// Waypoints are Catmull-Rom controls. Vans stay straight until their rear has
// cleared the row of bay noses (x ≈ −24.9) and are aligned again before it
// re-enters, which keeps the 0.5 m clearance to the neighbouring bays.
// ---------------------------------------------------------------------------
/** Lot geometry (metres, street level). Bays line the west side; the drop-off dock is at the north end. */
export const FLEET_LOT = {
  dock: [-20.5, 1.5] as Vec2,
  dockHeading: -Math.PI / 2,
  streetY: -0.23,
  /** Vans vanish once they have driven past the drawn end of the south street. */
  offSiteX: -52,
  lanes: { westbound: -30.7, eastbound: -34 },
  /** North–south aisle east of the bay noses: southbound lane, northbound lane and the west-side approach to the dock. */
  aisle: { south: -22.6, north: -21.7, dockApproach: -22.5 },
};
export type FleetLeg = { id: string; phase: string; points: Vec2[] };
const leg = (id: string, phase: string, points: Vec2[]): FleetLeg => ({
  id,
  phase,
  points,
});
const bayAt = (index: number) => fleetParking[index];
const { aisle, lanes, offSiteX, dock } = FLEET_LOT;
/** Southbound lane down the aisle, through the driveway and right onto the westbound street lane. */
const SOUTH_SPINE: Vec2[] = [
  [aisle.south, -2],
  [aisle.south, -21],
  [-22.75, -26.5],
  [-23.7, -29.2],
  [-27, lanes.westbound],
];
/** Eastbound street lane, left through the driveway (straight past the curb island), north up the aisle. */
const NORTH_SPINE: Vec2[] = [
  [-28, -33.6],
  [-25, -31.7],
  [-23.5, -28.8],
  [-22.85, -26.5],
  [-22.75, -23.5],
  [aisle.south, -21.95],
  [-22.1, -18.5],
  [aisle.north, -16],
  [aisle.north, -2],
];
/**
 * Backing in: the van passes its bay, swings its nose out to the right and
 * reverses along a 2 m-radius hook that is straight again at x = −20.5, well
 * before the rear reaches the bay noses. The standard swing is 45° from the
 * northbound lane. The southernmost bay is entered from the west lane with a
 * 60° swing instead: the empty bay south of it gives the rear room, and the
 * curb island leaves no room for the northbound lane that far south.
 */
type Swing = { angle: number; lane: number; entryRadius: number };
const SWINGS = {
  standard: { angle: Math.PI / 4, lane: aisle.north, entryRadius: 3 },
  southEnd: { angle: Math.PI / 3, lane: aisle.south, entryRadius: 3 },
} satisfies Record<string, Swing>;
const HOOK_RADIUS = 2,
  HOOK_END_X = -20.5;
const swingFor = (index: number): Swing =>
  index === 0 ? SWINGS.southEnd : SWINGS.standard;
const swingPoint = (index: number): Vec2 => {
  const { angle } = swingFor(index);
  return [
    HOOK_END_X + HOOK_RADIUS * Math.sin(angle),
    bayAt(index).z + HOOK_RADIUS * (1 - Math.cos(angle)),
  ];
};
/** Points of the pull-past: lane, entry arc, straight swing line, swing point. */
const pullPastPoints = (index: number): Vec2[] => {
  const { angle, lane, entryRadius: r } = swingFor(index),
    p1 = swingPoint(index),
    dir: Vec2 = [Math.sin(angle), Math.cos(angle)];
  // The arc turns from north to the swing angle; the swing line then runs straight to p1.
  const arcEnd: Vec2 = [lane + r * (1 - Math.cos(angle)), 0];
  const k = (p1[0] - arcEnd[0]) / dir[0];
  arcEnd[1] = p1[1] - dir[1] * k;
  const z0 = arcEnd[1] - r * Math.sin(angle);
  const half = angle / 2;
  return [
    [lane, z0],
    [lane + r * (1 - Math.cos(half)), z0 + r * Math.sin(half)],
    arcEnd,
    [p1[0] - dir[0] * (k / 2), p1[1] - dir[1] * (k / 2)],
    p1,
  ];
};
/** Straight pull-out, then a gentle bend once the rear is half a metre past the noses. */
const pullOut = (index: number, sign: 1 | -1): Vec2[] => {
  const b = bayAt(index);
  return [
    [b.x, b.z],
    [-24.5, b.z],
    [-22.2, b.z],
    [-21.2, b.z],
    [-20.6, b.z],
    [-20, b.z + sign * 0.4],
    [-19.7, b.z + sign * 1.6],
  ];
};
export const fleetLegs = {
  /** Nose-first out of the bay, then a long right-hand merge into the southbound lane. */
  bayOutSouth(index: number): FleetLeg {
    const b = bayAt(index);
    return leg('bay-out', 'Pulling out of assigned bay', [
      ...pullOut(index, -1),
      [-20.1, b.z - 3.6],
      [-20.9, b.z - 6.5],
      [-21.9, b.z - 10],
      [aisle.south, b.z - 13.5],
    ]);
  },
  /** Nose-first out of the bay, then left toward the drop-off. */
  bayOutNorth(index: number): FleetLeg {
    const b = bayAt(index);
    return leg('bay-out', 'Pulling out of assigned bay', [
      ...pullOut(index, 1),
      [-19.6, b.z + 3.4],
    ]);
  },
  /** Southbound lane from `fromZ` through the driveway onto the street. */
  aisleSouth(fromZ: number): FleetLeg {
    return leg(
      'aisle-south',
      'Driving to the street',
      SOUTH_SPINE.filter((p) => p[1] < fromZ),
    );
  },
  streetWest: leg('street-west', 'Westbound on the south street', [
    [-27, lanes.westbound],
    [-34, lanes.westbound],
    [-42, lanes.westbound],
    [offSiteX, lanes.westbound],
  ]),
  streetEast: leg('street-east', 'Returning eastbound', [
    [offSiteX, lanes.eastbound],
    [-42, lanes.eastbound],
    [-33, lanes.eastbound],
    [-28, -33.6],
  ]),
  /** Left turn through the driveway, then north up the aisle to the bay's swing. */
  drivewayNorth(index: number): FleetLeg {
    const limit = pullPastPoints(index)[0][1] - 0.5;
    return leg(
      'driveway-north',
      'Driving to assigned bay',
      NORTH_SPINE.filter((p) => p[1] < limit),
    );
  },
  /** Drive past the bay and swing the nose out, ready to back in. */
  pullPast(index: number): FleetLeg {
    return leg(
      'pull-past',
      'Pulling past assigned bay',
      pullPastPoints(index),
    );
  },
  /** Reverse from the swing point along the hook into the bay (the only backward leg). */
  backIn(index: number): FleetLeg {
    const b = bayAt(index),
      { angle } = swingFor(index),
      steps = Math.round(angle / (Math.PI / 12)),
      arc = Array.from({ length: steps }, (_, i): Vec2 => {
        const a = angle - ((i + 1) * angle) / steps;
        return [
          HOOK_END_X + HOOK_RADIUS * Math.sin(a),
          b.z + HOOK_RADIUS * (1 - Math.cos(a)),
        ];
      });
    return leg('back-in', 'Reversing into assigned bay', [
      swingPoint(index),
      ...arc,
      [-21.2, b.z],
      [-22.5, b.z],
      [-25, b.z],
      [b.x, b.z],
    ]);
  },
  /** Ease out of the dock heading east, then right into the southbound lane. */
  dockOut: leg('dock-out', 'Leaving the drop-off', [
    dock,
    [-19.9, 1.5],
    [-19.3, 1.25],
    [-18.9, 0.4],
    [-18.7, -1.3],
    [-19.4, -3.6],
    [-21.2, -6.5],
    [aisle.south, -10],
  ]),
  /** Quarter-circle (2 m radius) from the west side of the aisle into the dock, heading east. */
  dockIn: leg('dock-in', 'Arriving at drop-off', [
    [aisle.dockApproach, -0.5],
    [-22.23, 0.5],
    [-21.5, 1.23],
    dock,
  ]),
  /** North up the aisle from the bay exit, changing to the west side ahead of the dock turn. */
  aisleNorthToDock(fromZ: number): FleetLeg {
    const change: Vec2[] = [
      [-20.3, fromZ + 1.5],
      [-21.4, fromZ + 3.5],
      [-22.2, fromZ + 5.5],
      [aisle.dockApproach, fromZ + 7.5],
    ];
    return leg('aisle-north', 'Driving to the drop-off', [
      ...change.filter((p) => p[1] < -1.2),
      [aisle.dockApproach, -0.5],
    ]);
  },
};

// Trips: drives (continuous Catmull-Rom curves over several legs), timed
// pauses and the single reversing leg. Time inside a window is shared between
// drives in proportion to their length; a fixed slice covers the off-site
// pause and the back-in maneuver.
// ---------------------------------------------------------------------------
const OFF_SITE_SECONDS = 3,
  BACK_IN_SECONDS = 5,
  BACK_IN_PAUSE = 1;
type Move =
  | {
      kind: 'drive';
      legs: FleetLeg[];
      easeIn: boolean;
      easeOut: boolean;
      reverse: boolean;
      seconds?: number;
    }
  | { kind: 'pause'; seconds: number; phase: string; visible: boolean };
export type FleetTripKind = 'toDock' | 'fromDock' | 'run';
function tripMoves(
  kind: FleetTripKind,
  index: number,
  offSitePhase: string,
  oneWay: boolean,
): Move[] {
  const b = bayAt(index),
    drive = (legs: FleetLeg[], easeIn: boolean, easeOut: boolean): Move => ({
      kind: 'drive',
      legs,
      easeIn,
      easeOut,
      reverse: false,
    });
  if (kind === 'toDock')
    return [
      drive(
        [
          fleetLegs.bayOutNorth(index),
          fleetLegs.aisleNorthToDock(b.z + 3.4),
          fleetLegs.dockIn,
        ],
        true,
        true,
      ),
    ];
  const out =
    kind === 'fromDock'
      ? [fleetLegs.dockOut, fleetLegs.aisleSouth(-10), fleetLegs.streetWest]
      : [
          fleetLegs.bayOutSouth(index),
          fleetLegs.aisleSouth(b.z - 14),
          fleetLegs.streetWest,
        ];
  if (oneWay)
    return [
      drive(out, true, false),
      { kind: 'pause', seconds: 1, phase: offSitePhase, visible: false },
    ];
  return [
    drive(out, true, false),
    { kind: 'pause', seconds: OFF_SITE_SECONDS, phase: offSitePhase, visible: false },
    drive(
      [
        fleetLegs.streetEast,
        fleetLegs.drivewayNorth(index),
        fleetLegs.pullPast(index),
      ],
      false,
      true,
    ),
    { kind: 'pause', seconds: BACK_IN_PAUSE, phase: 'Stopped to back in', visible: true },
    {
      kind: 'drive',
      legs: [fleetLegs.backIn(index)],
      easeIn: true,
      easeOut: true,
      reverse: true,
      seconds: BACK_IN_SECONDS,
    },
  ];
}
type CompiledDrive = {
  curve: T.CatmullRomCurve3;
  /** Arc-length fraction where each leg ends. */
  legEnds: number[];
  phases: string[];
  length: number;
};
type CompiledMove = {
  start: number;
  end: number;
  move: Move;
  drive?: CompiledDrive;
};
const driveCache = new Map<string, CompiledDrive>();
function compileDrive(legs: FleetLeg[]): CompiledDrive {
  const key = legs.map((l) => `${l.id}:${l.points.join(';')}`).join('|');
  let compiled = driveCache.get(key);
  if (compiled) return compiled;
  const points: Vec2[] = [],
    legEndIndex: number[] = [];
  for (const l of legs) {
    for (const p of l.points) {
      const last = points.at(-1);
      if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6)
        points.push(p);
    }
    legEndIndex.push(points.length - 1);
  }
  const curve = new T.CatmullRomCurve3(
    points.map((p) => new T.Vector3(p[0], FLEET_LOT.streetY, p[1])),
    false,
    'centripetal',
  );
  curve.arcLengthDivisions = 400;
  const lengths = curve.getLengths(400),
    total = lengths.at(-1)!,
    n = points.length - 1;
  const fractionAt = (i: number) => {
    const t = (i / n) * 400,
      k = Math.min(399, Math.floor(t)),
      f = t - k;
    return T.MathUtils.lerp(lengths[k], lengths[k + 1], f) / total;
  };
  compiled = {
    curve,
    legEnds: legEndIndex.map(fractionAt),
    phases: legs.map((l) => l.phase),
    length: total,
  };
  driveCache.set(key, compiled);
  return compiled;
}
/** Distance fraction covered after `t` seconds of a drive lasting `seconds`, with smooth starts/stops. */
export function driveProgress(
  t: number,
  seconds: number,
  easeIn: boolean,
  easeOut: boolean,
) {
  const ramp = Math.min(2.5, seconds / 3),
    rIn = easeIn ? ramp : 0,
    rOut = easeOut ? ramp : 0,
    v = 1 / (seconds - rIn / 2 - rOut / 2);
  const x = T.MathUtils.clamp(t, 0, seconds);
  if (x < rIn) return (v / (2 * rIn)) * x * x;
  if (x > seconds - rOut) return 1 - (v / (2 * rOut)) * (seconds - x) ** 2;
  return v * (x - rIn / 2);
}
function compileTrip(
  kind: FleetTripKind,
  index: number,
  start: number,
  end: number,
  offSitePhase: string,
  oneWay: boolean,
): CompiledMove[] {
  const moves = tripMoves(kind, index, offSitePhase, oneWay);
  const fixed = moves.reduce(
    (s, m) =>
      s + (m.kind === 'pause' ? m.seconds : (m.seconds ?? 0)),
    0,
  );
  const drives = moves
    .filter((m): m is Extract<Move, { kind: 'drive' }> => m.kind === 'drive')
    .filter((m) => m.seconds === undefined)
    .map((m) => ({ move: m, drive: compileDrive(m.legs) }));
  const totalLength = drives.reduce((s, d) => s + d.drive.length, 0),
    shared = Math.max(1, end - start - fixed);
  let clock = start;
  return moves.map((move) => {
    let seconds = 0,
      drive: CompiledDrive | undefined;
    if (move.kind === 'pause') seconds = move.seconds;
    else {
      drive = compileDrive(move.legs);
      seconds = move.seconds ?? (shared * drive.length) / totalLength;
    }
    const compiled = { start: clock, end: clock + seconds, move, drive };
    clock += seconds;
    return compiled;
  });
}
export type FleetSample = {
  position: T.Vector3;
  heading: number;
  visible: boolean;
  door: number;
  ramp: number;
  phase: string;
  reverse: boolean;
};
const poseAt = (drive: CompiledDrive, u: number, reverse: boolean) => {
  const t = T.MathUtils.clamp(u, 0, 1),
    position = drive.curve.getPointAt(t),
    d = drive.curve.getTangentAt(t);
  const legIndex = Math.max(
    0,
    drive.legEnds.findIndex((e) => t <= e + 1e-9),
  );
  return {
    position,
    heading: Math.atan2(d.x, d.z) + (reverse ? 0 : Math.PI),
    phase: drive.phases[legIndex],
  };
};
function sampleTrip(
  moves: CompiledMove[],
  t: number,
  base: FleetSample,
): FleetSample {
  let held = { ...base };
  for (const m of moves) {
    if (m.move.kind === 'drive') {
      const seconds = m.end - m.start;
      if (t < m.end || m === moves.at(-1)) {
        const u = driveProgress(
          t - m.start,
          seconds,
          m.move.easeIn,
          m.move.easeOut,
        );
        const pose = poseAt(m.drive!, u, m.move.reverse);
        return {
          ...base,
          ...pose,
          visible: true,
          reverse: m.move.reverse,
        };
      }
      held = { ...base, ...poseAt(m.drive!, 1, m.move.reverse), visible: true };
    } else if (t < m.end)
      return { ...held, phase: m.move.phase, visible: m.move.visible };
  }
  return held;
}
const tripCache = new WeakMap<Window[], Map<string, CompiledMove[]>>();
function trip(
  windows: Window[],
  key: string,
  build: () => CompiledMove[],
) {
  let map = tripCache.get(windows);
  if (!map) {
    map = new Map();
    tripCache.set(windows, map);
  }
  let moves = map.get(key);
  if (!moves) {
    moves = build();
    map.set(key, moves);
  }
  return moves;
}
export const FLEET_LOOP = 720;
export function sampleFleetVan(
  index: number,
  time: number,
  windows: Window[],
): FleetSample {
  const t = ((time % FLEET_LOOP) + FLEET_LOOP) % FLEET_LOOP,
    park = fleetParking[index];
  const parked: FleetSample = {
    position: new T.Vector3(park.x, FLEET_LOT.streetY, park.z),
    heading: park.heading,
    visible: true,
    door: 0,
    ramp: 0,
    phase: 'Parked in assigned bay',
    reverse: false,
  };
  const v = windows[index];
  if (!v) {
    // Additional fleet vehicles make staggered neighborhood runs, returning to
    // their own bays; vans without a reservation are spares and stay parked.
    const run = fleetReservations(windows).find(
      (r) => r.van === index && t >= r.requested && t < r.end,
    );
    if (!run) return parked;
    if (t < run.start)
      return { ...parked, phase: 'Yielding to driveway traffic' };
    const moves = trip(windows, `run-${index}-${run.start}`, () =>
      compileTrip(
        'run',
        index,
        run.start,
        run.end,
        'Off site · neighborhood route',
        false,
      ),
    );
    return sampleTrip(moves, t, parked);
  }
  for (const [a, b] of [v.inbound, v.returning])
    if (a >= 0 && t >= a && t < b) {
      const moves = trip(windows, `in-${index}-${a}`, () =>
        compileTrip('toDock', index, a, b, '', false),
      );
      return sampleTrip(moves, t, parked);
    }
  for (const [a, b, afternoon] of [
    [...v.outbound, 0],
    [...v.leaving, 1],
  ])
    if (a >= 0 && t >= a && t < b) {
      // A trip that runs into the end of the day drops its riders home and
      // stays off site; the van is back in its bay when the loop restarts.
      const oneWay = b >= FLEET_LOOP;
      const moves = trip(windows, `out-${index}-${a}`, () =>
        compileTrip(
          'fromDock',
          index,
          a,
          b,
          afternoon
            ? 'Off site · taking participants home'
            : 'Off site · neighborhood pickups',
          oneWay,
        ),
      );
      return sampleTrip(moves, t, parked);
    }
  const docked =
    (t >= v.inbound[1] && t < v.outbound[0]) ||
    (v.returning[0] >= 0 && t >= v.returning[1] && t < v.leaving[0]);
  if (docked) {
    let door = 0,
      ramp = 0;
    for (const [a, b] of [v.unload, v.boarding])
      if (a >= 0) {
        door = Math.max(
          door,
          T.MathUtils.smoothstep(t, a - 5, a - 2) *
            (1 - T.MathUtils.smoothstep(t, b + 1, b + 4)),
        );
        ramp = Math.max(
          ramp,
          T.MathUtils.smoothstep(t, a - 2, a + 2) *
            (1 - T.MathUtils.smoothstep(t, b - 2, b + 1)),
        );
      }
    return {
      ...parked,
      position: new T.Vector3(dock[0], FLEET_LOT.streetY, dock[1]),
      heading: FLEET_LOT.dockHeading,
      door,
      ramp,
      phase:
        t < v.outbound[0] ? 'Unloading & escort handoff' : 'Boarding for home',
    };
  }
  return parked;
}
