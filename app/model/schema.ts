export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Level = {
  id: string;
  name: string;
  elevation: number;
  order: number;
  referencePages: number[];
  elevationStatus: string;
  notes: string;
};
export type Zone = {
  id: string;
  name: string;
  short: string;
  color: string;
  levelId: string;
  polygon: Vec2[];
  referencePages: number[];
  floorMaterial: string;
  notes: string;
  publishedAreaSqFt: number | null;
  tracedFootprintSqFt: number;
  programId: string;
  wallHeight: number;
  wallHeightStatus: string;
  geometryStatus: string;
  spread: Vec2;
};
export type Room = {
  id: string;
  name: string;
  zoneId: string;
  levelId: string;
  polygon: Vec2[];
  kind: string;
  referencePages: number[];
  status: string;
  notes: string;
  floorMaterial?: string;
};
export type Wall = {
  id: string;
  zoneId: string;
  levelId: string;
  a: Vec2;
  b: Vec2;
  height: number;
  thickness: number;
  material: string;
  status: string;
  referencePages: number[];
};
export type Asset = {
  kind: string;
  dimensions: Vec3;
  material: string;
  modelUrl?: string;
  materials?: Record<string, string>;
  parameters?: Record<string, string | number | boolean>;
};
export type Instance = {
  id: string;
  assetId: string;
  zoneId: string;
  levelId: string;
  position: Vec3;
  rotation: number;
  scale: Vec3;
  roomId?: string | null;
  referencePages: number[];
  status: string;
  notes: string;
  navigationFootprints?: [number, number, number, number][];
  layer?:
    | 'furniture'
    | 'architecture'
    | 'wall-finish'
    | 'ceiling'
    | 'exterior'
    | 'roof';
};
export type MaterialSpec = {
  color: string;
  roughness: number;
  metalness?: number;
  pattern?: string;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  textureUrl?: string;
};
// Wall-local opening offsets and profiles keep the envelope portable to another site.
export type EnvelopeWall = {
  id: string;
  zoneId: string;
  a: Vec2;
  b: Vec2;
  height: number;
  thickness: number;
  material: string;
  profile?: Vec2[];
  detailIds?: string[];
  openings: {
    id: string;
    offset: number;
    width: number;
    sill: number;
    height: number;
    kind: 'window' | 'door';
    material: string;
  }[];
  status: string;
  referencePages: number[];
};
export type SourcePage = {
  page: number;
  title: string;
  group: string;
  image: string;
  text: string;
  findings: string;
  reviewStatus: string;
  evidenceType: string;
  label?: string;
  file?: string;
  mediaType?: 'image' | 'video';
  sourceName?: string;
};
export type Facility = {
  schemaVersion: '2.0';
  id: string;
  name: string;
  address: string;
  units: 'm';
  coordinateSystem: string;
  revision: string;
  exportFiles?: { glb: string; audit: string };
  source: {
    title: string;
    date: string;
    pages: number;
    author: string;
    file: string;
  };
  calibration: {
    method: string;
    status: string;
    pixelsPerMeter: number;
    sourcePixelOrigin: Vec2;
    referencePage: number;
    areaPage: number;
    anchorAreaSqFt: number;
    anchorPolygonPixels: Vec2[];
    notes: string;
  };
  levels: Level[];
  zones: Zone[];
  rooms: Room[];
  walls: Wall[];
  envelope?: {
    walls: EnvelopeWall[];
    loops: { id: string; wallIds: string[] }[];
    notes: string;
  };
  assets: Record<string, Asset>;
  objects: Instance[];
  materials: Record<string, MaterialSpec>;
  programs: {
    id: string;
    name: string;
    publishedSqFt: number;
    sourcePage: number;
  }[];
  referencePages: SourcePage[];
  interiorReview?: {
    date: string;
    title: string;
    accuracy: string;
    items: {
      photo: number;
      page: number;
      title: string;
      rooms: string[];
      matched: string;
      unresolved: string;
    }[];
  };
  accuracyIssues: {
    id: string;
    title: string;
    detail: string;
    status: string;
    pages: number[];
  }[];
  site: {
    image: string;
    imageSize: Vec2;
    bounds: Vec2[];
    imagePixelBounds: number[];
    buildingOutline: Vec2[];
    referencePages: number[];
    notes: string;
  };
  roofSections: {
    id: string;
    kind: string;
    bounds: Vec2[];
    eaveHeight: number;
    rise: number;
    referencePages: number[];
    status: string;
    structure?: 'generic' | 'components';
    polygon?: Vec2[];
    parapet?: boolean;
  }[];
  details: {
    id: string;
    position: Vec3;
    dimensions: Vec3;
    material: string;
    surface: string;
    rotation: Vec3;
    zoneId?: string | null;
    status: string;
    referencePages: number[];
  }[];
  facade: {
    height: number;
    status: string;
    wallMaterial: string;
    glazingMaterial: string;
    referencePages: number[];
  };
  dimensions: {
    id: string;
    value: number;
    unit: string;
    sourceValue: string;
    pages: number[];
    status: string;
    meaning: string;
  }[];
};
export const polygonArea = (p: Vec2[]) =>
  Math.abs(
    p.reduce(
      (a, b, i) =>
        a + b[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * b[1],
      0,
    ),
  ) / 2;
export const center = (p: Vec2[]): Vec2 => [
  p.reduce((v, q) => v + q[0], 0) / p.length,
  p.reduce((v, q) => v + q[1], 0) / p.length,
];
export const ft2 = (v: number) => v / 0.09290304;
export function validateFacility(input: unknown): Facility {
  if (!input || typeof input !== 'object')
    throw new Error('Choose a facility specification JSON file.');
  const m = input as Facility;
  if (m.schemaVersion !== '2.0' || m.units !== 'm')
    throw new Error(
      'This viewer accepts facility schema 2.0 with dimensions in meters.',
    );
  const fail = (s: string): never => {
    throw new Error(s);
  };
  const num = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10000;
  const str = (v: unknown) =>
    typeof v === 'string' && v.length > 0 && v.length < 1000;
  const pair = (v: unknown): v is Vec2 =>
    Array.isArray(v) && v.length === 2 && v.every(num);
  const vec = (v: unknown): v is Vec3 =>
    Array.isArray(v) && v.length === 3 && v.every(num);
  const poly = (v: unknown): v is Vec2[] =>
    Array.isArray(v) &&
    v.length >= 3 &&
    v.length <= 2000 &&
    v.every(pair) &&
    polygonArea(v) > 0.0001;
  const arr = (v: unknown, label: string, max = 10000) => {
    if (!Array.isArray(v) || v.length > max) fail(`Invalid ${label} list.`);
  };
  const url = (v: unknown) =>
    typeof v === 'string' &&
    ((v.startsWith('/') && !v.startsWith('//')) || /^https:\/\//.test(v));
  if (
    !str(m.id) ||
    !str(m.name) ||
    !str(m.address) ||
    !str(m.revision) ||
    !m.source ||
    !str(m.source.title) ||
    !str(m.source.date) ||
    !str(m.source.author) ||
    !url(m.source.file) ||
    !Number.isInteger(m.source.pages) ||
    m.source.pages < 1
  )
    fail('Missing facility identity or valid source.');
  for (const k of [
    'levels',
    'zones',
    'rooms',
    'walls',
    'objects',
    'programs',
    'referencePages',
    'accuracyIssues',
    'roofSections',
    'dimensions',
    'details',
  ] as const)
    arr(m[k], k);
  if (
    !m.calibration ||
    !num(m.calibration.pixelsPerMeter) ||
    m.calibration.pixelsPerMeter <= 0 ||
    !pair(m.calibration.sourcePixelOrigin)
  )
    fail('Invalid model calibration.');
  const pages = new Set<number>();
  for (const p of m.referencePages) {
    if (
      !Number.isInteger(p.page) ||
      p.page < 1 ||
      p.page > m.source.pages ||
      pages.has(p.page) ||
      !url(p.image) ||
      (p.file !== undefined && !url(p.file)) ||
      (p.mediaType !== undefined &&
        !['image', 'video'].includes(p.mediaType)) ||
      !str(p.title) ||
      !str(p.group) ||
      typeof p.text !== 'string' ||
      typeof p.findings !== 'string'
    )
      fail('Invalid source page.');
    pages.add(p.page);
  }
  const refs = (v: unknown) => {
    if (!Array.isArray(v) || !v.length || !v.every((p) => pages.has(p)))
      fail('A source reference is missing or invalid.');
  };
  if (
    !pages.has(m.calibration.referencePage) ||
    !str(m.calibration.status) ||
    typeof m.calibration.notes !== 'string'
  )
    fail('Invalid calibration evidence.');
  const levels = new Set<string>(),
    zones = new Set<string>(),
    ids = new Set<string>();
  const unique = (id: string) => {
    if (!str(id) || ids.has(id)) fail(`Repeated or invalid object ID: ${id}`);
    ids.add(id);
  };
  for (const l of m.levels) {
    if (
      !str(l.id) ||
      !str(l.name) ||
      typeof l.notes !== 'string' ||
      levels.has(l.id) ||
      !num(l.elevation) ||
      !num(l.order)
    )
      fail('Invalid level.');
    refs(l.referencePages);
    levels.add(l.id);
  }
  if (!levels.size || !m.zones.length)
    fail('At least one level and area are required.');
  if (!m.assets || !m.materials) fail('Missing reusable assets or materials.');
  for (const [id, a] of Object.entries(m.assets)) {
    if (
      !str(id) ||
      !str(a.kind) ||
      !vec(a.dimensions) ||
      a.dimensions.some((x) => x <= 0) ||
      !m.materials[a.material] ||
      (a.modelUrl && !url(a.modelUrl))
    )
      fail(`Invalid asset: ${id}`);
    if (
      a.materials &&
      Object.values(a.materials).some((id) => !m.materials[id])
    )
      fail(`Invalid material palette: ${id}`);
    if (
      a.parameters &&
      Object.values(a.parameters).some(
        (v) =>
          !(
            typeof v === 'boolean' ||
            (typeof v === 'string' && v.length < 1000) ||
            num(v)
          ),
      )
    )
      fail(`Invalid asset parameters: ${id}`);
  }
  for (const v of Object.values(m.materials))
    if (
      !/^#[0-9a-fA-F]{6}$/.test(v.color) ||
      !num(v.roughness) ||
      (v.textureUrl !== undefined && !url(v.textureUrl)) ||
      (v.emissive !== undefined && !/^#[0-9a-fA-F]{6}$/.test(v.emissive)) ||
      (v.emissiveIntensity !== undefined &&
        (!num(v.emissiveIntensity) || v.emissiveIntensity < 0))
    )
      fail('Invalid material.');
  for (const z of m.zones) {
    unique(z.id);
    if (
      !str(z.name) ||
      !str(z.short) ||
      typeof z.notes !== 'string' ||
      !Number.isFinite(z.tracedFootprintSqFt) ||
      (z.publishedAreaSqFt !== null && !Number.isFinite(z.publishedAreaSqFt)) ||
      !levels.has(z.levelId) ||
      !poly(z.polygon) ||
      !pair(z.spread) ||
      !m.materials[z.floorMaterial] ||
      !num(z.wallHeight) ||
      z.wallHeight <= 0 ||
      !/^#[0-9a-fA-F]{6}$/.test(z.color)
    )
      fail(`Invalid area: ${z.id}`);
    zones.add(z.id);
  }
  for (const r of m.rooms) {
    unique(r.id);
    if (!zones.has(r.zoneId) || !levels.has(r.levelId) || !poly(r.polygon))
      fail(`Invalid room: ${r.id}`);
  }
  for (const w of m.walls) {
    unique(w.id);
    if (
      !zones.has(w.zoneId) ||
      !levels.has(w.levelId) ||
      !pair(w.a) ||
      !pair(w.b) ||
      !num(w.height) ||
      w.height <= 0 ||
      !num(w.thickness) ||
      w.thickness <= 0 ||
      Math.hypot(w.a[0] - w.b[0], w.a[1] - w.b[1]) < 0.001
    )
      fail(`Invalid wall: ${w.id}`);
  }
  for (const o of m.objects) {
    unique(o.id);
    if (
      !m.assets[o.assetId] ||
      (o.zoneId !== 'site' && !zones.has(o.zoneId)) ||
      !vec(o.position) ||
      !vec(o.scale) ||
      o.scale.some((v) => v <= 0) ||
      !num(o.rotation)
    )
      fail(`Invalid furniture object: ${o.id}`);
    if (
      o.layer &&
      ![
        'furniture',
        'architecture',
        'wall-finish',
        'ceiling',
        'exterior',
        'roof',
      ].includes(o.layer)
    )
      fail(`Invalid presentation layer: ${o.id}`);
  }
  const roomMap = new Map(m.rooms.map((r) => [r.id, r]));
  const zoneMap = new Map(m.zones.map((z) => [z.id, z]));
  for (const r of m.rooms)
    if (
      !str(r.name) ||
      typeof r.notes !== 'string' ||
      (r.floorMaterial !== undefined && !m.materials[r.floorMaterial]) ||
      zoneMap.get(r.zoneId)?.levelId !== r.levelId
    )
      fail(`Invalid room metadata: ${r.id}`);
  for (const w of m.walls)
    if (
      !m.materials[w.material] ||
      zoneMap.get(w.zoneId)?.levelId !== w.levelId
    )
      fail(`Invalid wall material or level: ${w.id}`);
  for (const o of m.objects)
    if (
      (o.zoneId === 'site'
        ? o.levelId !== 'site'
        : !levels.has(o.levelId) ||
          zoneMap.get(o.zoneId)?.levelId !== o.levelId) ||
      (o.roomId && roomMap.get(o.roomId)?.zoneId !== o.zoneId)
    )
      fail(`Invalid object location: ${o.id}`);
  for (const list of [m.zones, m.rooms, m.walls, m.objects, m.details])
    for (const item of list) refs(item.referencePages);
  for (const p of m.programs)
    if (
      !str(p.id) ||
      !str(p.name) ||
      !Number.isFinite(p.publishedSqFt) ||
      p.publishedSqFt <= 0 ||
      !pages.has(p.sourcePage)
    )
      fail('Invalid program area.');
  for (const d of m.dimensions) {
    if (
      !str(d.id) ||
      !str(d.meaning) ||
      !str(d.sourceValue) ||
      !num(d.value) ||
      d.value <= 0
    )
      fail('Invalid documented dimension.');
    refs(d.pages);
  }
  for (const i of m.accuracyIssues) {
    if (
      !str(i.id) ||
      !str(i.title) ||
      typeof i.detail !== 'string' ||
      !str(i.status)
    )
      fail('Invalid accuracy issue.');
    refs(i.pages);
  }
  if (
    !m.site ||
    !url(m.site.image) ||
    !pair(m.site.imageSize) ||
    !Array.isArray(m.site.bounds) ||
    m.site.bounds.length !== 2 ||
    !m.site.bounds.every(pair) ||
    !poly(m.site.buildingOutline) ||
    !Array.isArray(m.site.imagePixelBounds) ||
    m.site.imagePixelBounds.length !== 4 ||
    !m.site.imagePixelBounds.every(num)
  )
    fail('Invalid site context.');
  for (const r of m.roofSections)
    if (
      !Array.isArray(r.bounds) ||
      r.bounds.length !== 2 ||
      !r.bounds.every(pair) ||
      !num(r.eaveHeight) ||
      !num(r.rise) ||
      (r.polygon !== undefined && !poly(r.polygon))
    )
      fail('Invalid roof section.');
  for (const d of m.details) {
    unique(d.id);
    if (
      !vec(d.position) ||
      !vec(d.dimensions) ||
      !vec(d.rotation) ||
      d.dimensions.some((v) => v <= 0) ||
      !m.materials[d.material] ||
      (d.zoneId && !zones.has(d.zoneId))
    )
      fail(`Invalid architectural detail: ${d.id}`);
  }
  if (m.envelope) {
    arr(m.envelope.walls, 'envelope walls');
    arr(m.envelope.loops, 'envelope loops');
    const envelopeIds = new Map<string, EnvelopeWall>();
    for (const w of m.envelope.walls) {
      unique(w.id);
      if (
        !zones.has(w.zoneId) ||
        !pair(w.a) ||
        !pair(w.b) ||
        !num(w.height) ||
        w.height <= 0 ||
        !num(w.thickness) ||
        w.thickness <= 0 ||
        !m.materials[w.material]
      )
        fail(`Invalid envelope wall: ${w.id}`);
      const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      if (length < 0.001) fail(`Empty envelope wall: ${w.id}`);
      if (
        w.profile &&
        (!w.profile.every(pair) ||
          w.profile.length < 2 ||
          Math.abs(w.profile[0][0]) > 0.001 ||
          Math.abs(w.profile.at(-1)![0] - length) > 0.001 ||
          w.profile.some(
            (p, i) =>
              p[1] < w.height || (i > 0 && p[0] <= w.profile![i - 1][0]),
          ))
      )
        fail(`Invalid envelope profile: ${w.id}`);
      if (
        w.detailIds &&
        (!Array.isArray(w.detailIds) ||
          !w.detailIds.length ||
          w.detailIds.some((id) => !m.details.some((d) => d.id === id)))
      )
        fail(`Missing facade detail: ${w.id}`);
      arr(w.openings, 'envelope openings');
      for (const o of w.openings) {
        unique(o.id);
        if (
          ![o.offset, o.width, o.sill, o.height].every(num) ||
          o.offset < 0 ||
          o.width <= 0 ||
          o.sill < 0 ||
          o.height <= 0 ||
          o.offset + o.width > length + 0.001 ||
          o.sill + o.height > w.height + 0.001 ||
          !['window', 'door'].includes(o.kind) ||
          !m.materials[o.material]
        )
          fail(`Invalid envelope opening: ${o.id}`);
      }
      for (let i = 0; i < w.openings.length; i++)
        for (let j = i + 1; j < w.openings.length; j++) {
          const a = w.openings[i],
            b = w.openings[j];
          if (
            a.offset < b.offset + b.width - 0.001 &&
            b.offset < a.offset + a.width - 0.001 &&
            a.sill < b.sill + b.height - 0.001 &&
            b.sill < a.sill + a.height - 0.001
          )
            fail(`Overlapping envelope openings: ${w.id}`);
        }
      refs(w.referencePages);
      envelopeIds.set(w.id, w);
    }
    const assigned = new Set<string>();
    for (const loop of m.envelope.loops) {
      if (
        !str(loop.id) ||
        !Array.isArray(loop.wallIds) ||
        loop.wallIds.length < 3
      )
        fail('Invalid envelope loop.');
      for (let i = 0; i < loop.wallIds.length; i++) {
        const id = loop.wallIds[i],
          w = envelopeIds.get(id),
          next = envelopeIds.get(loop.wallIds[(i + 1) % loop.wallIds.length]);
        if (
          !w ||
          !next ||
          assigned.has(id) ||
          Math.hypot(w.b[0] - next.a[0], w.b[1] - next.a[1]) > 0.001
        )
          fail(`Envelope perimeter is not closed: ${loop.id}`);
        assigned.add(id);
      }
    }
    if (assigned.size !== envelopeIds.size)
      fail('An envelope wall is missing from its perimeter.');
  }
  if (m.exportFiles && (!url(m.exportFiles.glb) || !url(m.exportFiles.audit)))
    fail('Invalid model download links.');
  return m;
}
