import type { Vec2 } from './schema';

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
 * A facility specification stamped on a pad (SPEC-facility-instance §5.1):
 * written against that contract before facility-instance.ts lands. Until the
 * instance chassis reads it, nothing does and the pad keeps its massing.
 */
export type CareFacility = {
  /** Expected Facility.id; equal to the viewer's model id → stamped from that model, no fetch. */
  id: string;
  /** Root-relative spec URL, like sites.ts `model` ('/models/….json'). */
  url: string;
  /** Facility origin and rotation in the setting's local frame (frame.ts `Frame`). */
  frame: { position: Vec2; heading: number };
  levelIds?: string[];
  excludeZoneIds?: string[];
  excludeObjectIds?: string[];
  cutaway?: boolean;
  labels?: boolean | Record<string, string>;
  /** Finished floor height (default 0; the home uses PORCH_Y so the porch meets its door). */
  floorY?: number;
  /** Clearance kept between the footprint and the pad edge (default 1.6 m). */
  margin?: number;
};
export type CareSetting = {
  id: string;
  kind: SettingKind;
  name: string;
  subtitle: string;
  position: Vec2;
  heading: number;
  /** `back` extends the pad behind its origin (local −z) without moving the front edge (read once the instance derivation lands). */
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
  /** The building drawn from a facility specification instead of the massing. */
  facility?: CareFacility;
};

export const LANE = 3.4;
export const STREET_Y = -0.23;
export const PAD_Y = -0.05;
export const PORCH_Y = 0.3;
export const SETTING_ZONE_PREFIX = 'community:';
export const settingZone = (id: string) => `${SETTING_ZONE_PREFIX}${id}`;

export function toWorld(
  s: Pick<CareSetting, 'position' | 'heading'>,
  p: Vec2,
): Vec2 {
  const c = Math.cos(s.heading),
    sn = Math.sin(s.heading);
  return [
    s.position[0] + p[0] * c + p[1] * sn,
    s.position[1] - p[0] * sn + p[1] * c,
  ];
}
export function toLocal(
  s: Pick<CareSetting, 'position' | 'heading'>,
  p: Vec2,
): Vec2 {
  const c = Math.cos(s.heading),
    sn = Math.sin(s.heading),
    dx = p[0] - s.position[0],
    dz = p[1] - s.position[1];
  return [dx * c - dz * sn, dx * sn + dz * c];
}
/** Local direction vector rotated into the world (no translation). */
export function worldDir(s: Pick<CareSetting, 'heading'>, d: Vec2): Vec2 {
  const c = Math.cos(s.heading),
    sn = Math.sin(s.heading);
  return [d[0] * c + d[1] * sn, -d[0] * sn + d[1] * c];
}
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
  return (
    [
      [-s.pad.w / 2, -s.pad.d / 2],
      [s.pad.w / 2, -s.pad.d / 2],
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
const define = (d: Draft): CareSetting => {
  const { local, ...rest } = d;
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
    subtitle: 'Home care · home health · pill packs · meals · home mods',
    position: [-84, 12],
    heading: Math.PI / 2,
    // The owner allows the pad to grow 8 m west (behind the house) for the
    // deeper plan and its yard; front edge, drive and anchors stay put.
    pad: { w: 30, d: 28, back: 8 },
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
    // The Wongs' bungalow (public/models/seen-home-wong.json). Its plan frame
    // is world-aligned (+x east, +z north): world = P + (−94.8, 12). The front
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
      labels: {
        'home-living': 'Living room',
        'home-kitchen': 'Kitchen',
        'home-dining': 'Dining',
        'home-bath': 'Accessible bath',
        'home-primary': 'Bedroom',
        'home-bedroom-2': 'Bedroom 2',
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
    subtitle: 'Contracted day program with visiting Seen therapy',
    position: [8, -64],
    heading: 0,
    pad: { w: 32, d: 26 },
    road: { from: [8, -35.8], to: [8, -51] },
    drive: { depth: 6, radius: 6.2, lanes: 1 },
    apron: { w: 10, d: 3 },
    services: ['day-program'],
    accent: '#b39a5c',
    local: {
      entrance: [2, -4.4],
      lead: [-11.4, -3.8],
      leadTables: [-11.4, -9.6],
      tcA: [-14, -5.6],
      tcB: [-11.4, -5.6],
      tcC: [-8.8, -5.6],
      tcD: [-14, -7.8],
      tcE: [-11.4, -7.8],
      tcF: [-8.8, -7.8],
      seatA: [-13.2, -9.9],
      seatB: [-13.2, -12.1],
      seatC: [-9.0, -9.9],
      seatD: [-9.0, -12.1],
      chairE: [-15.2, -5.0],
      chairF: [-15.2, -8.4],
      ptStand: [-12.2, -6.7],
      ptGreet: [-9.6, -3.6],
      tableFace: [-11.1, -11],
      sidewalkEnd: [8.7, 27.5],
      sidewalkPad: [8.7, 13.5],
      patioCorner: [8.7, -2.5],
      patioEdge: [-6.2, -2.5],
    },
  }),
];
export const careSettingById = (id: string) =>
  careSettings.find((s) => s.id === id);
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
