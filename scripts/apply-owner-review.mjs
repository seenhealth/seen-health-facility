// Apply every owner-walkthrough correction (October 2026) in its agreed
// order, then re-derive what depends on them. Each area script is idempotent
// and owns its own ids, so the whole sequence can be re-run after a rebuild
// of the base model or loop:
//
//   npm run apply:owner-review          # all areas, then the derived data
//   npm run apply:owner-review -- --no-derive   # the area scripts only
//
// Order matters only where areas share rooms or people: the games script
// runs first so later scripts see its cast; the others own disjoint rooms.
// The derived data (drop-off route, kitchen delivery, story tracks, trace)
// is regenerated afterwards.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const AREAS = ['games', 'care-rooms', 'rehab', 'kitchen', 'exterior', 'day-admin'];
const DERIVE = [
  ['node', 'scripts/apply-drop-off-route.mjs'],
  ['node', 'scripts/apply-kitchen-delivery.mjs'],
  ['npm', 'run', 'build:scenario'],
  ['npm', 'run', 'trace:report'],
];
const derive = !process.argv.includes('--no-derive');

const run = (cmd) => {
  console.log('> ' + cmd.join(' '));
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${cmd.join(' ')} failed (${r.status})`);
    process.exit(r.status ?? 1);
  }
};
for (const area of AREAS) {
  const script = `scripts/apply-owner-review-${area}.mjs`;
  if (!existsSync(script)) {
    console.warn(`(no ${script}; skipped)`);
    continue;
  }
  run(['node', script]);
}
if (derive) for (const cmd of DERIVE) run(cmd);
