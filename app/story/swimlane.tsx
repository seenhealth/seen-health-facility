'use client';
import type { CSSProperties } from 'react';
import {
  atHome,
  groups,
  hero,
  isMeanwhile,
  isTeamMeeting,
  kickerTime,
  laneMembers,
  palette,
  placeLabel,
  shortLabel,
  steps,
  withHero,
} from './data';

type Orientation = 'across' | 'down';

/**
 * Geometry for the role x step grid. `across`: steps are columns (desktop).
 * A "Partners" lane for people outside the team (her daughter, the caterer)
 * sits below the eleven disciplines.
 */
function grid(o: Orientation) {
  const across = o === 'across';
  const lane = across ? 34 : 25,
    gap = across ? 14 : 9;
  const col = across ? 72 : 38;
  const labelW = across ? 292 : 112,
    head = across ? 74 : 86;
  const laneOffset = laneMembers.map((m, i) => {
    const g = groups.findIndex((g) => g.id === m.group);
    return i * lane + g * gap + lane / 2;
  });
  const partnersOffset = laneOffset.at(-1)! + lane + gap;
  const lanesLen = partnersOffset + lane / 2 + 6;
  const stepsLen = steps.length * col;
  const size = () => col;
  const mid = (i: number) => i * col + col / 2;
  const width = across ? labelW + stepsLen + 16 : labelW + lanesLen + 4;
  const height = across ? head + lanesLen + 8 : head + stepsLen + 8;
  /** Lane l of step s; l = laneMembers.length is the partners lane. */
  const at = (s: number, l: number): [number, number] => {
    const lo = l < laneOffset.length ? laneOffset[l] : partnersOffset;
    return across ? [labelW + mid(s), head + lo] : [labelW + lo, head + mid(s)];
  };
  return { across, lane, size, labelW, head, laneOffset, partnersOffset, lanesLen, width, height, at };
}

function arrowPath(
  g: ReturnType<typeof grid>,
  s: number,
  a: number,
  b: number,
  k: number,
) {
  const [ax, ay] = g.at(s, a),
    [bx, by] = g.at(s, b);
  const side = k % 2 ? -1 : 1,
    off = 9.5,
    bulge = side * (g.across ? 20 + 5 * Math.floor(k / 2) : 13);
  // Bulge along the step axis so arrows sit beside the dots.
  const [sx, sy, ex, ey, c1x, c1y, c2x, c2y] = g.across
    ? [ax + side * off, ay, bx + side * off, by, ax + side * off + bulge, ay, bx + side * off + bulge, by]
    : [ax, ay + side * off, bx, by + side * off, ax, ay + side * off + bulge, bx, by + side * off + bulge];
  const d = `M${sx} ${sy} C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
  // Arrowhead points from the second control point into the end.
  const dx = ex - c2x,
    dy = ey - c2y,
    l = Math.hypot(dx, dy) || 1,
    ux = dx / l,
    uy = dy / l;
  const L = 7,
    W = 3.8;
  const head = `M${ex + ux} ${ey + uy} L${ex - ux * L - uy * W} ${ey - uy * L + ux * W} L${ex - ux * L + uy * W} ${ey - uy * L - ux * W} Z`;
  return { d, head };
}

/** Home badge: a warm pill behind the moment's short label. */
function Badge({ x, y, text, anchor }: { x: number; y: number; text: string; anchor: 'middle' | 'start' }) {
  // Width from the label length (10 px semibold ≈ 5.9 px a character).
  const w = text.length * 5.9 + 12,
    left = anchor === 'middle' ? x - w / 2 : x;
  return (
    <g className="story-swim-badge">
      <rect x={left} y={y - 11} width={w} height={15} rx={7.5} />
      <text x={left + w / 2} y={y} textAnchor="middle">
        {text}
      </text>
    </g>
  );
}

function Grid({ o, revealed }: { o: Orientation; revealed: number }) {
  const g = grid(o);
  const laneIndex = new Map(laneMembers.map((m, i) => [m.id, i]));
  const partnersLane = laneMembers.length;
  const heroAt = (s: number): [number, number] => {
    const [x, y] = g.at(s, 0);
    return g.across ? [x, g.head - 20] : [g.labelW - 20, y];
  };
  const last = steps.length - 1;
  const lineSpan = (l: number) => {
    const [x, y] = g.at(0, l),
      [x2, y2] = g.at(last, l);
    return g.across
      ? { x1: x - g.size() / 2 + 4, x2: x2 + g.size() / 2 - 4, y1: y, y2 }
      : { x1: x, x2, y1: y - g.size() / 2 + 4, y2: y2 + g.size() / 2 - 4 };
  };
  return (
    <svg
      className={`story-swim-svg story-swim-${o}`}
      viewBox={`0 0 ${g.width} ${g.height}`}
      aria-hidden="true"
      focusable="false"
    >
      {/* Lane labels and baselines */}
      {laneMembers.map((m, i) => {
        const first = laneMembers.findIndex((x) => x.group === m.group) === i;
        const [x, y] = g.at(0, i);
        return (
          <g key={m.id} className="story-swim-lane">
            <line {...lineSpan(i)} />
            {g.across ? (
              <>
                {first && (
                  <text className="group" x={0} y={y + 4}>
                    {groups.find((gr) => gr.id === m.group)?.label}
                  </text>
                )}
                <circle cx={100} cy={y} r={4.5} fill={m.color} />
                <text className="role" x={112} y={y + 4.5}>
                  {m.title}
                </text>
              </>
            ) : (
              <>
                <text className="role short" transform={`translate(${x + 3} ${g.head - 12}) rotate(-60)`}>
                  {m.short}
                </text>
                <circle cx={x} cy={g.head - 4} r={3.5} fill={m.color} />
              </>
            )}
          </g>
        );
      })}
      {(() => {
        const [x, y] = g.at(0, partnersLane);
        return (
          <g className="story-swim-lane partners">
            <line {...lineSpan(partnersLane)} />
            {g.across ? (
              <>
                <text className="group" x={0} y={y + 4}>
                  Partners
                </text>
                <circle className="partner" cx={100} cy={y} r={4.5} />
                <text className="role" x={112} y={y + 4.5}>
                  Outside the team
                </text>
              </>
            ) : (
              <>
                <text className="role short" transform={`translate(${x + 3} ${g.head - 12}) rotate(-60)`}>
                  Partners
                </text>
                <circle className="partner" cx={x} cy={g.head - 4} r={3.5} />
              </>
            )}
          </g>
        );
      })()}
      <text className="story-swim-hero-label" x={0} y={g.across ? g.head - 16 : 12}>
        {g.across ? `${hero.name}’s day` : ''}
      </text>
      {steps.map((s, i) => {
        const home = atHome(s);
        const [hx, hy] = heroAt(i);
        const prev = i > 0 ? heroAt(i - 1) : null;
        const team = isTeamMeeting(s);
        const on = i < revealed;
        const [cx, cy] = g.at(i, 0);
        const size = g.size();
        const time = kickerTime(s).replace(/ (AM|PM)$/, '');
        const partners = s.partners || [];
        return (
          <g
            key={s.id}
            className="story-swim-col"
            data-on={on || undefined}
            data-home={home || undefined}
            style={{ '--j': i } as CSSProperties}
          >
            {(team || home) &&
              (g.across ? (
                <rect
                  className={home ? 'band home' : 'band'}
                  x={cx - size / 2 + 5}
                  y={g.head - 6}
                  width={size - 10}
                  height={g.lanesLen + 10}
                  rx={14}
                />
              ) : (
                <rect
                  className={home ? 'band home' : 'band'}
                  x={g.labelW - 6}
                  y={cy - size / 2 + 4}
                  width={g.lanesLen + 8}
                  height={size - 8}
                  rx={10}
                />
              ))}
            {g.across ? (
              <>
                <text className="time" x={cx} y={14} textAnchor="middle">
                  {time}
                </text>
                {home ? (
                  <Badge x={cx} y={31} text={shortLabel(s)} anchor="middle" />
                ) : (
                  <text className="step" x={cx} y={30} textAnchor="middle">
                    {shortLabel(s)}
                  </text>
                )}
              </>
            ) : (
              <>
                <text className="time" x={0} y={cy - 2}>
                  {time}
                </text>
                {home ? (
                  <Badge x={0} y={cy + 12} text={shortLabel(s)} anchor="start" />
                ) : (
                  <text className="step" x={0} y={cy + 11}>
                    {shortLabel(s)}
                  </text>
                )}
              </>
            )}
            {/* Mrs. Lin's path runs through her day, front door to front door. */}
            {prev && (
              <line
                className="story-swim-path"
                x1={prev[0]}
                y1={prev[1]}
                x2={hx}
                y2={hy}
                pathLength={1}
              />
            )}
            <circle
              className="story-swim-hero"
              data-away={!withHero(s) || undefined}
              data-home={home || undefined}
              cx={hx}
              cy={hy}
              r={5.5}
            />
            {s.handoffs.map((h, k) => {
              const a = laneIndex.get(h.from),
                b = laneIndex.get(h.to);
              if (a === undefined || b === undefined) return null;
              const { d, head } = arrowPath(g, i, a, b, k);
              const color = laneMembers[a].color;
              return (
                <g
                  key={k}
                  className="story-swim-arrow"
                  style={{ '--c': color, '--k': k } as CSSProperties}
                >
                  <title>{`${laneMembers[a].short} to ${laneMembers[b].short}: ${h.note}`}</title>
                  <path className="stroke" d={d} pathLength={1} />
                  <path className="head" d={head} />
                </g>
              );
            })}
            {laneMembers.map((m, l) => {
              const [x, y] = g.at(i, l);
              const inStep = s.roles.includes(m.id);
              const receives = !inStep && s.handoffs.some((h) => h.to === m.id);
              if (!inStep && !receives) return null;
              const kind = !inStep ? ' receives' : '';
              return (
                <circle
                  key={m.id}
                  className={`story-swim-dot${kind}`}
                  cx={x}
                  cy={y}
                  r={inStep ? (g.across ? 6.5 : 5.2) : 4}
                  style={{ '--c': m.color, '--l': l } as CSSProperties}
                />
              );
            })}
            {partners.length > 0 &&
              (() => {
                const [x, y] = g.at(i, partnersLane);
                return (
                  <circle
                    className="story-swim-dot partner"
                    cx={x}
                    cy={y}
                    r={g.across ? 5.5 : 4.4}
                    style={{ '--l': partnersLane } as CSSProperties}
                  >
                    <title>{partners.join(', ')}</title>
                  </circle>
                );
              })()}
          </g>
        );
      })}
    </svg>
  );
}

/** Where a moment happens, for the table: at home, with Mrs. Lin, or behind the scenes. */
function whereOf(s: (typeof steps)[number]) {
  if (atHome(s)) return 'At home, with her daughter';
  if (isMeanwhile(s)) return `In the ${placeLabel(s).toLowerCase()}`;
  return s.heroPresent ? `With ${hero.name}` : 'At the center, team meeting';
}

/** Screen-reader alternative: the same grid as a table. */
function SwimTable() {
  const title = (id: string) => laneMembers.find((m) => m.id === id)?.title;
  const short = (id: string) => laneMembers.find((m) => m.id === id)?.short;
  return (
    <table className="sr-only">
      <caption>
        Who was involved in each moment of {hero.name}’s day
      </caption>
      <thead>
        <tr>
          <th scope="col">Moment</th>
          <th scope="col">Where</th>
          <th scope="col">Disciplines involved</th>
          <th scope="col">Handoffs</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((s) => (
          <tr key={s.id}>
            <th scope="row">
              {kickerTime(s)} {s.title}
            </th>
            <td>{whereOf(s)}</td>
            <td>
              {s.roles.map(title).filter(Boolean).join(', ')}
              {s.partners?.length ? `; with partners: ${s.partners.join(', ')}` : ''}
            </td>
            <td>
              {s.handoffs.map((h) => `${short(h.from)} to ${short(h.to)}: ${h.note}`).join('; ') ||
                'None'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Swimlane({ revealed }: { revealed: number }) {
  return (
    <div
      className="story-swim"
      style={{ '--brand': palette.brandDeep } as CSSProperties}
    >
      <Grid o="across" revealed={revealed} />
      <Grid o="down" revealed={revealed} />
      <SwimTable />
    </div>
  );
}
