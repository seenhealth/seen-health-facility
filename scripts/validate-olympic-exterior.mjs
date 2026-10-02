// Olympic exterior (both options): finite geometry, the corner fin at its
// documented height, the plan-width facade, the deep rear lot and the named
// facade elements; the Olympic shell is not built for other sites.
//   node scripts/validate-olympic-exterior.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';
import { installHeadlessGlobals } from './validate-renderer.mjs';
installHeadlessGlobals();
const {
  schema: { validateFacility },
  exterior: { buildOlympicExterior },
} = await loadSim(
  {
    schema: 'app/model/schema.ts',
    exterior: 'app/model/olympic-exterior.ts',
  },
  { dir: 'work/olympic' },
);
for (const key of ['olympic', 'olympic-option']) {
  const path = `public/models/seen-${key}.json`;
  const model = validateFacility(JSON.parse(fs.readFileSync(path)));
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
    `${key}: valid finite exterior with corner fin, plan-width facade, rear lot and named facade elements.`,
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
