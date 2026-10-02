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
// Monday's open-floor sessions are the baked base loop; the arts table and
// tea corner keep their own sessions every day.
const base = data.programs.filter((p) => p.zone === 'floor'),
  repertoire = data.repertoire,
  baseIds = new Set(base.map((p) => p.id)),
  decorIds = new Set(data.programs.flatMap((p) => p.decor));
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
function checkProgram(p, where, led = true) {
  for (const k of ['id', 'label', 'title', 'culture', 'access'])
    text(p[k], `${where}.${k}`);
  for (const k of led ? ['leaderAction', 'action'] : ['action'])
    assert.ok(
      actions.has(p[k]),
      `${where}.${k} "${p[k]}" is in the Action union`,
    );
  list(p.cultures, `${where}.cultures`);
  list(p.languages, `${where}.languages`);
  assert.ok(formats.has(p.format), `${where}.format "${p.format}"`);
  if ('season' in p) text(p.season, `${where}.season`);
  if ('labelZh' in p) text(p.labelZh, `${where}.labelZh`);
  for (const d of p.decor || [])
    assert.ok(decorIds.has(d), `${where}.decor "${d}" is modeled`);
}
data.programs.forEach((p, i) =>
  checkProgram(p, `programs[${i}]`, p.zone === 'floor'),
);
assert.equal(base.length, 10, 'ten base floor sessions');
assert.equal(baseIds.size, 10, 'base ids are unique');
base.forEach((p, i) => {
  assert.equal(p.start, i * 72, `${p.id} starts its 72 s slot`);
  assert.equal(p.end, (i + 1) * 72, `${p.id} ends its 72 s slot`);
  assert.ok(!('propsLike' in p), `base ${p.id} is its own equipment`);
});
const ids = new Set(data.programs.map((p) => p.id)),
  slotOf = new Map(base.map((p, i) => [p.id, i]));
repertoire.forEach((p, i) => {
  checkProgram(p, `repertoire[${i}]`);
  assert.ok(!ids.has(p.id), `repertoire id ${p.id} is unique`);
  ids.add(p.id);
  assert.ok(
    baseIds.has(p.propsLike),
    `${p.id}.propsLike "${p.propsLike}" names a base floor session`,
  );
  // Guests are baked into their slot: a repertoire program can only name the
  // instructor of the slot it runs in.
  if (p.instructorId)
    assert.equal(
      p.instructorId,
      base[slotOf.get(p.propsLike)].instructorId,
      `${p.id} names the instructor baked into the ${p.propsLike} slot`,
    );
});
assert.deepEqual(
  Object.keys(data.rotations).sort(),
  [...days].sort(),
  'rotations cover Monday to Friday',
);
const scheduled = new Set(),
  like = new Map(repertoire.map((p) => [p.id, p.propsLike]));
for (const day of days) {
  const r = data.rotations[day];
  assert.equal(r.length, 10, `${day} has ten slots`);
  assert.equal(new Set(r).size, 10, `${day} slots are unique`);
  r.forEach((id, slot) => {
    assert.ok(baseIds.has(id) || like.has(id), `${day}: ${id} is a floor program`);
    // The class's baked places (audience, grid, circle, rows, small groups)
    // fit the program: a base session keeps its slot, and a repertoire
    // program runs in the slot of the session it is like.
    assert.equal(
      like.get(id) ?? id,
      base[slot].id,
      `${day} slot ${slot}: ${id} runs in the ${base[slot].id} slot`,
    );
    scheduled.add(id);
  });
}
assert.deepEqual(
  data.rotations.mon,
  base.map((p) => p.id),
  'mon equals the baked programs order',
);
for (const p of repertoire)
  assert.ok(scheduled.has(p.id), `${p.id} appears in at least one rotation`);

// Weekly lunch: a culturally focused menu every weekday, each with a
// vegetarian main, sides, a soup or dessert and the dietitian's low-sodium,
// texture and diabetes adaptations, delivered to the kitchen before service.
const lunch = data.lunch;
text(lunch.source, 'lunch.source');
assert.deepEqual(
  Object.keys(lunch.menus).sort(),
  [...days].sort(),
  'lunch menus cover Monday to Friday',
);
const served = new Set();
for (const day of days) {
  const m = lunch.menus[day],
    where = `lunch.menus.${day}`;
  for (const k of ['title', 'main', 'vegetarian']) text(m[k], `${where}.${k}`);
  list(m.sides, `${where}.sides`);
  list(m.cultures, `${where}.cultures`);
  assert.ok(m.soup || m.dessert, `${where} has a soup or a dessert`);
  for (const k of ['soup', 'dessert']) if (k in m) text(m[k], `${where}.${k}`);
  assert.deepEqual(
    Object.keys(m.adaptations).sort(),
    ['diabetes', 'lowSodium', 'texture'],
    `${where}.adaptations: low sodium, texture and diabetes`,
  );
  for (const [k, v] of Object.entries(m.adaptations))
    text(v, `${where}.adaptations.${k}`);
  m.cultures.forEach((c) => served.add(c));
}
assert.equal(
  new Set(days.map((d) => lunch.menus[d].main)).size,
  days.length,
  'a different main every weekday',
);
assert.ok(served.size >= 6, `the week serves ${served.size} communities (≥ 6)`);
const [open, close] = lunch.service;
assert.ok(
  0 <= open && open < close && close <= 720,
  'lunch is served in the day',
);
const delivery = JSON.parse(
  readFileSync('app/data/activity-loop.json', 'utf8'),
).interactions.find((i) => i.id === lunch.delivery);
assert.ok(
  delivery?.category === 'meals' && delivery.zoneId === 'kitchen',
  `lunch.delivery "${lunch.delivery}" is a meals interaction in the kitchen`,
);
assert.ok(delivery.start < open, 'lunch reaches the kitchen before service');

// Runtime: the compiled modules re-derive the floor's windows per rotation.
execFileSync('node', ['scripts/compile-model-modules.mjs'], {
  stdio: 'inherit',
});
const program = await import('../work/validation/day-program.mjs');
const room = await import('../work/validation/day-room.mjs');
assert.equal(room.setProgramRotation, program.setProgramRotation);
assert.equal(program.programRotation(), 'mon', 'Monday is the default rotation');
assert.deepEqual(
  program.zoneSessions('floor').map((p) => p.id),
  data.rotations.mon,
);
for (const day of days) {
  program.setProgramRotation(day);
  assert.equal(program.programRotation(), day);
  const floor = program.zoneSessions('floor');
  assert.equal(floor.length, 10);
  floor.forEach((p, i) => {
    assert.equal(p.id, data.rotations[day][i], `${day} slot ${i}`);
    assert.equal(p.zone, 'floor');
    assert.equal(p.start, base[i].start, `${day} slot ${i} start`);
    assert.equal(p.end, base[i].end, `${day} slot ${i} end`);
    assert.equal(p.slot, i);
    assert.equal(p.baseId, base[i].id);
    assert.equal(p.formation, base[i].formation, `${day} ${p.id} keeps the slot layout`);
    assert.ok(baseIds.has(p.propsLike), `${day} ${p.id} propsLike`);
    if (p.id !== p.baseId)
      assert.equal(
        p.instructorId,
        like.has(p.id)
          ? repertoire.find((r) => r.id === p.id).instructorId
          : undefined,
        `${day} ${p.id} has only its own guest`,
      );
    assert.equal(program.programAt(p.start + 1).id, p.id, `${day} programAt`);
  });
  assert.equal(program.programAt(720).id, program.programAt(0).id);
  for (const zone of ['arts-table', 'tea-corner'])
    assert.deepEqual(
      program.zoneSessions(zone).map((p) => p.id),
      data.programs.filter((p) => p.zone === zone).map((p) => p.id),
      `${zone} keeps its sessions on ${day}`,
    );
  assert.deepEqual(program.todaysLunch(), lunch.menus[day], `${day} lunch`);
}
program.setProgramRotation('mon');
assert.equal(program.programAt(3).id, base[0].id, 'rotation restores Monday');
console.log(
  `Day program: ${base.length} floor + ${data.programs.length - base.length} zone sessions and ${repertoire.length} repertoire programs across ${days.length} rotations, each in a slot whose layout fits; ${actions.size} actions in the union; slot windows re-derive per day. Lunch: ${days.length} weekday menus for ${served.size} communities, each with a vegetarian main and three diet adaptations, delivered before service.`,
);
