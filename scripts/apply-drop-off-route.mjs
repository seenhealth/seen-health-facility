// Walk the van arrivals up the drop-off's switchback ramp, and back down it.
//
//   node scripts/apply-drop-off-route.mjs          # rewrite the base loop (both copies)
//   node scripts/apply-drop-off-route.mjs --check  # fail if the loop is stale
//
// The base loop's six van arrivals (three riders and their two escorts on Van
// A, two more riders on Van B) come down their van's ramp at the drop-off (the
// van stands on the aisle parallel to the lobby wall, its sliding door toward
// the entrance, so the ramp runs out toward the landing), walk along the lot
// to the toe of the switchback, up its lower run, across the turn landing and
// up the upper run to the landing, and turn in at the sliding entrance; their
// afternoon departure walks the same way back to the van. These legs are
// rebuilt from the exterior's geometry (`DROP_OFF` in
// app/model/alhambra-exterior.ts), the dock (`FLEET_LOT` in
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
  PUBLISHED = 'public/models/activity-loop.json',
  MODEL = 'public/models/seen-alhambra-planning.json';
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

// The docked van stands on the aisle beside the lobby landing, parallel to the
// lobby wall with its sliding door toward the entrance, so its ramp runs out
// east to a foot on the lot short of the landing's steps. From the foot a
// rider goes east to the lower run's line and along it, between the landing's
// rail and the lower run's west rail, to the toe, then up the switchback.
const [dockX, dockZ] = FLEET_LOT.dock;
assert.ok(
  Math.abs(Math.cos(FLEET_LOT.dockHeading) - 1) < 1e-9,
  "the docked van's sliding door faces +x, toward the entrance",
);
const { lower } = DROP_OFF,
  wheelchair = nav.MOBILITY_CLEARANCE.wheelchair;
const { sill, foot } = ARRIVAL;
assert.ok(
  foot[0] < lower.x && foot[1] < lower.z0,
  `the ramp's foot (${foot.join(', ')}) lies west of the lower run and short of its toe`,
);
/** Ramp foot → the lower run's line → its toe. */
const approach = [foot, [lower.x, foot[1]], [lower.x, lower.z0]];
/** Toe → landing abreast of the door, with the surface heights. */
const ascent = DROP_OFF.ascent(ARRIVAL.door[1]).map(({ at, y }) => ({
  at: at.map(mm),
  y: r4(y),
}));
assert.deepEqual(ascent[0].at, approach.at(-1), 'the climb starts at the toe');
const street = r4(DROP_OFF.street),
  vanFloor = ARRIVAL.vanFloorY;

// Nobody on the approach brushes the docked van, a rail or the bike rack:
// every 5 cm keeps a wheelchair's clearance from the van's footprint (in its
// own frame, whichever way it faces), from every rail and from the rack's pad.
const vanGap = ([x, z]) => {
  const c = Math.cos(FLEET_LOT.dockHeading),
    s = Math.sin(FLEET_LOT.dockHeading),
    dx = x - dockX,
    dz = z - dockZ,
    across = dx * c - dz * s,
    along = dx * s + dz * c;
  return Math.hypot(
    Math.max(Math.abs(across) - FLEET_VAN.halfWidth, 0),
    Math.max(Math.abs(along) - FLEET_VAN.halfLength, 0),
  );
};
const edges = [
  ...Object.values(DROP_OFF.rails).map((r) => [
    [r.x, r.z0],
    [r.x, r.z1],
  ]),
  ...DROP_OFF.bikeRackOutline.map((a, i, all) => [
    a,
    all[(i + 1) % all.length],
  ]),
];
const edgeGap = ([x, z], [a, b]) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
    );
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
};
let approachGap = Infinity;
for (let i = 1; i < approach.length; i++) {
  const [a, b] = [approach[i - 1], approach[i]],
    n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05);
  for (let k = 0; k <= n; k++) {
    const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    approachGap = Math.min(
      approachGap,
      vanGap(p),
      ...edges.map((e) => edgeGap(p, e)),
    );
  }
}
assert.ok(
  approachGap >= wheelchair,
  `the approach passes ${approachGap.toFixed(2)} m from the docked van, a rail or the bike rack`,
);

// Non-numbers parse as usual; numbers keep their text (10.0 stays 10.0).
const text = readFileSync(LOOP, 'utf8');
const loop = JSON.parse(text, (_, v, context) =>
  typeof v === 'number' && context?.source !== String(v)
    ? JSON.rawJSON(context.source)
    : v,
);
const value = (v) => (typeof v === 'object' ? Number(v.rawJSON) : v);
const point = (p) => p.map(value);
const arrivals = loop.actors.filter((a) => a.id.startsWith('arrival-'));
assert.equal(arrivals.length, 6, 'six van arrivals in the base loop');

// The way out from a wait spot to the doors threads round whoever stands in
// the lobby then (the community cast's greeters): routed on the navigation
// grid with each such person reserved, at the party's route clearance. The
// loop's own lobby route cut straight through a greeter.
const model = JSON.parse(readFileSync(MODEL, 'utf8'));
const STANDING_RESERVE = 0.65,
  STANDING_BAND = 1.2;
/**
 * Loop actors other than `party` standing still, visible, on the ground floor
 * at any of `times`, within STANDING_BAND of the straight line from `from` to
 * `to`. The line and the times are fixed by the loop's other actors, the wait
 * spot and the boarding time, not by the route written here, so a second run
 * finds the same people and writes the same route.
 */
function standingNear(from, to, times, party) {
  const out = new Map();
  for (const a of loop.actors) {
    if (party.has(a.id) || a.levelId !== 'ground') continue;
    for (const t of times) {
      const s = a.segments.find((s) => value(s.start) <= t && t < value(s.end));
      if (!s || s.visible === false) continue;
      const p0 = point(s.path[0]),
        p1 = point(s.path.at(-1));
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 1e-6) continue;
      if (edgeGap(p0, [from, to]) > STANDING_BAND) continue;
      out.set(a.id, {
        id: `standing-${a.id}`,
        position: p0,
        halfWidth: STANDING_RESERVE,
        halfDepth: STANDING_RESERVE,
      });
    }
  }
  return [...out.values()];
}
/** The lobby route from `from` to the doors round `reserved` people, for a party walking at `clearance`. */
function lobbyRoute(from, reserved, clearance) {
  const options = nav.dayProgramNavOptions();
  const grid = nav.navGrid(model, {
    ...options,
    reservations: [...options.reservations, ...reserved],
  });
  const route = nav.routeBetween(grid, from, ARRIVAL.door, clearance);
  assert.ok(
    route.length > 2 &&
      Math.hypot(route[0][0] - from[0], route[0][1] - from[1]) < 1e-3 &&
      Math.hypot(
        route.at(-1)[0] - ARRIVAL.door[0],
        route.at(-1)[1] - ARRIVAL.door[1],
      ) < 1e-3,
    `the lobby route runs from the wait spot to the doors (${route[0]} → ${route.at(-1)})`,
  );
  // Grid corners to the millimetre; the ends are the wait spot and the door exactly.
  return [from, ...route.slice(1, -1).map((p) => p.map(mm)), ARRIVAL.door];
}
const report = [];
let rerouted = 0;
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
  // The departure: indoors as before as far as the door (unless someone
  // stands in the way, when the lobby leg is re-routed round them), then the
  // same way down.
  const door = departure.path.findIndex((p) => same(p, ARRIVAL.door));
  assert.ok(door > 0, `${actor.id} leaves through the sliding entrance`);
  const down = [...ascent].reverse(),
    out = [...approach].reverse().slice(1),
    outdoors = [ARRIVAL.door, ...down.map((p) => p.at), ...out, sill];
  const lead = actor.escortFor
      ? arrivals.find((a) => a.id === actor.escortFor)
      : actor,
    party = new Set(
      arrivals
        .filter((a) => a === lead || a.escortFor === lead.id)
        .map((a) => a.id),
    ),
    indoor = departure.path.slice(0, door + 1).map(point),
    // when the party reaches the doors: the boarding time less the walk outside, both fixed
    atDoor = value(departure.end) - length(outdoors) / DEPARTURE_PACE,
    standing = standingNear(
      indoor[0],
      ARRIVAL.door,
      [atDoor - 10, atDoor - 5, atDoor],
      party,
    );
  let lobby = indoor,
    lobbyHeights = departure.heights.slice(0, door + 1);
  if (standing.length) {
    lobby = lobbyRoute(
      indoor[0],
      standing,
      nav.MOBILITY_CLEARANCE[lead.mobility] ?? nav.WALL_CLEARANCE,
    );
    lobbyHeights = lobby.map(() => 0);
    rerouted++;
  }
  departure.path = [...lobby, ...outdoors.slice(1)];
  departure.heights = [
    ...lobbyHeights,
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
const summary = `Drop-off route: ${length(approach).toFixed(2)} m from the van's ramp foot to the switchback's toe (≥ ${approachGap.toFixed(2)} m from the van, the rails and the bike rack), ${length(ascent.map((p) => p.at)).toFixed(2)} m up the switchback; ${rerouted} departures routed round people standing in the lobby. ${report.join('; ')}.`;
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
