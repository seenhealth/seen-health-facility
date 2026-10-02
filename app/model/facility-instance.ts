import * as T from 'three';
import { buildAsset } from './assets';
import { mergeByMaterial } from './batch';
import {
  roomFinish,
  wallMeshes,
  zoneFloor,
  zoneSlab,
} from './facility-geometry';
import { floorShapes, type FloorOpening } from './floor-geometry';
import {
  insidePolygon,
  toLocal as frameToLocal,
  toWorld as frameToWorld,
  transformPolygon,
  type Frame,
} from './frame';
import { CUTAWAY_HEIGHT } from './presentation';
import { roomLabelAnchor } from './room-labels';
import {
  polygonArea,
  type Facility,
  type Instance,
  type Room,
  type Vec2,
  type Wall,
  type Zone,
} from './schema';

/**
 * A facility specification (schema 2.0) stamped somewhere in the world as a
 * static cutaway: zone slabs and finishes, room finishes, traced walls cut at
 * the main building's cutaway height (or full height), and the furniture and
 * architecture objects, merged by material into a few dozen draw calls, plus
 * flat room-name plates. The same drawing as the viewer's own building
 * (facility-geometry.ts, presentation.ts), without roofs, facades, envelope,
 * details, ceilings, stairs to levels that are not drawn, GLB swaps, door or
 * game-prop animation, picking or section clipping.
 *
 * Generic: it knows nothing of community settings, pads, sites or day
 * programs; callers pass the frame, the exclusions and a material resolver.
 */
export type FacilityInstanceOptions = {
  /** Levels to draw (default: the level with elevation 0, else the lowest `order`). */
  levelIds?: string[];
  /** Zones never drawn (default none). */
  excludeZoneIds?: string[];
  /** Objects never drawn (and left out of the instance's navigation view). */
  excludeObjectIds?: string[];
  /** Cut walls at `wallHeight` (default true); false draws full wall heights. */
  cutaway?: boolean;
  /** Cut height when `cutaway` (default CUTAWAY_HEIGHT, the main building's cut). */
  wallHeight?: number;
  /** Room plates: true = rooms ≥ 12 m² that are not `shell`/`circulation`; a record = these room ids with display names. */
  labels?: boolean | Record<string, string>;
  /** Material resolver bound to this facility (its `materials`, then the presentation palette). */
  mat: (id: string) => T.MeshStandardMaterial;
  /** Draw furniture and architecture objects (default true). */
  furniture?: boolean;
  /** World y of the finished floor (default 0). */
  floorY?: number;
  /** World y of the ground under the footprint; a foundation skirt fills floorY − slab down to it (default floorY − 0.2: none). */
  groundY?: number;
  /** Object name for the root (default `instance-${facility.id}`). */
  name?: string;
};
export type InstanceRoom = {
  id: string;
  name: string;
  zoneId: string;
  polygon: Vec2[];
  anchor: Vec2;
};
/**
 * One drawn object of an instance, for picking: the merged drawing has no
 * per-object meshes, so the viewer raycasts these boxes instead.
 */
export type InstancePick = {
  object: Instance;
  /** Object frame → instance root frame (compose with `root.matrixWorld`). */
  matrix: T.Matrix4;
  /** Drawn extent in the object's frame (shared by an asset's objects). */
  box: T.Box3;
};
export type FacilityInstance = {
  root: T.Group;
  /** The stamped specification. */
  facility: Facility;
  /** Every drawn object with its box, built before the merge. */
  picks: InstancePick[];
  /** World x/z bounds of the drawn zones. */
  bounds: [Vec2, Vec2];
  /** World polygons of the drawn zones (the footprint). */
  footprint: Vec2[][];
  /** Drawn rooms (not shells) in world coordinates; `anchor` = roomLabelAnchor. */
  rooms: InstanceRoom[];
  toWorld(local: Vec2): Vec2;
  toLocal(world: Vec2): Vec2;
  /** World label anchor of a drawn room (the most interior point), or null. */
  roomCenter(roomId: string): Vec2 | null;
};
export type InstanceSelection = {
  levelIds: string[];
  /** Elevation of the lowest drawn level: it sits at the instance's floor. */
  baseElevation: number;
  zones: Zone[];
  rooms: Room[];
  walls: Wall[];
  openings: FloorOpening[];
  /** Drawn objects, `layer` as authored. */
  objects: Instance[];
};
const DRAWN_LAYERS = new Set(['furniture', 'architecture']);
/**
 * What an instance draws, and therefore what its people may use: levels,
 * zones, rooms, walls, floor openings and objects. Pure (no three.js objects),
 * shared by the drawing and by build-time navigation (app/sim/community-cast.ts).
 *
 * Objects: on a drawn level and zone, not excluded, in the `furniture` or
 * `architecture` layer (plus `wall-finish` with full walls), and not the
 * stair or lift of a vertical connection whose other level is not drawn.
 * Floor openings of such connections are dropped too, so a single-level
 * instance has neither stairs to nowhere nor holes in its slab.
 */
export function instanceSelection(
  facility: Facility,
  options: Pick<
    FacilityInstanceOptions,
    'levelIds' | 'excludeZoneIds' | 'excludeObjectIds' | 'cutaway'
  > = {},
): InstanceSelection {
  const levelIds = options.levelIds?.length
    ? options.levelIds
    : [
        (
          facility.levels.find((l) => l.elevation === 0) ??
          [...facility.levels].sort((a, b) => a.order - b.order)[0]
        ).id,
      ];
  const levels = new Set(levelIds);
  for (const id of levels)
    if (!facility.levels.some((l) => l.id === id))
      throw new Error(`${facility.id}: no level ${id} to draw`);
  const baseElevation = Math.min(
    ...facility.levels.filter((l) => levels.has(l.id)).map((l) => l.elevation),
  );
  const excludedZones = new Set(options.excludeZoneIds || []),
    excludedObjects = new Set(options.excludeObjectIds || []);
  const zones = facility.zones.filter(
    (z) => levels.has(z.levelId) && !excludedZones.has(z.id),
  );
  const drawn = new Set(zones.map((z) => z.id));
  const connections = facility.verticalConnections || [];
  const elsewhere = new Set(
    connections
      .filter((c) => !levels.has(c.fromLevel) || !levels.has(c.toLevel))
      .map((c) => c.id),
  );
  const strayObjects = new Set(
    connections.filter((c) => elsewhere.has(c.id)).map((c) => c.objectId),
  );
  const layers = new Set(DRAWN_LAYERS);
  if (options.cutaway === false) layers.add('wall-finish');
  return {
    levelIds,
    baseElevation,
    zones,
    rooms: facility.rooms.filter(
      (r) => levels.has(r.levelId) && drawn.has(r.zoneId),
    ),
    walls: facility.walls.filter(
      (w) => levels.has(w.levelId) && drawn.has(w.zoneId),
    ),
    openings: (facility.floorOpenings || []).filter(
      (o) =>
        levels.has(o.levelId) &&
        drawn.has(o.zoneId) &&
        !elsewhere.has(o.connectionId),
    ),
    objects: facility.objects.filter(
      (o) =>
        levels.has(o.levelId) &&
        drawn.has(o.zoneId) &&
        !excludedObjects.has(o.id) &&
        !strayObjects.has(o.id) &&
        layers.has(o.layer ?? 'furniture'),
    ),
  };
}
/** Rooms that get a name plate, with the name shown. */
export function labelledRooms(
  rooms: Room[],
  labels: FacilityInstanceOptions['labels'],
): [Room, string][] {
  if (!labels) return [];
  if (labels === true)
    return rooms
      .filter(
        (r) =>
          !['shell', 'circulation'].includes(r.kind) &&
          polygonArea(r.polygon) >= 12,
      )
      .map((r) => [r, r.name]);
  return Object.entries(labels).map(([id, name]) => {
    const r = rooms.find((x) => x.id === id);
    if (!r) throw new Error(`Room plate for ${id}, which is not drawn`);
    return [r, name];
  });
}

const PLATE = { w: 3.6, d: 0.7, canvas: [512, 96] as const };
/** A flat name plate in a room, its text along world +x. */
function roomPlate(name: string, heading: number, anchor: Vec2) {
  const [cw, ch] = PLATE.canvas,
    c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(246, 244, 238, 0.9)';
  g.beginPath();
  g.roundRect?.(4, 4, cw - 8, ch - 8, 18);
  g.fill();
  g.fillStyle = '#2f3a38';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let px = 54;
  g.font = `600 ${px}px Arial`;
  while (px > 18 && g.measureText(name).width > cw - 48)
    g.font = `600 ${(px -= 2)}px Arial`;
  g.fillText(name, cw / 2, ch / 2 + 2);
  const map = new T.CanvasTexture(c);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  const plate = new T.Group();
  plate.name = `room-plate-${name}`;
  plate.position.set(anchor[0], 0.03, anchor[1]);
  // Counter-rotated to world angle 0 so the text reads from the default camera.
  plate.rotation.y = -heading;
  const text = new T.Mesh(
    new T.PlaneGeometry(PLATE.w, PLATE.d),
    new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
  );
  text.rotation.x = -Math.PI / 2;
  text.renderOrder = 1;
  plate.add(text);
  return plate;
}

/**
 * Where a room's plate lies: the free spot nearest the room's label anchor
 * (room-labels.ts) where the world-aligned plate stays inside the room and
 * clear of furniture taller than 25 cm (a day room's planter would hide it).
 * Furniture counts with its whole box, not its walkable footprints: the
 * plate must not show between the rails of a set of parallel bars.
 */
function plateAnchor(
  facility: Facility,
  room: Room,
  objects: Instance[],
  heading: number,
): Vec2 {
  const anchor = roomLabelAnchor(room),
    c = Math.cos(heading),
    s = Math.sin(heading);
  // Plate outline (world-aligned) sampled around a local centre.
  const outline: Vec2[] = [];
  for (let i = 0; i <= 8; i++)
    for (const v of [-0.5, 0, 0.5]) {
      const u = i / 8 - 0.5;
      const wx = u * (PLATE.w + 0.2),
        wz = v * (PLATE.d + 0.2);
      // World offset → facility-local offset (inverse of the frame rotation).
      outline.push([wx * c - wz * s, wx * s + wz * c]);
    }
  const blockers = objects
    .filter((o) => o.roomId === room.id || insidePolygon([o.position[0], o.position[2]], room.polygon))
    .map((o) => {
      const a = facility.assets[o.assetId];
      if (!a || a.dimensions[1] * o.scale[1] < 0.25) return null;
      return {
        o,
        w: a.dimensions[0] * o.scale[0],
        d: a.dimensions[2] * o.scale[2],
      };
    })
    .filter((b) => !!b);
  const blocked = (p: Vec2) =>
    blockers.some(({ o, w, d }) => {
      const dx = p[0] - o.position[0],
        dz = p[1] - o.position[2],
        x = Math.cos(o.rotation) * dx - Math.sin(o.rotation) * dz,
        z = Math.sin(o.rotation) * dx + Math.cos(o.rotation) * dz;
      return Math.abs(x) < w / 2 + 0.05 && Math.abs(z) < d / 2 + 0.05;
    });
  const fits = (q: Vec2) =>
    outline.every(([ox, oz]) => {
      const p: Vec2 = [q[0] + ox, q[1] + oz];
      return insidePolygon(p, room.polygon) && !blocked(p);
    });
  if (fits(anchor)) return anchor;
  const xs = room.polygon.map((p) => p[0]),
    zs = room.polygon.map((p) => p[1]);
  let best: Vec2 = anchor,
    bestD = Infinity;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.25)
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.25) {
      const d = Math.hypot(x - anchor[0], z - anchor[1]);
      if (d < bestD && fits([x, z])) {
        best = [x, z];
        bestD = d;
      }
    }
  return best;
}
function openingsOf(
  sel: InstanceSelection,
  zoneId: string,
  levelId: string,
): FloorOpening[] {
  return sel.openings.filter(
    (o) => o.zoneId === zoneId && o.levelId === levelId,
  );
}
const isDoor = (kind: string) =>
  kind === 'plan-door' || kind === 'folding-partition';
/**
 * The pick index: each built object's frame relative to the instance root
 * and its drawn box, measured once per asset from the geometry (a table
 * setting covers the middle of its table, not the asset's nominal footprint).
 */
function instancePicks(
  root: T.Group,
  built: { object: Instance; group: T.Group }[],
): InstancePick[] {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert(),
    boxes = new Map<string, T.Box3>(),
    inverse = new T.Matrix4(),
    relative = new T.Matrix4(),
    part = new T.Box3();
  return built.map(({ object, group }) => {
    let box = boxes.get(object.assetId);
    if (!box) {
      const b = new T.Box3();
      inverse.copy(group.matrixWorld).invert();
      group.traverse((m) => {
        if (!(m instanceof T.Mesh)) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        relative.multiplyMatrices(inverse, m.matrixWorld);
        b.union(part.copy(m.geometry.boundingBox!).applyMatrix4(relative));
      });
      boxes.set(object.assetId, (box = b));
    }
    return { object, box, matrix: toRoot.clone().multiply(group.matrixWorld) };
  });
}
/**
 * Build the instance under a root carrying the world frame of the facility
 * origin (position, `floorY`, heading). Everything static is merged by
 * canonical material; room plates stay separate (and are skipped without a
 * DOM). No DOM labels, no section clipping; objects are picked through
 * `picks`, boxes measured from their geometry before the merge.
 */
export function buildFacilityInstance(
  facility: Facility,
  frame: Frame,
  options: FacilityInstanceOptions,
): FacilityInstance {
  const sel = instanceSelection(facility, options);
  const cut = options.cutaway !== false,
    wallHeight = options.wallHeight ?? CUTAWAY_HEIGHT,
    floorY = options.floorY ?? 0,
    groundY = options.groundY ?? floorY - 0.2;
  // The resolver's materials belong to the viewer's cache: the merge keeps them.
  const handed = new Set<T.Material>();
  const mat = (id: string) => {
    const m = options.mat(id);
    handed.add(m);
    return m;
  };
  const root = new T.Group();
  root.name = options.name ?? `instance-${facility.id}`;
  root.position.set(frame.position[0], floorY, frame.position[1]);
  root.rotation.y = frame.heading;
  root.userData = {
    facilityId: facility.id,
    revision: facility.revision,
    accuracy: 'Facility layout stamped on an illustrative pad',
  };
  const statics = new T.Group();
  statics.name = 'static';
  root.add(statics);
  const zoneGroups = new Map<string, T.Group>();
  for (const z of sel.zones) {
    const g = new T.Group();
    g.name = z.id;
    g.position.y =
      facility.levels.find((l) => l.id === z.levelId)!.elevation -
      sel.baseElevation +
      (z.elevationOffset || 0);
    statics.add(g);
    zoneGroups.set(z.id, g);
    const openings = openingsOf(sel, z.id, z.levelId),
      slab = z.slabDepth || 0.19,
      top = -slab - 0.01,
      bottom = groundY - floorY - g.position.y;
    // A raised floor (a house above its yard) stands on a foundation skirt.
    if (bottom < top - 0.01) {
      const geo = new T.ExtrudeGeometry(floorShapes(z.polygon, []), {
        depth: top - bottom,
        bevelEnabled: false,
      });
      geo.rotateX(-Math.PI / 2);
      const skirt = new T.Mesh(geo, mat('concrete'));
      skirt.position.y = bottom;
      skirt.castShadow = skirt.receiveShadow = true;
      g.add(skirt);
    }
    g.add(zoneSlab(z, openings, mat('concrete')));
    g.add(zoneFloor(z, openings, mat(z.floorMaterial)));
  }
  for (const r of sel.rooms)
    if (r.floorMaterial)
      zoneGroups
        .get(r.zoneId)!
        .add(
          roomFinish(r, openingsOf(sel, r.zoneId, r.levelId), mat(r.floorMaterial)),
        );
  for (const w of sel.walls) {
    const h = cut ? Math.min(wallHeight, w.height) : w.height,
      [wall, cap] = wallMeshes(w, mat, h);
    // The coping sits where the main building's walls put it (renderer update()).
    cap.position.y = h - 0.004;
    zoneGroups.get(w.zoneId)!.add(wall, cap);
  }
  const built: { object: Instance; group: T.Group }[] = [];
  if (options.furniture !== false)
    for (const o of sel.objects) {
      const spec = facility.assets[o.assetId];
      if (!spec) continue;
      // GLB `modelUrl`s are not swapped in: the procedural model stays.
      const g = buildAsset(spec, mat);
      built.push({ object: o, group: g });
      g.position.fromArray(o.position);
      g.rotation.y = o.rotation;
      g.scale.fromArray(o.scale);
      g.name = o.id;
      g.userData = { id: o.id, assetId: o.assetId };
      if (isDoor(spec.kind)) {
        // Doors stand open (as built) and shorter in a cutaway, like the main building's.
        if (cut) g.scale.y *= 0.52;
        const folded = g.getObjectByName('partition-folded'),
          shut = g.getObjectByName('partition-closed');
        if (folded) folded.visible = true;
        if (shut) shut.visible = false;
      }
      zoneGroups.get(o.zoneId)!.add(g);
    }
  const picks = instancePicks(root, built);
  mergeByMaterial(statics, { canonical: true, keep: handed });
  const toWorld = (p: Vec2) => frameToWorld(frame, p),
    toLocal = (p: Vec2) => frameToLocal(frame, p);
  const footprint = sel.zones.map((z) => transformPolygon(frame, z.polygon));
  const xs = footprint.flat().map((p) => p[0]),
    zs = footprint.flat().map((p) => p[1]);
  const rooms: InstanceRoom[] = sel.rooms
    .filter((r) => r.kind !== 'shell')
    .map((r) => ({
      id: r.id,
      name: r.name,
      zoneId: r.zoneId,
      polygon: transformPolygon(frame, r.polygon),
      anchor: toWorld(roomLabelAnchor(r)),
    }));
  const labels = new T.Group();
  labels.name = 'labels';
  root.add(labels);
  if (typeof document !== 'undefined')
    for (const [r, name] of labelledRooms(sel.rooms, options.labels))
      labels.add(
        roomPlate(
          name,
          frame.heading,
          plateAnchor(facility, r, sel.objects, frame.heading),
        ),
      );
  return {
    root,
    facility,
    picks,
    bounds: [
      [Math.min(...xs), Math.min(...zs)],
      [Math.max(...xs), Math.max(...zs)],
    ],
    footprint,
    rooms,
    toWorld,
    toLocal,
    roomCenter: (id) => rooms.find((r) => r.id === id)?.anchor ?? null,
  };
}
