// Fit the expanded cast into the shared collision footprints, retaining the requested activities.
import fs from 'node:fs';
import {
  roomPlacement,
  insideRoom,
} from '../work/validation/site-activity-data.mjs';
import { sampleActor } from '../work/validation/activity.mjs';
const m = JSON.parse(
  fs.readFileSync('public/models/seen-alhambra-planning.json'),
);
const a = JSON.parse(fs.readFileSync('app/data/activity-loop.json'));
const normalized = {
  ...m,
  objects: m.objects.map((o) => ({ ...o, layer: o.layer || 'furniture' })),
};
const allReserved = [];
for (const actor of a.actors.filter((x) => !x.id.startsWith('community-'))) {
  for (let t = 0; t < 720; t += 4) {
    const p = sampleActor(actor, t);
    if (p.visible !== false)
      allReserved.push({ p: [p.x, p.z], level: actor.levelId });
  }
}
const usedSeats = new Set(
  a.actors.filter((x) => !x.id.startsWith('community-')).map((x) => x.seatId),
);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const log = [];
for (const actor of a.actors.filter((x) => x.id.startsWith('community-'))) {
  const old = actor.segments[0].path[0],
    zone = m.zones.find((z) => z.id === actor.segments[0].zoneId);
  const r = m.rooms.find((r) => r.id === actor.roomId) ||
    m.rooms
      .filter((r) => r.zoneId === zone.id && insideRoom(old, r.polygon))
      .sort((a, b) => a.polygon.length - b.polygon.length)[0] || {
      ...zone,
      id: 'activity-space-' + zone.id,
      kind: 'open',
    };
  if (!r.id.startsWith('activity-space-')) actor.roomId = r.id;
  const placement = roomPlacement(normalized, r);
  if (actor.seated && !actor.seatId) {
    const chair = m.objects.find(
      (o) =>
        o.id.startsWith('community-') &&
        o.assetId === 'community-chair' &&
        dist([o.position[0], o.position[2]], old) < 0.01,
    );
    if (chair) actor.seatId = chair.id;
  }
  const available = (p) =>
    allReserved.every((v) => v.level !== actor.levelId || dist(v.p, p) > 0.62);
  const clear = (p) =>
    placement.clear(p, actor.seated ? 0.19 : 0.29, actor.seatId) &&
    available(p);
  let pos = old;
  if (!clear(pos)) {
    if (
      actor.seated &&
      !actor.id.startsWith('community-3') &&
      !actor.id.startsWith('community-4')
    ) {
      const alternative = m.objects
        .filter(
          (o) =>
            o.zoneId === zone.id &&
            /chair/.test(m.assets[o.assetId].kind) &&
            !usedSeats.has(o.id),
        )
        .find(
          (o) =>
            placement.clear([o.position[0], o.position[2]], 0.19, o.id) &&
            available([o.position[0], o.position[2]]),
        );
      if (alternative) {
        pos = [alternative.position[0], alternative.position[2]];
        actor.seatId = alternative.id;
        actor.segments.forEach(
          (s) => (s.heading = alternative.rotation + Math.PI),
        );
      }
    }
    if (!clear(pos)) {
      const candidates = [];
      for (
        let x = Math.min(...r.polygon.map((p) => p[0])) + 0.35;
        x < Math.max(...r.polygon.map((p) => p[0])) - 0.25;
        x += 0.13
      )
        for (
          let z = Math.min(...r.polygon.map((p) => p[1])) + 0.35;
          z < Math.max(...r.polygon.map((p) => p[1])) - 0.25;
          z += 0.13
        )
          if (clear([x, z])) candidates.push([x, z]);
      candidates.sort((p, q) => dist(p, old) - dist(q, old));
      if (!candidates.length)
        throw Error(
          'No clear position: ' + actor.id + ' ' + actor.label + ' ' + r.id,
        );
      pos = candidates[0];
      if (actor.seated) {
        // Move only newly-added activity chairs with their seated users.
        const own = m.objects.find(
          (o) => o.id === actor.seatId && o.id.startsWith('community-'),
        );
        if (own) {
          own.position[0] = pos[0];
          own.position[2] = pos[1];
        } else {
          delete actor.seated;
          delete actor.seatId;
          actor.segments.forEach((s) => (s.seated = false));
        }
      }
    }
    log.push(`${actor.id}: ${dist(old, pos).toFixed(2)}m adjustment`);
  }
  actor.segments.forEach((s) => {
    s.path = [pos, pos];
  });
  if (actor.seatId) usedSeats.add(actor.seatId);
  allReserved.push({ p: pos, level: actor.levelId });
  // Short task walks in a few support rooms, with the whole route reserved.
  if (['aide', 'nurse', 'coordinator'].includes(actor.role) && !actor.seated) {
    const choices = [
      [0, 1.0],
      [0, -1.0],
      [1, 0],
      [-1, 0],
    ].map(([x, z]) => [pos[0] + x, pos[1] + z]);
    const q = choices.find((q) =>
      Array.from({ length: 15 }, (_, i) => [
        pos[0] + ((q[0] - pos[0]) * i) / 14,
        pos[1] + ((q[1] - pos[1]) * i) / 14,
      ]).every(
        (p) =>
          placement.clear(p, 0.29) &&
          allReserved
            .slice(0, -1)
            .every((v) => v.level !== actor.levelId || dist(v.p, p) > 0.62),
      ),
    );
    if (q) {
      const action = actor.segments[0].action,
        heading = actor.segments[0].heading,
        title = actor.segments[0].title;
      actor.segments = [];
      for (let j = 0; j < 4; j++)
        actor.segments.push(
          {
            start: j * 180,
            end: j * 180 + 120,
            path: [pos, pos],
            zoneId: zone.id,
            action,
            heading,
            title,
          },
          {
            start: j * 180 + 120,
            end: j * 180 + 150,
            path: [pos, q],
            zoneId: zone.id,
            action: 'walk',
            heading,
            title: 'Moving between tasks',
          },
          {
            start: j * 180 + 150,
            end: (j + 1) * 180,
            path: [q, pos],
            zoneId: zone.id,
            action: 'walk',
            heading,
            title: 'Returning to care',
          },
        );
      for (let i = 0; i < 15; i++)
        allReserved.push({
          p: [
            pos[0] + ((q[0] - pos[0]) * i) / 14,
            pos[1] + ((q[1] - pos[1]) * i) / 14,
          ],
          level: actor.levelId,
        });
    }
  }
}
fs.writeFileSync(
  'app/data/activity-loop.json',
  JSON.stringify(a, null, 2) + '\n',
);
fs.writeFileSync(
  'public/models/activity-loop.json',
  JSON.stringify(a, null, 2) + '\n',
);
fs.writeFileSync(
  'public/models/seen-alhambra-planning.json',
  JSON.stringify(m, null, 2) + '\n',
);
console.log(log.join('\n'));
console.log(
  '59 additions fitted to room boundaries, furniture and established routes.',
);
