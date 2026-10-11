// Owner walkthrough, October 2026 · care rooms: the therapy bathrooms (7) and
// the back of house (8), as corrected by the owner on the live build.
//
//   node scripts/apply-owner-review-care-rooms.mjs
//
// (7) Bathrooms by the PT area. The two west therapy bathrooms and the
// multistall restroom are closed to the therapy entry corridor (the veranda
// corridor) with new plan walls along their north side; the oak divider that
// cut a corridor-facing toilet off the multistall room goes, and that toilet
// becomes the room's fourth stall with its own door and partition stub. The
// wheelchair arrival that rolled through the northwest bathroom as a corridor
// is re-routed on the navigation grid.
//
// (8) Back of house. The owner's first description put the washers in
// receiving and the wheelchair wash in the east nook; on the live build the
// owner corrected it: the north-west part of receiving, behind the loading
// roll-up, is an electrical room, so the delivery people come in through the
// small service door beside the roll-up and all the way through receiving;
// there is one washer and one dryer, in the room right by the linen racks (the
// plan's laundry room), not in the back; the wheelchair wash stands opposite
// the entrance to the linen room and the laundry; and the east nook is just
// storage. So: new plan walls enclose the electrical room (a switchboard and a
// sub-panel inside, a door from receiving), the service door is widened to a
// standard 0.9 m leaf and both deliveries' routes go through it and down the
// strip east of the electrical room; the wash pad, hose reel and parked
// chair are in the bay of the west corridor across from the linen room's door
// (the bay backs onto the plan's laundry room); three storage racks fill the
// east nook. A later comment on the live build ("this should be moved to the
// linen room") put the washer and dryer in the clean linen room itself:
// against the south wall of its west bay, by its door from the west corridor,
// with the laundry aide in front of them; the plan's laundry room keeps the
// mop sink and housekeeping cart as housekeeping. Unchanged from the first pass: the linen room keeps
// three racks, the rear employee door opens into the trash enclosure (bins
// instead of the plan's counter), and the two personal-care rooms are
// re-planned (east room hair-wash basin and chair in the northwest corner,
// shower northeast, toilet and basin down the east wall; west room mirrored).
//
// Idempotent: everything this script owns (ids below) is removed and rebuilt,
// the owner registry (`ownerReview`) is updated as a set union, and the loop
// actors it touches are rebuilt from the constants here. Afterwards run
// `node scripts/apply-drop-off-route.mjs` (loop formatting), then
// `node scripts/apply-kitchen-delivery.mjs` (the food trolley's route through
// the service door and the people it must keep clear of) and
// `npm run build:scenario`.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSim } from './build-scenario.mjs';

const MODEL = 'public/models/seen-alhambra-planning.json',
  LOOP = 'app/data/activity-loop.json',
  PUBLISHED = 'public/models/activity-loop.json';
const { nav, deliveries, activity } = await loadSim(
  {
    nav: 'app/sim/nav.ts',
    deliveries: 'app/model/deliveries.ts',
    activity: 'app/model/activity.ts',
  },
  { dir: 'work/owner-review-care-rooms' },
);

const PI = Math.PI,
  HALF = PI / 2;
/** Everything this script owns, by prefix and by name. */
const OWN = 'owner-care-',
  OWN_WALL = 'owner-care-wall-',
  OWN_ITEM = 'care-rooms-',
  OWN_ROOMS = ['rear-electrical', 'rear-wash-bay'],
  OWN_OBJECTS = new Set([
    'access-dryer',
    'rehab-wc-east-stall-door-3',
    'rehab-wc-east-stall-handle-3',
  ]),
  OWN_ASSETS = new Set([
    'photo-rehab-wc-east-stall-door-3',
    'photo-rehab-wc-east-stall-handle-3',
  ]),
  /** Layout-correction furnishings (not baseline) this script drops: the fourth linen rack and the second washer. */
  DROPPED_OBJECTS = ['access-linen-rack-4', 'access-washing-machine-2'];
/** Baseline walls this script removes, moves and baseline objects it moves or removes. */
const REMOVED_WALLS = [
    'plan-wall-199',
    'plan-wall-081',
    'plan-wall-102',
    // the south restroom's traced south-wall fragments (one continuous wall replaces them)
    'plan-wall-209',
    'plan-wall-210',
    'plan-wall-211',
    'plan-wall-212',
    'plan-wall-213',
  ],
  CHANGED_WALLS = ['plan-wall-177', 'plan-wall-179', 'plan-wall-068', 'plan-wall-083', 'plan-wall-208'],
  CHANGED_OBJECTS = ['ot-toilet-0', 'ot-basin-0', 'ot-toilet-2', 'ot-basin-1'],
  // the south restroom's east-side toilet: the plan and the owner make it a urinal (owner-care-rehab-urinal)
  REMOVED_OBJECTS = ['reception-counter-2', 'rehab-toilet-8'];
const STATUS = 'owner-walkthrough 2026-10 / described, not surveyed';
const PAGES = [92];

const r3 = (v) => Math.round(v * 1000) / 1000;
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const union = (list, ids) => [...new Set([...(list ?? []), ...ids])];

// --- The model --------------------------------------------------------------
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
const review = m.ownerReview;

// Remove what this script owns, then rebuild it.
m.walls = m.walls.filter(
  (w) => !w.id.startsWith(OWN_WALL) && !REMOVED_WALLS.includes(w.id),
);
m.objects = m.objects.filter(
  (o) =>
    !o.id.startsWith(OWN) &&
    !OWN_OBJECTS.has(o.id) &&
    !REMOVED_OBJECTS.includes(o.id) &&
    !DROPPED_OBJECTS.includes(o.id),
);
m.rooms = m.rooms.filter((r) => !OWN_ROOMS.includes(r.id));
for (const id of Object.keys(m.assets))
  if (id.startsWith(OWN) || OWN_ASSETS.has(id)) delete m.assets[id];
review.items = review.items.filter((i) => !i.id.startsWith(OWN_ITEM));

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
const room = (id) => {
  const r = m.rooms.find((r) => r.id === id);
  assert.ok(r, `room ${id}`);
  return r;
};
/** A new plan wall with a sibling's thickness, height, material and zone. */
const addWall = (id, like, a, b) => {
  const w = wall(like);
  m.walls.push({
    id,
    zoneId: w.zoneId,
    levelId: w.levelId,
    a,
    b,
    height: w.height,
    thickness: w.thickness,
    material: w.material,
    status: STATUS,
    referencePages: [...w.referencePages],
  });
};
/** A new room record, filed after `after` in the room list. */
const addRoom = (id, after, name, polygon, kind, notes) => {
  const r = {
    id,
    name,
    zoneId: room(after).zoneId,
    levelId: 'ground',
    polygon,
    kind,
    referencePages: PAGES,
    status: STATUS,
    notes,
    floorMaterial: 'concrete',
  };
  m.rooms.splice(m.rooms.findIndex((x) => x.id === after) + 1, 0, r);
  return r;
};
/** Move a furnishing (a baseline one loses its plan-trace registration). */
const move = (id, position, rotation, roomId, notes) => {
  const o = object(id);
  o.position = position;
  o.rotation = rotation;
  if (roomId) o.roomId = roomId;
  delete o.sourcePixelPosition;
  delete o.sourcePixelFootprint;
  o.status = STATUS;
  o.notes = notes;
  return o;
};
const place = (id, assetId, roomId, position, rotation, notes, extra = {}) => {
  m.objects.push({
    id,
    assetId,
    zoneId: room(roomId).zoneId,
    levelId: 'ground',
    position,
    rotation,
    scale: [1, 1, 1],
    roomId,
    layer: 'furniture',
    referencePages: PAGES,
    status: STATUS,
    notes,
    ...extra,
  });
  return id;
};
const rename = (id, name, notes) => {
  const r = room(id);
  r.name = name;
  r.notes = notes;
};
/** Inner face of a plan wall: its line plus half its thickness. */
const face = (id) => wall(id).thickness / 2;
const inRoom = (p, id) => nav.insidePolygon(p, room(id).polygon);

// --- (7) Bathrooms by the PT area -------------------------------------------
const Z_NORTH = 11.142477, // the bathrooms' north edge (rooms rehab-wc-nw / rehab-wc-east)
  X_WEST = -22.590228, // rehab-wc-nw's west wall (plan-wall-175/176)
  X_MID = -19.842768, // plan-wall-177, between the west bathrooms and the multistall room
  X_EAST = -14.653121; // plan-wall-179, the multistall room's east wall
// The multistall restrooms against the plan (the owner on the live build:
// "move the wall south and make the back sides solid; there shouldn't be any
// gap between the back of the sinks and that wall in both of the multi-stall
// bathrooms; check the architectural plans"). Measured on Overall
// Planning.jpg: the north restroom's north wall runs z 11.38–11.60 (centre
// 11.49, 0.35 m south of the bathrooms' traced edge); both restrooms' east
// sides are solid from their back wall (face x −15.72, −15.81 in the south
// restroom's lower half) to the building wall: the plumbing chase. The sinks,
// mirrors and wall tile were traced against x −15.82, so the chase's face is
// put just behind them, at x −15.80.
const Z_REST_NORTH = 11.49,
  CHASE_FACE = -15.8;
addWall('owner-care-wall-rehab-wc-nw-north', 'plan-wall-177', [X_WEST, Z_NORTH], [X_MID, Z_NORTH]);
addWall('owner-care-wall-rehab-wc-east-north', 'plan-wall-177', [X_MID, Z_REST_NORTH], [X_EAST, Z_REST_NORTH]);
// The dividing walls reach the new north walls (they started 0.25 m short, at the corridor's edge).
wall('plan-wall-177').a = [X_MID, Z_NORTH];
wall('plan-wall-179').a = [X_EAST, Z_NORTH];
{
  const Z_SOUTH_EDGE = 17.960249, // plan-wall-198, the north restroom's south wall
    Z_SOUTH_NORTH = 19.435737, // plan-wall-205, the south restroom's north wall
    Z_SOUTH_SOUTH = 25.23593, // the south restroom's south wall line (plan-wall-209…213)
    EAST_FACE = r3(X_EAST - face('plan-wall-179')),
    CHASE_T = r3(EAST_FACE - CHASE_FACE),
    northFace = (id) => face(id);
  // The north restroom ends at its new north wall; the corridor takes the strip.
  room('rehab-wc-east').polygon = [
    [X_MID, Z_REST_NORTH],
    [X_EAST, Z_REST_NORTH],
    [X_EAST, Z_SOUTH_EDGE],
    [X_MID, Z_SOUTH_EDGE],
  ];
  room('rehab-entry').polygon = [
    [-22.895501, 8.903806],
    [X_EAST, 8.903806],
    [X_EAST, Z_REST_NORTH],
    [X_MID, Z_REST_NORTH],
    [X_MID, 11.091598],
    [-22.895501, 11.091598],
  ];
  // The north restroom's wall tile and floor border start at the moved wall.
  const tileStart = r3(Z_REST_NORTH + face('owner-care-wall-rehab-wc-east-north')),
    tileEnd = 17.858;
  for (const kind of ['tile-base', 'teal-band', 'floor-border'])
    for (const k of [0, 1]) {
      const o = object(`rehab-wc-east-${kind}-${k}`);
      m.assets[o.assetId].dimensions[2] = r3(tileEnd - tileStart);
      o.position[2] = r3((tileStart + tileEnd) / 2);
    }
  // The chase behind both restrooms: solid from the back wall to the building
  // wall. It is built from four abutting wall strips rather than one 1 m wall:
  // the nav grid and the validators measure a wall as its centre line less
  // half its thickness, which would bulge a 1 m wall 0.5 m past its ends into
  // the cross-hall; a 0.26 m strip's ends behave like any other wall's.
  const STRIPS = Math.ceil(CHASE_T / 0.26),
    STRIP_T = CHASE_T / STRIPS;
  for (let i = 0; i < STRIPS; i++) {
    const x = r3(CHASE_FACE + STRIP_T * (i + 0.5));
    addWall(`owner-care-wall-rehab-wc-east-chase-${i}`, 'plan-wall-179',
      [x, r3(Z_REST_NORTH + northFace('owner-care-wall-rehab-wc-east-north'))],
      [x, r3(Z_SOUTH_EDGE - face('plan-wall-198'))]);
    addWall(`owner-care-wall-rehab-wc-south-chase-${i}`, 'plan-wall-180',
      [x, r3(Z_SOUTH_NORTH + face('plan-wall-205'))],
      [x, r3(Z_SOUTH_SOUTH - face('plan-wall-205'))]);
    wall(`owner-care-wall-rehab-wc-east-chase-${i}`).thickness = r3(STRIP_T);
    wall(`owner-care-wall-rehab-wc-south-chase-${i}`).thickness = r3(STRIP_T);
  }
  // The south restroom's south wall, continuous from the gym's east wall to the
  // building wall (from the traced line's west end, as the fragments did: the
  // practice stair stands just west of it).
  addWall('owner-care-wall-rehab-wc-south-south', 'plan-wall-205',
    [X_MID, Z_SOUTH_SOUTH],
    [r3(X_EAST + face('plan-wall-180')), Z_SOUTH_SOUTH]);
  // The fixture beside the south restroom's sinks is a urinal (the owner on
  // the live build; the plan draws a urinal there), hung on the chase.
  const vanity = object('rehab-wc-south-double-vanity'),
    vanitySouth = vanity.position[2] + m.assets[vanity.assetId].dimensions[0] / 2,
    URINAL = { w: 0.4, h: 1.0, d: 0.36, hung: 0.3 };
  m.assets['owner-care-urinal'] = {
    kind: 'urinal',
    dimensions: [URINAL.w, URINAL.h, URINAL.d],
    material: 'photo-white',
    parameters: {},
  };
  place('owner-care-rehab-urinal', 'owner-care-urinal', 'rehab-wc-south',
    [r3(CHASE_FACE - URINAL.d / 2 - 0.005), URINAL.hung, r3(vanitySouth + 0.25 + URINAL.w / 2)], -HALF,
    'Owner (live build): “the toilet that’s right next to the sink should be a urinal.” Wall-hung urinal on the plumbing chase beside the sinks, where the plan draws one; product and mounting height typical.');
  // The south restroom's last partition (plan-wall-208, in front of the end
  // stall) is a board with a door, not a wall (the owner on the live build;
  // the plan draws a thin partition with a door at its east end, beside the
  // chase): a 5 cm oak board from the gym's wall to the door's jamb, and an
  // oak door like the stalls' in the gap.
  const BOARD_Z = 23.658685,
    DOOR_X1 = CHASE_FACE,
    DOOR_X0 = r3(DOOR_X1 - 0.86),
    stallDoor = object('rehab-wc-south-stall-door-3'),
    stallHandle = object('rehab-wc-south-stall-handle-3');
  Object.assign(wall('plan-wall-208'), {
    a: [X_MID, BOARD_Z],
    b: [DOOR_X0, BOARD_Z],
    thickness: 0.05,
  });
  m.assets['owner-care-rehab-wc-south-door'] = {
    ...structuredClone(m.assets[stallDoor.assetId]),
    dimensions: [0.048, 2.25, 0.8],
  };
  m.assets['owner-care-rehab-wc-south-door-handle'] = structuredClone(m.assets[stallHandle.assetId]);
  place('owner-care-rehab-wc-south-door', 'owner-care-rehab-wc-south-door', 'rehab-wc-south',
    [r3((DOOR_X0 + DOOR_X1) / 2), stallDoor.position[1], BOARD_Z], HALF,
    'Owner (live build): the last partition in the south restroom is a board with a door. Oak door like the stalls’, hinged on the west, closed.',
    { layer: 'architecture' });
  place('owner-care-rehab-wc-south-door-handle', 'owner-care-rehab-wc-south-door-handle', 'rehab-wc-south',
    [r3(DOOR_X1 - 0.12), stallHandle.position[1], r3(BOARD_Z - 0.051)], HALF,
    'Handle on the restroom side of the partition door.', { layer: 'architecture' });
  for (const id of ['rehab-wc-east-double-vanity', 'rehab-wc-south-double-vanity']) {
    const v = object(id),
      back = v.position[0] + m.assets[v.assetId].dimensions[2] / 2;
    assert.ok(back <= CHASE_FACE && CHASE_FACE - back < 0.08, `${id} backs onto the chase`);
  }
}
// The oak divider (plan-wall-199) is gone; a partition stub like the other stalls' separates the fourth stall.
const STALL_3_Z = 13.279391;
addWall('owner-care-wall-rehab-wc-east-stall-3', 'plan-wall-200', [X_MID, STALL_3_Z], [-19.486616, STALL_3_Z]);
{
  const toilet = object('rehab-toilet-2'),
    door2 = object('rehab-wc-east-stall-door-2'),
    handle2 = object('rehab-wc-east-stall-handle-2');
  assert.equal(toilet.position[0], object('rehab-toilet-3').position[0], 'the fourth toilet lines up with the others');
  assert.equal(toilet.rotation, object('rehab-toilet-3').rotation);
  const z = toilet.position[2];
  m.assets['photo-rehab-wc-east-stall-door-3'] = structuredClone(m.assets[door2.assetId]);
  m.assets['photo-rehab-wc-east-stall-handle-3'] = structuredClone(m.assets[handle2.assetId]);
  m.objects.push({
    ...structuredClone(door2),
    id: 'rehab-wc-east-stall-door-3',
    assetId: 'photo-rehab-wc-east-stall-door-3',
    position: [door2.position[0], door2.position[1], z],
    status: STATUS,
    notes: 'Owner review 2026-10: the corridor-facing toilet is now the restroom’s fourth enclosed stall; door like the other stalls’.',
  });
  m.objects.push({
    ...structuredClone(handle2),
    id: 'rehab-wc-east-stall-handle-3',
    assetId: 'photo-rehab-wc-east-stall-handle-3',
    position: [handle2.position[0], handle2.position[1], r3(z + handle2.position[2] - door2.position[2])],
    status: STATUS,
    notes: 'Owner review 2026-10: handle of the fourth stall’s door.',
  });
}
rename(
  'rehab-wc-nw',
  'Therapy bathroom northwest',
  'Owner review 2026-10: enclosed; entered only from the therapy area by its west door, with no opening to the entry corridor (the veranda corridor).',
);
rename(
  'rehab-wc-sw',
  'Therapy bathroom west',
  'Owner review 2026-10: enclosed; entered only from the therapy cross-hall by its south door. A roll-in shower stands to the right of the toilet (the owner, on the live build: “in the large bathroom in the rehab area, let’s add a shower to the right of the toilet”).',
);
// The large therapy bathroom's shower (the owner, on the live build): a
// roll-in shower in the room's north-east corner, to the right of the toilet
// as one sits on it (the toilet's back is on the east wall, it faces west);
// the only free run of wall (1.4 m between the north wall and the toilet).
// Back to the east wall, seat side to the north wall, open side west.
{
  const toilet = object('rehab-toilet-1'),
    EAST_FACE = r3(wall('plan-wall-177').a[0] - face('plan-wall-177')),
    NORTH_FACE = r3(wall('plan-wall-195').a[1] + face('plan-wall-195')),
    SHOWER = { w: 1.3, h: 2.18, d: 1.2 },
    toiletNorth = toilet.position[2] - m.assets[toilet.assetId].dimensions[0] / 2;
  m.assets['owner-care-rehab-shower'] = {
    kind: 'care-shower',
    dimensions: [SHOWER.w, SHOWER.h, SHOWER.d],
    material: 'photo-teal-tile',
    parameters: {},
  };
  const at = [r3(EAST_FACE - SHOWER.d / 2 - 0.005), 0, r3(NORTH_FACE + SHOWER.w / 2 + 0.005)];
  assert.ok(at[2] + SHOWER.w / 2 <= toiletNorth - 0.05, 'the shower clears the toilet');
  place('owner-care-rehab-shower', 'owner-care-rehab-shower', 'rehab-wc-sw', at, -HALF,
    'Owner (live build): “in the large bathroom in the rehab area, let’s add a shower to the right of the toilet.” Roll-in shower with a seat and grab bars in the north-east corner, beside the toilet; size from the personal-care showers, reduced to fit.');
}
room('rehab-wc-east').notes =
  'Owner review 2026-10: fully enclosed; all four stalls inside one restroom entered from the therapy cross-hall. ' +
  room('rehab-wc-east').notes.replace(/^Owner review 2026-10:.*?cross-hall\. /, '');

// --- (8) Back of house ------------------------------------------------------
// The loading block: receiving's west wall (plan-wall-067), its east wall
// (plan-wall-068) and the block's north face (the roll-up's wall line).
const X_W = wall('plan-wall-067').a[0],
  Z_N = wall('plan-wall-067').a[1],
  X_E = wall('plan-wall-068').a[0],
  Z_S = room('rear-wc-east').polygon[0][1], // receiving's south edge (−6.970)
  T = wall('plan-wall-067').thickness;

// The service door east of the roll-up (the envelope's shell-rear-north
// opening 3, with its transom, opening 2): widened from the photographed
// 0.75 m to a standard 0.9 m leaf so the food trolley passes it, keeping its
// west jamb (x 10.11) and staying inside the recessed frame the exterior
// draws (its east jamb is at x 11.01, alhambra-exterior.ts); the roll-up
// opening (opening 1) narrows 7 cm to meet the door. deliveries.ts carries
// the same door (`SERVICE_DOOR`) and swings its leaf, so the opening is
// `operable` (the envelope draws no fixed panel in it).
const DOOR_X0 = 10.11,
  DOOR_W = 0.9,
  DOOR_X1 = r3(DOOR_X0 + DOOR_W);
{
  const shell = m.envelope.walls.find((w) => w.id === 'shell-rear-north');
  assert.ok(shell, 'the loading block’s north face is in the envelope');
  const opening = (id) => {
    const o = shell.openings.find((o) => o.id === id);
    assert.ok(o, `envelope opening ${id}`);
    return o;
  };
  const rollup = opening('shell-rear-north-opening-1'),
    transom = opening('shell-rear-north-opening-2'),
    door = opening('shell-rear-north-opening-3');
  rollup.width = r6(DOOR_X0 - (shell.a[0] + rollup.offset));
  assert.ok(Math.abs(rollup.width - 2.51) < 1e-6, 'the roll-up keeps its west jamb and ends at the service door');
  door.offset = r6(DOOR_X0 - shell.a[0]);
  door.width = DOOR_W;
  door.operable = true;
  transom.offset = door.offset;
  transom.width = DOOR_W;
  const sd = deliveries.SERVICE_DOOR;
  assert.ok(
    Math.abs(sd.at[0] - (DOOR_X0 + DOOR_W / 2)) < 1e-6 && Math.abs(sd.at[1] - Z_N) < 1e-6 && sd.width === DOOR_W,
    'deliveries.ts SERVICE_DOOR matches the envelope’s service door',
  );
  // The plan wall east of the openings starts at the door's east jamb.
  wall('plan-wall-083').a = [DOOR_X1, Z_N];
  assert.ok(wall('plan-wall-082').b[0] < shell.a[0] + rollup.offset, 'the plan wall west of the roll-up stays short of it');
}

// The electrical room: receiving's north-west part behind the roll-up,
// enclosed by a wall just west of the service door's jamb and a wall across
// at z −10.3, with a 0.9 m door from receiving at its south-east corner (the
// east wall stops short of the corner). The roll-up opens into it and stays
// down; its switchboard and sub-panel hang on the west wall.
const ELEC_X = 10.0,
  ELEC_Z = -10.3,
  ELEC_DOOR_Z = r3(ELEC_Z - 0.9);
assert.ok(ELEC_X + T / 2 <= DOOR_X0 + 1e-9, 'the electrical room’s east wall clears the service door’s jamb');
addWall('owner-care-wall-electrical-east', 'plan-wall-067', [ELEC_X, Z_N], [ELEC_X, ELEC_DOOR_Z]);
addWall('owner-care-wall-electrical-south', 'plan-wall-067', [X_W, ELEC_Z], [ELEC_X, ELEC_Z]);
addRoom(
  'rear-electrical',
  'rear-north',
  'Electrical room',
  [[X_W, Z_N], [ELEC_X, Z_N], [ELEC_X, ELEC_Z], [X_W, ELEC_Z]],
  'room',
  'Owner review 2026-10 (live build): “where the current washing machine and washer and dryer are, there’s another electrical room enclosing that”. Enclosed in receiving’s north-west part behind the loading roll-up; a door from receiving at its south-east corner for the electrician. Size and door position assumed.',
);
{
  const north = room('rear-north');
  north.polygon = [
    [ELEC_X, Z_N],
    [X_E, Z_N],
    [X_E, Z_S],
    [wall('plan-wall-080').a[0], Z_S],
    [wall('plan-wall-080').a[0], wall('plan-wall-090').a[1]],
    [X_W, wall('plan-wall-090').a[1]],
    [X_W, ELEC_Z],
    [ELEC_X, ELEC_Z],
  ];
  delete north.sourcePolygonPixels;
  north.status = STATUS;
  rename(
    'rear-north',
    'Receiving',
    'Owner review 2026-10 (live build): deliveries come in through the small service door beside the roll-up (the roll-up fronts the electrical room) and down the strip east of the electrical room to the south gap; the laundry moved to the room by the linen racks. The room now excludes the electrical room and the laundry.',
  );
}
m.assets['owner-care-switchboard'] = {
  kind: 'electrical-panel',
  dimensions: [1.2, 1.8, 0.3],
  material: 'photo-blue-grey',
  materials: { door: 'photo-white' },
  parameters: { sections: 3 },
};
m.assets['owner-care-sub-panel'] = {
  kind: 'electrical-panel',
  dimensions: [0.5, 1.0, 0.16],
  material: 'photo-blue-grey',
  materials: { door: 'photo-white' },
  parameters: { sections: 1 },
};
const WEST_FACE = r3(X_W + T / 2);
place('owner-care-switchboard', 'owner-care-switchboard', 'rear-electrical', [r3(WEST_FACE + 0.15 + 0.005), 0.3, -12.8], HALF,
  'Main switchboard on the electrical room’s west wall (three sections). Illustrative: the service size and position are not surveyed.', { layer: 'architecture' });
place('owner-care-sub-panel', 'owner-care-sub-panel', 'rear-electrical', [r3(WEST_FACE + 0.08 + 0.005), 1.0, -11.3], HALF,
  'Sub-panel beside the switchboard. Illustrative.', { layer: 'architecture' });

// The laundry: one washer and one dryer in the clean linen room (the owner's
// comment on the live build, "this should be moved to the linen room"),
// against the south wall of its west bay, fronts north, just inside its door
// from the west corridor; the laundry aide stands in front of them. The plan's
// laundry room next door keeps the mop sink and housekeeping cart.
const L_WEST = WEST_FACE,
  L_SOUTH = r3(wall('plan-wall-093').a[1] - face('plan-wall-093')),
  LINEN_SOUTH = r3(wall('plan-wall-092').a[1] - face('plan-wall-092')),
  MACHINE_Z = r3(LINEN_SOUTH - 0.36 - 0.03),
  WASHER_X = 1.3,
  DRYER_X = r3(WASHER_X + 0.68 + 0.06);
move('access-washing-machine-1', [WASHER_X, 0, MACHINE_Z], PI, 'rear-support-west',
  'Owner (live build): “the washer and dryer there should be only two”, and on the next build “this should be moved to the linen room”. The one washer, against the south wall of the linen room’s west bay, front to the north.');
m.assets['owner-care-tumble-dryer'] = {
  kind: 'tumble-dryer',
  dimensions: [0.68, 0.92, 0.72],
  material: 'photo-white',
  parameters: {},
};
place('access-dryer', 'owner-care-tumble-dryer', 'rear-support-west', [DRYER_X, 0, MACHINE_Z], PI,
  'Owner: one dryer beside the washer, in the linen room against the south wall of its west bay. Product and dimensions estimated.');
m.assets['owner-care-janitor-sink'] = { kind: 'janitor-sink', dimensions: [0.65, 1.3, 0.65], material: 'photo-white', parameters: {} };
m.assets['owner-care-housekeeping-cart'] = { kind: 'housekeeping-cart', dimensions: [0.55, 1.05, 1.1], material: 'photo-mustard', parameters: {} };
place('owner-care-janitor-sink', 'owner-care-janitor-sink', 'rear-support-center',
  [r3(L_WEST + 0.325 + 0.01), 0, r3(L_SOUTH - 0.325 - 0.02)], HALF,
  'Mop sink in the laundry room’s far (south-west) corner. Illustrative; not described by the owner.');
place('owner-care-housekeeping-cart', 'owner-care-housekeeping-cart', 'rear-support-center',
  [8.35, 0, r3(L_SOUTH - 0.275 - 0.02)], HALF,
  'Housekeeping cart parked along the laundry room’s south wall. Illustrative.');
rename(
  'rear-support-center',
  'Housekeeping',
  'Owner review 2026-10: the plan’s laundry room. The washer and dryer moved to the linen room (the owner’s comment on the live build, “this should be moved to the linen room”); the mop sink and housekeeping cart stay in its south end. Entered from the corridor east of it (the plan’s door).',
);

// The wheelchair wash: the bay of the west corridor across from the linen
// room's east door, backing onto the laundry room's wall (the plan's
// widening between the stair's chase and the personal-care room): a kerbed
// pad with a drain, a chair parked on it facing the corridor's south end and
// the hose reel on the bay's north wall. The pad is flat architecture (no
// obstacle); the chair and reel are furniture.
const WB_W = wall('plan-wall-077').a[0],
  WB_E = X_W,
  WB_N = wall('plan-wall-089').a[1],
  WB_S = wall('plan-wall-093').a[1];
const bay = [[WB_W, WB_N], [WB_E, WB_N], [WB_E, WB_S], [WB_W, WB_S]];
for (const o of m.objects)
  if ((o.layer ?? 'furniture') === 'furniture' && o.levelId === 'ground' && nav.insidePolygon([o.position[0], o.position[2]], bay))
    assert.fail(`${o.id} already stands in the wash bay`);
addRoom(
  'rear-wash-bay',
  'rear-support-west',
  'Wheelchair wash',
  bay,
  'room',
  'Owner review 2026-10 (live build): “the wheelchair wash should be opposite the entrance to the linen room and the washing machine room”: the corridor bay across from the linen room’s east door, against the laundry room’s wall. Open to the west corridor; a pad in the east corridor would have blocked the trolley lane.',
);
const WB_X = r3((WB_W + WB_E - T / 2) / 2),
  WB_Z = r3((WB_N + T / 2 + WB_S - T / 2) / 2);
m.assets['owner-care-wash-pad'] = { kind: 'wash-pad', dimensions: [0.9, 0.05, 1.4], material: 'photo-mosaic', materials: { kerb: 'concrete' }, parameters: {} };
m.assets['owner-care-hose-reel'] = { kind: 'hose-reel', dimensions: [0.4, 0.5, 0.3], material: 'photo-teal', parameters: {} };
m.assets['owner-care-wheelchair'] = { kind: 'wheelchair', dimensions: [0.66, 0.92, 1.05], material: 'photo-black', parameters: {} };
place('owner-care-wash-pad', 'owner-care-wash-pad', 'rear-wash-bay', [WB_X, 0, WB_Z], 0,
  'Owner: a wheelchair wash “like a spray gun”, opposite the linen room’s entrance. Drained, kerbed pad filling the bay; size estimated.', { layer: 'architecture' });
place('owner-care-wheelchair', 'owner-care-wheelchair', 'rear-wash-bay', [WB_X, 0, WB_Z], 0,
  'A center wheelchair parked on the wash pad, facing the corridor’s south end. Illustrative.');
place('owner-care-hose-reel', 'owner-care-hose-reel', 'rear-wash-bay', [WB_X, 1.0, r3(WB_N + T / 2 + 0.15 + 0.005)], 0,
  'Wall-mounted hose reel and spray gun on the bay’s north wall. Mounting height estimated.');

// Storage: the plan's east nook (the first pass's wheelchair wash) with three
// racks and its door from receiving kept.
{
  const w = wall('plan-wall-068'),
    x = w.a[0],
    doorZ = -10.5,
    half = 0.46;
  w.b = [x, r3(doorZ - half)];
  addWall('owner-care-wall-068-south', 'plan-wall-068', [x, r3(doorZ + half)], [x, -6.614256]);
}
const S_NORTH = r3(wall('plan-wall-086').a[1] + face('plan-wall-086')),
  S_SOUTH = r3(wall('plan-wall-091').a[1] - face('plan-wall-091'));
m.assets['owner-care-storage-rack'] = { kind: 'linen-rack', dimensions: [1.55, 1.9, 0.48], material: 'photo-white', parameters: {} };
place('owner-care-storage-rack-1', 'owner-care-storage-rack', 'rear-support-east', [12.7, 0, r3(S_NORTH + 0.24 + 0.02)], 0,
  'Owner (live build): “where the current wheelchair wash is, there is just additional storage”. Rack along the north wall.');
place('owner-care-storage-rack-2', 'owner-care-storage-rack', 'rear-support-east', [14.33, 0, r3(S_NORTH + 0.24 + 0.02)], 0,
  'Storage rack along the north wall. Count assumed.');
place('owner-care-storage-rack-3', 'owner-care-storage-rack', 'rear-support-east', [14.0, 0, r3(S_SOUTH - 0.24 - 0.02)], PI,
  'Storage rack along the south wall, clear of the east window. Count assumed.');
rename('rear-support-east', 'Storage', 'Owner review 2026-10 (live build): “just additional storage” in the nook off receiving; three racks, the door from receiving kept.');

// Clean linen room: three racks, none through a wall.
const LINEN_Z = r3(-10.328415 + face('plan-wall-087') + 0.24 + 0.02),
  LINEN_WEST_X = r3(face('wall-181') + 0.24);
move('access-linen-rack-1', [0.86, 0, LINEN_Z], 0, 'rear-support-west', 'Owner: “there are three racks instead”. Along the north wall of the west bay.');
move('access-linen-rack-2', [LINEN_WEST_X, 0, -8.3], HALF, 'rear-support-west', 'Owner: three racks. Along the west wall (two do not fit along the north wall).');
move('access-linen-rack-3', [3.99, 0, LINEN_Z], 0, 'rear-support-west', 'Owner: three racks. Along the north wall of the northeast bay, clear of its walls.');
rename('rear-support-west', 'Linen room & laundry', 'Owner review 2026-10: the linen room with three racks, and the washer and dryer against the south wall of its west bay by the door from the west corridor (the owner’s comment on the live build, “this should be moved to the linen room”); its existing doors (from the northeast bay and from the west corridor) are kept, the owner’s “another door leading to the linen room” read as the door between its two bays. The wheelchair wash is across the corridor from its east door.');

// Trash enclosure: wheeled bins instead of the plan's counter.
m.assets['owner-care-waste-bin'] = { kind: 'waste-bin', dimensions: [0.7, 1.2, 0.8], material: 'photo-black', materials: { lid: 'photo-blue-grey' }, parameters: { bin: 'trash' } };
m.assets['owner-care-recycling-bin'] = { kind: 'waste-bin', dimensions: [0.7, 1.2, 0.8], material: 'blue', materials: { lid: 'photo-black' }, parameters: { bin: 'recycling' } };
const BIN_Z = r3(-10.328415 - face('plan-wall-087') - 0.4 - 0.02);
place('owner-care-waste-bin-1', 'owner-care-waste-bin', 'rear-utility-nw', [0.75, 0, BIN_Z], PI, 'Owner: “the door in the back is actually to the trash enclosure”. Wheeled bin; count and size assumed.');
place('owner-care-waste-bin-2', 'owner-care-waste-bin', 'rear-utility-nw', [1.55, 0, BIN_Z], PI, 'Trash enclosure bin; count and size assumed.');
place('owner-care-recycling-bin', 'owner-care-recycling-bin', 'rear-utility-nw', [2.35, 0, BIN_Z], PI, 'Recycling bin in the trash enclosure; assumed.');
rename('rear-utility-nw', 'Trash enclosure', 'Owner review 2026-10: the rear employee door opens into the trash enclosure; bins along its south wall, the door lane kept clear. Nobody delivers through this door.');

// Personal care east: hair-wash basin and chair in the northwest corner (the
// chair faces the room, its back to the basin), shower in the northeast corner
// (its tiled sides north and east, the closet walls removed), toilet on the
// east wall just south of the shower, basin south of the toilet.
{
  const eastFace = 9.1582 - face('plan-wall-080'),
    northFace = -6.970408 + face('plan-wall-093');
  move('access-hair-wash', [6.25, 0, r3(northFace + 0.35 + 0.02)], 0, 'rear-wc-east',
    'Owner: “the hair washing sink should be against the top left corner of the wall”.');
  move('access-barber-chair', [6.25, 0, -5.54], 0, 'rear-wc-east',
    'Owner: the chair cannot stay where it was; it sits in front of the hair-wash basin, facing into the room.');
  move('access-shower-east', [r3(eastFace - 0.75 - 0.02), 0, r3(northFace + 0.75 + 0.02)], -HALF, 'rear-wc-east',
    'Owner: “the shower should be on the top right corner”. The plan’s corner closet (two walls) is removed for it.');
  const toilet = object('ot-toilet-2'),
    tDepth = (m.assets[toilet.assetId].dimensions[2] * toilet.scale[2]) / 2;
  move('ot-toilet-2', [r3(eastFace - tDepth - 0.01), 0, -4.85], -HALF, 'rear-wc-east',
    'Owner: “the toilet should be immediately below the shower in the top middle right wall”.');
  const basin = object('ot-basin-1'),
    bDepth = (m.assets[basin.assetId].dimensions[2] * basin.scale[2]) / 2;
  move('ot-basin-1', [r3(eastFace - bDepth - 0.01), 0, -4.05], -HALF, 'rear-wc-east',
    'Owner: “the sink should be immediately beneath that” (south of the toilet, on the east wall).');
  rename('rear-wc-east', 'Personal care east · hair care & shower',
    'Owner review 2026-10: hair-wash basin and chair in the northwest corner, shower northeast, toilet and basin down the east wall; west door kept.');
}
// Personal care west: the same, mirrored.
{
  const westFace = face('wall-181'),
    northFace = -6.970408 + face('plan-wall-092');
  move('access-shower-west', [r3(westFace + 0.75 + 0.01), 0, r3(northFace + 0.75 + 0.02)], 0, 'rear-wc-west',
    'Owner: “the same layout but flipped: top left-hand corner is the shower”.');
  const toilet = object('ot-toilet-0'),
    tDepth = (m.assets[toilet.assetId].dimensions[2] * toilet.scale[2]) / 2;
  move('ot-toilet-0', [r3(westFace + tDepth + 0.01), 0, -4.85], HALF, 'rear-wc-west',
    'Owner: “the toilet is immediately south of that” (the shower, on the west wall).');
  const basin = object('ot-basin-0'),
    bDepth = (m.assets[basin.assetId].dimensions[2] * basin.scale[2]) / 2;
  move('ot-basin-0', [r3(westFace + bDepth + 0.01), 0, -4.05], HALF, 'rear-wc-west',
    'Owner: “the sink is immediately south of that” (the toilet, on the west wall).');
  rename('rear-wc-west', 'Personal care west · shower',
    'Owner review 2026-10: shower in the northwest corner, toilet and basin down the west wall; east door kept.');
}

// Deliveries: both come through the service door (deliveries.ts), down the
// strip east of the electrical room.
{
  const stop = deliveries.deliveryStops.find((s) => s.id === 'delivery-package'),
    food = deliveries.deliveryStops.find((s) => s.id === 'delivery-food');
  assert.deepEqual([...stop.door], [...food.door], 'the package stop shares the service door (deliveries.ts)');
  m.designDecisions.rearServiceActivity =
    'Package and meal deliveries both come in through the small service door east of the loading roll-up and down the strip of receiving beside the electrical room, which the roll-up fronts; the rear employee door opens into the trash enclosure (owner walkthrough, October 2026, corrected on the live build). Routes, vehicle sizes and timing are illustrative.';
}

// Every new furnishing sits inside its room; every moved fixture too.
for (const o of m.objects)
  if (o.id.startsWith(OWN) || OWN_OBJECTS.has(o.id) || CHANGED_OBJECTS.includes(o.id) || /^access-(shower|hair|barber|washing|linen)/.test(o.id))
    assert.ok(inRoom([o.position[0], o.position[2]], o.roomId), `${o.id} inside ${o.roomId}`);
// The back rooms no longer overlap: one room at each test point.
for (const [p, id] of [
  [[8, -13], 'rear-electrical'],
  [[11, -13], 'rear-north'],
  [[8, -10], 'rear-north'],
  [[8, -8.5], 'rear-support-center'],
  [[1.3, -8.2], 'rear-support-west'],
  [[6.0, -7.9], 'rear-wash-bay'],
  [[13.5, -10.8], 'rear-support-east'],
])
  assert.deepEqual(m.rooms.filter((r) => r.levelId === 'ground' && nav.insidePolygon(p, r.polygon)).map((r) => r.id), [id], `one room at ${p}`);

// The registry.
review.changedWallIds = union(review.changedWallIds, CHANGED_WALLS);
// Own ids are re-listed from what exists now, so ids this script stopped making drop out.
review.newWallIds = union(
  review.newWallIds.filter((id) => !id.startsWith(OWN_WALL)),
  m.walls.filter((w) => w.id.startsWith(OWN_WALL)).map((w) => w.id),
);
review.removedWallIds = union(review.removedWallIds, REMOVED_WALLS);
review.changedPlanObjectIds = union(
  review.changedPlanObjectIds.filter((id) => !REMOVED_OBJECTS.includes(id)),
  CHANGED_OBJECTS,
);
review.removedPlanObjectIds = union(review.removedPlanObjectIds, REMOVED_OBJECTS);
review.newObjectIds = union(
  review.newObjectIds.filter((id) => !id.startsWith(OWN) && !OWN_OBJECTS.has(id)),
  m.objects.filter((o) => o.id.startsWith(OWN) || OWN_OBJECTS.has(o.id)).map((o) => o.id),
);
review.items.push(
  {
    id: 'care-rooms-7-pt-bathrooms',
    rooms: ['rehab-wc-nw', 'rehab-wc-sw', 'rehab-wc-east', 'rehab-entry'],
    change:
      'New plan walls close the north side of the northwest therapy bathroom and of the multistall restroom toward the entry corridor; the restroom’s oak divider is removed so its corridor-facing toilet is a fourth enclosed stall with its own door and partition stub. The west bathrooms keep only their therapy-side doors; the restroom is entered only from the cross-hall. The wheelchair arrival that rolled through the northwest bathroom now takes the day-room cross passage and the cross-hall.',
    unresolved:
      'Wall thickness and height copied from the adjoining plan walls; the fourth stall keeps the plan’s toilet position. Stall partitions remain the photo-informed stubs.',
  },
  {
    id: 'care-rooms-8-back-of-house',
    rooms: ['rear-north', 'rear-support-west', 'rear-utility-nw', 'rear-wc-east', 'rear-wc-west'],
    change:
      'The linen room keeps three racks; the rear employee door opens into the trash enclosure (bins replace the plan’s counter) and nobody delivers through it. Personal care east: hair-wash basin and chair northwest, shower northeast, toilet and basin down the east wall; personal care west mirrored.',
    unresolved:
      '“Another door leading to the linen room” is read as the existing door between the linen room’s two bays (the stair sits between the linen room and receiving). The bins are inside the rear utility room; if the enclosure is the court notch outside the employee door they belong there. Fixture sizes are assumed.',
  },
  {
    id: 'care-rooms-8b-back-of-house-live-build',
    rooms: ['rear-electrical', 'rear-north', 'rear-support-center', 'rear-wash-bay', 'rear-support-east'],
    change:
      'Owner’s corrections on the live build. An electrical room is enclosed in receiving’s north-west part behind the loading roll-up (new walls at x 10.0 and z −10.3, a switchboard and sub-panel, a 0.9 m door from receiving at its south-east corner); the roll-up stays down. Both deliveries come in through the small service door beside the roll-up, widened from 0.75 m to 0.9 m (x 10.11–11.01, the roll-up opening narrowed 7 cm to meet it), and down the strip east of the electrical room: the food trolley on to the kitchen, the package driver to a hand-over point just inside. One washer and one dryer (the second washer is gone; see care-rooms-8c for where they stand). The wheelchair wash (pad, hose reel, parked chair) is in the bay of the west corridor across from the linen room’s door, backing onto the plan’s laundry room. The plan’s east nook is storage with three racks.',
    unresolved:
      '“Opposite the entrance to the linen room and the washing machine room” is read as the corridor bay across from the linen room’s door; a pad in the east corridor would have blocked the food trolley’s lane. The service door’s true width is not measured: 0.9 m is the standard single leaf and the most the photographed frame allows; the exterior’s roll-up curtain is still drawn 2.58 m wide and laps the door’s west jamb by 7 cm when down. The electrical room’s size, door and panel positions are assumed.',
  },
);
review.items.push({
  id: 'care-rooms-7c-restrooms-plan',
  rooms: ['rehab-wc-east', 'rehab-wc-south', 'rehab-entry'],
  change:
    'Owner on the live build: “move the wall south and make the back sides solid; there shouldn’t be any gap between the back of the sinks and that wall in both of the multi-stall bathrooms; check the architectural plans.” Checked on Overall Planning.jpg: the north restroom’s north wall moves 0.35 m south to the plan’s line (z 11.49), the corridor taking the strip; both restrooms’ east sides are now solid (the plan’s plumbing chase, from the sinks’ wall at x −15.80 to the building wall), so the sinks and mirrors sit against it; the south restroom’s south wall is one continuous wall (the traced fragments left a 2.4 m opening to the gym); the fixture beside its sinks is a urinal on the chase (care-rooms-7d).',
  unresolved:
    'The plan’s back-wall face is x −15.72 (−15.81 in the south restroom’s lower half); the chase face is at −15.80 to keep the traced sinks, mirrors and tile against it. The south restroom’s south wall stays on the traced line (z 25.24), 0.18 m north of the plan’s (z 25.42), because the gym’s east wall and the practice stair are placed from it. The plan’s small closet at the chase’s north end (opening to the corridor) is drawn solid. The west therapy bathroom’s north wall is also 0.35 m north of the plan’s line but is unchanged. The plan’s structural column at the south restroom’s east wall is not modelled (no columns are).',
});
review.items.push({
  id: 'care-rooms-7d-south-restroom-board-urinal',
  rooms: ['rehab-wc-south'],
  change:
    'Owner on the live build: “in the south multi-stall restroom, the inner last contiguous wall should just be a board with a door instead of a wall; the toilet that’s right next to the sink should be a urinal.” The oak wall across the restroom in front of the end stall (plan-wall-208) is a 5 cm board ending 0.86 m short of the plumbing chase, with an oak door like the stalls’ in that gap (where the plan draws it); the fixture beside the sinks is a wall-hung urinal on the chase (the plan draws a urinal there).',
  unresolved:
    'The door’s width (0.86 m opening, 0.8 m leaf) and the board’s thickness are typical, not measured; the door is drawn closed, like the stall doors. The urinal stands 0.25 m south of the sinks (the plan’s is 0.3 m closer, with a shorter sink counter); its mounting height and the absence of a privacy screen are assumptions.',
});
review.items.push({
  id: 'care-rooms-7b-rehab-shower',
  rooms: ['rehab-wc-sw'],
  change:
    'Owner on the live build: “in the large bathroom in the rehab area, let’s add a shower to the right of the toilet.” A 1.3 × 1.2 m roll-in shower (seat, grab bars, hand shower, curtain) stands in the north-east corner of the west therapy bathroom, against the east wall beside the toilet, open to the room.',
  unresolved:
    '“The large bathroom” is read as the larger of the two single therapy bathrooms (the west one, 3.9 m long), not the shared multistall restroom. “To the right of the toilet” is read as seen by someone seated on it (north); the other side has only 0.8 m before the basin. Shower size and fixtures are typical, not measured.',
});
review.items.push({
  id: 'care-rooms-8c-laundry-in-linen-room',
  rooms: ['rear-support-west', 'rear-support-center'],
  change:
    'Owner’s comment on the live build, “this should be moved to the linen room”: the washer and dryer stand side by side against the south wall of the linen room’s west bay, fronts north, just inside its door from the west corridor, with the laundry aide in front of them. The plan’s laundry room next door keeps the mop sink and housekeeping cart and is named Housekeeping.',
  unresolved:
    'The comment was pinned to the 3D view, not to an object; it is read as the washer and dryer, which the previous build had put in the plan’s laundry room as an assumption. Their wall within the linen room is assumed (the south wall of the west bay is the only free run long enough for both). Whether the mop sink belongs with them is not known.',
});
writeFileSync(MODEL, JSON.stringify(m, null, 2) + '\n');

// --- The loop ---------------------------------------------------------------
// Numbers keep their text (10.0 stays 10.0) so untouched actors do not change.
const text = readFileSync(LOOP, 'utf8');
const loop = JSON.parse(text, (_, v, context) =>
  typeof v === 'number' && context?.source !== String(v)
    ? JSON.rawJSON(context.source)
    : v,
);
const num = (v) => (typeof v === 'object' && v !== null && 'rawJSON' in v ? Number(v.rawJSON) : v);
const actor = (id) => {
  const a = loop.actors.find((a) => a.id === id);
  assert.ok(a, `actor ${id}`);
  return a;
};
const grid = nav.navGrid(m, nav.dayProgramNavOptions());
const bathrooms = ['rehab-wc-nw', 'rehab-wc-sw', 'rehab-wc-east'].map((id) => room(id).polygon);
/** Points every 5 cm along a polyline. */
const samples = (path) => {
  const out = [];
  for (let i = 1; i < path.length; i++) {
    const [p, q] = [path[i - 1], path[i]],
      n = Math.max(1, Math.ceil(nav.distance(p, q) / 0.05));
    for (let k = 0; k <= n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
};
/** Route at the widest mobility clearance the openings allow. */
const routeFor = (a, b, what) => {
  for (const clearance of [0.37, 0.33, 0.26, 0.21])
    try {
      return { path: nav.routeBetween(grid, a, b, clearance), clearance };
    } catch (e) {
      if (!(e instanceof nav.NavError)) throw e;
    }
  throw new Error(`no route for ${what} from ${a.join(',')} to ${b.join(',')}`);
};

// The food trolley's lane down the strip east of the electrical room (the
// legs apply-kitchen-delivery.mjs authors) passes at its 0.45 m clearance.
for (const p of samples([[10.6, -13.9], [10.6, -10.0], [10.45, -9.0]]))
  assert.ok(nav.isClear(grid, p, 0.45), `the trolley lane beside the electrical room is clear at 0.45 m at ${p.map((v) => v.toFixed(2)).join(',')}`);

// (7) The wheelchair arrival and its escort: the legs that cut through the
// northwest bathroom as a corridor, recomputed with the same start and end
// times and the same endpoints.
const legs = [];
for (const title of ['Escort to occupational therapy', 'Escort to supported activities']) {
  const rider = actor('arrival-wheelchair').segments.filter((s) => s.title === title);
  assert.equal(rider.length, 1, `arrival-wheelchair has one "${title}" segment`);
  const from = rider[0].path[0].map(num),
    to = rider[0].path.at(-1).map(num);
  const { path, clearance } = routeFor(from, to, title);
  for (const p of samples(path))
    assert.ok(!bathrooms.some((poly) => nav.insidePolygon(p, poly)), `${title} keeps out of the therapy bathrooms at ${p.join(',')}`);
  for (const id of ['arrival-wheelchair', 'arrival-aide-b']) {
    const s = actor(id).segments.filter((s) => s.title === title);
    assert.equal(s.length, 1, `${id} has one "${title}" segment`);
    s[0].path = path;
    s[0].heights = path.map(() => 0);
  }
  legs.push(`${title}: ${path.length} points, ${nav.pathLength(path).toFixed(1)} m at ${clearance} m clearance`);
}
assert.equal(actor('arrival-wheelchair').segments.length, actor('arrival-aide-b').segments.length);

// (8) The laundry aide works in front of the washer and dryer in the linen
// room, facing them (south).
{
  const a = actor('community-52'),
    at = [1.3, -8.2];
  assert.ok(inRoom(at, 'rear-support-west'));
  const q = nav.measurePoint(grid, at);
  assert.ok(q.wallMargin >= 0.28 && q.obstacleExcess + nav.FURNITURE_CLEARANCE >= 0.28, 'the laundry aide stands 0.28 m clear of the walls and the machines');
  for (const s of a.segments) {
    s.path = [at, at];
    s.heading = 0;
  }
  a.roomId = 'rear-support-west';
}
// The hair-care participant sits in the barber chair (the chair's own seat
// heading) except while the story's hero has it (12:25 PM, day-in-the-life
// personal-care stop 392–440 s): then she waits by the door side of the
// room. The aide stands at the basin side of the chair.
{
  const chair = object('access-barber-chair'),
    seat = [chair.position[0], chair.position[2]],
    aside = [7.9, -3.3],
    a = actor('community-53');
  assert.ok(inRoom(aside, 'rear-wc-east'));
  // The straight walk between the two keeps clear of every other furnishing and the walls.
  for (const p of samples([seat, aside])) {
    const q = nav.measurePoint(grid, p);
    assert.ok(q.wallMargin >= 0.21, `community-53 walk clear of walls at ${p.join(',')}`);
    for (const o of grid.obstacles)
      if (o.id !== chair.id) {
        const dx = p[0] - o.x,
          dz = p[1] - o.z;
        assert.ok(
          Math.abs(o.c * dx - o.s * dz) >= o.hw || Math.abs(o.s * dx + o.c * dz) >= o.hd,
          `community-53 walk clear of ${o.id} at ${p.join(',')}`,
        );
      }
  }
  const facing = Math.round(Math.atan2(seat[0] - aside[0], seat[1] - aside[1]) * 1000) / 1000;
  const seated = (start, end, action) => ({
    start,
    end,
    action,
    path: [seat, seat],
    zoneId: 'ot',
    heading: chair.rotation,
    seated: true,
    title: 'Hair care appointment',
  });
  const standing = (start, end, action, path, heading, title) => ({
    start,
    end,
    action,
    path,
    zoneId: 'ot',
    heading,
    seated: false,
    title,
  });
  a.seated = true;
  a.seatId = chair.id;
  a.segments = [
    seated(0, 90, 'conversation'),
    seated(90, 180, 'greet'),
    seated(180, 270, 'conversation'),
    seated(270, 376, 'greet'),
    standing(376, 380, 'walk', [seat, aside], 0, 'Making way at the chair'),
    standing(380, 448, 'conversation', [aside, aside], facing, 'Waiting for the chair'),
    standing(448, 452, 'walk', [aside, seat], 0, 'Back to the chair'),
    seated(452, 540, 'conversation'),
    seated(540, 630, 'greet'),
    seated(630, 720, 'conversation'),
  ];
  const aide = actor('community-54'),
    beside = [7.1, -6.05];
  assert.ok(inRoom(beside, 'rear-wc-east'));
  for (const s of aide.segments) {
    s.path = [beside, beside];
    s.heading = -HALF;
  }
}

// The package delivery: round the truck's nose to the foot of the receiving
// ramp, up it and through the service door to a hand-over point just inside,
// on the east side of the strip, out of the food trolley's lane
// (apply-kitchen-delivery.mjs).
{
  const stop = deliveries.deliveryStops.find((s) => s.id === 'delivery-package'),
    a = actor('delivery-package'),
    ramp = deliveries.receivingRamp(stop),
    /** Height of the court (−0.23) or, on the ramp, of its surface at a point. */
    rampY = ([x, z]) =>
      x < ramp.x0 || x > ramp.x1 || z <= ramp.z0 ? -0.23 : z >= ramp.z1 ? 0 : r3(-0.23 * ((ramp.z1 - z) / (ramp.z1 - ramp.z0)));
  const TRUCK_SIDE = [5.25, -18],
    DOOR = [...stop.door],
    RECEIVE_AT = [11.25, -14.3],
    // Along the court to the ramp's west edge, onto the ramp, up it and in.
    route = [TRUCK_SIDE, [5.25, -16.75], [r3(ramp.x0 - 0.05), -16.75], [DOOR[0], -16.75], [DOOR[0], -16.1], DOOR, RECEIVE_AT],
    heights = route.map(rampY);
  assert.ok(inRoom(RECEIVE_AT, 'rear-north'));
  for (const p of samples(route.slice(route.indexOf(DOOR))))
    assert.ok(nav.isClear(grid, p), `package route inside is clear at ${p.join(',')}`);
  const reversed = (list) => [...list].reverse();
  const segments = [];
  let clock = 0;
  const push = (end, action, path, title, visible, hs) => {
    segments.push({ start: clock, end, action, path, zoneId: 'site', heading: 0, heights: hs, visible, title });
    clock = end;
  };
  const parked = [TRUCK_SIDE, TRUCK_SIDE],
    street = [-0.23, -0.23];
  for (const run of deliveries.deliveryRuns(stop)) {
    push(run.arrive + 2, 'ride', parked, 'Delivery route', false, street);
    push(run.arrive + 22, 'escort', route, 'Delivering packages', true, heights);
    push(run.leave - 20, 'serve', [RECEIVE_AT, RECEIVE_AT], 'Receiving package delivery', true, [0, 0]);
    push(run.leave - 2, 'escort', reversed(route), 'Returning with empty trolley', true, reversed(heights));
    push(run.leave, 'ride', parked, 'Returning to delivery vehicle', false, street);
  }
  push(num(loop.duration), 'ride', parked, 'Delivery route', false, street);
  a.segments = segments;
  a.label = 'Package delivery · service door';
}

// The two delivery people, the laundry aide and the hair-care pair keep their
// distance from everyone else on the ground floor (every 0.25 s; escorts
// sampled behind their partner, as the engine draws them).
{
  const cast = JSON.parse(JSON.stringify(loop)).actors.filter((a) => a.levelId === 'ground'),
    byId = new Map(cast.map((a) => [a.id, a]));
  const at = (a, t) => (a.escortFor ? activity.sampleEscort(byId.get(a.escortFor), t) : activity.sampleActor(a, t));
  let nearest = { gap: Infinity };
  for (const id of ['delivery-package', 'community-52', 'community-53', 'community-54'])
    for (let t = 0; t < num(loop.duration); t += 0.25) {
      const p = at(byId.get(id), t);
      if (p.visible === false) continue;
      for (const other of cast) {
        if (other.id === id) continue;
        const q = at(other, t);
        if (q.visible === false) continue;
        const gap = Math.hypot(p.x - q.x, p.z - q.z);
        if (gap < nearest.gap) nearest = { gap, id, other: other.id, t };
      }
    }
  assert.ok(nearest.gap >= 0.5, `${nearest.id} passes ${nearest.gap.toFixed(2)} m from ${nearest.other} at ${nearest.t}`);
  legs.push(`nearest person ${nearest.gap.toFixed(2)} m (${nearest.id}/${nearest.other} at ${nearest.t} s)`);
}

// Non-ASCII characters escaped, as the Python generators wrote the file.
const ascii = (s) => s.replace(/[^\n\x20-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const out = ascii(JSON.stringify(loop, null, 2)) + '\n';
for (const file of [LOOP, PUBLISHED]) writeFileSync(file, out);
console.log(
  `Owner review · care rooms: ${review.newWallIds.length} new, ${review.changedWallIds.length} changed and ${review.removedWallIds.length} removed walls; ${review.newObjectIds.length} new objects, ${review.changedPlanObjectIds.length} moved and ${review.removedPlanObjectIds.length} removed plan objects; service door ${DOOR_X0}–${DOOR_X1} (${DOOR_W} m). ${legs.join('; ')}. Wrote ${MODEL}, ${LOOP} and ${PUBLISHED}.`,
);
