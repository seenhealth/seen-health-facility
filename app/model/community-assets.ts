import * as T from 'three';
import {
  PING_PONG,
  PING_PONG_PERIOD,
  POOL,
  POOL_PERIOD,
  pingPongBall,
  poolCueBall,
} from './game-rhythm';
import type { Asset } from './schema';

// --- Lunch place settings (owner review 2026-10) ------------------------------
/** Clay palette shared with the day room (day-room.ts `C`) plus food tones. */
const F = {
  rice: '#f8f4e8',
  porcelain: '#f4f2ec',
  cobalt: '#3d5f93',
  tea: '#b47530',
  celadon: '#c3d8c8',
  jade: '#79a690',
  bamboo: '#c9a66c',
  bambooDark: '#a8884f',
  broth: '#c48a45',
  soy: '#3b2314',
  meat: '#8a4a2e',
  greens: '#4e8a4b',
  stems: '#bcd9a4',
  chili: '#c1372b',
  egg: '#f1cf6e',
  shrimp: '#e9a27e',
  scallion: '#6fa64f',
  bun: '#f6f1e6',
  noodle: '#eedcaa',
  tofu: '#f3ead6',
  lacquer: '#5a2a1e',
  orange: '#e8932f',
  youtiao: '#d9a35a',
};
/** The six mains, dealt in a seeded order so a table shows variety. */
export const DISHES = [
  'rice bowl',
  'noodle soup',
  'dumplings',
  'stir-fry plate',
  'congee',
  'steamed buns',
] as const;
/** Deterministic unit randoms from a seed (mulberry32). */
function seededRandom(seed: number) {
  let s = (Math.floor(seed) || 1) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<V>(list: V[], rand: () => number) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
type Mat = (color: string) => T.MeshStandardMaterial;
/** Small modelling helpers in a setting's local frame (diner at −Z). */
function kit(g: T.Group, mat: Mat) {
  const add = (geo: T.BufferGeometry, color: string, x: number, y: number, z: number) => {
    const m = new T.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  return {
    /** A box standing on `y`. */
    box: (x: number, y: number, z: number, a: number, b: number, c: number, color: string, ry = 0) => {
      const m = add(new T.BoxGeometry(a, b, c), color, x, y + b / 2, z);
      m.rotation.y = ry;
      return m;
    },
    /** A tapered cylinder standing on `y` (bowl, cup, plate). */
    cyl: (x: number, y: number, z: number, rTop: number, rBottom: number, len: number, color: string, seg = 18) =>
      add(new T.CylinderGeometry(rTop, rBottom, len, seg), color, x, y + len / 2, z),
    /** A porcelain rim in cobalt. */
    rim: (x: number, y: number, z: number, r: number, color = F.cobalt) => {
      const m = add(new T.TorusGeometry(r, 0.003, 6, 24), color, x, y, z);
      m.rotation.x = Math.PI / 2;
      return m;
    },
    ball: (x: number, y: number, z: number, r: number, color: string, sy = 1) => {
      const m = add(new T.SphereGeometry(r, 12, 8), color, x, y, z);
      m.scale.y = sy;
      return m;
    },
  };
}
type Kit = ReturnType<typeof kit>;
/** A rice bowl: porcelain, cobalt rim, a mound of rice with toppings. */
function riceBowl(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.074, 0.042, 0.048, F.porcelain);
  k.rim(x, 0.048, z, 0.074);
  k.ball(x, 0.05, z, 0.062, F.rice, 0.38);
  for (let i = 0; i < 4; i++)
    k.ball(x - 0.03 + i * 0.02, 0.07, z + (i % 2 ? 0.02 : -0.015), 0.012, i % 2 ? F.greens : F.meat);
}
/** A noodle soup: broth, noodles, greens and a porcelain spoon. */
function noodleSoup(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.092, 0.05, 0.058, F.porcelain, 22);
  k.rim(x, 0.058, z, 0.092);
  k.cyl(x, 0.05, z, 0.084, 0.084, 0.006, F.broth, 22);
  for (let i = 0; i < 5; i++)
    k.box(x - 0.03 + i * 0.015, 0.056, z, 0.004, 0.004, 0.09, F.noodle, 0.2 * i - 0.4);
  k.ball(x + 0.035, 0.06, z - 0.03, 0.016, F.greens, 0.6);
  k.ball(x - 0.04, 0.06, z + 0.025, 0.014, F.egg, 0.5);
  k.ball(x + 0.01, 0.06, z + 0.04, 0.013, F.meat, 0.5);
  const spoon = k.box(x + 0.06, 0.05, z + 0.02, 0.03, 0.012, 0.1, F.porcelain, -0.5);
  spoon.rotation.z = -0.25;
}
/** A bamboo steamer with four dumplings, its lid leaning beside it. */
function dumplings(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.078, 0.078, 0.045, F.bamboo, 24);
  k.cyl(x, 0.03, z, 0.07, 0.07, 0.016, F.bambooDark, 24);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4,
      px = x + Math.cos(a) * 0.036,
      pz = z + Math.sin(a) * 0.036;
    k.ball(px, 0.058, pz, 0.021, F.bun, 0.75);
    k.ball(px, 0.074, pz, 0.008, F.bun);
  }
  // The lid leans against the steamer, its low edge just on the table.
  const lid = k.cyl(x, 0, z, 0.08, 0.08, 0.018, F.bamboo, 24);
  lid.position.set(x + 0.1, 0.08, z + 0.03);
  lid.rotation.z = 1.2;
}
/** A plate of stir-fried greens and protein with a scoop of rice. */
function stirFry(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.115, 0.1, 0.014, F.porcelain, 24);
  k.rim(x, 0.014, z, 0.112);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05,
      r = 0.03 + (i % 2) * 0.03;
    k.ball(x + 0.03 + Math.cos(a) * r, 0.026, z + Math.sin(a) * r, 0.016, i % 3 ? F.greens : F.stems, 0.6);
  }
  for (let i = 0; i < 4; i++) k.ball(x + 0.02 + (i - 1.5) * 0.028, 0.03, z - 0.045 + (i % 2) * 0.02, 0.014, F.meat, 0.7);
  k.ball(x + 0.07, 0.028, z + 0.01, 0.007, F.chili);
  k.ball(x - 0.07, 0.03, z, 0.04, F.rice, 0.45);
}
/** A bowl of congee with scallion and a youtiao, and a spoon. */
function congee(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.082, 0.048, 0.052, F.porcelain, 22);
  k.rim(x, 0.052, z, 0.082);
  k.cyl(x, 0.044, z, 0.075, 0.075, 0.006, F.rice, 22);
  for (let i = 0; i < 6; i++) k.box(x - 0.04 + i * 0.016, 0.05, z + (i % 2 ? 0.02 : -0.02), 0.008, 0.003, 0.008, F.scallion, 0.3 * i);
  k.box(x + 0.01, 0.05, z, 0.1, 0.014, 0.016, F.youtiao, 0.5);
  const spoon = k.box(x - 0.05, 0.045, z + 0.03, 0.028, 0.01, 0.09, F.porcelain, 0.4);
  spoon.rotation.z = 0.3;
}
/** Three steamed buns on a small plate, one marked red (char siu bao). */
function steamedBuns(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.09, 0.08, 0.012, F.porcelain, 22);
  k.rim(x, 0.012, z, 0.088);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3,
      bx = x + Math.cos(a) * 0.038,
      bz = z + Math.sin(a) * 0.038;
    k.ball(bx, 0.036, bz, 0.03, F.bun, 0.8);
    if (i === 0) k.ball(bx, 0.058, bz, 0.006, F.chili, 0.3);
  }
}
/** A teacup: porcelain with a cobalt rim and tea inside. */
function teacup(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.034, 0.024, 0.045, F.porcelain, 14);
  k.rim(x, 0.045, z, 0.034);
  k.cyl(x, 0.038, z, 0.03, 0.03, 0.004, F.tea, 14);
}
/** Chopsticks on a rest, and a small soy dish. */
function chopsticks(k: Kit, x: number, z: number) {
  k.box(x, 0, z - 0.06, 0.03, 0.012, 0.012, F.celadon);
  for (const dx of [-0.006, 0.006]) {
    const c = k.box(x + dx, 0.012, z, 0.005, 0.005, 0.22, F.lacquer);
    c.rotation.x = -0.05;
  }
}
function soyDish(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.03, 0.024, 0.012, F.porcelain, 14);
  k.cyl(x, 0.009, z, 0.026, 0.026, 0.004, F.soy, 14);
}
const MAINS: ((k: Kit, x: number, z: number) => void)[] = [
  riceBowl,
  noodleSoup,
  dumplings,
  stirFry,
  congee,
  steamedBuns,
];
/** One diner's setting: the dealt main ahead, chopsticks right, tea and soy beside. */
function placeSetting(g: T.Group, mat: Mat, dish: number) {
  const k = kit(g, mat);
  MAINS[dish](k, 0, 0.01);
  chopsticks(k, 0.125, 0);
  teacup(k, 0.16, -0.08);
  soyDish(k, -0.13, -0.06);
}
/** A teapot and a plate of sliced oranges for the table to share. */
function sharedCentre(root: T.Group, mat: Mat, x: number, y: number, z: number, rand: () => number) {
  const g = new T.Group();
  g.position.set(x, y, z);
  g.rotation.y = rand() * Math.PI;
  root.add(g);
  const k = kit(g, mat);
  k.cyl(0.11, 0, 0, 0.05, 0.05, 0.004, F.porcelain, 16);
  k.ball(0.11, 0.07, 0, 0.055, F.porcelain, 0.95);
  k.rim(0.11, 0.075, 0, 0.052);
  k.cyl(0.11, 0.115, 0, 0.02, 0.028, 0.012, F.porcelain, 12);
  k.ball(0.11, 0.135, 0, 0.008, F.cobalt);
  const spout = k.box(0.165, 0.065, 0, 0.012, 0.012, 0.07, F.porcelain, 0);
  spout.rotation.z = 0.9;
  spout.rotation.y = Math.PI / 2;
  // The handle: a vertical ring on the side away from the spout.
  const handle = k.rim(0.055, 0.075, 0, 0.028, F.porcelain);
  handle.rotation.x = 0;
  k.cyl(-0.09, 0, 0, 0.08, 0.07, 0.012, F.porcelain, 22);
  k.rim(-0.09, 0.012, 0, 0.078);
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5;
    k.box(-0.09 + Math.cos(a) * 0.04, 0.012, Math.sin(a) * 0.04, 0.045, 0.022, 0.018, F.orange, -a);
  }
}

/** Reusable furniture for the participant activity wing. All dimensions are meters. */
export function buildCommunityAsset(spec: Asset) {
  if (
    ![
      'activity-tabletop',
      'meal-cart',
      'mahjong-table',
      'ping-pong-table',
      'pool-table',
      'wii-station',
      'karaoke-station',
    ].includes(spec.kind)
  )
    return null;
  const root = new T.Group();
  root.name = spec.kind;
  const materials = new Map<string, T.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!materials.has(color))
      materials.set(
        color,
        new T.MeshStandardMaterial({ color, roughness: 0.75 }),
      );
    return materials.get(color)!;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const ball = (x: number, y: number, z: number, r: number, color: string) => {
    const mesh = new T.Mesh(new T.SphereGeometry(r, 12, 8), mat(color));
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const [w, h, d] = spec.dimensions;
  // Lunch is Chinese and East Asian home cooking (owner review 2026-10):
  // every place setting is a different dish from `DISHES`, drawn in the day
  // room's clay palette, with chopsticks, a teacup and a soy dish. The dish
  // order is seeded by `parameters.seed` so each table differs.
  const rand = seededRandom(Number(spec.parameters?.seed ?? 1));
  const deck = shuffle([0, 1, 2, 3, 4, 5], rand);
  let dealt = 0;
  /** One place setting at (x, y, z), its diner on the −Z side when `angle` is 0. */
  const setting = (x: number, y: number, z: number, angle: number) => {
    const s = new T.Group();
    s.position.set(x, y, z);
    s.rotation.y = angle;
    root.add(s);
    placeSetting(s, mat, deck[dealt++ % deck.length]);
  };
  const plate = (x: number, y: number, z: number, angle = 0) =>
    setting(x, y, z, angle);
  if (spec.kind === 'activity-tabletop') {
    const style = spec.parameters?.activity;
    if (style === 'meal' || style === 'buffet') {
      if (Math.abs(w - d) < 0.15 && w < 1.3) {
        // A square table: one setting per chair side, each facing the
        // centre, with a teapot and sliced oranges to share.
        const r = w * 0.3;
        for (const [x, z] of [
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
        ])
          setting(x, 0, z, Math.atan2(-x, -z));
        sharedCentre(root, mat, 0, 0, 0, rand);
      } else {
        const n = Math.max(2, Math.round(Math.max(w, d) / 0.6));
        for (let i = 0; i < n; i++) {
          const along = ((i + 0.5) / n - 0.5) * Math.max(w, d),
            side = (i % 2 ? 1 : -1) * Math.min(w, d) * 0.22;
          const [x, z] = w > d ? [along, side] : [side, along];
          setting(x, 0, z, Math.atan2(-x, -z));
        }
      }
    } else if (style === 'craft') {
      const n = Math.max(2, Math.round(Math.max(w, d) / 0.7));
      for (let i = 0; i < n; i++)
        for (const side of [-1, 1]) {
          const x = w > d ? ((i + 0.5) / n - 0.5) * w : side * w * 0.25,
            z = w > d ? side * d * 0.25 : ((i + 0.5) / n - 0.5) * d;
          const paper = box(x, 0.012, z, 0.23, 0.008, 0.31, '#fff1d6');
          paper.rotation.y = ((i % 3) - 0.5) * 0.12;
          for (let j = 0; j < 3; j++)
            box(
              x - 0.07 + j * 0.055,
              0.022,
              z + 0.025,
              0.034,
              0.008,
              0.1,
              ['#bf7359', '#6e9f91', '#d7b663'][j],
            );
          box(x + 0.15, 0.027, z, 0.012, 0.012, 0.21, '#9a6950');
        }
      for (let i = 0; i < 4; i++)
        ball(
          (i - 1.5) * 0.07,
          0.045,
          0,
          0.033,
          ['#ba5f4c', '#558d90', '#dfb247', '#886c9c'][i],
        );
    } else if (style === 'games') {
      box(
        0,
        0.013,
        0,
        Math.min(0.45, w * 0.55),
        0.016,
        Math.min(0.45, d * 0.55),
        '#c9b391',
      );
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++)
          if ((i + j) % 2)
            box(
              (i - 3.5) * 0.045,
              0.025,
              (j - 3.5) * 0.045,
              0.045,
              0.008,
              0.045,
              '#6b806c',
            );
      for (let i = 0; i < 6; i++)
        ball(
          ((i % 3) - 1) * 0.09,
          0.055,
          (i < 3 ? -1 : 1) * 0.12,
          0.023,
          i < 3 ? '#eadcb7' : '#714e43',
        );
    } else {
      for (const x of [-w * 0.24, w * 0.24]) {
        const cup = new T.Mesh(
          new T.CylinderGeometry(0.05, 0.04, 0.09, 12),
          mat('#e6eee4'),
        );
        cup.position.set(x, 0.05, 0);
        root.add(cup);
      }
      ball(0, 0.06, 0, 0.075, '#c39a68');
      box(0, 0.01, 0.14, 0.17, 0.012, 0.12, '#e5cba4');
    }
    return root;
  }
  if (spec.kind === 'meal-cart') {
    for (const y of [0.22, 0.7]) box(0, y, 0, w, 0.035, d, '#a4b8b0');
    for (const x of [-w * 0.43, w * 0.43])
      for (const z of [-d * 0.42, d * 0.42]) {
        box(x, 0.47, z, 0.032, 0.9, 0.032, '#788f8b');
        ball(x, 0.06, z, 0.05, '#344b4a');
      }
    for (const z of [-0.25, 0.25]) plate(0, 0.735, z, Math.PI / 2);
    box(0, 0.28, 0, w * 0.75, 0.15, d * 0.65, '#d5cbb8');
    return root;
  }

  if (spec.kind.endsWith('table')) {
    for (const x of [-w * 0.4, w * 0.4])
      for (const z of [-d * 0.36, d * 0.36])
        box(x, h / 2, z, 0.09, h, 0.09, '#775b43');
    box(0, h - 0.07, 0, w, 0.12, d, '#826247');
  }
  if (spec.kind === 'mahjong-table') {
    box(0, h, 0, w - 0.09, 0.035, d - 0.09, '#477d68');
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < 13; i++) {
        const a = (side * Math.PI) / 2,
          u = (i - 6) * 0.052,
          v = 0.38;
        const tile = box(
          u * Math.cos(a) + v * Math.sin(a),
          h + 0.055,
          v * Math.cos(a) - u * Math.sin(a),
          0.043,
          0.07,
          0.027,
          '#f2ebcf',
        );
        tile.rotation.y = a;
        ball(
          tile.position.x,
          h + 0.095,
          tile.position.z,
          0.009,
          ['#b45e43', '#2f6b51', '#334f8a'][i % 3],
        );
      }
    for (let i = 0; i < 8; i++)
      box(
        ((i % 4) - 0.5) * 0.08 - 0.08,
        h + 0.035,
        (Math.floor(i / 4) - 0.5) * 0.08,
        0.04,
        0.025,
        0.06,
        '#f6f0d8',
      );
  }
  if (spec.kind === 'ping-pong-table') {
    box(0, h, 0, w, 0.025, d, '#3b8194');
    for (const z of [-d / 2 + 0.025, d / 2 - 0.025])
      box(0, h + 0.015, z, w, 0.006, 0.022, '#fff7df');
    for (const x of [-w / 2 + 0.02, w / 2 - 0.02])
      box(x, h + 0.015, 0, 0.022, 0.006, d, '#fff7df');
    box(0, h + 0.015, 0, w, 0.006, 0.015, '#fff7df');
    for (const z of [-d / 2, d / 2])
      box(0, h + 0.08, z, 0.025, 0.19, 0.025, '#263f4b');
    box(0, h + 0.11, 0, 0.015, 0.15, d, '#ccded9');
    const b = ball(0.4, h + 0.2, 0, 0.035, '#fff0c4');
    b.userData.gameMotion = 'ping-pong';
    b.userData.baseY = h;
  }
  if (spec.kind === 'pool-table') {
    box(0, h, 0, w - 0.15, 0.03, d - 0.15, '#3c8578');
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05])
      box(x, h + 0.04, 0, 0.09, 0.08, d, '#654631');
    for (const z of [-d / 2 + 0.05, d / 2 - 0.05])
      box(0, h + 0.04, z, w, 0.08, 0.09, '#654631');
    for (const x of [-w / 2 + 0.12, 0, w / 2 - 0.12])
      for (const z of [-d / 2 + 0.12, d / 2 - 0.12])
        ball(x, h + 0.027, z, 0.07, '#162b2b');
    for (let i = 0; i < 7; i++)
      ball(
        0.35 + (i % 3) * 0.065,
        h + 0.065,
        (Math.floor(i / 3) - 1) * 0.07,
        0.031,
        [
          '#e2b942',
          '#bd5348',
          '#3d73a6',
          '#f0e9d1',
          '#222e30',
          '#b370aa',
          '#d68847',
        ][i],
      );
    const b = ball(-POOL.tee, h + 0.065, POOL.laneZ, 0.031, '#fbefd4');
    b.userData.gameMotion = 'pool';
    box(0, 0.2, 0, w * 0.7, 0.25, d * 0.6, '#8a6846');
  }
  if (spec.kind.endsWith('station')) {
    box(0, 0.25, 0, w, 0.5, d, '#b38e61');
    const karaoke = spec.kind === 'karaoke-station';
    box(0, 1.22, 0, w, 0.85, 0.08, '#213d46');
    box(0, 1.22, 0.047, w - 0.09, 0.75, 0.012, karaoke ? '#304b70' : '#8cc5c7');
    if (karaoke) {
      for (let i = 0; i < 9; i++) {
        const q = box(
          -0.75 + i * 0.18,
          1.05,
          0.06,
          0.1,
          0.2 + (i % 3) * 0.08,
          0.01,
          ['#d8b572', '#c98992', '#88bbb1'][i % 3],
        );
        q.userData.gameMotion = 'equalizer';
        q.userData.phase = i;
      }
      for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) {
        box(x, 0.75, 0.04, 0.25, 0.5, 0.23, '#25414b');
        ball(x, 0.84, 0.17, 0.075, '#455e62');
      }
    } else {
      box(0, 1.1, 0.06, 0.27, 0.36, 0.012, '#decfa7');
      for (let i = 0; i < 6; i++)
        box(
          -0.12 + (i % 3) * 0.1,
          1.3 + Math.floor(i / 3) * 0.04,
          0.074,
          0.035,
          0.06,
          0.01,
          '#fff8e8',
        );
      box(0.43, 0.61, 0.07, 0.12, 0.21, 0.16, '#eee9da');
      const b = ball(0, 1, 0.075, 0.055, '#447fab');
      b.userData.gameMotion = 'bowling';
    }
  }
  return root;
}
/** The game action whose players keep a prop in motion. */
export const GAME_MOTION_ACTION: Record<string, string> = {
  'ping-pong': 'ping-pong',
  pool: 'billiards',
  equalizer: 'karaoke',
  bowling: 'wii',
};
/** How many players a prop needs before it moves. */
export const GAME_MOTION_PLAYERS: Record<string, number> = {
  'ping-pong': 2,
  pool: 2,
  equalizer: 1,
  bowling: 1,
};
/**
 * Move a game prop for care-day `time` (loop seconds). The ball flies on
 * the table's shared clock (`game-rhythm`), so it is at the paddle or the
 * cue when a player strikes. With fewer than `players` people at the game
 * the prop eases to rest: a ball lies still on an empty table.
 */
export function animateCommunityProp(
  object: T.Object3D,
  time: number,
  players = 2,
) {
  const phase = object.userData.phase || 0,
    kind = object.userData.gameMotion as string;
  const target = players >= (GAME_MOTION_PLAYERS[kind] ?? 1) ? 1 : 0,
    was = object.userData.live ?? 1,
    live = was + (target - was) * 0.08;
  object.userData.live = Math.abs(live - target) < 0.002 ? target : live;
  const mix = (rest: number, moving: number) =>
    rest + (moving - rest) * object.userData.live;
  switch (kind) {
    case 'ping-pong': {
      const top = object.userData.baseY as number,
        [x, y, z] = pingPongBall(time / PING_PONG_PERIOD),
        [rx, ry, rz] = PING_PONG.rest;
      object.position.set(mix(rx, x), top + mix(ry, y), mix(rz, z));
      break;
    }
    case 'pool':
      object.position.x = mix(-POOL.tee, poolCueBall(time / POOL_PERIOD));
      object.position.z = POOL.laneZ;
      break;
    case 'equalizer':
      object.scale.y = mix(0.6, 0.6 + Math.abs(Math.sin(time * 2 + phase)) * 0.8);
      break;
    case 'bowling':
      object.position.y = mix(1, 1 + ((time * 0.15) % 0.26));
      break;
  }
}
