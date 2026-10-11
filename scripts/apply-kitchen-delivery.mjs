// Bring the morning food delivery into the kitchen before lunch.
//
//   node scripts/apply-kitchen-delivery.mjs          # rewrite the base loop (both copies)
//   node scripts/apply-kitchen-delivery.mjs --check  # fail if the loop is stale
//
// The food truck's morning run (`runs` in app/model/deliveries.ts) parks at
// rear receiving at 10:48 AM. Its delivery person (`delivery-food`) wheels the
// loaded trolley up the receiving ramp, through the small service door east of
// the loading roll-up (owner review 2026-10: the roll-up fronts the electrical
// room, scripts/apply-owner-review-care-rooms.mjs), down the strip of
// receiving east of that room, along the corridor east of the laundry, across
// the east hallway and into the kitchen, where `food-service-02` checks the
// carriers against the diet plans and unloads them onto the island counter
// (`kitchen-lunch-delivery`, 11:10–11:26 AM, before lunch is served). Indoors
// the trolley runs straight between door centres; every leg is checked on the
// navigation grid (app/sim/nav.ts) at a clearance that keeps the person and the
// trolley off walls and furniture, and the service door is checked for the
// trolley's own width. The afternoon run still stops just inside the receiving
// door, as scripts/add-delivery-people.py wrote it.
//
// Both actors' tracks and the interaction are rebuilt from the constants below,
// so the script is repeatable, and every other number in the file keeps its
// exact text. Recompile the story afterwards (npm run build:scenario).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSim } from './build-scenario.mjs';

const LOOP = 'app/data/activity-loop.json',
  PUBLISHED = 'public/models/activity-loop.json',
  MODEL = 'public/models/seen-alhambra-planning.json';
const check = process.argv.includes('--check');
const { nav, deliveries, activity } = await loadSim(
  {
    nav: 'app/sim/nav.ts',
    deliveries: 'app/model/deliveries.ts',
    activity: 'app/model/activity.ts',
  },
  { dir: 'work/kitchen-delivery' },
);

const DELIVERY = 'delivery-food',
  KITCHEN_STAFF = 'food-service-02',
  INTERACTION = 'kitchen-lunch-delivery';
const r4 = (v) => Math.round(v * 1e4) / 1e4;
/**
 * Loop seconds: the trolley stops at the island, the kitchen starts unloading
 * (when the carriers appear on the island, `KITCHEN_LUNCH` in deliveries.ts),
 * done.
 */
const HANDOVER = {
  arrive: 285,
  unload: deliveries.KITCHEN_LUNCH.from,
  done: 309,
};
/** The delivery person behind the trolley, facing the island's south end. */
const TROLLEY_STOP = [10.45, 1.25];
/** The kitchen staff member beside the trolley, and where the carriers go on the island. */
const RECEIVE_AT = [9.75, 2.05],
  ISLAND = deliveries.KITCHEN_LUNCH.at;
/** From the kitchen station down the west aisle to the trolley. */
const AISLE = [9.75, 4.55];
/**
 * On foot from the east side of the parked truck (the package truck parks on
 * its west side), to the foot of the receiving ramp, up it and through the
 * service door to just inside, with the ramp heights (the ramp runs from the
 * court at −0.23 m up to the door sill; scripts/add-delivery-people.py).
 */
const stop = deliveries.deliveryStops.find((s) => s.id === DELIVERY);
const DOOR = [...stop.door],
  ramp = deliveries.receivingRamp(stop),
  rampY = (z) =>
    z <= ramp.z0
      ? -0.23
      : z >= ramp.z1
        ? 0
        : -0.23 * ((ramp.z1 - z) / (ramp.z1 - ramp.z0));
/** Just inside the door, centred in the strip east of the electrical room. */
const LANE_IN = [10.6, -13.9];
const DOCK = [stop.x + 1.45, stop.z],
  OUTSIDE = [
    DOCK,
    [stop.x + 1.5, -18.3],
    [DOOR[0], r4(ramp.z0 - 0.04)],
    [DOOR[0], -16.1],
    DOOR,
    LANE_IN,
  ],
  OUTSIDE_HEIGHTS = OUTSIDE.map((p) => r4(rampY(p[1])));
/**
 * Indoors: down the strip of receiving east of the electrical room (its wall
 * at x 10.0, receiving's east wall at 11.75) past the electrical room's door,
 * across to the corridor east of the laundry (walls at x 9.16 and 11.75), then
 * straight on at x 10.45 through the laundry passage (z −7.02, x 9.46–11.35),
 * the east hallway and the kitchen door (z 0.36, x 9.62–11.45) to the island.
 */
const INSIDE = [LANE_IN, [10.6, -10.0], [10.45, -9.0], TROLLEY_STOP];
/**
 * Route clearance for the person pushing the trolley (the trolley is 0.55 m
 * wide), and the least gap its corners keep from walls and furniture.
 */
const TROLLEY_CLEARANCE = 0.45,
  TROLLEY_MARGIN = 0.1;
/** Trolley corners in the person's frame (characters.ts, scaled by the person's height). */
const TROLLEY_CORNERS = [
  [-0.28, 0.32],
  [0.28, 0.32],
  [-0.28, 1.0],
  [0.28, 1.0],
];
/** Walking pace of the kitchen staff member (m per loop second). */
const STAFF_PACE = 0.7;

const face = (from, to) =>
  Math.round(Math.atan2(to[0] - from[0], to[1] - from[1]) * 1000) / 1000;
const reversed = (list) => [...list].reverse();

// --- Route checks on the navigation grid --------------------------------------
const model = JSON.parse(readFileSync(MODEL, 'utf8'));
const grid = nav.navGrid(model, nav.dayProgramNavOptions());
/** Points every 5 cm along a polyline, with the heading of their leg. */
const samples = (path) => {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [path[i - 1], path[i]],
      n = Math.max(1, Math.ceil(nav.distance(p, q) / 0.05)),
      heading = Math.atan2(q[0] - p[0], q[1] - p[1]);
    for (let k = 0; k <= n; k++)
      out.push([
        p[0] + ((q[0] - p[0]) * k) / n,
        p[1] + ((q[1] - p[1]) * k) / n,
        heading,
      ]);
  }
  return out;
};
/** Gap from a point to the nearest wall face or furniture face (m). */
const gapAt = (p) => {
  const m = nav.measurePoint(grid, p);
  return m.zoneIndex < 0
    ? -1
    : Math.min(m.wallMargin, m.obstacleExcess + nav.FURNITURE_CLEARANCE);
};
const scale = JSON.parse(
  readFileSync('app/data/character-templates.json', 'utf8'),
).people.find((p) => p.id === DELIVERY).height;
let trolleyGap = Infinity;
const checkTrolley = (x, z, heading, where) => {
  const s = Math.sin(heading),
    c = Math.cos(heading);
  for (const [u, v] of TROLLEY_CORNERS) {
    const corner = [x + (c * u + s * v) * scale, z + (-s * u + c * v) * scale];
    const gap = gapAt(corner);
    trolleyGap = Math.min(trolleyGap, gap);
    assert.ok(
      gap >= TROLLEY_MARGIN,
      `trolley corner (${corner.map((v) => v.toFixed(2)).join(', ')}) ${where} is ${gap.toFixed(2)} m from a wall or furniture`,
    );
  }
};
for (const [x, z, heading] of samples(INSIDE)) {
  assert.ok(
    nav.isClear(grid, [x, z], TROLLEY_CLEARANCE),
    `trolley route (${x.toFixed(2)}, ${z.toFixed(2)}) is not clear at ${TROLLEY_CLEARANCE} m; adjust INSIDE`,
  );
  checkTrolley(x, z, heading, 'on the way in');
}
checkTrolley(...TROLLEY_STOP, 0, 'at the island');
// The service door (owner review 2026-10): wide enough for the trolley with
// its margin on each side, the lane centred in it, and the trolley's corners
// clear of the jambs from the threshold to the lane inside.
{
  const wall = model.envelope.walls.find((w) => w.id === 'shell-rear-north'),
    door = wall.openings.find((o) => o.id === 'shell-rear-north-opening-3'),
    x0 = wall.a[0] + door.offset,
    x1 = x0 + door.width,
    trolley = 0.56 * scale;
  assert.ok(
    Math.abs(DOOR[1] - wall.a[1]) < 1e-6 && Math.abs(DOOR[0] - (x0 + x1) / 2) < 0.01,
    `the trolley lane is centred in the service door (x ${x0.toFixed(2)}–${x1.toFixed(2)})`,
  );
  assert.ok(
    door.width >= trolley + 2 * TROLLEY_MARGIN,
    `the service door (${door.width} m) takes the ${trolley.toFixed(2)} m trolley with ${TROLLEY_MARGIN} m each side`,
  );
  for (const [x, z, heading] of samples([DOOR, LANE_IN]).slice(1))
    checkTrolley(x, z, heading, 'through the service door');
}
assert.equal(nav.roomAt(model, 'ground', TROLLEY_STOP), 'kitchen-prep');
assert.equal(nav.roomAt(model, 'ground', RECEIVE_AT), 'kitchen-prep');

// --- The base loop, with every other number kept as written -------------------
const text = readFileSync(LOOP, 'utf8');
const loop = JSON.parse(text, (_, v, context) =>
  typeof v === 'number' && context?.source !== String(v)
    ? JSON.rawJSON(context.source)
    : v,
);
const delivery = loop.actors.find((a) => a.id === DELIVERY),
  staff = loop.actors.find((a) => a.id === KITCHEN_STAFF);
assert.ok(delivery && staff, `${DELIVERY} and ${KITCHEN_STAFF} in the loop`);

// The delivery person: each run of the truck, hidden on the route between.
const runs = deliveries.deliveryRuns(stop),
  lunch = runs.find(
    (r) => r.arrive + 2 < HANDOVER.arrive && r.leave - 2 > HANDOVER.done,
  );
assert.ok(lunch, 'a food run is parked at receiving through the hand-over');
const inside = INSIDE,
  outLength = nav.pathLength(OUTSIDE) + nav.pathLength(inside),
  paceIn = outLength / (HANDOVER.arrive - lunch.arrive - 2),
  paceOut = outLength / (lunch.leave - 2 - HANDOVER.done);
for (const pace of [paceIn, paceOut])
  assert.ok(
    pace > 0.6 && pace < 1,
    `trolley pace ${pace.toFixed(2)} m/s (keep 0.6–1)`,
  );
const segments = [];
let clock = 0;
const push = (
  end,
  action,
  path,
  zoneId,
  title,
  visible,
  heights,
  heading = 0,
) => {
  segments.push({
    start: r4(clock),
    end: r4(end),
    action,
    path,
    zoneId,
    heading,
    heights,
    visible,
    title,
  });
  clock = r4(end);
};
const parked = [DOCK, DOCK],
  street = [-0.23, -0.23],
  floor = (path) => path.map(() => 0);
for (const run of runs) {
  push(run.arrive + 2, 'ride', parked, 'site', 'Delivery route', false, street);
  if (run !== lunch) {
    push(
      run.arrive + 22,
      'escort',
      OUTSIDE,
      'site',
      'Delivering fresh meals',
      true,
      OUTSIDE_HEIGHTS,
    );
    push(
      run.leave - 20,
      'serve',
      [OUTSIDE.at(-1), OUTSIDE.at(-1)],
      'site',
      'Receiving food delivery',
      true,
      [0, 0],
    );
    push(
      run.leave - 2,
      'escort',
      reversed(OUTSIDE),
      'site',
      'Returning with empty trolley',
      true,
      reversed(OUTSIDE_HEIGHTS),
    );
  } else {
    const atStop = [TROLLEY_STOP, TROLLEY_STOP];
    // Titles starting "Delivering" show the loaded trolley (activity.ts).
    push(
      clock + nav.pathLength(OUTSIDE) / paceIn,
      'escort',
      OUTSIDE,
      'site',
      'Delivering today’s lunch',
      true,
      OUTSIDE_HEIGHTS,
    );
    push(
      HANDOVER.arrive,
      'escort',
      inside,
      'kitchen',
      'Delivering lunch to the kitchen',
      true,
      floor(inside),
    );
    push(
      HANDOVER.unload,
      'document',
      atStop,
      'kitchen',
      'Delivering lunch · order checked in',
      true,
      [0, 0],
    );
    push(
      HANDOVER.done,
      'idle',
      atStop,
      'kitchen',
      'Lunch handed over to the kitchen',
      true,
      [0, 0],
    );
    push(
      clock + nav.pathLength(inside) / paceOut,
      'escort',
      reversed(inside),
      'ot',
      'Returning through receiving',
      true,
      floor(inside),
    );
    push(
      run.leave - 2,
      'escort',
      reversed(OUTSIDE),
      'site',
      'Returning with empty trolley',
      true,
      reversed(OUTSIDE_HEIGHTS),
    );
  }
  push(
    run.leave,
    'ride',
    parked,
    'site',
    'Returning to delivery vehicle',
    false,
    street,
  );
}
push(loop.duration, 'ride', parked, 'site', 'Delivery route', false, street);
delivery.segments = segments;

// The kitchen staff member leaves the station to meet the trolley, then returns.
const station = staff.segments[0];
assert.ok(
  station.action === 'serve' && station.start === 0,
  `${KITCHEN_STAFF} starts the day at the kitchen station`,
);
const home = station.path[0],
  toTrolley = [home, AISLE, RECEIVE_AT],
  walk = nav.pathLength(toTrolley) / STAFF_PACE;
for (const [x, z] of samples(toTrolley))
  assert.ok(nav.isClear(grid, [x, z]), `kitchen walk (${x}, ${z}) is clear`);
const at = (start, end, action, path, heading, title) => ({
  start: r4(start),
  end: r4(end),
  action,
  path,
  zoneId: station.zoneId,
  heading,
  title,
});
const stays = [RECEIVE_AT, RECEIVE_AT],
  handover = [
    at(
      HANDOVER.arrive - walk,
      HANDOVER.arrive,
      'walk',
      toTrolley,
      0,
      'Walk to the lunch delivery',
    ),
    at(
      HANDOVER.arrive,
      HANDOVER.unload,
      'serve',
      stays,
      face(RECEIVE_AT, [TROLLEY_STOP[0], TROLLEY_STOP[1] + 0.66]),
      'Checking lunch against the diet plans',
    ),
    at(
      HANDOVER.unload,
      HANDOVER.done,
      'serve',
      stays,
      face(RECEIVE_AT, ISLAND),
      'Unloading lunch onto the island counter',
    ),
    at(
      HANDOVER.done,
      HANDOVER.done + walk,
      'walk',
      reversed(toTrolley),
      0,
      'Back to meal prep',
    ),
  ];
// Keep the station's service blocks (re-joining one an earlier run split) and
// split the one the hand-over falls in.
const kept = [];
for (const s of staff.segments.filter(
  (s) => s.action === 'serve' && s.title === station.title,
)) {
  const last = kept.at(-1);
  if (last && last.end < s.start) last.end = s.end;
  else kept.push({ ...s });
}
const block = kept.find(
  (s) => s.start <= HANDOVER.arrive - walk && s.end >= HANDOVER.done + walk,
);
assert.ok(block, 'one service block spans the hand-over');
const serving = (start, end) => ({ ...block, start: r4(start), end: r4(end) });
staff.segments = [
  ...kept.filter((s) => s.end <= block.start),
  serving(block.start, HANDOVER.arrive - walk),
  ...handover,
  serving(HANDOVER.done + walk, block.end),
  ...kept.filter((s) => s.start >= block.end),
];

// The hand-over, listed with the other meal interactions.
loop.interactions = loop.interactions.filter((i) => i.id !== INTERACTION);
loop.interactions.splice(
  loop.interactions.findIndex((i) => i.id === 'meal-team') + 1,
  0,
  {
    id: INTERACTION,
    label: 'Lunch delivery · kitchen hand-over',
    category: 'meals',
    actorIds: [DELIVERY, KITCHEN_STAFF],
    start: HANDOVER.arrive,
    end: HANDOVER.done,
    zoneId: 'kitchen',
    description:
      'Today’s culturally focused lunch arrives from a local supplier in insulated carriers. The kitchen checks each tray against the dietitian’s texture and low-sodium plans before unloading it for plating.',
  },
);

// Nobody else stands in the trolley's way: the two new tracks keep clear of
// the rest of the ground-floor cast and of each other (every 0.25 s; escorts
// sampled behind their partner, as the engine draws them).
const cast = JSON.parse(JSON.stringify(loop)).actors.filter(
    (a) => a.levelId === 'ground',
  ),
  byId = new Map(cast.map((a) => [a.id, a]));
const place = (a, t) =>
  a.escortFor
    ? activity.sampleEscort(byId.get(a.escortFor), t)
    : activity.sampleActor(a, t);
let nearest = { gap: Infinity };
for (const id of [DELIVERY, KITCHEN_STAFF])
  for (let t = 0; t < loop.duration; t += 0.25) {
    const p = place(byId.get(id), t);
    if (p.visible === false) continue;
    for (const other of cast) {
      if (other.id === id) continue;
      const q = place(other, t);
      if (q.visible === false) continue;
      const gap = Math.hypot(p.x - q.x, p.z - q.z);
      if (gap < nearest.gap) nearest = { gap, id, other: other.id, t };
    }
  }
assert.ok(
  nearest.gap >= 0.5,
  `${nearest.id} passes ${nearest.gap.toFixed(2)} m from ${nearest.other} at ${nearest.t}`,
);

// Non-ASCII characters escaped, as the Python generators wrote the file
// (JSON.stringify leaves no other control character than the line breaks).
const ascii = (s) =>
  s.replace(
    /[^\n\x20-\x7f]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
const out = ascii(JSON.stringify(loop, null, 2)) + '\n';
const clockOf = (t) => {
  const m = 480 + (t / 720) * 480;
  return `${Math.floor(m / 60) % 12 || 12}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
};
const summary = `Lunch run: truck parked ${clockOf(lunch.arrive)}–${clockOf(lunch.leave)}, trolley in the kitchen ${clockOf(HANDOVER.arrive)}–${clockOf(HANDOVER.done)} (${INTERACTION} ${HANDOVER.arrive}–${HANDOVER.done} s), ${outLength.toFixed(1)} m each way at ${paceIn.toFixed(2)}/${paceOut.toFixed(2)} m/s; trolley corners ≥ ${trolleyGap.toFixed(2)} m from walls and furniture; nearest person ${nearest.gap.toFixed(2)} m (${nearest.id}/${nearest.other} at ${nearest.t} s).`;
if (check) {
  for (const file of [LOOP, PUBLISHED])
    assert.equal(
      readFileSync(file, 'utf8'),
      out,
      `${file} is stale: run node scripts/apply-kitchen-delivery.mjs`,
    );
  console.log(`Kitchen delivery is current. ${summary}`);
} else {
  for (const file of [LOOP, PUBLISHED]) writeFileSync(file, out);
  console.log(`Wrote ${LOOP} and ${PUBLISHED}. ${summary}`);
}
