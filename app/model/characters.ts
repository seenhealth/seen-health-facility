import * as T from 'three';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import templates from '../data/character-templates.json';
import careTeam from '../data/care-team.json';

export type CharacterRole =
  | 'participant'
  | 'doctor'
  | 'nurse'
  | 'pt'
  | 'ot'
  | 'aide'
  | 'driver'
  | 'reception'
  | 'coordinator'
  | 'social-worker'
  | 'activities'
  | 'nutrition'
  | 'dietitian'
  | 'center-manager'
  | 'instructor';
export type Action =
  | 'ping-pong'
  | 'billiards'
  | 'wii'
  | 'mahjong'
  | 'karaoke'
  | 'idle'
  | 'walk'
  | 'escort'
  | 'consult'
  | 'treat'
  | 'exercise'
  | 'seated'
  | 'tabletop'
  | 'document'
  | 'serve'
  | 'greet'
  | 'roll'
  | 'ride'
  | 'perform'
  | 'clap'
  | 'present'
  | 'conversation'
  | 'device'
  | 'dance'
  | 'tai-chi'
  | 'write'
  | 'craft'
  | 'music'
  | 'listen'
  | 'qigong'
  | 'fan-dance'
  | 'opera'
  | 'erhu'
  | 'tea'
  | 'board-game'
  | 'watch'
  | 'knit'
  | 'cards'
  | 'read';
/** Guest-instructor attire: one silhouette and colour signature per style. */
export type CostumeStyle = 'taichi' | 'tang' | 'qipao' | 'opera' | 'tcm-coat';
export type Costume = {
  style: CostumeStyle;
  color: string;
  trim: string;
  /** Opera: water-sleeve colour. */
  accent?: string;
};
/**
 * Loop-seconds per cycle for the slow cultural actions; poses repeat exactly
 * with this period (each divides the 720 s care day) and clips() bakes one
 * full period. Other actions keep their 2 s clips.
 */
export const actionPeriods: Partial<Record<Action, number>> = {
  'tai-chi': 16,
  qigong: 12,
  'fan-dance': 6,
  opera: 8,
  erhu: 3,
  tea: 8,
  'board-game': 8,
  watch: 10,
  knit: 3,
  cards: 6,
  read: 12,
};
/** Seated table activities: they always sit (a chair or wheelchair). */
const TABLE_ACTIONS = new Set<Action>([
  'board-game',
  'watch',
  'knit',
  'cards',
  'read',
]);
export type CharacterSpec = {
  id: string;
  role: CharacterRole;
  variant: number;
  profileId?: string;
  mobility?: 'cane' | 'walker' | 'wheelchair';
  seated?: boolean;
  assisted?: boolean;
  cargo?: 'package' | 'food';
};
export const roleNames: Record<CharacterRole, string> = {
  participant: 'Participant',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pt: 'Physical therapist',
  ot: 'Occupational therapist',
  aide: 'CNA / care aide',
  driver: 'Driver',
  reception: 'Front desk',
  coordinator: 'Care coordinator',
  'social-worker': 'Social worker',
  activities: 'Activities team',
  nutrition: 'Food service',
  dietitian: 'Dietitian',
  'center-manager': 'Center manager',
  instructor: 'Guest instructor',
};
export const characterLibrary = templates;
const roles = templates.roles as Record<
  string,
  { wardrobe: string; color: string; detail?: string }
>;
// One palette for the figures and the story overlay: IDT colours come from the
// care-team roster; front desk and food service (outside the IDT) from the templates.
const teamColors: Record<string, string> = Object.fromEntries(
  careTeam.members.map((m) => [m.characterRole, m.color]),
);
const participantWardrobe = careTeam.palette.participantWardrobe;
export const roleColors = Object.fromEntries(
  (Object.keys(roleNames) as CharacterRole[]).map((r) => [
    r,
    r === 'participant'
      ? participantWardrobe[1]
      : (teamColors[r] ?? roles[r].color),
  ]),
) as Record<CharacterRole, string>;

type Profile = {
  id: string;
  role: string;
  appearance: number;
  skin: string;
  hair: string;
  hairStyle: number;
  glasses: boolean;
  accent: string;
  height: number;
  /** Silhouette: 'f' (defined waist, narrower shoulders) or 'm'. */
  figure: 'f' | 'm';
  /** Index into care-team palette.participantWardrobe (participants). */
  wardrobe: number;
  /** Participant garment cut: sweater, cardigan or shirt. */
  cut: string;
  /** Guest instructors: cultural attire replacing the role uniform. */
  costume?: Costume;
};
type StoredProfile = Partial<Profile> & { id: string; variant?: number };
const people = templates.people as unknown as StoredProfile[];
const naturalSkin = ['#ecc9a8', '#dcae8b', '#c48e69', '#a06e50', '#7a523b'];
const staffHair = ['#231f1c', '#3b2a21', '#5c4232', '#6e4630', '#9a7a55'];
const seniorHair = ['#e6e2da', '#c8c5be', '#a19d96', '#d9d4ca'];
const cuts = ['sweater', 'cardigan', 'shirt'];
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function characterProfile(spec: CharacterSpec): Profile {
  const found = people.find((p) => p.id === (spec.profileId || spec.id));
  const id = found?.id ?? spec.id,
    v = found?.appearance ?? found?.variant ?? spec.variant,
    h = hash(id),
    senior = spec.role === 'participant',
    wardrobe = found?.wardrobe ?? (senior ? h % participantWardrobe.length : 0),
    figure = found?.figure ?? (v % 2 ? 'f' : 'm');
  return {
    id,
    role: found?.role ?? spec.role,
    appearance: v,
    skin: found?.skin ?? naturalSkin[h % naturalSkin.length],
    hair:
      found?.hair ??
      (senior ? seniorHair[v % seniorHair.length] : staffHair[v % 5]),
    hairStyle:
      found?.hairStyle ?? (figure === 'f' ? [1, 2, 4][v % 3] : [0, 3, 6][v % 3]),
    glasses: found?.glasses ?? false,
    accent:
      found?.accent ??
      (senior ? participantWardrobe[wardrobe] : roleColors[spec.role]),
    height: found?.height ?? (senior ? 0.96 : 1),
    figure: figure === 'f' ? 'f' : 'm',
    wardrobe,
    cut: found?.cut ?? cuts[(h >>> 3) % cuts.length],
    costume:
      found?.costume ??
      ((found?.role ?? spec.role) === 'instructor'
        ? { style: 'tang', color: roleColors.instructor, trim: '#c9a24a' }
        : undefined),
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers. Every part is authored in bind-pose model space (metres,
// soles at y = 0, facing +z) and merged into one vertex-coloured SkinnedMesh.
// ---------------------------------------------------------------------------
type V3 = [number, number, number];
type Weights = [bone: number, weight: number][];
const smooth = (a: number, b: number, x: number) => {
  const t = T.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const spow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
const shadeOf = (hex: string, k: number) =>
  '#' + new T.Color(hex).multiplyScalar(k).getHexString();
const mixHex = (a: string, b: string, t: number) =>
  '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString();

/**
 * (cols+1) × (rows+1) parametric grid; u runs around, v runs top → bottom.
 * Closed seams and collapsed poles are welded structurally, so smooth normals
 * need no vertex hashing.
 */
function grid(
  cols: number,
  rows: number,
  point: (i: number, j: number) => V3,
  shade?: (i: number, j: number) => number,
) {
  const pts: V3[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: V3[] = [];
    for (let i = 0; i <= cols; i++) row.push(point(i, j));
    pts.push(row);
  }
  const same = (a: V3, b: V3) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <
    1e-6;
  const wrap = pts.every((row) => same(row[0], row[cols]));
  const pos: number[] = [],
    sh: number[] = [],
    index: number[] = [],
    ids: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row = pts[j],
      pole = row.every((q) => same(q, row[0])),
      out: number[] = [];
    for (let i = 0; i <= cols; i++) {
      if ((pole && i > 0) || (wrap && i === cols)) {
        out.push(out[0]);
        continue;
      }
      out.push(pos.length / 3);
      pos.push(row[i][0], row[i][1], row[i][2]);
      sh.push(shade ? shade(i, j) : 1);
    }
    ids.push(out);
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = ids[j][i],
        b = ids[j][i + 1],
        c = ids[j + 1][i],
        d = ids[j + 1][i + 1];
      if (a !== b && a !== c && b !== c) index.push(a, c, b);
      if (b !== c && b !== d && c !== d) index.push(b, c, d);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('shade', new T.Float32BufferAttribute(sh, 1));
  g.setIndex(index);
  return g;
}
/** Smooth normals; generated shells are oriented outward, library shapes welded. */
function finish(g: T.BufferGeometry) {
  if (!g.attributes.shade) {
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const m = mergeVertices(g, 1e-5);
    m.computeVertexNormals();
    return m;
  }
  g.computeVertexNormals();
  const p = g.attributes.position.array,
    n = g.attributes.normal.array,
    count = p.length / 3;
  let cx = 0,
    cy = 0,
    cz = 0,
    score = 0;
  for (let i = 0; i < p.length; i += 3) {
    cx += p[i];
    cy += p[i + 1];
    cz += p[i + 2];
  }
  cx /= count;
  cy /= count;
  cz /= count;
  for (let i = 0; i < p.length; i += 3)
    score +=
      (p[i] - cx) * n[i] + (p[i + 1] - cy) * n[i + 1] + (p[i + 2] - cz) * n[i + 2];
  if (score < 0) {
    const idx = g.index!.array;
    for (let i = 0; i < idx.length; i += 3) {
      const b = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = b;
    }
    g.computeVertexNormals();
  }
  // Rim corners can sit on zero-area folds; point them away from the centre.
  for (let i = 0; i < p.length; i += 3)
    if (Math.hypot(n[i], n[i + 1], n[i + 2]) < 1e-6) {
      const d = Math.hypot(p[i] - cx, p[i + 1] - cy, p[i + 2] - cz) || 1;
      n[i] = (p[i] - cx) / d;
      n[i + 1] = (p[i + 1] - cy) / d;
      n[i + 2] = (p[i + 2] - cz) / d;
    }
  return g;
}
/** Surface of revolution along an axis; profile is [radius, distance from a]. */
function lathe(
  a: T.Vector3,
  dir: T.Vector3,
  profile: [number, number][],
  seg: number,
  squash = 1,
  shade?: (j: number) => number,
) {
  const d = dir.clone().normalize(),
    u = Math.abs(d.x) > 0.9 ? new T.Vector3(0, 0, 1) : new T.Vector3(1, 0, 0);
  u.sub(d.clone().multiplyScalar(u.dot(d))).normalize();
  const w = new T.Vector3().crossVectors(u, d);
  return grid(
    seg,
    profile.length - 1,
    (i, j) => {
      const [r, h] = profile[j],
        t = (i / seg) * Math.PI * 2;
      return a
        .clone()
        .addScaledVector(d, h)
        .addScaledVector(u, Math.cos(t) * r * squash)
        .addScaledVector(w, Math.sin(t) * r)
        .toArray();
    },
    shade ? (_, j) => shade(j) : undefined,
  );
}
/** Capsule-like limb: rounded start cap, tapered body, rounded or cuffed end. */
function limbProfile(
  len: number,
  radii: [number, number][],
  end: 'round' | 'cuff' = 'round',
  caps = 4,
) {
  const r0 = radii[0][1],
    r1 = radii[radii.length - 1][1],
    out: [number, number][] = [];
  for (let k = 0; k <= caps; k++) {
    const t = -Math.PI / 2 + (Math.PI / 2) * (k / caps);
    out.push([r0 * Math.cos(t), r0 * Math.sin(t)]);
  }
  for (const [t, r] of radii.slice(1, -1)) out.push([r, t * len]);
  if (end === 'round')
    for (let k = 0; k <= caps; k++) {
      const t = (Math.PI / 2) * (k / caps);
      out.push([r1 * Math.cos(t), len + r1 * Math.sin(t)]);
    }
  else
    out.push(
      [r1, len],
      [r1 * 0.94, len + 0.004],
      [r1 * 0.6, len + 0.006],
      [0, len + 0.006],
    );
  return out;
}
/** Continuous limb: flattened top cap, then [distance, radius] stations. */
function tubeProfile(
  stations: [number, number][],
  capTop: number,
  end: 'round' | 'cuff',
  caps = 4,
) {
  const r0 = stations[0][1],
    [len, r1] = stations[stations.length - 1],
    out: [number, number][] = [];
  for (let k = 0; k < caps; k++) {
    const t = -Math.PI / 2 + (Math.PI / 2) * (k / caps);
    out.push([r0 * Math.cos(t), capTop * Math.sin(t)]);
  }
  for (const [h, r] of stations) out.push([r, h]);
  if (end === 'round')
    for (let k = 1; k <= caps; k++) {
      const t = (Math.PI / 2) * (k / caps);
      out.push([r1 * Math.cos(t), len + r1 * 0.8 * Math.sin(t)]);
    }
  else
    out.push(
      [r1 * 0.94, len + 0.004],
      [r1 * 0.6, len + 0.006],
      [0, len + 0.006],
    );
  return out;
}
function ellipsoid(
  c: V3,
  r: V3,
  cols: number,
  rows: number,
  deform?: (n: T.Vector3) => V3,
) {
  const n = new T.Vector3();
  return grid(cols, rows, (i, j) => {
    const th = (i / cols) * Math.PI * 2 - Math.PI,
      ph = (j / rows) * Math.PI;
    n.set(
      Math.sin(ph) * Math.sin(th),
      Math.cos(ph),
      Math.sin(ph) * Math.cos(th),
    );
    const [x, y, z] = deform ? deform(n) : [n.x, n.y, n.z];
    return [c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2]];
  });
}
type Key = [y: number, rx: number, zF: number, zB: number];
function ringAt(keys: Key[], y: number) {
  let i = 0;
  while (i < keys.length - 2 && y > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)],
    k1 = keys[i],
    k2 = keys[i + 1],
    k3 = keys[Math.min(keys.length - 1, i + 2)],
    t = T.MathUtils.clamp((y - k1[0]) / (k2[0] - k1[0]), 0, 1);
  const cr = (m: number) =>
    Math.max(
      0,
      0.5 *
        (2 * k1[m] +
          (-k0[m] + k2[m]) * t +
          (2 * k0[m] - 5 * k1[m] + 4 * k2[m] - k3[m]) * t * t +
          (-k0[m] + 3 * k1[m] - 3 * k2[m] + k3[m]) * t * t * t),
    );
  return [cr(1), cr(2), cr(3)] as const;
}
/** Superellipse cross-section; theta 0 faces forward (+z), pi/2 is +x. */
function section(
  keys: Key[],
  y: number,
  theta: number,
  inflate: number,
  e = 0.86,
): V3 {
  const [rx, zF, zB] = ringAt(keys, y),
    s = Math.sin(theta),
    c = Math.cos(theta);
  return [
    Math.max(0, rx + inflate) * spow(s, e),
    y,
    Math.max(0, c >= 0 ? zF + inflate : zB + inflate) * spow(c, e),
  ];
}
type LoftOptions = {
  keys: Key[];
  bottom: number;
  top: number | ((theta: number) => number);
  cols: number;
  rows: number;
  inflate?: (y: number, theta: number) => number;
  /** Angular coverage per height (open garments); default is a closed ring. */
  span?: (y: number) => [number, number];
  /** Fabric thickness folded under at open edges. */
  rim?: number;
  rimTop?: boolean;
  rimBottom?: boolean;
  e?: number;
};
/** Garment or body shell lofted through superellipse rings. */
function loft(o: LoftOptions) {
  const rim = o.rim ?? 0,
    eu = o.span && rim ? 1 : 0,
    et = o.rimTop && rim ? 1 : 0,
    eb = o.rimBottom && rim ? 1 : 0,
    cols = o.cols + 2 * eu,
    rows = o.rows + et + eb;
  const thetaAt = (fu: number, y: number) => {
    if (!o.span) return -Math.PI + fu * Math.PI * 2;
    const [a, b] = o.span(y);
    return a + (b - a) * fu;
  };
  const edge = (i: number, j: number) => {
    const fu = (i - eu) / o.cols,
      fv = (j - et) / o.rows;
    return {
      fu: T.MathUtils.clamp(fu, 0, 1),
      fv: T.MathUtils.clamp(fv, 0, 1),
      rimU: fu < 0 || fu > 1,
      rimV: fv < 0 ? -1 : fv > 1 ? 1 : 0,
    };
  };
  return grid(
    cols,
    rows,
    (i, j) => {
      const { fu, fv, rimU, rimV } = edge(i, j);
      // Each column follows its own top edge so necklines stay crisp.
      const yTop =
        typeof o.top === 'number' ? o.top : o.top(thetaAt(fu, o.bottom));
      const y = yTop + (o.bottom - yTop) * fv + rimV * rim * 0.7,
        th = thetaAt(fu, y),
        inflate = (o.inflate ? o.inflate(y, th) : 0) - (rimU || rimV ? rim : 0);
      return section(o.keys, y, th, inflate, o.e);
    },
    (i, j) => {
      const { rimU, rimV } = edge(i, j);
      return rimU || rimV ? 0.72 : 1;
    },
  );
}
/** Arc of a torus hugging the neck, open at the front (for collars). */
function collarArc(radius: number, tube: number, arc: number) {
  return new T.TorusGeometry(radius, tube, 6, 18, arc)
    .rotateX(Math.PI / 2)
    .rotateY(Math.PI / 2 + arc / 2);
}

// Bind-pose landmarks (metres). Adult proportions of about 7.4 heads.
const HIP_Y = 0.95,
  LEG_DROP = 0.06,
  THIGH = 0.39,
  SHIN = 0.42,
  ANKLE = 0.08,
  SEAT_HIP = 0.575,
  ARM_SPREAD = 0.1,
  FORE_SPREAD = 0.1;
const torsoKeys: Record<'f' | 'm', Key[]> = {
  m: [
    [0.8, 0.165, 0.106, 0.118],
    [0.9, 0.166, 0.104, 0.116],
    [1.0, 0.158, 0.1, 0.104],
    [1.07, 0.154, 0.1, 0.098],
    [1.16, 0.158, 0.108, 0.1],
    [1.26, 0.166, 0.118, 0.106],
    [1.34, 0.176, 0.112, 0.108],
    [1.4, 0.184, 0.097, 0.1],
    [1.44, 0.17, 0.079, 0.086],
    [1.47, 0.128, 0.064, 0.07],
    [1.49, 0.062, 0.054, 0.056],
  ],
  f: [
    [0.8, 0.172, 0.102, 0.124],
    [0.9, 0.17, 0.1, 0.12],
    [1.0, 0.152, 0.092, 0.102],
    [1.08, 0.135, 0.088, 0.09],
    [1.16, 0.142, 0.098, 0.092],
    [1.25, 0.15, 0.122, 0.096],
    [1.33, 0.156, 0.108, 0.098],
    [1.39, 0.162, 0.091, 0.094],
    [1.43, 0.15, 0.074, 0.08],
    [1.465, 0.112, 0.06, 0.064],
    [1.485, 0.056, 0.05, 0.052],
  ],
};
const pelvisKeys: Record<'f' | 'm', Key[]> = {
  m: [
    [0.772, 0, 0, 0],
    [0.79, 0.1, 0.07, 0.085],
    [0.83, 0.15, 0.092, 0.11],
    [0.9, 0.163, 0.1, 0.116],
    [0.97, 0.158, 0.1, 0.106],
    [1.03, 0.152, 0.098, 0.1],
  ],
  f: [
    [0.772, 0, 0, 0],
    [0.79, 0.105, 0.068, 0.09],
    [0.83, 0.158, 0.09, 0.116],
    [0.9, 0.168, 0.096, 0.12],
    [0.97, 0.155, 0.094, 0.106],
    [1.03, 0.142, 0.09, 0.096],
  ],
};

/**
 * Guest-instructor attire. `hem` is the garment's lowest point in bind pose
 * (long garments follow the legs below the waist); `ease` loosens the body,
 * `sleeve`/`flare`/`leg` loosen sleeves and trousers; `collar` is the
 * mandarin-collar height. Trousers default to the costume colour.
 */
// prettier-ignore
const costumeWear: Record<
  CostumeStyle,
  {
    hem: number;
    ease: number;
    sleeve: number;
    flare: number;
    leg: number;
    collar: number;
    shoe: string;
    trouser?: string;
  }
> = {
  taichi: { hem: 0.8, ease: 0.014, sleeve: 0.011, flare: 0.009, leg: 0.012, collar: 0.03, shoe: '#1f1d1b' },
  tang: { hem: 0.815, ease: 0.008, sleeve: 0.006, flare: 0.003, leg: 0.002, collar: 0.03, shoe: '#2b2927', trouser: '#2b2826' },
  qipao: { hem: 0.31, ease: 0.004, sleeve: 0, flare: 0, leg: 0, collar: 0.038, shoe: '#2a2321' },
  opera: { hem: 0.1, ease: 0.008, sleeve: 0.009, flare: 0.006, leg: 0.004, collar: 0.03, shoe: '#262120', trouser: '#3a302d' },
  'tcm-coat': { hem: 0.56, ease: 0.013, sleeve: 0.009, flare: 0.002, leg: 0.002, collar: 0.03, shoe: '#2b2927', trouser: '#3a3734' },
};

// Shared matte "clay" material: one shader program for every person.
let clay: T.MeshStandardMaterial | null = null;
const bodyMaterial = () =>
  (clay ??= new T.MeshStandardMaterial({
    name: 'seen-clay-figure',
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  }));
let aidMaterials: {
  metal: T.MeshStandardMaterial;
  dark: T.MeshStandardMaterial;
  fabric: T.MeshStandardMaterial;
} | null = null;
const aids = () =>
  (aidMaterials ??= {
    metal: new T.MeshStandardMaterial({
      name: 'seen-aid-aluminium',
      color: '#c3c7c5',
      roughness: 0.4,
      metalness: 0.5,
    }),
    dark: new T.MeshStandardMaterial({
      name: 'seen-aid-rubber',
      color: '#35383a',
      roughness: 0.8,
    }),
    fabric: new T.MeshStandardMaterial({
      name: 'seen-aid-upholstery',
      color: '#4c5452',
      roughness: 0.94,
    }),
  });

// ---- Target-driven limbs for the cultural performances ---------------------
const TAU = Math.PI * 2;
const _m4 = new T.Matrix4(),
  _e1 = new T.Vector3(),
  _e2 = new T.Vector3(),
  _e3 = new T.Vector3();
/** Rotation taking x to `a` and y to the part of `b` perpendicular to `a`. */
function frameQ(out: T.Quaternion, a: T.Vector3, b: T.Vector3) {
  _e1.copy(a).normalize();
  _e2.copy(b).addScaledVector(_e1, -b.dot(_e1));
  // Degenerate hint: any perpendicular will do.
  if (_e2.lengthSq() < 1e-10) {
    _e2.set(0, 0, 1).addScaledVector(_e1, -_e1.z);
    if (_e2.lengthSq() < 1e-10) _e2.set(1, 0, 0);
  }
  _e2.normalize();
  _e3.crossVectors(_e1, _e2);
  return out.setFromRotationMatrix(_m4.makeBasis(_e1, _e2, _e3));
}
/** Eased 0 → 1 → 0 bump: rises over [a, b], holds, falls over [c, d]. */
const bump = (f: number, a: number, b: number, c: number, d: number) =>
  smooth(a, b, f) * (1 - smooth(c, d, f));
/**
 * Keyed hand path for one arm (right-arm values; the left arm mirrors x):
 * [phase, hand centre, finger direction, palm normal, elbow direction, extra].
 * Centres and directions are in the torso frame.
 */
type HandKey = [f: number, c: V3, fingers: V3, palm: V3, pole: V3, x: number[]];
/** Baduanjin "holding up the heavens": extra = [rise onto toes, look]. */
// prettier-ignore
const qigongKeys: HandKey[] = [
  [0, [0.075, -0.04, 0.2], [-1, 0.15, 0.35], [0, 1, 0], [0.5, -0.6, -0.6], [0, 0.12]],
  [0.1, [0.075, -0.04, 0.2], [-1, 0.15, 0.35], [0, 1, 0], [0.5, -0.6, -0.6], [0, 0.12]],
  [0.3, [0.075, 0.29, 0.26], [-1, 0.2, 0.3], [0, 1, 0.1], [0.45, -0.9, -0.1], [0.25, 0.04]],
  [0.42, [0.075, 0.55, 0.22], [-0.8, 0.55, 0.2], [0, 0.35, 1], [0.55, -0.7, 0.15], [0.6, -0.25]],
  [0.56, [0.08, 0.9, 0.07], [-1, 0.05, 0.15], [0, 1, 0], [0.8, -0.1, 0.35], [1, -0.42]],
  [0.68, [0.08, 0.9, 0.07], [-1, 0.05, 0.15], [0, 1, 0], [0.8, -0.1, 0.35], [1, -0.42]],
  [0.8, [0.39, 0.55, 0.19], [0.3, 1, 0.15], [0.9, 0, 0.45], [0.5, -0.5, -0.6], [0.5, -0.12]],
  [0.92, [0.27, -0.1, 0.2], [0.2, -0.8, 0.55], [0.1, 0.25, 1], [0.4, -0.5, -0.7], [0, 0.08]],
];
/**
 * Seated erhu, in the hip frame (hip joint at the origin, figure facing +z):
 * the right-hand centre bows along x at `bowHand` height; the left hand
 * stops the strings at `stopHand`; the instrument stands at `body`.
 */
export const ERHU = {
  body: new T.Vector3(-0.09, 0.065, 0.2),
  bowHand: new T.Vector3(0.17, 0.125, 0.2),
  stopHand: new T.Vector3(-0.118, 0.4, 0.2),
};

/**
 * Architectural scale-model figures: realistic adult proportions, smooth matte
 * clay forms, a sculpted hair volume and one clothing signature per role.
 * A stable profile uses the same rig in every scene.
 */
export function createCharacter(spec: CharacterSpec) {
  const profile = characterProfile(spec),
    senior = spec.role === 'participant',
    wardrobe = roles[spec.role]?.wardrobe ?? 'uniform',
    F = profile.figure === 'f',
    fig = profile.figure,
    h = hash(profile.id),
    costume = profile.costume,
    cs = costume?.style;
  const roleColor = senior
    ? participantWardrobe[profile.wardrobe % participantWardrobe.length]
    : costume
      ? costume.color
      : roleColors[spec.role];
  const skin = profile.skin,
    hair = profile.hair;
  // Garment plan: one signature detail per role.
  const coat = wardrobe === 'coat',
    scrubs = wardrobe === 'scrubs',
    apron = spec.role === 'nutrition',
    cap = spec.role === 'driver',
    cardigan = senior && profile.cut === 'cardigan',
    lanyard = [
      'reception',
      'coordinator',
      'center-manager',
      'social-worker',
      'activities',
    ].includes(spec.role),
    cut = costume
      ? 'costume'
      : senior
        ? profile.cut
        : scrubs || coat
          ? 'scrubs'
          : 'polo';
  const warmTrousers = ['#5f5850', '#7a7063', '#4b4743', '#8d8373', '#6a625a'],
    trouser = costume
      ? (costumeWear[costume.style].trouser ?? costume.color)
      : senior
        ? warmTrousers[(h >>> 5) % warmTrousers.length]
        : scrubs
          ? shadeOf(roleColor, 0.9)
          : cap
            ? shadeOf(roleColor, 0.82)
            : apron
              ? '#5d5249'
              : '#3f3d3b',
    coatWhite = '#f1eee7',
    shoe = costume
      ? costumeWear[costume.style].shoe
      : senior
        ? ['#4b4038', '#2f2d2b', '#8a7662', '#5a5550'][(h >>> 7) % 4]
        : scrubs
          ? '#dcd9d2'
          : '#353331',
    longSleeves = costume
      ? cs !== 'qipao'
      : coat ||
        cap ||
        spec.role === 'center-manager' ||
        (senior && (profile.cut !== 'shirt' || (h >>> 9) % 2 === 0)),
    sleeveColor = costume ? costume.color : coat ? coatWhite : roleColor,
    innerTop = cardigan ? mixHex(roleColor, '#f3efe6', 0.72) : roleColor;

  const root = new T.Group();
  root.name = spec.id;
  root.userData = {
    role: spec.role,
    profileId: profile.id,
    template: wardrobe,
    style: 'architectural clay figure',
    clothing:
      'White coats / V-neck scrubs / polos with lanyard / apron / driver cap; participants in warm casual wear',
    ...(costume ? { costume: costume.style } : {}),
  };
  // Skeleton: the same 16 joints and hierarchy as earlier Seen rigs.
  const bones: T.Bone[] = [],
    joints: Record<string, T.Bone> = {};
  const bone = (
    name: string,
    parent: string | null,
    x: number,
    y: number,
    z = 0,
  ) => {
    const b = new T.Bone();
    b.name = `${spec.id}_${name}`;
    b.position.set(x, y, z);
    if (parent) joints[parent].add(b);
    joints[name] = b;
    bones.push(b);
    return b;
  };
  const shoulderX = F ? 0.166 : 0.186,
    hipX = F ? 0.088 : 0.09,
    upperArm = F ? 0.29 : 0.3,
    foreArm = F ? 0.245 : 0.255;
  bone('hip', null, 0, HIP_Y);
  bone('torso', 'hip', 0, 0.1);
  bone('neck', 'torso', 0, 0.41);
  bone('head', 'neck', 0, 0.09);
  for (const [side, s] of [
    ['L', -1],
    ['R', 1],
  ] as const) {
    bone(`arm${side}`, 'torso', s * shoulderX, 0.355);
    bone(
      `elbow${side}`,
      `arm${side}`,
      s * upperArm * Math.sin(ARM_SPREAD),
      -upperArm * Math.cos(ARM_SPREAD),
    );
    bone(
      `hand${side}`,
      `elbow${side}`,
      s * foreArm * Math.sin(FORE_SPREAD),
      -foreArm * Math.cos(FORE_SPREAD),
    );
    bone(`leg${side}`, 'hip', s * hipX, -LEG_DROP);
    bone(`knee${side}`, `leg${side}`, 0, -THIGH);
    bone(`foot${side}`, `knee${side}`, 0, -SHIN);
  }
  joints.hip.updateMatrixWorld(true);
  const bw = (name: string) =>
    new T.Vector3().setFromMatrixPosition(joints[name].matrixWorld);
  const bi = (name: string) => bones.indexOf(joints[name]);

  // Accumulated single-mesh buffers.
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    SI: number[] = [],
    SW: number[] = [],
    I: number[] = [];
  const tmp = new T.Vector3();
  function part(
    source: T.BufferGeometry,
    color: string,
    weights: string | ((p: T.Vector3) => Weights),
  ) {
    const g = finish(source);
    const base = P.length / 3,
      p = g.attributes.position.array,
      n = g.attributes.normal.array,
      sh = g.attributes.shade?.array,
      c = new T.Color(color),
      rigid = typeof weights === 'string' ? bi(weights) : -1;
    for (let i = 0, v = 0; i < p.length; i += 3, v++) {
      tmp.set(p[i], p[i + 1], p[i + 2]);
      P.push(tmp.x, tmp.y, tmp.z);
      N.push(n[i], n[i + 1], n[i + 2]);
      // Soft baked grounding: slightly deeper toward the floor and in folds.
      const k = (sh ? sh[v] : 1) * (0.86 + 0.14 * smooth(0.05, 1.35, tmp.y));
      C.push(c.r * k, c.g * k, c.b * k);
      if (rigid >= 0) {
        SI.push(rigid, 0, 0, 0);
        SW.push(1, 0, 0, 0);
        continue;
      }
      const w = (weights as (p: T.Vector3) => Weights)(tmp);
      let total = 0;
      for (const [, x] of w) total += x;
      for (let q = 0; q < 4; q++) {
        SI.push(w[q]?.[0] ?? 0);
        SW.push((w[q]?.[1] ?? 0) / (total || 1));
      }
    }
    const idx = g.index!.array;
    for (let i = 0; i < idx.length; i++) I.push(base + idx[i]);
    source.dispose();
    g.dispose();
  }
  const waistBlend = (p: T.Vector3): Weights => {
    const t = smooth(0.99, 1.13, p.y);
    return [
      [bi('torso'), t],
      [bi('hip'), 1 - t],
    ];
  };
  // Long garments (coat, apron): front panels partly follow the thighs.
  const skirtBlend = (p: T.Vector3): Weights => {
    const legs = smooth(0.93, 0.74, p.y);
    if (legs <= 0) return waistBlend(p);
    const front = T.MathUtils.clamp((p.z + 0.02) / 0.1, 0, 1) * 0.85 * legs;
    return [
      [bi(p.x < 0 ? 'legL' : 'legR'), front],
      [bi('hip'), 1 - front],
    ];
  };

  // ---- Torso and garments -------------------------------------------------
  const tk = torsoKeys[fig],
    neckTop = tk[tk.length - 1][0];
  part(
    loft({
      keys: pelvisKeys[fig],
      bottom: 0.772,
      top: 1.03,
      cols: 20,
      rows: 7,
      e: 0.9,
    }),
    trouser,
    'hip',
  );
  // Skin at the neckline, visible inside V-necks and open collars.
  part(
    loft({
      keys: tk,
      bottom: 1.24,
      top: neckTop + 0.002,
      cols: 16,
      rows: 4,
      inflate: () => -0.006,
    }),
    skin,
    'torso',
  );
  const neckline =
    (depth: number, width: number, sharp: boolean) => (th: number) => {
      const a = Math.abs(th);
      if (a >= width) return neckTop;
      const f = sharp
        ? 1 - a / width
        : 0.5 + 0.5 * Math.cos((Math.PI * a) / width);
      return neckTop - depth * f;
    };
  const hem = senior ? 0.845 : scrubs ? 0.83 : 0.855;
  if (!costume)
    part(
      loft({
        keys: tk,
        bottom: hem,
        top:
          cut === 'scrubs'
            ? neckline(coat ? 0.13 : 0.155, 0.62, true)
            : cut === 'polo' || cut === 'shirt'
              ? neckline(0.075, 0.46, true)
              : neckline(0.045, 1.05, false),
        cols: 26,
        rows: 13,
        rim: 0.009,
        rimTop: true,
        rimBottom: true,
        inflate: (y) => 0.005 + 0.011 * smooth(0.95, hem, y),
      }),
      innerTop,
      waistBlend,
    );
  const chestZ = (y: number, x = 0) => {
    const [rx, zF] = ringAt(tk, y),
      s = T.MathUtils.clamp(Math.abs(x) / rx, 0, 0.98);
    return zF * Math.pow(1 - Math.pow(s, 2 / 0.86), 0.86 / 2) + 0.006;
  };
  if (coat || cardigan) {
    // Open-front outer layer: a clean vertical band of the colour beneath.
    const k = coat ? 0.018 : 0.012;
    part(
      loft({
        keys: tk,
        bottom: coat ? 0.7 : 0.835,
        top: neckTop + 0.004,
        cols: 26,
        rows: coat ? 16 : 12,
        rim: 0.01,
        rimBottom: true,
        e: 0.9,
        span: (y) => {
          const o =
            0.17 +
            0.16 * smooth(1.08, 1.3, y) +
            (coat ? 0.75 : 0.55) * smooth(1.3, 1.48, y);
          return [o, Math.PI * 2 - o];
        },
        inflate: (y) =>
          k + 0.02 * smooth(0.93, 0.72, y) + 0.01 * smooth(1.0, 0.86, y),
      }),
      coat ? coatWhite : roleColor,
      coat ? skirtBlend : waistBlend,
    );
    if (coat)
      part(
        collarArc(0.072, 0.014, Math.PI * 1.25)
          .scale(F ? 0.95 : 1.05, 1.3, 1)
          .translate(0, neckTop - 0.004, -0.012),
        coatWhite,
        'torso',
      );
  }
  if (apron) {
    part(
      loft({
        keys: tk,
        bottom: 0.6,
        top: 1.34,
        cols: 14,
        rows: 12,
        rim: 0.006,
        rimTop: true,
        rimBottom: true,
        span: (y) => {
          const w = 1.08 - 0.5 * smooth(1.08, 1.2, y);
          return [-w, w];
        },
        inflate: (y) => 0.018 + 0.03 * smooth(0.95, 0.6, y),
      }),
      '#f3ecdc',
      skirtBlend,
    );
    for (const s of [-1, 1])
      part(
        new T.TubeGeometry(
          new T.CatmullRomCurve3([
            new T.Vector3(s * 0.075, 1.335, chestZ(1.335, 0.075) + 0.018),
            new T.Vector3(s * 0.075, 1.44, chestZ(1.44, 0.075) + 0.01),
            new T.Vector3(s * 0.066, 1.49, -0.02),
            new T.Vector3(0, 1.49, -0.074),
          ]),
          8,
          0.0065,
          4,
        ),
        '#f3ecdc',
        'torso',
      );
  }
  if (cut === 'polo' || cut === 'shirt')
    // Soft folded collar around the neck, open at the placket.
    part(
      collarArc(0.066, 0.011, Math.PI * 1.55)
        .scale(F ? 0.95 : 1.02, 1.2, F ? 0.95 : 1)
        .translate(0, neckTop - 0.012, -0.004),
      shadeOf(innerTop, 0.97),
      'torso',
    );
  if (lanyard) {
    const cord =
        spec.role === 'center-manager'
          ? careTeam.palette.paper
          : careTeam.palette.brandDeep,
      y0 = 1.2,
      back = -(F ? 0.064 : 0.072),
      path: T.Vector3[] = [];
    for (const s of [-1, 1]) {
      const pts = [
        new T.Vector3(s * 0.025, y0 + 0.06, chestZ(y0 + 0.06, 0.025) + 0.01),
        new T.Vector3(s * 0.05, 1.33, chestZ(1.33, 0.05) + 0.006),
        new T.Vector3(s * 0.06, 1.43, chestZ(1.43, 0.06) + 0.006),
        new T.Vector3(s * 0.068, 1.485, 0.012),
        new T.Vector3(s * 0.04, 1.49, back),
      ];
      path.push(...(s < 0 ? pts : pts.reverse()));
    }
    part(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(path, true),
        28,
        0.0042,
        4,
        true,
      ),
      cord,
      'torso',
    );
    part(
      new RoundedBoxGeometry(0.05, 0.07, 0.007, 1, 0.003)
        .rotateX(-0.14)
        .translate(0, y0 + 0.015, chestZ(y0 + 0.015) + 0.01),
      careTeam.palette.paper,
      'torso',
    );
  }

  // ---- Guest-instructor costumes --------------------------------------------
  // Same clay language, read by silhouette and colour: a mandarin collar with
  // frog buttons (tai chi silks, Tang jacket, TCM coat), a fitted qipao with a
  // piped diagonal opening, and an opera robe with a cloud collar.
  const wear = costume ? costumeWear[costume.style] : null;
  // Long garments: hip at the waist, then each thigh and shin, blended across
  // the centre line so a skirt stretches between the legs instead of tearing.
  const robeBlend = (p: T.Vector3): Weights => {
    if (p.y > 0.95) return waistBlend(p);
    const g = smooth(0.95, 0.8, p.y),
      r = smooth(-0.05, 0.05, p.x),
      k = smooth(0.6, 0.44, p.y);
    return (
      [
        [bi('hip'), 1 - g],
        [bi('legL'), g * (1 - r) * (1 - k)],
        [bi('legR'), g * r * (1 - k)],
        [bi('kneeL'), g * (1 - r) * k],
        [bi('kneeR'), g * r * k],
      ] as Weights
    ).filter(([, x]) => x > 1e-4);
  };
  // Short jackets: the hem eases over the thighs in a deep stance or seated.
  const jacketBlend = (p: T.Vector3): Weights => {
    if (p.y > 0.93) return waistBlend(p);
    const g = 0.8 * smooth(0.93, 0.78, p.y),
      r = smooth(-0.05, 0.05, p.x);
    return (
      [
        [bi('hip'), 1 - g],
        [bi('legL'), g * (1 - r)],
        [bi('legR'), g * r],
      ] as Weights
    ).filter(([, x]) => x > 1e-4);
  };
  if (costume && wear) {
    const { color, trim } = costume,
      long = wear.hem < 0.7,
      m = F ? 1 : 1.05,
      lower: Key[] =
        cs === 'qipao'
          ? [
              [0.28, 0.152, 0.088, 0.094],
              [0.4, 0.156, 0.088, 0.096],
              [0.5, 0.162, 0.09, 0.098],
              [0.6, 0.168, 0.092, 0.102],
              [0.7, 0.176, 0.096, 0.11],
              [0.8, 0.182, 0.102, 0.12],
              [0.9, 0.178, 0.104, 0.126],
            ]
          : cs === 'opera'
            ? [
                [0.06, 0.25, 0.17, 0.18],
                [0.2, 0.236, 0.156, 0.166],
                [0.35, 0.218, 0.142, 0.152],
                [0.5, 0.203, 0.13, 0.14],
                [0.65, 0.192, 0.12, 0.132],
                [0.8, 0.186, 0.112, 0.128],
                [0.9, 0.18, 0.106, 0.126],
              ]
            : [
                [0.52, 0.196, 0.122, 0.134],
                [0.65, 0.19, 0.117, 0.13],
                [0.8, 0.184, 0.112, 0.127],
                [0.9, 0.177, 0.106, 0.124],
              ],
      keys: Key[] = long
        ? [
            ...lower.map(([y, rx, zF, zB]): Key => [y, rx * m, zF * m, zB * m]),
            ...tk.filter((k) => k[0] >= 1),
          ]
        : tk,
      ease = (y: number) =>
        wear.ease +
        (!long
          ? 0.012 * smooth(0.95, wear.hem, y)
          : cs === 'opera'
            ? 0.012 * smooth(0.9, 0.15, y)
            : cs === 'tcm-coat'
              ? 0.01 * smooth(0.95, 0.6, y)
              : 0),
      weights = long ? robeBlend : jacketBlend,
      surf = (y: number, th: number, extra = 0) =>
        new T.Vector3(...section(keys, y, th, ease(y) + extra)),
      neckR = F ? 0.046 : 0.054;
    part(
      loft({
        keys,
        bottom: wear.hem,
        top: neckline(0.012, 0.55, false),
        cols: 28,
        rows: long ? Math.round((neckTop - wear.hem) / 0.04) : 14,
        rim: 0.009,
        rimTop: true,
        rimBottom: true,
        inflate: (y) => ease(y),
      }),
      color,
      weights,
    );
    // Mandarin collar: a standing band round the neck, its front corners
    // rounded down to a small opening.
    const collarTop = (th: number, h: number) =>
      h * (1 - 0.8 * (1 - smooth(0.08, 0.46, Math.abs(th))));
    const collar = (c: string, h: number) => {
      const y0 = neckTop - 0.008,
        ring = (th: number, y: number, dr: number): V3 => {
          const lean = 1 - 0.07 * smooth(y0, y0 + h, y),
            cz = -0.006 + (y - 1.4) * 0.12;
          return [
            (neckR * 1.05 + 0.007 + dr) * lean * Math.sin(th),
            y,
            cz + (neckR + 0.007 + dr) * lean * Math.cos(th),
          ];
        };
      part(
        grid(
          36,
          4,
          (i, j) => {
            const th = (i / 36) * Math.PI * 2 - Math.PI,
              top = y0 + collarTop(th, h);
            return j === 0
              ? ring(th, y0 - 0.012, 0)
              : j === 1
                ? ring(th, top, 0)
                : j === 2
                  ? ring(th, top + 0.0025, 0.0035)
                  : j === 3
                    ? ring(th, top, 0.007)
                    : ring(th, y0 - 0.012, 0.007);
          },
          (_, j) => (j === 2 ? 0.9 : 1),
        ),
        c,
        'torso',
      );
      return (th: number) => ring(th, y0 + collarTop(th, h) + 0.0012, 0.0035);
    };
    // Frog button: a corded bar with a knot, lying across the opening.
    const frog = (th: number, y: number, c: string, w = 0.021) => {
      const at = surf(y, th, 0.004),
        t = new T.Vector3(Math.cos(th), 0, -Math.sin(th)),
        n = new T.Vector3(Math.sin(th), 0, Math.cos(th));
      part(
        lathe(
          at.clone().addScaledVector(t, -w),
          t,
          limbProfile(
            2 * w,
            [
              [0, 0.0048],
              [1, 0.0048],
            ],
            'round',
            3,
          ),
          6,
          0.7,
        ),
        c,
        weights,
      );
      part(
        ellipsoid(
          at.addScaledVector(n, 0.003).toArray(),
          [0.0075, 0.0075, 0.006],
          8,
          6,
        ),
        c,
        weights,
      );
    };
    const piping = (pts: T.Vector3[], c: string, r = 0.0042, closed = false) =>
      part(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(pts, closed),
          Math.max(8, pts.length * 4),
          r,
          5,
          closed,
        ),
        c,
        weights,
      );
    // Centre placket: a slightly raised band down the front opening.
    const placket = (bottom: number) =>
      part(
        loft({
          keys,
          bottom,
          top: neckTop - 0.016,
          cols: 4,
          rows: Math.round((neckTop - bottom) / 0.05),
          span: () => [-0.07, 0.07],
          rim: 0.003,
          rimBottom: true,
          inflate: (y) => ease(y) + 0.0035,
        }),
        shadeOf(color, 0.93),
        weights,
      );
    if (cs === 'taichi' || cs === 'tang') {
      collar(trim, wear.collar);
      if (cs === 'tang') placket(wear.hem + 0.012);
      const top = neckTop - 0.04,
        n = 5,
        step = (top - (cs === 'tang' ? 1.06 : 1.08)) / (n - 1);
      for (let i = 0; i < n; i++) frog(0, top - i * step, trim);
    }
    if (cs === 'tcm-coat') {
      collar(color, wear.collar);
      placket(wear.hem + 0.012);
      for (let i = 0; i < 6; i++)
        frog(0, neckTop - 0.045 - i * 0.082, trim, 0.016);
    }
    if (cs === 'qipao') {
      const edge = collar(color, wear.collar),
        rim: T.Vector3[] = [];
      for (let i = 0; i < 36; i++)
        rim.push(new T.Vector3(...edge((i / 36) * Math.PI * 2 - Math.PI)));
      part(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(rim, true),
          72,
          0.0032,
          5,
          true,
        ),
        trim,
        'torso',
      );
      // 大襟: the opening sweeps from the collar across the right chest to the
      // underarm, then down the side seam.
      piping(
        (
          [
            [0.02, neckTop - 0.014],
            [0.32, neckTop - 0.03],
            [0.68, 1.418],
            [1.0, 1.38],
            [1.26, 1.335],
            [1.44, 1.27],
            [1.52, 1.17],
            [1.54, 1.05],
          ] as const
        ).map(([th, y]) => surf(y, th, 0.003)),
        trim,
      );
      frog(0.3, neckTop - 0.03, trim, 0.016);
      frog(0.98, 1.38, trim, 0.016);
      frog(1.3, 1.326, trim, 0.016);
      const hemRing: T.Vector3[] = [];
      for (let i = 0; i < 40; i++)
        hemRing.push(
          surf(wear.hem + 0.008, (i / 40) * Math.PI * 2 - Math.PI, 0.002),
        );
      piping(hemRing, trim, 0.0045, true);
    }
    if (cs === 'opera') {
      // Trim hem band and sash.
      part(
        loft({
          keys,
          bottom: wear.hem - 0.004,
          top: wear.hem + 0.075,
          cols: 32,
          rows: 3,
          rim: 0.004,
          rimTop: true,
          rimBottom: true,
          inflate: (y) => ease(y) + 0.005,
        }),
        trim,
        weights,
      );
      part(
        loft({
          keys,
          bottom: 0.985,
          top: 1.075,
          cols: 28,
          rows: 3,
          rim: 0.004,
          rimTop: true,
          rimBottom: true,
          inflate: (y) => ease(y) + 0.011,
        }),
        shadeOf(trim, 0.9),
        weights,
      );
      for (const s of [-1, 1])
        part(
          loft({
            keys,
            bottom: s < 0 ? 0.62 : 0.66,
            top: 1.0,
            cols: 3,
            rows: 9,
            rim: 0.004,
            rimBottom: true,
            span: () => (s < 0 ? [-0.15, -0.03] : [0.03, 0.15]),
            inflate: (y) => ease(y) + 0.009 + 0.008 * smooth(0.95, 0.65, y),
          }),
          shadeOf(trim, 0.9),
          weights,
        );
      // Cloud collar (云肩): a scalloped cape over the shoulders, its lobes
      // edged and tipped with beads.
      const cols = 64,
        rows = 7,
        lobe = (th: number) => (0.5 + 0.5 * Math.cos(th * 8)) ** 2,
        capeBottom = (th: number) => 1.372 - 0.05 * lobe(th),
        capeInflate = (y: number, th: number) =>
          0.014 +
          0.042 * Math.sin(th) ** 2 * smooth(1.488, 1.425, y) +
          0.004 * smooth(1.41, 1.33, y),
        capeAt = (th: number, f: number, lift = 0) => {
          const top = neckTop + 0.004,
            y = top + (capeBottom(th) - top) * Math.pow(f, 0.85);
          return section(tk, y, th, capeInflate(y, th) + lift);
        };
      part(
        grid(
          cols,
          rows + 1,
          (i, j) => {
            const th = (i / cols) * Math.PI * 2 - Math.PI;
            if (j <= rows) return capeAt(th, j / rows);
            const [x, y, z] = capeAt(th, 1, -0.009);
            return [x, y + 0.006, z];
          },
          (_, j) => (j > rows ? 0.7 : 1),
        ),
        trim,
        'torso',
      );
      const edge: T.Vector3[] = [];
      for (let i = 0; i < 96; i++)
        edge.push(
          new T.Vector3(...capeAt((i / 96) * Math.PI * 2 - Math.PI, 1, 0.001)),
        );
      part(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(edge, true),
          192,
          0.0042,
          5,
          true,
        ),
        shadeOf(trim, 0.62),
        'torso',
      );
      for (let i = 0; i < 8; i++) {
        const [x, y, z] = capeAt((i / 8) * Math.PI * 2 - Math.PI, 1, 0.004);
        part(
          ellipsoid([x, y - 0.009, z], [0.0085, 0.011, 0.0085], 8, 6),
          '#b8322c',
          'torso',
        );
      }
    }
  }

  // ---- Neck and head -------------------------------------------------------
  const neckR = F ? 0.046 : 0.054;
  part(
    lathe(
      new T.Vector3(0, 1.4, -0.006),
      new T.Vector3(0, 1, 0.12),
      [
        [0, -0.001],
        [neckR * 1.08, 0],
        [neckR, 0.1],
        [neckR * 0.96, 0.2],
        [0, 0.21],
      ],
      12,
      1.05,
    ),
    skin,
    'neck',
  );
  const headC = bw('head').add(new T.Vector3(0, F ? 0.066 : 0.069, 0.01)),
    HR: V3 = F ? [0.071, 0.112, 0.093] : [0.075, 0.117, 0.097];
  // Smooth ovoid with a tapered jaw; no drawn features.
  const skull = (n: T.Vector3): V3 => {
    let kx = 1,
      kz = 1;
    if (n.y < 0) {
      const d = -n.y;
      kx = 1 - 0.27 * d ** 1.6;
      kz = n.z < 0 ? 1 - 0.32 * d ** 1.3 : 1 - 0.1 * d * d;
    } else if (n.z < 0) kz = 1 + 0.05 * (1 - n.y) * -n.z;
    return [n.x * kx, n.y, n.z * kz];
  };
  const headAt = (n: T.Vector3) => {
    const [x, y, z] = skull(n);
    return new T.Vector3(x * HR[0], y * HR[1], z * HR[2]);
  };
  part(ellipsoid(headC.toArray(), HR, 22, 16, skull), skin, 'head');
  // Very subtle nose and ears so heads read their facing direction.
  part(
    ellipsoid([0, 0, 0], [0.011, 0.02, 0.014], 8, 6)
      .rotateX(0.35)
      .translate(headC.x, headC.y - 0.022, headC.z + HR[2] * 0.93),
    shadeOf(skin, 0.98),
    'head',
  );
  for (const s of [-1, 1])
    part(
      ellipsoid([0, 0, 0], [0.011, 0.028, 0.019], 8, 6)
        .rotateY(s * 0.35)
        .translate(headC.x + s * HR[0] * 0.97, headC.y - 0.012, headC.z - 0.008),
      shadeOf(skin, 0.95),
      'head',
    );

  // ---- Hair: one sculpted volume per style ---------------------------------
  type Style = {
    /** Hairline polar angle (from the crown) by |azimuth| from the face. */
    end: [number, number][];
    /** Optional upper edge for thinning hair. */
    start?: [number, number][];
    thick: (th: number, ph: number, f: number) => number;
    /** 0 hugs the skull; 1 hangs straight below the widest point. */
    hang?: number;
  };
  const curve = (pts: [number, number][], a: number) => {
    for (let i = 0; i < pts.length - 1; i++)
      if (a <= pts[i + 1][0]) {
        const t = smooth(pts[i][0], pts[i + 1][0], a);
        return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
      }
    return pts[pts.length - 1][1];
  };
  const styles: Style[] = [
    // 0 short crop
    {
      end: [
        [0, 0.64],
        [0.55, 0.74],
        [1.15, 1.28],
        [1.57, 1.47],
        [2.3, 1.86],
        [3.15, 2.02],
      ],
      thick: (th, _, f) =>
        0.007 + 0.011 * (1 - f) * (0.55 + 0.45 * Math.cos(th)),
    },
    // 1 chin-length bob
    {
      end: [
        [0, 0.8],
        [0.62, 0.92],
        [0.82, 1.7],
        [1.1, 2.12],
        [1.57, 2.22],
        [3.15, 2.2],
      ],
      thick: (th, _, f) =>
        0.012 + 0.018 * f * f + 0.006 * Math.max(0, Math.sin(th + 0.5)),
      hang: 1,
    },
    // 2 pulled back into a bun
    {
      end: [
        [0, 0.68],
        [0.6, 0.8],
        [1.1, 1.36],
        [1.57, 1.62],
        [2.3, 1.96],
        [3.15, 2.1],
      ],
      thick: (_, __, f) => 0.006 + 0.004 * (1 - f),
    },
    // 3 side-swept with volume on top
    {
      end: [
        [0, 0.66],
        [0.55, 0.76],
        [1.15, 1.3],
        [1.57, 1.5],
        [2.3, 1.88],
        [3.15, 2.03],
      ],
      thick: (th, _, f) =>
        0.008 + 0.018 * (1 - f) * (0.5 + 0.5 * Math.max(0, Math.sin(th + 0.9))),
    },
    // 4 soft rounded curls
    {
      end: [
        [0, 0.74],
        [0.6, 0.86],
        [1.1, 1.34],
        [1.57, 1.56],
        [2.3, 1.92],
        [3.15, 2.04],
      ],
      thick: (th, ph, f) =>
        0.019 + 0.009 * (1 - f) + 0.0035 * Math.sin(th * 9) * Math.sin(ph * 11),
      hang: 0.4,
    },
    // 5 low ponytail
    {
      end: [
        [0, 0.7],
        [0.6, 0.82],
        [1.1, 1.38],
        [1.57, 1.64],
        [2.3, 1.98],
        [3.15, 2.1],
      ],
      thick: (_, __, f) => 0.007 + 0.005 * (1 - f),
    },
    // 6 receding crop
    {
      end: [
        [0, 0.98],
        [0.5, 1.02],
        [1.0, 1.22],
        [1.57, 1.5],
        [2.3, 1.88],
        [3.15, 2.02],
      ],
      thick: (_, __, f) => 0.006 + 0.004 * (1 - f),
    },
  ];
  // Base surface for hair: the skull, or a straight fall below its widest line.
  const hairBase = (n: T.Vector3, hang: number) => {
    const s = headAt(n);
    if (n.y >= 0 || !hang) return s;
    const flat = Math.hypot(n.x, n.z) || 1,
      fall = new T.Vector3(
        (n.x / flat) * HR[0] * (1 - 0.08 * -n.y),
        n.y * HR[1],
        (n.z / flat) * HR[2] * (n.z < 0 ? 1 - 0.18 * -n.y : 1 - 0.08 * -n.y),
      );
    return s.lerp(fall, hang * smooth(0, 0.35, -n.y));
  };
  function shell(style: Style, color: string, cols = 26, rows = 9) {
    const n = new T.Vector3(),
      lead = style.start ? 1 : 0,
      total = rows + lead + 1;
    part(
      grid(
        cols,
        total,
        (i, j) => {
          const th = (i / cols) * Math.PI * 2 - Math.PI,
            a = Math.abs(th),
            p0 = style.start ? curve(style.start, a) : 0,
            p1 = curve(style.end, a),
            k = T.MathUtils.clamp(j - lead, 0, rows),
            tucked = j < lead || j === total,
            f = k / rows,
            ph =
              p0 + (p1 - p0) * f + (tucked ? (j < lead ? -0.025 : 0.035) : 0);
          n.set(
            Math.sin(ph) * Math.sin(th),
            Math.cos(ph),
            Math.sin(ph) * Math.cos(th),
          );
          const s = hairBase(n, style.hang ?? 0),
            len = s.length(),
            t = tucked ? -0.003 : style.thick(th, ph, f);
          s.multiplyScalar((len + t) / len);
          return [headC.x + s.x, headC.y + s.y, headC.z + s.z];
        },
        (_, j) => (j < lead || j === total ? 0.7 : 1),
      ),
      color,
      'head',
    );
  }
  const style = senior
    ? profile.hairStyle
    : Math.min(profile.hairStyle, styles.length - 2);
  shell(styles[style] ?? styles[0], hair);
  if (style === 2 || style === 5) {
    const a = style === 2 ? 1.0 : 1.78,
      n = new T.Vector3(0, Math.cos(a), -Math.sin(a)),
      at = headAt(n).add(headC).addScaledVector(n, style === 2 ? 0.03 : 0.012);
    part(
      style === 2
        ? ellipsoid(at.toArray(), [0.04, 0.036, 0.034], 12, 8)
        : lathe(
            at,
            new T.Vector3(0, -1, -0.3),
            limbProfile(
              0.15,
              [
                [0, 0.024],
                [0.3, 0.027],
                [0.7, 0.021],
                [1, 0.011],
              ],
              'round',
              3,
            ),
            10,
          ),
      hair,
      'head',
    );
  }
  if (cap) {
    shell(
      {
        end: [
          [0, 1.02],
          [1.2, 1.2],
          [1.57, 1.32],
          [3.15, 1.48],
        ],
        thick: (_, __, f) => 0.016 + 0.005 * (1 - f),
      },
      roleColor,
      24,
      6,
    );
    const n = new T.Vector3(0, Math.cos(1.05), Math.sin(1.05)),
      at = headAt(n)
        .add(headC)
        .addScaledVector(n, 0.006)
        .add(new T.Vector3(0, -0.004, 0.03));
    part(
      ellipsoid([0, 0, 0], [0.06, 0.005, 0.044], 16, 6)
        .rotateX(0.16)
        .translate(at.x, at.y, at.z),
      shadeOf(roleColor, 0.92),
      'head',
    );
  }

  if (cs === 'opera' && costume) {
    // Opera headdress: a gold band over the hair with red and gold pompoms.
    const toward = (th: number, pol: number, lift: number) => {
      const n = new T.Vector3(
          Math.sin(pol) * Math.sin(th),
          Math.cos(pol),
          Math.sin(pol) * Math.cos(th),
        ),
        p = headAt(n);
      return p.multiplyScalar((p.length() + lift) / p.length()).add(headC);
    };
    const band: T.Vector3[] = [];
    for (let i = 0; i < 40; i++) {
      const th = (i / 40) * Math.PI * 2 - Math.PI;
      band.push(
        toward(
          th,
          curve(
            [
              [0, 0.74],
              [0.9, 1.02],
              [1.57, 1.36],
              [2.4, 1.36],
              [3.15, 1.3],
            ],
            Math.abs(th),
          ),
          0.02,
        ),
      );
    }
    part(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(band, true),
        60,
        0.0095,
        6,
        true,
      ),
      costume.trim,
      'head',
    );
    const red = '#b8322c';
    for (const [th, pol, r, c] of [
      [0, 0.5, 0.022, red],
      [-0.5, 0.6, 0.016, costume.trim],
      [0.5, 0.6, 0.016, costume.trim],
      [-0.95, 0.78, 0.017, red],
      [0.95, 0.78, 0.017, red],
      [-1.45, 1.06, 0.014, costume.trim],
      [1.45, 1.06, 0.014, costume.trim],
      [0, 0.82, 0.012, costume.trim],
    ] as const)
      part(
        ellipsoid(
          toward(th, pol, 0.022 + r * 0.55).toArray(),
          [r, r, r],
          10,
          8,
        ),
        c,
        'head',
      );
  }

  // ---- Limbs: one continuous skinned tube per limb, blended at the joint ----
  const limb = (
    from: T.Vector3,
    dir: T.Vector3,
    profile: [number, number][],
    seg: number,
    color: string,
    upper: string,
    lower: string,
    joint: number,
    blend: number,
  ) => {
    const d = dir.clone().normalize(),
      q = new T.Vector3();
    part(lathe(from, d, profile, seg), color, (p) => {
      const w = smooth(joint - blend, joint + blend, q.copy(p).sub(from).dot(d));
      return [
        [bi(lower), w],
        [bi(upper), 1 - w],
      ];
    });
  };
  const girth = F ? 0.9 : 1;
  for (const side of ['L', 'R'] as const) {
    const s = side === 'L' ? -1 : 1,
      shoulder = bw(`arm${side}`),
      elbow = bw(`elbow${side}`),
      wrist = bw(`hand${side}`),
      dir = wrist.clone().sub(shoulder).normalize(),
      la = elbow.distanceTo(shoulder),
      lf = wrist.distanceTo(elbow);
    const sleeve = longSleeves ? sleeveColor : skin,
      pad = wear ? wear.sleeve : longSleeves ? (coat ? 0.009 : 0.004) : 0,
      fl = wear ? wear.flare : 0,
      r = (v: number) => v * girth + pad;
    limb(
      shoulder,
      dir,
      tubeProfile(
        [
          [0, r(0.04)],
          [0.05, r(0.046)],
          [0.12, r(0.043)],
          [0.2, r(0.039)],
          [la, r(0.034)],
          [la + 0.07, r(0.035)],
          [la + 0.17, r(0.03) + fl * 0.5],
          [la + lf, (longSleeves ? r(0.03) : r(0.025)) + fl],
        ],
        0.034,
        longSleeves ? 'cuff' : 'round',
      ),
      12,
      sleeve,
      `arm${side}`,
      `elbow${side}`,
      la,
      0.045,
    );
    // Hidden in straight poses; rounds the outside of a bent elbow.
    part(
      ellipsoid(elbow.toArray(), [r(0.033), r(0.033), r(0.033)], 10, 6),
      sleeve,
      `elbow${side}`,
    );
    if (costume && (cs === 'taichi' || cs === 'tang')) {
      // Contrasting turned-back cuff.
      const R = r(0.03) + fl + 0.0045,
        c = wear!.flare > 0.005 ? 0.05 : 0.042;
      part(
        lathe(
          shoulder.clone().addScaledVector(dir, la + lf - c),
          dir,
          [
            [0, -0.001],
            [R - 0.004, 0],
            [R, 0.004],
            [R, c - 0.002],
            [R - 0.003, c + 0.002],
            [R - 0.009, c + 0.003],
            [0, c + 0.003],
          ],
          14,
        ),
        costume.trim,
        `elbow${side}`,
      );
    }
    if (cs === 'qipao') {
      // Cap sleeve with a piped edge.
      const rs = (h: number) => (0.042 + 0.06 * h) * girth + 0.008,
        L = 0.08;
      part(
        lathe(
          shoulder,
          dir,
          [
            [0, -0.042],
            [rs(0) * 0.7, -0.03],
            [rs(0) * 0.95, -0.012],
            [rs(0), 0],
            [rs(0.04), 0.04],
            [rs(L), L],
            [rs(L) - 0.007, L + 0.003],
            [rs(L) - 0.013, L - 0.008],
          ],
          12,
          1,
          (j) => (j >= 6 ? 0.72 : 1),
        ),
        roleColor,
        `arm${side}`,
      );
      part(
        new T.TorusGeometry(rs(L) - 0.002, 0.0034, 5, 20)
          .rotateX(Math.PI / 2)
          .applyQuaternion(
            new T.Quaternion().setFromUnitVectors(new T.Vector3(0, -1, 0), dir),
          )
          .translate(...shoulder.clone().addScaledVector(dir, L).toArray()),
        costume!.trim,
        `arm${side}`,
      );
    }
    if (cs === 'opera') {
      // Water sleeve (水袖): white silk flaring from the forearm and hanging
      // well past the hand; the hand bone carries it so it can swing and fall.
      const u = new T.Vector3(1, 0, 0).addScaledVector(dir, -dir.x).normalize(),
        w = new T.Vector3().crossVectors(u, dir),
        a0 = la + 0.12,
        wd = la + lf,
        q = new T.Vector3(),
        st: [h: number, ru: number, rw: number][] = [
          [a0 - 0.004, 0, 0],
          [a0, r(0.035) + 0.003, r(0.035) + 0.003],
          [a0 + 0.05, r(0.033) + 0.009, r(0.033) + 0.012],
          [wd - 0.015, 0.045, 0.056],
          [wd + 0.06, 0.038, 0.072],
          [wd + 0.2, 0.027, 0.08],
          [wd + 0.33, 0.022, 0.078],
          [wd + 0.39, 0.016, 0.064],
          [wd + 0.405, 0, 0],
        ];
      part(
        grid(16, st.length - 1, (i, j) => {
          const t = (i / 16) * Math.PI * 2,
            [hh, ru, rw] = st[j];
          return shoulder
            .clone()
            .addScaledVector(dir, hh)
            .addScaledVector(u, Math.cos(t) * ru)
            .addScaledVector(w, Math.sin(t) * rw)
            .toArray();
        }),
        costume!.accent ?? '#f6f1e8',
        (p) => {
          const k = smooth(
            wd - 0.03,
            wd + 0.1,
            q.copy(p).sub(shoulder).dot(dir),
          );
          return [
            [bi(`hand${side}`), k],
            [bi(`elbow${side}`), 1 - k],
          ];
        },
      );
      const R = r(0.035) + 0.007;
      part(
        lathe(
          shoulder.clone().addScaledVector(dir, a0 - 0.01),
          dir,
          [
            [0, 0],
            [R - 0.003, 0],
            [R, 0.004],
            [R, 0.026],
            [R - 0.003, 0.03],
            [0, 0.03],
          ],
          14,
        ),
        costume!.trim,
        `elbow${side}`,
      );
    }
    if (!longSleeves && !costume) {
      // Short sleeve with a folded hem over the upper arm.
      const rs = (h: number) =>
        (h < 0.05 ? 0.04 + 0.12 * h : 0.046 - 0.035 * (h - 0.05)) * girth +
        0.008;
      part(
        lathe(
          shoulder,
          dir,
          [
            [0, -0.042],
            [rs(0) * 0.7, -0.03],
            [rs(0) * 0.95, -0.012],
            [rs(0), 0],
            [rs(0.05), 0.05],
            [rs(0.1) + 0.001, 0.1],
            [rs(0.135) + 0.002, 0.135],
            [rs(0.135) - 0.008, 0.139],
            [rs(0.135) - 0.014, 0.125],
          ],
          12,
          1,
          (j) => (j >= 7 ? 0.72 : 1),
        ),
        roleColor,
        `arm${side}`,
      );
    }
    // Simplified mitten hand with a slim thumb.
    const hc = wrist.clone().addScaledVector(dir, 0.072);
    part(
      ellipsoid([0, 0, 0], [0.017, 0.078, 0.04 * girth], 10, 10, (n) => {
        const t = Math.max(0, -n.y);
        return [n.x * (1 - 0.25 * t), n.y, n.z * (1 - 0.3 * t)];
      })
        .rotateZ(s * ARM_SPREAD)
        .translate(hc.x, hc.y, hc.z),
      skin,
      `hand${side}`,
    );
    part(
      lathe(
        wrist.clone().add(new T.Vector3(-s * 0.006, -0.03, 0.026 * girth)),
        new T.Vector3(-s * 0.15, -1, 0.55),
        tubeProfile(
          [
            [0, 0.012],
            [0.045, 0.009],
          ],
          0.012,
          'round',
          3,
        ),
        8,
      ),
      skin,
      `hand${side}`,
    );
  }
  for (const side of ['L', 'R'] as const) {
    const hipJ = bw(`leg${side}`),
      knee = bw(`knee${side}`),
      ankle = bw(`foot${side}`),
      kr = F ? 0.054 : 0.057,
      lp = wear ? wear.leg : 0,
      legColor = cs === 'qipao' ? skin : trouser;
    limb(
      hipJ,
      new T.Vector3(0, -1, 0),
      tubeProfile(
        [
          [0, (F ? 0.088 : 0.086) + lp],
          [0.1, (F ? 0.082 : 0.081) + lp],
          [0.24, (F ? 0.068 : 0.07) + lp],
          [THIGH, kr + lp],
          [THIGH + 0.1, kr * 0.98 + lp],
          [THIGH + 0.3, kr * 0.88 + lp],
          [THIGH + SHIN + 0.035, kr * 0.84 + lp * 0.5],
        ],
        0.05,
        'cuff',
      ),
      14,
      legColor,
      `leg${side}`,
      `knee${side}`,
      THIGH,
      0.05,
    );
    part(
      ellipsoid(
        knee.toArray(),
        [kr * 0.97 + lp * 0.6, kr * 0.97 + lp * 0.6, kr * 0.97 + lp * 0.6],
        12,
        8,
      ),
      legColor,
      `knee${side}`,
    );
    part(
      ellipsoid(
        [0, 0, 0],
        [F ? 0.041 : 0.046, 0.046, F ? 0.118 : 0.13],
        14,
        10,
        (n) => {
          const toe = Math.max(0, n.z);
          return [
            n.x * (1 - 0.12 * toe),
            Math.max(n.y * (1 - 0.38 * toe * toe), -0.72),
            n.z,
          ];
        },
      ).translate(ankle.x, ankle.y - 0.047, ankle.z + 0.042),
      shoe,
      `foot${side}`,
    );
  }
  if (spec.mobility === 'cane') {
    // Slim aluminium cane with a derby handle, held in the right hand.
    const g = bw('handR').add(new T.Vector3(0.012, -0.075, 0.012)),
      top = g.clone().add(new T.Vector3(0, -0.03, 0.062));
    part(
      new T.TubeGeometry(
        new T.CatmullRomCurve3([
          g.clone().add(new T.Vector3(0, 0.004, -0.05)),
          g.clone().add(new T.Vector3(0, 0.012, 0)),
          g.clone().add(new T.Vector3(0, 0, 0.05)),
          top,
        ]),
        10,
        0.011,
        6,
      ),
      '#3a3836',
      'handR',
    );
    part(
      lathe(
        top,
        new T.Vector3(0, -1, 0),
        [
          [0, 0],
          [0.0085, 0.001],
          [0.0085, top.y - 0.04],
          [0.0115, top.y - 0.035],
          [0.0115, top.y],
          [0, top.y + 0.001],
        ],
        8,
        1,
        (j) => (j >= 3 ? 0.5 : 1.15),
      ),
      '#a9aeae',
      'handR',
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(P, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(C, 3));
  geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(SI, 4));
  geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(SW, 4));
  geometry.setIndex(I);
  geometry.computeBoundingSphere();
  const mesh = new T.SkinnedMesh(geometry, bodyMaterial());
  mesh.name = `${spec.id}_body`;
  mesh.add(joints.hip);
  mesh.bind(new T.Skeleton(bones));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  root.scale.setScalar(profile.height);

  // ---- Mobility aids: light separate meshes with shared materials -----------
  const accessory = new T.Group();
  accessory.name = `${spec.id}_mobility`;
  root.add(accessory);
  const put = (
    geo: T.BufferGeometry,
    mat: T.Material,
    parent: T.Object3D = accessory,
  ) => {
    const o = new T.Mesh(geo, mat);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const rod = (
    a: V3,
    b: V3,
    r = 0.011,
    mat: T.Material = aids().metal,
    parent: T.Object3D = accessory,
  ) => {
    const va = new T.Vector3(...a),
      v = new T.Vector3(...b).sub(va);
    const o = put(new T.CylinderGeometry(r, r, v.length(), 8, 1), mat, parent);
    o.position.copy(va).addScaledVector(v, 0.5);
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
    return o;
  };
  const wheels: T.Object3D[] = [];
  const wheel = (
    x: number,
    y: number,
    z: number,
    r: number,
    big: boolean,
    camber = 0,
  ) => {
    const { metal, dark } = aids(),
      mount = new T.Group(),
      g = new T.Group();
    mount.position.set(x, y, z);
    mount.rotation.z = camber;
    accessory.add(mount);
    mount.add(g);
    put(
      new T.TorusGeometry(r, big ? 0.014 : 0.013, 6, big ? 40 : 16),
      dark,
      g,
    ).rotation.y = Math.PI / 2;
    if (big) {
      put(new T.TorusGeometry(r - 0.018, 0.006, 4, 40), metal, g).rotation.y =
        Math.PI / 2;
      const push = put(new T.TorusGeometry(r - 0.035, 0.0065, 4, 36), metal, g);
      push.rotation.y = Math.PI / 2;
      push.position.x = Math.sign(x) * 0.032;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        rod(
          [0, 0, 0],
          [
            Math.sign(x) * 0.012,
            Math.cos(a) * (r - 0.02),
            Math.sin(a) * (r - 0.02),
          ],
          0.0022,
          metal,
          g,
        );
      }
    }
    put(
      new T.CylinderGeometry(big ? 0.026 : r * 0.55, big ? 0.026 : r * 0.55, big ? 0.05 : 0.022, 12),
      metal,
      g,
    ).rotation.z = Math.PI / 2;
    wheels.push(g);
  };
  const baseY = joints.hip.position.y;
  // Thigh angle that keeps shins vertical and soles on the floor in a chair.
  const seatDrop = Math.asin(
    T.MathUtils.clamp((SEAT_HIP - LEG_DROP - (SHIN + ANKLE)) / THIGH, -1, 1),
  );
  const worldOf = (name: string) =>
    new T.Vector3().setFromMatrixPosition(joints[name].matrixWorld);
  if (spec.mobility === 'walker') {
    // Grips sit exactly where the walker pose places the hands.
    pose('walk', 0, 0);
    const grips = (['L', 'R'] as const).map((s) => {
      const w = worldOf(`hand${s}`);
      return w.addScaledVector(
        w.clone().sub(worldOf(`elbow${s}`)).normalize(),
        0.05,
      );
    });
    const { dark } = aids();
    for (const g of grips) {
      const x = g.x + Math.sign(g.x) * 0.02,
        front = g.z + 0.3,
        back = g.z - 0.06,
        y = g.y - 0.02;
      rod([x * 1.06, 0.035, front], [x, y, front - 0.03]);
      rod([x * 1.08, 0.02, back], [x, y, back + 0.04]);
      rod([x, y, back + 0.04], [x, y, front - 0.03], 0.012);
      const grip = put(new T.CylinderGeometry(0.017, 0.017, 0.12, 10), dark);
      grip.rotation.x = Math.PI / 2;
      grip.position.set(x, y + 0.004, g.z);
      put(new T.SphereGeometry(0.018, 8, 6), dark).position.set(
        x * 1.08,
        0.018,
        back,
      );
      wheel(x * 1.06, 0.045, front + 0.012, 0.045, false);
    }
    const [l, r] = grips;
    rod([l.x - 0.02, 0.56, l.z + 0.27], [r.x + 0.02, 0.56, r.z + 0.27]);
    rod([l.x - 0.02, 0.3, l.z + 0.285], [r.x + 0.02, 0.3, r.z + 0.285], 0.009);
  }
  if (spec.mobility === 'wheelchair') {
    const { fabric, dark } = aids(),
      seatY = 0.47;
    put(new RoundedBoxGeometry(0.44, 0.055, 0.44, 3, 0.022), fabric).position.set(
      0,
      seatY - 0.027,
      0,
    );
    const back = put(new RoundedBoxGeometry(0.42, 0.36, 0.035, 3, 0.016), fabric);
    back.position.set(0, seatY + 0.24, -0.235);
    back.rotation.x = -0.1;
    // Footplates meet the soles of the wheelchair pose.
    pose('roll', 0, 0);
    const ankle = worldOf('footR'),
      plateY = ankle.y - ANKLE - 0.008,
      plateZ = ankle.z + 0.045;
    for (const x of [-0.235, 0.235]) {
      rod([x, seatY - 0.04, -0.23], [x, seatY - 0.04, 0.22], 0.012);
      rod([x, seatY - 0.06, -0.24], [x, 0.93, -0.3], 0.012);
      rod([x, 0.93, -0.3], [x, 0.94, -0.38], 0.012);
      const grip = put(new T.CylinderGeometry(0.016, 0.016, 0.09, 10), dark);
      grip.rotation.x = Math.PI / 2;
      grip.position.set(x, 0.942, -0.375);
      rod([x, seatY - 0.04, 0.22], [x * 0.72, plateY + 0.02, plateZ - 0.07], 0.011);
      rod([x, seatY - 0.04, 0.12], [x * 0.95, 0.13, 0.3], 0.01);
      put(new RoundedBoxGeometry(0.15, 0.012, 0.13, 2, 0.005), dark).position.set(
        x * 0.48,
        plateY,
        plateZ,
      );
      wheel(Math.sign(x) * 0.305, 0.3, -0.08, 0.3, true, -Math.sign(x) * 0.05);
      wheel(x * 0.95, 0.06, 0.32, 0.06, false);
    }
    rod([-0.235, seatY - 0.06, -0.14], [0.235, seatY - 0.06, 0.1], 0.008);
    rod([0.235, seatY - 0.06, -0.14], [-0.235, seatY - 0.06, 0.1], 0.008);
  }
  // One mesh per material for each aid; wheels stay separate so they can spin.
  const consolidate = (parent: T.Object3D) => {
    const byMaterial = new Map<T.Material, T.BufferGeometry[]>();
    // Copy: meshes are removed from `parent` while iterating.
    for (const o of parent.children.slice())
      if (o instanceof T.Mesh) {
        o.updateMatrix();
        const list = byMaterial.get(o.material) ?? [];
        const g = o.geometry.applyMatrix4(o.matrix);
        list.push(g.index ? g.toNonIndexed() : g);
        if (g.index) g.dispose();
        byMaterial.set(o.material, list);
        parent.remove(o);
      }
    for (const [material, list] of byMaterial) {
      const merged = new T.Mesh(mergeGeometries(list, false)!, material);
      merged.name = `${spec.id}_aid`;
      merged.castShadow = true;
      parent.add(merged);
      list.forEach((g) => g.dispose());
    }
  };
  wheels.forEach(consolidate);
  consolidate(accessory);
  const gameAction = (
    spec as CharacterSpec & { segments?: { action: string }[] }
  ).segments?.[0]?.action;
  if (['ping-pong', 'wii', 'billiards', 'karaoke'].includes(gameAction || '')) {
    const color =
      gameAction === 'ping-pong'
        ? '#b85842'
        : gameAction === 'billiards'
          ? '#caa674'
          : '#e7e8df';
    const geo =
      gameAction === 'ping-pong'
        ? new T.CylinderGeometry(0.09, 0.09, 0.018, 16)
        : gameAction === 'billiards'
          ? new T.CylinderGeometry(0.012, 0.008, 1.2, 8)
          : new T.BoxGeometry(0.035, 0.15, 0.04);
    const prop = new T.Mesh(geo, new T.MeshStandardMaterial({ color }));
    prop.position.set(0, -0.07, 0.03);
    if (gameAction === 'ping-pong') prop.rotation.x = Math.PI / 2;
    joints.handR.add(prop);
    if (gameAction === 'karaoke') {
      const head = new T.Mesh(
        new T.SphereGeometry(0.035, 10, 8),
        new T.MeshStandardMaterial({ color: '#263f48' }),
      );
      head.position.y = -0.16;
      joints.handR.add(head);
    }
  }
  if (spec.cargo) {
    const trolley = new T.Group();
    trolley.name = 'delivery-trolley';
    root.add(trolley);
    const part = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: string,
      parent: T.Object3D = trolley,
    ) => {
      const m = new T.Mesh(
        new T.BoxGeometry(w, h, d),
        new T.MeshStandardMaterial({ color, roughness: 0.8 }),
      );
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    part(0, 0.28, 0.65, 0.55, 0.04, 0.65, '#94aaa5');
    part(0, 0.83, 0.36, 0.53, 0.025, 0.03, '#819892');
    for (const x of [-0.24, 0.24]) {
      part(x, 0.54, 0.36, 0.025, 0.6, 0.025, '#819892');
      for (const z of [0.4, 0.9]) {
        const w = new T.Mesh(
          new T.SphereGeometry(0.065, 10, 8),
          new T.MeshStandardMaterial({ color: '#374e50' }),
        );
        w.position.set(x, 0.1, z);
        trolley.add(w);
      }
    }
    const cargo = new T.Group();
    cargo.name = 'delivery-cargo';
    trolley.add(cargo);
    for (let i = 0; i < 3; i++) {
      part(
        0,
        0.42 + i * 0.19,
        0.65,
        0.46,
        0.18,
        0.52,
        spec.cargo === 'food' ? '#a4baa5' : '#b89365',
        cargo,
      );
      part(0, 0.42 + i * 0.19, 0.917, 0.055, 0.18, 0.012, '#e1d0aa', cargo);
    }
  }
  // Rest frame of each mitten hand (fingers along the forearm, palm inward),
  // and the hand centre's offset from the wrist joint.
  const SIDES = [
    ['L', -1],
    ['R', 1],
  ] as const;
  const handRest = {
      L: new T.Quaternion(),
      R: new T.Quaternion(),
    },
    handDir = { L: new T.Vector3(), R: new T.Vector3() },
    HAND_REACH = 0.072;
  for (const [side, s] of SIDES) {
    handDir[side].set(s * Math.sin(ARM_SPREAD), -Math.cos(ARM_SPREAD), 0);
    frameQ(
      handRest[side],
      handDir[side],
      new T.Vector3(-s * Math.cos(ARM_SPREAD), -Math.sin(ARM_SPREAD), 0),
    ).invert();
  }
  const v1 = new T.Vector3(),
    v2 = new T.Vector3(),
    v3 = new T.Vector3(),
    v4 = new T.Vector3(),
    q1 = new T.Quaternion(),
    q2 = new T.Quaternion(),
    q3 = new T.Quaternion(),
    qI = new T.Quaternion(),
    eul = new T.Euler(),
    X = new T.Vector3(1, 0, 0);
  /** Hand rotation (torso frame, relative to rest) from finger and palm directions. */
  const orient = (
    side: 'L' | 'R',
    fingers: T.Vector3,
    palm: T.Vector3,
    out: T.Quaternion,
  ) => frameQ(out, fingers, palm).multiply(handRest[side]);
  /** Two-bone arm: wrist to `wrist` (torso frame), elbow toward `pole`. */
  function armTo(side: 'L' | 'R', wrist: T.Vector3, pole: T.Vector3) {
    const arm = joints[`arm${side}`],
      elbow = joints[`elbow${side}`],
      u = elbow.position,
      f = joints[`hand${side}`].position,
      la = u.length(),
      lf = f.length(),
      d = v1.copy(wrist).sub(arm.position),
      D = T.MathUtils.clamp(
        d.length(),
        Math.abs(la - lf) + 0.02,
        la + lf - 1e-4,
      ),
      c = ((D * D - la * la - lf * lf) / 2 - u.x * f.x) / (u.y * f.y),
      e = -Math.acos(T.MathUtils.clamp(c, -1, 1));
    elbow.quaternion.setFromAxisAngle(X, e);
    v2.set(f.x, f.y * Math.cos(e), f.y * Math.sin(e)).add(u);
    frameQ(q1, v2, X).invert();
    v3.crossVectors(d, pole);
    if (v3.lengthSq() < 1e-8) v3.set(1, 0, 0);
    frameQ(arm.quaternion, d, v3).multiply(q1);
  }
  /** Hand to a torso-frame rotation, with the wrist bend limited. */
  function handTo(side: 'L' | 'R', q: T.Quaternion, limit = 1.5) {
    const hand = joints[`hand${side}`];
    hand.quaternion
      .copy(joints[`arm${side}`].quaternion)
      .multiply(joints[`elbow${side}`].quaternion)
      .invert()
      .multiply(q);
    const a = 2 * Math.acos(Math.min(1, Math.abs(hand.quaternion.w)));
    if (a > limit) hand.quaternion.slerp(qI, 1 - limit / a);
  }
  /** Hand centre to `c` with rotation `q` (torso frame); elbow toward `pole`. */
  function reach(
    side: 'L' | 'R',
    c: T.Vector3,
    q: T.Quaternion,
    pole: T.Vector3,
  ) {
    armTo(
      side,
      v4
        .copy(handDir[side])
        .applyQuaternion(q)
        .multiplyScalar(-HAND_REACH)
        .add(c),
      pole,
    );
    handTo(side, q);
  }
  /** Hip-frame point or rotation into the torso frame. */
  const torsoPoint = (p: T.Vector3) =>
    p
      .sub(joints.torso.position)
      .applyQuaternion(q3.copy(joints.torso.quaternion).invert());
  const torsoTurn = (q: T.Quaternion) =>
    q.premultiply(q3.copy(joints.torso.quaternion).invert());
  /** Two-bone leg: ankle to a mesh-space point, knee over the toes, sole flat or pitched. */
  function legTo(
    side: 'L' | 'R',
    x: number,
    z: number,
    yaw: number,
    lift = 0,
    pitch = 0,
  ) {
    const hip = joints.hip,
      leg = joints[`leg${side}`],
      knee = joints[`knee${side}`],
      foot = joints[`foot${side}`],
      hipInv = q3.copy(hip.quaternion).invert(),
      t = v1
        .set(x, ANKLE + lift, z)
        .sub(hip.position)
        .applyQuaternion(hipInv),
      d = t.sub(leg.position),
      a = knee.position.length(),
      b = foot.position.length(),
      D = T.MathUtils.clamp(d.length(), 0.05, a + b - 1e-4),
      k =
        Math.PI -
        Math.acos(
          T.MathUtils.clamp((a * a + b * b - D * D) / (2 * a * b), -1, 1),
        );
    knee.quaternion.setFromAxisAngle(X, k);
    frameQ(q1, v2.set(0, -a - b * Math.cos(k), -b * Math.sin(k)), X).invert();
    frameQ(
      leg.quaternion,
      d,
      v3.set(Math.cos(yaw), 0, -Math.sin(yaw)).applyQuaternion(hipInv),
    ).multiply(q1);
    foot.quaternion
      .copy(hip.quaternion)
      .multiply(leg.quaternion)
      .multiply(knee.quaternion)
      .invert()
      .multiply(q2.setFromEuler(eul.set(pitch, yaw, 0, 'YXZ')));
  }
  // Opera water sleeves: where each sleeve is thrown (mesh frame) and how far.
  const sleeveAim = { L: new T.Vector3(0, -1, 0), R: new T.Vector3(0, -1, 0) };
  const cv = new T.Vector3(),
    sv = new T.Vector3(),
    fv = new T.Vector3(),
    pv = new T.Vector3(),
    ov = new T.Vector3(),
    hq = new T.Quaternion(),
    kq = new T.Quaternion();
  /** Interpolated key pose for one arm (eased between keys, cyclic). */
  function keyed(keys: HandKey[], f: number, side: 'L' | 'R', s: number) {
    let i = keys.length - 1;
    while (i > 0 && keys[i][0] > f) i--;
    const a = keys[i],
      b = keys[(i + 1) % keys.length],
      span = (b[0] <= a[0] ? b[0] + 1 : b[0]) - a[0],
      t = smooth(0, 1, (f - a[0]) / span),
      mir = (v: V3, out: T.Vector3) => out.set(v[0] * s, v[1], v[2]);
    cv.lerpVectors(mir(a[1], v1), mir(b[1], v2), t);
    pv.lerpVectors(mir(a[4], v1), mir(b[4], v2), t);
    orient(side, mir(a[2], fv), mir(a[3], ov), hq);
    orient(side, mir(b[2], fv), mir(b[3], ov), kq);
    hq.slerp(kq, t);
    return a[5].map((x, j) => x + (b[5][j] - x) * t);
  }
  /**
   * Cycle phase (0–1) of an action for this person at loop time `time`, as
   * pose() uses it. Table activities and guests' tea are staggered per
   * person, so props tied to a moment (a placed piece, a turned page, a
   * played card) can follow the same phase.
   */
  function phase(action: Action, time: number) {
    const period = actionPeriods[action] ?? 2,
      stagger =
        TABLE_ACTIONS.has(action) ||
        (action === 'tea' && spec.role !== 'instructor');
    return (
      (((time / period + (stagger ? (h % 997) / 997 : 0)) % 1) + 1) % 1
    );
  }
  // Table layout shared by the seated table activities: top 0.74 m above the
  // floor, near edge ~0.30 m and centre ~0.60 m in front of the hip joint.
  const TABLE_TOP = 0.74,
    TABLE_EDGE = 0.3,
    TABLE_MID = 0.6;
  type HandPose = {
    f: number;
    c: T.Vector3;
    q: T.Quaternion;
    p: T.Vector3;
  };
  const keyPool: HandPose[] = Array.from({ length: 8 }, () => ({
    f: 0,
    c: new T.Vector3(),
    q: new T.Quaternion(),
    p: new T.Vector3(),
  }));
  /**
   * Hand key `k` at phase `f`: centre, fingers, palm and elbow direction,
   * given in the hip frame (table work) or the torso frame (near the body).
   */
  function handKey(
    k: number,
    f: number,
    side: 'L' | 'R',
    hipFrame: boolean,
    c: V3,
    fingers: V3,
    palm: V3,
    pole: V3,
  ) {
    const o = keyPool[k];
    o.f = f;
    o.c.set(...c);
    o.p.set(...pole);
    orient(side, fv.set(...fingers), pv.set(...palm), o.q);
    if (hipFrame) {
      torsoPoint(o.c);
      torsoTurn(o.q);
    }
  }
  /** Eased cyclic blend of the first `n` hand keys at phase `f` into cv/hq/ov. */
  function handPath(n: number, f: number) {
    let i = n - 1;
    while (i > 0 && keyPool[i].f > f) i--;
    const a = keyPool[i],
      b = keyPool[(i + 1) % n],
      span = (b.f <= a.f ? b.f + 1 : b.f) - a.f,
      t = smooth(0, 1, (f - a.f) / span);
    cv.lerpVectors(a.c, b.c, t);
    ov.lerpVectors(a.p, b.p, t);
    hq.slerpQuaternions(a.q, b.q, t);
  }
  /** A hand resting palm-down at the near table edge (hip frame). */
  function restAtTable(
    k: number,
    f: number,
    side: 'L' | 'R',
    s: number,
    y: number,
    z = 0,
  ) {
    handKey(
      k,
      f,
      side,
      true,
      [s * 0.15, y + 0.035, TABLE_EDGE + 0.05 + z],
      [-s * 0.25, -0.3, 1],
      [0, -1, -0.3],
      [s * 0.7, -0.7, -0.2],
    );
  }
  /**
   * Cultural activities: whole-body choreography standing, upper body only
   * when seated or using a mobility aid. `motion` scales the range.
   */
  function perform(
    action: Action,
    time: number,
    motion: number,
    sitting: boolean,
  ) {
    const full = !sitting && !spec.mobility,
      period = actionPeriods[action] ?? 8,
      f = (((time / period) % 1) + 1) % 1,
      th = f * TAU,
      m = motion,
      { hip, torso, head } = joints;
    if (senior) torso.rotation.x += 0.045;
    if (action === 'tai-chi') {
      // Yang-style cloud hands: the hands circle past the face and waist in
      // turn while the waist turns and the weight shifts in a low, wide stance.
      const sw = Math.sin(th),
        turn = 0.34 * sw * m;
      if (full) {
        // Tucked pelvis (尾闾中正), spine kept upright above it.
        hip.position.set(0.065 * sw * m, baseY - 0.085, 0);
        hip.rotation.set(-0.12, 0.5 * turn, 0);
        torso.rotation.set(torso.rotation.x + 0.12, 0.5 * turn, 0);
        legTo('L', -0.25, 0, -0.18);
        legTo('R', 0.25, 0, 0.18);
      } else torso.rotation.y = 0.75 * turn;
      torso.rotation.x += 0.03;
      for (const [side, s] of SIDES) {
        const a = th + (s > 0 ? 0 : Math.PI),
          sn = Math.sin(a),
          cs = Math.cos(a),
          up = (1 + cs) / 2;
        cv.set(
          s * (0.04 + 0.19 * sn * m),
          0.235 + 0.27 * cs * m,
          0.27 + 0.03 * cs,
        );
        fv.set(-s * 0.6, -0.05, 0.8).lerp(v1.set(-s * 0.2, 1, 0.2), up);
        pv.set(0, -1, 0.1).lerp(v1.set(s * 0.15, 0.1, -1), up);
        orient(side, fv, pv, hq);
        // Sunk shoulders, dropped elbows (沉肩坠肘).
        reach(side, cv, hq, ov.set(s * 0.45, -1, -0.15));
      }
      head.rotation.set(0.04, 0.16 * sw * m, 0);
    }
    if (action === 'qigong') {
      // Holding up the heavens: palms lift from the belly, turn over and press
      // overhead in a full stretch, then float down to the sides.
      let rise = 0,
        look = 0;
      for (const [side, s] of SIDES) {
        [rise, look] = keyed(qigongKeys, f, side, s);
        // A reduced range still lifts the arms overhead, just less far.
        cv.lerp(v3.set(s * 0.075, -0.04, 0.2), 0.4 * (1 - m));
        reach(side, cv, hq, pv);
      }
      rise *= m;
      if (full) {
        hip.position.y = baseY - 0.03 * (1 - rise) + 0.022 * rise;
        legTo('L', -0.11, 0, -0.08, 0.034 * rise, 0.3 * rise);
        legTo('R', 0.11, 0, 0.08, 0.034 * rise, 0.3 * rise);
      }
      torso.rotation.x -= 0.05 * rise;
      head.rotation.x = look * m;
    }
    if (action === 'fan-dance') {
      // Fans raised high and low in turn with a wrist flick, torso sway and
      // small side steps (fans face outward: palms face the front).
      const sw = Math.sin(th),
        lead = Math.sign(sw) * Math.pow(Math.abs(sw), 0.55),
        flick = 0.5 * Math.sin(2 * th) * m;
      torso.rotation.set(torso.rotation.x, 0.17 * lead * m, 0.07 * lead * m);
      for (const [side, s] of SIDES) {
        const hi = (1 + s * lead) / 2,
          arc = Math.sin(Math.PI * hi);
        cv.set(s * 0.43, 0.08, 0.1)
          .lerp(v1.set(s * 0.36, 0.6, 0.06), hi * m)
          .add(v2.set(-s * 0.08 * arc, 0, 0.1 * arc));
        fv.set(s * 0.9, -0.1, 0.4).lerp(v1.set(s * 0.45, 0.9, 0.05), hi);
        pv.set(0, -0.3, 1).lerp(v1.set(-s * 0.1, 0, 1), hi);
        orient(side, fv, pv, hq).premultiply(
          q1.setFromAxisAngle(fv.normalize(), s * flick),
        );
        reach(side, cv, hq, ov.set(s * 0.4, -1 + 0.4 * hi, -0.9 + 0.3 * hi));
      }
      head.rotation.set(
        -0.08 - 0.06 * Math.abs(lead),
        0.22 * lead * m,
        -0.04 * lead,
      );
      if (full) {
        hip.position.set(
          0.05 * lead * m,
          baseY - 0.028 + 0.01 * Math.abs(lead),
          0,
        );
        hip.rotation.y = 0.08 * lead * m;
        for (const [side, s] of SIDES) {
          const free = Math.max(0, -s * lead) * m;
          legTo(
            side,
            s * (0.11 + 0.11 * free),
            0.05 * free,
            s * 0.15,
            0.03 * free,
            0.5 * free,
          );
        }
      }
    }
    if (action === 'opera') {
      // Stage poise: weight on the back leg, front foot turned out; one hand
      // raised at head height, the other at the waist; slow head turns and a
      // flick of each water sleeve in turn.
      const sw = Math.sin(th),
        cw = Math.cos(th),
        flickR = bump(f, 0.26, 0.34, 0.4, 0.56) * m,
        flickL = bump(f, 0.72, 0.8, 0.84, 0.97) * m;
      if (full) {
        hip.position.set(-0.035, baseY - 0.032 + 0.008 * cw * m, 0);
        hip.rotation.set(0, 0.14, 0.025);
        legTo('L', -0.1, -0.03, -0.3);
        legTo('R', 0.06, 0.16, 0.42, 0.012, 0.18);
      }
      torso.rotation.set(torso.rotation.x, 0.08 + 0.07 * sw * m, -0.035);
      cv.set(
        0.3 + 0.03 * cw * m + 0.05 * flickR,
        0.4 + 0.05 * sw * m + 0.04 * flickR,
        0.18,
      );
      orient('R', fv.set(0.25, 1, 0.25), pv.set(1, -0.1, 0.45), hq);
      reach('R', cv, hq, ov.set(0.7, -0.8, -0.2));
      cv.set(-0.1 - 0.06 * flickL, 0.0 + 0.04 * flickL, 0.24 + 0.05 * flickL);
      orient('L', fv.set(0.5, -0.4, 0.75), pv.set(0.3, -1, -0.2), hq);
      reach('L', cv, hq, ov.set(-0.8, -0.6, -0.4));
      head.rotation.set(-0.04, 0.4 * sw * m, 0.06 * Math.sin(th + 1));
      // Sleeve aims in the torso frame, carried to the mesh frame.
      q2.copy(hip.quaternion).multiply(torso.quaternion);
      sleeveAim.R.set(0, -1, 0)
        .lerp(v1.set(0.85, 0.45, 0.3), flickR)
        .applyQuaternion(q2);
      sleeveAim.L.set(0, -1, 0)
        .lerp(v1.set(-0.35, 0.15, 1), flickL * 0.85)
        .applyQuaternion(q2);
    }
    if (action === 'erhu') {
      // Seated erhu: the instrument stands on the left thigh (hip frame); the
      // left hand stops the strings high on the neck, the right hand draws the
      // bow level across the strings.
      const sw = Math.sin(th),
        bow = Math.sign(sw) * Math.pow(Math.abs(sw), 0.7) * m;
      torso.rotation.set(
        torso.rotation.x + 0.06,
        -0.08 + 0.03 * bow,
        0.015 * bow,
      );
      torsoPoint(cv.copy(ERHU.bowHand).setX(0.17 + 0.17 * bow));
      orient('R', fv.set(-0.1, -0.35, 1), pv.set(-1, 0, 0), hq);
      reach('R', cv, torsoTurn(hq), ov.set(0.4, -1, -0.5));
      torsoPoint(
        cv.copy(ERHU.stopHand).add(v1.set(0, 0.006 * Math.sin(4 * th), 0)),
      );
      orient('L', fv.set(0.35, 0.9, 0.15), pv.set(1, 0, 0), hq);
      reach('L', cv, torsoTurn(hq), ov.set(-1, -0.7, -0.3));
      head.rotation.set(0.12, -0.2 + 0.04 * bow, -0.05);
    }
    if (action === 'tea') {
      const table = (sitting ? 0.74 : 1.03) - hip.position.y;
      if (spec.role === 'instructor') {
        // Tea host: lift the pot, pour in a small arc over the cups, set it
        // down; the left hand steadies the lid; eyes on the cups.
        const pour = bump(f, 0.2, 0.3, 0.64, 0.74),
          tilt = bump(f, 0.3, 0.4, 0.56, 0.66),
          arc = smooth(0.3, 0.62, f);
        torso.rotation.x += 0.1 + 0.04 * pour;
        cv.set(
          0.2 - 0.27 * arc * pour,
          table + 0.07 + 0.1 * pour,
          0.4 + 0.04 * pour * Math.sin(Math.PI * arc),
        );
        sv.copy(cv);
        torsoPoint(cv);
        const r = 0.85 * tilt * m;
        orient(
          'R',
          fv.set(0, -0.15, 1),
          pv.set(-Math.cos(r), -Math.sin(r), 0),
          hq,
        );
        reach('R', cv, torsoTurn(hq), ov.set(0.8, -0.6, -0.3));
        cv.set(-0.16, table + 0.035, 0.32).lerp(
          sv.add(v2.set(-0.07, 0.075, -0.01)),
          pour,
        );
        torsoPoint(cv);
        orient('L', fv.set(0.3, -0.25, 1), pv.set(0, -1, 0), hq);
        reach('L', cv, torsoTurn(hq), ov.set(-0.8, -0.6, -0.3));
        head.rotation.set(0.24, -0.1 * pour, 0);
      } else {
        // Seated guest: a sip every cycle (staggered per person), otherwise
        // both hands rest at the table edge, the cup in the right hand.
        const g = (((time / period + (h % 997) / 997) % 1) + 1) % 1,
          sip = bump(g, 0.3, 0.44, 0.6, 0.74) * Math.min(1, m / 0.65);
        torso.rotation.x += 0.05 - 0.03 * sip;
        torsoPoint(cv.set(0.12, table + 0.045, 0.33)).lerp(
          v1.set(0.04, 0.47, 0.17),
          sip,
        );
        orient('R', fv.set(-0.25, -0.1, 1), pv.set(-1, 0, -0.25), hq);
        orient('R', v2.set(-0.75, 0.15, 0.6), v3.set(-0.45, -0.55, -0.6), kq);
        hq.premultiply(q3.copy(joints.torso.quaternion).invert()).slerp(
          kq,
          sip,
        );
        reach('R', cv, hq, ov.set(0.8, -0.7, -0.2));
        torsoPoint(cv.set(-0.13, table + 0.035, 0.31));
        orient('L', fv.set(0.25, -0.2, 1), pv.set(0, -1, 0), hq);
        reach('L', cv, torsoTurn(hq), ov.set(-0.8, -0.6, -0.3));
        head.rotation.set(0.12 - 0.2 * sip, 0, 0);
      }
    }
    if (TABLE_ACTIONS.has(action)) tableWork(action, phase(action, time), m);
  }
  /**
   * Seated table activities (always sitting): board games, watching a game,
   * knitting, cards and reading. Table work is placed in the hip frame,
   * hand-held work in the torso frame; `m` < 1 shortens reaches.
   */
  function tableWork(action: Action, g: number, m: number) {
    const { torso, head } = joints,
      top = TABLE_TOP / profile.height - joints.hip.position.y,
      mid = TABLE_EDGE + (TABLE_MID - TABLE_EDGE) * (0.7 + 0.3 * m);
    if (action === 'board-game') {
      // Lean in, place a piece at the board centre, withdraw, then think
      // with the right hand at the chin; eyes stay on the board.
      const reachOut = bump(g, 0.26, 0.4, 0.53, 0.66),
        think = bump(g, 0.58, 0.68, 0.86, 0.97);
      torso.rotation.x += 0.1 + 0.16 * reachOut + 0.05 * think;
      restAtTable(0, 0, 'R', 1, top);
      restAtTable(1, 0.26, 'R', 1, top);
      // Palm down so the pinched piece stays level.
      const over: [V3, V3, V3] = [
        [-0.1, -0.15, 1],
        [0, -1, -0.12],
        [0.6, -0.6, -0.5],
      ];
      handKey(2, 0.4, 'R', true, [0.05, top + 0.08, mid - 0.04], ...over);
      handKey(3, 0.47, 'R', true, [0.05, top + 0.039, mid - 0.035], ...over);
      handKey(4, 0.54, 'R', true, [0.06, top + 0.11, mid - 0.07], ...over);
      handKey(
        5,
        0.68,
        'R',
        false,
        [0.035, 0.405, 0.16],
        [-0.3, 0.9, 0.3],
        [0.1, 0.3, -1],
        [0.3, -1, 0.3],
      );
      handKey(
        6,
        0.86,
        'R',
        false,
        [0.035, 0.405, 0.16],
        [-0.3, 0.9, 0.3],
        [0.1, 0.3, -1],
        [0.3, -1, 0.3],
      );
      restAtTable(7, 0.97, 'R', 1, top);
      handPath(8, g);
      reach('R', cv, hq, ov);
      restAtTable(0, 0, 'L', -1, top);
      handPath(1, 0);
      reach('L', cv, hq, ov);
      head.rotation.set(
        0.42 + 0.06 * reachOut - 0.12 * think,
        -0.06 * reachOut,
        0.07 * think,
      );
    }
    if (action === 'watch') {
      // A spectator leaning on the table edge, glancing from player to
      // player with small nods, now and then pointing at the board.
      const sw = Math.sin(TAU * g),
        turn = Math.sign(sw) * Math.pow(Math.abs(sw), 0.45) * m,
        point = bump(g, 0.55, 0.63, 0.7, 0.78);
      torso.rotation.x += 0.2;
      torso.rotation.y = 0.1 * turn * (1 - point);
      for (const [side, s] of SIDES) {
        handKey(
          0,
          0,
          side,
          true,
          [s * 0.13, top + 0.04, TABLE_EDGE + 0.08],
          [-s * 0.35, -0.2, 1],
          [0, -1, -0.2],
          [s * 0.3, -0.6, -1],
        );
        handPath(1, 0);
        if (side === 'R') {
          hq.slerp(
            orient('R', fv.set(-0.15, -0.15, 1), pv.set(-0.7, -0.7, 0), kq),
            point * m,
          );
          cv.lerp(torsoPoint(v4.set(0.08, top + 0.2, mid - 0.08)), point * m);
          ov.lerp(v3.set(0.6, -0.8, -0.2), point);
        }
        reach(side, cv, hq, ov);
      }
      head.rotation.set(
        0.24 + 0.05 * Math.max(0, Math.sin(TAU * 3 * g)) * m,
        0.42 * turn * (1 - point),
        0,
      );
    }
    if (action === 'knit') {
      // Hands together in front of the lower chest, the needles stroking in
      // turn; eyes on the work.
      const a = TAU * g;
      torso.rotation.x += 0.12;
      for (const [side, s] of SIDES) {
        const stroke = Math.max(0, s * Math.sin(a)) * (0.6 + 0.4 * m);
        cv.set(s * 0.072, 0.22, 0.25).add(
          v1.set(-s * 0.018 * stroke, 0.012 * stroke, 0.022 * stroke),
        );
        orient(
          side,
          fv.set(-s * 0.6, 0.3, 0.75),
          pv.set(-s * 0.25, -0.95, 0.15),
          hq,
        );
        hq.premultiply(q1.setFromAxisAngle(fv.normalize(), s * 0.3 * stroke));
        reach(side, cv, hq, ov.set(s * 0.6, -0.9, -0.1));
      }
      head.rotation.set(0.42, 0.03 * Math.sin(a), 0);
    }
    if (action === 'cards') {
      // The left hand holds a fan of cards at chest height facing the
      // player; the right hand draws one, plays it to the table centre and
      // returns to the table edge.
      const play = bump(g, 0.28, 0.4, 0.46, 0.56);
      torso.rotation.x += 0.06 + 0.12 * play;
      cv.set(-0.075, 0.3 + 0.008 * Math.sin(TAU * g), 0.25);
      orient('L', fv.set(0.3, 0.9, 0.15), pv.set(0.05, 0.25, -1), hq);
      reach('L', cv, hq, ov.set(-0.7, -0.8, -0.1));
      restAtTable(0, 0, 'R', 1, top);
      restAtTable(1, 0.1, 'R', 1, top);
      const pick: [V3, V3, V3] = [
          [-0.4, 0.55, 0.7],
          [-0.8, -0.3, 0.4],
          [0.7, -0.8, -0.2],
        ],
        lay: [V3, V3, V3] = [
          [-0.1, -0.2, 1],
          [0, -1, -0.1],
          [0.6, -0.6, -0.5],
        ];
      handKey(2, 0.2, 'R', false, [0.0, 0.39, 0.245], ...pick);
      handKey(3, 0.26, 'R', false, [0.01, 0.42, 0.245], ...pick);
      handKey(4, 0.4, 'R', true, [0.03, top + 0.07, mid - 0.06], ...lay);
      handKey(5, 0.46, 'R', true, [0.03, top + 0.032, mid - 0.05], ...lay);
      restAtTable(6, 0.56, 'R', 1, top);
      handPath(7, g);
      reach('R', cv, hq, ov);
      head.rotation.set(0.22 + 0.2 * play, -0.12 * (1 - play), 0);
    }
    if (action === 'read') {
      // An open book or folded paper held up in both hands, eyes scanning;
      // the right hand turns a page once a cycle.
      torso.rotation.x += 0.06;
      for (const [side, s] of SIDES) {
        handKey(
          0,
          0,
          side,
          false,
          [s * 0.155, 0.24, 0.285],
          [-s * 0.25, 0.65, 0.7],
          [-s * 0.9, -0.1, -0.4],
          [s * 0.6, -0.8, -0.3],
        );
        if (side === 'L') {
          handPath(1, 0);
          reach('L', cv, hq, ov);
          continue;
        }
        handKey(
          1,
          0.68,
          side,
          false,
          [0.155, 0.24, 0.285],
          [-0.25, 0.65, 0.7],
          [-0.9, -0.1, -0.4],
          [0.6, -0.8, -0.3],
        );
        const turnPage: [V3, V3, V3] = [
          [-0.6, 0.45, 0.65],
          [0, -0.8, 0.55],
          [0.6, -0.8, -0.3],
        ];
        handKey(
          2,
          0.76,
          side,
          false,
          [0.12, 0.32 * m + 0.24 * (1 - m), 0.265],
          ...turnPage,
        );
        handKey(
          3,
          0.83,
          side,
          false,
          [0.155 - 0.195 * m, 0.33 * m + 0.24 * (1 - m), 0.285],
          ...turnPage,
        );
        handPath(4, g);
        reach('R', cv, hq, ov);
      }
      head.rotation.set(0.36, 0.07 * Math.sin(TAU * 3 * g) * m, 0);
    }
  }
  /** Water sleeves hang from the hand bones; let them fall (or fly) freely. */
  function drapeSleeves(thrown: boolean) {
    for (const [side] of SIDES) {
      const hand = joints[`hand${side}`];
      // Elbow orientation in the mesh frame.
      q1.copy(joints.hip.quaternion)
        .multiply(joints.torso.quaternion)
        .multiply(joints[`arm${side}`].quaternion)
        .multiply(joints[`elbow${side}`].quaternion);
      q2.copy(q1).multiply(hand.quaternion);
      v1.copy(handDir[side]).applyQuaternion(q2);
      v2.copy(thrown ? sleeveAim[side] : v3.set(0, -1, 0)).normalize();
      q3.setFromUnitVectors(v1, v2);
      const a = 2 * Math.acos(Math.min(1, Math.abs(q3.w))),
        limit = 2.1;
      if (a > limit) q3.slerp(qI, 1 - limit / a);
      hand.quaternion.copy(q1.invert()).multiply(q3.multiply(q2));
    }
    sleeveAim.L.set(0, -1, 0);
    sleeveAim.R.set(0, -1, 0);
  }
  function pose(
    action: Action,
    time: number,
    motion = 1,
    seatedOverride = false,
  ) {
    for (const b of bones) b.rotation.set(0, 0, 0);
    joints.hip.position.set(0, baseY, 0);
    wheels.forEach((w) => (w.rotation.x = 0));
    const stride = Math.sin(time * Math.PI * 2 * 0.9) * motion,
      breath = Math.sin(time * Math.PI * 2 * 0.25) * motion,
      walking =
        ['walk', 'escort'].includes(action) && spec.mobility !== 'wheelchair';
    // Relaxed arms carry a slight natural bend.
    joints.elbowL.rotation.x = joints.elbowR.rotation.x = -0.1;
    if (walking) {
      joints.legL.rotation.x = 0.34 * stride;
      joints.legR.rotation.x = -0.34 * stride;
      joints.kneeL.rotation.x = Math.max(0, -stride) * 0.5 + 0.04;
      joints.kneeR.rotation.x = Math.max(0, stride) * 0.5 + 0.04;
      for (const s of ['L', 'R'])
        joints[`foot${s}`].rotation.x =
          -(joints[`leg${s}`].rotation.x + joints[`knee${s}`].rotation.x) * 0.6;
      joints.armL.rotation.x = -0.22 * stride;
      joints.armR.rotation.x = 0.22 * stride;
      joints.elbowL.rotation.x = -0.16 - 0.1 * Math.max(0, stride);
      joints.elbowR.rotation.x = -0.16 - 0.1 * Math.max(0, -stride);
      joints.torso.rotation.y = 0.035 * stride;
      joints.hip.rotation.y = -0.035 * stride;
      joints.hip.position.y += Math.abs(stride) * 0.016;
    }
    const inWheelchair = spec.mobility === 'wheelchair',
      performing = action in actionPeriods,
      sitting =
        action === 'seated' ||
        action === 'ride' ||
        action === 'erhu' ||
        TABLE_ACTIONS.has(action) ||
        !!spec.seated ||
        seatedOverride ||
        inWheelchair;
    if (sitting) {
      joints.hip.position.y = SEAT_HIP;
      for (const s of ['L', 'R']) {
        // Chair: thighs level, shins vertical, soles on the floor.
        // Wheelchair: shins angled forward onto the footplates.
        joints[`leg${s}`].rotation.x = inWheelchair
          ? -1.58
          : -(Math.PI / 2 - seatDrop);
        joints[`knee${s}`].rotation.x = inWheelchair
          ? 1.1
          : Math.PI / 2 - seatDrop;
        joints[`foot${s}`].rotation.x = inWheelchair ? 0.48 : 0;
        joints[`leg${s}`].rotation.z = (s === 'L' ? -1 : 1) * 0.04;
        // Hands rest on the lap unless an activity uses them.
        joints[`arm${s}`].rotation.x = -0.2;
        joints[`arm${s}`].rotation.z = (s === 'L' ? 1 : -1) * 0.04;
        joints[`elbow${s}`].rotation.x = -0.95;
      }
    }
    if (
      ['consult', 'treat', 'tabletop', 'document', 'serve'].includes(action)
    ) {
      joints.armL.rotation.x = -0.3;
      joints.armR.rotation.x = -0.4 - 0.06 * breath;
      joints.elbowL.rotation.x = -0.9;
      joints.elbowR.rotation.x = -0.95 - 0.1 * stride;
      joints.head.rotation.x = 0.07;
      joints.head.rotation.y = 0.06 * breath;
    }
    if (['ping-pong', 'wii'].includes(action)) {
      joints.armR.rotation.x = -0.7 + 0.65 * stride;
      joints.elbowR.rotation.x = -0.45;
      joints.torso.rotation.y = 0.17 * stride;
      joints.armL.rotation.x = -0.35;
    }
    if (action === 'billiards') {
      joints.torso.rotation.x = 0.18;
      joints.armL.rotation.x = -0.8;
      joints.armR.rotation.x = -0.65 + 0.1 * stride;
      joints.elbowR.rotation.x = -0.7;
    }
    if (action === 'mahjong') {
      joints.armL.rotation.x = -0.5;
      joints.armR.rotation.x = -0.7 - 0.18 * breath;
      joints.elbowR.rotation.x = -0.75;
      joints.head.rotation.x = 0.12;
    }
    if (action === 'exercise') {
      joints.armL.rotation.z = -0.65 - 0.28 * breath;
      joints.armR.rotation.z = 0.65 + 0.28 * breath;
      joints.elbowL.rotation.x = joints.elbowR.rotation.x = -0.12;
    }
    if (action === 'escort') {
      // Hands forward at hip height: pushing handles or steadying an arm.
      for (const side of ['L', 'R']) {
        joints[`arm${side}`].rotation.x = -0.42;
        joints[`elbow${side}`].rotation.x = -0.62;
      }
      joints.torso.rotation.x = 0.07;
    }
    if (action === 'greet') {
      // A raised-hand wave.
      joints.armR.rotation.z = 0.55;
      joints.elbowR.rotation.z = 1.7 + 0.2 * stride;
    }
    const slow = Math.sin((time * Math.PI) / 4) * motion;
    if (['present', 'conversation', 'perform', 'karaoke'].includes(action)) {
      joints.armL.rotation.x = -0.4;
      joints.elbowL.rotation.x = -0.9;
      joints.armR.rotation.set(-0.45, 0, 0.3 + 0.12 * breath);
      joints.elbowR.rotation.x = ['perform', 'karaoke'].includes(action)
        ? -1.55
        : -0.8;
      joints.head.rotation.y = 0.12 * slow;
    }
    if (action === 'clap') {
      for (const side of ['L', 'R']) {
        joints[`arm${side}`].rotation.x = -0.7;
        joints[`elbow${side}`].rotation.x = -1.05;
        joints[`arm${side}`].rotation.z =
          (side === 'L' ? 1 : -1) * (0.1 + 0.09 * (stride + 1));
      }
    }
    if (action === 'dance') {
      joints.torso.rotation.y = 0.12 * breath;
      joints.armL.rotation.set(-0.25, 0, -0.55 - 0.16 * stride);
      joints.armR.rotation.set(-0.25, 0, 0.55 + 0.16 * stride);
      joints.elbowL.rotation.x = joints.elbowR.rotation.x = -0.65;
      if (!sitting) {
        joints.hip.rotation.y = 0.07 * breath;
        joints.legL.rotation.x = joints.legR.rotation.x = -0.025 * (1 + stride);
        joints.kneeL.rotation.x = joints.kneeR.rotation.x = 0.05 * (1 + stride);
      }
    }
    if (performing) perform(action, time, motion, sitting);
    if (['device', 'write', 'craft', 'music'].includes(action)) {
      joints.armL.rotation.x = -0.6;
      joints.armR.rotation.x = -0.6;
      joints.elbowL.rotation.x = -0.95;
      joints.elbowR.rotation.x =
        -0.95 + (action === 'music' ? 0.22 : 0.07) * stride;
      joints.head.rotation.x = action === 'music' ? 0 : 0.18;
      if (['write', 'craft', 'music'].includes(action)) {
        joints.armR.rotation.x = -0.7;
        joints.elbowR.rotation.x =
          -1.25 + (action === 'music' ? 0.16 : 0.045) * stride;
      }
      if (action === 'write') {
        joints.handR.rotation.y = 0.17 * slow;
        joints.armR.rotation.y = 0.06 * breath;
      }
      if (action === 'craft') joints.handL.rotation.y = -0.12 * breath;
      if (action === 'device') {
        joints.armR.rotation.y = -0.45;
        joints.elbowR.rotation.x = -1.1;
        joints.handR.rotation.x = 0.13 * stride;
      }
    }
    if (action === 'listen') {
      joints.armL.rotation.x = joints.armR.rotation.x = -0.28;
      joints.elbowL.rotation.x = joints.elbowR.rotation.x = -0.85;
      joints.head.rotation.y = 0.06 * slow;
    }
    if (spec.mobility === 'cane' && !sitting) {
      joints.armR.rotation.set(-0.02, 0, 0);
      joints.elbowR.rotation.set(-0.02, 0, 0);
      joints.handR.rotation.set(0, 0, 0);
      if (action === 'greet') {
        joints.armL.rotation.z = -0.55;
        joints.elbowL.rotation.z = -1.7 - 0.2 * stride;
      }
    }
    // The walker frame is set aside while seated (e.g. riding in the van).
    if (spec.mobility === 'walker') accessory.visible = !sitting;
    if (spec.mobility === 'walker' && !sitting) {
      for (const s of ['L', 'R']) {
        joints[`arm${s}`].rotation.set(-0.36, 0, 0);
        joints[`elbow${s}`].rotation.set(-0.5, 0, 0);
        joints[`hand${s}`].rotation.set(0.3, 0, 0);
      }
    }
    if (inWheelchair && ['walk', 'roll'].includes(action)) {
      for (const s of ['L', 'R']) {
        joints[`arm${s}`].rotation.x = spec.assisted
          ? -0.25
          : -0.13 - 0.3 * stride;
        joints[`arm${s}`].rotation.z = spec.assisted
          ? 0
          : (s === 'L' ? -1 : 1) * 0.2;
        joints[`elbow${s}`].rotation.x = spec.assisted ? -0.9 : -0.5;
      }
      wheels.forEach((w) => (w.rotation.x = -time * 1.7));
    }
    if (action === 'idle') {
      joints.head.rotation.y = 0.05 * breath;
      joints.hip.rotation.z = 0.012 * breath;
      joints.torso.rotation.z = -0.012 * breath;
    }
    // Participants: slightly shorter, with a gentle forward posture.
    if (senior) {
      if (!performing) joints.torso.rotation.x += 0.045;
      joints.neck.rotation.x += 0.07;
      joints.head.rotation.x -= 0.1;
    }
    if (cs === 'opera') {
      // Wide robe: arms hang a little away from it unless an act places them.
      if (!performing) {
        joints.armL.rotation.z -= 0.1;
        joints.armR.rotation.z += 0.1;
      }
      drapeSleeves(action === 'opera');
    }
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
  }
  pose('idle', 0, 0);
  function clips() {
    const list: T.AnimationClip[] = [];
    for (const action of [
      'idle',
      'walk',
      'consult',
      'exercise',
      'seated',
      'tabletop',
      'greet',
      'perform',
      'clap',
      'present',
      'conversation',
      'device',
      'dance',
      'tai-chi',
      'write',
      'craft',
      'music',
      'listen',
      'qigong',
      'fan-dance',
      'opera',
      'erhu',
      'tea',
      'board-game',
      'watch',
      'knit',
      'cards',
      'read',
    ] as Action[]) {
      // Cultural actions bake one full period; the rest keep 2 s clips.
      const period = actionPeriods[action] ?? 2,
        steps = period === 2 ? 40 : Math.max(40, Math.round(period * 6));
      const times: number[] = [],
        positions: number[] = [],
        tracks = new Map<T.Bone, number[]>();
      bones.forEach((b) => tracks.set(b, []));
      for (let i = 0; i <= steps; i++) {
        const t = (i * period) / steps;
        times.push(t);
        pose(action, t);
        positions.push(...joints.hip.position.toArray());
        bones.forEach((b) => tracks.get(b)!.push(...b.quaternion.toArray()));
      }
      tracks.forEach((v) => v.splice(v.length - 4, 4, ...v.slice(0, 4)));
      positions.splice(positions.length - 3, 3, ...positions.slice(0, 3));
      list.push(
        new T.AnimationClip(`${spec.id}:${action}`, period, [
          new T.VectorKeyframeTrack(
            `${joints.hip.name}.position`,
            times,
            positions,
          ),
          ...bones.map(
            (b) =>
              new T.QuaternionKeyframeTrack(
                `${b.name}.quaternion`,
                times,
                tracks.get(b)!,
              ),
          ),
        ]),
      );
    }
    pose('idle', 0, 0);
    return list;
  }
  return { root, mesh, bones, joints, pose, clips, profile, phase };
}
