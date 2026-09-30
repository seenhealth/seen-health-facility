export type ShowcaseView = 'tiltshift' | 'day' | 'logistics';
/** Fixed presentation cameras. Activity advances; the camera never rotates or tours. */
export function showcaseFrame(
  _seconds: number,
  mode: ShowcaseView = 'tiltshift',
) {
  const views = {
    tiltshift: {
      x: -8,
      z: 3,
      zoom: 1.25,
      angle: 0.58,
      title: 'A day at Seen Health',
    },
    day: {
      x: -7,
      z: 16,
      zoom: 2.75,
      angle: 0.58,
      title: 'Day center · connection & creativity',
    },
    logistics: {
      x: -8,
      z: -8,
      zoom: 1.7,
      angle: 0.58,
      title: 'Arrivals, meals & deliveries',
    },
  };
  return views[mode];
}
