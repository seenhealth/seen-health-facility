import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';

// Compile, then load: static imports would be read before the compile runs.
await import('./compile-model-modules.mjs');
const { createSiteActivity } =
  await import('../work/validation/site-activity.mjs');
const { sampleActor } = await import('../work/validation/activity.mjs');
const { alhambraVanWindows } = await import('../work/validation/arrival.mjs');
const { buildSiteArrival, siteVanWindows } =
  await import('../work/validation/site-arrival.mjs');
const { buildEnvelopeWall } = await import('../work/validation/envelope.mjs');
const { validateFacility } = await import('../work/validation/schema.mjs');
const { buildSiteActivityData, insideRoom } =
  await import('../work/validation/site-activity-data.mjs');
const siteArrivals = JSON.parse(
  fs.readFileSync('app/data/site-arrivals.json', 'utf8'),
);
const phases = [
  'inbound',
  'unload',
  'outbound',
  'returning',
  'boarding',
  'leaving',
];
const alhambraRefs = new Set(
  alhambraVanWindows.flatMap((w) => [w, ...phases.map((k) => w[k])]),
);
// Everything a site's arrivals produce: the cast, its interactions and both vans.
function arrivalFingerprint(data, arrival) {
  const vans = [];
  for (let time = 0; time < 720; time += 0.5)
    for (const index of arrival.windows.keys()) {
      const v = arrival.sampleVan(index, time);
      vans.push(
        v.position.x,
        v.position.z,
        v.heading,
        v.door,
        v.ramp,
        v.visible,
      );
    }
  return JSON.stringify({
    actors: data.actors,
    interactions: data.interactions,
    vans,
  });
}

const edgeDistance = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p.x - a[0] - dx * t, p.z - a[1] - dz * t);
};
for (const id of ['olympic', 'olympic-option', 'alveare']) {
  const model = JSON.parse(fs.readFileSync(`public/models/seen-${id}.json`));
  validateFacility(model);
  const api = createSiteActivity(model, new T.Scene());
  const travelers = api.data.actors.filter((a) => a.arrivalVehicleId);
  assert.equal(travelers.length, 4, 'Two participants with two escorts');
  assert(travelers.some((a) => a.mobility === 'wheelchair'));
  // Cast through the rendered shell too: plan wall clearance alone misses generic infill.
  for (const cut of [undefined, 1.2]) {
    const shells = model.envelope.walls.map((w) =>
      buildEnvelopeWall(
        w,
        () => new T.MeshBasicMaterial({ side: T.DoubleSide }),
        cut,
      ),
    );
    shells.forEach((g) => g.updateMatrixWorld(true));
    for (const actor of travelers)
      for (const segment of actor.segments) {
        for (let i = 1; i < segment.path.length; i++) {
          const a = segment.path[i - 1],
            b = segment.path[i],
            direction = new T.Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
          for (const lateral of [-0.36, 0, 0.36])
            for (const height of [0.8, 1.15, 1.6]) {
              const origin = new T.Vector3(
                a[0] + direction.z * lateral,
                height,
                a[1] - direction.x * lateral,
              );
              const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
              const ray = new T.Raycaster(origin, direction, 0, distance);
              const hits = ray.intersectObjects(shells, true);
              assert.equal(
                hits.length,
                0,
                `${id} ${actor.id} rendered shell blocks entry (${cut})`,
              );
            }
        }
      }
  }
  const obstacles = model.objects.filter(
    (o) =>
      o.levelId === 'ground' &&
      ['furniture', 'architecture'].includes(o.layer) &&
      o.position[1] < 1.7 &&
      model.assets[o.assetId].dimensions[1] > 0.2 &&
      !['plan-door', 'sign', 'folding-partition'].includes(
        model.assets[o.assetId].kind,
      ),
  );
  let samples = 0;
  for (let time = 0; time < 720; time += 0.25) {
    const people = api.data.actors
      .filter((a) => a.levelId === 'ground')
      .map((a) => ({ a, p: sampleActor(a, time) }))
      .filter(({ p }) => p.visible !== false);
    for (const { a, p } of people.filter(({ a }) => a.arrivalVehicleId)) {
      samples++;
      const radius = a.mobility === 'wheelchair' ? 0.44 : 0.27;
      for (const wall of model.walls.filter((w) => w.levelId === 'ground'))
        assert(
          edgeDistance(p, wall.a, wall.b) > radius + wall.thickness / 2,
          `${id} ${a.id} wall ${wall.id} at ${time}: ${p.x},${p.z}`,
        );
      for (const object of obstacles) {
        if (object.id === a.seatId) continue;
        const spec = model.assets[object.assetId],
          dx = p.x - object.position[0],
          dz = p.z - object.position[2];
        const x =
            Math.cos(object.rotation) * dx - Math.sin(object.rotation) * dz,
          z = Math.sin(object.rotation) * dx + Math.cos(object.rotation) * dz;
        const footprints = object.navigationFootprints || [
          [
            0,
            0,
            spec.dimensions[0] * object.scale[0],
            spec.dimensions[2] * object.scale[2],
          ],
        ];
        for (const [cx, cz, w, d] of footprints)
          assert(
            Math.hypot(
              Math.max(0, Math.abs(x - cx) - w / 2),
              Math.max(0, Math.abs(z - cz) - d / 2),
            ) >= radius,
            `${id} ${a.id} furniture ${object.id} at ${time}`,
          );
      }
      for (const other of people)
        if (other.a !== a)
          assert(
            Math.hypot(p.x - other.p.x, p.z - other.p.z) > 0.62,
            `${id} ${a.id} overlaps ${other.a.id} at ${time}`,
          );
      const van = api.arrival.sampleVan(
        a.arrivalVehicleId === 'van-a' ? 0 : 1,
        time,
      );
      // Anyone on the vehicle/ramp needs its doors and ramp fully deployed.
      const v = van.position,
        heading = van.heading;
      const localX =
        Math.cos(heading) * (p.x - v.x) - Math.sin(heading) * (p.z - v.z);
      const localZ =
        Math.sin(heading) * (p.x - v.x) + Math.cos(heading) * (p.z - v.z);
      if (localX < 3.96 && localX > -0.5 && Math.abs(localZ + 0.19) < 0.55) {
        assert(
          van.visible && van.door > 0.999 && van.ramp > 0.999,
          `${id} ${a.id} accesses van before ready at ${time}`,
        );
        assert(p.y >= -0.17 && p.y < 0.43, 'Correct vehicle/ramp height');
      }
    }
  }
  // The site runs its own timetable from data, sharing nothing with Alhambra's
  // fleet schedule: retiming Alhambra's vans leaves this site's day untouched.
  const windows = siteVanWindows(model);
  assert.deepEqual(
    windows,
    siteArrivals.timetables[model.contextStyle],
    `${id} van timetable comes from app/data/site-arrivals.json`,
  );
  assert.deepEqual(api.arrival.windows, windows, `${id} vans run it`);
  for (const w of windows)
    for (const ref of [w, ...phases.map((k) => w[k])])
      assert(!alhambraRefs.has(ref), `${id} ${w.id} shares Alhambra's windows`);
  const before = arrivalFingerprint(api.data, api.arrival);
  const shift = (by) =>
    alhambraVanWindows.forEach((w) =>
      phases.forEach((k) => {
        w[k][0] += by;
        w[k][1] += by;
      }),
    );
  shift(9);
  try {
    assert.equal(
      arrivalFingerprint(buildSiteActivityData(model), buildSiteArrival(model)),
      before,
      `${id} arrivals follow alhambraVanWindows`,
    );
  } finally {
    shift(-9);
  }
  for (const a of travelers.filter((a) => a.role === 'participant')) {
    const index = a.arrivalVehicleId === 'van-a' ? 0 : 1;
    const van = windows[index];
    const inside = sampleActor(a, van.unload[0] + 34);
    assert(
      insideRoom(
        [inside.x, inside.z],
        model.rooms.find((r) => r.id === 'ground-lobby').polygon,
      ),
      'Participant actually reaches lobby',
    );
    assert.equal(
      sampleActor(a, van.outbound[0]).visible,
      undefined,
      'Participant stays inside after van leaves',
    );
    assert.equal(
      sampleActor(a, van.leaving[0]).visible,
      false,
      'Participant is aboard before van departure',
    );
  }
  api.updateView({
    level: 'ground',
    plan: false,
    explode: 0,
    stack: 0,
    isolate: false,
    selected: null,
    site: true,
  });
  api.setOptions({ time: 55, playing: false });
  assert(
    api.actors.filter((a) => a.spec.arrivalVehicleId && a.root.visible)
      .length >= 2,
    'Van A visibly disembarks',
  );
  api.setOptions({ time: 185 });
  assert(
    api.actors.some(
      (a) => a.spec.arrivalVehicleId === 'van-b' && a.root.visible,
    ),
    'Van B visibly disembarks',
  );
  api.setOptions({ time: 55, filter: 'staff' });
  assert(
    api.actors.some(
      (a) =>
        a.spec.arrivalVehicleId && a.root.visible && a.spec.role === 'aide',
    ),
  );
  assert(
    !api.actors.some((a) => a.root.visible && a.spec.role === 'participant'),
  );
  api.dispose();
  console.log(
    `${id}: ${samples} person samples; own van timetable (independent of Alhambra's), van timing, ramp heights, entrance walls, furniture, separation, reception handoff and pickup verified.`,
  );
}
