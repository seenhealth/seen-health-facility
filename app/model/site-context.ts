import * as T from 'three';
import type { Facility, Vec2 } from './schema';

/** Source-related streets, parking and massing. Heights and minor landscape are indicative. */
export function buildSiteContext(model: Facility) {
  const root = new T.Group();
  root.name = 'neighborhood-3d';
  root.userData = { accuracy: model.site.notes, location: model.location };
  const mats = new Map<string, T.MeshStandardMaterial>();
  function mat(c: string) {
    if (!mats.has(c))
      mats.set(c, new T.MeshStandardMaterial({ color: c, roughness: 0.86 }));
    return mats.get(c)!;
  }
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    parent: T.Object3D = root,
  ) {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c));
    o.position.set(x, y + h / 2, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function patch(
    points: Vec2[],
    y: number,
    h: number,
    c: string,
    parent: T.Object3D = root,
  ) {
    const s = new T.Shape();
    points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    const geo = new T.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const o = new T.Mesh(geo, mat(c));
    o.position.y = y;
    o.receiveShadow = true;
    o.castShadow = true;
    parent.add(o);
    return o;
  }
  function label(text: string, x: number, z: number, angle = 0) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 100;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e2e4dc';
    g.font = '500 45px Arial';
    g.textAlign = 'center';
    g.fillText(text, 512, 66);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(
      new T.PlaneGeometry(18, 1.76),
      new T.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      }),
    );
    mesh.rotation.set(-Math.PI / 2, 0, angle);
    mesh.position.set(x, -0.17, z);
    root.add(mesh);
  }
  function tree(x: number, z: number, size = 1) {
    box(x, -0.18, z, 0.22, 2.1 * size, 0.22, '#88735a');
    const crown = new T.Mesh(
      new T.IcosahedronGeometry(1.35 * size, 1),
      mat('#7d9b71'),
    );
    crown.position.set(x, 2.6 * size, z);
    crown.scale.y = 1.3;
    root.add(crown);
    box(x, -0.27, z, 2, 0.16, 2, '#afba95');
  }
  function building(x: number, z: number, w: number, d: number, h: number) {
    const g = new T.Group();
    g.name = 'Indicative adjacent building';
    root.add(g);
    box(x, -0.35, z, w, h, d, '#c1c8c2', g);
    box(x, h - 0.3, z, w + 0.15, 0.22, d + 0.15, '#9daaa2', g);
    for (let y = 1.4; y < h - 1; y += 3.25)
      for (let xx = x - w / 2 + 1.3; xx < x + w / 2 - 1; xx += 3.4)
        box(xx, y, z + d / 2 + 0.015, 1.4, 1.55, 0.05, '#a1b6b6', g);
  }
  box(0, -0.65, 0, 235, 0.2, 205, '#d0d8cd');
  if (model.geography) {
    for (const feature of model.geography.features) {
      if (feature.kind === 'building') {
        if (model.exteriorSurvey && feature.id === '426712373') {
          // The photos show a low podium and two setback office towers, not
          // the full OSM footprint extruded to its single maximum height.
          const podium = patch(feature.points, -0.4, 7.2, '#c8ccc5');
          podium.name = 'Olympic office complex · photo-estimated massing';
          podium.userData = {
            osmId: feature.id,
            heightStatus:
              'Tower maximum from map; podium and tower extents estimated from exterior photographs',
          };
          for (const [x, z, w, d, ht] of [
            [-5, -88, 27, 31, 43],
            [46, -87, 43, 45, feature.height || 48.3],
          ]) {
            const g = new T.Group();
            g.name = 'Setback glazed office tower';
            root.add(g);
            box(x, 7, z, w, ht - 7, d, '#536a71', g);
            for (let xx = x - w / 2; xx <= x + w / 2; xx += 1.55)
              for (const zz of [z - d / 2 - 0.03, z + d / 2 + 0.03])
                box(xx, 7, zz, 0.13, ht - 7, 0.12, '#bcc5bf', g);
            for (let zz = z - d / 2; zz <= z + d / 2; zz += 1.55)
              for (const xx of [x - w / 2 - 0.03, x + w / 2 + 0.03])
                box(xx, 7, zz, 0.12, ht - 7, 0.13, '#bcc5bf', g);
            for (let y = 7; y < ht; y += 3.7) {
              box(x, y, z - d / 2 - 0.04, w, 0.1, 0.1, '#869594', g);
              box(x, y, z + d / 2 + 0.04, w, 0.1, 0.1, '#869594', g);
            }
            box(x, ht, z, w + 0.5, 0.65, d + 0.5, '#d0d1c6', g);
          }
          continue;
        }
        if (model.exteriorSurvey && feature.id === '426712368') {
          const xs = feature.points.map((p) => p[0]),
            zs = feature.points.map((p) => p[1]);
          const x0 = Math.min(...xs),
            x1 = Math.max(...xs),
            z0 = Math.min(...zs),
            z1 = Math.max(...zs);
          const x = (x0 + x1) / 2,
            z = (z0 + z1) / 2;
          const g = new T.Group();
          g.name = 'Neighboring fuel canopy · photo-estimated details';
          g.userData = { osmId: feature.id };
          root.add(g);
          box(x, 4.8, z, x1 - x0, 0.48, z1 - z0, '#d4d3c7', g);
          box(x, 4.82, z, x1 - x0 + 0.06, 0.12, z1 - z0 + 0.06, '#a76a49', g);
          for (const zz of [z0 + 3, z1 - 3]) {
            box(x, 0, zz, 0.32, 4.8, 0.32, '#aaa99e', g);
            box(x, 0, zz, 1.0, 0.15, 3.8, '#c3c2b5', g);
            box(x, 0.15, zz + 1.0, 0.55, 1.6, 0.6, '#777e74', g);
          }
          continue;
        }
        const b = patch(feature.points, -0.4, feature.height || 6.4, '#bdc7bf');
        b.name = feature.name;
        b.userData = { osmId: feature.id, heightStatus: feature.heightStatus };
        patch(feature.points, (feature.height || 6.4) - 0.38, 0.14, '#aebbb1');
      } else {
        const [a, b] = feature.points,
          dx = b[0] - a[0],
          dz = b[1] - a[1];
        const street = box(
          (a[0] + b[0]) / 2,
          -0.4,
          (a[1] + b[1]) / 2,
          Math.hypot(dx, dz),
          0.16,
          feature.width || 8,
          feature.roadType === 'footway' ? '#dedfd3' : '#73817d',
        );
        street.rotation.y = -Math.atan2(dz, dx);
        street.userData = { osmId: feature.id, name: feature.name };
      }
    }
  }

  const olympic = model.contextStyle === 'olympic';
  if (olympic) {
    // Olympic boulevard fronts the north side, Beacon forms the west corner;
    // rear parking is behind the plan's covered entry.
    if (!model.geography) box(0, -0.4, -22.5, 150, 0.16, 16, '#64716f');
    label('W OLYMPIC BOULEVARD', 8, -28);
    if (!model.geography) box(-32, -0.4, 7, 11, 0.16, 78, '#64716f');
    label('BEACON AVENUE', -35, 9, Math.PI / 2);
    if (!model.exteriorSurvey) {
      box(0, -0.3, -13.5, 55, 0.14, 2, '#ebe8dc');
      box(-25, -0.3, 5, 2, 0.14, 39, '#ebe8dc');
      box(4, -0.35, 31, 59, 0.14, 23, '#8a928a');
      for (let x = -19; x < 31; x += 2.65) {
        box(x, -0.19, 40, 0.08, 0.025, 5.2, '#e1e2d6');
        box(x, -0.19, 23, 0.08, 0.025, 5.2, '#e1e2d6');
      }
      for (let x = -67; x < 69; x += 7) {
        box(x, -0.22, -22.5, 3, 0.025, 0.1, '#d9cfa5');
      }
      for (let x = -23; x < 25; x += 10) tree(x, -12.7, 0.85);
      for (let z = 19; z < 44; z += 10) tree(35, z, 0.85);
    }
    if (!model.geography) {
      building(-49, 2, 21, 24, 9);
      building(44, -5, 19, 19, 10);
      building(4, -42, 38, 21, 7);
      building(46, 35, 15, 19, 12);
    }
  } else {
    const poly = model.site.buildingOutline;
    const maxX = Math.max(...poly.map((p) => p[0]));
    const maxZ = Math.max(...poly.map((p) => p[1]));
    if (!model.geography) box(maxX + 10, -0.4, -3, 14, 0.16, 140, '#64716f');
    label('SOUTH BROADWAY', maxX + 10, -1, Math.PI / 2);
    if (!model.geography) box(0, -0.4, maxZ + 10, 145, 0.16, 13, '#64716f');
    label('WEST 15TH STREET', -4, maxZ + 10);
    box(maxX + 2, -0.3, -4, 3, 0.14, 69, '#ebe8dc');
    box(-1, -0.3, maxZ + 2, 70, 0.14, 3, '#ebe8dc');
    if (model.exteriorAppearance !== 'alveare-renderings') {
      box(-12, -0.35, 9, 15, 0.14, 16, '#89978c');
      for (let x = -18; x < -5; x += 2.65)
        box(x, -0.19, 12, 0.08, 0.025, 5, '#e2e4d8');
      for (let z = -22; z < 25; z += 9) tree(maxX + 2, z, 0.8);
      for (let x = -12; x < 14; x += 10) tree(x, maxZ + 2, 0.8);
      building(-20, -22, 20, 27, 27);
    }
    if (!model.geography) {
      building(maxX + 30, 1, 20, 33, 12);
      building(-3, maxZ + 30, 43, 18, 14);
    }
    // Upper residential envelope shown only with the whole-building/exterior view.
  }
  const massing = new T.Group();
  massing.name = 'site-building-massing';
  if (!olympic && model.exteriorAppearance !== 'alveare-renderings') {
    patch(model.site.buildingOutline, 4.2, 23.3, '#d8d8c9', massing);
    const xs = model.site.buildingOutline.map((p) => p[0]),
      zs = model.site.buildingOutline.map((p) => p[1]);
    const x = Math.max(...xs),
      z = Math.max(...zs),
      minZ = Math.min(...zs),
      minX = Math.min(...xs);
    for (let y = 5.1; y < 27; y += 3.2) {
      for (let zz = minZ + 2; zz < z - 1; zz += 3.6) {
        box(x + 0.03, y, zz, 0.08, 1.9, 1.8, '#77969d', massing);
        box(x + 0.13, y - 0.12, zz, 0.35, 0.12, 2.15, '#ededdf', massing);
      }
      for (let xx = minX + 2; xx < x - 1; xx += 3.6)
        box(xx, y, z + 0.03, 1.8, 1.9, 0.08, '#77969d', massing);
      box(
        (minX + x) / 2,
        y - 0.3,
        z + 0.08,
        x - minX,
        0.12,
        0.18,
        '#e6e7dc',
        massing,
      );
    }
  }
  return { root, massing, tick: (_time: number) => {} };
}
