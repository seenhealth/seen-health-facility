import type { ActivityData } from './activity';
import type { CharacterRole } from './characters';

/**
 * An add-on to a care-day source: more people, interactions, filter views and
 * roles on the same 720 s clock. Distributed-care settings, partner sites and
 * scripted scenarios are all expressed this way, so the engine, the Measure
 * panel and the story consume one composed `ActivityData`.
 */
export type SourceExtension = Partial<
  Pick<ActivityData, 'actors' | 'interactions' | 'roles' | 'views' | 'evidence'>
> & {
  id: string;
  description?: string;
};

/** Base loop plus extensions; actor and interaction ids must stay unique. */
export function composeSources(
  base: ActivityData,
  ...parts: SourceExtension[]
): ActivityData {
  const actors = [...base.actors],
    interactions = [...base.interactions],
    views = [...(base.views || [])],
    evidence = [...base.evidence],
    roles = new Set<CharacterRole>(base.roles),
    actorIds = new Set(actors.map((a) => a.id)),
    interactionIds = new Set(interactions.map((i) => i.id)),
    viewIds = new Set(views.map((v) => v.id)),
    descriptions = [base.description];
  for (const part of parts) {
    for (const a of part.actors || []) {
      if (actorIds.has(a.id))
        throw new Error(`${part.id}: duplicate actor id ${a.id}`);
      if (a.segments[0]?.start !== 0 || a.segments.at(-1)?.end !== base.duration)
        throw new Error(
          `${part.id}: ${a.id} must cover 0–${base.duration} s of the care-day clock`,
        );
      actorIds.add(a.id);
      actors.push(a);
      roles.add(a.role);
    }
    for (const i of part.interactions || []) {
      if (interactionIds.has(i.id))
        throw new Error(`${part.id}: duplicate interaction id ${i.id}`);
      for (const id of i.actorIds)
        if (!actorIds.has(id))
          throw new Error(`${part.id}: interaction ${i.id} names unknown actor ${id}`);
      interactionIds.add(i.id);
      interactions.push(i);
    }
    for (const v of part.views || [])
      if (!viewIds.has(v.id)) {
        viewIds.add(v.id);
        views.push(v);
      }
    for (const r of part.roles || []) roles.add(r);
    evidence.push(...(part.evidence || []));
    if (part.description) descriptions.push(part.description);
  }
  return {
    ...base,
    actors,
    interactions,
    views: views.length ? views : base.views,
    evidence,
    roles: [...roles].sort() as CharacterRole[],
    description: descriptions.join(' '),
  };
}
