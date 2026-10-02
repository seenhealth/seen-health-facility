import scenario from '../data/scenarios/day-in-the-life.json';
import careTeam from '../data/care-team.json';
import { isCutawayStep, scrubWindows, type StoryHighlight } from '../sim/story-timeline';

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
  /** Cutaways at a care setting: the setting shown (a `careSettings` id). */
  settingId?: string;
  /** Cutaways only: the interactions shown; the camera follows the first. */
  interactionIds?: string[];
  /** Cutaways that are Mrs. Lin's own moment (at home): the actor standing in for her. */
  heroAlias?: string;
  /** People outside the team named on the card and in the swimlane (not IDT disciplines). */
  partners?: string[];
};
export type Highlight = StoryHighlight;
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
/** The closing highlights: services beyond Mrs. Lin's day, each on its own clock. */
export const highlights = scenario.highlights as unknown as Highlight[];
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
 * A cutaway: a moment told through interactions already in the care day
 * (Mrs. Lin at home, lunch arriving in the kitchen) rather than compiled hero
 * tracks. Every step is part of her day and counts toward her totals.
 */
export const isCutaway = (s: Step) => isCutawayStep(s);
/** Her own moment at home, where `heroAlias` stands in for her. */
export const atHome = (s: Step) => !!s.heroAlias;
/** Behind the scenes of her day, without her (lunch arriving in the kitchen). */
export const isMeanwhile = (s: Step) => isCutaway(s) && !atHome(s);
/** Mrs. Lin is in the picture: in person, or as her stand-in at home. */
export const withHero = (s: Step) => s.heroPresent || atHome(s);
/** The actor who is Mrs. Lin at home (the closing shot finds her there). */
export const homeAlias = steps.find(atHome)?.heroAlias ?? null;

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
  'personal-care': 'Shower',
  farewell: 'Farewell',
  'ride-home': 'Ride home',
  'care-plan': 'Care plan',
  'home-am': 'At home',
  kitchen: 'Kitchen',
  'home-pm': 'Home',
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
/** Mrs. Lin's day: disciplines, and touchpoints and handoffs across her steps. */
export const totals = { disciplines: members.length, ...count(steps) };
/** Her counts before each step index (index i = the steps before step i). */
export const before = steps.reduce<Counts[]>(
  (acc, s, i) => {
    const add = count([s]);
    acc.push({
      touchpoints: acc[i].touchpoints + add.touchpoints,
      handoffs: acc[i].handoffs + add.handoffs,
    });
    return acc;
  },
  [{ touchpoints: 0, handoffs: 0 }],
);
export const isTeamMeeting = (s: Step) =>
  !s.heroPresent && !isCutaway(s) && s.roles.length >= members.length;
/**
 * Scroll-scrubbed clock range per step: hero chapters are clipped on screen
 * around the cutaways next to them (`app/sim/story-timeline.ts`).
 */
export const scrub = scrubWindows(steps);
