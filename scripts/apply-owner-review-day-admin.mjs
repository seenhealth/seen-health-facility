// Owner walkthrough (October 2026), day room and administration side.
//
//   node scripts/apply-owner-review-day-admin.mjs
//
// (2)  Central support room C3 (`lobby-office-c3`) is the recreation therapy
//      office: five standing desks along its solid west and east walls. Four
//      recreation therapists work there standing and go out to the day room
//      in a regular cadence (someone leaves or returns about every minute),
//      each checking in at the tree-seat tables for a while and walking back.
// (3)  `admin-waiting-west` is the quiet room / 棋牌室: a door from the day
//      room at its north-west corner (the architectural plan shows it there),
//      the three waiting chairs gone, two square tables with four chairs
//      each, Chinese chess on one and Go on the other, with players and
//      onlookers; one onlooker steps out into the day room and comes back.
// (4)  Six more people sit on the day room's east banquette, one per
//      banquette table, and come and go: each slides out past the end of
//      their table, visits a free tree-seat chair, the lattice bookcases or
//      the south windows, and returns. The banquette tables are shortened to
//      1.45 m (the plan shows short tables with wide gaps) so that there is
//      a way out between them, and the bench starts south of the new door.
// (13) The social-work office's two chairs face each other.
//
// Everything this script owns (objects, the standing-desk asset, the split
// wall, actors, profiles, interactions, program tables and its ownerReview
// entries) is removed first and rebuilt from the constants below, so running
// it twice yields identical files.
//
// Walks are routed on the navigation grid (app/sim/nav.ts) at a clearance
// that keeps 0.28 m from furniture and 0.30 m from walls, as
// scripts/validate-community.mjs demands (the straight slide along the bench
// and out between its tables is the one hand-drawn leg), around everyone's
// long standing spots. Each person's outings are then scheduled into the
// first windows in which the walk out, the visit and the walk back stay 0.6 m
// from everyone else, and every new person is checked once more against
// walls, furniture, the open-floor class area and everyone else before
// anything is written. Afterwards run `node scripts/apply-drop-off-route.mjs`
// (canonical loop format) and `npm run build:scenario`.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSim } from './build-scenario.mjs';

const MODEL = 'public/models/seen-alhambra-planning.json',
  BASELINE = 'public/models/seen-alhambra-planning-base.json',
  LOOPS = ['app/data/activity-loop.json', 'public/models/activity-loop.json'],
  PROFILES = [
    'app/data/character-templates.json',
    'public/models/character-templates.json',
  ],
  PROGRAMS = ['app/data/day-program.json', 'public/models/day-program.json'];
const { nav, activity, placement } = await loadSim(
  {
    nav: 'app/sim/nav.ts',
    activity: 'app/model/activity.ts',
    placement: 'app/model/site-activity-data.ts',
  },
  { dir: 'work/owner-review-day-admin' },
);

const PI = Math.PI,
  r3 = (v) => Math.round(v * 1e3) / 1e3,
  r4 = (v) => Math.round(v * 1e4) / 1e4,
  union = (list, add) => [...new Set([...list, ...add])],
  reversed = (list) => [...list].reverse(),
  dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
  byId = (a, b) => a.localeCompare(b);
const PAGE = [92],
  DATE = '2026-10-10',
  DAY = 720;

// --- What this script owns -----------------------------------------------------
const RTS = ['community-57', 'community-58', 'community-60', 'community-61'],
  QUIET_IDS = [
    'community-62',
    'community-63',
    'community-64',
    'community-65',
    'community-66',
    'community-67',
    'community-68',
    'community-69',
  ],
  BENCH = [
    'community-70',
    'community-71',
    'community-72',
    'community-73',
    'community-74',
    'community-75',
  ];
const OWNED_ACTORS = new Set([...RTS, ...QUIET_IDS, ...BENCH]);
const ownedObject = (id) =>
    id.startsWith('rt-desk-') || id.startsWith('quiet-table-'),
  ownedWall = (id) => id.startsWith('owner-wall-154-'),
  ownedInteraction = (id) =>
    id.startsWith('owner-review-day-admin-') ||
    id.startsWith('table-quiet-table-'),
  ownedItem = (id) => id.startsWith('day-admin-');
const DESK_ASSET = 'rt-standing-desk';

// --- Geometry ------------------------------------------------------------------
/** C3: its west and east walls (plan-wall-107/110, 0.254 m thick). */
const C3 = { west: -6.919529, east: -2.696581, wall: 0.2543944582653602 },
  C3_IN = { west: C3.west + C3.wall / 2, east: C3.east - C3.wall / 2 };
/** Standing desk: 1.0 m wide, 0.65 m deep, worktop 1.05 m, monitor top 1.5 m. */
const DESK = { w: 1.0, h: 1.5, d: 0.65 };
/** Five desks: three on the west wall, two on the east (the door is at the east end of the south wall). */
const DESKS = [
  { id: 'rt-desk-1', side: 'west', z: 4.4 },
  { id: 'rt-desk-2', side: 'west', z: 5.5 },
  { id: 'rt-desk-3', side: 'west', z: 6.6 },
  { id: 'rt-desk-4', side: 'east', z: 3.9 },
  { id: 'rt-desk-5', side: 'east', z: 5.1 },
];
const deskX = (side) =>
  side === 'west' ? C3_IN.west + DESK.d / 2 : C3_IN.east - DESK.d / 2;
/** Where a therapist stands at a desk (0.30 m off its front edge) and faces. */
const deskStand = (desk) => ({
  at: [
    r3(
      desk.side === 'west'
        ? C3_IN.west + DESK.d + 0.3
        : C3_IN.east - DESK.d - 0.3,
    ),
    desk.z,
  ],
  heading: desk.side === 'west' ? -PI / 2 : PI / 2,
});
/** Desk 1 (nearest the N1 opening) is the spare hot desk; the four therapists use the others. */
const RT_DESKS = ['rt-desk-2', 'rt-desk-4', 'rt-desk-3', 'rt-desk-5'];
/**
 * Where the therapists check in: the quiet room (through the day room's
 * north-east corner and the new door, facing the chess table) and the day
 * room's east aisle at its edge north of tree-seat chair 2-2 (facing tree
 * table 2). The aisle south of the day's greeter at (-3, 15) cannot be
 * passed with 0.6 m to spare, so nothing is visited beyond it from the north.
 */
const RT_SPOTS = [
  {
    at: [1.3, 10.3],
    heading: 1.41,
    title: 'Checking in on the chess players',
    zoneId: 'admin',
  },
  {
    at: [-3.9, 13.2],
    heading: -0.94,
    title: 'A word with the small-group table',
    zoneId: 'day',
  },
];
const RT = {
  pace: 0.7,
  outings: 3,
  minBase: 40,
  stayRange: [30, 50],
  firstAt: (k) => 20 + 40 * k,
};

/** The quiet-room door in the day room's east wall (plan-wall-154, x = 0). */
const DOOR_Z = [9.45, 10.47];
/** The two square tables (0.977 m marble tops) with four chairs at 0.86 m. */
const TABLES = [
  { id: 'quiet-table-1', at: [3.6, 10.68], game: 'xiangqi' },
  { id: 'quiet-table-2', at: [1.6, 12.78], game: 'go' },
];
const CHAIR_OFFSET = 0.86,
  CHAIRS = [
    { n: 1, dx: 0, dz: -1, rotation: PI },
    { n: 2, dx: 1, dz: 0, rotation: PI / 2 },
    { n: 3, dx: 0, dz: 1, rotation: 0 },
    { n: 4, dx: -1, dz: 0, rotation: -PI / 2 },
  ];
/** Sitters: table, chair, whether they play; the last onlooker comes and goes. */
const QUIET_SEATS = [
  { id: 'community-62', table: 0, chair: 1, play: true },
  { id: 'community-63', table: 0, chair: 3, play: true },
  { id: 'community-64', table: 0, chair: 2, play: false },
  { id: 'community-65', table: 0, chair: 4, play: false },
  { id: 'community-66', table: 1, chair: 2, play: true },
  { id: 'community-67', table: 1, chair: 4, play: true },
  { id: 'community-68', table: 1, chair: 3, play: false },
  { id: 'community-69', table: 1, chair: 1, play: false, outing: true },
];
/** The onlooker's breaks: a spot in the day room's north-east corner. */
const QUIET_OUTING = {
    at: [-2.0, 9.4],
    heading: -PI / 2,
    title: 'A breath of air in the day room',
  },
  QUIET = {
    pace: 0.45,
    outings: 2,
    minBase: 150,
    stayRange: [50, 70],
    firstAt: () => 150,
  };

/** The east banquette's north end moves south of the new door. */
const BENCH_ID = 'day-east-banquette',
  BENCH_NORTH = 10.55;
/** Banquette tables shortened along the bench (plan: short tables, wide gaps). */
const BANQUETTE_TABLE_LENGTH = 1.45;
/**
 * Bench sitters: one per table (01, 03–07), the gap they leave through and
 * where they go. At 0.30 m clearance the tree-seat block is reachable from
 * the east aisle only at its three east chairs, the aisle cannot be passed
 * beside the day's greeter at (-3, 15), and the west strip by the lattice
 * bookcases is reached only along the south band; so from north of the
 * greeter they visit chair 2-3 or the quiet room, from south of it chairs
 * 4-1 and 4-3, the south windows or the bookcases.
 */
const BENCH_SEATS = [
  {
    id: 'community-70',
    table: 1,
    gap: [1, 2],
    to: { seat: 'day-tree-chair-2-3' },
    action: 'conversation',
  },
  {
    id: 'community-71',
    table: 3,
    gap: [2, 3],
    to: {
      stand: [0.7, 12.0],
      heading: PI / 2,
      action: 'watch',
      title: 'Watching the Go game',
      zoneId: 'admin',
    },
    action: 'read',
  },
  {
    id: 'community-72',
    table: 4,
    gap: [3, 4],
    to: { seat: 'day-tree-chair-4-1' },
    action: 'tea',
  },
  {
    id: 'community-73',
    table: 5,
    gap: [4, 5],
    to: { seat: 'day-tree-chair-4-3' },
    action: 'conversation',
  },
  {
    id: 'community-74',
    table: 6,
    gap: [5, 6],
    to: {
      stand: [-2.9, 24.55],
      heading: 0,
      action: 'idle',
      title: 'Looking out at the courtyard',
    },
    action: 'read',
  },
  {
    id: 'community-75',
    table: 7,
    gap: [6, 7],
    to: {
      stand: [-13.65, 23.8],
      heading: -PI / 2,
      action: 'read',
      title: 'Browsing the lattice bookcases',
    },
    action: 'conversation',
  },
];
const BENCH_X = -0.5,
  BENCH_AISLE_X = -3.0,
  BENCHER = {
    pace: 0.45,
    outings: 2,
    minBase: 100,
    stayRange: [60, 90],
    firstAt: (k) => 40 + 35 * k,
  };

/** Social-work office: the two chairs turn to face each other. */
const SIDE_CHAIRS = { 'admin-side-chair-0': PI, 'admin-side-chair-1': 0 };

const ROUTE_CLEARANCE = 0.3,
  /** Personal space kept from everyone else (validate-community wants > 0.58 m). */
  SPACE = 0.6,
  /** Standing spots are kept 0.62 m off everyone's routes (the grid passes 0.09 m outside a reservation). */
  SPOT_RESERVE = 0.53;

// --- The model -----------------------------------------------------------------
const m = JSON.parse(readFileSync(MODEL, 'utf8')),
  baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const object = (id) => m.objects.find((o) => o.id === id),
  room = (id) => m.rooms.find((r) => r.id === id);

// Idempotency: drop everything this script owns.
m.objects = m.objects.filter((o) => !ownedObject(o.id));
delete m.assets[DESK_ASSET];
m.walls = m.walls.filter((w) => !ownedWall(w.id));
if (!m.walls.some((w) => w.id === 'plan-wall-154'))
  m.walls.splice(
    m.walls.findIndex((w) => w.id === 'plan-wall-153') + 1,
    0,
    structuredClone(baseline.walls.find((w) => w.id === 'plan-wall-154')),
  );
m.ownerReview ??= {
  date: DATE,
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
review.items = review.items.filter((i) => !ownedItem(i.id));
const register = (list, ids) => (review[list] = union(review[list], ids));
const furniture = (
  id,
  assetId,
  zoneId,
  roomId,
  [x, z],
  rotation,
  scale,
  status,
  notes,
) => ({
  id,
  assetId,
  zoneId,
  levelId: 'ground',
  position: [r4(x), 0, r4(z)],
  rotation,
  scale,
  roomId,
  referencePages: PAGE,
  status,
  notes,
  layer: 'furniture',
});
const OWNER_STATUS =
  'owner-review 2026-10 / use described by owner / dimensions estimated';

// (2) Recreation therapy office.
const c3 = room('lobby-office-c3');
c3.name = 'Recreation therapy office';
c3.notes =
  'Boundary traced from Overall Planning.jpg. Owner walkthrough 2026-10: the recreation therapists’ office, with about five standing desks; they come and go to the day room through the south door.';
m.assets[DESK_ASSET] = {
  kind: 'standing-desk',
  dimensions: [DESK.w, DESK.h, DESK.d],
  material: 'photo-white',
  materials: { metal: 'photo-silver', screen: 'screen', frame: 'photo-black' },
  parameters: { worktop: 1.05 },
};
const deskObjects = DESKS.map((d) =>
  furniture(
    d.id,
    DESK_ASSET,
    'lobby',
    'lobby-office-c3',
    [deskX(d.side), d.z],
    d.side === 'west' ? PI / 2 : -PI / 2,
    [1, 1, 1],
    OWNER_STATUS,
    'Standing desk against the office wall, user side toward the room; count and standing height from the owner’s description, product estimated.',
  ),
);

// (3) Quiet room / 棋牌室.
const quiet = room('admin-waiting-west');
quiet.name = 'Quiet room · 棋牌室';
quiet.notes =
  'Boundary traced from Overall Planning.jpg. Owner walkthrough 2026-10: a quiet room that is also the 棋牌室, with two square tables and four chairs each for Go and Chinese chess, entered by a door from the day room at its north-west corner (as the architectural plan shows).';
const WAITING_CHAIRS = [
  'admin-waiting-chair-0',
  'admin-waiting-chair-1',
  'admin-waiting-chair-2',
];
m.objects = m.objects.filter((o) => !WAITING_CHAIRS.includes(o.id));
register('removedPlanObjectIds', WAITING_CHAIRS);
const wall154 = m.walls.find((w) => w.id === 'plan-wall-154'),
  split = (suffix, a, b) => {
    const w = {
      ...structuredClone(wall154),
      id: `owner-wall-154-${suffix}`,
      a,
      b,
    };
    w.status =
      'owner-review 2026-10 / traced wall split for the quiet-room door';
    delete w.sourcePixels;
    return w;
  };
m.walls.splice(
  m.walls.indexOf(wall154),
  1,
  split('north', wall154.a, [0, DOOR_Z[0]]),
  split('south', [0, DOOR_Z[1]], wall154.b),
);
register('removedWallIds', ['plan-wall-154']);
register('newWallIds', ['owner-wall-154-north', 'owner-wall-154-south']);
const quietObjects = TABLES.flatMap((t) => [
  furniture(
    t.id,
    'interior-plan-dining-table',
    'admin',
    'admin-waiting-west',
    t.at,
    0,
    [1, 1, 1],
    OWNER_STATUS,
    `Square game table of the quiet room (${t.game === 'go' ? 'Go' : 'Chinese chess'}); the day room’s marble-top table, placement estimated.`,
  ),
  ...CHAIRS.map((c) =>
    furniture(
      `${t.id}-chair-${c.n}`,
      'photo-dining-chair',
      'admin',
      'admin-waiting-west',
      [t.at[0] + c.dx * CHAIR_OFFSET, t.at[1] + c.dz * CHAIR_OFFSET],
      c.rotation,
      [1, 1, 1],
      OWNER_STATUS,
      'One of four chairs around a quiet-room game table; the day room’s dining chair, placement estimated.',
    ),
  ),
]);

// (4) Banquette: bench south of the door, shorter banquette tables.
const bench = object(BENCH_ID),
  benchAsset = m.assets[bench.assetId],
  benchSouth = 17.45146 + benchAsset.dimensions[0] / 2,
  benchLength = benchSouth - BENCH_NORTH;
bench.scale = [r4(benchLength / benchAsset.dimensions[0]), 1, 1];
bench.position = [bench.position[0], 0, r4((benchSouth + BENCH_NORTH) / 2)];
bench.notes =
  'Visible component follows the photograph. Owner walkthrough 2026-10: the bench starts south of the quiet-room door; length estimated.';
const banquetteTables = m.objects.filter((o) =>
  /^day-banquette-table-\d+$/.test(o.id),
);
assert.equal(banquetteTables.length, 7);
for (const t of banquetteTables) {
  const asset = m.assets[t.assetId];
  t.scale = [1, 1, r4(BANQUETTE_TABLE_LENGTH / asset.dimensions[2])];
  t.notes =
    'Visible component follows the photograph. Owner walkthrough 2026-10: shortened along the bench so that banquette sitters can get out between the tables, as the plan’s short tables allow; dimensions estimated.';
}

// (13) Social-work office chairs face each other.
for (const [id, rotation] of Object.entries(SIDE_CHAIRS)) {
  const o = object(id);
  o.rotation = rotation;
  delete o.sourcePixelPosition;
  delete o.sourcePixelFootprint;
  o.status =
    'image-traced-position / owner-review 2026-10 orientation / height-inferred';
  o.notes =
    'Plan location follows Overall Planning.jpg; owner walkthrough 2026-10: the two seats face each other rather than the wall. Product and height remain inferred.';
}
register('changedPlanObjectIds', Object.keys(SIDE_CHAIRS));

// New objects after the last admin item, so the file reads in room order.
const newObjects = [...deskObjects, ...quietObjects];
m.objects.splice(
  m.objects.findIndex((o) => o.id === 'admin-side-chair-1') + 1,
  0,
  ...newObjects,
);
register(
  'newObjectIds',
  newObjects.map((o) => o.id),
);

// --- The loop: every other number keeps its exact text -------------------------
const loopText = readFileSync(LOOPS[0], 'utf8'),
  loop = JSON.parse(loopText, (_, v, context) =>
    typeof v === 'number' && context?.source !== String(v)
      ? JSON.rawJSON(context.source)
      : v,
  );
assert.equal(loop.duration, DAY);
loop.actors = loop.actors.filter((a) => !OWNED_ACTORS.has(a.id));
loop.interactions = loop.interactions.filter((i) => !ownedInteraction(i.id));
const others = loop.actors.filter((a) => a.levelId === 'ground');
const dayProgram = JSON.parse(readFileSync(PROGRAMS[0], 'utf8'));

// --- Navigation: routes keep 0.28 m from furniture (hidden pieces included,
// as validate-community counts them), 0.25 m outside the open-floor class and
// 0.6 m from where anyone stands or sits for long.
const [[fx0, fz0], [fx1, fz1]] = dayProgram.floor.area;
const box = (id, [x, z], half) => ({
  id,
  position: [x, z],
  halfWidth: half,
  halfDepth: half,
});
const baseOptions = {
  ...nav.dayProgramNavOptions(),
  removedObjectIds: [],
  reservations: [
    {
      id: 'day-program-floor-margin',
      position: [(fx0 + fx1) / 2, (fz0 + fz1) / 2],
      halfWidth: (fx1 - fx0) / 2 + 0.1,
      halfDepth: (fz1 - fz0) / 2 + 0.1,
    },
  ],
};
/** Others' stationary stays of 30 s or more on the ground floor. */
const standing = others.flatMap((a) =>
  a.segments
    .filter(
      (s) =>
        s.visible !== false &&
        s.end - s.start >= 30 &&
        nav.pathLength(s.path) < 0.01,
    )
    .map((s, i) => box(`person:${a.id}:${i}`, s.path[0], SPOT_RESERVE)),
);
const plainGrid = nav.navGrid(m, baseOptions);
/**
 * nav.routeBetween, but snapping both ends into one connected part of the
 * grid rather than only onto cells connected to the main floor: the day's
 * greeter at (-3, 15) splits the east aisle in two, and a banquette sitter
 * south of them starts and ends in the southern part. Approach legs (up to
 * 1.2 m, straight) are checked against walls exactly as routeBetween checks
 * them.
 */
const componentCache = new WeakMap();
const route = (
  g,
  a,
  b,
  what,
  { seatedStart = false, seatedEnd = false } = {},
) => {
  try {
    if (!componentCache.has(g))
      componentCache.set(g, nav.componentLabels(g, ROUTE_CLEARANCE));
    const labels = componentCache.get(g),
      labelAt = ([x, z]) => {
        const i = Math.round(x / nav.NAV_STEP) - g.ix0,
          j = Math.round(z / nav.NAV_STEP) - g.iz0;
        return i < 0 || j < 0 || i >= g.nx || j >= g.nz
          ? -1
          : labels[i * g.nz + j];
      };
    // One end snaps to its nearest walkable cell, the other into that cell's
    // part of the grid; whichever order finds both (a nearest cell may be an
    // enclosed pocket, such as the island north of the tree seat).
    const pair = (first, second) => {
      const s1 = nav.snap(g, first, {
          clearance: ROUTE_CLEARANCE,
          connected: false,
        }),
        part = labelAt(s1),
        s2 = nav.snap(g, second, {
          clearance: ROUTE_CLEARANCE,
          connected: false,
          avoid: (q) => labelAt(q) !== part,
        });
      return [s1, s2];
    };
    let sa, sb;
    try {
      [sa, sb] = pair(a, b);
    } catch {
      [sb, sa] = pair(b, a);
    }
    const core =
      nav.distance(sa, sb) < 1e-6
        ? [sa]
        : nav.route(g, sa, sb, ROUTE_CLEARANCE);
    // A leg to or from a standing spot keeps the route's clearance from
    // furniture too (people are a matter of timing, settled below); one onto
    // a seat only keeps off the walls.
    const leg = (p, q, seated) => {
      const d = nav.distance(p, q);
      if (d < 1e-6) return;
      assert.ok(
        d <= 1.2,
        `approach leg too long (${d.toFixed(2)} m) at ${q.join(',')}`,
      );
      const n = Math.ceil(d / 0.05);
      for (let k = 0; k <= n; k++) {
        const x = p[0] + ((q[0] - p[0]) * k) / n,
          z = p[1] + ((q[1] - p[1]) * k) / n;
        assert.ok(
          nav.wallClearanceAt(g, [x, z]) >= 0.2,
          `approach leg clips a wall near ${q.join(',')}`,
        );
        assert.ok(
          seated || nav.isClear(plainGrid, [x, z], ROUTE_CLEARANCE),
          `approach leg passes furniture near ${q.join(',')}`,
        );
      }
    };
    leg(a, sa, seatedStart);
    leg(sb, b, seatedEnd);
    const out = [];
    if (nav.distance(a, sa) > 1e-6) out.push(a);
    out.push(...core);
    if (nav.distance(b, sb) > 1e-6) out.push(b);
    if (out.length === 1) out.push(out[0]);
    return out.map(([x, z]) => [r4(x), r4(z)]);
  } catch (e) {
    throw new Error(`${what}: ${e.message}`);
  }
};
const clearAt = (p, what) =>
  assert.ok(
    nav.isClear(plainGrid, p, ROUTE_CLEARANCE),
    `${what} (${p.join(', ')}) is not clear of walls and furniture`,
  );
const roomOf = (p) => nav.roomAt(m, 'ground', p);
const seatPose = (id) => {
  const o = object(id);
  assert.ok(o, `seat ${id}`);
  return {
    at: [r4(o.position[0]), r4(o.position[2])],
    heading: r3(o.rotation + PI),
  };
};
const banquetteZ = (n) =>
  banquetteTables.find((t) => t.id === `day-banquette-table-0${n}`).position[2];

// --- Plans: where each new person belongs, where they go and how -----------------
const plans = [];
for (const [k, id] of RTS.entries()) {
  const desk = DESKS.find((d) => d.id === RT_DESKS[k]),
    stand = deskStand(desk),
    spot = RT_SPOTS[k % 2];
  plans.push({
    id,
    role: 'activities',
    variant: 320 + k,
    label: 'Recreation therapist',
    roomId: 'lobby-office-c3',
    base: {
      at: stand.at,
      heading: stand.heading,
      action: k % 2 ? 'phone' : 'document',
      title:
        k % 2
          ? 'Calling families about next week’s outings'
          : 'Planning the week’s activities',
      zoneId: 'lobby',
    },
    visit: {
      at: spot.at,
      heading: spot.heading,
      action: 'consult',
      title: spot.title,
      zoneId: spot.zoneId,
    },
    walkOut: 'Out to the day room',
    walkBack: 'Back to the office',
    ...RT,
    firstAt: RT.firstAt(k),
  });
}
for (const [k, s] of QUIET_SEATS.entries()) {
  const table = TABLES[s.table],
    chairId = `${table.id}-chair-${s.chair}`,
    pose = seatPose(chairId),
    game = dayProgram.tableActivities[table.game];
  plans.push({
    id: s.id,
    role: 'participant',
    variant: 324 + k,
    label: `Quiet room · ${s.play ? 'player' : 'onlooker'}`,
    roomId: 'admin-waiting-west',
    seatId: chairId,
    seatedAllDay: !s.outing,
    base: {
      at: pose.at,
      heading: pose.heading,
      action: s.play ? game.play : game.others,
      title: `${game.label} ${game.labelZh} · quiet room`,
      zoneId: 'admin',
      seated: true,
    },
    ...(s.outing
      ? {
          visit: { ...QUIET_OUTING, action: 'conversation', zoneId: 'day' },
          walkOut: 'Stepping out to the day room',
          walkBack: 'Back to watch the game',
          ...QUIET,
          firstAt: QUIET.firstAt(),
        }
      : { outings: 0 }),
  });
}
for (const [k, s] of BENCH_SEATS.entries()) {
  const seat = [BENCH_X, r4(banquetteZ(s.table))],
    gapZ = r4((banquetteZ(s.gap[0]) + banquetteZ(s.gap[1])) / 2),
    away = s.to.seat
      ? seatPose(s.to.seat)
      : { at: s.to.stand, heading: s.to.heading };
  plans.push({
    id: s.id,
    role: 'participant',
    variant: 332 + k,
    label: 'Banquette regular',
    roomId: 'day-open',
    seatId: BENCH_ID,
    base: {
      at: seat,
      heading: -PI / 2,
      action: s.action,
      title: [
        'Chatting on the banquette',
        'Reading on the banquette',
        'Tea on the banquette',
      ][k % 3],
      zoneId: 'day',
      seated: true,
    },
    // Slide along the bench to the gap and straight out between the tables.
    prefix: [seat, [BENCH_X, gapZ], [BENCH_AISLE_X, gapZ]],
    visit: s.to.seat
      ? {
          at: away.at,
          heading: away.heading,
          action: 'conversation',
          title: 'Visiting friends at the tree seat',
          zoneId: 'day',
          seated: true,
        }
      : {
          at: away.at,
          heading: away.heading,
          action: s.to.action,
          title: s.to.title,
          zoneId: s.to.zoneId ?? 'day',
        },
    walkOut: 'Stretching legs',
    walkBack: 'Back to the banquette',
    ...BENCHER,
    firstAt: BENCHER.firstAt(k),
  });
}
/** Every standing spot of the new people (seats are furniture already). */
const allSpots = plans.flatMap((p) => [
  ...(p.base.seated ? [] : [p.base.at]),
  ...(p.visit && !p.visit.seated ? [p.visit.at] : []),
]);
const grids = new Map();
/** The grid for one person: everyone else's spots reserved, not their own. */
const gridFor = (ownSpots) => {
  const key = ownSpots.map((p) => p.join(',')).join(';');
  if (!grids.has(key)) {
    const spots = allSpots.filter(
      (p) => !ownSpots.some((q) => dist(p, q) < 0.01),
    );
    grids.set(
      key,
      nav.navGrid(m, {
        ...baseOptions,
        reservations: [
          ...baseOptions.reservations,
          ...standing,
          ...spots.map((p, i) => box(`spot:${i}`, p, SPOT_RESERVE)),
        ],
      }),
    );
  }
  return grids.get(key);
};
// Routes.
for (const p of plans) {
  if (!p.outings) continue;
  if (!p.visit.seated) clearAt(p.visit.at, `${p.id} visit`);
  if (!p.base.seated) clearAt(p.base.at, `${p.id} base`);
  const g = gridFor([p.base.at, p.visit.at]),
    start = p.prefix ? p.prefix.at(-1) : p.base.at,
    rest = route(g, start, p.visit.at, `${p.id} out`, {
      seatedStart: !p.prefix && !!p.base.seated,
      seatedEnd: !!p.visit.seated,
    });
  p.out = p.prefix ? [...p.prefix, ...rest.slice(1)] : rest;
  p.back = reversed(p.out);
  p.walk = nav.pathLength(p.out) / p.pace;
  assert.ok(p.walk <= 60, `${p.id}: ${p.walk.toFixed(1)} s walk`);
}

// --- Scheduling: each outing into the first window clear of everyone ------------
const STEP = 0.5,
  FRAMES = DAY / STEP,
  frameOf = (t) => ((Math.round(t / STEP) % FRAMES) + FRAMES) % FRAMES;
const frames = Array.from({ length: FRAMES }, (_, i) =>
  others.flatMap((b) => {
    const q = activity.sampleActor(b, i * STEP);
    return q.visible === false ? [] : [[q.x, q.z]];
  }),
);
const placed = Array.from({ length: FRAMES }, () => []);
const freeAt = (p, i) =>
  frames[i].every((q) => dist(p, q) >= SPACE) &&
  placed[i].every((q) => dist(p, q) >= SPACE);
/** The point `d` metres along a path. */
const along = (path, d) => {
  let left = d;
  for (let i = 1; i < path.length; i++) {
    const leg = dist(path[i - 1], path[i]);
    if (left <= leg)
      return [
        path[i - 1][0] + ((path[i][0] - path[i - 1][0]) * left) / (leg || 1),
        path[i - 1][1] + ((path[i][1] - path[i - 1][1]) * left) / (leg || 1),
      ];
    left -= leg;
  }
  return path.at(-1);
};
const walkSamples = (path, from, pace) => {
  const out = [],
    length = nav.pathLength(path);
  for (
    let t = Math.ceil(from / STEP) * STEP;
    t <= from + length / pace;
    t += STEP
  )
    out.push([t, along(path, pace * (t - from))]);
  return out;
};
const staySamples = (p, from, to) => {
  const out = [];
  for (let t = Math.ceil(from / STEP) * STEP; t < to; t += STEP)
    out.push([t, p]);
  return out;
};
const allFree = (samples) => samples.every(([t, p]) => freeAt(p, frameOf(t)));
const occupy = (samples) => {
  for (const [t, p] of samples) placed[frameOf(t)].push(p);
};
const seg = (
  start,
  end,
  action,
  path,
  zoneId,
  heading,
  title,
  seated = false,
) => ({
  start: r4(start),
  end: r4(end),
  action,
  path,
  zoneId,
  heading: r3(heading),
  ...(seated ? { seated: true } : {}),
  title,
});
const stay = (start, end, place) =>
  seg(
    start,
    end,
    place.action,
    [place.at, place.at],
    place.zoneId,
    place.heading,
    place.title,
    place.seated,
  );
const walk = (start, end, path, zoneId, title) =>
  seg(start, end, 'walk', path, zoneId, 0, title);
const events = [],
  windows = [];
// Everyone who stays put all day blocks their place for the others first;
// then outings are placed round-robin (everyone's first outing, then
// everyone's second, ...), so that people sharing a spot take turns, each
// outing in the clear window nearest its target (targets spread evenly from
// `firstAt` to a little before the latest departure that still brings the
// person back before the day ends), so that they spread over the day.
const states = plans.map((p) => ({
  p,
  segments: [],
  clock: 0,
  earliest: p.firstAt ?? 0,
}));
for (const s of states)
  if (!s.p.outings) {
    assert.ok(
      allFree(staySamples(s.p.base.at, 0, DAY)),
      `${s.p.id}: base crowded`,
    );
    occupy(staySamples(s.p.base.at, 0, DAY));
  }
const rounds = Math.max(...plans.map((p) => p.outings ?? 0));
for (let round = 0; round < rounds; round++)
  for (const s of states) {
    const p = s.p;
    if ((p.outings ?? 0) <= round) continue;
    let found = null;
    const latest = Math.floor(DAY - 2 * p.walk - p.stayRange[0] - 20),
      first = p.firstAt ?? 0,
      span = latest - 40 - first,
      target = Math.round(
        p.outings > 1 ? first + (round * span) / (p.outings - 1) : first,
      );
    const candidates = [];
    for (let dep = Math.ceil(s.earliest); dep <= latest; dep++)
      candidates.push(dep);
    candidates.sort(
      (a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b,
    );
    for (const dep of candidates) {
      if (found) break;
      const arrive = dep + p.walk,
        outWalk = walkSamples(p.out, dep, p.pace);
      if (!allFree(outWalk) || !allFree(staySamples(p.base.at, s.clock, dep)))
        continue;
      for (let v = p.stayRange[1]; v >= p.stayRange[0]; v -= 2) {
        const leave = arrive + v,
          back = leave + p.walk;
        if (back > DAY - 20) continue;
        const visit = staySamples(p.visit.at, arrive, leave),
          backWalk = walkSamples(p.back, leave, p.pace);
        if (allFree(visit) && allFree(backWalk)) {
          found = { dep, arrive, leave, back, outWalk, visit, backWalk };
          break;
        }
      }
    }
    assert.ok(
      found,
      `${p.id}: no clear window for outing ${round + 1} after ${r4(s.earliest)} s (${p.walk.toFixed(0)} s each way)\n` +
        windows.join('\n'),
    );
    const { dep, arrive, leave, back } = found;
    occupy(staySamples(p.base.at, s.clock, dep));
    occupy(found.outWalk);
    occupy(found.visit);
    occupy(found.backWalk);
    s.segments.push(
      stay(s.clock, dep, p.base),
      walk(dep, arrive, p.out, nav.zoneAt(plainGrid, p.out[0]), p.walkOut),
      stay(arrive, leave, p.visit),
      walk(leave, back, p.back, nav.zoneAt(plainGrid, p.back[0]), p.walkBack),
    );
    events.push(dep, back);
    windows.push(
      `${p.id} ${dep}-${r4(arrive)} visit ${r4(leave - arrive)} s -${r4(back)}`,
    );
    s.clock = back;
    s.earliest = back + p.minBase;
  }
const mine = states.map(({ p, segments, clock }) => {
  if (p.outings) {
    assert.ok(
      allFree(staySamples(p.base.at, clock, DAY)),
      `${p.id}: base crowded after ${clock} s`,
    );
    occupy(staySamples(p.base.at, clock, DAY));
  }
  segments.push(stay(clock, DAY, p.base));
  // Walks join exactly; the day closes where it opened.
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i],
      next = segments[(i + 1) % segments.length];
    assert.ok(s.end > s.start, `${p.id} segment ${i}`);
    assert.deepEqual(
      s.path.at(-1),
      next.path[0],
      `${p.id}: continuous at ${s.end}`,
    );
  }
  return {
    id: p.id,
    role: p.role,
    variant: p.variant,
    label: p.label,
    offset: 0,
    levelId: 'ground',
    profileId: p.id,
    segments,
    roomId: p.roomId,
    ...(p.seatId ? { seatId: p.seatId } : {}),
    ...(p.seatedAllDay ? { seated: true } : {}),
  };
});
const after = loop.actors.findLastIndex((a) => a.id.startsWith('community-'));
loop.actors.splice(after + 1, 0, ...mine);
loop.description = loop.description.replace(
  /^\d+ individual people/,
  `${loop.actors.length} individual people`,
);
assert.equal(new Set(loop.actors.map((a) => a.id)).size, loop.actors.length);

// Interactions: the quiet-room games carry the ids the day-room labels follow
// (`table-<table id without day->-<entry>`); the office and the banquette get
// all-day tracks of their own.
loop.interactions.push(
  {
    id: 'owner-review-day-admin-rt-office',
    label: 'Recreation therapists · office and rounds',
    category: 'activities',
    actorIds: RTS,
    start: 0,
    end: DAY,
    zoneId: 'lobby',
    description:
      'The recreation therapists plan programs and call families at standing desks in their office north of the day room, and go out in turn to check in at the tree-seat tables.',
  },
  ...TABLES.map((t, i) => {
    const game = dayProgram.tableActivities[t.game];
    return {
      id: `table-${t.id}-1`,
      label: `${game.label} · ${game.labelZh}`,
      category: 'activities',
      actorIds: QUIET_SEATS.filter((s) => s.table === i).map((s) => s.id),
      start: 0,
      end: DAY,
      zoneId: 'admin',
      description: `${game.label} at a square table in the quiet room (棋牌室) beside the day room: two players and two onlookers.`,
    };
  }),
  {
    id: 'owner-review-day-admin-banquette',
    label: 'Banquette regulars · coming and going',
    category: 'activities',
    actorIds: BENCH,
    start: 0,
    end: DAY,
    zoneId: 'day',
    description:
      'Participants on the day room’s east banquette, one at each banquette table, who get up now and then to visit the tree seat, the lattice bookcases or the south windows and come back.',
  },
);

// --- Checks: the rules validate-community, validate-activity and the
// cultural-program validator apply, run here before anything is written.
const normalized = {
  ...m,
  objects: m.objects.map((o) => ({ ...o, layer: o.layer || 'furniture' })),
};
const placements = new Map(),
  placementFor = (r) => {
    if (!placements.has(r.id))
      placements.set(r.id, placement.roomPlacement(normalized, r));
    return placements.get(r.id);
  };
const seatKinds = /chair|bench|stool|seat|sofa/;
const seatAt = (p) =>
  m.objects.find((o) => {
    if (!seatKinds.test(m.assets[o.assetId].kind) || o.levelId !== 'ground')
      return false;
    const [w, , d] = m.assets[o.assetId].dimensions.map(
        (v, i) => v * o.scale[i],
      ),
      dx = p[0] - o.position[0],
      dz = p[1] - o.position[2],
      x = Math.cos(o.rotation) * dx - Math.sin(o.rotation) * dz,
      z = Math.sin(o.rotation) * dx + Math.cos(o.rotation) * dz;
    return Math.abs(x) <= w / 2 + 0.05 && Math.abs(z) <= d / 2 + 0.05;
  })?.id;
/** The seat a sample may be inside: under a seated sample, or the seat a walk joins or leaves within 1.2 m. */
const seatFor = (a, p) => {
  const at = [p.x, p.z],
    n = a.segments.length,
    s = a.segments[p.segmentIndex];
  if (p.seated) return seatAt(at) ?? a.seatId;
  if (s.action === 'walk') {
    const before = a.segments[(p.segmentIndex + n - 1) % n],
      after = a.segments[(p.segmentIndex + 1) % n];
    if (after.seated && dist(at, s.path.at(-1)) <= 1.2)
      return seatAt(s.path.at(-1)) ?? a.seatId;
    if (before.seated && dist(at, s.path[0]) <= 1.2)
      return seatAt(s.path[0]) ?? a.seatId;
  }
  return a.seatId;
};
const zoneRoom = (p) => {
  const zone = m.zones.find(
    (z) => z.levelId === 'ground' && placement.insideRoom(p, z.polygon),
  );
  assert.ok(zone, `(${p.join(', ')}) is in no zone`);
  return { ...zone, id: 'open-zone:' + zone.id };
};
const conflicts = new Map();
let nearest = { gap: Infinity };
for (const a of mine) {
  const own = room(a.roomId);
  for (let t = 0; t < DAY; t += STEP) {
    const p = activity.sampleActor(a, t),
      at = [p.x, p.z];
    // Furniture and walls, in whichever room the person is in at the moment;
    // a doorway (in no room) checks against its zone.
    if (t % 1 === 0) {
      const r =
        own && placement.insideRoom(at, own.polygon)
          ? own
          : (room(roomOf(at)) ?? zoneRoom(at));
      assert.ok(
        placementFor(r).clear(at, p.seated ? 0.19 : 0.28, seatFor(a, p)),
        `${a.id}: too close to furniture or a wall at ${t} s (${at.map((v) => v.toFixed(2)).join(', ')}) in ${r.id}`,
      );
      if (p.action === 'walk')
        assert.ok(
          p.x < fx0 - 0.25 ||
            p.x > fx1 + 0.25 ||
            p.z < fz0 - 0.25 ||
            p.z > fz1 + 0.25,
          `${a.id} crosses the open floor at ${t} s`,
        );
    }
    // Personal space from everyone else on the floor, including each other.
    for (const b of [...others, ...mine]) {
      if (b.id === a.id) continue;
      const q = activity.sampleActor(b, t);
      if (q.visible === false) continue;
      const gap = Math.hypot(p.x - q.x, p.z - q.z);
      if (gap < nearest.gap) nearest = { gap, a: a.id, b: b.id, t };
      if (gap < SPACE) {
        const key = [a.id, b.id].sort(byId).join(' / '),
          worst = conflicts.get(key);
        if (!worst || gap < worst.gap)
          conflicts.set(key, {
            gap,
            t,
            at: `${p.x.toFixed(2)}, ${p.z.toFixed(2)}`,
          });
      }
    }
  }
}
assert.ok(
  !conflicts.size,
  'Too close:\n' +
    [...conflicts]
      .map(([k, c]) => `  ${k}: ${c.gap.toFixed(2)} m at ${c.t} s (${c.at})`)
      .join('\n'),
);

// --- Profiles ------------------------------------------------------------------
const library = JSON.parse(readFileSync(PROFILES[0], 'utf8'));
library.people = library.people.filter((p) => !OWNED_ACTORS.has(p.id));
const RT_ACCENT = library.roles.activities.color;
const person = (
  id,
  role,
  appearance,
  skin,
  hair,
  hairStyle,
  glasses,
  accent,
  height,
  figure,
) => ({
  id,
  role,
  appearance,
  skin,
  hair,
  hairStyle,
  glasses,
  accent,
  height,
  ...(figure ? { figure } : {}),
});
const profiles = [
  person(
    'community-57',
    'activities',
    0,
    '#dcae8b',
    '#3d3531',
    2,
    false,
    RT_ACCENT,
    1.0,
    'f',
  ),
  person(
    'community-58',
    'activities',
    1,
    '#f2c9a4',
    '#231f1c',
    1,
    true,
    RT_ACCENT,
    1.02,
    'm',
  ),
  person(
    'community-60',
    'activities',
    3,
    '#c08a61',
    '#231f1c',
    5,
    false,
    RT_ACCENT,
    0.99,
    'f',
  ),
  person(
    'community-61',
    'activities',
    5,
    '#9b684c',
    '#3d3531',
    3,
    false,
    RT_ACCENT,
    1.03,
    'm',
  ),
  person(
    'community-62',
    'participant',
    2,
    '#74503d',
    '#f2eee5',
    0,
    false,
    '#627ea6',
    0.96,
  ),
  person(
    'community-63',
    'participant',
    4,
    '#c08a61',
    '#b5b2aa',
    1,
    true,
    '#a5667c',
    0.93,
  ),
  person(
    'community-64',
    'participant',
    6,
    '#9b684c',
    '#8a8178',
    2,
    false,
    '#a6ad77',
    0.91,
  ),
  person(
    'community-65',
    'participant',
    7,
    '#dcae8b',
    '#d0cbbb',
    3,
    false,
    '#7997a6',
    1.01,
  ),
  person(
    'community-66',
    'participant',
    1,
    '#e9b18a',
    '#3d3531',
    4,
    false,
    '#aa7287',
    0.985,
  ),
  person(
    'community-67',
    'participant',
    3,
    '#74503d',
    '#f2eee5',
    2,
    true,
    '#8c7b9e',
    0.95,
  ),
  person(
    'community-68',
    'participant',
    5,
    '#c08a61',
    '#8a8178',
    0,
    false,
    '#a6ac7e',
    1.035,
  ),
  person(
    'community-69',
    'participant',
    0,
    '#f2c9a4',
    '#b5b2aa',
    1,
    false,
    '#487b89',
    0.92,
  ),
  person(
    'community-70',
    'participant',
    8,
    '#9b684c',
    '#f2eee5',
    2,
    false,
    '#d0ae66',
    0.94,
  ),
  person(
    'community-71',
    'participant',
    2,
    '#dcae8b',
    '#8a8178',
    3,
    true,
    '#627ea6',
    0.985,
  ),
  person(
    'community-72',
    'participant',
    4,
    '#74503d',
    '#b5b2aa',
    0,
    false,
    '#a5667c',
    0.91,
  ),
  person(
    'community-73',
    'participant',
    6,
    '#c08a61',
    '#3d3531',
    1,
    false,
    '#7997a6',
    1.01,
  ),
  person(
    'community-74',
    'participant',
    1,
    '#e9b18a',
    '#d0cbbb',
    2,
    false,
    '#aa7287',
    0.96,
  ),
  person(
    'community-75',
    'participant',
    3,
    '#9b684c',
    '#f2eee5',
    4,
    true,
    '#a6ad77',
    0.935,
  ),
];
assert.deepEqual(
  profiles.map((p) => p.id).sort(byId),
  [...OWNED_ACTORS].sort(byId),
);
library.people.splice(
  library.people.findLastIndex((p) => p.id.startsWith('community-')) + 1,
  0,
  ...profiles,
);
assert.ok(
  loop.actors.every((a) => library.people.some((p) => p.id === a.profileId)),
);

// --- The day program's tables ---------------------------------------------------
dayProgram.tables = dayProgram.tables.filter(
  (t) => !t.id.startsWith('quiet-table-'),
);
dayProgram.tables.push(
  ...TABLES.map((t) => ({
    id: t.id,
    schedule: [{ activity: t.game, start: 0, end: DAY }],
  })),
);

// --- The registry's items ------------------------------------------------------
review.items.push(
  {
    id: 'day-admin-recreation-therapy-office',
    rooms: ['lobby-office-c3'],
    change:
      'Central support room C3 renamed the recreation therapy office: five standing desks (worktop 1.05 m, monitor each) along the solid west and east walls, the south door lane and the north openings kept clear; the two waving participants became recreation therapists and two more were added, two at a desk at any time while the others go out to the day room and back about every minute.',
    unresolved:
      'Desk product, exact count (about five) and positions are assumed; the therapists’ day-room check-in spots are illustrative.',
  },
  {
    id: 'day-admin-quiet-room',
    rooms: ['admin-waiting-west', 'day-open'],
    change:
      'Administration waiting west renamed the quiet room · 棋牌室: a 1.02 m door cut into the day room’s east wall at the room’s north-west corner (plan-wall-154 split), the three waiting chairs removed, two square tables with four chairs each, Chinese chess on one and Go on the other with two players and two onlookers at each; the east banquette now starts south of the door.',
    unresolved:
      'Door width and position follow the architectural plan, not a survey; table and chair products are the day room’s; one onlooker’s breaks in the day room are illustrative.',
  },
  {
    id: 'day-admin-banquettes',
    rooms: ['day-open'],
    change:
      'Six more participants sit on the east banquette, one per banquette table, and come and go: each slides out past the end of the table, visits a free tree-seat chair, the lattice bookcases or the south windows and returns. The banquette tables are shortened to 1.45 m so there is a way out between them, as the plan’s short tables allow.',
    unresolved:
      'Table length is an estimate from the plan (the photo-estimated 1.63 m tables left no gap to pass); who sits where and when is illustrative.',
  },
  {
    id: 'day-admin-social-work-chairs',
    rooms: ['admin-side-office'],
    change:
      'The two chairs of the social-work office turn to face each other (north chair faces south, south chair faces north) instead of the wall desk.',
    unresolved: 'Nothing else in the room was changed.',
  },
);

// --- Write ---------------------------------------------------------------------
writeFileSync(MODEL, JSON.stringify(m, null, 2) + '\n');
// The loop keeps the generators' ASCII-escaped format.
const ascii = (s) =>
  s.replace(
    /[^\n\x20-\x7f]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
const loopOut = ascii(JSON.stringify(loop, null, 2)) + '\n';
for (const file of LOOPS) writeFileSync(file, loopOut);
const libraryOut = JSON.stringify(library, null, 2) + '\n';
for (const file of PROFILES) writeFileSync(file, libraryOut);
const programOut = JSON.stringify(dayProgram, null, 2) + '\n';
for (const file of PROGRAMS) writeFileSync(file, programOut);
events.sort((a, b) => a - b);
const cadence = events.length ? DAY / events.length : 0;
if (process.argv.includes('--verbose'))
  console.log(
    plans
      .filter((p) => p.outings)
      .map(
        (p) =>
          `${p.id}: ${nav.pathLength(p.out).toFixed(1)} m, ${p.walk.toFixed(0)} s each way`,
      )
      .join('\n') +
      '\n' +
      windows.join('\n'),
  );
console.log(
  `Owner review · day-admin: ${DESKS.length} standing desks in the recreation therapy office with ${RTS.length} therapists; quiet room with ${TABLES.length} game tables, ${QUIET_IDS.length} sitters and a ${(DOOR_Z[1] - DOOR_Z[0]).toFixed(2)} m door; ${BENCH.length} banquette regulars; social-work chairs facing each other. ${loop.actors.length} people in the loop; ${events.length} departures and returns (one every ${cadence.toFixed(0)} s); nearest approach ${nearest.gap.toFixed(2)} m (${nearest.a}/${nearest.b} at ${nearest.t} s).`,
);
