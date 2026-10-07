import * as T from 'three';
import { easeDistance, laneLine } from './traffic-routes';
import {
  Pen,
  pathAt,
  pathLength,
  roundedPath,
  type Piece,
} from './vehicle-path';
export const deliveryStops = [
  {
    id: 'delivery-food',
    kind: 'food',
    x: 9.7,
    z: -21.8,
    door: [8.8, -15.212789],
    /**
     * Runs as [start, dwell] in loop seconds. The morning run brings lunch: it
     * waits while its trolley goes through receiving into the kitchen and
     * back (`delivery-food` in activity-loop.json, written by
     * scripts/apply-kitchen-delivery.mjs).
     */
    runs: [
      [228, 88],
      [460, 60],
    ],
  },
  {
    id: 'delivery-package',
    kind: 'package',
    // Rear receiving is the door at the back of the electrical room's notch
    // (west of the loading block, photos 2026-10-02): the truck noses in west
    // of the food truck, and its driver walks through the enclosure's
    // pedestrian gate (alhambra-exterior.ts, swung open here) to the door.
    x: 6.75,
    z: -19.6,
    door: [3.56, -12.465328],
    runs: [
      [280, 52],
      [590, 52],
    ],
  },
] as const;
/**
 * Truck routes: straight runs and arcs of radius `radius` (see vehicle-path).
 * A truck arrives nose-first from the south street, west along `inZ` and
 * into its bay, and stops facing the building. It leaves by backing out and
 * round, tail west, onto the drive aisle at `aisleZ` (south of the rear
 * court's planters), stopping, then pulling forward east along the aisle,
 * angling across the street from `exitX` to its eastbound lane and along it
 * to `offX`. Loop seconds: `approach` to arrive, the run's dwell, then the
 * reverse (at `reverseSpeed` m/s once under way), `pause` and the rest of
 * `departure` to leave.
 */
const TRUCK = {
  radius: 4.5,
  inZ: -28,
  aisleZ: -26.3,
  exitX: 21,
  offX: 32,
  approach: 24,
  departure: 24,
  reverseSpeed: 1.4,
  pause: 0.6,
  /** Tailgate opening after the stop and closing before the truck moves. */
  tailgate: 2,
};
type Stop = (typeof deliveryStops)[number];
/** The shallow receiving ramp from the pavement up to a stop's door (x/z extent). */
export function receivingRamp(s: Stop) {
  const w = s.kind === 'food' ? 2.5 : 1.15;
  return {
    x0: s.door[0] - w / 2,
    x1: s.door[0] + w / 2,
    z0: s.door[1] - 1.7,
    z1: s.door[1],
  };
}
/** Loop seconds of each run: sets off, parks at the door, starts backing out, gone. */
export function deliveryRuns(s: Stop) {
  return s.runs.map(([start, dwell]) => {
    const arrive = start + TRUCK.approach,
      leave = arrive + dwell;
    return { start, arrive, leave, end: leave + TRUCK.departure };
  });
}
/**
 * Lunch on the kitchen island: the morning food run's carriers, unloaded from
 * its trolley during the `kitchen-lunch-delivery` hand-over and left out until
 * lunch service ends (day-program.json `lunch.service`). `at` is the first
 * carrier's centre on the island; `from` and `to` are loop seconds, and
 * scripts/apply-kitchen-delivery.mjs starts the unloading at `from`.
 */
export const KITCHEN_LUNCH = {
  at: [10.79, 2.95] as [number, number],
  from: 297,
  to: 405,
};
const STREET_Y = -0.23;
function truckRoutes(s: Stop) {
  const { radius, inZ, aisleZ, exitX, offX } = TRUCK,
    eastbound = laneLine('south', 1);
  const reverse = new Pen(s.x, s.z, Math.PI)
    .line(s.z - radius - aisleZ)
    .arc(radius, Math.PI / 2)
    .take();
  return {
    inbound: roundedPath(
      [
        [27, -33],
        [20, -28],
        [s.x, inZ],
        [s.x, s.z],
      ],
      radius,
    ),
    reverse,
    /** Loop seconds of the reverse: `reverseSpeed`, easing in and out over 1.5 s. */
    reverseTime: pathLength(reverse) / TRUCK.reverseSpeed + 1.5,
    outbound: roundedPath(
      [
        [s.x - radius, aisleZ],
        [exitX, aisleZ],
        [exitX + aisleZ - eastbound, eastbound],
        [offX, eastbound],
      ],
      radius,
    ),
  };
}
const routes = new Map<Stop, ReturnType<typeof truckRoutes>>();
const routesOf = (s: Stop) => {
  let r = routes.get(s);
  if (!r) routes.set(s, (r = truckRoutes(s)));
  return r;
};
/** Pose `fraction` of the way along a route (nose-first, or backing up along it). */
function along(pieces: Piece[], fraction: number, reverse = false) {
  const p = pathAt(pieces, fraction * pathLength(pieces));
  return {
    position: new T.Vector3(p.x, STREET_Y, p.z),
    heading: p.dir + (reverse ? 0 : Math.PI),
  };
}
export function sampleDelivery(index: number, time: number) {
  const s = deliveryStops[index],
    t = ((time % 720) + 720) % 720,
    r = routesOf(s);
  for (const { start, arrive, leave, end } of deliveryRuns(s)) {
    if (t < start || t >= end) continue;
    const moving = { visible: true, door: 0, reverse: false };
    if (t < arrive)
      return {
        ...moving,
        ...along(r.inbound, easeDistance(t - start, TRUCK.approach, 0, 6)),
        phase: 'Arriving',
      };
    if (t < leave)
      return {
        ...moving,
        position: new T.Vector3(s.x, STREET_Y, s.z),
        heading: Math.PI,
        phase: 'Unloading',
        door:
          T.MathUtils.smoothstep(t, arrive, arrive + TRUCK.tailgate) *
          (1 - T.MathUtils.smoothstep(t, leave - TRUCK.tailgate, leave)),
      };
    const out = t - leave,
      pulls = r.reverseTime + TRUCK.pause;
    if (out < r.reverseTime)
      return {
        ...moving,
        ...along(r.reverse, easeDistance(out, r.reverseTime, 1.5, 1.5), true),
        phase: 'Reversing out of receiving',
        reverse: true,
      };
    if (out < pulls)
      return {
        ...moving,
        ...along(r.reverse, 1, true),
        phase: 'Stopped to pull away',
      };
    return {
      ...moving,
      ...along(
        r.outbound,
        easeDistance(out - pulls, TRUCK.departure - pulls, 5, 0),
      ),
      phase: 'Leaving',
    };
  }
  return {
    position: new T.Vector3(27, STREET_Y, -33),
    heading: 0,
    visible: false,
    phase: 'On delivery route',
    door: 0,
    reverse: false,
  };
}
export function buildDeliveries() {
  const root = new T.Group();
  root.name = 'rear-deliveries';
  const mat = (color: string) =>
    new T.MeshStandardMaterial({ color, roughness: 0.78 });
  const box = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color));
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const vehicles = deliveryStops.map((s) => {
    const g = new T.Group();
    g.name = s.id;
    root.add(g);
    box(
      g,
      0,
      0.6,
      0,
      2.0,
      0.65,
      4.6,
      s.kind === 'food' ? '#d7ddc6' : '#c9b18c',
    );
    box(
      g,
      0,
      1.45,
      0.65,
      2.1,
      1.75,
      3.25,
      s.kind === 'food' ? '#eff1e7' : '#bd9f79',
    );
    box(g, 0, 1.2, -1.65, 1.95, 1.25, 1.3, '#e3e9df');
    box(g, 0, 1.4, -2.31, 1.7, 0.65, 0.045, '#386372');
    for (const x of [-0.97, 0.97])
      box(g, x, 1.43, -1.6, 0.045, 0.65, 0.83, '#527d84');
    for (const x of [-1.02, 1.02])
      for (const z of [-1.5, 1.5]) {
        const w = new T.Mesh(
          new T.CylinderGeometry(0.35, 0.35, 0.22, 14),
          mat('#2b3b3d'),
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.35, z);
        g.add(w);
      }
    for (const x of [-0.65, 0.65]) {
      box(g, x, 0.75, -2.34, 0.3, 0.16, 0.04, '#f3e9c9');
      box(g, x, 0.7, 2.3, 0.18, 0.15, 0.04, '#b76554');
    }
    const tail = box(g, 0, 1.4, 2.31, 1.8, 1.45, 0.05, '#647c75');
    tail.name = 'delivery-tailgate';
    if (s.kind === 'food') {
      box(g, 0, 2.35, -0.75, 1.15, 0.35, 0.55, '#9daea8');
      for (let i = 0; i < 4; i++)
        box(g, -0.4 + i * 0.26, 2.35, -1.03, 0.12, 0.23, 0.02, '#5a7775');
    }
    return { root: g, tail };
  });
  const doors = deliveryStops.map((s) => {
    const pivot = new T.Group();
    pivot.position.set(
      s.door[0] - (s.kind === 'food' ? 1.25 : 0.5),
      0,
      s.door[1],
    );
    root.add(pivot);
    box(
      pivot,
      s.kind === 'food' ? 1.25 : 0.5,
      1.1,
      0,
      s.kind === 'food' ? 2.5 : 1,
      2.2,
      0.065,
      '#809b95',
    );
    // A shallow receiving ramp connects the pavement to the interior datum.
    const r = receivingRamp(s);
    const ramp = box(
      root,
      (r.x0 + r.x1) / 2,
      -0.115,
      (r.z0 + r.z1) / 2,
      r.x1 - r.x0,
      0.04,
      r.z1 - r.z0,
      '#adb8ae',
    );
    ramp.rotation.x = -Math.atan2(0.23, r.z1 - r.z0);
    return pivot;
  });
  // The trolley's carriers (characters.ts), set out in a row on the island
  // counter with their labels toward the west aisle.
  const lunch = new T.Group();
  lunch.name = 'kitchen-lunch-carriers';
  lunch.position.set(KITCHEN_LUNCH.at[0], 0.9, KITCHEN_LUNCH.at[1]);
  root.add(lunch);
  for (let i = 0; i < 3; i++) {
    box(lunch, 0, 0.09, i * 0.56, 0.46, 0.18, 0.52, '#a4baa5');
    box(lunch, -0.236, 0.09, i * 0.56, 0.012, 0.18, 0.055, '#e1d0aa');
  }
  // The exterior's loading roll-up and the electrical room's pedestrian gate (alhambra-exterior.ts) open with their
  // stops' doors: found in the scene on first use, left as they are when the deliveries are off.
  let exterior: { rollup?: T.Object3D; gate?: T.Object3D } | null = null;
  function tick(time: number, enabled: boolean) {
    root.visible = enabled;
    if (enabled && !exterior && root.parent)
      exterior = {
        rollup: root.parent.getObjectByName('rear-loading-rollup'),
        gate: root.parent.getObjectByName('electrical-room-gate-leaf'),
      };
    vehicles.forEach((v, i) => {
      const p = sampleDelivery(i, time);
      v.root.visible = p.visible;
      v.root.position.copy(p.position);
      v.root.rotation.y = p.heading;
      v.tail.position.y = 1.4 + p.door * 0.65;
      doors[i].rotation.y = -Math.PI * 0.47 * p.door;
      const stop = deliveryStops[i];
      if (!enabled || !exterior) return;
      if (stop.kind === 'food' && exterior.rollup)
        exterior.rollup.position.y = 3.3 * p.door;
      if (stop.kind === 'package' && exterior.gate)
        exterior.gate.rotation.y = 1.45 * p.door;
    });
    const t = ((time % 720) + 720) % 720;
    lunch.visible = t >= KITCHEN_LUNCH.from && t < KITCHEN_LUNCH.to;
  }
  return { root, tick, vehicles, doors, lunch };
}
