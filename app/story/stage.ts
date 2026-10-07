import type { Facility } from '../model/schema';
import type { Viewer } from './director';
import { FLEET_VAN_MODEL_URL, preloadFleetVanModel } from '../model/fleet-van-model';

/** Facility specification, relative to the asset base. */
export const FACILITY_PATH = 'models/seen-alhambra-planning.json';
/** Device pixel ratio ceiling for the story stage. */
const MAX_PIXEL_RATIO = 1.75;
// The source-plan overlay (`site.image`, ~2.8 MB) only shows in plan mode,
// which the story never uses; a 1 px stand-in avoids downloading it.
const BLANK_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** Resolves a root-relative asset path ("/reference/x.png") against the base. */
export function assetUrl(base: string, path: string) {
  if (/^(data:|https?:)/.test(path)) return path;
  const root = new URL(base || '/', document.baseURI);
  return new URL(path.replace(/^\/+/, ''), root).href;
}

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Points every runtime-loaded asset in the facility at the story's base path. */
function rebase(model: Facility, base: string) {
  model.site.image = BLANK_PIXEL;
  for (const m of Object.values(model.materials))
    if (m.textureUrl) m.textureUrl = assetUrl(base, m.textureUrl);
  for (const a of Object.values(model.assets))
    if (a.modelUrl) a.modelUrl = assetUrl(base, a.modelUrl);
}

export async function bootStage(
  host: HTMLElement,
  base: string,
  signal: AbortSignal,
): Promise<{ viewer: Viewer; model: Facility; heroId: string | null }> {
  if (!hasWebGL()) throw new Error('WebGL is not available');
  const [response, schema, renderer, heroSource] = await Promise.all([
    fetch(assetUrl(base, FACILITY_PATH), { signal }),
    import('../model/schema'),
    import('../model/renderer'),
    import('./hero-source'),
    preloadFleetVanModel(assetUrl(base, FLEET_VAN_MODEL_URL)),
  ]);
  if (!response.ok) throw new Error('The facility model could not be loaded.');
  const model = schema.validateFacility(await response.json());
  rebase(model, base);
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { source, heroId } = heroSource.storyActivitySource();
  const viewer = renderer.createViewer(host, model, () => {}, {
    activity: source,
    interactive: false,
    maxPixelRatio: MAX_PIXEL_RATIO,
    labels: false,
    keepSiteWhenStacked: true,
    // Facilities stamped on community pads, from the story's asset base.
    loadFacility: async (url) => {
      const r = await fetch(assetUrl(base, url), { signal });
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      const f = schema.validateFacility(await r.json());
      rebase(f, base);
      return f;
    },
  });
  viewer.setInteractive(false);
  viewer.activity.setOptions({
    enabled: true,
    playing: false,
    follow: null,
    paths: false,
    time: 0,
  });
  return {
    viewer,
    model,
    heroId: source.actors.some((a) => a.id === heroId) ? heroId : null,
  };
}
