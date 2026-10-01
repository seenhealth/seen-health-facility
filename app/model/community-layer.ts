import * as T from 'three';
import type { Facility } from './schema';
import type { VehicleRegistry } from './activity';
import { buildArrivalVan, updateArrivalVan } from './arrival';
import { careSettingById, careSettings, padBounds } from './community-settings';
import { buildCareSetting } from './community-pads';
import {
  buildCommunityVehicleBody,
  communityVehicles,
  sampleCommunityVehicle,
  variantIndex,
  VEHICLE_DECOR,
} from './community-vehicles';

/** Camera framing: orbit target and orthographic zoom. */
export type Framing = { target: [number, number, number]; zoom: number };
/**
 * The distributed-care layer around the center: every setting's pad, the
 * community vehicles (registered with the activity engine so riders sit in
 * them) and camera framings for the whole network and each setting. The
 * people come from `communitySource()`, composed into the care-day source.
 */
export function buildCommunityLayer(
  model: Facility,
  mat: (id: string) => T.MeshStandardMaterial,
  vehicles: VehicleRegistry,
) {
  const root = new T.Group();
  root.name = 'community-layer';
  root.userData = {
    accuracy:
      'Illustrative distributed-care settings on the paper ground beyond the ring streets; positions, massing and timings are not surveyed.',
  };
  for (const setting of careSettings) root.add(buildCareSetting(setting, mat));
  const bodies = communityVehicles.map((v) => {
    vehicles.register(v.id, (t) => sampleCommunityVehicle(v.id, t), {
      label: v.name,
    });
    if (v.kind === 'van') {
      // The shared fleet body in the registry's livery letter.
      const van = buildArrivalVan(model, variantIndex(v.variant ?? 'A'), mat);
      van.root.name = v.id;
      root.add(van.root);
      return { v, van, object: van.root };
    }
    const body = buildCommunityVehicleBody(v.kind, v.accent);
    if (v.decor) VEHICLE_DECOR[v.decor](body);
    body.name = v.id;
    root.add(body);
    return { v, van: null, object: body };
  });
  function tick(time: number) {
    for (const b of bodies) {
      const pose = sampleCommunityVehicle(b.v.id, time);
      if (b.van)
        updateArrivalVan(
          b.van,
          {
            ...pose,
            door: pose.door ?? 0,
            ramp: pose.ramp ?? 0,
            phase: pose.phase ?? '',
          },
          true,
        );
      else {
        b.object.position.copy(pose.position);
        b.object.rotation.y = pose.heading;
        b.object.visible = pose.visible;
      }
      b.object.userData.phase = pose.phase;
    }
  }
  /** Whole network when no id is given; one setting's pad otherwise. */
  function frame(settingId?: string): Framing | null {
    if (!settingId) return { target: [5, 0, 0], zoom: 0.42 };
    const s = careSettingById(settingId);
    if (!s) return null;
    const [[x0, z0], [x1, z1]] = padBounds(s);
    return { target: [(x0 + x1) / 2, 0, (z0 + z1) / 2], zoom: 2.2 };
  }
  tick(0);
  return {
    root,
    tick,
    settings: careSettings,
    frame,
    vehicleIds: communityVehicles.map((v) => v.id),
  };
}
export type CommunityLayer = ReturnType<typeof buildCommunityLayer>;
