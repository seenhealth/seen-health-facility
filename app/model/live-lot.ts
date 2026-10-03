/**
 * Live lot: Seen's real vehicles on the Alhambra lot, driven by messages from
 * a parent page (the dispatch app's VTC view). Each vehicle is a fleet van,
 * a lift van, an SUV or a sedan body; it drives in from the south end of the
 * west street as its ETA counts down, turns in through the Ethel Avenue curb
 * cut, stops at the drop-off, opens up (sliding door, then the ramp on a lift
 * van, the driver's door while the ramp is out), lets its riders off one by
 * one (each a figure who walks, or rolls up the accessible ramp, into the
 * lobby), closes up, backs into a bay, waits, and pulls out by the alley
 * driveway and fades when the dispatch app says it is gone. Riders marked as
 * boarding walk out of the lobby to a parked car, whose door opens for them.
 * Vehicles accelerate and brake rather than start and stop dead, their wheels
 * turn, and at night their lamps and headlight beams come on while they move.
 * Positions come from the fleet's own route pieces, so the manoeuvres are the
 * reviewed ones (4 m arcs, back-in stalls, one driveway).
 */
import * as T from 'three';
import {
  ARRIVAL,
  buildArrivalVan,
  entryLeafZ,
  fadeVehicle,
  updateArrivalVan,
} from './arrival';
import {
  ANGLED,
  angledApproach,
  FLEET_LOT,
  FLEET_VAN,
  WEST_STALLS,
  fleetParking,
  fleetRoutes,
  type FleetLeg,
} from './alhambra-fleet';
import {
  addVanLamps,
  buildLiveCar,
  setLamps,
  type LiveCar,
  type VehicleLamps,
} from './live-vehicles';
import { createWalkers, type WalkPoint } from './live-walkers';
import { DROP_OFF } from './alhambra-exterior';
import { FLEET_VAN_RAMP } from './photo-assets';
import type { Facility } from './schema';
import { pathAt, type Piece } from './vehicle-path';
import { routeAround, type Footprint } from './walk-route';

export type LiveKind = 'van' | 'wav' | 'suv' | 'sedan';
export type LiveState = 'inbound' | 'on-lot' | 'away';
export type LivePerson = {
  name: string;
  initials: string;
  photo?: string;
  risk?: 'high' | 'assisted' | 'standard';
  wheelchair?: boolean;
  boarding?: boolean;
  /** Full name, a second line (native name) and detail lines for the card shown when the avatar is hovered in an opened bubble. */
  fullName?: string;
  subtitle?: string;
  lines?: string[];
};
/** Where an avatar was painted on a plate's canvas, so a hover over the plate can find the person. */
type AvatarRect = { x: number; y: number; w: number; h: number; p: LivePerson };
export type LiveVehicle = {
  id: string;
  kind: LiveKind;
  /** The driver and the participants on board (arriving) or about to board (on the lot), drawn as avatars above the car. */
  driver?: LivePerson;
  riders?: LivePerson[];
  /** Vehicle number and driver, drawn above the body. */
  label: string;
  /** Second line: ETA, riders, next departure. */
  detail?: string;
  /** Detail lines shown when the vehicle's plate is opened (`setExpanded`): phone, device, runs, next departure, shift, advice. */
  lines?: string[];
  state: LiveState;
  /** Minutes to the center while inbound; drives how far along the approach the vehicle is drawn. */
  etaMinutes?: number | null;
  /**
   * A new inbound vehicle drives into view instead of appearing where its ETA puts it: with an ETA it comes in from
   * the edge of the map up the street, with none (or 0) from just short of the lot entrance (the simulator's).
   */
  fromOutside?: boolean;
  highlight?: boolean;
};
export type LiveMessage = {
  type: 'seen-live-lot';
  vehicles: LiveVehicle[];
  capacity?: number;
  clock?: string;
  /** Vehicle id the camera should centre on and follow; absent or null for the whole-lot shot. */
  follow?: string | null;
};

/** An inbound vehicle this many minutes out waits, faint, at the south end of the west street. */
const HORIZON_MIN = 12;
const SPEED = { street: 9, lot: 3, reverse: 1.8 };
/** m/s² pulling away and braking; braking is firmer, as it is in a car. */
const ACCEL = 1.4,
  DECEL = 1.9;
/** Door, ramp and cab-door travel per second (fraction of open). */
const RATE = { door: 0.85, ramp: 0.42, cab: 1.1, entry: 2.4 };
/** Seconds between riders stepping onto the ramp, and the pause before closing up after the last one. */
const ALIGHT_GAP = { walk: 2.4, wheelchair: 4.2, linger: 2.5 };
/** Walking speeds on the lot (m/s): seniors on foot, a wheelchair, and anyone on a ramp. */
const WALK = { foot: 1.0, wheelchair: 0.8, ramp: 0.5 };
/** Label plate in metres at the default zoom; `setLabelScale` keeps it the same size on screen when the camera zooms. */
const LABEL_W = 14,
  LABEL_H = 3.5;
/** Canvas pixels per metre of label; the plate grows in width with the crew it carries. */
const LABEL_PX = 1024 / LABEL_W;
/** The opened bubble is drawn this much larger on screen than the compact plates, so its detail lines read easily. */
const EXPAND_BOOST = 1.6;
const RING_COLOR = {
  high: '#c0392b',
  assisted: '#d08214',
  standard: '',
} as const;
/** Avatar photos by url, loaded once; a failed load falls back to initials. */
const photos = new Map<string, HTMLImageElement | null>();
function photoOf(
  url: string | undefined,
  onLoad: () => void,
): HTMLImageElement | null {
  if (!url) return null;
  if (photos.has(url)) return photos.get(url) ?? null;
  photos.set(url, null);
  const img = new Image();
  // Same-origin bytes are expected (the dispatch app serves the photo itself); a cross-origin host without CORS
  // then fails to load and falls back to initials instead of tainting the label canvas, which WebGL would refuse.
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    photos.set(url, img);
    onLoad();
  };
  img.onerror = () => photos.set(url, null);
  img.src = url;
  return null;
}
const L = FLEET_LOT;
/**
 * The lot's twelve spaces (no street parking: the fleet's curb spots on Ethel are its own): 0-4 the fleet's back-in
 * bays, 5-6 the west row's two stalls north of them, 7-11 the angled stalls along the building, which take cars only.
 * Vans fill the bays first, cars the angled stalls first. With none free a vehicle leaves rather than park off the lot.
 */
const BAYS = 5;
const SPOTS = BAYS + WEST_STALLS.length + ANGLED.centres.length;
const isWest = (i: number) => i >= BAYS && i < BAYS + WEST_STALLS.length;
const angledIndex = (i: number) => i - BAYS - WEST_STALLS.length;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const tween = (v: number, target: number, rate: number, dt: number) =>
  v < target
    ? Math.min(target, v + rate * dt)
    : Math.max(target, v - rate * dt);

/** Heights on the way in: the lot, the accessible ramp's middle landing, and the lobby landing at floor level. */
const GROUND = L.streetY,
  MID = -0.115,
  LANDING = 0;
/** Inside the lobby doors, where a walker vanishes or appears. */
const INSIDE: WalkPoint = {
  x: ARRIVAL.door[0] + 0.55,
  z: ARRIVAL.door[1],
  y: LANDING,
};
const DOOR: WalkPoint = { x: ARRIVAL.door[0], z: ARRIVAL.door[1], y: LANDING };
/** On foot: up the landing's steps from the lot (they face away from the wall), along the landing and through the doors (fleet-crew.ts OFFICE.exit). */
const STEPS_Z = (DROP_OFF.steps.z0 + DROP_OFF.steps.z1) / 2;
const STEPS_IN: WalkPoint[] = [
  { x: DROP_OFF.steps.x0 - 0.35, z: STEPS_Z, y: GROUND },
  { x: DROP_OFF.steps.x1, z: STEPS_Z, y: LANDING, speed: 0.7 },
  { x: -15.35, z: -1.3, y: LANDING },
  DOOR,
  INSIDE,
];
/** Wheelchair: the switchback ramp, lower run up to the middle landing, upper run up to the lobby landing, then the door. */
const RAMP_IN: WalkPoint[] = [
  { x: -17.15, z: 2.2, y: GROUND },
  { x: -17.15, z: 7.6, y: MID, speed: 0.6 },
  { x: -16.45, z: 8.2, y: MID },
  { x: -15.5, z: 7.6, y: MID },
  { x: -15.5, z: 3.6, y: LANDING, speed: 0.6 },
  { x: -15.45, z: -1.0, y: LANDING },
  DOOR,
  INSIDE,
];

type Mode =
  | 'waiting'
  | 'arriving'
  | 'docked'
  | 'toBay'
  | 'parked'
  | 'leaving'
  | 'gone';
type Drive = {
  pieces: Piece[];
  length: number;
  legs: { start: number; end: number; leg: FleetLeg }[];
};
type Body = {
  object: T.Object3D;
  van: ReturnType<typeof buildArrivalVan> | null;
  car: LiveCar | null;
  lamps: VehicleLamps;
  wheels: T.Object3D[];
  wheelRadius: number;
  /** Local (x, z) of the passenger door sill and of a standing spot a step out from it. */
  sill: [number, number];
  foot: [number, number];
  /** Height of the sill above the ground: a lift van's floor, a step, a car's sill. */
  sillRise: number;
  /** Vans and lift vans carry the slide-out ramp; `rampFoot` is where it meets the ground. */
  hasRamp: boolean;
  rampFoot: [number, number] | null;
  /** A lift van puts the ramp out for every party; a van only when someone uses a wheelchair. */
  rampForAll: boolean;
  /** Half the body's width and length, for walkers to keep clear of it. */
  halfWidth: number;
  halfLength: number;
};
type Dock = {
  phase: 'open' | 'unload' | 'close';
  timer: number;
  queue: LivePerson[];
  n: number;
};
type Live = {
  v: LiveVehicle;
  body: Body;
  label: T.Sprite;
  labelText: string;
  /** The plate's drawn size (metres at scale 1) and, while it grows or shrinks, the size it is coming from. */
  plate: [number, number];
  plateFrom: [number, number] | null;
  plateT: number;
  /** Whether the plate currently painted is the opened bubble. */
  drawnExpanded: boolean;
  /** 1 while another vehicle is hovered, easing to 0.5: the dimmed look. */
  dim: number;
  /** The plate's own visibility: eases to 0 while another vehicle's bubble is open, so only that one shows. */
  plateFade: number;
  mode: Mode;
  drive: Drive | null;
  s: number;
  targetS: number;
  vel: number;
  spot: number | null;
  opacity: number;
  /** Open fractions and where each is heading. */
  door: number;
  ramp: number;
  cab: number;
  doorTarget: number;
  rampTarget: number;
  cabTarget: number;
  /** The riders seen on board while inbound: the party that alights at the drop-off. */
  arriving: LivePerson[];
  /** Set once this inbound visit has reached the drop-off, so a feed that still says `inbound` afterwards (the
   * dispatch board re-posts every few seconds; the AVL feed lags) does not send the parked vehicle round again. */
  visited: boolean;
  dock: Dock | null;
  /** Riders who have already walked out to this parked car. */
  boarded: Set<string>;
  boardTimer: number;
  /** Seconds since the last boarder vanished into the car with nobody else pending; closes up at 1.5. */
  closeTimer: number;
  leaveWhenClosed: boolean;
  /** No space was free after unloading, so it is driving off. */
  lotFull?: boolean;
  braking: boolean;
  reversing: boolean;
};

function drive(legs: FleetLeg[]): Drive {
  const pieces: Piece[] = [];
  const spans: Drive['legs'] = [];
  let at = 0;
  for (const leg of legs) {
    spans.push({ start: at, end: at + leg.length, leg });
    pieces.push(...leg.pieces);
    at += leg.length;
  }
  return { pieces, length: at, legs: spans };
}
const reverseLeg = (leg: FleetLeg) =>
  leg.id === 'dock-reverse' || leg.id === 'back-in' || leg.id === 'back-out';
const legAt = (d: Drive, s: number) =>
  d.legs.find((l) => s <= l.end) ?? d.legs.at(-1)!;

/** Drop-off → bay: on down the aisle, onto the bay's aisle line, south past the bay, reverse in. Null when the planner cannot build it. */
function dockToBay(index: number): FleetLeg[] | null {
  try {
    return [...fleetRoutes.frontDockToBay(index), ...fleetRoutes.backIn(index)];
  } catch {
    return null;
  }
}

function makeLabel(): T.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const sprite = new T.Sprite(
    new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(LABEL_W, LABEL_H, 1);
  sprite.renderOrder = 10;
  sprite.userData.canvas = canvas;
  sprite.userData.texSize = `${canvas.width}x${canvas.height}`;
  sprite.userData.widthM = LABEL_W;
  sprite.userData.heightM = LABEL_H;
  return sprite;
}
/**
 * Upload the repainted canvas. A canvas that changed size needs a new texture: WebGL cannot grow the old one in
 * place (Chrome logs "Offset overflows texture dimensions" and keeps the stale image).
 */
function uploadLabel(sprite: T.Sprite) {
  const canvas = sprite.userData.canvas as HTMLCanvasElement;
  const mat = sprite.material as T.SpriteMaterial;
  const tex = mat.map as T.CanvasTexture;
  const size = `${canvas.width}x${canvas.height}`;
  if (sprite.userData.texSize !== size) {
    sprite.userData.texSize = size;
    const next = new T.CanvasTexture(canvas);
    next.colorSpace = T.SRGBColorSpace;
    mat.map = next;
    mat.needsUpdate = true;
    tex.dispose();
  } else tex.needsUpdate = true;
}
/** One avatar: a photo or initials, a risk ring, the wheelchair badge; `square` for the driver. */
function drawAvatar(
  g: CanvasRenderingContext2D,
  p: LivePerson,
  x: number,
  y: number,
  d: number,
  square: boolean,
  repaint: () => void,
) {
  const r = d / 2,
    cx = x + r,
    cy = y + r;
  const path = () => {
    g.beginPath();
    if (square) g.roundRect(x, y, d, d, d * 0.26);
    else g.arc(cx, cy, r, 0, Math.PI * 2);
    g.closePath();
  };
  const ring = !square && p.risk && RING_COLOR[p.risk];
  if (ring) {
    g.save();
    g.fillStyle = ring;
    g.beginPath();
    g.arc(cx, cy, r + 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  g.save();
  g.fillStyle = square ? '#00a7a2' : p.boarding ? '#a7e2c0' : '#f3efe4';
  path();
  g.fill();
  g.restore();
  const img = photoOf(p.photo, repaint);
  if (img) {
    g.save();
    path();
    g.clip();
    g.drawImage(img, x, y, d, d);
    g.restore();
  } else {
    g.fillStyle = square ? '#062a28' : '#1b3a36';
    g.font = `600 ${Math.round(d * 0.4)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(p.initials, cx, cy + 2);
    g.textAlign = 'left';
  }
  g.save();
  g.lineWidth = 5;
  g.strokeStyle = square ? '#f3efe4' : '#0e2321';
  path();
  g.stroke();
  g.restore();
  if (p.wheelchair) {
    g.save();
    g.fillStyle = '#d08214';
    g.beginPath();
    g.arc(x + d - 10, y + d - 8, 17, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#0e2321';
    g.stroke();
    g.fillStyle = '#1b1206';
    g.font = '700 15px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('WC', x + d - 10, y + d - 7);
    g.restore();
  }
}
/**
 * Paint the plate: driver square, participants with first names, then the car's number and its countdown. Resizes the
 * canvas and the sprite to fit. `expanded` paints the opened bubble instead: the full title on top, the crew under it
 * and the vehicle's detail lines below, so the plate itself carries what a details card would.
 */
function paintLabel(
  sprite: T.Sprite,
  v: LiveVehicle,
  expanded: boolean,
  repaint: () => void,
) {
  if (expanded) return paintExpanded(sprite, v, repaint);
  const canvas = sprite.userData.canvas as HTMLCanvasElement;
  const people: { p: LivePerson; square: boolean }[] = [
    ...(v.driver ? [{ p: v.driver, square: true }] : []),
    ...(v.riders ?? []).slice(0, 4).map((p) => ({ p, square: false })),
  ];
  const more = Math.max(0, (v.riders?.length ?? 0) - 4);
  const AV = 118,
    NAME = 26,
    PAD = 34,
    GAP = 18;
  const probe = canvas.getContext('2d')!;
  probe.font = '600 56px system-ui, sans-serif';
  const title = v.label.split(' · ')[0];
  const tail = `${title}${v.detail ? ` · ${v.detail}` : ''}`;
  const tailW = probe.measureText(tail).width;
  const nameW = (p: LivePerson) => {
    probe.font = `600 ${NAME + 8}px system-ui, sans-serif`;
    return Math.max(AV, probe.measureText(p.name).width);
  };
  const cells = people.map(({ p, square }) => (square ? AV : nameW(p)) + GAP);
  const moreW = more ? 90 : 0;
  const width = Math.min(
    3072,
    Math.round(PAD * 2 + cells.reduce((a, b) => a + b, 0) + moreW + tailW + 24),
  );
  canvas.width = width;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, width, 256);
  g.fillStyle = v.highlight ? 'rgba(90,40,24,0.96)' : 'rgba(14,35,33,0.92)';
  g.beginPath();
  g.roundRect(8, 8, width - 16, 240, 60);
  g.fill();
  if (v.highlight) {
    g.lineWidth = 5;
    g.strokeStyle = '#fbae97';
    g.stroke();
  }
  let x = PAD;
  const yAv = people.length && people.some((c) => !c.square) ? 34 : 69;
  for (const { p, square } of people) {
    const w = square ? AV : nameW(p);
    drawAvatar(g, p, x + (w - AV) / 2, yAv, AV, square, repaint);
    if (!square) {
      g.fillStyle = '#f3efe4';
      g.font = `600 ${NAME + 8}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.name, x + w / 2, yAv + AV + 38, w + 10);
      g.textAlign = 'left';
    }
    x += w + GAP;
  }
  if (more) {
    g.fillStyle = '#cbedd9';
    g.font = '600 48px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(`+${more}`, x, yAv + AV / 2);
    x += moreW;
  }
  g.fillStyle = v.highlight ? '#fbae97' : '#cbedd9';
  g.font = '600 56px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(tail, x + 8, 128, width - x - PAD);
  uploadLabel(sprite);
  sprite.userData.widthM = width / LABEL_PX;
  sprite.userData.heightM = LABEL_H;
  sprite.userData.avatars = [] as AvatarRect[];
}
/** The opened bubble: title line, crew row with names, then each detail line; a brighter rim marks it as the one picked. */
function paintExpanded(sprite: T.Sprite, v: LiveVehicle, repaint: () => void) {
  const canvas = sprite.userData.canvas as HTMLCanvasElement;
  const people: { p: LivePerson; square: boolean }[] = [
    ...(v.driver ? [{ p: v.driver, square: true }] : []),
    ...(v.riders ?? []).slice(0, 8).map((p) => ({ p, square: false })),
  ];
  const more = Math.max(0, (v.riders?.length ?? 0) - 8);
  // Larger than the compact plate: avatars big enough to recognise a face, lines easy to read at the follow zoom.
  const AV = 200,
    NAME = 36,
    PAD = 48,
    GAP = 26,
    LINE = 74;
  const lines = (v.lines ?? []).slice(0, 8);
  const probe = canvas.getContext('2d')!;
  const measure = (font: string, text: string) => {
    probe.font = font;
    return probe.measureText(text).width;
  };
  const title = `${v.label}${v.detail ? ` · ${v.detail}` : ''}`;
  const TITLE = '600 64px system-ui, sans-serif';
  const LINEF = '500 52px system-ui, sans-serif';
  const nameW = (p: LivePerson) =>
    Math.max(AV, measure(`600 ${NAME + 8}px system-ui, sans-serif`, p.name));
  const cells = people.map(({ p, square }) => (square ? AV : nameW(p)) + GAP);
  const crewW = cells.reduce((a, b) => a + b, 0) + (more ? 90 : 0);
  const width = Math.min(
    4096,
    Math.max(
      1000,
      Math.round(
        PAD * 2 +
          Math.max(
            measure(TITLE, title),
            crewW,
            ...lines.map((t) => measure(LINEF, t)),
          ),
      ),
    ),
  );
  const yTitle = 84,
    yAv = 150,
    yLines = yAv + AV + (people.some((c) => !c.square) ? 112 : 64);
  const height = Math.round(
    yLines + lines.length * LINE + (lines.length ? 40 : 12),
  );
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, width, height);
  g.fillStyle = v.highlight ? 'rgba(90,40,24,0.97)' : 'rgba(14,35,33,0.96)';
  g.beginPath();
  g.roundRect(8, 8, width - 16, height - 16, 72);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = v.highlight ? '#fbae97' : '#7fc9ad';
  g.stroke();
  g.fillStyle = v.highlight ? '#fbae97' : '#e9f6ef';
  g.font = TITLE;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(title, PAD, yTitle, width - PAD * 2);
  let x = PAD;
  const avatars: AvatarRect[] = [];
  for (const { p, square } of people) {
    const w = square ? AV : nameW(p);
    drawAvatar(g, p, x + (w - AV) / 2, yAv, AV, square, repaint);
    if (!square) {
      g.fillStyle = '#f3efe4';
      g.font = `600 ${NAME + 8}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.name, x + w / 2, yAv + AV + 46, w + 10);
      g.textAlign = 'left';
      avatars.push({ x, y: yAv - 10, w, h: AV + 80, p });
    }
    x += w + GAP;
  }
  sprite.userData.avatars = avatars;
  if (more) {
    g.fillStyle = '#cbedd9';
    g.font = '600 56px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(`+${more}`, x, yAv + AV / 2);
  }
  if (lines.length) {
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(PAD, yLines - 30);
    g.lineTo(width - PAD, yLines - 30);
    g.stroke();
  }
  g.font = LINEF;
  g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    g.fillStyle =
      i === lines.length - 1 &&
      v.lines &&
      v.lines.length === lines.length &&
      i >= 3
        ? '#cbedd9'
        : '#e9f6ef';
    g.fillText(t, PAD, yLines + LINE * i + LINE / 2 - 8, width - PAD * 2);
  });
  uploadLabel(sprite);
  sprite.userData.widthM = width / LABEL_PX;
  sprite.userData.heightM = height / LABEL_PX;
}

/** The card for a hovered rider: large avatar, full name, native name, then the detail lines. Light, like the board's hover cards. */
function paintPersonCard(sprite: T.Sprite, p: LivePerson, repaint: () => void) {
  const canvas = sprite.userData.canvas as HTMLCanvasElement;
  const AV = 180,
    PAD = 44,
    LINE = 66;
  const lines = (p.lines ?? []).slice(0, 8);
  const probe = canvas.getContext('2d')!;
  const measure = (font: string, text: string) => {
    probe.font = font;
    return probe.measureText(text).width;
  };
  const NAMEF = '700 60px system-ui, sans-serif',
    SUBF = '500 46px system-ui, sans-serif',
    LINEF = '500 46px system-ui, sans-serif';
  const headW =
    AV +
    28 +
    Math.max(
      measure(NAMEF, p.fullName ?? p.name),
      p.subtitle ? measure(SUBF, p.subtitle) : 0,
    );
  const width = Math.min(
    3400,
    Math.round(
      PAD * 2 + Math.max(headW, ...lines.map((t) => measure(LINEF, t)), 600),
    ),
  );
  const yLines = PAD + AV + 36;
  const height = Math.round(
    yLines + lines.length * LINE + (lines.length ? 30 : 0),
  );
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, width, height);
  g.fillStyle = 'rgba(243,239,228,0.98)';
  g.beginPath();
  g.roundRect(8, 8, width - 16, height - 16, 56);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#2f6b62';
  g.stroke();
  drawAvatar(g, p, PAD, PAD, AV, false, repaint);
  g.fillStyle = '#1b3a36';
  g.font = NAMEF;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(
    p.fullName ?? p.name,
    PAD + AV + 28,
    PAD + (p.subtitle ? 58 : 90),
    width - PAD * 2 - AV - 28,
  );
  if (p.subtitle) {
    g.fillStyle = '#5b6b66';
    g.font = SUBF;
    g.fillText(p.subtitle, PAD + AV + 28, PAD + 124, width - PAD * 2 - AV - 28);
  }
  if (lines.length) {
    g.strokeStyle = 'rgba(27,58,54,0.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(PAD, yLines - 22);
    g.lineTo(width - PAD, yLines - 22);
    g.stroke();
  }
  g.font = LINEF;
  lines.forEach((t, i) => {
    g.fillStyle = i === 0 || i === lines.length - 1 ? '#5b6b66' : '#1b3a36';
    g.fillText(t, PAD, yLines + LINE * i + LINE / 2 - 6, width - PAD * 2);
  });
  uploadLabel(sprite);
  sprite.userData.widthM = width / LABEL_PX;
  sprite.userData.heightM = height / LABEL_PX;
}

const KIND_ACCENT: Record<LiveKind, string> = {
  van: '',
  wav: '',
  suv: '#3f7f6f',
  sedan: '#5b6fc0',
};

/** The fleet van body's tyres and rims: cylinders laid on their side (the open half-cylinder arch flares are left alone). */
function vanWheels(root: T.Object3D): T.Object3D[] {
  const out: T.Object3D[] = [];
  root.traverse((o) => {
    if (!(o instanceof T.Mesh) || o.geometry.type !== 'CylinderGeometry')
      return;
    const p = (o.geometry as T.CylinderGeometry).parameters;
    if (
      Math.abs(o.rotation.z - Math.PI / 2) < 0.01 &&
      !p.openEnded &&
      p.radiusTop <= 0.4
    )
      out.push(o);
  });
  return out;
}

export function createLiveLot(ctx: {
  scene: T.Scene;
  model: Facility;
  material: (id: string) => T.MeshStandardMaterial;
}) {
  const root = new T.Group();
  root.name = 'live-lot';
  ctx.scene.add(root);
  const people = new T.Group();
  people.name = 'live-lot-people';
  root.add(people);
  const walkers = createWalkers(people);
  const live = new Map<string, Live>();
  const spots = new Map<number, string>();
  let letters = 0;
  let hidStaticVans = false;
  let clock = '';
  let capacity = 0;
  let labelScale = 1;
  /** The camera's azimuth and elevation, for keeping label plates clear of each other on screen. */
  let viewAz = -2.35,
    viewEl = 0.9;
  let night = 0;
  /** The vehicle under the pointer (every other one is dimmed) and the one whose plate is opened. */
  let hoverId: string | null = null,
    expandedId: string | null = null;
  /** The rider whose avatar the pointer is over in the opened bubble, and the card drawn for them. */
  let hoverPerson: { l: Live; rect: AvatarRect } | null = null;
  const personCard = makeLabel();
  personCard.visible = false;
  personCard.renderOrder = 12;
  let personCardKey = '';
  root.add(personCard);
  /** The lobby's sliding leaves (arrival.ts), opened for walkers; found once the scene has them. */
  let leaves: T.Object3D[] | null = null;
  let entryOpen = 0;

  function body(kind: LiveKind, index: number): Body {
    if (kind === 'van' || kind === 'wav') {
      const van = buildArrivalVan(
        ctx.model,
        String.fromCharCode(65 + (index % 8)),
        ctx.material,
      );
      return {
        object: van.root,
        van,
        car: null,
        lamps: addVanLamps(van.root),
        wheels: van.wheels.length ? van.wheels : vanWheels(van.root),
        wheelRadius: van.wheelRadius,
        sill: FLEET_VAN_RAMP.sill,
        foot: [FLEET_VAN_RAMP.sill[0] + 0.9, FLEET_VAN_RAMP.sill[1]],
        sillRise: FLEET_VAN_RAMP.rise,
        hasRamp: true,
        rampFoot: FLEET_VAN_RAMP.foot,
        rampForAll: kind === 'wav',
        halfWidth: FLEET_VAN.halfWidth,
        halfLength: FLEET_VAN.halfLength,
      };
    }
    const car = buildLiveCar(kind, KIND_ACCENT[kind]);
    return {
      object: car.root,
      van: null,
      car,
      lamps: car.lamps,
      wheels: car.wheels,
      wheelRadius: car.wheelRadius,
      sill: car.sill,
      foot: car.foot,
      // The step up into the cabin: an SUV's floor sits higher than a sedan's.
      sillRise: kind === 'suv' ? 0.42 : 0.3,
      hasRamp: false,
      rampFoot: null,
      rampForAll: false,
      halfWidth: car.halfWidth,
      halfLength: car.halfLength,
    };
  }
  const order = (l: Live) => {
    const all = Array.from({ length: SPOTS }, (_, i) => i);
    return l.body.van
      ? all.filter((i) => i < BAYS + WEST_STALLS.length)
      : [
          ...all.slice(BAYS + WEST_STALLS.length),
          ...all.slice(BAYS, BAYS + WEST_STALLS.length),
          ...all.slice(0, BAYS),
        ];
  };
  function freeSpot(l: Live): number | null {
    return order(l).find((i) => !spots.has(i)) ?? null;
  }
  const spotPose = (i: number, l: Live) => {
    if (i < BAYS)
      return {
        x: fleetParking[i].x,
        z: fleetParking[i].z,
        heading: fleetParking[i].heading,
      };
    if (isWest(i))
      return {
        x: fleetParking[0].x,
        z: WEST_STALLS[i - BAYS],
        heading: fleetParking[0].heading,
      };
    const a = angledApproach(angledIndex(i), l.body.halfLength);
    return { x: a.cx, z: a.cz, heading: ANGLED.dir + Math.PI };
  };
  /** The way from the drop-off into spot `i`, and out of it off site; null when the planner cannot build one. */
  function spotIn(i: number, l: Live): FleetLeg[] | null {
    if (i < BAYS) return dockToBay(i);
    try {
      return isWest(i)
        ? fleetRoutes.frontDockToStall(WEST_STALLS[i - BAYS])
        : fleetRoutes.frontDockToAngled(angledIndex(i), l.body.halfLength);
    } catch {
      return null;
    }
  }
  function spotOut(i: number, l: Live): FleetLeg[] | null {
    if (i < BAYS) return bayRoute(i);
    try {
      return isWest(i)
        ? fleetRoutes.stallToAway(WEST_STALLS[i - BAYS])
        : fleetRoutes.angledToAway(angledIndex(i), l.body.halfLength);
    } catch {
      return null;
    }
  }
  function place(o: T.Object3D, x: number, z: number, heading: number) {
    o.position.set(x, L.streetY, z);
    o.rotation.y = heading;
  }
  function pose(l: Live) {
    if (!l.drive) return;
    const p = pathAt(l.drive.pieces, l.s);
    const span = legAt(l.drive, l.s);
    const reverse = reverseLeg(span.leg);
    place(l.body.object, p.x, p.z, reverse ? p.dir : p.dir + Math.PI);
    const into = l.s - span.start,
      left = span.end - l.s;
    if (span.leg.fade === 'in') l.opacity = Math.min(1, into / L.fade);
    else if (span.leg.fade === 'out') l.opacity = Math.max(0, left / L.fade);
    else l.opacity = 1;
  }
  function start(l: Live, legs: FleetLeg[] | null, mode: Mode) {
    l.drive = legs ? drive(legs) : null;
    l.s = 0;
    l.vel = 0;
    l.targetS = l.drive?.length ?? 0;
    l.mode = mode;
    if (mode === 'arriving') l.lotFull = false;
    if (l.drive) pose(l);
  }
  function parkAt(l: Live) {
    const i = freeSpot(l);
    l.spot = i;
    l.drive = null;
    l.vel = 0;
    if (i === null) {
      // The feed has it on the lot but every space is taken: not drawn rather than parked off the lot.
      l.mode = 'gone';
      l.opacity = 0;
      return;
    }
    spots.set(i, l.v.id);
    const sp = spotPose(i, l);
    place(l.body.object, sp.x, sp.z, sp.heading);
    l.mode = 'parked';
    l.opacity = 1;
  }
  function releaseSpot(l: Live) {
    if (l.spot !== null) spots.delete(l.spot);
    l.spot = null;
  }
  function remove(l: Live) {
    releaseSpot(l);
    for (const id of walkers.ids(`${l.v.id}|`)) walkers.remove(id);
    root.remove(l.body.object);
    root.remove(l.label);
    live.delete(l.v.id);
  }
  /**
   * What the plate shows, kept in step with what the lot is doing rather than with the feed's text (which says
   * "arriving · 2 riders" until the next update): arriving with everyone aboard; getting off with only those still
   * aboard; parking; parked (the feed's next-departure line, for a car the feed has on the lot); getting on, counting
   * who is aboard; departing with whoever boarded.
   */
  function onPlate(l: Live): LiveVehicle {
    const v = l.v,
      all = v.riders ?? [],
      plural = (n: number) => `${n} rider${n === 1 ? '' : 's'}`;
    if (l.mode === 'docked') {
      const d = l.dock,
        n = l.arriving.length,
        aboard = d ? d.queue : [],
        off = n - aboard.length;
      const detail = !n
        ? 'at the drop-off'
        : !d
          ? 'everyone off'
          : d.phase === 'open'
            ? `getting off · ${plural(n)}`
            : d.phase === 'unload'
              ? `getting off · ${off} of ${n} off`
              : 'everyone off';
      return { ...v, detail, riders: aboard };
    }
    if (l.mode === 'toBay') return { ...v, detail: 'parking', riders: [] };
    if (l.mode === 'parked') {
      const boarding = all.filter((p) => p.boarding);
      const walking = walkers.ids(`${v.id}|in|`).length;
      if (
        boarding.length &&
        (boarding.some((p) => !l.boarded.has(p.name)) || walking)
      ) {
        const on = Math.max(0, l.boarded.size - walking);
        return {
          ...v,
          detail: `getting on · ${on} of ${boarding.length} on`,
          riders: boarding,
        };
      }
      if (boarding.length && l.boarded.size)
        return {
          ...v,
          detail: `parked · ${plural(l.boarded.size)} aboard`,
          riders: boarding,
        };
      const next = v.state === 'on-lot' && v.detail ? ` · ${v.detail}` : '';
      return {
        ...v,
        detail: `parked${next}`,
        riders: v.state === 'on-lot' ? all : [],
      };
    }
    if (l.mode === 'leaving' && l.lotFull)
      return { ...v, detail: 'lot full · leaving', riders: [] };
    if (l.mode === 'leaving') {
      const aboard = all.filter((p) => l.boarded.has(p.name));
      return {
        ...v,
        detail: aboard.length
          ? `departing · ${plural(aboard.length)}`
          : 'departing',
        riders: aboard,
      };
    }
    if (l.mode === 'arriving') return { ...v, riders: l.arriving };
    return v;
  }
  function approachTarget(v: LiveVehicle, d: Drive) {
    const eta = v.etaMinutes ?? HORIZON_MIN;
    const f = Math.min(1, Math.max(0, 1 - eta / HORIZON_MIN));
    return f * d.length;
  }
  /** World (x, z) of a point in the vehicle's frame, as it stands now. */
  function world(l: Live, local: [number, number]) {
    l.body.object.updateMatrixWorld(true);
    const p = l.body.object.localToWorld(new T.Vector3(local[0], 0, local[1]));
    return { x: p.x, z: p.z };
  }
  /** From the vehicle's door into the lobby: down the ramp or a step, across the lot, up the steps or the accessible ramp. */
  /** Where a rider gets down: the ramp's foot while it is out, else a step out from the sill. */
  function footOf(l: Live, onRamp: boolean): [number, number] {
    return onRamp && l.body.rampFoot ? l.body.rampFoot : l.body.foot;
  }
  /** Clear of the ramp: a stride straight on from the foot, so riders leave the ramp before they turn. */
  const CLEAR = { ramp: 0.9, step: 0.6 };
  /** The vehicles standing on the lot (parked or at the drop-off), as walkers see them. */
  function footprints(): Footprint[] {
    const out: Footprint[] = [];
    for (const o of live.values()) {
      if (o.mode !== 'parked' && o.mode !== 'docked') continue;
      const b = o.body.object;
      out.push({
        x: b.position.x,
        z: b.position.z,
        heading: b.rotation.y,
        halfWidth: o.body.halfWidth,
        halfLength: o.body.halfLength,
      });
    }
    return out;
  }
  /** Ground-level points that take a walk from `a` to `b` round the standing vehicles instead of through them. */
  function detour(a: WalkPoint, b: WalkPoint): WalkPoint[] {
    return routeAround([a.x, a.z], [b.x, b.z], footprints()).map(([x, z]) => ({
      x,
      z,
      y: GROUND,
    }));
  }
  function alightPath(l: Live, wheelchair: boolean): WalkPoint[] {
    const onRamp = l.rampTarget > 0 && !!l.body.rampFoot,
      f = footOf(l, onRamp),
      sill = world(l, l.body.sill),
      foot = world(l, f),
      clear = world(l, [f[0] + (onRamp ? CLEAR.ramp : CLEAR.step), f[1]]),
      inside = wheelchair ? RAMP_IN : STEPS_IN,
      off: WalkPoint = { x: clear.x, z: clear.z, y: GROUND };
    return [
      { x: sill.x, z: sill.z, y: GROUND + l.body.sillRise },
      { x: foot.x, z: foot.z, y: GROUND, speed: WALK.ramp },
      off,
      ...detour(off, inside[0]),
      ...inside,
    ];
  }
  /** Nobody on the ramp or within reach of it, so it can slide back in (and the doors shut) without hitting anyone. */
  function rampClear(l: Live) {
    if (!l.body.rampFoot) return true;
    const [sx, sz] = l.body.sill,
      [fx] = l.body.rampFoot;
    for (let t = 0; t <= 1.001; t += 0.25) {
      const p = world(l, [sx + (fx + CLEAR.ramp - sx) * t, sz]);
      if (walkers.nearest(p.x, p.z) < 1.0) return false;
    }
    return true;
  }
  /** Out of the lobby to the vehicle's door: the alighting route in reverse, ending a step out from the sill and then on it. */
  function boardPath(l: Live, wheelchair: boolean): WalkPoint[] {
    // While the ramp is out (a wheelchair rider in the party) everyone boards up it, not just the wheelchair:
    // round the standing vehicles to a stride beyond its foot, then straight up it. Otherwise round them to just
    // in front of the nose, then down the car's door side in the lane a bay leaves between cars (0.28 m off the
    // body: mid-gap in the 2.8 m back-in bays) to the door.
    const onRamp = l.body.hasRamp && (wheelchair || l.rampTarget > 0),
      doorZ = l.body.sill[1],
      sill = world(l, l.body.sill);
    const back = (pts: WalkPoint[]) =>
      [...pts].reverse().map((p, i, arr) => ({
        ...p,
        speed: arr[i + 1]?.speed ?? (wheelchair ? WALK.wheelchair : WALK.foot),
      }));
    const lobby = back(wheelchair ? RAMP_IN : STEPS_IN),
      last = lobby[lobby.length - 1],
      ground = (local: [number, number]): WalkPoint => {
        const p = world(l, local);
        return { x: p.x, z: p.z, y: GROUND };
      },
      up: WalkPoint = {
        x: sill.x,
        z: sill.z,
        y: GROUND + l.body.sillRise,
        speed: WALK.ramp,
      };
    if (onRamp && l.body.rampFoot) {
      const [fx] = l.body.rampFoot,
        approach = ground([fx + CLEAR.ramp, doorZ]);
      return [
        ...lobby,
        ...detour(last, approach),
        approach,
        ground([fx, doorZ]),
        up,
      ];
    }
    const lane = l.body.halfWidth + 0.28,
      front = ground([lane, -l.body.halfLength - 0.7]);
    return [...lobby, ...detour(last, front), front, ground([lane, doorZ]), up];
  }

  function apply(msg: LiveMessage) {
    clock = msg.clock ?? clock;
    capacity = msg.capacity ?? capacity;
    const seen = new Set<string>();
    for (const v of msg.vehicles) {
      seen.add(v.id);
      let l = live.get(v.id);
      if (!l) {
        if (v.state === 'away') continue;
        const b = body(v.kind, letters++);
        const label = makeLabel();
        root.add(b.object);
        root.add(label);
        l = {
          v,
          body: b,
          label,
          labelText: '',
          plate: [LABEL_W, LABEL_H],
          plateFrom: null,
          plateT: 1,
          drawnExpanded: false,
          dim: 1,
          plateFade: 1,
          mode: 'waiting',
          drive: null,
          s: 0,
          targetS: 0,
          vel: 0,
          spot: null,
          opacity: 0,
          door: 0,
          ramp: 0,
          cab: 0,
          doorTarget: 0,
          rampTarget: 0,
          cabTarget: 0,
          arriving: v.state === 'inbound' ? (v.riders ?? []) : [],
          visited: false,
          dock: null,
          boarded: new Set(),
          boardTimer: 0,
          closeTimer: 0,
          leaveWhenClosed: false,
          braking: false,
          reversing: false,
        };
        live.set(v.id, l);
        if (v.state === 'inbound') {
          start(l, fleetRoutes.awayToFrontDock(), 'arriving');
          l.targetS = approachTarget(v, l.drive!);
          if (v.fromOutside) {
            const entry = l.drive!.legs.find((g) => g.leg.id === 'entry-in');
            const arriving = !v.etaMinutes;
            l.s = arriving && entry ? Math.max(0, entry.start - 12) : 0;
            l.vel = arriving ? SPEED.lot : SPEED.street;
          } else l.s = l.targetS;
          pose(l);
        } else parkAt(l);
      } else {
        l.v = v;
        if (v.state !== 'inbound') l.visited = false;
        if (v.state === 'inbound' && !l.visited) {
          l.arriving = v.riders ?? [];
          if (l.mode === 'arriving')
            l.targetS = Math.max(l.s, approachTarget(v, l.drive!));
          else if (
            l.mode === 'parked' ||
            l.mode === 'gone' ||
            l.mode === 'waiting'
          ) {
            releaseSpot(l);
            l.boarded.clear();
            start(l, fleetRoutes.awayToFrontDock(), 'arriving');
            l.targetS = approachTarget(v, l.drive!);
          }
        } else if (v.state === 'on-lot') {
          if (l.mode === 'arriving') l.targetS = l.drive!.length;
          else if (
            l.mode === 'leaving' ||
            l.mode === 'gone' ||
            l.mode === 'waiting'
          )
            parkAt(l);
        } else if (v.state === 'away') leave(l);
      }
    }
    for (const l of live.values()) if (!seen.has(l.v.id)) leave(l);
  }
  function leave(l: Live) {
    if (l.mode === 'leaving' || l.mode === 'gone') return;
    l.doorTarget = l.rampTarget = l.cabTarget = 0;
    l.dock = null;
    if (l.door > 0.01 || l.ramp > 0.01) {
      // Close up first; the departure starts once the doors are shut.
      l.leaveWhenClosed = true;
      return;
    }
    l.leaveWhenClosed = false;
    const bayLegs =
      l.mode === 'parked' && l.spot !== null ? spotOut(l.spot, l) : null;
    if (bayLegs) {
      releaseSpot(l);
      start(l, bayLegs, 'leaving');
    } else if (
      l.mode === 'docked' ||
      (l.mode === 'arriving' && l.s > l.drive!.length - 1)
    ) {
      start(l, fleetRoutes.frontDockToAway(), 'leaving');
    } else if (!exitFrom(l)) {
      releaseSpot(l);
      l.drive = null;
      l.mode = 'gone';
    }
  }
  /** The fleet's own route out of a bay or curb spot; null when the planner cannot build one from that spot (it throws). */
  function bayRoute(index: number): FleetLeg[] | null {
    try {
      return fleetRoutes.bayToAway(index);
    } catch {
      return null;
    }
  }
  /**
   * A vehicle anywhere else on the lot (an overflow spot on the aisle, on its way to a bay, waiting at the drop-off)
   * leaves by joining the drop-off's exit route at the point nearest to where it stands: down the aisle, over to the
   * exit lane, out of the driveway and up the alley until it fades at the edge. False when it is nowhere near it.
   */
  function exitFrom(l: Live): boolean {
    const legs = fleetRoutes.frontDockToAway();
    const d = drive(legs);
    const { x, z } = l.body.object.position;
    let best = { s: 0, dist: Infinity };
    for (let s = 0; s <= d.length; s += 0.5) {
      const p = pathAt(d.pieces, s);
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist < best.dist) best = { s, dist };
    }
    if (best.dist > 6) return false;
    releaseSpot(l);
    start(l, legs, 'leaving');
    l.s = best.s;
    l.opacity = 1;
    pose(l);
    return true;
  }

  /** Move along the drive toward `targetS`: pull away at ACCEL, hold the leg's speed, brake to stop exactly at the target. */
  function advance(l: Live, dt: number) {
    if (!l.drive) return 0;
    const span = legAt(l.drive, l.s);
    const reverse = reverseLeg(span.leg);
    const cap = reverse
      ? SPEED.reverse
      : span.leg.lot
        ? SPEED.lot
        : SPEED.street;
    const remaining = Math.max(0, l.targetS - l.s);
    const goal = Math.min(cap, Math.sqrt(2 * DECEL * remaining));
    l.vel =
      goal > l.vel
        ? Math.min(goal, l.vel + ACCEL * dt)
        : Math.max(goal, l.vel - DECEL * 1.4 * dt);
    const ds = Math.min(remaining, l.vel * dt);
    l.s += ds;
    l.braking =
      goal < l.vel - 0.02 ||
      (remaining < 0.02 && l.vel < 0.02 && l.mode !== 'parked');
    l.reversing = reverse && l.vel > 0.02;
    const turn = (reverse ? -ds : ds) / l.body.wheelRadius;
    for (const w of l.body.wheels) w.rotateY(turn);
    pose(l);
    return remaining - ds;
  }

  /** The drop-off: open up, let the party off one at a time, close up, then find a bay. */
  function dockTick(l: Live, dt: number) {
    const d = l.dock!;
    // A wheelchair rider always gets the ramp; a lift van puts it out for any party.
    const wantsRamp =
      l.body.hasRamp &&
      (l.body.rampForAll
        ? d.queue.length > 0
        : d.queue.some((p) => p.wheelchair));
    if (d.phase === 'open') {
      l.doorTarget = 1;
      if (wantsRamp) l.rampTarget = 1;
      if (l.body.van) l.cabTarget = wantsRamp ? 1 : 0;
      if (l.door >= 0.99 && (!wantsRamp || l.ramp >= 0.99)) {
        d.phase = 'unload';
        d.timer = 0.5;
      }
      return;
    }
    if (d.phase === 'unload') {
      d.timer -= dt;
      if (d.timer > 0) return;
      const p = d.queue.shift();
      if (p) {
        const wheelchair = !!p.wheelchair;
        walkers.spawn(`${l.v.id}|out|${d.n++}`, p, alightPath(l, wheelchair));
        d.timer = wheelchair ? ALIGHT_GAP.wheelchair : ALIGHT_GAP.walk;
      } else {
        d.phase = 'close';
        d.timer = ALIGHT_GAP.linger;
      }
      return;
    }
    d.timer -= dt;
    if (d.timer > 0 || !rampClear(l)) return;
    l.rampTarget = 0;
    l.cabTarget = 0;
    if (l.ramp <= 0.01) l.doorTarget = 0;
    if (l.door <= 0.01 && l.ramp <= 0.01 && l.cab <= 0.01) {
      l.dock = null;
      const i = freeSpot(l);
      const legs = i !== null ? spotIn(i, l) : null;
      if (legs && i !== null) {
        l.spot = i;
        spots.set(i, l.v.id);
        start(l, legs, 'toBay');
      } else {
        // Lot full: on out of the lot rather than park in the aisle or the street.
        l.lotFull = true;
        start(l, fleetRoutes.frontDockToAway(), 'leaving');
      }
    }
  }

  /** A parked car: riders flagged as boarding walk out from the lobby; the door (and a lift van's ramp) opens for them and closes after the last. */
  function boardingTick(l: Live, dt: number) {
    const pending = (l.v.riders ?? []).filter(
      (p) => p.boarding && !l.boarded.has(p.name),
    );
    const prefix = `${l.v.id}|in|`;
    const walking = walkers.ids(prefix).length;
    if (pending.length) {
      l.doorTarget = 1;
      const wheelchair = pending.some((p) => p.wheelchair);
      if (l.body.hasRamp && wheelchair) l.rampTarget = 1;
      l.closeTimer = 0;
      l.boardTimer -= dt;
      if (l.boardTimer <= 0 && l.door >= 0.99) {
        const p = pending[0];
        l.boarded.add(p.name);
        walkers.spawn(`${prefix}${p.name}`, p, boardPath(l, !!p.wheelchair));
        l.boardTimer = p.wheelchair ? 3.0 : 1.8;
      }
    } else if (walking === 0 && (l.door > 0.01 || l.ramp > 0.01) && !l.dock) {
      l.closeTimer += dt;
      if (l.closeTimer > 1.5 && rampClear(l)) {
        l.rampTarget = 0;
        l.cabTarget = 0;
        if (l.ramp <= 0.01) l.doorTarget = 0;
      }
    }
  }

  /**
   * Label plates float above their vehicle; a car with its door open carries its plate higher, clear of the door,
   * the ramp and the people at them. Plates that would overlap on screen (judged in the camera's frame: across the
   * view for width, along the view and up for height) are stacked, each taking the first clear height, so cars
   * parked side by side or queued at the drop-off keep every crew readable.
   */
  function placeLabels() {
    const sa = Math.sin(viewAz),
      ca = Math.cos(viewAz),
      se = Math.sin(viewEl),
      ce = Math.cos(viewEl);
    const placed: {
      across: number;
      along: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    // The opened plate is placed first so it keeps the low spot and the others stack around it.
    const items = Array.from(live.values())
      .filter((l) => l.opacity > 0.3 && l.plateFade > 0.3)
      .sort(
        (a, b) =>
          Number(b.v.id === expandedId) - Number(a.v.id === expandedId) ||
          a.body.object.position.z - b.body.object.position.z,
      );
    for (const l of items) {
      const { x, z } = l.body.object.position;
      const across = x * ca - z * sa,
        along = x * sa + z * ca;
      const w = l.label.scale.x,
        h = l.label.scale.y;
      // The plate's bottom edge sits where the compact plate's always did; a taller plate grows upward from there.
      const bottom =
        3.6 +
        1.2 * labelScale -
        (LABEL_H * labelScale) / 2 +
        (l.door > 0.01 ? 2.6 : 0);
      let y = bottom + h / 2;
      for (let tries = 0; tries < 8; tries++) {
        const clash = placed.some(
          (p) =>
            Math.abs(p.across - across) < ((p.w + w) / 2) * 0.92 &&
            // Screen height: up for y, down for ground distance toward the camera.
            Math.abs((p.y - y) * ce - (p.along - along) * se) <
              ((p.h + h) / 2) * 1.02,
        );
        if (!clash) break;
        y += h * 1.08;
      }
      placed.push({ across, along, y, w, h });
      l.label.position.set(x, y, z);
    }
  }

  function tick(dt: number) {
    if (!hidStaticVans) {
      // The renderer shows the model's display vans whenever the care-day cast is off; take them out of the scene instead.
      for (const o of ctx.model.objects)
        if (o.assetId.startsWith('fleet-van'))
          ctx.scene.getObjectByName(o.id)?.removeFromParent();
      // No street cars on the live lot either: it shows Seen's vehicles only.
      for (const name of ['street-car-1', 'street-car-2'])
        ctx.scene.getObjectByName(name)?.removeFromParent();
      // Nor the care-day's own animated vans and delivery trucks: parked at the curb with their bodies faded, their
      // steps and racks still drew as bars on the road.
      const stale: T.Object3D[] = [];
      ctx.scene.traverse((o) => {
        if (/^(animated-van-|rear-deliveries$)/.test(o.name)) stale.push(o);
      });
      for (const o of stale) o.removeFromParent();
      hidStaticVans = true;
    }
    for (const l of Array.from(live.values())) {
      l.braking = false;
      l.reversing = false;
      if (l.leaveWhenClosed && l.door <= 0.01 && l.ramp <= 0.01) leave(l);
      if (l.mode === 'arriving' && l.drive) {
        advance(l, dt);
        if (l.s >= l.drive.length - 1e-6 && l.vel < 0.05) {
          l.mode = 'docked';
          l.vel = 0;
          l.visited = true;
          l.dock = { phase: 'open', timer: 0, queue: [...l.arriving], n: 0 };
        }
      } else if (l.mode === 'docked') {
        l.braking = true;
        if (l.dock) dockTick(l, dt);
      } else if (l.mode === 'toBay' && l.drive) {
        advance(l, dt);
        if (l.s >= l.drive.length - 1e-6 && l.vel < 0.05) {
          l.mode = 'parked';
          l.drive = null;
          l.vel = 0;
        }
      } else if (l.mode === 'leaving' && l.drive) {
        advance(l, dt);
        if (l.s >= l.drive.length - 1e-6) l.mode = 'gone';
      } else if (l.mode === 'gone') {
        l.opacity = Math.max(0, l.opacity - dt * 0.5);
        if (l.opacity <= 0) {
          remove(l);
          continue;
        }
      } else if (l.mode === 'parked') {
        l.opacity = Math.min(1, l.opacity + dt);
        boardingTick(l, dt);
      }
      // Doors: the ramp only unfolds once the sliding door is fully open, and the door only shuts once the ramp is stowed.
      const doorGoal = l.ramp > 0.01 ? 1 : l.doorTarget;
      l.door = tween(l.door, doorGoal, RATE.door, dt);
      const rampGoal = l.door < 0.99 && l.ramp < 0.01 ? 0 : l.rampTarget;
      l.ramp = tween(l.ramp, rampGoal, RATE.ramp, dt);
      l.cab = tween(l.cab, l.cabTarget, RATE.cab, dt);
      // Hovering one vehicle dims every other one (body and plate) to half; the change eases over ~0.2 s.
      l.dim = tween(l.dim, hoverId && hoverId !== l.v.id ? 0.5 : 1, 3, dt);
      const shown = l.opacity * l.dim;
      // Body, fade, doors, lamps and label.
      if (l.body.van)
        updateArrivalVan(
          l.body.van,
          {
            position: l.body.object.position.clone(),
            heading: l.body.object.rotation.y,
            visible: l.opacity > 0.01,
            door: l.door,
            ramp: l.body.hasRamp ? l.ramp : 0,
            cabDoor: l.cab,
            opacity: shown,
          },
          true,
        );
      else {
        l.body.object.visible = l.opacity > 0.01;
        fadeVehicle(l.body.object, shown);
        if (l.body.car)
          l.body.car.door.rotation.y =
            l.body.car.doorOpenAngle * smooth(0, 1, l.door);
      }
      setLamps(l.body.lamps, {
        night,
        driving: l.vel > 0.1,
        braking: l.braking,
        reversing: l.reversing,
        on: l.mode !== 'parked' && l.mode !== 'waiting' && l.opacity > 0.3,
      });
      const expanded = l.v.id === expandedId;
      const shownV = onPlate(l);
      const text = JSON.stringify([
        shownV.label,
        shownV.detail ?? '',
        !!shownV.highlight,
        shownV.driver,
        shownV.riders,
        expanded,
        expanded ? shownV.lines : null,
      ]);
      if (text !== l.labelText) {
        const v = shownV;
        const wasExpanded = l.drawnExpanded;
        l.drawnExpanded = expanded;
        paintLabel(l.label, v, expanded, () => {
          l.labelText = '';
        });
        l.labelText = text;
        const boost = expanded ? EXPAND_BOOST : 1;
        const next: [number, number] = [
          (l.label.userData.widthM as number) * boost,
          (l.label.userData.heightM as number) * boost,
        ];
        // Opening or closing the bubble grows or shrinks the plate over ~0.3 s instead of snapping.
        if (expanded !== wasExpanded) {
          l.plateFrom = l.plate;
          l.plateT = 0;
        }
        l.plate = next;
      }
      l.plateT = Math.min(1, l.plateT + dt / 0.3);
      const k = l.plateFrom ? smooth(0, 1, l.plateT) : 1;
      const [w0, h0] = l.plateFrom ?? l.plate;
      if (l.plateT >= 1) l.plateFrom = null;
      l.label.scale.set(
        (w0 + (l.plate[0] - w0) * k) * labelScale,
        (h0 + (l.plate[1] - h0) * k) * labelScale,
        1,
      );
      // While a bubble is open the other plates fade out, so the details stand alone over the lot.
      l.plateFade = tween(l.plateFade, expandedId && !expanded ? 0 : 1, 4, dt);
      l.label.visible = l.opacity > 0.3 && l.plateFade > 0.01;
      // The opened bubble draws over every other plate.
      l.label.renderOrder = expanded ? 11 : 10;
      (l.label.material as T.SpriteMaterial).opacity = shown * l.plateFade;
    }
    placeLabels();
    // The hovered rider's card floats above their avatar, offset across the screen to sit over that avatar's column.
    if (
      hoverPerson &&
      hoverPerson.l.v.id === expandedId &&
      hoverPerson.l.label.visible
    ) {
      const { l, rect } = hoverPerson;
      const key = JSON.stringify(rect.p);
      if (key !== personCardKey) {
        personCardKey = key;
        paintPersonCard(personCard, rect.p, () => {
          personCardKey = '';
        });
      }
      const k = labelScale * EXPAND_BOOST;
      personCard.scale.set(
        (personCard.userData.widthM as number) * k,
        (personCard.userData.heightM as number) * k,
        1,
      );
      // Beside the bubble, on the side with more room (the bubble is usually centred, so the card goes to its right
      // unless the avatar sits in the bubble's left half), level with the avatar row.
      const canvas = l.label.userData.canvas as HTMLCanvasElement;
      const side = rect.x + rect.w / 2 < canvas.width / 2 ? -1 : 1;
      const dx = side * (l.label.scale.x / 2 + personCard.scale.x / 2 + 0.25);
      // A world-height offset shows foreshortened by cos(elevation); the plates themselves do not.
      const rowFromCentre =
        (canvas.height / 2 - (rect.y + rect.h / 2)) / canvas.height;
      const dy =
        (rowFromCentre * l.label.scale.y) / Math.max(0.2, Math.cos(viewEl));
      const rx = Math.cos(viewAz),
        rz = -Math.sin(viewAz);
      personCard.position.set(
        l.label.position.x + rx * dx,
        l.label.position.y + dy,
        l.label.position.z + rz * dx,
      );
      (personCard.material as T.SpriteMaterial).opacity = 1;
      personCard.visible = true;
    } else personCard.visible = false;
    walkers.tick(dt);
    // The lobby's sliding doors part for anyone on foot coming up to them (the care-day's door logic is idle on this page).
    if (walkers.count > 0 || entryOpen > 0) {
      leaves ??= ['-1', '1']
        .map((s) => ctx.scene.getObjectByName(`sliding-entry-leaf-${s}`))
        .filter((o): o is T.Object3D => !!o);
      const near = walkers.nearest(ARRIVAL.door[0], ARRIVAL.door[1]);
      entryOpen = tween(entryOpen, 1 - smooth(0.7, 2.6, near), RATE.entry, dt);
      leaves.forEach(
        (g, i) => (g.position.z = entryLeafZ(i ? 1 : -1, entryOpen)),
      );
    }
  }
  return {
    tick,
    apply,
    get onLot() {
      return [...live.values()].filter(
        (l) => l.mode === 'parked' || l.mode === 'docked' || l.mode === 'toBay',
      ).length;
    },
    get capacity() {
      return capacity;
    },
    get clock() {
      return clock;
    },
    /** Where a vehicle's body is right now (x, z in site metres), or null when it is not drawn. */
    positionOf(id: string): [number, number] | null {
      const l = live.get(id);
      if (!l || l.mode === 'gone' || l.opacity <= 0.05) return null;
      return [l.body.object.position.x, l.body.object.position.z];
    },
    /** Multiplier on the label plates, so the parent can keep them readable as the camera zooms out. */
    setLabelScale(k: number) {
      labelScale = Math.min(3, Math.max(0.5, k));
    },
    /** The camera's angles, so the plate layout judges overlap the way it shows on screen. */
    setViewAngles(azimuth: number, elevation: number) {
      viewAz = azimuth;
      viewEl = elevation;
    },
    /** 0 = day, 1 = night: lamps and headlight beams on the vehicles. */
    setNight(k: number) {
      night = Math.min(1, Math.max(0, k));
    },
    /** The vehicle under the pointer: every other vehicle and plate is drawn at half opacity while one is set. */
    setHover(id: string | null) {
      hoverId = id && live.has(id) ? id : null;
      hoverPerson = null;
    },
    /**
     * Pointer hover: the vehicle under `ray` (null clears), and when the pointer is over a rider's avatar in the opened
     * bubble, that rider's card is shown. Returns the hovered vehicle id, or 'person' over an avatar.
     */
    hover(ray: T.Raycaster | null): string | null {
      hoverPerson = null;
      if (!ray) {
        hoverId = null;
        return null;
      }
      let best: { l: Live; hit: T.Intersection } | null = null;
      for (const l of live.values()) {
        if (l.mode === 'gone' || l.opacity <= 0.3) continue;
        const targets =
          l.plateFade > 0.3 ? [l.body.object, l.label] : [l.body.object];
        const hit = ray.intersectObjects(targets, true)[0];
        if (hit && (!best || hit.distance < best.hit.distance))
          best = { l, hit };
      }
      hoverId = best?.l.v.id ?? null;
      if (
        best &&
        best.l.v.id === expandedId &&
        best.hit.object === best.l.label &&
        best.hit.uv
      ) {
        const canvas = best.l.label.userData.canvas as HTMLCanvasElement;
        const px = best.hit.uv.x * canvas.width,
          py = (1 - best.hit.uv.y) * canvas.height;
        const rect = (
          (best.l.label.userData.avatars as AvatarRect[]) ?? []
        ).find(
          (r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h,
        );
        if (rect) {
          hoverPerson = { l: best.l, rect };
          return 'person';
        }
      }
      return hoverId;
    },
    /** Open one vehicle's plate into its details bubble (null closes it). */
    setExpanded(id: string | null) {
      expandedId = id;
    },
    get expanded() {
      return expandedId;
    },
    /** Debug view of every vehicle's state (`?debug=1` exposes the lot as `window.seenLot`). */
    inspect() {
      return Array.from(live.values()).map((l) => ({
        id: l.v.id,
        mode: l.mode,
        spot: l.spot,
        s: +l.s.toFixed(1),
        length: l.drive ? +l.drive.length.toFixed(1) : null,
        door: +l.door.toFixed(2),
        ramp: +l.ramp.toFixed(2),
        leaveWhenClosed: l.leaveWhenClosed,
        plate: onPlate(l).detail ?? '',
        riders: (onPlate(l).riders ?? []).map((p) => p.name),
        at: [
          +l.body.object.position.x.toFixed(1),
          +l.body.object.position.z.toFixed(1),
        ],
      }));
    },
    /** People on foot right now, for the HUD. */
    get onFoot() {
      return walkers.count;
    },
    /** The id of the drawn vehicle under `ray` (nearest hit on a body or its label plate), or null. */
    pick(ray: T.Raycaster): string | null {
      let best: { id: string; d: number } | null = null;
      for (const l of live.values()) {
        if (l.mode === 'gone' || l.opacity <= 0.3) continue;
        // A faded-out plate must not catch the click meant for the car or the ground behind it.
        const targets =
          l.plateFade > 0.3 ? [l.body.object, l.label] : [l.body.object];
        const hit = ray.intersectObjects(targets, true)[0];
        if (hit && (!best || hit.distance < best.d))
          best = { id: l.v.id, d: hit.distance };
      }
      return best?.id ?? null;
    },
    dispose() {
      ctx.scene.remove(root);
    },
  };
}
