import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as T from 'three';
import { seatInVehicle, type VehiclePose } from '../app/model/activity';
import {
  FLEET_LOT,
  FLEET_VAN,
  FLEET_VAN_MARGIN,
  fleetParking,
  fleetReservations,
  sampleFleetVan,
} from '../app/model/alhambra-fleet';
import { alhambraVanWindows } from '../app/model/arrival';
import { vehicleGap } from '../app/model/vehicle-clearance';

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

void test('fleetReservations keeps the shared driveway to one maneuver with 4 s gaps', () => {
  const booked = fleetReservations(alhambraVanWindows);
  assert.ok(booked.length > alhambraVanWindows.length, 'the day has bookings');
  for (const b of booked) {
    assert.ok(b.end > b.start, `van ${b.van} books a real span`);
    assert.ok(b.start >= b.requested, `van ${b.van} is never moved earlier`);
  }
  // Sorted by start with every gap >= 4 s: no two maneuvers share the lot.
  for (let i = 1; i < booked.length; i++) {
    const [a, b] = [booked[i - 1], booked[i]];
    assert.ok(a.start <= b.start, 'reservations are sorted by start');
    assert.ok(
      b.start - a.end >= 4 - 1e-9,
      `van ${b.van} at ${b.start} follows van ${a.van} (until ${a.end}) by ${b.start - a.end} s`,
    );
  }
  // Across the loop seam the last booking still ends before the first starts.
  const [first, last] = [booked[0], booked.at(-1)!];
  assert.ok(
    last.end - 720 <= first.start + 1e-9,
    `van ${last.van} (until ${last.end}) overlaps van ${first.van} at ${first.start} across the seam`,
  );
});

void test('fleet vans maneuver past a parking spot or the drop-off only while it is empty', () => {
  const spots = [
    ...fleetParking,
    {
      x: FLEET_LOT.dock[0],
      z: FLEET_LOT.dock[1],
      heading: FLEET_LOT.dockHeading,
    },
  ];
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const standingAt = (v: { position: T.Vector3; heading: number }) =>
    spots.findIndex(
      (s) =>
        Math.hypot(v.position.x - s.x, v.position.z - s.z) < 1e-6 &&
        Math.abs(wrap(v.heading - s.heading)) < 1e-6,
    );
  // The planner checks each sweep every 10 cm; 5 cm of slack covers the
  // samples that fall between its stations.
  const margin = FLEET_VAN_MARGIN - 0.05;
  let checked = 0,
    closest = Infinity;
  for (let frame = 0; frame < 720 * 20; frame++) {
    const time = frame / 20;
    const vans = fleetParking.map((_, i) => {
      const v = sampleFleetVan(i, time, alhambraVanWindows);
      return { ...v, ...FLEET_VAN, spot: standingAt(v) };
    });
    for (const [i, a] of vans.entries()) {
      if (!a.visible || a.spot >= 0) continue;
      for (const [j, b] of vans.entries()) {
        if (j === i || b.spot < 0) continue;
        const gap = vehicleGap(a, b);
        closest = Math.min(closest, gap);
        checked++;
        assert.ok(
          gap >= margin,
          `van ${i} ("${a.phase}") passes ${gap.toFixed(2)} m from van ${j} standing at spot ${b.spot} at ${time} s`,
        );
      }
    }
  }
  assert.ok(
    checked > 1000,
    `moving vans were checked against parked ones (${checked})`,
  );
  assert.ok(closest >= margin, `closest pass ${closest.toFixed(2)} m`);
});
