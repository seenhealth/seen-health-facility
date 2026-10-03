import * as T from 'three';
import { createCharacter } from './characters';

/**
 * People on foot for the live lot: the participants who step off an arriving
 * vehicle and walk into the center, and the ones who come out to board a
 * departing one. Each walker is one of the model's characters (a senior
 * figure; a wheelchair user when the rider's record says so) moved along a
 * polyline of waypoints with their own height (ground, ramp, landing) and
 * speed, with the gait cycle driven by distance walked so the feet do not
 * slide. A walker is removed when it reaches the end of its path.
 */
export type WalkPoint = {
  x: number;
  z: number;
  y: number;
  /** m/s on the leg that ends here. */ speed?: number;
};
export type WalkerPerson = {
  name: string;
  initials?: string;
  wheelchair?: boolean;
};

/** Metres walked per gait cycle, as the activity engine uses (activity.ts REFERENCE_GAIT). */
const GAIT = 0.78;
const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

type Walker = {
  id: string;
  wheelchair: boolean;
  figure: ReturnType<typeof createCharacter>;
  path: WalkPoint[];
  /** Cumulative length at each waypoint. */
  marks: number[];
  s: number;
  walked: number;
  /** A wheelchair's tilt along the slope it is on (radians, nose down positive), eased between legs. */
  pitch: number;
  done: boolean;
  onDone?: () => void;
};

export function createWalkers(root: T.Object3D) {
  const walkers = new Map<string, Walker>();
  const lengths = (path: WalkPoint[]) => {
    const marks = [0];
    for (let i = 1; i < path.length; i++)
      marks.push(
        marks[i - 1] +
          Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z),
      );
    return marks;
  };
  function at(w: Walker, s: number) {
    const { path, marks } = w;
    let i = 1;
    while (i < marks.length - 1 && s > marks[i]) i++;
    const a = path[i - 1],
      b = path[i],
      len = marks[i] - marks[i - 1],
      t = len > 1e-6 ? Math.min(1, Math.max(0, (s - marks[i - 1]) / len)) : 1;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      heading: Math.atan2(b.x - a.x, b.z - a.z),
      /** Grade of the leg: rise over run, negative downhill. */
      grade: len > 1e-6 ? (b.y - a.y) / len : 0,
      speed: b.speed ?? (w.wheelchair ? 0.8 : 1.0),
    };
  }
  function pose(w: Walker, dt = 0) {
    const p = at(w, w.s);
    w.figure.root.position.set(p.x, p.y, p.z);
    w.figure.root.rotation.y = p.heading;
    // A wheelchair rolls with its wheels on the slope (a van's ramp, the switchback) instead of level through it;
    // people on foot stay upright.
    if (w.wheelchair) {
      const target = -Math.atan(p.grade);
      w.pitch = dt
        ? w.pitch + (target - w.pitch) * Math.min(1, dt * 8)
        : target;
      w.figure.root.rotation.x = w.pitch;
    }
    w.figure.pose(w.wheelchair ? 'roll' : 'walk', w.walked / GAIT, 1);
  }
  return {
    /** Start a walker at the first point of `path`; a second spawn with the same id replaces the first. */
    spawn(
      id: string,
      person: WalkerPerson,
      path: WalkPoint[],
      onDone?: () => void,
    ) {
      this.remove(id);
      if (path.length < 2) return;
      const wheelchair = !!person.wheelchair;
      const figure = createCharacter({
        id: `live-${id}`,
        role: 'participant',
        variant: hash(person.name) % 24,
        mobility: wheelchair ? 'wheelchair' : undefined,
      });
      figure.root.scale.setScalar(figure.profile.height);
      figure.root.traverse((o) => {
        if (o instanceof T.Mesh) o.castShadow = true;
      });
      root.add(figure.root);
      const w: Walker = {
        id,
        wheelchair,
        figure,
        path,
        marks: lengths(path),
        s: 0,
        walked: 0,
        pitch: 0,
        done: false,
        onDone,
      };
      figure.root.rotation.order = 'YXZ';
      walkers.set(id, w);
      pose(w);
    },
    remove(id: string) {
      const w = walkers.get(id);
      if (!w) return;
      root.remove(w.figure.root);
      walkers.delete(id);
    },
    tick(dt: number) {
      for (const w of Array.from(walkers.values())) {
        const end = w.marks[w.marks.length - 1];
        const speed = at(w, Math.min(end, w.s + 0.01)).speed;
        w.s = Math.min(end, w.s + speed * dt);
        w.walked += speed * dt;
        pose(w, dt);
        if (w.s >= end - 1e-6 && !w.done) {
          w.done = true;
          this.remove(w.id);
          w.onDone?.();
        }
      }
    },
    /** Distance from (x, z) to the nearest walker still on foot, or Infinity. */
    nearest(x: number, z: number) {
      let best = Infinity;
      for (const w of walkers.values()) {
        const p = w.figure.root.position;
        best = Math.min(best, Math.hypot(p.x - x, p.z - z));
      }
      return best;
    },
    has: (id: string) => walkers.has(id),
    get count() {
      return walkers.size;
    },
    /** Ids of walkers whose id starts with `prefix` (one vehicle's party). */
    ids(prefix: string) {
      return [...walkers.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}
