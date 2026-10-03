import type { Vec2 } from './schema';
import instanceSummaryFile from '../data/community-instances.json';
import {
  composeFrames,
  insidePolygon,
  toLocal,
  toWorld,
  transformPolygon,
  worldDir,
  type Frame,
} from './frame';

/**
 * Distributed-care settings around the Seen center: the registry that the
 * pads (geometry), vehicles (routes), people (tracks) and camera framings all
 * read. Data only, no three.js. Metres, +x east, +z toward the viewer; the
 * ring streets are neighborhood.ts `STREET_BEDS` and every pad sits on the
 * paper ground beyond them.
 *
 * Each setting has its own local frame: the pad centre is the origin, local +z
 * points at the access road (the "front"), local +x is to the right when
 * looking from the road at the building. `heading` rotates the frame into the
 * world exactly like `Object3D.rotation.y`.
 *
 * Fronts face +x or +z, the sides the default and Community cameras look at
 * (azimuth ≈ 0.58), so drop-offs, canopies and lobbies are in view: pads sit
 * west of the west street, south of the south street, or south of the north
 * street east of the center, each with its stub on its front.
 */
export type SettingKind =
  | 'home'
  | 'pharmacy'
  | 'hospital'
  | 'specialist'
  | 'partner-adc'
  | 'seen-center';
/**
 * Horseshoe drive: an entry leg at local x = +radius, a half circle whose
 * centre sits `depth` m behind the pad's front edge, and an exit leg at
 * local x = -radius. Vehicles travel it clockwise seen from above, so their
 * passenger (right) side faces the building at the apex. A second lane, when
 * present, runs `LANE` m outside the first.
 */
export type DriveLoop = { depth: number; radius: number; lanes: 1 | 2 };
/**
 * A real facility specification (schema 2.0) stamped on the pad instead of
 * schematic massing (facility-instance.ts). Its footprint, from the generated
 * summary (app/data/community-instances.json, `npm run build:community`),
 * sizes the pad and gives people inside it the floor height.
 */
export type CareFacility = {
  /** Expected Facility.id; equal to the viewer's model id → stamped from that model, no fetch. */
  id: string;
  /** Root-relative spec URL, like sites.ts `model` ('/models/….json'). */
  url: string;
  /** Facility origin and rotation in the setting's local frame. */
  frame: Frame;
  levelIds?: string[];
  excludeZoneIds?: string[];
  excludeObjectIds?: string[];
  /** Cut walls at the cutaway height (default true); instances ignore the main building's wall mode. */
  cutaway?: boolean;
  labels?: boolean | Record<string, string>;
  /** Finished floor height (default 0; a home uses PORCH_Y so the porch meets its door). */
  floorY?: number;
  /** Clearance kept between the footprint and the pad edge (default 1.6 m). */
  margin?: number;
  /**
   * Anchors of things the pad's site builder draws on the grounds (trees,
   * benches, planting beds); `npm run build:community` checks each stays
   * at least 1 m outside the footprint.
   */
  grounds?: string[];
};
export type CareSetting = {
  id: string;
  kind: SettingKind;
  name: string;
  /** Short display name: trace places, story badges ('Partner ADC', 'Home', 'Pharmacy'). */
  short: string;
  /** Zone name in the trace and Measure (default `name`), e.g. 'Partner ADC'. */
  traceName?: string;
  subtitle: string;
  position: Vec2;
  heading: number;
  /** `back` extends the pad behind its origin (local −z) without moving the front edge. */
  pad: { w: number; d: number; back?: number };
  /**
   * Access stub centre-line: from the near edge of the ring street it joins
   * (`from`) to the pad's front edge (`to`), as validate-community-traffic.mjs
   * checks.
   */
  road: { from: Vec2; to: Vec2 };
  drive: DriveLoop;
  /** Paved apron under the drop-off apex (local z extent behind the apex). */
  apron: { w: number; d: number };
  /** Named world positions: door, porch, counter, bed, label, … */
  anchors: Record<string, Vec2>;
  services: string[];
  accent: string;
  facility?: CareFacility;
};
/** A room of a stamped facility, in the setting's local frame or the world. */
export type SettingRoom = {
  id: string;
  name: string;
  /** Registry display name when the room is labelled. */
  label?: string;
  zoneId: string;
  anchor: Vec2;
  polygon: Vec2[];
};
/** One setting's entry in the generated summary (setting-local, 2 dp). */
export type InstanceSummary = {
  facilityId: string;
  revision: string;
  floorY: number;
  /** The registry and cast inputs it was generated from (drift check). */
  inputs: {
    frame: Frame;
    levelIds: string[];
    excludeZoneIds: string[];
    excludeObjectIds: string[];
    castSha1: string | null;
  };
  /** Polygons of the drawn zones. */
  footprint: Vec2[][];
  /**
   * Surfaces people stand on above the floor (a stage deck, riser tiers, a
   * ramp landing: facility-instance.ts `standingSurfaces`), `y` above the
   * instance floor; omitted when there are none.
   */
  platforms?: { polygon: Vec2[]; y: number }[];
  rooms: SettingRoom[];
};
export type InstanceSummaries = {
  version: 1;
  instances: Record<string, InstanceSummary>;
};

export const LANE = 3.4;
export const STREET_Y = -0.23;
export const PAD_Y = -0.05;
export const PORCH_Y = 0.3;
export const SETTING_ZONE_PREFIX = 'community:';
export const settingZone = (id: string) => `${SETTING_ZONE_PREFIX}${id}`;
/** Source id of the community layer (`ActorSpec.sourceId` after composition). */
export const COMMUNITY_SOURCE_ID = 'community';
/** The filter view the community layer adds to the activity panel. */
export const COMMUNITY_VIEW = {
  id: 'community',
  label: 'Homes, pharmacy, hospital & partners',
};

// A setting's frame follows the one documented convention (frame.ts):
// local → world like `Object3D.rotation.y`.
export { toLocal, toWorld, worldDir };
/** Local z of the pad's front edge and of the stub's street end. */
export function frontZ(s: CareSetting) {
  return s.pad.d / 2;
}
export function streetZ(s: CareSetting) {
  return toLocal(s, s.road.from)[1];
}
export function laneRadius(s: CareSetting, lane: 0 | 1) {
  return s.drive.radius + lane * LANE;
}
/** Local point on a lane's arc at angle `deg` (+90 = entry leg, 0 = apex, -90 = exit leg). */
export function arcPoint(s: CareSetting, lane: 0 | 1, deg: number): Vec2 {
  const r = laneRadius(s, lane),
    cz = frontZ(s) - s.drive.depth,
    a = (deg * Math.PI) / 180;
  return [r * Math.sin(a), cz - r * Math.cos(a)];
}
/**
 * The lane's drive-through as world points: street end of the entry leg,
 * the arc sampled every 15°, street end of the exit leg. `from`/`to` trim it
 * to an arc angle range (degrees, entry 90 → exit -90).
 */
export function lanePath(
  s: CareSetting,
  lane: 0 | 1,
  from = 90,
  to = -90,
  streetEnd = true,
): Vec2[] {
  const r = laneRadius(s, lane),
    zStreet = streetZ(s),
    zFront = frontZ(s),
    cz = zFront - s.drive.depth,
    pts: Vec2[] = [];
  if (from >= 90) {
    if (streetEnd) pts.push([r, zStreet], [r, (zStreet + zFront) / 2]);
    pts.push([r, zFront], [r, (zFront + cz) / 2]);
  }
  for (let a = Math.min(from, 90); a >= Math.max(to, -90); a -= 15)
    pts.push(arcPoint(s, lane, a));
  if (to <= -90) {
    pts.push([-r, (zFront + cz) / 2], [-r, zFront]);
    if (streetEnd) pts.push([-r, (zStreet + zFront) / 2], [-r, zStreet]);
  }
  return pts.map((p) => toWorld(s, p));
}
/** World pose of a vehicle stopped on a lane's arc: position + travel direction. */
export function lanePose(s: CareSetting, lane: 0 | 1, deg: number) {
  const a = (deg * Math.PI) / 180;
  return {
    position: toWorld(s, arcPoint(s, lane, deg)),
    direction: worldDir(s, [-Math.cos(a), -Math.sin(a)]),
  };
}
/** True when a world point lies on the drive band, the stub legs or the apron. */
export function isPaved(s: CareSetting, p: Vec2) {
  const [x, z] = toLocal(s, p),
    zF = frontZ(s),
    cz = zF - s.drive.depth,
    rIn = s.drive.radius - LANE / 2 - 0.05,
    rOut = laneRadius(s, (s.drive.lanes - 1) as 0 | 1) + LANE / 2 + 0.05,
    apexZ = cz - s.drive.radius;
  if (
    Math.abs(x) <= s.apron.w / 2 &&
    z >= apexZ - s.apron.d - 0.05 &&
    z <= apexZ + 0.05
  )
    return true;
  if (z >= cz)
    return Math.abs(x) >= rIn && Math.abs(x) <= rOut && z <= streetZ(s) + 0.5;
  const r = Math.hypot(x, z - cz);
  return r >= rIn && r <= rOut;
}
/** Ground height under a walker at a world point of a setting. */
export const groundY = (s: CareSetting, p: Vec2) =>
  isPaved(s, p) ? STREET_Y : PAD_Y;
const boundsCache = new Map<string, [Vec2, Vec2]>();
/**
 * Ground height anywhere: on or beside a pad (and along its stub) it follows
 * that setting's paving; elsewhere it is the street level of the center's lot.
 */
export function groundYAt(p: Vec2) {
  // Inside a stamped facility: its finished floor, or the highest surface
  // people stand on there (a stage, a riser tier).
  for (const s of careSettings) {
    const fp = footprintCache(s);
    if (
      fp &&
      p[0] >= fp.bounds[0][0] &&
      p[0] <= fp.bounds[1][0] &&
      p[1] >= fp.bounds[0][1] &&
      p[1] <= fp.bounds[1][1] &&
      fp.polygons.some((poly) => insidePolygon(p, poly))
    )
      return (
        (s.facility!.floorY ?? 0) +
        fp.platforms.reduce(
          (top, pl) => (pl.y > top && insidePolygon(p, pl.polygon) ? pl.y : top),
          0,
        )
      );
  }
  for (const s of careSettings) {
    let b = boundsCache.get(s.id);
    if (!b) boundsCache.set(s.id, (b = padBounds(s)));
    const m = 4;
    if (
      p[0] >= b[0][0] - m &&
      p[0] <= b[1][0] + m &&
      p[1] >= b[0][1] - m &&
      p[1] <= b[1][1] + m
    )
      return groundY(s, p);
    const [a, c] = [s.road.from, s.road.to],
      dx = c[0] - a[0],
      dz = c[1] - a[1],
      l2 = dx * dx + dz * dz || 1,
      t = Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2),
      ),
      d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
    if (d <= laneRadius(s, (s.drive.lanes - 1) as 0 | 1) + LANE / 2 + 3)
      return groundY(s, p);
  }
  return STREET_Y;
}
/** The pad rectangle's world corners (the setting's zone polygon). */
export function padPolygon(
  s: Pick<CareSetting, 'position' | 'heading' | 'pad'>,
): Vec2[] {
  const back = -s.pad.d / 2 - (s.pad.back ?? 0);
  return (
    [
      [-s.pad.w / 2, back],
      [s.pad.w / 2, back],
      [s.pad.w / 2, s.pad.d / 2],
      [-s.pad.w / 2, s.pad.d / 2],
    ] as Vec2[]
  ).map((p) => toWorld(s, p));
}
/** World-space x/z of the pad rectangle (for framing and validation). */
export function padBounds(
  s: Pick<CareSetting, 'position' | 'heading' | 'pad'>,
): [Vec2, Vec2] {
  const corners = padPolygon(s);
  const xs = corners.map((p) => p[0]),
    zs = corners.map((p) => p[1]);
  return [
    [Math.min(...xs), Math.min(...zs)],
    [Math.max(...xs), Math.max(...zs)],
  ];
}

/** World frame of a setting's facility origin (setting frame ∘ `facility.frame`). */
export function facilityWorldFrame(
  s: Pick<CareSetting, 'position' | 'heading' | 'facility'>,
): Frame {
  if (!s.facility) throw new Error('This setting has no facility');
  return composeFrames(s, s.facility.frame);
}
const footprints = new Map<
  string,
  {
    polygons: Vec2[][];
    bounds: [Vec2, Vec2];
    platforms: { polygon: Vec2[]; y: number }[];
  } | null
>();
function footprintCache(s: CareSetting) {
  if (!footprints.has(s.id)) {
    const summary = instanceSummary(s);
    if (!summary) footprints.set(s.id, null);
    else {
      const polygons = summary.footprint.map((poly) =>
          transformPolygon(s, poly),
        ),
        xs = polygons.flat().map((p) => p[0]),
        zs = polygons.flat().map((p) => p[1]);
      footprints.set(s.id, {
        polygons,
        bounds: [
          [Math.min(...xs), Math.min(...zs)],
          [Math.max(...xs), Math.max(...zs)],
        ],
        platforms: (summary.platforms ?? []).map((pl) => ({
          polygon: transformPolygon(s, pl.polygon),
          y: pl.y,
        })),
      });
    }
  }
  return footprints.get(s.id)!;
}
/** World polygons of a setting's stamped facility (its drawn zones), or []. */
export function instanceFootprint(s: CareSetting): Vec2[][] {
  return footprintCache(s)?.polygons ?? [];
}
/**
 * Rooms of a setting's stamped facility in world coordinates, ids prefixed
 * with the setting's zone (`community:partner-adc/adhc-hall`), or [].
 */
export function instanceRooms(s: CareSetting): SettingRoom[] {
  return (instanceSummary(s)?.rooms ?? []).map((r) => ({
    ...r,
    id: `${settingZone(s.id)}/${r.id}`,
    anchor: toWorld(s, r.anchor),
    polygon: transformPolygon(s, r.polygon),
  }));
}

type Draft = Omit<CareSetting, 'anchors'> & { local: Record<string, Vec2> };
/** Label plate size (world x × z), drawn by community-pads.ts. */
export const LABEL_PLATE = { w: 14.2, d: 2.6 };
/**
 * The label plate sits just past the pad's viewer-facing (max z) edge. When
 * the access stub leaves through that edge, the plate moves beside the stub
 * on its exit-leg side (the sidewalk runs along the entry leg).
 */
function labelAnchor(s: Omit<CareSetting, 'anchors'>): Vec2 {
  const [[minX], [maxX, maxZ]] = padBounds(s),
    z = maxZ + LABEL_PLATE.d,
    { from, to } = s.road,
    alongZ = Math.abs(to[1] - from[1]) > Math.abs(to[0] - from[0]),
    crosses = alongZ && Math.max(from[1], to[1]) > maxZ;
  if (!crosses) return [(minX + maxX) / 2, z];
  const half =
      laneRadius(s as CareSetting, (s.drive.lanes - 1) as 0 | 1) + LANE / 2,
    side = Math.sign(worldDir(s, [-1, 0])[0]) || -1;
  return [to[0] + side * (half + 0.6 + LABEL_PLATE.w / 2), z];
}
const instanceSummaries = (instanceSummaryFile as unknown as InstanceSummaries)
  .instances;
/**
 * Settings whose facility has no current generated summary (never generated,
 * or the registry's facility config changed since): their pads keep the
 * authored size. `validate-community` fails while this is not empty.
 */
export const missingInstances: string[] = [];
const sameJSON = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** True when a summary was generated from this facility config. */
export function summaryMatches(cfg: CareFacility, summary: InstanceSummary) {
  const i = summary.inputs;
  return (
    summary.facilityId === cfg.id &&
    summary.floorY === (cfg.floorY ?? 0) &&
    sameJSON(i.frame, cfg.frame) &&
    (!cfg.levelIds || sameJSON(i.levelIds, cfg.levelIds)) &&
    sameJSON(i.excludeZoneIds, cfg.excludeZoneIds ?? []) &&
    sameJSON(i.excludeObjectIds, cfg.excludeObjectIds ?? [])
  );
}
/**
 * The pad a building needs: wide enough for the footprint plus the margin on
 * both sides, extended behind the origin (`back`) when the building is deep,
 * never smaller than authored. The front edge, drive and anchors stay put; a
 * building past the front edge is an authoring error.
 */
export function derivePad(
  s: Pick<CareSetting, 'id' | 'pad' | 'facility'>,
  summary: InstanceSummary,
): CareSetting['pad'] {
  const margin = s.facility?.margin ?? 1.6,
    pts = summary.footprint.flat(),
    xs = pts.map((p) => Math.abs(p[0])),
    zs = pts.map((p) => p[1]),
    front = Math.max(...zs) + margin;
  if (front > s.pad.d / 2 + 1e-9)
    throw new Error(
      `${s.id}: the building reaches ${front.toFixed(2)} m, past the pad's front edge at ${s.pad.d / 2} m; move facility.frame or grow pad.d`,
    );
  return {
    w: Math.max(s.pad.w, 2 * (Math.max(...xs) + margin)),
    d: s.pad.d,
    back: Math.max(
      s.pad.back ?? 0,
      -Math.min(...zs) + margin - s.pad.d / 2,
      0,
    ),
  };
}
/** The current summary of a setting's facility, or undefined. */
export function instanceSummary(
  s: Pick<CareSetting, 'id' | 'facility'>,
): InstanceSummary | undefined {
  const summary = instanceSummaries[s.id];
  return s.facility && summary && summaryMatches(s.facility, summary)
    ? summary
    : undefined;
}
const define = (d: Draft): CareSetting => {
  const { local, ...authored } = d;
  const summary = instanceSummary(authored);
  if (authored.facility && !summary) missingInstances.push(authored.id);
  const rest = summary
    ? { ...authored, pad: derivePad(authored, summary) }
    : authored;
  const anchors = Object.fromEntries(
    Object.entries(local).map(([k, p]) => [k, toWorld(rest, p)]),
  );
  const [[minX, minZ], [maxX, maxZ]] = padBounds(rest);
  anchors.label ??= labelAnchor(rest);
  anchors.padMin = [minX, minZ];
  anchors.padMax = [maxX, maxZ];
  return { ...rest, anchors };
};

/**
 * Local anchor layout per setting. Apex stops are read from `lanePose`, so the
 * anchors here are the on-foot places: doors, the porch, the ramp, beds,
 * counters, the front walk and the kerb crossing between drive and pad.
 */
export const careSettings: CareSetting[] = [
  define({
    id: 'home-wong',
    kind: 'home',
    name: "The Wongs' home",
    short: 'Home',
    subtitle: 'Home care · home health · pill packs · meals · home mods',
    position: [-81.2, 12],
    heading: Math.PI / 2,
    // The owner allows the pad to grow 8 m west (behind the house) for the
    // deeper plan and its yard; front edge, drive and anchors stay put.
    pad: { w: 30, d: 28, back: 8 },
    road: { from: [-46.2, 12], to: [-67.2, 12] },
    drive: { depth: 7, radius: 6.2, lanes: 2 },
    apron: { w: 0, d: 0 },
    services: [
      'home-care',
      'home-health',
      'pill-packs',
      'meals',
      'home-mods',
      'after-hours',
    ],
    accent: '#c98f5a',
    // The Wongs' bungalow (public/models/seen-home-wong.json). Its plan frame
    // is world-aligned (+x east, +z south): world = P + (−92.0, 12). The front
    // wall's outer face (P x 3.2) lies on the porch slab's back edge (local
    // z −7.6) and the front door's opening on the `door` anchor; the porch
    // zone is left to the pad, which already draws it (validate-home.mjs).
    facility: {
      id: 'seen-home-wong',
      url: '/models/seen-home-wong.json',
      frame: { position: [0, -10.8], heading: -Math.PI / 2 },
      levelIds: ['ground'],
      excludeZoneIds: ['home-zone-porch'],
      cutaway: true,
      floorY: PORCH_Y,
      // Name plates only where the name reads at the room's label anchor: in
      // the bedrooms and the dining nook it would lie under the bed or the
      // table, and a short "Bath" clears the shower (validate-home.mjs).
      labels: {
        'home-living': 'Living room',
        'home-kitchen': 'Kitchen',
        'home-bath': 'Bath',
      },
      margin: 1.6,
    },
    local: {
      kerb: [0.2, -4.4],
      rampFoot: [9.9, -6.3],
      rampMid: [6.6, -6.3],
      rampTop: [3.4, -6.3],
      rampTopBehind: [4.3, -6.3],
      rampTopAside: [3.2, -5.5],
      rampFootAside: [9.9, -5.0],
      porch: [0.4, -6.3],
      porchSeat: [-4.0, -7.0],
      porchSeatVia1: [-1.0, -5.3],
      porchSeatVia2: [-4.4, -5.7],
      porchTable: [2.6, -7.1],
      porchAside: [2.6, -6.0],
      porchFrontEast: [2.4, -5.6],
      porchGreet: [1.6, -5.5],
      porchStepOt: [1.6, -5.4],
      porchNurse: [-3.4, -6.2],
      porchDriver: [-1.3, -6.8],
      wheelchairSpot: [-2.2, -6.9],
      pcaCare: [-2.8, -5.7],
      porchStep: [-3.4, -5.6],
      porchStepFoot: [-3.4, -4.5],
      door: [0.4, -7.6],
      // Where a visitor waits on the porch, just outside the front door.
      doorStep: [0.4, -6.9],
      inside: [0.4, -9.6],
      crate: [7.6, -3.4],
      crateSide: [8.6, -4.4],
      rampWork: [6.4, -4.9],
      barWork: [1.6, -4.6],
      stall: [-9.6, 11],
      stallStand: [-8.0, 11],
      sidewalkEnd: [12.5, 35],
      sidewalkPad: [12.5, 13.5],
      sidewalkEndOut: [11.7, 35],
      sidewalkPadOut: [11.7, 13.5],
      padCorner: [12.4, -2],
      padCornerFar: [-12.4, -2],
      padCornerNear: [-12.4, 9],
      // Van ramp foot → porch ramp: along the drive edge, then a short loop
      // round onto the ramp foot (14 m from the van's ramp, a walker or a
      // pushed wheelchair at about 1.3 m/s).
      crossA: [6.0, -4.0],
      crossB: [10.8, -4.7],
      crossC: [11.5, -5.6],
      crossD: [10.7, -6.3],
      // The aide's kerb-side places and walks.
      pcaWait: [2.4, -4.6],
      handover: [-0.6, -3.6],
      porchApproach: [-3.0, -4.4],
      pcaMeetA: [8.0, -4.4],
      pcaMeetB: [2.0, -2.6],
      pcaWalkA: [6.0, -3.0],
      pcaWalkB: [10.5, -3.2],
      pcaBack: [4.0, -3.2],
      // Meals driver and pharmacy courier from the drive to the porch.
      mealsWalkA: [-3.6, -2.0],
      mealsWalkB: [-4.6, -4.2],
      courierWalkA: [-2.4, 0.8],
      courierWalkB: [-2.2, -1.5],
      // The van driver's way back from the porch ramp.
      driverBackA: [8.0, -4.6],
      driverBackB: [5.0, -3.6],
    },
  }),
  define({
    id: 'pharmacy',
    kind: 'pharmacy',
    name: 'Partner pharmacy · pill packs',
    short: 'Pharmacy',
    subtitle: 'Weekly blister packs prepared and couriered',
    position: [-81.2, -22],
    heading: Math.PI / 2,
    pad: { w: 24, d: 22 },
    road: { from: [-46.2, -22], to: [-70.2, -22] },
    drive: { depth: 6, radius: 6.2, lanes: 1 },
    apron: { w: 9, d: 2.4 },
    services: ['pill-packs'],
    accent: '#6f9d7b',
    local: {
      counterFront: [-1.6, -5.5],
      counterBack: [-1.6, -7.6],
      bench: [3.0, -7.8],
      benchTop: [3.0, -8.9],
      doorway: [1.0, -4.7],
      loading: [-0.8, -3.6],
      loadingSide: [0.6, -3.6],
      loadingCar: [0, -1.2],
    },
  }),
  // --- Mrs. Lin's home ---------------------------------------------------------
  // The story's participant lives here with her daughter; a Seen van takes
  // her to the center in the morning and brings her home in the afternoon
  // (docs/COMMUNITY.md, "Mrs. Lin's home"). South of the pharmacy, its stub
  // on the west street's southern reach, which only the fleet's off-site runs
  // share. The same senior-friendly bungalow as the Wongs',
  // stamped with the same plan, frame and exclusions (validate-home.mjs), so
  // the porch, ramp and crossing anchors below are theirs.
  define({
    id: 'home-lin',
    kind: 'home',
    name: "Mrs. Lin's home",
    short: 'Lin home',
    subtitle: 'Lives with her daughter · Seen van door to door',
    position: [-81.2, -56],
    heading: Math.PI / 2,
    pad: { w: 30, d: 28, back: 8 },
    road: { from: [-46.2, -56], to: [-67.2, -56] },
    drive: { depth: 7, radius: 6.2, lanes: 2 },
    apron: { w: 0, d: 0 },
    services: ['transport'],
    accent: '#9b7a96',
    // The Wongs' plan (public/models/seen-home-wong.json): world = P + (−92.0, −56).
    facility: {
      id: 'seen-home-wong',
      url: '/models/seen-home-wong.json',
      frame: { position: [0, -10.8], heading: -Math.PI / 2 },
      levelIds: ['ground'],
      excludeZoneIds: ['home-zone-porch'],
      cutaway: true,
      floorY: PORCH_Y,
      labels: {
        'home-living': 'Living room',
        'home-kitchen': 'Kitchen',
        'home-bath': 'Bath',
      },
      margin: 1.6,
    },
    local: {
      kerb: [0.2, -4.4],
      rampFoot: [9.9, -6.3],
      rampMid: [6.6, -6.3],
      rampTop: [3.4, -6.3],
      rampTopAside: [3.2, -5.5],
      porch: [0.4, -6.3],
      porchSeat: [-4.0, -7.0],
      porchAside: [2.6, -6.0],
      porchGreet: [1.6, -5.5],
      porchStep: [-3.4, -5.6],
      porchStepFoot: [-3.4, -4.5],
      door: [0.4, -7.6],
      doorStep: [0.4, -6.9],
      inside: [0.4, -9.6],
      // Van ramp foot → porch ramp, as at the Wongs' (crossA–D).
      crossA: [6.0, -4.0],
      crossB: [10.8, -4.7],
      crossC: [11.5, -5.6],
      crossD: [10.7, -6.3],
      // Her daughter: watching for the van on the porch, and meeting it
      // beside the ramp foot, off the crossing.
      porchWait: [2.0, -5.6],
      rampFootSouth: [10.4, -7.0],
      sidewalkEnd: [12.5, 35],
      sidewalkPad: [12.5, 13.5],
      padCorner: [12.4, -2],
    },
  }),
  define({
    id: 'hospital',
    kind: 'hospital',
    name: 'Community hospital · ED & inpatient',
    short: 'Hospital',
    subtitle: 'Admission, rounds and discharge coordination',
    position: [110.3, 8.2],
    heading: 0,
    pad: { w: 36, d: 30 },
    road: { from: [110.3, 31.2], to: [110.3, 23.2] },
    drive: { depth: 8, radius: 7, lanes: 1 },
    apron: { w: 10, d: 4.6 },
    services: ['ed', 'discharge'],
    accent: '#b9645c',
    local: {
      kerb: [-1.4, -4.9],
      kerbStep: [0.6, -4.9],
      entrance: [0, -6.2],
      lobby: [0, -8.4],
      bed: [7.6, -11.0],
      patient: [7.6, -8.3],
      mdBedside: [6.0, -8.6],
      mdOut: [5.5, -7.2],
      bayFrontL: [6.2, -5.7],
      bayFrontR: [9.8, -5.7],
      cmBedside: [9.2, -8.6],
      rnBedside: [7.6, -6.9],
      viaLeftA: [6.5, -7.5],
      viaLeftB: [6.5, -9.2],
      huddleA: [10.4, -7.3],
      huddleB: [11.6, -8.6],
      huddleC: [9.8, -9.6],
      // The discharge nurse's call to Seen: out from under the ward bay's
      // roof (its edge at z −6.2), so the call arc rises clear of it.
      rnVia: [9.0, -7.4],
      rnPhone: [8.9, -5.5],
      bayFront: [7.6, -6.5],
      walkway: [2.4, -5.4],
      // The hospitalist's call to Seen's on-call nurse after the ambulance
      // handoff: on the sidewalk, under the open sky.
      edPhone: [9.9, 3.9],
      sidewalkEnd: [9.5, 21.6],
      sidewalkPad: [9.5, 13.5],
      sidewalkIn: [9.5, -5.4],
    },
  }),
  define({
    id: 'specialist',
    kind: 'specialist',
    name: 'Specialty clinic · cardiology, optometry & imaging',
    short: 'Specialty clinic',
    subtitle: 'Specialist visits, eye exams and X-rays with a Seen escort',
    position: [100.3, -56],
    heading: 0,
    // Wide for the ground floor's row of rooms behind the open front, from
    // west to east: cardiology exam room, lobby (the entrance faces the
    // drive), optometry and imaging (community-pads.ts `buildSpecialist`).
    pad: { w: 44, d: 26 },
    road: { from: [100.3, -35.8], to: [100.3, -43] },
    drive: { depth: 6, radius: 6.2, lanes: 1 },
    apron: { w: 10, d: 4.6 },
    services: ['specialist', 'optometry', 'imaging'],
    accent: '#6d8fb3',
    local: {
      kerb: [-0.4, -4.3],
      entrance: [0, -5.4],
      doorway: [-2.2, -6.2],
      checkIn: [3.2, -7.5],
      checkInB: [2.4, -6.9],
      deskEnd: [4.7, -9.2],
      lobbyMid: [4.5, -7.4],
      receptionMa: [3.2, -9.6],
      examSeat: [-6.4, -8.8],
      examMd: [-4.8, -8.5],
      examMa: [-7.9, -8.1],
      examIn: [-5.6, -6.8],
      waitA: [0.6, -7.8],
      waitB: [1.7, -7.8],
      waitFront: [1.2, -6.4],
      mdDesk: [-6.4, -10.3],
      // Walk-ins from a Seen ride at the street kerb: up the sidewalk stub
      // (in on its west half, out on its east half), along the plinth
      // outside the drive and in through the open front east of the canopy.
      sidewalkEnd: [8.55, 19.5],
      sidewalkPad: [8.55, 12.4],
      sidewalkEndOut: [9.25, 19.5],
      sidewalkPadOut: [9.25, 12.4],
      approachA: [8.85, 5.0],
      approachB: [7.6, -1.4],
      approachC: [5.2, -4.6],
      approachAOut: [9.6, 5.0],
      approachBOut: [8.3, -1.1],
      approachCOut: [5.9, -4.2],
      // The lobby's front: where staff call a patient in, where an escort
      // meets her (clear of the way in from the gallery), and the gallery
      // along the open front to the rooms east of the lobby (each partition
      // stops 1.6 m short of the front).
      lobbyCall: [2.0, -6.45],
      escortMeet: [2.0, -7.15],
      galleryA: [5.3, -6.25],
      galleryB: [10.5, -6.35],
      // Optometry (x 5.4–10.4): a mirrored lane, the exam chair facing the
      // mirror on the imaging partition with the acuity screen behind it on
      // the lobby partition (about 7.8 m by way of the mirror); the slit
      // lamp's instrument table at the chair's right, the optometrist's
      // stool beside it, the instrument stand behind the chair's left; the
      // technician's counter and the optometrist's desk at the back. The
      // patient sits down from the chair's left side.
      optoIn: [9.0, -6.65],
      optoAside: [9.75, -7.6],
      optoWest: [6.1, -7.1],
      optoSeat: [7.4, -8.3],
      optoChart: [5.4, -8.3],
      optoMirror: [10.4, -8.3],
      optoSlit: [7.55, -7.35],
      optoStool: [8.25, -7.4],
      optoStand: [7.15, -9.1],
      optoTech: [8.05, -8.95],
      optoApproach: [8.6, -8.8],
      optoSide: [7.45, -8.85],
      optoCounter: [6.3, -10.65],
      optoDesk: [9.3, -10.6],
      // Imaging (x 10.6–17.6): the shielded control alcove in the front
      // corner by the optometry partition, its lead-glass window facing the
      // X-ray table; the patient's chair at the table's east end, under the
      // overhead tube.
      imagingIn: [16.5, -6.35],
      imagingTable: [15.2, -7.35],
      imagingSeat: [16.85, -7.35],
      imagingTech: [15.55, -8.2],
      imagingAround: [13.5, -8.3],
      alcoveGate: [13.5, -6.6],
      alcoveIn: [11.8, -6.65],
      imagingConsole: [11.9, -8.45],
    },
  }),
  define({
    id: 'partner-adc',
    kind: 'partner-adc',
    name: 'Partner adult day center',
    short: 'Partner ADC',
    traceName: 'Partner ADC',
    subtitle: 'Partner day program · dance, choir, arts, classes and light rehab',
    position: [4, -68],
    heading: 0,
    pad: { w: 34, d: 40 }, // minimum; the facility footprint derives w and back
    road: { from: [4, -35.8], to: [4, -48] },
    drive: { depth: 6, radius: 6.2, lanes: 1 },
    apron: { w: 10, d: 3 },
    services: ['day-program'],
    accent: '#b39a5c',
    // The partner's own adult day health care center
    // (public/models/seen-partner-adhc.json): its plan frame is the pad's
    // frame 6.6 m further back, so the entry pavilion's front doors (P z
    // 10.2) face the drop-off apron 1.1 m ahead and the hall's stage is at
    // the back. Three table-end chairs, one classroom chair and one armchair
    // in the group-room circle are left out as wheelchair places.
    facility: {
      id: 'seen-partner-adhc',
      url: '/models/seen-partner-adhc.json',
      frame: { position: [0, -6.6], heading: 0 },
      levelIds: ['ground'],
      excludeObjectIds: [
        'adhc-chair-a-west',
        'adhc-chair-a-east',
        'adhc-chair-b-west',
        'adhc-class-table-3b-chair-2',
        'adhc-group-chair-5',
      ],
      cutaway: true,
      // No plate in the hall: at its label anchor (the strip between the
      // dance floor and the first row of tables) the chairs hide it from the
      // front, and the stage, tables and dance floor name the room anyway.
      labels: {
        'adhc-studio': 'Studio',
        'adhc-classroom': 'Classroom',
        'adhc-group-room': 'Group room',
        'adhc-rehab': 'Rehab',
      },
      margin: 1.6,
      grounds: ['treeA', 'treeB', 'treeC', 'treeD', 'bench', 'bedWest', 'bedEast'],
    },
    local: {
      // Visiting staff: the street sidewalk → down the pad east of the drive
      // → along the entry pavilion's front → the front doors (P (0, 11.0)).
      sidewalkEnd: [8.8, 31.4],
      sidewalkPad: [8.8, 19.4],
      frontWalk: [8.8, 4.4],
      doorOutside: [0, 4.4],
      // Camera and story anchors: the dance floor's centre, the stage and
      // where the visiting PT works beside the parallel bars in the rehab.
      hall: [0, -9.6],
      stage: [0, -15.8],
      ptStand: [-8.4, -14.0],
      // Grounds (outside the footprint and the drive; validated).
      treeA: [-15.0, -15.5],
      treeB: [15.0, -15.5],
      treeC: [-15.0, -2.5],
      treeD: [15.0, 4.6],
      bench: [-9.6, 2.6],
      bedWest: [-9.4, 1.3],
      bedEast: [9.4, 1.3],
    },
  }),
];
export const careSettingById = (id: string) =>
  careSettings.find((s) => s.id === id);
/** Facility specifications the community layer stamps (for static builds). */
export const instanceFacilityUrls = (): string[] => [
  ...new Set(
    careSettings.flatMap((s) => (s.facility ? [s.facility.url] : [])),
  ),
];
/** Service badges shown on label plates and in docs. */
export const serviceLabels: Record<string, string> = {
  'home-care': 'Personal care',
  'home-health': 'Home health',
  'pill-packs': 'Pill packs',
  meals: 'Home-delivered meals',
  'home-mods': 'Home modifications',
  'after-hours': '24/7 nurse line',
  specialist: 'Specialist visits',
  optometry: 'Eye exams',
  imaging: 'X-ray & imaging',
  ed: 'Emergency care',
  discharge: 'Discharge coordination',
  'day-program': 'Partner day program',
  transport: 'Door-to-door transport',
};
/** Interaction categories contributed by the community layer (id, panel label). */
export const COMMUNITY_CATEGORIES: [string, string][] = [
  ['home', 'Home care & home health'],
  ['pharmacy', 'Pharmacy & pill packs'],
  ['specialist', 'Specialist visits'],
  ['hospital', 'Hospital & discharge'],
  ['partner', 'Partner day center'],
  ['after-hours', 'After-hours nurse line'],
];
