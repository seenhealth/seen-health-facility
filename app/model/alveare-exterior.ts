import * as T from 'three';
import type { Facility, Vec2 } from './schema';
import { exteriorPrimitives } from './exterior-primitives';

/** Related California's NE/NW renderings inform finishes; the senior footprint stays plan-derived. */
export function buildAlveareExterior(model: Facility) {
  if (model.exteriorAppearance !== 'alveare-renderings') return null;
  const facade = new T.Group(),
    massing = new T.Group(),
    roof = new T.Group(),
    site = new T.Group();
  facade.name = 'alveare-rendering-ground-facade';
  massing.name = 'site-building-massing';
  roof.name = 'alveare-parapets-and-roof';
  site.name = 'alveare-rendering-landscape';
  const { box, beam, patch, group, tree, batch } = exteriorPrimitives();
  const white = '#e5e3db',
    whiteEdge = '#f1eee5',
    bronze = '#a99980',
    rib = '#91816c',
    frame = '#5e655f',
    glass = '#899b9b';
  const base = 4.2,
    floorHeight = 3.25,
    levels = 7,
    top = base + levels * floorHeight;

  function window(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    wide: boolean,
  ) {
    // Deep bronze/aluminum reveal, inset glazing, operable lower pane and sill.
    box(parent, x, y - 0.07, z, w + 0.17, h + 0.14, 0.16, frame);
    box(parent, x, y, z + 0.095, w, h, 0.035, glass);
    box(parent, x, y + h * 0.27, z + 0.13, w, 0.045, 0.035, '#afb0a5');
    if (wide) box(parent, x, y, z + 0.13, 0.055, h, 0.035, '#a3a69e');
    box(parent, x, y - 0.1, z + 0.12, w + 0.2, 0.075, 0.21, '#c5c2b6');
  }
  function face(
    parent: T.Object3D,
    a: Vec2,
    b: Vec2,
    index: number,
    storyCount: number,
    height: number,
    lower = base,
  ) {
    const dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    const g = group(parent, `facade-elevation-${index}`);
    g.position.set(a[0], 0, a[1]);
    g.rotation.y = -Math.atan2(dz, dx);
    const bays = Math.max(2, Math.round(length / 3.65)),
      pitch = length / bays;
    // Renderings alternate taller white piers, bronze ribbed bays and recessed grey slots.
    for (let i = 0; i < bays; i++) {
      const x = (i + 0.5) * pitch,
        panel = (i + index) % 5 === 0 || (i + index) % 5 === 1;
      const slit = (i + index) % 5 === 2,
        recess = (i + index) % 7 === 4;
      const podium = i % 4 === 1 ? lower + 6.5 : lower;
      const y0 = panel ? podium : lower;
      const depth = panel ? 0.31 : recess ? 0.045 : 0.13;
      const parapet = (i + index) % 4 === 0 ? 0.7 : 0.18;
      box(
        g,
        x,
        y0,
        0.06,
        pitch - 0.06,
        height - y0 + parapet,
        0.22,
        panel ? bronze : white,
      );
      if (panel) {
        for (
          let xx = x - pitch / 2 + 0.16;
          xx < x + pitch / 2 - 0.1;
          xx += 0.19
        )
          box(g, xx, y0, 0.2, 0.027, height - y0 + parapet, 0.095, rib);
      }
      if (!panel)
        box(
          g,
          x,
          lower,
          0.04,
          pitch - 0.06,
          height - lower + parapet,
          0.12,
          white,
        );
      for (let floor = 0; floor < storyCount; floor++) {
        const y = lower + 0.64 + floor * floorHeight;
        const wide = !slit,
          w = wide ? Math.min(1.75, pitch * 0.56) : 0.63;
        window(g, x, y, depth, w, 2.0, wide);
        if (panel && floor >= 2)
          box(g, x, y - 0.45, 0.31, pitch - 0.16, 0.035, 0.03, '#c5b69f');
      }
      box(
        g,
        x,
        height + parapet,
        0.04,
        pitch - 0.01,
        0.08,
        0.38,
        panel ? '#b9ac95' : whiteEdge,
      );
    }
    return g;
  }
  const primary = group(massing, 'alveare-senior-residential-envelope');
  primary.userData = {
    source:
      'Related California NE/NW design renderings; August 2026 senior ground-floor plan',
    status:
      'Facade proportions and heights are estimates; senior Level 08 retained from newer CD schedules.',
  };
  patch(primary, model.site.buildingOutline, base, top - base, white);
  model.site.buildingOutline.forEach((a, i) =>
    face(
      primary,
      a,
      model.site.buildingOutline[(i + 1) % model.site.buildingOutline.length],
      i,
      levels,
      top,
    ),
  );

  // White lower blocks have larger lobby glazing and recessed entrances, not identical retail bays.
  const south = group(facade, '15th-street-entry-details');
  south.position.z = 24.41;
  for (const [x, w] of [
    [-11.2, 3.7],
    [-4.8, 5.7],
    [5.0, 4.8],
    [12.4, 4.4],
  ]) {
    box(south, x, 3.35, 0, w, 0.17, 1.0, whiteEdge);
    for (const xx of [x - w / 2, x + w / 2])
      box(south, xx, 0, 0, 0.18, 3.35, 0.22, white);
    for (let xx = x - w / 2 + 0.8; xx < x + w / 2; xx += 1.05)
      box(south, xx, 0.1, 0.13, 0.04, 3.16, 0.06, frame);
  }
  const east = group(facade, 'broadway-storefront-details');
  east.position.set(16.65, 0, 24.25);
  east.rotation.y = Math.PI / 2;
  for (const [u, w] of [
    [8.0, 4.4],
    [20, 4.8],
    [31.4, 5.5],
  ]) {
    box(east, u, 3.37, 0, w, 0.16, 1.05, whiteEdge);
    for (let x = u - w / 2; x <= u + w / 2; x += 1.1)
      box(east, x, 0.1, 0.12, 0.045, 3.2, 0.06, frame);
  }
  // End piers continue to grade as in the renderings.
  for (const [x, z, w, d] of [
    [16.63, 23.7, 0.34, 1.15],
    [-16.68, 23.7, 0.34, 1.15],
    [16.63, -23.4, 0.34, 1.15],
  ])
    box(facade, x, 0, z, w, base, d, white);

  const cap = group(roof, 'senior-roof-services');
  for (const [x, z, w, d] of [
    [7, -9, 3, 5],
    [-7, 16, 4, 3],
  ]) {
    box(cap, x, 26.95, z, w, 0.3, d, '#a7aba4');
    box(cap, x, 27.25, z, w - 0.25, 1.3, d - 0.25, '#b9b9ad');
    for (let y = 27.45; y < 28.45; y += 0.2)
      box(cap, x, y, z + d / 2 - 0.1, w - 0.5, 0.055, 0.05, '#7b857d');
  }

  // Neighboring family phases replace the old undifferentiated context box.
  // Their placement remains indicative because the linked views are perspectives, not elevations.
  const family = group(site, 'alveare-family-phases-rendering-context');
  family.userData = {
    status:
      'Surrounding family-phase footprints/height estimated from site relationship and public renderings',
  };
  const volumes: [string, Vec2[]][] = [
    [
      'west-family-wing',
      [
        [-20.5, 6.5],
        [-3.4, 6.5],
        [-3.4, -23],
        [-20.5, -23],
      ],
    ],
    [
      'north-family-wing',
      [
        [-20.5, -26],
        [16.4, -26],
        [16.4, -43],
        [-20.5, -43],
      ],
    ],
  ];
  for (const [name, poly] of volumes) {
    const g = group(family, name),
      h = 23.7;
    patch(g, poly, 0, h, white);
    poly.forEach((a, i) =>
      face(g, a, poly[(i + 1) % poly.length], i + 2, 6, h),
    );
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        len = Math.hypot(dx, dz);
      const baseFace = group(g, 'family-ground-frontage');
      baseFace.position.set(a[0], 0, a[1]);
      baseFace.rotation.y = -Math.atan2(dz, dx);
      for (let x = 2; x < len - 1; x += 3.2)
        window(baseFace, x, 0.45, 0.12, 2.3, 2.8, true);
    });
    patch(g, poly, h, 0.12, '#afb4ac');
  }

  const landscape = group(site, 'alveare-street-and-courtyard-landscape');
  // The garden slot between volumes is kept open; entrance paths remain clear.
  box(landscape, -10.5, -0.2, -24.6, 17, 0.12, 2.7, '#c8c8ba');
  for (const x of [-16, -10, -4]) tree(landscape, x, -24.5, 0.85);
  for (const [x, z, w, d] of [
    [18.1, -15, 1.2, 4.1],
    [18.1, 2, 1.2, 4.3],
    [-10.8, 26.2, 4.5, 1.1],
    [8.9, 26.2, 4.2, 1.1],
  ]) {
    box(landscape, x, -0.2, z, w, 0.3, d, '#c5c3b5');
    box(landscape, x, 0.1, z, w - 0.12, 0.2, d - 0.12, '#739266');
  }
  for (const [x, z] of [
    [18.5, -20],
    [18.5, -3],
    [18.5, 17],
    [-14, 26.9],
    [1, 26.9],
    [13.2, 26.9],
  ])
    tree(landscape, x, z, 0.86);
  // Bronze bollard lights and benches visible along the landscaped sidewalk.
  for (const [x, z] of [
    [-7.8, 26.2],
    [5.8, 26.2],
    [18.3, 13.7],
  ]) {
    box(landscape, x, 0.27, z, 1.7, 0.12, 0.48, '#8e7c5f');
    for (const xx of [x - 0.6, x + 0.6])
      box(landscape, xx, -0.16, z, 0.065, 0.43, 0.36, '#606961');
  }
  for (const [x, z] of [
    [-15.5, 26.4],
    [15.2, 26.4],
    [18.2, 8],
  ]) {
    box(landscape, x, -0.2, z, 0.1, 0.95, 0.1, '#697269');
    box(landscape, x, 0.71, z, 0.14, 0.08, 0.14, '#e8dfba');
  }
  // Fine entrance canopy ties at the primary residential entry.
  beam(facade, [-5.8, 3.55, 24.4], [-5.8, 3.32, 25.6], 0.045, 0.045, frame);
  beam(facade, [-1.8, 3.55, 24.4], [-1.8, 3.32, 25.6], 0.045, 0.045, frame);
  for (const g of [facade, massing, roof, site]) batch(g);
  return { facade, massing, roof, site };
}
