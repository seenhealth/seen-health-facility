import * as T from 'three';
import type { Vec2 } from './schema';
import {
  frontZ,
  LABEL_PLATE,
  LANE,
  lanePose,
  laneRadius,
  PAD_Y,
  PORCH_Y,
  streetZ,
  STREET_Y,
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
};
/**
 * The Wongs' porch slab in the home pad's local frame (centre and size): the
 * house's front wall stands on its back edge (z = −7.6), where the `door`
 * anchor is.
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
    const k = toLocalPoint(s, kerb);
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
function toLocalPoint(s: CareSetting, p: Vec2): Vec2 {
  const c = Math.cos(s.heading),
    sn = Math.sin(s.heading),
    dx = p[0] - s.position[0],
    dz = p[1] - s.position[1];
  return [dx * c - dz * sn, dx * sn + dz * c];
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
  const door = toLocalPoint(s, s.anchors.door);
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
  const a = (k: string) => toLocalPoint(s, s.anchors[k]);
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
  // Home-modification kit: a grab-bar crate, a toolbox and two bars leaning on it.
  const crate = a('crate');
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
  // Garden beds and trees at the pad corners.
  h.box(-11, PAD_Y, -10.5, 6, 0.08, 5, PALETTE.planting);
  h.box(11.5, PAD_Y, -11.5, 5, 0.08, 3.5, PALETTE.planting);
  h.tree(-12.4, -11.6, 1.7, 3.2, 0);
  h.tree(12.6, -12.2, 1.4, 2.8, 1);
  h.tree(-13.2, 9.8, 1.2, 2.6, 2);
  const st = toLocalPoint(s, s.anchors.stall);
  stall(h, st[0], st[1]);
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
  const bed = toLocalPoint(s, s.anchors.bed);
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
    local = toLocalPoint(s, bay.position),
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
function toLocalDir(s: CareSetting, d: Vec2): Vec2 {
  const c = Math.cos(s.heading),
    sn = Math.sin(s.heading);
  return [d[0] * c - d[1] * sn, d[0] * sn + d[1] * c];
}
function buildSpecialist(s: CareSetting, h: Ctx) {
  // Ground floor: glazed lobby and exam room under a solid upper storey.
  h.box(0, PAD_Y, -9.0, 22, 0.06, 7.2, PALETTE.paver);
  h.box(0, PAD_Y, -12.1, 22, 3.3, 1.0, PALETTE.wall);
  for (const x of [-10.5, 10.5])
    h.box(x, PAD_Y, -9.0, 1.0, 3.3, 7.2, PALETTE.wall);
  for (const x of [-3.9, 3.9, -7.6, 7.6])
    h.box(x, PAD_Y, -5.7, 0.26, 3.3, 0.26, PALETTE.metal);
  h.box(0, PAD_Y + 3.3, -9.0, 22.6, 3.6, 7.8, PALETTE.wall);
  h.windows(-11.0, 11.0, PAD_Y + 4.3, -5.06, 1.6, 2.2, 1.5);
  h.windowsZ(-12.6, -5.4, PAD_Y + 4.3, -11.34, 1.6, 2.2, 1.5);
  h.windowsZ(-12.6, -5.4, PAD_Y + 4.3, 11.34, 1.6, 2.2, 1.5);
  h.box(0, PAD_Y + 6.9, -9.0, 23.0, 0.3, 8.2, PALETTE.roof);
  h.box(0, PAD_Y + 3.05, -3.9, 6.4, 0.24, 3.2, PALETTE.roof);
  h.box(0, PAD_Y + 3.3, -2.35, 6.4, 0.5, 0.14, s.accent);
  // Partition between lobby and exam room; reception desk, waiting chairs, exam chair, desk.
  h.box(-2.2, PAD_Y, -9.3, 0.2, 3.3, 4.6, PALETTE.wall);
  h.box(3.2, PAD_Y, -8.6, 1.8, 1.05, 0.7, PALETTE.wood);
  for (const k of ['waitA', 'waitB']) {
    const p = toLocalPoint(s, s.anchors[k]);
    h.box(p[0], PAD_Y, p[1] + 0.1, 0.5, 0.45, 0.5, PALETTE.blanket);
    h.box(p[0], PAD_Y + 0.45, p[1] + 0.32, 0.5, 0.45, 0.06, PALETTE.blanket);
  }
  const exam = toLocalPoint(s, s.anchors.examSeat);
  h.box(exam[0], PAD_Y, exam[1], 0.7, 0.5, 0.7, PALETTE.blanket);
  h.box(exam[0], PAD_Y + 0.5, exam[1] - 0.32, 0.7, 0.7, 0.08, PALETTE.blanket);
  const desk = toLocalPoint(s, s.anchors.mdDesk);
  h.box(desk[0], PAD_Y, desk[1] - 0.85, 1.4, 0.75, 0.6, PALETTE.wood);
  h.tree(-13.0, 11.6, 1.5, 3.0, 0);
  h.tree(13.0, 11.2, 1.3, 2.8, 1);
  h.tree(13.2, -11.8, 1.2, 2.6, 2);
}
/**
 * The partner's own single-storey hall: the massing shown when no facility
 * instance is stamped on the pad (or while one loads).
 */
function buildPartnerHall(s: CareSetting, h: Ctx) {
  h.box(3, PAD_Y, -8.5, 16, 3.4, 8.2, PALETTE.wallWarm);
  pitchedRoof(h, -5, 11, -12.6, -4.4, PAD_Y + 3.4, 1.2, PALETTE.roof, 0.6);
  h.windows(-4.4, 0.6, PAD_Y + 1.0, -4.36, 1.4, 2.2, 1.4);
  h.windows(3.6, 10.4, PAD_Y + 1.0, -4.36, 1.4, 2.2, 1.4);
  h.box(2, PAD_Y, -4.36, 1.6, 2.2, 0.08, s.accent);
  h.box(2, PAD_Y + 2.5, -3.6, 3.6, 0.16, 1.8, PALETTE.roof);
}
/**
 * Grounds around the stamped building: the tai chi patio in the arrival
 * court's west half under a slatted awning (people stay visible from above),
 * a bench, a planting strip along the west edge and four trees.
 */
function buildPartnerGrounds(s: CareSetting, h: Ctx) {
  const a = (k: string) => toLocalPoint(s, s.anchors[k]);
  const [x0, z0] = a('patioMin'),
    [x1, z1] = a('patioMax'),
    cx = (x0 + x1) / 2,
    cz = (z0 + z1) / 2;
  h.box(cx, PAD_Y, cz, x1 - x0, 0.02, z1 - z0, PALETTE.paver);
  const postX = [x0 + 0.35, x1 - 0.35],
    postZ = [z0 + 0.35, cz, z1 - 0.35];
  for (const x of postX)
    for (const z of postZ) h.box(x, PAD_Y, z, 0.16, 2.9, 0.16, PALETTE.metal);
  for (const x of postX)
    h.box(x, PAD_Y + 2.9, cz, 0.14, 0.18, z1 - z0 - 0.4, PALETTE.metal);
  for (let z = z0 + 0.8; z < z1 - 0.5; z += 1.15)
    h.box(cx, PAD_Y + 3.08, z, x1 - x0 - 0.2, 0.05, 0.34, s.accent);
  const bench = a('bench');
  h.box(bench[0], PAD_Y, bench[1], 0.5, 0.45, 1.8, PALETTE.wood);
  const back = -s.pad.d / 2 - (s.pad.back ?? 0);
  h.box(
    -s.pad.w / 2 + 1,
    PAD_Y,
    (back + s.pad.d / 2) / 2,
    0.8,
    0.5,
    s.pad.d / 2 - back - 3,
    PALETTE.planting,
  );
  ['treeA', 'treeB', 'treeC', 'treeD'].forEach((k, i) => {
    const [x, z] = a(k);
    h.tree(x, z, i === 3 ? 1.4 : 1.6, i === 3 ? 2.8 : 3.1, i);
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
  'partner-adc': { massing: buildPartnerHall, site: buildPartnerGrounds },
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
