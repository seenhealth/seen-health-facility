// Owner review 2026-10 · kitchen: re-lay the kitchen to the owner's photo,
// fill the dining pass-through with a heated serving line, hang a TV on the
// dining room's north wall, seed Chinese lunch settings, and fit out the
// empty staff lounge with its kitchenette, breakfast bar and seating.
//
//   node scripts/apply-owner-review-kitchen.mjs
//
// Idempotent: everything it owns (objects, assets and materials with the
// prefixes below, its ownerReview entries and registry ids, community-55's
// seat) is removed and re-added from the constants here, so a second run
// leaves every file unchanged. Afterwards run `node
// scripts/apply-drop-off-route.mjs` (loop format), `node
// scripts/apply-kitchen-delivery.mjs --check` and `npm run build:scenario`
// (the story's routes through the pass-through now go round by the hall and
// the kitchen's south-west door into the waiting room).
//
// Sources: the owner's photo of the real kitchen (stainless west wall,
// three-compartment sink with pre-rinse, under-counter dish machine beside
// a second sink, a long island of two work tables with grey bins beneath,
// two 2-door reach-ins and a wire rack on the east wall, an Alto-Shaam
// warming cabinet by the sinks), the owner's note that the window to the
// dining room is a heating and serving tray and that the dining room's
// north wall carries a TV, the recovered plan crop (lounge counter with a
// sink on the north wall, cabinets down its west side) and the staff-lounge
// photo (L-shaped kitchenette with a microwave niche and fridge, quartz
// breakfast bar with four stools against a partition).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSim } from './build-scenario.mjs';

const MODEL = 'public/models/seen-alhambra-planning.json',
  LOOP = 'app/data/activity-loop.json',
  PUBLISHED = 'public/models/activity-loop.json',
  SCENARIO = 'app/data/scenarios/day-in-the-life.json';
const PI = Math.PI,
  HALF = PI / 2;
/** Ids this script owns outright (objects, assets): removed before re-adding. */
const OWNED = /^(kitchen-|lounge-|dining-steam-table$|dining-wall-tv$)/;
/** Plan objects the as-built kitchen replaces (registered as removed). */
const REMOVED_PLAN = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `kitchen-equipment-${i}`),
  ...[0, 1, 2, 3].map((i) => `kitchen-cart-${i}`),
];
/** Photo-pass and day-program objects the serving line replaces (not baseline). */
const REMOVED_OTHER = ['dining-service-sill', 'daily-food-trays'];
const REMOVED_ASSETS = ['interior-dining-service-sill', 'daily-food-trays'];
const OWNED_ITEMS = [
  'kitchen-relayout',
  'dining-serving-line',
  'dining-tv',
  'dining-asian-lunch',
  'staff-lounge-fitout',
];
/** The plated-meal cart, moved beside the serving line's south end. */
const CART = { id: 'daily-serving-cart', at: [7.93, 0, 5.95] };
/** Where community-55 sits (a bar stool), and the story's idt-rec home point (day-in-the-life.json), kept clear. */
const STAFF_SEAT = { actor: 'community-55', seat: 'lounge-stool-2', at: [12.52, 10.46], heading: 1.5708 },
  REC_HOME = [12, 12.4];

const MATERIALS = {
  'kitchen-stainless': { color: '#cfd3d2', roughness: 0.28, metalness: 0.78 },
  'kitchen-bin-grey': { color: '#8d9294', roughness: 0.72 },
  'kitchen-quarry': { color: '#9a5f3f', roughness: 0.85, pattern: 'tile' },
  'tv-glow': { color: '#4e86b4', roughness: 0.3, emissive: '#2f6a9c', emissiveIntensity: 0.7 },
  'lounge-tan': { color: '#cbb58f', roughness: 0.85 },
};
const steelSlots = { dark: 'photo-black', bin: 'kitchen-bin-grey', glass: 'glass' };
const ASSETS = {
  'kitchen-wall-panel-1': { kind: 'box', dimensions: [0.02, 2.2, 1.0], material: 'kitchen-stainless' },
  'kitchen-wall-panel-3': { kind: 'box', dimensions: [0.02, 2.2, 3.0], material: 'kitchen-stainless' },
  'kitchen-hand-sink': { kind: 'hand-sink', dimensions: [0.45, 1.2, 0.42], material: 'photo-silver', materials: steelSlots },
  'kitchen-three-compartment-sink': { kind: 'three-compartment-sink', dimensions: [2.2, 1.65, 0.7], material: 'photo-silver', materials: steelSlots },
  'kitchen-dish-machine': { kind: 'dish-machine', dimensions: [1.1, 1.2, 0.66], material: 'photo-silver', materials: steelSlots },
  'kitchen-warming-cabinet': { kind: 'warming-cabinet', dimensions: [0.64, 1.9, 0.78], material: 'photo-silver', materials: steelSlots },
  // Long axis along z at rotation 0: validate-day-life tests the lunch
  // carriers' spot against the unrotated footprint.
  'kitchen-island': { kind: 'stainless-work-table', dimensions: [0.76, 0.9, 1.8], material: 'photo-silver', materials: steelSlots, parameters: { bins: 3 } },
  'kitchen-dish-table': { kind: 'stainless-work-table', dimensions: [1.8, 0.9, 0.76], material: 'photo-silver', materials: steelSlots, parameters: { bins: 2 } },
  'kitchen-wire-shelving': { kind: 'wire-rack', dimensions: [1.2, 1.85, 0.61], material: 'photo-mesh-white', materials: { metal: 'photo-silver' } },
  'kitchen-reach-in-refrigerator': { kind: 'reach-in-refrigerator', dimensions: [1.4, 2.0, 0.8], material: 'photo-silver', materials: steelSlots, parameters: { doors: 2 } },
  'dining-steam-table': { kind: 'steam-table', dimensions: [1.9, 1.45, 1.06], material: 'photo-silver', materials: steelSlots },
  'dining-wall-tv': { kind: 'wall-tv', dimensions: [1.4, 0.95, 0.08], material: 'photo-black', materials: { dark: 'photo-black', screen: 'tv-glow' } },
  'lounge-refrigerator': { kind: 'reach-in-refrigerator', dimensions: [0.85, 1.9, 0.78], material: 'photo-silver', materials: steelSlots, parameters: { doors: 1, domestic: true } },
  'lounge-pantry-cabinet': { kind: 'pantry-cabinet', dimensions: [0.6, 2.28, 0.59], material: 'photo-white', materials: { wood: 'photo-white', white: 'photo-silver', dark: 'photo-black' } },
  'lounge-microwave': { kind: 'microwave', dimensions: [0.5, 0.3, 0.38], material: 'photo-white', materials: { white: 'photo-white', dark: 'photo-black' } },
  'lounge-bar-partition': { kind: 'bar-partition', dimensions: [1.9, 1.1, 0.5], material: 'photo-silver', materials: { panel: 'lounge-tan', wood: 'photo-chair-wood', white: 'photo-white' } },
};

const STATUS = 'owner walkthrough 2026-10 / photo-described / dimensions estimated';
const kitchen = (id, assetId, position, rotation, notes, extra = {}) => ({
  id,
  assetId,
  zoneId: 'kitchen',
  levelId: 'ground',
  position,
  rotation,
  scale: [1, 1, 1],
  roomId: 'kitchen-prep',
  referencePages: [92],
  status: STATUS,
  notes,
  layer: 'furniture',
  ...extra,
});
const dining = (id, assetId, position, rotation, notes, extra = {}) =>
  kitchen(id, assetId, position, rotation, notes, { zoneId: 'dining', roomId: 'dining-1421', ...extra });
const lounge = (id, assetId, position, rotation, notes, extra = {}) =>
  kitchen(id, assetId, position, rotation, notes, { zoneId: 'veranda', roomId: 'admin-staff-lounge', ...extra });

// West wall x 8.395 (kitchen face 8.52): hand sink by the door north of the
// serving window, then the sink run south of it; island down the middle;
// east wall x 13.279 (face 13.15); dish landing on the south wall.
const OBJECTS = [
  kitchen('kitchen-wall-panel-north', 'kitchen-wall-panel-1', [8.532, 0, 0.84], 0, 'Stainless wall panel on the west wall beside the door (owner photo).', { layer: 'wall-finish' }),
  kitchen('kitchen-wall-panel-middle', 'kitchen-wall-panel-3', [8.532, 0, 4.885], 0, 'Stainless wall panel behind the sink run (owner photo).', { layer: 'wall-finish' }),
  kitchen('kitchen-wall-panel-south', 'kitchen-wall-panel-1', [8.532, 0, 7.07], 0, 'Stainless wall panel behind the warming cabinet (owner photo).', { layer: 'wall-finish' }),
  kitchen('kitchen-hand-sink', 'kitchen-hand-sink', [8.732, 0, 0.95], HALF, 'Hand sink inside the kitchen door, north of the serving window.'),
  kitchen('kitchen-sink', 'kitchen-three-compartment-sink', [8.872, 0, 4.5], HALF, 'Three-compartment sink with pre-rinse spray and drainboards on the west wall (owner photo).'),
  kitchen('kitchen-dish-machine', 'kitchen-dish-machine', [8.852, 0, 6.2], HALF, 'Under-counter dish machine beside a second small sink, south of the pot sink (owner photo).'),
  kitchen('kitchen-warming-cabinet', 'kitchen-warming-cabinet', [8.912, 0, 7.17], HALF, 'Alto-Shaam-style warming cabinet at the south end of the sink run (owner photo).'),
  kitchen('kitchen-island-1', 'kitchen-island', [10.79, 0, 3.4], 0, 'North half of the island: two 1.8 m stainless work tables end to end with grey bins beneath (owner photo). The delivered lunch carriers are set out here (deliveries.ts KITCHEN_LUNCH).'),
  kitchen('kitchen-island-2', 'kitchen-island', [10.79, 0, 5.2], 0, 'South half of the island work table (owner photo).'),
  kitchen('kitchen-dish-table', 'kitchen-dish-table', [10.3, 0, 9.109], 0, 'Dish landing table on the south wall; the plan showed counters here, the photo does not show this wall.'),
  kitchen('kitchen-wire-shelving', 'kitchen-wire-shelving', [12.847, 0, 1.6], HALF, 'Four-shelf wire rack north of the reach-ins on the east wall (owner photo).'),
  kitchen('kitchen-reach-in-1', 'kitchen-reach-in-refrigerator', [12.752, 0, 3.1], -HALF, 'Two-door stainless reach-in refrigerator on the east wall (owner photo).'),
  kitchen('kitchen-reach-in-2', 'kitchen-reach-in-refrigerator', [12.752, 0, 4.6], -HALF, 'Second two-door reach-in refrigerator on the east wall (owner photo).'),
  kitchen('kitchen-dry-rack', 'kitchen-wire-shelving', [12.847, 0, 6.2], HALF, 'Dry-goods wire rack south of the reach-ins; not in the photo, keeps the plan’s east-wall storage.'),
  dining('dining-steam-table', 'dining-steam-table', [8.245, 0, 2.366], -HALF, 'Heated serving line in the pass-through to the dining room: hot-holding pans, sneeze guard and tray slide on the dining side (owner: “the window connecting to the dining room should be a heating and serving tray”). Fills the opening, so people go round by the hall.'),
  dining('dining-wall-tv', 'dining-wall-tv', [4.2, 1.4, 0.498], 0, 'Wall-mounted TV on the dining room’s north wall (owner; source p.79 “Dining perspective: TV wall”). Height and size estimated.', { layer: 'architecture' }),
  // Staff lounge 1520 (x 8.19–13.28, z 9.77–13.33): kitchenette along the
  // north wall (fridge, sink run, tall cabinet with the microwave niche),
  // breakfast bar against a half partition down the east side from the
  // north wall, lounge seating in the middle. The south strip and the
  // room's west edge stay clear: the story's hero crosses from the waiting
  // room through the lounge to the corridor and on to the east corridor.
  lounge('lounge-fridge', 'lounge-refrigerator', [8.645, 0, 10.16], 0, 'Stainless fridge-freezer at the west end of the kitchenette (staff-lounge photo).'),
  lounge('lounge-pantry', 'lounge-pantry-cabinet', [9.37, 0, 10.065], 0, 'Tall cabinet with the microwave niche beside the fridge (staff-lounge photo puts it at the far end of the run; here the run ends at the breakfast bar). The plan’s west return is left out so the waiting room, lounge and corridor stay connected.'),
  lounge('lounge-microwave', 'lounge-microwave', [9.37, 1.05, 10.0], 0, 'Microwave in the tall cabinet’s niche (staff-lounge photo).'),
  lounge('lounge-casework-north', 'photo-staff-casework', [10.97, 0, 10.065], 0, 'Kitchenette run on the north wall, 2.6 m: base and wall cabinets, quartz top, single sink with gooseneck faucet, tile splash (plan crop and staff-lounge photo).', { scale: [2.6 / 3, 1, 1] }),
  lounge('lounge-table', 'plan-lounge-table', [10.29, 0, 11.45], 0, 'Low round table between two pairs of lounge chairs.'),
  lounge('lounge-chair-1', 'plan-lounge-chair', [9.45, 0, 11.12], -HALF, 'Lounge chair, west pair, facing the table.'),
  lounge('lounge-chair-2', 'plan-lounge-chair', [9.45, 0, 11.78], -HALF, 'Lounge chair, west pair, facing the table.'),
  lounge('lounge-chair-3', 'plan-lounge-chair', [11.13, 0, 11.12], HALF, 'Lounge chair, east pair, facing the table.'),
  lounge('lounge-chair-4', 'plan-lounge-chair', [11.13, 0, 11.78], HALF, 'Lounge chair, east pair, facing the table.'),
  lounge('lounge-bar-partition', 'lounge-bar-partition', [13.01, 0, 10.72], HALF, 'Half-height partition and support of the breakfast bar along the east side from the north wall (staff-lounge photo shows a full wall with the room sign and extinguisher; kept low so the lounge stays open to the locker corridor).'),
  lounge('lounge-breakfast-bar', 'photo-staff-breakfast-counter', [12.98, 0.9, 10.72], HALF, 'White quartz breakfast bar on the partition (staff-lounge photo), shortened to 1.9 m.', { scale: [1.9 / 2.95, 1, 1] }),
  ...[10.0, 10.46, 10.92, 11.38].map((z, i) =>
    lounge(`lounge-stool-${i + 1}`, 'photo-staff-stool', [12.52, 0, z], -HALF, 'Bent-plywood stool on white legs at the breakfast bar (staff-lounge photo).'),
  ),
];

const ITEMS = [
  {
    id: 'kitchen-relayout',
    rooms: ['kitchen-prep'],
    change:
      'Kitchen re-laid to the owner’s photo: stainless panels on the west wall; hand sink by the door; three-compartment sink with pre-rinse, under-counter dish machine with a second sink and a warming cabinet along the west wall; an island of two stainless work tables with grey bins beneath; two 2-door reach-ins and a wire rack on the east wall; a dish landing table on the south wall; quarry-tile floor. The plan’s oak counters and carts are removed. The lunch delivery (trolley lane, hand-over at the island) is unchanged.',
    unresolved:
      'Equipment sizes are standard products, not measured; the south-wall table and the second wire rack are not in the photo; ceiling lights and the FRP wall finish are not modelled.',
  },
  {
    id: 'dining-serving-line',
    rooms: ['dining-1421', 'kitchen-prep'],
    change:
      'The pass-through window is now a heated serving line: a four-pan steam table with a sneeze guard and a tray slide on the dining side, at counter height in the opening, so nobody walks through the window any more (routes go round by the hall). The quartz sill and the buffet trays on the old dining-side counter are removed; the plated-meal cart moves beside the serving line’s south end.',
    unresolved: 'Whether the real unit is a drop-in or a mobile steam table, and which side it is served from.',
  },
  {
    id: 'dining-tv',
    rooms: ['dining-1421'],
    change: 'A 1.4 m wall-mounted TV with a soundbar on the dining room’s north wall, centred at x 4.2, bottom 1.4 m.',
    unresolved: 'Exact position and size on the wall.',
  },
  {
    id: 'dining-asian-lunch',
    rooms: ['dining-1421'],
    change:
      'Lunch place settings are Chinese and East Asian home cooking: rice bowls with chopsticks, noodle soup, bamboo-steamer dumplings, stir-fry plates, congee, steamed buns, each with tea and a soy dish, one per chair on every square table with a teapot and oranges to share; each table is dealt a different order (asset parameter `seed`).',
    unresolved: 'The dishes are illustrative; they do not follow the weekday menu in day-program.json.',
  },
  {
    id: 'staff-lounge-fitout',
    rooms: ['admin-staff-lounge'],
    change:
      'Staff Lounge 1520 fitted out from the plan crop and the photo: a kitchenette along the north wall (fridge, sink run with wall cabinets and tile splash, tall cabinet with a microwave niche), a quartz breakfast bar with four stools against a half partition down the east side, and a low table with two pairs of lounge chairs; the coordinator on break sits at the bar, and a lane stays open along the south wall between the west and east openings.',
    unresolved:
      'The plan’s second cabinet run down the west side is left out: the model has no wall there, and the run would close the way from the waiting room through the lounge to the corridor. The photo’s full-height partition and room sign are modelled as a half wall.',
  },
];

// --- The model -------------------------------------------------------------------
const m = JSON.parse(readFileSync(MODEL, 'utf8'));
const removeIds = new Set([...REMOVED_PLAN, ...REMOVED_OTHER]);
m.objects = m.objects.filter((o) => !OWNED.test(o.id) && !removeIds.has(o.id));
for (const id of Object.keys(m.assets)) if (OWNED.test(id) || REMOVED_ASSETS.includes(id)) delete m.assets[id];
Object.assign(m.assets, structuredClone(ASSETS));
Object.assign(m.materials, structuredClone(MATERIALS));
// Insert the new objects after the last dining-room object so the file reads
// room by room; the lounge objects follow the kitchen's.
const after = Math.max(...m.objects.map((o, i) => (o.roomId === 'dining-1421' ? i : -1)));
m.objects.splice(after + 1, 0, ...structuredClone(OBJECTS));
const cart = m.objects.find((o) => o.id === CART.id);
assert.ok(cart, `${CART.id} in the model`);
cart.position = [...CART.at];
cart.notes = 'Plated-meal cart beside the serving line’s south end: plated lunches and drinks on their way to the tables.';
// Each square dining table deals its settings in its own order.
for (const [id, a] of Object.entries(m.assets))
  if (/^daily-top-dining-table-(\d+)$/.test(id))
    a.parameters = { ...a.parameters, seed: Number(id.match(/(\d+)$/)[1]) };
const kitchenRoom = m.rooms.find((r) => r.id === 'kitchen-prep'),
  loungeRoom = m.rooms.find((r) => r.id === 'admin-staff-lounge');
kitchenRoom.floorMaterial = 'kitchen-quarry';
kitchenRoom.notes =
  'Boundary traced from Overall Planning.jpg. Equipment follows the owner’s photo of the built kitchen (October 2026 walkthrough): stainless west wall with the sink run, island work tables, reach-ins on the east wall, quarry-tile floor.';
loungeRoom.notes =
  'User-confirmed Staff Lounge 1520 beside the upstairs stair and locker corridor. Fitted out from the plan crop and the staff-lounge photograph (October 2026 walkthrough): L-shaped kitchenette, breakfast bar with stools, lounge seating.';
// The registry.
const r = m.ownerReview;
assert.ok(r, 'ownerReview registry in the model');
const union = (list, add) => [...new Set([...list.filter((id) => !OWNED.test(id)), ...add])];
r.items = [...r.items.filter((i) => !OWNED_ITEMS.includes(i.id)), ...structuredClone(ITEMS)];
r.removedPlanObjectIds = union(r.removedPlanObjectIds, REMOVED_PLAN);
r.newObjectIds = union(r.newObjectIds, OBJECTS.map((o) => o.id));
for (const o of OBJECTS) assert.ok(m.assets[o.assetId], `${o.id}: asset ${o.assetId} exists`);
for (const a of Object.values(ASSETS))
  for (const id of [a.material, ...Object.values(a.materials || {})])
    assert.ok(m.materials[id], `material ${id} exists`);
writeFileSync(MODEL, JSON.stringify(m, null, 2) + '\n');

// --- Walkability on the navigation grid --------------------------------------------
const { nav } = await loadSim({ nav: 'app/sim/nav.ts' }, { dir: 'work/owner-review-kitchen' });
const grid = nav.navGrid(m, nav.dayProgramNavOptions());
assert.ok(!nav.isClear(grid, [8.4, 2.4]), 'the serving line closes the pass-through');
for (const p of [[10, 4.8], [9.75, 4.55], [9.75, 2.05], [12.2, 8.6], REC_HOME])
  assert.ok(nav.isClear(grid, p), `(${p.join(', ')}) is clear of walls and furniture`);
for (let z = 0.5; z <= 1.25; z += 0.05)
  assert.ok(nav.isClear(grid, [10.45, z], 0.45), `trolley lane clear at z ${z.toFixed(2)}`);
for (const o of OBJECTS)
  assert.equal(nav.roomAt(m, 'ground', [o.position[0], o.position[2]]), o.roomId, `${o.id} sits in ${o.roomId}`);
const route = (a, b) => nav.routeBetween(grid, a, b, 0.26);
assert.ok(route([7.8, 12.8], [13.8, 10]).length > 1, 'a lane crosses the staff lounge west to east');
assert.ok(route([4.2, 1.95], [12.2, 8.6]).length > 1, 'dining and kitchen stay connected round by the hall');
// Staff can still pass from the kitchen's south-west door through the
// waiting room and along the lounge's west edge to the corridor (the
// story's hero, at a cane user's 0.26 m clearance, takes the east corridor:
// that 0.86 m door's grid cells fall 3 mm short for her).
assert.ok(nav.pathLength(nav.routeBetween(grid, [7.35, 10.3], [5.2, 13])) < 7, 'waiting room to the corridor through the lounge');
// The lane along the lounge's south wall: at least 1.1 m of floor between
// the seating and the wall face, measured as the band a cane user's centre
// line may use (0.26 m from the wall, 0.19 + 0.05 m from furniture) at every
// 0.1 m along the room.
const LANE = 1.1,
  band = LANE - 0.26 - (nav.FURNITURE_CLEARANCE + 0.05) - 0.02;
for (let x = 8.3; x <= 13.2; x += 0.1) {
  let lo = Infinity,
    hi = -Infinity;
  for (let z = 11.6; z <= 13.3; z += 0.02)
    if (nav.isClear(grid, [x, z], 0.26)) {
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
  assert.ok(hi - lo >= band, `lane at x ${x.toFixed(1)}: clear band ${(hi - lo).toFixed(2)} m (need ${band.toFixed(2)})`);
}

// --- The base loop: the coordinator's break is at the breakfast bar ------------------
const rawNumbers = (_, v, context) =>
  typeof v === 'number' && context?.source !== String(v) ? JSON.rawJSON(context.source) : v;
const loop = JSON.parse(readFileSync(LOOP, 'utf8'), rawNumbers);
const staff = loop.actors.find((a) => a.id === STAFF_SEAT.actor);
assert.ok(staff, `${STAFF_SEAT.actor} in the loop`);
const at = STAFF_SEAT.at,
  seated = (start, end, action, title) => ({
    start,
    end,
    path: [at, at],
    zoneId: 'veranda',
    action,
    heading: STAFF_SEAT.heading,
    title,
  });
staff.seated = true;
staff.seatId = STAFF_SEAT.seat;
staff.roomId = 'admin-staff-lounge';
staff.segments = [
  seated(0, 180, 'read', 'Staff break · paper at the breakfast bar'),
  seated(180, 300, 'phone', 'Staff break · calling a family'),
  seated(300, 405, 'tabletop', 'Lunch at the breakfast bar'),
  seated(405, 540, 'read', 'Staff break · reading'),
  seated(540, 720, 'tea', 'Staff break · tea'),
];
const ascii = (s) =>
  s.replace(/[^\n\x20-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const loopText = ascii(JSON.stringify(loop, null, 2)) + '\n';
for (const file of [LOOP, PUBLISHED]) writeFileSync(file, loopText);

// --- The story: lunch is seated once the kitchen cutaway has ended ------------------
// With the pass-through closed, Mrs. Lin's walk from lunch to the social
// worker is longer (out by the hall, through the kitchen's south-west door
// and the lounge), and the schedule solver, which centres each stop in its
// own window, would seat her for lunch during the kitchen cutaway
// (289–304 s). The lunch stop's window starts where its scrub window does.
const scenario = readFileSync(SCENARIO, 'utf8'),
  lunchStop = /("id": "lunch",\n\s*"walkTitle": "Walk to lunch",\n\s*"window": \[\n\s*)\d+,(\n\s*350\n\s*\])/;
assert.ok(lunchStop.test(scenario), 'the lunch stop in the story');
writeFileSync(SCENARIO, scenario.replace(lunchStop, (_, pre, post) => `${pre}304,${post}`));

console.log(
  `Owner review · kitchen: ${OBJECTS.length} objects (${REMOVED_PLAN.length} plan objects removed), ${Object.keys(ASSETS).length} assets, ${Object.keys(MATERIALS).length} materials; ${STAFF_SEAT.actor} seated at ${STAFF_SEAT.seat}; lunch stop window from 304 s.`,
);
