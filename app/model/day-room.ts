import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  dayProgram as program,
  floorPrograms,
  instructorOf,
  type DaySession,
  type DayZone,
} from './day-program';
import type { ActorSpec, ActorSample } from './activity';
import { ERHU, type Action, type createCharacter } from './characters';
import type { Facility } from './schema';

export { dayProgram, programAt } from './day-program';
type Person = ReturnType<typeof createCharacter> & {
  spec: ActorSpec;
  sample: ActorSample;
};
/**
 * A floating highlight: the session running now in one day-room zone
 * (`kind: 'zone'`) or the pastime at one game table (`kind: 'table'`).
 */
export type DayHighlight = {
  kind: 'zone' | 'table';
  id: string;
  /** Zone entries: the zone and its session. */
  zoneId?: string;
  sessionId?: string;
  /** Table entries: the table object id and its activity. */
  tableId?: string;
  activity?: string;
  /** `${labelZh} ${label}`, or the English label alone. */
  title: string;
  label: string;
  labelZh?: string;
  /** `with ${instructor.name}`, the activities team, or '' for tables. */
  subtitle: string;
  /** Label anchor in world metres. */
  position: T.Vector3;
  /** The activity follow id (interaction track) for this entry. */
  follow: string;
};
/** An activity tool shown for `actions`, and only in `sessions` when listed. */
export type DayProp = {
  actor: Person;
  root: T.Object3D;
  actions: string[];
  sessions?: string[];
};

// Clay palette: rich cinnabar and gold that read on warm oak, ink and paper.
const C = {
  lantern: '#c2342a',
  rib: '#8c241d',
  gold: '#d6a63f',
  goldDeep: '#b5852f',
  tassel: '#b02e26',
  cord: '#8e2a22',
  red: '#c1372b',
  redDeep: '#9c2a22',
  ink: '#232323',
  inkSoft: '#4b4f4c',
  wash: '#a3a69f',
  rice: '#f8f4e8',
  felt: '#3d4442',
  stone: '#302d2b',
  wood: '#7d5437',
  woodDark: '#4b2e22',
  bamboo: '#c9a66c',
  inkBamboo: '#2c3f33',
  inkBambooSoft: '#66756a',
  jade: '#79a690',
  celadon: '#c3d8c8',
  porcelain: '#f4f2ec',
  cobalt: '#3d5f93',
  clayPot: '#8b4532',
  tea: '#b47530',
  newsprint: '#ece9e0',
  print: '#9d9e98',
  silk: '#ddd2b6',
  silkEdge: '#a08f6e',
  tan: '#e4cfad',
  cream: '#f4e6be',
  blush: '#efc3b4',
  butter: '#efd27e',
};
const TABLE_TOP = 0.75;
const LONG_TABLE = { x: -12.007418, z: 14.958394, hx: 0.45791, hz: 2.31499 };
const TEA_TABLES = [11.01528, 13.101315, 15.187349].map((z) => ({
  x: -1.526367,
  z,
  hx: 0.48335,
  hz: 0.81406,
}));
const BAY_X = -14.296968554513244 + 0.235;
const BAYS = {
  lattice: 13.22851182979873,
  tv: 15.009273037656252,
  books: 16.790034245513773,
};

// ---------------------------------------------------------------------------
// Build-time geometry kit: colored primitives merged into one vertex-colored
// mesh per prop, so each prop or décor piece costs a single draw call.
const _p = new T.Vector3(),
  _s = new T.Vector3(),
  _q = new T.Quaternion(),
  _e = new T.Euler(),
  _c = new T.Color();
const place = (
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) =>
  new T.Matrix4().compose(
    _p.set(x, y, z),
    _q.setFromEuler(_e.set(rx, ry, rz)),
    _s.set(sx, sy, sz),
  );
const templates = {
  box: new T.BoxGeometry(1, 1, 1),
  ball: new T.SphereGeometry(1, 12, 8),
  pebble: new T.SphereGeometry(1, 8, 5),
  ring: new T.TorusGeometry(1, 0.022, 4, 28),
};
const cylinders = new Map<string, T.BufferGeometry>();
const cylinder = (taper: number, segments: number) => {
  const key = taper + '|' + segments;
  if (!cylinders.has(key))
    cylinders.set(key, new T.CylinderGeometry(taper, 1, 1, segments));
  return cylinders.get(key)!;
};
const roundedBoxes = new Map<string, T.BufferGeometry>();
type V3 = [number, number, number];
class Kit {
  private parts: T.BufferGeometry[] = [];
  private frames = [new T.Matrix4()];
  push(m: T.Matrix4) {
    this.frames.push(this.frames[this.frames.length - 1].clone().multiply(m));
    return this;
  }
  pop() {
    this.frames.pop();
    return this;
  }
  /** Adds a primitive in `color`; `null` keeps a kit-built geometry's own colors. */
  add(geometry: T.BufferGeometry, color: string | null, m = new T.Matrix4()) {
    // Indexed throughout: shared vertices keep smooth parts light.
    const g = geometry.clone();
    if (!g.index)
      g.setIndex(
        Array.from({ length: g.attributes.position.count }, (_, i) => i),
      );
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', ...(color ? [] : ['color'])].includes(name))
        g.deleteAttribute(name);
    g.clearGroups();
    g.applyMatrix4(this.frames[this.frames.length - 1].clone().multiply(m));
    this.parts.push(g);
    if (!color) return this;
    _c.set(color);
    const n = g.attributes.position.count,
      colors = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i += 3) {
      colors[i] = _c.r;
      colors[i + 1] = _c.g;
      colors[i + 2] = _c.b;
    }
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    return this;
  }
  box(
    color: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    return this.add(templates.box, color, place(x, y, z, rx, ry, rz, w, h, d));
  }
  /** A softened block for chunky clay pieces (trays, ink stones, boards). */
  rbox(
    color: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    ry = 0,
    rx = 0,
  ) {
    const key = [w, h, d].join('|');
    if (!roundedBoxes.has(key))
      roundedBoxes.set(
        key,
        new RoundedBoxGeometry(
          w,
          h,
          d,
          2,
          Math.min(0.012, w / 4, h / 4, d / 4),
        ),
      );
    return this.add(roundedBoxes.get(key)!, color, place(x, y, z, rx, ry));
  }
  ball(
    color: string,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry = rx,
    rz = rx,
    ax = 0,
    ay = 0,
    az = 0,
    smooth = true,
  ) {
    return this.add(
      smooth ? templates.ball : templates.pebble,
      color,
      place(x, y, z, ax, ay, az, rx, ry, rz),
    );
  }
  cyl(
    color: string,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    ax = 0,
    ay = 0,
    az = 0,
    taper = 1,
    segments = 14,
  ) {
    return this.add(
      cylinder(taper, segments),
      color,
      place(x, y, z, ax, ay, az, r, h, r),
    );
  }
  /** A cylinder from `a` to `b`; `taper` scales the radius at `b`. */
  rod(color: string, a: V3, b: V3, r: number, segments = 6, taper = 1) {
    const dir = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = dir.length();
    return this.add(
      cylinder(taper, segments),
      color,
      new T.Matrix4().compose(
        new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          dir.normalize(),
        ),
        new T.Vector3(r, length, r),
      ),
    );
  }
  ring(
    color: string,
    x: number,
    y: number,
    z: number,
    r: number,
    ry = r,
    ax = 0,
    ay = 0,
    az = 0,
  ) {
    return this.add(
      templates.ring,
      color,
      place(x, y, z, ax, ay, az, r, ry, r),
    );
  }
  geometry() {
    const g = mergeGeometries(this.parts, false)!;
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}
/** Seeded pseudo-random numbers keep décor identical between loads. */
const seeded = (seed: number) => {
  let s = seed % 2147483646 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
// Abstract brush "characters": stroke clusters, never real text.
type Stroke = [
  u: number,
  v: number,
  w: number,
  h: number,
  a: number,
  round: boolean,
];
function glyph(
  rand: () => number,
  cu: number,
  cv: number,
  S: number,
): Stroke[] {
  const r = (a: number, b: number) => a + (b - a) * rand();
  const out: Stroke[] = [
    [
      cu + r(-0.05, 0.05) * S,
      cv + r(0.26, 0.38) * S,
      r(0.5, 0.8) * S,
      0.1 * S,
      r(-0.08, 0.04),
      false,
    ],
  ];
  const kind = Math.floor(rand() * 4);
  if (kind === 0)
    out.push(
      [cu, cv - 0.04 * S, 0.1 * S, 0.82 * S, 0, false],
      [cu - 0.22 * S, cv - 0.22 * S, 0.11 * S, 0.42 * S, 0.75, true],
      [cu + 0.22 * S, cv - 0.22 * S, 0.11 * S, 0.42 * S, -0.75, true],
    );
  else if (kind === 1) {
    const bu = cu + r(-0.12, 0.12) * S,
      bv = cv - 0.02 * S,
      b = 0.34 * S;
    out.push(
      [bu - b / 2, bv, 0.09 * S, b, 0, false],
      [bu + b / 2, bv, 0.09 * S, b, 0, false],
      [bu, bv + b / 2, b, 0.09 * S, 0, false],
      [bu, bv - b / 2, b, 0.09 * S, 0, false],
      [cu, cv - 0.4 * S, 0.78 * S, 0.1 * S, 0.03, false],
    );
  } else if (kind === 2)
    out.push(
      [cu - 0.27 * S, cv + 0.18 * S, 0.12 * S, 0.17 * S, 0.55, true],
      [cu - 0.27 * S, cv - 0.12 * S, 0.09 * S, 0.5 * S, 0.12, false],
      [cu + 0.14 * S, cv - 0.02 * S, 0.09 * S, 0.82 * S, 0, false],
      [cu + 0.14 * S, cv - 0.06 * S, 0.5 * S, 0.09 * S, 0, false],
    );
  else
    out.push(
      [cu, cv, 0.66 * S, 0.09 * S, 0, false],
      [cu, cv - 0.32 * S, 0.86 * S, 0.1 * S, -0.03, false],
      [cu + r(-0.1, 0.1) * S, cv - 0.04 * S, 0.09 * S, 0.74 * S, 0, false],
      [cu + 0.3 * S, cv + 0.12 * S, 0.11 * S, 0.18 * S, -0.55, true],
    );
  return out;
}
/** Strokes on an upright surface facing +z. */
function inkUpright(k: Kit, color: string, strokes: Stroke[], z: number) {
  for (const [u, v, w, h, a, round] of strokes)
    if (round) k.ball(color, u, v, z, w / 2, h / 2, 0.0012, 0, 0, a, false);
    else k.box(color, u, v, z, w, h, 0.0024, 0, 0, a);
}
/** Strokes on a tabletop sheet; v runs away from the writer (+z). */
function inkFlat(k: Kit, color: string, strokes: Stroke[], y: number) {
  for (const [u, v, w, h, a, round] of strokes)
    if (round) k.ball(color, u, y, v, w / 2, 0.0009, h / 2, 0, a, 0, false);
    else k.box(color, u, y, v, w, 0.0016, h, 0, a, 0);
}
/** Round palace lantern hanging from `top`; returns its lowest point. */
function lantern(
  k: Kit,
  x: number,
  top: number,
  z: number,
  s = 1,
  tassel = true,
) {
  const r = 0.17 * s,
    ry = 0.78 * r,
    cy = top - 0.04 * s - ry;
  k.cyl(C.gold, x, top - 0.02 * s, z, 0.072 * s, 0.04 * s);
  k.cyl(C.goldDeep, x, top - 0.043 * s, z, 0.1 * s, 0.011 * s);
  k.ball(C.lantern, x, cy, z, r, ry, r);
  for (let i = 0; i < 4; i++)
    k.ring(C.rib, x, cy, z, r * 1.008, ry * 1.008, 0, (i * Math.PI) / 4);
  const bottom = cy - ry;
  k.cyl(C.goldDeep, x, bottom + 0.004 * s, z, 0.09 * s, 0.011 * s);
  k.cyl(C.gold, x, bottom - 0.015 * s, z, 0.062 * s, 0.032 * s);
  if (!tassel) return bottom - 0.031 * s;
  k.ball(C.gold, x, bottom - 0.047 * s, z, 0.018 * s);
  k.cyl(C.tassel, x, bottom - 0.145 * s, z, 0.032 * s, 0.17 * s, 0, 0, 0, 0.3);
  return bottom - 0.23 * s;
}
/** A lantern standing on its bottom cap at height `base`. */
const standingLantern = (
  k: Kit,
  x: number,
  base: number,
  z: number,
  s: number,
) => lantern(k, x, base + 0.3362 * s, z, s, false);
/** Paper-cut window flower: a scalloped disc with petal and star cut-outs. */
function windowFlower(r: number, petals = 8) {
  const s = new T.Shape();
  for (let i = 0; i <= 80; i++) {
    const a = (i / 80) * Math.PI * 2,
      rr = r * (0.96 + 0.04 * Math.cos(a * 16));
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2,
      h = new T.Path();
    h.absellipse(
      Math.cos(a) * r * 0.58,
      Math.sin(a) * r * 0.58,
      r * 0.095,
      r * 0.22,
      0,
      Math.PI * 2,
      true,
      a + Math.PI / 2,
    );
    s.holes.push(h);
    const b = a + Math.PI / petals,
      dot = new T.Path();
    dot.absarc(
      Math.cos(b) * r * 0.27,
      Math.sin(b) * r * 0.27,
      r * 0.05,
      0,
      Math.PI * 2,
      true,
    );
    s.holes.push(dot);
  }
  for (let i = 0; i < 16; i++) {
    const a = ((i + 0.5) / 16) * Math.PI * 2,
      h = new T.Path();
    h.absarc(
      Math.cos(a) * r * 0.87,
      Math.sin(a) * r * 0.87,
      r * 0.03,
      0,
      Math.PI * 2,
      true,
    );
    s.holes.push(h);
  }
  const star = new T.Path();
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2,
      rr = r * (i % 2 ? 0.05 : 0.15);
    if (i) star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.holes.push(star);
  return new T.ExtrudeGeometry(s, {
    depth: 0.003,
    bevelEnabled: false,
    curveSegments: 8,
  });
}
/** Diamond good-fortune paper-cut: a framed square on point with cut strokes. */
function fortuneDiamond(R: number) {
  const diamond = (r: number, cw = false) => {
    const p = cw ? new T.Path() : new T.Shape();
    const pts = cw
      ? [
          [0, r],
          [r, 0],
          [0, -r],
          [-r, 0],
        ]
      : [
          [0, r],
          [-r, 0],
          [0, -r],
          [r, 0],
        ];
    p.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) p.lineTo(x, y);
    p.closePath();
    return p;
  };
  const frame = diamond(R) as T.Shape;
  frame.holes.push(diamond(R * 0.86, true));
  const inner = diamond(R * 0.76) as T.Shape;
  const rect = (x: number, y: number, w: number, h: number) => {
    const p = new T.Path();
    p.moveTo(x - w / 2, y - h / 2);
    p.lineTo(x - w / 2, y + h / 2);
    p.lineTo(x + w / 2, y + h / 2);
    p.lineTo(x + w / 2, y - h / 2);
    p.closePath();
    return p;
  };
  inner.holes.push(
    rect(-0.17 * R, 0.08 * R, 0.07 * R, 0.5 * R),
    rect(-0.28 * R, 0.2 * R, 0.13 * R, 0.06 * R),
    rect(0.12 * R, 0.28 * R, 0.34 * R, 0.06 * R),
    rect(0.12 * R, 0.1 * R, 0.24 * R, 0.14 * R),
    rect(0.04 * R, -0.18 * R, 0.13 * R, 0.24 * R),
    rect(0.22 * R, -0.18 * R, 0.13 * R, 0.24 * R),
  );
  return new T.ExtrudeGeometry([frame, inner], {
    depth: 0.003,
    bevelEnabled: false,
  });
}
/**
 * Open folding fan in the hand's y–z plane: pivot at the origin, ribs toward
 * -y spreading ±65° toward ±z, radius 0.22 (the character rig's fan frame).
 */
function foldingFan(leaf: string) {
  const k = new Kit(),
    spread = (65 * Math.PI) / 180,
    a0 = -Math.PI / 2 - spread,
    a1 = -Math.PI / 2 + spread;
  const sector = (r1: number, r2: number, depth: number) => {
    const s = new T.Shape();
    s.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
    s.lineTo(Math.cos(a0) * r2, Math.sin(a0) * r2);
    s.absarc(0, 0, r2, a0, a1, false);
    s.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    s.absarc(0, 0, r1, a1, a0, true);
    return new T.ExtrudeGeometry(s, {
      depth,
      bevelEnabled: false,
      curveSegments: 16,
    });
  };
  // Drawn in x–y, then turned a quarter about y so the leaf spreads toward ±z.
  k.push(place(0, 0, 0, 0, Math.PI / 2, 0));
  k.add(sector(0.085, 0.21, 0.003), leaf, place(0, 0, -0.0015));
  k.add(sector(0.199, 0.221, 0.005), C.gold, place(0, 0, -0.0025));
  k.add(sector(0.085, 0.095, 0.005), C.gold, place(0, 0, -0.0025));
  for (let i = 0; i <= 12; i++) {
    const a = a0 + ((a1 - a0) * i) / 12,
      guard = i === 0 || i === 12,
      len = guard ? 0.22 : 0.093;
    k.box(
      C.woodDark,
      (Math.cos(a) * len) / 2,
      (Math.sin(a) * len) / 2,
      0,
      len,
      guard ? 0.011 : 0.005,
      0.006,
      0,
      0,
      a,
    );
  }
  // Plum blossoms in gold on both faces of the silk.
  for (const z of [-0.0022, 0.0022])
    for (const [r, a] of [
      [0.145, -1.85],
      [0.17, -1.55],
      [0.13, -1.3],
      [0.165, -1.1],
      [0.14, -2.1],
    ])
      k.ball(
        C.butter,
        Math.cos(a) * r,
        Math.sin(a) * r,
        z,
        0.011,
        0.011,
        0.0012,
      );
  k.cyl(C.gold, 0, 0, 0, 0.008, 0.012, Math.PI / 2);
  return k.geometry();
}
/** A two-sided silk ribbon strip following `points`. */
function ribbonStrip(points: T.Vector3[], width: number) {
  const pos: number[] = [],
    nor: number[] = [];
  const tan = new T.Vector3(),
    side = new T.Vector3(),
    hint = new T.Vector3(),
    n = points.length;
  const edges = points.map((p, i) => {
    tan
      .subVectors(points[Math.min(i + 1, n - 1)], points[Math.max(i - 1, 0)])
      .normalize();
    const twist = 0.45 * Math.sin((3 * Math.PI * i) / (n - 1));
    hint.set(Math.sin(twist), 0.2, Math.cos(twist)).normalize();
    side.crossVectors(tan, hint).normalize();
    const w = (width * Math.min(1, 0.35 + i / 6)) / 2;
    return {
      a: p.clone().addScaledVector(side, w),
      b: p.clone().addScaledVector(side, -w),
      n: new T.Vector3().crossVectors(side, tan).normalize(),
    };
  });
  const push = (p: T.Vector3, q: T.Vector3, s = 1) => {
    pos.push(p.x, p.y, p.z);
    nor.push(q.x * s, q.y * s, q.z * s);
  };
  for (let i = 0; i < n - 1; i++) {
    const e = edges[i],
      f = edges[i + 1];
    // Front faces wind counter-clockwise about n; the back pair is reversed.
    for (const [p, q] of [
      [e, 'a'],
      [f, 'a'],
      [e, 'b'],
      [e, 'b'],
      [f, 'a'],
      [f, 'b'],
    ] as const)
      push(p[q], p.n);
    for (const [p, q] of [
      [e, 'a'],
      [e, 'b'],
      [f, 'a'],
      [e, 'b'],
      [f, 'b'],
      [f, 'a'],
    ] as const)
      push(p[q], p.n, -1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  return g;
}
/**
 * Silk ribbon trailing from a wand tip at the origin, in the dancer's upright
 * body frame: it streams along `flow` in broad waves.
 */
function ribbonSilk(flow: V3, color: string) {
  const f = new T.Vector3(...flow).normalize(),
    up = new T.Vector3(0, 1, 0),
    lateral = new T.Vector3().crossVectors(up, f);
  const points: T.Vector3[] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    points.push(
      new T.Vector3()
        .addScaledVector(f, 1.15 * t)
        .addScaledVector(
          up,
          0.32 * Math.sin(3 * Math.PI * t) * (1 - 0.3 * t) - 0.38 * t,
        )
        .addScaledVector(lateral, 0.16 * Math.sin(2 * Math.PI * t)),
    );
  }
  const k = new Kit();
  k.add(ribbonStrip(points, 0.09), color);
  k.ball(C.gold, 0, 0, 0, 0.011);
  return k.geometry();
}
/** Hanging-scroll rollers and cord; returns nothing, draws in the kit frame. */
function scrollRollers(
  k: Kit,
  cx: number,
  top: number,
  w: number,
  bottom: number,
) {
  k.cyl(C.woodDark, cx, top + 0.01, 0.012, 0.011, w + 0.05, 0, 0, Math.PI / 2);
  k.rod(
    C.cord,
    [cx - w / 2 + 0.03, top + 0.018, 0.012],
    [cx, top + 0.15, 0.006],
    0.0028,
    4,
  );
  k.rod(
    C.cord,
    [cx + w / 2 - 0.03, top + 0.018, 0.012],
    [cx, top + 0.15, 0.006],
    0.0028,
    4,
  );
  k.cyl(
    C.woodDark,
    cx,
    bottom - 0.012,
    0.012,
    0.014,
    w + 0.06,
    0,
    0,
    Math.PI / 2,
  );
  for (const s of [-1, 1])
    k.cyl(
      C.goldDeep,
      cx + s * (w / 2 + 0.035),
      bottom - 0.012,
      0.012,
      0.019,
      0.022,
      0,
      0,
      Math.PI / 2,
    );
}
/** Red couplet scroll with ink characters and a gold rule. */
function coupletScroll(
  k: Kit,
  cx: number,
  top: number,
  w: number,
  h: number,
  count: number,
  rand: () => number,
) {
  scrollRollers(k, cx, top, w, top - h);
  k.box(C.red, cx, top - h / 2, 0.006, w, h, 0.003);
  const z = 0.0078;
  for (const s of [-1, 1]) {
    k.box(
      C.gold,
      cx + s * (w / 2 - 0.022),
      top - h / 2,
      z,
      0.005,
      h - 0.05,
      0.0012,
    );
    k.box(
      C.gold,
      cx,
      top - h / 2 + s * (h / 2 - 0.022),
      z,
      w - 0.039,
      0.005,
      0.0012,
    );
  }
  const cell = (h - 0.1) / count,
    S = Math.min(w * 0.58, cell * 0.8);
  for (let i = 0; i < count; i++)
    inkUpright(
      k,
      C.ink,
      glyph(rand, cx, top - 0.05 - cell * (i + 0.5), S),
      z + 0.0004,
    );
  for (let i = 0; i < 10; i++)
    k.box(
      C.butter,
      cx + (rand() - 0.5) * (w - 0.06),
      top - 0.04 - rand() * (h - 0.08),
      z,
      0.008,
      0.008,
      0.001,
      0,
      0,
      rand(),
    );
}
/** Ink-painting hanging scroll on a silk mount; `paint` draws in paper space. */
function paintingScroll(
  k: Kit,
  cx: number,
  top: number,
  w: number,
  h: number,
  paint: (
    k: Kit,
    cx: number,
    cy: number,
    pw: number,
    ph: number,
    z: number,
  ) => void,
) {
  scrollRollers(k, cx, top, w, top - h);
  k.box(C.silkEdge, cx, top - h / 2, 0.006, w, h, 0.003);
  k.box(C.silk, cx, top - h / 2 - 0.02, 0.0078, w - 0.05, h - 0.3, 0.001);
  const pw = w - 0.11,
    ph = h - 0.42,
    cy = top - h / 2 - 0.02;
  k.box(C.rice, cx, cy, 0.0088, pw, ph, 0.001);
  paint(k, cx, cy, pw, ph, 0.0096);
}
const flatShape = (pts: [number, number][]) => {
  const s = new T.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  return new T.ShapeGeometry(s);
};
function paintMountains(
  k: Kit,
  cx: number,
  cy: number,
  pw: number,
  ph: number,
  z: number,
) {
  const layer = (pts: [number, number][], color: string, dz: number) =>
    k.add(
      flatShape(pts.map(([x, y]) => [cx + x * pw, cy + y * ph])),
      color,
      place(0, 0, z + dz),
    );
  layer(
    [
      [-0.5, -0.08],
      [-0.38, 0.1],
      [-0.27, 0.04],
      [-0.1, 0.27],
      [0.06, 0.12],
      [0.22, 0.2],
      [0.36, 0.08],
      [0.5, 0.15],
      [0.5, -0.12],
      [-0.5, -0.12],
    ],
    '#c4c6bf',
    0,
  );
  layer(
    [
      [-0.5, -0.26],
      [-0.32, -0.02],
      [-0.18, -0.12],
      [0.02, 0.06],
      [0.2, -0.08],
      [0.33, -0.02],
      [0.5, -0.2],
      [0.5, -0.3],
      [-0.5, -0.3],
    ],
    '#858a83',
    0.0004,
  );
  layer(
    [
      [-0.5, -0.5],
      [-0.5, -0.34],
      [-0.36, -0.22],
      [-0.22, -0.36],
      [-0.05, -0.3],
      [0.12, -0.42],
      [0.3, -0.33],
      [0.5, -0.44],
      [0.5, -0.5],
    ],
    '#3f4441',
    0.0008,
  );
  // A pine on the near ridge and a boat on the water.
  k.box(
    C.ink,
    cx - 0.28 * pw,
    cy - 0.21 * ph,
    z + 0.0012,
    0.008,
    0.14 * ph,
    0.001,
    0,
    0,
    0.12,
  );
  for (let i = 0; i < 3; i++)
    k.ball(
      C.inkBamboo,
      cx - 0.28 * pw + (i - 1) * 0.008,
      cy - (0.14 + i * 0.045) * ph,
      z + 0.0014,
      0.05 - i * 0.008,
      0.011,
      0.001,
    );
  k.ball(
    C.ink,
    cx + 0.16 * pw,
    cy - 0.27 * ph,
    z + 0.0012,
    0.022,
    0.005,
    0.001,
  );
  k.box(C.red, cx + 0.38 * pw, cy + 0.42 * ph, z + 0.0012, 0.024, 0.024, 0.001);
  const rand = seeded(41);
  for (let i = 0; i < 3; i++)
    inkUpright(
      k,
      C.ink,
      glyph(rand, cx + 0.38 * pw, cy + (0.3 - i * 0.08) * ph, 0.03),
      z + 0.0012,
    );
}
function paintBamboo(
  k: Kit,
  cx: number,
  cy: number,
  pw: number,
  ph: number,
  z: number,
) {
  const stalk = (
    x: number,
    lean: number,
    top: number,
    width: number,
    color: string,
  ) => {
    let y = -0.48;
    while (y < top) {
      const len = Math.min(0.15, top - y);
      k.box(
        color,
        cx + (x + lean * (y + len / 2)) * pw,
        cy + (y + len / 2) * ph,
        z,
        width,
        len * ph - 0.012,
        0.001,
        0,
        0,
        -lean * 0.4,
      );
      y += len + 0.02;
    }
  };
  stalk(0.05, 0.1, 0.4, 0.022, C.inkBambooSoft);
  stalk(-0.12, -0.08, 0.3, 0.026, C.inkBamboo);
  stalk(0.2, 0.05, 0.05, 0.016, C.inkBamboo);
  const rand = seeded(7);
  for (let c = 0; c < 6; c++) {
    const lx = cx + (rand() - 0.5) * 0.7 * pw,
      ly = cy + (rand() * 0.75 - 0.25) * ph;
    for (let i = 0; i < 3; i++)
      k.ball(
        c % 2 ? C.inkBamboo : C.inkBambooSoft,
        lx + (i - 1) * 0.02,
        ly - Math.abs(i - 1) * 0.012,
        z + 0.0006,
        0.007,
        0.042,
        0.001,
        0,
        0,
        -0.5 + i * 0.5 + rand() * 0.3,
        false,
      );
  }
  k.box(C.red, cx - 0.36 * pw, cy - 0.38 * ph, z + 0.0008, 0.022, 0.022, 0.001);
  for (let i = 0; i < 3; i++)
    inkUpright(
      k,
      C.ink,
      glyph(rand, cx - 0.37 * pw, cy + (0.4 - i * 0.075) * ph, 0.028),
      z + 0.0008,
    );
}
// ---------------------------------------------------------------------------
// Tabletop sheets in a seat frame: origin on the table surface in front of
// the sitter, +z away from them, +x on their brush-hand side.
function inkStone(k: Kit, x: number, z: number) {
  k.rbox(C.stone, x, 0.009, z, 0.065, 0.018, 0.095);
  k.box('#141414', x, 0.0185, z + 0.022, 0.045, 0.002, 0.03);
  k.ball(C.celadon, x, 0.012, z - 0.075, 0.014, 0.012, 0.014);
}
const sheetBuilders: Record<string, (k: Kit, rand: () => number) => void> = {
  calligraphy(k, rand) {
    k.box(C.felt, 0, 0.0015, 0, 0.28, 0.003, 0.3);
    k.box(C.rice, 0, 0.0035, 0, 0.21, 0.0015, 0.27);
    for (let c = 0; c < 2; c++)
      for (let r = 0; r < 3; r++)
        inkFlat(
          k,
          C.ink,
          glyph(rand, (c - 0.5) * 0.095, (1 - r) * 0.082, 0.064),
          0.0048,
        );
    inkStone(k, 0.2, 0.02);
  },
  'ink-painting'(k, rand) {
    k.box(C.felt, 0, 0.0015, 0, 0.29, 0.003, 0.3);
    k.box(C.rice, 0, 0.0035, 0, 0.23, 0.0015, 0.27);
    for (const [x, lean, w, color] of [
      [-0.03, 0.1, 0.011, C.inkBamboo],
      [0.05, -0.15, 0.008, C.inkBambooSoft],
    ] as const)
      for (let i = 0; i < 4; i++)
        k.box(
          color,
          x + lean * (i - 1.5) * 0.06,
          0.0048,
          -0.1 + i * 0.062,
          w,
          0.0015,
          0.05,
          0,
          lean,
          0,
        );
    for (let c = 0; c < 4; c++) {
      const lx = (rand() - 0.5) * 0.14,
        lz = rand() * 0.16 - 0.02;
      for (let i = 0; i < 3; i++)
        k.ball(
          C.inkBamboo,
          lx + (i - 1) * 0.012,
          0.005,
          lz,
          0.004,
          0.0009,
          0.022,
          0,
          -0.6 + i * 0.6 + rand() * 0.3,
          0,
          false,
        );
    }
    k.box(C.red, 0.085, 0.005, -0.11, 0.014, 0.0015, 0.014);
    inkStone(k, 0.2, 0.03);
    k.cyl(C.porcelain, 0.205, 0.008, -0.12, 0.026, 0.016);
    k.cyl(C.wash, 0.205, 0.0165, -0.12, 0.021, 0.001);
  },
  couplets(k, rand) {
    k.box(C.red, 0.03, 0.0015, 0, 0.1, 0.003, 0.29);
    for (let i = 0; i < 5; i++)
      inkFlat(
        k,
        i % 2 ? C.ink : '#2b1d18',
        glyph(rand, 0.03, 0.11 - i * 0.055, 0.044),
        0.0034,
      );
    k.box(C.redDeep, -0.1, 0.0015, -0.02, 0.085, 0.003, 0.24, 0, 0.05);
    for (let i = 0; i < 4; i++)
      inkFlat(k, C.gold, glyph(rand, -0.1, 0.07 - i * 0.055, 0.04), 0.0034);
    k.rbox(C.woodDark, 0.03, 0.007, 0.13, 0.14, 0.012, 0.022);
    inkStone(k, 0.2, 0.0);
  },
  'paper-cutting'(k) {
    k.box(C.red, -0.07, 0.0012, 0.03, 0.12, 0.0016, 0.12, 0, 0.2);
    k.box(C.redDeep, -0.06, 0.0028, 0.02, 0.12, 0.0016, 0.12, 0, -0.15);
    const flower = windowFlower(0.065);
    k.add(flower, C.red, place(0.07, 0.0016, -0.03, -Math.PI / 2));
    flower.dispose();
    for (let i = 0; i < 4; i++)
      k.box(
        C.red,
        0.0 + i * 0.03,
        0.001,
        0.1 - (i % 2) * 0.02,
        0.018,
        0.0012,
        0.006,
        0,
        i * 0.9,
      );
    k.box('#e9dcc2', 0.17, 0.0015, 0.04, 0.07, 0.003, 0.1, 0, 0.1);
  },
  lanterns(k) {
    k.box(C.red, -0.07, 0.0012, 0.0, 0.14, 0.0016, 0.18, 0, 0.12);
    for (let i = 0; i < 6; i++)
      k.box(
        C.redDeep,
        -0.07 + (i - 2.5) * 0.02,
        0.0024,
        0.0,
        0.004,
        0.0012,
        0.16,
        0,
        0.12,
      );
    // In progress: a bamboo-ribbed frame, half covered in red paper.
    const r = 0.17 * 0.42,
      cy = 0.022 + 0.78 * r;
    k.cyl(C.gold, 0.08, 0.009, 0.04, 0.03, 0.018);
    k.add(
      new T.SphereGeometry(1, 12, 8, 0, Math.PI),
      C.lantern,
      place(0.08, cy, 0.04, 0, 0.6, 0, r, 0.78 * r, r),
    );
    for (let i = 0; i < 4; i++)
      k.ring(
        C.bamboo,
        0.08,
        cy,
        0.04,
        r * 1.01,
        0.78 * r * 1.01,
        0,
        (i * Math.PI) / 4,
      );
    k.ring(C.gold, 0.08, cy + 0.78 * r, 0.04, 0.026, 0.026, Math.PI / 2);
    k.cyl(C.gold, 0.16, 0.007, -0.07, 0.03, 0.014);
    k.cyl(C.porcelain, 0.19, 0.016, 0.07, 0.016, 0.032);
    k.cyl(C.goldDeep, 0.19, 0.033, 0.07, 0.013, 0.003);
  },
};
// ---------------------------------------------------------------------------
// Table games and pastimes. Centre sets are drawn in a table frame (origin on
// the top at its centre, +z toward the first player); place settings in a
// seat frame (origin on the top in front of the sitter, +z away from them).
const G = {
  board: '#dcb97c',
  boardDark: '#8b5b37',
  line: '#5e4128',
  ivory: '#f2e9d3',
  jade: '#3f7b5e',
  black: '#262524',
  white: '#f3f0e8',
  river: '#c6dde0',
  card: '#fbf8f1',
  cardBack: '#b8463a',
  wicker: '#b38b57',
  colors: ['#d9534a', '#efb23c', '#4c9a6a', '#4a7fc1', '#e889a8', '#8f6bb8'],
};
const pick = <T>(list: T[], rand: () => number) =>
  list[Math.floor(rand() * list.length) % list.length];
function teacup(k: Kit, x: number, z: number) {
  k.cyl(C.porcelain, x, 0.003, z, 0.034, 0.005, 0, 0, 0, 1, 14);
  k.cyl(C.porcelain, x, 0.021, z, 0.024, 0.032, 0, 0, 0, 1.35, 14);
  k.cyl(C.cobalt, x, 0.031, z, 0.0305, 0.006, 0, 0, 0, 1.03, 14);
  k.cyl(C.tea, x, 0.0365, z, 0.0285, 0.001, 0, 0, 0, 1, 14);
}
function xiangqiDisc(k: Kit, x: number, y: number, z: number, color: string) {
  k.cyl(G.ivory, x, y + 0.006, z, 0.0165, 0.012, 0, 0, 0, 1, 14);
  k.cyl(color, x, y + 0.0124, z, 0.0125, 0.0012, 0, 0, 0, 1, 14);
  k.cyl(G.ivory, x, y + 0.0129, z, 0.0082, 0.001, 0, 0, 0, 1, 12);
}
function xiangqi(k: Kit) {
  const W = 0.34,
    H = 0.38,
    cx = W / 8,
    cz = H / 9,
    y = 0.0195;
  k.rbox(G.boardDark, 0, 0.009, 0, W + 0.07, 0.018, H + 0.07);
  k.box(G.board, 0, 0.0185, 0, W + 0.05, 0.001, H + 0.05);
  k.box(G.river, 0, y - 0.0002, 0, W, 0.0008, cz * 0.92);
  for (let j = 0; j <= 9; j++)
    k.box(G.line, 0, y, -H / 2 + j * cz, W + 0.002, 0.0008, 0.0022);
  for (let i = 0; i <= 8; i++) {
    const x = -W / 2 + i * cx;
    if (i === 0 || i === 8) k.box(G.line, x, y, 0, 0.0022, 0.0008, H);
    else
      for (const s of [-1, 1])
        k.box(
          G.line,
          x,
          y,
          s * (H / 4 + cz / 4),
          0.0022,
          0.0008,
          H / 2 - cz / 2,
        );
  }
  const d = Math.hypot(2 * cx, 2 * cz),
    a = Math.atan2(2 * cz, 2 * cx);
  for (const s of [-1, 1])
    for (const r of [-a, a])
      k.box(G.line, 0, y, s * (H / 2 - cz), d, 0.0008, 0.0018, 0, r, 0);
  const at = (i: number, j: number, color: string) =>
    xiangqiDisc(k, -W / 2 + i * cx, y, -H / 2 + j * cz, color);
  // Red sits with the first player (+z), black across; a game well under way.
  for (const i of [0, 1, 2, 4, 6, 8]) at(i, 9, C.red);
  for (const [i, j] of [
    [1, 7],
    [6, 6],
    [0, 6],
    [4, 6],
    [8, 6],
    [2, 4],
  ])
    at(i, j, C.red);
  for (const i of [0, 2, 3, 4, 5, 8]) at(i, 0, G.black);
  for (const [i, j] of [
    [7, 2],
    [2, 3],
    [4, 3],
    [6, 3],
    [5, 5],
  ])
    at(i, j, G.black);
  xiangqiDisc(k, W / 2 + 0.07, 0, -0.04, G.black);
  xiangqiDisc(k, W / 2 + 0.075, 0, 0.0, G.black);
  xiangqiDisc(k, -W / 2 - 0.07, 0, 0.05, C.red);
}
function goBoard(k: Kit, rand: () => number) {
  const S = 0.4,
    n = 13,
    span = S - 0.04,
    step = span / (n - 1),
    y = 0.0505,
    o = (i: number) => -span / 2 + i * step;
  k.rbox('#dcb97c', 0, 0.025, 0, S, 0.05, S);
  for (let i = 0; i < n; i++) {
    k.box(G.line, o(i), y, 0, 0.0016, 0.0008, span);
    k.box(G.line, 0, y, o(i), span, 0.0008, 0.0016);
  }
  const taken = new Set<string>();
  let i = 6,
    j = 6;
  for (let m = 0; m < 46; m++) {
    i = Math.min(n - 1, Math.max(0, i + Math.round((rand() - 0.5) * 3)));
    j = Math.min(n - 1, Math.max(0, j + Math.round((rand() - 0.5) * 3)));
    if (taken.has(i + ',' + j)) continue;
    taken.add(i + ',' + j);
    k.ball(
      m % 2 ? G.white : G.black,
      o(i),
      y + 0.005,
      o(j),
      0.0125,
      0.0055,
      0.0125,
      0,
      0,
      0,
      false,
    );
  }
  for (const [x, z, c] of [
    [S / 2 + 0.07, 0.11, G.black],
    [-S / 2 - 0.07, -0.11, G.white],
  ] as const) {
    k.cyl('#7b4f31', x, 0.022, z, 0.048, 0.044, 0, 0, 0, 0.85, 16);
    k.ball(c, x, 0.044, z, 0.038, 0.012, 0.038);
  }
}
function chineseCheckers(k: Kit, rand: () => number) {
  const R = 0.2,
    s = R / (4 * Math.sqrt(3)),
    star = new T.Shape();
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 6,
      r = (i % 2 ? R / Math.sqrt(3) : R) * 1.08;
    if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new T.ExtrudeGeometry(star, { depth: 0.014, bevelEnabled: false });
  k.add(g, G.board, place(0, 0, 0, -Math.PI / 2));
  g.dispose();
  const tri = (a0: number) =>
    [0, 1, 2].map((i) => {
      const a = a0 + (i * 2 * Math.PI) / 3;
      return [Math.cos(a) * R, Math.sin(a) * R];
    });
  const inside = (p: number[], t: number[][]) => {
    const [a, b, c] = t,
      d = (u: number[], v: number[], w: number[]) =>
        (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]),
      d1 = d(p, a, b),
      d2 = d(p, b, c),
      d3 = d(p, c, a),
      e = 1e-6;
    return !((d1 < -e || d2 < -e || d3 < -e) && (d1 > e || d2 > e || d3 > e));
  };
  const up = tri(Math.PI / 2),
    down = tri(-Math.PI / 2),
    homes: [number, string][] = [
      [Math.PI / 2, C.red],
      [Math.PI / 2 + (2 * Math.PI) / 3, '#3f7fc0'],
      [Math.PI / 2 + (4 * Math.PI) / 3, '#4c9a6a'],
    ];
  for (let j = -8; j <= 8; j++)
    for (let i = -12; i <= 12; i++) {
      const x = (i + j / 2) * s,
        y = (j * s * Math.sqrt(3)) / 2;
      if (!inside([x, y], up) && !inside([x, y], down)) continue;
      k.cyl('#6d4a2c', x, 0.0144, -y, 0.0052, 0.0008, 0, 0, 0, 1, 8);
      const home = homes.find(
        ([a]) =>
          Math.hypot(x - Math.cos(a) * R, y - Math.sin(a) * R) < R * 0.52,
      );
      const stray = !home && rand() < 0.06;
      if (home || stray)
        k.ball(
          home ? home[1] : pick(homes, rand)[1],
          x,
          0.0235,
          -y,
          0.0092,
          0.0092,
          0.0092,
          0,
          0,
          0,
          false,
        );
    }
}
function mahjongTile(
  k: Kit,
  x: number,
  y: number,
  z: number,
  ry: number,
  faceUp: boolean,
  rand: () => number,
) {
  k.push(place(x, y, z, 0, ry, 0));
  k.box(faceUp ? G.jade : G.ivory, 0, 0.004, 0, 0.028, 0.008, 0.038);
  k.box(faceUp ? G.ivory : G.jade, 0, 0.0125, 0, 0.028, 0.009, 0.038);
  if (faceUp)
    k.box(
      pick([C.red, G.jade, '#2f5f9a', G.black], rand),
      0,
      0.0172,
      0,
      0.012,
      0.0008,
      0.02,
    );
  k.pop();
}
function mahjongCentre(k: Kit, rand: () => number) {
  for (let side = 0; side < 4; side++) {
    k.push(place(0, 0, 0, 0, (side * Math.PI) / 2, 0));
    for (let i = 0; i < 9; i++)
      for (const layer of [0, 1])
        mahjongTile(k, -0.124 + i * 0.031, layer * 0.017, 0.17, 0, false, rand);
    k.pop();
  }
  for (let i = 0; i < 12; i++)
    mahjongTile(
      k,
      (rand() - 0.5) * 0.17,
      0,
      (rand() - 0.5) * 0.17,
      rand() * Math.PI,
      true,
      rand,
    );
  for (const x of [-0.02, 0.012])
    k.rbox(C.porcelain, x, 0.007, 0.02, 0.014, 0.014, 0.014, x * 20);
}
function mahjongRack(k: Kit, rand: () => number) {
  for (let i = 0; i < 13; i++) {
    const x = -0.18 + i * 0.03;
    k.box(G.ivory, x, 0.02, 0.04, 0.027, 0.039, 0.011);
    k.box(G.jade, x, 0.02, 0.0505, 0.027, 0.039, 0.01);
    k.box(
      pick([C.red, G.jade, '#2f5f9a'], rand),
      x,
      0.022,
      0.0342,
      0.011,
      0.016,
      0.0008,
    );
  }
}
function cardsCentre(k: Kit, rand: () => number) {
  for (let i = 0; i < 9; i++) {
    k.push(
      place(
        (rand() - 0.5) * 0.12,
        0.0008 + i * 0.0005,
        (rand() - 0.5) * 0.12,
        0,
        rand() * Math.PI,
        0,
      ),
    );
    k.box(G.card, 0, 0, 0, 0.064, 0.0008, 0.09);
    k.box(
      rand() < 0.5 ? C.red : G.black,
      -0.02,
      0.0005,
      -0.033,
      0.008,
      0.0004,
      0.012,
    );
    k.box(
      rand() < 0.5 ? C.red : G.black,
      0.0,
      0.0005,
      0.0,
      0.016,
      0.0004,
      0.02,
    );
    k.pop();
  }
  for (let i = 0; i < 6; i++)
    k.box(
      G.cardBack,
      0.2,
      0.0006 + i * 0.0008,
      -0.1,
      0.064,
      0.0008,
      0.09,
      0,
      0.3,
      0,
    );
}
function domino(
  k: Kit,
  x: number,
  y: number,
  z: number,
  ry: number,
  rand: () => number,
  standing = false,
) {
  k.push(place(x, y, z, standing ? Math.PI / 2 : 0, ry, 0));
  k.box(G.ivory, 0, 0.004, 0, 0.024, 0.008, 0.048);
  k.box(G.black, 0, 0.0083, 0, 0.02, 0.0006, 0.0012);
  for (const s of [-1, 1]) {
    const n = 1 + Math.floor(rand() * 5);
    for (let p = 0; p < n; p++)
      k.cyl(
        p % 3 === 1 ? C.red : G.black,
        ((p % 2) - 0.5) * 0.01,
        0.0083,
        s * (0.012 + Math.floor(p / 2) * 0.006 - 0.003),
        0.0024,
        0.0006,
        0,
        0,
        0,
        1,
        6,
      );
  }
  k.pop();
}
function dominoLine(k: Kit, rand: () => number) {
  for (let i = 0; i < 7; i++)
    domino(k, -0.15 + i * 0.05, 0, 0, Math.PI / 2, rand);
  for (let i = 0; i < 3; i++) domino(k, 0.2, 0, 0.05 + i * 0.05, 0, rand);
  for (let i = 0; i < 2; i++) domino(k, -0.2, 0, -0.05 - i * 0.05, 0, rand);
}
function puzzle(k: Kit, rand: () => number) {
  k.rbox('#cdb38a', 0, 0.003, 0, 0.4, 0.006, 0.3);
  const nx = 10,
    nz = 7,
    w = 0.034;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if (rand() < 0.16) continue;
      const u = i / (nx - 1),
        v = j / (nz - 1),
        color =
          v > 0.72
            ? u > 0.7 && v > 0.8
              ? '#f2c46a'
              : '#a9cde6'
            : v > 0.42
              ? Math.abs(u - 0.5) < 0.12
                ? C.red
                : '#6fa37a'
              : v > 0.2
                ? '#4d8a66'
                : '#5b8fc6';
      k.box(
        color,
        (i - (nx - 1) / 2) * w,
        0.007,
        ((nz - 1) / 2 - j) * w,
        w - 0.002,
        0.002,
        w - 0.002,
      );
    }
  for (let i = 0; i < 9; i++)
    k.box(
      pick(['#a9cde6', '#6fa37a', '#5b8fc6', C.red], rand),
      (rand() - 0.5) * 0.5,
      0.001,
      0.19 + rand() * 0.06 * (rand() < 0.5 ? -1 : 1) - 0.03,
      w - 0.002,
      0.002,
      w - 0.002,
      0,
      rand() * 3,
      0,
    );
  k.rbox('#efe6d3', -0.27, 0.01, -0.08, 0.13, 0.02, 0.1, 0.3);
  k.box('#a9cde6', -0.27, 0.0205, -0.08, 0.11, 0.001, 0.05, 0, 0.3, 0);
}
function crane(k: Kit, x: number, z: number, ry: number, color: string, s = 1) {
  k.push(place(x, 0, z, 0, ry, 0, s, s, s));
  k.box(color, 0, 0.012, 0, 0.017, 0.018, 0.017, 0, Math.PI / 4, 0);
  for (const side of [-1, 1])
    k.box(
      color,
      side * 0.024,
      0.021,
      0,
      0.042,
      0.002,
      0.024,
      0,
      0,
      side * 0.35,
    );
  k.box(color, 0, 0.026, 0.021, 0.004, 0.004, 0.036, -0.9, 0, 0);
  k.box(color, 0, 0.044, 0.035, 0.004, 0.004, 0.012, 0.4, 0, 0);
  k.box(color, 0, 0.026, -0.021, 0.004, 0.004, 0.034, 0.9, 0, 0);
  k.pop();
}
function origamiCentre(k: Kit, rand: () => number) {
  G.colors.forEach((c, i) =>
    k.box(
      c,
      -0.05,
      0.0008 + i * 0.0007,
      0.02,
      0.1,
      0.0007,
      0.1,
      0,
      i * 0.18,
      0,
    ),
  );
  crane(k, 0.09, -0.04, 0.6, C.red, 1.2);
  crane(k, 0.1, 0.08, -0.8, '#4a7fc1', 1.1);
  crane(k, -0.1, -0.11, 2.2, pick(G.colors, rand), 1);
}
function watercolorPlace(k: Kit, rand: () => number) {
  k.rbox('#e9e3d6', 0, 0.004, 0.02, 0.26, 0.008, 0.2);
  k.box('#fbf8f0', 0, 0.0085, 0.02, 0.23, 0.001, 0.17);
  k.box('#bcd6e8', 0, 0.0092, 0.075, 0.21, 0.0006, 0.05);
  k.ball('#9cc39a', -0.04, 0.0093, 0.0, 0.08, 0.0006, 0.035);
  k.ball('#7fae86', 0.05, 0.0095, -0.02, 0.07, 0.0006, 0.03);
  k.cyl('#f2c46a', 0.07, 0.0097, 0.08, 0.012, 0.0006);
  for (let i = 0; i < 6; i++)
    k.ball(
      '#e79ab0',
      -0.08 + rand() * 0.06,
      0.0099,
      0.03 + rand() * 0.04,
      0.007,
      0.0006,
      0.007,
      0,
      0,
      0,
      false,
    );
  k.rbox('#f6f4ef', 0.19, 0.005, -0.04, 0.07, 0.01, 0.11);
  G.colors.forEach((c, i) =>
    k.cyl(
      c,
      0.175 + (i % 2) * 0.03,
      0.0102,
      -0.075 + Math.floor(i / 2) * 0.035,
      0.009,
      0.0008,
      0,
      0,
      0,
      1,
      10,
    ),
  );
  k.cyl('#dfe9ec', 0.19, 0.03, 0.08, 0.026, 0.06, 0, 0, 0, 1.1);
  k.cyl('#9fc0d4', 0.19, 0.0595, 0.08, 0.0265, 0.002);
}
function brushJar(k: Kit) {
  k.cyl(C.celadon, 0, 0.05, 0, 0.035, 0.1, 0, 0, 0, 0.9);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    k.rod(
      '#9c7048',
      [Math.cos(a) * 0.012, 0.06, Math.sin(a) * 0.012],
      [Math.cos(a) * 0.035, 0.2, Math.sin(a) * 0.035],
      0.004,
      6,
    );
  }
}
function coloringPlace(k: Kit, rand: () => number) {
  for (const s of [-1, 1]) {
    k.box(
      '#fbf9f3',
      s * 0.058,
      0.004,
      0.03,
      0.112,
      0.004,
      0.16,
      0,
      0,
      -s * 0.04,
    );
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.ball(
        s > 0 ? pick(G.colors, rand) : '#e9e4d8',
        s * 0.058 + Math.cos(a) * 0.022,
        0.0068,
        0.04 + Math.sin(a) * 0.022,
        0.014,
        0.0008,
        0.009,
        0,
        -a,
        0,
        false,
      );
    }
    k.cyl(s > 0 ? '#efb23c' : '#d8d2c4', s * 0.058, 0.0072, 0.04, 0.01, 0.0008);
  }
  k.box('#7c6450', 0, 0.005, 0.03, 0.006, 0.006, 0.16);
  for (let i = 0; i < 3; i++)
    k.rod(
      G.colors[(i * 2) % 6],
      [0.15, 0.004, -0.04 + i * 0.02],
      [0.15 + 0.03, 0.004, 0.08 + i * 0.02],
      0.0035,
      6,
    );
}
function pencilCup(k: Kit) {
  k.cyl('#c9b28a', 0, 0.04, 0, 0.03, 0.08, 0, 0, 0, 1, 14);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.rod(
      G.colors[i % 6],
      [Math.cos(a) * 0.01, 0.05, Math.sin(a) * 0.01],
      [Math.cos(a) * 0.03, 0.16, Math.sin(a) * 0.03],
      0.0035,
      6,
      0.5,
    );
  }
}
function yarn(
  k: Kit,
  x: number,
  y: number,
  z: number,
  r: number,
  color: string,
) {
  k.ball(color, x, y, z, r);
  k.ring(shade(color, 0.82), x, y, z, r * 1.01, r * 1.01, 0.5, 0.3, 0);
  k.ring(shade(color, 0.82), x, y, z, r * 1.01, r * 1.01, -0.6, 1.2, 0);
}
function knittingCentre(k: Kit) {
  k.cyl(G.wicker, 0, 0.035, 0, 0.1, 0.07, 0, 0, 0, 1.12, 16);
  k.ring('#8f6a3e', 0, 0.07, 0, 0.11, 0.11, Math.PI / 2);
  yarn(k, -0.035, 0.08, 0.02, 0.04, '#c94f4f');
  yarn(k, 0.04, 0.08, -0.01, 0.038, '#e2b04a');
  yarn(k, 0.0, 0.085, -0.05, 0.036, '#5a86b8');
}
function knittingPlace(k: Kit, rand: () => number) {
  const c = pick(['#c94f4f', '#5a86b8', '#7aa66b', '#b77bb0'], rand);
  k.rbox(c, 0, 0.005, 0.03, 0.13, 0.01, 0.1);
  for (let i = 0; i < 3; i++)
    k.box(shade(c, 0.8), 0, 0.0105, i * 0.03, 0.13, 0.001, 0.008);
  yarn(k, 0.15, 0.04, 0.0, 0.04, c);
}
function flowersCentre(k: Kit, rand: () => number) {
  k.cyl(C.celadon, 0, 0.08, 0, 0.055, 0.16, 0, 0, 0, 0.65, 16);
  k.cyl(C.celadon, 0, 0.165, 0, 0.026, 0.012, 0, 0, 0, 1.2, 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand() * 0.4,
      r = 0.06 + rand() * 0.07,
      h = 0.3 + rand() * 0.12,
      tip: V3 = [Math.cos(a) * r, h, Math.sin(a) * r];
    k.rod('#5f8a4a', [0, 0.16, 0], tip, 0.0035, 5);
    if (i % 2) k.ball('#e6b83a', tip[0], tip[1], tip[2], 0.03, 0.016, 0.03);
    else k.ball('#e48aa2', tip[0], tip[1], tip[2], 0.032, 0.026, 0.032);
    k.ball(
      '#6f9a55',
      tip[0] * 0.7,
      h * 0.75 + 0.05,
      tip[2] * 0.7,
      0.025,
      0.006,
      0.012,
      0,
      a,
      0.3,
      false,
    );
  }
}
function flowersPlace(k: Kit, rand: () => number) {
  for (let i = 0; i < 3; i++) {
    const z = -0.03 + i * 0.035;
    k.rod('#5f8a4a', [-0.1, 0.005, z], [0.09, 0.005, z + 0.02], 0.003, 5);
    k.ball(
      i % 2 ? '#e6b83a' : '#e48aa2',
      0.1,
      0.014,
      z + 0.02,
      0.022,
      0.012,
      0.022,
    );
  }
  k.ball(
    '#6f9a55',
    -0.02,
    0.004,
    0.08,
    0.03,
    0.003,
    0.012,
    0,
    rand(),
    0,
    false,
  );
}
function album(k: Kit, rand: () => number, open = true) {
  const cover = pick(['#7a2f2f', '#2f4a6b', '#4d5f3a'], rand);
  if (!open) {
    k.rbox(cover, 0, 0.01, 0, 0.22, 0.02, 0.16);
    k.box(C.gold, 0, 0.0205, -0.04, 0.08, 0.001, 0.02);
    return;
  }
  for (const s of [-1, 1]) {
    k.box(cover, s * 0.105, 0.003, 0, 0.21, 0.006, 0.16, 0, 0, -s * 0.03);
    k.box('#2b2a28', s * 0.103, 0.0068, 0, 0.19, 0.002, 0.145, 0, 0, -s * 0.03);
    for (let i = 0; i < 4; i++)
      k.box(
        pick(['#e8dfcc', '#d9c7a4', '#c7d6dd', '#e3cfc4'], rand),
        s * (0.055 + (i % 2) * 0.09),
        0.0085,
        -0.035 + Math.floor(i / 2) * 0.07,
        0.07,
        0.0012,
        0.055,
        0,
        rand() * 0.1 - 0.05,
        -s * 0.03,
      );
  }
}
function newspaperStack(k: Kit, rand: () => number) {
  for (let i = 0; i < 3; i++) {
    k.push(place(0, 0.003 + i * 0.006, 0, 0, (rand() - 0.5) * 0.4));
    k.box(C.newsprint, 0, 0, 0, 0.22, 0.005, 0.3);
    k.box(i === 2 ? C.red : '#3c3e3d', 0.05, 0.003, -0.11, 0.09, 0.0012, 0.04);
    for (let j = 0; j < 5; j++)
      k.box(C.print, -0.02, 0.003, -0.06 + j * 0.035, 0.16, 0.0012, 0.008);
    k.pop();
  }
}
function snacksCentre(k: Kit) {
  k.cyl(C.porcelain, -0.07, 0.004, 0, 0.09, 0.008, 0, 0, 0, 1, 20);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.3,
      x = -0.07 + Math.cos(a) * 0.045,
      z = Math.sin(a) * 0.045;
    k.cyl('#c98b3f', x, 0.017, z, 0.024, 0.018, 0, 0, 0, 1, 16);
    k.ring('#a8682c', x, 0.026, z, 0.016, 0.016, Math.PI / 2);
  }
  k.cyl(C.porcelain, 0.09, 0.004, 0.04, 0.075, 0.008, 0, 0, 0, 1, 20);
  for (const [x, z] of [
    [0.07, 0.03],
    [0.11, 0.05],
    [0.09, 0.0],
    [0.1, 0.075],
  ])
    k.ball('#e98a2a', x, 0.032, z, 0.024);
  k.ball(C.porcelain, 0.03, 0.05, -0.12, 0.055, 0.045, 0.055);
  k.ring(C.cobalt, 0.03, 0.05, -0.12, 0.056, 0.056, Math.PI / 2);
  k.ball(C.porcelain, 0.03, 0.098, -0.12, 0.012);
}
function snacksPlace(k: Kit) {
  k.cyl(C.porcelain, -0.06, 0.003, 0.0, 0.05, 0.006, 0, 0, 0, 1, 16);
  k.cyl('#c98b3f', -0.06, 0.014, 0.0, 0.022, 0.016, 0, 0, 0, 1, 16);
}
/** Light/dark variant of a hex colour (factor < 1 darkens). */
function shade(color: string, f: number) {
  return '#' + new T.Color(color).multiplyScalar(f).getHexString();
}
type Setter = (k: Kit, rand: () => number) => void;
/** Centre set and place settings (players / others) for each pastime. */
type TableSet = { centre: Setter; player?: Setter; other?: Setter | 'cup' };
const tableSets: Record<string, TableSet> = {
  xiangqi: { centre: xiangqi, other: 'cup' },
  go: { centre: goBoard, other: 'cup' },
  checkers: { centre: chineseCheckers, other: 'cup' },
  mahjong: { centre: mahjongCentre, player: mahjongRack, other: 'cup' },
  cards: { centre: cardsCentre, other: 'cup' },
  dominoes: {
    centre: dominoLine,
    player: (k, rand) => {
      for (let i = 0; i < 4; i++)
        domino(k, -0.06 + i * 0.03, 0.024, 0.02, 0, rand, true);
    },
    other: 'cup',
  },
  puzzle: { centre: puzzle, other: 'cup' },
  origami: {
    centre: origamiCentre,
    player: (k, rand) => crane(k, 0.1, 0.0, rand() * 6, pick(G.colors, rand)),
    other: 'cup',
  },
  watercolor: {
    centre: brushJar,
    player: watercolorPlace,
    other: watercolorPlace,
  },
  coloring: { centre: pencilCup, player: coloringPlace, other: 'cup' },
  knitting: { centre: knittingCentre, other: knittingPlace },
  flowers: { centre: flowersCentre, player: flowersPlace, other: 'cup' },
  albums: {
    centre: (k, rand) => {
      album(k, rand, false);
      k.push(place(0.02, 0.02, 0.01, 0, 0.3, 0));
      album(k, rand, false);
      k.pop();
    },
    other: album,
  },
  newspapers: { centre: newspaperStack },
  snacks: { centre: snacksCentre, player: snacksPlace, other: 'cup' },
};
// ---------------------------------------------------------------------------
/** Décor ids of a session (sessions without décor type as `never[]`). */
const decorOf = (s: DaySession): string[] => s.decor;
/** A schedule (zone sessions or table entries) and the entry running now. */
type Slot = { id: string; start: number; end: number };
type Track<S extends Slot = Slot> = { sessions: S[]; current: S | null };
type ZoneState = Track<DaySession> & { zone: DayZone; position: T.Vector3 };
type PropEntry = DayProp & { zone: Track; world: boolean };
type Aligned = {
  root: T.Object3D;
  actor: Person;
  joint: T.Object3D;
  /** Anchor in the joint frame. */
  anchor: T.Vector3;
  sway?: number;
};
/** Movable activity equipment. The original furniture/source plan remains a separate reference. */
export function buildDayRoom(actors: Person[], model?: Facility) {
  const root = new T.Group();
  root.name = 'day-room-flexible-program';
  const materials = new Map<string, T.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!materials.has(color))
      materials.set(
        color,
        new T.MeshStandardMaterial({ color, roughness: 0.85 }),
      );
    return materials.get(color)!;
  };
  const box = (
    parent: T.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const mesh = new T.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.035, w / 4, h / 4, d / 4)),
      mat(color),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // A mobile screen comes out on the north edge of the open floor only for
  // layouts that face it (talks, device class); other layouts clear it away.
  const screen = new T.Group();
  screen.name = 'day-program-display';
  screen.position.set(program.floor.board[0], 0, program.floor.board[1]);
  screen.visible = false;
  root.add(screen);
  box(screen, '#3b403f', 0, 1.44, 0, 1.95, 1.12, 0.09);
  box(screen, '#eef0ea', 0, 1.44, 0.054, 1.8, 0.97, 0.025);
  for (const x of [-0.63, 0.63]) {
    box(screen, '#8f928d', x, 0.63, 0, 0.045, 1.26, 0.05);
    box(screen, '#8f928d', x, 0.08, 0, 0.32, 0.06, 0.42);
  }
  const screenPanels = floorPrograms.map((p, i) => {
    const group = new T.Group();
    group.name = 'display-' + p.id;
    screen.add(group);
    // Muted program accents, one per session.
    const colors = [
      '#c99d7e',
      '#80a6a1',
      '#8fa6b1',
      '#9aae91',
      '#c09189',
      '#88a9a4',
      '#7a7471',
      '#d0b489',
      '#a98e82',
      '#9ba588',
    ];
    for (let j = 0; j < 3; j++)
      box(
        group,
        colors[i],
        -0.52 + j * 0.52,
        1.54,
        0.085,
        0.35,
        0.38 + (j % 2) * 0.13,
        0.018,
      );
    box(group, '#b6c7be', 0, 1.12, 0.085, 1.35, 0.06, 0.018);
    return group;
  });
  // Zones run their own sessions side by side; the open floor comes first.
  const zones: ZoneState[] = program.zones.map((zone) => ({
    zone,
    sessions: program.programs.filter((s) => s.zone === zone.id),
    current: null,
    position: new T.Vector3(zone.anchor[0], zone.labelHeight, zone.anchor[1]),
  }));
  const zoneOf = (id: string) => zones.find((z) => z.zone.id === id)!;
  const floor = zoneOf('floor');
  const chairs: { actor: Person; root: T.Group }[] = [];
  const props: PropEntry[] = [];
  // -------------------------------------------------------------------------
  // Cultural program: session-bound tools, tabletop work and décor. Every
  // piece is a single merged, vertex-colored clay mesh built once here.
  const clay = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
  });
  const piece = (
    name: string,
    geometry: T.BufferGeometry,
    parent: T.Object3D,
    shadow = false,
  ) => {
    const mesh = new T.Mesh(geometry, clay);
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const byId = new Map(actors.map((a) => [a.spec.id, a]));
  const aligned: Aligned[] = [];
  const bind = (
    actor: Person,
    name: string,
    geometry: T.BufferGeometry,
    parent: T.Object3D,
    actions: string[],
    zone: Track,
    sessions?: string[],
    world = false,
  ) => {
    const mesh = piece(actor.spec.id + '-' + name, geometry, parent);
    props.push({ actor, root: mesh, actions, sessions, zone, world });
    return mesh;
  };
  /** Anchored at `anchor` in `joint`, but oriented in the actor's upright body frame. */
  const upright = (
    mesh: T.Mesh,
    actor: Person,
    joint: T.Object3D,
    anchor: V3,
    sway?: number,
  ) =>
    aligned.push({
      root: mesh,
      actor,
      joint,
      anchor: new T.Vector3(...anchor),
      sway,
    });
  /**
   * Book or paper held up to read: mounted on the torso (centre 0, 0.27,
   * 0.33), a +z-facing plane turned toward the reader (the rig's read frame).
   */
  const holdToRead = (mesh: T.Mesh, scale = 1) => {
    mesh.position.set(0, 0.27, 0.33);
    mesh.rotation.set(1.0, Math.PI, 0);
    mesh.scale.setScalar(scale);
    return mesh;
  };
  const instructorActor = (session: DaySession) =>
    session.instructorId ? byId.get(session.instructorId) : undefined;
  const sessionIds = (zone: ZoneState, test: (s: DaySession) => boolean) =>
    zone.sessions.filter(test).map((s) => s.id);

  // Floor class: each member's activity chair follows them to every layout;
  // the class carries the session tools (tablet, shakers, drum, microphone).
  const chairGeo = (() => {
    const k = new Kit();
    // Stackable activity chairs: oatmeal seat on light oak legs.
    k.rbox('#dcd3c3', 0, 0.455, 0, 0.49, 0.05, 0.49);
    k.rbox('#dcd3c3', 0, 0.68, -0.23, 0.49, 0.42, 0.055);
    for (const x of [-0.19, 0.19])
      for (const z of [-0.18, 0.18])
        k.rbox('#b8996f', x, 0.22, z, 0.035, 0.44, 0.035);
    return k.geometry();
  })();
  const tabletGeo = (() => {
    const k = new Kit();
    k.rbox('#34393b', 0.14, -0.03, 0.08, 0.3, 0.22, 0.025);
    k.box('#bcd0cc', 0.14, -0.027, 0.096, 0.26, 0.18, 0.008);
    for (let i = 0; i < 4; i++)
      k.box(
        '#f4e6c7',
        0.075 + (i % 2) * 0.105,
        -0.073 + Math.floor(i / 2) * 0.09,
        0.103,
        0.062,
        0.048,
        0.005,
      );
    return k.geometry();
  })();
  const shakerGeo = (() => {
    const k = new Kit();
    k.cyl('#b7804d', 0, -0.025, 0.03, 0.019, 0.15);
    k.ball('#c79451', 0, 0.085, 0.03, 0.073);
    return k.geometry();
  })();
  const micGeo = (() => {
    const k = new Kit();
    k.cyl('#3b403f', 0, -0.015, 0.045, 0.022, 0.18);
    k.ball('#a4aba7', 0, -0.125, 0.045, 0.041);
    return k.geometry();
  })();
  const drumGeo = (y: number) => {
    const k = new Kit();
    k.cyl('#b57750', 0, y, 0.35, 0.16, 0.1, 0, 0, 0, 1, 20);
    k.cyl('#efe0ba', 0, y + 0.055, 0.35, 0.161, 0.018, 0, 0, 0, 1, 20);
    return k.geometry();
  };
  const drums = { lead: drumGeo(0.98), lap: drumGeo(0.77) };
  for (const station of program.stations) {
    const actor = byId.get(station.actorId);
    if (!actor) continue;
    const mode = station.mode;
    if (!['wheelchair', 'support'].includes(mode)) {
      const chair = new T.Group();
      chair.name = actor.spec.id + '-activity-chair';
      chair.visible = false;
      piece(chair.name + '-frame', chairGeo, chair, true);
      root.add(chair);
      chairs.push({ actor, root: chair });
    }
    if (mode === 'support') continue;
    bind(actor, 'tablet', tabletGeo, actor.joints.handL, ['device'], floor);
    bind(actor, 'shaker', shakerGeo, actor.joints.handR, ['music'], floor);
    bind(
      actor,
      'hand-drum',
      mode === 'leader' ? drums.lead : drums.lap,
      actor.root,
      ['music'],
      floor,
    );
    if (mode === 'leader')
      bind(actor, 'microphone', micGeo, actor.joints.handR, ['perform'], floor);
  }

  // Open floor: fans, ribbon wands, the erhu and a riddle card. Hand props
  // use the rig's hand frame: wrist at the origin, fingers -y, thumb +z,
  // palm toward -s·x (s = +1 right, -1 left).
  const handCentre = (s: number): V3 => [s * 0.0072, -0.0716, 0];
  const fanRed = foldingFan(C.red),
    fanRose = foldingFan('#b8344a');
  const wandGeo = (() => {
    const k = new Kit(),
      [x, y] = handCentre(1);
    k.rod(C.bamboo, [x, y, -0.03], [x, y, 0.5], 0.0065, 6, 0.7);
    return k.geometry();
  })();
  const silks = new Map<string, T.BufferGeometry>();
  const silk = (flow: V3, color: string) => {
    const key = flow.join() + color;
    if (!silks.has(key)) silks.set(key, ribbonSilk(flow, color));
    return silks.get(key)!;
  };
  const fanSessions = sessionIds(floor, (s) => s.action === 'fan-dance'),
    ribbonSessions = sessionIds(floor, (s) => s.id === 'ribbon');
  const dancers = [
    ...program.stations
      .filter((s) => s.mode !== 'support')
      .map((s) => byId.get(s.actorId)),
    ...floor.sessions
      .filter((s) => ['fan-dance', 'dance'].includes(s.instructorAction || ''))
      .map(instructorActor),
  ].filter((a, i, list): a is Person => !!a && list.indexOf(a) === i);
  const ribbonColors = [C.red, C.gold, '#d0607a', '#c94f36'];
  dancers.forEach((actor, i) => {
    const guest = actor.spec.role === 'instructor';
    if (fanSessions.length)
      for (const [s, hand] of [
        [1, actor.joints.handR],
        [-1, actor.joints.handL],
      ] as const) {
        const fan = bind(
          actor,
          s > 0 ? 'folding-fan' : 'folding-fan-left',
          (i + s) % 2 ? fanRose : fanRed,
          hand,
          ['fan-dance'],
          floor,
          fanSessions,
        );
        fan.position.set(s * 0.0072, -0.042, 0);
      }
    if (ribbonSessions.length) {
      // Silk streams to the dancer's right; the co-hosting lead's runs
      // forward, clear of the guest teacher beside him.
      const flow: V3 =
        actor.spec.programMode === 'leader' ? [0.45, 0, 0.9] : [1, 0, 0];
      bind(
        actor,
        'ribbon-wand',
        wandGeo,
        actor.joints.handR,
        ['dance'],
        floor,
        ribbonSessions,
      );
      const ribbon = bind(
        actor,
        'ribbon-silk',
        silk(flow, guest ? C.red : ribbonColors[i % 4]),
        actor.joints.handR,
        ['dance'],
        floor,
        ribbonSessions,
      );
      upright(
        ribbon,
        actor,
        actor.joints.handR,
        [0.0072, -0.0716, 0.5],
        i * 1.3,
      );
    }
  });
  const erhuPlayer = floor.sessions
    .filter((s) => s.instructorAction === 'erhu')
    .map(instructorActor)
    .find((a): a is Person => !!a);
  // Low round stool for seated guests away from a chair (erhu player, tea host:
  // the banquette under the host is cut away in the default view).
  const stool = new Kit();
  stool.cyl(C.wood, 0, 0.44, -0.02, 0.165, 0.045, 0, 0, 0, 1, 18);
  stool.cyl(C.woodDark, 0, 0.415, -0.02, 0.15, 0.012, 0, 0, 0, 1, 18);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    stool.rod(
      C.wood,
      [Math.cos(a) * 0.1, 0.42, -0.02 + Math.sin(a) * 0.1],
      [Math.cos(a) * 0.15, 0, -0.02 + Math.sin(a) * 0.15],
      0.016,
      6,
    );
  }
  const stoolGeo = stool.geometry();
  if (erhuPlayer) {
    bind(erhuPlayer, 'erhu-stool', stoolGeo, erhuPlayer.root, ['erhu'], floor);
    // Erhu in the hip frame: hexagonal sound box on the left thigh, neck
    // standing to about shoulder height, strings stopped by the left hand.
    const k = new Kit(),
      b = ERHU.body,
      nx = b.x - 0.004,
      nz = b.z - 0.012;
    k.cyl(C.woodDark, b.x, b.y, b.z, 0.046, 0.13, Math.PI / 2, 0, 0, 1, 6);
    k.cyl(
      '#d9d2bd',
      b.x,
      b.y,
      b.z + 0.066,
      0.04,
      0.004,
      Math.PI / 2,
      0,
      0,
      1,
      6,
    );
    k.rod(C.woodDark, [nx, b.y - 0.07, nz], [nx, 0.86, nz], 0.0085, 8);
    k.rod(
      '#efe6cf',
      [nx, 0.8, nz + 0.012],
      [nx, b.y + 0.02, b.z + 0.068],
      0.0016,
      4,
    );
    for (const y of [0.74, 0.8])
      k.rod(C.woodDark, [nx, y, nz], [nx - 0.03, y, nz - 0.06], 0.0065, 6);
    k.ball(C.woodDark, nx, 0.875, nz - 0.012, 0.013, 0.02, 0.022, -0.5);
    k.ring(
      C.gold,
      nx,
      ERHU.stopHand.y + 0.12,
      nz + 0.012,
      0.012,
      0.012,
      Math.PI / 2,
    );
    bind(
      erhuPlayer,
      'erhu',
      k.geometry(),
      erhuPlayer.joints.hip,
      ['erhu'],
      floor,
    );
    // Bow: frog at the right hand centre, stick toward the instrument.
    const bow = new Kit(),
      c = new T.Vector3(...handCentre(1)),
      d = new T.Vector3(-0.98, -0.19, 0).normalize(),
      hair = new T.Vector3(0.06, -0.32, -0.94)
        .normalize()
        .multiplyScalar(0.016),
      at = (t: number, h = 0) =>
        c
          .clone()
          .addScaledVector(d, t)
          .addScaledVector(hair, h)
          .toArray() as V3;
    bow.rod(C.bamboo, at(-0.03), at(0.75), 0.0045, 6, 0.6);
    bow.rod('#efe6cf', at(0.02, 1), at(0.72, 1), 0.003, 4);
    bow.rod(C.woodDark, at(-0.01), at(0.03, 0.8), 0.009, 6);
    bind(
      erhuPlayer,
      'erhu-bow',
      bow.geometry(),
      erhuPlayer.joints.handR,
      ['erhu'],
      floor,
    );
  }
  const lead = byId.get(
    program.stations.find((s) => s.mode === 'leader')?.actorId || '',
  );
  const riddleSessions = sessionIds(floor, (s) =>
    decorOf(s).includes('riddle-lanterns'),
  );
  if (lead && riddleSessions.length) {
    // A riddle slip held up in the left hand, on the palm side.
    const card = new Kit(),
      rand = seeded(5);
    card.push(place(0.02, -0.12, 0, 0, Math.PI / 2, 0));
    card.box(C.red, 0, 0, 0, 0.085, 0.13, 0.003);
    card.box(C.cream, 0, -0.004, 0, 0.062, 0.1, 0.0036);
    for (const z of [-0.0016, 0.0016])
      for (const v of [0.022, -0.026])
        inkUpright(card, C.ink, glyph(rand, 0, v, 0.036), z);
    card.pop();
    bind(
      lead,
      'riddle-card',
      card.geometry(),
      lead.joints.handL,
      ['present'],
      floor,
      riddleSessions,
    );
  }

  // Long arts table: work in front of every seat, tools in hand.
  const arts = zoneOf('arts-table');
  const brushGeo = (() => {
    // Shaft through the hand centre toward the tip (the rig's brush frame).
    const k = new Kit(),
      c = new T.Vector3(...handCentre(1)),
      d = new T.Vector3(0.1, 0.39, -0.91).normalize(),
      at = (t: number) => c.clone().addScaledVector(d, t).toArray() as V3;
    k.rod('#9c7048', at(-0.075), at(0.105), 0.0062, 8);
    k.rod(C.gold, at(0.1), at(0.112), 0.0068, 8);
    k.rod(C.ink, at(0.11), at(0.145), 0.0062, 8, 0.25);
    k.ball(C.woodDark, ...at(-0.077), 0.0055);
    return k.geometry();
  })();
  const scissorsGeo = (() => {
    // Finger loops round the hand, blades past the fingertips, opened a little.
    const k = new Kit(),
      [x] = handCentre(1);
    for (const s of [-1, 1]) {
      k.ring(C.red, x, -0.08, s * 0.012, 0.012, 0.012, 0, Math.PI / 2);
      k.box('#a9aeb0', x, -0.13, s * 0.006, 0.003, 0.075, 0.007, s * 0.14);
    }
    return k.geometry();
  })();
  const redPaperGeo = (() => {
    // A square of red paper pinched between thumb and fingers (left hand).
    const k = new Kit(),
      [x] = handCentre(-1);
    k.box(C.red, x + 0.02, -0.12, 0.015, 0.0016, 0.12, 0.11, 0.08);
    k.box(C.redDeep, x + 0.021, -0.095, 0.015, 0.0008, 0.002, 0.1, 0.08);
    return k.geometry();
  })();
  const sheetGeos = new Map<string, T.BufferGeometry>();
  const writeSessions = sessionIds(arts, (s) => s.action === 'write'),
    cutSessions = sessionIds(arts, (s) => s.id === 'paper-cutting'),
    craftSessions = sessionIds(arts, (s) => s.action === 'craft');
  const seatOf = (actor: Person) => {
    const s = actor.spec.segments.find(
      (s) => s.seated && ['write', 'craft'].includes(s.action),
    );
    return s
      ? { x: s.path[0][0], z: s.path[0][1], heading: s.heading }
      : {
          x: arts.zone.instructorSpot!.position[0],
          z: arts.zone.instructorSpot!.position[1],
          heading: arts.zone.instructorSpot!.heading,
        };
  };
  /** Distance from a seat along its heading to the edge of a table rectangle. */
  const edgeDistance = (
    seat: { x: number; z: number; heading: number },
    t: { x: number; z: number; hx: number; hz: number },
  ) => {
    const fx = Math.sin(seat.heading),
      fz = Math.cos(seat.heading);
    let near = 0;
    for (const [p, f, c, h] of [
      [seat.x, fx, t.x, t.hx],
      [seat.z, fz, t.z, t.hz],
    ])
      if (Math.abs(f) > 1e-6)
        near = Math.max(near, Math.min((c - h - p) / f, (c + h - p) / f));
    return near;
  };
  const artsPeople = [
    ...(arts.zone.participants || []).map((id) => byId.get(id)),
    ...arts.sessions.map(instructorActor),
  ].filter((a, i, list): a is Person => !!a && list.indexOf(a) === i);
  for (const actor of artsPeople) {
    const guest = actor.spec.role === 'instructor';
    const mine = arts.sessions.filter(
      (s) => !guest || s.instructorId === actor.spec.id,
    );
    const seat = seatOf(actor),
      ends = Math.abs(Math.cos(seat.heading)) > 0.7,
      d = edgeDistance(seat, LONG_TABLE) + (ends ? 0.14 : 0.17);
    for (const session of mine) {
      if (!sheetBuilders[session.id]) continue;
      if (!sheetGeos.has(session.id)) {
        const k = new Kit();
        sheetBuilders[session.id](k, seeded(session.start + 11));
        sheetGeos.set(session.id, k.geometry());
      }
      const sheet = bind(
        actor,
        'sheet-' + session.id,
        sheetGeos.get(session.id)!,
        root,
        [guest ? session.instructorAction || session.action : session.action],
        arts,
        [session.id],
        true,
      );
      sheet.position.set(
        seat.x + Math.sin(seat.heading) * d,
        TABLE_TOP,
        seat.z + Math.cos(seat.heading) * d,
      );
      sheet.rotation.y = seat.heading;
      // Head and foot seats sit between the side places: a smaller footprint.
      if (ends) sheet.scale.setScalar(0.8);
    }
    const writes = mine
      .filter((s) => writeSessions.includes(s.id))
      .map((s) => s.id);
    if (writes.length)
      bind(
        actor,
        'brush-arts',
        brushGeo,
        actor.joints.handR,
        ['write'],
        arts,
        writes,
      );
    const cuts = mine
      .filter((s) => cutSessions.includes(s.id))
      .map((s) => s.id);
    if (cuts.length)
      bind(
        actor,
        'scissors',
        scissorsGeo,
        actor.joints.handR,
        ['craft'],
        arts,
        cuts,
      );
    const crafts = mine
      .filter((s) => craftSessions.includes(s.id))
      .map((s) => s.id);
    if (crafts.length)
      bind(
        actor,
        'red-paper',
        redPaperGeo,
        actor.joints.handL,
        ['craft'],
        arts,
        crafts,
      );
  }

  // Tea corner: gongfu cups and teapot in hand, newspapers in the morning.
  const tea = zoneOf('tea-corner');
  const teaSessions = sessionIds(tea, (s) => s.action === 'tea'),
    paperSessions = sessionIds(tea, (s) => decorOf(s).includes('newspapers'));
  const cupGeo = (() => {
    const k = new Kit();
    k.cyl(C.porcelain, 0, 0.016, 0, 0.024, 0.032, 0, 0, 0, 1.35, 14);
    k.cyl(C.cobalt, 0, 0.026, 0, 0.0305, 0.006, 0, 0, 0, 1.03, 14);
    k.cyl(C.tea, 0, 0.0305, 0, 0.0285, 0.001, 0, 0, 0, 1, 14);
    return k.geometry();
  })();
  const teapotGeo = (() => {
    // Held by the handle: body 0.075 m along -x of the hand centre, lid +z,
    // spout leading along -x.
    const k = new Kit(),
      [hx, hy] = handCentre(1),
      x = hx - 0.075;
    k.ball(C.clayPot, x, hy, 0, 0.06, 0.06, 0.045);
    k.cyl(C.clayPot, x, hy, 0.045, 0.031, 0.012, Math.PI / 2);
    k.ball(C.clayPot, x, hy, 0.058, 0.011);
    k.rod(
      C.clayPot,
      [x - 0.05, hy, -0.008],
      [x - 0.11, hy, 0.034],
      0.009,
      8,
      0.6,
    );
    k.ring(C.clayPot, hx - 0.006, hy, 0, 0.026, 0.026, Math.PI / 2);
    return k.geometry();
  })();
  const newspaperGeo = (() => {
    // Folded broadsheet (0.44 × 0.30) printed on both faces, centred.
    const k = new Kit(),
      rand = seeded(23);
    k.box(C.newsprint, 0, 0, 0, 0.44, 0.3, 0.003);
    k.box('#d6d2c7', 0, 0, 0, 0.004, 0.3, 0.0034);
    for (const face of [-1, 1]) {
      const z = face * 0.0018;
      k.box(C.red, 0.13, 0.115, z, 0.13, 0.036, 0.0008);
      k.box('#3c3e3d', -0.07, 0.115, z, 0.19, 0.02, 0.0008);
      k.box('#b3b8b4', -0.13, 0.0, z, 0.11, 0.1, 0.0008);
      for (let i = 0; i < 10; i++)
        k.box(
          C.print,
          0.02 + rand() * 0.16,
          0.072 - i * 0.021,
          z,
          0.09 + rand() * 0.08,
          0.006,
          0.0008,
        );
      for (let i = 0; i < 3; i++)
        k.box(C.print, -0.13, -0.072 - i * 0.021, z, 0.13, 0.006, 0.0008);
    }
    return k.geometry();
  })();
  const teaPeople = (tea.zone.participants || [])
    .map((id) => byId.get(id))
    .filter((a): a is Person => !!a);
  const tableOf = (z: number) =>
    TEA_TABLES.reduce((a, b) =>
      Math.abs(a.z - z) < Math.abs(b.z - z) ? a : b,
    );
  const coasters: [number, number][] = [];
  for (const actor of teaPeople) {
    const s = actor.spec.segments.find(
      (s) => s.seated && ['tea', 'read', 'listen'].includes(s.action),
    );
    if (!s) continue;
    const seat = { x: s.path[0][0], z: s.path[0][1], heading: s.heading },
      d = edgeDistance(seat, tableOf(seat.z)) + 0.13,
      x = seat.x + Math.sin(seat.heading) * d,
      z = seat.z + Math.cos(seat.heading) * d;
    coasters.push([x, z]);
    if (paperSessions.length) {
      const cup = bind(
        actor,
        'tea-cup-table',
        cupGeo,
        root,
        ['read'],
        tea,
        paperSessions,
        true,
      );
      cup.position.set(x, TABLE_TOP + 0.006, z);
      holdToRead(
        bind(
          actor,
          'newspaper',
          newspaperGeo,
          actor.joints.torso,
          ['read'],
          tea,
          paperSessions,
        ),
        0.82,
      );
    }
    if (teaSessions.length) {
      // Cup centre 0.04 m along -x of the hand centre, its axis on +z.
      const cup = bind(
        actor,
        'tea-cup',
        cupGeo,
        actor.joints.handR,
        ['tea'],
        tea,
        teaSessions,
      );
      cup.position.set(0.0072 - 0.04, -0.0716, -0.016);
      cup.rotation.x = Math.PI / 2;
    }
  }
  const teaHost = tea.sessions
    .map(instructorActor)
    .find((a): a is Person => !!a);
  if (teaHost) {
    bind(teaHost, 'teapot', teapotGeo, teaHost.joints.handR, ['tea'], tea);
    bind(teaHost, 'tea-stool', stoolGeo, teaHost.root, ['tea'], tea);
  }

  // Décor: one group per décor id, shown while a session that lists it runs.
  const decor: { id: string; root: T.Group }[] = [];
  const decorGroup = (id: string) => {
    const group = new T.Group();
    group.name = 'decor-' + id;
    group.userData.decor = id;
    group.visible = false;
    root.add(group);
    decor.push({ id, root: group });
    return group;
  };
  const decorIds = new Set(program.programs.flatMap(decorOf));
  // Festival lanterns: a stage row on the front truss, above the performer
  // and the first rows; for the riddle circle, a ring over the circle.
  const circleSlots = program.floor.formations.circle.slots,
    circleCentre = circleSlots
      .reduce(
        (v, s) => v.add(new T.Vector3(s.at[0], 0, s.at[1])),
        new T.Vector3(),
      )
      .multiplyScalar(1 / circleSlots.length);
  const stageRow: V3[] = [-9.4, -8.15, -6.9, -5.65, -4.4].map((x, i) => [
      x,
      9.92,
      2.92 + (i % 2) * 0.08,
    ]),
    riddleRing: V3[] = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      return [
        circleCentre.x + Math.cos(a) * 1.2,
        circleCentre.z + Math.sin(a) * 1.2,
        2.92 + (i % 2) * 0.08,
      ];
    });
  const lanternRow = (tags: boolean) => {
    const k = new Kit(),
      rand = seeded(tags ? 31 : 17);
    (tags ? riddleRing : stageRow).forEach(([x, z, top]) => {
      k.cyl(C.cord, x, (top + 3.98) / 2, z, 0.0045, 3.98 - top, 0, 0, 0, 1, 5);
      const cap = lantern(k, x, top, z) + 0.2;
      if (!tags) return;
      for (const s of [-1, 1]) {
        const tx = x + s * 0.055,
          tz = z + 0.02,
          ty = cap - (s > 0 ? 0.09 : 0.16);
        k.rod(C.cord, [tx, cap, tz], [tx, ty, tz], 0.0018, 4);
        k.push(place(tx, ty - 0.09, tz, 0, 0.55, 0));
        k.box(
          [C.cream, C.blush, C.butter][Math.floor(rand() * 3)],
          0,
          0,
          0,
          0.065,
          0.18,
          0.002,
        );
        for (const v of [0.045, -0.01, -0.06])
          inkUpright(k, C.ink, glyph(rand, 0, v, 0.036), 0.0012);
        k.pop();
      }
    });
    return k.geometry();
  };
  if (decorIds.has('lanterns'))
    piece('festival-lanterns', lanternRow(false), decorGroup('lanterns'), true);
  if (decorIds.has('riddle-lanterns'))
    piece(
      'riddle-lanterns',
      lanternRow(true),
      decorGroup('riddle-lanterns'),
      true,
    );
  if (decorIds.has('herb-chart')) {
    // Teaching easel with an acupoint figure and herb plates.
    const k = new Kit();
    for (const s of [-1, 1])
      k.rod(C.wood, [s * 0.36, 0, 0.16], [s * 0.3, 1.98, 0.0], 0.017, 6);
    k.rod(C.wood, [0, 0, -0.5], [0, 1.82, -0.04], 0.015, 6);
    k.rbox(C.wood, 0, 0.86, 0.09, 0.84, 0.035, 0.085);
    k.push(place(0, 0.88, 0.07, -0.08));
    k.rbox('#efe6d3', 0, 0.52, 0, 0.8, 1.04, 0.022);
    const z = 0.0125;
    k.box(C.rice, 0, 0.52, z, 0.74, 0.98, 0.002);
    k.box(C.red, 0, 0.94, z + 0.0015, 0.68, 0.1, 0.0015);
    const rand = seeded(57);
    for (let i = 0; i < 4; i++)
      inkUpright(
        k,
        C.butter,
        glyph(rand, -0.21 + i * 0.14, 0.94, 0.06),
        z + 0.0025,
      );
    // Abstract acupoint figure with a meridian and points.
    const fx = -0.17,
      fz = z + 0.0018;
    k.ball(C.tan, fx, 0.77, fz, 0.045, 0.055, 0.001);
    k.box(C.tan, fx, 0.6, fz, 0.13, 0.24, 0.0015);
    for (const s of [-1, 1]) {
      k.box(C.tan, fx + s * 0.09, 0.6, fz, 0.036, 0.22, 0.0015, 0, 0, s * 0.18);
      k.box(
        C.tan,
        fx + s * 0.036,
        0.35,
        fz,
        0.045,
        0.27,
        0.0015,
        0,
        0,
        s * 0.04,
      );
    }
    k.box(C.redDeep, fx + 0.1, 0.6, fz + 0.001, 0.006, 0.2, 0.001, 0, 0, 0.18);
    k.box(C.redDeep, fx + 0.03, 0.42, fz + 0.001, 0.006, 0.36, 0.001);
    for (const [x, y] of [
      [0.115, 0.69],
      [0.1, 0.6],
      [0.083, 0.52],
      [0.03, 0.56],
      [0.03, 0.42],
      [0.03, 0.3],
      [0.035, 0.24],
      [0, 0.66],
    ])
      k.cyl(
        C.red,
        fx + x,
        y,
        fz + 0.002,
        0.011,
        0.002,
        Math.PI / 2,
        0,
        0,
        1,
        10,
      );
    // Herb plates: ginseng, goji and chrysanthemum, each with caption strokes.
    const hx = 0.13;
    for (const [dx, a] of [
      [-0.03, 0.4],
      [0, 0],
      [0.03, -0.4],
    ])
      k.ball(
        '#c69a5e',
        hx + dx,
        0.71 - Math.abs(a) * 0.04,
        fz,
        0.012,
        0.05,
        0.001,
        0,
        0,
        a,
      );
    k.ball('#6c8f5a', hx, 0.79, fz, 0.04, 0.014, 0.001);
    k.box('#6c8f5a', hx, 0.53, fz, 0.004, 0.11, 0.001, 0, 0, 0.3);
    for (let i = 0; i < 6; i++)
      k.ball(
        C.red,
        hx - 0.03 + (i % 3) * 0.025,
        0.5 + Math.floor(i / 3) * 0.05,
        fz + 0.0005,
        0.011,
        0.014,
        0.001,
      );
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      k.ball(
        C.butter,
        hx + Math.cos(a) * 0.035,
        0.32 + Math.sin(a) * 0.035,
        fz,
        0.008,
        0.026,
        0.001,
        0,
        0,
        a + Math.PI / 2,
      );
    }
    k.cyl(
      '#b07a2a',
      hx,
      0.32,
      fz + 0.0008,
      0.016,
      0.002,
      Math.PI / 2,
      0,
      0,
      1,
      10,
    );
    for (const y of [0.74, 0.52, 0.31])
      for (let i = 0; i < 3; i++)
        k.box(
          C.print,
          0.27,
          y + 0.03 - i * 0.03,
          fz,
          0.07 - i * 0.012,
          0.009,
          0.001,
        );
    k.pop();
    const easel = piece(
      'herb-chart-easel',
      k.geometry(),
      decorGroup('herb-chart'),
      true,
    );
    // Beside the board on the presenter's side, angled toward the rows.
    easel.position.set(-4.6, 0, 9.3);
    easel.rotation.y = -0.83;
  }
  // Library bays flanking the long table face east into the arts zone.
  const onBay = (k: Kit, z: number) =>
    k.push(place(BAY_X, 0, z, 0, Math.PI / 2, 0));
  if (decorIds.has('couplets')) {
    const k = new Kit(),
      rand = seeded(88);
    for (const z of [BAYS.lattice, BAYS.books]) {
      onBay(k, z);
      coupletScroll(k, 0, 2.42, 0.3, 1.42, 7, rand);
      k.pop();
    }
    // The horizontal scroll crowns the pair above the screen bay.
    onBay(k, BAYS.tv);
    k.box(C.red, 0, 2.5, 0.006, 0.9, 0.24, 0.003);
    for (const s of [-1, 1]) {
      k.box(C.gold, 0, 2.5 + s * 0.098, 0.0078, 0.86, 0.005, 0.0012);
      k.box(C.gold, s * 0.428, 2.5, 0.0078, 0.005, 0.2, 0.0012);
    }
    for (let i = 0; i < 4; i++)
      inkUpright(k, C.ink, glyph(rand, -0.3 + i * 0.2, 2.5, 0.15), 0.0084);
    k.pop();
    piece('couplet-scrolls', k.geometry(), decorGroup('couplets'));
  }
  if (decorIds.has('paper-cuts')) {
    const k = new Kit(),
      flower = windowFlower(0.15),
      small = windowFlower(0.12, 6),
      fortune = fortuneDiamond(0.2);
    onBay(k, BAYS.lattice);
    for (const y of [1.07, 1.74, 2.41])
      k.add(flower, C.red, place(0, y, 0.006));
    k.pop();
    onBay(k, BAYS.books);
    for (const [x, y] of [
      [-0.3, 1.45],
      [0.3, 1.45],
      [0, 1.95],
    ] as const)
      k.add(small, C.red, place(x, y, 0.006));
    k.pop();
    onBay(k, BAYS.tv);
    k.add(fortune, C.red, place(0, 2.53, 0.006));
    k.pop();
    [flower, small, fortune].forEach((g) => g.dispose());
    piece('paper-cuts', k.geometry(), decorGroup('paper-cuts'));
  }
  if (decorIds.has('scroll-paintings')) {
    const k = new Kit();
    onBay(k, BAYS.lattice);
    paintingScroll(k, 0, 2.5, 0.5, 1.6, paintMountains);
    k.pop();
    onBay(k, BAYS.books);
    paintingScroll(k, 0, 2.5, 0.5, 1.6, paintBamboo);
    k.pop();
    piece('scroll-paintings', k.geometry(), decorGroup('scroll-paintings'));
  }
  if (decorIds.has('table-lanterns')) {
    // Finished lanterns stand along the table's centre line between places.
    const k = new Kit();
    for (const z of [13.48, 15.04, 16.61]) {
      standingLantern(k, LONG_TABLE.x, TABLE_TOP, z, 0.45);
      k.ring(C.gold, LONG_TABLE.x, TABLE_TOP + 0.172, z, 0.02, 0.02);
    }
    piece(
      'finished-lanterns',
      k.geometry(),
      decorGroup('table-lanterns'),
      true,
    );
  }
  if (decorIds.has('tea-set')) {
    const k = new Kit(),
      t = TABLE_TOP;
    // Gongfu tray in front of the host on the middle banquette table.
    const tx = -1.27,
      tz = TEA_TABLES[1].z;
    k.rbox(C.woodDark, tx, t + 0.018, tz, 0.3, 0.036, 0.46);
    for (let i = 0; i < 7; i++)
      k.box('#3a241b', tx, t + 0.037, tz - 0.18 + i * 0.06, 0.26, 0.003, 0.03);
    for (let i = 0; i < 4; i++)
      k.add(cupGeo, null, place(tx - 0.07, t + 0.038, tz - 0.15 + i * 0.07));
    k.cyl(
      C.celadon,
      tx + 0.06,
      t + 0.075,
      tz + 0.12,
      0.032,
      0.075,
      0,
      0,
      0,
      0.85,
    );
    k.cyl(
      C.celadon,
      tx + 0.06,
      t + 0.105,
      tz + 0.152,
      0.008,
      0.03,
      -0.9,
      0,
      0,
      0.6,
      6,
    );
    k.cyl(C.jade, tx + 0.07, t + 0.075, tz - 0.1, 0.028, 0.075);
    k.cyl(C.goldDeep, tx + 0.07, t + 0.116, tz - 0.1, 0.029, 0.01);
    k.ball(C.clayPot, tx + 0.08, t + 0.055, tz + 0.02, 0.02, 0.016, 0.026);
    // Hot-water kettle and a folded tea towel beside the tray.
    k.ball(C.porcelain, -1.17, t + 0.07, tz + 0.43, 0.07, 0.065, 0.07);
    k.cyl(C.porcelain, -1.17, t + 0.008, tz + 0.43, 0.06, 0.016);
    k.cyl(
      C.porcelain,
      -1.24,
      t + 0.1,
      tz + 0.43,
      0.01,
      0.08,
      0,
      0,
      0.9,
      0.6,
      6,
    );
    k.add(
      new T.TorusGeometry(0.05, 0.007, 6, 14, Math.PI),
      C.woodDark,
      place(-1.17, t + 0.13, tz + 0.43),
    );
    k.rbox('#e8dcc4', -1.2, t + 0.008, tz - 0.4, 0.1, 0.016, 0.14);
    // Small teapots and spare cups on the outer tables; coasters at every place.
    for (const table of [TEA_TABLES[0], TEA_TABLES[2]]) {
      k.ball(
        C.porcelain,
        table.x + 0.24,
        t + 0.05,
        table.z + 0.25,
        0.055,
        0.045,
        0.055,
      );
      k.ring(
        C.cobalt,
        table.x + 0.24,
        t + 0.05,
        table.z + 0.25,
        0.056,
        0.056,
        Math.PI / 2,
      );
      k.ball(C.porcelain, table.x + 0.24, t + 0.098, table.z + 0.25, 0.012);
      k.cyl(
        C.porcelain,
        table.x + 0.17,
        t + 0.06,
        table.z + 0.25,
        0.008,
        0.05,
        0,
        0,
        0.95,
        0.6,
        6,
      );
      for (const dz of [0.08, 0.16])
        k.add(cupGeo, null, place(table.x + 0.32, t, table.z + dz));
    }
    for (const [x, z] of coasters)
      k.cyl(C.wood, x, t + 0.003, z, 0.04, 0.006, 0, 0, 0, 1, 16);
    piece('gongfu-tea-set', k.geometry(), decorGroup('tea-set'));
  }
  if (decorIds.has('newspapers')) {
    const k = new Kit(),
      rand = seeded(64);
    const stack = (x: number, z: number) => {
      for (let i = 0; i < 3; i++) {
        k.push(
          place(x, TABLE_TOP + 0.003 + i * 0.006, z, 0, (rand() - 0.5) * 0.4),
        );
        k.box(C.newsprint, 0, 0, 0, 0.22, 0.005, 0.3);
        k.box(
          i === 2 ? C.red : '#3c3e3d',
          0.05,
          0.003,
          -0.11,
          0.09,
          0.0012,
          0.04,
        );
        for (let j = 0; j < 5; j++)
          k.box(C.print, -0.02, 0.003, -0.06 + j * 0.035, 0.16, 0.0012, 0.008);
        k.pop();
      }
    };
    stack(-1.3, TEA_TABLES[0].z - 0.22);
    stack(-1.3, TEA_TABLES[2].z - 0.22);
    stack(-1.74, TEA_TABLES[1].z);
    piece('newspaper-stacks', k.geometry(), decorGroup('newspapers'));
  }
  for (const id of decorIds)
    if (!decor.some((d) => d.id === id)) decorGroup(id);

  // Layout pieces that come with a floor formation once the class has
  // settled: subtle practice mats under the tai chi / qigong grid and a low
  // tea table inside the device class's chat circle.
  const transition = program.floor.transition;
  const formations = program.floor.formations;
  type FormationId = keyof typeof formations;
  const formationOf = (s: DaySession) =>
    s.formation ? formations[s.formation as FormationId] : undefined;
  const layout: { root: T.Object3D; sessions: string[] }[] = [];
  {
    const k = new Kit();
    for (const slot of formations.grid.slots) {
      k.cyl(
        '#d2ddcd',
        slot.at[0],
        0.004,
        slot.at[1],
        0.34,
        0.008,
        0,
        0,
        0,
        1,
        28,
      );
      k.ring(
        '#aebfaa',
        slot.at[0],
        0.0085,
        slot.at[1],
        0.31,
        0.31,
        Math.PI / 2,
      );
    }
    layout.push({
      root: piece('layout-practice-mats', k.geometry(), root),
      sessions: sessionIds(
        floor,
        (s) => s.formation === 'grid' && ['tai-chi', 'qigong'].includes(s.id),
      ),
    });
  }
  {
    const chat = formations['small-groups'].slots.filter(
      (s) => s.group === 'chat',
    );
    if (chat.length) {
      const cx = chat.reduce((v, s) => v + s.at[0], 0) / chat.length,
        cz = chat.reduce((v, s) => v + s.at[1], 0) / chat.length,
        k = new Kit();
      k.cyl('#9a6a45', 0, 0.43, 0, 0.32, 0.03, 0, 0, 0, 1, 28);
      k.cyl('#7d5437', 0, 0.21, 0, 0.035, 0.42, 0, 0, 0, 1, 10);
      k.cyl('#7d5437', 0, 0.012, 0, 0.17, 0.024, 0, 0, 0, 1, 20);
      k.push(place(0, 0.445, 0));
      snacksCentre(k);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        teacup(k, Math.cos(a) * 0.22, Math.sin(a) * 0.22);
      }
      k.pop();
      const table = piece('layout-chat-tea-table', k.geometry(), root, true);
      table.position.set(cx, 0, cz);
      layout.push({
        root: table,
        sessions: sessionIds(floor, (s) => s.formation === 'small-groups'),
      });
    }
  }
  layout.forEach((l) => (l.root.visible = false));

  // Game and pastime tables: each schedule entry brings its set (centre
  // pieces plus a place setting for every sitter) and the sitters' tools.
  type Pastime = {
    label: string;
    labelZh: string;
    players?: number;
    play: string;
    others: string;
  };
  const catalog = program.tableActivities as Record<string, Pastime>;
  type TableEntry = Slot & { activity: string; index: number };
  type TableState = Track<TableEntry> & {
    tableId: string;
    position: T.Vector3;
  };
  const tables: TableState[] = [];
  const tableSetMeshes: {
    track: TableState;
    entry: TableEntry;
    root: T.Object3D;
  }[] = [];
  const timed: {
    root: T.Object3D;
    actor: Person;
    action: string;
    from: number;
    to: number;
  }[] = [];
  const pages: { root: T.Object3D; actor: Person }[] = [];
  const actionAt = (actor: Person, time: number) => {
    const segments = actor.spec.segments,
      t = (((time + actor.spec.offset) % 720) + 720) % 720;
    return (
      segments.find((s) => t >= s.start && t < s.end) ||
      segments[segments.length - 1]
    ).action as string;
  };
  const hipY = (actor: Person, y: number) => y / actor.profile.height - 0.575;
  // Shared hand-tool geometries (rig hand frame; see handCentre above).
  const pieceGeos = new Map<string, T.BufferGeometry>();
  const gamePiece = (kind: string, color: string) => {
    const key = kind + color;
    if (!pieceGeos.has(key)) {
      const k = new Kit(),
        rand = seeded(color.length * 7 + kind.length);
      if (kind === 'xiangqi') xiangqiDisc(k, 0, -0.006, 0, color);
      else if (kind === 'go')
        k.ball(color, 0, 0, 0, 0.0125, 0.0055, 0.0125, 0, 0, 0, false);
      else if (kind === 'checkers')
        k.ball(color, 0, 0, 0, 0.0092, 0.0092, 0.0092, 0, 0, 0, false);
      else if (kind === 'dominoes') domino(k, 0, -0.004, 0, 0, rand);
      else k.box(color, 0, 0, 0, 0.032, 0.002, 0.032);
      pieceGeos.set(key, k.geometry());
    }
    return pieceGeos.get(key)!;
  };
  const fannedCardsGeo = (() => {
    const k = new Kit(),
      rand = seeded(77);
    for (let i = 0; i < 7; i++) {
      const a = ((-25 + (i * 50) / 6) * Math.PI) / 180;
      k.push(place(-0.0072 + 0.012 + i * 0.0011, -0.06, 0, a, 0, 0));
      k.box(G.card, 0, -0.045, 0, 0.0008, 0.09, 0.064);
      k.box(
        rand() < 0.5 ? C.red : G.black,
        0.0006,
        -0.077,
        -0.022,
        0.0004,
        0.014,
        0.01,
      );
      k.box(G.cardBack, -0.0006, -0.045, 0, 0.0004, 0.084, 0.058);
      k.pop();
    }
    return k.geometry();
  })();
  const playedCardGeo = (() => {
    const k = new Kit();
    k.box(G.card, 0, 0, 0, 0.0008, 0.09, 0.064);
    k.box(C.red, 0.0006, -0.03, -0.02, 0.0004, 0.014, 0.01);
    k.box(G.cardBack, -0.0006, 0, 0, 0.0004, 0.084, 0.058);
    return k.geometry();
  })();
  const needleGeo = (s: number) => {
    const k = new Kit(),
      [x, y] = handCentre(s);
    k.rod('#c9a66c', [x, y + 0.05, 0], [x, y - 0.18, 0], 0.0028, 6, 0.4);
    k.ball(C.woodDark, x, y + 0.052, 0, 0.007);
    return k.geometry();
  };
  const needles = { R: needleGeo(1), L: needleGeo(-1) };
  const knittedGeo = (color: string) => {
    // Hangs from the left needle: local +x points down in the knit pose.
    const k = new Kit(),
      [x, y] = handCentre(-1);
    k.rbox(color, x + 0.055, y - 0.1, 0, 0.1, 0.09, 0.012);
    for (let i = 0; i < 3; i++)
      k.box(
        shade(color, 0.8),
        x + 0.025 + i * 0.03,
        y - 0.1,
        0.0062,
        0.006,
        0.09,
        0.001,
      );
    return k.geometry();
  };
  const yarnGeos = new Map<string, T.BufferGeometry>();
  const yarnBall = (color: string) => {
    if (!yarnGeos.has(color)) {
      const k = new Kit();
      yarn(k, 0, 0, 0, 0.045, color);
      yarnGeos.set(color, k.geometry());
    }
    return yarnGeos.get(color)!;
  };
  const albumGeo = (() => {
    // Open photo album, a +z-facing plane 0.30 × 0.22 with the spine on y.
    const k = new Kit(),
      rand = seeded(91);
    k.rbox('#6e2f2c', 0, 0, -0.003, 0.3, 0.22, 0.006);
    k.box('#2d2b29', 0, 0, 0.001, 0.286, 0.206, 0.002);
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++)
        k.box(
          pick(['#efe6d2', '#d9c7a4', '#c7d6dd', '#e3cfc4'], rand),
          s * (0.04 + (i % 2) * 0.062),
          -0.045 + Math.floor(i / 2) * 0.09,
          0.0028,
          0.05,
          0.07,
          0.0012,
        );
    return k.geometry();
  })();
  const pageGeo = (() => {
    const k = new Kit();
    k.box('#2d2b29', 0.071, 0, 0, 0.14, 0.2, 0.0016);
    k.box('#e6dccb', 0.075, 0.03, 0.0012, 0.05, 0.07, 0.001);
    k.box('#e6dccb', 0.075, 0.03, -0.0012, 0.05, 0.07, 0.001);
    return k.geometry();
  })();
  const pencilGeo = (() => {
    const k = new Kit(),
      c = new T.Vector3(...handCentre(1)),
      d = new T.Vector3(0.1, 0.39, -0.91).normalize(),
      at = (t: number) => c.clone().addScaledVector(d, t).toArray() as V3;
    k.rod('#3d6fa8', at(-0.07), at(0.1), 0.0045, 6);
    k.rod('#e6cfa5', at(0.1), at(0.125), 0.0045, 6, 0.3);
    return k.geometry();
  })();
  const origamiPaperGeo = (() => {
    const k = new Kit(),
      [x] = handCentre(-1);
    k.box('#e889a8', x + 0.02, -0.12, 0.015, 0.0016, 0.11, 0.11, 0.08);
    k.box('#4a7fc1', x + 0.024, -0.1, 0.03, 0.0016, 0.06, 0.06, 0.6);
    return k.geometry();
  })();
  const stemGeo = (() => {
    const k = new Kit(),
      [x, y] = handCentre(1);
    k.rod('#5f8a4a', [x, y + 0.03, 0.01], [x, y - 0.2, 0.01], 0.003, 5);
    k.ball('#e48aa2', x, y - 0.21, 0.01, 0.028, 0.022, 0.028);
    return k.geometry();
  })();
  const hashOf = (id: string) => {
    let h = 7;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h;
  };
  for (const table of program.tables) {
    const object = model?.objects.find((o) => o.id === table.id);
    const spec = object && model?.assets[object.assetId];
    if (!object || !spec) continue;
    const [w, h, d] = spec.dimensions.map(
        (v, i) => v * (object.scale?.[i] ?? 1),
      ),
      round = spec.kind === 'round-table',
      c = { x: object.position[0], z: object.position[2] },
      top = object.position[1] + h,
      rot = object.rotation;
    const entries: TableEntry[] = table.schedule.map((e, index) => ({
      id: table.id + '#' + index,
      start: e.start,
      end: e.end,
      activity: e.activity,
      index,
    }));
    const track: TableState = {
      sessions: entries,
      current: null,
      tableId: table.id,
      position: new T.Vector3(c.x, top + 0.85, c.z),
    };
    tables.push(track);
    // Sitters: anyone seated within reach whose activity names this table.
    const labels = entries
      .map((e) => catalog[e.activity]?.label)
      .filter(Boolean);
    const sitters = actors.flatMap((actor) => {
      const s = actor.spec.segments.find(
        (s) =>
          s.seated &&
          Math.hypot(s.path[0][0] - c.x, s.path[0][1] - c.z) < 1.3 &&
          labels.some((l) => s.title?.startsWith(l)),
      );
      if (!s) return [];
      const x = s.path[0][0],
        z = s.path[0][1],
        toward = Math.atan2(c.x - x, c.z - z),
        facing = Math.cos(s.heading - toward) > 0.6;
      // Place settings sit in front of the sitter, or toward the table when
      // their chair is turned away.
      const heading = facing ? s.heading : toward,
        fx = Math.sin(heading),
        fz = Math.cos(heading);
      let edge: number;
      if (round) {
        const px = c.x - x,
          pz = c.z - z,
          proj = px * fx + pz * fz,
          perp = px * px + pz * pz - proj * proj;
        edge = proj - Math.sqrt(Math.max(0, (w / 2) ** 2 - perp));
      } else {
        const cr = Math.cos(-rot),
          sr = Math.sin(-rot),
          lx = (x - c.x) * cr + (z - c.z) * sr,
          lz = -(x - c.x) * sr + (z - c.z) * cr;
        edge = edgeDistance(
          { x: lx, z: lz, heading: heading - rot },
          { x: 0, z: 0, hx: w / 2, hz: d / 2 },
        );
      }
      return [{ actor, x, z, heading, edge }];
    });
    const byActivity = new Map<string, TableEntry[]>();
    for (const e of entries)
      byActivity.set(e.activity, [...(byActivity.get(e.activity) || []), e]);
    for (const [activity, list] of byActivity) {
      const info = catalog[activity],
        set = tableSets[activity];
      if (!info || !set) continue;
      const mid = (list[0].start + list[0].end) / 2,
        roles = sitters.map((s) => ({
          ...s,
          play: actionAt(s.actor, mid) === info.play,
        })),
        players = roles.filter((r) => r.play),
        first = players[0] || roles[0],
        angle = first ? Math.atan2(first.x - c.x, first.z - c.z) : rot,
        ids = list.map((e) => e.id);
      const k = new Kit(),
        rand = seeded(hashOf(table.id + activity));
      k.push(place(c.x, top, c.z, 0, angle, 0));
      set.centre(k, rand);
      k.pop();
      for (const r of roles) {
        const setting = r.play ? set.player : set.other;
        if (!setting) continue;
        const dist = r.edge + 0.1;
        k.push(
          place(
            r.x + Math.sin(r.heading) * dist,
            top,
            r.z + Math.cos(r.heading) * dist,
            0,
            r.heading,
            0,
          ),
        );
        if (setting === 'cup') teacup(k, 0.12, 0.0);
        else setting(k, rand);
        k.pop();
      }
      const mesh = piece(
        `table-set-${table.id}-${activity}`,
        k.geometry(),
        root,
      );
      mesh.visible = false;
      for (const e of list)
        tableSetMeshes.push({ track, entry: e, root: mesh });
      // Tools in hand, timed to the motion's phase where a piece changes hands.
      players.forEach((r, i) => {
        const a = r.actor,
          tableTop = hipY(a, top);
        if (info.play === 'board-game') {
          const color =
            activity === 'xiangqi'
              ? [C.red, G.black][i % 2]
              : activity === 'go'
                ? [G.black, G.white][i % 2]
                : activity === 'checkers'
                  ? [C.red, '#3f7fc0', '#4c9a6a'][i % 3]
                  : pick(['#a9cde6', '#6fa37a', C.red], rand);
          const geo = gamePiece(activity, color);
          const held = bind(
            a,
            'game-piece',
            geo,
            a.joints.handR,
            ['board-game'],
            track,
            ids,
          );
          held.position.set(-0.012, -0.13, 0.012);
          held.rotation.z = Math.PI / 2;
          timed.push({
            root: held,
            actor: a,
            action: 'board-game',
            from: 0.26,
            to: 0.47,
          });
          const placed = bind(
            a,
            'placed-piece',
            geo,
            a.joints.hip,
            ['board-game'],
            track,
            ids,
          );
          placed.position.set(0.033, tableTop + 0.006, 0.615);
          timed.push({
            root: placed,
            actor: a,
            action: 'board-game',
            from: 0.47,
            to: 1,
          });
        }
        if (info.play === 'cards') {
          bind(
            a,
            'fanned-cards',
            fannedCardsGeo,
            a.joints.handL,
            ['cards'],
            track,
            ids,
          );
          const held = bind(
            a,
            'played-card',
            playedCardGeo,
            a.joints.handR,
            ['cards'],
            track,
            ids,
          );
          held.position.set(-0.012, -0.11, 0.01);
          timed.push({
            root: held,
            actor: a,
            action: 'cards',
            from: 0.2,
            to: 0.46,
          });
          const laid = bind(
            a,
            'laid-card',
            playedCardGeo,
            a.joints.hip,
            ['cards'],
            track,
            ids,
          );
          laid.position.set(0.017, tableTop + 0.002, 0.58);
          laid.rotation.z = Math.PI / 2;
          timed.push({
            root: laid,
            actor: a,
            action: 'cards',
            from: 0.46,
            to: 1,
          });
        }
        if (info.play === 'knit') {
          const color = pick(
            ['#c94f4f', '#5a86b8', '#7aa66b', '#b77bb0', '#e2b04a'],
            rand,
          );
          bind(
            a,
            'needle-right',
            needles.R,
            a.joints.handR,
            ['knit'],
            track,
            ids,
          );
          bind(
            a,
            'needle-left',
            needles.L,
            a.joints.handL,
            ['knit'],
            track,
            ids,
          );
          bind(
            a,
            'knitting',
            knittedGeo(color),
            a.joints.handL,
            ['knit'],
            track,
            ids,
          );
          bind(
            a,
            'yarn',
            yarnBall(color),
            a.joints.hip,
            ['knit'],
            track,
            ids,
          ).position.set(0, 0.06, 0.2);
        }
        if (info.play === 'read') {
          if (activity === 'newspapers')
            holdToRead(
              bind(
                a,
                'newspaper',
                newspaperGeo,
                a.joints.torso,
                ['read'],
                track,
                ids,
              ),
              0.82,
            );
          else {
            const book = holdToRead(
              bind(a, 'album', albumGeo, a.joints.torso, ['read'], track, ids),
            );
            const page = piece(a.spec.id + '-album-page', pageGeo, book);
            page.position.z = 0.004;
            pages.push({ root: page, actor: a });
          }
        }
        if (info.play === 'write')
          bind(
            a,
            activity === 'coloring' ? 'pencil' : 'paint-brush',
            activity === 'coloring' ? pencilGeo : brushGeo,
            a.joints.handR,
            ['write'],
            track,
            ids,
          );
        if (info.play === 'craft')
          bind(
            a,
            activity === 'flowers' ? 'flower-stem' : 'origami-paper',
            activity === 'flowers' ? stemGeo : origamiPaperGeo,
            activity === 'flowers' ? a.joints.handR : a.joints.handL,
            ['craft'],
            track,
            ids,
          );
        if (info.play === 'tea') {
          const cup = bind(
            a,
            'snack-tea-cup',
            cupGeo,
            a.joints.handR,
            ['tea'],
            track,
            ids,
          );
          cup.position.set(0.0072 - 0.04, -0.0716, -0.016);
          cup.rotation.x = Math.PI / 2;
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  let highlightList: DayHighlight[] = [];
  const DAY = 720;
  const tracks: Track[] = [...zones, ...tables];
  const qa = new T.Quaternion(),
    qb = new T.Quaternion(),
    sway = new T.Euler();
  const titleOf = (label: string, labelZh?: string) =>
    labelZh ? `${labelZh} ${label}` : label;
  function tick(time: number) {
    const t = ((time % DAY) + DAY) % DAY;
    let changed = false;
    for (const z of tracks) {
      let next = z.sessions[z.sessions.length - 1];
      for (const s of z.sessions)
        if (t >= s.start && t < s.end) {
          next = s;
          break;
        }
      if (next !== z.current) {
        z.current = next;
        changed = true;
      }
    }
    const session = floor.current!;
    root.userData.programId = session.id;
    if (changed) {
      screen.visible = !!formationOf(session)?.board;
      screenPanels.forEach(
        (g, i) => (g.visible = floorPrograms[i].id === session.id),
      );
      for (const d of decor)
        d.root.visible = zones.some((z) => decorOf(z.current!).includes(d.id));
      for (const s of tableSetMeshes) s.root.visible = false;
      for (const s of tableSetMeshes)
        if (s.track.current === s.entry) s.root.visible = true;
      highlightList = [
        ...zones.map(({ zone, current, position }): DayHighlight => {
          const s = current!,
            guest = instructorOf(s);
          return {
            kind: 'zone',
            id: zone.id,
            zoneId: zone.id,
            sessionId: s.id,
            title: titleOf(s.label, s.labelZh),
            label: s.label,
            labelZh: s.labelZh,
            subtitle: guest ? `with ${guest.name}` : 'with the activities team',
            position,
            follow: 'interaction:day-' + s.id,
          };
        }),
        ...tables.map(({ tableId, current, position }): DayHighlight => {
          const e = current!,
            info = catalog[e.activity];
          return {
            kind: 'table',
            id: tableId,
            tableId,
            activity: e.activity,
            title: titleOf(info?.label || e.activity, info?.labelZh),
            label: info?.label || e.activity,
            labelZh: info?.labelZh,
            subtitle: '',
            position,
            follow: `interaction:table-${tableId.replace(/^day-/, '')}-${e.index + 1}`,
          };
        }),
      ];
    }
    // Formation furniture arrives once the class has walked to its places.
    const settled = t >= session.start + transition;
    for (const l of layout)
      l.root.visible = settled && l.sessions.includes(session.id);
    // Each activity chair stands wherever its member sits down.
    for (const { actor, root: chair } of chairs) {
      chair.visible = actor.root.visible && !!actor.sample.seated;
      if (!chair.visible) continue;
      chair.position.copy(actor.root.position);
      chair.rotation.y = actor.root.rotation.y;
      chair.scale.copy(actor.root.scale);
    }
    for (const p of props)
      p.root.visible =
        (!p.world || p.actor.root.visible) &&
        p.actions.includes(p.actor.sample.action) &&
        (!p.sessions || p.sessions.includes(p.zone.current!.id));
    // Pieces and cards change hands on the motion's own phase.
    for (const m of timed) {
      if (!m.root.visible) continue;
      const g = m.actor.phase(m.action as Action, time + m.actor.spec.offset);
      m.root.visible = g >= m.from && g < m.to;
    }
    for (const p of pages) {
      const g = p.actor.phase('read', time + p.actor.spec.offset);
      p.root.visible = g >= 0.68 && g < 0.9;
      p.root.rotation.y = -Math.PI * T.MathUtils.clamp((g - 0.68) / 0.22, 0, 1);
    }
    // Ribbon silk trails from the wand tip in the dancer's upright frame,
    // swaying with the dance rhythm.
    for (const a of aligned) {
      if (!a.root.visible) continue;
      qa.identity();
      for (
        let o: T.Object3D | null = a.joint;
        o && o !== a.actor.root;
        o = o.parent
      )
        qa.premultiply(o.quaternion);
      a.root.position.copy(a.anchor);
      a.root.quaternion.copy(qa.invert());
      if (a.sway !== undefined) {
        const beat = (time + a.actor.spec.offset) * Math.PI * 0.5 + a.sway;
        sway.set(0, 0.22 * Math.cos(beat * 0.7), 0.3 * Math.sin(beat));
        a.root.quaternion.multiply(qb.setFromEuler(sway));
      }
    }
  }
  return {
    root,
    tick,
    chairs,
    props,
    decor,
    /**
     * Floating highlights at the last `tick`: one per zone (its session) and
     * one per game table (its current pastime).
     */
    highlights: (): DayHighlight[] => highlightList,
  };
}
