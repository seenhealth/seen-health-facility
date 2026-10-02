import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  describeActor,
  type ActivityData,
  type ActorSpec,
  type Interaction,
  type Segment,
} from '../app/model/activity';
import type { Action } from '../app/model/characters';
import {
  assetCatalog,
  describeAsset,
  isInspectable,
} from '../app/model/asset-catalog';
import { statusWords } from '../app/model/inspect';
import type { Asset, Facility, Instance } from '../app/model/schema';

const DAY = 720;
const segment = (
  start: number,
  end: number,
  action: Action,
  title: string,
): Segment => ({
  start,
  end,
  action,
  title,
  path: [
    [0, 0],
    [1, 0],
  ],
  zoneId: 'day',
  heading: 0,
});
const person = (offset = 0): ActorSpec => ({
  id: 'p',
  role: 'participant',
  variant: 0,
  label: 'P',
  offset,
  levelId: 'ground',
  segments: [
    segment(0, 100, 'seated', 'Breakfast'),
    segment(100, 110, 'walk', 'Walk to next activity'),
    segment(110, 200, 'exercise', 'Tai chi'),
    segment(200, 300, 'exercise', 'Tai chi'),
    segment(300, 320, 'walk', 'Walk to next activity'),
    segment(320, DAY, 'seated', 'Lunch'),
  ],
});
const interaction = (
  id: string,
  start: number,
  end: number,
  actorIds = ['p'],
): Interaction => ({
  id,
  label: id,
  category: 'activities',
  actorIds,
  start,
  end,
  zoneId: 'day',
  description: id,
});
const source = (actor: ActorSpec, interactions: Interaction[] = []) =>
  ({
    duration: DAY,
    dayStartMinutes: 480,
    dayDurationMinutes: 480,
    interactions,
    description: '',
    timing: '',
    actors: [actor],
    roles: ['participant'],
    evidence: [],
  }) as ActivityData;

void test('describeActor: the segment now, the next activity and its start', () => {
  const data = source(person());
  const breakfast = describeActor(data, data.actors[0], 50);
  assert.equal(breakfast.segment.title, 'Breakfast');
  assert.deepEqual([breakfast.start, breakfast.end], [0, 100]);
  // The walk in between is skipped; so is the second Tai chi segment.
  assert.equal(breakfast.next?.segment.title, 'Tai chi');
  assert.equal(breakfast.next?.start, 110);
  const walking = describeActor(data, data.actors[0], 105);
  assert.equal(walking.segment.action, 'walk');
  assert.equal(walking.next?.segment.title, 'Tai chi');
  assert.equal(
    describeActor(data, data.actors[0], 150).next?.segment.title,
    'Lunch',
  );
  // Round the loop: after lunch comes tomorrow's breakfast at 0 s.
  const lunch = describeActor(data, data.actors[0], 700);
  assert.equal(lunch.next?.segment.title, 'Breakfast');
  assert.equal(lunch.next?.start, 0);
});

void test('describeActor: segment times follow the actor offset onto the loop clock', () => {
  const data = source(person(100));
  // Loop time 50 is actor time 150: Tai chi, which started at actor 110 = loop 10.
  const now = describeActor(data, data.actors[0], 50);
  assert.equal(now.segment.title, 'Tai chi');
  assert.equal(now.start, 10);
  assert.equal(now.next?.segment.title, 'Lunch');
  assert.equal(now.next?.start, 220);
  // Breakfast starts at actor 0 = loop 620.
  assert.equal(describeActor(data, data.actors[0], 300).next?.start, 620);
});

void test('describeActor: the shortest interaction under way, across the loop seam', () => {
  const data = source(person(), [
    interaction('day', 0, DAY),
    interaction('class', 110, 200),
    interaction('night', 700, 740),
    interaction('other', 110, 200, ['q']),
  ]);
  const a = data.actors[0];
  assert.equal(describeActor(data, a, 150).interaction?.id, 'class');
  assert.equal(describeActor(data, a, 50).interaction?.id, 'day');
  assert.equal(describeActor(data, a, 10).interaction?.id, 'night');
  assert.equal(describeActor(data, a, 705).interaction?.id, 'night');
  assert.equal(describeActor(source(person()), a, 150).interaction, null);
});

const asset = (kind: string, extra: Partial<Asset> = {}): Asset => ({
  kind,
  dimensions: [1, 1, 1],
  material: 'oak',
  ...extra,
});
const object = (layer?: Instance['layer'], assetId = 'a'): Instance => ({
  id: 'o',
  assetId,
  zoneId: 'z',
  levelId: 'ground',
  position: [0, 0, 0],
  rotation: 0,
  scale: [1, 1, 1],
  referencePages: [],
  status: '',
  notes: '',
  layer,
});

void test('describeAsset: asset id, table setting and home wording before the kind', () => {
  assert.equal(
    describeAsset('interior-bars', asset('rehab-bars')).name,
    'Parallel bars',
  );
  assert.match(
    describeAsset('interior-bars', asset('rehab-bars')).purpose,
    /physical therapist/,
  );
  assert.equal(
    describeAsset('refrigerator', asset('box')).name,
    'Refrigerator',
  );
  assert.equal(
    describeAsset(
      'daily-top-day-north-table-1',
      asset('activity-tabletop', { parameters: { activity: 'craft' } }),
    ).name,
    'Craft supplies',
  );
  const table = describeAsset('plan-dining-table', asset('table')),
    homeTable = describeAsset('plan-dining-table', asset('table'), {
      home: true,
    });
  assert.equal(table.name, 'Dining table');
  assert.equal(homeTable.name, 'Dining table');
  assert.notEqual(homeTable.purpose, table.purpose);
  assert.match(homeTable.purpose, /wheelchair/);
});

void test('describeAsset: unknown kinds and generic boxes fall back to the specification', () => {
  const named = describeAsset('adc-sensory-table', {
    ...asset('sensory-table'),
    name: 'Sensory table',
  } as Asset);
  assert.equal(named.name, 'Sensory table');
  assert.equal(named.catalogued, false);
  assert.match(named.purpose, /sensory table/);
  assert.equal(
    describeAsset('photo-clinic-red-cart', asset('box')).name,
    'Clinic red cart',
  );
  assert.equal(
    describeAsset('alveare-counter-31', asset('mystery')).name,
    'Counter',
  );
});

void test('isInspectable: furniture and fittings, not doors, stairs or finishes', () => {
  assert.equal(isInspectable(object(), asset('chair')), true);
  assert.equal(
    isInspectable(object('furniture', 'box-id'), asset('box')),
    true,
  );
  assert.equal(isInspectable(object('architecture'), asset('grab-bar')), true);
  assert.equal(
    isInspectable(object('architecture'), asset('plan-door')),
    false,
  );
  assert.equal(
    isInspectable(object('architecture'), asset('connected-stair')),
    false,
  );
  assert.equal(
    isInspectable(object('architecture', 'stall-door'), asset('box')),
    false,
  );
  assert.equal(
    isInspectable(object('architecture', 'upperfit-display'), asset('box')),
    true,
  );
  assert.equal(
    isInspectable(object('wall-finish'), asset('sliding-door')),
    false,
  );
  assert.equal(isInspectable(object('exterior'), asset('fleet-van')), false);
  assert.equal(isInspectable(object(), undefined), false);
});

void test('every asset kind of the published sites and the home has a catalog entry', () => {
  for (const file of [
    'seen-alhambra-planning',
    'seen-olympic',
    'seen-olympic-option',
    'seen-alveare',
    'seen-home-wong',
  ]) {
    const f = JSON.parse(
      readFileSync(`public/models/${file}.json`, 'utf8'),
    ) as Facility;
    for (const [id, a] of Object.entries(f.assets))
      assert.ok(
        assetCatalog[a.kind],
        `${file}: asset ${id} has kind ${a.kind} without an entry in app/model/asset-catalog.ts`,
      );
  }
});

void test('statusWords: evidence lines read as words', () => {
  assert.equal(
    statusWords('image-traced-position-and-footprint / height-inferred'),
    'Image traced position and footprint · height inferred',
  );
  assert.equal(
    statusWords('Plan symbol / shared Seen asset'),
    'Plan symbol · shared Seen asset',
  );
});
