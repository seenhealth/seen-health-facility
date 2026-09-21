import * as T from 'three';
import type { Asset } from './schema';
import { buildPhotoAsset } from './photo-assets';
import { buildClinicalAsset } from './clinical-assets';
// Each asset is modeled around a local, floor-level origin. Dimensions and transforms live in JSON.
export function buildAsset(
  spec: Asset,
  material: (id: string) => T.MeshStandardMaterial,
) {
  const clinical = buildClinicalAsset(spec, material);
  if (clinical) return clinical;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions;
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    mat: string,
  ) => {
    const m = new T.Mesh(new T.BoxGeometry(a, b, c), material(mat));
    m.position.set(x, y + b / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (
    x: number,
    y: number,
    z: number,
    r: number,
    len: number,
    mat: string,
    r2 = r,
  ) => {
    const m = new T.Mesh(new T.CylinderGeometry(r2, r, len, 20), material(mat));
    m.position.set(x, y + len / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const seat = () => {
    box(0, h * 0.47, 0, w, h * 0.12, d * 0.92, spec.material);
    box(0, h * 0.54, d * 0.4, w, h * 0.46, d * 0.1, spec.material);
    for (const x of [-0.4, 0.4])
      for (const z of [-0.36, 0.36])
        box(x * w, 0, z * d, 0.03, h * 0.48, 0.03, 'oak');
    for (const x of [-0.48, 0.48])
      box(x * w, h * 0.64, 0, 0.025, 0.04, d * 0.8, 'oak');
  };
  const photoAsset = buildPhotoAsset(spec, material);
  if (photoAsset) {
    g.add(photoAsset);
  } else if (spec.kind === 'task-chair') {
    box(0, h * 0.46, 0, w * 0.85, h * 0.12, d * 0.78, spec.material);
    box(0, h * 0.56, d * 0.32, w * 0.88, h * 0.43, d * 0.13, spec.material);
    cyl(0, 0.12, 0, 0.035, h * 0.36, 'metal');
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      const leg = box(0, 0.09, 0, 0.03, 0.035, w * 0.48, 'metal');
      leg.position.set(Math.sin(a) * w * 0.22, 0.1, Math.cos(a) * d * 0.22);
      leg.rotation.y = a;
      cyl(
        Math.sin(a) * w * 0.4,
        0,
        Math.cos(a) * d * 0.4,
        0.035,
        0.075,
        'metal',
      );
    }
  } else if (spec.kind === 'round-table') {
    cyl(0, h - 0.055, 0, w / 2, 0.055, spec.material);
    cyl(0, 0.04, 0, 0.045, h - 0.08, 'metal');
    cyl(0, 0, 0, w * 0.26, 0.045, 'metal');
  } else if (spec.kind === 'chair') {
    seat();
  } else if (spec.kind === 'table' || spec.kind === 'desk') {
    box(0, h - 0.06, 0, w, 0.06, d, spec.material);
    for (const x of [-0.43, 0.43])
      for (const z of [-0.38, 0.38])
        box(x * w, 0, z * d, 0.035, h - 0.06, 0.035, 'metal');
    if (spec.kind === 'desk') {
      box(0, h + 0.15, -d * 0.25, 0.4, 0.27, 0.035, 'screen');
      box(0, h, -d * 0.25, 0.035, 0.16, 0.035, 'metal');
      box(0, h, 0, 0.32, 0.012, 0.14, 'screen');
    }
  } else if (spec.kind === 'counter') {
    box(0, 0, 0, w, h - 0.06, d, 'oak');
    box(0, h - 0.06, 0, w + 0.03, 0.06, d + 0.035, 'table');
    for (let x = -w / 2 + 0.06; x < w / 2; x += 0.06)
      box(x, 0.04, d / 2, 0.016, h - 0.12, 0.018, 'oak');
  } else if (spec.kind === 'exam-chair') {
    box(0, 0.04, 0, w * 0.7, 0.35, d * 0.62, 'porcelain');
    box(0, 0.5, -d * 0.04, w, 0.16, d * 0.7, spec.material);
    const back = box(0, 0.62, -d * 0.31, w, h - 0.62, 0.15, spec.material);
    back.rotation.x = -0.28;
    box(0, 0.56, d * 0.4, w * 0.8, 0.08, d * 0.3, spec.material);
    for (const x of [-w * 0.54, w * 0.54])
      box(x, 0.65, -d * 0.03, 0.055, 0.07, d * 0.55, 'metal');
  } else if (spec.kind === 'therapy-bed') {
    box(0, h - 0.14, 0, w, 0.14, d, 'clinical-blue');
    for (const x of [-w * 0.38, w * 0.38])
      for (const z of [-d * 0.4, d * 0.4])
        box(x, 0, z, 0.045, h - 0.14, 0.045, 'metal');
    box(0, h - 0.04, -d * 0.36, w * 0.93, 0.1, d * 0.2, 'clinical-blue');
  } else if (spec.kind === 'toilet') {
    cyl(0, 0, d * 0.12, w * 0.38, 0.4, 'porcelain');
    const bowl = new T.Mesh(
      new T.TorusGeometry(w * 0.33, 0.055, 8, 24),
      material('porcelain'),
    );
    bowl.rotation.x = Math.PI / 2;
    bowl.position.set(0, 0.43, d * 0.12);
    g.add(bowl);
    box(0, 0, -d * 0.33, w, 0.71, d * 0.25, 'porcelain');
  } else if (spec.kind === 'basin') {
    box(0, 0.72, 0, w, 0.13, d, 'porcelain');
    box(0, 0.85, -d * 0.3, 0.025, 0.14, 0.025, 'metal');
  } else if (
    spec.kind === 'tree' ||
    spec.kind === 'tree-unseated' ||
    spec.kind === 'planter'
  ) {
    const tree = spec.kind !== 'planter';
    cyl(0, 0, 0, w * (tree ? 0.28 : 0.37), tree ? 0.6 : 0.42, 'concrete');
    if (spec.kind === 'tree') {
      const ring = new T.Mesh(
        new T.TorusGeometry(w * 0.35, 0.2, 8, 48),
        material('blue'),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.46;
      g.add(ring);
    }
    cyl(0, 0.4, 0, w * 0.025, h * 0.65, 'oak', w * 0.012);
    for (let i = 0; i < 17; i++) {
      const a = i * 2.399,
        r = w * (0.1 + (i % 4) * 0.05);
      const leaf = new T.Mesh(
        new T.IcosahedronGeometry(w * (0.13 + (i % 3) * 0.027), 2),
        material('leaf'),
      );
      leaf.position.set(
        Math.cos(a) * r,
        h * 0.7 + (i % 3) * h * 0.075,
        Math.sin(a) * r,
      );
      leaf.scale.y = 0.7;
      leaf.castShadow = true;
      g.add(leaf);
    }
    if (tree)
      for (let i = 0; i < 5; i++) {
        const limb = cyl(0, h * 0.48, 0, 0.045, h * 0.34, 'oak', 0.015);
        limb.rotation.z = (i - 2) * 0.25;
        limb.rotation.y = i * 1.7;
      }
  } else if (spec.kind === 'bench') {
    box(0, 0.09, 0, w, 0.36, d, spec.material);
    box(0, 0.43, d * 0.4, w, h - 0.43, d * 0.2, spec.material);
  } else if (spec.kind === 'shelf') {
    box(0, 0, -d * 0.4, w, h, d * 0.15, spec.material);
    for (let y = 0; y < h; y += h / 4) box(0, y, 0, w, 0.04, d, spec.material);
    for (let x = -w / 2; x <= w / 2 + 0.001; x += w / 5)
      box(x, 0, 0, 0.035, h, d, spec.material);
    for (let i = 0; i < 15; i++)
      box(
        -w * 0.43 + (i % 5) * w * 0.18,
        0.07 + Math.floor(i / 5) * h * 0.25,
        0,
        0.04 + (i % 3) * 0.01,
        h * 0.16,
        d * 0.6,
        i % 2 ? 'cabinet' : 'blue',
      );
  } else if (spec.kind === 'parallel-bars') {
    for (const x of [-w / 2, w / 2]) {
      box(x, h - 0.04, 0, 0.04, 0.04, d, 'metal');
      for (const z of [-d * 0.4, d * 0.4]) box(x, 0, z, 0.04, h, 0.04, 'metal');
    }
  } else if (spec.kind === 'stair' || spec.kind === 'steps') {
    const steps = Math.max(3, Math.ceil(h / 0.17));
    for (let i = 0; i < steps; i++)
      box(
        0,
        0,
        -d / 2 + ((i + 0.5) * d) / steps,
        w,
        ((i + 1) * h) / steps,
        d / steps,
        spec.material,
      );
    for (const x of [-w / 2, w / 2]) {
      const rail = box(x, 0.95, 0, 0.025, 0.035, Math.hypot(h, d), 'metal');
      rail.rotation.x = -Math.atan2(h, d);
      rail.position.y = h / 2 + 0.95;
    }
  } else if (spec.kind === 'bike') {
    box(0, 0, 0, w, 0.08, d * 0.75, 'metal');
    cyl(0, 0.08, 0, w * 0.3, 0.52, 'concrete');
    box(0, 0.52, d * 0.05, 0.055, 0.35, 0.05, 'metal');
    box(0, 0.85, d * 0.09, 0.3, 0.07, 0.23, 'screen');
    box(0, 0.4, -d * 0.28, 0.05, 0.7, 0.05, 'metal');
    box(0, 1.07, -d * 0.28, w * 0.7, 0.05, 0.05, 'metal');
  } else if (spec.kind === 'car') {
    box(0, 0.23, 0, w, h * 0.4, d, spec.material);
    box(0, h * 0.53, -d * 0.03, w * 0.92, h * 0.47, d * 0.56, spec.material);
    box(0, h * 0.72, -d * 0.3, w * 0.86, 0.35, 0.04, 'screen');
    for (const x of [-w * 0.46, w * 0.46])
      for (const z of [-d * 0.31, d * 0.31]) {
        const wheel = cyl(x, 0.12, z, 0.28, 0.12, 'screen');
        wheel.rotation.z = Math.PI / 2;
      }
  } else if (spec.kind === 'screen') {
    box(0, 0, 0, w, h, d, 'screen');
  } else box(0, 0, 0, w, h, d, spec.material);
  const bounds = new T.Box3().setFromObject(g),
    size = bounds.getSize(new T.Vector3()),
    mid = bounds.getCenter(new T.Vector3());
  g.position.set(-mid.x, -bounds.min.y, -mid.z);
  const fitted = new T.Group();
  fitted.scale.set(w / size.x, h / size.y, d / size.z);
  fitted.add(g);
  const root = new T.Group();
  root.add(fitted);
  return root;
}
