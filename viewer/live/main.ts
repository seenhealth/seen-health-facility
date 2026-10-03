/// <reference types="vite/client" />
// Keep first: rebases the app's root-relative asset URLs before any app code runs.
import '../site/asset-base';
import { validateFacility } from '../../app/model/schema';
import { createViewer, defaultState } from '../../app/model/renderer';
import { createLiveLot, type LiveMessage } from '../../app/model/live-lot';
import { createDaylight } from '../../app/model/daylight';
import { createNightLights } from '../../app/model/night-lights';
import {
  preloadFleetVanModel,
  preloadLiveCarModels,
} from '../../app/model/fleet-van-model';
import { createSimPanel } from './sim';

/**
 * Static page that shows Seen's real vehicles on the Alhambra lot. A parent
 * page embeds it and posts `{ type: 'seen-live-lot', vehicles, capacity, clock }`
 * (app/model/live-lot.ts); this page answers `{ type: 'seen-live-lot-ready' }`
 * once the scene is up so the parent sends the current state. A message with
 * `follow: <vehicle id>` centres the camera on that car and keeps it centred as
 * it moves and opens its plate into a details bubble; `follow: null` returns
 * to the whole-lot shot and closes it. Camera moves glide (eased over ~0.8 s;
 * following tracks the car smoothly). A click on a car or its plate posts
 * `{ type: 'seen-live-lot-pick', id }` to the parent, a click on nothing posts
 * `{ id: null }`, so the parent decides what to follow (standalone, the page
 * follows the car itself). Hovering a car or plate dims every other one to
 * half. A controls button in the corner unfolds zoom, pan, rotate, tilt and a
 * Perspective toggle (flat drawing or a camera's view), plus
 * buttons and a time-of-day slider. The scene is lit by the real sun over the
 * center (app/model/daylight.ts), refreshed every minute; `?at=HH:MM` or
 * `?at=<ISO date>` lights it for another moment, and the slider overrides
 * both until Now is pressed. After dusk the street lamps, wall packs, entrance
 * lights and lit windows come on (app/model/night-lights.ts) and the vehicles
 * drive with their lamps lit.
 */
async function main() {
  const host = document.getElementById('root')!;
  const hud = document.getElementById('hud')!;
  const [model] = await Promise.all([
    fetch('/models/seen-alhambra-planning.json')
      .then((r) => r.json())
      .then(validateFacility),
    // The photo-textured fleet van; vans fall back to the procedural body if it fails.
    preloadFleetVanModel(),
    preloadLiveCarModels(),
  ]);
  let lot: ReturnType<typeof createLiveLot> | null = null;
  let daylight: ReturnType<typeof createDaylight> | null = null;
  let nightLights: ReturnType<typeof createNightLights> | null = null;
  const viewer = createViewer(host, model, () => {}, {
    interactive: true,
    labels: false,
    pick: (ray) => {
      const id = lot?.pick(ray) ?? null;
      // Embedded, the parent owns the focus (it answers with `follow`); standalone, the page follows the car itself.
      if (window.parent && window.parent !== window)
        window.parent.postMessage({ type: 'seen-live-lot-pick', id }, '*');
      else setFollow(id && id !== follow ? id : null);
      return true;
    },
    hover: (ray) => {
      const id = lot?.hover(ray) ?? null;
      host.style.cursor = id ? 'pointer' : '';
    },
    layer: (ctx) => {
      // `?debug=1` exposes the scene for inspection from the console.
      if (new URLSearchParams(location.search).has('debug'))
        (window as unknown as { seenScene?: unknown }).seenScene = ctx.scene;
      daylight = createDaylight(ctx.scene);
      nightLights = createNightLights(ctx.scene, ctx.material);
      lot = createLiveLot(ctx);
      if (new URLSearchParams(location.search).has('debug'))
        (window as unknown as { seenLot?: unknown }).seenLot = lot;
      return lot;
    },
  });
  // `?debug=1` also exposes the viewer (setShot, getShot) for scripted close-ups and lets the wheel zoom in much
  // further (to the decals on the door).
  if (new URLSearchParams(location.search).has('debug')) {
    (window as unknown as { seenViewer?: unknown }).seenViewer = viewer;
    viewer.setMaxZoom(150);
  }
  // Real sun and sky for the moment being shown; `?at=` pins another moment for review, and the time slider in the
  // controls panel overrides both until Now is pressed.
  const parseAt = (at: string | null): Date | null => {
    if (!at) return null;
    const hm = /^(\d{1,2}):(\d{2})$/.exec(at);
    if (!hm) return new Date(at);
    const d = new Date();
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d;
  };
  let atOverride = parseAt(new URLSearchParams(location.search).get('at'));
  const momentNow = () => atOverride ?? new Date();
  const relight = () => {
    const st = daylight?.apply(momentNow());
    if (!st) return;
    nightLights?.apply(st.night);
    lot?.setNight(st.night);
    const m = momentNow();
    const hhmm = `${String(m.getHours()).padStart(2, '0')}:${String(m.getMinutes()).padStart(2, '0')}`;
    timeLabel.textContent = atOverride ? `${hhmm} (set)` : hhmm;
    if (document.activeElement !== timeSlider)
      timeSlider.value = String(m.getHours() * 60 + m.getMinutes());
  };
  const timeSlider = document.getElementById('ctl-time') as HTMLInputElement;
  const timeLabel = document.getElementById('ctl-time-label')!;
  timeSlider.addEventListener('input', () => {
    const d = new Date();
    const n = Number(timeSlider.value);
    d.setHours(Math.floor(n / 60), n % 60, 0, 0);
    atOverride = d;
    relight();
  });
  document.getElementById('ctl-now')!.addEventListener('click', () => {
    atOverride = null;
    relight();
  });
  relight();
  setInterval(relight, 60_000);
  // No care-day cast and no community pads: only the center, its streets and the live vehicles.
  viewer.activity.setOptions({ enabled: false, playing: false, time: 180 });
  viewer.update({ ...defaultState, labels: false, community: false });
  // The whole lot from the south-west, high enough to read the stalls, the entrance and the drop-off. The viewer re-frames the site once its textures load, so the shot is held for
  // the first seconds unless the person has started orbiting or zooming themselves.
  // `?shot=x,z,zoom,azimuth,elevation` overrides the lot shot, for reviewing other sides of the center.
  const override = new URLSearchParams(location.search)
    .get('shot')
    ?.split(',')
    .map(Number);
  const SHOT =
    override &&
    override.length === 5 &&
    override.every((n) => Number.isFinite(n))
      ? {
          target: [override[0], 0, override[1]] as [number, number, number],
          zoom: override[2],
          azimuth: override[3],
          elevation: override[4],
        }
      : {
          target: [-21, 0, -3] as [number, number, number],
          zoom: 1.45,
          azimuth: -2.35,
          elevation: 0.9,
        };
  viewer.setShot(SHOT);
  let touched = false;
  host.addEventListener(
    'pointerdown',
    () => {
      touched = true;
    },
    { once: true },
  );
  host.addEventListener(
    'wheel',
    () => {
      touched = true;
    },
    { once: true, passive: true },
  );
  const hold = setInterval(() => {
    if (touched) return clearInterval(hold);
    const s = viewer.getShot();
    const off =
      Math.abs(s.zoom - SHOT.zoom) > 0.02 ||
      Math.hypot(s.target[0] - SHOT.target[0], s.target[2] - SHOT.target[2]) >
        0.5;
    if (off) viewer.setShot(SHOT);
  }, 250);
  setTimeout(() => clearInterval(hold), 20_000);
  // Labels keep their on-screen size whatever the zoom, and their layout follows the camera's angles.
  setInterval(() => {
    const s = viewer.getShot();
    lot?.setLabelScale(SHOT.zoom / Math.max(0.2, s.zoom));
    lot?.setViewAngles(s.azimuth, s.elevation);
  }, 250);
  // Camera moves glide: a transition eases every part of the shot over `GLIDE_MS`; while following, the target then
  // tracks the car with exponential smoothing each frame, keeping whatever zoom and angle the person has set, so they
  // can still orbit a parked car. The first follow zooms in; clearing it glides back to the lot shot.
  const FOLLOW_ZOOM = 2.6;
  const GLIDE_MS = 800;
  type Shot = ReturnType<typeof viewer.getShot>;
  let follow: string | null = null;
  let glide: { from: Shot; to: Shot; start: number } | null = null;
  const ease = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  const lerpAngle = (a: number, b: number, k: number) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  };
  const glideTo = (to: Shot) => {
    glide = { from: viewer.getShot(), to, start: performance.now() };
  };
  let onFollowChange: ((id: string | null) => void) | null = null;
  const setFollow = (id: string | null) => {
    if (id === follow) return;
    follow = id;
    onFollowChange?.(id);
    lot?.setExpanded(id);
    touched = true; // a follow is the person's own framing; the start-up hold must not undo it
    if (!id) glideTo(SHOT);
    else {
      const at = lot?.positionOf(id);
      const s = viewer.getShot();
      if (at)
        glideTo({
          target: [at[0], 0, at[1]],
          zoom: Math.max(s.zoom, FOLLOW_ZOOM),
          azimuth: s.azimuth,
          elevation: s.elevation,
        });
    }
  };
  let lastFrame = performance.now();
  const camera = () => {
    requestAnimationFrame(camera);
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (glide) {
      const k = ease(Math.min(1, (now - glide.start) / GLIDE_MS));
      const { from, to } = glide;
      viewer.setShot({
        target: [0, 1, 2].map(
          (i) => from.target[i] + (to.target[i] - from.target[i]) * k,
        ) as [number, number, number],
        zoom: from.zoom + (to.zoom - from.zoom) * k,
        azimuth: lerpAngle(from.azimuth, to.azimuth, k),
        elevation: from.elevation + (to.elevation - from.elevation) * k,
      });
      if (k >= 1) glide = null;
      return;
    }
    if (!follow || !lot) return;
    const at = lot.positionOf(follow);
    if (!at) return;
    const s = viewer.getShot();
    const dx = at[0] - s.target[0],
      dz = at[1] - s.target[2];
    if (Math.hypot(dx, dz) < 0.01) return;
    const k = 1 - Math.exp(-dt * 7);
    viewer.setShot({
      ...s,
      target: [s.target[0] + dx * k, 0, s.target[2] + dz * k],
    });
  };
  requestAnimationFrame(camera);
  // Controls panel: folded behind the ⚙ button; zoom, rotate, tilt and pan nudge the current shot with a glide, Whole
  // lot returns to the lot shot (and keeps following the car if one is followed: only the framing is reset).
  const panel = document.getElementById('ctl')!;
  const toggle = document.getElementById('ctl-toggle')!;
  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  const nudge = (f: (s: Shot) => Partial<Shot>) => {
    touched = true;
    const s = glide ? glide.to : viewer.getShot();
    glideTo({ ...s, ...f(s) });
  };
  const PAN = 10; // metres at zoom 1
  const on = (id: string, fn: () => void) =>
    document.getElementById(id)!.addEventListener('click', fn);
  // `?debug` lets the button zoom on in to the building's details, as the wheel does.
  const zoomCap = new URLSearchParams(location.search).has('debug') ? 150 : 8;
  on('ctl-zoom-in', () =>
    nudge((s) => ({ zoom: Math.min(zoomCap, s.zoom * 1.3) })),
  );
  on('ctl-zoom-out', () =>
    nudge((s) => ({ zoom: Math.max(0.4, s.zoom / 1.3) })),
  );
  on('ctl-rot-l', () => nudge((s) => ({ azimuth: s.azimuth + Math.PI / 8 })));
  on('ctl-rot-r', () => nudge((s) => ({ azimuth: s.azimuth - Math.PI / 8 })));
  on('ctl-tilt-up', () =>
    nudge((s) => ({ elevation: Math.min(1.5, s.elevation + 0.15) })),
  );
  on('ctl-tilt-down', () =>
    nudge((s) => ({ elevation: Math.max(0.2, s.elevation - 0.15) })),
  );
  // Pan in the camera's frame: "up" moves the target away from the camera along the view, "right" across it.
  const pan = (dx: number, dy: number) =>
    nudge((s) => {
      const d = PAN / Math.max(0.3, s.zoom);
      const fx = -Math.sin(s.azimuth),
        fz = -Math.cos(s.azimuth);
      const rx = Math.cos(s.azimuth),
        rz = -Math.sin(s.azimuth);
      return {
        target: [
          s.target[0] + (fx * dy + rx * dx) * d,
          s.target[1],
          s.target[2] + (fz * dy + rz * dx) * d,
        ],
      };
    });
  on('ctl-pan-up', () => pan(0, 1));
  on('ctl-pan-down', () => pan(0, -1));
  on('ctl-pan-left', () => pan(-1, 0));
  on('ctl-pan-right', () => pan(1, 0));
  on('ctl-reset', () => {
    touched = true;
    glideTo(SHOT);
  });
  // Perspective: the lot drawn as a camera sees it, with depth, instead of the flat orthographic shot. Zoom, pan and
  // the follow carry over. Remembered per browser; `?view=perspective` starts in it.
  const perspBtn = document.getElementById('ctl-persp')!;
  const PROJECTION_KEY = 'seen-live-lot-projection';
  const setProjection = (perspective: boolean) => {
    viewer.setProjection(perspective ? 'perspective' : 'orthographic');
    perspBtn.setAttribute('aria-pressed', String(perspective));
    try {
      localStorage.setItem(
        PROJECTION_KEY,
        perspective ? 'perspective' : 'orthographic',
      );
    } catch {
      // Private window or storage blocked: the choice just does not persist.
    }
  };
  perspBtn.addEventListener('click', () =>
    setProjection(perspBtn.getAttribute('aria-pressed') !== 'true'),
  );
  let savedProjection: string | null = null;
  try {
    savedProjection = localStorage.getItem(PROJECTION_KEY);
  } catch {
    savedProjection = null;
  }
  if (
    savedProjection === 'perspective' ||
    new URLSearchParams(location.search).get('view') === 'perspective'
  )
    setProjection(true);
  let pending: LiveMessage | null = null;
  // `?debug=true`: the vehicle simulator (sim.ts). Its vehicles ride along with every update from the dispatch board.
  const debugParam = new URLSearchParams(location.search).get('debug');
  let lastReal: LiveMessage | null = null;
  let lastParentFollow: string | null = null;
  const sim =
    debugParam !== null && !/^(0|false|no)$/i.test(debugParam)
      ? createSimPanel({
          onChange: () => show(lastReal),
          follow: (id) => setFollow(id),
        })
      : null;
  if (sim) onFollowChange = (id) => sim.setFollowed(id);
  const show = (real: LiveMessage | null) => {
    const base: LiveMessage = real ?? {
      type: 'seen-live-lot',
      vehicles: [],
      capacity: 12,
    };
    const msg: LiveMessage = sim
      ? { ...base, vehicles: [...base.vehicles, ...sim.vehicles] }
      : base;
    if (lot) lot.apply(msg);
    else pending = msg;
    const n = lot?.onLot ?? 0;
    hud.innerHTML = `<b>${n}</b> / ${msg.capacity ?? '?'} on the lot${msg.clock ? ` · ${msg.clock}` : ''} · ${msg.vehicles.filter((v) => v.state === 'inbound').length} inbound${sim?.vehicles.length ? ` · ${sim.vehicles.length} simulated` : ''}`;
  };
  const onMessage = (e: MessageEvent) => {
    const msg = e.data as LiveMessage | undefined;
    if (!msg || msg.type !== 'seen-live-lot') return;
    lastReal = msg;
    show(msg);
    // Only a change of the parent's follow moves the camera: the board re-posts its (unchanged) follow with every
    // update, which would otherwise drop a follow started here (a click on a car, the simulator's Follow).
    const parentFollow = msg.follow ?? null;
    if (parentFollow !== lastParentFollow) setFollow(parentFollow);
    lastParentFollow = parentFollow;
  };
  window.addEventListener('message', onMessage);
  const ready = () => {
    if (!lot) return requestAnimationFrame(ready);
    if (pending) lot.apply(pending);
    window.parent?.postMessage({ type: 'seen-live-lot-ready' }, '*');
  };
  ready();
  // `?demo=1`: a few vehicles so the page can be looked at without the dispatch app.
  if (new URLSearchParams(location.search).get('demo')) {
    const demo = (
      eta: number | null,
      state: 'inbound' | 'on-lot',
    ): LiveMessage => ({
      type: 'seen-live-lot',
      capacity: 8,
      clock: '13:05',
      vehicles: [
        {
          id: 'v1',
          kind: 'van',
          label: '11825 · Lim, Linda',
          detail: `${eta ? `${eta} min` : 'arriving'} · 3 riders`,
          lines: [
            'Van · 6 seats · (626) 555-0118',
            'Reporting · last fix 1 min ago · En route',
            'Today 4 done · 3 to go',
            'Next 2:30 PM · May Chen, Ray Tan',
            'Shift 7:00 AM to 4:00 PM',
            'Load now',
          ],
          state,
          etaMinutes: eta,
          driver: { name: 'Linda', initials: 'LL' },
          riders: [
            {
              name: 'May',
              initials: 'MC',
              risk: 'high',
              fullName: 'May Chen',
              subtitle: '陈美',
              lines: [
                'High risk · Fall risk · Wandering',
                'Appointment 2:30 PM · Day Center',
                'Picked up 1:35 PM · ETA 1:41 PM',
                'From 123 N Garfield Ave, Alhambra',
                'Phone (626) 555-0101',
                'Ride back 4:00 PM · 11825 · Lim, Linda',
                'Not checked in today',
              ],
            },
            {
              name: 'Ray',
              initials: 'RT',
              risk: 'assisted',
              wheelchair: true,
              fullName: 'Ray Tan',
              lines: [
                'Needs assistance · Wheelchair',
                'Picked up 1:50 PM · ETA 1:52 PM',
                'From 400 S Atlantic Blvd, Monterey Park',
                'Ride back 4:00 PM · no car yet',
                'Not checked in today',
              ],
            },
            {
              name: 'Jun',
              initials: 'JW',
              risk: 'standard',
              fullName: 'Jun Wang',
              lines: [
                'Standard risk',
                'Picked up 2:05 PM',
                'From 15 N 3rd St, Alhambra',
                'In the building (check-in)',
              ],
            },
          ],
        },
        {
          id: 'v2',
          kind: 'suv',
          label: '11818 · Chen, Andrew',
          detail: 'dep 25 min · 2 riders',
          lines: [
            'SUV · 4 seats',
            'Reporting · last fix 0 min ago · At center',
            'Today 2 done · 4 to go',
            'Next 1:30 PM · Dan Fong, Gail Yu',
            'Hold 12 min',
          ],
          state: 'on-lot',
          driver: { name: 'Andrew', initials: 'AC' },
          riders: [
            { name: 'Dan', initials: 'DF', risk: 'standard', boarding: true },
            { name: 'Gail', initials: 'GY', risk: 'high' },
          ],
        },
        {
          id: 'v3',
          kind: 'sedan',
          label: '2979 · Xu, Mark',
          detail: '2 min · 1 rider',
          lines: [
            'Sedan · 3 seats · (626) 555-0142',
            'Reporting · last fix 0 min ago · En route',
            'Today 1 done · 5 to go',
            'Lot full at landing (8/8)',
          ],
          state: 'inbound',
          etaMinutes: 2,
          highlight: true,
          driver: { name: 'Mark', initials: 'MX' },
          riders: [{ name: 'Ann', initials: 'AH', risk: 'standard' }],
        },
        {
          id: 'v4',
          kind: 'wav',
          label: '11821 · Ng, Ka Lun',
          detail: 'dep 55 min',
          lines: [
            'Lift van · 5 seats · (626) 555-0177',
            'Stale · last fix 9 min ago · At center',
            'Today 3 done · 2 to go',
            'Next 2:00 PM · Bo Liu (WC), Ida Wong',
            'Shift 8:00 AM to 5:00 PM',
            'Hold 40 min',
          ],
          state: 'on-lot',
          driver: { name: 'Ka Lun', initials: 'KN' },
        },
      ],
    });
    setTimeout(() => window.postMessage(demo(6, 'inbound'), '*'), 500);
    setTimeout(() => window.postMessage(demo(0, 'inbound'), '*'), 9000);
    setTimeout(() => window.postMessage(demo(null, 'on-lot'), '*'), 16000);
    // Then the SUV's second rider checks in and walks out to board.
    setTimeout(() => {
      const m = demo(null, 'on-lot');
      m.vehicles[1].riders![1].boarding = true;
      window.postMessage(m, '*');
    }, 40000);
  }
  // Keep the HUD's lot count fresh while vehicles animate between states.
  setInterval(() => {
    if (!lot || !hud.innerHTML.includes('on the lot')) return;
    hud.innerHTML = hud.innerHTML.replace(/<b>\d+<\/b>/, `<b>${lot.onLot}</b>`);
  }, 1000);
}
void main();
