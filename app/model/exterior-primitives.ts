import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Vec2 } from './schema';

/** Model geometry only: reference photographs are never used as public textures. */
export function exteriorPrimitives() {
  const materials = new Map<string, T.MeshStandardMaterial>();
  const material = (color: string) => {
    if (!materials.has(color))
      materials.set(
        color,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.76,
          side: T.DoubleSide,
        }),
      );
    return materials.get(color)!;
  };
  function mesh(parent: T.Object3D, geometry: T.BufferGeometry, color: string) {
    const m = new T.Mesh(geometry, material(color));
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const m = mesh(parent, new T.BoxGeometry(w, h, d), color);
    m.position.set(x, y + h / 2, z);
    return m;
  }
  function beam(
    parent: T.Object3D,
    a: number[],
    b: number[],
    width: number,
    depth: number,
    color: string,
  ) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    const m = mesh(
      parent,
      new T.BoxGeometry(width, delta.length(), depth),
      color,
    );
    m.position.copy(start.add(end).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return m;
  }
  function patch(
    parent: T.Object3D,
    polygon: Vec2[],
    y: number,
    height: number,
    color: string,
  ) {
    const s = new T.Shape(polygon.map(([x, z]) => new T.Vector2(x, -z)));
    const geo = new T.ExtrudeGeometry(s, {
      depth: height,
      bevelEnabled: false,
    });
    geo.rotateX(-Math.PI / 2);
    const m = mesh(parent, geo, color);
    m.position.y = y;
    return m;
  }
  function group(parent: T.Object3D, name: string) {
    const g = new T.Group();
    g.name = name;
    parent.add(g);
    return g;
  }
  function tree(parent: T.Object3D, x: number, z: number, size = 1) {
    const g = group(parent, 'landscape-tree');
    box(g, x, 0, z, 0.18, 3.1 * size, 0.18, '#827465');
    for (let i = 0; i < 3; i++) {
      const m = mesh(
        g,
        new T.IcosahedronGeometry(1.15 * size, 1),
        ['#5f7c59', '#719268', '#80986e'][i],
      );
      m.position.set(
        x + Math.cos(i * 2.1) * 0.5 * size,
        3.2 * size + Math.sin(i) * 0.4,
        z + Math.sin(i * 2.1) * 0.5 * size,
      );
      m.scale.y = 1.15;
    }
  }
  // Merge within semantic groups, preserving group names for export/review.
  function batch(root: T.Group) {
    for (const child of [...root.children])
      if (child instanceof T.Group) batch(child);
    const buckets = new Map<T.Material, T.Mesh[]>();
    for (const child of root.children)
      if (child instanceof T.Mesh && !Array.isArray(child.material)) {
        const bucket = buckets.get(child.material) || [];
        bucket.push(child);
        buckets.set(child.material, bucket);
      }
    for (const [mat, items] of buckets) {
      if (items.length < 2) continue;
      const geometries = items.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index
          ? m.geometry.toNonIndexed()
          : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        g.deleteAttribute('uv');
        return g;
      });
      const merged = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (!merged) continue;
      const m = new T.Mesh(merged, mat);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
      for (const old of items) {
        root.remove(old);
        old.geometry.dispose();
      }
    }
  }
  return { box, beam, patch, group, mesh, tree, batch };
}
