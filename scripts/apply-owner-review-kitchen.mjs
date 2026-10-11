// Owner review 2026-10 · kitchen: re-lay the kitchen to the owner's photo,
// put the heated serving line in the dining wall where the sink was, hang a
// TV on the dining room's north wall, seed Chinese lunch settings, fit a
// drink station behind the dining room's lattice wall, and fit out the staff
// lounge with its kitchenette turned 90° and tables on either side of it.
//
//   node scripts/apply-owner-review-kitchen.mjs
//
// Idempotent: everything it owns (objects, assets and materials with the
// prefixes below, its walls, its ownerReview entries and registry ids,
// community-55's seat, food-service-01's serving spot) is removed and
// re-added from the constants here, so a second run leaves every file
// unchanged. Afterwards run `node scripts/apply-drop-off-route.mjs` (loop
// format), `node scripts/apply-kitchen-delivery.mjs --check` and `npm run
// build:scenario` (the story's routes through the pass-through go round by
// the hall and the kitchen's south-west door into the waiting room).
//
// Sources: the owner's photo of the real kitchen (stainless west wall,
// three-compartment sink with pre-rinse, under-counter dish machine beside
// a second sink, a long island of two work tables with grey bins beneath,
// two 2-door reach-ins and a wire rack, an Alto-Shaam warming cabinet), the
// owner's notes after the live build ("the three-compartment sink is where
// the heating and serving tray should be; the sink goes to the other side
// where the storage shelving is; the reach-in refrigerator close to the
// built-in cabinets on the other side"; "behind the decorative wall in the
// dining room, a drink station with coffee machines, water machines and a
// vertical fridge with a transparent door"; staff lounge: "rotate everything
// counterclockwise 90° and make it fit; tables on either side of the
// cabinets; no sofa and couch in the middle"), the recovered plan crop (a
// service counter in the dining room's south-east pocket; the lounge's
// counter on the north wall with cabinets down a west wall the model does
// not have) and the staff-lounge photo (kitchenette with a microwave niche
// and fridge).
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
const OWNED = /^(kitchen-|lounge-|dining-steam-table$|dining-wall-tv$|dining-service-|dining-drink-)/;
/** Walls this script adds (the closed pass-through). */
const OWNED_WALL = /^owner-kitchen-wall-/;
/** Plan walls this script changes in place (wall 146 shortened for the new opening). */
const CHANGED_WALLS = ['plan-wall-146'];
/** Plan objects the as-built kitchen replaces (registered as removed). */
const REMOVED_PLAN = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `kitchen-equipment-${i}`),
  ...[0, 1, 2, 3].map((i) => `kitchen-cart-${i}`),
];
/** Photo-pass and day-program objects the serving line replaces (not baseline). */
const REMOVED_OTHER = ['dining-service-sill', 'daily-food-trays'];
const REMOVED_ASSETS = [
  'interior-dining-service-sill',
  'daily-food-trays',
  'interior-dining-service-jamb-1.38',
  'interior-dining-service-jamb-3.34',
  'interior-dining-service-header',
];
const OWNED_ITEMS = [
  'kitchen-relayout',
  'dining-serving-line',
  'dining-drink-station',
  'dining-tv',
  'dining-asian-lunch',
  'staff-lounge-fitout',
];
/** The plated-meal cart, beside the serving line's south end. */
const CART = { id: 'daily-serving-cart', at: [7.93, 0, 5.95] };
/** Where community-55 sits (the east café table's south chair), and the story's idt-rec and idt-rd home points (day-in-the-life.json), kept clear. */
const STAFF_SEAT = { actor: 'community-55', seat: 'lounge-cafe-chair-4', at: [12.1, 11.54], heading: 3.1416 },
  REC_HOME = [12, 12.4],
  RD_HOME = [12.2, 8.6];
/**
 * The dining-room server's spot at the serving line (food-service-01 in the
 * base loop stood at the old window, (6.6, 2)); the walk from the meal
 * station keeps to x 7.0 past the tables.
 */
const SERVER = {
  actor: 'food-service-01',
  old: [6.6, 2],
  at: [7.15, 4.35],
  heading: 1.5708,
  walk: [[3.8, 6], [4, 5.8], [6.4, 5.8], [7, 5.2], [7, 4.6], [7.15, 4.35]],
};
/** The west wall x 8.395 (kitchen face 8.522): the pass-through moves from z 1.374–3.358 to the sink's old span. */
const WALL_X = 8.395017,
  OLD_OPENING = [1.37373, 3.358007],
  OPENING = [3.358007, 5.342],
  WALL_146_END = 6.41074;

const MATERIALS = {
  'kitchen-stainless': { color: '#cfd3d2', roughness: 0.28, metalness: 0.78 },
  'kitchen-bin-grey': { color: '#8d9294', roughness: 0.72 },
  'kitchen-quarry': { color: '#9a5f3f', roughness: 0.85, pattern: 'tile' },
  'tv-glow': { color: '#4e86b4', roughness: 0.3, emissive: '#2f6a9c', emissiveIntensity: 0.7 },
};
const steelSlots = { dark: 'photo-black', bin: 'kitchen-bin-grey', glass: 'glass' };
const whiteSlots = { wood: 'photo-white', white: 'photo-silver', dark: 'photo-black', top: 'photo-quartz' };
const ASSETS = {
  'kitchen-wall-panel-1': { kind: 'box', dimensions: [0.02, 2.2, 1.0], material: 'kitchen-stainless' },
  'kitchen-wall-panel-2': { kind: 'box', dimensions: [0.02, 2.2, 2.0], material: 'kitchen-stainless' },
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
  'dining-service-jamb': { kind: 'box', dimensions: [0.12, 1.05, 0.07], material: 'oak' },
  'dining-service-header': { kind: 'box', dimensions: [0.12, 0.1, 2.02], material: 'oak' },
  'dining-wall-tv': { kind: 'wall-tv', dimensions: [1.4, 0.95, 0.08], material: 'photo-black', materials: { dark: 'photo-black', screen: 'tv-glow' } },
  'dining-drink-counter': { kind: 'kitchenette-counter', dimensions: [2.0, 1.2, 0.6], material: 'photo-white', materials: whiteSlots },
  'dining-drink-coffee-machine': { kind: 'coffee-machine', dimensions: [0.3, 0.55, 0.45], material: 'photo-silver', materials: steelSlots },
  'dining-drink-water-dispenser': { kind: 'water-dispenser', dimensions: [0.3, 0.5, 0.42], material: 'photo-silver', materials: { white: 'photo-white', dark: 'photo-black' } },
  'dining-drink-supplies': { kind: 'drink-supplies', dimensions: [0.55, 0.3, 0.3], material: 'photo-silver', materials: { dark: 'photo-black' } },
  'dining-drink-fridge': { kind: 'glass-door-fridge', dimensions: [0.7, 1.9, 0.7], material: 'photo-silver', materials: steelSlots },
  'lounge-refrigerator': { kind: 'reach-in-refrigerator', dimensions: [0.85, 1.9, 0.78], material: 'photo-silver', materials: steelSlots, parameters: { doors: 1, domestic: true } },
  'lounge-pantry-cabinet': { kind: 'pantry-cabinet', dimensions: [0.6, 2.28, 0.59], material: 'photo-white', materials: whiteSlots },
  'lounge-microwave': { kind: 'microwave', dimensions: [0.5, 0.3, 0.38], material: 'photo-white', materials: { white: 'photo-white', dark: 'photo-black' } },
  'lounge-kitchenette-counter': { kind: 'kitchenette-counter', dimensions: [0.85, 1.2, 0.59], material: 'photo-white', materials: whiteSlots },
  'lounge-cafe-table': { kind: 'table', dimensions: [0.7, 0.75, 0.7], material: 'table' },
  'lounge-cafe-chair': { kind: 'chair', dimensions: [0.5, 0.86, 0.52], material: 'photo-chair-wood' },
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

// West wall x 8.395 (kitchen face 8.522), north to south: hand sink by the
// door, wire shelving on the walled-up window, the serving line in the new
// opening where the sink was, then the dish machine and warming cabinet;
// the two reach-ins stand on the south wall in the south-west corner beside
// them; island down the middle; east wall x 13.279 (face 13.152): the
// three-compartment sink where the wire rack stood, the dry rack, the dish
// table in the south-east corner. The trolley lane (x 10.45 from the north
// door) and the west aisle (x 9.13–10.35, z 0.4–4.8) stay clear.
const OBJECTS = [
  kitchen('kitchen-wall-panel-north', 'kitchen-wall-panel-1', [8.532, 0, 0.84], 0, 'Stainless wall panel on the west wall beside the door (owner photo).', { layer: 'wall-finish' }),
  kitchen('kitchen-wall-panel-pass', 'kitchen-wall-panel-2', [8.532, 0, 2.366], 0, 'Stainless wall panel over the walled-up pass-through (the serving line moved south).', { layer: 'wall-finish' }),
  kitchen('kitchen-wall-panel-middle', 'kitchen-wall-panel-1', [8.532, 0, 5.88], 0, 'Stainless wall panel behind the dish machine (owner photo).', { layer: 'wall-finish' }),
  kitchen('kitchen-wall-panel-south', 'kitchen-wall-panel-1', [8.532, 0, 7.07], 0, 'Stainless wall panel behind the warming cabinet (owner photo).', { layer: 'wall-finish' }),
  kitchen('kitchen-hand-sink', 'kitchen-hand-sink', [8.732, 0, 0.95], HALF, 'Hand sink inside the kitchen door.'),
  kitchen('kitchen-wire-shelving', 'kitchen-wire-shelving', [8.827, 0, 2.35], HALF, 'Four-shelf wire rack on the walled-up pass-through, beside the hand sink (owner: the sink takes the rack’s place on the east wall).'),
  kitchen('kitchen-dish-machine', 'kitchen-dish-machine', [8.852, 0, 5.95], HALF, 'Under-counter dish machine beside a second small sink, south of the serving line (owner photo).'),
  kitchen('kitchen-warming-cabinet', 'kitchen-warming-cabinet', [8.912, 0, 7.15], HALF, 'Alto-Shaam-style warming cabinet at the south end of the west wall (owner photo).'),
  kitchen('kitchen-island-1', 'kitchen-island', [10.79, 0, 3.4], 0, 'North half of the island: two 1.8 m stainless work tables end to end with grey bins beneath (owner photo). The delivered lunch carriers are set out here (deliveries.ts KITCHEN_LUNCH).'),
  kitchen('kitchen-island-2', 'kitchen-island', [10.79, 0, 5.2], 0, 'South half of the island work table (owner photo).'),
  kitchen('kitchen-reach-in-1', 'kitchen-reach-in-refrigerator', [9.3, 0, 9.089], PI, 'Two-door stainless reach-in refrigerator on the south wall in the south-west corner, next to the dish machine and warming cabinet (owner: “close to the built-in cabinets on the other side”).'),
  kitchen('kitchen-reach-in-2', 'kitchen-reach-in-refrigerator', [10.75, 0, 9.089], PI, 'Second two-door reach-in refrigerator on the south wall beside the first.'),
  kitchen('kitchen-sink', 'kitchen-three-compartment-sink', [12.802, 0, 1.6], -HALF, 'Three-compartment sink with pre-rinse spray and drainboards on the east wall, where the wire shelving stood (owner: “on the other side where the storage shelving is”).'),
  kitchen('kitchen-dry-rack', 'kitchen-wire-shelving', [12.847, 0, 3.55], HALF, 'Dry-goods wire rack beside the sink on the east wall, where the reach-ins stood.'),
  kitchen('kitchen-dish-table', 'kitchen-dish-table', [12.772, 0, 7.0], HALF, 'Dish landing table in the south-east corner against the east wall; the plan showed counters down this wall.'),
  dining('dining-steam-table', 'dining-steam-table', [8.245, 0, (OPENING[0] + OPENING[1]) / 2], -HALF, 'Heated serving line in the pass-through to the dining room, in the sink’s old span: hot-holding pans, sneeze guard and tray slide on the dining side (owner: “the three-compartment sink is where the heating and serving tray should be”). Fills the opening, so people go round by the hall.'),
  dining('dining-service-jamb-north', 'dining-service-jamb', [8.32, 0.96, OPENING[0] + 0.006], 0, 'Oak jamb at the north edge of the serving-line opening (photo-pass trim moved with the opening).', { layer: 'wall-finish' }),
  dining('dining-service-jamb-south', 'dining-service-jamb', [8.32, 0.96, OPENING[1] - 0.006], 0, 'Oak jamb at the south edge of the serving-line opening (photo-pass trim moved with the opening).', { layer: 'wall-finish' }),
  dining('dining-service-header', 'dining-service-header', [8.32, 2.01, (OPENING[0] + OPENING[1]) / 2], 0, 'Oak header over the serving-line opening (photo-pass trim moved with the opening).', { layer: 'wall-finish' }),
  dining('dining-wall-tv', 'dining-wall-tv', [4.2, 1.4, 0.498], 0, 'Wall-mounted TV on the dining room’s north wall (owner; source p.79 “Dining perspective: TV wall”). Height and size estimated.', { layer: 'architecture' }),
  // Drink station in the dining room's south-east pocket: against the
  // kitchen wall (plan-wall-148, face z 7.479) on the side of the lattice
  // screen and wall 149 away from the tables, where the plan drew a service
  // counter; the serving line is just north-east of it.
  dining('dining-drink-counter', 'dining-drink-counter', [6.1, 0, 7.145], PI, 'Drink-station counter behind the lattice wall: base cabinets, quartz top, a small sink at its east end (owner: “behind the decorative wall … a drink station”).'),
  dining('dining-drink-supplies', 'dining-drink-supplies', [5.4, 0.9, 7.27], PI, 'Paper cups, tea tins and a canister on the drink station.'),
  dining('dining-drink-coffee-1', 'dining-drink-coffee-machine', [5.86, 0.9, 7.2], PI, 'Bean-to-cup coffee machine on the drink station (owner: “coffee machines”).'),
  dining('dining-drink-coffee-2', 'dining-drink-coffee-machine', [6.2, 0.9, 7.2], PI, 'Second bean-to-cup coffee machine on the drink station.'),
  dining('dining-drink-water', 'dining-drink-water-dispenser', [6.52, 0.9, 7.21], PI, 'Hot and cold water dispenser on the drink station (owner: “water machines”).'),
  dining('dining-drink-fridge', 'dining-drink-fridge', [7.5, 0, 7.095], PI, 'Upright glass-door drinks fridge beside the drink station (owner: “a vertical fridge with a transparent door”).'),
  // Staff lounge 1520 (x 8.19–13.28, z 9.77–13.33; walls only on its north
  // and south sides, open west to the waiting room and the corridor and east
  // to the locker corridor). The kitchenette is turned 90°: a north–south
  // run down the middle from the north wall (tall cabinet with the microwave
  // niche, counter with the sink, fridge) facing west, with a two-seat table
  // on either side of it; no lounge seating in the middle. The west strip
  // (waiting room to the corridor) and the lane along the south wall stay
  // open; the breakfast bar does not fit after the turn and is dropped.
  lounge('lounge-pantry', 'lounge-pantry-cabinet', [10.74, 0, 10.07], -HALF, 'Tall cabinet with the microwave niche at the north end of the kitchenette run, against the north wall (staff-lounge photo).'),
  lounge('lounge-microwave', 'lounge-microwave', [10.805, 1.05, 10.07], -HALF, 'Microwave in the tall cabinet’s niche (staff-lounge photo).'),
  lounge('lounge-counter', 'lounge-kitchenette-counter', [10.74, 0, 10.795], -HALF, 'Kitchenette counter with a sink and gooseneck faucet, the middle of the run turned north–south (owner: “rotate everything counterclockwise 90°”).'),
  lounge('lounge-fridge', 'lounge-refrigerator', [10.835, 0, 11.645], -HALF, 'Fridge-freezer at the south end of the kitchenette run (staff-lounge photo).'),
  lounge('lounge-cafe-table-west', 'lounge-cafe-table', [9.7, 0, 10.9], 0, 'Two-seat table west of the kitchenette (owner: “tables on either side of the cabinets”).'),
  lounge('lounge-cafe-chair-1', 'lounge-cafe-chair', [9.7, 0, 10.26], PI, 'Chair at the west table, facing south.'),
  lounge('lounge-cafe-chair-2', 'lounge-cafe-chair', [9.7, 0, 11.54], 0, 'Chair at the west table, facing north.'),
  lounge('lounge-cafe-table-east', 'lounge-cafe-table', [12.1, 0, 10.9], 0, 'Two-seat table east of the kitchenette (owner: “tables on either side of the cabinets”).'),
  lounge('lounge-cafe-chair-3', 'lounge-cafe-chair', [12.1, 0, 10.26], PI, 'Chair at the east table, facing south.'),
  lounge('lounge-cafe-chair-4', 'lounge-cafe-chair', [12.1, 0, 11.54], 0, 'Chair at the east table, facing north; the staff member on break sits here.'),
];

const ITEMS = [
  {
    id: 'kitchen-relayout',
    rooms: ['kitchen-prep'],
    change:
      'Kitchen re-laid to the owner’s photo and the live-build notes: stainless panels on the west wall; hand sink by the door, wire shelving on the walled-up window, the serving line in the opening where the sink was, then the under-counter dish machine with a second sink and the warming cabinet; the two 2-door reach-ins on the south wall in the south-west corner next to them (“close to the built-in cabinets on the other side”); an island of two stainless work tables with grey bins beneath; the three-compartment sink with pre-rinse on the east wall where the wire shelving stood (“on the other side where the storage shelving is”), the dry-goods rack beside it and the dish table in the south-east corner; quarry-tile floor. The plan’s oak counters and carts are removed. The lunch delivery (trolley lane, hand-over at the island) is unchanged.',
    unresolved:
      'Equipment sizes are standard products, not measured; the dish table and the second wire rack are not in the photo; which of the two reach-ins the owner meant is not known, so both stand together; ceiling lights and the FRP wall finish are not modelled.',
  },
  {
    id: 'dining-serving-line',
    rooms: ['dining-1421', 'kitchen-prep'],
    change:
      'The heated serving line (a four-pan steam table with a sneeze guard and a tray slide on the dining side) now sits where the three-compartment sink was: the old pass-through (z 1.37–3.36 on the dining wall) is walled up and a new opening of the same width cut at z 3.36–5.34, with the oak jambs and header moved to it; the quartz sill and the buffet trays on the old dining-side counter are removed; the plated-meal cart stands beside the serving line’s south end; the dining-room server stands at the new window. Nobody walks through the window (routes go round by the hall).',
    unresolved: 'Whether the real unit is a drop-in or a mobile steam table, and which side it is served from; the opening’s exact position on the wall.',
  },
  {
    id: 'dining-drink-station',
    rooms: ['dining-1421'],
    change:
      'A drink station in the dining room’s south-east pocket, on the side of the lattice wall away from the tables (against the kitchen wall, where the plan drew a service counter): a 2 m counter with a small sink, two bean-to-cup coffee machines, a hot/cold water dispenser, cups and tea tins, and an upright glass-door drinks fridge beside it.',
    unresolved: 'The owner did not say which side of the lattice; the pocket north of the kitchen wall is the side the lattice screens from the tables. Equipment is illustrative.',
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
      'Staff Lounge 1520 turned 90° counter-clockwise from the first fit-out: the kitchenette (tall cabinet with the microwave niche, counter with a sink, fridge) now runs north–south down the middle of the room from the north wall, facing west, with a two-seat table and two chairs on either side of it; the lounge table and four lounge chairs are gone; the staff member on break sits at the east table. The west strip to the waiting room and the corridor, and the lane along the south wall to the locker corridor, stay open.',
    unresolved:
      'The room has walls only on its north and south sides, so the turned run cannot stand against a west wall as the plan drew it (that would close the waiting room’s only way to the corridor); it stands free with its back to the east table. The breakfast bar and four stools do not fit after the turn and are dropped; the counter is shortened to 0.85 m.',
  },
];

// --- The model -------------------------------------------------------------------
const m = JSON.parse(readFileSync(MODEL, 'utf8'));
const removeIds = new Set([...REMOVED_PLAN, ...REMOVED_OTHER]);
m.objects = m.objects.filter((o) => !OWNED.test(o.id) && !removeIds.has(o.id));
for (const id of Object.keys(m.assets)) if (OWNED.test(id) || REMOVED_ASSETS.includes(id)) delete m.assets[id];
// Materials this script no longer uses (first round) go too.
delete m.materials['lounge-tan'];
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
// The dining side's lower wall panel (photo pass) covered the whole of wall
// 146; it keeps only the part of the wall south of the new opening.
const lowerWall = m.objects.find((o) => o.id === 'dining-lower-wall-1');
assert.ok(lowerWall, 'dining-lower-wall-1 in the model');
lowerWall.position = [8.28, 0, Math.round(((OPENING[1] + WALL_146_END) / 2) * 1e5) / 1e5];
lowerWall.scale = [1, 1, Math.round(((WALL_146_END - OPENING[1]) / 3) * 1e5) / 1e5];
lowerWall.notes = 'Blue-grey lower wall panel on the dining side of the kitchen wall, south of the serving-line opening (shortened when the opening moved, owner review 2026-10).';
// Each square dining table deals its settings in its own order.
for (const [id, a] of Object.entries(m.assets))
  if (/^daily-top-dining-table-(\d+)$/.test(id))
    a.parameters = { ...a.parameters, seed: Number(id.match(/(\d+)$/)[1]) };
const kitchenRoom = m.rooms.find((r) => r.id === 'kitchen-prep'),
  loungeRoom = m.rooms.find((r) => r.id === 'admin-staff-lounge');
kitchenRoom.floorMaterial = 'kitchen-quarry';
kitchenRoom.notes =
  'Boundary traced from Overall Planning.jpg. Equipment follows the owner’s photo of the built kitchen and the live-build notes (October 2026 walkthrough): stainless west wall with the serving line in the opening where the sink was, the sink on the east wall, reach-ins on the south wall, island work tables, quarry-tile floor.';
loungeRoom.notes =
  'User-confirmed Staff Lounge 1520 beside the upstairs stair and locker corridor. Fitted out from the plan crop and the staff-lounge photograph, turned 90° at the owner’s request (October 2026 walkthrough): a north–south kitchenette run down the middle with a two-seat table on either side.';

// --- Walls: the pass-through moves to the sink's old span ---------------------------
m.walls = m.walls.filter((w) => !OWNED_WALL.test(w.id));
const wall145 = m.walls.find((w) => w.id === 'plan-wall-145'),
  wall146 = m.walls.find((w) => w.id === 'plan-wall-146');
assert.ok(wall145 && wall146, 'plan walls 145 and 146 in the model');
assert.deepEqual([wall145.b[0], wall145.b[1]], [WALL_X, OLD_OPENING[0]], 'wall 145 ends at the old opening');
assert.equal(wall146.b[1], WALL_146_END, 'wall 146 ends where it did');
// Wall 146 keeps its south part; its north part is the new opening.
wall146.a = [WALL_X, OPENING[1]];
delete wall146.sourcePixels;
wall146.status = 'source-stroke-traced / height-inferred / owner walkthrough 2026-10: north part opened for the serving line';
const { sourcePixels: _px, ...closing } = wall145;
m.walls.splice(m.walls.indexOf(wall145) + 1, 0, {
  ...structuredClone(closing),
  id: 'owner-kitchen-wall-pass-closed',
  a: [WALL_X, OLD_OPENING[0]],
  b: [WALL_X, OLD_OPENING[1]],
  status: 'owner walkthrough 2026-10 / old pass-through walled up (serving line moved south)',
});

// The registry.
const r = m.ownerReview;
assert.ok(r, 'ownerReview registry in the model');
const union = (list, add, own = OWNED) => [...new Set([...list.filter((id) => !own.test(id)), ...add])];
r.items = [...r.items.filter((i) => !OWNED_ITEMS.includes(i.id)), ...structuredClone(ITEMS)];
r.removedPlanObjectIds = union(r.removedPlanObjectIds, REMOVED_PLAN);
r.newObjectIds = union(r.newObjectIds, OBJECTS.map((o) => o.id));
r.changedWallIds = [...new Set([...r.changedWallIds, ...CHANGED_WALLS])];
r.newWallIds = union(r.newWallIds, m.walls.filter((w) => OWNED_WALL.test(w.id)).map((w) => w.id), OWNED_WALL);
for (const o of OBJECTS) assert.ok(m.assets[o.assetId], `${o.id}: asset ${o.assetId} exists`);
for (const a of Object.values(ASSETS))
  for (const id of [a.material, ...Object.values(a.materials || {})])
    assert.ok(m.materials[id], `material ${id} exists`);
writeFileSync(MODEL, JSON.stringify(m, null, 2) + '\n');

// --- Walkability on the navigation grid --------------------------------------------
const { nav } = await loadSim({ nav: 'app/sim/nav.ts' }, { dir: 'work/owner-review-kitchen' });
const grid = nav.navGrid(m, nav.dayProgramNavOptions());
assert.ok(!nav.isClear(grid, [8.4, 2.4]), 'the old pass-through is walled up');
assert.ok(!nav.isClear(grid, [8.4, 4.35]), 'the serving line closes the new opening');
for (const p of [[10, 4.8], [9.75, 4.55], [9.75, 2.05], [7.0, 5.2], SERVER.at, REC_HOME, RD_HOME])
  assert.ok(nav.isClear(grid, p), `(${p.join(', ')}) is clear of walls and furniture`);
for (let z = 0.5; z <= 1.25; z += 0.05)
  assert.ok(nav.isClear(grid, [10.45, z], 0.45), `trolley lane clear at z ${z.toFixed(2)}`);
for (const o of OBJECTS)
  assert.equal(nav.roomAt(m, 'ground', [o.position[0], o.position[2]]), o.roomId, `${o.id} sits in ${o.roomId}`);
const route = (a, b) => nav.routeBetween(grid, a, b, 0.26);
assert.ok(route([7.8, 12.8], [13.8, 10]).length > 1, 'a lane crosses the staff lounge west to east');
assert.ok(route([4.2, 1.95], [12.2, 8.2]).length > 1, 'dining and kitchen stay connected round by the hall');
// Staff can still pass from the kitchen's south-west door through the
// waiting room and along the lounge's west strip to the corridor (the
// story's hero, at a cane user's 0.26 m clearance, takes the east corridor:
// that 0.86 m door's grid cells fall 3 mm short for her).
assert.ok(nav.pathLength(nav.routeBetween(grid, [7.35, 10.3], [5.2, 13])) < 7, 'waiting room to the corridor through the lounge');
for (let z = 10.2; z <= 12.8; z += 0.1)
  assert.ok(nav.isClear(grid, [8.75, z], 0.26), `the lounge’s west strip is clear at z ${z.toFixed(1)}`);
// The lane along the lounge's south wall: at least 1.1 m of floor between
// the furniture and the wall face, measured as the band a cane user's centre
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

// --- The base loop: the coordinator's break is at the east café table ---------------
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
  seated(0, 180, 'read', 'Staff break · paper at the lounge table'),
  seated(180, 300, 'phone', 'Staff break · calling a family'),
  seated(300, 405, 'tabletop', 'Lunch at the lounge table'),
  seated(405, 540, 'read', 'Staff break · reading'),
  seated(540, 720, 'tea', 'Staff break · tea'),
];
// The dining-room server's window spot follows the serving line: the walks
// to and from the old window (or, on a re-run, the new one) are re-pathed
// and the serve segments there moved; every time stays as it was.
const server = loop.actors.find((a) => a.id === SERVER.actor);
assert.ok(server, `${SERVER.actor} in the loop`);
const num = (v) => Number(JSON.stringify(v)),
  near = (p, q) => Math.hypot(num(p[0]) - q[0], num(p[1]) - q[1]) < 1e-6,
  atWindow = (p) => near(p, SERVER.old) || near(p, SERVER.at);
let moved = 0;
for (const s of server.segments) {
  if (s.action === 'walk' && atWindow(s.path.at(-1))) {
    assert.ok(near(s.path[0], SERVER.walk[0]), `${SERVER.actor} walks to the window from the meal station`);
    s.path = structuredClone(SERVER.walk);
  } else if (s.action === 'walk' && atWindow(s.path[0])) {
    assert.ok(near(s.path.at(-1), SERVER.walk[0]), `${SERVER.actor} walks back to the meal station`);
    s.path = structuredClone(SERVER.walk).reverse();
  } else if (s.action === 'serve' && atWindow(s.path[0])) {
    s.path = [[...SERVER.at], [...SERVER.at]];
    s.heading = SERVER.heading;
  } else continue;
  moved++;
}
assert.equal(moved, 6, `${SERVER.actor}: two walks out, two serves at the window, two walks back`);
for (let i = 1; i < SERVER.walk.length; i++)
  for (let t = 0; t <= 1; t += 0.05) {
    const [p, q] = [SERVER.walk[i - 1], SERVER.walk[i]];
    assert.ok(nav.isClear(grid, [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]), `the server’s walk is clear on leg ${i}`);
  }
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
  `Owner review · kitchen: ${OBJECTS.length} objects (${REMOVED_PLAN.length} plan objects removed), ${Object.keys(ASSETS).length} assets, ${Object.keys(MATERIALS).length} materials; pass-through moved to z ${OPENING[0].toFixed(2)}–${OPENING[1].toFixed(2)} (1 wall added, ${CHANGED_WALLS.length} changed); ${STAFF_SEAT.actor} seated at ${STAFF_SEAT.seat}; ${SERVER.actor} serves at (${SERVER.at.join(', ')}); lunch stop window from 304 s.`,
);
