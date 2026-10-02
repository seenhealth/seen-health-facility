import program from '../data/day-program.json';

/**
 * The day-room program: an open-floor rotation shared by every site, plus
 * concurrent Alhambra zones (long arts table, tea corner) with guest
 * instructors. Monday's floor sessions are the baked loop; Tuesday to Friday
 * rotate repertoire programs into the same floor slots at runtime.
 */
export const dayProgram = program;
type BaseSession = (typeof program.programs)[number];
export type ProgramFormat = 'group' | 'small-group' | 'one-to-one';
/**
 * A session as it runs: a zone's own session, or a repertoire program placed
 * in a floor slot. Floor sessions carry their slot and its baked base session.
 */
export type DaySession = BaseSession & {
  format: ProgramFormat;
  season?: string;
  /** Floor only: slot index and the Monday session baked into that slot. */
  slot?: number;
  baseId?: string;
  /** Base floor session whose equipment the room shows. */
  propsLike?: string;
};
export type DayZone = (typeof program.zones)[number];
const DAY = 720;
const wrap = (time: number) => ((time % DAY) + DAY) % DAY;
const at = (sessions: DaySession[], time: number) => {
  const t = wrap(time);
  return sessions.find((s) => t >= s.start && t < s.end)!;
};
/** Program actions done standing (with seated versions), not at a table. */
export const MOVEMENT_ACTIONS = new Set([
  'exercise',
  'dance',
  'tai-chi',
  'qigong',
  'fan-dance',
]);
const sessions = program.programs as DaySession[];
/** Monday's open-floor sessions: the gap-free rotation baked into the loop. */
export const floorPrograms = sessions
  .filter((s) => s.zone === 'floor')
  .map((s, slot) => ({ ...s, slot, baseId: s.id, propsLike: s.id }));

export const rotationDays = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type RotationDay = (typeof rotationDays)[number];
const catalogue = new Map<string, Partial<DaySession>>(
  [...sessions, ...program.repertoire].map((p) => [p.id, p as DaySession]),
);
/**
 * A day's floor sessions: each program takes its slot's window, layout and
 * board from the baked base session, and its own titles, actions, décor and
 * (when it names one) guest instructor.
 */
export function resolveRotation(day: RotationDay): DaySession[] {
  return program.rotations[day].map((id, slot) => {
    const base = floorPrograms[slot],
      p = catalogue.get(id);
    if (!p) throw new Error(`Unknown day program ${id} (${day} slot ${slot})`);
    if (p.id === base.id) return base;
    return {
      ...base,
      instructorId: undefined,
      instructorAction: undefined,
      labelZh: undefined,
      season: undefined,
      ...p,
      zone: 'floor',
      start: base.start,
      end: base.end,
      slot,
      baseId: base.id,
      propsLike: p.propsLike || base.id,
    } as DaySession;
  });
}
let activeDay: RotationDay = 'mon',
  activeFloor: DaySession[] = floorPrograms;
const rotationListeners = new Set<() => void>();
export const programRotation = () => activeDay;
export const isRotationDay = (value: unknown): value is RotationDay =>
  typeof value === 'string' &&
  (rotationDays as readonly string[]).includes(value);
/** Switch the open floor to another day's rotation. */
export function setProgramRotation(day: RotationDay) {
  if (day === activeDay) return;
  activeDay = day;
  activeFloor = day === 'mon' ? floorPrograms : resolveRotation(day);
  rotationListeners.forEach((listener) => listener());
}
export function subscribeProgramRotation(listener: () => void) {
  rotationListeners.add(listener);
  return () => {
    rotationListeners.delete(listener);
  };
}
/** A zone's sessions on the active day (the floor follows the rotation). */
export const zoneSessions = (zoneId: string): DaySession[] =>
  zoneId === 'floor' ? activeFloor : sessions.filter((s) => s.zone === zoneId);
/** The open-floor session at `time` on the active day. */
export const programAt = (time: number) => at(activeFloor, time);
/** The session running in every zone at `time`, open floor first. */
export const sessionsAt = (time: number) =>
  program.zones.map((zone) => ({
    zone,
    session: at(zoneSessions(zone.id), time),
  }));
export const instructorOf = (session: DaySession) =>
  program.instructors.find((i) => i.id === session.instructorId);
