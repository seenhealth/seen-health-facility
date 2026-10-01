/**
 * The scroll story's timeline: which stretch of the care-day clock each
 * chapter of "A day at Seen Health" plays. Pure (no three.js, no JSON), so the
 * story (`app/story/data.ts`, the director), `scripts/build-scenario.mjs` and
 * the unit tests share one definition.
 *
 * Cutaway steps (`settingId` set, `placement.mode: 'cutaway'`) look in on the
 * care network around the center for a few loop seconds. The hero chapters on
 * either side give those seconds up on screen only: their scenario windows,
 * and so the compiled tracks, never change.
 */
export type TimedStep = {
  window: readonly [number, number];
  settingId?: string;
};
export type ScrubWindow = [number, number];

/** True for a cutaway step (a moment across the care network, not with the hero). */
export const isCutawayStep = (s: Pick<TimedStep, 'settingId'>) => !!s.settingId;

/**
 * Scrub window per step, in scenario order: a cutaway keeps its window; a
 * hero step is clipped by the cutaways next to it, so consecutive scrub
 * windows meet end to start.
 */
export function scrubWindows(steps: readonly TimedStep[]): ScrubWindow[] {
  return steps.map((s, i) => {
    if (isCutawayStep(s)) return [s.window[0], s.window[1]];
    const prev = steps[i - 1],
      next = steps[i + 1];
    return [
      prev && isCutawayStep(prev)
        ? Math.max(s.window[0], prev.window[1])
        : s.window[0],
      next && isCutawayStep(next)
        ? Math.min(s.window[1], next.window[0])
        : s.window[1],
    ];
  });
}

/**
 * INTEGRATION POINT: the Wongs' morning at home (`network-home-am`).
 *
 * At e99b1bc the featured interaction `home-personal-care` runs 52–71 s on
 * the porch, so the cutaway sits at `now`: the pharmacy plays 26–50 s, the
 * home 50–58 s, and the pickup chapter opens at 58 s with Van A already
 * docked. When the home instance re-times personal care indoors to ≈ 30–72 s
 * (SPEC-facility-instance §11), set the two steps in
 * `app/data/scenarios/day-in-the-life.json` to `target` (windows and the
 * kicker time) and run `npm run build:scenario`; the pickup chapter then opens
 * on Van A docking at 42 s. `node scripts/build-scenario.mjs --check` prints a
 * READY notice as soon as the composed source covers the target window. Both
 * placements keep every hero focus time, stop and kicker inside its scrub
 * window.
 */
export const HOME_AM_RETIME = {
  stepId: 'network-home-am',
  interactionId: 'home-personal-care',
  /** The cutaway just before it; its window ends where the home's begins. */
  previousStepId: 'network-pharmacy',
  now: {
    window: [50, 58],
    previousWindow: [26, 50],
    kicker: '8:35 AM',
  },
  target: {
    window: [34, 42],
    previousWindow: [26, 34],
    kicker: '8:25 AM',
  },
} as const;
