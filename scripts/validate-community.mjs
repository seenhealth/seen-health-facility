import fs from 'node:fs';
import assert from 'node:assert/strict';
import { roomPlacement } from '../work/validation/site-activity-data.mjs';
import { sampleActor } from '../work/validation/activity.mjs';
import {
  buildCommunityAsset,
  animateCommunityProp,
} from '../work/validation/community-assets.mjs';
import { showcaseFrame } from '../work/validation/showcase.mjs';
import { validateFacility } from '../work/validation/schema.mjs';
import { missingInstances } from '../work/validation/community-settings.mjs';
// Every facility stamped on a community pad has a current generated summary.
assert.deepEqual(
  missingInstances,
  [],
  `No current facility summary for ${missingInstances.join(', ')}: run npm run build:community`,
);
const model = JSON.parse(
  fs.readFileSync('public/models/seen-alhambra-planning.json'),
);
validateFacility(model);
const normalized = {
  ...model,
  objects: model.objects.map((o) => ({ ...o, layer: o.layer || 'furniture' })),
};
const data = JSON.parse(fs.readFileSync('app/data/activity-loop.json'));
const cast = data.actors.filter((a) => a.id.startsWith('community-'));
assert.equal(data.actors.length, 184);
const profiles = JSON.parse(
  fs.readFileSync('app/data/character-templates.json'),
).people;
assert.equal(new Set(data.actors.map((a) => a.profileId)).size, 184);
assert(data.actors.every((a) => profiles.some((p) => p.id === a.profileId)));
let samples = 0;
for (const actor of cast) {
  const room = model.rooms.find((r) => r.id === actor.roomId) || {
    ...model.zones.find((z) => z.id === actor.segments[0].zoneId),
    id: 'open-zone',
  };
  const clearance = roomPlacement(normalized, room);
  for (let time = 0; time < 720; time += 4) {
    const p = sampleActor(actor, time);
    assert(
      clearance.clear([p.x, p.z], actor.seated ? 0.19 : 0.28, actor.seatId),
      `${actor.id}: furniture/wall overlap at ${time}`,
    );
    for (const other of data.actors) {
      if (other.id === actor.id || other.levelId !== actor.levelId) continue;
      const q = sampleActor(other, time);
      if (q.visible === false) continue;
      assert(
        Math.hypot(p.x - q.x, p.z - q.z) > 0.58,
        `${actor.id} overlaps ${other.id} at ${time}`,
      );
    }
    samples++;
  }
}
for (const room of [
  'admin-meeting-west',
  'admin-meeting-east',
  'admin-workstations',
  'admin-conference',
]) {
  assert.equal(model.rooms.find((r) => r.id === room).kind, 'activity');
  assert(
    !model.objects.some(
      (o) =>
        o.roomId === room &&
        /admin-work|admin-conference|admin-meeting/.test(o.id),
    ),
    'Old desks and conference furniture removed',
  );
}
for (const id of ['ping-pong', 'pool', 'wii', 'karaoke']) {
  const g = buildCommunityAsset(model.assets['community-' + id]);
  let count = 0;
  g.traverse((o) => {
    if (o.userData.gameMotion) {
      const old = o.position.toArray().join() + '/' + o.scale.toArray().join();
      animateCommunityProp(o, 1.234);
      assert.notEqual(
        o.position.toArray().join() + '/' + o.scale.toArray().join(),
        old,
      );
      count++;
    }
  });
  assert(count > 0, 'Game props animate: ' + id);
}
for (let t = 0; t <= 60; t += 0.1) {
  const p = showcaseFrame(t, 'tiltshift');
  assert([p.x, p.z, p.angle, p.zoom].every(Number.isFinite));
  assert(p.zoom >= 1.2 && p.zoom <= 3.5);
}
console.log(
  `Community: ${data.actors.length} unique profiles; ${samples} new cast placement samples; 4 converted rooms; animated games and fixed tilt-shift camera.`,
);
