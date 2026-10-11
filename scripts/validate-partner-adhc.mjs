// The partner adult day health care center (public/models/seen-partner-adhc.json,
// written by scripts/build-partner-adhc.mjs), checked headlessly:
//   node scripts/validate-partner-adhc.mjs
// (`npm run validate:partner-adhc` first checks that the generator rewrites
// the file unchanged.)
//
// Specification: validates, survives a JSON round trip, is formatted as the
// public models are, stays under 200 kB with no textures or GLB models, and
// has one ground level. The program: one storey of 450–650 m² gross (well
// under the main center's ground floor) holding exactly the brief's rooms
// (hall, stage, light rehab, classroom, studio, group room) and the approved
// extras (entry and reception, two accessible restrooms), the hall the
// largest room.
// Doors: every gap between the segments of a wall run is a scheduled door,
// at least 0.9 m (interior) or 1.0 m (exterior) clear, with plan-door leaves
// outside the furniture layer, and each is passed straight through at
// wheelchair clearance on the navigation grid.
// Furniture: floor furniture never overlaps other furniture or walls and
// sits inside its room; everything on the stage rests on the deck.
// Access: the five 1.5 m turning circles are clear; every room is reachable
// from just inside the front doors at wheelchair (0.37 m) and walker
// (0.33 m) clearance; the stage deck is reachable step-free: wheelchair and
// walker routes from the dance floor go up the 1:12 ramp onto the deck at its
// landing (the steps' lanes are too narrow for either).
// Assets: every asset has a human name (inspect cards fall back to it); the
// ADHC kinds (app/model/adhc-assets.ts) come from buildAdhcAsset at their
// declared size with their front documented, every kind is used, and every
// material an asset asks for is defined.
// Registry: partner-adc stamps this facility (static builds ship it through
// instanceFacilityUrls), its site checks pass, the front doors face the
// drop-off, and the camera anchors lie in their rooms.
// Cast (app/data/community/partner-adc.cast.json): the contract interaction
// ids and actors are there, every featured scene lasts at least 20 s inside
// the day, the line dance has at least twelve dancers and the lead dancing,
// the visiting Seen PT comes in through the front and works in the rehab
// across the story's 289–300 s chapter, and the generated tracks
// (app/data/community-casts.json) hold the same interactions.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';

const FILE = 'public/models/seen-partner-adhc.json';
const CAST = 'app/data/community/partner-adc.cast.json';
const { schema, nav, assets, adhc, settings, community } = await loadSim(
  {
    schema: 'app/model/schema.ts',
    nav: 'app/sim/nav.ts',
    assets: 'app/model/assets.ts',
    adhc: 'app/model/adhc-assets.ts',
    settings: 'app/model/community-settings.ts',
    community: 'app/sim/community-cast.ts',
  },
  { dir: 'work/partner-adhc' },
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
  'Formatted like scripts/prepare-public-models.mjs (JSON.stringify(model, null, 2) + newline)',
);
const bytes = statSync(FILE).size;
assert(bytes < 200_000, `${FILE} is ${bytes} bytes; keep it under 200 kB`);
assert(
  Object.values(model.materials).every((m) => !m.textureUrl) &&
    Object.values(model.assets).every((a) => !a.modelUrl),
  'No textures or GLB models: the center ships as one small JSON',
);
assert.equal(model.id, 'seen-partner-adhc');
assert.deepEqual(
  model.levels.map((l) => [l.id, l.elevation]),
  [['ground', 0]],
  'One storey: a ground level at elevation 0',
);

const problems = [];
const check = (ok, message) => ok || problems.push(message);

// --- Geometry helpers --------------------------------------------------------
const TOL = 0.005;
const area = (poly) =>
  Math.abs(
    poly.reduce((n, a, i) => {
      const b = poly[(i + 1) % poly.length];
      return n + a[0] * b[1] - b[0] * a[1];
    }, 0),
  ) / 2;
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

// --- Program: size and rooms -------------------------------------------------
const gross = model.zones.reduce((n, z) => n + area(z.polygon), 0);
check(
  Math.abs(gross - area(model.site.buildingOutline)) < 0.5,
  `Zones (${gross.toFixed(1)} m²) do not tile the building outline (${area(model.site.buildingOutline).toFixed(1)} m²)`,
);
check(
  gross >= 450 && gross <= 650,
  `Gross area ${gross.toFixed(1)} m² outside 450–650 m²`,
);
const main = JSON.parse(
  readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
);
const mainGround = main.zones
  .filter((z) => z.levelId === 'ground')
  .reduce((n, z) => n + area(z.polygon), 0);
check(
  gross <= 0.35 * mainGround,
  `Gross area ${gross.toFixed(1)} m² is not substantially smaller than the main center's ground floor (${mainGround.toFixed(0)} m²)`,
);
const PROGRAM = {
  'adhc-hall': 'multipurpose',
  'adhc-stage': 'stage',
  'adhc-rehab': 'rehab',
  'adhc-classroom': 'classroom',
  'adhc-studio': 'studio',
  'adhc-group-room': 'group-room',
  'adhc-reception': 'reception',
  'adhc-restroom-w': 'restroom',
  'adhc-restroom-e': 'restroom',
};
assert.deepEqual(
  model.rooms.map((r) => r.id).sort(),
  Object.keys(PROGRAM).sort(),
  'The brief’s rooms and the approved extras, nothing else',
);
const rooms = new Map(model.rooms.map((r) => [r.id, r]));
const roomArea = Object.fromEntries(
  model.rooms.map((r) => [r.id, area(r.polygon)]),
);
for (const [id, kind] of Object.entries(PROGRAM))
  check(rooms.get(id).kind === kind, `${id}: kind ${rooms.get(id).kind}, not ${kind}`);
check(
  Object.entries(roomArea).every(
    ([id, a]) => id === 'adhc-hall' || a < roomArea['adhc-hall'],
  ),
  'The hall is the largest room',
);

// --- Doors: gaps between the segments of each wall run ------------------------
const runs = new Map();
for (const w of model.walls) {
  const run = w.id.replace(/-[a-z]$/, '');
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
    gaps.push({ run, g0, g1, door, exterior, alongZ, line });
    check(door, `${run}: gap ${g0}…${g1} is not in the door schedule`);
    check(
      g1 - g0 >= (exterior ? 1.0 : 0.9) - 1e-9,
      `${run}: door gap ${(g1 - g0).toFixed(3)} m < ${exterior ? '1.0 m (exterior)' : '0.9 m (interior)'}`,
    );
  }
}
for (const d of model.doorSchedule) {
  if (d.type === 'opening') continue;
  check(
    gaps.some((g) => g.door === d),
    `${d.id}: scheduled but no matching gap in ${d.wall}`,
  );
  check(d.leaves?.length, `${d.id}: no door leaves`);
  for (const id of d.leaves ?? []) {
    const leaf = model.objects.find((o) => o.id === id);
    check(
      leaf &&
        model.assets[leaf.assetId].kind === 'plan-door' &&
        leaf.layer !== 'furniture',
      `${d.id}: leaf ${id} must be a plan-door outside the furniture layer`,
    );
  }
}
const entrance = gaps.find((g) => g.door?.id === 'adhc-door-entrance');
assert(entrance, 'The front doors are a gap in the entry pavilion’s front wall');
const outlineFront = Math.max(...model.site.buildingOutline.map((p) => p[1]));
check(
  !entrance.alongZ && Math.abs(entrance.line - (outlineFront - 0.1)) < 0.11,
  `The front doors (z ${entrance.line}) are not in the front face (z ${outlineFront}) toward the drop-off`,
);

// --- Furniture: overlaps, walls, rooms, stacking ------------------------------
const furniture = model.objects.filter(
  (o) => (o.layer ?? 'furniture') === 'furniture',
);
const floorItems = furniture.filter((o) => o.position[1] < 0.05);
const stacked = furniture.filter((o) => o.position[1] >= 0.05);
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
  if (o.roomId === 'adhc-stage')
    check(
      base?.id === 'adhc-stage-platform',
      `${o.id} is on the stage but not on its deck`,
    );
}
// Stacked items stand on the deck, so stacking them may overlap nothing either.
const stackedRects = new Map(stacked.map((o) => [o.id, corners(objectRect(o))]));
for (let i = 0; i < stacked.length; i++)
  for (let j = i + 1; j < stacked.length; j++) {
    const a = stacked[i],
      b = stacked[j],
      depth = overlap(stackedRects.get(a.id), stackedRects.get(b.id));
    check(depth <= TOL, `${a.id} overlaps ${b.id} by ${depth.toFixed(3)} m`);
  }

// --- Navigation grid: turning circles, doors, reachability, the stage --------
const grid = nav.navGrid(model, {
  levelId: 'ground',
  removedObjectIds: [],
  reservations: [],
  excludeZoneIds: [],
  blockVerticalCirculation: true,
});
const knee = new Set(
  model.objects
    .filter((o) => model.assets[o.assetId].kind === 'basin')
    .map((o) => o.id),
);
const circleReport = [];
assert.equal(model.turningCircles.length, 5, 'Five turning circles');
for (const c of model.turningCircles) {
  const r = c.diameter / 2;
  check(c.diameter >= 1.5 - 1e-9, `${c.id}: diameter ${c.diameter} < 1.5 m`);
  check(
    inside(c.centre, rooms.get(c.roomId).polygon, 0),
    `${c.id}: centre outside ${c.roomId}`,
  );
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
  circleReport.push(c.id.replace(/^turn-/, ''));
  check(samples > 700, `${c.id}: only ${samples} samples`);
}
// Each door on its own passes a wheelchair: the route between points 0.7 m
// either side of the gap centre goes straight through it.
for (const g of gaps) {
  const mid = (g.g0 + g.g1) / 2;
  const side = (s) => (g.alongZ ? [g.line + s * 0.7, mid] : [mid, g.line + s * 0.7]);
  try {
    const path = nav.routeBetween(
      grid,
      side(-1),
      side(1),
      nav.MOBILITY_CLEARANCE.wheelchair,
    );
    const length = nav.pathLength(path);
    check(
      length < 2.0,
      `${g.door?.id}: the wheelchair route goes round (${length.toFixed(2)} m), not through the door`,
    );
  } catch (e) {
    check(false, `${g.door?.id}: no wheelchair route through the door (${e.message})`);
  }
}
const cell = (p) =>
  (Math.round(p[0] / nav.NAV_STEP) - grid.ix0) * grid.nz +
  (Math.round(p[1] / nav.NAV_STEP) - grid.iz0);
const doorIn = [0, 9.4];
const reach = {};
for (const [name, clearance] of [
  ['wheelchair', nav.MOBILITY_CLEARANCE.wheelchair],
  ['walker', nav.MOBILITY_CLEARANCE.walker],
]) {
  const labels = nav.componentLabels(grid, clearance);
  const start = nav.snap(grid, doorIn, { clearance, connected: false });
  const home = labels[cell(start)];
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
      `${room.id} is not reachable from the front doors at ${name} clearance ${clearance} m`,
    );
  }
  for (const l of labels) if (l === home) cells++;
  reach[name] = cells;
}
// The stage, step-free: the ramp rises 1:12 to a landing level with the deck,
// and wheelchair and walker routes from the dance floor reach the deck only
// there (the stage edge is closed elsewhere but at the steps, whose two
// lanes pass walking performers only).
const ramp = model.assets['adhc-stage-ramp'],
  platform = model.assets['adhc-stage-platform'],
  steps = model.assets['adhc-stage-steps'];
const rampRun = ramp.dimensions[2] - ramp.parameters.landing;
check(
  ramp.parameters.rise / rampRun <= 1 / 12 + 1e-9,
  `Stage ramp slope ${ramp.parameters.rise} / ${rampRun.toFixed(2)} is steeper than 1:12`,
);
check(
  Math.abs(ramp.parameters.rise - platform.parameters.deck) < 1e-9 &&
    Math.abs(steps.parameters.rise - platform.parameters.deck) < 1e-9,
  'The ramp and the steps rise to the deck',
);
const stage = rooms.get('adhc-stage'),
  // Above the steps, so a route that could climb them would.
  stagePoint = [2.6, -8.4],
  rampObject = model.objects.find((o) => o.id === 'adhc-stage-ramp'),
  landing = (() => {
    // The landing: the ramp's top `landing` metres (local −z end, rotated).
    const q = objectRect(rampObject),
      half = q.hd - ramp.parameters.landing / 2;
    return {
      ...q,
      x: q.x - half * Math.sin(q.r),
      z: q.z - half * Math.cos(q.r),
      hd: ramp.parameters.landing / 2,
    };
  })(),
  stepRoutes = {};
for (const [name, clearance] of [
  ['wheelchair', nav.MOBILITY_CLEARANCE.wheelchair],
  ['walker', nav.MOBILITY_CLEARANCE.walker],
]) {
  let path = null;
  try {
    path = nav.routeBetween(grid, [0, -3], stagePoint, clearance);
  } catch (e) {
    check(false, `No ${name} route from the dance floor to the stage (${e.message})`);
    continue;
  }
  // Sample the route at 5 cm: where it first steps onto the deck.
  let onto = null;
  for (let i = 1; i < path.length && !onto; i++) {
    const [a, b] = [path[i - 1], path[i]],
      n = Math.max(1, Math.ceil(nav.distance(a, b) / 0.05));
    for (let k = 1; k <= n && !onto; k++) {
      const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
      if (nav.insidePolygon(p, stage.polygon)) onto = { p, prev: [a[0] + ((b[0] - a[0]) * (k - 1)) / n, a[1] + ((b[1] - a[1]) * (k - 1)) / n] };
    }
  }
  check(
    onto && rectDistance(onto.prev, landing) < 0.1,
    `The ${name} route reaches the stage at (${onto?.p.map((v) => v.toFixed(2)).join(', ')}), not from the ramp landing`,
  );
  stepRoutes[name] = nav.pathLength(path);
}
// Walking performers take the steps.
{
  const path = nav.routeBetween(grid, [0, -3], stagePoint, nav.MOBILITY_CLEARANCE.none);
  stepRoutes.none = nav.pathLength(path);
  check(
    stepRoutes.none < stepRoutes.wheelchair - 5,
    `Walking performers do not take the steps (${stepRoutes.none.toFixed(1)} m)`,
  );
}

// --- Assets ------------------------------------------------------------------
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
const adhcKinds = new Set(adhc.ADHC_ASSET_KINDS);
const builtKinds = new Set();
const sizeOf = (o) => new T.Box3().setFromObject(o).getSize(new T.Vector3());
for (const [id, spec] of Object.entries(model.assets)) {
  check(
    typeof spec.name === 'string' && spec.name.length > 2,
    `${id}: give it a human name (inspect cards fall back to it)`,
  );
  const group = assets.buildAsset(spec, resolver());
  let meshes = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (adhcKinds.has(spec.kind))
      check(
        o.castShadow && o.receiveShadow,
        `${id}: a mesh does not cast and receive shadows`,
      );
  });
  check(meshes > 0, `${id}: built no meshes`);
  if (!adhcKinds.has(spec.kind)) continue;
  builtKinds.add(spec.kind);
  check(
    adhc.buildAdhcAsset(spec, resolver()),
    `${id}: buildAdhcAsset does not draw ${spec.kind}`,
  );
  check(meshes >= 3, `${id}: only ${meshes} meshes (fallback box?)`);
  check(
    typeof spec.parameters?.front === 'string',
    `${id}: document the kind's front in parameters.front`,
  );
  const size = sizeOf(group);
  check(
    [size.x, size.y, size.z].every(
      (v, i) => Math.abs(v - spec.dimensions[i]) < 0.005,
    ),
    `${id}: built ${[size.x, size.y, size.z].map((v) => v.toFixed(3)).join(' × ')}, declared ${spec.dimensions.join(' × ')}`,
  );
}
for (const kind of adhcKinds)
  check(builtKinds.has(kind), `No asset in the center uses the ${kind} kind`);
for (const id of used)
  check(
    model.materials[id] || /^#[0-9a-f]{6}$/i.test(id),
    `Material ${id} is used by an asset but not defined`,
  );

// --- Registry ----------------------------------------------------------------
const setting = settings.careSettingById('partner-adc');
const cfg = setting.facility;
assert(cfg && cfg.id === model.id, 'partner-adc stamps this facility');
assert.equal(cfg.url, '/' + FILE.replace(/^public\//, ''));
assert.deepEqual(cfg.levelIds, ['ground']);
assert(
  settings.instanceFacilityUrls().includes(cfg.url),
  'instanceFacilityUrls() ships the center with static builds',
);
const summary = community.instanceSummary(model, cfg);
const site = community.checkInstanceSite(setting, summary);
// The front doors face the drop-off: their centre is the footprint's front.
const toSetting = (p) => settings.toWorld(cfg.frame, p);
const frontZ = Math.max(...summary.footprint.flat().map((p) => p[1]));
const doorAt = toSetting([0, entrance.line]);
check(
  setting.heading === 0 &&
    cfg.frame.heading === 0 &&
    Math.abs(doorAt[1] + 0.1 - frontZ) < 0.11,
  'The front doors face the drop-off (+z on the pad)',
);
const anchorRooms = { hall: 'adhc-hall', stage: 'adhc-stage', ptStand: 'adhc-rehab' };
for (const [name, roomId] of Object.entries(anchorRooms)) {
  const p = setting.anchors[name];
  check(p, `partner-adc has no ${name} anchor`);
  if (!p) continue;
  const local = settings.toLocal(cfg.frame, settings.toLocal(setting, p));
  check(
    nav.insidePolygon(local, rooms.get(roomId).polygon),
    `The ${name} anchor (${local.map((v) => v.toFixed(2)).join(', ')}) is not in ${roomId}`,
  );
}

// --- Cast contract -------------------------------------------------------------
const castText = readFileSync(CAST, 'utf8');
const cast = JSON.parse(castText);
assert.equal(castText, JSON.stringify(cast, null, 2) + '\n', `${CAST}: 2-space JSON`);
assert.equal(cast.setting, 'partner-adc');
assert.equal(cast.facility, model.id);
const CONTRACT = [
  'partner-morning',
  'partner-line-dance',
  'partner-fan-dance',
  'partner-calligraphy',
  'partner-painting',
  'partner-class',
  'partner-group-therapy',
  'partner-bingo',
  'partner-pt',
  'partner-lunch',
  'partner-choir',
  'partner-afternoon',
];
const featured = cast.scenes.filter((s) => s.interaction !== false);
assert.deepEqual(
  featured.map((s) => s.id).sort(),
  [...CONTRACT].sort(),
  'The featured scenes are the contract interactions',
);
assert.deepEqual(
  [...cast.keep.interactions].sort((a, b) => a.localeCompare(b)),
  [...CONTRACT].sort((a, b) => a.localeCompare(b)),
  'keep.interactions',
);
const peopleById = new Map(cast.people.map((p) => [p.id, p]));
for (const id of [
  'visiting-pt',
  'adc-lead',
  'adc-aide',
  'adc-music',
  'adc-rehab-aide',
  'adc-social-worker',
  'adc-reception',
])
  check(peopleById.has(id), `${id} is missing from the cast`);
const participants = cast.people.filter((p) => p.role === 'participant');
check(
  participants.length >= 24 && participants.length <= 32,
  `${participants.length} participants (24–32)`,
);
for (const mobility of ['cane', 'walker', 'wheelchair'])
  check(
    participants.some((p) => p.mobility === mobility),
    `No participant uses a ${mobility}`,
  );
check(
  peopleById.get('visiting-pt')?.visit?.entrance === 'front',
  'The visiting PT comes in through the front',
);
for (const s of featured) {
  check(
    s.window[0] >= 0 && s.window[1] <= 720 && s.window[1] - s.window[0] >= 20,
    `${s.id}: window ${s.window.join('–')} (≥ 20 s inside 0–720)`,
  );
  check(
    s.room && rooms.has(s.room),
    `${s.id}: room ${s.room} is not a room of the center`,
  );
}
const scene = (id) => cast.scenes.find((s) => s.id === id);
const dance = scene('partner-line-dance');
const dancers = dance.slots.filter(
  (s) => s.action === 'dance' && s.who.startsWith('adc-participant-'),
);
check(dancers.length >= 12, `The line dance has ${dancers.length} dancers (≥ 12)`);
check(
  dance.slots.some((s) => s.who === 'adc-lead' && s.action === 'dance'),
  'The activities lead dances at the head of the line dance',
);
const pt = scene('partner-pt');
check(pt.room === 'adhc-rehab', 'partner-pt is in the light rehab');
check(
  pt.slots.some((s) => s.who === 'visiting-pt'),
  'partner-pt has the visiting PT',
);
check(
  pt.window[0] >= 240 && pt.window[0] <= 290 && pt.window[1] >= 330 && pt.window[1] <= 360,
  `partner-pt ${pt.window.join('–')} (about 270–345)`,
);
for (const id of ['partner-pt', 'partner-line-dance']) {
  const w = scene(id).window;
  check(
    Math.min(w[1], 300) - Math.max(w[0], 289) >= 4,
    `${id} ${w.join('–')} must overlap the story chapter 289–300 by ≥ 4 s`,
  );
}
const generated = JSON.parse(
  readFileSync('app/data/community-casts.json', 'utf8'),
).casts['partner-adc'];
assert(generated, 'app/data/community-casts.json has no partner-adc cast: npm run build:community');
assert.deepEqual(
  generated.interactions.map((i) => i.id).sort(),
  [...CONTRACT].sort(),
  'The generated tracks hold the contract interactions (npm run build:community)',
);
assert.deepEqual(
  generated.actors.map((a) => a.id).sort(),
  cast.people.map((p) => p.id).sort(),
  'The generated tracks hold the cast (npm run build:community)',
);

if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  assert.fail(`${problems.length} partner center problem(s); first: ${problems[0]}`);
}
const r1 = (v) => v.toFixed(1);
console.log(
  `Partner ADHC: ${FILE} valid (${(bytes / 1024).toFixed(1)} kB): ${r1(gross)} m² gross (${Math.round((100 * gross) / mainGround)} % of the main center's ground floor), ` +
    `${model.rooms.length} rooms (${model.rooms.map((r) => `${r.id.replace(/^adhc-/, '')} ${r1(roomArea[r.id])}`).join(', ')} m²), ` +
    `${gaps.length} door gaps passed straight through at wheelchair clearance, ${floorItems.length} floor items and ${stacked.length} on the stage without overlaps. ` +
    `Turning circles clear (${circleReport.join(', ')}); every room reachable from the front doors (${reach.wheelchair} cells at wheelchair, ${reach.walker} at walker clearance); ` +
    `the stage step-free by the 1:12 ramp (dance floor to the deck above the steps ${r1(stepRoutes.wheelchair)} m at wheelchair, ${r1(stepRoutes.walker)} m at walker clearance; ${r1(stepRoutes.none)} m up the steps on foot). ` +
    `${Object.keys(model.assets).length} assets named and built; ADHC kinds at their declared size: ${[...builtKinds].join(', ')}; ${used.size} materials, all defined.\n` +
    `Registry: pad ${site.pad.w} × ${site.pad.d} m, paving ≥ ${site.pavingClearance} m from the building; front doors face the drop-off; anchors ${Object.keys(anchorRooms).join(', ')} in their rooms.\n` +
    `Cast: ${cast.people.length} people (${participants.length} participants), ${featured.length} contract interactions, line dance ${dancers.length} dancers + lead, partner-pt ${pt.window.join('–')} s.`,
);
