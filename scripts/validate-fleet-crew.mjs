// Fleet crew choreography: drivers seated while their van moves, riders seated
// only in a visible van (and hidden by the engine while it fades below
// SEATED_MIN_OPACITY), cabin walks and ramp escorts continuous, the driver
// close behind each rider's party on the ramp, and the new lobby waits clear of
// walls. Runs over the base loop and the story source, as the viewer plays them.
//
//   npm run validate:fleet
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';

const { sim, activity, crew, story, deliveries, fleet, body } = await loadSim({
  sim: 'app/sim/index.ts',
  activity: 'app/model/activity.ts',
  crew: 'app/model/fleet-crew.ts',
  story: 'app/sim/story-source.ts',
  deliveries: 'app/model/deliveries.ts',
  fleet: 'app/model/alhambra-fleet.ts',
  body: 'app/model/photo-assets.ts',
});
const { FLEET_VAN_RAMP: RAMP, FLEET_VAN_CAB_DOOR: CAB } = body;
const model = sim.validateFacility(
  JSON.parse(readFileSync('public/models/seen-alhambra-planning.json', 'utf8')),
);
const grid = sim.navGrid(model);
const zones = model.zones.filter((z) => z.levelId === 'ground' && z.id !== 'adjacent');
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
const DURATION = 720,
  vanIds = fleet.fleetParking.map((_, i) => fleet.fleetVanId(i));
// The ids the engine registers (registerCenterVehicles, as the viewer and
// alhambraVehicles() do): every van id above must be one of them, and every
// seat must name one.
const registry = activity.createVehicleRegistry();
activity.registerCenterVehicles(registry, fleet.fleetParking.length, sim.sampleVan, true);
const registered = new Set(registry.ids());
for (const id of vanIds) assert.ok(registered.has(id), `${id} is registered with the engine (${[...registered].join(', ')})`);
assert.equal(registered.size, vanIds.length + deliveries.deliveryStops.length, 'the engine registers the vans and the delivery trucks');
const vehicle = (id, t) => {
  const v = vanIds.indexOf(id);
  if (v >= 0) return activity.sampleVan ? activity.sampleVan(v, t) : sim.sampleVan(v, t);
  const d = deliveries.deliveryStops.findIndex((s) => s.id === id);
  return d >= 0 ? deliveries.sampleDelivery(d, t) : null;
};
const vanSpeed = (v, t) => {
  const a = sim.sampleVan(v, t),
    b = sim.sampleVan(v, t + 0.02);
  return a.position.distanceTo(b.position) / 0.02;
};
/** Where the viewer puts a person: escort following, own seat when seated, seat in the vehicle frame. */
function place(source, byId, a, t) {
  const partner = a.escortFor ? byId.get(a.escortFor) : null;
  let s = partner ? activity.sampleEscort(partner, t) : activity.sampleActor(a, t);
  if (partner && s.vehicleId && s.seat) s = activity.sampleActor(a, t);
  const ride = s.vehicleId && s.seat ? vehicle(s.vehicleId, t) : null;
  if (ride) {
    const placed = activity.seatInVehicle(ride, s.seat, s.seatHeading);
    s = { ...s, ...placed, visible: s.visible !== false && activity.seatsShown(ride), seatedIn: s.vehicleId };
  }
  return s;
}

const sources = [
  ['base loop', crew.withFleetCrew(activity.activityData)],
  ['story', crew.withFleetCrew(story.storyActivitySource().source)],
];
const totals = { actors: 0, drivers: 0, riders: 0, rampEscorts: 0, samples: 0, fadeHidden: 0 };
/**
 * Moments when a fleet van is drawn see-through (fading in or out at the end
 * of the street), every 0.05 s. The engine itself is checked at these times:
 * nobody seated in a van may be drawn while it is below SEATED_MIN_OPACITY.
 */
const fadeTimes = [];
for (let k = 0; k < DURATION / 0.05; k++) {
  const t = k * 0.05;
  if (vanIds.some((_, v) => {
    const van = sim.sampleVan(v, t);
    return van.visible && van.opacity < 1;
  }))
    fadeTimes.push(t);
}
assert.ok(fadeTimes.length > 100, `the fleet fades in and out during the day (${fadeTimes.length} samples)`);
let driverDoorCrossings = 0;
for (const [name, source] of sources) {
  const byId = new Map(source.actors.map((a) => [a.id, a]));
  assert.equal(new Set(source.actors.map((a) => a.id)).size, source.actors.length, `${name}: unique ids`);
  for (const id of vanIds)
    assert.ok(source.actors.some((a) => a.role === 'driver' && a.segments.some((s) => s.vehicleId === id)), `${name}: ${id} has a driver`);
  const crewIds = source.actors
    .filter((a) => a.segments.some((s) => s.seat && vanIds.includes(s.vehicleId)))
    .map((a) => a.id);
  // Structure: full coverage, contiguous, no teleport between steps or over the loop seam.
  for (const a of source.actors) {
    assert.equal(a.segments[0].start, 0, `${a.id} starts at 0`);
    assert.equal(a.segments.at(-1).end, DURATION, `${a.id} ends at ${DURATION}`);
    a.segments.forEach((s, i) => {
      const next = a.segments[(i + 1) % a.segments.length];
      assert.ok(s.end > s.start, `${a.id}[${i}] "${s.title}" has positive length`);
      if (i < a.segments.length - 1) assert.ok(Math.abs(s.end - next.start) < 1e-6, `${a.id} contiguous at ${s.end} ("${s.title}" → "${next.title}")`);
      assert.deepEqual(s.path.at(-1), next.path[0], `${a.id}: no teleport after "${s.title}" (${s.end}s)`);
      if (s.heights) assert.equal(s.heights.length, s.path.length, `${a.id} "${s.title}" heights match path`);
      if (s.seat)
        assert.ok(
          registered.has(s.vehicleId),
          `${a.id} "${s.title}" sits in an unregistered vehicle "${s.vehicleId}" (registered: ${[...registered].join(', ')})`,
        );
    });
  }
  // Sampled motion.
  const dt = 0.05,
    prev = new Map();
  const drivers = source.actors.filter((a) => a.role === 'driver' && a.segments.some((s) => vanIds.includes(s.vehicleId)));
  const seatedInParked = [],
    cabSide = new Map();
  for (let t = 0; t <= DURATION + 1e-9; t += dt) {
    const tt = t % DURATION;
    for (const id of crewIds) {
      const a = byId.get(id),
        f = place(source, byId, a, tt),
        p = prev.get(id);
      totals.samples++;
      if (f.visible !== false && p && p.visible !== false && !f.seatedIn && !p.seatedIn) {
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        assert.ok(d < 0.6, `${name}: ${id} jumps ${d.toFixed(2)} m at ${tt.toFixed(2)} ("${p.title}" → "${f.title}")`);
      }
      if (f.seatedIn) {
        const van = vehicle(f.seatedIn, tt);
        // Riders are seated only while their van is visible (the engine hides them otherwise) …
        if (f.visible !== false) assert.ok(van.visible, `${name}: ${id} visibly seated in an invisible ${f.seatedIn} at ${tt}`);
        // … and never shown sitting in a van parked in its bay.
        if (f.visible !== false && van.phase.startsWith('Parked')) seatedInParked.push(`${id}@${tt}`);
      }
      // People inside a van's footprint while it moves must be seated in it.
      if (f.visible !== false && !f.seatedIn && a.levelId !== 'upper')
        for (const [v, vid] of vanIds.entries()) {
          const van = sim.sampleVan(v, tt);
          if (!van.visible || vanSpeed(v, tt) < 0.05) continue;
          const dx = f.x - van.position.x,
            dz = f.z - van.position.z,
            nx = -Math.sin(van.heading),
            nz = -Math.cos(van.heading);
          const along = dx * nx + dz * nz,
            across = dx * nz - dz * nx;
          assert.ok(Math.abs(along) > 3.175 || Math.abs(across) > 1.125, `${name}: ${id} is outside/under moving ${vid} at ${tt} ("${f.title}")`);
        }
      // Visible people on the ground floor stay clear of walls.
      if (f.visible !== false && !f.seatedIn && a.levelId === 'ground' && f.y === undefined || (f.visible !== false && !f.seatedIn && a.levelId === 'ground' && f.y >= -0.01)) {
        const zone = zones.find((z) => inside([f.x, f.z], z.polygon));
        if (zone) {
          const c = sim.wallClearanceAt(grid, [f.x, f.z]);
          assert.ok(c >= 0.15, `${name}: ${id} inside a wall at ${tt} (${f.x.toFixed(2)}, ${f.z.toFixed(2)}, ${c.toFixed(2)} m)`);
        }
      }
      prev.set(id, f);
    }
    // Drivers are in their seat, and seen there, whenever their van moves in
    // view; on foot at the drop-off they pass the van's driver-side panel
    // only through the open driver's door.
    for (const d of drivers) {
      const vid = d.segments.find((s) => vanIds.includes(s.vehicleId)).vehicleId,
        v = vanIds.indexOf(vid),
        van = sim.sampleVan(v, tt),
        f = place(source, byId, d, tt);
      if (vanSpeed(v, tt) > 0.05) {
        assert.equal(f.seatedIn, vid, `${name}: ${d.id} is out of the cab while ${vid} moves at ${tt} ("${f.title}")`);
        if (activity.seatsShown(van)) assert.ok(f.visible !== false, `${name}: ${vid} drives in view without its driver at ${tt} ("${f.title}")`);
      }
      const c = Math.cos(van.heading),
        sn = Math.sin(van.heading),
        dx = f.x - van.position.x,
        dz = f.z - van.position.z,
        local = { x: dx * c - dz * sn, z: dx * sn + dz * c, door: van.cabDoor, onFoot: !f.seatedIn && f.visible !== false };
      const before = cabSide.get(d.id);
      if (before && before.onFoot && local.onFoot && van.visible && Math.abs(local.z) < 3.2) {
        const wall = -1.095;
        if ((before.x - wall) * (local.x - wall) < 0) {
          const k = (wall - before.x) / (local.x - before.x),
            z = before.z + (local.z - before.z) * k;
          driverDoorCrossings++;
          assert.ok(
            z >= CAB.hinge && z <= CAB.rear && Math.min(before.door, local.door) > 0.9,
            `${name}: ${d.id} passes through ${vid}'s driver-side panel at ${tt.toFixed(2)} (z ${z.toFixed(2)}, door ${local.door.toFixed(2)}, "${f.title}")`,
          );
        }
      }
      cabSide.set(d.id, local);
    }
  }
  assert.deepEqual(seatedInParked.slice(0, 3), [], `${name}: nobody sits in a van parked in its bay`);
  // The engine draws nobody seated in a van that has faded below
  // SEATED_MIN_OPACITY (characters share materials, so they cannot fade with
  // it), and still draws its riders once it is solid enough.
  const engine = activity.createActivity(model, new T.Scene(), undefined, source);
  let seatedInFade = 0;
  for (const t of fadeTimes) {
    engine.setOptions({ time: t, playing: false });
    for (const a of engine.actors) {
      const s = a.sample;
      if (!s.vehicleId || !s.seat || !vanIds.includes(s.vehicleId)) continue;
      const van = engine.vehicles.sample(s.vehicleId, t);
      if (!van.visible || van.opacity >= 1) continue;
      seatedInFade++;
      if (van.opacity < activity.SEATED_MIN_OPACITY) {
        assert.ok(!a.root.visible, `${name}: ${a.spec.id} is drawn in ${s.vehicleId} at opacity ${van.opacity.toFixed(2)} at ${t.toFixed(2)} ("${s.title}")`);
        totals.fadeHidden++;
      } else if (s.visible !== false)
        assert.ok(a.root.visible, `${name}: ${a.spec.id} is hidden in ${s.vehicleId} at opacity ${van.opacity.toFixed(2)} at ${t.toFixed(2)} ("${s.title}")`);
    }
  }
  assert.ok(seatedInFade > 0, `${name}: someone rides in a fading van`);
  engine.dispose();
  // Ramp escorts: for every descent or ascent the driver trails the rider's party by 0.4–1.2 m on the ramp.
  for (const a of source.actors) {
    if (a.role === 'driver' || a.escortFor) continue;
    const escort = source.actors.find((e) => e.escortFor === a.id);
    for (const s of a.segments) {
      if (!vanIds.includes(s.vehicleId) || !['walk', 'roll'].includes(s.action)) continue;
      const v = vanIds.indexOf(s.vehicleId),
        dock = sim.sampleVan(v, s.start);
      if (!dock.visible || dock.ramp < 0.999) continue;
      const sill = activity.seatInVehicle(dock, [RAMP.sill[0], 0, RAMP.sill[1]]),
        foot = activity.seatInVehicle(dock, [RAMP.foot[0], 0, RAMP.foot[1]]);
      const onRamp = (p) => Math.abs((p.x - sill.x) * (foot.z - sill.z) - (p.z - sill.z) * (foot.x - sill.x)) < 0.25 &&
        Math.min(sill.x, foot.x) - 0.05 <= p.x && p.x <= Math.max(sill.x, foot.x) + 0.05 &&
        Math.min(sill.z, foot.z) - 0.05 <= p.z && p.z <= Math.max(sill.z, foot.z) + 0.05;
      const down = Math.hypot(s.path[0][0] - sill.x, s.path[0][1] - sill.z) < 0.05 && s.path.length === 2;
      const up =
        s.path.length > 2 &&
        Math.hypot(s.path.at(-1)[0] - sill.x, s.path.at(-1)[1] - sill.z) < 0.05 &&
        Math.hypot(s.path.at(-2)[0] - foot.x, s.path.at(-2)[1] - foot.z) < 0.05;
      if (!down && !up) continue;
      const driver = drivers.find((d) => d.segments.some((x) => x.vehicleId === s.vehicleId));
      let trailing = 0,
        seen = false;
      for (let t = s.start; t < s.end + 12; t += 0.1) {
        const r = place(source, byId, a, t),
          d = place(source, byId, driver, t);
        if (!onRamp(r) && !onRamp(d)) continue;
        const rear = escort ? place(source, byId, escort, t) : r;
        const partyRear = escort ? rear : r;
        const gap = Math.hypot(d.x - partyRear.x, d.z - partyRear.z);
        if (onRamp(d) && d.action !== 'idle' && onRamp(partyRear)) {
          seen = true;
          const behind = down ? Math.hypot(d.x - sill.x, d.z - sill.z) < Math.hypot(partyRear.x - sill.x, partyRear.z - sill.z)
            : Math.hypot(d.x - foot.x, d.z - foot.z) < Math.hypot(partyRear.x - foot.x, partyRear.z - foot.z);
          assert.ok(behind && gap >= 0.35 && gap <= 1.2, `${name}: ${driver.id} is ${gap.toFixed(2)} m from ${a.id}'s party on the ramp at ${t.toFixed(1)} (${behind ? 'behind' : 'ahead'})`);
          trailing += 0.1;
        }
      }
      if (down) {
        assert.ok(seen && trailing >= 2, `${name}: ${driver.id} escorts ${a.id} down the ramp (${trailing.toFixed(1)} s trailing)`);
        totals.rampEscorts++;
      }
    }
  }
  totals.actors += source.actors.length;
  totals.drivers += drivers.length;
  totals.riders += crewIds.length - drivers.length;
  console.log(`${name}: ${source.actors.length} actors, ${drivers.length} drivers, ${crewIds.length - drivers.length} riders seated.`);
}
console.log(
  `Fleet crew: ${totals.rampEscorts} ramp descents escorted by the driver, ${driverDoorCrossings} cab-door passages through the open driver's door, ${totals.fadeHidden} seated people hidden by the engine in vans below ${activity.SEATED_MIN_OPACITY} opacity, ${totals.samples.toLocaleString()} placement samples; cabin walks, seat visibility, driver-in-cab and wall clearance passed.`,
);
