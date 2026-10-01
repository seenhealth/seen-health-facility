/**
 * Navigation grid, A* routing and route simplification over the Facility JSON.
 *
 * A TypeScript port of the grid in `scripts/build-activity.py` so itineraries can
 * be compiled in the browser and in Node: 0.2 m cells, 0.21 m wall clearance,
 * 0.19 m furniture clearance, removed day-program objects, reserved activity
 * stations, 8-connected A* without corner cutting and collinear simplification.
 *
 * Pure math over plain arrays; no Three.js. Grids are cached per model + options.
 */
import program from '../data/day-program.json';
import type { Facility, Vec2 } from '../model/schema';

export const NAV_STEP = 0.2;
export const WALL_CLEARANCE = 0.21;
export const FURNITURE_CLEARANCE = 0.19;
/** Route clearances used for accessible arrival routes in build-activity.py. */
export const MOBILITY_CLEARANCE = {
  none: 0.21,
  cane: 0.26,
  walker: 0.33,
  wheelchair: 0.37,
} as const;
export type Mobility = keyof typeof MOBILITY_CLEARANCE;

/** An oriented rectangle, half extents already include furniture clearance. */
export type NavObstacle = {
  id: string;
  x: number;
  z: number;
  hw: number;
  hd: number;
  c: number;
  s: number;
};
export type NavReservation = {
  id: string;
  position: Vec2;
  halfWidth: number;
  halfDepth: number;
};
export type NavOptions = {
  levelId?: string;
  removedObjectIds?: readonly string[];
  /** Areas routes must avoid (activity stations, presentation screens). */
  reservations?: readonly NavReservation[];
  /** Zones that never contain walkable floor. */
  excludeZoneIds?: readonly string[];
  /**
   * Treat stair flights, lift cars and floor openings on this level as
   * obstacles. build-activity.py does not (stairs are `architecture`), so it is
   * off for parity checks and on for newly compiled itineraries.
   */
  blockVerticalCirculation?: boolean;
};
type NavZone = { id: string; polygon: Vec2[] };
type NavWall = { id: string; a: Vec2; b: Vec2; thickness: number };
export type NavGrid = {
  levelId: string;
  step: number;
  ix0: number;
  iz0: number;
  nx: number;
  nz: number;
  zones: NavZone[];
  walls: NavWall[];
  obstacles: NavObstacle[];
  /** Index of the first zone containing the cell centre, or -1. */
  zoneIndex: Int16Array;
  /** Distance to the nearest wall face (m). */
  wallMargin: Float64Array;
  /** Signed distance outside the nearest clearance-inflated furniture box. */
  obstacleExcess: Float64Array;
  buildMs: number;
};

const round3 = (v: number) => Math.round(v * 1000) / 1000;
export const distance = (a: Vec2, b: Vec2) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
export const pathLength = (path: readonly Vec2[]) => {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += distance(path[i - 1], path[i]);
  return n;
};
export function insidePolygon(p: Vec2, poly: readonly Vec2[]) {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      odd = !odd;
  }
  return odd;
}
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/**
 * Day-program defaults: cleared furniture and the open-floor class area (its
 * layouts and the mobile board move within it). `parity: true` keeps stairs
 * walkable, as build-activity.py did.
 */
export function dayProgramNavOptions(parity = false): NavOptions {
  const [[x0, z0], [x1, z1]] = program.floor.area;
  // A lane from the west aisle stays open to the class's reserved story slot.
  const [hx, hz] = Object.values(program.floor.formations)
    .flatMap((f) => f.slots)
    .find((s) => 'reserved' in s && s.reserved === 'hero')!.at;
  const box = (id: string, ax: number, az: number, bx: number, bz: number) => ({
    id: 'day-program-floor-' + id,
    position: [(ax + bx) / 2, (az + bz) / 2] as Vec2,
    halfWidth: (bx - ax) / 2,
    halfDepth: (bz - az) / 2,
  });
  return {
    levelId: 'ground',
    blockVerticalCirculation: !parity,
    removedObjectIds: program.removedObjectIds,
    reservations: [
      box('front', x0, z0, x1, hz - 0.5),
      box('back', x0, hz + 0.5, x1, z1),
      box('middle', hx + 0.4, hz - 0.5, x1, hz + 0.5),
    ],
    excludeZoneIds: ['adjacent'],
  };
}

export function navObstacles(
  model: Facility,
  levelId: string,
  removed: ReadonlySet<string>,
  reservations: readonly NavReservation[] = [],
): NavObstacle[] {
  const out: NavObstacle[] = [];
  for (const o of model.objects) {
    if (removed.has(o.id) || o.levelId !== levelId) continue;
    if ((o.layer ?? 'furniture') !== 'furniture') continue;
    const a = model.assets[o.assetId];
    if (!a) continue;
    const [w, h, d] = a.dimensions.map((v, i) => v * o.scale[i]);
    if (h < 0.15 || o.position[1] > 1.4) continue;
    const c = Math.cos(o.rotation),
      s = Math.sin(o.rotation);
    for (const [x, z, fw, fd] of o.navigationFootprints || [[0, 0, w, d]])
      out.push({
        id: o.id,
        x: o.position[0] + c * x + s * z,
        z: o.position[2] - s * x + c * z,
        hw: fw / 2 + FURNITURE_CLEARANCE,
        hd: fd / 2 + FURNITURE_CLEARANCE,
        c,
        s,
      });
  }
  for (const r of reservations)
    out.push({
      id: r.id,
      x: r.position[0],
      z: r.position[1],
      hw: r.halfWidth,
      hd: r.halfDepth,
      c: 1,
      s: 0,
    });
  return out;
}
/** Stair flights, lift cars and floor voids on one level, as obstacles. */
export function verticalCirculationObstacles(
  model: Facility,
  levelId: string,
): NavObstacle[] {
  const out: NavObstacle[] = [];
  const ids = new Set(
    (model.verticalConnections || []).map((c) => c.objectId),
  );
  for (const o of model.objects) {
    if (o.levelId !== levelId || !ids.has(o.id)) continue;
    const a = model.assets[o.assetId];
    if (!a) continue;
    const w = a.dimensions[0] * o.scale[0],
      d = a.dimensions[2] * o.scale[2];
    out.push({
      id: o.id,
      x: o.position[0],
      z: o.position[2],
      hw: w / 2 + FURNITURE_CLEARANCE,
      hd: d / 2 + FURNITURE_CLEARANCE,
      c: Math.cos(o.rotation),
      s: Math.sin(o.rotation),
    });
  }
  for (const f of model.floorOpenings || []) {
    if (f.levelId !== levelId) continue;
    const [[x0, z0], [x1, z1]] = f.bounds;
    out.push({
      id: f.id,
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      hw: Math.abs(x1 - x0) / 2 + FURNITURE_CLEARANCE,
      hd: Math.abs(z1 - z0) / 2 + FURNITURE_CLEARANCE,
      c: 1,
      s: 0,
    });
  }
  return out;
}

/** Clearance measures at an arbitrary point (not only cell centres). */
export function measurePoint(
  grid: Pick<NavGrid, 'zones' | 'walls' | 'obstacles'>,
  p: Vec2,
) {
  let zoneIndex = -1;
  for (let i = 0; i < grid.zones.length; i++)
    if (insidePolygon(p, grid.zones[i].polygon)) {
      zoneIndex = i;
      break;
    }
  let wallMargin = Infinity;
  for (const w of grid.walls) {
    const m = distanceToSegment(p, w.a, w.b) - w.thickness / 2;
    if (m < wallMargin) wallMargin = m;
  }
  let obstacleExcess = Infinity;
  for (const o of grid.obstacles) {
    const dx = p[0] - o.x,
      dz = p[1] - o.z;
    const e = Math.max(
      Math.abs(o.c * dx - o.s * dz) - o.hw,
      Math.abs(o.s * dx + o.c * dz) - o.hd,
    );
    if (e < obstacleExcess) obstacleExcess = e;
  }
  return { zoneIndex, wallMargin, obstacleExcess };
}
/** Minimum distance from a point to any wall face on the grid's level. */
export function wallClearanceAt(grid: Pick<NavGrid, 'walls'>, p: Vec2) {
  let m = Infinity;
  for (const w of grid.walls)
    m = Math.min(m, distanceToSegment(p, w.a, w.b) - w.thickness / 2);
  return m;
}
const passes = (
  zoneIndex: number,
  wallMargin: number,
  obstacleExcess: number,
  clearance: number,
) =>
  zoneIndex >= 0 &&
  wallMargin >= clearance &&
  obstacleExcess >= clearance - WALL_CLEARANCE;
/** build-activity.py `clear(p, clearance)` for any point. */
export function isClear(grid: NavGrid, p: Vec2, clearance = WALL_CLEARANCE) {
  const m = measurePoint(grid, p);
  return passes(m.zoneIndex, m.wallMargin, m.obstacleExcess, clearance);
}

const cache = new WeakMap<object, Map<string, NavGrid>>();
/** Build (or reuse) the navigation grid for one level of a facility. */
export function navGrid(
  model: Facility,
  options: NavOptions = dayProgramNavOptions(),
): NavGrid {
  const key = JSON.stringify(options);
  let byKey = cache.get(model);
  if (!byKey) cache.set(model, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const began = Date.now(),
    levelId = options.levelId || 'ground',
    exclude = new Set(options.excludeZoneIds || ['adjacent']);
  const zones: NavZone[] = model.zones
    .filter((z) => z.levelId === levelId && !exclude.has(z.id))
    .map((z) => ({ id: z.id, polygon: z.polygon }));
  const walls: NavWall[] = model.walls
    .filter((w) => w.levelId === levelId)
    .map((w) => ({ id: w.id, a: w.a, b: w.b, thickness: w.thickness }));
  const obstacles = navObstacles(
    model,
    levelId,
    new Set(options.removedObjectIds || []),
    options.reservations || [],
  );
  if (options.blockVerticalCirculation)
    obstacles.push(...verticalCirculationObstacles(model, levelId));
  const xs = zones.flatMap((z) => z.polygon.map((p) => p[0])),
    zs = zones.flatMap((z) => z.polygon.map((p) => p[1]));
  const ix0 = Math.floor(Math.min(...xs) / NAV_STEP) - 1,
    iz0 = Math.floor(Math.min(...zs) / NAV_STEP) - 1,
    nx = Math.ceil(Math.max(...xs) / NAV_STEP) + 2 - ix0,
    nz = Math.ceil(Math.max(...zs) / NAV_STEP) + 2 - iz0;
  const zoneIndex = new Int16Array(nx * nz).fill(-1),
    wallMargin = new Float64Array(nx * nz).fill(-Infinity),
    obstacleExcess = new Float64Array(nx * nz).fill(-Infinity);
  // Zone bounding boxes let most cells skip polygon tests.
  const boxes = zones.map((z) => {
    const px = z.polygon.map((p) => p[0]),
      pz = z.polygon.map((p) => p[1]);
    return [
      Math.min(...px),
      Math.max(...px),
      Math.min(...pz),
      Math.max(...pz),
    ];
  });
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const p: Vec2 = [
        round3((ix0 + i) * NAV_STEP),
        round3((iz0 + j) * NAV_STEP),
      ];
      let zi = -1;
      for (let k = 0; k < zones.length; k++) {
        const b = boxes[k];
        if (p[0] < b[0] || p[0] > b[1] || p[1] < b[2] || p[1] > b[3]) continue;
        if (insidePolygon(p, zones[k].polygon)) {
          zi = k;
          break;
        }
      }
      const idx = i * nz + j;
      zoneIndex[idx] = zi;
      if (zi < 0) continue;
      let wm = Infinity;
      for (const w of walls) {
        const m = distanceToSegment(p, w.a, w.b) - w.thickness / 2;
        if (m < wm) wm = m;
      }
      wallMargin[idx] = wm;
      if (wm < WALL_CLEARANCE) continue;
      let oe = Infinity;
      for (const o of obstacles) {
        const dx = p[0] - o.x,
          dz = p[1] - o.z;
        if (Math.abs(dx) > o.hw + o.hd + 1 || Math.abs(dz) > o.hw + o.hd + 1)
          continue;
        const e = Math.max(
          Math.abs(o.c * dx - o.s * dz) - o.hw,
          Math.abs(o.s * dx + o.c * dz) - o.hd,
        );
        if (e < oe) oe = e;
      }
      obstacleExcess[idx] = oe;
    }
  const grid: NavGrid = {
    levelId,
    step: NAV_STEP,
    ix0,
    iz0,
    nx,
    nz,
    zones,
    walls,
    obstacles,
    zoneIndex,
    wallMargin,
    obstacleExcess,
    buildMs: Date.now() - began,
  };
  byKey.set(key, grid);
  return grid;
}

const cellIndex = (g: NavGrid, ix: number, iz: number) => {
  const i = ix - g.ix0,
    j = iz - g.iz0;
  return i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : i * g.nz + j;
};
const cellPoint = (g: NavGrid, idx: number): Vec2 => [
  round3((g.ix0 + Math.floor(idx / g.nz)) * NAV_STEP),
  round3((g.iz0 + (idx % g.nz)) * NAV_STEP),
];
/** True when the cell at (ix, iz) is walkable with the given clearance. */
export function isNode(g: NavGrid, ix: number, iz: number, clearance = WALL_CLEARANCE) {
  const idx = cellIndex(g, ix, iz);
  return (
    idx >= 0 &&
    passes(g.zoneIndex[idx], g.wallMargin[idx], g.obstacleExcess[idx], clearance)
  );
}
export function nodeCount(g: NavGrid, clearance = WALL_CLEARANCE) {
  let n = 0;
  for (let idx = 0; idx < g.zoneIndex.length; idx++)
    if (passes(g.zoneIndex[idx], g.wallMargin[idx], g.obstacleExcess[idx], clearance))
      n++;
  return n;
}
/** Zone id at a point, falling back like build-activity.py (`lobby` on the ground floor). */
export function zoneAt(g: NavGrid, p: Vec2, fallback = g.levelId === 'ground' ? 'lobby' : g.zones[0]?.id || '') {
  for (const z of g.zones) if (insidePolygon(p, z.polygon)) return z.id;
  return fallback;
}
/** Room id at a point, or null. */
export function roomAt(model: Facility, levelId: string, p: Vec2) {
  return (
    model.rooms.find(
      (r) =>
        r.levelId === levelId && r.kind !== 'shell' && insidePolygon(p, r.polygon),
    )?.id ?? null
  );
}
export class NavError extends Error {}
const components = new WeakMap<NavGrid, Map<number, Int32Array>>();
/**
 * Connected-component labels for the walkable cells at one clearance, using the
 * same 8-neighbour/no-corner-cutting rule as `route`. Label 0 is the largest
 * component (the circulating floor); -1 marks blocked cells.
 */
export function componentLabels(g: NavGrid, clearance = WALL_CLEARANCE) {
  let byClearance = components.get(g);
  if (!byClearance) components.set(g, (byClearance = new Map()));
  const hit = byClearance.get(clearance);
  if (hit) return hit;
  const raw = new Int32Array(g.nx * g.nz).fill(-1),
    sizes: number[] = [],
    ok = (ix: number, iz: number) => isNode(g, ix, iz, clearance);
  for (let idx = 0; idx < raw.length; idx++) {
    if (raw[idx] !== -1) continue;
    const ix = g.ix0 + Math.floor(idx / g.nz),
      iz = g.iz0 + (idx % g.nz);
    if (!ok(ix, iz)) continue;
    const label = sizes.length,
      queue = [idx];
    raw[idx] = label;
    let size = 0;
    while (queue.length) {
      const u = queue.pop()!,
        ux = g.ix0 + Math.floor(u / g.nz),
        uz = g.iz0 + (u % g.nz);
      size++;
      for (const [dx, dz] of NEIGHBOURS) {
        const vx = ux + dx,
          vz = uz + dz,
          v = cellIndex(g, vx, vz);
        if (v < 0 || raw[v] !== -1 || !ok(vx, vz)) continue;
        if (dx && dz && (!ok(ux + dx, uz) || !ok(ux, uz + dz))) continue;
        raw[v] = label;
        queue.push(v);
      }
    }
    sizes.push(size);
  }
  // Relabel so the largest component is 0.
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b] - sizes[a]),
    rank = new Int32Array(sizes.length);
  order.forEach((label, i) => (rank[label] = i));
  for (let i = 0; i < raw.length; i++) if (raw[i] >= 0) raw[i] = rank[raw[i]];
  byClearance.set(clearance, raw);
  return raw;
}
/** Nearest walkable cell centre; optionally restricted to one zone and to the main circulation. */
export function snap(
  g: NavGrid,
  p: Vec2,
  options: {
    zoneId?: string;
    clearance?: number;
    maxDistance?: number;
    /** Only cells connected to the main circulating floor (default true). */
    connected?: boolean;
  } = {},
): Vec2 {
  const clearance = options.clearance ?? WALL_CLEARANCE,
    max = options.maxDistance ?? 2.2,
    labels =
      options.connected === false ? null : componentLabels(g, clearance);
  const zi = options.zoneId ? g.zones.findIndex((z) => z.id === options.zoneId) : -1;
  const cx = Math.round(p[0] / NAV_STEP),
    cz = Math.round(p[1] / NAV_STEP),
    reach = Math.ceil(max / NAV_STEP) + 1;
  let best: Vec2 | null = null,
    bestD = Infinity;
  for (let dx = -reach; dx <= reach; dx++)
    for (let dz = -reach; dz <= reach; dz++) {
      const idx = cellIndex(g, cx + dx, cz + dz);
      if (idx < 0) continue;
      if (!passes(g.zoneIndex[idx], g.wallMargin[idx], g.obstacleExcess[idx], clearance))
        continue;
      if (zi >= 0 && g.zoneIndex[idx] !== zi) continue;
      if (labels && labels[idx] !== 0) continue;
      const q = cellPoint(g, idx),
        d = distance(p, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
  if (!best || bestD > max)
    throw new NavError(`Anchor too far from free floor: ${p.join(',')}`);
  return best;
}

/** Binary min-heap keyed by f-cost. */
class Heap {
  keys: number[] = [];
  items: number[] = [];
  push(key: number, item: number) {
    const k = this.keys,
      it = this.items;
    let i = k.length;
    k.push(key);
    it.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (k[parent] <= key) break;
      k[i] = k[parent];
      it[i] = it[parent];
      i = parent;
    }
    k[i] = key;
    it[i] = item;
  }
  pop(): number | undefined {
    const k = this.keys,
      it = this.items;
    if (!k.length) return undefined;
    const top = it[0],
      lastK = k.pop()!,
      lastI = it.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        it[i] = it[c];
        i = c;
      }
      k[i] = lastK;
      it[i] = lastI;
    }
    return top;
  }
  get size() {
    return this.keys.length;
  }
}
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;
/**
 * Shortest collision-safe route between two walkable cells (8-connected, no
 * corner cutting), reduced to direction changes like build-activity.py.
 */
export function route(
  g: NavGrid,
  a: Vec2,
  b: Vec2,
  clearance = WALL_CLEARANCE,
): Vec2[] {
  const sx = Math.round(a[0] / NAV_STEP),
    sz = Math.round(a[1] / NAV_STEP),
    gx = Math.round(b[0] / NAV_STEP),
    gz = Math.round(b[1] / NAV_STEP);
  const start = cellIndex(g, sx, sz),
    goal = cellIndex(g, gx, gz);
  const ok = (ix: number, iz: number) => isNode(g, ix, iz, clearance);
  if (start < 0 || !ok(sx, sz))
    throw new NavError(`Route start is not walkable: ${a.join(',')}`);
  if (goal < 0 || !ok(gx, gz))
    throw new NavError(`Route goal is not walkable: ${b.join(',')}`);
  const cost = new Float64Array(g.nx * g.nz).fill(Infinity),
    prev = new Int32Array(g.nx * g.nz).fill(-1),
    heap = new Heap();
  cost[start] = 0;
  heap.push(0, start);
  let found = start === goal;
  while (heap.size && !found) {
    const u = heap.pop()!;
    if (u === goal) {
      found = true;
      break;
    }
    const ux = g.ix0 + Math.floor(u / g.nz),
      uz = g.iz0 + (u % g.nz);
    for (const [dx, dz] of NEIGHBOURS) {
      const vx = ux + dx,
        vz = uz + dz;
      if (!ok(vx, vz)) continue;
      if (dx && dz && (!ok(ux + dx, uz) || !ok(ux, uz + dz))) continue;
      const v = cellIndex(g, vx, vz),
        c = cost[u] + (dx && dz ? Math.SQRT2 : 1);
      if (c < cost[v]) {
        cost[v] = c;
        prev[v] = u;
        heap.push(c + Math.hypot(vx - gx, vz - gz), v);
      }
    }
  }
  if (!found)
    throw new NavError(`No safe path from ${a.join(',')} to ${b.join(',')}`);
  const cells = [goal];
  while (cells[cells.length - 1] !== start) cells.push(prev[cells[cells.length - 1]]);
  const raw = cells.reverse().map((idx) => cellPoint(g, idx));
  return simplify(raw);
}
/** Keep only direction changes (collinear vertices removed), as in build-activity.py. */
export function simplify(raw: readonly Vec2[]): Vec2[] {
  if (raw.length < 2) return raw.map((p) => [p[0], p[1]] as Vec2);
  const out: Vec2[] = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    const d1x = round3(raw[i][0] - raw[i - 1][0]),
      d1z = round3(raw[i][1] - raw[i - 1][1]),
      d2x = round3(raw[i + 1][0] - raw[i][0]),
      d2z = round3(raw[i + 1][1] - raw[i][1]);
    if (d1x !== d2x || d1z !== d2z) out.push(raw[i]);
  }
  const last = raw[raw.length - 1];
  if (last !== out[out.length - 1]) out.push(last);
  return out;
}
/**
 * Route from any point to any point: snaps both ends to walkable cells and adds
 * short straight approach/exit legs when the exact points differ (e.g. sitting
 * down on a chair) and the straight leg stays clear of walls.
 */
export function routeBetween(
  g: NavGrid,
  a: Vec2,
  b: Vec2,
  clearance = WALL_CLEARANCE,
  options: { maxApproach?: number; minWall?: number } = {},
): Vec2[] {
  const maxApproach = options.maxApproach ?? 1.2,
    minWall = options.minWall ?? 0.2;
  const sa = snap(g, a, { clearance }),
    sb = snap(g, b, { clearance });
  const core = distance(sa, sb) < 1e-6 ? [sa] : route(g, sa, sb, clearance);
  const out: Vec2[] = [];
  const addLeg = (p: Vec2, q: Vec2) => {
    const d = distance(p, q);
    if (d < 1e-6) return;
    if (d > maxApproach)
      throw new NavError(`Approach leg too long (${d.toFixed(2)} m) at ${q.join(',')}`);
    const n = Math.max(1, Math.ceil(d / 0.05));
    for (let k = 0; k <= n; k++) {
      const x = p[0] + ((q[0] - p[0]) * k) / n,
        z = p[1] + ((q[1] - p[1]) * k) / n;
      if (wallClearanceAt(g, [x, z]) < minWall)
        throw new NavError(`Approach leg clips a wall near ${q.join(',')}`);
    }
  };
  addLeg(a, sa);
  if (distance(a, sa) > 1e-6) out.push([a[0], a[1]]);
  out.push(...core);
  addLeg(sb, b);
  if (distance(b, sb) > 1e-6) out.push([b[0], b[1]]);
  if (out.length === 1) out.push([out[0][0], out[0][1]]);
  return out;
}
