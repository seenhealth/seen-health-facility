// Run after compile-model-modules.mjs. Checks the distributed-care layer over
// the whole 720 s day: every pad's access stub joins its street at the near
// edge and stays off the streets; community vehicles keep clear of the fleet,
// the delivery trucks, the street cars and each other at 50 Hz; drive
// nose-first with no hairpins or reversing; keep doors and ramps shut while
// moving; and the community cast's tracks are contiguous, walk at human
// speeds on the drawn pads, stubs or the center's site, ride only in
// registered seats and never stand in each other.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3 } from 'three';
import { sampleVan } from '../work/validation/arrival.mjs';
import { streetSlabs } from '../work/validation/neighborhood.mjs';
import { STUB_SIDEWALK } from '../work/validation/community-pads.mjs';
import {
  fleetParking,
  fleetVanId,
  fleetVanLetter,
} from '../work/validation/alhambra-fleet.mjs';
import { sampleDelivery } from '../work/validation/deliveries.mjs';
import { sampleStreetCar } from '../work/validation/traffic-routes.mjs';
import { vehicleGap } from '../work/validation/vehicle-clearance.mjs';
import {
  communityVehicles,
  sampleCommunityVehicle,
  VEHICLE_DECOR,
} from '../work/validation/community-vehicles.mjs';
import {
  communitySource,
  COMMUNITY_CATEGORIES,
} from '../work/validation/community-people.mjs';
import {
  careSettings,
  frontZ,
  LANE,
  laneRadius,
  settingZone,
  streetZ,
  toLocal,
  toWorld,
} from '../work/validation/community-settings.mjs';
import {
  activityData,
  sampleActor,
  seatInVehicle,
} from '../work/validation/activity.mjs';
import { composeSources } from '../work/validation/sources.mjs';

const model = JSON.parse(
  fs.readFileSync('public/models/seen-alhambra-planning.json'),
);
const DIMENSIONS = {
  van: [1.125, 3.175],
  truck: [1.15, 2.36],
  car: [0.96, 1.98],
  ambulance: [1.15, 2.7],
};
const body = (p, kind) => ({
  ...p,
  halfWidth: DIMENSIONS[kind][0],
  halfLength: DIMENSIONS[kind][1],
});
const parkedCars = [
  [3240, 857, 0.78],
  [3290, 1520, 0.78],
].map(([x, z, heading]) =>
  body(
    {
      position: new Vector3(
        (x - model.calibration.sourcePixelOrigin[0]) /
          model.calibration.pixelsPerMeter,
        0,
        (z - model.calibration.sourcePixelOrigin[1]) /
          model.calibration.pixelsPerMeter,
      ),
      heading,
    },
    'car',
  ),
);
const others = (time) => [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: fleetVanId(i),
    ...body(sampleVan(i, time), 'van'),
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `truck-${i}`,
    ...body(sampleDelivery(i, time), 'truck'),
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    id: `street-${i}`,
    street: true,
    ...body(sampleStreetCar(i, time), 'car'),
  })),
  ...parkedCars.map((c, i) => ({ id: `parked-${i}`, ...c })),
];
const mine = (time) =>
  communityVehicles.map((v) => ({
    id: v.id,
    ...body(sampleCommunityVehicle(v.id, time), v.kind),
  }));

// --- Access stubs -----------------------------------------------------------
// A pad's stub runs along its centre-line from the edge of the street it
// joins (`road.from`: street just beyond it, none on the pad's side) to the
// pad's front edge (`road.to`). Drawn from the front edge to `road.from`, its
// drive legs and the raised sidewalk beside the entry leg (community-pads.ts)
// never lie on a street, and the walk's street-end anchors stand on that
// sidewalk. The streets are the slabs the scene draws (neighborhood.ts
// `streetSlabs`).
const slabs = streetSlabs();
const onStreet = ([x, z]) =>
  slabs.some(
    ({ min, max }) => x > min[0] && x < max[0] && z > min[1] && z < max[1],
  );
const at = (p) => `(${p.map((v) => v.toFixed(1)).join(', ')})`;
let stubs = 0;
for (const s of careSettings) {
  const [fromX, fromZ] = toLocal(s, s.road.from),
    [toX, toZ] = toLocal(s, s.road.to),
    front = frontZ(s);
  assert(
    Math.abs(fromX) < 1e-6 && Math.abs(toX) < 1e-6,
    `${s.id}: the access stub ${at(s.road.from)} → ${at(s.road.to)} is off the pad's centre-line`,
  );
  const beyond = onStreet(toWorld(s, [0, fromZ + 0.01])),
    padSide = onStreet(toWorld(s, [0, fromZ - 0.01]));
  assert(
    beyond && !padSide,
    `${s.id}: road.from ${at(s.road.from)} is not on the near edge of the street it joins (${
      padSide && !beyond
        ? 'it is on the far edge, so the stub crosses the street'
        : padSide
          ? 'it is inside the street'
          : 'there is no street beyond it'
    })`,
  );
  assert(
    Math.abs(toZ - front) < 1e-6,
    `${s.id}: road.to ${at(s.road.to)} is ${(toZ - front).toFixed(2)} m from the pad's front edge`,
  );
  const r = laneRadius(s, s.drive.lanes - 1) + LANE / 2,
    walk = [
      r + STUB_SIDEWALK.offset - STUB_SIDEWALK.width / 2,
      r + STUB_SIDEWALK.offset + STUB_SIDEWALK.width / 2,
    ],
    corners = [
      [-r, front],
      [walk[1], front],
      [walk[1], fromZ],
      [-r, fromZ],
    ].map((p) => toWorld(s, p)),
    xs = corners.map((p) => p[0]),
    zs = corners.map((p) => p[1]),
    [x0, x1, z0, z1] = [
      Math.min(...xs),
      Math.max(...xs),
      Math.min(...zs),
      Math.max(...zs),
    ],
    crossed = slabs.find(
      ({ min, max }) =>
        x0 < max[0] - 1e-6 &&
        x1 > min[0] + 1e-6 &&
        z0 < max[1] - 1e-6 &&
        z1 > min[1] + 1e-6,
    );
  assert(
    !crossed,
    crossed &&
      `${s.id}: the access stub (x ${x0.toFixed(1)}–${x1.toFixed(1)}, z ${z0.toFixed(1)}–${z1.toFixed(1)}) lies on the street slab ${at(crossed.min)}–${at(crossed.max)}`,
  );
  for (const [name, p] of Object.entries(s.anchors)) {
    if (!name.startsWith('sidewalkEnd')) continue;
    const [x, z] = toLocal(s, p);
    assert(
      x >= walk[0] && x <= walk[1] && z >= front && z <= fromZ + 1e-6,
      `${s.id}: ${name} ${at(p)} is off the stub's sidewalk`,
    );
  }
  stubs++;
}

// --- Vehicles ---------------------------------------------------------------
// Presentation comes from the registry: every van wears its own livery letter
// after the center's fleet, every decor has a builder, every vehicle a name.
const letters = new Set(fleetParking.map((_, i) => fleetVanLetter(i)));
for (const v of communityVehicles) {
  assert(v.name, `${v.id}: name`);
  if (v.decor) assert(VEHICLE_DECOR[v.decor], `${v.id}: unknown decor ${v.decor}`);
  if (v.kind !== 'van') continue;
  assert(v.variant, `${v.id}: a fleet-body van needs a livery letter`);
  const letter = v.variant.toUpperCase();
  assert(/^[A-Z]$/.test(letter), `${v.id}: livery ${v.variant} is not a letter`);
  assert(
    !letters.has(letter),
    `${v.id}: livery letter ${v.variant} is already a fleet van's`,
  );
  letters.add(letter);
}
let pairs = 0,
  closest = Infinity,
  streetClosest = Infinity;
const motion = new Map(
  communityVehicles.map((v) => [
    v.id,
    { history: [], minRadius: Infinity, minRadiusAt: 0, maxSpeed: 0 },
  ]),
);
for (let frame = 0; frame < 36000; frame++) {
  const time = frame / 50,
    ours = mine(time),
    rest = others(time);
  for (let i = 0; i < ours.length; i++) {
    const a = ours[i];
    if (!a.visible) continue;
    for (const b of [...ours.slice(i + 1), ...rest]) {
      if (b.visible === false) continue;
      const gap = vehicleGap(a, b),
        margin = b.street ? 0.85 : 0.5;
      assert(
        gap >= margin,
        `${a.id} and ${b.id} have only ${gap.toFixed(3)} m at ${time}s (${a.phase})`,
      );
      closest = Math.min(closest, gap);
      if (b.street) streetClosest = Math.min(streetClosest, gap);
      pairs++;
    }
    // Nose-first, no teleports, closed doors while moving.
    const next = sampleCommunityVehicle(a.id, time + 0.002),
      movement = next.position.clone().sub(a.position);
    assert(movement.length() < 0.03, `${a.id} teleports at ${time}s`);
    if (movement.length() > 0.00001 && a.phase === next.phase) {
      const front = new Vector3(-Math.sin(a.heading), 0, -Math.cos(a.heading));
      assert(
        movement.clone().normalize().dot(front) > 0.97,
        `${a.id} drives sideways or backward at ${time}s`,
      );
      assert(
        (a.door ?? 0) < 0.001 && (a.ramp ?? 0) < 0.001,
        `${a.id} moves with the door or ramp open at ${time}s`,
      );
    }
    // Curvature over a 3 m window: the design arcs are ≥ 6.2 m; the spline may
    // tighten a little where a straight meets an arc.
    const m = motion.get(a.id),
      prev = m.history.at(-1);
    if (prev && prev.phase === a.phase) {
      const d = Math.hypot(a.position.x - prev.x, a.position.z - prev.z);
      m.maxSpeed = Math.max(m.maxSpeed, d * 50);
      m.history.push({
        x: a.position.x,
        z: a.position.z,
        heading: a.heading,
        phase: a.phase,
        s: prev.s + d,
      });
    } else
      m.history = [
        {
          x: a.position.x,
          z: a.position.z,
          heading: a.heading,
          phase: a.phase,
          s: 0,
        },
      ];
    const h = m.history,
      last = h.at(-1);
    let k = h.length - 2;
    while (k >= 0 && last.s - h[k].s < 3) k--;
    if (k >= 0 && last.s - h[k].s >= 3 && last.s - h[h.length - 2].s > 0.02) {
      let dTheta = last.heading - h[k].heading;
      dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
      const radius = (last.s - h[k].s) / Math.max(1e-9, Math.abs(dTheta));
      if (radius < m.minRadius) {
        m.minRadius = radius;
        m.minRadiusAt = time;
      }
    }
    if (h.length > 400) h.splice(0, 200);
  }
}
for (const [id, m] of motion)
  assert(
    m.minRadius >= 5,
    `${id} turns with a ${m.minRadius.toFixed(2)} m radius at ${m.minRadiusAt}s (hairpin)`,
  );
// Deterministic and loop-continuous.
for (const v of communityVehicles) {
  for (const t of [0, 90.5, 255.2, 480.1, 719.98])
    for (const shift of [-720, 720])
      assert(
        sampleCommunityVehicle(v.id, t).position.distanceTo(
          sampleCommunityVehicle(v.id, t + shift).position,
        ) < 1e-9,
        `${v.id} is not periodic at ${t}`,
      );
  const end = sampleCommunityVehicle(v.id, 719.98),
    start = sampleCommunityVehicle(v.id, 0.02);
  if (end.visible && start.visible)
    assert(
      end.position.distanceTo(start.position) < 0.05,
      `${v.id} jumps across the loop seam`,
    );
}

// --- People -----------------------------------------------------------------
const source = communitySource(model);
const composed = composeSources(activityData, source);
assert(
  composed.actors.length === activityData.actors.length + source.actors.length,
);
const settingZones = new Set(careSettings.map((s) => settingZone(s.id)));
const categories = new Set(COMMUNITY_CATEGORIES.map(([id]) => id));
const vehicleIds = new Set(communityVehicles.map((v) => v.id));
const positionAt = (actor, t) => {
  const s = sampleActor(actor, t);
  if (s.vehicleId && s.seat) {
    const pose = sampleCommunityVehicle(s.vehicleId, t),
      placed = seatInVehicle(pose, s.seat, s.seatHeading);
    return {
      ...s,
      x: placed.x,
      z: placed.z,
      visible: s.visible !== false && pose.visible,
      inVehicle: s.vehicleId,
    };
  }
  return { ...s, visible: s.visible !== false };
};
const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};
// Walks stay on the ground the registry draws: a setting's pad, its access
// stub and sidewalk, or the center's own site. Points authored in world
// coordinates instead of a setting's local anchors fail here once the
// setting moves or turns.
const [[siteX0, siteZ0], [siteX1, siteZ1]] = model.site.bounds;
const onDrawnGround = (p) =>
  (p[0] >= siteX0 && p[0] <= siteX1 && p[1] >= siteZ0 && p[1] <= siteZ1) ||
  careSettings.some((s) => {
    const [x, z] = toLocal(s, p),
      corridor = laneRadius(s, s.drive.lanes - 1) + LANE / 2 + 2;
    return (
      (Math.abs(x) <= s.pad.w / 2 + 0.5 &&
        z <= s.pad.d / 2 + 0.5 &&
        z >= -s.pad.d / 2 - (s.pad.back ?? 0) - 0.5) ||
      (Math.abs(x) <= corridor &&
        z >= frontZ(s) - 0.5 &&
        z <= streetZ(s) + 0.5)
    );
  });
let walks = 0,
  maxGait = 0;
for (const a of source.actors) {
  assert(
    settingZones.has(a.segments[0].zoneId) ||
      a.segments[0].zoneId === 'upper-office',
    `${a.id}: zone`,
  );
  assert.equal(a.segments[0].start, 0);
  assert.equal(a.segments.at(-1).end, 720);
  for (let i = 0; i < a.segments.length; i++) {
    const s = a.segments[i];
    if (i) assert.equal(a.segments[i - 1].end, s.start, `${a.id}: contiguous`);
    if (s.vehicleId) {
      assert(
        vehicleIds.has(s.vehicleId),
        `${a.id} rides unknown vehicle ${s.vehicleId}`,
      );
      assert(s.seat, `${a.id} rides ${s.vehicleId} without a seat`);
    }
    if (['walk', 'roll', 'escort'].includes(s.action)) {
      let length = 0;
      for (let k = 1; k < s.path.length; k++)
        length += Math.hypot(
          s.path[k][0] - s.path[k - 1][0],
          s.path[k][1] - s.path[k - 1][1],
        );
      if (s.visible !== false)
        for (const p of s.path)
          check(
            onDrawnGround(p),
            `${a.id} walks off the drawn ground at (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) during "${s.title}"`,
          );
      const gait = length / (s.end - s.start);
      check(
        gait <= 1.65,
        `${a.id} walks at ${gait.toFixed(2)} m/s during "${s.title}" (${s.start}–${s.end})`,
      );
      maxGait = Math.max(maxGait, gait);
      walks++;
    }
    // Consecutive segments join: exactly on foot, within a step when leaving
    // or entering a seat, freely while out of sight (indoors, in a car).
    if (i) {
      const p = a.segments[i - 1],
        q = s,
        seatAt = (seg, t) => {
          const placed = seatInVehicle(
            sampleCommunityVehicle(seg.vehicleId, t),
            seg.seat,
            seg.seatHeading,
          );
          return [placed.x, placed.z];
        };
      let limit = 0.05,
        from = p.path.at(-1),
        to = q.path[0];
      if (p.seat && q.seat) limit = Infinity;
      else if (p.seat) [from, limit] = [seatAt(p, q.start), 2.0];
      else if (q.seat) [to, limit] = [seatAt(q, q.start), 2.0];
      else if (p.visible === false || q.visible === false) limit = Infinity;
      const d = Math.hypot(from[0] - to[0], from[1] - to[1]);
      check(
        d <= limit,
        `${a.id} teleports ${d.toFixed(2)} m between "${p.title}" and "${q.title}" at ${q.start}s`,
      );
    }
  }
}
for (const i of source.interactions) {
  assert(categories.has(i.category), `${i.id}: category ${i.category}`);
  assert(i.start >= 0 && i.end <= 720 && i.end > i.start, `${i.id}: window`);
  assert(
    settingZones.has(i.zoneId) || ['site', 'upper-office'].includes(i.zoneId),
    `${i.id}: zone ${i.zoneId}`,
  );
  for (const id of i.actorIds)
    assert(
      source.actors.some((a) => a.id === id),
      `${i.id} names ${id}`,
    );
}
// Nobody stands in anyone else (community cast against itself, and against
// the center's cast while on or beside the center's site).
const groundOrSite = activityData.actors.filter(
  (a) => a.levelId === 'ground' || a.levelId === 'site',
);
const nearCenter = (p) =>
  p.x >= siteX0 - 2 && p.x <= siteX1 + 2 && p.z >= siteZ0 - 2 && p.z <= siteZ1 + 2;
let samples = 0,
  nearest = Infinity;
for (let t = 0; t < 720; t += 0.5) {
  const us = source.actors.map((a) => ({ a, p: positionAt(a, t) }));
  for (let i = 0; i < us.length; i++) {
    const { a, p } = us[i];
    if (!p.visible) continue;
    for (let j = i + 1; j < us.length; j++) {
      const { a: b, p: q } = us[j];
      if (!q.visible || a.levelId !== b.levelId) continue;
      // Seated riders are inside a body; only people on foot can collide with each other.
      if (p.inVehicle || q.inVehicle) continue;
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      nearest = Math.min(nearest, d);
      check(
        d >= 0.55,
        `${a.id} and ${b.id} are ${d.toFixed(2)} m apart at ${t}s ("${p.title}" / "${q.title}")`,
      );
    }
    if (a.levelId === 'site' && !p.inVehicle && nearCenter(p))
      for (const b of groundOrSite) {
        const q = sampleActor(b, t);
        if (q.visible === false) continue;
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        check(
          d >= 0.55,
          `${a.id} and ${b.id} (center cast) are ${d.toFixed(2)} m apart at ${t}s`,
        );
      }
    samples++;
  }
}
if (problems.length) {
  const unique = [...new Set(problems)];
  console.error(unique.slice(0, 40).join('\n'));
  assert.fail(`${unique.length} cast problem(s); first: ${unique[0]}`);
}
const radii = [...motion.entries()]
  .map(
    ([id, m]) =>
      `${id} ≥ ${m.minRadius.toFixed(1)} m, ≤ ${m.maxSpeed.toFixed(1)} m/s`,
  )
  .join('; ');
console.log(
  `Community traffic: ${stubs} access stubs join their streets at the near edge and stay off them. ${pairs.toLocaleString()} vehicle-pair checks over 12 minutes at 50 Hz; minimum gap ${closest.toFixed(2)} m (street traffic ${streetClosest.toFixed(2)} m). Turn radii and top speeds: ${radii}. ` +
    `Cast: ${source.actors.length} people, ${source.interactions.length} touchpoints, ${walks} walks (max ${maxGait.toFixed(2)} m/s), ${samples.toLocaleString()} placement samples, nearest ${nearest.toFixed(2)} m.`,
);
