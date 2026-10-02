import * as T from 'three';
import type { ActorSample, ActorSpec } from './activity';
import { isInspectable } from './asset-catalog';
import type { FacilityInstance, InstancePick } from './facility-instance';
import type { Instance } from './schema';

/**
 * What an info card is about: a person, a vehicle, or a piece of furniture of
 * the viewer's own facility or, with `settingId`, of a facility stamped on
 * that community setting.
 */
export type InspectTarget = {
  kind: 'person' | 'object' | 'vehicle';
  id: string;
  settingId?: string;
};
export const targetKey = (t: InspectTarget) =>
  `${t.kind}:${t.settingId ?? ''}:${t.id}`;
export const sameTarget = (
  a: InspectTarget | null | undefined,
  b: InspectTarget | null | undefined,
) => !!a && !!b && targetKey(a) === targetKey(b);

/** Something the pointer can land on, with what the highlight needs. */
export type Pickable = {
  target: InspectTarget;
  /** Tooltip: the name and a short second line (live: a vehicle's leg). */
  label: string;
  detail(): string;
  /** Halo on the ground: a ring for people, a rounded footprint otherwise. */
  shape: 'circle' | 'rect';
  /** Meshes to tint (people, the center's own furniture); null: draw corner brackets. */
  tint: T.Object3D | null;
  /** Writes the current box (own frame) and frame → world; false while not drawn. */
  place(box: T.Box3, frame: T.Matrix4): boolean;
  /** False for a rider in a vehicle seat: no ground halo inside the body. */
  grounded(): boolean;
};

type Person = {
  spec: ActorSpec;
  root: T.Object3D;
  mesh: T.Object3D;
  joints: Record<string, T.Object3D>;
  sample: ActorSample;
};
type CenterObject = {
  object: Instance;
  group: T.Object3D;
  inspectable: boolean;
  /** Cut by a section, like the building (site furniture is drawn whole). */
  clipped: boolean;
};
type Vehicle = { id: string; object: T.Object3D; clipped: boolean };
type Stamped = { settingId: string; instance: FacilityInstance };
/** The viewer's pickable world, as closures over the renderer's own objects. */
export type PickScene = {
  camera: T.Camera;
  /**
   * Active section plane (keep side: distance ≥ 0), or null. It cuts the
   * building, its people and the fleet vans; things drawn uncut (site
   * context, community pads and their vehicles) are picked whole.
   */
  section(): T.Plane | null;
  people: readonly Person[];
  /** Parent of every person (hidden in plan and exploded views). */
  peopleRoot: T.Object3D;
  /** The center's objects, each its own group. */
  objects: readonly CenterObject[];
  /** Roots whose visible meshes hide what lies behind them. */
  occluders(): readonly T.Object3D[];
  /** Subtrees left out of occlusion (furniture groups are candidates, not occluders). */
  skipOccluder(o: T.Object3D): boolean;
  /** Facilities stamped on community pads, by setting. */
  instances(): readonly Stamped[];
  /** Vehicle bodies under their registry ids. */
  vehicles(): readonly Vehicle[];
  /** Tooltip text for a target. */
  label(target: InspectTarget): { label: string; detail: () => string };
};

/** Person proxy in the rig's frame (metres before the height scale). */
const BODY = { x: 0.27, back: 0.24, front: 0.27, head: 0.14 };
/** A person wins over a surface at most this far in front of their proxy. */
const PERSON_SLACK = 0.05;
/** A box-only hit (the ray missed the furniture's own geometry) ranks behind exact hits. */
const BOX_ONLY = 0.35;
/** Things up to this far behind the first occluder still count (floor-level items). */
const OCCLUSION_SLACK = 0.06;
/** Center furniture boxes refined by an exact raycast, nearest first. */
const TOP = 4;

const visibleChain = (o: T.Object3D | null) => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};
const shownUnder = (o: T.Object3D, root: T.Object3D) => {
  for (let p: T.Object3D | null = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === root) return true;
  }
  return false;
};
/** Box of a group's meshes in the group's own frame. */
function ownBox(group: T.Object3D) {
  const inverse = new T.Matrix4(),
    relative = new T.Matrix4(),
    part = new T.Box3(),
    out = new T.Box3();
  group.updateWorldMatrix(true, true);
  inverse.copy(group.matrixWorld).invert();
  group.traverse((m) => {
    if (!(m instanceof T.Mesh)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    relative.multiplyMatrices(inverse, m.matrixWorld);
    out.union(part.copy(m.geometry.boundingBox!).applyMatrix4(relative));
  });
  if (out.isEmpty())
    out.set(new T.Vector3(-0.3, 0, -0.3), new T.Vector3(0.3, 1, 0.3));
  return out;
}

/**
 * Picking for hover and click. One `pick` casts one ray against people
 * (oriented proxy boxes from the rig's position, heading, scale and head
 * height), the center's furniture (boxes measured once per asset from the
 * geometry, then an exact raycast on the nearest few), the pick index of
 * every facility stamped on a community pad and the vehicle bodies. It keeps
 * what lies on the kept side of a section (for things the section cuts) and
 * in front of the first occluder (walls, floors, facade, roof), and prefers a
 * person when their proxy is entered no later than the nearest surface.
 * Allocation-free after warm-up, apart from three.js's intersection records.
 */
export function createPicker(scene: PickScene) {
  const raycaster = new T.Raycaster(),
    ray = raycaster.ray,
    ndc = new T.Vector2(),
    inverse = new T.Matrix4(),
    combined = new T.Matrix4(),
    scratchBox = new T.Box3(),
    low = new T.Vector3(),
    high = new T.Vector3(),
    hits: T.Intersection[] = [],
    meshes: T.Object3D[] = [],
    topT = [0, 0, 0, 0],
    topI = [0, 0, 0, 0];
  // Measured once and shared by every object of an asset.
  const centerBoxes = new Map<string, T.Box3>(),
    vehicleBoxes = new WeakMap<T.Object3D, T.Box3>(),
    pickInverse = new WeakMap<InstancePick, T.Matrix4>(),
    inspectablePicks = new WeakMap<FacilityInstance, InstancePick[]>();
  // Pickables, built on first use and reused by every later pick.
  const personItems: (Pickable | undefined)[] = [],
    objectItems: (Pickable | undefined)[] = [],
    instanceItems = new WeakMap<InstancePick, Pickable>(),
    vehicleItems = new Map<string, Pickable>();
  const objectIndex = new Map(scene.objects.map((o, i) => [o.object.id, i]));
  const personIndex = new Map(scene.people.map((p, i) => [p.spec.id, i]));
  // The ray in a local frame: its parameter t stays the world distance.
  let ox = 0,
    oy = 0,
    oz = 0,
    dx = 0,
    dy = 0,
    dz = 0,
    keepFrom = 0,
    keepTo = Infinity,
    sectionFrom = 0,
    sectionTo = Infinity;
  /** Whether the section limits the next slab tests. */
  const cut = (on: boolean) => {
    keepFrom = on ? sectionFrom : 0;
    keepTo = on ? sectionTo : Infinity;
  };
  const toLocal = (m: T.Matrix4) => {
    const e = m.elements,
      o = ray.origin,
      d = ray.direction;
    ox = e[0] * o.x + e[4] * o.y + e[8] * o.z + e[12];
    oy = e[1] * o.x + e[5] * o.y + e[9] * o.z + e[13];
    oz = e[2] * o.x + e[6] * o.y + e[10] * o.z + e[14];
    dx = e[0] * d.x + e[4] * d.y + e[8] * d.z;
    dy = e[1] * d.x + e[5] * d.y + e[9] * d.z;
    dz = e[2] * d.x + e[6] * d.y + e[10] * d.z;
  };
  /** Entry distance of the local ray into `b` (within the kept stretch), or -1. */
  const slab = (b: T.Box3) => {
    let near = keepFrom,
      far = keepTo;
    for (let axis = 0; axis < 3; axis++) {
      const o = axis === 0 ? ox : axis === 1 ? oy : oz,
        d = axis === 0 ? dx : axis === 1 ? dy : dz,
        lo = axis === 0 ? b.min.x : axis === 1 ? b.min.y : b.min.z,
        hi = axis === 0 ? b.max.x : axis === 1 ? b.max.y : b.max.z;
      if (Math.abs(d) < 1e-12) {
        if (o < lo || o > hi) return -1;
        continue;
      }
      const t1 = (lo - o) / d,
        t2 = (hi - o) / d;
      if (Math.min(t1, t2) > near) near = Math.min(t1, t2);
      if (Math.max(t1, t2) < far) far = Math.max(t1, t2);
      if (near > far) return -1;
    }
    return near;
  };
  const centerBox = (i: number) => {
    const { object, group } = scene.objects[i];
    let b = centerBoxes.get(object.assetId);
    if (!b) centerBoxes.set(object.assetId, (b = ownBox(group)));
    return b;
  };
  const vehicleBox = (o: T.Object3D) => {
    let b = vehicleBoxes.get(o);
    if (!b) vehicleBoxes.set(o, (b = ownBox(o)));
    return b;
  };
  /** A person's proxy: their footprint (a wheelchair or walker included) up to the head. */
  const personBox = (p: Person, out: T.Box3) => {
    const s = p.root.scale.x || 1,
      head = p.joints.head?.matrixWorld.elements[13];
    const top =
      head === undefined
        ? 1.75
        : Math.max(0.6, (head - p.root.position.y) / s + BODY.head);
    const wheelchair = p.spec.mobility === 'wheelchair',
      walker = p.spec.mobility === 'walker';
    low.set(-(wheelchair ? 0.37 : BODY.x), 0, -(wheelchair ? 0.44 : BODY.back));
    high.set(
      wheelchair ? 0.37 : BODY.x,
      top,
      wheelchair ? 0.42 : walker ? 0.6 : BODY.front,
    );
    return out.set(low, high);
  };
  const personFrame = (p: Person, out: T.Matrix4) => {
    const s = p.root.scale.x || 1;
    return out
      .makeRotationY(p.root.rotation.y)
      .scale(low.set(s, s, s))
      .setPosition(p.root.position);
  };
  const instancePicks = (inst: FacilityInstance) => {
    let list = inspectablePicks.get(inst);
    if (!list) {
      list = inst.picks.filter((p) =>
        isInspectable(p.object, inst.facility.assets[p.object.assetId]),
      );
      inspectablePicks.set(inst, list);
    }
    return list;
  };
  const inverseOf = (p: InstancePick) => {
    let m = pickInverse.get(p);
    if (!m) pickInverse.set(p, (m = p.matrix.clone().invert()));
    return m;
  };

  function personItem(i: number): Pickable {
    const p = scene.people[i];
    return (personItems[i] ??= {
      target: { kind: 'person', id: p.spec.id },
      ...scene.label({ kind: 'person', id: p.spec.id }),
      shape: 'circle',
      tint: p.mesh,
      place(box, frame) {
        if (!p.root.visible || !visibleChain(scene.peopleRoot)) return false;
        personBox(p, box);
        personFrame(p, frame);
        return true;
      },
      grounded: () => !(p.sample.vehicleId && p.sample.seat),
    });
  }
  function objectItem(i: number): Pickable {
    const { object, group } = scene.objects[i];
    return (objectItems[i] ??= {
      target: { kind: 'object', id: object.id },
      ...scene.label({ kind: 'object', id: object.id }),
      shape: 'rect',
      tint: group,
      place(box, frame) {
        if (!visibleChain(group)) return false;
        box.copy(centerBox(i));
        group.updateWorldMatrix(true, false);
        frame.copy(group.matrixWorld);
        return true;
      },
      grounded: () => true,
    });
  }
  function instanceItem({ settingId, instance }: Stamped, pick: InstancePick) {
    let item = instanceItems.get(pick);
    if (!item) {
      const target = { kind: 'object' as const, id: pick.object.id, settingId };
      instanceItems.set(
        pick,
        (item = {
          target,
          ...scene.label(target),
          shape: 'rect',
          tint: null,
          place(box, frame) {
            if (!visibleChain(instance.root)) return false;
            box.copy(pick.box);
            instance.root.updateWorldMatrix(true, false);
            frame.multiplyMatrices(instance.root.matrixWorld, pick.matrix);
            return true;
          },
          grounded: () => true,
        }),
      );
    }
    return item;
  }
  function vehicleItem(v: Vehicle) {
    let item = vehicleItems.get(v.id);
    if (!item)
      vehicleItems.set(
        v.id,
        (item = {
          target: { kind: 'vehicle', id: v.id },
          ...scene.label({ kind: 'vehicle', id: v.id }),
          shape: 'rect',
          tint: null,
          place(box, frame) {
            if (!visibleChain(v.object)) return false;
            box.copy(vehicleBox(v.object));
            v.object.updateWorldMatrix(true, false);
            frame.copy(v.object.matrixWorld);
            return true;
          },
          grounded: () => true,
        }),
      );
    return item;
  }
  /** The pickable of a target (programmatic selection), or null. */
  function resolve(target: InspectTarget): Pickable | null {
    if (target.kind === 'person') {
      const i = personIndex.get(target.id);
      return i === undefined ? null : personItem(i);
    }
    if (target.kind === 'vehicle') {
      const v = scene.vehicles().find((x) => x.id === target.id);
      return v ? vehicleItem(v) : null;
    }
    if (!target.settingId) {
      const i = objectIndex.get(target.id);
      return i === undefined ? null : objectItem(i);
    }
    const stamped = scene
      .instances()
      .find((x) => x.settingId === target.settingId);
    const pick = stamped?.instance.picks.find((p) => p.object.id === target.id);
    return stamped && pick ? instanceItem(stamped, pick) : null;
  }

  // Occluders: the visible meshes under the occluder roots.
  const collect = (o: T.Object3D) => {
    if (!o.visible || scene.skipOccluder(o)) return;
    if ((o as T.Mesh).isMesh) {
      const m = (o as T.Mesh).material as T.Material;
      // Invisible room-selection plates and other see-through helpers.
      if (!Array.isArray(m) && m.visible !== false && m.opacity > 0.05)
        meshes.push(o);
    }
    for (const c of o.children) collect(c);
  };
  /** Distance to the nearest visible occluder along the ray (walls, floors, facade, roof). */
  function occlusion(plane: T.Plane | null) {
    meshes.length = 0;
    for (const root of scene.occluders()) if (visibleChain(root)) collect(root);
    hits.length = 0;
    raycaster.intersectObjects(meshes, false, hits);
    for (const h of hits)
      if (!plane || plane.distanceToPoint(h.point) >= 0) return h.distance;
    return Infinity;
  }

  /** What is under normalized device coordinates (x, y in −1…1), or null. */
  function pick(x: number, y: number): Pickable | null {
    raycaster.setFromCamera(ndc.set(x, y), scene.camera);
    const plane = scene.section();
    // The stretch of the ray on the kept side of a section.
    sectionFrom = 0;
    sectionTo = Infinity;
    if (plane) {
      const d0 = plane.distanceToPoint(ray.origin),
        dd = plane.normal.dot(ray.direction);
      if (Math.abs(dd) < 1e-9) {
        if (d0 < 0) sectionTo = -1;
      } else if (dd > 0) sectionFrom = Math.max(0, -d0 / dd);
      else sectionTo = -d0 / dd;
    }
    const blocked = occlusion(plane) + OCCLUSION_SLACK;

    // People.
    let person = -1,
      personT = Infinity;
    cut(true);
    if (visibleChain(scene.peopleRoot))
      for (let i = 0; i < scene.people.length; i++) {
        const p = scene.people[i];
        if (!p.root.visible) continue;
        // Cheap reject: the ray's distance to the middle of the person.
        const s = p.root.scale.x || 1;
        high.copy(p.root.position).y += 0.85 * s;
        if (ray.distanceSqToPoint(high) > 1.3 * s * s) continue;
        toLocal(inverse.copy(personFrame(p, combined)).invert());
        const t = slab(personBox(p, scratchBox));
        if (t >= 0 && t < personT && t <= blocked) {
          personT = t;
          person = i;
        }
      }

    // The center's furniture: boxes, then exact hits on the nearest few.
    let found = 0;
    for (let i = 0; i < scene.objects.length; i++) {
      const o = scene.objects[i];
      if (!o.inspectable || !visibleChain(o.group)) continue;
      cut(o.clipped);
      toLocal(inverse.copy(o.group.matrixWorld).invert());
      const t = slab(centerBox(i));
      if (t < 0 || t > blocked || (found === TOP && t >= topT[TOP - 1]))
        continue;
      // Keep the TOP nearest boxes, sorted.
      let k = found < TOP ? found++ : TOP - 1;
      for (; k > 0 && topT[k - 1] > t; k--) {
        topT[k] = topT[k - 1];
        topI[k] = topI[k - 1];
      }
      topT[k] = t;
      topI[k] = i;
    }
    let object = -1,
      objectRank = Infinity,
      objectExact = Infinity;
    for (let k = 0; k < found; k++) {
      const { group, clipped } = scene.objects[topI[k]];
      hits.length = 0;
      raycaster.intersectObject(group, true, hits);
      let exact = Infinity;
      for (const h of hits)
        if (
          shownUnder(h.object, group) &&
          (!plane || !clipped || plane.distanceToPoint(h.point) >= 0)
        ) {
          exact = h.distance;
          break;
        }
      if (exact > blocked) exact = Infinity;
      const rank = exact < Infinity ? exact : topT[k] + BOX_ONLY;
      if (rank < objectRank) {
        objectRank = rank;
        objectExact = exact;
        object = topI[k];
      }
    }

    // Furniture of facilities stamped on community pads (one merged drawing: boxes).
    let stampedPick: InstancePick | null = null,
      stampedIn: Stamped | null = null,
      stampedT = Infinity;
    cut(false);
    for (const stamped of scene.instances()) {
      const inst = stamped.instance;
      if (!visibleChain(inst.root)) continue;
      const b = inst.bounds,
        y0 = inst.root.position.y - 0.5;
      scratchBox.min.set(b[0][0], y0, b[0][1]);
      scratchBox.max.set(b[1][0], y0 + 5, b[1][1]);
      if (!ray.intersectsBox(scratchBox)) continue;
      const rootInverse = inverse.copy(inst.root.matrixWorld).invert();
      for (const p of instancePicks(inst)) {
        toLocal(combined.multiplyMatrices(inverseOf(p), rootInverse));
        const t = slab(p.box);
        if (t >= 0 && t < stampedT && t <= blocked) {
          stampedT = t;
          stampedPick = p;
          stampedIn = stamped;
        }
      }
    }

    // Vehicles.
    let vehicle: Vehicle | null = null,
      vehicleT = Infinity;
    for (const v of scene.vehicles()) {
      if (!visibleChain(v.object)) continue;
      cut(v.clipped);
      toLocal(inverse.copy(v.object.matrixWorld).invert());
      const t = slab(vehicleBox(v.object));
      if (t >= 0 && t < vehicleT && t <= blocked) {
        vehicleT = t;
        vehicle = v;
      }
    }

    // A person in front of every surface the ray meets (a rider is inside
    // the vehicle's box, so the vehicle comes first).
    if (
      person >= 0 &&
      personT <= Math.min(objectExact, stampedT, vehicleT) + PERSON_SLACK
    )
      return personItem(person);
    const best = Math.min(objectRank, stampedT, vehicleT);
    if (best === Infinity) return null;
    if (best === objectRank) return objectItem(object);
    if (best === stampedT && stampedIn && stampedPick)
      return instanceItem(stampedIn, stampedPick);
    return vehicle ? vehicleItem(vehicle) : null;
  }

  return {
    pick,
    resolve,
    /** Measure every inspectable object's box now rather than on the first hover. */
    warm() {
      scene.objects.forEach((o, i) => {
        if (o.inspectable) centerBox(i);
      });
    },
  };
}
export type Picker = ReturnType<typeof createPicker>;
