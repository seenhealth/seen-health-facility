'use client';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  clockLabel,
  hero,
  highlights,
  isCutaway,
  isMeanwhile,
  isTeamMeeting,
  kickerTime,
  memberById,
  members,
  palette,
  placeLabel,
  scrub,
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

/**
 * Mrs. Lin's day from her front door and back, the whole day at a glance,
 * then a rapid run through everything else the team coordinates (each on its
 * own clock), and home again for the close.
 */
const BEATS: BeatDef[] = [
  { kind: 'opening' },
  { kind: 'reveal' },
  { kind: 'team' },
  ...steps.map((step, stepIndex) => ({ kind: 'chapter' as const, step, stepIndex })),
  { kind: 'finale' },
  { kind: 'network' },
  ...highlights.map((highlight, highlightIndex) => ({
    kind: 'highlight' as const,
    highlight,
    highlightIndex,
  })),
  { kind: 'peace' },
  { kind: 'cta' },
];
const FIRST_CHAPTER = BEATS.findIndex((b) => b.kind === 'chapter');
const FINALE = BEATS.findIndex((b) => b.kind === 'finale');
const NETWORK = BEATS.findIndex((b) => b.kind === 'network');
const PEACE = BEATS.findIndex((b) => b.kind === 'peace');
const MOBILE = '(max-width: 760px)';
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Stage transition at a cut: covers in, holds a beat, reveals (ms). */
const WIPE = { cover: 340, hold: 70, reveal: 520 };

/**
 * Kinetic headline: each word rises out of its own mask when the section
 * becomes active (`data-active`), staggered by `--w`. Screen readers get the
 * plain sentence.
 */
function Words({ text, className }: { text: string; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={className ? `story-words ${className}` : 'story-words'}>
      <span className="sr-only">{text}</span>
      {words.map((w, k) => (
        <Fragment key={k}>
          <span className="w" aria-hidden="true">
            <span style={{ '--w': k } as CSSProperties}>{w}</span>
          </span>
          {k < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  );
}

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

function RoleChips({ roles, partners = [] }: { roles: string[]; partners?: string[] }) {
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
    <ul
      className="story-chips"
      aria-label={partners.length ? 'Disciplines and partners involved' : 'Disciplines involved'}
    >
      {roles.map((r, k) => {
        const m = memberById.get(r);
        if (!m) return null;
        return (
          <li key={r} className="story-chip" style={{ '--c': m.color, '--k': k } as CSSProperties}>
            <i aria-hidden="true" />
            {m.title}
          </li>
        );
      })}
      {partners.map((p, k) => (
        <li key={p} className="story-chip partner" style={{ '--k': roles.length + k } as CSSProperties}>
          <i aria-hidden="true" />
          {p}
        </li>
      ))}
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
    wipeRef = useRef<HTMLDivElement>(null),
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
    current.kind === 'team' ? 'intro' : step ? (isTeamMeeting(step) ? 'mesh' : 'step') : 'idle';
  const finaleRevealed = beat === FINALE ? phase : beat > FINALE ? steps.length + 1 : 0;

  const framing = useCallback((kind: BeatKind): Framing => {
    const l = layoutRef.current;
    if (kind === 'opening') return { x: 0, y: l.openingY, zoom: l.wideZoom };
    if (kind === 'reveal' || kind === 'network') return { x: l.revealX, y: 0.02, zoom: l.wideZoom };
    if (kind === 'team') return { x: l.chapterX, y: l.chapterY, zoom: l.wideZoom };
    if (kind === 'chapter') return { x: l.chapterX, y: l.chapterY, zoom: l.zoom };
    // Highlights: the scene sits up and to the right of the lower-left title.
    if (kind === 'highlight') return { x: l.revealX * 0.8, y: -0.06, zoom: l.zoom };
    // The close: the home below the copy, as in the opening.
    if (kind === 'peace' || kind === 'cta') return { x: 0, y: l.openingY * 1.3, zoom: l.zoom };
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
        // A shutter crosses the stage: it sweeps in with an accelerating
        // edge, holds while the director swaps camera, clock and view
        // underneath, and sweeps out decelerating. Direction follows scroll.
        onCut: (direction) => {
          const el = wipeRef.current;
          if (!el || typeof el.animate !== 'function') return 0;
          const total = WIPE.cover + WIPE.hold + WIPE.reveal,
            from = direction > 0 ? 118 : -118,
            at = (x: number) => `translate3d(${x}%, 0, 0) skewX(-12deg)`;
          el.dataset.dir = direction > 0 ? 'in' : 'back';
          for (const a of el.getAnimations()) a.cancel();
          el.animate(
            [
              { transform: at(from), easing: 'cubic-bezier(0.7, 0, 0.84, 0)' },
              { transform: at(0), offset: WIPE.cover / total },
              { transform: at(0), offset: (WIPE.cover + WIPE.hold) / total, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
              { transform: at(-from) },
            ],
            { duration: total, fill: 'none' },
          );
          return WIPE.cover + WIPE.hold * 0.5;
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
        <div className="story-glow" />
        <div className="story-hero-pin" ref={pinRef}>
          <span className="tag">{hero.name}</span>
          <span className="stem" />
          <span className="dot" />
        </div>
        <div className="story-scrim" />
        <div className="story-veil" />
        <div className="story-wipe" ref={wipeRef}>
          <i />
        </div>
      </div>
      <p className="sr-only">
        As you scroll, an animated 3D model follows {hero.name} from her front door to the Seen Health center in
        Alhambra and home again, while a diagram of her eleven-person care team shows who is involved in each
        moment and how information is handed from one discipline to the next. Then it looks in, one by one, on
        the other kinds of care the same team coordinates across the community.
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
              style={{ '--at': scrub[i][0] / 720 } as CSSProperties}
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

      {/* Highlights: one segment per service, filled by scroll (--hl). */}
      <ol className="story-progress" aria-hidden="true">
        {highlights.map((h, i) => (
          <li key={h.id} style={{ '--i': i } as CSSProperties}>
            <i />
          </li>
        ))}
      </ol>

      <main className="story-main">
        <section
          className="story-beat story-opening"
          ref={registerSection}
          data-beat-index={0}
          data-active={beat === 0 || undefined}
          aria-labelledby="story-title"
        >
          <div className="story-pin">
            <div className="story-opening-copy">
              <p className="story-eyebrow">A day at Seen Health · Alhambra, California</p>
              <h1 id="story-title" className="story-display">
                <Words text="One day." /> <Words text="Eleven people." />{' '}
                <Words className="accent" text="One life, fully seen." />
              </h1>
              <p className="story-lede">
                Follow {hero.name}, {hero.age}, from her front door to our PACE center and home again, and meet the
                team that plans, delivers and oversees every part of her care, wherever it happens.
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

        <section
          className="story-beat story-reveal"
          ref={registerSection}
          data-beat-index={1}
          data-active={beat === 1 || undefined}
          aria-labelledby="story-reveal-title"
        >
          <div className="story-pin">
            <article className="story-card">
              <p className="story-kicker">
                <span className="time">Inside the center</span>
              </p>
              <h2 id="story-reveal-title" className="story-headline">
                <Words text="Everything she needs, under one roof." />
              </h2>
              <p className="story-body">
                A clinic, a therapy gym, a day room, dining, personal care and, upstairs, the team that plans it
                all. PACE brings a doctor’s office, a day center and home care together in one place.
              </p>
            </article>
          </div>
        </section>

        <section
          className="story-beat story-team"
          ref={registerSection}
          data-beat-index={2}
          data-active={beat === 2 || undefined}
          aria-labelledby="story-team-title"
        >
          <div className="story-pin">
            <article className="story-card">
              <p className="story-kicker">
                <span className="time">The interdisciplinary team</span>
              </p>
              <h2 id="story-team-title" className="story-headline">
                <Words text="Eleven disciplines. One plan." />
              </h2>
              <p className="story-body">
                Every PACE participant has an interdisciplinary team who design, deliver and oversee her care
                together. Here is {hero.name}’s.
              </p>
              <ul className="story-legend" aria-label="The eleven disciplines">
                {teamIntro.flat().map((m, k) => (
                  <li key={m.id} style={{ '--c': m.color, '--k': k } as CSSProperties}>
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
            data-cutaway={isCutaway(s) || undefined}
            data-active={beat === FIRST_CHAPTER + i || undefined}
            ref={registerSection}
            data-beat-index={FIRST_CHAPTER + i}
            aria-labelledby={`moment-${s.id}-title`}
          >
            <div className="story-pin">
              <article className="story-card">
                {isMeanwhile(s) && (
                  <p className="story-meanwhile">
                    <i aria-hidden="true" />
                    Meanwhile, in the {placeLabel(s).toLowerCase()}
                  </p>
                )}
                <Kicker text={s.kicker} />
                <h2 id={`moment-${s.id}-title`} className="story-headline">
                  <Words text={s.title} />
                </h2>
                <p className="story-body">{s.body}</p>
                <RoleChips roles={s.roles} partners={s.partners} />
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
          ref={registerSection}
          data-beat-index={FINALE}
          data-active={beat === FINALE || undefined}
          aria-labelledby="story-finale-title"
        >
          <div className="story-pin">
            <div className="story-finale-inner">
              <div className="story-finale-head">
                <p className="story-eyebrow">4:00 PM · The whole day, at a glance</p>
                <h2 id="story-finale-title" className="story-headline large">
                  <Words text="The whole team, around one person." />
                </h2>
                <p className="story-body">
                  Eleven disciplines each saw a different part of {hero.name}’s day, from her front door and back
                  again. Every observation was handed to the person who could act on it, and all of it landed in one
                  shared care plan.
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

        <section
          className="story-beat story-network"
          ref={registerSection}
          data-beat-index={NETWORK}
          data-active={beat === NETWORK || undefined}
          aria-labelledby="story-network-title"
        >
          <div className="story-pin">
            <article className="story-card">
              <p className="story-kicker">
                <span className="time">Beyond one day</span>
              </p>
              <h2 id="story-network-title" className="story-headline">
                <Words text="Everything else, handled." />
              </h2>
              <p className="story-body">
                {hero.name}’s day is one of many. Around every participant, the same team coordinates care wherever
                it is needed, across town and around the clock.
              </p>
              <ol className="story-places" aria-label="Care the team coordinates across the community">
                {highlights.map((h, k) => (
                  <li key={h.id} style={{ '--k': k } as CSSProperties}>
                    <span className="n" aria-hidden="true">
                      {pad2(k + 1)}
                    </span>
                    {h.label}
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </section>

        {highlights.map((h, i) => (
          <section
            key={h.id}
            id={`highlight-${h.id}`}
            className="story-beat story-highlight"
            ref={registerSection}
            data-beat-index={NETWORK + 1 + i}
            data-active={beat === NETWORK + 1 + i || undefined}
            aria-labelledby={`highlight-${h.id}-title`}
          >
            <div className="story-pin">
              <article className="story-hl">
                <p className="story-hl-index" aria-hidden="true">
                  <span className="num">{pad2(i + 1)}</span>
                  <span className="of">/ {pad2(highlights.length)}</span>
                </p>
                <p className="story-hl-label">{h.label}</p>
                <h2 id={`highlight-${h.id}-title`} className="story-hl-title">
                  <Words text={h.title} />
                </h2>
                <p className="story-hl-body">{h.body}</p>
                <div className="story-hl-meta">
                  <Kicker text={h.kicker} />
                  <RoleChips roles={h.roles} partners={h.partners} />
                </div>
              </article>
            </div>
          </section>
        ))}

        <section
          className="story-beat story-peace"
          ref={registerSection}
          data-beat-index={PEACE}
          data-active={beat === PEACE || undefined}
          aria-labelledby="story-peace-title"
        >
          <div className="story-pin">
            <div className="story-peace-copy">
              <p className="story-eyebrow">4:00 PM · Home</p>
              <h2 id="story-peace-title" className="story-display">
                <Words text="Home by four." /> <Words text="Tea with her daughter." />{' '}
                <Words className="accent" text="We’ve got them." />
              </h2>
              <p className="story-lede">
                That is peace of mind: a family that knows the same team will be there tomorrow, at home, at the
                center and everywhere in between.
              </p>
            </div>
          </div>
        </section>

        <section
          className="story-beat story-cta"
          ref={registerSection}
          data-beat-index={PEACE + 1}
          data-active={beat === PEACE + 1 || undefined}
          aria-labelledby="story-cta-title"
        >
          <div className="story-cta-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="story-cta-logo" src={logo} alt="" width={262} height={18} />
            <h2 id="story-cta-title" className="story-headline large">
              <Words text="Care that sees the whole person." />
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
              {hero.name}, her daughter and the Wongs are composite, illustrative people, and the partner sites around
              the center are illustrative too. Their days are compressed and do not describe real people, places or
              records.
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
