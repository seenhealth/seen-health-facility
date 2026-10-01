/**
 * Itinerary DSL + compiler.
 *
 * A scenario (see `app/data/scenarios/day-in-the-life.json`) names a hero, the
 * base actor she replaces, and a list of steps on the shared 720 s clock. Each
 * step carries story copy (owned by the story) and a `placement` block (owned
 * here): the stops the hero visits, where she stands or sits, what she does,
 * and which companion staff meet her. `compileScenario` turns that into
 * ActorSpec tracks on navigable routes plus interaction tracks, merged into
 * the base care-day loop.
 *
 * Runs in the browser and in Node (scripts/build-scenario.mjs); the app loads
 * the precompiled result through `story-source.ts` instead of compiling live.
 */
import {
  activityData,
  sampleEscort,
  type ActivitySource,
  type ActorSpec,
  type Interaction,
  type Segment,
} from '../model/activity';
import type { Action, CharacterRole } from '../model/characters';
import type { Facility, Vec2 } from '../model/schema';
import careTeam from '../data/care-team.json';
import program from '../data/day-program.json';
import { CARE_DAY } from './clock';
import {
  mergeTracks,
  type CompiledStep,
  type CompiledStop,
  type CompiledTracks,
} from './tracks';
export { mergeTracks, type CompiledStep, type CompiledStop, type CompiledTracks };
import {
  MOBILITY_CLEARANCE,
  NavError,
  WALL_CLEARANCE,
  dayProgramNavOptions,
  distance,
  insidePolygon,
  navGrid,
  pathLength,
  route,
  snap,
  wallClearanceAt,
  zoneAt,
  type NavGrid,
  type NavOptions,
  type NavReservation,
} from './nav';

// ---------------------------------------------------------------------------
// DSL types (the JSON shape of a scenario)
// ---------------------------------------------------------------------------
export type Window = [number, number];
/** Where someone stands or sits. `seat` (an object id) supplies anchor + heading. */
export type PlacementPoint = {
  anchor?: Vec2;
  seat?: string;
  /** Radians; 0 faces +z. Defaults to the seat's facing or the arrival direction. */
  heading?: number;
  /** Waypoints from free floor to the anchor (reversed when leaving). */
  approach?: Vec2[];
};
export type CompanionDuty = PlacementPoint & {
  /** Companion id (from `placement.companions`) or an existing base actor. */
  id: string;
  action: Action;
  seated?: boolean;
  /** Seconds relative to the hero's arrival (default -3: waiting for her). */
  join?: number;
  /** Seconds relative to the hero's departure (default +1). */
  leave?: number;
  title?: string;
};
export type StopPlacement = PlacementPoint & {
  id: string;
  window: Window;
  roomId?: string;
  title: string;
  action: Action;
  seated?: boolean;
  /** Follow the day-room program's standing action while present. */
  followProgram?: boolean;
  /** Minimum seconds at the anchor inside the window (default from placement). */
  minDwell?: number;
  /** Stage title for the walk that leads here (default "Walk to <title>"). */
  walkTitle?: string;
  category: string;
  companions?: CompanionDuty[];
  /** Existing base actors who take part (for interaction tracks and metrics). */
  partners?: string[];
  description?: string;
};
export type StepPlacement = {
  mode: 'meeting' | 'arrival' | 'checkin' | 'visit' | 'departure';
  category?: string;
  stops?: StopPlacement[];
  /** Duties at absolute times (used while the hero follows copied arrival tracks). */
  duties?: (CompanionDuty & { window: Window })[];
  partners?: string[];
};
export type ScenarioStep = {
  id: string;
  window: Window;
  zoneId: string;
  roomId: string | null;
  title?: string;
  kicker?: string;
  body?: string;
  roles: string[];
  handoffs: { from: string; to: string; note: string }[];
  heroPresent: boolean;
  stops?: { roomId: string; window: Window; activity: string }[];
  placement?: StepPlacement;
};
export type CompanionSpec = {
  id: string;
  /** care-team.json member id (pcp, rn, …). */
  team: string;
  name: string;
  variant: number;
  /** Back-room point where the companion appears and disappears. */
  home: Vec2;
  /** Optional different disappearance point. */
  exit?: Vec2;
};
export type MeetingPlacement = {
  levelId: string;
  roomId: string;
  /** Stair landing where attendees appear/disappear. */
  entry: Vec2;
  door: Vec2;
  /** Aisle lines inside the room: south/north are z values, east is an x value. */
  aisles: { south: number; north: number; east: number };
  tableCenterZ: number;
  seats: { team: string; seat: string; profileFrom?: string }[];
  speed: number;
  /** Seconds between attendees crossing the door. */
  stagger: number;
  /** Seconds each speaker holds the floor. */
  turnSeconds: number;
  steps: string[];
};
export type ScenarioPlacement = {
  heroGait: {
    preferred: number;
    max: number;
    clearance: number;
    step: number;
    /** Feasible gaits compared for crossings with moving base actors (default 5). */
    alternatives?: number;
  };
  staffGait: { preferred: number; max: number };
  minDwellFraction: number;
  minDwellSeconds: number;
  replaced: {
    arrivalThroughTitle: string;
    departureTitle: string;
    escortId: string;
    escortLabel?: string;
    boardingSpeed: number;
  };
  companions: CompanionSpec[];
  meeting: MeetingPlacement;
  /** Extra areas hero/companion routes avoid (e.g. a base actor's long dwell spot). */
  reservations?: NavReservation[];
  /** Keep new routes off spots where base actors stand still for a while. */
  reserveBaseDwell?: { minSeconds: number; halfSize: number };
  /** Background occupants replaced by this story's cast at shared activity positions. */
  replacedBackgroundActors?: string[];
};
export type Scenario = {
  version: string;
  id: string;
  title: string;
  basis?: string;
  clock: { duration: number; dayStartMinutes: number; dayDurationMinutes: number };
  hero: {
    id: string;
    name: string;
    role: string;
    mobility: 'cane' | 'walker' | 'wheelchair';
    replacesActor: string;
    [k: string]: unknown;
  };
  steps: ScenarioStep[];
  placement?: ScenarioPlacement;
};

export type CompileResult = {
  source: ActivitySource;
  heroId: string;
  steps: CompiledStep[];
  tracks: CompiledTracks;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const pt = (p: Vec2): Vec2 => [r3(p[0]), r3(p[1])];
const same = (a: Vec2, b: Vec2) => distance(a, b) < 1e-6;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const teamById = new Map(careTeam.members.map((m) => [m.id, m]));
export const careTeamRole = (team: string) => {
  const m = teamById.get(team);
  if (!m) throw new Error(`Unknown care-team member: ${team}`);
  return m.characterRole as CharacterRole;
};
/** Heading of someone seated on a furniture object (front of the seat). */
export function seatPose(model: Facility, objectId: string) {
  const o = model.objects.find((x) => x.id === objectId);
  if (!o) throw new Error(`Unknown seat object: ${objectId}`);
  const kind = model.assets[o.assetId]?.kind || '';
  // Recliners and barber chairs are modelled facing +Z; chairs, stools and
  // benches face -Z (their backs sit at +Z), as build-activity.py assumes.
  const front = ['clinical-recliner', 'dental-chair', 'barber-chair'].includes(
    kind,
  )
    ? 0
    : Math.PI;
  return {
    anchor: [o.position[0], o.position[2]] as Vec2,
    heading: (((o.rotation + front) % TAU) + TAU) % TAU,
    levelId: o.levelId,
  };
}
function resolvePoint(model: Facility, p: PlacementPoint, what: string) {
  if (p.seat) {
    const s = seatPose(model, p.seat);
    return {
      anchor: p.anchor ? pt(p.anchor) : pt(s.anchor),
      heading: p.heading ?? s.heading,
    };
  }
  if (!p.anchor) throw new Error(`${what} needs an anchor or a seat`);
  return { anchor: pt(p.anchor), heading: p.heading };
}
const headingAlong = (a: Vec2, b: Vec2) => Math.atan2(b[0] - a[0], b[1] - a[1]);
function dedupe(path: Vec2[]) {
  const out: Vec2[] = [];
  for (const p of path) if (!out.length || !same(out[out.length - 1], p)) out.push(pt(p));
  return out;
}
/** Wall clearance along a polyline sampled every 5 cm: minimum and where it occurs. */
export function pathWallClearanceAt(g: NavGrid, path: readonly Vec2[]) {
  let min = Infinity,
    at: Vec2 = path[0];
  const check = (p: Vec2) => {
    const c = wallClearanceAt(g, p);
    if (c < min) {
      min = c;
      at = p;
    }
  };
  if (path.length === 1) check(path[0]);
  for (let i = 1; i < path.length; i++) {
    const p = path[i - 1],
      q = path[i],
      n = Math.max(1, Math.ceil(distance(p, q) / 0.05));
    for (let k = 0; k <= n; k++)
      check([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return { min, at };
}
export const pathWallClearance = (g: NavGrid, path: readonly Vec2[]) =>
  pathWallClearanceAt(g, path).min;
/**
 * Keep a standing anchor out of furniture: if the point lies inside a (non
 * inflated) furniture footprint or within 0.25 m of a wall, move it to the
 * nearest free point within 1.2 m. Returns the original point when it is fine.
 */
export function freeStandingPoint(g: NavGrid, p: Vec2): { point: Vec2; moved: boolean } {
  const blocked = (q: Vec2) => {
    if (wallClearanceAt(g, q) < 0.25) return true;
    for (const o of g.obstacles) {
      if (o.id.startsWith('dwell:') || o.id.startsWith('station:')) continue;
      const dx = q[0] - o.x,
        dz = q[1] - o.z;
      if (
        Math.abs(o.c * dx - o.s * dz) < o.hw - 0.19 + 0.18 &&
        Math.abs(o.s * dx + o.c * dz) < o.hd - 0.19 + 0.18
      )
        return true;
    }
    return false;
  };
  if (!blocked(p)) return { point: p, moved: false };
  for (let r = 0.05; r <= 1.2; r += 0.05)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU,
        q: Vec2 = pt([p[0] + Math.sin(a) * r, p[1] + Math.cos(a) * r]);
      if (!blocked(q)) return { point: q, moved: true };
    }
  return { point: p, moved: false };
}
type Place = { anchor: Vec2; approach: Vec2[] };
/**
 * Walk from one placed point to another: leave along the reversed approach,
 * follow the navigation grid, then enter along the next approach. `avoid`
 * blocks further grid cells (see `route`).
 */
export function walkBetween(
  g: NavGrid,
  from: Place,
  to: Place,
  clearance: number,
  avoid?: (p: Vec2) => boolean,
): Vec2[] {
  const head = dedupe([from.anchor, ...[...from.approach].reverse()]),
    tail = dedupe([...to.approach, to.anchor]);
  const a = head[head.length - 1],
    b = tail[0];
  let middle: Vec2[];
  if (same(a, b)) middle = [a];
  else {
    const sa = snap(g, a, { clearance, avoid }),
      sb = snap(g, b, { clearance, avoid });
    for (const [p, s] of [
      [a, sa],
      [b, sb],
    ] as const)
      if (distance(p, s) > 1.25)
        throw new NavError(
          `Point ${p.join(',')} is ${distance(p, s).toFixed(2)} m from free floor; add approach waypoints`,
        );
    middle = [
      a,
      ...(same(sa, sb) ? [sa] : route(g, sa, sb, clearance, avoid)),
      b,
    ];
  }
  const path = dedupe([...head, ...middle, ...tail]);
  const clear = pathWallClearanceAt(g, path);
  if (clear.min < 0.2)
    throw new NavError(
      `Walk ${from.anchor.join(',')} → ${to.anchor.join(',')} passes ${clear.min.toFixed(3)} m from a wall near ${clear.at.map((v) => v.toFixed(2)).join(',')}`,
    );
  return simplifyCollinear(path);
}
/** Collinear reduction for arbitrary (not only grid) polylines. */
function simplifyCollinear(path: Vec2[]) {
  if (path.length < 3) return path.length === 1 ? [path[0], path[0]] : path;
  const out: Vec2[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1],
      b = path[i],
      c = path[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(cross) > 1e-6 || dot < 0) out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// Scheduling: when the hero arrives at / leaves each stop
// ---------------------------------------------------------------------------
export type ScheduleStop = { window: Window; minDwell: number };
/**
 * Place dwell intervals on a chain of stops joined by walking legs so each
 * dwell is centred on its window as far as the walking allows (least squares
 * on dwell midpoints, with a minimum dwell per stop). Returns null when the
 * minimum dwells cannot fit.
 */
export function scheduleChain(
  t0: number,
  tEnd: number,
  stops: ScheduleStop[],
  travel: number[],
) {
  const n = stops.length;
  const need =
    travel.reduce((a, b) => a + b, 0) +
    stops.reduce((a, s) => a + s.minDwell, 0);
  if (t0 + need > tEnd + 1e-9) return null;
  const centre = stops.map((s) => (s.window[0] + s.window[1]) / 2);
  // depart[k] for k = 0..n-1; depart[n-1] = tEnd. Start from an even spread.
  const slack = (tEnd - t0 - need) / n,
    depart: number[] = [];
  let t = t0;
  for (let k = 0; k < n; k++) {
    t += travel[k] + stops[k].minDwell + slack;
    depart.push(t);
  }
  depart[n - 1] = tEnd;
  const prev = (k: number) => (k === 0 ? t0 : depart[k - 1]);
  for (let iter = 0; iter < 4000; iter++) {
    let moved = 0;
    for (let k = 0; k < n - 1; k++) {
      const P = prev(k) + travel[k],
        Q = travel[k + 1] + depart[k + 1];
      let D = centre[k] + centre[k + 1] - P / 2 - Q / 2;
      const lo = P + stops[k].minDwell,
        hi = depart[k + 1] - travel[k + 1] - stops[k + 1].minDwell;
      D = Math.min(Math.max(D, lo), hi);
      moved = Math.max(moved, Math.abs(D - depart[k]));
      depart[k] = D;
    }
    if (moved < 1e-7) break;
  }
  return stops.map((s, k) => {
    const arrive = prev(k) + travel[k],
      leave = depart[k];
    const lo = Math.max(arrive, s.window[0]),
      hi = Math.min(leave, s.window[1]);
    return {
      arrive,
      depart: leave,
      overlap: Math.max(0, hi - lo),
      focusTime: hi > lo ? (lo + hi) / 2 : (arrive + leave) / 2,
    };
  });
}

// ---------------------------------------------------------------------------
// Track building
// ---------------------------------------------------------------------------
type Builder = {
  segments: Segment[];
  clock: number;
  pos: Vec2;
};
const newBuilder = (pos: Vec2, clock = 0): Builder => ({
  segments: [],
  clock,
  pos: pt(pos),
});
function stay(
  b: Builder,
  end: number,
  seg: Partial<Segment> & { action: Action; zoneId: string; heading: number },
) {
  if (end - b.clock < 1e-6) return;
  b.segments.push({
    ...seg,
    start: r4(b.clock),
    end: r4(end),
    path: [b.pos, b.pos],
  } as Segment);
  b.clock = end;
}
function walk(
  b: Builder,
  path: Vec2[],
  seconds: number,
  seg: Partial<Segment> & { zoneId: string },
) {
  if (!same(path[0], b.pos))
    throw new Error(`Walk starts at ${path[0].join(',')} but actor is at ${b.pos.join(',')}`);
  if (pathLength(path) < 1e-6) return;
  b.segments.push({
    action: 'walk',
    heading: 0,
    ...seg,
    start: r4(b.clock),
    end: r4(b.clock + seconds),
    path: path.map(pt),
  } as Segment);
  b.clock += seconds;
  b.pos = pt(path[path.length - 1]);
}
/** Split a dwell by day-program session, taking the standing participant's action. */
function programActions(start: number, end: number) {
  const out: { start: number; end: number; action: Action; title: string }[] = [];
  for (const s of program.programs) {
    const a = Math.max(start, s.start),
      b = Math.min(end, s.end);
    if (b - a > 1e-6)
      out.push({
        start: a,
        end: b,
        action: (['exercise', 'dance', 'tai-chi'].includes(s.action)
          ? s.action
          : 'listen') as Action,
        title: s.label,
      });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The compiler
// ---------------------------------------------------------------------------
export type CompileOptions = {
  /** Navigation options for the ground floor (defaults: day program + stairs blocked). */
  nav?: NavOptions;
};
export function compileScenario(
  model: Facility,
  scenario: Scenario,
  base: ActivitySource = activityData,
  options: CompileOptions = {},
): CompileResult {
  const P = scenario.placement;
  if (!P) throw new Error(`Scenario ${scenario.id} has no placement block`);
  const originalBase = base;
  const reserved = new Set(P.replacedBackgroundActors || []);
  for (const id of reserved)
    if (!base.actors.some((a) => a.id === id))
      throw new Error(`Reserved background actor ${id} not in base`);
  base = { ...base,
    actors: base.actors.filter((a) => !reserved.has(a.id)),
    interactions: base.interactions.filter((i) => !i.actorIds.some((id) => reserved.has(id))),
  };
  if (scenario.clock.duration !== base.duration)
    throw new Error('Scenario and base loop must share the care-day clock');
  const duration = base.duration,
    notes: string[] = [];
  const heroId = scenario.hero.id,
    replaced = base.actors.find((a) => a.id === scenario.hero.replacesActor);
  if (!replaced)
    throw new Error(`Replaced actor ${scenario.hero.replacesActor} not in base`);
  const navOptions = options.nav || dayProgramNavOptions();
  const g = navGrid(model, {
    ...navOptions,
    reservations: [
      ...(navOptions.reservations || []),
      ...(P.reservations || []),
      ...(P.reserveBaseDwell
        ? baseDwellSpots(base, replaced.id, P.reserveBaseDwell)
        : []),
    ],
  });
  const heroClearance =
    P.heroGait.clearance ?? MOBILITY_CLEARANCE[scenario.hero.mobility];
  const staffClearance = WALL_CLEARANCE;

  // 1. Arrival: copy the replaced actor's van, ramp, entrance and check-in.
  const arrivalEnd = replaced.segments.findIndex(
    (s) => s.title === P.replaced.arrivalThroughTitle,
  );
  if (arrivalEnd < 0)
    throw new Error(`No "${P.replaced.arrivalThroughTitle}" stage to copy`);
  const hero = newBuilder(replaced.segments[0].path[0]);
  hero.segments = clone(replaced.segments.slice(0, arrivalEnd + 1));
  const checkin = hero.segments[arrivalEnd];
  hero.clock = checkin.end;
  hero.pos = pt(checkin.path[checkin.path.length - 1]);
  const departIdx = replaced.segments.findIndex(
    (s) => s.title === P.replaced.departureTitle,
  );
  if (departIdx < 0)
    throw new Error(`No "${P.replaced.departureTitle}" stage to copy`);
  const departure = replaced.segments[departIdx],
    boardAt = departure.end;

  // 2. Collect the hero's stops in time order.
  type Stop = StopPlacement & {
    step: ScenarioStep;
    anchor: Vec2;
    heading?: number;
    approach: Vec2[];
    zoneId: string;
  };
  const stops: Stop[] = [];
  for (const step of scenario.steps)
    for (const s of step.placement?.stops || []) {
      const p = resolvePoint(model, s, `${step.id}/${s.id}`);
      if (!s.seat && !s.seated) {
        const free = freeStandingPoint(g, p.anchor);
        if (free.moved) {
          notes.push(`${s.id}: anchor moved ${distance(p.anchor, free.point).toFixed(2)} m out of furniture`);
          p.anchor = free.point;
        }
      }
      stops.push({
        ...s,
        step,
        anchor: p.anchor,
        heading: p.heading,
        approach: (s.approach || []).map(pt),
        zoneId: zoneAt(g, p.anchor),
      });
    }
  stops.sort((a, b) => a.window[0] - b.window[0]);
  if (!stops.length) throw new Error('Scenario has no hero stops');
  const farewell = stops[stops.length - 1];

  // Departure: copy verbatim when the last stop is where the replaced actor
  // started its departure; otherwise re-derive the same exit route and timing.
  let departurePath: Vec2[], departureHeights: number[] | undefined, departureStart: number;
  const departFrom = pt(departure.path[0]);
  if (same(farewell.anchor, departFrom)) {
    departurePath = departure.path.map(pt);
    departureHeights = departure.heights;
    departureStart = departure.start;
  } else {
    // Keep the fixed exterior tail (door → ramp → van) and re-route the
    // interior part from the farewell anchor to the entrance.
    const outside = departure.path.findIndex(
      (p) => !g.zones.some((z) => insidePolygon(p, z.polygon)),
    );
    if (outside < 2) throw new Error('Cannot find the entrance on the departure path');
    const door = outside - 1;
    const inside = walkBetween(
      g,
      { anchor: farewell.anchor, approach: [] },
      { anchor: pt(departure.path[door - 1]), approach: [] },
      heroClearance,
    );
    const tail = departure.path.slice(door).map(pt);
    departurePath = [...inside, ...tail];
    departureHeights = departure.heights
      ? [...inside.map(() => 0), ...departure.heights.slice(door)]
      : undefined;
    departureStart =
      boardAt - pathLength(departurePath) / P.replaced.boardingSpeed;
    notes.push('Departure re-derived from the farewell anchor.');
  }

  // 3. Walking legs between stops (lengths do not depend on timing).
  const legs: Vec2[][] = [];
  let from: Place = { anchor: hero.pos, approach: [] };
  for (const s of stops) {
    try {
      legs.push(walkBetween(g, from, s, heroClearance));
    } catch (e) {
      throw new Error(`Hero route to ${s.step.id}/${s.id}: ${(e as Error).message}`);
    }
    from = s;
  }
  const lengths = legs.map(pathLength);

  // 4. Timing: among the slowest gaits whose schedule keeps every stop at its
  //    anchor for a fair share of its window, take the one whose walks cross
  //    moving base actors least.
  const minDwell = (s: Stop) =>
    s.minDwell ??
    Math.max(P.minDwellSeconds, P.minDwellFraction * (s.window[1] - s.window[0]));
  const chain = stops.map((s) => ({ window: s.window, minDwell: minDwell(s) }));
  type Plan = { speed: number; schedule: NonNullable<ReturnType<typeof scheduleChain>> };
  const feasible: Plan[] = [];
  const alternatives = P.heroGait.alternatives ?? 5;
  for (let k = 0; ; k++) {
    const v = P.heroGait.preferred + k * P.heroGait.step;
    if (v > P.heroGait.max + 1e-9) break;
    const schedule = scheduleChain(hero.clock, departureStart, chain, lengths.map((l) => l / v));
    if (schedule && schedule.every((x, j) => x.overlap >= chain[j].minDwell - 1e-6)) {
      feasible.push({ speed: v, schedule });
      if (feasible.length >= alternatives) break;
    }
  }
  if (!feasible.length) {
    const v = P.heroGait.max,
      schedule = scheduleChain(hero.clock, departureStart, chain, lengths.map((l) => l / v));
    if (!schedule)
      throw new Error(
        `Hero itinerary does not fit: ${lengths.reduce((a, b) => a + b, 0).toFixed(0)} m of walking at ≤ ${v} m/s`,
      );
    notes.push('Hero gait capped; some stops overlap their windows less than the target.');
    feasible.push({ speed: v, schedule });
  }
  const probe = contactProbe(base, replaced.id);
  const heroAt = (plan: Plan) => (t: number): Vec2 | null => {
    let prevDepart = hero.clock,
      prevAnchor = hero.pos;
    for (let k = 0; k < stops.length; k++) {
      const x = plan.schedule[k];
      if (t < x.arrive) {
        const f = (t - prevDepart) / (x.arrive - prevDepart || 1);
        return f < 0 ? prevAnchor : pointAlong(legs[k], f);
      }
      if (t < x.depart) return stops[k].anchor;
      prevDepart = x.depart;
      prevAnchor = stops[k].anchor;
    }
    return null;
  };
  let chosen = feasible[0],
    chosenScore = Infinity;
  for (const plan of feasible) {
    // Each gait step must buy at least half a second less crowding.
    const score =
      probe.contact(heroAt(plan), hero.clock, departureStart) +
      (25 * (plan.speed - feasible[0].speed));
    if (score < chosenScore - 1e-9) {
      chosen = plan;
      chosenScore = score;
    }
  }
  const speed = chosen.speed,
    times = chosen.schedule.map((x) => ({ ...x }));
  // Slide individual legs by a few seconds (both neighbouring dwells keep
  // their minimum) when that avoids walking through someone.
  for (let k = 1; k < stops.length; k++) {
    const leg = legs[k],
      prev = times[k - 1],
      cur = times[k];
    const travel = cur.arrive - prev.depart;
    const at = (d: number) => (t: number): Vec2 | null =>
      t < prev.depart + d || t >= cur.arrive + d
        ? null
        : pointAlong(leg, (t - prev.depart - d) / travel);
    const score = (d: number) => probe.contact(at(d), prev.depart + d, cur.arrive + d);
    let best = 0,
      bestScore = score(0);
    for (let j = 1; j <= 4 && bestScore > 0; j++)
      for (const d of [j, -j]) {
        if (prev.depart + d - prev.arrive < chain[k - 1].minDwell) continue;
        if (cur.depart - (cur.arrive + d) < chain[k].minDwell) continue;
        const sc = score(d);
        if (sc < bestScore - 1e-9) {
          best = d;
          bestScore = sc;
        }
      }
    if (best) {
      prev.depart += best;
      cur.arrive += best;
    }
  }

  // 5. Hero segments.
  const heroSegs = hero;
  const compiledStops: CompiledStop[] = [];
  stops.forEach((s, k) => {
    const leg = legs[k],
      t = times[k];
    walk(heroSegs, leg, t.arrive - heroSegs.clock, {
      zoneId: zoneAt(g, leg[0]),
      title: s.walkTitle || `Walk to ${s.title.toLowerCase()}`,
    });
    const arriveHeading =
      s.heading ??
      headingAlong(leg[Math.max(0, leg.length - 2)], leg[leg.length - 1]);
    const base: Partial<Segment> & { zoneId: string; heading: number } = {
      zoneId: s.zoneId,
      heading: r4(arriveHeading),
      title: s.title,
      ...(s.seated ? { seated: true } : {}),
    };
    if (s.followProgram)
      for (const part of programActions(t.arrive, t.depart))
        stay(heroSegs, part.end, {
          ...base,
          action: part.action,
          title: `${s.title} · ${part.title}`,
        });
    else stay(heroSegs, t.depart, { ...base, action: s.action });
    const lo = Math.max(t.arrive, s.window[0]),
      hi = Math.min(t.depart, s.window[1]),
      focusTime = hi > lo ? (lo + hi) / 2 : (t.arrive + t.depart) / 2;
    compiledStops.push({
      id: s.id,
      stepId: s.step.id,
      title: s.title,
      window: s.window,
      roomId: s.roomId ?? s.step.roomId,
      zoneId: s.zoneId,
      anchor: s.anchor,
      heading: r4(arriveHeading),
      action: s.action,
      seated: !!s.seated,
      arrive: r4(t.arrive),
      depart: r4(t.depart),
      overlap: Math.round(Math.max(0, hi - lo) * 100) / 100,
      focusTime: Math.round(focusTime * 100) / 100,
      companionIds: (s.companions || []).map((c) => c.id),
      partnerIds: s.partners || [],
      interactionId: `${heroId}-${s.id}`,
      legDistance: Math.round(lengths[k] * 100) / 100,
    });
  });
  // Departure and ride home, exactly like the replaced actor.
  if (heroSegs.clock > departureStart + 1e-6)
    throw new Error('Hero is still busy when the departure must start');
  const farewellStop = compiledStops[compiledStops.length - 1];
  if (departureStart - heroSegs.clock > 1e-6)
    stay(heroSegs, departureStart, {
      action: farewell.action,
      zoneId: farewell.zoneId,
      heading: farewellStop.heading,
      title: farewell.title,
    });
  heroSegs.segments.push({
    ...clone(departure),
    start: r4(departureStart),
    path: departurePath,
    ...(departureHeights ? { heights: departureHeights } : {}),
  });
  heroSegs.clock = departure.end;
  heroSegs.pos = pt(departurePath[departurePath.length - 1]);
  for (const s of replaced.segments.slice(departIdx + 1)) heroSegs.segments.push(clone(s));
  const heroActor: ActorSpec = {
    id: heroId,
    label: `${scenario.hero.name} · ${scenario.hero.mobility}`,
    role: 'participant',
    variant: replaced.variant,
    profileId: replaced.profileId || replaced.id,
    mobility: scenario.hero.mobility,
    levelId: 'ground',
    offset: 0,
    segments: checkContinuity(heroId, heroSegs.segments, duration),
  };

  // 6. Escort: the replaced actor's escort follows the hero instead.
  const escortBase = base.actors.find((a) => a.escortFor === replaced.id);
  const escort: ActorSpec | null = escortBase
    ? {
        ...clone(escortBase),
        escortFor: heroId,
        label: P.replaced.escortLabel || escortBase.label,
        segments: clone(heroActor.segments),
      }
    : null;

  // 7. Companions.
  const specs = new Map(P.companions.map((c) => [c.id, c]));
  type Duty = CompanionDuty & {
    start: number;
    end: number;
    anchor: Vec2;
    heading: number;
    approach: Vec2[];
    zoneId: string;
    stopTitle: string;
  };
  const duties = new Map<string, Duty[]>();
  const addDuty = (d: Duty) => {
    if (!specs.has(d.id)) return; // base actors: interaction only
    const list = duties.get(d.id) || [];
    list.push(d);
    duties.set(d.id, list);
  };
  const resolveDuty = (
    c: CompanionDuty,
    start: number,
    end: number,
    stopTitle: string,
    faceTo: Vec2,
  ): Duty => {
    const p = resolvePoint(model, c, `${c.id} duty`);
    if (end - start < 4) {
      notes.push(
        `${c.id} (${stopTitle}): join/leave leave only ${(end - start).toFixed(1)} s; kept 4 s`,
      );
      end = start + 4;
    }
    if (!c.seat && !c.seated) {
      const free = freeStandingPoint(g, p.anchor);
      if (free.moved) {
        notes.push(`${c.id} (${stopTitle}): anchor moved ${distance(p.anchor, free.point).toFixed(2)} m out of furniture`);
        p.anchor = free.point;
      }
    }
    return {
      ...c,
      start,
      end,
      anchor: p.anchor,
      heading: p.heading ?? headingAlong(p.anchor, faceTo),
      approach: (c.approach || []).map(pt),
      zoneId: zoneAt(g, p.anchor),
      stopTitle,
    };
  };
  stops.forEach((s, k) => {
    for (const c of s.companions || [])
      addDuty(
        resolveDuty(
          c,
          times[k].arrive + (c.join ?? -3),
          times[k].depart + (c.leave ?? 1),
          c.title || s.title,
          s.anchor,
        ),
      );
  });
  for (const step of scenario.steps)
    for (const d of step.placement?.duties || [])
      addDuty(
        resolveDuty(
          d,
          d.window[0],
          d.window[1],
          d.title || step.title || step.id,
          positionAt(heroActor.segments, (d.window[0] + d.window[1]) / 2),
        ),
      );
  const companions: ActorSpec[] = [];
  const v = P.staffGait.preferred;
  for (const spec of P.companions) {
    const list = (duties.get(spec.id) || []).sort((a, b) => a.start - b.start);
    if (!list.length) {
      notes.push(`${spec.id} has no duties and was skipped`);
      continue;
    }
    const short = teamById.get(spec.team)!.short;
    const home: Place = { anchor: pt(spec.home), approach: [] },
      exit: Place = { anchor: pt(spec.exit || spec.home), approach: [] };
    const b = newBuilder(home.anchor);
    const offDuty = (p: Vec2) => ({
      action: 'idle' as Action,
      visible: false,
      title: 'Off duty',
      zoneId: zoneAt(g, p),
      heading: 0,
    });
    let here: Place & { heading: number } = { ...home, heading: 0 },
      onFloor = false;
    for (const d of list) {
      let path: Vec2[] | null = null;
      if (onFloor) {
        // Time for a break out of sight? Go back to base and return later.
        const back = walkBetween(g, here, exit, staffClearance),
          again = walkBetween(g, exit, d, staffClearance);
        if (d.start - b.clock > (pathLength(back) + pathLength(again)) / v + 20) {
          walk(b, back, pathLength(back) / v, {
            zoneId: zoneAt(g, here.anchor),
            title: 'Back to base',
          });
          here = { ...exit, heading: 0 };
          onFloor = false;
          path = again;
        }
      }
      path = path || walkBetween(g, here, d, staffClearance);
      let leaveAt = d.start - pathLength(path) / v;
      if (leaveAt < b.clock) {
        // Behind schedule: hurry up to the cap, otherwise arrive late.
        leaveAt = b.clock;
        const fastest = pathLength(path) / P.staffGait.max;
        if (d.start - leaveAt < fastest) {
          notes.push(
            `${spec.id} arrives ${(leaveAt + fastest - d.start).toFixed(1)} s late for ${d.stopTitle}`,
          );
          d.start = leaveAt + fastest;
        }
      }
      stay(
        b,
        leaveAt,
        onFloor
          ? {
              action: 'idle',
              zoneId: zoneAt(g, here.anchor),
              heading: r4(here.heading),
              title: 'Waiting',
            }
          : offDuty(here.anchor),
      );
      walk(b, path, d.start - b.clock, {
        zoneId: zoneAt(g, path[0]),
        title: `Walk to ${d.stopTitle.toLowerCase()}`,
      });
      onFloor = true;
      stay(b, Math.max(d.end, b.clock + 1), {
        action: d.action,
        zoneId: d.zoneId,
        heading: r4(d.heading),
        title: d.title || d.stopTitle,
        ...(d.seated ? { seated: true } : {}),
      });
      here = { anchor: d.anchor, approach: d.approach, heading: d.heading };
    }
    const back = walkBetween(g, here, exit, staffClearance);
    walk(b, back, pathLength(back) / v, {
      zoneId: zoneAt(g, here.anchor),
      title: 'Back to base',
    });
    if (b.clock > duration)
      throw new Error(`${spec.id} runs past the end of the day`);
    stay(b, duration, offDuty(b.pos));
    // Loop closure: the opening off-duty stay carries the unseen transfer from
    // the exit back to the home point, so the repeat never teleports.
    const first = b.segments[0];
    if (first.visible !== false)
      throw new Error(`${spec.id} must start the day off duty`);
    if (!same(first.path[0], b.pos)) first.path = [b.pos, first.path[1]];
    companions.push({
      id: spec.id,
      label: `${short} · ${spec.name}`,
      role: careTeamRole(spec.team),
      variant: spec.variant,
      profileId: spec.id,
      levelId: 'ground',
      offset: 0,
      segments: checkContinuity(spec.id, b.segments),
    });
  }

  // Let companions wait a moment (or leave a little early) when a walk would
  // pass through someone: base actors, Mrs. Lin, her escort, other companions.
  const trackAt = (a: ActorSpec) => (t: number): Vec2 | null => {
    const seg = a.segments.find((x) => t >= x.start && t < x.end);
    return !seg || seg.visible === false ? null : positionAt(a.segments, t);
  };
  const placed: ((t: number) => Vec2 | null)[] = [trackAt(heroActor)];
  if (escort) placed.push((t) => {
    const pose = sampleEscort(heroActor, t);
    return pose.visible === false ? null : [pose.x, pose.z];
  });
  for (const c of companions) {
    const shifted = easeWalks(c, probe, placed, notes);
    placed.push(trackAt(c));
    if (shifted) notes.push(`${c.id}: ${shifted} walk(s) re-timed to avoid passing through people`);
  }

  // 8. Upstairs IDT meetings.
  const meetingActors = buildMeetings(model, scenario, P, base, [...companions, ...(escort ? [escort] : [])], notes);

  // 9. Interactions.
  const interactions: Interaction[] = [];
  const idsWithEscort = (ids: string[]) =>
    escort ? [heroId, escort.id, ...ids] : [heroId, ...ids];
  const arrivalSeg = heroActor.segments.find((s) => s.visible !== false)!,
    checkinSeg = heroActor.segments[arrivalEnd];
  const partnersFor = (step: ScenarioStep) => [
    ...(step.placement?.partners || []),
    ...(step.placement?.duties || []).map((d) => d.id),
  ];
  for (const step of scenario.steps) {
    const mode = step.placement?.mode;
    if (mode === 'arrival')
      interactions.push({
        id: `${heroId}-arrival`,
        label: `${scenario.hero.name} · arrival`,
        category: 'arrivals',
        actorIds: idsWithEscort(partnersFor(step)),
        start: r4(arrivalSeg.start),
        end: r4(checkinSeg.start),
        zoneId: 'site',
        description:
          'Van A, the deployed ramp, the escort handoff, the right turn and the sliding entrance.',
      });
    if (mode === 'checkin')
      interactions.push({
        id: `${heroId}-checkin`,
        label: `${scenario.hero.name} · check-in`,
        category: 'arrivals',
        actorIds: idsWithEscort(partnersFor(step)),
        start: r4(checkinSeg.start),
        end: r4(checkinSeg.end),
        zoneId: 'lobby',
        description:
          'Greeting and registration at the front desk; the day plan is already waiting.',
      });
    if (mode === 'departure') {
      const dep = heroActor.segments.find((s) => s.title === P.replaced.departureTitle)!;
      interactions.push({
        id: `${heroId}-departure`,
        label: `${scenario.hero.name} · journey home`,
        category: 'arrivals',
        actorIds: idsWithEscort(partnersFor(step)),
        start: r4(dep.start),
        end: r4(dep.end),
        zoneId: 'site',
        description: 'Back through the sliding entrance and down the accessible ramp to board Van A.',
      });
    }
  }
  stops.forEach((s, k) => {
    const c = compiledStops[k];
    interactions.push({
      id: c.interactionId,
      label: `${scenario.hero.name} · ${s.title}`,
      category: s.category,
      actorIds: idsWithEscort([
        ...(s.companions || []).map((x) => x.id),
        ...(s.partners || []),
      ]),
      start: r4(times[k].arrive),
      end: r4(times[k].depart),
      zoneId: c.zoneId,
      description: s.description || s.step.kicker || s.title,
    });
  });
  for (const stepId of P.meeting.steps) {
    const step = scenario.steps.find((s) => s.id === stepId);
    if (!step) continue;
    interactions.push({
      id: `idt-${step.id}`,
      label: `IDT · ${step.id === 'huddle' ? 'morning huddle' : 'care-plan meeting'}`,
      category: 'coordination',
      actorIds: meetingActors.map((a) => a.id),
      start: step.window[0],
      end: step.window[1],
      zoneId: step.zoneId,
      description:
        'All eleven PACE disciplines meet upstairs to share observations and update one care plan.',
    });
  }

  // 10. Steps summary for the story.
  const actorsOut: ActorSpec[] = [heroActor, ...(escort ? [escort] : []), ...companions, ...meetingActors];
  const steps: CompiledStep[] = scenario.steps.map((step) => {
    const own = compiledStops.filter((c) => c.stepId === step.id);
    const meeting = P.meeting.steps.includes(step.id);
    let focusTime: number, focusActorId: string;
    if (own.length) {
      focusTime = own[0].focusTime;
      focusActorId = heroId;
    } else if (meeting) {
      // All attendees are seated from the last arrival to the first departure.
      const seated = meetingSeatedSpan(meetingActors, step.window);
      focusTime = r4((seated[0] + seated[1]) / 2);
      focusActorId = `interaction:idt-${step.id}`;
    } else {
      const visible = visibleSpan(heroActor, step.window);
      focusTime = r4(visible ? (visible[0] + visible[1]) / 2 : (step.window[0] + step.window[1]) / 2);
      focusActorId = heroId;
    }
    const interactionIds = [
      ...own.map((c) => c.interactionId),
      ...(meeting ? [`idt-${step.id}`] : []),
      ...(step.placement?.mode === 'arrival' ? [`${heroId}-arrival`] : []),
      ...(step.placement?.mode === 'checkin' ? [`${heroId}-checkin`] : []),
      ...(step.placement?.mode === 'departure' ? [`${heroId}-departure`] : []),
    ];
    return {
      id: step.id,
      window: step.window,
      heroPresent: step.heroPresent,
      zoneId: step.zoneId,
      roomId: step.roomId,
      focusTime,
      focusActorId,
      stops: own,
      companionIds: [
        ...new Set([
          ...own.flatMap((c) => c.companionIds),
          ...(step.placement?.duties || []).map((d) => d.id),
          ...(meeting ? meetingActors.map((a) => a.id) : []),
        ]),
      ],
      interactionIds,
      handoffs: step.handoffs,
      roles: step.roles,
    };
  });

  const removedActorIds = [replaced.id, ...reserved];
  const removedInteractionIds = originalBase.interactions
    .filter((i) => i.actorIds.some((id) => removedActorIds.includes(id)))
    .map((i) => i.id);
  const roles = [...new Set(actorsOut.map((a) => a.role))].sort() as CharacterRole[];
  const tracks: CompiledTracks = {
    version: 1,
    scenarioId: scenario.id,
    heroId,
    removedActorIds,
    removedInteractionIds,
    actors: actorsOut,
    interactions,
    roles,
    steps,
    heroSpeed: Math.round(speed * 1000) / 1000,
    notes,
  };
  return { source: mergeTracks(originalBase, tracks), heroId, steps, tracks };
}

/**
 * Where base actors stand still for at least `minSeconds` in total (ground
 * floor, visible, not walking), as small reservations for new routes. The
 * replaced actor and its escort are excluded; day-program stations are
 * reserved separately by the navigation defaults.
 */
export function baseDwellSpots(
  base: ActivitySource,
  replacedId: string,
  { minSeconds, halfSize }: { minSeconds: number; halfSize: number },
): NavReservation[] {
  const stations = new Set(program.stations.map((s) => s.actorId));
  const totals = new Map<string, { p: Vec2; t: number }>();
  for (const a of base.actors) {
    if (a.levelId !== 'ground' || stations.has(a.id)) continue;
    if (a.id === replacedId || a.escortFor === replacedId) continue;
    for (const s of a.segments) {
      if (['walk', 'roll', 'ride'].includes(s.action) || s.visible === false) continue;
      const p = pt(s.path[0]),
        key = `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      const e = totals.get(key) || { p, t: 0 };
      e.t += s.end - s.start;
      totals.set(key, e);
    }
  }
  return [...totals.entries()]
    .filter(([, e]) => e.t >= minSeconds)
    .map(([key, e]) => ({
      id: `dwell:${key}`,
      position: e.p,
      halfWidth: halfSize,
      halfDepth: halfSize,
    }));
}
/**
 * Re-time each visible walk of a companion by up to ±8 s (bounded by the stays
 * around it; walks into a duty arrive at most 3 s later) to minimise time spent
 * within 0.4 m of anyone else. Returns how many walks moved.
 */
function easeWalks(
  actor: ActorSpec,
  probe: ReturnType<typeof contactProbe>,
  others: ((t: number) => Vec2 | null)[],
  notes: string[],
) {
  const segs = actor.segments;
  let moved = 0;
  for (let i = 1; i < segs.length - 1; i++) {
    const w = segs[i],
      prev = segs[i - 1],
      next = segs[i + 1];
    if (w.action !== 'walk' || w.visible === false) continue;
    const intoDuty = next.visible !== false && next.title !== 'Waiting';
    const at = (d: number) => (t: number): Vec2 | null => {
      if (t < w.start + d || t >= w.end + d) return null;
      return pointAlong(w.path, (t - w.start - d) / (w.end - w.start));
    };
    const score = (d: number) => probe.contact(at(d), w.start + d, w.end + d, 0.25, others);
    const base = score(0);
    if (base === 0) continue;
    let best = 0,
      bestScore = base;
    for (let k = 1; k <= 8 && bestScore > 0; k++)
      for (const d of [k, -k]) {
        if (d > 0 && (w.end + d > next.end - 0.3 || (intoDuty && d > 3))) continue;
        if (d < 0 && w.start + d < prev.start + 0.3) continue;
        const sc = score(d);
        if (sc < bestScore - 1e-9) {
          best = d;
          bestScore = sc;
        }
      }
    if (best !== 0) {
      prev.end = r4(prev.end + best);
      w.start = r4(w.start + best);
      w.end = r4(w.end + best);
      next.start = r4(next.start + best);
      moved++;
    }
    if (bestScore > 0.5)
      notes.push(`${actor.id} still passes close to someone for ${bestScore.toFixed(1)} s near t=${w.start.toFixed(0)}`);
  }
  return moved;
}
/** Point at fraction f of a polyline's length. */
export function pointAlong(path: readonly Vec2[], f: number): Vec2 {
  const total = pathLength(path);
  let left = total * Math.min(1, Math.max(0, f));
  for (let i = 1; i < path.length; i++) {
    const d = distance(path[i - 1], path[i]);
    if (left <= d || i === path.length - 1) {
      const u = d ? Math.min(1, left / d) : 0;
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * u,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * u,
      ];
    }
    left -= d;
  }
  return path[0];
}
/**
 * Approximate ground-floor positions of base actors over time (offsets and
 * visibility honoured; escorts sampled at their partner), used to steer new
 * tracks away from people who happen to be walking the same corridor.
 */
export function contactProbe(base: ActivitySource, replacedId: string, radius = 0.4) {
  const byId = new Map(base.actors.map((a) => [a.id, a] as const));
  const tracks = base.actors
    .filter(
      (a) =>
        a.levelId === 'ground' &&
        a.id !== replacedId &&
        a.escortFor !== replacedId,
    )
    .map((a) => {
      const lead = a.escortFor ? byId.get(a.escortFor) || a : a;
      return (t: number): Vec2 | null => {
        const u = (((t + lead.offset) % base.duration) + base.duration) % base.duration;
        const seg =
          lead.segments.find((x) => u >= x.start && u < x.end) ||
          lead.segments[lead.segments.length - 1];
        return seg.visible === false ? null : positionAt(lead.segments, u);
      };
    });
  return {
    /** Seconds (summed over people) that `at` spends within `radius` of someone. */
    contact(at: (t: number) => Vec2 | null, from: number, to: number, dt = 0.25, extra: ((t: number) => Vec2 | null)[] = []) {
      let score = 0;
      for (let t = from; t < to; t += dt) {
        const p = at(t);
        if (!p) continue;
        for (const f of tracks.concat(extra)) {
          const q = f(t);
          if (q && Math.abs(q[0] - p[0]) < radius && Math.abs(q[1] - p[1]) < radius && distance(p, q) < radius)
            score += dt;
        }
      }
      return score;
    },
  };
}
/** Position along a track at time t (no offset; linear along each path). */
export function positionAt(segments: Segment[], t: number): Vec2 {
  const s =
    segments.find((x) => t >= x.start && t < x.end) || segments[segments.length - 1];
  const f = Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start || 1)));
  const total = pathLength(s.path);
  let left = total * f;
  for (let i = 1; i < s.path.length; i++) {
    const d = distance(s.path[i - 1], s.path[i]);
    if (left <= d || i === s.path.length - 1) {
      const u = d ? Math.min(1, left / d) : 0;
      return [
        s.path[i - 1][0] + (s.path[i][0] - s.path[i - 1][0]) * u,
        s.path[i - 1][1] + (s.path[i][1] - s.path[i - 1][1]) * u,
      ];
    }
    left -= d;
  }
  return s.path[0];
}
/** Consecutive stages meet exactly in time and space, including the repeat. */
export function checkContinuity(id: string, segments: Segment[], duration = CARE_DAY.duration) {
  if (Math.abs(segments[0].start) > 1e-6 || Math.abs(segments[segments.length - 1].end - duration) > 1e-6)
    throw new Error(`${id}: stages must cover 0–${duration}`);
  for (let i = 0; i < segments.length; i++) {
    const cur = segments[i],
      next = segments[(i + 1) % segments.length];
    if (cur.end - cur.start <= 1e-6) throw new Error(`${id}: empty stage at ${cur.start}`);
    if (i < segments.length - 1 && Math.abs(cur.end - next.start) > 1e-6)
      throw new Error(`${id}: gap at ${cur.end} → ${next.start}`);
    if (!same(cur.path[cur.path.length - 1], next.path[0]))
      throw new Error(
        `${id}: teleport at ${cur.end}: ${cur.path[cur.path.length - 1].join(',')} → ${next.path[0].join(',')}`,
      );
  }
  return segments;
}
function visibleSpan(actor: ActorSpec, w: Window): Window | null {
  let lo = Infinity,
    hi = -Infinity;
  for (const s of actor.segments) {
    if (s.visible === false) continue;
    const a = Math.max(s.start, w[0]),
      b = Math.min(s.end, w[1]);
    if (b > a) {
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }
  }
  return hi > lo ? [lo, hi] : null;
}
/** Longest span inside the window when every attendee is seated. */
function meetingSeatedSpan(actors: ActorSpec[], w: Window): Window {
  let lo = w[0],
    hi = w[1];
  for (const a of actors) {
    // Each attendee's longest seated run inside the window.
    let best: Window | null = null,
      run: Window | null = null;
    for (const s of a.segments) {
      const x = Math.max(s.start, w[0]),
        y = Math.min(s.end, w[1]);
      if (y <= x) continue;
      if (s.seated && s.visible !== false) {
        run = run && Math.abs(run[1] - x) < 1e-6 ? [run[0], y] : [x, y];
        if (!best || run[1] - run[0] > best[1] - best[0]) best = run;
      } else run = null;
    }
    if (!best) return w;
    lo = Math.max(lo, best[0]);
    hi = Math.min(hi, best[1]);
  }
  return hi > lo ? [lo, hi] : w;
}

// ---------------------------------------------------------------------------
// Upstairs IDT meetings: walk in from the stair landing, sit, take turns.
// ---------------------------------------------------------------------------
function buildMeetings(
  model: Facility,
  scenario: Scenario,
  P: ScenarioPlacement,
  base: ActivitySource,
  companions: ActorSpec[],
  notes: string[],
): ActorSpec[] {
  const M = P.meeting;
  const [first, second] = M.steps.map(
    (id) => scenario.steps.find((s) => s.id === id)!,
  );
  if (!first || !second) return [];
  const duration = base.duration;
  const upper = navGrid(model, {
    levelId: M.levelId,
    removedObjectIds: [],
    reservations: [],
    excludeZoneIds: ['mezzanine'],
    blockVerticalCirculation: true,
  });
  const byId = new Map(
    [...base.actors, ...companions].map((a) => [a.id, a] as const),
  );
  const companionByTeam = new Map(
    P.companions.map((c) => [c.team, c.id] as const),
  );
  type Seat = {
    team: string;
    anchor: Vec2;
    heading: number;
    route: Vec2[];
    identity: ActorSpec | undefined;
  };
  const seats: Seat[] = M.seats.map((s) => {
    const pose = seatPose(model, s.seat),
      [x, z] = pose.anchor;
    const door = pt(M.door),
      south = M.aisles.south,
      north = M.aisles.north,
      east = M.aisles.east;
    let route: Vec2[];
    if (z >= M.tableCenterZ) route = [pt(M.entry), door, [door[0], south], [x, south], [x, z]];
    else
      route = [
        pt(M.entry),
        door,
        [door[0], south],
        [east, south],
        [east, north],
        [x, north],
        [x, z],
      ];
    const identity = byId.get(s.profileFrom || companionByTeam.get(s.team) || '');
    return {
      team: s.team,
      anchor: pt(pose.anchor),
      heading: pose.heading,
      route: dedupe(route.map(pt)),
      identity,
    };
  });
  for (const s of seats) {
    const clear = pathWallClearance(upper, s.route);
    if (clear < 0.2)
      throw new Error(`Meeting route to ${s.team} passes ${clear.toFixed(3)} m from a wall`);
  }
  // Farthest seats enter first and nearest seats leave first, so nobody walks
  // behind a seated colleague; door crossings are `stagger` seconds apart and
  // everyone walks at the same speed, so walkers never close up in the aisles.
  const order = seats
    .map((s, i) => ({ i, len: pathLength(s.route) }))
    .sort((a, b) => b.len - a.len);
  const enterAt = new Map<number, number>(),
    leaveAt = new Map<number, number>();
  order.forEach(({ i }, rank) =>
    enterAt.set(i, second.window[0] + rank * M.stagger),
  );
  order.forEach(({ i, len }, rank) => {
    // rank 0 (farthest) crosses the door last, just before the huddle ends.
    const crossing = first.window[1] - 0.5 - rank * M.stagger;
    leaveAt.set(i, crossing - len / M.speed);
  });
  const speakers = seats.map((_, i) => i);
  const turn = (t: number) =>
    speakers[Math.floor(t / M.turnSeconds) % speakers.length];
  return seats.map((s, i) => {
    const team = teamById.get(s.team)!;
    const id = `idt-${s.team}-meeting`,
      back = [...s.route].reverse(),
      walkT = pathLength(s.route) / M.speed;
    const segs: Segment[] = [];
    const push = (seg: Omit<Segment, 'zoneId'> & { zoneId?: string }) => {
      if (seg.end - seg.start > 1e-6)
        segs.push({ zoneId: 'upper-office', ...seg } as Segment);
    };
    const seatedPart = (a: number, b: number) => {
      // Speaker rotation: present on your turn, otherwise listen or take notes.
      let t = a;
      while (t < b - 1e-6) {
        const next = Math.min(b, (Math.floor(t / M.turnSeconds) + 1) * M.turnSeconds);
        const speaking = turn(t) === i;
        push({
          start: r4(t),
          end: r4(next),
          action: speaking ? 'present' : (i + Math.floor(t / M.turnSeconds)) % 3 === 0 ? 'document' : 'listen',
          path: [s.anchor, s.anchor],
          heading: r4(s.heading),
          seated: true,
          title: speaking ? `${team.short} · sharing an update` : 'Interdisciplinary team meeting',
        });
        t = next;
      }
    };
    const l = leaveAt.get(i)!,
      e = enterAt.get(i)!;
    if (l < 1) notes.push(`${id} barely sits at the huddle`);
    seatedPart(0, l);
    push({
      start: r4(l),
      end: r4(l + walkT),
      action: 'walk',
      path: back,
      heading: 0,
      title: 'Leave the huddle',
    });
    push({
      start: r4(l + walkT),
      end: r4(e),
      action: 'idle',
      path: [back[back.length - 1], back[back.length - 1]],
      heading: 0,
      visible: false,
      title: 'Working downstairs',
    });
    push({
      start: r4(e),
      end: r4(e + walkT),
      action: 'walk',
      path: s.route,
      heading: 0,
      title: 'Arrive for the care-plan meeting',
    });
    seatedPart(e + walkT, duration);
    const identity = s.identity;
    return {
      id,
      label: identity ? `${identity.label} · IDT` : `${team.short} · IDT`,
      role: team.characterRole as CharacterRole,
      variant: identity?.variant ?? 30 + i,
      profileId: identity ? identity.profileId || identity.id : id,
      levelId: M.levelId,
      offset: 0,
      segments: checkContinuity(id, segs, duration),
    };
  });
}
