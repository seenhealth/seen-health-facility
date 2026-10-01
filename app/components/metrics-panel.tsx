'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Area, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Pause, Play, X } from 'lucide-react';
import {
  activityData,
  type ActivitySnapshot,
  type ActivitySource,
  type ActorSpec,
} from '../model/activity';
import { roleNames } from '../model/characters';
import type { Facility } from '../model/schema';
import type { createViewer } from '../model/renderer';
import {
  computeMetrics,
  disciplines,
  staffActivityLabels,
  type SimMetrics,
  type StaffActivity,
} from '../sim/metrics';
import { clockLabel, hourTicks } from '../sim/clock';
import type { CompiledStep } from '../sim/tracks';
import {
  dwellIntervals,
  personJourney,
  traceSummary,
  traceTouchpoints,
  type TouchpointEvent,
  type TouchpointKind,
} from '../sim/trace';

type Viewer = ReturnType<typeof createViewer>;
/** Occupancy series (validated pair on the panel surface). */
const PARTICIPANT = '#c8662c',
  STAFF = '#3f6db3';
/** Staff time, stacked in this fixed order (validated adjacent pairs). */
const STAFF_ORDER: { key: StaffActivity; color: string; label: string }[] = [
  { key: 'care', color: '#008a7c', label: 'Direct care & programs' },
  { key: 'meeting', color: '#6a55c2', label: 'Team meetings' },
  { key: 'walking', color: '#c8741c', label: 'Walking & escorting' },
  { key: 'documenting', color: '#c0507e', label: 'Documenting & standby' },
  { key: 'driving', color: '#4f8fd1', label: 'Driving' },
];
const SMALL_MULTIPLES = 8,
  CHART_W = 188,
  CHART_H = 54;
type Story = { source: ActivitySource; heroId: string; steps: CompiledStep[] };
type Scenario = 'base' | 'story';
type Tab = 'measure' | 'trace';
const pct = (v: number) => `${Math.round(v * 100)}%`;
const minutes = (seconds: number) =>
  Math.round((seconds * activityData.dayDurationMinutes) / activityData.duration);

// ---------------------------------------------------------------------------
// Trace tab
// ---------------------------------------------------------------------------
/** Sampling interval for the in-browser trace (the report uses 1 s). */
const TRACE_STEP = 2;
type TraceFilter = 'all' | 'care' | 'moves';
const CARE_KINDS = new Set<TouchpointKind>([
  'interaction-start',
  'interaction-end',
  'handoff',
  'encounter',
]);
/** Quiet rows: the list reads by its care events; movement is context. */
const MUTED_KINDS = new Set<TouchpointKind>(['leave', 'off-site', 'day-end']);
/** Event-kind markers reuse the panel's validated hues; labels carry the meaning. */
const KIND_COLOR: Record<TouchpointKind, string> = {
  'interaction-start': '#008a7c',
  'interaction-end': '#008a7c',
  handoff: '#c0507e',
  encounter: '#6a55c2',
  enter: '#c8741c',
  leave: '#c8741c',
  board: '#4f8fd1',
  alight: '#4f8fd1',
  'on-site': '#4f8fd1',
  'off-site': '#4f8fd1',
  'day-start': '#7b928d',
  'day-end': '#7b928d',
};
const SITE_COLOR = '#8e9d9a';
/** "Mrs. Lin · check-in" → "check-in" when the person is the title's subject. */
const ownTitle = (title = '', actorLabel: string) => {
  for (const prefix of [actorLabel, actorLabel.split(' · ')[0]])
    if (title.startsWith(`${prefix} · `)) return title.slice(prefix.length + 3);
  return title;
};
function describe(
  e: TouchpointEvent,
  vehicleLabel: (id: string) => string,
  /** At a home or partner site rather than the center. */
  away = false,
): string {
  switch (e.kind) {
    case 'day-start':
      return 'Day begins';
    case 'day-end':
      return 'Day ends';
    case 'on-site':
      return away ? 'Comes into view' : 'Arrives on site';
    case 'off-site':
      return away ? 'Goes out of view' : 'Leaves the site';
    case 'enter':
      return 'Enters';
    case 'leave':
      return 'Leaves';
    case 'board':
      return `Boards ${vehicleLabel(e.vehicleId ?? '')}`;
    case 'alight':
      return `Steps off ${vehicleLabel(e.vehicleId ?? '')}`;
    case 'interaction-start':
      return `${ownTitle(e.title, e.actorLabel)} begins`;
    case 'interaction-end':
      return `${ownTitle(e.title, e.actorLabel)} ends · ${minutes(e.durationSeconds ?? 0)} min`;
    case 'encounter':
      return `Together ${minutes(e.durationSeconds ?? 0)} min`;
    case 'handoff':
      return `Handoff ${e.title ?? ''}`;
  }
}

/** One person's touchpoints: picker, counters, zone strip, timeline, export. */
function TraceTab({
  model,
  source,
  events,
  scenario,
  heroId,
  time,
  seek,
  getViewer,
}: {
  model: Facility;
  source: ActivitySource;
  events: TouchpointEvent[];
  scenario: Scenario;
  heroId?: string;
  time: number;
  seek: (t: number) => void;
  getViewer: () => Viewer | null;
}) {
  const [query, setQuery] = useState(''),
    [picked, setPicked] = useState<string | null>(null),
    [filter, setFilter] = useState<TraceFilter>('all');
  const people = useMemo(() => {
    const byLabel = (a: ActorSpec, b: ActorSpec) => a.label.localeCompare(b.label);
    return {
      participants: source.actors.filter((a) => a.role === 'participant').sort(byLabel),
      staff: source.actors.filter((a) => a.role !== 'participant').sort(byLabel),
    };
  }, [source]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.actorId, (m.get(e.actorId) || 0) + 1);
    return m;
  }, [events]);
  const defaultId = useMemo(() => {
    if (heroId && counts.has(heroId)) return heroId;
    let best = people.participants[0]?.id ?? source.actors[0].id;
    for (const p of people.participants)
      if ((counts.get(p.id) || 0) > (counts.get(best) || 0)) best = p.id;
    return best;
  }, [heroId, counts, people, source]);
  const actorId = picked && counts.has(picked) ? picked : defaultId;
  const journey = useMemo(() => personJourney(events, actorId), [events, actorId]);
  const names = useMemo(
    () => new Map(source.actors.map((a) => [a.id, a.label] as const)),
    [source],
  );
  // Facility zones, plus the places a composed source adds (homes, partner sites).
  const zoneOf = useCallback(
    (id: string) =>
      model.zones.find((z) => z.id === id) ?? source.zones?.find((z) => z.id === id),
    [model, source],
  );
  const zoneName = (id: string) =>
    id === 'site' ? 'Street & vans' : (zoneOf(id)?.name ?? id);
  const zoneColor = (id: string) =>
    (id !== 'site' && zoneOf(id)?.color) || SITE_COLOR;
  const vehicleLabel = (id: string) => getViewer()?.activity.vehicles.label(id) ?? id;
  const roomName = (id: string | null | undefined) =>
    id ? model.rooms.find((r) => r.id === id)?.name : undefined;
  const place = (e: TouchpointEvent) => roomName(e.roomId) || zoneName(e.zoneId);
  const q = query.trim().toLowerCase();
  const matches = (a: ActorSpec) =>
    !q || `${a.label} ${a.id} ${roleNames[a.role]}`.toLowerCase().includes(q);
  // Zone stays, merged across rooms of the same zone for the strip.
  const stays = useMemo(() => {
    const out: { zoneId: string; start: number; end: number }[] = [];
    for (const d of dwellIntervals(journey.events)) {
      const last = out[out.length - 1];
      if (last && last.zoneId === d.zoneId && Math.abs(last.end - d.start) < 1e-6)
        last.end = d.end;
      else out.push({ zoneId: d.zoneId, start: d.start, end: d.end });
    }
    return out.filter((s) => s.end > s.start);
  }, [journey]);
  const shown = journey.events.filter((e) =>
    filter === 'all' ? true : filter === 'care' ? CARE_KINDS.has(e.kind) : !CARE_KINDS.has(e.kind),
  );
  let current = -1;
  for (let i = 0; i < shown.length; i++) if (shown[i].t <= time) current = i;
  // Keep the current entry in view inside the list (never scrolling the page).
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current,
      li = list?.children[current] as HTMLElement | undefined;
    if (!list || !li) return;
    const r = li.getBoundingClientRect(),
      b = list.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom)
      list.scrollTop += r.top - b.top - (b.height - r.height) / 2;
  }, [current, actorId, filter]);
  const duration = source.duration;
  const ticks = hourTicks().filter((_, i, a) => i === 0 || i === a.length - 1 || i === 4);
  const inScene = !!getViewer()?.activity.actorSample(actorId);
  const go = (t: number) => {
    seek(t);
    if (inScene) getViewer()?.followActor(actorId);
  };
  const download = () => {
    const payload = {
      version: 1,
      title: 'Touchpoint trace',
      scenario: scenario === 'story' ? 'With Mrs. Lin’s day' : 'Care-day loop',
      basis:
        'Derived from the animated care-day tracks (app/sim/trace.ts). Composite, illustrative data; not participant records.',
      clock: {
        duration: source.duration,
        dayStartMinutes: source.dayStartMinutes,
        dayDurationMinutes: source.dayDurationMinutes,
      },
      step: TRACE_STEP,
      summary: traceSummary(events, source),
      events,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `touchpoint-trace-${scenario}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const who = (e: TouchpointEvent) => {
    const list = (e.with || []).map((id) => names.get(id) ?? id);
    return list.length > 2 ? `${list.slice(0, 2).join(', ')} +${list.length - 2}` : list.join(', ');
  };
  const option = (a: ActorSpec) => (
    <option key={a.id} value={a.id}>
      {a.label} · {counts.get(a.id) || 0}
    </option>
  );
  return (
    <>
      <div className="mp-section-head">
        <h3>Who</h3>
        <span className="mp-scale">
          {people.participants.length} participants, {people.staff.length} staff · n = events
        </span>
      </div>
      <div className="mp-picker">
        <input
          type="search"
          placeholder="Search people by name or role"
          aria-label="Search people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          size={4}
          aria-label="Person to trace"
          value={actorId}
          onChange={(e) => setPicked(e.target.value)}
        >
          <optgroup label="Participants">{people.participants.filter(matches).map(option)}</optgroup>
          <optgroup label="Staff">{people.staff.filter(matches).map(option)}</optgroup>
        </select>
      </div>

      <div className="mp-kpis">
        <div>
          <span>Events</span>
          <b>{journey.events.length}</b>
          <small>{journey.interactions} interactions</small>
        </div>
        <div>
          <span>Encounters</span>
          <b>{journey.encounters}</b>
          <small>within 1.6 m, 4 s+</small>
        </div>
        <div>
          <span>Disciplines</span>
          <b>{journey.disciplines.length}</b>
          <small>of {disciplines.length} on the IDT</small>
        </div>
      </div>

      <div className="mp-section-head">
        <h3>{journey.label}</h3>
        <span className="mp-scale">
          {roleNames[journey.role]}
          {journey.firstOnSite !== undefined && journey.lastOnSite !== undefined
            ? ` · on site ${clockLabel(journey.firstOnSite)}–${clockLabel(journey.lastOnSite)}`
            : ' · not on site'}
        </span>
      </div>
      <div className="mp-strip">
        {stays.map((s) => (
          <button
            key={`${s.zoneId}-${s.start}`}
            style={{
              left: `${(s.start / duration) * 100}%`,
              width: `calc(${((s.end - s.start) / duration) * 100}% - 2px)`,
              background: zoneColor(s.zoneId),
            }}
            title={`${zoneName(s.zoneId)} · ${clockLabel(s.start)}–${clockLabel(s.end)}`}
            aria-label={`${zoneName(s.zoneId)} from ${clockLabel(s.start)} to ${clockLabel(s.end)}; jump there`}
            onClick={() => go(s.start)}
          />
        ))}
        <div className="mp-now" style={{ left: `${(time / duration) * 100}%` }} />
      </div>
      <div className="mp-axis mp-trace-axis" aria-hidden>
        {ticks.map((t) => (
          <span key={t.t} style={{ left: `${(t.t / duration) * 100}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      <p className="mp-legend wrap">
        {journey.zones.slice(0, 6).map((z) => (
          <span key={z.zoneId}>
            <i className="bar" style={{ background: zoneColor(z.zoneId) }} />
            {zoneName(z.zoneId)} {minutes(z.seconds)} min
          </span>
        ))}
        {journey.zones.length > 6 && <span>+{journey.zones.length - 6} more</span>}
      </p>

      <div className="mp-section-head">
        <h3>Timeline</h3>
        <fieldset className="mp-segment small">
          <legend>Events shown</legend>
          {(
            [
              ['all', 'All'],
              ['care', 'Care & encounters'],
              ['moves', 'Movement'],
            ] as [TraceFilter, string][]
          ).map(([k, label]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </fieldset>
      </div>
      <ol className="mp-timeline" aria-label={`${journey.label}’s timeline`} ref={listRef}>
        {shown.map((e, i) => (
          <li
            key={`${i}-${e.t}-${e.kind}`}
            className={MUTED_KINDS.has(e.kind) ? 'muted' : ''}
            aria-current={i === current ? 'step' : undefined}
          >
            <button onClick={() => go(e.t)}>
              <time>{e.clock}</time>
              <span className="what">
                <i style={{ background: KIND_COLOR[e.kind] }} />
                {describe(
                  e,
                  vehicleLabel,
                  !!source.zones?.some((z) => z.id === e.zoneId),
                )}
              </span>
              <span className="where">
                {place(e)}
                {e.with?.length ? ` · with ${who(e)}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mp-readout">
        Click an entry to set the clock there
        {inScene ? ' and follow this person.' : '. This person is only in the story scene; the viewer keeps playing the base loop.'}
      </p>
      <button className="mp-download" onClick={download}>
        <Download size={14} /> Download trace (JSON)
      </button>
      <p className="mp-note">
        Every person in the scene ({source.actors.length} tracks: the center, the fleet
        crew and the community settings) sampled every {TRACE_STEP} s: zone and room
        entries, van boarding, interactions, encounters within 1.6 m for 4 s or more,
        and staff handoffs. Derived from the animated tracks; composite, illustrative
        data.
      </p>
    </>
  );
}

/** One zone's occupancy over the day; memoised so playback only moves the marker. */
const ZoneSpark = memo(function ZoneSpark({
  data,
  yMax,
  onSeek,
}: {
  data: { t: number; p: number; s: number }[];
  yMax: number;
  onSeek: (t: number) => void;
}) {
  return (
    <ComposedChart
      width={CHART_W}
      height={CHART_H}
      data={data}
      margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
      onClick={(e) => {
        const t = Number(e?.activeLabel);
        if (Number.isFinite(t)) onSeek(t);
      }}
    >
      <XAxis dataKey="t" type="number" domain={[0, activityData.duration]} hide />
      <YAxis domain={[0, yMax]} hide />
      <Tooltip
        cursor={{ stroke: '#8fa7a0', strokeWidth: 1 }}
        isAnimationActive={false}
        content={({ active, payload, label }) =>
          active && payload?.length ? (
            <div className="mp-tip">
              <strong>{clockLabel(Number(label))}</strong>
              <span>
                <i style={{ background: PARTICIPANT }} />
                <b>{payload.find((x) => x.dataKey === 'p')?.value as number}</b>{' '}
                participants
              </span>
              <span>
                <i style={{ background: STAFF }} />
                <b>{payload.find((x) => x.dataKey === 's')?.value as number}</b> staff
              </span>
            </div>
          ) : null
        }
      />
      <Area
        dataKey="p"
        type="stepAfter"
        stroke={PARTICIPANT}
        strokeWidth={2}
        fill={PARTICIPANT}
        fillOpacity={0.12}
        isAnimationActive={false}
        dot={false}
        activeDot={{ r: 4, stroke: '#fbfcfa', strokeWidth: 2 }}
      />
      <Line
        dataKey="s"
        type="stepAfter"
        stroke={STAFF}
        strokeWidth={2}
        isAnimationActive={false}
        dot={false}
        activeDot={{ r: 4, stroke: '#fbfcfa', strokeWidth: 2 }}
      />
    </ComposedChart>
  );
});

/**
 * Measure: occupancy by zone, staff time by role and (for the story scenario)
 * the hero's touchpoints, with a current-time marker synced to the viewer.
 * The Trace tab lists one person's touchpoint events end to end.
 */
export default function MetricsPanel({
  model,
  ready,
  getViewer,
  onClose,
}: {
  model: Facility;
  ready: boolean;
  getViewer: () => Viewer | null;
  onClose: () => void;
}) {
  const [snap, setSnap] = useState<ActivitySnapshot | null>(null),
    [scenario, setScenario] = useState<Scenario>('base'),
    [tab, setTab] = useState<Tab>('measure'),
    [story, setStory] = useState<Story | null>(null),
    [table, setTable] = useState(false),
    [hover, setHover] = useState<{ role: string; key: StaffActivity } | null>(
      null,
    );
  useEffect(() => {
    if (!ready) return;
    return getViewer()?.activity.subscribe(setSnap);
  }, [ready, getViewer]);
  useEffect(() => {
    if (scenario !== 'story' || story) return;
    let live = true;
    void import('../sim/story-source').then((m) => {
      if (live) setStory({ ...m.composedStorySource(model), steps: m.storySteps() });
    });
    return () => {
      live = false;
    };
  }, [scenario, story, model]);
  const active = scenario === 'story' ? story : null;
  // Measure what the viewer plays: its composed source (center loop, fleet
  // crew, community settings) and its vehicles, so riders sit in their seats.
  const scene = ready ? getViewer()?.activity : undefined;
  const source = active?.source || scene?.data || activityData;
  const vehicles = scene?.vehicles;
  const metrics: SimMetrics | null = useMemo(() => {
    if (scenario === 'story' && !active) return null;
    return computeMetrics(source, model, {
      step: 2,
      heroId: active?.heroId,
      steps: active?.steps,
      vehicles,
    });
  }, [scenario, active, source, vehicles, model]);
  const trace: TouchpointEvent[] | null = useMemo(() => {
    if (tab !== 'trace' || (scenario === 'story' && !active)) return null;
    return traceTouchpoints(source, model, { step: TRACE_STEP, vehicles });
  }, [tab, scenario, active, source, vehicles, model]);
  const time = snap?.time ?? 0,
    playing = !!snap?.playing;
  const seek = useCallback(
    (t: number) => getViewer()?.activity.setOptions({ time: t, enabled: true }),
    [getViewer],
  );
  const zones = useMemo(() => {
    if (!metrics) return [];
    return metrics.zones.slice(0, SMALL_MULTIPLES).map((z) => ({
      ...z,
      data: metrics.times
        .map((t, i) => ({ t, p: z.participants[i], s: z.staff[i] }))
        .filter((_, i) => i % 3 === 0),
    }));
  }, [metrics]);
  const yMax = Math.max(
    4,
    ...zones.map((z) => Math.max(z.peakParticipants, z.peakStaff)),
  );
  const at = metrics
    ? Math.min(metrics.times.length - 1, Math.floor(time / metrics.step))
    : 0;
  const ticks = hourTicks().filter((_, i, a) => i === 0 || i === a.length - 1 || i === 4);
  const roles = (metrics?.roles || []).filter((r) => r.onFloorSeconds > 0);
  const hovered = hover && roles.find((r) => r.role === hover.role);
  const hero = metrics?.hero;
  return (
    <section className="metrics-panel" aria-label="Measure the care day">
      <header className="mp-head">
        <div>
          <span className="overline">MEASURE</span>
          <strong>{tab === 'trace' ? 'Touchpoint trace' : 'Care-day metrics'}</strong>
        </div>
        <button aria-label="Close measurements" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <div className="mp-tabs">
        <fieldset className="mp-segment">
          <legend>Panel</legend>
          <button aria-pressed={tab === 'measure'} onClick={() => setTab('measure')}>
            Metrics
          </button>
          <button aria-pressed={tab === 'trace'} onClick={() => setTab('trace')}>
            Trace
          </button>
        </fieldset>
        <span className="mp-scale">
          {tab === 'trace' ? 'one person, end to end' : 'occupancy · staff time · care team'}
        </span>
      </div>
      <div className="mp-controls">
        <fieldset className="mp-segment">
          <legend>Scenario measured</legend>
          <button
            aria-pressed={scenario === 'base'}
            onClick={() => setScenario('base')}
          >
            Care-day loop
          </button>
          <button
            aria-pressed={scenario === 'story'}
            onClick={() => setScenario('story')}
          >
            With Mrs. Lin’s day
          </button>
        </fieldset>
        <div className="mp-clock">
          <button
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() =>
              getViewer()?.activity.setOptions({ playing: !playing, enabled: true })
            }
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <output aria-live="off">{clockLabel(time)}</output>
        </div>
      </div>
      {tab === 'trace' ? (
        !trace ? (
          <p className="mp-note">Tracing the scenario…</p>
        ) : (
          <TraceTab
            model={model}
            source={source}
            events={trace}
            scenario={scenario}
            heroId={active?.heroId}
            time={time}
            seek={seek}
            getViewer={getViewer}
          />
        )
      ) : !metrics ? (
        <p className="mp-note">Loading the scenario…</p>
      ) : (
        <>
          <div className="mp-kpis">
            <div>
              <span>Participants on site</span>
              <b>{metrics.onSite.participants[at]}</b>
              <small>peak {metrics.headline.peakParticipantsOnSite}</small>
            </div>
            <div>
              <span>Staff on site</span>
              <b>{metrics.onSite.staff[at]}</b>
              <small>peak {metrics.headline.peakStaffOnFloor}</small>
            </div>
            <div>
              <span>Staff in direct care</span>
              <b>{pct(metrics.headline.staffCareShare)}</b>
              <small>{pct(metrics.headline.staffWalkingShare)} walking</small>
            </div>
          </div>

          <div className="mp-section-head">
            <h3>Who is where</h3>
            <fieldset className="mp-segment small">
              <legend>Occupancy view</legend>
              <button aria-pressed={!table} onClick={() => setTable(false)}>
                Chart
              </button>
              <button aria-pressed={table} onClick={() => setTable(true)}>
                Table
              </button>
            </fieldset>
          </div>
          <p className="mp-legend">
            <span>
              <i className="area" style={{ borderColor: PARTICIPANT, background: `${PARTICIPANT}1f` }} />
              Participants
            </span>
            <span>
              <i className="line" style={{ background: STAFF }} />
              Staff
            </span>
            <span className="mp-scale">0–{yMax} people · click to jump</span>
          </p>
          {table ? (
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Now</th>
                  <th>Peak</th>
                  <th>Person-hours</th>
                </tr>
              </thead>
              <tbody>
                {metrics.zones.map((z) => (
                  <tr key={z.zoneId}>
                    <td>{z.name}</td>
                    <td>
                      {z.participants[at]} · {z.staff[at]}
                    </td>
                    <td>
                      {z.peakParticipants} · {z.peakStaff}
                    </td>
                    <td>
                      {(z.participantMinutes / 60).toFixed(1)} ·{' '}
                      {(z.staffMinutes / 60).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Participants · staff</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="mp-multiples">
              {zones.map((z) => (
                <figure key={z.zoneId}>
                  <figcaption>
                    <span>{z.name.replace(' · 1421', '')}</span>
                    <b>
                      {z.participants[at]}
                      <em>·</em>
                      {z.staff[at]}
                    </b>
                  </figcaption>
                  <div className="mp-spark">
                    <ZoneSpark data={z.data} yMax={yMax} onSeek={seek} />
                    <div
                      className="mp-now"
                      style={{ left: `${(time / metrics.duration) * 100}%` }}
                    />
                  </div>
                </figure>
              ))}
              <div className="mp-axis" aria-hidden>
                {ticks.map((t) => (
                  <span key={t.t} style={{ left: `${(t.t / metrics.duration) * 100}%` }}>
                    {t.label}
                  </span>
                ))}
              </div>
              <div className="mp-axis" aria-hidden>
                {ticks.map((t) => (
                  <span key={t.t} style={{ left: `${(t.t / metrics.duration) * 100}%` }}>
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mp-section-head">
            <h3>How staff spend the day</h3>
            <span className="mp-scale">share of time on duty</span>
          </div>
          <p className="mp-legend wrap">
            {STAFF_ORDER.map((s) => (
              <span key={s.key}>
                <i className="bar" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </p>
          <div className="mp-bars" onPointerLeave={() => setHover(null)}>
            {roles.map((r) => (
              <div className="mp-bar-row" key={r.role}>
                <span className="mp-role">
                  {r.label}
                  <small>×{r.headcount}</small>
                </span>
                <div className="mp-bar">
                  {STAFF_ORDER.filter((s) => r.share[s.key] > 0.004).map((s) => (
                    <button
                      key={s.key}
                      className={
                        hover?.role === r.role && hover.key === s.key ? 'on' : ''
                      }
                      style={{ flexGrow: r.share[s.key], background: s.color }}
                      aria-label={`${r.label}: ${s.label} ${pct(r.share[s.key])}`}
                      onPointerEnter={() => setHover({ role: r.role, key: s.key })}
                      onFocus={() => setHover({ role: r.role, key: s.key })}
                      onBlur={() => setHover(null)}
                    />
                  ))}
                </div>
                <b>{pct(r.share.care)}</b>
              </div>
            ))}
          </div>
          <p className="mp-readout" aria-live="polite">
            {hovered && hover ? (
              <>
                <b>{pct(hovered.share[hover.key])}</b> {hovered.label.toLowerCase()} ·{' '}
                {staffActivityLabels[hover.key].toLowerCase()} ·{' '}
                {minutes(hovered.seconds[hover.key] / hovered.headcount)} min per person ·{' '}
                {Math.round(hovered.meanWalkMeters)} m walked
              </>
            ) : (
              'Hover a bar for minutes and walking distance. Care share at right.'
            )}
          </p>

          {hero && (
            <>
              <div className="mp-section-head">
                <h3>Mrs. Lin’s care team today</h3>
                <span className="mp-scale">
                  {hero.disciplinesSeen} of 11 disciplines ·{' '}
                  {metrics.handoffs?.total ?? 0} handoffs
                </span>
              </div>
              <ul className="mp-touch">
                {[...hero.touchpoints]
                  .sort((a, b) => (a.firstAt ?? 1e9) - (b.firstAt ?? 1e9))
                  .map((t) => (
                    <li key={t.discipline} className={t.episodes ? '' : 'none'}>
                      <i style={{ background: t.color }} />
                      <b>{t.short}</b>
                      <span>
                        {t.episodes
                          ? `${Math.round(t.minutes)} min · from ${clockLabel(t.firstAt ?? 0)}`
                          : 'at the IDT meetings'}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="mp-note">
                {Math.round(hero.walkMeters)} m on foot with her cane ·{' '}
                {minutes(hero.time.seconds.moving)} min walking between stops. The
                scene still shows the base loop; this measures the story scenario.
              </p>
            </>
          )}
          <p className="mp-note">
            Measured by sampling the animated tracks of all {metrics.headline.people}{' '}
            people every {metrics.step} s of the 12-minute loop (8 AM–4 PM). Occupancy
            includes the homes and partner sites; on-site counts and staff time cover the
            center. Composite, illustrative data.
          </p>
        </>
      )}
    </section>
  );
}
