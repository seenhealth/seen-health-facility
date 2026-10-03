/**
 * Live lot traffic: the Alhambra lot's twelve spaces, and the way a vehicle
 * drives from the drop-off into one and out of it again without driving
 * through anything that is standing on the lot.
 *
 * The lot is tight: a 4.5 m one-way aisle between a west row of 6.1 m stalls
 * (reversed into, nose toward the aisle) and five 5.76 m angled stalls along
 * the building (nosed into), and the vehicles are long (a fleet van 6.35 m, a
 * full-size SUV 5.75 m, whose tail hangs out of an angled stall). No single
 * route into a space clears every neighbour in every state of the lot, so a
 * route is not fixed per space: it is picked when the vehicle sets off, from a
 * small family of manoeuvres (which lane to turn from, how gently to start the
 * turn, how tightly to finish it), as the one that keeps the widest gap to the
 * vehicles standing there at that moment and to the kerbs, planters and walls.
 * With the lot packed with the longest vehicles the best of them still brushes
 * a neighbour's corner by a hand's width (test/live-lot-traffic.test.ts pins
 * how much); in every other state the manoeuvres are clear.
 *
 * Directions are the fleet's (`atan2(dx, dz)`, alhambra-fleet.ts): its "south"
 * is −z, the way the one-way aisle runs from the drop-off to the alley.
 */
import { DROP_OFF } from './alhambra-exterior';
import { FLEET_LOT, FRONT_DOCK, type FleetLeg } from './alhambra-fleet';
import { siteCurbs } from './neighborhood';
import type { Facility, Vec2 } from './schema';
import { jogLength, Pen, pieceAt, type Piece } from './vehicle-path';

/** A vehicle standing or moving on the ground: its centre, the way its nose points, half its width and length. */
export type Footprint = {
  x: number;
  z: number;
  dir: number;
  halfWidth: number;
  halfLength: number;
};
export type Size = { halfWidth: number; halfLength: number };
/** A leg of a lot route; `stop` is how long the vehicle stands at its end (it changes direction there, or waits at the STOP bar). */
export type LotLeg = FleetLeg & { stop?: number };
/** A route and the smallest gap along it to anything standing on the lot (negative: it cannot be driven clear). */
export type LotPlan = { legs: LotLeg[]; gap: number };

const L = FLEET_LOT,
  SOUTH = Math.PI,
  NORTH = 0,
  EAST = Math.PI / 2,
  DEG = Math.PI / 180;

/**
 * The spaces. 0-6: the west row south to north, between the stall lines
 * neighborhood.ts paints 2.8 m apart (0-4 are the fleet's bays); a long
 * vehicle backs in until its tail is at the planter's kerb, a shorter one
 * stops with its nose just inside the end of the stall lines. The two end
 * spaces are taken 0.15 m off centre, toward the side nobody parks on (the
 * kerb at the south end, the hatched aisle at the north): the room that
 * leaves beside the one neighbour is what turning in and out of them needs.
 * 7-11: the angled stalls along the building south to north, nose in, the
 * nose's corner `wallGap` short of the wall; cars only.
 */
export const LOT_STALLS = {
  westZ: [-21.8, -18.85, -16.05, -13.25, -10.45, -7.65, -4.7],
  westTailX: -30.9,
  westNoseX: -25.0,
  angledZ: [0, 1, 2, 3, 4].map((j) => -19.15 + 2.7 * j),
  /** The way a car faces nosed into an angled stall (the stall lines run from (-20.4, z) to (-15.0, z - 2)). */
  angledDir: Math.atan2(5.4, -2),
  wallX: -14.65,
  wallGap: 0.15,
  /** At 5.76 m the angled stalls are shorter than a fleet van. */
  angledMaxHalfLength: 2.95,
};
const S = LOT_STALLS;
export const WEST_STALLS = S.westZ.length;
export const LOT_SPACES = WEST_STALLS + S.angledZ.length;
export const isAngled = (stall: number) => stall >= WEST_STALLS;
export const fitsStall = (stall: number, v: Size) =>
  !isAngled(stall) || v.halfLength <= S.angledMaxHalfLength;

/** Where a vehicle of this size stands in a space. */
export function stallPose(stall: number, v: Size) {
  if (!isAngled(stall))
    return {
      x: Math.max(S.westTailX + v.halfLength, S.westNoseX - v.halfLength),
      z: S.westZ[stall],
      dir: EAST,
    };
  const d = S.angledDir,
    nose = S.wallX - S.wallGap - v.halfWidth * Math.abs(Math.cos(d)),
    x = nose - v.halfLength * Math.sin(d);
  return {
    x,
    z: S.angledZ[stall - WEST_STALLS] + (x + 17.7) * (-2 / 5.4),
    dir: d,
  };
}
export const stallFootprint = (stall: number, v: Size): Footprint => ({
  ...stallPose(stall, v),
  halfWidth: v.halfWidth,
  halfLength: v.halfLength,
});
/** The drop-off as a vehicle standing there takes it up: a fleet van's footprint. */
export const DOCK_FOOTPRINT: Footprint = {
  x: FRONT_DOCK.at[0],
  z: FRONT_DOCK.at[1],
  dir: FRONT_DOCK.dir,
  halfWidth: 1.125,
  halfLength: 3.175,
};

// ---------------------------------------------------------------------------
// Gaps between footprints and fixed things
// ---------------------------------------------------------------------------
type Poly = Vec2[];
type Obstacle = { poly: Poly; box: [number, number, number, number] };
function corners(f: Footprint): Poly {
  const fx = Math.sin(f.dir) * f.halfLength,
    fz = Math.cos(f.dir) * f.halfLength,
    rx = Math.cos(f.dir) * f.halfWidth,
    rz = -Math.sin(f.dir) * f.halfWidth;
  return [
    [f.x + fx + rx, f.z + fz + rz],
    [f.x + fx - rx, f.z + fz - rz],
    [f.x - fx - rx, f.z - fz - rz],
    [f.x - fx + rx, f.z - fz + rz],
  ];
}
/** Separation of two convex outlines: positive apart (a lower bound on the gap), negative the depth they overlap by. */
function polyGap(a: Poly, b: Poly) {
  let best = -Infinity;
  for (const p of [a, b])
    for (let i = 0; i < p.length; i++) {
      const [x0, z0] = p[i],
        [x1, z1] = p[(i + 1) % p.length];
      let nx = z1 - z0,
        nz = x0 - x1;
      const len = Math.hypot(nx, nz);
      if (len < 1e-9) continue;
      nx /= len;
      nz /= len;
      let a0 = Infinity,
        a1 = -Infinity,
        b0 = Infinity,
        b1 = -Infinity;
      for (const [x, z] of a) {
        const d = x * nx + z * nz;
        if (d < a0) a0 = d;
        if (d > a1) a1 = d;
      }
      for (const [x, z] of b) {
        const d = x * nx + z * nz;
        if (d < b0) b0 = d;
        if (d > b1) b1 = d;
      }
      const sep = Math.max(b0 - a1, a0 - b1);
      if (sep > best) best = sep;
    }
  return best;
}
/** The gap between two footprints (negative: they overlap by that much). */
export const footprintGap = (a: Footprint, b: Footprint) =>
  polyGap(corners(a), corners(b));
function boxOf(poly: Poly): Obstacle['box'] {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const [x, z] of poly) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return [x0, x1, z0, z1];
}
const obstacle = (poly: Poly): Obstacle => ({ poly, box: boxOf(poly) });
/**
 * The sides of an outline, each an obstacle of its own. A vehicle never
 * starts inside a kerb or a wall, so its gap to the thing is its gap to the
 * nearest side, and a side's bounding box is tight where a whole building's
 * is not.
 */
const sides = (outline: Poly): Obstacle[] =>
  outline.map((p, i) => obstacle([p, outline[(i + 1) % outline.length]]));

// ---------------------------------------------------------------------------
// Route pieces
// ---------------------------------------------------------------------------
const LOT_LEG = { speed: 3, lot: true },
  REVERSE_LEG = { speed: 1.8, lot: true };
function leg(
  id: string,
  phase: string,
  pieces: Piece[],
  options: Omit<LotLeg, 'id' | 'phase' | 'pieces' | 'length'>,
): LotLeg {
  return {
    id,
    phase,
    pieces,
    length: pieces.reduce((s, p) => s + p.length, 0),
    ...options,
  };
}
/** Seconds standing between pulling past a space and reversing into it, or between backing out and driving on. */
const CHANGE_DIRECTION = 0.7;
/** Seconds a departing vehicle stands at the STOP bar across the driveway's mouth. */
const EXIT_STOP = 1.2;

/**
 * The lot's exit from a point on the aisle heading south: over to the exit
 * lane where there is room for the lane change, down to the STOP bar, out of
 * the driveway onto the alley, west along it, the corner onto the west street
 * and off the map to the south. A vehicle that joins the aisle too far south
 * for the lane change stays on its own line; one already past the bar turns
 * out without stopping. Null when it is too far south to turn onto the lane.
 */
function exitLegs(x: number, z: number, drift = L.laneChangeRadius) {
  const pen = new Pen(x, z, SOUTH),
    lateral = x - L.exitLane,
    change = Math.abs(lateral) > 0.02 ? jogLength(lateral, drift) : 0,
    turnZ = L.westbound + L.turnRadius,
    legs: LotLeg[] = [];
  if (z >= L.exitStopZ + 0.1) {
    const roomToChange = z - change >= L.exitStopZ + 0.1;
    if (roomToChange && change) pen.jog(lateral, drift);
    pen.lineToZ(L.exitStopZ);
    legs.push(
      leg('to-stop', 'Driving to the exit', pen.take(), {
        ...LOT_LEG,
        stop: EXIT_STOP,
      }),
    );
  }
  if (pen.z > turnZ + 1e-6) {
    pen.lineToZ(turnZ);
    legs.push(leg('aisle-south', 'Leaving the lot', pen.take(), LOT_LEG));
  }
  const radius = pen.z - L.westbound;
  if (radius < 3.2) return null;
  pen.arc(radius, Math.PI / 2);
  legs.push(leg('driveway-out', 'Turning onto the alley', pen.take(), LOT_LEG));
  pen.lineToX(L.southbound + L.streetRadius);
  legs.push(
    leg('street-west', 'Westbound on the alley', pen.take(), { speed: 9 }),
  );
  pen.arc(L.streetRadius, -Math.PI / 2);
  legs.push(
    leg('corner-south', 'Turning south onto the west street', pen.take(), {
      speed: 5,
      lot: true,
    }),
  );
  pen.lineToZ(L.vanishSouth + L.fade);
  legs.push(
    leg('street-south', 'Southbound to the neighborhood', pen.take(), {
      speed: 9,
    }),
  );
  pen.line(L.fade);
  legs.push(
    leg('fade-out', 'Leaving the map', pen.take(), { speed: 9, fade: 'out' }),
  );
  return legs;
}

/** From the drop-off down the aisle to (x, z) heading south, changing lane on the way; null when there is no room for the change. */
function fromDock(x: number, z: number): Piece[] | null {
  const [x0, z0] = FRONT_DOCK.at,
    pen = new Pen(x0, z0, SOUTH),
    lateral = x0 - x;
  if (z > z0 - 0.05) return null;
  if (Math.abs(lateral) < 0.02) return pen.lineToZ(z).take();
  pen.line(Math.min(L.lead, (z0 - z) / 4));
  const room = pen.z - z;
  let radius = L.laneChangeRadius;
  while (radius >= 4 && jogLength(lateral, radius) > room) radius -= 0.5;
  if (radius < 4) return null;
  return pen.jog(lateral, radius).lineToZ(z).take();
}

/** How a west-row vehicle turns between its space and the aisle: straight out, a gentle start (`r1` over `a1`), then `r2` round to the lane at `x`. */
type WestTurn = { x: number; r1: number; a1: number; r2: number };
/** How a car turns between an angled stall and the aisle: backing out `r2` over `a2` first, then `r1` round to the lane at `x`. */
type AngledTurn = { x: number; r2: number; a2: number; r1: number };
/**
 * The manoeuvres to pick from: the plain ones first (a single arc from the
 * middle of the aisle), which serve while the neighbouring spaces are empty,
 * then the ones a tight spot needs: turning from further east (clear of the
 * neighbour to the south when nothing stands opposite) or west, a gentle start
 * to the turn (the tail swings less toward the neighbour to the north) and a
 * tighter finish. The lists are the smallest sets that come within 3 cm of the
 * best turn of a much finer grid for every way the neighbouring and opposite
 * spaces can be taken (searched offline; angles in degrees here).
 */
const WEST_TURNS: WestTurn[] = (
  [
    [-22.5, 0, 0, 5],
    [-22.5, 0, 0, 4],
    [-22.5, 8, 20, 3.5],
    [-22.9, 6, 30, 3.5],
    [-22.1, 8, 25, 3.5],
    [-22.9, 5, 10, 3.5],
    [-22.5, 6, 10, 3.5],
    [-22.9, 6, 25, 3.5],
    [-22.5, 6, 30, 3.5],
    [-22.1, 8, 20, 4],
    [-22.1, 8, 15, 3.5],
    [-23, 5, 10, 3.5],
    [-22.9, 5, 25, 3.5],
    [-22.5, 6, 20, 3.5],
    [-22.5, 8, 20, 4],
    [-22.1, 8, 25, 4],
    [-22.1, 6, 20, 4],
    [-22.1, 6, 25, 3.5],
    [-23, 5, 10, 4.5],
    [-22.5, 6, 20, 4],
    [-21.7, 8, 20, 3.5],
    [-22.5, 5, 20, 3.5],
    [-23, 6, 25, 4],
    [-22.5, 5, 30, 3.5],
    [-22.1, 6, 30, 3.5],
    [-20.9, 10, 20, 5],
    [-22.9, 5, 20, 3.5],
    [-22.1, 0, 0, 4],
    [-21.3, 10, 25, 3.5],
    [-21.7, 10, 20, 3.5],
    [-22.1, 0, 0, 3.5],
    [-23, 5, 20, 3.5],
    [-22.1, 8, 20, 4.5],
    [-20.9, 12, 20, 3.5],
    [-21.7, 6, 20, 4],
    [-22.1, 5, 30, 4],
    [-21.7, 10, 15, 4],
    [-20.9, 8, 25, 4.5],
    [-21.7, 10, 20, 4],
    [-21.7, 5, 10, 3.5],
    [-22.1, 5, 15, 3.5],
    [-21.3, 12, 15, 4],
    [-22.1, 10, 15, 3.5],
    [-21.3, 8, 25, 3.5],
    [-20.9, 12, 15, 5],
    [-21.7, 8, 20, 4],
    [-21.7, 8, 25, 4],
    [-21.3, 12, 20, 3.5],
    [-21.3, 6, 40, 3.5],
    [-20.9, 6, 20, 5],
    [-21.7, 0, 0, 4.5],
    [-21.7, 8, 25, 3.5],
    [-21.3, 8, 30, 4],
    [-20.9, 8, 20, 5],
    // Beside a neighbour at the south end, where the palm island narrows the aisle: tight first, then wide; and out
    // of the southernmost bay past the next one's nose.
    [-22.1, 3.5, 60, 6],
    [-22.1, 7, 30, 4],
    [-21.7, 7, 30, 5],
  ] as const
).map(([x, r1, a1, r2]) => ({ x, r1, a1: a1 * DEG, r2 }));
const ANGLED_TURNS: AngledTurn[] = (
  [
    [-22.5, 0, 0, 4.5],
    [-22.5, 0, 0, 4],
    [-22.5, 10, 20, 4.5],
    [-22.75, 8, 20, 4],
    [-22.75, 8, 15, 4],
    [-22.75, 4, 45, 4.5],
    [-22.2, 8, 20, 4],
    [-23, 14, 15, 4],
    [-22.75, 8, 20, 4.5],
    [-23, 10, 15, 4],
    [-23, 0, 0, 4],
    [-22.75, 4, 20, 4],
    [-22.5, 14, 10, 4],
    [-22.2, 10, 20, 4],
    [-23, 8, 15, 4],
    [-23, 8, 20, 4],
    [-22.75, 10, 20, 4],
    [-22.5, 6, 20, 4],
    [-22.5, 10, 15, 4],
    [-22.2, 0, 0, 4],
    [-22, 0, 0, 4],
    [-22, 8, 20, 4],
    [-22.75, 6, 15, 4],
  ] as const
).map(([x, r2, a2, r1]) => ({ x, r2, a2: a2 * DEG, r1 }));

/** West row, pulling out forward: the pieces from the space to the aisle and where they end (heading south). */
function westOut(stall: number, v: Size, t: WestTurn) {
  const p = stallPose(stall, v),
    s1 = Math.sin(t.a1),
    straight = t.x - p.x - t.r1 * s1 - t.r2 * (1 - s1);
  if (straight < 0) return null;
  const pen = new Pen(p.x, p.z, EAST).line(straight);
  if (t.a1 > 0) pen.arc(t.r1, t.a1);
  pen.arc(t.r2, Math.PI / 2 - t.a1);
  return { pieces: pen.take(), x: pen.x, z: pen.z, straight };
}
/** West row, reversing in from (x, z) on the aisle (nose south): the same turn tail first. */
function westIn(t: WestTurn, from: { x: number; z: number; straight: number }) {
  const pen = new Pen(from.x, from.z, NORTH).arc(t.r2, -(Math.PI / 2 - t.a1));
  if (t.a1 > 0) pen.arc(t.r1, -t.a1);
  return pen.line(from.straight).take();
}
const ANGLED_TURN = Math.PI - S.angledDir;
/** Angled stall, backing out: the pieces tail first from the stall to the aisle and where they end (nose south). */
function angledOut(stall: number, v: Size, t: AngledTurn) {
  const p = stallPose(stall, v),
    a2 = Math.min(t.a2, ANGLED_TURN),
    turn = (run: number) => {
      const pen = new Pen(p.x, p.z, S.angledDir + Math.PI).line(run);
      if (a2 > 0) pen.arc(t.r2, a2);
      if (ANGLED_TURN - a2 > 1e-9) pen.arc(t.r1, ANGLED_TURN - a2);
      return pen;
    },
    run = (turn(0).x - t.x) / Math.sin(S.angledDir);
  if (run < 0) return null;
  const pen = turn(run);
  return { pieces: pen.take(), x: pen.x, z: pen.z, run, a2 };
}
/** Angled stall, nosing in from (x, z) on the aisle heading south: the same turn nose first. */
function angledIn(
  t: AngledTurn,
  from: { x: number; z: number; run: number; a2: number },
) {
  const pen = new Pen(from.x, from.z, SOUTH);
  if (ANGLED_TURN - from.a2 > 1e-9) pen.arc(t.r1, -(ANGLED_TURN - from.a2));
  if (from.a2 > 0) pen.arc(t.r2, -from.a2);
  return pen.line(from.run).take();
}

/** A footprint's outline and its bounding box, as the gap tests take them. */
type Outline = { poly: Poly; box: Obstacle['box'] };
/**
 * Outlines along pieces: every quarter metre round an arc, every metre along a straight (a vehicle moving along its
 * own length sweeps nothing new in between). On a reverse leg the nose points against the travel.
 */
function sweep(pieces: Piece[], v: Size, reverse: boolean) {
  const out: Outline[] = [];
  for (const p of pieces) {
    const n = Math.max(1, Math.ceil(p.length / (p.curvature ? 0.25 : 1)));
    for (let i = 0; i <= n; i++) {
      const at = pieceAt(p, (p.length * i) / n);
      out.push(
        obstacle(
          corners({
            x: at.x,
            z: at.z,
            dir: reverse ? at.dir + Math.PI : at.dir,
            halfWidth: v.halfWidth,
            halfLength: v.halfLength,
          }),
        ),
      );
    }
  }
  return out;
}
/** The smallest gap from the outlines along a path to the obstacles, looking no further than `from` (far ones are skipped). */
function gapAlong(path: Outline[], obstacles: Obstacle[], from: number) {
  let min = from;
  for (const f of path)
    for (const o of obstacles) {
      if (
        f.box[1] < o.box[0] - min ||
        f.box[0] > o.box[1] + min ||
        f.box[3] < o.box[2] - min ||
        f.box[2] > o.box[3] + min
      )
        continue;
      const g = polyGap(f.poly, o.poly);
      if (g < min) min = g;
    }
  return min;
}

/** A gap this wide to everything is as good as any wider: the plainest manoeuvre that keeps it is taken. */
const COMFORT = 0.3;
/** A space that can be driven into without touching anything is taken in preference order; when none can, the one that overlaps least. */
const CLEAR = 0;
/** Closer than this to a kerb, a planter or a wall counts as touching it. */
const TOUCHING = 0.05;
/** Gaps are not measured beyond this. */
const FAR = 3;

/**
 * One manoeuvre for one space and one size of vehicle, with everything about
 * it that does not depend on who else is on the lot worked out once: the legs
 * in and out, the outlines the vehicle sweeps, and how close they come to the
 * kerbs, planters and walls and to a vehicle standing at the drop-off.
 */
type Manoeuvre = {
  /** The turn between the space and the aisle (the same outlines nose first or tail first). */
  turn: Outline[];
  /** From the drop-off to where the turn starts; null when there is no room to get onto its lane. */
  lead: Outline[] | null;
  legsIn: LotLeg[] | null;
  /** From the aisle to the alley; null when the turn ends too far south to turn out. */
  exit: Outline[] | null;
  legsOut: LotLeg[] | null;
  /** Gaps to the fixed things, where the path all but touches one (else `FAR`), and to the drop-off. */
  fixedIn: number;
  fixedOut: number;
  dockTurn: number;
  dockExit: number;
};

export function createLotTraffic(
  model: Pick<Facility, 'calibration' | 'site'>,
) {
  const curbs = siteCurbs(model);
  /** Kerbs, planters, the building and the drop-off's landing, steps, ramp and bike rack. */
  const fixed: Obstacle[] = [
    ...curbs.islands,
    ...curbs.sidewalks,
    model.site.buildingOutline,
    ...DROP_OFF.outlines,
    DROP_OFF.bikeRackOutline,
  ]
    .flatMap(sides)
    // Only what a vehicle on the lot or in the driveway's mouth can come near.
    .filter(
      (o) =>
        o.box[1] > -36 && o.box[0] < -12 && o.box[3] > -34 && o.box[2] < 12,
    );
  const dock = [obstacle(corners(DOCK_FOOTPRINT))];
  /**
   * The kerbs and walls only count when a path all but touches them: a
   * vehicle parks a hand's width from the planter's kerb or the wall, and
   * that must not pass for a tight manoeuvre.
   */
  const touching = (...paths: (Outline[] | null)[]) => {
    const g = Math.min(
      ...paths.map((p) => (p ? gapAlong(p, fixed, TOUCHING) : TOUCHING)),
    );
    return g < TOUCHING ? g : FAR;
  };

  const prepared = new Map<string, Manoeuvre[]>();
  /** Every manoeuvre of the family for this space and size (worked out on first use). */
  function manoeuvres(stall: number, v: Size): Manoeuvre[] {
    const key = `${stall}|${v.halfWidth.toFixed(3)}|${v.halfLength.toFixed(3)}`;
    let list = prepared.get(key);
    if (list) return list;
    list = [];
    const add = (
      turnPieces: Piece[],
      reverseTurn: boolean,
      end: { x: number; z: number },
      into: (lead: Piece[]) => LotLeg[],
      outOf: (exit: LotLeg[]) => LotLeg[],
    ) => {
      const turn = sweep(turnPieces, v, reverseTurn),
        leadPieces = fromDock(end.x, end.z),
        exitRoute = exitLegs(end.x, end.z),
        lead = leadPieces && sweep(leadPieces, v, false),
        // The exit only counts while it is on the lot: the alley and the street are open road.
        exit =
          exitRoute &&
          sweep(
            exitRoute
              .filter((l) =>
                ['to-stop', 'aisle-south', 'driveway-out'].includes(l.id),
              )
              .flatMap((l) => l.pieces),
            v,
            false,
          );
      list!.push({
        turn,
        lead,
        legsIn: leadPieces && into(leadPieces),
        exit,
        legsOut: exitRoute && outOf(exitRoute),
        fixedIn: touching(turn, lead),
        fixedOut: touching(turn, exit),
        dockTurn: gapAlong(turn, dock, FAR),
        dockExit: exit ? gapAlong(exit, dock, FAR) : FAR,
      });
    };
    if (!isAngled(stall))
      for (const t of WEST_TURNS) {
        const out = westOut(stall, v, t);
        if (!out) continue;
        add(
          out.pieces,
          false,
          out,
          (lead) => [
            leg('to-stall', 'Driving to a space', lead, {
              ...LOT_LEG,
              stop: CHANGE_DIRECTION,
            }),
            leg('back-in', 'Reversing into a space', westIn(t, out), {
              ...REVERSE_LEG,
            }),
          ],
          (exit) => [
            leg('pull-out', 'Pulling out of a space', out.pieces, LOT_LEG),
            ...exit,
          ],
        );
      }
    else
      for (const t of ANGLED_TURNS) {
        const out = angledOut(stall, v, t);
        if (!out) continue;
        add(
          out.pieces,
          true,
          out,
          (lead) => [
            leg(
              'to-stall',
              'Driving to a space',
              [...lead, ...angledIn(t, out)],
              LOT_LEG,
            ),
          ],
          (exit) => [
            leg('back-out', 'Backing out of a space', out.pieces, {
              ...REVERSE_LEG,
              stop: CHANGE_DIRECTION,
            }),
            ...exit,
          ],
        );
      }
    prepared.set(key, list);
    return list;
  }

  const standing = (others: Footprint[]) =>
    others.map((f) => obstacle(corners(f)));
  /** The first manoeuvre (they come plainest first) that keeps a comfortable gap, else the one with the widest. */
  function best(
    list: Manoeuvre[],
    legsOf: (m: Manoeuvre) => LotLeg[] | null,
    gapOf: (m: Manoeuvre, atLeast: number) => number,
  ): LotPlan | null {
    let top: LotPlan | null = null;
    for (const m of list) {
      const legs = legsOf(m);
      if (!legs) continue;
      // A manoeuvre that cannot beat the best so far is dropped as soon as that shows.
      const gap = gapOf(m, top ? top.gap : -Infinity);
      if (gap >= COMFORT) return { legs, gap };
      if (!top || gap > top.gap + 1e-6) top = { legs, gap };
    }
    return top;
  }
  /** The gap along `paths` to the standing vehicles, given up (anything not above `atLeast`) once it cannot beat `atLeast`. */
  function gapTo(
    vehicles: Obstacle[],
    known: number,
    atLeast: number,
    ...paths: (Outline[] | null)[]
  ) {
    let gap = Math.min(known, FAR);
    for (const p of paths) {
      if (gap <= atLeast) return gap;
      if (p) gap = gapAlong(p, vehicles, gap);
    }
    return gap;
  }

  /**
   * The way from the drop-off into a space, past `others` (every vehicle
   * standing on the lot). A vehicle backing into the west row is also kept
   * clear of the drop-off, where the next arrival will be standing by then;
   * a car nosing into an angled stall is in it before the next one pulls up.
   */
  function planIn(stall: number, v: Size, others: Footprint[]) {
    const vehicles = standing(others);
    return best(
      manoeuvres(stall, v),
      (m) => m.legsIn,
      (m, atLeast) =>
        gapTo(
          vehicles,
          Math.min(m.fixedIn, isAngled(stall) ? FAR : m.dockTurn),
          atLeast,
          m.turn,
          m.lead,
        ),
    );
  }

  /**
   * The way out of a space and off the map, past `others`. `dockClear`: the
   * drop-off is being held empty for this departure (the angled stall beside
   * it backs out across it).
   */
  function planOut(
    stall: number,
    v: Size,
    others: Footprint[],
    dockClear = false,
  ) {
    const vehicles = standing(others);
    return best(
      manoeuvres(stall, v),
      (m) => m.legsOut,
      (m, atLeast) =>
        gapTo(
          vehicles,
          Math.min(
            m.fixedOut,
            dockClear ? FAR : Math.min(m.dockTurn, m.dockExit),
          ),
          atLeast,
          m.turn,
          m.exit,
        ),
    );
  }

  /** From the drop-off straight on down the aisle and off the map (the lot is full, or the vehicle was only passing). */
  function planDockOut(): LotLeg[] {
    const [x, z] = FRONT_DOCK.at,
      pen = new Pen(x, z, SOUTH).line(L.lead),
      first = pen.take();
    const legs = exitLegs(pen.x, pen.z, L.driftRadius)!;
    legs[0] = leg(
      'front-dock-out',
      'Leaving the drop-off',
      [...first, ...legs[0].pieces],
      { ...LOT_LEG, stop: legs[0].stop },
    );
    return legs;
  }

  /**
   * The space for a vehicle arriving from the drop-off: the first of `order`
   * that is free, fits it and can be driven into clear of everything standing
   * on the lot; when none can, the one with the widest gap. Null: lot full.
   */
  function chooseStall(
    v: Size,
    order: number[],
    taken: (stall: number) => boolean,
    others: Footprint[],
  ): { stall: number; plan: LotPlan } | null {
    let fallback: { stall: number; plan: LotPlan } | null = null;
    for (const stall of order) {
      if (taken(stall) || !fitsStall(stall, v)) continue;
      const plan = planIn(stall, v, others);
      if (!plan) continue;
      if (plan.gap >= CLEAR) return { stall, plan };
      if (!fallback || plan.gap > fallback.plan.gap) fallback = { stall, plan };
    }
    return fallback;
  }

  return {
    planIn,
    planOut,
    planDockOut,
    chooseStall,
    /** Work out a space's manoeuvres for a size of vehicle ahead of time, so the first route there costs nothing. */
    prepare: (stall: number, v: Size) => {
      if (fitsStall(stall, v)) manoeuvres(stall, v);
    },
  };
}
export type LotTraffic = ReturnType<typeof createLotTraffic>;

/**
 * The order spaces are offered in. Vans and lift vans take the west row from
 * its south end (the fleet's bays) northward: each then backs in beside a
 * neighbour on its south side only, which it can do clear. Cars take the
 * angled stalls from the south end, the one beside the drop-off last (backing
 * out of it needs the drop-off empty), then the west row from its north end,
 * leaving the bays to the vans.
 */
export function stallOrder(v: Size): number[] {
  const west = Array.from({ length: WEST_STALLS }, (_, i) => i);
  if (!fitsStall(WEST_STALLS, v)) return west;
  return [
    ...Array.from(
      { length: LOT_SPACES - WEST_STALLS },
      (_, j) => WEST_STALLS + j,
    ),
    ...west.reverse(),
  ];
}
/** Backing out of the angled stall beside the drop-off sweeps across it, so it waits for the drop-off to be empty. */
export const needsDockClear = (stall: number) => stall === LOT_SPACES - 1;
