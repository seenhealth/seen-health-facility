// Measure the care-day simulation and print a concise report.
//
//   node scripts/sim-report.mjs               # print + write public/models/sim-report.json
//                                             #   and public/models/touchpoint-trace.json
//   node scripts/sim-report.mjs --no-write
//   node scripts/sim-report.mjs --trace-only  # only the touchpoint trace (npm run trace:report)
//
// Measures two activity sources on the shared 720 s clock, both exactly as
// the Alhambra viewer plays them (app/model/alhambra-source.ts: the loop plus
// the fleet crew and the distributed-care layer around the center): the base
// care-day loop and the day-in-the-life story source (+ Mrs. Lin's itinerary).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSim, paths } from './build-scenario.mjs';
import { TRACE_FILE, TRACE_OPTIONS, TRACE_SIZE_LIMIT } from './trace-config.mjs';

const root = resolve(paths.model, '../../..');
const out = resolve(root, 'public/models/sim-report.json');
const tracePath = resolve(root, TRACE_FILE);
const write = !process.argv.includes('--no-write');
const traceOnly = process.argv.includes('--trace-only');

const { sim, story } = await loadSim({
  sim: 'app/sim/index.ts',
  story: 'app/sim/story-source.ts',
});
const model = sim.validateFacility(JSON.parse(readFileSync(paths.model, 'utf8')));
const scenario = JSON.parse(readFileSync(paths.scenario, 'utf8'));
const baseSource = sim.alhambraSource(model);
const { source, heroId } = story.composedStorySource(model);
// Riders are measured in their seats, where the scene draws them.
const vehicles = sim.alhambraVehicles();
const line = (s = '') => console.log(s);
const pct = (v) => `${Math.round(v * 100)}%`;
const min = (seconds) => (seconds * sim.CARE_DAY.dayDurationMinutes) / sim.CARE_DAY.duration;
const hrs = (seconds) => (min(seconds) / 60).toFixed(1);
const at = (series, value) => sim.clockLabel(series.indexOf(value));

if (!traceOnly) {
  const started = Date.now();
  const base = sim.computeMetrics(baseSource, model, { step: 1, vehicles });
  const lin = sim.computeMetrics(source, model, {
    step: 1,
    heroId,
    steps: scenario.steps,
    vehicles,
  });
  const ms = Date.now() - started;

  line(`Seen Health care-day simulation · ${scenario.title}`);
  line(`Clock: 720 loop s = 8 AM–4 PM (1 s = ${(480 / 720).toFixed(3)} min). Sampled every 1 s (${ms} ms for both sources).`);
  line();
  for (const [name, m] of [
    ['Base loop', base],
    ['With Mrs. Lin', lin],
  ]) {
    const h = m.headline;
    line(
      `${name.padEnd(14)} ${h.people} people (${h.participants} participants, ${h.staff} staff) · peak on site ${h.peakParticipantsOnSite} participants at ${at(m.onSite.participants, h.peakParticipantsOnSite)}, ${h.peakStaffOnFloor} staff at ${at(m.onSite.staff, h.peakStaffOnFloor)} · staff time: ${pct(h.staffCareShare)} care, ${pct(h.staffWalkingShare)} walking · participants active ${pct(h.meanParticipantActiveShare)} of time on site`,
    );
  }
  line();
  line('Busiest zones (with Mrs. Lin) — person-hours of clock time, peak headcount');
  for (const z of lin.zones.slice(0, 8))
    line(
      `  ${z.name.padEnd(34)} participants ${(z.participantMinutes / 60).toFixed(1).padStart(5)} h (peak ${String(z.peakParticipants).padStart(2)})   staff ${(z.staffMinutes / 60).toFixed(1).padStart(5)} h (peak ${String(z.peakStaff).padStart(2)})`,
    );
  line();
  line('Staff utilization by role — share of on-floor time (care / walking / documenting+standby / meetings), mean walk');
  for (const r of lin.roles)
    line(
      `  ${r.label.padEnd(26)} ×${String(r.headcount).padEnd(3)} ${pct(r.share.care).padStart(4)} / ${pct(r.share.walking).padStart(4)} / ${pct(r.share.documenting).padStart(4)} / ${pct(r.share.meeting).padStart(4)}   on floor ${hrs(r.onFloorSeconds / r.headcount)} h each   walk ${Math.round(r.meanWalkMeters)} m`,
    );
  line();
  line('Participant time (all participants, clock hours)');
  line(
    '  ' +
      sim.PARTICIPANT_ACTIVITIES.filter((k) => k !== 'offSite')
        .map((k) => `${sim.participantActivityLabels[k]} ${hrs(lin.participantTotals[k])}`)
        .join(' · '),
  );
  if (lin.hero) {
    const h = lin.hero;
    line();
    line(`${h.label}: ${Math.round(h.walkMeters)} m walked; ${h.disciplinesSeen} of 11 IDT disciplines met in person.`);
    line(
      '  Time: ' +
        sim.PARTICIPANT_ACTIVITIES.filter((k) => h.time.seconds[k] > 0)
          .map((k) => `${sim.participantActivityLabels[k]} ${Math.round(min(h.time.seconds[k]))} min`)
          .join(' · '),
    );
    line('  Touchpoints (minutes together · encounters · first at):');
    for (const t of h.touchpoints.filter((t) => t.episodes))
      line(`    ${t.short.padEnd(7)} ${String(Math.round(t.minutes)).padStart(4)} min · ${t.episodes} · ${sim.clockLabel(t.firstAt)}`);
    const missing = h.touchpoints.filter((t) => !t.episodes).map((t) => t.short);
    if (missing.length) line(`    Not met in person: ${missing.join(', ')} (they meet about her at the IDT huddle and care-plan meeting)`);
  }
  if (lin.handoffs) {
    const hd = lin.handoffs;
    const top = [...hd.byDiscipline].sort((a, b) => b.sent + b.received - (a.sent + a.received))[0];
    line();
    line(
      `Handoffs in the scenario: ${hd.total} across ${hd.byStep.filter((s) => s.count).length} steps; most connected discipline ${top.discipline} (${top.sent} sent, ${top.received} received).`,
    );
  }

  // JSON: series thinned to every 4 s to keep the file small.
  const thin = (a, k = 4) => a.filter((_, i) => i % k === 0);
  const pack = (m) => ({
    ...m,
    times: thin(m.times),
    onSite: { participants: thin(m.onSite.participants), staff: thin(m.onSite.staff) },
    zones: m.zones.map((z) => ({ ...z, participants: thin(z.participants), staff: thin(z.staff) })),
    seriesStep: m.step * 4,
  });
  if (write) {
    writeFileSync(
      out,
      JSON.stringify(
        {
          version: 1,
          title: 'Care-day simulation report',
          basis:
            'Measured by sampling the same activity tracks the 3D scene animates (app/sim/metrics.ts). Composite, illustrative scenario data; not operational records.',
          clock: sim.CARE_DAY,
          scenarioId: scenario.id,
          heroId,
          sources: { base: pack(base), story: pack(lin) },
        },
        null,
        1,
      ) + '\n',
    );
    line();
    line(`Wrote ${out.replace(root + '/', '')}`);
  }
  line();
}

// ---------------------------------------------------------------------------
// Touchpoint trace: every person's events, end to end (digital-twin seed).
// ---------------------------------------------------------------------------
/** Trace both sources with the published options. */
function traceSources() {
  const started = Date.now();
  const sources = {};
  for (const [key, src] of [
    ['base', baseSource],
    ['story', source],
  ]) {
    const events = sim.traceTouchpoints(src, model, { ...TRACE_OPTIONS, vehicles });
    sources[key] = { source: src, events, summary: sim.traceSummary(events, src) };
  }
  return { sources, ms: Date.now() - started };
}
/** The published document: one event per line keeps diffs readable and the file compact. */
function traceDocument(sources) {
  const block = (events) =>
    '[\n' + events.map((e) => '   ' + JSON.stringify(e)).join(',\n') + '\n  ]';
  const head = {
    version: 1,
    title: 'Touchpoint trace',
    basis:
      'Ordered events derived from the same animated tracks the scene draws (app/sim/trace.ts): zone and room entries, van boarding, interactions, proximity encounters and staff handoffs for every person. Composite, illustrative data; not participant records.',
    clock: sim.CARE_DAY,
    scenarioId: scenario.id,
    heroId,
    options: TRACE_OPTIONS,
  };
  const body = Object.entries(sources)
    .map(
      ([key, s]) =>
        `  ${JSON.stringify(key)}: {\n  "summary": ${JSON.stringify(s.summary)},\n  "events": ${block(s.events)}\n  }`,
    )
    .join(',\n');
  const text = JSON.stringify(head, null, 1);
  return text.slice(0, -2) + ',\n "sources": {\n' + body + '\n }\n}\n';
}

const { sources, ms: traceMs } = traceSources();
const text = traceDocument(sources);
line(`Touchpoint trace · every ${TRACE_OPTIONS.step} s, encounters within ${TRACE_OPTIONS.encounterRadius} m for ≥ ${TRACE_OPTIONS.minEncounterSeconds} s (${traceMs} ms for both sources)`);
const kinds = sim.TOUCHPOINT_KINDS;
const col = (v, w = 7) => String(v).padStart(w);
line(`  ${'Events by kind'.padEnd(20)}${col('Base')}${col('Story')}`);
for (const k of kinds)
  line(`  ${k.padEnd(20)}${col(sources.base.summary.byKind[k])}${col(sources.story.summary.byKind[k])}`);
line(`  ${'total'.padEnd(20)}${col(sources.base.summary.events)}${col(sources.story.summary.events)}`);
line(`  ${'people'.padEnd(20)}${col(sources.base.summary.people)}${col(sources.story.summary.people)}`);
line(`  ${'median / participant'.padEnd(20)}${col(sources.base.summary.medianEventsPerParticipant)}${col(sources.story.summary.medianEventsPerParticipant)}`);
line();
const participants = (s) => s.source.actors.filter((a) => a.role === 'participant').length;
line(`  ${'Participants with…'.padEnd(20)}${col(`of ${participants(sources.base)}`)}${col(`of ${participants(sources.story)}`)}`);
for (const k of sim.TRACE_BUCKETS)
  line(`  ${k.padEnd(20)}${col(sources.base.summary.participantsWith[k])}${col(sources.story.summary.participantsWith[k])}`);
const hero = sim.personJourney(sources.story.events, heroId);
const claimed = [...new Set(scenario.steps.flatMap((s) => s.roles))];
const missing = claimed.filter((d) => !hero.disciplines.includes(d));
line();
line(
  `  ${hero.label}: ${hero.events.length} events, ${hero.interactions} interactions, ${hero.encounters} encounters, on site ${sim.clockLabel(hero.firstOnSite)}–${sim.clockLabel(hero.lastOnSite)}; disciplines ${hero.disciplines.length} of ${claimed.length} claimed by the scenario steps${missing.length ? ` (missing ${missing.join(', ')})` : ''}.`,
);
line(`  Zones: ${hero.zones.map((z) => `${z.zoneId} ${Math.round(min(z.seconds))} min`).join(' · ')}`);
line(`  Size: ${(text.length / 1024).toFixed(0)} KB (bound ${(TRACE_SIZE_LIMIT / 1e6).toFixed(0)} MB)`);
if (write) {
  writeFileSync(tracePath, text);
  line(`Wrote ${tracePath.replace(root + '/', '')}`);
}
