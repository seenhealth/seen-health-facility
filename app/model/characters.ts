import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import templates from '../data/character-templates.json';

export type CharacterRole =
  | 'participant'
  | 'doctor'
  | 'nurse'
  | 'pt'
  | 'ot'
  | 'aide'
  | 'driver'
  | 'reception'
  | 'coordinator'
  | 'social-worker'
  | 'activities'
  | 'nutrition';
export type Action =
  | 'idle'
  | 'walk'
  | 'escort'
  | 'consult'
  | 'treat'
  | 'exercise'
  | 'seated'
  | 'tabletop'
  | 'document'
  | 'serve'
  | 'greet'
  | 'roll'
  | 'ride'
  | 'perform'
  | 'clap'
  | 'present'
  | 'conversation'
  | 'device'
  | 'dance'
  | 'tai-chi'
  | 'write'
  | 'craft'
  | 'music'
  | 'listen';
export type CharacterSpec = {
  id: string;
  role: CharacterRole;
  variant: number;
  profileId?: string;
  mobility?: 'cane' | 'walker' | 'wheelchair';
  seated?: boolean;
  assisted?: boolean;
};
export const roleNames: Record<CharacterRole, string> = {
  participant: 'Participant',
  doctor: 'Doctor',
  nurse: 'Nurse',
  pt: 'Physical therapist',
  ot: 'Occupational therapist',
  aide: 'CNA / care aide',
  driver: 'Driver',
  reception: 'Front desk',
  coordinator: 'Care coordinator',
  'social-worker': 'Social worker',
  activities: 'Activities team',
  nutrition: 'Food service',
};
export const roleColors: Record<CharacterRole, string> = {
  participant: '#c26743',
  doctor: '#f5f2e7',
  nurse: '#238e94',
  pt: '#357f8b',
  ot: '#51a3a0',
  aide: '#2a8e84',
  driver: '#1d6671',
  reception: '#32868b',
  coordinator: '#468e91',
  'social-worker': '#377c84',
  activities: '#2e9290',
  nutrition: '#559599',
};
export const characterLibrary = templates;
const roles = templates.roles as Record<
  string,
  { wardrobe: string; color: string }
>;
export function characterProfile(spec: CharacterSpec) {
  const found = templates.people.find(
    (p) => p.id === (spec.profileId || spec.id),
  );
  return (
    found || {
      id: spec.id,
      role: spec.role,
      appearance: spec.variant % 8,
      skin: ['#e6a575', '#d49366', '#f1bd8f', '#9b694b'][spec.variant % 4],
      hair: spec.role === 'participant' ? '#d4d5c9' : '#213c40',
      hairStyle: spec.variant % 3,
      glasses: spec.variant % 3 === 0,
      accent: roleColors[spec.role],
      height: spec.role === 'participant' ? 0.96 : 1,
    }
  );
}
/** Reference-inspired, rounded editorial characters. A stable profile uses the same rig in every scene. */
export function createCharacter(spec: CharacterSpec) {
  const profile = characterProfile(spec),
    senior = spec.role === 'participant',
    wardrobe = roles[spec.role].wardrobe;
  const shirt = senior
      ? profile.accent
      : profile.accent || roles[spec.role].color,
    skin = profile.skin,
    hair = profile.hair;
  const trouser = wardrobe === 'scrubs' ? shirt : '#264e59',
    cream = '#f8f3e4',
    ink = '#17343e';
  const root = new T.Group();
  root.name = spec.id;
  root.userData = {
    role: spec.role,
    profileId: profile.id,
    template: wardrobe,
    style: 'rounded isometric illustration',
    clothing:
      'White coats / V-neck scrubs / solid Seen uniforms; no ginkgo print',
  };
  const bones: T.Bone[] = [],
    joints: Record<string, T.Bone> = {};
  const bone = (
    name: string,
    parent: string | null,
    x: number,
    y: number,
    z = 0,
  ) => {
    const b = new T.Bone();
    b.name = `${spec.id}_${name}`;
    b.position.set(x, y, z);
    if (parent) joints[parent].add(b);
    joints[name] = b;
    bones.push(b);
    return b;
  };
  bone('hip', null, 0, 0.76);
  bone('torso', 'hip', 0, 0.1);
  bone('neck', 'torso', 0, 0.36);
  bone('head', 'neck', 0, 0.235);
  for (const [side, s] of [
    ['L', -1],
    ['R', 1],
  ] as const) {
    bone(`arm${side}`, 'torso', s * 0.255, 0.255);
    bone(`elbow${side}`, `arm${side}`, s * 0.01, -0.23);
    bone(`hand${side}`, `elbow${side}`, 0, -0.205);
    bone(`leg${side}`, 'hip', s * 0.125, -0.025);
    bone(`knee${side}`, `leg${side}`, 0, -0.32);
    bone(`foot${side}`, `knee${side}`, 0, -0.315);
  }
  joints.hip.updateMatrixWorld(true);
  const parts: T.BufferGeometry[] = [];
  function add(
    geometry: T.BufferGeometry,
    color: string,
    joint: string,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const g = geometry;
    if (!g.index)
      g.setIndex(
        Array.from({ length: g.attributes.position.count }, (_, i) => i),
      );
    g.rotateX(rx);
    g.rotateY(ry);
    g.rotateZ(rz);
    g.translate(x, y, z);
    g.applyMatrix4(joints[joint].matrixWorld);
    const n = g.attributes.position.count,
      c = new T.Color(color),
      colors = new Float32Array(n * 3),
      indices = new Uint16Array(n * 4),
      weights = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colors.set([c.r, c.g, c.b], i * 3);
      indices[i * 4] = bones.indexOf(joints[joint]);
      weights[i * 4] = 1;
    }
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new T.BufferAttribute(indices, 4));
    g.setAttribute('skinWeight', new T.BufferAttribute(weights, 4));
    parts.push(g);
  }
  const oval = (
    color: string,
    joint: string,
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
  ) =>
    add(new T.SphereGeometry(1, 20, 14).scale(a, b, c), color, joint, x, y, z);
  const soft = (
    color: string,
    joint: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    r = 0.035,
    rz = 0,
  ) =>
    add(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)),
      color,
      joint,
      x,
      y,
      z,
      0,
      0,
      rz,
    );
  const line = (color: string, joint: string, points: number[][], r: number) =>
    add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(
          points.map((p) => new T.Vector3(p[0], p[1], p[2])),
        ),
        20,
        r,
        6,
        false,
      ),
      color,
      joint,
    );
  const surface = (color: string, joint: string, points: number[][]) => {
    const shape = new T.Shape(points.map((p) => new T.Vector2(p[0], p[1]))),
      g = new T.ExtrudeGeometry(shape, {
        depth: 0.013,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.005,
        bevelThickness: 0.005,
      });
    add(g, color, joint, 0, 0, points[0][2] || 0.185);
  };
  // Broad, softly shaped torso, short limbs and a larger expressive head match the illustrations.
  oval(trouser, 'hip', 0, -0.04, 0, 0.215, 0.145, 0.157);
  const torso = new T.LatheGeometry(
    [
      new T.Vector2(0.2, -0.08),
      new T.Vector2(0.225, -0.035),
      new T.Vector2(0.218, 0.11),
      new T.Vector2(0.244, 0.245),
      new T.Vector2(0.214, 0.315),
      new T.Vector2(0.115, 0.355),
    ],
    28,
  ).scale(1, 1, 0.72);
  add(torso, wardrobe === 'coat' ? cream : shirt, 'torso');
  oval(skin, 'neck', 0, 0.025, 0, 0.08, 0.105, 0.075);
  if (wardrobe === 'scrubs') {
    surface(skin, 'torso', [
      [-0.092, 0.35, 0.174],
      [0.092, 0.35, 0.174],
      [0, 0.18, 0.174],
    ]);
    line(
      new T.Color(shirt).multiplyScalar(0.8).getStyle(),
      'torso',
      [
        [-0.106, 0.355, 0.18],
        [0, 0.165, 0.181],
        [0.106, 0.355, 0.18],
      ],
      0.012,
    );
    soft(
      new T.Color(shirt).multiplyScalar(0.88).getStyle(),
      'torso',
      -0.135,
      0.095,
      0.166,
      0.09,
      0.07,
      0.016,
      0.01,
    );
  } else if (wardrobe === 'coat') {
    soft('#86bbc3', 'torso', 0, 0.22, 0.172, 0.17, 0.27, 0.025, 0.018);
    surface('#2e6174', 'torso', [
      [-0.034, 0.295, 0.193],
      [0.033, 0.295, 0.193],
      [0.045, 0.11, 0.193],
      [0, 0.06, 0.193],
      [-0.045, 0.11, 0.193],
    ]);
    for (const s of [-1, 1]) {
      soft(cream, 'hip', s * 0.119, -0.095, 0.01, 0.22, 0.35, 0.34, 0.045);
      surface('#fffbed', 'torso', [
        [s * 0.065, 0.35, 0.193],
        [s * 0.18, 0.25, 0.193],
        [s * 0.09, 0.08, 0.193],
        [s * 0.02, 0.18, 0.193],
      ]);
      soft(
        '#e4e3d7',
        'hip',
        s * 0.132,
        -0.1,
        0.186,
        0.105,
        0.095,
        0.016,
        0.012,
      );
    }
    for (let i = 0; i < 3; i++)
      oval(
        '#5e777d',
        'torso',
        0.015,
        0.03 - i * 0.07,
        0.183,
        0.011,
        0.011,
        0.006,
      );
  } else if (wardrobe === 'uniform') {
    add(
      new T.CylinderGeometry(0.092, 0.105, 0.055, 24).scale(1, 1, 0.82),
      shirt,
      'neck',
      0,
      -0.007,
    );
    const seam = new T.Color(shirt).multiplyScalar(0.78).getStyle();
    line(
      seam,
      'torso',
      [
        [0.092, 0.33, 0.18],
        [0.065, 0.19, 0.178],
        [-0.12, -0.045, 0.157],
      ],
      0.006,
    );
    for (let i = 0; i < 3; i++)
      soft(
        seam,
        'torso',
        0.072 - i * 0.06,
        0.26 - i * 0.115,
        0.179,
        0.038,
        0.011,
        0.011,
        0.004,
        -0.12,
      );
  } else {
    soft(shirt, 'torso', 0, -0.065, 0, 0.42, 0.06, 0.31, 0.025);
    line(
      new T.Color(shirt).multiplyScalar(0.82).getStyle(),
      'torso',
      [
        [0, 0.32, 0.178],
        [0.016, 0.19, 0.174],
        [0.015, -0.075, 0.16],
      ],
      0.006,
    );
  }
  if (!senior) {
    soft('#f6f4e7', 'torso', -0.15, 0.18, 0.177, 0.066, 0.09, 0.016, 0.009);
    soft('#236976', 'torso', -0.15, 0.19, 0.189, 0.045, 0.021, 0.008, 0.003);
  }
  if (spec.role === 'doctor' || spec.role === 'nurse') {
    line(
      ink,
      'torso',
      [
        [-0.07, 0.38, 0.075],
        [-0.155, 0.29, 0.176],
        [-0.125, 0.04, 0.181],
        [0.045, 0.02, 0.185],
        [0.134, 0.19, 0.18],
        [0.071, 0.38, 0.075],
      ],
      0.012,
    );
    oval('#bac9c8', 'torso', 0.045, 0.015, 0.2, 0.036, 0.036, 0.012);
    oval('#446d75', 'torso', 0.045, 0.015, 0.214, 0.023, 0.023, 0.006);
  }
  // Rounded cheeks, a shaped jaw and asymmetric swept hair replace capsule-like heads.
  const head = new T.SphereGeometry(1, 28, 20);
  const pos = head.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i),
      jaw = y < -0.22 ? 1 - (Math.abs(y) - 0.22) * 0.19 : 1;
    pos.setXYZ(
      i,
      pos.getX(i) * 0.203 * jaw,
      y * 0.243,
      pos.getZ(i) * 0.178 + 0.014,
    );
  }
  head.computeVertexNormals();
  add(head, skin, 'head');
  for (const s of [-1, 1]) {
    oval(skin, 'head', s * 0.197, -0.014, 0.002, 0.037, 0.056, 0.03);
    oval(
      new T.Color(skin).multiplyScalar(0.91).getStyle(),
      'head',
      s * 0.207,
      -0.014,
      0.021,
      0.012,
      0.027,
      0.008,
    );
    oval(ink, 'head', s * 0.073, 0.028, 0.177, 0.014, 0.023, 0.011);
    line(
      hair,
      'head',
      [
        [s * 0.041, 0.096, 0.177],
        [s * 0.073, 0.105, 0.174],
        [s * 0.098, 0.094, 0.166],
      ],
      0.009,
    );
  }
  oval(skin, 'head', 0, -0.026, 0.191, 0.032, 0.041, 0.03);
  line(
    '#9c6041',
    'head',
    [
      [-0.054, -0.097, 0.169],
      [-0.025, -0.111, 0.181],
      [0.022, -0.108, 0.182],
      [0.052, -0.091, 0.17],
    ],
    0.0065,
  );
  if (senior) {
    for (const s of [-1, 1])
      line(
        '#af7955',
        'head',
        [
          [s * 0.103, -0.05, 0.161],
          [s * 0.115, -0.079, 0.153],
          [s * 0.108, -0.103, 0.147],
        ],
        0.004,
      );
    line(
      '#bd906e',
      'head',
      [
        [-0.065, 0.138, 0.15],
        [0, 0.145, 0.167],
        [0.061, 0.138, 0.15],
      ],
      0.004,
    );
  }
  const hairCap = new T.SphereGeometry(
    1,
    28,
    16,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.55,
  ).scale(0.209, 0.244, 0.181);
  add(hairCap, hair, 'head', 0, 0.016, -0.013);
  if (profile.hairStyle === 1) {
    oval(hair, 'head', 0.045, 0.165, 0.074, 0.172, 0.068, 0.112);
    oval(hair, 'head', 0, -0.035, -0.167, 0.175, 0.19, 0.07);
    oval(hair, 'head', 0.105, -0.132, -0.188, 0.083, 0.093, 0.075);
  } else {
    oval(hair, 'head', -0.025, 0.187, 0.053, 0.185, 0.07, 0.139);
    oval(hair, 'head', 0.146, 0.093, 0.05, 0.055, 0.075, 0.103);
  }
  if (profile.glasses) {
    for (const s of [-1, 1]) {
      const x = s * 0.076;
      line(
        ink,
        'head',
        [
          [x - 0.052, 0.064, 0.184],
          [x + 0.05, 0.062, 0.184],
          [x + 0.046, -0.013, 0.195],
          [x - 0.043, -0.019, 0.196],
          [x - 0.052, 0.064, 0.184],
        ],
        0.007,
      );
    }
    line(
      ink,
      'head',
      [
        [-0.024, 0.04, 0.194],
        [0, 0.048, 0.203],
        [0.025, 0.04, 0.194],
      ],
      0.006,
    );
  }
  for (const side of ['L', 'R']) {
    const sleeve = wardrobe === 'coat' ? cream : shirt;
    oval(sleeve, `arm${side}`, 0, -0.09, 0, 0.102, 0.153, 0.099);
    if (wardrobe === 'scrubs') {
      soft(
        new T.Color(shirt).multiplyScalar(0.92).getStyle(),
        `arm${side}`,
        0,
        -0.18,
        0,
        0.175,
        0.034,
        0.167,
        0.014,
      );
      oval(skin, `elbow${side}`, 0, -0.088, 0, 0.074, 0.126, 0.069);
    } else oval(sleeve, `elbow${side}`, 0, -0.075, 0, 0.079, 0.131, 0.077);
    oval(skin, `hand${side}`, 0, -0.046, 0.015, 0.06, 0.081, 0.044);
    oval(
      skin,
      `hand${side}`,
      side === 'L' ? 0.048 : -0.048,
      -0.026,
      0.035,
      0.023,
      0.04,
      0.025,
    );
    oval(trouser, `leg${side}`, 0, -0.145, 0, 0.108, 0.2, 0.109);
    oval(trouser, `knee${side}`, 0, -0.123, 0.002, 0.092, 0.186, 0.095);
    soft('#213e46', `foot${side}`, 0, -0.044, 0.057, 0.18, 0.1, 0.31, 0.045);
    soft('#17313b', `foot${side}`, 0, -0.083, 0.059, 0.182, 0.025, 0.315, 0.01);
  }
  if (spec.role === 'driver') {
    add(
      new T.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(
        0.215,
        0.1,
        0.19,
      ),
      shirt,
      'head',
      0,
      0.21,
      -0.008,
    );
    soft(shirt, 'head', 0, 0.215, 0.15, 0.28, 0.022, 0.18, 0.009);
  }
  if (spec.mobility === 'cane')
    line(
      '#936540',
      'handR',
      [
        [0, -0.04, 0.03],
        [0.11, -0.04, 0.02],
        [0.12, -0.69, 0.02],
      ],
      0.017,
    );
  const geometry = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  geometry.normalizeNormals();
  geometry.computeBoundingSphere();
  const material = new T.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
  });
  const mesh = new T.SkinnedMesh(geometry, material);
  mesh.name = `${spec.id}_body`;
  mesh.add(joints.hip);
  mesh.bind(new T.Skeleton(bones));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  root.scale.setScalar(profile.height);
  const accessory = new T.Group();
  root.add(accessory);
  const metal = new T.MeshStandardMaterial({
      color: '#a8b9b5',
      roughness: 0.48,
      metalness: 0.42,
    }),
    teal = new T.MeshStandardMaterial({ color: '#3b8b8d', roughness: 0.85 }),
    rubber = new T.MeshStandardMaterial({ color: ink, roughness: 0.85 });
  const prop = (
    geo: T.BufferGeometry,
    x: number,
    y: number,
    z: number,
    mat = metal,
  ) => {
    const o = new T.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    accessory.add(o);
    return o;
  };
  const rod = (a: number[], b: number[], r = 0.016) => {
    const v = new T.Vector3(...(b as [number, number, number])).sub(
        new T.Vector3(...(a as [number, number, number])),
      ),
      o = prop(
        new T.CylinderGeometry(r, r, v.length(), 12),
        (a[0] + b[0]) / 2,
        (a[1] + b[1]) / 2,
        (a[2] + b[2]) / 2,
      );
    o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
  };
  const wheels: T.Object3D[] = [];
  const wheel = (x: number, y: number, z: number, r: number) => {
    const g = new T.Group();
    g.position.set(x, y, z);
    accessory.add(g);
    const tire = new T.Mesh(new T.TorusGeometry(r, 0.027, 8, 24), rubber);
    tire.rotation.y = Math.PI / 2;
    g.add(tire);
    if (r > 0.15) {
      for (let i = 0; i < 10; i++) {
        const spoke = new T.Mesh(
          new T.CylinderGeometry(0.006, 0.006, r * 1.82, 6),
          metal,
        );
        spoke.rotation.x = (i * Math.PI) / 10;
        g.add(spoke);
      }
      const hub = new T.Mesh(new T.SphereGeometry(0.046, 12, 8), teal);
      g.add(hub);
    }
    wheels.push(g);
  };
  if (spec.mobility === 'walker') {
    for (const x of [-0.29, 0.29]) {
      rod([x, 0.06, 0.18], [x, 0.78, 0.23]);
      rod([x, 0.08, 0.61], [x, 0.78, 0.52]);
      rod([x, 0.78, 0.23], [x, 0.78, 0.52], 0.022);
      prop(
        new RoundedBoxGeometry(0.055, 0.05, 0.2, 2, 0.018),
        x,
        0.79,
        0.3,
        rubber,
      );
    }
    rod([-0.29, 0.56, 0.56], [0.29, 0.56, 0.56]);
    for (const x of [-0.29, 0.29]) wheel(x, 0.085, 0.6, 0.062);
  }
  if (spec.mobility === 'wheelchair') {
    prop(new RoundedBoxGeometry(0.49, 0.075, 0.47, 2, 0.022), 0, 0.43, 0, teal);
    prop(
      new RoundedBoxGeometry(0.49, 0.42, 0.065, 2, 0.025),
      0,
      0.66,
      -0.22,
      teal,
    );
    for (const x of [-0.32, 0.32]) {
      wheel(x, 0.3, -0.06, 0.275);
      wheel(x, 0.09, 0.39, 0.065);
      rod([x, 0.15, -0.22], [x, 0.79, -0.22], 0.019);
      rod([x, 0.15, -0.22], [x, 0.12, 0.45]);
      prop(
        new RoundedBoxGeometry(0.07, 0.045, 0.53, 2, 0.015),
        x,
        0.66,
        0.045,
        rubber,
      );
      prop(
        new RoundedBoxGeometry(0.06, 0.035, 0.15, 2, 0.01),
        x,
        0.8,
        -0.28,
        rubber,
      );
      prop(
        new RoundedBoxGeometry(0.2, 0.035, 0.18, 2, 0.01),
        x * 0.5,
        0.1,
        0.5,
        rubber,
      );
    }
  }
  const baseY = joints.hip.position.y;
  function pose(
    action: Action,
    time: number,
    motion = 1,
    seatedOverride = false,
  ) {
    for (const b of bones) b.rotation.set(0, 0, 0);
    joints.hip.position.y = baseY;
    wheels.forEach((w) => (w.rotation.x = 0));
    const stride = Math.sin(time * Math.PI * 2 * 0.9) * motion,
      breath = Math.sin(time * Math.PI * 2 * 0.25) * motion,
      walking =
        ['walk', 'escort'].includes(action) && spec.mobility !== 'wheelchair';
    if (walking) {
      joints.legL.rotation.x = 0.32 * stride;
      joints.legR.rotation.x = -0.32 * stride;
      joints.kneeL.rotation.x = Math.max(0, -stride) * 0.44;
      joints.kneeR.rotation.x = Math.max(0, stride) * 0.44;
      joints.armL.rotation.x = -0.21 * stride;
      joints.armR.rotation.x = 0.21 * stride;
      joints.hip.position.y += Math.abs(stride) * 0.016;
    }
    if (
      action === 'seated' ||
      action === 'ride' ||
      spec.seated ||
      seatedOverride ||
      spec.mobility === 'wheelchair'
    ) {
      joints.hip.position.y = 0.575;
      for (const s of ['L', 'R']) {
        joints[`leg${s}`].rotation.x = -1.48;
        joints[`knee${s}`].rotation.x = 1.48;
      }
    }
    if (
      ['consult', 'treat', 'tabletop', 'document', 'serve'].includes(action)
    ) {
      joints.armL.rotation.x = -0.3;
      joints.armR.rotation.x = -0.4 - 0.06 * breath;
      joints.elbowL.rotation.x = -0.72;
      joints.elbowR.rotation.x = -0.78 - 0.1 * stride;
      joints.head.rotation.x = 0.07;
      joints.head.rotation.y = 0.06 * breath;
    }
    if (action === 'exercise') {
      joints.armL.rotation.z = -0.65 - 0.28 * breath;
      joints.armR.rotation.z = 0.65 + 0.28 * breath;
    }
    if (action === 'escort') {
      for (const side of ['L', 'R']) {
        joints[`arm${side}`].rotation.x = -0.8;
        joints[`elbow${side}`].rotation.x = -0.62;
      }
    }
    if (action === 'greet') {
      joints.armR.rotation.z = 0.55;
      joints.elbowR.rotation.z = 0.85 + 0.14 * stride;
    }
    const sitting =
      seatedOverride || spec.seated || spec.mobility === 'wheelchair';
    const slow = Math.sin((time * Math.PI) / 4) * motion;
    if (['present', 'conversation', 'perform'].includes(action)) {
      joints.armL.rotation.x = -0.4;
      joints.elbowL.rotation.x = -0.9;
      joints.armR.rotation.set(-0.45, 0, 0.3 + 0.12 * breath);
      joints.elbowR.rotation.x = action === 'perform' ? -1.55 : -0.8;
      joints.head.rotation.y = 0.12 * slow;
    }
    if (action === 'clap') {
      for (const side of ['L', 'R']) {
        joints[`arm${side}`].rotation.x = -0.72;
        joints[`elbow${side}`].rotation.x = -1.1;
        joints[`arm${side}`].rotation.z =
          (side === 'L' ? 1 : -1) * (0.22 + 0.14 * (stride + 1));
      }
    }
    if (action === 'dance') {
      joints.torso.rotation.y = 0.12 * breath;
      joints.armL.rotation.set(-0.25, 0, -0.55 - 0.16 * stride);
      joints.armR.rotation.set(-0.25, 0, 0.55 + 0.16 * stride);
      joints.elbowL.rotation.x = joints.elbowR.rotation.x = -0.65;
      if (!sitting) {
        joints.hip.rotation.y = 0.07 * breath;
        joints.legL.rotation.x = joints.legR.rotation.x = -0.025 * (1 + stride);
        joints.kneeL.rotation.x = joints.kneeR.rotation.x = 0.05 * (1 + stride);
      }
    }
    if (action === 'tai-chi') {
      joints.armL.rotation.set(-0.65 - 0.2 * slow, 0, -0.38);
      joints.armR.rotation.set(-0.65 + 0.2 * slow, 0, 0.38);
      joints.elbowL.rotation.x = -0.7 + 0.18 * slow;
      joints.elbowR.rotation.x = -0.7 - 0.18 * slow;
      joints.torso.rotation.y = 0.1 * slow;
    }
    if (['device', 'write', 'craft', 'music'].includes(action)) {
      joints.armL.rotation.x = -0.7;
      joints.armR.rotation.x = -0.7;
      joints.elbowL.rotation.x = -0.85;
      joints.elbowR.rotation.x =
        -0.85 + (action === 'music' ? 0.22 : 0.07) * stride;
      joints.head.rotation.x = action === 'music' ? 0 : 0.18;
      if (['write', 'craft', 'music'].includes(action)) {
        joints.armR.rotation.x = -0.8;
        joints.elbowR.rotation.x =
          -1.25 + (action === 'music' ? 0.16 : 0.045) * stride;
      }
      if (action === 'write') {
        joints.handR.rotation.y = 0.17 * slow;
        joints.armR.rotation.y = 0.06 * breath;
      }
      if (action === 'craft') joints.handL.rotation.y = -0.12 * breath;
      if (action === 'device') {
        joints.armR.rotation.y = -0.45;
        joints.elbowR.rotation.x = -1.05;
        joints.handR.rotation.x = 0.13 * stride;
      }
    }
    if (action === 'listen') {
      joints.armL.rotation.x = joints.armR.rotation.x = -0.28;
      joints.elbowL.rotation.x = joints.elbowR.rotation.x = -0.75;
      joints.head.rotation.y = 0.06 * slow;
    }
    if (spec.mobility === 'cane') {
      joints.armR.rotation.set(-0.02, 0, 0);
      joints.elbowR.rotation.set(0, 0, 0);
      if (action === 'greet') {
        joints.armL.rotation.z = -0.55;
        joints.elbowL.rotation.z = -0.85 - 0.14 * stride;
      }
    }
    if (spec.mobility === 'walker') {
      for (const s of ['L', 'R']) {
        joints[`arm${s}`].rotation.z = 0;
        joints[`arm${s}`].rotation.x = -0.48;
        joints[`elbow${s}`].rotation.x = -0.58;
      }
    }
    if (spec.mobility === 'wheelchair' && ['walk', 'roll'].includes(action)) {
      for (const s of ['L', 'R']) {
        joints[`arm${s}`].rotation.x = spec.assisted
          ? -0.25
          : -0.13 - 0.3 * stride;
        joints[`elbow${s}`].rotation.x = -0.5;
      }
      wheels.forEach((w) => (w.rotation.x = -time * 1.7));
    }
    if (action === 'idle') joints.head.rotation.y = 0.05 * breath;
    joints.torso.rotation.x = senior ? 0.025 : 0;
    mesh.updateMatrixWorld(true);
    mesh.skeleton.update();
  }
  pose('idle', 0, 0);
  function clips() {
    const list: T.AnimationClip[] = [];
    for (const action of [
      'idle',
      'walk',
      'consult',
      'exercise',
      'seated',
      'tabletop',
      'greet',
      'perform',
      'clap',
      'present',
      'conversation',
      'device',
      'dance',
      'tai-chi',
      'write',
      'craft',
      'music',
      'listen',
    ] as Action[]) {
      const times: number[] = [],
        positions: number[] = [],
        tracks = new Map<T.Bone, number[]>();
      bones.forEach((b) => tracks.set(b, []));
      for (let i = 0; i <= 40; i++) {
        const t = i / 20;
        times.push(t);
        pose(action, t);
        positions.push(...joints.hip.position.toArray());
        bones.forEach((b) => tracks.get(b)!.push(...b.quaternion.toArray()));
      }
      tracks.forEach((v) => v.splice(v.length - 4, 4, ...v.slice(0, 4)));
      positions.splice(positions.length - 3, 3, ...positions.slice(0, 3));
      list.push(
        new T.AnimationClip(`${spec.id}:${action}`, 2, [
          new T.VectorKeyframeTrack(
            `${joints.hip.name}.position`,
            times,
            positions,
          ),
          ...bones.map(
            (b) =>
              new T.QuaternionKeyframeTrack(
                `${b.name}.quaternion`,
                times,
                tracks.get(b)!,
              ),
          ),
        ]),
      );
    }
    pose('idle', 0, 0);
    return list;
  }
  return { root, mesh, bones, joints, pose, clips, profile };
}
