import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Facility, Vec2 } from './schema';
import { sampleStreetCar } from './traffic-routes';

// Presentation-model site palette: warm light asphalt, soft white markings,
// pale concrete and muted sage planting.
const SITE = {
  asphalt: '#c2beb7',
  street: '#bbb7b0',
  sidewalk: '#e4e0d7',
  curb: '#dcd7cd',
  planting: '#b4bea2',
  marking: '#f8f6f1',
  accessible: '#a3b6bf',
  trunk: '#8f8472',
  canopy: ['#a9b598', '#9fad8d', '#b3bda3'],
  pole: '#a3a5a0',
  lamp: '#f6f4ee',
  neighbor: '#e3ded4',
  coping: '#d2ccc0',
  neighborGlass: '#bcc6c5',
  glass: '#56605f',
  tyre: '#3d4040',
  headlight: '#f7f4ea',
  cars: ['#ebe8e2', '#d7d3cb', '#cacdca', '#efeee9', '#c0bdb6'],
};

// Raised sidewalks and curb islands, traced on the supplied plan (source pixels).
// The west strip is cut at the lot entrance (the curb cut beside the two-storey
// wing, Street View May 2025), so the apron there sits at lot level.
// Sidewalks from the high-resolution aerial (2026-10-02): the Ethel Avenue
// strip (lawn and walk, cut at the lot entrance), Valley Blvd's walk with
// rounded curb returns at Ethel and Campbell, and Campbell's walk.
const SIDEWALKS_PX = [
  [
    [244, 1441],
    [244, 2173],
    [249, 2219],
    [262, 2263],
    [284, 2304],
    [313, 2339],
    [349, 2369],
    [390, 2390],
    [434, 2404],
    [480, 2408],
    [3947, 2408],
    [3947, 2408],
    [3993, 2404],
    [4037, 2390],
    [4078, 2369],
    [4114, 2339],
    [4143, 2304],
    [4165, 2263],
    [4179, 2219],
    [4183, 2173],
    [4183, 144],
    [4116, 144],
    [4116, 2294],
    [350, 2294],
    [350, 1441],
  ],
  [
    [244, 219],
    [244, 1276],
    [350, 1276],
    [350, 219],
  ],
] as Vec2[][];
const CURB_ISLANDS_PX = [
  [
    [366, 219],
    [567, 219],
    [567, 258],
    [409, 258],
    [409, 1021],
    [366, 1021],
  ],
  [
    [350, 1469],
    [476, 1469],
    [476, 1516],
    [390, 1516],
    [390, 2255],
    [350, 2255],
  ],
  [
    [834, 211],
    [1015, 211],
    [834, 317],
  ],
  [
    [2720, 209],
    [3020, 209],
    [3070, 328],
    [2860, 455],
  ],
  [
    [2780, 997],
    [2960, 997],
    [2990, 1340],
    [2780, 1400],
  ],
  [
    [2830, 2205],
    [2870, 2040],
    [2900, 2040],
    [2900, 2200],
  ],
  [
    [3210, 2180],
    [3390, 1930],
    [3425, 2190],
  ],
] as Vec2[][];
/** Sidewalk and curb-island outlines in site metres (shared with the fleet clearance check). */
export function siteCurbs(model: Pick<Facility, 'calibration'>) {
  const px = ([x, z]: Vec2): Vec2 => [
    (x - model.calibration.sourcePixelOrigin[0]) /
      model.calibration.pixelsPerMeter,
    (z - model.calibration.sourcePixelOrigin[1]) /
      model.calibration.pixelsPerMeter,
  ];
  return {
    sidewalks: SIDEWALKS_PX.map((p) => p.map(px)),
    islands: CURB_ISLANDS_PX.map((p) => p.map(px)),
  };
}
/**
 * Drawn extent of the ring streets beyond the block: past the distributed-care
 * pads, so vehicles leave and enter the map off screen. The south street stops
 * at the west street because the partner pharmacy's pad sits on its line.
 */
export const STREET_EXTENT = { x: 150, z: 95 };

/** Owned plan-derived ground geometry; surrounding building heights are illustrative. */
export function buildNeighborhood(model: Facility) {
  const root = new T.Group();
  root.name = 'neighborhood-3d';
  root.userData = {
    sourcePages: [92, 109, 110, 111],
    accuracy:
      'Street and parking layout follows supplied plan; heights and props estimated. No map imagery extraction.',
  };
  const materials = new Map<string, T.MeshStandardMaterial>();
  const mat = (c: string) => {
    if (!materials.has(c))
      materials.set(
        c,
        new T.MeshStandardMaterial({
          color: c,
          roughness: c === SITE.glass ? 0.3 : 0.92,
        }),
      );
    return materials.get(c)!;
  };
  const add = (
    geo: T.BufferGeometry,
    c: string,
    x = 0,
    y = 0,
    z = 0,
    parent: T.Object3D = root,
  ) => {
    const m = new T.Mesh(geo, mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    p: T.Object3D = root,
  ) => add(new T.BoxGeometry(w, h, d), c, x, y + h / 2, z, p);
  const px = (x: number, z: number): Vec2 => [
    (x - model.calibration.sourcePixelOrigin[0]) /
      model.calibration.pixelsPerMeter,
    (z - model.calibration.sourcePixelOrigin[1]) /
      model.calibration.pixelsPerMeter,
  ];
  function patch(
    points: Vec2[],
    y: number,
    depth: number,
    color: string,
    name: string,
    hole?: Vec2[],
  ) {
    const shape = new T.Shape();
    points.forEach(([x, z], i) =>
      i ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
    );
    shape.closePath();
    if (hole) {
      const h = new T.Path();
      hole.forEach(([x, z], i) => (i ? h.lineTo(x, -z) : h.moveTo(x, -z)));
      h.closePath();
      shape.holes.push(h);
    }
    const geo = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const o = add(geo, color, 0, y, 0);
    o.name = name;
    return o;
  }
  const [[minX, minZ], [maxX, maxZ]] = model.site.bounds;
  patch(
    [
      [minX, minZ],
      [maxX, minZ],
      [maxX, maxZ],
      [minX, maxZ],
    ],
    -0.42,
    0.2,
    SITE.asphalt,
    'parking-and-street-bed',
    model.site.buildingOutline,
  );
  // Streets continue beyond the crop; their length is presentation context, not a site survey.
  box(13.45, -0.43, 36.2, 119.3, 0.2, 10, SITE.street);
  box(-40.7, -0.43, 5, 11, 0.2, 82, SITE.street);
  box(13.45, -0.43, -32.3, 119.3, 0.2, 7, SITE.street);
  box(69.1, -0.43, 5, 8, 0.2, 82, SITE.street);
  // Extensions out to STREET_EXTENT, 2 mm lower so they never fight with the
  // slabs above or with a pad's own street stub.
  const { x: farX, z: farZ } = STREET_EXTENT;
  const slab = (x0: number, x1: number, z0: number, z1: number) =>
    box(
      (x0 + x1) / 2,
      -0.432,
      (z0 + z1) / 2,
      x1 - x0,
      0.2,
      z1 - z0,
      SITE.street,
    );
  slab(-farX, -46.2, 31.2, 41.2);
  slab(73.1, farX, 31.2, 41.2);
  slab(73.1, farX, -35.8, -28.8);
  for (const [x, half] of [
    [-40.7, 5.5],
    [69.1, 4],
  ]) {
    slab(x - half, x + half, -farZ, -36);
    slab(x - half, x + half, 41.2, farZ);
  }
  const curbs = siteCurbs(model);
  curbs.sidewalks.forEach((p, i) =>
    patch(p, -0.23, 0.18, SITE.sidewalk, `raised-sidewalk-${i}`),
  );
  curbs.islands.forEach((pts, i) => {
    patch(pts, -0.23, 0.2, SITE.curb, `island-curb-${i}`);
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length,
      cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    patch(
      pts.map((q) => [cx + (q[0] - cx) * 0.92, cz + (q[1] - cz) * 0.92]),
      -0.025,
      0.015,
      SITE.planting,
      `planting-bed-${i}`,
    );
  });
  const strip = (a: Vec2, b: Vec2, width: number, c: string, y = -0.207) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    const o = box(
      (a[0] + b[0]) / 2,
      y,
      (a[1] + b[1]) / 2,
      Math.hypot(dx, dz),
      0.012,
      width,
      c,
    );
    o.rotation.y = -Math.atan2(dz, dx);
  };
  // Centre-line dashes, continued along the extensions (east of x 56.5 they
  // keep the phase of the pads' own street stubs).
  const dashes = (
    from: number,
    to: number,
    step: number,
    length: number,
    at: (v: number) => [Vec2, Vec2],
    width: number,
  ) => {
    for (let v = from; v + length <= to; v += step) {
      const [a, b] = at(v);
      strip(a, b, width, SITE.marking, -0.217);
    }
  };
  const northLine = (x: number): [Vec2, Vec2] => [
      [x, 36.3],
      [x + 3, 36.3],
    ],
    westLine = (z: number): [Vec2, Vec2] => [
      [-40.7, z],
      [-40.7, z + 3],
    ];
  dashes(-38, 68, 6, 3, northLine, 0.12);
  dashes(-farX, -47, 6, 3, northLine, 0.12);
  dashes(74, farX, 6, 3, northLine, 0.12);
  dashes(-26, 30, 6, 3, westLine, 0.12);
  dashes(-farZ, -37, 6, 3, westLine, 0.12);
  dashes(42, farZ, 6, 3, westLine, 0.12);
  // The alley (south street) is an unmarked driveway: no centre dashes.
  // STOP is painted across the exit lane where it meets the west street.
  const roadText = (text: string, x0: number, z0: number, h: number) => {
    const d: Vec2 = [Math.sin(h), Math.cos(h)],
      r: Vec2 = [-Math.cos(h), Math.sin(h)], // the reader's right in this map frame
      stroke = 0.24;
    const glyphs: Record<string, number[][]> = {
      S: [
        [0.9, 1.9, 0.1, 1.9],
        [0.1, 1.9, 0.1, 1.05],
        [0.1, 1.05, 0.9, 1.05],
        [0.9, 1.05, 0.9, 0.1],
        [0.9, 0.1, 0.1, 0.1],
      ],
      T: [
        [0.05, 1.9, 0.95, 1.9],
        [0.5, 1.9, 0.5, 0.1],
      ],
      O: [
        [0.1, 0.1, 0.9, 0.1],
        [0.9, 0.1, 0.9, 1.9],
        [0.9, 1.9, 0.1, 1.9],
        [0.1, 1.9, 0.1, 0.1],
      ],
      P: [
        [0.1, 0.1, 0.1, 1.9],
        [0.1, 1.9, 0.9, 1.9],
        [0.9, 1.9, 0.9, 1.05],
        [0.9, 1.05, 0.1, 1.05],
      ],
    };
    const g = new T.Group();
    g.name = `road-text-${text}`;
    root.add(g);
    const total = text.length * 1.15 - 0.25;
    [...text].forEach((ch, k) => {
      const u0 = k * 1.15 - total / 2;
      for (const [a, b, c, e] of glyphs[ch] ?? []) {
        const cu = u0 + (a + c) / 2,
          cv = (b + e) / 2 - 1,
          wx = (c - a) * r[0] + (e - b) * d[0],
          wz = (c - a) * r[1] + (e - b) * d[1];
        const m = box(
          x0 + cu * r[0] + cv * d[0],
          -0.206,
          z0 + cu * r[1] + cv * d[1],
          stroke,
          0.012,
          Math.hypot(wx, wz) + stroke,
          SITE.marking,
          g,
        );
        m.rotation.y = Math.atan2(wx, wz);
      }
    });
  };
  // STOP at the driveway's mouth onto the north strip (aerial), read by a van
  // heading north, with its stop bar across the driveway ahead of it and the
  // one-way arrow behind it.
  roadText('STOP', -22.5, -22.6, Math.PI);
  box(-22.5, -0.206, -24.5, 3.6, 0.012, 0.45, SITE.marking);
  dashes(
    74,
    farX,
    5,
    2.5,
    (x) => [
      [x, -32.3],
      [x + 2.5, -32.3],
    ],
    0.1,
  );
  // The entrance apron: a concrete slab at lot level where the west sidewalk is cut, with a one-way arrow in.
  patch(
    [px(244, 1276), px(350, 1276), px(350, 1441), px(244, 1441)],
    -0.235,
    0.03,
    SITE.curb,
    'entrance-apron',
  );
  // One-way lot: in from the west street, south down the aisle, out by the driveway.
  const arrow = (x: number, z: number, dir: number) => {
    const g = new T.Group();
    g.name = 'one-way-arrow';
    g.position.set(x, -0.206, z);
    g.rotation.y = dir;
    box(0, 0, -0.6, 0.3, 0.012, 2.2, SITE.marking, g);
    const head = new T.Shape();
    head.moveTo(-0.75, 0);
    head.lineTo(0.75, 0);
    head.lineTo(0, -1.3);
    head.closePath();
    const tip = add(new T.ShapeGeometry(head), SITE.marking, 0, 0.006, 0.5, g);
    tip.rotation.x = -Math.PI / 2;
    root.add(g);
  };
  arrow(-33.6, 4.3, Math.PI / 2);
  arrow(-22.5, -6, Math.PI);
  arrow(-22.5, -16, Math.PI);
  arrow(37.7, -16.7, Math.PI);
  arrow(37.7, 12.1, Math.PI);
  // Crosswalks, blue loading access and parking bays are geometry rather than a photograph.
  // Crosswalk across Valley on the east side of Ethel, between the two walks.
  for (let z = 31.9; z < 40.6; z += 0.85)
    box(-34.0, -0.208, z, 2.8, 0.012, 0.4, SITE.marking);
  // Our lot, from the aerial: a west row of head-in stalls behind the palm
  // planter (the fleet's bays, at their pitch), the hatched accessible aisle
  // and stall at its south end, and a row of slightly angled stalls along the
  // building north of the drop-off.
  for (let k = 0; k < 8; k++)
    strip(
      [-31.0, -23.05 + 2.8 * k],
      [-24.9, -23.05 + 2.8 * k],
      0.1,
      SITE.marking,
    );
  for (let x = -30.6; x < -26.6; x += 0.9)
    strip([x, -3.3], [x + 1.6, -1.2], 0.08, SITE.accessible);
  for (const z of [-3.45, -1.05, 1.45])
    strip([-31.0, z], [-26.5, z], 0.1, SITE.accessible);
  box(-27.9, -0.208, 0.2, 1.1, 0.012, 1.1, SITE.accessible);
  const isaRing = add(
    new T.TorusGeometry(0.28, 0.035, 6, 32),
    SITE.marking,
    -27.9,
    -0.191,
    0.2,
  );
  isaRing.rotation.x = -Math.PI / 2;
  for (let k = 0; k < 6; k++)
    strip(
      [-20.4, -19.5 + 2.7 * k],
      [-15.0, -21.5 + 2.7 * k],
      0.1,
      SITE.marking,
    );
  // The rear court behind the east block (Street View and Google Earth): a
  // row of stalls nosed into the building's north faces, and perpendicular
  // stalls along the north edge of the strip in front of the 1300 building.
  for (let k = 0; k <= 6; k++) {
    const x = 0.4 + 2.45 * k,
      face = x > 5.2 && x < 11.8 ? -15.2 : -12.5;
    strip([x, face], [x, face - 5.0], 0.1, SITE.marking);
  }
  for (let k = 0; k <= 15; k++)
    strip(
      [-30.5 + 2.5 * k, -35.8],
      [-30.5 + 2.5 * k, -31.5],
      0.1,
      SITE.marking,
    );
  // The neighbour's lot: angled stalls along the dialysis center and along our
  // east wall, one-way north up the aisle (arrows), the hatched accessible
  // stall at the Valley end.
  for (let z = -17; z <= 12; z += 3)
    strip([45.1, z], [39.7, z + 2.4], 0.1, SITE.marking);
  for (let z = -6; z <= 15; z += 3)
    strip([30.3, z], [35.5, z - 2.4], 0.1, SITE.marking);
  for (let x = 30.6; x < 35.2; x += 0.9)
    strip([x, 15.4], [x + 1.4, 17.4], 0.08, SITE.accessible);
  box(34.6, -0.208, 14.2, 1.0, 0.012, 1.0, SITE.accessible);
  // Abstract model trees: a slender trunk under soft, smooth canopy volumes.
  const canopyGeometry = new T.SphereGeometry(1, 28, 18);
  function tree(x: number, z: number, r: number, h: number, i: number) {
    const [a, b] = px(x, z),
      g = new T.Group();
    g.name = `street-tree-${i}`;
    g.position.set(a, 0, b);
    root.add(g);
    const trunk = Math.max(0.045, Math.min(0.1, r * 0.045));
    // The slender trunk casts no shadow: on its own (the canopy sits above the
    // shadow camera) it read as a bar painted on the road.
    add(
      new T.CylinderGeometry(trunk * 0.7, trunk, h, 10),
      SITE.trunk,
      0,
      h / 2 - 0.2,
      0,
      g,
    ).castShadow = false;
    const tone = SITE.canopy[i % SITE.canopy.length];
    const lobes =
      r > 1.5
        ? [
            [0, 0, 0, 1],
            [0.42, -0.18, 0.2, 0.72],
            [-0.36, -0.12, -0.28, 0.68],
          ]
        : [[0, 0, 0, 1]];
    for (const [ox, oy, oz, k] of lobes) {
      const canopy = add(
        canopyGeometry,
        tone,
        ox * r,
        h + r * 0.22 + oy * r,
        oz * r,
        g,
      );
      canopy.scale.set(r * k, r * k * 0.86, r * k);
    }
  }
  [
    [276, 573, 2.2, 4.2],
    [276, 809, 2.0, 4.0],
    [276, 1025, 2.4, 4.4],
    [276, 1496, 2.6, 4.6],
    [276, 1988, 2.1, 4.0],
    [2945, 376, 3.4, 5.2],
    [3153, 632, 2.8, 4.6],
    [2858, 946, 1.0, 1.8],
    [2858, 1064, 1.0, 1.8],
    [2917, 2047, 1.1, 2.0],
    [3334, 2007, 1.1, 2.0],
    [4152, 278, 2.4, 4.5],
    [4152, 671, 2.6, 4.8],
    [4152, 1064, 2.3, 4.4],
    [4152, 1693, 2.5, 4.6],
    [464, 2334, 0.55, 1.6],
    [551, 2334, 0.55, 1.6],
  ].forEach((p, i) => tree(p[0], p[1], p[2], p[3], i));
  for (const [x, z] of [
    [-31.2, 29.6],
    [-4, 31],
    [30, 29],
    [63.6, -24],
    [-34.4, -21.4],
  ]) {
    add(new T.CylinderGeometry(0.045, 0.065, 5.2, 10), SITE.pole, x, 2.4, z);
    box(x + 0.42, 4.98, z, 0.9, 0.07, 0.2, SITE.lamp);
  }
  // The neighbour to the east, from the aerial (2026-10-01): the two-storey
  // dialysis center along S Campbell Ave (x 47-67, z -27.5..22.6) with its
  // angled-stall lot between it and this building, entered from Valley Blvd.
  const NB = { x0: 45.5, x1: 63.3, z0: -26.6, z1: 23.5, h: 7.6 };
  box(
    (NB.x0 + NB.x1) / 2,
    -0.2,
    (NB.z0 + NB.z1) / 2,
    NB.x1 - NB.x0,
    NB.h,
    NB.z1 - NB.z0,
    SITE.neighbor,
  ).name = 'neighbor-east-estimated-height';
  box(
    (NB.x0 + NB.x1) / 2,
    NB.h - 0.2,
    (NB.z0 + NB.z1) / 2,
    NB.x1 - NB.x0 + 0.16,
    0.16,
    NB.z1 - NB.z0 + 0.16,
    SITE.coping,
  );
  for (const y of [1.1, 4.9])
    for (let z = NB.z0 + 2; z < NB.z1 - 1; z += 3.2)
      box(NB.x0 - 0.015, y, z, 0.025, 1.6, 1.7, SITE.neighborGlass);
  for (let i = 0; i < 9; i++) {
    const x = NB.x0 + 3 + (i % 3) * 6.5,
      z = NB.z0 + 5 + Math.floor(i / 3) * 15;
    box(x, NB.h - 0.2, z, 1.6, 0.9, 1.3, '#b0b2a8');
  }
  // Planters in the neighbour's lot: along our east wall, and either side of
  // its Valley Blvd entrance.
  for (const [x0, z0, x1, z1] of [
    [30.0, -10.3, 32.6, -6.8],
    [30.0, 19.0, 35.5, 24.6],
    [41.6, 19.0, 45.1, 23.0],
  ]) {
    patch(
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ],
      -0.23,
      0.2,
      SITE.curb,
      'neighbor-planter',
    );
    patch(
      [
        [x0 + 0.25, z0 + 0.25],
        [x1 - 0.25, z0 + 0.25],
        [x1 - 0.25, z1 - 0.25],
        [x0 + 0.25, z1 - 0.25],
      ],
      -0.025,
      0.015,
      SITE.planting,
      'neighbor-planting',
    );
  }
  // Simplified, softly rounded vehicles: stone bodies with dark glazing.
  function car(id: string, x: number, z: number, angle: number, color: string) {
    const g = new T.Group();
    g.name = id;
    g.position.set(x, -0.18, z);
    g.rotation.y = angle;
    root.add(g);
    const rounded = (
      w: number,
      h: number,
      d: number,
      r: number,
      c: string,
      y: number,
      zz = 0,
    ) => add(new RoundedBoxGeometry(w, h, d, 3, r), c, 0, y + h / 2, zz, g);
    rounded(1.76, 0.58, 3.94, 0.16, color, 0.3);
    rounded(1.5, 0.52, 2.05, 0.14, SITE.glass, 0.84, -0.12);
    rounded(1.46, 0.08, 1.7, 0.04, color, 1.33, -0.14);
    for (const sx of [-0.8, 0.8])
      for (const sz of [-1.27, 1.27]) {
        const w = add(
          new T.CylinderGeometry(0.31, 0.31, 0.2, 18),
          SITE.tyre,
          sx,
          0.31,
          sz,
          g,
        );
        w.rotation.z = Math.PI / 2;
      }
    for (const sx of [-0.56, 0.56])
      box(sx, 0.62, 1.955, 0.32, 0.1, 0.03, SITE.headlight, g);
    return g;
  }
  // No parked cars: the lots read by their striping and planters.
  ([] as number[][]).forEach((p, i) => {
    const [x, z] = px(p[0], p[1]);
    car(`parked-car-${i}`, x, z, p[2], SITE.cars[i]);
  });
  const traffic = [
    car('street-car-1', 0, 39.4, Math.PI / 2, SITE.cars[3]),
    car('street-car-2', 0, 43.4, -Math.PI / 2, SITE.cars[1]),
  ];
  function tick(time: number) {
    for (let i = 0; i < traffic.length; i++) {
      const p = sampleStreetCar(i, time);
      traffic[i].position.copy(p.position);
      traffic[i].rotation.y = p.heading;
      traffic[i].userData.trafficPhase = p.phase;
    }
  }
  return { root, tick, traffic };
}
