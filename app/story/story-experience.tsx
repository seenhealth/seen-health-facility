'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  clockLabel,
  hero,
  isTeamMeeting,
  kickerTime,
  memberById,
  members,
  palette,
  steps,
  totals,
} from './data';
import { createDirector, type BeatDef, type BeatKind, type Director, type Framing } from './director';
import { Counter, IdtPanel, IdtRing, type RingMode } from './idt-panel';
import { bootStage } from './stage';
import { Swimlane } from './swimlane';

export type StoryProps = {
  /** Base URL for runtime assets (facility JSON, textures, logo). Ends with "/". */
  assetBase?: string;
  /** "Explore the 3D center" destination. */
  exploreHref?: string;
  /** "Learn more about Seen Health" destination. */
  learnMoreHref?: string;
};

const BEATS: BeatDef[] = [
  { kind: 'opening' },
  { kind: 'reveal' },
  { kind: 'team' },
  ...steps.map((step, stepIndex) => ({ kind: 'chapter' as const, step, stepIndex })),
  { kind: 'finale' },
  { kind: 'cta' },
];
const FIRST_CHAPTER = BEATS.findIndex((b) => b.kind === 'chapter');
const FINALE = BEATS.findIndex((b) => b.kind === 'finale');
const MOBILE = '(max-width: 760px)';

function Kicker({ text }: { text: string }) {
  const [time, ...rest] = text.split('·');
  if (!rest.length) return <p className="story-kicker">{text}</p>;
  return (
    <p className="story-kicker">
      <span className="time">{time.trim()}</span>
      <span className="sep" aria-hidden="true" />
      <span>{rest.join('·').trim()}</span>
    </p>
  );
}

function RoleChips({ roles }: { roles: string[] }) {
  if (roles.length >= members.length)
    return (
      <p className="story-chips">
        <span className="story-chip team">
          <span className="swatches" aria-hidden="true">
            {members.map((m) => (
              <i key={m.id} style={{ background: m.color }} />
            ))}
          </span>
          All eleven disciplines
        </span>
      </p>
    );
  return (
    <ul className="story-chips" aria-label="Disciplines involved">
      {roles.map((r) => {
        const m = memberById.get(r);
        if (!m) return null;
        return (
          <li key={r} className="story-chip" style={{ '--c': m.color } as CSSProperties}>
            <i aria-hidden="true" />
            {m.title}
          </li>
        );
      })}
    </ul>
  );
}

export function StoryExperience({
  assetBase = '/',
  exploreHref = '/',
  learnMoreHref = 'https://seenhealth.org/',
}: StoryProps) {
  const base = assetBase.endsWith('/') ? assetBase : assetBase + '/';
  const rootRef = useRef<HTMLDivElement>(null),
    hostRef = useRef<HTMLDivElement>(null),
    sectionRefs = useRef<HTMLElement[]>([]),
    clockRef = useRef<HTMLSpanElement>(null),
    pinRef = useRef<HTMLDivElement>(null),
    directorRef = useRef<Director | null>(null),
    layoutRef = useRef({ chapterX: 0, chapterY: 0, openingY: 0.1, revealX: 0, zoom: 1, wideZoom: 1 });
  const [beat, setBeat] = useState(0),
    [phase, setPhase] = useState(0),
    [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading'),
    [embed, setEmbed] = useState(false),
    [mobile, setMobile] = useState(false);

  const current = BEATS[beat] || BEATS[0];
  const stepIndex =
    current.kind === 'chapter'
      ? current.stepIndex!
      : beat >= FINALE
        ? steps.length - 1
        : -1;
  const step = current.kind === 'chapter' ? current.step! : null;
  const ringMode: RingMode =
    current.kind === 'team'
      ? 'intro'
      : step
        ? isTeamMeeting(step)
          ? 'mesh'
          : 'step'
        : 'idle';
  const finaleRevealed = beat === FINALE ? phase : beat > FINALE ? steps.length + 1 : 0;

  const framing = useCallback((kind: BeatKind): Framing => {
    const l = layoutRef.current;
    if (kind === 'opening') return { x: 0, y: l.openingY, zoom: l.wideZoom };
    if (kind === 'reveal') return { x: l.revealX, y: 0.02, zoom: l.wideZoom };
    if (kind === 'team') return { x: l.chapterX, y: l.chapterY, zoom: l.wideZoom };
    if (kind === 'chapter') return { x: l.chapterX, y: l.chapterY, zoom: l.zoom };
    return { x: 0, y: 0.04, zoom: l.wideZoom };
  }, []);

  // Where the 3D subject should sit: between the chapter card and the team panel.
  const measureLayout = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const w = window.innerWidth,
      h = window.innerHeight;
    if (window.matchMedia(MOBILE).matches) {
      // The orthographic scale follows stage height; the small-screen stage is
      // ~56% of the viewport, so rooms need extra zoom to read at the same size.
      layoutRef.current = {
        chapterX: 0,
        chapterY: 0.02,
        openingY: 0,
        revealX: 0,
        zoom: 1.45,
        wideZoom: 1.3,
      };
      return;
    }
    const card = root.querySelector<HTMLElement>('.story-chapter .story-card');
    const panel = root.querySelector<HTMLElement>('.story-idt');
    const left = card ? card.getBoundingClientRect().right : w * 0.36;
    const right = panel ? panel.getBoundingClientRect().left : w * 0.7;
    const mid = (left + right) / 2;
    layoutRef.current = {
      chapterX: (mid - w / 2) / w,
      chapterY: 0.02,
      openingY: h > 700 ? 0.21 : 0.16,
      revealX: ((left + w) / 2 - w / 2) / w,
      zoom: 1,
      wideZoom: 1,
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    setEmbed(params.get('embed') === '1');
    const mq = window.matchMedia(MOBILE),
      rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMobile(mq.matches);
    measureLayout();
    const director = createDirector({
      root,
      sections: sectionRefs.current.filter(Boolean),
      beats: BEATS,
      reducedMotion: rm.matches,
      framing,
      heroPin: pinRef.current,
      hooks: {
        onBeat: (i) => {
          setBeat(i);
          setPhase(0);
        },
        onPhase: setPhase,
        onClock: (t) => {
          if (clockRef.current) clockRef.current.textContent = clockLabel(t);
        },
      },
    });
    directorRef.current = director;
    const onMq = () => {
      setMobile(mq.matches);
      measureLayout();
      director.measure();
    };
    const onRm = () => director.setReducedMotion(rm.matches);
    const onResize = () => measureLayout();
    mq.addEventListener('change', onMq);
    rm.addEventListener('change', onRm);
    window.addEventListener('resize', onResize);
    if (params.get('debug') === '1')
      (window as unknown as { __story: unknown }).__story = { director };

    // Boot the 3D stage after the opening typography has painted.
    const abort = new AbortController();
    let viewer: { dispose(): void } | null = null;
    const timer = window.setTimeout(() => {
      const host = hostRef.current;
      if (!host) return;
      bootStage(host, base, abort.signal)
        .then(({ viewer: v, model, heroId }) => {
          if (abort.signal.aborted) {
            v.dispose();
            return;
          }
          viewer = v;
          director.attach(v, model, heroId, host);
          if (params.get('debug') === '1')
            (window as unknown as { __story: unknown }).__story = { director, viewer: v, model };
          requestAnimationFrame(() => setStatus('ready'));
        })
        .catch((e: unknown) => {
          if (abort.signal.aborted) return;
          console.warn('Story stage unavailable; showing the illustrated fallback.', e);
          setStatus('fallback');
        });
    }, 120);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
      mq.removeEventListener('change', onMq);
      rm.removeEventListener('change', onRm);
      window.removeEventListener('resize', onResize);
      director.dispose();
      directorRef.current = null;
      viewer?.dispose();
    };
  }, [base, framing, measureLayout]);

  // Keep the page background continuous with the story while it is mounted.
  useEffect(() => {
    const el = document.documentElement,
      prev = el.style.background;
    el.style.background = palette.paper;
    return () => {
      el.style.background = prev;
    };
  }, []);

  useEffect(() => {
    measureLayout();
    directorRef.current?.measure();
  }, [embed, mobile, measureLayout]);

  const scrollToBeat = useCallback((i: number) => {
    const el = sectionRefs.current[i];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    // Land where the chapter card is pinned and the clock has just started.
    const y = BEATS[i].kind === 'finale' ? top + window.innerHeight * 0.9 : top + 2;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }, []);
  const goToStep = useCallback((s: number) => scrollToBeat(FIRST_CHAPTER + s), [scrollToBeat]);

  const registerSection = useCallback((el: HTMLElement | null) => {
    if (el) sectionRefs.current[Number(el.dataset.beatIndex)] = el;
  }, []);
  const logo = `${base}brand/seen-health-horizontal.png`;
  const teamIntro = useMemo(
    () =>
      ['clinical', 'therapy', 'support', 'operations'].map((g) => members.filter((m) => m.group === g)),
    [],
  );

  return (
    <div
      className="story-root"
      ref={rootRef}
      data-embed={embed || undefined}
      data-status={status}
      data-beat={current.kind}
      style={
        {
          '--paper': palette.paper,
          '--ink': palette.ink,
          '--brand': palette.brandDeep,
          '--leaf': palette.brandLeaf,
        } as CSSProperties
      }
    >
      <a className="story-skip" href="#story-summary">
        Skip to the team summary
      </a>
      <header className="story-chrome">
        <a className="story-brand" href={learnMoreHref} target="_top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="Seen Health" width={262} height={18} />
        </a>
        <a className="story-chrome-link" href={exploreHref} target="_top">
          <span>
            <span className="long">Explore the </span>3D center
          </span>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 11 11 5M6 5h5v5" />
          </svg>
        </a>
      </header>

      <div className="story-stage" aria-hidden="true">
        <div className="story-canvas" ref={hostRef} />
        <div className="story-fallback" />
        <div className="story-hero-pin" ref={pinRef}>
          <span className="tag">{hero.name}</span>
          <span className="stem" />
          <span className="dot" />
        </div>
        <div className="story-scrim" />
        <div className="story-veil" />
      </div>
      <p className="sr-only">
        As you scroll, an animated 3D model of the Seen Health center in Alhambra follows {hero.name}{' '}
        from room to room, while a diagram of her eleven-person care team shows who is involved in each
        moment and how information is handed from one discipline to the next.
      </p>
      <output className="story-loading" aria-live="polite">
        {status === 'loading' ? (
          <>
            <span className="bar" aria-hidden="true" />
            Preparing the 3D center
          </>
        ) : null}
      </output>

      <div className="story-idt-wrap">
        <IdtPanel mode={ringMode} step={step} stepIndex={stepIndex} phase={phase} onSelect={goToStep} />
      </div>
      <div className="story-idt-compact" aria-hidden="true">
        <IdtRing mode={ringMode} step={step} phase={phase} compact />
      </div>

      <nav className="story-rail" aria-label="Moments of the day">
        <span className="story-rail-clock" aria-hidden="true">
          <span ref={clockRef}>8:00 AM</span>
        </span>
        <ol className="story-rail-track">
          <li className="story-rail-fill" aria-hidden="true" />
          {steps.map((s, i) => (
            <li
              key={s.id}
              className="story-rail-tick"
              data-state={i < stepIndex ? 'past' : i === stepIndex ? 'now' : 'next'}
              style={{ '--at': s.window[0] / 720 } as CSSProperties}
            >
              <button
                type="button"
                onClick={() => goToStep(i)}
                aria-label={`${kickerTime(s)}: ${s.title}`}
                aria-current={i === stepIndex ? 'step' : undefined}
                data-label={`${kickerTime(s)} · ${s.title}`}
              />
            </li>
          ))}
        </ol>
      </nav>

      <main className="story-main">
        <section className="story-beat story-opening" ref={registerSection} data-beat-index={0} aria-labelledby="story-title">
          <div className="story-pin">
            <div className="story-opening-copy">
              <p className="story-eyebrow">A day at Seen Health · Alhambra, California</p>
              <h1 id="story-title" className="story-display">
                <span>One day.</span> <span>Eleven people.</span> <span className="accent">One life, fully seen.</span>
              </h1>
              <p className="story-lede">
                Follow {hero.name}, {hero.age}, through a day at our PACE center, and meet the team that plans,
                delivers and oversees every part of her care.
              </p>
            </div>
            <button type="button" className="story-cue" onClick={() => scrollToBeat(1)}>
              <span>Scroll to begin</span>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 6.5 8 10.5 12 6.5" />
              </svg>
            </button>
          </div>
        </section>

        <section className="story-beat story-reveal" ref={registerSection} data-beat-index={1} aria-labelledby="story-reveal-title">
          <div className="story-pin">
            <article className="story-card">
              <p className="story-kicker">
                <span className="time">Inside the center</span>
              </p>
              <h2 id="story-reveal-title" className="story-headline">
                Everything she needs, under one roof.
              </h2>
              <p className="story-body">
                A clinic, a therapy gym, a day room, dining, personal care and, upstairs, the team that plans it
                all. PACE brings a doctor’s office, a day center and home care together in one place.
              </p>
            </article>
          </div>
        </section>

        <section className="story-beat story-team" ref={registerSection} data-beat-index={2} aria-labelledby="story-team-title">
          <div className="story-pin">
            <article className="story-card">
              <p className="story-kicker">
                <span className="time">The interdisciplinary team</span>
              </p>
              <h2 id="story-team-title" className="story-headline">
                Eleven disciplines. One plan.
              </h2>
              <p className="story-body">
                Every PACE participant has an interdisciplinary team who design, deliver and oversee her care
                together. Here is {hero.name}’s.
              </p>
              <ul className="story-legend" aria-label="The eleven disciplines">
                {teamIntro.flat().map((m) => (
                  <li key={m.id} style={{ '--c': m.color } as CSSProperties}>
                    <i aria-hidden="true" />
                    {m.title}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        {steps.map((s, i) => (
          <section
            key={s.id}
            id={`moment-${s.id}`}
            className="story-beat story-chapter"
            data-team={isTeamMeeting(s) || undefined}
            ref={registerSection} data-beat-index={FIRST_CHAPTER + i}
            aria-labelledby={`moment-${s.id}-title`}
          >
            <div className="story-pin">
              <article className="story-card">
                <Kicker text={s.kicker} />
                <h2 id={`moment-${s.id}-title`} className="story-headline">
                  {s.title}
                </h2>
                <p className="story-body">{s.body}</p>
                <RoleChips roles={s.roles} />
                {s.handoffs.length > 0 && (
                  <ol className="story-handoffs" aria-label="Handoffs">
                    {s.handoffs.map((h, k) => {
                      const a = memberById.get(h.from),
                        b = memberById.get(h.to);
                      return (
                        <li
                          key={k}
                          data-on={(beat === FIRST_CHAPTER + i && k < phase) || undefined}
                          style={{ '--a': a?.color, '--b': b?.color } as CSSProperties}
                        >
                          <span className="route">
                            {a?.short} <span aria-hidden="true">→</span>
                            <span className="sr-only">to</span> {b?.short}
                          </span>
                          <span className="note">{h.note}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </article>
            </div>
          </section>
        ))}

        <section
          className="story-beat story-finale"
          id="story-summary"
          ref={registerSection} data-beat-index={FINALE}
          aria-labelledby="story-finale-title"
        >
          <div className="story-pin">
            <div className="story-finale-inner">
              <div className="story-finale-head">
                <p className="story-eyebrow">4:00 PM · The whole day, at a glance</p>
                <h2 id="story-finale-title" className="story-headline large">
                  The whole team, around one person.
                </h2>
                <p className="story-body">
                  Eleven disciplines each saw a different part of {hero.name}’s day. Every observation was handed
                  to the person who could act on it, and all of it landed in one shared care plan.
                </p>
              </div>
              <Swimlane revealed={finaleRevealed} />
              <div className="story-totals" data-on={finaleRevealed > steps.length || undefined}>
                <Counter className="story-total" value={finaleRevealed > steps.length ? totals.disciplines : 0} label="disciplines" />
                <Counter className="story-total" value={finaleRevealed > steps.length ? totals.touchpoints : 0} label="touchpoints" />
                <Counter className="story-total" value={finaleRevealed > steps.length ? totals.handoffs : 0} label="handoffs" />
                <Counter className="story-total" value={finaleRevealed > steps.length ? 1 : 0} label="shared care plan" />
              </div>
            </div>
          </div>
        </section>

        <section className="story-beat story-cta" ref={registerSection} data-beat-index={FINALE + 1} aria-labelledby="story-cta-title">
          <div className="story-cta-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="story-cta-logo" src={logo} alt="" width={262} height={18} />
            <h2 id="story-cta-title" className="story-headline large">
              Care that sees the whole person.
            </h2>
            <p className="story-body">
              Seen Health is a PACE program: medical care, therapy, meals, transportation, social work and support
              at home, coordinated by one team so older adults can keep living in their community.
            </p>
            <div className="story-actions">
              <a className="story-button primary" href={learnMoreHref} target="_top">
                Learn more about Seen Health
              </a>
              <a className="story-button" href={exploreHref} target="_top">
                Explore the 3D center
              </a>
            </div>
          </div>
          <footer className="story-foot">
            <p>
              {hero.name} is a composite, illustrative participant. Her day is compressed and does not describe a
              real person or record.
            </p>
            <p>
              The eleven roles shown are the disciplines a PACE interdisciplinary team must include (42 CFR
              460.102(b)); they are roles, not named employees.
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}
