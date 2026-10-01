import scenario from '../data/scenarios/day-in-the-life.json';
import careTeam from '../data/care-team.json';
import { isCutawayStep, scrubWindows } from '../sim/story-timeline';

/** Typed views of the shared story contracts (scenario script + IDT roster). */
export type Handoff = { from: string; to: string; note: string };
export type Stop = { roomId: string; window: [number, number]; activity: string };
export type Step = {
  id: string;
  window: [number, number];
  zoneId: string;
  roomId: string | null;
  title: string;
  kicker: string;
  body: string;
  roles: string[];
  handoffs: Handoff[];
  heroPresent: boolean;
  stops?: Stop[];
  /** Cutaways only: the care setting shown (a `careSettings` id). */
  settingId?: string;
  /** Cutaways only: the community interactions shown; the camera follows the first. */
  interactionIds?: string[];
  /** External roles named on the card and in the swimlane (not IDT disciplines). */
  partners?: string[];
};
export type Member = {
  id: string;
  title: string;
  short: string;
  characterRole: string;
  group: string;
  focus: string;
  color: string;
};

// The JSON also carries simulation placement fields the story ignores.
export const steps = scenario.steps as unknown as Step[];
export const hero = scenario.hero;
export const clock = scenario.clock;
export const basis = scenario.basis;
export const members = careTeam.members as Member[];
export const teamBasis = careTeam.basis;
export const palette = careTeam.palette;
export const memberById = new Map(members.map((m) => [m.id, m]));

export const groups = [
  { id: 'clinical', label: 'Clinical' },
  { id: 'support', label: 'Support' },
  { id: 'operations', label: 'Operations' },
  { id: 'therapy', label: 'Therapy' },
] as const;

/**
 * Clockwise ring order (starting at the top). Groups stay contiguous and the
 * order keeps the most frequent handoff partners (RN-PCP, PCP-PT, PT-OT,
 * RD-PCA, MSW-HCC, HCC-CM, CM-Driver) next to each other.
 */
const RING = [
  'rn',
  'dietitian',
  'pca',
  'msw',
  'home-care',
  'center-manager',
  'driver',
  'rec',
  'ot',
  'pt',
  'pcp',
];
export const ringMembers: Member[] = [
  ...RING.map((id) => memberById.get(id)).filter((m): m is Member => !!m),
  ...members.filter((m) => !RING.includes(m.id)),
];
/** Swimlane order: grouped, clinical first. */
export const laneMembers: Member[] = groups.flatMap((g) =>
  members.filter((m) => m.group === g.id),
);

/**
 * A cutaway: a moment across the care network (a partner site or a home)
 * without Mrs. Lin. Cutaways have their own counters; touchpoints and
 * handoffs stay hers.
 */
export const isCutaway = (s: Step) => isCutawayStep(s);

/** Compact UI labels for the day-flow strip, rail, ring hub and swimlane headers. */
const SHORT: Record<string, string> = {
  huddle: 'Huddle',
  pickup: 'Pickup',
  checkin: 'Check-in',
  clinic: 'Clinic',
  therapy: 'Therapy',
  program: 'Day room',
  lunch: 'Lunch',
  'social-work': 'Social work',
  recreation: 'Recreation',
  'personal-care': 'Personal care',
  farewell: 'Farewell',
  'ride-home': 'Ride home',
  'care-plan': 'Care plan',
  'network-pharmacy': 'Pharmacy',
  'network-home-am': 'At home',
  'network-specialist': 'Cardiology',
  'network-partner': 'Partner ADC',
  'network-hospital': 'Hospital',
  'network-home-pm': 'Home health',
};
export const shortLabel = (s: Step) =>
  SHORT[s.id] || s.kicker.split('·').pop()!.trim();
/** Where a step happens, from its kicker ("8:20 AM · Partner pharmacy" → "Partner pharmacy"). */
export const placeLabel = (s: Step) =>
  s.kicker.split('·').slice(1).join('·').trim() || shortLabel(s);
/** "9:25 AM" from the kicker when present, else from the window start. */
export const kickerTime = (s: Step) => {
  const [head] = s.kicker.split('·');
  return /\d:\d\d/.test(head) ? head.trim() : clockLabel(s.window[0]);
};

export function clockMinutes(t: number) {
  return clock.dayStartMinutes + (t / clock.duration) * clock.dayDurationMinutes;
}
export function clockLabel(t: number, withPeriod = true) {
  const minutes = Math.floor(clockMinutes(t) + 1e-6),
    h = Math.floor(minutes / 60),
    m = String(minutes % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m}${withPeriod ? (h >= 12 ? ' PM' : ' AM') : ''}`;
}

type Counts = { touchpoints: number; handoffs: number };
const count = (list: Step[]): Counts => ({
  touchpoints: list.reduce((n, s) => n + s.roles.length, 0),
  handoffs: list.reduce((n, s) => n + s.handoffs.length, 0),
});
/** Cumulative counts of the steps before each step index that pass `keep`. */
const cumulative = (keep: (s: Step) => boolean) =>
  steps.reduce<Counts[]>(
    (acc, s, i) => {
      const prev = acc[i],
        add = keep(s) ? count([s]) : { touchpoints: 0, handoffs: 0 };
      acc.push({
        touchpoints: prev.touchpoints + add.touchpoints,
        handoffs: prev.handoffs + add.handoffs,
      });
      return acc;
    },
    [{ touchpoints: 0, handoffs: 0 }],
  );
export const heroSteps = steps.filter((s) => !isCutaway(s));
export const networkSteps = steps.filter(isCutaway);
/** Mrs. Lin's day: disciplines, and touchpoints and handoffs across her steps. */
export const totals = { disciplines: members.length, ...count(heroSteps) };
/** The moments across the care network (cutaways), kept apart from Mrs. Lin's. */
export const networkTotals = { moments: networkSteps.length, ...count(networkSteps) };
/** Mrs. Lin's counts before each step index (index i = her steps among steps < i). */
export const before = cumulative((s) => !isCutaway(s));
/** The network's counts before each step index (cutaways among steps < i). */
export const beforeNetwork = cumulative(isCutaway);
export const isTeamMeeting = (s: Step) =>
  !s.heroPresent && !isCutaway(s) && s.roles.length >= members.length;
/**
 * Scroll-scrubbed clock range per step: hero chapters are clipped on screen
 * around the cutaways next to them (`app/sim/story-timeline.ts`).
 */
export const scrub = scrubWindows(steps);
