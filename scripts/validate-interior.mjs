// Integration checks: usable fixture openings and no walking through the newly
// photographed equipment. Run validate-model first to compile the asset builders.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { buildAsset } from '../work/validation/assets.mjs';
const m = JSON.parse(
  readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
);
const loop = JSON.parse(
  readFileSync('public/models/activity-loop.json', 'utf8'),
);
const material = (id) =>
  new T.MeshStandardMaterial({
    color: m.materials[id]?.color || '#ffffff',
    side: T.DoubleSide,
  });
function raysClear(assetId, rays) {
  const root = buildAsset(m.assets[assetId], material);
  root.updateMatrixWorld(true);
  for (const [start, end] of rays) {
    const from = new T.Vector3(...start),
      delta = new T.Vector3(...end).sub(from),
      distance = delta.length();
    const ray = new T.Raycaster(from, delta.normalize(), 0, distance);
    assert.equal(
      ray.intersectObject(root, true).length,
      0,
      `${assetId}: actual geometry leaves the usable opening clear`,
    );
  }
}
raysClear(
  'interior-double-sink',
  [-0.43, 0.43].flatMap((x) =>
    [0.4, 0.55, 0.65].map((y) => [
      [x, y, 0.4],
      [x, y, 0.1],
    ]),
  ),
);
raysClear(
  'interior-bars',
  [0.3, 0.6, 0.8].map((y) => [
    [0, y, -1.9],
    [0, y, 1.9],
  ]),
);
raysClear('interior-nurse-station', [
  [
    [-1.1, 0.4, 2.1],
    [-1.1, 0.4, 1.35],
  ],
]);
const reviewed = new Set(m.interiorReview.newObjectIds);
for (const id of m.interiorReview.changedPlanObjectIds) reviewed.add(id);
const removed = new Set(
  JSON.parse(readFileSync('app/data/day-program.json')).removedObjectIds,
);
const boxes = m.objects
  .filter(
    (o) =>
      reviewed.has(o.id) &&
      o.levelId === 'ground' &&
      (o.layer || 'furniture') === 'furniture' &&
      !removed.has(o.id) &&
      o.position[1] < 1.4,
  )
  .flatMap((o) => {
    const [w, h, d] = m.assets[o.assetId].dimensions.map(
      (n, i) => n * o.scale[i],
    );
    if (h < 0.15) return [];
    const c = Math.cos(o.rotation),
      s = Math.sin(o.rotation);
    return (o.navigationFootprints || [[0, 0, w, d]]).map(([x, z, bw, bd]) => ({
      id: o.id,
      x: o.position[0] + c * x + s * z,
      z: o.position[2] - s * x + c * z,
      w: bw / 2,
      d: bd / 2,
      c,
      s,
    }));
  });
let samples = 0;
for (const a of loop.actors) {
  if (a.levelId !== 'ground' || a.escortFor) continue;
  for (const s of a.segments) {
    if (!['walk', 'roll'].includes(s.action)) continue;
    for (let i = 1; i < s.path.length; i++) {
      const p = s.path[i - 1],
        q = s.path[i],
        count = Math.max(
          1,
          Math.ceil(Math.hypot(p[0] - q[0], p[1] - q[1]) / 0.05),
        );
      for (let j = 0; j <= count; j++) {
        const x = p[0] + ((q[0] - p[0]) * j) / count,
          z = p[1] + ((q[1] - p[1]) * j) / count;
        for (const b of boxes) {
          const dx = x - b.x,
            dz = z - b.z;
          assert.ok(
            Math.abs(b.c * dx - b.s * dz) >= b.w + 0.18 ||
              Math.abs(b.s * dx + b.c * dz) >= b.d + 0.18,
            `${a.id}: path overlaps ${b.id} at ${x},${z}`,
          );
        }
        samples++;
      }
    }
  }
}
for (const [person, seat] of [
  ['member-consult', 'clinic-exam-05-recliner'],
  ['member-ot', 'rehab-ot-chair-participant'],
  ['occupational-therapist', 'rehab-ot-chair-therapist'],
  ['nurse-02', 'clinic-nurse-task-chair-0'],
]) {
  const a = loop.actors.find((a) => a.id === person),
    o = m.objects.find((o) => o.id === seat);
  assert.equal(a.seatId, seat);
  assert.ok(a.seated);
  for (const s of a.segments)
    assert.deepEqual(
      s.path[0],
      [o.position[0], o.position[2]],
      `${person} is attached to the physical seat`,
    );
}
console.log(
  `Interior checks: ${samples} walking samples clear of reviewed furniture; sink knee spaces, nurse return, parallel-bar lane and four physical seat anchors verified.`,
);
