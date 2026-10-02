import type { Facility, Vec3 } from './schema';
import type { ActorSpec, ActivityData, Segment } from './activity';
import type { Action } from './characters';
import { siteArrivalLayout, siteVanWindows } from './site-arrival';

type Route = Vec3[];
const length = (path: Route) =>
  path
    .slice(1)
    .reduce(
      (n, p, i) => n + Math.hypot(p[0] - path[i][0], p[2] - path[i][2]),
      0,
    );
function trimEnd(path: Route, gap: number): Route {
  const result = path.map((p) => [...p] as Vec3);
  while (result.length > 1) {
    const b = result.pop()!,
      a = result.at(-1)!;
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (d <= gap) {
      gap -= d;
      continue;
    }
    const t = (d - gap) / d;
    result.push(a.map((v, i) => v + (b[i] - v) * t) as Vec3);
    break;
  }
  return result;
}
const reverse = (path: Route) => [...path].reverse();

/** Reuse the two waiting participants so arrivals do not duplicate the lobby population. */
export function addSiteArrivalPeople(
  model: Facility,
  actors: ActorSpec[],
  interactions: ActivityData['interactions'],
) {
  const layout = siteArrivalLayout(model),
    vanWindows = siteVanWindows(model),
    olympic = model.contextStyle === 'olympic';
  const participants = actors.filter(
    (a) => a.roomId === 'ground-lobby' && a.role === 'participant',
  );
  const greeter = actors.find(
    (a) => a.roomId === 'ground-lobby' && a.role === 'aide',
  )!;
  const welcome = greeter.segments[0];
  // The reception aide stays clear of the arrival aisle and greets the new members.
  greeter.segments = [
    {
      ...welcome,
      start: 0,
      end: 720,
      action: 'greet',
      title: 'Welcome participants at reception',
    },
  ];
  const world = (x: number, y: number, z = -0.19): Vec3 => [
    layout.dock[0] +
      Math.cos(layout.heading) * x +
      Math.sin(layout.heading) * z,
    y,
    layout.dock[1] -
      Math.sin(layout.heading) * x +
      Math.cos(layout.heading) * z,
  ];
  const floorY = layout.streetY + 0.595;
  const rampRun = Math.sqrt(2.96 ** 2 - (floorY - layout.landingY) ** 2);
  const ramp: Route = [
    world(0.25, floorY),
    world(1.035, floorY),
    world(1.035 + rampRun, layout.landingY),
  ];
  const approach: Route = olympic
    ? [
        [-0.19, -0.115, 13.5],
        [-8.614, -0.115, 13.5],
        [-8.614, 0, 11.69],
        [-8.614, 0, 7.8],
        [-8.614, 0, 6.65],
      ]
    : [
        [16.65, -0.16, 10.22132],
        [15.80685, 0, 10.22132],
        [14.15, 0, 10.22132],
      ];

  for (const [index, participant] of participants.entries()) {
    const van = vanWindows[index],
      vehicleId = van.id;
    const wheelchair = index === 0;
    const original = participant.segments[0];
    const end = wheelchair
      ? olympic
        ? ([-12.8, 0, 6.65] as Vec3)
        : ([13.2, 0, 11.15] as Vec3)
      : ([original.path[0][0], 0, original.path[0][1]] as Vec3);
    const finish: Route = wheelchair
      ? olympic
        ? [end]
        : [[13.2, 0, 10.22132], end]
      : olympic
        ? [[-8.614, 0, end[2]], end]
        : [[13.2, 0, 10.22132], [13.2, 0, end[2]], end];
    const path = [...ramp, ...approach, ...finish];
    const escortPath = trimEnd(path, 1.2);
    const boardingPath = reverse(path),
      escortReturn = reverse(escortPath);
    const entry = path[0],
      handoff = escortPath.at(-1)!;
    const heading = wheelchair
      ? olympic
        ? Math.PI
        : -Math.PI / 2
      : original.heading;
    const segment = (
      start: number,
      end: number,
      action: Action,
      route: Route,
      title: string,
      extra: Partial<Segment> = {},
    ): Segment => ({
      start,
      end,
      action,
      path: route.map(([x, , z]) => [x, z]),
      heights: route.map(([, y]) => y),
      zoneId: 'ground-floor',
      heading,
      title,
      ...extra,
    });
    const ride = (start: number, end: number) =>
      segment(start, end, 'ride', [entry], `${van.name} · riding inside`, {
        visible: false,
        vehicleId,
      });
    const leave = van.unload[0] + 7,
      welcomed = van.unload[0] + 33;
    const pickup = van.boarding[0] + 16,
      boarded = van.boarding[1] - 4;
    participant.arrivalVehicleId = vehicleId;
    participant.label = `${van.name} · ${wheelchair ? 'Wheelchair participant' : 'Walking participant'}`;
    if (wheelchair) {
      participant.mobility = 'wheelchair';
      delete participant.seatId;
    }
    participant.segments = [
      ride(0, leave),
      segment(
        leave,
        welcomed,
        wheelchair ? 'roll' : 'walk',
        path,
        'Exit the van, cross the ramp and enter reception',
      ),
      segment(
        welcomed,
        pickup,
        wheelchair ? 'conversation' : 'listen',
        [end],
        'Welcomed at reception · waiting with the care team',
        { seated: true },
      ),
      segment(
        pickup,
        boarded,
        wheelchair ? 'roll' : 'walk',
        boardingPath,
        'Leave reception with the escort and board for home',
      ),
      ride(boarded, 720),
    ];
    const delayedStart = leave + 1.2 / (length(path) / (welcomed - leave));
    const returnAt = welcomed + 5,
      returned = van.unload[1] - 4;
    const fetchStart = van.boarding[0] + 3,
      fetchEnd = pickup - 2;
    const escortBoarded =
      pickup + ((boarded - pickup) * length(escortPath)) / length(path);
    const staff: ActorSpec = {
      id: `${model.contextStyle}-${vehicleId}-escort`,
      profileId: greeter.profileId,
      label: `${van.name} · Transport escort`,
      role: 'aide',
      variant: index + 4,
      levelId: 'ground',
      roomId: 'ground-lobby',
      offset: 0,
      arrivalVehicleId: vehicleId,
      segments: [
        ride(0, delayedStart),
        segment(
          delayedStart,
          welcomed,
          wheelchair ? 'escort' : 'walk',
          escortPath,
          'Accompany participant from van to reception',
        ),
        segment(welcomed, returnAt, 'greet', [handoff], 'Reception handoff'),
        segment(
          returnAt,
          returned,
          'walk',
          escortReturn,
          'Return to the van before departure',
        ),
        ride(returned, fetchStart),
        segment(
          fetchStart,
          fetchEnd,
          'walk',
          escortPath,
          'Collect participant for the ride home',
        ),
        segment(fetchEnd, pickup, 'greet', [handoff], 'Ready for pickup'),
        segment(
          pickup,
          escortBoarded,
          'walk',
          escortReturn,
          'Lead participant back to the van',
        ),
        ride(escortBoarded, 720),
      ],
    };
    actors.push(staff);
    for (const [suffix, label, start, end] of [
      ['dropoff', 'Exit van → reception handoff', leave, returned],
      ['pickup', 'Reception → board for home', fetchStart, boarded],
    ] as const)
      interactions.push({
        id: `${vehicleId}-${suffix}`,
        label: `${van.name} · ${label}`,
        category: 'arrivals',
        actorIds: [participant.id, staff.id],
        start,
        end,
        zoneId: 'site',
        description:
          'Participants and escorts share the van ramp and the plan-traced entry route.',
      });
  }
}
