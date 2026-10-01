import * as T from 'three';
import source from '../data/activity-loop.json';
import {
  createCharacter,
  type Action,
  type CharacterSpec,
  type CharacterRole,
} from './characters';
import type { Facility, Vec2 } from './schema';
import { buildArrival } from './arrival';
import { buildSiteArrival } from './site-arrival';
import { buildDayRoom, type DayHighlight } from './day-room';
import { buildDeliveries } from './deliveries';

export type Segment = {
  start: number;
  end: number;
  action: Action;
  path: Vec2[];
  zoneId: string;
  heading: number;
  heights?: number[];
  visible?: boolean;
  title?: string;
  vehicleId?: string;
  seated?: boolean;
};
export type ActorSpec = CharacterSpec & {
  label: string;
  offset: number;
  levelId: string;
  segments: Segment[];
  pairedWith?: string;
  seatId?: string;
  escortFor?: string;
  programMode?: string;
  roomId?: string;
  arrivalVehicleId?: string;
};
export type Interaction = {
  id: string;
  label: string;
  category: string;
  actorIds: string[];
  start: number;
  end: number;
  zoneId: string;
  description: string;
};
export type ActivityData = {
  siteSpecific?: boolean;
  views?: { id: string; label: string }[];
  dayRoomId?: string;
  duration: number;
  dayStartMinutes: number;
  dayDurationMinutes: number;
  interactions: Interaction[];
  description: string;
  timing: string;
  actors: ActorSpec[];
  roles: CharacterRole[];
  evidence: string[];
};
export type ActivitySource = ActivityData;
export const activityData = source as unknown as ActivityData;
export type ActivityOptions = {
  enabled: boolean;
  playing: boolean;
  speed: number;
  time: number;
  paths: boolean;
  filter: string;
  follow: string | null;
  scale: number;
};
export type ActorSample = {
  x: number;
  z: number;
  heading: number;
  action: Action;
  zoneId: string;
  segmentIndex: number;
  fraction: number;
  distance: number;
  y?: number;
  visible?: boolean;
  title?: string;
  vehicleId?: string;
  seated?: boolean;
};
export type ActivitySnapshot = ActivityOptions & {
  count: number;
  elapsedLabel: string;
};
const inside = (p: Vec2, poly: Vec2[]) => {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      odd = !odd;
  }
  return odd;
};
/** Speed (m per loop second) at which the character walk cycle was tuned. */
const REFERENCE_GAIT = 0.78;
const MOVING_ACTIONS = new Set<Action>(['walk', 'escort', 'roll']);
const cumulative = new WeakMap<Segment, number[]>();
export function sampleSegment(
  s: Segment,
  fraction: number,
): Omit<ActorSample, 'segmentIndex' | 'fraction'> {
  let lengths = cumulative.get(s);
  if (!lengths) {
    lengths = [0];
    for (let i = 1; i < s.path.length; i++)
      lengths.push(
        lengths[i - 1] +
          Math.hypot(
            s.path[i][0] - s.path[i - 1][0],
            s.path[i][1] - s.path[i - 1][1],
          ),
      );
    cumulative.set(s, lengths);
  }
  const total = lengths.at(-1)!,
    distance = total * T.MathUtils.clamp(fraction, 0, 1);
  if (total < 0.001)
    return {
      x: s.path[0][0],
      z: s.path[0][1],
      heading: s.heading,
      action: s.action,
      zoneId: s.zoneId,
      distance: 0,
      y: s.heights?.[0],
      visible: s.visible,
      title: s.title,
      vehicleId: s.vehicleId,
      seated: s.seated,
    };
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < distance) i++;
  const p = s.path[i - 1],
    q = s.path[i],
    t = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
  return {
    x: T.MathUtils.lerp(p[0], q[0], t),
    z: T.MathUtils.lerp(p[1], q[1], t),
    heading: Math.atan2(q[0] - p[0], q[1] - p[1]),
    action: s.action,
    zoneId: s.zoneId,
    distance,
    y: s.heights
      ? T.MathUtils.lerp(s.heights[i - 1], s.heights[i], t)
      : undefined,
    visible: s.visible,
    title: s.title,
    vehicleId: s.vehicleId,
    seated: s.seated,
  };
}
export function sampleActor(actor: ActorSpec, time: number): ActorSample {
  const t =
    (((time + actor.offset) % activityData.duration) + activityData.duration) %
    activityData.duration;
  const i = actor.segments.findIndex((s) => t >= s.start && t < s.end),
    segmentIndex = i < 0 ? actor.segments.length - 1 : i;
  const s = actor.segments[segmentIndex],
    fraction = (t - s.start) / (s.end - s.start || 1);
  return { ...sampleSegment(s, fraction), segmentIndex, fraction };
}
export function dayTime(time: number) {
  const minutes =
      activityData.dayStartMinutes +
      (time / activityData.duration) * activityData.dayDurationMinutes,
    h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(Math.floor(minutes % 60)).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function timelineFor(actor: ActorSpec) {
  return actor.segments
    .flatMap((s, i) => {
      const start =
          (((s.start - actor.offset) % activityData.duration) +
            activityData.duration) %
          activityData.duration,
        end = start + s.end - s.start;
      return end <= activityData.duration
        ? [{ ...s, start, end, index: i }]
        : [
            { ...s, start, end: activityData.duration, index: i },
            { ...s, start: 0, end: end - activityData.duration, index: i },
          ];
    })
    .sort((a, b) => a.start - b.start);
}
/** Follow the same traversable polyline at a fixed distance, including around corners and on ramps. */
export function sampleEscort(partner: ActorSpec, time: number): ActorSample {
  const current = sampleActor(partner, time);
  const gap = partner.mobility === 'wheelchair' ? 0.74 : 0.95;
  let remaining = current.distance - gap,
    index = current.segmentIndex;
  while (index >= 0) {
    const segment = partner.segments[index],
      end = sampleSegment(segment, 1);
    if (remaining >= 0 && end.distance > 0.001) {
      const s = sampleSegment(segment, remaining / end.distance);
      return {
        ...current,
        ...s,
        visible: current.visible,
        title: current.title,
        action: ['walk', 'roll'].includes(current.action)
          ? 'walk'
          : current.action === 'ride'
            ? 'ride'
            : 'consult',
        segmentIndex: current.segmentIndex,
        fraction: current.fraction,
      };
    }
    index--;
    if (index >= 0)
      remaining += sampleSegment(partner.segments[index], 1).distance;
  }
  const s = partner.segments.find((s) => sampleSegment(s, 1).distance > 0.001),
    heading = s ? sampleSegment(s, 0).heading : current.heading;
  return {
    ...current,
    x: current.x - Math.sin(heading) * gap,
    z: current.z - Math.cos(heading) * gap,
    heading,
    action: current.action === 'ride' ? 'ride' : 'walk',
  };
}
type PairKnot = { at: number; staff: number; participant: number };
const pairPaths = new WeakMap<Segment, PairKnot[]>();
function coordinatePair(staff: Segment, participant: Segment): PairKnot[] {
  const cached = pairPaths.get(staff);
  if (cached) return cached;
  // A monotone coordination path lets either person yield in a narrow corridor.
  // Both remain on their wall/furniture-cleared routes; no positional correction or teleport.
  const n = 160,
    size = n + 1,
    sp = Array.from({ length: size }, (_, i) => sampleSegment(staff, i / n)),
    pp = Array.from({ length: size }, (_, i) =>
      sampleSegment(participant, i / n),
    );
  const cost = new Float64Array(size * size).fill(Infinity),
    previous = new Int32Array(size * size).fill(-1);
  const safe = (i: number, j: number) =>
    Math.hypot(sp[i].x - pp[j].x, sp[i].z - pp[j].z) >= 0.75;
  cost[0] = 0;
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++) {
      const index = i * size + j;
      if ((i || j) && !safe(i, j)) continue;
      for (const [di, dj] of [
        [1, 1],
        [1, 0],
        [0, 1],
      ]) {
        const pi = i - di,
          pj = j - dj;
        if (pi < 0 || pj < 0) continue;
        const prev = pi * size + pj;
        const midDistance = Math.hypot(
          (sp[i].x + sp[pi].x - pp[j].x - pp[pj].x) / 2,
          (sp[i].z + sp[pi].z - pp[j].z - pp[pj].z) / 2,
        );
        const next = cost[prev] + (di === dj ? 1.4 : 1.1);
        if (midDistance >= 0.75 && next < cost[index]) {
          cost[index] = next;
          previous[index] = prev;
        }
      }
    }
  if (!Number.isFinite(cost[cost.length - 1]))
    throw new Error('Escort routes need a continuous shared clearance path');
  const points: number[][] = [];
  let k = cost.length - 1;
  while (k >= 0) {
    points.push([Math.floor(k / size), k % size]);
    k = previous[k];
  }
  points.reverse();
  let length = 0;
  const knots = points.map(([i, j], k) => {
    if (k) {
      const [pi, pj] = points[k - 1];
      length += Math.max(
        Math.hypot(sp[i].x - sp[pi].x, sp[i].z - sp[pi].z),
        Math.hypot(pp[j].x - pp[pj].x, pp[j].z - pp[pj].z),
      );
    }
    return { at: length, staff: i / n, participant: j / n };
  });
  knots.forEach((k) => (k.at /= length || 1));
  pairPaths.set(staff, knots);
  return knots;
}
export function samplePairedActors(
  actor: ActorSpec,
  partner: ActorSpec,
  time: number,
): { staff: ActorSample; participant: ActorSample } {
  const leader = sampleActor(partner, time),
    leg = actor.segments[leader.segmentIndex];
  if (!leg) return { staff: sampleActor(actor, time), participant: leader };
  let a = leader.fraction,
    b = leader.fraction;
  if (leg.action === 'walk') {
    const knots = coordinatePair(leg, partner.segments[leader.segmentIndex]);
    let i = 1;
    while (i < knots.length - 1 && knots[i].at < leader.fraction) i++;
    const p = knots[i - 1],
      q = knots[i],
      t = (leader.fraction - p.at) / (q.at - p.at || 1);
    a = T.MathUtils.lerp(p.staff, q.staff, t);
    b = T.MathUtils.lerp(p.participant, q.participant, t);
  }
  return {
    staff: {
      ...sampleSegment(leg, a),
      segmentIndex: leader.segmentIndex,
      fraction: a,
    },
    participant: {
      ...sampleSegment(partner.segments[leader.segmentIndex], b),
      segmentIndex: leader.segmentIndex,
      fraction: b,
    },
  };
}
export function createActivity(
  model: Facility,
  scene: T.Scene,
  material?: (id: string) => T.MeshStandardMaterial,
  data: ActivityData = activityData,
) {
  if (data.duration !== activityData.duration)
    throw new Error(`Activity source must use the ${activityData.duration}s care-day clock`);
  const arrival = data.siteSpecific
    ? buildSiteArrival(model, material)
    : buildArrival(model, material);
  scene.add(arrival.root);
  const deliveries = data.siteSpecific ? null : buildDeliveries();
  if (deliveries) scene.add(deliveries.root);
  const root = new T.Group();
  root.name = 'care-day-actors';
  scene.add(root);
  const pathRoot = new T.Group();
  pathRoot.name = 'care-day-paths';
  scene.add(pathRoot);
  const props = new T.Group();
  props.name = 'care-day-props';
  scene.add(props);
  const options: ActivityOptions = {
    enabled: true,
    playing: !(
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ),
    speed: 4,
    time: 0,
    paths: false,
    filter: 'all',
    follow: null,
    scale: 1,
  };
  let view = {
      level: 'ground',
      plan: false,
      explode: 0,
      stack: 0,
      isolate: false,
      selected: null as string | null,
      site: true,
    },
    noticeTime = 0;
  const listeners = new Set<(s: ActivitySnapshot) => void>();
  const actors = data.actors.map((a) => ({
    spec: a,
    ...createCharacter(a),
    sample: sampleActor(a, 0),
  }));
  actors.forEach((a) => root.add(a.root));
  const dayRoom = data.siteSpecific
    ? {
        root: new T.Group(),
        tick: (_time: number) => {},
        highlights: (): DayHighlight[] => [],
      }
    : buildDayRoom(actors);
  scene.add(dayRoom.root);
  const actorMap = new Map(actors.map((a) => [a.spec.id, a]));
  const groundZones = model.zones.filter((z) => z.levelId === 'ground');
  const levelY = (id: string) =>
    model.levels.find((l) => l.id === id)?.elevation || 0;
  const pathMat = new T.LineDashedMaterial({
    color: '#e7a42d',
    dashSize: 0.22,
    gapSize: 0.14,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  for (const a of actors)
    for (const s of a.spec.segments)
      if (['walk', 'roll', 'escort'].includes(s.action)) {
        const l = new T.Line(
          new T.BufferGeometry().setFromPoints(
            s.path.map(
              (p, i) =>
                new T.Vector3(
                  p[0],
                  (s.heights?.[i] ?? levelY(a.spec.levelId)) + 0.035,
                  p[1],
                ),
            ),
          ),
          pathMat,
        );
        l.computeLineDistances();
        l.userData = {
          actorId: a.spec.id,
          levelId: a.spec.levelId,
          role: a.spec.role,
        };
        pathRoot.add(l);
      }
  // OT task objects sit on the model-owned table. Furniture and collision footprints
  // are shared with the building instead of creating duplicate chairs here.
  const propMat = new T.MeshStandardMaterial({
      color: '#d5ac72',
      roughness: 0.86,
    }),
    teal = new T.MeshStandardMaterial({ color: '#43878a', roughness: 0.82 });
  const propBox = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat = propMat,
  ) => {
    const p = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    p.position.set(x, y + h / 2, z);
    p.castShadow = true;
    p.receiveShadow = true;
    props.add(p);
    return p;
  };
  for (let i = 0; !data.siteSpecific && i < 7; i++) {
    const p = propBox(
      -24.34 + i * 0.105,
      0.76,
      15.25 + (i % 2 ? 0.1 : -0.1),
      0.065,
      0.075,
      0.065,
      i % 2 ? teal : propMat,
    );
    p.rotation.y = i * 0.4;
  }
  function visibleRole(role: string) {
    return (
      options.filter === 'all' ||
      options.filter === role ||
      (options.filter === 'staff' && role !== 'participant')
    );
  }
  function getState(): ActivitySnapshot {
    return {
      ...options,
      count: actors.filter((a) => a.root.visible).length,
      elapsedLabel: `${Math.floor(options.time / 60)}:${String(Math.floor(options.time % 60)).padStart(2, '0')}`,
    };
  }
  const emit = () => listeners.forEach((l) => l(getState()));
  function setOptions(p: Partial<ActivityOptions>) {
    Object.assign(options, p);
    options.speed = T.MathUtils.clamp(options.speed, 0.25, 12);
    options.scale = T.MathUtils.clamp(options.scale, 1, 1.6);
    options.time =
      ((options.time % data.duration) + data.duration) % data.duration;
    tick(0, true);
    emit();
  }
  function tick(dt: number, force = false) {
    if (options.enabled && options.playing)
      options.time =
        (options.time + Math.min(Math.max(dt, 0), 0.15) * options.speed) %
        data.duration;
    const assembled = view.explode < 0.01 && view.stack < 0.01;
    root.visible = options.enabled && !view.plan && assembled;
    pathRoot.visible = root.visible && options.paths;
    props.visible =
      root.visible &&
      ['ground', 'all'].includes(view.level) &&
      (!view.isolate || view.selected === 'rehab');
    const paired = new Map<string, ActorSample>();
    for (const a of actors)
      if (a.spec.pairedWith) {
        const pair = samplePairedActors(
          a.spec,
          actorMap.get(a.spec.pairedWith)!.spec,
          options.time,
        );
        paired.set(a.spec.id, pair.staff);
        paired.set(a.spec.pairedWith, pair.participant);
      }
    for (const a of actors) {
      const s = a.spec.escortFor
        ? sampleEscort(actorMap.get(a.spec.escortFor)!.spec, options.time)
        : paired.get(a.spec.id) || sampleActor(a.spec, options.time);
      if (
        (!data.siteSpecific || a.spec.arrivalVehicleId) &&
        a.spec.levelId === 'ground'
      )
        s.zoneId =
          groundZones.find((z) => inside([s.x, s.z], z.polygon))?.id ||
          (a.spec.arrivalVehicleId ? 'site' : s.zoneId);
      a.sample = s;
      const zoneOffset =
        model.zones.find((z) => z.id === s.zoneId)?.elevationOffset || 0;
      a.root.position.set(s.x, s.y ?? levelY(a.spec.levelId) + zoneOffset, s.z);
      a.root.rotation.y = s.heading;
      a.root.scale.setScalar(a.profile.height * options.scale);
      a.root.visible =
        s.visible !== false &&
        visibleRole(a.spec.role) &&
        (!a.spec.arrivalVehicleId ||
          s.zoneId !== 'site' ||
          (view.site && !view.isolate)) &&
        (view.level === 'all' ||
          view.level === a.spec.levelId ||
          (a.spec.levelId === 'site' &&
            view.site &&
            view.level === 'ground')) &&
        (!view.isolate || !view.selected || view.selected === s.zoneId);
      const cargo = a.spec.id.startsWith('delivery-')
        ? a.root.getObjectByName('delivery-cargo')
        : null;
      if (cargo) cargo.visible = s.title?.startsWith('Delivering') || false;
      a.pose(
        a.spec.escortFor &&
          actorMap.get(a.spec.escortFor)?.spec.mobility === 'wheelchair' &&
          s.action === 'walk'
          ? 'escort'
          : s.action,
        // Gait cycles advance with distance walked, so faster tracks take
        // quicker steps instead of sliding feet.
        MOVING_ACTIONS.has(s.action) && s.distance > 0
          ? a.spec.offset + s.distance / REFERENCE_GAIT
          : options.time + a.spec.offset,
        a.spec.programMode === 'wheelchair' ? 0.65 : 1,
        s.seated,
      );
    }
    dayRoom.root.visible =
      root.visible &&
      ['ground', 'all'].includes(view.level) &&
      (!view.isolate || view.selected === 'day');
    dayRoom.tick(options.time);
    arrival.root.visible =
      !view.plan &&
      assembled &&
      view.site &&
      ['ground', 'all'].includes(view.level) &&
      !view.isolate;
    arrival.tick(
      options.time,
      options.enabled && arrival.root.visible,
      actors.map((a) => ({
        x: a.root.position.x,
        z: a.root.position.z,
        visible: a.root.visible && root.visible,
      })),
    );
    deliveries?.tick(options.time, options.enabled && arrival.root.visible);
    pathRoot.children.forEach((l) => {
      const a = actorMap.get(l.userData.actorId)!;
      const interaction = data.interactions.find(
        (i) => 'interaction:' + i.id === options.follow,
      );
      l.visible =
        a.root.visible &&
        (!options.follow ||
          options.follow === a.spec.id ||
          !!interaction?.actorIds.includes(a.spec.id));
    });
    noticeTime += dt;
    if (force || noticeTime > 0.2) {
      noticeTime = 0;
      emit();
    }
  }
  tick(0, true);
  return {
    data,
    deliveries,
    root,
    arrival,
    dayRoom,
    pathRoot,
    props,
    actors,
    getState,
    setOptions,
    tick,
    updateView(next: typeof view) {
      view = next;
      tick(0, true);
    },
    subscribe(fn: (s: ActivitySnapshot) => void) {
      listeners.add(fn);
      fn(getState());
      return () => {
        listeners.delete(fn);
      };
    },
    actorPosition(id: string) {
      if (id.startsWith('van-'))
        return arrival
          .sampleVan(Math.max(0, id.charCodeAt(4) - 97), options.time)
          .position.clone()
          .add(new T.Vector3(0, 1, 0));
      const interaction = data.interactions.find(
        (i) => 'interaction:' + i.id === id,
      );
      const people = (interaction?.actorIds || [id])
        .map((id) => actorMap.get(id))
        .filter((a) => a?.root.visible);
      if (people.length)
        return people
          .reduce((v, a) => v.add(a!.root.position), new T.Vector3())
          .multiplyScalar(1 / people.length)
          .add(new T.Vector3(0, 0.8, 0));
      const a =
          actorMap.get(id) ||
          interaction?.actorIds
            .map((id) => actorMap.get(id))
            .find((actor) => actor?.sample.vehicleId),
        vehicle = a?.sample.vehicleId;
      return vehicle
        ? arrival
            .sampleVan(Math.max(0, vehicle.charCodeAt(4) - 97), options.time)
            .position.clone()
            .add(new T.Vector3(0, 1, 0))
        : null;
    },
    actorSample(id: string) {
      return actorMap.get(id)?.sample;
    },
    async exportCast() {
      const exportScene = new T.Scene(),
        animations: T.AnimationClip[] = [];
      for (const [i, role] of data.roles.entries()) {
        const c = createCharacter({ id: `cast-${role}`, role, variant: i });
        c.root.position.set((i % 4) * 2.4, 0, Math.floor(i / 4) * 2.4);
        exportScene.add(c.root);
        animations.push(...c.clips());
      }
      for (const [i, mobility] of (
        ['cane', 'walker', 'wheelchair'] as const
      ).entries()) {
        const c = createCharacter({
          id: `cast-${mobility}`,
          role: 'participant',
          variant: i + 3,
          mobility,
        });
        c.root.position.set(i * 2.4, 0, 7.2);
        exportScene.add(c.root);
        animations.push(...c.clips());
      }
      const { GLTFExporter } =
        await import('three/addons/exporters/GLTFExporter.js');
      const result = await new GLTFExporter().parseAsync(exportScene, {
        binary: true,
        animations,
      });
      exportScene.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
        }
      });
      return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
    },
    dispose() {
      listeners.clear();
      root.removeFromParent();
      pathRoot.removeFromParent();
      props.removeFromParent();
      arrival.root.removeFromParent();
      dayRoom.root.removeFromParent();
      deliveries?.root.removeFromParent();
      const geos = new Set<T.BufferGeometry>(),
        mats = new Set<T.Material>();
      for (const g of [
        root,
        pathRoot,
        props,
        arrival.root,
        dayRoom.root,
        ...(deliveries ? [deliveries.root] : []),
      ])
        g.traverse((o) => {
          if (o instanceof T.Mesh || o instanceof T.Line) {
            geos.add(o.geometry);
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(
              (m) => mats.add(m),
            );
          }
        });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
