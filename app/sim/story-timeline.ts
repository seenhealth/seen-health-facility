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
