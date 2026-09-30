import { groups, ringMembers, type Handoff, type Member } from './data';

/** Ring layout in a 400 x 400 viewBox. */
export const VIEW = 400;
export const C = VIEW / 2;
export const R = 140;
export const NODE = 11.5;
export const HUB = 33;
const GAP = 0.6;

export type Pt = [number, number];
export type RingNode = Member & {
  index: number;
  angle: number;
  x: number;
  y: number;
  lx: number;
  ly: number;
  anchor: 'start' | 'middle' | 'end';
};

function layout(): RingNode[] {
  // Group gaps sit between contiguous groups; rn (first) lands at 12 o'clock.
  let u = 0;
  const units: number[] = [];
  ringMembers.forEach((m, i) => {
    if (i > 0 && ringMembers[i - 1].group !== m.group) u += GAP;
    units.push(u);
    u += 1;
  });
  const wraps = ringMembers.at(-1)?.group !== ringMembers[0]?.group;
  const total = u + (wraps ? GAP : 0);
  const step = (Math.PI * 2) / total;
  return ringMembers.map((m, i) => {
    const angle = -Math.PI / 2 + units[i] * step;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const lr = R + NODE + 13;
    return {
      ...m,
      index: i,
      angle,
      x: C + R * cos,
      y: C + R * sin,
      lx: C + lr * cos,
      ly: C + lr * sin + 4,
      anchor: Math.abs(cos) < 0.28 ? 'middle' : cos > 0 ? 'start' : 'end',
    };
  });
}
export const ringNodes = layout();
export const nodeById = new Map(ringNodes.map((n) => [n.id, n]));

/** Arcs grouping the ring by discipline family (drawn just inside the nodes). */
export const groupArcs = groups
  .map((g) => {
    const ns = ringNodes.filter((n) => n.group === g.id);
    if (!ns.length) return null;
    // Groups may wrap past 12 o'clock; sort angles relative to the first.
    const a0 = ns[0].angle;
    const as = ns
      .map((n) => {
        let a = n.angle - a0;
        while (a < -Math.PI) a += Math.PI * 2;
        while (a > Math.PI) a -= Math.PI * 2;
        return a0 + a;
      })
      .sort((a, b) => a - b);
    const pad = 0.13,
      r = R - NODE - 14;
    const s = as[0] - pad,
      e = as.at(-1)! + pad;
    const p = (a: number): Pt => [C + r * Math.cos(a), C + r * Math.sin(a)];
    const [x0, y0] = p(s),
      [x1, y1] = p(e);
    const mid = (s + e) / 2,
      lr = r - 12;
    return {
      id: g.id,
      label: g.label,
      d: `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`,
      lx: C + lr * Math.cos(mid),
      ly: C + lr * Math.sin(mid) + 3,
      mid,
    };
  })
  .filter((g) => !!g);

/** Spoke from a node toward the hub. */
export function spoke(n: RingNode) {
  const dx = C - n.x,
    dy = C - n.y,
    len = Math.hypot(dx, dy);
  const ux = dx / len,
    uy = dy / len;
  const a: Pt = [n.x + ux * (NODE + 4), n.y + uy * (NODE + 4)];
  const b: Pt = [C - ux * (HUB + 6), C - uy * (HUB + 6)];
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}

/** Gentle chord between two nodes, bowed toward the centre (team mesh). */
export function chord(a: RingNode, b: RingNode) {
  const mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  const cx = mx + (C - mx) * 0.35,
    cy = my + (C - my) * 0.35;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export type Arrow = {
  key: string;
  from: RingNode;
  to: RingNode;
  note: string;
  d: string;
  head: string;
  /** Curve midpoint (where the caption's marker sits), in viewBox units. */
  mx: number;
  my: number;
  /** Caption centre: one of two clear slots above and below the hub. */
  cx: number;
  cy: number;
  slot: 'top' | 'bottom';
  /** Points along the curve, used to keep captions off the arrows. */
  samples: Pt[];
};
/** Caption slots between the hub and the ring, clear of every node. */
const SLOTS = { top: C - 75, bottom: C + 73 } as const;
const SLOT_HALF: Pt = [104, 24];
type Slot = keyof typeof SLOTS;

/**
 * Directed curve between two role nodes. The curve passes through a waypoint
 * that clears the hub, so captions never sit on Mrs. Lin; captions of the
 * same step are pushed apart when they would collide.
 */
export function arrows(handoffs: Handoff[]): Arrow[] {
  const out: Arrow[] = [];
  const used: Pt[] = [];
  handoffs.forEach((h, i) => {
    const a = nodeById.get(h.from),
      b = nodeById.get(h.to);
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    let vx = mx - C,
      vy = my - C;
    let dm = Math.hypot(vx, vy);
    if (dm < 12) {
      // Opposite nodes: bow sideways.
      vx = -(b.y - a.y);
      vy = b.x - a.x;
      dm = Math.hypot(vx, vy);
    }
    const ux = vx / dm,
      uy = vy / dm;
    let dist = Math.max(78, dm * 0.78);
    let w: Pt = [C + ux * dist, C + uy * dist];
    for (const u of used)
      if (Math.hypot(w[0] - u[0], (w[1] - u[1]) * 2.2) < 120) {
        dist = dist > 95 ? dist - 34 : dist + 34;
        w = [C + ux * dist, C + uy * dist];
      }
    used.push(w);
    // Quadratic through w at t = 0.5.
    const qx = 2 * w[0] - mx,
      qy = 2 * w[1] - my;
    const trim = (p: RingNode, q: Pt, r: number): Pt => {
      const dx = q[0] - p.x,
        dy = q[1] - p.y,
        l = Math.hypot(dx, dy) || 1;
      return [p.x + (dx / l) * r, p.y + (dy / l) * r];
    };
    const s = trim(a, [qx, qy], NODE + 5),
      e = trim(b, [qx, qy], NODE + 7);
    const tx = e[0] - qx,
      ty = e[1] - qy,
      tl = Math.hypot(tx, ty) || 1;
    const dx = tx / tl,
      dy = ty / tl;
    const tip: Pt = [e[0] + dx * 1.5, e[1] + dy * 1.5];
    const l = 9,
      wd = 4.6;
    const head = `M${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L${(tip[0] - dx * l - dy * wd).toFixed(1)} ${(tip[1] - dy * l + dx * wd).toFixed(1)} L${(tip[0] - dx * l + dy * wd).toFixed(1)} ${(tip[1] - dy * l - dx * wd).toFixed(1)} Z`;
    out.push({
      key: `${i}-${h.from}-${h.to}`,
      from: a,
      to: b,
      note: h.note,
      d: `M${s[0].toFixed(1)} ${s[1].toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${e[0].toFixed(1)} ${e[1].toFixed(1)}`,
      head,
      mx: w[0],
      my: w[1],
      cx: C,
      cy: SLOTS.top,
      slot: 'top',
      samples: Array.from({ length: 25 }, (_, k) => {
        const t = k / 24,
          u = 1 - t;
        return [
          u * u * s[0] + 2 * u * t * qx + t * t * e[0],
          u * u * s[1] + 2 * u * t * qy + t * t * e[1],
        ] as Pt;
      }),
    });
  });
  // Pick the caption slots that cover the fewest arrow points (its own arrow
  // counts triple), preferring the slot nearest each arrow on ties.
  const inSlot = (slot: Slot, p: Pt) =>
    Math.abs(p[0] - C) < SLOT_HALF[0] && Math.abs(p[1] - SLOTS[slot]) < SLOT_HALF[1];
  const options: Slot[][] =
    out.length === 1
      ? [['top'], ['bottom']]
      : out.length === 2
        ? [
            ['top', 'bottom'],
            ['bottom', 'top'],
          ]
        : [out.map((_, k) => (k % 2 ? 'bottom' : 'top'))];
  let best = options[0],
    bestScore = Infinity;
  for (const option of options) {
    let score = 0;
    option.forEach((slot, k) =>
      out.forEach((arrow, j) => {
        for (const p of arrow.samples) if (inSlot(slot, p)) score += j === k ? 3 : 1;
      }),
    );
    // Tie-break toward the side of the arrow's midpoint.
    option.forEach((slot, k) => {
      if ((out[k].my <= C) !== (slot === 'top')) score += 0.5;
    });
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  best.forEach((slot, k) => {
    out[k].slot = slot;
    out[k].cy = SLOTS[slot];
  });
  return out;
}
