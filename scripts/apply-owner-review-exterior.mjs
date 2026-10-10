// Owner walkthrough corrections (October 2026), exterior area: the JSON side of
// syncing the building's envelope with its interior and of the upstairs
// corrections.
//
//   node scripts/apply-owner-review-exterior.mjs   # idempotent: removes what it owns, then re-adds it
//
// What it writes (the model, public/models/seen-alhambra-planning.json, and
// both copies of the base loop):
// - The therapy wing's lot-side openings (shell-therapy-north) cut to the
//   traced plan walls' gaps: the awning door into the north support room and
//   a 3 m roll-up from the entry corridor onto the veranda (`VERANDA` in
//   app/model/alhambra-exterior.ts, which draws the door, the roll-up, the
//   walkway and its garden).
// - The staff entrance's opening (shell-east-exit) cut to the plan's gap on
//   the wing's east face, moving the split between shell-rear-east and
//   shell-east-exit to the gap's south end.
// - Upstairs: the restroom flipped with the rear desk beside it (restroom
//   north, the pair of rear desks south of it), both desk pods turned 90°
//   about their own centres (desks facing ±z, the pods side by side with an
//   aisle between), three white desks along the east wall, the office shell's
//   notch and the restroom's polygon and walls moved with it, the workstation
//   count 21; the three seated upstairs actors moved with their chairs.
// - Ground-level stand-ins for the PT stair's upper landing and guard rails
//   (`owner-ext-pt-stair-*`), so that in the cutaway (ground level only) the
//   stair visibly leads somewhere; the originals stay on the upper level.
// The dock, the fleet's routes, the drop-off route and the exterior's geometry
// are code (alhambra-fleet.ts, fleet-crew.ts, alhambra-exterior.ts;
// scripts/apply-drop-off-route.mjs rewrites the loop's drop-off legs
// afterwards).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSim } from './build-scenario.mjs';

const MODEL = 'public/models/seen-alhambra-planning.json';
const LOOPS = [
  'app/data/activity-loop.json',
  'public/models/activity-loop.json',
];
const { exterior } = await loadSim(
  { exterior: 'app/model/alhambra-exterior.ts' },
  { dir: 'work/owner-review-exterior' },
);
const { VERANDA } = exterior;

const r6 = (v) => Math.round(v * 1e6) / 1e6;
const TAU = Math.PI * 2;
const turn = (rotation, by) => r6((((rotation + by) % TAU) + TAU) % TAU);
const union = (list, ids) => [...new Set([...list, ...ids])];

const m = JSON.parse(readFileSync(MODEL, 'utf8'));
const byId = (list, id, what) => {
  const found = list.find((x) => x.id === id);
  assert.ok(found, `${what} ${id} is in the model`);
  return found;
};
const wall = (id) => byId(m.envelope.walls, id, 'envelope wall');
const planWall = (id) => byId(m.walls, id, 'plan wall');
const room = (id) => byId(m.rooms, id, 'room');
const object = (id) => byId(m.objects, id, 'object');
const partition = (id) => byId(m.walls, id, 'partition');

// --- What this script owns, removed before it is re-added ------------------
const OWN_OBJECT = /^(upperfit-(desk|monitor|chair)-east-\d+|owner-ext-.*)$/;
const ITEM_PREFIX = 'exterior-';
m.objects = m.objects.filter((o) => !OWN_OBJECT.test(o.id));
m.ownerReview.items = m.ownerReview.items.filter(
  (i) => !i.id.startsWith(ITEM_PREFIX),
);
const newObjectIds = [];
const items = [];

// --- (6) The therapy wing's veranda doors ----------------------------------
{
  const w = wall('shell-therapy-north'),
    ax = w.a[0],
    gapWest = [planWall('plan-wall-184').b[0], planWall('plan-wall-185').a[0]],
    gapEast = [planWall('plan-wall-185').b[0], planWall('plan-wall-186').a[0]];
  const { door, rollup } = VERANDA;
  assert.ok(
    door.x0 >= gapWest[0] - 1e-6 && door.x1 <= gapWest[1] + 1e-6,
    `the awning door (${door.x0}..${door.x1}) sits in the plan's gap (${gapWest.join('..')})`,
  );
  assert.ok(
    rollup.x0 >= gapEast[0] - 1e-6 && rollup.x1 <= gapEast[1] + 1e-6,
    `the roll-up (${rollup.x0}..${rollup.x1}) sits in the plan's gap (${gapEast.join('..')})`,
  );
  w.openings = [
    {
      id: 'shell-therapy-north-opening-1',
      offset: r6(door.x0 - ax),
      width: r6(door.x1 - door.x0),
      sill: 0,
      height: door.height,
      kind: 'door',
      material: 'om-glass',
    },
    {
      id: 'shell-therapy-north-opening-2',
      offset: r6(rollup.x0 - ax),
      width: r6(rollup.x1 - rollup.x0),
      sill: 0,
      height: rollup.height,
      kind: 'door',
      material: 'om-rollup',
      operable: true,
    },
  ];
  w.status =
    'plan-traced perimeter / openings cut to the traced plan walls’ gaps (owner walkthrough 2026-10: the awning door and the roll-up onto the veranda)';
  items.push({
    id: `${ITEM_PREFIX}veranda-garden`,
    rooms: ['rehab-entry', 'rehab-support-north'],
    change: `Veranda and garden off the therapy entry corridor: the envelope’s lot-side doors now sit in the plan’s wall gaps (awning door x ${door.x0}..${door.x1} into the north support room; a 3 m roll-up x ${rollup.x0}..${rollup.x1} from the corridor onto the walkway, its curtain raised by day), the walkway behind the block wall is level with the sills (two steps down to the lot at its west end), and the garden is on it: timber planter boxes with herbs, flowers, shrubs and a small citrus, two benches, a watering can, a potted agave, and a mulched bed of agaves and grasses along the wall’s lot side (app/model/alhambra-exterior.ts VERANDA).`,
    unresolved:
      'The owner described the garden, not its layout: box, bench and plant positions are a proposal. The roll-up is drawn raised all day (no operating animation). The plan’s awning door was a single leaf; the as-built door hardware is not verified.',
  });
}

// --- The staff entrance's door on the wing's east face ---------------------
{
  const south = planWall('plan-wall-071'),
    north = planWall('plan-wall-142');
  const z0 = Math.max(south.a[1], south.b[1]),
    z1 = Math.min(north.a[1], north.b[1]);
  assert.ok(
    z1 - z0 > 1.5 && z1 - z0 < 2.5,
    `the plan’s east door gap is ${(z1 - z0).toFixed(3)} m`,
  );
  const rearEast = wall('shell-rear-east'),
    exit = wall('shell-east-exit');
  assert.equal(rearEast.b[0], exit.a[0], 'the two walls meet on one line');
  rearEast.b = [rearEast.b[0], r6(z0)];
  exit.a = [exit.a[0], r6(z0)];
  const o = exit.openings[0];
  assert.equal(o.id, 'shell-east-exit-opening-1');
  o.offset = 0;
  o.width = r6(z1 - z0);
  exit.status =
    'plan-traced perimeter / opening cut to the traced plan walls’ gap (owner walkthrough 2026-10)';
  items.push({
    id: `${ITEM_PREFIX}staff-entrance-door`,
    rooms: ['hall'],
    change: `The staff entrance’s glass door now fills the plan’s gap in the wing’s east wall (z ${r6(z0)}..${r6(z1)}; it stopped 0.46 m short at its south end), and the court’s landing, ramp, rails, pergola and planters stay in view in the cutaway (they are the site’s now, not the facade’s). The fire department connection stands on the wing’s outer west face.`,
    unresolved:
      'The envelope wall split (shell-rear-east / shell-east-exit) moved to the gap’s south end so the door is one opening; the hall zone still owns the whole opening.',
  });
}

// --- (17) Upstairs -----------------------------------------------------------
const UPPER = { zoneId: 'upper-office', levelId: 'upper' };
const place = (id, x, z, rotation) => {
  const o = object(id);
  assert.ok(
    o.zoneId === UPPER.zoneId && o.levelId === UPPER.levelId,
    `${id} is upstairs`,
  );
  o.position = [r6(x), o.position[1], r6(z)];
  if (rotation !== undefined) o.rotation = rotation;
  delete o.sourcePixelPosition;
  delete o.sourcePixelFootprint;
  return o;
};
const HALF = Math.PI / 2,
  THREE_HALF = (3 * Math.PI) / 2;
// The restroom, flipped with the desk beside it: north to z 14.5..17.6 (it was 17.6..20.7), the rear desks south of it.
const WC = { x0: 0.2, x1: 2.9, z0: 14.5, z1: 17.6, door: [15.7, 16.7] };
{
  const dz = WC.z0 - 17.6;
  room('upperfit-restroom').polygon = [
    [WC.x0, WC.z0],
    [WC.x1, WC.z0],
    [WC.x1, WC.z1],
    [WC.x0, WC.z1],
  ];
  const shell = room('upper-office-shell');
  shell.polygon = [
    [0.2, 13.2],
    [14.8, 13.2],
    [14.8, 26.45],
    [3.25, 26.45],
    [3.25, 25.1],
    [0.2, 25.1],
    [0.2, WC.z1],
    [WC.x1, WC.z1],
    [WC.x1, WC.z0],
    [0.2, WC.z0],
  ];
  const seg = (id, a, b) => {
    const w = partition(id);
    w.a = a;
    w.b = b;
  };
  seg('upperfit-wc-north', [WC.x0, WC.z0], [WC.x1, WC.z0]);
  seg('upperfit-wc-south', [WC.x0, WC.z1], [WC.x1, WC.z1]);
  seg('upperfit-wc-east-a', [WC.x1, WC.z0], [WC.x1, WC.door[0]]);
  seg('upperfit-wc-east-b', [WC.x1, WC.door[1]], [WC.x1, WC.z1]);
  place('upperfit-toilet', 0.65, 18.35 + dz);
  place('upperfit-basin', 2.55, 18.2 + dz);
  place('upperfit-restroom-band', 0.27, 19.1 + dz);
  // The pair of rear desks, together south of the restroom (they stood at z 14.85 and 16.35, west wall).
  for (const [k, z] of [
    [0, 18.45],
    [1, 19.95],
  ]) {
    place(`upperfit-desk-rear-${k}`, 0.7, z);
    place(`upperfit-monitor-rear-${k}`, 0.51, z);
    place(`upperfit-chair-rear-${k}`, 1.53, z);
  }
}
// The desk pods, each turned 90° about its own centre (+π/2: a point's offset (dx, dz) becomes (dz, −dx)) and the
// two set side by side with an aisle between, from the layout they had: desks at pod x ∓0.4 (rot π/2 west, 3π/2
// east), monitors ∓0.21, chairs ∓1.23 (rot 3π/2 west, 5π/2 east), rows at z 21.45, 19.87, 18.29.
const PODS = [
  { from: [6.2, 19.87], to: [5.8, 19.87] },
  { from: [11.1, 19.87], to: [11.5, 19.87] },
];
const ROWS = [21.45, 19.87, 18.29];
const chairs = new Map();
PODS.forEach(({ from, to }, pod) => {
  const moved = (x, z) => {
    const dx = x - from[0],
      dz = z - from[1];
    return [to[0] + dz, to[1] - dx];
  };
  ROWS.forEach((z, row) => {
    for (const side of [-1, 1]) {
      const key = `bank-${pod}-${row}-${side}`;
      const desk =
          side < 0 ? [from[0] - 0.4, HALF] : [from[0] + 0.4, THREE_HALF],
        monitor =
          side < 0 ? [from[0] - 0.21, HALF] : [from[0] + 0.21, THREE_HALF],
        chair =
          side < 0
            ? [from[0] - 1.23, THREE_HALF]
            : [from[0] + 1.23, THREE_HALF + Math.PI];
      place(`upperfit-desk-${key}`, ...moved(desk[0], z), turn(desk[1], HALF));
      place(
        `upperfit-monitor-${key}`,
        ...moved(monitor[0], z),
        turn(monitor[1], HALF),
      );
      const c = place(
        `upperfit-chair-${key}`,
        ...moved(chair[0], z),
        turn(chair[1], HALF),
      );
      chairs.set(c.id, c);
    }
  });
});
// Three more desks along the east wall (the slat wall at x 14.75), north of the pods, chairs on the west side.
{
  const template = object('upperfit-desk-perimeter-0');
  const common = {
    zoneId: UPPER.zoneId,
    levelId: UPPER.levelId,
    scale: [1, 1, 1],
    roomId: 'upper-office-shell',
    referencePages: template.referencePages,
    status:
      'owner-directed arrangement (walkthrough 2026-10) / dimensions estimated',
    notes:
      'Owner walkthrough 2026-10: a few more desks along the east wall. Position within the existing fit-out is a proposal; dimensions estimated.',
    layer: 'furniture',
  };
  [14.1, 15.7, 17.3].forEach((z, i) => {
    const pieces = [
      {
        id: `upperfit-desk-east-${i}`,
        assetId: 'upperfit-desk-white',
        position: [14.35, 0, z],
        rotation: HALF,
      },
      {
        id: `upperfit-monitor-east-${i}`,
        assetId: 'upperfit-monitor',
        position: [14.54, 0.75, z],
        rotation: HALF,
      },
      {
        id: `upperfit-chair-east-${i}`,
        assetId: 'upperfit-chair',
        position: [13.52, 0, z],
        rotation: THREE_HALF,
      },
    ];
    for (const p of pieces) {
      m.objects.push({ ...p, ...common });
      newObjectIds.push(p.id);
    }
  });
  m.upstairsSurvey.workstationCount = 21;
}
items.push({
  id: `${ITEM_PREFIX}upstairs`,
  rooms: ['upper-office-shell', 'upperfit-restroom'],
  change:
    'Upstairs: the restroom flipped with the desk beside it (restroom now x 0.2..2.9, z 14.5..17.6 with its door on the east wall at z 15.7..16.7; the two rear desks together south of it at z 18.45 and 19.95); both desk pods turned 90° about their own centres so the desks face ±z, set side by side (centres x 5.8 and 11.5) with an aisle between; three white desks added along the east wall (x 14.35, z 14.1 / 15.7 / 17.3, chairs on the west side); workstationCount 21. The three seated upstairs actors moved with their chairs.',
  unresolved:
    'The owner did not say which way the pods should turn or how far apart to set them: turned +90° and spread to leave a 1 m aisle between them and 0.9 m to the east wall. The restroom’s new place leaves a 1.3 m strip between it and the storage room. Desk pitch and the east-wall desks’ positions are estimated.',
});

// --- (14)/(16) The PT stair's landing and guards in the cutaway ------------
{
  const upper = m.levels.find((l) => l.id === 'upper').elevation;
  for (const [src, id] of [
    ['access-rehab-stair-landing', 'owner-ext-pt-stair-landing'],
    ['access-rehab-stair-guard--1', 'owner-ext-pt-stair-guard--1'],
    ['access-rehab-stair-guard-1', 'owner-ext-pt-stair-guard-1'],
  ]) {
    const o = object(src);
    assert.ok(
      o.levelId === 'upper' && o.layer === 'architecture',
      `${src} is upper-level architecture`,
    );
    m.objects.push({
      ...structuredClone(o),
      id,
      zoneId: 'rehab',
      levelId: 'ground',
      roomId: null,
      // 4 mm under the original so the two never share a surface when every level is shown at once
      position: [
        o.position[0],
        r6(o.position[1] + upper - 0.004),
        o.position[2],
      ],
      status:
        'cutaway stand-in for the upper level’s piece (owner walkthrough 2026-10)',
      notes: `A copy of ${src} drawn with the ground floor, ${upper} m up, so that the PT stair leads to its landing and guard rails when only the ground floor is shown (the cutaway); the mezzanine itself stays with the upper level.`,
    });
    newObjectIds.push(id);
  }
  items.push({
    id: `${ITEM_PREFIX}cutaway-mezzanine`,
    rooms: ['mezzanine-shell'],
    change:
      'In the cutaway (ground level only) the PT stair now leads to its upper landing and guard rails: ground-level copies of the mezzanine’s landing and two guards are drawn 3.35 m up with the therapy wing (owner-ext-pt-stair-*). The staff entrance’s ramp, pergola and planters and the therapy veranda are in view there too (site, not facade).',
    unresolved:
      'The equipment mezzanine’s floor plate stays hidden in the cutaway (it would cover the therapy floor); only the stair’s landing and guards show. "Balcony" was taken to mean this mezzanine gallery over the therapy wing.',
  });
}

// --- The registry -------------------------------------------------------------
m.ownerReview.newObjectIds = union(m.ownerReview.newObjectIds, newObjectIds);
m.ownerReview.items.push(...items);
writeFileSync(MODEL, JSON.stringify(m, null, 2) + '\n');

// --- Data files edited by hand, re-edited here so the integrator's run makes the same change ----------------------
// Numbers keep their text (10.0 stays 10.0) and non-ASCII is escaped as the generators wrote these files.
const keepNumbers = (text) =>
  JSON.parse(text, (_, v, context) =>
    typeof v === 'number' && context?.source !== String(v)
      ? JSON.rawJSON(context.source)
      : v,
  );
const ascii = (s) =>
  s.replace(
    /[^\n\x20-\x7f]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
// The story: with the van parallel to the entrance the hero's walk out to it is 4.5 m shorter, so she leaves the
// farewell 3.7 s later, and the least-squares spread of her stops moved the day-room stop's end (289.2 s) past the
// cut to the kitchen at 289 s. The kitchen cutaway now starts at 290 s, where the lunch step it opens starts anyway.
{
  const SCENARIO = 'app/data/scenarios/day-in-the-life.json';
  const scenario = keepNumbers(readFileSync(SCENARIO, 'utf8'));
  const kitchen = scenario.steps.find((s) => s.id === 'kitchen');
  const was = kitchen.window.map((v) =>
    typeof v === 'object' ? Number(v.rawJSON) : v,
  );
  assert.ok(
    (was[0] === 289 || was[0] === 290) && was[1] === 304,
    `the kitchen cutaway window is the one this edit expects (${was})`,
  );
  kitchen.window = [290, 304];
  writeFileSync(SCENARIO, ascii(JSON.stringify(scenario, null, 2)) + '\n');
}

// --- The base loop: the seated upstairs actors move with their chairs -------
for (const file of LOOPS) {
  const loop = keepNumbers(readFileSync(file, 'utf8'));
  let moved = 0;
  for (const a of loop.actors) {
    if (!a.seatId || !chairs.has(a.seatId)) continue;
    const c = chairs.get(a.seatId),
      at = [c.position[0], c.position[2]],
      heading = turn(c.rotation, Math.PI);
    for (const s of a.segments) {
      s.path = s.path.map(() => [...at]);
      s.heading = heading;
    }
    moved++;
  }
  assert.equal(
    moved,
    3,
    `${file}: the three seated upstairs actors moved with their chairs`,
  );
  writeFileSync(file, ascii(JSON.stringify(loop, null, 2)) + '\n');
}
console.log(
  `Owner review (exterior): veranda doors cut to the plan (door ${VERANDA.door.x0}..${VERANDA.door.x1}, roll-up ${VERANDA.rollup.x0}..${VERANDA.rollup.x1}), staff entrance door to the plan's gap, upstairs restroom flipped and pods turned with ${newObjectIds.length} new objects, ${items.length} items registered; run node scripts/apply-drop-off-route.mjs next.`,
);
