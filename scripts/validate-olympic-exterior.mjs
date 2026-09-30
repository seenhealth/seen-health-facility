import './compile-model-modules.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as T from 'three';
const require = createRequire(import.meta.url);
const { createCanvas } = require(
  process.env.FACILITY_CANVAS_MODULE || '@napi-rs/canvas',
);
globalThis.document = { createElement: () => createCanvas(1, 1) };
const { validateFacility } = await import('../work/validation/schema.mjs');
const { buildOlympicExterior } =
  await import('../work/validation/olympic-exterior.mjs');
for (const key of ['olympic', 'olympic-option']) {
  const path = `public/models/seen-${key}.json`;
  const model = validateFacility(JSON.parse(fs.readFileSync(path)));
  const baseline = JSON.parse(
    execFileSync('git', ['show', `${process.argv[2] || 'HEAD'}:${path}`], {
      maxBuffer: 20 * 1024 * 1024,
    }),
  );
  for (const property of [
    'levels',
    'zones',
    'rooms',
    'walls',
    'doors',
    'floorOpenings',
    'verticalConnections',
  ])
    assert.deepEqual(
      model[property],
      baseline[property],
      `${key}: preserve ${property}`,
    );
  assert.deepEqual(
    model.objects.filter((o) => o.zoneId !== 'site'),
    baseline.objects.filter((o) => o.zoneId !== 'site'),
    'Preserve all interior furniture and equipment',
  );
  const exterior = buildOlympicExterior(model);
  assert(exterior);
  for (const parent of Object.values(exterior))
    parent.traverse((o) => {
      if (!o.geometry) return;
      assert(
        [...o.geometry.attributes.position.array].every(Number.isFinite),
        `Finite ${o.name} geometry`,
      );
      assert(
        [...o.position, ...o.scale, ...o.quaternion.toArray()].every(
          Number.isFinite,
        ),
      );
    });
  const bounds = new T.Box3().setFromObject(exterior.facade);
  assert(
    Math.abs(bounds.max.y - model.exteriorSurvey.finHeight) < 0.2,
    'Corner fin ends at its documented estimated height',
  );
  assert(
    bounds.getSize(new T.Vector3()).x > 47 &&
      bounds.getSize(new T.Vector3()).x < 53,
    'Facade retains the plan width',
  );
  const parking = exterior.site.getObjectByName('olympic-rear-parking');
  assert(
    parking && new T.Box3().setFromObject(parking).max.z > 55,
    'Deep rear lot is present',
  );
  for (const name of [
    'olympic-translucent-window-band',
    'olympic-solid-rear-panels',
    'olympic-wraparound-corner-canopy',
  ])
    assert(exterior.facade.getObjectByName(name), name);
  console.log(
    `${key}: valid finite exterior; ${model.rooms.length} room layouts, doors, elevations and interior objects unchanged.`,
  );
}
for (const key of ['alveare', 'alhambra-planning']) {
  const model = JSON.parse(fs.readFileSync(`public/models/seen-${key}.json`));
  assert.equal(
    buildOlympicExterior(model),
    null,
    'Olympic shell is scoped to Olympic',
  );
}
