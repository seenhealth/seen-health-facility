// Compile the day-in-the-life scenario into precomputed tracks and validate them.
//
//   npm run build:scenario            # compile + validate + write tracks JSON
//   node scripts/build-scenario.mjs --check   # compile + validate only
//
// The TypeScript simulation modules (app/sim/*) are bundled for Node with
// Rolldown (already installed with Vite) into work/sim/, which resolves the
// app's extensionless and JSON imports. Three.js stays external.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const paths = {
  model: resolve(root, 'public/models/seen-alhambra-planning.json'),
  scenario: resolve(root, 'app/data/scenarios/day-in-the-life.json'),
  tracks: resolve(root, 'app/data/scenarios/day-in-the-life.tracks.json'),
};

/** Bundle TypeScript entries for Node and import them. */
export async function loadSim(entries = { sim: 'app/sim/index.ts' }) {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, resolve(root, v)]),
    ),
    platform: 'node',
    external: [/^three(\/.*)?$/],
    logLevel: 'warn',
  });
  const dir = resolve(root, 'work/sim');
  await bundle.write({
    dir,
    format: 'esm',
    entryFileNames: '[name].mjs',
    chunkFileNames: '[name]-[hash].mjs',
  });
  await bundle.close();
  const out = {};
  for (const k of Object.keys(entries))
    out[k] = await import(
      pathToFileURL(resolve(dir, `${k}.mjs`)).href + `?v=${Date.now()}`
    );
  return out;
}

const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Validation of compiled tracks against the facility; returns a summary. */
export function validateTracks(sim, model, scenario, result) {
  const { source, tracks } = result;
  const duration = source.duration;
  const ground = sim.navGrid(model);
  const upper = sim.navGrid(model, {
    levelId: 'upper',
    removedObjectIds: [],
    reservations: [],
    excludeZoneIds: ['mezzanine'],
    blockVerticalCirculation: true,
  });
  const grids = { ground, upper };
  const byId = new Map(source.actors.map((a) => [a.id, a]));
  const mine = tracks.actors.map((a) => byId.get(a.id));
  const report = {
    actors: mine.length,
    segments: 0,
    walkSamples: 0,
    minWalkWallClearance: Infinity,
    minVisibleWallClearance: Infinity,
    maxJump: 0,
    maxEscortStep: 0,
    stops: [],
    closestContacts: [],
  };
  // Stage structure: full coverage, contiguous, no teleport (incl. repeat).
  for (const a of mine) {
    assert.equal(a.segments[0].start, 0, `${a.id} starts at 0`);
    assert.equal(a.segments.at(-1).end, duration, `${a.id} ends at ${duration}`);
    for (let i = 0; i < a.segments.length; i++) {
      const s = a.segments[i],
        next = a.segments[(i + 1) % a.segments.length];
      assert.ok(s.end > s.start, `${a.id} stage ${i} has positive length`);
      assert.ok(s.start >= 0 && s.end <= duration, `${a.id} stage inside 0–${duration}`);
      if (i < a.segments.length - 1)
        assert.ok(Math.abs(s.end - next.start) < 1e-6, `${a.id} contiguous at ${s.end}`);
      assert.deepEqual(s.path.at(-1), next.path[0], `${a.id}: no teleport at ${s.end}`);
      if (s.heights) assert.equal(s.heights.length, s.path.length);
      report.segments++;
      // Walking paths stay clear of walls (sampled every 5 cm).
      const g = grids[a.levelId];
      if (g && ['walk', 'roll'].includes(s.action) && s.visible !== false && s.zoneId !== 'site')
        for (let j = 1; j < s.path.length; j++) {
          const p = s.path[j - 1],
            q = s.path[j],
            count = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.05));
          for (let k = 0; k <= count; k++) {
            const x = p[0] + ((q[0] - p[0]) * k) / count,
              z = p[1] + ((q[1] - p[1]) * k) / count;
            const c = sim.wallClearanceAt(g, [x, z]);
            report.minWalkWallClearance = Math.min(report.minWalkWallClearance, c);
            assert.ok(c >= 0.2, `${a.id}: path clips a wall at ${x.toFixed(2)},${z.toFixed(2)} (${c.toFixed(3)})`);
            report.walkSamples++;
          }
        }
    }
    const coverage = sim.timelineFor(a).reduce((n, s) => n + s.end - s.start, 0);
    assert.ok(Math.abs(coverage - duration) < 1e-3, `${a.id} timeline covers the day`);
  }
  // Sampled motion: no jumps while visible; visible people never inside walls.
  const zones = model.zones.filter((z) => z.levelId === 'ground' && z.id !== 'adjacent');
  const dt = 0.05;
  const prev = new Map();
  for (let t = 0; t <= duration + 1e-9; t += dt) {
    const frame = sim.sampleFrame(source, zones, t % duration);
    for (const a of mine) {
      const f = frame.get(a.id),
        p = prev.get(a.id);
      if (f.visible && p?.visible) {
        const d = Math.hypot(f.sample.x - p.sample.x, f.sample.z - p.sample.z);
        report.maxJump = Math.max(report.maxJump, d);
        assert.ok(d < 0.6 * (dt / 0.1) + 1e-9 || d < 0.6, `${a.id} jumps ${d.toFixed(2)} m at ${t.toFixed(2)}`);
        if (a.escortFor) {
          report.maxEscortStep = Math.max(report.maxEscortStep, d);
          assert.ok(d < 0.13, `${a.id} escort stays continuous at ${t.toFixed(2)}`);
        }
      }
      if (f.visible && a.levelId !== 'site' && f.zoneId !== 'site' && grids[a.levelId]) {
        const c = sim.wallClearanceAt(grids[a.levelId], [f.sample.x, f.sample.z]);
        report.minVisibleWallClearance = Math.min(report.minVisibleWallClearance, c);
        assert.ok(c >= 0.15, `${a.id} visible inside a wall at ${t.toFixed(2)} (${c.toFixed(3)})`);
      }
      prev.set(a.id, f);
    }
  }
  // Hero present at each stop anchor during its window.
  const hero = byId.get(tracks.heroId);
  const authored = new Map(
    scenario.steps.flatMap((st) => (st.placement?.stops || []).map((s) => [s.id, s])),
  );
  for (const step of tracks.steps)
    for (const s of step.stops) {
      assert.ok(s.window[0] >= 0 && s.window[1] <= duration, `${s.id} window inside the day`);
      const minDwell =
        authored.get(s.id)?.minDwell ??
        Math.max(
          scenario.placement.minDwellSeconds,
          scenario.placement.minDwellFraction * (s.window[1] - s.window[0]),
        );
      let present = 0;
      for (let t = s.window[0]; t < s.window[1]; t += 0.25) {
        const x = sim.sampleActor(hero, t);
        if (Math.hypot(x.x - s.anchor[0], x.z - s.anchor[1]) < 0.05 && x.visible !== false) present += 0.25;
      }
      assert.ok(present >= minDwell - 0.5, `Hero at ${s.id} for ${present}s of its window (need ${minDwell.toFixed(1)}s)`);
      const f = sim.sampleActor(hero, s.focusTime);
      assert.ok(Math.hypot(f.x - s.anchor[0], f.z - s.anchor[1]) < 0.05, `${s.id} focus time shows the hero at the anchor`);
      report.stops.push({
        step: step.id,
        stop: s.id,
        window: s.window,
        arrive: s.arrive,
        depart: s.depart,
        present: round(present, 2),
        focusTime: s.focusTime,
        leg: s.legDistance,
      });
    }
  // Van boarding: the hero is on the van ramp only with a parked van, open doors and ramp.
  let boarding = 0;
  for (let t = 0; t < duration; t += 0.25) {
    const p = sim.sampleActor(hero, t);
    if (p.visible === false) continue;
    if (Math.abs(p.x + 20.31) < 0.025 && p.z > 2.53 && p.z < 5.44) {
      const van = sim.sampleVan(p.vehicleId === 'van-b' ? 1 : 0, t);
      assert.ok(van.visible && van.ramp > 0.999 && van.door > 0.999, `Hero boards a parked van at ${t}`);
      boarding++;
    }
  }
  assert.ok(boarding > 20, 'Hero uses the van ramp on arrival and departure');
  report.vanRampSamples = boarding;
  // New walking routes never pass through the open-floor class as it rearranges.
  const cohort = sim.dayProgram.stations.map((s) => byId.get(s.actorId)).filter(Boolean);
  for (const a of mine.filter((a) => a.levelId === 'ground'))
    for (let t = 0; t < duration; t += 0.25) {
      const p = sim.sampleActor(a, t);
      if (p.visible === false || !['walk', 'roll'].includes(p.action)) continue;
      for (const c of cohort) {
        const q = sim.sampleActor(c, t);
        assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= 0.5, `${a.id} walks through ${c.id} at ${t}`);
      }
    }
  // Furniture: report walking samples that pass through furniture footprints
  // (shrunk by 0.1 m; sitting down onto a seat is expected at a stage end).
  const furniture = ground.obstacles.filter(
    (o) => !/^(dwell:|station:|day-program|member-pt)/.test(o.id) && !o.id.includes('stair') && !o.id.includes('lift') && !o.id.includes('void'),
  );
  const seats = new Set(
    scenario.steps.flatMap((st) => [
      ...(st.placement?.stops || []).flatMap((s) => [s.seat, ...(s.companions || []).map((c) => c.seat)]),
      ...(st.placement?.duties || []).map((d) => d.seat),
    ]).filter(Boolean),
  );
  // Seated anchors placed on furniture without a `seat` id (e.g. a plinth edge).
  const seatedAnchors = scenario.steps.flatMap((st) =>
    (st.placement?.stops || []).flatMap((s) => [
      ...(s.seated && s.anchor ? [s.anchor] : []),
      ...(s.companions || []).filter((c) => c.seated && c.anchor).map((c) => c.anchor),
    ]),
  );
  for (const o of furniture)
    if (
      seatedAnchors.some(([x, z]) => {
        const dx = x - o.x,
          dz = z - o.z;
        return Math.abs(o.c * dx - o.s * dz) < o.hw && Math.abs(o.s * dx + o.c * dz) < o.hd;
      })
    )
      seats.add(o.id);
  const crossings = new Map();
  for (const a of mine.filter((a) => a.levelId === 'ground'))
    for (const s of a.segments.filter((s) => s.action === 'walk' && s.visible !== false && s.zoneId !== 'site'))
      for (let i = 1; i < s.path.length; i++) {
        const p = s.path[i - 1],
          q = s.path[i],
          count = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.05));
        for (let k = 0; k <= count; k++) {
          const x = p[0] + ((q[0] - p[0]) * k) / count,
            z = p[1] + ((q[1] - p[1]) * k) / count;
          for (const o of furniture) {
            if (seats.has(o.id)) continue;
            const dx = x - o.x,
              dz = z - o.z;
            if (
              Math.abs(o.c * dx - o.s * dz) < o.hw - 0.29 &&
              Math.abs(o.s * dx + o.c * dz) < o.hd - 0.29
            ) {
              const key = `${a.id}|${o.id}`;
              crossings.set(key, (crossings.get(key) || 0) + 1);
            }
          }
        }
      }
  report.furnitureCrossings = [...crossings.entries()].map(([k, n]) => {
    const [actor, object] = k.split('|');
    return { actor, object, samples: n };
  });
  // Personal space: closest approach between a new person and anyone else.
  const others = source.actors;
  const closest = [];
  for (let t = 0; t < duration; t += 0.5) {
    const frame = sim.sampleFrame(source, zones, t);
    for (const a of mine) {
      const f = frame.get(a.id);
      if (!f.visible) continue;
      for (const b of others) {
        if (a.id === b.id || b.levelId !== a.levelId) continue;
        if (a.escortFor === b.id || b.escortFor === a.id) continue;
        const g = frame.get(b.id);
        if (!g.visible) continue;
        const d = Math.hypot(f.sample.x - g.sample.x, f.sample.z - g.sample.z);
        if (d < 0.45) closest.push({ t, a: a.id, b: b.id, d: round(d, 2) });
      }
    }
  }
  const worst = new Map();
  for (const c of closest) {
    const key = c.a < c.b ? `${c.a}|${c.b}` : `${c.b}|${c.a}`;
    if (!worst.has(key) || worst.get(key).d > c.d) worst.set(key, { ...c, seconds: 0 });
    worst.get(key).seconds += 0.5;
  }
  report.closestContacts = [...worst.values()].sort((a, b) => a.d - b.d);
  report.minWalkWallClearance = round(report.minWalkWallClearance);
  report.minVisibleWallClearance = round(report.minVisibleWallClearance);
  report.maxJump = round(report.maxJump);
  report.maxEscortStep = round(report.maxEscortStep);
  return report;
}

export async function compile({ write = true, quiet = false, modelPath = paths.model } = {}) {
  const started = Date.now();
  const { sim } = await loadSim();
  const model = sim.validateFacility(JSON.parse(readFileSync(modelPath, 'utf8')));
  const scenario = JSON.parse(readFileSync(paths.scenario, 'utf8'));
  const t0 = Date.now();
  const result = sim.compileScenario(model, scenario, sim.activityData);
  const compileMs = Date.now() - t0;
  const report = validateTracks(sim, model, scenario, result);
  const grid = sim.navGrid(model);
  if (write) writeFileSync(paths.tracks, JSON.stringify(result.tracks, null, 1) + '\n');
  if (!quiet) {
    const t = result.tracks;
    console.log(
      `Compiled "${scenario.title}": ${t.actors.length} actors (${t.actors.filter((a) => a.levelId === 'upper').length} upstairs), ${t.interactions.length} interactions, replacing ${t.removedActorIds.join(', ')}; hero gait ${t.heroSpeed} m/s.`,
    );
    console.log(`Navigation grid ${grid.buildMs} ms; compile ${compileMs} ms; total ${Date.now() - started} ms.`);
    const row = (...cells) =>
      cells.map(([v, w]) => String(v).padEnd(w)).join(' ');
    console.log(
      row(['Step', 13], ['stop', 14], ['window', 9], ['arrive', 7], ['depart', 7], ['at anchor', 9], ['focus', 7], ['leg m', 5]),
    );
    for (const s of report.stops)
      console.log(
        row(
          [s.step, 13],
          [s.stop, 14],
          [`${s.window[0]}–${s.window[1]}`, 9],
          [s.arrive.toFixed(1), 7],
          [s.depart.toFixed(1), 7],
          [`${s.present}s`, 9],
          [s.focusTime.toFixed(1), 7],
          [s.leg.toFixed(1), 5],
        ),
      );
    console.log(
      `Validated ${report.actors} actors, ${report.segments} stages, ${report.walkSamples} path samples: ${report.minWalkWallClearance} m minimum wall clearance on walks, ${report.minVisibleWallClearance} m for any visible pose; max step ${report.maxJump} m per 0.05 s (escort ${report.maxEscortStep}); ${report.vanRampSamples} van-ramp samples.`,
    );
    if (report.closestContacts.length)
      console.log(
        'Close contacts (<0.45 m): ' +
          report.closestContacts
            .slice(0, 8)
            .map((c) => `${c.a}/${c.b} ${c.d} m @${c.t} (${c.seconds}s)`)
            .join('; '),
      );
    if (report.furnitureCrossings.length)
      console.log(
        'Walks through furniture footprints (review): ' +
          report.furnitureCrossings.map((c) => `${c.actor} × ${c.object} (${c.samples})`).join('; '),
      );
    for (const n of t.notes) console.log('Note: ' + n);
    if (write) console.log(`Wrote ${paths.tracks.replace(root + '/', '')}`);
  }
  return { sim, model, scenario, result, report };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--model');
  await compile({
    write: !process.argv.includes('--check'),
    modelPath: at > 0 ? resolve(process.argv[at + 1]) : paths.model,
  });
}
