import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Asset } from './schema';

// Photo-derived component families. Dimensions come from each instance's asset
// specification, not from an assertion about the photographed manufacturer's model.
export function buildClinicalAsset(
  spec: Asset,
  material: (id: string) => T.Material,
): T.Group | null {
  const supported = [
    'connected-stair',
    'landing-guard',
    'care-shower',
    'barber-chair',
    'hair-wash-basin',
    'laundry-machine',
    'linen-rack',
    'dental-chair',
    'dental-delivery',
    'dining-lattice',
    'exam-lamp',
    'rehab-pulley',
    'therapy-balls',
    'counter-basin',
    'clinical-recliner',
    'clinical-stool',
    'diagnostic-panel',
    'clinical-monitor',
    'clinical-sink',
    'procedure-cart',
    'medical-drawer-cart',
    'glazed-cabinet',
    'rehab-plinth',
    'rehab-bars',
    'rehab-stepper',
    'rehab-training-stairs',
    'rehab-rack',
    'accessible-vanity',
    'wall-dispenser',
    'clinical-printer',
    'clinical-drawers',
    'clinical-nurse-station',
  ];
  if (!supported.includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions,
    p = spec.parameters || {};
  const white = 'photo-white',
    metal = 'photo-silver',
    dark = 'photo-black',
    oak = 'oak',
    teal = spec.material;
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
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    mat = white,
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
    mat = metal,
  ) => mesh(new T.CylinderGeometry(r, r, len, 16), mat, x, y + len / 2, z);
  const rod = (a: number[], b: number[], r = 0.018, mat = metal) => {
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
  const cable = (points: number[][], mat = dark, r = 0.009) =>
    mesh(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points.map((v) => new T.Vector3(...v))),
        16,
        r,
        5,
        false,
      ),
      mat,
      0,
      0,
      0,
    );
  const wheels = (wx: number, dz: number) => {
    for (const x of [-wx, wx])
      for (const z of [-dz, dz]) {
        rod([x, 0.1, z], [x, 0.19, z]);
        const c = cyl(x, 0.025, z, 0.055, 0.038, dark);
        c.rotation.z = Math.PI / 2;
      }
  };
  const screen = (x: number, y: number, z: number, sw: number, sh: number) => {
    box(x, y, z, sw, sh, 0.055, white, 0.018);
    box(x, y + 0.035, z + 0.031, sw - 0.055, sh - 0.07, 0.005, 'screen', 0.008);
    for (let i = 0; i < 3; i++)
      box(
        x - sw * 0.28,
        y + sh * (0.25 + i * 0.18),
        z + 0.036,
        sw * (0.35 + i * 0.08),
        0.008,
        0.002,
        i === 0 ? 'photo-teal' : 'photo-blue-grey',
      );
  };
  const handles = (x: number, y: number, z: number, len: number) =>
    rod([x - len / 2, y, z], [x + len / 2, y, z], 0.012);
  if (spec.kind === 'connected-stair') {
    // Keep tread elevations exact: fitting the handrails with the stair body
    // would shrink the last tread below the destination floor.
    const rise = Number(p.rise),
      count = Math.ceil(rise / 0.18),
      step = d / count;
    for (let i = 0; i < count; i++) {
      box(
        0,
        0,
        -d / 2 + (i + 0.5) * step,
        w,
        (rise * (i + 1)) / count,
        step,
        teal,
      );
      box(
        0,
        (rise * (i + 1)) / count - 0.005,
        -d / 2 + (i + 0.08) * step,
        w * 0.94,
        0.005,
        0.03,
        metal,
      );
    }
    for (const x of [-w / 2 + 0.035, w / 2 - 0.035]) {
      rod([x, 0.93, -d / 2 + 0.025], [x, h - 0.018, d / 2 - 0.025], 0.018);
      for (let i = 0; i <= count; i += 3) {
        const z = -d / 2 + 0.025 + (i * (d - 0.05)) / count,
          y = (rise * i) / count;
        rod([x, y, z], [x, y + 0.93, z], 0.014);
      }
      rod([x, rise, d / 2 - 0.025], [x, h - 0.018, d / 2 - 0.025], 0.018);
      mesh(
        new T.SphereGeometry(0.018, 12, 8),
        metal,
        x,
        h - 0.018,
        d / 2 - 0.025,
      );
    }
    return g;
  } else if (spec.kind === 'landing-guard') {
    for (const y of [0.47, h - 0.023])
      rod([0, y, -d / 2 + 0.023], [0, y, d / 2 - 0.023], 0.0225);
    for (let i = 0; i <= 5; i++)
      rod(
        [0, 0, -d / 2 + 0.023 + (i * (d - 0.046)) / 5],
        [0, h - 0.023, -d / 2 + 0.023 + (i * (d - 0.046)) / 5],
        0.0225,
      );
  } else if (spec.kind === 'care-shower') {
    box(0, 0, 0, w, 0.035, d, 'photo-mosaic');
    box(0, 0.035, -d / 2 + 0.025, w, h - 0.035, 0.05, teal);
    box(-w / 2 + 0.025, 0.035, 0, 0.05, h - 0.035, d, teal);
    box(0.24, 0.037, 0.15, 0.13, 0.003, 0.13, metal);
    for (let i = 0; i < 5; i++)
      box(0.24, 0.041, 0.1 + i * 0.025, 0.1, 0.002, 0.004, dark);
    rod([0.32, 0.75, -d / 2 + 0.08], [0.32, 1.86, -d / 2 + 0.08], 0.016);
    box(0.32, 1.62, -d / 2 + 0.12, 0.075, 0.16, 0.055, metal, 0.02);
    cable(
      [
        [0.32, 1.65, -d / 2 + 0.15],
        [0.57, 1.2, -d / 2 + 0.2],
        [0.35, 0.85, -d / 2 + 0.15],
      ],
      metal,
      0.012,
    );
    cyl(0.32, 0.93, -d / 2 + 0.15, 0.055, 0.06, metal);
    rod([-0.56, 0.87, -d / 2 + 0.16], [0.09, 0.87, -d / 2 + 0.16], 0.025);
    rod([-w / 2 + 0.16, 0.87, -0.55], [-w / 2 + 0.16, 0.87, 0.52], 0.025);
    box(-0.4, 0.46, -0.36, 0.49, 0.045, 0.44, white, 0.015);
    for (const x of [-0.58, -0.23])
      rod([x, 0.43, -0.2], [x, 0.15, -0.6], 0.019);
    rod(
      [-w / 2 + 0.05, h - 0.025, d / 2 - 0.04],
      [w / 2 - 0.04, h - 0.025, d / 2 - 0.04],
      0.018,
    );
    // Curtain gathered at the side; the roll-in entrance stays open.
    for (let i = 0; i < 6; i++)
      box(
        w / 2 - 0.23 + i * 0.032,
        0.22,
        d / 2 - 0.05 + (i % 2) * 0.022,
        0.034,
        h - 0.28,
        0.035,
        'photo-white',
      );
  } else if (spec.kind === 'barber-chair') {
    cyl(0, 0, -0.1, 0.31, 0.075, metal);
    cyl(0, 0.075, -0.1, 0.07, 0.34, metal);
    box(0, 0.42, 0, 0.61, 0.16, 0.59, dark, 0.07);
    const b = box(0, 0.57, -0.27, 0.59, 0.47, 0.13, dark, 0.06);
    b.rotation.x = -0.13;
    box(0, 1.06, -0.33, 0.32, 0.14, 0.12, dark, 0.04);
    for (const x of [-0.35, 0.35]) {
      rod([x, 0.32, -0.17], [x, 0.75, -0.17], 0.032);
      box(x, 0.75, 0.04, 0.12, 0.09, 0.53, dark, 0.03);
    }
    rod([-0.24, 0.4, 0.22], [-0.24, 0.17, 0.58], 0.027);
    rod([0.24, 0.4, 0.22], [0.24, 0.17, 0.58], 0.027);
    box(0, 0.13, 0.58, 0.57, 0.05, 0.27, metal, 0.025);
    for (let i = 0; i < 5; i++)
      box(0, 0.185, 0.49 + i * 0.04, 0.49, 0.006, 0.01, dark);
  } else if (spec.kind === 'hair-wash-basin') {
    box(0, 0, -0.08, 0.42, 0.75, 0.4, dark, 0.09);
    const bowl = mesh(
      new T.SphereGeometry(0.32, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      dark,
      0,
      0.96,
      0,
    );
    bowl.rotation.z = Math.PI;
    bowl.scale.set(1, 0.58, 1);
    const rim = mesh(new T.TorusGeometry(0.32, 0.032, 8, 32), dark, 0, 0.96, 0);
    rim.rotation.x = Math.PI / 2;
    box(0, 0.92, 0.29, 0.19, 0.065, 0.095, metal, 0.025);
    cyl(-0.18, 0.96, -0.2, 0.022, 0.14);
    box(-0.18, 1.08, -0.16, 0.025, 0.025, 0.12, metal);
    cable(
      [
        [0.2, 0.99, -0.18],
        [0.29, 0.82, -0.1],
        [0.21, 0.83, 0.08],
        [0.17, 1.01, -0.13],
      ],
      metal,
      0.013,
    );
    cyl(0, 0.78, 0, 0.037, 0.006, metal);
  } else if (spec.kind === 'laundry-machine') {
    box(0, 0, 0, w, h, d, white, 0.025);
    box(0, h * 0.81, d / 2 + 0.003, w * 0.93, h * 0.15, 0.016, 'photo-silver');
    box(
      -w * 0.22,
      h * 0.84,
      d / 2 + 0.014,
      w * 0.35,
      h * 0.08,
      0.008,
      'screen',
      0.005,
    );
    const knob = cyl(w * 0.27, h * 0.88, d / 2 + 0.026, 0.041, 0.025, white);
    knob.rotation.x = Math.PI / 2;
    const rim = mesh(
      new T.TorusGeometry(w * 0.31, 0.038, 10, 32),
      metal,
      0,
      h * 0.44,
      d / 2 + 0.031,
    );
    const window = mesh(
      new T.CircleGeometry(w * 0.26, 32),
      dark,
      0,
      h * 0.44,
      d / 2 + 0.04,
    );
    mesh(
      new T.CircleGeometry(w * 0.2, 32),
      'glass',
      0,
      h * 0.44,
      d / 2 + 0.044,
    );
    box(w * 0.28, h * 0.39, d / 2 + 0.071, 0.045, 0.12, 0.035, white, 0.015);
  } else if (spec.kind === 'linen-rack') {
    for (const x of [-w / 2 + 0.018, w / 2 - 0.018])
      for (const z of [-d / 2 + 0.018, d / 2 - 0.018])
        rod([x, 0, z], [x, h, z], 0.018);
    for (let i = 0; i < 5; i++) {
      const y = 0.1 + (i * (h - 0.2)) / 4;
      box(0, y, 0, w, 0.025, d, metal);
      if (i < 4)
        for (const x of [-w * 0.3, 0, w * 0.3])
          for (let j = 0; j < 3; j++)
            box(
              x,
              y + 0.03 + j * 0.055,
              0,
              w * 0.27,
              0.05,
              d * 0.74,
              i % 2 ? 'photo-blue-seat' : white,
              0.018,
            );
    }
  } else if (spec.kind === 'dental-delivery') {
    box(0, 0, 0, 0.48, 0.06, 0.46, white, 0.035);
    rod([0, 0.06, 0], [0, 0.88, 0], 0.035);
    box(0, 0.88, 0.035, 0.61, 0.11, 0.47, white, 0.025);
    box(-0.12, 0.994, 0.035, 0.22, 0.008, 0.15, 'screen');
    for (let i = 0; i < 4; i++) {
      const x = -0.2 + i * 0.13;
      rod([x, 0.82, 0.23], [x, 1.03, 0.23], 0.019, metal);
      cable(
        [
          [x, 0.85, 0.23],
          [x, 0.48, 0.26],
          [x + 0.07, 0.32, 0.25],
          [x + 0.1, 0.74, 0.13],
        ],
        dark,
        0.008,
      );
    }
  } else if (spec.kind === 'dining-lattice') {
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03])
      box(x, 0, 0, 0.06, h, d, oak);
    for (const y of [0, h - 0.06]) box(0, y, 0, w, 0.06, d, oak);
    for (let i = 1; i < 10; i++) {
      const x = -w / 2 + (i * w) / 10;
      box(x, 0.06, 0, 0.022, h * 0.41 - 0.06, d * 0.42, oak);
      box(x, h * 0.59, 0, 0.022, h * 0.41 - 0.06, d * 0.42, oak);
    }
    for (let i = 1; i < 11; i++) {
      const y = (i * h) / 11;
      if (y > h * 0.41 && y < h * 0.59) continue;
      box(0, y, 0, w - 0.12, 0.023, d * 0.42, oak);
    }
    mesh(new T.TorusGeometry(w * 0.17, 0.023, 8, 32), oak, 0, h / 2, 0);
    for (const x of [-w * 0.36, w * 0.36])
      box(x, h * 0.41, 0, w * 0.23, h * 0.18, d * 0.36, oak);
  } else if (
    spec.kind === 'clinical-recliner' ||
    spec.kind === 'dental-chair'
  ) {
    // Front is +Z. Separate upholstered seat, back, headrest and leg rest.
    box(0, 0.02, 0, 0.62, 0.09, 1.05, white, 0.055);
    box(0, 0.11, -0.03, 0.35, 0.29, 0.42, white, 0.05);
    rod([0, 0.19, -0.24], [0, 0.51, 0.2], 0.085, metal);
    box(0, 0.43, 0.04, 0.59, 0.15, 0.57, teal, 0.065);
    const back = box(0, 0.6, -0.3, 0.57, 0.66, 0.14, teal, 0.065);
    back.rotation.x = spec.kind === 'dental-chair' ? -0.4 : -0.24;
    const head = box(0, 1.24, -0.4, 0.36, 0.19, 0.13, teal, 0.055);
    head.rotation.x = spec.kind === 'dental-chair' ? -0.4 : -0.24;
    const leg = box(0, 0.29, 0.49, 0.52, 0.12, 0.41, teal, 0.045);
    leg.rotation.x = 0.3;
    box(0, 0.17, 0.74, 0.45, 0.065, 0.22, white, 0.025);
    for (const x of [-0.365, 0.365]) {
      rod([x, 0.32, -0.14], [x, 0.66, -0.14], 0.027);
      rod([x, 0.66, -0.14], [x, 0.66, 0.3], 0.026);
      box(
        x,
        0.67,
        0.1,
        0.11,
        0.065,
        0.48,
        p.procedure ? 'photo-teal' : dark,
        0.032,
      );
    }
    for (const z of [-0.38, 0.34])
      for (const x of [-0.23, 0.23]) cyl(x, 0.015, z, 0.037, 0.02, dark);
    cable(
      [
        [0.25, 0.36, -0.2],
        [0.31, 0.15, -0.28],
        [0.35, 0.05, 0.3],
      ],
      dark,
      0.009,
    );
  } else if (spec.kind === 'exam-lamp') {
    box(0, 0, -0.1, 0.24, 0.04, 0.24, white, 0.03);
    rod([0, 0.03, -0.1], [0, 0.73, -0.1], 0.018);
    cable(
      [
        [0, 0.73, -0.1],
        [0, 1.02, -0.1],
        [0, 1.12, 0.14],
        [0, 1.08, 0.34],
      ],
      metal,
      0.019,
    );
    box(0, 1.04, 0.34, 0.26, 0.07, 0.14, 'photo-teal', 0.025);
    box(0, 1.03, 0.34, 0.2, 0.009, 0.1, 'photo-led');
  } else if (spec.kind === 'counter-basin') {
    box(0, 0, 0, w, 0.018, d, metal, 0.025);
    box(0, 0.02, 0, w * 0.82, 0.009, d * 0.69, 'photo-blue-grey', 0.025);
    cable(
      [
        [0, 0.02, -d * 0.36],
        [0, h, -d * 0.36],
        [0, h, -d * 0.04],
        [0, h * 0.7, -d * 0.04],
      ],
      metal,
      0.012,
    );
  } else if (spec.kind === 'rehab-pulley') {
    box(0, 0, -0.035, w, h, 0.04, white);
    for (const x of [-w * 0.3, w * 0.3]) {
      rod([x, 0.07, 0], [x, h - 0.1, 0], 0.014);
      for (let i = 0; i < 12; i++)
        box(x, 0.15 + (i * (h - 0.3)) / 12, 0.015, 0.045, 0.015, 0.015, dark);
      const wheel = mesh(
        new T.TorusGeometry(0.065, 0.01, 6, 16),
        metal,
        x,
        h - 0.14,
        0.07,
      );
      cable(
        [
          [x, h - 0.1, 0.09],
          [x, h * 0.42, 0.17],
          [x - 0.07, h * 0.37, 0.17],
        ],
        dark,
        0.005,
      );
      rod([x - 0.11, h * 0.37, 0.17], [x + 0.01, h * 0.37, 0.17], 0.019, dark);
    }
  } else if (spec.kind === 'therapy-balls') {
    const colors = ['photo-teal', 'photo-red-cart', 'photo-moss'];
    for (let i = 0; i < 3; i++) {
      const r = 0.24 + i * 0.035;
      mesh(
        new T.SphereGeometry(r, 18, 12),
        colors[i],
        (i - 1) * 0.48,
        r,
        (i % 2) * 0.25,
      );
    }
  } else if (spec.kind === 'clinical-stool') {
    cyl(0, 0.45, 0, 0.23, 0.075, teal);
    cyl(0, 0.16, 0, 0.026, 0.29);
    cyl(0, 0.12, 0, 0.075, 0.035);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5,
        x = Math.sin(a) * 0.27,
        z = Math.cos(a) * 0.27;
      rod([0, 0.15, 0], [x, 0.07, z], 0.019);
      const c = cyl(x, 0.025, z, 0.04, 0.035, dark);
      c.rotation.z = Math.PI / 2;
    }
  } else if (spec.kind === 'diagnostic-panel') {
    box(0, 0, -0.06, 0.9, 0.8, 0.08, white, 0.015);
    screen(-0.19, 0.47, 0.015, 0.34, 0.26);
    for (const x of [0.07, 0.25]) {
      box(x, 0.43, 0.005, 0.075, 0.19, 0.095, white, 0.01);
      rod([x, 0.52, 0.075], [x, 0.73, 0.075], 0.02, dark);
      cable([
        [x, 0.46, 0.1],
        [x + 0.04, 0.1, 0.1],
        [x - 0.06, 0.05, 0.12],
        [x - 0.08, 0.39, 0.08],
      ]);
    }
    for (let i = 0; i < 5; i++)
      rod([-0.36 + i * 0.08, 0.2, 0.11], [-0.36 + i * 0.08, 0.39, 0.11], 0.007);
    for (const y of [0.2, 0.28, 0.39])
      rod([-0.39, y, 0.11], [0.02, y, 0.11], 0.007);
    box(-0.18, 0.24, 0.09, 0.22, 0.07, 0.07, 'photo-blue-grey', 0.01);
  } else if (spec.kind === 'clinical-monitor') {
    box(0, 0, -0.2, 0.16, 0.8, 0.05, white, 0.015);
    rod([0, 0.62, -0.19], [0, 0.62, 0.06], 0.035);
    screen(0, 0.48, 0.1, 0.46, 0.31);
    box(0, 0.28, 0.17, 0.52, 0.035, 0.38, white, 0.02);
    box(-0.04, 0.32, 0.18, 0.34, 0.016, 0.16, dark, 0.008);
    cable(
      [
        [0.12, 0.57, 0.07],
        [0.1, 0.12, -0.1],
        [0, 0.03, -0.18],
      ],
      dark,
      0.006,
    );
  } else if (spec.kind === 'clinical-sink') {
    // Rear wall -Z; drawer base at left, sink knee recess at right.
    box(-w * 0.3, 0.07, 0, w * 0.4, 0.72, d * 0.92, white);
    box(0, 0.81, 0, w, 0.045, d, 'photo-brown-counter');
    box(0, 0.855, -d * 0.47, w, 0.09, 0.035, 'photo-brown-counter');
    for (let i = 0; i < 4; i++) {
      box(-w * 0.3, 0.09 + i * 0.175, d * 0.47, w * 0.38, 0.16, 0.025, white);
      handles(-w * 0.3, 0.2 + i * 0.175, d * 0.5, w * 0.23);
    }
    for (const x of [-w * 0.49, w * 0.49])
      box(x, 0.05, 0, 0.025, 0.76, d * 0.9, white);
    box(w * 0.21, 0.85, 0, w * 0.32, 0.008, d * 0.52, metal, 0.035);
    box(w * 0.21, 0.86, 0, w * 0.26, 0.008, d * 0.4, 'photo-blue-grey', 0.025);
    cable(
      [
        [w * 0.21, 0.86, -d * 0.35],
        [w * 0.21, 1.11, -d * 0.35],
        [w * 0.21, 1.11, -d * 0.06],
        [w * 0.21, 1.0, -d * 0.06],
      ],
      metal,
      0.014,
    );
    const by = h * 0.69;
    for (let i = 0; i < 3; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / 3;
      box(x, by, -d * 0.16, w / 3 - 0.009, h - by, d * 0.65, white);
      handles(x, by + 0.12, d * 0.18, w * 0.17);
      if (i > 0)
        box(
          x,
          by + 0.28,
          d * 0.177,
          0.06,
          0.14,
          0.008,
          'photo-blue-grey',
          0.02,
        );
    }
    box(w * 0.45, 1.08, -d * 0.4, 0.1, 0.21, 0.09, dark, 0.015);
  } else if (spec.kind === 'procedure-cart') {
    box(0, 0.11, 0, 0.48, 0.045, 0.52, white, 0.025);
    wheels(0.2, 0.21);
    box(0, 0.17, -0.06, 0.095, 0.68, 0.12, white, 0.02);
    box(0, 0.53, 0.02, 0.43, 0.04, 0.36, white, 0.02);
    for (const x of [-0.19, 0.19])
      for (const z of [-0.13, 0.17]) rod([x, 0.56, z], [x, 0.75, z], 0.01);
    for (const y of [0.58, 0.64, 0.7]) {
      rod([-0.19, y, 0.17], [0.19, y, 0.17], 0.008);
      rod([-0.19, y, -0.13], [-0.19, y, 0.17], 0.008);
      rod([0.19, y, -0.13], [0.19, y, 0.17], 0.008);
    }
    const device = box(0, 0.87, 0, 0.62, 0.1, 0.44, white, 0.025);
    device.rotation.x = 0.2;
    const display = box(0, 0.973, -0.02, 0.43, 0.009, 0.27, dark, 0.012);
    display.rotation.x = 0.2;
    cable(
      [
        [0.27, 0.9, 0],
        [0.3, 0.65, 0.05],
        [0.27, 0.23, 0.15],
      ],
      dark,
    );
  } else if (
    spec.kind === 'medical-drawer-cart' ||
    spec.kind === 'clinical-drawers'
  ) {
    const rolling = spec.kind === 'medical-drawer-cart',
      bottom = rolling ? 0.15 : 0.04,
      mat = teal;
    box(0, bottom, 0, w * 0.96, h - bottom - 0.06, d * 0.95, mat, 0.015);
    box(0, h - 0.065, 0, w, 0.045, d, white, 0.015);
    for (let i = 0; i < 5; i++) {
      const y = bottom + 0.02 + (i * (h - bottom - 0.08)) / 5;
      box(0, y, d * 0.48, w * 0.92, (h - bottom - 0.08) / 5 - 0.01, 0.02, mat);
      handles(0, y + 0.055, d * 0.515, w * 0.52);
    }
    if (rolling) wheels(w * 0.37, d * 0.37);
  } else if (spec.kind === 'glazed-cabinet') {
    box(0, 0, -d * 0.46, w, h, d * 0.08, white);
    for (const x of [-w * 0.49, 0, w * 0.49]) box(x, 0, 0, 0.025, h, d, white);
    for (let i = 0; i < 5; i++)
      box(0, (i * (h - 0.04)) / 4, 0, w, 0.025, d, white);
    for (const x of [-w * 0.24, w * 0.24]) {
      box(x, 0.035, d * 0.49, w * 0.46, h - 0.07, 0.014, 'glass');
      handles(x, h * 0.48, d * 0.53, w * 0.14);
    }
    for (let i = 0; i < 4; i++)
      for (const x of [-w * 0.22, w * 0.22])
        box(
          x,
          0.05 + i * h * 0.24,
          0,
          w * 0.33,
          0.1,
          d * 0.63,
          'photo-blue-seat',
          0.035,
        );
  } else if (spec.kind === 'rehab-plinth') {
    for (const x of [-w * 0.43, w * 0.43])
      for (const z of [-d * 0.44, d * 0.44]) {
        cyl(x, 0, z, 0.035, 0.05, dark);
        rod([x, 0.04, z], [x, h - 0.12, z], 0.025);
      }
    box(0, h - 0.17, 0, w - 0.02, 0.045, d - 0.02, white);
    box(0, h - 0.125, 0, w, 0.12, d, teal, 0.025);
    box(0, h - 0.025, 0, 0.009, 0.002, d - 0.04, 'photo-blue-grey');
    for (const x of [-w * 0.42, w * 0.42])
      rod([x, h * 0.43, -d * 0.44], [x, h * 0.43, d * 0.44], 0.018);
  } else if (spec.kind === 'rehab-bars') {
    box(0, 0, 0, w, 0.035, d, 'photo-mosaic', 0.015);
    for (const x of [-w * 0.39, w * 0.39]) {
      rod([x, h - 0.025, -d * 0.47], [x, h - 0.025, d * 0.47], 0.025);
      for (const z of [-d * 0.38, d * 0.38]) {
        box(x, 0.035, z, 0.23, 0.025, 0.19, dark);
        rod([x, 0.06, z], [x, h - 0.03, z], 0.025);
        cyl(x, h * 0.6, z, 0.036, 0.055);
      }
    }
  } else if (spec.kind === 'rehab-stepper') {
    box(0, 0.04, 0, 0.68, 0.09, 1.32, metal, 0.045);
    box(0, 0.13, -0.33, 0.4, 0.47, 0.47, white, 0.08);
    box(0, 0.47, 0.31, 0.57, 0.12, 0.48, dark, 0.06);
    const back = box(0, 0.62, 0.56, 0.52, 0.67, 0.14, 'photo-blue-grey', 0.065);
    back.rotation.x = 0.11;
    box(0, 0.18, 0.23, 0.18, 0.29, 0.31, white, 0.025);
    for (const x of [-0.31, 0.31]) {
      rod([x, 0.34, 0.37], [x, 0.68, 0.23], 0.025);
      rod([x, 0.68, 0.23], [x, 0.68, 0.02], 0.032, dark);
      rod([x, 0.2, -0.33], [x, 0.76, -0.55], 0.028);
      rod([x, 0.76, -0.55], [x, 0.98, -0.43], 0.023, dark);
      box(x, 0.16, -0.19, 0.19, 0.045, 0.3, dark, 0.02);
    }
    rod([0, 0.55, -0.33], [0, 1.03, -0.5], 0.035);
    screen(0, 1.03, -0.49, 0.36, 0.25);
  } else if (spec.kind === 'rehab-training-stairs') {
    const deck = 0.6,
      landing = 0.75,
      stepD = 0.28,
      run = d - landing - stepD * 4;
    for (let i = 0; i < 4; i++)
      box(
        0,
        0,
        -d / 2 + (i + 0.5) * stepD,
        w,
        ((i + 1) * deck) / 4,
        stepD,
        oak,
      );
    box(0, 0, -d / 2 + stepD * 4 + landing / 2, w, deck, landing, oak);
    const start = -d / 2 + stepD * 4 + landing,
      end = d / 2;
    const shape = new T.Shape();
    shape.moveTo(start, 0);
    shape.lineTo(start, deck);
    shape.lineTo(end, 0);
    shape.closePath();
    const ramp = new T.ExtrudeGeometry(shape, {
      depth: w,
      bevelEnabled: false,
    });
    ramp.rotateY(-Math.PI / 2);
    mesh(ramp, oak, w / 2, 0, 0);
    for (const x of [-w * 0.47, w * 0.47]) {
      const pts = [
        [-d / 2, 0.88],
        [-d / 2 + stepD * 4, deck + 0.88],
        [start, deck + 0.88],
        [end, 0.88],
      ];
      for (let i = 1; i < pts.length; i++)
        rod(
          [x, pts[i - 1][1], pts[i - 1][0]],
          [x, pts[i][1], pts[i][0]],
          0.03,
          oak,
        );
      for (const [z, y] of pts) rod([x, y - 0.87, z], [x, y, z], 0.023);
    }
  } else if (spec.kind === 'rehab-rack') {
    box(0, 0.08, 0, w, 0.08, d, oak, 0.025);
    wheels(w * 0.38, d * 0.37);
    box(0, 0.16, -d * 0.17, w * 0.8, h - 0.16, 0.08, oak);
    const colors = [
      'photo-teal',
      'photo-red-cart',
      'photo-mustard',
      'photo-blue-seat',
    ];
    for (let i = 0; i < 6; i++) {
      const y = 0.25 + i * 0.21;
      rod([-w * 0.38, y, 0], [w * 0.38, y, 0], 0.025);
      for (const x of [-w * 0.26, w * 0.26]) {
        cyl(x, y, 0, 0.048, 0.055, colors[i % 4]);
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * w * 0.12;
      cable(
        [
          [x, h - 0.1, 0],
          [x - 0.07, h - 0.35, 0.15],
          [x, h - 0.7, 0.12],
          [x + 0.07, h - 0.35, 0.13],
          [x, h - 0.1, 0],
        ],
        colors[i % 4],
        0.016,
      );
    }
  } else if (spec.kind === 'accessible-vanity') {
    // Knee space is empty geometry, not a painted rectangle on a closed cabinet.
    const topY = 0.8;
    box(0, topY, 0, w, 0.08, d, white, 0.025);
    for (const x of [-w / 2 + 0.025, w / 2 - 0.025])
      box(x, 0.02, -d * 0.12, 0.05, topY - 0.02, d * 0.76, oak);
    const count = Number(p.basins || 2);
    for (let i = 0; i < count; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / count;
      const bowl = mesh(
        new T.SphereGeometry(0.19, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        white,
        x,
        0.81,
        0,
      );
      bowl.scale.set(1, 0.35, 0.75);
      bowl.rotation.z = Math.PI;
      const rim = mesh(
        new T.TorusGeometry(0.19, 0.018, 7, 24),
        white,
        x,
        0.885,
        0,
      );
      rim.rotation.x = Math.PI / 2;
      rim.scale.y = 0.75;
      cyl(x, 0.883, -d * 0.34, 0.019, 0.12);
      box(x, 1, -d * 0.23, 0.026, 0.025, d * 0.25, metal, 0.01);
      box(
        x + (w / count) * 0.34,
        0.91,
        -d * 0.43,
        0.095,
        0.21,
        0.06,
        dark,
        0.018,
      );
      cable(
        [
          [x, 0.79, 0],
          [x, 0.65, 0],
          [x, 0.61, -d * 0.25],
        ],
        white,
        0.025,
      );
    }
  } else if (spec.kind === 'wall-dispenser') {
    box(0, 0, 0, w, h, d, teal, 0.025);
    box(0, h * 0.2, d * 0.505, w * 0.64, 0.012, 0.004, dark);
    box(
      0,
      h * 0.55,
      d * 0.51,
      w * 0.65,
      h * 0.24,
      0.005,
      'photo-blue-grey',
      0.015,
    );
  } else if (spec.kind === 'clinical-printer') {
    box(0, 0, 0, w, h * 0.66, d, white, 0.025);
    box(0, h * 0.64, -d * 0.08, w * 0.96, h * 0.13, d * 0.86, dark, 0.01);
    box(0, h * 0.78, -d * 0.22, w * 0.76, h * 0.18, d * 0.55, white, 0.015);
    box(0, h * 0.31, d * 0.51, w * 0.69, h * 0.1, 0.02, dark);
    box(w * 0.24, h * 0.64, d * 0.3, w * 0.26, 0.035, d * 0.21, 'screen');
  } else if (spec.kind === 'clinical-nurse-station') {
    const t = 0.52,
      front = d / 2;
    // Three-sided staffed station, with a low, genuinely open-knee return at front left.
    for (const x of [-w / 2 + t / 2, w / 2 - t / 2]) {
      box(x, 0.05, -0.22, t - 0.06, h - 0.26, d - 0.44, oak, 0.035);
      box(x, h - 0.2, -0.22, t, 0.2, d - 0.44, white, 0.035);
      box(x, h - 0.235, -0.22, t - 0.02, 0.025, d - 0.44, 'photo-light');
    }
    const lowW = 0.95;
    box(
      lowW / 2,
      0.05,
      front - 0.3,
      w - lowW - 0.06,
      h - 0.26,
      0.52,
      oak,
      0.035,
    );
    box(lowW / 2, h - 0.2, front - 0.3, w - lowW, 0.2, 0.6, white, 0.035);
    box(
      lowW / 2,
      h - 0.235,
      front - 0.3,
      w - lowW - 0.04,
      0.025,
      0.55,
      'photo-light',
    );
    box(-w / 2 + lowW / 2, 0.76, front - 0.3, lowW, 0.075, 0.6, white, 0.035);
    box(-w / 2 + 0.04, 0, front - 0.3, 0.08, 0.76, 0.57, white);
    for (const x of [-w * 0.29, w * 0.29])
      box(x, 0.72, -0.32, 0.57, 0.045, d - 0.7, oak);
  }
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
