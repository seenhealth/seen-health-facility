import * as T from 'three';
import { ARRIVAL } from './arrival';

/**
 * Night lighting for the live lot: cobra-head street lamps on Valley Blvd and
 * Ethel Avenue, a light on the alley's utility pole, wall packs on the lot
 * faces of the building, a fixture over every entrance, and the building's
 * own windows and glass doors glowing with the interior lit, with a spill of
 * light out of the lobby door and the Valley Blvd portals onto the paving, and
 * the SEEN HEALTH channel letters over the drop-off and on Valley Blvd lit from inside.
 * `apply(night)` fades it all in as the daylight module's night factor rises
 * from 0 (day) to 1 (past civil dusk); by day every light is off and skipped
 * by the renderer. Axes: +x east, +z south (frame.ts COMPASS), ground at y = −0.23.
 */
const GROUND = ARRIVAL.streetY;
/** Warm LED white for the fixtures and the interior; amber for the sodium cobra heads on the public street. */
const COLOR = {
  street: '#ffc88a',
  fixture: '#ffe6c0',
  interior: '#ffd9a4',
  glow: '#fff1cf',
};

type Fade = { light: T.Light; max: number };

export function createNightLights(
  scene: T.Scene,
  material: (id: string) => T.MeshStandardMaterial,
) {
  const root = new T.Group();
  root.name = 'night-lights';
  scene.add(root);
  const fades: Fade[] = [];
  const grey = new T.MeshStandardMaterial({
    color: '#7f8688',
    roughness: 0.6,
    metalness: 0.3,
  });
  const dark = new T.MeshStandardMaterial({ color: '#3a3f41', roughness: 0.7 });
  /** Lamp heads and fixture lenses: one shared material whose emission follows the night factor. */
  const lens = new T.MeshStandardMaterial({
    color: '#f7f2e6',
    roughness: 0.5,
    emissive: COLOR.glow,
    emissiveIntensity: 0,
  });
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
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const spot = (
    from: [number, number, number],
    to: [number, number, number],
    max: number,
    color: string,
    angle: number,
    distance: number,
  ) => {
    const light = new T.SpotLight(color, 0, distance, angle, 0.65, 1.6);
    light.position.set(...from);
    light.target.position.set(...to);
    light.castShadow = false;
    light.visible = false;
    root.add(light, light.target);
    fades.push({ light, max });
    return light;
  };
  const point = (
    at: [number, number, number],
    max: number,
    color: string,
    distance: number,
  ) => {
    const light = new T.PointLight(color, 0, distance, 1.8);
    light.position.set(...at);
    light.castShadow = false;
    light.visible = false;
    root.add(light);
    fades.push({ light, max });
    return light;
  };

  // Street lamps: 7.5 m galvanised pole, 2 m arm reaching over the road, cobra head.
  function streetLamp(x: number, z: number, dir: [number, number]) {
    const g = new T.Group();
    g.name = 'street-lamp';
    root.add(g);
    const pole = new T.Mesh(new T.CylinderGeometry(0.075, 0.11, 7.5, 10), grey);
    pole.position.set(x, GROUND + 3.75, z);
    pole.castShadow = true;
    g.add(pole);
    const [dx, dz] = dir;
    const ax = x + dx * 1.0,
      az = z + dz * 1.0;
    const arm = new T.Mesh(
      new T.BoxGeometry(dx ? 2.0 : 0.08, 0.08, dz ? 2.0 : 0.08),
      grey,
    );
    arm.position.set(ax, GROUND + 7.45, az);
    g.add(arm);
    const hx = x + dx * 2.0,
      hz = z + dz * 2.0;
    box(g, hx, GROUND + 7.3, hz, dx ? 0.72 : 0.3, 0.14, dz ? 0.72 : 0.3, dark);
    box(g, hx, GROUND + 7.27, hz, dx ? 0.5 : 0.22, 0.03, dz ? 0.5 : 0.22, lens);
    spot(
      [hx, GROUND + 7.25, hz],
      [hx + dx * 1.5, GROUND, hz + dz * 1.5],
      90,
      COLOR.street,
      0.95,
      34,
    );
  }
  // Valley Blvd runs along the north; the trees stand at z 30.2, the lamps just past them with the arm over the road.
  // The one by the Ethel corner (Street View, May 2025) stands a little back from the curb, just east of the hydrant.
  streetLamp(-26.6, 30.75, [0, 1]);
  // On the sidewalk 0.45 m in from the curb (z 31.19), not on the curb line.
  for (const x of [-4, 20]) streetLamp(x, 30.75, [0, 1]);
  // Ethel Avenue on the west, behind the parkway lawn.
  // On the walk 0.35 m in from the curb (x -35.21), between the parkway trees (z -15.5, -9.5 ... 8, 20.5).
  for (const z of [-12.5, 14.3]) streetLamp(-34.85, z, [-1, 0]);
  // The alley's utility pole carries a street light on a short arm.
  {
    const g = new T.Group();
    g.name = 'alley-pole-light';
    root.add(g);
    const arm = new T.Mesh(new T.BoxGeometry(1.4, 0.07, 0.07), grey);
    arm.position.set(-33.9, GROUND + 6.9, -36.3);
    g.add(arm);
    box(g, -33.3, GROUND + 6.78, -36.3, 0.5, 0.12, 0.26, dark);
    box(g, -33.3, GROUND + 6.75, -36.3, 0.36, 0.03, 0.18, lens);
    spot(
      [-33.3, GROUND + 6.74, -36.3],
      [-31.5, GROUND, -34.5],
      55,
      COLOR.street,
      0.95,
      28,
    );
  }

  // Wall packs: a small hooded fixture high on the wall, throwing light down and out across the lot.
  function wallPack(x: number, y: number, z: number, out: [number, number]) {
    const g = new T.Group();
    g.name = 'wall-pack-light';
    root.add(g);
    const [ox, oz] = out;
    box(
      g,
      x + ox * 0.12,
      y,
      z + oz * 0.12,
      ox ? 0.22 : 0.42,
      0.2,
      oz ? 0.22 : 0.42,
      dark,
    );
    box(
      g,
      x + ox * 0.2,
      y - 0.02,
      z + oz * 0.2,
      ox ? 0.1 : 0.3,
      0.06,
      oz ? 0.1 : 0.3,
      lens,
    );
    spot(
      [x + ox * 0.25, y, z + oz * 0.25],
      [x + ox * 4.5, GROUND, z + oz * 4.5],
      40,
      COLOR.fixture,
      1.0,
      22,
    );
  }
  // Lobby and clinic west walls face the lot (x = −14.65 / −14.78); the wing's north face (z = 8.9) looks over the drop-off lane.
  wallPack(-14.7, 3.6, 4.2, [-1, 0]);
  wallPack(-14.8, 3.6, -9, [-1, 0]);
  wallPack(-14.8, 3.6, -18, [-1, 0]);
  wallPack(-21.5, 4.4, 8.95, [0, 1]);
  wallPack(-24.5, 4.6, 8.95, [0, 1]);
  // The clinic's service door on the alley (its wall pack, photo 2026-10-03) and the east exit.
  wallPack(-5.673, 2.72, -22.75, [0, -1]);
  wallPack(15.3, 2.7, -0.8, [1, 0]);

  // Entrance fixtures: a flush downlight under each canopy or header.
  function doorLight(x: number, y: number, z: number, max = 14) {
    const g = new T.Group();
    g.name = 'entrance-light';
    root.add(g);
    box(g, x, y - 0.06, z, 0.32, 0.06, 0.32, dark);
    box(g, x, y - 0.08, z, 0.22, 0.02, 0.22, lens);
    point([x, y - 0.12, z], max, COLOR.fixture, 9);
  }
  doorLight(-15.15, 2.35, ARRIVAL.door[1]); // lobby sliding door, under its header
  doorLight(-27.38, 2.25, 8.75); // the wing's lot-side awning door
  for (const x of [-12.9, -6.3]) doorLight(x, 3.1, 25.75); // Valley Blvd portals
  doorLight(1.6, 2.85, 28.4); // admin stair door

  // Interior light spilling out of the glass doors onto the landing and the terrace.
  spot(
    [-14.2, 2.1, ARRIVAL.door[1]],
    [-18.5, GROUND, ARRIVAL.door[1] - 0.4],
    30,
    COLOR.interior,
    0.72,
    14,
  );
  for (const x of [-12.9, -6.3])
    spot([x, 2.2, 24.9], [x, GROUND, 30], 24, COLOR.interior, 0.72, 12);

  // Windows and glass doors: the envelope draws each opening as a thin pane in `om-glass`; give those panes, and the
  // lobby's sliding leaves, a shared glowing copy so the interior reads as lit. Done lazily on the first night frame,
  // since the scene is still assembling when the layer is created.
  const glass = material('om-glass');
  const glow = glass.clone();
  glow.emissive = new T.Color(COLOR.interior);
  glow.emissiveIntensity = 0;
  const leafGlow = new T.MeshStandardMaterial({
    color: '#d4e0df',
    roughness: 0.76,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    emissive: COLOR.interior,
    emissiveIntensity: 0,
  });
  // The two SEEN HEALTH 见心颐养 signs (channel letters over the drop-off canopy and on the Valley Blvd face) are lit
  // from inside at night: their lettering layers (the cut-out planes with alphaTest, not the printed shadow) get a
  // glowing copy of their material whose emission is the lettering texture itself, so only the letters and the mark glow.
  // The photo assets arrive after the first night frame, so this keeps looking for a minute until both signs are lit.
  const SIGNS = ['dropoff-bilingual-sign', 'valley-bilingual-sign'];
  const signGlows = new Map<T.Material, T.MeshStandardMaterial>();
  const litSigns = new Set<string>();
  let signTries = 0;
  function lightSigns() {
    for (const name of SIGNS) {
      if (litSigns.has(name)) continue;
      const sign = scene.getObjectByName(name);
      if (!sign) continue;
      litSigns.add(name);
      sign.traverse((o) => {
        if (!(o instanceof T.Mesh)) return;
        const m = o.material as T.MeshStandardMaterial;
        if (
          !(m instanceof T.MeshStandardMaterial) ||
          !m.map ||
          m.alphaTest < 0.5
        )
          return;
        let lit = signGlows.get(m);
        if (!lit) {
          lit = m.clone();
          lit.emissive = new T.Color('#fff4dc');
          lit.emissiveMap = m.map;
          lit.emissiveIntensity = 0;
          signGlows.set(m, lit);
        }
        o.material = lit;
      });
    }
    if (litSigns.size < SIGNS.length && signTries++ < 120)
      setTimeout(lightSigns, 500);
  }
  let reglazed = false;
  function reglaze() {
    reglazed = true;
    scene.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      if (o.material === glass) o.material = glow;
      else if (
        ((o.parent?.name ?? '').startsWith('sliding-entry-leaf-') ||
          o.parent?.name === 'lobby-window-glass' ||
          o.parent?.name === 'corner-window-glass') &&
        (o.material as T.Material).transparent
      )
        o.material = leafGlow;
    });
    lightSigns();
  }

  let last = -1;
  return {
    /** 0 = day, 1 = night; everything scales with it and switches off (and out of the shader) at 0. */
    apply(night: number) {
      const k = Math.min(1, Math.max(0, night));
      if (k === last) return;
      last = k;
      if (k > 0 && !reglazed) reglaze();
      for (const { light, max } of fades) {
        light.intensity = max * k;
        light.visible = k > 0.02;
      }
      lens.emissiveIntensity = 2.2 * k;
      glow.emissiveIntensity = 1.7 * k;
      leafGlow.emissiveIntensity = 1.3 * k;
      for (const lit of signGlows.values()) lit.emissiveIntensity = 2.6 * k;
      // Lit glass reads brighter and warmer than the daytime sky reflection.
      glow.opacity = T.MathUtils.lerp(glass.opacity, 0.88, k);
    },
    get night() {
      return Math.max(0, last);
    },
    dispose() {
      scene.remove(root);
    },
  };
}
