import * as T from 'three';
import { floorShapes, type FloorOpening } from './floor-geometry';
import { WALL_CAP } from './presentation';
import type { Room, Wall, Zone } from './schema';

/**
 * Floor and wall pieces of a facility, drawn the same way wherever a facility
 * is drawn: the viewer's own building (renderer.ts) and facility instances
 * stamped on community pads (facility-instance.ts). Geometry is in the
 * facility's own coordinates at the zone group's height; every mesh casts and
 * receives shadows.
 */
const DEFAULT_SLAB = 0.19;
function shaded(m: T.Mesh, y = 0) {
  m.position.set(0, y, 0);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
/** Floor UVs: one texture tile per 2 m, in plan. */
function planUV(geo: T.BufferGeometry) {
  const uv = geo.attributes.uv,
    p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
  return geo;
}
/** Concrete slab under a zone (floor openings cut out), its top 1 cm below the finish. */
export function zoneSlab(
  z: Zone,
  openings: FloorOpening[],
  material: T.Material,
): T.Mesh {
  const depth = z.slabDepth || DEFAULT_SLAB,
    geo = new T.ExtrudeGeometry(floorShapes(z.polygon, openings), {
      depth,
      bevelEnabled: false,
    });
  geo.rotateX(-Math.PI / 2);
  return shaded(new T.Mesh(geo, material), -depth - 0.01);
}
/** The zone's floor finish at the zone height. */
export function zoneFloor(
  z: Zone,
  openings: FloorOpening[],
  material: T.Material,
): T.Mesh {
  const geo = new T.ShapeGeometry(floorShapes(z.polygon, openings));
  geo.rotateX(-Math.PI / 2);
  return shaded(new T.Mesh(planUV(geo), material));
}
/** A room's own floor finish, 4 mm above its zone's floor. */
export function roomFinish(
  r: Room,
  openings: FloorOpening[],
  material: T.Material,
): T.Mesh {
  const geo = new T.ShapeGeometry(floorShapes(r.polygon, openings));
  geo.rotateX(-Math.PI / 2);
  return shaded(new T.Mesh(planUV(geo), material), 0.004);
}
/**
 * A traced wall stroke as a box `height` tall (its full height, or a cutaway
 * cut) and its 2 cm coping, which casts no shadow. `userData.height` is the
 * height the box was built at; the coping carries `userData.cap`.
 */
export function wallMeshes(
  w: Wall,
  mat: (id: string) => T.Material,
  height = w.height,
): [T.Mesh, T.Mesh] {
  const dx = w.b[0] - w.a[0],
    dz = w.b[1] - w.a[1],
    length = Math.hypot(dx, dz),
    angle = -Math.atan2(dz, dx),
    x = (w.a[0] + w.b[0]) / 2,
    z = (w.a[1] + w.b[1]) / 2;
  const wall = shaded(
    new T.Mesh(new T.BoxGeometry(length, height, w.thickness), mat(w.material)),
  );
  wall.position.set(x, height / 2, z);
  wall.rotation.y = angle;
  wall.userData = { id: w.id, height };
  const cap = shaded(
    new T.Mesh(
      new T.BoxGeometry(length + 0.004, 0.02, w.thickness + 0.006),
      mat(WALL_CAP),
    ),
  );
  cap.position.set(x, height + 0.01, z);
  cap.castShadow = false;
  cap.rotation.y = angle;
  cap.userData = { cap: true, height };
  return [wall, cap];
}
