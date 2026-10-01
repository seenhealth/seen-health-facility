/**
 * Build-time support for facility instances on community pads
 * (scripts/build-community-tracks.mjs): the navigation view of an instance,
 * the generated footprint/room summary that sizes its pad, and the checks of
 * the stamped building against its pad. Never imported by the app at
 * runtime: the generated JSON is.
 */
import {
  derivePad,
  isPaved,
  LABEL_PLATE,
  toLocal,
  toWorld,
  type CareFacility,
  type CareSetting,
  type InstanceSummary,
} from '../model/community-settings';
import {
  instanceSelection,
  labelledRooms,
} from '../model/facility-instance';
import { insidePolygon, transformPolygon } from '../model/frame';
import { roomLabelAnchor } from '../model/room-labels';
import type { Facility, Vec2 } from '../model/schema';
import type { NavOptions } from './nav';

const r2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
};
const pt2 = (p: Vec2): Vec2 => [r2(p[0]), r2(p[1])];

/**
 * Navigation options for an instance level: only the registry's exclusions,
 * no day-program stations or display, vertical circulation blocked. Passed
 * explicitly, because `navGrid`'s defaults are Alhambra's day program.
 */
export function instanceNavOptions(
  cfg: CareFacility,
  levelId: string,
): NavOptions {
  return {
    levelId,
    removedObjectIds: cfg.excludeObjectIds ?? [],
    reservations: [],
    excludeZoneIds: cfg.excludeZoneIds ?? [],
    blockVerticalCirculation: true,
  };
}

/**
 * The facility as the instance draws it: drawn levels and zones with their
 * rooms, walls and floor openings, and the drawn objects with `layer`
 * defaulted to `furniture` (as validate-community.mjs normalises them, so
 * `roomPlacement` sees every object). Navigation grids, seat poses and
 * furniture checks all read this view.
 */
export function instanceView(facility: Facility, cfg: CareFacility): Facility {
  const sel = instanceSelection(facility, cfg),
    ids = new Set(sel.objects.map((o) => o.id));
  return {
    ...facility,
    zones: sel.zones,
    rooms: sel.rooms,
    walls: sel.walls,
    floorOpenings: sel.openings,
    objects: sel.objects.map((o) => ({ ...o, layer: o.layer ?? 'furniture' })),
    verticalConnections: (facility.verticalConnections || []).filter((c) =>
      ids.has(c.objectId),
    ),
  };
}

/**
 * The generated summary of a setting's instance, in the setting's local
 * frame (2 dp): the drawn zones' polygons (footprint) and rooms with their
 * label anchors and registry display names, plus the inputs it came from.
 */
export function instanceSummary(
  facility: Facility,
  cfg: CareFacility,
  castSha1: string | null,
): InstanceSummary {
  const sel = instanceSelection(facility, cfg),
    labels = new Map(
      labelledRooms(sel.rooms, cfg.labels).map(([r, name]) => [r.id, name]),
    );
  return {
    facilityId: facility.id,
    revision: facility.revision,
    floorY: cfg.floorY ?? 0,
    inputs: {
      frame: cfg.frame,
      levelIds: sel.levelIds,
      excludeZoneIds: cfg.excludeZoneIds ?? [],
      excludeObjectIds: cfg.excludeObjectIds ?? [],
      castSha1,
    },
    footprint: sel.zones.map((z) =>
      transformPolygon(cfg.frame, z.polygon).map(pt2),
    ),
    rooms: sel.rooms
      .filter((r) => r.kind !== 'shell')
      .map((r) => ({
        id: r.id,
        name: r.name,
        ...(labels.has(r.id) ? { label: labels.get(r.id) } : {}),
        zoneId: r.zoneId,
        anchor: pt2(toWorld(cfg.frame, roomLabelAnchor(r))),
        polygon: transformPolygon(cfg.frame, r.polygon).map(pt2),
      })),
  };
}

/** Distance (m, 5 cm steps up to `max`) from a world point to the setting's paving. */
function pavingClearance(s: CareSetting, p: Vec2, max: number) {
  for (let r = 0; r <= max + 1e-9; r += 0.05)
    for (let k = 0; k < (r ? 24 : 1); k++) {
      const a = (k / 24) * Math.PI * 2;
      if (isPaved(s, [p[0] + Math.sin(a) * r, p[1] + Math.cos(a) * r]))
        return r;
    }
  return Infinity;
}
/** Points every `step` m along a polygon's edges. */
function edgeSamples(poly: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length],
      n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  });
  return out;
}
/** Shortest distance from a point to a set of polygons' edges. */
function edgeDistance(p: Vec2, polys: Vec2[][]) {
  let d = Infinity;
  for (const poly of polys)
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        t = Math.max(
          0,
          Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)),
        );
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
    });
  return d;
}
export type SiteReport = {
  pad: CareSetting['pad'];
  /** Footprint to the drive band, stub legs and apron (m). */
  pavingClearance: number;
  /** Footprint + margin to the pad edges (m; ≥ 0). */
  padSlack: { side: number; front: number; back: number };
  /** Grounds anchors to the footprint (m, negative inside). */
  grounds: Record<string, number>;
};
/**
 * The stamped building against its pad (setting-local summary, world checks):
 * footprint + margin inside the derived pad, at least 1 m from the drive band,
 * stub legs and apron (edges sampled every 0.1 m), the pad's label plate and
 * every `grounds` anchor outside the footprint. Throws on the first failure.
 */
export function checkInstanceSite(
  s: CareSetting,
  summary: InstanceSummary,
): SiteReport {
  const cfg = s.facility!,
    margin = cfg.margin ?? 1.6,
    pad = derivePad(s, summary),
    pts = summary.footprint.flat(),
    world = summary.footprint.map((poly) => poly.map((p) => toWorld(s, p)));
  const padSlack = {
    side: pad.w / 2 - margin - Math.max(...pts.map((p) => Math.abs(p[0]))),
    front: pad.d / 2 - margin - Math.max(...pts.map((p) => p[1])),
    back: Math.min(...pts.map((p) => p[1])) - margin + pad.d / 2 + (pad.back ?? 0),
  };
  for (const [edge, slack] of Object.entries(padSlack))
    if (slack < -1e-6)
      throw new Error(
        `${s.id}: footprint + ${margin} m margin passes the pad's ${edge} edge by ${(-slack).toFixed(2)} m`,
      );
  let paving = Infinity;
  for (const poly of world)
    for (const p of edgeSamples(poly, 0.1)) {
      const d = pavingClearance(s, p, 3);
      if (d < paving) paving = d;
      if (d < 1)
        throw new Error(
          `${s.id}: the building edge at local (${toLocal(s, p).map((v) => v.toFixed(2)).join(', ')}) is ${d.toFixed(2)} m from the drive or apron (needs 1 m)`,
        );
    }
  const inside = (p: Vec2) => world.some((poly) => insidePolygon(p, poly));
  const [lx, lz] = s.anchors.label;
  for (let i = 0; i <= 28; i++)
    for (let j = 0; j <= 6; j++) {
      const p: Vec2 = [
        lx - LABEL_PLATE.w / 2 + (LABEL_PLATE.w * i) / 28,
        lz - LABEL_PLATE.d / 2 + (LABEL_PLATE.d * j) / 6,
      ];
      if (inside(p))
        throw new Error(`${s.id}: the label plate overlaps the building`);
    }
  const grounds: Record<string, number> = {};
  for (const name of cfg.grounds ?? []) {
    const a = s.anchors[name];
    if (!a) throw new Error(`${s.id}: grounds anchor ${name} is not defined`);
    const d = (inside(a) ? -1 : 1) * edgeDistance(a, world);
    grounds[name] = r2(d);
    if (d < 1)
      throw new Error(
        `${s.id}: ${name} is ${d.toFixed(2)} m from the building (needs 1 m outside)`,
      );
  }
  return {
    pad,
    pavingClearance: r2(paving),
    padSlack: {
      side: r2(padSlack.side),
      front: r2(padSlack.front),
      back: r2(padSlack.back),
    },
    grounds,
  };
}
