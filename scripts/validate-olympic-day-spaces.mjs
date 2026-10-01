// Olympic day spaces (both options): unique room labels anchored inside their
// rooms, the raised-wing day furniture inside its rooms without furniture or
// door-swing collisions, the entrance-side parking box removed, and the dining
// table count.
//   node scripts/validate-olympic-day-spaces.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';
import { installHeadlessGlobals } from './validate-renderer.mjs';
installHeadlessGlobals();
const {
  schema: { validateFacility },
  exterior: { buildOlympicExterior },
  labels: { roomLabelCode, roomLabelAnchor },
} = await loadSim(
  {
    schema: 'app/model/schema.ts',
    exterior: 'app/model/olympic-exterior.ts',
    labels: 'app/model/room-labels.ts',
  },
  { dir: 'work/olympic' },
);
function inside([x, z], polygon) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      yes = !yes;
  }
  return yes;
}
function overlap(a, b) {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const c = polygon[i],
        d = polygon[(i + 1) % polygon.length],
        v = [c[1] - d[1], d[0] - c[0]];
      const aa = a.map((p) => p[0] * v[0] + p[1] * v[1]),
        bb = b.map((p) => p[0] * v[0] + p[1] * v[1]);
      if (
        Math.min(Math.max(...aa), Math.max(...bb)) -
          Math.max(Math.min(...aa), Math.min(...bb)) <=
        0.005
      )
        return false;
    }
  return true;
}
for (const key of ['olympic', 'olympic-option']) {
  const path = `public/models/seen-${key}.json`,
    m = validateFacility(JSON.parse(fs.readFileSync(path)));
  const codes = m.rooms.map((r) => roomLabelCode(m, r));
  assert.equal(new Set(codes).size, m.rooms.length);
  for (const r of m.rooms)
    assert(
      inside(roomLabelAnchor(r), r.polygon),
      `Interior label anchor: ${r.id}`,
    );
  const added = m.objects.filter((o) => o.id.startsWith('olympic-dayfit-'));
  function footprint(o) {
    const d = m.assets[o.assetId].dimensions,
      w = (d[0] * o.scale[0]) / 2,
      z = (d[2] * o.scale[2]) / 2,
      c = Math.cos(o.rotation),
      s = Math.sin(o.rotation);
    return [
      [-w, -z],
      [w, -z],
      [w, z],
      [-w, z],
    ].map(([x, z]) => [
      o.position[0] + c * x + s * z,
      o.position[2] - s * x + c * z,
    ]);
  }
  for (const o of added) {
    const room = m.rooms.find((r) => r.id === o.roomId),
      poly = footprint(o);
    assert.equal(o.zoneId, room.zoneId, 'Furnishing follows raised-wing zone');
    assert(
      poly.every((p) => inside(p, room.polygon)),
      `Furniture footprint inside ${room.id}: ${o.id}`,
    );
    for (const b of m.objects.filter(
      (b) => b.id !== o.id && b.levelId === 'ground' && b.layer === 'furniture',
    ))
      assert(
        !overlap(poly, footprint(b)),
        `Furniture collision ${o.id} / ${b.id}`,
      );
    for (const d of m.doorSchedule.filter((d) => d.levelId === 'ground')) {
      const start = Math.atan2(
          d.closed[1] - d.hinge[1],
          d.closed[0] - d.hinge[0],
        ),
        end = Math.atan2(d.open[1] - d.hinge[1], d.open[0] - d.hinge[0]);
      const turn = Math.atan2(Math.sin(end - start), Math.cos(end - start));
      const swing = [
        d.hinge,
        ...Array.from({ length: 17 }, (_, i) => [
          d.hinge[0] + Math.cos(start + (turn * i) / 16) * d.width,
          d.hinge[1] + Math.sin(start + (turn * i) / 16) * d.width,
        ]),
      ];
      assert(!overlap(poly, swing), `Door swing obstruction ${o.id} / ${d.id}`);
    }
  }
  const exterior = buildOlympicExterior(m);
  exterior.site.updateMatrixWorld(true);
  const hits = new T.Raycaster(
    new T.Vector3(4.9, 10, 15.5),
    new T.Vector3(0, -1, 0),
  ).intersectObject(exterior.site, true);
  assert(
    !hits.some((hit) => hit.object instanceof T.Mesh && hit.point.y > 0.15),
    'Entrance-side parking box removed',
  );
  const diningTables = m.objects.filter(
    (o) => o.roomId === 'ground-dining' && o.assetId === 'review-table',
  );
  assert.equal(diningTables.length, 11);
  console.log(
    `${key}: ${m.rooms.length} unique room labels; ${added.length} furniture footprints inside rooms, without furniture or door-swing collisions; parking box removed.`,
  );
}
