/**
 * One clock per game table, shared by the ball (community-assets) and the
 * players (characters). Everything runs on the care-day loop clock (loop
 * seconds; the viewer plays it at 4× wall time by default), so a rally,
 * a pool shot and a karaoke song keep the same tempo for everyone at the
 * table and the ball is where the paddle or cue is when it is struck.
 *
 * Sides: the player who faces the table's +x direction stands at its −x
 * end and is side A; the other is side B. A hits at phase 0, B at 0.5.
 */

/** Loop seconds for a rally: A hits at 0, B hits at half way. */
export const PING_PONG_PERIOD = 6;
/** Loop seconds for two pool shots: A shoots in the first half, B in the second. */
export const POOL_PERIOD = 12;
/** Loop seconds for two karaoke songs: the lead sings first, then hands the mic over. */
export const KARAOKE_PERIOD = 48;
/** Loop seconds per pedal revolution on a bike or stepper. */
export const CYCLE_PERIOD = 4;

export const wrap01 = (u: number) => ((u % 1) + 1) % 1;
/** Smooth step from a to b. */
export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Eased 0 → 1 → 0 window: rises over [a, b], holds, falls over [c, d]. */
export const window01 = (f: number, a: number, b: number, c: number, d: number) =>
  smoothstep(a, b, f) * (1 - smoothstep(c, d, f));

/** Table-tennis table: 2.74 × 1.525 m, top at `top`; players stand at x ≈ ±2.0. */
export const PING_PONG = {
  /** Where the ball is struck, along x from the table centre. */
  strikeX: 1.32,
  /** Height of the strike above the table top. */
  strikeLift: 0.3,
  /** Where the ball lands on the far side, along x. */
  bounceX: 0.72,
  /** Where the ball rests when nobody plays (table local). */
  rest: [-1.05, 0.035, 0.55] as const,
};

/**
 * Ball position in the table frame for rally phase g (0–1), relative to the
 * table top: struck at −x (phase 0), one bounce on the +x side, struck back
 * at +x (0.5), one bounce on the −x side.
 */
export function pingPongBall(g: number): [number, number, number] {
  const f = wrap01(g);
  const toB = f < 0.5,
    u = (toB ? f : f - 0.5) * 2, // 0–1 along one crossing
    s = toB ? 1 : -1;
  const { strikeX, strikeLift, bounceX } = PING_PONG;
  const r = 0.035;
  let x: number, y: number;
  if (u < 0.68) {
    // Strike to bounce: a shallow arc over the net.
    const t = u / 0.68;
    x = -strikeX + (strikeX + bounceX) * t;
    y = r + (strikeLift - r) * (1 - t) + 0.16 * Math.sin(Math.PI * t);
  } else {
    // Bounce up to the other paddle.
    const t = (u - 0.68) / 0.32;
    x = bounceX + (strikeX - bounceX) * t;
    y = r + (strikeLift - r) * Math.sin((Math.PI / 2) * t);
  }
  // A little cross-court drift.
  const z = 0.14 * Math.sin(Math.PI * u) * s;
  return [x * s, y, z];
}

/** Pool table: 2.45 × 1.4 m; players stand at x ≈ ±1.8. */
export const POOL = {
  /**
   * The cue ball's lane, off the racked balls. A shooter's cue runs about
   * 0.23 m to their right of where they stand, so side A stands at
   * z ≈ lane − 0.23 and side B at z ≈ lane + 0.23 (table frame).
   */
  laneZ: 0.25,
  /** Where the cue ball waits to be struck, from the centre along x. */
  tee: 0.5,
  /** The far cushion face along x. */
  cushion: 1.1,
  /** Phase within a half period when the cue strikes. */
  strike: 0.34,
};

/**
 * Cue-ball x in the table frame for phase g: side A strikes it at g 0.34
 * from −tee, it runs to the +x cushion and rolls back to +tee; B strikes it
 * at 0.84 the other way.
 */
export function poolCueBall(g: number): number {
  const f = wrap01(g);
  const second = f >= 0.5,
    u = second ? f - 0.5 : f,
    s = second ? -1 : 1;
  const { tee, cushion, strike } = POOL;
  if (u < strike) return -tee * s;
  const t = (u - strike) / (0.5 - strike); // 0–1 over the roll
  const out = 0.42; // fraction of the roll spent reaching the cushion
  let x: number;
  if (t < out) {
    const k = t / out;
    x = -tee + (cushion + tee) * (1 - (1 - k) * (1 - k)); // decelerating
  } else {
    const k = (t - out) / (1 - out);
    x = cushion - (cushion - tee) * (1 - (1 - k) * (1 - k) * (1 - k));
  }
  return x * s;
}

/** Karaoke duet windows, in the singer's own phase (lead = loop phase). */
export const KARAOKE = {
  /** Singing with the mic. */
  sing: [0.04, 0.46] as const,
  /** Handing the mic to the partner. */
  handOff: [0.46, 0.54] as const,
  /** Taking the mic back (wraps round 1 → 0). */
  receive: [0.96, 1.04] as const,
};
