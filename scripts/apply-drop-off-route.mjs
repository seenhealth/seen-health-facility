// Walk the van arrivals up the drop-off's switchback ramp, and back down it.
//
//   node scripts/apply-drop-off-route.mjs          # rewrite the base loop (both copies)
//   node scripts/apply-drop-off-route.mjs --check  # fail if the loop is stale
//
// The base loop's six van arrivals (three riders and their two escorts on Van
// A, two more riders on Van B) come down their van's ramp at the drop-off,
// walk round the docked van's nose to the toe of the switchback, up its lower
// run, across the turn landing and up the upper run to the landing, and turn
// in at the sliding entrance; their afternoon departure walks the same way
// back to the van. These legs are rebuilt from the exterior's geometry
// (`DROP_OFF` in app/model/alhambra-exterior.ts), the dock (`FLEET_LOT` in
// app/model/alhambra-fleet.ts), the van's ramp (`FLEET_VAN_RAMP`) and the
// sliding entrance (`ARRIVAL.door`), with the surface height at every corner.
//
// Timing: each arrival keeps its van ride, its descent of the van's ramp and
// the moment it steps inside, and walks from the ramp foot to the door at one
// pace; each departure keeps the moment it reaches the van and the loop's
// escorted pace (0.64 m/s), so it sets off earlier from the lobby and the
// wait before it shortens. The mid-day riders (fleet-crew.ts) and the story's
// hero (npm run build:scenario) take these legs from the loop.
//
// Every other number in the file keeps its exact text, so the script is
// repeatable; `--check` fails when the geometry, the dock or the entrance has
// moved since the loop was written. Recompile the story afterwards (npm run
// build:scenario).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSim } from './build-scenario.mjs';

const LOOP = 'app/data/activity-loop.json',
  PUBLISHED = 'public/models/activity-loop.json';
const check = process.argv.includes('--check');
const { arrival, exterior, fleet, nav } = await loadSim(
  {
    arrival: 'app/model/arrival.ts',
    exterior: 'app/model/alhambra-exterior.ts',
    fleet: 'app/model/alhambra-fleet.ts',
    nav: 'app/sim/nav.ts',
  },
  { dir: 'work/drop-off-route' },
);
const { ARRIVAL } = arrival,
  { DROP_OFF } = exterior,
  { FLEET_LOT, FLEET_VAN } = fleet;

/** The departures' escorted pace, m per loop second (scripts/build-activity.py). */
const DEPARTURE_PACE = 0.64;
const TITLES = {
  ride: 'Riding to Seen Health',
  unload: 'Unload on van ramp',
  approach: 'Meet escort · approach ramp',
  ramp: 'Up the wheelchair ramp',
  entrance: 'Turn right · sliding entrance',
  wait: 'Await confirmed pickup',
  departure: 'Escorted departure · board van',
  home: 'Riding home',
};
const mm = (v) => Math.round(v * 1000) / 1000,
  r4 = (v) => Math.round(v * 1e4) / 1e4;
const length = (path) =>
  path.reduce(
    (s, p, i) =>
      i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : s,
    0,
  );
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

// The docked van stands nose-first toward the switchback; the way from its
// ramp foot to the ramp's toe passes in front of its nose, between the nose
// and the end of the lower run's west rail, as wide as a wheelchair and its
// escort need, then turns up the run.
const [dockX, dockZ] = FLEET_LOT.dock;
assert.ok(
  Math.abs(-Math.sin(FLEET_LOT.dockHeading) - 1) < 1e-9,
  'the docked van faces +x, toward the switchback',
);
const rail = DROP_OFF.rails.lowerWest,
  { lower } = DROP_OFF,
  nose = dockX + FLEET_VAN.halfLength,
  passage = rail.x - nose,
  wheelchair = nav.MOBILITY_CLEARANCE.wheelchair;
assert.ok(
  passage >= 2 * wheelchair,
  `the docked van's nose leaves ${passage.toFixed(2)} m to the switchback's rail (a wheelchair needs ${2 * wheelchair})`,
);
const passX = mm((nose + rail.x) / 2),
  passZ = mm(rail.z0 - passage / 2);
const { sill, foot } = ARRIVAL;
/** Ramp foot → in front of the nose → under the rail's end → the lower run's toe. */
const approach = [
  foot,
  [passX, foot[1]],
  [passX, passZ],
  [lower.x, passZ],
  [lower.x, lower.z0],
];
/** Toe → landing abreast of the door, with the surface heights. */
const ascent = DROP_OFF.ascent(ARRIVAL.door[1]).map(({ at, y }) => ({
  at: at.map(mm),
  y: r4(y),
}));
assert.deepEqual(ascent[0].at, approach.at(-1), 'the climb starts at the toe');
const street = r4(DROP_OFF.street),
  vanFloor = ARRIVAL.vanFloorY;

// Nobody on the approach brushes the docked van or the rail: every 5 cm keeps
// a wheelchair's clearance from the van's footprint and the rail.
const vanGap = ([x, z]) =>
  Math.hypot(
    Math.max(Math.abs(x - dockX) - FLEET_VAN.halfLength, 0),
    Math.max(Math.abs(z - dockZ) - FLEET_VAN.halfWidth, 0),
  );
const railGap = ([x, z]) =>
  Math.hypot(x - rail.x, z - Math.min(Math.max(z, rail.z0), rail.z1));
let approachGap = Infinity;
for (let i = 1; i < approach.length; i++) {
  const [a, b] = [approach[i - 1], approach[i]],
    n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05);
  for (let k = 0; k <= n; k++) {
    const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    approachGap = Math.min(approachGap, vanGap(p), railGap(p));
  }
}
assert.ok(
  approachGap >= wheelchair,
  `the approach passes ${approachGap.toFixed(2)} m from the docked van or the rail`,
);

// Non-numbers parse as usual; numbers keep their text (10.0 stays 10.0).
const text = readFileSync(LOOP, 'utf8');
const loop = JSON.parse(text, (_, v, context) =>
  typeof v === 'number' && context?.source !== String(v)
    ? JSON.rawJSON(context.source)
    : v,
);
const value = (v) => (typeof v === 'object' ? Number(v.rawJSON) : v);
const arrivals = loop.actors.filter((a) => a.id.startsWith('arrival-'));
assert.equal(arrivals.length, 6, 'six van arrivals in the base loop');
const report = [];
for (const actor of arrivals) {
  const segment = (title) => {
    const found = actor.segments.filter((s) => s.title === title);
    assert.equal(found.length, 1, `${actor.id} has one "${title}" segment`);
    return found[0];
  };
  const [ride, unload, walkIn, climb, entrance, wait, departure, home] =
    Object.values(TITLES).map(segment);
  ride.path = [sill, sill];
  home.path = [sill, sill];
  unload.path = [sill, foot];
  unload.heights = [vanFloor, street];
  walkIn.path = approach;
  walkIn.heights = approach.map(() => street);
  climb.path = ascent.map((p) => p.at);
  climb.heights = ascent.map((p) => p.y);
  const inside = entrance.path.at(-1);
  assert.ok(
    same(entrance.path[1], ARRIVAL.door),
    `${actor.id} turns in at the door`,
  );
  entrance.path = [ascent.at(-1).at, ARRIVAL.door, inside];
  entrance.heights = [0, 0, 0];
  // From the ramp foot to inside the door at one pace, keeping when the
  // approach starts and when the person is inside.
  const legs = [walkIn, climb, entrance].map((s) => length(s.path)),
    from = value(walkIn.start),
    to = value(entrance.end),
    pace = legs.reduce((a, b) => a + b) / (to - from);
  walkIn.end = climb.start = mm(from + legs[0] / pace);
  climb.end = entrance.start = mm(value(walkIn.end) + legs[1] / pace);
  // The departure: indoors as before as far as the door, then the same way down.
  const door = departure.path.findIndex((p) => same(p, ARRIVAL.door));
  assert.ok(door > 0, `${actor.id} leaves through the sliding entrance`);
  const down = [...ascent].reverse(),
    out = [...approach].reverse().slice(1);
  departure.path = [
    ...departure.path.slice(0, door + 1),
    ...down.map((p) => p.at),
    ...out,
    sill,
  ];
  departure.heights = [
    ...departure.heights.slice(0, door + 1),
    ...down.map((p) => p.y),
    ...out.map(() => street),
    vanFloor,
  ];
  const before = value(departure.start);
  departure.start = wait.end = r4(
    value(departure.end) - length(departure.path) / DEPARTURE_PACE,
  );
  assert.ok(
    departure.start > value(wait.start) + 30,
    `${actor.id} still waits for the van`,
  );
  // The journey home (the participant's interaction) starts with the walk.
  const journey = loop.interactions.find(
    (i) => i.id === `${actor.escortFor ?? actor.id}-departure`,
  );
  assert.ok(journey, `${actor.id}: a journey-home interaction`);
  journey.start = departure.start;
  report.push(
    `${actor.id} ${pace.toFixed(2)} m/s in (${from}–${value(walkIn.end)}–${value(climb.end)}–${to} s), out from ${departure.start} s (${(before - departure.start).toFixed(1)} s earlier)`,
  );
}

// Non-ASCII characters escaped, as the Python generators wrote the file.
const ascii = (s) =>
  s.replace(
    /[^\n\x20-\x7f]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
const out = ascii(JSON.stringify(loop, null, 2)) + '\n';
const summary = `Drop-off route: ${length(approach).toFixed(2)} m round the van's nose (≥ ${approachGap.toFixed(2)} m from the van and the rail), ${length(ascent.map((p) => p.at)).toFixed(2)} m up the switchback. ${report.join('; ')}.`;
if (check) {
  for (const file of [LOOP, PUBLISHED])
    assert.equal(
      readFileSync(file, 'utf8'),
      out,
      `${file} is stale: run node scripts/apply-drop-off-route.mjs`,
    );
  console.log(`The drop-off route is current. ${summary}`);
} else {
  for (const file of [LOOP, PUBLISHED]) writeFileSync(file, out);
  console.log(`Wrote ${LOOP} and ${PUBLISHED}. ${summary}`);
}
