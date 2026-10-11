import * as T from 'three';
import type { Asset } from './schema';

/** Asset kinds the October 2026 owner review added to the day-room/admin side. */
export const DAY_ADMIN_ASSET_KINDS = ['standing-desk'];

/**
 * Owner review 2026-10 · day-admin: the recreation therapy office's standing
 * desks. A sit-stand desk at standing height with its monitor and keyboard,
 * modeled around a floor-centered origin with the user's side toward local
 * +Z; `parameters.worktop` is the worktop height (default 1.05 m) and the
 * declared height is the top of the monitor. Proportions follow standard
 * products, not a verified manufacturer schedule.
 */
export function buildDayAdminAsset(
  spec: Asset,
  material: (id: string) => T.Material,
): T.Group | null {
  if (!DAY_ADMIN_ASSET_KINDS.includes(spec.kind)) return null;
  const g = new T.Group(),
    [w, h, d] = spec.dimensions,
    p = spec.parameters || {};
  const slot = (name: string, fallback: string) =>
    spec.materials?.[name] || fallback;
  const metal = slot('metal', 'photo-silver'),
    screen = slot('screen', 'screen'),
    dark = slot('frame', 'photo-black');
  // Boxes sit on `y`.
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    mat: string,
  ) => {
    const m = new T.Mesh(new T.BoxGeometry(a, b, c), material(mat));
    m.position.set(x, y + b / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const worktop = typeof p.worktop === 'number' ? p.worktop : 1.05,
    top = 0.03,
    screenH = 0.32,
    stemTop = h - screenH;
  // Worktop and the two T-shaped lifting columns on their feet.
  box(0, worktop - top, 0, w, top, d, spec.material);
  for (const x of [-(w / 2 - 0.15), w / 2 - 0.15]) {
    box(x, 0, 0, 0.08, 0.03, d - 0.1, metal);
    box(x, 0.03, -0.05, 0.07, worktop - top - 0.03, 0.07, metal);
  }
  box(0, worktop - top - 0.07, -0.05, w - 0.3, 0.04, 0.04, metal);
  // Monitor on a stem at the back, keyboard and mouse at the front.
  box(0, worktop, -d * 0.22, 0.2, 0.015, 0.14, metal);
  box(
    0,
    worktop + 0.015,
    -d * 0.22,
    0.03,
    stemTop - worktop - 0.015,
    0.03,
    metal,
  );
  box(0, stemTop, -d * 0.22, 0.52, screenH, 0.02, screen);
  box(0, stemTop + 0.02, -d * 0.22 - 0.015, 0.5, screenH - 0.04, 0.01, dark);
  box(0, worktop, d * 0.18, 0.38, 0.012, 0.13, dark);
  box(0.3, worktop, d * 0.18, 0.06, 0.03, 0.1, dark);
  return g;
}
