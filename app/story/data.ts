import scenario from '../data/scenarios/day-in-the-life.json';
import careTeam from '../data/care-team.json';

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

/** Compact UI labels for the day-flow strip, rail and swimlane headers. */
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
};
export const shortLabel = (s: Step) =>
  SHORT[s.id] || s.kicker.split('·').pop()!.trim();
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

export const totals = {
  disciplines: members.length,
  touchpoints: steps.reduce((n, s) => n + s.roles.length, 0),
  handoffs: steps.reduce((n, s) => n + s.handoffs.length, 0),
};
/** Cumulative counts before each step (index i = everything in steps < i). */
export const before = steps.reduce<{ touchpoints: number; handoffs: number }[]>(
  (acc, s, i) => {
    const prev = acc[i];
    acc.push({
      touchpoints: prev.touchpoints + s.roles.length,
      handoffs: prev.handoffs + s.handoffs.length,
    });
    return acc;
  },
  [{ touchpoints: 0, handoffs: 0 }],
);
export const isTeamMeeting = (s: Step) =>
  !s.heroPresent && s.roles.length >= members.length;
