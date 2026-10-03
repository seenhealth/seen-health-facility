import type { Action, CharacterRole } from './characters';
import type { ActorSpec, Segment } from './activity';
import type { Vec2 } from './schema';
import { groundYAt } from './community-settings';
import { communityVehicleById } from './community-vehicles';

/**
 * The hand-authored track builder of the community cast: `hold`, `walk`,
 * `hidden` and `ride` append contiguous segments behind a cursor, so nothing
 * teleports, and `build()` checks the day ends at 720 s. Heights follow the
 * ground under every point (`groundYAt`: street, pad plinth, porch, or the
 * floor of a facility stamped on a pad) unless given.
 *
 * A track can also start later than 0 (`start`) and end early
 * (`segmentsTo(end)`): a leg that fills a hole of a generated instance track
 * (instance-cast.ts `fillHoles`), e.g. a walk from the front door to the van.
 */
export const CLOCK_END = 720;
export type TrackOptions = {
  label: string;
  variant: number;
  levelId?: string;
  zoneId: string;
  /** False for people on a building level, whose height comes from the level. */
  ground?: boolean;
  /** Height under a point (default `groundYAt`). */
  heightAt?: (p: Vec2) => number;
  /** Loop second the track starts at (default 0). */
  start?: number;
  mobility?: 'cane' | 'walker' | 'wheelchair';
  seated?: boolean;
  seatId?: string;
};
export type WalkOptions = {
  action?: 'walk' | 'roll' | 'escort';
  title?: string;
  /** Heights per point (undefined entries fall back to the ground). */
  ys?: (number | undefined)[];
  /** Start here instead of the cursor (stepping out of a seat). */
  from?: Vec2;
  fromY?: number;
};
export const facing = (from: Vec2, to: Vec2) =>
  Math.atan2(to[0] - from[0], to[1] - from[1]);
const seatOf = (vehicleId: string, seat: string) =>
  communityVehicleById(vehicleId)!.seats[seat];
/** Appends contiguous segments and keeps a cursor so nothing teleports. */
export class Track {
  private t: number;
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
    this.t = o.start ?? 0;
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
    return this.o.ground === false
      ? undefined
      : (this.o.heightAt ?? groundYAt)(p);
  }
  private heights() {
    return this.y === undefined ? undefined : [this.y, this.y];
  }
  /**
   * Stay put doing `action` until `until`. `seated` sits the person down
   * whatever the action (a stool at a slit lamp, a chair at a console), as
   * the generated instance casts do for seated stops.
   */
  hold(
    until: number,
    action: Action,
    opts: {
      title?: string;
      face?: Vec2;
      heading?: number;
      y?: number;
      seated?: boolean;
    } = {},
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
      ...(opts.seated ? { seated: true } : {}),
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
  /** The segments so far, which must end exactly at `end` (a leg filling a hole). */
  segmentsTo(end: number): Segment[] {
    if (this.t !== end)
      throw new Error(`${this.id}: the leg ends at ${this.t}, not ${end}`);
    return this.segments;
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
