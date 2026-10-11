import { roleColors, roleNames, type Action } from './characters';
import type { createActivity } from './activity';
import { describeAsset } from './asset-catalog';
import type { CommunityLayer } from './community-layer';
import {
  careSettingById,
  instanceRooms,
  SETTING_ZONE_PREFIX,
  type CareSetting,
} from './community-settings';
import { insidePolygon } from './frame';
import { programAt } from './day-room';
import { targetKey, type InspectTarget } from './pick';
import type { Facility, Instance } from './schema';
import { clockLabel } from '../sim/clock';

/**
 * Card content for the 3D viewer's info card and tooltip: who a person is and
 * what they are doing (from the activity engine), what a piece of furniture
 * is for (asset-catalog.ts) and where things are (facility rooms, community
 * settings and the rooms of facilities stamped on them). Plain data; the
 * card component draws it.
 */
export type InspectContext = {
  model: Facility;
  activity: ReturnType<typeof createActivity>;
  community: CommunityLayer | null;
};
export type CardRow = { label: string; value: string; note?: string };
export type InspectCard = {
  key: string;
  kind: InspectTarget['kind'];
  overline: string;
  title: string;
  accent: string;
  /** A sentence under the title: what a piece of furniture is for. */
  lead?: string;
  rows: CardRow[];
  /** Small print: ids. */
  fine: string;
  /** The id the camera can follow (people and vehicles). */
  follow?: string;
};

const ACTIONS: Record<Action, string> = {
  walk: 'Walking',
  escort: 'Escorting',
  roll: 'Wheeling',
  ride: 'Riding',
  idle: 'Resting',
  consult: 'Consulting',
  treat: 'Giving care',
  exercise: 'Exercising',
  seated: 'Seated',
  tabletop: 'At the table',
  document: 'Charting',
  serve: 'Serving',
  greet: 'Greeting',
  perform: 'Performing',
  clap: 'Applauding',
  present: 'Presenting',
  conversation: 'Talking',
  device: 'On a device',
  dance: 'Dancing',
  'tai-chi': 'Tai chi',
  write: 'Writing',
  craft: 'Crafting',
  music: 'Playing music',
  listen: 'Listening',
  'ping-pong': 'Playing ping pong',
  billiards: 'Playing pool',
  wii: 'Playing Wii',
  mahjong: 'Playing mahjong',
  karaoke: 'Singing',
  qigong: 'Qigong',
  'fan-dance': 'Fan dancing',
  opera: 'Cantonese opera',
  erhu: 'Playing the erhu',
  tea: 'Having tea',
  'board-game': 'Playing a board game',
  watch: 'Watching',
  knit: 'Knitting',
  cards: 'Playing cards',
  read: 'Reading',
  phone: 'On the phone',
  cycle: 'Pedalling',
  audience: 'Listening to a song',
  massage: 'Giving a massage',
};
const MOBILITY = {
  cane: 'Walks with a cane',
  walker: 'Walks with a walker',
  wheelchair: 'Uses a wheelchair',
};
/** Seen's fleet teal, for vehicles and anything without a colour of its own. */
const FLEET = '#126d69';

/** Rooms of the facility stamped on a setting, in world coordinates (static). */
const stampedRooms = new Map<string, ReturnType<typeof instanceRooms>>();
const roomsOf = (s: CareSetting) => {
  let rooms = stampedRooms.get(s.id);
  if (!rooms) stampedRooms.set(s.id, (rooms = instanceRooms(s)));
  return rooms;
};
const settingOfZone = (zoneId: string | undefined) =>
  zoneId?.startsWith(SETTING_ZONE_PREFIX)
    ? careSettingById(zoneId.slice(SETTING_ZONE_PREFIX.length))
    : undefined;
/** "image-traced-position-and-footprint / height-inferred" → "Image traced position and footprint · height inferred". */
export function statusWords(status: string) {
  const s = status
    .split(' / ')
    .map((part) => (/^[a-z0-9-]+$/.test(part) ? part.replace(/-/g, ' ') : part))
    .join(' · ');
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
const metres = (v: number) => (v < 10 ? v.toFixed(2) : v.toFixed(1));
/** The room of a facility at a point on a level (named rooms, not shells). */
function roomAt(f: Facility, levelId: string, p: [number, number]) {
  return f.rooms.find(
    (r) =>
      r.levelId === levelId &&
      r.kind !== 'shell' &&
      insidePolygon(p, r.polygon),
  );
}
/** A stamped room's display name: the registry's plate label, else the room's own. */
const plateName = (s: CareSetting | undefined, id: string, name: string) => {
  const labels = s?.facility?.labels;
  return labels && typeof labels === 'object' && labels[id] ? labels[id] : name;
};

/** Where a person is now: room and zone, a community setting, or a vehicle. */
function personPlace(ctx: InspectContext, id: string) {
  const a = ctx.activity.actors.find((x) => x.spec.id === id);
  if (!a) return '';
  const s = a.sample;
  if (s.vehicleId && s.seat)
    return `In ${ctx.activity.vehicles.label(s.vehicleId)}`;
  const setting = settingOfZone(s.zoneId);
  if (setting) {
    const room = roomsOf(setting).find((r) =>
      insidePolygon([s.x, s.z], r.polygon),
    );
    return room ? `${room.label ?? room.name} · ${setting.name}` : setting.name;
  }
  if (s.zoneId === 'site') return 'Outside · street & vans';
  const zone = ctx.model.zones.find((z) => z.id === s.zoneId);
  const room = roomAt(ctx.model, a.spec.levelId, [s.x, s.z]);
  if (room && zone && room.name !== zone.name)
    return `${room.name} · ${zone.name}`;
  return room?.name ?? zone?.name ?? s.zoneId;
}
/** Program stations carry Monday's titles; other days show that day's session. */
function sessionTitle(
  ctx: InspectContext,
  programMode: string | undefined,
  title: string,
  zoneId: string,
  at: number,
) {
  const dayRoom = ctx.activity.data.dayRoomId || 'day';
  if (!programMode || zoneId !== dayRoom || ctx.activity.data.siteSpecific)
    return title;
  const cut = title.indexOf(' · ');
  return cut < 0 ? title : programAt(at).label + title.slice(cut);
}

function personCard(
  ctx: InspectContext,
  id: string,
  time: number,
): InspectCard | null {
  const d = ctx.activity.describeActor(id, time);
  if (!d) return null;
  const { spec, sample, segment, next, interaction } = d;
  const setting = settingOfZone(sample.zoneId) ?? settingOfZone(segment.zoneId);
  // The live sample is what the scene animates (paired staff and escorts
  // move on their partner's timing); the source segment fills in.
  const rows: CardRow[] = [
    {
      label: 'Now',
      value: sessionTitle(
        ctx,
        spec.programMode,
        sample.title || segment.title || ACTIONS[segment.action],
        segment.zoneId,
        time,
      ),
      note: ACTIONS[sample.action] ?? ACTIONS[segment.action],
    },
    { label: 'Where', value: personPlace(ctx, id) },
  ];
  if (next)
    rows.push({
      label: 'Next',
      value: sessionTitle(
        ctx,
        spec.programMode,
        next.segment.title || ACTIONS[next.segment.action],
        next.segment.zoneId,
        next.start + 0.5,
      ),
      note: clockLabel(next.start),
    });
  if (interaction) {
    const others = interaction.actorIds
      .filter((x) => x !== id)
      .map((x) => ctx.activity.actors.find((a) => a.spec.id === x)?.spec.label)
      .filter((x): x is string => !!x);
    // A pairing that lasts the whole loop (a therapist and their
    // participant) is described as a track, not as this moment: its people
    // say more than its description.
    const standing =
      interaction.end - interaction.start >= ctx.activity.data.duration;
    rows.push({
      label: 'With',
      value: interaction.label,
      note: [
        standing ? '' : interaction.description,
        others.length
          ? `With ${others.slice(0, 3).join(', ')}${others.length > 3 ? ` and ${others.length - 3} more` : ''}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  rows.push({
    label: 'Mobility',
    value: spec.mobility ? MOBILITY[spec.mobility] : 'Walks independently',
  });
  return {
    key: targetKey({ kind: 'person', id }),
    kind: 'person',
    overline: [roleNames[spec.role], setting?.short]
      .filter(Boolean)
      .join(' · '),
    title: spec.label,
    accent: roleColors[spec.role],
    rows,
    fine: `Track ${spec.id}`,
    follow: spec.id,
  };
}

/** The facility, object and setting of an object target. */
function objectOf(ctx: InspectContext, target: InspectTarget) {
  const setting = target.settingId
    ? careSettingById(target.settingId)
    : undefined;
  const facility = target.settingId
    ? ctx.community?.instance(target.settingId)?.facility
    : ctx.model;
  const object = facility?.objects.find((o) => o.id === target.id);
  return facility && object ? { facility, object, setting } : null;
}
function objectPlace(
  facility: Facility,
  object: Instance,
  setting?: CareSetting,
) {
  const room =
    facility.rooms.find((r) => r.id === object.roomId) ??
    roomAt(facility, object.levelId, [object.position[0], object.position[2]]);
  const zone = facility.zones.find((z) => z.id === object.zoneId);
  const roomName = room && plateName(setting, room.id, room.name);
  if (setting) return [roomName, setting.name].filter(Boolean).join(' · ');
  if (object.zoneId === 'site') return 'Outside · street & parking';
  return roomName && zone && roomName !== zone.name
    ? `${roomName} · ${zone.name}`
    : (roomName ?? zone?.name ?? object.zoneId);
}
function objectCard(
  ctx: InspectContext,
  target: InspectTarget,
): InspectCard | null {
  const found = objectOf(ctx, target);
  if (!found) return null;
  const { facility, object, setting } = found,
    asset = facility.assets[object.assetId],
    about = describeAsset(object.assetId, asset, {
      home: setting?.kind === 'home',
    }),
    zone = facility.zones.find((z) => z.id === object.zoneId);
  const rows: CardRow[] = [
    { label: 'Where', value: objectPlace(facility, object, setting) },
  ];
  if (asset) {
    const [w, h, d] = asset.dimensions,
      [sx, sy, sz] = object.scale;
    rows.push({
      label: 'Size',
      value: `${metres(w * sx)} × ${metres(d * sz)} × ${metres(h * sy)} m`,
      note: 'Width × depth × height',
    });
  }
  if (object.status)
    rows.push({ label: 'Evidence', value: statusWords(object.status) });
  return {
    key: targetKey(target),
    kind: 'object',
    overline: setting
      ? `Furniture · ${setting.short}`
      : 'Furniture & equipment',
    title: about.name,
    accent: setting?.accent ?? zone?.color ?? '#c97d12',
    lead: about.purpose,
    rows,
    fine: `${object.id} · ${object.assetId}${asset ? ` (${asset.kind})` : ''}`,
  };
}

function vehicleCard(
  ctx: InspectContext,
  id: string,
  time: number,
): InspectCard | null {
  const vehicles = ctx.activity.vehicles;
  if (!vehicles.has(id)) return null;
  const pose = vehicles.sample(id, time);
  const riders = ctx.activity.actors
    .filter((a) => a.sample.vehicleId === id && a.sample.seat && a.root.visible)
    .map((a) => a.spec.label);
  return {
    key: targetKey({ kind: 'vehicle', id }),
    kind: 'vehicle',
    overline: 'Vehicle',
    title: vehicles.label(id),
    accent: FLEET,
    rows: [
      {
        label: 'Now',
        value: pose?.phase || (pose?.visible ? 'On the road' : 'Off the map'),
      },
      {
        label: 'On board',
        value: riders.length ? riders.slice(0, 4).join(', ') : 'Nobody seated',
        note: riders.length > 4 ? `and ${riders.length - 4} more` : undefined,
      },
    ],
    fine: `Vehicle ${id}`,
    follow: id,
  };
}

/** Card content for a target at loop time `time`, or null when it no longer exists. */
export function describeTarget(
  ctx: InspectContext,
  target: InspectTarget,
  time = ctx.activity.getState().time,
): InspectCard | null {
  if (target.kind === 'person') return personCard(ctx, target.id, time);
  if (target.kind === 'vehicle') return vehicleCard(ctx, target.id, time);
  return objectCard(ctx, target);
}

/** Tooltip text: a name and a live second line. */
export function tooltipFor(ctx: InspectContext, target: InspectTarget) {
  if (target.kind === 'person') {
    const a = ctx.activity.actors.find((x) => x.spec.id === target.id);
    const role = a ? roleNames[a.spec.role] : '';
    return { label: a?.spec.label ?? target.id, detail: () => role };
  }
  if (target.kind === 'vehicle') {
    const vehicles = ctx.activity.vehicles;
    return {
      label: vehicles.label(target.id),
      detail: () =>
        vehicles.sample(target.id, ctx.activity.getState().time)?.phase ??
        'Vehicle',
    };
  }
  const found = objectOf(ctx, target);
  if (!found) return { label: target.id, detail: () => '' };
  const { facility, object, setting } = found,
    place = objectPlace(facility, object, setting).split(' · ')[0];
  return {
    label: describeAsset(object.assetId, facility.assets[object.assetId], {
      home: setting?.kind === 'home',
    }).name,
    detail: () => place,
  };
}
