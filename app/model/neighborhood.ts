import * as T from 'three';
import type { Facility, Vec2 } from './schema';

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
        new T.MeshStandardMaterial({ color: c, roughness: 0.91 }),
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
    '#3a4650',
    'parking-and-street-bed',
    model.site.buildingOutline,
  );
  // Streets continue beyond the crop; their length is presentation context, not a site survey.
  box(4, -0.43, 41.3, 105, 0.2, 10, '#45505a');
  box(-44.4, -0.43, 5, 8, 0.2, 82, '#45505a');
  box(3, -0.43, -32.3, 105, 0.2, 7, '#45505a');
  box(54, -0.43, 5, 8, 0.2, 82, '#45505a');
  const sidewalks = [
    [
      [180, 260],
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
      [350, 210],
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
  sidewalks.forEach((p, i) =>
    patch(
      p.map((q) => px(...q)),
      -0.23,
      0.18,
      '#b9c4c3',
      `raised-sidewalk-${i}`,
    ),
  );
  const islands = [
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
  islands.forEach((p, i) => {
    const pts = p.map((q) => px(...q));
    patch(pts, -0.23, 0.2, '#c4cdc6', `island-curb-${i}`);
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length,
      cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    patch(
      pts.map((q) => [cx + (q[0] - cx) * 0.92, cz + (q[1] - cz) * 0.92]),
      -0.025,
      0.015,
      '#658054',
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
  for (let y = 420; y <= 1220; y += 100)
    strip(px(384, y), px(555, y), 0.075, '#e1e2d8');
  for (let y = 305; y < 1070; y += 148)
    strip(px(780, y + 160), px(1032, y + 25), 0.075, '#e1e2d8');
  for (let y = 535; y < 2120; y += 138)
    strip(px(3170, y + 166), px(3390, y - 47), 0.075, '#e1e2d8');
  for (let x = -40; x < 52; x += 6)
    strip([x, 41.4], [x + 3, 41.4], 0.12, '#e9debf', -0.217);
  for (let z = -26; z < 37; z += 6)
    strip([-44.4, z], [-44.4, z + 3], 0.12, '#e9debf', -0.217);
  for (let x = -40; x < 50; x += 5)
    strip([x, -32.3], [x + 2.5, -32.3], 0.1, '#e5dec9', -0.217);
  // Crosswalks, blue loading access and parking bays are geometry rather than a photograph.
  for (let z = 38; z < 45; z += 0.85)
    box(-36, -0.208, z, 3.2, 0.012, 0.4, '#e4e7df');
  for (let i = 0; i < 10; i++)
    strip(px(351 + i * 42, 1010), px(393 + i * 42, 1060), 0.07, '#4fa3b6');
  for (const y of [936, 1160]) {
    const [x, z] = px(530, y);
    box(x, -0.208, z, 1.2, 0.012, 1.2, '#368cb0');
    const ring = add(
      new T.TorusGeometry(0.31, 0.04, 6, 18),
      '#f4f0d9',
      x,
      -0.191,
      z,
    );
    ring.rotation.x = -Math.PI / 2;
  }
  function tree(x: number, z: number, r: number, h: number, i: number) {
    const [a, b] = px(x, z),
      g = new T.Group();
    g.name = `street-tree-${i}`;
    g.position.set(a, 0, b);
    root.add(g);
    add(
      new T.CylinderGeometry(0.12, 0.19, h * 0.65, 8),
      '#766549',
      0,
      h * 0.325,
      0,
      g,
    );
    for (let j = 0; j < 5; j++) {
      const angle = (j * Math.PI * 2) / 5;
      add(
        new T.IcosahedronGeometry(r * (j % 2 ? 0.72 : 0.85), 1),
        j % 2 ? '#60814e' : '#729557',
        Math.cos(angle) * r * 0.4,
        h + Math.sin(j) * 0.25,
        Math.sin(angle) * r * 0.4,
        g,
      );
    }
  }
  [
    [212, 811, 1.05, 2.3],
    [225, 2090, 1.9, 3.4],
    [3230, 240, 2.7, 5.1],
    [2815, 610, 2.6, 4.1],
    [2930, 1030, 1.3, 2.9],
    [3250, 2120, 1, 2.5],
    [545, 2325, 0.6, 1.2],
    [702, 2320, 0.6, 1.2],
    [855, 2310, 0.6, 1.2],
  ].forEach((p, i) => tree(p[0], p[1], p[2], p[3], i));
  for (const [x, z] of [
    [-34, 30],
    [-20, 32],
    [-4, 31],
    [30, 29],
    [44, -24],
    [-36, -23],
  ]) {
    add(new T.CylinderGeometry(0.065, 0.09, 5.2, 8), '#5d696b', x, 2.4, z);
    box(x + 0.42, 4.98, z, 0.9, 0.09, 0.24, '#e8eddd');
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
    '#c4c8bf',
  ).name = 'neighbor-east-estimated-height';
  box(
    (a[0] + b[0]) / 2,
    5.3,
    (a[1] + b[1]) / 2,
    b[0] - a[0] + 0.16,
    0.16,
    b[1] - a[1] + 0.16,
    '#9eaead',
  );
  for (let z = a[1] + 2; z < b[1] - 1; z += 3.2)
    box(a[0] - 0.015, 0.65, z, 0.025, 2, 1.7, '#62898b');
  function car(id: string, x: number, z: number, angle: number, color: string) {
    const g = new T.Group();
    g.name = id;
    g.position.set(x, -0.18, z);
    g.rotation.y = angle;
    root.add(g);
    box(0, 0.35, 0, 1.74, 0.54, 3.9, color, g);
    box(0, 0.88, -0.1, 1.55, 0.6, 2.1, '#759a9e', g);
    box(0, 1.43, -0.1, 1.52, 0.07, 1.6, color, g);
    for (const sx of [-0.86, 0.86])
      for (const sz of [-1.27, 1.27]) {
        const w = add(
          new T.CylinderGeometry(0.32, 0.32, 0.18, 12),
          '#24363f',
          sx,
          0.32,
          sz,
          g,
        );
        w.rotation.z = Math.PI / 2;
      }
    for (const sx of [-0.55, 0.55])
      box(sx, 0.61, 1.962, 0.3, 0.17, 0.025, '#f6edc8', g);
    return g;
  }
  [
    [480, 373, Math.PI / 2],
    [480, 665, Math.PI / 2],
    [882, 492, 1.03],
    [3240, 857, 0.78],
    [3290, 1520, 0.78],
  ].forEach((p, i) => {
    const [x, z] = px(p[0], p[1]);
    car(
      `parked-car-${i}`,
      x,
      z,
      p[2],
      ['#769297', '#d9dfd7', '#316e78', '#577e81', '#e3e3d9'][i],
    );
  });
  const traffic = [
    car('street-car-1', 0, 39.4, Math.PI / 2, '#d9e4dc'),
    car('street-car-2', 0, 43.4, -Math.PI / 2, '#33747b'),
  ];
  const circuits = traffic.map((_, i) => {
    const o = i * 2.3;
    return new T.CatmullRomCurve3(
      [
        [-40.5, 39.4 + o],
        [49, 39.4 + o],
        [52.2 + o, 36],
        [52.2 + o, -27.5],
        [49, -30.7 - o],
        [-40.5, -30.7 - o],
        [-43.8 - o, -27.5],
        [-43.8 - o, 36],
      ].map((p) => new T.Vector3(p[0], -0.18, p[1])),
      true,
      'catmullrom',
      0.15,
    );
  });
  function tick(time: number) {
    for (let i = 0; i < traffic.length; i++) {
      const direction = i ? -1 : 1,
        phase = ((((time / 180) * direction + i * 0.42) % 1) + 1) % 1;
      traffic[i].position.copy(circuits[i].getPointAt(phase));
      const v = circuits[i].getTangentAt(phase).multiplyScalar(direction);
      traffic[i].rotation.y = Math.atan2(v.x, v.z);
    }
  }
  return { root, tick, traffic };
}
