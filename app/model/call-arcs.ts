import * as T from 'three';
import type { Interaction } from './activity';

/**
 * Phone calls between people of the played source, drawn as arcs while they
 * last: a raised curve from the caller (the interaction's first member) to
 * the far end, its apex rising with the distance, that draws on from the
 * caller when the call starts, carries soft pulses from the caller toward
 * the center while the call lasts (the call coming in) and retracts into the
 * far end when they hang up, with a breathing ring over each end that ripples
 * as a pulse arrives. A caption card at the crown says what the line is
 * ("Phone call from the hospital") and which call it is. An interaction opts in with `channel: 'phone'`
 * (activity.ts); members in one place (the Wongs on speakerphone) share an
 * end. An arc shows while its callers are in the scene and at least one end
 * is drawn: a member only filtered out of view (an upper floor that is not
 * shown, a role filter) still anchors the line where they are.
 *
 * Draw-on and retraction follow the care-day clock, so a scrubbed story
 * shows the same frame at the same time (a function of the time since the
 * call started, clamped); the pulses, the rings' breathing and their ripples
 * run on wall-clock time and are off without motion (prefers-reduced-motion:
 * the arc stands fully drawn for the whole call). The geometry is built
 * once and shared, and every frame only writes uniforms: the curve is a
 * cubic Bézier evaluated in the vertex shader and widened in screen space,
 * so the line keeps its pixel width in a wide shot and a close one.
 */
/** An engine actor (`activity.actors`): what a call end reads. */
export type CallPerson = {
  spec: { id: string; seated?: boolean; mobility?: string };
  root: T.Object3D;
  /** `visible: false` while out of the scene (off duty, indoors, driving). */
  sample: { action: string; seated?: boolean; visible?: boolean };
};
export type CallArcStyle = {
  /** Core line, the soft halo under it and the travelling pulses. */
  color: string;
  glow: string;
  pulse: string;
  /** Core line and halo widths, CSS pixels. */
  width: number;
  glowWidth: number;
  /** End rings: radius and stroke, CSS pixels. */
  ring: number;
  ringStroke: number;
  /** Apex height above the higher end: `lift` × the span, within [minLift, maxLift] m. */
  lift: number;
  minLift: number;
  maxLift: number;
  /** How far an end floats above the caller's head, m (scaled with the figure). */
  above: number;
  /** Draw-on and retraction, loop seconds of the care-day clock. */
  drawOn: number;
  retract: number;
  /** A pulse out and one back (one exchange), and one breath of the rings, wall-clock seconds. */
  pulsePeriod: number;
  breathPeriod: number;
};
/** Warm terracotta on the paper ground: subtle at network scale, crisp up close. */
export const CALL_ARC_STYLE: CallArcStyle = {
  color: '#b0603a',
  glow: '#e7b48c',
  pulse: '#ec7d43',
  width: 2,
  glowWidth: 12,
  ring: 7,
  ringStroke: 1.6,
  lift: 0.22,
  minLift: 3,
  maxLift: 30,
  above: 0.3,
  drawOn: 4,
  retract: 3,
  pulsePeriod: 3.6,
  breathPeriod: 2.4,
};
export type CallArcOptions = {
  /** Interactions of the played source; those with `channel: 'phone'` get arcs. */
  interactions: readonly Interaction[];
  /** The engine's people and the group they are drawn in (`activity.actors`, `activity.root`). */
  people: { root: T.Object3D; actors: readonly CallPerson[] };
  /** Pulses, breathing and ripples; default off under prefers-reduced-motion. */
  motion?: boolean;
  style?: Partial<CallArcStyle>;
  /**
   * The caption card at the crown of each arc: a title such as "Phone call
   * from the hospital" and a line naming the call. Default: the call's label
   * under "Phone call". Returning null draws no card.
   */
  caption?: (interaction: Interaction) => { title: string; detail?: string } | null;
};
/** Caption cards: canvas pixels and the card's width in metres at zoom 1. */
const CAPTION = { w: 640, h: 176, widthAtZoom1: 15, aboveCrown: 0.6 };

/** Members this close (m, on the ground plan) share an end: one place on the line. */
const SAME_PLACE = 8;
/** Inner control points lean this share of the span inward: steep rises, a broad crown. */
const LEAN = 0.12;
/** Segments along the curve (the vertex shader places them). */
const SEGMENTS = 128;
/** Head heights of the clay figures (m at scale 1, top of the hair). */
const HEAD = { standing: 1.72, seated: 1.33 };

const ARC_VERTEX = /* glsl */ `
  uniform vec3 uP0;
  uniform vec3 uP1;
  uniform vec3 uP2;
  uniform vec3 uP3;
  uniform vec2 uResolution;
  uniform float uHalf;
  attribute float aU;
  attribute float aSide;
  varying float vU;
  varying float vAcross;
  vec3 bezier(float t) {
    float s = 1.0 - t;
    return s * s * s * uP0 + 3.0 * s * s * t * uP1 + 3.0 * s * t * t * uP2 + t * t * t * uP3;
  }
  vec2 pixels(vec4 c) { return c.xy / c.w * uResolution * 0.5; }
  void main() {
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 clip = mvp * vec4(bezier(aU), 1.0);
    vec2 along = pixels(mvp * vec4(bezier(min(aU + 0.003, 1.0)), 1.0))
      - pixels(mvp * vec4(bezier(max(aU - 0.003, 0.0)), 1.0));
    vec2 dir = dot(along, along) > 1e-8 ? normalize(along) : vec2(1.0, 0.0);
    clip.xy += vec2(-dir.y, dir.x) * aSide * uHalf * 2.0 / uResolution * clip.w;
    vU = aU;
    vAcross = aSide * uHalf;
    gl_Position = clip;
  }`;
const ARC_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGlow;
  uniform vec3 uPulse;
  uniform float uCore;
  uniform float uHalf;
  uniform float uHead;
  uniform float uTail;
  uniform float uOpacity;
  uniform vec3 uPulseAt;
  uniform vec3 uPulseAmp;
  varying float vU;
  varying float vAcross;
  float bump(float at, float amp) {
    float x = (vU - at) / 0.035;
    return amp * exp(-x * x);
  }
  void main() {
    if (vU > uHead || vU < uTail) discard;
    // Soft ends: the line grows out of the caller's ring and into the other.
    float ends = smoothstep(0.0, 0.015, uHead - vU) * smoothstep(0.0, 0.015, vU - uTail);
    float p = min(1.0, bump(uPulseAt.x, uPulseAmp.x) + bump(uPulseAt.y, uPulseAmp.y) + bump(uPulseAt.z, uPulseAmp.z));
    float d = abs(vAcross);
    float core = uCore * (1.0 + 0.6 * p);
    float line = 1.0 - smoothstep(core - 0.6, core + 0.6, d);
    float halo = exp(-3.0 * d * d / (uHalf * uHalf)) * (0.3 + 0.45 * p);
    vec3 color = mix(mix(uGlow, uColor, line), uPulse, p * 0.85);
    float alpha = max(line * 0.92, halo) * uOpacity * ends;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const RING_VERTEX = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec2 uResolution;
  uniform float uSize;
  attribute vec2 aCorner;
  attribute float aEnd;
  varying vec2 vPx;
  varying float vEnd;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(mix(uA, uB, aEnd), 1.0);
    clip.xy += aCorner * uSize * 2.0 / uResolution * clip.w;
    vPx = aCorner * uSize;
    vEnd = aEnd;
    gl_Position = clip;
  }`;
const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uGlow;
  uniform float uRadius;
  uniform float uStroke;
  uniform vec2 uScale;
  uniform vec2 uAlpha;
  uniform vec2 uRipple;
  uniform float uRippleAmp;
  varying vec2 vPx;
  varying float vEnd;
  void main() {
    bool a = vEnd < 0.5;
    float r = uRadius * (a ? uScale.x : uScale.y),
      phase = a ? uRipple.x : uRipple.y,
      d = length(vPx);
    float ring = 1.0 - smoothstep(uStroke * 0.5 - 0.6, uStroke * 0.5 + 0.6, abs(d - r));
    float centre = 1.0 - smoothstep(1.6, 2.8, d);
    float fill = (1.0 - smoothstep(r - 1.0, r + 0.5, d)) * 0.18;
    // A ripple leaves the ring once a breath and fades as it widens.
    float rr = r * (1.0 + 1.2 * phase);
    float ripple = (1.0 - smoothstep(0.3, 1.3, abs(d - rr))) * (1.0 - phase) * (1.0 - phase) * uRippleAmp;
    float alpha = max(max(ring, centre), max(fill, ripple * 0.55)) * (a ? uAlpha.x : uAlpha.y);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(mix(uGlow, uColor, max(ring, centre)), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
/** Overshoots a little before settling: a ring that pops in. */
const easeOutBack = (x: number) =>
  1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const prefersReducedMotion = () => {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
};

/** The ribbon: `SEGMENTS` quads along u ∈ [0, 1], sides ±1; the shader places them. */
function ribbonGeometry() {
  const n = SEGMENTS + 1,
    u = new Float32Array(n * 2),
    side = new Float32Array(n * 2),
    index: number[] = [];
  for (let i = 0; i < n; i++) {
    u[2 * i] = u[2 * i + 1] = i / SEGMENTS;
    side[2 * i] = -1;
    side[2 * i + 1] = 1;
    if (i < SEGMENTS)
      index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  }
  const g = new T.BufferGeometry();
  // Positions are placeholders (three.js draws by them); the shader places every vertex.
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 6), 3));
  g.setAttribute('aU', new T.BufferAttribute(u, 1));
  g.setAttribute('aSide', new T.BufferAttribute(side, 1));
  g.setIndex(index);
  g.boundingSphere = new T.Sphere(new T.Vector3(), 1e4);
  return g;
}
/** Two screen-facing quads, one per end. */
function ringGeometry() {
  const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(new Float32Array(24), 3));
  g.setAttribute(
    'aCorner',
    new T.BufferAttribute(new Float32Array([...corners, ...corners]), 2),
  );
  g.setAttribute(
    'aEnd',
    new T.BufferAttribute(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]), 1),
  );
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.boundingSphere = new T.Sphere(new T.Vector3(), 1e4);
  return g;
}

/**
 * A caption card drawn on a canvas: cream, a terracotta edge, the title and
 * a smaller detail line. Null where there is no DOM (unit tests).
 */
function captionSprite(
  title: string,
  detail: string | undefined,
  style: CallArcStyle,
): T.Sprite | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CAPTION.w;
  canvas.height = CAPTION.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const w = canvas.width,
    h = canvas.height,
    pad = 22,
    r = 18;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fffdf8f2';
  ctx.strokeStyle = '#e7dccb';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, r);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = style.color;
  ctx.beginPath();
  ctx.roundRect(4, 4, 14, h - 8, [r, 0, 0, r]);
  ctx.fill();
  // A handset glyph: a small ring and a bar, in the line's colour.
  ctx.strokeStyle = style.color;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(pad + 36, h / 2 - 2, 20, Math.PI * 0.75, Math.PI * 1.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(pad + 20, h / 2 + 16);
  ctx.lineTo(pad + 52, h / 2 + 16);
  ctx.stroke();
  ctx.fillStyle = '#22362c';
  ctx.textBaseline = 'middle';
  ctx.font = '600 44px system-ui, -apple-system, "Segoe UI", sans-serif';
  const x = pad + 76;
  if (detail) {
    ctx.fillText(title, x, h / 2 - 30, w - x - pad);
    ctx.fillStyle = '#5a6b60';
    ctx.font = '400 32px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(detail, x, h / 2 + 32, w - x - pad);
  } else ctx.fillText(title, x, h / 2, w - x - pad);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const material = new T.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    name: 'seen-call-caption',
  });
  const sprite = new T.Sprite(material);
  // Its own copy of the sprite quad, so dispose() can free it with the card.
  sprite.geometry = sprite.geometry.clone();
  sprite.name = 'call-caption';
  sprite.renderOrder = 32;
  sprite.visible = false;
  sprite.raycast = () => {};
  return sprite;
}
export function buildCallArcs(options: CallArcOptions) {
  const style = { ...CALL_ARC_STYLE, ...options.style },
    motion = options.motion ?? !prefersReducedMotion(),
    { people } = options;
  const root = new T.Group();
  root.name = 'call-arcs';
  const byId = new Map(people.actors.map((a) => [a.spec.id, a]));
  const ribbon = ribbonGeometry(),
    rings = ringGeometry();
  /** Drawing-buffer size in CSS pixels, read before each draw; shared by every arc. */
  const resolution = new T.Vector2(1, 1);
  const sizeUp = (renderer: T.WebGLRenderer) => {
    renderer.getSize(resolution);
  };
  const half = Math.max(style.glowWidth, style.width) / 2 + 1;
  const materials: T.ShaderMaterial[] = [];
  const shader = (
    name: string,
    vertexShader: string,
    fragmentShader: string,
    uniforms: Record<string, T.IUniform>,
  ) => {
    const m = new T.ShaderMaterial({
      name,
      uniforms: { uResolution: { value: resolution }, ...uniforms },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });
    materials.push(m);
    return m;
  };
  const mesh = (g: T.BufferGeometry, m: T.ShaderMaterial, order: number) => {
    const o = new T.Mesh(g, m);
    o.frustumCulled = false;
    o.renderOrder = order;
    o.visible = false;
    o.onBeforeRender = sizeUp;
    // Overlays: never picked.
    o.raycast = () => {};
    root.add(o);
    return o;
  };
  const arc = () => {
    const line = shader('seen-call-arc', ARC_VERTEX, ARC_FRAGMENT, {
      uP0: { value: new T.Vector3() },
      uP1: { value: new T.Vector3() },
      uP2: { value: new T.Vector3() },
      uP3: { value: new T.Vector3() },
      uHalf: { value: half },
      uCore: { value: style.width / 2 },
      uColor: { value: new T.Color(style.color) },
      uGlow: { value: new T.Color(style.glow) },
      uPulse: { value: new T.Color(style.pulse) },
      uHead: { value: 1 },
      uTail: { value: 0 },
      uOpacity: { value: 1 },
      uPulseAt: { value: new T.Vector3() },
      uPulseAmp: { value: new T.Vector3() },
    });
    const ring = shader('seen-call-ring', RING_VERTEX, RING_FRAGMENT, {
      uA: { value: new T.Vector3() },
      uB: { value: new T.Vector3() },
      uSize: { value: style.ring * 2.4 + style.ringStroke + 3 },
      uColor: { value: new T.Color(style.color) },
      uGlow: { value: new T.Color(style.glow) },
      uRadius: { value: style.ring },
      uStroke: { value: style.ringStroke },
      uScale: { value: new T.Vector2(1, 1) },
      uAlpha: { value: new T.Vector2(1, 1) },
      uRipple: { value: new T.Vector2() },
      uRippleAmp: { value: 0 },
    });
    return {
      line: mesh(ribbon, line, 30),
      ring: mesh(rings, ring, 31),
      l: line.uniforms,
      r: ring.uniforms,
    };
  };
  // One entry per phone call whose members the engine draws; an end per
  // place, the caller's first, and an arc from it to each other end.
  const calls = options.interactions
    .filter((i) => i.channel === 'phone')
    .map((interaction) => {
      const members = interaction.actorIds
        .map((id) => byId.get(id))
        .filter((a): a is CallPerson => !!a);
      const text = options.caption
        ? options.caption(interaction)
        : { title: 'Phone call', detail: interaction.label };
      return {
        interaction,
        members,
        ends: members.map(() => ({ at: new T.Vector3(), n: 0, drawn: false })),
        arcs: members.slice(1).map(() => {
          const a = arc();
          const caption = text ? captionSprite(text.title, text.detail, style) : null;
          if (caption) root.add(caption);
          return { ...a, caption };
        }),
      };
    })
    .filter((c) => c.members.length > 1);
  const head = new T.Vector3();
  /** Where a drawn member's end floats: above the head, seated or standing. */
  function endOf(a: CallPerson, out: T.Vector3) {
    const seated =
      !!a.spec.seated ||
      !!a.sample.seated ||
      a.spec.mobility === 'wheelchair' ||
      a.sample.action === 'seated' ||
      a.sample.action === 'ride';
    return out
      .copy(a.root.position)
      .setY(
        a.root.position.y +
          ((seated ? HEAD.seated : HEAD.standing) + style.above) *
            a.root.scale.y,
      );
  }
  /** Group the members in the scene by place; returns the number of ends. */
  function gather(call: (typeof calls)[number]) {
    let count = 0;
    for (let i = 0; i < call.members.length; i++) {
      const m = call.members[i];
      if (m.sample.visible === false) continue;
      endOf(m, head);
      let k = 0;
      for (; k < count; k++) {
        const e = call.ends[k];
        if (
          Math.hypot(e.at.x / e.n - head.x, e.at.z / e.n - head.z) < SAME_PLACE
        )
          break;
      }
      const e = call.ends[k];
      if (k === count) {
        e.at.set(0, 0, 0);
        e.n = 0;
        e.drawn = false;
        count++;
      }
      e.at.add(head);
      e.n++;
      e.drawn ||= m.root.visible;
    }
    for (let k = 0; k < count; k++)
      call.ends[k].at.multiplyScalar(1 / call.ends[k].n);
    return count;
  }
  type Arc = ReturnType<typeof arc> & { caption: T.Sprite | null };
  /** The curve from `a` to `b`: steep rises, its crown `lift` above the higher end. */
  function place(arc: Arc, a: T.Vector3, b: T.Vector3) {
    const dx = b.x - a.x,
      dz = b.z - a.z,
      lift = Math.min(
        style.maxLift,
        Math.max(style.minLift, style.lift * Math.hypot(dx, dz)),
      ),
      top = Math.max(a.y, b.y) + lift,
      // Both inner control points at one height: the crown sits mid-way.
      y = (8 * top - a.y - b.y) / 6;
    (arc.l.uP0.value as T.Vector3).copy(a);
    (arc.l.uP1.value as T.Vector3).set(a.x + dx * LEAN, y, a.z + dz * LEAN);
    (arc.l.uP2.value as T.Vector3).set(b.x - dx * LEAN, y, b.z - dz * LEAN);
    (arc.l.uP3.value as T.Vector3).copy(b);
    (arc.r.uA.value as T.Vector3).copy(a);
    (arc.r.uB.value as T.Vector3).copy(b);
    if (arc.caption)
      // The crown of the cubic: (P0 + 3P1 + 3P2 + P3) / 8.
      arc.caption.position.set(
        (a.x + 3 * (a.x + dx * LEAN) + 3 * (b.x - dx * LEAN) + b.x) / 8,
        (a.y + 6 * y + b.y) / 8 + CAPTION.aboveCrown,
        (a.z + 3 * (a.z + dz * LEAN) + 3 * (b.z - dz * LEAN) + b.z) / 8,
      );
  }
  /** Draw-on, pulses, retraction and the rings at a moment of the call. */
  function animate(
    arc: Arc,
    first: boolean,
    i: Interaction,
    time: number,
    now: number,
    zoom: number,
  ) {
    const l = arc.l,
      r = arc.r,
      pulseAt = l.uPulseAt.value as T.Vector3,
      pulseAmp = l.uPulseAmp.value as T.Vector3,
      scale = r.uScale.value as T.Vector2,
      alpha = r.uAlpha.value as T.Vector2,
      ripple = r.uRipple.value as T.Vector2;
    const caption = arc.caption;
    if (caption) {
      // The card keeps its size on screen: metres shrink as the zoom grows.
      const w = CAPTION.widthAtZoom1 / Math.max(0.3, zoom);
      caption.scale.set(w, (w * CAPTION.h) / CAPTION.w, 1);
    }
    if (!motion) {
      // The final state, held for the whole call.
      l.uHead.value = l.uOpacity.value = 1;
      l.uTail.value = 0;
      pulseAmp.set(0, 0, 0);
      scale.set(1, 1);
      alpha.set(first ? 1 : 0, 1);
      r.uRippleAmp.value = 0;
      if (caption) {
        caption.visible = true;
        (caption.material as T.SpriteMaterial).opacity = 1;
      }
      return;
    }
    const span = i.end - i.start,
      on = Math.min(style.drawOn, span * 0.3),
      off = Math.min(style.retract, span * 0.25),
      since = time - i.start,
      drawn = clamp01(since / on),
      gone = clamp01(1 - (i.end - time) / off);
    l.uHead.value = easeOut(drawn);
    l.uTail.value = easeInOut(gone);
    l.uOpacity.value = smooth(0, 0.15, drawn) * (1 - smooth(0.55, 1, gone));
    // The call coming in, once the line is drawn: pulses leave the caller
    // and travel to the far end, two of them half a period apart, each
    // easing along the line; the tip glows while the line draws on.
    const talk = clamp01((since - on) / 1.5) * (1 - clamp01(gone * 4)),
      f = (now / style.pulsePeriod) % 1,
      f2 = (f + 0.5) % 1,
      fadeOf = (t: number) => smooth(0, 0.1, t) * (1 - smooth(0.9, 1, t));
    pulseAt.set(easeInOut(f), easeInOut(f2), l.uHead.value as number);
    pulseAmp.set(
      talk * fadeOf(f),
      talk * fadeOf(f2),
      (1 - drawn) * smooth(0, 0.1, drawn),
    );
    if (caption) {
      // The card fades in once the line is well on its way and out with it.
      const show = smooth(0.35, 0.8, drawn) * (1 - smooth(0.2, 0.7, gone));
      caption.visible = show > 0.002;
      (caption.material as T.SpriteMaterial).opacity = show;
    }
    // The caller's ring opens with the call, the far one as the line arrives;
    // both breathe out of step and fade as the line retracts.
    const openA = clamp01(since / (on * 0.6)),
      openB = clamp01((since - on * 0.8) / (on * 0.6)),
      breath = (2 * Math.PI * now) / style.breathPeriod;
    scale.set(
      (0.55 + 0.45 * easeOutBack(openA)) * (1 + 0.07 * talk * Math.sin(breath)),
      (0.55 + 0.45 * easeOutBack(openB)) *
        (1 + 0.07 * talk * Math.sin(breath + Math.PI)),
    );
    alpha.set(
      first ? openA * (1 - gone) : 0,
      openB * (1 - smooth(0.6, 1, gone)),
    );
    // The far ring ripples as each pulse arrives; the caller's as each
    // pulse sets out.
    ripple.set(clamp01(f2 / 0.45), clamp01(f / 0.45));
    r.uRippleAmp.value = talk;
  }
  /**
   * Place and animate every live call at care-day `time`; `zoom` is the
   * camera's zoom (orthographic), which sizes the caption cards.
   */
  function tick(time: number, now = performance.now() / 1000, zoom = 1) {
    const live = people.root.visible;
    // Indexed loops: a frame allocates nothing.
    for (let c = 0; c < calls.length; c++) {
      const call = calls[c],
        i = call.interaction,
        ends = live && time >= i.start && time < i.end ? gather(call) : 0;
      for (let k = 0; k < call.arcs.length; k++) {
        const a = call.arcs[k],
          on = k + 1 < ends && (call.ends[0].drawn || call.ends[k + 1].drawn);
        a.line.visible = a.ring.visible = on;
        if (a.caption && !on) a.caption.visible = false;
        if (!on) continue;
        place(a, call.ends[0].at, call.ends[k + 1].at);
        animate(a, k === 0, i, time, now, zoom);
      }
    }
  }
  return {
    root,
    tick,
    /** Ids of the calls drawn (phone interactions with drawable members). */
    callIds: calls.map((c) => c.interaction.id),
    dispose() {
      ribbon.dispose();
      rings.dispose();
      materials.forEach((m) => m.dispose());
      for (const c of calls)
        for (const a of c.arcs)
          if (a.caption) {
            const m = a.caption.material as T.SpriteMaterial;
            m.map?.dispose();
            m.dispose();
            a.caption.geometry.dispose();
          }
    },
  };
}
export type CallArcs = ReturnType<typeof buildCallArcs>;
