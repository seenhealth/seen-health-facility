/**
 * Standalone static build of the 3D facility viewer (app/page.tsx).
 *
 *   npm run build:viewer                          -> dist/viewer-site/ (relative paths)
 *   VIEWER_BASE=/facility/ npm run build:viewer   -> absolute paths under a subpath
 *   npm run dev:viewer / npm run preview:viewer
 *
 * Only runtime files are copied: the facility specifications the page fetches
 * (minified), the textures, models and plan images they reference, the logo
 * and the favicon. viewer/site/asset-base.ts rebases the app's root-relative
 * URLs onto the build's folder at runtime. See README, "Static viewer build".
 */
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Logger, type Plugin } from 'vite';
import { sites } from './app/data/sites';
import { instanceFacilityUrls } from './app/model/community-settings';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
/**
 * Every specification the viewer fetches: one per site, Olympic's clinic
 * option and the facilities stamped on community pads.
 */
const FACILITIES = [
  ...new Set([
    ...sites.map((s) => s.model),
    '/models/seen-olympic-option.json',
    ...instanceFacilityUrls(),
  ]),
].map((p) => p.slice(1));
const STATIC = [
  'brand/seen-health-horizontal.png',
  'favicon.svg',
  'reference/fleet/final-vans.png',
];
/** Reviewed public textures only, as in scripts/validate-public-assets.mjs. */
const PUBLIC_REFERENCE = /^reference\/(photos\/[^/]+|fleet\/final-vans\.png)$/;
/** Static-host budget for the whole site (claude.ai artifacts allow 16 MB a file). */
const BUDGET_MB = 16;

type Facility = {
  site?: { image?: string };
  levels?: { planImage?: string }[];
  materials?: Record<string, { textureUrl?: string }>;
  assets?: Record<string, { modelUrl?: string }>;
};

/** Root-relative files a specification makes the viewer load. */
function runtimeFiles(f: Facility) {
  return [
    f.site?.image,
    ...(f.levels || []).map((l) => l.planImage),
    ...Object.values(f.materials || {}).map((m) => m.textureUrl),
    ...Object.values(f.assets || {}).map((a) => a.modelUrl),
  ]
    .filter((u): u is string => !!u && /^\/[^/]/.test(u))
    .map((u) => u.slice(1));
}

/** Emits the facility specifications and every file they load at runtime. */
function viewerAssets(): Plugin {
  let logger: Logger;
  return {
    name: 'seen-viewer-assets',
    apply: 'build',
    configResolved(config) {
      logger = config.logger;
    },
    generateBundle() {
      const runtime = new Set<string>(STATIC);
      for (const file of FACILITIES) {
        const facility = JSON.parse(
          readFileSync(here(`public/${file}`), 'utf8'),
        ) as Facility;
        this.emitFile({
          type: 'asset',
          fileName: file,
          source: JSON.stringify(facility),
        });
        for (const f of runtimeFiles(facility)) runtime.add(f);
      }
      for (const file of runtime) {
        const source = here(`public/${file}`);
        if (file.startsWith('reference/') && !PUBLIC_REFERENCE.test(file))
          this.warn(`Not a reviewed public texture, skipped: public/${file}`);
        else if (!existsSync(source))
          this.warn(`Viewer asset missing: public/${file}`);
        else
          this.emitFile({
            type: 'asset',
            fileName: file,
            source: readFileSync(source),
          });
      }
    },
    writeBundle(_, bundle) {
      const bytes = Object.values(bundle).reduce(
        (sum, out) =>
          sum +
          (out.type === 'chunk'
            ? Buffer.byteLength(out.code)
            : typeof out.source === 'string'
              ? Buffer.byteLength(out.source)
              : out.source.byteLength),
        0,
      );
      const mb = bytes / 1024 / 1024;
      const line = `viewer site: ${Object.keys(bundle).length} files, ${mb.toFixed(2)} MB`;
      if (mb > BUDGET_MB)
        logger.warn(`${line} (over the ${BUDGET_MB} MB budget)`);
      else logger.info(line);
    },
  };
}

export default defineConfig(({ command }) => ({
  // The entry lives in viewer/site/ (not an index.html at the repository root,
  // which the vinext dev server would serve in place of the app route).
  root: here('viewer/site'),
  base: process.env.VIEWER_BASE || './',
  // The dev server reads straight from public/; builds copy only what is needed.
  publicDir: command === 'serve' ? here('public') : false,
  envDir: here('.'),
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react(), viewerAssets()],
  server: { fs: { allow: [here('.')] } },
  build: {
    outDir: here('dist/viewer-site'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 2600,
    sourcemap: false,
  },
}));
