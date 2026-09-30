// Measure the care-day simulation and print a concise report.
//
//   node scripts/sim-report.mjs            # print + write public/models/sim-report.json
//   node scripts/sim-report.mjs --no-write
//
// Measures two activity sources on the shared 720 s clock: the base care-day
// loop and the day-in-the-life story source (base + Mrs. Lin's itinerary).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSim, paths } from './build-scenario.mjs';

const root = resolve(paths.model, '../../..');
const out = resolve(root, 'public/models/sim-report.json');
const { sim, story } = await loadSim({
  sim: 'app/sim/index.ts',
  story: 'app/sim/story-source.ts',
});
const model = sim.validateFacility(JSON.parse(readFileSync(paths.model, 'utf8')));
const scenario = JSON.parse(readFileSync(paths.scenario, 'utf8'));
const { source, heroId } = story.storyActivitySource();
const started = Date.now();
const base = sim.computeMetrics(sim.activityData, model, { step: 1 });
const lin = sim.computeMetrics(source, model, {
  step: 1,
  heroId,
  steps: scenario.steps,
});
const ms = Date.now() - started;

const pct = (v) => `${Math.round(v * 100)}%`;
const min = (seconds) => (seconds * sim.CARE_DAY.dayDurationMinutes) / sim.CARE_DAY.duration;
const hrs = (seconds) => (min(seconds) / 60).toFixed(1);
const at = (series, value) => sim.clockLabel(series.indexOf(value));
const line = (s = '') => console.log(s);

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
if (!process.argv.includes('--no-write')) {
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
