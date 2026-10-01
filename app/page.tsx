'use client';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  ChartArea,
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  Expand,
  Eye,
  FileJson,
  Focus,
  FolderOpen,
  Info,
  Layers,
  Map,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Route,
  Search,
  Settings2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  ft2,
  polygonArea,
  validateFacility,
  type Facility,
  type Room,
} from './model/schema';
import { defaultState, type ViewerState } from './model/renderer';
import type { createViewer } from './model/renderer';
import { SETTING_ZONE_PREFIX } from './model/community-settings';
import { COMMUNITY_VIEW } from './model/community-people';
import { roomLabelCode } from './model/room-labels';
import { JourneyPanel } from './components/journey-panel';
import type { JourneyStep } from './model/journeys';
import { ActivityPanel } from './components/activity-panel';
import { isRotationDay, setProgramRotation } from './model/day-room';
import { ShowcaseControls } from './components/showcase-controls';
import { SiteMap } from './components/site-map';
import { sites, type SiteId } from './data/sites';
// Charts load only when the Measure panel opens.
const MetricsPanel = lazy(() => import('./components/metrics-panel'));
const download = (data: Blob, name: string) => {
  const url = URL.createObjectURL(data),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};
/**
 * The distributed-care network view: the whole shell with the site context
 * and the community layer on. One recipe for the view-bar button (from the
 * current state) and for activity-panel touchpoints (from the default state).
 */
const communityState = (base: ViewerState): ViewerState => ({
  ...base,
  level: 'all',
  selected: null,
  room: null,
  isolate: false,
  plan: false,
  exterior: true,
  roof: true,
  walls: 'full',
  explode: 0,
  stack: 0,
  sectionAxis: 'none',
  site: true,
  community: true,
});
const jsonDownload = (data: unknown, name: string) =>
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    name,
  );
export default function Home() {
  const host = useRef<HTMLDivElement>(null),
    viewer = useRef<ReturnType<typeof createViewer> | null>(null),
    upload = useRef<HTMLInputElement>(null);
  const [showcase, setShowcase] = useState(false);
  const previousView = useRef<ViewerState | null>(null);
  const [siteId, setSiteId] = useState<SiteId>('alhambra');
  const [networkOpen, setNetworkOpen] = useState(false);
  const [clinicOption, setClinicOption] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [model, setModel] = useState<Facility | null>(null),
    [state, setState] = useState<ViewerState>({
      ...defaultState,
      level: 'ground',
      walls: 'cutaway',
      roof: false,
      exterior: false,
      labels: false,
    }),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [view, setView] = useState('iso'),
    [collapsed, setCollapsed] = useState(true),
    [list, setList] = useState<'areas' | 'rooms'>('areas'),
    [roomSearch, setRoomSearch] = useState(''),
    [modal, setModal] = useState<'accuracy' | 'model' | null>(null),
    [showControls, setShowControls] = useState(false),
    [journeyOpen, setJourneyOpen] = useState(false),
    [activityOpen, setActivityOpen] = useState(true),
    [measureOpen, setMeasureOpen] = useState(false),
    [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState(''),
    // The viewer builds the community layer when its source carries one.
    [hasCommunity, setHasCommunity] = useState(false),
    [dataTab, setDataTab] = useState<'overview' | 'assets'>('overview');
  const patch = (s: Partial<ViewerState>) => setState((p) => ({ ...p, ...s }));
  const getViewer = useCallback(() => viewer.current, []);
  const focusActivity = useCallback(
    (zoneId: string, actor?: string | null) => {
      if (!model || !viewer.current) return;
      if (
        viewer.current.community &&
        (zoneId === COMMUNITY_VIEW.id || zoneId.startsWith(SETTING_ZONE_PREFIX))
      ) {
        // A distributed-care setting: whole shell, site context and the layer on.
        const next = communityState(defaultState);
        setState(next);
        setView('community');
        viewer.current.update(next);
        viewer.current.view('community');
        viewer.current.activity.setOptions({ enabled: true, follow: null });
        if (zoneId.startsWith(SETTING_ZONE_PREFIX))
          viewer.current.focusSetting(zoneId.slice(SETTING_ZONE_PREFIX.length));
        if (actor) viewer.current.followActor(actor);
        return;
      }
      const activityRoom = model.rooms.find((r) => r.id === zoneId);
      const zone = model.zones.find(
        (z) => z.id === (activityRoom?.zoneId || zoneId),
      );
      const next: ViewerState = {
        ...defaultState,
        level: zone?.levelId || 'ground',
        selected: zone?.id || null,
        room: activityRoom?.id || null,
        roof: false,
        exterior: false,
        ceilings: false,
        labels: false,
        walls: 'cutaway',
      };
      setState(next);
      setView('iso');
      viewer.current.update(next);
      viewer.current.view('iso');
      viewer.current.activity.setOptions({ enabled: true, follow: null });
      if (zoneId === 'site') viewer.current.focusArrival();
      else viewer.current.focus(zone?.id || null, activityRoom?.id);
      if (actor) viewer.current.followActor(actor);
    },
    [model],
  );
  const focusJourney = useCallback(
    (step: JourneyStep) => {
      if (!model || !ready || !viewer.current) return;
      const z = model.zones.find((z) => z.id === step.zoneId);
      const next: ViewerState = {
        ...defaultState,
        level: z?.levelId || 'all',
        selected: z?.id || null,
        room: step.roomId || null,
        isolate: false,
        roof: !z,
        exterior: !z,
        ceilings: false,
        walls: z ? 'cutaway' : 'full',
        stack: 0,
        explode: 0,
        plan: false,
        sectionAxis: 'none',
      };
      setState(next);
      setView(z ? 'iso' : 'building');
      viewer.current.update(next);
      viewer.current.view('iso');
      const instant = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      if (step.scene === 'transport')
        viewer.current.focusSiteObjects(
          ['fleet-van-a', 'fleet-van-b'],
          instant,
        );
      else viewer.current.focus(z?.id || null, step.roomId, instant);
    },
    [model, ready],
  );
  const selectSite = (id: SiteId) => {
    setShowcase(false);
    viewer.current?.setShowcase(false);
    if (id !== siteId || clinicOption || !locationReady) {
      setModel(null);
      setReady(false);
      setError('');
    }
    setSiteId(id);
    setMeasureOpen(false);
    setClinicOption(false);
    setNetworkOpen(false);
    setModal(null);
    setRoomSearch('');
    setList(id === 'olympic' ? 'rooms' : 'areas');
    setState({
      ...defaultState,
      level: 'ground',
      walls: 'cutaway',
      roof: false,
      exterior: false,
      labels: false,
    });
    setView('iso');
    setActivityOpen(true);
    setJourneyOpen(false);
    setCollapsed(id === 'alhambra');
    const u = new URL(window.location.href);
    u.searchParams.set('site', id);
    u.searchParams.delete('option');
    u.searchParams.delete('view');
    window.history.replaceState(null, '', u);
  };
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const id = sites.find((s) => s.id === p.get('site'))?.id || 'alhambra';
    const program = p.get('program');
    if (isRotationDay(program)) setProgramRotation(program);
    queueMicrotask(() => {
      selectSite(id);
      setClinicOption(id === 'olympic' && p.get('option') === 'clinic');
      setNetworkOpen(p.get('view') === 'map');
      if (
        id === 'alhambra' &&
        ['showcase', 'tiltshift'].includes(p.get('view') || '')
      )
        setShowcase(true);
      if (p.get('view') === 'exterior') {
        setState({
          ...defaultState,
          level: 'all',
          walls: 'full',
          exterior: true,
          roof: true,
          labels: false,
          stack: 0,
          explode: 0,
        });
        setView('building');
      }
      const u = new URL(window.location.href);
      if (id === 'olympic' && p.get('option') === 'clinic')
        u.searchParams.set('option', 'clinic');
      if (p.get('view') === 'map') u.searchParams.set('view', 'map');
      if (['showcase', 'tiltshift'].includes(p.get('view') || ''))
        u.searchParams.set('view', 'tiltshift');
      if (p.get('view') === 'exterior') u.searchParams.set('view', 'exterior');
      window.history.replaceState(null, '', u);
      setLocationReady(true);
    });
  }, []);
  useEffect(() => {
    if (!locationReady) return;
    const controller = new AbortController();
    const path =
      clinicOption && siteId === 'olympic'
        ? '/models/seen-olympic-option.json'
        : sites.find((s) => s.id === siteId)!.model;
    fetch(path, { signal: controller.signal })
      .then((r) => {
        if (!r.ok)
          throw Error('The facility specifications could not be loaded.');
        return r.json();
      })
      .then((d) => {
        if (!controller.signal.aborted) setModel(validateFacility(d));
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [siteId, clinicOption, locationReady]);
  useEffect(() => {
    if (!model || !host.current) return;
    let ended = false;
    setReady(false);
    import('./model/renderer').then(({ createViewer }) => {
      if (ended || !host.current) return;
      try {
        viewer.current = createViewer(host.current, model, (zone, room) => {
          const selectedZone = model.zones.find((z) => z.id === zone);
          setState((s) => ({
            ...s,
            selected: zone,
            room: room || null,
            isolate: zone ? s.isolate : false,
            ...(selectedZone && s.exterior && s.sectionAxis === 'none'
              ? ({
                  level: selectedZone.levelId,
                  roof: false,
                  exterior: false,
                  ceilings: false,
                  walls: 'cutaway',
                  stack: 0,
                  explode: 0,
                } as const)
              : {}),
          }));
          if (selectedZone) {
            setView('iso');
            viewer.current?.view('iso');
            requestAnimationFrame(() => viewer.current?.focus(zone, room));
          }
        });
        viewer.current.update(state);
        // Same console hook as the story (?debug=1): lets screenshot and
        // tuning scripts drive the viewer without UI automation.
        if (new URLSearchParams(window.location.search).get('debug') === '1')
          (window as unknown as { __viewer: unknown }).__viewer = viewer.current;
        if (model.contextStyle) viewer.current.focus(null, null, true);
        else viewer.current.focus('day');
        if (state.exterior) viewer.current.view('exterior');
        setHasCommunity(!!viewer.current.community);
        setReady(true);
      } catch (e) {
        console.error(e);
        setError('The 3D model could not start. Please reload the model.');
      }
    });
    return () => {
      ended = true;
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [model]);
  useEffect(() => viewer.current?.update(state), [state, ready]);
  useEffect(() => {
    // The weekly repertoire belongs to the Alhambra day room; site-specific
    // models play their own baked Monday program, so ?program= does not
    // follow the visitor there (and Alhambra starts from Monday again).
    if (!model?.contextStyle) return;
    setProgramRotation('mon');
    const u = new URL(window.location.href);
    if (!u.searchParams.has('program')) return;
    u.searchParams.delete('program');
    window.history.replaceState(null, '', u);
  }, [model]);
  useEffect(() => {
    if (!ready || !viewer.current) return;
    if (showcase) {
      previousView.current = state;
      const next = {
        ...defaultState,
        level: 'ground',
        walls: 'cutaway' as const,
        roof: false,
        exterior: false,
        labels: false,
        ceilings: false,
      };
      setState(next);
      viewer.current.update(next);
      viewer.current.setShowcase(true);
      setActivityOpen(false);
      setJourneyOpen(false);
      setShowControls(false);
      setCollapsed(true);
    } else viewer.current.setShowcase(false);
  }, [showcase, ready]);
  const enterShowcase = () => {
    setShowcase(true);
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'tiltshift');
    window.history.replaceState(null, '', url);
  };
  const exitShowcase = () => {
    setShowcase(false);
    if (previousView.current) setState(previousView.current);
    viewer.current?.view('iso');
    viewer.current?.focus('day');
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  };

  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role=dialog]');
    dialog?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
      if (e.key === 'Tab' && dialog) {
        const els = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a,input,select,[tabindex="0"]',
          ),
        );
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [modal, model]);
  const zone = model?.zones.find((z) => z.id === state.selected),
    room = model?.rooms.find((r) => r.id === state.room),
    level = model?.levels.find((l) => l.id === state.level);
  const selectZone = (id: string) => {
    const z = model?.zones.find((a) => a.id === id);
    if (z)
      patch({
        selected: id,
        room: null,
        level: z.levelId,
        isolate: false,
        roof: false,
        exterior: false,
        ceilings: false,
        walls: 'cutaway',
        plan: false,
        explode: 0,
        stack: 0,
        sectionAxis: 'none',
      });
    setView('iso');
    viewer.current?.view('iso');
  };
  const selectRoom = (r: Room) => {
    patch({
      selected: r.zoneId,
      room: r.id,
      level: r.levelId,
      roof: false,
      exterior: false,
      ceilings: false,
      walls: 'cutaway',
      plan: false,
      explode: 0,
      stack: 0,
      sectionAxis: 'none',
    });
    setView('iso');
    viewer.current?.view('iso');
    requestAnimationFrame(() => viewer.current?.focus(r.zoneId, r.id));
  };
  const selectLevel = (id: string) => {
    setView(id === 'roof' ? 'building' : 'iso');
    const next: ViewerState = {
      ...state,
      level: id,
      selected: null,
      room: null,
      isolate: false,
      roof: id === 'roof',
      exterior: id === 'roof',
      stack: id === 'all' ? 0.65 : 0,
      walls: id === 'roof' ? 'full' : 'cutaway',
      plan: false,
      ceilings: false,
      explode: 0,
      sectionAxis: 'none',
    };
    setState(next);
    viewer.current?.update(next);
    viewer.current?.view(id === 'roof' ? 'exterior' : 'iso');
    viewer.current?.focus(null);
  };
  const showCommunity = () => {
    setView('community');
    const next = communityState(state);
    setState(next);
    viewer.current?.update(next);
    viewer.current?.view('community');
  };
  const showBuilding = (rear = false) => {
    setView(rear ? 'rear' : 'building');
    const next: ViewerState = {
      ...state,
      level: 'all',
      selected: null,
      room: null,
      isolate: false,
      plan: false,
      exterior: true,
      roof: true,
      walls: 'full',
      explode: 0,
      stack: 0,
      sectionAxis: 'none',
    };
    setState(next);
    viewer.current?.update(next);
    viewer.current?.view(rear ? 'rear' : 'exterior');
    viewer.current?.focus(null);
  };
  const openModel = async (file: File) => {
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error('Please choose a specification file under 20 MB.');
      const m = validateFacility(JSON.parse(await file.text()));
      setModel(m);
      setState(defaultState);
      setError('');
      setModal(null);
      setNotice(
        'Specification loaded locally. Export it to keep your changes.',
      );
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : 'The specification could not be opened.',
      );
    }
  };
  const shownZones =
    model?.zones.filter((z) =>
      state.level === 'all' || state.level === 'roof'
        ? true
        : z.levelId === state.level,
    ) || [];
  const shownRooms =
    model?.rooms.filter(
      (r) =>
        (state.level === 'all' ||
          state.level === 'roof' ||
          r.levelId === state.level) &&
        (!state.selected || r.zoneId === state.selected) &&
        (!roomSearch ||
          `${r.name} ${r.id} ${model.contextStyle === 'olympic' ? roomLabelCode(model, r) : ''}`
            .toLowerCase()
            .includes(roomSearch.toLowerCase())),
    ) || [];
  const roomBounds = room
    ? {
        w:
          Math.max(...room.polygon.map((p) => p[0])) -
          Math.min(...room.polygon.map((p) => p[0])),
        d:
          Math.max(...room.polygon.map((p) => p[1])) -
          Math.min(...room.polygon.map((p) => p[1])),
      }
    : null;
  return (
    <main
      className={`facility-app ${showcase ? 'showcase-mode' : ''} ${collapsed ? 'collapsed' : ''} ${siteId === 'olympic' ? 'olympic-design' : ''}`}
    >
      <header className="app-header">
        <a href="/" className="brand">
          <img
            className="brand-logo"
            src="/brand/seen-health-horizontal.png"
            alt="Seen Health"
            width={1309}
            height={160}
          />
        </a>
        <div className="header-location">
          {model?.address || sites.find((s) => s.id === siteId)?.address}
          <span className="header-tag">Facility model</span>
        </div>
        <div className="header-actions">
          {siteId === 'alhambra' && (
            <button disabled={!ready} onClick={enterShowcase}>
              <Video size={16} />
              <span>Video view</span>
            </button>
          )}
          {
            <button
              aria-label="Animated care day"
              aria-pressed={activityOpen}
              onClick={() => {
                setActivityOpen(!activityOpen);
                setJourneyOpen(false);
                setMeasureOpen(false);
              }}
            >
              <Users size={16} />
              <span>Animated care day</span>
            </button>
          }
          {siteId === 'alhambra' && (
            <button
              aria-label="Participant journeys"
              aria-pressed={journeyOpen}
              onClick={() => {
                setJourneyOpen(!journeyOpen);
                setActivityOpen(false);
                setMeasureOpen(false);
                if (window.innerWidth < 800) setCollapsed(true);
              }}
            >
              <Route size={16} />
              <span>Participant journeys</span>
            </button>
          )}
          {siteId === 'alhambra' && (
          <button
            aria-label="Measure"
            aria-pressed={measureOpen}
            onClick={() => {
              setMeasureOpen(!measureOpen);
              setActivityOpen(false);
              setJourneyOpen(false);
            }}
          >
            <ChartArea size={16} />
            <span>Measure</span>
          </button>
          )}
          <button onClick={() => setModal('model')}>
            <FolderOpen size={16} />
            <span>Model files</span>
          </button>
        </div>
      </header>
      <nav className="site-navigation" aria-label="Facility locations">
        <span className="site-nav-label">EXPLORE OUR SPACES</span>
        {sites.map((s) => (
          <button
            key={s.id}
            aria-pressed={!networkOpen && s.id === siteId}
            onClick={() => selectSite(s.id)}
          >
            <span className="site-dot" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
        <button
          className="network-tab"
          aria-pressed={networkOpen}
          onClick={() => {
            setNetworkOpen(!networkOpen);
            const u = new URL(window.location.href);
            if (!networkOpen) u.searchParams.set('view', 'map');
            else u.searchParams.delete('view');
            window.history.replaceState(null, '', u);
          }}
        >
          <Map size={15} />
          Site map
        </button>
      </nav>
      {networkOpen && (
        <SiteMap
          onSelect={selectSite}
          onClose={() => {
            setNetworkOpen(false);
            const u = new URL(window.location.href);
            u.searchParams.delete('view');
            window.history.replaceState(null, '', u);
          }}
        />
      )}
      <aside className="facility-sidebar">
        <div className="sidebar-title">
          <span className="overline">BUILDING EXPLORER</span>
          <h1>
            {model?.name.replace('Seen Health · ', '') ||
              sites.find((s) => s.id === siteId)?.name}
          </h1>
          <p>{model?.source.date || 'Loading source'} design baseline</p>
          <button
            className="accuracy-badge"
            onClick={() => setModal('accuracy')}
          >
            <span />
            {siteId !== 'alhambra'
              ? 'Drawing scale · review notes'
              : 'Area calibrated · dimensions pending'}
            <ChevronRight size={13} />
          </button>
        </div>
        {siteId === 'olympic' && (
          <div className="clinic-option">
            <label htmlFor="clinic-layout">Level 2 clinic layout</label>
            <select
              id="clinic-layout"
              value={clinicOption ? 'option' : 'main'}
              onChange={(e) => {
                const enabled = e.target.value === 'option';
                setModel(null);
                setReady(false);
                setError('');
                setClinicOption(enabled);
                setState((s) => ({
                  ...s,
                  level: 'upper',
                  room: null,
                  selected: null,
                  roof: false,
                  exterior: false,
                }));
                const u = new URL(window.location.href);
                if (enabled) u.searchParams.set('option', 'clinic');
                else u.searchParams.delete('option');
                window.history.replaceState(null, '', u);
              }}
            >
              <option value="main">Main A-2 layout</option>
              <option value="option">
                Alternate · waiting aligned with PT
              </option>
            </select>
          </div>
        )}
        <div className="sidebar-tabs">
          <button
            aria-pressed={list === 'areas'}
            className={list === 'areas' ? 'chosen' : ''}
            onClick={() => setList('areas')}
          >
            Areas <span>{shownZones.length}</span>
          </button>
          <button
            aria-pressed={list === 'rooms'}
            className={list === 'rooms' ? 'chosen' : ''}
            onClick={() => setList('rooms')}
          >
            Rooms <span>{shownRooms.length}</span>
          </button>
        </div>
        {list === 'areas' ? (
          <nav className="zone-list" aria-label="Facility areas">
            <button
              className={`zone-row overview-row ${!state.selected ? 'active' : ''}`}
              onClick={() => {
                patch({ selected: null, room: null, isolate: false });
                viewer.current?.focus(null);
              }}
            >
              <Box size={17} />
              <span>
                <strong>
                  {state.level === 'all'
                    ? 'Entire building'
                    : level?.name || 'Building exterior'}
                </strong>
                <small>View all spaces on this level</small>
              </span>
            </button>
            {shownZones.map((z) => (
              <button
                key={z.id}
                className={`zone-row ${state.selected === z.id ? 'active' : ''}`}
                style={{ '--zone': z.color } as React.CSSProperties}
                onClick={() => selectZone(z.id)}
                aria-pressed={state.selected === z.id}
              >
                <span className="zone-dot" />
                <span>
                  <strong>{z.name}</strong>
                  <small>{z.short}</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
        ) : (
          <div className="room-list-wrap">
            {siteId === 'olympic' && (
              <p className="room-label-help">
                Hover a label for the room name.
              </p>
            )}
            <label className="room-search">
              <Search size={15} />
              <input
                aria-label="Search rooms"
                placeholder="Find a room or ID"
                value={roomSearch}
                onChange={(e) => setRoomSearch(e.target.value)}
              />
            </label>
            {state.selected && (
              <button
                className="clear-filter"
                onClick={() => patch({ selected: null, room: null })}
              >
                All rooms on this level <X size={12} />
              </button>
            )}
            <nav className="room-list" aria-label="Room register">
              {shownRooms.map((r) => (
                <button
                  key={r.id}
                  className={`room-row ${state.room === r.id ? 'active' : ''}`}
                  onClick={() => selectRoom(r)}
                >
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {model?.contextStyle === 'olympic'
                        ? `Room ${roomLabelCode(model, r)}`
                        : r.id}
                    </small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              ))}
            </nav>
            {shownRooms.length === 0 && (
              <p className="empty-note">No rooms match this view.</p>
            )}
          </div>
        )}
        <div className="sidebar-bottom">
          <button onClick={() => setModal('accuracy')}>
            <Info size={16} />
            Accuracy register
            <small>
              {siteId === 'alhambra'
                ? model?.accuracyIssues.filter((i) => i.status === 'open')
                    .length
                : model?.accuracyIssues.length}{' '}
              {siteId === 'alhambra' ? 'open' : 'notes'}
            </small>
          </button>
        </div>
      </aside>
      <section className="model-workspace" aria-label="Interactive facility">
        <div className="model-canvas" ref={host} />
        {showcase && ready && viewer.current && (
          <ShowcaseControls viewer={viewer.current} onExit={exitShowcase} />
        )}
        {!ready && (
          <div className="model-loading">
            <Box size={30} />
            <p>{error || 'Loading the facility model…'}</p>
            {error && (
              <button
                className="primary"
                onClick={() => window.location.reload()}
              >
                Reload model
              </button>
            )}
          </div>
        )}
        <div className="level-toolbar">
          <button
            className="icon-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={
              collapsed ? 'Show room navigation' : 'Hide room navigation'
            }
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
          <div className="level-tabs" aria-label="Building level">
            {model?.levels.map((l) => (
              <button
                key={l.id}
                className={state.level === l.id ? 'chosen' : ''}
                onClick={() => selectLevel(l.id)}
              >
                {siteId !== 'alhambra'
                  ? l.name.split(' · ')[0]
                  : l.id === 'upper'
                    ? 'Upstairs / mezz.'
                    : l.id === 'ground'
                      ? 'Ground'
                      : l.name}
              </button>
            ))}
            <button
              className={state.level === 'all' ? 'chosen' : ''}
              onClick={() => selectLevel('all')}
            >
              <Layers size={14} />
              All levels
            </button>
          </div>
          <button
            className="icon-button"
            onClick={() =>
              document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen()
            }
            aria-label="Fullscreen"
          >
            <Expand size={17} />
          </button>
        </div>
        <div className="scene-heading">
          <div className="overline">
            {state.level === 'all'
              ? state.exterior
                ? 'WHOLE BUILDING'
                : 'BUILDING STACK'
              : state.level === 'roof'
                ? 'EXTERIOR & ROOF'
                : level?.name.toUpperCase()}
          </div>
          <h2>
            {room?.name ||
              zone?.name ||
              (state.level === 'all'
                ? 'The entire building'
                : state.level === 'roof'
                  ? 'The building in its neighborhood'
                  : level?.name || 'A connected center')}
          </h2>
          <div className="scene-subtitle">
            {state.level === 'all'
              ? state.exterior
                ? 'Orbit the complete shell, or use Cutaway and Section to look inside'
                : 'Separate levels to inspect how the building fits together'
              : level?.notes || 'Select an area or room to inspect its layout.'}
          </div>
        </div>
        <div className="view-switch">
          <button
            className={view === 'iso' ? 'chosen' : ''}
            onClick={() => {
              setView('iso');
              patch({
                plan: false,
                level:
                  state.level === 'roof' || state.level === 'all'
                    ? 'ground'
                    : state.level,
                roof: false,
                exterior: false,
                ceilings: false,
                walls: 'cutaway',
                sectionAxis: 'none',
                stack: 0,
              });
              viewer.current?.view('iso');
            }}
          >
            <Box size={15} />
            Cutaway
          </button>
          <button
            className={view === 'plan' ? 'chosen' : ''}
            onClick={() => {
              setView('plan');
              patch({
                roof: false,
                exterior: false,
                ceilings: false,
                walls: 'cutaway',
                sectionAxis: 'none',
                level:
                  state.level === 'roof' || state.level === 'all'
                    ? 'ground'
                    : state.level,
                stack: 0,
              });
              viewer.current?.view('plan');
            }}
          >
            <Map size={15} />
            Plan
          </button>
          <button
            className={view === 'building' ? 'chosen' : ''}
            onClick={() => showBuilding()}
          >
            Whole building
          </button>
          <button
            className={view === 'rear' ? 'chosen' : ''}
            onClick={() => showBuilding(true)}
          >
            Rear
          </button>
          {ready && hasCommunity && (
            <button
              className={view === 'community' ? 'chosen' : ''}
              onClick={showCommunity}
            >
              Community
            </button>
          )}
        </div>
        {activityOpen && ready && (
          <ActivityPanel
            key={model?.id || siteId}
            viewer={ready ? viewer.current : null}
            onScene={focusActivity}
            onClose={() => setActivityOpen(false)}
          />
        )}
        {measureOpen && model && siteId === 'alhambra' && (
          <Suspense fallback={null}>
            <MetricsPanel
              model={model}
              ready={ready}
              getViewer={getViewer}
              onClose={() => setMeasureOpen(false)}
            />
          </Suspense>
        )}
        {journeyOpen && siteId === 'alhambra' && (
          <JourneyPanel
            onFocus={focusJourney}
            onClose={() => setJourneyOpen(false)}
          />
        )}
        {zone && !journeyOpen && !activityOpen && !measureOpen && (
          <article
            className="space-card"
            style={{ '--zone': zone.color } as React.CSSProperties}
          >
            <div className="space-card-top">
              <span className="overline">
                {room ? 'ROOM RECORD' : zone.short}
              </span>
              <button
                onClick={() =>
                  patch({ selected: null, room: null, isolate: false })
                }
                aria-label="Close selected space"
              >
                <X size={16} />
              </button>
            </div>
            <h3>{room?.name || zone.name}</h3>
            <p>{room?.notes || zone.notes}</p>
            <div className="space-metrics">
              {room ? (
                <>
                  <div>
                    <strong>
                      {ft2(polygonArea(room.polygon)).toFixed(0)}
                      <small> sq ft</small>
                    </strong>
                    <span>Traced footprint</span>
                  </div>
                  <div>
                    <strong>
                      {(roomBounds!.w / 0.3048).toFixed(1)} ×{' '}
                      {(roomBounds!.d / 0.3048).toFixed(1)}
                      <small> ft</small>
                    </strong>
                    <span>Approx. bounding size</span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <strong>
                      {zone.publishedAreaSqFt?.toLocaleString() || '—'}
                      <small> sq ft</small>
                    </strong>
                    <span>
                      {zone.programId === 'therapy' ||
                      zone.programId === 'day-space'
                        ? 'Published program area'
                        : 'Source schedule'}
                    </span>
                  </div>
                  <div>
                    <strong>
                      {zone.tracedFootprintSqFt.toLocaleString()}
                      <small> sq ft</small>
                    </strong>
                    <span>Traced footprint</span>
                  </div>
                </>
              )}
            </div>
            <div className="metric-note">
              Image-derived sizes; not surveyed dimensions.
            </div>
            <div className="space-actions">
              <button
                className="primary"
                onClick={() => viewer.current?.focus(zone.id, room?.id)}
              >
                <Focus size={16} />
                Focus
              </button>
              <button
                className={state.isolate ? 'chosen' : ''}
                onClick={() => patch({ isolate: !state.isolate })}
              >
                <Eye size={15} />
                {state.isolate ? 'Show level' : 'Isolate area'}
              </button>
              {!room && <button onClick={() => setList('rooms')}>Rooms</button>}
            </div>
          </article>
        )}
        <div className="zoom-tools">
          <button
            aria-label="Zoom in"
            onClick={() => viewer.current?.zoom(1.25)}
          >
            <Plus size={18} />
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => viewer.current?.zoom(0.8)}
          >
            <Minus size={18} />
          </button>
          <button
            aria-label="Reset model view"
            onClick={() => {
              setState(defaultState);
              setView('building');
              viewer.current?.reset();
            }}
          >
            <RotateCcw size={16} />
          </button>
        </div>
        <div className="bottom-dock">
          <div className="separation-controls">
            <label>
              <Layers size={16} />
              Explode areas
              <input
                type="range"
                aria-label="Explode area separation"
                min="0"
                max="1"
                step=".01"
                value={state.explode}
                onChange={(e) => {
                  setView('iso');
                  patch({
                    explode: +e.target.value,
                    roof: false,
                    exterior: false,
                    ceilings: false,
                    walls: 'cutaway',
                    sectionAxis: 'none',
                    level: state.level === 'roof' ? 'ground' : state.level,
                  });
                }}
              />
              <span>{Math.round(state.explode * 100)}%</span>
            </label>
            {state.level === 'all' && (
              <label>
                <ArrowDownToLine size={16} />
                Separate levels
                <input
                  type="range"
                  aria-label="Vertical level separation"
                  min="0"
                  max="1"
                  step=".01"
                  value={state.stack}
                  onChange={(e) =>
                    patch({
                      stack: +e.target.value,
                      exterior: false,
                      roof: false,
                      ceilings: false,
                      walls: 'cutaway',
                      sectionAxis: 'none',
                    })
                  }
                />
                <span>{Math.round(state.stack * 100)}%</span>
              </label>
            )}
          </div>
          <span className="dock-rule" />
          <label className="dock-check">
            <input
              type="checkbox"
              checked={state.labels}
              onChange={(e) => patch({ labels: e.target.checked })}
            />
            {siteId === 'olympic' ? 'Room labels' : 'Labels'}
          </label>
          <button
            className={
              state.sectionAxis !== 'none'
                ? 'dock-button chosen'
                : 'dock-button'
            }
            onClick={() => {
              patch({
                sectionAxis: state.sectionAxis === 'none' ? 'z' : 'none',
                plan: false,
              });
              setShowControls(true);
            }}
          >
            Section
          </button>
          <button
            className={showControls ? 'dock-button chosen' : 'dock-button'}
            onClick={() => setShowControls(!showControls)}
          >
            <Settings2 size={16} />
            Layers
            <ChevronDown size={13} />
          </button>
        </div>
        {showControls && (
          <div className="layer-popover">
            <div className="popover-heading">
              Visible layers
              <button
                onClick={() => setShowControls(false)}
                aria-label="Close layer settings"
              >
                <X size={15} />
              </button>
            </div>
            {model?.contextStyle && (
              <label>
                <input
                  type="checkbox"
                  checked={state.doorsOpen}
                  onChange={(e) => patch({ doorsOpen: e.target.checked })}
                />
                Open doors & folding partitions
              </label>
            )}
            <label>
              Cut through building
              <select
                value={state.sectionAxis}
                onChange={(e) =>
                  patch({
                    sectionAxis: e.target.value as ViewerState['sectionAxis'],
                    plan: false,
                  })
                }
              >
                <option value="none">Off</option>
                <option value="z">Front to back</option>
                <option value="x">Right to left</option>
                <option value="y">Top to bottom</option>
              </select>
            </label>
            {state.sectionAxis !== 'none' && (
              <label className="section-range">
                Cut depth <span>{Math.round(state.section * 100)}%</span>
                <input
                  type="range"
                  aria-label="Building section depth"
                  min="0"
                  max="1"
                  step=".01"
                  value={state.section}
                  onChange={(e) => patch({ section: +e.target.value })}
                />
              </label>
            )}
            {(
              [
                'furniture',
                'site',
                'colors',
                'roof',
                'exterior',
                'ceilings',
                'community',
              ] as const
            )
              .filter((k) => k !== 'community' || (ready && hasCommunity))
              .map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={state[k]}
                  onChange={(e) => patch({ [k]: e.target.checked })}
                />
                {
                  (
                    {
                      furniture: 'Furniture & equipment',
                      site: 'Street & parking context',
                      colors: 'Color all areas',
                      roof: 'Roof surfaces',
                      exterior: 'Exterior envelope',
                      ceilings: 'Ceilings & structure',
                      community: 'Homes, pharmacy & partner sites',
                    } as const
                  )[k]
                }
              </label>
            ))}
            <label>
              Interior walls
              <select
                value={state.walls}
                onChange={(e) =>
                  patch({ walls: e.target.value as ViewerState['walls'] })
                }
              >
                <option value="cutaway">Cutaway</option>
                <option value="full">Full height</option>
                <option value="hidden">Hidden</option>
              </select>
            </label>
          </div>
        )}
        <div className="workspace-footer">
          <span>
            <Compass size={14} />
            Drag to orbit · Scroll to zoom · Right-drag to pan
          </span>
        </div>
      </section>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {modal && model && (
        <div className="dialog-shade" onClick={() => setModal(null)}>
          <section
            className={`viewer-dialog ${modal === 'accuracy' ? 'audit-dialog' : 'files-dialog'}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === 'accuracy'
                ? 'Accuracy register'
                : 'Portable model files'
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="dialog-close icon-button"
              onClick={() => setModal(null)}
              aria-label="Close dialog"
            >
              <X size={20} />
            </button>
            {modal === 'accuracy' ? (
              <>
                <div className="dialog-title">
                  <span className="overline">GEOMETRY & EVIDENCE</span>
                  <h2>Accuracy register</h2>
                  <p>
                    Documented measurements, image-derived geometry, and the
                    inputs still needed for an exact model.
                  </p>
                </div>
                <div className="audit-content">
                  <div className="audit-summary">
                    <div>
                      <strong>{model.referencePages.length}</strong>
                      <span>References indexed</span>
                    </div>
                    <div>
                      <strong>{model.rooms.length}</strong>
                      <span>Room / space records</span>
                    </div>
                    <div>
                      <strong>{model.objects.length}</strong>
                      <span>Replaceable objects</span>
                    </div>
                    <div>
                      <strong>{model.dimensions.length}</strong>
                      <span>Documented dimensions</span>
                    </div>
                  </div>
                  <div className="calibration-note">
                    <strong>{model.calibration.status}</strong>
                    <p>{model.calibration.notes}</p>
                    <span>
                      1 model unit = 1 meter ·{' '}
                      {model.calibration.pixelsPerMeter.toFixed(5)} source
                      pixels / meter
                    </span>
                  </div>
                  {model.interiorReview && (
                    <section className="interior-photo-review">
                      <h3>{model.interiorReview.title}</h3>
                      <p className="table-note">
                        {model.interiorReview.accuracy}
                      </p>
                      {model.interiorReview.items.map((item) => (
                        <details key={item.photo}>
                          <summary>
                            Photo {item.photo} · {item.title}
                          </summary>
                          <p>{item.matched}</p>
                          <p>
                            <strong>To verify:</strong> {item.unresolved}
                          </p>
                        </details>
                      ))}
                    </section>
                  )}
                  {model.dimensions.length > 0 && (
                    <>
                      <h3>Dimensions explicitly shown</h3>
                      <table>
                        <thead>
                          <tr>
                            <th>Element</th>
                            <th>Drawing value</th>
                            <th>Model value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {model.dimensions.map((d) => (
                            <tr key={d.id}>
                              <td>{d.meaning}</td>
                              <td>{d.sourceValue}</td>
                              <td>{d.value} m</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  {model.programs.length > 0 && (
                    <>
                      <h3>Published area schedule</h3>
                      <p className="table-note">
                        These are program areas from the PDF. A traced room or
                        floor perimeter may use a different net/gross boundary.
                      </p>
                      <table>
                        <thead>
                          <tr>
                            <th>Program / level</th>
                            <th>Published area</th>
                          </tr>
                        </thead>
                        <tbody>
                          {model.programs.map((p) => (
                            <tr key={p.id}>
                              <td>{p.name}</td>
                              <td>{p.publishedSqFt.toLocaleString()} sq ft</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                  <h3>
                    {siteId === 'alhambra'
                      ? 'Inputs still needed'
                      : 'Source notes & assumptions'}
                  </h3>
                  <div className="issue-list">
                    {model.accuracyIssues.map((issue, i) => (
                      <article key={issue.id}>
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <div>
                          <h4>{issue.title}</h4>
                          <p>{issue.detail}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="audit-end">
                    <button
                      className="primary"
                      onClick={() =>
                        jsonDownload(
                          {
                            calibration: model.calibration,
                            dimensions: model.dimensions,
                            programs: model.programs,
                            issues: model.accuracyIssues,
                            rooms: model.rooms,
                            pages: model.referencePages,
                          },
                          `${model.id}-accuracy-register.json`,
                        )
                      }
                    >
                      <Download size={16} />
                      Download accuracy register
                    </button>
                    <a
                      href={
                        model.exportFiles?.audit ||
                        '/models/accuracy-register.md'
                      }
                      download
                    >
                      Written audit
                      <ArrowDownToLine size={14} />
                    </a>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="dialog-title">
                  <span className="overline">PORTABLE FACILITY SYSTEM</span>
                  <h2>One viewer. Swappable buildings.</h2>
                  <p>
                    Layout, levels, furnishings, finishes, and site context are
                    stored in a single facility specification.
                  </p>
                </div>
                <div className="file-tabs">
                  <button
                    className={dataTab === 'overview' ? 'chosen' : ''}
                    onClick={() => setDataTab('overview')}
                  >
                    Model files
                  </button>
                  <button
                    className={dataTab === 'assets' ? 'chosen' : ''}
                    onClick={() => setDataTab('assets')}
                  >
                    Asset library{' '}
                    <span>{Object.keys(model.assets).length}</span>
                  </button>
                </div>
                {dataTab === 'overview' ? (
                  <div className="file-content">
                    <div className="model-identity">
                      <Box size={28} />
                      <div>
                        <strong>{model.name}</strong>
                        <span>{model.revision}</span>
                        <small>
                          Schema {model.schemaVersion} · meters ·{' '}
                          {model.levels.length} levels
                        </small>
                      </div>
                    </div>
                    <div className="file-action-grid">
                      <button
                        onClick={() => jsonDownload(model, `${model.id}.json`)}
                      >
                        <FileJson size={25} />
                        <strong>Export specification</strong>
                        <span>Portable layout, object IDs, and materials.</span>
                        <Download size={17} />
                      </button>
                      <button
                        disabled={exporting}
                        onClick={async () => {
                          setExporting(true);
                          try {
                            const blob = await viewer.current?.exportGLB();
                            if (blob) download(blob, `${model.id}.glb`);
                          } catch (e) {
                            console.error(e);
                            setNotice(
                              '3D export could not finish. The JSON specification is still available.',
                            );
                          } finally {
                            setExporting(false);
                          }
                        }}
                      >
                        <Box size={25} />
                        <strong>
                          {exporting ? 'Preparing model…' : 'Export 3D model'}
                        </strong>
                        <span>
                          Full building in meters, named objects, all levels and
                          site.
                        </span>
                        <Download size={17} />
                      </button>
                      <button onClick={() => upload.current?.click()}>
                        <Upload size={25} />
                        <strong>Open another specification</strong>
                        <span>
                          Load a compatible facility JSON locally in this
                          viewer.
                        </span>
                        <ArrowUpRight size={17} />
                      </button>
                      <button
                        onClick={() => {
                          const url = viewer.current?.snapshot();
                          if (url) {
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${model.id}-view.png`;
                            a.click();
                          }
                        }}
                      >
                        <Eye size={25} />
                        <strong>Save this view</strong>
                        <span>
                          Export the current model view as a PNG image.
                        </span>
                        <Download size={17} />
                      </button>
                    </div>
                    <div className="reuse-note">
                      <h3>Shared Seen asset library</h3>
                      <p>
                        Replace the site, level elevations, room polygons, wall
                        segments and furniture transforms. Keep the material and
                        asset library to carry the same design language into the
                        next building.
                      </p>
                      <p>
                        Each furniture instance has a stable ID. Replace one
                        reusable asset definition or provide its{' '}
                        <code>modelUrl</code> to swap in a manufacturer’s GLB
                        across all matching instances.
                      </p>
                      <a
                        href={
                          model.exportFiles?.glb || `/models/${model.id}.glb`
                        }
                        download
                      >
                        Current building GLB
                        <ArrowDownToLine size={14} />
                      </a>
                      <a href="/models/facility-format.md" download>
                        Specification guide
                        <ArrowDownToLine size={14} />
                      </a>
                      <a href="/models/facility.schema.json" download>
                        JSON schema
                        <ArrowDownToLine size={14} />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="asset-list">
                    <p>
                      Horizontal footprints follow the current plan where
                      traced; heights and product geometry remain provisional.
                      Replace them with the installed furniture schedule for
                      exact geometry.
                    </p>
                    <table>
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>W × H × D, meters</th>
                          <th>Instances</th>
                          <th>Model</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(model.assets).map(([id, a]) => (
                          <tr key={id}>
                            <td>
                              <strong>{id}</strong>
                              <small>
                                {a.kind} · {a.material}
                              </small>
                            </td>
                            <td>{a.dimensions.join(' × ')}</td>
                            <td>
                              {
                                model.objects.filter((o) => o.assetId === id)
                                  .length
                              }
                            </td>
                            <td>
                              {a.modelUrl ? 'External GLB' : 'Procedural'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <input
        ref={upload}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Open facility specification"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openModel(f);
          e.target.value = '';
        }}
      />
    </main>
  );
}
