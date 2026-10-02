/// <reference types="vite/client" />
// Keep first: rebases the app's root-relative asset URLs before any app code runs.
import '../site/asset-base';
import { validateFacility } from '../../app/model/schema';
import { createViewer, defaultState } from '../../app/model/renderer';
import { createLiveLot, type LiveMessage } from '../../app/model/live-lot';
import { createDaylight } from '../../app/model/daylight';
import { createNightLights } from '../../app/model/night-lights';

/**
 * Static page that shows Seen's real vehicles on the Alhambra lot. A parent
 * page embeds it and posts `{ type: 'seen-live-lot', vehicles, capacity, clock }`
 * (app/model/live-lot.ts); this page answers `{ type: 'seen-live-lot-ready' }`
 * once the scene is up so the parent sends the current state. A message with
 * `follow: <vehicle id>` centres the camera on that car and keeps it centred as
 * it moves; `follow: null` returns to the whole-lot shot. Camera moves glide
 * (eased over ~0.8 s; following tracks the car smoothly). A click on a car
 * posts `{ type: 'seen-live-lot-pick', id }` to the parent, a click on nothing
 * posts `{ id: null }`, so the parent can show the car's details or clear them. The scene is lit by
 * the real sun over the center (app/model/daylight.ts), refreshed every
 * minute; `?at=HH:MM` or `?at=<ISO date>` lights it for another moment. After
 * dusk the street lamps, wall packs, entrance lights and lit windows come on
 * (app/model/night-lights.ts) and the vehicles drive with their lamps lit.
 */
async function main() {
  const host = document.getElementById('root')!;
  const hud = document.getElementById('hud')!;
  const model = validateFacility(
    await (await fetch('/models/seen-alhambra-planning.json')).json(),
  );
  let lot: ReturnType<typeof createLiveLot> | null = null;
  let daylight: ReturnType<typeof createDaylight> | null = null;
  let nightLights: ReturnType<typeof createNightLights> | null = null;
  const viewer = createViewer(host, model, () => {}, {
    interactive: true,
    labels: false,
    pick: (ray) => {
      const id = lot?.pick(ray) ?? null;
      window.parent?.postMessage({ type: 'seen-live-lot-pick', id }, '*');
      return true;
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
  // Real sun and sky for the moment being shown; `?at=` pins another moment for review.
  const at = new URLSearchParams(location.search).get('at');
  const momentNow = () => {
    if (!at) return new Date();
    const hm = /^(\d{1,2}):(\d{2})$/.exec(at);
    if (!hm) return new Date(at);
    const d = new Date();
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d;
  };
  const relight = () => {
    const st = daylight?.apply(momentNow());
    if (!st) return;
    nightLights?.apply(st.night);
    lot?.setNight(st.night);
  };
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
          zoom: 1.22,
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
  const setFollow = (id: string | null) => {
    if (id === follow) return;
    follow = id;
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
  let pending: LiveMessage | null = null;
  const onMessage = (e: MessageEvent) => {
    const msg = e.data as LiveMessage | undefined;
    if (!msg || msg.type !== 'seen-live-lot') return;
    if (lot) lot.apply(msg);
    else pending = msg;
    setFollow(msg.follow ?? null);
    const n = lot?.onLot ?? 0;
    hud.innerHTML = `<b>${n}</b> / ${msg.capacity ?? '?'} on the lot${msg.clock ? ` · ${msg.clock}` : ''} · ${msg.vehicles.filter((v) => v.state === 'inbound').length} inbound`;
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
          state,
          etaMinutes: eta,
          driver: { name: 'Linda', initials: 'LL' },
          riders: [
            { name: 'May', initials: 'MC', risk: 'high' },
            { name: 'Ray', initials: 'RT', risk: 'assisted', wheelchair: true },
            { name: 'Jun', initials: 'JW', risk: 'standard' },
          ],
        },
        {
          id: 'v2',
          kind: 'suv',
          label: '11818 · Chen, Andrew',
          detail: 'dep 25 min · 2 riders',
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
