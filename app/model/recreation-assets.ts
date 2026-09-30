import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Asset } from './schema';

// Back-of-house recreation furniture: table tennis and karaoke rooms. Each
// component is modeled at its declared dimensions around a floor-centered
// origin with its usable face toward local +Z, then fitted like the other
// asset families. Proportions follow standard products, not a verified
// manufacturer schedule.
export function buildRecreationAsset(
  spec: Asset,
  material: (id: string) => T.Material,
): T.Group | null {
  const supported = [
    'table-tennis-table',
    'paddle-rack',
    'rec-bench',
    'karaoke-media',
    'tower-speaker',
    'mic-stand',
    'compact-sofa',
    'side-table-lamp',
  ];
  if (!supported.includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions,
    p = spec.parameters || {};
  const slot = (name: string, fallback: string) =>
    spec.materials?.[name] || fallback;
  const oak = slot('wood', 'oak'),
    dark = slot('frame', 'photo-black'),
    white = slot('white', 'photo-white'),
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
  // Boxes sit on `y`; a radius softens upholstery and joinery edges.
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
    mesh(
      new T.CylinderGeometry(top, r, len, segments),
      mat,
      x,
      y + len / 2,
      z,
    );
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
  if (spec.kind === 'table-tennis-table') {
    // Regulation 2.74 x 1.525 m playing surface at 0.76 m; net posts extend
    // beyond the sidelines, so the declared width includes them.
    const top = 0.76,
      tw = 1.525,
      thick = 0.025,
      line = slot('line', white);
    box(0, top - thick, 0, tw, thick, d, spec.material, 0.004);
    // White boundary and centre lines, flush on the surface.
    const lw = 0.02,
      y = top - 0.0015;
    for (const x of [-tw / 2 + lw / 2, tw / 2 - lw / 2])
      box(x, y, 0, lw, 0.002, d, line);
    for (const z of [-d / 2 + lw / 2, d / 2 - lw / 2])
      box(0, y, z, tw, 0.002, lw, line);
    box(0, y, 0, 0.003, 0.002, d, line);
    // Apron and two folding undercarriage frames with castors.
    box(0, top - 0.085, 0, tw - 0.14, 0.06, d - 0.24, dark);
    for (const z of [-d * 0.3, d * 0.3]) {
      for (const x of [-tw * 0.4, tw * 0.4]) {
        rod([x, 0.07, z], [x, top - 0.08, z], 0.02, dark);
        cyl(x, 0, z, 0.035, 0.07, dark);
      }
      rod([-tw * 0.4, 0.2, z], [tw * 0.4, 0.2, z], 0.015, dark);
    }
    // Net assembly across the width at mid-length.
    const netH = 0.1525;
    for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) {
      box(x, top - 0.05, 0, 0.04, netH + 0.05, 0.04, dark);
      box(x * 0.93, top - 0.035, 0, 0.12, 0.035, 0.05, dark);
    }
    box(0, top, 0, w - 0.06, netH - 0.012, 0.006, slot('net', 'rec-net'));
    box(0, top + netH - 0.012, 0, w - 0.06, 0.014, 0.012, line);
  } else if (spec.kind === 'paddle-rack') {
    // Low oak cabinet with a pegboard upstand, paddles and a ball basket.
    const base = 0.72;
    box(0, 0.05, 0, w, base - 0.05, d, oak, 0.01);
    box(0, 0, 0.01, w - 0.04, 0.05, d - 0.06, dark);
    for (const x of [-w / 4, w / 4])
      box(x, 0.08, d / 2, w / 2 - 0.012, base - 0.12, 0.012, oak, 0.004);
    box(0, base, -d / 2 + 0.02, w, h - base, 0.03, slot('board', white), 0.006);
    const paddles = [slot('rubber', 'photo-red-cart'), dark, dark, slot('rubber', 'photo-red-cart')];
    paddles.forEach((face, i) => {
      const x = -w * 0.33 + i * w * 0.22,
        cy = base + (h - base) * 0.62;
      const blade = mesh(
        new T.CylinderGeometry(0.075, 0.075, 0.012, 24),
        face,
        x,
        cy,
        -d / 2 + 0.05,
      );
      blade.rotation.x = Math.PI / 2;
      blade.scale.set(1, 1, 1.12);
      box(x, cy - 0.15, -d / 2 + 0.05, 0.028, 0.09, 0.022, oak, 0.006);
    });
    box(w * 0.3, base, d * 0.12, 0.22, 0.08, 0.16, metal, 0.01);
    for (let i = 0; i < 5; i++)
      mesh(
        new T.SphereGeometry(0.02, 12, 8),
        i === 2 ? slot('accent', 'photo-mustard') : slot('ball', white),
        w * 0.3 - 0.07 + (i % 3) * 0.07,
        base + 0.09,
        d * 0.12 - 0.03 + Math.floor(i / 3) * 0.06,
      );
  } else if (spec.kind === 'rec-bench') {
    // Slatted oak bench on two slim dark frames.
    const seat = h,
      slats = 5;
    for (let i = 0; i < slats; i++)
      box(0, seat - 0.035, -d / 2 + ((i + 0.5) * d) / slats, w, 0.035, d / slats - 0.012, oak, 0.006);
    for (const x of [-w * 0.4, w * 0.4]) {
      box(x, 0, 0, 0.04, seat - 0.035, d - 0.04, dark);
      box(x, seat * 0.35, 0, 0.05, 0.03, d - 0.04, dark);
    }
  } else if (spec.kind === 'karaoke-media') {
    // Low oak console with a wall-hung screen and a warm backlit halo.
    const console = 0.45,
      sw = Number(p.screenWidth ?? w * 0.88),
      sh = sw * 0.5625,
      sy = Math.max(console + 0.15, h - sh - 0.02);
    box(0, 0.06, 0, w, console - 0.06, d, oak, 0.012);
    box(0, 0, 0.02, w - 0.08, 0.06, d - 0.08, dark);
    for (let i = 0; i < 3; i++)
      box(-w / 3 + (i * w) / 3, 0.1, d / 2, w / 3 - 0.012, console - 0.16, 0.01, oak, 0.004);
    box(0, sy - 0.03, -d / 2 + 0.012, sw + 0.12, sh + 0.06, 0.012, slot('glow', 'rec-glow'));
    box(0, sy, -d / 2 + 0.05, sw, sh, 0.04, dark, 0.008);
    box(0, sy + 0.02, -d / 2 + 0.071, sw - 0.04, sh - 0.04, 0.004, slot('screen', 'rec-screen'));
    // Lyric lines on the display.
    for (let i = 0; i < 3; i++)
      box(0, sy + sh * (0.22 + i * 0.12), -d / 2 + 0.075, sw * (0.5 - i * 0.08), sh * 0.035, 0.002, slot('lyrics', 'rec-glow'));
    box(0, console, d * 0.1, 0.36, 0.05, 0.16, dark, 0.01);
  } else if (spec.kind === 'tower-speaker') {
    box(0, 0.02, 0, w, h - 0.02, d, spec.material, 0.02);
    box(0, 0, 0, w * 0.8, 0.02, d * 0.8, dark);
    for (const [y, r] of [
      [h * 0.3, w * 0.3],
      [h * 0.55, w * 0.3],
      [h * 0.82, w * 0.14],
    ]) {
      const cone = mesh(
        new T.CylinderGeometry(r, r, 0.012, 24),
        slot('driver', dark),
        0,
        y,
        d / 2 + 0.004,
      );
      cone.rotation.x = Math.PI / 2;
    }
  } else if (spec.kind === 'mic-stand') {
    // Weighted round base, upright and a short boom toward the singer (+Z).
    const pole = h - 0.25;
    cyl(0, 0, -d / 2 + 0.15, 0.15, 0.02, dark, 0.14, 28);
    rod([0, 0.02, -d / 2 + 0.15], [0, pole, -d / 2 + 0.15], 0.011, metal);
    rod([0, pole, -d / 2 + 0.15], [0, h - 0.06, d / 2 - 0.08], 0.009, metal);
    const mic = rod([0, h - 0.07, d / 2 - 0.1], [0, h - 0.03, d / 2 - 0.02], 0.016, dark);
    mic.castShadow = true;
    mesh(new T.SphereGeometry(0.026, 16, 12), metal, 0, h - 0.026, d / 2 - 0.026);
  } else if (spec.kind === 'compact-sofa') {
    // Low upholstered sofa on an oak plinth; one cushion per seat.
    const seats = Math.max(2, Number(p.seats || 2)),
      arm = 0.12,
      seatH = 0.42,
      plinth = 0.1,
      inner = w - arm * 2;
    box(0, 0, 0, w - 0.04, plinth, d - 0.06, oak, 0.01);
    box(0, plinth, -d / 2 + 0.11, w, h - plinth, 0.22, spec.material, 0.05);
    for (const x of [-w / 2 + arm / 2, w / 2 - arm / 2])
      box(x, plinth, 0.04, arm, 0.6 - plinth, d - 0.08, spec.material, 0.05);
    for (let i = 0; i < seats; i++) {
      const x = -inner / 2 + ((i + 0.5) * inner) / seats;
      box(x, plinth, 0.08, inner / seats - 0.012, seatH - plinth, d - 0.26, spec.material, 0.05);
      const back = box(x, seatH, -d / 2 + 0.26, inner / seats - 0.02, h - seatH - 0.06, 0.16, spec.material, 0.06);
      back.rotation.x = -0.1;
    }
  } else if (spec.kind === 'side-table-lamp') {
    // Round oak side table carrying a small, warmly glowing table lamp.
    const table = 0.5;
    cyl(0, table - 0.03, 0, w / 2, 0.03, oak, w / 2, 32);
    cyl(0, 0.02, 0, 0.022, table - 0.05, dark);
    cyl(0, 0, 0, w * 0.28, 0.02, dark, w * 0.28, 28);
    cyl(0.04, table, -0.04, 0.055, 0.14, slot('base', white), 0.045, 20);
    cyl(0.04, table + 0.14, -0.04, 0.11, 0.17, slot('shade', 'rec-lamp'), 0.075, 24);
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
