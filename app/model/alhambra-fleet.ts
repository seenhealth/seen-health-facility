import * as T from 'three';
import type { Vec2 } from './schema';
import { STREET_EXTENT } from './neighborhood';
import { laneLine, STREET_CORNER_RADIUS } from './traffic-routes';
import { jogLength, Pen, pieceAt, type Piece } from './vehicle-path';
import { vehicleGap } from './vehicle-clearance';

/**
 * The Alhambra fleet: where the vans sleep, the routes they drive and a pure,
 * deterministic sampler on the 720 s care-day clock.
 *
 * Motion model: every route is a chain of straight runs and circular arcs of
 * the van's centre (no spline overshoot), so turning radii are exact: 4 m in
 * the lot, 8 m for lane changes and 6.4 m at street corners, and every
 * forward arc that starts from standstill follows a straight run. Vans pull
 * nose-first out of their back-in bays. The drop-off is a nose-in pocket
 * against the entrance ramp, so a departing van backs straight out a few
 * metres before pulling away; that and backing into a bay are the only
 * reversing legs, and their phases say so.
 *
 * The lot plan keeps clear of parked vans by construction where it can (the
 * driveway lane passes the bay noses 1.3 m off, lane changes use 8 m arcs)
 * and by scheduling where it cannot: a maneuver that sweeps near a parking
 * spot or the drop-off is booked only while that spot is empty (see
 * `tripNeeds`). The lot is one way: vans turn in from the west street (S Ethel
 * Ave) through the curb cut beside the two-storey wing, which lines up with
 * the drop-off, run south down the aisle, and leave by the driveway onto the
 * south street (the alley). Vans leave the map along the west street and fade
 * out over its last metres, short of the end of the drawn street
 * (`STREET_EXTENT`), so a fading van never hangs over bare ground; they come
 * back the same way.
 * Every drop-off arrival comes in from off site, so riders are picked up out
 * of view, and between runs the timetabled vans stay on their rounds instead
 * of parking (see `fleetPlan`). Times are loop seconds (1 s = 40 clock
 * seconds, 8 AM = 0).
 */

// ---------------------------------------------------------------------------
// Parking
// ---------------------------------------------------------------------------
const BAY = { x: -28.1, firstZ: -21.65, pitch: 2.8 },
  CURB_X = -39.1,
  AISLE_X = -20.8,
  DRIVEWAY_X = -22.5;
/**
 * Five back-in bays line the west side of the lot (nose toward the aisle),
 * starting one stall north of the curb island; the drop-off and the entrance
 * lane sit north of the row. Van F and the two spares park at the west-street
 * curb, nose north with the traffic beside them.
 *
 * `aisleX` is where a van pulling straight out of its bay finishes its 4 m
 * turn: far enough east that its inner side clears the neighbouring bay's
 * nose. The southernmost bay turns straight onto the driveway lane instead,
 * which keeps its nose clear of the curb island's tip; it may do so only
 * while the bay north of it is empty, which the planner enforces. Backing in
 * runs the other way: a van pulls south past its bay on the same line and
 * reverses in, so it needs the bay south of it empty.
 */
export const fleetParking: {
  x: number;
  z: number;
  heading: number;
  aisleX?: number;
}[] = [
  ...[DRIVEWAY_X, AISLE_X, AISLE_X, AISLE_X, AISLE_X].map((aisleX, i) => ({
    x: BAY.x,
    z: BAY.firstZ + i * BAY.pitch,
    heading: -Math.PI / 2,
    aisleX,
  })),
  ...[12.5, -11.5, -19].map((z) => ({ x: CURB_X, z, heading: Math.PI })),
];
const atCurb = (index: number) => fleetParking[index].x === CURB_X;
/** Livery letter of fleet van `index` ('A' for the first). */
export const fleetVanLetter = (index: number) =>
  String.fromCharCode(65 + index);
/**
 * Vehicle id of fleet van `index` ('van-a', 'van-b', …): the one scheme the
 * engine registry, the crew, the trace and the validators share.
 */
export const fleetVanId = (index: number) =>
  `van-${fleetVanLetter(index).toLowerCase()}`;
/** Display name of fleet van `index` ('Van A', …). */
export const fleetVanLabel = (index: number) => `Van ${fleetVanLetter(index)}`;

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
export const FLEET_LOOP = 720;

// ---------------------------------------------------------------------------
// Lot geometry (metres, street level)
// ---------------------------------------------------------------------------
export const FLEET_LOT = {
  dock: [-20.5, 1.5] as Vec2,
  dockHeading: -Math.PI / 2,
  /**
   * The lot entrance: the curb cut on the west street beside the two-storey
   * wing (Street View, May 2025). It lines up with the drop-off, so an arrival
   * turns in and drives straight to the ramp.
   */
  entry: 1.5,
  streetY: -0.23,
  /** Aisle east of the bay noses, where bay pull-outs and back-ins turn. */
  aisle: AISLE_X,
  /** Driveway lane in: 1.3 m off the bay noses and 0.4 m off the curb island at the lot's south-east corner. */
  driveway: DRIVEWAY_X,
  /**
   * Driveway lane out, half a metre further west: turning right onto the
   * street swings the van's tail toward the curb island, which it clears by
   * 0.3 m.
   */
  exitLane: DRIVEWAY_X - 0.5,
  /**
   * Lot arcs; lane changes; the long drift from the drop-off exit to the exit
   * lane (gentle enough that the van's front corner stays 0.5 m off the bay
   * noses as it straightens); pulling out from / in to the curb; street corners.
   */
  turnRadius: 4,
  laneChangeRadius: 8,
  driftRadius: 20,
  curbRadius: 6,
  streetRadius: STREET_CORNER_RADIUS,
  /** A departing van backs straight out of the drop-off to here before pulling away. */
  dockBackTo: -23.5,
  /** Straight run before a forward arc that starts from standstill. */
  lead: 0.6,
  /**
   * West-street ends of the off-site routes and the fade length before them:
   * 5 m short of the drawn street's ends, as for the community vehicles, so
   * the whole van (its nose is 3.2 m ahead of its centre) fades on the street.
   */
  vanishSouth: 5 - STREET_EXTENT.z,
  vanishNorth: STREET_EXTENT.z - 5,
  fade: 8,
  /** Ring-street lanes the fleet uses (traffic-routes.ts). */
  westbound: laneLine('south', 0),
  eastbound: laneLine('south', 1),
  northbound: laneLine('west', 0),
  southbound: laneLine('west', 1),
};
/** Nominal speeds (m per loop second) and the acceleration used to blend them. */
const SPEED = { lot: 3, street: 9, corner: 5, reverse: 1.8 },
  ACCEL = 1.5;
/** Fleet van footprint (half width, half length) and the clearance kept to parked vans. */
export const FLEET_VAN = { halfWidth: 1.125, halfLength: 3.175 },
  FLEET_VAN_MARGIN = 0.5;
const VAN = FLEET_VAN,
  VAN_MARGIN = FLEET_VAN_MARGIN;

export type FleetLeg = {
  id: string;
  phase: string;
  pieces: Piece[];
  length: number;
  speed: number;
  /** On the lot (counts toward the driveway reservation). */
  lot?: boolean;
  /** Opacity ramps out over the leg's last `fade` metres, or in over its first. */
  fade?: 'in' | 'out';
};
type LegOptions = Omit<FleetLeg, 'id' | 'phase' | 'pieces' | 'length'>;
const LOT: LegOptions = { speed: SPEED.lot, lot: true },
  REVERSE: LegOptions = { speed: SPEED.reverse, lot: true },
  STREET: LegOptions = { speed: SPEED.street },
  CORNER: LegOptions = { speed: SPEED.corner };
function leg(
  pen: Pen,
  id: string,
  phase: string,
  options: LegOptions,
  draw: (pen: Pen) => void,
): FleetLeg {
  draw(pen);
  const pieces = pen.take();
  return {
    id,
    phase,
    pieces,
    length: pieces.reduce((s, p) => s + p.length, 0),
    ...options,
  };
}

// ---------------------------------------------------------------------------
// Route network
// ---------------------------------------------------------------------------
const L = FLEET_LOT,
  R = L.turnRadius,
  LC = L.laneChangeRadius,
  EAST = Math.PI / 2,
  WEST = -Math.PI / 2,
  NORTH = 0,
  SOUTH = Math.PI;
const aisleOf = (index: number) => fleetParking[index].aisleX ?? L.aisle;
/** Where a van stops on its bay's aisle line before backing in: one turn radius south of the bay, having pulled past it. */
const backInStop = (index: number) => fleetParking[index].z - R;
/**
 * Where a van waits while off site: its own spot well beyond the street's
 * end, so that hidden vans never share a place. Nothing drives while hidden:
 * a van that has faded out waits here, and its return starts where it fades
 * back in.
 */
const awayPose = (index: number) => ({
  x: L.southbound - 30 - 12 * index,
  z: L.vanishSouth - 30,
  dir: SOUTH,
});

export const fleetRoutes = {
  /** Back straight out of the drop-off (the van is nosed against the entrance ramp). */
  dockReverse(): FleetLeg[] {
    const pen = new Pen(L.dock[0], L.dock[1], WEST);
    return [
      leg(pen, 'dock-reverse', 'Reversing out of the drop-off', REVERSE, (p) =>
        p.lineToX(L.dockBackTo),
      ),
    ];
  },
  /** From the backed-out position: straight, right toward the street, over to the exit lane and off site to the south. */
  dockToAway(): FleetLeg[] {
    const pen = new Pen(L.dockBackTo, L.dock[1], EAST);
    return [
      leg(pen, 'dock-out', 'Leaving the drop-off', LOT, (p) =>
        p.line(L.lead).arc(R, Math.PI / 2),
      ),
      leg(pen, 'lane-change', 'Driving to the street', LOT, (p) =>
        p.line(1).jog(p.x - L.exitLane, L.driftRadius),
      ),
      ...drivewayToAway(pen),
    ];
  },
  /** Bay → off site (neighborhood runs): straight out, right onto the aisle, over to the exit lane and down to the street. */
  bayToAway(index: number): FleetLeg[] {
    if (atCurb(index)) return curbToAway(index);
    const b = fleetParking[index],
      aisleX = aisleOf(index),
      pen = new Pen(b.x, b.z, EAST);
    return [
      leg(pen, 'bay-out', 'Pulling out of assigned bay', LOT, (p) =>
        p.lineToX(aisleX - R).arc(R, Math.PI / 2),
      ),
      leg(pen, 'lane-change', 'Driving to the street', LOT, (p) =>
        p.jog(p.x - L.exitLane, LC),
      ),
      ...drivewayToAway(pen),
    ];
  },
  /** Off site → drop-off: north on the west street, left through the entrance and straight east to the ramp. */
  awayToDock(): FleetLeg[] {
    const pen = new Pen(L.northbound, L.vanishSouth, NORTH);
    return [
      ...awayToEntry(pen),
      leg(pen, 'dock-in', 'Arriving at drop-off', LOT, (p) =>
        p.lineToX(L.dock[0]),
      ),
    ];
  },
  /** Off site → bay: in through the entrance, right onto the bay's aisle line and south past the bay, ready to back in. */
  awayToBay(index: number): FleetLeg[] {
    if (atCurb(index)) return awayToCurb(index);
    const pen = new Pen(L.northbound, L.vanishSouth, NORTH),
      aisleX = aisleOf(index),
      stop = backInStop(index);
    return [
      ...awayToEntry(pen),
      leg(pen, 'entry-east', 'Driving to assigned bay', LOT, (p) =>
        p.lineToX(aisleX - R),
      ),
      leg(pen, 'aisle-turn', 'Turning down the aisle', LOT, (p) =>
        p.arc(R, Math.PI / 2),
      ),
      leg(pen, 'pull-past', 'Pulling past assigned bay', LOT, (p) =>
        p.lineToZ(stop),
      ),
    ];
  },
  /** From south of the bay, reverse through a left-hand turn and straight back into it (the bays are back-in stalls, nose east). */
  backIn(index: number): FleetLeg[] {
    const b = fleetParking[index],
      pen = new Pen(aisleOf(index), backInStop(index), NORTH);
    return [
      leg(pen, 'back-in', 'Reversing into assigned bay', REVERSE, (p) =>
        p.arc(R, -Math.PI / 2).lineToX(b.x),
      ),
    ];
  },
};
/** Southbound on the exit lane, out onto the street and off site to the south. */
function drivewayToAway(pen: Pen): FleetLeg[] {
  return [
    leg(pen, 'aisle-south', 'Driving to the street', LOT, (p) =>
      p.lineToZ(L.westbound + R),
    ),
    leg(pen, 'driveway-out', 'Turning onto the south street', LOT, (p) =>
      p.arc(R, Math.PI / 2),
    ),
    leg(pen, 'street-west', 'Westbound on the south street', STREET, (p) =>
      p.lineToX(L.southbound + L.streetRadius),
    ),
    leg(
      pen,
      'corner-south',
      'Turning south onto the west street',
      CORNER,
      (p) => p.arc(L.streetRadius, -Math.PI / 2),
    ),
    leg(pen, 'street-south', 'Southbound to the neighborhood', STREET, (p) =>
      p.lineToZ(L.vanishSouth + L.fade),
    ),
    leg(pen, 'fade-out', 'Leaving the map', { ...STREET, fade: 'out' }, (p) =>
      p.line(L.fade),
    ),
  ];
}
/** From the south end of the west street: north to the entrance, then left through the curb cut heading east. */
function awayToEntry(pen: Pen): FleetLeg[] {
  return [
    leg(
      pen,
      'fade-in',
      'Returning from the neighborhood',
      { ...STREET, fade: 'in' },
      (p) => p.line(L.fade),
    ),
    leg(pen, 'street-north', 'Returning from the neighborhood', STREET, (p) =>
      p.lineToZ(L.entry - R),
    ),
    leg(pen, 'entry-in', 'Turning into the lot', LOT, (p) =>
      p.arc(R, Math.PI / 2),
    ),
  ];
}
/** Curb spot → off site to the north: pull out into the northbound lane. */
function curbToAway(index: number): FleetLeg[] {
  const b = fleetParking[index],
    pen = new Pen(b.x, b.z, NORTH);
  return [
    leg(
      pen,
      'curb-out',
      'Pulling out from the curb',
      { speed: SPEED.lot },
      (p) => p.line(L.lead).jog(L.northbound - b.x, L.curbRadius),
    ),
    leg(pen, 'street-north', 'Northbound to the neighborhood', STREET, (p) =>
      p.lineToZ(L.vanishNorth - L.fade),
    ),
    leg(pen, 'fade-out', 'Leaving the map', { ...STREET, fade: 'out' }, (p) =>
      p.line(L.fade),
    ),
  ];
}
/** Back from the south end of the west street into the curb spot. */
function awayToCurb(index: number): FleetLeg[] {
  const b = fleetParking[index],
    pen = new Pen(L.northbound, L.vanishSouth, NORTH),
    lateral = b.x - L.northbound;
  return [
    leg(
      pen,
      'fade-in',
      'Returning from the neighborhood',
      { ...STREET, fade: 'in' },
      (p) => p.line(L.fade),
    ),
    leg(pen, 'street-north', 'Returning from the neighborhood', STREET, (p) =>
      p.lineToZ(b.z - L.lead - jogLength(lateral, L.curbRadius)),
    ),
    leg(pen, 'curb-in', 'Pulling in to the curb', { speed: SPEED.lot }, (p) =>
      p.jog(lateral, L.curbRadius).line(L.lead),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Drives: legs joined end to end, with a speed profile along their length
// ---------------------------------------------------------------------------
type CompiledDrive = {
  legs: FleetLeg[];
  /** Arc length where each leg starts. */
  legStart: number[];
  length: number;
  /** Natural time at each profile station, `STEP` m apart. */
  times: Float64Array;
  duration: number;
  /** Natural time span spent on lot legs. */
  lot: [number, number] | null;
};
const STEP = 0.05;
function compileDrive(
  legs: FleetLeg[],
  easeIn: boolean,
  easeOut: boolean,
): CompiledDrive {
  const legStart: number[] = [];
  let length = 0;
  for (const l of legs) {
    legStart.push(length);
    length += l.length;
  }
  const n = Math.max(1, Math.ceil(length / STEP)),
    ds = length / n,
    v = new Float64Array(n + 1);
  let li = 0;
  for (let i = 0; i <= n; i++) {
    const s = i * ds;
    while (li < legs.length - 1 && s >= legStart[li + 1]) li++;
    v[i] = legs[li].speed;
  }
  if (easeIn) v[0] = 0;
  if (easeOut) v[n] = 0;
  for (let i = 1; i <= n; i++)
    v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * ACCEL * ds));
  for (let i = n - 1; i >= 0; i--)
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * ACCEL * ds));
  const times = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++)
    times[i] = times[i - 1] + (2 * ds) / (v[i - 1] + v[i]);
  const lotStations = legs.flatMap((l, k) =>
    l.lot ? [legStart[k], legStart[k] + l.length] : [],
  );
  const timeAt = (s: number) => times[Math.min(n, Math.round(s / ds))];
  return {
    legs,
    legStart,
    length,
    times,
    duration: times[n],
    lot: lotStations.length
      ? [timeAt(Math.min(...lotStations)), timeAt(Math.max(...lotStations))]
      : null,
  };
}
/** Arc length reached after natural time `tau`. */
function distanceAt(d: CompiledDrive, tau: number) {
  const { times } = d,
    n = times.length - 1;
  if (tau <= 0) return 0;
  if (tau >= times[n]) return d.length;
  let lo = 0,
    hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= tau) lo = mid;
    else hi = mid;
  }
  const f = (tau - times[lo]) / (times[hi] - times[lo]);
  return ((lo + f) * d.length) / n;
}
function poseOnDrive(d: CompiledDrive, s: number) {
  let k = d.legs.length - 1;
  while (k > 0 && s < d.legStart[k]) k--;
  const l = d.legs[k];
  let local = Math.min(Math.max(s - d.legStart[k], 0), l.length);
  const inLeg = local;
  // The last piece absorbs any rounding left over at the end of the leg.
  let piece = l.pieces[0];
  for (const [i, p] of l.pieces.entries()) {
    piece = p;
    if (local <= p.length || i === l.pieces.length - 1) break;
    local -= p.length;
  }
  const at = pieceAt(piece, Math.min(local, piece.length));
  let opacity = 1;
  if (l.fade === 'out')
    opacity = T.MathUtils.clamp((l.length - inLeg) / L.fade, 0, 1);
  if (l.fade === 'in') opacity = T.MathUtils.clamp(inLeg / L.fade, 0, 1);
  return { at, phase: l.phase, opacity };
}

// ---------------------------------------------------------------------------
// Trips: drives and pauses on the clock
// ---------------------------------------------------------------------------
type Move =
  | { kind: 'drive'; drive: CompiledDrive; reverse: boolean }
  | { kind: 'pause'; seconds: number; phase: string; visible: boolean };
export type FleetTripKind = 'toDock' | 'fromDock' | 'out' | 'home';
type Place = 'bay' | 'dock' | 'away';
type Trip = {
  van: number;
  kind: FleetTripKind;
  from: Place;
  to: Place;
  start: number;
  end: number;
  /** Natural-time scale (1 = nominal speeds). */
  rate: number;
  moves: Move[];
  /** Phase while off site after this trip. */
  awayPhase: string;
  requested: number;
};
const drive = (
  legs: FleetLeg[],
  easeIn = true,
  easeOut = true,
  reverse = false,
): Move => ({
  kind: 'drive',
  // Legs that came out empty (a lane change of zero width) are dropped.
  drive: compileDrive(
    legs.filter((l) => l.length > 0),
    easeIn,
    easeOut,
  ),
  reverse,
});
const pause = (seconds: number, phase: string, visible = true): Move => ({
  kind: 'pause',
  seconds,
  phase,
  visible,
});
const r = fleetRoutes;
function buildMoves(kind: FleetTripKind, index: number): Move[] {
  // Drop-off arrivals always come in from off site, where the riders board.
  if (kind === 'toDock') return [drive(r.awayToDock(), false, true)];
  if (kind === 'fromDock')
    return [
      drive(r.dockReverse(), true, true, true),
      pause(0.6, 'Stopped to pull away'),
      drive(r.dockToAway(), true, false),
    ];
  if (kind === 'out') return [drive(r.bayToAway(index), true, false)];
  if (atCurb(index)) return [drive(r.awayToBay(index), false, true)];
  return [
    drive(r.awayToBay(index), false, true),
    pause(0.8, 'Stopped to back in'),
    drive(r.backIn(index), true, true, true),
  ];
}
/** A trip's moves depend only on its kind and van: build each set once. */
const movesCache = new Map<string, Move[]>();
function tripMoves(kind: FleetTripKind, index: number): Move[] {
  const key = `${kind}:${index}`;
  let moves = movesCache.get(key);
  if (!moves) movesCache.set(key, (moves = buildMoves(kind, index)));
  return moves;
}
const naturalSeconds = (moves: Move[]) =>
  moves.reduce(
    (s, m) => s + (m.kind === 'pause' ? m.seconds : m.drive.duration),
    0,
  );
const driveSeconds = (moves: Move[]) =>
  moves.reduce((s, m) => s + (m.kind === 'drive' ? m.drive.duration : 0), 0);
/** Fastest a timetabled trip may be squeezed (× nominal speeds) before a departure runs over its window. */
const MAX_RATE = 1.25;
/**
 * Fit a trip to a timetable window. Arrivals end on time (the van waits off
 * site first if the window is generous); departures start on time and finish
 * early, or run over the window end if even MAX_RATE would not fit.
 */
function fitTrip(
  van: number,
  kind: FleetTripKind,
  from: Place,
  [a, b]: number[],
  awayPhase: string,
): Trip {
  const moves = tripMoves(kind, van),
    natural = naturalSeconds(moves),
    driving = driveSeconds(moves),
    to: Place = kind === 'toDock' ? 'dock' : kind === 'home' ? 'bay' : 'away';
  const base = { van, kind, from, to, awayPhase, requested: a };
  if (natural <= b - a) {
    if (kind !== 'toDock')
      return { ...base, start: a, end: a + natural, rate: 1, moves };
    const wait = b - a - natural;
    return {
      ...base,
      start: a,
      end: b,
      rate: 1,
      moves: [pause(wait, awayPhase, false), ...moves],
    };
  }
  const rate = driving / (b - a - (natural - driving));
  if (rate <= MAX_RATE && rate > 0)
    return { ...base, start: a, end: b, rate, moves };
  if (kind === 'toDock')
    throw new Error(`Van ${van} cannot reach the drop-off within [${a}, ${b}]`);
  return { ...base, start: a, end: a + natural, rate: 1, moves };
}
function tripLot(trip: Trip): [number, number] | null {
  let clock = trip.start,
    lot: [number, number] | null = null;
  for (const m of trip.moves) {
    const seconds =
      m.kind === 'pause' ? m.seconds : m.drive.duration / trip.rate;
    if (m.kind === 'drive' && m.drive.lot) {
      const span: [number, number] = [
        clock + m.drive.lot[0] / trip.rate,
        clock + m.drive.lot[1] / trip.rate,
      ];
      lot = lot ? [lot[0], span[1]] : span;
    } else if (m.kind === 'pause' && lot && m.visible)
      lot = [lot[0], clock + seconds];
    clock += seconds;
  }
  return lot;
}

// ---------------------------------------------------------------------------
// Parked neighbours: which spots a trip sweeps close to, and when
// ---------------------------------------------------------------------------
/** Every place a van can stand still: the parking spots (index = van) and the drop-off. */
const SPOTS = [
  ...fleetParking,
  { x: L.dock[0], z: L.dock[1], heading: L.dockHeading },
];
const DOCK_SPOT = fleetParking.length;
const footprint = (x: number, z: number, heading: number) => ({
  position: new T.Vector3(x, 0, z),
  heading,
  ...VAN,
});
const SPOT_FOOTPRINTS = SPOTS.map((s) => footprint(s.x, s.z, s.heading));
/** A spot a trip passes within VAN_MARGIN of, over [from, to] seconds after the trip starts. */
type Need = { spot: number; from: number; to: number };
const NEED_STEP = 0.1;
const needsCache = new WeakMap<Move[], Map<string, Need[]>>();
/**
 * The spots a trip sweeps within the parked-van margin of (sampled every
 * 10 cm, pauses included). Such a trip may run only while those spots are
 * empty; the van's own spot, and the drop-off it is leaving or entering, do
 * not count.
 */
function tripNeeds(trip: Trip): Need[] {
  const own = new Set([trip.van]);
  if (trip.kind === 'toDock' || trip.kind === 'fromDock') own.add(DOCK_SPOT);
  const key = `${trip.rate}:${[...own].join(',')}`;
  const byKey = needsCache.get(trip.moves) ?? new Map<string, Need[]>();
  needsCache.set(trip.moves, byKey);
  const cached = byKey.get(key);
  if (cached) return cached;
  const needs: Need[] = [];
  const mark = (spot: number, from: number, to: number) => {
    let last: Need | undefined;
    for (const n of needs) if (n.spot === spot) last = n;
    if (last && from <= last.to + 0.25) last.to = Math.max(last.to, to);
    else needs.push({ spot, from, to });
  };
  const near = (p: Pose, from: number, to: number) => {
    if (!p.visible) return;
    const body = { ...VAN, position: p.position, heading: p.heading };
    SPOT_FOOTPRINTS.forEach((f, spot) => {
      if (own.has(spot)) return;
      if (
        Math.abs(f.position.x - p.position.x) > 9 ||
        Math.abs(f.position.z - p.position.z) > 9
      )
        return;
      if (vehicleGap(body, f) < VAN_MARGIN) mark(spot, from, to);
    });
  };
  let clock = 0,
    held: Pose | null = null;
  for (const m of trip.moves) {
    if (m.kind === 'pause') {
      if (held) near(held, clock, clock + m.seconds);
      clock += m.seconds;
      continue;
    }
    const d = m.drive,
      n = Math.ceil(d.length / NEED_STEP),
      stations = d.times.length - 1;
    for (let i = 0; i <= n; i++) {
      const s = Math.min(d.length, i * NEED_STEP),
        t = clock + d.times[Math.round((s / d.length) * stations)] / trip.rate;
      near(drivePose(d, s, m.reverse), t - 0.1, t + 0.1);
    }
    held = drivePose(d, d.length, m.reverse);
    clock += d.duration / trip.rate;
  }
  byKey.set(key, needs);
  return needs;
}
/** Seconds a trip spends at its origin before it moves (an arrival held off site until its window). */
const waitAtStart = (trip: Trip) =>
  trip.moves[0].kind === 'pause' ? trip.moves[0].seconds : 0;
/** Where a van stands over the day (between its trips), as intervals within 0..720. */
function stays(trips: Trip[]) {
  const sorted = [...trips].sort((a, b) => a.start - b.start),
    wrapped = sorted.find((t) => t.end > FLEET_LOOP),
    out: { place: Place; start: number; end: number }[] = [];
  let place: Place = wrapped ? wrapped.to : (sorted.at(-1)?.to ?? 'bay'),
    clock = wrapped ? wrapped.end - FLEET_LOOP : 0;
  for (const t of sorted) {
    const leaves = t.start + waitAtStart(t);
    if (leaves > clock) out.push({ place, start: clock, end: leaves });
    clock = Math.max(clock, t.end);
    place = t.to;
  }
  if (clock < FLEET_LOOP) out.push({ place, start: clock, end: FLEET_LOOP });
  return out;
}
/** The first trip that sweeps a spot while another van stands in it, described; null when the plan is clear. */
function neighbourConflict(trips: Trip[][]): string | null {
  const st = trips.map(stays);
  for (const list of trips)
    for (const trip of list)
      for (const n of tripNeeds(trip)) {
        const occupied =
          n.spot === DOCK_SPOT
            ? st.flatMap((s, v) =>
                v === trip.van ? [] : s.filter((x) => x.place === 'dock'),
              )
            : st[n.spot].filter((x) => x.place === 'bay');
        for (const k of [0, -FLEET_LOOP]) {
          const a = trip.start + n.from + k,
            b = trip.start + n.to + k;
          const hit = occupied.find((o) => a < o.end && b > o.start);
          if (hit)
            return `van ${trip.van} (${trip.kind}) passes spot ${n.spot} at ${a.toFixed(1)}–${b.toFixed(1)} while it is occupied (${hit.start.toFixed(1)}–${hit.end.toFixed(1)})`;
        }
      }
  return null;
}

// ---------------------------------------------------------------------------
// The day plan: timetabled trips, then the neighborhood runs around them
// ---------------------------------------------------------------------------
export type FleetReservation = {
  van: number;
  start: number;
  end: number;
  requested: number;
};
/**
 * Neighborhood runs by the vans without a timetable: out from the bay or
 * curb at `requested` (or the first clear moment after it), back after at
 * least `away` s. Van E makes one long morning round from the northernmost
 * bay (the only bay with room to turn south toward the street; it backs in
 * only beside an empty bay), van F two short ones from the west curb.
 */
const NEIGHBORHOOD_RUNS = [
  { van: 4, requested: 304, away: 100 },
  { van: 5, requested: 36, away: 20 },
  { van: 5, requested: 520, away: 20 },
];
/** Driveway clearance between consecutive maneuvers on the lot. */
const DRIVEWAY_GAP = 4;
type FleetPlan = { trips: Trip[][]; reservations: FleetReservation[] };
type Booking = {
  van: number;
  kind: FleetTripKind;
  from: Place;
  requested: number;
  deadline: number;
  awayPhase: string;
};
const planCache = new WeakMap<Window[], FleetPlan>();
/**
 * The day plan. Every arrival at the drop-off comes in from off site, so its
 * riders board out of view, and between runs (from a departure to the next
 * arrival, round the clock) a timetabled van stays on its rounds instead of
 * coming home: a parked van could only reach the street by turning south out
 * of its bay, which sweeps the bay north of it and, from all but the
 * northernmost bay, runs into the curb island at the end of the aisle.
 */
function fleetPlan(windows: Window[]): FleetPlan {
  const cached = planCache.get(windows);
  if (cached) return cached;
  const plan = bookDay(timetabledTrips(windows));
  planCache.set(windows, plan);
  return plan;
}
/** The trips fixed by the passenger timetable; each reserves the driveway for the time it is actually on the lot. */
function timetabledTrips(windows: Window[]): FleetPlan {
  const trips: Trip[][] = fleetParking.map(() => []);
  const reservations: FleetReservation[] = [];
  windows.forEach((w, van) => {
    const add = (trip: Trip) => trips[van].push(trip);
    add(
      fitTrip(
        van,
        'toDock',
        'away',
        w.inbound,
        'Off site · picking up participants',
      ),
    );
    add(
      fitTrip(
        van,
        'fromDock',
        'dock',
        w.outbound,
        'Off site · neighborhood pickups',
      ),
    );
    if (w.returning[0] >= 0) {
      add(
        fitTrip(
          van,
          'toDock',
          'away',
          w.returning,
          'Off site · neighborhood pickups',
        ),
      );
      add(
        fitTrip(
          van,
          'fromDock',
          'dock',
          w.leaving,
          'Off site · taking participants home',
        ),
      );
    }
    for (const trip of trips[van]) {
      const lot = tripLot(trip);
      if (lot)
        reservations.push({
          van,
          start: lot[0],
          end: lot[1],
          requested: trip.requested,
        });
    }
  });
  return { trips, reservations };
}
/** Book the neighborhood runs around the timetable. */
function bookDay(plan: FleetPlan): FleetPlan {
  const { trips, reservations } = plan;
  const busy = (van: number, a: number, b: number) =>
    trips[van].some((t) =>
      [0, -FLEET_LOOP, FLEET_LOOP].some(
        (k) => a < t.end + k && b > t.start + k,
      ),
    );
  const lotFree = ([a, b]: [number, number]) =>
    reservations.every(
      (r) => b + DRIVEWAY_GAP <= r.start || a >= r.end + DRIVEWAY_GAP,
    );
  /** Book a natural-speed trip at the first start ≥ `requested` whose lot span and neighbours are clear; it must end by `deadline`. */
  const book = ({
    van,
    kind,
    from,
    requested,
    deadline,
    awayPhase,
  }: Booking) => {
    const moves = tripMoves(kind, van),
      seconds = naturalSeconds(moves);
    const why = { busy: 0, driveway: 0, neighbour: 0 };
    let lastConflict = '';
    for (let start = requested; start + seconds <= deadline; start += 0.5) {
      const trip: Trip = {
        van,
        kind,
        from,
        to: kind === 'home' ? 'bay' : 'away',
        start,
        end: start + seconds,
        rate: 1,
        moves,
        awayPhase,
        requested,
      };
      const lot = tripLot(trip);
      if (busy(van, trip.start, trip.end)) {
        why.busy++;
        continue;
      }
      if (lot && !lotFree(lot)) {
        why.driveway++;
        continue;
      }
      trips[van].push(trip);
      const conflict = neighbourConflict(trips);
      if (conflict) {
        trips[van].pop();
        why.neighbour++;
        lastConflict = conflict;
        continue;
      }
      if (lot)
        reservations.push({ van, start: lot[0], end: lot[1], requested });
      return trip;
    }
    throw new Error(
      `No clear slot for van ${van} (${kind}) between ${requested} and ${deadline}: ${why.busy} starts had the van busy, ${why.driveway} the driveway reserved, ${why.neighbour} a neighbour in the way${lastConflict ? ` (last: ${lastConflict})` : ''}`,
    );
  };
  for (const run of NEIGHBORHOOD_RUNS) {
    const out = book({
      van: run.van,
      kind: 'out',
      from: 'bay',
      requested: run.requested,
      deadline: FLEET_LOOP,
      awayPhase: 'Off site · neighborhood route',
    });
    book({
      van: run.van,
      kind: 'home',
      from: 'away',
      requested: out.end + run.away,
      deadline: FLEET_LOOP,
      awayPhase: 'Off site · neighborhood route',
    });
  }
  const conflict = neighbourConflict(trips);
  if (conflict) throw new Error(`Fleet timetable: ${conflict}`);
  for (const list of trips) list.sort((a, b) => a.start - b.start);
  // Every trip starts where the van's previous trip, round the clock, left it.
  trips.forEach((list, van) =>
    list.forEach((t, i) => {
      const before = list.at(i - 1)!;
      if (before !== t && before.to !== t.from)
        throw new Error(
          `Fleet timetable: van ${van} starts a ${t.kind} trip at ${t.start.toFixed(1)} from its ${t.from}, but its ${before.kind} trip left it at the ${before.to}`,
        );
    }),
  );
  reservations.sort((a, b) => a.start - b.start);
  return { trips, reservations };
}
/** Driveway reservations: one maneuver on the lot at a time, four seconds apart. */
export function fleetReservations(windows: Window[]) {
  return fleetPlan(windows).reservations;
}

/**
 * What a van is doing over the day, as contiguous spells covering 0..720: a
 * trip in progress (a departure that runs past 720 continues at the start of
 * the day), docked, off site, parked, or yielding the driveway.
 */
export type FleetSpell = {
  start: number;
  end: number;
  kind: 'trip' | 'docked' | 'away' | 'parked' | 'yielding';
  trip?: FleetTripKind;
};
export function fleetTimeline(index: number, windows: Window[]): FleetSpell[] {
  const trips = fleetPlan(windows).trips[index];
  const spells: FleetSpell[] = [];
  const wrapped = trips.find((t) => t.end > FLEET_LOOP);
  let place: Place = wrapped ? wrapped.to : (trips.at(-1)?.to ?? 'bay'),
    clock = 0;
  if (wrapped) {
    spells.push({
      start: 0,
      end: wrapped.end - FLEET_LOOP,
      kind: 'trip',
      trip: wrapped.kind,
    });
    clock = wrapped.end - FLEET_LOOP;
  }
  const rest: Record<Place, FleetSpell['kind']> = {
    bay: 'parked',
    dock: 'docked',
    away: 'away',
  };
  for (const t of trips) {
    if (t.start > clock) {
      if (place === 'bay' && t.requested < t.start && t.requested >= clock) {
        if (t.requested > clock)
          spells.push({ start: clock, end: t.requested, kind: 'parked' });
        spells.push({ start: t.requested, end: t.start, kind: 'yielding' });
      } else spells.push({ start: clock, end: t.start, kind: rest[place] });
    }
    spells.push({
      start: t.start,
      end: Math.min(t.end, FLEET_LOOP),
      kind: 'trip',
      trip: t.kind,
    });
    clock = t.end;
    place = t.to;
  }
  if (clock < FLEET_LOOP)
    spells.push({ start: clock, end: FLEET_LOOP, kind: rest[place] });
  return spells.filter((s) => s.end > s.start + 1e-9);
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------
export type FleetSample = {
  position: T.Vector3;
  heading: number;
  visible: boolean;
  door: number;
  ramp: number;
  phase: string;
  reverse: boolean;
  /** 1 = fully drawn; ramps to 0 as the van leaves the map. */
  opacity: number;
  /** Driver's door, 0 closed – 1 open. */
  cabDoor: number;
};
/**
 * The driver's door while docked or parked (seconds from stopping and to the
 * next departure): it swings open as the driver gets out and shuts behind
 * them, and again for the return to the cab. fleet-crew.ts times the driver's
 * steps to these values.
 */
export const FLEET_CAB_DOOR = {
  swing: 0.5,
  exit: { open: 0, close: 2.3 },
  entry: { open: -2.8, close: -0.6 },
};
function cabDoorAt(t: number, docked: number, departs: number) {
  const { swing, exit, entry } = FLEET_CAB_DOOR;
  const span = (open: number, close: number) =>
    T.MathUtils.smoothstep(t, open, open + swing) *
    (1 - T.MathUtils.smoothstep(t, close, close + swing));
  return Math.max(
    span(docked + exit.open, docked + exit.close),
    span(departs + entry.open, departs + entry.close),
  );
}
const headingFor = (dir: number, reverse: boolean) =>
  dir + (reverse ? 0 : Math.PI);
type Pose = Pick<
  FleetSample,
  'position' | 'heading' | 'visible' | 'opacity' | 'reverse'
>;
function drivePose(
  d: CompiledDrive,
  s: number,
  reverse: boolean,
): Pose & { phase: string } {
  const p = poseOnDrive(d, s);
  return {
    position: new T.Vector3(p.at.x, L.streetY, p.at.z),
    heading: headingFor(p.at.dir, reverse),
    visible: p.opacity > 0,
    opacity: p.opacity,
    reverse,
    phase: p.phase,
  };
}
function awaySample(
  index: number,
  base: FleetSample,
  phase: string,
): FleetSample {
  const a = awayPose(index);
  return {
    ...base,
    position: new T.Vector3(a.x, L.streetY, a.z),
    heading: headingFor(a.dir, false),
    visible: false,
    opacity: 0,
    phase,
  };
}
function sampleTrip(trip: Trip, t: number, parked: FleetSample): FleetSample {
  // A pause holds the pose where the previous drive ended (or where the trip starts).
  let held: FleetSample =
    trip.from === 'away'
      ? awaySample(trip.van, parked, trip.awayPhase)
      : parked;
  let clock = trip.start;
  for (const [i, m] of trip.moves.entries()) {
    const seconds =
      m.kind === 'pause' ? m.seconds : m.drive.duration / trip.rate;
    if (t < clock + seconds || i === trip.moves.length - 1) {
      if (m.kind === 'pause')
        return {
          ...held,
          phase: m.phase,
          visible: m.visible && held.visible,
          opacity: m.visible ? held.opacity : 0,
        };
      const s = distanceAt(m.drive, (t - clock) * trip.rate);
      return { ...parked, ...drivePose(m.drive, s, m.reverse) };
    }
    if (m.kind === 'drive')
      held = { ...parked, ...drivePose(m.drive, m.drive.length, m.reverse) };
    clock += seconds;
  }
  return held;
}
/** End of a trip on the day's clock (a trip that runs past 720 ended this morning). */
const endOnClock = (trip: Trip) =>
  trip.end > FLEET_LOOP ? trip.end - FLEET_LOOP : trip.end;
export function sampleFleetVan(
  index: number,
  time: number,
  windows: Window[],
): FleetSample {
  const t = ((time % FLEET_LOOP) + FLEET_LOOP) % FLEET_LOOP,
    park = fleetParking[index];
  const parked: FleetSample = {
    position: new T.Vector3(park.x, L.streetY, park.z),
    heading: park.heading,
    visible: true,
    door: 0,
    ramp: 0,
    phase: atCurb(index) ? 'Parked at the curb' : 'Parked in assigned bay',
    reverse: false,
    opacity: 1,
    cabDoor: 0,
  };
  const trips = fleetPlan(windows).trips[index];
  for (const trip of trips)
    for (const tt of [t, t + FLEET_LOOP])
      if (tt >= trip.start && tt < trip.end)
        return sampleTrip(trip, tt, parked);
  // Between trips the van is wherever the last trip (cyclically) left it.
  const ended = trips.filter((x) => endOnClock(x) <= t);
  const last = (ended.length ? ended : trips).reduce<Trip | undefined>(
    (best, x) => (!best || endOnClock(x) > endOnClock(best) ? x : best),
    undefined,
  );
  const next = trips.find((x) => x.start > t);
  if (!last || last.to === 'bay') {
    if (next && next.from === 'bay' && next.requested <= t)
      return { ...parked, phase: 'Yielding to driveway traffic' };
    // The driver's door opens for the driver getting out after a run and
    // getting in before the next one (fleet-crew.ts walks them to and from
    // the fleet office), as at the drop-off.
    return {
      ...parked,
      cabDoor: cabDoorAt(
        t,
        last?.kind === 'home' ? endOnClock(last) : -Infinity,
        next?.from === 'bay' ? next.requested : Infinity,
      ),
    };
  }
  if (last.to === 'away') return awaySample(index, parked, last.awayPhase);
  // Docked at the drop-off until the next trip leaves.
  const v = windows[index],
    departs = next ? next.start : FLEET_LOOP;
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
    position: new T.Vector3(L.dock[0], L.streetY, L.dock[1]),
    heading: L.dockHeading,
    door,
    ramp,
    cabDoor: cabDoorAt(t, last.end, departs),
    phase:
      t < v.outbound[0] ? 'Unloading & escort handoff' : 'Boarding for home',
  };
}
