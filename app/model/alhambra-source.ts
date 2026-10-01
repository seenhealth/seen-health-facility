import type { Facility } from './schema';
import {
  activityData,
  createVehicleRegistry,
  type ActivityData,
  type VehicleRegistry,
} from './activity';
import { sampleVan } from './arrival';
import { fleetParking } from './alhambra-fleet';
import { deliveryStops, sampleDelivery } from './deliveries';
import { composeSources } from './sources';
import { withFleetCrew } from './fleet-crew';
import { communitySource } from './community-people';
import {
  communityVehicles,
  sampleCommunityVehicle,
} from './community-vehicles';

/**
 * The Alhambra care day exactly as the viewer plays it: a base loop (the
 * bundled care day, or the story's loop with Mrs. Lin's itinerary) plus the
 * distributed-care layer around the center, with a driver in every fleet van
 * and the riders seated. The renderer, the Measure panel (metrics and trace),
 * `scripts/sim-report.mjs` and `scripts/validate-trace.mjs` all read this one
 * source, so every headline, trace and published report describes the same
 * people the scene animates.
 *
 * Memoised per base and model: callers share one ActivityData object, and with
 * it the engine's per-segment caches. Passing an already composed source
 * returns it unchanged.
 */
const memo = new WeakMap<ActivityData, WeakMap<Facility, ActivityData>>();
const composed = new WeakSet<ActivityData>();
export function alhambraSource(
  model: Facility,
  base: ActivityData = activityData,
): ActivityData {
  if (composed.has(base)) return base;
  let byModel = memo.get(base);
  if (!byModel) memo.set(base, (byModel = new WeakMap()));
  let data = byModel.get(model);
  if (!data) {
    data = withFleetCrew(composeSources(base, communitySource(model)));
    composed.add(data);
    byModel.set(model, data);
  }
  return data;
}

let registry: VehicleRegistry | null = null;
/**
 * Pure samplers for every Alhambra vehicle (fleet vans, delivery trucks and
 * the community vehicles) under the ids the engine registers, with the same
 * display labels. Metrics and the trace use it to seat riders where the scene
 * draws them; the viewer's own `activity.vehicles` answers the same ids.
 */
export function alhambraVehicles(): VehicleRegistry {
  if (registry) return registry;
  const r = createVehicleRegistry();
  fleetParking.forEach((_, i) => {
    const letter = String.fromCharCode(65 + i);
    r.register(`van-${letter.toLowerCase()}`, (t) => sampleVan(i, t), {
      label: `Van ${letter}`,
    });
  });
  deliveryStops.forEach((stop, i) =>
    r.register(stop.id, (t) => sampleDelivery(i, t), {
      label: `Delivery truck · ${stop.kind}`,
    }),
  );
  for (const v of communityVehicles)
    r.register(v.id, (t) => sampleCommunityVehicle(v.id, t), {
      label: v.name,
    });
  return (registry = r);
}
