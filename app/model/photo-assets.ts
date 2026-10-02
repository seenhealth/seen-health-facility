import * as T from 'three';
import type { Asset } from './schema';

export type VanSeat = [number, number, number];
/**
 * Seat anchors inside the fleet van, in its local frame (x toward the sliding
 * door, y up from the ground, z toward the rear; the nose is at −z). People
 * sit facing the nose (`seatHeading: Math.PI`). Kept next to the geometry so
 * the benches drawn by `buildPhotoAsset` and the riders placed by
 * `fleet-crew.ts` agree.
 */
export const FLEET_VAN_SEATS = {
  floorY: 0.58,
  driver: [-0.55, 0.62, -1.95] as VanSeat,
  /** Three left-hand benches (2+1 layout), two seats each, front to back: outer seat first. */
  benches: [0.77, 1.67, 2.57].flatMap((z): VanSeat[] => [
    [-0.72, 0.62, z],
    [-0.28, 0.62, z],
  ]),
  /** Wheelchair bay on the door side, behind the sliding-door opening. */
  wheelchair: [0.7, 0.62, 1.45] as VanSeat,
  /** Fold-down attendant seat behind the wheelchair bay. */
  attendant: [0.72, 0.62, 2.37] as VanSeat,
  /** Sill of the sliding-door opening, where the ramp hinges (`pivot` in arrival.ts). */
  door: [1.035, 0.58, -0.19] as VanSeat,
};
/**
 * Folding wheelchair ramp, hinged at the sliding-door sill: deployed, it runs
 * `run` m out along local +x and drops `rise` m to the ground. `sill` and
 * `foot` are the van-local (x, z) ends that riders and escorts walk between.
 */
export const FLEET_VAN_RAMP = (() => {
  const [x, rise, z] = FLEET_VAN_SEATS.door,
    run = 2.9;
  return {
    hinge: FLEET_VAN_SEATS.door,
    run,
    rise,
    length: Math.hypot(run, rise),
    width: 1.02,
    sill: [x, z] as [number, number],
    foot: [x + run, z] as [number, number],
  };
})();
/** Driver's door on the −x side: hinged at its front edge, it swings out by up to `openAngle` rad. */
export const FLEET_VAN_CAB_DOOR = { hinge: -2.38, rear: -1.23, openAngle: 1.2 };
/** Sliding-door opening in the +x panel: local z of its front and rear edges. */
export const FLEET_VAN_SIDE_DOOR = { front: -0.8, rear: 0.42 };

/** Photo-informed, dimensioned components. Placement and palettes belong to the facility specification. */
export function buildPhotoAsset(
  spec: Asset,
  material: (id: string) => T.MeshStandardMaterial,
): T.Group | null {
  const supported = [
    'upholstered-chair',
    'mesh-chair',
    'lounge-chair',
    'nurse-station',
    'quartz-counter',
    'meeting-table',
    'locker-bank',
    'casework',
    'library-bay',
    'landscape-screen',
    'sliding-door',
    'hinged-door',
    'tree-seat',
    'ceiling-grid',
    'linear-light',
    'round-duct',
    'vanity',
    'sign',
    'moss-screen',
    'timber-truss',
    'admin-workstation',
    'admin-monitor',
    'slat-wall',
    'wire-rack',
    'lift-gate',
    'fleet-van',
  ];
  if (!supported.includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions;
  const palette = (slot: string, fallback: string) =>
    spec.materials?.[slot] || fallback;
  const p = spec.parameters || {};
  const add = (geo: T.BufferGeometry, mat: string, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(geo, material(mat));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    mat: string,
  ) => add(new T.BoxGeometry(a, b, c), mat, x, y + b / 2, z);
  const cylinder = (
    x: number,
    y: number,
    z: number,
    r: number,
    height: number,
    mat: string,
    top = r,
  ) =>
    add(new T.CylinderGeometry(top, r, height, 24), mat, x, y + height / 2, z);
  const rod = (a: T.Vector3, b: T.Vector3, r: number, mat: string) => {
    const mid = a.clone().add(b).multiplyScalar(0.5),
      delta = b.clone().sub(a);
    const o = add(
      new T.CylinderGeometry(r, r, delta.length(), 8),
      mat,
      ...(mid.toArray() as [number, number, number]),
    );
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return o;
  };
  const horizontal = (
    shape: T.Shape,
    y: number,
    height: number,
    mat: string,
  ) => {
    const geo = new T.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 12,
    });
    geo.rotateX(-Math.PI / 2);
    return add(geo, mat, 0, y, 0);
  };
  const rounded = (a: number, b: number, r: number) => {
    const s = new T.Shape(),
      x = -a / 2,
      y = -b / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + a - r, y);
    s.quadraticCurveTo(x + a, y, x + a, y + r);
    s.lineTo(x + a, y + b - r);
    s.quadraticCurveTo(x + a, y + b, x + a - r, y + b);
    s.lineTo(x + r, y + b);
    s.quadraticCurveTo(x, y + b, x, y + b - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    s.closePath();
    return s;
  };
  const top = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    r: number,
    mat: string,
  ) => {
    const o = horizontal(rounded(a, c, r), y, b, mat);
    o.position.x = x;
    o.position.z = z;
    return o;
  };
  const wood = palette('wood', 'oak'),
    metal = palette('metal', 'metal'),
    white = palette('white', 'porcelain');
  if (spec.kind === 'admin-monitor') {
    top(0, 0, 0, w * 0.4, 0.025, d, 0.02, white);
    box(0, 0.02, d * 0.2, 0.05, h * 0.38, 0.05, white);
    top(0, h * 0.28, 0, w, h * 0.7, 0.04, 0.025, white);
    box(0, h * 0.3, -0.024, w * 0.96, h * 0.64, 0.012, spec.material);
  } else if (spec.kind === 'admin-workstation') {
    const sh = 0.74;
    top(0, sh - 0.035, 0, w, 0.035, d, 0.035, spec.material);
    for (const x of [-w * 0.43, w * 0.43]) {
      box(x, 0.035, 0, 0.06, sh - 0.07, 0.065, white);
      box(x, 0, 0, 0.065, 0.035, d * 0.82, white);
    }
    if (p.divider !== false) {
      top(
        0,
        sh,
        d * 0.46,
        w,
        h - sh,
        0.035,
        0.015,
        palette('divider', 'concrete'),
      );
      box(
        -w * 0.48,
        sh,
        d * 0.12,
        0.035,
        h - sh,
        d * 0.7,
        palette('divider', 'concrete'),
      );
    }
    box(w * 0.32, 0.08, d * 0.13, w * 0.23, 0.49, d * 0.66, white);
    box(w * 0.32, 0.47, -d * 0.205, w * 0.21, 0.1, 0.015, spec.material);
    box(0, sh, -d * 0.19, 0.4, 0.018, 0.15, 'screen');
  } else if (spec.kind === 'slat-wall') {
    box(0, 0, -d * 0.2, w, h, d * 0.35, palette('back', 'photo-black'));
    const count = Math.ceil(w / 0.075);
    for (let i = 0; i < count; i++)
      box(
        -w / 2 + ((i + 0.5) * w) / count,
        0,
        0,
        (w / count) * 0.62,
        h,
        d,
        spec.material,
      );
  } else if (spec.kind === 'wire-rack') {
    for (const x of [-w * 0.48, w * 0.48])
      for (const z of [-d * 0.45, d * 0.45]) cylinder(x, 0, z, 0.015, h, metal);
    for (let n = 0; n < 4; n++) {
      const y = 0.15 + (n * (h - 0.23)) / 3;
      for (const z of [-d * 0.45, d * 0.45])
        box(0, y, z, w, 0.025, 0.025, metal);
      for (let x = -w * 0.46; x < w * 0.48; x += 0.12)
        box(x, y, 0, 0.012, 0.02, d, metal);
      if (n < 3)
        for (const x of [-w * 0.3, w * 0.25])
          box(x, y + 0.03, 0, w * 0.3, h * 0.15, d * 0.8, spec.material);
    }
  } else if (spec.kind === 'lift-gate') {
    box(0, 0, 0, w, 0.035, d, metal);
    for (const x of [-w / 2, w / 2])
      for (const z of [-d / 2, d / 2]) box(x, 0, z, 0.045, h, 0.045, white);
    for (const x of [-w / 2, w / 2]) {
      box(x, h - 0.05, 0, 0.045, 0.045, d, white);
      box(x, 0.09, 0, 0.03, h * 0.55, d, white);
    }
    for (const z of [-d / 2, d / 2]) {
      box(0, 0.08, z, w, h * 0.36, 0.035, white);
      box(0, h * 0.72, z, w, 0.065, 0.045, white);
      box(0, h - 0.04, z, w, 0.04, 0.04, white);
    }
  } else if (spec.kind === 'fleet-van') {
    // RAM ProMaster high-roof proportions on the 2.25 × 2.8 × 6.35 m envelope:
    // nose at −z, sliding door on +x, floor at y 0.58. The final two-column
    // wrap sheet remains the texture authority for the four decals.
    const black = palette('trim', 'photo-black'),
      glass = palette('glass', 'screen'),
      lamp = palette('lamp', 'photo-white'),
      rearLamp = palette('rearLamp', 'photo-red-cart'),
      body = spec.material,
      dark = '#2b2f31',
      seat = '#3d4346',
      operable = p.operable === true;
    // Side walls are `skin` thick on the planes x = ±sideX, so their outer
    // faces lie on the envelope (±half); roof, cab, hood, nose and rear span
    // the same width. Only trim (mirrors, handles, lamps, cladding, wheels)
    // and the sliding door leaves stand proud of it.
    const half = w / 2,
      nose = -d / 2,
      rear = d / 2,
      sideX = half - 0.03,
      skin = 2 * (half - sideX),
      belt = 1.55,
      windowTop = 2.1,
      roofY = 2.45;
    /** Centre line of the raked windshield and A-pillars: its z at height y. */
    const pillarZ = (y: number) => -2.235 + (y - 1.675) * Math.tan(0.52),
      glassFront = pillarZ(windowTop);
    // See-through glazing so seated people read from outside. The palette's
    // glass finish is opaque, so the builder clones it into a transparent
    // material (opacity 0.34, roughness 0.12) instead of adding a schema entry.
    const glazing = material(glass).clone();
    glazing.transparent = true;
    glazing.opacity = 0.34;
    glazing.roughness = 0.12;
    glazing.metalness = 0.15;
    glazing.depthWrite = false;
    glazing.side = T.DoubleSide;
    const pane = (
      x: number,
      y: number,
      z: number,
      a: number,
      b: number,
      c: number,
    ) => {
      const m = new T.Mesh(new T.BoxGeometry(a, b, c), glazing);
      m.position.set(x, y + b / 2, z);
      m.renderOrder = 2;
      g.add(m);
      return m;
    };
    /** Box with its centre at (x, y, z), pitched about x by `rx` (positive tips the top toward +z). */
    const pitched = (
      x: number,
      y: number,
      z: number,
      a: number,
      b: number,
      c: number,
      rx: number,
      mat: string | T.Material,
    ) => {
      const m = new T.Mesh(
        new T.BoxGeometry(a, b, c),
        typeof mat === 'string' ? material(mat) : mat,
      );
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = m.receiveShadow = typeof mat === 'string';
      if (typeof mat !== 'string') m.renderOrder = 2;
      g.add(m);
      return m;
    };
    /** Side-wall piece on the plane x = `x`, `skin` thick, outlined by (z, y) points. */
    const profile = (x: number, points: [number, number][], mat: string) => {
      const geo = new T.ExtrudeGeometry(
        new T.Shape(points.map(([z, y]) => new T.Vector2(z, y))),
        { depth: skin, bevelEnabled: false },
      );
      // Outline x becomes van z and the extrusion runs along −x; centre it on x.
      geo.rotateY(-Math.PI / 2);
      geo.translate(skin / 2, 0, 0);
      return add(geo, mat, x);
    };
    // Underbody, interior floor and the black lower cladding band.
    box(0, 0.46, 0.35, w * 0.88, 0.1, d * 0.9, black);
    box(0, 0.52, 0.5, 1.98, 0.06, 5.1, dark);
    for (const side of [-1, 1])
      box(side * sideX, 0.4, 0.3, 0.07, 0.36, 5.7, black);
    // Teal body below the beltline; the +x panel leaves the door opening free
    // and the −x panel starts behind the driver's door.
    const cab = FLEET_VAN_CAB_DOOR;
    box(
      -sideX,
      0.74,
      (cab.rear + 3.1) / 2,
      skin,
      belt - 0.74,
      3.1 - cab.rear,
      body,
    );
    const opening = FLEET_VAN_SIDE_DOOR;
    box(
      sideX,
      0.74,
      (opening.front - 2.4) / 2,
      skin,
      belt - 0.74,
      opening.front + 2.4,
      body,
    );
    box(
      sideX,
      0.74,
      (opening.rear + 3.1) / 2,
      skin,
      belt - 0.74,
      3.1 - opening.rear,
      body,
    );
    // Window band: roof rail, pillars and see-through glazing on both sides.
    // The rail starts under the sloped cab roof, not ahead of the windshield.
    for (const side of [-1, 1]) {
      profile(
        side * sideX,
        [
          [-1.97, windowTop],
          [3.1, windowTop],
          [3.1, roofY],
          [-1.6, roofY],
        ],
        body,
      );
      box(side * sideX, belt, -1.15, skin, windowTop - belt, 0.14, body);
      box(side * sideX, belt, 0.55, skin, windowTop - belt, 0.26, body);
      box(side * sideX, belt, 3.0, skin, windowTop - belt, 0.2, body);
      pane(side * sideX, belt, 1.79, 0.03, windowTop - belt, 2.22);
    }
    // Cab side windows start behind the A-pillar; a body-colour sail fills the
    // corner between pillar and glass (on −x it rides on the driver's door).
    const sail: [number, number][] = [
      [pillarZ(belt), belt],
      [glassFront, belt],
      [glassFront, windowTop],
    ];
    profile(sideX, sail, body);
    pane(
      sideX,
      belt,
      (glassFront - 1.22) / 2,
      0.03,
      windowTop - belt,
      -1.22 - glassFront,
    );
    // Driver's door: lower panel, cab window and handle on one front-hinged
    // leaf (`driver-door`; fleet vans swing it open as the driver gets out).
    const leafLength = cab.rear - cab.hinge,
      leafMid = (cab.hinge + cab.rear) / 2,
      glassRear = cab.rear - 0.06;
    const leafParts: T.Object3D[] = [
      box(-sideX, 0.74, leafMid, skin, belt - 0.74, leafLength, body),
      profile(-sideX, sail, body),
      pane(
        -sideX,
        belt,
        (glassFront + glassRear) / 2,
        0.03,
        windowTop - belt,
        glassRear - glassFront,
      ),
      box(
        -sideX,
        windowTop - 0.035,
        (glassFront + cab.rear) / 2,
        0.05,
        0.035,
        cab.rear - glassFront,
        black,
      ),
      box(-sideX - 0.05, 1.2, cab.rear - 0.2, 0.02, 0.03, 0.14, black),
    ];
    if (operable) {
      const leaf = new T.Group();
      leaf.name = 'driver-door';
      leaf.position.set(-sideX, 0, cab.hinge);
      g.add(leaf);
      for (const part of leafParts) leaf.attach(part);
    }
    pane(-sideX, belt, -0.33, 0.03, windowTop - belt, 1.5);
    // Tall roof cap with rounded long edges, full width from the cab roof to
    // the rear doors, then the header and the short sloped cab roof.
    const roof = new T.Shape(),
      edge = 0.14;
    roof.moveTo(-half, roofY);
    roof.lineTo(half, roofY);
    roof.lineTo(half, h - edge);
    roof.quadraticCurveTo(half, h, half - edge, h);
    roof.lineTo(edge - half, h);
    roof.quadraticCurveTo(-half, h, -half, h - edge);
    roof.closePath();
    add(
      new T.ExtrudeGeometry(roof, {
        depth: rear - 0.005 + 1.6,
        bevelEnabled: false,
        curveSegments: 12,
      }),
      body,
      0,
      0,
      -1.6,
    );
    box(0, 2.02, -2.02, w, 0.12, 0.14, body);
    pitched(0, 2.29, -1.81, w, 0.1, 0.55, -0.67, body);
    // Raked windshield between A-pillars on the body sides, cowl, sloped hood
    // and front fenders whose top edge runs on under the hood.
    pitched(0, 1.675, -2.235, w - 0.19, 0.865, 0.04, 0.52, glazing);
    for (const side of [-1, 1])
      pitched(side * (half - 0.05), 1.675, -2.235, 0.1, 0.9, 0.12, 0.52, body);
    box(0, 1.22, -2.5, w - 0.19, 0.08, 0.2, black);
    pitched(0, 1.17, -2.79, w, 0.06, 0.62, -0.362, body);
    for (const side of [-1, 1])
      profile(
        side * sideX,
        [
          [nose + 0.01, 0.74],
          [-2.4, 0.74],
          [-2.4, 1.28],
          [nose + 0.01, 1.0],
        ],
        body,
      );
    // Nose: teal face with headlamps over a black bumper and grille.
    box(0, 0.74, nose + 0.06, w, 0.34, 0.1, body);
    box(0, 0.3, nose + 0.05, w, 0.44, 0.13, black);
    box(0, 0.42, nose - 0.01, 1.2, 0.26, 0.04, black);
    for (let i = 0; i < 4; i++)
      box(0, 0.44 + i * 0.065, nose - 0.02, 1.1, 0.012, 0.012, metal);
    for (const y of [0.4, 0.68])
      box(0, y, nose - 0.015, 1.26, 0.025, 0.02, metal);
    for (const side of [-1, 1]) {
      box(side * (half - 0.25), 0.8, nose + 0.02, 0.44, 0.22, 0.06, lamp);
      box(side * (half - 0.02), 0.8, nose + 0.04, 0.06, 0.22, 0.08, '#e0a24a');
      box(side * (half + 0.1), 1.5, -2.3, 0.1, 0.24, 0.16, black);
      box(side * (half + 0.02), 1.58, -2.3, 0.1, 0.04, 0.05, black);
    }
    // Rear: twin doors with high windows, tall tail lamps and a black bumper.
    box(0, 0.76, rear - 0.045, w, roofY - 0.76, 0.08, body);
    for (const side of [-1, 1]) {
      pane(side * 0.5, 1.8, rear + 0.01, 0.74, 0.4, 0.02);
      box(
        side * (half - 0.075),
        0.78,
        rear - 0.005,
        0.15,
        0.95,
        0.05,
        rearLamp,
      );
    }
    box(0, 0.76, rear + 0.005, 0.025, roofY - 0.76, 0.02, black);
    box(0.12, 1.15, rear + 0.015, 0.03, 0.22, 0.02, black);
    box(0, 2.36, rear + 0.005, 0.3, 0.05, 0.02, rearLamp);
    box(0, 0.3, rear - 0.035, w, 0.42, 0.14, black);
    // Wheels: tyres proud of the cladding, hubs and black arch flares.
    for (const side of [-1, 1])
      for (const z of [-2.2, 1.75]) {
        const tire = cylinder(side * 1.035, 0, z, 0.36, 0.25, black);
        tire.rotation.z = Math.PI / 2;
        tire.position.y = 0.36;
        const rim = cylinder(side * 1.165, 0, z, 0.2, 0.03, metal);
        rim.rotation.z = Math.PI / 2;
        rim.position.y = 0.36;
        const flare = add(
          new T.CylinderGeometry(0.5, 0.5, 0.06, 20, 1, true, 0, Math.PI),
          black,
          side * 1.15,
          0.36,
          z,
        );
        flare.rotation.z = Math.PI / 2;
      }
    // Passenger side: two sliding leaves that part along z (`passenger-door-0/1`
    // slide ±0.6 when open; the ramp hinges at the sill, local (1.035, 0.58, −0.19)).
    // Closed, they sit 1 cm proud of the side, enough to pass over it when open.
    for (const [i, zc] of [-0.495, 0.114].entries()) {
      const leaf: T.Object3D[] = [
        box(sideX + 0.01, 0.76, zc, 0.06, belt - 0.76, 0.6, body),
        pane(sideX + 0.02, belt, zc, 0.02, windowTop - belt, 0.56),
        box(sideX + 0.02, belt, zc, 0.05, 0.035, 0.6, black),
        box(sideX + 0.02, windowTop - 0.035, zc, 0.05, 0.035, 0.6, black),
        box(sideX + 0.02, belt, zc - 0.29, 0.05, windowTop - belt, 0.03, black),
        box(sideX + 0.02, belt, zc + 0.29, 0.05, windowTop - belt, 0.03, black),
        box(
          sideX + 0.06,
          1.2,
          zc + (i ? -0.22 : 0.22),
          0.02,
          0.03,
          0.14,
          black,
        ),
      ];
      if (!operable) continue;
      const door = new T.Group();
      door.name = `passenger-door-${i}`;
      g.add(door);
      for (const part of leaf) door.attach(part);
    }
    // Interior: cab seats, dashboard, three left-hand benches, the wheelchair
    // bay and an attendant seat on the door side (anchors in FLEET_VAN_SEATS).
    for (const x of [-0.55, 0.55]) {
      box(x, 0.97, -2.05, 0.5, 0.12, 0.5, seat);
      box(x, 1.09, -1.77, 0.5, 0.58, 0.1, seat);
      box(x, 1.67, -1.77, 0.26, 0.16, 0.08, seat);
    }
    box(0, 0.95, -2.55, 1.96, 0.28, 0.32, dark);
    const wheel = add(
      new T.TorusGeometry(0.18, 0.022, 8, 24),
      black,
      -0.55,
      1.2,
      -2.32,
    );
    wheel.rotation.x = -Math.PI / 2 + 0.55;
    for (const zRow of [0.65, 1.55, 2.45]) {
      box(-0.5, 0.97, zRow, 0.9, 0.12, 0.48, seat);
      box(-0.5, 1.09, zRow + 0.27, 0.9, 0.5, 0.09, seat);
    }
    box(0.72, 0.97, 2.25, 0.5, 0.12, 0.48, seat);
    box(0.72, 1.09, 2.52, 0.5, 0.5, 0.09, seat);
    box(0.7, 0.58, 1.45, 0.6, 0.012, 1.2, '#4a5153');
    rod(
      new T.Vector3(0.95, 0.9, -0.88),
      new T.Vector3(0.95, 1.95, -0.88),
      0.015,
      metal,
    );
    // Wrap decals: same sheet rectangles as before (variant B offsets the sheet
    // column), sized to the lower body so the window band stays clear.
    const decal = (
      x: number,
      y: number,
      z: number,
      a: number,
      b: number,
      ry: number,
      rect: number[],
    ) => {
      const geo = new T.PlaneGeometry(a, b),
        uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          rect[0] + uv.getX(i) * (rect[2] - rect[0]),
          1 - rect[3] + uv.getY(i) * (rect[3] - rect[1]),
        );
      const o = add(geo, palette('wrap', spec.material), x, y, z);
      o.rotation.y = ry;
    };
    const variant = p.variant === 'B' ? 0.5 : 0;
    decal(-(half + 0.02), 1.155, 0.9, 2.21, 0.774, -Math.PI / 2, [
      0.167 + variant,
      0.326,
      0.452 + variant,
      0.419,
    ]);
    decal(half + 0.02, 1.155, 2.0, 1.1, 0.77, Math.PI / 2, [
      0.026 + variant,
      0.597,
      0.202 + variant,
      0.691,
    ]);
    decal(
      0,
      0.91,
      nose - 0.005,
      1.04,
      0.265,
      Math.PI,
      [0.407, 0.14, 0.592, 0.169],
    );
    decal(0, 1.27, rear + 0.025, 1.13, 1.03, 0, [
      0.14 + variant,
      0.812,
      0.35 + variant,
      0.951,
    ]);
  } else if (
    spec.kind === 'upholstered-chair' ||
    spec.kind === 'lounge-chair'
  ) {
    const lounge = spec.kind === 'lounge-chair',
      sh = h * Number(p.seatHeightRatio ?? (lounge ? 0.35 : 0.48));
    top(0, sh, 0, w * 0.9, h * 0.1, d * 0.88, 0.05, spec.material);
    const back = box(
      0,
      sh + h * 0.09,
      d * 0.33,
      w * 0.84,
      h - sh - h * 0.09,
      d * 0.12,
      spec.material,
    );
    back.rotation.x = lounge ? -0.14 : -0.06;
    for (const x of [-w * 0.46, w * 0.46]) {
      if (p.arms !== false) {
        box(x, sh * 0.55, 0, 0.03, sh * 0.62, d * 0.9, wood);
        box(x, sh + h * 0.23, 0, 0.035, 0.04, d * 0.9, wood);
      }
      for (const z of [-d * 0.36, d * 0.36])
        rod(
          new T.Vector3(x, 0, z),
          new T.Vector3(x * 0.93, sh, z * 0.82),
          0.015,
          metal,
        );
    }
    if (lounge) {
      top(
        0,
        h * 0.84,
        d * 0.22,
        w * 0.58,
        h * 0.1,
        d * 0.22,
        0.04,
        spec.material,
      );
    } else {
      for (const x of [-w * 0.44, w * 0.44])
        box(x, sh + h * 0.07, d * 0.39, 0.025, h - sh - h * 0.06, 0.035, wood);
    }
  } else if (spec.kind === 'mesh-chair') {
    const frame = palette('frame', white);
    top(0, h * 0.42, 0, w * 0.81, h * 0.1, d * 0.73, 0.05, spec.material);
    const back = box(0, h * 0.52, d * 0.31, w * 0.79, h * 0.46, 0.055, frame);
    back.rotation.x = -0.1;
    const fabric = box(
      0,
      h * 0.56,
      d * 0.26,
      w * 0.69,
      h * 0.36,
      0.04,
      spec.material,
    );
    fabric.rotation.x = -0.1;
    for (let i = 0; i < 14; i++)
      box(
        -w * 0.33 + (i * w * 0.66) / 13,
        h * 0.56,
        d * 0.23,
        0.004,
        h * 0.35,
        0.008,
        frame,
      );
    for (const x of [-w * 0.44, w * 0.44]) {
      box(x, h * 0.4, 0, 0.035, h * 0.23, 0.035, frame);
      top(x, h * 0.62, -d * 0.04, 0.045, 0.032, d * 0.5, 0.01, frame);
    }
    cylinder(0, 0.12, 0, 0.026, h * 0.3, metal);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5,
        x = Math.sin(a) * w * 0.43,
        z = Math.cos(a) * d * 0.43;
      rod(new T.Vector3(0, 0.15, 0), new T.Vector3(x, 0.08, z), 0.024, frame);
      cylinder(x, 0, z, 0.04, 0.065, metal);
    }
  } else if (spec.kind === 'nurse-station') {
    // U shaped counter, open at +Z, with softened outer corners and an accessible low return.
    const thick = Math.min(w * 0.17, 0.55),
      r = 0.23;
    const u = (inset = 0) => {
      const s = new T.Shape(),
        l = -w / 2 + inset,
        rr = w / 2 - inset,
        f = d / 2 - inset,
        b = -d / 2 + inset;
      s.moveTo(l, b);
      s.lineTo(l, f - r);
      s.quadraticCurveTo(l, f, l + r, f);
      s.lineTo(rr - r, f);
      s.quadraticCurveTo(rr, f, rr, f - r);
      s.lineTo(rr, b);
      s.lineTo(rr - thick, b);
      s.lineTo(rr - thick, f - thick);
      s.lineTo(l + thick, f - thick);
      s.lineTo(l + thick, b);
      s.closePath();
      return s;
    };
    horizontal(u(0.025), 0.06, h - 0.26, wood);
    horizontal(u(), h - 0.2, 0.2, spec.material);
    horizontal(u(0.014), h - 0.235, 0.025, palette('light', 'light'));
    box(0, 0.04, -d * 0.05, w - thick * 2, 0.68, 0.6, wood);
    box(0, 0.72, -d * 0.05, w - thick * 2, 0.04, 0.64, wood);
    top(
      -w * 0.28,
      0.72,
      d * 0.38,
      w * 0.3,
      0.055,
      d * 0.23,
      0.06,
      spec.material,
    );
  } else if (spec.kind === 'quartz-counter') {
    top(
      0,
      0.06,
      0,
      w - 0.06,
      h - 0.27,
      d - 0.05,
      Math.min(d * 0.26, 0.2),
      wood,
    );
    top(0, h - 0.2, 0, w, 0.2, d, Math.min(d * 0.28, 0.21), spec.material);
    box(
      0,
      h - 0.23,
      d / 2 - 0.015,
      w - 0.08,
      0.025,
      0.02,
      palette('light', 'light'),
    );
  } else if (spec.kind === 'meeting-table') {
    top(0, h - 0.055, 0, w, 0.055, d, 0.035, wood);
    top(0, 0, 0, w * 0.09, h - 0.055, d * 0.65, 0.028, spec.material);
    cylinder(0, h - 0.004, 0, 0.03, 0.005, metal);
  } else if (spec.kind === 'locker-bank') {
    const n = Math.max(1, Number(p.columns || 12)),
      tiers = Math.max(1, Number(p.tiers || 2)),
      bw = w / n;
    box(0, 0, 0, w, 0.1, d, metal);
    box(0, 0.1, -d * 0.05, w, h - 0.1, d * 0.86, wood);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < tiers; j++) {
        const x = -w / 2 + (i + 0.5) * bw,
          y = 0.11 + (j * (h - 0.11)) / tiers,
          dh = (h - 0.11) / tiers;
        box(x, y, d * 0.47, bw - 0.009, dh - 0.008, d * 0.06, spec.material);
        box(
          x + bw * 0.23,
          y + dh * 0.62,
          d * 0.525,
          0.022,
          dh * 0.16,
          0.025,
          white,
        );
        for (const yy of [y + dh * 0.62, y + dh * 0.78])
          box(x + bw * 0.17, yy, d * 0.535, bw * 0.18, 0.02, 0.045, white);
        box(
          x - bw * 0.19,
          y + dh * 0.59,
          d * 0.54,
          bw * 0.24,
          0.05,
          0.04,
          metal,
        );
      }
  } else if (spec.kind === 'casework') {
    const n = Math.max(2, Number(p.bays || 4)),
      bw = w / n,
      base = Math.min(0.85, h * 0.37);
    box(0, 0.06, 0, w, base - 0.06, d, spec.material);
    box(0, base, 0, w + 0.02, 0.045, d + 0.03, palette('top', 'table'));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * bw;
      box(x, 0.09, d * 0.505, bw - 0.008, base - 0.1, 0.022, spec.material);
      box(x + bw * 0.3, base * 0.6, d * 0.54, 0.013, 0.14, 0.025, metal);
      if (h > 1.3) {
        box(
          x,
          h * 0.64,
          -d * 0.14,
          bw - 0.008,
          h * 0.36,
          d * 0.72,
          spec.material,
        );
        box(x + bw * 0.3, h * 0.68, d * 0.24, 0.013, 0.14, 0.025, metal);
      }
    }
    if (p.sink !== false) {
      box(w * 0.25, base + 0.046, -d * 0.05, w * 0.2, 0.016, d * 0.48, metal);
      box(w * 0.25, base + 0.06, -d * 0.33, 0.026, 0.22, 0.026, metal);
      box(w * 0.25, base + 0.25, -d * 0.22, 0.028, 0.025, d * 0.25, metal);
    }
    if (h > 1.3)
      box(
        0,
        base + 0.06,
        -d * 0.49,
        w,
        h * 0.62 - base - 0.06,
        0.025,
        palette('splash', 'wall'),
      );
  } else if (spec.kind === 'library-bay') {
    box(0, 0, -d * 0.46, w, h, d * 0.08, wood);
    for (const x of [-w * 0.48, w * 0.48]) box(x, 0, 0, w * 0.04, h, d, wood);
    box(0, 0, 0, w, h * 0.24, d, wood);
    for (const x of [-w * 0.24, w * 0.24]) {
      box(x, 0.04, d * 0.5, w * 0.47, h * 0.22, 0.02, wood);
      box(
        x + (x < 0 ? 0.1 : -0.1),
        h * 0.16,
        d * 0.525,
        0.013,
        0.12,
        0.025,
        metal,
      );
    }
    if (p.variant === 'lattice') {
      box(0, h * 0.24, d * 0.4, w * 0.9, h * 0.76, 0.02, spec.material);
      for (let j = 0; j < 3; j++) {
        const y = h * 0.28 + j * h * 0.235;
        for (const f of [0.3, 0.43]) {
          const ww = w * f,
            hh = h * 0.19;
          for (const x of [-ww, ww])
            box(x, y, d * 0.44, 0.027, hh, 0.027, wood);
          for (const yy of [y, y + hh])
            box(0, yy, d * 0.44, ww * 2, 0.027, 0.027, wood);
        }
      }
    } else if (p.variant === 'tv') {
      box(
        0,
        h * 0.4,
        d * 0.06,
        w * 0.82,
        h * 0.34,
        0.05,
        palette('screen', 'screen'),
      );
      box(0, h * 0.79, 0, w, 0.03, d, wood);
    } else {
      for (let j = 1; j <= 4; j++)
        box(0, h * 0.24 + j * h * 0.18, 0, w, 0.035, d, wood);
      for (let j = 0; j < 3; j++)
        for (let i = 0; i < 5; i++)
          box(
            -w * 0.35 + i * w * 0.14,
            h * 0.27 + j * h * 0.18,
            0,
            w * 0.085,
            h * (0.09 + (i % 2) * 0.025),
            d * 0.45,
            i % 2 ? spec.material : wood,
          );
    }
  } else if (spec.kind === 'landscape-screen') {
    box(0, 0, -d * 0.42, w, h, d * 0.15, palette('background', 'wall'));
    const bands = [
      palette('upper', 'porcelain'),
      palette('middle', 'oak'),
      spec.material,
    ];
    for (let j = 0; j < 3; j++) {
      const s = new T.Shape();
      s.moveTo(-w / 2, 0);
      for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const yy =
          h *
          (0.18 +
            (2 - j) * 0.22 +
            0.1 * Math.sin(t * 15 + j * 0.65) +
            0.045 * Math.sin(t * 41));
        s.lineTo(-w / 2 + t * w, yy);
      }
      s.lineTo(w / 2, 0);
      s.closePath();
      const geo = new T.ExtrudeGeometry(s, {
        depth: d * 0.12,
        bevelEnabled: false,
      });
      add(geo, bands[j], 0, 0, -d * 0.24 + j * d * 0.12);
    }
    const count = Math.round(w / 0.095);
    for (let i = 0; i <= count; i++)
      box(-w / 2 + (i * w) / count, 0, d * 0.36, 0.019, h, 0.045, wood);
    for (const y of [0.015, h - 0.04])
      box(0, y, d * 0.15, w, 0.025, 0.025, palette('light', 'light'));
  } else if (spec.kind === 'hinged-door') {
    box(0, 0, 0, w, h, d * 0.55, spec.material);
    box(
      w * 0.22,
      h * 0.4,
      d * 0.29,
      w * 0.12,
      h * 0.37,
      0.01,
      palette('glass', 'glass'),
    );
    box(0, h * 0.41, d * 0.47, w * 0.86, 0.035, 0.03, metal);
    box(0, 0.02, d * 0.29, w, 0.2, 0.012, metal);
  } else if (spec.kind === 'sliding-door') {
    box(0, 0, 0, w, h - 0.055, d * 0.28, spec.material);
    box(0, h - 0.07, 0, w, 0.07, d, metal);
    box(-w * 0.35, h * 0.28, d * 0.23, 0.023, h * 0.3, 0.045, metal);
    if (p.glazed === true)
      box(
        0,
        h * 0.12,
        d * 0.16,
        w * 0.78,
        h * 0.69,
        0.02,
        palette('glass', 'glass'),
      );
  } else if (spec.kind === 'tree-seat') {
    const seatR = w * 0.5,
      inner = w * 0.29,
      planterR = w * 0.28;
    const ring = (
      outer: number,
      inside: number,
      y: number,
      height: number,
      mat: string,
    ) => {
      const s = new T.Shape();
      s.absarc(0, 0, outer, 0, Math.PI * 2, false);
      const hole = new T.Path();
      hole.absarc(0, 0, inside, 0, Math.PI * 2, true);
      s.holes.push(hole);
      horizontal(s, y, height, mat);
    };
    ring(seatR, inner, 0.08, 0.38, spec.material);
    ring(w * 0.36, inner, 0.44, 0.48, spec.material);
    ring(seatR, inner, 0.025, 0.055, palette('trim', metal));
    for (let i = 0; i < 48; i++) {
      const a = (i * Math.PI * 2) / 48;
      rod(
        new T.Vector3(Math.sin(a) * w * 0.355, 0.5, Math.cos(a) * w * 0.355),
        new T.Vector3(Math.sin(a) * w * 0.355, 0.87, Math.cos(a) * w * 0.355),
        0.012,
        spec.material,
      );
    }
    cylinder(0, 0.2, 0, planterR, 0.65, palette('soil', 'leaf'));
    for (let i = 0; i < 6; i++) {
      const a = i * 2.399;
      rod(
        new T.Vector3(Math.sin(a) * w * 0.055, 0.8, Math.cos(a) * w * 0.055),
        new T.Vector3(Math.sin(a) * w * 0.12, h * 0.78, Math.cos(a) * w * 0.12),
        w * 0.012,
        wood,
      );
    }
    // A calm, rounded canopy: a few smooth volumes rather than leaf facets.
    const canopy = new T.SphereGeometry(1, 28, 18);
    for (let i = 0; i < 11; i++) {
      const a = i * 2.399,
        r = i ? w * (0.13 + (i % 3) * 0.065) : 0,
        k = w * (i ? 0.15 + (i % 3) * 0.022 : 0.23);
      const leaf = add(
        canopy,
        palette('leaf', 'leaf'),
        Math.sin(a) * r,
        h * (i ? 0.72 + (i % 4) * 0.045 : 0.8),
        Math.cos(a) * r,
      );
      leaf.scale.set(k, k * 0.72, k);
    }
  } else if (spec.kind === 'timber-truss') {
    const beam = (a: T.Vector3, b: T.Vector3, size: number) => {
      const delta = b.clone().sub(a),
        mid = a.clone().add(b).multiplyScalar(0.5);
      const o = add(
        new T.BoxGeometry(size, delta.length(), d),
        spec.material,
        ...(mid.toArray() as [number, number, number]),
      );
      o.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        delta.normalize(),
      );
    };
    const arch = (t: number) =>
      new T.Vector3((t - 0.5) * w, 0.1 + (h - 0.2) * Math.sin(t * Math.PI), 0);
    for (let i = 0; i < 20; i++) beam(arch(i / 20), arch((i + 1) / 20), 0.13);
    beam(new T.Vector3(-w / 2, 0.1, 0), new T.Vector3(w / 2, 0.1, 0), 0.17);
    for (let i = 1; i < 4; i++) {
      const x = (i / 4 - 0.5) * w;
      beam(new T.Vector3(x, 0.1, 0), arch(i / 4), 0.1);
      beam(new T.Vector3(x, 0.1, 0), arch((i + (i < 2 ? 1 : -1)) / 4), 0.09);
    }
  } else if (spec.kind === 'ceiling-grid') {
    const columns = Math.max(1, Math.round(w / 0.61)),
      rows = Math.max(1, Math.round(d / 0.61));
    for (let i = 0; i < columns; i++)
      for (let j = 0; j < rows; j++) {
        box(
          -w / 2 + ((i + 0.5) * w) / columns,
          0,
          -d / 2 + ((j + 0.5) * d) / rows,
          w / columns - 0.014,
          h,
          d / rows - 0.014,
          (i + 2 * j) % 7 === 2 ? palette('light', 'light') : spec.material,
        );
      }
  } else if (spec.kind === 'linear-light') {
    box(0, h * 0.03, 0, w, h * 0.94, d, spec.material);
    box(0, 0, 0, w * 0.96, h * 0.04, d * 0.9, palette('light', 'light'));
  } else if (spec.kind === 'round-duct') {
    const tube = add(
      new T.CylinderGeometry(h / 2, h / 2, d, 24),
      spec.material,
      0,
      h / 2,
      0,
    );
    tube.rotation.x = Math.PI / 2;
    for (let z = -d / 2 + 0.3; z < d / 2; z += 0.5) {
      const seam = add(
        new T.TorusGeometry(h / 2, 0.006, 4, 24),
        metal,
        0,
        h / 2,
        z,
      );
      seam.rotation.z = Math.PI / 2;
    }
  } else if (spec.kind === 'vanity') {
    const vh = h - 0.15;
    box(0, 0.1, -d * 0.08, w, vh - 0.24, d * 0.8, wood);
    box(0, vh - 0.14, 0, w, 0.14, d, spec.material);
    const n = Math.max(1, Number(p.basins || 2));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) * w) / n;
      const bowl = cylinder(
        x,
        vh - 0.005,
        0,
        Math.min((w / n) * 0.32, d * 0.32),
        0.008,
        white,
      );
      bowl.scale.z = 0.7;
      box(x, vh, -d * 0.32, 0.022, 0.13, 0.022, metal);
      box(x, vh + 0.12, -d * 0.21, 0.022, 0.022, d * 0.23, metal);
    }
  } else if (spec.kind === 'moss-screen') {
    box(0, 0, -d * 0.3, w, h, d * 0.2, spec.material);
    for (let i = 0; i < 80; i++) {
      const x = (((i * 37) % 79) / 79) * w - w / 2,
        y = (((i * 23) % 79) / 79) * h;
      add(
        new T.IcosahedronGeometry(0.09 + (i % 3) * 0.022, 1),
        spec.material,
        x,
        y,
        0,
      );
    }
    for (let x = -w / 2; x <= w / 2; x += 0.25)
      box(x, 0, d * 0.35, 0.055, h, 0.08, wood);
  } else if (spec.kind === 'sign') {
    const geo = new T.PlaneGeometry(w, h);
    const m = add(geo, spec.material, 0, h / 2, d / 2);
    m.material.side = T.DoubleSide;
    // Thin backing supplies a nonzero depth for the portable dimension normalization.
    box(0, 0, 0, w, h, d * 0.05, palette('backing', spec.material));
  }
  return g;
}
