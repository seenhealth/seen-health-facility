'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  Pause,
  Play,
  RotateCcw,
  Users,
  X,
  Rows3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  activityData,
  dayTime,
  timelineFor,
  type ActivitySnapshot,
} from '../model/activity';
import { roleNames, roleColors, characterLibrary } from '../model/characters';
import { vanWindows } from '../model/arrival';
import { dayProgram, programAt } from '../model/day-room';
import type { createViewer } from '../model/renderer';

export const activityViews = [
  { id: 'site', label: 'Arrivals & reception' },
  { id: 'clinic', label: 'Doctors & nurses' },
  { id: 'rehab', label: 'PT & OT' },
  { id: 'day', label: 'Activities' },
  { id: 'dining', label: 'Meals' },
  { id: 'upper-office', label: 'Coordination' },
  { id: 'all', label: 'Whole center' },
];
const categories = [
  ['arrivals', 'Arrivals'],
  ['all', 'All workflows'],
  ['clinical', 'Clinical'],
  ['rehab', 'PT & OT'],
  ['activities', 'Activities'],
  ['meals', 'Meals'],
  ['coordination', 'Coordination'],
];
const palette: Record<string, string> = {
  walk: '#aec9bc',
  roll: '#aec9bc',
  ride: '#d6dfdc',
  greet: '#d7b76a',
  consult: '#81a5bc',
  treat: '#81a5bc',
  exercise: '#8db2a5',
  dance: '#b87166',
  'tai-chi': '#73a39a',
  write: '#aa95b9',
  craft: '#cda168',
  music: '#bd9664',
  device: '#77a6ba',
  perform: '#cb9771',
  clap: '#cb9771',
  present: '#82a8a0',
  conversation: '#82a8a0',
  listen: '#aab794',
  tabletop: '#b4a2c5',
  seated: '#d4b490',
  serve: '#d4b490',
  document: '#9baec8',
  idle: '#d8e2d6',
};
type Track = {
  id: string;
  label: string;
  kind: 'person' | 'interaction' | 'van';
  role?: string;
  zone: string;
  stages: { start: number; end: number; title: string; action: string }[];
};
export function ActivityPanel({
  viewer,
  onScene,
  onClose,
}: {
  viewer: ReturnType<typeof createViewer> | null;
  onScene: (zone: string, actor?: string | null) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<ActivitySnapshot | null>(null),
    [expanded, setExpanded] = useState(false),
    [showTracks, setShowTracks] = useState(false),
    [trackKind, setTrackKind] = useState('interactions'),
    [category, setCategory] = useState('activities'),
    [horizon, setHorizon] = useState(720),
    [search, setSearch] = useState(''),
    [activityView, setActivityView] = useState(true);
  useEffect(() => viewer?.activity.subscribe(setState), [viewer]);
  const time = state?.time || 0,
    change = (p: Partial<ActivitySnapshot>) => viewer?.activity.setOptions(p);
  const session = programAt(time);
  const chooseSession = (id: string) => {
    const p = dayProgram.programs.find((p) => p.id === id)!;
    change({ time: p.start + 3, enabled: true, filter: 'all' });
    setCategory('activities');
    setActivityView(true);
    onScene('day', 'interaction:day-' + p.id);
  };
  const interactions = activityData.interactions.filter(
      (i) => category === 'all' || i.category === category,
    ),
    allowed = new Set(interactions.flatMap((i) => i.actorIds));
  const tracks = useMemo<Track[]>(
    () => [
      ...vanWindows.map((v) => ({
        id: v.id,
        label: v.name,
        kind: 'van' as const,
        zone: 'site',
        stages: [
          {
            start: v.inbound[0],
            end: v.inbound[1],
            title: 'Arrive',
            action: 'walk',
          },
          {
            start: v.unload[0],
            end: v.unload[1],
            title: 'Ramp & unload',
            action: 'greet',
          },
          {
            start: v.outbound[0],
            end: v.outbound[1],
            title: 'Leave',
            action: 'ride',
          },
          {
            start: v.returning[0],
            end: v.returning[1],
            title: 'Return',
            action: 'walk',
          },
          {
            start: v.boarding[0],
            end: v.boarding[1],
            title: 'Board for home',
            action: 'greet',
          },
          {
            start: v.leaving[0],
            end: v.leaving[1],
            title: 'Home',
            action: 'ride',
          },
        ],
      })),
      ...activityData.actors.map((a) => ({
        id: a.id,
        label: a.label,
        role: roleNames[a.role],
        kind: 'person' as const,
        zone: a.levelId === 'upper' ? 'upper-office' : a.segments[0].zoneId,
        stages: timelineFor(a).map((s) => ({
          start: s.start,
          end: s.end,
          title: s.title || s.action,
          action: s.action,
        })),
      })),
      ...activityData.interactions.map((i) => ({
        id: 'interaction:' + i.id,
        label: i.label,
        kind: 'interaction' as const,
        zone: i.zoneId,
        stages: [
          {
            start: i.start,
            end: i.end,
            title: i.label,
            action:
              i.category === 'arrivals'
                ? 'greet'
                : i.category === 'rehab'
                  ? 'exercise'
                  : 'consult',
          },
        ],
      })),
    ],
    [],
  );
  const visible = tracks.filter(
    (t) =>
      (trackKind === 'interactions'
        ? t.kind === 'interaction'
        : t.kind !== 'interaction') &&
      (category === 'all' ||
        (t.kind === 'van'
          ? category === 'arrivals'
          : t.kind === 'interaction'
            ? interactions.some((i) => 'interaction:' + i.id === t.id)
            : allowed.has(t.id))) &&
      (!search ||
        `${t.label} ${t.role || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const windowStart = Math.min(
      activityData.duration - horizon,
      Math.floor(time / horizon) * horizon,
    ),
    windowEnd = windowStart + horizon;
  const selected = tracks.find((t) => t.id === state?.follow),
    currentStage = selected?.stages.find(
      (s) => time >= s.start && time < s.end,
    );
  const select = (track: Track, at?: number) => {
    setActivityView(track.zone === 'day');
    change({ filter: 'all' });
    if (at !== undefined) change({ time: at, playing: false });
    onScene(
      track.kind === 'person'
        ? viewer?.activity.actorSample(track.id)?.zoneId || track.zone
        : track.zone,
      track.id,
    );
  };
  return (
    <section
      className="activity-panel"
      aria-label="Animated care day and timeline"
    >
      <div className="activity-heading">
        <div>
          <span className="overline">LIFE AT SEEN HEALTH</span>
          <strong>
            <span className={state?.playing ? 'activity-pulse' : ''} />
            {state?.playing ? 'Care day in motion' : 'Care day paused'}
          </strong>
        </div>
        <button onClick={onClose} aria-label="Close animation controls">
          <X size={18} />
        </button>
      </div>
      <div className="activity-scenes" aria-label="View a workflow">
        {activityViews.map((v) => (
          <button
            key={v.id}
            onClick={() => {
              onScene(v.id);
              setActivityView(v.id === 'day');
              if (v.id === 'day') {
                setCategory('activities');
                setTrackKind('interactions');
              }
              if (v.id === 'site') setCategory('arrivals');
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      {activityView && (
        <div className="day-program-panel">
          <div className="day-program-topline">
            <label htmlFor="day-session">Day room program</label>
            <select
              id="day-session"
              value={session.id}
              onChange={(e) => chooseSession(e.target.value)}
            >
              {dayProgram.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {dayTime(p.start)}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                chooseSession(
                  dayProgram.programs[
                    (dayProgram.programs.indexOf(session) + 1) %
                      dayProgram.programs.length
                  ].id,
                )
              }
            >
              Next activity →
            </button>
          </div>
          <strong>{session.title}</strong>
          <p>{session.culture}</p>
          <p className="day-program-access">{session.access}</p>
          <div className="day-program-tags">
            <span>Standing</span>
            <span>Chair-based</span>
            <span>Wheelchair welcome</span>
            <span>Quiet creative table</span>
          </div>
          <small>
            Three front tables cleared · Illustrative rotation · Choose a
            session, then play or follow its interaction track.
          </small>
        </div>
      )}
      <div className="activity-transport">
        <button
          className="activity-play"
          aria-label={state?.playing ? 'Pause animation' : 'Play animation'}
          disabled={!state}
          onClick={() => change({ playing: !state?.playing, enabled: true })}
        >
          {state?.playing ? <Pause size={18} /> : <Play size={18} />}
          <span>{state?.playing ? 'Pause' : 'Play'}</span>
        </button>
        <button
          title="Restart the care day"
          aria-label="Restart loop"
          onClick={() => {
            change({ time: 0 });
            setActivityView(false);
            setCategory('arrivals');
            onScene('site');
          }}
        >
          <RotateCcw size={17} />
        </button>
        <output>
          {dayTime(time)} <span>· {state?.elapsedLabel || '0:00'} / 12:00</span>
        </output>
        <label>
          Speed
          <select
            value={state?.speed || 4}
            onChange={(e) => change({ speed: Number(e.target.value) })}
          >
            {[0.25, 0.5, 1, 2, 4].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <button
          aria-pressed={showTracks}
          onClick={() => {
            setShowTracks(!showTracks);
            setExpanded(false);
          }}
        >
          <Rows3 size={17} />
          <span>Tracks</span>
          {showTracks ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button
          aria-pressed={expanded}
          onClick={() => {
            setExpanded(!expanded);
            setShowTracks(false);
          }}
        >
          <Users size={17} />
          <span>People</span>
        </button>
      </div>
      <input
        className="activity-scrubber"
        aria-label="Seek through the representative care day"
        type="range"
        min={0}
        max={activityData.duration - 0.01}
        step={0.1}
        value={time}
        onChange={(e) =>
          change({ time: Number(e.target.value), playing: false })
        }
      />
      {selected && (
        <div className="activity-follow">
          <Eye size={15} />
          <span>
            <b>{selected.label}</b> ·{' '}
            {currentStage?.title || 'Between activities'}
          </span>
          <button onClick={() => viewer?.followActor(null)}>
            Release camera
          </button>
        </div>
      )}
      {showTracks && (
        <div className="care-timeline">
          <div className="track-toolbar">
            <div className="track-tabs">
              <button
                aria-pressed={trackKind === 'people'}
                onClick={() => setTrackKind('people')}
              >
                People & vans
              </button>
              <button
                aria-pressed={trackKind === 'interactions'}
                onClick={() => setTrackKind('interactions')}
              >
                Interactions
              </button>
            </div>
            <label className="sr-only" htmlFor="track-category">
              Workflow filter
            </label>
            <select
              id="track-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="track-horizon">
              Time horizon
            </label>
            <select
              id="track-horizon"
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            >
              <option value={720}>Full day</option>
              <option value={180}>2 hours</option>
              <option value={45}>30 minutes</option>
            </select>
            <input
              type="search"
              aria-label="Find a person or interaction"
              placeholder="Find a track…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="timeline-axis">
            <span>{visible.length} tracks</span>
            <div>
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <span key={t} style={{ left: `${t * 100}%` }}>
                  {dayTime(windowStart + t * horizon)}
                </span>
              ))}
            </div>
          </div>
          <div className="timeline-rows">
            {visible.length === 0 && (
              <p className="timeline-empty">
                No matching tracks. Choose another workflow or name.
              </p>
            )}
            {visible.map((track) => (
              <div
                className="timeline-row"
                key={track.id}
                data-selected={state?.follow === track.id}
              >
                <button
                  className="track-person"
                  onClick={() => select(track)}
                  title={`Follow ${track.label}`}
                >
                  <span>{track.label}</span>
                  <small>
                    {track.role ||
                      (track.kind === 'van'
                        ? 'Accessible transport'
                        : 'Shared interaction')}
                  </small>
                </button>
                <div
                  className="track-lane"
                  aria-label={`${track.label} schedule`}
                >
                  {track.stages
                    .filter((s) => s.end > windowStart && s.start < windowEnd)
                    .map((s, i) => {
                      const left =
                          ((Math.max(s.start, windowStart) - windowStart) /
                            horizon) *
                          100,
                        width =
                          ((Math.min(s.end, windowEnd) -
                            Math.max(s.start, windowStart)) /
                            horizon) *
                          100;
                      return (
                        <button
                          key={`${s.start}-${i}`}
                          className={`track-stage ${s.action === 'ride' ? 'track-away' : ''}`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            background: palette[s.action] || '#a9c5bd',
                          }}
                          title={`${s.title} · ${dayTime(s.start)}–${dayTime(s.end)}. Select to pause and follow.`}
                          aria-label={`${track.label}: ${s.title}, ${dayTime(s.start)} to ${dayTime(s.end)}`}
                          onClick={() =>
                            select(
                              track,
                              Math.max(windowStart, s.start) +
                                Math.min(0.5, (s.end - s.start) / 2),
                            )
                          }
                        >
                          {width > 9 ? s.title : ''}
                        </button>
                      );
                    })}
                  <span
                    className="timeline-playhead"
                    style={{
                      left: `${((time - windowStart) / horizon) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="timeline-help">
            <span>
              <i style={{ background: palette.walk }} />
              Travel <i style={{ background: palette.greet }} />
              Welcome <i style={{ background: palette.consult }} />
              Care <i style={{ background: palette.exercise }} />
              Activities
            </span>
            <span>Select a stage to pause & follow</span>
          </div>
        </div>
      )}
      {expanded && (
        <div className="activity-options">
          <div className="activity-option-row">
            <label>
              Show
              <select
                value={state?.filter || 'all'}
                onChange={(e) =>
                  change({ filter: e.target.value, follow: null })
                }
              >
                <option value="all">
                  All {activityData.actors.length} people
                </option>
                <option value="staff">Staff only</option>
                {activityData.roles.map((r) => (
                  <option key={r} value={r}>
                    {roleNames[r]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Figure size
              <select
                value={state?.scale || 1}
                onChange={(e) => change({ scale: Number(e.target.value) })}
              >
                <option value={1}>Natural</option>
                <option value={1.35}>Larger · 1.35×</option>
                <option value={1.6}>Larger · 1.6×</option>
              </select>
            </label>
          </div>
          <div className="activity-checks">
            <label>
              <input
                type="checkbox"
                checked={state?.paths || false}
                onChange={(e) => change({ paths: e.target.checked })}
              />
              Walking paths
            </label>
            <label>
              <input
                type="checkbox"
                checked={state?.enabled ?? true}
                onChange={(e) => change({ enabled: e.target.checked })}
              />
              Animated care day
            </label>
          </div>
          <p className="template-note">
            One shared model per role, one consistent appearance per person.
            Doctors wear white coats; nurses, PT, OT and CNAs wear scrubs; other
            staff wear solid uniforms.
          </p>
          <div className="activity-cast">
            {activityData.actors
              .filter(
                (a) =>
                  !state ||
                  state.filter === 'all' ||
                  state.filter === a.role ||
                  (state.filter === 'staff' && a.role !== 'participant'),
              )
              .map((a) => (
                <button
                  key={a.id}
                  aria-pressed={state?.follow === a.id}
                  onClick={() => select(tracks.find((t) => t.id === a.id)!)}
                >
                  <span style={{ background: roleColors[a.role] }} />
                  <div>
                    {a.label}
                    <small>
                      {roleNames[a.role]} ·{' '}
                      {characterLibrary.roles[a.role].wardrobe === 'coat'
                        ? 'white coat'
                        : characterLibrary.roles[a.role].wardrobe === 'scrubs'
                          ? 'scrubs'
                          : a.role === 'participant'
                            ? a.mobility || 'independent'
                            : 'solid uniform'}
                    </small>
                  </div>
                </button>
              ))}
          </div>
          <div className="activity-downloads">
            <a href="/models/seen-health-animated-cast.glb" download>
              <Download size={15} />
              Role models
            </a>
            <a href="/models/character-templates.json" download>
              Person & wardrobe templates
            </a>
            <a href="/models/activity-loop.json" download>
              Care-day tracks
            </a>
          </div>
          <details>
            <summary>Workflow sources & interpretation</summary>
            <p>
              The Orbit review informs therapy, clinical, social-work, escort
              and coordination patterns. The arrival follows your described ramp
              and right turn into the sliding entrance. These are stable
              composite people and illustrative timings, shown as an 8 AM–4 PM
              day compressed into a twelve-minute loop.
            </p>
            <p>
              Upper-floor movement connections are not animated. People are
              hidden in plan, exploded and separated-level views. Staff profiles
              can be reused across scenes; they are not a verified employee
              roster.
            </p>
          </details>
        </div>
      )}
      <div className="activity-caption">
        <span>
          Continuous loop · {activityData.actors.length} people ·{' '}
          {activityData.roles.length} roles
        </span>
        <span>Representative care day · illustrative times</span>
      </div>
    </section>
  );
}
