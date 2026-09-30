import * as T from 'three';
import schedule from '../data/street-traffic.json';
// Separate street lanes, with holding points upstream of the site's driveways.
const circuits = [0, 1].map((i) => {
  const o = i * 3.3;
  return new T.CatmullRomCurve3(
    [
      [-40.5, 39.4 + o],
      [49, 39.4 + o],
      [52.2 + o, 36],
      [52.2 + o, -27.5],
      [49, -30.7 - o],
      [-40.5, -30.7 - o],
      [-43.8 - o, -27.5],
      [-43.8 - o, 36],
    ].map((p) => new T.Vector3(p[0], -0.18, p[1])),
    true,
    'catmullrom',
    0.15,
  );
});
const holding = circuits.map((curve, i) => {
  const target = new T.Vector3(
    ...((i ? [-47.1, -0.18, -20] : [42, -0.18, -30.7]) as [
      number,
      number,
      number,
    ]),
  );
  let best = 0,
    distance = Infinity;
  for (let j = 0; j < 3000; j++) {
    const d = curve.getPointAt(j / 3000).distanceToSquared(target);
    if (d < distance) {
      best = j / 3000;
      distance = d;
    }
  }
  return best;
});
export function streetTripProgress(elapsed: number, duration: number) {
  const t = T.MathUtils.clamp(elapsed, 0, duration),
    ramp = 3;
  const distance =
    t < ramp
      ? (t * t) / (2 * ramp)
      : t > duration - ramp
        ? duration - ramp - (duration - t) ** 2 / (2 * ramp)
        : t - ramp / 2;
  return distance / (duration - ramp);
}
export function streetRoute(index: number, progress: number) {
  const direction = index ? -1 : 1;
  const phase = (((holding[index] + progress * direction) % 1) + 1) % 1;
  const position = circuits[index].getPointAt(phase),
    d = circuits[index].getTangentAt(phase).multiplyScalar(direction);
  return { position, heading: Math.atan2(d.x, d.z), visible: true };
}
export function sampleStreetCar(index: number, time: number) {
  const t =
    ((time % schedule.duration) + schedule.duration) % schedule.duration;
  const trip = (schedule.trips[index] as number[][]).find(
    ([start, end]) => t >= start && t < end,
  );
  return {
    ...streetRoute(
      index,
      trip ? streetTripProgress(t - trip[0], trip[1] - trip[0]) : 0,
    ),
    phase: trip ? 'Driving' : 'Yielding at driveway approach',
  };
}
