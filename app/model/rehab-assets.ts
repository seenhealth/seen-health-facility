import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Asset } from './schema';

/** Asset kinds drawn by `buildRehabAsset` (owner walkthrough, October 2026). */
export const REHAB_ASSET_KINDS = [
  'rehab-fridge',
  'rehab-microwave',
  'rehab-recliner',
  'rehab-standing-desk',
];

/**
 * Rehabilitation-wing furniture from the October 2026 owner walkthrough: the
 * practice (ADL) kitchen's refrigerator and microwave, the quiet room's
 * recliners and the PT/OT workspace's standing desks. Each kind is modelled at
 * its declared W × H × D around a floor-centred origin from boxes, cylinders
 * and rounded boxes in palette materials (`material(id)`, with named
 * `materials` slots), then fitted to the declared size like the other asset
 * families. Proportions follow standard products, not a verified schedule.
 *
 * Fronts, in local axes:
 * - `rehab-fridge`: the doors and handles face +z.
 * - `rehab-microwave`: the door window, keypad and handle face +z; it stands
 *   on a counter (place it at the counter's surface height).
 * - `rehab-recliner`: the chair convention of `seatPose` (scenario.ts): the
 *   back sits at +z and the raised footrest reaches toward −z, so the person
 *   faces −z (heading = rotation + π).
 * - `rehab-standing-desk`: the user stands at +z; the monitor sits at the back
 *   (−z) on top of the 1.05 m worktop, and the declared height includes it.
 */
export function buildRehabAsset(
  spec: Asset,
  material: (id: string) => T.Material,
): T.Group | null {
  if (!REHAB_ASSET_KINDS.includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions;
  const slot = (name: string, fallback: string) =>
    spec.materials?.[name] || fallback;
  const metal = slot('metal', 'photo-silver'),
    dark = slot('frame', 'photo-black'),
    oak = slot('wood', 'oak');
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
  // Boxes sit on `y`; a radius softens upholstery and appliance edges.
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
        ? new RoundedBoxGeometry(a, b, c, 3, Math.min(r, a / 2, b / 2, c / 2))
        : new T.BoxGeometry(a, b, c),
      mat,
      x,
      y + b / 2,
      z,
    );
  const cyl = (
    x: number,
    y: number,
    z: number,
    r: number,
    len: number,
    mat: string,
    segments = 20,
  ) => mesh(new T.CylinderGeometry(r, r, len, segments), mat, x, y + len / 2, z);
  /** A round bar between two points. */
  const rod = (
    a: [number, number, number],
    b: [number, number, number],
    r: number,
    mat: string,
  ) => {
    const from = new T.Vector3(...a),
      to = new T.Vector3(...b),
      len = from.distanceTo(to);
    const m = mesh(new T.CylinderGeometry(r, r, len, 14), mat, 0, 0, 0);
    m.position.copy(from).lerp(to, 0.5);
    m.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    return m;
  };

  if (spec.kind === 'rehab-fridge') {
    // Top-freezer refrigerator: a plinth, the cabinet, two door panels on the
    // front and vertical handles on their right-hand edges.
    const handle = slot('handle', dark),
      front = d / 2 - 0.03;
    box(0, 0, -0.02, w - 0.08, 0.08, d - 0.1, dark);
    box(0, 0.08, -0.015, w, h - 0.08, d - 0.03, spec.material, 0.012);
    const split = h * 0.67;
    box(0, 0.1, front + 0.015, w - 0.02, split - 0.12, 0.03, spec.material, 0.008);
    box(0, split, front + 0.015, w - 0.02, h - split - 0.03, 0.03, spec.material, 0.008);
    const hx = w * 0.38,
      hz = front + 0.045;
    for (const [y0, y1] of [
      [split + 0.06, h - 0.1],
      [split - 0.5, split - 0.08],
    ]) {
      rod([hx, y0, hz], [hx, y1, hz], 0.011, handle);
      for (const y of [y0, y1]) rod([hx, y, front + 0.03], [hx, y, hz], 0.008, handle);
    }
  } else if (spec.kind === 'rehab-microwave') {
    // Counter-top microwave: a white body on four feet, a dark door window
    // across the left two thirds, a keypad strip on the right and a bar handle.
    const glass = slot('glass', dark);
    for (const x of [-w * 0.42, w * 0.42])
      for (const z of [-d * 0.4, d * 0.4]) cyl(x, 0, z, 0.012, 0.02, dark, 12);
    box(0, 0.02, 0, w, h - 0.02, d, spec.material, 0.01);
    box(-w * 0.14, 0.05, d / 2 - 0.004, w * 0.58, h * 0.74, 0.012, glass, 0.004);
    box(w * 0.34, 0.04, d / 2 - 0.003, w * 0.2, h * 0.8, 0.01, dark, 0.003);
    for (const y of [0.09, h - 0.08]) rod([-w * 0.4, y, d / 2], [-w * 0.4, y, d / 2 + 0.018], 0.007, metal);
    rod([-w * 0.4, 0.09, d / 2 + 0.018], [-w * 0.4, h - 0.08, d / 2 + 0.018], 0.008, metal);
  } else if (spec.kind === 'rehab-recliner') {
    // Rise-and-recline armchair for the quiet room: an oak plinth, a deep
    // seat between padded arms, a reclined back at +z and a raised footrest
    // ahead of the seat at −z, with the recline lever on the right arm.
    const fabric = spec.material,
      seatY = 0.38,
      inner = w - 0.32;
    box(0, 0, 0.1, w - 0.12, 0.1, 0.92, oak, 0.01);
    box(0, seatY, 0.2, inner, 0.13, 0.64, fabric, 0.04);
    const back = box(0, seatY + 0.1, 0.56, inner, h - seatY - 0.1, 0.2, fabric, 0.05);
    back.rotation.x = -0.26;
    for (const x of [-w / 2 + 0.08, w / 2 - 0.08])
      box(x, 0.1, 0.18, 0.16, 0.56, 0.84, fabric, 0.045);
    const rest = box(0, 0.3, -0.5, inner - 0.04, 0.09, 0.5, fabric, 0.03);
    rest.rotation.x = 0.32;
    box(0, 0.1, -0.2, inner - 0.1, 0.22, 0.14, fabric, 0.02);
    rod([w / 2 - 0.02, 0.3, 0.1], [w / 2 - 0.02, 0.3, 0.42], 0.01, metal);
  } else if (spec.kind === 'rehab-standing-desk') {
    // Height-adjustable desk raised to standing height: two T-legs with
    // telescopic columns, a cross beam, the worktop at 1.05 m, a monitor on a
    // stand at the back and a keyboard and mouse at the user's side (+z).
    const top = 1.05,
      screen = slot('screen', 'screen');
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) {
      box(x, 0, 0, 0.07, 0.03, d - 0.1, metal, 0.01);
      box(x, 0.03, 0, 0.075, top - 0.55, 0.095, metal, 0.01);
      box(x, top - 0.55, 0, 0.058, 0.52, 0.078, metal, 0.008);
    }
    box(0, top - 0.11, -0.04, w - 0.3, 0.05, 0.08, metal, 0.006);
    box(0, top - 0.03, 0, w, 0.03, d, spec.material, 0.006);
    box(0, top, -0.19, 0.24, 0.015, 0.17, dark, 0.004);
    box(0, top + 0.015, -0.21, 0.04, 0.12, 0.03, dark);
    box(0, top + 0.07, -0.2, 0.55, h - top - 0.07, 0.018, screen, 0.004);
    box(0, top, 0.1, 0.42, 0.012, 0.14, dark, 0.003);
    box(0.3, top, 0.11, 0.06, 0.03, 0.1, dark, 0.012);
  }

  const bounds = new T.Box3().setFromObject(g),
    size = bounds.getSize(new T.Vector3()),
    mid = bounds.getCenter(new T.Vector3());
  g.position.set(-mid.x, -bounds.min.y, -mid.z);
  const fit = new T.Group();
  fit.scale.set(w / size.x, h / size.y, d / size.z);
  fit.add(g);
  const root = new T.Group();
  root.add(fit);
  return root;
}
