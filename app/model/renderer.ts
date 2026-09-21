import dayProgram from '../data/day-program.json';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAsset } from './assets';
import { buildEnvelopeWall, buildRoofGeometry } from './envelope';
import { buildNeighborhood } from './neighborhood';
import { createActivity } from './activity';
import { center, type Facility, type Vec2 } from './schema';
export type ViewerState = {
  selected: string | null;
  room: string | null;
  level: string;
  explode: number;
  stack: number;
  walls: 'cutaway' | 'full' | 'hidden';
  furniture: boolean;
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
};
export const defaultState: ViewerState = {
  selected: null,
  room: null,
  level: 'all',
  explode: 0,
  stack: 0,
  walls: 'full',
  furniture: true,
  labels: true,
  colors: false,
  plan: false,
  isolate: false,
  site: true,
  roof: true,
  exterior: true,
  ceilings: false,
  sectionAxis: 'none',
  section: 0.5,
};
export function createViewer(
  host: HTMLElement,
  model: Facility,
  onSelect: (zone: string | null, room?: string | null) => void,
) {
  const scene = new T.Scene();
  scene.background = new T.Color('#e5eae7');
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
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
  controls.update();
  scene.add(new T.HemisphereLight('#f5faf8', '#647a67', 2.5));
  const sun = new T.DirectionalLight('#fff2db', 3.2);
  sun.position.set(-45, 85, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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
  scene.add(sun);
  const textures: T.Texture[] = [],
    materials = new Map<string, T.MeshStandardMaterial>();
  const materialLoads: Promise<void>[] = [];
  const materialLoadErrors: string[] = [];
  function pattern(kind: string) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 256, 256);
    if (kind === 'herringbone') {
      ctx.translate(128, 128);
      ctx.rotate(Math.PI / 4);
      for (let y = -256; y < 256; y += 32)
        for (let x = -256; x < 256; x += 64) {
          ctx.fillStyle = (x / 64 + y / 32) % 3 ? '#f6eddb' : '#d6c7b1';
          ctx.fillRect(x, y, 62, 30);
          ctx.strokeStyle = '#bbab95';
          ctx.strokeRect(x, y, 62, 30);
        }
    } else if (kind === 'marble') {
      ctx.fillStyle = '#fafaf7';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 16; i++) {
        ctx.strokeStyle = i % 3 ? '#c7c6c0' : '#9c9f9c';
        ctx.lineWidth = i % 3 ? 0.5 : 1.2;
        ctx.beginPath();
        ctx.moveTo(-30, i * 23 - 30);
        ctx.bezierCurveTo(80, i * 17 - 25, 125, i * 25 + 30, 286, i * 21 + 55);
        ctx.stroke();
      }
    } else if (kind === 'woodgrain') {
      for (let i = 0; i < 150; i++) {
        ctx.strokeStyle = i % 4 ? '#f0dec0' : '#cdb18b';
        ctx.lineWidth = 0.3 + (i % 3) * 0.2;
        ctx.beginPath();
        ctx.moveTo(i * 2, 0);
        ctx.bezierCurveTo(i * 2 + 6, 90, i * 2 - 5, 180, i * 2 + 3, 256);
        ctx.stroke();
      }
    } else if (kind === 'carpet') {
      for (let i = 0; i < 7000; i++) {
        const x = (i * 73) % 256,
          y = (i * 113 + Math.floor(i / 256) * 7) % 256;
        ctx.fillStyle = i % 2 ? '#bfbcb5' : '#f6f4ed';
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    } else {
      ctx.strokeStyle = '#cbc9ba';
      ctx.lineWidth = 2;
      const spacing = kind === 'plank' ? 32 : kind === 'mosaic' ? 8 : 128;
      for (let x = 0; x < 256; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }
      for (let y = 0; y < 256; y += kind === 'mosaic' ? 8 : 128) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }
      if (kind === 'pattern') {
        ctx.fillStyle = '#849390';
        for (const x of [64, 192])
          for (const y of [64, 192]) {
            ctx.beginPath();
            ctx.arc(x, y, 25, 0, Math.PI * 2);
            ctx.fill();
          }
      }
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.SRGBColorSpace;
    textures.push(tex);
    return tex;
  }
  const mat = (id: string) => {
    if (!materials.has(id)) {
      const d = model.materials[id] || {
        color: id.startsWith('#') ? id : '#dce1d8',
        roughness: 0.8,
      };
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
  const shape = (p: Vec2[]) => {
    const s = new T.Shape();
    p.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    return s;
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
  const roomFinishes: T.Mesh[] = [];
  const texture = new T.TextureLoader().load(model.site.image);
  texture.colorSpace = T.SRGBColorSpace;
  textures.push(texture);
  const mapUV = (geo: T.BufferGeometry) => {
    const p = geo.attributes.position,
      u = geo.attributes.uv;
    for (let i = 0; i < p.count; i++)
      u.setXY(
        i,
        (p.getX(i) * model.calibration.pixelsPerMeter +
          model.calibration.sourcePixelOrigin[0]) /
          model.site.imageSize[0],
        1 -
          (p.getZ(i) * model.calibration.pixelsPerMeter +
            model.calibration.sourcePixelOrigin[1]) /
            model.site.imageSize[1],
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
    g.position.y = model.levels.find((l) => l.id === z.levelId)!.elevation;
    scene.add(g);
    groups.set(z.id, g);
    const sh = shape(z.polygon),
      slab = new T.ExtrudeGeometry(sh, { depth: 0.19, bevelEnabled: false });
    slab.rotateX(-Math.PI / 2);
    mesh(g, slab, mat('concrete'), 0, -0.2, 0);
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
    mapUV(ov);
    const overlay = mesh(
      g,
      ov,
      new T.MeshBasicMaterial({ map: texture }),
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
    const label = document.createElement('button');
    label.className = 'model-label';
    label.textContent = z.name;
    label.style.setProperty('--zone', z.color);
    label.onclick = () => onSelect(z.id);
    host.appendChild(label);
    labels.set(z.id, label);
  });
  model.rooms.forEach((r) => {
    const geo = new T.ShapeGeometry(shape(r.polygon));
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
    m.userData = { id: w.id, height: w.height };
    const cap = box(
      g,
      (w.a[0] + w.b[0]) / 2,
      w.height,
      (w.a[1] + w.b[1]) / 2,
      Math.hypot(dx, dz),
      0.035,
      w.thickness + 0.02,
      '#fffdf4',
    );
    cap.rotation.y = m.rotation.y;
    cap.userData = { cap: true, height: w.height };
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
  const neighborhood = buildNeighborhood(model);
  context.add(neighborhood.root);
  const activity = createActivity(model, scene, mat);
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
      const rm = mat('#e4e5df').clone();
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
  exteriorAssets.forEach((g) => facade.add(g));
  roofAssets.forEach((g) => roof.add(g));
  const shellDetails = new Map<string, T.Group>();
  const interiorShells: { full: T.Group; cut: T.Group; zoneId: string }[] = [];
  for (const w of model.envelope?.walls || []) {
    const full = buildEnvelopeWall(w, mat);
    facade.add(full);
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
  furnitureRoots.forEach((g) => {
    if (!model.assets[g.userData.assetId]?.modelUrl) batch(g);
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
  for (const root of [...groups.values(), facade, roof, ceiling])
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
      l.elevation + (state.level === 'all' ? l.order * state.stack * 8 : 0),
      z.spread[1] * state.explode,
    );
  };
  function update(next: ViewerState) {
    state = next;
    activity.updateView(next);
    ground.visible = state.plan;
    neighborhood.root.visible = !state.plan;
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
      furnGroups.get(z.id)!.visible =
        state.furniture && !(state.plan && z.levelId === 'ground');
      wallGroups.get(z.id)!.children.forEach((o) => {
        const h = o.userData.height,
          cut =
            state.walls === 'hidden' || (state.plan && z.levelId === 'ground')
              ? 0
              : state.walls === 'cutaway'
                ? Math.min(1.2, h)
                : h;
        if (o.userData.cap) o.position.y = cut + 0.0175;
        else {
          o.scale.y = cut / h;
          o.position.y = cut / 2;
        }
        o.visible = cut > 0;
      });
      overlayMap.get(z.id)!.visible = state.plan && z.levelId === 'ground';
      const f = floorMap.get(z.id)!.material as T.MeshStandardMaterial;
      f.color.set(
        state.colors ? z.color : model.materials[z.floorMaterial].color,
      );
      f.map = state.colors ? null : mat(z.floorMaterial).map;
      f.needsUpdate = true;
      const label = labels.get(z.id)!;
      label.style.display =
        visible && state.labels && !state.exterior && !state.plan
          ? 'block'
          : 'none';
      label.classList.toggle('selected', state.selected === z.id);
    });
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
      !(state.level === 'all' && state.stack > 0.05);
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
      zoomTarget = 0.9;
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
      camera.position.copy(c).add(new T.Vector3(-48, 32, -95));
    else if (mode === 'street')
      camera.position.copy(c).add(new T.Vector3(48, 19, 95));
    else camera.position.copy(c).add(new T.Vector3(65, 85, 100));
    controls.update();
  }
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    const aspect = w / h;
    camera.left = -40 * aspect;
    camera.right = 40 * aspect;
    camera.top = 40;
    camera.bottom = -40;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let start: [number, number] = [0, 0];
  const ray = new T.Raycaster();
  const pd = (e: PointerEvent) => {
    start = [e.clientX, e.clientY];
    focusTarget = null;
    zoomTarget = null;
    if (activity.getState().follow) activity.setOptions({ follow: null });
  };
  const pu = (e: PointerEvent) => {
    if (
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
  renderer.domElement.addEventListener('pointerdown', pd);
  renderer.domElement.addEventListener('pointerup', pu);
  let lastTime = performance.now();
  function loop(now = performance.now()) {
    if (disposed) return;
    frame = requestAnimationFrame(loop);
    const dt = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    activity.tick(typeof document !== 'undefined' && document.hidden ? 0 : dt);
    neighborhood.tick(activity.getState().time);
    for (const g of exteriorAssets)
      if (g.name === 'fleet-van-a' || g.name === 'fleet-van-b')
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
        anchor = new T.Vector3(c[0], 2, c[1]).add(g.position).project(camera),
        label = labels.get(z.id)!;
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
    controls.update();
    renderer.render(scene, camera);
  }
  update(defaultState);
  loop();
  return {
    update,
    focus,
    focusSiteObjects,
    focusArrival: () => {
      focusTarget = new T.Vector3(-22, 0, -3);
      zoomTarget = 2.3;
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
    zoom: (n: number) =>
      (zoomTarget = T.MathUtils.clamp(camera.zoom * n, 0.3, 20)),
    reset: () => {
      view('iso');
      focus(null);
    },
    snapshot: () => {
      renderer.render(scene, camera);
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
          model.levels.find((l) => l.id === z.levelId)!.elevation,
          0,
        );
        g.visible = true;
        const wg = g.getObjectByName('walls');
        wg?.children.forEach((o) => {
          const h = o.userData.height;
          o.visible = true;
          if (o.userData.cap) o.position.y = h + 0.0175;
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
      const f = facade.clone();
      f.visible = true;
      for (const id of ['fleet-van-a', 'fleet-van-b']) {
        const van = f.getObjectByName(id);
        if (van) van.visible = true;
      }
      exportScene.add(f);
      const siteCopy = context.clone();
      siteCopy.visible = true;
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
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pd);
      renderer.domElement.removeEventListener('pointerup', pu);
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
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.forEach((l) => l.remove());
    },
  };
}
