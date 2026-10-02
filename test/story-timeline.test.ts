import assert from 'node:assert/strict';
import { test } from 'node:test';
import scenario from '../app/data/scenarios/day-in-the-life.json';
import tracks from '../app/data/scenarios/day-in-the-life.tracks.json';
import { clockToLoop } from '../app/sim/clock';
import {
  isCutawayStep,
  scrubWindows,
  type TimedStep,
} from '../app/sim/story-timeline';

const hero = (a: number, b: number): TimedStep => ({ window: [a, b] });
const cut = (a: number, b: number): TimedStep => ({
  window: [a, b],
  settingId: 'pharmacy',
});
const steps = scenario.steps as unknown as (TimedStep & {
  id: string;
  kicker: string;
})[];

void test('hero windows are clipped by the cutaways on either side, never extended', () => {
  assert.deepEqual(scrubWindows([hero(0, 40), cut(26, 34), hero(40, 120)]), [
    [0, 26],
    [26, 34],
    [40, 120],
  ]);
  // Clipped on both sides by two cutaways in a row before and one after.
  assert.deepEqual(
    scrubWindows([
      hero(0, 40),
      cut(26, 34),
      cut(34, 42),
      hero(40, 120),
      cut(110, 125),
    ]),
    [
      [0, 26],
      [26, 34],
      [34, 42],
      [42, 110],
      [110, 125],
    ],
  );
  // Without cutaways every window is its own.
  assert.deepEqual(scrubWindows([hero(0, 10), hero(10, 30)]), [
    [0, 10],
    [10, 30],
  ]);
  assert.equal(isCutawayStep(cut(1, 2)), true);
  assert.equal(isCutawayStep(hero(1, 2)), false);
  // A cutaway in the center (the kitchen) has no setting, only its placement.
  const kitchen: TimedStep = { window: [289, 304], placement: { mode: 'cutaway' } };
  assert.equal(isCutawayStep(kitchen), true);
  assert.deepEqual(scrubWindows([hero(240, 290), kitchen, hero(290, 350)]), [
    [240, 289],
    [289, 304],
    [304, 350],
  ]);
});

void test('the scenario scrubs the day contiguously from 8 AM', () => {
  const scrub = scrubWindows(steps);
  assert.equal(scrub[0][0], 0);
  for (let i = 1; i < scrub.length; i++)
    assert.ok(
      Math.abs(scrub[i][0] - scrub[i - 1][1]) < 1e-6,
      `${steps[i - 1].id} → ${steps[i].id}`,
    );
  assert.ok(scrub.at(-1)![1] <= scenario.clock.duration);
  // Her mornings and afternoons at home, and lunch arriving in the kitchen.
  assert.deepEqual(
    steps.filter(isCutawayStep).map((s) => s.id),
    ['home-am', 'kitchen', 'home-pm'],
  );
});

void test('every hero focus time, stop start and kicker stays inside its scrub window', () => {
  const scrub = scrubWindows(steps);
  const compiled = new Map(tracks.steps.map((s) => [s.id, s]));
  steps.forEach((s, i) => {
    const [a, b] = scrub[i],
      c = compiled.get(s.id)!;
    assert.ok(c, `${s.id} is compiled`);
    const kicker = clockToLoop(s.kicker.split('·')[0].trim());
    assert.ok(
      kicker >= a && kicker <= b,
      `${s.id} kicker ${kicker} in ${a}–${b}`,
    );
    assert.ok(
      c.focusTime >= a && c.focusTime <= b,
      `${s.id} focus ${c.focusTime} in ${a}–${b}`,
    );
    if (isCutawayStep(s)) {
      assert.equal(c.heroPresent, false);
      assert.equal(c.focusActorId.startsWith('interaction:'), true);
      return;
    }
    assert.ok(
      c.focusTime >= a + 1 && c.focusTime <= b - 1,
      `${s.id} focus margin`,
    );
    const clippedEnd = b < s.window[1];
    for (const stop of c.stops) {
      assert.ok(
        stop.arrive >= a && stop.arrive <= b,
        `${s.id}/${stop.id} begins on screen`,
      );
      if (clippedEnd)
        assert.ok(stop.depart <= b, `${s.id}/${stop.id} ends before the cut`);
    }
  });
});
