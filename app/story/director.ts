import type { CameraShot, ViewerState, createViewer } from '../model/renderer';
import type { Facility } from '../model/schema';
import {
  BUILDING,
  CHAPTER_SHOTS,
  CUT_SETTLE,
  DEFAULT_CHAPTER_SHOT,
  DEFAULT_CUTAWAY_SHOT,
  DEFAULT_HIGHLIGHT_SHOT,
  FINALE_SHOT,
  HIGHLIGHT_SHOTS,
  NETWORK_SHOT,
  OPENING_SHOT,
  PEACE_SHOT,
  REVEAL_SHOT,
  TEAM_SHOT,
  clamp01,
  easeInOut,
  mixShots,
  scrubTime,
  smoothstep,
  stepRoom,
  stopBlend,
  unwrap,
  type Shot,
  type ShotSpec,
} from './choreography';
import { clock, homeAlias, isCutaway, scrub, type Highlight, type Step } from './data';

export type Viewer = ReturnType<typeof createViewer>;
export type BeatKind =
  | 'opening'
  | 'reveal'
  | 'team'
  | 'chapter'
  | 'finale'
  | 'network'
  | 'highlight'
  | 'peace'
  | 'cta';
export type BeatDef = {
  kind: BeatKind;
  step?: Step;
  stepIndex?: number;
  highlight?: Highlight;
  highlightIndex?: number;
};
/**
 * Beats the story cuts into and out of rather than flies to: each highlight
 * sits on its own clock somewhere else in the network (so do the network
 * aerial before them and the closing beat after them, back at Mrs. Lin's
 * home at four).
 */
const isCutBeat = (b: BeatDef | undefined) => b?.kind === 'highlight';
/**
 * Screen-space position of the subject, as a fraction of the stage size from
 * its centre, plus a zoom factor for the layout (small stages need more).
 */
export type Framing = { x: number; y: number; zoom?: number };

export type DirectorHooks = {
  /** Active beat changed (index into beats). */
  onBeat(index: number): void;
  /** Number of handoffs revealed in the active chapter changed. */
  onPhase(phase: number): void;
  /** Displayed sim time crossed a minute. */
  onClock(time: number): void;
  /**
   * A cut starts (into or out of a highlight): play the stage transition
   * and return how long (ms) until it covers the
   * stage. The director keeps the old picture until then and swaps camera,
   * clock and view under the cover. 0 cuts at once.
   */
  onCut?(direction: 1 | -1): number;
};

type Range = { top: number; height: number; start: number; end: number };

const LAST_TIME = clock.duration - 0.5;
/** Half-width (in viewport heights) of the scrubbed camera blend at a beat boundary. */
const BLEND = 0.42;
const BASE: ViewerState = {
  selected: null,
  doorsOpen: true,
  room: null,
  level: 'all',
  explode: 0,
  stack: 0,
  walls: 'full',
  furniture: true,
  labels: false,
  colors: false,
  plan: false,
  isolate: false,
  site: true,
  roof: true,
  exterior: true,
  ceilings: false,
  sectionAxis: 'none',
  section: 0.5,
};
const EXTERIOR: ViewerState = { ...BASE };
const INTERIOR: ViewerState = {
  ...BASE,
  walls: 'cutaway',
  roof: false,
  exterior: false,
};
/**
 * Cutaways at a care setting, the highlights and the closing beat: the
 * community cast shows at `ground` (site-level people), while the center's
 * upper floor and roof stay hidden and no room is highlighted.
 */
const CUTAWAY: ViewerState = { ...INTERIOR, level: 'ground', selected: null, room: null };
/** Height of camera anchors above the floor (rooms, zones, pads). */
const ANCHOR_Y = 0.8;

/** Handoff k of n is revealed once chapter progress passes this point. */
export const handoffAt = (k: number, n: number) =>
  n <= 1 ? 0.4 : 0.3 + (0.36 * k) / (n - 1);

/**
 * Drives everything that changes per frame from the native scroll position:
 * section reveal variables, the stage camera, the sim clock and the viewer
 * state. React only hears about discrete changes (beat, handoff phase,
 * minute) through `hooks`.
 */
export function createDirector(opts: {
  root: HTMLElement;
  sections: HTMLElement[];
  beats: BeatDef[];
  hooks: DirectorHooks;
  reducedMotion: boolean;
  framing: (kind: BeatKind) => Framing;
  /** Name tag that tracks the hero on the stage (positioned per frame). */
  heroPin?: HTMLElement | null;
}) {
  const { root, sections, beats, hooks } = opts;
  const chapterCount = beats.filter((b) => b.kind === 'chapter').length;
  let reduced = opts.reducedMotion;
  let ranges: Range[] = [];
  let vh = 800;
  let viewer: Viewer | null = null,
    heroId: string | null = null,
    stage: HTMLElement | null = null;
  const anchors = new Map<string, [number, number, number]>();
  let frame = 0,
    running = false,
    lastNow = 0,
    lastY = -1,
    idleFrames = 0;
  let beatIndex = -1,
    phase = -1,
    minute = -1;
  let time = 0,
    timeSet = -1;
  let cam: Shot | null = null;
  /** Latest camera and clock goals (for debug()). */
  let lastGoal: Shot | null = null,
    lastGoalTime = 0;
  const vel = { x: 0, y: 0, z: 0, zoom: 0, az: 0, el: 0 };
  let viewKey = '';
  /**
   * A cut in progress: until `coverAt` (performance.now ms) the stage keeps
   * the beat it is leaving (`heldBeat`); then camera, clock and view snap to
   * the new beat under the transition's cover.
   */
  let coverAt = 0,
    heldBeat = -1,
    snapNext = false;
  const sectionVars = sections.map(() => ({ vis: -1, enter: 99, p: -1 }));
  const rootVars = { ui: -1, rail: -1, veil: -1, day: -1, open: -1, glow: -1, hl: -1 };

  function measure() {
    vh = window.innerHeight || 800;
    const y0 = window.scrollY;
    const tops = sections.map((el) => el.getBoundingClientRect().top + y0);
    ranges = sections.map((el, i) => {
      const top = tops[i],
        height = el.offsetHeight;
      const start = i === 0 ? -1e9 : top - vh * 0.5;
      const end = i < sections.length - 1 ? tops[i + 1] - vh * 0.5 : 1e9;
      return { top, height, start, end };
    });
    lastY = -1;
    wake();
  }

  function locate(y: number) {
    let i = 0;
    while (i < ranges.length - 1 && y >= ranges[i].end) i++;
    return i;
  }
  const progressAt = (i: number, y: number) => {
    const r = ranges[i];
    if (i === 0) return clamp01(y / Math.max(1, r.end));
    if (r.end > 1e8) return clamp01((y - r.start) / Math.max(1, r.height));
    return clamp01((y - r.start) / Math.max(1, r.end - r.start));
  };

  // ---- sim time -----------------------------------------------------------
  function timeAt(i: number, p: number) {
    const b = beats[i];
    // Chapters scrub their scrub window (contiguous, so time never jumps).
    if (b.kind === 'chapter' && b.stepIndex !== undefined) return scrubTime(scrub[b.stepIndex], p);
    // Highlights scrub their own window, on their own clock.
    if (b.kind === 'highlight' && b.highlight) return scrubTime(b.highlight.window, p);
    if (b.kind === 'finale' || b.kind === 'network' || b.kind === 'peace' || b.kind === 'cta')
      return LAST_TIME;
    return 0;
  }

  // ---- viewer state -------------------------------------------------------
  function viewFor(i: number, p: number, t: number): ViewerState {
    const b = beats[i];
    if (b.kind === 'opening') return EXTERIOR;
    if (b.kind === 'reveal') {
      if (reduced) return p < 0.5 ? EXTERIOR : INTERIOR;
      // The roof and upper floor float up (exploded axonometric), then the
      // roof is set aside and the floors settle back into a cutaway.
      if (p < 0.1) return EXTERIOR;
      if (p < 0.52) {
        const lift = easeInOut(clamp01((p - 0.1) / 0.36));
        return { ...EXTERIOR, stack: Math.round(lift * 130) / 100 };
      }
      const settle = easeInOut(clamp01((p - 0.52) / 0.4));
      return {
        ...INTERIOR,
        stack: Math.round((1 - settle) * 130) / 100,
      };
    }
    // The team keeps the whole building open, so nothing pops between it and
    // the upstairs huddle. The finale and the network aerial keep the roof
    // on: the center reads as one building among the places it serves.
    if (b.kind === 'team') return INTERIOR;
    if (b.kind === 'finale' || b.kind === 'network') return EXTERIOR;
    if (b.kind === 'highlight' || b.kind === 'peace' || b.kind === 'cta') return CUTAWAY;
    const s = b.step!;
    if (isCutaway(s) && s.settingId) return CUTAWAY;
    const zone = model?.zones.find((z) => z.id === s.zoneId);
    const room = stepRoom(s, t);
    return {
      ...INTERIOR,
      // Upstairs meetings keep the ground floor in view for context; ground
      // chapters hide the mezzanine and offices that would cover the rooms.
      level: zone && zone.levelId !== 'ground' ? 'all' : 'ground',
      selected: zone?.id || null,
      room,
    };
  }

  // ---- camera -------------------------------------------------------------
  let model: Facility | null = null;
  function specFor(i: number): ShotSpec {
    const b = beats[i];
    if (b.kind === 'opening') return OPENING_SHOT;
    if (b.kind === 'reveal') return REVEAL_SHOT;
    if (b.kind === 'team') return TEAM_SHOT;
    if (b.kind === 'network') return NETWORK_SHOT;
    if (b.kind === 'chapter' && b.step)
      return (
        CHAPTER_SHOTS[b.step.id] ||
        (isCutaway(b.step) && b.step.settingId ? DEFAULT_CUTAWAY_SHOT : DEFAULT_CHAPTER_SHOT)
      );
    if (b.kind === 'highlight' && b.highlight)
      return HIGHLIGHT_SHOTS[b.highlight.id] || DEFAULT_HIGHLIGHT_SHOT;
    if (b.kind === 'peace' || b.kind === 'cta') return PEACE_SHOT;
    return FINALE_SHOT;
  }
  /**
   * A `place` anchor from the community layer: the network's framing, or for
   * a setting an instance room's centre (once its facility instance is
   * stamped), a registry anchor (world coordinates) or the pad centre. Null
   * without the layer.
   */
  function placeFrame(
    place: NonNullable<ShotSpec['place']>,
  ): { target: [number, number, number]; zoom: number } | null {
    const layer = viewer?.community;
    if (!layer) return null;
    const frame = layer.frame(place === 'network' ? undefined : place.setting);
    if (!frame) return null;
    let point: [number, number] | null | undefined = null;
    if (place !== 'network') {
      if (place.room) point = layer.instance(place.setting)?.roomCenter(place.room);
      if (!point && place.anchor)
        point = layer.settings.find((s) => s.id === place.setting)?.anchors[place.anchor];
    }
    const [x, z] = point || [frame.target[0], frame.target[2]];
    return { target: [x, ANCHOR_Y, z], zoom: frame.zoom };
  }
  /** The anchor a shot reads from the layer: its own `place`, else the setting of a cutaway or highlight. */
  function placeOf(b: BeatDef, spec: ShotSpec): ShotSpec['place'] {
    if (spec.place) return spec.place;
    const setting = b.step?.settingId || b.highlight?.settingId;
    return setting ? { setting } : undefined;
  }
  /** A fresh anchor array (callers adjust it in place). */
  function anchorFor(b: BeatDef, spec: ShotSpec, t: number): [number, number, number] {
    if (spec.anchor) return [...spec.anchor];
    const place = placeOf(b, spec);
    // Without the community layer (a facility without it), fall back to the building.
    if (place) return placeFrame(place)?.target || [...BUILDING];
    if (!b.step) return [0, 0, 0];
    const blend = stopBlend(b.step, t);
    if (!blend.length) {
      const zone = anchors.get(b.step.zoneId);
      return zone ? [...zone] : [0, 0, 0];
    }
    const out: [number, number, number] = [0, 0, 0];
    let w = 0;
    for (const [id, weight] of blend) {
      const a = anchors.get(id) || anchors.get(b.step.zoneId);
      if (!a) continue;
      out[0] += a[0] * weight;
      out[1] += a[1] * weight;
      out[2] += a[2] * weight;
      w += weight;
    }
    return w ? [out[0] / w, out[1] / w, out[2] / w] : [0, 0, 0];
  }
  /** The actor who is Mrs. Lin in a beat: the compiled hero, or her stand-in at home. */
  function heroIn(b: BeatDef): string | null {
    if (b.kind === 'peace' || b.kind === 'cta') return homeAlias;
    if (!b.step) return null;
    if (b.step.heroAlias) return b.step.heroAlias;
    return b.step.heroPresent ? heroId : null;
  }
  /**
   * Who the camera leans toward: Mrs. Lin (or her stand-in at home), else the
   * first featured interaction of a cutaway or highlight.
   */
  function subjectOf(b: BeatDef) {
    if (!viewer) return null;
    const hero = heroIn(b);
    if (hero) return viewer.activity.actorPosition(hero);
    const id = b.step?.interactionIds?.[0] || b.highlight?.interactionIds[0];
    return id ? viewer.activity.actorPosition(`interaction:${id}`) : null;
  }
  /**
   * The middle of a phone call's span: the mean of its ends (members more
   * than 8 m apart), from their sampled positions, so an end on a hidden
   * upper floor still counts. Null if the interaction is not a live call.
   */
  function callMiddle(id: string | undefined): [number, number, number] | null {
    if (!viewer || !id) return null;
    const call = viewer.activity.data.interactions.find((i) => i.id === id);
    if (call?.channel !== 'phone') return null;
    const ends: [number, number][] = [];
    for (const a of call.actorIds) {
      const s = viewer.activity.actorSample(a);
      if (!s || ends.some((e) => Math.hypot(e[0] - s.x, e[1] - s.z) < 8)) continue;
      ends.push([s.x, s.z]);
    }
    if (ends.length < 2) return null;
    const x = ends.reduce((v, e) => v + e[0], 0) / ends.length,
      z = ends.reduce((v, e) => v + e[1], 0) / ends.length;
    return [x, 2, z];
  }
  function shotFor(i: number, p: number, t: number): Shot {
    const b = beats[i],
      spec = specFor(i);
    const pp = b.kind === 'cta' ? 1 : p;
    const target = anchorFor(b, spec, t);
    // A call reveal: hold on the caller, then ease over to the call's middle.
    let revealed = 0;
    if (spec.reveal === 'call') {
      const mid = callMiddle(b.highlight?.interactionIds[0] || b.step?.interactionIds?.[0]);
      if (mid) {
        revealed = easeInOut(clamp01((pp - 0.12) / 0.72));
        for (let k = 0; k < 3; k++) target[k] += (mid[k] - target[k]) * revealed;
      }
    }
    const h = spec.follow ? subjectOf(b) : null;
    // Far-off subjects are ignored (the nurse line's call is split between
    // the center and the home, so its centroid sits between them).
    if (h && spec.follow) {
      const d = Math.hypot(h.x - target[0], h.z - target[2]),
        r = spec.radius || 8,
        w = spec.follow * (1 - smoothstep(r * 0.7, r, d)) * (1 - revealed);
      target[0] += (h.x - target[0]) * w;
      target[1] += (h.y - target[1]) * w;
      target[2] += (h.z - target[2]) * w;
    }
    // The network shot's zoom is a factor on the layer's own framing, so the
    // whole network stays in view as settings are added.
    const place = placeOf(b, spec),
      base = place === 'network' ? spec.zoom * (placeFrame(place)?.zoom || 0.42) : spec.zoom;
    const zoom = base * (1 + ((spec.push || 1) - 1) * pp) * (opts.framing(b.kind).zoom || 1);
    const azimuth = spec.azimuth + (spec.drift || 0) * (pp - 0.5);
    return frameShot({ target, zoom, azimuth, elevation: spec.elevation }, b.kind);
  }
  /** Offsets the orbit target so the subject lands in the free part of the stage. */
  function frameShot(s: Shot, kind: BeatKind): Shot {
    const f = opts.framing(kind);
    if (!stage || (!f.x && !f.y)) return s;
    const w = stage.clientWidth || 1,
      h = stage.clientHeight || 1,
      perPx = 80 / (s.zoom * h);
    const dx = f.x * w * perPx,
      dy = f.y * h * perPx;
    const ca = Math.cos(s.azimuth),
      sa = Math.sin(s.azimuth),
      ce = Math.cos(s.elevation),
      se = Math.sin(s.elevation);
    // right = (cos a, 0, -sin a); screen-up = (-sin e sin a, cos e, -sin e cos a)
    return {
      ...s,
      target: [
        s.target[0] - ca * dx - se * sa * dy,
        s.target[1] + ce * dy,
        s.target[2] + sa * dx - se * ca * dy,
      ],
    };
  }
  function targetShot(i: number, y: number, t: number): Shot {
    const p = progressAt(i, y);
    const here = shotFor(i, p, t);
    if (reduced) return here;
    const r = ranges[i],
      band = BLEND * vh;
    // Cuts are not flown: a beat next to a cut holds its own shot to the edge.
    const cutNext = i < beats.length - 1 && (isCutBeat(beats[i]) || isCutBeat(beats[i + 1])),
      cutPrev = i > 0 && (isCutBeat(beats[i]) || isCutBeat(beats[i - 1]));
    if (i < beats.length - 1 && !cutNext && y > r.end - band) {
      const k = easeInOut(clamp01((y - (r.end - band)) / (2 * band)));
      return mixShots(here, shotFor(i + 1, 0, t), k);
    }
    if (i > 0 && !cutPrev && y < r.start + band) {
      const k = easeInOut(clamp01((y - (r.start - band)) / (2 * band)));
      return mixShots(shotFor(i - 1, 1, t), here, k);
    }
    return here;
  }

  // Critically damped spring (implicit integration; stable for any dt).
  function spring(x: number, v: number, target: number, omega: number, dt: number) {
    const f = 1 + 2 * dt * omega,
      oo = omega * omega,
      hoo = dt * oo,
      hhoo = dt * hoo,
      inv = 1 / (f + hhoo);
    return [(f * x + dt * v + hhoo * target) * inv, (v + hoo * (target - x)) * inv];
  }
  function stepCamera(goal: Shot, dt: number, snap: boolean, settle = false) {
    if (!cam || snap || reduced) {
      cam = { ...goal, target: [...goal.target] };
      // After a cut the camera lands a little wide and turned, and the spring
      // carries it into the framing: every cut arrives in motion.
      if (settle && !reduced) {
        cam.zoom *= CUT_SETTLE.zoom;
        cam.azimuth += CUT_SETTLE.azimuth;
        cam.elevation += CUT_SETTLE.elevation;
      }
      Object.assign(vel, { x: 0, y: 0, z: 0, zoom: 0, az: 0, el: 0 });
      return true;
    }
    const w = 4.6;
    let moved = false;
    const s = (key: keyof typeof vel, x: number, target: number) => {
      const [nx, nv] = spring(x, vel[key], target, w, dt);
      vel[key] = nv;
      if (Math.abs(nx - target) > 1e-4 || Math.abs(nv) > 1e-4) moved = true;
      return nx;
    };
    cam.target = [
      s('x', cam.target[0], goal.target[0]),
      s('y', cam.target[1], goal.target[1]),
      s('z', cam.target[2], goal.target[2]),
    ];
    cam.zoom = Math.exp(s('zoom', Math.log(cam.zoom), Math.log(goal.zoom)));
    cam.azimuth = s('az', cam.azimuth, unwrap(goal.azimuth, cam.azimuth));
    cam.elevation = s('el', cam.elevation, goal.elevation);
    return moved;
  }

  // ---- hero name tag ---------------------------------------------------------
  let pinShown = false;
  /** Tags Mrs. Lin on the stage in her chapters; `i` < 0 hides the tag (during a cut). */
  function placeHeroPin(i: number, t: number) {
    const pin = opts.heroPin;
    if (!pin) return;
    const b = beats[i];
    let show = false;
    const who = b?.kind === 'chapter' ? heroIn(b) : null;
    if (viewer && who && cam && stage) {
      const h = viewer.activity.actorPosition(who);
      const spec = specFor(i),
        anchor = anchorFor(b, spec, t);
      // Only tag her when she is part of this chapter's picture.
      if (h && Math.hypot(h.x - anchor[0], h.z - anchor[2]) < (spec.radius || 8) * 1.15) {
        const w = stage.clientWidth,
          ht = stage.clientHeight,
          ppw = (ht * cam.zoom) / 80;
        const dx = h.x - cam.target[0],
          dy = h.y + 1.15 - cam.target[1],
          dz = h.z - cam.target[2];
        const sa = Math.sin(cam.azimuth),
          ca = Math.cos(cam.azimuth),
          se = Math.sin(cam.elevation),
          ce = Math.cos(cam.elevation);
        const x = w / 2 + (ca * dx - sa * dz) * ppw,
          y = ht / 2 - (-se * sa * dx + ce * dy - se * ca * dz) * ppw;
        show = x > 24 && x < w - 24 && y > 40 && y < ht - 12;
        if (show) pin.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    }
    if (show !== pinShown) {
      pinShown = show;
      pin.classList.toggle('on', show);
    }
  }

  // ---- DOM variables -------------------------------------------------------
  function setVar(el: HTMLElement, name: string, value: number, digits = 3) {
    el.style.setProperty(name, value.toFixed(digits));
  }
  function updateSections(y: number, i: number) {
    for (let k = 0; k < sections.length; k++) {
      const el = sections[k],
        r = ranges[k],
        cache = sectionVars[k];
      if (Math.abs(k - i) > 1 && cache.vis === 0) continue;
      // Offset of the sticky frame from its pinned position, in viewports.
      const offset =
        y < r.top
          ? (r.top - y) / vh
          : y > r.top + r.height - vh
            ? -(y - (r.top + r.height - vh)) / vh
            : 0;
      const enter = Math.max(-1, Math.min(1, offset));
      const vis = 1 - smoothstep(0.1, 0.4, Math.abs(offset));
      const p = progressAt(k, y);
      if (Math.abs(vis - cache.vis) > 0.002 || vis === 0 || vis === 1) {
        if (vis !== cache.vis) setVar(el, '--vis', vis);
        cache.vis = vis;
      }
      if (Math.abs(enter - cache.enter) > 0.002) {
        setVar(el, '--enter', enter);
        cache.enter = enter;
      }
      if (Math.abs(p - cache.p) > 0.001) {
        setVar(el, '--p', p);
        cache.p = p;
      }
    }
  }
  function setRootVar(name: keyof typeof rootVars, value: number) {
    if (Math.abs(rootVars[name] - value) < 0.001) return;
    rootVars[name] = value;
    root.style.setProperty('--' + name, value.toFixed(4));
  }
  const beatOf = (kind: BeatKind) => beats.findIndex((b) => b.kind === kind);
  const highlightCount = beats.filter((b) => b.kind === 'highlight').length,
    lastHighlight = beats.findLastIndex((b) => b.kind === 'highlight');
  function updateChrome(y: number, i: number, p: number) {
    const team = beatOf('team'),
      first = beatOf('chapter'),
      finale = beatOf('finale'),
      network = beatOf('network'),
      peace = beatOf('peace');
    const at = (k: number) => (k >= 0 ? ranges[k].start : 1e9);
    const out = 1 - smoothstep(at(finale) - 0.45 * vh, at(finale) + 0.05 * vh, y);
    setRootVar('ui', Math.min(smoothstep(at(team) - 0.35 * vh, at(team) + 0.15 * vh, y), out));
    setRootVar('rail', Math.min(smoothstep(at(first) - 0.3 * vh, at(first) + 0.1 * vh, y), out));
    // The finale's swimlane sits on a veiled stage; the network aerial lifts it.
    setRootVar(
      'veil',
      Math.min(
        smoothstep(at(finale) - 0.2 * vh, at(finale) + 0.5 * vh, y),
        1 - smoothstep(at(network) - 0.3 * vh, at(network) + 0.3 * vh, y),
      ),
    );
    // Late-afternoon warmth over the closing beat.
    setRootVar('glow', smoothstep(at(peace) - 0.2 * vh, at(peace) + 0.7 * vh, y));
    setRootVar('open', 1 - smoothstep(0.35 * vh, 1.1 * vh, y));
    // Highlights progress, 0 to their count (fills the segmented bar).
    const b = beats[i];
    setRootVar(
      'hl',
      b.kind === 'highlight' ? (b.highlightIndex ?? 0) + p : i > lastHighlight ? highlightCount : 0,
    );
    root.classList.toggle('story-ui-on', rootVars.ui > 0.02);
    root.classList.toggle('story-rail-on', rootVars.rail > 0.02);
    root.classList.toggle('story-hl-on', b.kind === 'highlight');
  }

  // ---- loop ------------------------------------------------------------------
  function tick(now: number) {
    frame = 0;
    const dt = lastNow ? Math.min(0.1, Math.max(0.001, (now - lastNow) / 1000)) : 1 / 60;
    lastNow = now;
    if (!ranges.length) measure();
    const y = window.scrollY;
    const scrolled = y !== lastY;
    lastY = y;
    const i = locate(y),
      p = progressAt(i, y);
    if (scrolled) {
      updateSections(y, i);
      updateChrome(y, i, p);
    }
    if (i !== beatIndex) {
      const from = beatIndex;
      beatIndex = i;
      phase = -1;
      hooks.onBeat(i);
      // A cut (into or out of a highlight): the transition covers the stage,
      // then everything swaps under it.
      if (from >= 0 && (isCutBeat(beats[from]) || isCutBeat(beats[i]))) {
        const cover = viewer && !reduced ? hooks.onCut?.(i > from ? 1 : -1) || 0 : 0;
        if (cover > 0) {
          if (heldBeat < 0) heldBeat = from;
          coverAt = now + cover;
        } else {
          heldBeat = -1;
          snapNext = true;
        }
      }
    }
    const b = beats[i];
    const n = b.step?.handoffs.length || 0;
    let ph = 0;
    for (let k = 0; k < n; k++) if (p >= handoffAt(k, n)) ph = k + 1;
    // Finale: swimlane columns reveal with scroll, then the totals.
    if (b.kind === 'finale')
      ph = Math.floor(smoothstep(0.2, 0.66, p) * (chapterCount + 1.01) + 0.0001);
    if (ph !== phase) {
      phase = ph;
      hooks.onPhase(ph);
    }
    // While a cut covers in, the stage holds the beat it is leaving; once
    // covered, clock, view and camera jump to the new beat in one frame.
    const covering = heldBeat >= 0 && now < coverAt;
    if (heldBeat >= 0 && !covering) {
      heldBeat = -1;
      snapNext = true;
    }
    if (covering) {
      placeHeroPin(-1, time);
      idleFrames = 0;
      if (running) frame = requestAnimationFrame(tick);
      return;
    }
    const snapped = snapNext;
    snapNext = false;
    // Sim clock eases toward the scroll-determined time (it jumps on a cut).
    const goalTime = Math.min(LAST_TIME, timeAt(i, p));
    lastGoalTime = goalTime;
    const k = reduced || snapped ? 1 : 1 - Math.exp(-dt * 7);
    time += (goalTime - time) * k;
    if (Math.abs(goalTime - time) < 0.01) time = goalTime;
    const m = Math.floor(time * (clock.dayDurationMinutes / clock.duration));
    if (m !== minute) {
      minute = m;
      hooks.onClock(time);
    }
    setRootVar('day', time / clock.duration);
    let busy = Math.abs(goalTime - time) > 0.001;
    if (viewer) {
      if (Math.abs(time - timeSet) > 0.004) {
        timeSet = time;
        viewer.activity.setOptions({ time });
      }
      const view = viewFor(i, p, time);
      const key = `${view.level}|${view.walls}|${view.roof}|${view.exterior}|${view.stack}|${view.room}|${view.selected}`;
      if (key !== viewKey) {
        viewKey = key;
        viewer.update(view);
      }
      const goal = targetShot(i, y, time);
      lastGoal = goal;
      if (stepCamera(goal, dt, !cam || snapped, snapped)) busy = true;
      viewer.setShot(cam as CameraShot);
      placeHeroPin(i, time);
    }
    idleFrames = scrolled || busy ? 0 : idleFrames + 1;
    // Sleep once everything has settled; scroll/resize wake the loop.
    if (running && idleFrames < 20) frame = requestAnimationFrame(tick);
    else running = false;
  }
  function wake() {
    if (document.hidden) return;
    idleFrames = 0;
    if (!running) {
      running = true;
      lastNow = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      running = false;
    } else wake();
  };
  const onScroll = () => wake();
  const onResize = () => measure();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => measure());
  ro.observe(root);

  return {
    measure,
    wake,
    setReducedMotion(on: boolean) {
      reduced = on;
      wake();
    },
    attach(v: Viewer, m: Facility, hero: string | null, host: HTMLElement) {
      viewer = v;
      model = m;
      heroId = hero;
      stage = host;
      anchors.clear();
      for (const z of m.zones) {
        const l = m.levels.find((l) => l.id === z.levelId);
        const c = centroid(z.polygon);
        anchors.set(z.id, [c[0], (l?.elevation || 0) + 0.8, c[1]]);
      }
      for (const r of m.rooms) {
        const l = m.levels.find((l) => l.id === r.levelId);
        const c = centroid(r.polygon);
        anchors.set(r.id, [c[0], (l?.elevation || 0) + 0.8, c[1]]);
      }
      cam = null;
      viewKey = '';
      timeSet = -1;
      lastY = -1;
      wake();
    },
    /**
     * Current camera and clock, and the goals the springs are easing toward
     * (for tuning shots from the console with ?debug=1).
     */
    debug: () => ({
      cam,
      goal: lastGoal,
      time,
      goalTime: lastGoalTime,
      beat: beatIndex,
      y: window.scrollY,
    }),
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      viewer = null;
    },
  };
}
export type Director = ReturnType<typeof createDirector>;

function centroid(p: [number, number][]): [number, number] {
  // Area-weighted centroid (falls back to the vertex mean for degenerate rings).
  let a = 0,
    cx = 0,
    cz = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    a += f;
    cx += (p[j][0] + p[i][0]) * f;
    cz += (p[j][1] + p[i][1]) * f;
  }
  if (Math.abs(a) < 1e-6)
    return [
      p.reduce((s, q) => s + q[0], 0) / p.length,
      p.reduce((s, q) => s + q[1], 0) / p.length,
    ];
  return [cx / (3 * a), cz / (3 * a)];
}
