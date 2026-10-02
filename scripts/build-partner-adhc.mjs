// The partner adult day health care center (ADHC) as a schema 2.0 facility
// specification: writes public/models/seen-partner-adhc.json.
//
//   node scripts/build-partner-adhc.mjs            # write the specification
//   node scripts/build-partner-adhc.mjs --check    # fail if the file differs
//
// Deterministic data: no randomness, numbers rounded, formatted like
// scripts/prepare-public-models.mjs writes public models (2-space JSON and a
// newline), so a build never rewrites it. Checked by
// scripts/validate-partner-adhc.mjs (`npm run validate:partner-adhc`).
//
// Plan frame P: metres, origin at the centre of the hall's width and the
// building's depth, +x to the right seen from the drive, +z toward the drive
// (the front), y = 0 the finished floor. The partner-adc registry entry
// (app/model/community-settings.ts) stamps it with frame
// { position: [0, -6.6], heading: 0 }, so P is the pad's local frame shifted
// 6.6 m back.
//
// Layout (one storey, 483.8 m² gross): a 13.1 m wide hall through the depth
// of the building, its stage across the back, between two wings of smaller
// rooms (light rehab and classroom to the west, studio and group room to the
// east), and an entry pavilion at the front with the reception between two
// accessible restrooms. Every room opens off the hall.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'public/models/seen-partner-adhc.json';

const r3 = (v) => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r;
};
const r6 = (v) => {
  const r = Math.round(v * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};
const pt = (p) => p.map(r3);
const PI = Math.PI;
const rect = (x0, z0, x1, z1) => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];
const area = (poly) =>
  Math.abs(
    poly.reduce(
      (a, p, i) =>
        a + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1],
      0,
    ),
  ) / 2;
const SQFT = 0.09290304;

const STATUS = 'Illustrative design (ADHC-PLAN study); not a surveyed building';
const STUDY = [1];

// --- Geometry (plan frame P) --------------------------------------------------
const EXT = 0.2; // exterior walls
const PART = 0.12; // partitions
const HALL = { x: 6.6, back: -11.2, front: 6.6 }; // wall centre lines
const WING = { x: 12.0 }; // exterior side walls (centre lines)
const ENTRY = { x: 6.6, front: 10.2 }; // entry pavilion walls (centre lines)
const MID = { west: -2.0, east: 0.0 }; // wing partitions between rooms
const ENTRY_PART = 3.0; // reception / restroom partitions at x = ±3.0
const STAGE = { front: -7.5, deck: 0.4 }; // stage front edge (z) and deck height
const RAMP = { foot: -0.2, landing: 1.54, width: 1.5 }; // the ramp along the stage front
const STEPS = { x0: 1.9, x1: 3.3, depth: 0.9 }; // the stage steps
const ROWS = [1.3, 4.4]; // long-table rows (table centre lines, z)
const TABLE = { w: 2.44, d: 0.76, top: 0.76, h: 0.88 };
const PITCH = 0.61; // banquet seat pitch
const SIDE = 0.68; // chair centre to the row's centre line
const END = TABLE.w * 1.5 + 0.3; // end chair centre from the row's centre (x)

// Interior faces.
const fi = {
  hallX: HALL.x - PART / 2, // 6.54
  wingX: HALL.x + PART / 2, // 6.66
  outX: WING.x - EXT / 2, // 11.9
  back: HALL.back + EXT / 2, // -11.1
  hallFront: HALL.front - PART / 2, // 6.54
  wingFront: HALL.front - EXT / 2, // 6.5
  entryBack: HALL.front + PART / 2, // 6.66
  entryFront: ENTRY.front - EXT / 2, // 10.1
  entryX: ENTRY.x - EXT / 2, // 6.5
};

// --- Materials ----------------------------------------------------------------
// The partner's own palette: terracotta stucco, warm plaster, honey wood,
// cinnabar red, jade and gold. Every id is `adhc-*` (or a shared fixture
// finish the reused asset kinds name), so the presentation palette, which
// re-colours Seen's own ids (wall, wood, oak, table, chair …), leaves them as
// specified here.
const materials = {
  'adhc-stucco': { color: '#d7a283', roughness: 0.9 },
  'adhc-plaster': { color: '#efdcc7', roughness: 0.9 },
  'adhc-hall-floor': { color: '#cfa775', roughness: 0.6, pattern: 'plank' },
  'adhc-terrazzo': { color: '#eadccb', roughness: 0.55, pattern: 'mosaic' },
  'adhc-restroom-tile': { color: '#cbded3', roughness: 0.5, pattern: 'tile' },
  'adhc-studio-floor': { color: '#e0c493', roughness: 0.62, pattern: 'plank' },
  'adhc-class-carpet': { color: '#a6bbad', roughness: 1, pattern: 'carpet' },
  'adhc-group-carpet': { color: '#c99f8b', roughness: 1, pattern: 'carpet' },
  'adhc-rehab-floor': { color: '#8fb19e', roughness: 0.85 },
  'adhc-honey': { color: '#c78f4f', roughness: 0.5 },
  'adhc-honey-dark': { color: '#9b6a38', roughness: 0.6 },
  'adhc-cinnabar': { color: '#ab443a', roughness: 0.8 },
  'adhc-cinnabar-deep': { color: '#86322e', roughness: 0.85 },
  'adhc-gold': { color: '#d2a24c', roughness: 0.38, metalness: 0.35 },
  'adhc-jade': { color: '#5f9b84', roughness: 0.7 },
  'adhc-jade-light': { color: '#a6c8b6', roughness: 0.7 },
  'adhc-terracotta': { color: '#c4795a', roughness: 0.8 },
  'adhc-sky': { color: '#8fb3c9', roughness: 0.7 },
  'adhc-leaf': { color: '#7f9c5a', roughness: 0.8 },
  'adhc-cloth-red': { color: '#b34a3d', roughness: 0.88 },
  'adhc-runner-gold': { color: '#d9b45f', roughness: 0.6 },
  'adhc-lacquer': { color: '#2b2422', roughness: 0.3 },
  'adhc-lantern': {
    color: '#d6553f',
    roughness: 0.8,
    emissive: '#ff7a45',
    emissiveIntensity: 0.45,
  },
  'adhc-paper': { color: '#f6efdf', roughness: 0.9 },
  'adhc-canvas': { color: '#f3ede0', roughness: 0.9 },
  'adhc-ink': { color: '#26221f', roughness: 0.6 },
  'adhc-walnut': { color: '#6f4a30', roughness: 0.6 },
  'adhc-felt': { color: '#3f4a45', roughness: 1 },
  'adhc-board': { color: '#f6f6f1', roughness: 0.25 },
  'adhc-riser-carpet': { color: '#4f5d58', roughness: 1 },
  'adhc-dance-a': { color: '#d49b5b', roughness: 0.45 },
  'adhc-dance-b': { color: '#b67b42', roughness: 0.45 },
  'adhc-birch': { color: '#e8d4ae', roughness: 0.55 },
  'adhc-door': { color: '#c78f4f', roughness: 0.5 },
  'adhc-mat': { color: '#4f8a76', roughness: 0.8 },
  // Shared fixture finishes named by the reused kinds (doors, rehab, toilets).
  'photo-white': { color: '#f5f3ea', roughness: 0.55 },
  'photo-silver': { color: '#c5c9c9', roughness: 0.35, metalness: 0.68 },
  'photo-black': { color: '#242b2c', roughness: 0.55 },
  'photo-mosaic': { color: '#f1eadc', roughness: 0.75 },
  'photo-blue-grey': { color: '#a1b8b6', roughness: 0.65 },
  'photo-teal': { color: '#57adbc', roughness: 0.65 },
  'photo-red-cart': { color: '#b4675c', roughness: 0.6 },
  'photo-mustard': { color: '#c4a146', roughness: 0.65 },
  'photo-blue-seat': { color: '#9ec6cb', roughness: 0.83 },
  porcelain: { color: '#eeeedd', roughness: 0.32 },
  metal: { color: '#b2bbb8', roughness: 0.4, metalness: 0.6 },
  oak: { color: '#ddbd85', roughness: 0.65 },
  screen: { color: '#14252b', roughness: 0.4 },
  concrete: { color: '#c5c8c2', roughness: 0.95 },
  leaf: { color: '#7f9a6a', roughness: 0.95 },
  blue: { color: '#39789e', roughness: 0.8 },
  glass: { color: '#7fabb7', roughness: 0.22, metalness: 0.15, opacity: 0.62 },
};

// --- Assets ---------------------------------------------------------------------
// `name` is the human name inspect cards fall back to; `parameters.front`
// documents where people sit, stand or face (app/model/adhc-assets.ts).
const assets = {
  'adhc-stage-platform': {
    name: 'Stage platform',
    kind: 'stage-platform',
    dimensions: [2 * fi.hallX, STAGE.deck, STAGE.front - fi.back],
    material: 'adhc-honey',
    materials: { skirt: 'adhc-cinnabar', trim: 'adhc-gold', frame: 'adhc-lacquer' },
    parameters: {
      standing: 'deck',
      deck: STAGE.deck,
      front: 'audience side (pleated skirt, gold nosing) at local +z; performers stand on the deck',
    },
  },
  'adhc-stage-ramp': {
    name: 'Stage ramp (1:12) with top landing',
    kind: 'stage-ramp',
    dimensions: [RAMP.width, STAGE.deck + 0.92, RAMP.landing + STAGE.deck * 12],
    material: 'adhc-honey',
    materials: { rail: 'photo-silver' },
    parameters: {
      standing: 'ramp',
      rise: STAGE.deck,
      landing: RAMP.landing,
      front: 'high end and landing at local -z, foot at +z; handrail and kick edge on the open side (-x), the stage face along +x',
    },
  },
  'adhc-stage-steps': {
    name: 'Stage steps',
    kind: 'stage-steps',
    dimensions: [STEPS.x1 - STEPS.x0, STAGE.deck + 0.92, STEPS.depth],
    material: 'adhc-honey',
    parameters: {
      standing: 'steps',
      rise: STAGE.deck,
      risers: 3,
      centerRail: true,
      front: 'top step at local -z (the deck), foot at +z; three handrails make two 0.64 m lanes',
    },
  },
  'adhc-stage-backdrop': {
    name: 'Stage backdrop with lantern valance',
    kind: 'stage-backdrop',
    dimensions: [9.2, 2.7, 0.3],
    material: 'adhc-cinnabar',
    parameters: { front: 'curtain, banners and lanterns face the audience at local +z' },
  },
  'adhc-choir-riser': {
    name: 'Choir risers (3 tiers)',
    kind: 'choir-riser',
    dimensions: [4.8, 0.6, 1.8],
    material: 'adhc-riser-carpet',
    parameters: {
      standing: 'tiers',
      tiers: 3,
      tierRise: 0.2,
      front: 'lowest tier at local +z (the audience); singers face +z',
    },
  },
  'adhc-lectern': {
    name: 'Lectern',
    kind: 'lectern',
    dimensions: [0.6, 1.18, 0.5],
    material: 'adhc-honey',
    parameters: { front: 'audience face (medallion) at local +z; the speaker stands at -z' },
  },
  'adhc-mic-stand': {
    name: 'Microphone stand',
    kind: 'mic-stand',
    dimensions: [0.32, 1.55, 0.55],
    material: 'photo-black',
    parameters: { front: 'boom toward the singer at local +z' },
  },
  'adhc-speaker': {
    name: 'Tower speaker',
    kind: 'tower-speaker',
    dimensions: [0.32, 1.05, 0.3],
    material: 'adhc-lacquer',
    parameters: { front: 'drivers at local +z' },
  },
  'adhc-upright-piano': {
    name: 'Upright piano',
    kind: 'upright-piano',
    dimensions: [1.5, 1.25, 0.62],
    material: 'adhc-lacquer',
    parameters: { front: 'keyboard at local +z; the pianist sits at +z facing -z' },
  },
  'adhc-piano-bench': {
    name: 'Piano bench',
    kind: 'piano-bench',
    dimensions: [0.8, 0.5, 0.38],
    material: 'adhc-cinnabar',
    parameters: { front: 'seat faces local -z (the keyboard)' },
  },
  'adhc-banquet-table': {
    name: 'Banquet table (8 ft) with tablecloth',
    kind: 'banquet-table',
    dimensions: [TABLE.w, TABLE.h, TABLE.d],
    material: 'adhc-cloth-red',
    parameters: {
      top: TABLE.top,
      front: 'used from both long sides and the ends; the declared height includes the centrepieces',
    },
  },
  'adhc-banquet-chair': {
    name: 'Banquet chair',
    kind: 'banquet-chair',
    dimensions: [0.45, 0.88, 0.52],
    material: 'adhc-jade',
    parameters: { seatHeight: 0.46, front: 'seat faces local -z; ladder back at +z' },
  },
  'adhc-dance-floor': {
    name: 'Dance floor inlay',
    kind: 'dance-floor',
    dimensions: [9.2, 0.012, 5.2],
    material: 'adhc-dance-a',
    parameters: { border: 0.3, tile: 0.6, front: 'flush parquet inlay, used from every side' },
  },
  'adhc-lantern-post': {
    name: 'Lantern post',
    kind: 'lantern-post',
    dimensions: [0.44, 2.4, 0.7],
    material: 'adhc-lacquer',
    parameters: { front: 'the arm and its paper lantern reach toward local +z' },
  },
  'adhc-bingo-board': {
    name: 'Bingo flashboard',
    kind: 'bingo-board',
    dimensions: [1.6, 1.9, 0.5],
    material: 'adhc-lacquer',
    parameters: { front: 'number grid faces the players at local +z' },
  },
  'adhc-bingo-caller': {
    name: "Bingo caller's stand",
    kind: 'bingo-caller',
    dimensions: [0.9, 1.15, 0.6],
    material: 'adhc-honey',
    parameters: { front: 'players at local +z; the caller stands at -z or beside it' },
  },
  'adhc-calligraphy-table': {
    name: 'Calligraphy table',
    kind: 'calligraphy-table',
    dimensions: [2.4, 1.05, 0.9],
    material: 'adhc-walnut',
    parameters: {
      top: 0.74,
      placesPerSide: 3,
      front: 'places (felt, paper, ink stone) along both long sides, local ±z; brush rack down the middle',
    },
  },
  'adhc-brush-stand': {
    name: 'Brush and ink stand',
    kind: 'brush-stand',
    dimensions: [0.9, 1.1, 0.45],
    material: 'adhc-walnut',
    parameters: { front: 'cabinet doors and the brush rack face local +z' },
  },
  'adhc-easel': {
    name: 'Studio easel with canvas',
    kind: 'easel',
    dimensions: [0.7, 1.75, 0.7],
    material: 'adhc-honey',
    parameters: { front: 'canvas faces the painter at local +z' },
  },
  'adhc-drying-rack': {
    name: 'Painting drying rack',
    kind: 'drying-rack',
    dimensions: [0.9, 1.5, 0.55],
    material: 'photo-silver',
    parameters: { shelves: 8, front: 'shelves load from local +z' },
  },
  'adhc-scroll-display': {
    name: 'Hanging scroll display',
    kind: 'scroll-display',
    dimensions: [2.0, 1.8, 0.45],
    material: 'adhc-honey',
    parameters: { scrolls: 3, front: 'scrolls face local +z' },
  },
  'adhc-whiteboard': {
    name: 'Mobile whiteboard',
    kind: 'whiteboard',
    dimensions: [1.8, 1.85, 0.6],
    material: 'adhc-board',
    parameters: { front: 'writing surface faces the class at local +z' },
  },
  'adhc-recumbent-bike': {
    name: 'Recumbent exercise bike',
    kind: 'recumbent-bike',
    dimensions: [0.65, 1.15, 1.6],
    material: 'adhc-jade',
    parameters: { front: 'rider sits at local -z facing the pedals and console at +z' },
  },
  'adhc-band-wall': {
    name: 'Resistance-band wall',
    kind: 'band-wall',
    dimensions: [2.2, 1.9, 0.3],
    material: 'adhc-jade',
    parameters: { front: 'bands and shelf face the room at local +z' },
  },
  'adhc-practice-stair': {
    name: 'Practice stair',
    kind: 'practice-stair',
    dimensions: [0.85, 1.35, 1.5],
    material: 'adhc-honey',
    parameters: {
      standing: 'steps',
      rise: 0.45,
      risers: 3,
      platform: 0.6,
      front: 'platform at local -z, foot at +z; handrails both sides',
    },
  },
  'adhc-reception-desk': {
    name: 'Reception desk',
    kind: 'reception-desk',
    dimensions: [1.6, 1.05, 0.7],
    material: 'adhc-cinnabar',
    parameters: { front: 'visitors at local +z (the ledge); the receptionist sits at -z' },
  },
  // Reused kinds, in the partner's finishes.
  'adhc-rehab-bars': {
    name: 'Parallel bars',
    kind: 'rehab-bars',
    dimensions: [1.35, 0.92, 3.65],
    material: 'photo-silver',
    parameters: { front: 'walk between the rails along local z' },
  },
  'adhc-mat-table': {
    name: 'Mat table',
    kind: 'rehab-plinth',
    dimensions: [1.2, 0.55, 2.0],
    material: 'adhc-mat',
  },
  'adhc-rehab-rack': {
    name: 'Weights and bands rack',
    kind: 'rehab-rack',
    dimensions: [0.64, 1.82, 0.6],
    material: 'adhc-jade',
  },
  'adhc-chair': {
    name: 'Stacking chair',
    kind: 'chair',
    dimensions: [0.46, 0.84, 0.5],
    material: 'adhc-jade',
    parameters: { front: 'seat faces local -z' },
  },
  'adhc-class-table': {
    name: 'Classroom table (2 places)',
    kind: 'table',
    dimensions: [1.4, 0.74, 0.6],
    material: 'adhc-birch',
  },
  'adhc-armchair': {
    name: 'Group-room armchair',
    kind: 'lounge-chair',
    dimensions: [0.66, 1.0, 0.76],
    material: 'adhc-terracotta',
    materials: { wood: 'adhc-honey', metal: 'adhc-honey' },
    parameters: { front: 'seat faces local -z' },
  },
  'adhc-side-table': {
    name: 'Low round table',
    kind: 'round-table',
    dimensions: [0.6, 0.45, 0.6],
    material: 'adhc-honey',
  },
  'adhc-waiting-chair': {
    name: 'Waiting chair',
    kind: 'upholstered-chair',
    dimensions: [0.55, 0.9, 0.57],
    material: 'adhc-jade',
    materials: { wood: 'adhc-honey', metal: 'adhc-gold' },
    parameters: { front: 'seat faces local -z' },
  },
  'adhc-desk-chair': {
    name: 'Desk chair',
    kind: 'task-chair',
    dimensions: [0.6, 0.98, 0.6],
    material: 'adhc-jade',
    parameters: { front: 'seat faces local -z' },
  },
  'adhc-planter': {
    name: 'Planter',
    kind: 'planter',
    dimensions: [0.6, 1.4, 0.6],
    material: 'adhc-terracotta',
  },
  toilet: {
    name: 'Toilet',
    kind: 'toilet',
    dimensions: [0.46, 0.74, 0.69],
    material: 'porcelain',
  },
  basin: {
    name: 'Wall-hung basin (roll-under)',
    kind: 'basin',
    dimensions: [0.6, 0.85, 0.5],
    material: 'porcelain',
  },
  'adhc-grab-bar-42': {
    name: 'Grab bar (42 in)',
    kind: 'grab-bar',
    dimensions: [1.07, 0.08, 0.08],
    material: 'photo-silver',
    parameters: { orientation: 'horizontal', front: 'wall plane at local -z' },
  },
  'adhc-grab-bar-36': {
    name: 'Grab bar (36 in)',
    kind: 'grab-bar',
    dimensions: [0.915, 0.08, 0.08],
    material: 'photo-silver',
    parameters: { orientation: 'horizontal', front: 'wall plane at local -z' },
  },
};

// --- Zones and rooms ------------------------------------------------------------
const zoneBase = (id, name, short, color, polygon, floorMaterial, height, notes) => ({
  id,
  name,
  short,
  color,
  levelId: 'ground',
  polygon: polygon.map(pt),
  referencePages: STUDY,
  floorMaterial,
  notes,
  publishedAreaSqFt: null,
  tracedFootprintSqFt: Math.round((area(polygon) / SQFT) * 10) / 10,
  programId: 'adhc',
  wallHeight: height,
  wallHeightStatus: `Nominal ${height} m; illustrative`,
  geometryStatus: STATUS,
  spread: [0, 0],
});
const zones = [
  zoneBase(
    'adhc-zone-hall',
    'Multipurpose hall and stage',
    'Hall',
    '#b5503f',
    rect(-HALL.x, HALL.back - EXT / 2, HALL.x, HALL.front + EXT / 2),
    'adhc-hall-floor',
    4.2,
    'The heart of the center: long banquet tables, an open dance floor and the stage across the back, the full depth of the building. The polygon follows the outer face of the back wall and the centre lines of the side partitions.',
  ),
  zoneBase(
    'adhc-zone-west',
    'West wing: light rehab and classroom',
    'West wing',
    '#5f9b84',
    rect(-WING.x - EXT / 2, HALL.back - EXT / 2, -HALL.x, HALL.front + EXT / 2),
    'adhc-hall-floor',
    3.2,
    'Light rehab at the back, the classroom at the front; both open off the hall.',
  ),
  zoneBase(
    'adhc-zone-east',
    'East wing: studio and group room',
    'East wing',
    '#d2a24c',
    rect(HALL.x, HALL.back - EXT / 2, WING.x + EXT / 2, HALL.front + EXT / 2),
    'adhc-hall-floor',
    3.2,
    'The calligraphy and painting studio at the back, the group room at the front; both open off the hall.',
  ),
  zoneBase(
    'adhc-zone-entry',
    'Entry pavilion: reception and restrooms',
    'Entry',
    '#c4795a',
    rect(-ENTRY.x - EXT / 2, HALL.front + EXT / 2, ENTRY.x + EXT / 2, ENTRY.front + EXT / 2),
    'adhc-terrazzo',
    3.2,
    'The front door opens into the reception, which opens into the hall; an accessible restroom on either side opens off the hall.',
  ),
];
const room = (id, name, zoneId, polygon, kind, floorMaterial, notes) => ({
  id,
  name,
  zoneId,
  levelId: 'ground',
  polygon: polygon.map(pt),
  kind,
  referencePages: STUDY,
  status: STATUS,
  notes,
  ...(floorMaterial ? { floorMaterial } : {}),
});
const rooms = [
  room(
    'adhc-hall',
    'Multipurpose hall',
    'adhc-zone-hall',
    rect(-fi.hallX, STAGE.front, fi.hallX, fi.hallFront),
    'multipurpose',
    'adhc-hall-floor',
    'Two rows of long banquet tables (6 × 8 ft, 49 banquet chairs and 3 wheelchair places at the table ends) for meals, bingo and large groups; a 9.2 × 5.2 m patterned dance floor for line and fan dancing; the ramp and steps up to the stage; lantern posts at the dance floor corners; the bingo flashboard and the caller’s stand on the west side.',
  ),
  room(
    'adhc-stage',
    'Stage',
    'adhc-zone-hall',
    rect(-fi.hallX, fi.back, fi.hallX, STAGE.front),
    'stage',
    null,
    'Raised 0.40 m honey-wood stage across the back of the hall: backdrop with a lantern valance, three-tier choir risers, lectern, microphone, upright piano and two speakers. Step-free by the 1:12 ramp and its top landing along the front (west), or by three steps with three handrails (east).',
  ),
  room(
    'adhc-rehab',
    'Light rehab',
    'adhc-zone-west',
    rect(-fi.outX, fi.back, -fi.wingX, MID.west - PART / 2),
    'rehab',
    'adhc-rehab-floor',
    'Parallel bars, two recumbent bikes, a mat table, a resistance-band wall, a practice stair, a weights and bands rack and chairs for seated strength; the visiting Seen physical therapist works here.',
  ),
  room(
    'adhc-classroom',
    'Classroom',
    'adhc-zone-west',
    rect(-fi.outX, MID.west + PART / 2, -fi.wingX, fi.wingFront),
    'classroom',
    'adhc-class-carpet',
    'Six two-place tables in three rows facing a mobile whiteboard on the front wall; one place is left open for a wheelchair.',
  ),
  room(
    'adhc-studio',
    'Calligraphy and painting studio',
    'adhc-zone-east',
    rect(fi.wingX, fi.back, fi.outX, MID.east - PART / 2),
    'studio',
    'adhc-studio-floor',
    'Two calligraphy tables laid with felt, rice paper, ink stones and brush racks; a brush and ink stand; a hanging scroll display; four easels along the east wall and a drying rack by the door.',
  ),
  room(
    'adhc-group-room',
    'Group room',
    'adhc-zone-east',
    rect(fi.wingX, MID.east + PART / 2, fi.outX, fi.wingFront),
    'group-room',
    'adhc-group-carpet',
    'A circle of eight armchairs (one place open for a wheelchair) around a low table, for classes and group therapy sessions.',
  ),
  room(
    'adhc-reception',
    'Entry and reception',
    'adhc-zone-entry',
    rect(-(ENTRY_PART - PART / 2), fi.entryBack, ENTRY_PART - PART / 2, fi.entryFront),
    'reception',
    'adhc-terrazzo',
    'Double front doors, the reception desk on the west side, three waiting chairs and a planter on the east side, and double doors into the hall.',
  ),
  room(
    'adhc-restroom-w',
    'Accessible restroom (west)',
    'adhc-zone-entry',
    rect(-fi.entryX, fi.entryBack, -(ENTRY_PART + PART / 2), fi.entryFront),
    'restroom',
    'adhc-restroom-tile',
    'Single-user accessible restroom off the hall: toilet with side and rear grab bars, roll-under basin, 1.5 m turning circle.',
  ),
  room(
    'adhc-restroom-e',
    'Accessible restroom (east)',
    'adhc-zone-entry',
    rect(ENTRY_PART + PART / 2, fi.entryBack, fi.entryX, fi.entryFront),
    'restroom',
    'adhc-restroom-tile',
    'Mirror of the west restroom.',
  ),
];

// --- Walls ------------------------------------------------------------------------
// A run is one straight wall line; door gaps split it into segments -a, -b, …
// (a run without gaps is one wall). Gap centres lie on the 0.2 m navigation
// grid so a door passes a wheelchair (0.37 m clearance) straight through.
const walls = [];
const doorSchedule = [];
const objects = [];
/** Wall run along x (at z = line) or along z (at x = line), from `from` to `to`, minus `gaps`. */
function run(id, zoneId, axis, line, from, to, gaps, thickness, height, what) {
  const material = thickness >= EXT ? 'adhc-stucco' : 'adhc-plaster';
  const cuts = [...gaps].sort((a, b) => a[0] - b[0]);
  const spans = [];
  let s = from;
  for (const [g0, g1] of cuts) {
    spans.push([s, g0]);
    s = g1;
  }
  spans.push([s, to]);
  spans.forEach(([a, b], i) => {
    const seg = spans.length > 1 ? `${id}-${'abcdefgh'[i]}` : id;
    walls.push({
      id: seg,
      zoneId,
      levelId: 'ground',
      a: pt(axis === 'x' ? [a, line] : [line, a]),
      b: pt(axis === 'x' ? [b, line] : [line, b]),
      height,
      thickness,
      material,
      status: `${what} · ${STATUS}`,
      referencePages: STUDY,
    });
  });
}
const DOORS = {
  rehab: [-4.5, -3.5],
  classroom: [-0.5, 0.5],
  studio: [-3.5, -2.5],
  group: [2.7, 3.7],
  restroomW: [-5.3, -4.3],
  hallDoors: [-0.9, 0.9],
  restroomE: [4.3, 5.3],
  entrance: [-0.9, 0.9],
};
const back = HALL.back,
  front = HALL.front;
run('adhc-wall-back-west', 'adhc-zone-west', 'x', back, -WING.x - EXT / 2, -HALL.x, [], EXT, 3.2, 'Exterior wall, back (west wing)');
run('adhc-wall-back-hall', 'adhc-zone-hall', 'x', back, -HALL.x, HALL.x, [], EXT, 4.2, 'Exterior wall, back of the stage');
run('adhc-wall-back-east', 'adhc-zone-east', 'x', back, HALL.x, WING.x + EXT / 2, [], EXT, 3.2, 'Exterior wall, back (east wing)');
run('adhc-wall-west', 'adhc-zone-west', 'z', -WING.x, back - EXT / 2, front + EXT / 2, [], EXT, 3.2, 'Exterior wall, west side');
run('adhc-wall-east', 'adhc-zone-east', 'z', WING.x, back - EXT / 2, front + EXT / 2, [], EXT, 3.2, 'Exterior wall, east side');
run('adhc-wall-front-west', 'adhc-zone-west', 'x', front, -WING.x - EXT / 2, -HALL.x, [], EXT, 3.2, 'Exterior wall, front of the west wing (faces the drive)');
run('adhc-wall-front-east', 'adhc-zone-east', 'x', front, HALL.x, WING.x + EXT / 2, [], EXT, 3.2, 'Exterior wall, front of the east wing (faces the drive)');
run('adhc-wall-entry-west', 'adhc-zone-entry', 'z', -ENTRY.x, front, ENTRY.front + EXT / 2, [], EXT, 3.2, 'Exterior wall, entry pavilion west side');
run('adhc-wall-entry-east', 'adhc-zone-entry', 'z', ENTRY.x, front, ENTRY.front + EXT / 2, [], EXT, 3.2, 'Exterior wall, entry pavilion east side');
run('adhc-wall-entry-front', 'adhc-zone-entry', 'x', ENTRY.front, -ENTRY.x - EXT / 2, ENTRY.x + EXT / 2, [DOORS.entrance], EXT, 3.2, 'Exterior wall, entry front with the double front doors (faces the drive)');
run('adhc-wall-hall-west', 'adhc-zone-hall', 'z', -HALL.x, back, front, [DOORS.rehab, DOORS.classroom], PART, 3.2, 'Partition: hall / west wing');
run('adhc-wall-hall-east', 'adhc-zone-hall', 'z', HALL.x, back, front, [DOORS.studio, DOORS.group], PART, 3.2, 'Partition: hall / east wing');
run('adhc-wall-hall-front', 'adhc-zone-hall', 'x', front, -HALL.x, HALL.x, [DOORS.restroomW, DOORS.hallDoors, DOORS.restroomE], PART, 3.2, 'Partition: hall / entry pavilion');
run('adhc-wall-west-mid', 'adhc-zone-west', 'x', MID.west, -fi.outX, -fi.wingX, [], PART, 3.2, 'Partition: light rehab / classroom');
run('adhc-wall-east-mid', 'adhc-zone-east', 'x', MID.east, fi.wingX, fi.outX, [], PART, 3.2, 'Partition: studio / group room');
run('adhc-wall-entry-p-west', 'adhc-zone-entry', 'z', -ENTRY_PART, fi.entryBack, fi.entryFront, [], PART, 3.2, 'Partition: west restroom / reception');
run('adhc-wall-entry-p-east', 'adhc-zone-entry', 'z', ENTRY_PART, fi.entryBack, fi.entryFront, [], PART, 3.2, 'Partition: reception / east restroom');

// --- Objects ----------------------------------------------------------------------
function place(id, assetId, roomId, zoneId, [x, y, z], rotation, extra = {}) {
  const { notes = '', layer = 'furniture', refs = STUDY, ...rest } = extra;
  objects.push({
    id,
    assetId,
    zoneId,
    levelId: 'ground',
    position: [r3(x), r3(y), r3(z)],
    rotation: r6(rotation),
    scale: [1, 1, 1],
    roomId,
    referencePages: refs,
    status: STATUS,
    notes,
    layer,
    ...rest,
  });
}
const H = 'adhc-zone-hall',
  W = 'adhc-zone-west',
  E = 'adhc-zone-east',
  N = 'adhc-zone-entry';

// Hall: the stage, its ramp and steps.
const stageD = STAGE.front - fi.back,
  stageZ = (STAGE.front + fi.back) / 2,
  strip = 0.08;
place('adhc-stage-platform', 'adhc-stage-platform', 'adhc-stage', H, [0, 0, stageZ], 0, {
  notes: 'Raised 0.40 m stage across the back of the hall. Its navigation footprints are the front edge only (performers walk on the deck): open where the ramp landing meets it (x -6.54…-5.0) and at the steps (x 1.9…3.3).',
  navigationFootprints: [
    [r3((-5.0 + STEPS.x0) / 2), r3(stageD / 2 - strip / 2), r3(STEPS.x0 + 5.0), strip],
    [r3((STEPS.x1 + fi.hallX) / 2), r3(stageD / 2 - strip / 2), r3(fi.hallX - STEPS.x1), strip],
  ],
});
const rampLen = RAMP.landing + STAGE.deck * 12,
  rampX = RAMP.foot - rampLen / 2,
  rampZ = STAGE.front + RAMP.width / 2;
place('adhc-stage-ramp', 'adhc-stage-ramp', 'adhc-hall', H, [rampX, 0, rampZ], PI / 2, {
  notes: 'Step-free route to the stage: a 1:12 slope (0.40 m over 4.8 m) along the stage front rising west to a 1.54 × 1.5 m landing level with the deck. Navigation footprint: the handrail on the open side; the stage edge is the other curb.',
  navigationFootprints: [[r3(-RAMP.width / 2 + 0.06), 0, 0.06, r3(rampLen)]],
  refs: [1, 4],
});
place('adhc-stage-steps', 'adhc-stage-steps', 'adhc-hall', H, [(STEPS.x0 + STEPS.x1) / 2, 0, STAGE.front + STEPS.depth / 2], 0, {
  notes: 'Three 0.133 m risers with side and centre handrails: two 0.64 m lanes for walking performers. Walkers and wheelchairs take the ramp.',
  navigationFootprints: [-0.675, 0, 0.675].map((x) => [x, 0, 0.04, STEPS.depth]),
  refs: [1, 4],
});
// On the stage deck (y = deck).
const deckY = STAGE.deck;
place('adhc-stage-backdrop', 'adhc-stage-backdrop', 'adhc-stage', H, [0, deckY, fi.back + 0.15], 0, {
  notes: 'Curtain backdrop with banners and a valance of paper lanterns.',
});
place('adhc-choir-riser', 'adhc-choir-riser', 'adhc-stage', H, [0, deckY, -9.85], 0, {
  notes: 'Three tiers 0.20 m high and 0.60 m deep: the choir stands on them (standing surfaces), so it has no navigation footprint.',
  navigationFootprints: [],
});
place('adhc-stage-lectern', 'adhc-lectern', 'adhc-stage', H, [-3.6, deckY, -8.3], 0);
place('adhc-stage-mic', 'adhc-mic-stand', 'adhc-stage', H, [0, deckY, -8.05], PI, {
  notes: 'Soloist microphone in front of the risers; the boom points back toward the singer.',
});
place('adhc-stage-speaker-w', 'adhc-speaker', 'adhc-stage', H, [-5.6, deckY, fi.back + 0.2], 0);
place('adhc-stage-speaker-e', 'adhc-speaker', 'adhc-stage', H, [5.0, deckY, fi.back + 0.2], 0);
place('adhc-stage-piano', 'adhc-upright-piano', 'adhc-stage', H, [fi.hallX - 0.31, deckY, -9.6], -PI / 2, {
  notes: 'Against the east wall, keyboard facing west: the pianist plays in profile to the hall.',
});
place('adhc-stage-piano-bench', 'adhc-piano-bench', 'adhc-stage', H, [fi.hallX - 0.62 - 0.54, deckY, -9.6], -PI / 2);

// Hall floor: dance floor, lantern posts, long tables, bingo.
place('adhc-dance-floor', 'adhc-dance-floor', 'adhc-hall', H, [0, 0, -3.0], 0, {
  layer: 'architecture',
  notes: 'Flush parquet inlay (checker of two honey tones, cinnabar border, jade-and-gold medallion): room for 15 line dancers at 1.4 × 1.2 m.',
  refs: [1, 6],
});
for (const [id, x, z] of [
  ['adhc-lantern-post-sw', -5.25, -5.2],
  ['adhc-lantern-post-nw', -5.25, -0.8],
  ['adhc-lantern-post-se', 5.25, -5.2],
  ['adhc-lantern-post-ne', 5.25, -0.8],
])
  place(id, 'adhc-lantern-post', 'adhc-hall', H, [x, 0, z], x < 0 ? PI / 2 : -PI / 2, {
    notes: 'Paper lantern on a lacquered post at a corner of the dance floor (in place of pendants, which would float over the cutaway).',
  });
// A banquet chair keeps walkers 0.25 m further off its back than its frame:
// the chair pushed out and the seated person's back.
const CHAIR_NAV = [[0, 0.125, 0.45, 0.77]];
ROWS.forEach((rz, r) => {
  const row = 'ab'[r];
  [-TABLE.w, 0, TABLE.w].forEach((x, i) =>
    place(`adhc-table-${row}${i + 1}`, 'adhc-banquet-table', 'adhc-hall', H, [x, 0, rz], 0, {
      notes: i === 1 ? 'Middle of a long table of three 8 ft tables under red cloths and a gold runner.' : '',
      refs: [1, 5],
    }),
  );
  for (let k = 0; k < 12; k++) {
    const x = -5.5 * PITCH + k * PITCH;
    place(`adhc-chair-${row}1-${String(k + 1).padStart(2, '0')}`, 'adhc-banquet-chair', 'adhc-hall', H, [x, 0, rz - SIDE], PI, {
      navigationFootprints: CHAIR_NAV,
    });
    place(`adhc-chair-${row}2-${String(k + 1).padStart(2, '0')}`, 'adhc-banquet-chair', 'adhc-hall', H, [x, 0, rz + SIDE], 0, {
      navigationFootprints: CHAIR_NAV,
    });
  }
  // Table ends: the partner-adc registry leaves out both of row a's and the
  // west end of row b, as wheelchair places.
  const wheelchairPlace = 'Table-end place; the partner-adc registry entry leaves this chair out for a wheelchair.';
  place(`adhc-chair-${row}-west`, 'adhc-banquet-chair', 'adhc-hall', H, [-END, 0, rz], -PI / 2, {
    notes: wheelchairPlace,
    navigationFootprints: CHAIR_NAV,
  });
  place(`adhc-chair-${row}-east`, 'adhc-banquet-chair', 'adhc-hall', H, [END, 0, rz], PI / 2, {
    notes: row === 'a' ? wheelchairPlace : '',
    navigationFootprints: CHAIR_NAV,
  });
});
place('adhc-bingo-board', 'adhc-bingo-board', 'adhc-hall', H, [-fi.hallX + 0.3, 0, 2.8], PI / 2, {
  notes: 'Bingo flashboard facing the long tables from the west aisle.',
});
place('adhc-bingo-caller', 'adhc-bingo-caller', 'adhc-hall', H, [-fi.hallX + 0.36, 0, 1.25], PI / 2, {
  notes: 'Against the west wall below the flashboard, clear of the aisle; the caller stands beside it facing the players.',
});

// Light rehab.
place('adhc-rehab-bars', 'adhc-rehab-bars', 'adhc-rehab', W, [-9.3, 0, -7.4], 0, {
  navigationFootprints: [
    [-0.5265, 0, 0.12, 3.65],
    [0.5265, 0, 0.12, 3.65],
  ],
  notes: 'Walkable between the rails (navigation footprints are the rails).',
  refs: [1, 7],
});
place('adhc-rehab-mat-table', 'adhc-mat-table', 'adhc-rehab', W, [-fi.outX + 0.65, 0, -9.9], 0, { refs: [1, 7] });
place('adhc-rehab-bike-1', 'adhc-recumbent-bike', 'adhc-rehab', W, [-8.3, 0, -10.2], 0, { refs: [1, 7] });
place('adhc-rehab-bike-2', 'adhc-recumbent-bike', 'adhc-rehab', W, [-7.4, 0, -10.2], 0, { refs: [1, 7] });
place('adhc-rehab-band-wall', 'adhc-band-wall', 'adhc-rehab', W, [-fi.outX + 0.15, 0, -6.9], PI / 2, { refs: [1, 7] });
place('adhc-rehab-stair', 'adhc-practice-stair', 'adhc-rehab', W, [-fi.outX + 0.5, 0, -4.25], 0, {
  notes: 'Practice stair: three steps up to a 0.45 m platform; climbed facing -z.',
  refs: [1, 7],
});
place('adhc-rehab-rack', 'adhc-rehab-rack', 'adhc-rehab', W, [-7.05, 0, -2.5], PI, { refs: [1, 7] });
for (const [i, z] of [-6.2, -7.0, -7.8].entries())
  place(`adhc-rehab-chair-${i + 1}`, 'adhc-chair', 'adhc-rehab', W, [-fi.wingX - 0.29, 0, z], PI / 2, {
    notes: 'Chair for seated strength and rests.',
  });

// Classroom.
place('adhc-class-whiteboard', 'adhc-whiteboard', 'adhc-classroom', W, [-9.3, 0, fi.wingFront - 0.3], PI);
[4.4, 2.9, 1.4].forEach((z, r) =>
  [-10.55, -8.35].forEach((x, t) => {
    const id = `adhc-class-table-${r + 1}${'ab'[t]}`;
    place(id, 'adhc-class-table', 'adhc-classroom', W, [x, 0, z], 0);
    for (const [k, dx] of [-0.36, 0.36].entries())
      place(`${id}-chair-${k + 1}`, 'adhc-chair', 'adhc-classroom', W, [x + dx, 0, z - 0.6], PI, {
        notes: id === 'adhc-class-table-3b' && k === 1 ? 'The partner-adc registry entry leaves this chair out for a wheelchair.' : '',
      });
  }),
);

// Studio: calligraphy at the back, painting at the front. The cross aisle
// between the tables' south end and the first easel lets people at the east
// places out to the door.
[-9.1, -6.3].forEach((z, t) => {
  const id = `adhc-studio-table-${t + 1}`,
    x = (fi.wingX + fi.outX) / 2;
  place(id, 'adhc-calligraphy-table', 'adhc-studio', E, [x, 0, z], PI / 2, { refs: [1, 8] });
  for (let k = 0; k < 3; k++) {
    const cz = z - 0.8 + k * 0.8;
    place(`${id}-chair-w${k + 1}`, 'adhc-chair', 'adhc-studio', E, [x - 0.75, 0, cz], -PI / 2);
    place(`${id}-chair-e${k + 1}`, 'adhc-chair', 'adhc-studio', E, [x + 0.75, 0, cz], PI / 2);
  }
});
place('adhc-studio-scrolls', 'adhc-scroll-display', 'adhc-studio', E, [(fi.wingX + fi.outX) / 2, 0, fi.back + 0.25], 0, { refs: [1, 8] });
place('adhc-studio-brush-stand', 'adhc-brush-stand', 'adhc-studio', E, [fi.wingX + 0.245, 0, -8.0], PI / 2, { refs: [1, 8] });
[-3.75, -2.7, -1.65, -0.6].forEach((z, i) =>
  place(`adhc-studio-easel-${i + 1}`, 'adhc-easel', 'adhc-studio', E, [fi.outX - 0.5, 0, z], -PI / 2, {
    notes: 'Canvas faces west; the painter stands west of it.',
    refs: [1, 8],
  }),
);
place('adhc-studio-drying-rack', 'adhc-drying-rack', 'adhc-studio', E, [fi.wingX + 0.3, 0, -1.0], PI / 2);

// Group room: a circle of armchairs.
const circle = { x: 9.6, z: 3.6, r: 1.5 };
for (let k = 0; k < 8; k++) {
  const a = ((22.5 + 45 * k) * PI) / 180;
  place(`adhc-group-chair-${k + 1}`, 'adhc-armchair', 'adhc-group-room', E, [circle.x + circle.r * Math.sin(a), 0, circle.z + circle.r * Math.cos(a)], a, {
    notes: k === 4 ? 'The partner-adc registry entry leaves this armchair out: a wheelchair place in the circle.' : '',
  });
}
place('adhc-group-table', 'adhc-side-table', 'adhc-group-room', E, [circle.x, 0, circle.z], 0);
place('adhc-group-planter', 'adhc-planter', 'adhc-group-room', E, [fi.outX - 0.5, 0, MID.east + PART / 2 + 0.5], 0);

// Reception.
place('adhc-reception-desk', 'adhc-reception-desk', 'adhc-reception', N, [-1.8, 0, 8.4], PI / 2);
place('adhc-reception-chair', 'adhc-desk-chair', 'adhc-reception', N, [-2.55, 0, 8.4], -PI / 2);
for (const [i, z] of [7.6, 8.3, 9.0].entries())
  place(`adhc-waiting-chair-${i + 1}`, 'adhc-waiting-chair', 'adhc-reception', N, [ENTRY_PART - PART / 2 - 0.3, 0, z], PI / 2);
place('adhc-reception-planter', 'adhc-planter', 'adhc-reception', N, [2.4, 0, 9.75], 0);

// Restrooms (west, then its mirror image).
for (const s of [-1, 1]) {
  const side = s < 0 ? 'w' : 'e',
    roomId = `adhc-restroom-${side}`,
    wallX = s * fi.entryX,
    toiletX = wallX - s * 0.45;
  place(`adhc-restroom-${side}-toilet`, 'toilet', roomId, N, [toiletX, 0, fi.entryFront - 0.345], PI, {
    notes: 'Centreline 0.45 m from the side wall.',
    refs: [1, 4],
  });
  place(`adhc-restroom-${side}-basin`, 'basin', roomId, N, [s * (ENTRY_PART + PART / 2 + 0.25), 0, 8.6], s < 0 ? -PI / 2 : PI / 2, {
    notes: 'Roll-under basin on the partition.',
    refs: [1, 4],
  });
  place(`adhc-restroom-${side}-gb-side`, 'adhc-grab-bar-42', roomId, N, [wallX - s * 0.04, 0.82, fi.entryFront - 0.84], s < 0 ? PI / 2 : -PI / 2, {
    layer: 'architecture',
    notes: '42 in side bar on the side wall, 0.30 m from the rear wall.',
    refs: [1, 4],
  });
  place(`adhc-restroom-${side}-gb-rear`, 'adhc-grab-bar-36', roomId, N, [toiletX - s * 0.15, 0.82, fi.entryFront - 0.04], PI, {
    layer: 'architecture',
    notes: '36 in rear bar.',
    refs: [1, 4],
  });
}

// Door leaves: a swing door at every gap, drawn open (instances draw them
// open and shortened in a cutaway). The plan-door kind's origin is the hinge
// and its angles (atan2 of a plan direction) live in the asset, so each leaf
// has its own asset.
function door(assetId, name, zone, hinge, closed, open, width, notes) {
  assets[assetId] = {
    name,
    kind: 'plan-door',
    dimensions: [r3(width), 2.13, 0.043],
    material: 'adhc-door',
    parameters: { closedAngle: r6(closed), openAngle: r6(open) },
  };
  place(`${assetId}-leaf`, assetId, null, zone, [hinge[0], 0, hinge[1]], 0, {
    layer: 'architecture',
    notes,
  });
  return `${assetId}-leaf`;
}
const leaf = (dir) => Math.atan2(dir[1], dir[0]);
function schedule(id, wallRun, gap, leaves, notes, type = 'swing') {
  doorSchedule.push({ id, type, wall: wallRun, gap: gap.map(r3), clear: r3(gap[1] - gap[0]), leaves, notes });
}
// Single doors: [id, name, run, gap, hinge end (0 | 1), wall axis, into-room direction, note]
const singles = [
  ['adhc-door-rehab', 'Door · light rehab', 'adhc-wall-hall-west', DOORS.rehab, 0, 'z', [-1, 0], 'Hall to light rehab; swings into the rehab.'],
  ['adhc-door-classroom', 'Door · classroom', 'adhc-wall-hall-west', DOORS.classroom, 1, 'z', [-1, 0], 'Hall to the classroom; swings into the classroom.'],
  ['adhc-door-studio', 'Door · studio', 'adhc-wall-hall-east', DOORS.studio, 0, 'z', [1, 0], 'Hall to the studio; swings into the studio.'],
  ['adhc-door-group', 'Door · group room', 'adhc-wall-hall-east', DOORS.group, 1, 'z', [1, 0], 'Hall to the group room; swings into the group room.'],
  ['adhc-door-restroom-w', 'Door · west restroom', 'adhc-wall-hall-front', DOORS.restroomW, 0, 'x', [0, 1], 'Hall to the west restroom; swings in, latch openable from outside.'],
  ['adhc-door-restroom-e', 'Door · east restroom', 'adhc-wall-hall-front', DOORS.restroomE, 1, 'x', [0, 1], 'Hall to the east restroom; swings in, latch openable from outside.'],
];
for (const [id, name, wallRun, gap, end, axis, into, notes] of singles) {
  const line = walls.find((w) => w.id.startsWith(wallRun)).a[axis === 'z' ? 0 : 1];
  const at = (t) => (axis === 'z' ? [line, t] : [t, line]);
  const along = end === 0 ? 1 : -1;
  const leafId = door(
    id,
    name,
    H,
    at(gap[end]),
    leaf(axis === 'z' ? [0, along] : [along, 0]),
    leaf(into),
    gap[1] - gap[0] - 0.05,
    notes,
  );
  schedule(id, wallRun, gap, [leafId], notes);
}
// Double doors: the front entrance (into the reception) and the hall doors.
for (const [id, name, wallRun, gap, line, into, zone, notes] of [
  ['adhc-door-entrance', 'Front door', 'adhc-wall-entry-front', DOORS.entrance, ENTRY.front, [0, -1], N, 'Double front doors, 1.8 m clear, swinging into the reception; flush threshold.'],
  ['adhc-door-hall', 'Door · hall', 'adhc-wall-hall-front', DOORS.hallDoors, HALL.front, [0, 1], H, 'Double doors between the reception and the hall, held open in the day; they swing into the reception.'],
]) {
  const width = (gap[1] - gap[0]) / 2 - 0.025;
  const leaves = [
    door(`${id}-1`, `${name} (left leaf)`, zone, [gap[0], line], leaf([1, 0]), leaf(into), width, notes),
    door(`${id}-2`, `${name} (right leaf)`, zone, [gap[1], line], leaf([-1, 0]), leaf(into), width, notes),
  ];
  schedule(id, wallRun, gap, leaves, notes, 'double-swing');
}
// The stage steps' opening in the stage edge (no leaf).
doorSchedule.push({
  id: 'adhc-opening-stage-steps',
  type: 'opening',
  wall: 'adhc-stage (front edge)',
  gap: [STEPS.x0, STEPS.x1],
  clear: r3(STEPS.x1 - STEPS.x0),
  leaves: [],
  notes: 'Open front edge of the stage at the steps (two 0.64 m lanes between three handrails).',
});

// --- Schedules and records -------------------------------------------------------
const windowSchedule = [
  ['adhc-win-class-front-1', 'adhc-wall-front-west', 1.4, 1.6, 'adhc-classroom'],
  ['adhc-win-class-front-2', 'adhc-wall-front-west', 3.8, 1.6, 'adhc-classroom'],
  ['adhc-win-class-west', 'adhc-wall-west', 14.0, 2.4, 'adhc-classroom'],
  ['adhc-win-rehab-west-1', 'adhc-wall-west', 3.0, 1.8, 'adhc-rehab'],
  ['adhc-win-rehab-west-2', 'adhc-wall-west', 6.4, 1.8, 'adhc-rehab'],
  ['adhc-win-studio-east-1', 'adhc-wall-east', 2.0, 2.4, 'adhc-studio'],
  ['adhc-win-studio-east-2', 'adhc-wall-east', 6.4, 2.4, 'adhc-studio'],
  ['adhc-win-group-east', 'adhc-wall-east', 13.6, 2.0, 'adhc-group-room'],
  ['adhc-win-group-front', 'adhc-wall-front-east', 2.2, 2.0, 'adhc-group-room'],
  ['adhc-win-entry-w', 'adhc-wall-entry-front-a', 3.2, 1.6, 'adhc-reception'],
  ['adhc-win-entry-e', 'adhc-wall-entry-front-b', 0.6, 1.6, 'adhc-reception'],
].map(([id, wall, offset, width, roomId]) => ({
  id,
  wall,
  offset,
  width,
  sill: roomId === 'adhc-reception' ? 0.1 : 0.9,
  height: roomId === 'adhc-reception' ? 2.1 : 1.3,
  roomId,
}));
const turningCircles = [
  ['turn-restroom-w', 'adhc-restroom-w', [-4.6, 8.2], 'Clear of the toilet, basin and door swing'],
  ['turn-restroom-e', 'adhc-restroom-e', [4.6, 8.2], 'Clear of the toilet, basin and door swing'],
  ['turn-reception', 'adhc-reception', [0.4, 8.4], 'Inside the front doors'],
  ['turn-ramp-foot', 'adhc-hall', [0.8, -6.6], 'At the foot of the stage ramp'],
  ['turn-stage', 'adhc-stage', [-5.7, -8.4], 'On the deck at the top of the ramp'],
].map(([id, roomId, centre, notes]) => ({ id, roomId, centre, diameter: 1.5, required: true, notes }));

const outline = [
  [-WING.x - EXT / 2, HALL.back - EXT / 2],
  [WING.x + EXT / 2, HALL.back - EXT / 2],
  [WING.x + EXT / 2, HALL.front + EXT / 2],
  [ENTRY.x + EXT / 2, HALL.front + EXT / 2],
  [ENTRY.x + EXT / 2, ENTRY.front + EXT / 2],
  [-ENTRY.x - EXT / 2, ENTRY.front + EXT / 2],
  [-ENTRY.x - EXT / 2, HALL.front + EXT / 2],
  [-WING.x - EXT / 2, HALL.front + EXT / 2],
];
const gross = zones.reduce((n, z) => n + area(z.polygon), 0),
  hallArea = area(rooms[0].polygon),
  netArea = rooms.reduce((n, r) => n + area(r.polygon), 0);
const PX = 50,
  site = { x0: -17, z0: -13.4, x1: 17, z1: 26.6 },
  px = ([x, z]) => [r3((x - site.x0) * PX), r3((site.z1 - z) * PX)];
const seats = objects.filter((o) => o.assetId === 'adhc-banquet-chair').length;

const referencePages = [
  {
    page: 1,
    title: 'ADHC-PLAN · Partner adult day health care center design study (plan, furniture, the day, checks)',
    group: 'Design study',
    findings:
      'Plan frame P, zones, rooms, walls with grid-centred door gaps, the stage and its step-free access, the furniture schedule, standing surfaces and the partner day. Generated by scripts/build-partner-adhc.mjs and checked by scripts/validate-partner-adhc.mjs.',
    reviewStatus: 'Reviewed for the illustrative plan',
    evidenceType: 'Design drawing (illustrative)',
  },
  {
    page: 2,
    title: 'Program brief · the partner ADHC',
    group: 'Program',
    findings:
      'Mostly long tables; lots of fancy dancing; line dance; bingo; singing or choir; large groups; a large area of activity; a stage; some smaller activity rooms; calligraphy; painting; classes and group therapy sessions; a light rehab space; nothing else; substantially smaller than the main center. Approved support spaces: an entry and reception, and restrooms.',
    reviewStatus: 'Product owner brief',
    evidenceType: 'Program brief',
  },
  {
    page: 3,
    title: 'California adult day health care (CBAS) · physical plant',
    group: 'Regulation',
    findings:
      'California Code of Regulations, Title 22, Division 5, Chapter 10 (adult day health centers) and the CDA Community-Based Adult Services (CBAS) program: activity space per participant, toilets and accessibility. Interpreted, not quoted; the model leaves out the clinic, food-service, quiet-room and office spaces a licensed center needs (accuracy issues).',
    reviewStatus: 'Reviewed for the illustrative plan',
    evidenceType: 'Regulation summary (interpreted, not quoted)',
  },
  {
    page: 4,
    title: '2010 ADA Standards for Accessible Design',
    group: 'Accessibility',
    findings:
      'Turning space 304, doors 404, ramps 405 (1:12 maximum, level landings, handrails), stairs 504, toilet rooms 604 and grab bars 609, and performing areas 206.2.6 (an accessible route joins the seating and the stage). https://www.ada.gov/law-and-regs/design-standards/2010-stds/',
    reviewStatus: 'Reviewed for the illustrative plan',
    evidenceType: 'Standard (interpreted, not quoted)',
  },
  {
    page: 5,
    title: 'Banquet seating and aisles',
    group: 'Planning guides',
    findings:
      '8 ft × 30 in banquet tables seat four a side at about 24 in each, joined end to end as long tables; aisles of 36–48 in between chair backs; wheelchair places at table ends with the chair removed.',
    reviewStatus: 'Reviewed for the illustrative plan',
    evidenceType: 'Reference summary',
  },
  {
    page: 6,
    title: 'Senior line dance, fan dance and community choir',
    group: 'Program',
    findings:
      'Line dancing in rows about 1.2–1.5 m apart; fan and partner dances on the same floor; small community choirs of ten to fifteen on two- or three-tier risers (about 8 in rise and 24 in deep) beside a piano.',
    reviewStatus: 'Reviewed for the illustrative plan',
    evidenceType: 'Reference summary',
  },
  {
    page: 7,
    title: 'Light rehab in adult day settings',
    group: 'Care model',
    findings:
      'Parallel bars, recumbent exercisers, a mat table, resistance bands and a training stair for strength, balance and fall prevention (CDC STEADI); visiting therapists from the participant’s own program.',
    reviewStatus: 'Reviewed for the illustrative plan',
    evidenceType: 'Guidance summary',
  },
  {
    page: 8,
    title: 'San Gabriel Valley adult day and senior programs',
    group: 'Context',
    findings:
      'Chinese-American adult day and senior programs commonly offer line dancing, fan and ribbon dances, choir and opera singing, calligraphy and brush painting, bingo, classes and support groups. An illustrative composite; no specific center.',
    reviewStatus: 'Reviewed for the illustrative plan',
    evidenceType: 'Context summary',
  },
].map((p) => ({ ...p, text: '' }));

const model = {
  schemaVersion: '2.0',
  id: 'seen-partner-adhc',
  name: 'Partner adult day health care center · hall, stage, studio, classroom, group room and light rehab',
  address: 'Illustrative partner center on the community pad south of the Alhambra center (not a real address)',
  units: 'm',
  coordinateSystem:
    'Plan frame P: metres, origin at the centre of the hall’s width and the building’s depth, +X to the right seen from the drive, +Z toward the drive (the front), Y up; y = 0 is the finished floor (PAD level on the community pad). Stamped on the partner-adc pad with frame { position: [0, -6.6], heading: 0 } (pad-local): pad-local = P + (0, -6.6).',
  revision: '2026-10-02 · Partner ADHC plan v1 (ADHC-PLAN study, grid-aligned doors)',
  source: {
    title: 'The partner adult day health care center: plan, furniture and day (ADHC-PLAN design study)',
    date: '2026-10-02',
    pages: referencePages.length,
    author: 'Seen Health planning (illustrative design)',
  },
  calibration: {
    method: 'Designed in metres; no source drawing to calibrate',
    status: 'Illustrative design dimensions',
    pixelsPerMeter: PX,
    sourcePixelOrigin: px([0, 0]),
    referencePage: 1,
    areaPage: 1,
    anchorAreaSqFt: Math.round((gross / SQFT) * 10) / 10,
    anchorPolygonPixels: outline.map(px),
    notes: `Pixel values refer to the study drawing adhc-plan.svg (${PX} px per metre). Room sizes follow the program brief at about a quarter of the main center's ground floor. Not a field survey.`,
  },
  levels: [
    {
      id: 'ground',
      name: 'Ground floor',
      elevation: 0,
      order: 0,
      referencePages: STUDY,
      elevationStatus: 'Slab on grade at pad level; step-free from the front walk',
      notes: 'Single storey. Exterior walls 0.20 m, partitions 0.12 m; the stage is a 0.40 m platform in the hall.',
    },
  ],
  zones,
  rooms,
  walls,
  objects,
  assets,
  materials,
  programs: [],
  referencePages,
  accuracyIssues: [
    {
      id: 'illustrative-plan',
      title: 'Illustrative plan, not a real center',
      detail:
        'An illustrative partner adult day health care center designed from the program brief, about a quarter of the main center’s ground floor. No real provider, address, survey or participant records are used.',
      status: 'Illustrative',
      pages: [1, 2, 8],
    },
    {
      id: 'program-limited',
      title: 'Only the brief’s spaces',
      detail:
        'The plan holds the brief’s spaces plus the approved entry, reception and two restrooms. A licensed ADHC (CBAS) center also needs a nurse’s station or clinic room, a quiet room, an office, food service and storage; they are left out by request. Lunch is shown catered and served at the long tables.',
      status: 'Program scope',
      pages: [2, 3],
    },
    {
      id: 'accessibility-interpretation',
      title: 'Accessibility values are interpretations',
      detail:
        'The 1:12 stage ramp with its 1.54 × 1.5 m landing, the steps with three handrails, the 1.0 m interior door gaps and 1.8 m double doors, the wheelchair places at table ends, in the classroom and in the circle, and the 1.5 m turning circles follow the 2010 ADA Standards as interpreted for this plan. Checked by scripts/validate-partner-adhc.mjs, not by an accessibility consultant.',
      status: 'Design interpretation',
      pages: [4, 5],
    },
    {
      id: 'standing-surfaces',
      title: 'Heights on the stage',
      detail:
        'People on the stage, the choir risers and the ramp landing stand at the heights the assets declare (`parameters.standing`, read by facility-instance.ts standingSurfaces); walks up the steps and the ramp rise linearly between the corners of their routes.',
      status: 'Simulation simplification',
      pages: [1],
    },
    {
      id: 'grid-aligned-doors',
      title: 'Door gaps on the navigation grid',
      detail:
        'Every door gap is centred on a multiple of 0.2 m so the 0.2 m navigation grid passes a wheelchair (0.37 m clearance) straight through a 1.0 m gap.',
      status: 'Simulation adjustment',
      pages: [1],
    },
    {
      id: 'decor',
      title: 'Finishes are a presentation choice',
      detail:
        'Terracotta stucco, warm plaster, honey wood, cinnabar, jade and gold give the partner its own identity next to Seen’s white, oak and stone; they are not a finish schedule. Paper lanterns stand on posts and hang from the stage backdrop rather than from the ceiling, so nothing floats over the cutaway.',
      status: 'Presentation',
      pages: [1, 8],
    },
    {
      id: 'roof-windows',
      title: 'Roof and windows not modelled',
      detail:
        'The roof (roofNote) and the windows (windowSchedule) are recorded only; the community instance is a cutaway at 1.2 m.',
      status: 'Not modelled',
      pages: [1],
    },
  ],
  site: {
    imageSize: [r3((site.x1 - site.x0) * PX), r3((site.z1 - site.z0) * PX)],
    bounds: [
      [site.x0, site.z0],
      [site.x1, site.z1],
    ],
    imagePixelBounds: [0, 0, r3((site.x1 - site.x0) * PX), r3((site.z1 - site.z0) * PX)],
    buildingOutline: outline.map(pt),
    referencePages: STUDY,
    notes:
      'Bounds are the partner-adc pad (pad-local x -17..17, z -20..20) expressed in P. The drive, apron, front walk, trees, bench and planting belong to the community pad (community-pads.ts), not to this specification.',
  },
  roofSections: [],
  details: [],
  facade: {
    height: 4.2,
    status: 'Terracotta stucco walls (illustrative); roof not modelled',
    wallMaterial: 'adhc-stucco',
    glazingMaterial: 'glass',
    referencePages: STUDY,
  },
  dimensions: [
    {
      id: 'gross-area',
      value: r3(gross),
      unit: 'm2',
      sourceValue: `${gross.toFixed(1)} m2 (${Math.round(gross / SQFT).toLocaleString('en-US')} sq ft)`,
      pages: [1, 2],
      status: 'Computed from zone polygons',
      meaning: 'Gross floor area over the outer wall faces (about a quarter of the main center’s 1,956 m2 ground floor).',
    },
    {
      id: 'net-area',
      value: r3(netArea),
      unit: 'm2',
      sourceValue: `${netArea.toFixed(1)} m2`,
      pages: [1],
      status: 'Computed from room polygons',
      meaning: 'Net area of the nine rooms (hall, stage, light rehab, classroom, studio, group room, reception, two restrooms).',
    },
    {
      id: 'hall-area',
      value: r3(hallArea),
      unit: 'm2',
      sourceValue: `${hallArea.toFixed(1)} m2 in front of the stage`,
      pages: [1, 5],
      status: 'Computed from the room polygon',
      meaning: 'The hall’s floor in front of the stage (tables, dance floor, ramp and steps).',
    },
    {
      id: 'stage-height',
      value: STAGE.deck,
      unit: 'm',
      sourceValue: '0.40 m (15.75 in)',
      pages: [1, 4],
      status: 'Design dimension',
      meaning: 'Height of the stage deck above the hall floor.',
    },
    {
      id: 'stage-ramp-run',
      value: r3(STAGE.deck * 12),
      unit: 'm',
      sourceValue: '0.40 m rise over 4.80 m = 1:12',
      pages: [4],
      status: 'Design dimension',
      meaning: 'Run of the stage ramp at the 1:12 maximum slope, plus a 1.54 × 1.5 m landing at the top.',
    },
    {
      id: 'banquet-places',
      value: seats,
      unit: 'places',
      sourceValue: `${seats} banquet chairs (3 left out on the pad for wheelchairs)`,
      pages: [1, 5],
      status: 'Furniture schedule',
      meaning: 'Places at the two long tables: 12 a side and one at each end of each table.',
    },
    {
      id: 'dance-floor',
      value: 9.2,
      unit: 'm',
      sourceValue: '9.2 × 5.2 m (47.8 m2)',
      pages: [1, 6],
      status: 'Design dimension',
      meaning: 'Dance floor inlay: room for 15 line dancers at 1.4 × 1.2 m.',
    },
    {
      id: 'door-clear-interior',
      value: 1,
      unit: 'm',
      sourceValue: '39.4 in',
      pages: [4],
      status: 'Design dimension',
      meaning: 'Clear gap of every interior door; the front and hall doors are 1.8 m pairs.',
    },
    {
      id: 'step-lane',
      value: 0.64,
      unit: 'm',
      sourceValue: 'two lanes of 25 in',
      pages: [4],
      status: 'Design dimension',
      meaning: 'Clear width of each lane of the stage steps between the side and centre handrails.',
    },
  ],
  doorSchedule,
  windowSchedule,
  turningCircles,
  roofNote:
    'Gabled roof over the hall (ridge along z over x = 0, eave 4.2 m), flat roofs over the wings and the entry pavilion (3.2 m). Not modelled: the community instance shows the building as a cutaway.',
  publication: { sourceDocuments: 'not-published' },
};

const text = JSON.stringify(model, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const current = readFileSync(resolve(root, FILE), 'utf8');
  if (current !== text) {
    console.error(`${FILE} differs from a fresh build: run node scripts/build-partner-adhc.mjs`);
    process.exit(1);
  }
  console.log(`${FILE} matches the build.`);
} else {
  writeFileSync(resolve(root, FILE), text);
  console.log(
    `Wrote ${FILE}: ${zones.length} zones, ${rooms.length} rooms, ${walls.length} walls, ${objects.length} objects, ${Object.keys(assets).length} assets; gross ${gross.toFixed(1)} m2, ${seats} banquet places.`,
  );
}
