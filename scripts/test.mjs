// Unit tests for the pure simulation core (clock labels, source composition,
// vehicle seat frames, fleet driveway reservations).
//
//   npm run test:unit     # just these tests
//   npm test              # every validator (npm run validate), then these
//
// test/*.test.ts import app modules directly; they are bundled for Node with
// loadSim (Rolldown, three external) into work/test/ and run with node --test.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSim } from './build-scenario.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tests = readdirSync(resolve(root, 'test'))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();
if (!tests.length) throw new Error('No test/*.test.ts files found');
const files = await loadSim(
  Object.fromEntries(tests.map((f) => [f.replace(/\.ts$/, ''), `test/${f}`])),
  { dir: 'work/test', load: false },
);
const run = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=spec', ...Object.values(files)],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
process.exitCode = run.status ?? 1;
