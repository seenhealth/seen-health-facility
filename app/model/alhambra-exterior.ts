import * as T from 'three';
import type { Facility, Vec2 } from './schema';
import { exteriorPrimitives } from './exterior-primitives';

/**
 * Rear court planters (Street View, Google Earth) as [x0, z0, x1, z1]: a
 * curbed island with a tall fan palm west of the stall row, and a palm
 * cluster at its east end. The delivery trucks keep clear of both
 * (validate-traffic).
 */
export const REAR_COURT_PLANTERS = [
  [1.0, -21.4, 4.0, -18.2],
  [13.2, -24.0, 16.4, -20.4],
] as const;

/**
 * The drop-off at the lobby's sliding entrance (Street View, May 2025), in
 * plan (x, z) with the heights people walk at. A landing runs along the lobby
 * wall across the glass door, window and side door at floor level, with two
 * short steps down at its −z end. The accessible ramp is a switchback: the
 * upper run descends from the landing along the wall toward the wing, turns
 * on a landing beside the block wall, and the lower run comes back in front
 * of it down to the lot. Bronze rails line the lot side of the landing and
 * the upper run, both sides of the lower run and the turn landing's west
 * edge. A low curbed palm planter stands just beyond the foot of the steps.
 *
 * `buildAlhambraExterior` draws the drop-off from these numbers; the routes
 * people take over it (scripts/apply-drop-off-route.mjs, fleet-crew.ts) and
 * the validators that keep vans and people off its rails read them too.
 */
export const DROP_OFF = (() => {
  const street = -0.23,
    top = 0,
    rise = top - street,
    midTop = top - rise / 2,
    width = 1.3;
  const landing = { x: -15.5, z0: -2.0, z1: 3.6 },
    upper = { x: landing.x, z0: landing.z1, z1: 7.6 },
    turn = { x0: -17.95, x1: -14.85, z0: 7.6, z1: 8.75 },
    lower = { x: -17.15, z0: 2.9, z1: 7.6 };
  /** Steps down from the landing's −z end to `z0`: `count` treads `depth` deep, equal risers to the lot. */
  // Three treads 0.3 m deep (photo 2026-10-02).
  const count = 3,
    depth = 0.3,
    steps = { count, depth, z0: landing.z0 - count * depth };
  const riser = rise / (steps.count + 1);
  const upperY = (z: number) =>
    top - ((rise / 2) * (z - upper.z0)) / (upper.z1 - upper.z0);
  const lowerY = (z: number) =>
    midTop - ((rise / 2) * (lower.z1 - z)) / (lower.z1 - lower.z0);
  const lotSide = landing.x - width / 2 - 0.05;
  /** Rail lines at constant x from z0 to z1, standing on the surface at height y(z). */
  const rails = {
    landing: { x: lotSide, z0: landing.z0, z1: landing.z1, y: () => top },
    upper: { x: lotSide, z0: upper.z0, z1: upper.z1, y: upperY },
    lowerEast: {
      x: lower.x + width / 2 + 0.05,
      z0: lower.z0,
      z1: lower.z1,
      y: lowerY,
    },
    lowerWest: {
      x: lower.x - width / 2 - 0.05,
      z0: lower.z0,
      z1: lower.z1,
      y: lowerY,
    },
    turn: {
      x: turn.x0 + 0.05,
      z0: turn.z0,
      z1: turn.z1 - 0.05,
      y: () => midTop,
    },
  };
  /** Planter centre and size; its curb faces the lot. */
  const planter = { x: -16.35, z: -4.7, w: 2.3, d: 3.4 };
  const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const within = (x: number, centre: number) =>
    Math.abs(x - centre) <= width / 2 + 1e-9;
  /** Height of the walking surface at (x, z) on the landing, its steps, the runs or the turn landing; null elsewhere. */
  function surface(x: number, z: number): number | null {
    if (within(x, landing.x) && z >= steps.z0 && z <= upper.z1) {
      if (z > landing.z1) return upperY(z);
      if (z >= landing.z0) return top;
      return top - riser * Math.ceil((landing.z0 - z) / steps.depth - 1e-9);
    }
    if (x >= turn.x0 && x <= turn.x1 && z >= turn.z0 && z <= turn.z1)
      return midTop;
    if (within(x, lower.x) && z >= lower.z0 && z <= lower.z1) return lowerY(z);
    return null;
  }
  /**
   * The accessible way up, along the middle of each run and round the turn
   * landing (its corners cut at 45°): from the lower run's toe to the landing
   * abreast of the sliding entrance at `doorZ`, every corner at its surface
   * height. The runs slope evenly, so heights between corners are linear.
   */
  function ascent(doorZ: number): { at: Vec2; y: number }[] {
    const mid = (turn.z0 + turn.z1) / 2,
      cut = 0.4;
    const corners: Vec2[] = [
      [lower.x, lower.z0],
      [lower.x, lower.z1],
      [lower.x, mid - cut],
      [lower.x + cut, mid],
      [upper.x - cut, mid],
      [upper.x, mid - cut],
      [upper.x, upper.z1],
      [upper.x, upper.z0],
      [landing.x, doorZ],
    ];
    return corners.map((at) => ({ at, y: surface(at[0], at[1])! }));
  }
  return {
    street,
    top,
    midTop,
    width,
    landing,
    steps,
    upper,
    turn,
    lower,
    rails,
    planter,
    surface,
    ascent,
    /** Plan outlines: the landing with its steps and the upper run, the turn landing, the lower run. */
    outlines: [
      rect(landing.x - width / 2, steps.z0, landing.x + width / 2, upper.z1),
      rect(turn.x0, turn.z0, turn.x1, turn.z1),
      rect(lower.x - width / 2, lower.z0, lower.x + width / 2, lower.z1),
    ],
    /** The planter's footprint. */
    planterOutline: rect(
      planter.x - planter.w / 2,
      planter.z - planter.d / 2,
      planter.x + planter.w / 2,
      planter.z + planter.d / 2,
    ),
  };
})();

/** 2022 offering brochure exterior photographs, fitted to the existing plan footprint. */
export function buildAlhambraExterior(model: Facility) {
  if (model.exteriorAppearance !== 'alhambra-brochure') return null;
  const facade = new T.Group(),
    roof = new T.Group(),
    site = new T.Group();
  facade.name = 'alhambra-brochure-facade';
  roof.name = 'alhambra-brochure-roof';
  site.name = 'alhambra-brochure-street-edge';
  const { box, beam, group, mesh, batch } = exteriorPrimitives();
  const L_STREET = -0.23;
  // Streetscape group and palette, declared up front because the wing's palm
  // island (built with the facade) shares the palm and colours.
  const street = group(site, 'ethel-and-valley-streetscape');
  const lawn = '#9db87c',
    red = '#b8403a',
    yellow = '#e6c03c';
  const stone = '#d0c3a7',
    joint = '#b9b7ac',
    steel = '#b8bdbb',
    blue = '#3f6d7e',
    dark = '#34474e';

  // The street entry is a folded standing-seam canopy in front of the flat roof.
  const canopy = group(facade, 'valley-folded-blue-canopy');
  const ridge = [
    [-14.7, 5.85],
    [-7.3, 4.12],
    [0.1, 5.45],
  ];
  for (let i = 0; i < 2; i++) {
    const [x0, y0] = ridge[i],
      [x1, y1] = ridge[i + 1];
    const geo = new T.BufferGeometry();
    geo.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        [
          x0,
          y0,
          24.95,
          x1,
          y1,
          24.95,
          x1,
          y1,
          28.3,
          x0,
          y0,
          24.95,
          x1,
          y1,
          28.3,
          x0,
          y0,
          28.3,
        ],
        3,
      ),
    );
    geo.computeVertexNormals();
    mesh(canopy, geo, '#33415a');
    for (const z of [24.95, 28.3])
      beam(canopy, [x0, y0, z], [x1, y1, z], 0.14, 0.16, steel);
    for (let x = x0 + 0.15; x < x1; x += 0.35) {
      const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      beam(
        canopy,
        [x, y + 0.025, 24.95],
        [x, y + 0.025, 28.3],
        0.035,
        0.035,
        '#648696',
      );
    }
  }
  box(canopy, -7.3, 0, 28.23, 0.2, 4.12, 0.19, dark);
  // Deep pale entrance portals distinguish the two recessed doors from the blue infill.
  const portals = group(facade, 'valley-entry-portals');
  for (const x of [-12.9, -6.3]) {
    box(portals, x, 3.15, 25.37, 4.15, 0.32, 0.35, '#eeeee7');
    for (const xx of [x - 1.93, x + 1.93])
      box(portals, xx, 0.35, 25.37, 0.3, 2.8, 0.35, '#eeeee7');
    for (const xx of [x - 0.85, x + 0.85])
      box(portals, xx, 0.35, 25.42, 0.045, 2.76, 0.06, steel);
  }

  function shade(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    projection: number,
  ) {
    const g = group(facade, name);
    for (const zz of [z, z + projection]) box(g, x, y, zz, w, 0.1, 0.1, blue);
    for (let xx = x - w / 2; xx <= x + w / 2; xx += 0.48) {
      box(g, xx, y, z + projection / 2, 0.055, 0.09, projection, blue);
      beam(g, [xx, y, z + projection], [xx, y + 0.26, z], 0.035, 0.035, blue);
    }
  }
  shade('1827-upper-blue-sunshade', 9.8, 5.55, 26.83, 9.2, 0.72);
  shade('1819-storefront-blue-sunshade', 23.5, 2.86, 26.98, 9.6, 1.0);
  shade('1841-entry-blue-sunshade', -16.7, 2.95, 27.34, 3.0, 0.72);
  // Concrete panel joints, restrained wall lights and metal coping on every visible flat wing.
  const surface = group(facade, 'concrete-panel-joints-and-coping');
  for (const [x0, x1, z, h] of [
    [-31.18, -14.66, 27.32, 6.2],
    [3.2, 15.26, 26.81, 6.65],
    [15.57, 29.71, 26.97, 6.65],
  ]) {
    box(surface, (x0 + x1) / 2, h - 0.07, z, x1 - x0, 0.09, 0.32, steel);
    for (let x = x0 + 0.7; x < x1; x += 3.4)
      box(surface, x, 0, z, 0.017, h, 0.016, joint);
    for (const y of [3.0, 5.55])
      box(surface, (x0 + x1) / 2, y, z, x1 - x0, 0.016, 0.016, joint);
  }
  for (const [x, z0, z1, h] of [
    [-31.33, 8.9, 27.17, 6.2],
    [29.86, 3.51, 26.81, 6.65],
    [15.4, -12.46, 3.2, 6.65],
  ]) {
    box(surface, x, h - 0.07, (z0 + z1) / 2, 0.32, 0.09, z1 - z0, steel);
    for (let z = z0 + 2; z < z1; z += 4.5) {
      box(surface, x, 0, z, 0.016, h, 0.018, joint);
      box(surface, x, 3.4, z, 0.23, 0.11, 0.43, stone);
    }
    box(surface, x, 3.0, (z0 + z1) / 2, 0.015, 0.018, z1 - z0, joint);
  }

  // Glass wraps the Ethel corner; silver mullions and shallow canopy make the showcase legible.
  const corner = group(facade, 'ethel-glazed-corner');
  box(corner, -31.36, 2.88, 25.48, 0.65, 0.15, 3.65, steel);
  for (const z of [23.72, 24.85, 26.05, 27.13])
    box(corner, -31.34, 0.52, z, 0.12, 2.25, 0.06, steel);

  const edge = group(site, 'valley-entry-terrace-and-rails');
  box(edge, -7.3, -0.15, 26.73, 14.9, 0.55, 2.75, stone);
  // Street-facing stairs: five steps the width of the photo's flight up to the
  // terrace between the annex doors, a handrail each side, and a narrower
  // flight at the 1827 end.
  function stairs(x: number, w: number) {
    for (let i = 0; i < 5; i++)
      box(edge, x, -0.22, 29.5 - i * 0.36, w, 0.124 * (i + 1), 0.4, stone);
    for (const s of [-1, 1]) {
      const xx = x + (s * (w - 0.1)) / 2;
      box(edge, xx, -0.22, 29.6, 0.035, 1.05, 0.035, steel);
      box(edge, xx, 0.4, 28.0, 0.035, 0.95, 0.035, steel);
      beam(edge, [xx, 0.7, 29.6], [xx, 1.3, 28.0], 0.03, 0.03, steel);
    }
  }
  stairs(-9.4, 4.4);
  stairs(1.5, 2.4);
  // The accessible ramp runs along the wing's front, rising from the Ethel end
  // to the terrace at the annex, with cable rails on both sides; the terrace
  // edge carries the same rail either side of the stairs (photo, 2026).
  const RAMP = { x0: -29.8, x1: -14.75, y0: -0.05, y1: 0.4, z: 28.3, w: 1.3 };
  const rampY = (x: number) =>
    RAMP.y0 + ((x - RAMP.x0) * (RAMP.y1 - RAMP.y0)) / (RAMP.x1 - RAMP.x0);
  const slope = Math.atan2(RAMP.y1 - RAMP.y0, RAMP.x1 - RAMP.x0);
  const ramp = box(
    edge,
    (RAMP.x0 + RAMP.x1) / 2,
    (RAMP.y0 + RAMP.y1) / 2 - 0.12,
    RAMP.z,
    RAMP.x1 - RAMP.x0,
    0.12,
    RAMP.w,
    stone,
  );
  ramp.rotation.z = slope;
  function rail(
    x0: number,
    x1: number,
    z: number,
    base: (x: number) => number,
  ) {
    for (let x = x0; x <= x1 + 0.01; x += 1.65)
      box(
        edge,
        Math.min(x, x1),
        base(Math.min(x, x1)),
        z,
        0.035,
        0.95,
        0.035,
        steel,
      );
    for (const y of [0.62, 0.85, 1.12])
      beam(
        edge,
        [x0, base(x0) + y, z],
        [x1, base(x1) + y, z],
        0.028,
        0.035,
        steel,
      );
  }
  for (const z of [RAMP.z - 0.68, RAMP.z + 0.68])
    rail(RAMP.x0, RAMP.x1, z, rampY);
  for (const [a, b] of [
    [-14.75, -11.7],
    [-7.1, 0.2],
  ])
    rail(a, b, 28.45, () => RAMP.y1);
  // Sidewalk tree wells: a square of soil at the foot of every street tree on Valley Blvd.
  for (const [x, z] of [
    [-29.6, 29.1],
    [-27.4, 29.1],
    [-11, 30.2],
    [1, 30.2],
    [9, 30.2],
  ])
    box(edge, x, -0.04, z, 1.3, 0.01, 1.3, '#6b5a48');
  const planters = group(site, 'frontage-low-planters');
  for (const [x, z, w] of [
    [7.8, 27.35, 10.6],
    [-22.3, 29.65, 13.4],
    [28.9, 24.5, 1.1],
  ]) {
    box(planters, x, -0.1, z, w, 0.4, 0.8, stone);
    for (let xx = x - w / 2 + 0.35; xx < x + w / 2; xx += 0.6) {
      const plant = mesh(
        planters,
        new T.IcosahedronGeometry(0.38, 1),
        z > 29 ? (Math.round(xx / 0.6) % 2 ? '#d4c04e' : '#8ea25a') : '#668257',
      );
      plant.position.set(xx, 0.56, z);
      plant.scale.y = 1.2;
    }
  }
  // Aerials and Street View show flat roofs enclosed by parapets, with packaged units.
  const equipment = group(roof, 'photo-referenced-roof-equipment');
  for (const [x, z, y] of [
    [-26, 13, 6.05],
    [-19, 21, 6.05],
    [5, -5, 6.5],
    [9, 9, 6.5],
    [7, 21, 6.5],
    [23, 9, 5.82],
    [21, 18, 5.82],
  ]) {
    box(equipment, x, y, z, 1.8, 0.18, 1.45, '#969c96');
    box(equipment, x, y + 0.18, z, 1.6, 0.8, 1.25, '#b0b2a8');
    for (const dx of [-0.4, 0.4]) {
      const fan = mesh(
        equipment,
        new T.CylinderGeometry(0.28, 0.28, 0.035, 16),
        '#505d5d',
      );
      fan.position.set(x + dx, y + 1.0, z);
    }
    for (let yy = y + 0.32; yy < y + 0.9; yy += 0.13)
      box(equipment, x, yy, z + 0.638, 1.35, 0.025, 0.025, '#747e7a');
  }
  // Street View (May 2025): the central and east blocks are flat-roofed with packaged
  // units and mushroom exhausts along the lot side, not skylights or a barrel.
  for (const [x, z] of [
    [-11.5, -16],
    [-11.8, -4],
    [-11.2, 6],
    [-10.5, 16],
    [-6, 21],
    [-4, -19],
  ]) {
    box(equipment, x, 4.15, z, 1.7, 0.16, 1.4, '#969c96');
    box(equipment, x, 4.31, z, 1.5, 0.9, 1.2, '#b5b6ad');
    const fan = mesh(
      equipment,
      new T.CylinderGeometry(0.3, 0.3, 0.035, 16),
      '#505d5d',
    );
    fan.position.set(x, 5.22, z);
  }
  for (const [x, z] of [
    [-9, -9],
    [-8, 10],
    [-3, 1],
  ]) {
    const stack = mesh(
      equipment,
      new T.CylinderGeometry(0.22, 0.22, 0.6, 12),
      '#a7aaa4',
    );
    stack.position.set(x, 4.45, z);
    const dome = mesh(
      equipment,
      new T.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      '#b9bcb5',
    );
    dome.position.set(x, 4.72, z);
  }
  // Parapets follow each flat roof's outline. The rear and east parapets carry a grey
  // metal coping; the lot-side ones a lighter stucco cap (Street View, May 2025).
  const grey = '#9da2a0';
  for (const r of model.roofSections) {
    if (!r.polygon || r.id === 'therapy' || r.id === 'adjacent') continue;
    const h = r.id === 'central' ? 0.45 : 0.6;
    r.polygon.forEach((a, i) => {
      const b = r.polygon![(i + 1) % r.polygon!.length];
      if (r.id === 'central' && a[1] > 24 && b[1] > 24) return; // the blue folded canopy sits here
      const cap =
        r.id === 'east' || (a[1] < -20 && b[1] < -20) ? grey : '#d8ccb2';
      const vertical = Math.abs(a[0] - b[0]) < 0.01;
      const x = vertical ? a[0] : (a[0] + b[0]) / 2,
        z = vertical ? (a[1] + b[1]) / 2 : a[1],
        w = vertical ? 0.24 : Math.abs(b[0] - a[0]) + 0.24,
        d = vertical ? Math.abs(b[1] - a[1]) + 0.24 : 0.24;
      box(equipment, x, r.eaveHeight, z, w, h, d, stone);
      box(equipment, x, r.eaveHeight + h, z, w + 0.1, 0.06, d + 0.1, cap);
    });
  }
  // Lot-side door of the two-storey wing: navy awning, three steps down to the lot
  // and a block planter wall beside them (Street View, May 2025).
  const lotDoor = group(facade, 'therapy-lot-door-awning-and-steps');
  // Street View (May 2025): on the wing's lot face, a glass double door
  // (1839 W Valley Blvd) and, west of it, the awning door. A split-face block
  // wall stands 1.8 m clear of the face from the ramp's turn landing west to
  // just past the awning door, with a door-level walkway behind it; at the
  // wall's west end four steps descend toward Ethel, pipe handrail on the lot
  // side.
  const doorX = -31.18 + 3.25 + 0.55;
  const brick = '#c49a6c',
    brickJoint = '#b58a5e';
  box(lotDoor, doorX, 2.32, 8.35, 2.7, 0.14, 1.1, '#2d4a74');
  box(lotDoor, doorX, 2.28, 8.35, 2.6, 0.05, 1.0, '#eeeee7');
  const landTop = 0.5,
    wallZ = 7.0,
    wallX0 = doorX - 1.5,
    wallX1 = -18.1;
  box(
    lotDoor,
    (wallX0 + wallX1) / 2,
    -0.23,
    8.1,
    wallX1 - wallX0,
    landTop + 0.23,
    1.6,
    '#c5c8c2',
  );
  const run = 0.35,
    riseStep = (landTop + 0.23) / 4;
  for (let i = 0; i < 4; i++)
    box(
      lotDoor,
      wallX0 - run / 2 - run * i,
      -0.23,
      8.1,
      run,
      landTop + 0.23 - riseStep * (i + 1),
      1.6,
      '#c5c8c2',
    );
  const stairFoot = wallX0 - run * 4;
  box(lotDoor, wallX0 - 0.05, landTop, 7.35, 0.035, 0.95, 0.035, steel);
  box(lotDoor, stairFoot + 0.05, -0.23, 7.35, 0.035, 0.95, 0.035, steel);
  beam(
    lotDoor,
    [wallX0 - 0.05, landTop + 0.95, 7.35],
    [stairFoot + 0.05, -0.23 + 0.95, 7.35],
    0.035,
    0.035,
    steel,
  );
  box(
    lotDoor,
    (wallX0 + wallX1) / 2,
    -0.23,
    wallZ,
    wallX1 - wallX0,
    1.5,
    0.3,
    brick,
  );
  for (const zz of [wallZ - 0.16, wallZ + 0.16]) {
    for (let y = 0.05; y < 1.45; y += 0.2)
      box(
        lotDoor,
        (wallX0 + wallX1) / 2,
        y,
        zz,
        wallX1 - wallX0,
        0.012,
        0.01,
        brickJoint,
      );
    for (let xx = wallX0 + 0.3; xx < wallX1; xx += 0.4)
      box(lotDoor, xx, -0.23, zz, 0.01, 1.5, 0.01, brickJoint);
  }
  // Low curbed planter against the lobby wall just north of the drop-off
  // landing (aerial): short pygmy palms and shrubs.
  const island = group(site, 'lobby-wall-palm-planter'),
    bed = DROP_OFF.planter;
  box(island, bed.x, -0.23, bed.z, bed.w, 0.18, bed.d, '#dcd7cd');
  box(island, bed.x - bed.w / 2, -0.23, bed.z, 0.07, 0.2, bed.d, red);
  box(island, bed.x, -0.05, bed.z, bed.w - 0.3, 0.02, bed.d - 0.3, '#8c7a5c');
  for (const [x, z, h] of [
    [-16.9, -5.9, 1.3],
    [-15.9, -4.6, 1.6],
    [-16.7, -3.5, 1.2],
  ])
    palm(x, z, h, 1.0);
  for (let z = -6.0; z < -3.2; z += 0.75) {
    const tuft = mesh(island, new T.IcosahedronGeometry(0.28, 1), '#7f9a5f');
    tuft.position.set(bed.x + (z % 1.5 > 0.75 ? 0.6 : -0.6), 0.12, z);
    tuft.scale.set(1, 0.7, 1);
  }
  // Drop-off landing along the lobby wall, its steps and the switchback ramp
  // (`DROP_OFF`).
  const landing = group(site, 'lobby-landing-and-ramp');
  const { upper, turn, lower, steps, rails, midTop } = DROP_OFF,
    LAND = { ...DROP_OFF.landing, w: DROP_OFF.width, top: DROP_OFF.top };
  const bronze = '#6b5845',
    paving = '#c5c8c2';
  const rise = LAND.top - L_STREET;
  box(
    landing,
    LAND.x,
    L_STREET,
    (LAND.z0 + LAND.z1) / 2,
    LAND.w,
    rise,
    LAND.z1 - LAND.z0,
    paving,
  );
  for (let i = 0; i < steps.count; i++)
    box(
      landing,
      LAND.x,
      L_STREET,
      LAND.z0 - steps.depth / 2 - steps.depth * i,
      LAND.w,
      rise - (rise / (steps.count + 1)) * (i + 1),
      steps.depth,
      paving,
    );
  // A bronze handrail down each side of the steps (photo 2026-10-02), looping back at the foot.
  for (const sx of [LAND.x - LAND.w / 2 - 0.05, LAND.x + LAND.w / 2 + 0.05]) {
    box(landing, sx, LAND.top, LAND.z0 + 0.05, 0.035, 0.95, 0.035, bronze);
    box(landing, sx, L_STREET, steps.z0, 0.035, 0.95, 0.035, bronze);
    for (const dy of [0.95, 0.6])
      beam(
        landing,
        [sx, LAND.top + dy, LAND.z0 + 0.05],
        [sx, L_STREET + dy, steps.z0],
        0.03,
        0.03,
        bronze,
      );
    beam(
      landing,
      [sx, L_STREET + 0.95, steps.z0],
      [sx, L_STREET + 0.6, steps.z0 - 0.3],
      0.03,
      0.03,
      bronze,
    );
  }
  const upperLen = upper.z1 - upper.z0,
    lowerLen = lower.z1 - lower.z0;
  const upperSlab = box(
    landing,
    LAND.x,
    (LAND.top + midTop) / 2 - 0.06,
    (upper.z0 + upper.z1) / 2,
    LAND.w,
    0.12,
    upperLen,
    paving,
  );
  upperSlab.rotation.x = Math.atan2(rise / 2, upperLen);
  box(
    landing,
    (turn.x0 + turn.x1) / 2,
    L_STREET,
    (turn.z0 + turn.z1) / 2,
    turn.x1 - turn.x0,
    midTop - L_STREET,
    turn.z1 - turn.z0,
    paving,
  );
  const lowerSlab = box(
    landing,
    lower.x,
    (midTop + L_STREET) / 2 - 0.06,
    (lower.z0 + lower.z1) / 2,
    LAND.w,
    0.12,
    lowerLen,
    paving,
  );
  lowerSlab.rotation.x = Math.atan2(rise / 2, lowerLen);
  const railRun = ({
    x,
    z0,
    z1,
    y,
  }: {
    x: number;
    z0: number;
    z1: number;
    y: (z: number) => number;
  }) => {
    for (let z = z0; z <= z1 + 0.01; z += 1.4)
      box(
        landing,
        x,
        y(Math.min(z, z1)),
        Math.min(z, z1),
        0.035,
        0.95,
        0.035,
        bronze,
      );
    box(landing, x, y(z1), z1, 0.035, 0.95, 0.035, bronze);
    for (const dy of [0.45, 0.65, 0.85, 1.0])
      beam(
        landing,
        [x, y(z0) + dy, z0],
        [x, y(z1) + dy, z1],
        0.03,
        0.03,
        bronze,
      );
  };
  railRun(rails.landing);
  railRun(rails.upper);
  railRun(rails.lowerEast);
  railRun(rails.lowerWest);
  // The turn landing's rail runs on from the lower run's west rail: no post at its start.
  for (const dy of [0.45, 0.65, 0.85, 1.0])
    beam(
      landing,
      [rails.turn.x, midTop + dy, rails.turn.z0],
      [rails.turn.x, midTop + dy, rails.turn.z1],
      0.03,
      0.03,
      bronze,
    );
  box(landing, rails.turn.x, midTop, rails.turn.z1, 0.035, 0.95, 0.035, bronze);
  // Rear court planters (REAR_COURT_PLANTERS).
  const court = group(site, 'rear-court-planters');
  for (const [x0, z0, x1, z1] of REAR_COURT_PLANTERS) {
    box(
      court,
      (x0 + x1) / 2,
      -0.23,
      (z0 + z1) / 2,
      x1 - x0,
      0.18,
      z1 - z0,
      '#dcd7cd',
    );
    box(
      court,
      (x0 + x1) / 2,
      -0.05,
      (z0 + z1) / 2,
      x1 - x0 - 0.3,
      0.02,
      z1 - z0 - 0.3,
      '#8c7a5c',
    );
  }
  palm(2.5, -19.8, 5.0, 1.9);
  palm(14.2, -22.9, 2.2, 1.3);
  palm(15.4, -21.4, 1.6, 1.1);
  // Rear loading door on the alley: flat canopy over the roll-up and a gated enclosure beside it.
  const rear = group(facade, 'clinic-rear-loading-canopy-and-gate');
  box(rear, -5.6, 3.15, -23.1, 4.2, 0.16, 1.2, '#b7b9b2');
  box(rear, -2.3, -0.23, -23.3, 2.6, 2.2, 0.08, '#b9aa89');
  box(rear, -2.3, 2.0, -22.9, 2.8, 0.1, 0.9, '#b7b9b2');
  // Streetscape from the lot-side and Valley Blvd photographs (May 2025 Street
  // View and the 2026 photo): the Ethel Avenue parkway lawn with its yellow
  // hydrant, red-curbed planters with fan palms along the lot's west edge and
  // beside the wing, the palm island at the alley corner, the FDC on the wing's
  // corner, the utility pole with its transformers, bottlebrush trees and a
  // hydrant on the Valley Blvd frontage.
  for (const [z0, z1] of [
    [-24.5, 2.4],
    [6.6, 25.2],
  ])
    box(street, -34.45, -0.05, (z0 + z1) / 2, 1.5, 0.012, z1 - z0, lawn);
  function hydrant(x: number, z: number) {
    const g = group(street, 'fire-hydrant');
    mesh(g, new T.CylinderGeometry(0.15, 0.17, 0.72, 12), yellow).position.set(
      x,
      0.31,
      z,
    );
    mesh(g, new T.CylinderGeometry(0.2, 0.2, 0.06, 12), yellow).position.set(
      x,
      0.42,
      z,
    );
    mesh(g, new T.SphereGeometry(0.14, 12, 8), yellow).position.set(x, 0.72, z);
    for (const dx of [-0.21, 0.21])
      mesh(g, new T.CylinderGeometry(0.07, 0.07, 0.16, 10), yellow)
        .rotateZ(Math.PI / 2)
        .position.set(x + dx, 0.4, z);
  }
  hydrant(-34.5, -23.2);
  hydrant(-32.6, 28.8);
  function palm(x: number, z: number, h: number, crown: number) {
    const g = group(street, 'fan-palm');
    const trunk = mesh(g, new T.CylinderGeometry(0.11, 0.17, h, 10), '#8a7254');
    trunk.position.set(x, h / 2 - 0.05, z);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (x + z) * 0.3;
      const frond = mesh(
        g,
        new T.BoxGeometry(crown, 0.05, 0.42),
        i % 2 ? '#4f7a46' : '#5d8a50',
      );
      frond.position.set(
        x + Math.cos(a) * crown * 0.42,
        h - 0.1 + crown * 0.1,
        z + Math.sin(a) * crown * 0.42,
      );
      frond.rotation.set(0, -a, -0.45);
    }
    mesh(g, new T.SphereGeometry(0.22, 10, 8), '#6b8f4a').position.set(
      x,
      h + 0.05,
      z,
    );
  }
  for (let z = -22.6; z < -5; z += 2.47) palm(-31.55, z, 1.4, 1.0);
  for (const z of [9.6, 13.8]) palm(-32.0, z, 2.5, 1.4);
  palm(-19.6, -23.9, 5.2, 1.9);
  // Low grasses in the planters, and the red-painted curbs facing the lot.
  for (const [x, z0, z1] of [
    [-31.55, -23.3, -4.6],
    [-32.0, 7.8, 26.8],
  ])
    for (let z = z0 + 0.6; z < z1; z += 1.1) {
      const tuft = mesh(street, new T.IcosahedronGeometry(0.3, 1), '#7f9a5f');
      tuft.position.set(x, 0.18, z);
      tuft.scale.set(1, 0.7, 1);
    }
  box(street, -30.95, -0.23, -13.8, 0.07, 0.2, 19.4, red);
  box(street, -31.48, -0.23, 17.3, 0.07, 0.2, 20, red);
  for (const [[ax, az], [bx, bz]] of [
    [
      [-21.0, -22.2],
      [-16.2, -24.7],
    ],
  ]) {
    const curb = box(
      street,
      (ax + bx) / 2,
      -0.23,
      (az + bz) / 2,
      Math.hypot(bx - ax, bz - az),
      0.2,
      0.07,
      red,
    );
    curb.rotation.y = -Math.atan2(bz - az, bx - ax);
  }
  palm(-27.6, 29.65, 1.6, 1.0);
  palm(-19.2, 29.65, 1.6, 1.0);
  // Fire department connection at the wing's west corner.
  const fdc = group(street, 'fire-department-connection');
  mesh(fdc, new T.CylinderGeometry(0.06, 0.06, 0.8, 8), red).position.set(
    -31.0,
    0.4,
    9.4,
  );
  for (const dx of [-0.12, 0.12])
    mesh(fdc, new T.CylinderGeometry(0.09, 0.09, 0.1, 10), red)
      .rotateX(Math.PI / 2)
      .position.set(-31.0 + dx, 0.82, 9.3);
  // Wooden utility pole with two transformers on the alley's north edge at the Ethel corner.
  const pole = group(street, 'utility-pole');
  mesh(
    pole,
    new T.CylinderGeometry(0.13, 0.17, 9.5, 10),
    '#7d6a55',
  ).position.set(-34.6, 4.5, -36.3);
  box(pole, -34.6, 8.4, -36.3, 2.2, 0.1, 0.1, '#7d6a55');
  for (const dx of [-0.45, 0.45])
    mesh(
      pole,
      new T.CylinderGeometry(0.28, 0.28, 0.75, 12),
      '#9a9c98',
    ).position.set(-34.6 + dx, 7.5, -36.3);
  // Bottlebrush street trees on Valley Blvd, drawn green like the rest of the trees.
  for (const [x, z] of [
    [-11, 30.2],
    [1, 30.2],
    [9, 30.2],
  ]) {
    const g = group(street, 'bottlebrush-tree');
    box(g, x, 0, z, 0.16, 2.6, 0.16, '#6f5a47');
    for (let i = 0; i < 5; i++) {
      const lobe = mesh(
        g,
        new T.IcosahedronGeometry(0.95, 1),
        i % 2 ? '#6f8f55' : '#5d7e4e',
      );
      lobe.position.set(
        x + Math.cos(i * 1.3) * 0.7,
        3.1 + Math.sin(i * 2.1) * 0.35,
        z + Math.sin(i * 1.3) * 0.7,
      );
      lobe.scale.y = 0.85;
    }
  }
  // Rear court (photos and the dispatcher's annotated screenshots, 2026-10-02).
  // The model's +x is east and +z south (frame.ts COMPASS); "north" and
  // "south" below follow the code's street names, where Valley Blvd is the
  // north street (+z), so they are the compass's south and north. The staff
  // entrance is on the wing's EAST
  // face (x 15.26, the long wall between the garage corner at z −12.5 and the
  // adjacent block at z 3.5): a cable-hung pergola of powder-blue slats on a
  // steel-blue frame over the glass double door at its north end, a dark
  // square window south of the door, bronze pipe rails on the landing and a
  // wall light high on the face. The wing's court face (x 5.2–15.26 at
  // z −15.2, drawn as one flat wall) is the UNDERGROUND GARAGE's wall: its
  // rolling door under the grey hooded canopy, the gated electricity room and
  // the louvre and meter panel sit there (the ramp is not cut into the ground).
  // The utility pole with its yellow guard stands in front of the junction;
  // the planter curbs are painted blue.
  const court2 = group(facade, 'rear-court-staff-entrance-and-loading');
  const SOUTH_Z = -22.463,
    BUMP_Z = -15.213;
  // The wing's court face reads as one flat wall from the recess corner to its end: the far part is brought flush with
  // the stair bump, with its parapet cap.
  box(
    court2,
    13.51,
    -0.23,
    (BUMP_Z - 12.465) / 2,
    3.52,
    6.5 + 0.23,
    -12.465 - BUMP_Z,
    stone,
  );
  box(
    court2,
    13.51,
    6.5,
    (BUMP_Z - 12.465) / 2,
    3.52 + 0.24,
    0.6,
    -12.465 - BUMP_Z + 0.24,
    stone,
  );
  // The entrance is on the wing's EAST face (x 15.26, z −12.5 → 3.5, the long wall the dispatcher shaded), elements
  // protruding +x. Proportions from the 2026-10-02 photo: a 8.8 m steel-blue canopy of boards on edge inside a flat
  // perimeter beam, hung on three cables from plates 1.4 m up the wall, its north end 1.3 m past the aluminium glass
  // double door; the square window 1.3 m across south of the door; bronze pipe rails on a raised concrete landing; the
  // dirt planter in front with its blue-painted curb, an agave by the door and a pygmy date palm toward the window.
  const pergBlue = '#6f90b9',
    pergEdge = '#5f80ab',
    alu = '#b9bcbe',
    glassDark = '#2a3338';
  // The plan wall here is centred on x 15.31 and 0.2 m thick, so its outer face is at 15.42; overlays sit on that.
  const FACE_X = 15.42;
  // The plan's door opening on this wall is at z −2.34 → −0.36; the canopy's north end is 1.3 m past it.
  const doorW = 1.9,
    doorZ = -1.35;
  const pz1 = doorZ + doorW / 2 + 1.3,
    pz0 = pz1 - 8.8,
    pzc = (pz0 + pz1) / 2,
    pwz = pz1 - pz0,
    pdepth = 1.55,
    py = 3.0;
  // Perimeter beam: outer edge, both ends, and the ledger against the wall.
  box(court2, FACE_X + pdepth - 0.06, py, pzc, 0.12, 0.26, pwz, pergEdge);
  box(court2, FACE_X + 0.06, py, pzc, 0.12, 0.26, pwz, pergEdge);
  for (const sz of [pz0 + 0.06, pz1 - 0.06])
    box(court2, FACE_X + pdepth / 2, py, sz, pdepth, 0.26, 0.12, pergEdge);
  // Boards on edge every 0.3 m running out from the wall.
  for (let sz = pz0 + 0.3; sz < pz1 - 0.15; sz += 0.3)
    box(
      court2,
      FACE_X + pdepth / 2,
      py + 0.03,
      sz,
      pdepth - 0.2,
      0.2,
      0.05,
      pergBlue,
    );
  // Three cables from the outer beam to plates on the wall.
  for (const sz of [pz0 + 0.9, pzc, pz1 - 0.9]) {
    beam(
      court2,
      [FACE_X + pdepth - 0.06, py + 0.26, sz],
      [FACE_X + 0.04, py + 1.4, sz],
      0.02,
      0.02,
      '#8a8f90',
    );
    box(court2, FACE_X + 0.04, py + 1.33, sz, 0.06, 0.16, 0.16, '#9a9fa0');
  }
  // Aluminium-framed glass double door, 1.9 m wide, 1.3 m in from the canopy's north end; a camera above its north jamb.
  box(court2, FACE_X + 0.03, 0, doorZ, 0.1, 2.45, doorW + 0.2, alu);
  box(court2, FACE_X + 0.07, 0.03, doorZ, 0.04, 2.35, doorW, glassDark);
  box(court2, FACE_X + 0.1, 0.03, doorZ, 0.02, 2.35, 0.06, alu);
  for (const sz of [doorZ - 0.6, doorZ + 0.6])
    box(court2, FACE_X + 0.1, 1.0, sz, 0.02, 0.9, 0.04, alu);
  box(
    court2,
    FACE_X + 0.12,
    2.65,
    doorZ + doorW / 2 + 0.45,
    0.14,
    0.14,
    0.14,
    '#cfd2d3',
  );
  // Square window with a silver frame, sill 1.3 m up, south of the door.
  const winZ = pz0 + 2.5 + 0.65;
  box(court2, FACE_X + 0.03, 1.25, winZ, 0.08, 1.4, 1.4, alu);
  box(court2, FACE_X + 0.085, 1.3, winZ, 0.02, 1.3, 1.3, glassDark);
  // Raised concrete landing along the wall in front of the door and window, two steps up from the lot.
  const landW = 2.1,
    landZ0 = pz0 + 0.4,
    landZ1 = pz1 + 0.3;
  box(
    court2,
    FACE_X + landW / 2,
    -0.23,
    (landZ0 + landZ1) / 2,
    landW,
    0.23,
    landZ1 - landZ0,
    '#c5c8c2',
  );
  // Bronze pipe rails: two bars along the landing's front edge in front of the door, a return to the wall at the
  // north end, and a single handrail on posts continuing south past the window.
  const railX2 = FACE_X + landW - 0.08;
  const rail2 = [landZ1 - 0.05, doorZ - doorW / 2 - 0.9];
  for (const sz of [rail2[0], (rail2[0] + rail2[1]) / 2, rail2[1]])
    box(court2, railX2, 0, sz, 0.04, 0.95, 0.04, bronze);
  for (const y of [0.95, 0.62])
    beam(
      court2,
      [railX2, y, rail2[0]],
      [railX2, y, rail2[1]],
      0.035,
      0.035,
      bronze,
    );
  beam(
    court2,
    [railX2, 0.95, rail2[0]],
    [FACE_X + 0.1, 0.95, rail2[0]],
    0.035,
    0.035,
    bronze,
  );
  for (const sz of [rail2[1] - 1.4, rail2[1] - 2.8, landZ0 + 0.1])
    box(court2, railX2, 0, sz, 0.04, 0.95, 0.04, bronze);
  beam(
    court2,
    [railX2, 0.95, rail2[1]],
    [railX2, 0.95, landZ0 + 0.1],
    0.035,
    0.035,
    bronze,
  );
  // Dirt planter in front of the landing with its blue-painted curb; agave by the door, pygmy date palm by the window.
  const plX0 = FACE_X + landW,
    plX1 = plX0 + 3.0;
  box(
    court2,
    (plX0 + plX1) / 2,
    -0.23,
    (landZ0 + landZ1) / 2,
    plX1 - plX0,
    0.14,
    landZ1 - landZ0,
    '#9a8663',
  );
  box(
    court2,
    plX1 - 0.08,
    -0.23,
    (landZ0 + landZ1) / 2,
    0.16,
    0.2,
    landZ1 - landZ0,
    '#2d5aa6',
  );
  for (const sz of [landZ0 + 0.08, landZ1 - 0.08])
    box(
      court2,
      (plX0 + plX1) / 2,
      -0.23,
      sz,
      plX1 - plX0,
      0.2,
      0.16,
      '#2d5aa6',
    );
  palm(plX0 + 1.6, winZ - 0.4, 1.7, 1.2);
  const agave = group(court2, 'agave');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2,
      r = 0.9 + (i % 3) * 0.25,
      h = 0.7 + (i % 4) * 0.2;
    beam(
      agave,
      [plX0 + 1.0, -0.05, landZ1 - 0.9],
      [plX0 + 1.0 + Math.cos(a) * r, h, landZ1 - 0.9 + Math.sin(a) * r],
      0.16,
      0.05,
      '#7d9a84',
    );
  }
  // Wall light high on the face south of the pergola.
  beam(
    court2,
    [FACE_X + 0.02, 3.9, -11.2],
    [FACE_X + 1.2, 4.15, -11.2],
    0.06,
    0.06,
    '#6f7577',
  );
  box(court2, FACE_X + 1.3, 4.08, -11.2, 0.55, 0.16, 0.3, '#7d8284');
  // Lobby entrance on the lot side (photo 2026-10-02): the automatic sliding glass door sits in a brushed-aluminium
  // portal that stands proud of the stucco, with "1839 W Valley Blvd" on the glass; two tall silver-framed windows
  // to its south; a camera dome high on the wall north of the door and a small sconce beside it. The bronze canopy,
  // its channel letters and the switchback ramp are drawn elsewhere.
  const lobby = group(facade, 'lobby-entry-portal-and-windows');
  const LOBBY_X = -14.653 - 0.125;
  const aluBright = '#c3c6c8';
  const ldZ = -0.6,
    ldW = 2.2,
    ldH = 2.5;
  for (const sz of [ldZ - ldW / 2 - 0.16, ldZ + ldW / 2 + 0.16])
    box(lobby, LOBBY_X - 0.15, 0, sz, 0.3, ldH + 0.32, 0.32, aluBright);
  box(lobby, LOBBY_X - 0.15, ldH, ldZ, 0.3, 0.32, ldW + 0.64, aluBright);
  box(lobby, LOBBY_X - 0.02, 0.02, ldZ, 0.03, ldH - 0.04, ldW, '#2a3338');
  for (const sz of [ldZ, ldZ - ldW / 4, ldZ + ldW / 4])
    box(lobby, LOBBY_X - 0.035, 0.02, sz, 0.02, ldH - 0.04, 0.05, aluBright);
  box(lobby, LOBBY_X - 0.045, 1.85, ldZ - 0.55, 0.01, 0.1, 0.62, '#f3efe4');
  box(lobby, LOBBY_X - 0.045, 1.7, ldZ - 0.55, 0.01, 0.1, 0.62, '#f3efe4');
  for (const wz of [2.0, 3.5]) {
    box(lobby, LOBBY_X - 0.045, 0.95, wz, 0.09, 1.55, 1.05, aluBright);
    box(lobby, LOBBY_X - 0.1, 1.0, wz, 0.02, 1.45, 0.95, '#2a3338');
  }
  const dome = mesh(
    lobby,
    new T.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    '#e8eaea',
  );
  dome.position.set(LOBBY_X - 0.06, 2.9, ldZ - 2.4);
  dome.rotation.z = Math.PI / 2;
  box(lobby, LOBBY_X - 0.05, 2.1, ldZ - 1.9, 0.08, 0.14, 0.16, '#9a9fa0');
  // The garage wall (the wing's court face): rolling door under the grey hood, the electricity-room gate beside it,
  // the louvred vent and the meter panel.
  const gFace = BUMP_Z - 0.03;
  box(court2, 9.3, 0, gFace, 2.6, 2.5, 0.06, '#e8e6df');
  for (let y = 0.25; y < 2.5; y += 0.25)
    box(court2, 9.3, y, gFace - 0.02, 2.6, 0.02, 0.02, '#cfcdc5');
  const hood = mesh(court2, new T.BoxGeometry(3.4, 0.5, 1.5), '#9a9fa0');
  hood.position.set(9.3, 3.3, BUMP_Z - 0.75);
  hood.rotation.x = -0.22;
  box(court2, 9.3, 2.85, BUMP_Z - 0.04, 3.4, 0.6, 0.08, '#8d9294');
  for (const gx of [11.3, 12.4])
    box(court2, gx, 0, gFace, 0.06, 2.2, 0.06, '#8f9496');
  for (let gx = 11.4; gx < 12.4; gx += 0.12)
    box(court2, gx, 0.05, gFace, 0.025, 2.05, 0.025, '#8f9496');
  beam(court2, [11.3, 2.15, gFace], [12.4, 2.15, gFace], 0.04, 0.04, '#8f9496');
  beam(court2, [11.3, 0.12, gFace], [12.4, 0.12, gFace], 0.04, 0.04, '#8f9496');
  box(court2, 11.85, 2.4, gFace, 0.9, 0.5, 0.05, '#9a9fa0');
  for (let y = 2.45; y < 2.85; y += 0.1)
    box(court2, 11.85, y, gFace - 0.02, 0.8, 0.03, 0.02, '#6f7577');
  box(court2, 13.6, 2.6, gFace, 0.9, 0.7, 0.05, '#9a9fa0');
  for (let y = 2.65; y < 3.25; y += 0.1)
    box(court2, 13.6, y, gFace - 0.02, 0.8, 0.03, 0.02, '#6f7577');
  box(court2, 14.0, 1.0, gFace, 0.7, 1.1, 0.12, '#8f9496');
  // Utility pole with its yellow guard in front of the junction of the two faces.
  const poleX = 4.6,
    poleZ = -17.6;
  mesh(
    court2,
    new T.CylinderGeometry(0.16, 0.19, 9.5, 10),
    '#7a6650',
  ).position.set(poleX, 4.5, poleZ);
  for (const y of [1.4, 1.9, 2.4])
    mesh(
      court2,
      new T.CylinderGeometry(0.2, 0.2, 0.12, 10),
      '#e4c23a',
    ).position.set(poleX, y, poleZ);
  box(court2, poleX, 8.6, poleZ, 1.8, 0.1, 0.1, '#7d6a55');
  // Blue-painted curbs on the court's planter islands.
  for (const [x0, z0, x1, z1] of [
    [1.0, -21.4, 4.0, -18.2],
    [13.2, -24.0, 16.4, -20.4],
  ]) {
    const cx = (x0 + x1) / 2,
      cz = (z0 + z1) / 2;
    box(court2, cx, -0.05, z0 + 0.08, x1 - x0, 0.015, 0.16, '#2d5aa6');
    box(court2, cx, -0.05, z1 - 0.08, x1 - x0, 0.015, 0.16, '#2d5aa6');
    box(court2, x0 + 0.08, -0.05, cz, 0.16, 0.015, z1 - z0, '#2d5aa6');
    box(court2, x1 - 0.08, -0.05, cz, 0.16, 0.015, z1 - z0, '#2d5aa6');
  }
  for (const g of [facade, roof, site]) batch(g);
  return { facade, roof, site };
}
