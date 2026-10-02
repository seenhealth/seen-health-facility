'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Download,
  Eye,
  Pause,
  PanelRightOpen,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  activityData as alhambraActivityData,
  dayTime,
  timelineFor,
  type ActivitySnapshot,
} from '../model/activity';
import { roleNames, roleColors, characterLibrary } from '../model/characters';
import { alhambraVanWindows } from '../model/arrival';
import {
  dayProgram,
  instructorOf,
  lunch,
  programRotation,
  rotationDays,
  sessionsAt,
  setProgramRotation,
  subscribeProgramRotation,
  todaysLunch,
  zoneSessions,
  type DaySession,
  type RotationDay,
} from '../model/day-program';
import { COMMUNITY_CATEGORIES } from '../model/community-settings';
import type { createViewer } from '../model/renderer';

type Viewer = ReturnType<typeof createViewer>;
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
  ...COMMUNITY_CATEGORIES,
];
const dayLabels: Record<RotationDay, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
};
const formatLabels = {
  group: 'Whole group',
  'small-group': 'Small groups',
  'one-to-one': 'One-to-one',
};
const adaptationLabels = [
  ['lowSodium', 'Low sodium'],
  ['texture', 'Soft & minced'],
  ['diabetes', 'Diabetes-friendly'],
] as const;
const palette: Record<string, string> = {
  walk: '#aec9bc',
  roll: '#aec9bc',
  ride: '#d6dfdc',
  greet: '#d7b76a',
  consult: '#81a5bc',
  treat: '#81a5bc',
  exercise: '#8db2a5',
  dance: '#b87166',
  'fan-dance': '#c07a6e',
  opera: '#cf8f86',
  'tai-chi': '#73a39a',
  qigong: '#79a79c',
  erhu: '#b99062',
  tea: '#9fb08a',
  write: '#aa95b9',
  craft: '#cda168',
  music: '#bd9664',
  device: '#77a6ba',
  perform: '#cb9771',
  clap: '#cb9771',
  present: '#82a8a0',
  conversation: '#82a8a0',
  phone: '#c99a6b',
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
type Tab = 'scenes' | 'timeline' | 'people';

/** Play/pause and clock for when the side panel is closed. */
export function MiniPlayer({
  viewer,
  onOpen,
}: {
  viewer: Viewer | null;
  onOpen: () => void;
}) {
  const [state, setState] = useState<ActivitySnapshot | null>(null);
  useEffect(() => viewer?.activity.subscribe(setState), [viewer]);
  return (
    <div className="mini-player">
      <button
        aria-label={state?.playing ? 'Pause animation' : 'Play animation'}
        disabled={!state}
        onClick={() =>
          viewer?.activity.setOptions({
            playing: !state?.playing,
            enabled: true,
          })
        }
      >
        {state?.playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <output>{dayTime(state?.time || 0)}</output>
      <button aria-label="Open care day panel" onClick={onOpen}>
        <PanelRightOpen size={16} />
      </button>
    </div>
  );
}

export function ActivityPanel({
  viewer,
  onScene,
}: {
  viewer: Viewer | null;
  onScene: (zone: string, actor?: string | null) => void;
}) {
  const activityData = viewer?.activity.data || alhambraActivityData;
  const siteSpecific = !!activityData.siteSpecific;
  // Site arrivals carry their own timetable; Alhambra's fleet uses its schedule.
  const siteArrival = viewer?.activity.arrival;
  const vanWindows = useMemo(
    () =>
      siteSpecific && siteArrival && 'windows' in siteArrival
        ? siteArrival.windows
        : alhambraVanWindows,
    [siteSpecific, siteArrival],
  );
  const dayRoomId = activityData.dayRoomId || 'day';
  const views = activityData.views || activityViews;
  const [state, setState] = useState<ActivitySnapshot | null>(null),
    [tab, setTab] = useState<Tab>('scenes'),
    [trackKind, setTrackKind] = useState('interactions'),
    [category, setCategory] = useState('activities'),
    [horizon, setHorizon] = useState(180),
    [search, setSearch] = useState(''),
    [activityView, setActivityView] = useState(!siteSpecific),
    [mealView, setMealView] = useState(false);
  useEffect(() => viewer?.activity.subscribe(setState), [viewer]);
  // The cast in view: the community layer's people drop out with its toggle.
  const people = state?.people ?? activityData.actors.length;
  const time = state?.time || 0,
    change = (p: Partial<ActivitySnapshot>) => viewer?.activity.setOptions(p);
  const rotation = useSyncExternalStore(
    subscribeProgramRotation,
    programRotation,
    () => 'mon' as RotationDay,
  );
  // Alhambra runs three zones at once; the other sites share the open-floor rotation.
  const zones = dayProgram.zones.filter((z) => !siteSpecific || z.id === 'floor');
  // Floor interaction tracks are baked for the slot's Monday session.
  const trackOf = (s: DaySession) => 'interaction:day-' + (s.baseId ?? s.id);
  const followed = zones
    .flatMap((z) => zoneSessions(z.id))
    .find((p) => state?.follow === trackOf(p));
  const session = sessionsAt(time).find(
    ({ zone }) => zone.id === (followed?.zone || 'floor'),
  )!.session;
  const guest = activityData.actors.some((a) => a.id === session.instructorId)
    ? instructorOf(session)
    : undefined;
  const chooseSession = (id: string) => {
    const p = zones.flatMap((z) => zoneSessions(z.id)).find((p) => p.id === id)!;
    change({ time: p.start + 3, enabled: true, filter: 'all' });
    setCategory('activities');
    setActivityView(true);
    onScene(dayRoomId, trackOf(p));
  };
  const chooseRotation = (day: RotationDay) => {
    setProgramRotation(day);
    const u = new URL(window.location.href);
    if (day === 'mon') u.searchParams.delete('program');
    else u.searchParams.set('program', day);
    window.history.replaceState(null, '', u);
    change({ enabled: true });
  };
  // The selected weekday's lunch and the delivery that brings it to the kitchen.
  const menu = todaysLunch(),
    lunchDelivery = activityData.interactions.find(
      (i) => i.id === lunch.delivery,
    );
  const watchDelivery = () => {
    if (!lunchDelivery) return;
    change({ time: lunchDelivery.start + 3, enabled: true, filter: 'all' });
    setCategory('meals');
    onScene(lunchDelivery.zoneId, 'interaction:' + lunchDelivery.id);
  };
  const chooseScene = (id: string) => {
    onScene(id);
    setActivityView(id === dayRoomId);
    setMealView(id === 'dining');
    if (siteSpecific) {
      setCategory(
        activityData.interactions.find((i) => i.zoneId === id)?.category ||
          'all',
      );
    }
    if (id === dayRoomId) {
      setCategory('activities');
      setTrackKind('interactions');
    }
    if (id === 'site') {
      setCategory('arrivals');
      if (siteSpecific)
        change({
          time: 49,
          enabled: true,
          playing: true,
          speed: 1,
          follow: null,
        });
    }
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
        ].filter((stage) => stage.start >= 0 && stage.end > stage.start),
      })),
      ...activityData.actors.map((a) => ({
        id: a.id,
        label: a.label,
        role: roleNames[a.role],
        kind: 'person' as const,
        zone:
          (a.arrivalVehicleId ? 'site' : a.roomId) ||
          (a.levelId === 'upper' ? 'upper-office' : a.segments[0].zoneId),
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
              i.channel === 'phone'
                ? 'phone'
                : i.category === 'arrivals'
                  ? 'greet'
                  : i.category === 'activities'
                    ? 'exercise'
                    : 'consult',
          },
        ],
      })),
    ],
    [activityData, vanWindows],
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
    setActivityView(track.zone === dayRoomId);
    setMealView(track.zone === 'dining' || track.zone === 'kitchen');
    change({ filter: 'all' });
    if (at !== undefined) change({ time: at, playing: false });
    onScene(
      track.kind === 'person'
        ? siteSpecific
          ? track.zone
          : viewer?.activity.actorSample(track.id)?.zoneId || track.zone
        : track.zone,
      track.id,
    );
  };
  return (
    <section className="activity-panel" aria-label="Animated care day">
      <div className="activity-player">
        <button
          className="activity-play"
          aria-label={state?.playing ? 'Pause animation' : 'Play animation'}
          disabled={!state}
          onClick={() => change({ playing: !state?.playing, enabled: true })}
        >
          {state?.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <div className="activity-clock">
          <output>{dayTime(time)}</output>
          <small>
            <span className={state?.playing ? 'activity-pulse' : ''} />
            {state?.elapsedLabel || '0:00'} / 12:00 loop
          </small>
        </div>
        <button
          className="activity-icon"
          title="Restart the care day"
          aria-label="Restart loop"
          onClick={() => {
            change({ time: 0 });
            setActivityView(false);
            setMealView(false);
            setCategory('arrivals');
            onScene('site');
          }}
        >
          <RotateCcw size={15} />
        </button>
        <select
          aria-label="Playback speed"
          value={state?.speed || 4}
          onChange={(e) => change({ speed: Number(e.target.value) })}
        >
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
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
          <Eye size={14} />
          <span>
            <b>
              {selected.id === trackOf(session) ? session.title : selected.label}
            </b>
            {currentStage?.title !== selected.label &&
              (currentStage?.title || 'Between activities')}
          </span>
          <button onClick={() => viewer?.followActor(null)}>Release</button>
        </div>
      )}
      <fieldset className="activity-tabs">
        <legend className="sr-only">Care day views</legend>
        <button
          aria-pressed={tab === 'scenes'}
          onClick={() => setTab('scenes')}
        >
          Scenes
        </button>
        <button
          aria-pressed={tab === 'timeline'}
          onClick={() => setTab('timeline')}
        >
          Timeline
        </button>
        <button
          aria-pressed={tab === 'people'}
          onClick={() => setTab('people')}
        >
          People <small>{people}</small>
        </button>
      </fieldset>
      {tab === 'scenes' && (
        <>
          <fieldset className="activity-scenes">
            <legend className="sr-only">View a workflow</legend>
            {views.map((v) => (
              <button key={v.id} onClick={() => chooseScene(v.id)}>
                {v.label}
              </button>
            ))}
          </fieldset>
          {activityView && (
            <div className="day-program">
              {!siteSpecific && (
                <div className="day-program-week">
                  <span>Weekly repertoire</span>
                  <div className="track-tabs">
                    {rotationDays.map((d) => (
                      <button
                        key={d}
                        aria-pressed={rotation === d}
                        onClick={() => chooseRotation(d)}
                      >
                        {dayLabels[d]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="day-program-head">
                <label htmlFor="day-session">Day room program</label>
                <button
                  onClick={() => {
                    const list = zoneSessions(session.zone);
                    chooseSession(
                      list[(list.indexOf(session) + 1) % list.length].id,
                    );
                  }}
                >
                  Next →
                </button>
              </div>
              <select
                id="day-session"
                value={session.id}
                onChange={(e) => chooseSession(e.target.value)}
              >
                {zones.map((z) => (
                  <optgroup key={z.id} label={z.label}>
                    {zoneSessions(z.id).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                        {p.labelZh ? ` ${p.labelZh}` : ''} · {dayTime(p.start)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <strong>
                {session.title}
                {guest && <span> · with {guest.name}</span>}
              </strong>
              <div className="day-program-tags day-program-chips">
                {session.cultures.map((c) => (
                  <span key={'culture:' + c} title="Culture">
                    {c}
                  </span>
                ))}
                {session.languages.map((l) => (
                  <span
                    key={'language:' + l}
                    className="chip-language"
                    title="Language"
                  >
                    {l}
                  </span>
                ))}
                <span className="chip-format">
                  {formatLabels[session.format]}
                </span>
                {session.season && (
                  <span className="chip-format">{session.season}</span>
                )}
              </div>
              <p>{session.culture}</p>
              <p className="day-program-access">{session.access}</p>
            </div>
          )}
          {mealView && !siteSpecific && (
            <div className="day-program lunch-menu">
              <div className="day-program-week">
                <span>Weekly menu</span>
                <div className="track-tabs">
                  {rotationDays.map((d) => (
                    <button
                      key={d}
                      aria-pressed={rotation === d}
                      onClick={() => chooseRotation(d)}
                    >
                      {dayLabels[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="day-program-head">
                <span>Today’s lunch</span>
                {lunchDelivery && (
                  <button
                    title="Watch lunch arrive in the kitchen"
                    onClick={watchDelivery}
                  >
                    Delivery →
                  </button>
                )}
              </div>
              <strong>{menu.title}</strong>
              <div className="day-program-tags day-program-chips">
                {menu.cultures.map((c) => (
                  <span key={c} title="Culture">
                    {c}
                  </span>
                ))}
              </div>
              <p>
                <b>Main</b> {menu.main}
              </p>
              <p>
                <b>Vegetarian</b> {menu.vegetarian}
              </p>
              <p>
                <b>Sides</b> {menu.sides.join(' · ')}
              </p>
              {menu.soup && (
                <p>
                  <b>Soup</b> {menu.soup}
                </p>
              )}
              {menu.dessert && (
                <p>
                  <b>Dessert</b> {menu.dessert}
                </p>
              )}
              {adaptationLabels.map(([key, label]) => (
                <p key={key} className="day-program-access">
                  <b>{label}</b> {menu.adaptations[key]}
                </p>
              ))}
              {lunchDelivery && (
                <p className="day-program-access">
                  Delivered to the kitchen at {dayTime(lunchDelivery.start)} ·
                  served {dayTime(lunch.service[0])}–{dayTime(lunch.service[1])}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {tab === 'timeline' && (
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
              {[0, 0.5, 1].map((t) => (
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
                          {width > 22 ? s.title : ''}
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
            <i style={{ background: palette.walk }} />
            Travel <i style={{ background: palette.greet }} />
            Welcome <i style={{ background: palette.consult }} />
            Care <i style={{ background: palette.exercise }} />
            Activities
          </div>
        </div>
      )}
      {tab === 'people' && (
        <div className="activity-options">
          <div className="activity-fields">
            <label>
              Show
              <select
                value={state?.filter || 'all'}
                onChange={(e) =>
                  change({ filter: e.target.value, follow: null })
                }
              >
                <option value="all">All {people} people</option>
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
                      {a.role === 'participant'
                        ? a.mobility || 'independent'
                        : characterLibrary.roles[a.role].detail.toLowerCase()}
                    </small>
                  </div>
                </button>
              ))}
          </div>
          <details className="activity-about">
            <summary>About this care day</summary>
            <p>
              Continuous loop · {people} people · {activityData.roles.length}{' '}
              roles. A representative 8 AM–4 PM day compressed into twelve
              minutes; times are illustrative.
              {siteSpecific
                ? ' Activities use the existing room furniture.'
                : ' Three front day-room tables are cleared for the weekly program repertoire.'}
            </p>
            <p>
              One shared model per role, one consistent appearance per person.
              Doctors and dietitians wear white coats; nurses, PT, OT and aides
              wear V-neck scrubs; desk, coordination, social work, recreation
              and the center manager wear lanyards; food service wears an apron.
            </p>
            <p>
              {siteSpecific
                ? 'Staff and participants share the Alhambra character models and activity repertoire, placed in this site’s corresponding rooms. Walking stays within each room and avoids modeled furniture.'
                : 'The Orbit review informs therapy, clinical, social-work, escort and coordination patterns. The arrival follows your described ramp and right turn into the sliding entrance. These are stable composite people.'}
            </p>
            <p>
              Upper-floor movement connections are not animated. People are
              hidden in plan, exploded and separated-level views. Staff profiles
              can be reused across scenes; they are not a verified employee
              roster.
            </p>
            <div className="activity-downloads">
              <a href="/models/seen-health-animated-cast.glb" download>
                <Download size={14} />
                Role models
              </a>
              <a href="/models/character-templates.json" download>
                Person & wardrobe templates
              </a>
              <button
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(activityData, null, 2)], {
                      type: 'application/json',
                    }),
                  );
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'care-day-tracks.json';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Care-day tracks
              </button>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
