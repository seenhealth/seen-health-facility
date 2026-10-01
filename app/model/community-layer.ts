import * as T from 'three';
import type { Facility } from './schema';
import type { VehicleRegistry } from './activity';
import { buildArrivalVan, updateArrivalVan } from './arrival';
import {
  careSettingById,
  careSettings,
  LABEL_PLATE,
  padBounds,
} from './community-settings';
import { buildCareSetting } from './community-pads';
import {
  buildCommunityVehicleBody,
  communityVehicles,
  sampleCommunityVehicle,
  variantIndex,
  VEHICLE_DECOR,
} from './community-vehicles';

/**
 * Camera framing: orbit target and orthographic zoom, plus the azimuth from
 * which a setting's front (drive, canopy, lobby) is seen.
 */
export type Framing = {
  target: [number, number, number];
  zoom: number;
  azimuth?: number;
};
/**
 * Fade a car body toward `opacity` as it enters or leaves the map. Each body
 * owns its materials (`buildCommunityVehicleBody`), so only that car fades;
 * shadows drop while it is see-through.
 */
function fadeBody(body: T.Object3D, opacity: number) {
  if (body.userData.opacity === opacity) return;
  body.userData.opacity = opacity;
  const fading = opacity < 1;
  body.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    o.userData.castShadow ??= o.castShadow;
    o.castShadow = !fading && o.userData.castShadow;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const base = (m.userData.fade ??= {
        opacity: m.opacity,
        transparent: m.transparent,
        depthWrite: m.depthWrite,
      });
      m.opacity = base.opacity * opacity;
      m.depthWrite = fading ? false : base.depthWrite;
      const transparent = base.transparent || fading;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
    }
  });
}
/** Orthographic zoom × metres of extent: five pads and the site ≈ 0.42. */
const NETWORK_ZOOM = 88;
/** Orthographic zoom × pad size: a 30 m home pad ≈ 2.2. */
const PAD_ZOOM = 66;
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
        fadeBody(b.object, pose.opacity ?? 1);
      }
      b.object.userData.phase = pose.phase;
    }
  }
  // World x/z bounds of the whole network: every pad, its label plate and
  // the center's own site. They drive the network framing and the shadow
  // camera, so a new registry entry is framed and lit wherever it sits.
  const [[sx0, sz0], [sx1, sz1]] = model.site.bounds;
  const bounds = careSettings.reduce(
    ([[x0, z0], [x1, z1]], s) => {
      const [[a0, b0], [a1, b1]] = padBounds(s),
        [lx, lz] = s.anchors.label;
      return [
        [
          Math.min(x0, a0, lx - LABEL_PLATE.w / 2),
          Math.min(z0, b0, lz - LABEL_PLATE.d / 2),
        ],
        [
          Math.max(x1, a1, lx + LABEL_PLATE.w / 2),
          Math.max(z1, b1, lz + LABEL_PLATE.d / 2),
        ],
      ];
    },
    [
      [sx0, sz0],
      [sx1, sz1],
    ],
  );
  const [[bx0, bz0], [bx1, bz1]] = bounds;
  /** Radius around the origin (the sun's target) that the shadows must cover. */
  const shadowExtent =
    Math.ceil(
      Math.max(
        ...[
          [bx0, bz0],
          [bx0, bz1],
          [bx1, bz0],
          [bx1, bz1],
        ].map(([x, z]) => Math.hypot(x, z)),
      ),
    ) + 6;
  /** Whole network when no id is given; one setting's pad, seen from its front, otherwise. */
  function frame(settingId?: string): Framing | null {
    if (!settingId)
      return {
        target: [(bx0 + bx1) / 2, 0, (bz0 + bz1) / 2],
        zoom: NETWORK_ZOOM / Math.max(bx1 - bx0, bz1 - bz0),
      };
    const s = careSettingById(settingId);
    if (!s) return null;
    const [[x0, z0], [x1, z1]] = padBounds(s);
    return {
      target: [(x0 + x1) / 2, 0, (z0 + z1) / 2],
      zoom: PAD_ZOOM / Math.max(s.pad.w, s.pad.d),
      azimuth: s.heading,
    };
  }
  tick(0);
  return {
    root,
    tick,
    settings: careSettings,
    frame,
    bounds,
    shadowExtent,
    vehicleIds: communityVehicles.map((v) => v.id),
  };
}
export type CommunityLayer = ReturnType<typeof buildCommunityLayer>;
