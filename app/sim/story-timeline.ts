/**
 * The scroll story's timeline: which stretch of the care-day clock each
 * chapter of "A day at Seen Health" plays. Pure (no three.js, no JSON), so the
 * story (`app/story/data.ts`, the director), `scripts/build-scenario.mjs` and
 * the unit tests share one definition.
 *
 * Cutaway steps (`placement.mode: 'cutaway'`, or a `settingId`) compile no
 * hero tracks: they look in on interactions that already exist in the care
 * day, at a care setting (Mrs. Lin at home with her daughter, through the
 * stand-in actor `heroAlias`) or in a room of the center (lunch arriving in
 * the kitchen). Each keeps its own window; the hero chapters on either side
 * give those seconds up on screen only, so their scenario windows, and the
 * compiled tracks, never change.
 */
export type TimedStep = {
  window: readonly [number, number];
  settingId?: string;
  placement?: { mode?: string };
};
export type ScrubWindow = [number, number];

/** True for a cutaway step (it features existing interactions instead of compiling hero tracks). */
export const isCutawayStep = (s: Pick<TimedStep, 'settingId' | 'placement'>) =>
  !!s.settingId || s.placement?.mode === 'cutaway';

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
 * One moment of the story's closing highlights: a service Seen coordinates
 * beyond the center, shown on its own clock (not part of Mrs. Lin's day).
 * The beat scrubs `window` and features `interactionIds` at `settingId`.
 */
export type StoryHighlight = {
  id: string;
  /** Short service name ("Medication", "Optometry"). */
  label: string;
  title: string;
  kicker: string;
  body: string;
  settingId: string;
  interactionIds: string[];
  window: [number, number];
  roles: string[];
  partners?: string[];
};
