// Owner walkthrough, October 2026: the games rooms' cast on the shared
// game clocks (app/model/game-rhythm.ts).
//
// - Karaoke is a duet: `community-44` leads (offset 0) and a second singer,
//   `community-71`, stands on their right (offset half the song period) and
//   takes the microphone when the song ends. The audience and the two staff
//   in the room listen (`audience`: still hands, applause between songs)
//   instead of clapping all day.
// - The second pool player stands on the cue-ball lane (pool players shoot
//   along a lane 0.25 m off the table's centre line; see POOL.laneZ).
//
// Idempotent: re-running rewrites the same people. Writes both copies of
// activity-loop.json (ASCII, as scripts/apply-drop-off-route.mjs does) and
// character-templates.json.
//
//   node scripts/apply-owner-review-games.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const LOOP = ['app/data/activity-loop.json', 'public/models/activity-loop.json'],
  TEMPLATES = [
    'app/data/character-templates.json',
    'public/models/character-templates.json',
  ];
const ascii = (s) =>
  s.replace(
    /[^\n\x20-\x7f]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
const write = (files, data) => {
  const out = ascii(JSON.stringify(data, null, 2)) + '\n';
  for (const f of files) writeFileSync(f, out);
};

const loop = JSON.parse(readFileSync(LOOP[0], 'utf8')),
  templates = JSON.parse(readFileSync(TEMPLATES[0], 'utf8'));
const actor = (id) => loop.actors.find((a) => a.id === id);

/** Half the karaoke period (game-rhythm KARAOKE_PERIOD = 48). */
const SECOND_SINGER_OFFSET = 24;
const LEAD = 'community-44',
  SECOND = 'community-71';
const lead = actor(LEAD);
if (!lead) throw new Error(`${LEAD} (the karaoke singer) is missing`);
lead.offset = 0;
lead.label = 'Karaoke · lead singer';
// The partner stands 1.1 m to the lead's right (facing +x, right is +z).
loop.actors = loop.actors.filter((a) => a.id !== SECOND);
const at = [lead.segments[0].path[0][0], lead.segments[0].path[0][1] + 1.1];
loop.actors.push({
  id: SECOND,
  role: 'participant',
  variant: 99,
  label: 'Karaoke · duet partner',
  offset: SECOND_SINGER_OFFSET,
  levelId: 'ground',
  profileId: SECOND,
  roomId: lead.roomId,
  segments: lead.segments.map((s) => ({
    ...s,
    path: [at, at],
    title: 'Karaoke · singer (duet)',
  })),
});
// The room's listeners.
for (const a of loop.actors)
  for (const s of a.segments)
    if (s.action === 'clap' && /Karaoke/.test(s.title ?? '')) s.action = 'audience';
// Karaoke interactions name both singers.
for (const i of loop.interactions)
  if (i.actorIds.includes(LEAD) && !i.actorIds.includes(SECOND))
    i.actorIds.push(SECOND);
// The second pool player on the cue-ball lane (table centre z 20.25,
// lane +0.25, the cue 0.19 m to the shooter's right, which faces −z for the
// player who looks −x).
const poolB = actor('community-43');
if (poolB)
  for (const s of poolB.segments) s.path = s.path.map(([x]) => [x, 20.69]);

templates.people = templates.people.filter((p) => p.id !== SECOND);
templates.people.push({
  id: SECOND,
  role: 'participant',
  appearance: 5,
  skin: '#d9a67f',
  hair: '#5a4a44',
  hairStyle: 2,
  glasses: true,
  accent: '#8a5a3a',
  height: 0.95,
});

write(LOOP, loop);
write(TEMPLATES, templates);
console.log(
  `Karaoke duet: ${LEAD} leads from offset 0, ${SECOND} at (${at.join(', ')}) offset ${SECOND_SINGER_OFFSET}; ${loop.actors.length} people in the loop.`,
);
