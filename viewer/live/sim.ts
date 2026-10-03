import type {
  LiveKind,
  LivePerson,
  LiveVehicle,
} from '../../app/model/live-lot';

/**
 * Vehicle simulator for the live lot (`?debug=true`): a panel that adds
 * made-up vans, lift vans, SUVs and sedans and walks them through a visit, so
 * the docking, doors, ramp, boarding and departures can be watched without a
 * real vehicle doing it. Simulated vehicles are merged into every lot update
 * next to the real ones (main.ts), so on the VTC page they share the lot with
 * live traffic. Nothing leaves the page: the dispatch app never sees them.
 *
 * A vehicle arrives `inbound` (ETA 0 drives straight to the drop-off, more
 * waits up the street), unloads at the drop-off and backs into a bay on its
 * own; Board sets it `on-lot` with its riders walking out to it (a lift van
 * deploys its ramp for a wheelchair rider); Away sends it off.
 */
type Sim = { v: LiveVehicle; riders: LivePerson[] };

const KINDS: [LiveKind, string][] = [
  ['wav', 'Lift van'],
  ['van', 'Van'],
  ['suv', 'SUV'],
  ['sedan', 'Sedan'],
];

export function createSimPanel(opts: {
  /** Called with the simulated vehicles whenever they change. */
  onChange: (vehicles: LiveVehicle[]) => void;
  /** Centre the camera on a vehicle (null: the whole lot). */
  follow: (id: string | null) => void;
}) {
  const sims: Sim[] = [];
  let next = 1;
  const panel = document.createElement('div');
  panel.id = 'sim';
  panel.style.cssText =
    'position:absolute;right:12px;top:12px;z-index:7;width:260px;max-height:calc(100% - 90px);overflow:auto;' +
    'padding:10px;font:12px/1.35 system-ui,sans-serif;color:#1f2a2a;background:rgba(255,255,255,.94);' +
    'border:1px solid rgba(31,42,42,.15);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.18)';
  const css = document.createElement('style');
  css.textContent =
    '#sim button,#sim select,#sim input{font:12px system-ui,sans-serif;color:#1f2a2a;border:1px solid rgba(31,42,42,.25);border-radius:6px;background:#fff;height:24px}' +
    '#sim button{padding:0 7px;cursor:pointer}#sim button:hover{background:#eef3f1}' +
    '#sim .go{background:#2f6b62;border-color:#2f6b62;color:#fff}#sim .go:hover{background:#285c54}' +
    '#sim .row{display:flex;align-items:center;gap:6px;margin-top:6px}#sim label{display:flex;align-items:center;gap:4px}' +
    '#sim .veh{border-top:1px solid rgba(31,42,42,.12);margin-top:8px;padding-top:6px}' +
    '#sim .veh .name{font-weight:600}#sim .veh .state{color:#4a5a58}#sim .acts{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}';
  document.head.appendChild(css);
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b style="font-size:13px">Simulate vehicles</b>
      <button type="button" data-act="clear" title="Remove every simulated vehicle">Clear</button>
    </div>
    <div class="row">
      <select data-f="kind">${KINDS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
      <label title="Riders on board when it arrives">Riders <input data-f="riders" type="number" min="0" max="6" value="2" style="width:42px"></label>
    </div>
    <div class="row">
      <label title="First rider uses a wheelchair"><input data-f="wc" type="checkbox" checked style="height:auto"> Wheelchair</label>
      <label title="Minutes out; 0 drives straight in">ETA <input data-f="eta" type="number" min="0" max="12" value="0" style="width:42px"> min</label>
    </div>
    <div class="row"><button type="button" class="go" data-act="add" style="flex:1">Arrive</button></div>
    <div data-list></div>`;
  document.body.appendChild(panel);
  const field = (f: string) =>
    panel.querySelector(`[data-f="${f}"]`) as HTMLInputElement;
  const kindSelect = panel.querySelector(
    'select[data-f="kind"]',
  ) as unknown as {
    value: string;
  };
  const list = panel.querySelector<HTMLDivElement>('[data-list]')!;

  const emit = () => {
    opts.onChange(sims.map((s) => s.v));
    render();
  };
  const describe = (s: Sim) =>
    s.v.state === 'inbound'
      ? s.v.etaMinutes
        ? `inbound · ${s.v.etaMinutes} min`
        : 'arriving (unloads, then parks)'
      : s.v.state === 'on-lot'
        ? s.v.riders?.some((r) => r.boarding)
          ? 'on the lot · boarding'
          : 'on the lot'
        : 'leaving';
  function render() {
    list.innerHTML = sims
      .map(
        (s, i) => `<div class="veh" data-i="${i}">
        <div><span class="name">${s.v.label}</span> <span class="state">${describe(s)}</span></div>
        <div class="acts">
          ${s.v.state === 'inbound' && s.v.etaMinutes ? '<button type="button" data-act="now">Arrive now</button>' : ''}
          ${s.v.state !== 'away' ? `<button type="button" data-act="board" title="Riders walk out from the lobby and board">Board${s.riders.length ? ` ${s.riders.length}` : ''}</button>` : ''}
          ${s.v.state !== 'away' ? '<button type="button" data-act="away">Away</button>' : '<button type="button" data-act="back">Arrive again</button>'}
          <button type="button" data-act="follow">Follow</button>
          <button type="button" data-act="remove" title="Remove">✕</button>
        </div></div>`,
      )
      .join('');
  }
  function add() {
    const kind = kindSelect.value as LiveKind;
    const count = Math.max(0, Math.min(6, Number(field('riders').value) || 0));
    const wc = field('wc').checked;
    const eta = Math.max(0, Math.min(12, Number(field('eta').value) || 0));
    const n = next++;
    const riders: LivePerson[] = Array.from({ length: count }, (_, i) => {
      const letter = String.fromCharCode(65 + i);
      const chair = wc && i === 0;
      return {
        name: `Rider ${letter}`,
        initials: `R${letter}`,
        fullName: `Simulated rider ${letter}`,
        risk: chair ? 'assisted' : 'standard',
        wheelchair: chair,
        lines: [chair ? 'Wheelchair' : 'Standard risk', 'Simulated'],
      };
    });
    const name = KINDS.find(([k]) => k === kind)![1];
    sims.push({
      riders,
      v: {
        id: `sim-${n}`,
        kind,
        label: `SIM ${n} · ${name}`,
        detail: `${eta ? `${eta} min` : 'arriving'} · ${count} rider${count === 1 ? '' : 's'}`,
        lines: ['Simulated vehicle (?debug)'],
        state: 'inbound',
        etaMinutes: eta,
        driver: { name: `Sim ${n}`, initials: `S${n}` },
        riders,
      },
    });
    emit();
  }
  panel.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-act]',
    );
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'add') return add();
    if (act === 'clear') {
      sims.length = 0;
      return emit();
    }
    const i = Number(btn.closest<HTMLElement>('[data-i]')?.dataset.i);
    const s = sims[i];
    if (!s) return;
    if (act === 'now') s.v = { ...s.v, etaMinutes: 0, detail: 'arriving' };
    else if (act === 'board')
      s.v = {
        ...s.v,
        state: 'on-lot',
        etaMinutes: null,
        detail: `boarding ${s.riders.length}`,
        riders: s.riders.map((r) => ({ ...r, boarding: true })),
      };
    else if (act === 'away') s.v = { ...s.v, state: 'away', detail: 'away' };
    else if (act === 'back')
      s.v = {
        ...s.v,
        state: 'inbound',
        etaMinutes: 0,
        detail: 'arriving',
        riders: s.riders,
      };
    else if (act === 'follow') return opts.follow(s.v.id);
    else if (act === 'remove') sims.splice(i, 1);
    emit();
  });
  render();
  return {
    get vehicles() {
      return sims.map((s) => s.v);
    },
  };
}
