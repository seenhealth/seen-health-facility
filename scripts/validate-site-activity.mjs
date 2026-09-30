import './compile-model-modules.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { createSiteActivity } from '../work/validation/site-activity.mjs';
import { roomPlacement } from '../work/validation/site-activity-data.mjs';
import { sampleActor } from '../work/validation/activity.mjs';

for (const id of ['olympic', 'olympic-option', 'alveare']) {
  const model = JSON.parse(fs.readFileSync(`public/models/seen-${id}.json`));
  const scene = new T.Scene(),
    api = createSiteActivity(model, scene);
  const data = api.data;
  assert(data.actors.length >= 30, 'Populated care day');
  assert(data.roles.includes('nurse') && data.roles.includes('pt'));
  const rooms = new Map(model.rooms.map((r) => [r.id, r]));
  const clearance = new Map(
    model.rooms.map((r) => [r.id, roomPlacement(model, r)]),
  );
  for (const actor of data.actors) {
    const room = rooms.get(actor.roomId);
    assert(room, `${actor.id}: assigned to a room in this model`);
    assert.equal(actor.levelId, room.levelId);
    assert.equal(actor.segments[0].start, 0);
    assert.equal(actor.segments.at(-1).end, data.duration);
    for (let i = 1; i < actor.segments.length; i++) {
      const a = actor.segments[i - 1],
        b = actor.segments[i];
      assert.equal(a.end, b.start, `${actor.id}: continuous clock`);
      assert.deepEqual(
        a.path.at(-1),
        b.path[0],
        `${actor.id}: no teleport between tasks`,
      );
    }
    const elevation =
      model.levels.find((l) => l.id === actor.levelId).elevation +
      (model.zones.find((z) => z.id === room.zoneId).elevationOffset || 0);
    for (let time = 0; time < data.duration; time += 4) {
      const p = sampleActor(actor, time);
      if (actor.arrivalVehicleId) continue;
      assert.equal(
        p.y,
        elevation,
        `${actor.id}: correct floor and mezzanine height`,
      );
      assert(
        clearance
          .get(room.id)
          .clear(
            [p.x, p.z],
            actor.seatId ? 0.19 : actor.mobility === 'wheelchair' ? 0.49 : 0.33,
            actor.seatId,
          ),
        `${actor.id}: clear of walls, furniture and other rooms at ${time}`,
      );
    }
  }
  const view = {
    level: 'ground',
    plan: false,
    explode: 0,
    stack: 0,
    isolate: false,
    selected: null,
    site: true,
  };
  for (const level of model.levels) {
    api.updateView({ ...view, level: level.id });
    assert(api.getState().count > 0);
    assert(
      api.actors
        .filter((a) => a.root.visible)
        .every((a) => a.spec.levelId === level.id),
    );
  }
  api.updateView({ ...view, level: 'all' });
  for (const time of [0, 84, 116, 280, 719.99]) {
    api.setOptions({ time, playing: false });
    for (let i = 0; i < api.actors.length; i++)
      for (let j = i + 1; j < api.actors.length; j++) {
        const a = api.actors[i],
          b = api.actors[j];
        if (
          a.spec.levelId !== b.spec.levelId ||
          !a.root.visible ||
          !b.root.visible
        )
          continue;
        assert(
          a.root.position.distanceTo(b.root.position) > 0.6,
          `${a.spec.id}/${b.spec.id}: person separation`,
        );
      }
  }
  api.setOptions({ filter: 'staff' });
  assert(
    api.actors
      .filter((a) => a.root.visible)
      .every((a) => a.spec.role !== 'participant'),
  );
  api.setOptions({ filter: 'all' });
  for (const alternate of [{ plan: true }, { explode: 1 }, { stack: 1 }]) {
    api.updateView({ ...view, ...alternate });
    assert.equal(api.root.visible, false);
  }
  api.updateView({ ...view, level: 'all' });
  api.setOptions({ time: 0, playing: true, speed: 1 });
  api.tick(0.1);
  assert(api.getState().time > 0, 'Playback advances');
  api.setOptions({ playing: false });
  const paused = api.getState().time;
  api.tick(0.1);
  assert.equal(api.getState().time, paused, 'Pause freezes clock');
  for (const v of data.views)
    assert(
      v.id === 'all' || v.id === 'site' || rooms.has(v.id),
      'Every workflow targets a real room',
    );
  for (const interaction of data.interactions) {
    api.setOptions({
      follow: `interaction:${interaction.id}`,
      time: (interaction.start + interaction.end) / 2,
    });
    assert(
      api.actorPosition(`interaction:${interaction.id}`),
      'Follow finds interaction participants',
    );
  }
  // Fleet stops use the correct frontage, clear the building and deploy only at rest.
  api.setOptions({ enabled: true, playing: false, follow: null });
  api.updateView({ ...view, level: 'ground' });
  for (let time = 0; time < 720; time += 0.5) {
    const samples = [0, 1].map((i) => api.arrival.sampleVan(i, time));
    assert(
      samples.filter((p) => p.visible && p.ramp > 0).length <= 1,
      'One van unloading at the shared bay',
    );
    for (const p of samples) {
      if (!p.visible) continue;
      const right = new T.Vector3(Math.cos(p.heading), 0, -Math.sin(p.heading));
      const front = new T.Vector3(
        -Math.sin(p.heading),
        0,
        -Math.cos(p.heading),
      );
      for (const side of [-1.125, 1.125])
        for (const end of [-3.175, 3.175]) {
          const corner = p.position
            .clone()
            .addScaledVector(right, side)
            .addScaledVector(front, end);
          if (id === 'alveare')
            assert(corner.x > 19.9, 'Alveare van stays on east roadway');
          else assert(corner.z > 12.5, 'Olympic van clears rear building');
          if (id !== 'alveare' && corner.x > -25 && corner.x < -23.5)
            assert(
              corner.z > 23 && corner.z < 31.3,
              'Olympic van crosses fence only at driveway',
            );
        }
      if (p.ramp > 0) {
        const atRest = api.arrival.sampleVan(samples.indexOf(p), time + 0.1);
        assert(
          p.position.distanceTo(atRest.position) < 0.001,
          'Ramp deploys only while stopped',
        );
        assert(
          id === 'alveare' ? right.x < -0.99 : right.z < -0.99,
          'Passenger ramp faces entry',
        );
      }
    }
  }
  api.setOptions({ time: 60 });
  assert(api.arrival.vans[0].root.visible, 'Van A visible at drop-off');
  assert(api.arrival.vans[0].pivot.visible, 'Ramp visible at drop-off');
  assert(
    api.actorPosition('van-a').distanceTo(
      api.arrival
        .sampleVan(0, 60)
        .position.clone()
        .add(new T.Vector3(0, 1, 0)),
    ) < 0.001,
    'Follow van uses this site route',
  );
  api.setOptions({ time: 200 });
  assert(
    api.arrival.vans[1].root.visible && !api.arrival.vans[0].root.visible,
    'Van B takes its turn',
  );
  api.updateView({ ...view, level: 'upper' });
  assert.equal(
    api.arrival.root.visible,
    false,
    'Ground transport hidden on upper floor',
  );
  api.updateView(view);
  api.setOptions({ enabled: false });
  assert(
    api.arrival.vans.every((v) => !v.root.visible),
    'Disabling people also hides moving fleet',
  );
  console.log(
    `${id}: ${data.actors.length} people; room clearance, floor heights, routes, filters, view visibility and playback verified`,
  );
  api.dispose();
  assert.equal(
    scene.children.length,
    0,
    'Dispose removes animation scene objects',
  );
}
