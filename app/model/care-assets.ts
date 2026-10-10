import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Asset } from './schema';

/**
 * Back-of-house and personal-care fittings from the October 2026 owner
 * walkthrough (scripts/apply-owner-review-care-rooms.mjs): the wheelchair
 * wash in the bay opposite the linen room (a kerbed wash pad with a floor
 * drain, a wall-mounted hose reel with its spray gun and an empty wheelchair
 * parked on the pad), the trash enclosure's wheeled bins, the tumble dryer
 * beside the washer in the laundry room, the laundry's mop sink and
 * housekeeping cart, and the electrical room's wall-mounted switchboard and
 * sub-panel (the owner's second pass, which enclosed the electrical room
 * behind the loading roll-up). Each component is modeled at its declared
 * dimensions around a floor-centred origin with its usable face toward local
 * +Z, like the other asset families; proportions follow standard products,
 * not a verified manufacturer schedule.
 */
export const CARE_ASSET_KINDS = [
  'wash-pad',
  'hose-reel',
  'wheelchair',
  'waste-bin',
  'tumble-dryer',
  'janitor-sink',
  'housekeeping-cart',
  'electrical-panel',
] as const;

export function buildCareAsset(
  spec: Asset,
  material: (id: string) => T.Material,
): T.Group | null {
  if (!(CARE_ASSET_KINDS as readonly string[]).includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions;
  const slot = (name: string, fallback: string) =>
    spec.materials?.[name] || fallback;
  const white = slot('white', 'photo-white'),
    metal = slot('metal', 'photo-silver'),
    dark = slot('frame', 'photo-black');
  const mesh = (
    geo: T.BufferGeometry,
    mat: string,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new T.Mesh(geo, material(mat));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // Boxes sit on `y`, centred on x and z; a radius softens moulded edges.
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    mat: string,
    r = 0,
  ) =>
    mesh(
      r
        ? new RoundedBoxGeometry(a, b, c, 2, Math.min(r, a / 3, b / 3, c / 3))
        : new T.BoxGeometry(a, b, c),
      mat,
      x,
      y + b / 2,
      z,
    );
  /** Wheel: a cylinder with its axis along x, centred on (x, y, z). */
  const wheel = (x: number, y: number, z: number, r: number, len: number, mat: string) => {
    const o = mesh(new T.CylinderGeometry(r, r, len, 24), mat, x, y, z);
    o.rotation.z = Math.PI / 2;
    return o;
  };
  const rod = (a: number[], b: number[], r: number, mat: string) => {
    const v = new T.Vector3(...a),
      u = new T.Vector3(...b),
      delta = u.clone().sub(v),
      mid = u.clone().add(v).multiplyScalar(0.5);
    const o = mesh(
      new T.CylinderGeometry(r, r, delta.length(), 10),
      mat,
      mid.x,
      mid.y,
      mid.z,
    );
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return o;
  };

  if (spec.kind === 'wash-pad') {
    // A tiled, kerbed pad with a floor drain at its centre; the kerb is the
    // full height of the component and the slab is flush with the floor.
    const kerb = slot('kerb', 'concrete'),
      k = 0.07;
    box(0, 0, 0, w, 0.02, d, spec.material);
    box(0, 0, -d / 2 + k / 2, w, h, k, kerb);
    box(0, 0, d / 2 - k / 2, w, h, k, kerb);
    box(-w / 2 + k / 2, 0, 0, k, h, d - 2 * k, kerb);
    box(w / 2 - k / 2, 0, 0, k, h, d - 2 * k, kerb);
    box(0, 0.02, 0, 0.24, 0.004, 0.24, dark);
    for (let i = 0; i < 6; i++)
      box(-0.1 + i * 0.04, 0.024, 0, 0.012, 0.003, 0.2, metal);
  } else if (spec.kind === 'hose-reel') {
    // Wall-mounted reel: a back plate the size of the component, the drum
    // with its coiled hose between two cheeks, and the spray gun hung on a
    // bracket at the side. Local −Z is the wall side.
    box(0, 0, -d / 2 + 0.01, w, h, 0.02, metal);
    const drum = mesh(new T.CylinderGeometry(0.12, 0.12, 0.22, 20), dark, 0, 0.26, 0);
    drum.rotation.z = Math.PI / 2;
    for (const x of [-0.12, 0.12]) {
      const cheek = mesh(new T.CylinderGeometry(0.14, 0.14, 0.015, 24), spec.material, x, 0.26, 0);
      cheek.rotation.z = Math.PI / 2;
    }
    const hose = slot('hose', 'photo-teal');
    for (const x of [-0.06, -0.02, 0.02, 0.06]) {
      const coil = mesh(new T.TorusGeometry(0.133, 0.012, 8, 32), hose, x, 0.26, 0);
      coil.rotation.y = Math.PI / 2;
    }
    rod([0.12, 0.2, 0.08], [0.17, 0.19, 0.12], 0.011, hose);
    box(0.17, 0.05, 0.125, 0.05, 0.14, 0.05, dark);
    box(0.17, 0.19, 0.11, 0.03, 0.06, 0.07, metal);
  } else if (spec.kind === 'wheelchair') {
    // A standard folding wheelchair, local +Z forward: rear wheels with hand
    // rims, front casters, sling seat and back, armrests, swing-away legrests
    // with footplates and push handles behind the back posts.
    const seat = spec.material;
    for (const x of [-0.305, 0.305]) {
      wheel(x, 0.3, -0.1, 0.3, 0.05, dark);
      wheel(x, 0.3, -0.1, 0.05, 0.048, metal);
      const rim = mesh(new T.TorusGeometry(0.27, 0.011, 8, 36), metal, x * 1.03, 0.3, -0.1);
      rim.rotation.y = Math.PI / 2;
    }
    for (const x of [-0.2, 0.2]) {
      wheel(x, 0.07, 0.3, 0.07, 0.035, dark);
      rod([x, 0.07, 0.3], [x, 0.3, 0.27], 0.011, metal);
    }
    box(0, 0.47, -0.05, 0.44, 0.045, 0.42, seat, 0.012);
    box(0, 0.52, -0.25, 0.44, 0.38, 0.03, seat, 0.01);
    for (const x of [-0.22, 0.22]) {
      rod([x, 0.2, -0.27], [x, h, -0.27], 0.012, metal);
      box(x, 0.875, -0.46, 0.03, 0.03, 0.13, dark);
      rod([x, 0.45, -0.27], [x, 0.45, 0.17], 0.012, metal);
      rod([x, 0.2, -0.27], [x, 0.3, -0.1], 0.012, metal);
      rod([x, 0.45, -0.2], [x, 0.66, -0.2], 0.011, metal);
      rod([x, 0.45, 0.1], [x, 0.66, 0.1], 0.011, metal);
      box(x * 1.14, 0.66, -0.05, 0.05, 0.03, 0.32, dark, 0.01);
    }
    for (const x of [-0.15, 0.15]) {
      rod([x, 0.45, 0.17], [x, 0.1, 0.46], 0.011, metal);
      box(x, 0.08, 0.49, 0.16, 0.02, 0.07, dark);
    }
    rod([-0.22, 0.2, -0.27], [0.22, 0.45, 0.1], 0.01, metal);
    rod([0.22, 0.2, -0.27], [-0.22, 0.45, 0.1], 0.01, metal);
  } else if (spec.kind === 'waste-bin') {
    // A two-wheeled enclosure bin, lid hinged at the back (local −Z), with a
    // pictogram strip on the front face.
    const lid = slot('lid', dark);
    for (const x of [-0.27, 0.27]) wheel(x, 0.08, -0.3, 0.08, 0.04, dark);
    box(0, 0.12, 0, 0.64, 0.98, 0.72, spec.material, 0.03);
    box(0, 1.1, 0, w, 0.05, d, lid, 0.015);
    box(0, 1.15, -0.3, 0.5, h - 1.15, 0.12, lid, 0.01);
    box(0, 1.0, -0.37, 0.5, 0.03, 0.03, metal);
    box(0, 0.55, 0.361, 0.32, 0.22, 0.004, slot('label', white));
  } else if (spec.kind === 'tumble-dryer') {
    // Front-loading dryer beside the washers: the cabinet, a round door with
    // a glass porthole, a lint-filter flap under it and a control strip above.
    const face = d / 2;
    box(0, 0, 0, w, h, d, white, 0.025);
    box(0, h * 0.82, face + 0.003, w * 0.9, h * 0.13, 0.016, metal);
    box(-w * 0.2, h * 0.845, face + 0.014, w * 0.3, h * 0.07, 0.008, 'screen', 0.005);
    const knob = mesh(new T.CylinderGeometry(0.035, 0.035, 0.025, 20), white, w * 0.27, h * 0.885, face + 0.026);
    knob.rotation.x = Math.PI / 2;
    mesh(new T.TorusGeometry(w * 0.3, 0.03, 10, 32), metal, 0, h * 0.42, face + 0.031);
    mesh(new T.CircleGeometry(w * 0.26, 32), dark, 0, h * 0.42, face + 0.04);
    mesh(new T.CircleGeometry(w * 0.2, 32), 'glass', 0, h * 0.42, face + 0.044);
    box(0, h * 0.06, face + 0.004, w * 0.5, h * 0.09, 0.012, metal, 0.004);
  } else if (spec.kind === 'janitor-sink') {
    // Floor-level mop sink with a splash-back and a wall faucet; the
    // splash-back (local −Z) stands against the wall.
    const splash = slot('splash', 'photo-teal-tile');
    box(0, 0, 0, w, 0.3, d, white, 0.01);
    box(0, 0.25, 0.02, w - 0.14, 0.045, d - 0.18, dark);
    box(0, 0.3, -d / 2 + 0.015, w, h - 0.3, 0.03, splash);
    rod([0, 0.72, -d / 2 + 0.04], [0, 0.98, -d / 2 + 0.04], 0.013, metal);
    rod([0, 0.96, -d / 2 + 0.04], [0, 0.96, -d / 2 + 0.26], 0.012, metal);
    rod([0, 0.96, -d / 2 + 0.26], [0, 0.88, -d / 2 + 0.26], 0.012, metal);
    for (const x of [-0.07, 0.07])
      rod([x, 0.86, -d / 2 + 0.03], [x, 0.86, -d / 2 + 0.11], 0.011, metal);
    box(-0.2, 0.3, 0.18, 0.03, 0.9, 0.03, slot('mop', 'photo-mustard'));
  } else if (spec.kind === 'housekeeping-cart') {
    // Housekeeping cart: a bag at the back (local −Z) under the push bar, two
    // supply shelves in front, on four casters.
    const grey = slot('body', 'photo-blue-grey');
    for (const x of [-0.26, 0.26]) for (const z of [-0.42, 0.42]) wheel(x, 0.06, z, 0.06, 0.03, dark);
    box(0, 0.1, 0, w, 0.04, d, grey, 0.01);
    box(0, 0.14, -0.3, 0.5, 0.78, 0.46, spec.material, 0.02);
    box(0, 0.92, -0.3, 0.52, 0.03, 0.48, metal, 0.01);
    for (const y of [0.4, 0.7]) box(0, y, 0.26, 0.5, 0.03, 0.5, grey, 0.008);
    for (const x of [-0.24, 0.24])
      for (const z of [0.03, 0.5]) rod([x, 0.14, z], [x, 0.95, z], 0.01, metal);
    for (const x of [-0.24, 0.24]) rod([x, 0.92, -0.5], [x, 1.02, -0.5], 0.012, metal);
    box(0, 1.02, -0.5, 0.5, 0.03, 0.03, dark);
    box(0.12, 0.43, 0.26, 0.09, 0.22, 0.09, 'photo-yellow', 0.01);
    box(-0.12, 0.43, 0.2, 0.14, 0.1, 0.1, white, 0.01);
  } else if (spec.kind === 'electrical-panel') {
    // Wall-mounted switchboard: a steel cabinet the size of the component
    // with its back (local -Z) on the wall, one hinged door per section
    // (`parameters.sections`, default 1) with a cam lock and a warning label,
    // and a cable gland strip along the bottom edge.
    const body = slot('body', 'photo-blue-grey'),
      door = slot('door', white),
      sections = Math.max(1, Math.round(Number(spec.parameters?.sections ?? 1))),
      gap = 0.03,
      sw = (w - gap * (sections + 1)) / sections;
    box(0, 0, 0, w, h, d, body, 0.01);
    for (let i = 0; i < sections; i++) {
      const x = -w / 2 + gap + sw / 2 + i * (sw + gap);
      box(x, gap, d / 2 - 0.004, sw, h - 2 * gap, 0.012, door, 0.004);
      box(x + sw / 2 - 0.04, h * 0.5, d / 2 + 0.008, 0.022, 0.06, 0.012, metal);
      box(x, h * 0.86, d / 2 + 0.009, sw * 0.55, 0.05, 0.004, 'photo-yellow');
      box(x, h * 0.86, d / 2 + 0.012, sw * 0.45, 0.012, 0.002, dark);
    }
    for (let x = -w / 2 + 0.08; x < w / 2 - 0.05; x += 0.1)
      box(x, -0.02, 0, 0.03, 0.02, d * 0.4, dark);
  }
  // Fitted to the declared dimensions with the base at the floor, like the
  // other asset families (clinical-assets.ts).
  const bounds = new T.Box3().setFromObject(g),
    size = bounds.getSize(new T.Vector3()),
    center = bounds.getCenter(new T.Vector3());
  g.position.set(-center.x, -bounds.min.y, -center.z);
  const fit = new T.Group();
  fit.scale.set(w / size.x, h / size.y, d / size.z);
  fit.add(g);
  const root = new T.Group();
  root.add(fit);
  return root;
}
