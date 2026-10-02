import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ActivitySource, ActorSpec } from '../app/model/activity';
import { isStaffRole, type CharacterRole } from '../app/model/characters';
import { communitySource, wongClinicLeg } from '../app/model/community-people';
import {
  careSettingById,
  PORCH_Y,
  settingZone,
  type CareSetting,
} from '../app/model/community-settings';
import { sampleCommunityVehicle } from '../app/model/community-vehicles';
import { fillHoles, placeInstanceCast } from '../app/model/instance-cast';
import type { Facility, Vec2 } from '../app/model/schema';
import {
  checkInstanceCast,
  communityCastFromScenes,
  instanceNavOptions,
  type CastFile,
} from '../app/sim/community-cast';
import { computeMetrics } from '../app/sim/metrics';
import { storyActivitySource } from '../app/sim/story-source';
import { traceTouchpoints } from '../app/sim/trace';

// The stitch between a generated instance track and hand-authored legs
// (SPEC-facility-instance §8.6): a scheduled person leaves a stamped house
// through its front door for an `away` window, the generator leaves a hidden
// placeholder there, and `fillHoles` puts Mrs. Wong's clinic trip in it.
// The house is a stand-in for the Wongs' home (whose real plan,
// seen-home-wong, build-community-tracks generates the same way): 8 × 6 m,
// front wall on the home pad's porch line with a 1 m door at the `door`
// anchor, a living room in front and a bedroom behind.
const wall = (id: string, a: Vec2, b: Vec2) => ({
  id,
  zoneId: 'house',
  levelId: 'ground',
  a,
  b,
  height: 2.7,
  thickness: 0.15,
  material: 'wall',
  status: 'test',
  referencePages: [],
});
const room = (id: string, name: string, z0: number, z1: number) => ({
  id,
  name,
  zoneId: 'house',
  levelId: 'ground',
  polygon: [
    [-4, z0],
    [4, z0],
    [4, z1],
    [-4, z1],
  ] as Vec2[],
  kind: 'living',
  referencePages: [],
  status: 'test',
  notes: '',
});
const house = {
  schemaVersion: '2.0',
  id: 'test-house',
  name: 'Test house',
  revision: 'test-1',
  levels: [
    {
      id: 'ground',
      name: 'Ground',
      elevation: 0,
      order: 0,
      referencePages: [],
      elevationStatus: 'test',
      notes: '',
    },
  ],
  zones: [
    {
      id: 'house',
      name: 'House',
      short: 'House',
      color: '#cccccc',
      levelId: 'ground',
      polygon: [
        [-4, -6],
        [4, -6],
        [4, 0],
        [-4, 0],
      ],
      referencePages: [],
      floorMaterial: 'floor',
      notes: '',
      publishedAreaSqFt: null,
      tracedFootprintSqFt: 0,
      programId: 'home',
      wallHeight: 2.7,
      wallHeightStatus: 'test',
      geometryStatus: 'test',
      spread: [0, 0],
    },
  ],
  rooms: [room('living', 'Living room', -3, 0), room('bedroom', 'Bedroom', -6, -3)],
  walls: [
    wall('front-w', [-4, 0], [-0.5, 0]),
    wall('front-e', [0.5, 0], [4, 0]),
    wall('east', [4, 0], [4, -6]),
    wall('back', [4, -6], [-4, -6]),
    wall('west', [-4, -6], [-4, 0]),
    wall('mid-w', [-4, -3], [-0.6, -3]),
    wall('mid-e', [0.6, -3], [4, -3]),
  ],
  assets: {},
  objects: [],
  materials: {},
} as unknown as Facility;
const home = careSettingById('home-wong')!;
const setting: CareSetting = {
  ...home,
  facility: {
    id: house.id,
    url: '/models/test-house.json',
    frame: { position: [0.4, -7.6], heading: 0 },
    levelIds: ['ground'],
    floorY: PORCH_Y,
  },
};
const chair: Vec2 = [-2, -1.5];
const cast: CastFile = {
  setting: 'home-wong',
  people: [
    {
      id: 'home-participant',
      role: 'participant',
      label: 'Mrs. Wong · at home',
      variant: 3,
      mobility: 'walker',
      arrive: { t: 0, anchor: chair },
      leave: { t: 720, anchor: 'door' },
      away: [[80.5, 370]],
      stops: [
        {
          window: [0, 60],
          roomId: 'living',
          at: chair,
          heading: 0,
          action: 'seated',
          seated: true,
          title: 'Personal care & morning medicines',
        },
        {
          window: [390, 700],
          roomId: 'living',
          at: chair,
          heading: 0,
          action: 'seated',
          seated: true,
          title: 'Afternoon in the living room',
        },
      ],
    },
  ],
};
const near = (a: Vec2, b: Vec2, tol = 0.05) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
const nav = instanceNavOptions(setting.facility!, 'ground');
const generated = communityCastFromScenes(
  house,
  setting.facility!.frame,
  cast,
  { setting, nav },
);
const placed = placeInstanceCast(setting, generated);
const wong = placed.actors.find((a) => a.id === 'home-participant')!;
const holes = placed.holes['home-participant'];
const leg = (hole: (typeof holes)[number]) =>
  hole.kind === 'away' ? wongClinicLeg(hole, settingZone(home.id)) : undefined;

void test('the generator leaves a hidden placeholder over the away window, at the door', () => {
  checkInstanceCast(house, setting, generated, { nav });
  assert.deepEqual(
    holes.map((h) => [h.kind, h.start, h.end]),
    [['away', 80.5, 370]],
  );
  assert.ok(near(holes[0].from, home.anchors.door), 'leaves by the door');
  assert.ok(near(holes[0].to, home.anchors.door), 'comes back by the door');
  const hidden = wong.segments.filter((s) => s.visible === false);
  assert.deepEqual(
    hidden.map((s) => [s.start, s.end]),
    [[80.5, 370]],
  );
});

void test('the clinic trip fills the hole: one contiguous day, 0–720', () => {
  const day = fillHoles(wong, holes, leg);
  assert.equal(day.segments[0].start, 0);
  assert.equal(day.segments.at(-1)!.end, 720);
  for (let i = 1; i < day.segments.length; i++) {
    const a = day.segments[i - 1],
      b = day.segments[i];
    assert.equal(b.start, a.end, `segment ${i} starts where ${i - 1} ends`);
    // A rider moves with the van's seat and steps out wherever it stopped.
    if (!a.vehicleId)
      assert.ok(
        near(a.path.at(-1)!, b.path[0]),
        `no jump at ${b.start} s (${a.title} → ${b.title})`,
      );
  }
  assert.ok(day.segments.every((s) => s.visible !== false), 'never hidden');
  const at = (t: number) =>
    day.segments.find((s) => s.start <= t && t < s.end)!;
  // Seams: the generated walk reaches the door at 80.5 s and the trip leaves
  // it; the trip brings her back to the door at 370 s and the generated
  // track walks her in.
  assert.equal(at(80.4).action, 'walk');
  assert.ok(near(at(80.4).path.at(-1)!, home.anchors.door));
  assert.equal(at(80.5).title, 'Out to the van');
  assert.ok(near(at(80.5).path[0], home.anchors.door));
  assert.equal(at(369.9).title, 'In at the front door');
  assert.ok(near(at(369.9).path.at(-1)!, home.anchors.door));
  assert.ok(near(at(370).path[0], home.anchors.door));
  assert.deepEqual(
    day.segments.filter((s) => s.vehicleId).map((s) => [s.start, s.end]),
    [
      [108.5, 181],
      [257.5, 337],
    ],
  );
});

void test("the Wongs' generated day carries the same trip in her away window", () => {
  const model = JSON.parse(
    readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
  ) as Facility;
  const composed = (communitySource(model).actors ?? [])
    .find((a) => a.id === 'home-participant')!
    .segments.filter((s) => s.start >= 80.5 && s.end <= 370);
  // Both holes run from the home's front door and back to it.
  assert.deepEqual(composed, leg(holes[0]));
});

void test('a leg must cover its hole and meet the door', () => {
  const short = (hole: (typeof holes)[number]) => leg(hole)!.slice(0, -1);
  assert.throws(() => fillHoles(wong, holes, short), /covers/);
  const astray = (hole: (typeof holes)[number]) =>
    leg({ ...hole, to: [hole.to[0] + 1, hole.to[1]] });
  assert.throws(() => fillHoles(wong, holes, astray), /must start at/);
  // No leg: the placeholder stays, out of sight.
  assert.deepEqual(fillHoles(wong, holes, () => undefined).segments, wong.segments);
});

// A sofa in the living room and three more scheduled people: the shapes a
// home's cast needs beyond the clinic trip.
const sofaHouse = {
  ...house,
  assets: { sofa: { kind: 'sofa', dimensions: [2, 0.85, 0.8], material: 'fabric' } },
  objects: [
    {
      id: 'living-sofa',
      assetId: 'sofa',
      zoneId: 'house',
      levelId: 'ground',
      roomId: 'living',
      position: [2, 0, -2.5],
      rotation: 0,
      scale: [1, 1, 1],
      referencePages: [],
      status: 'test',
      notes: '',
      layer: 'furniture',
    },
  ],
} as unknown as Facility;
const onSofa: Vec2 = [1.5, -2.5];
const homeCast = (seat?: string): CastFile => ({
  setting: 'home-wong',
  people: [
    // Home from hospital at 600 s and present to the end of the day: the
    // seam is out of sight (hidden at 0 s), so the day need not end where it
    // starts.
    {
      id: 'home-resident',
      role: 'participant',
      label: 'Resident',
      variant: 8,
      arrive: { t: 600, anchor: 'door' },
      leave: { t: 720, anchor: 'door' },
      stops: [
        {
          window: [610, 720],
          roomId: 'living',
          at: onSofa,
          heading: Math.PI,
          action: 'seated',
          seated: true,
          ...(seat ? { seat } : {}),
          title: 'On the sofa',
          with: ['nurse-line-rn'],
          interaction: {
            id: 'home-evening-call',
            category: 'after-hours',
            label: 'Evening call',
            description: 'A call with someone outside the house.',
            window: [690, 708],
          },
        },
      ],
    },
    // Stops shorter than the generator's 8 s minimum stay keep their windows.
    {
      id: 'home-visitor',
      role: 'aide',
      label: 'Visitor',
      variant: 2,
      arrive: { t: 100, anchor: 'door' },
      leave: { t: 140, anchor: 'door' },
      stops: [
        { window: [108, 111], roomId: 'living', at: [-2.5, -1.5], heading: 0, action: 'serve', title: 'A short task' },
        { window: [119, 122], roomId: 'bedroom', at: [-2, -4.5], heading: 0, action: 'serve', title: 'Another one' },
      ],
    },
  ],
});
const generate = (cast: CastFile) =>
  communityCastFromScenes(sofaHouse, setting.facility!.frame, cast, { setting, nav });

void test('scheduled people: a late arrival present at 720 s, short stops, a sofa seat, outside members', () => {
  const cast = generate(homeCast('living-sofa'));
  const report = checkInstanceCast(sofaHouse, setting, cast, { nav });
  assert.deepEqual(report.external, ['nurse-line-rn']);
  assert.deepEqual(
    cast.holes['home-resident'].map((h) => [h.kind, h.start, h.end]),
    [['before', 0, 600]],
  );
  const call = cast.interactions.find((i) => i.id === 'home-evening-call')!;
  assert.deepEqual(call.actorIds, ['home-resident', 'nurse-line-rn']);
  const visitor = cast.actors.find((a) => a.id === 'home-visitor')!;
  for (const [t0, t1] of [
    [108, 111],
    [119, 122],
  ]) {
    const hold = visitor.segments.find((s) => s.start <= t0 && s.end >= t1);
    assert.ok(hold && hold.action === 'serve', `holds ${t0}–${t1}`);
  }
  // The sofa is named on the seated pose, for the furniture check only.
  assert.ok(
    cast.actors
      .find((a) => a.id === 'home-resident')!
      .segments.some((s) => s.seated && s.seatId === 'living-sofa'),
  );
  assert.ok(
    placeInstanceCast(setting, cast).actors.every((a) =>
      a.segments.every((s) => !('seatId' in s)),
    ),
  );
  // Without `seat`, sitting at that point overlaps the sofa.
  assert.throws(
    () => checkInstanceCast(sofaHouse, setting, generate(homeCast()), { nav }),
    /overlaps furniture/,
  );
});

// Mrs. Lin's home (home-lin): the story's participant at home with her
// daughter, generated in the Wongs' plan, and her Seen van there and back
// filling her `away` hole (HOLE_LEGS).
void test("Mrs. Lin's home: at home with her daughter, on her Seen van there and back", () => {
  const model = JSON.parse(
    readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
  ) as Facility;
  const source = communitySource(model),
    actor = (id: string) => (source.actors ?? []).find((a) => a.id === id)!,
    interaction = (id: string) =>
      (source.interactions ?? []).find((i) => i.id === id)!,
    lin = actor('lin-at-home'),
    daughter = actor('lin-daughter');
  // The center's Mrs. Lin (the story's hero) is the same person, drawn alike.
  const { source: story, heroId } = storyActivitySource(),
    hero = story.actors.find((a) => a.id === heroId)!;
  assert.deepEqual(
    [lin.role, lin.profileId, lin.variant, lin.mobility],
    [hero.role, hero.profileId, hero.variant, hero.mobility],
  );
  assert.equal(daughter.role, 'family');
  assert.ok(!isStaffRole(daughter.role), 'her daughter is not staff');
  const at = (a: ActorSpec, t: number) =>
    a.segments.find((s) => s.start <= t && t < s.end)!;
  assert.equal(at(lin, 12).action, 'tabletop', 'breakfast at 8:08');
  assert.equal(at(lin, 300).visible, false, 'at the center, out of sight');
  assert.ok(at(lin, 719.5).seated && at(daughter, 719.5).seated, 'tea on the sofa');
  // On board from the apex until the van has left the map, and from its return.
  assert.deepEqual(
    lin.segments.filter((s) => s.vehicleId).map((s) => [s.vehicleId, s.start, s.end]),
    [
      ['van-lin', 43.7, 62],
      ['van-lin', 624, 637],
    ],
  );
  const van = (t: number) => sampleCommunityVehicle('van-lin', t);
  assert.ok((van(43.7).ramp ?? 0) > 0.99, 'she boards with the ramp down');
  assert.ok((van(637).ramp ?? 0) > 0.99, 'and steps off with it down');
  assert.equal(van(49.9).phase, 'Picking up Mrs. Lin');
  assert.equal(van(50).phase, 'Taking Mrs. Lin to the center');
  assert.ok(!van(300).visible, 'the van is off the map at midday');
  for (const id of ['lin-van-pickup', 'lin-van-dropoff'])
    assert.deepEqual(interaction(id).actorIds, [
      'lin-at-home',
      'lin-daughter',
      'lin-van-driver',
    ]);
  assert.deepEqual(interaction('lin-breakfast').actorIds, [
    'lin-at-home',
    'lin-daughter',
  ]);
  const evening = interaction('lin-evening');
  assert.ok(evening.start <= 700 && evening.end === 720, 'the story closes on tea');
});

void test('family members are neither staff nor participants in Measure and the trace', () => {
  const still = (id: string, role: CharacterRole, x: number): ActorSpec => ({
    id,
    role,
    variant: 0,
    label: id,
    offset: 0,
    levelId: 'site',
    segments: [
      {
        start: 0,
        end: 720,
        action: 'idle',
        path: [
          [x, 0],
          [x, 0],
        ],
        zoneId: 'site',
        heading: 0,
      },
    ],
  });
  const care = (id: string, actorIds: string[], start: number) => ({
    id,
    label: id,
    category: 'home',
    actorIds,
    start,
    end: start + 20,
    zoneId: 'site',
    description: id,
  });
  // Breakfast with her daughter, then a visit from the nurse.
  const source: ActivitySource = {
    duration: 720,
    dayStartMinutes: 480,
    dayDurationMinutes: 480,
    description: 'A home.',
    timing: 'illustrative',
    evidence: [],
    roles: ['participant', 'family', 'nurse'],
    actors: [
      still('mother', 'participant', 0),
      still('daughter', 'family', 1),
      still('nurse', 'nurse', 2),
    ],
    interactions: [
      care('breakfast', ['mother', 'daughter'], 10),
      care('visit', ['mother', 'nurse'], 40),
    ],
  };
  const model = { zones: [], rooms: [] } as unknown as Facility,
    m = computeMetrics(source, model, { step: 2 });
  const { people, participants, staff, family } = m.headline;
  assert.deepEqual([people, participants, staff, family], [3, 1, 1, 1]);
  const street = m.zones.find((z) => z.zoneId === 'site')!;
  assert.deepEqual([street.peakParticipants, street.peakStaff], [1, 1]);
  // Her daughter is not a care-team member, so the nurse's arrival is no handoff.
  const events = traceTouchpoints(source, model, { step: 1 });
  assert.equal(events.filter((e) => e.kind === 'handoff').length, 0);
  assert.ok(
    events.some(
      (e) => e.actorId === 'daughter' && e.interactionId === 'breakfast',
    ),
    'she is traced in the breakfast',
  );
});
