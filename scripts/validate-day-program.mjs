// Weekly day-room repertoire: rotations, repertoire fields and runtime windows.
//   node scripts/validate-day-program.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('app/data/day-program.json', 'utf8'));
assert.deepEqual(
  data,
  JSON.parse(readFileSync('public/models/day-program.json', 'utf8')),
  'public/models/day-program.json mirrors app/data/day-program.json',
);
// The Action union, read from the source so new poses are picked up without a copy.
const union = readFileSync('app/model/characters.ts', 'utf8').match(
  /export type Action =([\s\S]*?);/,
);
assert.ok(union, 'Action union found in app/model/characters.ts');
const actions = new Set([...union[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
assert.ok(actions.has('walk') && actions.size > 10, 'Action union parsed');

const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
const formats = new Set(['group', 'small-group', 'one-to-one']);
const base = data.programs,
  repertoire = data.repertoire,
  baseIds = new Set(base.map((p) => p.id));
const text = (v, what) =>
  assert.ok(
    typeof v === 'string' && v.trim().length > 0,
    `${what} is non-empty text`,
  );
const list = (v, what) => {
  assert.ok(Array.isArray(v) && v.length > 0, `${what} is a non-empty list`);
  for (const s of v) text(s, what);
  assert.equal(new Set(v).size, v.length, `${what} has no duplicates`);
};
function checkProgram(p, where) {
  for (const k of ['id', 'label', 'title', 'culture', 'access'])
    text(p[k], `${where}.${k}`);
  for (const k of ['leaderAction', 'action'])
    assert.ok(
      actions.has(p[k]),
      `${where}.${k} "${p[k]}" is in the Action union`,
    );
  list(p.cultures, `${where}.cultures`);
  list(p.languages, `${where}.languages`);
  assert.ok(formats.has(p.format), `${where}.format "${p.format}"`);
  if ('season' in p) text(p.season, `${where}.season`);
}
assert.equal(base.length, 10, 'ten base sessions');
assert.equal(baseIds.size, 10, 'base ids are unique');
base.forEach((p, i) => {
  checkProgram(p, `programs[${i}]`);
  assert.equal(p.start, i * 72, `${p.id} starts its 72 s slot`);
  assert.equal(p.end, (i + 1) * 72, `${p.id} ends its 72 s slot`);
  assert.ok(!('propsLike' in p), `base ${p.id} is its own equipment`);
});
const ids = new Set(baseIds);
repertoire.forEach((p, i) => {
  checkProgram(p, `repertoire[${i}]`);
  assert.ok(!ids.has(p.id), `repertoire id ${p.id} is unique`);
  ids.add(p.id);
  assert.ok(
    baseIds.has(p.propsLike),
    `${p.id}.propsLike "${p.propsLike}" names a base program`,
  );
});
assert.deepEqual(
  Object.keys(data.rotations).sort(),
  [...days].sort(),
  'rotations cover Monday to Friday',
);
const scheduled = new Set();
for (const day of days) {
  const r = data.rotations[day];
  assert.equal(r.length, 10, `${day} has ten slots`);
  assert.equal(new Set(r).size, 10, `${day} slots are unique`);
  for (const id of r) {
    assert.ok(ids.has(id), `${day}: ${id} is a defined program`);
    scheduled.add(id);
  }
}
assert.deepEqual(
  data.rotations.mon,
  base.map((p) => p.id),
  'mon equals the baked programs order',
);
for (const p of repertoire)
  assert.ok(scheduled.has(p.id), `${p.id} appears in at least one rotation`);

// Runtime: the compiled day-room module re-derives windows per rotation.
execFileSync('node', ['scripts/compile-model-modules.mjs'], {
  stdio: 'inherit',
});
const room = await import('../work/validation/day-room.mjs');
assert.equal(room.programRotation(), 'mon', 'Monday is the default rotation');
assert.deepEqual(
  room.dayProgram.programs.map((p) => p.id),
  data.rotations.mon,
);
for (const day of days) {
  room.setProgramRotation(day);
  assert.equal(room.programRotation(), day);
  assert.equal(room.dayProgram.programs.length, 10);
  room.dayProgram.programs.forEach((p, i) => {
    assert.equal(p.id, data.rotations[day][i], `${day} slot ${i}`);
    assert.equal(p.start, base[i].start, `${day} slot ${i} start`);
    assert.equal(p.end, base[i].end, `${day} slot ${i} end`);
    assert.equal(p.slot, i);
    assert.equal(p.baseId, base[i].id);
    assert.ok(baseIds.has(p.propsLike), `${day} ${p.id} propsLike`);
    assert.equal(room.programAt(p.start + 1).id, p.id, `${day} programAt`);
  });
  assert.equal(room.programAt(720).id, room.programAt(0).id);
}
room.setProgramRotation('mon');
assert.equal(room.programAt(3).id, base[0].id, 'rotation restores Monday');
console.log(
  `Day program: ${base.length} base + ${repertoire.length} repertoire programs across ${days.length} rotations; ${actions.size} actions in the union; slot windows re-derive per day.`,
);
