'use client';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Armchair,
  BusFront,
  LocateFixed,
  PersonStanding,
  X,
} from 'lucide-react';
import type { ActivitySnapshot } from '../model/activity';
import { describeTarget, type InspectCard as Card } from '../model/inspect';
import { sameTarget, targetKey, type InspectTarget } from '../model/pick';
import type { createViewer } from '../model/renderer';

type Viewer = ReturnType<typeof createViewer>;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICONS = { person: PersonStanding, object: Armchair, vehicle: BusFront };

/** The card's text, shared by the live card and the copy fading out. */
function CardBody({
  card,
  live,
  children,
}: {
  card: Card;
  live: boolean;
  children?: ReactNode;
}) {
  const Icon = ICONS[card.kind];
  let i = 0;
  const step = () => ({ '--i': i++ }) as CSSProperties;
  return (
    <>
      <div className="inspect-overline inspect-anim" style={step()}>
        <i aria-hidden="true">
          <Icon size={12} strokeWidth={2.2} />
        </i>
        {card.overline}
      </div>
      <h3
        id={live ? 'inspect-card-title' : undefined}
        className="inspect-anim"
        style={step()}
      >
        {card.title}
      </h3>
      {card.lead && (
        <p className="inspect-lead inspect-anim" style={step()}>
          {card.lead}
        </p>
      )}
      <dl className="inspect-rows">
        {card.rows.map((row) => (
          <div
            className="inspect-row inspect-anim"
            key={row.label}
            style={step()}
          >
            <dt>{row.label}</dt>
            <dd>
              {/* Keyed by text: a value that changes fades in afresh. */}
              <span className="inspect-value" key={row.value}>
                {row.value}
              </span>
              {row.note && (
                <small className="inspect-value" key={row.note}>
                  {row.note}
                </small>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {children && (
        <div className="inspect-actions inspect-anim" style={step()}>
          {children}
        </div>
      )}
      <p className="inspect-fine inspect-anim" style={step()}>
        {card.fine}
      </p>
    </>
  );
}

/**
 * Info card for the person, piece of furniture or vehicle clicked in the 3D
 * view, docked at the top right of the model (a sheet along its bottom on
 * phones). It
 * enters with a spring-like ease, its rows staggering in; switching items
 * cross-fades the text while the card's surface morphs to the new height;
 * closing (×, Esc, a click on empty space) is quicker. People and vehicles
 * update live with the clock and can be followed. Not a modal: focus is not
 * trapped and the close button is reachable by keyboard.
 */
export function InspectCard({
  viewer,
  target,
  onClose,
}: {
  viewer: Viewer | null;
  target: InspectTarget | null;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<InspectTarget | null>(target),
    [leaving, setLeaving] = useState(false),
    [ghost, setGhost] = useState<Card | null>(null),
    [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const shownRef = useRef<InspectTarget | null>(target),
    lastCard = useRef<Card | null>(null),
    surface = useRef<HTMLDivElement>(null),
    body = useRef<HTMLDivElement>(null),
    height = useRef(0);
  const open = !!shown && !!viewer,
    live = open && shown.kind !== 'object';
  // The clock and follow state, while a person's or a vehicle's card is open.
  useEffect(
    () => (live ? viewer!.activity.subscribe(setSnapshot) : undefined),
    [viewer, live],
  );
  // Furniture does not change with the clock; people and vehicles do.
  const clock = shown?.kind === 'object' ? 0 : snapshot?.time;
  const card = useMemo(
    () =>
      shown && viewer
        ? describeTarget(
            {
              model: viewer.model,
              activity: viewer.activity,
              community: viewer.community,
            },
            shown,
            clock,
          )
        : null,
    [viewer, shown, clock],
  );
  // Declared before the target effect: it reads the card being replaced.
  useEffect(() => {
    if (card) lastCard.current = card;
  });
  useEffect(() => {
    const previous = shownRef.current;
    if (target) {
      if (previous && !sameTarget(previous, target) && !reducedMotion())
        setGhost(lastCard.current);
      shownRef.current = target;
      setShown(target);
      setLeaving(false);
    } else if (previous) {
      if (reducedMotion()) {
        shownRef.current = null;
        setShown(null);
      } else setLeaving(true);
    }
  }, [target]);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      shownRef.current = null;
      setShown(null);
      setLeaving(false);
    }, 170);
    return () => clearTimeout(t);
  }, [leaving]);
  useEffect(() => {
    if (!ghost) return;
    const t = setTimeout(() => setGhost(null), 190);
    return () => clearTimeout(t);
  }, [ghost]);
  useEffect(() => {
    if (!open || leaving) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !document.querySelector('[aria-modal="true"]')
      )
        onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, leaving, onClose]);
  // Morph: the surface eases from the old height to the new one (transform
  // only; one layout read per switch or change in the card's rows).
  const key = shown ? targetKey(shown) : '',
    rowCount = card?.rows.length ?? 0,
    hasLead = !!card?.lead;
  useLayoutEffect(() => {
    const b = body.current,
      s = surface.current;
    if (!b || !s) {
      height.current = 0;
      return;
    }
    const h = b.offsetHeight,
      previous = height.current;
    height.current = h;
    if (!previous || Math.abs(previous - h) < 2 || reducedMotion()) return;
    s.animate?.(
      [{ transform: `scaleY(${previous / h})` }, { transform: 'scaleY(1)' }],
      { duration: 340, easing: EASE },
    );
  }, [key, rowCount, hasLead]);
  if (!card) return null;
  const following = !!card.follow && snapshot?.follow === card.follow;
  return (
    <section
      className="inspect-card"
      aria-labelledby="inspect-card-title"
      data-phase={leaving ? 'leave' : 'enter'}
      data-kind={card.kind}
      style={{ '--accent': card.accent } as CSSProperties}
    >
      <div className="inspect-surface" ref={surface} aria-hidden="true" />
      {ghost && ghost.key !== card.key && (
        <div className="inspect-ghost" aria-hidden="true">
          <CardBody card={ghost} live={false} />
        </div>
      )}
      <div className="inspect-body" ref={body} key={card.key}>
        <CardBody card={card} live>
          {card.follow && (
            <button
              className="inspect-follow"
              aria-pressed={following}
              onClick={() =>
                viewer?.followActor(following ? null : card.follow!)
              }
            >
              <LocateFixed size={14} />
              {following ? 'Stop following' : 'Follow'}
            </button>
          )}
        </CardBody>
      </div>
      <button
        className="inspect-close"
        aria-label="Close details"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </section>
  );
}
