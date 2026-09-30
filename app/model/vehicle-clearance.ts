import type { Vector3 } from 'three';
export type VehicleFootprint = {
  position: Vector3;
  heading: number;
  halfWidth: number;
  halfLength: number;
  visible?: boolean;
};
// Oriented footprints include bumpers and mirrors. Positive gap means disjoint
// footprints; the buffer leaves room for the front/rear swing while turning.
export function vehicleGap(a: VehicleFootprint, b: VehicleFootprint) {
  const af = [Math.sin(a.heading), Math.cos(a.heading)],
    ar = [af[1], -af[0]];
  const bf = [Math.sin(b.heading), Math.cos(b.heading)],
    br = [bf[1], -bf[0]];
  const dx = a.position.x - b.position.x,
    dz = a.position.z - b.position.z;
  return Math.max(
    ...[af, ar, bf, br].map(
      ([x, z]) =>
        Math.abs(dx * x + dz * z) -
        a.halfLength * Math.abs(af[0] * x + af[1] * z) -
        a.halfWidth * Math.abs(ar[0] * x + ar[1] * z) -
        b.halfLength * Math.abs(bf[0] * x + bf[1] * z) -
        b.halfWidth * Math.abs(br[0] * x + br[1] * z),
    ),
  );
}
