import { floorShapes } from './floor-geometry';
import { animateCommunityProp } from './community-assets';
import { showcaseFrame, type ShowcaseView } from './showcase';
import dayProgram from '../data/day-program.json';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import {
  GTAOShader,
  generateMagicSquareNoise,
} from 'three/addons/shaders/GTAOShader.js';
import {
  PoissonDenoiseShader,
  generatePdSamplePointInitializer,
} from 'three/addons/shaders/PoissonDenoiseShader.js';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAsset } from './assets';
import { buildEnvelopeWall, buildRoofGeometry } from './envelope';
import { buildNeighborhood } from './neighborhood';
import { createSiteActivity } from './site-activity';
import { buildSiteContext } from './site-context';
import { buildOlympicExterior } from './olympic-exterior';
import { buildAlhambraExterior } from './alhambra-exterior';
import { buildAlveareExterior } from './alveare-exterior';
import { buildRoomLabels } from './room-labels';
import { createActivity, type ActivitySource } from './activity';
import { alhambraSource } from './alhambra-source';
import { COMMUNITY_SOURCE_ID, COMMUNITY_VIEW } from './community-people';
import { buildCommunityLayer } from './community-layer';
import { registerCommunityVehicles } from './community-vehicles';
import {
  center,
  type Facility,
  type MaterialSpec,
  type Vec2,
} from './schema';

/** Warm drawing-paper backdrop shared with the page behind the canvas. */
export const PAPER = '#f3f0e9';
/**
 * Presentation finishes for the architectural-model look: warm whites, light
 * oak, pale stone and muted accents. Hues follow the photographed interior;
 * the facility JSON keeps its source colors, so this is a rendering layer only.
 */
const PRESENTATION: Record<string, Partial<MaterialSpec>> = {
  wall: { color: '#f5f3ee', roughness: 0.92 },
  tile: { color: '#ebe6dc', roughness: 0.55, pattern: 'stone' },
  vinyl: { color: '#ece8e0', roughness: 0.6 },
  wood: { color: '#e4d1b0', roughness: 0.6 },
  sports: { color: '#decdaf', roughness: 0.6 },
  carpet: { color: '#cdc6b8', roughness: 1 },
  pattern: { color: '#e2ded5', roughness: 0.8 },
  concrete: { color: '#dedad2', roughness: 0.95 },
  oak: { color: '#dcc49c', roughness: 0.6 },
  chair: { color: '#eee7d9', roughness: 0.8 },
  table: { color: '#f5f3ee', roughness: 0.4 },
  'clinical-blue': { color: '#a9b9ba' },
  blue: { color: '#8ea9b3' },
  metal: { color: '#c2c2bc', roughness: 0.35, metalness: 0.5 },
  porcelain: { color: '#f4f3ee', roughness: 0.3 },
  leaf: { color: '#8e9f7e', roughness: 0.95 },
  cabinet: { color: '#ece8df' },
  screen: { color: '#262c2e', roughness: 0.28 },
  car: { color: '#d9d6cf' },
  glass: { color: '#d3dfde', roughness: 0.08, metalness: 0.1, opacity: 0.42 },
  frame: { color: '#5f6461' },
  canopy: { color: '#5c7690' },
  light: { color: '#f6efe0' },
  'wet-tile': { color: '#d5dcd6', roughness: 0.5 },
  'dining-chair': { color: '#936f53' },
  'office-blue': { color: '#91a3a7' },
  'lounge-blue': { color: '#8f9fb0' },
  'grey-seat': { color: '#d4d1c9' },
  'clinical-seat': { color: '#d5dbce' },
  'photo-carpet': { color: '#d9d2c3' },
  'photo-teal': { color: '#88aba9' },
  'photo-tan-mesh': { color: '#bb9f7e' },
  'photo-blue-grey': { color: '#b4c0bc' },
  'photo-blue-seat': { color: '#b5ccc9' },
  'photo-chair-wood': { color: '#a47d57' },
  'photo-brown-counter': { color: '#aa9587' },
  'photo-mustard': { color: '#c6ad73' },
  'photo-yellow': { color: '#e8ddbd' },
  'photo-lattice-blue': { color: '#6f9fb1' },
  'photo-landscape-red': { color: '#ab6a53' },
  'photo-landscape-ochre': { color: '#c9a579' },
  'photo-moss': { color: '#5e7752' },
  'photo-teal-tile': { color: '#bccdc8' },
  'photo-facade': { color: '#e4dbcc' },
  'photo-black': { color: '#2e3130' },
  'photo-red-cart': { color: '#b4675c' },
  'upperfit-floor': { color: '#d8cebe' },
  'upperfit-wall': { color: '#ece5d8' },
  'upperfit-blue': { color: '#b3c5c5' },
  'upperfit-divider': { color: '#b6b7b1' },
  'upperfit-wood': { color: '#cfb086' },
  'upperfit-mesh': { color: '#c2b79e' },
  'fleet-teal': { color: '#174a49' },
  'fleet-glass': { color: '#2b3335', roughness: 0.25 },
  'rehab-blue': { color: '#8199a9' },
  '#e4e5df': { color: '#f0eee9', roughness: 0.9 },
  '#dfdfd8': { color: '#ebe8e2', roughness: 0.9 },
};
/** Thin, slightly darker coping on cut interior walls: a drawn section line. */
const WALL_CAP = '#b9b1a4';
/** 'high' adds ambient occlusion and larger soft shadows; 'balanced' renders directly. */
export type ViewerQuality = 'high' | 'balanced';
const prefersBalanced = () =>
  typeof window !== 'undefined' &&
  (window.devicePixelRatio > 2 ||
    Math.min(window.screen?.width || 1e4, window.screen?.height || 1e4) < 720);

// Depth-only screen-space ambient occlusion: normals are reconstructed once
// from the main pass depth, so no second geometry pass is needed.
const NORMAL_FROM_DEPTH = /* glsl */ `
  uniform highp sampler2D tDepth;
  uniform mat4 cameraProjectionMatrixInverse;
  varying vec2 vUv;
  #include <packing>
  vec3 viewPosition(vec2 uv, float depth) {
    vec4 p = cameraProjectionMatrixInverse * vec4(vec3(uv, depth) * 2.0 - 1.0, 1.0);
    return p.xyz / p.w;
  }
  float fetchDepth(ivec2 p) { return texelFetch(tDepth, p, 0).x; }
  void main() {
    vec2 size = vec2(textureSize(tDepth, 0));
    ivec2 p = ivec2(vUv * size);
    float c0 = fetchDepth(p);
    if (c0 >= 1.0) { gl_FragColor = vec4(0.5, 0.5, 1.0, 1.0); return; }
    float l2 = fetchDepth(p - ivec2(2, 0)), l1 = fetchDepth(p - ivec2(1, 0));
    float r1 = fetchDepth(p + ivec2(1, 0)), r2 = fetchDepth(p + ivec2(2, 0));
    float b2 = fetchDepth(p - ivec2(0, 2)), b1 = fetchDepth(p - ivec2(0, 1));
    float t1 = fetchDepth(p + ivec2(0, 1)), t2 = fetchDepth(p + ivec2(0, 2));
    vec2 uv = (vec2(p) + 0.5) / size;
    vec3 ce = viewPosition(uv, c0);
    vec3 dpdx = abs((2.0 * l1 - l2) - c0) < abs((2.0 * r1 - r2) - c0)
      ? ce - viewPosition(uv - vec2(1.0 / size.x, 0.0), l1)
      : viewPosition(uv + vec2(1.0 / size.x, 0.0), r1) - ce;
    vec3 dpdy = abs((2.0 * b1 - b2) - c0) < abs((2.0 * t1 - t2) - c0)
      ? ce - viewPosition(uv - vec2(0.0, 1.0 / size.y), b1)
      : viewPosition(uv + vec2(0.0, 1.0 / size.y), t1) - ce;
    gl_FragColor = vec4(packNormalToRGB(normalize(cross(dpdx, dpdy))), 1.0);
  }`;
const COMPOSITE = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tAO;
  uniform sampler2D tNormal;
  uniform highp sampler2D tDepth;
  uniform float aoIntensity;
  uniform float lineStrength;
  uniform float depthRange;
  uniform vec2 texel;
  uniform vec2 normalTexel;
  uniform vec3 paper;
  varying vec2 vUv;
  float depthAt(vec2 uv) { return texture2D(tDepth, uv).x; }
  vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
  void main() {
    vec4 color = vec4(paper, 1.0);
    float d0 = depthAt(vUv);
    if (d0 < 1.0) {
      color = texture2D(tDiffuse, vUv);
      color.rgb *= mix(1.0, texture2D(tAO, vUv).r, aoIntensity);
      // Hairline drawing edges: creases from the reconstructed normals and
      // silhouettes from the depth Laplacian (zero on planar surfaces).
      float lx = abs(depthAt(vUv + vec2(texel.x, 0.0)) + depthAt(vUv - vec2(texel.x, 0.0)) - 2.0 * d0);
      float ly = abs(depthAt(vUv + vec2(0.0, texel.y)) + depthAt(vUv - vec2(0.0, texel.y)) - 2.0 * d0);
      float silhouette = smoothstep(0.02, 0.1, (lx + ly) * depthRange);
      vec3 n0 = normalAt(vUv);
      float bend = 1.0 - min(dot(n0, normalAt(vUv + vec2(normalTexel.x, 0.0))), dot(n0, normalAt(vUv + vec2(0.0, normalTexel.y))));
      float crease = smoothstep(0.2, 0.5, bend);
      color.rgb *= 1.0 - lineStrength * max(silhouette, crease);
      #ifdef TONE_MAPPING
        color.rgb = toneMapping(color.rgb);
      #endif
    }
    gl_FragColor = linearToOutputTexel(color);
  }`;
const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
function createPostPipeline(
  renderer: T.WebGLRenderer,
  scene: T.Scene,
  camera: T.OrthographicCamera,
  paper: T.Color,
) {
  const depthTexture = new T.DepthTexture(1, 1);
  const sceneTarget = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    depthTexture,
  });
  const nearest = {
    minFilter: T.NearestFilter,
    magFilter: T.NearestFilter,
    depthBuffer: false,
  };
  const normalTarget = new T.WebGLRenderTarget(1, 1, nearest);
  const aoTarget = new T.WebGLRenderTarget(1, 1, { depthBuffer: false });
  const denoiseTarget = aoTarget.clone();
  const noise = new Uint8Array(64 * 64 * 4);
  for (let i = 0, s = 7; i < noise.length; i++)
    noise[i] = (s = (s * 16807) % 2147483647) & 255;
  const denoiseNoise = new T.DataTexture(noise, 64, 64);
  denoiseNoise.wrapS = denoiseNoise.wrapT = T.RepeatWrapping;
  denoiseNoise.needsUpdate = true;
  const gtaoNoise = generateMagicSquareNoise();
  const normalMaterial = new T.ShaderMaterial({
    uniforms: {
      tDepth: { value: depthTexture },
      cameraProjectionMatrixInverse: { value: new T.Matrix4() },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: NORMAL_FROM_DEPTH,
    depthTest: false,
    depthWrite: false,
  });
  const gtaoMaterial = new T.ShaderMaterial({
    defines: {
      ...GTAOShader.defines,
      PERSPECTIVE_CAMERA: 0,
      NORMAL_VECTOR_TYPE: 1,
      SAMPLES: 16,
    },
    uniforms: T.UniformsUtils.clone(GTAOShader.uniforms),
    vertexShader: GTAOShader.vertexShader,
    fragmentShader: GTAOShader.fragmentShader,
    blending: T.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  const gu = gtaoMaterial.uniforms;
  gu.tNormal.value = normalTarget.texture;
  gu.tDepth.value = depthTexture;
  gu.tNoise.value = gtaoNoise;
  // World-space radius (m): contact shading under furniture, wall bases and
  // corners without darkening open floor.
  gu.radius.value = 1.25;
  gu.thickness.value = 2.5;
  gu.distanceExponent.value = 1.25;
  gu.distanceFallOff.value = 1;
  gu.scale.value = 1.7;
  const denoiseMaterial = new T.ShaderMaterial({
    defines: {
      ...PoissonDenoiseShader.defines,
      NORMAL_VECTOR_TYPE: 1,
      SAMPLES: 16,
      SAMPLE_VECTORS: generatePdSamplePointInitializer(16, 2, 2),
    },
    uniforms: T.UniformsUtils.clone(PoissonDenoiseShader.uniforms),
    vertexShader: PoissonDenoiseShader.vertexShader,
    fragmentShader: PoissonDenoiseShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const du = denoiseMaterial.uniforms;
  du.tDiffuse.value = aoTarget.texture;
  du.tNormal.value = normalTarget.texture;
  du.tDepth.value = depthTexture;
  du.tNoise.value = denoiseNoise;
  du.lumaPhi.value = 10;
  du.depthPhi.value = 2;
  du.normalPhi.value = 3;
  du.radius.value = 10;
  const compositeMaterial = new T.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: sceneTarget.texture },
      tAO: { value: aoTarget.texture },
      tNormal: { value: normalTarget.texture },
      tDepth: { value: depthTexture },
      aoIntensity: { value: 0.8 },
      lineStrength: { value: 0.2 },
      depthRange: { value: 1 },
      texel: { value: new T.Vector2() },
      normalTexel: { value: new T.Vector2() },
      paper: { value: paper },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: COMPOSITE,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(normalMaterial);
  const white = new T.Color('#ffffff'),
    previousClear = new T.Color();
  const pass = (material: T.Material, target: T.WebGLRenderTarget | null) => {
    renderer.setRenderTarget(target);
    quad.material = material;
    quad.render(renderer);
  };
  return {
    setSize(width: number, height: number, pixelRatio: number) {
      const w = Math.max(1, Math.round(width * pixelRatio)),
        h = Math.max(1, Math.round(height * pixelRatio));
      // Multisampling is only worth its memory below retina densities.
      sceneTarget.samples = pixelRatio < 1.75 ? 4 : 0;
      sceneTarget.setSize(w, h);
      // Occlusion is low-frequency: evaluate it at CSS-pixel resolution.
      const aw = Math.max(1, Math.round(width * Math.min(pixelRatio, 1))),
        ah = Math.max(1, Math.round(height * Math.min(pixelRatio, 1)));
      for (const t of [normalTarget, aoTarget, denoiseTarget])
        t.setSize(aw, ah);
      gu.resolution.value.set(aw, ah);
      du.resolution.value.set(aw, ah);
      compositeMaterial.uniforms.texel.value.set(1 / w, 1 / h);
      compositeMaterial.uniforms.normalTexel.value.set(1 / aw, 1 / ah);
    },
    render() {
      renderer.getClearColor(previousClear);
      const clearAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);
      normalMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse,
      );
      pass(normalMaterial, normalTarget);
      gu.cameraNear.value = camera.near;
      gu.cameraFar.value = camera.far;
      gu.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      gu.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse,
      );
      gu.cameraWorldMatrix.value.copy(camera.matrixWorld);
      du.cameraProjectionMatrixInverse.value.copy(
        camera.projectionMatrixInverse,
      );
      renderer.setClearColor(white, 1);
      for (const t of [aoTarget, denoiseTarget]) {
        renderer.setRenderTarget(t);
        renderer.clear(true, false, false);
      }
      compositeMaterial.uniforms.depthRange.value = camera.far - camera.near;
      pass(gtaoMaterial, aoTarget);
      // Two rotated denoise iterations, ending back in aoTarget.
      du.tDiffuse.value = aoTarget.texture;
      du.index.value = 0;
      pass(denoiseMaterial, denoiseTarget);
      du.tDiffuse.value = denoiseTarget.texture;
      du.index.value = 1;
      pass(denoiseMaterial, aoTarget);
      renderer.setClearColor(previousClear, clearAlpha);
      pass(compositeMaterial, null);
    },
    dispose() {
      for (const t of [sceneTarget, normalTarget, aoTarget, denoiseTarget])
        t.dispose();
      depthTexture.dispose();
      denoiseNoise.dispose();
      gtaoNoise.dispose();
      for (const m of [
        normalMaterial,
        gtaoMaterial,
        denoiseMaterial,
        compositeMaterial,
      ])
        m.dispose();
      quad.dispose();
    },
  };
}
export type ViewerState = {
  selected: string | null;
  room: string | null;
  level: string;
  explode: number;
  stack: number;
  walls: 'cutaway' | 'full' | 'hidden';
  furniture: boolean;
  doorsOpen: boolean;
  labels: boolean;
  colors: boolean;
  plan: boolean;
  isolate: boolean;
  site: boolean;
  roof: boolean;
  exterior: boolean;
  ceilings: boolean;
  sectionAxis: 'none' | 'x' | 'y' | 'z';
  section: number;
  /**
   * The distributed-care settings around the center (homes, pharmacy,
   * hospital, partners). Shown with the site context; undefined means shown.
   */
  community?: boolean;
};
export const defaultState: ViewerState = {
  selected: null,
  room: null,
  level: 'all',
  explode: 0,
  stack: 0,
  walls: 'full',
  furniture: true,
  doorsOpen: true,
  labels: false,
  colors: false,
  plan: false,
  isolate: false,
  site: true,
  roof: true,
  exterior: true,
  ceilings: false,
  sectionAxis: 'none',
  section: 0.5,
  community: true,
};
/**
 * A declarative camera position for scripted views such as the scroll story.
 * The camera orbits `target`; azimuth is measured around +y from +z and
 * elevation is the angle above the ground plane (both radians).
 */
export type CameraShot = {
  target: [number, number, number];
  zoom: number;
  azimuth: number;
  elevation: number;
};
export type ViewerOptions = {
  /** Activity tracks to animate. Defaults to the bundled care-day loop. */
  activity?: ActivitySource;
  /** False disables orbit/pan/zoom and picking, for scripted presentations. */
  interactive?: boolean;
  /** Backdrop color behind the site; defaults to the warm paper tone. */
  background?: string;
  /**
   * Rendering quality. Omitted: 'high' on desktop, 'balanced' on dense or
   * small screens, stepping down once if 'high' runs persistently slowly.
   * A `?quality=high|balanced` URL parameter overrides the default.
   */
  quality?: ViewerQuality;
  /** Upper bound on the device pixel ratio, e.g. for full-bleed stages. */
  maxPixelRatio?: number;
  /** False skips the clickable zone-name labels. */
  labels?: boolean;
  /** Keep the street and neighbors visible while levels are stacked apart. */
  keepSiteWhenStacked?: boolean;
};
const SHOT_DISTANCE = 150;
export function createViewer(
  host: HTMLElement,
  model: Facility,
  onSelect: (zone: string | null, room?: string | null) => void,
  options: ViewerOptions = {},
) {
  const scene = new T.Scene();
  const paper = new T.Color(options.background || PAPER);
  scene.background = paper;
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const requestedQuality = (() => {
    if (options.quality) return options.quality;
    const q =
      typeof location === 'undefined'
        ? null
        : new URLSearchParams(location.search).get('quality');
    return q === 'high' || q === 'balanced' ? q : null;
  })();
  let quality: ViewerQuality =
    requestedQuality || (prefersBalanced() ? 'balanced' : 'high');
  const pixelRatio = () =>
    Math.min(
      devicePixelRatio,
      quality === 'high' ? 2 : 1.5,
      options.maxPixelRatio ?? Infinity,
    );
  renderer.setPixelRatio(pixelRatio());
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  // Neutral keeps finish colors true to the palette; ACES shifted and
  // saturated them.
  renderer.toneMapping = T.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    '3D facility viewer. Drag to orbit, right-drag to pan, and scroll to zoom. Select rooms and levels in the adjoining controls.',
  );
  const camera = new T.OrthographicCamera(-60, 60, 45, -45, 0.1, 500);
  camera.position.set(65, 85, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.minZoom = 0.3;
  controls.maxZoom = 20;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.dampingFactor = 0.1;
  controls.enabled = options.interactive !== false;
  controls.update();
  // Soft, even architectural light: a pale sky/ground fill, a gentle room
  // environment for material response and a warm, low-contrast key.
  scene.add(new T.HemisphereLight('#fbfaf6', '#d8d4cc', 1.1));
  const pmrem = new T.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const environment = pmrem.fromScene(roomEnvironment, 0.04).texture;
  roomEnvironment.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.45;
  const sun = new T.DirectionalLight('#fff5ea', 2.45);
  sun.position.set(-45, 85, 50);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {
    left: -65,
    right: 65,
    top: 65,
    bottom: -65,
    near: 0.1,
    far: 200,
  });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.035;
  sun.shadow.intensity = 0.8;
  scene.add(sun);
  const applyShadowQuality = () => {
    const size = quality === 'high' ? 4096 : 2048;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(size, size);
    }
    sun.shadow.radius = quality === 'high' ? 3 : 2;
  };
  applyShadowQuality();
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const textures: T.Texture[] = [],
    materials = new Map<string, T.MeshStandardMaterial>();
  const finish = (id: string): MaterialSpec => ({
    ...(model.materials[id] || {
      color: id.startsWith('#') ? id : '#dce1d8',
      roughness: 0.8,
    }),
    ...PRESENTATION[id],
  });
  const materialLoads: Promise<void>[] = [];
  const materialLoadErrors: string[] = [];
  // Procedural finishes on a 512 px tile (floors map one tile to 2 m). Tones
  // stay close to white: the material color carries the finish.
  function pattern(kind: string) {
    const size = 512,
      c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size),
      px = img.data;
    const hash = (a: number, b: number) => {
      const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    // Grayscale shade per pixel with an optional warm bias for timber.
    const shade = (
      fn: (x: number, y: number) => number,
      warm = [1, 1, 1],
    ) => {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const v = Math.max(0, Math.min(1, fn(x, y))) * 255,
            i = (y * size + x) * 4;
          px[i] = v * warm[0];
          px[i + 1] = v * warm[1];
          px[i + 2] = v * warm[2];
          px[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    };
    const grout = (d: number, width = 1.2, depth = 0.1) =>
      d < width ? 1 - depth * (1 - d / width) : 1;
    if (kind === 'herringbone') {
      // Chevron-laid oak: 25 cm strips of ~9 cm boards at 45 degrees.
      const strip = 64,
        pitch = 32;
      shade(
        (x, y) => {
          const col = Math.floor(x / strip),
            u = x - col * strip,
            sign = col % 2 ? 1 : -1,
            t = y + sign * u,
            board = Math.floor(t / pitch),
            along = y - sign * u,
            tone = 0.9 + 0.09 * hash(((board % 16) + 16) % 16, col),
            grain = 0.018 * Math.sin(along * 0.55 + hash(board, col) * 40);
          return (
            (tone + grain) *
            grout(t - board * pitch, 1.1, 0.12) *
            grout(Math.min(u, strip - u), 1, 0.1)
          );
        },
        [1, 0.985, 0.96],
      );
    } else if (kind === 'plank') {
      // 25 cm boards in 1 m lengths with staggered end joints.
      const w = 64,
        len = 256;
      shade(
        (x, y) => {
          const col = Math.floor(x / w),
            offset = Math.floor(hash(col, 3) * 8) * 32,
            t = (y + offset) % size,
            board = Math.floor(t / len),
            tone = 0.91 + 0.08 * hash(col, board),
            grain = 0.02 * Math.sin(x * 0.9 + Math.sin(y * 0.02 + col) * 3);
          return (
            (tone + grain) *
            grout(Math.min(x - col * w, w - (x - col * w)), 1, 0.12) *
            grout(Math.min(t % len, len - (t % len)), 1, 0.14)
          );
        },
        [1, 0.99, 0.97],
      );
    } else if (kind === 'stone') {
      // Large-format pale stone, 100 x 50 cm in running bond.
      const tw = 256,
        th = 128;
      shade((x, y) => {
        const row = Math.floor(y / th),
          xx = (x + (row % 2) * (tw / 2)) % size,
          col = Math.floor(xx / tw),
          tone = 0.955 + 0.04 * hash(col, row),
          speck = 0.012 * (hash(x, y) - 0.5);
        return (
          (tone + speck) *
          grout(Math.min(xx % tw, tw - (xx % tw)), 1.2, 0.09) *
          grout(Math.min(y % th, th - (y % th)), 1.2, 0.09)
        );
      });
    } else if (kind === 'tile' || kind === 'mosaic') {
      const t = kind === 'mosaic' ? 16 : 64;
      shade((x, y) => {
        const tone = 0.95 + 0.045 * hash(Math.floor(x / t), Math.floor(y / t));
        return (
          tone *
          grout(Math.min(x % t, t - (x % t)), 1.3, 0.12) *
          grout(Math.min(y % t, t - (y % t)), 1.3, 0.12)
        );
      });
    } else if (kind === 'carpet') {
      shade((x, y) => 0.9 + 0.08 * hash(x, y) + 0.02 * Math.sin(y * 0.8));
    } else if (kind === 'woodgrain') {
      shade(
        (x, y) =>
          0.9 +
          0.05 * Math.sin(x * 0.19 + Math.sin(y * 0.013 + x * 0.004) * 4) +
          0.03 * Math.sin(x * 0.61 + 1.3) +
          0.02 * hash(Math.floor(x / 3), 7),
        [1, 0.985, 0.955],
      );
    } else if (kind === 'marble') {
      shade(
        (x, y) =>
          0.975 -
          0.07 *
            Math.pow(
              Math.abs(
                Math.sin((x + y * 0.6) * 0.012 + Math.sin(y * 0.02) * 1.6),
              ),
              18,
            ) -
          0.012 * hash(x, y),
      );
    } else {
      // 'pattern' and unknown kinds: a quiet 1 m grid.
      shade(
        (x, y) =>
          0.97 *
          grout(Math.min(x % 256, 256 - (x % 256)), 1.2, 0.08) *
          grout(Math.min(y % 256, 256 - (y % 256)), 1.2, 0.08),
      );
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    textures.push(tex);
    return tex;
  }
  const mat = (id: string) => {
    if (!materials.has(id)) {
      const d = finish(id);
      let surfaceMap: T.Texture | null = d.pattern ? pattern(d.pattern) : null;
      if (d.textureUrl) {
        materialLoads.push(
          new Promise<void>((resolve) => {
            const map = new T.TextureLoader().load(
              d.textureUrl!,
              () => resolve(),
              undefined,
              () => {
                materialLoadErrors.push(d.textureUrl!);
                resolve();
              },
            );
            map.colorSpace = T.SRGBColorSpace;
            map.anisotropy = maxAnisotropy;
            textures.push(map);
            surfaceMap = map;
          }),
        );
      }
      materials.set(
        id,
        new T.MeshStandardMaterial({
          color: d.color,
          roughness: d.roughness,
          metalness: d.metalness || 0,
          transparent: d.opacity !== undefined,
          opacity: d.opacity ?? 1,
          map: surfaceMap,
          emissive: d.emissive || '#000000',
          emissiveIntensity: d.emissiveIntensity ?? 0,
        }),
      );
    }
    return materials.get(id)!;
  };
  const mesh = (
    g: T.Object3D,
    geo: T.BufferGeometry,
    material: T.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const m = new T.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const box = (
    g: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    id: string,
  ) => mesh(g, new T.BoxGeometry(w, h, d), mat(id), x, y + h / 2, z);
  const groups = new Map<string, T.Group>(),
    wallGroups = new Map<string, T.Group>(),
    furnGroups = new Map<string, T.Group>(),
    floorMap = new Map<string, T.Mesh>(),
    overlayMap = new Map<string, T.Mesh>(),
    rooms = new Map<string, T.Mesh>(),
    labels = new Map<string, HTMLButtonElement>();
  const pickables: T.Object3D[] = [];
  const roomLabels = buildRoomLabels(host, model, (zone, room) =>
    onSelect(zone, room),
  );
  const roomFinishes: T.Mesh[] = [];
  const texture = model.site.image
    ? new T.TextureLoader().load(model.site.image)
    : null;
  if (texture) {
    texture.colorSpace = T.SRGBColorSpace;
    textures.push(texture);
  }
  const levelTextures = new Map<string, T.Texture>();
  for (const l of model.levels)
    if (l.planImage) {
      const t = new T.TextureLoader().load(l.planImage);
      t.colorSpace = T.SRGBColorSpace;
      textures.push(t);
      levelTextures.set(l.id, t);
    }
  const mapUV = (geo: T.BufferGeometry, levelId?: string) => {
    const l = model.levels.find((l) => l.id === levelId);
    const ppm = l?.planPixelsPerMeter || model.calibration.pixelsPerMeter;
    const origin = l?.planOrigin || model.calibration.sourcePixelOrigin;
    const size = l?.planImageSize || model.site.imageSize;
    const p = geo.attributes.position,
      u = geo.attributes.uv;
    for (let i = 0; i < p.count; i++)
      u.setXY(
        i,
        (p.getX(i) * ppm + origin[0]) / size[0],
        1 - (p.getZ(i) * ppm + origin[1]) / size[1],
      );
  };
  model.zones.forEach((z) => {
    const g = new T.Group();
    g.name = z.id;
    g.userData = {
      zoneId: z.id,
      levelId: z.levelId,
      sourcePages: z.referencePages,
      accuracy: z.geometryStatus,
    };
    g.position.y =
      model.levels.find((l) => l.id === z.levelId)!.elevation +
      (z.elevationOffset || 0);
    scene.add(g);
    groups.set(z.id, g);
    const sh = floorShapes(
        z.polygon,
        (model.floorOpenings || []).filter(
          (o) => o.zoneId === z.id && o.levelId === z.levelId,
        ),
      ),
      slab = new T.ExtrudeGeometry(sh, {
        depth: z.slabDepth || 0.19,
        bevelEnabled: false,
      });
    slab.rotateX(-Math.PI / 2);
    mesh(g, slab, mat('concrete'), 0, -(z.slabDepth || 0.19) - 0.01, 0);
    const geo = new T.ShapeGeometry(sh);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
    const f = mesh(g, geo, mat(z.floorMaterial).clone());
    f.name = `zone-floor-${z.id}`;
    f.userData = { zone: z.id };
    floorMap.set(z.id, f);
    pickables.push(f);
    const ov = geo.clone();
    mapUV(ov, z.levelId);
    const overlay = mesh(
      g,
      ov,
      new T.MeshBasicMaterial({ map: levelTextures.get(z.levelId) || texture }),
      0,
      0.018,
      0,
    );
    overlay.visible = false;
    overlayMap.set(z.id, overlay);
    const wallGroup = new T.Group();
    wallGroup.name = 'walls';
    g.add(wallGroup);
    wallGroups.set(z.id, wallGroup);
    const fg = new T.Group();
    fg.name = 'furniture';
    g.add(fg);
    furnGroups.set(z.id, fg);
    if (options.labels === false) return;
    const label = document.createElement('button');
    label.className = 'model-label';
    label.textContent = z.name;
    label.style.setProperty('--zone', z.color);
    label.onclick = () => onSelect(z.id);
    host.appendChild(label);
    labels.set(z.id, label);
  });
  model.rooms.forEach((r) => {
    const geo = new T.ShapeGeometry(
      floorShapes(
        r.polygon,
        (model.floorOpenings || []).filter(
          (o) => o.zoneId === r.zoneId && o.levelId === r.levelId,
        ),
      ),
    );
    geo.rotateX(-Math.PI / 2);
    if (r.floorMaterial) {
      const floorGeo = geo.clone(),
        uv = floorGeo.attributes.uv,
        p = floorGeo.attributes.position;
      for (let i = 0; i < p.count; i++)
        uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
      const finish = mesh(
        groups.get(r.zoneId)!,
        floorGeo,
        mat(r.floorMaterial),
        0,
        0.004,
        0,
      );
      finish.name = `room-finish-${r.id}`;
      finish.userData = { zone: r.zoneId, room: r.id };
      roomFinishes.push(finish);
    }
    const m = mesh(
      groups.get(r.zoneId)!,
      geo,
      new T.MeshBasicMaterial({
        color: '#fff0a8',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      0,
      0.027,
      0,
    );
    m.userData = { zone: r.zoneId, room: r.id };
    m.castShadow = false;
    rooms.set(r.id, m);
    pickables.unshift(m);
  });
  model.walls.forEach((w) => {
    const dx = w.b[0] - w.a[0],
      dz = w.b[1] - w.a[1];
    // The traced Alhambra plan also contains solid perimeter strokes. Let
    // the opening-aware envelope replace those strokes in assembled views.
    const perimeter =
      w.status.startsWith('Exterior') ||
      (model.exteriorAppearance === 'alhambra-brochure' &&
        (model.envelope?.walls || []).some((edge) => {
          const ex = edge.b[0] - edge.a[0],
            ez = edge.b[1] - edge.a[1],
            lengthSquared = ex * ex + ez * ez;
          if (!lengthSquared) return false;
          return [w.a, w.b].every(([x, z]) => {
            const t = Math.max(
              0,
              Math.min(
                1,
                ((x - edge.a[0]) * ex + (z - edge.a[1]) * ez) / lengthSquared,
              ),
            );
            return (
              Math.hypot(x - edge.a[0] - t * ex, z - edge.a[1] - t * ez) < 0.4
            );
          });
        }));
    const g = wallGroups.get(w.zoneId)!;
    const m = box(
      g,
      (w.a[0] + w.b[0]) / 2,
      0,
      (w.a[1] + w.b[1]) / 2,
      Math.hypot(dx, dz),
      w.height,
      w.thickness,
      w.material,
    );
    m.rotation.y = -Math.atan2(dz, dx);
    m.userData = {
      id: w.id,
      height: w.height,
      perimeter,
    };
    const cap = box(
      g,
      (w.a[0] + w.b[0]) / 2,
      w.height,
      (w.a[1] + w.b[1]) / 2,
      Math.hypot(dx, dz) + 0.004,
      0.02,
      w.thickness + 0.006,
      WALL_CAP,
    );
    cap.castShadow = false;
    cap.rotation.y = m.rotation.y;
    cap.userData = {
      cap: true,
      height: w.height,
      perimeter,
    };
  });
  const context = new T.Group();
  context.name = 'site-context';
  scene.add(context);
  const siteShape = new T.Shape();
  const [min, max] = model.site.bounds;
  siteShape.moveTo(min[0], -min[1]);
  siteShape.lineTo(max[0], -min[1]);
  siteShape.lineTo(max[0], -max[1]);
  siteShape.lineTo(min[0], -max[1]);
  siteShape.closePath();
  const hole = new T.Path();
  model.site.buildingOutline.forEach(([x, z], i) =>
    i ? hole.lineTo(x, -z) : hole.moveTo(x, -z),
  );
  hole.closePath();
  siteShape.holes.push(hole);
  const groundGeo = new T.ShapeGeometry(siteShape);
  groundGeo.rotateX(-Math.PI / 2);
  mapUV(groundGeo);
  const ground = mesh(
    context,
    groundGeo,
    new T.MeshStandardMaterial({ map: texture, roughness: 1 }),
    0,
    -0.23,
    0,
  );
  ground.castShadow = false;
  ground.name = 'source-plan-context';
  const siteContext = model.contextStyle ? buildSiteContext(model) : null;
  const neighborhood = siteContext || buildNeighborhood(model);
  const alhambraExterior = buildAlhambraExterior(model);
  const alveareExterior = buildAlveareExterior(model);
  const siteMassing = alveareExterior?.massing || siteContext?.massing;
  if (siteMassing) scene.add(siteMassing);
  context.add(neighborhood.root);
  const olympicExterior = buildOlympicExterior(model);
  if (olympicExterior) context.add(olympicExterior.site);
  if (alhambraExterior) context.add(alhambraExterior.site);
  if (alveareExterior) context.add(alveareExterior.site);
  // Models without a bespoke context style (Alhambra) play the composed
  // Alhambra source (alhambra-source.ts): the care-day loop, the fleet crew
  // and the distributed-care layer. When that source carries the community
  // view, its vehicles register with the engine (so riders sit in them) and
  // the layer's pads and vehicle bodies are built.
  const source = model.contextStyle
    ? null
    : alhambraSource(model, options.activity);
  const withCommunity = !!source?.views?.some(
    (v) => v.id === COMMUNITY_VIEW.id,
  );
  const activity = source
    ? createActivity(
        model,
        scene,
        mat,
        source,
        withCommunity ? registerCommunityVehicles : undefined,
      )
    : createSiteActivity(model, scene, mat);
  const community = withCommunity ? buildCommunityLayer(model, mat) : null;
  if (community) context.add(community.root);
  const furnitureRoots: T.Group[] = [];
  const exteriorAssets: T.Group[] = [],
    roofAssets: T.Group[] = [];
  let disposed = false;
  const customLoads: Promise<void>[] = [];
  model.objects.forEach((o) => {
    const spec = model.assets[o.assetId];
    const g = buildAsset(spec, mat);
    g.position.fromArray(o.position);
    g.rotation.y = o.rotation;
    g.scale.fromArray(o.scale);
    g.name = o.id;
    g.visible = !dayProgram.removedObjectIds.includes(o.id);
    g.userData = {
      id: o.id,
      assetId: o.assetId,
      zoneId: o.zoneId,
      sourcePages: o.referencePages,
      status: o.status,
      planDoor: spec.kind === 'plan-door' || spec.kind === 'folding-partition',
    };
    const layer = o.layer || 'furniture';
    let parent: T.Object3D =
      o.zoneId === 'site' ? context : furnGroups.get(o.zoneId)!;
    if (layer === 'exterior' || layer === 'roof') {
      g.position.y +=
        model.levels.find((l) => l.id === o.levelId)?.elevation || 0;
      (layer === 'exterior' ? exteriorAssets : roofAssets).push(g);
    } else if (o.zoneId !== 'site' && layer !== 'furniture') {
      const zone = groups.get(o.zoneId)!;
      let layerGroup = zone.getObjectByName(`layer-${layer}`);
      if (!layerGroup) {
        layerGroup = new T.Group();
        layerGroup.name = `layer-${layer}`;
        zone.add(layerGroup);
      }
      parent = layerGroup;
    }
    if (layer !== 'exterior' && layer !== 'roof') parent.add(g);
    furnitureRoots.push(g);
    if (spec.modelUrl) {
      customLoads.push(
        import('three/addons/loaders/GLTFLoader.js').then(
          async ({ GLTFLoader }) => {
            try {
              const loaded = await new GLTFLoader().loadAsync(spec.modelUrl!);
              if (disposed) return;
              const bounds = new T.Box3().setFromObject(loaded.scene),
                size = bounds.getSize(new T.Vector3()),
                mid = bounds.getCenter(new T.Vector3());
              if (size.x <= 0 || size.y <= 0 || size.z <= 0)
                throw Error('Empty GLB');
              const wrapper = new T.Group();
              loaded.scene.position.set(-mid.x, -bounds.min.y, -mid.z);
              wrapper.add(loaded.scene);
              wrapper.scale.set(
                spec.dimensions[0] / size.x,
                spec.dimensions[1] / size.y,
                spec.dimensions[2] / size.z,
              );
              g.clear();
              g.add(wrapper);
              applySectionMaterials(g);
              g.userData.customAssetLoaded = true;
            } catch {
              g.userData.customAssetError =
                'Asset URL could not load; procedural placeholder retained.';
            }
          },
        ),
      );
    }
  });
  // Display the same incoming flight from its destination level. The proxy is
  // hidden whenever the original flight is visible and omitted from exports.
  const incomingStairs: {
    root: T.Object3D;
    source: T.Object3D;
    fromLevel: string;
    toLevel: string;
  }[] = [];
  for (const c of model.verticalConnections || []) {
    if (c.kind !== 'stair') continue;
    const original = furnitureRoots.find((o) => o.name === c.objectId)!;
    const destination = model.floorOpenings?.find(
      (o) => o.connectionId === c.id,
    );
    if (!original || !destination) continue;
    const proxy = original.clone();
    proxy.name = 'incoming-stair-' + c.objectId;
    proxy.position.y += c.bottom[1] - c.top[1];
    groups.get(destination.zoneId)!.add(proxy);
    incomingStairs.push({
      root: proxy,
      source: original,
      fromLevel: c.fromLevel,
      toLevel: c.toLevel,
    });
  }
  // Architectural details use normalized geometry and source positions, stored independently from furniture instances.
  const ceiling = new T.Group();
  ceiling.name = 'roof-structure';
  scene.add(ceiling);
  const roof = new T.Group();
  roof.name = 'roof';
  scene.add(roof);
  model.roofSections.forEach((r) => {
    const [[x1, z1], [x2, z2]] = r.bounds,
      w = x2 - x1,
      d = z2 - z1;
    if (r.polygon || r.parapet === false) {
      const rm = mat(olympicExterior ? '#a3a69e' : '#e4e5df').clone();
      rm.side = T.DoubleSide;
      const panel = mesh(roof, buildRoofGeometry(r), rm);
      panel.name = `roof-${r.id}`;
    } else if (r.kind === 'barrel') {
      const points: Vec2[] = [];
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push([
          x1 + t * w,
          r.eaveHeight + r.rise * Math.sin(Math.PI * t),
        ]);
      }
      const verts: number[] = [],
        uv: number[] = [],
        idx: number[] = [];
      points.forEach(([x, y], i) => {
        verts.push(x, y, z1, x, y, z2);
        uv.push(i / steps, 0, i / steps, 1);
        if (i < steps) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const rm = mat('#e4e5df').clone();
      rm.side = T.DoubleSide;
      mesh(roof, geo, rm);
      for (let z = z1 + 1; r.structure !== 'components' && z < z2; z += 3.2) {
        for (let i = 0; i < points.length - 1; i++) {
          const p = points[i],
            q = points[i + 1],
            line = new T.LineCurve3(
              new T.Vector3(p[0], p[1] - 0.12, z),
              new T.Vector3(q[0], q[1] - 0.12, z),
            );
          mesh(
            ceiling,
            new T.TubeGeometry(line, 1, 0.045, 5, false),
            mat('oak'),
          );
        }
        box(
          ceiling,
          (x1 + x2) / 2,
          r.eaveHeight - 0.08,
          z,
          w,
          0.09,
          0.12,
          'oak',
        );
        for (let k = 1; k < 5; k++) {
          const x = x1 + (w * k) / 5,
            h = r.rise * Math.sin((Math.PI * k) / 5);
          box(ceiling, x, r.eaveHeight, z, 0.06, h, 0.06, 'oak');
        }
      }
    } else {
      box(
        roof,
        (x1 + x2) / 2,
        r.eaveHeight,
        (z1 + z2) / 2,
        w,
        0.15,
        d,
        '#dfdfd8',
      );
      for (const [x, z, a, b] of [
        [x1, (z1 + z2) / 2, 0.14, d],
        [x2, (z1 + z2) / 2, 0.14, d],
        [(x1 + x2) / 2, z1, w, 0.14],
        [(x1 + x2) / 2, z2, w, 0.14],
      ])
        box(roof, x, r.eaveHeight, z, a, 0.35, b, 'wall');
    }
  });
  const facade = new T.Group();
  facade.name = 'exterior-envelope';
  scene.add(facade);
  if (olympicExterior) {
    facade.add(olympicExterior.facade);
    roof.add(olympicExterior.roof);
  }
  for (const exterior of [alhambraExterior, alveareExterior])
    if (exterior) {
      facade.add(exterior.facade);
      roof.add(exterior.roof);
    }
  exteriorAssets.forEach((g) => facade.add(g));
  roofAssets.forEach((g) => roof.add(g));
  const shellDetails = new Map<string, T.Group>();
  const interiorShells: { full: T.Group; cut: T.Group; zoneId: string }[] = [];
  for (const w of model.envelope?.walls || []) {
    const full = buildEnvelopeWall(w, mat);
    if (!olympicExterior) facade.add(full);
    for (const id of w.detailIds || []) shellDetails.set(id, full);
    const interior = new T.Group();
    interior.name = `${w.id}-interior`;
    groups.get(w.zoneId)!.add(interior);
    // Full shell is a global assembled layer; these independent copies follow
    // zone explosion and level visibility in interior inspection modes.
    const wall = buildEnvelopeWall({ ...w, detailIds: undefined }, mat);
    const cut = buildEnvelopeWall(w, mat, 1.2);
    interior.add(wall, cut);
    interiorShells.push({ full: wall, cut, zoneId: w.zoneId });
  }

  model.details.forEach((d) => {
    if (d.id === 'west-entry-ramp') return;
    let detailParent: T.Object3D | undefined;
    if (d.zoneId) {
      const zone = groups.get(d.zoneId)!;
      detailParent = zone.getObjectByName('details');
      if (!detailParent) {
        detailParent = new T.Group();
        detailParent.name = 'details';
        zone.add(detailParent);
      }
    }
    const shellParent = shellDetails.get(d.id);
    const parent =
      shellParent ||
      detailParent ||
      (d.surface === 'site'
        ? context
        : d.surface === 'structure'
          ? ceiling
          : facade);
    const m = box(
      parent,
      d.position[0],
      d.position[1],
      d.position[2],
      ...d.dimensions,
      d.material,
    );
    m.rotation.set(...d.rotation);
    // Source detail positions are world coordinates, unlike wall-local pieces.
    if (shellParent) {
      shellParent.updateWorldMatrix(true, false);
      m.applyMatrix4(shellParent.matrixWorld.clone().invert());
    }
    m.name = d.id;
    m.userData = { id: d.id, status: d.status, sourcePages: d.referencePages };
  });
  const roomOutline = new T.LineLoop(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: '#c6983b' }),
  );
  scene.add(roomOutline);
  roomOutline.visible = false;
  // Group geometry by material inside each instance: keeps IDs and future swaps independent.
  function batch(group: T.Group) {
    const meshes: T.Mesh[] = [];
    group.traverse((o) => {
      if (o instanceof T.Mesh && !Array.isArray(o.material)) meshes.push(o);
    });
    group.updateWorldMatrix(true, true);
    const inverse = group.matrixWorld.clone().invert(),
      buckets = new Map<T.Material, T.BufferGeometry[]>();
    for (const m of meshes) {
      const geo = m.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(m.matrixWorld));
      const key = m.material as T.Material;
      (buckets.get(key) || buckets.set(key, []).get(key)!).push(
        geo.index ? geo.toNonIndexed() : geo,
      );
    }
    group.clear();
    buckets.forEach((gs, ma) => {
      const geo = mergeGeometries(gs);
      if (geo) {
        mesh(group, mergeVertices(geo, 0.000001), ma);
        geo.dispose();
      }
      gs.forEach((g) => g.dispose());
    });
    meshes.forEach((m) => m.geometry.dispose());
  }
  const sharedFurniture = new Map<string, T.Object3D[]>();
  furnitureRoots.forEach((g) => {
    const spec = model.assets[g.userData.assetId];
    if (
      spec?.modelUrl ||
      g.userData.planDoor ||
      [
        'ping-pong-table',
        'pool-table',
        'wii-station',
        'karaoke-station',
      ].includes(spec.kind)
    )
      return;
    const reusable =
      model.contextStyle === 'olympic' &&
      [
        'upholstered-chair',
        'lounge-chair',
        'table',
        'round-table',
        'cabinet',
      ].includes(spec.kind);
    const cached = reusable
      ? sharedFurniture.get(g.userData.assetId)
      : undefined;
    if (cached) {
      g.traverse((o) => {
        if (o instanceof T.Mesh) o.geometry.dispose();
      });
      g.clear();
      g.add(...cached.map((o) => o.clone()));
    } else {
      batch(g);
      if (reusable)
        sharedFurniture.set(
          g.userData.assetId,
          g.children.map((o) => o.clone()),
        );
    }
  });
  const sectionPlane = new T.Plane();
  const sectionMaterials = new Set<T.Material>();
  const clipped = new Map<T.Material, T.Material>();
  let activePlanes: T.Plane[] | null = null;
  function applySectionMaterials(root: T.Object3D) {
    root.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      const prepare = (original: T.Material) => {
        if (!clipped.has(original)) {
          const m = original.clone();
          m.clipShadows = true;
          m.clippingPlanes = activePlanes;
          clipped.set(original, m);
          sectionMaterials.add(m);
        }
        return clipped.get(original)!;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(prepare)
        : prepare(o.material);
    });
  }
  for (const root of [
    ...groups.values(),
    facade,
    roof,
    ceiling,
    ...(siteMassing ? [siteMassing] : []),
  ])
    applySectionMaterials(root);
  applySectionMaterials(activity.root);
  applySectionMaterials(activity.props);
  applySectionMaterials(activity.dayRoom.root);
  applySectionMaterials(activity.arrival.root);
  let state = { ...defaultState },
    frame = 0,
    focusTarget: T.Vector3 | null = null,
    zoomTarget: number | null = null;
  const levelVisible = (levelId: string) =>
    state.level === 'all' || state.level === levelId;
  const basePosition = (zid: string) => {
    const z = model.zones.find((z) => z.id === zid)!;
    const l = model.levels.find((l) => l.id === z.levelId)!;
    return new T.Vector3(
      z.spread[0] * state.explode,
      l.elevation +
        (z.elevationOffset || 0) +
        (state.level === 'all' ? l.order * state.stack * 8 : 0),
      z.spread[1] * state.explode,
    );
  };
  function update(next: ViewerState) {
    state = next;
    activity.updateView({
      ...next,
      hiddenSources: next.community === false ? [COMMUNITY_SOURCE_ID] : [],
    });
    ground.visible = state.plan;
    neighborhood.root.visible = !state.plan;
    if (siteMassing)
      siteMassing.visible =
        state.exterior &&
        !state.plan &&
        !state.isolate &&
        state.level === 'all' &&
        state.stack === 0;
    const sectionEnabled = state.sectionAxis !== 'none' && !state.plan;
    if (sectionEnabled) {
      const bounds = new T.Box3();
      for (const z of model.zones) {
        if (
          !levelVisible(z.levelId) ||
          (state.isolate && state.selected && state.selected !== z.id)
        )
          continue;
        const y = basePosition(z.id).y;
        for (const [x, zz] of z.polygon) {
          bounds.expandByPoint(
            new T.Vector3(
              x + z.spread[0] * state.explode,
              y - 0.22,
              zz + z.spread[1] * state.explode,
            ),
          );
          bounds.expandByPoint(
            new T.Vector3(
              x + z.spread[0] * state.explode,
              y + z.wallHeight,
              zz + z.spread[1] * state.explode,
            ),
          );
        }
      }
      if (state.exterior || state.roof || bounds.isEmpty()) {
        for (const w of model.envelope?.walls || [])
          for (const [x, z] of [w.a, w.b]) {
            bounds.expandByPoint(new T.Vector3(x, 0, z));
            bounds.expandByPoint(
              new T.Vector3(
                x,
                Math.max(w.height, ...(w.profile || []).map((p) => p[1])),
                z,
              ),
            );
          }
        for (const r of model.roofSections)
          for (const [x, z] of r.bounds)
            bounds.expandByPoint(
              new T.Vector3(
                x,
                r.eaveHeight +
                  r.rise +
                  (state.level === 'all' ? state.stack * 24 : 0),
                z,
              ),
            );
      }
      const axis =
        state.sectionAxis === 'x' ? 0 : state.sectionAxis === 'y' ? 1 : 2;
      const cut = T.MathUtils.lerp(
        bounds.max.getComponent(axis) + 0.3,
        bounds.min.getComponent(axis) - 0.3,
        state.section,
      );
      sectionPlane.normal.set(0, 0, 0).setComponent(axis, -1);
      sectionPlane.constant = cut;
    }
    activePlanes = sectionEnabled ? [sectionPlane] : null;
    for (const material of sectionMaterials) {
      const enabled = !!material.clippingPlanes?.length;
      material.clippingPlanes = activePlanes;
      if (enabled !== sectionEnabled) material.needsUpdate = true;
    }
    interiorShells.forEach(({ full, cut }) => {
      const assembled =
        state.exterior &&
        !state.isolate &&
        state.explode === 0 &&
        state.stack === 0 &&
        ['ground', 'all', 'roof'].includes(state.level);
      const visible = !state.plan && !assembled && state.walls !== 'hidden';
      full.visible = visible && state.walls === 'full';
      cut.visible = visible && state.walls === 'cutaway';
    });
    model.zones.forEach((z) => {
      const g = groups.get(z.id)!,
        visible =
          levelVisible(z.levelId) &&
          (!state.isolate || !state.selected || state.selected === z.id);
      g.visible = visible;
      const detail = g.getObjectByName('details');
      if (detail) detail.visible = state.walls === 'full' && !state.plan;
      for (const layer of [
        'architecture',
        'wall-finish',
        'ceiling',
        'exterior',
        'roof',
      ]) {
        const group = g.getObjectByName(`layer-${layer}`);
        if (group)
          group.visible =
            !state.plan &&
            (layer === 'architecture'
              ? state.walls !== 'hidden'
              : layer === 'wall-finish'
                ? state.walls === 'full'
                : layer === 'ceiling'
                  ? state.ceilings
                  : layer === 'exterior'
                    ? state.exterior
                    : state.roof || state.level === 'roof');
      }
      const sourceOverlay =
        state.plan &&
        (model.contextStyle
          ? levelTextures.has(z.levelId)
          : !!texture && z.levelId === 'ground');
      furnGroups.get(z.id)!.visible = state.furniture && !sourceOverlay;
      g.getObjectByName('layer-architecture')?.children.forEach((o) => {
        if (o.userData.planDoor) {
          o.scale.y = state.walls === 'cutaway' ? 0.52 : 1;
          const leaf = o.getObjectByName('source-door-leaf');
          if (leaf)
            leaf.rotation.y = -(state.doorsOpen
              ? leaf.userData.openAngle
              : leaf.userData.closedAngle);
          const arc = o.getObjectByName('door-swing');
          if (arc) arc.visible = state.doorsOpen;
          const folded = o.getObjectByName('partition-folded');
          const shut = o.getObjectByName('partition-closed');
          if (folded) folded.visible = state.doorsOpen;
          if (shut) shut.visible = !state.doorsOpen;
        }
      });
      wallGroups.get(z.id)!.children.forEach((o) => {
        const h = o.userData.height,
          cut =
            state.walls === 'hidden' || sourceOverlay
              ? 0
              : state.walls === 'cutaway'
                ? Math.min(1.2, h)
                : h;
        if (o.userData.cap) o.position.y = cut - 0.004;
        else {
          o.scale.y = cut / h;
          o.position.y = cut / 2;
        }
        o.visible =
          cut > 0 &&
          !(
            (model.contextStyle || model.exteriorAppearance) &&
            o.userData.perimeter &&
            state.exterior &&
            !state.isolate &&
            state.stack === 0 &&
            state.explode === 0
          );
      });
      overlayMap.get(z.id)!.visible = sourceOverlay;
      const f = floorMap.get(z.id)!.material as T.MeshStandardMaterial;
      f.color.set(state.colors ? z.color : finish(z.floorMaterial).color);
      f.map = state.colors ? null : mat(z.floorMaterial).map;
      f.needsUpdate = true;
      const label = labels.get(z.id);
      if (!label) return;
      label.style.display =
        !roomLabels && visible && state.labels && !state.exterior && !state.plan
          ? 'block'
          : 'none';
      label.classList.toggle('selected', state.selected === z.id);
    });
    for (const c of incomingStairs) {
      c.root.visible =
        state.level === c.toLevel && state.walls !== 'hidden' && !state.plan;
    }
    roomFinishes.forEach((f) => {
      f.visible = !state.colors;
    });
    rooms.forEach((m, id) => {
      (m.material as T.MeshBasicMaterial).opacity =
        state.room === id ? 0.06 : 0;
    });
    context.visible =
      state.site &&
      state.level !== 'basement' &&
      !(
        state.level === 'all' &&
        state.stack > 0.05 &&
        !options.keepSiteWhenStacked
      );
    if (community) {
      // Like the ring streets, the 3D pads stay out of the flat plan view.
      community.root.visible = state.community !== false && !state.plan;
      // The network's pads receive shadows only while the layer is on screen;
      // otherwise the map keeps its finer building shadows.
      const extent =
        context.visible && community.root.visible ? community.shadowExtent : 65;
      if (sun.shadow.camera.right !== extent) {
        Object.assign(sun.shadow.camera, {
          left: -extent,
          right: extent,
          top: extent,
          bottom: -extent,
        });
        sun.shadow.camera.updateProjectionMatrix();
      }
    }
    facade.visible =
      state.exterior &&
      !state.plan &&
      !state.isolate &&
      state.explode === 0 &&
      state.stack === 0 &&
      ['ground', 'all', 'roof'].includes(state.level);
    ceiling.visible =
      state.ceilings &&
      !state.plan &&
      ['ground', 'all', 'roof'].includes(state.level) &&
      !state.isolate;
    roof.visible =
      (state.roof || state.level === 'roof') && !state.isolate && !state.plan;
    roof.position.y = state.level === 'all' ? state.stack * 24 : 0;
    ceiling.position.y = state.level === 'all' ? state.stack * 8 : 0;
    if (state.room) {
      const r = model.rooms.find((r) => r.id === state.room);
      if (r) {
        roomOutline.geometry.dispose();
        roomOutline.geometry = new T.BufferGeometry().setFromPoints(
          r.polygon.map(([x, z]) => new T.Vector3(x, 0.05, z)),
        );
        roomOutline.visible = true;
      }
    } else roomOutline.visible = false;
  }
  function finishFocus(instant: boolean) {
    if (!instant || !focusTarget || zoomTarget === null) return;
    camera.position.add(focusTarget.clone().sub(controls.target));
    controls.target.copy(focusTarget);
    camera.zoom = zoomTarget;
    camera.updateProjectionMatrix();
    focusTarget = null;
    zoomTarget = null;
    controls.update();
  }
  function focus(id: string | null, roomId?: string | null, instant = false) {
    const z = model.zones.find((z) => z.id === id),
      r = model.rooms.find((r) => r.id === roomId);
    if (!z) {
      focusTarget = new T.Vector3(
        0,
        state.level === 'all' ? state.stack * 9 : 0,
        0,
      );
      zoomTarget = model.contextStyle ? 1.35 : 0.9;
      if (olympicExterior && state.exterior) {
        focusTarget.set(0, 4, 10);
        zoomTarget = 1.4;
      }
      if (alhambraExterior && state.exterior) {
        focusTarget.set(0, 3, 4);
        zoomTarget = 1.3;
      }
      if (model.contextStyle === 'alveare' && state.exterior) {
        focusTarget.y = model.facade.height / 2;
        zoomTarget = 0.85;
      }
      finishFocus(instant);
      return;
    }
    const c = center(r?.polygon || z.polygon);
    focusTarget = new T.Vector3(c[0], 0, c[1]).add(basePosition(z.id));
    const bounds = new T.Box2().setFromPoints(
        (r?.polygon || z.polygon).map((p) => new T.Vector2(...p)),
      ),
      size = bounds.getSize(new T.Vector2());
    zoomTarget = T.MathUtils.clamp(30 / Math.max(size.x, size.y), 1.35, 8);
    finishFocus(instant);
  }
  /**
   * Frame the whole distributed-care network, or one setting's pad. When the
   * camera looks at a pad's back, it first orbits round (keeping elevation
   * and distance) so the pad's front, where the drop-off happens, faces it.
   */
  function focusSetting(id?: string) {
    const framing = community?.frame(id);
    if (!framing) {
      focus(null);
      return;
    }
    if (framing.azimuth !== undefined) {
      const offset = camera.position.clone().sub(controls.target),
        current = Math.atan2(offset.x, offset.z),
        off = Math.atan2(
          Math.sin(current - framing.azimuth),
          Math.cos(current - framing.azimuth),
        );
      if (Math.abs(off) > 1.2)
        offset.applyAxisAngle(
          new T.Vector3(0, 1, 0),
          framing.azimuth + Math.sign(off) * 0.6 - current,
        );
      camera.position.copy(controls.target).add(offset);
      controls.update();
    }
    focusTarget = new T.Vector3(...framing.target);
    zoomTarget = framing.zoom;
  }
  function focusSiteObjects(ids: string[], instant = false) {
    scene.updateMatrixWorld(true);
    const bounds = new T.Box3();
    for (const id of ids) {
      const o = scene.getObjectByName(id);
      if (o) bounds.union(new T.Box3().setFromObject(o));
    }
    if (bounds.isEmpty()) {
      focus(null, null, instant);
      return;
    }
    focusTarget = bounds.getCenter(new T.Vector3());
    const size = bounds.getSize(new T.Vector3());
    zoomTarget = T.MathUtils.clamp(30 / Math.max(size.x, size.z), 1.35, 8);
    finishFocus(instant);
  }
  function view(mode: string) {
    const c = controls.target.clone();
    if (mode === 'plan')
      camera.position.copy(c).add(new T.Vector3(0, 130, 0.01));
    else if (mode === 'rear')
      camera.position
        .copy(c)
        .add(
          olympicExterior
            ? new T.Vector3(-38, 34, 75)
            : new T.Vector3(-48, 32, -95),
        );
    else if (olympicExterior && mode === 'exterior')
      camera.position.copy(c).add(new T.Vector3(-45, 32, -52));
    else if (alhambraExterior && mode === 'exterior')
      camera.position.copy(c).add(new T.Vector3(38, 27, 82));
    else if (alveareExterior && mode === 'exterior')
      camera.position.copy(c).add(new T.Vector3(53, 30, 75));
    else if (mode === 'street')
      camera.position.copy(c).add(new T.Vector3(48, 19, 95));
    else camera.position.copy(c).add(new T.Vector3(65, 85, 100));
    controls.update();
    if (mode === 'community') focusSetting();
  }
  let tiltComposer: EffectComposer | null = null;
  let tiltHorizontal: ShaderPass | null = null,
    tiltVertical: ShaderPass | null = null;
  function sizeTilt(w: number, h: number) {
    tiltComposer?.setPixelRatio(renderer.getPixelRatio());
    tiltComposer?.setSize(w, h);
    if (tiltHorizontal) tiltHorizontal.uniforms.h.value = 3.8 / w;
    if (tiltVertical) tiltVertical.uniforms.v.value = 3.8 / h;
  }
  function prepareTilt() {
    if (tiltComposer) return;
    tiltComposer = new EffectComposer(renderer);
    tiltComposer.addPass(new RenderPass(scene, camera));
    tiltHorizontal = new ShaderPass(HorizontalTiltShiftShader);
    tiltVertical = new ShaderPass(VerticalTiltShiftShader);
    tiltHorizontal.uniforms.r.value = 0.51;
    tiltVertical.uniforms.r.value = 0.51;
    tiltComposer.addPass(tiltHorizontal);
    tiltComposer.addPass(tiltVertical);
    tiltComposer.addPass(new OutputPass());
    sizeTilt(host.clientWidth, host.clientHeight);
  }
  let recordingSize = false;
  let post: ReturnType<typeof createPostPipeline> | null = null;
  const resize = () => {
    if (recordingSize) return;
    const w = host.clientWidth,
      h = host.clientHeight;
    const aspect = w / h;
    camera.left = -40 * aspect;
    camera.right = 40 * aspect;
    camera.top = 40;
    camera.bottom = -40;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (tiltComposer) sizeTilt(w, h);
    post?.setSize(w, h, renderer.getPixelRatio());
  };
  // Post-processing exists only while 'high' is active; 'balanced' renders
  // straight to the canvas with the context's own multisampling.
  const applyQuality = () => {
    renderer.setPixelRatio(pixelRatio());
    applyShadowQuality();
    if (quality === 'high' && !post)
      post = createPostPipeline(renderer, scene, camera, paper);
    else if (quality !== 'high' && post) {
      post.dispose();
      post = null;
    }
    resize();
  };
  const draw = () => renderScene();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  applyQuality();
  // Without an explicit choice, step down once if 'high' stays slow.
  let autoQuality = !requestedQuality,
    sampledFrames = -120,
    slowFrames = 0;
  let start: [number, number] = [0, 0];
  const ray = new T.Raycaster();
  const pd = (e: PointerEvent) => {
    start = [e.clientX, e.clientY];
    focusTarget = null;
    zoomTarget = null;
    if (activity.getState().follow) activity.setOptions({ follow: null });
  };
  const pu = (e: PointerEvent) => {
    if (showcase) return;
    if (
      !controls.enabled ||
      e.button !== 0 ||
      Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5
    )
      return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    if (activity.root.visible) {
      const person = ray.intersectObject(activity.root, true).find((hit) => {
        for (let o: T.Object3D | null = hit.object; o; o = o.parent)
          if (!o.visible) return false;
        return (
          state.sectionAxis === 'none' ||
          sectionPlane.distanceToPoint(hit.point) >= 0
        );
      });
      if (person) {
        let selected: T.Object3D | null = person.object;
        while (selected && !selected.userData.role) selected = selected.parent;
        if (selected) {
          activity.setOptions({ follow: selected.name });
          zoomTarget = 9;
          return;
        }
      }
    }
    if (facade.visible && state.sectionAxis === 'none') {
      const hit = ray.intersectObject(facade, true)[0];
      let object: T.Object3D | null = hit?.object || null;
      while (object && !object.userData.zoneId) object = object.parent;
      if (object?.userData.zoneId) onSelect(object.userData.zoneId);
      return;
    }
    const hit = ray.intersectObjects(pickables).find((h) => {
      for (let o: T.Object3D | null = h.object; o; o = o.parent)
        if (!o.visible) return false;
      return (
        state.sectionAxis === 'none' ||
        state.plan ||
        sectionPlane.distanceToPoint(h.point) >= 0
      );
    });
    onSelect(
      hit?.object.userData.zone || null,
      hit?.object.userData.room || null,
    );
  };
  // Wheel zoom takes over from any in-flight focus zoom instead of fighting it.
  const wheel = () => {
    zoomTarget = null;
  };
  renderer.domElement.addEventListener('pointerdown', pd);
  renderer.domElement.addEventListener('pointerup', pu);
  const gameProps: T.Object3D[] = [];
  scene.traverse((o) => {
    if (o.userData.gameMotion) gameProps.push(o);
  });
  let showcase = false,
    showcasePlaying = true,
    showcaseTime = 0;
  let showcaseMode: ShowcaseView = 'tiltshift';
  let tiltShiftEnabled = true;
  let previousActivitySpeed = 4;
  let recording: MediaRecorder | null = null;
  let stopRecording: (() => void) | null = null;
  const placeShowcase = () => {
    const p = showcaseFrame(showcaseTime, showcaseMode);
    focusTarget = null;
    zoomTarget = null;
    controls.target.set(p.x, 0, p.z);
    camera.position.set(
      p.x + Math.sin(p.angle) * 100,
      110,
      p.z + Math.cos(p.angle) * 100,
    );
    camera.zoom =
      p.zoom * Math.min(1, (camera.right - camera.left) / 80 / (16 / 9));
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
  };
  const setShowcase = (active: boolean, mode: ShowcaseView = 'tiltshift') => {
    if (active && !showcase) previousActivitySpeed = activity.getState().speed;
    if (!active && showcase)
      activity.setOptions({ speed: previousActivitySpeed });
    showcase = active;
    showcaseMode = mode;
    showcaseTime = 0;
    showcasePlaying = true;
    controls.enabled = !active;
    if (active) {
      if (tiltShiftEnabled) prepareTilt();
      activity.setOptions({
        enabled: true,
        playing: true,
        time: 45,
        speed: 8,
        filter: 'all',
        follow: null,
        scale: 1,
      });
      placeShowcase();
    }
  };
  const setTiltShift = (enabled: boolean) => {
    tiltShiftEnabled = enabled;
    if (enabled && showcase) prepareTilt();
  };
  const renderScene = () => {
    if (showcase && tiltShiftEnabled && tiltComposer) tiltComposer.render();
    else if (post) post.render();
    else renderer.render(scene, camera);
  };
  async function recordShowcase(
    onProgress: (progress: number) => void,
  ): Promise<Blob> {
    if (recording) throw Error('A recording is already in progress.');
    if (typeof MediaRecorder === 'undefined')
      throw Error('Video recording is unavailable in this browser.');
    const mime = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) throw Error('This browser does not support video recording.');
    setShowcase(true, showcaseMode);
    recordingSize = true;
    renderer.setPixelRatio(1);
    renderer.setSize(1920, 1080, false);
    sizeTilt(1920, 1080);
    post?.setSize(1920, 1080, 1);
    camera.left = (-40 * 16) / 9;
    camera.right = (40 * 16) / 9;
    camera.top = 40;
    camera.bottom = -40;
    camera.updateProjectionMatrix();
    placeShowcase();
    renderScene();
    const stream = renderer.domElement.captureStream(30),
      chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12000000,
    });
    recording = recorder;
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setInterval>;
      const cleanup = () => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        recording = null;
        stopRecording = null;
        recordingSize = false;
        renderer.setPixelRatio(pixelRatio());
        resize();
        showcaseTime = 0;
      };
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () => {
        cleanup();
        reject(Error('Recording interrupted. Please try again.'));
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        cleanup();
        resolve(blob);
      };
      stopRecording = () => {
        if (recorder.state === 'recording') recorder.stop();
      };
      recorder.start(1000);
      const started = performance.now();
      timer = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        onProgress(Math.min(1, elapsed / 60));
        if (elapsed >= 60) stopRecording?.();
      }, 200);
    });
  }
  renderer.domElement.addEventListener('wheel', wheel, { passive: true });
  let lastTime = performance.now(),
    paused = false;
  function loop(now = performance.now()) {
    if (disposed || paused) return;
    frame = requestAnimationFrame(loop);
    const dt = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    if (autoQuality && !recordingSize && quality === 'high' && dt < 0.5 && !document.hidden) {
      if (++sampledFrames > 0 && dt > 0.045) slowFrames++;
      if (sampledFrames >= 180) {
        if (slowFrames > 120) {
          quality = 'balanced';
          autoQuality = false;
          applyQuality();
        }
        sampledFrames = slowFrames = 0;
      }
    }
    activity.tick(typeof document !== 'undefined' && document.hidden ? 0 : dt);
    neighborhood.tick(activity.getState().time);
    community?.tick(activity.getState().time);
    // Entry leaves open for approaching transport parties, even with the design door toggle shut.
    if (model.contextStyle) {
      const travelers = activity.root.visible
        ? activity.actors.filter(
            (actor) => actor.spec.arrivalVehicleId && actor.root.visible,
          )
        : [];
      for (const door of furnitureRoots.filter((g) => g.userData.planDoor)) {
        const leaf = door.getObjectByName('source-door-leaf');
        if (!leaf) continue;
        const position = door.getWorldPosition(new T.Vector3());
        const arriving = travelers.some(
          (a) =>
            Math.abs(a.root.position.y - position.y) < 1 &&
            Math.hypot(
              a.root.position.x - position.x,
              a.root.position.z - position.z,
            ) < 2.4,
        );
        const angle = -(state.doorsOpen || arriving
          ? leaf.userData.openAngle
          : leaf.userData.closedAngle);
        leaf.rotation.y = T.MathUtils.lerp(
          leaf.rotation.y,
          angle,
          Math.min(1, dt * 12),
        );
      }
    }
    for (const g of exteriorAssets)
      if (['fleet-van-a', 'fleet-van-b'].includes(g.userData.assetId))
        g.visible = !activity.getState().enabled;
    const following = activity.getState().follow;
    if (following) {
      const p = activity.actorPosition(following);
      if (p) focusTarget = p;
    }
    for (const z of model.zones) {
      const g = groups.get(z.id)!;
      g.position.lerp(basePosition(z.id), 0.15);
      const c = center(z.polygon),
        label = labels.get(z.id);
      if (!label) continue;
      const anchor = new T.Vector3(c[0], 2, c[1])
        .add(g.position)
        .project(camera);
      label.style.left = `${(anchor.x * 0.5 + 0.5) * host.clientWidth}px`;
      label.style.top = `${(-anchor.y * 0.5 + 0.5) * host.clientHeight}px`;
      label.style.visibility = anchor.z > 1 ? 'hidden' : 'visible';
    }
    if (state.room) {
      const r = model.rooms.find((r) => r.id === state.room);
      if (r) roomOutline.position.copy(groups.get(r.zoneId)!.position);
    }
    if (focusTarget) {
      const d = focusTarget.clone().sub(controls.target).multiplyScalar(0.12);
      camera.position.add(d);
      controls.target.add(d);
      if (d.length() < 0.002) focusTarget = null;
    }
    if (zoomTarget !== null) {
      camera.zoom += (zoomTarget - camera.zoom) * 0.1;
      camera.updateProjectionMatrix();
      if (Math.abs(camera.zoom - zoomTarget) < 0.001) zoomTarget = null;
    }
    for (const prop of gameProps)
      animateCommunityProp(prop, activity.getState().time);
    if (showcase) {
      if (showcasePlaying && !document.hidden)
        showcaseTime += Math.min(dt, 0.15);
      placeShowcase();
    } else controls.update();
    roomLabels?.update(camera, groups, state, sectionPlane);
    renderScene();
  }
  update(defaultState);
  loop();
  return {
    setShowcase,
    setTiltShift,
    getTiltShift: () => tiltShiftEnabled,
    pauseShowcase: (paused: boolean) => {
      showcasePlaying = !paused;
      activity.setOptions({ playing: !paused });
    },
    recordShowcase,
    cancelRecording: () => stopRecording?.(),
    update,
    focus,
    focusSiteObjects,
    focusSetting,
    community,
    focusArrival: () => {
      focusTarget = activity.arrival.focus.clone();
      // Keep the stop and front desk above the care-day controls.
      if (model.contextStyle) focusTarget.y = -4;
      zoomTarget = model.contextStyle ? 3.3 : 2.3;
      finishFocus(false);
    },
    activity,
    followActor: (id: string | null) => {
      activity.setOptions({ follow: id });
      if (id) {
        zoomTarget = id.startsWith('interaction:')
          ? 4.5
          : id.startsWith('van-')
            ? 3.3
            : 9;
        const p = activity.actorPosition(id);
        if (p) focusTarget = p;
      }
    },
    view,
    /** Place the camera exactly; cancels any in-flight focus animation. */
    setShot(shot: CameraShot) {
      focusTarget = null;
      zoomTarget = null;
      const [x, y, z] = shot.target,
        horizontal = Math.cos(shot.elevation) * SHOT_DISTANCE;
      controls.target.set(x, y, z);
      camera.position.set(
        x + Math.sin(shot.azimuth) * horizontal,
        y + Math.sin(shot.elevation) * SHOT_DISTANCE,
        z + Math.cos(shot.azimuth) * horizontal,
      );
      camera.zoom = shot.zoom;
      camera.updateProjectionMatrix();
      controls.update();
    },
    getShot(): CameraShot {
      const offset = camera.position.clone().sub(controls.target);
      return {
        target: controls.target.toArray() as [number, number, number],
        zoom: camera.zoom,
        azimuth: Math.atan2(offset.x, offset.z),
        elevation: Math.asin(
          T.MathUtils.clamp(offset.y / (offset.length() || 1), -1, 1),
        ),
      };
    },
    setInteractive(on: boolean) {
      controls.enabled = on;
    },
    /** Stop or resume the render loop, e.g. while the stage is covered. */
    setPaused(on: boolean) {
      if (on === paused) return;
      paused = on;
      cancelAnimationFrame(frame);
      if (!on) {
        lastTime = performance.now();
        loop();
      }
    },
    /** 'high' adds ambient occlusion and finer shadows; 'balanced' is lighter. */
    setQuality(next: ViewerQuality) {
      autoQuality = false;
      if (next === quality) return;
      quality = next;
      applyQuality();
    },
    getQuality: (): ViewerQuality => quality,
    zoom: (n: number) =>
      (zoomTarget = T.MathUtils.clamp(camera.zoom * n, 0.3, 20)),
    reset: () => {
      view(state.exterior ? 'exterior' : 'iso');
      focus(null);
    },
    snapshot: () => {
      draw();
      return renderer.domElement.toDataURL('image/png');
    },
    exportGLB: async () => {
      await Promise.allSettled(customLoads);
      await Promise.all(materialLoads);
      if (materialLoadErrors.length)
        throw new Error(
          'Some material images did not load. Reload the model before exporting.',
        );
      const { GLTFExporter } =
        await import('three/addons/exporters/GLTFExporter.js');
      const exportScene = new T.Scene();
      exportScene.userData = {
        facilityId: model.id,
        units: 'meters',
        calibration: model.calibration.status,
        revision: model.revision,
        dayRoomLayout: dayProgram.layoutNote,
      };
      for (const z of model.zones) {
        const g = groups.get(z.id)!.clone();
        g.position.set(
          0,
          model.levels.find((l) => l.id === z.levelId)!.elevation +
            (z.elevationOffset || 0),
          0,
        );
        g.visible = true;
        for (const child of g.children.slice())
          if (child.name.startsWith('incoming-stair-')) g.remove(child);
        const wg = g.getObjectByName('walls');
        wg?.children.forEach((o) => {
          const h = o.userData.height;
          o.visible = !(model.exteriorAppearance && o.userData.perimeter);
          if (o.userData.cap) o.position.y = h - 0.004;
          else {
            o.scale.y = 1;
            o.position.y = h / 2;
          }
        });
        const fg = g.getObjectByName('furniture');
        if (fg) fg.visible = true;
        const dg = g.getObjectByName('details');
        if (dg) dg.visible = true;
        for (const child of g.children)
          if (child.name.startsWith('layer-')) child.visible = true;
          else if (
            child.name.startsWith('shell-') &&
            child.name.endsWith('-interior')
          )
            child.visible = false;
        g.traverse((o) => {
          if (o.userData.planDoor) o.scale.y = 1;
          if (o.name.startsWith('room-finish-')) o.visible = true;
          if (o instanceof T.Mesh && o.name === `zone-floor-${z.id}`)
            o.material = mat(z.floorMaterial);
          if (o instanceof T.Mesh && o.material instanceof T.MeshBasicMaterial)
            o.visible = false;
        });
        exportScene.add(g);
      }
      const roofCopy = roof.clone();
      roofCopy.visible = true;
      roofCopy.position.y = 0;
      exportScene.add(roofCopy);
      if (siteMassing) {
        const m = siteMassing.clone();
        m.visible = true;
        exportScene.add(m);
      }
      const f = facade.clone();
      f.visible = true;
      f.traverse((object) => {
        if (['fleet-van-a', 'fleet-van-b'].includes(object.userData.assetId))
          object.visible = true;
      });
      exportScene.add(f);
      const siteCopy = context.clone();
      siteCopy.visible = true;
      siteCopy.getObjectByName('community-layer')?.removeFromParent();
      const sourcePlan = siteCopy.getObjectByName('source-plan-context');
      if (sourcePlan) sourcePlan.visible = false;
      const neighborhoodCopy = siteCopy.getObjectByName('neighborhood-3d');
      if (neighborhoodCopy) neighborhoodCopy.visible = true;
      exportScene.add(siteCopy);
      const entryCopy = activity.arrival.entry.clone();
      entryCopy.visible = true;
      exportScene.add(entryCopy);
      const structure = ceiling.clone();
      structure.visible = true;
      structure.position.y = 0;
      exportScene.add(structure);
      const result = await new GLTFExporter().parseAsync(exportScene, {
        binary: true,
        onlyVisible: true,
        maxTextureSize: 1536,
      });
      return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
    },
    stats: () => ({
      zones: groups.size,
      rooms: rooms.size,
      objects: model.objects.length,
      dimensions: model.dimensions.length,
    }),
    dispose: () => {
      stopRecording?.();
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pd);
      renderer.domElement.removeEventListener('pointerup', pu);
      renderer.domElement.removeEventListener('wheel', wheel);
      activity.dispose();
      const geos = new Set<T.BufferGeometry>(),
        mats = new Set<T.Material>();
      scene.traverse((o) => {
        if (o instanceof T.Mesh || o instanceof T.Line) {
          geos.add(o.geometry);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            mats.add(m),
          );
        }
      });
      geos.forEach((g) => g.dispose());
      materials.forEach((m) => mats.add(m));
      mats.forEach((m) => {
        const map = (m as T.MeshStandardMaterial).map;
        if (map) textures.push(map);
        m.dispose();
      });
      textures.forEach((t) => t.dispose());
      // EffectComposer.dispose() frees its render targets, not its passes.
      tiltComposer?.passes.forEach((pass) => pass.dispose());
      tiltComposer?.dispose();
      post?.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.forEach((l) => l.remove());
      roomLabels?.dispose();
    },
  };
}
