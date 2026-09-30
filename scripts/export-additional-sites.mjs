// Headless geometry/export integration, using the bundled canvas runtime when supplied.
import './compile-model-modules.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as T from 'three';
const req = createRequire(import.meta.url),
  canvasModule = req(process.env.FACILITY_CANVAS_MODULE || '@napi-rs/canvas');
const { createCanvas, loadImage, Image, ImageData } = canvasModule;
globalThis.ImageData = ImageData;
const m = JSON.parse(
  readFileSync(
    process.argv[2] || 'public/models/seen-alhambra-planning.json',
    'utf8',
  ),
);
const siteImage = m.site.image
  ? await loadImage(`public${m.site.image}`)
  : createCanvas(1, 1);
globalThis.__facilityMaterialImages = Object.fromEntries(
  await Promise.all(
    Object.values(m.materials)
      .filter((v) => v.textureUrl)
      .map(async (v) => [
        v.textureUrl,
        await loadImage(`public${v.textureUrl}`),
      ]),
  ),
);
globalThis.HTMLImageElement = Image;
globalThis.HTMLCanvasElement = createCanvas(1, 1).constructor;
globalThis.FileReader = class {
  result = null;
  onloadend = null;
  onload = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onload?.();
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = `data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;
      this.onload?.();
      this.onloadend?.();
    });
  }
};
globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = (cb) => {
  globalThis.nextFrame = cb;
  return 1;
};
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      const c = createCanvas(1, 1);
      // napi canvas exposes data() but GLTFExporter interprets any .data as
      // raw pixels. Hide that method so it uses the canvas drawImage path.
      Object.defineProperty(c, 'data', { value: undefined });
      c.toBlob = (callback, type) =>
        callback(
          new Blob([c.toBuffer('image/png')], { type: type || 'image/png' }),
        );
      return c;
    }
    return {
      style: { setProperty() {} },
      classList: { toggle() {} },
      setAttribute() {},
      remove() {},
    };
  },
};
globalThis.__facilitySiteImage = siteImage;
mkdirSync('work/validation', { recursive: true });
const dayProgram = JSON.parse(
  readFileSync('app/data/day-program.json', 'utf8'),
);
let source = readFileSync('app/model/renderer.ts', 'utf8').replace(
  "import dayProgram from '../data/day-program.json';",
  `const dayProgram=${JSON.stringify(dayProgram)};`,
);
source = source.replace(
  "import * as T from 'three';",
  `import * as Real from 'three';const T={...Real,WebGLRenderer:class{domElement={setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}};shadowMap={};setPixelRatio(){}setSize(){}render(scene,camera){globalThis.__facilityScene=scene;globalThis.__facilityCamera=camera;}dispose(){}},TextureLoader:class{load(url,onLoad){const tex=new Real.Texture(globalThis.__facilityMaterialImages[url]||globalThis.__facilitySiteImage);tex.needsUpdate=true;queueMicrotask(()=>onLoad?.(tex));return tex;}}};`,
);
source = source.replace(
  /import\s*\{\s*OrbitControls\s*\}\s*from\s*'three\/addons\/controls\/OrbitControls.js';/,
  `class OrbitControls{target=new T.Vector3();constructor(){globalThis.__facilityControls=this;}update(){}dispose(){}}`,
);
source = source
  .replace("from './assets'", "from './assets.mjs'")
  .replace("from './schema'", "from './schema.mjs'")
  .replace("from './floor-geometry'", "from './floor-geometry.mjs'")
  .replace("from './community-assets'", "from './community-assets.mjs'")
  .replace("from './showcase'", "from './showcase.mjs'")
  .replace("from './envelope'", "from './envelope.mjs'");
source = source
  .replace("from './activity'", "from './activity.mjs'")
  .replace("from './neighborhood'", "from './neighborhood.mjs'")
  .replace("from './site-context'", "from './site-context.mjs'")
  .replace("from './olympic-exterior'", "from './olympic-exterior.mjs'")
  .replace("from './alhambra-exterior'", "from './alhambra-exterior.mjs'")
  .replace("from './alveare-exterior'", "from './alveare-exterior.mjs'")
  .replace("from './room-labels'", "from './room-labels.mjs'")
  .replace("from './site-activity'", "from './site-activity.mjs'");
writeFileSync(
  'work/validation/renderer.mjs',
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const { createViewer } = await import('../work/validation/renderer.mjs');
const { validateFacility } = await import('../work/validation/schema.mjs');
validateFacility(m);
const api = createViewer(
  { clientWidth: 1400, clientHeight: 950, appendChild() {} },
  m,
  () => {},
);
// Animated fleet replaces static vans on screen; downloadable scenes retain them.
const staticVans = m.objects.filter((o) =>
  ['fleet-van-a', 'fleet-van-b'].includes(o.assetId),
);
for (const spec of staticVans) {
  const object = globalThis.__facilityScene.getObjectByName(spec.id);
  assert(
    object && !object.visible,
    'Static fleet hidden while arrival animation is enabled',
  );
}
const blob = await api.exportGLB();
const bytes = Buffer.from(await blob.arrayBuffer());
const gltf = JSON.parse(
  bytes
    .subarray(20, 20 + bytes.readUInt32LE(12))
    .toString()
    .trim(),
);
for (const spec of staticVans)
  assert(
    gltf.nodes.some((n) => n.name === spec.id),
    'Export includes the static fleet',
  );
assert(
  gltf.nodes.some(
    (n) =>
      n.name ===
      (m.contextStyle ? 'van-drop-off-bay' : 'accessible-main-entrance'),
  ),
  'Export includes drop-off markings',
);
writeFileSync(
  `public/models/${m.id}.glb`,
  Buffer.from(await blob.arrayBuffer()),
);
console.log(`${m.id}: exported ${(blob.size / 1048576).toFixed(1)} MB GLB`);
api.dispose();
