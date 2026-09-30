// Run after compile-model-modules.mjs; checks the complete repeating day at 50 Hz.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from 'three';
import { sampleVan, alhambraVanWindows } from '../work/validation/arrival.mjs';
import {
  fleetParking,
  fleetReservations,
} from '../work/validation/alhambra-fleet.mjs';
import { sampleDelivery } from '../work/validation/deliveries.mjs';
import { sampleStreetCar } from '../work/validation/traffic-routes.mjs';
import { vehicleGap } from '../work/validation/vehicle-clearance.mjs';

const body = (p, kind) => ({
  ...p,
  halfWidth: kind === 'van' ? 1.125 : kind === 'truck' ? 1.15 : 0.96,
  halfLength: kind === 'van' ? 3.175 : kind === 'truck' ? 2.36 : 1.98,
});
// Independent known-answer checks for the oriented footprint calculation.
const box = (x, z, heading = 0) => ({
  position: new Vector3(x, 0, z),
  heading,
  halfWidth: 1,
  halfLength: 3,
});
assert.equal(vehicleGap(box(0, 0), box(0, 7)), 1);
assert.equal(vehicleGap(box(0, 0), box(1.5, 0)), -0.5);
assert(Math.abs(vehicleGap(box(0, 0), box(5, 0, Math.PI / 2)) - 1) < 1e-10);

const m = JSON.parse(
  fs.readFileSync('public/models/seen-alhambra-planning.json'),
);
const parkedCars = [
  [3240, 857, 0.78],
  [3290, 1520, 0.78],
].map(([x, z, heading]) =>
  body(
    {
      position: new Vector3(
        (x - m.calibration.sourcePixelOrigin[0]) / m.calibration.pixelsPerMeter,
        0,
        (z - m.calibration.sourcePixelOrigin[1]) / m.calibration.pixelsPerMeter,
      ),
      heading,
    },
    'car',
  ),
);
const samples = (time) => [
  ...Array.from({ length: 8 }, (_, i) => body(sampleVan(i, time), 'van')),
  ...Array.from({ length: 2 }, (_, i) =>
    body(sampleDelivery(i, time), 'truck'),
  ),
  ...Array.from({ length: 2 }, (_, i) => body(sampleStreetCar(i, time), 'car')),
  ...parkedCars,
];
const reservations = fleetReservations(alhambraVanWindows);
for (let i = 1; i < reservations.length; i++)
  assert(
    reservations[i].start - reservations[i - 1].end >= 4,
    'Shared driveway has a four-second clearance interval',
  );
for (const r of reservations.filter((r) => r.van >= 4)) {
  const waiting = sampleVan(r.van, r.requested),
    bay = fleetParking[r.van];
  assert.equal(waiting.phase, 'Yielding to driveway traffic');
  assert.equal(waiting.position.x, bay.x);
  assert.equal(waiting.position.z, bay.z);
}

let closest = Infinity,
  streetClosest = Infinity,
  pairs = 0;
for (let frame = 0; frame < 36000; frame++) {
  const time = frame / 50,
    vehicles = samples(time);
  for (let i = 0; i < vehicles.length; i++) {
    const a = vehicles[i];
    if (a.visible === false) continue;
    for (let j = i + 1; j < vehicles.length; j++) {
      const b = vehicles[j];
      if (b.visible === false) continue;
      const gap = vehicleGap(a, b);
      // Parked bays leave 55 cm between vans. Street crossings get a larger buffer.
      const margin = i === 10 || i === 11 || j === 10 || j === 11 ? 0.85 : 0.5;
      assert(
        gap >= margin,
        `Vehicles ${i}/${j} have only ${gap.toFixed(3)} m at ${time}s`,
      );
      closest = Math.min(closest, gap);
      if (margin === 0.85) streetClosest = Math.min(streetClosest, gap);
      pairs++;
    }
    if (i < 8) {
      const next = sampleVan(i, time + 0.002);
      const movement = next.position.clone().sub(a.position);
      assert(movement.length() < 0.03, `Van ${i} teleports at ${time}s`);
      if (movement.length() > 0.00001 && a.phase === next.phase) {
        const front = new Vector3(
          -Math.sin(a.heading),
          0,
          -Math.cos(a.heading),
        );
        const alignment =
          movement.normalize().dot(front) * (a.reverse ? -1 : 1);
        assert(alignment > 0.97, `Van ${i} drives sideways at ${time}s`);
        assert(
          a.door < 0.001 && a.ramp < 0.001,
          'Doors and ramps closed before movement',
        );
      }
    }
  }
}
// Deterministic sampling preserves the same collision-free schedule at any speed,
// when scrubbing backward, and when the animation repeats.
for (const t of [0, 130.8, 280.76, 460.74, 489.56, 719.98])
  for (const shift of [-720, 720, 1440])
    samples(t).forEach((v, i) =>
      assert(v.position.distanceTo(samples(t + shift)[i].position) < 1e-9),
    );
console.log(
  `${pairs.toLocaleString()} vehicle-pair checks passed over 12 minutes at 50 Hz; minimum gap ${closest.toFixed(2)} m, street-traffic gap ${streetClosest.toFixed(2)} m. Driveway yielding, parking, orientation, doors, reverse and loop continuity passed.`,
);
