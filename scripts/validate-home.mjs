// The Wongs' home (public/models/seen-home-wong.json), checked headlessly:
//   node scripts/validate-home.mjs
// The specification validates and stays small; every door gap between the
// wall segments of a run is a scheduled door at least 0.9 m (interior) or
// 1.0 m (exterior) clear; floor furniture never overlaps other furniture or
// walls and sits inside its room; stacked items rest on something; the seven
// 1.5 m turning circles are clear of walls and furniture on the navigation
// grid; and every room is reachable from just inside the front door at
// wheelchair (0.37 m) and walker (0.33 m) clearance. The grid is built with
// explicit options (no day-program removals or reservations, no excluded
// zones), never navGrid's Alhambra defaults. Every asset builds; the home
// kinds (app/model/home-assets.ts) come from buildHomeAsset at their declared
// size, from boxes, cylinders and rounded boxes that cast and receive
// shadows, in materials the specification defines.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';

const FILE = process.argv[2] || 'public/models/seen-home-wong.json';
const { schema, nav, assets, home } = await loadSim(
  {
    schema: 'app/model/schema.ts',
    nav: 'app/sim/nav.ts',
    assets: 'app/model/assets.ts',
    home: 'app/model/home-assets.ts',
  },
  { dir: 'work/home' },
);
const text = readFileSync(FILE, 'utf8');
const model = schema.validateFacility(JSON.parse(text));
assert.deepEqual(
  schema.validateFacility(JSON.parse(JSON.stringify(model))),
  model,
  'Specification survives a lossless JSON round trip',
);
assert.equal(
  text,
  JSON.stringify(model, null, 2) + '\n',
  'Formatted like scripts/prepare-public-models.mjs (JSON.stringify(model, null, 2) + newline), so a build does not rewrite it',
);
const bytes = statSync(FILE).size;
assert(bytes < 150_000, `${FILE} is ${bytes} bytes; keep it under 150 kB`);
assert(
  Object.values(model.materials).every((m) => !m.textureUrl) &&
    Object.values(model.assets).every((a) => !a.modelUrl),
  'No textures or GLB models: the home ships as one small JSON',
);
assert.equal(model.id, 'seen-home-wong');
assert.deepEqual(
  model.levels.map((l) => [l.id, l.elevation]),
  [['ground', 0]],
  'One ground level at elevation 0',
);

// --- Geometry helpers --------------------------------------------------------
const TOL = 0.005;
const objectRect = (o) => {
  const a = model.assets[o.assetId];
  return {
    id: o.id,
    x: o.position[0],
    z: o.position[2],
    hw: (a.dimensions[0] * o.scale[0]) / 2,
    hd: (a.dimensions[2] * o.scale[2]) / 2,
    r: o.rotation,
  };
};
// Renderer convention: rotation.y = r maps local +x to (cos r, −sin r), +z to (sin r, cos r).
const corners = (q) => {
  const c = Math.cos(q.r),
    s = Math.sin(q.r);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => [
    q.x + u * q.hw * c + v * q.hd * s,
    q.z - u * q.hw * s + v * q.hd * c,
  ]);
};
const wallRect = (w) => ({
  id: w.id,
  x: (w.a[0] + w.b[0]) / 2,
  z: (w.a[1] + w.b[1]) / 2,
  hw: Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) / 2,
  hd: w.thickness / 2,
  r: -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]),
});
const axes = (poly) =>
  poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length],
      n = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [-(q[1] - p[1]) / n, (q[0] - p[0]) / n];
  });
/** Penetration depth of two convex polygons (separating axes); ≤ 0 when apart. */
const overlap = (p, q) => {
  let best = Infinity;
  for (const [ax, az] of [...axes(p), ...axes(q)]) {
    const pp = p.map((v) => v[0] * ax + v[1] * az),
      qq = q.map((v) => v[0] * ax + v[1] * az);
    const o =
      Math.min(Math.max(...pp), Math.max(...qq)) -
      Math.max(Math.min(...pp), Math.min(...qq));
    if (o <= 0) return o;
    best = Math.min(best, o);
  }
  return best;
};
const inside = (p, poly, tol = 0.02) =>
  nav.insidePolygon(p, poly) ||
  poly.some(
    (a, i) => nav.distanceToSegment(p, a, poly[(i + 1) % poly.length]) <= tol,
  );
/** Euclidean distance from a point to an oriented rectangle (0 inside). */
const rectDistance = (p, q) => {
  const dx = p[0] - q.x,
    dz = p[1] - q.z,
    c = Math.cos(q.r),
    s = Math.sin(q.r);
  const lx = c * dx - s * dz,
    lz = s * dx + c * dz;
  return Math.hypot(
    Math.max(0, Math.abs(lx) - q.hw),
    Math.max(0, Math.abs(lz) - q.hd),
  );
};

const rooms = new Map(model.rooms.map((r) => [r.id, r]));
const furniture = model.objects.filter(
  (o) => o.zoneId !== 'site' && (o.layer ?? 'furniture') === 'furniture',
);
const floorItems = furniture.filter((o) => o.position[1] < 0.05);
const stacked = furniture.filter((o) => o.position[1] >= 0.05);
const problems = [];
const check = (ok, message) => ok || problems.push(message);

// --- Doors: gaps between the segments of each wall run ------------------------
const runs = new Map();
for (const w of model.walls) {
  const run = w.id.replace(/-[a-d]$/, '');
  if (!runs.has(run)) runs.set(run, []);
  runs.get(run).push(w);
}
const gaps = [];
for (const [run, segments] of runs) {
  const alongZ = Math.abs(segments[0].a[0] - segments[0].b[0]) < 1e-9;
  const k = alongZ ? 1 : 0,
    line = segments[0].a[1 - k];
  for (const w of segments)
    check(
      Math.abs(w.a[1 - k] - line) < 1e-9 && Math.abs(w.b[1 - k] - line) < 1e-9,
      `${w.id} is not collinear with ${run}`,
    );
  const spans = segments
    .map((w) => [Math.min(w.a[k], w.b[k]), Math.max(w.a[k], w.b[k]), w])
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < spans.length; i++) {
    const [g0, g1] = [spans[i - 1][1], spans[i][0]],
      door = model.doorSchedule.find(
        (d) =>
          d.wall === run &&
          Math.abs(d.gap[0] - g0) < 0.01 &&
          Math.abs(d.gap[1] - g1) < 0.01,
      );
    const exterior = spans[i][2].thickness >= 0.2;
    gaps.push({ run, g0, g1, door, exterior });
    check(door, `${run}: gap ${g0}…${g1} is not in the door schedule`);
    check(
      g1 - g0 >= (exterior ? 1.0 : 0.9) - 1e-9,
      `${run}: door gap ${(g1 - g0).toFixed(3)} m < ${exterior ? '1.0 m (exterior)' : '0.9 m (interior)'}`,
    );
  }
}
for (const d of model.doorSchedule) {
  check(
    gaps.some((g) => g.door === d),
    `${d.id}: scheduled but no matching gap in ${d.wall}`,
  );
  const leaf = model.objects.find((o) => o.id === d.objectId);
  check(leaf, `${d.id}: leaf object ${d.objectId} missing`);
  if (!leaf) continue;
  const kind = model.assets[leaf.assetId].kind;
  check(
    kind === (d.type === 'swing' ? 'plan-door' : 'sliding-door') &&
      leaf.layer !== 'furniture',
    `${d.id}: leaf must be a ${d.type === 'swing' ? 'plan-door' : 'sliding-door'} outside the furniture layer`,
  );
}

// --- Furniture: overlaps, walls, rooms, stacking ------------------------------
const rects = new Map(floorItems.map((o) => [o.id, corners(objectRect(o))]));
for (let i = 0; i < floorItems.length; i++)
  for (let j = i + 1; j < floorItems.length; j++) {
    const a = floorItems[i],
      b = floorItems[j],
      depth = overlap(rects.get(a.id), rects.get(b.id));
    check(depth <= TOL, `${a.id} overlaps ${b.id} by ${depth.toFixed(3)} m`);
  }
for (const o of floorItems) {
  for (const w of model.walls) {
    const depth = overlap(rects.get(o.id), corners(wallRect(w)));
    check(depth <= TOL, `${o.id} runs ${depth.toFixed(3)} m into ${w.id}`);
  }
  const room = rooms.get(o.roomId);
  check(room, `${o.id}: furniture needs a room`);
  if (room)
    check(
      rects.get(o.id).every((p) => inside(p, room.polygon)),
      `${o.id} pokes out of ${room.id}`,
    );
}
for (const o of stacked) {
  const base = floorItems.find((b) => {
    const top =
      b.position[1] + model.assets[b.assetId].dimensions[1] * b.scale[1];
    return (
      Math.abs(top - o.position[1]) < 0.02 &&
      rectDistance([o.position[0], o.position[2]], objectRect(b)) === 0
    );
  });
  check(base, `${o.id} at y ${o.position[1]} rests on nothing`);
}

// --- Navigation grid: turning circles and reachability ------------------------
const options = {
  levelId: 'ground',
  removedObjectIds: [],
  reservations: [],
  excludeZoneIds: [],
  blockVerticalCirculation: true,
};
const grid = nav.navGrid(model, options);
const knee = new Set(
  model.objects
    .filter((o) => model.assets[o.assetId].kind === 'basin')
    .map((o) => o.id),
);
const circleReport = [];
assert.equal(model.turningCircles.length, 7, 'Seven turning circles');
for (const c of model.turningCircles) {
  const r = c.diameter / 2;
  check(c.diameter >= 1.5 - 1e-9, `${c.id}: diameter ${c.diameter} < 1.5 m`);
  check(
    inside(c.centre, rooms.get(c.roomId).polygon, 0),
    `${c.id}: centre outside ${c.roomId}`,
  );
  // Sample the disk at 5 cm: on floor, outside every wall and raw furniture footprint.
  let samples = 0;
  for (let dx = -r; dx <= r + 1e-9; dx += 0.05)
    for (let dz = -r; dz <= r + 1e-9; dz += 0.05) {
      if (dx * dx + dz * dz > r * r) continue;
      const p = [c.centre[0] + dx, c.centre[1] + dz];
      const m = nav.measurePoint(grid, p),
        at = p.map((v) => v.toFixed(2)).join(', ');
      const hit = grid.obstacles.find((o) => {
        if (knee.has(o.id)) return false;
        const ox = p[0] - o.x,
          oz = p[1] - o.z;
        return (
          Math.abs(o.c * ox - o.s * oz) < o.hw - nav.FURNITURE_CLEARANCE &&
          Math.abs(o.s * ox + o.c * oz) < o.hd - nav.FURNITURE_CLEARANCE
        );
      });
      check(m.zoneIndex >= 0, `${c.id}: (${at}) is off the floor`);
      check(m.wallMargin >= 0, `${c.id}: (${at}) is inside a wall`);
      check(!hit, `${c.id}: (${at}) is inside ${hit?.id ?? ''}`);
      samples++;
    }
  const nearest = Math.min(
    ...floorItems
      .filter((o) => !knee.has(o.id))
      .map((o) => rectDistance(c.centre, objectRect(o))),
    ...model.walls.map(
      (w) => nav.distanceToSegment(c.centre, w.a, w.b) - w.thickness / 2,
    ),
  );
  circleReport.push(`${c.id} +${(nearest - r).toFixed(2)}`);
  check(samples > 700, `${c.id}: only ${samples} samples`);
}
// Each door on its own passes a wheelchair: the route between points 0.7 m
// either side of the gap centre goes straight through it (not round by
// another door). A 0.9 m door clears 0.37 m only when a grid line runs
// through its middle, so the gaps are centred on multiples of 0.2 m.
const doorRoutes = [];
for (const g of gaps) {
  const w = runs.get(g.run)[0],
    alongZ = Math.abs(w.a[0] - w.b[0]) < 1e-9,
    mid = (g.g0 + g.g1) / 2,
    line = alongZ ? w.a[0] : w.a[1];
  const side = (s) => (alongZ ? [line + s * 0.7, mid] : [mid, line + s * 0.7]);
  try {
    const path = nav.routeBetween(
      grid,
      side(-1),
      side(1),
      nav.MOBILITY_CLEARANCE.wheelchair,
    );
    const length = nav.pathLength(path);
    doorRoutes.push(length);
    check(
      length < 2.0,
      `${g.door?.id}: the wheelchair route goes round (${length.toFixed(2)} m), not through the door`,
    );
  } catch (e) {
    check(
      false,
      `${g.door?.id}: no wheelchair route through the door (${e.message})`,
    );
  }
}
const doorIn = [2.45, -0.4];
const reach = {};
for (const [name, clearance] of [
  ['wheelchair', nav.MOBILITY_CLEARANCE.wheelchair],
  ['walker', nav.MOBILITY_CLEARANCE.walker],
]) {
  const labels = nav.componentLabels(grid, clearance);
  const start = nav.snap(grid, doorIn, { clearance, connected: false });
  const at = (p) =>
    (Math.round(p[0] / nav.NAV_STEP) - grid.ix0) * grid.nz +
    (Math.round(p[1] / nav.NAV_STEP) - grid.iz0);
  const home = labels[at(start)];
  let cells = 0;
  for (const room of model.rooms) {
    let found = false;
    for (let idx = 0; idx < labels.length && !found; idx++) {
      if (labels[idx] !== home) continue;
      const p = [
        (grid.ix0 + Math.floor(idx / grid.nz)) * nav.NAV_STEP,
        (grid.iz0 + (idx % grid.nz)) * nav.NAV_STEP,
      ];
      found = nav.insidePolygon(p, room.polygon);
    }
    check(
      found,
      `${room.id} is not reachable from the front door at ${name} clearance ${clearance} m`,
    );
  }
  for (const l of labels) if (l === home) cells++;
  reach[name] = cells;
}

// --- Asset kinds -------------------------------------------------------------
const used = new Set();
const resolver = () => {
  const cache = new Map();
  return (id) => {
    used.add(id);
    if (!cache.has(id))
      cache.set(
        id,
        new T.MeshStandardMaterial({
          color: model.materials[id]?.color ?? '#dce1d8',
        }),
      );
    return cache.get(id);
  };
};
const homeKinds = new Set(home.HOME_ASSET_KINDS);
const builtKinds = new Set();
const sizeOf = (o) => new T.Box3().setFromObject(o).getSize(new T.Vector3());
for (const [id, spec] of Object.entries(model.assets)) {
  const group = assets.buildAsset(spec, resolver());
  let meshes = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (!homeKinds.has(spec.kind)) return;
    check(
      o.castShadow && o.receiveShadow,
      `${id}: a mesh does not cast and receive shadows`,
    );
    check(
      o.geometry instanceof T.BoxGeometry ||
        o.geometry instanceof T.CylinderGeometry,
      `${id}: ${o.geometry.type} is not a box, cylinder or rounded box`,
    );
  });
  check(meshes > 0, `${id}: built no meshes`);
  if (!homeKinds.has(spec.kind)) continue;
  builtKinds.add(spec.kind);
  check(
    home.buildHomeAsset(spec, resolver()),
    `${id}: buildHomeAsset does not draw ${spec.kind}`,
  );
  check(meshes >= 4, `${id}: only ${meshes} meshes (fallback box?)`);
  check(
    typeof spec.parameters?.front === 'string',
    `${id}: document the kind's front in parameters.front`,
  );
  const size = sizeOf(group);
  check(
    [size.x, size.y, size.z].every(
      (v, i) => Math.abs(v - spec.dimensions[i]) < 0.002,
    ),
    `${id}: built ${[size.x, size.y, size.z].map((v) => v.toFixed(3)).join(' × ')}, declared ${spec.dimensions.join(' × ')}`,
  );
}
for (const kind of homeKinds)
  check(builtKinds.has(kind), `No asset in the home uses the ${kind} kind`);
// Transfer-handle variants keep the bed inside its declared size.
for (const transferHandle of ['none', 'left', 'right', 'both']) {
  const spec = {
    ...model.assets['home-bed-queen'],
    parameters: {
      ...model.assets['home-bed-queen'].parameters,
      transferHandle,
    },
  };
  const size = sizeOf(assets.buildAsset(spec, resolver()));
  check(
    Math.abs(size.x - spec.dimensions[0]) < 0.002 &&
      Math.abs(size.z - spec.dimensions[2]) < 0.002,
    `bed with transferHandle ${transferHandle} is ${size.x.toFixed(3)} × ${size.z.toFixed(3)} m`,
  );
}
for (const id of used)
  check(
    model.materials[id] || /^#[0-9a-f]{6}$/i.test(id),
    `Material ${id} is used by an asset but not defined`,
  );

if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  assert.fail(`${problems.length} home problem(s); first: ${problems[0]}`);
}
console.log(
  `Home: ${FILE} valid (${(bytes / 1024).toFixed(1)} kB): ${model.zones.length} zones, ${model.rooms.length} rooms, ` +
    `${model.walls.length} walls, ${gaps.length} door gaps (${gaps
      .map((g) => (g.g1 - g.g0).toFixed(2))
      .join(
        ', ',
      )} m, each passed straight through at wheelchair clearance), ${floorItems.length} floor items without overlaps, ${stacked.length} stacked. ` +
    `Turning circles clear (margin to the nearest wall or fixture): ${circleReport.join(', ')}. ` +
    `Every room reachable from the front door: ${reach.wheelchair} cells at wheelchair and ${reach.walker} at walker clearance ` +
    `(grid ${grid.nx}×${grid.nz}, ${grid.buildMs} ms). ` +
    `${Object.keys(model.assets).length} assets build; home kinds ${[...builtKinds].join(', ')} at their declared size; ${used.size} materials, all defined.`,
);
