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
import { ERHU, type createCharacter } from './characters';

export { dayProgram, programAt } from './day-program';
type Person = ReturnType<typeof createCharacter> & {
  spec: ActorSpec;
  sample: ActorSample;
};
/** The floating highlight for the session running now in one day-room zone. */
export type DayHighlight = {
  id: string;
  zoneId: string;
  sessionId: string;
  /** `${labelZh} ${label}`, or the English label alone. */
  title: string;
  label: string;
  labelZh?: string;
  /** `with ${instructor.name}`, or the activities team for staff-led sessions. */
  subtitle: string;
  /** Label anchor: the zone anchor at its label height (world metres). */
  position: T.Vector3;
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
  ball: new T.SphereGeometry(1, 14, 9),
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
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
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
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2,
      rr = r * (0.96 + 0.04 * Math.cos(a * 20));
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
/** Décor ids of a session (sessions without décor type as `never[]`). */
const decorOf = (s: DaySession): string[] => s.decor;
type ZoneState = {
  zone: DayZone;
  sessions: DaySession[];
  current: DaySession | null;
  position: T.Vector3;
};
type PropEntry = DayProp & { zone: ZoneState; world: boolean };
type Aligned = {
  root: T.Object3D;
  actor: Person;
  joint: T.Object3D;
  /** Anchor in the joint frame. */
  anchor: T.Vector3;
  sway?: number;
};
/** Movable activity equipment. The original furniture/source plan remains a separate reference. */
export function buildDayRoom(actors: Person[]) {
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
  const ball = (
    parent: T.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    r: number,
  ) => {
    const mesh = new T.Mesh(new T.SphereGeometry(r, 12, 10), mat(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const rod = (
    parent: T.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
  ) => {
    const mesh = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), mat(color));
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  // A mobile screen stays outside the open exercise floor and circulation paths.
  const screen = new T.Group();
  screen.name = 'day-program-display';
  screen.position.set(-7, 0, 9.72);
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
  for (const actor of actors.filter(
    (a) => a.spec.programMode || ['seated-0', 'seated-1'].includes(a.spec.id),
  )) {
    const mode = actor.spec.programMode;
    if (mode && !['wheelchair', 'support'].includes(mode)) {
      const chair = new T.Group();
      chair.name = actor.spec.id + '-activity-chair';
      const station = program.stations.find(
        (s) => s.actorId === actor.spec.id,
      )!;
      chair.position.set(station.position[0], 0, station.position[1]);
      chair.rotation.y = station.heading;
      chair.scale.setScalar(actor.profile.height);
      // Stackable activity chairs: oatmeal seat on light oak legs.
      box(chair, '#dcd3c3', 0, 0.455, 0, 0.49, 0.05, 0.49);
      box(chair, '#dcd3c3', 0, 0.68, -0.23, 0.49, 0.42, 0.055);
      for (const x of [-0.19, 0.19])
        for (const z of [-0.18, 0.18])
          box(chair, '#b8996f', x, 0.22, z, 0.035, 0.44, 0.035);
      root.add(chair);
      chairs.push({ actor, root: chair });
    }
    const prop = (name: string, actions: string[], parent: T.Object3D) => {
      const group = new T.Group();
      group.name = actor.spec.id + '-' + name;
      parent.add(group);
      props.push({ actor, root: group, actions, zone: floor, world: false });
      return group;
    };
    // Shared lap surfaces permit wheelchair access without an extra fixed table.
    if (mode && mode !== 'support') {
      const lap = prop('lap-work-surface', ['write', 'craft'], actor.root);
      box(lap, '#cfb48c', 0, 0.78, 0.36, 0.59, 0.035, 0.38);
      box(lap, '#faf1de', 0, 0.804, 0.37, 0.44, 0.006, 0.28);
      const ink = prop('calligraphy-paper', ['write'], actor.root);
      for (let i = 0; i < 3; i++)
        box(
          ink,
          '#394c48',
          -0.12 + i * 0.1,
          0.812,
          0.39,
          0.024,
          0.006,
          0.14 - i * 0.025,
        );
      const collage = prop('paper-collage', ['craft'], actor.root);
      for (let i = 0; i < 6; i++) {
        const q = box(
          collage,
          ['#bb7c64', '#80a49e', '#d8c18c'][i % 3],
          -0.17 + (i % 3) * 0.14,
          0.815,
          0.29 + Math.floor(i / 3) * 0.15,
          0.085,
          0.009,
          0.08,
        );
        q.rotation.y = i * 0.3;
      }
    }
    const brush = prop('brush', ['write'], actor.joints.handR);
    brush.rotation.x = 2.05;
    rod(brush, '#9c7048', 0, 0.06, 0.035, 0.011, 0.17);
    rod(brush, '#233d3a', 0, -0.035, 0.035, 0.009, 0.02);
    const tablet = prop('tablet', ['device'], actor.joints.handL);
    box(tablet, '#34393b', 0.14, -0.03, 0.08, 0.3, 0.22, 0.025);
    box(tablet, '#bcd0cc', 0.14, -0.027, 0.096, 0.26, 0.18, 0.008);
    for (let i = 0; i < 4; i++)
      box(
        tablet,
        '#f4e6c7',
        0.075 + (i % 2) * 0.105,
        -0.073 + Math.floor(i / 2) * 0.09,
        0.103,
        0.062,
        0.048,
        0.005,
      );
    const shaker = prop('shaker', ['music'], actor.joints.handR);
    rod(shaker, '#b7804d', 0, -0.025, 0.03, 0.019, 0.15);
    ball(shaker, '#c79451', 0, 0.085, 0.03, 0.073);
    if (mode === 'leader') {
      const microphone = prop('microphone', ['perform'], actor.joints.handR);
      rod(microphone, '#3b403f', 0, -0.015, 0.045, 0.022, 0.18);
      ball(microphone, '#a4aba7', 0, -0.125, 0.045, 0.041);
    }
    const drum = prop('hand-drum', ['music'], actor.root);
    const drumY = mode === 'leader' ? 0.98 : 0.77;
    rod(drum, '#b57750', 0, drumY, 0.35, 0.16, 0.1);
    rod(drum, '#efe0ba', 0, drumY + 0.055, 0.35, 0.161, 0.018);
  }

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
    zone: ZoneState,
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
  const instructorActor = (session: DaySession) =>
    session.instructorId ? byId.get(session.instructorId) : undefined;
  const sessionIds = (zone: ZoneState, test: (s: DaySession) => boolean) =>
    zone.sessions.filter(test).map((s) => s.id);

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
          x: arts.zone.instructorSpot.position[0],
          z: arts.zone.instructorSpot.position[1],
          heading: arts.zone.instructorSpot.heading,
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
      (s) => s.seated && ['tea', 'listen'].includes(s.action),
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
        ['listen'],
        tea,
        paperSessions,
        true,
      );
      cup.position.set(x, TABLE_TOP + 0.006, z);
      const paper = bind(
        actor,
        'newspaper',
        newspaperGeo,
        actor.joints.hip,
        ['listen'],
        tea,
        paperSessions,
      );
      paper.position.set(0, 0.075, 0.33);
      paper.rotation.x = 0.95;
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
  // Festival lanterns hang from the timber truss over the class rows.
  const lanternRow = (tags: boolean) => {
    const k = new Kit(),
      rand = seeded(tags ? 31 : 17);
    // The bay over the teachers' spot stays open so that, from the iso view,
    // no lantern hangs in front of the guest teacher or the host.
    [-10.5, -9.2, -7.9, -4.0, -2.9].forEach((x, i) => {
      const z = 12.36,
        top = 2.78 + (i % 2) * 0.08;
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
    // Teaching easel beside the screen, on the presenter's side of the class.
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
    easel.position.set(-8.4, 0, 10.0);
    easel.rotation.y = 0.35;
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

  // -------------------------------------------------------------------------
  let highlightList: DayHighlight[] = [];
  const DAY = 720;
  const qa = new T.Quaternion(),
    qb = new T.Quaternion(),
    sway = new T.Euler();
  function tick(time: number) {
    const t = ((time % DAY) + DAY) % DAY;
    let changed = false;
    for (const z of zones) {
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
      screenPanels.forEach(
        (g, i) => (g.visible = floorPrograms[i].id === session.id),
      );
      for (const d of decor)
        d.root.visible = zones.some((z) => decorOf(z.current!).includes(d.id));
      highlightList = zones.map(({ zone, current, position }) => {
        const s = current!,
          guest = instructorOf(s);
        return {
          id: zone.id,
          zoneId: zone.id,
          sessionId: s.id,
          title: s.labelZh ? `${s.labelZh} ${s.label}` : s.label,
          label: s.label,
          labelZh: s.labelZh,
          subtitle: guest ? `with ${guest.name}` : 'with the activities team',
          position,
        };
      });
    }
    chairs.forEach(({ actor, root: chair }) => {
      chair.visible = actor.root.visible && !!actor.sample.seated;
      chair.scale.copy(actor.root.scale);
    });
    for (const p of props)
      p.root.visible =
        (!p.world || p.actor.root.visible) &&
        p.actions.includes(p.actor.sample.action) &&
        (!p.sessions || p.sessions.includes(p.zone.current!.id));
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
    /** Floating highlights for the sessions running at the last `tick`. */
    highlights: (): DayHighlight[] => highlightList,
  };
}
