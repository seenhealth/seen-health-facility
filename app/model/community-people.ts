import type { ActorSpec, Interaction, Segment } from './activity';
import type { CharacterRole } from './characters';
import type { Facility, Vec2 } from './schema';
import type { SourceExtension } from './sources';
import { FLEET_VAN_RAMP } from './photo-assets';
import {
  careSettingById,
  careSettings,
  COMMUNITY_SOURCE_ID,
  COMMUNITY_VIEW,
  instanceRooms,
  padPolygon,
  PAD_Y,
  PORCH_Y,
  settingZone,
  type CareSetting,
} from './community-settings';
import {
  CENTER_LOT,
  carDoorWorld,
  communityVehicleById,
  sampleCommunityVehicle,
  vanRampWorld,
} from './community-vehicles';
import { CLOCK_END, Track } from './community-track';
import castFile from '../data/community-casts.json';
import {
  fillHoles,
  placeInstanceCast,
  type InstanceCasts,
  type InstanceHole,
} from './instance-cast';

/**
 * People and touchpoints in the distributed-care settings, on the same 720 s
 * clock as the center. Every actor lives on `levelId: 'site'` in the zone
 * `community:<settingId>` (the nurse line sits upstairs in the center), and
 * every track covers 0–720 contiguously: short straight walks on the pads,
 * static poses otherwise, and seats in the community vehicles while riding.
 * Loop seconds throughout: 1 s = 40 clock seconds, 8 AM = 0, 4 PM = 720.
 *
 * People inside a facility stamped on a pad come from its generated cast
 * (app/data/community-casts.json, `npm run build:community`), placed with
 * the setting (`placeInstanceCast`); hand-authored legs fill the windows a
 * scheduled person spends off the instance (`HOLE_LEGS`).
 */
export { COMMUNITY_SOURCE_ID, COMMUNITY_VIEW } from './community-settings';
const VAN = 'van-community';
const VAN_FLOOR = 0.35;
/** Halfway up the home's porch ramp. */
const RAMP_MID_Y = (PAD_Y + PORCH_Y) / 2;
/** A follower's polyline: starts `m` metres behind the leader's start, stops `m` short. */
export function offsetBehind(path: Vec2[], m: number): Vec2[] {
  const [a, b] = path,
    len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
    back: Vec2 = [
      a[0] - ((b[0] - a[0]) / len) * m,
      a[1] - ((b[1] - a[1]) / len) * m,
    ];
  const out = [back, ...path];
  let remaining = m;
  while (out.length > 1 && remaining > 0) {
    const p = out.at(-2)!,
      q = out.at(-1)!,
      d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= remaining) {
      out.pop();
      remaining -= d;
    } else {
      out[out.length - 1] = [
        q[0] - ((q[0] - p[0]) / d) * remaining,
        q[1] - ((q[1] - p[1]) / d) * remaining,
      ];
      remaining = 0;
    }
  }
  return out;
}
/**
 * A heading in a setting's local frame (0 = facing the front, toward the
 * access road; π = facing the back) turned into the world, so poses follow
 * the setting when its registry entry moves or turns.
 */
const rel = (s: Pick<CareSetting, 'heading'>, local = 0) => s.heading + local;
/** Where the driver steps out of a community car at a moment of its route. */
const carDoor = (vehicleId: string, time: number) =>
  carDoorWorld(sampleCommunityVehicle(vehicleId, time));
/**
 * The 24/7 nurse line works from the corner desk of the upstairs open office:
 * the office chair furthest along the perimeter (largest z, then x).
 */
const NURSE_LINE_DESK = { zoneId: 'upper-office', assetId: 'upperfit-chair' };

/** Points around a Seen van at a stop: door sill, ramp foot, the driver's places. */
function vanStop(time: number, vehicleId = VAN) {
  const pose = sampleCommunityVehicle(vehicleId, time),
    { sill, foot } = vanRampWorld(pose),
    c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading),
    at = (x: number, z: number): Vec2 => [
      pose.position.x + x * c + z * sn,
      pose.position.z - x * sn + z * c,
    ];
  return {
    sill,
    foot,
    /** Just inside the sliding door: the step between the window bench and the sill. */
    cabin: at(FLEET_VAN_RAMP.sill[0] - 0.55, FLEET_VAN_RAMP.sill[1]),
    /** Beside the ramp foot toward the nose: where the driver stands to help. */
    aside: at(4.5, -1.5),
    driverDoor: at(-1.1, -1.9),
    nose: at(-0.6, -3.5),
    noseRight: at(2.6, -3.5),
    /** On the floor just inside the sliding door, a step from the driver's seat. */
    inside: at(0.4, -0.6),
  };
}

/** Van ramp foot → the home's porch ramp foot: along the drive edge, then a short loop round onto the ramp. */
function homeCrossing(foot: Vec2, settingId = 'home-wong'): Vec2[] {
  const h = careSettingById(settingId)!.anchors;
  return [foot, h.crossA, h.crossB, h.crossC, h.crossD, h.rampFoot];
}
/** The point `m` metres from `a` toward `b`. */
function toward(a: Vec2, b: Vec2, m: number): Vec2 {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [a[0] + ((b[0] - a[0]) / d) * m, a[1] + ((b[1] - a[1]) / d) * m];
}
/** Mr. Wong's wheelchair route from his ward bay to the Seen van's ramp foot. */
function hospitalRollPath(): Vec2[] {
  const q = careSettingById('hospital')!.anchors;
  return [q.patient, q.bayFront, q.walkway, q.kerbStep, vanStop(560).foot];
}
/**
 * A hand-authored leg filling `hole` of a generated person: a `Track` in the
 * setting's zone from `start` (default the hole's door point, at porch
 * height) at `hole.start`, closed with `segmentsTo(hole.end)`. Label and
 * variant come from the generated actor; the leg only carries segments.
 */
function legTrack(
  id: string,
  role: CharacterRole,
  hole: InstanceHole,
  s: CareSetting,
  start: Vec2 = hole.from,
  y = start === hole.from ? PORCH_Y : undefined,
): Track {
  return new Track(
    id,
    role,
    { zoneId: settingZone(s.id), label: id, variant: 0, start: hole.start },
    start,
    y,
  );
}
/**
 * Mrs. Wong's trip to the cardiology clinic: the leg that fills the `away`
 * hole of her generated track (80.5–370 s). Out of the front door at
 * `hole.from`, across the porch and down the new ramp to the Seen van (on
 * board 108.5–181 s), the visit, the ride home (257.5–337 s), and back up
 * the ramp to the door at `hole.to` by `hole.end`. The van's timetable
 * fixes the times in between.
 */
export function wongClinicLeg(hole: InstanceHole, zoneId: string): Segment[] {
  const home = careSettingById('home-wong')!,
    specialist = careSettingById('specialist')!;
  const h = home.anchors,
    c = specialist.anchors;
  const homeAm = vanStop(10),
    clinic = vanStop(200),
    homeNoon = vanStop(400);
  return new Track(
    'home-participant',
    'participant',
    {
      zoneId,
      label: 'Mrs. Wong',
      variant: 3,
      mobility: 'walker',
      start: hole.start,
    },
    hole.from,
    PORCH_Y,
  )
    .walk(85, [h.porch, h.rampTop], {
      title: 'Out to the van',
      ys: [PORCH_Y, PORCH_Y],
    })
    .walk(91.5, [h.rampFoot], { title: 'Down the new ramp', ys: [PAD_Y] })
    .walk(105, [...homeCrossing(homeAm.foot)].reverse().slice(1), {
      title: 'Across to the Seen van',
    })
    .walk(108.5, [homeAm.sill], { title: 'Up the van ramp', ys: [VAN_FLOOR] })
    .ride(181, VAN, 'participant', 'Riding to the cardiology clinic')
    .walk(184.5, [clinic.foot], {
      title: 'Down the van ramp',
      from: clinic.sill,
      fromY: VAN_FLOOR,
    })
    .walk(191, [c.kerb, c.entrance, c.checkInB], { title: 'Into the clinic' })
    .hold(195, 'greet', { title: 'Checking in', face: c.receptionMa })
    .walk(206, [c.doorway, c.examIn, c.examSeat], {
      title: 'To the exam room',
    })
    .hold(243, 'seated', {
      title: 'Cardiology follow-up',
      heading: rel(specialist),
    })
    .walk(254, [c.examIn, c.doorway, c.entrance, c.kerb, clinic.foot], {
      title: 'Back to the van',
    })
    .walk(257.5, [clinic.sill], { title: 'Up the van ramp', ys: [VAN_FLOOR] })
    .ride(337, VAN, 'participant', 'Riding home')
    .walk(340.5, [homeNoon.foot], {
      title: 'Down the van ramp',
      from: homeNoon.sill,
      fromY: VAN_FLOOR,
    })
    .walk(357, homeCrossing(homeNoon.foot).slice(1), { title: 'Home again' })
    .walk(364.5, [h.rampTop], { title: 'Up the ramp', ys: [PORCH_Y] })
    .walk(hole.end, [h.porch, hole.to], {
      title: 'In at the front door',
      ys: [PORCH_Y, PORCH_Y],
    })
    .segmentsTo(hole.end);
}
/**
 * The personal care aide outside the Wongs' house: from her car in the stall
 * to the front door for 8:29 AM; ahead of Mrs. Wong to the ramp with the
 * clinic bag, waving the van off and taking the pill packs from the courier
 * on the drive; out to meet the van at noon and up the ramp behind her; and
 * from the door at 12:59 PM to a hand-over with the OT on the porch and her
 * car, which leaves at 469 s.
 */
const aideLegs: Record<string, Leg> = {
  'before 0–44': (hole, s) => {
    const h = s.anchors;
    return legTrack('home-pca', 'aide', hole, s, h.stallStand)
      .hidden(28.5, 'Driving to the visit')
      .walk(hole.end, [h.porchStepFoot, h.porchStep, hole.to], {
        title: 'Arriving for the morning visit',
        ys: [undefined, PORCH_Y, PORCH_Y],
      })
      .segmentsTo(hole.end);
  },
  'away 77–152.5': (hole, s) => {
    const h = s.anchors,
      homeAm = vanStop(10);
    return legTrack('home-pca', 'aide', hole, s)
      .walk(80, [h.porchFrontEast, h.rampTopAside], {
        title: 'Ahead to the ramp with the clinic bag',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(110, 'greet', { title: 'Waving her off', face: homeAm.foot })
      .walk(114, [h.pcaWait, h.kerb], {
        title: 'Waiting for the pharmacy courier',
      })
      .hold(130, 'idle', {
        title: 'Waiting for the pharmacy courier',
        heading: rel(s),
      })
      .hold(141, 'greet', {
        title: 'Taking the pill packs from the courier',
        face: h.handover,
      })
      .walk(
        hole.end,
        [h.porchApproach, h.porchStepFoot, h.porchStep, hole.to],
        {
          title: 'In with the pill packs',
          ys: [undefined, undefined, PORCH_Y, PORCH_Y],
        },
      )
      .segmentsTo(hole.end);
  },
  'away 318.5–372.5': (hole, s) => {
    const h = s.anchors,
      homeNoon = vanStop(400);
    return legTrack('home-pca', 'aide', hole, s)
      .walk(332.5, [h.porch, h.rampTop, h.rampFoot, h.pcaMeetA, h.pcaMeetB], {
        title: 'Out to meet the van',
        ys: [PORCH_Y, PORCH_Y, PAD_Y],
      })
      .hold(340.5, 'greet', { title: 'Meeting the van', face: homeNoon.foot })
      .walk(357, [h.pcaWalkA, h.pcaWalkB], { title: 'Walking her home' })
      .hold(361.5, 'greet', { title: 'Up you go', face: h.rampFoot })
      .walk(hole.end, [h.rampFoot, h.rampTop, h.porch, hole.to], {
        title: 'Following her up the ramp',
        ys: [PAD_Y, PORCH_Y, PORCH_Y, PORCH_Y],
      })
      .segmentsTo(hole.end);
  },
  'after 450.5–720': (hole, s) => {
    const h = s.anchors;
    return legTrack('home-pca', 'aide', hole, s)
      .walk(452, [h.porchDriver], {
        title: 'Out onto the porch',
        ys: [PORCH_Y],
      })
      .hold(455, 'greet', { title: 'Hand-over to the OT', face: h.porch })
      .walk(469, [h.porchStep, h.porchStepFoot, h.stallStand], {
        title: 'Off to the next client',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hidden(hole.end, 'Driving to the next client')
      .segmentsTo(hole.end);
  },
};
/** In from the street along the sidewalk stub and up the porch ramp to the front door. */
const upTheRamp = (h: Record<string, Vec2>, door: Vec2): Vec2[] => [
  h.sidewalkPad,
  h.padCorner,
  h.rampFoot,
  h.rampTop,
  h.porch,
  door,
];
const UP_THE_RAMP_YS = [undefined, undefined, PAD_Y, PORCH_Y, PORCH_Y, PORCH_Y];
/**
 * The OT: in from the street at 453 s, out to check the porch ramp (the
 * `home-ramp-check` window) and back for the sign-off, gone at 582.5 s.
 */
const otLegs: Record<string, Leg> = {
  'before 0–453': (hole, s) =>
    legTrack('home-ot', 'ot', hole, s, s.anchors.sidewalkEnd)
      .hidden(412, 'Driving over with the installer')
      .walk(hole.end, upTheRamp(s.anchors, hole.to), {
        title: 'Arriving for the home modification',
        ys: UP_THE_RAMP_YS,
      })
      .segmentsTo(hole.end),
  'away 520–551': (hole, s) => {
    const h = s.anchors;
    return legTrack('home-ot', 'ot', hole, s)
      .walk(523.5, [h.porch, h.rampTop], {
        title: 'Out to check the ramp',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(531, 'consult', {
        title: 'Ramp check: landing, rails and edges',
        face: h.rampMid,
      })
      .walk(536, [h.rampMid, h.rampFoot], {
        title: 'Down the ramp: slope and handrail grip',
        ys: [RAMP_MID_Y, PAD_Y],
      })
      .hold(543, 'consult', {
        title: 'Ramp check: the level landing at the foot',
        face: h.rampMid,
      })
      .walk(hole.end, [h.rampTop, h.porch, hole.to], {
        title: 'Back in for the sign-off',
        ys: [PORCH_Y, PORCH_Y, PORCH_Y],
      })
      .segmentsTo(hole.end);
  },
  'after 582.5–720': (hole, s) => {
    const h = s.anchors;
    return legTrack('home-ot', 'ot', hole, s)
      .walk(
        622.5,
        [
          h.porch,
          h.rampTop,
          h.rampFoot,
          h.padCorner,
          h.sidewalkPadOut,
          h.sidewalkEndOut,
        ],
        { title: 'Leaving', ys: [PORCH_Y, PORCH_Y, PAD_Y] },
      )
      .hidden(hole.end, 'Back at the center')
      .segmentsTo(hole.end);
  },
};
/** The installer: the grab-bar kit from the crate on the pad, in at 456 s; out at 572.5 s to pack it. */
const installerLegs: Record<string, Leg> = {
  'before 0–456': (hole, s) => {
    const h = s.anchors;
    return legTrack('home-installer', 'aide', hole, s, h.sidewalkEnd)
      .hidden(405, 'Driving over with the OT')
      .walk(440, [h.sidewalkPad, h.padCorner, h.crateSide], {
        title: 'Bringing the grab-bar kit',
      })
      .hold(446, 'craft', { title: 'Unpacking the kit', face: h.crate })
      .walk(hole.end, [h.rampFoot, h.rampTop, h.porch, hole.to], {
        title: 'In with the bars and the drill',
        ys: [PAD_Y, PORCH_Y, PORCH_Y, PORCH_Y],
      })
      .segmentsTo(hole.end);
  },
  'after 572.5–720': (hole, s) => {
    const h = s.anchors;
    return legTrack('home-installer', 'aide', hole, s)
      .walk(581, [h.porch, h.rampTop, h.rampFoot, h.crateSide], {
        title: 'Out to the kit',
        ys: [PORCH_Y, PORCH_Y, PAD_Y],
      })
      .hold(586, 'craft', { title: 'Packing the kit', face: h.crate })
      .walk(616, [h.padCorner, h.sidewalkPadOut, h.sidewalkEndOut], {
        title: 'Leaving',
      })
      .hidden(hole.end, 'Back at the depot')
      .segmentsTo(hole.end);
  },
};
/** The home health nurse: in from the street for 3:05 PM, out to her car at 3:44 PM. */
const nurseLegs: Record<string, Leg> = {
  'before 0–642.5': (hole, s) =>
    legTrack('home-rn', 'nurse', hole, s, s.anchors.sidewalkEnd)
      .hidden(603.5, 'On other visits')
      .walk(hole.end, upTheRamp(s.anchors, hole.to), {
        title: 'Arriving for the discharge visit',
        ys: UP_THE_RAMP_YS,
      })
      .segmentsTo(hole.end),
  'after 708–720': (hole, s) => {
    const h = s.anchors;
    return legTrack('home-rn', 'nurse', hole, s)
      .walk(719, [h.porch, h.rampTop, h.rampFoot, h.padCorner], {
        title: 'Heading to the car',
        ys: [PORCH_Y, PORCH_Y, PAD_Y],
      })
      .hidden(hole.end, 'Driving to the next visit')
      .segmentsTo(hole.end);
  },
};
/**
 * Mr. Wong's day before he rolls in at his front door (672 s): on the
 * hospital ward (rounds, the discharge huddle and instructions), wheeled to
 * the Seen van by the liaison nurse, the ride home, and pushed by the driver
 * across the pad and up the porch ramp to the door. The hospital part is in
 * the hospital's zone, the rest in the home's.
 */
function mrWongHospitalDay(hole: InstanceHole, s: CareSetting): Segment[] {
  const hospital = careSettingById('hospital')!,
    h = s.anchors,
    hospitalStop = vanStop(560),
    homePm = vanStop(700),
    rollPath = hospitalRollPath();
  const ward = new Track(
    'hospital-participant',
    'participant',
    {
      zoneId: settingZone(hospital.id),
      label: 'Mr. Wong',
      variant: 8,
      mobility: 'wheelchair',
    },
    rollPath[0],
  )
    .hold(225, 'seated', {
      title: 'On the ward, awaiting rounds',
      heading: rel(hospital),
    })
    .hold(262, 'conversation', {
      title: 'Rounds with the team',
      heading: rel(hospital),
    })
    .hold(495, 'seated', {
      title: 'Ready for discharge',
      heading: rel(hospital),
    })
    .hold(525, 'listen', {
      title: 'Discharge huddle at the bedside',
      heading: rel(hospital),
    })
    .hold(556, 'conversation', {
      title: 'Discharge instructions',
      heading: rel(hospital),
    })
    .walk(566, rollPath.slice(1), {
      action: 'roll',
      title: 'Wheeled to the Seen van',
    })
    .walk(569.5, [hospitalStop.sill], {
      action: 'roll',
      title: 'Up the van ramp',
      ys: [VAN_FLOOR],
    })
    .ride(649, VAN, 'wheelchair', 'Riding home from hospital')
    .segmentsTo(649);
  const home = new Track(
    'hospital-participant',
    'participant',
    {
      zoneId: settingZone(s.id),
      label: 'Mr. Wong',
      variant: 8,
      mobility: 'wheelchair',
      start: 649,
    },
    homePm.sill,
    VAN_FLOOR,
  )
    .walk(652.5, [homePm.foot], { action: 'roll', title: 'Down the van ramp' })
    .walk(663.5, homeCrossing(homePm.foot).slice(1), {
      action: 'roll',
      title: 'Across to the porch ramp',
    })
    .walk(668.5, [h.rampTop], {
      action: 'roll',
      title: 'Up the porch ramp',
      ys: [PORCH_Y],
    })
    .walk(hole.end, [hole.to], {
      action: 'roll',
      title: 'To the front door',
      ys: [PORCH_Y],
    })
    .segmentsTo(hole.end);
  return [...ward, ...home];
}

// --- Mrs. Lin's home -------------------------------------------------------------
// Mrs. Lin (the story's participant) and her daughter live in the Wongs' plan
// on the home-lin pad (app/data/community/home-lin.cast.json); these legs are
// their times outside it. Her Seen van (`van-lin`, community-vehicles.ts)
// fixes the times: at the apex 22.5–50 s (ramp down 26.5–47.2 s) and
// 630–667.5 s (ramp down 634–643 s), off the map 62–620 s. Outdoors she
// walks at 1.45 m per loop second with her cane, her daughter 0.9 m behind.
const LIN_VAN = 'van-lin';
/** Her daughter falls in behind her here on the porch, 0.9 m back from where she then is. */
const LIN_JOIN = 1.2;
/**
 * A seat of her van at `time` on the ground plane (off the map at either end
 * of a run): where its riders wait out of sight between rides.
 */
function linVanSeat(time: number, seat: 'driver' | 'participant'): Vec2 {
  const pose = sampleCommunityVehicle(LIN_VAN, time),
    [x, , z] = communityVehicleById(LIN_VAN)!.seats[seat],
    c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading);
  return [pose.position.x + x * c + z * sn, pose.position.z - x * sn + z * c];
}
/**
 * Mrs. Lin's day away from home, the `away` hole of her generated track
 * (24.1–659 s): out of the front door and down the porch ramp with her
 * daughter, along the drive and up the van ramp ahead of the driver (on
 * board 43.7 s), the ride off the map, her day at the center (the story's
 * hero-lin there), and home on the same van: down its ramp, along the drive
 * with the driver behind her, met by her daughter at the porch ramp and in
 * at the front door by `hole.end`.
 */
function linDayLeg(hole: InstanceHole, s: CareSetting): Segment[] {
  const h = s.anchors,
    am = vanStop(30, LIN_VAN),
    pm = vanStop(640, LIN_VAN);
  return legTrack('lin-at-home', 'participant', hole, s)
    .walk(25, [h.porch], { title: 'Out of the front door', ys: [PORCH_Y] })
    .walk(27.07, [h.rampTop], {
      title: 'Across the porch, her daughter behind her',
      ys: [PORCH_Y],
    })
    .walk(31.55, [h.rampFoot], { title: 'Down the porch ramp', ys: [PAD_Y] })
    .walk(41.27, [...homeCrossing(am.foot, s.id)].reverse().slice(1), {
      title: 'Along the drive to the Seen van',
    })
    .walk(43.7, [am.sill], {
      title: 'Up the van ramp, the driver behind her',
      ys: [VAN_FLOOR],
    })
    .ride(62, LIN_VAN, 'participant', 'Riding to the Seen center')
    .hidden(620, 'Her day at the Seen center', linVanSeat(62, 'participant'))
    .ride(637, LIN_VAN, 'participant', 'Riding home')
    .walk(639.5, [pm.foot], {
      title: 'Down the van ramp',
      from: pm.sill,
      fromY: VAN_FLOOR,
    })
    .walk(649.5, homeCrossing(pm.foot, s.id).slice(1), {
      title: 'Along the drive, the driver behind her',
    })
    .hold(650.5, 'greet', {
      title: 'Her daughter meets her at the ramp',
      face: h.rampFootSouth,
    })
    .walk(655.5, [h.rampTop], {
      title: 'Up the porch ramp, her daughter behind her',
      ys: [PORCH_Y],
    })
    .walk(hole.end, [h.porch, hole.to], {
      title: 'Home: in at the front door',
      ys: [PORCH_Y, PORCH_Y],
    })
    .segmentsTo(hole.end);
}
const linLegs: Record<string, Leg> = {
  // Hidden on her bed for the first half second, so the loop seam (the sofa
  // at 4 PM, her bed at 8 AM) is out of sight.
  'before 0–0.5': () => undefined,
  'away 24.1–659': linDayLeg,
};
/**
 * Her daughter outside: out ahead of her mother at 22.9 s, then behind her
 * down the porch ramp and along the drive to the van, seeing her off and
 * back in by the porch step; out on the porch at 614 s to watch for the van,
 * down the ramp to meet her at its foot and up it behind her.
 */
const daughterLegs: Record<string, Leg> = {
  'before 0–0.5': () => undefined,
  'away 22.9–57': (hole, s) => {
    const h = s.anchors,
      am = vanStop(30, LIN_VAN);
    return legTrack('lin-daughter', 'family', hole, s)
      .walk(24.6, [h.doorStep, h.porchGreet], {
        title: 'Out ahead of her mother',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(25.9, 'greet', {
        title: 'Waiting for her on the porch',
        face: hole.from,
      })
      .walk(26.45, [toward(h.porch, h.rampTop, LIN_JOIN)], {
        title: 'Falling in behind her',
        ys: [PORCH_Y],
      })
      .walk(27.69, [h.rampTop], {
        title: 'Across the porch behind her mother',
        ys: [PORCH_Y],
      })
      .walk(32.17, [h.rampFoot], {
        title: 'Down the porch ramp behind her',
        ys: [PAD_Y],
      })
      .walk(
        41.27,
        [
          h.crossD,
          h.crossC,
          h.crossB,
          h.crossA,
          toward(am.foot, h.crossA, 0.9),
        ],
        { title: 'Walking her to the Seen van' },
      )
      .hold(50.5, 'greet', { title: 'Seeing her off', face: am.sill })
      .walk(hole.end, [h.porchStepFoot, h.porchStep, h.doorStep, hole.to], {
        title: 'Back in by the porch step',
        ys: [undefined, PORCH_Y, PORCH_Y, PORCH_Y],
      })
      .segmentsTo(hole.end);
  },
  'away 614–661': (hole, s) => {
    const h = s.anchors,
      pm = vanStop(640, LIN_VAN);
    return legTrack('lin-daughter', 'family', hole, s)
      .walk(616, [h.doorStep, h.porchWait], {
        title: 'Out on the porch',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(630, 'idle', { title: 'Watching for the van', face: pm.sill })
      .hold(641, 'greet', { title: 'The van is here', face: pm.foot })
      .walk(647, [h.rampTop, h.rampFoot, h.rampFootSouth], {
        title: 'Down the ramp to meet her',
        ys: [PORCH_Y, PAD_Y],
      })
      .hold(650.6, 'greet', {
        title: 'Meeting her mother at the ramp',
        face: h.rampFoot,
      })
      .walk(651.2, [h.rampFoot], { title: 'Behind her up the ramp' })
      .walk(656.2, [h.rampTop], {
        title: 'Up the porch ramp behind her',
        ys: [PORCH_Y],
      })
      .walk(659, [h.porch, toward(hole.to, h.porch, 0.9)], {
        title: 'Across the porch',
        ys: [PORCH_Y, PORCH_Y],
      })
      .walk(660.2, [hole.to], { title: 'In behind her', ys: [PORCH_Y] })
      .hold(hole.end, 'idle', { title: 'Closing the front door' })
      .segmentsTo(hole.end);
  },
};
/**
 * The driver of Mrs. Lin's van: at the wheel while it is on the map; round to
 * the ramp at each stop, up it behind her in the morning and into the van by
 * the sliding door to the driver's seat, and in the afternoon behind her along
 * the drive to the porch ramp, where he hands over to her daughter and walks
 * back.
 */
function linVanDriver(): Track {
  const s = careSettingById('home-lin')!,
    h = s.anchors,
    am = vanStop(30, LIN_VAN),
    pm = vanStop(640, LIN_VAN);
  return new Track(
    'lin-van-driver',
    'driver',
    {
      zoneId: settingZone(s.id),
      label: 'Seen driver · door to door',
      variant: 13,
    },
    linVanSeat(12.5, 'driver'),
  )
    .hidden(12.5, 'Driving other runs')
    .ride(23.5, LIN_VAN, 'driver', 'At the wheel')
    .walk(28.6, [am.nose, am.noseRight, am.aside], {
      title: 'Round to the ramp',
      from: am.driverDoor,
    })
    .hold(41.3, 'greet', {
      title: 'Ramp down; waiting for Mrs. Lin and her daughter',
      face: am.foot,
    })
    .walk(42.2, [am.foot], { title: 'To the foot of the ramp' })
    .walk(44.4, [am.sill], {
      action: 'escort',
      title: 'Up the ramp behind her',
      ys: [VAN_FLOOR],
    })
    .walk(45, [am.inside], { title: 'Seeing her seated', ys: [VAN_FLOOR] })
    .ride(62, LIN_VAN, 'driver', 'Driving Mrs. Lin to the center')
    .hidden(620, 'Other runs', linVanSeat(62, 'driver'))
    .ride(631, LIN_VAN, 'driver', 'Bringing Mrs. Lin home')
    .walk(636.4, [pm.nose, pm.noseRight, pm.aside], {
      title: 'Round to the ramp',
      from: pm.driverDoor,
    })
    .hold(639.6, 'greet', { title: 'Helping her down the ramp', face: pm.foot })
    .walk(640.5, [pm.foot], { title: 'To the foot of the ramp' })
    .walk(649.5, offsetBehind(homeCrossing(pm.foot, s.id), 0.9).slice(2), {
      action: 'escort',
      title: 'Walking her to the porch ramp',
    })
    .hold(651.5, 'greet', {
      title: 'Handing over to her daughter',
      face: h.rampFoot,
    })
    .walk(
      666.3,
      [
        h.crossC,
        h.crossB,
        h.crossA,
        pm.aside,
        pm.noseRight,
        pm.nose,
        pm.driverDoor,
      ],
      { title: 'Back to the van' },
    )
    .ride(679.5, LIN_VAN, 'driver', 'At the wheel')
    .hidden(CLOCK_END, 'Other runs', linVanSeat(679.5, 'driver'));
}
/** A setting's hand-authored legs, by `<kind> <start>–<end>` of the hole they fill. */
type Leg = (hole: InstanceHole, setting: CareSetting) => Segment[] | undefined;
const holeKey = (hole: InstanceHole) =>
  `${hole.kind} ${hole.start}–${hole.end}`;
/**
 * One person's legs by hole window. A hole that is not listed throws, so a
 * re-timed cast cannot silently pick up the wrong leg or leave someone
 * hidden; a listed leg that returns nothing keeps the placeholder hidden.
 */
const byWindow =
  (id: string, legs: Record<string, Leg>): Leg =>
  (hole, s) => {
    const leg = legs[holeKey(hole)];
    if (!leg)
      throw new Error(
        `${id}: no hand-authored leg for the ${holeKey(hole)} hole (HOLE_LEGS in community-people.ts; listed: ${Object.keys(legs).join(', ')})`,
      );
    return leg(hole, s);
  };
/**
 * Hand-authored legs for the holes of scheduled people in generated instance
 * casts, by actor id: each returns the segments from `hole.from` at
 * `hole.start` to `hole.to` at `hole.end` (instance-cast.ts `fillHoles`), or
 * nothing to keep the person out of sight. The Wongs' home: everyone inside
 * the house comes from its cast (app/data/community/home-wong.cast.json);
 * these are their times outside it. Mrs. Lin's home likewise
 * (home-lin.cast.json).
 */
const HOLE_LEGS: Record<string, Leg> = {
  'home-participant': byWindow('home-participant', {
    // Hidden in bed for the first half second, so the loop seam (sofa at
    // 4 PM, bed at 8 AM) is out of sight.
    'before 0–0.5': () => undefined,
    'away 80.5–370': (hole, s) => wongClinicLeg(hole, settingZone(s.id)),
  }),
  'home-pca': byWindow('home-pca', aideLegs),
  'home-ot': byWindow('home-ot', otLegs),
  'home-installer': byWindow('home-installer', installerLegs),
  'home-rn': byWindow('home-rn', nurseLegs),
  'hospital-participant': byWindow('hospital-participant', {
    'before 0–672': mrWongHospitalDay,
  }),
  // Mrs. Lin's home (app/data/community/home-lin.cast.json).
  'lin-at-home': byWindow('lin-at-home', linLegs),
  'lin-daughter': byWindow('lin-daughter', daughterLegs),
};
const instanceCasts = castFile as unknown as InstanceCasts;

export function communitySource(model: Facility): SourceExtension {
  const home = careSettingById('home-wong')!,
    pharmacy = careSettingById('pharmacy')!,
    hospital = careSettingById('hospital')!,
    specialist = careSettingById('specialist')!;
  const A = (s: CareSetting) => s.anchors;
  const actors: ActorSpec[] = [],
    interactions: Interaction[] = [];
  const add = (t: Track) => actors.push(t.build());
  const interact = (
    id: string,
    category: string,
    zoneId: string,
    actorIds: string[],
    start: number,
    end: number,
    label: string,
    description: string,
  ) =>
    interactions.push({
      id,
      category,
      zoneId,
      actorIds,
      start,
      end,
      label,
      description,
    });
  const h = A(home),
    p = A(pharmacy),
    q = A(hospital),
    c = A(specialist);
  const homeZone = settingZone(home.id);
  // Van stops (the van is parked at each for these moments).
  const homeAm = vanStop(10),
    clinic = vanStop(200),
    homeNoon = vanStop(400),
    hospitalStop = vanStop(560),
    homePm = vanStop(700);
  /** Pad crossing between the van's ramp foot and the porch ramp foot. */
  const crossing = homeCrossing;

  // --- The Wongs' home ------------------------------------------------------
  // Everyone inside the house comes from its generated cast (below, with
  // `HOLE_LEGS` for their times outside); here are the visitors who stay
  // outside and the two touchpoints on the drive.
  {
    const opts = { zoneId: homeZone };
    const mealsDoor = carDoor('meals-car', 380);
    const meals = new Track(
      'meals-driver',
      'driver',
      { ...opts, label: 'Meals driver', variant: 6 },
      CENTER_LOT.meals.at,
    )
      .hidden(369.5, 'Loading & driving meals', mealsDoor)
      .walk(
        381,
        [h.mealsWalkA, h.mealsWalkB, h.porchStepFoot, h.porchStep, h.doorStep],
        {
          title: 'Meal bag to the front door',
          ys: [undefined, undefined, undefined, PORCH_Y, PORCH_Y],
        },
      )
      .hold(386, 'serve', {
        title: 'Lunch to the aide; a wellness check with Mrs. Wong',
        face: h.door,
      })
      .walk(
        398,
        [h.porchStep, h.porchStepFoot, h.mealsWalkB, h.mealsWalkA, mealsDoor],
        { title: 'Back to the car', ys: [PORCH_Y, PAD_Y] },
      )
      .hidden(CLOCK_END, 'Delivering the rest of the route');
    add(meals);
    interact(
      'home-van-boarding',
      'home',
      homeZone,
      ['home-participant', 'home-pca', 'community-driver'],
      80.5,
      113,
      'Mrs. Wong · boarding the Seen van',
      'Down the new ramp and up the van ramp with the aide and driver alongside: door-to-door transport to a contracted specialist.',
    );
    interact(
      'home-pill-drop',
      'pharmacy',
      homeZone,
      ['courier', 'home-pca'],
      130,
      141,
      'Pill packs delivered to the home',
      'The pharmacy courier hands the weekly blister packs to the aide, who files them for the medication routine.',
    );
  }

  // --- Partner pharmacy -----------------------------------------------------
  {
    const zone = settingZone(pharmacy.id),
      opts = { zoneId: zone };
    const pharmacyDoor = carDoor('courier-car', 10),
      homeDoor = carDoor('courier-car', 140),
      lotDoor = carDoor('courier-car', 250);
    const courier = new Track(
      'courier',
      'driver',
      { ...opts, label: 'Pharmacy courier', variant: 7 },
      p.counterFront,
    )
      .hold(70, 'document', {
        title: 'Checking the delivery manifest',
        face: p.counterBack,
      })
      .walk(80, [p.doorway, p.loading], { title: 'Carrying totes to the car' })
      .hold(86, 'serve', { title: 'Loading pill packs', face: p.loadingCar })
      .walk(92, [pharmacyDoor], { title: 'Setting off' })
      .hidden(130, 'Driving to the Wongs’ home', homeDoor)
      .walk(138, [h.courierWalkA, h.courierWalkB, h.handover], {
        title: 'Pill packs to the aide',
      })
      .hold(141, 'greet', { title: 'Handing over the packs', face: h.kerb })
      .walk(149, [h.courierWalkB, h.courierWalkA, homeDoor], {
        title: 'Back to the car',
      })
      .hidden(186, 'Driving to the center', lotDoor)
      .walk(216, [...CENTER_LOT.receivingWalk, CENTER_LOT.receivingDoor], {
        title: 'Pill packs for the day center',
      })
      .hold(226, 'serve', {
        title: 'Handing packs to rear receiving',
        face: CENTER_LOT.receivingFace,
      })
      .walk(256, [...[...CENTER_LOT.receivingWalk].reverse(), lotDoor], {
        title: 'Back to the car',
      })
      .hold(300, 'conversation', {
        title: 'Catching up with the receiving team',
        face: CENTER_LOT.receivingFace,
      })
      .hidden(422, 'Returning to the pharmacy', pharmacyDoor)
      .walk(430, [p.doorway, p.counterFront], { title: 'Back in the pharmacy' })
      .hold(CLOCK_END, 'document', {
        title: 'Next-day manifest',
        face: p.counterBack,
      });
    add(courier);
    const pharmacist = new Track(
      'pharmacist',
      'doctor',
      { ...opts, label: 'Pharmacist', variant: 2 },
      p.counterBack,
    )
      .hold(82, 'tabletop', {
        title: 'Checking each blister pack',
        face: p.counterFront,
      })
      .hold(140, 'document', {
        title: 'Medication reviews',
        face: p.counterFront,
      })
      .hold(220, 'tabletop', {
        title: 'Filling the next packs',
        face: p.counterFront,
      })
      .hold(400, 'document', {
        title: 'Calls with the Seen care team',
        face: p.counterFront,
      })
      .hold(CLOCK_END, 'tabletop', {
        title: 'Afternoon packing',
        face: p.counterFront,
      });
    add(pharmacist);
    const tech = new Track(
      'pharmacy-tech',
      'nurse',
      { ...opts, label: 'Pharmacy technician', variant: 3 },
      p.bench,
    )
      .hold(78, 'tabletop', {
        title: 'Sealing blister packs',
        face: p.benchTop,
      })
      .walk(84, [p.doorway, p.loadingSide], { title: 'Carrying a tote out' })
      .hold(88, 'serve', { title: 'Loading the courier', face: p.loadingCar })
      .walk(96, [p.doorway, p.bench], { title: 'Back to the bench' })
      .hold(CLOCK_END, 'tabletop', {
        title: 'Packing next week’s cycle',
        face: p.benchTop,
      });
    add(tech);
    interact(
      'pharmacy-packing',
      'pharmacy',
      zone,
      ['pharmacist', 'pharmacy-tech'],
      0,
      82,
      'Weekly pill packs · packing & checking',
      'The partner pharmacy prepares blister packs per participant; the pharmacist checks each against the current medication list.',
    );
    interact(
      'pharmacy-loading',
      'pharmacy',
      zone,
      ['courier', 'pharmacy-tech'],
      76,
      92,
      'Courier loading',
      'Totes for the home route and the day center are loaded; the courier leaves at 9:00.',
    );
    interact(
      'pharmacy-center-drop',
      'pharmacy',
      'site',
      ['courier'],
      186,
      256,
      'Pill packs to the center’s rear receiving',
      'The courier stops on the rear lot edge, clear of the delivery trucks, and walks the packs to receiving.',
    );
  }

  // --- Community hospital ---------------------------------------------------
  {
    const zone = settingZone(hospital.id),
      opts = { zoneId: zone };
    const rollPath = hospitalRollPath();
    const hospitalist = new Track(
      'hospitalist',
      'doctor',
      { ...opts, label: 'Hospitalist', variant: 4 },
      q.huddleA,
    )
      .hold(62, 'document', { title: 'Morning charting', face: q.patient })
      .walk(75, [q.bayFront, q.sidewalkIn, q.edBay], {
        title: 'Meeting an ambulance',
      })
      .hold(98, 'consult', { title: 'ED handoff', face: q.edBayVan })
      .walk(112, [q.sidewalkIn, q.bayFront, q.mdBedside], {
        title: 'Back to the ward',
      })
      .hold(225, 'document', { title: 'Orders & notes', face: q.patient })
      .hold(262, 'consult', { title: 'Rounds', face: q.patient })
      .walk(272, [q.mdOut, q.bayFrontL, q.bayFrontR, q.huddleA], {
        title: 'Between patients',
      })
      .hold(495, 'document', { title: 'Discharge summary', face: q.patient })
      .hold(525, 'consult', { title: 'Discharge huddle', face: q.huddleB })
      .hold(CLOCK_END, 'document', {
        title: 'Afternoon rounds',
        face: q.patient,
      });
    add(hospitalist);
    const cm = new Track(
      'hospital-cm',
      'social-worker',
      { ...opts, label: 'Hospital case manager', variant: 5 },
      q.huddleB,
    )
      .hold(225, 'document', {
        title: 'Discharge planning calls',
        face: q.patient,
      })
      .walk(228, [q.cmBedside], { title: 'Joining rounds' })
      .hold(262, 'consult', { title: 'Rounds', face: q.patient })
      .walk(265, [q.huddleB], { title: 'Back to planning' })
      .hold(360, 'conversation', {
        title: 'Confirming the ride and home services',
        face: q.huddleC,
      })
      .hold(495, 'document', { title: 'Discharge paperwork', face: q.patient })
      .hold(525, 'consult', { title: 'Discharge huddle', face: q.huddleC })
      .walk(528, [q.cmBedside], { title: 'To the bedside' })
      .hold(556, 'conversation', {
        title: 'Discharge instructions with Mr. Wong',
        face: q.patient,
      })
      .hold(575, 'greet', { title: 'Seeing him off', face: hospitalStop.foot })
      .walk(578, [q.huddleB], { title: 'Next patient' })
      .hold(CLOCK_END, 'document', {
        title: 'Afternoon planning',
        face: q.patient,
      });
    add(cm);
    const push = offsetBehind(rollPath, 0.9);
    const liaison = new Track(
      'seen-liaison-rn',
      'nurse',
      { ...opts, label: 'Seen liaison nurse', variant: 6 },
      q.sidewalkEnd,
    )
      .hidden(180, 'At the center')
      .walk(225, [q.sidewalkPad, q.sidewalkIn, q.bayFront, q.rnBedside], {
        title: 'Arriving for rounds',
      })
      .hold(262, 'consult', {
        title: 'Rounds with the hospital team',
        face: q.patient,
      })
      .hold(492, 'document', {
        title: 'Coordinating the discharge with the center',
        face: q.patient,
      })
      .walk(495, [q.huddleC], { title: 'Discharge huddle' })
      .hold(525, 'consult', { title: 'Discharge huddle', face: q.huddleA })
      .walk(528, [q.rnBedside], { title: 'To the bedside' })
      .hold(551, 'conversation', {
        title: 'Medication teach-back',
        face: q.patient,
      })
      .walk(556, [q.viaLeftA, q.viaLeftB, push[0]], {
        title: 'Taking the wheelchair',
      })
      .walk(566, push.slice(1), {
        action: 'escort',
        title: 'Wheeling Mr. Wong to the van',
      })
      .hold(575, 'greet', {
        title: 'Handing off to the driver',
        face: hospitalStop.sill,
      })
      .walk(582, [q.kerbStep, q.walkway, q.bayFront], {
        title: 'Back to the ward',
      })
      .hold(CLOCK_END, 'document', {
        title: 'Closing the admission',
        face: q.patient,
      });
    add(liaison);
    interact(
      'hospital-ed-arrival',
      'hospital',
      zone,
      ['hospitalist'],
      62,
      98,
      'Ambulance arrival at the ED',
      'A participant arrives by ambulance; the hospitalist takes the handoff and the Seen on-call line is notified.',
    );
    interact(
      'hospital-rounds',
      'hospital',
      zone,
      ['hospitalist', 'hospital-cm', 'seen-liaison-rn', 'hospital-participant'],
      225,
      262,
      'Rounds with the Seen liaison nurse',
      'Hospitalist, hospital case manager and the Seen liaison nurse round together so the discharge plan matches home services.',
    );
    interact(
      'hospital-discharge-huddle',
      'hospital',
      zone,
      ['hospitalist', 'hospital-cm', 'seen-liaison-rn'],
      495,
      525,
      'Discharge huddle',
      'Three-way huddle: medicines, home health start, meals and the Seen van pickup time.',
    );
    interact(
      'hospital-discharge',
      'hospital',
      zone,
      ['seen-liaison-rn', 'hospital-participant', 'community-driver'],
      551,
      575,
      'Mr. Wong · discharged to the Seen van',
      'The liaison nurse wheels Mr. Wong under the canopy and up the van ramp; the driver secures the chair.',
    );
  }

  // --- Specialty clinic: cardiology, optometry & imaging --------------------
  // Mrs. Wong's cardiology follow-up comes by the Seen van; after it two more
  // participants walk in from a Seen ride at the street kerb with an escort
  // aide, one at a time through the front desk: a diabetic eye exam (the
  // optometry exam 321–364 s) and a wrist X-ray after a fall (the scan
  // 452–495 s). The optometry pair walks out on the sidewalk's east half
  // while the imaging pair walks in on its west half.
  {
    const zone = settingZone(specialist.id),
      opts = { zoneId: zone };
    const escort = new Track(
      'escort-aide',
      'aide',
      { ...opts, label: 'Seen escort aide', variant: 9 },
      h.porch,
    )
      .ride(179, VAN, 'escort', 'Riding with Mrs. Wong')
      // From the window bench by way of the door, then down the ramp.
      .walk(182.5, [clinic.sill, clinic.foot], {
        title: 'Down the van ramp',
        from: clinic.cabin,
        fromY: VAN_FLOOR,
        ys: [VAN_FLOOR],
      })
      .walk(189, [c.kerb, c.entrance, c.checkIn], { title: 'Into the clinic' })
      .hold(192, 'greet', {
        title: 'Checking Mrs. Wong in',
        face: c.receptionMa,
      })
      .walk(195, [c.waitB], { title: 'To the waiting area' })
      .hold(245, 'seated', {
        title: 'Waiting; confirming the ride home',
        heading: rel(specialist),
      })
      .walk(248, [c.waitFront], { title: 'Meeting her' })
      .hold(250, 'greet', { title: 'All done?', face: c.doorway })
      .walk(256.5, [c.entrance, c.kerb, clinic.foot], {
        title: 'Back to the van',
      })
      .walk(260, [clinic.sill, clinic.cabin], {
        title: 'Up the van ramp',
        ys: [VAN_FLOOR, VAN_FLOOR],
      })
      .ride(CLOCK_END, VAN, 'escort', 'Riding along');
    add(escort);
    const md = new Track(
      'specialist-md',
      'doctor',
      { ...opts, label: 'Cardiologist', variant: 6 },
      c.mdDesk,
    )
      .hold(202, 'document', {
        title: 'Reviewing the referral',
        heading: rel(specialist, Math.PI),
      })
      .walk(206, [c.examMd], { title: 'Into the exam room' })
      .hold(243, 'consult', { title: 'Cardiology follow-up', face: c.examSeat })
      .walk(247, [c.mdDesk], { title: 'Back to the desk' })
      .hold(CLOCK_END, 'document', {
        title: 'Consult note to the Seen PCP',
        heading: rel(specialist, Math.PI),
      });
    add(md);
    const ma = new Track(
      'clinic-ma',
      'nurse',
      { ...opts, label: 'Clinic medical assistant', variant: 7 },
      c.receptionMa,
    )
      .hold(189, 'document', { title: 'Front desk', heading: rel(specialist) })
      .hold(197, 'greet', { title: 'Checking in Mrs. Wong', face: c.checkIn })
      .walk(212, [c.deskEnd, c.lobbyMid, c.doorway, c.examIn, c.examMa], {
        title: 'To the exam room',
      })
      .hold(224, 'treat', {
        title: 'Blood pressure & weight',
        face: c.examSeat,
      })
      .walk(239, [c.examIn, c.doorway, c.lobbyMid, c.deskEnd, c.receptionMa], {
        title: 'Back to the desk',
      })
      .hold(288, 'document', {
        title: 'Scheduling the next visit',
        heading: rel(specialist),
      })
      .hold(294, 'greet', {
        title: 'Checking in the eye exam',
        face: c.checkIn,
      })
      .hold(410, 'document', {
        title: 'Referrals and scheduling',
        heading: rel(specialist),
      })
      .hold(416, 'greet', { title: 'Checking in the X-ray', face: c.checkIn })
      .hold(CLOCK_END, 'document', {
        title: 'Visit summaries to the Seen PCP',
        heading: rel(specialist),
      });
    add(ma);
    interact(
      'specialist-dropoff',
      'specialist',
      zone,
      ['community-driver', 'home-participant', 'escort-aide'],
      175,
      195,
      'Van drop-off at the clinic',
      'Ramp down under the canopy; the escort aide walks Mrs. Wong in and checks her in.',
    );
    interact(
      'specialist-visit',
      'specialist',
      zone,
      ['home-participant', 'specialist-md', 'clinic-ma'],
      206,
      243,
      'Cardiology follow-up',
      'Vitals by the medical assistant, then the cardiologist; the consult note goes back to the Seen primary care team.',
    );
    interact(
      'specialist-return',
      'specialist',
      zone,
      ['home-participant', 'escort-aide', 'community-driver'],
      243,
      268,
      'Back to the van',
      'The escort aide meets her at the door and they board for home.',
    );

    // Optometry: a diabetic eye exam and glasses check. The escort leads
    // her up from the kerb and waits in the lobby; the technician calls her
    // in, steps aside while she sits down and does the pre-test; the
    // optometrist examines her at the slit lamp and refracts.
    const east = rel(specialist, Math.PI / 2),
      west = rel(specialist, -Math.PI / 2),
      back = rel(specialist, Math.PI);
    const kerbIn = [c.sidewalkPad, c.approachA, c.approachB, c.approachC],
      kerbOut = [
        c.approachCOut,
        c.approachBOut,
        c.approachAOut,
        c.sidewalkPadOut,
        c.sidewalkEndOut,
      ];
    const optoEscort = new Track(
      'optometry-escort',
      'aide',
      { ...opts, label: 'Seen escort aide · eye exam', variant: 4 },
      c.sidewalkEnd,
    )
      .hidden(250, 'Seen ride to the clinic')
      .walk(288, [...kerbIn, c.checkIn], { title: 'In from the kerb' })
      .hold(294, 'greet', {
        title: 'Checking her in for the eye exam',
        face: c.receptionMa,
      })
      .walk(297, [c.waitB], { title: 'To the waiting area' })
      .hold(377, 'seated', {
        title: 'Waiting; updating the Seen care team',
        heading: rel(specialist),
      })
      .walk(379, [c.escortMeet], { title: 'Meeting her' })
      .hold(381, 'greet', { title: 'All done?', face: c.waitFront })
      .walk(418, kerbOut, { title: 'Out to the Seen ride' })
      .hidden(CLOCK_END, 'Seen ride back to the center');
    add(optoEscort);
    const optoParticipant = new Track(
      'optometry-participant',
      'participant',
      {
        ...opts,
        label: 'Seen participant · eye exam',
        variant: 5,
        mobility: 'cane',
      },
      c.sidewalkEnd,
    )
      .hidden(251.5, 'Seen ride to the clinic')
      .walk(289.5, [...kerbIn, c.checkInB], {
        title: 'In from the kerb with her escort',
      })
      .hold(294, 'greet', { title: 'Checking in', face: c.receptionMa })
      .walk(297.5, [c.waitA], { title: 'To the waiting area' })
      .hold(303, 'seated', { title: 'Waiting', heading: rel(specialist) })
      .walk(
        321,
        [
          c.waitFront,
          c.galleryA,
          c.optoIn,
          c.optoApproach,
          c.optoSide,
          c.optoSeat,
        ],
        { title: 'Into the eye room' },
      )
      .hold(336, 'seated', {
        title: 'Acuity, eye pressure and dilating drops',
        heading: east,
      })
      .hold(364, 'seated', {
        title: 'Retina exam at the slit lamp; new glasses',
        heading: east,
      })
      .walk(
        380,
        [c.optoSide, c.optoApproach, c.optoIn, c.galleryA, c.waitFront],
        { title: 'Back to the lobby' },
      )
      .hold(382.5, 'greet', { title: 'All done', face: c.escortMeet })
      .walk(419.5, kerbOut, { title: 'Out to the Seen ride' })
      .hidden(CLOCK_END, 'Seen ride home');
    add(optoParticipant);
    const optoTech = new Track(
      'optometry-tech',
      'nurse',
      { ...opts, label: 'Optometric technician', variant: 11 },
      c.optoCounter,
    )
      .hold(296, 'tabletop', {
        title: 'Calibrating the autorefractor',
        heading: back,
      })
      .walk(303, [c.optoWest, c.galleryA, c.lobbyCall], {
        title: 'Calling her in',
      })
      .hold(305, 'greet', { title: 'Calling her in', face: c.waitA })
      .walk(314, [c.galleryA, c.optoIn, c.optoAside], {
        title: 'Leading the way to the eye room',
      })
      .hold(322, 'greet', { title: 'Have a seat', face: c.optoSeat })
      .walk(324.5, [c.optoTech], { title: 'To her side' })
      .hold(334, 'treat', {
        title: 'Acuity, eye pressure and dilating drops',
        face: c.optoSeat,
      })
      .walk(337, [c.optoCounter], { title: 'Her glasses to the lensometer' })
      .hold(348, 'tabletop', {
        title: 'Reading her glasses on the lensometer',
        heading: back,
      })
      .hold(CLOCK_END, 'document', {
        title: 'Booking her yearly eye exam',
        heading: back,
      });
    add(optoTech);
    const optometrist = new Track(
      'optometrist',
      'doctor',
      { ...opts, label: 'Optometrist', variant: 3 },
      c.optoDesk,
    )
      .hold(334, 'document', {
        title: 'Reading her diabetes referral',
        heading: back,
        seated: true,
      })
      .walk(338, [c.optoStool], { title: 'To the slit lamp' })
      .hold(350, 'treat', {
        title: 'Dilated retina exam at the slit lamp',
        heading: west,
        seated: true,
      })
      .hold(361, 'consult', {
        title: 'Refraction for new glasses; results explained',
        face: c.optoSeat,
        seated: true,
      })
      .walk(365, [c.optoDesk], { title: 'Back to the desk' })
      .hold(CLOCK_END, 'document', {
        title: 'Eye exam report to the Seen PCP',
        heading: back,
        seated: true,
      });
    add(optometrist);
    interact(
      'optometry-checkin',
      'specialist',
      zone,
      ['optometry-escort', 'optometry-participant', 'clinic-ma'],
      288,
      297,
      'Eye exam · walk-in and check-in',
      'A Seen ride drops her at the kerb; her escort aide walks her up from the street and checks her in for the diabetic eye exam.',
    );
    interact(
      'optometry-exam',
      'specialist',
      zone,
      ['optometry-participant', 'optometry-tech', 'optometrist'],
      321,
      364,
      'Diabetic eye exam · optometry',
      'The technician checks acuity and eye pressure, dilates her eyes and reads her glasses on the lensometer; the optometrist examines the retina at the slit lamp and refracts for new glasses. The report goes back to the Seen primary care provider for her diabetes plan.',
    );

    // Imaging: a wrist X-ray six weeks after a fall. The radiologic
    // technologist calls her in from the lobby, seats her at the table's end
    // with her forearm under the tube, takes the views from the console
    // behind the shielded window and checks them with her.
    const imagingEscort = new Track(
      'imaging-escort',
      'aide',
      { ...opts, label: 'Seen escort aide · X-ray', variant: 7 },
      c.sidewalkEnd,
    )
      .hidden(372, 'Seen ride to the clinic')
      .walk(410, [...kerbIn, c.checkIn], { title: 'In from the kerb' })
      .hold(416, 'greet', {
        title: 'Checking her in for the X-ray',
        face: c.receptionMa,
      })
      .walk(419, [c.waitB], { title: 'To the waiting area' })
      .hold(515, 'seated', {
        title: 'Waiting; confirming the ride home',
        heading: rel(specialist),
      })
      .walk(517, [c.escortMeet], { title: 'Meeting her' })
      .hold(518, 'greet', { title: 'How did it go?', face: c.waitFront })
      .walk(555, kerbOut, { title: 'Out to the Seen ride' })
      .hidden(CLOCK_END, 'Seen ride back to the center');
    add(imagingEscort);
    const imagingParticipant = new Track(
      'imaging-participant',
      'participant',
      { ...opts, label: 'Seen participant · X-ray', variant: 9 },
      c.sidewalkEnd,
    )
      .hidden(373.5, 'Seen ride to the clinic')
      .walk(411.5, [...kerbIn, c.checkInB], {
        title: 'In from the kerb with her escort',
      })
      .hold(416, 'greet', { title: 'Checking in', face: c.receptionMa })
      .walk(419.5, [c.waitA], { title: 'To the waiting area' })
      .hold(429, 'seated', { title: 'Waiting', heading: rel(specialist) })
      .walk(
        452,
        [c.waitFront, c.galleryA, c.galleryB, c.imagingIn, c.imagingSeat],
        { title: 'Into the X-ray room' },
      )
      .hold(495, 'tabletop', {
        title: 'Wrist X-ray: forearm on the table, under the tube',
        heading: west,
        seated: true,
      })
      .walk(517, [c.imagingIn, c.galleryB, c.galleryA, c.waitFront], {
        title: 'Back to the lobby',
      })
      .hold(519.5, 'greet', { title: 'All done', face: c.escortMeet })
      .walk(556.5, kerbOut, { title: 'Out to the Seen ride' })
      .hidden(CLOCK_END, 'Seen ride home');
    add(imagingParticipant);
    const toConsole = [c.imagingAround, c.alcoveGate, c.alcoveIn],
      toTable = [c.alcoveIn, c.alcoveGate, c.imagingAround, c.imagingTech];
    const imagingTech = new Track(
      'imaging-tech',
      'nurse',
      { ...opts, label: 'Radiologic technologist', variant: 10 },
      c.imagingConsole,
    )
      .hold(416, 'document', {
        title: 'Morning quality checks and the worklist',
        heading: east,
        seated: true,
      })
      .walk(427, [c.alcoveIn, c.galleryB, c.galleryA, c.lobbyCall], {
        title: 'Calling her in',
      })
      .hold(429, 'greet', { title: 'Calling her in', face: c.waitA })
      .walk(
        444,
        [c.galleryA, c.galleryB, c.alcoveGate, c.imagingAround, c.imagingTech],
        { title: 'Leading the way to X-ray' },
      )
      .hold(452, 'treat', {
        title: 'Setting up the table and the tube',
        face: c.imagingSeat,
      })
      .hold(461, 'treat', {
        title: 'Positioning her wrist under the collimator light',
        face: c.imagingSeat,
      })
      .walk(469, [...toConsole, c.imagingConsole], {
        title: 'Behind the shielded window',
      })
      .hold(481, 'document', {
        title: 'Taking three views of the wrist',
        heading: east,
        seated: true,
      })
      .walk(489, toTable, { title: 'Back to the table' })
      .hold(495, 'consult', {
        title: 'The images look clear; the radiologist reads them today',
        face: c.imagingSeat,
      })
      .hold(499, 'greet', { title: 'Seeing her out', face: c.imagingIn })
      .walk(507, [...toConsole, c.imagingConsole], { title: 'To the console' })
      .hold(CLOCK_END, 'document', {
        title: 'Images to the radiologist; the read to the Seen PCP',
        heading: east,
        seated: true,
      });
    add(imagingTech);
    interact(
      'imaging-checkin',
      'specialist',
      zone,
      ['imaging-escort', 'imaging-participant', 'clinic-ma'],
      410,
      419,
      'X-ray · walk-in and check-in',
      'A Seen ride drops her at the kerb; her escort aide walks her up from the street and checks her in for the X-ray her primary care provider ordered.',
    );
    interact(
      'imaging-scan',
      'specialist',
      zone,
      ['imaging-participant', 'imaging-tech'],
      452,
      495,
      'Wrist X-ray after a fall · imaging',
      'Six weeks after a fall onto her hand, the radiologic technologist positions her forearm under the overhead tube and takes three views from behind the shielded window. The radiologist’s read goes back to the Seen primary care provider, who plans her hand therapy and a bone-density scan.',
    );
  }

  // --- The Seen van's driver and the after-hours nurse line -----------------
  {
    const around = (s: ReturnType<typeof vanStop>): Vec2[] => [
      s.nose,
      s.noseRight,
      s.aside,
    ];
    const back = (s: ReturnType<typeof vanStop>): Vec2[] => [
      s.noseRight,
      s.nose,
      s.driverDoor,
    ];
    const pushHome = offsetBehind(crossing(homePm.foot), 0.9);
    const driver = new Track(
      'community-driver',
      'driver',
      { zoneId: homeZone, label: 'Seen driver · community runs', variant: 11 },
      homeAm.driverDoor,
    )
      .ride(67, VAN, 'driver', 'At the wheel')
      .walk(75, around(homeAm), {
        title: 'Deploying the ramp',
        from: homeAm.driverDoor,
      })
      .hold(108, 'greet', {
        title: 'Guiding Mrs. Wong aboard',
        face: homeAm.foot,
      })
      .walk(113, back(homeAm), { title: 'Back to the wheel' })
      .ride(172.5, VAN, 'driver', 'Driving to the specialist')
      .walk(178.5, around(clinic), {
        title: 'Deploying the ramp',
        from: clinic.driverDoor,
      })
      .hold(190, 'greet', {
        title: 'Ramp down at the clinic',
        face: clinic.foot,
      })
      .walk(195, back(clinic), { title: 'Back to the wheel' })
      .ride(244, VAN, 'driver', 'Waiting at the clinic')
      .walk(249, around(clinic), {
        title: 'Ramp for the trip home',
        from: clinic.driverDoor,
      })
      .hold(259, 'greet', { title: 'Boarding', face: clinic.foot })
      .walk(264, back(clinic), { title: 'Back to the wheel' })
      .ride(330, VAN, 'driver', 'Driving home')
      .walk(335, around(homeNoon), {
        title: 'Deploying the ramp',
        from: homeNoon.driverDoor,
      })
      .hold(349, 'greet', { title: 'Ramp down at home', face: homeNoon.foot })
      .walk(354, back(homeNoon), { title: 'Back to the wheel' })
      .ride(540, VAN, 'driver', 'Waiting, then the hospital run')
      .walk(546, around(hospitalStop), {
        title: 'Ramp under the canopy',
        from: hospitalStop.driverDoor,
      })
      .hold(569.5, 'greet', {
        title: 'Securing the wheelchair',
        face: hospitalStop.foot,
      })
      .walk(575, back(hospitalStop), { title: 'Back to the wheel' })
      .ride(642, VAN, 'driver', 'Driving Mr. Wong home')
      .walk(647, around(homePm), {
        title: 'Deploying the ramp',
        from: homePm.driverDoor,
      })
      .hold(652.5, 'greet', { title: 'Ramp down', face: homePm.foot })
      .walk(653.5, [pushHome[0]], { title: 'Taking the wheelchair' })
      .walk(663.5, pushHome.slice(1), {
        action: 'escort',
        title: 'Wheeling Mr. Wong to the porch ramp',
      })
      .walk(668.5, [h.rampTopBehind], {
        action: 'escort',
        title: 'Up the porch ramp',
        ys: [PORCH_Y],
      })
      .walk(672, [toward(h.door, h.rampTop, 0.9)], {
        action: 'escort',
        title: 'To the front door',
        ys: [PORCH_Y],
      })
      .hold(676, 'greet', {
        title: 'Handing over the discharge folder',
        face: h.door,
      })
      .walk(
        700,
        [
          h.rampTop,
          h.rampFoot,
          h.driverBackA,
          h.driverBackB,
          homePm.aside,
          homePm.noseRight,
          homePm.nose,
          homePm.driverDoor,
        ],
        { title: 'Back to the van', ys: [PORCH_Y, PAD_Y] },
      )
      .ride(CLOCK_END, VAN, 'driver', 'At the wheel');
    add(driver);
    const desk = model.objects
      .filter(
        (o) =>
          o.zoneId === NURSE_LINE_DESK.zoneId &&
          o.assetId === NURSE_LINE_DESK.assetId,
      )
      .sort(
        (a, b) =>
          b.position[2] - a.position[2] || b.position[0] - a.position[0],
      )[0];
    if (!desk)
      throw new Error(
        `No ${NURSE_LINE_DESK.assetId} in ${NURSE_LINE_DESK.zoneId} for the nurse line`,
      );
    const deskAt: Vec2 = [desk.position[0], desk.position[2]];
    const nurseLine = new Track(
      'nurse-line-rn',
      'nurse',
      {
        zoneId: 'upper-office',
        levelId: 'upper',
        ground: false,
        label: '24/7 nurse line RN',
        variant: 12,
        seated: true,
        seatId: desk.id,
      },
      deskAt,
    )
      .hold(690, 'document', {
        title: 'Nurse line & on-call coordination',
        heading: 0,
      })
      .hold(708, 'conversation', { title: 'Call with Mrs. Wong', heading: 0 })
      .hold(CLOCK_END, 'document', { title: 'Logging the call', heading: 0 });
    add(nurseLine);
  }

  // --- Mrs. Lin's home ---------------------------------------------------------
  // She and her daughter come from the home's generated cast (below, with
  // `HOLE_LEGS`); here are her van's driver and the two van touchpoints.
  {
    const zone = settingZone('home-lin');
    add(linVanDriver());
    interact(
      'lin-van-pickup',
      'home',
      zone,
      ['lin-at-home', 'lin-daughter', 'lin-van-driver'],
      22.5,
      50,
      'Mrs. Lin · picked up by the Seen van',
      'Her daughter walks her out of the front door, down the porch ramp and along the drive; the driver meets them at the van ramp, follows her up it and sees her into her seat for the ride to the Seen center.',
    );
    interact(
      'lin-van-dropoff',
      'home',
      zone,
      ['lin-at-home', 'lin-daughter', 'lin-van-driver'],
      630,
      661,
      'Mrs. Lin · home on the Seen van',
      'The van brings her home at 3:00: the driver sees her down the van ramp and walks behind her along the drive to the porch ramp, where her daughter meets her and they go in together.',
    );
  }

  // --- People inside facility instances (generated casts) --------------------
  const authored = new Set(actors.map((a) => a.id));
  for (const s of careSettings) {
    const cast = instanceCasts.casts[s.id];
    if (!s.facility || !cast) continue;
    const placed = placeInstanceCast(s, cast);
    for (const a of placed.actors) {
      if (authored.has(a.id))
        throw new Error(
          `${a.id} is authored here and generated in the ${s.id} cast; keep one`,
        );
      const holes = placed.holes[a.id],
        legs = HOLE_LEGS[a.id];
      actors.push(
        holes && legs ? fillHoles(a, holes, (hole) => legs(hole, s)) : a,
      );
    }
    interactions.push(...placed.interactions);
  }

  return {
    id: COMMUNITY_SOURCE_ID,
    description:
      'Around the center, the same care team runs home care, home health, pill-pack delivery, meals, home modifications, specialist escorts, hospital discharge coordination and a 24/7 nurse line, joined by door-to-door transport.',
    actors,
    interactions,
    views: [COMMUNITY_VIEW],
    zones: careSettings.map((s) => {
      const rooms = instanceRooms(s).map((r) => ({
        id: r.id,
        name: `${s.short} · ${r.label ?? r.name}`,
        polygon: r.polygon,
      }));
      return {
        id: settingZone(s.id),
        name: s.traceName ?? s.name,
        levelId: 'site',
        polygon: padPolygon(s),
        color: s.accent,
        ...(rooms.length ? { rooms } : {}),
      };
    }),
    evidence: [
      'Distributed-care settings are illustrative pads on the paper ground beyond the ring streets; timings are compressed onto the 720 s care-day clock.',
    ],
  };
}
export { COMMUNITY_CATEGORIES } from './community-settings';
