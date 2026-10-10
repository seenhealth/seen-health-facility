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
  const plate = (x: number, y: number, z: number) => {
    const p = new T.Mesh(
      new T.CylinderGeometry(0.135, 0.125, 0.018, 18),
      mat('#f3eddf'),
    );
    p.position.set(x, y, z);
    root.add(p);
    ball(x - 0.035, y + 0.025, z, 0.052, '#d7be82');
    for (let j = 0; j < 3; j++)
      ball(
        x + 0.04,
        y + 0.033,
        z - 0.05 + j * 0.048,
        0.023,
        ['#7c9e54', '#db9154', '#7c9e54'][j],
      );
    box(x + 0.18, y + 0.012, z, 0.018, 0.012, 0.2, '#a6b3b0');
    const cup = new T.Mesh(
      new T.CylinderGeometry(0.045, 0.035, 0.1, 12),
      mat('#a4cec6'),
    );
    cup.position.set(x - 0.18, y + 0.045, z - 0.12);
    root.add(cup);
  };
  if (spec.kind === 'activity-tabletop') {
    const style = spec.parameters?.activity;
    if (style === 'meal' || style === 'buffet') {
      const n = Math.max(2, Math.round(Math.max(w, d) / 0.6));
      for (let i = 0; i < n; i++)
        plate(
          w > d ? ((i + 0.5) / n - 0.5) * w : 0,
          0.015,
          w > d ? 0 : ((i + 0.5) / n - 0.5) * d,
        );
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
    for (const z of [-0.25, 0.25]) plate(0, 0.73, z);
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
