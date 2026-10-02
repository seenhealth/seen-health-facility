import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Asset } from './schema';

/** Asset kinds drawn by `buildHomeAsset`. */
export const HOME_ASSET_KINDS = [
  'bed',
  'nightstand',
  'wardrobe',
  'kitchen-range',
  'grab-bar',
  'swing-up-grab-bar',
  'bed-rail',
  'hospital-bed',
  'ramp',
  'pers-console',
];
/** Height of the bedside lamp that a `nightstand` with `lamp` carries on its top. */
const NIGHTSTAND_LAMP = 0.36;
/**
 * Height above a home asset's base where things stand on it: its declared
 * height, or a nightstand's top beside its lamp (the declared height
 * includes the lamp). Undefined for kinds this module does not draw.
 */
export function homeAssetSurface(spec: Asset): number | undefined {
  if (!HOME_ASSET_KINDS.includes(spec.kind)) return undefined;
  const h = spec.dimensions[1];
  return spec.kind === 'nightstand' && spec.parameters?.lamp === true
    ? h - NIGHTSTAND_LAMP
    : h;
}

/**
 * Home furniture and accessibility fittings (the Wongs' home,
 * public/models/seen-home-wong.json). Each kind is modelled at its declared
 * W × H × D around a floor-centred origin from boxes, cylinders and rounded
 * boxes in palette materials (`material(id)`, with named `materials` slots),
 * then fitted to the declared size like the other asset families. Every mesh
 * casts and receives shadows. Proportions follow standard products, not a
 * verified manufacturer schedule.
 *
 * Fronts, in local axes (the facility asset's `parameters.front` repeats them):
 * - `bed`, `hospital-bed`: head at −z, foot at +z. `transferHandle`
 *   ('left' | 'right' | 'both') adds a U handle on that side as seen from the
 *   foot facing the headboard (left = −x), inside the declared width. A bed is
 *   not a seat for `seatPose` (which faces chairs toward −z): someone sitting
 *   on its edge needs an explicit point and heading.
 * - `nightstand`, `wardrobe`, `kitchen-range`: drawers, doors, the oven door
 *   and (with `frontControls`) the knobs face +z, the room side.
 * - `grab-bar`, `swing-up-grab-bar`: the wall plane is −z and the bar stands
 *   off toward +z; `orientation: 'vertical'` runs a grab bar along y.
 * - `bed-rail`: a floor-standing inverted U along z whose plate (at x = 0)
 *   slides under a mattress.
 * - `ramp`: high end at −z, foot at +z, handrails on both sides; `rise` is
 *   the height difference (the declared height adds the 0.9 m rails).
 * - `pers-console`: a PERS base unit; its speaker grille and status light
 *   face +z, the help button is on top.
 */
export function buildHomeAsset(
  spec: Asset,
  material: (id: string) => T.Material,
): T.Group | null {
  if (!HOME_ASSET_KINDS.includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions,
    p = spec.parameters || {};
  const slot = (name: string, fallback: string) =>
    spec.materials?.[name] || fallback;
  const metal = slot('metal', 'photo-silver');
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
  /** Box with its base at `y`; `r` rounds the edges. */
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
  /** Vertical cylinder with its base at `y`. */
  const cyl = (
    x: number,
    y: number,
    z: number,
    r: number,
    len: number,
    mat: string,
    top = r,
  ) => mesh(new T.CylinderGeometry(top, r, len, 20), mat, x, y + len / 2, z);
  /** Cylinder between two points (bars, rails, knobs, flanges, casters). */
  const rod = (
    a: T.Vector3Tuple,
    b: T.Vector3Tuple,
    r: number,
    mat: string,
  ) => {
    const u = new T.Vector3(...a),
      v = new T.Vector3(...b),
      delta = v.clone().sub(u),
      mid = u.add(v).multiplyScalar(0.5);
    const o = mesh(
      new T.CylinderGeometry(r, r, delta.length(), 16),
      mat,
      mid.x,
      mid.y,
      mid.z,
    );
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return o;
  };

  if (spec.kind === 'bed') {
    // Frame on four legs, mattress, headboard, pillows and a duvet over the
    // foot; no footboard, so the foot stays free for transfers.
    const top = Number(p.mattressTop ?? 0.56),
      handle = String(p.transferHandle ?? 'none'),
      left = handle === 'left' || handle === 'both',
      right = handle === 'right' || handle === 'both',
      inset = 0.06,
      x0 = -w / 2 + (left ? inset : 0),
      x1 = w / 2 - (right ? inset : 0),
      bw = x1 - x0,
      cx = (x0 + x1) / 2,
      head = 0.06,
      z0 = -d / 2 + head,
      z1 = d / 2,
      base = top - 0.22,
      frame = slot('frame', 'oak'),
      pillow = slot('pillow', 'photo-white'),
      blanket = slot('blanket', 'photo-blue-seat');
    for (const x of [x0 + 0.07, x1 - 0.07])
      for (const z of [z0 + 0.07, z1 - 0.07]) cyl(x, 0, z, 0.03, 0.1, frame);
    box(cx, 0.1, (z0 + z1) / 2, bw - 0.02, base - 0.1, z1 - z0, frame, 0.01);
    box(
      cx,
      base,
      (z0 + z1) / 2,
      bw - 0.06,
      0.22,
      z1 - z0 - 0.04,
      spec.material,
      0.05,
    );
    box(cx, 0, -d / 2 + head / 2, bw, h, head, frame, 0.015);
    const pillows = bw > 1.1 ? [-1, 1] : [0];
    for (const s of pillows)
      box(
        cx + (s * bw) / 4,
        top - 0.02,
        z0 + 0.3,
        Math.min(0.6, bw / 2 - 0.08),
        0.12,
        0.38,
        pillow,
        0.05,
      );
    const dz1 = z1 - 0.03,
      dz0 = dz1 - 0.62 * d;
    box(
      cx,
      top - 0.03,
      (dz0 + dz1) / 2,
      bw - 0.03,
      0.06,
      dz1 - dz0,
      blanket,
      0.02,
    );
    box(cx, top - 0.02, dz0 + 0.06, bw - 0.03, 0.065, 0.12, pillow, 0.02);
    for (const s of [-1, 1])
      box(
        cx + s * (bw / 2 - 0.012),
        base - 0.04,
        (dz0 + dz1) / 2,
        0.012,
        0.28,
        dz1 - dz0,
        blanket,
      );
    // Transfer handle: an inverted U beside the mattress at the shoulders,
    // its plate clamped between frame and mattress.
    const sides = [...(left ? [-1] : []), ...(right ? [1] : [])];
    for (const s of sides) {
      const x = s * (w / 2 - 0.016),
        hz = -d / 2 + 0.75,
        y1 = top + 0.38;
      for (const dz of [-0.2, 0.2])
        rod([x, base - 0.02, hz + dz], [x, y1, hz + dz], 0.016, metal);
      rod([x, y1, hz - 0.2], [x, y1, hz + 0.2], 0.016, metal);
      box(x - s * 0.25, base - 0.012, hz, 0.5, 0.012, 0.06, metal);
    }
  } else if (spec.kind === 'nightstand') {
    // Two-drawer carcass on a recessed plinth; optional bedside lamp on top
    // (the declared height includes the lamp).
    const lamp = p.lamp === true,
      body = h - (lamp ? NIGHTSTAND_LAMP : 0);
    box(0, 0, -0.01, w - 0.06, 0.05, d - 0.06, slot('plinth', spec.material));
    box(0, 0.05, -0.01, w - 0.02, body - 0.08, d - 0.02, spec.material, 0.006);
    box(0, body - 0.03, 0, w, 0.03, d, spec.material, 0.008);
    const fh = (body - 0.13) / 2;
    for (let i = 0; i < 2; i++) {
      const y = 0.07 + i * (fh + 0.01);
      box(0, y, d / 2 - 0.006, w - 0.05, fh, 0.012, spec.material, 0.004);
      box(0, y + fh / 2 - 0.01, d / 2 - 0.002, 0.12, 0.02, 0.004, metal);
    }
    if (lamp) {
      cyl(0.08, body, -0.05, 0.06, 0.02, slot('base', 'photo-white'));
      cyl(0.08, body + 0.02, -0.05, 0.012, 0.18, metal);
      cyl(0.08, body + 0.2, -0.05, 0.1, 0.16, slot('shade', 'light'), 0.07);
    }
  } else if (spec.kind === 'wardrobe') {
    // Plinth, carcass, `doors` leaves and bar pulls beside the centre gap.
    const n = Math.max(1, Math.round(Number(p.doors ?? 2))),
      dw = w / n;
    box(0, 0, -0.02, w - 0.04, 0.08, d - 0.08, slot('plinth', spec.material));
    box(0, 0.08, -0.025, w, h - 0.08, d - 0.05, spec.material, 0.01);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + dw * (i + 0.5);
      box(
        x,
        0.1,
        d / 2 - 0.04,
        dw - 0.008,
        h - 0.14,
        0.02,
        spec.material,
        0.004,
      );
      const toward = n === 1 ? 1 : i < n / 2 ? 1 : -1;
      box(
        x + toward * (dw / 2 - 0.05),
        0.85,
        d / 2 - 0.015,
        0.02,
        0.3,
        0.03,
        metal,
      );
    }
  } else if (spec.kind === 'kitchen-range') {
    // Freestanding range: glass top with four burners, oven door, and the
    // controls on the front so nobody reaches across a hot burner.
    const front = p.frontControls !== false,
      top = slot('top', 'photo-black'),
      burner = slot('burner', 'screen');
    const bodyH = front || h < 1 ? h - 0.04 : 0.88;
    box(0, 0, -0.015, w, bodyH, d - 0.03, spec.material, 0.01);
    box(0, bodyH, -0.015, w - 0.01, 0.02, d - 0.05, top);
    for (const [x, z, r] of [
      [-0.18, -0.14, 0.085],
      [0.18, -0.14, 0.07],
      [-0.18, 0.12, 0.07],
      [0.18, 0.12, 0.085],
    ])
      cyl(x * (w / 0.76), bodyH + 0.02, z * (d / 0.66), r, 0.02, burner);
    box(0, 0.12, d / 2 - 0.02, w - 0.04, 0.55, 0.02, spec.material, 0.006);
    box(0, 0.25, d / 2 - 0.008, w - 0.22, 0.25, 0.004, slot('glass', 'screen'));
    rod(
      [-w * 0.36, 0.71, d / 2 - 0.012],
      [w * 0.36, 0.71, d / 2 - 0.012],
      0.012,
      metal,
    );
    const knobs = (y: number, z0: number) => {
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * (w / 6);
        rod([x, y, z0], [x, y, z0 + 0.02], 0.02, slot('knob', 'photo-black'));
      }
    };
    if (front) {
      box(0, 0.76, d / 2 - 0.026, w - 0.04, 0.09, 0.012, top, 0.004);
      knobs(0.805, d / 2 - 0.02);
    } else if (h >= 1) {
      box(
        0,
        bodyH + 0.02,
        -d / 2 + 0.025,
        w,
        h - bodyH - 0.02,
        0.05,
        spec.material,
        0.01,
      );
      knobs(bodyH + (h - bodyH) / 2, -d / 2 + 0.05);
    }
  } else if (spec.kind === 'grab-bar') {
    // 38 mm bar on two flanges and standoffs; horizontal along x, or along y.
    const vertical = p.orientation === 'vertical',
      L = vertical ? h : w,
      r = 0.019,
      axis = d / 2 - r,
      at = (t: number, z: number): T.Vector3Tuple =>
        vertical ? [0, t, z] : [t - L / 2, h / 2, z];
    rod(at(0.04, axis), at(L - 0.04, axis), r, spec.material);
    for (const t of [0.04, L - 0.04]) {
      rod(at(t, -d / 2), at(t, -d / 2 + 0.012), 0.04, spec.material);
      rod(at(t, -d / 2 + 0.012), at(t, axis), 0.012, spec.material);
    }
  } else if (spec.kind === 'swing-up-grab-bar') {
    // Wall plate with a hinge block; the U-bar is shown down, in use.
    const plate = slot('plate', spec.material),
      r = 0.016,
      x = w / 2 - r,
      y = h / 2;
    box(0, 0, -d / 2 + 0.01, w, h, 0.02, plate, 0.008);
    box(0, h * 0.3, -d / 2 + 0.05, w * 0.7, h * 0.4, 0.06, plate, 0.01);
    for (const s of [-1, 1])
      rod([s * x, y, -d / 2 + 0.08], [s * x, y, d / 2 - r], r, spec.material);
    rod([-x, y, d / 2 - r], [x, y, d / 2 - r], r, spec.material);
  } else if (spec.kind === 'bed-rail') {
    // Floor-standing inverted U; the plate slides under the mattress.
    const r = 0.016,
      zs = d / 2 - 0.03,
      plate = slot('plate', 'photo-black');
    for (const s of [-1, 1]) {
      rod([0, 0.01, s * zs], [0, h - r, s * zs], r, spec.material);
      box(0, 0, s * zs, w, 0.01, 0.06, plate);
    }
    rod([0, h - r, -zs], [0, h - r, zs], r, spec.material);
    box(0, 0.34, 0, 0.06, 0.02, d, plate);
  } else if (spec.kind === 'hospital-bed') {
    // Casters, base rails and lift columns, the frame, a two-part mattress
    // with the head section raised by `headTilt` (rad), head and foot boards,
    // half side rails near the head and a call pendant.
    const tilt = Number(p.headTilt ?? 0),
      frame = slot('frame', 'photo-silver'),
      board = slot('board', 'photo-white'),
      dark = slot('caster', 'photo-black'),
      hinge = -d / 2 + 0.7;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (w / 2 - 0.08),
          z = sz * (d / 2 - 0.15);
        rod([x - 0.025, 0.05, z], [x + 0.025, 0.05, z], 0.05, dark);
      }
    for (const sx of [-1, 1])
      box(sx * (w / 2 - 0.08), 0.1, 0, 0.05, 0.05, d - 0.3, frame);
    for (const sz of [-1, 1])
      box(0, 0.15, sz * (d / 2 - 0.45), 0.12, 0.18, 0.12, frame);
    box(0, 0.33, 0, w - 0.06, 0.08, d - 0.1, frame);
    const foot = d / 2 - 0.075;
    box(
      0,
      0.41,
      (hinge + foot) / 2,
      w - 0.1,
      0.15,
      foot - hinge,
      spec.material,
      0.04,
    );
    const pivot = new T.Group();
    pivot.position.set(0, 0.41, hinge);
    pivot.rotation.x = tilt;
    const back = new T.Mesh(
      new RoundedBoxGeometry(w - 0.1, 0.15, hinge + d / 2 - 0.075, 2, 0.04),
      material(spec.material),
    );
    back.position.set(0, 0.075, -(hinge + d / 2 - 0.075) / 2);
    back.castShadow = back.receiveShadow = true;
    pivot.add(back);
    g.add(pivot);
    box(0, 0.35, -d / 2 + 0.02, w, h - 0.35, 0.04, board, 0.02);
    box(0, 0.35, d / 2 - 0.02, w, 0.5, 0.04, board, 0.02);
    for (const s of [-1, 1])
      box(
        s * (w / 2 - 0.015),
        0.5,
        -d / 2 + 0.55,
        0.03,
        0.28,
        0.8,
        frame,
        0.01,
      );
    box(w / 2 - 0.05, 0.6, -d / 2 + 0.35, 0.04, 0.1, 0.03, dark, 0.01);
  } else if (spec.kind === 'ramp') {
    // A sloped deck over a stepped solid base, handrails both sides on posts.
    // The deck's top runs from `rise` at −z to its own thickness at +z, so
    // its lowest edge touches the ground and nothing dips below the origin.
    const rise = Number(p.rise ?? 0.35),
      rail = slot('rail', 'photo-silver'),
      t = 0.04,
      lip = t,
      a = Math.atan2(rise - lip, d),
      L = Math.hypot(d, rise - lip),
      surface = (z: number) => lip + ((rise - lip) * (d / 2 - z)) / d,
      deckW = w - 0.1;
    const deck = mesh(new T.BoxGeometry(deckW, t, L), spec.material, 0, 0, 0);
    deck.rotation.x = a;
    deck.position.set(
      0,
      (rise + lip) / 2 - (t / 2) * Math.cos(a),
      -(t / 2) * Math.sin(a),
    );
    const steps = Math.max(2, Math.round(d / 0.7));
    for (let i = 0; i < steps; i++) {
      const zLow = -d / 2 + ((i + 1) * d) / steps,
        height = surface(zLow) - lip * 0.5;
      if (height > 0.01)
        box(
          0,
          0,
          zLow - d / steps / 2,
          deckW - 0.02,
          height,
          d / steps,
          spec.material,
        );
    }
    const railH = h - rise - 0.02,
      posts = Math.max(2, Math.ceil(d / 1.4) + 1);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.02);
      rod(
        [x, surface(-d / 2) + railH, -d / 2],
        [x, surface(d / 2) + railH, d / 2],
        0.02,
        rail,
      );
      for (let i = 0; i < posts; i++) {
        const z = -d / 2 + 0.04 + ((d - 0.08) * i) / (posts - 1);
        rod([x, surface(z) - 0.02, z], [x, surface(z) + railH, z], 0.018, rail);
      }
    }
  } else if (spec.kind === 'pers-console') {
    // A personal emergency response (PERS) base unit: the pendant's alarm
    // calls the response center through it, which talks back through its
    // speaker. Low shell, dark top panel with the large help button and a
    // reset key, speaker grille and a status light on the front.
    const panel = slot('panel', 'photo-black'),
      button = slot('button', 'photo-teal'),
      light = slot('light', 'photo-teal'),
      top = h - 0.012,
      front = d / 2 - 0.002;
    box(0, 0, 0, w, top, d, spec.material, 0.01);
    box(0, top - 0.002, -0.004, w - 0.024, 0.004, d - 0.03, panel, 0.001);
    cyl(w * 0.2, top, -0.006, Math.min(w, d) * 0.24, 0.012, button);
    cyl(-w * 0.28, top, -0.012, 0.011, 0.007, slot('key', 'photo-silver'));
    box(-w * 0.14, top * 0.2, front, w * 0.48, top * 0.5, 0.004, panel, 0.001);
    box(w * 0.3, top * 0.4, front, 0.014, 0.008, 0.004, light);
  }
  const bounds = new T.Box3().setFromObject(g),
    size = bounds.getSize(new T.Vector3()),
    mid = bounds.getCenter(new T.Vector3());
  g.position.set(-mid.x, -bounds.min.y, -mid.z);
  const fit = new T.Group();
  fit.scale.set(w / size.x, h / size.y, d / size.z);
  fit.add(g);
  const root = new T.Group();
  root.name = spec.kind;
  root.add(fit);
  return root;
}
