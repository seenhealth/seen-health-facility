// Headless renderer smoke test, and the headless viewer harness shared with the
// GLB exporters (export-model.mjs, export-additional-sites.mjs).
//
//   npm run validate:renderer
//
// `loadHeadlessViewer` bundles app/model/renderer.ts and everything it imports
// with Rolldown (`loadSim`), so a new import in app/model needs no script
// change. Browser-only pieces are replaced with Node stand-ins: a small DOM
// (elements, a document and a 2D canvas, or @napi-rs/canvas when supplied), a
// WebGLRenderer that records what it would draw instead of drawing, a
// TextureLoader that reads files under public/ and a PMREMGenerator. Three.js
// itself, its addons (OrbitControls, post-processing) and all app code are
// the real modules.
//
// The smoke test opens every site model, ticks 10 frames through the main
// render modes (ambient-occlusion pipeline, balanced, interior with labels,
// tilt-shift showcase), disposes the viewer and checks that every geometry
// and material the renderer would have uploaded was disposed after its last
// use, that no DOM listener, element, resize observer or animation frame is
// left behind, and that every texture URL resolves to a file.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as T from 'three';
import { loadSim } from './build-scenario.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Site models the app can open (app/data/sites.ts plus the Olympic option). */
export const SITE_MODELS = [
  'public/models/seen-alhambra-planning.json',
  'public/models/seen-olympic.json',
  'public/models/seen-olympic-option.json',
  'public/models/seen-alveare.json',
];

// ---------------------------------------------------------------------------
// Resource tracking: what the renderer would upload, and what gets disposed.
// ---------------------------------------------------------------------------
let session = null;
let sequence = 0;
/** Start recording renderer resources for one viewer's lifetime. */
function beginSession() {
  session = {
    created: { geometries: 0, materials: 0 },
    used: new Map(),
    disposed: new Map(),
    onDispose(event) {
      session?.disposed.set(event.target, ++sequence);
    },
  };
  return session;
}
function endSession() {
  const s = session;
  for (const resource of s.used.keys())
    resource.removeEventListener('dispose', s.onDispose);
  session = null;
  return s;
}
/** Every geometry/material reachable from `object` counts as uploaded now. */
function recordUse(object, context) {
  if (!session) return;
  object.traverse((o) => {
    if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
    for (const resource of [o.geometry, o.material].flat()) {
      if (!resource) continue;
      const entry = session.used.get(resource);
      if (entry) entry.last = ++sequence;
      else {
        resource.addEventListener('dispose', session.onDispose);
        session.used.set(resource, { object: o, context, last: ++sequence });
      }
    }
  });
}
/**
 * Count construction of geometries and materials: both base constructors
 * assign an `is*` flag on the instance, which a prototype setter observes.
 */
function countConstruction() {
  for (const [proto, flag, kind] of [
    [T.BufferGeometry.prototype, 'isBufferGeometry', 'geometries'],
    [T.Material.prototype, 'isMaterial', 'materials'],
  ])
    Object.defineProperty(proto, flag, {
      configurable: true,
      get: () => undefined,
      set(value) {
        Object.defineProperty(this, flag, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        if (session) session.created[kind]++;
      },
    });
}

// ---------------------------------------------------------------------------
// DOM stand-ins.
// ---------------------------------------------------------------------------
const listenerCount = (target) =>
  [...target.listeners.values()].reduce((n, set) => n + set.size, 0);
class HeadlessEventTarget {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent() {
    return true;
  }
}
class HeadlessElement extends HeadlessEventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.textContent = '';
    this.className = '';
    this.title = '';
    this.onclick = null;
    this.clientWidth = 0;
    this.clientHeight = 0;
    const style = {
      setProperty: (k, v) => (style[k] = v),
      removeProperty: (k) => delete style[k],
    };
    this.style = style;
    const classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on = !classes.has(c)) => (
        on ? classes.add(c) : classes.delete(c),
        on
      ),
      contains: (c) => classes.has(c),
    };
  }
  get ownerDocument() {
    return globalThis.document;
  }
  get isConnected() {
    return this.parentNode !== null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  appendChild(child) {
    child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    child.remove();
    return child;
  }
  remove() {
    const siblings = this.parentNode?.children;
    if (siblings) siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
  getRootNode() {
    return globalThis.document;
  }
  getBoundingClientRect() {
    const w = this.clientWidth,
      h = this.clientHeight;
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
    };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return false;
  }
  focus() {}
}
/** Accepts the 2D canvas API the app uses; draws nothing. */
class HeadlessContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    Object.assign(this, {
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: true,
    });
    for (const name of [
      'fillRect',
      'strokeRect',
      'clearRect',
      'fillText',
      'strokeText',
      'beginPath',
      'closePath',
      'moveTo',
      'lineTo',
      'arc',
      'arcTo',
      'ellipse',
      'rect',
      'roundRect',
      'quadraticCurveTo',
      'bezierCurveTo',
      'fill',
      'stroke',
      'clip',
      'save',
      'restore',
      'translate',
      'rotate',
      'scale',
      'transform',
      'setTransform',
      'resetTransform',
      'drawImage',
      'putImageData',
      'setLineDash',
    ])
      this[name] = () => {};
  }
  measureText(text) {
    return { width: String(text).length * 6 };
  }
  createImageData(width, height) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }
  getImageData(x, y, width, height) {
    return this.createImageData(width, height);
  }
  createLinearGradient() {
    return { addColorStop() {} };
  }
  createRadialGradient() {
    return { addColorStop() {} };
  }
  createPattern() {
    return {};
  }
}
class HeadlessCanvas extends HeadlessElement {
  constructor(width = 300, height = 150) {
    super('canvas');
    this.width = width;
    this.height = height;
    this.context = null;
  }
  getContext(kind) {
    if (kind !== '2d') return null;
    return (this.context ??= new HeadlessContext2D(this));
  }
  toDataURL() {
    return 'data:image/png;base64,';
  }
}
class HeadlessImage {
  width = 1;
  height = 1;
}
class HeadlessDocument extends HeadlessEventTarget {
  hidden = false;
  visibilityState = 'visible';
  constructor(canvas) {
    super();
    this.canvasModule = canvas;
    this.body = new HeadlessElement('body');
  }
  createElement(tagName) {
    if (tagName !== 'canvas') return new HeadlessElement(tagName);
    if (!this.canvasModule) return new HeadlessCanvas();
    const c = this.canvasModule.createCanvas(1, 1);
    // @napi-rs/canvas exposes data(), which GLTFExporter would mistake for
    // raw pixels; hide it so the exporter takes the drawImage path.
    Object.defineProperty(c, 'data', { value: undefined });
    c.toBlob = (callback, type = 'image/png') =>
      callback(new Blob([c.toBuffer(type)], { type }));
    return c;
  }
}
/** Node 22 has Blob but no FileReader, which GLTFExporter uses. */
class HeadlessFileReader {
  result = null;
  onload = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onload?.();
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    void blob.arrayBuffer().then((v) => {
      this.result = `data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
}

// ---------------------------------------------------------------------------
// Three.js stand-ins (WebGLRenderer, TextureLoader, PMREMGenerator).
// ---------------------------------------------------------------------------
const harness = {
  /** Latest scene and camera passed to the renderer. */
  scene: null,
  camera: null,
  renderers: [],
  observers: [],
  frame: null,
  frameId: 0,
  now: 0,
  canvasModule: null,
  textureRequests: [],
  missingTextures: [],
};
class HeadlessWebGLRenderer {
  constructor(parameters = {}) {
    this.parameters = parameters;
    this.domElement = new HeadlessCanvas();
    this.shadowMap = {
      enabled: false,
      type: T.PCFShadowMap,
      autoUpdate: true,
      needsUpdate: false,
    };
    this.capabilities = {
      isWebGL2: true,
      maxTextureSize: 8192,
      maxSamples: 4,
      getMaxAnisotropy: () => 8,
    };
    this.info = {
      autoReset: true,
      render: { frame: 0, calls: 0 },
      memory: {},
      reset() {},
    };
    this.autoClear =
      this.autoClearColor =
      this.autoClearDepth =
      this.autoClearStencil =
        true;
    this.localClippingEnabled = false;
    this.clippingPlanes = [];
    this.outputColorSpace = T.SRGBColorSpace;
    this.toneMapping = T.NoToneMapping;
    this.toneMappingExposure = 1;
    this.xr = { enabled: false, isPresenting: false };
    this.pixelRatio = 1;
    this.size = new T.Vector2(1, 1);
    this.clearValue = { color: new T.Color(0x000000), alpha: 1 };
    this.target = null;
    this.disposed = false;
    harness.renderers.push(this);
  }
  setPixelRatio(value) {
    this.pixelRatio = value;
  }
  getPixelRatio() {
    return this.pixelRatio;
  }
  setSize(width, height) {
    this.size.set(width, height);
  }
  getSize(target) {
    return target.copy(this.size);
  }
  getDrawingBufferSize(target) {
    return target.copy(this.size).multiplyScalar(this.pixelRatio).floor();
  }
  setRenderTarget(target) {
    this.target = target;
  }
  getRenderTarget() {
    return this.target;
  }
  getClearColor(target) {
    return target.copy(this.clearValue.color);
  }
  setClearColor(color, alpha = 1) {
    this.clearValue.color.set(color);
    this.clearValue.alpha = alpha;
  }
  getClearAlpha() {
    return this.clearValue.alpha;
  }
  setClearAlpha(alpha) {
    this.clearValue.alpha = alpha;
  }
  clear() {}
  clearColor() {}
  clearDepth() {}
  clearStencil() {}
  setViewport() {}
  setScissor() {}
  setScissorTest() {}
  getContext() {
    return null;
  }
  compile() {}
  render(scene, camera) {
    assert.ok(!this.disposed, 'Render after renderer.dispose()');
    if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
    if (camera.parent === null && camera.matrixWorldAutoUpdate !== false)
      camera.updateMatrixWorld();
    recordUse(scene, this.target ? 'render target' : 'screen');
    if (scene.isScene) {
      harness.scene = scene;
      harness.camera = camera;
    }
    this.info.render.frame++;
  }
  dispose() {
    this.disposed = true;
  }
}
class HeadlessPMREMGenerator {
  constructor(renderer) {
    this.renderer = renderer;
  }
  fromScene(scene) {
    recordUse(scene, `environment (${scene.constructor.name})`);
    return new T.WebGLRenderTarget(1, 1);
  }
  fromEquirectangular() {
    return new T.WebGLRenderTarget(1, 1);
  }
  compileEquirectangularShader() {}
  compileCubemapShader() {}
  dispose() {}
}
/** Image for a public URL: @napi-rs/canvas pixels, or a sized placeholder. */
async function loadPublicImage(url) {
  const file = resolve(root, 'public' + url);
  harness.textureRequests.push(url);
  if (!existsSync(file)) {
    harness.missingTextures.push(url);
    throw new Error(`Missing texture ${url}`);
  }
  if (harness.canvasModule)
    return harness.canvasModule.loadImage(await readFile(file));
  return new HeadlessImage();
}
class HeadlessTextureLoader {
  setPath() {
    return this;
  }
  setCrossOrigin() {
    return this;
  }
  load(url, onLoad, onProgress, onError) {
    const texture = new T.Texture();
    loadPublicImage(url).then(
      (image) => {
        texture.image = image;
        texture.needsUpdate = true;
        onLoad?.(texture);
      },
      (error) => onError?.(error),
    );
    return texture;
  }
  loadAsync(url) {
    return new Promise((done, fail) => this.load(url, done, undefined, fail));
  }
}

// ---------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------
const VIRTUAL_THREE = '\0headless-three';
/** App code imports `three` through a module that swaps in the stand-ins. */
const headlessThree = {
  name: 'headless-three',
  resolveId(source, importer) {
    return source === 'three' && importer !== VIRTUAL_THREE
      ? VIRTUAL_THREE
      : null;
  },
  load(id) {
    if (id !== VIRTUAL_THREE) return null;
    return [
      "export * from 'three';",
      'const h = globalThis.__headlessThree;',
      'export const WebGLRenderer = h.WebGLRenderer;',
      'export const TextureLoader = h.TextureLoader;',
      'export const PMREMGenerator = h.PMREMGenerator;',
    ].join('\n');
  },
};
const isThree = (id) => /^three(\/.*)?$/.test(id);

/**
 * Install the DOM stand-ins as globals (document, canvas, animation frames,
 * ResizeObserver, FileReader). Validators that build canvas-textured meshes
 * without a viewer call this directly.
 */
export function installHeadlessGlobals({ canvas } = {}) {
  harness.canvasModule = canvas || null;
  const globals = {
    document: new HeadlessDocument(canvas),
    devicePixelRatio: 1,
    requestAnimationFrame(callback) {
      harness.frame = callback;
      return ++harness.frameId;
    },
    cancelAnimationFrame(id) {
      if (id === harness.frameId) harness.frame = null;
    },
    ResizeObserver: class {
      constructor() {
        this.observed = 0;
        harness.observers.push(this);
      }
      observe() {
        this.observed++;
      }
      unobserve() {
        this.observed = Math.max(0, this.observed - 1);
      }
      disconnect() {
        this.observed = 0;
      }
    },
    FileReader: HeadlessFileReader,
    HTMLCanvasElement: canvas
      ? canvas.createCanvas(1, 1).constructor
      : HeadlessCanvas,
    HTMLImageElement: canvas ? canvas.Image : HeadlessImage,
    __headlessThree: {
      WebGLRenderer: HeadlessWebGLRenderer,
      TextureLoader: HeadlessTextureLoader,
      PMREMGenerator: HeadlessPMREMGenerator,
    },
  };
  if (canvas?.ImageData) globals.ImageData = canvas.ImageData;
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
}

/**
 * Bundle the renderer for Node and install the browser stand-ins.
 * `canvas`: an @napi-rs/canvas-compatible module for real pixels (exports);
 * omitted, canvases accept drawing calls and keep no pixels.
 */
export async function loadHeadlessViewer({ canvas } = {}) {
  installHeadlessGlobals({ canvas });
  const { renderer, schema } = await loadSim(
    { renderer: 'app/model/renderer.ts', schema: 'app/model/schema.ts' },
    {
      dir: 'work/headless',
      plugins: [headlessThree],
      // Bare `three` from app code goes through the stand-in module.
      external: (id, importer) =>
        isThree(id) && !(id === 'three' && importer !== VIRTUAL_THREE),
    },
  );
  return {
    renderer,
    schema,
    harness,
    /** A container element of the given size for createViewer. */
    host(width = 1400, height = 950) {
      const host = new HeadlessElement('div');
      host.clientWidth = width;
      host.clientHeight = height;
      return host;
    },
    /** Run `count` animation frames, `dt` seconds apart. */
    tick(count = 1, dt = 1 / 60) {
      for (let i = 0; i < count; i++) {
        const callback = harness.frame;
        assert.ok(callback, 'The viewer has an animation frame pending');
        harness.frame = null;
        harness.now = Math.max(harness.now, performance.now()) + dt * 1000;
        callback(harness.now);
      }
    },
    get scene() {
      return harness.scene;
    },
    get camera() {
      return harness.camera;
    },
  };
}

/** Exporter arguments: `[model.json] [--out dir]` (default public/models). */
export function exportArguments(argv = process.argv.slice(2)) {
  const out = argv.indexOf('--out');
  assert.ok(out < 0 || argv[out + 1], '--out needs a directory');
  return {
    outDir: out < 0 ? 'public/models' : argv[out + 1],
    modelPath:
      argv.find((a, i) => !a.startsWith('--') && (out < 0 || i !== out + 1)) ||
      SITE_MODELS[0],
  };
}

/** Load @napi-rs/canvas (or FACILITY_CANVAS_MODULE) with an actionable error. */
export async function loadCanvasModule() {
  const { createRequire } = await import('node:module');
  const id = process.env.FACILITY_CANVAS_MODULE || '@napi-rs/canvas';
  try {
    return createRequire(import.meta.url)(id);
  } catch (error) {
    throw new Error(
      `GLB export needs ${id} for texture pixels (npm install --no-save @napi-rs/canvas, or set FACILITY_CANVAS_MODULE). ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Smoke test.
// ---------------------------------------------------------------------------
/**
 * Leaks this test found in app/model/renderer.ts, reported for a fix there:
 * `{ id, where, match: (resource, use) => boolean }`. They are printed on
 * every run; anything else that leaks fails, and an entry that stops matching
 * fails too, so the list only shrinks. Empty since the RoomEnvironment and the
 * tilt-shift OutputPass are disposed.
 */
const KNOWN_LEAKS = [];
const describe = (resource, { object, context }) => {
  const names = [];
  for (let o = object; o; o = o.parent) if (o.name) names.unshift(o.name);
  const label = resource.name
    ? `${resource.type} "${resource.name}"`
    : resource.type;
  return `${label} on ${object.type} ${names.join('/') || '(unnamed)'} [${context}]`;
};

async function smokeTest() {
  countConstruction();
  const knownSeen = {};
  const viewer = await loadHeadlessViewer();
  const { createViewer, defaultState } = viewer.renderer;
  for (const path of SITE_MODELS) {
    const model = viewer.schema.validateFacility(
      JSON.parse(readFileSync(resolve(root, path), 'utf8')),
    );
    harness.textureRequests.length = harness.missingTextures.length = 0;
    harness.observers.length = harness.renderers.length = 0;
    const s = beginSession();
    const host = viewer.host();
    // Community facilities (the Wongs' home, the partner day center) resolve
    // from public/.
    const api = createViewer(host, model, () => {}, {
      loadFacility: async (url) =>
        viewer.schema.validateFacility(
          JSON.parse(readFileSync(resolve(root, 'public' + url), 'utf8')),
        ),
    });
    await api.community?.ready;
    for (const s of api.community?.settings ?? [])
      if (s.facility)
        assert.ok(
          api.community.instance(s.id),
          `${model.id}: community instance ${s.id} is stamped`,
        );
    const canvas = harness.renderers[0].domElement;
    const scene = viewer.scene;
    assert.ok(scene?.isScene, `${model.id}: first frame renders the scene`);
    for (const z of model.zones)
      assert.ok(
        scene.getObjectByName(z.id),
        `${model.id}: zone ${z.id} is built`,
      );
    assert.ok(api.activity.actors.length > 0, `${model.id}: people are placed`);
    const t0 = api.activity.getState().time;
    // 10 frames across the render paths a visitor reaches.
    viewer.tick(3);
    api.update({
      ...defaultState,
      level: model.levels[0].id,
      exterior: false,
      roof: false,
      walls: 'cutaway',
      labels: true,
    });
    viewer.tick(2);
    api.setQuality('balanced');
    viewer.tick(2);
    api.setShowcase(true);
    viewer.tick(2);
    api.setShowcase(false);
    api.update(defaultState);
    viewer.tick(1);
    assert.notEqual(
      api.activity.getState().time,
      t0,
      `${model.id}: the care-day clock advances`,
    );
    const shot = api.getShot();
    assert.ok(
      [...shot.target, shot.zoom, shot.azimuth, shot.elevation].every(
        Number.isFinite,
      ),
      `${model.id}: camera stays finite`,
    );
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(
      harness.missingTextures,
      [],
      `${model.id}: texture URLs exist under public/`,
    );
    const pending = harness.frame;
    api.dispose();
    endSession();
    // Disposal: resources released after their last use, nothing left attached.
    const leaks = { geometries: [], materials: [] };
    for (const [resource, use] of s.used) {
      if ((s.disposed.get(resource) ?? -1) > use.last) continue;
      const known = KNOWN_LEAKS.find((k) => k.match(resource, use));
      if (known)
        (knownSeen[known.id] ??= new Set()).add(describe(resource, use));
      else
        leaks[resource.isMaterial ? 'materials' : 'geometries'].push(
          describe(resource, use),
        );
    }
    const used = [...s.used.keys()],
      usedGeometries = used.filter((r) => !r.isMaterial).length,
      knownLeaks = used.filter(
        (r) => !((s.disposed.get(r) ?? -1) > s.used.get(r).last),
      ).length;
    assert.deepEqual(
      leaks,
      { geometries: [], materials: [] },
      `${model.id}: geometries/materials still allocated after dispose()`,
    );
    assert.equal(
      listenerCount(canvas),
      0,
      `${model.id}: canvas listeners removed`,
    );
    assert.equal(
      listenerCount(globalThis.document),
      0,
      `${model.id}: document listeners removed`,
    );
    assert.deepEqual(
      host.children.map((c) => `${c.tagName}.${c.className}`),
      [],
      `${model.id}: canvas and labels removed from the host`,
    );
    assert.ok(
      harness.observers.every((o) => o.observed === 0),
      `${model.id}: resize observer disconnected`,
    );
    assert.ok(
      harness.renderers.every((r) => r.disposed),
      `${model.id}: renderer disposed`,
    );
    pending?.(performance.now());
    assert.equal(
      harness.frame,
      null,
      `${model.id}: no frame scheduled after dispose`,
    );
    console.log(
      `${model.id}: 10 frames; ${usedGeometries} geometries and ${used.length - usedGeometries} materials reached the renderer (of ${s.created.geometries} and ${s.created.materials} constructed), ${knownLeaks ? `all disposed but ${knownLeaks} known leaks` : 'all disposed'}; ${harness.textureRequests.length} textures loaded; no listeners, elements or frames left.`,
    );
  }
  for (const k of KNOWN_LEAKS) {
    assert.ok(
      knownSeen[k.id],
      `Known leak "${k.id}" no longer occurs: remove it from KNOWN_LEAKS in scripts/validate-renderer.mjs.`,
    );
    console.warn(
      `Known leak ${k.id} (${k.where}): ${[...knownSeen[k.id]].join('; ')}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await smokeTest();
