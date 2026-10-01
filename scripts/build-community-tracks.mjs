// Facility instances on community pads: generate and validate their
// summaries (and, with a cast file, the people inside them).
//
//   npm run build:community                          # generate + validate + write
//   node scripts/build-community-tracks.mjs --check  # npm run validate:community-tracks:
//                                                    # regenerate in memory, validate,
//                                                    # fail if the committed JSON drifted
//
// For every registry setting with a `facility` (app/model/community-settings.ts)
// it reads the specification from public/ and writes
//   app/data/community-instances.json  footprint + rooms per setting (sizes the
//                                      pad, gives people the floor height)
// The TypeScript is bundled with Rolldown (`loadSim`, as build-scenario.mjs).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { jsonDifference, loadSim } from './build-scenario.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const paths = {
  instances: 'app/data/community-instances.json',
  castFile: (settingId) => `app/data/community/${settingId}.cast.json`,
};
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/** Generate and validate; `write` stores the JSON, `check` fails on drift. */
export async function build({ write = true, check = false, quiet = false } = {}) {
  const started = Date.now();
  const { community, settings, schema } = await loadSim(
    {
      community: 'app/sim/community-cast.ts',
      settings: 'app/model/community-settings.ts',
      schema: 'app/model/schema.ts',
    },
    { dir: 'work/community' },
  );
  const instances = {};
  const log = (line) => quiet || console.log(line);
  for (const s of settings.careSettings.filter((s) => s.facility)) {
    const facility = schema.validateFacility(
      JSON.parse(read('public' + s.facility.url)),
    );
    assert.equal(
      facility.id,
      s.facility.id,
      `${s.id}: ${s.facility.url} holds ${facility.id}, not ${s.facility.id}`,
    );
    const castPath = paths.castFile(s.id),
      castText = existsSync(resolve(root, castPath)) ? read(castPath) : null,
      castSha1 = castText
        ? createHash('sha1').update(castText).digest('hex')
        : null;
    const summary = community.instanceSummary(facility, s.facility, castSha1);
    const site = community.checkInstanceSite(s, summary);
    instances[s.id] = summary;
    log(
      `${s.id}: ${facility.id} (${summary.footprint.length} zones, ${summary.rooms.length} rooms) on a ${site.pad.w.toFixed(2)} × ${site.pad.d} m pad (back ${(site.pad.back ?? 0).toFixed(2)} m); ` +
        `paving ≥ ${site.pavingClearance} m from the building; pad slack side ${site.padSlack.side} / front ${site.padSlack.front} / back ${site.padSlack.back} m; ` +
        `grounds ${Object.entries(site.grounds).map(([k, d]) => `${k} ${d} m`).join(', ') || 'none'}.`,
    );
  }
  const output = { [paths.instances]: { version: 1, instances } };
  for (const [file, data] of Object.entries(output)) {
    const text = JSON.stringify(data, null, 1) + '\n';
    if (check) {
      const drift = jsonDifference(
        JSON.parse(text),
        JSON.parse(read(file)),
      );
      assert.equal(
        drift,
        null,
        `${file} differs from a fresh build (${drift}; expected = committed). Run \`npm run build:community\` and commit it.`,
      );
      log(`${file} matches the fresh build.`);
    }
    if (write) {
      writeFileSync(resolve(root, file), text);
      log(`Wrote ${file}`);
    }
  }
  log(`Community instances built in ${Date.now() - started} ms.`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  await build({ write: !check, check });
}
