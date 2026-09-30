import * as T from 'three';
import type { Facility } from './schema';
import { exteriorPrimitives } from './exterior-primitives';

/** 2022 offering brochure exterior photographs, fitted to the existing plan footprint. */
export function buildAlhambraExterior(model: Facility) {
  if (model.exteriorAppearance !== 'alhambra-brochure') return null;
  const facade = new T.Group(),
    roof = new T.Group(),
    site = new T.Group();
  facade.name = 'alhambra-brochure-facade';
  roof.name = 'alhambra-brochure-roof';
  site.name = 'alhambra-brochure-street-edge';
  const { box, beam, group, mesh, batch } = exteriorPrimitives();
  const stone = '#d9d5ca',
    joint = '#b9b7ac',
    steel = '#b8bdbb',
    blue = '#3f6d7e',
    dark = '#34474e';

  // The street entry is a folded standing-seam canopy; the barrel roof stays behind it.
  const canopy = group(facade, 'valley-folded-blue-canopy');
  const ridge = [
    [-14.7, 5.85],
    [-7.3, 4.12],
    [0.1, 5.45],
  ];
  for (let i = 0; i < 2; i++) {
    const [x0, y0] = ridge[i],
      [x1, y1] = ridge[i + 1];
    const geo = new T.BufferGeometry();
    geo.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        [
          x0,
          y0,
          24.95,
          x1,
          y1,
          24.95,
          x1,
          y1,
          28.3,
          x0,
          y0,
          24.95,
          x1,
          y1,
          28.3,
          x0,
          y0,
          28.3,
        ],
        3,
      ),
    );
    geo.computeVertexNormals();
    mesh(canopy, geo, blue);
    for (const z of [24.95, 28.3])
      beam(canopy, [x0, y0, z], [x1, y1, z], 0.14, 0.16, steel);
    for (let x = x0 + 0.15; x < x1; x += 0.35) {
      const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      beam(
        canopy,
        [x, y + 0.025, 24.95],
        [x, y + 0.025, 28.3],
        0.035,
        0.035,
        '#648696',
      );
    }
  }
  box(canopy, -7.3, 0, 28.23, 0.2, 4.12, 0.19, dark);
  // Deep pale entrance portals distinguish the two recessed doors from the blue infill.
  const portals = group(facade, 'valley-entry-portals');
  for (const x of [-10.9, -3.7]) {
    box(portals, x, 3.15, 25.37, 4.15, 0.32, 0.35, '#eeeee7');
    for (const xx of [x - 1.93, x + 1.93])
      box(portals, xx, 0.35, 25.37, 0.3, 2.8, 0.35, '#eeeee7');
    for (const xx of [x - 0.85, x + 0.85])
      box(portals, xx, 0.35, 25.42, 0.045, 2.76, 0.06, steel);
  }

  function shade(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    projection: number,
  ) {
    const g = group(facade, name);
    for (const zz of [z, z + projection]) box(g, x, y, zz, w, 0.1, 0.1, blue);
    for (let xx = x - w / 2; xx <= x + w / 2; xx += 0.48) {
      box(g, xx, y, z + projection / 2, 0.055, 0.09, projection, blue);
      beam(g, [xx, y, z + projection], [xx, y + 0.26, z], 0.035, 0.035, blue);
    }
  }
  shade('1827-upper-blue-sunshade', 9.8, 5.55, 26.83, 9.2, 0.72);
  shade('1819-storefront-blue-sunshade', 23.5, 2.86, 26.98, 9.6, 1.0);
  shade('1841-entry-blue-sunshade', -16.7, 2.95, 27.34, 3.0, 0.72);
  // Concrete panel joints, restrained wall lights and metal coping on every visible flat wing.
  const surface = group(facade, 'concrete-panel-joints-and-coping');
  for (const [x0, x1, z, h] of [
    [-31.18, -14.66, 27.32, 6.2],
    [3.2, 15.26, 26.81, 6.65],
    [15.57, 29.71, 26.97, 6.65],
  ]) {
    box(surface, (x0 + x1) / 2, h - 0.07, z, x1 - x0, 0.09, 0.32, steel);
    for (let x = x0 + 0.7; x < x1; x += 3.4)
      box(surface, x, 0, z, 0.017, h, 0.016, joint);
    for (const y of [3.0, 5.55])
      box(surface, (x0 + x1) / 2, y, z, x1 - x0, 0.016, 0.016, joint);
  }
  for (const [x, z0, z1, h] of [
    [-31.33, 8.9, 27.17, 6.2],
    [29.86, 3.51, 26.81, 6.65],
    [15.4, -12.46, 3.2, 6.65],
  ]) {
    box(surface, x, h - 0.07, (z0 + z1) / 2, 0.32, 0.09, z1 - z0, steel);
    for (let z = z0 + 2; z < z1; z += 4.5) {
      box(surface, x, 0, z, 0.016, h, 0.018, joint);
      box(surface, x, 3.4, z, 0.23, 0.11, 0.43, stone);
    }
    box(surface, x, 3.0, (z0 + z1) / 2, 0.015, 0.018, z1 - z0, joint);
  }

  // Glass wraps the Ethel corner; silver mullions and shallow canopy make the showcase legible.
  const corner = group(facade, 'ethel-glazed-corner');
  box(corner, -31.36, 2.88, 25.48, 0.65, 0.15, 3.65, steel);
  for (const z of [23.72, 24.85, 26.05, 27.13])
    box(corner, -31.34, 0.52, z, 0.12, 2.25, 0.06, steel);

  const edge = group(site, 'valley-entry-terrace-and-rails');
  box(edge, -7.3, -0.15, 26.73, 14.9, 0.55, 2.75, stone);
  for (let i = 0; i < 4; i++)
    box(edge, -7.3, -0.22, 29.1 - i * 0.36, 4.4, 0.155 * (i + 1), 0.4, stone);
  for (const [a, b] of [
    [-31.1, -9.6],
    [-5.0, 2.8],
  ]) {
    for (let x = a; x <= b; x += 1.65)
      box(edge, x, 0.25, 28.45, 0.035, 0.95, 0.035, steel);
    for (const y of [0.62, 0.85, 1.12])
      box(edge, (a + b) / 2, y, 28.45, b - a, 0.028, 0.035, steel);
  }
  const planters = group(site, 'frontage-low-planters');
  for (const [x, z, w] of [
    [7.8, 27.35, 10.6],
    [-27, 28.7, 5.7],
    [28.9, 24.5, 1.1],
  ]) {
    box(planters, x, -0.1, z, w, 0.4, 0.8, stone);
    for (let xx = x - w / 2 + 0.35; xx < x + w / 2; xx += 0.6) {
      const plant = mesh(
        planters,
        new T.IcosahedronGeometry(0.38, 1),
        '#668257',
      );
      plant.position.set(xx, 0.56, z);
      plant.scale.y = 1.2;
    }
  }
  // Aerials show low flat roofs enclosed by taller parapets, with packaged units and skylights.
  const equipment = group(roof, 'photo-referenced-roof-equipment');
  for (const [x, z, y] of [
    [-26, 13, 6.05],
    [-19, 21, 6.05],
    [5, -5, 6.5],
    [9, 9, 6.5],
    [7, 21, 6.5],
    [23, 9, 5.82],
    [21, 18, 5.82],
  ]) {
    box(equipment, x, y, z, 1.8, 0.18, 1.45, '#969c96');
    box(equipment, x, y + 0.18, z, 1.6, 0.8, 1.25, '#b0b2a8');
    for (const dx of [-0.4, 0.4]) {
      const fan = mesh(
        equipment,
        new T.CylinderGeometry(0.28, 0.28, 0.035, 16),
        '#505d5d',
      );
      fan.position.set(x + dx, y + 1.0, z);
    }
    for (let yy = y + 0.32; yy < y + 0.9; yy += 0.13)
      box(equipment, x, yy, z + 0.638, 1.35, 0.025, 0.025, '#747e7a');
  }
  for (const z of [-12, 1, 13]) {
    box(equipment, -7.4, 6.21, z, 1.6, 0.16, 1.7, '#a4aaa5');
    box(equipment, -7.4, 6.37, z, 1.38, 0.17, 1.48, '#c5d5d5');
  }
  for (const [x0, x1, z0, z1, y, h] of [
    [-31.18, -14.65, 8.9, 27.17, 6.05, 0.22],
    [15.57, 29.71, 3.51, 26.81, 5.82, 0.83],
  ]) {
    for (const x of [x0, x1])
      box(equipment, x, y, (z0 + z1) / 2, 0.2, h, z1 - z0, stone);
    for (const z of [z0, z1])
      box(equipment, (x0 + x1) / 2, y, z, x1 - x0, h, 0.2, stone);
  }
  for (const g of [facade, roof, site]) batch(g);
  return { facade, roof, site };
}
