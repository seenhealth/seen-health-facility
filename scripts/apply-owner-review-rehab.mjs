// Owner walkthrough, October 2026 · the rehabilitation wing (zone `rehab`).
//
//   node scripts/apply-owner-review-rehab.mjs
//
// What the owner asked for in the rehab room, and what this script does:
// 1. "People on the bikes": `community-25`, who stood exercising all day in
//    the corner by the mezzanine stair (the owner: "that should not be
//    there"), now rides `rehab-recumbent-stepper-1` all day (`cycle`, with a
//    seated breather every 150 s). A new participant, `rehab-rider-02`,
//    rides stepper 2 in two sessions, walking in from the quiet room and out
//    to an acupressure appointment.
// 2. "People take the stairs up and down": a new participant
//    (`rehab-stairs-participant`) trains on the practice stairs four times
//    per session, with a new PT (`rehab-pt-02`) spotting from the floor
//    (round 4 below says where the stairs stand and how they are climbed).
// 3. "An entire model kitchen where the counter is": the plan's demonstration
//    counter goes and an ADL practice kitchen stands against that wall with
//    its fronts to the east: a 1.9 m casework run (sink, counter, upper
//    cabinets), a refrigerator at its south end and a counter-top microwave,
//    with ≥ 0.9 m clear in front for wheelchairs. Two participants rehearse
//    at the sink and the microwave with a new OT (`rehab-ot-02`).
// 4. The side rooms: the west room becomes the quiet room (three recliners)
//    and the south-west ("bottom") room the acupressure massage room (a
//    massage bed; `rehab-massage-therapist` gives two appointments per loop,
//    the participant seated on the bed's edge). The four participant chairs
//    at the glazed SW corner go. The story's `idt-pt` base moves out of the
//    massage bed's footprint.
// 5. Round 4 (the owner on the live build): "we move the desk to the wrong
//    place". The NW corner room on S Ethel Ave is the fire pump room and
//    stays completely empty: no furniture and nobody in it at any time (its
//    door gap is kept). The four standing desks (the PT and OT workstations)
//    stand where the training stairs stood, in a row facing the Valley Blvd
//    glazing at the SW corner; Pt 2 and Ot 2 chart there. The training
//    stairs become a right-angle practice stair (a new `rehab-corner-stairs`
//    asset: two flights of three treads and four 0.15 m risers to a 0.9 m
//    landing at 0.6 m) against the gym's east wall (the south multistall
//    restroom's west face), landing at the south end (0.23 m past the end of
//    the wall, leaving 0.7 m between the bars and the west flight), one
//    flight along the wall with its foot to the north and one running west
//    with its foot just south of the parallel bars. The participant climbs one flight,
//    turns on the landing and goes down the other (a walk with a height at
//    every path point), resting at whichever foot they reach and climbing
//    back the other way, while the PT spots from the floor in the corner
//    between the flights. Mat plinth 1 leaves the alcove north of the
//    practice kitchen for the same east wall, north of the stair, long side
//    along the wall, 0.8 m from the parallel bars. Four recumbent steppers
//    (1 and 2 kept with their riders, 3 and 4 added) stand in a row along
//    the Valley glazing between the desks and the stair, 0.5 m apart, and
//    the Balance & mobility participant who stood where the stair's west
//    foot now is (`community-24`) practises on the open floor south of the
//    massage room instead.
//
// Re-runnable: it first removes everything it owns (objects, assets, actors,
// profiles, interactions and ownerReview entries, by id) and re-adds them,
// so a second run leaves every file unchanged. Every walk is routed on the
// navigation grid of the patched model (app/sim/nav.ts) and every stop is
// checked for clearance; the three community-cast people in the room keep
// their 0.58 m from everyone. Afterwards run
// `node scripts/apply-drop-off-route.mjs` and `npm run build:scenario`, as
// for every change to the loop.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSim } from './build-scenario.mjs';

const MODEL = 'public/models/seen-alhambra-planning.json',
  LOOP = ['app/data/activity-loop.json', 'public/models/activity-loop.json'],
  TEMPLATES = [
    'app/data/character-templates.json',
    'public/models/character-templates.json',
  ],
  STORY = 'app/data/scenarios/day-in-the-life.json';
const { nav, activity } = await loadSim(
  { nav: 'app/sim/nav.ts', activity: 'app/model/activity.ts' },
  { dir: 'work/owner-review-rehab' },
);

const PI = Math.PI,
  HALF = PI / 2;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const union = (list, ids) => [...new Set([...list, ...ids])];
const without = (list, ids) => list.filter((id) => !ids.includes(id));
const face = (from, to) => r3(Math.atan2(to[0] - from[0], to[1] - from[1]));
/** Non-ASCII characters escaped, as the loop and templates are written. */
const ascii = (s) =>
  s.replace(
    /[^\n\x20-\x7f]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
const writeAscii = (files, data) => {
  const out = ascii(JSON.stringify(data, null, 2)) + '\n';
  for (const f of files) writeFileSync(f, out);
};

// =============================================================================
// The model
// =============================================================================
const m = JSON.parse(readFileSync(MODEL, 'utf8'));
m.ownerReview ??= {
  date: '2026-10-10',
  title: 'Owner walkthrough corrections · October 2026',
  accuracy:
    'Owner-directed room, fit-out and door corrections from a walkthrough of the model; room and fixture positions follow the owner’s description, not a survey.',
  items: [],
  changedWallIds: [],
  newWallIds: [],
  removedWallIds: [],
  changedPlanObjectIds: [],
  removedPlanObjectIds: [],
  newObjectIds: [],
};
const wall = (id) => {
  const w = m.walls.find((w) => w.id === id);
  assert.ok(w, `wall ${id}`);
  return w;
};
const object = (id) => {
  const o = m.objects.find((o) => o.id === id);
  assert.ok(o, `object ${id}`);
  return o;
};

// --- Assets this script adds (and removes first) ------------------------------
const ASSETS = {
  'rehab-fridge': {
    kind: 'rehab-fridge',
    dimensions: [0.76, 1.72, 0.72],
    material: 'photo-silver',
    materials: { handle: 'photo-black' },
  },
  'rehab-microwave': {
    kind: 'rehab-microwave',
    dimensions: [0.5, 0.3, 0.38],
    material: 'photo-white',
    materials: { glass: 'photo-black', metal: 'photo-silver' },
  },
  'rehab-kitchen-casework': {
    kind: 'casework',
    dimensions: [1.9, 2.15, 0.6],
    material: 'photo-white',
    materials: { top: 'photo-quartz', splash: 'photo-teal-tile' },
    parameters: { bays: 3 },
  },
  'rehab-recliner': {
    kind: 'rehab-recliner',
    dimensions: [0.8, 1.1, 1.4],
    material: 'photo-blue-grey',
    materials: { wood: 'oak', metal: 'photo-silver' },
  },
  // A new asset id for the massage bed: validate-model rejects the plan's
  // `therapy-bed` asset in the rehab zone (it was absent from the plan).
  'rehab-massage-bed': {
    kind: 'therapy-bed',
    dimensions: [0.85, 0.77, 1.95],
    material: 'clinical-blue',
  },
  // A compact (0.9 × 0.6 m) standing desk: four of them in a row at the SW
  // glazing leave room for the four steppers and a walkway past the stair.
  'rehab-standing-desk': {
    kind: 'rehab-standing-desk',
    dimensions: [0.9, 1.45, 0.6],
    material: 'photo-white',
    materials: { metal: 'photo-silver', screen: 'screen', frame: 'photo-black' },
  },
  // The right-angle practice stair (rehab-assets.ts): 0.28 m treads, 0.15 m
  // risers, 0.9 m flights and landing, the landing rails 0.88 m above it.
  'rehab-corner-stairs': {
    kind: 'rehab-corner-stairs',
    dimensions: [1.74, 1.5, 1.74],
    material: 'oak',
    materials: { metal: 'photo-silver', nosing: 'photo-mustard' },
  },
};
/** The straight training stairs' asset, unused once the stairs are the corner stair. */
const OLD_STAIRS_ASSET = 'interior-training-stairs';
const dims = (assetId) => (ASSETS[assetId] ?? m.assets[assetId]).dimensions;

// --- Geometry: wall faces the furniture stands against ---------------------------
// Plan walls are centred on their line; faces are half a thickness away.
const plan172 = wall('plan-wall-172'), // the counter wall, x = −26.508, z 13.33–16.18
  plan189 = wall('plan-wall-189'), // z = 13.33: north wall of the quiet room
  plan178 = wall('plan-wall-178'); // x = −19.843, z 19.28–25.13: the gym's east wall (the south multistall restroom's west wall)
/** The envelope walls the glazing sits in (centred on the zone edge). */
const shell = (id) => {
  const w = m.envelope.walls.find((w) => w.id === id);
  assert.ok(w, `envelope wall ${id}`);
  return w;
};
const shellFront = shell('shell-therapy-front'), // z = 27.169: the Valley Blvd glazing
  shellWest = shell('shell-therapy-west'); // x = −31.189: the S Ethel Ave front
const KITCHEN_WALL = plan172.a[0] + plan172.thickness / 2, // −26.406
  KITCHEN_Z0 = plan189.a[1] + plan189.thickness / 2, // 13.432
  QUIET_NORTH = KITCHEN_Z0,
  GYM_EAST = plan178.a[0] - plan178.thickness / 2, // −19.970
  GYM_EAST_SOUTH = Math.max(plan178.a[1], plan178.b[1]), // 25.134: where that wall ends
  GLAZING_SOUTH = shellFront.a[1] - shellFront.thickness / 2, // 27.049: inner face
  GLAZING_WEST = shellWest.a[0] + shellWest.thickness / 2; // −31.069: inner face
assert.ok(Math.abs(KITCHEN_WALL + 26.406) < 0.01 && Math.abs(GYM_EAST + 19.97) < 0.01);
assert.ok(plan178.a[0] === plan178.b[0] && Math.abs(GLAZING_SOUTH - 27.049) < 0.01 && Math.abs(GLAZING_WEST + 31.069) < 0.01);

// The kitchen run against the counter wall, fronts (local +z) facing east:
// casework from the north end (its sink toward the north-room door), the
// refrigerator at the south end, the microwave on the counter's south bay.
const CASEWORK_Z0 = KITCHEN_Z0 + 0.03,
  casework = {
    x: r3(KITCHEN_WALL + dims('rehab-kitchen-casework')[2] / 2 + 0.01),
    z: r3(CASEWORK_Z0 + dims('rehab-kitchen-casework')[0] / 2),
  },
  FRIDGE_Z0 = CASEWORK_Z0 + dims('rehab-kitchen-casework')[0] + 0.03,
  fridge = {
    x: r3(KITCHEN_WALL + dims('rehab-fridge')[2] / 2 + 0.01),
    z: r3(FRIDGE_Z0 + dims('rehab-fridge')[0] / 2),
  },
  // photo-assets.ts casework: base min(0.85, 0.37 h) plus a 0.045 m top.
  COUNTER_TOP = r3(Math.min(0.85, 0.37 * dims('rehab-kitchen-casework')[1]) + 0.045),
  microwave = {
    x: r3(KITCHEN_WALL + dims('rehab-microwave')[2] / 2 + 0.03),
    z: r3(CASEWORK_Z0 + dims('rehab-kitchen-casework')[0] - 0.03 - dims('rehab-microwave')[0] / 2),
  },
  // The casework's sink sits at local +x·0.25, which rotation π/2 turns to −z.
  SINK_Z = r3(casework.z - 0.25 * dims('rehab-kitchen-casework')[0]),
  KITCHEN_FRONT = r3(KITCHEN_WALL + 0.01 + dims('rehab-kitchen-casework')[2]),
  CLEAR_IN_FRONT = 0.9;

// The quiet room's recliners along its north wall, backs to the wall (rotation
// π puts the back at −z), facing the door on the south wall.
const RECLINER_Z = r3(QUIET_NORTH + 0.03 + dims('rehab-recliner')[2] / 2),
  RECLINER_X = [-29.05, -28.1, -27.15],
  /** The hips sit 0.1 m behind the recliner's centre, toward its back. */
  RECLINER_SEAT = 0.1;

// The massage bed along the massage room's west wall, head to the north.
const BED = [-29.0, 20.5];

// The parallel bars stay where they are; the stair and the plinth are set
// out from their footprint (x −23.475..−22.125, z 20.295..23.945).
const barsObject = object('rehab-parallel-bars'),
  BARS = {
    x0: barsObject.position[0] - dims(barsObject.assetId)[0] / 2,
    x1: barsObject.position[0] + dims(barsObject.assetId)[0] / 2,
    z0: barsObject.position[2] - dims(barsObject.assetId)[2] / 2,
    z1: barsObject.position[2] + dims(barsObject.assetId)[2] / 2,
  };
assert.equal(barsObject.rotation, 0);

// Round 4: the four standing desks (the PT and OT workstations) stand where
// the training stairs stood, in a row along the Valley Blvd glazing from the
// S Ethel Ave corner, the users facing the glazing (south). The fire pump
// room (the NW corner room) is left empty.
const DESK_W = dims('rehab-standing-desk')[0],
  DESK_D = dims('rehab-standing-desk')[2],
  DESK_GAP = 0.01,
  DESK_X0 = GLAZING_WEST + 0.03,
  DESK_Z = r3(GLAZING_SOUTH - 0.02 - DESK_D / 2),
  desks = [0, 1, 2, 3].map((i) => ({
    id: `rehab-workspace-desk-${i + 1}`,
    at: [r3(DESK_X0 + DESK_W / 2 + i * (DESK_W + DESK_GAP)), DESK_Z],
    rotation: PI,
  })),
  DESKS_X1 = DESK_X0 + 4 * DESK_W + 3 * DESK_GAP,
  /** Where a therapist stands at each desk (0.34 m off its user edge), facing south. */
  DESK_USER = desks.map((d) => [d.at[0], r3(d.at[1] - DESK_D / 2 - 0.34)]);

// Four recumbent steppers in a row along the glazing east of the desks, seats
// to the north (rotation π; the rider faces the glazing), 0.5 m apart for
// mounting. Steppers 1 and 2 (with their riders) take the two eastern places,
// nearest where they stood; the new 3 and 4 the two western.
const STEPPER = dims('interior-stepper'),
  STEPPER_GAP = 0.5,
  STEPPER_X0 = DESKS_X1 + 0.1,
  STEPPER_Z = r3(GLAZING_SOUTH - 0.03 - STEPPER[2] / 2),
  steppers = [
    'rehab-recumbent-stepper-4',
    'rehab-recumbent-stepper-3',
    'rehab-recumbent-stepper-1',
    'rehab-recumbent-stepper-2',
  ].map((id, i) => ({ id, at: [r3(STEPPER_X0 + STEPPER[0] / 2 + i * (STEPPER[0] + STEPPER_GAP)), STEPPER_Z] })),
  NEW_STEPPERS = ['rehab-recumbent-stepper-3', 'rehab-recumbent-stepper-4'];

// The right-angle practice stair against the gym's east wall, landing at the
// south end (rotation 0 puts the asset's landing corner at +x/+z: east and
// south). One flight runs along the wall with its foot to the north, the
// other runs west from the landing with its foot just south of the bars.
// The landing's south edge sits just north of the stepper row (0.23 m past
// the end of the wall): the west flight's 0.9 m foot zone then clears the
// bars' south end by 0.5 m, and the floor between the bars' south-east post
// and the west flight (0.7 m) keeps the south of the gym connected to the
// corridor east of the bars.
const STAIR = dims('rehab-corner-stairs'),
  RUN = 0.9, // flight width and landing size
  DECK = 0.6,
  RISE = DECK / 4,
  TREAD = (STAIR[0] - RUN) / 3, // 0.28
  FOOT_CLEAR = 0.9,
  STAIR_Z1 = r3(STEPPER_Z - STEPPER[2] / 2 - 0.01),
  STAIRS = {
    at: [r3(GYM_EAST - 0.01 - STAIR[0] / 2), r3(STAIR_Z1 - STAIR[2] / 2)],
    rotation: 0,
  };
/** The flights and the landing as navigation footprints (local [x, z, w, d]): the corner between the flights stays open floor. */
const STAIR_FOOTPRINTS = [
  [r3(STAIR[0] / 2 - RUN / 2), 0, RUN, STAIR[2]], // the wall flight and the landing
  [r3((-STAIR[0] / 2 + STAIR[0] / 2 - RUN) / 2), r3(STAIR[2] / 2 - RUN / 2), r3(STAIR[0] - RUN), RUN], // the west flight
];
const [SX, SZ] = STAIRS.at,
  FLIGHT_A_X = r3(SX + STAIR[0] / 2 - RUN / 2), // centre line of the wall flight
  FLIGHT_B_Z = r3(SZ + STAIR[2] / 2 - RUN / 2), // centre line of the west flight
  STAIR_N_EDGE = r3(SZ - STAIR[2] / 2), // the wall flight's first riser
  STAIR_W_EDGE = r3(SX - STAIR[0] / 2), // the west flight's first riser
  LANDING_N = r3(STAIR_N_EDGE + 3 * TREAD),
  LANDING_W = r3(STAIR_W_EDGE + 3 * TREAD),
  /** Clear floor in front of each foot, as wide as the flight. */
  FOOT_N_ZONE = { x0: LANDING_W, x1: SX + STAIR[0] / 2, z0: STAIR_N_EDGE - FOOT_CLEAR, z1: STAIR_N_EDGE },
  FOOT_W_ZONE = { x0: STAIR_W_EDGE - FOOT_CLEAR, x1: STAIR_W_EDGE, z0: LANDING_N, z1: STAIR_Z1 };

// Round 4: mat plinth 1 moves from the alcove north of the practice kitchen
// to the gym's east wall, north of the stair: long side along the wall, 0.8 m
// from the bars (room for a therapist between) and south of z 19.6, so the
// mouth of the cross hall (z 17.96..19.44) stays clear.
const PLINTH = dims('interior-plinth'),
  PLINTH_Z0 = 19.7,
  PLINTH_1 = {
    at: [r3(GYM_EAST - 0.002 - PLINTH[0] / 2), r3(PLINTH_Z0 + PLINTH[2] / 2)],
    rotation: 0,
    roomId: 'rehab-open',
  };

// The Balance & mobility participant who stood where the stair's west foot
// now is moves to the open floor south of the massage room.
const C24_SPOT = [-28.4, 23.1];

const furniture = (id, assetId, [x, z], rotation, roomId, notes, extra = {}) => ({
  id,
  assetId,
  zoneId: 'rehab',
  levelId: 'ground',
  position: [x, extra.y ?? 0, z],
  rotation: r3(rotation),
  scale: [1, 1, 1],
  roomId,
  referencePages: [115],
  status: 'owner walkthrough 2026-10 / dimensions estimated',
  notes,
  layer: 'furniture',
});
const OBJECTS = [
  furniture(
    'rehab-kitchen-casework',
    'rehab-kitchen-casework',
    [casework.x, casework.z],
    HALF,
    'rehab-open',
    'ADL practice kitchen: base cabinets, counter, sink and upper cabinets against the former demonstration-counter wall, fronts to the east. Products and sizes are typical, not surveyed.',
  ),
  furniture(
    'rehab-kitchen-fridge',
    'rehab-fridge',
    [fridge.x, fridge.z],
    HALF,
    'rehab-open',
    'Practice kitchen refrigerator at the south end of the run, door to the east.',
  ),
  furniture(
    'rehab-kitchen-microwave',
    'rehab-microwave',
    [microwave.x, microwave.z],
    HALF,
    'rehab-open',
    'Counter-top microwave on the practice kitchen counter, under the upper cabinets.',
    { y: COUNTER_TOP },
  ),
  ...RECLINER_X.map((x, i) =>
    furniture(
      `rehab-quiet-recliner-${i + 1}`,
      'rehab-recliner',
      [x, RECLINER_Z],
      PI,
      'rehab-support-west',
      'Quiet-room recliner, back to the north wall, facing the door.',
    ),
  ),
  furniture(
    'rehab-massage-bed',
    'rehab-massage-bed',
    BED,
    0,
    'rehab-support-mid',
    'Acupressure massage bed along the west wall, head to the north; the participant sits on its east edge.',
  ),
  ...desks.map((d) =>
    furniture(
      d.id,
      'rehab-standing-desk',
      d.at,
      d.rotation,
      'rehab-open',
      'PT & OT workstation: a standing desk with monitor in the row along the Valley Blvd glazing at the S Ethel Ave corner, where the training stairs stood; the therapists chart at it between sessions, facing the glazing.',
    ),
  ),
  ...steppers
    .filter((s) => NEW_STEPPERS.includes(s.id))
    .map((s) =>
      furniture(
        s.id,
        'interior-stepper',
        s.at,
        PI,
        'rehab-open',
        'Recumbent stepper added on the owner’s word (“there should be four”), in the row along the Valley Blvd glazing, seat to the north, 0.5 m from its neighbours for mounting.',
      ),
    ),
];
const OBJECT_IDS = OBJECTS.map((o) => o.id);
/** Plan (baseline) objects removed: the counter the kitchen replaces and the SW-corner chairs. */
const REMOVED_PLAN = [
  'rehab-demonstration-counter',
  'rehab-visible-chair-0',
  'rehab-visible-chair-1',
  'rehab-visible-chair-2',
  'rehab-visible-chair-3',
];
const ROOM_NAMES = {
  'rehab-support-west': 'Quiet room',
  'rehab-support-mid': 'Acupressure massage room',
  // Round 4: "that room is actually the fire pump room, so leave that
  // completely empty".
  'rehab-support-nw': 'Fire pump room',
};
const ITEM_IDS = [
  'rehab-bikes',
  'rehab-practice-stairs',
  'rehab-corner-exerciser',
  'rehab-practice-kitchen',
  'rehab-quiet-room',
  'rehab-massage-room',
  'rehab-workspace',
  'rehab-r4-layout',
];

// --- Remove what this script owns, then re-add -----------------------------------
for (const id of Object.keys(ASSETS)) delete m.assets[id];
// Nothing else uses the straight stairs' asset once they are the corner stair.
delete m.assets[OLD_STAIRS_ASSET];
m.objects = m.objects.filter(
  (o) => !OBJECT_IDS.includes(o.id) && !REMOVED_PLAN.includes(o.id),
);
Object.assign(m.assets, ASSETS);
m.objects.push(...OBJECTS);
const plinth1 = object('rehab-mat-plinth-1'),
  stairs = object('rehab-training-stairs');
plinth1.position = [PLINTH_1.at[0], 0, PLINTH_1.at[1]];
plinth1.rotation = r3(PLINTH_1.rotation);
plinth1.roomId = PLINTH_1.roomId;
// The training stairs keep their id and become the right-angle stair.
Object.assign(stairs, {
  assetId: 'rehab-corner-stairs',
  position: [STAIRS.at[0], 0, STAIRS.at[1]],
  rotation: r3(STAIRS.rotation),
  status: 'owner walkthrough 2026-10 / dimensions estimated',
  notes:
    'Right-angle practice stair against the gym’s east wall (the south multistall restroom’s west face): a 0.9 m landing at 0.6 m in the south-east corner, one flight of three treads along the wall with its foot to the north and one running west with its foot just south of the parallel bars, handrails on both sides. The corner between the flights is open floor where the therapist spots. Products and sizes are typical, not surveyed.',
  navigationFootprints: STAIR_FOOTPRINTS,
});
for (const s of steppers) {
  const o = object(s.id);
  o.position = [s.at[0], 0, s.at[1]];
  o.rotation = PI;
}
assert.ok(!m.objects.some((o) => o.assetId === OLD_STAIRS_ASSET), `nothing uses ${OLD_STAIRS_ASSET}`);
for (const [id, name] of Object.entries(ROOM_NAMES)) {
  const r = m.rooms.find((r) => r.id === id);
  assert.ok(r, `room ${id}`);
  r.name = name;
}
const review = m.ownerReview;
review.newObjectIds = union(without(review.newObjectIds, OBJECT_IDS), OBJECT_IDS);
review.removedPlanObjectIds = union(
  without(review.removedPlanObjectIds, REMOVED_PLAN),
  REMOVED_PLAN,
);
review.items = review.items.filter((i) => !ITEM_IDS.includes(i.id));
const fmt = (v) => v.toFixed(2).replace('-', '−');
const span = (a, b) => `${fmt(a)}..${fmt(b)}`;
review.items.push(
  {
    id: 'rehab-bikes',
    rooms: ['rehab-open'],
    change:
      'People ride the recumbent steppers ("the bikes"): community-25 rides stepper 1 all day with seated breathers; a new participant (rehab-rider-02) rides stepper 2 in two sessions between the quiet room and an acupressure appointment. Since round 4 the row has four steppers (see rehab-r4-layout).',
    unresolved:
      'Riders face the Valley Blvd windows as the machines are placed; how long a participant stays on a stepper (here 150–200 s of the 720 s loop per session) is illustrative.',
  },
  {
    id: 'rehab-practice-stairs',
    rooms: ['rehab-open'],
    change:
      'A participant trains on the practice stairs twice a day with a second PT, four climbs a session: up one flight, round the landing and down the other, resting at the foot they reach and climbing back the other way. Since round 4 the stairs are a right-angle stair against the gym’s east wall (see rehab-r4-layout); they first moved from the glazed SW corner to the Valley glazing.',
    unresolved: 'Session lengths and the number of climbs are illustrative.',
  },
  {
    id: 'rehab-corner-exerciser',
    rooms: ['rehab-open'],
    change:
      'The person exercising in the corner beside the stairs to the mezzanine (community-25 at −30.1, 17.1) is gone: that actor now rides stepper 1.',
    unresolved: '',
  },
  {
    id: 'rehab-practice-kitchen',
    rooms: ['rehab-open'],
    change:
      'The plan’s demonstration counter is replaced by an ADL practice kitchen against the same wall: 1.9 m of base cabinets with counter, sink and upper cabinets, a refrigerator at the south end and a counter-top microwave, fronts to the east with ≥ 0.9 m clear in front; participants rehearse at the sink and microwave with an OT twice a day. Mat plinth 1, which overlapped the counter, no longer stands by the kitchen (round 4: beside the parallel bars).',
    unresolved:
      'The owner listed a fridge, a microwave and cabinets; the sink is assumed (a practice kitchen without one is unusual) and no range or oven is modelled. The run’s length (1.9 m) and the counter height (0.84 m, wheelchair-friendly) are assumed.',
  },
  {
    id: 'rehab-quiet-room',
    rooms: ['rehab-support-west'],
    change:
      'The west support room is the quiet room: three recliners along its north wall facing the door; participants rest in them between sessions (they walk in and out through the south door).',
    unresolved: 'Three recliners assumed for "some recliners"; the room fits three with a walking strip along the door wall.',
  },
  {
    id: 'rehab-massage-room',
    rooms: ['rehab-support-mid'],
    change:
      'The south-west ("bottom") support room is the acupressure massage room: a massage bed along the west wall, an acupressure therapist in the room all day with two 150 s appointments per loop (the participant seated on the bed’s edge, the therapist working from the foot of the bed). The story’s PT base point moves out of the bed’s footprint.',
    unresolved:
      'The acupressure therapist is drawn as rehab staff (scrubs); whether acupressure is given by a PT, a TCM practitioner or a visiting therapist is not known. Participants are shown seated rather than lying.',
  },
  {
    id: 'rehab-workspace',
    rooms: ['rehab-open'],
    change:
      'Four standing desks with monitors are the PT & OT workstations, where a second PT and OT chart between sessions. The four participant chairs at the glazed SW corner are removed. Round 4 moved the desks from the NW corner room (now the fire pump room) to where the training stairs stood (see rehab-r4-layout).',
    unresolved: '',
  },
  {
    id: 'rehab-r4-layout',
    rooms: ['rehab-support-nw', 'rehab-open'],
    change:
      `Owner on the live build: "we move the desk to the wrong place". (1) The NW corner room on S Ethel Ave (rehab-support-nw, x ${span(-31.19, -27.53)}, z ${span(8.9, 13.33)}) is the fire pump room and is left completely empty: the four standing desks leave it, no furniture stays and no one goes in at any time; its door gap is unchanged. ` +
      `(2) The four standing desks (rehab-workspace-desk-1..4, now 0.9 × 0.6 m) stand where the training stairs stood: a row along the Valley Blvd glazing from the S Ethel Ave corner (x ${span(DESK_X0, DESKS_X1)}, z ${span(DESK_Z - DESK_D / 2, DESK_Z + DESK_D / 2)}), users facing the glazing; Ot 2 works at desk 3 and Pt 2 at desk 4. ` +
      `(3) The straight training stairs (rehab-training-stairs, same id, new asset rehab-corner-stairs) become a right-angle stair against the gym’s east wall (the south multistall restroom’s west face, plan-wall-178), footprint x ${span(SX - STAIR[0] / 2, SX + STAIR[0] / 2)}, z ${span(SZ - STAIR[2] / 2, SZ + STAIR[2] / 2)}: two flights of three ${fmt(TREAD)} m treads and four 0.15 m risers to a 0.9 × 0.9 m landing at 0.6 m in the south-east corner, flights 0.9 m wide, handrails on both sides of each flight and round the landing’s outer sides; one flight along the wall with its foot to the north, the other running west with its foot just south of the parallel bars; 0.9 m of clear floor at each foot. The participant climbs one flight, turns on the landing and goes down the other, four climbs a session alternating direction, with the PT spotting from the floor in the open corner between the flights. ` +
      `(4) Mat plinth 1 moves from north of the practice kitchen to the same east wall north of the stair (x ${span(PLINTH_1.at[0] - PLINTH[0] / 2, PLINTH_1.at[0] + PLINTH[0] / 2)}, z ${span(PLINTH_1.at[1] - PLINTH[2] / 2, PLINTH_1.at[1] + PLINTH[2] / 2)}), long side along the wall, ${fmt(PLINTH_1.at[0] - PLINTH[0] / 2 - BARS.x1)} m from the parallel bars. ` +
      `(5) Four recumbent steppers (1 and 2 kept with their riders, 3 and 4 added) stand in a row along the Valley glazing between the desks and the stair (x ${span(STEPPER_X0, STEPPER_X0 + 4 * STEPPER[0] + 3 * STEPPER_GAP)}), ${fmt(STEPPER_GAP)} m apart. The Balance & mobility participant who stood where the stair’s west foot is now (community-24) practises on the open floor south of the massage room (${fmt(C24_SPOT[0])}, ${fmt(C24_SPOT[1])}).`,
    unresolved:
      'Assumptions: the room the owner calls the fire pump room is the NW corner room (the grey concrete room top-left on the drawing); no pump or riser equipment is drawn in it. "Where the current training stairs are" is the SW glazed corner along Valley Blvd, the desks in one row facing the glazing (the drawing showed workstations in that corner); 0.9 m-wide desks are assumed so that desks, four steppers and a walkway past the stair fit along the glazing. "To the east against the wall" is the gym’s east wall (the south restroom’s west face), landing at its south end; the landing reaches 0.23 m past the end of that wall so that about 0.7 m of floor stays between the bars’ south-east post and the west flight (the only way from the corridor east of the bars to the south of the gym besides the narrow aisle west of the bars). Tread depth (0.28 m), riser height, landing size and handrail height (0.88 m) are typical, not measured. "The other empty wall" is read as the same east wall, north of the stair, beside the parallel bars; nobody uses that plinth in the loop. The new steppers’ place (the row along the glazing) and spacing are assumed; the two new machines are unoccupied. The walkway between the last stepper and the stair, to the strip south of the restroom (where the drawing shows doors to Valley Blvd), is about 0.75 m.',
  },
);

// --- Checks on the furniture -----------------------------------------------------
/** World-space axis-aligned footprint of an object whose rotation is a multiple of π/2. */
const footprint = (o) => {
  const a = m.assets[o.assetId],
    [w, , d] = a.dimensions.map((v, i) => v * o.scale[i]),
    quarter = Math.round(o.rotation / HALF);
  assert.ok(Math.abs(o.rotation - quarter * HALF) < 1e-3, `${o.id}: right-angle rotation`);
  const [ex, ez] = quarter % 2 ? [d, w] : [w, d];
  return {
    id: o.id,
    x0: o.position[0] - ex / 2,
    x1: o.position[0] + ex / 2,
    z0: o.position[2] - ez / 2,
    z1: o.position[2] + ez / 2,
  };
};
/**
 * The boxes an object really occupies: its navigation footprints when it has
 * them (the corner stair's flights and landing, the bars' two rails), else
 * its whole footprint.
 */
const parts = (o) => {
  if (!o.navigationFootprints) return [footprint(o)];
  const c = Math.cos(o.rotation),
    s = Math.sin(o.rotation);
  assert.ok(Math.abs(c * s) < 1e-3, `${o.id}: right-angle rotation`);
  return o.navigationFootprints.map(([x, z, w, d]) => {
    const cx = o.position[0] + c * x + s * z,
      cz = o.position[2] - s * x + c * z,
      [ex, ez] = Math.abs(s) > 0.5 ? [d, w] : [w, d];
    return { id: o.id, x0: cx - ex / 2, x1: cx + ex / 2, z0: cz - ez / 2, z1: cz + ez / 2 };
  });
};
const overlaps = (a, b, gap = 0) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;
/** Shortest distance between two axis-aligned boxes (0 when they touch or overlap). */
const boxGap = (a, b) =>
  Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1));
const rehabFurniture = m.objects.filter(
  (o) =>
    o.zoneId === 'rehab' &&
    (o.layer ?? 'furniture') === 'furniture' &&
    o.position[1] < 1.4 &&
    m.assets[o.assetId].dimensions[1] >= 0.15,
);
const mine = new Set([...OBJECT_IDS, plinth1.id, stairs.id, ...steppers.map((s) => s.id)]);
for (const o of rehabFurniture) {
  if (!mine.has(o.id)) continue;
  for (const other of rehabFurniture) {
    if (other.id === o.id || (other.id === 'rehab-kitchen-microwave' && o.id === 'rehab-kitchen-casework') || (o.id === 'rehab-kitchen-microwave' && other.id === 'rehab-kitchen-casework')) continue;
    for (const f of parts(o))
      for (const g of parts(other)) assert.ok(!overlaps(f, g), `${o.id} overlaps ${other.id}`);
  }
  assert.equal(
    nav.roomAt(m, 'ground', [o.position[0], o.position[2]]) ?? null,
    o.roomId ?? null,
    `${o.id} stands in ${o.roomId ?? 'no room'}`,
  );
}
// The microwave sits on the counter, within the casework's footprint.
{
  const mw = footprint(object('rehab-kitchen-microwave')),
    cw = footprint(object('rehab-kitchen-casework'));
  assert.ok(mw.x0 >= cw.x0 - 1e-6 && mw.x1 <= cw.x1 + 1e-6 && mw.z0 >= cw.z0 && mw.z1 <= cw.z1, 'microwave on the counter');
}
// ≥ 0.9 m clear in front of the kitchen run (east of its fronts).
{
  const front = { x0: KITCHEN_FRONT, x1: KITCHEN_FRONT + CLEAR_IN_FRONT, z0: CASEWORK_Z0, z1: FRIDGE_Z0 + dims('rehab-fridge')[0] };
  for (const o of rehabFurniture)
    if (!['rehab-kitchen-casework', 'rehab-kitchen-fridge', 'rehab-kitchen-microwave'].includes(o.id))
      assert.ok(!overlaps(front, footprint(o)), `${o.id} is within ${CLEAR_IN_FRONT} m of the kitchen fronts`);
  assert.ok(front.x1 < object('rehab-ot-chair-therapist').position[0] - 0.275, 'the OT station is beyond the kitchen clearance');
}
// Round 4: the fire pump room holds nothing at all (people are checked with the loop).
const PUMP_ROOM = m.rooms.find((r) => r.id === 'rehab-support-nw');
const inPumpRoom = (p) => nav.insidePolygon(p, PUMP_ROOM.polygon);
for (const o of m.objects)
  assert.ok(
    o.levelId !== 'ground' || !inPumpRoom([o.position[0], o.position[2]]),
    `${o.id} stands in the fire pump room`,
  );
// The desks: in a row along the glazing, inside the gym, clear of the PT
// mezzanine stair's flight and of the floor under and in front of its upper
// landing (1.2 m beyond the flight's south end).
{
  const ptStair = footprint(object('rehab-stair')),
    ptStairClear = { x0: ptStair.x0, x1: ptStair.x1, z0: ptStair.z0, z1: ptStair.z1 + 1.2 };
  for (const d of desks) {
    const f = footprint(object(d.id));
    assert.ok(f.x0 >= GLAZING_WEST - 1e-6 && f.z1 <= GLAZING_SOUTH - 1e-6, `${d.id} stands inside the glazing`);
    assert.ok(boxGap(f, ptStairClear) > 0.5, `${d.id} keeps clear of the PT mezzanine stair`);
  }
  for (const p of DESK_USER)
    assert.ok(boxGap({ x0: p[0], x1: p[0], z0: p[1], z1: p[1] }, ptStairClear) > 0.5, 'desk users keep clear of the PT mezzanine stair');
}
// The steppers: 0.5 m between machines, the desks to the west, the stair to the east.
{
  const f = steppers.map((s) => footprint(object(s.id)));
  for (let i = 1; i < f.length; i++) assert.ok(f[i].x0 - f[i - 1].x1 >= STEPPER_GAP - 1e-6, 'steppers 0.5 m apart');
  assert.ok(f[0].x0 > DESKS_X1 + 0.05 && f.every((g) => g.z1 <= GLAZING_SOUTH), 'steppers east of the desks, inside the glazing');
}
// The stair: against the east wall, landing at its south end, clear of every
// wall, 0.9 m clear floor at both feet (no furniture, no wall), the west foot
// clear of the bars and the steppers; the walkways past it (to the strip
// south of the restroom, and between the bars' south-east post and the west
// flight) stay open (also checked on the grid with the loop).
{
  const f = footprint(stairs),
    wallZ0 = Math.min(plan178.a[1], plan178.b[1]);
  assert.ok(Math.abs(f.x1 - GYM_EAST) <= 0.02 && f.z0 >= wallZ0 && Math.abs(f.z1 - GYM_EAST_SOUTH) <= 0.25, 'the stair stands against the east wall, landing at its south end');
  for (const b of parts(stairs))
    for (let x = b.x0; x <= b.x1 + 1e-9; x += 0.05)
      for (let z = b.z0; z <= b.z1 + 1e-9; z += 0.05)
        for (const w of m.walls.filter((w) => w.levelId === 'ground'))
          assert.ok(nav.distanceToSegment([x, z], w.a, w.b) >= w.thickness / 2, `the stair cuts into ${w.id}`);
  for (const zone of [FOOT_N_ZONE, FOOT_W_ZONE]) {
    for (const o of rehabFurniture)
      if (o.id !== stairs.id) assert.ok(!overlaps(zone, footprint(o)), `${o.id} stands in front of a foot of the stairs`);
    for (let x = zone.x0; x <= zone.x1 + 1e-9; x += 0.1)
      for (let z = zone.z0; z <= zone.z1 + 1e-9; z += 0.1) {
        assert.equal(nav.roomAt(m, 'ground', [x, z]), 'rehab-open', 'the feet of the stairs are on the gym floor');
        for (const w of m.walls.filter((w) => w.levelId === 'ground'))
          assert.ok(nav.distanceToSegment([x, z], w.a, w.b) >= w.thickness / 2 - 1e-6, `${w.id} cuts into a foot of the stairs`);
      }
  }
  assert.ok(FOOT_W_ZONE.z0 > BARS.z1 && FOOT_W_ZONE.x1 > BARS.x1, 'the west foot lands just south of the bars');
  const walkway = boxGap(footprint(object('rehab-recumbent-stepper-2')), parts(stairs)[1]),
    eastRail = parts(barsObject).sort((a, b) => b.x1 - a.x1)[0],
    slot = boxGap(eastRail, parts(stairs)[1]);
  assert.ok(walkway >= 0.75, `the walkway between the steppers and the stair is ${walkway.toFixed(2)} m`);
  assert.ok(slot >= 0.7, `the walkway between the bars and the stair is ${slot.toFixed(2)} m`);
}
// The plinth: against the east wall, north of the stair's north foot, south
// of the cross-hall mouth, ≥ 0.8 m from the bars for a therapist.
{
  const f = footprint(plinth1);
  assert.ok(Math.abs(f.x1 - GYM_EAST) <= 0.01 && f.z0 >= 19.6 && f.z1 <= FOOT_N_ZONE.z0, 'plinth 1 along the east wall');
  assert.ok(f.x0 - BARS.x1 >= 0.8 && f.z0 < BARS.z1 && f.z1 > BARS.z0, 'plinth 1 beside the bars, 0.8 m clear');
}

// =============================================================================
// The loop
// =============================================================================
const loop = JSON.parse(readFileSync(LOOP[0], 'utf8'), (_, v, context) =>
  typeof v === 'number' && context?.source !== String(v)
    ? JSON.rawJSON(context.source)
    : v,
);
const templates = JSON.parse(readFileSync(TEMPLATES[0], 'utf8'));
const grid = nav.navGrid(m, nav.dayProgramNavOptions());
const ZONE = 'rehab';
const PACE = { staff: 0.7, participant: 0.55, stairs: 0.35 };

/** Where someone sits on a recumbent stepper: the seat is at local +z 0.31. */
const riderPoint = (id) => {
  const o = object(id);
  return [r3(o.position[0] + Math.sin(o.rotation) * 0.31), r3(o.position[2] + Math.cos(o.rotation) * 0.31)];
};
const STEPPER_1 = riderPoint('rehab-recumbent-stepper-1'),
  STEPPER_2 = riderPoint('rehab-recumbent-stepper-2');

// --- community-24: off the stair's west foot ------------------------------------
// The Balance & mobility participant stood all day where the corner stair's
// west foot now is; the same day, practising on the open floor south of the
// massage room.
{
  const c24 = loop.actors.find((a) => a.id === 'community-24');
  assert.ok(c24, 'community-24 in the loop');
  for (const s of c24.segments) {
    assert.notEqual(s.action, 'walk', 'community-24 stands in one place all day');
    s.path = s.path.map(() => [...C24_SPOT]);
  }
  assert.equal(nav.roomAt(m, 'ground', C24_SPOT), 'rehab-open');
}
/**
 * The room's community cast stand (or, community-25, ride) in one place all
 * day; every route keeps 0.8 m from them, as validate-community wants 0.58 m
 * between them and everyone at every moment.
 */
const STILL = JSON.parse(JSON.stringify(loop))
  .actors.filter(
    (a) => a.id.startsWith('community-') && a.id !== 'community-25' && a.segments.some((s) => s.zoneId === ZONE),
  )
  .map((a) => a.segments[0].path[0])
  .concat([STEPPER_1]);
/**
 * Floor the routes here keep out of, though the grid lets them through: the
 * lane inside the parallel bars (a participant walks it all day).
 */
const NO_GO = [{ x0: BARS.x0 + 0.2, x1: BARS.x1 - 0.2, z0: BARS.z0 + 0.1, z1: BARS.z1 - 0.1 }];
const avoid = (q) =>
  STILL.some((p) => nav.distance(p, q) < 0.8) ||
  NO_GO.some((b) => q[0] >= b.x0 && q[0] <= b.x1 && q[1] >= b.z0 && q[1] <= b.z1);
/**
 * Seats joined to the grid from a chosen side: stepper 2 is mounted from the
 * floor north of it (its nearest free cell is on its east side, in the
 * walkway past the stair's west foot).
 */
const PREFERRED = [[STEPPER_2, [r3(Math.round(STEPPER_2[0] / 0.2) * 0.2), 25.0]]];
const RECLINER_SEAT_AT = RECLINER_X.map((x) => [x, r3(RECLINER_Z - RECLINER_SEAT)]);
const SINK = [r3(KITCHEN_FRONT + 0.36), SINK_Z],
  MICRO = [r3(KITCHEN_FRONT + 0.36), microwave.z],
  OT_SPOT = [-25.05, r3((SINK_Z + microwave.z) / 2)];
const BED_EDGE = [r3(BED[0] + dims('rehab-massage-bed')[0] / 2 + 0.05), r3(BED[1] + 0.5)],
  THERAPIST_AT_BED = [-28.3, r3(BED[1] + dims('rehab-massage-bed')[2] / 2 + 0.3)],
  THERAPIST_DESK = [-27.1, 20.3];

// The corner stair, climbed from either foot: up one flight (a point at the
// centre of each 0.28 m tread, rising 0.15 m), across the landing with a turn
// at its centre, and down the other flight, with the height at every point
// (rehab-assets.ts builds the treads to these heights).
const STAIR_N = [FLIGHT_A_X, r3(STAIR_N_EDGE - 0.4)], // standing at the north foot
  STAIR_W = [r3(STAIR_W_EDGE - 0.4), FLIGHT_B_Z], // standing at the west foot
  /** The PT's spot on the floor in the open corner between the flights, beside both. */
  PT_AT_STAIRS = [r3((STAIR_W_EDGE + LANDING_W) / 2), r3((STAIR_N_EDGE + LANDING_N) / 2)];
const CLIMB_N_TO_W = [
  [STAIR_N, 0],
  [[FLIGHT_A_X, STAIR_N_EDGE], 0],
  ...[0, 1, 2].map((i) => [[FLIGHT_A_X, r3(STAIR_N_EDGE + (i + 0.5) * TREAD)], r3((i + 1) * RISE)]),
  [[FLIGHT_A_X, LANDING_N], DECK],
  [[FLIGHT_A_X, FLIGHT_B_Z], DECK],
  [[LANDING_W, FLIGHT_B_Z], DECK],
  ...[2, 1, 0].map((i) => [[r3(STAIR_W_EDGE + (i + 0.5) * TREAD), FLIGHT_B_Z], r3((i + 1) * RISE)]),
  [[STAIR_W_EDGE, FLIGHT_B_Z], 0],
  [STAIR_W, 0],
];
const CLIMBS = {
  down: {
    path: CLIMB_N_TO_W.map(([p]) => p),
    heights: CLIMB_N_TO_W.map(([, y]) => y),
    title: 'Practice stairs · up the wall flight, round the landing, down the west flight',
  },
  up: {
    path: CLIMB_N_TO_W.map(([p]) => p).reverse(),
    heights: CLIMB_N_TO_W.map(([, y]) => y).reverse(),
    title: 'Practice stairs · up the west flight, round the landing, down the wall flight',
  },
};
const CLIMB_TIME = r4(nav.pathLength(CLIMBS.down.path) / PACE.stairs),
  STAIR_CLIMBS = 4;
assert.ok(Math.max(...CLIMBS.down.heights) === DECK && CLIMBS.down.heights.every((y, i) => y === CLIMBS.up.heights.at(-1 - i)));

/** Every 5 cm along a polyline. */
const samples = (path) => {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [path[i - 1], path[i]],
      n = Math.max(1, Math.ceil(nav.distance(p, q) / 0.05));
    for (let k = 0; k <= n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
};
const clearSpot = (p, what) =>
  assert.ok(nav.isClear(grid, p), `${what} (${p.join(', ')}) is not clear of walls and furniture`);
for (const [p, what] of [
  [SINK, 'the sink spot'],
  [MICRO, 'the microwave spot'],
  [OT_SPOT, 'the OT’s kitchen spot'],
  [THERAPIST_AT_BED, 'the therapist’s spot at the bed'],
  [THERAPIST_DESK, 'the therapist’s desk spot'],
  [PT_AT_STAIRS, 'the PT’s spot between the flights'],
  [STAIR_N, 'the north foot of the stairs'],
  [STAIR_W, 'the west foot of the stairs'],
  [C24_SPOT, 'community-24’s new spot'],
  ...DESK_USER.map((p, i) => [p, `desk ${i + 1}’s user spot`]),
])
  clearSpot(p, what);
for (const p of [STAIR_N, STAIR_W, PT_AT_STAIRS]) assert.equal(nav.roomAt(m, 'ground', p), 'rehab-open');
assert.equal(nav.roomAt(m, 'ground', BED_EDGE), 'rehab-support-mid');
for (const p of RECLINER_SEAT_AT) assert.equal(nav.roomAt(m, 'ground', p), 'rehab-support-west');
// Round 4: the workstations are on the gym floor at the SW glazing (they were
// in rehab-support-nw, now the fire pump room).
for (const p of DESK_USER) assert.equal(nav.roomAt(m, 'ground', p), 'rehab-open');
// The strip south of the restroom stays reachable past the stair.
{
  const labels = nav.componentLabels(grid),
    cell = (p) => (Math.round(p[0] / 0.2) - grid.ix0) * grid.nz + (Math.round(p[1] / 0.2) - grid.iz0);
  for (const p of [[-17.0, 26.2], STAIR_W, STAIR_N, PT_AT_STAIRS])
    assert.equal(labels[cell(nav.snap(grid, p, { connected: false }))], 0, `(${p.join(', ')}) is on the circulating floor`);
}

/**
 * A seat or a spot joins the grid at the nearest clear cell in its own room
 * (nav.routeBetween would take the nearest cell even across a wall, which a
 * recliner against a wall can trigger); the approach leg is at most 1.2 m and
 * keeps 0.22 m from walls, as routeBetween requires.
 */
const roomOf = (p) => nav.roomAt(m, 'ground', p) ?? null;
const join = (p) => {
  const prefer = PREFERRED.find(([seat]) => nav.distance(seat, p) < 1e-6)?.[1];
  return nav.snap(grid, p, {
    avoid: (q) =>
      roomOf(q) !== roomOf(p) || avoid(q) || (prefer && nav.distance(q, prefer) > 0.3),
  });
};
const approach = (p, q, what) => {
  const d = nav.distance(p, q);
  assert.ok(d <= 1.2, `${what}: approach leg of ${d.toFixed(2)} m (keep ≤ 1.2)`);
  for (const s of samples([p, q]))
    assert.ok(nav.wallClearanceAt(grid, s) >= 0.22, `${what}: approach leg clips a wall near (${q.join(', ')})`);
};
const leg = (a, b) => {
  const sa = join(a),
    sb = join(b);
  approach(a, sa, `from (${a.join(', ')})`);
  approach(sb, b, `to (${b.join(', ')})`);
  const core =
    nav.distance(sa, sb) < 1e-6 ? [sa] : nav.route(grid, sa, sb, nav.WALL_CLEARANCE, avoid);
  return [a, ...core, b];
};
/** With REHAB_DEBUG set, each routed walk's length and points are printed. */
const debug = (id, title, path) =>
  process.env.REHAB_DEBUG &&
  console.log(`${id} · ${title}: ${nav.pathLength(path).toFixed(1)} m ${JSON.stringify(path)}`);
/** A route on the grid through optional waypoints. */
const route = (a, b, via = []) => {
  const pts = [a, ...via, b],
    out = [];
  for (let i = 1; i < pts.length; i++)
    for (const p of leg(pts[i - 1], pts[i])) {
      const q = [r3(p[0]), r3(p[1])];
      if (!out.length || nav.distance(out.at(-1), q) > 1e-6) out.push(q);
    }
  assert.ok(nav.distance(out[0], a) < 1e-6 && nav.distance(out.at(-1), b) < 1e-6);
  return out;
};

/** One person's day, built as stays with the walks between them routed on the grid. */
class Track {
  constructor(id, start) {
    this.id = id;
    this.segments = [];
    this.here = [...start];
  }
  get clock() {
    return this.segments.length ? this.segments.at(-1).end : 0;
  }
  stay(end, action, title, heading, extra = {}) {
    const start = this.clock;
    assert.ok(end > start, `${this.id}: "${title}" ends (${end}) after it starts (${start})`);
    this.segments.push({
      start: r4(start),
      end: r4(end),
      action,
      path: [[...this.here], [...this.here]],
      zoneId: ZONE,
      heading,
      ...extra,
      title,
    });
    return this;
  }
  /** Walk to `to`, arriving at `arrive`; the previous stay ends when the walk begins. */
  walk(to, arrive, pace, title, via = []) {
    const path = route(this.here, to, via),
      leave = r4(arrive - nav.pathLength(path) / pace),
      last = this.segments.at(-1);
    debug(this.id, title, path);
    assert.ok(
      last && leave >= last.start + 1 && leave <= last.end + 1e-6,
      `${this.id}: leaves for "${title}" at ${leave}, outside the previous stay (${last?.start}–${last?.end})`,
    );
    last.end = leave;
    this.segments.push({ start: leave, end: r4(arrive), action: 'walk', path, zoneId: ZONE, heading: 0, title });
    this.here = [...to];
    return this;
  }
  /** Walk to `to` now, when the previous stay ends. */
  go(to, pace, title, via = []) {
    const path = route(this.here, to, via),
      start = this.clock;
    debug(this.id, title, path);
    this.segments.push({ start: r4(start), end: r4(start + nav.pathLength(path) / pace), action: 'walk', path, zoneId: ZONE, heading: 0, title });
    this.here = [...to];
    return this;
  }
  /** A hand-authored leg (the stair climb, the lane round the stairs). */
  leg(path, duration, title, heights) {
    assert.ok(nav.distance(path[0], this.here) < 1e-6, `${this.id}: "${title}" starts where they are`);
    const start = this.clock;
    this.segments.push({
      start: r4(start),
      end: r4(start + duration),
      action: 'walk',
      path: path.map((p) => [...p]),
      zoneId: ZONE,
      heading: 0,
      ...(heights ? { heights } : {}),
      title,
    });
    this.here = [...path.at(-1)];
    return this;
  }
  /**
   * Climbs of the corner stair, `start`–`end`, from the north foot: up one
   * flight, round the landing and down the other, a rest facing the stair at
   * the foot reached, then back over the other way; an even number of
   * climbs ends at the north foot again.
   */
  stairs(start, end, cycles = STAIR_CLIMBS) {
    assert.equal(this.clock, start);
    assert.ok(cycles % 2 === 0 && nav.distance(this.here, STAIR_N) < 1e-6, `${this.id} starts and ends at the north foot of the stairs`);
    for (let i = 1; i <= cycles; i++) {
      const climb = i % 2 ? CLIMBS.down : CLIMBS.up;
      this.leg(climb.path, CLIMB_TIME, climb.title, climb.heights);
      this.stay(start + ((end - start) * i) / cycles, 'idle', 'Catching breath at the foot of the stairs', i % 2 ? HALF : 0);
    }
    return this;
  }
  done(duration) {
    assert.equal(this.clock, duration, `${this.id} fills the loop`);
    assert.ok(nav.distance(this.segments[0].path[0], this.here) < 1e-6, `${this.id} ends where the day began`);
    return this.segments;
  }
}
const seated = { seated: true };

// --- community-25: from the corner by the mezzanine stair onto stepper 1 ----------
const c25 = loop.actors.find((a) => a.id === 'community-25');
assert.ok(c25, 'community-25 in the loop');
{
  const t = new Track(c25.id, STEPPER_1);
  for (let i = 0; i < 4; i++)
    t.stay(i * 180 + 150, 'cycle', 'Recumbent stepper · endurance', 0, seated).stay((i + 1) * 180, 'seated', 'Resting on the stepper', 0, seated);
  Object.assign(c25, {
    label: 'Recumbent stepper · endurance',
    offset: 0,
    roomId: 'rehab-open',
    seated: true,
    seatId: 'rehab-recumbent-stepper-1',
    segments: t.done(loop.duration),
  });
}

// --- The six new people ---------------------------------------------------------------
const PEOPLE = [
  { id: 'rehab-rider-02', role: 'participant', variant: 66, label: 'Participant · recumbent stepper' },
  { id: 'rehab-adl-participant', role: 'participant', variant: 67, label: 'Participant · kitchen practice & acupressure' },
  { id: 'rehab-stairs-participant', role: 'participant', variant: 68, label: 'Participant · stair training' },
  { id: 'rehab-pt-02', role: 'pt', variant: 3, label: 'Pt 2' },
  { id: 'rehab-ot-02', role: 'ot', variant: 4, label: 'Ot 2' },
  { id: 'rehab-massage-therapist', role: 'pt', variant: 5, label: 'Acupressure therapist' },
];
const PROFILES = [
  { id: 'rehab-rider-02', role: 'participant', appearance: 66, skin: '#c48e69', hair: '#c8c5be', hairStyle: 3, glasses: false, accent: '#8B9A6B', height: 0.97, figure: 'm', wardrobe: 2, cut: 'shirt' },
  { id: 'rehab-adl-participant', role: 'participant', appearance: 67, skin: '#dcae8b', hair: '#e6e2da', hairStyle: 2, glasses: true, accent: '#B8674A', height: 0.95, figure: 'f', wardrobe: 1, cut: 'cardigan' },
  { id: 'rehab-stairs-participant', role: 'participant', appearance: 68, skin: '#a06e50', hair: '#a19d96', hairStyle: 0, glasses: false, accent: '#7A6E9E', height: 0.98, figure: 'm', wardrobe: 3, cut: 'sweater' },
  { id: 'rehab-pt-02', role: 'pt', appearance: 3, skin: '#ecc9a8', hair: '#3b2a21', hairStyle: 1, glasses: false, accent: '#5A7FA8', height: 1.0, figure: 'f' },
  { id: 'rehab-ot-02', role: 'ot', appearance: 4, skin: '#a06e50', hair: '#231f1c', hairStyle: 3, glasses: true, accent: '#7FA07A', height: 1.02, figure: 'm' },
  { id: 'rehab-massage-therapist', role: 'pt', appearance: 5, skin: '#dcae8b', hair: '#5c4232', hairStyle: 6, glasses: false, accent: '#5A7FA8', height: 0.99, figure: 'm' },
];
const ACTOR_IDS = PEOPLE.map((p) => p.id);

/** The day's fixed moments (loop seconds; 90 s ≈ one hour). */
const T = {
  kitchen1: [75, 185], // stairs participant with the OT: sink, then microwave
  kitchen2: [215, 310], // ADL participant with the OT
  ride1: [55, 256], // rider 02 on stepper 2
  massage1: [280, 430], // rider 02
  massage2: [465, 615], // ADL participant
  stairs1: [280, 410],
  stairs2: [505, 635],
  ride2: [530, 668],
};
const P = PACE.participant,
  S = PACE.staff;
const tracks = {};

// Rider 02: quiet room → stepper 2 → massage → quiet room → stepper 2 → quiet room.
{
  const t = new Track('rehab-rider-02', RECLINER_SEAT_AT[0]);
  t.stay(T.ride1[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(STEPPER_2, T.ride1[0], P, 'Walk to the recumbent stepper')
    .stay(160, 'cycle', 'Recumbent stepper · endurance', 0, seated)
    .stay(175, 'seated', 'Catching breath on the stepper', 0, seated)
    .stay(T.ride1[1], 'cycle', 'Recumbent stepper · endurance', 0, seated)
    .walk(BED_EDGE, T.massage1[0], P, 'Walk to the acupressure room')
    .stay(T.massage1[1], 'seated', 'Acupressure massage · shoulders and back', HALF, seated)
    .go(RECLINER_SEAT_AT[0], P, 'Back to the quiet room')
    .stay(T.ride2[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(STEPPER_2, T.ride2[0], P, 'Walk to the recumbent stepper')
    .stay(610, 'cycle', 'Recumbent stepper · endurance', 0, seated)
    .stay(625, 'seated', 'Catching breath on the stepper', 0, seated)
    .stay(T.ride2[1], 'cycle', 'Recumbent stepper · endurance', 0, seated)
    .go(RECLINER_SEAT_AT[0], P, 'Back to the quiet room')
    .stay(loop.duration, 'seated', 'Resting in the quiet room', 0, seated);
  tracks[t.id] = t.done(loop.duration);
}
// The ADL participant: quiet room → kitchen (sink, microwave) → quiet room → massage → quiet room.
{
  const t = new Track('rehab-adl-participant', RECLINER_SEAT_AT[1]);
  t.stay(T.kitchen2[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(SINK, T.kitchen2[0], P, 'Walk to the practice kitchen')
    .stay(265, 'serve', 'Practice kitchen · washing up at the sink', -HALF)
    .go(MICRO, P, 'Along the counter to the microwave')
    .stay(T.kitchen2[1], 'tabletop', 'Practice kitchen · heating a meal in the microwave', -HALF)
    .go(RECLINER_SEAT_AT[1], P, 'Back to the quiet room')
    .stay(T.massage2[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(BED_EDGE, T.massage2[0], P, 'Walk to the acupressure room')
    .stay(T.massage2[1], 'seated', 'Acupressure massage · shoulders and back', HALF, seated)
    .go(RECLINER_SEAT_AT[1], P, 'Back to the quiet room')
    .stay(loop.duration, 'seated', 'Resting in the quiet room', 0, seated);
  tracks[t.id] = t.done(loop.duration);
}
// The stair-training participant: quiet room → kitchen → quiet room → stairs (×2) → quiet room.
{
  const t = new Track('rehab-stairs-participant', RECLINER_SEAT_AT[2]);
  t.stay(T.kitchen1[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(SINK, T.kitchen1[0], P, 'Walk to the practice kitchen')
    .stay(130, 'serve', 'Practice kitchen · washing up at the sink', -HALF)
    .go(MICRO, P, 'Along the counter to the microwave')
    .stay(T.kitchen1[1], 'tabletop', 'Practice kitchen · heating a meal in the microwave', -HALF)
    .go(RECLINER_SEAT_AT[2], P, 'Back to the quiet room')
    .stay(T.stairs1[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(STAIR_N, T.stairs1[0], P, 'Walk to the practice stairs')
    .stairs(...T.stairs1)
    .go(RECLINER_SEAT_AT[2], P, 'Back to the quiet room')
    .stay(T.stairs2[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(STAIR_N, T.stairs2[0], P, 'Walk to the practice stairs')
    .stairs(...T.stairs2)
    .go(RECLINER_SEAT_AT[2], P, 'Back to the quiet room')
    .stay(loop.duration, 'seated', 'Resting in the quiet room', 0, seated);
  tracks[t.id] = t.done(loop.duration);
}
// PT 2: standing desk 4 at the SW glazing ↔ the floor between the stair's
// flights, spotting each climb (turning from the first flight to the second)
// and talking through each rest.
{
  const PT_DESK = DESK_USER[3],
    t = new Track('rehab-pt-02', PT_DESK),
    towardWall = face(PT_AT_STAIRS, [FLIGHT_A_X, PT_AT_STAIRS[1]]),
    towardWest = face(PT_AT_STAIRS, [PT_AT_STAIRS[0], FLIGHT_B_Z]);
  const session = ([start, end], cycles = STAIR_CLIMBS) => {
    for (let i = 1; i <= cycles; i++) {
      const climbStart = start + ((end - start) * (i - 1)) / cycles,
        [first, second, rest] = i % 2 ? [towardWall, towardWest, STAIR_W] : [towardWest, towardWall, STAIR_N];
      t.stay(climbStart + CLIMB_TIME / 2, 'treat', 'Spotting the stair climb', first)
        .stay(climbStart + CLIMB_TIME, 'treat', 'Spotting the stair climb', second)
        .stay(start + ((end - start) * i) / cycles, 'consult', 'Feedback between climbs', face(PT_AT_STAIRS, rest));
    }
  };
  t.stay(T.stairs1[0], 'document', 'Charting at the standing desk', 0)
    .walk(PT_AT_STAIRS, T.stairs1[0], S, 'Walk to the practice stairs');
  session(T.stairs1);
  t.go(PT_DESK, S, 'Back to the workstation')
    .stay(T.stairs2[0], 'document', 'Charting at the standing desk', 0)
    .walk(PT_AT_STAIRS, T.stairs2[0], S, 'Walk to the practice stairs');
  session(T.stairs2);
  t.go(PT_DESK, S, 'Back to the workstation').stay(loop.duration, 'document', 'Charting at the standing desk', 0);
  tracks[t.id] = t.done(loop.duration);
}
// OT 2: standing desk 3 at the SW glazing ↔ the practice kitchen, two
// sessions back to back.
{
  const OT_DESK = DESK_USER[2],
    t = new Track('rehab-ot-02', OT_DESK),
    atSink = face(OT_SPOT, SINK),
    atMicro = face(OT_SPOT, MICRO);
  t.stay(T.kitchen1[0], 'document', 'Charting at the standing desk', 0)
    .walk(OT_SPOT, T.kitchen1[0], S, 'Walk to the practice kitchen')
    .stay(130, 'consult', 'ADL coaching · washing up', atSink)
    .stay(T.kitchen1[1], 'consult', 'ADL coaching · the microwave', atMicro)
    .stay(T.kitchen2[0], 'document', 'Notes between kitchen sessions', atSink)
    .stay(265, 'consult', 'ADL coaching · washing up', atSink)
    .stay(T.kitchen2[1], 'consult', 'ADL coaching · the microwave', atMicro)
    .go(OT_DESK, S, 'Back to the workstation')
    .stay(loop.duration, 'document', 'Charting at the standing desk', 0);
  tracks[t.id] = t.done(loop.duration);
}
// The acupressure therapist: in the massage room all day, two appointments.
{
  const t = new Track('rehab-massage-therapist', THERAPIST_DESK),
    atBed = face(THERAPIST_AT_BED, BED_EDGE);
  t.stay(T.massage1[0], 'document', 'Preparing the massage room', -HALF)
    .walk(THERAPIST_AT_BED, T.massage1[0], S, 'To the massage bed')
    .stay(T.massage1[1], 'massage', 'Acupressure massage · shoulders and back', atBed)
    .go(THERAPIST_DESK, S, 'Notes after the appointment')
    .stay(T.massage2[0], 'document', 'Preparing the massage room', -HALF)
    .walk(THERAPIST_AT_BED, T.massage2[0], S, 'To the massage bed')
    .stay(T.massage2[1], 'massage', 'Acupressure massage · shoulders and back', atBed)
    .go(THERAPIST_DESK, S, 'Notes after the appointment')
    .stay(loop.duration, 'document', 'Preparing the massage room', -HALF);
  tracks[t.id] = t.done(loop.duration);
}

loop.actors = loop.actors.filter((a) => !ACTOR_IDS.includes(a.id));
for (const p of PEOPLE)
  loop.actors.push({
    id: p.id,
    role: p.role,
    variant: p.variant,
    label: p.label,
    offset: 0,
    levelId: 'ground',
    profileId: p.id,
    segments: tracks[p.id],
  });
const INTERACTIONS = [
  { id: 'rehab-owner-steppers', label: 'Recumbent steppers · endurance', actorIds: ['community-25', 'rehab-rider-02'], window: T.ride1, description: 'Two participants pedal recumbent steppers in the row of four facing the Valley Blvd windows; one rides all morning, the other between the quiet room and an acupressure appointment.' },
  { id: 'rehab-owner-kitchen-1', label: 'Practice kitchen · OT session', actorIds: ['rehab-ot-02', 'rehab-stairs-participant'], window: T.kitchen1, description: 'Activities of daily living in the practice kitchen: washing up at the sink and heating a meal in the microwave, coached by the occupational therapist.' },
  { id: 'rehab-owner-kitchen-2', label: 'Practice kitchen · OT session', actorIds: ['rehab-ot-02', 'rehab-adl-participant'], window: T.kitchen2, description: 'Activities of daily living in the practice kitchen: washing up at the sink and heating a meal in the microwave, coached by the occupational therapist.' },
  { id: 'rehab-owner-stairs-1', label: 'Practice stairs · step training', actorIds: ['rehab-pt-02', 'rehab-stairs-participant'], window: T.stairs1, description: 'Four climbs of the right-angle practice stairs (up one flight, a turn on the landing, down the other, then back the other way) with a rest at the foot after each, the physical therapist spotting from the floor between the flights.' },
  { id: 'rehab-owner-stairs-2', label: 'Practice stairs · step training', actorIds: ['rehab-pt-02', 'rehab-stairs-participant'], window: T.stairs2, description: 'Four climbs of the right-angle practice stairs (up one flight, a turn on the landing, down the other, then back the other way) with a rest at the foot after each, the physical therapist spotting from the floor between the flights.' },
  { id: 'rehab-owner-massage-1', label: 'Acupressure massage', actorIds: ['rehab-massage-therapist', 'rehab-rider-02'], window: T.massage1, description: 'An acupressure appointment in the massage room: the participant sits on the edge of the massage bed while the therapist works on stiff shoulders and back.' },
  { id: 'rehab-owner-massage-2', label: 'Acupressure massage', actorIds: ['rehab-massage-therapist', 'rehab-adl-participant'], window: T.massage2, description: 'An acupressure appointment in the massage room: the participant sits on the edge of the massage bed while the therapist works on stiff shoulders and back.' },
];
loop.interactions = loop.interactions.filter((i) => !INTERACTIONS.some((j) => j.id === i.id));
loop.interactions.splice(
  loop.interactions.findIndex((i) => i.id === 'ot-team') + 1,
  0,
  ...INTERACTIONS.map(({ window, ...i }) => ({ ...i, category: 'rehab', start: window[0], end: window[1], zoneId: ZONE })),
);

// --- Checks on the people ---------------------------------------------------------------
const plain = JSON.parse(JSON.stringify(loop)),
  byId = new Map(plain.actors.map((a) => [a.id, a]));
const touched = [...ACTOR_IDS, 'community-25'];
// Every walk is clear of walls and furniture at the grid's clearances, apart
// from the seat it leaves or reaches and the stairs it climbs.
for (const id of touched)
  for (const s of byId.get(id).segments)
    if (s.action === 'walk' && !s.heights)
      for (const p of samples(s.path)) {
        const nearEnd = [s.path[0], s.path.at(-1)].some((e) => nav.distance(p, e) <= 1.25);
        assert.ok(nearEnd || nav.isClear(grid, p), `${id}: "${s.title}" passes (${p.map((v) => v.toFixed(2)).join(', ')}) too close to a wall or furniture`);
        assert.ok(nav.wallClearanceAt(grid, p) >= 0.2, `${id}: "${s.title}" clips a wall at (${p.map((v) => v.toFixed(2)).join(', ')})`);
      }
// The room's community cast keep 0.58 m from everyone (validate-community):
// from the people this script moves, and community-24 (moved here) from
// everyone on the floor.
const community = plain.actors.filter((a) => a.id.startsWith('community-') && a.segments.some((s) => s.zoneId === ZONE));
const groundActors = plain.actors.filter((a) => a.levelId === 'ground');
let nearest = { gap: Infinity };
for (const c of community)
  for (let t = 0; t < loop.duration; t += 1) {
    const p = activity.sampleActor(c, t);
    for (const other of c.id === 'community-24' ? groundActors : touched.map((id) => byId.get(id))) {
      if (other.id === c.id) continue;
      const q = activity.sampleActor(other, t);
      if (q.visible === false) continue;
      const gap = Math.hypot(p.x - q.x, p.z - q.z);
      if (gap < nearest.gap) nearest = { gap, a: c.id, b: other.id, t };
    }
  }
assert.ok(nearest.gap > 0.62, `${nearest.a} and ${nearest.b} come within ${nearest.gap.toFixed(2)} m at ${nearest.t} s`);
// Round 4: nobody is ever in the fire pump room (no path point, no stay, no
// step of a walk).
for (const a of groundActors)
  for (const s of a.segments)
    for (const p of s.path.length > 1 ? samples(s.path) : s.path)
      assert.ok(!inPumpRoom(p), `${a.id}: "${s.title}" enters the fire pump room at (${p.map((v) => v.toFixed(2)).join(', ')})`);

// =============================================================================
// Profiles and the story's PT base
// =============================================================================
templates.people = templates.people.filter((p) => !ACTOR_IDS.includes(p.id));
templates.people.push(...PROFILES);

/** The story's `idt-pt` base, moved out of the massage bed into the room's east half. */
const IDT_PT_HOME = [-27.1, 19.3];
let story = readFileSync(STORY, 'utf8');
const homePattern = /("id": "idt-pt",\n\s*"team": "pt",[\s\S]*?"home": \[\n)(\s*)(-?[\d.]+),\n(\s*)(-?[\d.]+)\n/;
assert.ok(homePattern.test(story), 'the story names idt-pt with a home point');
story = story.replace(homePattern, (_, head, i1, _x, i2, _z) => `${head}${i1}${IDT_PT_HOME[0]},\n${i2}${IDT_PT_HOME[1]}\n`);
assert.equal(nav.roomAt(m, 'ground', IDT_PT_HOME), 'rehab-support-mid');
clearSpot(IDT_PT_HOME, 'the story’s PT base');

// =============================================================================
// Write
// =============================================================================
writeFileSync(MODEL, JSON.stringify(m, null, 2) + '\n');
writeAscii(LOOP, loop);
writeAscii(TEMPLATES, templates);
writeFileSync(STORY, story);
console.log(
  `Rehab wing: kitchen run at x ${casework.x} (fronts at ${KITCHEN_FRONT}, sink z ${SINK_Z}); fire pump room empty; desks x ${r3(DESK_X0)}..${r3(DESKS_X1)}; steppers x ${r3(STEPPER_X0)}..${r3(STEPPER_X0 + 4 * STEPPER[0] + 3 * STEPPER_GAP)}; corner stair at (${STAIRS.at.join(', ')}) climbed in ${CLIMB_TIME} s; plinth 1 at (${PLINTH_1.at.join(', ')}); ${PEOPLE.length} people added (${loop.actors.length} in the loop), community-25 on stepper 1; nearest community gap ${nearest.gap.toFixed(2)} m (${nearest.a}/${nearest.b} at ${nearest.t} s).`,
);
