import * as T from 'three';
import { validateFacility, type Facility } from './schema';
import { buildArrivalVan, fadeVehicle, updateArrivalVan } from './arrival';
import {
  careSettingById,
  careSettings,
  facilityWorldFrame,
  LABEL_PLATE,
  PAD_Y,
  padBounds,
  type CareSetting,
} from './community-settings';
import { buildCareSetting } from './community-pads';
import {
  buildFacilityInstance,
  type FacilityInstance,
} from './facility-instance';
import {
  buildCommunityVehicleBody,
  communityVehicles,
  sampleCommunityVehicle,
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
/** Orthographic zoom × metres of extent: five pads and the site ≈ 0.42. */
const NETWORK_ZOOM = 88;
/** Orthographic zoom × pad size: a 30 m home pad ≈ 2.2. */
const PAD_ZOOM = 66;
type Mat = (id: string) => T.MeshStandardMaterial;
export type CommunityLayerOptions = {
  /** Fetch + validate a facility by its registry URL (default: fetch(url) → json → validateFacility). */
  loadFacility?: (url: string) => Promise<Facility>;
  /** Material resolver for another facility (default: the layer's `mat`). */
  materialFor?: (facility: Facility) => Mat;
};
/** The default loader, as app/page.tsx loads the viewer's own model. */
const fetchFacility = (url: string) =>
  fetch(url)
    .then((r) =>
      r.ok ? r.json() : Promise.reject(Error(`${url}: ${r.status}`)),
    )
    .then(validateFacility);
/**
 * The distributed-care layer around the center: every setting's pad, the
 * community vehicles' bodies and camera framings for the whole network and
 * each setting. The people come from `communitySource()`, composed into the
 * care-day source; the vehicles' samplers are registered with the activity
 * engine (`createActivity(…, registerCommunityVehicles)`) so riders sit in
 * them.
 *
 * A setting with a `facility` gets that specification stamped on its pad
 * (facility-instance.ts) in place of its massing: synchronously when it is
 * the viewer's own model (no fetch), otherwise once `loadFacility` resolves,
 * keeping the massing until then and on failure. Instances are static
 * cutaways that ignore the main building's wall mode.
 */
export function buildCommunityLayer(
  model: Facility,
  mat: Mat,
  options: CommunityLayerOptions = {},
) {
  const root = new T.Group();
  root.name = 'community-layer';
  root.userData = {
    accuracy:
      'Illustrative distributed-care settings on the paper ground beyond the ring streets; positions, massing and timings are not surveyed.',
  };
  const pads = new Map<string, T.Group>(),
    instances = new Map<string, FacilityInstance>();
  let disposed = false;
  for (const setting of careSettings) {
    const pad = buildCareSetting(setting, mat, {
      massing: setting.facility?.id !== model.id,
    });
    pads.set(setting.id, pad);
    root.add(pad);
  }
  const materialFor = options.materialFor ?? (() => mat),
    loadFacility = options.loadFacility ?? fetchFacility;
  function stamp(s: CareSetting, f: Facility) {
    const cfg = s.facility!;
    if (disposed) return;
    if (f.id !== cfg.id) {
      console.warn(
        `Community instance ${s.id}: expected facility ${cfg.id}, got ${f.id}; keeping the massing`,
      );
      return;
    }
    const inst = buildFacilityInstance(f, facilityWorldFrame(s), {
      ...cfg,
      mat: f === model ? mat : materialFor(f),
      floorY: cfg.floorY ?? 0,
      groundY: PAD_Y,
      name: `instance-${s.id}`,
    });
    const pad = pads.get(s.id)!;
    pad.add(inst.root);
    // The massing stays in the scene (so dispose() frees it), hidden.
    const massing = pad.getObjectByName('massing');
    if (massing) massing.visible = false;
    instances.set(s.id, inst);
  }
  // The viewer's own facility is stamped before the first await, so it exists
  // when this function returns; others resolve later.
  const ready = Promise.all(
    careSettings.map(async (s) => {
      if (!s.facility) return;
      if (s.facility.id === model.id)
        try {
          return stamp(s, model);
        } catch (e) {
          console.error('Community instance failed to build', s.id, e);
          return;
        }
      try {
        stamp(s, await loadFacility(s.facility.url));
      } catch (e) {
        console.warn(
          'Community instance unavailable; keeping the massing',
          s.id,
          e,
        );
      }
    }),
  ).then(() => undefined);
  const bodies = communityVehicles.map((v) => {
    if (v.kind === 'van') {
      // The shared fleet body in the registry's livery letter.
      const van = buildArrivalVan(model, v.variant ?? 'A', mat);
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
        fadeVehicle(b.object, pose.opacity ?? 1);
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
      zoom: PAD_ZOOM / Math.max(s.pad.w, s.pad.d + (s.pad.back ?? 0)),
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
    /** The stamped instance of a setting, or null (not stamped yet, failed, or none). */
    instance: (settingId: string): FacilityInstance | null =>
      instances.get(settingId) ?? null,
    /** Resolves when every setting with a facility is stamped or has fallen back to its massing. */
    ready,
    /** Stops late loads from adding to a disposed scene. */
    dispose() {
      disposed = true;
    },
  };
}
export type CommunityLayer = ReturnType<typeof buildCommunityLayer>;
