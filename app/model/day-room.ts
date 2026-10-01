import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import program from '../data/day-program.json';
import type { ActorSpec, ActorSample } from './activity';
import type { Action, createCharacter } from './characters';

export const rotationDays = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type RotationDay = (typeof rotationDays)[number];
export type ProgramFormat = 'group' | 'small-group' | 'one-to-one';
/** One program as written in day-program.json (`programs` or `repertoire`). */
export type ProgramDefinition = {
  id: string;
  label: string;
  leaderAction: Action;
  action: Action;
  title: string;
  culture: string;
  access: string;
  cultures: string[];
  languages: string[];
  format: ProgramFormat;
  /** Base program whose equipment the day room shows (repertoire entries). */
  propsLike?: string;
  season?: string;
};
/** A program placed in one of the day's ten 72 s slots. */
export type DayProgramSession = ProgramDefinition & {
  start: number;
  end: number;
  /** Slot index, shared with the baked Monday loop. */
  slot: number;
  /** Monday program in the same slot; its `day-<id>` interaction track applies. */
  baseId: string;
  propsLike: string;
};
type DayProgramData = Omit<
  typeof program,
  'programs' | 'repertoire' | 'rotations'
> & {
  programs: (ProgramDefinition & { start: number; end: number })[];
  repertoire: ProgramDefinition[];
  rotations: Record<RotationDay, string[]>;
};
const data = program as unknown as DayProgramData;
const catalogue = new Map<string, ProgramDefinition>(
  [...data.programs, ...data.repertoire].map((p) => [p.id, p]),
);
/** Place a rotation's ids into the base programs' slot windows. */
export function resolveRotation(day: RotationDay): DayProgramSession[] {
  return data.rotations[day].map((id, slot) => {
    const base = data.programs[slot],
      p = catalogue.get(id);
    if (!p) throw new Error(`Unknown day program ${id} (${day} slot ${slot})`);
    return {
      ...p,
      start: base.start,
      end: base.end,
      slot,
      baseId: base.id,
      propsLike: p.propsLike || p.id,
    };
  });
}
let activeDay: RotationDay = 'mon';
const rotationListeners = new Set<() => void>();
/** Scene data plus the active day's sessions; Monday is the baked default. */
export const dayProgram = { ...data, programs: resolveRotation('mon') };
export function programRotation() {
  return activeDay;
}
export function isRotationDay(value: unknown): value is RotationDay {
  return (
    typeof value === 'string' &&
    (rotationDays as readonly string[]).includes(value)
  );
}
/** Switch the day room to another day's rotation; windows are re-derived. */
export function setProgramRotation(day: RotationDay) {
  if (day === activeDay) return;
  activeDay = day;
  dayProgram.programs = resolveRotation(day);
  rotationListeners.forEach((listener) => listener());
}
export function subscribeProgramRotation(listener: () => void) {
  rotationListeners.add(listener);
  return () => {
    rotationListeners.delete(listener);
  };
}
export function programAt(time: number) {
  const t = ((time % 720) + 720) % 720;
  return dayProgram.programs.find((p) => t >= p.start && t < p.end)!;
}
/** What a station does in a program, mirroring scripts/build-activity.py. */
function stationAction(session: ProgramDefinition, mode: string | undefined) {
  if (!mode) return null;
  if (mode === 'leader') return session.leaderAction;
  return mode === 'support' ? ('consult' as Action) : session.action;
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
  box(screen, '#3b403f', 0, 1.44, 0, 1.95, 1.12, 0.09);
  box(screen, '#eef0ea', 0, 1.44, 0.054, 1.8, 0.97, 0.025);
  for (const x of [-0.63, 0.63]) {
    box(screen, '#8f928d', x, 0.63, 0, 0.045, 1.26, 0.05);
    box(screen, '#8f928d', x, 0.08, 0, 0.32, 0.06, 0.42);
  }
  const screenPanels = data.programs.map((p, i) => {
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
  const chairs: { actor: Person; root: T.Group }[] = [];
  const props: { actor: Person; root: T.Group; actions: string[] }[] = [];
  for (const actor of actors.filter(
    (a) => a.spec.programMode || ['seated-0', 'seated-1'].includes(a.spec.id),
  )) {
    const mode = actor.spec.programMode;
    if (mode && !['wheelchair', 'support'].includes(mode)) {
      const chair = new T.Group();
      chair.name = actor.spec.id + '-activity-chair';
      const station = data.stations.find((s) => s.actorId === actor.spec.id)!;
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
      props.push({ actor, root: group, actions });
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
  const stations = actors.filter((a) => a.spec.programMode);
  function tick(time: number) {
    const session = programAt(time);
    root.userData.programId = session.id;
    root.userData.rotation = activeDay;
    screenPanels.forEach((g, i) => (g.visible = i === session.slot));
    // The baked loop carries Monday's gestures; other rotations re-pose the
    // group stations here, after the engine has posed everyone.
    for (const actor of stations) {
      const action = stationAction(session, actor.spec.programMode);
      if (action && action !== actor.sample.action)
        actor.pose(
          action,
          time + actor.spec.offset,
          actor.spec.programMode === 'wheelchair' ? 0.65 : 1,
          actor.sample.seated,
        );
    }
    chairs.forEach(({ actor, root: chair }) => {
      chair.visible = actor.root.visible && !!actor.sample.seated;
      chair.scale.copy(actor.root.scale);
    });
    // Equipment follows the base program the session is like; the quiet
    // tables keep their own actions.
    const equipment = catalogue.get(session.propsLike) || session;
    props.forEach(({ actor, root: prop, actions }) => {
      const action =
        stationAction(equipment, actor.spec.programMode) || actor.sample.action;
      prop.visible = actions.includes(action);
    });
  }
  return { root, tick, chairs, props };
}
