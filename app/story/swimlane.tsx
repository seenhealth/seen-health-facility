'use client';
import type { CSSProperties } from 'react';
import {
  groups,
  hero,
  isTeamMeeting,
  kickerTime,
  laneMembers,
  palette,
  shortLabel,
  steps,
} from './data';

type Orientation = 'across' | 'down';

/** Geometry for the role x step grid. `across`: steps are columns (desktop). */
function grid(o: Orientation) {
  const across = o === 'across';
  const lane = across ? 34 : 25,
    stepSize = across ? 76 : 40,
    gap = across ? 14 : 9;
  const labelW = across ? 292 : 112,
    head = across ? 74 : 86;
  const laneOffset = laneMembers.map((m, i) => {
    const g = groups.findIndex((g) => g.id === m.group);
    return i * lane + g * gap + lane / 2;
  });
  const lanesLen = laneOffset.at(-1)! + lane / 2 + 6;
  const stepsLen = steps.length * stepSize;
  const width = across ? labelW + stepsLen + 16 : labelW + lanesLen + 4;
  const height = across ? head + lanesLen + 8 : head + stepsLen + 8;
  const at = (s: number, l: number): [number, number] =>
    across
      ? [labelW + s * stepSize + stepSize / 2, head + laneOffset[l]]
      : [labelW + laneOffset[l], head + s * stepSize + stepSize / 2];
  return { across, lane, stepSize, labelW, head, laneOffset, lanesLen, width, height, at };
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

function Grid({ o, revealed }: { o: Orientation; revealed: number }) {
  const g = grid(o);
  const laneIndex = new Map(laneMembers.map((m, i) => [m.id, i]));
  const heroAt = (s: number): [number, number] =>
    g.across
      ? [g.labelW + s * g.stepSize + g.stepSize / 2, g.head - 20]
      : [g.labelW - 20, g.head + s * g.stepSize + g.stepSize / 2];
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
        const [x2, y2] = g.at(steps.length - 1, i);
        return (
          <g key={m.id} className="story-swim-lane">
            {g.across ? (
              <>
                <line x1={x - g.stepSize / 2 + 4} x2={x2 + g.stepSize / 2 - 4} y1={y} y2={y2} />
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
                <line x1={x} x2={x2} y1={y - g.stepSize / 2 + 4} y2={y2 + g.stepSize / 2 - 4} />
                <text className="role short" transform={`translate(${x + 3} ${g.head - 12}) rotate(-60)`}>
                  {m.short}
                </text>
                <circle cx={x} cy={g.head - 4} r={3.5} fill={m.color} />
              </>
            )}
          </g>
        );
      })}
      <text className="story-swim-hero-label" x={0} y={g.across ? g.head - 16 : 12}>
        {g.across ? `${hero.name}’s day` : ''}
      </text>
      {steps.map((s, i) => {
        const [hx, hy] = heroAt(i);
        const prev = i > 0 ? heroAt(i - 1) : null;
        const team = isTeamMeeting(s);
        const on = i < revealed;
        const [cx, cy] = g.at(i, 0);
        return (
          <g
            key={s.id}
            className="story-swim-col"
            data-on={on || undefined}
            style={{ '--j': i } as CSSProperties}
          >
            {team &&
              (g.across ? (
                <rect
                  className="band"
                  x={cx - g.stepSize / 2 + 5}
                  y={g.head - 6}
                  width={g.stepSize - 10}
                  height={g.lanesLen + 10}
                  rx={14}
                />
              ) : (
                <rect
                  className="band"
                  x={g.labelW - 6}
                  y={cy - g.stepSize / 2 + 4}
                  width={g.lanesLen + 8}
                  height={g.stepSize - 8}
                  rx={10}
                />
              ))}
            {g.across ? (
              <>
                <text className="time" x={cx} y={14} textAnchor="middle">
                  {kickerTime(s).replace(/ (AM|PM)$/, '')}
                </text>
                <text className="step" x={cx} y={30} textAnchor="middle">
                  {shortLabel(s)}
                </text>
              </>
            ) : (
              <>
                <text className="time" x={0} y={cy - 2}>
                  {kickerTime(s).replace(/ (AM|PM)$/, '')}
                </text>
                <text className="step" x={0} y={cy + 11}>
                  {shortLabel(s)}
                </text>
              </>
            )}
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
              data-away={!s.heroPresent || undefined}
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
              return (
                <circle
                  key={m.id}
                  className={inStep ? 'story-swim-dot' : 'story-swim-dot receives'}
                  cx={x}
                  cy={y}
                  r={inStep ? (g.across ? 6.5 : 5.2) : 4}
                  style={{ '--c': m.color, '--l': l } as CSSProperties}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Screen-reader alternative: the same grid as a table. */
function SwimTable() {
  return (
    <table className="sr-only">
      <caption>Who was involved in each moment of {hero.name}’s day</caption>
      <thead>
        <tr>
          <th scope="col">Moment</th>
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
            <td>
              {s.roles
                .map((r) => laneMembers.find((m) => m.id === r)?.title)
                .filter(Boolean)
                .join(', ')}
            </td>
            <td>
              {s.handoffs
                .map(
                  (h) =>
                    `${laneMembers.find((m) => m.id === h.from)?.short} to ${laneMembers.find((m) => m.id === h.to)?.short}: ${h.note}`,
                )
                .join('; ') || 'None'}
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
