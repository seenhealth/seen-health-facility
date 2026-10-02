import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Asset } from './schema';

/** Asset kinds drawn by `buildAdhcAsset`. */
export const ADHC_ASSET_KINDS = [
  'stage-platform',
  'stage-ramp',
  'stage-steps',
  'stage-backdrop',
  'choir-riser',
  'lectern',
  'upright-piano',
  'piano-bench',
  'banquet-table',
  'banquet-chair',
  'dance-floor',
  'lantern-post',
  'bingo-board',
  'bingo-caller',
  'calligraphy-table',
  'brush-stand',
  'easel',
  'drying-rack',
  'scroll-display',
  'whiteboard',
  'recumbent-bike',
  'band-wall',
  'practice-stair',
  'reception-desk',
];

/**
 * Furniture and fittings of the partner adult day health care center
 * (public/models/seen-partner-adhc.json): the hall's stage, ramp, steps,
 * backdrop, choir risers, lectern and piano, the long banquet tables and
 * their chairs, the dance-floor inlay and lantern posts, the bingo board and
 * caller's stand, the studio's calligraphy tables, brush stand, easels,
 * drying rack and scroll display, the classroom whiteboard, the light-rehab
 * pieces (recumbent bike, resistance-band wall, practice stair) and the
 * reception desk. Each kind is modelled at its declared W × H × D around a
 * floor-centred origin from boxes, cylinders, rounded boxes, spheres and one
 * extruded wedge in palette materials (`material(id)`, with named
 * `materials` slots that fall back to the center's own `adhc-*` finishes),
 * then fitted to the declared size like the other asset families. Every mesh
 * casts and receives shadows. Proportions follow common products, not a
 * verified manufacturer schedule.
 *
 * Fronts, in local axes (each facility asset's `parameters.front` repeats them):
 * - `stage-platform`, `choir-riser`, `stage-backdrop`, `lectern`,
 *   `upright-piano`, `bingo-board`, `bingo-caller`, `brush-stand`, `easel`,
 *   `drying-rack`, `scroll-display`, `whiteboard`, `band-wall`,
 *   `reception-desk`: the audience, player, painter or visitor side is +z;
 *   the lectern's speaker, the caller and the receptionist stand at −z.
 * - `stage-ramp`, `stage-steps`, `practice-stair`: the high end is −z, the
 *   foot +z (like the home `ramp`).
 * - `banquet-chair`, `piano-bench`: seats face −z (backs at +z), as
 *   `seatPose` assumes for chairs.
 * - `recumbent-bike`: the rider sits at −z facing the pedals at +z.
 * - `banquet-table`, `calligraphy-table`, `dance-floor`: used from every
 *   side; a `lantern-post` hangs its lantern toward +z.
 *
 * Standing surfaces, which people stand on (facility-instance.ts
 * `standingSurfaces` reads the same parameters): `standing: 'deck'` (a flat
 * top `deck` m up), `'tiers'` (`tiers` steps of `tierRise`, the front tier at
 * +z), `'ramp'` (rising to `rise` toward −z, with a flat `landing` m long at
 * the top) and `'steps'` (`risers` steps up to `rise` toward −z).
 */
export function buildAdhcAsset(
  spec: Asset,
  material: (id: string) => T.Material,
): T.Group | null {
  if (!ADHC_ASSET_KINDS.includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions,
    p = spec.parameters || {};
  const slot = (name: string, fallback: string) =>
    spec.materials?.[name] || fallback;
  const honey = slot('wood', 'adhc-honey'),
    dark = slot('frame', 'adhc-lacquer'),
    gold = slot('trim', 'adhc-gold'),
    red = slot('accent', 'adhc-cinnabar'),
    metal = slot('metal', 'photo-silver');
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
    segments = 20,
  ) =>
    mesh(new T.CylinderGeometry(top, r, len, segments), mat, x, y + len / 2, z);
  /** Cylinder between two points (rails, legs, rods). */
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
      new T.CylinderGeometry(r, r, delta.length(), 12),
      mat,
      mid.x,
      mid.y,
      mid.z,
    );
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return o;
  };
  /** Sphere centred at (x, y, z), stretched along y by `sy`. */
  const ball = (
    x: number,
    y: number,
    z: number,
    r: number,
    mat: string,
    sy = 1,
  ) => {
    const o = mesh(new T.SphereGeometry(r, 18, 12), mat, x, y, z);
    o.scale.y = sy;
    return o;
  };
  /** Posts and a rail `rail` m above a walking surface along z at `x`. */
  const handrail = (
    x: number,
    z0: number,
    z1: number,
    surface: (z: number) => number,
    rail: number,
    mat: string,
  ) => {
    const posts = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 1.2) + 1);
    for (let i = 0; i < posts; i++) {
      const z = z0 + ((z1 - z0) * i) / (posts - 1);
      rod([x, surface(z), z], [x, surface(z) + rail - 0.02, z], 0.018, mat);
    }
    rod(
      [x, surface(z0) + rail - 0.02, z0],
      [x, surface(z1) + rail - 0.02, z1],
      0.02,
      mat,
    );
  };

  if (spec.kind === 'stage-platform') {
    // A raised honey-wood deck on a dark plinth, its audience face hung with
    // a pleated cinnabar skirt under a gold nosing. Deck boards run along x.
    const deck = Number(p.deck ?? h),
      skirt = slot('skirt', red),
      shade = slot('skirtShade', 'adhc-cinnabar-deep');
    box(0, 0, -0.03, w - 0.04, 0.08, d - 0.1, dark);
    box(0, 0.08, -0.02, w - 0.02, deck - 0.125, d - 0.06, slot('carcass', 'adhc-honey-dark'));
    box(0, deck - 0.045, 0, w, 0.045, d, honey);
    for (let z = -d / 2 + 0.15; z < d / 2 - 0.05; z += 0.15)
      box(0, deck - 0.001, z, w - 0.02, 0.001, 0.006, slot('seam', 'adhc-honey-dark'));
    const pleat = 0.12,
      n = Math.floor((w - 0.02) / pleat);
    for (let i = 0; i < n; i++)
      box(
        -((n - 1) * pleat) / 2 + i * pleat,
        0.02,
        d / 2 - (i % 2 ? 0.012 : 0.02),
        pleat - 0.004,
        deck - 0.08,
        i % 2 ? 0.024 : 0.016,
        i % 2 ? skirt : shade,
      );
    box(0, deck - 0.06, d / 2 - 0.015, w, 0.03, 0.03, gold);
  } else if (spec.kind === 'stage-ramp') {
    // The stage's step-free approach: a 1:12 slope along local z rising to a
    // level top landing (deck height) at −z, a gold kick edge and a handrail
    // on the open side (−x); the +x side runs along the stage's face.
    const rise = Number(p.rise ?? 0.4),
      landing = Number(p.landing ?? 1.5),
      run = d - landing,
      railH = h - rise,
      z0 = -d / 2 + landing,
      surface = (z: number) =>
        z <= z0 ? rise : Math.max(0, rise * (1 - (z - z0) / run));
    box(0, 0, -d / 2 + landing / 2, w, rise - 0.004, landing, slot('carcass', 'adhc-honey-dark'));
    box(0, rise - 0.004, -d / 2 + landing / 2, w, 0.004, landing, slot('deck', 'adhc-honey'));
    const wedge = new T.Shape();
    wedge.moveTo(z0, 0);
    wedge.lineTo(z0, rise);
    wedge.lineTo(d / 2, 0);
    wedge.closePath();
    const slope = new T.ExtrudeGeometry(wedge, { depth: w, bevelEnabled: false });
    slope.rotateY(-Math.PI / 2);
    mesh(slope, slot('deck', 'adhc-honey'), w / 2, 0, 0);
    const edge = 12;
    for (let i = 0; i < edge; i++) {
      const za = -d / 2 + (i * d) / edge,
        zb = -d / 2 + ((i + 1) * d) / edge;
      rod(
        [-w / 2 + 0.012, surface(za) + 0.03, za],
        [-w / 2 + 0.012, surface(zb) + 0.03, zb],
        0.012,
        gold,
      );
    }
    handrail(-w / 2 + 0.06, -d / 2 + 0.05, d / 2 - 0.05, surface, railH, metal);
  } else if (spec.kind === 'stage-steps') {
    // Risers and treads up to the deck at −z, gold nosings, and three
    // handrails (both sides and the middle): two narrow lanes for walking
    // performers; wheelchairs and walkers take the ramp.
    const rise = Number(p.rise ?? 0.4),
      n = Math.max(2, Math.round(Number(p.risers ?? 3))),
      tread = d / n,
      riser = rise / n,
      railH = h - rise;
    for (let k = 0; k < n; k++) {
      const z = d / 2 - (k + 0.5) * tread;
      box(0, 0, z, w, (k + 1) * riser, tread, honey);
      box(0, (k + 1) * riser - 0.012, z + tread / 2 - 0.02, w, 0.012, 0.04, gold);
    }
    const surface = (z: number) =>
      Math.min(rise, Math.max(riser, riser * Math.ceil((d / 2 - z) / tread)));
    const rails = p.centerRail === false ? [-1, 1] : [-1, 0, 1];
    for (const s of rails)
      handrail((s * (w - 0.05)) / 2, -d / 2 + 0.04, d / 2 - 0.04, surface, railH, metal);
  } else if (spec.kind === 'stage-backdrop') {
    // Honey-wood posts and header, a pleated cinnabar curtain, a gold
    // valance hung with small paper lanterns, festive banners on the posts
    // and a gold medallion at the centre.
    const post = 0.16,
      head = 0.3,
      zc = -d / 2 + 0.1,
      curtainH = h - head,
      inner = w - 2 * post,
      pleat = 0.18,
      n = Math.floor(inner / pleat);
    for (const s of [-1, 1]) {
      box((s * (w - post)) / 2, 0, -d / 2 + 0.1, post, h, 0.2, honey);
      box((s * (w - post)) / 2, 0.35, -d / 2 + 0.215, post - 0.02, h - 0.85, 0.03, red);
      box((s * (w - post)) / 2, 0.33, -d / 2 + 0.23, post, 0.04, 0.02, gold);
      box((s * (w - post)) / 2, h - 0.52, -d / 2 + 0.23, post, 0.04, 0.02, gold);
    }
    box(0, h - head, -d / 2 + 0.1, w, head, 0.2, honey);
    box(0, h - head + 0.04, -d / 2 + 0.215, w - 0.1, head - 0.08, 0.03, gold);
    for (let i = 0; i < n; i++)
      box(
        -((n - 1) * pleat) / 2 + i * pleat,
        0,
        zc + (i % 2 ? 0.03 : 0),
        pleat - 0.006,
        curtainH,
        0.06,
        i % 2 ? red : slot('curtainShade', 'adhc-cinnabar-deep'),
      );
    const disc = mesh(
      new T.CylinderGeometry(0.45, 0.45, 0.03, 32),
      gold,
      0,
      curtainH * 0.62,
      zc + 0.08,
    );
    disc.rotation.x = Math.PI / 2;
    const inset = mesh(
      new T.CylinderGeometry(0.32, 0.32, 0.034, 32),
      red,
      0,
      curtainH * 0.62,
      zc + 0.08,
    );
    inset.rotation.x = Math.PI / 2;
    const lanterns = Math.max(3, Math.round(inner / 1.1));
    for (let i = 0; i < lanterns; i++) {
      const x = -inner / 2 + ((i + 0.5) * inner) / lanterns,
        z = d / 2 - 0.12;
      rod([x, h - head, z], [x, h - head - 0.2, z], 0.004, gold);
      cyl(x, h - head - 0.22, z, 0.06, 0.03, gold);
      ball(x, h - head - 0.33, z, 0.12, slot('lantern', 'adhc-lantern'), 1.15);
      cyl(x, h - head - 0.5, z, 0.05, 0.03, gold);
    }
  } else if (spec.kind === 'choir-riser') {
    // Carpeted tiers rising toward −z, each with a gold edge on its front.
    const n = Math.max(1, Math.round(Number(p.tiers ?? 3))),
      rise = Number(p.tierRise ?? h / n),
      depth = d / n,
      carpet = slot('carpet', 'adhc-riser-carpet');
    for (let k = 0; k < n; k++) {
      const z = d / 2 - (k + 0.5) * depth;
      box(0, 0, z, w, (k + 1) * rise, depth, carpet);
      box(0, (k + 1) * rise - 0.015, z + depth / 2 - 0.02, w, 0.015, 0.04, gold);
      for (const s of [-1, 1])
        box((s * (w - 0.04)) / 2, 0, z, 0.04, (k + 1) * rise - 0.016, depth - 0.02, dark);
    }
  } else if (spec.kind === 'lectern') {
    // Weighted base, tapered honey column, a reading top sloping down toward
    // the speaker (−z) and a gold medallion on the audience face (+z).
    box(0, 0, 0, w * 0.9, 0.05, d, dark, 0.01);
    box(0, 0.05, 0.02, w * 0.62, h - 0.16, d * 0.55, honey, 0.02);
    box(0, 0.05, d * 0.29, w * 0.66, h - 0.2, 0.02, red);
    const top = box(0, h - 0.09, 0, w, 0.04, d * 0.86, honey, 0.01);
    top.rotation.x = -0.24;
    box(0, h - 0.13, -d * 0.36, w * 0.9, 0.03, 0.03, gold);
    const medal = mesh(
      new T.CylinderGeometry(0.09, 0.09, 0.02, 24),
      gold,
      0,
      h * 0.55,
      d * 0.29 + 0.02,
    );
    medal.rotation.x = Math.PI / 2;
  } else if (spec.kind === 'upright-piano') {
    // Black-lacquered upright: cabinet, keybed toward +z with white and
    // black keys, music desk, legs, gold pedals and lid inlay.
    const keyH = 0.72,
      body = d * 0.55,
      zb = -d / 2 + body / 2,
      zk = d / 2 - (d - body) / 2;
    box(0, 0.02, zb, w, h - 0.06, body, dark, 0.012);
    box(0, keyH - 0.05, zk, w, 0.05, d - body, dark, 0.008);
    box(0, keyH, zk + 0.01, w - 0.12, 0.022, d - body - 0.06, slot('keys', 'photo-white'));
    const blacks = new Set([1, 2, 4, 5, 6]);
    for (let i = 0; i < 35; i++) {
      if (!blacks.has(i % 7)) continue;
      const x = -w / 2 + 0.06 + (i * (w - 0.12)) / 35;
      box(x, keyH + 0.022, zk - 0.02, 0.014, 0.012, (d - body) * 0.45, dark);
    }
    box(0, keyH + 0.2, zb + body / 2 + 0.01, w * 0.5, 0.18, 0.02, dark);
    for (const s of [-1, 1]) {
      box((s * (w - 0.06)) / 2, 0, d / 2 - 0.05, 0.05, keyH - 0.05, 0.05, dark);
      box((s * (w - 0.06)) / 2, 0, d / 2 - 0.08, 0.06, 0.04, 0.16, dark);
    }
    for (const x of [-0.08, 0, 0.08])
      box(x, 0.06, zb + body / 2 + 0.02, 0.025, 0.012, 0.06, gold);
    box(0, h - 0.04, zb, w, 0.04, body, dark, 0.01);
    box(0, keyH + 0.47, zb + body / 2 + 0.002, w * 0.86, 0.012, 0.004, gold);
  } else if (spec.kind === 'piano-bench') {
    // Padded bench on four lacquered legs; faces −z like a chair.
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05])
      for (const z of [-d / 2 + 0.05, d / 2 - 0.05])
        box(x, 0, z, 0.045, h - 0.07, 0.045, dark);
    box(0, h - 0.11, 0, w, 0.06, d, dark, 0.01);
    box(0, h - 0.06, 0, w - 0.02, 0.06, d - 0.02, slot('cushion', 'adhc-cinnabar'), 0.025);
  } else if (spec.kind === 'banquet-table') {
    // An 8 ft folding table under a tablecloth that drops 0.45 m: draped
    // sides, a gold runner and small centrepieces (lacquer tray, vase,
    // flowers). `top` is the table height; the declared height includes the
    // flowers.
    const cloth = slot('cloth', 'adhc-cloth-red'),
      runner = slot('runner', 'adhc-runner-gold'),
      top = Number(p.top ?? 0.76),
      drop = Number(p.drop ?? 0.45);
    for (const x of [-w / 2 + 0.25, w / 2 - 0.25])
      for (const z of [-d / 2 + 0.12, d / 2 - 0.12])
        rod([x, 0, z], [x, top - 0.04, z], 0.016, metal);
    box(0, top - 0.035, 0, w, 0.035, d, cloth, 0.01);
    for (const s of [-1, 1]) {
      box(0, top - drop, (s * (d - 0.012)) / 2, w, drop - 0.03, 0.012, cloth);
      box((s * (w - 0.012)) / 2, top - drop, 0, 0.012, drop - 0.03, d - 0.024, cloth);
    }
    box(0, top, 0, w - 0.3, 0.004, d * 0.36, runner);
    const pieces = Math.max(1, Math.round(w / 1.2)),
      bloom = Math.max(0.03, (h - top - 0.07) / 2);
    for (let i = 0; i < pieces; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / pieces;
      cyl(x, top + 0.004, 0, 0.11, 0.012, dark, 0.11, 24);
      cyl(x, top + 0.016, 0, 0.03, 0.05, slot('vase', 'adhc-jade'), 0.02);
      ball(x, h - bloom, 0, bloom, slot('flower', 'adhc-cinnabar'));
      ball(x - 0.05, top + 0.05, 0.03, 0.035, slot('leaf', 'adhc-jade'));
      ball(x + 0.05, top + 0.05, -0.03, 0.035, slot('flower2', 'adhc-gold'));
    }
  } else if (spec.kind === 'banquet-chair') {
    // Stackable chiavari-style banquet chair: gold frame, ladder back at +z,
    // jade seat cushion; faces −z.
    const seat = Number(p.seatHeight ?? 0.46),
      cushion = slot('cushion', 'adhc-jade'),
      r = 0.012,
      xl = w / 2 - r,
      zf = -d / 2 + r,
      zb = d / 2 - r;
    for (const x of [-xl, xl]) {
      rod([x, 0, zf], [x, seat - 0.03, zf + 0.02], r, gold);
      rod([x, 0, zb], [x, h - 0.03, zb - 0.02], r, gold);
      rod([x, seat * 0.4, zf + 0.01], [x, seat * 0.4, zb - 0.01], 0.007, gold);
    }
    box(0, seat - 0.05, 0, w, 0.025, d - 0.06, gold, 0.006);
    box(0, seat - 0.025, -0.01, w - 0.05, 0.05, d - 0.1, cushion, 0.02);
    for (const y of [seat + 0.12, seat + 0.24])
      rod([-xl, y, zb - 0.015], [xl, y, zb - 0.015], 0.008, gold);
    rod([-xl, h - 0.016, zb - 0.02], [xl, h - 0.016, zb - 0.02], 0.016, gold);
    for (const x of [-0.08, 0, 0.08])
      rod(
        [x * (w / 0.45), seat + 0.02, zb - 0.015],
        [x * (w / 0.45), h - 0.03, zb - 0.02],
        0.006,
        gold,
      );
  } else if (spec.kind === 'dance-floor') {
    // A parquet inlay set flush in the hall floor: two honey tones in a
    // checker, a cinnabar border with a gold pinstripe, and a jade-and-gold
    // medallion at the centre. 12 mm thick; people dance on it.
    const border = Number(p.border ?? 0.3),
      tile = Number(p.tile ?? 0.6),
      iw = w - 2 * border,
      id = d - 2 * border,
      nx = Math.max(2, Math.round(iw / tile)),
      nz = Math.max(2, Math.round(id / tile)),
      tw = iw / nx,
      td = id / nz;
    box(0, 0, 0, w, 0.006, d, red);
    box(0, 0.006, 0, iw, 0.003, id, slot('tileA', 'adhc-dance-a'));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        if ((i + j) % 2)
          box(
            -iw / 2 + (i + 0.5) * tw,
            0.006,
            -id / 2 + (j + 0.5) * td,
            tw,
            0.004,
            td,
            slot('tileB', 'adhc-dance-b'),
          );
    for (const s of [-1, 1]) {
      box(0, 0.006, (s * (id + 0.08)) / 2, iw + 0.12, 0.004, 0.035, gold);
      box((s * (iw + 0.08)) / 2, 0.006, 0, 0.035, 0.004, id + 0.12, gold);
    }
    const r = Math.min(iw, id) * 0.24;
    cyl(0, 0.0095, 0, r, 0.0015, gold, r, 48);
    cyl(0, 0.0105, 0, r * 0.86, 0.0012, red, r * 0.86, 48);
    cyl(0, 0.011, 0, r * 0.62, 0.001, slot('medallion', 'adhc-jade'), r * 0.62, 48);
  } else if (spec.kind === 'lantern-post') {
    // A lacquered post on a round foot with a gold-capped arm toward +z
    // carrying a glowing red paper lantern and its tassel.
    const lantern = slot('lantern', 'adhc-lantern'),
      lr = w / 2,
      armZ = d / 2 - lr,
      postZ = -d / 2 + 0.12;
    cyl(0, 0, postZ, 0.12, 0.04, dark, 0.1, 24);
    cyl(0, 0.04, postZ, 0.03, h - 0.08, dark, 0.025);
    cyl(0, h - 0.06, postZ, 0.045, 0.06, gold, 0.03);
    rod([0, h - 0.1, postZ], [0, h - 0.1, armZ], 0.018, dark);
    rod([0, h - 0.1, armZ], [0, h - 0.24, armZ], 0.006, gold);
    cyl(0, h - 0.27, armZ, 0.07, 0.03, gold);
    ball(0, h - 0.27 - lr * 1.1, armZ, lr, lantern, 1.1);
    cyl(0, h - 0.29 - lr * 2.2, armZ, 0.07, 0.03, gold);
    cyl(0, h - 0.6 - lr * 2.2, armZ, 0.012, 0.3, red, 0.02);
  } else if (spec.kind === 'bingo-board') {
    // A free-standing flashboard: five coloured B-I-N-G-O header blocks and
    // a 5 × 14 number grid with the called numbers lit, on two legs;
    // display at +z.
    const legs = 0.75,
      panelH = h - legs,
      lit = slot('lit', 'adhc-lantern'),
      cell = slot('cell', 'adhc-paper');
    for (const s of [-1, 1]) {
      box((s * (w - 0.08)) / 2, 0, 0, 0.06, legs + 0.05, 0.06, dark);
      box((s * (w - 0.08)) / 2, 0, 0, 0.08, 0.03, d, dark);
    }
    box(0, legs, -0.02, w, panelH, 0.1, dark, 0.02);
    const heads = [
      slot('b', 'adhc-cinnabar'),
      slot('i', 'adhc-gold'),
      slot('n', 'adhc-jade'),
      slot('g', 'adhc-sky'),
      slot('o', 'adhc-terracotta'),
    ];
    const cw = (w - 0.12) / 15,
      ch = (panelH - 0.3) / 5;
    heads.forEach((m, r) =>
      box(-w / 2 + 0.06 + cw / 2, legs + 0.08 + (4 - r) * ch, 0.035, cw * 0.9, ch * 0.8, 0.012, m),
    );
    for (let r = 0; r < 5; r++)
      for (let c = 1; c < 15; c++)
        box(
          -w / 2 + 0.06 + (c + 0.5) * cw,
          legs + 0.08 + (4 - r) * ch,
          0.035,
          cw * 0.78,
          ch * 0.7,
          0.008,
          (r * 7 + c * 3) % 5 === 0 ? lit : cell,
        );
    box(0, h - 0.18, 0.035, w * 0.5, 0.12, 0.012, gold);
  } else if (spec.kind === 'bingo-caller') {
    // The caller's stand: a honey table with a red front (+z), the ball
    // blower's clear cage on its base, a rack of called balls and a
    // gooseneck microphone; the caller stands at −z.
    const top = 0.78,
      balls = [
        slot('ball1', 'adhc-cinnabar'),
        gold,
        slot('ball2', 'adhc-jade'),
        slot('ball3', 'adhc-sky'),
        slot('ball4', 'photo-white'),
      ];
    box(0, 0, -0.05, w, top - 0.03, d - 0.1, honey, 0.01);
    box(0, 0.06, d / 2 - 0.06, w - 0.04, top - 0.12, 0.02, red);
    box(0, top - 0.03, 0, w, 0.03, d, honey, 0.01);
    cyl(-w * 0.22, top, 0, 0.12, 0.08, red, 0.1, 24);
    ball(-w * 0.22, top + 0.21, 0, 0.13, slot('glass', 'glass'));
    for (let i = 0; i < 6; i++)
      ball(
        -w * 0.22 + ((i % 3) - 1) * 0.05,
        top + 0.13 + Math.floor(i / 3) * 0.06,
        ((i % 2) - 0.5) * 0.05,
        0.022,
        balls[i % 5],
      );
    box(w * 0.18, top, 0.05, w * 0.42, 0.03, d * 0.4, dark, 0.005);
    for (let i = 0; i < 10; i++)
      ball(
        w * 0.18 - w * 0.17 + (i % 5) * w * 0.085,
        top + 0.052,
        0.05 + (Math.floor(i / 5) - 0.5) * 0.09,
        0.022,
        balls[i % 5],
      );
    cyl(w * 0.4, top, -d * 0.3, 0.05, 0.02, dark);
    rod([w * 0.4, top + 0.02, -d * 0.3], [w * 0.4, h - 0.06, -d * 0.36], 0.007, metal);
    ball(w * 0.4, h - 0.03, -d * 0.36, 0.03, dark);
  } else if (spec.kind === 'calligraphy-table') {
    // A walnut worktable laid for brush calligraphy: black felt mats with
    // rice paper at each place along both long sides (±z), ink stones and
    // brush rests, and a brush rack with hanging brushes down the middle.
    // `top` is the work surface; the declared height includes the rack.
    const top = Number(p.top ?? 0.74) - 0.04,
      places = Math.max(1, Math.round(Number(p.placesPerSide ?? 3))),
      pitch = w / places,
      wood = slot('top', 'adhc-walnut'),
      ink = slot('ink', 'adhc-ink');
    for (const x of [-w / 2 + 0.08, w / 2 - 0.08])
      for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) box(x, 0, z, 0.06, top, 0.06, wood);
    box(0, top - 0.08, 0, w - 0.1, 0.08, d - 0.1, wood);
    box(0, top, 0, w, 0.04, d, wood, 0.008);
    for (let i = 0; i < places; i++) {
      const x = -w / 2 + (i + 0.5) * pitch;
      for (const s of [-1, 1]) {
        const z = s * (d / 2 - 0.2);
        box(x, top + 0.04, z, pitch * 0.82, 0.004, 0.34, slot('felt', 'adhc-felt'));
        box(x, top + 0.044, z, pitch * 0.62, 0.002, 0.26, slot('paper', 'adhc-paper'));
        for (let k = 0; k < 3; k++)
          box(x - pitch * 0.18 + k * pitch * 0.18, top + 0.046, z - s * 0.02, 0.05, 0.001, 0.12, ink);
        box(x + pitch * 0.38, top + 0.04, z - s * 0.08, 0.08, 0.02, 0.12, ink, 0.005);
        rod([x - pitch * 0.38, top + 0.06, z - s * 0.05], [x - pitch * 0.38, top + 0.06, z - s * 0.17], 0.006, honey);
      }
    }
    const rack = h - 0.01;
    for (const x of [-w * 0.3, w * 0.3]) rod([x, top + 0.04, 0], [x, rack, 0], 0.01, honey);
    rod([-w * 0.3, rack, 0], [w * 0.3, rack, 0], 0.01, honey);
    for (let i = 0; i < 9; i++) {
      const x = -w * 0.26 + (i * w * 0.52) / 8;
      rod([x, rack - 0.01, 0], [x, rack - 0.17, 0], 0.006, honey);
      cyl(x, rack - 0.21, 0, 0.01, 0.04, ink, 0.004);
    }
  } else if (spec.kind === 'brush-stand') {
    // A low walnut cabinet with a brush rack (hanging brushes) and ink jars.
    const cab = h * 0.62,
      ink = slot('ink', 'adhc-ink');
    box(0, 0, 0, w, cab, d, slot('body', 'adhc-walnut'), 0.01);
    for (const s of [-1, 1])
      box((s * w) / 4, 0.06, d / 2 - 0.005, w / 2 - 0.03, cab - 0.12, 0.01, honey);
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06])
      rod([x, cab, -d / 4], [x, h - 0.012, -d / 4], 0.012, honey);
    rod([-w / 2 + 0.06, h - 0.012, -d / 4], [w / 2 - 0.06, h - 0.012, -d / 4], 0.012, honey);
    for (let i = 0; i < 8; i++) {
      const x = -w / 2 + 0.14 + (i * (w - 0.28)) / 7;
      rod([x, h - 0.03, -d / 4], [x, h - 0.2, -d / 4], 0.006, honey);
      cyl(x, h - 0.26, -d / 4, 0.012, 0.06, ink, 0.004);
    }
    for (let i = 0; i < 3; i++)
      cyl(-w * 0.25 + i * w * 0.25, cab, d / 4, 0.04, 0.08, i === 1 ? red : ink);
  } else if (spec.kind === 'easel') {
    // An A-frame studio easel: two splayed front legs, a back leg, a ledge
    // and a clamp holding a canvas with a painted landscape facing +z.
    const canvasW = w * 0.82,
      canvasH = h * 0.4,
      ledge = h * 0.45,
      r = 0.015,
      zf = d / 2 - r,
      zt = 0.04,
      lean = Math.atan2(zf - zt, h),
      at = (y: number) => zf - ((zf - zt) * y) / h;
    for (const s of [-1, 1])
      rod([s * (w / 2 - r), 0, zf], [s * 0.05, h - r, zt], r, honey);
    rod([0, 0, -d / 2 + r], [0, h * 0.7, zt - 0.03], r, honey);
    rod([0, 0.3, at(0.3)], [0, h - r, zt], r, honey);
    box(0, ledge - 0.035, at(ledge) + 0.03, canvasW, 0.035, 0.07, honey);
    const panelY = ledge + canvasH / 2;
    const panel = mesh(
      new T.BoxGeometry(canvasW, canvasH, 0.025),
      slot('canvas', 'adhc-canvas'),
      0,
      panelY,
      at(panelY) + 0.03,
    );
    panel.rotation.x = -lean;
    const paint = (u: number, v: number, a: number, b: number, m: string) => {
      const y = panelY + v,
        o = mesh(new T.BoxGeometry(a, b, 0.004), m, u, y, at(y) + 0.045);
      o.rotation.x = -lean;
    };
    paint(0, canvasH * 0.2, canvasW * 0.88, canvasH * 0.5, slot('sky', 'adhc-sky'));
    paint(-canvasW * 0.18, -canvasH * 0.12, canvasW * 0.5, canvasH * 0.3, slot('hills', 'adhc-jade'));
    paint(canvasW * 0.2, -canvasH * 0.2, canvasW * 0.44, canvasH * 0.24, slot('hills2', 'adhc-leaf'));
    paint(canvasW * 0.26, canvasH * 0.3, canvasW * 0.12, canvasH * 0.12, red);
    box(0, ledge + canvasH, at(ledge + canvasH) + 0.03, 0.08, 0.05, 0.06, honey);
  } else if (spec.kind === 'drying-rack') {
    // A wire drying rack: four uprights on feet and shelves of drying paintings.
    const n = Math.max(3, Math.round(Number(p.shelves ?? 8))),
      paper = slot('paper', 'adhc-paper'),
      colors = [slot('paint1', 'adhc-jade'), red, slot('paint2', 'adhc-sky'), gold];
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03])
      for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) {
        cyl(x, 0, z, 0.03, 0.04, dark);
        rod([x, 0.04, z], [x, h, z], 0.012, metal);
      }
    for (let k = 0; k < n; k++) {
      const y = 0.2 + (k * (h - 0.3)) / (n - 1);
      for (const z of [-d / 2 + 0.03, d / 2 - 0.03])
        rod([-w / 2 + 0.03, y, z], [w / 2 - 0.03, y, z], 0.006, metal);
      box(0, y + 0.007, 0, w - 0.12, 0.003, d - 0.1, paper);
      box(-w * 0.12 + (k % 3) * w * 0.1, y + 0.01, 0.02, w * 0.36, 0.002, d * 0.4, colors[k % colors.length]);
    }
  } else if (spec.kind === 'scroll-display') {
    // A low honey stand with a crossbar from which hang calligraphy scrolls:
    // silk mounts, rice paper with columns of ink strokes, a red seal and
    // wooden rollers.
    const base = 0.12,
      bar = h - 0.02,
      scrolls = Math.max(1, Math.round(Number(p.scrolls ?? 3))),
      bay = (w - 0.3) / scrolls,
      sw = bay - 0.12,
      ink = slot('ink', 'adhc-ink');
    box(0, 0, 0, w, base, d, honey, 0.01);
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) box(x, base, -d / 4, 0.05, h - base, 0.05, honey);
    rod([-w / 2 + 0.03, bar, -d / 4], [w / 2 - 0.03, bar, -d / 4], 0.02, honey);
    for (let i = 0; i < scrolls; i++) {
      const x = -w / 2 + 0.15 + (i + 0.5) * bay,
        top = bar - 0.06,
        len = h - base - 0.25,
        z = -d / 4 + 0.03;
      rod([x, bar, -d / 4], [x, top + 0.02, z], 0.004, gold);
      rod([x - sw / 2 - 0.02, top, z], [x + sw / 2 + 0.02, top, z], 0.012, dark);
      box(x, top - len, z, sw, len, 0.006, slot('mount', 'adhc-jade-light'));
      box(x, top - len + 0.05, z + 0.004, sw * 0.78, len - 0.12, 0.002, slot('paper', 'adhc-paper'));
      for (let k = 0; k < 6; k++)
        box(x + (k % 2 ? 0.05 : -0.05) * (sw / 0.4), top - len * (0.25 + k * 0.1), z + 0.006, 0.025, len * 0.07, 0.001, ink);
      box(x, top - len * 0.88, z + 0.006, 0.04, 0.04, 0.001, red);
      rod([x - sw / 2 - 0.03, top - len - 0.01, z], [x + sw / 2 + 0.03, top - len - 0.01, z], 0.015, dark);
    }
  } else if (spec.kind === 'whiteboard') {
    // A mobile whiteboard on castors: aluminium frame, white board facing +z
    // with a few lines written on it, and a marker tray.
    const bottom = 0.75,
      board = slot('board', 'adhc-board');
    for (const s of [-1, 1]) {
      const x = (s * (w - 0.06)) / 2;
      rod([x, 0.08, 0], [x, h - 0.018, 0], 0.018, metal);
      box(x, 0.05, 0, 0.05, 0.03, d, metal);
      for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) cyl(x, 0, z, 0.03, 0.05, dark);
    }
    box(0, bottom, 0, w - 0.1, h - bottom - 0.05, 0.04, metal, 0.008);
    box(0, bottom + 0.02, 0.022, w - 0.16, h - bottom - 0.09, 0.004, board);
    for (let k = 0; k < 4; k++)
      box(-w * 0.12, h - 0.25 - k * 0.17, 0.026, w * (0.55 - k * 0.08), 0.02, 0.001, k === 0 ? red : slot('marker', 'adhc-sky'));
    box(w * 0.28, bottom + 0.35, 0.026, 0.22, 0.22, 0.001, slot('marker2', 'adhc-jade'));
    box(0, bottom - 0.02, 0.05, w - 0.3, 0.025, 0.07, metal);
  } else if (spec.kind === 'recumbent-bike') {
    // A recumbent exercise bike: low frame, seat with backrest at −z, pedal
    // cranks and flywheel housing at +z, console on a post facing the rider.
    const seatY = 0.5,
      seatZ = -d / 2 + 0.4,
      seat = slot('seat', 'adhc-jade');
    box(0, 0, 0, w * 0.4, 0.08, d - 0.1, dark, 0.02);
    for (const z of [-d / 2 + 0.04, d / 2 - 0.04]) box(0, 0, z, w, 0.05, 0.08, dark, 0.01);
    box(0, 0.08, seatZ, 0.12, seatY - 0.12, 0.14, metal);
    box(0, seatY - 0.06, seatZ, w * 0.8, 0.09, 0.42, seat, 0.03);
    const back = box(0, seatY, -d / 2 + 0.12, w * 0.78, 0.5, 0.1, seat, 0.04);
    back.rotation.x = 0.28;
    box(0, 0.08, d / 2 - 0.3, w * 0.5, 0.34, 0.42, slot('housing', 'photo-white'), 0.06);
    for (const s of [-1, 1]) {
      rod([s * 0.14, 0.3, d / 2 - 0.2], [s * 0.22, 0.36, d / 2 - 0.28], 0.014, metal);
      box(s * 0.25, 0.32, d / 2 - 0.28, 0.08, 0.025, 0.12, dark);
      rod([s * (w / 2 - 0.05), seatY - 0.02, seatZ], [s * (w / 2 - 0.05), seatY - 0.02, seatZ + 0.25], 0.014, dark);
    }
    rod([0, 0.4, d / 2 - 0.22], [0, h - 0.14, d / 2 - 0.34], 0.025, metal);
    const screen = box(0, h - 0.17, d / 2 - 0.36, 0.3, 0.17, 0.05, dark, 0.01);
    screen.rotation.x = 0.4;
  } else if (spec.kind === 'band-wall') {
    // A jade wall panel with three anchor rails and coloured resistance
    // bands looped from them, and a low shelf of hand weights (+z face).
    const panel = slot('panel', 'adhc-jade'),
      colors = [
        slot('band1', 'adhc-gold'),
        red,
        slot('band2', 'adhc-sky'),
        slot('band3', 'adhc-terracotta'),
      ];
    box(0, 0, -d / 2 + 0.03, w, h, 0.06, panel, 0.01);
    [0.45, 1.05, 1.6].forEach((y, row) => {
      box(0, y, -d / 2 + 0.08, w - 0.2, 0.04, 0.04, metal);
      for (let i = 0; i < 5; i++) {
        const x = -w / 2 + 0.3 + (i * (w - 0.6)) / 4;
        box(x, y - 0.32, -d / 2 + 0.11, 0.025, 0.32, 0.01, colors[(i + row) % 4]);
        box(x, y - 0.36, -d / 2 + 0.11, 0.09, 0.04, 0.025, dark, 0.008);
      }
    });
    box(0, 0.18, 0.03, w * 0.6, 0.03, d - 0.06, honey);
    for (let i = 0; i < 4; i++)
      box(-w * 0.2 + i * w * 0.13, 0.21, 0.04, 0.1, 0.06, 0.08, colors[i], 0.02);
  } else if (spec.kind === 'practice-stair') {
    // A short training stair: steps up from +z to a platform at −z,
    // handrails on both sides.
    const rise = Number(p.rise ?? 0.45),
      n = Math.max(2, Math.round(Number(p.risers ?? 3))),
      platform = Number(p.platform ?? 0.6),
      tread = (d - platform) / n,
      riser = rise / n,
      railH = h - rise;
    box(0, 0, -d / 2 + platform / 2, w, rise, platform, honey);
    for (let k = 0; k < n; k++) {
      const z = d / 2 - (k + 0.5) * tread;
      box(0, 0, z, w, (k + 1) * riser, tread, honey);
      box(0, (k + 1) * riser - 0.01, z + tread / 2 - 0.02, w, 0.01, 0.04, slot('nosing', 'adhc-jade'));
    }
    const surface = (z: number) =>
      z <= -d / 2 + platform
        ? rise
        : Math.min(rise, Math.max(riser, riser * Math.ceil((d / 2 - z) / tread)));
    for (const s of [-1, 1])
      handrail((s * (w - 0.04)) / 2, -d / 2 + 0.04, d / 2 - 0.04, surface, railH, metal);
  } else if (spec.kind === 'reception-desk') {
    // A welcome desk: a cinnabar front with a gold band toward visitors
    // (+z), a raised honey transaction ledge, a lower jade-topped work
    // surface at −z with a monitor and papers.
    const work = 0.75,
      ledgeD = 0.3;
    box(0, 0, d / 2 - ledgeD / 2, w, h - 0.04, ledgeD, red, 0.01);
    box(0, h * 0.62, d / 2 - 0.002, w - 0.02, 0.05, 0.004, gold);
    box(0, h - 0.04, d / 2 - ledgeD / 2 - 0.01, w, 0.04, ledgeD + 0.02, honey, 0.008);
    for (const s of [-1, 1])
      box((s * (w - 0.05)) / 2, 0, -ledgeD / 2, 0.05, work - 0.03, d - ledgeD, red);
    box(0, work - 0.03, -ledgeD / 2, w - 0.02, 0.03, d - ledgeD, slot('top', 'adhc-jade-light'), 0.006);
    box(0, work, -d / 2 + 0.16, 0.18, 0.012, 0.12, dark);
    box(0, work + 0.012, -d / 2 + 0.16, 0.03, 0.06, 0.03, dark);
    box(0, h - 0.25, -d / 2 + 0.17, 0.42, 0.25, 0.025, dark, 0.008);
    box(-w * 0.28, work, -d / 2 + 0.25, 0.3, 0.012, 0.2, slot('paper', 'adhc-paper'));
  }
  const bounds = new T.Box3().setFromObject(g),
    size = bounds.getSize(new T.Vector3()),
    mid = bounds.getCenter(new T.Vector3());
  g.position.set(-mid.x, -bounds.min.y, -mid.z);
  const fit = new T.Group();
  fit.name = 'fit';
  fit.scale.set(w / size.x, h / size.y, d / size.z);
  fit.add(g);
  const root = new T.Group();
  root.name = spec.kind;
  root.add(fit);
  return root;
}
