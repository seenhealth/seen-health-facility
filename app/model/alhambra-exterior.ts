import * as T from 'three';
import type { Facility, Vec2 } from './schema';
import { exteriorPrimitives } from './exterior-primitives';

/**
 * Rear court planters as [x0, z0, x1, z1]: the palm cluster east of the
 * garage ramp's gate (photos 2026-10-02; the fan-palm island the 2025 imagery
 * showed in front of the electrical room is gone, cars park there), and the
 * staff entrance's second planter, north of its walkway, its east end rounded
 * (bounds; photo 2026-10-03 and the satellite). The delivery trucks keep
 * clear of them (validate-traffic), people walk round them
 * (validate-community-traffic).
 */
export const REAR_COURT_PLANTERS = [
  [15.45, -24.3, 17.3, -20.6],
  [15.42, -9.6, 20.3, -6.8],
  // The court east of the adjacent block (photos 2026-10-05): the blue fan palm's planter (A), the low grass bed (A2),
  // the railed raised divider (B) running south from the tree island's south tip (bounds; its north end follows the
  // island's edge), and the agave strip's free-standing north end (D) between the court's last stall and the
  // dialysis aisle's row.
  [29.1, -15.9, 31.3, -10.9],
  [29.6, -10.9, 31.3, -9.7],
  [31.3, -19.25, 32.6, -10.3],
  [29.15, -5.4, 30.4, 3.41],
] as const;
/**
 * The cactus planter's outline beside the ramp's gate: its east curb runs with the angled stalls (206 degrees),
 * bounding the northernmost one (alley photo 2026-10-02); REAR_COURT_PLANTERS[0] is the part the validators test.
 */
export const RAMP_PLANTER: Vec2[] = [
  [15.45, -20.6],
  [16.48, -20.6],
  [18.28, -24.3],
  [15.45, -24.3],
];

/**
 * The underground garage's ramp (photos 2026-10-02): between the loading
 * block's east return (x 11.75) and the wing's end (x 15.26), down from a
 * gate at z −20.6 to a roll-up door in the wing's north wall (z −12.47),
 * 2.3 m below the court. The ground has a hole here (neighborhood.ts).
 */
/** The garage court's bare concrete (photos 2026-10-02); the envelope's `om-court-concrete` matches it. */
export const COURT_CONCRETE = '#b3b1aa';

export const GARAGE_RAMP = {
  x0: 11.753,
  x1: 15.264,
  top: -22.8,
  foot: -13.3,
  door: -12.465,
  grade: -0.23,
  depth: 2.3,
};

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

/**
 * The therapy wing's veranda (the owner's walkthrough, 2026-10): the walkway
 * behind the split-face block wall on the wing's lot side (−z of it; Street
 * View, May 2025), level with the sills of the two doors the plan opens onto
 * it, with two steps down to the lot at its west end and the garden on it.
 * `buildAlhambraExterior` draws it; scripts/apply-owner-review-exterior.mjs
 * cuts the envelope's openings in `shell-therapy-north` to `door` and `rollup`
 * (both inside the traced plan walls' gaps).
 */
export const VERANDA = {
  /** The wing's lot-side wall (the envelope's shell-therapy-north): its centre line and its lot-side face. */
  wallZ: 8.903806,
  face: 8.903806 - 0.12,
  /** The awning door into the north support room: the plan's gap between plan-wall-184 and 185. */
  door: { x0: -26.143, x1: -25.143, height: 2.2 },
  /**
   * The roll-up from the therapy entry corridor onto the walkway: the plan's
   * gap between plan-wall-185 and 186. Its curtain stands `raised` m up by
   * day.
   */
  rollup: { x0: -21.8, x1: -18.8, height: 2.5, raised: 2.2 },
  /** The walkway, from the block wall's back face to the wing's face, its top at the door sills. */
  walk: { x0: -28.88, x1: -18.1, z0: 7.15, z1: 8.9, top: 0 },
  /** The block wall along the walkway's lot side: its centre line, thickness and top. */
  wall: { z: 7.0, thickness: 0.3, top: 1.27 },
  /** Off the walkway's west end down to the lot: `risers` equal risers over treads `depth` deep. */
  steps: { risers: 2, depth: 0.35 },
  street: -0.23,
};

/** 2022 offering brochure exterior photographs, fitted to the existing plan footprint. */
export function buildAlhambraExterior(model: Facility) {
  if (model.exteriorAppearance !== 'alhambra-brochure') return null;
  const facade = new T.Group(),
    roof = new T.Group(),
    site = new T.Group();
  facade.name = 'alhambra-brochure-facade';
  roof.name = 'alhambra-brochure-roof';
  site.name = 'alhambra-brochure-street-edge';
  const { box, beam, group, mesh, patch, batch } = exteriorPrimitives();
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
        r.id.startsWith('east') || (a[1] < -20 && b[1] < -20)
          ? grey
          : '#d8ccb2';
      // the garage court's faces are bare grey concrete (photos 2026-10-02), the street faces tan stucco
      const body =
        r.id.startsWith('east') && a[1] < -12 && b[1] < -12
          ? COURT_CONCRETE
          : stone;
      const vertical = Math.abs(a[0] - b[0]) < 0.01;
      const x = vertical ? a[0] : (a[0] + b[0]) / 2,
        z = vertical ? (a[1] + b[1]) / 2 : a[1],
        w = vertical ? 0.24 : Math.abs(b[0] - a[0]) + 0.24,
        d = vertical ? Math.abs(b[1] - a[1]) + 0.24 : 0.24;
      box(equipment, x, r.eaveHeight, z, w, h, d, body);
      box(equipment, x, r.eaveHeight + h, z, w + 0.1, 0.06, d + 0.1, cap);
    });
  }
  // The therapy wing's lot-side doors (the plan; the owner's walkthrough,
  // 2026-10): the awning door into the north support room (the envelope's
  // shell-therapy-north-opening-1, `VERANDA.door`) under its navy awning, and
  // the 3 m roll-up (opening 2, `VERANDA.rollup`) that opens the therapy
  // entry corridor onto the walkway: a grey slatted curtain in guides just
  // inside the wall's face, rolled up into a hood over the opening by day
  // (`therapy-veranda-rollup` stands `VERANDA.rollup.raised` m up; lowering
  // it is its group's y, as deliveries.ts lowers the loading roll-up). Door and
  // roll-up are on the wall, so they stay with the facade and go with the
  // exterior in the cutaway; the walkway, its garden and the block wall are
  // the site's (`therapy-veranda-and-garden`, below) and stay in view when
  // the building is opened up.
  const lotDoor = group(facade, 'therapy-lot-door-awning-and-rollup');
  const V = VERANDA,
    doorX = (V.door.x0 + V.door.x1) / 2;
  box(lotDoor, doorX, 2.32, 8.35, 2.7, 0.14, 1.1, '#2d4a74');
  box(lotDoor, doorX, 2.28, 8.35, 2.6, 0.05, 1.0, '#eeeee7');
  {
    const r = V.rollup,
      rx = (r.x0 + r.x1) / 2,
      rw = r.x1 - r.x0,
      slat = '#8f8c85';
    // the hood over the opening, proud of the face, and a guide either side
    box(lotDoor, rx, r.height, V.face - 0.1, rw + 0.3, 0.42, 0.22, '#9c9d99');
    for (const gx of [r.x0 - 0.04, r.x1 + 0.04])
      box(lotDoor, gx, 0, V.face - 0.03, 0.08, r.height, 0.1, slat);
    // the curtain, within the wall's thickness so that it rolls up out of sight above the opening
    const curtain = group(lotDoor, 'therapy-veranda-rollup');
    box(curtain, rx, 0, V.face + 0.08, rw - 0.1, r.height, 0.04, '#b4b1aa');
    for (let y = 0.12; y < r.height - 0.1; y += 0.13)
      box(curtain, rx, y, V.face + 0.055, rw - 0.1, 0.018, 0.01, slat);
    box(curtain, rx, -0.04, V.face + 0.05, rw - 0.06, 0.08, 0.1, '#7d7a74');
    curtain.position.y = r.raised;
  }
  // The veranda (the owner, 2026-10: "a garden that is accessible from inside
  // ... participants come from the inside hallway to the outside of the
  // veranda"): the walkway behind the split-face block wall ("a brick wall
  // outside"), its top level with the door sills so the doors open straight
  // onto it, two steps down to the lot at its west end with a pipe handrail,
  // and the garden: raised timber planter boxes along the wall's back with
  // herbs, flowers, shrubs and a small tree, two timber benches against the
  // wing's face opposite them (0.9 m clear between), a watering can by the
  // boxes, a potted agave past the roll-up and, on the wall's lot side, a
  // mulched bed of agaves and grasses behind a low kerb, north of the vans'
  // entry lane (z 4.3 ± a van's half width) by more than their clearance.
  {
    const veranda = group(site, 'therapy-veranda-and-garden');
    const brick = '#c49a6c',
      brickJoint = '#b58a5e',
      timber = '#8c6c4a',
      timberDark = '#6f533a',
      soil = '#5a4635',
      slab = '#c5c8c2';
    const W = V.walk,
      S = V.street,
      walkX = (W.x0 + W.x1) / 2,
      walkZ = (W.z0 + W.z1) / 2,
      riser = (W.top - S) / V.steps.risers,
      run = V.steps.depth;
    box(veranda, walkX, S, walkZ, W.x1 - W.x0, W.top - S, W.z1 - W.z0, slab);
    for (let i = 1; i < V.steps.risers; i++)
      box(
        veranda,
        W.x0 - run * (i - 0.5),
        S,
        walkZ,
        run,
        W.top - S - riser * i,
        W.z1 - W.z0,
        slab,
      );
    const stairFoot = W.x0 - run * (V.steps.risers - 1),
      railZ = W.z0 + 0.1,
      hand = 0.95;
    box(veranda, W.x0 - 0.05, W.top, railZ, 0.035, hand, 0.035, steel);
    box(veranda, stairFoot - 0.3, S, railZ, 0.035, hand, 0.035, steel);
    beam(
      veranda,
      [W.x0 - 0.05, W.top + hand, railZ],
      [stairFoot - 0.3, S + hand, railZ],
      0.035,
      0.035,
      steel,
    );
    const wallZ = V.wall.z,
      wallH = V.wall.top - S;
    box(veranda, walkX, S, wallZ, W.x1 - W.x0, wallH, V.wall.thickness, brick);
    for (const zz of [wallZ - 0.16, wallZ + 0.16]) {
      for (let y = S + 0.28; y < V.wall.top - 0.05; y += 0.2)
        box(veranda, walkX, y, zz, W.x1 - W.x0, 0.012, 0.01, brickJoint);
      for (let xx = W.x0 + 0.3; xx < W.x1; xx += 0.4)
        box(veranda, xx, S, zz, 0.01, wallH, 0.01, brickJoint);
    }
    // Garden pieces. Timber planter boxes (two board lines on every side, soil
    // inside), plants from the streetscape's palette.
    const planterBox = (x0: number, x1: number, z0: number, z1: number) => {
      const h = 0.5,
        xc = (x0 + x1) / 2,
        zc = (z0 + z1) / 2;
      box(veranda, xc, W.top, zc, x1 - x0, h, z1 - z0, timber);
      for (const y of [0.16, 0.33]) {
        for (const z of [z0 - 0.005, z1 + 0.005])
          box(veranda, xc, W.top + y, z, x1 - x0, 0.012, 0.01, timberDark);
        for (const x of [x0 - 0.005, x1 + 0.005])
          box(veranda, x, W.top + y, zc, 0.01, 0.012, z1 - z0, timberDark);
      }
      box(
        veranda,
        xc,
        W.top + h - 0.06,
        zc,
        x1 - x0 - 0.08,
        0.02,
        z1 - z0 - 0.08,
        soil,
      );
      return W.top + h - 0.04;
    };
    const shrub = (
      x: number,
      z: number,
      r: number,
      y: number,
      color: string,
    ) => {
      const m = mesh(veranda, new T.IcosahedronGeometry(r, 1), color);
      m.position.set(x, y + r * 0.8, z);
      m.scale.y = 0.85;
    };
    const bloom = (x: number, z: number, y: number, color: string) => {
      beam(veranda, [x, y, z], [x, y + 0.26, z], 0.012, 0.012, '#6a9450');
      mesh(veranda, new T.SphereGeometry(0.045, 8, 6), color).position.set(
        x,
        y + 0.28,
        z,
      );
    };
    const rosette = (x: number, z: number, y: number, r: number) => {
      for (let i = 0; i < 12; i++) {
        const a = i * 2.39996 + x,
          reach = r * (0.7 + (i % 3) * 0.15);
        beam(
          veranda,
          [x, y, z],
          [
            x + Math.cos(a) * reach,
            y + r * (0.6 + (i % 4) * 0.15),
            z + Math.sin(a) * reach,
          ],
          0.11,
          0.035,
          i % 2 ? '#7f9a95' : '#8ca6a0',
        );
      }
    };
    const grass = (x: number, z: number, y: number, r: number) => {
      const t = mesh(veranda, new T.IcosahedronGeometry(r, 1), '#8ea25a');
      t.position.set(x, y + r * 0.5, z);
      t.scale.set(1, 0.7, 1);
    };
    const bz0 = W.z0 + 0.02,
      bz1 = bz0 + 0.32,
      bzc = (bz0 + bz1) / 2;
    // west of the awning door: herbs and flowers
    {
      const top = planterBox(-28.6, -26.5, bz0, bz1);
      for (let k = 0; k < 7; k++) {
        const x = -28.42 + k * 0.26;
        if (k % 3 === 2) bloom(x, bzc + 0.04, top, k % 2 ? red : yellow);
        else shrub(x, bzc - 0.02, 0.11, top, k % 2 ? '#6a9450' : '#8ea25a');
      }
    }
    // between the door and the roll-up: shrubs, flowers and a small citrus tree
    {
      const top = planterBox(-24.75, -22.15, bz0, bz1);
      for (const [x, r, c] of [
        [-24.5, 0.17, '#668257'],
        [-24.15, 0.14, '#7f9a5f'],
        [-22.75, 0.16, '#5d8a50'],
        [-22.4, 0.13, '#668257'],
      ] as [number, number, string][])
        shrub(x, bzc, r, top, c);
      for (const [x, c] of [
        [-24.3, red],
        [-22.55, yellow],
        [-23.9, '#d4c04e'],
      ] as [number, string][])
        bloom(x, bz1 - 0.08, top, c);
      const tx = -23.45;
      mesh(
        veranda,
        new T.CylinderGeometry(0.04, 0.055, 1.2, 8),
        '#7a6048',
      ).position.set(tx, top + 0.6, bzc);
      for (let i = 0; i < 4; i++) {
        const m = mesh(
          veranda,
          new T.IcosahedronGeometry(0.4, 1),
          ['#4f7a46', '#5d8a50', '#6b9458', '#557f49'][i],
        );
        m.position.set(
          tx + Math.cos(i * 1.9) * 0.2,
          top + 1.5 + Math.sin(i * 1.3) * 0.12,
          bzc + Math.sin(i * 1.9) * 0.12,
        );
        m.scale.y = 0.9;
      }
      for (const [dx, dz] of [
        [0.25, 0.1],
        [-0.3, -0.05],
        [0.05, 0.28],
      ])
        mesh(
          veranda,
          new T.SphereGeometry(0.045, 8, 6),
          '#e6a53c',
        ).position.set(tx + dx, top + 1.4, bzc + dz);
    }
    // past the roll-up, a tall pot with an agave
    box(veranda, -18.42, W.top, bz0 + 0.22, 0.44, 0.55, 0.44, '#a9937a');
    box(veranda, -18.42, W.top + 0.51, bz0 + 0.22, 0.36, 0.02, 0.36, soil);
    rosette(-18.42, bz0 + 0.22, W.top + 0.52, 0.32);
    // two timber benches against the wing's face, facing the boxes
    const bench = (x0: number, x1: number) => {
      const z1 = V.face - 0.02,
        z0 = z1 - 0.38,
        xc = (x0 + x1) / 2,
        len = x1 - x0;
      for (const x of [x0 + 0.08, x1 - 0.08])
        for (const z of [z0 + 0.05, z1 - 0.05])
          box(veranda, x, W.top, z, 0.05, 0.42, 0.05, timberDark);
      for (let k = 0; k < 4; k++)
        box(
          veranda,
          xc,
          W.top + 0.42,
          z0 + 0.04 + k * 0.095,
          len,
          0.04,
          0.075,
          timber,
        );
      for (const x of [x0 + 0.08, x1 - 0.08])
        box(veranda, x, W.top + 0.42, z1 - 0.03, 0.05, 0.45, 0.04, timberDark);
      for (const y of [0.62, 0.78])
        box(veranda, xc, W.top + y, z1 - 0.03, len, 0.07, 0.04, timber);
    };
    bench(-28.6, -27.3);
    bench(-24.3, -23.0);
    // a watering can on the walkway by the first box
    {
      const cx = -26.62,
        cz = W.z0 + 0.58,
        can = '#4f7f73';
      mesh(
        veranda,
        new T.CylinderGeometry(0.1, 0.11, 0.24, 12),
        can,
      ).position.set(cx, W.top + 0.12, cz);
      beam(
        veranda,
        [cx + 0.06, W.top + 0.1, cz],
        [cx + 0.26, W.top + 0.27, cz - 0.04],
        0.02,
        0.02,
        can,
      );
      const handle = mesh(
        veranda,
        new T.TorusGeometry(0.07, 0.012, 6, 14),
        can,
      );
      handle.position.set(cx, W.top + 0.27, cz);
    }
    // the bed along the wall's lot side: a low kerb, mulch, agaves, grasses and a few shrubs
    {
      const face = wallZ - V.wall.thickness / 2,
        kz = face - 0.5,
        bx0 = W.x0 + 0.3,
        bx1 = W.x1 - 0.3,
        bxc = (bx0 + bx1) / 2;
      box(veranda, bxc, S, kz - 0.06, bx1 - bx0 + 0.24, 0.14, 0.12, '#d6d1c7');
      box(veranda, bxc, S, (kz + face) / 2, bx1 - bx0, 0.05, face - kz, soil);
      for (let x = bx0 + 0.45; x < bx1; x += 2.4)
        rosette(x, face - 0.26, S + 0.05, 0.3);
      for (let x = bx0 + 1.5; x < bx1; x += 2.4)
        grass(x, face - 0.24, S + 0.05, 0.22);
      for (let x = bx0 + 2.6; x < bx1 - 0.5; x += 4.8)
        shrub(x, face - 0.25, 0.2, S + 0.05, '#668257');
    }
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
  // the cactus planter by the ramp's gate (RAMP_PLANTER): a plain concrete curb round gravel, its east side running
  // with the angled stalls
  {
    const cxp =
        RAMP_PLANTER.reduce((t, p) => t + p[0], 0) / RAMP_PLANTER.length,
      czp = RAMP_PLANTER.reduce((t, p) => t + p[1], 0) / RAMP_PLANTER.length;
    patch(court, RAMP_PLANTER, -0.23, 0.18, '#dcd7cd');
    patch(
      court,
      RAMP_PLANTER.map(
        ([x, z]): Vec2 => [x + (cxp - x) * 0.12, z + (czp - z) * 0.12],
      ),
      -0.05,
      0.02,
      '#a0937c',
    );
  }
  palm(16.3, -23.2, 2.2, 1.3);
  palm(16.3, -21.5, 1.6, 1.1);
  const cactus = mesh(court, new T.SphereGeometry(0.3, 12, 8), '#7d9a5e');
  cactus.position.set(17.3, -0.02, -23.4);
  cactus.scale.set(1, 0.8, 1);
  // The clinic's alley face (photo 2026-10-03; the 2025 Street View roll-up is gone): the grey service door (the
  // envelope's opening 1) with two white panel labels, a wall pack above it (night-lights.ts) and a yellow bollard either side; the
  // barred window east of it (opening 2); a galvanised gutter run along the wall, falling from both ends to a
  // downspout west of the door, with a thin pipe beside its foot; a small white box high on the east corner.
  const rear = group(facade, 'clinic-alley-face-fittings');
  const ALLEY_FACE = -22.463 - 0.12,
    yard = -0.23,
    galv = '#c9ccc9';
  for (const lx of [-5.88, -5.47])
    box(rear, lx, 1.52, ALLEY_FACE - 0.015, 0.3, 0.32, 0.01, '#f1efe8');
  for (const bx of [-4.99, -6.5]) {
    const post = mesh(
      rear,
      new T.CylinderGeometry(0.085, 0.085, 1.1, 14),
      '#e2c227',
    );
    post.position.set(bx, yard + 0.55, ALLEY_FACE - 0.75);
  }
  // window bars: verticals every 0.13 m and two rails, just proud of the glass
  for (let bx = -4.3; bx < -3.34; bx += 0.13)
    box(rear, bx, 1.76, ALLEY_FACE - 0.03, 0.022, 1.22, 0.022, '#1f2224');
  for (const by of [2.16, 2.56])
    box(rear, -3.85, by, ALLEY_FACE - 0.03, 1.02, 0.025, 0.025, '#1f2224');
  // gutter: high at both ends, down to the downspout at x -7.46
  const gutterZ = ALLEY_FACE - 0.09,
    drop = -7.46;
  beam(rear, [0.12, 3.81, gutterZ], [drop, 3.29, gutterZ], 0.12, 0.12, galv);
  beam(rear, [drop, 3.29, gutterZ], [-14.75, 3.89, gutterZ], 0.12, 0.12, galv);
  beam(rear, [drop, 3.29, gutterZ], [drop, yard, gutterZ], 0.11, 0.11, galv);
  beam(
    rear,
    [drop - 0.3, 1.0, ALLEY_FACE - 0.05],
    [drop - 0.3, yard, ALLEY_FACE - 0.05],
    0.05,
    0.05,
    galv,
  );
  box(rear, -0.37, 3.82, ALLEY_FACE - 0.08, 0.22, 0.24, 0.14, '#ecebe6');
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
  // Fire department connection on the wing's west face by its lot-side corner
  // (the envelope's shell-therapy-west, centred on x −31.19 and 0.24 thick, so
  // its outer face is at x −31.31): the standpipe against the face, its two
  // Siamese inlets facing the street.
  const fdc = group(street, 'fire-department-connection');
  const FDC_FACE = -31.188761 - 0.12;
  mesh(fdc, new T.CylinderGeometry(0.06, 0.06, 0.8, 8), red).position.set(
    FDC_FACE - 0.08,
    0.4,
    9.4,
  );
  for (const dz of [-0.12, 0.12])
    mesh(fdc, new T.CylinderGeometry(0.09, 0.09, 0.1, 10), red)
      .rotateZ(Math.PI / 2)
      .position.set(FDC_FACE - 0.17, 0.82, 9.4 + dz);
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
  // What stands in the court (the staff entrance's landing, ramp and rails, the pergola, the planters and their
  // palms, the garage ramp with its walls, rails and gate, the electrical room's gates and screen, the utility pole)
  // is the site's, so it stays in view when the building is opened up in the cutaway (the owner, 2026-10: "the ramp
  // to the staff entrance is only visible from the exterior"). What is fixed to the building's faces (the door and
  // window surrounds and glazing, the camera, keypad and wall light, the loading block's jambs, roll-up curtain,
  // louvre and canopy, the wall above the block) goes with the facade, as it would float over the cut walls.
  const court2 = group(site, 'rear-court-staff-entrance-and-loading');
  const wingFace = group(facade, 'rear-court-wing-face-fittings');
  const SOUTH_Z = -22.463,
    BUMP_Z = -15.213;
  // The wing's north wall shows above the loading block's lower roof (eave 5.3 against the wing's 6.5).
  box(wingFace, 8.47, 5.2, -12.465, 6.56, 1.45, 0.24, COURT_CONCRETE);
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
  // The plan's door opening on this wall is at z −2.34 → −0.356 (the envelope's shell-east-exit-opening-1, cut to it
  // by scripts/apply-owner-review-exterior.mjs); the canopy's north end is 1.3 m past it.
  const doorW = 1.984,
    doorZ = -1.348;
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
        wingFace,
        FACE_X + proud / 2,
        sill ? y0 - rim : 0,
        z,
        proud,
        y1 + rim - (sill ? y0 - rim : 0),
        rim,
        rearSurround,
      );
    box(
      wingFace,
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
        wingFace,
        FACE_X + proud / 2,
        y0 - rim,
        (z0 + z1) / 2,
        proud,
        rim,
        z1 - z0 + 2 * rim,
        rearSurround,
      );
  };
  // Glass double door in the plan's opening, 1.3 m in from the canopy's north end.
  frameAround(doorZ - doorW / 2, doorZ + doorW / 2, 0, 2.45, false);
  box(wingFace, FACE_X + 0.03, 0, doorZ, 0.04, 2.45, doorW, glassDark);
  box(wingFace, FACE_X + 0.06, 0, doorZ, 0.03, 2.45, 0.07, rearSurround);
  // D-pull handles either side of the meeting stile at hip height (photo 2026-10-05).
  for (const sz of [doorZ - 0.11, doorZ + 0.11]) {
    box(wingFace, FACE_X + 0.11, 0.8, sz, 0.025, 0.28, 0.025, alu);
    for (const y of [0.84, 1.04])
      box(wingFace, FACE_X + 0.075, y, sz, 0.06, 0.02, 0.02, alu);
  }
  // Vinyl on the glass (photo 2026-10-05; scripts/lobby-door-decals.py): facing the door, the right-hand leaf (−z)
  // has the street number at the top, STAFF ENTRANCE ONLY / 员工入口 and a NO SOLICITING sticker; the left-hand leaf
  // carries the lobby door's information block without the street number. Cut out, like the lobby's, so night glazing leaves it alone.
  if (typeof document !== 'undefined') {
    const vinyl = (url: string, w: number, h: number, y: number, z: number) => {
      const map = new T.TextureLoader().load(url);
      map.colorSpace = T.SRGBColorSpace;
      map.anisotropy = 4;
      const m = new T.Mesh(
        new T.PlaneGeometry(w, h),
        new T.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.6 }),
      );
      m.rotation.y = Math.PI / 2;
      m.position.set(FACE_X + 0.055, y, z);
      wingFace.add(m);
    };
    vinyl(
      '/reference/photos/rear-door-right.png',
      0.68,
      2.16,
      0.1 + 2.16 / 2,
      doorZ - doorW / 4,
    );
    // the information block's top (row 262) at 1.70 m, as on the photo
    vinyl(
      '/reference/photos/rear-door-left.png',
      0.68,
      0.96,
      1.962 - 0.96 / 2,
      doorZ + doorW / 4,
    );
  }
  // A dome camera on a wall bracket just outside the surround's top corner on the left-hand (+z) side, and the
  // black access keypad on the wall just right of the surround at hand height.
  const camZ = doorZ + doorW / 2 + rim + 0.22;
  box(wingFace, FACE_X + 0.07, 2.7, camZ, 0.14, 0.05, 0.06, '#e9ebea');
  const camBody = mesh(
    wingFace,
    new T.CylinderGeometry(0.08, 0.08, 0.06, 16),
    '#eceeed',
  );
  camBody.position.set(FACE_X + 0.15, 2.68, camZ);
  const camLens = mesh(
    wingFace,
    new T.SphereGeometry(0.07, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    '#2c3236',
  );
  camLens.position.set(FACE_X + 0.15, 2.65, camZ);
  camLens.rotation.x = Math.PI;
  const padZ = doorZ - doorW / 2 - rim - 0.12;
  box(wingFace, FACE_X + 0.015, 0.97, padZ, 0.03, 0.18, 0.1, '#1c1e20');
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++)
      box(
        wingFace,
        FACE_X + 0.033,
        0.99 + r * 0.03,
        padZ - 0.025 + c * 0.025,
        0.006,
        0.016,
        0.016,
        '#d9dad6',
      );
  box(wingFace, FACE_X + 0.033, 1.12, padZ, 0.006, 0.02, 0.04, '#5b6064');
  const winZ = pz0 + 2.5 + 0.65,
    winTop = 2.45,
    winH = 1.3;
  frameAround(winZ - 0.65, winZ + 0.65, winTop - winH, winTop, true);
  box(wingFace, FACE_X + 0.02, winTop - winH, winZ, 0.02, winH, 1.3, glassDark);
  frameAround(-11.04, -9.72, winTop - winH, winTop, true);
  // Raised concrete landing along the wall in front of the door and window, two steps up from the lot.
  // It ends at the walkway out between the two planters (z −6.8 → −5.3), which a short ramp drops into.
  const landW = 2.1,
    landZ0 = -6.8,
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
  // north end, and a single handrail on posts continuing south past the window to the walkway, which stays open.
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
  const walkRamp = mesh(court2, new T.BoxGeometry(1.25, 0.08, 1.5), '#c5c8c2');
  walkRamp.position.set(FACE_X + landW + 0.6, -0.15, -6.05);
  walkRamp.rotation.z = -Math.atan2(0.23, 1.25);
  const railEnd = -5.2; // the walkway's south side
  for (const sz of [(rail2[1] + railEnd) / 2, railEnd])
    box(court2, railX2, 0, sz, 0.04, 0.95, 0.04, bronze);
  beam(
    court2,
    [railX2, 0.95, rail2[1]],
    [railX2, 0.95, railEnd],
    0.035,
    0.035,
    bronze,
  );
  // Dirt planter in front of the landing with its blue-painted curb; agave by the door, pygmy date palm by the window.
  // Its east curb is where the satellite shows it (x 19.35), beside the accessible stall's hatched access aisle.
  const plX0 = FACE_X + landW,
    plX1 = 19.35,
    plZ0 = -5.3; // its north end, at the walkway out to the lot (photo 2026-10-03)
  box(
    court2,
    (plX0 + plX1) / 2,
    -0.23,
    (plZ0 + landZ1) / 2,
    plX1 - plX0,
    0.14,
    landZ1 - plZ0,
    '#9a8663',
  );
  box(
    court2,
    plX1 - 0.08,
    -0.23,
    (plZ0 + landZ1) / 2,
    0.16,
    0.2,
    landZ1 - plZ0,
    '#2d5aa6',
  );
  for (const sz of [plZ0 + 0.08, landZ1 - 0.08])
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
  palm(plX0 + 0.5, winZ + 0.5, 1.9, 1.2);
  // The second planter, north of the walkway (photo 2026-10-03, REAR_COURT_PLANTERS[1]): off the wall to a rounded
  // east end between the walkway and the first parking stall, a concrete curb painted blue on the walkway side,
  // two pygmy date palms with twin leaning trunks, one at the rounded end and one by the wall.
  {
    const [x0, z0, x1, z1] = REAR_COURT_PLANTERS[1],
      r = (z1 - z0) / 2,
      cz = (z0 + z1) / 2,
      cx = x1 - r;
    const outline = (inset: number) => {
      const pts: [number, number][] = [
        [x0 + 0.1, z0 + inset],
        [cx, z0 + inset],
      ];
      for (let i = 1; i < 12; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 12;
        pts.push([
          cx + (r - inset) * Math.cos(a),
          cz + (r - inset) * Math.sin(a),
        ]);
      }
      pts.push([cx, z1 - inset], [x0 + 0.1, z1 - inset]);
      return pts;
    };
    const shape = (pts: [number, number][]) =>
      new T.Shape(pts.map(([x, z]) => new T.Vector2(x, -z)));
    const curbShape = shape(outline(0));
    curbShape.holes.push(
      new T.Path(outline(0.16).map(([x, z]) => new T.Vector2(x, -z))),
    );
    const extrude = (sh: T.Shape, h: number) => {
      const geo = new T.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      return geo;
    };
    mesh(court2, extrude(curbShape, 0.2), '#d3cfc5').position.y = -0.23;
    mesh(court2, extrude(shape(outline(0.16)), 0.13), '#9a8663').position.y =
      -0.23;
    // the blue paint along the walkway side and round the rounded end's walkway half
    box(
      court2,
      (x0 + cx) / 2 + 0.05,
      -0.03,
      z1 - 0.08,
      cx - x0 - 0.1,
      0.012,
      0.17,
      '#2d5aa6',
    );
    for (let k = 0; k < 6; k++) {
      const a0 = (Math.PI / 2) * (k / 6),
        a1 = (Math.PI / 2) * ((k + 1) / 6),
        rr = r - 0.08;
      beam(
        court2,
        [cx + rr * Math.cos(a0), -0.025, cz + rr * Math.sin(a0)],
        [cx + rr * Math.cos(a1), -0.025, cz + rr * Math.sin(a1)],
        0.17,
        0.012,
        '#2d5aa6',
      );
    }
    const pygmy = (bx: number, bz: number, lean: [number, number][]) => {
      const g = group(court2, 'pygmy-date-palm');
      lean.forEach(([dx, dz], k) => {
        const h = 2.1 + 0.3 * k,
          top = new T.Vector3(bx + dx, h - 0.23, bz + dz),
          base = new T.Vector3(bx, -0.1, bz),
          trunk = mesh(
            g,
            new T.CylinderGeometry(0.1, 0.13, base.distanceTo(top), 8),
            '#6f5b44',
          );
        trunk.position.copy(base).lerp(top, 0.5);
        trunk.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          top.clone().sub(base).normalize(),
        );
        // arching fronds: a dome of thin leaves, the inner ones near level, the outer ones drooping
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + k * 0.7,
            ring = i % 3,
            reach = [0.3, 0.5, 0.62][ring],
            tilt = [-0.1, -0.45, -0.8][ring];
          const frond = mesh(
            g,
            new T.BoxGeometry([0.7, 0.95, 1.05][ring], 0.03, 0.2),
            i % 2 ? '#6a9450' : '#7fa35c',
          );
          frond.position.set(
            top.x + Math.cos(a) * reach,
            top.y + [0.22, 0.08, -0.12][ring],
            top.z + Math.sin(a) * reach,
          );
          frond.rotation.set(0, -a, tilt);
        }
      });
    };
    pygmy(cx + 0.1, cz + 0.1, [
      [-0.45, 0.35],
      [0.5, -0.3],
    ]);
    pygmy(x0 + 1.3, cz - 0.6, [
      [-0.3, -0.35],
      [0.35, 0.3],
    ]);
  }
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
    wingFace,
    [FACE_X + 0.02, 3.9, -11.2],
    [FACE_X + 1.2, 4.15, -11.2],
    0.06,
    0.06,
    '#6f7577',
  );
  box(wingFace, FACE_X + 1.3, 4.08, -11.2, 0.55, 0.16, 0.3, '#7d8284');
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
  // Three VISITORS PARKING ONLY signs on the lot-side wall (photos 2026-10-03), 12 x 18 in, 1.5 m up, each at the
  // head of an angled stall: the first one stall past the line nearest the drop-off's steps (as photographed), the
  // others every second stall toward the alley. Drawn to a canvas in the browser; headless a plain plate.
  // South of the lobby the wall is the clinic's (shell-clinic-west, centred on x −14.78): its face is 0.12 m further out.
  const CLINIC_FACE = -14.780318 - 0.12;
  for (const sz of [-9.35, -14.75, -20.15]) {
    const sw = 0.305,
      sh = 0.457,
      sy = -0.23 + 1.53;
    if (typeof document === 'undefined') {
      box(lobby, CLINIC_FACE - 0.01, sy - sh / 2, sz, 0.01, sh, sw, '#f4f4f0');
      continue;
    }
    const W = 512,
      H = 768,
      canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    const green = '#1e6b3c',
      sans = 'Helvetica, Arial, sans-serif';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = green;
    g.lineWidth = 9;
    g.beginPath();
    g.roundRect(14, 14, W - 28, H - 28, 18);
    g.stroke();
    // the Seen mark: the three ginkgo leaves of Resource/seen_logo_color.svg (viewBox 34 x 35), jade to copper blue
    g.save();
    g.translate(W * 0.24 - 17 * 3.4, H * 0.14 - 17.5 * 3.4);
    g.scale(3.4, 3.4);
    for (const [d, c] of [
      [
        'M19.1475 0.803974C16.8765 -0.205361 12.3781 -0.248867 11.3687 0.586445C10.1158 1.63058 10.5508 4.50197 10.1331 4.78911C9.52407 5.20676 8.69744 2.57901 7.20954 2.42239C6.00008 2.29187 3.55508 4.56288 2.04108 6.9992C0.213833 9.9402 -0.569294 13.5251 1.28405 13.8644C3.94661 14.3604 8.53213 12.333 11.8647 17.2753C11.9256 17.371 12.0039 17.4232 12.1431 17.4232C12.3084 17.4232 12.4912 17.3362 12.5086 17.2231C12.7522 15.7526 12.6478 11.1323 19.5391 4.51937C21.2097 2.90966 21.1314 1.69149 19.1389 0.803974H19.1475Z',
        '#a7e2c0',
      ],
      [
        'M28.9445 28.5433C30.9458 27.0815 33.2429 23.2008 33.0254 21.9217C32.747 20.312 30.0409 19.2592 29.9974 18.7458C29.9452 18.0062 32.6251 18.6066 33.5039 17.3971C34.2174 16.4139 33.4778 13.1596 32.1205 10.6363C30.4846 7.5822 27.7786 5.11107 26.5517 6.54676C24.7941 8.60894 24.2546 13.586 18.303 14.0037C18.1899 14.0037 18.1029 14.0559 18.042 14.169C17.9637 14.3082 17.9463 14.517 18.042 14.5866C19.1905 15.5351 23.254 17.7539 25.525 27.0293C26.0819 29.2829 27.1782 29.8224 28.9445 28.5346V28.5433Z',
        '#5dc6b2',
      ],
      [
        'M0.0308758 23.1573C0.291911 25.6197 2.50201 29.5526 3.72887 30.0051C5.26028 30.5707 7.53129 28.7521 7.98375 28.9696C8.64504 29.2916 6.79168 31.319 7.40076 32.685C7.89673 33.7988 11.0814 34.782 13.9527 34.869C17.4158 34.9734 20.905 33.8684 20.2785 32.0934C19.3736 29.5352 15.3275 26.5768 17.9379 21.2256C17.9901 21.1299 17.9901 21.0342 17.9292 20.9124C17.8509 20.7731 17.6768 20.66 17.5724 20.6948C16.1802 21.2169 12.2299 23.6184 3.05018 20.9559C0.822683 20.312 -0.195355 20.9907 0.0308758 23.166V23.1573Z',
        '#00a7a2',
      ],
    ] as const) {
      g.fillStyle = c;
      // (validate-renderer's smoke test stubs the canvas but has no Path2D)
      if (typeof Path2D !== 'undefined') g.fill(new Path2D(d));
    }
    g.restore();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#3d4446';
    g.font = `56px "PingFang SC", "Noto Sans SC", ${sans}`;
    g.fillText('见心颐养', W * 0.62, H * 0.1);
    g.font = `bold 32px ${sans}`;
    g.fillText('SEEN HEALTH', W * 0.62, H * 0.175);
    g.fillStyle = green;
    for (const [t, y] of [
      ['VISITORS', 0.3],
      ['PARKING', 0.405],
      ['ONLY', 0.51],
    ] as const) {
      g.font = `bold 84px ${sans}`;
      const fit = Math.min(1, (W * 0.84) / g.measureText(t).width);
      g.font = `bold ${Math.floor(84 * fit)}px ${sans}`;
      g.fillText(t, W / 2, H * y);
    }
    // the green band: the tow-away warning and its pictogram
    g.fillRect(14, H * 0.575, W - 28, H - 28 - H * 0.575 + 14);
    g.fillStyle = '#ffffff';
    g.font = `bold 30px ${sans}`;
    g.fillText('UNAUTHORIZED VEHICLES', W / 2, H * 0.625);
    g.fillText('TOWED AT VEHICLE', W / 2, H * 0.67);
    g.fillText("OWNER'S EXPENSE", W / 2, H * 0.715);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5;
    g.beginPath();
    g.roundRect(W * 0.1, H * 0.755, W * 0.8, H * 0.18, 8);
    g.stroke();
    // a car lifted at its rear by a tow truck, in white
    const py = H * 0.885;
    g.beginPath();
    g.moveTo(W * 0.14, py - 10);
    g.lineTo(W * 0.14, py - 48);
    g.lineTo(W * 0.24, py - 62);
    g.lineTo(W * 0.38, py - 40);
    g.lineTo(W * 0.42, py - 10);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(W * 0.44, py - 10);
    g.lineTo(W * 0.44, py - 34);
    g.lineTo(W * 0.62, py - 34);
    g.lineTo(W * 0.66, py - 66);
    g.lineTo(W * 0.78, py - 66);
    g.lineTo(W * 0.86, py - 34);
    g.lineTo(W * 0.86, py - 10);
    g.closePath();
    g.fill();
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(W * 0.38, py - 36);
    g.lineTo(W * 0.6, py - 56);
    g.stroke();
    g.fillStyle = green;
    for (const wx of [0.26, 0.54, 0.78]) {
      g.beginPath();
      g.arc(W * wx, py - 8, 17, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(W * wx, py - 8, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = green;
    }
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    const plate = new T.Mesh(
      new T.PlaneGeometry(sw, sh),
      new T.MeshStandardMaterial({ map, roughness: 0.55 }),
    );
    plate.position.set(CLINIC_FACE - 0.012, sy, sz);
    plate.rotation.y = -Math.PI / 2; // faces the lot (−x)
    lobby.add(plate);
  }
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

  // The garage court (photos 2026-10-02). The loading block's face (z −15.21, x 5.19 → 11.75): one recessed frame
  // with the roll-up curtain across it and above a service door at its east end (the envelope's openings 1-3), a
  // louvre, a camera dome and two conduits west of it, all under a steel canopy. East of the block the ramp drops
  // to the underground garage's roll-up in the wing's north wall; west of it the electrical room fills the notch to
  // the clinic's wall, corrugated gates below and an expanded-metal screen above.
  const concrete = '#b9b6ae',
    jamb = '#8f8d87',
    canopySteel = '#b9bdbe',
    steelDark = '#8e9496',
    pipeColor = '#ddd5c3',
    gateTan = '#d7cfbd',
    meshDark = '#5b5f5d';
  const LF = BUMP_Z - 0.125; // the block's outer face
  // recessed jamb round the frame (x 7.52 → 11.01, 3.54 tall)
  for (const [x, w] of [
    [7.46, 0.12],
    [11.07, 0.12],
  ])
    box(wingFace, x, 0, LF - 0.01, w, 3.6, 0.03, jamb);
  box(wingFace, 9.265, 3.42, LF - 0.01, 3.73, 0.18, 0.03, jamb);
  // the curtain over envelope opening 1 (x 7.60 → 10.11; it stays down, the
  // electrical room is behind it) and the 0.9 m service door east of it
  // (x 10.11 → 11.01, deliveries.ts SERVICE_DOOR) under its transom bars
  const rollup = group(wingFace, 'rear-loading-rollup');
  box(rollup, 8.855, -0.23, BUMP_Z - 0.04, 2.51, 3.61, 0.04, '#b4b1aa');
  for (let y = 0.12; y < 3.38; y += 0.13)
    box(rollup, 8.855, y, BUMP_Z - 0.065, 2.51, 0.018, 0.01, '#8f8c85');
  for (let y = 2.3; y < 3.38; y += 0.13)
    box(wingFace, 10.56, y, LF - 0.005, 0.9, 0.018, 0.01, '#8f8c85');
  // the service door's notice and lever
  box(wingFace, 10.56, 1.25, LF - 0.03, 0.28, 0.2, 0.01, '#f2efe4');
  box(wingFace, 10.22, 0.98, LF - 0.06, 0.14, 0.03, 0.05, '#c7c9c8');
  // louvre, camera dome, conduits, a no-smoking plate
  box(wingFace, 6.56, 2.37, LF - 0.03, 0.56, 0.77, 0.06, '#a6a8a4');
  for (let y = 2.45; y < 3.08; y += 0.08)
    box(wingFace, 6.56, y, LF - 0.065, 0.46, 0.025, 0.03, '#6e7472');
  const camDome = mesh(
    wingFace,
    new T.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    '#eceeed',
  );
  camDome.position.set(5.95, 3.62, LF - 0.06);
  camDome.rotation.x = Math.PI / 2;
  for (const [x, top] of [
    [7.02, 3.1],
    [5.45, 2.35],
  ])
    beam(
      wingFace,
      [x, 0, LF - 0.05],
      [x, top, LF - 0.05],
      0.045,
      0.045,
      '#a9aba7',
    );
  box(wingFace, 6.62, 1.75, LF - 0.02, 0.14, 0.2, 0.01, '#f2efe4');
  // steel canopy over the face: a deep fascia in front, the soffit falling to it, ribs underneath
  const can = { x0: 5.3, x1: 11.75, wallY: 4.65, frontY: 4.3, depth: 1.95 };
  const soffit = mesh(
    wingFace,
    new T.BoxGeometry(
      can.x1 - can.x0,
      0.05,
      Math.hypot(can.depth, can.wallY - can.frontY),
    ),
    steelDark,
  );
  soffit.position.set(
    (can.x0 + can.x1) / 2,
    (can.wallY + can.frontY) / 2,
    LF - can.depth / 2,
  );
  soffit.rotation.x = Math.atan2(can.wallY - can.frontY, can.depth);
  box(
    wingFace,
    (can.x0 + can.x1) / 2,
    can.frontY - 0.05,
    LF - can.depth,
    can.x1 - can.x0,
    0.55,
    0.06,
    canopySteel,
  );
  for (const sx of [can.x0, can.x1])
    box(
      wingFace,
      sx,
      can.frontY - 0.05,
      LF - can.depth / 2,
      0.05,
      0.55,
      can.depth,
      canopySteel,
    );
  for (let x = can.x0 + 0.8; x < can.x1 - 0.4; x += 1.6)
    beam(
      wingFace,
      [x, can.wallY - 0.08, LF],
      [x, can.frontY, LF - can.depth],
      0.06,
      0.12,
      steelDark,
    );

  // The garage ramp (GARAGE_RAMP): a sloped slab and a landing at the door, a block retaining wall on its west side
  // (rail on its cap), a concrete curb wall on its east side (rail), a two-leaf gate across its head.
  const R = GARAGE_RAMP,
    floorY = R.grade - R.depth,
    rx0 = R.x0 + 0.3,
    rx1 = R.x1 - 0.3,
    slopeL = Math.hypot(R.foot - R.top, R.depth);
  const slab = mesh(
    court2,
    new T.BoxGeometry(rx1 - rx0, 0.2, slopeL),
    concrete,
  );
  slab.position.set(
    (rx0 + rx1) / 2,
    (R.grade + floorY) / 2 - 0.1,
    (R.top + R.foot) / 2,
  );
  slab.rotation.x = Math.atan2(R.depth, R.foot - R.top);
  box(
    court2,
    (rx0 + rx1) / 2,
    floorY - 0.2,
    (R.foot + R.door) / 2,
    rx1 - rx0,
    0.2,
    R.door - R.foot,
    concrete,
  );
  box(
    court2,
    R.x0 + 0.15,
    floorY - 0.2,
    (R.top + R.door) / 2,
    0.3,
    R.depth + 0.28,
    R.door - R.top,
    '#aaa69d',
  );
  for (let y = floorY + 0.2; y < R.grade; y += 0.2)
    box(
      court2,
      rx0 + 0.003,
      y,
      (R.top + R.door) / 2,
      0.006,
      0.012,
      R.door - R.top,
      '#97938b',
    );
  box(
    court2,
    R.x1 - 0.15,
    floorY - 0.2,
    (R.top + R.door) / 2,
    0.3,
    R.depth + 0.48,
    R.door - R.top,
    concrete,
  );
  // the wing's wall below the court and the garage's roll-up with its concrete header
  box(
    court2,
    (R.x0 + R.x1) / 2,
    floorY - 0.2,
    R.door,
    R.x1 - R.x0,
    R.depth + 0.2,
    0.24,
    COURT_CONCRETE,
  );
  box(
    court2,
    (rx0 + rx1) / 2,
    floorY,
    R.door - 0.14,
    rx1 - rx0 - 0.05,
    2.0,
    0.04,
    '#a3abb2',
  );
  for (let y = floorY + 0.1; y < floorY + 2; y += 0.09)
    box(
      court2,
      (rx0 + rx1) / 2,
      y,
      R.door - 0.165,
      rx1 - rx0 - 0.05,
      0.014,
      0.01,
      '#7f8890',
    );
  box(
    court2,
    (R.x0 + R.x1) / 2,
    floorY + 2.0,
    R.door - 0.17,
    R.x1 - R.x0 - 0.3,
    0.42,
    0.1,
    '#a7a49c',
  );
  // a dome light high on the wing's wall over the ramp
  box(wingFace, 13.5, 4.4, R.door - 0.16, 0.34, 0.18, 0.1, '#55595a');
  // pipe rails: posts every ~1.6 m and five rails, on both walls and across the gate
  const pipeRail = (
    x: number,
    base: (z: number) => number,
    z0: number,
    z1: number,
  ) => {
    const n = Math.max(1, Math.round((z1 - z0) / 1.6));
    for (let i = 0; i <= n; i++) {
      const z = z0 + ((z1 - z0) * i) / n;
      beam(
        court2,
        [x, base(z), z],
        [x, base(z) + 1.07, z],
        0.05,
        0.05,
        pipeColor,
      );
    }
    for (let k = 1; k <= 5; k++)
      beam(
        court2,
        [x, base(z0) + 0.21 * k, z0],
        [x, base(z1) + 0.21 * k, z1],
        0.042,
        0.042,
        pipeColor,
      );
  };
  pipeRail(R.x0 + 0.15, () => R.grade + 0.08, R.top, R.door - 0.2);
  pipeRail(R.x1 - 0.15, () => R.grade + 0.28, R.top, R.door - 0.2);
  for (const [g0, g1] of [
    [R.x0 + 0.3, (R.x0 + R.x1) / 2],
    [(R.x0 + R.x1) / 2, R.x1 - 0.3],
  ]) {
    for (const x of [g0 + 0.03, g1 - 0.03])
      beam(
        court2,
        [x, R.grade + 0.05, R.top],
        [x, R.grade + 1.4, R.top],
        0.05,
        0.05,
        pipeColor,
      );
    for (let k = 0; k < 6; k++) {
      const y = R.grade + 0.12 + k * 0.25;
      beam(court2, [g0, y, R.top], [g1, y, R.top], 0.04, 0.04, pipeColor);
    }
  }
  for (const x of [R.x0 + 0.08, R.x1 - 0.08])
    box(court2, x, R.grade, R.top, 0.09, 1.5, 0.09, pipeColor);

  // The electrical room in the notch (x 0 → 5.19, front at the block's face), laid out from the photo taken along
  // it (camera resected against the block's face and the pole): from the east a fixed panel, the gate leaf with the
  // red MAIN ELECTRICAL ROOM plate (hinged at its east post; deliveries.ts swings it for the package courier),
  // padlocked to a wide leaf with NO PARKING ANY TIME, a narrow leaf at the clinic's wall; corrugated, a mesh strip
  // at the top; the expanded-metal screen above in bays; a thin metal roof edge; two bollards in front.
  const EZ = LF + 0.03,
    ex0 = 0.12,
    ex1 = 5.07,
    gateTop = 2.0,
    roofY = 4.05;
  for (const x of [ex1, 3.81, 2.24, 0.79, ex0])
    box(court2, x, -0.23, EZ, 0.08, roofY + 0.23, 0.08, '#c9c2b2');
  box(court2, (ex0 + ex1) / 2, gateTop, EZ, ex1 - ex0, 0.08, 0.08, '#c9c2b2');
  const corrugated = (parent: T.Object3D, x0: number, x1: number, ox = 0) => {
    box(
      parent,
      ox + (x0 + x1) / 2,
      -0.18,
      0,
      x1 - x0 - 0.06,
      1.75,
      0.03,
      gateTan,
    );
    for (let x = x0 + 0.12; x < x1 - 0.06; x += 0.12)
      box(parent, ox + x, -0.18, -0.02, 0.035, 1.75, 0.012, '#c4bba7');
    box(
      parent,
      ox + (x0 + x1) / 2,
      1.6,
      0,
      x1 - x0 - 0.06,
      0.35,
      0.015,
      meshDark,
    );
    for (const y of [-0.18, 1.55, 1.95])
      box(
        parent,
        ox + (x0 + x1) / 2,
        y,
        -0.01,
        x1 - x0 - 0.04,
        0.05,
        0.05,
        '#c9c2b2',
      );
  };
  const fixedGates = group(court2, 'electrical-room-gates');
  fixedGates.position.z = EZ;
  corrugated(fixedGates, 3.81, ex1);
  corrugated(fixedGates, 0.79, 2.24);
  corrugated(fixedGates, ex0, 0.79);
  // The two signs (photo 2026-10-02, placed through its solved camera): a 12 x 18 in NO PARKING ANY TIME sign on the
  // wide leaf by the padlock, and the red MAIN ELECTRICAL ROOM plate on the gate leaf (below). Drawn to a canvas in
  // the browser; headless (the validators) each is a plain plate.
  const sign = (
    parent: T.Object3D,
    x: number,
    y: number,
    w: number,
    h: number,
    background: string,
    draw: (g: CanvasRenderingContext2D, W: number, H: number) => void,
  ) => {
    if (typeof document === 'undefined') {
      box(parent, x, y - h / 2, -0.04, w, h, 0.01, background);
      return;
    }
    const W = 512,
      H = Math.round((512 * h) / w),
      canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d')!;
    g.fillStyle = background;
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    draw(g, W, H);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 4;
    const plate = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.MeshStandardMaterial({ map, roughness: 0.6 }),
    );
    // the gates face the court (−z)
    plate.position.set(x, y, -0.045);
    plate.rotation.y = Math.PI;
    parent.add(plate);
  };
  const doubleArrow = (
    g: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    len: number,
    t: number,
  ) => {
    g.lineWidth = t;
    g.beginPath();
    g.moveTo(cx - len / 2 + t * 2, cy);
    g.lineTo(cx + len / 2 - t * 2, cy);
    g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * (len / 2), cy);
      g.lineTo(cx + s * (len / 2 - t * 3.2), cy - t * 2);
      g.lineTo(cx + s * (len / 2 - t * 3.2), cy + t * 2);
      g.closePath();
      g.fill();
    }
  };
  sign(fixedGates, 1.95, 1.17, 0.32, 0.46, '#f6f4ef', (g, W, H) => {
    const red = '#c0272d';
    g.strokeStyle = g.fillStyle = red;
    g.lineWidth = 10;
    g.strokeRect(14, 14, W - 28, H - 28);
    g.font = 'bold 190px Helvetica, Arial, sans-serif';
    g.fillText('NO', W / 2, H * 0.2);
    g.font = 'bold 92px Helvetica, Arial, sans-serif';
    g.fillText('PARKING', W / 2, H * 0.42);
    g.fillText('ANY', W / 2, H * 0.57);
    g.fillText('TIME', W / 2, H * 0.71);
    doubleArrow(g, W / 2, H * 0.86, W * 0.62, 14);
  });
  // the leaf on a pivot at its east hinge; its padlock hasp at the west edge
  const pedGate = group(court2, 'electrical-room-gate-leaf');
  pedGate.position.set(3.81, 0, EZ);
  corrugated(pedGate, -1.57, 0);
  sign(pedGate, -0.86, 1.45, 0.55, 0.16, '#c62a2a', (g, W, H) => {
    g.fillStyle = '#ffffff';
    // the up arrow at the left, then the two lines of white capitals
    g.beginPath();
    g.moveTo(W * 0.075, H * 0.14);
    g.lineTo(W * 0.125, H * 0.5);
    g.lineTo(W * 0.095, H * 0.5);
    g.lineTo(W * 0.095, H * 0.86);
    g.lineTo(W * 0.055, H * 0.86);
    g.lineTo(W * 0.055, H * 0.5);
    g.lineTo(W * 0.025, H * 0.5);
    g.closePath();
    g.fill();
    // the lettering is fitted between the arrow and the plate's right edge
    g.font = 'bold 50px Helvetica, Arial, sans-serif';
    const room = W * 0.8,
      fit = Math.min(1, room / g.measureText('MAIN ELECTRICAL').width);
    g.font = `bold ${Math.floor(50 * fit)}px Helvetica, Arial, sans-serif`;
    g.fillText('MAIN ELECTRICAL', W * 0.57, H * 0.3);
    g.fillText('ROOM', W * 0.57, H * 0.72);
  });
  box(pedGate, -1.5, 0.72, -0.05, 0.1, 0.16, 0.05, '#8a8d8c');
  // the screen above: expanded metal in bays between posts
  box(
    court2,
    (ex0 + ex1) / 2,
    gateTop + 0.08,
    EZ + 0.02,
    ex1 - ex0,
    roofY - gateTop - 0.08,
    0.02,
    meshDark,
  );
  for (const x of [2.43, 1.13])
    box(court2, x, gateTop, EZ - 0.02, 0.06, roofY - gateTop, 0.06, '#c9c2b2');
  // its roof and the thin metal edge running on across the block's face to the canopy
  box(
    court2,
    (ex0 + ex1) / 2,
    roofY,
    (EZ - 12.585) / 2,
    ex1 - ex0,
    0.08,
    -12.585 - EZ,
    '#a9aca8',
  );
  box(
    wingFace,
    (ex0 + 7.3) / 2,
    roofY - 0.06,
    EZ - 0.08,
    7.3 - ex0,
    0.16,
    0.08,
    canopySteel,
  );
  // the clinic's wall beside it: a louvre box and a small grey cabinet
  box(wingFace, 0.17, 2.0, -16.3, 0.1, 1.0, 0.42, '#a6a8a4');
  box(wingFace, 0.17, 1.45, -15.75, 0.1, 0.32, 0.4, '#9a9d9b');
  for (const x of [3.6, 0.67]) {
    const post = mesh(
      court2,
      new T.CylinderGeometry(0.1, 0.1, 1.0, 12),
      '#cfc8b6',
    );
    post.position.set(x, -0.23 + 0.5, EZ - 0.62);
  }

  // Utility pole with its yellow guard, east of the ramp's head (photos 2026-10-02).
  const poleX = 15.85,
    poleZ = -15.8;
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

  // The court between the adjacent block (1819 W Valley Blvd #B, whose north wall is at z 3.41 and east wall at
  // x 29.81) and the dialysis center's lot, from five photos of 2026-10-05 placed against the satellite and the
  // stall lines (the phone's compass was off by up to 100 degrees, so each camera was solved from what it shows):
  // - A: a big Mexican blue fan palm in a long planter with a faded pinkish-grey curb, its north end rounded, against
  //   the divider's west side;
  // - B: a raised divider with a bronze pipe rail on its west side, grasses and a small fan palm, running south from
  //   the tree island's south tip;
  // - C/F: the fan palm's island (neighborhood.ts CURB_ISLANDS_PX[4]) with its curb painted red: a second blue fan
  //   palm at its west end, hung with old flower stalks, Mediterranean fan palms and golden barrel cacti east of it;
  // - D: the agave strip, a narrow two-tier planter from that palm south to the adjacent block's corner and on along
  //   its east wall, a big agave by the corner and a dead agave flower stalk beyond;
  // - E: the adjacent block's glass door with its blue awning and a wall light, behind the last stall of the row;
  // - G: the eucalyptus on the tree island (CURB_ISLANDS_PX[3]).
  const ce = group(site, 'court-east-planting');
  const G0 = -0.23,
    curbPink = '#d2c4bd',
    curbConcrete = '#d6d1c7',
    curbRed = '#a5432f',
    soil = '#9a8770',
    trunkBrown = '#8a7660',
    bootBrown = '#76644f',
    skirtTan = '#a8916d';
  const blueFronds = ['#a7bcbf', '#9bb1b6', '#b7c7c6'];
  const greenFronds = ['#5d8a4f', '#6f9a5c', '#557f49'];
  const grassTans = ['#cbb077', '#bea36a', '#d5bd86'];
  const centroid = (pts: Vec2[]): Vec2 => [
    pts.reduce((t, p) => t + p[0], 0) / pts.length,
    pts.reduce((t, p) => t + p[1], 0) / pts.length,
  ];
  // Inward offset of a convex polygon by t (each edge moved in, neighbours intersected).
  const inset = (pts: Vec2[], t: number): Vec2[] => {
    const [cx, cz] = centroid(pts);
    const n = pts.length;
    const lines = pts.map((a, i) => {
      const b = pts[(i + 1) % n];
      let nx = b[1] - a[1],
        nz = a[0] - b[0];
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      // point the normal inward
      if (nx * (cx - a[0]) + nz * (cz - a[1]) < 0) {
        nx = -nx;
        nz = -nz;
      }
      return {
        p: [a[0] + nx * t, a[1] + nz * t],
        d: [b[0] - a[0], b[1] - a[1]],
      };
    });
    return lines.map((L1, i) => {
      const L0 = lines[(i + n - 1) % n];
      const den = L0.d[0] * L1.d[1] - L0.d[1] * L1.d[0];
      if (Math.abs(den) < 1e-9) return [L1.p[0], L1.p[1]] as Vec2;
      const k =
        ((L1.p[0] - L0.p[0]) * L1.d[1] - (L1.p[1] - L0.p[1]) * L1.d[0]) / den;
      return [L0.p[0] + L0.d[0] * k, L0.p[1] + L0.d[1] * k] as Vec2;
    });
  };
  // A rounded rectangle, corners of radius r (the north end of A is a full half-round).
  const roundRect = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    r: [number, number, number, number],
  ): Vec2[] => {
    const out: Vec2[] = [];
    const corners: [number, number, number, number][] = [
      [x1 - r[1], z0 + r[1], -Math.PI / 2, r[1]],
      [x1 - r[2], z1 - r[2], 0, r[2]],
      [x0 + r[3], z1 - r[3], Math.PI / 2, r[3]],
      [x0 + r[0], z0 + r[0], Math.PI, r[0]],
    ];
    for (const [cx, cz, a0, rr] of corners)
      for (let k = 0; k <= 6; k++) {
        const a = a0 + (k / 6) * (Math.PI / 2);
        out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
      }
    return out;
  };
  // Paint over a curb's outer face along one edge (the red-painted curbs).
  const paintEdge = (a: Vec2, b: Vec2, out: Vec2, h: number, color: string) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      l = Math.hypot(dx, dz);
    let nx = dz / l,
      nz = -dx / l;
    if (nx * (a[0] - out[0]) + nz * (a[1] - out[1]) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const m = mesh(ce, new T.BoxGeometry(l, h, 0.025), color);
    m.position.set(
      (a[0] + b[0]) / 2 + nx * 0.012,
      G0 + h / 2,
      (a[1] + b[1]) / 2 + nz * 0.012,
    );
    m.rotation.y = -Math.atan2(dz, dx);
  };
  const planter = (pts: Vec2[], h: number, curb: string, rim = 0.15) => {
    patch(ce, pts, G0, h, curb);
    patch(ce, inset(pts, rim), G0 + h - 0.06, 0.05, soil);
  };
  // Dried fountain grass: a fountain of thin blades.
  const tuft = (x: number, z: number, r: number, y = G0, i = 0) => {
    for (let k = 0; k < 14; k++) {
      const a = k * 2.39996 + i,
        out = r * (0.35 + (k % 3) * 0.3),
        up = r * (0.95 + (k % 2) * 0.4);
      beam(
        ce,
        [x, y, z],
        [x + Math.cos(a) * out, y + up, z + Math.sin(a) * out],
        0.09,
        0.03,
        grassTans[(k + i) % grassTans.length],
      );
    }
  };
  const barrel = (x: number, z: number, r: number, y: number) => {
    const b = mesh(ce, new T.SphereGeometry(r, 12, 8), '#a3a74c');
    b.position.set(x, y + r * 0.8, z);
    b.scale.set(1, 0.85, 1);
    mesh(ce, new T.SphereGeometry(r * 0.45, 8, 6), '#d6b54a').position.set(
      x,
      y + r * 1.45,
      z,
    );
  };
  // Mexican blue fan palm: a thick booted trunk, a skirt of dead fronds under the crown, silver-blue fans.
  const bluePalm = (
    x: number,
    z: number,
    trunkH: number,
    crown: number,
    skirt: number,
    stalks: number,
    base = G0,
  ) => {
    const g = group(ce, 'blue-fan-palm');
    mesh(
      g,
      new T.CylinderGeometry(0.27, 0.36, trunkH, 12),
      trunkBrown,
    ).position.set(x, base + trunkH / 2, z);
    for (let y = 0.35; y < trunkH - skirt - 0.1; y += 0.3) {
      const ring = mesh(
        g,
        new T.CylinderGeometry(0.36, 0.31, 0.15, 9),
        bootBrown,
      );
      ring.position.set(x, base + y, z);
      ring.rotation.y = y * 2.3;
    }
    if (skirt > 0) {
      const sk = mesh(
        g,
        new T.CylinderGeometry(0.72, 0.4, skirt, 14, 1, true),
        skirtTan,
      );
      sk.position.set(x, base + trunkH - skirt / 2, z);
      (sk.material as T.MeshStandardMaterial).side = T.DoubleSide;
    }
    // The crown: a rounded silver-blue mass (a flattened core) bristling with short fan segments, the upper ones
    // raised, the lower ones hanging.
    const top = base + trunkH;
    const core = mesh(g, new T.IcosahedronGeometry(crown * 0.42, 1), '#9eb2b4');
    core.position.set(x, top + crown * 0.1, z);
    core.scale.set(1, 0.7, 1);
    for (let i = 0; i < 96; i++) {
      const a = i * 2.39996 + x,
        ring = i % 5,
        reach = crown * [0.22, 0.4, 0.52, 0.58, 0.56][ring],
        len = crown * [0.5, 0.62, 0.66, 0.62, 0.55][ring],
        tilt = [0.7, 0.18, -0.35, -0.8, -1.2][ring];
      const seg = mesh(
        g,
        new T.BoxGeometry(len, 0.03, 0.3),
        blueFronds[i % blueFronds.length],
      );
      seg.position.set(
        x + Math.cos(a) * reach,
        top + crown * [0.42, 0.26, 0.08, -0.12, -0.34][ring],
        z + Math.sin(a) * reach,
      );
      seg.rotation.set(0, -a, tilt);
    }
    // Old flower stalks hanging out of the crown in long arcs.
    for (let i = 0; i < stalks; i++) {
      const a = (i / stalks) * Math.PI * 2 + 0.6,
        r1 = crown * 0.62,
        r2 = crown * 0.78;
      const p0 = [
          x + Math.cos(a) * crown * 0.3,
          top + crown * 0.25,
          z + Math.sin(a) * crown * 0.3,
        ],
        p1 = [x + Math.cos(a) * r1, top + crown * 0.3, z + Math.sin(a) * r1],
        p2 = [x + Math.cos(a) * r2, top - crown * 0.75, z + Math.sin(a) * r2];
      beam(g, p0, p1, 0.04, 0.04, '#c9b48a');
      beam(g, p1, p2, 0.09, 0.09, '#bca57a');
    }
  };
  // Mediterranean fan palm: a clump of short leaning trunks, each with a small green crown.
  const fanClump = (
    x: number,
    z: number,
    n: number,
    h: number,
    base: number,
  ) => {
    const g = group(ce, 'mediterranean-fan-palm');
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + x,
        lean = 0.35 + (k % 2) * 0.2,
        hh = h * (0.6 + ((k * 37) % 5) * 0.1);
      const tip = [x + Math.cos(a) * lean, base + hh, z + Math.sin(a) * lean];
      beam(g, [x, base, z], tip, 0.14, 0.14, '#7d6a52');
      for (let i = 0; i < 16; i++) {
        const fa = (i / 16) * Math.PI * 2 + k * 0.7,
          ring = i % 3;
        const f = mesh(
          g,
          new T.BoxGeometry([0.5, 0.65, 0.72][ring], 0.03, 0.22),
          greenFronds[(i + k) % greenFronds.length],
        );
        f.position.set(
          tip[0] + Math.cos(fa) * [0.2, 0.34, 0.42][ring],
          tip[1] + [0.2, 0.08, -0.08][ring],
          tip[2] + Math.sin(fa) * [0.2, 0.34, 0.42][ring],
        );
        f.rotation.set(0, -fa, [0.35, -0.2, -0.65][ring]);
      }
    }
  };
  const agaveAt = (x: number, z: number, r: number, base: number) => {
    const g = group(ce, 'agave');
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996,
        rr = r * (0.6 + (i % 3) * 0.2),
        h = r * (0.5 + (i % 4) * 0.18);
      beam(
        g,
        [x, base, z],
        [x + Math.cos(a) * rr, base + h, z + Math.sin(a) * rr],
        0.2,
        0.06,
        i % 2 ? '#7f9a95' : '#8ca6a0',
      );
    }
  };

  // A: the first blue fan palm's planter, long north-south with a rounded north end, against the divider's west
  // side (B, below), out of the court's drive.
  const [ax0, az0, ax1, az1] = REAR_COURT_PLANTERS[2];
  const A = roundRect(ax0, az0, ax1, az1, [1.1, 1.1, 0.5, 0.5]);
  planter(A, 0.18, curbPink);
  const acx = (ax0 + ax1) / 2;
  bluePalm(acx, -12.6, 2.6, 2.9, 1.0, 0);
  for (const [dx, tz, r] of [
    [-0.65, -14.6, 0.45],
    [0.55, -14.2, 0.4],
    [-0.55, -11.6, 0.45],
    [0.65, -11.4, 0.4],
    [-0.25, -13.5, 0.35],
  ])
    tuft(acx + dx, tz, r, G0 + 0.12, Math.round(tz * -10));

  // B: the raised divider, north-south from the tree island's south tip (its north end runs along the island's
  // south-east edge, so the two read as one planter) toward the court, the pipe rail on its west side facing the
  // first palm; a low bed of grasses south of the palm's planter along it, rounded at the west.
  const [bx0, bz0, bx1, bz1] = REAR_COURT_PLANTERS[4];
  const islandEdge = (x: number) =>
    -18.49 + ((x - 31.34) * (-21.73 + 18.49)) / (36.68 - 31.34);
  const B: Vec2[] = [
    [bx0, islandEdge(bx0)],
    [bx1, islandEdge(bx1)],
    [bx1, bz1],
    [bx0, bz1],
  ];
  planter(B, 0.45, curbConcrete, 0.18);
  for (let tz = bz1 - 0.5; tz > islandEdge(bx0) + 0.3; tz -= 0.7)
    tuft(
      (bx0 + bx1) / 2 + Math.sin(tz * 3) * 0.2,
      tz,
      0.3,
      G0 + 0.4,
      Math.round(-tz * 7),
    );
  fanClump((bx0 + bx1) / 2, -16.4, 3, 1.3, G0 + 0.4);
  const bronzeRail = '#7d6a4f',
    railX = bx0 + 0.12,
    railZ0 = islandEdge(bx0) + 0.15,
    railZ1 = bz1 - 0.12;
  const posts = Math.round((railZ1 - railZ0) / 1.2);
  for (let i = 0; i <= posts; i++) {
    const pz = railZ0 + ((railZ1 - railZ0) * i) / posts;
    beam(
      ce,
      [railX, G0 + 0.45, pz],
      [railX, G0 + 1.4, pz],
      0.05,
      0.05,
      bronzeRail,
    );
  }
  for (const y of [G0 + 1.4, G0 + 0.95])
    beam(ce, [railX, y, railZ0], [railX, y, railZ1], 0.045, 0.045, bronzeRail);
  const A2 = roundRect(...REAR_COURT_PLANTERS[3], [0.55, 0.1, 0.1, 0.55]);
  planter(A2, 0.16, curbPink);
  for (const [tx, tz] of [
    [30.1, -10.3],
    [30.8, -10.5],
    [30.6, -10.0],
  ])
    tuft(tx, tz, 0.3, G0 + 0.12, Math.round(tx * 11));

  // C/F: the fan palm's island gets its red curb faces and its planting.
  const island: Vec2[] = [
    [30.4, -7.0],
    [35.95, -0.61],
    [35.95, 2.11],
    [30.4, -4.25],
  ];
  const ic = centroid(island);
  island.forEach((a, i) =>
    paintEdge(a, island[(i + 1) % island.length], ic, 0.19, curbRed),
  );
  fanClump(33.4, -2.9, 4, 2.1, G0 + 0.18);
  fanClump(34.8, -1.0, 3, 1.6, G0 + 0.18);
  for (const [bx, bz, r] of [
    [32.3, -4.2, 0.28],
    [34.3, -1.9, 0.32],
    [35.3, 0.4, 0.3],
    [35.4, 1.3, 0.26],
    [32.0, -3.4, 0.24],
  ])
    barrel(bx, bz, r, G0 + 0.18);
  for (const [tx, tz] of [
    [31.4, -5.0],
    [32.6, -3.0],
    [34.0, -0.5],
    [35.0, -0.1],
    [33.6, -1.9],
  ])
    tuft(tx, tz, 0.36, G0 + 0.16, Math.round(tz * 9));

  // D: the agave strip, from the second blue palm south to the adjacent block's corner (x 29.15 -> 30.4), then on
  // along its east wall (x 29.81 -> 30.4) to the planter at the row's foot; a raised inner tier down its middle.
  const [sx0, sz0, sx1, sz1] = REAR_COURT_PLANTERS[5];
  const stripN: Vec2[] = [
    [sx0, sz0],
    [sx1, sz0],
    [sx1, sz1],
    [sx0, sz1],
  ];
  const stripS: Vec2[] = [
    [29.81, 3.41],
    [30.4, 3.41],
    [30.4, 21.9],
    [29.81, 21.9],
  ];
  planter(stripN, 0.18, curbConcrete, 0.12);
  planter(stripS, 0.18, curbConcrete, 0.1);
  paintEdge([29.15, -5.4], [30.4, -5.4], [29.8, 0], 0.17, curbRed);
  paintEdge([29.15, -5.4], [29.15, -3.2], [29.8, 0], 0.17, curbRed);
  box(ce, 29.78, G0, -0.4, 0.34, 0.48, 7.0, curbConcrete);
  box(ce, 29.78, G0 + 0.48, -0.4, 0.24, 0.015, 6.9, soil);
  bluePalm(29.85, -4.75, 3.4, 3.0, 1.6, 6, G0 + 0.12);
  agaveAt(30.1, 2.55, 1.05, G0 + 0.14);
  agaveAt(30.15, 12.5, 0.8, G0 + 0.14);
  // the dead flower stalk of an agave that bloomed, standing well above the roof line
  {
    const sx = 30.1,
      sz = 6.8,
      top = 8.4;
    beam(
      ce,
      [sx, G0 + 0.1, sz],
      [sx - 0.25, top, sz + 0.15],
      0.11,
      0.11,
      '#8d7c63',
    );
    for (let k = 0; k < 7; k++) {
      const y = top * (0.55 + k * 0.06),
        f = y / top,
        bx = sx - 0.25 * f,
        bz = sz + 0.15 * f,
        a = k * 2.2;
      const end = [bx + Math.cos(a) * 0.55, y + 0.25, bz + Math.sin(a) * 0.55];
      beam(ce, [bx, y, bz], end, 0.05, 0.05, '#8d7c63');
      mesh(ce, new T.IcosahedronGeometry(0.16, 0), '#9b8a6b').position.set(
        end[0],
        end[1] + 0.08,
        end[2],
      );
    }
  }

  // E: the adjacent block's door behind the row's last stall: aluminium frame, dark glass, a blue awning over it and
  // a wall light up to its west.
  {
    const FZ = 3.41,
      dx0 = 27.9,
      dx1 = 29.0,
      dh = 2.3;
    box(
      ce,
      (dx0 + dx1) / 2,
      G0,
      FZ - 0.02,
      dx1 - dx0 + 0.16,
      dh + 0.08,
      0.05,
      '#b9bcbe',
    );
    box(
      ce,
      (dx0 + dx1) / 2,
      G0 + 0.04,
      FZ - 0.05,
      dx1 - dx0 - 0.04,
      dh - 0.04,
      0.02,
      '#20282c',
    );
    box(ce, dx1 - 0.18, G0 + 0.95, FZ - 0.08, 0.03, 0.3, 0.03, '#c7cacb');
    box(
      ce,
      (dx0 + dx1) / 2,
      G0 + dh + 0.2,
      FZ - 0.35,
      dx1 - dx0 + 0.75,
      0.16,
      0.7,
      '#2f5f9e',
    );
    box(ce, 27.0, G0 + 3.65, FZ - 0.08, 0.28, 0.2, 0.14, '#e6e6e2');
    box(ce, 27.0, G0 + 3.6, FZ - 0.16, 0.2, 0.06, 0.02, '#3b4043');
  }

  for (const [tx, tz] of [
    [29.5, -23.6],
    [31.5, -23.9],
    [33.8, -23.4],
    [35.2, -22.6],
    [33.9, -21.4],
    [30.6, -22.0],
  ])
    tuft(tx, tz, 0.32, G0 + 0.15, Math.round(tx * 5));
  // G: the eucalyptus on the tree island: a pale, peeling trunk forking into limbs, loose grey-green canopy.
  {
    const g = group(ce, 'eucalyptus');
    const tx = 32.2,
      tz = -19.8,
      fork = [tx - 0.4, 6.2, tz + 0.3];
    beam(g, [tx, G0 + 0.05, tz], fork, 0.62, 0.62, '#cfc5b2');
    beam(
      g,
      [tx + 0.1, G0 + 0.4, tz + 0.05],
      [tx - 0.15, 2.6, tz + 0.15],
      0.66,
      0.5,
      '#aa9e8a',
    );
    const limbs = [
      [-3.4, 13.2, -1.6],
      [3.0, 12.4, 2.2],
      [0.8, 14.4, -3.2],
      [-2.4, 11.4, 3.2],
      [3.4, 13.6, -2.0],
    ];
    const canopy = ['#8a9b7c', '#7c8f70', '#97a688', '#83957a'];
    limbs.forEach(([lx, ly, lz], i) => {
      const end = [fork[0] + lx, ly, fork[2] + lz];
      beam(g, fork, end, 0.3, 0.3, '#c8bfac');
      for (let k = 0; k < 3; k++) {
        const lobe = mesh(
          g,
          new T.IcosahedronGeometry(2.5 - k * 0.35, 1),
          canopy[(i + k) % 4],
        );
        lobe.position.set(
          end[0] + Math.cos(i * 1.9 + k * 2.2) * 1.8,
          end[1] - 0.6 + k * 0.5,
          end[2] + Math.sin(i * 1.9 + k * 2.2) * 1.8,
        );
        lobe.scale.set(1.25, 0.75, 1.1);
      }
    });
  }
  for (const g of [facade, roof, site]) batch(g);
  return { facade, roof, site };
}
