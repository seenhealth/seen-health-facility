import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import program from '../data/day-program.json';
import type { ActorSpec, ActorSample } from './activity';
import type { createCharacter } from './characters';

export const dayProgram = program;
export function programAt(time: number) {
  const t = ((time % 720) + 720) % 720;
  return program.programs.find((p) => t >= p.start && t < p.end)!;
}
type Person = ReturnType<typeof createCharacter> & {
  spec: ActorSpec;
  sample: ActorSample;
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
  box(screen, '#34555b', 0, 1.44, 0, 1.95, 1.12, 0.09);
  box(screen, '#dcebe2', 0, 1.44, 0.054, 1.8, 0.97, 0.025);
  for (const x of [-0.63, 0.63]) {
    box(screen, '#647d7c', x, 0.63, 0, 0.045, 1.26, 0.05);
    box(screen, '#647d7c', x, 0.08, 0, 0.32, 0.06, 0.42);
  }
  const screenPanels = program.programs.map((p, i) => {
    const group = new T.Group();
    group.name = 'display-' + p.id;
    screen.add(group);
    const colors = [
      '#c7865c',
      '#4f9691',
      '#658fa1',
      '#7a9c72',
      '#b87166',
      '#5c9690',
      '#514b4a',
      '#cda168',
      '#9a7364',
      '#7b8b66',
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
    box(group, '#94b6aa', 0, 1.12, 0.085, 1.35, 0.06, 0.018);
    return group;
  });
  const chairs: { actor: Person; root: T.Group }[] = [];
  const props: { actor: Person; root: T.Group; actions: string[] }[] = [];
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
      box(chair, '#538f8a', 0, 0.455, 0, 0.49, 0.05, 0.49);
      box(chair, '#538f8a', 0, 0.68, -0.23, 0.49, 0.42, 0.055);
      for (const x of [-0.19, 0.19])
        for (const z of [-0.18, 0.18])
          box(chair, '#a6b6b0', x, 0.22, z, 0.035, 0.44, 0.035);
      root.add(chair);
      chairs.push({ actor, root: chair });
    }
    const prop = (name: string, actions: string[], parent: T.Object3D) => {
      const group = new T.Group();
      group.name = actor.spec.id + '-' + name;
      parent.add(group);
      props.push({ actor, root: group, actions });
      return group;
    };
    // Shared lap surfaces permit wheelchair access without an extra fixed table.
    if (mode && mode !== 'support') {
      const lap = prop('lap-work-surface', ['write', 'craft'], actor.root);
      box(lap, '#c9a578', 0, 0.78, 0.36, 0.59, 0.035, 0.38);
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
          ['#b6654c', '#4e918b', '#ddbc6c'][i % 3],
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
    box(tablet, '#294c57', 0.14, -0.03, 0.08, 0.3, 0.22, 0.025);
    box(tablet, '#9bc8c2', 0.14, -0.027, 0.096, 0.26, 0.18, 0.008);
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
      rod(microphone, '#365255', 0, -0.015, 0.045, 0.022, 0.18);
      ball(microphone, '#819992', 0, -0.125, 0.045, 0.041);
    }
    const drum = prop('hand-drum', ['music'], actor.root);
    const drumY = mode === 'leader' ? 0.98 : 0.77;
    rod(drum, '#b57750', 0, drumY, 0.35, 0.16, 0.1);
    rod(drum, '#efe0ba', 0, drumY + 0.055, 0.35, 0.161, 0.018);
  }
  function tick(time: number) {
    const session = programAt(time);
    root.userData.programId = session.id;
    screenPanels.forEach(
      (g, i) => (g.visible = program.programs[i].id === session.id),
    );
    chairs.forEach(({ actor, root: chair }) => {
      chair.visible = actor.root.visible && !!actor.sample.seated;
      chair.scale.copy(actor.root.scale);
    });
    props.forEach(
      ({ actor, root: prop, actions }) =>
        (prop.visible = actions.includes(actor.sample.action)),
    );
  }
  return { root, tick, chairs, props };
}
