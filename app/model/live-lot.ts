/**
 * Live lot: Seen's real vehicles on the Alhambra lot, driven by messages from
 * a parent page (the dispatch app's VTC view). Each vehicle is a fleet van,
 * a lift van, an SUV or a sedan body; it drives in from the south end of the
 * west street as its ETA counts down, turns in through the Ethel Avenue curb
 * cut, unloads at the drop-off, backs into a bay, waits, and pulls out by the
 * alley driveway and fades when the dispatch app says it is gone.
 * Positions come from the fleet's own route pieces, so the manoeuvres are the
 * reviewed ones (4 m arcs, back-in stalls, one driveway).
 */
import * as T from 'three';
import { buildArrivalVan, fadeVehicle, updateArrivalVan } from './arrival';
import { FLEET_LOT, fleetParking, fleetRoutes, type FleetLeg } from './alhambra-fleet';
import { buildCommunityVehicleBody } from './community-vehicles';
import type { Facility } from './schema';
import { Pen, pathAt, type Piece } from './vehicle-path';

export type LiveKind = 'van' | 'wav' | 'suv' | 'sedan';
export type LiveState = 'inbound' | 'on-lot' | 'away';
export type LiveVehicle = {
  id: string;
  kind: LiveKind;
  /** Vehicle number and driver, drawn above the body. */
  label: string;
  /** Second line: ETA, riders, next departure. */
  detail?: string;
  state: LiveState;
  /** Minutes to the center while inbound; drives how far along the approach the vehicle is drawn. */
  etaMinutes?: number | null;
  highlight?: boolean;
};
export type LiveMessage = { type: 'seen-live-lot'; vehicles: LiveVehicle[]; capacity?: number; clock?: string };

/** An inbound vehicle this many minutes out waits, faint, at the south end of the west street. */
const HORIZON_MIN = 12;
const SPEED = { street: 9, lot: 3, reverse: 1.8 };
const DOCK_SECONDS = 14;
/** Label plate in metres at the default zoom; `setLabelScale` keeps it the same size on screen when the camera zooms. */
const LABEL_W = 11, LABEL_H = 2.75;
const L = FLEET_LOT;
const R = L.turnRadius;
const EAST = Math.PI / 2;
const BAYS = fleetParking.length; // five bays, then the three curb spots
/** When every spot is taken: along the aisle, nose south, 7 m apart from the dock southward. */
const overflowSpot = (n: number) => ({ x: L.aisle, z: -4 - 7 * n, heading: 0 });

type Mode = 'waiting' | 'arriving' | 'docked' | 'toBay' | 'parked' | 'leaving' | 'gone';
type Drive = { pieces: Piece[]; length: number; legs: { start: number; end: number; leg: FleetLeg }[] };
type Body = { object: T.Object3D; van: ReturnType<typeof buildArrivalVan> | null };
type Live = {
  v: LiveVehicle;
  body: Body;
  label: T.Sprite;
  labelText: string;
  mode: Mode;
  drive: Drive | null;
  s: number;
  targetS: number;
  spot: number | null;
  timer: number;
  opacity: number;
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
const reverseLeg = (leg: FleetLeg) => leg.id === 'dock-reverse' || leg.id === 'back-in';
const legAt = (d: Drive, s: number) => d.legs.find((l) => s <= l.end) ?? d.legs.at(-1)!;

/** Drop-off → bay: back out, swing right onto the aisle, south past the bay, reverse in. Null when the bay sits too far north for the swing. */
function dockToBay(index: number): FleetLeg[] | null {
  try {
    const bay = fleetParking[index];
    const aisleX = bay.aisleX ?? L.aisle;
    const stop = bay.z - R;
    const pen = new Pen(L.dockBackTo, L.dock[1], EAST);
    pen.line(L.lead).arc(R, Math.PI / 2);
    const lateral = pen.x - aisleX;
    for (const radius of [L.laneChangeRadius, 4, 3]) {
      const probe = new Pen(pen.x, pen.z, pen.dir);
      probe.jog(lateral, radius);
      if (probe.z > stop + 0.5) {
        pen.jog(lateral, radius).lineToZ(stop);
        const legs: FleetLeg[] = [...fleetRoutes.dockReverse(), { id: 'dock-to-bay', phase: 'Driving to a bay', pieces: pen.take(), length: 0, speed: SPEED.lot, lot: true }];
        legs[1].length = legs[1].pieces.reduce((n, p) => n + p.length, 0);
        return [...legs, ...fleetRoutes.backIn(index)];
      }
    }
    return null;
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
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(LABEL_W, LABEL_H, 1);
  sprite.renderOrder = 10;
  sprite.userData.canvas = canvas;
  return sprite;
}
function paintLabel(sprite: T.Sprite, title: string, detail: string, highlight: boolean) {
  const canvas = sprite.userData.canvas as HTMLCanvasElement;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = highlight ? 'rgba(247,119,79,0.95)' : 'rgba(15,26,25,0.88)';
  const r = 44;
  g.beginPath();
  g.roundRect(16, 16, canvas.width - 32, canvas.height - 32, r);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = '600 84px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(title, 56, detail ? 92 : 128, canvas.width - 112);
  if (detail) {
    g.font = '400 66px system-ui, sans-serif';
    g.fillStyle = highlight ? '#ffffff' : '#9fdcc9';
    g.fillText(detail, 56, 180, canvas.width - 112);
  }
  (sprite.material as T.SpriteMaterial).map!.needsUpdate = true;
}

const KIND_ACCENT: Record<LiveKind, string> = { van: '', wav: '', suv: '#3f7f6f', sedan: '#5b6fc0' };

export function createLiveLot(ctx: { scene: T.Scene; model: Facility; material: (id: string) => T.MeshStandardMaterial }) {
  const root = new T.Group();
  root.name = 'live-lot';
  ctx.scene.add(root);
  const live = new Map<string, Live>();
  const spots = new Map<number, string>();
  let letters = 0;
  let hidStaticVans = false;
  let clock = '';
  let capacity = 0;
  let labelScale = 1;

  function body(kind: LiveKind, index: number): Body {
    if (kind === 'van' || kind === 'wav') {
      const van = buildArrivalVan(ctx.model, String.fromCharCode(65 + (index % 8)), ctx.material);
      return { object: van.root, van };
    }
    const object = buildCommunityVehicleBody('car', KIND_ACCENT[kind]);
    if (kind === 'suv') object.scale.set(1.08, 1.22, 1.1);
    return { object, van: null };
  }
  function freeSpot(): number | null {
    for (let i = 0; i < BAYS + 6; i++) if (!spots.has(i)) return i;
    return null;
  }
  const spotPose = (i: number) => (i < BAYS ? { x: fleetParking[i].x, z: fleetParking[i].z, heading: fleetParking[i].heading } : overflowSpot(i - BAYS));
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
    const into = l.s - span.start, left = span.end - l.s;
    if (span.leg.fade === 'in') l.opacity = Math.min(1, into / L.fade);
    else if (span.leg.fade === 'out') l.opacity = Math.max(0, left / L.fade);
    else l.opacity = 1;
  }
  function start(l: Live, legs: FleetLeg[] | null, mode: Mode) {
    l.drive = legs ? drive(legs) : null;
    l.s = 0;
    l.targetS = l.drive?.length ?? 0;
    l.mode = mode;
    if (l.drive) pose(l);
  }
  function parkAt(l: Live) {
    const i = freeSpot();
    l.spot = i;
    if (i !== null) spots.set(i, l.v.id);
    const sp = i === null ? overflowSpot(9) : spotPose(i);
    place(l.body.object, sp.x, sp.z, sp.heading);
    l.drive = null;
    l.mode = 'parked';
    l.opacity = 1;
  }
  function releaseSpot(l: Live) {
    if (l.spot !== null) spots.delete(l.spot);
    l.spot = null;
  }
  function remove(l: Live) {
    releaseSpot(l);
    root.remove(l.body.object);
    root.remove(l.label);
    live.delete(l.v.id);
  }
  function approachTarget(v: LiveVehicle, d: Drive) {
    const eta = v.etaMinutes ?? HORIZON_MIN;
    const f = Math.min(1, Math.max(0, 1 - eta / HORIZON_MIN));
    return f * d.length;
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
        l = { v, body: b, label, labelText: '', mode: 'waiting', drive: null, s: 0, targetS: 0, spot: null, timer: 0, opacity: 0 };
        live.set(v.id, l);
        if (v.state === 'inbound') {
          start(l, fleetRoutes.awayToDock(), 'arriving');
          l.s = l.targetS = approachTarget(v, l.drive!);
          pose(l);
        } else parkAt(l);
      } else {
        l.v = v;
        if (v.state === 'inbound') {
          if (l.mode === 'arriving') l.targetS = Math.max(l.s, approachTarget(v, l.drive!));
          else if (l.mode === 'parked' || l.mode === 'gone' || l.mode === 'waiting') {
            releaseSpot(l);
            start(l, fleetRoutes.awayToDock(), 'arriving');
            l.targetS = approachTarget(v, l.drive!);
          }
        } else if (v.state === 'on-lot') {
          if (l.mode === 'arriving') l.targetS = l.drive!.length;
          else if (l.mode === 'leaving' || l.mode === 'gone' || l.mode === 'waiting') parkAt(l);
        } else if (v.state === 'away') leave(l);
      }
    }
    for (const l of live.values()) if (!seen.has(l.v.id)) leave(l);
  }
  function leave(l: Live) {
    if (l.mode === 'leaving' || l.mode === 'gone') return;
    if (l.mode === 'parked' && l.spot !== null && l.spot < BAYS) {
      const legs = fleetRoutes.bayToAway(l.spot);
      releaseSpot(l);
      start(l, legs, 'leaving');
    } else if (l.mode === 'docked' || (l.mode === 'arriving' && l.s > l.drive!.length - 1)) {
      start(l, [...fleetRoutes.dockReverse(), ...fleetRoutes.dockToAway()], 'leaving');
    } else {
      releaseSpot(l);
      l.drive = null;
      l.mode = 'gone';
    }
  }

  function tick(dt: number) {
    if (!hidStaticVans) {
      // The renderer shows the model's display vans whenever the care-day cast is off; take them out of the scene instead.
      for (const o of ctx.model.objects) if (o.assetId.startsWith('fleet-van')) ctx.scene.getObjectByName(o.id)?.removeFromParent();
      // No street cars on the live lot either: it shows Seen's vehicles only.
      for (const name of ['street-car-1', 'street-car-2']) ctx.scene.getObjectByName(name)?.removeFromParent();
      hidStaticVans = true;
    }
    for (const l of [...live.values()]) {
      if (l.mode === 'arriving' && l.drive) {
        const span = legAt(l.drive, l.s);
        const speed = span.leg.lot ? SPEED.lot : SPEED.street;
        l.s = Math.min(l.targetS, l.s + speed * dt);
        pose(l);
        if (l.s >= l.drive.length - 1e-6) {
          l.mode = 'docked';
          l.timer = DOCK_SECONDS;
        }
      } else if (l.mode === 'docked') {
        l.timer -= dt;
        if (l.timer <= 0) {
          const i = freeSpot();
          const legs = i !== null && i < BAYS ? dockToBay(i) : null;
          if (legs && i !== null) {
            l.spot = i;
            spots.set(i, l.v.id);
            start(l, legs, 'toBay');
          } else parkAt(l);
        }
      } else if (l.mode === 'toBay' && l.drive) {
        const span = legAt(l.drive, l.s);
        l.s = Math.min(l.drive.length, l.s + (reverseLeg(span.leg) ? SPEED.reverse : SPEED.lot) * dt);
        pose(l);
        if (l.s >= l.drive.length - 1e-6) {
          l.mode = 'parked';
          l.drive = null;
        }
      } else if (l.mode === 'leaving' && l.drive) {
        const span = legAt(l.drive, l.s);
        l.s = Math.min(l.drive.length, l.s + (reverseLeg(span.leg) ? SPEED.reverse : span.leg.lot ? SPEED.lot : SPEED.street) * dt);
        pose(l);
        if (l.s >= l.drive.length - 1e-6) l.mode = 'gone';
      } else if (l.mode === 'gone') {
        l.opacity = Math.max(0, l.opacity - dt);
        if (l.opacity <= 0) { remove(l); continue; }
      } else if (l.mode === 'parked') l.opacity = Math.min(1, l.opacity + dt);
      // Body, fade, doors and label.
      const docked = l.mode === 'docked';
      if (l.body.van) updateArrivalVan(l.body.van, { position: l.body.object.position.clone(), heading: l.body.object.rotation.y, visible: l.opacity > 0.01, door: docked ? 1 : 0, ramp: docked && l.v.kind === 'wav' ? 1 : 0, opacity: l.opacity }, true);
      else {
        l.body.object.visible = l.opacity > 0.01;
        fadeVehicle(l.body.object, l.opacity);
      }
      const text = `${l.v.label}|${l.v.detail ?? ''}|${l.v.highlight ? 1 : 0}`;
      if (text !== l.labelText) { paintLabel(l.label, l.v.label, l.v.detail ?? '', !!l.v.highlight); l.labelText = text; }
      l.label.position.set(l.body.object.position.x, 3.6 + 1.2 * labelScale, l.body.object.position.z);
      l.label.scale.set(LABEL_W * labelScale, LABEL_H * labelScale, 1);
      l.label.visible = l.opacity > 0.3;
      (l.label.material as T.SpriteMaterial).opacity = l.opacity;
    }
  }
  return {
    tick,
    apply,
    get onLot() { return [...live.values()].filter((l) => l.mode === 'parked' || l.mode === 'docked' || l.mode === 'toBay').length; },
    get capacity() { return capacity; },
    get clock() { return clock; },
    /** Multiplier on the label plates, so the parent can keep them readable as the camera zooms out. */
    setLabelScale(k: number) { labelScale = Math.min(3, Math.max(0.5, k)); },
    dispose() { ctx.scene.remove(root); },
  };
}
