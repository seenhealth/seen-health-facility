// Plan street trips around the fixed passenger/drop-off and delivery timetables.
// Waiting happens upstream of the driveway; no vehicle stops inside a crossing.
import fs from 'node:fs';
import { sampleVan } from '../work/validation/arrival.mjs';
import { sampleDelivery } from '../work/validation/deliveries.mjs';
import {
  communityVehicles,
  sampleCommunityVehicle,
} from '../work/validation/community-vehicles.mjs';
import {
  streetRoute,
  streetTripProgress,
} from '../work/validation/traffic-routes.mjs';
import { vehicleGap } from '../work/validation/vehicle-clearance.mjs';
// Sampled at the validator's 50 Hz so that a crossing judged clear here is clear there.
const step = 0.02,
  duration = 720,
  tripDuration = 120,
  margin = 0.85;
const SIZE = {
  van: [1.125, 3.175],
  truck: [1.15, 2.36],
  car: [0.96, 1.98],
  ambulance: [1.15, 2.7],
};
const body = (p, kind) => ({
  ...p,
  halfWidth: (SIZE[kind] ?? SIZE.car)[0],
  halfLength: (SIZE[kind] ?? SIZE.car)[1],
});
const conflict = (a, b) =>
  b.visible !== false &&
  Math.abs(a.position.x - b.position.x) < 12 &&
  Math.abs(a.position.z - b.position.z) < 12 &&
  vehicleGap(a, b) < margin;
// Holds must be clear of the fleet and the deliveries at every instant; the
// community vehicles share the ring lanes and pass a hold for a moment, so
// they constrain only the trips.
const frames = Math.round(duration / step) + 1;
const fixedHold = Array.from({ length: frames }, (_, frame) => [
  ...Array.from({ length: 8 }, (_, i) =>
    body(sampleVan(i, frame * step), 'van'),
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    body(sampleDelivery(i, frame * step), 'truck'),
  ),
]);
const fixed = fixedHold.map((list, frame) => [
  ...list,
  ...communityVehicles.map((v) =>
    body(sampleCommunityVehicle(v.id, frame * step), v.kind),
  ),
]);
const trips = [[], []];
const hold = [0, 1].map((i) => body(streetRoute(i, 0), 'car'));
for (let i = 0; i < 2; i++) {
  for (let frame = 0; frame < fixedHold.length; frame++)
    if (fixedHold[frame].some((p) => conflict(hold[i], p)))
      throw Error(`Unsafe holding point ${i} at ${frame * step}`);
  const samples = Array.from({ length: Math.round(tripDuration / step) + 1 }, (_, j) =>
    body(streetRoute(i, streetTripProgress(j * step, tripDuration)), 'car'),
  );
  let earliest = 0;
  while (earliest + tripDuration <= duration) {
    let start = earliest;
    for (; start + tripDuration <= duration; start++) {
      let safe = true;
      for (let j = 0; j < samples.length && safe; j++) {
        const frame = Math.round(start / step) + j;
        const blockers = [...fixed[frame], ...(i === 0 ? [hold[1]] : [])];
        if (blockers.some((p) => conflict(samples[j], p))) safe = false;
      }
      if (safe) break;
    }
    if (start + tripDuration > duration) break;
    trips[i].push([start, start + tripDuration]);
    earliest = start + tripDuration + 4;
  }
  if (!trips[i].length) throw Error(`No clear street trips for car ${i}`);
  // The next car must also yield to this car's complete motion and holding periods.
  for (let frame = 0; frame < fixed.length; frame++) {
    const t = frame * step,
      trip = trips[i].find(([a, b]) => t >= a && t < b);
    fixed[frame].push(
      trip ? samples[Math.round((t - trip[0]) / step)] : hold[i],
    );
  }
}
fs.writeFileSync(
  'app/data/street-traffic.json',
  JSON.stringify({ duration, clearance: margin, trips }, null, 2) + '\n',
);
console.log('Reserved street trips:', JSON.stringify(trips));
