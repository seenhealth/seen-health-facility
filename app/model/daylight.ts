import * as T from 'three';

/**
 * Real daylight for the live lot: the sun's actual direction and height over
 * the center, and the sky's brightness through dawn, day, dusk and night.
 * World axes: +x east, +z south (the lot lies north-west of the building,
 * Ethel Avenue is the west street, the alley is north).
 */
export const CENTER = { lat: 34.0777588, lng: -118.1440427 };

/** Solar azimuth (degrees clockwise from north) and elevation (degrees above the horizon), NOAA's low-precision algorithm (±0.1°). */
export function solarPosition(
  date: Date,
  lat = CENTER.lat,
  lng = CENTER.lng,
): { azimuth: number; elevation: number } {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C =
    Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * M * rad) * 0.000289;
  const trueLng = L0 + C;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLng - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime =
    4 *
    (180 / Math.PI) *
    (y * Math.sin(2 * L0 * rad) -
      2 * e * Math.sin(M * rad) +
      4 * e * y * Math.sin(M * rad) * Math.cos(2 * L0 * rad) -
      0.5 * y * y * Math.sin(4 * L0 * rad) -
      1.25 * e * e * Math.sin(2 * M * rad));
  const minutesUtc =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolar = (minutesUtc + eqTime + 4 * lng + 1440) % 1440;
  const ha = (trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180) * rad;
  const phi = lat * rad;
  const cosZen =
    Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  let az =
    Math.acos(
      Math.min(
        1,
        Math.max(
          -1,
          (Math.sin(phi) * Math.cos(zen) - Math.sin(decl)) /
            (Math.cos(phi) * Math.sin(zen) || 1e-9),
        ),
      ),
    ) / rad;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  // Atmospheric refraction lifts a sun on the horizon by about half a degree.
  let el = 90 - zen / rad;
  if (el > -0.575 && el < 85) {
    const te = Math.tan(el * rad);
    el +=
      (el > 5
        ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
        : el > -0.575
          ? 1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))
          : -20.774 / te) / 3600;
  }
  return { azimuth: az, elevation: el };
}

const DAY = { sky: '#fbfaf6', ground: '#d8d4cc', hemi: 1.1, sun: 2.45, env: 0.45, bg: '#f3efe4' };
const NIGHT = { sky: '#6f7f94', ground: '#1d2226', hemi: 0.42, sun: 0, env: 0.12, bg: '#1b2126' };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const mix = (a: string, b: string, k: number) => new T.Color(a).lerp(new T.Color(b), k);

/** Finds the viewer's key light and sky fill once, then sets them for a moment in time. */
export function createDaylight(scene: T.Scene) {
  const lights: T.Object3D[] = [];
  scene.traverse((o) => {
    if (o instanceof T.DirectionalLight || o instanceof T.HemisphereLight) lights.push(o);
  });
  const sun = lights.find((o): o is T.DirectionalLight => o instanceof T.DirectionalLight) ?? null;
  const hemi = lights.find((o): o is T.HemisphereLight => o instanceof T.HemisphereLight) ?? null;
  const sunDistance = sun ? sun.position.length() : 108;
  const sunColor = new T.Color('#fff5ea');
  let last = { azimuth: 0, elevation: 0, phase: 'day' as 'day' | 'twilight' | 'night' };
  return {
    apply(date: Date) {
      const { azimuth, elevation } = solarPosition(date);
      // Night blends in from the horizon down to civil dusk (−6°); the key light fades over its last 8° of height.
      const night = Math.min(1, Math.max(0, -elevation / 6));
      const key = Math.min(1, Math.max(0, elevation / 8));
      const phase = elevation > 0 ? 'day' : elevation > -6 ? 'twilight' : 'night';
      if (sun) {
        const az = azimuth * (Math.PI / 180),
          el = Math.max(elevation, 2) * (Math.PI / 180);
        sun.position.set(
          Math.sin(az) * Math.cos(el) * sunDistance,
          Math.sin(el) * sunDistance,
          -Math.cos(az) * Math.cos(el) * sunDistance,
        );
        sun.intensity = DAY.sun * key;
        // Warmer and dimmer near the horizon, the usual low-sun look.
        sun.color.copy(sunColor).lerp(new T.Color('#ffc78a'), 1 - Math.min(1, Math.max(0, elevation / 25)));
        sun.visible = sun.intensity > 0.01;
      }
      if (hemi) {
        hemi.color.copy(mix(DAY.sky, NIGHT.sky, night));
        hemi.groundColor.copy(mix(DAY.ground, NIGHT.ground, night));
        hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, night);
      }
      if (scene.background instanceof T.Color) scene.background.copy(mix(DAY.bg, NIGHT.bg, night));
      scene.environmentIntensity = lerp(DAY.env, NIGHT.env, night);
      last = { azimuth, elevation, phase };
      return last;
    },
    get state() {
      return last;
    },
  };
}
