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
