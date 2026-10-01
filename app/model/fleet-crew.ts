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
import {
  FLEET_CAB_DOOR,
  fleetParking,
  fleetTimeline,
  type FleetSpell,
} from './alhambra-fleet';
import {
  FLEET_VAN_CAB_DOOR,
  FLEET_VAN_RAMP,
  FLEET_VAN_SEATS,
  type VanSeat,
} from './photo-assets';
import type { ActivityData, ActorSpec, Interaction, Segment } from './activity';
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
const DRIVER_NAMES = ['Casey', 'Taylor', 'Robin', 'Dana', 'Jamie', 'Kai', 'Priya', 'Wen'];
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
  { van: 'van-c', home: 'van-a', name: 'Mei', variant: 14, mobility: 'cane', waitAt: [-12.9, -1.55] },
  { van: 'van-c', home: 'van-a', name: 'Rafael', variant: 15, waitAt: [-12.2, -1.55] },
  { van: 'van-d', home: 'van-b', name: 'Dolores', variant: 16, mobility: 'walker', waitAt: [-11.5, -1.5] },
  { van: 'van-d', home: 'van-b', name: 'Minh', variant: 17, waitAt: [-13.6, -1.6] },
];
/** Mid-day riders check in a step behind and beside the front-desk spot, leaving it to the morning arrival waiting there. */
const QUEUE_OFFSET: Vec2 = [-0.9, 0.7];

const vanIds = fleetParking.map((_, i) => `van-${String.fromCharCode(97 + i)}`);
const vanIndex = (id: string) => vanIds.indexOf(id);
const near = (a: Vec2, b: Vec2, tolerance = 0.05) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
const length = (path: Vec2[]) =>
  path.reduce(
    (s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0),
    0,
  );
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Docked pose of a van and helpers to place van-local points in the world. */
function dockFrame(index: number) {
  const window = alhambraVanWindows[index];
  const pose = sampleVan(index, window.unload[0]);
  const c = Math.cos(pose.heading),
    s = Math.sin(pose.heading);
  const world = ([x, z]: Vec2): Vec2 => [
    round(pose.position.x + x * c + z * s),
    round(pose.position.z - x * s + z * c),
  ];
  return { window, pose, world, sill: world(SPOT.sill), foot: world(SPOT.foot) };
}
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
const facing = (from: Vec2, to: Vec2) => Math.atan2(to[0] - from[0], to[1] - from[1]);
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
    return this.walk(points, this.t + length([this.at, ...points]) / speed, title, toY, action, extra);
  }
  stay(until: number, action: Action, title: string, heading: number, extra: Extra = {}) {
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
      segment(this.t, until, 'ride', [from, [seatWorld[0], seatWorld[1] + detour], seatWorld], {
        heights: [FLOOR, FLOOR, FLOOR],
        heading: 0,
        title,
        visible,
        vehicleId,
        seat,
        seatHeading: Math.PI,
      }),
    );
    this.y = FLOOR;
    return this;
  }
}

// ---------------------------------------------------------------------------
// Van timetable helpers
// ---------------------------------------------------------------------------
/** When the van last left its bay before `t` (0 when it was already under way at the start of the day). */
function tripStartBefore(index: number, t: number) {
  for (let s = t; s > 0; s -= 0.25)
    if (sampleVan(index, s).phase.startsWith('Parked')) return round(Math.min(t, s + 0.25));
  return 0;
}
/** When the van docked around `t` leaves again. */
function departureAfter(index: number, t: number) {
  const spell = vanSpells(index).find((s) => s.kind === 'docked' && t >= s.start - 1e-6 && t <= s.end);
  return spell ? spell.end : LOOP;
}
/** First moment at or after `t` when the van is off site (invisible), or the end of the day. */
function hiddenAfter(index: number, t: number) {
  for (let s = t; s < LOOP; s += 0.25) if (!sampleVan(index, s).visible) return round(s);
  return LOOP;
}
/** The van's day as the fleet plans it: trips, docked spells and waits (off site, in its bay or for the driveway). */
const vanSpells = (index: number): FleetSpell[] =>
  fleetTimeline(index, alhambraVanWindows);

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
  const riders = [...new Map(events.map((e) => [e.actor.id, e.actor])).values()];
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
    seats.set(rider.id, next === undefined ? FLEET_VAN_SEATS.attendant : take(next));
  }
  return seats;
}
/** Van-local route from a seat to the door sill: straight forward from the front row, via the aisle otherwise. */
function cabinPath(seat: VanSeat): Vec2[] {
  const [x, , z] = seat;
  if (x > 0 && z < 2) return [seatPoint(seat), [x, SPOT.doorLineZ], SPOT.sill];
  if (x < 0 && z < 1.2) return [seatPoint(seat), [x, SPOT.doorLineZ], SPOT.sill];
  return [seatPoint(seat), [SPOT.aisleX, z], [SPOT.aisleX, SPOT.doorLineZ], SPOT.sill];
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
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (len * len)));
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
const cabinAction = (a: ActorSpec): Action => (a.mobility === 'wheelchair' ? 'roll' : 'walk');

/** Seat one rider (or escort) in its vans and add the cabin walks between seat and sill. */
function seatRider(
  actor: ActorSpec,
  seats: Map<string, Map<string, VanSeat>>,
  byId: Map<string, ActorSpec>,
): ActorSpec {
  const events = rideEvents(actor);
  if (!events.length) return actor;
  const partner = actor.escortFor ? byId.get(actor.escortFor) : undefined;
  const seatOf = (e: RideEvent, who: ActorSpec = actor) => seats.get(e.vehicle)!.get(who.id)!;
  const worldSeat = (e: RideEvent, who: ActorSpec = actor) =>
    dockFrame(e.index).world(seatPoint(seatOf(e, who)));
  // The day must close on itself: a hidden ride at the start of the day may
  // carry the nominal path from where the previous day ended to this seat.
  const last = actor.segments.at(-1)!,
    lastEvent = events.find((e) => e.at === actor.segments.length - 1),
    dayEnd = lastEvent ? worldSeat(lastEvent) : last.path.at(-1)!;
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
        const route = [...actor.segments[i - 1].path, ...[...partnerCabin].reverse().slice(1)];
        const switchAt = s.start + length(partnerCabin) / cabinSpeed(partner);
        const ahead = distanceAlongTo(enter, escortSwitchPoint(route, escortGap(partner))) / cabinSpeed(actor);
        const startWalk = Math.max(s.start, Math.min(switchAt - ahead, departure - 0.3 - own));
        track.stay(startWalk, 'idle', 'At the van door', facing(track.at, seatWorld), { vehicleId: e.vehicle });
      }
      track.walk(enter.slice(1), track.t + own, 'Into the cabin', FLOOR, cabinAction(actor), { vehicleId: e.vehicle });
      if (track.t > departure - 0.2)
        throw new Error(`${actor.id}: still walking to the seat when ${e.vehicle} leaves at ${departure}`);
      rideStart = track.t;
    }
    if (e.alights) {
      // Escorts stand up with their partner and, until the engine starts
      // following the partner, walk toward the partner's seat.
      const lead = partner ?? actor;
      rideEnd = s.end - length(cabinPath(seatOf(e, lead)).map(frame.world)) / cabinSpeed(lead);
    }
    // Hidden while the van is still parked in its bay or already off site;
    // seated and visible while it is on the road or docked.
    const tripStart = e.alights ? Math.max(rideStart, tripStartBefore(e.index, rideEnd)) : rideStart;
    const offSite = e.boards ? Math.min(rideEnd, hiddenAfter(e.index, rideStart)) : rideEnd;
    if (tripStart > rideStart)
      track.ride(tripStart, e.vehicle, seat, seatWorld, 'Waiting at home for the van', false, i === 0 ? dayEnd : seatWorld);
    else if (i === 0 && !near(dayEnd, seatWorld, 0.001))
      throw new Error(`${actor.id}: the day would not close on itself (seat ${seatWorld.join(',')} vs ${dayEnd.join(',')})`);
    track.ride(Math.min(offSite, rideEnd), e.vehicle, seat, seatWorld, e.boards ? 'Riding home' : 'Riding to Seen Health', true);
    if (offSite < rideEnd) track.ride(rideEnd, e.vehicle, seat, seatWorld, 'Dropped off at home', false);
    if (e.alights) {
      const route = partner
        ? [worldSeat(e, partner), ...cabinPath(seatOf(e, partner)).map(frame.world).slice(1)]
        : leave.slice(1);
      track.walk(route, s.end, 'To the van door', FLOOR, cabinAction(actor), { vehicleId: e.vehicle });
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
};
/** Ramp descents ('Unload on van ramp') and ascents (last leg of the departure walk) on one van. */
function rampUses(index: number, actors: ActorSpec[], escorts: Map<string, ActorSpec>) {
  const vehicle = vanIds[index],
    { sill, foot } = dockFrame(index);
  const down: RampUse[] = [],
    up: RampUse[] = [];
  for (const a of actors) {
    if (a.escortFor || a.role === 'driver') continue;
    const partyGap = escorts.has(a.id) ? escortGap(a) : 0;
    for (const s of a.segments) {
      if (s.vehicleId !== vehicle || !['walk', 'roll'].includes(s.action)) continue;
      if (s.path.length === 2 && near(s.path[0], sill) && near(s.path[1], foot))
        down.push({ rider: a, start: s.start, end: s.end, path: s.path, partyGap });
      else if (s.path.length > 2 && near(s.path.at(-1)!, sill) && near(s.path.at(-2)!, foot)) {
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
    }
  }
  down.sort((a, b) => a.start - b.start);
  up.sort((a, b) => a.start - b.start);
  return { down, up };
}
type RampUses = ReturnType<typeof rampUses>;
const rampHeight = (p: Vec2, sill: Vec2, foot: Vec2) => {
  const f = Math.hypot(p[0] - sill[0], p[1] - sill[1]) / Math.hypot(foot[0] - sill[0], foot[1] - sill[1]);
  return round(FLOOR + (GROUND - FLOOR) * Math.min(1, f));
};

/**
 * One driver's day from the van's timeline and the riders who use its ramp:
 * seated and visible whenever the van is under way or waiting to go, seated
 * and hidden with it while it is off site, in the fleet office while it is
 * parked, and on foot at the drop-off.
 */
function driverDay(index: number, actors: ActorSpec[], escorts: Map<string, ActorSpec>): Segment[] {
  const vehicle = vanIds[index],
    seat = FLEET_VAN_SEATS.driver,
    bay = fleetParking[index],
    spells = vanSpells(index);
  const parkedSeat: Vec2 = alhambraVanWindows[index]
    ? dockFrame(index).world(seatPoint(seat))
    : [bay.x, bay.z];
  const track = new Track(parkedSeat, FLOOR, 0);
  const ride = (until: number, title: string, visible: boolean) =>
    track.ride(until, vehicle, seat, parkedSeat, title, visible);
  if (spells.every((s) => s.kind === 'parked'))
    return ride(LOOP, 'Spare van · no runs scheduled', false).segments;
  const ramp = alhambraVanWindows[index] ? rampUses(index, actors, escorts) : { down: [], up: [] };
  for (const spell of spells) {
    if (spell.kind === 'docked') dockedDuty(track, index, spell, ramp);
    // Rounded down to the millisecond (segment times are), so the driver is never seen in the van once it is parked.
    else if (spell.kind === 'trip') ride(Math.floor(spell.end * 1000) / 1000, 'Driving the van', true);
    else if (spell.kind === 'yielding') ride(spell.end, 'Waiting for the driveway', true);
    else if (spell.kind === 'away') ride(spell.end, 'Off site · driving the route', false);
    else ride(spell.end, 'Off the road · fleet office', false);
  }
  return track.segments;
}

/** The docked choreography: out of the cab, ramp duty for each rider, back in before departure. */
function dockedDuty(track: Track, index: number, spell: FleetSpell, ramp: RampUses) {
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
  };
  const morning = window.unload[0] >= spell.start && window.unload[0] < spell.end;
  const service = morning ? window.unload : window.boarding;
  const uses = (morning ? ramp.down : ramp.up).filter((u) => u.start >= spell.start && u.end <= spell.end);
  const faceRamp = facing(P.standby, P.foot),
    faceSill = facing(P.foot, P.sill),
    faceOut = facing(P.foot, at([SPOT.foot[0], SPOT.foot[1] - 3]));
  const inside: Extra = { vehicleId: vehicle };
  // The driver's door (FLEET_CAB_DOOR) swings open as the van docks: out
  // through it and a step clear of its swing before it shuts, then around the
  // nose. Before departure it opens again for the way back in.
  const { swing, exit, entry } = FLEET_CAB_DOOR,
    departs = spell.end;
  track.ride(spell.start + exit.open + 0.2, vehicle, seat, P.seat, 'Opening the cab door', true);
  track.walk([P.doorway, P.outside], spell.start + exit.close - 0.7, 'Out of the cab', GROUND, 'walk', inside);
  track.walkAt([P.noseA, P.noseB, P.standby], STAFF_WALK, 'Around the nose to the ramp', GROUND);
  const rampReady = service[0] + 2;
  if (morning) {
    const climb = length([P.foot, P.topside, P.inside]);
    for (const [i, u] of uses.entries()) {
      const speedDown = length(u.path) / (u.end - u.start),
        lag = (u.partyGap + FOLLOW_GAP) / speedDown,
        deadline = u.start - 0.35,
        toFoot = i ? 0 : length([track.at, P.foot]) / STAFF_WALK;
      if (i) {
        // Hand the previous rider off for as long as the next climb allows.
        const spare = deadline - Math.max(track.t, rampReady) - climb / 1.9;
        if (spare > 0.3) track.stay(track.t + Math.min(2, spare), 'greet', 'Handoff at the ramp foot', faceOut);
      } else {
        track.stay(Math.min(rampReady, deadline - climb / 1.9) - toFoot, 'idle', 'Ready beside the ramp', faceRamp);
        track.walkAt([P.foot], STAFF_WALK, 'To the ramp foot', GROUND);
      }
      track.stay(rampReady, 'idle', 'Waiting for the ramp', faceSill);
      const climbSpeed = Math.min(1.9, Math.max(1.1, climb / Math.max(0.6, deadline - track.t)));
      track.walk([P.topside], track.t + length([P.foot, P.topside]) / climbSpeed, 'Up the ramp ahead of the rider', rampHeight(P.topside, P.sill, P.foot));
      track.walk([P.inside], track.t + length([P.topside, P.inside]) / climbSpeed, 'Step inside', FLOOR, 'walk', inside);
      track.stay(u.start + lag - 0.8, 'idle', 'Ready at the door', facing(P.inside, P.sill), inside);
      track.walk([P.sill], u.start + lag, 'Out behind the rider', FLOOR, 'walk', inside);
      track.walk([P.foot], u.end + lag, 'Escorting down the ramp', GROUND, 'escort', inside);
    }
    if (uses.length) track.stay(track.t + 1.5, 'greet', 'Handoff at the ramp foot', faceOut);
    track.walkAt([P.standby], STAFF_WALK, 'Back to the ramp hinge', GROUND);
    // The ramp folds up over [end − 2, end + 1]; once it is mostly stowed, head for the cab.
    track.stay(service[1], 'idle', 'Stowing the ramp', faceRamp);
  } else {
    let lastAboard = track.t;
    const cycle = FOLLOW_GAP / 0.6 + 1 + length([P.sill, P.foot, P.standby]) / STAFF_WALK;
    for (const [i, u] of uses.entries()) {
      const speedUp = length(u.path) / (u.end - u.start),
        lag = FOLLOW_GAP / speedUp,
        next = uses[i + 1];
      lastAboard = Math.max(lastAboard, u.end + u.partyGap / speedUp);
      const canFollow = u.partyGap === 0 && (!next || next.start >= u.end + cycle) && track.t <= u.start - 1;
      if (!canFollow) {
        // Steady the rider from beside the ramp foot.
        track.stay(u.start - 1, 'idle', 'Ready beside the ramp', faceRamp);
        track.stay(Math.min(u.end, track.t + 3), 'greet', 'Steadying the rider onto the ramp', faceRamp);
        continue;
      }
      track.stay(u.start + lag - length([P.standby, P.foot]) / STAFF_WALK, 'idle', 'Ready beside the ramp', faceRamp);
      track.walk([P.foot], u.start + lag, 'Behind the rider to the ramp', GROUND);
      const stop: Vec2 = [
        round(P.sill[0] + (P.foot[0] - P.sill[0]) * 0.17),
        round(P.sill[1] + (P.foot[1] - P.sill[1]) * 0.17),
      ];
      track.walk([stop], u.end + lag - 0.49 / speedUp, 'Escorting up the ramp', rampHeight(stop, P.sill, P.foot), 'escort', inside);
      track.stay(track.t + 1, 'idle', 'Rider aboard', facing(stop, P.sill), inside);
      track.walkAt([P.foot, P.standby], STAFF_WALK, 'Back beside the ramp', GROUND);
    }
    const latest = departs + entry.open + swing - length([P.standby, P.noseB, P.noseA, P.outside]) / STAFF_WALK - 0.2;
    track.stay(Math.min(lastAboard + 0.4, latest), 'idle', 'Doors clear', faceRamp);
  }
  // Around the nose to the driver's door, in once it is open, seated before it shuts.
  track.walkAt([P.noseB, P.noseA, P.outside], STAFF_WALK, 'Around the nose to the cab', GROUND);
  const doorOpen = departs + entry.open + swing;
  if (track.t > doorOpen)
    throw new Error(`${vehicle}: the driver reaches the cab door ${round(track.t - doorOpen)} s after it opens`);
  track.stay(doorOpen, 'idle', 'At the cab door', facing(P.outside, P.doorway));
  track.walk([P.doorway, P.seat], departs + entry.close, 'Into the cab', FLOOR, 'walk', inside);
  track.ride(departs, vehicle, seat, P.seat, 'In the cab, ready to leave', true);
}

// ---------------------------------------------------------------------------
// Mid-day riders for vans that arrive without actors of their own
// ---------------------------------------------------------------------------
type Leg = { path: Vec2[]; heights: number[] };
/**
 * The base loop's walking arrival (`arrival-walker`): its approach along the
 * sidewalk, the wheelchair ramp, the sliding entrance, the walk to reception
 * and its afternoon walk back to the van are the routes the mid-day riders
 * share, so that a change to the entrance or lobby reaches them too.
 */
function entranceRoute(data: ActivityData) {
  const walker = data.actors.find((a) => a.id === 'arrival-walker');
  const leg = (title: string): Leg & { vehicleId?: string } => {
    const s = walker?.segments.find((x) => x.title === title);
    if (!s) throw new Error(`withFleetCrew: arrival-walker has no "${title}" segment to share`);
    return { path: s.path, heights: s.heights ?? s.path.map(() => 0), vehicleId: s.vehicleId };
  };
  const tail = (l: Leg, from = 1): Leg => ({ path: l.path.slice(from), heights: l.heights.slice(from) });
  const approach = leg('Meet escort · approach ramp'),
    reception = leg('Walk to reception'),
    departure = leg('Escorted departure · board van');
  const desk = reception.path.at(-1)!,
    queue: Vec2 = [round(desk[0] + QUEUE_OFFSET[0]), round(desk[1] + QUEUE_OFFSET[1])];
  // The reception walk as far as its point nearest the queue spot, then the step to it.
  const turn = nearestIndex(reception.path, queue);
  // The walker's own van: its departure ends at that van's ramp foot and sill.
  const walkerVan = vanIndex(departure.vehicleId ?? '');
  if (walkerVan < 0) throw new Error('withFleetCrew: arrival-walker does not board a fleet van');
  const footAt = departure.path.findIndex((p) => near(p, dockFrame(walkerVan).foot));
  return {
    /** From the ramp foot along the sidewalk to the foot of the entrance ramp. */
    approach: tail(approach),
    ramp: tail(leg('Up the wheelchair ramp')),
    entrance: tail(leg('Turn right · sliding entrance')),
    lobby: { path: [...reception.path.slice(1, turn + 1), queue], heights: [...reception.heights.slice(1, turn + 1), 0] },
    queue,
    rejoin: reception.path[turn],
    desk,
    /** The walk out, joined at its point nearest `from`, up to (not including) the ramp foot. */
    exit(from: Vec2): Leg {
      const join = nearestIndex(departure.path.slice(0, footAt), from);
      return { path: departure.path.slice(join, footAt), heights: departure.heights.slice(join, footAt) };
    },
  };
}
type EntranceRoute = ReturnType<typeof entranceRoute>;
const nearestIndex = (path: Vec2[], p: Vec2) =>
  path.reduce((best, q, i) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(path[best][0] - p[0], path[best][1] - p[1]) ? i : best), 0);
function middayRider(
  spec: (typeof MIDDAY_RIDERS)[number],
  order: number,
  onVan: number,
  onHome: number,
  route: EntranceRoute,
): ActorSpec {
  const frame = dockFrame(vanIndex(spec.van)),
    homeFrame = dockFrame(vanIndex(spec.home));
  // Ramp descents start five seconds after the ramp is down, twenty seconds apart
  // (a descent, the driver's handoff and the climb back up for the next rider).
  const r0 = frame.window.unload[0] + 5 + onVan * 20;
  // Board the afternoon van between its own riders, three seconds apart, arriving at the sill.
  const boardingEnd = homeFrame.window.boarding[0] + 28 + onHome * 3;
  const speed = spec.mobility ? 0.64 : 0.7;
  const track = new Track(frame.sill, FLOOR, 0);
  const withHeights = (l: Leg) => ({ heights: [track.y, ...l.heights] });
  const onVanRoute = { vehicleId: spec.van };
  // Placeholder rides at the sill; seatRider assigns the seat, cabin walks and visibility.
  track.ride(r0, spec.van, FLEET_VAN_SEATS.benches[0], frame.sill, 'Riding to Seen Health', true);
  track.walk([frame.foot], r0 + 12, 'Unload on van ramp', GROUND, 'walk', onVanRoute);
  track.walk(route.approach.path, r0 + 24, 'Meet escort · approach ramp', GROUND, 'walk', { ...onVanRoute, ...withHeights(route.approach) });
  track.walk(route.ramp.path, r0 + 42, 'Up the wheelchair ramp', 0, 'walk', { ...onVanRoute, ...withHeights(route.ramp) });
  track.walk(route.entrance.path, r0 + 47, 'Turn right · sliding entrance', 0, 'walk', { ...onVanRoute, zoneId: 'lobby', ...withHeights(route.entrance) });
  track.walkAt(route.lobby.path, 0.77, 'Walk to reception', 0, 'walk', { zoneId: 'lobby', ...withHeights(route.lobby) });
  track.stay(track.t + 12, 'greet', 'Check in behind the front desk queue', facing(route.queue, route.desk), { zoneId: 'lobby' });
  track.walkAt([route.rejoin, spec.waitAt], 0.77, 'Find a place to wait', 0, 'walk', { zoneId: 'lobby' });
  const exit = route.exit(spec.waitAt);
  const departure: Vec2[] = [...exit.path, homeFrame.foot, homeFrame.sill];
  const departAt = boardingEnd - length([spec.waitAt, ...departure]) / speed;
  track.stay(departAt, 'idle', 'Await confirmed pickup', facing(spec.waitAt, route.queue), { zoneId: 'lobby' });
  track.walk(departure, boardingEnd, 'Escorted departure · board van', FLOOR, 'walk', {
    vehicleId: spec.home,
    zoneId: 'lobby',
    heights: [track.y, ...exit.heights, GROUND, FLOOR],
  });
  track.ride(LOOP, spec.home, FLEET_VAN_SEATS.benches[0], homeFrame.sill, 'Riding home', true);
  return {
    id: `arrival-midday-${spec.van.slice(-1)}-${order + 1}`,
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
    if (data.actors.some((a) => rideEvents(a).some((e) => e.vehicle === spec.van))) return;
    const onVan = perVan.get(spec.van) ?? 0,
      onHome = perHome.get(spec.home) ?? 0;
    perVan.set(spec.van, onVan + 1);
    perHome.set(spec.home, onHome + 1);
    route ??= entranceRoute(data);
    midday.push(middayRider(spec, order, onVan, onHome, route));
  });
  const actors = [...data.actors.filter((a) => !isFleetDriverId(a.id)), ...midday];
  const byId = new Map(actors.map((a) => [a.id, a]));
  const escorts = new Map<string, ActorSpec>();
  for (const a of actors) if (a.escortFor && byId.has(a.escortFor)) escorts.set(a.escortFor, a);
  // Seats per van, from the order in which riders reach the ramp.
  const seatsByVan = new Map<string, Map<string, VanSeat>>();
  vanIds.forEach((id, index) => {
    if (!alhambraVanWindows[index]) return;
    const riders = actors
      .flatMap((a) => rideEvents(a))
      .filter((e) => e.vehicle === id && !e.actor.escortFor);
    const rampTime = (e: RideEvent) => e.actor.segments[e.at + (e.alights ? 1 : -1)]?.start ?? 0;
    riders.sort((a, b) => rampTime(a) - rampTime(b));
    seatsByVan.set(id, assignSeats(riders, escorts));
  });
  const seated = actors.map((a) => seatRider(a, seatsByVan, byId));
  const drivers = vanIds.map((_, index): ActorSpec => {
    const id = `driver-${index + 1}`,
      base = existing.get(id);
    return {
      id,
      label: base?.label ?? `Driver · ${DRIVER_NAMES[index]}`,
      role: 'driver',
      variant: base?.variant ?? index,
      profileId: base?.profileId,
      levelId: 'site',
      offset: 0,
      segments: driverDay(index, seated, escorts),
    };
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
      description: 'Mid-day van: ramp unload with the driver, accessible approach and check-in.',
    };
  });
  return {
    ...data,
    actors: [...seated, ...drivers],
    interactions: [...data.interactions, ...interactions],
  };
}
