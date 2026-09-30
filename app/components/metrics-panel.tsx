'use client';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Area, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts';
import { Pause, Play, X } from 'lucide-react';
import {
  activityData,
  type ActivitySnapshot,
  type ActivitySource,
} from '../model/activity';
import type { Facility } from '../model/schema';
import type { createViewer } from '../model/renderer';
import {
  computeMetrics,
  staffActivityLabels,
  type SimMetrics,
  type StaffActivity,
} from '../sim/metrics';
import { clockLabel, hourTicks } from '../sim/clock';
import type { CompiledStep } from '../sim/tracks';

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
const pct = (v: number) => `${Math.round(v * 100)}%`;
const minutes = (seconds: number) =>
  Math.round((seconds * activityData.dayDurationMinutes) / activityData.duration);

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
      if (live) setStory({ ...m.storyActivitySource(), steps: m.storySteps() });
    });
    return () => {
      live = false;
    };
  }, [scenario, story]);
  const active = scenario === 'story' ? story : null;
  const metrics: SimMetrics | null = useMemo(() => {
    if (scenario === 'story' && !active) return null;
    return computeMetrics(active?.source || activityData, model, {
      step: 2,
      heroId: active?.heroId,
      steps: active?.steps,
    });
  }, [scenario, active, model]);
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
          <strong>Care-day metrics</strong>
        </div>
        <button aria-label="Close measurements" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
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
      {!metrics ? (
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
            Measured by sampling the animated tracks every {metrics.step} s of the
            12-minute loop (8 AM–4 PM). Composite, illustrative data.
          </p>
        </>
      )}
    </section>
  );
}
