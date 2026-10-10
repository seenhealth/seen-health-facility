// Owner walkthrough, October 2026 · care rooms: the therapy bathrooms (7) and
// the back of house (8).
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
// (8) Back of house, as the owner described it from the roll-up inward: the
// nook to the right is the wheelchair wash (a drained pad, a wall hose reel
// with its spray gun, a chair parked on the pad), the washer and dryer stand
// against receiving's west wall, the old laundry room becomes soiled utility,
// the linen room keeps three racks, the rear employee door opens into the
// trash enclosure (bins instead of the plan's counter), and packages come in
// through the loading roll-up with the food. The two personal-care rooms are
// re-planned: east room hair-wash basin and chair in the northwest corner,
// shower northeast, toilet and basin down the east wall; west room mirrored.
//
// Idempotent: everything this script owns (ids below) is removed and rebuilt,
// the owner registry (`ownerReview`) is updated as a set union, and the loop
// actors it touches are rebuilt from the constants here. Afterwards run
// `node scripts/apply-drop-off-route.mjs` (loop formatting), then
// `node scripts/apply-kitchen-delivery.mjs` (the food trolley's route and the
// people it must keep clear of) and `npm run build:scenario`.
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
  OWN_OBJECTS = new Set([
    'access-dryer',
    'rehab-wc-east-stall-door-3',
    'rehab-wc-east-stall-handle-3',
  ]),
  OWN_ASSETS = new Set([
    'photo-rehab-wc-east-stall-door-3',
    'photo-rehab-wc-east-stall-handle-3',
  ]);
/** Baseline walls this script removes, moves and baseline objects it moves or removes. */
const REMOVED_WALLS = ['plan-wall-199', 'plan-wall-081', 'plan-wall-102'],
  CHANGED_WALLS = ['plan-wall-177', 'plan-wall-179', 'plan-wall-068'],
  CHANGED_OBJECTS = ['ot-toilet-0', 'ot-basin-0', 'ot-toilet-2', 'ot-basin-1'],
  REMOVED_OBJECTS = ['reception-counter-2'];
const STATUS = 'owner-walkthrough 2026-10 / described, not surveyed';
const PAGES = [92];

const r3 = (v) => Math.round(v * 1000) / 1000;
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
    o.id !== 'access-linen-rack-4',
);
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

// --- (7) Bathrooms by the PT area -------------------------------------------
const Z_NORTH = 11.142477, // the bathrooms' north edge (rooms rehab-wc-nw / rehab-wc-east)
  X_WEST = -22.590228, // rehab-wc-nw's west wall (plan-wall-175/176)
  X_MID = -19.842768, // plan-wall-177, between the west bathrooms and the multistall room
  X_EAST = -14.653121; // plan-wall-179, the multistall room's east wall
addWall('owner-care-wall-rehab-wc-nw-north', 'plan-wall-177', [X_WEST, Z_NORTH], [X_MID, Z_NORTH]);
addWall('owner-care-wall-rehab-wc-east-north', 'plan-wall-177', [X_MID, Z_NORTH], [X_EAST, Z_NORTH]);
// The dividing walls reach the new north walls (they started 0.25 m short, at the corridor's edge).
wall('plan-wall-177').a = [X_MID, Z_NORTH];
wall('plan-wall-179').a = [X_EAST, Z_NORTH];
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
  'Owner review 2026-10: enclosed; entered only from the therapy cross-hall by its south door.',
);
room('rehab-wc-east').notes =
  'Owner review 2026-10: fully enclosed; all four stalls inside one restroom entered from the therapy cross-hall. ' +
  room('rehab-wc-east').notes.replace(/^Owner review 2026-10:.*?cross-hall\. /, '');

// --- (8) Back of house ------------------------------------------------------
// Wheelchair wash: a 0.92 m door from receiving into the east nook.
{
  const w = wall('plan-wall-068'),
    x = w.a[0],
    doorZ = -10.5,
    half = 0.46;
  w.b = [x, r3(doorZ - half)];
  addWall('owner-care-wall-068-south', 'plan-wall-068', [x, r3(doorZ + half)], [x, -6.614256]);
}
const EAST = room('rear-support-east');
m.assets['owner-care-wash-pad'] = { kind: 'wash-pad', dimensions: [1.6, 0.05, 1.6], material: 'photo-mosaic', materials: { kerb: 'concrete' }, parameters: {} };
m.assets['owner-care-hose-reel'] = { kind: 'hose-reel', dimensions: [0.4, 0.5, 0.3], material: 'photo-teal', parameters: {} };
m.assets['owner-care-wheelchair'] = { kind: 'wheelchair', dimensions: [0.66, 0.92, 1.05], material: 'photo-black', parameters: {} };
place('owner-care-wash-pad', 'owner-care-wash-pad', EAST.id, [13.5, 0, -10.84], 0,
  'Owner: “in that nook to the right, there is a wheelchair wash … like a spray gun”. Drained, kerbed pad; size estimated.');
place('owner-care-wheelchair', 'owner-care-wheelchair', EAST.id, [13.5, 0, -10.84], -HALF,
  'A center wheelchair parked on the wash pad, facing the door. Illustrative.');
place('owner-care-hose-reel', 'owner-care-hose-reel', EAST.id, [13.5, 1.0, r3(-12.363571 + face('plan-wall-086') + 0.15 + 0.005)], 0,
  'Wall-mounted hose reel and spray gun on the nook’s north wall, clear of the east window. Mounting height estimated.');
rename('rear-support-east', 'Wheelchair wash', 'Owner review 2026-10: the nook off receiving is the wheelchair wash (spray gun over a drained pad), entered by a new door from receiving.');

// Receiving: washer, washer and dryer against the west wall, fronts east, out
// of the trolley lane from the roll-up to the south gap.
const WEST_X = r3(6.614256 + face('plan-wall-067') + 0.36 + 0.02);
move('access-washing-machine-1', [WEST_X, 0, -12.3], HALF, 'rear-north',
  'Owner: “immediately to the left is where the washer and dryer are, against the left wall” (receiving’s west wall).');
move('access-washing-machine-2', [WEST_X, 0, -11.5], HALF, 'rear-north',
  'Owner: washer and dryer against receiving’s west wall.');
m.assets['owner-care-tumble-dryer'] = {
  kind: 'tumble-dryer',
  dimensions: [0.68, 0.92, 0.72],
  material: 'photo-white',
  parameters: {},
};
place('access-dryer', 'owner-care-tumble-dryer', 'rear-north', [WEST_X, 0, -10.7], HALF,
  'Owner: a dryer beside the washers against receiving’s west wall. Product and dimensions estimated.');
rename('rear-north', 'Receiving & laundry', 'Owner review 2026-10: deliveries come in through the roll-up; the washer and dryer stand against the west wall. The trolley lane from the roll-up to the south gap stays clear.');

// The old laundry room: soiled utility and housekeeping.
m.assets['owner-care-janitor-sink'] = { kind: 'janitor-sink', dimensions: [0.65, 1.3, 0.65], material: 'photo-white', parameters: {} };
m.assets['owner-care-housekeeping-cart'] = { kind: 'housekeeping-cart', dimensions: [0.55, 1.05, 1.1], material: 'photo-mustard', parameters: {} };
place('owner-care-janitor-sink', 'owner-care-janitor-sink', 'rear-support-center',
  [r3(6.614256 + face('plan-wall-067') + 0.325 + 0.01), 0, r3(-9.616111 + face('plan-wall-090') + 0.325 + 0.02)], HALF,
  'Mop sink in the former laundry room, now soiled utility (the laundry moved to receiving). Illustrative.');
place('owner-care-housekeeping-cart', 'owner-care-housekeeping-cart', 'rear-support-center',
  [r3(6.614256 + face('plan-wall-067') + 0.55 + 0.02), 0, -7.75], HALF,
  'Housekeeping cart parked in soiled utility. Illustrative.');
rename('rear-support-center', 'Soiled utility & housekeeping', 'Owner review 2026-10: the washers moved to receiving; this room keeps housekeeping’s mop sink and cart. Assumed use, not described by the owner.');

// Clean linen room: three racks, none through a wall.
const LINEN_Z = r3(-10.328415 + face('plan-wall-087') + 0.24 + 0.02),
  LINEN_WEST_X = r3(face('wall-181') + 0.24);
move('access-linen-rack-1', [0.86, 0, LINEN_Z], 0, 'rear-support-west', 'Owner: “there are three racks instead”. Along the north wall of the west bay.');
move('access-linen-rack-2', [LINEN_WEST_X, 0, -8.3], HALF, 'rear-support-west', 'Owner: three racks. Along the west wall (two do not fit along the north wall).');
move('access-linen-rack-3', [3.99, 0, LINEN_Z], 0, 'rear-support-west', 'Owner: three racks. Along the north wall of the northeast bay, clear of its walls.');
rename('rear-support-west', 'Clean linen room', 'Owner review 2026-10: the linen room with three racks; its existing doors (from the northeast bay and from the west corridor) are kept, the owner’s “another door leading to the linen room” read as the door between its two bays.');

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

// Deliveries: packages come through the roll-up with the food (deliveries.ts).
{
  const stop = deliveries.deliveryStops.find((s) => s.id === 'delivery-package'),
    food = deliveries.deliveryStops.find((s) => s.id === 'delivery-food');
  assert.deepEqual([...stop.door], [...food.door], 'the package stop shares the loading roll-up (deliveries.ts)');
  m.designDecisions.rearServiceActivity =
    'Package and meal deliveries both come in through the wide rear receiving roll-up; the rear employee door opens into the trash enclosure (owner walkthrough, October 2026). Routes, vehicle sizes and timing are illustrative.';
}

// Every new furnishing sits inside its room; every moved fixture too. (Room
// polygons overlap at the back: receiving's covers the soiled-utility room's,
// so this tests the object's own room rather than the first room at the point.)
const inRoom = (p, id) => nav.insidePolygon(p, room(id).polygon);
for (const o of m.objects)
  if (o.id.startsWith(OWN) || OWN_OBJECTS.has(o.id) || CHANGED_OBJECTS.includes(o.id) || /^access-(shower|hair|barber|washing|linen)/.test(o.id))
    assert.ok(inRoom([o.position[0], o.position[2]], o.roomId), `${o.id} inside ${o.roomId}`);

// The registry.
review.changedWallIds = union(review.changedWallIds, CHANGED_WALLS);
review.newWallIds = union(review.newWallIds, m.walls.filter((w) => w.id.startsWith(OWN_WALL)).map((w) => w.id));
review.removedWallIds = union(review.removedWallIds, REMOVED_WALLS);
review.changedPlanObjectIds = union(review.changedPlanObjectIds, CHANGED_OBJECTS);
review.removedPlanObjectIds = union(review.removedPlanObjectIds, REMOVED_OBJECTS);
review.newObjectIds = union(
  review.newObjectIds,
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
    rooms: ['rear-north', 'rear-support-east', 'rear-support-center', 'rear-support-west', 'rear-utility-nw', 'rear-wc-east', 'rear-wc-west'],
    change:
      'Wheelchair wash in the east nook (new door from receiving, drained pad, hose reel and spray gun, parked chair); washer, washer and dryer against receiving’s west wall; the old laundry room is soiled utility (mop sink, cart); the linen room keeps three racks; the rear employee door opens into the trash enclosure (bins replace the plan’s counter) and packages come in through the roll-up with the food. Personal care east: hair-wash basin and chair northwest, shower northeast, toilet and basin down the east wall; personal care west mirrored.',
    unresolved:
      '“Another door leading to the linen room” is read as the existing door between the linen room’s two bays (the stair sits between the linen room and receiving). The bins are inside the rear utility room; if the enclosure is the court notch outside the employee door they belong there. Fixture sizes, the dryer and the soiled-utility fit-out are assumed.',
  },
);
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

// (8) The laundry aide works at the washer and dryer in receiving.
{
  const a = actor('community-52'),
    at = [7.85, -11.9];
  assert.ok(inRoom(at, 'rear-north'));
  for (const s of a.segments) {
    s.path = [at, at];
    s.heading = -HALF;
  }
  a.roomId = 'rear-north';
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

// The package delivery: round the truck's nose to the loading ramp, through
// the roll-up and to a receiving point beside it, out of the food trolley's
// lane (apply-kitchen-delivery.mjs).
{
  const stop = deliveries.deliveryStops.find((s) => s.id === 'delivery-package'),
    a = actor('delivery-package');
  const TRUCK_SIDE = [5.25, -18],
    RECEIVE_AT = [7.8, -13.8],
    route = [TRUCK_SIDE, [5.25, -16.6], [8.8, -16.1], [...stop.door], RECEIVE_AT],
    heights = [-0.23, -0.23, -0.115, 0, 0];
  assert.ok(inRoom(RECEIVE_AT, 'rear-north'));
  for (const p of samples(route.slice(3)))
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
  a.label = 'Package delivery · loading roll-up';
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
  `Owner review · care rooms: ${review.newWallIds.length} new, ${review.changedWallIds.length} changed and ${review.removedWallIds.length} removed walls; ${review.newObjectIds.length} new objects, ${review.changedPlanObjectIds.length} moved and ${review.removedPlanObjectIds.length} removed plan objects. ${legs.join('; ')}. Wrote ${MODEL}, ${LOOP} and ${PUBLISHED}.`,
);
