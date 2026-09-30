/**
 * The shared care-day clock: 720 loop seconds represent 8 AM–4 PM
 * (480 clock minutes), so one loop second is 2/3 of a minute. Vans
 * (`arrival.ts` vanWindows), the day-room program and every activity source
 * run on this clock. Labels match `dayTime` in `app/model/activity.ts`.
 */
export type CareDayClock = {
  duration: number;
  dayStartMinutes: number;
  dayDurationMinutes: number;
};
export const CARE_DAY: CareDayClock = {
  duration: 720,
  dayStartMinutes: 480,
  dayDurationMinutes: 480,
};
/** Wrap any time onto the loop, [0, duration). */
export function wrapLoop(seconds: number, clock: CareDayClock = CARE_DAY) {
  return (
    ((seconds % clock.duration) + clock.duration) % clock.duration
  );
}
/** Loop seconds → minutes since midnight (not wrapped: 720 → 960). */
export function loopToMinutes(seconds: number, clock: CareDayClock = CARE_DAY) {
  return (
    clock.dayStartMinutes +
    (seconds / clock.duration) * clock.dayDurationMinutes
  );
}
/** Minutes since midnight → loop seconds (may fall outside the loop). */
export function minutesToLoop(minutes: number, clock: CareDayClock = CARE_DAY) {
  return (
    ((minutes - clock.dayStartMinutes) / clock.dayDurationMinutes) *
    clock.duration
  );
}
/** Clock minutes represented by a loop duration (e.g. 45 s → 30 min). */
export function loopDurationMinutes(
  seconds: number,
  clock: CareDayClock = CARE_DAY,
) {
  return (seconds / clock.duration) * clock.dayDurationMinutes;
}
/** "9:05 AM" for minutes since midnight (floors to the minute, like dayTime). */
export function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(Math.floor(minutes % 60)).padStart(2, '0')} ${h % 24 >= 12 ? 'PM' : 'AM'}`;
}
/** "9:05 AM" for loop seconds; identical to `dayTime` for times inside the loop. */
export function clockLabel(seconds: number, clock: CareDayClock = CARE_DAY) {
  return formatClock(loopToMinutes(seconds, clock));
}
/** Parse "9:05 AM" / "14:10" into minutes since midnight. */
export function parseClock(label: string): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(label);
  if (!m) throw new Error(`Unrecognised clock label: ${label}`);
  let h = Number(m[1]) % (m[3] ? 12 : 24);
  if (m[3]?.toUpperCase() === 'PM') h += 12;
  return h * 60 + Number(m[2]);
}
/** "9:05 AM" → loop seconds. */
export function clockToLoop(label: string, clock: CareDayClock = CARE_DAY) {
  return minutesToLoop(parseClock(label), clock);
}
/** Hour ticks inside the loop for chart axes: [{ t, label }]. */
export function hourTicks(clock: CareDayClock = CARE_DAY) {
  const out: { t: number; label: string }[] = [];
  const first = Math.ceil(clock.dayStartMinutes / 60) * 60,
    last = clock.dayStartMinutes + clock.dayDurationMinutes;
  for (let m = first; m <= last; m += 60)
    out.push({
      t: minutesToLoop(m, clock),
      label: formatClock(m).replace(':00', ''),
    });
  return out;
}
