import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  insideRoom,
  roomPlacement,
} from '../work/validation/site-activity-data.mjs';
import { sampleActor } from '../work/validation/activity.mjs';
import {
  buildCommunityAsset,
  animateCommunityProp,
} from '../work/validation/community-assets.mjs';
import { showcaseFrame } from '../work/validation/showcase.mjs';
import { polygonArea, validateFacility } from '../work/validation/schema.mjs';
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
// Owner walkthrough 2026-10: 184 + the karaoke duet partner + 6 in rehab +
// 16 in the day room and admin wing.
assert.equal(data.actors.length, 207);
const profiles = JSON.parse(
  fs.readFileSync('app/data/character-templates.json'),
).people;
assert.equal(new Set(data.actors.map((a) => a.profileId)).size, 207);
assert(data.actors.every((a) => profiles.some((p) => p.id === a.profileId)));
// People who work between rooms (the owner review's recreation therapists,
// the quiet-room onlooker who steps out, the banquette regulars who visit the
// tree seat) are checked in whichever room they are in at each sample: their
// `roomId` is the room they belong to; elsewhere the smallest room holding
// the point applies, and a point in no room (a doorway) its zone. A seated
// sample sits inside its seat, so that chair or bench is exempt (not only the
// actor's own `seatId`), the seated radius follows the segment, and a walk
// that joins or leaves a seat may come up to that seat within its last or
// first 1.2 m (a person may approach the seat they sit in).
const placements = new Map(),
  placementFor = (room) => {
    if (!placements.has(room.id))
      placements.set(room.id, roomPlacement(normalized, room));
    return placements.get(room.id);
  };
const roomFor = (actor, p) => {
  const own = model.rooms.find((r) => r.id === actor.roomId);
  if (own && insideRoom(p, own.polygon)) return own;
  const inside = model.rooms
    .filter((r) => r.levelId === actor.levelId && insideRoom(p, r.polygon))
    .sort((a, b) => polygonArea(a.polygon) - polygonArea(b.polygon))[0];
  if (inside) return inside;
  const zone =
    model.zones.find(
      (z) => z.levelId === actor.levelId && insideRoom(p, z.polygon),
    ) || model.zones.find((z) => z.id === actor.segments[0].zoneId);
  return { ...zone, id: 'open-zone:' + zone.id };
};
const seatKinds = /chair|bench|stool|seat|sofa/;
const seatAt = (p) =>
  model.objects.find((o) => {
    const spec = model.assets[o.assetId];
    if (!seatKinds.test(spec.kind) || o.levelId !== 'ground') return false;
    const [w, , d] = spec.dimensions.map((v, i) => v * o.scale[i]),
      dx = p[0] - o.position[0],
      dz = p[1] - o.position[2],
      x = Math.cos(o.rotation) * dx - Math.sin(o.rotation) * dz,
      z = Math.sin(o.rotation) * dx + Math.cos(o.rotation) * dz;
    return Math.abs(x) <= w / 2 + 0.05 && Math.abs(z) <= d / 2 + 0.05;
  })?.id;
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1.2;
const seatFor = (actor, p) => {
  const at = [p.x, p.z],
    n = actor.segments.length,
    s = actor.segments[p.segmentIndex];
  if (p.seated ?? actor.seated) return seatAt(at) ?? actor.seatId;
  if (['walk', 'roll'].includes(s.action)) {
    const before = actor.segments[(p.segmentIndex + n - 1) % n],
      after = actor.segments[(p.segmentIndex + 1) % n];
    if ((after.seated ?? actor.seated) && near(at, s.path.at(-1)))
      return seatAt(s.path.at(-1)) ?? actor.seatId;
    if ((before.seated ?? actor.seated) && near(at, s.path[0]))
      return seatAt(s.path[0]) ?? actor.seatId;
  }
  return actor.seatId;
};
let samples = 0;
for (const actor of cast) {
  for (let time = 0; time < 720; time += 4) {
    const p = sampleActor(actor, time),
      at = [p.x, p.z],
      seated = p.seated ?? actor.seated;
    assert(
      placementFor(roomFor(actor, at)).clear(
        at,
        seated ? 0.19 : 0.28,
        seatFor(actor, p),
      ),
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
// Game props move on their table's clock while people play (a cue ball
// waits at its tee until the shot, so sample a whole period) and come to
// rest once the players leave.
for (const id of ['ping-pong', 'pool', 'wii', 'karaoke']) {
  const g = buildCommunityAsset(model.assets['community-' + id]);
  let count = 0;
  g.traverse((o) => {
    if (o.userData.gameMotion) {
      const state = () =>
        o.position.toArray().join() + '/' + o.scale.toArray().join();
      const seen = new Set();
      for (let t = 0; t < 48; t += 0.25) {
        animateCommunityProp(o, t, 2);
        seen.add(state());
      }
      assert(seen.size > 4, `Game prop moves with players: ${id}`);
      // Nobody playing: it eases to rest and stays there.
      for (let i = 0; i < 200; i++) animateCommunityProp(o, 100 + i * 0.3, 0);
      const rest = state();
      for (let i = 0; i < 40; i++) animateCommunityProp(o, 160 + i * 0.3, 0);
      assert.equal(state(), rest, `Game prop rests without players: ${id}`);
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
