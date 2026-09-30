import * as T from 'three';
export const deliveryStops = [
  {
    id: 'delivery-food',
    kind: 'food',
    x: 8.8,
    z: -21.8,
    door: [8.8, -15.212789],
    starts: [110, 460],
    dwell: 60,
  },
  {
    id: 'delivery-package',
    kind: 'package',
    x: 3.56,
    z: -18.5,
    door: [3.56, -12.465328],
    starts: [280, 590],
    dwell: 52,
  },
] as const;
const curves = new Map<string, T.CatmullRomCurve3>();
export function sampleDelivery(index: number, time: number) {
  const s = deliveryStops[index],
    t = ((time % 720) + 720) % 720;
  for (const start of s.starts) {
    const arrive = start + 24,
      leave = arrive + s.dwell,
      end = leave + 24;
    if (t < start || t >= end) continue;
    if (t >= arrive && t < leave)
      return {
        position: new T.Vector3(s.x, -0.23, s.z),
        heading: Math.PI,
        visible: true,
        phase: 'Unloading',
        door: 1,
      };
    const inbound = t < arrive,
      u = inbound ? (t - start) / 24 : (t - leave) / 24,
      key = `${index}-${inbound}`;
    let curve = curves.get(key);
    if (!curve) {
      const points = inbound
        ? [
            [27, -33],
            [20, -28],
            [s.x, -27],
            [s.x, s.z],
          ]
        : [
            [s.x, s.z],
            [s.x + 0.8, s.z + 0.8],
            [s.x + 5, s.z],
            [21, -26],
            [32, -33],
          ];
      curve = new T.CatmullRomCurve3(
        points.map((p) => new T.Vector3(p[0], -0.23, p[1])),
        false,
        'centripetal',
      );
      curves.set(key, curve);
    }
    const position = curve.getPointAt(u),
      direction = curve.getTangentAt(u);
    return {
      position,
      heading: Math.atan2(direction.x, direction.z) + Math.PI,
      visible: true,
      phase: inbound ? 'Arriving' : 'Leaving',
      door: 0,
    };
  }
  return {
    position: new T.Vector3(27, -0.23, -33),
    heading: 0,
    visible: false,
    phase: 'On delivery route',
    door: 0,
  };
}
export function buildDeliveries() {
  const root = new T.Group();
  root.name = 'rear-deliveries';
  const mat = (color: string) =>
    new T.MeshStandardMaterial({ color, roughness: 0.78 });
  const box = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat(color));
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const vehicles = deliveryStops.map((s) => {
    const g = new T.Group();
    g.name = s.id;
    root.add(g);
    box(
      g,
      0,
      0.6,
      0,
      2.0,
      0.65,
      4.6,
      s.kind === 'food' ? '#d7ddc6' : '#c9b18c',
    );
    box(
      g,
      0,
      1.45,
      0.65,
      2.1,
      1.75,
      3.25,
      s.kind === 'food' ? '#eff1e7' : '#bd9f79',
    );
    box(g, 0, 1.2, -1.65, 1.95, 1.25, 1.3, '#e3e9df');
    box(g, 0, 1.4, -2.31, 1.7, 0.65, 0.045, '#386372');
    for (const x of [-0.97, 0.97])
      box(g, x, 1.43, -1.6, 0.045, 0.65, 0.83, '#527d84');
    for (const x of [-1.02, 1.02])
      for (const z of [-1.5, 1.5]) {
        const w = new T.Mesh(
          new T.CylinderGeometry(0.35, 0.35, 0.22, 14),
          mat('#2b3b3d'),
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.35, z);
        g.add(w);
      }
    for (const x of [-0.65, 0.65]) {
      box(g, x, 0.75, -2.34, 0.3, 0.16, 0.04, '#f3e9c9');
      box(g, x, 0.7, 2.3, 0.18, 0.15, 0.04, '#b76554');
    }
    const tail = box(g, 0, 1.4, 2.31, 1.8, 1.45, 0.05, '#647c75');
    tail.name = 'delivery-tailgate';
    if (s.kind === 'food') {
      box(g, 0, 2.35, -0.75, 1.15, 0.35, 0.55, '#9daea8');
      for (let i = 0; i < 4; i++)
        box(g, -0.4 + i * 0.26, 2.35, -1.03, 0.12, 0.23, 0.02, '#5a7775');
    }
    return { root: g, tail };
  });
  const doors = deliveryStops.map((s) => {
    const pivot = new T.Group();
    pivot.position.set(
      s.door[0] - (s.kind === 'food' ? 1.25 : 0.5),
      0,
      s.door[1],
    );
    root.add(pivot);
    box(
      pivot,
      s.kind === 'food' ? 1.25 : 0.5,
      1.1,
      0,
      s.kind === 'food' ? 2.5 : 1,
      2.2,
      0.065,
      '#809b95',
    );
    // A shallow receiving ramp connects the pavement to the interior datum.
    const ramp = box(
      root,
      s.door[0],
      -0.115,
      s.door[1] - 0.85,
      s.kind === 'food' ? 2.5 : 1.15,
      0.04,
      1.7,
      '#adb8ae',
    );
    ramp.rotation.x = -Math.atan2(0.23, 1.7);
    return pivot;
  });
  function tick(time: number, enabled: boolean) {
    root.visible = enabled;
    vehicles.forEach((v, i) => {
      const p = sampleDelivery(i, time);
      v.root.visible = p.visible;
      v.root.position.copy(p.position);
      v.root.rotation.y = p.heading;
      v.tail.position.y = 1.4 + p.door * 0.65;
      doors[i].rotation.y = p.door ? -Math.PI * 0.47 : 0;
    });
  }
  return { root, tick, vehicles, doors };
}
