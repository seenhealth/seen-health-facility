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
  /** Zoom multiplier reached at the end of the beat (slow push-in). */
  push?: number;
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
  // Cutaways: anchored where the featured people are (an instance room, or a
  // registry anchor, so a pad that moves or turns keeps its framing) and
  // leaning toward the first featured interaction. Fronts face east (home,
  // pharmacy: seen from azimuth ≈ 1.1-1.3) or north (clinic, partner,
  // hospital: ≈ 0-0.5). Elevations stay low enough to see under the clinic's
  // upper storey, the pharmacy's roof and the hospital bay's roof; the
  // stamped home and partner center are cut away at 1.2 m, so their shots
  // look down into the rooms.
  'network-pharmacy': {
    place: { setting: 'pharmacy', anchor: 'counterBack' },
    zoom: 2.9,
    azimuth: 1.3,
    elevation: 0.5,
    follow: 0.3,
    radius: 8,
    push: 1.05,
  },
  'network-home-am': {
    place: { setting: 'home-lin', room: 'home-kitchen', anchor: 'door' },
    zoom: 4.6,
    azimuth: 1.12,
    elevation: 0.86,
    follow: 0.4,
    radius: 6,
    push: 1.05,
  },
  'network-specialist': {
    place: { setting: 'specialist', anchor: 'examSeat' },
    zoom: 3.0,
    azimuth: 0.22,
    elevation: 0.42,
    follow: 0.3,
    radius: 8,
    push: 1.05,
  },
  'network-partner': {
    place: { setting: 'partner-adc', room: 'rehab-open', anchor: 'ptStand' },
    zoom: 2.8,
    azimuth: 0.5,
    elevation: 0.64,
    follow: 0.4,
    radius: 10,
    push: 1.05,
    drift: 0.08,
  },
  'network-hospital': {
    place: { setting: 'hospital', anchor: 'huddleA' },
    zoom: 2.6,
    azimuth: 0.08,
    elevation: 0.5,
    follow: 0.3,
    radius: 8,
    push: 1.05,
  },
  'network-home-pm': {
    place: { setting: 'home-lin', room: 'home-living', anchor: 'door' },
    zoom: 5,
    azimuth: 0.85,
    elevation: 1,
    follow: 0.4,
    radius: 6,
    push: 1.04,
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
/** Cutaways without an entry in CHAPTER_SHOTS: their own setting's pad. */
export const DEFAULT_CUTAWAY_SHOT: ShotSpec = {
  zoom: 2.4,
  azimuth: 0.55,
  elevation: 0.66,
  follow: 0.35,
  radius: 14,
  push: 1.05,
};

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
