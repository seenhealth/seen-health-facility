import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  insideRoom,
  roomPlacement,
} from '../work/validation/site-activity-data.mjs';
import { sampleActor, createActivity } from '../work/validation/activity.mjs';
import { sampleVan } from '../work/validation/arrival.mjs';
import { fleetParking } from '../work/validation/alhambra-fleet.mjs';
import {
  deliveryRuns,
  deliveryStops,
  KITCHEN_LUNCH,
  sampleDelivery,
} from '../work/validation/deliveries.mjs';
import { showcaseFrame } from '../work/validation/showcase.mjs';
import * as T from 'three';
const m = JSON.parse(
  fs.readFileSync('public/models/seen-alhambra-planning.json'),
);
const removed = new Set(
  JSON.parse(fs.readFileSync('app/data/day-program.json')).removedObjectIds,
);
const n = {
  ...m,
  objects: m.objects
    .filter((o) => !removed.has(o.id))
    .map((o) => ({ ...o, layer: o.layer || 'furniture' })),
};
const loop = JSON.parse(fs.readFileSync('app/data/activity-loop.json')),
  a = loop.actors;
for (const zone of ['day', 'dining']) {
  const chairs = n.objects.filter(
    (o) => o.zoneId === zone && m.assets[o.assetId].kind.includes('chair'),
  );
  const occupied = new Set(a.map((a) => a.seatId));
  const count = chairs.filter((c) => occupied.has(c.id)).length;
  assert(count / chairs.length >= 0.8, `${zone}: most seats occupied`);
  console.log(`${zone}: ${count}/${chairs.length} seats occupied`);
}
for (const actor of a.filter((a) => a.id.startsWith('daily-'))) {
  const room = m.rooms.find((r) => r.id === actor.roomId) || {
    ...m.zones.find((z) => z.id === actor.segments[0].zoneId),
    id: 'open-zone',
  };
  const clear = roomPlacement(n, room),
    p = sampleActor(actor, 0);
  assert(
    clear.clear([p.x, p.z], 0.19, actor.seatId),
    `${actor.id} seated with furniture clearance`,
  );
  for (const other of a) {
    if (other.id === actor.id || other.levelId !== actor.levelId) continue;
    for (let t = 0; t < 720; t += 2) {
      const q = sampleActor(other, t);
      if (q.visible === false) continue;
      assert(
        Math.hypot(p.x - q.x, p.z - q.z) >= 0.5,
        `${actor.id}/${other.id} need space at ${t}`,
      );
    }
  }
}
assert(!m.walls.some((w) => w.id === 'plan-wall-155'));
assert(!m.objects.some((o) => o.id === 'day-library-bay-4'));
let crossings = 0;
for (const actor of a.filter((a) => a.levelId === 'ground'))
  for (const s of actor.segments.filter((s) =>
    ['walk', 'roll'].includes(s.action),
  )) {
    for (let i = 1; i < s.path.length; i++) {
      const p = s.path[i - 1],
        q = s.path[i];
      if (
        (p[0] + 14.653121) * (q[0] + 14.653121) < 0 &&
        p[1] > 17.96 &&
        p[1] < 19.44
      )
        crossings++;
      if (
        p[0] > -15.721578 &&
        p[0] < -14.653121 &&
        p[1] > 11.2 &&
        p[1] < 25.1 &&
        q[0] > -15.721578 &&
        q[0] < -14.653121
      )
        assert(
          Math.abs(p[1] - q[1]) < 1.5,
          'No longitudinal walkway behind bookcases',
        );
    }
  }
assert(crossings > 0, 'Walking paths use the actual opening between cabinets');
function collide(a, b) {
  const axes = [
    [Math.sin(a.heading), Math.cos(a.heading)],
    [Math.cos(a.heading), -Math.sin(a.heading)],
    [Math.sin(b.heading), Math.cos(b.heading)],
    [Math.cos(b.heading), -Math.sin(b.heading)],
  ];
  return axes.every((axis) => {
    const project = (p) =>
      3.175 *
        Math.abs(
          Math.sin(p.heading) * axis[0] + Math.cos(p.heading) * axis[1],
        ) +
      1.13 *
        Math.abs(Math.cos(p.heading) * axis[0] - Math.sin(p.heading) * axis[1]);
    return (
      Math.abs(
        (a.position.x - b.position.x) * axis[0] +
          (a.position.z - b.position.z) * axis[1],
      ) <
      project(a) + project(b)
    );
  });
}
for (let t = 0; t < 720; t += 0.2) {
  const vans = fleetParking.map((_, i) => sampleVan(i, t));
  for (let i = 0; i < 8; i++) {
    const v = vans[i],
      next = sampleVan(i, t + 0.001);
    if (v.phase.startsWith('Parked')) {
      assert.equal(v.position.x, fleetParking[i].x);
      assert.equal(v.position.z, fleetParking[i].z);
      assert.equal(v.heading, fleetParking[i].heading);
    } else if (
      v.position.distanceTo(next.position) > 0.00001 &&
      v.phase === next.phase
    ) {
      const d = next.position.clone().sub(v.position).normalize();
      const forward = new T.Vector3(
        -Math.sin(v.heading),
        0,
        -Math.cos(v.heading),
      );
      assert(
        d.dot(forward) * (v.reverse ? -1 : 1) > 0.98,
        `${i} orientation at ${t}`,
      );
      assert.equal(v.door, 0);
      assert.equal(v.ramp, 0);
    }
    for (let j = i + 1; j < 8; j++)
      assert(!collide(v, vans[j]), `Fleet ${i}/${j} separation at ${t}`);
  }
}
const activity = createActivity(m, new T.Scene());
for (let i = 0; i < 2; i++) {
  const stop = deliveryStops[i],
    actor = a.find((a) => a.id === stop.id);
  for (const run of deliveryRuns(stop)) {
    const t = run.arrive + 10;
    activity.setOptions({ time: t, enabled: true, playing: false });
    assert.equal(sampleDelivery(i, t).phase, 'Unloading');
    const person = activity.actors.find((a) => a.spec.id === stop.id);
    assert(
      person.root.getObjectByName('delivery-cargo').visible,
      'Inbound cargo visible',
    );
    activity.setOptions({ time: run.leave - 12 });
    assert(
      !person.root.getObjectByName('delivery-cargo').visible,
      'Return trolley empty',
    );
    const path = actor.segments.find((s) => s.start === run.arrive + 2).path;
    assert(
      path.some(
        (p) =>
          Math.abs(p[0] - stop.door[0]) < 0.01 &&
          Math.abs(p[1] - stop.door[1]) < 0.01,
      ),
      'Delivery crosses its designated entrance',
    );
  }
}
// The morning food run brings lunch into the kitchen before it is served: the
// loaded trolley stands in kitchen-prep beside the kitchen staff member while
// the truck waits at receiving, and leaves empty.
const handover = loop.interactions.find(
    (i) => i.id === 'kitchen-lunch-delivery',
  ),
  kitchen = m.rooms.find((r) => r.id === 'kitchen-prep');
assert(handover?.zoneId === 'kitchen', 'Lunch hand-over in the kitchen');
const [courier, cook] = handover.actorIds.map((id) =>
    activity.actors.find((a) => a.spec.id === id),
  ),
  truck = deliveryStops.findIndex((s) => s.id === courier.spec.id);
for (const [t, loaded] of [
  [handover.start + 1, true],
  [handover.end - 1, false],
]) {
  activity.setOptions({ time: t });
  const p = courier.root.position,
    q = cook.root.position;
  assert(
    insideRoom([p.x, p.z], kitchen.polygon) &&
      insideRoom([q.x, q.z], kitchen.polygon),
    `Lunch hand-over inside the kitchen at ${t}`,
  );
  assert(
    Math.hypot(p.x - q.x, p.z - q.z) < 1.6,
    'Delivery and kitchen staff meet at the trolley',
  );
  assert.equal(
    courier.root.getObjectByName('delivery-cargo').visible,
    loaded,
    loaded ? 'Lunch arrives on the trolley' : 'Lunch is unloaded',
  );
  assert.equal(
    sampleDelivery(truck, t).phase,
    'Unloading',
    'The truck waits at receiving',
  );
}
// The carriers move from the trolley onto the island counter as unloading
// starts and stay there until lunch service ends.
const { at, from, to } = KITCHEN_LUNCH,
  service = JSON.parse(fs.readFileSync('app/data/day-program.json')).lunch
    .service;
assert(
  handover.start < from && from < handover.end && to === service[1],
  'Lunch is unloaded during the hand-over and left out through service',
);
assert(
  m.objects.some((o) => {
    const [w, , d] = m.assets[o.assetId].dimensions.map(
      (v, i) => v * o.scale[i],
    );
    return (
      o.zoneId === 'kitchen' &&
      m.assets[o.assetId].kind === 'counter' &&
      Math.abs(at[0] - o.position[0]) < w / 2 &&
      Math.abs(at[1] - o.position[2]) < d / 2
    );
  }),
  'Lunch carriers rest on a kitchen counter',
);
for (const [t, onCounter] of [
  [from - 0.25, false],
  [from + 0.25, true],
  [to - 0.25, true],
  [to + 0.25, false],
]) {
  activity.setOptions({ time: t });
  assert.equal(
    activity.deliveries.lunch.visible,
    onCounter,
    `Lunch carriers on the island at ${t}`,
  );
  if (t < handover.end)
    assert.equal(
      courier.root.getObjectByName('delivery-cargo').visible,
      !onCounter,
      `Lunch on the trolley or the island at ${t}, not both`,
    );
}
activity.dispose();
for (const mode of ['tiltshift', 'day', 'logistics'])
  for (let t = 0; t <= 720; t += 10)
    assert.deepEqual(
      showcaseFrame(t, mode),
      showcaseFrame(0, mode),
      'Camera stays fixed',
    );
console.log(
  `Day life: filled seats, clear routes through ${crossings} cabinet crossings, eight staggered vans, two delivery services, lunch delivered into the kitchen and fixed cameras verified.`,
);
