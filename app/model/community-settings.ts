import type { Vec2 } from './schema';
import dayProgram from '../data/day-program.json';
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
 * ring streets are at z≈41.3 / z≈-32.3 / x≈-44.4 / x≈54 and every pad sits on
 * the paper ground beyond them.
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
   * benches, a patio's corners); `npm run build:community` checks each stays
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
  /** Zone name in the trace and Measure (default `name`), e.g. 'Partner ADC · Seen layout'. */
  traceName?: string;
  subtitle: string;
  position: Vec2;
  heading: number;
  /** `back` extends the pad behind its origin (local −z) without moving the front edge. */
  pad: { w: number; d: number; back?: number };
  /** Access stub centre-line from the ring-street edge to the pad edge. */
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
  // Inside a stamped facility: its finished floor.
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
      return s.facility!.floorY ?? 0;
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
  { polygons: Vec2[][]; bounds: [Vec2, Vec2] } | null
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
 * with the setting's zone (`community:partner-adc/day-open`), or [].
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
 * counters, patio positions and the kerb crossing between drive and pad.
 */
export const careSettings: CareSetting[] = [
  define({
    id: 'home-lin',
    kind: 'home',
    name: "The Wongs' home",
    short: 'Home',
    subtitle: 'Home care · home health · pill packs · meals · home mods',
    position: [-84, 12],
    heading: Math.PI / 2,
    pad: { w: 30, d: 28 },
    road: { from: [-48.4, 12], to: [-70, 12] },
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
      // Van ramp foot → porch ramp: down the drive edge, a loop in from the side.
      crossA: [6.0, -4.0],
      crossB: [11.4, -4.8],
      crossC: [13.4, -6.2],
      crossD: [11.6, -7.2],
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
    position: [-84, -22],
    heading: Math.PI / 2,
    pad: { w: 24, d: 22 },
    road: { from: [-48.4, -22], to: [-73, -22] },
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
  define({
    id: 'hospital',
    kind: 'hospital',
    name: 'Community hospital · ED & inpatient',
    short: 'Hospital',
    subtitle: 'Admission, rounds and discharge coordination',
    position: [94, 14],
    heading: 0,
    pad: { w: 36, d: 30 },
    road: { from: [94, 36.3], to: [94, 29] },
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
      bayFront: [7.6, -6.5],
      walkway: [2.4, -5.4],
      edBay: [14, -5.4],
      edBayVan: [5, 2],
      sidewalkEnd: [9.5, 21.6],
      sidewalkPad: [9.5, 13.5],
      sidewalkIn: [9.5, -5.4],
    },
  }),
  define({
    id: 'specialist',
    kind: 'specialist',
    name: 'Cardiology & specialty clinic',
    short: 'Cardiology',
    subtitle: 'Contracted specialist visits with a Seen escort',
    position: [84, -56],
    heading: 0,
    pad: { w: 28, d: 26 },
    road: { from: [84, -35.8], to: [84, -43] },
    drive: { depth: 6, radius: 6.2, lanes: 1 },
    apron: { w: 10, d: 4.6 },
    services: ['specialist'],
    accent: '#6d8fb3',
    local: {
      kerb: [-0.4, -4.3],
      entrance: [0, -5.4],
      doorway: [-2.2, -6.2],
      checkIn: [3.2, -7.5],
      checkInB: [2.4, -6.9],
      deskEnd: [4.8, -9.2],
      lobbyMid: [4.6, -7.4],
      receptionMa: [3.2, -9.6],
      examSeat: [-6.4, -8.8],
      examMd: [-4.8, -8.5],
      examMa: [-7.9, -8.1],
      examIn: [-5.6, -6.8],
      waitA: [0.6, -7.8],
      waitB: [1.7, -7.8],
      waitFront: [1.2, -6.4],
      mdDesk: [-6.4, -10.3],
    },
  }),
  define({
    id: 'partner-adc',
    kind: 'partner-adc',
    name: 'Partner adult day center',
    short: 'Partner ADC',
    traceName: 'Partner ADC · Seen layout',
    subtitle:
      'Seen Health floor plan · partner day program · visiting Seen clinicians',
    position: [4, -68],
    heading: 0,
    pad: { w: 62, d: 50 }, // minimum; the facility footprint derives w and back
    road: { from: [4, -35.8], to: [4, -43] },
    drive: { depth: 6, radius: 6.2, lanes: 1 },
    apron: { w: 10, d: 3 },
    services: ['day-program'],
    accent: '#b39a5c',
    // Seen's own ground floor, its west entrance and arrival court facing the
    // street: facility (x, z) → pad (z + 0.99, −x − 8.15).
    facility: {
      id: 'seen-alhambra-planning',
      url: '/models/seen-alhambra-planning.json',
      frame: { position: [0.99, -8.15], heading: Math.PI / 2 },
      levelIds: ['ground'],
      excludeZoneIds: ['adjacent'],
      // Seen's day room as Seen furnishes it (front tables cleared), and two
      // dining places left open for wheelchairs.
      excludeObjectIds: [
        ...dayProgram.removedObjectIds,
        'dining-table-02-chair-3',
        'dining-table-04-chair-3',
      ],
      cutaway: true,
      labels: {
        'day-open': 'Day room',
        'rehab-open': 'Physical therapy',
        'dining-1421': 'Dining',
        'clinic-nurse': 'Nurse station',
        'lobby-arrival': 'Reception',
        'admin-workstations': 'Games lounge',
      },
      margin: 1.6,
      grounds: ['treeA', 'treeB', 'treeC', 'treeD', 'bench', 'patioMin', 'patioMax'],
    },
    local: {
      // Visiting staff: street sidewalk → court walk (between the drive and
      // the rehab block) → west door.
      sidewalkEnd: [8.8, 31.4],
      sidewalkPad: [8.8, 24.4],
      courtA: [8.85, 21.5],
      courtB: [8.6, 8.4],
      doorOutside: [0, 7.15], // facility (−15.3, −0.99)
      // The tai chi patio in the arrival court's west half, under a pergola.
      patioMin: [-20, 9],
      patioMax: [-11, 19],
      // Grounds (outside the footprint and the drive; validated).
      treeA: [-26.5, 19.5],
      treeB: [-26.5, 1.5],
      treeC: [-26.5, -17.5],
      treeD: [-16.5, 21.0],
      bench: [-19.3, 14.0],
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
  ed: 'Emergency care',
  discharge: 'Discharge coordination',
  'day-program': 'Partner day program',
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
