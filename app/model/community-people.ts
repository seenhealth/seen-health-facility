import type { Action, CharacterRole } from './characters';
import type { ActorSpec, Interaction, Segment } from './activity';
import type { Facility, Vec2 } from './schema';
import type { SourceExtension } from './sources';
import { FLEET_VAN_RAMP } from './photo-assets';
import {
  careSettingById,
  careSettings,
  groundYAt,
  padPolygon,
  PAD_Y,
  PORCH_Y,
  settingZone,
  toLocal,
  type CareSetting,
} from './community-settings';
import {
  CENTER_LOT,
  carDoorWorld,
  communityVehicleById,
  sampleCommunityVehicle,
  vanRampWorld,
} from './community-vehicles';

/**
 * People and touchpoints in the distributed-care settings, on the same 720 s
 * clock as the center. Every actor lives on `levelId: 'site'` in the zone
 * `community:<settingId>` (the nurse line sits upstairs in the center), and
 * every track covers 0–720 contiguously: short straight walks on the pads,
 * static poses otherwise, and seats in the community vehicles while riding.
 * Loop seconds throughout: 1 s = 40 clock seconds, 8 AM = 0, 4 PM = 720.
 */
/** Source id of the community layer (`ActorSpec.sourceId` after composition). */
export const COMMUNITY_SOURCE_ID = 'community';
/** The filter view the layer adds to the activity panel. */
export const COMMUNITY_VIEW = {
  id: 'community',
  label: 'Homes, pharmacy, hospital & partners',
};
const VAN = 'van-community';
const CLOCK_END = 720;
const VAN_FLOOR = 0.35;
const seatOf = (vehicleId: string, seat: string) =>
  communityVehicleById(vehicleId)!.seats[seat];
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
const facing = (from: Vec2, to: Vec2) =>
  Math.atan2(to[0] - from[0], to[1] - from[1]);
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

type TrackOptions = {
  label: string;
  variant: number;
  levelId?: string;
  zoneId: string;
  /** False for people on a building level, whose height comes from the level. */
  ground?: boolean;
  mobility?: 'cane' | 'walker' | 'wheelchair';
  seated?: boolean;
  seatId?: string;
};
type WalkOptions = {
  action?: 'walk' | 'roll' | 'escort';
  title?: string;
  /** Heights per point (undefined entries fall back to the ground). */
  ys?: (number | undefined)[];
  /** Start here instead of the cursor (stepping out of a seat). */
  from?: Vec2;
  fromY?: number;
};
/** Appends contiguous segments and keeps a cursor so nothing teleports. */
class Track {
  private t = 0;
  private at: Vec2;
  private y: number | undefined;
  private heading = 0;
  readonly segments: Segment[] = [];
  constructor(
    readonly id: string,
    readonly role: CharacterRole,
    private readonly o: TrackOptions,
    start: Vec2,
    y?: number,
  ) {
    this.at = start;
    this.y = y ?? this.groundAt(start);
  }
  private push(s: Omit<Segment, 'start' | 'end' | 'zoneId'> & { end: number }) {
    if (s.end <= this.t)
      throw new Error(
        `${this.id}: segment ending ${s.end} does not advance past ${this.t}`,
      );
    const { end, ...rest } = s;
    this.segments.push({ start: this.t, end, zoneId: this.o.zoneId, ...rest });
    this.t = end;
  }
  private groundAt(p: Vec2) {
    return this.o.ground === false ? undefined : groundYAt(p);
  }
  private heights() {
    return this.y === undefined ? undefined : [this.y, this.y];
  }
  /** Stay put doing `action` until `until`. */
  hold(
    until: number,
    action: Action,
    opts: { title?: string; face?: Vec2; heading?: number; y?: number } = {},
  ) {
    if (opts.heading !== undefined) this.heading = opts.heading;
    else if (opts.face) this.heading = facing(this.at, opts.face);
    if (opts.y !== undefined) this.y = opts.y;
    this.push({
      end: until,
      action,
      path: [this.at, this.at],
      heading: this.heading,
      heights: this.heights(),
      title: opts.title,
    });
    return this;
  }
  /** Out of sight (indoors, in a car) until `until`; may relocate meanwhile. */
  hidden(until: number, title: string, at?: Vec2, y?: number) {
    if (at) {
      this.at = at;
      this.y = y ?? this.groundAt(at);
    }
    this.push({
      end: until,
      action: 'idle',
      path: [this.at, this.at],
      heading: this.heading,
      heights: this.heights(),
      visible: false,
      title,
    });
    return this;
  }
  /** Walk from the cursor through `points`; heights follow the ground unless given. */
  walk(until: number, points: Vec2[], opts: WalkOptions = {}) {
    if (opts.from) {
      this.at = opts.from;
      this.y = opts.fromY ?? this.groundAt(opts.from);
    }
    const path = [this.at, ...points];
    const ys = path.map((p, i) =>
      i === 0 ? this.y : (opts.ys?.[i - 1] ?? this.groundAt(p)),
    );
    const heights = ys.every((v) => v !== undefined)
      ? (ys as number[])
      : undefined;
    this.push({
      end: until,
      action: opts.action || 'walk',
      path,
      heading: this.heading,
      heights,
      title: opts.title,
    });
    this.at = path.at(-1)!;
    this.y = heights?.at(-1);
    this.heading = facing(path.at(-2)!, path.at(-1)!);
    return this;
  }
  /** Ride in a registered vehicle seat until `until`. */
  ride(until: number, vehicleId: string, seat: string, title: string) {
    this.push({
      end: until,
      action: 'ride',
      path: [this.at, this.at],
      heading: this.heading,
      heights: this.heights(),
      vehicleId,
      seat: seatOf(vehicleId, seat),
      seatHeading: Math.PI,
      seated: true,
      title,
    });
    return this;
  }
  build(): ActorSpec {
    if (this.t !== CLOCK_END)
      throw new Error(`${this.id} ends at ${this.t}, not ${CLOCK_END}`);
    return {
      id: this.id,
      role: this.role,
      variant: this.o.variant,
      label: this.o.label,
      offset: 0,
      levelId: this.o.levelId || 'site',
      segments: this.segments,
      mobility: this.o.mobility,
      seated: this.o.seated,
      seatId: this.o.seatId,
    };
  }
}

/** Points around the Seen van at a stop: door sill, ramp foot, the driver's places. */
function vanStop(time: number) {
  const pose = sampleCommunityVehicle(VAN, time),
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
  };
}

export function communitySource(model: Facility): SourceExtension {
  const home = careSettingById('home-lin')!,
    pharmacy = careSettingById('pharmacy')!,
    hospital = careSettingById('hospital')!,
    specialist = careSettingById('specialist')!,
    adc = careSettingById('partner-adc')!;
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
    c = A(specialist),
    d = A(adc);
  const homeZone = settingZone(home.id);
  // Van stops (the van is parked at each for these moments).
  const homeAm = vanStop(10),
    clinic = vanStop(200),
    homeNoon = vanStop(400),
    hospitalStop = vanStop(560),
    homePm = vanStop(700);
  /** Pad crossing between the van's ramp foot and the porch ramp foot. */
  /** Van ramp foot → porch ramp foot: down the drive edge, then a gentle loop in from the south. */
  const crossing = (foot: Vec2): Vec2[] => [
    foot,
    h.crossA,
    h.crossB,
    h.crossC,
    h.crossD,
    h.rampFoot,
  ];
  const crossingBack = (foot: Vec2): Vec2[] => [...crossing(foot)].reverse();

  // --- The Wongs' home ------------------------------------------------------
  {
    const opts = { zoneId: homeZone };
    const wong = new Track(
      'home-participant',
      'participant',
      { ...opts, label: 'Mrs. Wong · at home', variant: 3, mobility: 'walker' },
      h.porchSeat,
      PORCH_Y,
    )
      .hold(48, 'seated', {
        title: 'Morning on the porch',
        heading: rel(home),
      })
      .hold(52, 'greet', { title: 'Her aide arrives', face: h.pcaCare })
      .hold(73, 'seated', {
        title: 'Personal care & morning medicines',
        heading: rel(home),
      })
      .walk(79, [h.porch, h.rampTop], {
        title: 'Out to the van',
        ys: [PORCH_Y, PORCH_Y],
      })
      .walk(87, [h.rampFoot], { title: 'Down the new ramp', ys: [PAD_Y] })
      .walk(105, crossingBack(homeAm.foot).slice(1), {
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
      .walk(358.5, crossing(homeNoon.foot).slice(1), { title: 'Home again' })
      .walk(366.5, [h.rampTop], { title: 'Up the ramp', ys: [PORCH_Y] })
      .walk(374.5, [h.porch, h.porchSeat], {
        title: 'Onto the porch',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(420, 'seated', {
        title: 'Lunch on the porch',
        heading: rel(home),
      })
      .walk(425, [h.porch, h.door], {
        title: 'Inside to rest',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hidden(458, 'Resting inside')
      .walk(462, [h.porch, h.porchGreet], {
        title: 'Out to see the ramp work',
        from: h.door,
        fromY: PORCH_Y,
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(495, 'consult', {
        title: 'Reviewing the grab bars with the OT',
        face: h.barWork,
      })
      .walk(500, [h.porchSeatVia1, h.porchSeatVia2, h.porchSeat], {
        title: 'Back to her chair',
        ys: [PORCH_Y, PORCH_Y, PORCH_Y],
      })
      .hold(560, 'seated', {
        title: 'Afternoon on the porch',
        heading: rel(home),
      })
      .walk(566, [h.porch, h.door], { title: 'Inside', ys: [PORCH_Y, PORCH_Y] })
      .hidden(644, 'Waiting for Mr. Wong')
      .walk(648, [h.porch, h.porchGreet], {
        title: 'Out to meet the van',
        from: h.door,
        fromY: PORCH_Y,
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(683.5, 'greet', {
        title: 'Welcoming Mr. Wong home',
        face: h.rampTop,
      })
      .walk(690, [h.porchSeatVia1, h.porchSeatVia2, h.porchSeat], {
        title: 'Sitting with him',
        ys: [PORCH_Y, PORCH_Y, PORCH_Y],
      })
      .hold(708, 'conversation', {
        title: 'On the phone with the nurse line',
        heading: rel(home),
      })
      .hold(CLOCK_END, 'seated', {
        title: 'Evening on the porch',
        heading: rel(home),
      });
    add(wong);
    const pca = new Track(
      'home-pca',
      'aide',
      { ...opts, label: 'Personal care aide', variant: 2 },
      h.stallStand,
    )
      .hidden(28, 'Driving to the visit')
      .walk(
        50,
        [
          h.padCornerNear,
          h.padCornerFar,
          h.porchStepFoot,
          h.porchStep,
          h.pcaCare,
        ],
        {
          title: 'Arriving for the morning visit',
          ys: [undefined, undefined, undefined, PORCH_Y, PORCH_Y],
        },
      )
      .hold(52, 'greet', { title: 'Good morning', face: h.porchSeat })
      .hold(71, 'treat', {
        title: 'Personal care: hair, medicines, breakfast',
        face: h.porchSeat,
      })
      .walk(78, [h.porchFrontEast, h.rampTopAside], {
        title: 'Walking her to the ramp',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hold(110, 'greet', { title: 'Waving her off', face: homeAm.foot })
      .walk(114, [h.pcaWait, h.kerb], {
        title: 'Waiting for the pharmacy courier',
      })
      .hold(130, 'idle', {
        title: 'Waiting for the pharmacy courier',
        heading: rel(home),
      })
      .hold(141, 'greet', {
        title: 'Taking the pill packs from the courier',
        face: h.handover,
      })
      .walk(
        152,
        [h.porchApproach, h.porchStepFoot, h.porchStep, h.porchAside],
        {
          title: 'Back to the porch',
          ys: [undefined, undefined, PORCH_Y, PORCH_Y],
        },
      )
      .hold(200, 'serve', {
        title: 'Preparing lunch & tidying',
        face: h.porchTable,
      })
      .walk(204, [h.porch, h.door], {
        title: 'Housekeeping inside',
        ys: [PORCH_Y, PORCH_Y],
      })
      .hidden(310, 'Housekeeping & laundry')
      .walk(330, [h.porch, h.rampTop, h.rampFoot, h.pcaMeetA, h.pcaMeetB], {
        title: 'Out to meet the van',
        from: h.door,
        fromY: PORCH_Y,
        ys: [PORCH_Y, PORCH_Y, PAD_Y],
      })
      .hold(340.5, 'greet', { title: 'Meeting the van', face: homeNoon.foot })
      .walk(358.5, [h.pcaWalkA, h.pcaWalkB], { title: 'Walking her home' })
      .hold(364, 'greet', { title: 'Up you go', face: h.rampFoot })
      .walk(
        393,
        [
          h.pcaBack,
          h.porchApproach,
          h.padCornerFar,
          h.padCornerNear,
          h.stallStand,
        ],
        { title: 'Off to the next client' },
      )
      .hidden(CLOCK_END, 'Driving to the next client');
    add(pca);
    const rn = new Track(
      'home-rn',
      'nurse',
      { ...opts, label: 'Home health nurse', variant: 5 },
      h.sidewalkEnd,
    )
      .hidden(600, 'On other visits')
      .walk(
        648,
        [
          h.sidewalkPad,
          h.padCorner,
          h.porchApproach,
          h.porchStepFoot,
          h.porchStep,
          h.porchNurse,
        ],
        {
          title: 'Arriving for the discharge visit',
          ys: [undefined, undefined, undefined, undefined, PORCH_Y, PORCH_Y],
        },
      )
      .hold(683.5, 'greet', { title: 'Meeting the van', face: h.rampTop })
      .hold(696, 'treat', {
        title: 'Vitals & medication reconciliation',
        face: h.wheelchairSpot,
      })
      .hold(700, 'document', {
        title: 'Charting the visit',
        face: h.wheelchairSpot,
      })
      .walk(718, [h.porchStep, h.porchStepFoot, h.porchApproach, h.padCorner], {
        title: 'Heading to the car',
        ys: [PORCH_Y],
      })
      .hidden(CLOCK_END, 'Driving to the next visit');
    add(rn);
    const ot = new Track(
      'home-ot',
      'ot',
      { ...opts, label: 'Occupational therapist', variant: 1 },
      h.sidewalkEnd,
    )
      .hidden(426, 'Driving over with the installer')
      .walk(468, [h.sidewalkPad, h.padCorner, h.barWork], {
        title: 'Arriving for the home modification',
      })
      .hold(495, 'consult', {
        title: 'Grab-bar placement with Mrs. Wong',
        face: h.porchGreet,
      })
      .hold(540, 'craft', {
        title: 'Fitting the porch grab bar',
        face: h.porchStepOt,
      })
      .hold(575, 'document', { title: 'Home safety notes', face: h.rampWork })
      .walk(612, [h.padCorner, h.sidewalkPadOut], { title: 'Leaving' })
      .hidden(CLOCK_END, 'Back at the center');
    add(ot);
    const installer = new Track(
      'home-installer',
      'aide',
      { ...opts, label: 'Home-mods installer', variant: 4 },
      h.sidewalkEnd,
    )
      .hidden(430, 'Driving over with the OT')
      .walk(470, [h.sidewalkPad, h.padCorner, h.crateSide], {
        title: 'Bringing the grab-bar kit',
      })
      .hold(480, 'craft', { title: 'Unpacking the kit', face: h.crate })
      .walk(484, [h.rampWork], { title: 'To the ramp' })
      .hold(540, 'craft', {
        title: 'Finishing the ramp rails',
        face: h.rampMid,
      })
      .walk(546, [h.crateSide], { title: 'Back for tools' })
      .hold(556, 'craft', { title: 'Packing the kit', face: h.crate })
      .walk(562, [h.rampWork], { title: 'Final checks' })
      .hold(586, 'craft', {
        title: 'Final checks on the rails',
        face: h.rampMid,
      })
      .walk(622, [h.padCorner, h.sidewalkPadOut], { title: 'Leaving' })
      .hidden(CLOCK_END, 'Back at the depot');
    add(installer);
    const mealsDoor = carDoor('meals-car', 380);
    const meals = new Track(
      'meals-driver',
      'driver',
      { ...opts, label: 'Meals driver', variant: 6 },
      CENTER_LOT.meals.at,
    )
      .hidden(371, 'Loading & driving meals', mealsDoor)
      .walk(380, [h.mealsWalkA, h.mealsWalkB, h.porchStepFoot, h.porchStep], {
        title: 'Meal bag to the door',
        ys: [undefined, undefined, undefined, PORCH_Y],
      })
      .hold(387, 'serve', { title: 'Handing over lunch', face: h.porchSeat })
      .hold(395, 'conversation', {
        title: 'Wellness check-in',
        face: h.porchSeat,
      })
      .walk(403, [h.porchStepFoot, h.mealsWalkB, h.mealsWalkA, mealsDoor], {
        title: 'Back to the car',
      })
      .hidden(CLOCK_END, 'Delivering the rest of the route');
    add(meals);
    interact(
      'home-personal-care',
      'home',
      homeZone,
      ['home-participant', 'home-pca'],
      52,
      71,
      'Mrs. Wong · personal care at home',
      'A personal care aide helps with hair, morning medicines and breakfast on the porch before the Seen van arrives.',
    );
    interact(
      'home-van-boarding',
      'home',
      homeZone,
      ['home-participant', 'home-pca', 'community-driver'],
      73,
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
    interact(
      'home-return',
      'home',
      homeZone,
      ['home-participant', 'home-pca', 'community-driver'],
      332,
      374.5,
      'Mrs. Wong · home from the clinic',
      'The van ramp comes down, the aide meets her at the kerb and follows her up the ramp to the porch.',
    );
    interact(
      'home-meals',
      'home',
      homeZone,
      ['meals-driver', 'home-participant'],
      380,
      395,
      'Home-delivered lunch & wellness check',
      'The meals driver hands over lunch and checks in; anything unusual goes back to the care team.',
    );
    interact(
      'home-mods',
      'home',
      homeZone,
      ['home-ot', 'home-installer', 'home-participant'],
      462,
      586,
      'Home modifications · ramp & grab bars',
      'An OT places grab bars with Mrs. Wong while the installer finishes the porch ramp rails.',
    );
    interact(
      'home-discharge-arrival',
      'home',
      homeZone,
      ['hospital-participant', 'community-driver', 'home-participant'],
      644,
      686,
      'Mr. Wong · home after discharge',
      'The Seen driver wheels Mr. Wong down the van ramp and up the porch ramp; Mrs. Wong meets them at the door.',
    );
    interact(
      'home-health-visit',
      'home',
      homeZone,
      ['home-rn', 'hospital-participant'],
      683.5,
      700,
      'Post-discharge home health visit',
      'A home health nurse checks vitals and reconciles the new medicines with the pill packs on the day he comes home.',
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
    const rollPath: Vec2[] = [
      q.patient,
      q.bayFront,
      q.walkway,
      q.kerbStep,
      hospitalStop.foot,
    ];
    const mrWong = new Track(
      'hospital-participant',
      'participant',
      {
        ...opts,
        label: 'Mr. Wong · inpatient, discharged home',
        variant: 8,
        mobility: 'wheelchair',
      },
      q.patient,
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
      .walk(652.5, [homePm.foot], {
        action: 'roll',
        title: 'Down the van ramp',
        from: homePm.sill,
        fromY: VAN_FLOOR,
      })
      .walk(670.5, crossing(homePm.foot).slice(1), {
        action: 'roll',
        title: 'Across to the porch ramp',
      })
      .walk(677.5, [h.rampTop], {
        action: 'roll',
        title: 'Up the porch ramp',
        ys: [PORCH_Y],
      })
      .walk(683.5, [h.wheelchairSpot], {
        action: 'roll',
        title: 'Onto the porch',
        ys: [PORCH_Y],
      })
      .hold(712, 'seated', {
        title: 'Home health visit on the porch',
        heading: rel(home),
      })
      .walk(715, [h.door], {
        action: 'roll',
        title: 'Inside to rest',
        ys: [PORCH_Y],
      })
      .hidden(CLOCK_END, 'Resting at home');
    add(mrWong);
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

  // --- Cardiology & specialty clinic ---------------------------------------
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
      .hold(CLOCK_END, 'document', {
        title: 'Scheduling the next visit',
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
  }

  // --- Partner adult day center --------------------------------------------
  {
    const zone = settingZone(adc.id),
      opts = { zoneId: zone };
    const tables = [
      ['adc-participant-1', d.seatA, d.tcB, 10],
      ['adc-participant-2', d.seatB, d.tcC, 11],
      ['adc-participant-3', d.seatC, d.tcE, 12],
      ['adc-participant-4', d.seatD, d.tcF, 13],
    ] as const;
    tables.forEach(([id, seat, tc, variant], i) => {
      // Face the table: toward the building when seated on its road side.
      const faceTable = rel(
        adc,
        toLocal(adc, seat)[1] > toLocal(adc, d.tableFace)[1] ? Math.PI : 0,
      );
      add(
        new Track(
          id,
          'participant',
          {
            ...opts,
            label: `Day center participant ${i + 1}`,
            variant,
            mobility: i === 1 ? 'cane' : undefined,
          },
          seat,
        )
          .hold(170 + i * 2, 'seated', {
            title: 'Morning coffee on the patio',
            heading: faceTable,
          })
          .walk(180, [tc], { title: 'Out for tai chi' })
          .hold(247.5, 'tai-chi', {
            title: 'Morning tai chi',
            heading: rel(adc, Math.PI),
          })
          .walk(262 - i * 2, [seat], { title: 'Back to the tables' })
          .hold(420, 'tabletop', {
            title: 'Tabletop games',
            heading: faceTable,
          })
          .hold(CLOCK_END, 'seated', {
            title: 'Afternoon on the patio',
            heading: faceTable,
          }),
      );
    });
    const chairs = [
      ['adc-participant-5', d.chairE, d.tcA, 14],
      ['adc-participant-6', d.chairF, d.tcD, 15],
    ] as const;
    chairs.forEach(([id, chair, tc, variant], i) => {
      add(
        new Track(
          id,
          'participant',
          {
            ...opts,
            label: `Day center participant ${i + 5}`,
            variant,
            mobility: i ? 'walker' : undefined,
          },
          chair,
        )
          .hold(172 + i * 3, 'seated', {
            title: 'Morning coffee on the patio',
            heading: rel(adc, Math.PI / 2),
          })
          .walk(180, [tc], { title: 'Out for tai chi' })
          .hold(247.5, 'tai-chi', {
            title: 'Morning tai chi',
            heading: rel(adc, Math.PI),
          })
          .hold(270, 'conversation', {
            title: 'Meeting the visiting PT',
            heading: rel(adc, Math.PI / 2),
          })
          .hold(360, 'exercise', {
            title: 'Strength & balance with the Seen PT',
            heading: rel(adc, Math.PI / 2),
          })
          .walk(368 + i * 2, [chair], { title: 'Back to a chair' })
          .hold(CLOCK_END, 'seated', {
            title: 'Afternoon on the patio',
            heading: rel(adc, Math.PI / 2),
          }),
      );
    });
    const lead = new Track(
      'adc-lead',
      'activities',
      { ...opts, label: 'Day center activities lead', variant: 3 },
      d.lead,
    )
      .hold(180, 'conversation', {
        title: 'Welcoming the group',
        heading: rel(adc, Math.PI),
      })
      .hold(247.5, 'tai-chi', {
        title: 'Leading tai chi',
        heading: rel(adc, Math.PI),
      })
      .walk(262, [d.leadTables], { title: 'Setting up the tables' })
      .hold(420, 'present', { title: 'Tabletop games', heading: rel(adc) })
      .walk(426, [d.lead], { title: 'Back to the patio front' })
      .hold(CLOCK_END, 'conversation', {
        title: 'Afternoon conversation',
        heading: rel(adc, Math.PI),
      });
    add(lead);
    const pt = new Track(
      'visiting-pt',
      'pt',
      { ...opts, label: 'Visiting Seen physical therapist', variant: 8 },
      d.sidewalkEnd,
    )
      .hidden(190, 'Driving from the center')
      .walk(247.5, [d.sidewalkPad, d.patioCorner, d.patioEdge, d.ptGreet], {
        title: 'Arriving at the partner center',
      })
      .hold(268, 'greet', {
        title: 'Catching up with the activities lead',
        face: d.lead,
      })
      .walk(272, [d.ptStand], { title: 'Setting up' })
      .hold(360, 'exercise', {
        title: 'Seated strength & balance',
        heading: rel(adc, -Math.PI / 2),
      })
      .walk(420, [d.patioEdge, d.patioCorner, d.sidewalkPad, d.sidewalkEnd], {
        title: 'Back to the center',
      })
      .hidden(CLOCK_END, 'At the center');
    add(pt);
    const six = [
      'adc-participant-1',
      'adc-participant-2',
      'adc-participant-3',
      'adc-participant-4',
      'adc-participant-5',
      'adc-participant-6',
    ];
    interact(
      'partner-tai-chi',
      'partner',
      zone,
      ['adc-lead', ...six],
      180,
      247.5,
      'Partner center · morning tai chi',
      'Six participants follow the activities lead on the patio: the same repertoire as the Seen day room.',
    );
    interact(
      'partner-tabletop',
      'partner',
      zone,
      ['adc-lead', ...six.slice(0, 4)],
      262,
      420,
      'Partner center · tabletop games',
      'Games at the patio tables after tai chi.',
    );
    interact(
      'partner-pt',
      'partner',
      zone,
      ['visiting-pt', 'adc-participant-5', 'adc-participant-6'],
      270,
      360,
      'Visiting Seen PT · strength & balance',
      'A Seen physical therapist visits the partner center for a seated strength and balance session with two participants.',
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
      .walk(670.5, pushHome.slice(1), {
        action: 'escort',
        title: 'Wheeling Mr. Wong to the porch ramp',
      })
      .walk(677.5, [h.rampTopBehind], {
        action: 'escort',
        title: 'Up the porch ramp',
        ys: [PORCH_Y],
      })
      .walk(683.5, [h.porchDriver], {
        action: 'escort',
        title: 'Onto the porch',
        ys: [PORCH_Y],
      })
      .hold(686, 'greet', {
        title: 'Handing off to the family',
        face: h.wheelchairSpot,
      })
      .walk(
        708,
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
    interact(
      'after-hours-call',
      'after-hours',
      homeZone,
      ['nurse-line-rn', 'home-participant'],
      690,
      708,
      'Nurse line call · evening plan',
      '24/7 nurse line and on-call coordination: the RN confirms the evening medicines and tomorrow’s pickup after Mr. Wong’s discharge.',
    );
  }

  return {
    id: COMMUNITY_SOURCE_ID,
    description:
      'Around the center, the same care team runs home care, home health, pill-pack delivery, meals, home modifications, specialist escorts, hospital discharge coordination and a 24/7 nurse line, joined by door-to-door transport.',
    actors,
    interactions,
    views: [COMMUNITY_VIEW],
    zones: careSettings.map((s) => ({
      id: settingZone(s.id),
      name: s.name,
      levelId: 'site',
      polygon: padPolygon(s),
      color: s.accent,
    })),
    evidence: [
      'Distributed-care settings are illustrative pads on the paper ground beyond the ring streets; timings are compressed onto the 720 s care-day clock.',
    ],
  };
}
export { COMMUNITY_CATEGORIES } from './community-settings';
