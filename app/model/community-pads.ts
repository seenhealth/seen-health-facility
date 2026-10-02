import * as T from 'three';
import type { Vec2 } from './schema';
import {
  frontZ,
  instanceSummary,
  LABEL_PLATE,
  LANE,
  lanePose,
  laneRadius,
  PAD_Y,
  PORCH_Y,
  streetZ,
  STREET_Y,
  toLocal,
  type CareSetting,
} from './community-settings';

/**
 * Presentation-model pads for the distributed-care settings: a raised plinth
 * with the horseshoe drive cut through it, the access stub and sidewalk, a
 * label plate, a few abstract trees and a building massing whose silhouette
 * says what the place is. Boxes, rounded boxes, cylinders and extruded
 * outlines only; everything casts and receives shadows.
 *
 * Geometry is authored in the setting's local frame (front toward +z) and the
 * returned group carries the setting's position and heading. A builder has two
 * parts: `massing` (the building, replaced when a facility instance is
 * stamped on the pad) and `site` (porches, ramps, planting, props), which stay.
 */
const PALETTE = {
  plinth: '#e6e2d9',
  pavement: '#c6c2bb',
  marking: '#f8f6f1',
  sidewalk: '#e4e0d7',
  wall: '#f4f1ea',
  wallWarm: '#f1ece2',
  roof: '#d9d5cc',
  houseRoof: '#c9b8a3',
  trim: '#d2ccc0',
  dark: '#5f6461',
  planting: '#b4bea2',
  paver: '#dcd5c8',
  trunk: '#8f8472',
  canopy: ['#a9b598', '#9fad8d', '#b3bda3'],
  glass: '#c7d3d1',
  glassDark: '#56605f',
  bed: '#eef0ea',
  blanket: '#a9bcc4',
  stone: '#e2ddd3',
  rail: '#c4c7c4',
  cross: '#c25b52',
  green: '#4f9a63',
  wood: '#d5ac72',
  metal: '#c2c2bc',
  plate: '#f6f4ee',
  text: '#2f3a38',
  // Clinic equipment: instrument housings, the dark optics and carbon table
  // top, the exam chair's upholstery, the acuity screen and lead aprons.
  device: '#ebe9e3',
  deviceTrim: '#c3c9c8',
  optics: '#2f3639',
  upholstery: '#41606c',
  chart: '#f8f7f2',
  shield: '#e5e1d8',
  beam: '#f1e3a2',
  aprons: ['#4f6f96', '#7d5f80', '#3f7c78'],
};
/**
 * A home pad's porch slab in its local frame (centre and size): the house's
 * front wall stands on its back edge (z = −7.6), where the `door` anchor is.
 * The Wongs' and Mrs. Lin's homes stamp the same plan, so share it.
 */
export const HOME_PORCH = { x: -0.6, z: -6.3, w: 8.0, d: 2.6 };
type Mat = (id: string) => T.MeshStandardMaterial;
type Ctx = ReturnType<typeof helpers>;
function helpers(setting: CareSetting, root: T.Group, mat: Mat) {
  const add = (
    geo: T.BufferGeometry,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    parent: T.Object3D = root,
  ) => {
    const m = new T.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  /** Box with its base at `y`. */
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    parent?: T.Object3D,
  ) => add(new T.BoxGeometry(w, h, d), color, x, y + h / 2, z, parent);
  /** Extruded outline (local x/z points), base at `y`, height `h`. */
  const patch = (
    points: Vec2[],
    y: number,
    h: number,
    color: string,
    name?: string,
  ) => {
    const shape = new T.Shape();
    points.forEach(([x, z], i) =>
      i ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
    );
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const o = add(geo, color, 0, y, 0);
    if (name) o.name = name;
    return o;
  };
  const cylinder = (
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    color: string,
    rTop = r,
    parent?: T.Object3D,
  ) =>
    add(new T.CylinderGeometry(rTop, r, h, 14), color, x, y + h / 2, z, parent);
  const canopyGeo = new T.SphereGeometry(1, 24, 16);
  const tree = (x: number, z: number, r: number, h: number, i: number) => {
    const g = new T.Group();
    g.position.set(x, PAD_Y, z);
    root.add(g);
    add(
      new T.CylinderGeometry(0.06, 0.09, h, 10),
      PALETTE.trunk,
      0,
      h / 2,
      0,
      g,
    );
    const tone = PALETTE.canopy[i % PALETTE.canopy.length];
    const lobes =
      r > 1.4
        ? [
            [0, 0, 0, 1],
            [0.4, -0.16, 0.2, 0.7],
            [-0.34, -0.1, -0.28, 0.66],
          ]
        : [[0, 0, 0, 1]];
    for (const [ox, oy, oz, k] of lobes) {
      const c = add(canopyGeo, tone, ox * r, h + r * 0.2 + oy * r, oz * r, g);
      c.scale.set(r * k, r * k * 0.86, r * k);
    }
  };
  /** Window band: slim dark panes along a wall face. */
  const windows = (
    x0: number,
    x1: number,
    y: number,
    z: number,
    h: number,
    pitch = 2.2,
    w = 1.3,
    parent?: T.Object3D,
  ) => {
    for (let x = x0 + pitch / 2; x < x1 - pitch / 2 + 0.01; x += pitch)
      box(x, y, z, w, h, 0.06, PALETTE.glassDark, parent);
  };
  /** Same band along a wall running in z. */
  const windowsZ = (
    z0: number,
    z1: number,
    y: number,
    x: number,
    h: number,
    pitch = 2.2,
    w = 1.3,
    parent?: T.Object3D,
  ) => {
    for (let z = z0 + pitch / 2; z < z1 - pitch / 2 + 0.01; z += pitch)
      box(x, y, z, 0.06, h, w, PALETTE.glassDark, parent);
  };
  /** Two-line label plate lying on the ground, text along local x. */
  const label = (x: number, z: number, angle: number) => {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 176;
    const g = c.getContext('2d')!;
    g.textAlign = 'center';
    // Step the type down until the longest registry name fits the plate.
    const fit = (text: string, weight: number, size: number, y: number) => {
      let px = size;
      g.font = `${weight} ${px}px Arial`;
      while (px > 20 && g.measureText(text).width > 960)
        g.font = `${weight} ${(px -= 2)}px Arial`;
      g.fillText(text, 512, y);
    };
    g.fillStyle = PALETTE.text;
    fit(setting.name, 600, 62, 74);
    g.fillStyle = '#5b6663';
    fit(setting.subtitle, 400, 38, 134);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    const plate = new T.Group();
    plate.position.set(x, 0, z);
    plate.rotation.y = angle;
    root.add(plate);
    const { w, d } = LABEL_PLATE;
    box(0, STREET_Y - 0.06, 0, w, 0.09, d, PALETTE.plate, plate);
    box(-w / 2 + 0.5, STREET_Y + 0.03, 0, 0.5, 0.05, d, setting.accent, plate);
    const text = new T.Mesh(
      new T.PlaneGeometry(13, 2.23),
      new T.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      }),
    );
    text.rotation.x = -Math.PI / 2;
    text.position.set(0.3, STREET_Y + 0.04, 0);
    plate.add(text);
  };
  return { add, box, patch, cylinder, tree, windows, windowsZ, label };
}

/** Arc of the drive at radius `r` (angles in degrees, local coords). */
function arc(
  setting: CareSetting,
  r: number,
  from: number,
  to: number,
  steps = 24,
): Vec2[] {
  const cz = frontZ(setting) - setting.drive.depth,
    pts: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
    pts.push([r * Math.sin(a), cz - r * Math.cos(a)]);
  }
  return pts;
}
/** Plinth, drive band, stub, sidewalk and apron shared by every kind. */
function buildGround(s: CareSetting, h: Ctx) {
  const w = s.pad.w,
    zBack = -s.pad.d / 2 - (s.pad.back ?? 0),
    zF = frontZ(s),
    zS = streetZ(s),
    cz = zF - s.drive.depth,
    rIn = s.drive.radius - LANE / 2,
    rOut = laneRadius(s, (s.drive.lanes - 1) as 0 | 1) + LANE / 2,
    apexZ = cz - s.drive.radius;
  // Outer plinth: the pad minus the drive band (and the apron notch).
  const outer: Vec2[] = [
    [-w / 2, zF],
    [-rOut, zF],
    [-rOut, cz],
  ];
  const outerArc = arc(s, rOut, -90, 90);
  if (s.apron.w > 0) {
    const half = s.apron.w / 2,
      bottom = apexZ - s.apron.d;
    for (const p of outerArc) {
      if (p[0] < -half) outer.push(p);
      else break;
    }
    outer.push(
      [-half, cz - Math.sqrt(Math.max(0, rOut * rOut - half * half))],
      [-half, bottom],
      [half, bottom],
    );
    outer.push([half, cz - Math.sqrt(Math.max(0, rOut * rOut - half * half))]);
    for (const p of outerArc) if (p[0] > half) outer.push(p);
  } else outer.push(...outerArc);
  outer.push(
    [rOut, cz],
    [rOut, zF],
    [w / 2, zF],
    [w / 2, zBack],
    [-w / 2, zBack],
  );
  h.patch(
    outer,
    STREET_Y - 0.06,
    PAD_Y - STREET_Y + 0.06,
    PALETTE.plinth,
    'pad-plinth',
  );
  const island: Vec2[] = [
    [-rIn, zF],
    [-rIn, cz],
    ...arc(s, rIn, -90, 90),
    [rIn, cz],
    [rIn, zF],
  ];
  h.patch(
    island,
    STREET_Y - 0.06,
    PAD_Y - STREET_Y + 0.06,
    PALETTE.plinth,
    'pad-island',
  );
  // Planting on the island and a soft lawn tone around the building.
  h.patch(
    island.map(([x, z]) => [x * 0.82, cz + (z - cz) * 0.82] as Vec2),
    PAD_Y,
    0.02,
    PALETTE.planting,
  );
  // The drive band and the stub legs, at street level.
  const band: Vec2[] = [
    [rOut, zF],
    [rOut, cz],
    ...arc(s, rOut, 90, -90),
    [-rOut, cz],
    [-rOut, zF],
    [-rIn, zF],
    [-rIn, cz],
    ...arc(s, rIn, -90, 90),
    [rIn, cz],
    [rIn, zF],
  ];
  h.patch(band, STREET_Y - 0.08, 0.08, PALETTE.pavement, 'drive-band');
  const legW = rOut - rIn,
    legMid = (rIn + rOut) / 2,
    stubLen = zS - zF;
  for (const side of [-1, 1]) {
    h.box(
      side * legMid,
      STREET_Y - 0.08,
      zF + stubLen / 2,
      legW,
      0.08,
      stubLen,
      PALETTE.pavement,
    );
    // Hairline edge markings on the stub.
    for (const x of [side * rIn + side * 0.06, side * rOut - side * 0.06])
      h.box(
        x,
        STREET_Y,
        zF + stubLen / 2,
        0.08,
        0.012,
        stubLen,
        PALETTE.marking,
      );
  }
  // Sidewalk stub beside the entry leg, from the street to the pad edge.
  h.box(
    rOut + 0.9,
    STREET_Y - 0.06,
    zF + stubLen / 2,
    1.5,
    PAD_Y - STREET_Y + 0.06,
    stubLen,
    PALETTE.sidewalk,
  );
  if (s.apron.w > 0)
    h.box(
      0,
      STREET_Y - 0.08,
      apexZ - s.apron.d / 2,
      s.apron.w,
      0.08,
      s.apron.d,
      PALETTE.pavement,
    );
  // Kerb ramps where people step between pavement and plinth.
  const kerb = s.anchors.kerb;
  if (kerb) {
    const k = toLocal(s, kerb);
    const ramp = h.box(
      k[0],
      STREET_Y,
      k[1] + 0.5,
      1.4,
      0.02,
      1.2,
      PALETTE.sidewalk,
    );
    ramp.rotation.x = -Math.atan2(PAD_Y - STREET_Y, 1.2);
    ramp.position.y = (STREET_Y + PAD_Y) / 2;
  }
}
/** Stall markings around a parked car position (local), heading along -z. */
function stall(h: Ctx, x: number, z: number) {
  for (const dx of [-1.45, 1.45])
    h.box(x + dx, STREET_Y, z, 0.08, 0.012, 5, PALETTE.marking);
  h.box(x, STREET_Y, z - 2.5, 2.98, 0.012, 0.08, PALETTE.marking);
}
/** A pitched roof over x0..x1, spanning z0..z1 with the ridge along x. */
function pitchedRoof(
  h: Ctx,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  eave: number,
  rise: number,
  color: string,
  overhang = 0.5,
) {
  const shape = new T.Shape();
  shape.moveTo(-(z1 - z0) / 2 - overhang, 0);
  shape.lineTo(0, rise);
  shape.lineTo((z1 - z0) / 2 + overhang, 0);
  shape.lineTo((z1 - z0) / 2 + overhang, -0.16);
  shape.lineTo(0, rise - 0.16);
  shape.lineTo(-(z1 - z0) / 2 - overhang, -0.16);
  shape.closePath();
  const geo = new T.ExtrudeGeometry(shape, {
    depth: x1 - x0 + overhang * 2,
    bevelEnabled: false,
  });
  const roof = h.add(geo, color, 0, eave, 0);
  roof.rotation.y = -Math.PI / 2;
  roof.position.set(x1 + overhang, eave, (z0 + z1) / 2);
  return roof;
}

function buildHouse(s: CareSetting, h: Ctx) {
  const door = toLocal(s, s.anchors.door);
  // Bungalow: body, pitched roof, chimney, door, windows and the door canopy.
  h.box(0, PAD_Y, -10.6, 14, 3.0, 6.0, PALETTE.wallWarm);
  pitchedRoof(h, -7, 7, -13.6, -7.6, PAD_Y + 3.0, 1.9, PALETTE.houseRoof);
  h.box(-4.2, PAD_Y + 3.0, -11.6, 0.9, 2.0, 0.9, PALETTE.trim);
  h.box(door[0], PAD_Y + 0.3, -7.56, 0.95, 2.1, 0.08, s.accent);
  h.windows(-6.6, -1.6, PAD_Y + 1.0, -7.56, 1.35, 2.4, 1.4);
  h.windows(2.2, 6.6, PAD_Y + 1.0, -7.56, 1.35, 2.4, 1.4);
  h.box(door[0], PAD_Y + 2.5, -7.0, 2.6, 0.14, 1.3, PALETTE.houseRoof);
}
function buildHomeSite(s: CareSetting, h: Ctx) {
  const a = (k: string) => toLocal(s, s.anchors[k]);
  // Porch with posts and a bench; the new ramp with rails from the pad.
  const porch = HOME_PORCH,
    front = porch.z + porch.d / 2,
    rise = PORCH_Y - PAD_Y;
  h.box(porch.x, PAD_Y, porch.z, porch.w, rise, porch.d, PALETTE.stone);
  // Open porch with a low rail, broken where the porch step comes up from the
  // pad (`porchStep`), with a half-height step there.
  const step = a('porchStep')[0],
    railZ = front - 0.1,
    rail = PALETTE.wallWarm;
  for (const [x0, x1] of [
    [-4.5, step - 0.5],
    [step + 0.5, -0.9],
  ]) {
    for (const x of [x0, x1]) h.box(x, PORCH_Y, railZ, 0.08, 0.9, 0.08, rail);
    h.box((x0 + x1) / 2, PORCH_Y + 0.86, railZ, x1 - x0, 0.06, 0.06, rail);
  }
  h.box(3.3, PORCH_Y, railZ, 0.08, 0.9, 0.08, rail);
  h.box(step, PAD_Y, front + 0.15, 1.0, rise / 2, 0.3, PALETTE.stone);
  // The bench sits on the slab, clear of the house front at the slab's back edge.
  const seat = a('porchSeat');
  h.box(seat[0] - 0.35, PORCH_Y, seat[1] + 0.2, 0.5, 0.42, 1.3, PALETTE.wood);
  h.box(-4.2, PORCH_Y, -7.15, 0.7, 0.72, 0.7, PALETTE.wood);
  const foot = a('rampFoot'),
    top = a('rampTop'),
    length = foot[0] - top[0],
    slope = Math.atan2(PORCH_Y - PAD_Y, length);
  const ramp = h.box(
    (foot[0] + top[0]) / 2,
    0,
    foot[1],
    Math.hypot(length, PORCH_Y - PAD_Y),
    0.1,
    1.2,
    PALETTE.stone,
  );
  ramp.position.y = (PAD_Y + PORCH_Y) / 2 - 0.02;
  ramp.rotation.z = slope;
  for (const dz of [-0.56, 0.56]) {
    const rail = h.box(
      (foot[0] + top[0]) / 2,
      0,
      foot[1] + dz,
      Math.hypot(length, PORCH_Y - PAD_Y),
      0.04,
      0.04,
      PALETTE.rail,
    );
    rail.position.y = (PAD_Y + PORCH_Y) / 2 + 0.9;
    rail.rotation.z = slope;
    for (let i = 0; i <= 4; i++) {
      const x = top[0] + (length * i) / 4,
        y = PORCH_Y - ((PORCH_Y - PAD_Y) * i) / 4;
      h.box(x, y, foot[1] + dz, 0.035, 0.9, 0.035, PALETTE.rail);
    }
  }
  // Home-modification kit, where a home has a `crate` anchor (the Wongs'):
  // a grab-bar crate, a toolbox and two bars leaning on it.
  if (s.anchors.crate) homeModsKit(h, a('crate'));
  // Garden beds and trees at the pad corners.
  h.box(-11, PAD_Y, -10.5, 6, 0.08, 5, PALETTE.planting);
  h.box(11.5, PAD_Y, -11.5, 5, 0.08, 3.5, PALETTE.planting);
  h.tree(-12.4, -11.6, 1.7, 3.2, 0);
  h.tree(12.6, -12.2, 1.4, 2.8, 1);
  h.tree(-13.2, 9.8, 1.2, 2.6, 2);
  // A visitor's parking stall, where a home has one (the Wongs' aide).
  if (s.anchors.stall) {
    const st = toLocal(s, s.anchors.stall);
    stall(h, st[0], st[1]);
  }
}
function homeModsKit(h: Ctx, crate: Vec2) {
  h.box(crate[0], PAD_Y, crate[1], 0.9, 0.5, 0.6, PALETTE.wood);
  h.box(crate[0] + 0.85, PAD_Y, crate[1] + 0.1, 0.5, 0.28, 0.32, PALETTE.dark);
  for (const [dx, dz] of [
    [-0.35, -0.36],
    [-0.15, -0.38],
  ]) {
    const bar = h.cylinder(
      crate[0] + dx,
      PAD_Y,
      crate[1] + dz,
      0.02,
      0.8,
      PALETTE.metal,
    );
    bar.rotation.x = 0.45;
    bar.position.y = PAD_Y + 0.36;
  }
}
function buildPharmacy(s: CareSetting, h: Ctx) {
  // Storefront: floor, back and side walls, roof with fascia; open glazed front.
  h.box(0, PAD_Y, -7.6, 14, 0.06, 6.0, PALETTE.paver);
  h.box(0, PAD_Y, -10.1, 14, 3.6, 1.0, PALETTE.wall);
  for (const x of [-6.5, 6.5])
    h.box(x, PAD_Y, -7.6, 1.0, 3.6, 6.0, PALETTE.wall);
  h.box(0, PAD_Y + 3.6, -7.6, 14.6, 0.35, 6.6, PALETTE.roof);
  h.box(0, PAD_Y + 2.9, -4.5, 14.6, 0.7, 0.16, s.accent);
  // Glass line along the front with a doorway gap.
  for (const [x0, x1] of [
    [-6, 0.2],
    [1.8, 6],
  ])
    h.box((x0 + x1) / 2, PAD_Y, -4.62, x1 - x0, 2.9, 0.05, 'glass');
  // Counter, shelving and the packing bench.
  h.box(-1.6, PAD_Y, -6.6, 5.6, 1.0, 0.6, PALETTE.wood);
  h.box(-1.6, PAD_Y + 1.0, -6.6, 5.7, 0.05, 0.7, PALETTE.wall);
  for (const y of [0.4, 1.1, 1.8])
    h.box(-1.8, PAD_Y + y, -9.35, 8.6, 0.05, 0.4, PALETTE.trim);
  for (let x = -5.6; x < 2.6; x += 0.9)
    for (const y of [0.45, 1.15, 1.85])
      h.box(
        x,
        PAD_Y + y,
        -9.35,
        0.5,
        0.3,
        0.3,
        x % 1.8 < 0.9 ? PALETTE.glass : s.accent,
      );
  h.box(3.0, PAD_Y, -8.9, 2.6, 0.9, 0.7, PALETTE.wood);
  for (let i = 0; i < 4; i++)
    h.box(2.2 + i * 0.5, PAD_Y + 0.9, -8.9, 0.34, 0.12, 0.42, PALETTE.marking);
  // Green cross on a pylon by the storefront corner.
  h.box(-7.5, PAD_Y, -3.6, 0.2, 3.6, 0.2, PALETTE.metal);
  h.box(-7.5, PAD_Y + 3.0, -3.6, 1.1, 1.1, 0.14, PALETTE.marking);
  h.box(-7.5, PAD_Y + 3.4, -3.6, 0.8, 0.24, 0.16, PALETTE.green);
  h.box(-7.5, PAD_Y + 3.12, -3.6, 0.24, 0.8, 0.16, PALETTE.green);
  h.tree(-10.4, -9.6, 1.4, 2.8, 0);
  h.tree(10.6, -9.0, 1.2, 2.6, 1);
  h.tree(10.8, 8.4, 1.1, 2.4, 2);
}
function buildHospital(s: CareSetting, h: Ctx) {
  // Main three-storey block with window bands and a red cross.
  h.box(-6.2, PAD_Y, -9.9, 21.6, 10.5, 7.4, PALETTE.wall);
  for (const y of [1.2, 4.6, 8.0])
    h.windows(-16.4, 4.0, PAD_Y + y, -6.16, 1.5, 2.3, 1.4);
  h.box(-6.2, PAD_Y + 10.5, -9.9, 22.0, 0.3, 7.8, PALETTE.roof);
  h.box(-6.2, PAD_Y + 10.8, -9.9, 4.0, 1.4, 3.0, PALETTE.trim);
  h.box(-12.5, PAD_Y + 7.4, -6.12, 1.6, 0.45, 0.1, PALETTE.cross);
  h.box(-12.5, PAD_Y + 6.82, -6.12, 0.45, 1.6, 0.1, PALETTE.cross);
  // ED wing: single storey with an open ward bay showing the bed.
  h.box(14, PAD_Y, -9.9, 6, 4.4, 7.4, PALETTE.wall);
  h.box(7.8, PAD_Y, -12.6, 6.4, 4.4, 2.0, PALETTE.wall);
  h.box(4.8, PAD_Y, -9.9, 0.4, 4.4, 7.4, PALETTE.wall);
  h.box(7.8, PAD_Y + 3.9, -8.9, 6.4, 0.5, 5.4, PALETTE.roof);
  h.box(7.8, PAD_Y, -8.9, 6.0, 0.05, 5.4, PALETTE.paver);
  h.box(11.0, PAD_Y + 3.3, -6.16, 12, 0.5, 0.1, PALETTE.cross);
  h.windows(11.6, 16.6, PAD_Y + 1.2, -6.16, 1.5, 2.3, 1.4);
  const bed = toLocal(s, s.anchors.bed);
  h.box(bed[0], PAD_Y, bed[1], 1.0, 0.55, 2.1, PALETTE.metal);
  h.box(bed[0], PAD_Y + 0.55, bed[1], 1.0, 0.16, 2.1, PALETTE.bed);
  h.box(bed[0], PAD_Y + 0.71, bed[1] + 0.25, 0.96, 0.08, 1.4, PALETTE.blanket);
  h.box(bed[0], PAD_Y + 0.55, bed[1] - 1.1, 1.0, 0.7, 0.06, PALETTE.metal);
  h.cylinder(bed[0] - 0.75, PAD_Y, bed[1] - 0.7, 0.02, 1.9, PALETTE.metal);
  // Drop-off canopy over the apron on four columns.
  h.box(0, PAD_Y + 3.8, -2.1, 12, 0.3, 8.2, PALETTE.roof);
  h.box(0, PAD_Y + 3.6, 1.95, 12, 0.5, 0.16, s.accent);
  for (const x of [-5.6, 5.6])
    for (const z of [-5.6, -2.4])
      h.box(x, PAD_Y, z, 0.28, 3.8, 0.28, PALETTE.metal);
  h.box(0, PAD_Y + 0.3, -6.16, 2.4, 2.4, 0.1, 'glass');
  // Ambulance bay hatching where the ambulance stops.
  const bay = lanePose(s, 0, 45),
    local = toLocal(s, bay.position),
    dir = toLocalDir(s, bay.direction);
  for (let i = -2; i <= 2; i++)
    h.box(
      local[0] + dir[0] * i * 1.3,
      STREET_Y,
      local[1] + dir[1] * i * 1.3,
      0.1,
      0.012,
      2.6,
      PALETTE.marking,
    ).rotation.y = -Math.atan2(dir[1], dir[0]) + Math.PI / 2;
  h.tree(-16.4, 12.6, 1.6, 3.2, 0);
  h.tree(16.4, 12.2, 1.4, 3.0, 1);
  h.tree(-16.4, -14.0, 1.2, 2.6, 2);
}
/** A world direction in the pad's frame (no translation). */
const toLocalDir = (s: CareSetting, d: Vec2): Vec2 =>
  toLocal({ position: [0, 0], heading: s.heading }, d);
/** A horizontal bar of square section `size` from `a` to `b` (local x/z), centred at height `y`. */
function bar(h: Ctx, a: Vec2, b: Vec2, y: number, size: number, color: string) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const m = h.add(
    new T.BoxGeometry(Math.hypot(dx, dz), size, size),
    color,
    (a[0] + b[0]) / 2,
    y,
    (a[1] + b[1]) / 2,
  );
  m.rotation.y = Math.atan2(-dz, dx);
  return m;
}
/** Outline of a band `width` wide along a polyline (local x/z), for `patch`. */
function ribbon(points: Vec2[], width: number): Vec2[] {
  const side = points.map((p, i) => {
    const a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [
      ((a[1] - b[1]) / len) * (width / 2),
      ((b[0] - a[0]) / len) * (width / 2),
    ];
  });
  return [
    ...points.map((p, i): Vec2 => [p[0] + side[i][0], p[1] + side[i][1]]),
    ...points
      .map((p, i): Vec2 => [p[0] - side[i][0], p[1] - side[i][1]])
      .reverse(),
  ];
}
/** A cylinder lying along local x (`axis` 'x') or z, centred at (x, y, z). */
function lying(
  h: Ctx,
  axis: 'x' | 'z',
  x: number,
  y: number,
  z: number,
  r: number,
  length: number,
  color: string,
) {
  const m = h.cylinder(x, y - length / 2, z, r, length, color);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  else m.rotation.x = Math.PI / 2;
  return m;
}
/**
 * The specialty clinic in its local frame: storey heights, the building's
 * x extent and the partitions between its ground-floor rooms (cardiology |
 * lobby | optometry | imaging). The ground floor is tall enough for the X-ray
 * tube's ceiling rails and for the oblique cameras (elevation up to ≈ 0.6) to
 * see the equipment under the solid upper storey.
 */
const CLINIC = {
  floor: 3.9,
  upper: 3.6,
  x0: -11,
  x1: 18.6,
  partitions: [-2.2, 5.3, 10.5],
};
/**
 * A room's name on the upper storey's front above it: white type on an
 * accent panel (the type needs a DOM canvas; headless builds keep the panel).
 */
function roomSign(h: Ctx, s: CareSetting, text: string, x: number) {
  const w = 2.4,
    tall = 0.42,
    panel = h.box(
      x,
      PAD_Y + CLINIC.floor + 0.3,
      -5.075,
      w,
      tall,
      0.05,
      s.accent,
    );
  if (typeof document === 'undefined') return;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 90;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let px = 56;
  g.font = `600 ${px}px Arial`;
  while (px > 24 && g.measureText(text.toUpperCase()).width > 460)
    g.font = `600 ${(px -= 2)}px Arial`;
  g.fillText(text.toUpperCase(), 256, 47);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  const type = new T.Mesh(
    new T.PlaneGeometry(w, tall),
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  type.position.z = 0.026;
  panel.add(type);
}
function buildSpecialist(s: CareSetting, h: Ctx) {
  const { floor: gf, upper, x0, x1 } = CLINIC,
    cx = (x0 + x1) / 2,
    w = x1 - x0;
  // Ground floor: an open front under a solid upper storey, the rooms in a
  // row behind it.
  h.box(cx, PAD_Y, -9.0, w, 0.06, 7.2, PALETTE.paver);
  h.box(cx, PAD_Y, -12.1, w, gf, 1.0, PALETTE.wall);
  h.box(x0 + 0.5, PAD_Y, -9.0, 1.0, gf, 7.2, PALETTE.wall);
  // The east end is glazed at the front, without a corner column, so the
  // cameras east of north (azimuth ≈ 0.4–0.6) still see the X-ray patient
  // past the end wall.
  h.box(x1 - 0.5, PAD_Y, -10.9, 1.0, gf, 3.4, PALETTE.wall);
  h.box(x1 - 0.5, PAD_Y, -7.4, 0.06, gf, 3.6, 'glass').castShadow = false;
  // Front columns stay off the oblique cameras' sight lines into the rooms:
  // none in front of the optometry chair or the X-ray table.
  for (const x of [-7.6, -3.9, 3.9, CLINIC.partitions[2]])
    h.box(x, PAD_Y, -5.7, 0.26, gf, 0.26, PALETTE.metal);
  h.box(cx, PAD_Y + gf, -9.0, w + 0.6, upper, 7.8, PALETTE.wall);
  h.windows(x0, x1, PAD_Y + gf + 1.0, -5.06, 1.6, 2.2, 1.5);
  h.windowsZ(-12.6, -5.4, PAD_Y + gf + 1.0, x0 - 0.34, 1.6, 2.2, 1.5);
  h.windowsZ(-12.6, -5.4, PAD_Y + gf + 1.0, x1 + 0.34, 1.6, 2.2, 1.5);
  h.box(cx, PAD_Y + gf + upper, -9.0, w + 1.0, 0.3, 8.2, PALETTE.roof);
  // Drop-off canopy over the entrance, hung from the upper storey's edge.
  h.box(0, PAD_Y + gf - 0.25, -3.9, 6.4, 0.24, 3.2, PALETTE.roof);
  h.box(0, PAD_Y + gf, -2.35, 6.4, 0.5, 0.14, s.accent);
  // Room signs on the band between the open front and the upper windows.
  roomSign(h, s, 'Cardiology', -6.15);
  roomSign(h, s, 'Optometry', 7.9);
  roomSign(h, s, 'Imaging', 14.1);
  // Partitions stop 1.6 m short of the front, leaving a gallery from the
  // lobby to the rooms east of it.
  for (const x of CLINIC.partitions)
    h.box(x, PAD_Y, -9.3, 0.2, gf, 4.6, PALETTE.wall);
  // Lobby: reception desk and waiting chairs facing the front.
  h.box(3.2, PAD_Y, -8.6, 1.8, 1.05, 0.7, PALETTE.wood);
  for (const k of ['waitA', 'waitB']) {
    const p = toLocal(s, s.anchors[k]);
    h.box(p[0], PAD_Y, p[1] + 0.1, 0.5, 0.45, 0.5, PALETTE.blanket);
    h.box(p[0], PAD_Y + 0.45, p[1] - 0.18, 0.5, 0.45, 0.06, PALETTE.blanket);
  }
  // Cardiology: exam chair and the cardiologist's desk.
  const exam = toLocal(s, s.anchors.examSeat);
  h.box(exam[0], PAD_Y, exam[1], 0.7, 0.5, 0.7, PALETTE.blanket);
  h.box(exam[0], PAD_Y + 0.5, exam[1] - 0.32, 0.7, 0.7, 0.08, PALETTE.blanket);
  const desk = toLocal(s, s.anchors.mdDesk);
  h.box(desk[0], PAD_Y, desk[1] - 0.85, 1.4, 0.75, 0.6, PALETTE.wood);
  buildOptometry(s, h);
  buildImaging(s, h);
  // Footpath from the street sidewalk to the open front east of the canopy,
  // wide enough for walk-ins in and out (the anchors' two lanes).
  const lane = (a: string, b: string): Vec2 => {
    const [p, q] = [toLocal(s, s.anchors[a]), toLocal(s, s.anchors[b])];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  const walk: Vec2[] = [
    [lane('sidewalkPad', 'sidewalkPadOut')[0], frontZ(s)],
    lane('approachA', 'approachAOut'),
    lane('approachB', 'approachBOut'),
    lane('approachC', 'approachCOut'),
    [4.9, -5.3],
  ];
  h.patch(ribbon(walk, 1.6), PAD_Y, 0.015, PALETTE.paver);
  h.tree(-13.0, 11.6, 1.5, 3.0, 0);
  h.tree(13.0, 11.2, 1.3, 2.8, 1);
  h.tree(20.6, -11.2, 1.1, 2.6, 2);
  h.tree(-17.0, -9.5, 1.6, 3.1, 0);
  h.tree(-19.0, 1.0, 1.3, 2.7, 1);
  h.tree(16.8, 7.0, 1.3, 2.8, 2);
}
/**
 * Optometry, a mirrored lane: the exam chair faces +x toward the mirror on
 * the imaging partition, the visual acuity screen behind it on the lobby
 * partition, and the phoropter hangs on its arm in front of the patient's
 * eyes, its lens side toward the oblique cameras. The slit lamp's instrument
 * table stands at the chair's right with the optometrist's stool beside it;
 * the technician's counter (autorefractor, lensometer) and the optometrist's
 * desk run along the back wall. Furniture stands on the floor slab (`fl`);
 * what lines up with a seated patient's eyes is measured from the ground
 * people stand on (`PAD_Y`).
 */
function buildOptometry(s: CareSetting, h: Ctx) {
  const a = (k: string) => toLocal(s, s.anchors[k]),
    fl = PAD_Y + 0.06;
  // Exam chair on its pedestal, the back reclined, the headrest up.
  const [sx, sz] = a('optoSeat');
  h.cylinder(sx - 0.05, fl, sz, 0.26, 0.04, PALETTE.optics);
  h.cylinder(sx - 0.05, fl + 0.04, sz, 0.09, 0.28, PALETTE.deviceTrim);
  h.box(sx + 0.06, fl + 0.32, sz, 0.58, 0.14, 0.62, PALETTE.upholstery);
  const back = h.box(
    sx - 0.27,
    fl + 0.44,
    sz,
    0.13,
    0.8,
    0.58,
    PALETTE.upholstery,
  );
  back.rotation.z = 0.16;
  h.box(sx - 0.37, fl + 1.2, sz, 0.11, 0.2, 0.3, PALETTE.upholstery);
  for (const dz of [-0.35, 0.35]) {
    h.box(sx + 0.04, fl + 0.6, sz + dz, 0.48, 0.06, 0.09, PALETTE.optics);
    h.box(sx - 0.12, fl + 0.46, sz + dz, 0.06, 0.14, 0.06, PALETTE.optics);
  }
  h.box(sx + 0.5, fl, sz, 0.32, 0.04, 0.48, PALETTE.optics);
  // Instrument stand behind the chair's left; its arm holds the phoropter
  // at the patient's eye height (seated, about 1.1 m): two lens wheels
  // either side of the sight line, their apertures toward the mirror.
  const [tx, tz] = a('optoStand'),
    px = sx + 0.36,
    py = PAD_Y + 1.13;
  h.box(tx, fl, tz, 0.5, 0.05, 0.5, PALETTE.deviceTrim);
  h.box(tx, fl + 0.05, tz, 0.16, 1.55, 0.16, PALETTE.device);
  h.box(tx, fl + 1.6, tz, 0.24, 0.12, 0.24, PALETTE.device);
  bar(h, [tx, tz], [px - 0.02, sz], py + 0.47, 0.06, PALETTE.device);
  h.box(px - 0.02, py + 0.12, sz, 0.04, 0.33, 0.04, PALETTE.optics);
  h.box(px, py - 0.1, sz, 0.1, 0.2, 0.13, PALETTE.optics);
  h.box(px, py + 0.1, sz, 0.05, 0.035, 0.44, PALETTE.optics);
  for (const dz of [-0.14, 0.14]) {
    lying(h, 'x', px, py, sz + dz, 0.115, 0.09, PALETTE.optics);
    lying(h, 'x', px + 0.05, py, sz + dz, 0.06, 0.02, PALETTE.deviceTrim);
  }
  // Visual acuity screen behind the patient, read in the mirror: a dark
  // bezel, a bright face and rows of letters shrinking from the big E.
  const [cx, cz] = a('optoChart'),
    [mx, mz] = a('optoMirror');
  h.box(cx + 0.02, PAD_Y + 1.3, cz, 0.04, 0.58, 0.86, 'screen');
  h.box(cx + 0.045, PAD_Y + 1.34, cz, 0.01, 0.5, 0.78, PALETTE.chart);
  for (const [y, tall, wide] of [
    [1.69, 0.1, 0.09],
    [1.6, 0.06, 0.24],
    [1.535, 0.045, 0.34],
    [1.48, 0.034, 0.44],
    [1.435, 0.026, 0.52],
    [1.4, 0.02, 0.58],
  ])
    h.box(cx + 0.052, PAD_Y + y, cz, 0.008, tall, wide, PALETTE.optics);
  h.box(mx - 0.015, PAD_Y + 0.95, mz, 0.03, 0.8, 1.0, PALETTE.deviceTrim);
  h.box(mx - 0.035, PAD_Y + 0.99, mz, 0.01, 0.72, 0.92, PALETTE.glass);
  // Slit lamp on its instrument table: chin rest and forehead band toward
  // the chair (−x), the illumination tower, the microscope and its oculars
  // toward the optometrist's stool (+x).
  const [lx, lz] = a('optoSlit'),
    top = fl + 0.72;
  h.box(lx, fl, lz, 0.46, 0.04, 0.46, PALETTE.optics);
  h.box(lx, fl + 0.04, lz, 0.12, 0.64, 0.12, PALETTE.deviceTrim);
  h.box(lx, top - 0.04, lz, 0.46, 0.04, 0.64, PALETTE.deviceTrim);
  h.box(lx, top, lz, 0.32, 0.06, 0.36, PALETTE.device);
  for (const dz of [-0.13, 0.13])
    h.box(lx - 0.15, top + 0.06, lz + dz, 0.025, 0.46, 0.025, PALETTE.optics);
  h.box(lx - 0.15, top + 0.5, lz, 0.03, 0.03, 0.28, PALETTE.optics);
  h.box(lx - 0.15, top + 0.22, lz, 0.06, 0.03, 0.09, PALETTE.device);
  h.cylinder(lx - 0.03, top + 0.06, lz, 0.022, 0.3, PALETTE.device);
  h.box(lx - 0.03, top + 0.34, lz, 0.08, 0.1, 0.08, PALETTE.device);
  h.box(lx + 0.06, top + 0.18, lz, 0.16, 0.09, 0.11, PALETTE.optics);
  for (const dz of [-0.033, 0.033])
    lying(h, 'x', lx + 0.19, top + 0.25, lz + dz, 0.018, 0.12, PALETTE.optics);
  h.cylinder(lx + 0.12, top + 0.06, lz + 0.11, 0.012, 0.08, PALETTE.optics);
  // The optometrist's stool: five-star base, gas column, round seat.
  const [ox, oz] = a('optoStool');
  h.cylinder(ox, fl, oz, 0.24, 0.03, PALETTE.optics);
  h.cylinder(ox, fl + 0.03, oz, 0.03, 0.38, PALETTE.deviceTrim);
  h.cylinder(ox, fl + 0.41, oz, 0.19, 0.07, PALETTE.optics);
  // Back wall: the technician's counter with the autorefractor and the
  // lensometer; the optometrist's desk, screen and chair.
  const [kx] = a('optoCounter');
  h.box(kx, fl, -11.28, 1.8, 0.86, 0.6, PALETTE.wallWarm);
  h.box(kx, fl + 0.86, -11.28, 1.84, 0.04, 0.64, PALETTE.wood);
  h.box(kx - 0.45, fl + 0.9, -11.32, 0.32, 0.28, 0.42, PALETTE.device);
  h.box(kx - 0.45, fl + 0.98, -11.105, 0.2, 0.14, 0.01, 'screen');
  h.box(kx + 0.45, fl + 0.9, -11.3, 0.16, 0.05, 0.18, PALETTE.device);
  h.box(kx + 0.45, fl + 0.95, -11.32, 0.07, 0.26, 0.07, PALETTE.device);
  h.box(kx + 0.45, fl + 1.21, -11.28, 0.12, 0.1, 0.16, PALETTE.optics);
  const [dx, dz] = a('optoDesk');
  h.box(dx, fl, -11.28, 1.4, 0.74, 0.6, PALETTE.wood);
  h.box(dx, fl + 0.74, -11.42, 0.12, 0.08, 0.12, PALETTE.optics);
  h.box(dx, fl + 0.82, -11.42, 0.52, 0.32, 0.04, 'screen');
  h.box(dx, fl + 0.37, dz, 0.46, 0.08, 0.46, PALETTE.optics);
  h.box(dx, fl + 0.45, dz + 0.22, 0.44, 0.46, 0.05, PALETTE.optics);
}
/**
 * Imaging: a digital X-ray room. The table runs along the front with the
 * patient's chair at its east end; the tube hangs from a telescoping column
 * on a bridge riding two ceiling rails, its collimator over the table. The
 * shielded control alcove sits in the front corner by the optometry
 * partition, its lead-glass window toward the table and the lead aprons on
 * its outer face; the upright detector stands against the back wall.
 */
function buildImaging(s: CareSetting, h: Ctx) {
  const a = (k: string) => toLocal(s, s.anchors[k]),
    fl = PAD_Y + 0.06,
    ceiling = PAD_Y + CLINIC.floor,
    [tx, tz] = a('imagingTable'),
    [px, pz] = a('imagingSeat'),
    [cx, cz] = a('imagingConsole');
  // Table: base, pedestal, detector housing with an accent stripe, carbon
  // top (0.8 m), its east end clear for the knees of a seated patient.
  h.box(tx - 0.35, fl, tz, 1.1, 0.04, 0.62, PALETTE.deviceTrim);
  h.box(tx - 0.35, fl + 0.04, tz, 0.62, 0.52, 0.42, PALETTE.device);
  h.box(tx - 0.2, fl + 0.56, tz, 2.0, 0.17, 0.7, PALETTE.device);
  h.box(tx - 0.2, fl + 0.63, tz + 0.352, 2.0, 0.04, 0.01, s.accent);
  h.box(tx, fl + 0.73, tz, 2.4, 0.06, 0.8, PALETTE.optics);
  // Patient's chair at the table's east end, facing it.
  h.box(px - 0.08, fl, pz, 0.46, 0.44, 0.46, PALETTE.blanket);
  h.box(px + 0.18, fl + 0.44, pz, 0.06, 0.46, 0.46, PALETTE.blanket);
  // Overhead tube over the table's east end, where the forearm lies: two
  // ceiling rails, the bridge, a telescoping column, the tube housing and
  // the collimator with its light field, handles and display.
  const ux = px - 0.6;
  for (const dz of [-0.62, 0.62])
    h.box(
      tx + 0.1,
      ceiling - 0.08,
      tz + dz,
      4.2,
      0.07,
      0.09,
      PALETTE.deviceTrim,
    );
  h.box(ux, ceiling - 0.21, tz, 0.32, 0.13, 1.5, PALETTE.device);
  h.box(
    ux,
    PAD_Y + 2.6,
    tz,
    0.22,
    ceiling - 0.21 - (PAD_Y + 2.6),
    0.22,
    PALETTE.device,
  );
  h.box(ux, PAD_Y + 2.0, tz, 0.17, 0.6, 0.17, PALETTE.deviceTrim);
  lying(h, 'z', ux, PAD_Y + 1.86, tz, 0.15, 0.56, PALETTE.device);
  for (const dz of [-0.3, 0.3])
    lying(h, 'z', ux, PAD_Y + 1.86, tz + dz, 0.165, 0.05, s.accent);
  h.box(ux, PAD_Y + 1.5, tz, 0.28, 0.21, 0.28, PALETTE.deviceTrim);
  h.box(ux, PAD_Y + 1.49, tz, 0.18, 0.01, 0.18, PALETTE.beam);
  h.box(ux, PAD_Y + 1.55, tz + 0.15, 0.2, 0.12, 0.02, 'screen');
  for (const dx of [-0.17, 0.17])
    h.box(ux + dx, PAD_Y + 1.58, tz, 0.03, 0.03, 0.24, PALETTE.optics);
  // Control alcove: lead-lined walls 2.4 m high, the window over the
  // console toward the table, the technologist's chair.
  const wx = 12.85,
    west = CLINIC.partitions[2] + 0.1;
  h.box(wx, PAD_Y, -8.25, 0.2, 1.15, 2.5, PALETTE.shield);
  h.box(wx, PAD_Y + 2.0, -8.25, 0.2, 0.4, 2.5, PALETTE.shield);
  h.box(wx, PAD_Y + 1.15, -9.3, 0.2, 0.85, 0.4, PALETTE.shield);
  h.box(wx, PAD_Y + 1.15, -7.425, 0.2, 0.85, 0.85, PALETTE.shield);
  h.box(wx, PAD_Y + 1.15, -8.475, 0.04, 0.85, 1.25, 'glass');
  for (const y of [1.13, 1.98])
    h.box(wx, PAD_Y + y, -8.475, 0.24, 0.04, 1.29, PALETTE.optics);
  h.box(
    (west + wx + 0.1) / 2,
    PAD_Y,
    -9.4,
    wx + 0.1 - west,
    2.4,
    0.2,
    PALETTE.shield,
  );
  h.box(12.45, fl, -8.45, 0.5, 0.7, 1.5, PALETTE.wallWarm);
  h.box(12.45, fl + 0.7, -8.45, 0.54, 0.03, 1.54, PALETTE.wood);
  for (const dz of [-0.3, 0.3])
    h.box(12.6, fl + 0.75, -8.45 + dz, 0.04, 0.3, 0.46, 'screen');
  h.box(12.32, fl + 0.73, -8.45, 0.16, 0.02, 0.42, PALETTE.optics);
  h.box(cx, fl + 0.37, cz, 0.46, 0.08, 0.46, PALETTE.optics);
  h.box(cx - 0.22, fl + 0.45, cz, 0.05, 0.46, 0.44, PALETTE.optics);
  // Lead aprons on pegs along the alcove's outer face, turned to the room.
  h.box(wx + 0.12, PAD_Y + 1.74, -7.42, 0.04, 0.04, 0.72, PALETTE.deviceTrim);
  PALETTE.aprons.forEach((color, i) => {
    const apron = h.box(
      wx + 0.17 + i * 0.03,
      PAD_Y + 0.9,
      -7.66 + i * 0.24,
      0.04,
      0.82,
      0.34,
      color,
    );
    apron.rotation.y = -0.5;
  });
  // Upright detector against the back wall.
  h.box(tx, fl, -11.48, 0.2, 2.2, 0.14, PALETTE.device);
  h.box(tx, fl + 1.0, -11.36, 0.6, 0.6, 0.12, PALETTE.device);
  h.box(tx, fl + 1.08, -11.295, 0.42, 0.42, 0.01, PALETTE.optics);
}
/**
 * The partner center while its facility instance loads (or if it fails): the
 * stamped footprint from the generated summary, extruded to one storey under
 * a flat roof. Nothing when there is no current summary.
 */
function buildPartnerMassing(s: CareSetting, h: Ctx) {
  for (const poly of instanceSummary(s)?.footprint ?? []) {
    h.patch(poly, PAD_Y, 3.2, PALETTE.wallWarm);
    h.patch(poly, PAD_Y + 3.2, 0.18, PALETTE.roof);
  }
}
/**
 * Grounds around the stamped building: trees at the pad's back corners and
 * beside the wings, and in front of the wings, either side of the entry
 * pavilion, planting beds with low shrubs and a bench facing the drive.
 */
function buildPartnerGrounds(s: CareSetting, h: Ctx) {
  const a = (k: string) => toLocal(s, s.anchors[k]);
  for (const k of ['bedWest', 'bedEast']) {
    const [x, z] = a(k);
    h.box(x, PAD_Y, z, 4.2, 0.1, 0.9, PALETTE.planting);
    for (let i = 0; i < 5; i++)
      h.tree(x - 1.6 + i * 0.8, z + (i % 2 ? 0.12 : -0.12), 0.32, 0.22, i);
  }
  const [bx, bz] = a('bench');
  h.box(bx, PAD_Y, bz, 1.8, 0.45, 0.5, PALETTE.wood);
  h.box(bx, PAD_Y + 0.45, bz - 0.22, 1.8, 0.4, 0.06, PALETTE.wood);
  for (const dx of [-0.8, 0.8])
    h.box(bx + dx, PAD_Y, bz, 0.08, 0.6, 0.5, PALETTE.dark);
  ['treeA', 'treeB', 'treeC', 'treeD'].forEach((k, i) => {
    const [x, z] = a(k);
    h.tree(x, z, i < 2 ? 1.6 : 1.4, i < 2 ? 3.1 : 2.8, i);
  });
}
type Builder = (s: CareSetting, h: Ctx) => void;
/** Per kind: the building massing (replaced by a stamped facility) and the site around it. */
const BUILDERS: Partial<
  Record<CareSetting['kind'], { massing?: Builder; site?: Builder }>
> = {
  home: { massing: buildHouse, site: buildHomeSite },
  pharmacy: { massing: buildPharmacy },
  hospital: { massing: buildHospital },
  specialist: { massing: buildSpecialist },
  'partner-adc': { massing: buildPartnerMassing, site: buildPartnerGrounds },
};
/**
 * A complete pad for one setting, placed in the world: ground, `site` and
 * (unless `massing: false`) `massing` groups under `local`, and the label
 * plate in world space.
 */
export function buildCareSetting(
  setting: CareSetting,
  mat: Mat,
  opts: { massing?: boolean } = {},
) {
  const root = new T.Group();
  root.name = `care-setting-${setting.id}`;
  root.userData = {
    settingId: setting.id,
    kind: setting.kind,
    accuracy: 'Illustrative massing; not a survey.',
  };
  const local = new T.Group();
  local.name = 'local';
  local.position.set(setting.position[0], 0, setting.position[1]);
  local.rotation.y = setting.heading;
  root.add(local);
  buildGround(setting, helpers(setting, local, mat));
  const builders = BUILDERS[setting.kind];
  for (const part of ['massing', 'site'] as const) {
    const build = builders?.[part];
    if (!build || (part === 'massing' && opts.massing === false)) continue;
    const g = new T.Group();
    g.name = part;
    local.add(g);
    build(setting, helpers(setting, g, mat));
  }
  // Label plate in world space, readable from the default camera.
  const [lx, lz] = setting.anchors.label;
  const plateHost = helpers(setting, root, mat);
  plateHost.label(lx, lz, 0);
  return root;
}
