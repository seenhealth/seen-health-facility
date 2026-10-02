/**
 * Measurement over an ActivitySource by sampling the same functions the
 * renderer uses (sampleActor / sampleEscort / samplePairedActors), so what is
 * measured is exactly what is shown.
 *
 * Pure and synchronous: runs in the browser (Measure panel) and in Node
 * (scripts/sim-report.mjs).
 */
import {
  sampleActor,
  sampleEscort,
  samplePairedActors,
  seatInVehicle,
  type ActivitySource,
  type ActorSample,
  type ActorSpec,
  type VehicleLookup,
} from '../model/activity';
import { isStaffRole, type CharacterRole } from '../model/characters';
import type { Facility, Vec2 } from '../model/schema';
import { COMMUNITY_CATEGORIES } from '../model/community-settings';
import careTeam from '../data/care-team.json';
import { insidePolygon } from './nav';

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------
/** How a staff member spends a moment. */
export type StaffActivity =
  | 'care'
  | 'walking'
  | 'documenting'
  | 'meeting'
  | 'driving'
  | 'offDuty';
export const STAFF_ACTIVITIES: StaffActivity[] = [
  'care',
  'walking',
  'documenting',
  'meeting',
  'driving',
  'offDuty',
];
export const staffActivityLabels: Record<StaffActivity, string> = {
  care: 'Direct care & programs',
  walking: 'Walking & escorting',
  documenting: 'Documenting & standby',
  meeting: 'Team meetings',
  driving: 'Driving',
  offDuty: 'Off floor',
};
/** Participant time categories (interaction categories plus movement). */
export type ParticipantActivity =
  | 'offSite'
  | 'arrivals'
  | 'clinical'
  | 'rehab'
  | 'activities'
  | 'meals'
  | 'coordination'
  | 'community'
  | 'moving'
  | 'waiting';
export const PARTICIPANT_ACTIVITIES: ParticipantActivity[] = [
  'arrivals',
  'clinical',
  'rehab',
  'activities',
  'meals',
  'coordination',
  'community',
  'moving',
  'waiting',
  'offSite',
];
export const participantActivityLabels: Record<ParticipantActivity, string> = {
  offSite: 'Home, in the van or away',
  arrivals: 'Arrival, check-in & departure',
  clinical: 'Clinical & personal care',
  rehab: 'Therapy',
  activities: 'Activities',
  meals: 'Meals',
  coordination: 'Social work & coordination',
  community: 'Care at home & in the community',
  moving: 'Walking between',
  waiting: 'Waiting & free time',
};
const CARE_ACTIONS = new Set([
  'treat',
  'consult',
  'tabletop',
  'exercise',
  'serve',
  'greet',
  'present',
  'conversation',
  'perform',
  'clap',
  'dance',
  'tai-chi',
  'device',
  'write',
  'craft',
  'music',
  'escort',
  'phone',
]);
const CATEGORY_PRIORITY: ParticipantActivity[] = [
  'clinical',
  'rehab',
  'meals',
  'coordination',
  'activities',
  'arrivals',
  'community',
];
/** Interaction categories of the distributed-care layer, measured as one bucket. */
const COMMUNITY_CATEGORY_IDS = new Set(COMMUNITY_CATEGORIES.map(([id]) => id));
const categoryBucket = (category: string): ParticipantActivity | null =>
  COMMUNITY_CATEGORY_IDS.has(category)
    ? 'community'
    : (CATEGORY_PRIORITY as string[]).includes(category)
      ? (category as ParticipantActivity)
      : null;
/** Character role → IDT discipline id (care-team.json), when there is one. */
export const disciplineOfRole: Partial<Record<CharacterRole, string>> =
  Object.fromEntries(
    careTeam.members.map((m) => [m.characterRole, m.id] as const),
  );
export const disciplines = careTeam.members.map((m) => ({
  id: m.id,
  title: m.title,
  short: m.short,
  color: m.color,
  characterRole: m.characterRole as CharacterRole,
}));

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export type ZoneSeries = {
  zoneId: string;
  name: string;
  levelId: string;
  participants: number[];
  staff: number[];
  peakParticipants: number;
  peakStaff: number;
  /** Mean headcount over the day (people present × time / day). */
  meanParticipants: number;
  meanStaff: number;
  /** Person-minutes of clock time spent in the zone. */
  participantMinutes: number;
  staffMinutes: number;
};
export type RoleUtilization = {
  role: CharacterRole;
  label: string;
  headcount: number;
  /** Seconds per activity, summed over everyone in the role. */
  seconds: Record<StaffActivity, number>;
  /** Share of on-floor time (excludes off-floor), 0–1. */
  share: Record<StaffActivity, number>;
  onFloorSeconds: number;
  /** Mean visible walking distance per person (m). */
  meanWalkMeters: number;
};
export type ParticipantTime = {
  id: string;
  label: string;
  seconds: Record<ParticipantActivity, number>;
  walkMeters: number;
};
export type Touchpoint = {
  discipline: string;
  short: string;
  title: string;
  color: string;
  /** Clock minutes with that discipline alongside the hero. */
  minutes: number;
  /** Distinct contiguous encounters. */
  episodes: number;
  firstAt: number | null;
  actorIds: string[];
};
export type HeroMetrics = {
  id: string;
  label: string;
  time: ParticipantTime;
  touchpoints: Touchpoint[];
  disciplinesSeen: number;
  walkMeters: number;
};
export type HandoffMetrics = {
  total: number;
  byStep: { stepId: string; count: number }[];
  byDiscipline: { discipline: string; sent: number; received: number }[];
  pairs: { from: string; to: string; count: number }[];
};
export type SimMetrics = {
  step: number;
  duration: number;
  dayStartMinutes: number;
  dayDurationMinutes: number;
  times: number[];
  zones: ZoneSeries[];
  onSite: { participants: number[]; staff: number[] };
  roles: RoleUtilization[];
  participants: ParticipantTime[];
  participantTotals: Record<ParticipantActivity, number>;
  hero: HeroMetrics | null;
  handoffs: HandoffMetrics | null;
  headline: {
    /** Participants, staff (as people) and family members. */
    people: number;
    participants: number;
    staff: number;
    /** Family members (a daughter at home): neither staff nor participants. */
    family: number;
    peakParticipantsOnSite: number;
    peakStaffOnFloor: number;
    staffCareShare: number;
    staffWalkingShare: number;
    meanParticipantActiveShare: number;
  };
};
export type MetricsOptions = {
  /** Sampling interval in loop seconds (default 1). */
  step?: number;
  /** Hero whose touchpoints are measured. */
  heroId?: string;
  /**
   * Scenario steps whose handoffs are counted: every step is part of the
   * hero's day (her moments at home and behind the scenes included); the
   * story's closing highlights are kept apart in `scenario.highlights`.
   */
  steps?: {
    id: string;
    handoffs: { from: string; to: string; note: string }[];
  }[];
  /** Distance (m) that counts as being with the hero. */
  touchRadius?: number;
  /**
   * Vehicle poses for seated riders (the viewer's `activity.vehicles`, or
   * `alhambraVehicles()` in Node). Without it riders stay on their nominal
   * ride path.
   */
  vehicles?: VehicleLookup;
};

const zeros = (n: number) => Array.from({ length: n }, () => 0);
/** Ground-floor zones used to locate people by point-in-polygon, like the engine. */
export const groundZonesOf = (model: Pick<Facility, 'zones'>) =>
  model.zones
    .filter((z) => z.levelId === 'ground' && z.id !== 'adjacent')
    .map((z) => ({ id: z.id, polygon: z.polygon }));
const blank = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const minutesPer = (s: ActivitySource) => s.dayDurationMinutes / s.duration;

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------
type Frame = {
  sample: ActorSample;
  visible: boolean;
  zoneId: string;
  /** In one of the source's zones beyond the facility (a home, a partner site). */
  away: boolean;
};
/**
 * Sample every actor at time t exactly like the activity engine does: escorts
 * and pairs, riders seated in their vehicle when `vehicles` is given, ground
 * people located by zone polygon and site-level people by the source's own
 * zones (homes, partner sites), else the street ('site').
 */
export function sampleFrame(
  source: ActivitySource,
  groundZones: { id: string; polygon: Vec2[] }[],
  t: number,
  vehicles?: VehicleLookup,
): Map<string, Frame> {
  const byId = new Map(source.actors.map((a) => [a.id, a] as const)),
    paired = new Map<string, ActorSample>(),
    out = new Map<string, Frame>(),
    away = source.zones || [];
  for (const a of source.actors)
    if (a.pairedWith) {
      const partner = byId.get(a.pairedWith);
      if (!partner) continue;
      const pair = samplePairedActors(a, partner, t);
      paired.set(a.id, pair.staff);
      paired.set(a.pairedWith, pair.participant);
    }
  for (const a of source.actors) {
    const leader = a.escortFor ? byId.get(a.escortFor) : undefined;
    let s = leader
      ? sampleEscort(leader, t)
      : paired.get(a.id) || sampleActor(a, t);
    // An escort rides in its own seat rather than on top of its partner.
    if (leader && s.vehicleId && s.seat) s = sampleActor(a, t);
    const ride =
      vehicles && s.vehicleId && s.seat ? vehicles.sample(s.vehicleId, t) : null;
    if (ride)
      s = {
        ...s,
        ...seatInVehicle(ride, s.seat!, s.seatHeading),
        visible: s.visible !== false && ride.visible,
      };
    const p: Vec2 = [s.x, s.z];
    let zoneId = s.zoneId;
    if (a.levelId === 'ground')
      zoneId =
        groundZones.find((z) => insidePolygon(p, z.polygon))?.id ||
        (s.vehicleId || a.arrivalVehicleId ? 'site' : s.zoneId);
    if (a.levelId === 'site' || zoneId === 'site')
      zoneId =
        away.find((z) => z.levelId === 'site' && insidePolygon(p, z.polygon))
          ?.id || 'site';
    out.set(a.id, {
      sample: s,
      visible: s.visible !== false,
      zoneId,
      away: away.some((z) => z.id === zoneId),
    });
  }
  return out;
}
function staffActivity(a: ActorSpec, f: Frame, moved: boolean): StaffActivity {
  const s = f.sample;
  if (!f.visible) return s.action === 'ride' && s.vehicleId && a.role === 'driver' ? 'driving' : 'offDuty';
  if (s.action === 'ride') return 'driving';
  if (s.action === 'walk' || s.action === 'roll' || (a.escortFor && moved))
    return 'walking';
  // A call is care coordination, also from a desk upstairs (the nurse line).
  if (s.action === 'phone') return 'care';
  if (a.levelId === 'upper' && s.seated) return 'meeting';
  if (a.levelId === 'upper' && ['present', 'listen'].includes(s.action))
    return 'meeting';
  if (s.action === 'document' || s.action === 'idle' || s.action === 'listen')
    return 'documenting';
  return CARE_ACTIONS.has(s.action) ? 'care' : 'documenting';
}

/** Measure an activity source over the whole care day. */
export function computeMetrics(
  source: ActivitySource,
  model: Pick<Facility, 'zones'>,
  options: MetricsOptions = {},
): SimMetrics {
  const step = options.step ?? 1,
    radius = options.touchRadius ?? 1.6,
    perSecond = minutesPer(source);
  const n = Math.round(source.duration / step);
  const times = Array.from({ length: n }, (_, i) => i * step);
  const groundZones = groundZonesOf(model);
  const zoneInfo = new Map<string, { name: string; levelId: string }>([
    ['site', { name: 'Street & vans', levelId: 'site' }],
  ]);
  for (const z of [...model.zones, ...(source.zones || [])])
    zoneInfo.set(z.id, { name: z.name, levelId: z.levelId });
  // Family members (a daughter at home) are neither staff nor participants:
  // they count among the people measured, not in occupancy or staff time.
  const staff = source.actors.filter((a) => isStaffRole(a.role)),
    participants = source.actors.filter((a) => a.role === 'participant'),
    family = source.actors.filter((a) => a.role === 'family');
  const zoneSeries = new Map<string, { participants: number[]; staff: number[] }>();
  const series = (id: string) => {
    let s = zoneSeries.get(id);
    if (!s) {
      s = { participants: zeros(n), staff: zeros(n) };
      zoneSeries.set(id, s);
    }
    return s;
  };
  const onSite = { participants: zeros(n), staff: zeros(n) };
  // Staff are counted as people, not tracks: an upstairs meeting attendee and
  // the same person's ground-floor track share a profile id.
  const identityOf = (a: ActorSpec) => a.profileId || a.id;
  const staffPeople = new Map<string, ActorSpec[]>();
  for (const a of staff)
    staffPeople.set(identityOf(a), [...(staffPeople.get(identityOf(a)) || []), a]);
  const staffSeconds = new Map(
    [...staffPeople.keys()].map((id) => [id, blank(STAFF_ACTIVITIES)]),
  );
  const partSeconds = new Map(
    participants.map((a) => [a.id, blank(PARTICIPANT_ACTIVITIES)]),
  );
  const walked = new Map(source.actors.map((a) => [a.id, 0]));
  /** Staff seen at the center at least once; role utilization covers them. */
  const atCenter = new Set<string>();
  const hero = options.heroId
    ? source.actors.find((a) => a.id === options.heroId) || null
    : null;
  const heroContact = new Map<string, { flags: boolean[]; actors: Set<string> }>();
  const interactionsAt = (t: number) =>
    source.interactions.filter((i) => t >= i.start && t < i.end);
  let prev: Map<string, Frame> | null = null;
  // One extra frame closes the loop for walking distances.
  for (let k = 0; k <= n; k++) {
    const t = k * step,
      frame = sampleFrame(source, groundZones, t % source.duration, options.vehicles);
    if (prev)
      for (const a of source.actors) {
        const p = prev.get(a.id)!,
          q = frame.get(a.id)!;
        if (p.visible && q.visible) {
          const d = Math.hypot(q.sample.x - p.sample.x, q.sample.z - p.sample.z);
          // Ignore jumps (vehicle boarding, loop seams): not walking.
          if (d < step * 3) walked.set(a.id, walked.get(a.id)! + d);
        }
      }
    if (k === n) break;
    const active = interactionsAt(t);
    for (const a of source.actors) {
      const f = frame.get(a.id)!;
      // Occupancy counts participants and staff; family members are neither.
      if (f.visible && a.role !== 'family') {
        const s = series(f.zoneId),
          staffMember = a.role !== 'participant';
        if (staffMember) s.staff[k]++;
        else s.participants[k]++;
        // On site means at the center: homes and partner sites do not count.
        if (!f.away) {
          if (staffMember) onSite.staff[k]++;
          else onSite.participants[k]++;
          if (staffMember) atCenter.add(identityOf(a));
        }
      }
      if (a.role !== 'participant') continue;
      {
        let cat: ParticipantActivity;
        const mine = active.filter((i) => i.actorIds.includes(a.id));
        const found = CATEGORY_PRIORITY.find((c) =>
          mine.some((i) => categoryBucket(i.category) === c),
        );
        if (!f.visible) cat = 'offSite';
        // Away from the center, only care touchpoints count; the rest is home.
        else if (f.away) cat = found === 'community' ? found : 'offSite';
        else if (found && !(f.sample.action === 'walk' && found !== 'arrivals'))
          cat = found;
        else if (f.sample.action === 'walk' || f.sample.action === 'roll')
          cat = 'moving';
        else cat = 'waiting';
        partSeconds.get(a.id)![cat] += step;
      }
    }
    for (const [id, members] of staffPeople) {
      // Whichever of the person's tracks is on the floor; else driving; else off.
      let act: StaffActivity = 'offDuty';
      for (const a of members) {
        const f = frame.get(a.id)!,
          p = prev?.get(a.id),
          moved =
            !!p &&
            Math.hypot(f.sample.x - p.sample.x, f.sample.z - p.sample.z) >
              0.05 * step;
        const x = staffActivity(a, f, moved);
        if (x !== 'offDuty') act = x;
        if (f.visible) break;
      }
      staffSeconds.get(id)![act] += step;
    }
    if (hero) {
      const h = frame.get(hero.id)!;
      if (h.visible) {
        const shared = new Set(
          active.filter((i) => i.actorIds.includes(hero.id)).flatMap((i) => i.actorIds),
        );
        for (const a of staff) {
          const f = frame.get(a.id)!;
          if (!f.visible || a.levelId !== hero.levelId && a.levelId !== 'site') continue;
          const near =
            Math.hypot(f.sample.x - h.sample.x, f.sample.z - h.sample.z) <= radius;
          if (!near && !shared.has(a.id)) continue;
          const disc = disciplineOfRole[a.role];
          if (!disc) continue;
          let c = heroContact.get(disc);
          if (!c) {
            c = { flags: Array.from({ length: n }, () => false), actors: new Set() };
            heroContact.set(disc, c);
          }
          c.flags[k] = true;
          c.actors.add(a.id);
        }
      }
    }
    prev = frame;
  }

  // Zones.
  const zones: ZoneSeries[] = [...zoneSeries.entries()]
    .map(([zoneId, s]) => {
      const info = zoneInfo.get(zoneId) || { name: zoneId, levelId: 'ground' };
      const sumP = s.participants.reduce((a, b) => a + b, 0),
        sumS = s.staff.reduce((a, b) => a + b, 0);
      return {
        zoneId,
        name: info.name,
        levelId: info.levelId,
        participants: s.participants,
        staff: s.staff,
        peakParticipants: Math.max(...s.participants),
        peakStaff: Math.max(...s.staff),
        meanParticipants: sumP / n,
        meanStaff: sumS / n,
        participantMinutes: sumP * step * perSecond,
        staffMinutes: sumS * step * perSecond,
      };
    })
    .sort((a, b) => b.participantMinutes + b.staffMinutes - (a.participantMinutes + a.staffMinutes));

  // Roles.
  const roleNames: Record<string, string> = {};
  for (const m of careTeam.members) roleNames[m.characterRole] = m.title;
  Object.assign(roleNames, {
    reception: 'Front desk',
    nutrition: 'Food service',
    coordinator: roleNames.coordinator || 'Care coordinator',
  });
  // Staff time by role describes the center's staff; partner staff who only
  // appear at a home or partner site are in occupancy and the trace instead.
  const roleMap = new Map<CharacterRole, string[]>();
  for (const [id, members] of staffPeople)
    if (atCenter.has(id))
      roleMap.set(members[0].role, [...(roleMap.get(members[0].role) || []), id]);
  const walkedBy = (id: string) =>
    staffPeople.get(id)!.reduce((s, a) => s + walked.get(a.id)!, 0);
  const roles: RoleUtilization[] = [...roleMap.entries()]
    .map(([role, people]) => {
      const seconds = blank(STAFF_ACTIVITIES);
      for (const id of people)
        for (const k of STAFF_ACTIVITIES) seconds[k] += staffSeconds.get(id)![k];
      const onFloor = STAFF_ACTIVITIES.filter((k) => k !== 'offDuty').reduce(
        (s, k) => s + seconds[k],
        0,
      );
      const share = blank(STAFF_ACTIVITIES);
      for (const k of STAFF_ACTIVITIES)
        share[k] =
          k === 'offDuty'
            ? seconds[k] / (n * step * people.length)
            : onFloor
              ? seconds[k] / onFloor
              : 0;
      return {
        role,
        label: roleNames[role] || role,
        headcount: people.length,
        seconds,
        share,
        onFloorSeconds: onFloor,
        meanWalkMeters:
          people.reduce((s, id) => s + walkedBy(id), 0) / people.length,
      };
    })
    .sort((a, b) => b.share.care - a.share.care);

  // Participants.
  const participantTimes: ParticipantTime[] = participants.map((a) => ({
    id: a.id,
    label: a.label,
    seconds: partSeconds.get(a.id)!,
    walkMeters: walked.get(a.id)!,
  }));
  const participantTotals = blank(PARTICIPANT_ACTIVITIES);
  for (const p of participantTimes)
    for (const k of PARTICIPANT_ACTIVITIES) participantTotals[k] += p.seconds[k];

  // Hero.
  let heroMetrics: HeroMetrics | null = null;
  if (hero) {
    const touchpoints: Touchpoint[] = disciplines
      .map((d) => {
        const c = heroContact.get(d.id);
        const flags = c?.flags || [];
        let episodes = 0,
          gap = Infinity,
          count = 0,
          first: number | null = null;
        for (let k = 0; k < n; k++) {
          if (flags[k]) {
            if (gap * step > 3) episodes++;
            gap = 0;
            count++;
            if (first === null) first = times[k];
          } else gap++;
        }
        return {
          discipline: d.id,
          short: d.short,
          title: d.title,
          color: d.color,
          minutes: count * step * perSecond,
          episodes,
          firstAt: first,
          actorIds: [...(c?.actors || [])],
        };
      });
    const time = participantTimes.find((p) => p.id === hero.id)!;
    heroMetrics = {
      id: hero.id,
      label: hero.label,
      time,
      touchpoints,
      disciplinesSeen: touchpoints.filter((t) => t.episodes > 0).length,
      walkMeters: time.walkMeters,
    };
  }

  // Handoffs.
  let handoffs: HandoffMetrics | null = null;
  const heroSteps = options.steps;
  if (heroSteps) {
    const pairs = new Map<string, number>(),
      sent = new Map<string, number>(),
      received = new Map<string, number>();
    for (const s of heroSteps)
      for (const h of s.handoffs) {
        pairs.set(`${h.from}→${h.to}`, (pairs.get(`${h.from}→${h.to}`) || 0) + 1);
        sent.set(h.from, (sent.get(h.from) || 0) + 1);
        received.set(h.to, (received.get(h.to) || 0) + 1);
      }
    handoffs = {
      total: heroSteps.reduce((s, x) => s + x.handoffs.length, 0),
      byStep: heroSteps.map((s) => ({ stepId: s.id, count: s.handoffs.length })),
      byDiscipline: disciplines
        .map((d) => ({
          discipline: d.id,
          sent: sent.get(d.id) || 0,
          received: received.get(d.id) || 0,
        }))
        .filter((d) => d.sent || d.received),
      pairs: [...pairs.entries()].map(([k, count]) => {
        const [from, to] = k.split('→');
        return { from, to, count };
      }),
    };
  }

  const staffOnFloor = roles.reduce((s, r) => s + r.onFloorSeconds, 0);
  const careSeconds = roles.reduce((s, r) => s + r.seconds.care, 0),
    walkSeconds = roles.reduce((s, r) => s + r.seconds.walking, 0);
  const activeShare =
    participantTimes.reduce((s, p) => {
      const onSiteSeconds = n * step - p.seconds.offSite;
      const active =
        p.seconds.clinical + p.seconds.rehab + p.seconds.activities + p.seconds.meals + p.seconds.coordination + p.seconds.community;
      return s + (onSiteSeconds > 0 ? active / onSiteSeconds : 0);
    }, 0) / Math.max(1, participantTimes.length);
  return {
    step,
    duration: source.duration,
    dayStartMinutes: source.dayStartMinutes,
    dayDurationMinutes: source.dayDurationMinutes,
    times,
    zones,
    onSite,
    roles,
    participants: participantTimes,
    participantTotals,
    hero: heroMetrics,
    handoffs,
    headline: {
      people: participants.length + staffPeople.size + family.length,
      participants: participants.length,
      staff: staffPeople.size,
      family: family.length,
      peakParticipantsOnSite: Math.max(...onSite.participants),
      peakStaffOnFloor: Math.max(...onSite.staff),
      staffCareShare: staffOnFloor ? careSeconds / staffOnFloor : 0,
      staffWalkingShare: staffOnFloor ? walkSeconds / staffOnFloor : 0,
      meanParticipantActiveShare: activeShare,
    },
  };
}
