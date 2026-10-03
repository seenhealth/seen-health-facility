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
import { buildPhotoAsset } from '../app/model/photo-assets';
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

void test('the fleet van body is one volume: sides flush with roof, nose and rear', () => {
  const [half, length] = [FLEET_VAN.halfWidth, FLEET_VAN.halfLength];
  const van = buildPhotoAsset(
    {
      kind: 'fleet-van',
      dimensions: [2 * half, 2.8, 2 * length],
      material: 'body',
      materials: { wrap: 'wrap' },
      parameters: { operable: true },
    },
    () => new T.MeshStandardMaterial(),
  )!;
  van.updateMatrixWorld(true);
  const ray = new T.Raycaster();
  /** First surface met from `from` along `dir`, van-local. */
  const hit = (from: number[], dir: number[]) => {
    ray.set(new T.Vector3(...from), new T.Vector3(...dir));
    const [first] = ray.intersectObject(van, true);
    assert.ok(first, `a ray from (${from.join(', ')}) meets the van`);
    return first.point;
  };
  // 1 cm inside the side planes, along the high roof.
  const edge = half - 0.01;
  for (let z = -1.5; z < length - 0.05; z += 0.1)
    for (const side of [-1, 1]) {
      const top = hit([side * edge, 9, z], [0, -1, 0]);
      assert.ok(
        top.y > 2.6,
        `seen from above at x ${side * edge}, z ${z.toFixed(1)} the roof is met at y ${top.y.toFixed(2)}, not a ledge or a slit`,
      );
      for (const y of [2.3, 2.6]) {
        const wall = hit([side * 9, y, z], [-side, 0, 0]);
        assert.ok(
          Math.abs(wall.x - side * half) < 1e-6,
          `seen from the side at y ${y}, z ${z.toFixed(1)} the body is met at x ${wall.x.toFixed(3)}, off the side plane ${side * half}`,
        );
      }
    }
  for (let x = -edge; x <= edge + 1e-9; x += 0.05) {
    const nose = hit([x, 0.9, -9], [0, 0, 1]).z,
      rear = hit([x, 2.3, 9], [0, 0, -1]).z,
      roofline = hit([x, 2.3, -9], [0, 0, 1]).z;
    assert.ok(
      nose < 0.03 - length,
      `the nose face covers x ${x.toFixed(2)} (met at z ${nose.toFixed(2)})`,
    );
    assert.ok(
      rear > length - 0.03,
      `the rear doors cover x ${x.toFixed(2)} (met at z ${rear.toFixed(2)})`,
    );
    // At roof-rail height nothing stands ahead of the windshield's top.
    assert.ok(
      roofline > -2.0,
      `at x ${x.toFixed(2)} the roofline starts at z ${roofline.toFixed(2)}, ahead of the windshield`,
    );
  }
});
