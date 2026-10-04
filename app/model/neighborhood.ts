import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Facility, Vec2 } from './schema';
import { GARAGE_RAMP } from './alhambra-exterior';
import { sampleStreetCar, type StreetSide } from './traffic-routes';

// Presentation-model site palette: warm light asphalt, soft white markings,
// pale concrete and muted sage planting.
const SITE = {
  asphalt: '#c2beb7',
  street: '#bbb7b0',
  sidewalk: '#e4e0d7',
  curb: '#dcd7cd',
  planting: '#b4bea2',
  marking: '#f8f6f1',
  /** Accessible-parking blue (hatching and the symbol's ground), as painted on the lot (photo 2026-10-03). */
  accessible: '#2f62b3',
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
  // The fan palm's island at the head of the angled row along our east wall, one stall wide between the row's
  // lines (satellite, 2026-10-03): x 30.4 -> 35.95 between the 49-degree lines at z -7.0 and -4.26 (at x 30.4).
  [
    [2823, 907],
    [3041, 1158],
    [3041, 1265],
    [2823, 1015],
  ],
  // The planter against our east wall at the row's foot, x 29.75 -> 31.4, z 21.9 -> 26.8.
  [
    [2797, 2043],
    [2862, 2043],
    [2862, 2235],
    [2797, 2235],
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
/**
 * Each ring street's drawn bed across its width, [min, max] in world metres:
 * z for the north (Valley Blvd) and south (the alley) streets, x for the east
 * (Campbell) and west (Ethel) ones. A community pad's access stub joins its
 * street at the bed's near edge (validate-community-traffic.mjs).
 */
export const STREET_BEDS: Record<StreetSide, [number, number]> = {
  north: [31.2, 41.2],
  south: [-35.8, -28.8],
  east: [65.1, 73.1],
  west: [-46.2, -35.2],
};
/** z extent of the east and west streets' slabs along the block. */
const BLOCK_Z = [-36, 46];
/**
 * Every street slab the scene draws, as world x/z rectangles: the four round
 * the block, then (`extension`) their continuations out to `STREET_EXTENT`.
 */
export function streetSlabs() {
  const { north: N, south: S, east: E, west: W } = STREET_BEDS,
    { x: farX, z: farZ } = STREET_EXTENT,
    slab = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      extension = true,
    ) => ({
      min: [x0, z0] as Vec2,
      max: [x1, z1] as Vec2,
      extension,
    });
  return [
    slab(W[0], E[1], N[0], N[1], false),
    slab(W[0], W[1], BLOCK_Z[0], BLOCK_Z[1], false),
    slab(W[0], E[1], S[0], S[1], false),
    slab(E[0], E[1], BLOCK_Z[0], BLOCK_Z[1], false),
    slab(-farX, W[0], N[0], N[1]),
    slab(E[1], farX, N[0], N[1]),
    slab(E[1], farX, S[0], S[1]),
    ...[W, E].flatMap(([x0, x1]) => [
      slab(x0, x1, -farZ, BLOCK_Z[0]),
      slab(x0, x1, N[1], farZ),
    ]),
  ];
}

/**
 * The building's outline with the garage ramp's well added (alhambra-exterior.ts GARAGE_RAMP): the ground is cut
 * round both, the ramp running north from the wing's north wall between the loading block's return and the wing's end.
 */
function withGarageRamp(outline: Vec2[]): Vec2[] {
  const R = GARAGE_RAMP,
    near = (p: Vec2, x: number, z: number) =>
      Math.abs(p[0] - x) < 0.01 && Math.abs(p[1] - z) < 0.01;
  const i = outline.findIndex((p) => near(p, R.x0, R.door));
  if (i < 0 || !near(outline[i + 1], R.x1, R.door)) return outline;
  return [
    ...outline.slice(0, i),
    [R.x0, R.top],
    [R.x1, R.top],
    ...outline.slice(i + 1),
  ];
}
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
  /**
   * The International Symbol of Access painted in a stall: the white wheelchair figure on a blue square, `size` m
   * across, its head toward `up` (the scene heading the figure's top points to, as a rotation about y). Drawn to a
   * canvas in the browser; headless (the validators) it is the blue square alone.
   */
  function accessSymbol(x: number, z: number, size: number, up: number) {
    if (typeof document === 'undefined') {
      box(x, -0.208, z, size, 0.012, size, SITE.accessible);
      return;
    }
    const n = 256,
      canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const g = canvas.getContext('2d')!;
    g.fillStyle = SITE.accessible;
    g.fillRect(0, 0, n, n);
    g.strokeStyle = g.fillStyle = '#f8f6f1';
    g.lineCap = g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeRect(10, 10, n - 20, n - 20);
    // Head, back and seat, the arm, the leg to the footrest, and the open wheel round the seat.
    g.beginPath();
    g.arc(104, 48, 20, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(100, 82);
    g.lineTo(100, 150);
    g.lineTo(160, 150);
    g.lineTo(184, 204);
    g.lineTo(212, 204);
    g.stroke();
    g.lineWidth = 16;
    g.beginPath();
    g.moveTo(100, 108);
    g.lineTo(148, 108);
    g.stroke();
    // The wheel, open at the top behind the back.
    g.beginPath();
    g.arc(112, 176, 58, (-48 * Math.PI) / 180, (228 * Math.PI) / 180);
    g.stroke();
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    const geo = new T.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const m = new T.Mesh(
      geo,
      new T.MeshStandardMaterial({ map, roughness: 0.85 }),
    );
    m.position.set(x, -0.195, z);
    m.rotation.y = up;
    m.receiveShadow = true;
    root.add(m);
  }
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
    withGarageRamp(model.site.buildingOutline),
  );
  // Streets continue beyond the crop; their length is presentation context, not a site survey.
  // Extensions out to STREET_EXTENT sit 2 mm lower so they never fight with
  // the slabs round the block or with a pad's own street stub.
  for (const { min, max, extension } of streetSlabs())
    box(
      (min[0] + max[0]) / 2,
      extension ? -0.432 : -0.43,
      (min[1] + max[1]) / 2,
      max[0] - min[0],
      0.2,
      max[1] - min[1],
      SITE.street,
    ).name = 'street-roadway';
  const { x: farX, z: farZ } = STREET_EXTENT;
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
    return o;
  };
  // Parking-stall lines, kept off the street roadways and the pads' drive
  // stubs (validate-traffic).
  const stall = (a: Vec2, b: Vec2) =>
    (strip(a, b, 0.1, SITE.marking).name = 'parking-stall-line');
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
  // STOP at the driveway's mouth onto the alley (aerial), read by a van
  // heading south, with its stop bar across the driveway ahead of it and the
  // one-way arrow behind it. The mouth runs from the bay row's curb island
  // (east edge x −27.0) to the palm island (west edge x −20.2), so both are
  // centred on x −23.6; the lanes themselves sit a little east of centre.
  roadText('STOP', -23.6, -22.6, Math.PI);
  box(-23.6, -0.206, -24.5, 6.2, 0.012, 0.45, SITE.marking);
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
  arrow(37.7, 16.8, Math.PI);
  // Crosswalks, blue loading access and parking bays are geometry rather than a photograph.
  // Crosswalk across Valley on the east side of Ethel, between the two walks.
  for (let z = 31.9; z < 40.6; z += 0.85)
    box(-34.0, -0.208, z, 2.8, 0.012, 0.4, SITE.marking);
  // Our lot, from the aerial: a west row of head-in stalls behind the palm
  // planter (the fleet's bays, at their pitch), the hatched accessible aisle
  // and stall at its south end, and a row of slightly angled stalls along the
  // building north of the drop-off.
  // Seven white stall lines; the eighth line (z −3.45) is the accessible aisle's blue edge, not drawn twice. The
  // aisle and stall lines run the full stall length, as the white ones do.
  for (let k = 0; k < 7; k++)
    stall([-31.0, -23.05 + 2.8 * k], [-24.9, -23.05 + 2.8 * k]);
  for (let x = -30.9; x + 1.6 <= -24.95; x += 0.9)
    strip([x, -3.3], [x + 1.6, -1.2], 0.08, SITE.accessible);
  for (const z of [-3.45, -1.05, 1.45])
    strip([-31.0, z], [-24.9, z], 0.1, SITE.accessible);
  accessSymbol(-27.9, 0.2, 1.1, Math.PI / 2);
  for (let k = 0; k < 6; k++)
    stall([-20.4, -19.5 + 2.7 * k], [-15.0, -21.5 + 2.7 * k]);
  // The rear court behind the east block: two stalls in front of the electrical room's gates (cars park there,
  // photos 2026-10-02), none in front of the loading door or over the garage ramp. Across the alley, perpendicular
  // stalls entered from it along the north edge of the paved strip in front of the 1300 building, south of the
  // alley's curb line (z −35.8), not on its lanes; the row stops short of the partner day center's drive stub
  // (x −3.9 to 13.6), which crosses the strip.
  for (const x of [2.6, 5.2]) stall([x, -15.5], [x, -20.5]);
  box(-18.0, -0.432, -38.2, 26.0, 0.2, 4.8, SITE.asphalt).name =
    'strip-1300-building';
  // Along the clinic's alley face (photo 2026-10-03): two parallel stalls, one either side of the clear zone in
  // front of its service door and downspout (lines at x -4.82 and -8.53 from the wall out 2.6 m), with their outer
  // line; the east stall runs open past the wall's corner.
  for (const x of [-4.82, -8.53]) stall([x, -22.6], [x, -25.2]);
  stall([0.6, -25.2], [-4.82, -25.2]);
  stall([-8.53, -25.2], [-14.6, -25.2]);
  for (let k = 0; k <= 10; k++)
    stall([-30.5 + 2.5 * k, -35.8], [-30.5 + 2.5 * k, -40.1]);
  // The lot between our east wall and the dialysis center (satellite, 2026-10-03, lines found by a Hough fit to within
  // a few cm): one-way north up a 3.5 m aisle (x 35.95 -> 39.5, arrows), angled stalls either side entered heading
  // north, so both rows lean the same way: along the dialysis center at 54 degrees to the aisle's cross line, lines
  // every 4.68 m from the aisle (x 39.5) to its walk (x 44.45); along our east wall at 49 degrees, lines every ~3.7 m
  // from the agave strip (x 30.4) to the aisle (x 35.95), after the fan palm's island: four stalls, the accessible
  // stall (its symbol by the aisle) and its hatched access aisle, then the planters at the Valley end.
  for (let k = -3; k <= 5; k++) {
    const c = -2.24 + 4.68 * k;
    stall([39.5, c], [44.45, c - 6.88]);
  }
  const eastRow = [-1.08, 2.46, 6.04, 10.02, 13.87, 17.62, 21.37],
    eastSlope = 1.15,
    eastLine = (c: number, x: number): Vec2 => [x, c + eastSlope * (x - 30.4)];
  for (const c of eastRow) stall(eastLine(c, 30.4), eastLine(c, 35.95));
  for (let x = 30.6; x < 35.6; x += 0.8)
    strip(
      eastLine(eastRow[5], x),
      eastLine(eastRow[6], x + 0.55),
      0.08,
      SITE.accessible,
    );
  accessSymbol(34.9, 21.4, 1.0, Math.atan2(5.55, 5.55 * eastSlope));
  // In the court by the staff entrance, nosed toward the east block's wall (z 3.51): the hatched access aisle beside
  // the entrance's planter (x 19.35 -> 21.2), the accessible stall with its symbol at the court end, two more stalls.
  for (const x of [21.2, 23.9, 26.33, 29.15]) stall([x, -2.4], [x, 3.3]);
  for (let z = -2.1; z < 2.9; z += 0.8)
    strip([19.45, z + 0.6], [21.1, z], 0.08, SITE.accessible);
  accessSymbol(22.55, -1.6, 1.0, Math.PI);
  // the walkway from the staff entrance's landing out between its two planters, hatched like the access aisle
  for (let x = 18.1; x < 20.2; x += 0.75)
    strip([x, -5.45], [x + 0.55, -6.65], 0.08, SITE.accessible);
  // Five more outside the staff entrance, either side of a one-way aisle running south, measured from two photos
  // taken 23 s apart on 2026-10-02 (the alley view, each car placed by its licence plate's width, and the view of the
  // entrance, which shows the first car's front tyre at the second planter's curb). As [c, s from, s to] along each
  // row's bearing (s forward along the stall, c across it): three west of the aisle nosed SSW (206 degrees, 2.45 m
  // stalls), their noses stepping from the second planter's curb to the ramp's rail, the last stall bounded by the
  // cactus planter; two east of it, side by side by the alley (below).
  const row = (bearing: number, lines: number[][]) => {
    const b = (bearing * Math.PI) / 180,
      d = [Math.sin(b), -Math.cos(b)],
      n = [d[1], -d[0]];
    const at = (c: number, s: number): Vec2 => [
      c * n[0] + s * d[0],
      c * n[1] + s * d[1],
    ];
    for (const [c, s0, s1] of lines) stall(at(c, s0), at(c, s1));
  };
  row(206, [
    [13.15, -22.0, -17.32],
    [10.65, -24.6, -16.9],
    [8.2, -29.3, -18.75],
  ]);
  // East of the aisle, by the alley (Street View May 2025 from the alley, camera solved against the court): two
  // stalls side by side, nosed SSE (151 degrees) along the tree island's west edge; beyond them the left-turn path
  // runs east to the dialysis center's aisle and its row (north of the palm's island), an arrow marking it.
  row(151, [
    [30.75, -6.28, -0.88],
    [33.35, -6.28, -0.88],
    [35.95, -6.28, -0.88],
  ]);
  arrow(25.6, -10.4, Math.PI / 2);
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
    [3393, 435, 2.8, 4.6], // on the dialysis center's walk: its canopy shades the stalls, not a trunk in the aisle
    [2941, 1072, 1.0, 1.8],
    [2961, 2188, 1.1, 2.0],
    [3341, 2099, 1.1, 2.0],
    [4152, 278, 2.4, 4.5],
    [4152, 671, 2.6, 4.8],
    [4152, 1064, 2.3, 4.4],
    [4152, 1693, 2.5, 4.6],
  ].forEach((p, i) => tree(p[0], p[1], p[2], p[3], i));
  // (The Valley street lamp at x -4 is night-lights.ts's; no second pole there.)
  for (const [x, z] of [
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
  // Planter in the neighbour's lot: the round one by the accessible stall's access aisle at the Valley end (the
  // dialysis side's is the curb island past its last stall). None north of the palm's island: that is the court's
  // left-turn path into the dialysis aisle (the dispatcher, 2026-10-04).
  for (const [x0, z0, x1, z1] of [[32.6, 24.0, 35.2, 26.8]]) {
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
  // Simplified, softly rounded vehicles: stone bodies with dark glazing, for
  // the street cars (no parked cars: the lots read by their striping and
  // planters).
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
