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
const SIDEWALKS_PX = [
  [
    [180, 260],
    [180, 1135],
    [350, 1135],
    [350, 210],
  ],
  [
    [180, 1359],
    [180, 2390],
    [240, 2535],
    [500, 2535],
    [3564, 2365],
    [3564, 2195],
    [2788, 2250],
    [1610, 2315],
    [1050, 2335],
    [1050, 2260],
    [350, 2260],
    [350, 1359],
  ],
  [
    [180, 260],
    [210, 180],
    [270, 145],
    [3564, 145],
    [3564, 197],
    [350, 197],
    [350, 260],
  ],
] as Vec2[][];
const CURB_ISLANDS_PX = [
  [
    [350, 210],
    [550, 210],
    [550, 229],
    [378, 229],
    [378, 898],
    [350, 898],
  ],
  [
    [350, 1470],
    [478, 1470],
    [478, 1517],
    [390, 1517],
    [390, 2255],
    [350, 2255],
  ],
  [
    [804, 210],
    [990, 210],
    [804, 309],
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
export const STREET_EXTENT = { x: 130, z: 95 };

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
  box(4, -0.43, 41.3, 105, 0.2, 10, SITE.street);
  box(-44.4, -0.43, 5, 8, 0.2, 82, SITE.street);
  box(3, -0.43, -32.3, 105, 0.2, 7, SITE.street);
  box(54, -0.43, 5, 8, 0.2, 82, SITE.street);
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
  slab(-farX, -48.5, 36.3, 46.3);
  slab(56.5, farX, 36.3, 46.3);
  slab(55.5, farX, -35.8, -28.8);
  for (const x of [-44.4, 54]) {
    slab(x - 4, x + 4, -farZ, -36);
    slab(x - 4, x + 4, 46, farZ);
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
  // The west row is reserved and striped by the animated fleet controller.
  for (let y = 305; y < 1070; y += 148)
    strip(px(780, y + 160), px(1032, y + 25), 0.075, SITE.marking);
  for (let y = 535; y < 2120; y += 138)
    strip(px(3170, y + 166), px(3390, y - 47), 0.075, SITE.marking);
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
      [x, 41.4],
      [x + 3, 41.4],
    ],
    westLine = (z: number): [Vec2, Vec2] => [
      [-44.4, z],
      [-44.4, z + 3],
    ];
  dashes(-40, 55, 6, 3, northLine, 0.12);
  dashes(-farX, -49, 6, 3, northLine, 0.12);
  dashes(56.5, farX, 6, 3, northLine, 0.12);
  dashes(-26, 40, 6, 3, westLine, 0.12);
  dashes(-farZ, -37, 6, 3, westLine, 0.12);
  dashes(47, farZ, 6, 3, westLine, 0.12);
  dashes(
    -40,
    50,
    5,
    2.5,
    (x) => [
      [x, -32.3],
      [x + 2.5, -32.3],
    ],
    0.1,
  );
  dashes(
    59,
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
    [px(180, 1135), px(350, 1135), px(350, 1359), px(180, 1359)],
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
    head.lineTo(0, 1.3);
    head.closePath();
    const tip = add(new T.ShapeGeometry(head), SITE.marking, 0, 0.006, 0.5, g);
    tip.rotation.x = -Math.PI / 2;
    root.add(g);
  };
  arrow(-34.5, 1.5, Math.PI / 2);
  arrow(-22.5, -6, Math.PI);
  arrow(-22.5, -16, Math.PI);
  // Crosswalks, blue loading access and parking bays are geometry rather than a photograph.
  for (let z = 38; z < 45; z += 0.85)
    box(-36, -0.208, z, 3.2, 0.012, 0.4, SITE.marking);
  // Accessible parking in front of the drop-off: the van stall, a hatched access
  // aisle and a second stall south of it, each stall with its symbol (Street View).
  const stallW = 2.5,
    aisleW = 2.4,
    stallX0 = -24.6,
    stallX1 = -17.2;
  const stallZ = [1.5, 1.5 - stallW / 2 - aisleW - stallW / 2];
  for (const z of stallZ) {
    for (const edge of [-1, 1])
      box(
        (stallX0 + stallX1) / 2,
        -0.208,
        z + (edge * stallW) / 2,
        stallX1 - stallX0,
        0.012,
        0.1,
        SITE.accessible,
      );
    box(-20.9, -0.208, z, 1.1, 0.012, 1.1, SITE.accessible);
    const ring = add(
      new T.TorusGeometry(0.28, 0.035, 6, 32),
      SITE.marking,
      -20.9,
      -0.191,
      z,
    );
    ring.rotation.x = -Math.PI / 2;
  }
  const aisleZ = (stallZ[0] + stallZ[1]) / 2;
  for (let x = stallX0 + 0.4; x < stallX1; x += 1.0)
    strip(
      [x, aisleZ - aisleW / 2 + 0.1],
      [x + 1.2, aisleZ + aisleW / 2 - 0.1],
      0.08,
      SITE.accessible,
    );
  for (const edge of [-1, 1])
    box(
      (stallX0 + stallX1) / 2,
      -0.208,
      aisleZ + (edge * aisleW) / 2,
      stallX1 - stallX0,
      0.012,
      0.1,
      SITE.accessible,
    );
  // Abstract model trees: a slender trunk under soft, smooth canopy volumes.
  const canopyGeometry = new T.SphereGeometry(1, 28, 18);
  function tree(x: number, z: number, r: number, h: number, i: number) {
    const [a, b] = px(x, z),
      g = new T.Group();
    g.name = `street-tree-${i}`;
    g.position.set(a, 0, b);
    root.add(g);
    const trunk = Math.max(0.045, Math.min(0.1, r * 0.045));
    add(
      new T.CylinderGeometry(trunk * 0.7, trunk, h, 10),
      SITE.trunk,
      0,
      h / 2 - 0.2,
      0,
      g,
    );
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
    [212, 811, 2.3, 4.0],
    [225, 2090, 1.9, 3.4],
    [3230, 240, 2.7, 5.1],
    [2815, 610, 2.6, 4.1],
    [2930, 1030, 1.3, 2.9],
    [3250, 2120, 1, 2.5],
    [464, 2325, 0.55, 1.6],
    [551, 2325, 0.55, 1.6],
  ].forEach((p, i) => tree(p[0], p[1], p[2], p[3], i));
  for (const [x, z] of [
    [-34, 30],
    [-4, 31],
    [30, 29],
    [44, -24],
    [-36, -23],
  ]) {
    add(new T.CylinderGeometry(0.045, 0.065, 5.2, 10), SITE.pole, x, 2.4, z);
    box(x + 0.42, 4.98, z, 0.9, 0.07, 0.2, SITE.lamp);
  }
  // Partial neighboring footprint visible along the right-hand boundary of the supplied plan.
  const a = px(3430, 310),
    b = px(3564, 2170);
  box(
    (a[0] + b[0]) / 2,
    -0.2,
    (a[1] + b[1]) / 2,
    b[0] - a[0],
    5.5,
    b[1] - a[1],
    SITE.neighbor,
  ).name = 'neighbor-east-estimated-height';
  box(
    (a[0] + b[0]) / 2,
    5.3,
    (a[1] + b[1]) / 2,
    b[0] - a[0] + 0.16,
    0.16,
    b[1] - a[1] + 0.16,
    SITE.coping,
  );
  for (let z = a[1] + 2; z < b[1] - 1; z += 3.2)
    box(a[0] - 0.015, 0.65, z, 0.025, 2, 1.7, SITE.neighborGlass);
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
  [
    [3240, 857, 0.78],
    [3290, 1520, 0.78],
  ].forEach((p, i) => {
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
