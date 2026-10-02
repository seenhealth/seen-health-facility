'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  atHome,
  before,
  hero,
  isMeanwhile,
  isTeamMeeting,
  kickerTime,
  memberById,
  shortLabel,
  steps,
  totals,
  withHero,
  type Step,
} from './data';
import {
  C,
  HUB,
  NODE,
  R,
  VIEW,
  arrows,
  chord,
  groupArcs,
  ringNodes,
  spoke,
} from './idt-geometry';

/** `mesh`: a team meeting, every discipline joined to every other. */
export type RingMode = 'idle' | 'intro' | 'step' | 'mesh';

/** Moments of Mrs. Lin's day each discipline takes part in. */
const involvement = new Map(
  ringNodes.map((n) => [n.id, steps.filter((s) => s.roles.includes(n.id)).length]),
);
const pct = (v: number) => `${((v / VIEW) * 100).toFixed(3)}%`;

/** Number that rolls toward its target without re-rendering React. */
export function Counter({
  value,
  label,
  className = 'story-stat',
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    shown = useRef(value);
  // React renders the first value only; later values roll in imperatively.
  const [initial] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current,
      to = value;
    if (from === to) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown.current = to;
      el.textContent = String(to);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const run = (now: number) => {
      const k = Math.min(1, (now - t0) / 700),
        e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (to - from) * e);
      shown.current = v;
      el.textContent = String(v);
      if (k < 1) raf = requestAnimationFrame(run);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <div className={className}>
      <span className="story-stat-value" ref={ref}>
        {initial}
      </span>
      <span className="story-stat-label">{label}</span>
    </div>
  );
}

export function IdtRing({
  mode,
  step,
  phase,
  compact = false,
}: {
  mode: RingMode;
  step: Step | null;
  phase: number;
  compact?: boolean;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const involved = useMemo(() => new Set(step?.roles || []), [step]);
  const flows = useMemo(() => arrows(step?.handoffs || []), [step]);
  const all = mode === 'intro' || mode === 'mesh';
  const active = (id: string) => all || (mode === 'step' && involved.has(id));
  const meeting = mode === 'mesh';
  // Without her in the picture (team meetings, the kitchen) her node dims.
  const heroAway = !!step && !withHero(step);
  const hubName = hero.name;
  const hubMeta =
    step && atHome(step)
      ? 'At home'
      : step && isMeanwhile(step)
        ? 'Her lunch'
        : heroAway
          ? 'Discussed'
          : `${hero.age} · ${hero.mobility}`;
  const focused = focus ? memberById.get(focus) : null;
  const pairs = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < ringNodes.length; i++)
      for (let j = i + 1; j < ringNodes.length; j++) out.push([i, j]);
    return out;
  }, []);
  const stepKey = step?.id || mode;

  return (
    <div className="story-ring" data-mode={mode} data-compact={compact || undefined}>
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="story-ring-svg"
        aria-label={`Care team ring: the eleven disciplines around ${hero.name}`}
      >
        <circle className="story-ring-track" cx={C} cy={C} r={R} />
        {!compact &&
          groupArcs.map((g) => (
            <g key={g!.id} className="story-ring-group">
              <path d={g!.d} />
            </g>
          ))}
        <g className="story-ring-mesh" data-on={meeting || undefined} key={`mesh-${stepKey}`}>
          {pairs.map(([i, j], k) => (
            <path
              key={k}
              d={chord(ringNodes[i], ringNodes[j])}
              pathLength={1}
              style={{ '--k': (k % 11) + Math.floor(k / 11) } as CSSProperties}
            />
          ))}
        </g>
        <g className="story-ring-spokes" key={`spokes-${stepKey}`}>
          {ringNodes.map((n, k) => (
            <path
              key={n.id}
              d={spoke(n)}
              pathLength={1}
              className={active(n.id) ? 'on' : undefined}
              data-away={heroAway || undefined}
              style={{ '--c': n.color, '--k': k } as CSSProperties}
            />
          ))}
        </g>
        <g className="story-ring-flows" key={`flows-${stepKey}`}>
          {flows.map((f, k) => (
            <g
              key={f.key}
              className={k < phase ? 'story-flow-arrow on' : 'story-flow-arrow'}
              style={{ '--c': f.from.color } as CSSProperties}
            >
              <path className="stroke" d={f.d} pathLength={1} />
              <path className="head" d={f.head} />
              <circle className="pulse" r={3.2}>
                <animateMotion dur="2.2s" repeatCount="indefinite" path={f.d} />
              </circle>
            </g>
          ))}
        </g>
        {ringNodes.map((n, k) => {
          const on = active(n.id);
          return (
            <g
              key={n.id}
              className={`story-node${on ? ' on' : ''}${focus === n.id ? ' focus' : ''}`}
              style={{ '--c': n.color, '--k': k } as CSSProperties}
              transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}
              tabIndex={compact ? -1 : 0}
              role={compact ? undefined : 'button'}
              aria-label={compact ? undefined : `${n.title}: ${n.focus}`}
              onPointerEnter={() => setFocus(n.id)}
              onPointerLeave={() => setFocus((f) => (f === n.id ? null : f))}
              onFocus={() => setFocus(n.id)}
              onBlur={() => setFocus((f) => (f === n.id ? null : f))}
              onClick={() => setFocus((f) => (f === n.id ? null : n.id))}
            >
              <circle className="halo" r={NODE + 9} />
              <circle className="dot" r={NODE} />
              <circle className="core" r={3.2} />
              <text
                className="label"
                x={(n.lx - n.x).toFixed(1)}
                y={(n.ly - n.y).toFixed(1)}
                textAnchor={n.anchor}
              >
                {n.short}
              </text>
            </g>
          );
        })}
        <g className="story-hub" data-away={heroAway || undefined} transform={`translate(${C} ${C})`}>
          <circle className="halo" r={HUB + 10} />
          <circle className="disc" r={HUB} />
          {!compact && (
            <text className={hubName.length > 9 ? 'name long' : 'name'} y={-1}>
              {hubName}
            </text>
          )}
          {!compact && (
            <text className="meta" y={15}>
              {hubMeta}
            </text>
          )}
        </g>
      </svg>
      {!compact && (
        <div className="story-captions" key={`cap-${stepKey}`}>
          {flows.map((f, k) => (
            <div
              key={f.key}
              className={k < phase ? 'story-caption on' : 'story-caption'}
              data-slot={f.slot}
              style={
                {
                  left: pct(f.cx),
                  top: pct(f.cy),
                  '--c': f.from.color,
                } as CSSProperties
              }
            >
              <span className="route">
                <b style={{ color: f.from.color }}>{f.from.short}</b>
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> to </span>
                <b style={{ color: f.to.color }}>{f.to.short}</b>
              </span>{' '}
              <span className="note">{f.note}</span>
            </div>
          ))}
        </div>
      )}
      {!compact && (
        <div className={focused ? 'story-focus on' : 'story-focus'} aria-live="polite">
          {focused && (
            <>
              <span className="swatch" style={{ background: focused.color }} />
              <span className="title">{focused.title}</span>
              <span className="text">{focused.focus}</span>
              <span className="count">
                Part of {involvement.get(focused.id)} of {steps.length} moments in {hero.name}’s day
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function DayFlow({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (i: number) => void;
}) {
  const s = current >= 0 ? steps[current] : null;
  return (
    <div className="story-dayflow">
      <ol
        className="story-dayflow-list"
        style={
          {
            '--done': Math.max(0, current) / (steps.length - 1),
            '--n': steps.length,
          } as CSSProperties
        }
      >
        {steps.map((step, i) => (
          <li key={step.id} data-state={i < current ? 'past' : i === current ? 'now' : 'next'}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`${kickerTime(step)}, ${step.title}`}
              aria-current={i === current ? 'step' : undefined}
            >
              <span className="node" />
              <span className="roles" data-team={isTeamMeeting(step) || undefined}>
                {step.roles.map((r) => (
                  <i key={r} style={{ background: memberById.get(r)?.color }} />
                ))}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="story-dayflow-label" aria-live="polite">
        {s ? (
          <>
            <b>{kickerTime(s)}</b> {shortLabel(s)}
          </>
        ) : (
          <>
            <b>8:00 AM</b> to <b>4:00 PM</b>, one participant
          </>
        )}
      </p>
    </div>
  );
}

export function IdtPanel({
  mode,
  step,
  stepIndex,
  phase,
  onSelect,
}: {
  mode: RingMode;
  step: Step | null;
  stepIndex: number;
  phase: number;
  onSelect: (i: number) => void;
}) {
  // Counts before the active step (the whole day once no step is active).
  const i = step ? Math.max(0, stepIndex) : steps.length;
  const touch = stepIndex < 0 ? 0 : before[i].touchpoints + (step ? step.roles.length : 0);
  const hand = stepIndex < 0 ? 0 : before[i].handoffs + (step ? phase : 0);
  return (
    <aside className="story-idt" aria-label="The interdisciplinary care team">
      <header className="story-idt-head">
        <div>
          <p className="story-idt-eyebrow">Interdisciplinary team</p>
          <p className="story-idt-title">
            {mode === 'mesh'
              ? 'All eleven, one table'
              : mode === 'intro'
                ? `Around ${hero.name}`
                : step && step.roles.length
                  ? `${step.roles.length} of ${totals.disciplines} involved`
                  : 'Around one person'}
          </p>
        </div>
        <div className="story-idt-stats">
          <Counter value={touch} label="Touchpoints" />
          <Counter value={hand} label="Handoffs" />
        </div>
      </header>
      <IdtRing mode={mode} step={step} phase={phase} />
      <DayFlow current={stepIndex} onSelect={onSelect} />
    </aside>
  );
}
