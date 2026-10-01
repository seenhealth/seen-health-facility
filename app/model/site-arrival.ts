import * as T from 'three';
import siteArrivals from '../data/site-arrivals.json';
import { fleetVanLetter } from './alhambra-fleet';
import { buildArrivalVan, updateArrivalVan } from './arrival';
import type { Facility, Vec2 } from './schema';
import { easeDistance } from './traffic-routes';
import { pathAt, pathLength, roundedPath } from './vehicle-path';

export type SiteVanWindow =
  (typeof siteArrivals.timetables)[keyof typeof siteArrivals.timetables][number];

/** The site's own Van A/B timetable (app/data/site-arrivals.json), never Alhambra's fleet schedule. */
export function siteVanWindows(model: Facility): SiteVanWindow[] {
  const windows =
    model.contextStyle && siteArrivals.timetables[model.contextStyle];
  if (!windows)
    throw new Error(
      `No site van timetable for ${model.contextStyle ?? model.id}`,
    );
  return windows;
}

// Alveare's east lobby entry is centered at (15.80685, 10.22132).
// Olympic's proposed reception vestibule opens to the rear at (-8.614, 11.69278).
// Bay dimensions and fleet movements are illustrative design-phase placements.
// Approach and departure are corner points; every corner is rounded to a
// SITE_VAN_RADIUS arc (vehicle-path.ts), the fleet's 4 m lot radius.
const SITE_VAN_RADIUS = 4;
export function siteArrivalLayout(model: Facility) {
  const alveare = model.contextStyle === 'alveare';
  return alveare
    ? {
        dock: [21.4, 10.03132] as Vec2,
        heading: Math.PI,
        streetY: -0.23,
        landingY: -0.16,
        focus: [17.6, 10.22] as Vec2,
        approach: [
          [21.4, -37],
          [21.4, -14],
          [21.4, 2],
          [21.4, 10.03132],
        ] as Vec2[],
        departure: [
          [21.4, 10.03132],
          [21.4, 22],
          [21.4, 38],
          [21.4, 49],
        ] as Vec2[],
        walk: [
          [17.5, 10.22132],
          [15.8, 10.22132],
        ] as Vec2[],
        description:
          'East-side drop-off · South Broadway · Beside the front desk',
      }
    : {
        dock: [0, 19] as Vec2,
        heading: Math.PI / 2,
        streetY: -0.18,
        landingY: -0.115,
        focus: [-6, 15] as Vec2,
        // In along the rear lane, a half turn and straight into the bay;
        // out west and a jog back onto the lane.
        approach: [
          [-38, 27],
          [12, 27],
          [12, 19],
          [0, 19],
        ] as Vec2[],
        departure: [
          [0, 19],
          [-19, 19],
          [-19, 27],
          [-38, 27],
        ] as Vec2[],
        walk: [
          [-0.19, 15],
          [-0.19, 13.5],
          [-8.614, 13.5],
          [-8.614, 11.8],
        ] as Vec2[],
        description: 'Rear parking drop-off · Path to reception vestibule',
      };
}

export function buildSiteArrival(
  model: Facility,
  material?: (id: string) => T.MeshStandardMaterial,
) {
  const layout = siteArrivalLayout(model);
  const root = new T.Group();
  root.name = 'site-arrival-workflow';
  const entry = new T.Group();
  entry.name = 'van-drop-off-bay';
  root.add(entry);
  const materialFor =
    material ||
    ((id: string) =>
      new T.MeshStandardMaterial({
        color: model.materials[id]?.color || '#336e76',
        roughness: 0.75,
      }));
  const teal = new T.MeshStandardMaterial({
    color: '#388c8d',
    roughness: 0.85,
  });
  const white = new T.MeshStandardMaterial({
    color: '#f2efdc',
    roughness: 0.85,
  });
  const stroke = (
    parent: T.Object3D,
    a: Vec2,
    b: Vec2,
    y: number,
    width = 0.085,
    mat = white,
  ) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mesh = new T.Mesh(new T.BoxGeometry(width, 0.015, length), mat);
    mesh.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    mesh.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    parent.add(mesh);
  };
  // Passenger-side hatch makes the ramp clearance distinct from the vehicle bay.
  const markings = new T.Group();
  markings.position.set(layout.dock[0], 0, layout.dock[1]);
  markings.rotation.y = layout.heading;
  entry.add(markings);
  for (const x of [-1.5, 1.5])
    stroke(markings, [x, -4.1], [x, 4.1], layout.streetY + 0.055);
  for (const z of [-4.1, 4.1])
    stroke(markings, [-1.5, z], [1.5, z], layout.streetY + 0.055);
  for (let z = -1.5; z <= 1.2; z += 0.45)
    stroke(
      markings,
      [1.55, z],
      [2.55, z + 0.55],
      layout.streetY + 0.055,
      0.06,
      teal,
    );
  // Low-key approach markers stop at the doorway, keeping room labels optional.
  for (let i = 1; i < layout.walk.length; i++) {
    const a = layout.walk[i - 1],
      b = layout.walk[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0.12; d < length - 0.1; d += 0.65) {
      const from = d / length,
        to = Math.min(d + 0.28, length) / length;
      stroke(
        entry,
        [
          T.MathUtils.lerp(a[0], b[0], from),
          T.MathUtils.lerp(a[1], b[1], from),
        ],
        [T.MathUtils.lerp(a[0], b[0], to), T.MathUtils.lerp(a[1], b[1], to)],
        -0.09,
        0.12,
        teal,
      );
    }
  }
  const inbound = roundedPath(layout.approach, SITE_VAN_RADIUS),
    outbound = roundedPath(layout.departure, SITE_VAN_RADIUS);
  const windows = siteVanWindows(model);
  function sampleVan(index: number, time: number) {
    const v = windows[index],
      t = ((time % 720) + 720) % 720;
    let position = new T.Vector3(
      layout.dock[0],
      layout.streetY,
      layout.dock[1],
    );
    let heading = layout.heading,
      visible = false,
      phase = 'Off-site';
    // Arrivals come in at speed and slow into the bay; departures pull
    // away from it and leave at speed.
    for (const [range, label, path, arriving] of [
      [v.inbound, 'Arriving', inbound, true],
      [v.returning, 'Returning for pickup', inbound, true],
      [v.outbound, 'Leaving after drop-off', outbound, false],
      [v.leaving, 'Taking participants home', outbound, false],
    ] as const) {
      if (t >= range[0] && t < range[1]) {
        const seconds = range[1] - range[0],
          ramp = Math.min(4, seconds / 3),
          u = easeDistance(
            t - range[0],
            seconds,
            arriving ? 0 : ramp,
            arriving ? ramp : 0,
          ),
          p = pathAt(path, u * pathLength(path));
        position = new T.Vector3(p.x, layout.streetY, p.z);
        heading = p.dir + Math.PI;
        visible = true;
        phase = label;
      }
    }
    if (
      (t >= v.inbound[1] && t < v.outbound[0]) ||
      (t >= v.returning[1] && t < v.leaving[0])
    ) {
      visible = true;
      phase =
        t < v.outbound[0] ? 'Drop-off beside reception' : 'Boarding for home';
    }
    let door = 0,
      ramp = 0;
    for (const [start, end] of [v.unload, v.boarding]) {
      door = Math.max(
        door,
        T.MathUtils.smoothstep(t, start - 5, start - 2) *
          (1 - T.MathUtils.smoothstep(t, end + 1, end + 4)),
      );
      ramp = Math.max(
        ramp,
        T.MathUtils.smoothstep(t, start - 2, start + 2) *
          (1 - T.MathUtils.smoothstep(t, end - 2, end + 1)),
      );
    }
    return { position, heading, visible, phase, door, ramp };
  }
  const vans = windows.map((_, i) => {
    const van = buildArrivalVan(model, fleetVanLetter(i), materialFor);
    root.add(van.root);
    return van;
  });
  const tick = (time: number, enabled: boolean, _entryUsers?: unknown[]) => {
    vans.forEach((v, i) =>
      updateArrivalVan(
        v,
        sampleVan(i, time),
        enabled,
        -Math.asin((layout.streetY + 0.595 - layout.landingY) / 2.96),
      ),
    );
  };
  return {
    root,
    entry,
    vans,
    tick,
    sampleVan,
    windows,
    description: layout.description,
    focus: new T.Vector3(layout.focus[0], 0, layout.focus[1]),
  };
}
