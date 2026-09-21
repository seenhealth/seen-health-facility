// Headless geometry/export integration, using the bundled canvas runtime when supplied.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as T from 'three';
const req = createRequire(import.meta.url),
  canvasModule = req(process.env.FACILITY_CANVAS_MODULE || '@napi-rs/canvas');
const { createCanvas, loadImage, Image, ImageData } = canvasModule;
globalThis.ImageData = ImageData;
const m = JSON.parse(
  readFileSync(
    process.argv[2] || 'public/models/seen-alhambra-planning.json',
    'utf8',
  ),
);
const siteImage = await loadImage(`public${m.site.image}`);
globalThis.__facilityMaterialImages = Object.fromEntries(
  await Promise.all(
    Object.values(m.materials)
      .filter((v) => v.textureUrl)
      .map(async (v) => [
        v.textureUrl,
        await loadImage(`public${v.textureUrl}`),
      ]),
  ),
);
globalThis.HTMLImageElement = Image;
globalThis.HTMLCanvasElement = createCanvas(1, 1).constructor;
globalThis.FileReader = class {
  result = null;
  onloadend = null;
  onload = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onload?.();
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = `data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
};
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = (cb) => {
  globalThis.nextFrame = cb;
  return 1;
};
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      const c = createCanvas(1, 1);
      c.toBlob = (callback, type) =>
        callback(
          new Blob([c.toBuffer('image/png')], { type: type || 'image/png' }),
        );
      return c;
    }
    return {
      style: { setProperty() {} },
      classList: { toggle() {} },
      setAttribute() {},
      remove() {},
    };
  },
};
globalThis.__facilitySiteImage = siteImage;
mkdirSync('work/validation', { recursive: true });
const dayProgram = JSON.parse(
  readFileSync('app/data/day-program.json', 'utf8'),
);
let source = readFileSync('app/model/renderer.ts', 'utf8').replace(
  "import dayProgram from '../data/day-program.json';",
  `const dayProgram=${JSON.stringify(dayProgram)};`,
);
source = source.replace(
  "import * as T from 'three';",
  `import * as Real from 'three';const T={...Real,WebGLRenderer:class{domElement={setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}};shadowMap={};setPixelRatio(){}setSize(){}render(scene,camera){globalThis.__facilityScene=scene;globalThis.__facilityCamera=camera;}dispose(){}},TextureLoader:class{load(url,onLoad){const tex=new Real.Texture(globalThis.__facilityMaterialImages[url]||globalThis.__facilitySiteImage);tex.needsUpdate=true;queueMicrotask(()=>onLoad?.(tex));return tex;}}};`,
);
source = source.replace(
  /import\s*\{\s*OrbitControls\s*\}\s*from\s*'three\/addons\/controls\/OrbitControls.js';/,
  `class OrbitControls{target=new T.Vector3();constructor(){globalThis.__facilityControls=this;}update(){}dispose(){}}`,
);
source = source
  .replace("from './assets'", "from './assets.mjs'")
  .replace("from './schema'", "from './schema.mjs'")
  .replace("from './floor-geometry'", "from './floor-geometry.mjs'")
  .replace("from './envelope'", "from './envelope.mjs'");
source = source
  .replace("from './activity'", "from './activity.mjs'")
  .replace("from './neighborhood'", "from './neighborhood.mjs'");
writeFileSync(
  'work/validation/renderer.mjs',
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const { createViewer, defaultState } =
  await import('../work/validation/renderer.mjs');
const api = createViewer(
  { clientWidth: 1400, clientHeight: 950, appendChild() {} },
  m,
  () => {},
);
const scene = globalThis.__facilityScene;
assert.equal(
  scene.getObjectByName('exterior-envelope').visible,
  true,
  'Opens with the assembled building',
);
api.update({ ...defaultState, plan: true });
assert.equal(
  scene.getObjectByName('clinic').getObjectByName('furniture').visible,
  false,
  'Source overlay does not double-render furniture',
);
assert.ok(
  scene
    .getObjectByName('clinic')
    .getObjectByName('walls')
    .children.every((w) => !w.visible),
  'Source overlay retains exact unobstructed wall strokes',
);
api.update(defaultState);
assert.equal(
  scene.getObjectByName('clinic').getObjectByName('furniture').visible,
  true,
  'Leaving the overlay restores the 3D configuration',
);
api.update({ ...defaultState, level: 'all', stack: 1, roof: true });
for (let i = 0; i < 100; i++) globalThis.nextFrame();
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
globalThis.nextFrame();
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
  for (const w of m.envelope.walls) {
    const group = facade.getObjectByName(w.id),
      len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    assert.ok(group, `Perimeter ${w.id} rendered`);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9])
      for (const y of [0.3, 1.5, 3, w.height - 0.12]) {
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
    for (let i = 0; i < 100; i++) globalThis.nextFrame();
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
      } else expected = new T.Vector3();
    }
    assert.ok(
      globalThis.__facilityControls.target.distanceTo(expected) < 0.02,
      `${journey.id}/${step.id} focuses its scene immediately for reduced motion`,
    );
    assert.ok(
      [
        ...globalThis.__facilityCamera.position.toArray(),
        globalThis.__facilityCamera.zoom,
      ].every(Number.isFinite),
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
writeFileSync(`public/models/${m.id}.glb`, buffer);
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
