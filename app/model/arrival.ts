import * as T from 'three';
import { buildAsset } from './assets';
import {
  fleetParking,
  fleetVanLetter,
  extraVanWindows,
  sampleFleetVan,
} from './alhambra-fleet';
import { FLEET_VAN_CAB_DOOR, FLEET_VAN_RAMP } from './photo-assets';
import type { Facility, Vec2 } from './schema';
export const ARRIVAL = {
  dock: [-20.5, 1.5] as Vec2,
  door: [-14.653121, -0.992] as Vec2,
  rampX: -15.518,
  rampBottomZ: 5.5,
  rampTopZ: -0.992,
  streetY: -0.23,
  vanFloorY: 0.35,
};
// Unload windows close once the last rider is off the ramp and the driver has
// stowed it, so the driver is back in the cab before the outbound trip starts
// (fleet-crew.ts times the ramp duty against these door/ramp curves).
export const vanWindows = [
  {
    id: 'van-a',
    name: 'Van A',
    inbound: [0, 36],
    unload: [42, 96],
    outbound: [112, 142],
    returning: [510, 546],
    boarding: [552, 590],
    leaving: [594, 624],
  },
  {
    id: 'van-b',
    name: 'Van B',
    inbound: [146, 166],
    unload: [172, 226],
    outbound: [242, 272],
    returning: [628, 656],
    boarding: [662, 702],
    leaving: [708, 720],
  },
];
const smooth = (a: number, b: number, x: number) =>
  T.MathUtils.smoothstep(x, a, b);
export const alhambraVanWindows = [...vanWindows, ...extraVanWindows];
export function sampleVan(index: number, time: number) {
  return sampleFleetVan(index, time, alhambraVanWindows);
}
export function buildArrival(
  model: Facility,
  material?: (id: string) => T.MeshStandardMaterial,
) {
  const root = new T.Group();
  root.name = 'arrival-workflow';
  const entry = new T.Group();
  entry.name = 'accessible-main-entrance';
  root.add(entry);
  const mat = (color: string, opacity = 1) =>
    new T.MeshStandardMaterial({
      color,
      roughness: 0.76,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    });
  // Pale concrete ramp, satin rails and a deep-green entrance header.
  const stone = mat('#e2ddd3'),
    silver = mat('#c4c7c4'),
    teal = mat('#1f4d3a'),
    glass = mat('#d4e0df', 0.36);
  const box = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: T.Material,
  ) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    o.position.set(x, y + h / 2, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const rod = (
    a: T.Vector3,
    b: T.Vector3,
    parent: T.Object3D,
    m = silver,
    r = 0.018,
  ) => {
    const o = new T.Mesh(new T.CylinderGeometry(r, r, a.distanceTo(b), 12), m);
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      b.clone().sub(a).normalize(),
    );
    o.castShadow = true;
    parent.add(o);
  };
  // A sloping approach and a level right-hand landing align with the existing west entrance.
  const length = ARRIVAL.rampBottomZ - ARRIVAL.rampTopZ,
    c = ARRIVAL.rampX;
  const ramp = box(
    entry,
    c,
    -0.29,
    (ARRIVAL.rampTopZ + ARRIVAL.rampBottomZ) / 2,
    1.28,
    0.1,
    Math.hypot(length, 0.23),
    stone,
  );
  ramp.position.y = -0.165;
  ramp.rotation.x = Math.atan2(0.23, length);
  ramp.name = 'main-wheelchair-ramp';
  box(entry, -15.13, -0.1, -0.992, 2.06, 0.1, 1.28, stone);
  for (const x of [c - 0.61, c + 0.61]) {
    const z1 = 5.5,
      z2 = x > c ? 0.25 : -0.99,
      y2 = -0.23 + (0.23 * (5.5 - z2)) / length;
    rod(new T.Vector3(x, 0.68, z1), new T.Vector3(x, y2 + 0.91, z2), entry);
    for (let i = 0; i <= 5; i++) {
      const z = z1 + ((z2 - z1) * i) / 5,
        y = -0.23 + (0.23 * (5.5 - z)) / length;
      rod(new T.Vector3(x, y, z), new T.Vector3(x, y + 0.91, z), entry);
    }
  }
  // East rail ends at the landing so the right turn into the door stays open.
  box(entry, -14.653, 2.2, -0.992, 0.16, 0.14, 1.49, teal);
  const leaves: T.Group[] = [];
  for (const sign of [-1, 1]) {
    const g = new T.Group();
    g.name = `sliding-entry-leaf-${sign}`;
    g.position.set(-14.653, 0, -0.992 + sign * 0.315);
    entry.add(g);
    box(g, 0, 0.04, 0, 0.035, 2.12, 0.615, glass);
    for (const z of [-0.307, 0.307])
      box(g, 0, 0.025, z, 0.06, 2.16, 0.025, silver);
    box(g, 0, 1.04, 0, 0.045, 0.06, 0.61, teal);
    leaves.push(g);
  }
  const materialFor =
    material ||
    ((id: string) =>
      new T.MeshStandardMaterial({
        color: model.materials[id]?.color || '#336e76',
        roughness: 0.75,
      }));
  const vans = fleetParking.map((_, i) => {
    const van = buildArrivalVan(model, fleetVanLetter(i), materialFor);
    root.add(van.root);
    return van;
  });
  // Paint real 6.9m van stalls around the parked vehicle footprints, in each
  // bay's own frame (local +z is the rear of the parked van).
  for (const bay of fleetParking) {
    const stall = new T.Group();
    stall.position.set(bay.x, 0, bay.z);
    stall.rotation.y = bay.heading;
    root.add(stall);
    for (const x of [-1.4, 1.4])
      box(stall, x, -0.208, 0, 0.07, 0.012, 6.9, mat('#ebe9dc'));
    box(stall, 0, -0.208, 3.45, 2.8, 0.012, 0.07, mat('#ebe9dc'));
    box(stall, 0, -0.19, 2.7, 1.8, 0.09, 0.14, mat('#d7c389'));
  }
  let doorOpen = 0;
  function tick(
    time: number,
    enabled: boolean,
    entryUsers: { x: number; z: number; visible: boolean }[] = [],
  ) {
    vans.forEach((v, i) => {
      const p = sampleVan(i, time);
      updateArrivalVan(v, p, enabled);
    });
    const nearest = Math.min(
      ...entryUsers
        .filter((p) => p.visible)
        .map((p) => Math.hypot(p.x - ARRIVAL.door[0], p.z - ARRIVAL.door[1])),
    );
    doorOpen = enabled ? 1 - smooth(0.7, 2.25, nearest) : 0;
    leaves.forEach(
      (g, i) =>
        (g.position.z = -0.992 + (i ? 1 : -1) * (0.315 + doorOpen * 0.65)),
    );
  }
  return {
    root,
    entry,
    vans,
    tick,
    sampleVan,
    focus: new T.Vector3(-22, 0, -3),
    getDoorOpen: () => doorOpen,
  };
}

/**
 * Shared fleet body, sliding passenger doors and folding ramp for every site,
 * in the livery of `variant` (a letter: 'A' for the first fleet van; see
 * `fleetVanLetter`). Van A uses the model's `fleet-van-a` spec, every other
 * letter `fleet-van-b` when the model has one.
 */
export function buildArrivalVan(
  model: Facility,
  variant: string,
  material: (id: string) => T.MeshStandardMaterial,
) {
  const letter = variant.toUpperCase();
  const spec =
    model.assets[`fleet-van-${letter === 'A' ? 'a' : 'b'}`] ||
    model.assets['fleet-van-a'];
  const root = buildAsset(
    {
      ...spec,
      parameters: { ...spec.parameters, variant: letter, operable: true },
    },
    material,
  );
  root.name = `animated-van-${letter.toLowerCase()}`;
  // Own copies of the body materials, so one van can fade out at the map edge
  // without touching the others (the renderer's section clones key on these).
  const copies = new Map<T.Material, T.Material>();
  const own = (m: T.Material) => {
    if (!copies.has(m)) copies.set(m, m.clone());
    return copies.get(m)!;
  };
  root.traverse((o) => {
    if (o instanceof T.Mesh)
      o.material = Array.isArray(o.material)
        ? o.material.map(own)
        : own(o.material);
  });
  const ramp = FLEET_VAN_RAMP;
  const pivot = new T.Group();
  pivot.position.set(...ramp.hinge);
  pivot.name = 'vehicle-ramp-hinge';
  root.add(pivot);
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const mesh = new T.Mesh(
      new T.BoxGeometry(w, h, d),
      new T.MeshStandardMaterial({ color, roughness: 0.76 }),
    );
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    pivot.add(mesh);
    return mesh;
  };
  const half = ramp.length / 2,
    edge = ramp.width / 2 + 0.01;
  box(half, -0.04, 0, ramp.length, 0.055, ramp.width, '#a8bab8').name =
    'deployable-wheelchair-ramp';
  for (const z of [-edge, edge])
    box(half, 0, z, ramp.length, 0.055, 0.035, '#25777c');
  for (let x = 0.15; x < ramp.length - 0.02; x += 0.17)
    box(x, 0.016, 0, 0.026, 0.006, ramp.width - 0.11, '#243f49');
  return {
    root,
    pivot,
    doors: [
      root.getObjectByName('passenger-door-0')!,
      root.getObjectByName('passenger-door-1')!,
    ],
    cabDoor: root.getObjectByName('driver-door') ?? null,
  };
}
/** What a van body needs from a vehicle sampler; fleet vans also fade and open the driver's door. */
export type VanPose = {
  position: T.Vector3;
  heading: number;
  visible: boolean;
  door: number;
  ramp: number;
  phase?: string;
  opacity?: number;
  cabDoor?: number;
};
/**
 * Fade a vehicle body toward `opacity` as it enters or leaves the map. The
 * body must own its materials (the fleet van copies them, community cars
 * build their own), so only that vehicle fades; shadows drop while it is
 * see-through. Shared by every vehicle that fades.
 */
export function fadeVehicle(body: T.Object3D, opacity: number) {
  if ((body.userData.opacity ?? 1) === opacity) return;
  body.userData.opacity = opacity;
  const fading = opacity < 1;
  body.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    o.userData.castShadow ??= o.castShadow;
    o.castShadow = !fading && o.userData.castShadow;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const base = (m.userData.fade ??= {
        opacity: m.opacity,
        transparent: m.transparent,
        depthWrite: m.depthWrite,
      });
      m.opacity = base.opacity * opacity;
      m.depthWrite = fading ? false : base.depthWrite;
      const transparent = base.transparent || fading;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
    }
  });
}
export function updateArrivalVan(
  van: ReturnType<typeof buildArrivalVan>,
  sample: VanPose,
  enabled: boolean,
  rampAngle = -Math.atan2(FLEET_VAN_RAMP.rise, FLEET_VAN_RAMP.run),
) {
  van.root.position.copy(sample.position);
  van.root.rotation.y = sample.heading;
  van.root.visible = enabled && sample.visible;
  fadeVehicle(van.root, sample.opacity ?? 1);
  van.pivot.visible = sample.ramp > 0.001;
  van.pivot.rotation.z = T.MathUtils.lerp(Math.PI / 2, rampAngle, sample.ramp);
  van.doors.forEach(
    (door, i) => (door.position.z = (i ? 1 : -1) * 0.6 * sample.door),
  );
  if (van.cabDoor)
    van.cabDoor.rotation.y =
      -FLEET_VAN_CAB_DOOR.openAngle * (sample.cabDoor ?? 0);
}
