import type { ActivityData } from './activity';
import type { CharacterRole } from './characters';

/**
 * An add-on to a care-day source: more people, interactions, filter views,
 * roles and zones beyond the facility model on the same 720 s clock.
 * Distributed-care settings, partner sites and scripted scenarios are all
 * expressed this way; `alhambraSource()` composes them once so the engine,
 * the Measure panel, the trace and the reports consume one `ActivityData`.
 */
export type SourceExtension = Partial<
  Pick<
    ActivityData,
    'actors' | 'interactions' | 'roles' | 'views' | 'evidence' | 'zones'
  >
> & {
  id: string;
  description?: string;
};

/**
 * Base loop plus extensions; actor, interaction and zone ids must stay
 * unique. Each extension's actors are tagged with its id (`sourceId`) so a
 * viewer can show or hide one source's people as a layer.
 */
export function composeSources(
  base: ActivityData,
  ...parts: SourceExtension[]
): ActivityData {
  const actors = [...base.actors],
    interactions = [...base.interactions],
    views = [...(base.views || [])],
    evidence = [...base.evidence],
    zones = [...(base.zones || [])],
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
      actors.push({ ...a, sourceId: part.id });
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
    for (const z of part.zones || []) {
      if (zones.some((y) => y.id === z.id))
        throw new Error(`${part.id}: duplicate zone id ${z.id}`);
      zones.push(z);
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
    zones: zones.length ? zones : base.zones,
    roles: [...roles].sort() as CharacterRole[],
    description: descriptions.join(' '),
  };
}
