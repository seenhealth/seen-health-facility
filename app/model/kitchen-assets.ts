import * as T from 'three';
import type { Asset } from './schema';

/**
 * Commercial kitchen, serving-line and staff-kitchenette equipment from the
 * October 2026 owner walkthrough (the owner's photo of the Alhambra kitchen,
 * the dining pass-through as a heated serving line, the staff lounge's
 * kitchenette and breakfast bar). Each piece is modelled at its declared
 * dimensions around a floor-centred origin with its usable face toward local
 * +Z (doors, tray slide, screen) and nothing standing proud of the declared
 * box, so assets.ts fits it at scale 1 like every other family. Proportions
 * follow standard products, not a verified schedule.
 */
export const KITCHEN_ASSET_KINDS = [
  'three-compartment-sink',
  'dish-machine',
  'hand-sink',
  'stainless-work-table',
  'reach-in-refrigerator',
  'warming-cabinet',
  'steam-table',
  'wall-tv',
  'microwave',
  'pantry-cabinet',
  'bar-partition',
] as const;

export function buildKitchenAsset(
  spec: Asset,
  material: (id: string) => T.MeshStandardMaterial,
): T.Group | null {
  if (!(KITCHEN_ASSET_KINDS as readonly string[]).includes(spec.kind))
    return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions,
    p = spec.parameters || {};
  const slot = (name: string, fallback: string) =>
    spec.materials?.[name] || fallback;
  const steel = spec.material,
    dark = slot('dark', 'photo-black'),
    white = slot('white', 'photo-white'),
    bin = slot('bin', 'kitchen-bin-grey'),
    glass = slot('glass', 'glass'),
    wood = slot('wood', 'photo-white'),
    panel = slot('panel', 'lounge-tan');
  // Food, indicator lights and picture content are inline colours, like the
  // day room's props: they are not finishes a facility would swap.
  const inline = new Map<string, T.MeshStandardMaterial>();
  const paint = (color: string, emissive = 0) => {
    const key = color + emissive;
    if (!inline.has(key))
      inline.set(
        key,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.7,
          emissive: emissive ? color : '#000000',
          emissiveIntensity: emissive,
        }),
      );
    return inline.get(key)!;
  };
  const add = (
    geo: T.BufferGeometry,
    mat: string | T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new T.Mesh(geo, typeof mat === 'string' ? material(mat) : mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  /** A box standing on `y`. */
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    mat: string | T.Material,
  ) => add(new T.BoxGeometry(a, b, c), mat, x, y + b / 2, z);
  /** A vertical cylinder standing on `y`. */
  const cyl = (
    x: number,
    y: number,
    z: number,
    r: number,
    len: number,
    mat: string | T.Material,
    top = r,
    segments = 20,
  ) =>
    add(new T.CylinderGeometry(top, r, len, segments), mat, x, y + len / 2, z);
  /** A tube between two points. */
  const tube = (
    a: [number, number, number],
    b: [number, number, number],
    r: number,
    mat: string | T.Material,
  ) => {
    const v = new T.Vector3(...a),
      u = new T.Vector3(...b),
      delta = u.clone().sub(v),
      mid = u.clone().add(v).multiplyScalar(0.5);
    const o = add(
      new T.CylinderGeometry(r, r, delta.length(), 10),
      mat,
      mid.x,
      mid.y,
      mid.z,
    );
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return o;
  };
  const ball = (
    x: number,
    y: number,
    z: number,
    r: number,
    mat: string | T.Material,
    sy = 1,
    sx = 1,
    sz = 1,
  ) => {
    const o = add(new T.SphereGeometry(r, 14, 10), mat, x, y, z);
    o.scale.set(sx, sy, sz);
    return o;
  };
  /** A knob on a face that looks along +Z or −Z. */
  const knob = (x: number, y: number, z: number, r: number, len: number, mat: string | T.Material) => {
    const k = add(new T.CylinderGeometry(r, r, len, 16), mat, x, y, z);
    k.rotation.x = Math.PI / 2;
    return k;
  };
  /** Four tubular legs with adjustable feet, from the floor to `top`. */
  const legs = (top: number, inset = 0.05, r = 0.019) => {
    for (const x of [-w / 2 + inset, w / 2 - inset])
      for (const z of [-d / 2 + inset, d / 2 - inset]) {
        cyl(x, 0.03, z, r, top - 0.03, steel);
        cyl(x, 0, z, 0.024, 0.03, dark);
      }
  };
  /** A dark recess reading as a sink bowl: its top sits just above the rim. */
  const recess = (x: number, rim: number, z: number, a: number, c: number) =>
    box(x, rim - 0.3, z, a, 0.303, c, paint('#3a4042'));
  /** A swing faucet: riser, spout reaching `reach` along +Z, two handles. */
  const faucet = (x: number, y: number, z: number, rise: number, reach = 0.16) => {
    cyl(x, y, z, 0.011, rise, steel);
    tube([x, y + rise - 0.011, z], [x, y + rise - 0.011, z + reach], 0.011, steel);
    tube([x, y + rise - 0.011, z + reach], [x, y + rise - 0.08, z + reach], 0.009, steel);
    for (const s of [-0.05, 0.05]) box(x + s, y + 0.02, z, 0.02, 0.05, 0.02, dark);
  };

  if (spec.kind === 'three-compartment-sink') {
    // Three bowls between two drainboards, backsplash, two swing faucets and
    // a pre-rinse riser with its spring hose and spray head (the riser top
    // sets the height).
    const rim = 0.9,
      board = 0.33,
      bowls = 3,
      bw = (w - 2 * board) / bowls;
    legs(rim - 0.04);
    box(0, rim - 0.02, 0, w, 0.02, d, steel);
    box(0, rim - 0.36, 0, w - 2 * board + 0.02, 0.34, d - 0.1, steel);
    for (let i = 0; i < bowls; i++)
      recess(-w / 2 + board + (i + 0.5) * bw, rim, 0.03, bw - 0.07, d - 0.2);
    for (const x of [-w / 2 + board / 2, w / 2 - board / 2]) {
      for (const z of [-d / 2 + 0.03, d / 2 - 0.03])
        box(x, rim, z, board - 0.02, 0.03, 0.02, steel);
      box(x + (x < 0 ? -1 : 1) * (board / 2 - 0.015), rim, 0, 0.02, 0.03, d - 0.02, steel);
    }
    box(0, rim, -d / 2 + 0.012, w, 0.26, 0.024, steel);
    faucet(-w / 2 + board + bw, rim, -d / 2 + 0.09, 0.3, 0.22);
    faucet(-w / 2 + board + 2 * bw, rim, -d / 2 + 0.09, 0.3, 0.22);
    const xr = -w / 2 + board + bw * 0.5,
      zr = -d / 2 + 0.12;
    cyl(xr, rim, zr, 0.014, h - rim, steel);
    tube([xr, rim + 0.45, zr], [xr, rim + 0.45, -d / 2 + 0.012], 0.008, steel);
    tube([xr, h - 0.02, zr], [xr, h - 0.02, zr + 0.28], 0.013, steel);
    tube([xr, h - 0.02, zr + 0.28], [xr, h - 0.2, zr + 0.3], 0.02, steel);
    tube([xr, h - 0.2, zr + 0.3], [xr + 0.12, rim + 0.25, zr + 0.26], 0.012, dark);
    cyl(xr + 0.12, rim + 0.17, zr + 0.26, 0.016, 0.09, dark);
    cyl(xr + 0.12, rim + 0.13, zr + 0.26, 0.034, 0.04, dark, 0.03);
  } else if (spec.kind === 'dish-machine') {
    // Under-counter dish machine under a stainless landing with a small
    // sink and a gooseneck faucet beside it (the faucet sets the height).
    const rim = 0.9,
      mw = 0.6,
      mx = -w / 2 + mw / 2,
      front = d / 2;
    box(mx, 0, 0, mw - 0.04, 0.1, d - 0.12, dark);
    box(mx, 0.1, -0.02, mw, 0.72, d - 0.07, steel);
    box(mx, 0.14, front - 0.03, mw - 0.06, 0.56, 0.024, steel);
    box(mx, 0.66, front - 0.009, mw - 0.14, 0.03, 0.018, dark);
    box(mx, 0.74, front - 0.008, mw - 0.1, 0.07, 0.016, dark);
    ball(mx - 0.2, 0.775, front - 0.002, 0.009, paint('#58c66a', 0.8), 1, 1, 0.2);
    ball(mx - 0.16, 0.775, front - 0.002, 0.009, paint('#f0b040', 0.8), 1, 1, 0.2);
    for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) {
      cyl(w / 2 - 0.05, 0.03, z, 0.019, rim - 0.07, steel);
      cyl(w / 2 - 0.05, 0, z, 0.024, 0.03, dark);
    }
    box(0, rim - 0.04, 0, w, 0.04, d, steel);
    box(0, rim, -d / 2 + 0.012, w, 0.2, 0.024, steel);
    const sx = w / 2 - 0.26;
    box(sx, rim - 0.34, 0.03, 0.38, 0.3, d - 0.24, steel);
    recess(sx, rim, 0.03, 0.34, d - 0.28);
    const fz = -d / 2 + 0.08;
    cyl(sx, rim, fz, 0.012, h - rim - 0.012, steel);
    ball(sx, h - 0.012, fz, 0.012, steel);
    tube([sx, h - 0.012, fz], [sx, h - 0.012, fz + 0.2], 0.012, steel);
    tube([sx, h - 0.012, fz + 0.2], [sx, h - 0.1, fz + 0.2], 0.01, steel);
    box(sx, rim, fz - 0.03, 0.09, 0.04, 0.02, dark);
  } else if (spec.kind === 'hand-sink') {
    // Wall-hung hand sink with a soap dispenser; the faucet sets the height
    // and the drain pipe reaches the floor.
    const rim = 0.94;
    cyl(0, 0, -d / 2 + 0.12, 0.02, rim - 0.2, steel);
    box(0, rim - 0.26, -d / 2 + 0.1, w - 0.1, 0.1, 0.2, steel);
    box(0, rim - 0.16, 0, w, 0.16, d, steel);
    recess(0, rim, 0.02, w - 0.12, d - 0.14);
    box(0, rim, -d / 2 + 0.012, w, 0.2, 0.024, steel);
    faucet(0, rim, -d / 2 + 0.07, h - rim, 0.14);
    box(w / 2 - 0.06, rim + 0.06, -d / 2 + 0.05, 0.07, 0.13, 0.06, white);
    cyl(w / 2 - 0.06, rim + 0.19, -d / 2 + 0.05, 0.01, 0.03, dark);
  } else if (spec.kind === 'stainless-work-table') {
    // Open-base work table with an undershelf and lidded grey bins beneath,
    // the bins in a row along the table's long axis.
    legs(h - 0.05, 0.06);
    box(0, h - 0.05, 0, w, 0.05, d, steel);
    box(0, 0.2, 0, w - 0.1, 0.02, d - 0.1, steel);
    const bins = Number(p.bins ?? 3),
      alongX = w >= d,
      long = Math.max(w, d),
      short = Math.min(w, d),
      across = Math.min(0.5, short - 0.16);
    for (let i = 0; i < bins; i++) {
      const t = bins > 1 ? -long / 2 + 0.24 + (i * (long - 0.48)) / (bins - 1) : 0;
      const [x, z] = alongX ? [t, 0.02] : [0.02, t];
      box(x, 0.22, z, alongX ? 0.38 : across, 0.4, alongX ? across : 0.38, bin);
      box(x, 0.62, z, alongX ? 0.4 : across + 0.02, 0.03, alongX ? across + 0.02 : 0.4, paint('#6f7578'));
    }
  } else if (spec.kind === 'reach-in-refrigerator') {
    // A commercial reach-in (two doors, compressor housing on top, legs) or
    // a domestic fridge-freezer (`domestic`: one door over a freezer drawer).
    const doors = Number(p.doors ?? 2),
      domestic = p.domestic === true,
      base = domestic ? 0.08 : 0.15,
      crown = domestic ? 0 : 0.25,
      bodyH = h - base - crown,
      front = d / 2;
    if (domestic) box(0, 0, 0, w - 0.06, base, d - 0.1, dark);
    else
      for (const x of [-w / 2 + 0.06, w / 2 - 0.06])
        for (const z of [-d / 2 + 0.06, d / 2 - 0.06])
          cyl(x, 0, z, 0.025, base, dark);
    box(0, base, -0.03, w, bodyH, d - 0.06, steel);
    if (crown) {
      box(0, h - crown, -0.01, w, crown, d - 0.02, steel);
      box(0, h - crown + 0.06, front - 0.015, w - 0.1, 0.13, 0.01, dark);
      for (let i = 0; i < 6; i++)
        box(0, h - crown + 0.07 + i * 0.02, front - 0.008, w - 0.14, 0.006, 0.004, steel);
    }
    const dw = w / doors,
      doorH = bodyH - 0.04;
    for (let i = 0; i < doors; i++) {
      const x = -w / 2 + (i + 0.5) * dw;
      box(x, base + 0.02, front - 0.04, dw - 0.03, doorH, 0.03, steel);
      const hx = x + (i < doors / 2 ? 1 : -1) * (dw / 2 - 0.06);
      if (domestic) {
        box(hx, base + 0.5, front - 0.016, 0.03, bodyH * 0.45, 0.03, dark);
        box(0, base + 0.42, front - 0.012, dw - 0.03, 0.012, 0.012, dark);
        box(hx - 0.2, base + 0.34, front - 0.016, 0.3, 0.03, 0.03, dark);
      } else box(hx, base + doorH * 0.2, front - 0.016, 0.03, doorH * 0.7, 0.03, dark);
      for (const y of [base + 0.08, base + bodyH - 0.1])
        box(x, y, front - 0.012, 0.09, 0.025, 0.006, dark);
    }
  } else if (spec.kind === 'warming-cabinet') {
    // Tall holding cabinet on casters: one full-height door, a control strip
    // with an amber indicator, vented top.
    const base = 0.1,
      front = d / 2;
    for (const x of [-w / 2 + 0.07, w / 2 - 0.07])
      for (const z of [-d / 2 + 0.07, d / 2 - 0.07]) cyl(x, 0, z, 0.04, base, dark);
    box(0, base, -0.02, w, h - base - 0.1, d - 0.04, steel);
    box(0, h - 0.1, 0, w, 0.1, d, steel);
    box(0, h - 0.06, front - 0.004, w - 0.1, 0.04, 0.008, dark);
    const doorH = h - base - 0.44;
    box(0, base + 0.04, front - 0.028, w - 0.06, doorH, 0.024, steel);
    box(w / 2 - 0.08, base + 0.3, front - 0.016, 0.022, doorH - 0.5, 0.032, dark);
    box(0, h - 0.33, front - 0.028, w - 0.06, 0.18, 0.024, dark);
    for (let i = 0; i < 2; i++)
      knob(-w / 2 + 0.12 + i * 0.1, h - 0.24, front - 0.0125, 0.022, 0.025, steel);
    box(0.08, h - 0.28, front - 0.012, 0.16, 0.08, 0.006, paint('#1b2224'));
    ball(w / 2 - 0.1, h - 0.24, front - 0.002, 0.011, paint('#f0a030', 0.9), 1, 1, 0.2);
  } else if (spec.kind === 'steam-table') {
    // Heated serving line across a pass-through: a closed-base hot-holding
    // table with four hotel pans (two open with the day's rice and braise,
    // two lidded), a sneeze guard with heat lamps over the serving edge and a
    // tubular tray slide with plates and trays on the dining side (local
    // +Z); the controls face the kitchen.
    const slide = 0.3,
      body = d - slide,
      zb = -slide / 2,
      rim = 0.92,
      front = zb + body / 2,
      back = zb - body / 2;
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06])
      for (const z of [back + 0.06, front - 0.06]) cyl(x, 0, z, 0.025, 0.12, dark);
    box(0, 0.12, zb, w, rim - 0.16, body - 0.04, steel);
    box(0, rim - 0.04, zb, w, 0.04, body, steel);
    box(0, rim - 0.2, front - 0.012, w - 0.2, 0.1, 0.024, dark);
    box(0, rim - 0.2, back + 0.012, w - 0.4, 0.1, 0.024, dark);
    for (let i = 0; i < 4; i++) knob(-0.45 + i * 0.3, rim - 0.15, back + 0.012, 0.02, 0.02, steel);
    const pans = 4,
      pw = 0.33,
      pitch = (w - 0.2) / pans,
      pd = body - 0.24,
      pz = zb + 0.02;
    const foods: [string, string][] = [
      ['#f8f4e8', '#efe7d3'],
      ['#8a3d2a', '#5f2d1f'],
      ['#4e8a4b', '#bcd9a4'],
      ['#c48a45', '#eedcaa'],
    ];
    for (let i = 0; i < pans; i++) {
      const x = -w / 2 + 0.1 + (i + 0.5) * pitch;
      box(x, rim - 0.015, pz, pw + 0.06, 0.015, pd + 0.06, steel);
      box(x, rim, pz, pw, 0.04, pd, paint(foods[i][0]));
      if (i < 2)
        for (let k = 0; k < 7; k++)
          ball(
            x - pw * 0.35 + ((k % 4) * pw) / 4 + (k > 3 ? pw / 8 : 0),
            rim + 0.05,
            pz - pd * 0.3 + Math.floor(k / 4) * pd * 0.42 + (k % 2) * 0.05,
            i ? 0.028 : 0.022,
            paint(foods[i][1]),
            0.7,
          );
      else {
        ball(x, rim + 0.035, pz, pw * 0.58, steel, 0.35, 1, (pd * 0.5) / (pw * 0.58));
        cyl(x, rim + 0.09, pz, 0.014, 0.03, dark);
      }
    }
    const guardZ = front - 0.08,
      railY = h - 0.02;
    for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) cyl(x, rim, guardZ, 0.014, railY - rim, steel);
    box(0, railY, guardZ, w, 0.02, 0.03, steel);
    const pane = add(new T.BoxGeometry(w - 0.1, 0.32, 0.008), glass, 0, rim + 0.3, guardZ + 0.06);
    pane.rotation.x = 0.42;
    box(0, railY - 0.06, zb + 0.02, w - 0.3, 0.05, 0.07, steel);
    for (let i = 0; i < 3; i++)
      ball(-0.5 + i * 0.5, railY - 0.07, zb + 0.02, 0.025, paint('#ffb36b', 1.2));
    for (const z of [front + 0.06, front + 0.17, front + slide - 0.012])
      tube([-w / 2 + 0.04, rim - 0.08, z], [w / 2 - 0.04, rim - 0.08, z], 0.012, steel);
    for (const x of [-w / 2 + 0.12, 0, w / 2 - 0.12])
      box(x, rim - 0.11, front + slide / 2 - 0.02, 0.03, 0.03, slide - 0.08, steel);
    for (let i = 0; i < 6; i++)
      cyl(w / 2 - 0.26, rim - 0.068 + i * 0.012, front + 0.14, 0.11, 0.01, paint('#f4f2ec'), 0.1);
    box(-w / 2 + 0.26, rim - 0.068, front + 0.14, 0.34, 0.06, 0.24, paint('#7a4a2e'));
  } else if (spec.kind === 'wall-tv') {
    // Wall-mounted flat television with a lit picture (sky, hills, water)
    // and a slim soundbar beneath; base at the soundbar's underside, back
    // at the wall bracket.
    const front = d / 2,
      bezelH = h - 0.15;
    box(0, 0, 0.012, 0.9, 0.06, front - 0.012, dark);
    box(0, bezelH * 0.3 + 0.15, -front + 0.0075, 0.3, bezelH * 0.5, 0.015, dark);
    box(0, 0.15, 0.0025, w, bezelH, d - 0.025, dark);
    const sw = w - 0.06,
      sh = bezelH - 0.06,
      bands: [number, string][] = [
        [0.3, '#3f6f99'],
        [0.22, '#5e8f6a'],
        [0.48, '#6ea2c8'],
      ];
    let y = 0.18;
    for (const [f, color] of bands) {
      const bh = sh * f;
      box(0, y, front - 0.005, sw, bh, 0.01, paint(color, 0.55));
      y += bh;
    }
    ball(0.25, 0.18 + sh * 0.8, front - 0.003, 0.03, paint('#fff1c4', 1.0), 1, 1, 0.1);
  } else if (spec.kind === 'microwave') {
    // Countertop microwave: white body, dark glass door with a handle and a
    // keypad strip.
    const front = d / 2;
    box(0, 0, -0.01, w, h, d - 0.02, white);
    box(-0.07, 0.03, front - 0.012, w - 0.19, h - 0.06, 0.012, dark);
    box(-0.07 + (w - 0.19) / 2 - 0.02, 0.05, front - 0.005, 0.012, h - 0.1, 0.01, white);
    box(w / 2 - 0.07, 0.04, front - 0.008, 0.09, h - 0.08, 0.004, paint('#4a4f52'));
    for (let i = 0; i < 6; i++)
      box(w / 2 - 0.085 + (i % 2) * 0.03, 0.08 + Math.floor(i / 2) * 0.045, front - 0.004, 0.02, 0.014, 0.003, paint('#9aa0a3'));
  } else if (spec.kind === 'pantry-cabinet') {
    // Tall kitchenette cabinet with an open niche for a microwave between
    // the lower and upper doors.
    const front = d / 2,
      nicheY = Number(p.nicheY ?? 1.03),
      nicheH = Number(p.nicheHeight ?? 0.55);
    box(0, 0, 0.03, w - 0.02, 0.1, d - 0.12, dark);
    box(0, 0.1, -0.01, w, nicheY - 0.1, d - 0.02, wood);
    box(0, nicheY, -front + 0.02, w, nicheH, 0.04, wood);
    for (const x of [-w / 2 + 0.01, w / 2 - 0.01]) box(x, nicheY, -0.01, 0.02, nicheH, d - 0.02, wood);
    box(0, nicheY + nicheH, -0.01, w, h - nicheY - nicheH, d - 0.02, wood);
    box(0, 0.14, front - 0.01, w - 0.03, nicheY - 0.18, 0.02, wood);
    box(0, nicheY + nicheH + 0.03, front - 0.01, w - 0.03, h - nicheY - nicheH - 0.06, 0.02, wood);
    for (const y of [nicheY - 0.3, nicheY + nicheH + 0.1])
      box(w / 2 - 0.06, y, front - 0.005, 0.012, 0.14, 0.01, white);
  } else if (spec.kind === 'bar-partition') {
    // The breakfast bar's half-height partition and support: a painted panel
    // at the back (local +Z), a timber ledger with brackets under the slab,
    // two slim posts and a footrail at the front. The quartz slab is its own
    // object on top.
    const back = d / 2;
    box(0, 0, back - 0.04, w, h, 0.08, panel);
    box(0, 0, back - 0.0425, w, 0.1, 0.085, paint('#6b5a43'));
    box(0, 0.78, back - 0.13, w - 0.1, 0.06, 0.1, wood);
    for (const x of [-w / 2 + 0.15, 0, w / 2 - 0.15])
      box(x, 0.8, 0, 0.04, 0.04, d - 0.08, white);
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12]) cyl(x, 0, -back + 0.02, 0.02, 0.84, white);
    tube([-w / 2 + 0.12, 0.25, -back + 0.02], [w / 2 - 0.12, 0.25, -back + 0.02], 0.014, steel);
  }
  // Centre on the floor and fit to the declared box, as assets.ts does for
  // its own kinds (the parts are built to size, so the scale is ~1).
  const bounds = new T.Box3().setFromObject(g),
    size = bounds.getSize(new T.Vector3()),
    mid = bounds.getCenter(new T.Vector3());
  g.position.set(-mid.x, -bounds.min.y, -mid.z);
  const fitted = new T.Group();
  fitted.scale.set(w / size.x, h / size.y, d / size.z);
  fitted.add(g);
  const root = new T.Group();
  root.name = spec.kind;
  root.add(fitted);
  return root;
}
