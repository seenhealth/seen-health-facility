import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  ActivityData,
  ActorSpec,
  Interaction,
} from '../app/model/activity';
import { composeSources } from '../app/model/sources';

const DAY = 720;
const actor = (id: string, spans: [number, number][]): ActorSpec => ({
  id,
  role: 'aide',
  variant: 0,
  label: id,
  offset: 0,
  levelId: 'ground',
  segments: spans.map(([start, end]) => ({
    start,
    end,
    action: 'idle',
    path: [
      [0, 0],
      [0, 0],
    ],
    zoneId: 'site',
    heading: 0,
  })),
});
const interaction = (id: string, actorIds: string[]): Interaction => ({
  id,
  label: id,
  category: 'care',
  actorIds,
  start: 10,
  end: 20,
  zoneId: 'site',
  description: id,
});
const base = (): ActivityData => ({
  duration: DAY,
  dayStartMinutes: 480,
  dayDurationMinutes: 480,
  interactions: [interaction('base-visit', ['base-aide'])],
  description: 'Base loop.',
  timing: 'illustrative',
  actors: [actor('base-aide', [[0, DAY]])],
  roles: ['aide'],
  evidence: [],
});

void test('composes extensions onto the base without mutating it', () => {
  const b = base();
  const doctor = {
    ...actor('visit-doctor', [
      [0, 300],
      [300, DAY],
    ]),
    role: 'doctor' as const,
  };
  const out = composeSources(b, {
    id: 'clinic',
    actors: [doctor],
    interactions: [interaction('clinic-visit', ['base-aide', 'visit-doctor'])],
    description: 'Clinic visit.',
  });
  assert.deepEqual(
    out.actors.map((a) => a.id),
    ['base-aide', 'visit-doctor'],
  );
  assert.deepEqual(
    out.interactions.map((i) => i.id),
    ['base-visit', 'clinic-visit'],
  );
  assert.deepEqual(out.roles, ['aide', 'doctor']);
  assert.equal(out.description, 'Base loop. Clinic visit.');
  assert.equal(b.actors.length, 1, 'base actors untouched');
  assert.equal(b.interactions.length, 1, 'base interactions untouched');
});

void test('rejects duplicate actor ids against the base and between extensions', () => {
  assert.throws(
    () =>
      composeSources(base(), {
        id: 'dup',
        actors: [actor('base-aide', [[0, DAY]])],
      }),
    /duplicate actor id base-aide/,
  );
  assert.throws(
    () =>
      composeSources(
        base(),
        { id: 'a', actors: [actor('twin', [[0, DAY]])] },
        { id: 'b', actors: [actor('twin', [[0, DAY]])] },
      ),
    /b: duplicate actor id twin/,
  );
});

void test('rejects duplicate interaction ids and unknown interaction actors', () => {
  assert.throws(
    () =>
      composeSources(base(), {
        id: 'dup',
        interactions: [interaction('base-visit', ['base-aide'])],
      }),
    /duplicate interaction id base-visit/,
  );
  assert.throws(
    () =>
      composeSources(base(), {
        id: 'ghost',
        interactions: [interaction('ghost-visit', ['nobody'])],
      }),
    /unknown actor nobody/,
  );
});

void test('rejects actors that leave the start or the end of the day uncovered', () => {
  assert.throws(
    () =>
      composeSources(base(), {
        id: 'late',
        actors: [actor('late', [[5, DAY]])],
      }),
    /late must cover 0–720/,
  );
  assert.throws(
    () =>
      composeSources(base(), {
        id: 'early',
        actors: [actor('early', [[0, 700]])],
      }),
    /early must cover 0–720/,
  );
});

void test('rejects actors with a gap between segments', () => {
  assert.throws(
    () =>
      composeSources(base(), {
        id: 'gap',
        actors: [
          actor('gap', [
            [0, 100],
            [120, DAY],
          ]),
        ],
      }),
    /gap: gap has a gap between segments 0 and 1/,
  );
});

void test('rejects a seat that names no vehicle', () => {
  const rider = actor('rider', [
    [0, 100],
    [100, DAY],
  ]);
  rider.segments[1].seat = [0, 0.5, 0];
  assert.throws(
    () => composeSources(base(), { id: 'ride', actors: [rider] }),
    /rider segment 1 .* has a seat but no vehicleId/,
  );
  rider.segments[1].vehicleId = 'van-a';
  assert.equal(
    composeSources(base(), { id: 'ride', actors: [rider] }).actors.length,
    2,
  );
});
