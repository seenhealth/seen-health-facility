import type { CameraShot, ViewerState, createViewer } from '../model/renderer';
import type { Facility } from '../model/schema';
import {
  CHAPTER_SHOTS,
  DEFAULT_CHAPTER_SHOT,
  FINALE_SHOT,
  OPENING_SHOT,
  REVEAL_SHOT,
  TEAM_SHOT,
  clamp01,
  easeInOut,
  mixShots,
  smoothstep,
  stepRoom,
  stepTime,
  stopBlend,
  unwrap,
  type Shot,
  type ShotSpec,
} from './choreography';
import { clock, type Step } from './data';

export type Viewer = ReturnType<typeof createViewer>;
export type BeatKind = 'opening' | 'reveal' | 'team' | 'chapter' | 'finale' | 'cta';
export type BeatDef = { kind: BeatKind; step?: Step; stepIndex?: number };
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
  const vel = { x: 0, y: 0, z: 0, zoom: 0, az: 0, el: 0 };
  let viewKey = '';
  const sectionVars = sections.map(() => ({ vis: -1, enter: 99, p: -1 }));
  const rootVars = { ui: -1, rail: -1, veil: -1, day: -1, open: -1 };

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
    if (b.kind === 'chapter' && b.step) return stepTime(b.step, p);
    if (b.kind === 'finale' || b.kind === 'cta') return LAST_TIME;
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
    if (b.kind === 'team') return INTERIOR;
    if (b.kind === 'finale' || b.kind === 'cta') return EXTERIOR;
    const s = b.step!;
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
    if (b.kind === 'chapter' && b.step)
      return CHAPTER_SHOTS[b.step.id] || DEFAULT_CHAPTER_SHOT;
    return FINALE_SHOT;
  }
  /** A fresh anchor array (callers adjust it in place). */
  function anchorFor(b: BeatDef, spec: ShotSpec, t: number): [number, number, number] {
    if (spec.anchor || !b.step) return spec.anchor ? [...spec.anchor] : [0, 0, 0];
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
  function shotFor(i: number, p: number, t: number): Shot {
    const b = beats[i],
      spec = specFor(i);
    const target = anchorFor(b, spec, t);
    if (viewer && heroId && b.step?.heroPresent && spec.follow) {
      const h = viewer.activity.actorPosition(heroId);
      if (h) {
        const d = Math.hypot(h.x - target[0], h.z - target[2]),
          r = spec.radius || 8,
          w = spec.follow * (1 - smoothstep(r * 0.7, r, d));
        target[0] += (h.x - target[0]) * w;
        target[1] += (h.y - target[1]) * w;
        target[2] += (h.z - target[2]) * w;
      }
    }
    const pp = b.kind === 'cta' ? 1 : p;
    const zoom =
      spec.zoom * (1 + ((spec.push || 1) - 1) * pp) * (opts.framing(b.kind).zoom || 1);
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
    if (i < beats.length - 1 && y > r.end - band) {
      const k = easeInOut(clamp01((y - (r.end - band)) / (2 * band)));
      return mixShots(here, shotFor(i + 1, 0, t), k);
    }
    if (i > 0 && y < r.start + band) {
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
  function stepCamera(goal: Shot, dt: number, snap: boolean) {
    if (!cam || snap || reduced) {
      cam = { ...goal, target: [...goal.target] };
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
  function placeHeroPin(i: number, t: number) {
    const pin = opts.heroPin;
    if (!pin) return;
    const b = beats[i];
    let show = false;
    if (viewer && heroId && cam && stage && b.kind === 'chapter' && b.step?.heroPresent) {
      const h = viewer.activity.actorPosition(heroId);
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
  function updateChrome(y: number) {
    const team = beats.findIndex((b) => b.kind === 'team'),
      first = beats.findIndex((b) => b.kind === 'chapter'),
      finale = beats.findIndex((b) => b.kind === 'finale');
    const at = (i: number) => (i >= 0 ? ranges[i].start : 1e9);
    const out = 1 - smoothstep(at(finale) - 0.45 * vh, at(finale) + 0.05 * vh, y);
    setRootVar('ui', Math.min(smoothstep(at(team) - 0.35 * vh, at(team) + 0.15 * vh, y), out));
    setRootVar('rail', Math.min(smoothstep(at(first) - 0.3 * vh, at(first) + 0.1 * vh, y), out));
    setRootVar('veil', smoothstep(at(finale) - 0.2 * vh, at(finale) + 0.5 * vh, y));
    setRootVar('open', 1 - smoothstep(0.35 * vh, 1.1 * vh, y));
    root.classList.toggle('story-ui-on', rootVars.ui > 0.02);
    root.classList.toggle('story-rail-on', rootVars.rail > 0.02);
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
      updateChrome(y);
    }
    if (i !== beatIndex) {
      beatIndex = i;
      phase = -1;
      hooks.onBeat(i);
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
    // Sim clock eases toward the scroll-determined time.
    const goalTime = Math.min(LAST_TIME, timeAt(i, p));
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
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
      const snap = !cam;
      if (stepCamera(goal, dt, snap)) busy = true;
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
    /** Current camera (for tuning shots from the console with ?debug=1). */
    debug: () => ({ cam, time, beat: beatIndex, y: window.scrollY }),
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
