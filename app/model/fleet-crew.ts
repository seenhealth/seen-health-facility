/**
 * Drivers and riders for the Alhambra fleet.
 *
 * `withFleetCrew` is a pure transform over a care-day source: it seats every
 * rider who `ride`s a fleet van (the base loop's arrival participants, their
 * escorts and the story hero alike), gives each van a driver whose day
 * follows the van's timetable, and adds two mid-day riders for the vans that
 * arrive without any. The result is ordinary `ActorSpec` data that the
 * activity engine plays back; nothing here runs at render time.
 *
 * Frames: van-local coordinates have x toward the sliding door, y up from the
 * ground and z toward the rear (the nose is at −z). World points come from the
 * van's docked pose, so the same choreography works wherever the dock is.
 */
import { ARRIVAL, alhambraVanWindows, sampleVan } from './arrival';
import { DROP_OFF } from './alhambra-exterior';
import {
  FLEET_CAB_DOOR,
  FLEET_VAN,
  fleetParking,
  fleetTimeline,
  fleetVanId,
  fleetVanLetter,
  type FleetSpell,
} from './alhambra-fleet';
import {
  FLEET_VAN_CAB_DOOR,
  FLEET_VAN_RAMP,
  FLEET_VAN_SEATS,
  type VanSeat,
} from './photo-assets';
import {
  sampleActor,
  sampleEscort,
  type ActivityData,
  type ActorSpec,
  type Interaction,
  type Segment,
} from './activity';
import type { Action } from './characters';
import type { Vec2 } from './schema';

const LOOP = 720;
/** Walking speeds (m per loop second): staff outside, people moving inside the cabin. */
const STAFF_WALK = 1.35,
  CABIN_WALK = 0.7,
  CABIN_ROLL = 0.55;
/**
 * Nominal speed along a ride segment's placeholder path (m per loop second;
 * see `Track.ride`): fast enough that an escort following its partner is
 * handed to its own seat within a millisecond of the partner sitting down.
 */
const RIDE_PATH_SPEED = 1000;
/** The driver follows the last member of a rider's party this far behind on the ramp. */
const FOLLOW_GAP = 0.8;
/** A driver walking out to a parked van reaches its door this long before opening it. */
const DOOR_LEAD = 0.5;
/**
 * Clearance a driver on foot keeps from every other fleet van in view, and
 * from everyone else on foot, while walking between the fleet office and a
 * parked van.
 */
const LOT_CLEARANCE = 1.5,
  PEOPLE_CLEARANCE = 0.8;
/** Gap an escort keeps behind its partner (mirrors `sampleEscort`). */
const escortGap = (rider: ActorSpec) =>
  rider.mobility === 'wheelchair' ? 0.74 : 0.95;
/** Van-local standing spots used by the choreography (metres; see module comment). */
const SPOT = {
  sill: FLEET_VAN_RAMP.sill,
  foot: FLEET_VAN_RAMP.foot,
  /** Beside the ramp hinge, clear of the door leaves and of riders arriving along the sidewalk. */
  standby: [2.8, -1.2] as Vec2,
  /** Upper ramp, off the centre line toward the nose: out of the way of a rider stepping onto the sill. */
  topside: [1.6, -0.62] as Vec2,
  /** Standing room between the cab seats and the door opening. */
  inside: [0.55, -1.15] as Vec2,
  /**
   * Just inside the sliding-door opening, toward its front edge: the step in
   * from `topside` to `inside` passes the door-side panel through the opening
   * (FLEET_VAN_SIDE_DOOR), not through the panel ahead of it.
   */
  stepIn: [0.95, -0.47] as Vec2,
  /** Just outside the driver's door opening, and a step further out, behind the open door's swing. */
  cabDoorway: [
    -1.3,
    (FLEET_VAN_CAB_DOOR.hinge + FLEET_VAN_CAB_DOOR.rear) / 2,
  ] as Vec2,
  cabOutside: [-2.55, FLEET_VAN_CAB_DOOR.rear - 0.12] as Vec2,
  noseDriverSide: [-1.65, -3.75] as Vec2,
  noseDoorSide: [1.65, -3.75] as Vec2,
  aisleX: 0.18,
  doorLineZ: FLEET_VAN_SEATS.door[2],
};
const GROUND = ARRIVAL.streetY,
  FLOOR = ARRIVAL.vanFloorY;
/** Top of the entrance landing and the lobby floor, and of the raised west sidewalk (neighborhood.ts). */
const LANDING_Y = 0,
  SIDEWALK_Y = GROUND + 0.18;
type RoutePoint = { at: Vec2; y: number };
/**
 * The fleet office is inside the center. The drivers of the vans that park on
 * the lot between runs (van E in its bay, van F at the west curb) walk out of
 * the sliding entrance, along the drop-off landing to its steps, down them
 * away from the wall (`DROP_OFF`), then across the lot to the driver's door,
 * and back the same way: they are
 * never seen appearing in, or vanishing from, a parked van.
 */
const OFFICE = (() => {
  const { landing, steps } = DROP_OFF,
    mm = (v: number) => Math.round(v * 1000) / 1000;
  /** The steps' centre line, and the lot a tread beyond their foot. */
  const stepsZ = mm((steps.z0 + steps.z1) / 2),
    belowSteps = mm(steps.x0 - steps.depth);
  return {
    /** Just inside the sliding doors, where a driver leaves or reaches the office (out of sight). */
    inside: [mm(ARRIVAL.door[0] + 0.45), ARRIVAL.door[1]] as Vec2,
    /**
     * Through the doors, along the landing to the head of the steps and down
     * them away from the wall (heights along the nosings, reaching the lot a
     * tread beyond the last step).
     */
    exit: [
      { at: ARRIVAL.door, y: LANDING_Y },
      { at: [landing.x, stepsZ], y: LANDING_Y },
      { at: [steps.x1, stepsZ], y: DROP_OFF.top },
      { at: [belowSteps, stepsZ], y: DROP_OFF.street },
    ] as RoutePoint[],
    /**
     * On across the lot to each such van's driver door (`SPOT.cabOutside` is
     * appended): diagonally over the lanes and round the bay noses to van E,
     * and south of a docked van, wide of its driver's door, through the gap in
     * the curb islands and over the sidewalk to van F.
     */
    toVan: {
      [fleetVanId(4)]: [{ at: [-23.6, -12.9], y: GROUND }],
      [fleetVanId(5)]: [
        { at: [-30.6, -3], y: GROUND },
        { at: [-32.3, 1.2], y: GROUND },
        { at: [-32.75, 1.75], y: SIDEWALK_Y },
      ],
    } as Record<string, RoutePoint[]>,
  };
})();
const DRIVER_NAMES = [
  'Casey',
  'Taylor',
  'Robin',
  'Dana',
  'Jamie',
  'Kai',
  'Priya',
  'Wen',
];
type Mobility = ActorSpec['mobility'];
/**
 * Two riders for each van that arrives mid-day without any actors of its own,
 * and where each waits in the lobby for the afternoon van. Their ramp,
 * entrance and lobby routes are the base loop's walking arrival's (see
 * `entranceRoute`).
 */
const MIDDAY_RIDERS: {
  van: string;
  home: string;
  name: string;
  variant: number;
  mobility?: Mobility;
  waitAt: Vec2;
}[] = [
  // In on van C (index 2) or D (3), home on van A (0) or B (1).
  {
    van: fleetVanId(2),
    home: fleetVanId(0),
    name: 'Mei',
    variant: 14,
    mobility: 'cane',
    waitAt: [-12.9, -1.55],
  },
  {
    van: fleetVanId(2),
    home: fleetVanId(0),
    name: 'Rafael',
    variant: 15,
    waitAt: [-12.2, -1.55],
  },
  {
    van: fleetVanId(3),
    home: fleetVanId(1),
    name: 'Dolores',
    variant: 16,
    mobility: 'walker',
    waitAt: [-11.5, -1.5],
  },
  {
    van: fleetVanId(3),
    home: fleetVanId(1),
    name: 'Minh',
    variant: 17,
    waitAt: [-13.6, -1.6],
  },
];
/** Mid-day riders check in a step behind and beside the front-desk spot, leaving it to the morning arrival waiting there. */
const QUEUE_OFFSET: Vec2 = [-0.9, 0.7];

const vanIds = fleetParking.map((_, i) => fleetVanId(i));
const vanIndex = (id: string) => vanIds.indexOf(id);
const near = (a: Vec2, b: Vec2, tolerance = 0.05) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
const length = (path: Vec2[]) =>
  path.reduce(
    (s, p, i) =>
      i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0,
    0,
  );
const round = (v: number) => Math.round(v * 1000) / 1000;
/** The point `d` metres along `path`. */
function pointAlong(path: Vec2[], d: number): Vec2 {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= l || i === path.length - 1) {
      const f = l ? Math.min(1, d / l) : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    d -= l;
  }
  return path[0];
}
/** Distance from `p` to the footprint of a van standing or driving at `van`. */
function vanDistance(
  van: { position: { x: number; z: number }; heading: number },
  p: Vec2,
) {
  const dx = p[0] - van.position.x,
    dz = p[1] - van.position.z,
    s = Math.sin(van.heading),
    c = Math.cos(van.heading);
  const along = Math.abs(dx * s + dz * c) - FLEET_VAN.halfLength,
    across = Math.abs(dx * c - dz * s) - FLEET_VAN.halfWidth;
  return Math.hypot(Math.max(along, 0), Math.max(across, 0));
}

/** Van-local (x, z) → world for a van standing at (x, z) with `heading`. */
const vanToWorld =
  (at: Vec2, heading: number) =>
  ([x, z]: Vec2): Vec2 => {
    const c = Math.cos(heading),
      s = Math.sin(heading);
    return [round(at[0] + x * c + z * s), round(at[1] - x * s + z * c)];
  };
/** Docked pose of a van and helpers to place van-local points in the world. */
function dockFrame(index: number) {
  const window = alhambraVanWindows[index];
  const pose = sampleVan(index, window.unload[0]);
  const world = vanToWorld([pose.position.x, pose.position.z], pose.heading);
  return {
    window,
    pose,
    world,
    sill: world(SPOT.sill),
    foot: world(SPOT.foot),
  };
}
/** Van-local → world for a van standing in its own bay or curb spot. */
const parkedWorld = (index: number) => {
  const spot = fleetParking[index];
  return vanToWorld([spot.x, spot.z], spot.heading);
};
const seatPoint = (seat: VanSeat): Vec2 => [seat[0], seat[2]];

// ---------------------------------------------------------------------------
// Segment builders
// ---------------------------------------------------------------------------
type Extra = Partial<Omit<Segment, 'start' | 'end' | 'action' | 'path'>>;
const segment = (
  start: number,
  end: number,
  action: Action,
  path: Vec2[],
  extra: Extra = {},
): Segment => ({
  start: round(start),
  end: round(end),
  action,
  path,
  zoneId: 'site',
  heading: 0,
  visible: true,
  ...extra,
});
/** Heading (0 = +z) that faces from `from` toward `to`. */
const facing = (from: Vec2, to: Vec2) =>
  Math.atan2(to[0] - from[0], to[1] - from[1]);
/** Linear heights between two values along a path. */
const heightsAlong = (path: Vec2[], from: number, to: number) => {
  const total = length(path);
  let d = 0;
  return path.map((p, i) => {
    if (i) d += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]);
    return round(total ? from + ((to - from) * d) / total : from);
  });
};

/**
 * A person's timeline under construction: every beat starts where the last
 * one ended, so the validators' continuity rules hold by construction.
 */
class Track {
  segments: Segment[] = [];
  at: Vec2;
  y: number;
  t: number;
  constructor(at: Vec2, y: number, t: number) {
    this.at = at;
    this.y = y;
    this.t = t;
  }
  private push(s: Segment) {
    if (s.end > s.start + 1e-9) this.segments.push(s);
    this.at = s.path.at(-1)!;
    this.y = s.heights?.at(-1) ?? this.y;
    this.t = Math.max(this.t, s.end);
  }
  /** Walk along `points` (excluding the current spot) to arrive by `end`; heights interpolate toward `toY`. */
  walk(
    points: Vec2[],
    end: number,
    title: string,
    toY = this.y,
    action: Action = 'walk',
    extra: Extra = {},
  ) {
    const path = [this.at, ...points];
    this.push(
      segment(this.t, Math.max(end, this.t + 0.01), action, path, {
        heights: heightsAlong(path, this.y, toY),
        title,
        ...extra,
      }),
    );
    return this;
  }
  /** Walk at a given speed instead of to a deadline. */
  walkAt(
    points: Vec2[],
    speed: number,
    title: string,
    toY = this.y,
    action: Action = 'walk',
    extra: Extra = {},
  ) {
    return this.walk(
      points,
      this.t + length([this.at, ...points]) / speed,
      title,
      toY,
      action,
      extra,
    );
  }
  stay(
    until: number,
    action: Action,
    title: string,
    heading: number,
    extra: Extra = {},
  ) {
    this.push(
      segment(this.t, until, action, [this.at, this.at], {
        heights: [this.y, this.y],
        heading,
        title,
        ...extra,
      }),
    );
    return this;
  }
  /**
   * Seated in a vehicle until `until`. The nominal path (what the engine uses
   * when it is not placing the person in the vehicle) starts and ends at the
   * seat's docked world point via a far detour: `sampleEscort` measures its
   * gap back along the partner's nominal path, and a fast ride path keeps that
   * measurement inside the ride segment from its first frame, where the
   * `seat` lets the engine hand an escort over to its own seat instead of
   * leaving it behind at the dock (until then the engine slides the escort
   * along the partner's last steps). The detour grows with the ride's length
   * so that the nominal speed stays at RIDE_PATH_SPEED or more.
   */
  ride(
    until: number,
    vehicleId: string,
    seat: VanSeat,
    seatWorld: Vec2,
    title: string,
    visible: boolean,
    from: Vec2 = seatWorld,
  ) {
    const detour = Math.max(300, (RIDE_PATH_SPEED * (until - this.t)) / 2);
    this.push(
      segment(
        this.t,
        until,
        'ride',
        [from, [seatWorld[0], seatWorld[1] + detour], seatWorld],
        {
          heights: [FLOOR, FLOOR, FLOOR],
          heading: 0,
          title,
          visible,
          vehicleId,
          seat,
          seatHeading: Math.PI,
        },
      ),
    );
    this.y = FLOOR;
    return this;
  }
}

// ---------------------------------------------------------------------------
// Van timetable helpers
// ---------------------------------------------------------------------------
/** The van's day as the fleet plans it: trips, docked spells and waits (off site, in its bay or for the driveway). */
const vanSpells = (index: number): FleetSpell[] =>
  fleetTimeline(index, alhambraVanWindows);
/** The docked spell holding `t`. */
function dockedAt(index: number, t: number) {
  const spells = vanSpells(index),
    k = spells.findIndex(
      (s) => s.kind === 'docked' && t >= s.start - 1e-6 && t <= s.end + 1e-6,
    );
  if (k < 0)
    throw new Error(
      `withFleetCrew: ${vanIds[index]} is not at the drop-off at ${t}`,
    );
  return { spells, k, spell: spells[k] };
}
/** When the van docked around `t` leaves again. */
const departureAfter = (index: number, t: number) =>
  dockedAt(index, t).spell.end;
/**
 * When the trip that brings the van to the drop-off for the docked spell
 * holding `t` sets off. Arrivals come in from off site, so the van is out of
 * sight then: its riders take their seats at this moment, out of view.
 */
function arrivalStart(index: number, t: number) {
  const { spells, k } = dockedAt(index, t),
    trip = spells.at(k - 1)!;
  if (trip.kind !== 'trip' || trip.trip !== 'toDock')
    throw new Error(
      `withFleetCrew: ${vanIds[index]} reaches the drop-off at ${spells[k].start} without an arrival trip`,
    );
  return trip.start;
}
/**
 * When the van that leaves the drop-off around `t` is out of sight: the end
 * of its departure trip, once it has faded out at the end of the street (past
 * the end of the day when the trip runs on into the next morning).
 */
function outOfSightAfter(index: number, t: number) {
  const { spells, k } = dockedAt(index, t),
    trip = spells[k + 1];
  if (trip?.kind !== 'trip')
    throw new Error(
      `withFleetCrew: ${vanIds[index]} does not leave the drop-off after ${t}`,
    );
  if (trip.end < LOOP) return trip.end;
  const next = spells[0];
  return next.kind === 'trip' && next.start === 0 ? LOOP + next.end : LOOP;
}
/** Segment times are rounded to the millisecond: round a moment the van must already be out of sight up, never down. */
const after = (t: number) => Math.ceil(t * 1000 - 1e-6) / 1000;

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------
type RideEvent = {
  actor: ActorSpec;
  vehicle: string;
  index: number;
  /** Ride segment index in the actor's list. */
  at: number;
  alights: boolean;
  boards: boolean;
};
/** Ride segments on fleet vans, with whether they end at the ramp (alighting) or start there (boarding). */
function rideEvents(actor: ActorSpec): RideEvent[] {
  const out: RideEvent[] = [];
  actor.segments.forEach((s, i) => {
    if (s.action !== 'ride' || !s.vehicleId) return;
    const index = vanIndex(s.vehicleId);
    if (index < 0 || !alhambraVanWindows[index]) return;
    const { sill } = dockFrame(index);
    const next = actor.segments[i + 1],
      prev = actor.segments[i - 1];
    out.push({
      actor,
      vehicle: s.vehicleId,
      index,
      at: i,
      alights: !!next && near(next.path[0], sill),
      boards: !!prev && near(prev.path.at(-1)!, sill),
    });
  });
  return out;
}
/**
 * Cabin seats for one van and direction. Escorted riders take the front bench
 * (inner seat first) with their escort directly behind, so that the moment a
 * rider stands up `sampleEscort`'s fallback places the escort on its own seat;
 * a wheelchair rider takes the bay by the door with the escort on the
 * attendant seat; everyone else fills the benches front to back.
 */
function assignSeats(events: RideEvent[], escorts: Map<string, ActorSpec>) {
  const seats = new Map<string, VanSeat>();
  // One seat per rider for the whole day, in the order they first reach the ramp.
  const riders = [
    ...new Map(events.map((e) => [e.actor.id, e.actor])).values(),
  ];
  const benches = FLEET_VAN_SEATS.benches,
    free = new Set(benches.map((_, i) => i));
  let wheelchairFree = true;
  const take = (i: number) => {
    free.delete(i);
    return benches[i];
  };
  for (const rider of riders) {
    const escort = escorts.get(rider.id);
    if (!escort) continue;
    if (rider.mobility === 'wheelchair' && wheelchairFree) {
      wheelchairFree = false;
      seats.set(rider.id, FLEET_VAN_SEATS.wheelchair);
      seats.set(escort.id, FLEET_VAN_SEATS.attendant);
      continue;
    }
    const side = free.has(1) && free.has(3) ? 1 : 0;
    seats.set(rider.id, take(side));
    seats.set(escort.id, take(2 + side));
  }
  for (const rider of riders) {
    if (seats.has(rider.id)) continue;
    if (rider.mobility === 'wheelchair' && wheelchairFree) {
      wheelchairFree = false;
      seats.set(rider.id, FLEET_VAN_SEATS.wheelchair);
      continue;
    }
    const next = [...free].sort((a, b) => a - b)[0];
    seats.set(
      rider.id,
      next === undefined ? FLEET_VAN_SEATS.attendant : take(next),
    );
  }
  return seats;
}
/** Van-local route from a seat to the door sill: straight forward from the front row, via the aisle otherwise. */
function cabinPath(seat: VanSeat): Vec2[] {
  const [x, , z] = seat;
  if (x > 0 && z < 2) return [seatPoint(seat), [x, SPOT.doorLineZ], SPOT.sill];
  if (x < 0 && z < 1.2)
    return [seatPoint(seat), [x, SPOT.doorLineZ], SPOT.sill];
  return [
    seatPoint(seat),
    [SPOT.aisleX, z],
    [SPOT.aisleX, SPOT.doorLineZ],
    SPOT.sill,
  ];
}
/**
 * Where `sampleEscort` places an escort at the moment its partner sits down:
 * `gap` metres back along the partner's route (cabin walk, then the walk before it).
 */
function escortSwitchPoint(route: Vec2[], gap: number): Vec2 {
  let remaining = gap;
  for (let i = route.length - 1; i > 0; i--) {
    const a = route[i],
      b = route[i - 1],
      d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d >= remaining) {
      const f = remaining / (d || 1);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    remaining -= d;
  }
  return route[0];
}
/** Arc length along `path` to the point nearest `p`. */
function distanceAlongTo(path: Vec2[], p: Vec2) {
  let best = 0,
    bestD = Infinity,
    acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz) || 1e-9;
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (len * len)),
    );
    const d = Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
    if (d < bestD) {
      bestD = d;
      best = acc + len * t;
    }
    acc += len;
  }
  return best;
}
const cabinSpeed = (a: ActorSpec | undefined) =>
  a?.mobility === 'wheelchair' ? CABIN_ROLL : CABIN_WALK;
const cabinAction = (a: ActorSpec): Action =>
  a.mobility === 'wheelchair' ? 'roll' : 'walk';

/** Seat one rider (or escort) in its vans and add the cabin walks between seat and sill. */
function seatRider(
  actor: ActorSpec,
  seats: Map<string, Map<string, VanSeat>>,
  byId: Map<string, ActorSpec>,
): ActorSpec {
  const events = rideEvents(actor);
  if (!events.length) return actor;
  const partner = actor.escortFor ? byId.get(actor.escortFor) : undefined;
  const seatOf = (e: RideEvent, who: ActorSpec = actor) =>
    seats.get(e.vehicle)!.get(who.id)!;
  const worldSeat = (e: RideEvent, who: ActorSpec = actor) =>
    dockFrame(e.index).world(seatPoint(seatOf(e, who)));
  // The day must close on itself: a hidden ride at the start of the day may
  // carry the nominal path from where the previous day ended to this seat.
  const last = actor.segments.at(-1)!,
    lastEvent = events.find((e) => e.at === actor.segments.length - 1),
    dayEnd = lastEvent ? worldSeat(lastEvent) : last.path.at(-1)!;
  // A ride home on a van whose departure runs on past the end of the day
  // continues, seated and in view, until that van has faded out next morning.
  const homeBy = lastEvent?.boards
    ? outOfSightAfter(lastEvent.index, last.start) - LOOP
    : 0;
  if (homeBy > 0 && !events.some((e) => e.at === 0))
    throw new Error(
      `${actor.id}: rides home on ${lastEvent!.vehicle} past the end of the day but does not start the day riding`,
    );
  const out: Segment[] = [];
  actor.segments.forEach((s, i) => {
    const e = events.find((e) => e.at === i);
    if (!e) {
      out.push(s);
      return;
    }
    const frame = dockFrame(e.index),
      seat = seatOf(e),
      seatWorld = worldSeat(e),
      leave = cabinPath(seat).map(frame.world),
      enter = [...leave].reverse();
    const track = new Track(s.path[0], FLOOR, s.start);
    let rideStart = s.start,
      rideEnd = s.end;
    if (e.boards) {
      const own = length(enter) / cabinSpeed(actor),
        departure = departureAfter(e.index, s.start);
      if (partner) {
        // The escort's own walk is timed so that, when its partner sits and the
        // engine switches from following to the escort's own track, the two
        // positions nearly coincide; it must still be seated before departure.
        const partnerCabin = cabinPath(seatOf(e, partner)).map(frame.world);
        const route = [
          ...actor.segments[i - 1].path,
          ...[...partnerCabin].reverse().slice(1),
        ];
        const switchAt = s.start + length(partnerCabin) / cabinSpeed(partner);
        const ahead =
          distanceAlongTo(enter, escortSwitchPoint(route, escortGap(partner))) /
          cabinSpeed(actor);
        const startWalk = Math.max(
          s.start,
          Math.min(switchAt - ahead, departure - 0.3 - own),
        );
        track.stay(
          startWalk,
          'idle',
          'At the van door',
          facing(track.at, seatWorld),
          { vehicleId: e.vehicle },
        );
      }
      track.walk(
        enter.slice(1),
        track.t + own,
        'Into the cabin',
        FLOOR,
        cabinAction(actor),
        { vehicleId: e.vehicle },
      );
      if (track.t > departure - 0.2)
        throw new Error(
          `${actor.id}: still walking to the seat when ${e.vehicle} leaves at ${departure}`,
        );
      rideStart = track.t;
    }
    if (e.alights) {
      // Escorts stand up with their partner and, until the engine starts
      // following the partner, walk toward the partner's seat.
      const lead = partner ?? actor;
      rideEnd =
        s.end -
        length(cabinPath(seatOf(e, lead)).map(frame.world)) / cabinSpeed(lead);
    }
    // Seated in view only between the van setting off from where it was out
    // of sight (an arrival comes in from off site) and the van fading out at
    // the end of the street after its departure: riders are picked up and
    // dropped off out of view, and the engine hides them while the van fades.
    let from = i === 0 ? dayEnd : seatWorld;
    if (i === 0 && homeBy > 0) {
      track.ride(
        after(homeBy),
        lastEvent!.vehicle,
        seatOf(lastEvent!),
        dayEnd,
        'Riding home',
        true,
      );
      from = dayEnd;
    }
    const seated = e.alights ? arrivalStart(e.index, rideEnd) : rideStart;
    if (seated + 1e-6 < track.t)
      throw new Error(
        `${actor.id}: ${e.vehicle} sets off at ${seated} with its riders, before ${actor.id} can be aboard (${track.t})`,
      );
    const offSite = e.boards
      ? Math.min(rideEnd, after(outOfSightAfter(e.index, rideStart)))
      : rideEnd;
    if (seated > track.t)
      track.ride(
        seated,
        e.vehicle,
        seat,
        seatWorld,
        'Waiting at home for the van',
        false,
        from,
      );
    else if (!near(from, seatWorld, 0.001))
      throw new Error(
        `${actor.id}: the day would not close on itself (seat ${seatWorld.join(',')} vs ${from.join(',')})`,
      );
    track.ride(
      Math.min(offSite, rideEnd),
      e.vehicle,
      seat,
      seatWorld,
      e.boards ? 'Riding home' : 'Riding to Seen Health',
      true,
    );
    if (offSite < rideEnd)
      track.ride(
        rideEnd,
        e.vehicle,
        seat,
        seatWorld,
        'Dropped off at home',
        false,
      );
    if (e.alights) {
      const route = partner
        ? [
            worldSeat(e, partner),
            ...cabinPath(seatOf(e, partner)).map(frame.world).slice(1),
          ]
        : leave.slice(1);
      track.walk(route, s.end, 'To the van door', FLOOR, cabinAction(actor), {
        vehicleId: e.vehicle,
      });
    }
    out.push(...track.segments);
  });
  return { ...actor, segments: out };
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------
type RampUse = {
  rider: ActorSpec;
  start: number;
  end: number;
  path: Vec2[];
  /** Gap between the rider and the last member of its party (0 without an escort). */
  partyGap: number;
  /** A descent: the rider's pace on walking away from the ramp foot. */
  awayPace?: number;
};
/** Ramp descents ('Unload on van ramp') and ascents (last leg of the departure walk) on one van. */
function rampUses(
  index: number,
  actors: ActorSpec[],
  escorts: Map<string, ActorSpec>,
) {
  const vehicle = vanIds[index],
    { sill, foot } = dockFrame(index);
  const down: RampUse[] = [],
    up: RampUse[] = [];
  for (const a of actors) {
    if (a.escortFor || a.role === 'driver') continue;
    const partyGap = escorts.has(a.id) ? escortGap(a) : 0;
    a.segments.forEach((s, i) => {
      if (s.vehicleId !== vehicle || !['walk', 'roll'].includes(s.action))
        return;
      if (
        s.path.length === 2 &&
        near(s.path[0], sill) &&
        near(s.path[1], foot)
      ) {
        const away = a.segments[i + 1];
        down.push({
          rider: a,
          start: s.start,
          end: s.end,
          path: s.path,
          partyGap,
          awayPace:
            away && length(away.path) > 0
              ? length(away.path) / (away.end - away.start)
              : undefined,
        });
      } else if (
        s.path.length > 2 &&
        near(s.path.at(-1)!, sill) &&
        near(s.path.at(-2)!, foot)
      ) {
        const total = length(s.path),
          before = length(s.path.slice(0, -1));
        up.push({
          rider: a,
          start: s.start + ((s.end - s.start) * before) / total,
          end: s.end,
          path: [foot, sill],
          partyGap,
        });
      }
    });
  }
  down.sort((a, b) => a.start - b.start);
  up.sort((a, b) => a.start - b.start);
  return { down, up };
}
type RampUses = ReturnType<typeof rampUses>;
const rampHeight = (p: Vec2, sill: Vec2, foot: Vec2) => {
  const f =
    Math.hypot(p[0] - sill[0], p[1] - sill[1]) /
    Math.hypot(foot[0] - sill[0], foot[1] - sill[1]);
  return round(FLOOR + (GROUND - FLOOR) * Math.min(1, f));
};

/**
 * One driver's day from the van's timeline and the riders who use its ramp:
 * seated and visible while the van is on the road, seated and hidden with it
 * while it is off site (so a driver takes the wheel of an arrival out of
 * sight), on foot at the drop-off, and, for a van that parks on the lot
 * between runs, in the fleet office: out of sight indoors, walking out to the
 * van before it pulls out and back after it parks, so nobody appears in a
 * parked van.
 */
function driverDay(
  index: number,
  actors: ActorSpec[],
  escorts: Map<string, ActorSpec>,
  others: ActorSpec[],
): Segment[] {
  const vehicle = vanIds[index],
    seat = FLEET_VAN_SEATS.driver,
    spells = vanSpells(index);
  if (spells.every((s) => s.kind === 'parked')) {
    const bay = fleetParking[index];
    return new Track([bay.x, bay.z], FLOOR, 0).ride(
      LOOP,
      vehicle,
      seat,
      [bay.x, bay.z],
      'Spare van · no runs scheduled',
      false,
    ).segments;
  }
  const docks = !!alhambraVanWindows[index],
    parks = spells.some((s) => s.kind === 'parked');
  if (docks === parks)
    throw new Error(
      `withFleetCrew: ${vehicle} must either serve the drop-off or park on the lot between runs`,
    );
  if (
    parks &&
    (spells[0].kind !== 'parked' || spells.at(-1)!.kind !== 'parked')
  )
    throw new Error(
      `withFleetCrew: ${vehicle} must start and end the day parked, its driver in the fleet office`,
    );
  // Where the driver sits: the van's pose at the drop-off or in its own spot.
  const seatAt: Vec2 = (docks ? dockFrame(index).world : parkedWorld(index))(
    seatPoint(seat),
  );
  const track = docks
    ? new Track(seatAt, FLOOR, 0)
    : new Track(OFFICE.inside, LANDING_Y, 0);
  const ride = (until: number, title: string, visible: boolean) =>
    track.ride(until, vehicle, seat, seatAt, title, visible);
  const ramp = docks ? rampUses(index, actors, escorts) : { down: [], up: [] };
  spells.forEach((spell, k) => {
    if (spell.kind === 'docked') dockedDuty(track, index, spell, ramp);
    else if (spell.kind === 'trip')
      // A trip that ends off site ends out of sight: rounded down to the
      // millisecond (segment times are) so the driver is not drawn after it.
      ride(
        spell.trip === 'home' ? spell.end : Math.floor(spell.end * 1000) / 1000,
        'Driving the van',
        true,
      );
    else if (spell.kind === 'away')
      ride(spell.end, 'Off site · driving the route', false);
    else if (spell.kind === 'yielding')
      ride(spell.end, 'Waiting for the driveway', true);
    else {
      const next = spells[k + 1];
      parkedDuty(
        track,
        index,
        spell,
        spells[k - 1]?.trip === 'home',
        next?.kind === 'yielding' || next?.trip === 'out',
        others,
      );
    }
  });
  return track.segments;
}

/**
 * Whether a driver of van `index` who sets off along `route` at `start`
 * (walking at STAFF_WALK) keeps LOT_CLEARANCE from every other fleet van in
 * view and PEOPLE_CLEARANCE from everyone in `others` who is on foot and in
 * view, all the way.
 */
function walkClear(
  index: number,
  route: Vec2[],
  start: number,
  others: ActorSpec[],
  byId: Map<string, ActorSpec>,
) {
  const seconds = length(route) / STAFF_WALK;
  // Only people whose day comes near the route at all.
  const [x0, z0, x1, z1] = route.reduce(
    ([a, b, c, d], [x, z]) => [
      Math.min(a, x),
      Math.min(b, z),
      Math.max(c, x),
      Math.max(d, z),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const pad = PEOPLE_CLEARANCE + 2;
  const nearby = others.filter(
    (a) =>
      a.levelId !== 'upper' &&
      a.segments.some((s) =>
        s.path.some(
          ([x, z]) =>
            x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad,
        ),
      ),
  );
  for (let t = 0; t <= seconds + 0.1; t += 0.2) {
    const p = pointAlong(route, t * STAFF_WALK);
    for (const v of vanIds.keys()) {
      if (v === index) continue;
      const van = sampleVan(v, start + t);
      if (van.visible && vanDistance(van, p) < LOT_CLEARANCE) return false;
    }
    for (const a of nearby) {
      const partner = a.escortFor ? byId.get(a.escortFor) : undefined;
      let q = partner
        ? sampleEscort(partner, start + t)
        : sampleActor(a, start + t);
      if (partner && q.seat) q = sampleActor(a, start + t);
      if (
        q.visible !== false &&
        !q.seat &&
        Math.hypot(q.x - p[0], q.z - p[1]) < PEOPLE_CLEARANCE
      )
        return false;
    }
  }
  return true;
}

/**
 * A van parked on the lot: the driver gets out once it has parked (through
 * the driver's door, which FLEET_CAB_DOOR opens) and walks back to the fleet
 * office, and before the next run walks out to the van and gets in. Each walk
 * goes when it is clear of the other vans and of everyone on foot in `others`
 * (as late as possible going out, as early as possible coming back); the
 * driver waits by the van meanwhile.
 */
function parkedDuty(
  track: Track,
  index: number,
  spell: FleetSpell,
  alights: boolean,
  boards: boolean,
  others: ActorSpec[],
) {
  const byId = new Map(others.map((a) => [a.id, a]));
  const vehicle = vanIds[index],
    seat = FLEET_VAN_SEATS.driver,
    at = parkedWorld(index),
    toVan = OFFICE.toVan[vehicle];
  if (!toVan)
    throw new Error(
      `withFleetCrew: no walk from the fleet office to ${vehicle}`,
    );
  const P = {
    seat: at(seatPoint(seat)),
    doorway: at(SPOT.cabDoorway),
    outside: at(SPOT.cabOutside),
  };
  const outsideY = toVan.at(-1)!.y;
  const out = [...OFFICE.exit, ...toVan, { at: P.outside, y: outsideY }],
    back = [...out]
      .reverse()
      .slice(1)
      .concat({ at: OFFICE.inside, y: LANDING_Y });
  const outPath = [OFFICE.inside, ...out.map((p) => p.at)],
    backPath = [P.outside, ...back.map((p) => p.at)],
    seconds = length(outPath) / STAFF_WALK;
  const walk = (route: RoutePoint[], title: string) =>
    track.walkAt(
      route.map((p) => p.at),
      STAFF_WALK,
      title,
      route.at(-1)!.y,
      'walk',
      { heights: [track.y, ...route.map((p) => p.y)] },
    );
  const inside: Extra = { vehicleId: vehicle };
  const toOffice = facing(P.outside, P.doorway) + Math.PI;
  const { swing, exit, entry } = FLEET_CAB_DOOR;
  if (alights) {
    track.ride(
      spell.start + exit.open + 0.2,
      vehicle,
      seat,
      P.seat,
      'Opening the cab door',
      true,
    );
    track.walk(
      [P.doorway, P.outside],
      spell.start + exit.close - 0.7,
      'Out of the cab',
      outsideY,
      'walk',
      inside,
    );
    let setOff = track.t;
    while (!walkClear(index, backPath, setOff, others, byId)) {
      setOff += 0.5;
      if (setOff + seconds > spell.end)
        throw new Error(
          `withFleetCrew: no clear moment for ${vehicle}'s driver to cross the lot after ${spell.start}`,
        );
    }
    if (setOff > track.t)
      track.stay(setOff, 'idle', 'Post-trip check by the van', toOffice);
    walk(back, 'Back to the fleet office');
  }
  const departs = spell.end,
    doorOpen = departs + entry.open + swing;
  let leaves = boards ? departs + entry.open - DOOR_LEAD - seconds : spell.end;
  while (boards && !walkClear(index, outPath, leaves, others, byId)) {
    leaves -= 0.5;
    if (leaves < track.t)
      throw new Error(
        `withFleetCrew: no clear moment for ${vehicle}'s driver to cross the lot before ${departs}`,
      );
  }
  if (leaves < track.t)
    throw new Error(
      `withFleetCrew: ${vehicle}'s driver is not back in the fleet office before walking out to the van at ${round(leaves)}`,
    );
  track.stay(leaves, 'idle', 'In the fleet office', 0, { visible: false });
  if (!boards) return;
  walk(out, 'Out to the van');
  if (track.t < doorOpen - swing - DOOR_LEAD - 0.01)
    track.stay(
      doorOpen - swing - DOOR_LEAD,
      'idle',
      'Pre-trip check by the van',
      facing(P.outside, P.doorway),
    );
  track.stay(doorOpen, 'idle', 'At the cab door', facing(P.outside, P.doorway));
  track.walk(
    [P.doorway, P.seat],
    departs + entry.close,
    'Into the cab',
    FLOOR,
    'walk',
    inside,
  );
  track.ride(
    departs,
    vehicle,
    seat,
    P.seat,
    'In the cab, ready to leave',
    true,
  );
}

/** The docked choreography: out of the cab, ramp duty for each rider, back in before departure. */
function dockedDuty(
  track: Track,
  index: number,
  spell: FleetSpell,
  ramp: RampUses,
) {
  const frame = dockFrame(index),
    { window } = frame,
    vehicle = vanIds[index],
    seat = FLEET_VAN_SEATS.driver,
    at = (p: Vec2) => frame.world(p);
  const P = {
    seat: at(seatPoint(seat)),
    doorway: at(SPOT.cabDoorway),
    outside: at(SPOT.cabOutside),
    noseA: at(SPOT.noseDriverSide),
    noseB: at(SPOT.noseDoorSide),
    standby: at(SPOT.standby),
    foot: frame.foot,
    sill: frame.sill,
    topside: at(SPOT.topside),
    inside: at(SPOT.inside),
    stepIn: at(SPOT.stepIn),
  };
  const morning =
    window.unload[0] >= spell.start && window.unload[0] < spell.end;
  const service = morning ? window.unload : window.boarding;
  const uses = (morning ? ramp.down : ramp.up).filter(
    (u) => u.start >= spell.start && u.end <= spell.end,
  );
  const faceRamp = facing(P.standby, P.foot),
    faceSill = facing(P.foot, P.sill),
    faceOut = facing(P.foot, at([SPOT.foot[0], SPOT.foot[1] - 3]));
  const inside: Extra = { vehicleId: vehicle };
  // The driver's door (FLEET_CAB_DOOR) swings open as the van docks: out
  // through it and a step clear of its swing before it shuts, then around the
  // nose. Before departure it opens again for the way back in.
  const { swing, exit, entry } = FLEET_CAB_DOOR,
    departs = spell.end;
  track.ride(
    spell.start + exit.open + 0.2,
    vehicle,
    seat,
    P.seat,
    'Opening the cab door',
    true,
  );
  track.walk(
    [P.doorway, P.outside],
    spell.start + exit.close - 0.7,
    'Out of the cab',
    GROUND,
    'walk',
    inside,
  );
  track.walkAt(
    [P.noseA, P.noseB, P.standby],
    STAFF_WALK,
    'Around the nose to the ramp',
    GROUND,
  );
  const rampReady = service[0] + 2;
  if (morning) {
    const climb = length([P.foot, P.topside, P.stepIn, P.inside]);
    for (const [i, u] of uses.entries()) {
      const speedDown = length(u.path) / (u.end - u.start),
        lag = (u.partyGap + FOLLOW_GAP) / speedDown,
        deadline = u.start - 0.35,
        toFoot = i ? 0 : length([track.at, P.foot]) / STAFF_WALK;
      if (i) {
        // Hand the previous rider off for as long as the next climb allows.
        const spare = deadline - Math.max(track.t, rampReady) - climb / 1.9;
        if (spare > 0.3)
          track.stay(
            track.t + Math.min(2, spare),
            'greet',
            'Handoff at the ramp foot',
            faceOut,
          );
      } else {
        track.stay(
          Math.min(rampReady, deadline - climb / 1.9) - toFoot,
          'idle',
          'Ready beside the ramp',
          faceRamp,
        );
        track.walkAt([P.foot], STAFF_WALK, 'To the ramp foot', GROUND);
      }
      track.stay(rampReady, 'idle', 'Waiting for the ramp', faceSill);
      const climbSpeed = Math.min(
        1.9,
        Math.max(1.1, climb / Math.max(0.6, deadline - track.t)),
      );
      track.walk(
        [P.topside],
        track.t + length([P.foot, P.topside]) / climbSpeed,
        'Up the ramp ahead of the rider',
        rampHeight(P.topside, P.sill, P.foot),
      );
      track.walk(
        [P.stepIn, P.inside],
        track.t + length([P.topside, P.stepIn, P.inside]) / climbSpeed,
        'Step inside',
        FLOOR,
        'walk',
        inside,
      );
      track.stay(
        u.start + lag - 0.8,
        'idle',
        'Ready at the door',
        facing(P.inside, P.sill),
        inside,
      );
      track.walk(
        [P.sill],
        u.start + lag,
        'Out behind the rider',
        FLOOR,
        'walk',
        inside,
      );
      // Down at the party's pace; once the rider steps off at the foot the
      // party walks away at the rider's pace, and the driver keeps up.
      const behind = u.partyGap + FOLLOW_GAP,
        rampLength = length([P.sill, P.foot]),
        offPace = u.awayPace ?? speedDown;
      if (behind < rampLength && offPace !== speedDown) {
        const f = (rampLength - behind) / rampLength,
          last: Vec2 = [
            round(P.sill[0] + (P.foot[0] - P.sill[0]) * f),
            round(P.sill[1] + (P.foot[1] - P.sill[1]) * f),
          ];
        track.walk(
          [last],
          u.end,
          'Escorting down the ramp',
          rampHeight(last, P.sill, P.foot),
          'escort',
          inside,
        );
        track.walk(
          [P.foot],
          u.end + behind / offPace,
          'Escorting down the ramp',
          GROUND,
          'escort',
          inside,
        );
      } else
        track.walk(
          [P.foot],
          u.end + lag,
          'Escorting down the ramp',
          GROUND,
          'escort',
          inside,
        );
    }
    if (uses.length)
      track.stay(track.t + 1.5, 'greet', 'Handoff at the ramp foot', faceOut);
    track.walkAt([P.standby], STAFF_WALK, 'Back to the ramp hinge', GROUND);
    // The ramp folds up over [end − 2, end + 1]; once it is mostly stowed, head for the cab.
    track.stay(service[1], 'idle', 'Stowing the ramp', faceRamp);
  } else {
    let lastAboard = track.t;
    const cycle =
      FOLLOW_GAP / 0.6 + 1 + length([P.sill, P.foot, P.standby]) / STAFF_WALK;
    for (const [i, u] of uses.entries()) {
      const speedUp = length(u.path) / (u.end - u.start),
        lag = FOLLOW_GAP / speedUp,
        next = uses[i + 1];
      lastAboard = Math.max(lastAboard, u.end + u.partyGap / speedUp);
      const canFollow =
        u.partyGap === 0 &&
        (!next || next.start >= u.end + cycle) &&
        track.t <= u.start - 1;
      if (!canFollow) {
        // Steady the rider from beside the ramp foot.
        track.stay(u.start - 1, 'idle', 'Ready beside the ramp', faceRamp);
        track.stay(
          Math.min(u.end, track.t + 3),
          'greet',
          'Steadying the rider onto the ramp',
          faceRamp,
        );
        continue;
      }
      track.stay(
        u.start + lag - length([P.standby, P.foot]) / STAFF_WALK,
        'idle',
        'Ready beside the ramp',
        faceRamp,
      );
      track.walk(
        [P.foot],
        u.start + lag,
        'Behind the rider to the ramp',
        GROUND,
      );
      const stop: Vec2 = [
        round(P.sill[0] + (P.foot[0] - P.sill[0]) * 0.17),
        round(P.sill[1] + (P.foot[1] - P.sill[1]) * 0.17),
      ];
      track.walk(
        [stop],
        u.end + lag - 0.49 / speedUp,
        'Escorting up the ramp',
        rampHeight(stop, P.sill, P.foot),
        'escort',
        inside,
      );
      track.stay(
        track.t + 1,
        'idle',
        'Rider aboard',
        facing(stop, P.sill),
        inside,
      );
      track.walkAt(
        [P.foot, P.standby],
        STAFF_WALK,
        'Back beside the ramp',
        GROUND,
      );
    }
    const latest =
      departs +
      entry.open +
      swing -
      length([P.standby, P.noseB, P.noseA, P.outside]) / STAFF_WALK -
      0.2;
    track.stay(
      Math.min(lastAboard + 0.4, latest),
      'idle',
      'Doors clear',
      faceRamp,
    );
  }
  // Around the nose to the driver's door, in once it is open, seated before it shuts.
  track.walkAt(
    [P.noseB, P.noseA, P.outside],
    STAFF_WALK,
    'Around the nose to the cab',
    GROUND,
  );
  const doorOpen = departs + entry.open + swing;
  if (track.t > doorOpen)
    throw new Error(
      `${vehicle}: the driver reaches the cab door ${round(track.t - doorOpen)} s after it opens`,
    );
  track.stay(doorOpen, 'idle', 'At the cab door', facing(P.outside, P.doorway));
  track.walk(
    [P.doorway, P.seat],
    departs + entry.close,
    'Into the cab',
    FLOOR,
    'walk',
    inside,
  );
  track.ride(
    departs,
    vehicle,
    seat,
    P.seat,
    'In the cab, ready to leave',
    true,
  );
}

// ---------------------------------------------------------------------------
// Mid-day riders for vans that arrive without actors of their own
// ---------------------------------------------------------------------------
type Leg = { path: Vec2[]; heights: number[] };
/**
 * The base loop's walking arrival (`arrival-walker`): its approach round the
 * docked van's nose, the switchback ramp, the sliding entrance, the walk to
 * reception and its afternoon walk back to the van are the routes the mid-day
 * riders share, so that a change to the drop-off, entrance or lobby reaches
 * them too.
 */
function entranceRoute(data: ActivityData) {
  const walker = data.actors.find((a) => a.id === 'arrival-walker');
  const leg = (title: string): Leg & { vehicleId?: string } => {
    const s = walker?.segments.find((x) => x.title === title);
    if (!s)
      throw new Error(
        `withFleetCrew: arrival-walker has no "${title}" segment to share`,
      );
    return {
      path: s.path,
      heights: s.heights ?? s.path.map(() => 0),
      vehicleId: s.vehicleId,
    };
  };
  const tail = (l: Leg, from = 1): Leg => ({
    path: l.path.slice(from),
    heights: l.heights.slice(from),
  });
  const approach = leg('Meet escort · approach ramp'),
    reception = leg('Walk to reception'),
    departure = leg('Escorted departure · board van');
  const desk = reception.path.at(-1)!,
    queue: Vec2 = [
      round(desk[0] + QUEUE_OFFSET[0]),
      round(desk[1] + QUEUE_OFFSET[1]),
    ];
  // The reception walk as far as its point nearest the queue spot, then the step to it.
  const turn = nearestIndex(reception.path, queue);
  // The walker's own van: its departure ends at that van's ramp foot and sill.
  const walkerVan = vanIndex(departure.vehicleId ?? '');
  if (walkerVan < 0)
    throw new Error('withFleetCrew: arrival-walker does not board a fleet van');
  const footAt = departure.path.findIndex((p) =>
    near(p, dockFrame(walkerVan).foot),
  );
  return {
    /** From the van's ramp foot round its nose to the foot of the switchback ramp. */
    approach: tail(approach),
    ramp: tail(leg('Up the wheelchair ramp')),
    entrance: tail(leg('Turn right · sliding entrance')),
    lobby: {
      path: [...reception.path.slice(1, turn + 1), queue],
      heights: [...reception.heights.slice(1, turn + 1), 0],
    },
    queue,
    rejoin: reception.path[turn],
    desk,
    /** The walk out, joined at its point nearest `from`, up to (not including) the ramp foot. */
    exit(from: Vec2): Leg {
      const join = nearestIndex(departure.path.slice(0, footAt), from);
      return {
        path: departure.path.slice(join, footAt),
        heights: departure.heights.slice(join, footAt),
      };
    },
  };
}
type EntranceRoute = ReturnType<typeof entranceRoute>;
const nearestIndex = (path: Vec2[], p: Vec2) =>
  path.reduce(
    (best, q, i) =>
      Math.hypot(q[0] - p[0], q[1] - p[1]) <
      Math.hypot(path[best][0] - p[0], path[best][1] - p[1])
        ? i
        : best,
    0,
  );
function middayRider(
  spec: (typeof MIDDAY_RIDERS)[number],
  order: number,
  onVan: number,
  onHome: number,
  route: EntranceRoute,
): ActorSpec {
  const frame = dockFrame(vanIndex(spec.van)),
    homeFrame = dockFrame(vanIndex(spec.home));
  // Ramp descents start four seconds after the ramp is down, as the base
  // loop's, and nineteen seconds apart (a descent, the driver's handoff and
  // the climb back up for the next rider), so the last rider is past the van's
  // nose before the driver walks round it to the cab.
  const r0 = frame.window.unload[0] + 4 + onVan * 19;
  // Board the afternoon van between its own riders, three seconds apart, arriving at the sill.
  const boardingEnd = homeFrame.window.boarding[0] + 28 + onHome * 3;
  // Out in single file with the van's own riders, at their escorted pace.
  const speed = 0.64;
  const track = new Track(frame.sill, FLOOR, 0);
  const withHeights = (l: Leg) => ({ heights: [track.y, ...l.heights] });
  const onVanRoute = { vehicleId: spec.van };
  // Placeholder rides at the sill; seatRider assigns the seat, cabin walks and visibility.
  track.ride(
    r0,
    spec.van,
    FLEET_VAN_SEATS.benches[0],
    frame.sill,
    'Riding to Seen Health',
    true,
  );
  track.walk(
    [frame.foot],
    r0 + 12,
    'Unload on van ramp',
    GROUND,
    'walk',
    onVanRoute,
  );
  // From the van's ramp foot to just inside the sliding entrance at one pace:
  // round the van's nose to the switchback, up it and in.
  const indoors = r0 + 47,
    legs = [route.approach, route.ramp, route.entrance],
    lengths = legs.map((l, i) =>
      length([i ? legs[i - 1].path.at(-1)! : frame.foot, ...l.path]),
    ),
    pace = lengths.reduce((a, b) => a + b) / (indoors - track.t);
  track.walk(
    route.approach.path,
    track.t + lengths[0] / pace,
    'Meet escort · approach ramp',
    GROUND,
    'walk',
    { ...onVanRoute, ...withHeights(route.approach) },
  );
  track.walk(
    route.ramp.path,
    track.t + lengths[1] / pace,
    'Up the wheelchair ramp',
    0,
    'walk',
    { ...onVanRoute, ...withHeights(route.ramp) },
  );
  track.walk(
    route.entrance.path,
    indoors,
    'Turn right · sliding entrance',
    0,
    'walk',
    { ...onVanRoute, zoneId: 'lobby', ...withHeights(route.entrance) },
  );
  track.walkAt(route.lobby.path, 0.77, 'Walk to reception', 0, 'walk', {
    zoneId: 'lobby',
    ...withHeights(route.lobby),
  });
  track.stay(
    track.t + 12,
    'greet',
    'Check in behind the front desk queue',
    facing(route.queue, route.desk),
    { zoneId: 'lobby' },
  );
  track.walkAt(
    [route.rejoin, spec.waitAt],
    0.77,
    'Find a place to wait',
    0,
    'walk',
    { zoneId: 'lobby' },
  );
  const exit = route.exit(spec.waitAt);
  const departure: Vec2[] = [...exit.path, homeFrame.foot, homeFrame.sill];
  const departAt = boardingEnd - length([spec.waitAt, ...departure]) / speed;
  track.stay(
    departAt,
    'idle',
    'Await confirmed pickup',
    facing(spec.waitAt, route.queue),
    { zoneId: 'lobby' },
  );
  track.walk(
    departure,
    boardingEnd,
    'Escorted departure · board van',
    FLOOR,
    'walk',
    {
      vehicleId: spec.home,
      zoneId: 'lobby',
      heights: [track.y, ...exit.heights, GROUND, FLOOR],
    },
  );
  track.ride(
    LOOP,
    spec.home,
    FLEET_VAN_SEATS.benches[0],
    homeFrame.sill,
    'Riding home',
    true,
  );
  return {
    id: `arrival-midday-${fleetVanLetter(vanIndex(spec.van)).toLowerCase()}-${order + 1}`,
    label: `${spec.name} · half-day`,
    role: 'participant',
    variant: spec.variant,
    mobility: spec.mobility,
    levelId: 'ground',
    offset: 0,
    segments: track.segments,
  };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------
const isFleetDriverId = (id: string) => /^driver-\d+$/.test(id);
/** Base loop or story source with seated riders, a driver for every van and the mid-day riders. Pure. */
export function withFleetCrew(data: ActivityData): ActivityData {
  if (data.actors.some((a) => a.id === `driver-${vanIds.length}`)) return data;
  const existing = new Map(data.actors.map((a) => [a.id, a]));
  // Mid-day riders, unless the source already carries riders for those vans.
  const midday: ActorSpec[] = [],
    perVan = new Map<string, number>(),
    perHome = new Map<string, number>();
  let route: EntranceRoute | undefined;
  MIDDAY_RIDERS.forEach((spec, order) => {
    if (
      data.actors.some((a) => rideEvents(a).some((e) => e.vehicle === spec.van))
    )
      return;
    const onVan = perVan.get(spec.van) ?? 0,
      onHome = perHome.get(spec.home) ?? 0;
    perVan.set(spec.van, onVan + 1);
    perHome.set(spec.home, onHome + 1);
    route ??= entranceRoute(data);
    midday.push(middayRider(spec, order, onVan, onHome, route));
  });
  const actors = [
    ...data.actors.filter((a) => !isFleetDriverId(a.id)),
    ...midday,
  ];
  const byId = new Map(actors.map((a) => [a.id, a]));
  const escorts = new Map<string, ActorSpec>();
  for (const a of actors)
    if (a.escortFor && byId.has(a.escortFor)) escorts.set(a.escortFor, a);
  // Seats per van, from the order in which riders reach the ramp.
  const seatsByVan = new Map<string, Map<string, VanSeat>>();
  vanIds.forEach((id, index) => {
    if (!alhambraVanWindows[index]) return;
    const riders = actors
      .flatMap((a) => rideEvents(a))
      .filter((e) => e.vehicle === id && !e.actor.escortFor);
    const rampTime = (e: RideEvent) =>
      e.actor.segments[e.at + (e.alights ? 1 : -1)]?.start ?? 0;
    riders.sort((a, b) => rampTime(a) - rampTime(b));
    seatsByVan.set(id, assignSeats(riders, escorts));
  });
  const seated = actors.map((a) => seatRider(a, seatsByVan, byId));
  // Drivers in van order: each one's walks to a parked van keep clear of everyone placed before.
  const drivers: ActorSpec[] = [];
  vanIds.forEach((_, index) => {
    const id = `driver-${index + 1}`,
      base = existing.get(id);
    drivers.push({
      id,
      label: base?.label ?? `Driver · ${DRIVER_NAMES[index]}`,
      role: 'driver',
      variant: base?.variant ?? index,
      profileId: base?.profileId,
      levelId: 'site',
      offset: 0,
      segments: driverDay(index, seated, escorts, [...seated, ...drivers]),
    });
  });
  const interactions: Interaction[] = midday.map((rider) => {
    const van = rider.segments.find((s) => s.title === 'Unload on van ramp')!,
      checkin = rider.segments.find((s) => s.title === 'Walk to reception')!;
    return {
      id: `${rider.id}-arrival`,
      label: `${rider.label} · arrival`,
      category: 'arrivals',
      actorIds: [rider.id, drivers[vanIndex(van.vehicleId!)].id],
      start: van.start,
      end: checkin.end,
      zoneId: 'site',
      description:
        'Mid-day van: ramp unload with the driver, accessible approach and check-in.',
    };
  });
  return {
    ...data,
    actors: [...seated, ...drivers],
    interactions: [...data.interactions, ...interactions],
  };
}
