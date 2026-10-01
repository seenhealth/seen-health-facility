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
    spot = dayProgram.zones.find((z) => z.id === led[0].zone).instructorSpot;
  for (let t = 0; t < D; t += 0.5) {
    const p = sampleActor(a, t),
      session = led.find((s) => t >= s.start && t < s.end);
    assert.equal(p.visible !== false, !!session, `${person.id} on site at ${t}`);
    assert.ok(near([p.x, p.z], spot.position), `${person.id} stays at the zone's spot`);
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
    const cast =
      zone.id === 'floor'
        ? dayProgram.stations
            .filter((s) => !['leader', 'support'].includes(s.mode))
            .map((s) => s.actorId)
        : zone.participants;
    for (const id of cast) {
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
  const labels = room.highlights(),
    label = labels.find((h) => h.zoneId === session.zone);
  assert.equal(labels.length, dayProgram.zones.length, 'One label per zone');
  assert.equal(label?.sessionId, session.id, `${session.id} is labeled`);
  if (session.labelZh) assert.ok(label.title.includes(session.labelZh));
  const guest = dayProgram.instructors.find((i) => i.id === session.instructorId);
  if (guest) assert.ok(label.subtitle.includes(guest.name), `${session.id} names its instructor`);
  assert.ok([label.position.x, label.position.y, label.position.z].every(Number.isFinite));
  const running = new Set(
    sessionsAt(at).flatMap(({ session: s }) => sessionOf.get(s.id).decor),
  );
  for (const d of room.decor)
    assert.equal(d.root.visible, running.has(d.id), `${d.id} décor at ${at}`);
}
activity.dispose();
console.log(
  `Cultural program: ${dayProgram.programs.length} sessions in ${dayProgram.zones.length} concurrent zones; ${dayProgram.instructors.length} guest instructors in distinct attire; ≥2 guest-led activities and ≥${minEngaged} engaged participants at all times; movements differ by ≥${closest.toFixed(2)} rad; ${decorIds.size} décor sets and per-zone labels verified.`,
);
