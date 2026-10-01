import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { seatInVehicle, type VehiclePose } from '../app/model/activity';
import { fleetReservations } from '../app/model/alhambra-fleet';
import { alhambraVanWindows } from '../app/model/arrival';

const close = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

void test('seatInVehicle matches the three.js vehicle frame and round-trips', () => {
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.3, -2.4, 5.1];
  const seats: [number, number, number][] = [
    [0, 0, 0],
    [0.45, 0.6, -1.2],
    [-0.5, 1.1, 0.8],
    [1.2, -0.2, 2.5],
  ];
  for (const heading of headings)
    for (const seat of seats) {
      const pose: VehiclePose = {
        position: new T.Vector3(-20.5, -0.23, 1.5),
        heading,
        visible: true,
      };
      const world = seatInVehicle(pose, seat, Math.PI);
      // Same transform as an Object3D with rotation.y = heading.
      const frame = new T.Object3D();
      frame.position.copy(pose.position);
      frame.rotation.y = heading;
      frame.updateMatrixWorld(true);
      const expected = frame.localToWorld(new T.Vector3(...seat));
      close(world.x, expected.x, 'x');
      close(world.y, expected.y, 'y');
      close(world.z, expected.z, 'z');
      close(world.heading, heading + Math.PI, 'seat heading');
      // And back into the vehicle frame.
      const local = frame.worldToLocal(
        new T.Vector3(world.x, world.y, world.z),
      );
      close(local.x, seat[0], 'local x');
      close(local.y, seat[1], 'local y');
      close(local.z, seat[2], 'local z');
    }
});

const runs = (booked: ReturnType<typeof fleetReservations>) =>
  booked.filter((b) => b.van === 4 || b.van === 5);

void test('fleetReservations keeps the shared driveway to one maneuver with 4 s gaps', () => {
  const booked = fleetReservations(alhambraVanWindows);
  const scheduled = runs(booked);
  assert.equal(scheduled.length, 4, 'two runs each for vans E and F');
  for (const run of scheduled)
    assert.ok(run.start >= run.requested, 'a run is never moved earlier');
  // Sorted by start with every gap >= 4 s means no two bookings overlap.
  for (let i = 1; i < booked.length; i++) {
    const [a, b] = [booked[i - 1], booked[i]];
    assert.ok(
      b.start - a.end >= 4 - 1e-9,
      `van ${b.van} at ${b.start} follows van ${a.van} (until ${a.end}) by ${b.start - a.end} s`,
    );
  }
});

void test('fleetReservations pushes a run past a conflicting booking by 4 s', () => {
  const idle = [-2, -2];
  const windows = [
    {
      inbound: [20, 40],
      unload: idle,
      outbound: [150, 170],
      returning: idle,
      boarding: idle,
      leaving: idle,
    },
  ];
  const scheduled = runs(fleetReservations(windows));
  const morningE = scheduled.find((r) => r.van === 4 && r.requested === 30)!;
  assert.equal(morningE.start, 44, 'van E waits for the inbound van plus 4 s');
  assert.equal(morningE.end - morningE.start, 64, 'the run keeps its length');
  const morningF = scheduled.find((r) => r.van === 5 && r.requested === 155)!;
  assert.equal(
    morningF.start,
    174,
    'van F waits for the outbound van plus 4 s',
  );
});
