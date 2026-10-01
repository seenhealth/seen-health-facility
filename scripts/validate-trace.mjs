// Validate the touchpoint trace (app/sim/trace.ts) and its published JSON.
//
//   node scripts/validate-trace.mjs          # npm run validate:trace
//
// Recomputes the trace for both sources with the report options, checks its
// structure, and checks public/models/touchpoint-trace.json is fresh and small.
// Both sources are the composed Alhambra sources the viewer plays
// (app/model/alhambra-source.ts), so the published trace covers every person
// in the scene: the center's loop, the fleet crew and the community cast.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { loadSim, paths } from './build-scenario.mjs';
import {
  TRACE_FILE,
  TRACE_OPTIONS,
  TRACE_SIZE_LIMIT as SIZE_LIMIT,
} from './trace-config.mjs';

const TRACE_PATH = new URL(`../${TRACE_FILE}`, import.meta.url);

const { sim, story } = await loadSim({
  sim: 'app/sim/index.ts',
  story: 'app/sim/story-source.ts',
});
const model = sim.validateFacility(
  JSON.parse(readFileSync(paths.model, 'utf8')),
);
const scenario = JSON.parse(readFileSync(paths.scenario, 'utf8'));
const baseSource = sim.alhambraSource(model);
const { source: storySource, heroId } = story.composedStorySource(model);
const vehicles = sim.alhambraVehicles();
const traceOptions = { ...TRACE_OPTIONS, vehicles };
const kindRank = new Map(sim.TOUCHPOINT_KINDS.map((k, i) => [k, i]));
const rank = (e) => kindRank.get(e.kind);

function validateEvents(name, source, events) {
  const duration = source.duration;
  assert.ok(events.length > 0, `${name}: events`);
  // Ordering: t, then actorId, then the fixed kind order.
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1],
      b = events[i];
    const ordered =
      a.t < b.t ||
      (a.t === b.t &&
        (a.actorId < b.actorId ||
          (a.actorId === b.actorId && rank(a) <= rank(b))));
    assert.ok(
      ordered,
      `${name}: events out of order at ${i} (${a.t} ${a.actorId} ${a.kind} → ${b.t} ${b.actorId} ${b.kind})`,
    );
  }
  const byActor = new Map();
  for (const e of events) {
    assert.ok(kindRank.has(e.kind), `${name}: unknown kind ${e.kind}`);
    for (const k of ['t', 'x', 'z'])
      assert.ok(
        Number.isFinite(e[k]),
        `${name}: ${e.actorId} ${e.kind} has non-finite ${k}`,
      );
    assert.ok(
      e.t >= 0 && e.t <= duration,
      `${name}: ${e.actorId} ${e.kind} at ${e.t} outside the day`,
    );
    assert.equal(
      e.clock,
      sim.clockLabel(e.t),
      `${name}: clock label at ${e.t}`,
    );
    assert.ok(
      typeof e.zoneId === 'string' && e.zoneId,
      `${name}: ${e.actorId} ${e.kind} zone`,
    );
    assert.ok(
      typeof e.levelId === 'string' && e.levelId,
      `${name}: ${e.actorId} ${e.kind} level`,
    );
    byActor.set(e.actorId, [...(byActor.get(e.actorId) || []), e]);
  }
  // Every person has one day-start at 0 and one day-end at the end.
  for (const a of source.actors) {
    const mine = byActor.get(a.id);
    assert.ok(mine, `${name}: ${a.id} has no events`);
    const starts = mine.filter((e) => e.kind === 'day-start'),
      ends = mine.filter((e) => e.kind === 'day-end');
    assert.equal(starts.length, 1, `${name}: ${a.id} day-start`);
    assert.equal(ends.length, 1, `${name}: ${a.id} day-end`);
    assert.equal(starts[0].t, 0);
    assert.equal(ends[0].t, duration);
    assert.equal(
      mine[0].kind,
      'day-start',
      `${name}: ${a.id} begins with day-start`,
    );
    assert.equal(
      mine.at(-1).kind,
      'day-end',
      `${name}: ${a.id} ends with day-end`,
    );
    // Presence, stays and rides alternate.
    const alternate = (open, close, label) => {
      let depth = 0;
      for (const e of mine)
        if (e.kind === open) {
          assert.equal(
            depth,
            0,
            `${name}: ${a.id} ${label} opened twice at ${e.t}`,
          );
          depth = 1;
        } else if (e.kind === close) {
          assert.equal(
            depth,
            1,
            `${name}: ${a.id} ${label} closed without opening at ${e.t}`,
          );
          depth = 0;
        }
    };
    alternate('on-site', 'off-site', 'presence');
    alternate('enter', 'leave', 'stay');
    alternate('board', 'alight', 'ride');
    // Interaction start/end pairs per person.
    const open = new Map();
    for (const e of mine)
      if (e.kind === 'interaction-start') {
        assert.ok(
          !open.has(e.interactionId),
          `${name}: ${a.id} ${e.interactionId} started twice`,
        );
        open.set(e.interactionId, e);
      } else if (e.kind === 'interaction-end') {
        const s = open.get(e.interactionId);
        assert.ok(
          s,
          `${name}: ${a.id} ${e.interactionId} ended without starting`,
        );
        assert.ok(
          e.t >= s.t,
          `${name}: ${a.id} ${e.interactionId} ends before it starts`,
        );
        assert.ok(
          Math.abs(e.durationSeconds - (e.t - s.t)) < 0.02,
          `${name}: ${a.id} ${e.interactionId} duration`,
        );
        open.delete(e.interactionId);
      }
    assert.equal(
      open.size,
      0,
      `${name}: ${a.id} has unclosed interactions ${[...open.keys()].join(', ')}`,
    );
  }
  // Every interaction member has its start and end events.
  for (const i of source.interactions)
    for (const id of i.actorIds) {
      const mine = byActor.get(id) || [];
      assert.ok(
        mine.some(
          (e) => e.kind === 'interaction-start' && e.interactionId === i.id,
        ),
        `${name}: ${id} misses start of ${i.id}`,
      );
      assert.ok(
        mine.some(
          (e) => e.kind === 'interaction-end' && e.interactionId === i.id,
        ),
        `${name}: ${id} misses end of ${i.id}`,
      );
    }
  // Encounters are mutual, long enough and name a known person.
  const ids = new Set(source.actors.map((a) => a.id));
  for (const e of events)
    if (e.kind === 'encounter') {
      assert.ok(
        e.durationSeconds >= TRACE_OPTIONS.minEncounterSeconds,
        `${name}: short encounter`,
      );
      assert.equal(e.with.length, 1);
      assert.ok(
        ids.has(e.with[0]),
        `${name}: encounter with unknown ${e.with[0]}`,
      );
      const other = byActor.get(e.with[0]) || [];
      assert.ok(
        other.some(
          (o) =>
            o.kind === 'encounter' &&
            o.t === e.t &&
            o.with[0] === e.actorId &&
            o.durationSeconds === e.durationSeconds,
        ),
        `${name}: encounter ${e.actorId}/${e.with[0]} at ${e.t} is not mutual`,
      );
    } else if (e.kind === 'handoff') {
      assert.equal(
        e.role,
        'participant',
        `${name}: handoffs belong to participants`,
      );
      assert.equal(e.with.length, 2);
    }
  const summary = sim.traceSummary(events, source);
  assert.equal(
    summary.people,
    source.actors.length,
    `${name}: everyone is traced`,
  );
  assert.equal(summary.events, events.length);
  return summary;
}

const results = {};
for (const [name, source] of [
  ['base', baseSource],
  ['story', storySource],
]) {
  const events = sim.traceTouchpoints(source, model, traceOptions);
  results[name] = { events, summary: validateEvents(name, source, events) };
  // Deterministic: a second run is identical.
  assert.deepEqual(
    sim.traceTouchpoints(source, model, traceOptions),
    events,
    `${name}: deterministic`,
  );
}

// The trace describes the people the viewer plays: the center's loop, the
// fleet crew and the community cast, with riders in their seats (no event
// lies off the drawn world) and community touchpoints counted.
for (const [name, source] of [
  ['base', baseSource],
  ['story', storySource],
]) {
  assert.ok(
    source.actors.some((a) => a.sourceId === 'community'),
    `${name}: the community layer is traced`,
  );
  assert.ok(
    results[name].summary.participantsWith.community > 0,
    `${name}: community touchpoints are counted`,
  );
  const stray = results[name].events.find(
    (e) => Math.abs(e.x) > 200 || Math.abs(e.z) > 200,
  );
  assert.ok(
    !stray,
    `${name}: ${stray?.actorId} ${stray?.kind} at (${stray?.x}, ${stray?.z}) lies off the drawn world`,
  );
}

// The hero's trace covers every discipline her scenario steps claim (cutaways,
// steps with a settingId, show other people across the care network).
const hero = sim.personJourney(results.story.events, heroId);
const claimed = [...new Set(scenario.steps.filter((s) => !s.settingId).flatMap((s) => s.roles))];
const missing = claimed.filter((d) => !hero.disciplines.includes(d));
assert.equal(
  missing.length,
  0,
  `Hero trace misses disciplines ${missing.join(', ')}`,
);
assert.ok(
  hero.firstOnSite !== undefined && hero.lastOnSite !== undefined,
  'Hero is on site',
);
assert.ok(
  hero.interactions >= scenario.steps.filter((s) => s.heroPresent).length,
  'Hero has an interaction per present step',
);

// The published file is small, well formed and fresh.
const text = readFileSync(TRACE_PATH, 'utf8');
const size = statSync(TRACE_PATH).size;
assert.ok(
  size < SIZE_LIMIT,
  `touchpoint-trace.json is ${size} bytes (bound ${SIZE_LIMIT})`,
);
const doc = JSON.parse(text);
assert.equal(doc.version, 1);
assert.deepEqual(doc.options, TRACE_OPTIONS, 'Published trace options match');
for (const name of ['base', 'story']) {
  assert.ok(doc.sources?.[name], `Published trace has ${name}`);
  assert.deepEqual(
    doc.sources[name].summary,
    results[name].summary,
    `Published ${name} summary is current (run npm run trace:report)`,
  );
  assert.equal(
    doc.sources[name].events.length,
    results[name].events.length,
    `Published ${name} events are current (run npm run trace:report)`,
  );
  assert.deepEqual(
    doc.sources[name].events,
    results[name].events,
    `Published ${name} events match the tracks (run npm run trace:report)`,
  );
}
console.log(
  `Trace: ${results.base.events.length} base and ${results.story.events.length} story events for ${results.base.summary.people}/${results.story.summary.people} people; ${hero.label} meets ${hero.disciplines.length}/${claimed.length} claimed disciplines; published file ${(size / 1024).toFixed(0)} KB.`,
);
