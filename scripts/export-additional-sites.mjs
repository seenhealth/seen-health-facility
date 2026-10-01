// Headless GLB export for the additional sites (and any model path given),
// writing public/models/<id>.glb.
//
//   node scripts/export-additional-sites.mjs public/models/seen-olympic.json [--out dir]
//
// The renderer runs in Node through the headless harness in
// validate-renderer.mjs (Rolldown bundle of app/model/renderer.ts, DOM and
// WebGL stand-ins); @napi-rs/canvas (or FACILITY_CANVAS_MODULE) supplies real
// texture pixels for the GLB.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  exportArguments,
  loadCanvasModule,
  loadHeadlessViewer,
} from './validate-renderer.mjs';
const { modelPath, outDir } = exportArguments();
const headless = await loadHeadlessViewer({ canvas: await loadCanvasModule() });
const { createViewer } = headless.renderer;
const m = headless.schema.validateFacility(
  JSON.parse(readFileSync(modelPath, 'utf8')),
);
mkdirSync(outDir, { recursive: true });
const api = createViewer(headless.host(1400, 950), m, () => {});
// Animated fleet replaces static vans on screen; downloadable scenes retain them.
const staticVans = m.objects.filter((o) =>
  ['fleet-van-a', 'fleet-van-b'].includes(o.assetId),
);
for (const spec of staticVans) {
  const object = headless.scene.getObjectByName(spec.id);
  assert(
    object && !object.visible,
    'Static fleet hidden while arrival animation is enabled',
  );
}
const blob = await api.exportGLB();
const bytes = Buffer.from(await blob.arrayBuffer());
const gltf = JSON.parse(
  bytes
    .subarray(20, 20 + bytes.readUInt32LE(12))
    .toString()
    .trim(),
);
for (const spec of staticVans)
  assert(
    gltf.nodes.some((n) => n.name === spec.id),
    'Export includes the static fleet',
  );
assert(
  gltf.nodes.some(
    (n) =>
      n.name ===
      (m.contextStyle ? 'van-drop-off-bay' : 'accessible-main-entrance'),
  ),
  'Export includes drop-off markings',
);
writeFileSync(`${outDir}/${m.id}.glb`, bytes);
console.log(`${m.id}: exported ${(blob.size / 1048576).toFixed(1)} MB GLB`);
api.dispose();
