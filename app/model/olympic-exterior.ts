import * as T from 'three';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/addons/utils/BufferGeometryUtils.js';
import { buildEnvelopeWall } from './envelope';
import type { Facility, Vec2 } from './schema';

/** Existing shell observed in the seven supplied photos; heights remain photo estimates. */
export function buildOlympicExterior(model: Facility) {
  const survey = model.exteriorSurvey;
  if (model.contextStyle !== 'olympic' || !survey) return null;
  const facade = new T.Group(),
    roof = new T.Group(),
    site = new T.Group();
  facade.name = 'olympic-photographed-facade';
  roof.name = 'olympic-roof-equipment';
  site.name = 'olympic-photographed-site';
  const [x0, z0, x1, z1] = survey.bounds;
  const h = survey.roofHeight;
  const palette: Record<string, string> = {
    cream: '#d9d4bf',
    brick: '#e0dfd4',
    navy: '#405663',
    rib: '#526977',
    glass: '#738685',
    frame: '#b6bdb5',
    'photo-silver': '#adada0',
    gate: '#685a46',
    rust: '#8b5133',
    stone: '#65645a',
    roof: '#a1a19a',
  };
  const materials = new Map<string, T.MeshStandardMaterial>();
  const mat = (name: string) => {
    const color = palette[name] || name;
    if (!materials.has(color))
      materials.set(
        color,
        new T.MeshStandardMaterial({
          color,
          roughness: 0.86,
          side: T.DoubleSide,
        }),
      );
    return materials.get(color)!;
  };
  function box(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    ht: number,
    d: number,
    color: string,
  ) {
    const mesh = new T.Mesh(new T.BoxGeometry(w, ht, d), mat(color));
    mesh.position.set(x, y + ht / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function rod(
    parent: T.Object3D,
    a: number[],
    b: number[],
    radius: number,
    color: string,
  ) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    const mesh = new T.Mesh(
      new T.CylinderGeometry(radius, radius, delta.length(), 6),
      mat(color),
    );
    mesh.position.copy(start.add(end).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      delta.normalize(),
    );
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function group(parent: T.Object3D, name: string) {
    const g = new T.Group();
    g.name = name;
    parent.add(g);
    return g;
  }
  // Labels are rendered text, never photographs or architectural source images.
  function text(
    parent: T.Object3D,
    value: string,
    x: number,
    y: number,
    z: number,
    w: number,
    ht: number,
    rotation: number,
    color: string,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = 'bold 190px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, 512, 128, 995);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(
      new T.PlaneGeometry(w, ht),
      new T.MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.15,
        roughness: 0.85,
      }),
    );
    mesh.name = `address-${value}`;
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    parent.add(mesh);
  }
  const openings = (entries: [number, number, number, number, string][]) =>
    entries.map(([offset, width, sill, height, material], i) => ({
      id: `photo-opening-${i}`,
      offset,
      width,
      sill,
      height,
      material: material === 'entry-portal' ? 'glass' : material,
      operable: material === 'entry-portal',
      kind: (sill ? 'window' : 'door') as 'window' | 'door',
    }));
  const wall = (
    id: string,
    a: Vec2,
    b: Vec2,
    material: string,
    entries: [number, number, number, number, string][],
  ) => {
    const g = buildEnvelopeWall(
      {
        id,
        zoneId: 'ground-floor',
        a,
        b,
        height: h,
        thickness: 0.22,
        material,
        openings: openings(entries),
        status: 'Existing shell from user photographs; elevation estimated',
        referencePages: [1],
      },
      mat,
    );
    facade.add(g);
    return g;
  };
  const windowStart = x0 + 4.8,
    windowEnd = x1 - 3.15;
  wall('olympic-street-wall', [x0, z0], [x1, z0], 'cream', [
    [0.18, 4.35, 0, 2.65, 'gate'],
    [4.8, windowEnd - windowStart, 2.35, 5.05, 'glass'],
  ]);
  wall('olympic-east-wall', [x1, z0], [x1, z1], 'brick', []);
  wall('olympic-beacon-wall', [x0, z1], [x0, z0], 'brick', [
    [z1 + 0.8, -z0 - 1, 0, 2.65, 'gate'],
  ]);
  const rearDoors: [number, number, number, number, string][] = [
    [0.35, 5.4, 0, 2.8, 'rust'],
    [20.2, 6.4, 0, 2.8, 'glass'],
    [40.6, 2.6, 0, 2.55, 'rust'],
    [44.2, 2.6, 0, 2.55, 'rust'],
    // Proposed reception vestibule traced from the plan, behind the photographed rear shell.
    [-9.579 - x0, 1.93, 0, 2.8, 'entry-portal'],
  ];
  wall('olympic-rear-wall', [x0, z1], [x1, z1], 'brick', rearDoors);

  // A continuous, closely mullioned translucent band replaces the generic punched windows.
  const windows = group(facade, 'olympic-translucent-window-band');
  for (let x = windowStart; x <= windowEnd; x += 1.22)
    box(windows, x, 2.32, z0 - 0.14, 0.045, 5.12, 0.07, 'frame');
  for (const y of [2.34, 6.1, 7.4])
    box(
      windows,
      (windowStart + windowEnd) / 2,
      y,
      z0 - 0.17,
      windowEnd - windowStart,
      0.055,
      0.07,
      'frame',
    );
  for (let x = windowStart + 0.1; x < windowEnd; x += 0.14)
    box(windows, x, 2.4, z0 - 0.13, 0.011, 4.96, 0.01, '#8c9991');

  // Irregular individual stone faces keep the front base legible at close range.
  let seed = 1630;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function stonePanel(
    name: string,
    width: number,
    height: number,
    position: number[],
    angle: number,
  ) {
    const g = group(facade, name);
    g.position.set(...(position as [number, number, number]));
    g.rotation.y = angle;
    box(g, width / 2, 0, 0, width, height, 0.08, 'stone');
    for (let y = 0; y < height; y += 0.38) {
      let x = -random() * 0.25;
      while (x < width) {
        const span = 0.38 + random() * 0.46,
          left = Math.max(0.012, x + 0.015),
          right = Math.min(width - 0.012, x + span - 0.018);
        if (right > left) {
          const low = y + 0.012,
            top = Math.min(height - 0.012, y + 0.35 + random() * 0.03),
            mid = (left + right) / 2;
          const shape = new T.Shape();
          [
            [left, low + 0.04],
            [mid - 0.1, low],
            [right, low + 0.03],
            [right - 0.04, top - 0.03],
            [mid + 0.03, top],
            [left + 0.035, top - 0.045],
          ].forEach(([a, b], i) =>
            i ? shape.lineTo(a, b) : shape.moveTo(a, b),
          );
          shape.closePath();
          const mesh = new T.Mesh(
            new T.ExtrudeGeometry(shape, {
              depth: 0.035,
              bevelEnabled: true,
              bevelThickness: 0.008,
              bevelSize: 0.013,
              bevelSegments: 1,
              steps: 1,
            }),
            mat(
              ['#b6b4a6', '#cccbc0', '#a9ab9f', '#bebdb0', '#d2d1c5'][
                Math.floor(random() * 5)
              ],
            ),
          );
          mesh.position.z = 0.055;
          mesh.receiveShadow = mesh.castShadow = true;
          g.add(mesh);
        }
        x += span;
      }
    }
  }
  stonePanel(
    'olympic-stone-front-base',
    x1 - windowStart,
    2.3,
    [x1, 0, z0 - 0.18],
    Math.PI,
  );
  stonePanel(
    'olympic-stone-east-pier',
    3.05,
    h - 0.03,
    [x1, 0, z0 - 0.2],
    Math.PI,
  );
  stonePanel(
    'olympic-stone-return',
    1.05,
    h - 0.03,
    [x1 + 0.16, 0, z0],
    Math.PI / 2,
  );

  const screen = group(facade, 'olympic-tall-corner-screen');
  const screenEnd = x0 + 22;
  box(
    screen,
    (x0 + screenEnd) / 2,
    h - 0.05,
    z0 - 0.07,
    screenEnd - x0,
    survey.screenHeight - h + 0.05,
    0.24,
    'navy',
  );
  box(screen, x0 + 2.25, 2.7, z0 - 0.19, 4.5, h - 2.7, 0.14, 'navy');
  for (let x = x0 + 0.08; x < screenEnd; x += 0.19)
    box(screen, x, h, z0 - 0.23, 0.036, survey.screenHeight - h, 0.055, 'rib');
  for (let x = x0 + 0.08; x < x0 + 4.5; x += 0.19)
    box(screen, x, 2.73, z0 - 0.28, 0.036, h - 2.73, 0.025, 'rib');
  // High white side fin projects above the corrugated face, with no extra occupied floor.
  box(
    screen,
    x0 - 0.15,
    2.72,
    z0 + 4.1,
    0.28,
    survey.finHeight - 2.72,
    8.2,
    '#e6dfcc',
  );
  box(
    screen,
    x0 - 0.15,
    survey.finHeight,
    z0 + 4.1,
    0.34,
    0.06,
    8.3,
    '#a6a59a',
  );
  text(
    screen,
    '1630',
    x0 + 2.35,
    4.7,
    z0 - 0.32,
    4.05,
    1.42,
    Math.PI,
    '#e3e1d8',
  );
  text(
    screen,
    '1630',
    x0 - 0.305,
    4.7,
    z0 + 3.65,
    4.2,
    1.42,
    -Math.PI / 2,
    '#252e30',
  );
  const canopy = group(facade, 'olympic-wraparound-corner-canopy');
  box(canopy, x0 + 2.6, 2.64, z0 - 0.8, 8, 0.13, 2.05, '#c2bda7');
  box(canopy, x0 - 0.78, 2.64, z0 + 3.7, 1.9, 0.13, 11.0, '#c2bda7');
  for (let z = z0 + 0.1; z < 0.2; z += 0.16)
    rod(canopy, [x0 - 0.15, 0, z], [x0 - 0.15, 2.62, z], 0.018, 'gate');
  for (let x = x0 + 0.12; x < x0 + 4.48; x += 0.16)
    rod(canopy, [x, 0, z0 - 0.15], [x, 2.62, z0 - 0.15], 0.018, 'gate');

  const back = group(facade, 'olympic-solid-rear-panels');
  for (let x = x0 + 0.025, i = 0; x < x1; x += 6.78, i++) {
    const width = Math.min(6.73, x1 - x);
    box(
      back,
      x + width / 2,
      2.86,
      z1 + 0.13,
      width,
      h - 2.87,
      0.035,
      i % 3 === 0 ? '#d5ceba' : i % 3 === 1 ? '#e0dbc8' : '#d8d2bd',
    );
  }
  for (let y = 0.15; y < 2.76; y += 0.105) {
    let start = x0;
    for (const [offset, width] of [...rearDoors].sort((a, b) => a[0] - b[0])) {
      if (x0 + offset > start)
        box(
          back,
          (start + x0 + offset) / 2,
          y,
          z1 + 0.15,
          x0 + offset - start,
          0.012,
          0.01,
          '#c5c4b8',
        );
      start = x0 + offset + width;
    }
    if (start < x1)
      box(
        back,
        (start + x1) / 2,
        y,
        z1 + 0.15,
        x1 - start,
        0.012,
        0.01,
        '#c5c4b8',
      );
  }
  for (let y = 0.18; y < h; y += 0.12)
    box(facade, x0 - 0.125, y, 4.1, 0.01, 0.012, 15.3, '#c6c4b5');
  for (const [offset, width] of [rearDoors[0], rearDoors[2], rearDoors[3]])
    for (let x = x0 + offset + 0.07; x < x0 + offset + width; x += 0.16)
      rod(back, [x, 0, z1 + 0.21], [x, 2.68, z1 + 0.21], 0.018, 'rust');
  // Preserve the photographed entrance position independently of the proposed interior vestibule.
  for (const x of [-3.1, -1.5, 0.1, 1.7])
    box(back, x, 0, z1 + 0.2, 0.05, 2.74, 0.1, '#42463e');
  box(back, -0.41, 2.8, z1 + 0.23, 6.4, 0.31, 0.11, '#eeeddf');
  text(back, 'ENTRANCE', -0.4, 2.97, z1 + 0.3, 3.5, 0.28, 0, '#344838');
  for (const x of [-13, 1, 12, 22]) {
    rod(back, [x, 5.1, z1 + 0.16], [x, 5.1, z1 + 0.48], 0.025, 'gate');
    box(back, x, 5.04, z1 + 0.5, 0.23, 0.06, 0.35, '#686a5e');
  }
  for (const z of [-8, -4, 0, 4, 8])
    box(facade, x1 + 0.125, 0, z, 0.045, h, 0.026, '#c7c5b6');

  // Roof equipment and thin perimeter parapets from the drone views.
  for (const x of [x0, x1])
    box(roof, x, h, (z0 + z1) / 2, 0.14, 0.25, z1 - z0, 'brick');
  for (const z of [z0, z1])
    box(roof, (x0 + x1) / 2, h, z, x1 - x0, 0.25, 0.14, 'brick');
  for (const [x, z] of [
    [-7, 7.2],
    [-4.3, 7.2],
    [-1.6, 7.2],
    [5.8, 7.2],
    [8.5, 7.2],
    [11.2, 7.2],
    [-7, -7],
    [-3.4, -7],
    [0.2, -7],
    [4.8, -7],
    [8.6, -7],
  ]) {
    box(roof, x, h, z, 0.66, 0.64, 0.65, '#87918c');
    box(roof, x, h + 0.64, z, 0.77, 0.07, 0.75, '#a9b0a8');
    for (let i = -2; i <= 2; i++)
      box(roof, x + i * 0.1, h + 0.12, z + 0.333, 0.045, 0.4, 0.025, '#59675f');
  }
  box(roof, x0 + 3.3, h, z0 + 3.6, 5.0, 2.7, 4.9, '#e0ded1');
  box(roof, x0 + 3.3, h + 2.7, z0 + 3.6, 5.12, 0.1, 5.0, '#a7a89e');

  // Parking geometry follows the photographed lot extending behind the building to the houses.
  const pavement = group(site, 'olympic-rear-parking');
  box(pavement, 0.4, -0.31, 34.1, 49.8, 0.12, 44.6, '#898b83');
  box(pavement, -27, -0.29, 18.9, 5.3, 0.14, 72, '#d0cec0');
  box(pavement, 0, -0.29, z0 - 2.4, 51, 0.14, 4.6, '#d3d0c3');
  box(pavement, 0, -0.17, 14.0, 48.0, 0.055, 4.3, '#b8b7aa');
  box(pavement, -26.9, -0.13, 27.3, 5.45, 0.025, 8.4, '#aaa99d');
  for (const row of [18.1, 32.1, 37.5, 49.6]) {
    for (let x = -22.7; x < 23.5; x += 2.65) {
      if (row === 18.1 && x > -7 && x < 6) continue;
      box(pavement, x, -0.175, row, 0.07, 0.018, 5.15, '#eeece0');
    }
    box(
      pavement,
      0.4,
      -0.176,
      row + (row === 37.5 ? -2.55 : 2.55),
      46.5,
      0.018,
      0.07,
      '#e2d9b6',
    );
  }
  for (const x of [
    -19.9, -17.25, -14.6, -11.95, -9.3, 8.4, 11.05, 13.7, 16.35, 19,
  ])
    box(pavement, x, -0.15, 15.8, 1.65, 0.13, 0.18, '#d9bd52');
  for (const [x, z] of [
    [-6.3, 18],
    [7.8, 18],
    [-6.3, 32],
  ]) {
    box(pavement, x, -0.15, z, 1.25, 0.022, 1.25, '#4e91b2');
    const ring = new T.Mesh(
      new T.TorusGeometry(0.29, 0.035, 4, 16),
      mat('#eeeee2'),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, -0.12, z + 0.08);
    pavement.add(ring);
    box(pavement, x, -0.12, z - 0.25, 0.055, 0.015, 0.48, '#eeeee2');
  }
  box(pavement, -4.0, -0.15, 23.5, 1.55, 0.024, 15.8, '#5c9bb2');
  for (let z = 16; z < 31; z += 1.2) {
    const l = box(pavement, -4.0, -0.118, z, 1.48, 0.018, 0.07, '#c6c4b4');
    l.rotation.y = -0.43;
  }
  for (let z = 15.7; z < 30.4; z += 0.38)
    box(
      pavement,
      -5.1,
      -0.1,
      z,
      0.21,
      0.07,
      0.19,
      Math.floor(z * 3) % 2 ? '#3e423d' : '#d5c67a',
    );
  // The entrance-side utility enclosure is omitted at the user's request.
  function fence(a: Vec2, b: Vec2, name: string, height = 2.3) {
    const g = group(site, name),
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    g.position.set(a[0], -0.17, a[1]);
    g.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let x = 0; x <= len; x += 2.6)
      rod(g, [x, 0, 0], [x, height + 0.08, 0], 0.035, '#727a72');
    rod(g, [0, height, 0], [len, height, 0], 0.023, '#747d74');
    const lines: number[] = [];
    for (const direction of [-1, 1])
      for (let start = -height; start < len + height; start += 0.24) {
        const xa = Math.max(0, start),
          xb = Math.min(len, start + height);
        if (xb > xa)
          lines.push(
            xa,
            direction === 1 ? xa - start : height - (xa - start),
            0,
            xb,
            direction === 1 ? xb - start : height - (xb - start),
            0,
          );
      }
    g.add(
      new T.LineSegments(
        new T.BufferGeometry().setAttribute(
          'position',
          new T.Float32BufferAttribute(lines, 3),
        ),
        new T.LineBasicMaterial({
          color: '#7c8279',
          transparent: true,
          opacity: 0.7,
        }),
      ),
    );
  }
  fence([-24.3, 12.5], [-24.3, 22.8], 'olympic-west-fence-north');
  fence([-24.3, 31.4], [-24.3, 55.5], 'olympic-west-fence-south');
  fence([-24.3, 55.5], [25.3, 55.5], 'olympic-south-fence');
  fence([25.3, 12.5], [25.3, 55.5], 'olympic-east-fence');
  fence([-24.1, 22.8], [-20.0, 23.4], 'olympic-open-entry-gate');
  fence([-24.1, 31.4], [-20.0, 30.8], 'olympic-open-entry-gate-2');
  function broadTree(x: number, z: number, size = 1) {
    const g = group(site, 'olympic-street-tree');
    rod(g, [x, -0.15, z], [x, 3.7 * size, z], 0.18 * size, '#706959');
    for (let i = 0; i < 6; i++) {
      const a = i * 2.399;
      const c = new T.Mesh(
        new T.IcosahedronGeometry(1.95 * size, 1),
        mat(['#416344', '#4a6b43', '#577646'][i % 3]),
      );
      c.position.set(
        x + Math.cos(a) * 1.35 * size,
        4.35 * size + (i % 2) * 0.5,
        z + Math.sin(a) * 1.25 * size,
      );
      c.scale.set(1, 0.9, 0.85);
      c.castShadow = true;
      g.add(c);
    }
  }
  for (const x of [-13.5, -5, 3.5, 12.0, 20.2]) broadTree(x, z0 - 2.55, 1.05);
  function palm(x: number, z: number, height: number) {
    const g = group(site, 'olympic-beacon-palm');
    rod(g, [x, -0.15, z], [x + 0.2, height, z], 0.2, '#827563');
    for (let y = 1; y < height - 1; y += 0.38) {
      const ring = new T.Mesh(
        new T.TorusGeometry(0.207, 0.013, 3, 8),
        mat('#9c8c70'),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x + (0.2 * y) / height, y, z);
      g.add(ring);
    }
    const skirt = new T.Mesh(new T.ConeGeometry(0.7, 1.65, 8), mat('#857849'));
    skirt.position.set(x + 0.2, height - 0.6, z);
    g.add(skirt);
    for (let i = 0; i < 13; i++) {
      const a = i * 2.399,
        length = 2.6 + (i % 4) * 0.35,
        positions: number[] = [];
      const point = (t: number, side: number) => {
        const rad = length * t,
          width = Math.sin(t * Math.PI) * 0.23 * side;
        return [
          x + 0.2 + Math.cos(a) * rad - Math.sin(a) * width,
          height + Math.sin(t * Math.PI) * 0.95 - t * t * 1.6,
          z + Math.sin(a) * rad + Math.cos(a) * width,
        ];
      };
      for (let j = 0; j < 9; j++) {
        const u = j / 9,
          v = (j + 1) / 9;
        positions.push(
          ...point(u, -1),
          ...point(v, -1),
          ...point(v, 1),
          ...point(u, -1),
          ...point(v, 1),
          ...point(u, 1),
        );
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      const frond = new T.Mesh(geo, mat(i % 2 ? '#657d43' : '#4f693c'));
      frond.castShadow = true;
      g.add(frond);
    }
  }
  for (const [z, ht] of [
    [-7, 14.8],
    [12.2, 15.6],
    [29, 14.2],
    [45, 15.8],
  ])
    palm(-28.5, z, ht);
  for (const z of [-5, 2, 8]) broadTree(x0 - 0.5, z, 0.55);
  // Street lamps, utilities and the east alley visible in the reference photographs.
  for (const x of [-20, 4, 23]) {
    rod(site, [x, 0, z0 - 3.6], [x, 5.4, z0 - 3.6], 0.075, '#728271');
    rod(site, [x, 4.9, z0 - 3.6], [x + 0.65, 4.9, z0 - 3.6], 0.045, '#728271');
    const globe = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), mat('#d9dbcc'));
    globe.position.set(x + 0.65, 4.7, z0 - 3.6);
    site.add(globe);
  }
  for (const z of [9, 42])
    rod(site, [27.6, 0, z], [27.6, 10.5, z], 0.15, '#817060');
  rod(site, [27.6, 9.8, 9], [27.6, 9.0, 26], 0.013, '#4a4c43');
  rod(site, [27.6, 9.0, 26], [27.6, 9.8, 42], 0.013, '#4a4c43');
  box(site, 27.6, -0.3, 32, 3.8, 0.12, 49, '#b5b6aa');

  // Merge opaque static pieces per group/material to keep the detailed shell responsive.
  for (const parent of [facade, roof, site])
    parent.traverse((o) => {
      const byMaterial = new Map<T.Material, T.Mesh[]>();
      for (const child of o.children)
        if (
          child instanceof T.Mesh &&
          child.material instanceof T.MeshStandardMaterial &&
          !child.material.transparent
        ) {
          const list = byMaterial.get(child.material) || [];
          list.push(child);
          byMaterial.set(child.material, list);
        }
      for (const [material, meshes] of byMaterial)
        if (meshes.length > 1) {
          const geos = meshes.map((m) => {
            m.updateMatrix();
            let geo = m.geometry.clone().applyMatrix4(m.matrix);
            if (geo.index) geo = geo.toNonIndexed();
            geo.deleteAttribute('uv');
            return geo;
          });
          const merged = mergeGeometries(geos);
          geos.forEach((g) => g.dispose());
          if (merged) {
            const mesh = new T.Mesh(mergeVertices(merged), material);
            merged.dispose();
            mesh.castShadow = mesh.receiveShadow = true;
            meshes.forEach((m) => {
              o.remove(m);
              m.geometry.dispose();
            });
            o.add(mesh);
          }
        }
    });
  return { facade, roof, site };
}
