import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solarPosition, sunDirection } from '../app/model/daylight';

// The center is on the north side of Valley Blvd with Ethel Avenue to its
// west (frame.ts COMPASS): +x east, +z south.
const sunAt = (iso: string) => {
  const { azimuth, elevation } = solarPosition(new Date(iso));
  return sunDirection(azimuth, elevation);
};

void test('the midday sun stands south of the center, over Valley Blvd (+z)', () => {
  const [x, y, z] = sunAt('2026-12-21T12:00:00-08:00');
  assert.ok(y > 0, 'above the horizon');
  assert.ok(z > 0.5, `south is +z (z ${z.toFixed(2)})`);
  assert.ok(Math.abs(x) < 0.3, `near due south (x ${x.toFixed(2)})`);
});

void test('the morning sun is east (+x) and the evening sun west (−x)', () => {
  assert.ok(sunAt('2026-06-21T08:00:00-07:00')[0] > 0.5, 'morning: east');
  assert.ok(sunAt('2026-06-21T18:00:00-07:00')[0] < -0.5, 'evening: west');
});
