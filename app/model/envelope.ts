import * as T from 'three';
import type { EnvelopeWall, Facility, Vec2 } from './schema';

export function buildEnvelopeWall(
  w: EnvelopeWall,
  material: (id: string) => T.Material,
  cutHeight?: number,
) {
  const g = new T.Group();
  g.name = cutHeight === undefined ? w.id : `${w.id}-cutaway`;
  g.userData = {
    id: w.id,
    zoneId: w.zoneId,
    status: w.status,
    sourcePages: w.referencePages,
  };
  g.position.set(w.a[0], 0, w.a[1]);
  g.rotation.y = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  if (w.detailIds && cutHeight === undefined) return g;
  const length = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const h = Math.min(cutHeight ?? Infinity, w.height);
  const block = (
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    id: string,
    name?: string,
  ) => {
    if (width <= 0.00001 || height <= 0.00001) return;
    const m = new T.Mesh(new T.BoxGeometry(width, height, depth), material(id));
    m.position.set(x + width / 2, y + height / 2, 0);
    m.castShadow = m.receiveShadow = true;
    if (name) m.name = name;
    g.add(m);
  };
  // Subdivide around openings: no solid wall behind a window and no invalid
  // polygon holes touching the bottom edge at a door threshold.
  const xs = [
    ...new Set([
      0,
      length,
      ...w.openings.flatMap((o) => [o.offset, o.offset + o.width]),
    ]),
  ].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const left = xs[i],
      right = xs[i + 1],
      mid = (left + right) / 2;
    const openings = w.openings
      .filter((o) => mid > o.offset && mid < o.offset + o.width)
      .sort((a, b) => a.sill - b.sill);
    let y = 0;
    for (const o of openings) {
      block(
        left,
        y,
        right - left,
        Math.min(o.sill, h) - y,
        w.thickness,
        w.material,
      );
      y = Math.max(y, Math.min(h, o.sill + o.height));
    }
    block(left, y, right - left, h - y, w.thickness, w.material);
  }
  for (const o of w.openings) {
    const height = Math.min(o.height, h - o.sill);
    if (height <= 0) continue;
    if (o.id !== 'shell-lobby-west-opening-3')
      block(o.offset, o.sill, o.width, height, 0.055, o.material, o.id);
    const frame = 0.045;
    block(o.offset, o.sill, frame, height, w.thickness + 0.035, 'frame');
    block(
      o.offset + o.width - frame,
      o.sill,
      frame,
      height,
      w.thickness + 0.035,
      'frame',
    );
    if (o.sill > 0)
      block(o.offset, o.sill, o.width, frame, w.thickness + 0.035, 'frame');
    if (height === o.height)
      block(
        o.offset,
        o.sill + height - frame,
        o.width,
        frame,
        w.thickness + 0.035,
        'frame',
      );
    if (o.kind === 'door' && o.width > 1.3)
      block(
        o.offset + o.width / 2 - frame / 2,
        o.sill,
        frame,
        height,
        0.08,
        'frame',
      );
  }
  if (w.profile && cutHeight === undefined) {
    const shape = new T.Shape();
    shape.moveTo(0, w.height);
    shape.lineTo(length, w.height);
    [...w.profile].reverse().forEach((p) => shape.lineTo(...p));
    shape.closePath();
    const geo = new T.ExtrudeGeometry(shape, {
      depth: w.thickness,
      bevelEnabled: false,
      steps: 1,
    });
    geo.translate(0, 0, -w.thickness / 2);
    const panel = new T.Mesh(geo, material(w.material));
    panel.castShadow = panel.receiveShadow = true;
    g.add(panel);
  }
  // Coping follows the arch rather than leaving the curved roof-end open.
  const points =
    cutHeight === undefined && w.profile
      ? w.profile
      : [
          [0, h],
          [length, h],
        ];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i],
      [x2, y2] = points[i + 1];
    const cap = new T.Mesh(
      new T.BoxGeometry(
        Math.hypot(x2 - x1, y2 - y1) + 0.006,
        0.07,
        w.thickness + 0.045,
      ),
      material('photo-silver'),
    );
    cap.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
    cap.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    g.add(cap);
  }
  return g;
}

// Clip a polygon to successive strips before curving it. Setbacks remain open
// even where a barrel roof uses a non-rectangular footprint.
export function buildRoofGeometry(r: Facility['roofSections'][number]) {
  const [[x1, z1], [x2, z2]] = r.bounds;
  const polygon = r.polygon || [
    [x1, z1],
    [x2, z1],
    [x2, z2],
    [x1, z2],
  ];
  const positions: number[] = [];
  const height = (x: number) =>
    r.eaveHeight +
    (r.kind === 'barrel'
      ? r.rise * Math.sin((Math.PI * (x - x1)) / (x2 - x1))
      : 0);
  const triangle = (a: number[], b: number[], c: number[]) =>
    positions.push(...a, ...b, ...c);
  const clip = (p: Vec2[], cut: number, sign: number): Vec2[] => {
    const out: Vec2[] = [];
    p.forEach((b, i) => {
      const a = p[(i + p.length - 1) % p.length],
        insideA = sign * (a[0] - cut) >= -1e-8,
        insideB = sign * (b[0] - cut) >= -1e-8;
      if (insideA !== insideB)
        out.push([cut, a[1] + ((b[1] - a[1]) * (cut - a[0])) / (b[0] - a[0])]);
      if (insideB) out.push(b);
    });
    return out;
  };
  const steps = r.kind === 'barrel' ? 48 : 1;
  const xs = [
    ...new Set([
      ...Array.from(
        { length: steps + 1 },
        (_, i) => x1 + ((x2 - x1) * i) / steps,
      ),
      ...polygon.map((p) => p[0]),
    ]),
  ].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const p = clip(clip(polygon, xs[i], 1), xs[i + 1], -1);
    if (p.length < 3) continue;
    const s = new T.Shape(p.map((q) => new T.Vector2(q[0], -q[1])));
    const geom = new T.ShapeGeometry(s).toNonIndexed();
    const pos = geom.getAttribute('position');
    for (let k = 0; k < pos.count; k += 3) {
      const v = [0, 1, 2].map((j) => [
        pos.getX(k + j),
        height(pos.getX(k + j)),
        -pos.getY(k + j),
      ]);
      triangle(v[0], v[1], v[2]);
      triangle(
        v[2].map((x, j) => (j === 1 ? x - 0.12 : x)),
        v[1].map((x, j) => (j === 1 ? x - 0.12 : x)),
        v[0].map((x, j) => (j === 1 ? x - 0.12 : x)),
      );
    }
    geom.dispose();
  }
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const cuts = [
      0,
      1,
      ...xs
        .filter((x) => x > Math.min(a[0], b[0]) && x < Math.max(a[0], b[0]))
        .map((x) => (x - a[0]) / (b[0] - a[0])),
    ].sort((a, b) => a - b);
    for (let j = 0; j < cuts.length - 1; j++) {
      const points = cuts
        .slice(j, j + 2)
        .map((t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      const [p, q] = points.map(([x, z]) => [x, height(x), z]);
      const pp = [p[0], p[1] - 0.12, p[2]],
        qq = [q[0], q[1] - 0.12, q[2]];
      triangle(p, pp, q);
      triangle(q, pp, qq);
    }
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
