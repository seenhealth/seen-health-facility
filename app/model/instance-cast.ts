import type { ActorSpec, Interaction, Segment } from './activity';
import {
  groundYAt,
  settingZone,
  toWorld,
  type CareSetting,
} from './community-settings';
import type { Vec2 } from './schema';

/**
 * People inside a facility instance: the generated cast of a setting
 * (app/data/community-casts.json, written by `npm run build:community` from
 * app/data/community/<setting>.cast.json) turned into ordinary community
 * actors. Pure, no three.js.
 *
 * The generated tracks are in the setting's local frame without heights or
 * zones; placement moves them into the world with the setting, gives every
 * point the ground height under it (the instance floor inside the footprint,
 * the pad or its paving outside, `groundYAt`), puts everyone on the `site`
 * level in the setting's zone and does the same for interactions.
 */
export type InstanceSegment = Omit<Segment, 'zoneId' | 'heights'> & {
  /** A scheduled stop's point seat (the bed, sofa or toilet sat on), for the furniture check; dropped at placement. */
  seatId?: string;
};
export type InstanceActor = Omit<
  ActorSpec,
  'levelId' | 'segments' | 'sourceId'
> & {
  segments: InstanceSegment[];
};
/**
 * A window in which a scheduled person is not on the instance (before
 * arriving, while away, after leaving). The generated track holds one hidden
 * placeholder segment over it, at the arrive or leave anchor; community-
 * people.ts may replace it with hand-authored legs (`fillHoles`) that start
 * at `from` at `start` and end at `to` at `end` (the same door or porch
 * point for an away window), so the composed day stays contiguous. A leg
 * before arriving may start anywhere (the day starts there), one after
 * leaving may end anywhere.
 */
export type InstanceHole = {
  kind: 'before' | 'away' | 'after';
  start: number;
  end: number;
  from: Vec2;
  to: Vec2;
};
export type InstanceCast = {
  actors: InstanceActor[];
  interactions: Omit<Interaction, 'zoneId'>[];
  /** Holes of scheduled people, by actor id. */
  holes: Record<string, InstanceHole[]>;
  /** Generator notes (walks moved, holds shortened). */
  notes: string[];
};
export type InstanceCasts = {
  version: 1;
  casts: Record<string, InstanceCast>;
};

/** A setting's generated cast as world actors and interactions (holes in world coordinates). */
export function placeInstanceCast(
  setting: CareSetting,
  cast: InstanceCast,
): {
  actors: ActorSpec[];
  interactions: Interaction[];
  holes: Record<string, InstanceHole[]>;
} {
  const zoneId = settingZone(setting.id),
    world = (p: Vec2) => toWorld(setting, p);
  return {
    actors: cast.actors.map((a) => ({
      ...a,
      levelId: 'site',
      segments: a.segments.map(({ seatId: _seat, ...s }) => {
        const path = s.path.map(world);
        return {
          ...s,
          path,
          heading: s.heading + setting.heading,
          zoneId,
          heights: path.map(groundYAt),
        };
      }),
    })),
    interactions: cast.interactions.map((i) => ({ ...i, zoneId })),
    holes: Object.fromEntries(
      Object.entries(cast.holes).map(([id, holes]) => [
        id,
        holes.map((h) => ({ ...h, from: world(h.from), to: world(h.to) })),
      ]),
    ),
  };
}

const near = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
/**
 * Replace a placed actor's hole placeholders with hand-authored segments
 * (e.g. a `Track` started at `hole.start` and closed with
 * `segmentsTo(hole.end)`). A leg covers its hole exactly, starting at the
 * hole's `from` point (except before arriving) and ending at its `to` point
 * (except after leaving); holes for which `legs` returns nothing stay hidden.
 */
export function fillHoles(
  actor: ActorSpec,
  holes: InstanceHole[],
  legs: (hole: InstanceHole) => Segment[] | undefined,
): ActorSpec {
  let segments = actor.segments;
  for (const hole of holes) {
    const fill = legs(hole);
    if (!fill?.length) continue;
    const k = segments.findIndex(
      (s) =>
        s.visible === false &&
        Math.abs(s.start - hole.start) < 1e-6 &&
        Math.abs(s.end - hole.end) < 1e-6,
    );
    if (k < 0)
      throw new Error(
        `${actor.id}: no placeholder for the ${hole.kind} hole ${hole.start}–${hole.end} s`,
      );
    const first = fill[0],
      last = fill.at(-1)!;
    if (
      Math.abs(first.start - hole.start) > 1e-6 ||
      Math.abs(last.end - hole.end) > 1e-6
    )
      throw new Error(
        `${actor.id}: the ${hole.kind} leg covers ${first.start}–${last.end} s, not ${hole.start}–${hole.end} s`,
      );
    if (
      (hole.kind !== 'before' && !near(first.path[0], hole.from)) ||
      (hole.kind !== 'after' && !near(last.path.at(-1)!, hole.to))
    )
      throw new Error(
        `${actor.id}: the ${hole.kind} leg must start at (${hole.from.map((v) => v.toFixed(2)).join(', ')}) and end at (${hole.to.map((v) => v.toFixed(2)).join(', ')})`,
      );
    segments = [...segments.slice(0, k), ...fill, ...segments.slice(k + 1)];
  }
  return { ...actor, segments };
}
