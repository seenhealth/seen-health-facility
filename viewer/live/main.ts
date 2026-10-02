/// <reference types="vite/client" />
// Keep first: rebases the app's root-relative asset URLs before any app code runs.
import '../site/asset-base';
import { validateFacility } from '../../app/model/schema';
import { createViewer } from '../../app/model/renderer';
import { createLiveLot, type LiveMessage } from '../../app/model/live-lot';

/**
 * Static page that shows Seen's real vehicles on the Alhambra lot. A parent
 * page embeds it and posts `{ type: 'seen-live-lot', vehicles, capacity, clock }`
 * (app/model/live-lot.ts); this page answers `{ type: 'seen-live-lot-ready' }`
 * once the scene is up so the parent sends the current state.
 */
async function main() {
  const host = document.getElementById('root')!;
  const hud = document.getElementById('hud')!;
  const model = validateFacility(await (await fetch('/models/seen-alhambra-planning.json')).json());
  let lot: ReturnType<typeof createLiveLot> | null = null;
  const viewer = createViewer(host, model, () => {}, {
    interactive: true,
    labels: false,
    layer: (ctx) => (lot = createLiveLot(ctx)),
  });
  // No care-day cast: only the building, the streets and the live vehicles.
  viewer.activity.setOptions({ enabled: false, playing: false, time: 180 });
  viewer.setShot({ target: [-27, 0, -15], zoom: 2.05, azimuth: -2.35, elevation: 0.72 });
  let pending: LiveMessage | null = null;
  const onMessage = (e: MessageEvent) => {
    const msg = e.data as LiveMessage | undefined;
    if (!msg || msg.type !== 'seen-live-lot') return;
    if (lot) lot.apply(msg);
    else pending = msg;
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
    const demo = (eta: number | null, state: 'inbound' | 'on-lot'): LiveMessage => ({
      type: 'seen-live-lot',
      capacity: 8,
      clock: '13:05',
      vehicles: [
        { id: 'v1', kind: 'van', label: '11825 · Lim, Linda', detail: `ETA ${eta ?? 0} min · 3 riders`, state, etaMinutes: eta },
        { id: 'v2', kind: 'suv', label: '11818 · Chen, Andrew', detail: 'departs 13:30 · 2 riders', state: 'on-lot' },
        { id: 'v3', kind: 'sedan', label: '2979 · Xu, Mark', detail: 'ETA 2 min · 1 rider', state: 'inbound', etaMinutes: 2, highlight: true },
        { id: 'v4', kind: 'wav', label: '11821 · Ng, Ka Lun', detail: 'departs 14:00', state: 'on-lot' },
      ],
    });
    setTimeout(() => window.postMessage(demo(6, 'inbound'), '*'), 500);
    setTimeout(() => window.postMessage(demo(0, 'inbound'), '*'), 9000);
    setTimeout(() => window.postMessage(demo(null, 'on-lot'), '*'), 16000);
  }
  // Keep the HUD's lot count fresh while vehicles animate between states.
  setInterval(() => {
    if (!lot || !hud.innerHTML.includes('on the lot')) return;
    hud.innerHTML = hud.innerHTML.replace(/<b>\d+<\/b>/, `<b>${lot.onLot}</b>`);
  }, 1000);
}
void main();
