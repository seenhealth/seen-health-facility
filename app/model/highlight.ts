import * as T from 'three';
import type { Pickable } from './pick';

/**
 * Hover and selection highlights for the 3D viewer, in the presentation's
 * warm palette: a soft ground halo (a ring under a person, a rounded footprint
 * under furniture) with a crisp outline and glow, a warm tint on the real
 * meshes where they are separate (people, the center's furniture), a
 * silhouette outline around a person, and corner brackets where the meshes
 * are merged (furniture of stamped facilities) or are moving bodies
 * (vehicles). Every change eases: hover fades in over 160 ms with a slight
 * grow and the brackets closing in, fades out over 130 ms, a hover moving
 * from one item to the next cross-fades through a small pool of slots, and a
 * click sends a ripple out from the halo. With reduced motion the states are
 * instant. Idle (nothing shown) costs one check per frame.
 */
const COLORS = { hover: '#d99a2b', selected: '#c97d12', tint: '#ffb24d' };
const FADE_IN = 0.16,
  FADE_OUT = 0.13,
  RIPPLE = 0.7;
/** Gap between an object (a person: wider) and its halo outline, and room left for glow and ripple. */
const GAP = 0.08,
  RING_GAP = 0.15,
  MARGIN = 0.85;
/** Emissive tint; people, small on screen, glow more than furniture. */
const TINT = { hover: 0.28, selected: 0.36, person: 2.1 };
/** Half the outline width in pixels (a person's ring a little heavier). */
const LINE = { hover: 1, selected: 1.5, person: 0.35 };

const HALO_VERTEX = /* glsl */ `
  uniform vec2 uSize;
  varying vec2 vPos;
  void main() {
    vPos = (uv - 0.5) * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
// Rounded-rectangle distance field: a 2–3 px outline and a few pixels of
// outer glow (fwidth keeps both the same weight at any zoom), a light fill and
// an optional ripple expanding from the outline.
const HALO_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec2 uHalf;
  uniform float uRadius;
  uniform float uFill;
  uniform float uLine;
  uniform float uRipple;
  varying vec2 vPos;
  float roundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float d = roundRect(vPos, uHalf, uRadius);
    float aa = max(fwidth(d), 1e-4);
    float line = 1.0 - smoothstep((uLine - 0.5) * aa, (uLine + 0.5) * aa, abs(d));
    float fill = uFill * (1.0 - smoothstep(-aa, aa, d));
    float glow = d > 0.0 ? 0.3 * exp(-d / (4.0 * aa)) : 0.0;
    float ripple = 0.0;
    if (uRipple >= 0.0) {
      float r = abs(d - uRipple * 0.65);
      ripple = (1.0 - smoothstep(aa, 2.5 * aa + 0.015, r)) * (1.0 - uRipple) * 0.85;
    }
    float a = max(max(line, fill), max(glow, ripple)) * uOpacity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// A person's silhouette: their own skinned mesh again (same geometry and
// skeleton, so it follows every pose), back faces pushed out a constant
// number of pixels in screen space so it reads at any zoom.
const OUTLINE_VERTEX = /* glsl */ `
  #include <common>
  #include <skinning_pars_vertex>
  #include <clipping_planes_pars_vertex>
  uniform float uWidth;
  uniform vec2 uViewport;
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    #include <clipping_planes_vertex>
    gl_Position = projectionMatrix * mvPosition;
    vec2 n = (normalMatrix * objectNormal).xy;
    float l = length(n);
    if (l > 1e-4)
      gl_Position.xy += n / l * uWidth * 2.0 / uViewport * gl_Position.w;
  }`;
const OUTLINE_FRAGMENT = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    #include <clipping_planes_fragment>
    if (uOpacity < 0.004) discard;
    gl_FragColor = vec4(uColor, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
/** Outline width around a person, in CSS pixels. */
const OUTLINE = { hover: 1.6, selected: 2.2 };

/** Corner brackets of a unit box centred on the origin. */
function bracketGeometry() {
  const p: number[] = [],
    l = 0.24;
  // Three strokes from each corner along its edges, a quarter of the way in.
  for (const x of [-0.5, 0.5])
    for (const y of [-0.5, 0.5])
      for (const z of [-0.5, 0.5]) {
        p.push(x, y, z, x - Math.sign(x) * l, y, z);
        p.push(x, y, z, x, y - Math.sign(y) * l, z);
        p.push(x, y, z, x, y, z - Math.sign(z) * l);
      }
  return new T.BufferGeometry().setAttribute(
    'position',
    new T.Float32BufferAttribute(p, 3),
  );
}
const smooth = (x: number) => x * x * (3 - 2 * x);

type Role = 'hover' | 'selected' | 'fading';
type Slot = {
  item: Pickable | null;
  role: Role;
  level: number;
  goal: 0 | 1;
  ripple: number;
  halo: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
  brackets: T.LineSegments<T.BufferGeometry, T.LineBasicMaterial>;
  /** Tinted copies of the meshes' own materials, kept for reuse. */
  tints: Map<T.Material, T.MeshStandardMaterial>;
  /** The tinted copies on the current item, and the meshes' own materials. */
  applied: T.MeshStandardMaterial[];
  swapped: { mesh: T.Mesh; material: T.Material | T.Material[] }[];
  /** A person's silhouette, attached beside their body mesh while shown. */
  outline: T.SkinnedMesh<T.BufferGeometry, T.ShaderMaterial>;
};

export function createHighlights(
  scene: T.Scene,
  options: {
    /** Section clipping for a tinted material (the renderer's clip list). */
    clip(material: T.Material): void;
    reducedMotion(): boolean;
  },
) {
  const root = new T.Group();
  root.name = 'inspect-highlights';
  scene.add(root);
  const plane = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    corners = bracketGeometry(),
    // Outlines borrow their person's geometry; this stands in until then.
    empty = new T.BufferGeometry(),
    viewport = new T.Vector2(1, 1);
  const slots: Slot[] = [0, 1, 2].map(() => {
    const halo = new T.Mesh(
      plane,
      new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color(COLORS.hover) },
          uOpacity: { value: 0 },
          uSize: { value: new T.Vector2(1, 1) },
          uHalf: { value: new T.Vector2(0.5, 0.5) },
          uRadius: { value: 0.06 },
          uFill: { value: 0.16 },
          uLine: { value: LINE.hover },
          uRipple: { value: -1 },
        },
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    );
    halo.renderOrder = 2;
    halo.visible = false;
    const brackets = new T.LineSegments(
      corners,
      new T.LineBasicMaterial({
        color: COLORS.hover,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    brackets.matrixAutoUpdate = false;
    brackets.renderOrder = 2;
    brackets.visible = false;
    root.add(halo, brackets);
    const outline = new T.SkinnedMesh(
      empty,
      new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color(COLORS.hover) },
          uOpacity: { value: 0 },
          uWidth: { value: OUTLINE.hover },
          uViewport: { value: viewport },
        },
        vertexShader: OUTLINE_VERTEX,
        fragmentShader: OUTLINE_FRAGMENT,
        side: T.BackSide,
        transparent: true,
        depthWrite: false,
        clipping: true,
      }),
    );
    outline.name = 'inspect-outline';
    outline.frustumCulled = false;
    options.clip(outline.material);
    return {
      item: null,
      role: 'fading' as Role,
      level: 0,
      goal: 0 as const,
      ripple: -1,
      halo,
      brackets,
      tints: new Map(),
      applied: [],
      swapped: [],
      outline,
    };
  });
  // Drawn fully transparent for the first frames, so their shaders compile
  // with the scene rather than on the first hover.
  let warm = 2;
  slots[0].halo.visible = slots[0].brackets.visible = true;
  const tintColor = new T.Color(COLORS.tint),
    box = new T.Box3(),
    frame = new T.Matrix4(),
    local = new T.Matrix4(),
    centre = new T.Vector3(),
    axisX = new T.Vector3(),
    axisZ = new T.Vector3();

  function applyTint(slot: Slot) {
    const target = slot.item?.tint;
    if (!target) return;
    target.traverse((o) => {
      if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return;
      const original = o.material as T.Material;
      if (!(original instanceof T.MeshStandardMaterial)) return;
      let tinted = slot.tints.get(original);
      if (!tinted) {
        tinted = original.clone();
        tinted.emissive.copy(tintColor);
        tinted.emissiveIntensity = 0;
        options.clip(tinted);
        slot.tints.set(original, tinted);
      }
      slot.swapped.push({ mesh: o, material: original });
      if (!slot.applied.includes(tinted)) slot.applied.push(tinted);
      o.material = tinted;
    });
  }
  /** Put a slot's outline beside a person's body mesh, on its skeleton. */
  function attachOutline(slot: Slot, mesh: T.Object3D | null | undefined) {
    // Off whoever it was on (the warm-up's person, for one).
    detachOutline(slot);
    if (!(mesh instanceof T.SkinnedMesh) || !mesh.parent) return;
    const o = slot.outline;
    o.geometry = mesh.geometry;
    o.bind(mesh.skeleton, mesh.bindMatrix);
    o.position.copy(mesh.position);
    o.quaternion.copy(mesh.quaternion);
    o.scale.copy(mesh.scale);
    mesh.parent.add(o);
  }
  function detachOutline(slot: Slot) {
    slot.outline.removeFromParent();
    slot.outline.geometry = empty;
  }
  function restoreTint(slot: Slot) {
    for (const { mesh, material } of slot.swapped) mesh.material = material;
    slot.swapped.length = slot.applied.length = 0;
  }
  function release(slot: Slot) {
    restoreTint(slot);
    detachOutline(slot);
    slot.item = null;
    slot.role = 'fading';
    slot.level = 0;
    slot.goal = 0;
    slot.ripple = -1;
    slot.halo.visible = slot.brackets.visible = false;
  }
  const holding = (item: Pickable) =>
    slots.find((s) => s.item === item) ?? null;
  /** A free slot, else the faintest fading one (released first). */
  function freeSlot() {
    const free = slots.find((s) => !s.item);
    if (free) return free;
    const fading = slots
      .filter((s) => s.role === 'fading')
      .sort((a, b) => a.level - b.level)[0];
    if (fading) release(fading);
    return fading ?? null;
  }
  function show(item: Pickable, role: Role, ripple: boolean) {
    let slot = holding(item);
    if (!slot) {
      slot = freeSlot();
      if (!slot) return;
      slot.item = item;
      applyTint(slot);
      attachOutline(slot, item.tint);
    }
    slot.role = role;
    slot.goal = 1;
    if (ripple && !options.reducedMotion()) slot.ripple = 0;
    const color = role === 'selected' ? COLORS.selected : COLORS.hover;
    slot.halo.material.uniforms.uColor.value.set(color);
    slot.brackets.material.color.set(color);
    slot.outline.material.uniforms.uColor.value.set(color);
    if (options.reducedMotion()) slot.level = 1;
  }
  function fade(role: Role) {
    for (const s of slots)
      if (s.item && s.role === role) {
        s.role = 'fading';
        s.goal = 0;
        if (options.reducedMotion()) release(s);
      }
  }
  let hovered: Pickable | null = null,
    selected: Pickable | null = null;

  /** Draw one slot at its item's current place and animation level. */
  function draw(s: Slot) {
    const item = s.item!;
    if (!item.place(box, frame)) {
      s.halo.visible = s.brackets.visible = false;
      return;
    }
    const e = smooth(s.level),
      strength = s.role === 'selected' || item === selected ? 1 : 0.82;
    // Footprint: the box's base in world space, turned with the item.
    centre
      .set((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2)
      .applyMatrix4(frame);
    const origin = frame.elements[13];
    axisX.setFromMatrixColumn(frame, 0);
    axisZ.setFromMatrixColumn(frame, 2);
    const circle = item.shape === 'circle',
      gap = circle ? RING_GAP : GAP;
    let hx = (axisX.length() * (box.max.x - box.min.x)) / 2 + gap,
      hz = (axisZ.length() * (box.max.z - box.min.z)) / 2 + gap;
    if (circle) hx = hz = Math.max(hx, hz);
    const grow = 0.9 + 0.1 * e,
      u = s.halo.material.uniforms;
    u.uHalf.value.set(hx, hz);
    u.uRadius.value = circle ? hx : Math.min(0.08, hx, hz);
    u.uSize.value.set(2 * (hx + MARGIN), 2 * (hz + MARGIN));
    u.uOpacity.value = e * strength;
    u.uFill.value = (s.role === 'selected' ? 0.2 : 0.14) * (circle ? 1.3 : 1);
    u.uLine.value =
      (s.role === 'selected' ? LINE.selected : LINE.hover) +
      (circle ? LINE.person : 0);
    u.uRipple.value = s.ripple;
    s.halo.visible = item.grounded();
    s.halo.position.set(
      centre.x,
      Math.max(centre.y, Math.min(origin, centre.y + 0.1)) + 0.025,
      centre.z,
    );
    s.halo.rotation.y = Math.atan2(-axisX.z, axisX.x);
    s.halo.scale.set(u.uSize.value.x * grow, 1, u.uSize.value.y * grow);
    // Brackets close in on the box as they fade in.
    s.brackets.visible = !item.tint;
    if (s.brackets.visible) {
      const inflate = 1.02 + 0.14 * (1 - e);
      local
        .makeScale(
          (box.max.x - box.min.x) * inflate + 0.04,
          (box.max.y - box.min.y) * inflate + 0.04,
          (box.max.z - box.min.z) * inflate + 0.04,
        )
        .setPosition(
          (box.min.x + box.max.x) / 2,
          (box.min.y + box.max.y) / 2,
          (box.min.z + box.max.z) / 2,
        );
      s.brackets.matrix.multiplyMatrices(frame, local);
      s.brackets.matrixWorldNeedsUpdate = true;
      s.brackets.material.opacity = e * strength;
    }
    const intensity =
      e *
      (s.role === 'selected' ? TINT.selected : TINT.hover) *
      (circle ? TINT.person : 1);
    for (let i = 0; i < s.applied.length; i++)
      s.applied[i].emissiveIntensity = intensity;
    const o = s.outline.material.uniforms;
    o.uOpacity.value = 0.95 * e * strength;
    o.uWidth.value = s.role === 'selected' ? OUTLINE.selected : OUTLINE.hover;
  }

  return {
    /** The item under the pointer (null clears). Same item: nothing to do. */
    hover(item: Pickable | null) {
      if (item === hovered) return;
      if (hovered && hovered !== selected) fade('hover');
      hovered = item;
      if (item && item !== selected) show(item, 'hover', false);
    },
    /** The item whose card is open (null clears); `ripple` on a click. */
    select(item: Pickable | null, ripple = false) {
      if (item === selected) {
        if (item && ripple) show(item, 'selected', true);
        return;
      }
      if (selected) {
        const slot = holding(selected);
        if (slot && selected === hovered) slot.role = 'hover';
        else fade('selected');
      }
      selected = item;
      if (item) show(item, 'selected', ripple);
    },
    hovered: () => hovered,
    /**
     * Compile the outline's shader with the scene: it is drawn, invisibly,
     * on a person for the first frames.
     */
    warm(person: T.Object3D | null | undefined) {
      if (warm && !slots[0].item) attachOutline(slots[0], person);
    },
    /** Canvas size in CSS pixels, for the outline's width. */
    setViewport(width: number, height: number) {
      viewport.set(Math.max(1, width), Math.max(1, height));
    },
    /** Advance the animation and place every visible highlight. */
    tick(dt: number) {
      if (warm && !--warm && !slots[0].item) {
        slots[0].halo.visible = slots[0].brackets.visible = false;
        detachOutline(slots[0]);
      }
      let active = false;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.item) continue;
        active = true;
        const step = Math.min(dt, 0.1) / (s.goal ? FADE_IN : FADE_OUT);
        s.level = s.goal ? Math.min(1, s.level + step) : s.level - step;
        if (s.ripple >= 0) {
          s.ripple += Math.min(dt, 0.1) / RIPPLE;
          if (s.ripple >= 1) s.ripple = -1;
        }
        if (s.level <= 0) {
          release(s);
          continue;
        }
        draw(s);
      }
      return active;
    },
    dispose() {
      for (const s of slots) {
        release(s);
        s.tints.forEach((m) => m.dispose());
        s.tints.clear();
        s.halo.material.dispose();
        s.brackets.material.dispose();
        s.outline.material.dispose();
      }
      plane.dispose();
      corners.dispose();
      empty.dispose();
      root.removeFromParent();
      hovered = selected = null;
    },
  };
}
export type Highlights = ReturnType<typeof createHighlights>;
