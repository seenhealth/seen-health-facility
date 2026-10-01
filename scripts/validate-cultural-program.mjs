// The day room's cultural program must show on the floor, not only in the data: concurrent zones
// led by costumed guest instructors, many engaged participants, distinct movements, labels and décor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {
  activityData,
  createActivity,
  sampleActor,
} from '../work/validation/activity.mjs';
import {
  dayProgram,
  sessionsAt,
  zoneSessions,
} from '../work/validation/day-program.mjs';
import {
  characterProfile,
  createCharacter,
} from '../work/validation/characters.mjs';

const m = JSON.parse(
  fs.readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
);
const D = activityData.duration,
  actors = new Map(activityData.actors.map((a) => [a.id, a])),
  sessionOf = new Map(dayProgram.programs.map((s) => [s.id, s]));
const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
const FORMATIONS = dayProgram.floor.formations,
  SHIFT = dayProgram.floor.transition,
  [[AX0, AZ0], [AX1, AZ1]] = dayProgram.floor.area,
  cohort = dayProgram.stations.map((s) => actors.get(s.actorId));

// 1. Every zone is a gap-free rotation over the care day.
for (const zone of dayProgram.zones) {
  let clock = 0;
  for (const s of zoneSessions(zone.id)) {
    assert.equal(s.start, clock, `${s.id} follows the previous ${zone.id} session`);
    clock = s.end;
  }
  assert.equal(clock, D, `${zone.id} covers the care day`);
}

// 2. Guest instructors: distinct people in activity attire, on site exactly for their sessions.
const attire = new Set();
for (const person of dayProgram.instructors) {
  const a = actors.get(person.id);
  assert.ok(a, `${person.id} is in the cast`);
  assert.equal(a.role, 'instructor');
  const { costume } = characterProfile(a);
  assert.ok(costume?.style, `${person.id} wears activity attire`);
  attire.add(`${costume.style}/${costume.color}`);
  const led = dayProgram.programs.filter((s) => s.instructorId === person.id),
    onFloor = led[0].zone === 'floor',
    spot = onFloor
      ? FORMATIONS[led[0].formation].lead
      : dayProgram.zones.find((z) => z.id === led[0].zone).instructorSpot.position;
  for (let t = 0; t < D; t += 0.5) {
    const p = sampleActor(a, t),
      // Floor guests step in once the class has rearranged.
      session = led.find((s) => t >= s.start + (onFloor ? SHIFT : 0) && t < s.end);
    assert.equal(p.visible !== false, !!session, `${person.id} on site at ${t}`);
    assert.ok(near([p.x, p.z], spot), `${person.id} stays at the zone's spot`);
    if (session) assert.equal(p.action, session.instructorAction);
  }
}
assert.equal(attire.size, dayProgram.instructors.length, 'Each instructor dresses differently');

// 3. At every moment: at least two zones led by a visible guest, and 15+ participants engaged.
let minEngaged = Infinity;
for (let t = 0; t < D; t += 2) {
  const now = sessionsAt(t);
  const led = now.filter(
    ({ session }) =>
      session.instructorId &&
      sampleActor(actors.get(session.instructorId), t).visible !== false,
  );
  assert.ok(led.length >= 2, `Two guest-led cultural activities at ${t}`);
  let engaged = 0;
  for (const { zone, session } of now) {
    if (zone.id === 'floor') {
      for (const s of dayProgram.stations.filter((s) => !['leader', 'support'].includes(s.mode))) {
        const p = sampleActor(actors.get(s.actorId), t);
        if (p.visible !== false && !['walk', 'roll', 'idle'].includes(p.action)) engaged++;
      }
      continue;
    }
    for (const id of zone.participants) {
      const p = sampleActor(actors.get(id), t);
      if (p.visible !== false && p.action === session.action) engaged++;
    }
  }
  minEngaged = Math.min(minEngaged, engaged);
}
assert.ok(minEngaged >= 15, `At least 15 participants engaged (${minEngaged})`);

// 4. No stray exercise classes: in the day room, only the floor's exercise session exercises.
const exercise = dayProgram.programs.find((s) => s.action === 'exercise');
for (const a of activityData.actors)
  for (let t = 0; t < D; t += 1) {
    const p = sampleActor(a, t);
    if (p.visible === false || p.zoneId !== 'day' || p.action !== 'exercise')
      continue;
    assert.ok(
      t >= exercise.start && t < exercise.end,
      `${a.id} exercises in the day room outside the exercise session at ${t}`,
    );
  }

// 5. Guests keep personal space from everyone around them while on site.
for (const person of dayProgram.instructors) {
  const a = actors.get(person.id);
  for (let t = 0; t < D; t += 1) {
    const p = sampleActor(a, t);
    if (p.visible === false) continue;
    for (const other of activityData.actors) {
      if (other === a || other.levelId !== 'ground') continue;
      const q = sampleActor(other, t);
      if (q.visible === false) continue;
      assert.ok(
        Math.hypot(p.x - q.x, p.z - q.z) >= 0.5,
        `${person.id} and ${other.id} need space at ${t}`,
      );
    }
  }
}

// 5b. The open-floor class: a different layout for different activities, everyone inside the area
// and apart from one another even while rearranging.
const layouts = new Set(dayProgram.programs.filter((s) => s.zone === 'floor').map((s) => s.formation));
assert.ok(layouts.size >= 5, `Floor layouts vary by activity (${layouts.size})`);
let closestPair = Infinity;
for (let t = 0; t < D; t += 0.1) {
  const at = cohort.map((a) => sampleActor(a, t));
  for (const p of at)
    assert.ok(p.x >= AX0 - 0.6 && p.x <= AX1 + 0.6 && p.z >= AZ0 - 0.6 && p.z <= AZ1 + 0.6, `Class stays on the floor at ${t}`);
  for (let i = 0; i < at.length; i++)
    for (let j = i + 1; j < at.length; j++)
      closestPair = Math.min(closestPair, Math.hypot(at[i].x - at[j].x, at[i].z - at[j].z));
}
assert.ok(closestPair >= 0.5, `Class members keep 0.5 m apart (${closestPair.toFixed(2)})`);
const groupSizes = dayProgram.programs
  .filter((s) => s.zone === 'floor')
  .map((s) => {
    const t = (s.start + s.end) / 2;
    return dayProgram.stations
      .filter((st) => !['leader', 'support'].includes(st.mode))
      .filter((st) => sampleActor(actors.get(st.actorId), t).action === s.action).length;
  });
assert.ok(Math.max(...groupSizes) >= 10 && Math.min(...groupSizes) <= 6, `Big and small groups (${groupSizes})`);

// 5c. Side tables: games and crafts change through the day; players play, others look on.
const activities = dayProgram.tableActivities;
let fewestKinds = Infinity;
for (let t = 0; t < D; t += 10) {
  const kinds = new Set(dayProgram.tables.map((tb) => tb.schedule.find((e) => t >= e.start && t < e.end).activity));
  fewestKinds = Math.min(fewestKinds, kinds.size);
}
assert.ok(fewestKinds >= 8, `Many table activities at once (${fewestKinds})`);
for (const game of ['xiangqi', 'go', 'checkers', 'mahjong', 'cards'])
  assert.ok(dayProgram.tables.some((tb) => tb.schedule.some((e) => e.activity === game)), `${game} is played`);
const seatPrefix = (id) =>
  id.startsWith('day-tree-table-')
    ? `day-tree-chair-${id.split('-').at(-1)}-`
    : id === 'day-photo-lounge-table'
      ? 'day-photo-lounge-chair-'
      : `${id}-chair-`;
for (const tb of dayProgram.tables) {
  const seated = activityData.actors.filter((a) => a.seatId?.startsWith(seatPrefix(tb.id)));
  assert.ok(seated.length, `${tb.id} has people`);
  for (const e of tb.schedule) {
    const act = activities[e.activity],
      t = (e.start + e.end) / 2,
      playing = seated.filter((a) => sampleActor(a, t).action === act.play).length;
    assert.ok(playing >= Math.min(act.players || 1, seated.length), `${tb.id}: ${e.activity} is being played (${playing})`);
  }
}

// 6. Movements read differently: time-averaged standing poses differ for every pair.
const probe = createCharacter({ id: 'probe', role: 'participant', variant: 3 });
const joints = ['armL', 'armR', 'elbowL', 'elbowR', 'torso', 'hip', 'legL', 'legR'];
const rest = (() => {
  probe.pose('idle', 0);
  return joints.map((j) => probe.joints[j].quaternion.clone());
})();
function meanPose(action) {
  const sums = joints.map(() => new T.Vector4());
  for (let i = 0; i < 64; i++) {
    probe.pose(action, (i / 64) * 16);
    joints.forEach((j, k) => {
      const q = probe.joints[j].quaternion,
        r = rest[k];
      // Hemisphere-consistent averaging around the rest pose.
      const s = q.dot(r) < 0 ? -1 : 1;
      sums[k].add(new T.Vector4(q.x * s, q.y * s, q.z * s, q.w * s));
    });
  }
  return sums.map((v) => {
    v.normalize();
    return new T.Quaternion(v.x, v.y, v.z, v.w);
  });
}
const angle = (a, b) =>
  a.reduce((sum, q, k) => sum + q.angleTo(b[k]), 0) / a.length;
const movements = ['exercise', 'tai-chi', 'qigong', 'fan-dance', 'dance'],
  poses = Object.fromEntries(movements.map((a) => [a, meanPose(a)]));
let closest = Infinity;
for (let i = 0; i < movements.length; i++)
  for (let j = i + 1; j < movements.length; j++) {
    const d = angle(poses[movements[i]], poses[movements[j]]);
    closest = Math.min(closest, d);
    assert.ok(d > 0.12, `${movements[i]} and ${movements[j]} look alike (${d.toFixed(3)} rad)`);
  }
for (const action of ['qigong', 'fan-dance', 'opera', 'erhu', 'tea']) {
  const pose = meanPose(action);
  assert.ok(angle(pose, rest) > 0.05, `${action} has its own pose`);
}

// 7. The rendered day room labels every running session and shows its décor only then.
const activity = createActivity(m, new T.Scene()),
  room = activity.dayRoom;
assert.ok(room.highlights && room.decor, 'Day room exposes highlights and décor');
const decorIds = new Set(dayProgram.programs.flatMap((s) => s.decor));
for (const id of decorIds)
  assert.ok(
    room.decor.some((d) => d.id === id && d.root.name === 'decor-' + id),
    `Décor ${id} is modeled`,
  );
for (const session of dayProgram.programs) {
  const at = (session.start + session.end) / 2;
  activity.setOptions({ time: at, playing: false, enabled: true });
  const all = room.highlights(),
    labels = all.filter((h) => h.kind !== 'table'),
    label = labels.find((h) => h.zoneId === session.zone);
  assert.equal(labels.length, dayProgram.zones.length, 'One label per zone');
  assert.equal(all.filter((h) => h.kind === 'table').length, dayProgram.tables.length, 'One label per activity table');
  assert.equal(label?.sessionId, session.id, `${session.id} is labeled`);
  if (session.labelZh) assert.ok(label.title.includes(session.labelZh));
  const guest = dayProgram.instructors.find((i) => i.id === session.instructorId);
  if (guest) assert.ok(label.subtitle.includes(guest.name), `${session.id} names its instructor`);
  assert.ok([label.position.x, label.position.y, label.position.z].every(Number.isFinite));
  if (session.zone === 'floor')
    assert.equal(
      room.root.getObjectByName('day-program-display').visible,
      !!FORMATIONS[session.formation].board,
      `Board only where ${session.id} needs it`,
    );
  const running = new Set(
    sessionsAt(at).flatMap(({ session: s }) => sessionOf.get(s.id).decor),
  );
  for (const d of room.decor)
    assert.equal(d.root.visible, running.has(d.id), `${d.id} décor at ${at}`);
}
activity.dispose();
console.log(
  `Cultural program: ${dayProgram.programs.length} sessions in ${dayProgram.zones.length} concurrent zones; ${dayProgram.instructors.length} guest instructors in distinct attire; ≥2 guest-led activities and ≥${minEngaged} engaged participants at all times; movements differ by ≥${closest.toFixed(2)} rad; ${layouts.size} floor layouts with groups of ${Math.min(...groupSizes)}–${Math.max(...groupSizes)}, class ≥${closestPair.toFixed(2)} m apart; ≥${fewestKinds} table activities at once; ${decorIds.size} décor sets, zone and table labels, board only when needed.`,
);
