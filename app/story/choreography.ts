import type { Step } from './data';

/**
 * Declarative camera direction for every beat of the story.
 *
 * Angles are radians. Azimuth is measured around +y from +z (0 = looking
 * north from the street side, the renderer default iso is ~0.576); elevation
 * is the angle above the ground plane. Zoom is the orthographic zoom
 * (0.9 frames the whole site, ~2-3 a zone, ~5-9 a person).
 */
export type ShotSpec = {
  zoom: number;
  azimuth: number;
  elevation: number;
  /** Weight (0-1) toward the hero when she is within `radius` of the anchor. */
  follow?: number;
  radius?: number;
  /** Explicit world anchor; otherwise the step's room (or zone) centre. */
  anchor?: [number, number, number];
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
};
export const DEFAULT_CHAPTER_SHOT: ShotSpec = {
  zoom: 3.6,
  azimuth: 0.5,
  elevation: 0.64,
  follow: 0.5,
  radius: 8,
  push: 1.06,
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

/** Sim-clock position of a chapter at progress p, honouring recreation stops. */
export const stepTime = (s: Step, p: number) =>
  s.window[0] + (s.window[1] - s.window[0]) * clamp01(p);

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
