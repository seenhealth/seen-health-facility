import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as T from 'three';
import {
  activityData,
  createActivity,
  sampleActor,
  samplePairedActors,
  sampleEscort,
  timelineFor,
} from '../work/validation/activity.mjs';
import { buildNeighborhood } from '../work/validation/neighborhood.mjs';
import { sampleVan, vanWindows, ARRIVAL } from '../work/validation/arrival.mjs';
import { dayProgram, programAt } from '../work/validation/day-room.mjs';
import { createCharacter } from '../work/validation/characters.mjs';
const m = JSON.parse(
  readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
);
const scene = new T.Scene(),
  activity = createActivity(m, scene),
  neighborhood = buildNeighborhood(m);
scene.add(neighborhood.root);
assert.equal(activity.actors.length, 41);
assert.equal(new Set(activityData.actors.map((a) => a.id)).size, 41);
for (const role of [
  'doctor',
  'nurse',
  'pt',
  'ot',
  'aide',
  'driver',
  'reception',
  'coordinator',
  'social-worker',
  'activities',
  'nutrition',
  'participant',
])
  assert.ok(activityData.roles.includes(role));
const distance = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const walls = m.walls.filter((w) => w.levelId === 'ground');
let samples = 0,
  minWall = Infinity;
for (const a of activityData.actors) {
  assert.equal(a.segments[0].start, 0);
  assert.equal(a.segments.at(-1).end, activityData.duration);
  for (let i = 0; i < a.segments.length; i++) {
    const s = a.segments[i],
      next = a.segments[(i + 1) % a.segments.length];
    assert.ok(s.end > s.start);
    if (i < a.segments.length - 1) assert.equal(s.end, next.start);
    assert.deepEqual(
      s.path.at(-1),
      next.path[0],
      `${a.id}: no teleport between steps or on repeat`,
    );
    if (a.levelId === 'ground' && ['walk', 'roll'].includes(s.action))
      for (let j = 1; j < s.path.length; j++) {
        const p = s.path[j - 1],
          q = s.path[j],
          count = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.05);
        for (let k = 0; k <= count; k++) {
          const t = k / count,
            x = p[0] + (q[0] - p[0]) * t,
            z = p[1] + (q[1] - p[1]) * t;
          const clearance = Math.min(
            ...walls.map((w) => distance([x, z], w.a, w.b) - w.thickness / 2),
          );
          minWall = Math.min(minWall, clearance);
          assert.ok(
            clearance >= 0.2,
            `${a.id}: path clips a wall at ${x},${z} (${clearance})`,
          );
          samples++;
        }
      }
    for (const t of [s.start, (s.start + s.end) / 2, s.end - 0.001]) {
      const p = sampleActor(a, t - a.offset);
      assert.ok([p.x, p.z, p.heading].every(Number.isFinite));
    }
  }
  if (a.pairedWith)
    assert.equal(
      a.segments.length,
      activityData.actors.find((b) => b.id === a.pairedWith).segments.length,
    );
  const start = sampleActor(a, 0),
    end = sampleActor(a, activityData.duration);
  assert.deepEqual(start, end, `${a.id} repeats deterministically`);
}
activity.setOptions({ playing: false, time: 36 });
const before = activity.actors.map((a) => a.root.position.toArray());
activity.tick(0.1);
assert.deepEqual(
  activity.actors.map((a) => a.root.position.toArray()),
  before,
  'Pause freezes movement',
);
activity.setOptions({ time: 97 });
const seek = activity.actors.map((a) => a.root.position.toArray());
activity.setOptions({ time: 36 });
activity.setOptions({ time: 97 });
assert.deepEqual(
  activity.actors.map((a) => a.root.position.toArray()),
  seek,
  'Backward seek restores the same scene',
);
activity.setOptions({
  time: activityData.duration - 0.05,
  playing: true,
  speed: 1,
});
activity.tick(0.1);
assert.ok(
  Math.abs(activity.getState().time - 0.05) < 1e-6,
  'Loop wraps with no extra actors',
);
activity.setOptions({ time: 0, speed: 4 });
activity.tick(0.1);
assert.ok(
  Math.abs(activity.getState().time - 0.4) < 1e-6,
  'Speed changes shared clock',
);
activity.setOptions({ time: 50, playing: false });
for (const a of activity.actors.filter((a) => a.spec.pairedWith)) {
  const leader = activityData.actors.find((b) => b.id === a.spec.pairedWith),
    s = samplePairedActors(a.spec, leader, 50).staff;
  assert.ok(
    Math.hypot(a.root.position.x - s.x, a.root.position.z - s.z) < 1e-8,
    'Escort pair shares the coordinated timeline',
  );
  let previous = null;
  for (let t = 0; t <= activityData.duration; t += 0.05) {
    const pair = samplePairedActors(a.spec, leader, t),
      p = pair.staff,
      q = pair.participant;
    assert.ok(
      Math.hypot(p.x - q.x, p.z - q.z) >= 0.72,
      'Pair keeps personal space',
    );
    if (previous)
      for (const key of ['staff', 'participant'])
        assert.ok(
          Math.hypot(
            pair[key].x - previous[key].x,
            pair[key].z - previous[key].z,
          ) < 0.16,
          `Continuous pair movement at ${t}`,
        );
    previous = pair;
  }
}
activity.updateView({
  level: 'upper',
  plan: false,
  explode: 0,
  stack: 0,
  isolate: false,
  selected: null,
  site: true,
});
assert.ok(
  activity.actors
    .filter((a) => a.root.visible)
    .every((a) => a.spec.levelId === 'upper'),
);
activity.updateView({
  level: 'all',
  plan: false,
  explode: 1,
  stack: 0,
  isolate: false,
  selected: null,
  site: true,
});
assert.equal(activity.root.visible, false);
activity.setOptions({ filter: 'doctor' });
activity.updateView({
  level: 'ground',
  plan: false,
  explode: 0,
  stack: 0,
  isolate: false,
  selected: null,
  site: true,
});
assert.ok(
  activity.actors
    .filter((a) => a.root.visible)
    .every((a) => a.spec.role === 'doctor'),
);
const c = createCharacter({ id: 'test', role: 'nurse', variant: 1 });
c.pose('idle', 0);
const rest = c.joints.legL.quaternion.clone();
c.pose('walk', 0.2);
assert.ok(
  rest.angleTo(c.joints.legL.quaternion) > 0.1,
  'Walk deforms the skeleton',
);
assert.equal(
  c.mesh.geometry.attributes.skinIndex.count,
  c.mesh.geometry.attributes.position.count,
);
for (const a of activity.actors) {
  a.root.updateMatrixWorld(true);
  assert.ok(a.mesh.geometry.attributes.position.count > 1000);
  assert.ok(a.root.position.toArray().every(Number.isFinite));
}
const bounds = new T.Box3().setFromObject(neighborhood.root);
assert.ok(bounds.max.y > 5, 'Surroundings have actual height');
assert.ok(neighborhood.root.getObjectByName('raised-sidewalk-0'));
assert.ok(neighborhood.root.getObjectByName('neighbor-east-estimated-height'));
neighborhood.tick(0);
const first = neighborhood.traffic.map((c) => c.position.toArray());
neighborhood.tick(activityData.duration);
assert.deepEqual(
  neighborhood.traffic.map((c) => c.position.toArray()),
  first,
  'Traffic closes at scene repeat',
);
neighborhood.tick(10);
const car = neighborhood.traffic[0].position.clone();
neighborhood.tick(20);
assert.ok(car.distanceTo(neighborhood.traffic[0].position) > 1);
neighborhood.tick(10);
assert.deepEqual(car.toArray(), neighborhood.traffic[0].position.toArray());
// Arrival clearance, vehicle synchronization and deterministic entrance controls.
activity.setOptions({ filter: 'all', playing: false, enabled: true, time: 0 });
assert.equal(
  activityData.actors.filter((a) => a.role === 'reception').length,
  2,
);
for (const a of activityData.actors) {
  const coverage = timelineFor(a).reduce((n, s) => n + s.end - s.start, 0);
  assert.ok(
    Math.abs(coverage - activityData.duration) < 0.001,
    `${a.id} timeline covers the full day`,
  );
  assert.equal(a.profileId, a.id, 'Identity remains stable across every stage');
}
activity.arrival.entry.updateMatrixWorld(true);
const rightTurnRay = new T.Raycaster(
  new T.Vector3(-15.518, 0.7, -0.992),
  new T.Vector3(1, 0, 0),
  0,
  0.72,
);
assert.equal(
  rightTurnRay.intersectObject(activity.arrival.entry, true).length,
  0,
  'Right turn stays clear of handrail posts',
);
let boardingSamples = 0,
  entranceSamples = 0;
for (let t = 0; t < activityData.duration; t += 0.25) {
  const va = sampleVan(0, t),
    vb = sampleVan(1, t);
  for (const v of [va, vb])
    if (
      v.visible &&
      !v.phase.includes('handoff') &&
      !v.phase.includes('Boarding') &&
      !v.phase.includes('Unloading')
    )
      assert.ok(
        v.door < 0.001 && v.ramp < 0.001,
        'Vans move only with doors closed and ramp stowed',
      );
  assert.ok(
    !(va.visible && vb.visible && va.position.distanceTo(vb.position) < 7),
    'Vans do not share the drop-off bay',
  );
  for (const a of activityData.actors.filter(
    (a) => a.id.startsWith('arrival-') && a.role === 'participant',
  )) {
    const p = sampleActor(a, t);
    if (p.visible === false) continue;
    if (Math.abs(p.x + 20.31) < 0.025 && p.z > 2.53 && p.z < 5.44) {
      const van = sampleVan(p.vehicleId === 'van-a' ? 0 : 1, t);
      assert.ok(
        van.visible && van.ramp > 0.999 && van.door > 0.999,
        `${a.id} needs a parked van and open ramp at ${t}`,
      );
      assert.ok(Math.abs(van.position.x - ARRIVAL.dock[0]) < 0.01);
      boardingSamples++;
    }
    if (
      Math.abs(p.x - ARRIVAL.rampX) < 0.01 &&
      p.z >= ARRIVAL.rampTopZ &&
      p.z <= ARRIVAL.rampBottomZ
    )
      assert.ok(
        Math.abs(
          p.y -
            (-0.23 +
              (0.23 * (ARRIVAL.rampBottomZ - p.z)) /
                (ARRIVAL.rampBottomZ - ARRIVAL.rampTopZ)),
        ) < 0.001,
        'Feet and wheels stay on the sloped ramp',
      );
    if (Math.hypot(p.x - ARRIVAL.door[0], p.z - ARRIVAL.door[1]) < 0.35) {
      activity.setOptions({ time: t });
      assert.ok(
        activity.arrival.getDoorOpen() > 0.99,
        'Sliding entrance is open before the person crosses',
      );
      entranceSamples++;
    }
  }
}
for (const a of activityData.actors.filter((a) => a.escortFor)) {
  const leader = activityData.actors.find((p) => p.id === a.escortFor);
  let previous;
  for (let t = 0; t < activityData.duration; t += 0.05) {
    const p = sampleEscort(leader, t);
    if (p.visible !== false && previous?.visible !== false)
      assert.ok(
        Math.hypot(p.x - previous.x, p.z - previous.z) < 0.13,
        `${a.id} escort stays continuous at ${t}`,
      );
    previous = p;
  }
}
assert.ok(
  boardingSamples > 100 && entranceSamples > 20,
  'Both arrival cohorts reach the ramps and entrance',
);
activity.setOptions({ time: 80 });
const vanPose = activity.arrival.vans.map((v) => [
  ...v.root.position.toArray(),
  v.pivot.rotation.z,
]);
activity.setOptions({ time: 300 });
activity.setOptions({ time: 80 });
assert.deepEqual(
  activity.arrival.vans.map((v) => [
    ...v.root.position.toArray(),
    v.pivot.rotation.z,
  ]),
  vanPose,
  'Seek restores vans and ramps exactly',
);
console.log(
  `Arrival checks: ${boardingSamples} van-ramp samples, ${entranceSamples} doorway samples, two desk staff, ${activityData.interactions.length} interaction tracks and 41 stable person templates.`,
);
// The flexible layout and repertoire stay in sync with animation, accessibility and scrubbing.
assert.equal(dayProgram.programs.length, 10);
assert.equal(dayProgram.removedObjectIds.length, 15);
assert.ok(
  dayProgram.removedObjectIds.every((id) => m.objects.some((o) => o.id === id)),
);
assert.ok(!dayProgram.removedObjectIds.includes('day-diamond-table-04'));
const groupIds = new Set(dayProgram.stations.map((s) => s.actorId));
const signatures = new Set();
for (const session of dayProgram.programs) {
  const at = session.start + 12;
  activity.setOptions({ time: at, playing: false, filter: 'all' });
  assert.equal(programAt(at).id, session.id);
  assert.equal(activity.dayRoom.root.userData.programId, session.id);
  const standing = activity.actors.find((a) => a.spec.id === 'member-group-01');
  const seated = activity.actors.find((a) => a.spec.id === 'member-group-02');
  const wheelchair = activity.actors.find(
    (a) => a.spec.id === 'member-wheelchair',
  );
  assert.equal(seated.sample.seated, true);
  assert.equal(wheelchair.sample.seated, true);
  assert.ok(Math.abs(wheelchair.joints.hip.position.y - 0.575) < 0.001);
  signatures.add(
    [standing.sample.action, ...standing.joints.armR.quaternion.toArray()].join(
      ',',
    ),
  );
  for (const chair of activity.dayRoom.chairs)
    assert.equal(chair.root.visible, !!chair.actor.sample.seated);
  const snapshot = activity.dayRoom.props.map((p) => p.root.visible);
  activity.setOptions({ time: at + 95 });
  activity.setOptions({ time: at });
  assert.deepEqual(
    activity.dayRoom.props.map((p) => p.root.visible),
    snapshot,
    'Activity tools restore on backward seek',
  );
  assert.ok(
    activityData.interactions.some(
      (i) =>
        i.id === 'day-' + session.id &&
        i.start === session.start &&
        i.end === session.end,
    ),
  );
}
assert.ok(
  signatures.size >= 9,
  'The repertoire has distinct motion/gesture states',
);
assert.equal(programAt(720).id, programAt(0).id);
// Passing traffic must stay outside the stationary activity group and its chairs.
for (const a of activityData.actors.filter((a) => !groupIds.has(a.id)))
  for (const s of a.segments.filter((s) =>
    ['walk', 'roll'].includes(s.action),
  )) {
    for (let i = 1; i < s.path.length; i++)
      for (let j = 0; j <= 20; j++) {
        const x =
          s.path[i - 1][0] + ((s.path[i][0] - s.path[i - 1][0]) * j) / 20;
        const z =
          s.path[i - 1][1] + ((s.path[i][1] - s.path[i - 1][1]) * j) / 20;
        for (const station of dayProgram.stations)
          assert.ok(
            Math.hypot(x - station.position[0], z - station.position[1]) >=
              0.63,
            `${a.id} crosses activity seating`,
          );
      }
  }
console.log(
  'Day room checks: ten sessions, cleared front tables, seated and wheelchair modes, activity props, seek/repeat and protected circulation.',
);
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = `data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;
      this.onloadend?.();
    });
  }
};
const blob = await activity.exportCast(),
  buffer = Buffer.from(await blob.arrayBuffer());
assert.ok(
  buffer.length < 25 * 1024 * 1024,
  'Animated cast stays within the hosting asset limit',
);
assert.equal(buffer.readUInt32LE(0), 0x46546c67);
const n = buffer.readUInt32LE(12),
  gltf = JSON.parse(buffer.subarray(20, 20 + n).toString());
assert.equal(gltf.skins.length, 15);
assert.equal(gltf.animations.length, 270);
assert.ok(gltf.animations.some((a) => a.name === 'cast-doctor:walk'));
writeFileSync('public/models/seen-health-animated-cast.glb', buffer);
console.log(
  `Validated ${activity.actors.length} actors, ${activityData.roles.length} roles, ${samples} path samples, ${minWall.toFixed(3)}m minimum wall clearance; pause, repeat, seek, speed, synchronized pairs, levels and 3D context. Exported 15 rigs and 270 clips (${(buffer.length / 1024 / 1024).toFixed(2)} MB).`,
);
activity.dispose();
