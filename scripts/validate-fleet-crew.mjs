// Fleet crew choreography: drivers seated while their van moves, riders seated
// only in a visible van (and hidden by the engine while it fades below
// SEATED_MIN_OPACITY), no person becoming visible (or vanishing) while seated
// in a vehicle in view (every arrival comes in from off site; the drivers of
// the vans parked on the lot walk to and from the fleet office and in and out
// through the driver's door), cabin walks and ramp escorts continuous, the
// driver close behind each rider's party on the ramp, and the new lobby waits
// clear of walls, and everyone on foot at the drop-off clear of its rails and
// bike rack and on its walking surfaces. Runs over the base loop and the story
// source, as the viewer plays them.
//
//   npm run validate:fleet
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';

const { sim, activity, crew, story, deliveries, fleet, body, arrival, exterior } = await loadSim({
  sim: 'app/sim/index.ts',
  arrival: 'app/model/arrival.ts',
  exterior: 'app/model/alhambra-exterior.ts',
  activity: 'app/model/activity.ts',
  crew: 'app/model/fleet-crew.ts',
  story: 'app/sim/story-source.ts',
  deliveries: 'app/model/deliveries.ts',
  fleet: 'app/model/alhambra-fleet.ts',
  body: 'app/model/photo-assets.ts',
});
const { FLEET_VAN_RAMP: RAMP, FLEET_VAN_CAB_DOOR: CAB, FLEET_VAN_SIDE_DOOR: SIDE } = body;
/** The van's side panels, van-local x (fleet van half width less the panel inset, as photo-assets.ts builds them). */
const SIDE_X = fleet.FLEET_VAN.halfWidth - 0.03;
/** Van-local (x, z) of a world point for a van pose. */
const toLocal = (van, p) => {
  const c = Math.cos(van.heading),
    sn = Math.sin(van.heading),
    dx = p.x - van.position.x,
    dz = p.z - van.position.z;
  return { x: dx * c - dz * sn, z: dx * sn + dz * c };
};
/** Where a walk from `a` to `b` (van-local) crosses the panel plane x = `wall`, as its z; null when it does not. */
const crossing = (a, b, wall) =>
  (a.x - wall) * (b.x - wall) < 0 ? a.z + ((b.z - a.z) * (wall - a.x)) / (b.x - a.x) : null;
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
// Every arrival at the drop-off sets off from off site, so its riders take
// their seats out of view.
let arrivals = 0;
for (const v of vanIds.keys())
  for (const s of fleet.fleetTimeline(v, arrival.alhambraVanWindows))
    if (s.trip === 'toDock') {
      arrivals++;
      assert.equal(sim.sampleVan(v, s.start).visible, false, `${fleet.fleetVanLabel(v)} sets off for the drop-off at ${s.start} in view`);
    }
assert.ok(arrivals >= 6, `the fleet makes its drop-off arrivals (${arrivals})`);
/** A van standing in its bay or at the curb (parked, or yielding the driveway). */
const standing = (van) => /^(Parked|Yielding)/.test(van.phase);
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
const totals = { actors: 0, drivers: 0, riders: 0, rampEscorts: 0, rampAscents: 0, escortedUp: 0, samples: 0, fadeHidden: 0, outOfView: 0, officeWalks: 0 };
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
let driverDoorCrossings = 0,
  slidingDoorCrossings = 0,
  officeGap = Infinity;
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
    cabSide = new Map(),
    doorSide = new Map();
  for (let t = 0; t <= DURATION + 1e-9; t += dt) {
    const tt = t % DURATION,
      vansNow = vanIds.map((_, v) => sim.sampleVan(v, tt));
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
        // … and never shown sitting in a van that stands in its bay (its
        // driver walks in through the driver's door just before it pulls out).
        if (f.visible !== false && standing(van) && a.role !== 'driver') seatedInParked.push(`${id}@${tt}`);
      }
      // No person becomes visible (or vanishes) while seated in a vehicle in
      // view, parked or not: riders are picked up while their van is out of
      // sight before its arrival and dropped off once it has faded out after
      // its departure; drivers take the wheel of an arrival out of sight and
      // walk in and out of a parked van through the driver's door.
      if (p && t > 0 && (f.visible !== false) !== (p.visible !== false)) {
        const appears = f.visible !== false,
          seat = appears ? f.seatedIn : p.seatedIn,
          van = seat && vehicle(seat, appears ? (tt - dt + DURATION) % DURATION : tt);
        if (seat) {
          assert.ok(
            !activity.seatsShown(van),
            `${name}: ${id} ${appears ? 'becomes visible' : 'vanishes'} while seated in ${seat}, which is in view (${van.phase}) at ${tt.toFixed(2)} ("${p.title}" → "${f.title}")`,
          );
          totals.outOfView++;
        }
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
      // On foot, everyone (riders, escorts, drivers) passes a standing van's
      // door-side panel only through the open sliding door.
      vansNow.forEach((van, v) => {
        const key = `${id}@${v}`,
          before = doorSide.get(key),
          local = { ...toLocal(van, f), x0: van.position.x, z0: van.position.z, door: van.door };
        doorSide.set(key, local);
        if (!before || !van.visible || f.visible === false || f.seatedIn || p?.visible === false || p?.seatedIn) return;
        if (before.x0 !== local.x0 || before.z0 !== local.z0 || Math.abs(local.z) > 3.2) return;
        const z = crossing(before, local, SIDE_X);
        if (z === null) return;
        slidingDoorCrossings++;
        assert.ok(
          z >= SIDE.front && z <= SIDE.rear && Math.min(before.door, local.door) > 0.9,
          `${name}: ${id} passes through ${vanIds[v]}'s door-side panel at ${tt.toFixed(2)} (z ${z.toFixed(2)}, opening ${SIDE.front}–${SIDE.rear}, door ${local.door.toFixed(2)}, "${f.title}")`,
        );
      });
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
      const local = { ...toLocal(van, f), door: van.cabDoor, onFoot: !f.seatedIn && f.visible !== false };
      const before = cabSide.get(d.id);
      if (before && before.onFoot && local.onFoot && van.visible && Math.abs(local.z) < 3.2) {
        const z = crossing(before, local, -SIDE_X);
        if (z !== null) {
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
  assert.deepEqual(seatedInParked.slice(0, 3), [], `${name}: no rider sits in a van standing in its bay`);
  // Drivers of the vans that park on the lot between runs come from the fleet
  // office in the center: before each pull-out from a bay or curb spot they
  // are seen walking up and getting in (never popping into the cab), after
  // each return getting out and walking off, and on those walks they keep
  // clear of everyone else in view.
  const people = source.actors.filter((x) => ['ground', 'site'].includes(x.levelId));
  for (const d of drivers) {
    const v = vanIds.indexOf(d.segments.find((s) => vanIds.includes(s.vehicleId)).vehicleId);
    for (const s of fleet.fleetTimeline(v, arrival.alhambraVanWindows)) {
      if (s.trip !== 'out' && s.trip !== 'home') continue;
      const [from, to] = s.trip === 'out' ? [s.start - 8, s.start] : [s.end, s.end + 8];
      for (let t = from; t <= to; t += 0.1)
        assert.ok(place(source, byId, d, t).visible !== false, `${name}: ${d.id} is out of sight at ${t.toFixed(1)}, ${s.trip === 'out' ? 'before' : 'after'} ${vanIds[v]}'s ${s.trip === 'out' ? 'pull-out at ' + s.start.toFixed(1) : 'return at ' + s.end.toFixed(1)}`);
      assert.ok(!place(source, byId, d, from).seatedIn === (s.trip === 'out'), `${name}: ${d.id} ${s.trip === 'out' ? 'walks up to' : 'gets out of'} ${vanIds[v]} around ${s.trip === 'out' ? s.start : s.end}`);
      totals.officeWalks++;
    }
    for (const seg of d.segments) {
      if (!['Out to the van', 'Back to the fleet office'].includes(seg.title)) continue;
      for (let t = seg.start; t <= seg.end; t += 0.1) {
        const me = place(source, byId, d, t);
        for (const o of people) {
          if (o === d) continue;
          const q = place(source, byId, o, t);
          if (q.visible === false) continue;
          const gap = Math.hypot(q.x - me.x, q.z - me.z);
          assert.ok(gap >= 0.6, `${name}: ${d.id} passes ${gap.toFixed(2)} m from ${o.id} at ${t.toFixed(1)} ("${seg.title}" / "${q.title}")`);
          officeGap = Math.min(officeGap, gap);
        }
      }
    }
  }
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
  // Ramp escorts. Every rider who leaves a fleet van at the drop-off comes
  // down its ramp with the driver close behind; every rider who boards there
  // goes up it with the driver close behind or steadying them from beside the
  // ramp foot. The driver trails the rider's party by 0.35–1.2 m on the ramp.
  const dockPose = { position: new T.Vector3(fleet.FLEET_LOT.dock[0], 0, fleet.FLEET_LOT.dock[1]), heading: fleet.FLEET_LOT.dockHeading };
  const sill = activity.seatInVehicle(dockPose, [RAMP.sill[0], 0, RAMP.sill[1]]),
    foot = activity.seatInVehicle(dockPose, [RAMP.foot[0], 0, RAMP.foot[1]]);
  const atPoint = (p, q) => Math.hypot(p[0] - q.x, p[1] - q.z) < 0.05;
  const onRamp = (p) => Math.abs((p.x - sill.x) * (foot.z - sill.z) - (p.z - sill.z) * (foot.x - sill.x)) < 0.25 &&
    Math.min(sill.x, foot.x) - 0.05 <= p.x && p.x <= Math.max(sill.x, foot.x) + 0.05 &&
    Math.min(sill.z, foot.z) - 0.05 <= p.z && p.z <= Math.max(sill.z, foot.z) + 0.05;
  const pathLength = (path) => path.reduce((sum, q, i) => (i ? sum + Math.hypot(q[0] - path[i - 1][0], q[1] - path[i - 1][1]) : 0), 0);
  // Expected from the rides themselves: a stretch of riding a fleet van that
  // ends with steps through its door sill is a descent to come, one that
  // starts with steps through it an ascent just made.
  const expected = { down: 0, up: 0 },
    found = { down: 0, up: 0, escortedUp: 0, steadiedUp: 0 };
  const viaSill = (seg) => !!seg && seg.action !== 'ride' && seg.path.some((q) => atPoint(q, sill));
  for (const a of source.actors) {
    if (a.role === 'driver' || a.escortFor) continue;
    a.segments.forEach((s, i) => {
      if (s.action !== 'ride' || !vanIds.includes(s.vehicleId) || a.segments[i - 1]?.action === 'ride') return;
      let j = i;
      while (a.segments[j + 1]?.action === 'ride') j++;
      if (viaSill(a.segments[j + 1])) expected.down++;
      if (viaSill(a.segments[i - 1])) expected.up++;
    });
  }
  for (const a of source.actors) {
    if (a.role === 'driver' || a.escortFor) continue;
    const escort = source.actors.find((e) => e.escortFor === a.id);
    for (const s of a.segments) {
      if (!vanIds.includes(s.vehicleId) || !['walk', 'roll'].includes(s.action)) continue;
      const down = s.path.length === 2 && atPoint(s.path[0], sill) && atPoint(s.path[1], foot);
      const up = s.path.length > 2 && atPoint(s.path.at(-1), sill) && atPoint(s.path.at(-2), foot);
      if (!down && !up) continue;
      // When the rider sets foot on the ramp: the start of a descent, the last leg of a boarding walk.
      const onAt = down ? s.start : s.start + ((s.end - s.start) * pathLength(s.path.slice(0, -1))) / pathLength(s.path);
      const v = vanIds.indexOf(s.vehicleId),
        dock = sim.sampleVan(v, onAt);
      assert.ok(dock.visible && dock.ramp > 0.999 && dock.phase !== 'Parked in assigned bay', `${name}: ${a.id} uses ${s.vehicleId}'s ramp at ${onAt.toFixed(1)} while it is not deployed (${dock.phase}, ramp ${dock.ramp.toFixed(2)})`);
      const driver = drivers.find((d) => d.segments.some((x) => x.vehicleId === s.vehicleId));
      let trailing = 0,
        seen = false,
        steadied = false;
      for (let t = onAt - 1; t < s.end + 12; t += 0.1) {
        const r = place(source, byId, a, t),
          d = place(source, byId, driver, t);
        // Steadying: beside the ramp foot, facing it, as the rider sets off up the ramp.
        if (up && Math.abs(t - onAt) < 1 && !onRamp(d) && Math.hypot(d.x - foot.x, d.z - foot.z) < 1.6 && d.action === 'greet') steadied = true;
        if (!onRamp(r) && !onRamp(d)) continue;
        const partyRear = escort ? place(source, byId, escort, t) : r;
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
        found.down++;
      } else {
        assert.ok((seen && trailing >= 2) || steadied, `${name}: ${driver.id} neither escorts ${a.id} up the ramp nor steadies them from its foot at ${onAt.toFixed(1)} (${trailing.toFixed(1)} s trailing)`);
        found.up++;
        if (seen && trailing >= 2) found.escortedUp++;
        else found.steadiedUp++;
      }
    }
  }
  assert.ok(expected.down > 0 && expected.up > 0, `${name}: riders use the fleet's ramps (${expected.down} down, ${expected.up} up)`);
  assert.deepEqual([found.down, found.up], [expected.down, expected.up], `${name}: every ramp descent and ascent is checked (found ${found.down} down / ${found.up} up, expected ${expected.down} / ${expected.up})`);
  assert.ok(found.escortedUp > 0, `${name}: the driver escorts at least one rider up a ramp`);
  totals.rampEscorts += found.down;
  totals.rampAscents += found.up;
  totals.escortedUp += found.escortedUp;
  totals.actors += source.actors.length;
  totals.drivers += drivers.length;
  totals.riders += crewIds.length - drivers.length;
  console.log(`${name}: ${source.actors.length} actors, ${drivers.length} drivers, ${crewIds.length - drivers.length} riders seated.`);
}
// The drop-off (DROP_OFF in alhambra-exterior.ts): everyone on foot, as the
// viewer plays the day with the community layer, keeps their route clearance
// (nav.ts; escorts and staff the wall clearance) from its rails and the bike
// rack, never steps across a rail, and on the landing, the switchback's
// runs and the turn landing walks at the surface's height (on the steps,
// between a tread and the one above it). Between the docked van's nose and
// the lobby wall (the passage round the nose, the switchback and the landing,
// all single file) people outside one party keep half a metre apart.
const { DROP_OFF } = exterior;
const dropOffEdges = [
  ...Object.entries(DROP_OFF.rails).map(([id, r]) => ({ id: `${id} rail`, a: [r.x, r.z0], b: [r.x, r.z1] })),
  ...DROP_OFF.bikeRackOutline.map((a, i, all) => ({ id: 'bike rack', a, b: all[(i + 1) % all.length] })),
];
const edgeGap = (p, { a, b }) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dz * t - p[1]);
};
const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
const crossesEdge = (p, q, { a, b }) => side(p, q, a) * side(p, q, b) < 0 && side(a, b, p) * side(a, b, q) < 0;
const riser = (DROP_OFF.top - DROP_OFF.street) / (DROP_OFF.steps.count + 1);
const onSteps = ([x, z]) => {
  const st = DROP_OFF.steps;
  return x >= st.x0 && x < st.x1 && z >= st.z0 && z <= st.z1;
};
const near = { x0: -26, x1: -13, z0: -9, z1: 11 };
const nearDropOff = ([x, z]) => x > near.x0 && x < near.x1 && z > near.z0 && z < near.z1;
assert.ok(Math.abs(-Math.sin(fleet.FLEET_LOT.dockHeading) - 1) < 1e-9, 'the docked van faces +x, toward the switchback');
const pastNose = fleet.FLEET_LOT.dock[0] + fleet.FLEET_VAN.halfLength,
  SINGLE_FILE_GAP = 0.5;
const levelElevation = (id) => model.levels.find((l) => l.id === id)?.elevation || 0;
const dropOff = { samples: 0, onSurface: 0, people: new Set(), railGap: Infinity, railGapAt: '', spacing: Infinity, spacingAt: '' };
for (const [name, base] of [
  ['base loop', activity.activityData],
  ['story', story.storyActivitySource().source],
]) {
  const source = sim.alhambraSource(model, base),
    byId = new Map(source.actors.map((a) => [a.id, a]));
  const visitors = source.actors
    .filter((a) => a.levelId !== 'upper' && a.segments.some((s) => s.action !== 'ride' && s.path.some(nearDropOff)))
    .map((a) => ({ a, clearance: a.escortFor || !a.mobility ? sim.WALL_CLEARANCE : sim.MOBILITY_CLEARANCE[a.mobility], prev: null }));
  for (let t = 0; t <= DURATION + 1e-9; t += 0.05) {
    const tt = t % DURATION,
      here = [];
    for (const v of visitors) {
      const { a, clearance, prev } = v,
        f = place(source, byId, a, tt);
      const onFoot = f.visible !== false && !f.seat && !f.seatedIn;
      const p = [f.x, f.z];
      v.prev = onFoot ? p : null;
      if (!onFoot || !nearDropOff(p)) continue;
      dropOff.samples++;
      for (const e of dropOffEdges) {
        const gap = e.id === 'bike rack' && inside(p, DROP_OFF.bikeRackOutline) ? 0 : edgeGap(p, e);
        if (gap < dropOff.railGap) {
          dropOff.railGap = gap;
          dropOff.railGapAt = `${a.id} to the ${e.id} at ${tt.toFixed(2)} (${name})`;
        }
        assert.ok(gap >= clearance - 1e-6, `${name}: ${a.id} is ${gap.toFixed(2)} m from the drop-off's ${e.id} at ${tt.toFixed(2)} (needs ${clearance}; "${f.title}" at ${p.map((x) => x.toFixed(2)).join(', ')})`);
        if (prev) assert.ok(!crossesEdge(prev, p, e), `${name}: ${a.id} steps across the drop-off's ${e.id} at ${tt.toFixed(2)} ("${f.title}")`);
      }
      const surface = DROP_OFF.surface(p[0], p[1]);
      if (surface !== null) {
        const y = f.y ?? levelElevation(a.levelId) + (model.zones.find((z) => z.id === f.zoneId)?.elevationOffset || 0);
        const ok = onSteps(p) ? y >= surface - 0.01 && y <= surface + riser + 0.01 : Math.abs(y - surface) <= 0.01;
        assert.ok(ok, `${name}: ${a.id} walks at y ${y.toFixed(3)} on the drop-off at ${p.map((x) => x.toFixed(2)).join(', ')}, where the surface is at ${surface.toFixed(3)} (${tt.toFixed(2)}, "${f.title}")`);
        dropOff.onSurface++;
        dropOff.people.add(a.id);
      }
      if (p[0] > pastNose && p[0] < arrival.ARRIVAL.door[0]) here.push({ a, p, title: f.title });
    }
    for (let i = 0; i < here.length; i++)
      for (let k = i + 1; k < here.length; k++) {
        const [m, n] = [here[i], here[k]];
        if (m.a.escortFor === n.a.id || n.a.escortFor === m.a.id) continue;
        const gap = Math.hypot(m.p[0] - n.p[0], m.p[1] - n.p[1]);
        if (gap < dropOff.spacing) {
          dropOff.spacing = gap;
          dropOff.spacingAt = `${m.a.id}/${n.a.id} at ${tt.toFixed(2)} (${name})`;
        }
        assert.ok(gap >= SINGLE_FILE_GAP, `${name}: ${m.a.id} and ${n.a.id} pass ${gap.toFixed(2)} m apart at the drop-off at ${tt.toFixed(2)} ("${m.title}" / "${n.title}")`);
      }
  }
}
assert.ok(dropOff.people.size >= 6, `riders walk the drop-off's switchback (${[...dropOff.people].join(', ')})`);

console.log(
  `Fleet crew: ${arrivals} drop-off arrivals set off out of sight, ${totals.outOfView} seated people appearing or vanishing only with their van out of sight, ${totals.officeWalks} driver walks between the fleet office and a parked van (nearest person ${officeGap.toFixed(2)} m), ${totals.rampEscorts} ramp descents escorted by the driver, ${totals.rampAscents} ascents attended (${totals.escortedUp} escorted up the ramp, the rest steadied from its foot), ${driverDoorCrossings} cab-door passages through the open driver's door, ${slidingDoorCrossings} passages through the open sliding door, ${dropOff.people.size} people on the drop-off's landing and ramp (${dropOff.onSurface.toLocaleString()} samples at its surface height; nearest rail or bike rack ${dropOff.railGap.toFixed(2)} m, ${dropOff.railGapAt}; closest two people outside one party ${dropOff.spacing.toFixed(2)} m, ${dropOff.spacingAt}), ${totals.fadeHidden} seated people hidden by the engine in vans below ${activity.SEATED_MIN_OPACITY} opacity, ${totals.samples.toLocaleString()} placement samples; cabin walks, seat visibility, driver-in-cab and wall clearance passed.`,
);
