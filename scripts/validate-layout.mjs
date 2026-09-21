// Geometric integration checks for user-directed circulation and room changes.
// Run validate-model first to compile the shared asset and floor builders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { buildAsset } from '../work/validation/assets.mjs';
import { floorShapes } from '../work/validation/floor-geometry.mjs';
const m = JSON.parse(
  readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
);
const objects = new Map(m.objects.map((o) => [o.id, o]));
const material = () => new T.MeshStandardMaterial({ side: T.DoubleSide });
function inside([x, z], p) {
  let yes = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i],
      b = p[j];
    if (
      a[1] > z != b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
let floorSamples = 0,
  treadSamples = 0;
for (const c of m.verticalConnections) {
  const low = m.levels.find((l) => l.id === c.fromLevel).elevation,
    high = m.levels.find((l) => l.id === c.toLevel).elevation;
  assert.equal(c.bottom[1], low);
  assert.equal(c.top[1], high);
  const aperture = m.floorOpenings.find((o) => o.connectionId === c.id);
  const zone = m.zones.find((z) => z.id === aperture.zoneId);
  assert.ok(
    inside([c.landing[0], c.landing[2]], zone.polygon),
    `${c.id}: destination landing belongs to its floor`,
  );
  const surfaces = [zone, ...m.rooms.filter((r) => r.zoneId === zone.id)];
  for (const s of surfaces) {
    const geo = new T.ShapeGeometry(
      floorShapes(
        s.polygon,
        m.floorOpenings.filter((o) => o.zoneId === zone.id),
      ),
    );
    geo.rotateX(-Math.PI / 2);
    const floor = new T.Mesh(geo, material());
    floor.updateMatrixWorld();
    const [[x0, z0], [x1, z1]] = aperture.bounds;
    for (let i = 1; i < 10; i++)
      for (let j = 1; j < 5; j++) {
        const ray = new T.Raycaster(
          new T.Vector3(x0 + ((x1 - x0) * i) / 10, 1, z0 + ((z1 - z0) * j) / 5),
          new T.Vector3(0, -1, 0),
          0,
          2,
        );
        assert.equal(
          ray.intersectObject(floor).length,
          0,
          `${c.id}: ${s.id} floor blocks stair/lift aperture`,
        );
        floorSamples++;
      }
  }
  if (c.kind !== 'stair') continue;
  const o = objects.get(c.objectId),
    a = m.assets[o.assetId],
    root = buildAsset(a, material);
  root.updateMatrixWorld(true);
  const rise = high - low,
    d = a.dimensions[2],
    count = Math.ceil(rise / 0.18);
  for (let i = 0; i < count; i++) {
    const z = -d / 2 + ((i + 0.65) * d) / count,
      ray = new T.Raycaster(
        new T.Vector3(0, rise + 0.3, z),
        new T.Vector3(0, -1, 0),
        0,
        rise + 1,
      );
    const hit = ray.intersectObject(root, true)[0];
    assert.ok(hit);
    assert.ok(
      Math.abs(hit.point.y - (rise * (i + 1)) / count) < 1e-5,
      `${c.id}: exact tread elevation ${i}`,
    );
    treadSamples++;
  }
  const sx = Math.sin(o.rotation),
    sz = Math.cos(o.rotation);
  assert.ok(
    Math.hypot(
      c.top[0] - (o.position[0] + (sx * d) / 2),
      c.top[2] - (o.position[2] + (sz * d) / 2),
    ) < 1e-6,
  );
}
assert.equal(objects.get('rear-stair-flight').levelId, 'basement');
assert.equal(objects.get('rear-stair-flight').rotation, Math.PI);
assert.equal(objects.get('rehab-stair').rotation, 0);
const nursing = objects.get('clinic-photo-nurse-station');
assert.equal(nursing.rotation, Math.PI);
// Reversed station still has an unobstructed opening on world +Z.
const station = buildAsset(m.assets[nursing.assetId], material);
station.rotation.y = nursing.rotation;
station.updateMatrixWorld(true);
assert.equal(
  new T.Raycaster(
    new T.Vector3(0, 0.55, 2.3),
    new T.Vector3(0, 0, -1),
    0,
    2.5,
  ).intersectObject(station, true).length,
  0,
);
for (let i = 1; i <= 6; i++) {
  const id = `clinic-exam-${String(i).padStart(2, '0')}`,
    room = m.rooms.find((r) => r.id === id);
  assert.equal(objects.get(id + '-recliner').rotation, Math.PI);
  assert.equal(objects.get(id + '-sink').rotation, -Math.PI / 2);
  assert.equal(objects.get(id + '-monitor').rotation, 0);
  // Every floor item must remain inside its own room after rotating and moving.
  for (const o of m.objects.filter(
    (o) => o.roomId === id && o.layer === 'furniture',
  )) {
    const [w, , d] = m.assets[o.assetId].dimensions,
      c = Math.cos(o.rotation),
      s = Math.sin(o.rotation);
    for (const x of [-w / 2, w / 2])
      for (const z of [-d / 2, d / 2])
        assert.ok(
          inside(
            [o.position[0] + c * x + s * z, o.position[2] - s * x + c * z],
            room.polygon,
          ),
          `${o.id}: room contains footprint`,
        );
  }
}
assert.equal(
  m.assets[objects.get('clinic-exam-05-recliner').assetId].kind,
  'dental-chair',
);
for (const id of [
  'access-shower-west',
  'access-shower-east',
  'access-barber-chair',
  'access-hair-wash',
  'access-washing-machine-1',
  'access-washing-machine-2',
]) {
  const o = objects.get(id),
    r = m.rooms.find((r) => r.id === o.roomId);
  assert.ok(inside([o.position[0], o.position[2]], r.polygon));
}
const conference = m.rooms.find((r) => r.id === 'upperfit-conference');
const xs = conference.polygon.map((p) => p[0]),
  zs = conference.polygon.map((p) => p[1]);
assert.ok(
  Math.max(...xs) - Math.min(...xs) > 2 * (Math.max(...zs) - Math.min(...zs)),
  'Rotated conference room runs east–west',
);
// Furniture must not occupy the newly opened upper stairwells.
for (const o of m.objects.filter(
  (o) => o.levelId === 'upper' && o.layer === 'furniture',
)) {
  const [w, , d] = m.assets[o.assetId].dimensions,
    c = Math.cos(o.rotation),
    s = Math.sin(o.rotation),
    hw = (Math.abs(c) * w + Math.abs(s) * d) / 2,
    hd = (Math.abs(s) * w + Math.abs(c) * d) / 2;
  for (const a of m.floorOpenings.filter((a) => a.zoneId === o.zoneId)) {
    const [[x0, z0], [x1, z1]] = a.bounds;
    assert.ok(
      o.position[0] + hw <= x0 ||
        o.position[0] - hw >= x1 ||
        o.position[2] + hd <= z0 ||
        o.position[2] - hd >= z1,
      `${o.id}: clear of ${a.id}`,
    );
  }
}
console.log(
  `Layout verified: ${treadSamples} exact-height treads, ${floorSamples} clear aperture samples, 5 aligned vertical connections, 6 exam-room footprints, station opening and upper furniture clearances.`,
);
