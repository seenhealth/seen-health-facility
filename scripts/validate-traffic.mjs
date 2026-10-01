// Run after compile-model-modules.mjs; checks the complete repeating day at 50 Hz.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from 'three';
import {
  sampleVan,
  alhambraVanWindows,
  ARRIVAL,
} from '../work/validation/arrival.mjs';
import {
  fleetParking,
  fleetReservations,
  fleetTimeline,
} from '../work/validation/alhambra-fleet.mjs';
import { sampleDelivery } from '../work/validation/deliveries.mjs';
import { sampleStreetCar } from '../work/validation/traffic-routes.mjs';
import { vehicleGap } from '../work/validation/vehicle-clearance.mjs';
import { siteArrivalLayout } from '../work/validation/site-arrival.mjs';
import { siteCurbs, STREET_EXTENT } from '../work/validation/neighborhood.mjs';
import { CatmullRomCurve3 } from 'three';

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
const VANS = fleetParking.length;
const samples = (time) => [
  ...Array.from({ length: VANS }, (_, i) => body(sampleVan(i, time), 'van')),
  ...Array.from({ length: 2 }, (_, i) =>
    body(sampleDelivery(i, time), 'truck'),
  ),
  ...Array.from({ length: 2 }, (_, i) => body(sampleStreetCar(i, time), 'car')),
  ...parkedCars,
];
const streetCar = (i) => i === VANS + 2 || i === VANS + 3;

// Driveway: one maneuver on the lot at a time, four seconds apart.
const reservations = fleetReservations(alhambraVanWindows);
for (let i = 1; i < reservations.length; i++)
  assert(
    reservations[i].start - reservations[i - 1].end >= 4,
    'Shared driveway has a four-second clearance interval',
  );
// Timeline: a van yielding the driveway waits in its bay; off site it is hidden.
for (let i = 0; i < VANS; i++)
  for (const s of fleetTimeline(i, alhambraVanWindows)) {
    const v = sampleVan(i, (s.start + s.end) / 2);
    if (s.kind === 'yielding') {
      assert.equal(v.phase, 'Yielding to driveway traffic');
      assert.equal(v.position.x, fleetParking[i].x);
      assert.equal(v.position.z, fleetParking[i].z);
    }
    if (s.kind === 'away') assert.equal(v.visible, false, `Van ${i} off site is hidden at ${(s.start + s.end) / 2}`);
    if (s.kind === 'parked') assert(v.phase.startsWith('Parked'), `Van ${i} parked at ${(s.start + s.end) / 2}`);
  }

// Lot obstacles a van must keep clear of: the building, the entrance ramp and
// its landing, the curb islands and the west sidewalk (vans cross the south
// sidewalk only at the driveway).
const rect = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const curbs = siteCurbs(m);
const obstacles = [
  ['building', m.site.buildingOutline],
  [
    'entrance ramp',
    rect(ARRIVAL.rampX - 0.64, ARRIVAL.rampTopZ, ARRIVAL.rampX + 0.64, ARRIVAL.rampBottomZ),
  ],
  ['ramp landing', rect(-16.16, -1.632, -14.1, -0.352)],
  ['west sidewalk', curbs.sidewalks[0]],
  ...curbs.islands.map((p, i) => [`curb island ${i}`, p]),
];
const inside = (p, poly) => {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0])
      odd = !odd;
  }
  return odd;
};
const segmentGap = (p, a, b) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    l = dx * dx + dz * dz,
    t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)) : 0;
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
};
const crosses = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};
function polygonGap(A, B) {
  if (A.some((p) => inside(p, B)) || B.some((p) => inside(p, A))) return 0;
  let best = Infinity;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++) {
      const a = A[i],
        b = A[(i + 1) % A.length],
        c = B[j],
        d = B[(j + 1) % B.length];
      if (crosses(a, b, c, d)) return 0;
      best = Math.min(best, segmentGap(a, c, d), segmentGap(b, c, d), segmentGap(c, a, b), segmentGap(d, a, b));
    }
  return best;
}
const footprint = (v) => {
  const fx = -Math.sin(v.heading),
    fz = -Math.cos(v.heading);
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([a, b]) => [
    v.position.x + fx * 3.175 * a + fz * 1.125 * b,
    v.position.z + fz * 3.175 * a - fx * 1.125 * b,
  ]);
};
const LOT_CLEARANCE = 0.3;

// Heading change between consecutive samples, in radians (wrapped).
const turnBetween = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
/**
 * Minimum turning radius of a van's centre (the radius the reviewers measure):
 * over any 0.02 s step a visible, moving van may turn by at most the distance
 * it covered divided by this radius. A 6.35 m van turning tighter than this
 * swings its tail out faster than it moves forward and reads as pivoting.
 */
const MIN_TURN_RADIUS = 4;
const SITE_MAX_TURN_PER_SAMPLE = 25;
let closest = Infinity,
  streetClosest = Infinity,
  lotClosest = Infinity,
  pairs = 0,
  tightest = Infinity,
  tightestAt = '';
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
      const margin = streetCar(i) || streetCar(j) ? 0.85 : 0.5;
      assert(
        gap >= margin,
        `Vehicles ${i}/${j} have only ${gap.toFixed(3)} m at ${time}s`,
      );
      closest = Math.min(closest, gap);
      if (margin === 0.85) streetClosest = Math.min(streetClosest, gap);
      pairs++;
    }
    if (i >= VANS) continue;
    const next = sampleVan(i, time + 0.002);
    const movement = next.position.clone().sub(a.position);
    assert(movement.length() < 0.03, `Van ${i} teleports at ${time}s`);
    const front = new Vector3(-Math.sin(a.heading), 0, -Math.cos(a.heading));
    if (movement.length() > 0.00001 && a.phase === next.phase) {
      const alignment =
        movement.normalize().dot(front) * (a.reverse ? -1 : 1);
      assert(alignment > 0.97, `Van ${i} drives sideways at ${time}s`);
      assert(
        a.door < 0.001 && a.ramp < 0.001 && a.cabDoor < 0.001,
        'Doors and ramps closed before movement',
      );
    }
    // Fading happens only beyond the drawn street ends, and a van appears or
    // disappears only once fully faded (never a pop inside the map).
    if (a.opacity < 1)
      assert(
        Math.abs(a.position.z) > STREET_EXTENT.z - 5 || Math.abs(a.position.x) > STREET_EXTENT.x - 5,
        `Van ${i} fades inside the map at ${time}s (${a.position.x.toFixed(1)}, ${a.position.z.toFixed(1)})`,
      );
    const later = sampleVan(i, time + 0.02);
    if (later.visible !== a.visible)
      assert(
        (later.visible ? later.opacity : a.opacity) < 0.05,
        `Van ${i} pops ${later.visible ? 'in' : 'out'} at ${time}s`,
      );
    // Lot obstacles, ten times a second.
    if (frame % 5 === 0 && a.position.x > -42 && a.position.x < -10 && a.position.z > -32 && a.position.z < 12) {
      const fp = footprint(a);
      for (const [name, poly] of obstacles) {
        const gap = polygonGap(fp, poly);
        lotClosest = Math.min(lotClosest, gap);
        assert(gap >= LOT_CLEARANCE, `Van ${i} is ${gap.toFixed(2)} m from the ${name} at ${time}s ("${a.phase}")`);
      }
    }
    // Nose-first everywhere except in a phase that says it is reversing (a
    // step that ends or starts one may go either way), no jump between frames,
    // and no turn tighter than MIN_TURN_RADIUS while visible: a van that turns
    // without moving (a pivot or a heading snap) fails too.
    if (later.visible) {
      const step = later.position.clone().sub(a.position);
      const distance = step.length();
      assert(distance < 0.3, `Van ${i} jumps ${distance.toFixed(2)} m at ${time}s ("${a.phase}" → "${later.phase}")`);
      if (distance > 0.001) {
        const forward = step.dot(front) > 0,
          reversing = [a.phase, later.phase].map((p) => p.startsWith('Reversing'));
        assert(
          forward ? !(reversing[0] && reversing[1]) : reversing[0] || reversing[1],
          `Van ${i} moves ${forward ? 'forward' : 'backward'} during "${a.phase}" at ${time}s`,
        );
      }
      const turn = turnBetween(a.heading, later.heading);
      if (turn > 1e-9 && distance / turn < tightest) {
        tightest = distance / turn;
        tightestAt = `van ${i} at ${time}s ("${a.phase}")`;
      }
      assert(
        turn <= (distance / MIN_TURN_RADIUS) * 1.01 + 1e-9,
        `Van ${i} turns ${((turn * 180) / Math.PI).toFixed(1)}° over ${distance.toFixed(3)} m (radius ${(distance / turn).toFixed(2)} m < ${MIN_TURN_RADIUS} m) at ${time}s ("${a.phase}")`,
      );
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
// The other sites' approach and departure curves must be free of hairpins too.
let siteMaxTurn = 0;
for (const contextStyle of ['alveare', 'olympic']) {
  const layout = siteArrivalLayout({ contextStyle });
  for (const [points, seconds] of [
    [layout.approach, alhambraVanWindows[0].inbound[1] - alhambraVanWindows[0].inbound[0]],
    [layout.departure, alhambraVanWindows[0].outbound[1] - alhambraVanWindows[0].outbound[0]],
  ]) {
    const curve = new CatmullRomCurve3(
      points.map(([x, z]) => new Vector3(x, 0, z)),
      false,
      'centripetal',
    );
    let previous = null;
    for (let t = 0; t <= seconds; t += 0.02) {
      const d = curve.getTangentAt(Math.min(1, t / seconds)),
        heading = Math.atan2(d.x, d.z) + Math.PI;
      if (previous !== null) {
        const turn = (turnBetween(previous, heading) * 180) / Math.PI;
        siteMaxTurn = Math.max(siteMaxTurn, turn);
        assert(turn <= SITE_MAX_TURN_PER_SAMPLE, `${contextStyle} van route turns ${turn.toFixed(1)}° in 0.02 s`);
      }
      previous = heading;
    }
  }
}
console.log(
  `${pairs.toLocaleString()} vehicle-pair checks passed over 12 minutes at 50 Hz; minimum gap ${closest.toFixed(2)} m, street-traffic gap ${streetClosest.toFixed(2)} m, lot obstacles ${lotClosest.toFixed(2)} m. Driveway yielding, parking, orientation, doors, reverse, fades and loop continuity passed; tightest turn radius ${tightest.toFixed(2)} m (${tightestAt}; floor ${MIN_TURN_RADIUS} m), Olympic/Alveare ${siteMaxTurn.toFixed(1)}° per 0.02 s, no backward motion outside reversing phases.`,
);
