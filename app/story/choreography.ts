import type { Step } from './data';

/**
 * Declarative camera direction for every beat of the story.
 *
 * World axes: +x east, +z north, y up (metres). Angles are radians. Azimuth
 * is measured around +y from +z: the camera sits at target + (sin a, ·, cos a),
 * so 0 puts it north of the subject looking south, π/2 east of it looking
 * west, and the renderer's default iso (~0.576) sees the north and east
 * faces. Elevation is the angle above the ground plane. Zoom is the
 * orthographic zoom (1 shows 80 m of stage height; 0.9 frames the whole site,
 * ~2-3 a zone, ~5-9 a person).
 */
export type ShotSpec = {
  zoom: number;
  azimuth: number;
  elevation: number;
  /**
   * Weight (0-1) toward the subject when it is within `radius` of the anchor:
   * the hero in her chapters, the first featured interaction in a cutaway.
   */
  follow?: number;
  radius?: number;
  /** Explicit world anchor; otherwise `place`, else the step's room (or zone) centre. */
  anchor?: [number, number, number];
  /**
   * Anchor read from the community layer: the whole care network (its zoom is
   * then `frame().zoom × zoom`), or a care setting by id. For a setting the
   * anchor is the first that exists of: the centre of `room` in the setting's
   * facility instance (once one is stamped), the registry anchor named
   * `anchor` (a place the cast uses, e.g. 'counterBack'), the pad centre
   * (`frame(setting)`). Cutaways default to their own setting's pad.
   */
  place?: 'network' | { setting: string; room?: string; anchor?: string };
  /** Zoom multiplier reached at the end of the beat (slow push-in; below 1 pulls back). */
  push?: number;
  /**
   * `call`: a reveal for a phone call. The beat opens on the caller (the
   * anchor) and, after a short hold, eases the target to the middle of the
   * featured call's two ends while `push` pulls back, so the arc and the
   * place it reaches come into view together.
   */
  reveal?: 'call';
  /** Azimuth drift across the beat. */
  drift?: number;
};

/** Where the building sits in the opening, reveal and finale. */
export const BUILDING: [number, number, number] = [-1, 1.2, 2.5];
/** Arrival kerb, ramp and sliding entrance (west side). */
const ARRIVAL: [number, number, number] = [-18, 0.6, 1.5];

export const OPENING_SHOT: ShotSpec = {
  anchor: BUILDING,
  zoom: 1.05,
  azimuth: 0.2,
  elevation: 0.5,
  push: 1.12,
  drift: 0.42,
};
export const REVEAL_SHOT: ShotSpec = {
  anchor: [-1, 3, 3],
  zoom: 1.12,
  azimuth: 0.62,
  elevation: 0.66,
  push: 1.12,
  drift: 0.28,
};
export const TEAM_SHOT: ShotSpec = {
  anchor: [-1, 1.5, 4],
  zoom: 1.28,
  azimuth: 0.9,
  elevation: 0.78,
  push: 1.08,
  drift: 0.22,
};
export const FINALE_SHOT: ShotSpec = {
  anchor: BUILDING,
  zoom: 0.92,
  azimuth: 0.95,
  elevation: 0.5,
  drift: 0.35,
};
/**
 * The whole care network around the center. Seen from the east, the network
 * is about 115 m across the screen (from the north-east it is about 210 m), so
 * every pad fits between the card and the team panel.
 */
export const NETWORK_SHOT: ShotSpec = {
  place: 'network',
  zoom: 0.92,
  azimuth: 1.57,
  elevation: 0.86,
  push: 1.06,
  drift: 0.12,
};

/**
 * Per-chapter shots, keyed by scenario step id. Unknown ids fall back to
 * DEFAULT_CHAPTER_SHOT framed on the step's room.
 */
export const CHAPTER_SHOTS: Record<string, ShotSpec> = {
  huddle: { zoom: 4.1, azimuth: 0.62, elevation: 0.72, push: 1.1, drift: 0.12 },
  pickup: {
    anchor: ARRIVAL,
    zoom: 2.7,
    azimuth: -0.72,
    elevation: 0.5,
    follow: 0.75,
    radius: 40,
    push: 1.2,
    drift: 0.18,
  },
  checkin: { zoom: 4.6, azimuth: -0.35, elevation: 0.62, follow: 0.6, radius: 8, push: 1.08 },
  clinic: { zoom: 4.4, azimuth: 0.28, elevation: 0.68, follow: 0.5, radius: 8, push: 1.08 },
  therapy: { zoom: 2.9, azimuth: -0.5, elevation: 0.62, follow: 0.4, radius: 12, push: 1.1, drift: 0.14 },
  program: { zoom: 2.6, azimuth: 0.3, elevation: 0.66, follow: 0.35, radius: 12, push: 1.08, drift: 0.12 },
  lunch: { zoom: 4.2, azimuth: 0.62, elevation: 0.66, follow: 0.5, radius: 7, push: 1.08 },
  'social-work': { zoom: 5.2, azimuth: 0.85, elevation: 0.72, follow: 0.5, radius: 6, push: 1.08 },
  recreation: { zoom: 4.6, azimuth: -0.3, elevation: 0.95, follow: 0.55, radius: 8, push: 1.05 },
  'personal-care': { zoom: 5.2, azimuth: 0.5, elevation: 0.92, follow: 0.5, radius: 6, push: 1.08 },
  farewell: { zoom: 4.6, azimuth: -0.45, elevation: 0.6, follow: 0.6, radius: 8, push: 1.06 },
  'ride-home': {
    anchor: ARRIVAL,
    zoom: 2.6,
    azimuth: -0.95,
    elevation: 0.48,
    follow: 0.7,
    radius: 40,
    push: 0.82,
    drift: -0.2,
  },
  'care-plan': { zoom: 3.3, azimuth: 1.05, elevation: 0.74, push: 1.12, drift: 0.16 },
  // Cutaways: Mrs. Lin at home (she lives west of the west street, her
  // front facing east, so the camera looks in from the east, azimuth ≈ 1)
  // and lunch arriving in the kitchen. Home shots anchor through the
  // community layer (`place`), so they survive the pad moving; the stamped
  // house is cut away at 1.2 m and its shots look down into the rooms, wide
  // enough to hold the porch and the van at the drive's apex.
  'home-am': {
    place: { setting: 'home-lin', anchor: 'porch' },
    zoom: 3.3,
    azimuth: 1.1,
    elevation: 0.78,
    follow: 0.55,
    radius: 14,
    push: 1.1,
    drift: 0.12,
  },
  // The hand-over at the kitchen's delivery door (trolley, then the island).
  kitchen: {
    anchor: [10.2, 0.8, 2.4],
    zoom: 6.2,
    azimuth: 0.55,
    elevation: 0.85,
    follow: 0.4,
    radius: 4,
    push: 1.1,
    drift: 0.1,
  },
  'home-pm': {
    place: { setting: 'home-lin', anchor: 'porch' },
    zoom: 3.3,
    azimuth: 0.95,
    elevation: 0.8,
    follow: 0.55,
    radius: 14,
    push: 1.12,
    drift: -0.12,
  },
};
export const DEFAULT_CHAPTER_SHOT: ShotSpec = {
  zoom: 3.6,
  azimuth: 0.5,
  elevation: 0.64,
  follow: 0.5,
  radius: 8,
  push: 1.06,
};
/** Cutaways at a care setting without an entry in CHAPTER_SHOTS: the setting's pad. */
export const DEFAULT_CUTAWAY_SHOT: ShotSpec = {
  zoom: 2.4,
  azimuth: 0.55,
  elevation: 0.66,
  follow: 0.35,
  radius: 14,
  push: 1.05,
};

/**
 * The closing highlights, keyed by highlight id: one quick look per service,
 * each anchored where its featured people are and pushing in hard, so every
 * cut lands on a scene already in motion. Fronts face east (homes, pharmacy:
 * azimuth ≈ 1.1-1.3) or north (clinic, partner, hospital: ≈ 0-0.5).
 */
export const HIGHLIGHT_SHOTS: Record<string, ShotSpec> = {
  medication: {
    place: { setting: 'pharmacy', anchor: 'counterBack' },
    zoom: 3.4,
    azimuth: 1.24,
    elevation: 0.52,
    follow: 0.3,
    radius: 8,
    push: 1.16,
    drift: 0.16,
  },
  'day-center': {
    place: { setting: 'partner-adc' },
    zoom: 2.4,
    azimuth: 0.42,
    elevation: 0.86,
    follow: 0.5,
    radius: 16,
    push: 1.18,
    drift: 0.14,
  },
  specialists: {
    place: { setting: 'specialist', anchor: 'examSeat' },
    zoom: 4.2,
    azimuth: 0.2,
    elevation: 0.44,
    follow: 0.3,
    radius: 8,
    push: 1.16,
    drift: -0.12,
  },
  // The clinic's open front sits under its upper storey: keep elevation at
  // or below ≈0.55, and the azimuth low enough that the optometrist (≤0.45)
  // and the X-ray shield wall (≤0.35) don't hide the patient.
  optometry: {
    place: { setting: 'specialist', anchor: 'optoSeat' },
    zoom: 6.4,
    azimuth: 0.3,
    elevation: 0.5,
    follow: 0.3,
    radius: 6,
    push: 1.16,
    drift: 0.08,
  },
  imaging: {
    place: { setting: 'specialist', anchor: 'imagingTable' },
    zoom: 6.2,
    azimuth: 0.26,
    elevation: 0.5,
    follow: 0.3,
    radius: 6,
    push: 1.16,
    drift: -0.08,
  },
  // On the hospital's discharge nurse at her phone spot, then back and over
  // to the middle of the call: the arc to Seen's nurse at the center.
  discharge: {
    place: { setting: 'hospital', anchor: 'rnPhone' },
    zoom: 3.6,
    azimuth: 0.55,
    elevation: 0.6,
    follow: 0.3,
    radius: 8,
    push: 0.27,
    drift: 0.08,
    reveal: 'call',
  },
  'home-mods': {
    place: { setting: 'home-wong', room: 'home-bath', anchor: 'door' },
    zoom: 5.0,
    azimuth: 1.0,
    elevation: 0.98,
    follow: 0.4,
    radius: 6,
    push: 1.12,
    drift: 0.12,
  },
  // The ambulance crew's handoff at the ED, then the hospitalist's call to
  // Seen's on-call nurse rising off the sidewalk.
  'after-hours': {
    place: { setting: 'hospital', anchor: 'edPhone' },
    zoom: 4.2,
    azimuth: 0.55,
    elevation: 0.56,
    follow: 0.35,
    radius: 10,
    push: 1.12,
    drift: -0.12,
  },
  // Mrs. Wong at the foot of her bed on her pendant, then back and over to
  // the middle of the call: the arc to the nurse line at the center.
  pers: {
    place: { setting: 'home-wong', room: 'home-primary', anchor: 'door' },
    zoom: 5.4,
    azimuth: 0.62,
    elevation: 0.66,
    follow: 0.4,
    radius: 7,
    push: 0.17,
    drift: 0.08,
    reveal: 'call',
  },
};
/** Highlights without an entry in HIGHLIGHT_SHOTS: their setting's pad. */
export const DEFAULT_HIGHLIGHT_SHOT: ShotSpec = {
  zoom: 2.8,
  azimuth: 0.55,
  elevation: 0.62,
  follow: 0.35,
  radius: 12,
  push: 1.14,
  drift: 0.12,
};
/**
 * Peace of mind: Mrs. Lin and her daughter at home at four, a slow, high
 * push into the living room. The call to action holds its end state.
 */
export const PEACE_SHOT: ShotSpec = {
  place: { setting: 'home-lin', room: 'home-living', anchor: 'porch' },
  zoom: 3.2,
  azimuth: 0.98,
  elevation: 0.9,
  push: 1.28,
  drift: 0.22,
};
/**
 * Where the camera lands after a cut, relative to the beat's shot: a touch
 * wider and turned, so the critically damped spring carries it into the
 * framing (each cut arrives in motion instead of on a dead frame).
 */
export const CUT_SETTLE = { zoom: 0.9, azimuth: -0.09, elevation: 0.04 };

export type Shot = {
  target: [number, number, number];
  zoom: number;
  azimuth: number;
  elevation: number;
};

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
};
/** Cubic ease-in-out, used for scrubbed transitions. */
export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const TAU = Math.PI * 2;
/** Nearest equivalent of `angle` to `reference` (shortest rotation). */
export const unwrap = (angle: number, reference: number) =>
  angle + Math.round((reference - angle) / TAU) * TAU;

export function mixShots(a: Shot, b: Shot, t: number): Shot {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const az = unwrap(b.azimuth, a.azimuth);
  return {
    target: [
      a.target[0] + (b.target[0] - a.target[0]) * t,
      a.target[1] + (b.target[1] - a.target[1]) * t,
      a.target[2] + (b.target[2] - a.target[2]) * t,
    ],
    // Zoom interpolates geometrically so scale changes feel even.
    zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t),
    azimuth: a.azimuth + (az - a.azimuth) * t,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
  };
}

/** Sim-clock position at progress p through a chapter's scrub window (`data.scrub`). */
export const scrubTime = (w: readonly [number, number], p: number) =>
  w[0] + (w[1] - w[0]) * clamp01(p);

/** Room shown for a step at a given sim time (follows `stops` when present). */
export function stepRoom(s: Step, time: number): string | null {
  if (!s.stops?.length) return s.roomId;
  let room = s.stops[0].roomId;
  for (const stop of s.stops) if (time >= stop.window[0] - 3) room = stop.roomId;
  return room;
}

/**
 * Anchor blend weights across stops: returns [roomId, weight] pairs so the
 * camera glides between stop rooms during the gap between their windows.
 */
export function stopBlend(s: Step, time: number): [string, number][] {
  const stops = s.stops;
  if (!stops?.length) return s.roomId ? [[s.roomId, 1]] : [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i],
      b = stops[i + 1];
    if (time < a.window[1]) return [[a.roomId, 1]];
    if (time < b.window[0]) {
      const t = easeInOut(clamp01((time - a.window[1]) / (b.window[0] - a.window[1] || 1)));
      return [
        [a.roomId, 1 - t],
        [b.roomId, t],
      ];
    }
  }
  return [[stops.at(-1)!.roomId, 1]];
}
