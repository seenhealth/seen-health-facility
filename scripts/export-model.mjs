// Headless geometry/export integration for the Alhambra model (or the model
// path given), writing public/models/<id>.glb.
//
//   node scripts/export-model.mjs [model.json] [--out dir]
//
// The renderer runs in Node through the headless harness in
// validate-renderer.mjs (Rolldown bundle of app/model/renderer.ts, DOM and
// WebGL stand-ins); @napi-rs/canvas (or FACILITY_CANVAS_MODULE) supplies real
// texture pixels for the GLB.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as T from 'three';
import {
  exportArguments,
  loadCanvasModule,
  loadHeadlessViewer,
} from './validate-renderer.mjs';
const { modelPath, outDir } = exportArguments();
const m = JSON.parse(readFileSync(modelPath, 'utf8'));
const headless = await loadHeadlessViewer({ canvas: await loadCanvasModule() });
const { createViewer, defaultState } = headless.renderer;
mkdirSync('work/validation', { recursive: true });
mkdirSync(outDir, { recursive: true });
const dayProgram = JSON.parse(
  readFileSync('app/data/day-program.json', 'utf8'),
);
const api = createViewer(headless.host(1400, 950), m, () => {});
const scene = headless.scene;
assert.equal(
  scene.getObjectByName('exterior-envelope').visible,
  true,
  'Opens with the assembled building',
);
api.update({ ...defaultState, plan: true });
// Plan view lays the source drawing over the ground floor only when the model
// carries it; the published models omit the private plan image, so plan view
// then keeps the 3D furniture and walls.
const overlay = !!m.site.image,
  clinicWalls = scene.getObjectByName('clinic').getObjectByName('walls');
assert.equal(
  scene.getObjectByName('clinic').getObjectByName('furniture').visible,
  !overlay,
  overlay
    ? 'Source overlay does not double-render furniture'
    : 'Plan view without a source image keeps the furniture',
);
assert.ok(
  overlay
    ? clinicWalls.children.every((w) => !w.visible)
    : clinicWalls.children.some((w) => w.visible),
  overlay
    ? 'Source overlay retains exact unobstructed wall strokes'
    : 'Plan view without a source image keeps the walls',
);
api.update(defaultState);
assert.equal(
  scene.getObjectByName('clinic').getObjectByName('furniture').visible,
  true,
  'Leaving the overlay restores the 3D configuration',
);
api.update({ ...defaultState, level: 'all', stack: 1, roof: true });
headless.tick(100);
assert.equal(scene.getObjectByName('basement').visible, true);
assert.ok(scene.getObjectByName('upper-office').position.y > 18);
assert.equal(scene.getObjectByName('site-context').visible, false);
api.update({
  ...defaultState,
  level: 'ground',
  exterior: false,
  roof: false,
  walls: 'cutaway',
  selected: 'clinic',
  room: 'clinic-exam-01',
  isolate: true,
});
headless.tick();
assert.equal(scene.getObjectByName('rehab').visible, false);
api.update({ ...defaultState, level: 'upper' });
assert.equal(scene.getObjectByName('mezzanine').visible, true);
assert.equal(scene.getObjectByName('clinic').visible, false);
api.update({ ...defaultState, level: 'roof', roof: true, exterior: true });
assert.equal(scene.getObjectByName('roof').visible, true);
if (m.envelope) {
  const facade = scene.getObjectByName('exterior-envelope');
  scene.updateMatrixWorld(true);
  // A ray normal to every facade strip must hit enclosure at several elevations,
  // including opening panels. This catches unmodeled rear/side spans.
  // Operable openings are left open by design (the rear service doorways the
  // delivery people walk through, envelope.ts).
  for (const w of m.envelope.walls) {
    const group = facade.getObjectByName(w.id),
      len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    assert.ok(group, `Perimeter ${w.id} rendered`);
    const doorway = (along, y) =>
      w.openings.some(
        (o) =>
          o.operable &&
          along > o.offset &&
          along < o.offset + o.width &&
          y > o.sill &&
          y < o.sill + o.height,
      );
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9])
      for (const y of [0.3, 1.5, 3, w.height - 0.12]) {
        if (doorway(t * len, y)) continue;
        const local = new T.Vector3(t * len, y, 0.6),
          start = group.localToWorld(local),
          direction = new T.Vector3(0, 0, -1).transformDirection(
            group.matrixWorld,
          );
        const ray = new T.Raycaster(start, direction, 0, 1.2);
        assert.ok(
          ray.intersectObject(group, true).length ||
            ray.intersectObject(
              scene.getObjectByName('accessible-main-entrance'),
              true,
            ).length,
          `${w.id} is closed at ${t}, ${y}m`,
        );
      }
  }
  api.update({ ...defaultState, sectionAxis: 'z', section: 0.5 });
  const sample = facade
    .getObjectByName('shell-clinic-east')
    .children.find((c) => c.isMesh);
  assert.equal(
    sample.material.clippingPlanes.length,
    1,
    'Section cuts the building',
  );
  assert.ok(
    scene
      .getObjectByName('site-context')
      .children.every((o) => !o.isMesh || !o.material.clippingPlanes?.length),
    'Section preserves site context',
  );
  const plane = sample.material.clippingPlanes[0];
  assert.ok(
    plane.distanceToPoint(new T.Vector3(0, 1, 100)) < 0 &&
      plane.distanceToPoint(new T.Vector3(0, 1, -100)) > 0,
    'Front-to-back section direction',
  );
  api.update({
    ...defaultState,
    level: 'ground',
    exterior: false,
    roof: false,
    walls: 'cutaway',
  });
  assert.equal(
    sample.material.clippingPlanes,
    null,
    'Leaving section clears clipping',
  );
  assert.equal(
    scene.getObjectByName('shell-clinic-east-cutaway').visible,
    true,
    'Rear/side shell remains present in cutaway',
  );
}
api.activity.setOptions({ enabled: false });
const journeys = JSON.parse(
  readFileSync('public/models/care-journeys.json', 'utf8'),
);
let journeySteps = 0;
for (const journey of journeys.journeys) {
  assert.ok(journey.steps.length > 1, `${journey.id} has playable steps`);
  assert.equal(
    new Set(journey.steps.map((s) => s.id)).size,
    journey.steps.length,
  );
  for (const step of journey.steps) {
    const zone = m.zones.find((z) => z.id === step.zoneId);
    const room = m.rooms.find((r) => r.id === step.roomId);
    if (step.zoneId)
      assert.ok(zone, `${journey.id}/${step.id} binds a real zone`);
    if (step.roomId) {
      assert.ok(room, `${journey.id}/${step.id} binds a real room`);
      assert.equal(room.zoneId, zone.id, 'Room belongs to focused zone');
    }
    api.update({
      ...defaultState,
      level: zone?.levelId || 'all',
      selected: zone?.id || null,
      room: step.roomId || null,
      roof: !zone,
      exterior: !zone,
      ceilings: false,
      walls: zone ? 'cutaway' : 'full',
      stack: 0,
      explode: 0,
    });
    headless.tick(100);
    let expected;
    if (step.scene === 'transport') {
      const bounds = new T.Box3();
      scene.updateMatrixWorld(true);
      for (const id of ['fleet-van-a', 'fleet-van-b']) {
        const van = scene.getObjectByName(id);
        assert.ok(van, 'Fleet journey references a rendered van');
        assert.ok(
          van.visible && van.parent.visible,
          'Fleet is visible for its journey',
        );
        bounds.union(new T.Box3().setFromObject(van));
      }
      expected = bounds.getCenter(new T.Vector3());
      api.focusSiteObjects(['fleet-van-a', 'fleet-van-b'], true);
    } else {
      if (!zone) {
        // The whole-site framing depends on the exterior style: the animated
        // focus settles on it, and the instant focus must land there at once.
        api.focus(null);
        headless.tick(200);
        expected = new T.Vector3(...api.getShot().target);
        api.setShot({
          target: [20, 0, 20],
          zoom: 2,
          azimuth: 0.5,
          elevation: 0.6,
        });
      }
      api.focus(step.zoneId, step.roomId, true);
      if (zone) {
        const points = room?.polygon || zone.polygon;
        expected = new T.Vector3(
          points.reduce((sum, p) => sum + p[0], 0) / points.length,
          0,
          points.reduce((sum, p) => sum + p[1], 0) / points.length,
        ).add(scene.getObjectByName(zone.id).position);
        assert.ok(
          scene.getObjectByName(zone.id).visible,
          'Journey level is visible',
        );
      }
    }
    assert.ok(
      new T.Vector3(...api.getShot().target).distanceTo(expected) < 0.02,
      `${journey.id}/${step.id} focuses its scene immediately for reduced motion`,
    );
    assert.ok(
      [...headless.camera.position.toArray(), headless.camera.zoom].every(
        Number.isFinite,
      ),
    );
    journeySteps++;
  }
}
console.log(
  `Validated ${journeys.journeys.length} journeys and ${journeySteps} room/fleet camera targets.`,
);
api.update({
  ...defaultState,
  walls: 'hidden',
  furniture: false,
  explode: 1,
  level: 'all',
  stack: 1,
  sectionAxis: 'x',
  section: 0.8,
});
const blob = await api.exportGLB();
const buffer = Buffer.from(await blob.arrayBuffer());
assert.equal(buffer.readUInt32LE(0), 0x46546c67);
const jsonLength = buffer.readUInt32LE(12),
  gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
for (const id of [
  'clinic',
  'basement',
  'upper-office',
  'mezzanine',
  'roof',
  'site-context',
  m.objects[0].id,
])
  assert.ok(
    gltf.nodes.some((n) => n.name === id),
    `Export retains ${id}`,
  );
for (const w of m.envelope?.walls || [])
  assert.ok(
    gltf.nodes.some((n) => n.name === w.id),
    `Export retains complete ${w.id} despite active section`,
  );
const upperNode = gltf.nodes.find((n) => n.name === 'upper-office');
assert.equal(
  upperNode.translation?.[1] ?? upperNode.matrix?.[13] ?? 0,
  3.35,
  'Export strips presentation level separation',
);
const objectCount = m.objects.filter((o) =>
  gltf.nodes.some((n) => n.name === o.id),
).length;
assert.equal(
  objectCount,
  m.objects.length - dayProgram.removedObjectIds.length,
  'All active-layout IDs survive GLB export; explicitly cleared tables stay removed',
);
writeFileSync(`${outDir}/${m.id}.glb`, buffer);
writeFileSync(
  'work/validation/export-check.json',
  JSON.stringify(
    {
      bytes: buffer.length,
      nodes: gltf.nodes.length,
      meshes: gltf.meshes.length,
      retainedObjects: objectCount,
      zones: m.zones.length,
      rooms: m.rooms.length,
      textures: gltf.textures?.length || 0,
      checks: [
        'real SI asset dimensions',
        'level visibility',
        'level stacking',
        'area isolation',
        'canonical full-geometry export independent of hidden/exploded UI',
        'all active-layout object IDs retained; original furniture remains in source catalog',
      ],
    },
    null,
    2,
  ),
);
api.dispose();
console.log(
  `Exported valid GLB: ${(buffer.length / 1024 / 1024).toFixed(2)} MB, ${gltf.nodes.length} nodes, ${objectCount} stable furniture/site-object IDs. Level/isolation/export integration checks passed.`,
);
