import * as T from 'three';
import { buildAsset } from './assets';
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
export const vanWindows = [
  {
    id: 'van-a',
    name: 'Van A',
    inbound: [0, 36],
    unload: [42, 108],
    outbound: [112, 142],
    returning: [510, 546],
    boarding: [552, 590],
    leaving: [594, 624],
  },
  {
    id: 'van-b',
    name: 'Van B',
    inbound: [146, 166],
    unload: [172, 238],
    outbound: [242, 272],
    returning: [628, 656],
    boarding: [662, 702],
    leaving: [708, 720],
  },
];
const smooth = (a: number, b: number, x: number) =>
  T.MathUtils.smoothstep(x, a, b);
const inbound = new T.CatmullRomCurve3(
  [[-48, -30], [-44, -23], [-44, -3], [-39, 1.5], [-29, 1.5], ARRIVAL.dock].map(
    (p) => new T.Vector3(p[0], -0.23, p[1]),
  ),
  false,
  'catmullrom',
  0.1,
);
export function sampleVan(index: number, time: number) {
  const v = vanWindows[index],
    t = ((time % 720) + 720) % 720;
  let phase = 'Off-site',
    visible = false,
    progress = 0,
    reverse = false;
  for (const [range, label, back] of [
    [v.inbound, 'Arriving', false],
    [v.returning, 'Returning for pickup', false],
    [v.outbound, 'Leaving after drop-off', true],
    [v.leaving, 'Taking participants home', true],
  ] as const)
    if (t >= range[0] && t < range[1]) {
      phase = label;
      visible = true;
      progress = (t - range[0]) / (range[1] - range[0]);
      reverse = back;
    }
  const docked =
    (t >= v.inbound[1] && t < v.outbound[0]) ||
    (t >= v.returning[1] && t < v.leaving[0]);
  if (docked) {
    phase =
      t < v.outbound[0] ? 'Unloading & escort handoff' : 'Boarding for home';
    visible = true;
    progress = 1;
  }
  const u = reverse ? 1 - progress : progress,
    position = inbound.getPointAt(u),
    direction = inbound.getTangentAt(u),
    heading = Math.atan2(direction.x, direction.z) + Math.PI;
  let door = 0,
    ramp = 0;
  for (const [start, end] of [v.unload, v.boarding]) {
    door = Math.max(
      door,
      smooth(start - 5, start - 2, t) * (1 - smooth(end + 1, end + 4, t)),
    );
    ramp = Math.max(
      ramp,
      smooth(start - 2, start + 2, t) * (1 - smooth(end - 2, end + 1, t)),
    );
  }
  return { position, heading, visible, door, ramp, phase };
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
  const stone = mat('#c9c8b7'),
    silver = mat('#a8bab8'),
    teal = mat('#25777c'),
    glass = mat('#78b5ba', 0.32),
    black = mat('#243f49');
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
  const vans = vanWindows.map((v, i) => {
    const spec = model.assets[`fleet-van-${i ? 'b' : 'a'}`],
      g = buildAsset(
        { ...spec, parameters: { ...spec.parameters, operable: true } },
        materialFor,
      );
    g.name = `animated-${v.id}`;
    root.add(g);
    const pivot = new T.Group();
    pivot.position.set(1.035, 0.58, -0.19);
    pivot.name = 'vehicle-ramp-hinge';
    g.add(pivot);
    const deck = box(pivot, 1.48, -0.04, 0, 2.96, 0.055, 1.02, silver);
    deck.name = 'deployable-wheelchair-ramp';
    for (const z of [-0.52, 0.52])
      box(pivot, 1.48, 0, z, 2.96, 0.055, 0.035, teal);
    for (let x = 0.15; x < 2.94; x += 0.17)
      box(pivot, x, 0.016, 0, 0.026, 0.006, 0.91, black);
    return {
      root: g,
      pivot,
      doors: [
        g.getObjectByName('passenger-door-0')!,
        g.getObjectByName('passenger-door-1')!,
      ],
    };
  });
  let doorOpen = 0;
  function tick(
    time: number,
    enabled: boolean,
    entryUsers: { x: number; z: number; visible: boolean }[] = [],
  ) {
    vans.forEach((v, i) => {
      const p = sampleVan(i, time);
      v.root.position.copy(p.position);
      v.root.rotation.y = p.heading;
      v.root.visible = enabled && p.visible;
      v.pivot.visible = p.ramp > 0.001;
      v.pivot.rotation.z = T.MathUtils.lerp(
        Math.PI / 2,
        -Math.atan2(0.58, 2.9),
        p.ramp,
      );
      v.doors.forEach((d, j) => (d.position.z = (j ? 1 : -1) * 0.6 * p.door));
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
  return { root, entry, vans, tick, getDoorOpen: () => doorOpen };
}
