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
import { alhambraSource } from '../model/alhambra-source';
import type { Facility } from '../model/schema';
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
/**
 * The story source as the viewer plays it on Alhambra: the hero's loop plus
 * the community layer and the fleet crew (`alhambraSource`). Measure and the
 * reports read this so they trace the same people /story animates.
 */
export function composedStorySource(model: Facility): {
  source: ActivitySource;
  heroId: string;
} {
  const { source, heroId } = storyActivitySource();
  return { source: alhambraSource(model, source), heroId };
}
/** Compiled steps: hero stops, arrive/depart times, focus times and companions. */
export function storySteps(): CompiledStep[] {
  return storyTracks.steps;
}
/** One compiled step by scenario step id. */
export function storyStep(id: string): CompiledStep | undefined {
  return storyTracks.steps.find((s) => s.id === id);
}
