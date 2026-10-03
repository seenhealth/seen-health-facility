import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  crosses,
  routeAround,
  type Footprint,
  type Pt,
} from '../app/model/walk-route';

const van = (x: number, z: number, heading = -Math.PI / 2): Footprint => ({
  x,
  z,
  heading,
  halfWidth: 1.125,
  halfLength: 3.175,
});
const clear = (path: Pt[], fs: Footprint[]) => {
  for (let i = 1; i < path.length; i++)
    for (const f of fs)
      assert.ok(!crosses(f, path[i - 1], path[i]), `leg ${i} crosses a car`);
};

test('a clear leg needs no detour', () => {
  assert.deepEqual(routeAround([0, 0], [10, 0], [van(0, 10)]), []);
});

test('walks round a parked van instead of through it', () => {
  // A van parked across the walk (heading -pi/2: it lies along x).
  const fs = [van(5, 0)];
  const a: Pt = [5, -5],
    b: Pt = [5, 5];
  assert.ok(crosses(fs[0], a, b));
  const via = routeAround(a, b, fs);
  assert.ok(via.length >= 1);
  clear([a, ...via, b], fs);
});

test('threads a row of parked vans from the lobby to a bay door', () => {
  // The live lot's back-in bays: x -27.4, 2.8 m apart, nose toward the aisle.
  const bays = [0, 1, 2, 3, 4].map((i) => van(-27.4, -21.65 + i * 2.8));
  const lobby: Pt = [-16.7, -2.9];
  // Door side of bay 1 (+z), between it and bay 2.
  const door: Pt = [-27.6, -21.65 + 2.8 + 1.6];
  const others = bays.filter((_, i) => i !== 1 && i !== 2);
  const via = routeAround(lobby, door, others);
  clear([lobby, ...via, door], others);
});

test('a footprint holding an end of the leg is ignored', () => {
  const own = van(0, 0);
  assert.deepEqual(routeAround([0, 1.0], [0, 20], [own]), []);
});
