/**
 * Standalone static build of the "A day at Seen Health" scroll story.
 *
 *   npm run build:story                         -> dist/story-site/ (relative paths)
 *   STORY_BASE=/day-at-seen/ npm run build:story -> absolute paths under a subpath
 *   npm run dev:story / npm run preview:story
 *
 * Only runtime assets the story needs are copied: the facility specification,
 * the textures and models it references, the logo and the favicon. See
 * docs/STORY.md.
 */
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const FACILITY = 'models/seen-alhambra-planning.json';
const STATIC = ['brand/seen-health-horizontal.png', 'favicon.svg'];

type Facility = {
  materials?: Record<string, { textureUrl?: string }>;
  assets?: Record<string, { modelUrl?: string }>;
};

/** Emits the facility JSON (minified) and every file it loads at runtime. */
function storyAssets(): Plugin {
  return {
    name: 'seen-story-assets',
    apply: 'build',
    generateBundle() {
      const facility = JSON.parse(readFileSync(here(`public/${FACILITY}`), 'utf8')) as Facility;
      const runtime = new Set<string>(STATIC);
      // site.image (the source plan) is only shown in plan mode; the story
      // replaces it at runtime, so it is intentionally not copied.
      for (const m of Object.values(facility.materials || {}))
        if (m.textureUrl?.startsWith('/')) runtime.add(m.textureUrl.slice(1));
      for (const a of Object.values(facility.assets || {}))
        if (a.modelUrl?.startsWith('/')) runtime.add(a.modelUrl.slice(1));
      this.emitFile({
        type: 'asset',
        fileName: FACILITY,
        source: JSON.stringify(facility),
      });
      for (const file of runtime) {
        const source = here(`public/${file}`);
        if (!existsSync(source)) {
          this.warn(`Story asset missing: public/${file}`);
          continue;
        }
        this.emitFile({ type: 'asset', fileName: file, source: readFileSync(source) });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  // The entry lives in story/site/ rather than story/: a story/index.html at
  // the repository root would be served by vinext's dev server in place of
  // the /story route.
  root: here('story/site'),
  base: process.env.STORY_BASE || './',
  // The dev server reads straight from public/; builds copy only what is needed.
  publicDir: command === 'serve' ? here('public') : false,
  envDir: here('.'),
  plugins: [react(), storyAssets()],
  server: { fs: { allow: [here('.')] } },
  build: {
    outDir: here('dist/story-site'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 1400,
    sourcemap: false,
  },
}));
