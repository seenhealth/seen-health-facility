/**
 * Touchpoint trace: an ordered event stream derived from the same tracks the
 * renderer draws — what happened to whom, where and with whom — for every
 * person in an ActivitySource. It is the seed of a digital twin of operations:
 * the shape a real platform would emit from van logs, check-ins, visit
 * records, vitals feeds and family calls, derived here from the simulation so
 * every what-if can be traced, exported and compared.
 *
 * Pure and synchronous: runs in the browser (Trace tab of the Measure panel)
 * and in Node (scripts/sim-report.mjs, scripts/validate-trace.mjs). The
 * output is deterministic for a given source, model and options.
 */
import type {
  ActivitySource,
  ActorSpec,
  Interaction,
  VehicleLookup,
} from '../model/activity';
import { COMMUNITY_CATEGORIES } from '../model/community-settings';
import {
  isStaffRole,
  roleNames,
  type CharacterRole,
} from '../model/characters';
import type { Facility, Vec2 } from '../model/schema';
import { clockLabel } from './clock';
import {
  disciplineOfRole,
  disciplines,
  groundZonesOf,
  sampleFrame,
} from './metrics';
import { insidePolygon } from './nav';

export type TouchpointKind =
  | 'day-start'
  | 'day-end'
  | 'board'
  | 'alight'
  | 'enter'
  | 'leave'
  | 'interaction-start'
  | 'interaction-end'
  | 'encounter'
  | 'handoff'
  | 'on-site'
  | 'off-site';
export type TouchpointEvent = {
  /** Loop seconds and the clock label (app/sim/clock.ts). */
  t: number;
  clock: string;
  actorId: string;
  actorLabel: string;
  role: CharacterRole;
  kind: TouchpointKind;
  zoneId: string;
  roomId?: string | null;
  x: number;
  z: number;
  levelId: string;
  /** Other actor ids involved. */
  with?: string[];
  interactionId?: string;
  category?: string;
  title?: string;
  vehicleId?: string;
  /** For coalesced encounters and interaction-end. */
  durationSeconds?: number;
};
export type TraceOptions = {
  /** Sampling interval in loop seconds (default 2; the report uses 1). */
  step?: number;
  /** Emit events for these actors only (encounters still consider everyone). */
  actorIds?: string[];
  /** Distance (m) within which two visible people are together (default 1.6). */
  encounterRadius?: number;
  /** Shortest proximity that counts as an encounter (default 4 s). */
  minEncounterSeconds?: number;
  /** A break in proximity shorter than this is bridged (default 3 s). */
  encounterGapSeconds?: number;
  /** Vehicle poses for seated riders (see `MetricsOptions.vehicles`). */
  vehicles?: VehicleLookup;
};
export type PersonJourney = {
  actorId: string;
  label: string;
  role: CharacterRole;
  events: TouchpointEvent[];
  /** Seconds of the loop spent in each zone, most first. */
  zones: { zoneId: string; seconds: number }[];
  /** IDT disciplines (care-team.json ids) met in person or in an interaction. */
  disciplines: string[];
  encounters: number;
  interactions: number;
  firstOnSite?: number;
  lastOnSite?: number;
};
export type DwellInterval = {
  zoneId: string;
  roomId: string | null;
  start: number;
  end: number;
};
export type TraceSummary = {
  people: number;
  events: number;
  byKind: Record<string, number>;
  /** Participants with at least one interaction of the category. */
  participantsWith: {
    clinical: number;
    therapy: number;
    activities: number;
    meals: number;
    coordination: number;
    /** Home care, pharmacy, specialist, hospital, partner and nurse-line touchpoints. */
    community: number;
  };
  medianEventsPerParticipant: number;
};

/** Tie order for events of one person at the same instant. */
const KIND_ORDER: TouchpointKind[] = [
  'day-start',
  'alight',
  'on-site',
  'leave',
  'enter',
  'board',
  'off-site',
  'interaction-end',
  'handoff',
  'interaction-start',
  'encounter',
  'day-end',
];
export const TOUCHPOINT_KINDS: readonly TouchpointKind[] = KIND_ORDER;
const kindRank = new Map(KIND_ORDER.map((k, i) => [k, i]));
/** Interaction category → summary bucket. */
const CATEGORY_BUCKET: Record<string, keyof TraceSummary['participantsWith']> =
  {
    clinical: 'clinical',
    rehab: 'therapy',
    activities: 'activities',
    meals: 'meals',
    coordination: 'coordination',
    ...Object.fromEntries(
      COMMUNITY_CATEGORIES.map(([id]) => [id, 'community'] as const),
    ),
  };
/** Summary buckets in display order (the report and the validator print these). */
export const TRACE_BUCKETS: (keyof TraceSummary['participantsWith'])[] = [
  'clinical',
  'therapy',
  'activities',
  'meals',
  'coordination',
  'community',
];
const round = (v: number, d = 2) => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return r === 0 ? 0 : r; // never -0, so JSON round-trips are identical
};
const shortName = (role: CharacterRole) => {
  const d = disciplineOfRole[role];
  return disciplines.find((x) => x.id === d)?.short ?? roleNames[role] ?? role;
};

type Frame =
  ReturnType<typeof sampleFrame> extends Map<string, infer F> ? F : never;
type Location = { zoneId: string; roomId: string | null };
type Room = { id: string; name: string; polygon: Vec2[] };
type PairState = { since: number; last: number };

/**
 * Trace every person's touchpoints through the care day by sampling the same
 * helpers the renderer and metrics use. Events are sorted by `t`, then
 * `actorId`, then a fixed kind order, so the result is reproducible.
 */
export function traceTouchpoints(
  source: ActivitySource,
  model: Facility,
  opts: TraceOptions = {},
): TouchpointEvent[] {
  const step = opts.step ?? 2,
    radius = opts.encounterRadius ?? 1.6,
    minEncounter = opts.minEncounterSeconds ?? 4,
    gap = opts.encounterGapSeconds ?? 3,
    duration = source.duration,
    n = Math.round(duration / step);
  const groundZones = groundZonesOf(model);
  const zoneName = new Map(
    [...model.zones, ...(source.zones || [])].map((z) => [z.id, z.name] as const),
  );
  zoneName.set('site', 'Street & vans');
  const roomsByLevel = new Map<string, Room[]>();
  const addRoom = (levelId: string, r: Room) =>
    roomsByLevel.set(levelId, [...(roomsByLevel.get(levelId) || []), r]);
  for (const r of model.rooms) if (r.kind !== 'shell') addRoom(r.levelId, r);
  // Rooms of facilities stamped on source zones (community pads).
  const zoneRooms = (source.zones || []).flatMap((z) =>
    (z.rooms || []).map((r) => [z.levelId, r] as const),
  );
  for (const [levelId, r] of zoneRooms) addRoom(levelId, r);
  const actors = source.actors,
    selected = opts.actorIds ? new Set(opts.actorIds) : null,
    included = (id: string) => !selected || selected.has(id);
  const events: TouchpointEvent[] = [];
  const emit = (
    a: ActorSpec,
    t: number,
    f: Frame,
    kind: TouchpointKind,
    loc: Location | null,
    extra: Partial<TouchpointEvent> = {},
  ) => {
    if (!included(a.id)) return;
    events.push({
      t: round(t),
      clock: clockLabel(t, source),
      actorId: a.id,
      actorLabel: a.label,
      role: a.role,
      kind,
      zoneId: loc?.zoneId ?? f.zoneId,
      roomId: loc?.roomId ?? null,
      x: round(f.sample.x),
      z: round(f.sample.z),
      levelId: a.levelId,
      ...extra,
    });
  };

  // Per-actor state between samples.
  const location = new Map<string, Location | null>(),
    lastRoom = new Map<string, Room | null>(),
    riding = new Map<string, string | null>();
  const roomOf = (a: ActorSpec, f: Frame): Room | null => {
    const rooms = roomsByLevel.get(a.levelId);
    if (!rooms) return null;
    const p: Vec2 = [f.sample.x, f.sample.z],
      prev = lastRoom.get(a.id);
    if (prev && insidePolygon(p, prev.polygon)) return prev;
    return rooms.find((r) => insidePolygon(p, r.polygon)) ?? null;
  };
  const locate = (a: ActorSpec, f: Frame): Location | null => {
    if (!f.visible) return null;
    const room = roomOf(a, f);
    lastRoom.set(a.id, room);
    return { zoneId: f.zoneId, roomId: room?.id ?? null };
  };
  const roomTitle = new Map(
    [...model.rooms, ...zoneRooms.map(([, r]) => r)].map(
      (r) => [r.id, r.name] as const,
    ),
  );
  const placeName = (loc: Location) =>
    (loc.roomId && roomTitle.get(loc.roomId)) ||
    zoneName.get(loc.zoneId) ||
    loc.zoneId;

  // Interactions keyed by the sample at which they start and end.
  const sampleOf = (t: number) =>
    Math.min(n - 1, Math.max(0, Math.floor(t / step)));
  const startsAt = new Map<number, Interaction[]>(),
    endsAt = new Map<number, Interaction[]>();
  for (const i of source.interactions) {
    const ks = sampleOf(i.start),
      ke = sampleOf(i.end);
    startsAt.set(ks, [...(startsAt.get(ks) || []), i]);
    endsAt.set(ke, [...(endsAt.get(ke) || []), i]);
  }
  const byId = new Map(actors.map((a) => [a.id, a] as const)),
    indexOf = new Map(actors.map((a, i) => [a.id, i] as const));

  // Handoffs: the staff attending each participant (shared interaction,
  // escort or paired partner) and who most recently started attending.
  // Family members share interactions with a participant but are not staff.
  const participants = actors.filter((a) => a.role === 'participant'),
    attendants = new Map<string, ActorSpec[]>();
  for (const a of actors) {
    const p = a.escortFor || (isStaffRole(a.role) ? a.pairedWith : undefined);
    if (p) attendants.set(p, [...(attendants.get(p) || []), a]);
  }
  const attending = new Map<string, Set<string>>(),
    lastAttender = new Map<
      string,
      { id: string; role: CharacterRole; k: number }
    >();

  // Encounters: open proximity runs per pair, coalesced across short gaps.
  const pairs = new Map<number, PairState>(),
    N = actors.length;
  // Encounter events need the location at their start, so the frames at which
  // pairs opened are kept until the pair closes (sparse: only opening samples).
  const frames = new Map<number, Frame[]>(),
    frameRefs = new Map<number, number>();
  const retain = (k: number, frame: Frame[]) => {
    frames.set(k, frame);
    frameRefs.set(k, (frameRefs.get(k) || 0) + 1);
  };
  const release = (k: number) => {
    const c = (frameRefs.get(k) || 0) - 1;
    if (c <= 0) {
      frameRefs.delete(k);
      frames.delete(k);
    } else frameRefs.set(k, c);
  };
  const closePair = (i: number, j: number, s: PairState) => {
    const seconds = s.last - s.since + step;
    if (seconds < minEncounter) return;
    const k = Math.round(s.since / step),
      a = actors[i],
      b = actors[j];
    const fa = frames.get(k)?.[i],
      fb = frames.get(k)?.[j];
    if (!fa || !fb) return;
    const extra = { durationSeconds: round(seconds, 1) };
    emit(a, s.since, fa, 'encounter', locationAt(a, fa), {
      ...extra,
      with: [b.id],
    });
    emit(b, s.since, fb, 'encounter', locationAt(b, fb), {
      ...extra,
      with: [a.id],
    });
  };
  const locationAt = (a: ActorSpec, f: Frame): Location | null =>
    f.visible ? { zoneId: f.zoneId, roomId: roomOf(a, f)?.id ?? null } : null;
  const near = (a: ActorSpec, b: ActorSpec, fa: Frame, fb: Frame) =>
    fa.visible &&
    fb.visible &&
    (a.levelId === b.levelId || a.levelId === 'site' || b.levelId === 'site') &&
    Math.hypot(fa.sample.x - fb.sample.x, fa.sample.z - fb.sample.z) <= radius;

  let lastFrame: Frame[] = [];
  for (let k = 0; k < n; k++) {
    const t = k * step,
      map = sampleFrame(source, groundZones, t, opts.vehicles),
      frame = actors.map((a) => map.get(a.id)!);
    // Presence, zones, rooms and vehicles.
    for (const [i, a] of actors.entries()) {
      const f = frame[i],
        cur = locate(a, f),
        prev = k ? (location.get(a.id) ?? null) : null;
      if (k === 0)
        emit(a, 0, f, 'day-start', cur ?? { zoneId: f.zoneId, roomId: null });
      if (cur && !prev) emit(a, t, f, 'on-site', cur);
      if (
        prev &&
        (!cur || cur.zoneId !== prev.zoneId || cur.roomId !== prev.roomId)
      )
        emit(a, t, f, 'leave', prev);
      if (
        cur &&
        (!prev || cur.zoneId !== prev.zoneId || cur.roomId !== prev.roomId)
      )
        emit(a, t, f, 'enter', cur, { title: placeName(cur) });
      if (prev && !cur) emit(a, t, f, 'off-site', prev);
      location.set(a.id, cur);
      const vehicle =
        f.sample.action === 'ride' && f.sample.vehicleId
          ? f.sample.vehicleId
          : null;
      const was = riding.get(a.id) ?? null;
      if (vehicle && vehicle !== was)
        emit(a, t, f, 'board', cur, { vehicleId: vehicle });
      if (was && vehicle !== was)
        emit(a, t, f, 'alight', cur, { vehicleId: was });
      riding.set(a.id, vehicle);
    }
    // Interactions.
    for (const i of startsAt.get(k) || [])
      for (const id of i.actorIds) {
        const a = byId.get(id),
          f = a && frame[indexOf.get(id)!];
        if (!a || !f) continue;
        emit(
          a,
          Math.max(0, i.start),
          f,
          'interaction-start',
          location.get(a.id) ?? null,
          {
            with: i.actorIds.filter((x) => x !== id),
            interactionId: i.id,
            category: i.category,
            title: i.label,
          },
        );
      }
    for (const i of endsAt.get(k) || [])
      for (const id of i.actorIds) {
        const a = byId.get(id),
          f = a && frame[indexOf.get(id)!];
        if (!a || !f) continue;
        emit(
          a,
          Math.min(duration, i.end),
          f,
          'interaction-end',
          location.get(a.id) ?? null,
          {
            with: i.actorIds.filter((x) => x !== id),
            interactionId: i.id,
            category: i.category,
            title: i.label,
            durationSeconds: round(
              Math.min(duration, i.end) - Math.max(0, i.start),
            ),
          },
        );
      }
    // Handoffs between staff roles attending a participant.
    const active = source.interactions.filter((i) => t >= i.start && t < i.end);
    for (const p of participants) {
      const fp = frame[indexOf.get(p.id)!];
      const now = new Set<string>();
      for (const i of active)
        if (i.actorIds.includes(p.id))
          for (const id of i.actorIds) {
            const role = byId.get(id)?.role;
            if (id !== p.id && role && isStaffRole(role)) now.add(id);
          }
      for (const s of attendants.get(p.id) || [])
        if (fp.visible && frame[indexOf.get(s.id)!].visible) now.add(s.id);
      const before = attending.get(p.id) || new Set<string>();
      const newcomers = [...now].filter((id) => !before.has(id)).sort();
      for (const id of newcomers) {
        const s = byId.get(id)!,
          prev = lastAttender.get(p.id);
        if (prev && prev.k < k && prev.id !== id && prev.role !== s.role)
          emit(p, t, fp, 'handoff', location.get(p.id) ?? null, {
            with: [prev.id, id],
            title: `${shortName(prev.role)} → ${shortName(s.role)}`,
          });
      }
      if (newcomers.length) {
        const last = byId.get(newcomers[newcomers.length - 1])!;
        lastAttender.set(p.id, { id: last.id, role: last.role, k });
      }
      attending.set(p.id, now);
    }
    // Encounters.
    for (let i = 0; i < N; i++) {
      const fa = frame[i];
      if (!fa.visible) continue;
      for (let j = i + 1; j < N; j++) {
        if (!near(actors[i], actors[j], fa, frame[j])) continue;
        const key = i * N + j,
          s = pairs.get(key);
        if (s && t - s.last <= gap) s.last = t;
        else {
          if (s) {
            closePair(i, j, s);
            release(Math.round(s.since / step));
          }
          pairs.set(key, { since: t, last: t });
          retain(k, frame);
        }
      }
    }
    lastFrame = frame;
  }
  for (const [key, s] of pairs) {
    const i = Math.floor(key / N),
      j = key % N;
    closePair(i, j, s);
  }
  for (const [i, a] of actors.entries())
    emit(a, duration, lastFrame[i], 'day-end', location.get(a.id) ?? null);

  return events
    .map((e, i) => [e, i] as const)
    .sort(
      ([a, i], [b, j]) =>
        a.t - b.t ||
        (a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0) ||
        kindRank.get(a.kind)! - kindRank.get(b.kind)! ||
        i - j,
    )
    .map(([e]) => e);
}

/** Contiguous stays of one person, from their enter/leave events. */
export function dwellIntervals(events: TouchpointEvent[]): DwellInterval[] {
  const out: DwellInterval[] = [];
  let open: DwellInterval | null = null;
  let end = 0;
  for (const e of events) {
    end = Math.max(end, e.t);
    if (e.kind === 'enter') {
      if (open) out.push({ ...open, end: e.t });
      open = {
        zoneId: e.zoneId,
        roomId: e.roomId ?? null,
        start: e.t,
        end: e.t,
      };
    } else if (e.kind === 'leave' && open) {
      out.push({ ...open, end: e.t });
      open = null;
    } else if (e.kind === 'day-end' && open) {
      out.push({ ...open, end: e.t });
      open = null;
    }
  }
  if (open) out.push({ ...open, end });
  return out;
}

/** One person's day: their events plus zone dwell, disciplines met and counts. */
export function personJourney(
  events: TouchpointEvent[],
  actorId: string,
): PersonJourney {
  const roleOf = new Map<string, CharacterRole>();
  for (const e of events)
    if (!roleOf.has(e.actorId)) roleOf.set(e.actorId, e.role);
  const mine = events.filter((e) => e.actorId === actorId);
  const first = mine[0];
  const zoneSeconds = new Map<string, number>();
  for (const d of dwellIntervals(mine))
    zoneSeconds.set(
      d.zoneId,
      (zoneSeconds.get(d.zoneId) || 0) + d.end - d.start,
    );
  const met = new Set<string>();
  for (const e of mine)
    if (
      e.kind === 'encounter' ||
      e.kind === 'interaction-start' ||
      e.kind === 'handoff'
    )
      for (const id of e.with || []) {
        const role = roleOf.get(id),
          d = role && disciplineOfRole[role];
        if (d) met.add(d);
      }
  const presence = mine.filter(
    (e) => e.kind === 'on-site' || e.kind === 'off-site',
  );
  const dayEnd = mine.find((e) => e.kind === 'day-end');
  const lastPresence = presence[presence.length - 1];
  return {
    actorId,
    label: first?.actorLabel ?? actorId,
    role: first?.role ?? 'participant',
    events: mine,
    zones: [...zoneSeconds.entries()]
      .map(([zoneId, seconds]) => ({ zoneId, seconds: round(seconds, 1) }))
      .sort((a, b) => b.seconds - a.seconds),
    disciplines: disciplines.map((d) => d.id).filter((d) => met.has(d)),
    encounters: mine.filter((e) => e.kind === 'encounter').length,
    interactions: mine.filter((e) => e.kind === 'interaction-start').length,
    firstOnSite: presence.find((e) => e.kind === 'on-site')?.t,
    lastOnSite: lastPresence
      ? lastPresence.kind === 'on-site'
        ? dayEnd?.t
        : lastPresence.t
      : undefined,
  };
}

/** Whole-trace counts: people, events by kind and participant coverage. */
export function traceSummary(
  events: TouchpointEvent[],
  source: ActivitySource,
): TraceSummary {
  const people = new Set(events.map((e) => e.actorId));
  const byKind: Record<string, number> = {};
  for (const k of KIND_ORDER) byKind[k] = 0;
  const perParticipant = new Map<string, number>(),
    covered = Object.fromEntries(
      TRACE_BUCKETS.map((k) => [k, new Set<string>()]),
    ) as Record<keyof TraceSummary['participantsWith'], Set<string>>;
  const participants = new Set(
    source.actors
      .filter((a) => a.role === 'participant' && people.has(a.id))
      .map((a) => a.id),
  );
  for (const id of participants) perParticipant.set(id, 0);
  for (const e of events) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    if (!participants.has(e.actorId)) continue;
    perParticipant.set(e.actorId, perParticipant.get(e.actorId)! + 1);
    const bucket =
      e.kind === 'interaction-start' &&
      e.category &&
      CATEGORY_BUCKET[e.category];
    if (bucket) covered[bucket].add(e.actorId);
  }
  const counts = [...perParticipant.values()].sort((a, b) => a - b);
  const median = counts.length
    ? counts.length % 2
      ? counts[(counts.length - 1) / 2]
      : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2
    : 0;
  return {
    people: people.size,
    events: events.length,
    byKind,
    participantsWith: Object.fromEntries(
      TRACE_BUCKETS.map((k) => [k, covered[k].size]),
    ) as TraceSummary['participantsWith'],
    medianEventsPerParticipant: median,
  };
}
