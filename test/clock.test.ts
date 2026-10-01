import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityData, dayTime } from '../app/model/activity';
import { CARE_DAY, clockLabel } from '../app/sim/clock';
import {
  clock as storyClock,
  clockLabel as storyClockLabel,
} from '../app/story/data';

void test('the three clock configurations describe the same care day', () => {
  assert.equal(activityData.duration, CARE_DAY.duration);
  assert.equal(activityData.dayStartMinutes, CARE_DAY.dayStartMinutes);
  assert.equal(activityData.dayDurationMinutes, CARE_DAY.dayDurationMinutes);
  assert.deepEqual(
    {
      duration: storyClock.duration,
      dayStartMinutes: storyClock.dayStartMinutes,
      dayDurationMinutes: storyClock.dayDurationMinutes,
    },
    CARE_DAY,
  );
});

void test('engine, simulation and story clock labels agree every 0.25 s', () => {
  let checked = 0;
  for (let k = 0; k < CARE_DAY.duration * 4; k++) {
    const t = k / 4,
      label = dayTime(t);
    assert.equal(clockLabel(t), label, `sim/clock clockLabel(${t})`);
    assert.equal(storyClockLabel(t), label, `story clockLabel(${t})`);
    checked++;
  }
  assert.equal(checked, 2880);
});

void test('clock labels hit the documented anchors', () => {
  assert.equal(dayTime(0), '8:00 AM');
  assert.equal(dayTime(1.5), '8:01 AM');
  assert.equal(dayTime(360), '12:00 PM');
  assert.equal(dayTime(719.75), '3:59 PM');
});
