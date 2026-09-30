import { activityData, type ActivitySource } from '../model/activity';

/**
 * Activity tracks for the story and the id of the actor the camera follows.
 *
 * Placeholder adapter: until the dedicated hero itinerary from
 * `app/sim/story-source.ts` is integrated, the story follows the existing
 * cane participant who arrives in Van A. Swap this module for
 * `export { storyActivitySource } from '../sim/story-source';` — the story
 * only relies on this signature and follows `heroId` generically, falling
 * back to each step's room when the hero is elsewhere.
 */
export function storyActivitySource(): {
  source: ActivitySource;
  heroId: string;
} {
  return { source: activityData, heroId: 'arrival-cane' };
}
