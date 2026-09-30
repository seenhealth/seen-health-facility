/**
 * The day-in-the-life activity source for the story: the base care-day loop
 * with the precompiled hero, companions and IDT meetings merged in.
 *
 * No navigation work happens here; tracks come from
 * `app/data/scenarios/day-in-the-life.tracks.json`, produced by
 * `npm run build:scenario`. The merge is memoised, so every caller shares one
 * ActivitySource object (and the activity engine's per-segment caches).
 */
import { activityData, type ActivitySource } from '../model/activity';
import compiled from '../data/scenarios/day-in-the-life.tracks.json';
import { mergeTracks, type CompiledStep, type CompiledTracks } from './tracks';

export const storyTracks = compiled as unknown as CompiledTracks;
let memo: { source: ActivitySource; heroId: string } | null = null;
/** Base loop + hero itinerary on the shared 720 s clock. */
export function storyActivitySource(): { source: ActivitySource; heroId: string } {
  if (!memo)
    memo = {
      source: mergeTracks(activityData, storyTracks),
      heroId: storyTracks.heroId,
    };
  return memo;
}
/** Compiled steps: hero stops, arrive/depart times, focus times and companions. */
export function storySteps(): CompiledStep[] {
  return storyTracks.steps;
}
/** One compiled step by scenario step id. */
export function storyStep(id: string): CompiledStep | undefined {
  return storyTracks.steps.find((s) => s.id === id);
}
