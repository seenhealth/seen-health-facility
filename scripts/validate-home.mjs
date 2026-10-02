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
//
// The home-wong registry entry stands the house on its pad: the front door
// within 0.3 m of the `door` anchor, the front wall on the porch slab's back
// edge, the footprint ≥ 0.1 m from the porch slab and ramp and ≥ 1 m from the
// drive, each room name readable on its plate at the label anchor, and the
// derived pad within the authored size. The ADL cast (app/data/community/
// home-wong.cast.json) keeps today's actor ids and the contract windows, puts
// every stop in a drawn room clear of furniture and walls, and routes every
// walk on the instance grid at the person's clearance in the time the gaps
// allow; the tracks generated from it (app/data/community-casts.json, `npm run
// build:community`) keep people at least 0.6 m apart on foot (0.55 m when one
// sits).
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';

const FILE = process.argv[2] || 'public/models/seen-home-wong.json';
const CAST = 'app/data/community/home-wong.cast.json';
const {
  schema,
  nav,
  assets,
  home,
  settings,
  pads,
  layout,
  scenario,
  people,
  roomLabels,
} = await loadSim(
  {
    schema: 'app/model/schema.ts',
    nav: 'app/sim/nav.ts',
    assets: 'app/model/assets.ts',
    home: 'app/model/home-assets.ts',
    settings: 'app/model/community-settings.ts',
    pads: 'app/model/community-pads.ts',
    layout: 'app/model/site-activity-data.ts',
    scenario: 'app/sim/scenario.ts',
    people: 'app/model/community-people.ts',
    roomLabels: 'app/model/room-labels.ts',
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

// --- Registry: where the home stands on its pad (SPEC-facility-instance §11) --
const setting = settings.careSettingById('home-wong');
const cfg = setting.facility;
assert(
  cfg && cfg.id === model.id,
  'home-wong registry entry names this facility',
);
assert.equal(cfg.url, '/' + FILE.replace(/^public\//, ''));
assert.deepEqual(cfg.levelIds, ['ground']);
assert.equal(cfg.floorY, settings.PORCH_Y, 'Floor at porch level');
// Facility-local → setting-local (cfg.frame), and world → facility-local.
const toSetting = (p) => settings.toWorld(cfg.frame, p);
const worldFrame = {
  position: settings.toWorld(setting, cfg.frame.position),
  heading: setting.heading + cfg.frame.heading,
};
const fromWorld = (p) => settings.toLocal(worldFrame, p);
const frontDoor = model.doorSchedule.find((d) => d.id === 'home-door-front');
const frontWall = model.walls.find((w) => w.id === 'home-wall-front-a');
const doorCentre = [frontWall.a[0], (frontDoor.gap[0] + frontDoor.gap[1]) / 2];
const doorAnchor = settings.toLocal(setting, setting.anchors.door);
const doorOffset = nav.distance(toSetting(doorCentre), doorAnchor);
check(
  doorOffset <= 0.3,
  `Front door opening is ${doorOffset.toFixed(2)} m from the door anchor (≤ 0.3 m)`,
);
const porchBack = pads.HOME_PORCH.z - pads.HOME_PORCH.d / 2;
const wallFace = toSetting([frontWall.a[0] + frontWall.thickness / 2, 0])[1];
check(
  Math.abs(wallFace - porchBack) < 0.01,
  `Front wall face at local z ${wallFace.toFixed(3)}, porch back edge at ${porchBack}`,
);
// The drawn footprint (zones not excluded) clears the porch slab and ramp.
const excluded = new Set(cfg.excludeZoneIds ?? []);
const footprint = model.zones
  .filter((z) => !excluded.has(z.id))
  .map((z) => z.polygon.map(toSetting));
const box2 = (cx, cz, w, d) => [
  [cx - w / 2, cz - d / 2],
  [cx + w / 2, cz - d / 2],
  [cx + w / 2, cz + d / 2],
  [cx - w / 2, cz + d / 2],
];
const rampFoot = settings.toLocal(setting, setting.anchors.rampFoot),
  rampTop = settings.toLocal(setting, setting.anchors.rampTop);
const porchParts = {
  'porch slab': box2(
    pads.HOME_PORCH.x,
    pads.HOME_PORCH.z,
    pads.HOME_PORCH.w,
    pads.HOME_PORCH.d,
  ),
  ramp: box2(
    (rampFoot[0] + rampTop[0]) / 2,
    rampFoot[1],
    Math.abs(rampFoot[0] - rampTop[0]),
    1.2,
  ),
};
const polygonGap = (a, b) => {
  if (
    a.some((v) => nav.insidePolygon(v, b)) ||
    b.some((v) => nav.insidePolygon(v, a))
  )
    return -1;
  const edges = (p) => p.map((v, i) => [v, p[(i + 1) % p.length]]);
  let m = Infinity;
  for (const [p, q] of edges(a))
    for (const [u, v] of edges(b))
      m = Math.min(
        m,
        nav.distanceToSegment(p, u, v),
        nav.distanceToSegment(q, u, v),
        nav.distanceToSegment(u, p, q),
        nav.distanceToSegment(v, p, q),
      );
  return m;
};
const porchGaps = {};
for (const [name, poly] of Object.entries(porchParts)) {
  porchGaps[name] = Math.min(...footprint.map((f) => polygonGap(f, poly)));
  check(
    porchGaps[name] >= 0.1 - 1e-9,
    `Footprint is ${porchGaps[name].toFixed(2)} m from the ${name} (≥ 0.1 m)`,
  );
}
// The building stays ≥ 1 m from the drive band and apron (edges every 0.1 m),
// as the chassis checks it when it stamps the instance.
const edgeSamples = (poly, step) =>
  poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length],
      n = Math.max(1, Math.ceil(nav.distance(a, b) / step));
    return Array.from({ length: n }, (_, k) => [
      a[0] + ((b[0] - a[0]) * k) / n,
      a[1] + ((b[1] - a[1]) * k) / n,
    ]);
  });
const pavingClearance = (p, max) => {
  for (let r = 0; r <= max + 1e-9; r += 0.05)
    for (let k = 0; k < (r ? 24 : 1); k++) {
      const a = (k / 24) * Math.PI * 2,
        q = [p[0] + Math.sin(a) * r, p[1] + Math.cos(a) * r];
      if (settings.isPaved(setting, settings.toWorld(setting, q))) return r;
    }
  return Infinity;
};
const paving = Math.min(
  ...footprint.flatMap((poly) =>
    edgeSamples(poly, 0.1).map((p) => pavingClearance(p, 3)),
  ),
);
check(
  paving >= 1,
  `The building is ${paving.toFixed(2)} m from the drive (≥ 1 m)`,
);
// Room name plates: the instance lays a world-aligned 3.6 × 0.7 m plate at
// each labelled room's label anchor (no spot in a home's rooms fits a whole
// plate), the name centred on it at up to 54 px of its 512 px canvas. The
// name must read from above: its strip lies in the room, clear of everything
// standing on the floor (full footprints: a shower tray hides it as well as a
// bed does).
const PLATE = { w: 3.6, d: 0.7 },
  plateTurn = setting.heading + cfg.frame.heading;
const plateCovers = model.objects
  .filter((o) => o.position[1] <= 0.25)
  .map((o) => {
    const a = model.assets[o.assetId];
    return {
      o,
      w: a.dimensions[0] * (o.scale?.[0] ?? 1),
      d: a.dimensions[2] * (o.scale?.[2] ?? 1),
    };
  });
const coveredBy = (p) =>
  plateCovers.find(({ o, w, d }) => {
    const dx = p[0] - o.position[0],
      dz = p[1] - o.position[2],
      x = Math.cos(o.rotation) * dx - Math.sin(o.rotation) * dz,
      z = Math.sin(o.rotation) * dx + Math.cos(o.rotation) * dz;
    return Math.abs(x) < w / 2 + 0.05 && Math.abs(z) < d / 2 + 0.05;
  });
const nameClear = (room, name) => {
  const anchor = roomLabels.roomLabelAnchor(room),
    c = Math.cos(plateTurn),
    s = Math.sin(plateTurn),
    // Bold Arial averages about 0.6 em a character; the canvas shrinks a
    // longer name to 464 px.
    textW = (Math.min(464, 0.6 * 54 * name.length) / 512) * PLATE.w,
    hiders = new Set();
  let clear = 0,
    all = 0;
  for (let i = 0; i <= 16; i++)
    for (let j = 0; j <= 2; j++) {
      const wx = (i / 16 - 0.5) * textW,
        wz = (j / 2 - 0.5) * 0.3,
        p = [anchor[0] + wx * c - wz * s, anchor[1] + wx * s + wz * c],
        by = coveredBy(p);
      all++;
      if (by) hiders.add(by.o.id);
      else if (nav.insidePolygon(p, room.polygon)) clear++;
    }
  return { clear: clear / all, hiders: [...hiders] };
};
const plates = Object.entries(
  typeof cfg.labels === 'object' ? cfg.labels : {},
).map(([id, name]) => {
  const room = model.rooms.find((r) => r.id === id);
  assert(room, `Plate for ${id}, which is not a room`);
  const { clear, hiders } = nameClear(room, name);
  check(
    clear >= 0.9,
    `The "${name}" plate in ${id} reads ${Math.round(clear * 100)} % clear at its anchor (≥ 90 %; under ${hiders.join(', ') || 'the walls'})`,
  );
  return `${name} ${Math.round(clear * 100)} %`;
});
// Pad derivation preview (SPEC-facility-instance §5.2): the front stays put.
const margin = cfg.margin ?? 1.6;
const fx = footprint.flat().map((p) => p[0]),
  fz = footprint.flat().map((p) => p[1]);
const need = {
  w: 2 * (Math.max(...fx.map(Math.abs)) + margin),
  back: Math.max(0, -Math.min(...fz) + margin - setting.pad.d / 2),
};
check(
  Math.max(...fz) + margin <= setting.pad.d / 2,
  `Footprint reaches ${Math.max(...fz).toFixed(2)} m, past the pad's front edge`,
);
check(need.w <= setting.pad.w, `Footprint needs a ${need.w.toFixed(1)} m pad`);
check(
  need.back <= (setting.pad.back ?? 0) + 1e-9,
  `Footprint needs pad.back ${need.back.toFixed(2)} m; authored ${setting.pad.back ?? 0}`,
);

// --- Cast: the ADL day inside the home -----------------------------------------
const castText = readFileSync(CAST, 'utf8');
const cast = JSON.parse(castText);
assert.equal(
  castText,
  JSON.stringify(cast, null, 2) + '\n',
  `${CAST}: 2-space JSON`,
);
assert.equal(cast.setting, 'home-wong');
assert.equal(cast.facility, model.id);
// The instance view: excluded zones (with their rooms, walls and objects) and
// objects removed, layers defaulted, as the build-time generator sees it.
const removedIds = new Set(cfg.excludeObjectIds ?? []);
const view = {
  ...model,
  zones: model.zones.filter((z) => !excluded.has(z.id)),
  rooms: model.rooms.filter((r) => !excluded.has(r.zoneId)),
  walls: model.walls.filter((w) => !excluded.has(w.zoneId)),
  objects: model.objects
    .filter((o) => !excluded.has(o.zoneId) && !removedIds.has(o.id))
    .map((o) => ({ ...o, layer: o.layer || 'furniture' })),
};
const instanceGrid = nav.navGrid(view, {
  levelId: 'ground',
  removedObjectIds: cfg.excludeObjectIds ?? [],
  reservations: [],
  excludeZoneIds: cfg.excludeZoneIds ?? [],
  blockVerticalCirculation: true,
});
const viewRooms = new Map(view.rooms.map((r) => [r.id, r]));
const placement = new Map(
  view.rooms.map((r) => [r.id, layout.roomPlacement(view, r)]),
);
const DOOR = fromWorld(setting.anchors.door);
const ACTIONS = new Set([
  'idle',
  'consult',
  'treat',
  'seated',
  'tabletop',
  'document',
  'serve',
  'greet',
  'conversation',
  'device',
  'write',
  'craft',
  'listen',
  'phone',
]);
const SEATS = new Set([
  'upholstered-chair',
  'chair',
  'bench',
  'lounge-chair',
  'mesh-chair',
  'task-chair',
]);
const LIMIT = { walker: 1.15, wheelchair: 1.45, none: 1.6 };
const alhambra = JSON.parse(
  readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
);
const communityIds = new Set(
  people.communitySource(alhambra).actors.map((a) => a.id),
);
const categories = new Set(settings.COMMUNITY_CATEGORIES.map(([id]) => id));
const interactions = new Map();
const routes = new Map();
const routeOf = (a, b, clearance) => {
  const key = JSON.stringify([a, b, clearance]);
  if (!routes.has(key)) {
    let path = null,
      error = '';
    try {
      path = scenario.walkBetween(
        instanceGrid,
        { anchor: a, approach: [] },
        { anchor: b, approach: [] },
        clearance,
      );
    } catch (e) {
      error = e.message;
    }
    routes.set(key, {
      path,
      error,
      length: path ? nav.pathLength(path) : Infinity,
    });
  }
  return routes.get(key);
};
let walks = 0,
  fastest = { ratio: 0, text: '' };
for (const person of cast.people) {
  const who = person.id,
    mobility = person.mobility ?? 'none',
    clearance = nav.MOBILITY_CLEARANCE[mobility],
    gait = person.gait;
  check(
    communityIds.has(who),
    `${who}: not an actor of today's community cast`,
  );
  check(
    gait > 0 && gait <= LIMIT[mobility],
    `${who}: gait ${gait} m/s outside (0, ${LIMIT[mobility]}]`,
  );
  // Places in time order: the stops, plus the front door at each pass. An
  // arrival at a point is a resident already there (out of sight for a
  // moment so the loop seam is hidden); leaving at 720 s is staying in.
  const places = [];
  const door = (t, out) =>
    places.push({ start: t, end: t, p: DOOR, door: true, out });
  if (person.arrive?.anchor === 'door') door(person.arrive.t, false);
  else if (person.arrive)
    check(
      nav.distance(person.arrive.anchor, places[0]?.p ?? person.stops[0].at) <
        1e-6 && person.arrive.t <= 0.5,
      `${who}: arrives at a point other than the first stop`,
    );
  for (const s of person.stops) {
    const tag = `${who} ${s.window.join('–')}`,
      room = viewRooms.get(s.roomId);
    check(room, `${tag}: ${s.roomId} is not a drawn room of the instance`);
    check(
      ACTIONS.has(s.action),
      `${tag}: ${s.action} is not a stationary action`,
    );
    check(typeof s.title === 'string' && s.title.length > 3, `${tag}: title`);
    check(
      s.window[0] < s.window[1] && s.window[0] >= 0 && s.window[1] <= 720,
      `${tag}: window`,
    );
    let p, heading, seatId;
    if (typeof s.at === 'string') {
      const o = view.objects.find((x) => x.id === s.at);
      check(
        o && SEATS.has(view.assets[o.assetId].kind) && s.seated,
        `${tag}: ${s.at} is not a chair-type seat`,
      );
      if (!o) continue;
      const pose = scenario.seatPose(view, s.at);
      [p, heading, seatId] = [pose.anchor, s.heading ?? pose.heading, s.at];
    } else {
      check(typeof s.heading === 'number', `${tag}: a point needs a heading`);
      [p, heading, seatId] = [s.at, s.heading, s.seat];
      if (s.seat)
        check(
          s.seated && view.objects.some((x) => x.id === s.seat),
          `${tag}: seat ${s.seat}`,
        );
    }
    if (room)
      check(
        nav.insidePolygon(p, room.polygon),
        `${tag}: (${p.join(', ')}) outside ${s.roomId}`,
      );
    places.push({
      start: s.window[0],
      end: s.window[1],
      p,
      heading,
      seated: !!s.seated,
      seatId,
      room,
    });
    for (const id of s.with ?? [])
      check(
        communityIds.has(id),
        `${tag}: with ${id} is not a community actor`,
      );
    if (s.interaction) {
      const i = s.interaction;
      check(!interactions.has(i.id), `Interaction ${i.id} defined twice`);
      interactions.set(i.id, {
        ...i,
        window: i.window ?? s.window,
        actorIds: [who, ...(s.with ?? [])],
      });
    }
  }
  for (const [t0, t1] of person.away ?? []) {
    door(t0, true);
    door(t1, false);
  }
  if (person.leave && person.leave.t < 720) door(person.leave.t, true);
  places.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < places.length; i++) {
    const a = places[i - 1],
      b = places[i];
    check(
      b.start >= a.end - 1e-9,
      `${who}: ${a.end} overlaps the next place at ${b.start}`,
    );
    if ((a.door && a.out && b.door && !b.out) || nav.distance(a.p, b.p) < 1e-6)
      continue;
    const r = routeOf(a.p, b.p, clearance),
      span = b.start - a.end;
    walks++;
    check(r.path, `${who} ${a.end}→${b.start}: no walk (${r.error})`);
    if (!r.path) continue;
    const needs = r.length / gait;
    check(
      needs <= span + 1e-6,
      `${who} ${a.end}→${b.start}: ${r.length.toFixed(2)} m needs ${needs.toFixed(1)} s at ${gait} m/s; the gap is ${span.toFixed(1)} s`,
    );
    const ratio = r.length / Math.max(span, 1e-6) / LIMIT[mobility];
    if (ratio > fastest.ratio)
      fastest = {
        ratio,
        text: `${who} ${r.length.toFixed(1)} m in ${span.toFixed(1)} s`,
      };
  }
  // Poses clear of furniture and walls (SPEC-facility-instance §10.3–10.4).
  for (const pl of places) {
    if (pl.door || !pl.room) continue;
    check(
      placement.get(pl.room.id).clear(pl.p, pl.seated ? 0.19 : 0.28, pl.seatId),
      `${who} ${pl.start}–${pl.end}: (${pl.p.join(', ')}) too close to furniture or a wall in ${pl.room.id}`,
    );
    const wall = nav.wallClearanceAt(instanceGrid, pl.p);
    check(wall >= 0.15, `${who} ${pl.start}: ${wall.toFixed(2)} m from a wall`);
  }
  check(person.arrive && person.leave, `${who}: arrive and leave`);
  if (person.arrive && person.arrive.anchor !== 'door')
    check(
      places[0].start === person.arrive.t && !places[0].door,
      `${who}: in sight from ${person.arrive.t} s, so the day starts at a stop`,
    );
  if (person.leave?.t === 720)
    check(
      places.at(-1).end === 720,
      `${who}: present at 720 s, so the last stop ends at 720 s`,
    );
}
// Contract windows (story cutaways and the touchpoint trace).
for (const [id, w] of Object.entries({
  'home-health-visit': [683.5, 700],
  'after-hours-call': [690, 708],
}))
  check(
    interactions.get(id)?.window.join() === w.join(),
    `${id}: window must stay ${w.join('–')}`,
  );
const care = interactions.get('home-personal-care')?.window ?? [0, 0];
check(
  care[0] <= 34 && care[1] >= 42 && care[0] >= 26 && care[1] <= 80.5,
  `home-personal-care ${care.join('–')} must cover the story cutaway 34–42 (≈ 30–72)`,
);
for (const i of interactions.values()) {
  check(categories.has(i.category), `${i.id}: category ${i.category}`);
  check(
    i.window[0] < i.window[1] && i.window[0] >= 0 && i.window[1] <= 720,
    `${i.id}: window ${i.window.join('–')}`,
  );
  check(i.label && i.description, `${i.id}: label and description`);
}
// Contacts on the generated tracks (setting-local; walks at constant speed
// along their paths), every 0.25 s.
const generated = JSON.parse(
  readFileSync('app/data/community-casts.json', 'utf8'),
).casts['home-wong'];
assert(
  generated,
  'app/data/community-casts.json has no home-wong cast: npm run build:community',
);
const along = (path, f) => {
  const lengths = path.slice(1).map((q, i) => nav.distance(path[i], q)),
    total = lengths.reduce((n, l) => n + l, 0);
  let d = f * total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i])
      return [
        path[i][0] +
          ((path[i + 1][0] - path[i][0]) * d) / Math.max(lengths[i], 1e-9),
        path[i][1] +
          ((path[i + 1][1] - path[i][1]) * d) / Math.max(lengths[i], 1e-9),
      ];
    d -= lengths[i];
  }
  return path.at(-1);
};
const positionAt = (actor, t) => {
  const seg = actor.segments.find((x) => x.start <= t && t < x.end);
  if (!seg || seg.visible === false) return null;
  return {
    p: along(seg.path, (t - seg.start) / (seg.end - seg.start)),
    seated: !!seg.seated,
  };
};
let nearest = { d: Infinity, text: '' };
for (let t = 0; t < 720; t += 0.25)
  for (let i = 0; i < generated.actors.length; i++) {
    const a = positionAt(generated.actors[i], t);
    if (!a) continue;
    for (let j = i + 1; j < generated.actors.length; j++) {
      const b = positionAt(generated.actors[j], t);
      if (!b) continue;
      const d = nav.distance(a.p, b.p),
        min = a.seated || b.seated ? 0.55 : 0.6,
        pair = `${generated.actors[i].id} and ${generated.actors[j].id}`;
      if (d < nearest.d) nearest = { d, text: `${pair} at ${t} s` };
      check(d >= min, `${pair} are ${d.toFixed(2)} m apart at ${t} s`);
    }
  }

if (problems.length) {
  console.error(
    problems.slice(0, Number(process.env.HOME_PROBLEMS || 40)).join('\n'),
  );
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
    `${Object.keys(model.assets).length} assets build; home kinds ${[...builtKinds].join(', ')} at their declared size; ${used.size} materials, all defined.\n` +
    `Registry: front door ${doorOffset.toFixed(2)} m from the door anchor, front wall on the porch's back edge, footprint ${porchGaps['porch slab'].toFixed(2)} m from the porch slab and ${porchGaps.ramp.toFixed(2)} m from the ramp, ${Number.isFinite(paving) ? paving.toFixed(2) + ' m' : 'over 3 m'} from the drive; plates clear ${plates.join(', ')}; derived pad ${need.w.toFixed(1)} m wide with back ${need.back.toFixed(2)} m (authored ${setting.pad.back}).\n` +
    `Cast: ${cast.people.length} people, ${cast.people.reduce((n, p) => n + p.stops.length, 0)} stops, ${walks} walks routed at each person's clearance (fastest ${fastest.text}, ${(fastest.ratio * 100).toFixed(0)} % of its limit), ${interactions.size} interactions; generated tracks: nearest pair ${nearest.d.toFixed(2)} m (${nearest.text}).`,
);
