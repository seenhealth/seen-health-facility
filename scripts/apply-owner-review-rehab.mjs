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
// 2. "People take the stairs up and down": the training stairs leave the
//    glazed SW corner (where they shared the floor with the participant
//    chairs, chair 3 overlapping the first tread) for open floor in front of
//    the Valley Blvd glazing, risers at the west end. A new participant
//    (`rehab-stairs-participant`) climbs them three times per session: a
//    walk with a height at every path point up the four treads, across the
//    landing and down the ramp at 0.35 m/s, back round the north side and a
//    rest at the foot, with a new PT (`rehab-pt-02`) coaching from the foot.
// 3. "An entire model kitchen where the counter is": the plan's demonstration
//    counter goes and an ADL practice kitchen stands against that wall with
//    its fronts to the east: a 1.9 m casework run (sink, counter, upper
//    cabinets), a refrigerator at its south end and a counter-top microwave,
//    with ≥ 0.9 m clear in front for wheelchairs. Mat plinth 1, which
//    overlapped the counter, moves into the wall-backed alcove north of the
//    kitchen, clear of the north-room doorway and of the wheelchair lane out
//    of the NW bathroom. Two participants rehearse at the sink and the
//    microwave with a new OT (`rehab-ot-02`).
// 4. The side rooms: the west room becomes the quiet room (three recliners),
//    the south-west ("bottom") room the acupressure massage room (a massage
//    bed; `rehab-massage-therapist` gives two appointments per loop, the
//    participant seated on the bed's edge), and the NW room on the S Ethel
//    Ave corner the PT & OT workspace (four standing desks with monitors
//    along its walls) where the new PT and OT chart between sessions. The
//    four participant chairs at the glazed SW corner go: the owner said the
//    workspace replaces them. The story's `idt-pt` base moves out of the
//    massage bed's footprint.
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
  'rehab-standing-desk': {
    kind: 'rehab-standing-desk',
    dimensions: [1.2, 1.45, 0.65],
    material: 'photo-white',
    materials: { metal: 'photo-silver', screen: 'screen', frame: 'photo-black' },
  },
};
const dims = (assetId) => ASSETS[assetId].dimensions;

// --- Geometry: wall faces the furniture stands against ---------------------------
// Plan walls are centred on their line; faces are half a thickness away.
const plan172 = wall('plan-wall-172'), // the counter wall, x = −26.508, z 13.33–16.18
  plan189 = wall('plan-wall-189'), // z = 13.33: north wall of the quiet room
  plan184 = wall('plan-wall-184'), // z = 8.80: north (street) wall of the NW room
  plan166 = wall('plan-wall-166'); // x = −31.09: the S Ethel Ave wall
const KITCHEN_WALL = plan172.a[0] + plan172.thickness / 2, // −26.406
  KITCHEN_Z0 = plan189.a[1] + plan189.thickness / 2, // 13.432
  QUIET_NORTH = KITCHEN_Z0,
  NW_NORTH = plan184.a[1] + plan184.thickness / 2, // 8.904
  NW_WEST = plan166.a[0] + plan166.thickness / 2, // −30.909
  NW_SOUTH = plan189.a[1] - plan189.thickness / 2; // 13.228
assert.ok(Math.abs(KITCHEN_WALL + 26.406) < 0.01 && Math.abs(NW_WEST + 30.909) < 0.01);

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

// Four standing desks in the L-shaped NW workspace: two under the Ethel Ave
// windows (users face west) and two against the south wall (users face south).
const DESK_D = dims('rehab-standing-desk')[2],
  DESK_WEST_X = r3(NW_WEST + DESK_D / 2 + 0.02),
  DESK_SOUTH_Z = r3(NW_SOUTH - DESK_D / 2 - 0.02),
  desks = [
    { id: 'rehab-workspace-desk-1', at: [DESK_WEST_X, 9.655], rotation: HALF },
    { id: 'rehab-workspace-desk-2', at: [DESK_WEST_X, 11.0], rotation: HALF },
    { id: 'rehab-workspace-desk-3', at: [-30.25, DESK_SOUTH_Z], rotation: PI },
    { id: 'rehab-workspace-desk-4', at: [-28.9, DESK_SOUTH_Z], rotation: PI },
  ],
  /** Where a therapist stands at each desk (0.34 m off its user edge). */
  DESK_USER = desks.map((d) => {
    const off = DESK_D / 2 + 0.34;
    return d.rotation === HALF
      ? [r3(d.at[0] + off), d.at[1]]
      : [d.at[0], r3(d.at[1] - off)];
  });

// The training stairs, moved to open floor in front of the Valley glazing
// (rotation π/2: the risers climb eastward from the west end).
const STAIRS = { at: [-27.9, 26.0], rotation: HALF };

// Mat plinth 1 moves into the alcove north of the kitchen (walls on its west
// and north, open to the floor on the east), out of the kitchen's clearance,
// the north-room doorway and the wheelchair lane from the NW bathroom.
const PLINTH_1 = { at: [-27.3, 12.15], rotation: 0, roomId: null };

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
      'rehab-support-nw',
      'Standing desk with monitor in the PT & OT workspace; the therapists stand at it between sessions.',
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
  'rehab-support-nw': 'PT & OT workspace',
};
const ITEM_IDS = [
  'rehab-bikes',
  'rehab-practice-stairs',
  'rehab-corner-exerciser',
  'rehab-practice-kitchen',
  'rehab-quiet-room',
  'rehab-massage-room',
  'rehab-workspace',
];

// --- Remove what this script owns, then re-add -----------------------------------
for (const id of Object.keys(ASSETS)) delete m.assets[id];
m.objects = m.objects.filter(
  (o) => !OBJECT_IDS.includes(o.id) && !REMOVED_PLAN.includes(o.id),
);
Object.assign(m.assets, ASSETS);
m.objects.push(...OBJECTS);
const plinth1 = object('rehab-mat-plinth-1'),
  stairs = object('rehab-training-stairs');
plinth1.position = [PLINTH_1.at[0], 0, PLINTH_1.at[1]];
plinth1.rotation = r3(PLINTH_1.rotation);
plinth1.roomId = PLINTH_1.roomId; // the alcove lies outside every room polygon
stairs.position = [STAIRS.at[0], 0, STAIRS.at[1]];
stairs.rotation = r3(STAIRS.rotation);
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
review.items.push(
  {
    id: 'rehab-bikes',
    rooms: ['rehab-open'],
    change:
      'People ride the recumbent steppers ("the bikes"): community-25 rides stepper 1 all day with seated breathers; a new participant (rehab-rider-02) rides stepper 2 in two sessions between the quiet room and an acupressure appointment.',
    unresolved:
      'Riders face the Valley Blvd windows as the machines are placed; how long a participant stays on a stepper (here 150–200 s of the 720 s loop per session) is illustrative.',
  },
  {
    id: 'rehab-practice-stairs',
    rooms: ['rehab-open'],
    change:
      'The training stairs move from the glazed SW corner, where they shared the floor with the participant chairs, to open floor in front of the Valley Blvd glazing (risers at the west end, ≥ 0.6 m clear all round); a participant climbs them three times per session with a PT at the foot, twice a day.',
    unresolved:
      'The owner said "put that somewhere": the spot by the Valley glazing keeps the centre of the floor free; the stairs could equally stand along the mezzanine-stair wall. Tread heights (4 × 0.15 m), landing and ramp follow the modelled unit, not a measured one.',
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
      'The plan’s demonstration counter is replaced by an ADL practice kitchen against the same wall: 1.9 m of base cabinets with counter, sink and upper cabinets, a refrigerator at the south end and a counter-top microwave, fronts to the east with ≥ 0.9 m clear in front; participants rehearse at the sink and microwave with an OT twice a day. Mat plinth 1 (it overlapped the counter) moves into the wall-backed alcove north of the kitchen, out of the north-room doorway and the wheelchair lane from the NW bathroom.',
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
    rooms: ['rehab-support-nw', 'rehab-open'],
    change:
      'The NW corner room on S Ethel Ave is the PT & OT workspace: four standing desks with monitors (two under the street windows, two on the south wall); a new PT and OT chart there between sessions, in and out through the north support room. The four participant chairs at the glazed SW corner are removed, as the owner said the workspace replaces them.',
    unresolved:
      '"At the corner right by the street" is read as the NW corner room (the only side room on the Ethel Ave street wall, where the window is). The alternative reading, the open SW glazed corner where the participant chairs stood (Ethel Ave / Valley Blvd), would put the desks on the open therapy floor instead; the chairs are removed under either reading.',
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
const overlaps = (a, b, gap = 0) =>
  a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.z0 < b.z1 + gap && b.z0 < a.z1 + gap;
const rehabFurniture = m.objects.filter(
  (o) =>
    o.zoneId === 'rehab' &&
    (o.layer ?? 'furniture') === 'furniture' &&
    o.position[1] < 1.4 &&
    m.assets[o.assetId].dimensions[1] >= 0.15,
);
const mine = new Set([...OBJECT_IDS, plinth1.id, stairs.id]);
for (const o of rehabFurniture) {
  if (!mine.has(o.id)) continue;
  const f = footprint(o);
  for (const other of rehabFurniture) {
    if (other.id === o.id || (other.id === 'rehab-kitchen-microwave' && o.id === 'rehab-kitchen-casework') || (o.id === 'rehab-kitchen-microwave' && other.id === 'rehab-kitchen-casework')) continue;
    assert.ok(!overlaps(f, footprint(other)), `${o.id} overlaps ${other.id}`);
  }
  assert.equal(
    nav.roomAt(m, 'ground', [o.position[0], o.position[2]]) ?? null,
    o.roomId ?? null,
    `${o.id} stands in ${o.roomId ?? 'the alcove outside the rooms'}`,
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
// ≥ 0.6 m around the training stairs: furniture, walls and the zone edge.
{
  const f = footprint(stairs),
    zone = m.zones.find((z) => z.id === 'rehab');
  for (const o of rehabFurniture)
    if (o.id !== stairs.id) assert.ok(!overlaps(f, footprint(o), 0.6), `${o.id} is within 0.6 m of the training stairs`);
  const zmax = Math.max(...zone.polygon.map((p) => p[1]));
  assert.ok(zmax - f.z1 >= 0.6 && f.x0 - NW_WEST >= 0.6, 'the stairs keep 0.6 m from the glazing and the Ethel wall');
  for (const w of m.walls.filter((w) => w.levelId === 'ground'))
    for (const corner of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]])
      assert.ok(nav.distanceToSegment(corner, w.a, w.b) - w.thickness / 2 >= 0.6 || w.height < 0.6, `the stairs keep 0.6 m from ${w.id}`);
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
/**
 * The room's community cast stand (or, community-25, ride) in one place all
 * day; every route keeps 0.8 m from them, as validate-community wants 0.58 m
 * between them and everyone at every moment.
 */
const STILL = JSON.parse(readFileSync(LOOP[0], 'utf8'))
  .actors.filter(
    (a) => a.id.startsWith('community-') && a.id !== 'community-25' && a.segments.some((s) => s.zoneId === ZONE),
  )
  .map((a) => a.segments[0].path[0])
  .concat([STEPPER_1]);
const avoid = (q) => STILL.some((p) => nav.distance(p, q) < 0.8);
/**
 * Seats joined to the grid from a chosen side: stepper 2 is mounted from the
 * east (its nearest free cell is between the two machines, which the route
 * would only reach by looping round community-24).
 */
const PREFERRED = [[STEPPER_2, [-21.2, 25.8]]];
const RECLINER_SEAT_AT = RECLINER_X.map((x) => [x, r3(RECLINER_Z - RECLINER_SEAT)]);
const SINK = [r3(KITCHEN_FRONT + 0.36), SINK_Z],
  MICRO = [r3(KITCHEN_FRONT + 0.36), microwave.z],
  OT_SPOT = [-25.05, r3((SINK_Z + microwave.z) / 2)];
const BED_EDGE = [r3(BED[0] + dims('rehab-massage-bed')[0] / 2 + 0.05), r3(BED[1] + 0.5)],
  THERAPIST_AT_BED = [-28.3, r3(BED[1] + dims('rehab-massage-bed')[2] / 2 + 0.3)],
  THERAPIST_DESK = [-27.1, 20.3];
const STAIR_D = m.assets[stairs.assetId].dimensions[2],
  STAIR_X0 = r3(STAIRS.at[0] - STAIR_D / 2),
  STAIR_FOOT = [r3(STAIR_X0 - 0.4), STAIRS.at[1]],
  STAIR_OFF = [r3(STAIR_X0 + STAIR_D + 0.4), STAIRS.at[1]],
  PT_AT_STAIRS = [-30.55, 24.75],
  /** Back round the north side of the stairs to the foot. */
  STAIR_LANE = [STAIR_OFF, [STAIR_OFF[0], r3(STAIRS.at[1] - 1.0)], [r3(STAIR_X0 - 0.3), r3(STAIRS.at[1] - 1.0)], STAIR_FOOT];
// Up the four treads (0.28 m each, rising 0.15 m), across the 0.75 m landing
// and down the ramp, with the height at every point (clinical-assets.ts).
const STEP_D = 0.28,
  DECK = 0.6,
  LANDING = 0.75;
const CLIMB = [
  [STAIR_FOOT, 0],
  [[STAIR_X0, STAIRS.at[1]], 0],
  ...[0, 1, 2, 3].map((i) => [[r3(STAIR_X0 + (i + 0.5) * STEP_D), STAIRS.at[1]], r3(((i + 1) * DECK) / 4)]),
  [[r3(STAIR_X0 + 4 * STEP_D), STAIRS.at[1]], DECK],
  [[r3(STAIR_X0 + 4 * STEP_D + LANDING), STAIRS.at[1]], DECK],
  [[r3(STAIR_X0 + STAIR_D), STAIRS.at[1]], 0],
  [STAIR_OFF, 0],
];
const CLIMB_PATH = CLIMB.map(([p]) => p),
  CLIMB_HEIGHTS = CLIMB.map(([, y]) => y),
  CLIMB_TIME = r4(nav.pathLength(CLIMB_PATH) / PACE.stairs),
  LANE_TIME = r4(nav.pathLength(STAIR_LANE) / PACE.participant);

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
  [PT_AT_STAIRS, 'the PT’s spot at the stairs'],
  [STAIR_FOOT, 'the foot of the stairs'],
  [STAIR_OFF, 'the end of the ramp'],
  ...DESK_USER.map((p, i) => [p, `desk ${i + 1}’s user spot`]),
])
  clearSpot(p, what);
for (const p of samples(STAIR_LANE)) clearSpot(p, 'the lane round the stairs');
assert.equal(nav.roomAt(m, 'ground', STAIR_FOOT), 'rehab-open');
assert.equal(nav.roomAt(m, 'ground', BED_EDGE), 'rehab-support-mid');
for (const p of RECLINER_SEAT_AT) assert.equal(nav.roomAt(m, 'ground', p), 'rehab-support-west');
for (const p of DESK_USER) assert.equal(nav.roomAt(m, 'ground', p), 'rehab-support-nw');

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
  /** Three climbs of the stairs with a rest at the foot after each, `start`–`end`. */
  stairs(start, end, cycles = 3) {
    assert.equal(this.clock, start);
    assert.ok(nav.distance(this.here, STAIR_FOOT) < 1e-6, `${this.id} is at the foot of the stairs`);
    for (let i = 1; i <= cycles; i++) {
      this.leg(CLIMB_PATH, CLIMB_TIME, 'Practice stairs · up the steps, over the landing, down the ramp', CLIMB_HEIGHTS);
      this.leg(STAIR_LANE, LANE_TIME, 'Back round to the foot of the stairs');
      this.stay(start + ((end - start) * i) / cycles, 'idle', 'Catching breath at the foot of the stairs', HALF);
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
    .walk(STAIR_FOOT, T.stairs1[0], P, 'Walk to the practice stairs')
    .stairs(...T.stairs1)
    .go(RECLINER_SEAT_AT[2], P, 'Back to the quiet room')
    .stay(T.stairs2[0], 'seated', 'Resting in the quiet room', 0, seated)
    .walk(STAIR_FOOT, T.stairs2[0], P, 'Walk to the practice stairs')
    .stairs(...T.stairs2)
    .go(RECLINER_SEAT_AT[2], P, 'Back to the quiet room')
    .stay(loop.duration, 'seated', 'Resting in the quiet room', 0, seated);
  tracks[t.id] = t.done(loop.duration);
}
// PT 2: standing desk 4 ↔ the foot of the stairs, coaching each climb and
// talking through each rest.
{
  const t = new Track('rehab-pt-02', DESK_USER[3]),
    toward = face(PT_AT_STAIRS, [r3(STAIR_X0 + 0.2), STAIRS.at[1]]);
  const session = ([start, end], cycles = 3) => {
    for (let i = 1; i <= cycles; i++) {
      const restStart = start + ((end - start) * (i - 1)) / cycles + CLIMB_TIME + LANE_TIME;
      t.stay(restStart, 'treat', 'Coaching the stair climb', toward).stay(start + ((end - start) * i) / cycles, 'consult', 'Feedback between climbs', toward);
    }
  };
  t.stay(T.stairs1[0], 'document', 'Charting at the standing desk', 0)
    .walk(PT_AT_STAIRS, T.stairs1[0], S, 'Walk to the practice stairs');
  session(T.stairs1);
  t.go(DESK_USER[3], S, 'Back to the workspace')
    .stay(T.stairs2[0], 'document', 'Charting at the standing desk', 0)
    .walk(PT_AT_STAIRS, T.stairs2[0], S, 'Walk to the practice stairs');
  session(T.stairs2);
  t.go(DESK_USER[3], S, 'Back to the workspace').stay(loop.duration, 'document', 'Charting at the standing desk', 0);
  tracks[t.id] = t.done(loop.duration);
}
// OT 2: standing desk 1 ↔ the practice kitchen, two sessions back to back.
{
  const t = new Track('rehab-ot-02', DESK_USER[0]),
    atSink = face(OT_SPOT, SINK),
    atMicro = face(OT_SPOT, MICRO);
  t.stay(T.kitchen1[0], 'document', 'Charting at the standing desk', -HALF)
    .walk(OT_SPOT, T.kitchen1[0], S, 'Walk to the practice kitchen')
    .stay(130, 'consult', 'ADL coaching · washing up', atSink)
    .stay(T.kitchen1[1], 'consult', 'ADL coaching · the microwave', atMicro)
    .stay(T.kitchen2[0], 'document', 'Notes between kitchen sessions', atSink)
    .stay(265, 'consult', 'ADL coaching · washing up', atSink)
    .stay(T.kitchen2[1], 'consult', 'ADL coaching · the microwave', atMicro)
    .go(DESK_USER[0], S, 'Back to the workspace')
    .stay(loop.duration, 'document', 'Charting at the standing desk', -HALF);
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
  { id: 'rehab-owner-steppers', label: 'Recumbent steppers · endurance', actorIds: ['community-25', 'rehab-rider-02'], window: T.ride1, description: 'Two participants pedal the recumbent steppers facing the Valley Blvd windows; one rides all morning, the other between the quiet room and an acupressure appointment.' },
  { id: 'rehab-owner-kitchen-1', label: 'Practice kitchen · OT session', actorIds: ['rehab-ot-02', 'rehab-stairs-participant'], window: T.kitchen1, description: 'Activities of daily living in the practice kitchen: washing up at the sink and heating a meal in the microwave, coached by the occupational therapist.' },
  { id: 'rehab-owner-kitchen-2', label: 'Practice kitchen · OT session', actorIds: ['rehab-ot-02', 'rehab-adl-participant'], window: T.kitchen2, description: 'Activities of daily living in the practice kitchen: washing up at the sink and heating a meal in the microwave, coached by the occupational therapist.' },
  { id: 'rehab-owner-stairs-1', label: 'Practice stairs · step training', actorIds: ['rehab-pt-02', 'rehab-stairs-participant'], window: T.stairs1, description: 'Three climbs of the training stairs (up the steps, across the landing, down the ramp) with a rest after each, the physical therapist coaching from the foot.' },
  { id: 'rehab-owner-stairs-2', label: 'Practice stairs · step training', actorIds: ['rehab-pt-02', 'rehab-stairs-participant'], window: T.stairs2, description: 'Three climbs of the training stairs (up the steps, across the landing, down the ramp) with a rest after each, the physical therapist coaching from the foot.' },
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
// The room's community cast keep 0.58 m from everyone (validate-community).
const community = plain.actors.filter((a) => a.id.startsWith('community-') && a.segments.some((s) => s.zoneId === ZONE));
let nearest = { gap: Infinity };
for (const c of community)
  for (let t = 0; t < loop.duration; t += 1) {
    const p = activity.sampleActor(c, t);
    for (const id of touched) {
      if (id === c.id) continue;
      const q = activity.sampleActor(byId.get(id), t),
        gap = Math.hypot(p.x - q.x, p.z - q.z);
      if (gap < nearest.gap) nearest = { gap, a: c.id, b: id, t };
    }
  }
assert.ok(nearest.gap > 0.62, `${nearest.a} and ${nearest.b} come within ${nearest.gap.toFixed(2)} m at ${nearest.t} s`);

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
  `Rehab wing: kitchen run at x ${casework.x} (fronts at ${KITCHEN_FRONT}, sink z ${SINK_Z}), training stairs at (${STAIRS.at.join(', ')}) climbed in ${CLIMB_TIME} s + ${LANE_TIME} s back, ${PEOPLE.length} people added (${loop.actors.length} in the loop), community-25 on stepper 1; nearest community gap ${nearest.gap.toFixed(2)} m (${nearest.a}/${nearest.b} at ${nearest.t} s).`,
);
