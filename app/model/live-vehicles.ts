import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FLEET_VAN } from './alhambra-fleet';
import { LIVE_CAR_MODEL, liveCarModel } from './fleet-van-model';
import type { Vec2 } from './schema';

/**
 * Bodies and running lights for the live lot's sedans and SUVs, and the lamp
 * set every live vehicle (fleet vans included) gets for night driving.
 * Conventions follow the fleet van: the nose is at local −z, the passenger
 * (kerb) side is +x, soles of the tyres at y = 0. A sedan is a three-box
 * body (hood, cabin, trunk) with a rear passenger door hinged at its front
 * edge that swings out for boarding; an SUV is taller and longer-roofed with
 * rails and a tailgate, on bigger wheels.
 */
export type LiveCarKind = 'sedan' | 'suv';

/** Head, tail, brake and reverse lamps; the live lot sets their emission as the car drives, brakes and backs up. */
export type VehicleLamps = {
  head: T.MeshStandardMaterial;
  tail: T.MeshStandardMaterial;
  brake: T.MeshStandardMaterial;
  reverse: T.MeshStandardMaterial;
  /** Two spot lights ahead of the nose, lit while driving at night. */
  beams: T.SpotLight[];
};
export type LiveCar = {
  root: T.Group;
  /** Rear passenger door on the kerb side, hinged at its front edge: `rotation.y` 0 closed, `doorOpenAngle` open. */
  door: T.Group;
  doorOpenAngle: number;
  wheels: T.Object3D[];
  wheelRadius: number;
  lamps: VehicleLamps;
  /** Local (x, z) of the door sill and of a standing spot one step out from it. */
  sill: Vec2;
  foot: Vec2;
  /** Half the body's width and length, for walkers to keep clear of it. */
  halfWidth: number;
  halfLength: number;
};

const GLASS = '#5d7f8c',
  TYRE = '#1f2224',
  RIM = '#9ea5a8',
  TRIM = '#2a2d2f';

function lampMaterial(color: string, emissive: string) {
  return new T.MeshStandardMaterial({
    color,
    roughness: 0.35,
    emissive,
    emissiveIntensity: 0,
  });
}
/** The four lamp materials and two beams, shared by cars and the fleet vans' add-on lamps. */
export function makeLamps(): VehicleLamps {
  const beams = [0, 1].map(() => {
    const s = new T.SpotLight('#fff3dc', 0, 18, 0.55, 0.5, 1.4);
    s.castShadow = false;
    s.visible = false;
    return s;
  });
  return {
    head: lampMaterial('#f4f1e6', '#fff6dc'),
    tail: lampMaterial('#8c1d1d', '#ff3b2f'),
    brake: lampMaterial('#8c1d1d', '#ff2a1a'),
    reverse: lampMaterial('#e9e7e0', '#ffffff'),
    beams,
  };
}
/** Point the two beams out of the nose and down onto the road ahead; `nose` is the local z of the front face. */
export function aimBeams(
  root: T.Object3D,
  lamps: VehicleLamps,
  nose: number,
  y = 0.75,
  spread = 0.7,
) {
  lamps.beams.forEach((beam, i) => {
    const x = (i ? 1 : -1) * spread;
    beam.position.set(x, y, nose);
    beam.target.position.set(x * 1.6, -0.2, nose - 9);
    root.add(beam, beam.target);
  });
}
/**
 * Lamp pads for a fleet van body, which has painted lamps only: a pair of
 * headlamps, tail and brake lenses and reverse lamps, each a thin emissive
 * pad just proud of the body, so the van lights up like the cars at night.
 */
export function addVanLamps(root: T.Object3D): VehicleLamps {
  const lamps = makeLamps();
  // The photo-textured van (fleet-van-model.ts) has its own lamp meshes: light those instead of adding pads.
  const own: [string, T.MeshStandardMaterial][] = [
    ['lamp-head', lamps.head],
    ['lamp-tail', lamps.tail],
    ['lamp-brake', lamps.brake],
    ['lamp-reverse', lamps.reverse],
  ];
  let lit = 0;
  for (const [name, m] of own) {
    const mesh = root.getObjectByName(name);
    if (mesh instanceof T.Mesh) {
      mesh.material = m;
      lit++;
    }
  }
  if (lit === own.length) {
    aimBeams(root, lamps, -FLEET_VAN.halfLength - 0.02, 0.9, 0.78);
    return lamps;
  }
  const nose = -FLEET_VAN.halfLength - 0.02,
    rear = FLEET_VAN.halfLength + 0.02;
  const pad = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    m: T.Material,
  ) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, 0.025), m);
    mesh.position.set(x, y, z);
    root.add(mesh);
  };
  for (const side of [-1, 1]) {
    pad(side * 0.78, 0.91, nose, 0.42, 0.2, lamps.head);
    pad(side * 1.0, 1.55, rear, 0.13, 0.4, lamps.tail);
    pad(side * 1.0, 1.12, rear, 0.13, 0.3, lamps.brake);
    pad(side * 1.0, 0.86, rear, 0.13, 0.14, lamps.reverse);
  }
  aimBeams(root, lamps, nose, 0.9, 0.78);
  return lamps;
}

/**
 * The live lot's SUV or sedan: the generic full-size models (live-cars.glb) once they have loaded, painted
 * `accent`, else the procedural body below.
 */
export function buildLiveCar(kind: LiveCarKind, accent: string): LiveCar {
  const model = liveCarModel(kind);
  return model
    ? fromModel(kind, model, accent)
    : buildProceduralCar(kind, accent);
}
function fromModel(
  kind: LiveCarKind,
  model: T.Object3D,
  accent: string,
): LiveCar {
  const root = new T.Group();
  root.name = `live-${kind}`;
  root.add(model);
  const spec = LIVE_CAR_MODEL[kind];
  // Own copies of the materials, so one car can fade without the others; the paint takes the car's colour.
  const copies = new Map<T.Material, T.MeshStandardMaterial>();
  root.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const m = o.material as T.MeshStandardMaterial;
    if (!copies.has(m)) {
      const c = m.clone();
      if (m.name === 'car-paint') c.color.set(accent);
      copies.set(m, c);
    }
    o.material = copies.get(m)!;
  });
  const lamps = makeLamps();
  for (const [k, m] of [
    ['head', lamps.head],
    ['tail', lamps.tail],
    ['brake', lamps.brake],
    ['reverse', lamps.reverse],
  ] as const) {
    const mesh = root.getObjectByName(`${kind}-lamp-${k}`);
    if (mesh instanceof T.Mesh) mesh.material = m;
  }
  aimBeams(root, lamps, -spec.halfLength, spec.lampY, spec.halfWidth - 0.3);
  return {
    root,
    door: root.getObjectByName(`${kind}-passenger-door`) as T.Group,
    doorOpenAngle: 1.15,
    wheels: ['fl', 'fr', 'rl', 'rr'].map((w) =>
      root.getObjectByName(`${kind}-wheel-${w}`)!,
    ),
    wheelRadius: spec.wheelRadius,
    lamps,
    sill: [spec.halfWidth + 0.08, spec.doorZ],
    foot: [spec.halfWidth + 0.9, spec.doorZ],
    halfWidth: spec.halfWidth,
    halfLength: spec.halfLength,
  };
}
function buildProceduralCar(kind: LiveCarKind, accent: string): LiveCar {
  const root = new T.Group();
  root.name = `live-${kind}`;
  const cache = new Map<string, T.MeshStandardMaterial>();
  const mat = (color: string, roughness = 0.55, metalness = 0.25) => {
    const key = `${color}|${roughness}|${metalness}`;
    if (!cache.has(key))
      cache.set(
        key,
        new T.MeshStandardMaterial({ color, roughness, metalness }),
      );
    return cache.get(key)!;
  };
  const paint = mat(accent, 0.42, 0.35),
    glass = mat(GLASS, 0.18, 0.5),
    trim = mat(TRIM, 0.7, 0.1),
    tyre = mat(TYRE, 0.9, 0),
    rim = mat(RIM, 0.35, 0.7);
  const put = (
    parent: T.Object3D,
    geo: T.BufferGeometry,
    m: T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new T.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: T.Material,
  ) => put(parent, new T.BoxGeometry(w, h, d), m, x, y + h / 2, z);
  const rounded = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    r: number,
    m: T.Material,
  ) => put(parent, new RoundedBoxGeometry(w, h, d, 3, r), m, x, y + h / 2, z);
  const suv = kind === 'suv';
  // Overall: sedan 4.7 × 1.82 × 1.45 m; SUV 4.9 × 1.92 × 1.78 m.
  const W = suv ? 1.92 : 1.82,
    L = suv ? 4.9 : 4.7,
    wheelR = suv ? 0.37 : 0.32,
    floor = suv ? 0.34 : 0.26,
    belt = suv ? 1.05 : 0.86,
    roofY = suv ? 1.78 : 1.45;
  const nose = -L / 2,
    rear = L / 2;
  // Lower body: sills to belt line, with a slight tuck under the nose and tail.
  rounded(root, 0, floor, 0, W, belt - floor, L, 0.12, paint);
  box(root, 0, floor - 0.1, 0, W - 0.14, 0.12, L - 0.3, trim);
  // Hood and trunk sit a little below the belt so the cabin reads as a separate box.
  if (!suv) {
    box(root, 0, belt - 0.04, nose + 0.95, W - 0.1, 0.04, 1.75, paint);
    box(root, 0, belt - 0.03, rear - 0.6, W - 0.1, 0.03, 1.1, paint);
  }
  // Cabin: glass box with pillars, under a painted roof. The SUV's cabin runs to the tailgate.
  const cabZ0 = suv ? nose + 1.55 : nose + 1.85,
    cabZ1 = suv ? rear - 0.08 : rear - 1.25,
    cabL = cabZ1 - cabZ0,
    cabMid = (cabZ0 + cabZ1) / 2,
    cabW = W - 0.2,
    cabH = roofY - belt;
  rounded(root, 0, belt, cabMid, cabW, cabH, cabL, 0.08, glass);
  box(root, 0, roofY - 0.05, cabMid, cabW - 0.06, 0.06, cabL - 0.2, paint);
  // Pillars and the raked windscreen frame.
  for (const side of [-1, 1]) {
    for (const z of [cabZ0 + 0.3, cabMid, cabZ1 - 0.25])
      box(
        root,
        side * (cabW / 2 - 0.02),
        belt,
        z,
        0.05,
        cabH - 0.04,
        0.09,
        trim,
      );
    // Door mirror.
    box(
      root,
      side * (W / 2 + 0.06),
      belt + 0.06,
      cabZ0 + 0.35,
      0.14,
      0.1,
      0.16,
      paint,
    );
    // Door seams on the body.
    for (const z of suv ? [cabZ0 + 1.2, cabZ1 - 0.9] : [cabZ0 + 1.05, cabZ1])
      box(
        root,
        side * (W / 2 - 0.01),
        floor + 0.05,
        z,
        0.03,
        belt - floor - 0.1,
        0.012,
        trim,
      );
  }
  if (suv)
    for (const side of [-0.6, 0.6])
      box(root, side, roofY + 0.01, cabMid, 0.05, 0.05, cabL - 0.6, trim);
  // Bumpers, grille and plates.
  box(root, 0, floor - 0.02, nose + 0.06, W - 0.04, 0.3, 0.14, trim);
  box(root, 0, floor - 0.02, rear - 0.06, W - 0.04, 0.3, 0.14, trim);
  box(root, 0, floor + 0.3, nose - 0.005, W * 0.5, 0.2, 0.02, trim);
  // Wheels: tyre, rim, and a dark arch so the tyre reads as proud of the body.
  const wheels: T.Object3D[] = [];
  for (const side of [-1, 1])
    for (const z of [nose + 0.85, rear - 0.85]) {
      const w = new T.Group();
      w.position.set(side * (W / 2 - 0.1), wheelR, z);
      w.rotation.z = Math.PI / 2;
      root.add(w);
      put(w, new T.CylinderGeometry(wheelR, wheelR, 0.24, 20), tyre, 0, 0, 0);
      put(
        w,
        new T.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.26, 12),
        rim,
        0,
        0,
        0,
      );
      wheels.push(w);
      const arch = put(
        root,
        new T.CylinderGeometry(
          wheelR + 0.1,
          wheelR + 0.1,
          W - 0.16,
          18,
          1,
          true,
          0,
          Math.PI,
        ),
        trim,
        0,
        wheelR,
        z,
      );
      arch.rotation.z = Math.PI / 2;
    }
  // Lamps.
  const lamps = makeLamps();
  for (const side of [-1, 1]) {
    put(
      root,
      new T.BoxGeometry(0.4, 0.14, 0.04),
      lamps.head,
      side * (W / 2 - 0.32),
      belt - 0.12,
      nose + 0.01,
    );
    put(
      root,
      new T.BoxGeometry(0.34, 0.1, 0.03),
      lamps.tail,
      side * (W / 2 - 0.3),
      belt - 0.1,
      rear - 0.005,
    );
    put(
      root,
      new T.BoxGeometry(0.34, 0.06, 0.03),
      lamps.brake,
      side * (W / 2 - 0.3),
      belt - 0.2,
      rear - 0.005,
    );
    put(
      root,
      new T.BoxGeometry(0.14, 0.06, 0.03),
      lamps.reverse,
      side * (W / 2 - 0.62),
      belt - 0.2,
      rear - 0.005,
    );
  }
  if (suv)
    put(
      root,
      new T.BoxGeometry(0.5, 0.05, 0.03),
      lamps.brake,
      0,
      roofY - 0.1,
      rear - 0.005,
    );
  aimBeams(root, lamps, nose, belt - 0.1, W / 2 - 0.32);
  // Rear kerb-side door: body panel and window on a hinge at its front edge, swinging out by up to 65°.
  const door = new T.Group();
  door.name = 'passenger-door';
  const hingeZ = suv ? cabZ0 + 1.2 : cabZ0 + 1.05,
    doorL = suv ? 1.05 : 0.98;
  door.position.set(W / 2 - 0.01, 0, hingeZ);
  root.add(door);
  box(
    door,
    0.02,
    floor + 0.04,
    doorL / 2,
    0.05,
    belt - floor - 0.08,
    doorL - 0.04,
    paint,
  );
  box(door, 0.0, belt, doorL / 2, 0.035, cabH - 0.1, doorL - 0.1, glass);
  box(door, 0.04, belt + 0.02, doorL / 2, 0.03, 0.035, doorL - 0.1, trim);
  box(door, 0.045, belt - 0.26, doorL - 0.25, 0.02, 0.03, 0.14, trim);
  root.traverse((o) => {
    if (o instanceof T.Mesh) o.castShadow = o.receiveShadow = true;
  });
  return {
    root,
    door,
    doorOpenAngle: 1.15,
    wheels,
    wheelRadius: wheelR,
    lamps,
    sill: [W / 2 + 0.1, hingeZ + doorL / 2],
    foot: [W / 2 + 0.9, hingeZ + doorL / 2 + 0.1],
    halfWidth: W / 2 + 0.09,
    halfLength: L / 2,
  };
}

/** Running-light state for one frame. */
export function setLamps(
  lamps: VehicleLamps,
  state: {
    night: number;
    driving: boolean;
    braking: boolean;
    reversing: boolean;
    on: boolean;
  },
) {
  const { night, on } = state;
  const running = on ? night : 0;
  lamps.head.emissiveIntensity = running * 2.4;
  lamps.tail.emissiveIntensity = running * 1.6;
  lamps.brake.emissiveIntensity = on && state.braking ? 2.6 : running * 0.9;
  lamps.reverse.emissiveIntensity = on && state.reversing ? 2.2 : 0;
  const beam = on && state.driving && night > 0.25;
  for (const b of lamps.beams) {
    b.visible = beam;
    b.intensity = beam ? 16 * night : 0;
  }
}
