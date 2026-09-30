import program from '../data/day-program.json';
import { addSiteArrivalPeople } from './site-arrival-people';
import {
  activityData,
  type ActorSpec,
  type ActivityData,
  type Segment,
} from './activity';
import { roleNames, type Action, type CharacterRole } from './characters';
import {
  center,
  polygonArea,
  type Facility,
  type Room,
  type Vec2,
} from './schema';

type Person = {
  role: CharacterRole;
  action: Action;
  seat?: boolean;
  program?: boolean;
  wheelchair?: boolean;
};
type Scene = { room: string; category: string; people: Person[] };
const person = (role: CharacterRole, action: Action, seat = false): Person => ({
  role,
  action,
  seat,
});
const members = (
  count: number,
  action: Action = 'conversation',
  rotating = false,
): Person[] =>
  Array.from({ length: count }, () => ({
    role: 'participant',
    action,
    seat: true,
    program: rotating,
  }));
const leader = (): Person => ({
  role: 'activities',
  action: 'present',
  program: true,
});
const room = (
  id: string,
  category: string,
  ...people: (Person | Person[])[]
): Scene => ({ room: id, category, people: people.flat() });

const olympicScenes: Scene[] = [
  room('ground-reception', 'arrivals', person('reception', 'greet', true)),
  room(
    'ground-lobby',
    'arrivals',
    person('aide', 'greet'),
    members(2, 'listen'),
  ),
  room('ground-transport', 'arrivals', person('driver', 'document', true)),
  room(
    'ground-day-west',
    'activities',
    person('activities', 'conversation'),
    members(2),
  ),
  room(
    'ground-pt',
    'rehab',
    person('pt', 'exercise'),
    person('participant', 'exercise'),
  ),
  room(
    'ground-activities',
    'activities',
    leader(),
    person('aide', 'greet'),
    members(5, 'clap', true),
    { role: 'participant', action: 'clap', program: true, wheelchair: true },
  ),
  room(
    'ground-memory',
    'activities',
    person('activities', 'conversation'),
    members(3, 'tabletop'),
  ),
  room('ground-staff-memory', 'clinical', person('nurse', 'document', true)),
  room('ground-library', 'activities', members(1, 'listen')),
  room(
    'ground-family',
    'coordination',
    person('social-worker', 'consult', true),
    members(1),
  ),
  room(
    'ground-dining',
    'meals',
    person('nutrition', 'serve'),
    members(5, 'tabletop'),
  ),
  room(
    'ground-kitchen',
    'meals',
    person('nutrition', 'serve'),
    person('nutrition', 'serve'),
  ),
  room(
    'ground-staff-break',
    'coordination',
    person('aide', 'conversation', true),
  ),
  room(
    'upper-clinic-reception',
    'arrivals',
    person('reception', 'greet', true),
  ),
  room('upper-clinic-wait', 'clinical', members(2, 'listen')),
  room(
    'upper-providers',
    'clinical',
    person('nurse', 'document', true),
    person('doctor', 'document', true),
  ),
  room('upper-meds', 'clinical', person('nurse', 'document')),
  ...['upper-exam-1', 'upper-exam-2', 'upper-exam-3'].map((id) =>
    room(id, 'clinical', person('doctor', 'consult'), members(1, 'consult')),
  ),
  room(
    'upper-gym',
    'rehab',
    person('pt', 'exercise'),
    person('ot', 'exercise'),
    person('participant', 'exercise'),
    { role: 'participant', action: 'exercise', wheelchair: true },
  ),
  room(
    'upper-treatment',
    'clinical',
    person('nurse', 'treat'),
    members(1, 'consult'),
  ),
  room(
    'upper-admin',
    'coordination',
    person('coordinator', 'document', true),
    person('social-worker', 'document', true),
  ),
  room(
    'upper-meeting',
    'coordination',
    person('coordinator', 'conversation', true),
    person('nurse', 'conversation', true),
  ),
  room(
    'upper-break',
    'coordination',
    person('aide', 'conversation', true),
    person('nurse', 'conversation', true),
  ),
];
const alveareScenes: Scene[] = [
  room('ground-reception', 'arrivals', person('reception', 'greet', true)),
  room(
    'ground-lobby',
    'arrivals',
    person('aide', 'greet'),
    members(2, 'listen'),
  ),
  room(
    'ground-day',
    'activities',
    leader(),
    person('aide', 'conversation'),
    person('nurse', 'consult'),
    members(9, 'clap', true),
    { role: 'participant', action: 'clap', program: true, wheelchair: true },
  ),
  room(
    'ground-kitchen',
    'meals',
    person('nutrition', 'serve'),
    person('nutrition', 'serve'),
  ),
  room(
    'ground-rehab',
    'rehab',
    person('pt', 'exercise'),
    person('ot', 'exercise'),
    person('participant', 'exercise'),
    { role: 'participant', action: 'exercise', wheelchair: true },
  ),
  room(
    'ground-staff',
    'coordination',
    person('coordinator', 'document', true),
    person('nurse', 'document', true),
    person('aide', 'conversation', true),
  ),
  room(
    'ground-staff-office',
    'coordination',
    person('social-worker', 'consult', true),
    members(1),
  ),
  room(
    'ground-office',
    'coordination',
    person('coordinator', 'document', true),
  ),
  room(
    'ground-conference',
    'coordination',
    person('coordinator', 'conversation', true),
    person('social-worker', 'conversation', true),
  ),
  room(
    'ground-garden',
    'activities',
    person('aide', 'conversation'),
    person('participant', 'listen'),
  ),
];

export function insideRoom([x, z]: Vec2, polygon: Vec2[]) {
  let odd = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      odd = !odd;
  }
  return odd;
}
function distanceToEdge(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}
const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Room-local clearances keep movement away from partitions, equipment and other cast members. */
export function roomPlacement(model: Facility, r: Room) {
  const objects = model.objects.filter(
    (o) =>
      o.levelId === r.levelId &&
      (o.layer === 'furniture' || o.layer === 'architecture') &&
      o.position[1] < 1.7 &&
      !['plan-door', 'sign', 'folding-partition'].includes(
        model.assets[o.assetId].kind,
      ),
  );
  const nested = model.rooms.filter(
    (other) =>
      other.id !== r.id &&
      other.levelId === r.levelId &&
      polygonArea(other.polygon) < polygonArea(r.polygon) - 0.1,
  );
  function clear(p: Vec2, radius = 0.34, seatId?: string) {
    if (
      !insideRoom(p, r.polygon) ||
      nested.some((other) => insideRoom(p, other.polygon))
    )
      return false;
    if (
      model.walls.some(
        (w) =>
          w.levelId === r.levelId &&
          distanceToEdge(p, w.a, w.b) < radius + w.thickness / 2,
      )
    )
      return false;
    return !objects.some((o) => {
      if (o.id === seatId) return false;
      const spec = model.assets[o.assetId];
      if (spec.dimensions[1] < 0.2) return false;
      const dx = p[0] - o.position[0],
        dz = p[1] - o.position[2];
      const x = Math.cos(o.rotation) * dx - Math.sin(o.rotation) * dz;
      const z = Math.sin(o.rotation) * dx + Math.cos(o.rotation) * dz;
      const footprints = o.navigationFootprints || [
        [
          0,
          0,
          spec.dimensions[0] * o.scale[0],
          spec.dimensions[2] * o.scale[2],
        ],
      ];
      return footprints.some(
        ([cx, cz, w, d]) =>
          Math.hypot(
            Math.max(0, Math.abs(x - cx) - w / 2),
            Math.max(0, Math.abs(z - cz) - d / 2),
          ) < radius,
      );
    });
  }
  return { clear, objects };
}

export function buildSiteActivityData(model: Facility): ActivityData {
  const olympic = model.contextStyle === 'olympic';
  const scenes = olympic ? olympicScenes : alveareScenes;
  const actors: ActorSpec[] = [],
    interactions: ActivityData['interactions'] = [];
  // Reserve entire short routes, so no later person or route is placed through them.
  const reserved: { point: Vec2; level: string; radius: number }[] = [];
  const usedSeats = new Set<string>();
  const available = (p: Vec2, level: string, radius: number) =>
    reserved.every(
      (v) => v.level !== level || distance(v.point, p) > v.radius + radius,
    );
  for (const scene of scenes) {
    const r = model.rooms.find((r) => r.id === scene.room);
    if (!r) throw Error(`Activity room missing: ${model.id}/${scene.room}`);
    const { clear, objects } = roomPlacement(model, r),
      c = center(r.polygon);
    const elevation =
      (model.levels.find((l) => l.id === r.levelId)?.elevation || 0) +
      (model.zones.find((z) => z.id === r.zoneId)?.elevationOffset || 0);
    const seats = objects.filter(
      (o) =>
        o.roomId === r.id &&
        ['upholstered-chair', 'mesh-chair', 'lounge-chair'].includes(
          model.assets[o.assetId].kind,
        ) &&
        !o.assetId.includes('stool'),
    );
    const work = objects.filter(
      (o) =>
        o.roomId === r.id &&
        /desk|counter|table|plinth|bars|stepper/.test(
          model.assets[o.assetId].kind,
        ),
    );
    const xs = r.polygon.map((p) => p[0]),
      zs = r.polygon.map((p) => p[1]);
    const grid: Vec2[] = [];
    for (let x = Math.min(...xs) + 0.4; x < Math.max(...xs) - 0.25; x += 0.36)
      for (let z = Math.min(...zs) + 0.4; z < Math.max(...zs) - 0.25; z += 0.36)
        if (clear([x, z])) grid.push([x, z]);
    const ids: string[] = [];
    for (const [index, person] of scene.people.entries()) {
      const radius = person.wheelchair ? 0.5 : 0.34;
      const scored = (p: Vec2) => {
        const closestPerson = Math.min(
          3,
          ...reserved
            .filter((v) => v.level === r.levelId)
            .map((v) => distance(v.point, p)),
        );
        const toWork = work.length
          ? Math.min(
              ...work.map((o) => distance(p, [o.position[0], o.position[2]])),
            )
          : distance(p, c);
        return toWork * 0.5 + distance(p, c) * 0.08 - closestPerson * 0.7;
      };
      const seat = person.seat
        ? seats
            .filter(
              (o) =>
                !usedSeats.has(o.id) &&
                clear([o.position[0], o.position[2]], 0.2, o.id) &&
                available([o.position[0], o.position[2]], r.levelId, radius),
            )
            .sort(
              (a, b) =>
                scored([a.position[0], a.position[2]]) -
                scored([b.position[0], b.position[2]]),
            )[0]
        : undefined;
      const candidates = grid
        .filter((p) => clear(p, radius) && available(p, r.levelId, radius))
        .sort((a, b) => scored(a) - scored(b));
      const p: Vec2 | undefined = seat
        ? [seat.position[0], seat.position[2]]
        : candidates[0];
      if (!p)
        throw Error(`No clear staff placement: ${model.id}/${r.id}/${index}`);
      if (seat) usedSeats.add(seat.id);
      const target = work.length
        ? [...work].sort(
            (a, b) =>
              distance(p, [a.position[0], a.position[2]]) -
              distance(p, [b.position[0], b.position[2]]),
          )[0]
        : null;
      const heading = seat
        ? seat.rotation + Math.PI
        : Math.atan2(
            (target?.position[0] ?? c[0]) - p[0],
            (target?.position[2] ?? c[1]) - p[1],
          );
      let q = p;
      // Short local task trips only. No inferred crossings through doors or between floors.
      if (
        !seat &&
        !person.program &&
        !person.wheelchair &&
        person.role !== 'participant'
      ) {
        q =
          candidates.find((candidate) => {
            const length = distance(p, candidate);
            if (length < 0.9 || length > 2.0) return false;
            return Array.from({ length: 13 }, (_, k) => k / 12).every((t) => {
              const point: Vec2 = [
                p[0] + (candidate[0] - p[0]) * t,
                p[1] + (candidate[1] - p[1]) * t,
              ];
              return (
                clear(point, radius) && available(point, r.levelId, radius)
              );
            });
          }) || p;
      }
      for (let k = 0; k <= 12; k++)
        reserved.push({
          point: [
            p[0] + ((q[0] - p[0]) * k) / 12,
            p[1] + ((q[1] - p[1]) * k) / 12,
          ],
          level: r.levelId,
          radius,
        });
      const stationary = (
        start: number,
        end: number,
        action: Action,
        at = p,
        title = '',
      ): Segment => ({
        start,
        end,
        action,
        path: [at],
        heights: [elevation],
        zoneId: r.zoneId,
        heading,
        seated: !!seat || !!person.wheelchair,
        title: title || `${roleNames[person.role]} · ${r.name}`,
      });
      const segments: Segment[] = person.program
        ? program.programs.map((s) =>
            stationary(
              s.start,
              s.end,
              (person.role === 'activities'
                ? s.leaderAction
                : s.action) as Action,
              p,
              s.label,
            ),
          )
        : [];
      if (!person.program)
        for (let start = 0; start < 720; start += 120) {
          const walking = distance(p, q) > 0.1;
          const task: Action =
            person.seat &&
            !seat &&
            ['seated', 'tabletop', 'listen'].includes(person.action)
              ? 'conversation'
              : person.action;
          segments.push(stationary(start, start + 80, task));
          segments.push({
            ...stationary(start + 80, start + 88, walking ? 'walk' : task),
            path: [p, q],
            heights: [elevation, elevation],
            title: walking ? `Move within ${r.name}` : r.name,
          });
          segments.push(
            stationary(
              start + 88,
              start + 112,
              person.role === 'participant' ? task : 'consult',
              q,
            ),
          );
          segments.push({
            ...stationary(start + 112, start + 120, walking ? 'walk' : task),
            path: [q, p],
            heights: [elevation, elevation],
            title: walking ? 'Return to station' : r.name,
          });
        }
      const id = `${model.contextStyle}-${r.id}-${person.role}-${index + 1}`;
      const sharedProfiles = activityData.actors.filter(
        (a) => a.role === person.role,
      );
      const profile = sharedProfiles[index % (sharedProfiles.length || 1)];
      actors.push({
        id,
        role: person.role,
        profileId: profile?.profileId || profile?.id,
        variant: actors.length % 8,
        label: `${roleNames[person.role]} · ${r.name}${index ? ` ${index + 1}` : ''}`,
        levelId: r.levelId,
        roomId: r.id,
        offset: 0,
        segments,
        seatId: seat?.id,
        ...(person.wheelchair ? { mobility: 'wheelchair' as const } : {}),
      });
      ids.push(id);
    }
    // Face the people being supported, while seated staff retain their workstation orientation.
    const cast = actors.filter((a) => ids.includes(a.id));
    for (const a of cast) {
      if (a.seatId) continue;
      const audience = cast.filter(
        (other) =>
          other !== a &&
          (a.role === 'participant'
            ? ['pt', 'ot', 'doctor', 'nurse', 'social-worker'].includes(
                other.role,
              )
            : other.role === 'participant'),
      );
      if (!audience.length) continue;
      const target = center(audience.map((other) => other.segments[0].path[0]));
      for (const segment of a.segments)
        if (segment.path.length === 1)
          segment.heading = Math.atan2(
            target[0] - segment.path[0][0],
            target[1] - segment.path[0][1],
          );
    }
    interactions.push({
      id: r.id,
      label: r.name,
      category: scene.category,
      actorIds: ids,
      start: 0,
      end: 720,
      zoneId: r.id,
      description: `Representative ${scene.category} activity in ${r.name}.`,
    });
  }
  addSiteArrivalPeople(model, actors, interactions);
  const dayRoomId = olympic ? 'ground-activities' : 'ground-day';
  const dayActors = actors
    .filter((a) => a.roomId === dayRoomId)
    .map((a) => a.id);
  interactions.push(
    ...program.programs.map((p) => ({
      id: `day-${p.id}`,
      label: p.label,
      category: 'activities',
      actorIds: dayActors,
      start: p.start,
      end: p.end,
      zoneId: dayRoomId,
      description: p.title,
    })),
  );
  const views = olympic
    ? [
        ['ground-reception', 'Reception'],
        ['ground-activities', 'Activities'],
        ['ground-memory', 'Memory care'],
        ['ground-dining', 'Meals'],
        ['upper-providers', 'Doctors & nurses'],
        ['upper-gym', 'PT & OT'],
        ['upper-admin', 'Coordination'],
        ['upper-break', 'Staff break'],
        ['all', 'Whole center'],
      ]
    : [
        ['ground-reception', 'Reception'],
        ['ground-day', 'Activities'],
        ['ground-rehab', 'PT & OT'],
        ['ground-kitchen', 'Meals'],
        ['ground-staff', 'Staff & coordination'],
        ['ground-garden', 'Garden'],
        ['all', 'Whole center'],
      ];
  return {
    ...activityData,
    actors,
    interactions,
    roles: [...new Set(actors.map((a) => a.role))],
    siteSpecific: true,
    dayRoomId,
    views: [
      { id: 'site', label: 'Vans & drop-off' },
      ...views.map(([id, label]) => ({ id, label })),
    ],
    description: `Representative care day for ${model.name}; staff and participants use the current room and furniture layout.`,
    evidence: [
      'Shared Alhambra character models and activity repertoire.',
      'Room placements and short local paths checked against current partitions and furniture.',
      'Illustrative staffing and timing, not an employee roster or operating plan.',
    ],
  };
}
