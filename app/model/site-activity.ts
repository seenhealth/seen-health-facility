import * as T from 'three';
import { createActivity } from './activity';
import { buildSiteActivityData } from './site-activity-data';
import type { Facility } from './schema';

/** Share Alhambra's rigs, clock, poses, filters and tracking with each site's own rooms. */
export function createSiteActivity(
  model: Facility,
  scene: T.Scene,
  material?: (id: string) => T.MeshStandardMaterial,
) {
  return createActivity(model, scene, material, buildSiteActivityData(model));
}
