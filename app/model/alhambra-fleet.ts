import * as T from 'three';
export const fleetParking = Array.from({ length: 8 }, (_, i) => ({
  x: -28.1,
  z: -23.8 + i * 2.8,
  heading: -Math.PI / 2,
}));
export const extraVanWindows = [
  {
    id: 'van-c',
    name: 'Van C',
    inbound: [278, 300],
    unload: [306, 354],
    outbound: [358, 386],
    returning: [-2, -2],
    boarding: [-2, -2],
    leaving: [-2, -2],
  },
  {
    id: 'van-d',
    name: 'Van D',
    inbound: [390, 414],
    unload: [420, 468],
    outbound: [472, 502],
    returning: [-2, -2],
    boarding: [-2, -2],
    leaving: [-2, -2],
  },
];
type Window = {
  inbound: number[];
  unload: number[];
  outbound: number[];
  returning: number[];
  boarding: number[];
  leaving: number[];
};
// Reserve the shared driveway for one maneuver at a time. Passenger service
// has priority so the door/ramp and escort timelines stay synchronized.
export type FleetReservation = {
  van: number;
  start: number;
  end: number;
  requested: number;
};
const reservationCache = new WeakMap<Window[], FleetReservation[]>();
export function fleetReservations(windows: Window[]) {
  let booked = reservationCache.get(windows);
  if (booked) return booked;
  booked = windows.flatMap((v, van) =>
    [v.inbound, v.outbound, v.returning, v.leaving]
      .filter(([start, end]) => start >= 0 && end > start)
      .map(([start, end]) => ({ van, start, end, requested: start })),
  );
  const requests = [
    [4, 30, 64],
    [5, 155, 64],
    [6, 295, 48],
    [7, 405, 48],
  ];
  for (const [van, requested, duration] of requests) {
    let start = requested;
    for (const occupied of [...booked].sort((a, b) => a.start - b.start)) {
      if (start < occupied.end + 4 && start + duration > occupied.start - 4)
        start = occupied.end + 4;
    }
    booked.push({ van, requested, start, end: start + duration });
  }
  booked.sort((a, b) => a.start - b.start);
  reservationCache.set(windows, booked);
  return booked;
}
const curves = new Map<string, T.CatmullRomCurve3>();
function route(
  key: string,
  points: number[][],
  fraction: number,
  reverse = false,
) {
  let curve = curves.get(key);
  if (!curve) {
    curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(p[0], -0.23, p[1])),
      false,
      'centripetal',
    );
    curves.set(key, curve);
  }
  const t = T.MathUtils.clamp(fraction, 0, 1),
    position = curve.getPointAt(t),
    d = curve.getTangentAt(t);
  return { position, heading: Math.atan2(d.x, d.z) + (reverse ? 0 : Math.PI) };
}
export function sampleFleetVan(index: number, time: number, windows: Window[]) {
  const t = ((time % 720) + 720) % 720,
    park = fleetParking[index];
  const parked = {
    position: new T.Vector3(park.x, -0.23, park.z),
    heading: park.heading,
    visible: true,
    door: 0,
    ramp: 0,
    phase: 'Parked in assigned bay',
    reverse: false,
  };
  const v = windows[index];
  if (!v) {
    // Additional fleet vehicles make staggered neighborhood runs, returning to their own bays.
    const { start, end, requested } = fleetReservations(windows).find(
      (r) => r.van === index,
    )!;
    if (t >= requested && t < start)
      return { ...parked, phase: 'Yielding to driveway traffic' };
    if (t < start || t >= end) return parked;
    const u = (t - start) / (end - start);
    if (u < 0.2)
      return {
        ...parked,
        ...route(
          `fleet-pull-${index}`,
          [
            [park.x, park.z],
            [-20, park.z],
          ],
          u / 0.2,
        ),
        phase: 'Pulling out of assigned bay',
      };
    if (u < 0.78)
      return {
        ...parked,
        ...route(
          `fleet-run-${index}`,
          [
            [-20, park.z],
            [-18.7, park.z],
            [-19, -23],
            [-26, -29.2],
            [-42, -32],
            [-39, -30],
            [-22, -30],
            [-21, park.z],
            [-20, park.z],
          ],
          (u - 0.2) / 0.58,
        ),
        phase: 'Neighborhood route',
      };
    return {
      ...parked,
      ...route(
        `fleet-back-${index}`,
        [
          [-20, park.z],
          [park.x, park.z],
        ],
        (u - 0.78) / 0.22,
        true,
      ),
      phase: 'Reversing into assigned bay',
      reverse: true,
    };
  }
  for (const [a, b] of [v.inbound, v.returning])
    if (a >= 0 && t >= a && t < b) {
      const u = (t - a) / (b - a);
      if (u < 0.35)
        return {
          ...parked,
          ...route(
            `fleet-pull-${index}`,
            [
              [park.x, park.z],
              [-20, park.z],
            ],
            u / 0.35,
          ),
          phase: 'Pulling out of assigned bay',
        };
      return {
        ...parked,
        ...route(
          `fleet-in-${index}`,
          [
            [-20, park.z],
            [-18.7, park.z],
            [-18.7, park.z + 1.8],
            [-22, -1.5],
            [-23.5, 1.5],
            [-20.5, 1.5],
          ],
          (u - 0.35) / 0.65,
        ),
        phase: 'Arriving at drop-off',
      };
    }
  for (const [a, b] of [v.outbound, v.leaving])
    if (a >= 0 && t >= a && t < b) {
      const u = (t - a) / (b - a);
      if (u < 0.8)
        return {
          ...parked,
          ...route(
            `fleet-out-${index}`,
            [
              [-20.5, 1.5],
              [-19.2, 1.5],
              [-19, -23],
              [-26, -29.2],
              [-42, -32],
              [-39, -30],
              [-22, -30],
              [-21, park.z],
              [-20, park.z],
            ],
            u / 0.8,
          ),
          phase: 'Leaving drop-off for a route',
        };
      return {
        ...parked,
        ...route(
          `fleet-back-${index}`,
          [
            [-20, park.z],
            [park.x, park.z],
          ],
          (u - 0.8) / 0.2,
          true,
        ),
        phase: 'Reversing into assigned bay',
        reverse: true,
      };
    }
  const docked =
    (t >= v.inbound[1] && t < v.outbound[0]) ||
    (v.returning[0] >= 0 && t >= v.returning[1] && t < v.leaving[0]);
  if (docked) {
    let door = 0,
      ramp = 0;
    for (const [a, b] of [v.unload, v.boarding])
      if (a >= 0) {
        door = Math.max(
          door,
          T.MathUtils.smoothstep(t, a - 5, a - 2) *
            (1 - T.MathUtils.smoothstep(t, b + 1, b + 4)),
        );
        ramp = Math.max(
          ramp,
          T.MathUtils.smoothstep(t, a - 2, a + 2) *
            (1 - T.MathUtils.smoothstep(t, b - 2, b + 1)),
        );
      }
    return {
      ...parked,
      position: new T.Vector3(-20.5, -0.23, 1.5),
      heading: -Math.PI / 2,
      door,
      ramp,
      phase:
        t < v.outbound[0] ? 'Unloading & escort handoff' : 'Boarding for home',
    };
  }
  return parked;
}
