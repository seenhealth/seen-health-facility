import program from '../data/day-program.json';

/**
 * The day-room program: an open-floor rotation shared by every site, plus
 * concurrent Alhambra zones (long arts table, tea corner) with guest instructors.
 */
export const dayProgram = program;
export type DaySession = (typeof program.programs)[number];
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
/** Open-floor sessions: a gap-free rotation over the care day. */
export const floorPrograms = program.programs.filter((s) => s.zone === 'floor');
export const zoneSessions = (zoneId: string) =>
  program.programs.filter((s) => s.zone === zoneId);
/** The open-floor session at `time`. */
export const programAt = (time: number) => at(floorPrograms, time);
/** The session running in every zone at `time`, open floor first. */
export const sessionsAt = (time: number) =>
  program.zones.map((zone) => ({
    zone,
    session: at(zoneSessions(zone.id), time),
  }));
export const instructorOf = (session: DaySession) =>
  program.instructors.find((i) => i.id === session.instructorId);
