import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import type { Interaction } from '../app/model/activity';
import {
  buildCallArcs,
  CALL_ARC_STYLE,
  type CallPerson,
} from '../app/model/call-arcs';

/** An engine actor standing (or seated) at a point. */
const person = (
  id: string,
  [x, y, z]: [number, number, number],
  seated = false,
): CallPerson => {
  const root = new T.Object3D();
  root.position.set(x, y, z);
  return { spec: { id, seated }, root, sample: { action: 'phone' } };
};
const interaction = (
  id: string,
  actorIds: string[],
  channel?: 'phone',
): Interaction => ({
  id,
  label: id,
  category: 'hospital',
  actorIds,
  start: 100,
  end: 130,
  zoneId: 'community:hospital',
  description: '',
  ...(channel ? { channel } : {}),
});
const setup = (motion = true) => {
  const actors = [
    person('caller', [100, 0, 10]),
    person('nurse', [10, 3.35, 20], true),
    person('beside', [101, 0, 11]),
  ];
  const people = { root: new T.Group(), actors };
  const arcs = buildCallArcs({
    interactions: [
      interaction('call', ['caller', 'nurse'], 'phone'),
      interaction('in-person', ['caller', 'beside']),
      interaction('same-place', ['caller', 'beside'], 'phone'),
    ],
    people,
    motion,
  });
  const meshes = arcs.root.children as T.Mesh<
    T.BufferGeometry,
    T.ShaderMaterial
  >[];
  const line = meshes.find((m) => m.material.name === 'seen-call-arc')!;
  return { arcs, actors, people, meshes, line, u: line.material.uniforms };
};

void test('only phone calls get arcs, and only between two places', () => {
  const { arcs, meshes } = setup();
  assert.deepEqual(arcs.callIds, ['call', 'same-place']);
  arcs.tick(110, 0);
  // The call draws its line and rings; members in one place have no arc.
  assert.equal(meshes.filter((m) => m.visible).length, 2);
});

void test('the arc follows the call on the care-day clock', () => {
  const { arcs, line, u } = setup();
  arcs.tick(99, 0);
  assert.equal(line.visible, false, 'not before the call');
  arcs.tick(100, 0);
  assert.ok(line.visible && u.uHead.value === 0, 'starts drawing at the call');
  arcs.tick(100 + CALL_ARC_STYLE.drawOn / 2, 0);
  assert.ok(u.uHead.value > 0.5 && u.uHead.value < 1, 'eases out');
  arcs.tick(100 + CALL_ARC_STYLE.drawOn, 0);
  assert.equal(u.uHead.value, 1, 'fully drawn');
  assert.equal(u.uTail.value, 0);
  arcs.tick(128.5, 0);
  assert.ok(u.uTail.value > 0 && u.uTail.value < 1, 'retracts at the end');
  arcs.tick(130, 0);
  assert.equal(line.visible, false, 'gone when the call ends');
  // Scrubbing back shows the same frame at the same moment.
  arcs.tick(101, 0);
  const head = u.uHead.value;
  arcs.tick(120, 0);
  arcs.tick(101, 0);
  assert.equal(u.uHead.value, head);
});

void test('the curve rises from above the caller to above the other end', () => {
  const { arcs, u } = setup();
  arcs.tick(110, 0);
  const [p0, p1, p2, p3] = ['uP0', 'uP1', 'uP2', 'uP3'].map(
    (k) => u[k].value as T.Vector3,
  );
  const above = CALL_ARC_STYLE.above;
  assert.ok(Math.abs(p0.y - (1.72 + above)) < 1e-9, 'standing caller');
  assert.ok(Math.abs(p3.y - (3.35 + 1.33 + above)) < 1e-9, 'seated nurse');
  // The crown sits `lift` × span above the higher end, mid-way.
  const span = Math.hypot(p3.x - p0.x, p3.z - p0.z),
    crown = (p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8;
  assert.ok(
    Math.abs(crown - (p3.y + CALL_ARC_STYLE.lift * span)) < 1e-9,
    `crown ${crown}`,
  );
});

void test('an arc needs its callers in the scene and one end drawn', () => {
  const { arcs, actors, people, line } = setup();
  // The nurse's floor is not shown: the line still runs to her desk.
  actors[1].root.visible = false;
  arcs.tick(110, 0);
  assert.equal(line.visible, true, 'one end drawn');
  actors[0].root.visible = false;
  arcs.tick(110, 0);
  assert.equal(line.visible, false, 'neither end drawn');
  actors[0].root.visible = actors[1].root.visible = true;
  actors[1].sample.visible = false;
  arcs.tick(110, 0);
  assert.equal(line.visible, false, 'the nurse is out of the scene');
  actors[1].sample.visible = undefined;
  people.root.visible = false;
  arcs.tick(110, 0);
  assert.equal(line.visible, false, 'people are off');
});

void test('without motion the call shows its final state, still', () => {
  const { arcs, u } = setup(false);
  arcs.tick(100.1, 0);
  assert.equal(u.uHead.value, 1);
  assert.equal(u.uOpacity.value, 1);
  assert.deepEqual((u.uPulseAmp.value as T.Vector3).toArray(), [0, 0, 0]);
  arcs.tick(129.9, 5);
  assert.equal(u.uTail.value, 0);
});

void test('dispose frees the shared geometry and every material', () => {
  const { arcs, meshes } = setup();
  const freed = new Set<unknown>();
  for (const m of meshes)
    for (const r of [m.geometry, m.material])
      r.addEventListener('dispose', () => freed.add(r));
  arcs.dispose();
  const resources = new Set(meshes.flatMap((m) => [m.geometry, m.material]));
  assert.equal(freed.size, resources.size);
});
