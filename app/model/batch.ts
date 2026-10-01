import * as T from 'three';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Draw-call reduction: merge every mesh under a group into one mesh per
 * material bucket, in the group's own space.
 *
 * - Default (`canonical: false`): one bucket per material object. This is the
 *   renderer's per-furniture batching: other children are dropped, and merged
 *   meshes cast and receive shadows.
 * - `canonical: true`: materials that look the same (type, colour, roughness,
 *   metalness, opacity, transparency, side, map, emissive) share a bucket, so a
 *   whole building collapses to a few dozen draw calls. The bucket keeps the
 *   first such material, preferring one in `keep` (materials owned by a cache,
 *   which are never disposed here); the others are disposed. Hidden meshes are
 *   dropped, lines are merged into one `LineSegments` per material, and any
 *   other child is kept in place. Merged meshes cast (receive) shadows when one
 *   of their sources did and do not update their matrices.
 */
export function mergeByMaterial(
  group: T.Group,
  opts: { canonical?: boolean; keep?: ReadonlySet<T.Material> } = {},
): void {
  if (opts.canonical) mergeCanonical(group, opts.keep ?? new Set());
  else mergeByIdentity(group);
}

function mergeByIdentity(group: T.Group) {
  const meshes: T.Mesh[] = [];
  group.traverse((o) => {
    if (o instanceof T.Mesh && !Array.isArray(o.material)) meshes.push(o);
  });
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert(),
    buckets = new Map<T.Material, T.BufferGeometry[]>();
  for (const m of meshes) {
    const geo = m.geometry
      .clone()
      .applyMatrix4(inverse.clone().multiply(m.matrixWorld));
    const key = m.material as T.Material;
    (buckets.get(key) || buckets.set(key, []).get(key)!).push(
      geo.index ? geo.toNonIndexed() : geo,
    );
  }
  group.clear();
  buckets.forEach((gs, ma) => {
    const geo = mergeGeometries(gs);
    if (geo) {
      const merged = new T.Mesh(mergeVertices(geo, 0.000001), ma);
      merged.castShadow = true;
      merged.receiveShadow = true;
      group.add(merged);
      geo.dispose();
    }
    gs.forEach((g) => g.dispose());
  });
  meshes.forEach((m) => m.geometry.dispose());
}

/** Bucket key: everything that changes how a standard material draws. */
function materialKey(m: T.Material) {
  const s = m as T.MeshStandardMaterial;
  return [
    m.type,
    s.color?.getHexString() ?? '',
    s.roughness ?? '',
    s.metalness ?? '',
    m.opacity,
    m.transparent,
    m.side,
    s.map?.uuid ?? '',
    s.emissive?.getHexString() ?? '',
    s.emissiveIntensity ?? '',
    s.normalMap?.uuid ?? '',
    m.vertexColors,
    m.alphaTest,
    m.depthWrite,
    m.polygonOffset,
  ].join('|');
}
const ATTRIBUTES = ['position', 'normal', 'uv'] as const;
/** A non-indexed copy in group space with exactly position, normal and uv. */
function normalise(m: T.Mesh, toGroup: T.Matrix4) {
  let geo = m.geometry.clone();
  geo.applyMatrix4(toGroup);
  if (geo.index) {
    const flat = geo.toNonIndexed();
    geo.dispose();
    geo = flat;
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv)
    geo.setAttribute(
      'uv',
      new T.Float32BufferAttribute(geo.attributes.position.count * 2, 2),
    );
  for (const name of Object.keys(geo.attributes))
    if (!(ATTRIBUTES as readonly string[]).includes(name))
      geo.deleteAttribute(name);
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}
type Bucket = {
  material: T.Material;
  geometries: T.BufferGeometry[];
  sources: string[];
  cast: boolean;
  receive: boolean;
};
function sourceName(o: T.Object3D, group: T.Group) {
  for (let p: T.Object3D | null = o; p && p !== group; p = p.parent)
    if (p.userData.id || p.name) return String(p.userData.id || p.name);
  return o.type;
}
function mergeCanonical(group: T.Group, keep: ReadonlySet<T.Material>) {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert(),
    meshes: T.Mesh[] = [],
    hidden: (T.Mesh | T.Line)[] = [],
    lines: T.Line[] = [],
    others: T.Object3D[] = [];
  const shown = (o: T.Object3D) => {
    for (let p: T.Object3D | null = o; p && p !== group; p = p.parent)
      if (!p.visible) return false;
    return true;
  };
  group.traverse((o) => {
    if (o === group) return;
    if (o instanceof T.Mesh) {
      if (!shown(o)) hidden.push(o);
      else if (Array.isArray(o.material)) others.push(o);
      else meshes.push(o);
    } else if (o instanceof T.Line) {
      if (shown(o)) lines.push(o);
      else hidden.push(o);
    } else if (!(o instanceof T.Group) && o.type !== 'Object3D') others.push(o);
  });
  // Unmergeable objects keep their place in group space.
  for (const o of others) {
    const matrix = inverse.clone().multiply(o.matrixWorld);
    o.removeFromParent();
    matrix.decompose(o.position, o.quaternion, o.scale);
  }
  const buckets = new Map<string, Bucket>();
  const replaced = new Set<T.Material>();
  for (const m of meshes) {
    const material = m.material as T.Material,
      key = materialKey(material);
    let b = buckets.get(key);
    if (!b)
      buckets.set(
        key,
        (b = {
          material,
          geometries: [],
          sources: [],
          cast: false,
          receive: false,
        }),
      );
    else if (b.material !== material) {
      if (!keep.has(b.material) && keep.has(material)) {
        replaced.add(b.material);
        b.material = material;
      } else replaced.add(material);
    }
    b.geometries.push(normalise(m, inverse.clone().multiply(m.matrixWorld)));
    b.sources.push(sourceName(m, group));
    b.cast ||= m.castShadow;
    b.receive ||= m.receiveShadow;
  }
  // Lines become one LineSegments per material.
  const segments = new Map<
    string,
    { material: T.Material; points: number[] }
  >();
  for (const l of lines) {
    const material = l.material as T.Material,
      key = materialKey(material),
      p = l.geometry.attributes.position,
      toGroup = inverse.clone().multiply(l.matrixWorld),
      v = new T.Vector3();
    let s = segments.get(key);
    if (!s) segments.set(key, (s = { material, points: [] }));
    else if (s.material !== material) replaced.add(material);
    const at = (i: number) => v.fromBufferAttribute(p, i).applyMatrix4(toGroup).toArray();
    const step = l instanceof T.LineSegments ? 2 : 1;
    for (let i = 0; i + 1 < p.count; i += step)
      s.points.push(...at(i), ...at(i + 1));
    if (l instanceof T.LineLoop && p.count > 2)
      s.points.push(...at(p.count - 1), ...at(0));
  }
  for (const o of [...meshes, ...lines, ...hidden]) {
    o.geometry.dispose();
    o.removeFromParent();
  }
  for (const o of hidden) {
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (!keep.has(m)) replaced.add(m);
  }
  // Empty groups left behind.
  for (const child of group.children.slice())
    if (!others.includes(child)) child.removeFromParent();
  const used = new Set<T.Material>();
  for (const b of buckets.values()) {
    let merged: T.BufferGeometry | null;
    try {
      merged = mergeGeometries(b.geometries);
    } catch {
      merged = null;
    }
    if (!merged)
      throw new Error(
        `mergeByMaterial: could not merge ${b.geometries.length} meshes of ${b.material.type} #${(b.material as T.MeshStandardMaterial).color?.getHexString()} (${[...new Set(b.sources)].slice(0, 12).join(', ')})`,
      );
    const mesh = new T.Mesh(mergeVertices(merged, 1e-6), b.material);
    merged.dispose();
    b.geometries.forEach((g) => g.dispose());
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    used.add(b.material);
    group.add(mesh);
  }
  for (const s of segments.values()) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(s.points, 3));
    used.add(s.material);
    group.add(new T.LineSegments(geo, s.material));
  }
  for (const o of others) group.add(o);
  for (const m of replaced) if (!used.has(m) && !keep.has(m)) m.dispose();
  group.updateMatrixWorld(true);
  for (const child of group.children) child.matrixAutoUpdate = false;
}
