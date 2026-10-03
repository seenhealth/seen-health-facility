// Run after compile-model-modules.mjs; checks the complete repeating day at 50 Hz.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Box3, Vector3 } from 'three';
import {
  sampleVan,
  alhambraVanWindows,
} from '../work/validation/arrival.mjs';
import { DROP_OFF } from '../work/validation/alhambra-exterior.mjs';
import {
  FLEET_LOT,
  fleetParking,
  fleetReservations,
  fleetTimeline,
  fleetVanLabel,
} from '../work/validation/alhambra-fleet.mjs';
import {
  deliveryStops,
  receivingRamp,
  sampleDelivery,
} from '../work/validation/deliveries.mjs';
import {
  buildAlhambraExterior,
  REAR_COURT_PLANTERS,
} from '../work/validation/alhambra-exterior.mjs';
import { sampleStreetCar } from '../work/validation/traffic-routes.mjs';
import { vehicleGap } from '../work/validation/vehicle-clearance.mjs';
import { buildSiteArrival } from '../work/validation/site-arrival.mjs';
import {
  buildNeighborhood,
  siteCurbs,
  STREET_EXTENT,
} from '../work/validation/neighborhood.mjs';
import {
  careSettings,
  frontZ,
  LANE,
  laneRadius,
  streetZ,
  toWorld,
  worldDir,
} from '../work/validation/community-settings.mjs';
import { validateFacility } from '../work/validation/schema.mjs';

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
const VANS = fleetParking.length;
/**
 * Every moving vehicle: fleet vans, delivery trucks and street cars. `nose` is
 * the local z of the bonnet: vans and trucks drive toward local −z, the
 * street-car bodies toward +z.
 */
const movers = [
  ...fleetParking.map((_, i) => ({ name: fleetVanLabel(i), kind: 'van', nose: -1, sample: (t) => sampleVan(i, t) })),
  ...deliveryStops.map((stop, i) => ({ name: `Truck ${stop.id}`, kind: 'truck', nose: -1, sample: (t) => sampleDelivery(i, t) })),
  ...[0, 1].map((i) => ({ name: `Street car ${i}`, kind: 'car', nose: 1, sample: (t) => sampleStreetCar(i, t) })),
];
const samples = (time) => movers.map((v) => body(v.sample(time), v.kind));
const streetCar = (i) => movers[i].kind === 'car';

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
    if (s.kind === 'away') assert.equal(v.visible, false, `${fleetVanLabel(i)} off site is hidden at ${(s.start + s.end) / 2}`);
    if (s.kind === 'parked') assert(v.phase.startsWith('Parked'), `${fleetVanLabel(i)} parked at ${(s.start + s.end) / 2}`);
  }

// Lot obstacles a van must keep clear of: the building, the drop-off's
// landing, switchback ramp, their rails and the palm planter at the foot of
// its steps (alhambra-exterior.ts DROP_OFF), the curb islands and the west
// sidewalk (vans cross the south sidewalk only at the driveway).
const rect = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const curbs = siteCurbs(m);
const obstacles = [
  ['building', m.site.buildingOutline],
  ...['drop-off landing and upper run', 'ramp turn landing', 'ramp lower run'].map((name, i) => [name, DROP_OFF.outlines[i]]),
  ...Object.entries(DROP_OFF.rails).map(([id, r]) => [`drop-off ${id} rail`, [[r.x, r.z0], [r.x, r.z1]]]),
  ['lobby palm planter', DROP_OFF.planterOutline],
  ['west sidewalk', curbs.sidewalks[0]],
  ...curbs.islands.map((p, i) => [`curb island ${i}`, p]),
];
// What the exterior draws in the rear court up to a truck's roof (the staff
// entrance's landing and pergola, the garage wall, its hood and gate, the
// utility pole), read from the drawn meshes so the check follows the court
// as its photographs refine it.
const TRUCK_ROOF = 3.2;
const rearCourtSolids = (() => {
  const { facade } = buildAlhambraExterior(m);
  facade.updateMatrixWorld(true);
  const court = facade.getObjectByName('rear-court-staff-entrance-and-loading'),
    found = [],
    b = new Box3();
  court?.traverse((o) => {
    if (!o.isMesh) return;
    b.setFromObject(o);
    if (b.min.y < TRUCK_ROOF && b.max.y > 0.05)
      found.push([`rear court exterior ${found.length}`, rect(b.min.x, b.min.z, b.max.x, b.max.z)]);
  });
  assert(found.length > 5, "the exterior draws the rear court's staff entrance, garage wall and pole");
  return found;
})();
// Obstacles a delivery truck must keep clear of on its way in and out of the
// rear court: the building and its receiving ramps, the court's planters and
// exterior, and every curb island and sidewalk of the site.
const truckObstacles = [
  ['building', m.site.buildingOutline],
  ...deliveryStops.map((s) => {
    const r = receivingRamp(s);
    return [`${s.kind} receiving ramp`, rect(r.x0, r.z0, r.x1, r.z1)];
  }),
  ...REAR_COURT_PLANTERS.map((r, i) => [`rear court planter ${i}`, rect(...r)]),
  ...rearCourtSolids,
  ...curbs.sidewalks.map((p, i) => [`sidewalk ${i}`, p]),
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
    v.position.x + fx * v.halfLength * a + fz * v.halfWidth * b,
    v.position.z + fz * v.halfLength * a - fx * v.halfWidth * b,
  ]);
};
const LOT_CLEARANCE = 0.3;
// Where a fading van's centre may be: the last fade length before the vanish
// points (the routes are symmetric about the cross street).
assert.equal(FLEET_LOT.vanishNorth, -FLEET_LOT.vanishSouth, 'the fleet vanishes as far north as south');
const FADE_FROM = FLEET_LOT.vanishNorth - FLEET_LOT.fade;
const fadeBand = { from: Infinity, to: 0, reach: 0 };

// Heading change between consecutive samples, in radians (wrapped).
const turnBetween = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
/**
 * Minimum turning radius of a van's centre (the radius the reviewers measure):
 * over any 0.02 s step a visible, moving van may turn by at most the distance
 * it covered divided by this radius. A 6.35 m van turning tighter than this
 * swings its tail out faster than it moves forward and reads as pivoting.
 */
const MIN_TURN_RADIUS = 4;
const tightest = new Map();
/**
 * Nose-first everywhere except in a phase that says it is reversing (a step
 * that ends or starts one may go either way), no jump between frames, and no
 * turn tighter than MIN_TURN_RADIUS while visible: a vehicle that turns
 * without moving (a pivot or a heading snap) fails too. `a` and `later` are
 * samples 0.02 s apart.
 */
function checkMotion(name, kind, nose, a, later, time) {
  if (a.visible === false || later.visible === false) return;
  const front = new Vector3(nose * Math.sin(a.heading), 0, nose * Math.cos(a.heading));
  const step = later.position.clone().sub(a.position);
  const distance = step.length();
  assert(distance < 0.3, `${name} jumps ${distance.toFixed(2)} m at ${time}s ("${a.phase}" → "${later.phase}")`);
  if (distance > 0.001) {
    const forward = step.dot(front) > 0,
      reversing = [a.phase, later.phase].map((p) => p.startsWith('Reversing'));
    assert(
      forward ? !(reversing[0] && reversing[1]) : reversing[0] || reversing[1],
      `${name} moves ${forward ? 'forward' : 'backward'} during "${a.phase}" at ${time}s`,
    );
  }
  const turn = turnBetween(a.heading, later.heading);
  const best = tightest.get(kind) ?? { radius: Infinity, at: '' };
  if (turn > 1e-9 && distance / turn < best.radius)
    tightest.set(kind, { radius: distance / turn, at: `${name} at ${time}s ("${a.phase}")` });
  assert(
    turn <= (distance / MIN_TURN_RADIUS) * 1.01 + 1e-9,
    `${name} turns ${((turn * 180) / Math.PI).toFixed(1)}° over ${distance.toFixed(3)} m (radius ${(distance / turn).toFixed(2)} m < ${MIN_TURN_RADIUS} m) at ${time}s ("${a.phase}")`,
  );
}
let closest = Infinity,
  streetClosest = Infinity,
  lotClosest = Infinity,
  courtClosest = Infinity,
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
      const margin = streetCar(i) || streetCar(j) ? 0.85 : 0.5;
      assert(
        gap >= margin,
        `${movers[i].name} and ${movers[j].name} have only ${gap.toFixed(3)} m at ${time}s`,
      );
      closest = Math.min(closest, gap);
      if (margin === 0.85) streetClosest = Math.min(streetClosest, gap);
      pairs++;
    }
    const mover = movers[i],
      later = mover.sample(time + 0.02);
    checkMotion(mover.name, mover.kind, mover.nose, a, later, time);
    // Delivery trucks: rear-court obstacles, ten times a second.
    if (mover.kind === 'truck' && frame % 5 === 0)
      for (const [name, poly] of truckObstacles) {
        const gap = polygonGap(footprint(a), poly);
        courtClosest = Math.min(courtClosest, gap);
        assert(gap >= LOT_CLEARANCE, `${mover.name} is ${gap.toFixed(2)} m from the ${name} at ${time}s ("${a.phase}")`);
      }
    if (i >= VANS) continue;
    const next = sampleVan(i, time + 0.002);
    const movement = next.position.clone().sub(a.position);
    assert(movement.length() < 0.03, `${fleetVanLabel(i)} teleports at ${time}s`);
    const front = new Vector3(-Math.sin(a.heading), 0, -Math.cos(a.heading));
    if (movement.length() > 0.00001 && a.phase === next.phase) {
      const alignment =
        movement.normalize().dot(front) * (a.reverse ? -1 : 1);
      assert(alignment > 0.97, `${fleetVanLabel(i)} drives sideways at ${time}s`);
      assert(
        a.door < 0.001 && a.ramp < 0.001 && a.cabDoor < 0.001,
        'Doors and ramps closed before movement',
      );
    }
    // A van fades only over the last FLEET_LOT.fade metres before the end of
    // its off-site route, with its whole body (nose and tail) still on the
    // drawn street, and it appears or disappears only once fully faded (never
    // a pop inside the map).
    if (a.visible && a.opacity < 1) {
      const centre = Math.abs(a.position.z),
        reach = Math.max(...footprint(a).map(([, z]) => Math.abs(z)));
      assert(
        centre >= FADE_FROM - 1e-6,
        `${fleetVanLabel(i)} fades ${(FADE_FROM - centre).toFixed(1)} m before the fade band at ${time}s (${a.position.x.toFixed(1)}, ${a.position.z.toFixed(1)})`,
      );
      assert(
        reach <= STREET_EXTENT.z,
        `${fleetVanLabel(i)} fades ${(reach - STREET_EXTENT.z).toFixed(1)} m past the end of the drawn street at ${time}s (${a.position.x.toFixed(1)}, ${a.position.z.toFixed(1)})`,
      );
      fadeBand.from = Math.min(fadeBand.from, centre);
      fadeBand.to = Math.max(fadeBand.to, centre);
      fadeBand.reach = Math.max(fadeBand.reach, reach);
    }
    if (later.visible !== a.visible)
      assert(
        (later.visible ? later.opacity : a.opacity) < 0.05,
        `${fleetVanLabel(i)} pops ${later.visible ? 'in' : 'out'} at ${time}s`,
      );
    // Lot obstacles, ten times a second.
    if (frame % 5 === 0 && a.position.x > -42 && a.position.x < -10 && a.position.z > -32 && a.position.z < 12) {
      const fp = footprint(a);
      for (const [name, poly] of obstacles) {
        const gap = polygonGap(fp, poly);
        lotClosest = Math.min(lotClosest, gap);
        assert(gap >= LOT_CLEARANCE, `${fleetVanLabel(i)} is ${gap.toFixed(2)} m from the ${name} at ${time}s ("${a.phase}")`);
      }
    }
  }
}
// Parking stalls are painted off the street roadways and across no pad's drive
// stub (its two legs, the island between them and its sidewalk), so no vehicle
// drives over them: every drawn stall line against every drawn roadway slab
// and every stub, as oriented boxes (the vehicles' footprint test).
const asBox = (mesh) => {
  const { width, depth } = mesh.geometry.parameters,
    r = mesh.rotation.y;
  return { position: mesh.position, heading: Math.atan2(Math.cos(r), -Math.sin(r)), halfLength: width / 2, halfWidth: depth / 2 };
};
const drawn = (root, name) => {
  const found = [];
  root.traverse((o) => o.name === name && found.push(asBox(o)));
  return found;
};
const { root: neighborhood } = buildNeighborhood(m);
const stallLines = drawn(neighborhood, 'parking-stall-line');
const paved = [
  ...drawn(neighborhood, 'street-roadway').map((b) => ['street roadway', b]),
  ...careSettings.map((s) => {
    const rOut = laneRadius(s, s.drive.lanes - 1) + LANE / 2,
      [x0, x1] = [-rOut, rOut + 1.65],
      [z0, z1] = [frontZ(s), streetZ(s)],
      [cx, cz] = toWorld(s, [(x0 + x1) / 2, (z0 + z1) / 2]),
      [dx, dz] = worldDir(s, [0, 1]);
    return [`${s.id} drive stub`, { position: new Vector3(cx, 0, cz), heading: Math.atan2(dx, dz), halfLength: (z1 - z0) / 2, halfWidth: (x1 - x0) / 2 }];
  }),
];
assert(stallLines.length > 40 && paved.length > 10, 'the neighborhood draws its stall lines and roadways');
for (const line of stallLines)
  for (const [name, box] of paved) {
    const gap = vehicleGap(line, box);
    assert(gap > -0.001, `A stall line at (${line.position.x.toFixed(1)}, ${line.position.z.toFixed(1)}) is painted ${(-gap).toFixed(2)} m into the ${name}`);
  }
// Deterministic sampling preserves the same collision-free schedule at any speed,
// when scrubbing backward, and when the animation repeats.
for (const t of [0, 130.8, 280.76, 460.74, 489.56, 719.98])
  for (const shift of [-720, 720, 1440])
    samples(t).forEach((v, i) =>
      assert(v.position.distanceTo(samples(t + shift)[i].position) < 1e-9),
    );
// The other sites' vans, sampled as their viewer drives them (site-arrival's
// sampler on each facility's own timetable), obey the same motion rules.
let siteSamples = 0;
for (const site of ['seen-olympic', 'seen-alveare']) {
  const model = validateFacility(JSON.parse(fs.readFileSync(`public/models/${site}.json`, 'utf8')));
  const arrival = buildSiteArrival(model);
  for (const index of arrival.windows.keys())
    for (let frame = 0; frame < 36000; frame++) {
      const time = frame / 50;
      checkMotion(`${site} van ${index}`, 'site van', -1, arrival.sampleVan(index, time), arrival.sampleVan(index, time + 0.02), time);
      siteSamples++;
    }
}
const radii = [...tightest]
  .map(([kind, { radius, at }]) => `${kind} ${radius.toFixed(2)} m (${at})`)
  .join('; ');
console.log(
  `${pairs.toLocaleString()} vehicle-pair checks passed over 12 minutes at 50 Hz; minimum gap ${closest.toFixed(2)} m, street-traffic gap ${streetClosest.toFixed(2)} m, lot obstacles ${lotClosest.toFixed(2)} m, delivery trucks' rear-court obstacles ${courtClosest.toFixed(2)} m. Fades stay on the drawn street: van centres at |z| ${fadeBand.from.toFixed(1)}–${fadeBand.to.toFixed(1)} m, bodies to ${fadeBand.reach.toFixed(1)} m (street drawn to ${STREET_EXTENT.z} m). Driveway yielding, parking, orientation, doors, reverse, fades and loop continuity passed; ${stallLines.length} stall lines clear of the street roadways and the pads' drive stubs. Every fleet van, delivery truck, street car and the Olympic/Alveare vans (${siteSamples.toLocaleString()} site samples) drive nose-first outside reversing phases, never jump and turn no tighter than ${MIN_TURN_RADIUS} m; tightest: ${radii}.`,
);
