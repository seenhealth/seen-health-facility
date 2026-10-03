/**
 * Compiled scenario tracks: the shapes written by `npm run build:scenario` and
 * the merge into a base loop. Runtime-light (no navigation or compiler code),
 * so the story can load precompiled tracks cheaply.
 */
import type { ActivitySource, ActorSpec, Interaction } from '../model/activity';
import type { Action, CharacterRole } from '../model/characters';
import type { Vec2 } from '../model/schema';

type Window = [number, number];
export type CompiledStop = {
  id: string;
  stepId: string;
  title: string;
  window: Window;
  roomId: string | null;
  zoneId: string;
  anchor: Vec2;
  heading: number;
  action: Action;
  seated: boolean;
  /** When the hero reaches the anchor and when she leaves it. */
  arrive: number;
  depart: number;
  /** Seconds of the window during which she is at the anchor. */
  overlap: number;
  /** A good camera time: middle of (dwell ∩ window). */
  focusTime: number;
  companionIds: string[];
  partnerIds: string[];
  interactionId: string;
  /** Walking distance of the leg that ends at this stop (m). */
  legDistance: number;
};
export type CompiledStep = {
  id: string;
  window: Window;
  heroPresent: boolean;
  zoneId: string;
  roomId: string | null;
  /** Suggested camera time inside the window. */
  focusTime: number;
  /** Who the camera should follow at focusTime (hero or an interaction). */
  focusActorId: string;
  stops: CompiledStop[];
  companionIds: string[];
  interactionIds: string[];
  handoffs: { from: string; to: string; note: string }[];
  roles: string[];
  /** Cutaways at a care setting: the setting shown (the compiled hero is not in them). */
  settingId?: string;
  /** Cutaways that are the hero's own moment: the actor standing in for her. */
  heroAlias?: string;
};
export type CompiledTracks = {
  version: 1;
  scenarioId: string;
  heroId: string;
  removedActorIds: string[];
  removedInteractionIds: string[];
  actors: ActorSpec[];
  interactions: Interaction[];
  roles: CharacterRole[];
  steps: CompiledStep[];
  heroSpeed: number;
  notes: string[];
};
/** Base loop minus the replaced actor, with compiled actors and interactions merged in. */
export function mergeTracks(
  base: ActivitySource,
  tracks: Pick<
    CompiledTracks,
    'removedActorIds' | 'removedInteractionIds' | 'actors' | 'interactions' | 'roles'
  >,
): ActivitySource {
  const removed = new Set(tracks.removedActorIds),
    replaced = new Map(tracks.actors.map((a) => [a.id, a] as const));
  const actors = base.actors
    .filter((a) => !removed.has(a.id))
    .map((a) => replaced.get(a.id) || a);
  const known = new Set(actors.map((a) => a.id));
  for (const a of tracks.actors) if (!known.has(a.id)) actors.push(a);
  const droppedInteractions = new Set(tracks.removedInteractionIds),
    newInteractions = new Map(tracks.interactions.map((i) => [i.id, i] as const));
  const interactions = base.interactions
    .filter((i) => !droppedInteractions.has(i.id) && !i.actorIds.some((id) => removed.has(id)))
    .map((i) => newInteractions.get(i.id) || i);
  const seen = new Set(interactions.map((i) => i.id));
  for (const i of tracks.interactions) if (!seen.has(i.id)) interactions.push(i);
  return {
    ...base,
    actors,
    interactions,
    roles: [...new Set([...base.roles, ...tracks.roles])].sort() as CharacterRole[],
    description:
      base.description +
      ' Includes a scripted participant itinerary with companion staff and upstairs IDT meetings.',
  };
}
