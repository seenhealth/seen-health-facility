/**
 * Standalone static build of the live lot page (viewer/live): the Alhambra
 * scene with Seen's real vehicles, driven by postMessage from the dispatch app.
 *
 *   npm run build:live   -> dist/live-site/ (relative paths)
 *   npm run dev:live
 */
import tailwindcss from '@tailwindcss/postcss';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const FACILITY = 'models/seen-alhambra-planning.json';
const STATIC = ['brand/seen-health-horizontal.png', 'favicon.svg', 'reference/fleet/final-vans.png', 'models/seen-home-wong.json', 'models/fleet-van.glb', 'models/live-cars.glb', 'reference/photos/lobby-door-decal.png', 'reference/photos/lobby-door-stickers.png', 'reference/photos/lobby-no-smoking.png', 'reference/photos/lobby-access-sign.png'];

type Facility = { site?: { image?: string }; levels?: { planImage?: string }[]; materials?: Record<string, { textureUrl?: string }>; assets?: Record<string, { modelUrl?: string }> };

function liveAssets(): Plugin {
  return {
    name: 'seen-live-assets',
    apply: 'build',
    generateBundle() {
      const facility = JSON.parse(readFileSync(here(`public/${FACILITY}`), 'utf8')) as Facility;
      this.emitFile({ type: 'asset', fileName: FACILITY, source: JSON.stringify(facility) });
      const runtime = new Set<string>(STATIC);
      for (const u of [facility.site?.image, ...(facility.levels || []).map((l) => l.planImage), ...Object.values(facility.materials || {}).map((m) => m.textureUrl), ...Object.values(facility.assets || {}).map((a) => a.modelUrl)])
        if (u && /^\/[^/]/.test(u)) runtime.add(u.slice(1));
      for (const file of runtime) {
        const source = here(`public/${file}`);
        if (!existsSync(source)) this.warn(`Live asset missing: public/${file}`);
        else this.emitFile({ type: 'asset', fileName: file, source: readFileSync(source) });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  root: here('viewer/live'),
  base: process.env.VIEWER_BASE || './',
  publicDir: command === 'serve' ? here('public') : false,
  envDir: here('.'),
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [liveAssets()],
  server: { fs: { allow: [here('.')] } },
  build: { outDir: here('dist/live-site'), emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 2600, sourcemap: false },
}));
