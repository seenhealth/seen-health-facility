/**
 * Build-time support for facility instances on community pads
 * (scripts/build-community-tracks.mjs): the navigation view of an instance,
 * the generated footprint/room summary that sizes its pad, the checks of the
 * stamped building against its pad, and the generator of the people inside
 * it (`communityCastFromScenes`). Never imported by the app at runtime: the
 * generated JSON is.
 */
import type { Interaction } from '../model/activity';
import type { Action, CharacterRole } from '../model/characters';
import {
  derivePad,
  isPaved,
  LABEL_PLATE,
  toLocal,
  toWorld,
  type CareFacility,
  type CareSetting,
  type InstanceSummary,
} from '../model/community-settings';
import {
  instanceSelection,
  labelledRooms,
} from '../model/facility-instance';
import {
  insidePolygon,
  toLocal as frameToLocal,
  toWorld as frameToWorld,
  transformPolygon,
  type Frame,
} from '../model/frame';
import type {
  InstanceActor,
  InstanceCast,
  InstanceHole,
  InstanceSegment,
} from '../model/instance-cast';
import { roomLabelAnchor } from '../model/room-labels';
import { polygonArea, type Facility, type Vec2 } from '../model/schema';
import { roomPlacement } from '../model/site-activity-data';
import {
  componentLabels,
  distance,
  distanceToSegment,
  isNode,
  MOBILITY_CLEARANCE,
  NAV_STEP,
  navGrid,
  pathLength,
  snap,
  wallClearanceAt,
  type NavOptions,
} from './nav';
import {
  freeStandingPoint,
  pointAlong,
  seatPose,
  walkBetween,
} from './scenario';

const r2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
};
const pt2 = (p: Vec2): Vec2 => [r2(p[0]), r2(p[1])];

/**
 * Navigation options for an instance level: only the registry's exclusions,
 * no day-program stations or display, vertical circulation blocked. Passed
 * explicitly, because `navGrid`'s defaults are Alhambra's day program.
 */
export function instanceNavOptions(
  cfg: CareFacility,
  levelId: string,
): NavOptions {
  return {
    levelId,
    removedObjectIds: cfg.excludeObjectIds ?? [],
    reservations: [],
    excludeZoneIds: cfg.excludeZoneIds ?? [],
    blockVerticalCirculation: true,
  };
}

/**
 * The facility as the instance draws it: drawn levels and zones with their
 * rooms, walls and floor openings, and the drawn objects with `layer`
 * defaulted to `furniture` (as validate-community.mjs normalises them, so
 * `roomPlacement` sees every object). Navigation grids, seat poses and
 * furniture checks all read this view.
 */
export function instanceView(facility: Facility, cfg: CareFacility): Facility {
  const sel = instanceSelection(facility, cfg),
    ids = new Set(sel.objects.map((o) => o.id));
  return {
    ...facility,
    zones: sel.zones,
    rooms: sel.rooms,
    walls: sel.walls,
    floorOpenings: sel.openings,
    objects: sel.objects.map((o) => ({ ...o, layer: o.layer ?? 'furniture' })),
    verticalConnections: (facility.verticalConnections || []).filter((c) =>
      ids.has(c.objectId),
    ),
  };
}

/**
 * The generated summary of a setting's instance, in the setting's local
 * frame (2 dp): the drawn zones' polygons (footprint) and rooms with their
 * label anchors and registry display names, plus the inputs it came from.
 */
export function instanceSummary(
  facility: Facility,
  cfg: CareFacility,
  castSha1: string | null,
): InstanceSummary {
  const sel = instanceSelection(facility, cfg),
    labels = new Map(
      labelledRooms(sel.rooms, cfg.labels).map(([r, name]) => [r.id, name]),
    );
  return {
    facilityId: facility.id,
    revision: facility.revision,
    floorY: cfg.floorY ?? 0,
    inputs: {
      frame: cfg.frame,
      levelIds: sel.levelIds,
      excludeZoneIds: cfg.excludeZoneIds ?? [],
      excludeObjectIds: cfg.excludeObjectIds ?? [],
      castSha1,
    },
    footprint: sel.zones.map((z) =>
      transformPolygon(cfg.frame, z.polygon).map(pt2),
    ),
    rooms: sel.rooms
      .filter((r) => r.kind !== 'shell')
      .map((r) => ({
        id: r.id,
        name: r.name,
        ...(labels.has(r.id) ? { label: labels.get(r.id) } : {}),
        zoneId: r.zoneId,
        anchor: pt2(toWorld(cfg.frame, roomLabelAnchor(r))),
        polygon: transformPolygon(cfg.frame, r.polygon).map(pt2),
      })),
  };
}

/** Distance (m, 5 cm steps up to `max`) from a world point to the setting's paving. */
function pavingClearance(s: CareSetting, p: Vec2, max: number) {
  for (let r = 0; r <= max + 1e-9; r += 0.05)
    for (let k = 0; k < (r ? 24 : 1); k++) {
      const a = (k / 24) * Math.PI * 2;
      if (isPaved(s, [p[0] + Math.sin(a) * r, p[1] + Math.cos(a) * r]))
        return r;
    }
  return Infinity;
}
/** Points every `step` m along a polygon's edges. */
function edgeSamples(poly: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  });
  return out;
}
/** Shortest distance from a point to a set of polygons' edges. */
function edgeDistance(p: Vec2, polys: Vec2[][]) {
  let d = Infinity;
  for (const poly of polys)
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        t = Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
        );
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
    });
  return d;
}
export type SiteReport = {
  pad: CareSetting['pad'];
  /** Footprint to the drive band, stub legs and apron (m). */
  pavingClearance: number;
  /** Footprint + margin to the pad edges (m; ≥ 0). */
  padSlack: { side: number; front: number; back: number };
  /** Grounds anchors to the footprint (m, negative inside). */
  grounds: Record<string, number>;
};
/**
 * The stamped building against its pad (setting-local summary, world checks):
 * footprint + margin inside the derived pad, at least 1 m from the drive band,
 * stub legs and apron (edges sampled every 0.1 m), the pad's label plate and
 * every `grounds` anchor outside the footprint. Throws on the first failure.
 */
export function checkInstanceSite(
  s: CareSetting,
  summary: InstanceSummary,
): SiteReport {
  const cfg = s.facility!,
    margin = cfg.margin ?? 1.6,
    pad = derivePad(s, summary),
    pts = summary.footprint.flat(),
    world = summary.footprint.map((poly) => poly.map((p) => toWorld(s, p)));
  const padSlack = {
    side: pad.w / 2 - margin - Math.max(...pts.map((p) => Math.abs(p[0]))),
    front: pad.d / 2 - margin - Math.max(...pts.map((p) => p[1])),
    back: Math.min(...pts.map((p) => p[1])) - margin + pad.d / 2 + (pad.back ?? 0),
  };
  for (const [edge, slack] of Object.entries(padSlack))
    if (slack < -1e-6)
      throw new Error(
        `${s.id}: footprint + ${margin} m margin passes the pad's ${edge} edge by ${(-slack).toFixed(2)} m`,
      );
  let paving = Infinity;
  for (const poly of world)
    for (const p of edgeSamples(poly, 0.1)) {
      const d = pavingClearance(s, p, 3);
      if (d < paving) paving = d;
      if (d < 1)
        throw new Error(
          `${s.id}: the building edge at local (${toLocal(s, p).map((v) => v.toFixed(2)).join(', ')}) is ${d.toFixed(2)} m from the drive or apron (needs 1 m)`,
        );
    }
  const inside = (p: Vec2) => world.some((poly) => insidePolygon(p, poly));
  const [lx, lz] = s.anchors.label;
  for (let i = 0; i <= 28; i++)
    for (let j = 0; j <= 6; j++) {
      const p: Vec2 = [
        lx - LABEL_PLATE.w / 2 + (LABEL_PLATE.w * i) / 28,
        lz - LABEL_PLATE.d / 2 + (LABEL_PLATE.d * j) / 6,
      ];
      if (inside(p))
        throw new Error(`${s.id}: the label plate overlaps the building`);
    }
  const grounds: Record<string, number> = {};
  for (const name of cfg.grounds ?? []) {
    const a = s.anchors[name];
    if (!a) throw new Error(`${s.id}: grounds anchor ${name} is not defined`);
    const d = (inside(a) ? -1 : 1) * edgeDistance(a, world);
    grounds[name] = r2(d);
    if (d < 1)
      throw new Error(
        `${s.id}: ${name} is ${d.toFixed(2)} m from the building (needs 1 m outside)`,
      );
  }
  return {
    pad,
    pavingClearance: r2(paving),
    padSlack: {
      side: r2(padSlack.side),
      front: r2(padSlack.front),
      back: r2(padSlack.back),
    },
    grounds,
  };
}

// ---------------------------------------------------------------------------
// People inside an instance: the cast file and its generator.
// ---------------------------------------------------------------------------
/*
 * One cast file per setting, app/data/community/<setting>.cast.json, holds
 * two kinds of people in one `people` list (one id namespace):
 *
 * - scene people (no `stops`): placed by the room or outdoor `scenes` that
 *   name them and routed between scenes; `visit` people come in through an
 *   entrance for their first slot and leave after their last;
 * - scheduled people (`stops`): an explicit timetable, routed between
 *   consecutive stops; before `arrive`, after `leave` and during `away`
 *   windows they are off the instance (`holes`), which community-people.ts
 *   may fill with hand-authored legs (instance-cast.ts `fillHoles`). Each
 *   stop holds for its whole window, however short (walks fit in the gaps;
 *   the 8 s minimum stay is for scene people), and a stop's `with` may name
 *   people outside the cast. A resident writes `arrive: { t: 0, anchor:
 *   <first stop's point> }` and `leave: { t: 720, anchor: 'door' }`.
 *
 * Coordinates: points written as [x, z] are in the facility's own frame (as
 * in the facility JSON), with headings in that frame; anchor names are the
 * setting's registry anchors (community-settings.ts), with headings in the
 * setting's frame.
 */
export type CastMobility = 'cane' | 'walker' | 'wheelchair';
type CastCommon = {
  /** Final actor id (keep existing ids stable). */
  id: string;
  role: CharacterRole;
  label: string;
  variant: number;
  /** A stored character profile (character-templates.json): the same person, and look, as another actor's. */
  profileId?: string;
  mobility?: CastMobility;
  /** Metres per loop second (defaults: staff 1.0, participant 0.75, cane 0.65, walker 0.5, wheelchair 0.6; ≤ 1.65). */
  gait?: number;
};
/** Placed by scenes. */
export type ScenePerson = CastCommon & {
  /** Visiting staff: hidden off the pad, in through an entrance in time for their first slot, out after their last. */
  visit?: { entrance: string; outdoorGait?: number };
};
export type ScheduleStop = {
  window: [number, number];
  roomId: string;
  /** A seat or other object id (`seatPose`: on it, facing its front), or a facility-local point. */
  at: string | Vec2;
  /** Facility-frame heading (default: the seat's front, else 0). */
  heading?: number;
  action: Action;
  /** Default: true on an object, false at a point. */
  seated?: boolean;
  /** At a point: the object sat on there (a bed, sofa, toilet or shower seat), which the furniture check then ignores. */
  seat?: string;
  title: string;
  /** Other actors in this stop's interaction (only read with `interaction`); people outside the cast are allowed. */
  with?: string[];
  /** The stop's interaction (stable id); spans the stop window unless `window` is given. */
  interaction?: {
    id: string;
    category: string;
    label: string;
    description: string;
    window?: [number, number];
  };
};
/** Follows an explicit schedule. */
export type ScheduledPerson = CastCommon & {
  /** Appears here (setting anchor name or facility-local point) at `t` and walks on to the first stop; t > 0 leaves a `before` hole. */
  arrive: { t: number; anchor: string | Vec2 };
  /** Reaches this anchor at `t` and is gone; away windows leave and come back through it too. */
  leave: { t: number; anchor: string | Vec2 };
  /** Windows off the instance between stops (e.g. a van trip), out and back through the leave anchor; none before the first stop (use `arrive.t`) or after the last (use `leave.t`). */
  away?: [number, number][];
  stops: ScheduleStop[];
};
export type CastPerson = ScenePerson | ScheduledPerson;
export type SceneSlot = {
  who: string;
  /** An Action, or the scene's leader/member action. */
  action: Action | 'lead' | 'member';
  /** true = a free seat in the room; 'home' = this person's first place in this room; else a seat id. */
  seat?: true | string;
  /** Stand (or park a wheelchair) at this object: nearest free point facing it; a seat the registry excludes is a free wheelchair place. */
  spot?: string;
  /** An explicit place: a facility-local `point` (rooms) or a setting `anchor` (outdoor places), with its heading. */
  at?: { point?: Vec2; anchor?: string; heading: number };
  /** Narrower window inside the scene's (staggered arrivals, one-at-a-time reviews). */
  window?: [number, number];
  title?: string;
};
export type InstanceScene = {
  /** Interaction id (keep existing ids stable). */
  id: string;
  /** A facility room id, or … */
  room?: string;
  /** … an outdoor place of the cast file. */
  place?: string;
  window: [number, number];
  label: string;
  description: string;
  category: string;
  leaderAction?: Action;
  memberAction?: Action;
  /** false: places people without emitting an interaction. */
  interaction?: boolean;
  /** Extra interaction members without a slot in this scene. */
  with?: string[];
  /** Free seats fill outward from this facility-local point (default: from each person's previous place, else the room's label anchor). */
  near?: Vec2;
  slots: SceneSlot[];
};
/** An outdoor place: out through an entrance, then along setting anchors (door outward). */
export type OutdoorPlace = { label: string; entrance: string; path: string[] };
export type CastFile = {
  version?: 1;
  setting: string;
  /** The facility id the cast is written for; the build checks it against the registry when given. */
  facility?: string;
  /** Free text for authors; not read. */
  notes?: string[];
  /** Facility-local point just inside a door, and the setting anchors outside it (outermost first; the last is just outside the door). */
  entrances?: Record<string, { inside: Vec2; path: string[] }>;
  places?: Record<string, OutdoorPlace>;
  people: CastPerson[];
  scenes?: InstanceScene[];
  /** Ids that must survive regeneration (people and interactions other code relies on). */
  keep?: { actors?: string[]; interactions?: string[] };
};
const isScheduled = (p: CastPerson): p is ScheduledPerson =>
  'stops' in p && Array.isArray(p.stops);

type Place = {
  /** indoor: in a room; outdoor: an outdoor place; door: a scheduled person's arrive/leave point; outer: off the pad, beyond an entrance. */
  kind: 'indoor' | 'outdoor' | 'door' | 'outer';
  /** Facility-local point and heading. */
  point: Vec2;
  heading: number;
  seated: boolean;
  seatId?: string;
  /** What a scheduled stop sits on (its object, or `seat` at a point): the output names it for the furniture check. */
  sitsOn?: string;
  roomId?: string;
  /** Outdoor place id. */
  placeId?: string;
  /** Entrance of an outer point. */
  entrance?: string;
  label: string;
};
type Stay = {
  place: Place;
  /** Hard: arrive by `start`. Soft: the walk into it leaves at `start`. */
  start: number;
  soft: boolean;
  action: Action;
  title: string;
  visible: boolean;
  /** No minimum dwell: an appearance at a door, walking straight on. */
  instant?: boolean;
  /** A scheduled stop's window end: the walk out never leaves before it (instead of `minDwell`). */
  until?: number;
};
type Leg = { path: Vec2[]; gait: number; action: 'walk' | 'roll' };
type Walk = { legs: Leg[]; start: number; end: number; factor: number };
type Item = {
  t0: number;
  t1: number;
  path: Vec2[];
  /** Index of the stay this item belongs to (walks: the stay walked into). */
  stay: number;
  walk: boolean;
};
type Person = {
  spec: CastPerson;
  gait: number;
  outdoorGait: number;
  clearance: number;
  stays: Stay[];
  /** walks[k]: the committed walk into stays[k] (k ≥ 1), or null. */
  walks: (Walk | null)[];
  /** First place per room, for `seat: 'home'`. */
  homes: Map<string, Place>;
  timeline: Item[] | null;
};
const DEFAULT_GAIT = {
  staff: 1,
  participant: 0.75,
  cane: 0.65,
  walker: 0.5,
  wheelchair: 0.6,
};
const SEAT_KINDS = new Set([
  'upholstered-chair',
  'mesh-chair',
  'lounge-chair',
  'chair',
  'task-chair',
]);
const TABLE_KINDS = new Set([
  'table',
  'round-table',
  'activity-tabletop',
  'mahjong-table',
]);
const r3 = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};
const pt3 = (p: Vec2): Vec2 => [r3(p[0]), r3(p[1])];
const TAU = Math.PI * 2;
/**
 * Largest move of a walk in time (s) to keep people apart: earlier into a
 * slot (waiting at the destination) or later out of one (waiting at the
 * origin). 12 s was too little where a whole group crosses one lobby.
 */
const MAX_SHIFT = 30;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;
const same = (a: Vec2, b: Vec2) => distance(a, b) < 1e-6;
const facingTo = (from: Vec2, to: Vec2) =>
  Math.atan2(to[0] - from[0], to[1] - from[1]);
const overlaps = (a: readonly number[], b: readonly number[]) =>
  a[0] < b[1] && b[0] < a[1];
/** Each leg's time span when walked from `start` at `factor` × gait. */
function legTimes(legs: Leg[], start: number, factor: number) {
  const out: { t0: number; t1: number; path: Vec2[] }[] = [];
  let t = start;
  for (const l of legs) {
    const d = pathLength(l.path) / (l.gait * factor);
    out.push({ t0: t, t1: t + d, path: l.path });
    t += d;
  }
  return out;
}
const walkDuration = (legs: Leg[], factor = 1) =>
  legs.reduce((n, l) => n + pathLength(l.path) / (l.gait * factor), 0);
function dedupe(path: Vec2[]) {
  const out: Vec2[] = [];
  for (const p of path)
    if (!out.length || !same(out.at(-1)!, p)) out.push(pt3(p));
  return out.length === 1 ? [out[0], out[0]] : out;
}

export type CastOptions = {
  setting: CareSetting;
  nav: NavOptions;
  /** Shortest stay between two walks (s, default 8). */
  minDwell?: number;
  /** People keep at least this far apart (m, default 0.6). */
  spacing?: number;
};

/**
 * Generate the people of a facility instance from its cast file (both kinds:
 * scenes and explicit schedules). `frame` is the setting's
 * `facility.frame` (facility origin in the setting's local frame).
 *
 * Deterministic. Places: free seats (a table the scene already uses first,
 * then nearest the scene's `near` point, the person's previous place or the
 * room's label anchor, with a clear way out), spots by objects (wheelchairs
 * off the aisles), explicit points and outdoor anchors, each at least
 * `spacing` from every place with an overlapping window (more beside a
 * wheelchair or between a seat and a standing place) and clear of furniture
 * (`roomPlacement`) on the instance view. Timelines: slots may nest (a slot
 * interrupts an open one, which the person walks back to when it ends and
 * there is time); walks (`walkBetween` on the instance grid at the person's
 * mobility clearance, around people standing still at the time) end when the
 * next slot starts, or start when an interrupting slot ends, and are moved
 * up to MAX_SHIFT s (earlier into a slot, later out of one), slowed, or
 * routed beside another walk when they would pass anyone closer than
 * `spacing`; a stay never shrinks below `minDwell`. A scheduled person walks
 * out to the leave anchor for each hole and in from it after. Anything that
 * does not fit throws, naming the scene or person and the time. Output: the
 * setting's local frame, 3 dp; a pose held across stays is one segment.
 */
export function communityCastFromScenes(
  facility: Facility,
  frame: Frame,
  cast: CastFile,
  options: CastOptions,
): InstanceCast {
  const { setting } = options,
    cfg = setting.facility!,
    minDwell = options.minDwell ?? 8,
    spacing = options.spacing ?? 0.6,
    view = instanceView(facility, cfg),
    g = navGrid(view, options.nav),
    notes: string[] = [];
  const toFacility = (settingLocal: Vec2) => frameToLocal(frame, settingLocal);
  const anchorPoint = (name: string): Vec2 => {
    const a = setting.anchors[name];
    if (!a) throw new Error(`${setting.id}: no anchor ${name}`);
    return toFacility(toLocal(setting, a));
  };
  const resolvePoint = (p: string | Vec2): Vec2 =>
    typeof p === 'string' ? anchorPoint(p) : p;
  const roomById = new Map(view.rooms.map((r) => [r.id, r]));
  const placements = new Map<string, ReturnType<typeof roomPlacement>>();
  const roomClear = (roomId: string) => {
    let c = placements.get(roomId);
    if (!c) {
      const r = roomById.get(roomId);
      if (!r) throw new Error(`${setting.id}: no drawn room ${roomId}`);
      placements.set(roomId, (c = roomPlacement(view, r)));
    }
    return c.clear;
  };
  const labels: Record<string, string> =
    typeof cfg.labels === 'object' ? cfg.labels : {};
  const roomLabel = (id: string) => labels[id] ?? roomById.get(id)?.name ?? id;
  const objectById = new Map(view.objects.map((o) => [o.id, o]));
  const entrances = cast.entrances ?? {},
    places = cast.places ?? {};
  const entranceOf = (id: string) => {
    const e = entrances[id];
    if (!e) throw new Error(`${setting.id}: no entrance ${id}`);
    return e;
  };
  // --- People ---------------------------------------------------------------
  const people = new Map<string, Person>();
  for (const spec of cast.people) {
    if (people.has(spec.id)) throw new Error(`${spec.id}: listed twice`);
    const gait =
      spec.gait ??
      (spec.mobility
        ? DEFAULT_GAIT[spec.mobility]
        : spec.role === 'participant'
          ? DEFAULT_GAIT.participant
          : DEFAULT_GAIT.staff);
    if (gait > 1.65)
      throw new Error(`${spec.id}: gait ${gait} m/s is over 1.65`);
    const visit = 'visit' in spec ? spec.visit : undefined;
    people.set(spec.id, {
      spec,
      gait,
      outdoorGait: visit?.outdoorGait ?? Math.max(gait, 1.2),
      clearance: MOBILITY_CLEARANCE[spec.mobility ?? 'none'],
      stays: [],
      walks: [],
      homes: new Map(),
      timeline: null,
    });
  }
  const personOf = (id: string, where: string) => {
    const p = people.get(id);
    if (!p) throw new Error(`${where}: unknown person ${id}`);
    return p;
  };
  // --- Places ---------------------------------------------------------------
  type Booked = { who: string; place: Place; window: [number, number] };
  const booked: Booked[] = [];
  // Room to get in and out: a wheelchair parked on open floor keeps an
  // extra 0.8 m from everyone (a turning circle), one at a freed table place
  // 0.4 m, and a standing place placed after a seat 0.4 m from it (the way
  // out of the chair).
  const rolls = (id: string) => people.get(id)?.spec.mobility === 'wheelchair';
  const freeAt = (
    p: Vec2,
    window: [number, number],
    who: string,
    seatId?: string,
  ) =>
    booked.every(
      (b) =>
        b.who === who ||
        !overlaps(b.window, window) ||
        (distance(b.place.point, p) >=
          spacing +
            ((rolls(who) && !seatId) || (rolls(b.who) && !b.place.seatId)
              ? 0.8
              : rolls(who) || rolls(b.who) || (!seatId && b.place.seatId)
                ? 0.4
                : 0) &&
          (!seatId || b.place.seatId !== seatId)),
    );
  const reachable = (p: Vec2, clearance: number) => {
    try {
      return distance(snap(g, p, { clearance }), p) <= 1.25;
    } catch {
      return false;
    }
  };
  /**
   * A way out of a seat with others in place: a free cell within reach that
   * keeps clear of the people standing (or parked) nearby for the window, a
   * straight step to it that does too, and open floor beyond it.
   */
  const exitFree = (p: Vec2, clearance: number, window: [number, number], who: string) => {
    // Standing people and wheelchairs nearby (seated neighbours are part of
    // table life and stay out of the way).
    const others = booked
      .filter(
        (b) =>
          b.who !== who &&
          overlaps(b.window, window) &&
          (!b.place.seatId || rolls(b.who)) &&
          distance(b.place.point, p) < 2.5,
      )
      .map((b) => b.place.point);
    if (!others.length) return true;
    const blocked = (q: Vec2) => others.some((o) => distance(o, q) < spacing + 0.15);
    let cell: Vec2;
    try {
      cell = snap(g, p, { clearance, avoid: blocked });
    } catch {
      return false;
    }
    if (
      distance(cell, p) > 1.25 ||
      others.some((o) => distanceToSegment(o, p, cell) < spacing + 0.08)
    )
      return false;
    // Not a pocket: the free floor around the exit opens out (16 m²).
    const seen = new Set<number>(),
      queue: [number, number][] = [[Math.round(cell[0] / NAV_STEP), Math.round(cell[1] / NAV_STEP)]];
    seen.add(queue[0][0] * 100000 + queue[0][1]);
    while (queue.length && seen.size < 400) {
      const [ix, iz] = queue.shift()!;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = ix + dx,
          nz = iz + dz,
          key = nx * 100000 + nz;
        if (seen.has(key) || !isNode(g, nx, nz, clearance)) continue;
        if (blocked([nx * NAV_STEP, nz * NAV_STEP])) continue;
        seen.add(key);
        queue.push([nx, nz]);
      }
    }
    return seen.size >= 400;
  };
  const tableNear = (p: Vec2) => {
    let best: string | null = null,
      d = 1.6;
    for (const o of view.objects) {
      if (!TABLE_KINDS.has(view.assets[o.assetId]?.kind ?? '')) continue;
      const e = distance(p, [o.position[0], o.position[2]]);
      if (e < d) {
        d = e;
        best = o.id;
      }
    }
    return best;
  };
  const seatPlace = (seatId: string, roomId: string): Place => {
    const s = seatPose(view, seatId);
    return {
      kind: 'indoor',
      point: s.anchor,
      heading: s.heading,
      seated: true,
      seatId,
      roomId,
      label: roomLabel(roomId),
    };
  };
  const boxDistance = (p: Vec2, o: Facility['objects'][number]) => {
    const a = view.assets[o.assetId],
      dx = p[0] - o.position[0],
      dz = p[1] - o.position[2],
      x = Math.cos(o.rotation) * dx - Math.sin(o.rotation) * dz,
      z = Math.sin(o.rotation) * dx + Math.cos(o.rotation) * dz,
      boxes = o.navigationFootprints || [
        [0, 0, a.dimensions[0] * o.scale[0], a.dimensions[2] * o.scale[2]],
      ];
    return Math.min(
      ...boxes.map(([bx, bz, w, d]) =>
        Math.hypot(
          Math.max(0, Math.abs(x - bx) - w / 2),
          Math.max(0, Math.abs(z - bz) - d / 2),
        ),
      ),
    );
  };
  /** A clear standing point near `p` in a room (rings of 5 cm up to 1.2 m). */
  const clearPointNear = (
    p: Vec2,
    roomId: string,
    who: Person,
    window: [number, number],
  ): Vec2 | null => {
    const clear = roomClear(roomId);
    const ok = (q: Vec2) =>
      clear(q, 0.28) &&
      wallClearanceAt(g, q) >= 0.25 &&
      reachable(q, who.clearance) &&
      freeAt(q, window, who.spec.id);
    const start = freeStandingPoint(g, p).point;
    if (ok(start)) return start;
    for (let r = 0.05; r <= 1.2 + 1e-9; r += 0.05)
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU,
          q = pt3([p[0] + Math.sin(a) * r, p[1] + Math.cos(a) * r]);
        if (ok(q)) return q;
      }
    return null;
  };
  /** The free floor point nearest an object, inside its room, facing it. */
  const spotPlace = (
    objectId: string,
    roomId: string,
    who: Person,
    window: [number, number],
    where: string,
  ): Place => {
    const o = objectById.get(objectId);
    if (!o) {
      // A seat the registry excludes: its freed place is a wheelchair's.
      if (
        !(cfg.excludeObjectIds ?? []).includes(objectId) ||
        !facility.objects.some((x) => x.id === objectId)
      )
        throw new Error(`${where}: no object ${objectId} in the instance`);
      const s = seatPose(facility, objectId);
      if (!freeAt(s.anchor, window, who.spec.id, objectId))
        throw new Error(
          `${where}: the freed place ${objectId} is taken for ${window.join('–')}`,
        );
      return {
        kind: 'indoor',
        point: s.anchor,
        heading: s.heading,
        seated: false,
        // A table place, though in the person's own wheelchair.
        seatId: objectId,
        roomId,
        label: roomLabel(roomId),
      };
    }
    const room = roomById.get(roomId)!,
      clear = roomClear(roomId),
      labelsAt = componentLabels(g, who.clearance),
      target: Vec2 = [o.position[0], o.position[2]],
      cands: { p: Vec2; d: number }[] = [];
    for (let idx = 0; idx < g.zoneIndex.length; idx++) {
      if (labelsAt[idx] !== 0) continue;
      const p: Vec2 = [
        r3((g.ix0 + Math.floor(idx / g.nz)) * NAV_STEP),
        r3((g.iz0 + (idx % g.nz)) * NAV_STEP),
      ];
      if (distance(p, target) > 4 || !insidePolygon(p, room.polygon)) continue;
      // A wheelchair parks where there is room around it, not in an aisle.
      if (
        who.spec.mobility === 'wheelchair' &&
        !isNode(g, g.ix0 + Math.floor(idx / g.nz), g.iz0 + (idx % g.nz), who.clearance + 0.25)
      )
        continue;
      cands.push({ p, d: boxDistance(p, o) });
    }
    cands.sort((a, b) => a.d - b.d || a.p[0] - b.p[0] || a.p[1] - b.p[1]);
    for (const { p } of cands) {
      if (!clear(p, 0.28) || !freeAt(p, window, who.spec.id)) continue;
      const q = freeStandingPoint(g, p).point;
      if (!clear(q, 0.28) || !freeAt(q, window, who.spec.id)) continue;
      return {
        kind: 'indoor',
        point: q,
        heading: facingTo(q, target),
        seated: false,
        roomId,
        label: roomLabel(roomId),
      };
    }
    throw new Error(
      `${where}: no free spot at ${objectId} in ${roomId} for ${window.join('–')}`,
    );
  };
  const scenes = cast.scenes ?? [];
  type SlotPlan = {
    who: Person;
    place: Place;
    window: [number, number];
    action: Action;
    title: string;
  };
  const plans: SlotPlan[] = [];
  for (const scene of scenes) {
    const sceneId = scene.id;
    if (!!scene.room === !!scene.place)
      throw new Error(`${sceneId}: give a room or a place`);
    const outdoor = scene.place ? places[scene.place] : null;
    if (scene.place && !outdoor)
      throw new Error(`${sceneId}: no outdoor place ${scene.place}`);
    const roomId = scene.room;
    if (roomId) roomClear(roomId);
    const sceneTables = new Set<string>();
    // Fixed places first (a person's earlier place, a named seat), then
    // wheelchair places, so free seats, spots and points keep clear of them.
    const fixed = (slot: SceneSlot) =>
      slot.seat === 'home' || typeof slot.seat === 'string'
        ? 0
        : people.get(slot.who)?.spec.mobility === 'wheelchair'
          ? 1
          : 2;
    const ordered = [...scene.slots].sort((x, y) => fixed(x) - fixed(y));
    for (const slot of ordered) {
      const who = personOf(slot.who, sceneId),
        where = `${sceneId}/${slot.who}`;
      if (isScheduled(who.spec))
        throw new Error(`${where}: a scheduled person cannot be in scenes`);
      const window = slot.window ?? scene.window;
      if (window[0] < scene.window[0] || window[1] > scene.window[1])
        throw new Error(
          `${where}: slot window ${window.join('–')} is outside the scene's`,
        );
      const action: Action =
        slot.action === 'lead'
          ? (scene.leaderAction ?? 'present')
          : slot.action === 'member'
            ? (scene.memberAction ?? 'conversation')
            : slot.action;
      const previous = plans.filter((p) => p.who === who).at(-1)?.place;
      let place: Place;
      if (outdoor) {
        if (!slot.at?.anchor)
          throw new Error(`${where}: an outdoor place needs at.anchor`);
        place = {
          kind: 'outdoor',
          point: anchorPoint(slot.at.anchor),
          heading: slot.at.heading - frame.heading,
          seated: false,
          placeId: scene.place,
          label: outdoor.label,
        };
        if (!freeAt(place.point, window, who.spec.id))
          throw new Error(
            `${where}: ${slot.at.anchor} is within ${spacing} m of someone else for ${window.join('–')}`,
          );
      } else if (slot.seat === 'home') {
        const home = who.homes.get(roomId!);
        if (!home)
          throw new Error(`${where}: no earlier place in ${roomId} to return to`);
        place = home;
        if (!freeAt(place.point, window, who.spec.id, place.seatId))
          throw new Error(
            `${where}: back at the earlier place in ${roomId}, but someone is within reach of it for ${window.join('–')}`,
          );
      } else if (slot.seat === true) {
        if (who.spec.mobility === 'wheelchair')
          throw new Error(`${where}: a wheelchair user parks at a \`spot\``);
        const room = roomById.get(roomId!)!,
          origin = scene.near ?? previous?.point ?? roomLabelAnchor(room),
          clear = roomClear(roomId!);
        const cands = view.objects
          .filter((o) => {
            if (!SEAT_KINDS.has(view.assets[o.assetId]?.kind ?? '')) return false;
            const p: Vec2 = [o.position[0], o.position[2]];
            return (
              (o.roomId === roomId || insidePolygon(p, room.polygon)) &&
              clear(p, 0.19, o.id) &&
              freeAt(p, window, who.spec.id, o.id) &&
              reachable(p, who.clearance) &&
              exitFree(p, who.clearance, window, who.spec.id)
            );
          })
          .map((o) => {
            const p: Vec2 = [o.position[0], o.position[2]],
              table = tableNear(p);
            return {
              o,
              table,
              rank: table && sceneTables.has(table) ? 0 : 1,
              d: distance(origin, p),
            };
          })
          .sort(
            (a, b) =>
              a.rank - b.rank || a.d - b.d || (a.o.id < b.o.id ? -1 : 1),
          );
        const best = cands[0];
        if (!best)
          throw new Error(
            `${where}: no free seat in ${roomId} for ${window.join('–')}`,
          );
        if (best.table) sceneTables.add(best.table);
        place = seatPlace(best.o.id, roomId!);
      } else if (typeof slot.seat === 'string') {
        if (!objectById.has(slot.seat))
          throw new Error(`${where}: no seat ${slot.seat}`);
        place = seatPlace(slot.seat, roomId!);
        if (!freeAt(place.point, window, who.spec.id, slot.seat))
          throw new Error(
            `${where}: ${slot.seat} is taken for ${window.join('–')}`,
          );
      } else if (slot.spot) {
        place = spotPlace(slot.spot, roomId!, who, window, where);
      } else if (slot.at?.point) {
        const q = clearPointNear(slot.at.point, roomId!, who, window);
        if (!q)
          throw new Error(
            `${where}: no free spot near (${slot.at.point.join(', ')}) in ${roomId}`,
          );
        place = {
          kind: 'indoor',
          point: q,
          heading: slot.at.heading,
          seated: false,
          roomId,
          label: roomLabel(roomId!),
        };
      } else throw new Error(`${where}: give a seat, spot or at`);
      if (roomId && !who.homes.has(roomId)) who.homes.set(roomId, place);
      booked.push({ who: who.spec.id, place, window });
      plans.push({ who, place, window, action, title: slot.title ?? scene.label });
    }
  }
  // --- Routing --------------------------------------------------------------
  /** Facility-local outdoor path from a place to just outside its door. */
  const toDoor = (place: Place): { entrance: string; path: Vec2[] } => {
    if (place.kind === 'outer') {
      const e = entranceOf(place.entrance!);
      return { entrance: place.entrance!, path: e.path.map(anchorPoint) };
    }
    const op = places[place.placeId!],
      e = entranceOf(op.entrance);
    return {
      entrance: op.entrance,
      path: [place.point, ...[...op.path].reverse().map(anchorPoint), anchorPoint(e.path.at(-1)!)],
    };
  };
  const onGrid = (p: Place) => p.kind === 'indoor' || p.kind === 'door';
  const indoor = (
    a: Vec2,
    b: Vec2,
    who: Person,
    avoid?: (p: Vec2) => boolean,
  ) =>
    walkBetween(
      g,
      { anchor: a, approach: [] },
      { anchor: b, approach: [] },
      who.clearance,
      avoid,
    );
  /** The legs from place a to place b: indoors on the grid, outdoors along anchors. */
  function legsBetween(
    a: Place,
    b: Place,
    who: Person,
    avoid?: (p: Vec2) => boolean,
  ): Leg[] {
    const act = who.spec.mobility === 'wheelchair' ? 'roll' : 'walk',
      gaitOut = (p: Place) => (p.kind === 'outer' ? who.outdoorGait : who.gait);
    if (onGrid(a) && onGrid(b))
      return [{ path: indoor(a.point, b.point, who, avoid), gait: who.gait, action: act }];
    if (a.kind === 'outdoor' && b.kind === 'outdoor' && a.placeId === b.placeId)
      return [{ path: dedupe([a.point, b.point]), gait: who.gait, action: act }];
    const outA = onGrid(a) ? null : toDoor(a),
      outB = onGrid(b) ? null : toDoor(b);
    if (outA && outB)
      return [
        {
          path: dedupe([...outA.path, ...[...outB.path].reverse()]),
          gait: Math.min(gaitOut(a), gaitOut(b)),
          action: act,
        },
      ];
    if (outA) {
      const inside = entranceOf(outA.entrance).inside;
      return [
        { path: dedupe(outA.path), gait: gaitOut(a), action: act },
        {
          path: dedupe([outA.path.at(-1)!, ...indoor(inside, b.point, who, avoid)]),
          gait: who.gait,
          action: act,
        },
      ];
    }
    const inside = entranceOf(outB!.entrance).inside,
      fromDoor = [...outB!.path].reverse();
    return [
      {
        path: dedupe([...indoor(a.point, inside, who, avoid), fromDoor[0]]),
        gait: who.gait,
        action: act,
      },
      { path: dedupe(fromDoor), gait: gaitOut(b), action: act },
    ];
  }
  const restAction = (place: Place): Action => (place.seated ? 'seated' : 'idle');
  /** Append a stay; one starting at the same moment replaces a soft or same-place one. */
  const append = (stays: Stay[], s: Stay) => {
    const last = stays.at(-1);
    if (
      last &&
      Math.abs(last.start - s.start) < 1e-9 &&
      (last.soft || last.place === s.place)
    )
      stays.pop();
    stays.push(s);
  };
  // --- Stays: scene people (slots nest and interrupt) -----------------------
  for (const who of people.values()) {
    if (isScheduled(who.spec)) continue;
    const mine = plans
      .filter((p) => p.who === who)
      .sort((a, b) => a.window[0] - b.window[0]);
    if (!mine.length) throw new Error(`${who.spec.id}: in no scene`);
    const visit = 'visit' in who.spec ? who.spec.visit : undefined;
    const stays: Stay[] = [];
    const outer = (title: string, start: number, soft: boolean): Stay => {
      const e = entranceOf(visit!.entrance);
      return {
        place: {
          kind: 'outer',
          point: anchorPoint(e.path[0]),
          heading: 0,
          seated: false,
          entrance: visit!.entrance,
          label: 'off site',
        },
        start,
        soft,
        action: 'idle',
        title,
        visible: false,
      };
    };
    if (visit) stays.push(outer('Driving from the center', 0, false));
    else if (mine[0].window[0] > 0)
      stays.push({
        place: mine[0].place,
        start: 0,
        soft: false,
        action: restAction(mine[0].place),
        title: mine[0].title,
        visible: true,
      });
    const open: SlotPlan[] = [];
    const events = mine.flatMap((p) => [
      { t: p.window[0], starts: true, p },
      { t: p.window[1], starts: false, p },
    ]);
    // Ends before starts at the same moment; then file (time) order.
    events.sort((a, b) => a.t - b.t || Number(a.starts) - Number(b.starts));
    for (const ev of events) {
      if (ev.starts) {
        open.push(ev.p);
        append(stays, {
          place: ev.p.place,
          start: ev.t,
          soft: false,
          action: ev.p.action,
          title: ev.p.title,
          visible: true,
        });
        continue;
      }
      const i = open.indexOf(ev.p),
        top = i === open.length - 1;
      open.splice(i, 1);
      // Only the slot the person is at matters: one ending elsewhere (they
      // stayed on after an interruption) changes nothing.
      const here = stays.at(-1)!.place;
      if (!top || ev.t >= 720 || !same(here.point, ev.p.place.point)) continue;
      const back = open.at(-1);
      // Walk back to an interrupted slot only if it is still worth it.
      if (back && !same(back.place.point, here.point)) {
        let trip = Infinity;
        try {
          trip = walkDuration(legsBetween(here, back.place, who));
        } catch {
          trip = Infinity;
        }
        // … and only if the next slot elsewhere can still be reached from there.
        const next = mine
          .filter((m) => m.window[0] > ev.t)
          .sort((x, y) => x.window[0] - y.window[0])[0];
        let onward = 0;
        if (next && next.window[0] < back.window[1] && !same(next.place.point, back.place.point))
          try {
            onward = walkDuration(legsBetween(back.place, next.place, who));
          } catch {
            onward = Infinity;
          }
        const by = next && next.window[0] < back.window[1] ? next.window[0] - onward : back.window[1];
        if (ev.t + trip + minDwell > by) {
          if (!visit)
            append(stays, {
              place: here,
              start: ev.t,
              soft: true,
              action: restAction(here),
              title: ev.p.title,
              visible: true,
            });
          continue;
        }
      }
      if (back)
        append(stays, {
          place: back.place,
          start: ev.t,
          soft: true,
          action: back.action,
          title: back.title,
          visible: true,
        });
      else if (!visit)
        append(stays, {
          place: ev.p.place,
          start: ev.t,
          soft: true,
          action: restAction(ev.p.place),
          title: ev.p.title,
          visible: true,
        });
    }
    if (visit) {
      const last = mine.at(-1)!;
      if (last.window[1] >= 720)
        throw new Error(`${who.spec.id}: a visit must end before 720 s`);
      stays.push(outer('Driving back to the center', last.window[1], true));
    } else {
      const first = stays[0].place,
        end = stays.at(-1)!.place;
      if (!same(first.point, end.point))
        throw new Error(
          `${who.spec.id}: the day ends at ${end.label} (${end.point.map(r2).join(', ')}) but starts at ${first.label} (${first.point.map(r2).join(', ')}); end where the day begins`,
        );
    }
    who.stays = stays;
  }
  // --- Stays: scheduled people ------------------------------------------------
  const holes: Record<string, InstanceHole[]> = {};
  const scheduledInteractions = new Map<string, Omit<Interaction, 'zoneId'>>();
  for (const who of people.values()) {
    const spec = who.spec;
    if (!isScheduled(spec)) continue;
    const where = spec.id,
      arriveAt = resolvePoint(spec.arrive.anchor),
      leaveAt = resolvePoint(spec.leave.anchor);
    const door = (point: Vec2, label: string): Place => ({
      kind: 'door',
      point,
      heading: 0,
      seated: false,
      label,
    });
    const stays: Stay[] = [],
      mine: InstanceHole[] = [];
    const hidden = (point: Vec2, start: number, kind: InstanceHole['kind'], end: number) => {
      stays.push({
        place: door(point, 'the door'),
        start,
        soft: false,
        action: 'idle',
        title: 'Away',
        visible: false,
      });
      mine.push({ kind, start, end, from: point, to: point });
    };
    /** Appears at a door at t and walks straight on to the next stop. */
    const appear = (point: Vec2, t: number, next: Place, title: string) => {
      stays.push({
        place: door(point, 'the door'),
        start: t,
        soft: true,
        action: 'idle',
        title: 'Arriving',
        visible: true,
        instant: true,
      });
      stays.push({
        place: next,
        start: t,
        soft: true,
        action: restAction(next),
        title,
        visible: true,
      });
    };
    const stopPlace = (s: ScheduleStop): Place => {
      roomClear(s.roomId);
      if (typeof s.at === 'string') {
        if (!objectById.has(s.at)) throw new Error(`${where}: no object ${s.at}`);
        const pose = seatPose(view, s.at);
        return {
          kind: 'indoor',
          point: pose.anchor,
          heading: s.heading ?? pose.heading,
          seated: s.seated ?? true,
          seatId: s.at,
          sitsOn: s.at,
          roomId: s.roomId,
          label: roomLabel(s.roomId),
        };
      }
      if (s.seat && !objectById.has(s.seat))
        throw new Error(`${where}: no object ${s.seat} to sit on`);
      return {
        kind: 'indoor',
        point: s.at,
        heading: s.heading ?? 0,
        seated: !!s.seated,
        ...(s.seat ? { sitsOn: s.seat } : {}),
        roomId: s.roomId,
        label: roomLabel(s.roomId),
      };
    };
    const stops = [...spec.stops].sort((a, b) => a.window[0] - b.window[0]);
    const away = [...(spec.away ?? [])].sort((a, b) => a[0] - b[0]);
    for (const w of away)
      if (w[0] < spec.arrive.t || w[1] > spec.leave.t || w[1] <= w[0])
        throw new Error(`${where}: away window ${w.join('–')} is outside ${spec.arrive.t}–${spec.leave.t}`);
    if (!stops.length) throw new Error(`${where}: no stops`);
    if (spec.arrive.t > 0) hidden(arriveAt, 0, 'before', spec.arrive.t);
    let cursor = spec.arrive.t,
      entered = false;
    for (const [i, s] of stops.entries()) {
      if (s.window[0] < cursor - 1e-9)
        throw new Error(`${where}: stop ${i} starts at ${s.window[0]}, before ${cursor}`);
      for (const w of away)
        if (overlaps(w, s.window))
          throw new Error(`${where}: stop ${i} (${s.window.join('–')}) overlaps away ${w.join('–')}`);
      const place = stopPlace(s);
      // Away windows before this stop: out through the leave anchor and back.
      for (const w of away)
        if (w[0] >= cursor - 1e-9 && w[1] <= s.window[0] + 1e-9) {
          if (!entered) throw new Error(`${where}: away ${w.join('–')} before the first stop`);
          hidden(leaveAt, w[0], 'away', w[1]);
          appear(leaveAt, w[1], place, s.title);
        }
      if (!entered) {
        appear(arriveAt, spec.arrive.t, place, s.title);
        entered = true;
      }
      append(stays, {
        place,
        start: s.window[0],
        soft: false,
        action: s.action,
        title: s.title,
        visible: true,
        until: s.window[1],
      });
      const next = stops[i + 1]?.window[0] ?? spec.leave.t;
      if (s.window[1] < next - 1e-9)
        stays.push({
          place,
          start: s.window[1],
          soft: true,
          action: restAction(place),
          title: s.title,
          visible: true,
        });
      cursor = s.window[1];
      if (s.interaction) {
        const w = s.interaction.window ?? s.window,
          ids = [spec.id, ...(s.with ?? [])];
        const known = scheduledInteractions.get(s.interaction.id);
        if (known) {
          if (known.start !== w[0] || known.end !== w[1] || known.category !== s.interaction.category)
            throw new Error(`${where}: interaction ${s.interaction.id} is declared twice with different windows or categories`);
          for (const id of ids) if (!known.actorIds.includes(id)) known.actorIds.push(id);
        } else
          scheduledInteractions.set(s.interaction.id, {
            id: s.interaction.id,
            label: s.interaction.label,
            category: s.interaction.category,
            description: s.interaction.description,
            actorIds: ids,
            start: w[0],
            end: w[1],
          });
      }
    }
    for (const w of away)
      if (w[0] >= cursor - 1e-9)
        throw new Error(`${where}: away ${w.join('–')} after the last stop`);
    if (spec.leave.t < 720) hidden(leaveAt, spec.leave.t, 'after', 720);
    // In sight at both ends of the day: the loop seam must not jump. Someone
    // who arrives later is hidden at 0 s, so the seam is out of sight.
    else if (spec.arrive.t <= 0 && !same(stays[0].place.point, stays.at(-1)!.place.point))
      throw new Error(`${where}: present at 0 and 720 s, so the day must end where it starts`);
    who.stays = stays;
    if (mine.length) holes[spec.id] = mine;
  }
  // --- Timelines and contacts -------------------------------------------------
  // Consecutive stays at one point (action changes, waiting) form a run: one
  // physical stay entered by at most one walk and left by the next.
  const together = (a: Stay, b: Stay) =>
    a.visible === b.visible && same(a.place.point, b.place.point);
  const runStart = (who: Person, k: number) => {
    let j = k;
    while (j > 0 && !who.walks[j] && together(who.stays[j - 1], who.stays[j]))
      j--;
    return j;
  };
  /** When the person reaches the run containing stay k. */
  const arrival = (who: Person, k: number) => {
    const j = runStart(who, k);
    return j === 0 ? 0 : (who.walks[j]?.end ?? who.stays[j].start);
  };
  /** When the person leaves the run containing stay k (the next walk). */
  const departure = (who: Person, k: number) => {
    for (let j = k + 1; j < who.stays.length; j++) {
      const w = who.walks[j];
      if (w) return w.start;
      if (!together(who.stays[j - 1], who.stays[j])) return who.stays[j].start;
    }
    return 720;
  };
  const holdSpan = (who: Person, k: number): [number, number] => {
    const w = who.walks[k],
      start = Math.max(
        k === 0 ? 0 : w ? w.end : who.stays[k].start,
        arrival(who, k),
      ),
      end = Math.min(
        k + 1 < who.stays.length ? who.stays[k + 1].start : 720,
        departure(who, k),
      );
    return [start, Math.max(start, end)];
  };
  /** Reaching a hole's door early: waiting there in sight until the hole opens. */
  const doorWait = (who: Person, k: number): [number, number] | null => {
    const stay = who.stays[k],
      [h0] = holdSpan(who, k);
    return !stay.visible && h0 < stay.start - 1e-9 ? [h0, stay.start] : null;
  };
  const timeline = (who: Person): Item[] => {
    if (who.timeline) return who.timeline;
    const items: Item[] = [];
    who.stays.forEach((stay, k) => {
      const w = who.walks[k];
      if (w)
        for (const l of legTimes(w.legs, w.start, w.factor))
          items.push({ t0: l.t0, t1: l.t1, path: l.path, stay: k, walk: true });
      const [h0, h1] = holdSpan(who, k),
        wait = doorWait(who, k);
      if (h1 > h0 && stay.visible)
        items.push({ t0: h0, t1: h1, path: [stay.place.point], stay: k, walk: false });
      if (wait)
        items.push({ t0: wait[0], t1: wait[1], path: [stay.place.point], stay: k, walk: false });
    });
    items.sort((a, b) => a.t0 - b.t0);
    return (who.timeline = items);
  };
  const positionAt = (who: Person, t: number): Vec2 | null => {
    const items = timeline(who);
    let lo = 0,
      hi = items.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1,
        it = items[mid];
      if (t < it.t0) hi = mid - 1;
      else if (t >= it.t1) lo = mid + 1;
      else
        return it.walk
          ? pointAlong(it.path, (t - it.t0) / (it.t1 - it.t0 || 1))
          : it.path[0];
    }
    return null;
  };
  const everyone = [...people.values()];
  /** First contact closer than `spacing` while `at` gives my position, or null. */
  const contact = (
    me: Person,
    at: (t: number) => Vec2 | null,
    t0: number,
    t1: number,
  ) => {
    // Finer and a little wider than the 0.25 s check of the result, which
    // samples on a different phase.
    const margin = spacing + 0.02;
    for (let i = 0, t = t0; t <= t1 + 1e-9; t = t0 + ++i * 0.1) {
      const p = at(t);
      if (!p) continue;
      for (const other of everyone) {
        if (other === me) continue;
        const q = positionAt(other, t);
        if (
          q &&
          Math.abs(p[0] - q[0]) < margin &&
          Math.abs(p[1] - q[1]) < margin &&
          distance(p, q) < margin
        )
          return { other: other.spec.id, t, d: distance(p, q) };
      }
    }
    return null;
  };
  /** Where others stand still at some point in [t0, t1]. */
  const stillPoints = (me: Person, t0: number, t1: number) => {
    const out: Vec2[] = [];
    for (const other of everyone)
      if (other !== me)
        other.stays.forEach((s, k) => {
          if (!s.visible) return;
          const [h0, h1] = holdSpan(other, k);
          if (h1 > t0 && h0 < t1) out.push(s.place.point);
        });
    return out;
  };
  const nearestTo = (legs: Leg[], pts: Vec2[]) => {
    let d = Infinity;
    for (const l of legs)
      for (let i = 1; i < l.path.length; i++)
        for (const q of pts)
          d = Math.min(d, distanceToSegment(q, l.path[i - 1], l.path[i]));
    return d;
  };
  // --- Scheduling: every walk, in time order ---------------------------------
  type Job = { who: Person; k: number; legs: Leg[]; dur: number; nominal: number };
  const jobs: Job[] = [];
  for (const who of people.values())
    for (let k = 1; k < who.stays.length; k++) {
      who.walks[k] = null;
      const a = who.stays[k - 1],
        b = who.stays[k];
      if (same(a.place.point, b.place.point) || (!a.visible && !b.visible))
        continue;
      let legs: Leg[];
      try {
        legs = legsBetween(a.place, b.place, who);
      } catch (e) {
        throw new Error(
          `${who.spec.id}: no route from ${a.place.label} to ${b.place.label} (${b.start} s): ${(e as Error).message}`,
        );
      }
      const dur = walkDuration(legs);
      jobs.push({ who, k, legs, dur, nominal: b.soft ? b.start : b.start - dur });
    }
  jobs.sort(
    (a, b) =>
      a.nominal - b.nominal ||
      b.dur - a.dur ||
      (a.who.spec.id < b.who.spec.id ? -1 : 1),
  );
  for (const job of jobs) {
    const { who, k } = job,
      a = who.stays[k - 1],
      b = who.stays[k];
    // Leaving a run: it must have lasted `minDwell` (not at the day's start,
    // an appearance or off the instance); a scheduled person's run lasts
    // until its stops' windows end, however short they are. Arriving late
    // (soft): before the run's next slot starts there.
    const first = runStart(who, k - 1),
      aStart = arrival(who, k - 1),
      until = Math.max(
        -Infinity,
        ...who.stays.slice(first, k).map((s) => s.until ?? -Infinity),
      ),
      dwell = isScheduled(who.spec)
        ? Math.max(0, until - aStart)
        : first > 0 && who.stays[first].visible && !who.stays[first].instant
          ? minDwell
          : 0;
    let nextStart = Infinity;
    for (let j = k + 1; j < who.stays.length; j++) {
      if (!together(who.stays[j - 1], who.stays[j])) break;
      if (!who.stays[j].soft) {
        nextStart = who.stays[j].start;
        break;
      }
    }
    const t0 = (b.soft ? b.start : b.start - job.dur) - 14,
      t1 = (b.soft ? b.start + job.dur : b.start) + 14;
    let still = stillPoints(who, t0, t1).filter(
      (q) => distance(q, a.place.point) > 0.05 && distance(q, b.place.point) > 0.05,
    );
    /** Walks of `ids` committed around [t0, t1], to route beside. */
    const pathsOf = (ids: Set<string>) =>
      everyone
        .filter((o) => ids.has(o.spec.id))
        .flatMap((o) =>
          o.walks.flatMap((w) =>
            w && w.end > t0 && w.start < t1 ? w.legs.map((l) => l.path) : [],
          ),
        );
    let reach = spacing + 0.18;
    const near = (p: Vec2, q: Vec2) =>
      Math.abs(q[0] - p[0]) < reach &&
      Math.abs(q[1] - p[1]) < reach &&
      distance(p, q) < reach;
    // Cells to keep off; never right at the walk's own ends. Another walk's
    // lane is kept off only on open floor (doorways stay shared: timing
    // separates people there).
    const open = (p: Vec2) => {
      const i = Math.round(p[0] / NAV_STEP) - g.ix0,
        j = Math.round(p[1] / NAV_STEP) - g.iz0;
      return (
        i >= 0 && j >= 0 && i < g.nx && j < g.nz && g.wallMargin[i * g.nz + j] >= 1.1
      );
    };
    const avoiding = (paths: Vec2[][]) => (p: Vec2) =>
      distance(p, a.place.point) > 0.3 &&
      distance(p, b.place.point) > 0.3 &&
      (still.some((q) => near(p, q)) ||
        (open(p) &&
          paths.some((path) =>
            path.some(
              (q, i) =>
                i > 0 && distanceToSegment(p, path[i - 1], q) < reach,
            ),
          )));
    let legs = job.legs;
    // Around people standing still at the time, when the plain route passes them.
    // A full room may leave no way round everyone: then round only those the
    // plain route passes, at a wider and then a closer reach.
    if (nearestTo(legs, still) < spacing + 0.1) {
      const everyoneStill = still,
        inTheWay = still.filter((q) => nearestTo(job.legs, [q]) < spacing + 0.1);
      reroute: for (const set of [everyoneStill, inTheWay])
        for (const r of [spacing + 0.18, spacing + 0.1]) {
          still = set;
          reach = r;
          try {
            legs = legsBetween(a.place, b.place, who, avoiding([]));
            break reroute;
          } catch {
            legs = job.legs;
          }
        }
      still = everyoneStill;
    }
    reach = spacing + 0.18;
    let chosen: Walk | null = null,
      firstHit: ReturnType<typeof contact> = null;
    const crossed: string[] = [];
    // Up to three routes: the plain one, then beside the first walk it ran
    // into, then beside every walk it ran into.
    const plain = legs;
    route: for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) {
        if (!crossed.length) break;
        const ids = new Set(attempt === 1 ? crossed.slice(0, 1) : crossed);
        try {
          legs = legsBetween(a.place, b.place, who, avoiding(pathsOf(ids)));
        } catch {
          legs = plain;
          continue;
        }
      }
      for (const factor of [1, 0.9, 0.8, 0.7, 0.6])
        for (let step = 0; step <= MAX_SHIFT; step++) {
          const dur = walkDuration(legs, factor);
          let start: number, end: number;
          if (b.soft) {
            start = b.start + step;
            end = start + dur;
            if (end > Math.min(nextStart, 720) + 1e-9) continue;
          } else {
            end = b.start - step;
            start = end - dur;
            if (start < aStart + dwell - 1e-9) continue;
          }
          const timed = legTimes(legs, start, factor);
          const at = (t: number): Vec2 | null => {
            for (const l of timed)
              if (t >= l.t0 && t <= l.t1)
                return pointAlong(l.path, (t - l.t0) / (l.t1 - l.t0 || 1));
            return null;
          };
          let hit = contact(who, at, start, end);
          // The extra wait: at the origin (moved later) or at the destination (moved earlier).
          if (!hit && step && b.soft && a.visible)
            hit = contact(who, () => a.place.point, b.start, start);
          if (!hit && step && !b.soft)
            hit = contact(who, () => b.place.point, end, b.start);
          if (!hit) {
            chosen = { legs, start, end, factor };
            if (step || factor < 1 || attempt)
              notes.push(
                `${who.spec.id}: walk to ${b.place.label} ${b.soft ? 'leaves' : 'arrives'} ${step} s ${b.soft ? 'later' : 'earlier'}${factor < 1 ? ` at ${Math.round(factor * 100)}% gait` : ''}${attempt ? ', routed beside others' : ''} (${r3(start)}–${r3(end)} s)`,
              );
            break route;
          }
          firstHit ??= hit;
          if (!crossed.includes(hit.other)) crossed.push(hit.other);
        }
    }
    if (!chosen) {
      const dur = walkDuration(legs),
        metres = r2(legs.reduce((n, l) => n + pathLength(l.path), 0));
      if (!b.soft && b.start - dur < aStart + dwell)
        throw new Error(
          `${who.spec.id}: ${metres} m from ${a.place.label} to ${b.place.label} needs ${r2(dur)} s; the stay at ${a.place.label} would last ${r2(b.start - dur - aStart)} s (minimum ${dwell}) before ${b.start} s`,
        );
      if (b.soft && b.start + dur > Math.min(nextStart, 720))
        throw new Error(
          `${who.spec.id}: walking ${metres} m to ${b.place.label} from ${b.start} s takes ${r2(dur)} s, too late for ${nextStart} s`,
        );
      const other = firstHit && positionAt(people.get(firstHit.other)!, firstHit.t);
      throw new Error(
        `${who.spec.id}: the walk from ${a.place.label} (${a.place.point.map(r2).join(', ')}) to ${b.place.label} (${b.place.point.map(r2).join(', ')}) for ${b.start} s passes ${firstHit?.other} at ${r2(firstHit?.d ?? 0)} m around ${r2(firstHit?.t ?? 0)} s${other ? ` at (${other.map(r2).join(', ')})` : ''}, even moved up to ${MAX_SHIFT} s, slowed and routed beside; adjust a slot window`,
      );
    }
    who.walks[k] = chosen;
    who.timeline = null;
  }
  // --- Output (the setting's local frame) ------------------------------------
  const outPoint = (p: Vec2) => pt3(frameToWorld(frame, p));
  const outHeading = (h: number) => r3(norm(h + frame.heading));
  const actors: InstanceActor[] = [];
  for (const who of people.values()) {
    const segments: InstanceSegment[] = [];
    let heading = who.stays[0].place.heading;
    who.stays.forEach((stay, k) => {
      const w = who.walks[k];
      if (w)
        for (const l of legTimes(w.legs, w.start, w.factor)) {
          segments.push({
            start: l.t0,
            end: l.t1,
            action: w.legs[0].action,
            path: l.path.map(outPoint),
            heading: outHeading(heading),
            title: `To ${stay.place.label}`,
          });
          heading = facingTo(l.path.at(-2)!, l.path.at(-1)!);
        }
      const [h0, h1] = holdSpan(who, k),
        wait = doorWait(who, k);
      if (stay.visible && (stay.place.kind === 'indoor' || stay.place.kind === 'outdoor'))
        heading = stay.place.heading;
      const p = outPoint(stay.place.point);
      if (wait)
        segments.push({
          start: wait[0],
          end: wait[1],
          action: 'idle',
          path: [p, p],
          heading: outHeading(heading),
          title: 'Waiting at the door',
        });
      segments.push({
        start: wait ? wait[1] : h0,
        end: h1,
        action: stay.action,
        path: [p, p],
        heading: outHeading(heading),
        title: stay.title,
        ...(stay.visible ? {} : { visible: false }),
        ...(stay.visible && stay.place.seated ? { seated: true } : {}),
        ...(stay.visible && stay.place.seated && stay.place.sitsOn
          ? { seatId: stay.place.sitsOn }
          : {}),
      });
    });
    const kept: InstanceSegment[] = [];
    for (const s of segments) {
      const seg = { ...s, start: r3(s.start), end: r3(s.end) },
        last = kept.at(-1);
      if (seg.end - seg.start <= 1e-6) continue;
      // One segment for a pose held across stays (a slot and the wait after it).
      if (
        last &&
        last.visible !== false &&
        seg.visible !== false &&
        seg.path.length === 2 &&
        last.path.length === 2 &&
        same(seg.path[0], seg.path[1]) &&
        same(last.path[1], seg.path[0]) &&
        same(last.path[0], last.path[1]) &&
        last.action === seg.action &&
        last.title === seg.title &&
        last.heading === seg.heading &&
        last.seated === seg.seated
      )
        last.end = seg.end;
      else kept.push(seg);
    }
    for (let i = 1; i < kept.length; i++) kept[i].start = kept[i - 1].end;
    kept[0].start = 0;
    kept.at(-1)!.end = 720;
    const spec = who.spec;
    actors.push({
      id: spec.id,
      role: spec.role,
      variant: spec.variant,
      ...(spec.profileId ? { profileId: spec.profileId } : {}),
      label: spec.label,
      offset: 0,
      ...(spec.mobility ? { mobility: spec.mobility } : {}),
      segments: kept,
    });
  }
  const interactions: Omit<Interaction, 'zoneId'>[] = [];
  for (const scene of scenes) {
    if (scene.interaction === false) continue;
    const ids = [
      ...new Set([...scene.slots.map((s) => s.who), ...(scene.with ?? [])]),
    ];
    for (const id of ids) personOf(id, scene.id);
    interactions.push({
      id: scene.id,
      label: scene.label,
      category: scene.category,
      description: scene.description,
      actorIds: ids,
      start: scene.window[0],
      end: scene.window[1],
    });
  }
  // A stop's `with` may name people outside the cast (hand-authored in
  // community-people.ts); `npm run validate:community` checks that the
  // composed source has them.
  for (const i of scheduledInteractions.values()) interactions.push(i);
  for (const id of cast.keep?.actors ?? [])
    if (!people.has(id)) throw new Error(`${setting.id}: actor ${id} must be kept`);
  for (const id of cast.keep?.interactions ?? [])
    if (!interactions.some((i) => i.id === id))
      throw new Error(`${setting.id}: interaction ${id} must be kept`);
  return {
    actors,
    interactions,
    holes: Object.fromEntries(
      Object.entries(holes).map(([id, hs]) => [
        id,
        hs.map((h) => ({ ...h, from: outPoint(h.from), to: outPoint(h.to) })),
      ]),
    ),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Validation of a generated cast (SPEC-facility-instance §10).
// ---------------------------------------------------------------------------
export type CastReport = {
  people: number;
  segments: number;
  walks: number;
  /** Fastest walk (m/s). */
  maxGait: number;
  /** Wall clearance of walking samples (5 cm) on and around the building (m). */
  minWalkWall: number;
  /** Wall clearance of any visible pose (m). */
  minPoseWall: number;
  /** Stationary poses checked against furniture. */
  furniturePoses: number;
  /** Closest two visible people at 0.25 s. */
  closest: { d: number; t: number; a: string; b: string };
  /** People outside the cast that its interactions name (the composed source must have them). */
  external: string[];
};
/** Position of a generated actor at t (setting-local), and whether it is visible. */
function sampleAt(a: InstanceActor, t: number) {
  const s =
    a.segments.find((x) => t >= x.start && t < x.end) ?? a.segments.at(-1)!;
  return {
    p: pointAlong(s.path, (t - s.start) / (s.end - s.start || 1)),
    visible: s.visible !== false,
  };
}
/**
 * Check a generated cast against its instance: contiguous 0–720 tracks that
 * never jump on foot (also across the loop seam) and walk at most 1.65 m/s;
 * walking samples (5 cm) on and around the building ≥ 0.20 m from walls and
 * any visible pose ≥ 0.15 m; stationary poses in a room clear of furniture
 * (`roomPlacement(view, room).clear(p, seated ? 0.19 : 0.28, seat)`); any two
 * visible people ≥ `spacing` apart at 0.25 s; interaction windows inside
 * the day (members outside the cast are listed in `external`, for the
 * composed-source check); holes match their hidden placeholders. Throws on
 * the first failure.
 */
export function checkInstanceCast(
  facility: Facility,
  setting: CareSetting,
  cast: InstanceCast,
  options: { nav: NavOptions; spacing?: number },
): CastReport {
  const cfg = setting.facility!,
    spacing = options.spacing ?? 0.6,
    view = instanceView(facility, cfg),
    g = navGrid(view, options.nav),
    toF = (p: Vec2) => frameToLocal(cfg.frame, p);
  const xs = view.zones.flatMap((z) => z.polygon.map((p) => p[0])),
    zs = view.zones.flatMap((z) => z.polygon.map((p) => p[1])),
    nearBuilding = (p: Vec2) =>
      p[0] >= Math.min(...xs) - 1 &&
      p[0] <= Math.max(...xs) + 1 &&
      p[1] >= Math.min(...zs) - 1 &&
      p[1] <= Math.max(...zs) + 1;
  const rooms = [...view.rooms]
    .filter((r) => r.kind !== 'shell')
    .sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon));
  const clears = new Map<string, ReturnType<typeof roomPlacement>['clear']>();
  const clearOf = (roomId: string) => {
    let c = clears.get(roomId);
    if (!c)
      clears.set(
        roomId,
        (c = roomPlacement(view, view.rooms.find((r) => r.id === roomId)!).clear),
      );
    return c;
  };
  const seatAt = (p: Vec2) =>
    view.objects.find(
      (o) =>
        SEAT_KINDS.has(view.assets[o.assetId]?.kind ?? '') &&
        Math.hypot(o.position[0] - p[0], o.position[2] - p[1]) < 0.01,
    )?.id;
  const ids = new Set(cast.actors.map((a) => a.id));
  const report: CastReport = {
    people: cast.actors.length,
    segments: 0,
    walks: 0,
    maxGait: 0,
    minWalkWall: Infinity,
    minPoseWall: Infinity,
    furniturePoses: 0,
    closest: { d: Infinity, t: 0, a: '', b: '' },
    external: [],
  };
  for (const a of cast.actors) {
    const segs = a.segments;
    if (segs[0].start !== 0 || segs.at(-1)!.end !== 720)
      throw new Error(`${a.id}: the track must cover 0–720 s`);
    segs.forEach((s, i) => {
      report.segments++;
      if (s.end <= s.start) throw new Error(`${a.id}: empty segment at ${s.start} s`);
      const next = segs[(i + 1) % segs.length];
      if (i < segs.length - 1 && Math.abs(next.start - s.end) > 1e-6)
        throw new Error(`${a.id}: gap at ${s.end} s`);
      const onFoot = s.visible !== false && next.visible !== false;
      if (onFoot && distance(s.path.at(-1)!, next.path[0]) > 1e-6)
        throw new Error(
          `${a.id}: jumps ${r2(distance(s.path.at(-1)!, next.path[0]))} m at ${s.end % 720} s`,
        );
      const walking = s.action === 'walk' || s.action === 'roll';
      if (walking) {
        const gait = pathLength(s.path) / (s.end - s.start);
        report.walks++;
        report.maxGait = Math.max(report.maxGait, gait);
        if (gait > 1.65)
          throw new Error(`${a.id}: walks at ${r2(gait)} m/s at ${s.start} s`);
      }
      if (s.visible === false) return;
      const path = s.path.map(toF);
      if (walking) {
        for (let k = 1; k < path.length; k++) {
          const p = path[k - 1],
            q = path[k],
            n = Math.max(1, Math.ceil(distance(p, q) / 0.05));
          for (let j = 0; j <= n; j++) {
            const x: Vec2 = [p[0] + ((q[0] - p[0]) * j) / n, p[1] + ((q[1] - p[1]) * j) / n];
            if (!nearBuilding(x)) continue;
            const c = wallClearanceAt(g, x);
            report.minWalkWall = Math.min(report.minWalkWall, c);
            if (c < 0.2)
              throw new Error(
                `${a.id}: the walk "${s.title}" at ${s.start} s passes ${r2(c)} m from a wall near (${x.map(r2).join(', ')})`,
              );
          }
        }
        return;
      }
      const p = path[0];
      if (nearBuilding(p)) {
        const c = wallClearanceAt(g, p);
        report.minPoseWall = Math.min(report.minPoseWall, c);
        if (c < 0.15)
          throw new Error(`${a.id}: stands ${r2(c)} m from a wall at ${s.start} s`);
      }
      const room = rooms.find((r) => insidePolygon(p, r.polygon));
      if (room) {
        report.furniturePoses++;
        const seat = s.seated ? (s.seatId ?? seatAt(p)) : undefined;
        if (!clearOf(room.id)(p, s.seated ? 0.19 : 0.28, seat))
          throw new Error(
            `${a.id}: "${s.title}" at ${s.start} s overlaps furniture or a wall in ${room.id} at (${p.map(r2).join(', ')})`,
          );
      }
    });
  }
  for (const i of cast.interactions) {
    if (!(i.start >= 0 && i.end <= 720 && i.end > i.start))
      throw new Error(`${i.id}: window ${i.start}–${i.end}`);
    for (const id of i.actorIds)
      if (!ids.has(id) && !report.external.includes(id)) report.external.push(id);
  }
  report.external.sort();
  for (const [id, holes] of Object.entries(cast.holes)) {
    const a = cast.actors.find((x) => x.id === id);
    if (!a) throw new Error(`holes for unknown actor ${id}`);
    for (const h of holes)
      if (
        !a.segments.some(
          (s) =>
            s.visible === false &&
            Math.abs(s.start - h.start) < 1e-6 &&
            Math.abs(s.end - h.end) < 1e-6,
        )
      )
        throw new Error(`${id}: the ${h.kind} hole ${h.start}–${h.end} s has no placeholder`);
  }
  for (let i = 0, t = 0; t < 720; t = ++i * 0.25) {
    const here = cast.actors.map((a) => ({ id: a.id, ...sampleAt(a, t) }));
    for (let x = 0; x < here.length; x++) {
      if (!here[x].visible) continue;
      for (let y = x + 1; y < here.length; y++) {
        if (!here[y].visible) continue;
        const d = distance(here[x].p, here[y].p);
        if (d < report.closest.d)
          report.closest = { d: r2(d), t, a: here[x].id, b: here[y].id };
        if (d < spacing)
          throw new Error(
            `${here[x].id} and ${here[y].id} are ${r2(d)} m apart at ${t} s (need ${spacing})`,
          );
      }
    }
  }
  report.maxGait = r2(report.maxGait);
  report.minWalkWall = r2(report.minWalkWall);
  report.minPoseWall = r2(report.minPoseWall);
  return report;
}
