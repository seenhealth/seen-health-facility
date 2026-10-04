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
 * wall across the glass door, window and side door at floor level; at its −z
 * end, left of the glass door, three steps run down away from the wall to the
 * lot (photo 2026-10-02). The accessible ramp is a switchback: the
 * upper run descends from the landing along the wall toward the wing, turns
 * on a landing beside the block wall, and the lower run comes back in front
 * of it down to the lot. Bronze rails line the lot side of the landing and
 * the upper run, both sides of the lower run and the turn landing's west
 * edge. Beyond the steps, against the wall, a bike rack stands on a low
 * concrete pad (it replaced a palm planter, photo 2026-10-02).
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
  const landing = { x: -15.5, z0: -2.95, z1: 3.6 },
    upper = { x: landing.x, z0: landing.z1, z1: 7.6 },
    turn = { x0: -17.95, x1: -14.85, z0: 7.6, z1: 8.75 },
    lower = { x: -17.15, z0: 2.9, z1: 7.6 };
  /**
   * Steps off the landing's lot side at its −z end, down toward the lot (−x):
   * `count` treads `depth` deep between x0 (the foot) and x1 (the landing's
   * edge), spanning z0..z1, equal risers to the lot. Three treads 0.3 m deep,
   * ending at the glass door's frame (photo 2026-10-02).
   */
  const count = 3,
    depth = 0.3,
    stepsX1 = landing.x - width / 2,
    steps = {
      count,
      depth,
      x0: stepsX1 - count * depth,
      x1: stepsX1,
      z0: landing.z0,
      z1: -1.65,
    };
  const riser = rise / (steps.count + 1);
  const upperY = (z: number) =>
    top - ((rise / 2) * (z - upper.z0)) / (upper.z1 - upper.z0);
  const lowerY = (z: number) =>
    midTop - ((rise / 2) * (lower.z1 - z)) / (lower.z1 - lower.z0);
  const lotSide = landing.x - width / 2 - 0.05;
  /** Rail lines at constant x from z0 to z1, standing on the surface at height y(z). */
  const rails = {
    landing: { x: lotSide, z0: steps.z1 + 0.05, z1: landing.z1, y: () => top },
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
    // In line with the lower run's west rail, which it continues round the turn landing.
    turn: {
      x: lower.x - width / 2 - 0.05,
      z0: turn.z0,
      z1: turn.z1 - 0.05,
      y: () => midTop,
    },
  };
  /** The bike rack's pad against the wall beyond the steps: centre and size, one riser high. */
  const bikeRack = { x: -15.7, z: -3.75, w: 1.9, d: 1.5 };
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
    if (within(x, landing.x) && z >= landing.z0 && z <= upper.z1)
      return z > landing.z1 ? upperY(z) : top;
    if (x >= steps.x0 && x < steps.x1 && z >= steps.z0 && z <= steps.z1)
      return top - riser * Math.ceil((steps.x1 - x) / steps.depth - 1e-9);
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
    bikeRack,
    surface,
    ascent,
    /** Plan outlines: the landing and the upper run, the turn landing, the lower run, the steps. */
    outlines: [
      rect(landing.x - width / 2, landing.z0, landing.x + width / 2, upper.z1),
      rect(turn.x0, turn.z0, turn.x1, turn.z1),
      rect(lower.x - width / 2, lower.z0, lower.x + width / 2, lower.z1),
      rect(steps.x0, steps.z0, steps.x1, steps.z1),
    ],
    /** The bike rack pad's footprint. */
    bikeRackOutline: rect(
      bikeRack.x - bikeRack.w / 2,
      bikeRack.z - bikeRack.d / 2,
      bikeRack.x + bikeRack.w / 2,
      bikeRack.z + bikeRack.d / 2,
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
  // Every flat wing's coping is a flush metal cap on its parapet (Street View, May 2025): set back over the wall,
  // 1.5 cm proud of the face, rather than a ledge standing out over the street; panel joints sit on the face.
  // Faces are the envelope walls' outer faces (0.24 m thick walls): shell-therapy-*, shell-admin-front,
  // shell-adjacent-front / -east, shell-rear-east.
  const capDepth = 0.27,
    capRise = 0.015;
  for (const [x0, x1, face, h] of [
    [-31.309, -14.66, 27.289, 6.2],
    [3.2, 15.38, 26.78, 6.65],
    [15.45, 29.83, 26.933, 6.65],
  ]) {
    box(
      surface,
      (x0 + x1) / 2,
      h - 0.06,
      face + capRise - capDepth / 2,
      x1 - x0,
      0.07,
      capDepth,
      steel,
    );
    const z = face + 0.005;
    for (let x = x0 + 0.7; x < x1; x += 3.4)
      box(surface, x, 0, z, 0.017, h, 0.016, joint);
    for (const y of [3.0, 5.55])
      box(surface, (x0 + x1) / 2, y, z, x1 - x0, 0.016, 0.016, joint);
  }
  for (const [face, out, z0, z1, h] of [
    [-31.309, -1, 8.9, 27.289, 6.2],
    [29.833, 1, 3.51, 26.933, 6.65],
    [15.384, 1, -12.46, 3.2, 6.65],
  ]) {
    box(
      surface,
      face + out * (capRise - capDepth / 2),
      h - 0.06,
      (z0 + z1) / 2,
      capDepth,
      0.07,
      z1 - z0,
      steel,
    );
    const x = face + out * 0.005;
    for (let z = z0 + 2; z < z1; z += 4.5) {
      box(surface, x, 0, z, 0.016, h, 0.018, joint);
      box(surface, x, 3.4, z, 0.23, 0.11, 0.43, stone);
    }
    box(surface, x, 3.0, (z0 + z1) / 2, 0.015, 0.018, z1 - z0, joint);
  }

  // Glass wraps the Valley / Ethel corner inside one deep light-grey frame (Street View, May 2025): a top band and
  // a sill standing 0.3 m proud of the wall along both faces, round the corner, with a jamb at each far end; the
  // Ethel glazing (ethel-corner-return-glazing, z 24.6 to 27.12, clear as the Valley storefront's) and the first Valley window
  // (shell-therapy-front-opening-7, x -31.15 to -28.86) sit inside it, split by thin silver mullions and meeting
  // at a mullion on the corner.
  const corner = group(facade, 'ethel-glazed-corner');
  {
    const cx = -31.189,
      cz = 27.169,
      d = 0.3,
      ethelEnd = 24.45,
      valleyEnd = -28.72,
      frame = '#e4e3dd',
      top = 2.76,
      band = 0.34;
    // Ethel face (x = cx, the frame out toward -x), then the Valley face (z = cz, out toward +z), meeting at the corner.
    box(
      corner,
      cx - d / 2,
      top,
      (ethelEnd + cz + d) / 2,
      d,
      band,
      cz + d - ethelEnd,
      frame,
    );
    box(
      corner,
      (cx - d + valleyEnd) / 2,
      top,
      cz + d / 2,
      valleyEnd - cx + d,
      band,
      d,
      frame,
    );
    // The sill runs down to the ground as the frame's base (Street View: no gap under the frame).
    box(
      corner,
      cx - d / 2,
      -0.05,
      (ethelEnd + cz + d) / 2,
      d,
      0.57,
      cz + d - ethelEnd,
      frame,
    );
    box(
      corner,
      (cx - d + valleyEnd) / 2,
      -0.05,
      cz + d / 2,
      valleyEnd - cx + d,
      0.57,
      d,
      frame,
    );
    box(corner, cx - d / 2, 0, ethelEnd + 0.08, d, top, 0.16, frame);
    box(corner, valleyEnd - 0.08, 0, cz + d / 2, 0.16, top, d, frame);
    for (const z of [25.44, 26.28])
      box(corner, cx - 0.05, 0.52, z, 0.05, 2.24, 0.04, steel);
    const clear = new T.MeshStandardMaterial({
      color: '#7fabb7',
      roughness: 0.22,
      metalness: 0.15,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    const panes = group(corner, 'corner-window-glass');
    const pane = new T.Mesh(new T.BoxGeometry(0.02, 2.24, 2.52), clear);
    pane.position.set(cx, 0.52 + 1.12, 27.119 - 1.26);
    pane.renderOrder = 2;
    panes.add(pane);
    for (const x of [-30.38, -29.62])
      box(corner, x, 0.52, cz + 0.05, 0.04, 2.24, 0.05, steel);
    box(corner, cx - 0.04, 0.52, cz + 0.04, 0.08, 2.24, 0.08, steel);
  }

  // Ethel face (Street View, Jun 2022): two wall lights at the panel line and the fire-alarm bell near the corner.
  for (const z of [9.4, 20.9])
    box(corner, -31.25, 2.8, z, 0.1, 0.12, 0.26, '#5d6163');
  {
    const bell = mesh(
      corner,
      new T.CylinderGeometry(0.11, 0.11, 0.08, 16),
      '#c8322c',
    );
    bell.rotation.z = Math.PI / 2;
    bell.position.set(-31.23, 3.62, 23.3);
    const dot = mesh(
      corner,
      new T.CylinderGeometry(0.04, 0.04, 0.09, 12),
      '#efefea',
    );
    dot.rotation.z = Math.PI / 2;
    dot.position.set(-31.24, 3.62, 23.3);
  }
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
  // Street View (May 2025): a solid concrete ramp with a raised curb along its street edge, a concrete apron at its
  // foot joining the corner's sidewalk, and silver rails both sides: a handrail and a lower rail on posts, both
  // carried 0.3 m past the foot and looped back.
  {
    const shape = new T.Shape();
    shape.moveTo(RAMP.x0, -0.23);
    shape.lineTo(RAMP.x1, -0.23);
    shape.lineTo(RAMP.x1, RAMP.y1);
    shape.lineTo(RAMP.x0, RAMP.y0);
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, {
      depth: RAMP.w,
      bevelEnabled: false,
    });
    geo.translate(0, 0, RAMP.z - RAMP.w / 2);
    const concrete = '#d6d2c9',
      walk = '#e4e0d7';
    mesh(edge, geo, concrete).receiveShadow = true;
    const curb = mesh(
      edge,
      new T.BoxGeometry(
        Math.hypot(RAMP.x1 - RAMP.x0, RAMP.y1 - RAMP.y0),
        0.12,
        0.15,
      ),
      concrete,
    );
    curb.position.set(
      (RAMP.x0 + RAMP.x1) / 2,
      (RAMP.y0 + RAMP.y1) / 2 + 0.06,
      RAMP.z + RAMP.w / 2 - 0.075,
    );
    curb.rotation.z = slope;
    // Flush with the sidewalk (top −0.05): the apron at the ramp's foot, from the wall out to the ramp's street
    // edge, and the strip between the storefront wall and the ramp along its length; a mulch bed fills the corner
    // between the wall and the two sidewalks (no ground drawn there before), behind a concrete edge.
    const wallZ = 27.289;
    box(
      edge,
      (-31.309 + RAMP.x0) / 2,
      -0.23,
      (wallZ + RAMP.z + RAMP.w / 2) / 2,
      RAMP.x0 + 31.309,
      0.18,
      RAMP.z + RAMP.w / 2 - wallZ,
      walk,
    );
    box(
      edge,
      (RAMP.x0 + RAMP.x1) / 2,
      -0.23,
      (wallZ + RAMP.z - RAMP.w / 2) / 2,
      RAMP.x1 - RAMP.x0,
      0.18,
      RAMP.z - RAMP.w / 2 - wallZ,
      walk,
    );
    box(
      edge,
      (-32.51 - 31.309) / 2,
      -0.23,
      (26.8 + 28.29) / 2,
      32.51 - 31.309,
      0.15,
      28.29 - 26.8,
      '#5a4635',
    );
    box(
      edge,
      -32.44,
      -0.23,
      (26.8 + 28.29) / 2,
      0.14,
      0.2,
      28.29 - 26.8,
      concrete,
    );
  }
  function rail(
    x0: number,
    x1: number,
    z: number,
    base: (x: number) => number,
    returns = false,
  ) {
    const n = Math.max(1, Math.ceil((x1 - x0) / 1.65));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      box(edge, x, base(x), z, 0.04, 0.92, 0.04, steel);
    }
    for (const y of [0.45, 0.92])
      beam(
        edge,
        [x0, base(x0) + y, z],
        [x1, base(x1) + y, z],
        0.035,
        0.035,
        steel,
      );
    if (returns) {
      const y0 = base(x0);
      beam(
        edge,
        [x0, y0 + 0.92, z],
        [x0 - 0.3, y0 + 0.92, z],
        0.035,
        0.035,
        steel,
      );
      beam(
        edge,
        [x0 - 0.3, y0 + 0.92, z],
        [x0 - 0.3, y0 + 0.45, z],
        0.035,
        0.035,
        steel,
      );
      beam(
        edge,
        [x0 - 0.3, y0 + 0.45, z],
        [x0, y0 + 0.45, z],
        0.035,
        0.035,
        steel,
      );
    }
  }
  for (const z of [RAMP.z - 0.6, RAMP.z + 0.56])
    rail(RAMP.x0, RAMP.x1, z, (x) => rampY(x) + (z > RAMP.z ? 0.12 : 0), true);
  // The planting bed between the ramp and the Valley sidewalk: dark mulch behind a concrete edge, pygmy date palms
  // and grasses (it was a row of round shrubs on a raised box).
  {
    const bz0 = RAMP.z + RAMP.w / 2,
      bz1 = 29.75,
      bx0 = RAMP.x0,
      bx1 = -14.9;
    box(
      edge,
      (bx0 + bx1) / 2,
      -0.07,
      (bz0 + bz1) / 2,
      bx1 - bx0,
      0.04,
      bz1 - bz0,
      '#5a4635',
    );
    box(edge, (bx0 + bx1) / 2, -0.1, bz1 + 0.07, bx1 - bx0, 0.14, 0.14, stone);
    for (const x of [-27.6, -25.0, -21.6, -19.3, -16.9])
      palm(x, (bz0 + bz1) / 2, 1.5, 1.0);
    for (let x = bx0 + 0.5; x < bx1; x += 0.95) {
      const tuft = mesh(edge, new T.IcosahedronGeometry(0.22, 1), '#7f9a5f');
      tuft.position.set(x, 0.05, bz0 + 0.25 + (Math.round(x * 3) % 2) * 0.35);
      tuft.scale.set(1, 0.65, 1);
    }
  }
  for (const [a, b] of [
    [-14.75, -11.7],
    [-7.1, 0.2],
  ])
    rail(a, b, 28.45, () => RAMP.y1);
  // Sidewalk tree wells: a square of soil at the foot of every street tree on Valley Blvd.
  for (const [x, z] of [
    [-11, 30.2],
    [1, 30.2],
    [9, 30.2],
  ])
    box(edge, x, -0.04, z, 1.3, 0.01, 1.3, '#6b5a48');
  const planters = group(site, 'frontage-low-planters');
  for (const [x, z, w] of [
    [7.8, 27.35, 10.6],
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
  // Beyond the drop-off steps, against the lobby wall: a low concrete pad with
  // a black serpentine bike rack, its loops running out from the wall (photo
  // 2026-10-02; a palm planter stood here before).
  const rackPad = group(site, 'lobby-bike-rack'),
    pad = DROP_OFF.bikeRack,
    padRise = (DROP_OFF.top - L_STREET) / (DROP_OFF.steps.count + 1);
  box(rackPad, pad.x, L_STREET, pad.z, pad.w, padRise, pad.d, '#c5c8c2');
  {
    // One bent black tube: three tall loops in a row running out from the wall, a base plate at each end.
    const foot = L_STREET + padRise,
      xs = pad.x + pad.w / 2 - 0.22,
      rz = pad.z - 0.2,
      pitch = 0.27,
      loops = 3,
      pts: T.Vector3[] = [new T.Vector3(xs, foot, rz)];
    for (let i = 0; i < loops; i++) {
      const x = xs - i * pitch;
      pts.push(
        new T.Vector3(x, foot + 0.78, rz),
        new T.Vector3(x - pitch / 2, foot + 0.9, rz),
      );
      if (i < loops - 1)
        pts.push(
          new T.Vector3(x - pitch, foot + 0.78, rz),
          new T.Vector3(x - pitch * 1.5, foot + 0.3, rz),
        );
    }
    const xe = xs - (loops - 1) * pitch - pitch;
    pts.push(new T.Vector3(xe, foot + 0.78, rz), new T.Vector3(xe, foot, rz));
    const tube = mesh(
      rackPad,
      new T.TubeGeometry(
        new T.CatmullRomCurve3(pts, false, 'centripetal'),
        120,
        0.024,
        8,
        false,
      ),
      '#16181a',
    );
    tube.castShadow = true;
    for (const x of [xs, xe])
      box(rackPad, x, foot, rz, 0.16, 0.012, 0.16, '#4a4c4e');
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
  // Steps off the landing's lot side, down toward the lot (−x).
  const stepsZ = (steps.z0 + steps.z1) / 2,
    stepsW = steps.z1 - steps.z0;
  for (let i = 0; i < steps.count; i++)
    box(
      landing,
      steps.x1 - steps.depth / 2 - steps.depth * i,
      L_STREET,
      stepsZ,
      steps.depth,
      rise - (rise / (steps.count + 1)) * (i + 1),
      stepsW,
      paving,
    );
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
  // Guards (photos 2026-10-02/03): nine bars under a heavier top rail on posts bolted to the slab's face on bronze
  // brackets, one continuous run along the landing, up the upper ramp run, round the turn landing and down the
  // lower run; the same guard along the landing's −z edge above the bike rack.
  const guardBars = [
    0.12, 0.225, 0.33, 0.435, 0.54, 0.645, 0.75, 0.855, 0.96, 1.05,
  ];
  const guardRun = (
    r: { x: number; z0: number; z1: number; y: (z: number) => number },
    toward: number,
    startPost = true,
  ) => {
    const n = Math.max(1, Math.ceil((r.z1 - r.z0) / 1.4));
    for (let i = startPost ? 0 : 1; i <= n; i++) {
      const z = r.z0 + ((r.z1 - r.z0) * i) / n;
      box(landing, r.x, r.y(z) - 0.2, z, 0.04, 1.27, 0.04, bronze);
      box(
        landing,
        r.x + toward * 0.03,
        r.y(z) - 0.2,
        z,
        0.025,
        0.13,
        0.2,
        bronze,
      );
    }
    for (const dy of guardBars)
      beam(
        landing,
        [r.x, r.y(r.z0) + dy, r.z0],
        [r.x, r.y(r.z1) + dy, r.z1],
        0.03,
        dy > 1 ? 0.045 : 0.03,
        bronze,
      );
  };
  guardRun(rails.landing, 1);
  guardRun(rails.upper, 1, false);
  guardRun(rails.lowerEast, -1);
  guardRun(rails.lowerWest, 1);
  guardRun(rails.turn, 1, false);
  const gz = LAND.z0 - 0.05,
    gx0 = LAND.x + LAND.w / 2 - 0.05,
    gx1 = LAND.x - LAND.w / 2;
  for (const x of [gx0, (gx0 + gx1) / 2, gx1]) {
    box(landing, x, LAND.top - 0.2, gz, 0.04, 1.27, 0.04, bronze);
    box(landing, x, LAND.top - 0.2, gz + 0.03, 0.2, 0.13, 0.025, bronze);
  }
  for (const dy of guardBars)
    beam(
      landing,
      [gx0, LAND.top + dy, gz],
      [gx1, LAND.top + dy, gz],
      dy > 1 ? 0.045 : 0.03,
      0.03,
      bronze,
    );
  // Stair handrails: each leaves the top of a guard post at the head of the steps (the bike-side guard's front post,
  // the landing guard's first post), runs down over the nosings to a post at the foot and returns in a loop.
  const handrail = (z: number, xTop: number) => {
    const top = LAND.top + 1.05,
      foot = L_STREET + 0.92,
      xb = steps.x0 - 0.05;
    box(landing, xb, L_STREET, z, 0.04, 0.92, 0.04, bronze);
    beam(landing, [xTop, top, z], [xb, foot, z], 0.045, 0.045, bronze);
    beam(landing, [xb, foot, z], [xb - 0.3, foot, z], 0.045, 0.045, bronze);
    beam(
      landing,
      [xb - 0.3, foot, z],
      [xb - 0.3, foot - 0.22, z],
      0.04,
      0.04,
      bronze,
    );
    beam(
      landing,
      [xb - 0.3, foot - 0.22, z],
      [xb, foot - 0.22, z],
      0.04,
      0.04,
      bronze,
    );
  };
  handrail(gz, gx1);
  handrail(rails.landing.z0, rails.landing.x);
  // The lower run's guards run on past its toe and loop back, as the stairs' do.
  for (const r of [rails.lowerEast, rails.lowerWest]) {
    const t = r.y(r.z0) + 1.05;
    beam(landing, [r.x, t, r.z0], [r.x, t, r.z0 - 0.3], 0.045, 0.045, bronze);
    beam(
      landing,
      [r.x, t, r.z0 - 0.3],
      [r.x, t - 0.22, r.z0 - 0.3],
      0.04,
      0.04,
      bronze,
    );
    beam(
      landing,
      [r.x, t - 0.22, r.z0 - 0.3],
      [r.x, t - 0.22, r.z0],
      0.04,
      0.04,
      bronze,
    );
  }
  // Yellow nosings on the steps and the landing's edge above them, and the yellow tactile paving at their foot
  // that turns along the walk toward the ramp's toe.
  const nosing = '#d9a92a';
  for (let i = 0; i <= steps.count; i++) {
    const h = rise - (rise / (steps.count + 1)) * i,
      xf = steps.x1 - steps.depth * i;
    box(
      landing,
      xf - 0.035,
      L_STREET + h,
      stepsZ,
      0.05,
      0.006,
      stepsW - 0.04,
      nosing,
    );
  }
  // Laid on the lot's surface at the painted markings' height (neighborhood.ts paints at −0.206).
  const tactileY = -0.205;
  box(
    landing,
    steps.x0 - 0.45,
    tactileY,
    stepsZ + 0.3,
    0.9,
    0.012,
    stepsW + 0.6,
    '#d8b23a',
  );
  box(
    landing,
    steps.x0 - 0.1,
    tactileY,
    (steps.z1 + 0.6 + lower.z0) / 2,
    0.6,
    0.012,
    lower.z0 - steps.z1 - 0.6,
    '#d8b23a',
  );
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
  // beside the wing, the palm island at the alley corner (plain curb), the FDC on the wing's
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
  // On the Valley curb, just west of the street lamp by the corner (Street View, May 2025).
  hydrant(-27.5, 30.85);
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
  // The palm island at the alley corner has a plain curb (no red paint beside the STOP marking).
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
  // The door and both windows share one deep light-grey surround (photo 2026-10-03): 0.14 m wide and 0.12 m proud
  // of the wall on every side (no sill under the door). Windows are 1.3 m tall with their tops level with the
  // door's (2.45 m): the square one under the canopy south of the door, the wider one past the canopy's south end
  // (the envelope's shell-rear-east-opening-1, z -11.04 to -9.72).
  const rearSurround = '#d3d5d3',
    rim = 0.14,
    proud = 0.12;
  const frameAround = (
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    sill: boolean,
  ) => {
    for (const z of [z0 - rim / 2, z1 + rim / 2])
      box(
        court2,
        FACE_X + proud / 2,
        sill ? y0 - rim : 0,
        z,
        proud,
        y1 + rim - (sill ? y0 - rim : 0),
        rim,
        rearSurround,
      );
    box(
      court2,
      FACE_X + proud / 2,
      y1,
      (z0 + z1) / 2,
      proud,
      rim,
      z1 - z0 + 2 * rim,
      rearSurround,
    );
    if (sill)
      box(
        court2,
        FACE_X + proud / 2,
        y0 - rim,
        (z0 + z1) / 2,
        proud,
        rim,
        z1 - z0 + 2 * rim,
        rearSurround,
      );
  };
  // Glass double door, 1.9 m wide, 1.3 m in from the canopy's north end; a camera above its north jamb.
  frameAround(doorZ - doorW / 2, doorZ + doorW / 2, 0, 2.45, false);
  box(court2, FACE_X + 0.03, 0, doorZ, 0.04, 2.45, doorW, glassDark);
  box(court2, FACE_X + 0.06, 0, doorZ, 0.03, 2.45, 0.07, rearSurround);
  for (const sz of [doorZ - 0.6, doorZ + 0.6])
    box(court2, FACE_X + 0.07, 1.0, sz, 0.02, 0.9, 0.04, alu);
  box(
    court2,
    FACE_X + 0.12,
    2.75,
    doorZ + doorW / 2 + 0.45,
    0.14,
    0.14,
    0.14,
    '#cfd2d3',
  );
  const winZ = pz0 + 2.5 + 0.65,
    winTop = 2.45,
    winH = 1.3;
  frameAround(winZ - 0.65, winZ + 0.65, winTop - winH, winTop, true);
  box(court2, FACE_X + 0.02, winTop - winH, winZ, 0.02, winH, 1.3, glassDark);
  frameAround(-11.04, -9.72, winTop - winH, winTop, true);
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
  // Its east curb is where the satellite shows it (x 19.35), beside the accessible stall's hatched access aisle.
  const plX0 = FACE_X + landW,
    plX1 = 19.35;
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
  palm(plX0 + 1.0, winZ - 0.4, 1.7, 1.2);
  const agave = group(court2, 'agave');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2,
      r = 0.55 + (i % 3) * 0.15,
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
  // Lobby entrance from the lot (photos 2026-10-02/03): a satin-aluminium portal round the sliding doors' opening
  // (the envelope's shell-lobby-west-opening-3, z −1.746 to 0.004, 2.3 m high) with the door operator's band
  // across its top (maker's label at the left) under a slim header (motion sensor), stucco showing between it and
  // the canopy; the leaves themselves are arrival.ts's (ENTRY_DOORS). Past the door, two windows in deep white
  // surrounds with the doors' clear glass (the envelope's openings 2 and 1, sized to the photo), the second with a
  // pale curtain inside, the no-smoking notice between them, the accessible-entrance plate and the door keypad
  // beside the portal, an alarm box and a camera dome to its left. The canopy's four tie rods run from plates on
  // the wall down to its front edge.
  const LOBBY_X = -14.653 - 0.125;
  const sash = '#d6d4cc',
    surround = '#ecebe6',
    bronzeRod = '#6b5845';
  const opZ0 = -1.746,
    opZ1 = 0.004,
    ldZ = (opZ0 + opZ1) / 2,
    ldW = opZ1 - opZ0,
    ldH = 2.3;
  for (const sz of [opZ0 - 0.08, opZ1 + 0.08])
    box(lobby, LOBBY_X - 0.15, 0, sz, 0.3, ldH + 0.15, 0.16, sash);
  box(lobby, LOBBY_X - 0.15, ldH, ldZ, 0.3, 0.15, ldW + 0.32, sash);
  box(lobby, LOBBY_X - 0.1, 2.15, ldZ, 0.2, ldH - 2.15, ldW, sash);
  box(lobby, LOBBY_X - 0.203, 2.2, opZ0 + 0.22, 0.004, 0.025, 0.16, '#77797a');
  box(lobby, LOBBY_X - 0.33, 2.36, opZ1 - 0.3, 0.06, 0.06, 0.24, '#1d1f21');
  // The two windows (the envelope's openings 2 and 1, sized to them): deep white surrounds, the sliding doors'
  // clear dark glass (lit at night with them, night-lights.ts), a pale curtain inside the second.
  const winGlass = new T.MeshStandardMaterial({
    color: '#0e1417',
    roughness: 0.12,
    metalness: 0.35,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const panes = group(lobby, 'lobby-window-glass');
  for (const [zc, w, curtain] of [
    [1.1, 0.96, false],
    [2.35, 0.85, true],
  ] as [number, number, boolean][]) {
    const y0 = 0.88,
      h = 1.4,
      rim = 0.09;
    box(lobby, LOBBY_X - 0.1, y0, zc - w / 2 + rim / 2, 0.14, h, rim, surround);
    box(lobby, LOBBY_X - 0.1, y0, zc + w / 2 - rim / 2, 0.14, h, rim, surround);
    box(lobby, LOBBY_X - 0.1, y0 + h - rim, zc, 0.14, rim, w, surround);
    box(lobby, LOBBY_X - 0.1, y0, zc, 0.16, rim, w + 0.04, surround);
    const pane = new T.Mesh(
      new T.BoxGeometry(0.012, h - 2 * rim, w - 2 * rim),
      winGlass,
    );
    pane.position.set(LOBBY_X + 0.06, y0 + h / 2, zc);
    pane.renderOrder = 2;
    panes.add(pane);
    if (curtain)
      box(
        lobby,
        LOBBY_X + 0.22,
        y0 + rim + 0.04,
        zc + 0.08,
        0.01,
        h - 2 * rim - 0.08,
        w - 2 * rim - 0.25,
        '#bfd8d2',
      );
  }
  // Signs on the stucco (scripts/lobby-door-decals.py): the no-smoking notice between the windows and the
  // accessible-entrance plate beside the portal, with the door's keypad below it.
  const signMaterial = (url: string) => {
    if (typeof document === 'undefined') return null;
    const map = new T.TextureLoader().load(url);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    return new T.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.7 });
  };
  for (const [url, w, h, y, z] of [
    ['/reference/photos/lobby-no-smoking.png', 0.28, 0.2, 1.45, 1.752],
    ['/reference/photos/lobby-access-sign.png', 0.15, 0.15, 1.3, 0.33],
  ] as [string, number, number, number, number][]) {
    const m = signMaterial(url);
    if (!m) continue;
    const plate = new T.Mesh(new T.PlaneGeometry(w, h), m);
    plate.rotation.y = -Math.PI / 2;
    plate.position.set(LOBBY_X - 0.012, y, z);
    lobby.add(plate);
  }
  box(lobby, LOBBY_X - 0.03, 0.88, 0.36, 0.06, 0.15, 0.09, '#1c1e20');
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      box(
        lobby,
        LOBBY_X - 0.062,
        0.9 + r * 0.028,
        0.335 + c * 0.025,
        0.006,
        0.016,
        0.016,
        '#e9e9e6',
      );
  box(lobby, LOBBY_X - 0.035, 1.78, opZ0 - 0.95, 0.07, 0.16, 0.13, '#ecebe6');
  box(lobby, LOBBY_X - 0.072, 1.86, opZ0 - 0.95, 0.006, 0.04, 0.07, '#c8322c');
  // Canopy tie rods: plates on the wall a metre above the canopy, rods down to its front edge.
  for (const rz of [-3.25, -0.77, 1.42, 3.62]) {
    box(lobby, LOBBY_X - 0.02, 3.86, rz, 0.04, 0.14, 0.12, bronzeRod);
    beam(
      lobby,
      [LOBBY_X - 0.04, 3.92, rz],
      [-16.28, 2.97, rz],
      0.025,
      0.025,
      bronzeRod,
    );
  }
  const dome = mesh(
    lobby,
    new T.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    '#e8eaea',
  );
  dome.position.set(LOBBY_X - 0.06, 2.45, ldZ - 2.25);
  dome.rotation.z = Math.PI / 2;

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
