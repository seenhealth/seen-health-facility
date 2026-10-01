// Compile the day-in-the-life scenario into precomputed tracks and validate them.
//
//   npm run build:scenario            # compile + validate + write tracks JSON
//   node scripts/build-scenario.mjs --check   # compile + validate, and fail if
//                                             # the committed tracks JSON is stale
//
// The TypeScript simulation modules (app/sim/*) are bundled for Node with
// Rolldown (already installed with Vite) into work/sim/, which resolves the
// app's extensionless and JSON imports. Three.js stays external. `loadSim` is
// shared by every Node script that runs app TypeScript (renderer smoke test,
// GLB exporters, unit tests).
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

/**
 * Bundle TypeScript entries for Node and import them.
 * `dir` is the output folder (relative to the repository root); `plugins` and
 * `external` customise Rolldown (e.g. headless stand-ins for browser-only
 * modules; three.js is external by default); `load: false` only writes the
 * bundle and returns the output paths.
 */
export async function loadSim(
  entries = { sim: 'app/sim/index.ts' },
  {
    dir = 'work/sim',
    plugins = [],
    external = [/^three(\/.*)?$/],
    load = true,
  } = {},
) {
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({
    input: Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, resolve(root, v)]),
    ),
    platform: 'node',
    external,
    plugins,
    logLevel: 'warn',
  });
  const out = resolve(root, dir);
  await bundle.write({
    dir: out,
    format: 'esm',
    entryFileNames: '[name].mjs',
    chunkFileNames: '[name]-[hash].mjs',
  });
  await bundle.close();
  const files = Object.fromEntries(
    Object.keys(entries).map((k) => [k, resolve(out, `${k}.mjs`)]),
  );
  if (!load) return files;
  const modules = {};
  for (const [k, file] of Object.entries(files))
    modules[k] = await import(pathToFileURL(file).href + `?v=${Date.now()}`);
  return modules;
}

/**
 * First difference between an actual and an expected JSON value (numbers
 * compare within `tolerance`), as "path: expected …, got …"; null when equal.
 */
export function jsonDifference(a, b, tolerance = 1e-6, at = '$') {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a - b) <= tolerance ? null : `${at}: expected ${b}, got ${a}`;
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b)
    return `${at}: type changed`;
  if (a === null || b === null || typeof a !== 'object')
    return a === b
      ? null
      : `${at}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
  if (Array.isArray(a)) {
    if (a.length !== b.length)
      return `${at}: expected length ${b.length}, got ${a.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = jsonDifference(a[i], b[i], tolerance, `${at}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!(k in a) || !(k in b))
      return `${at}.${k}: ${k in a ? 'unexpected' : 'missing'}`;
    const d = jsonDifference(a[k], b[k], tolerance, `${at}.${k}`);
    if (d) return d;
  }
  return null;
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
  // Day-room stations stay protected from new walking routes.
  for (const a of mine)
    for (const s of a.segments.filter((s) => s.action === 'walk' && s.visible !== false && a.levelId === 'ground'))
      for (let i = 1; i < s.path.length; i++)
        for (let j = 0; j <= 20; j++) {
          const x = s.path[i - 1][0] + ((s.path[i][0] - s.path[i - 1][0]) * j) / 20,
            z = s.path[i - 1][1] + ((s.path[i][1] - s.path[i - 1][1]) * j) / 20;
          for (const st of sim.dayProgram.stations)
            assert.ok(Math.hypot(x - st.position[0], z - st.position[1]) >= 0.63, `${a.id} crosses activity seating`);
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

/** Total length of the union of [start, end] spans. */
function unionLength(spans) {
  let total = 0,
    end = -Infinity;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (b <= end) continue;
    total += b - Math.max(a, end);
    end = b;
  }
  return total;
}
const overlapOf = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
/** Interactions the network settings are due to gain, and the cutaway that should feature them. */
const PENDING_FEATURES = [
  { stepId: 'network-partner', interactionId: 'partner-rn-review', role: 'rn', spec: 'SPEC-partner-adc §7.2' },
];

/**
 * The story's timeline and cutaways (docs/STORY.md, "Cutaways"). Every
 * cutaway features community interactions that exist in the composed story
 * source, at its setting, inside its window; the scrub windows
 * (`scrubWindows`) tile the day from 0; and the on-screen trimming never hides
 * a hero focus time, cuts into a stop or leaves a kicker time outside its
 * chapter. Throws one error listing every failure; returns the timeline rows
 * and notices for the integrator (`HOME_AM_RETIME`, interactions due to be
 * featured).
 */
export function validateStory(sim, model, scenario, result) {
  const duration = result.source.duration,
    steps = scenario.steps;
  const compiled = new Map(result.steps.map((s) => [s.id, s]));
  const composed = sim.alhambraSource(model, result.source);
  const interactions = new Map(composed.interactions.map((i) => [i.id, i]));
  const settings = new Set(sim.careSettings.map((s) => s.id));
  const team = new Set(sim.careTeam.members.map((m) => m.id));
  const failures = [],
    notices = [];
  const fail = (message) => failures.push(message);
  const isCutaway = (s) => s.placement?.mode === 'cutaway' || !!s.settingId;
  const kickerAt = (s) => {
    const [head] = (s.kicker || '').split('·');
    return /\d:\d\d/.test(head) ? sim.clockToLoop(head.trim()) : null;
  };
  const span = (w) => `${round(w[0], 2)}–${round(w[1], 2)}`;

  // 1. Cutaways: setting, window, featured interactions, roles, kicker.
  for (const s of steps.filter(isCutaway)) {
    const at = `cutaway ${s.id}`,
      [w0, w1] = s.window,
      zone = sim.settingZone(s.settingId);
    if (s.placement?.mode !== 'cutaway') fail(`${at}: placement.mode must be 'cutaway'`);
    if (s.heroPresent !== false) fail(`${at}: heroPresent must be false`);
    if (s.roomId !== null) fail(`${at}: roomId must be null`);
    if (!settings.has(s.settingId)) fail(`${at}: settingId ${s.settingId} is not in careSettings`);
    if (s.zoneId !== zone) fail(`${at}: zoneId ${s.zoneId} must be ${zone}`);
    if (!(w0 >= 0 && w1 <= duration && w1 - w0 >= 6))
      fail(`${at}: window ${span(s.window)} must lie inside 0–${duration} and last at least 6 s`);
    const ids = s.interactionIds || [];
    if (!ids.length) fail(`${at}: interactionIds is empty`);
    const spans = [];
    for (const id of ids) {
      const i = interactions.get(id);
      if (!i) {
        fail(`${at}: interaction ${id} is not in the composed story source`);
        continue;
      }
      const o = overlapOf([i.start, i.end], s.window);
      if (o < 4)
        fail(`${at}: ${id} (${span([i.start, i.end])}) overlaps the window by ${round(o, 2)} s (need at least 4)`);
      if (![zone, 'site', 'upper-office'].includes(i.zoneId))
        fail(`${at}: ${id} happens in ${i.zoneId}, not at ${s.settingId}`);
      if (o > 0) spans.push([Math.max(i.start, w0), Math.min(i.end, w1)]);
    }
    const covered = unionLength(spans);
    if (ids.length && covered < 0.6 * (w1 - w0) - 1e-9)
      fail(`${at}: featured interactions cover ${round(covered, 2)} s of the ${w1 - w0} s window (need 60 %)`);
    for (const r of s.roles) if (!team.has(r)) fail(`${at}: role ${r} is not a care-team id`);
    for (const h of s.handoffs)
      for (const end of [h.from, h.to]) if (!team.has(end)) fail(`${at}: handoff end ${end} is not a care-team id`);
    const k = kickerAt(s);
    if (k === null || k < w0 - 1e-6 || k > w1 + 1e-6)
      fail(`${at}: kicker "${s.kicker}" (${k === null ? 'no time' : round(k, 2) + ' s'}) lies outside its window ${span(s.window)}`);
    // 3. The compiled summary points the camera at the first featured interaction.
    const c = compiled.get(s.id);
    if (!c) fail(`${at}: missing from the compiled steps`);
    else {
      if (c.heroPresent !== false || c.settingId !== s.settingId || c.roomId !== null)
        fail(`${at}: compiled step must have heroPresent false, roomId null and settingId ${s.settingId}`);
      if (c.focusActorId !== `interaction:${ids[0]}`)
        fail(`${at}: compiled focusActorId ${c.focusActorId} must be interaction:${ids[0]}`);
      if (!(c.focusTime >= w0 && c.focusTime <= w1)) fail(`${at}: focus time ${c.focusTime} lies outside its window`);
      const live = ids.some((id) => {
        const i = interactions.get(id);
        return i && c.focusTime >= i.start && c.focusTime <= i.end;
      });
      if (!live) fail(`${at}: focus time ${c.focusTime} falls outside every featured interaction`);
    }
  }

  // 2. Timeline: scrub windows tile the day; trimming hides nothing of the hero's.
  const scrub = sim.scrubWindows(steps);
  if (Math.abs(scrub[0][0]) > 1e-6) fail(`timeline starts at ${scrub[0][0]} s, not 0`);
  for (let i = 1; i < scrub.length; i++)
    if (Math.abs(scrub[i][0] - scrub[i - 1][1]) > 1e-6)
      fail(
        `timeline is not contiguous: ${steps[i - 1].id} ends at ${scrub[i - 1][1]} s, ${steps[i].id} starts at ${scrub[i][0]} s`,
      );
  if (scrub.at(-1)[1] > duration + 1e-6) fail(`timeline ends at ${scrub.at(-1)[1]} s, after ${duration}`);
  const cutaways = steps.filter(isCutaway);
  for (let a = 0; a < cutaways.length; a++)
    for (let b = a + 1; b < cutaways.length; b++)
      if (overlapOf(cutaways[a].window, cutaways[b].window) > 1e-6)
        fail(`cutaways ${cutaways[a].id} and ${cutaways[b].id} overlap`);
  steps.forEach((s, i) => {
    if (isCutaway(s)) return;
    const at = `hero step ${s.id}`,
      [a, b] = scrub[i],
      c = compiled.get(s.id);
    if (b - a < 20) fail(`${at}: scrub window ${span(scrub[i])} lasts under 20 s`);
    if (!c) return fail(`${at}: missing from the compiled steps`);
    if (!(c.focusTime >= a + 1 && c.focusTime <= b - 1))
      fail(`${at}: focus time ${c.focusTime} is not inside its scrub window ${span(scrub[i])} with a 1 s margin`);
    const k = kickerAt(s);
    if (k !== null && (k < a - 1e-6 || k > b + 1e-6))
      fail(`${at}: kicker "${s.kicker}" (${round(k, 2)} s) lies outside its scrub window ${span(scrub[i])}`);
    // Every stop begins on screen; where a cutaway follows, it also ends before the cut.
    const clippedEnd = b < s.window[1] - 1e-9;
    for (const stop of c.stops) {
      if (stop.arrive < a - 1e-6 || stop.arrive > b + 1e-6)
        fail(`${at}: stop ${stop.id} begins at ${round(stop.arrive, 2)} s, outside its scrub window ${span(scrub[i])}`);
      if (clippedEnd && stop.depart > b + 1e-6)
        fail(`${at}: stop ${stop.id} lasts until ${round(stop.depart, 2)} s, after the cut to ${steps[i + 1].id} at ${b} s`);
    }
  });

  // Integration notices: the home's morning re-time, and interactions due to be featured.
  const R = sim.HOME_AM_RETIME,
    home = steps.find((s) => s.id === R.stepId),
    personal = interactions.get(R.interactionId);
  const sameWindow = (w, v) => Math.abs(w[0] - v[0]) < 1e-6 && Math.abs(w[1] - v[1]) < 1e-6;
  if (home && personal) {
    const target = R.target.window,
      fits = overlapOf([personal.start, personal.end], target) >= Math.max(4, 0.6 * (target[1] - target[0]));
    if (sameWindow(home.window, R.now.window))
      notices.push(
        fits
          ? `READY: ${R.interactionId} now runs ${span([personal.start, personal.end])} s. Move ${R.stepId} to ${span(target)} (kicker "${R.target.kicker}") and ${R.previousStepId} to ${span(R.target.previousWindow)} as HOME_AM_RETIME.target says (app/sim/story-timeline.ts), then run npm run build:scenario.`
          : `${R.stepId} plays ${span(R.now.window)} s (HOME_AM_RETIME.now) because ${R.interactionId} runs ${span([personal.start, personal.end])} s; it moves to ${span(target)} s once personal care is re-timed indoors (app/sim/story-timeline.ts).`,
      );
    else if (!sameWindow(home.window, target))
      notices.push(
        `${R.stepId} plays ${span(home.window)} s, neither HOME_AM_RETIME.now nor .target; update the constant in app/sim/story-timeline.ts.`,
      );
  }
  for (const p of PENDING_FEATURES) {
    const step = steps.find((s) => s.id === p.stepId);
    if (step && interactions.has(p.interactionId) && !(step.interactionIds || []).includes(p.interactionId))
      notices.push(
        `READY: ${p.interactionId} exists (${p.spec}); feature it in ${p.stepId} (interactionIds, and '${p.role}' in roles) and update its copy.`,
      );
  }

  assert.equal(failures.length, 0, `Story timeline (${failures.length} problem(s)):\n  ${failures.join('\n  ')}`);
  const rows = steps.map((s, i) => {
    const c = compiled.get(s.id);
    const featured = isCutaway(s)
      ? (s.interactionIds || []).map((id) => {
          const x = interactions.get(id);
          return `${id} ${span([x.start, x.end])}`;
        })
      : (c?.stops || []).map((st) => `${st.id} ${span([st.arrive, st.depart])}`);
    return {
      id: s.id,
      kind: isCutaway(s) ? 'cutaway' : s.placement?.mode || 'hero',
      scrub: scrub[i],
      clock: `${sim.clockLabel(scrub[i][0])}–${sim.clockLabel(scrub[i][1])}`,
      focus: c?.focusTime,
      featured: featured.join(', ') || '—',
    };
  });
  return { rows, notices };
}

/**
 * Compile and validate the scenario. `write` stores the tracks JSON; `check`
 * fails when the committed tracks differ from the fresh compile (drift), so a
 * change to rooms, seats, base tracks or the compiler cannot ship stale tracks.
 */
export async function compile({
  write = true,
  check = false,
  quiet = false,
  modelPath = paths.model,
} = {}) {
  const started = Date.now();
  const { sim } = await loadSim();
  const model = sim.validateFacility(JSON.parse(readFileSync(modelPath, 'utf8')));
  const scenario = JSON.parse(readFileSync(paths.scenario, 'utf8'));
  const t0 = Date.now();
  // Cutaway focus times come from the community interactions of the composed source.
  const result = sim.compileScenario(model, scenario, sim.activityData, {
    context: sim.alhambraSource(model, sim.activityData),
  });
  const compileMs = Date.now() - t0;
  const report = validateTracks(sim, model, scenario, result);
  const story = validateStory(sim, model, scenario, result);
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
    console.log('Story timeline (scrub windows: hero chapters clipped around cutaways):');
    console.log(row(['#', 3], ['Beat', 19], ['Kind', 9], ['Scrub', 9], ['Clock', 18], ['Focus', 7], ['Featured interactions / hero stops', 0]));
    story.rows.forEach((r, i) =>
      console.log(
        row(
          [i + 1, 3],
          [r.id, 19],
          [r.kind, 9],
          [`${r.scrub[0]}–${r.scrub[1]}`, 9],
          [r.clock, 18],
          [r.focus === undefined ? '—' : r.focus.toFixed(1), 7],
          [r.featured, 0],
        ),
      ),
    );
    for (const n of story.notices) console.log('Story: ' + n);
    if (write) console.log(`Wrote ${paths.tracks.replace(root + '/', '')}`);
  }
  if (check) {
    const file = paths.tracks.replace(root + '/', '');
    // The committed tracks belong to the published Alhambra model only.
    if (modelPath !== paths.model) {
      if (!quiet) console.log(`Drift check skipped: ${file} is compiled from the default model.`);
    } else {
      const drift = jsonDifference(
        JSON.parse(JSON.stringify(result.tracks)),
        JSON.parse(readFileSync(paths.tracks, 'utf8')),
      );
      assert.equal(
        drift,
        null,
        `${file} differs from a fresh compile (${drift}; expected = committed). Run \`npm run build:scenario\` and commit the tracks.`,
      );
      if (!quiet) console.log(`${file} matches the fresh compile.`);
    }
  }
  return { sim, model, scenario, result, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const at = process.argv.indexOf('--model'),
    check = process.argv.includes('--check');
  await compile({
    write: !check,
    check,
    modelPath: at > 0 ? resolve(process.argv[at + 1]) : paths.model,
  });
}
