import * as T from 'three';

/**
 * Photo-textured low-poly fleet van (RAM ProMaster 3500 159" EXT high roof in
 * Seen's livery), built in Blender from photographs of the real van by
 * scripts/fleet-van/build.sh. Same frame as the procedural `fleet-van` asset:
 * nose at −z, sliding doors on +x, tyre soles at y 0, inside the 2.25 × 6.35 m
 * footprint, floor at y 0.58 and the ramp sill where `FLEET_VAN_RAMP` puts it.
 *
 * Nodes the scene drives: `passenger-door-0` (front leaf, slides −z) and
 * `passenger-door-1` (rear leaf, +z), `driver-door` (pivot on its front edge),
 * `wheel-fl/fr/rl/rr` (local y is the axle, so `rotateY` rolls them), and the
 * lamp meshes `lamp-head`, `lamp-tail`, `lamp-brake`, `lamp-reverse`, whose
 * materials `addVanLamps` swaps for the lit ones.
 *
 * The GLB loads asynchronously; a page awaits `preloadFleetVanModel()` before
 * it builds vans, and until (or unless) it loads `buildArrivalVan` keeps the
 * procedural body.
 */
export const FLEET_VAN_MODEL_URL = '/models/fleet-van.glb';
export const FLEET_VAN_MODEL = {
  wheelRadius: 0.375,
  /** How far each twin-door leaf slides when fully open (leaves are 0.78 m wide). */
  doorSlide: 0.78,
};

let template: T.Object3D | null = null;
let pending: Promise<T.Object3D | null> | null = null;

export function preloadFleetVanModel(
  url = FLEET_VAN_MODEL_URL,
): Promise<T.Object3D | null> {
  pending ??= import('three/addons/loaders/GLTFLoader.js').then(
    async ({ GLTFLoader }) => {
      try {
        const gltf = await new GLTFLoader().loadAsync(url);
        template = prepare(gltf.scene);
      } catch (error) {
        console.warn(
          'Fleet van model did not load; procedural van kept.',
          error,
        );
      }
      return template;
    },
  );
  return pending;
}

/** A fresh copy of the loaded van (geometry and materials shared), or null before it has loaded. */
export function fleetVanModel(): T.Object3D | null {
  return template ? template.clone(true) : null;
}

function prepare(scene: T.Object3D) {
  scene.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const m = o.material as T.MeshStandardMaterial;
    if (m.transparent) {
      // See-through glazing, drawn after the body like the procedural van's.
      m.depthWrite = false;
      m.side = T.DoubleSide;
      o.renderOrder = 2;
      o.castShadow = false;
      o.receiveShadow = false;
    } else {
      o.castShadow = o.receiveShadow = !o.name.startsWith('lamp-');
    }
  });
  return scene;
}

/**
 * Generic full-size SUV and large sedan for the live lot (`live-cars.glb`,
 * scripts/fleet-van/build_cars.py): same frame and conventions as the van,
 * with nodes prefixed by kind (`suv-passenger-door`, `sedan-wheel-fl`, …) and
 * a white `car-paint` material the scene tints per car.
 */
export const LIVE_CARS_URL = '/models/live-cars.glb';
/** Body sizes and the rear kerb-side door of each model (local x, z of its sill), as built. */
export const LIVE_CAR_MODEL = {
  suv: {
    halfWidth: 1.02,
    halfLength: 2.875,
    wheelRadius: 0.41,
    doorZ: 0.55,
    beltY: 1.2,
    lampY: 1.0,
  },
  sedan: {
    halfWidth: 0.97,
    halfLength: 2.645,
    wheelRadius: 0.355,
    doorZ: 0.65,
    beltY: 0.95,
    lampY: 0.75,
  },
};
let cars: T.Object3D | null = null;
let carsPending: Promise<T.Object3D | null> | null = null;
export function preloadLiveCarModels(
  url = LIVE_CARS_URL,
): Promise<T.Object3D | null> {
  carsPending ??= import('three/addons/loaders/GLTFLoader.js').then(
    async ({ GLTFLoader }) => {
      try {
        const gltf = await new GLTFLoader().loadAsync(url);
        cars = prepare(gltf.scene);
      } catch (error) {
        console.warn(
          'Live car models did not load; procedural cars kept.',
          error,
        );
      }
      return cars;
    },
  );
  return carsPending;
}
/** A fresh copy of the `car-<kind>` model (geometry and materials shared), or null before it has loaded. */
export function liveCarModel(kind: 'suv' | 'sedan'): T.Object3D | null {
  const src = cars?.getObjectByName(`car-${kind}`);
  if (!src) return null;
  const copy = src.clone(true);
  copy.position.set(0, 0, 0);
  return copy;
}
