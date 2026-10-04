import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FRONT_DOCK } from '../app/model/alhambra-fleet';
import {
  createLotTraffic,
  DOCK_FOOTPRINT,
  fitsStall,
  footprintGap,
  isAngled,
  LOT_SPACES,
  needsDockClear,
  stallFootprint,
  stallOrder,
  stallPose,
  WEST_STALLS,
  type Footprint,
  type LotLeg,
  type Size,
} from '../app/model/live-lot-traffic';
import { validateFacility } from '../app/model/schema';
import { pieceAt } from '../app/model/vehicle-path';

// The three bodies the live lot draws (live-lot.ts `body`): a fleet van or lift van, a full-size SUV and a sedan.
const VAN: Size = { halfWidth: 1.125, halfLength: 3.175 },
  SUV: Size = { halfWidth: 1.02, halfLength: 2.875 },
  SEDAN: Size = { halfWidth: 0.97, halfLength: 2.645 };
const KINDS = { van: VAN, suv: SUV, sedan: SEDAN };
type Kind = keyof typeof KINDS;

const traffic = createLotTraffic(
  validateFacility(
    JSON.parse(
      readFileSync('public/models/seen-alhambra-planning.json', 'utf8'),
    ),
  ),
);
const stalls = Array.from({ length: LOT_SPACES }, (_, i) => i);
/** The longest vehicle a space takes: a van in the west row, an SUV in an angled stall. */
const longest = (stall: number) => (isAngled(stall) ? SUV : VAN);
/** Every other space taken by the longest vehicle it holds. */
const packed = (self: number) =>
  stalls.filter((i) => i !== self).map((i) => stallFootprint(i, longest(i)));

/** Where a route starts and ends, and the way the vehicle's nose points there (reverse legs are driven tail first). */
function ends(legs: LotLeg[]) {
  const reverse = (l: LotLeg) => l.id === 'back-in' || l.id === 'back-out';
  const first = legs[0],
    last = legs[legs.length - 1],
    a = pieceAt(first.pieces[0], 0),
    lastPiece = last.pieces[last.pieces.length - 1],
    b = pieceAt(lastPiece, lastPiece.length);
  return {
    from: { ...a, dir: reverse(first) ? a.dir + Math.PI : a.dir },
    to: { ...b, dir: reverse(last) ? b.dir + Math.PI : b.dir },
  };
}
const sameAngle = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;
const near = (a: number, b: number, what: string, within = 1e-6) =>
  assert.ok(Math.abs(a - b) <= within, `${what}: ${a} vs ${b}`);

void test('thirteen spaces: seven in the west row for anything, six angled for cars only', () => {
  assert.equal(LOT_SPACES, 13);
  assert.equal(WEST_STALLS, 7);
  for (const i of stalls) {
    assert.equal(fitsStall(i, SEDAN), true);
    assert.equal(fitsStall(i, SUV), true);
    assert.equal(fitsStall(i, VAN), !isAngled(i), `van in space ${i}`);
  }
  // Vans are only ever offered the west row, from the fleet's bays northward; cars the angled stalls first, the one
  // beside the drop-off last of them.
  assert.deepEqual(stallOrder(VAN), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(stallOrder(SUV), [7, 8, 9, 10, 11, 12, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(stalls.filter(needsDockClear), [12]);
});

void test('parked vehicles stand clear of each other, of the aisle between the rows and of the drop-off', () => {
  const parked = stalls.map((i) => stallFootprint(i, longest(i)));
  for (const a of stalls)
    for (const b of stalls) {
      if (b <= a) continue;
      const gap = footprintGap(parked[a], parked[b]);
      // Neighbours in a row: half a metre between vans, a little less between full-size SUVs; the end stall by the
      // palm island is narrower, so its car stands a little closer to the next.
      const neighbours = b === a + 1 && isAngled(a) === isAngled(b);
      assert.ok(
        gap >= (neighbours ? (a === WEST_STALLS ? 0.3 : 0.45) : 2.8),
        `spaces ${a} and ${b}: ${gap.toFixed(2)} m apart`,
      );
    }
  for (const i of stalls)
    assert.ok(
      footprintGap(parked[i], DOCK_FOOTPRINT) >= 1.2,
      `space ${i} and the drop-off`,
    );
});

void test('a route in starts at the drop-off and ends in the space; a route out starts in the space and leaves the map', () => {
  for (const i of stalls)
    for (const kind of ['van', 'suv', 'sedan'] as Kind[]) {
      const v = KINDS[kind];
      if (!fitsStall(i, v)) continue;
      const pose = stallPose(i, v),
        what = `${kind} space ${i}`;
      const inn = traffic.planIn(i, v, []),
        out = traffic.planOut(i, v, [], needsDockClear(i));
      assert.ok(inn && out, `${what}: routes`);
      const a = ends(inn.legs),
        b = ends(out.legs);
      near(a.from.x, FRONT_DOCK.at[0], `${what} in: from x`);
      near(a.from.z, FRONT_DOCK.at[1], `${what} in: from z`);
      near(a.to.x, pose.x, `${what} in: to x`);
      near(a.to.z, pose.z, `${what} in: to z`);
      assert.ok(sameAngle(a.to.dir, pose.dir), `${what} in: facing`);
      near(b.from.x, pose.x, `${what} out: from x`);
      near(b.from.z, pose.z, `${what} out: from z`);
      assert.ok(sameAngle(b.from.dir, pose.dir), `${what} out: facing`);
      // Off the map southbound on the west street (alhambra-fleet.ts `vanishSouth`).
      near(b.to.z, -90, `${what} out: to z`);
      // The west row is reversed into and pulled out of forward; an angled stall nosed into and backed out of.
      assert.deepEqual(
        [inn.legs.at(-1)!.id, out.legs[0].id],
        isAngled(i) ? ['to-stall', 'back-out'] : ['back-in', 'pull-out'],
        `${what}: manoeuvre`,
      );
      // Legs join end to start (a reverse leg starts where the forward one before it stopped).
      for (const legs of [inn.legs, out.legs])
        for (let k = 1; k < legs.length; k++) {
          const prev = legs[k - 1].pieces.at(-1)!,
            end = pieceAt(prev, prev.length),
            start = pieceAt(legs[k].pieces[0], 0);
          near(start.x, end.x, `${what}: leg ${legs[k].id} x`, 1e-4);
          near(start.z, end.z, `${what}: leg ${legs[k].id} z`, 1e-4);
        }
      // A vehicle stands a moment where it changes direction.
      const turnAround = isAngled(i) ? out.legs[0] : inn.legs[0];
      assert.ok(
        (turnAround.stop ?? 0) > 0,
        `${what}: stops to change direction`,
      );
    }
});

void test('with the lot empty every manoeuvre is clear by a wide margin', () => {
  // The margin is to a van standing at the drop-off, which the spaces at the north end turn beside.
  for (const i of stalls)
    for (const kind of ['van', 'suv', 'sedan'] as Kind[]) {
      const v = KINDS[kind];
      if (!fitsStall(i, v)) continue;
      const inn = traffic.planIn(i, v, [])!.gap,
        out = traffic.planOut(i, v, [], needsDockClear(i))!.gap;
      assert.ok(inn >= 0.25, `${kind} into ${i}: ${inn.toFixed(2)}`);
      assert.ok(out >= 0.25, `${kind} out of ${i}: ${out.toFixed(2)}`);
    }
  // Backing out of the stall beside the drop-off crosses it: clear only while the drop-off is held empty.
  assert.ok(traffic.planOut(12, SUV, [], false)!.gap < 0);
});

void test('with the lot packed with the longest vehicles a manoeuvre brushes a corner by at most 0.3 m (a car by 0.15 m, 0.2 m by the island)', () => {
  // The aisle is 4.5 m between 6.1 m stalls and 5.76 m angled stalls, the vans 6.35 m and the SUVs 5.75 m: no way in
  // clears both neighbours and the tails opposite at once. This pins how little the best of the family overlaps.
  // The end stall by the palm island (7) has a narrower mouth and gets its own, looser bound.
  const worst: Record<string, number> = { van: 9, suv: 9, sedan: 9 },
    island: Record<string, number> = { suv: 9, sedan: 9 };
  for (const i of stalls)
    for (const kind of ['van', 'suv', 'sedan'] as Kind[]) {
      const v = KINDS[kind];
      if (!fitsStall(i, v)) continue;
      const inn = traffic.planIn(i, v, packed(i))!,
        out = traffic.planOut(i, v, packed(i), needsDockClear(i))!,
        into = i === WEST_STALLS ? island : worst;
      into[kind] = Math.min(into[kind], inn.gap, out.gap);
    }
  assert.ok(worst.van >= -0.3, `van ${worst.van.toFixed(2)}`);
  assert.ok(worst.suv >= -0.15, `suv ${worst.suv.toFixed(2)}`);
  assert.ok(worst.sedan >= -0.05, `sedan ${worst.sedan.toFixed(2)}`);
  assert.ok(island.suv >= -0.2, `suv by the island ${island.suv.toFixed(2)}`);
  assert.ok(
    island.sedan >= -0.1,
    `sedan by the island ${island.sedan.toFixed(2)}`,
  );
});

/** Arrivals take the chooser's space one after another; returns each choice. */
function fill(kinds: Kind[]) {
  const taken = new Map<number, Footprint>();
  return kinds.map((kind) => {
    const v = KINDS[kind];
    const pick = traffic.chooseStall(v, stallOrder(v), (i) => taken.has(i), [
      ...taken.values(),
    ]);
    if (pick) taken.set(pick.stall, stallFootprint(pick.stall, v));
    return pick && { kind, stall: pick.stall, gap: pick.plan.gap };
  });
}

void test('six vans, three SUVs and four sedans arriving in turn all park clear, each in a space of its own', () => {
  const kinds: Kind[] = [
    ...Array<Kind>(6).fill('van'),
    ...Array<Kind>(3).fill('suv'),
    ...Array<Kind>(4).fill('sedan'),
  ];
  const picks = fill([...kinds, 'sedan', 'van']);
  const parked = picks.slice(0, 13);
  assert.ok(parked.every(Boolean), 'thirteen find a space');
  assert.equal(new Set(parked.map((p) => p!.stall)).size, 13);
  for (const p of parked) {
    // The last car in gets the end stall by the palm island, past an SUV beside it and the vans opposite: its
    // corner passes the next car's by a few centimetres.
    assert.ok(
      p!.gap >= (p!.stall === WEST_STALLS ? -0.1 : 0),
      `${p!.kind} into ${p!.stall}: ${p!.gap.toFixed(2)}`,
    );
    if (p!.kind === 'van')
      assert.ok(!isAngled(p!.stall), 'vans in the west row');
  }
  // The fourteenth and fifteenth find the lot full.
  assert.deepEqual(picks.slice(13), [null, null]);
});

void test('whatever is parked where, a way in and a way out never overlap anything by more than 0.3 m', () => {
  let seed = 20261003;
  const random = () =>
    (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  let clear = 0;
  const runs = 400;
  for (let run = 0; run < runs; run++) {
    const density = random(),
      taken = new Map<number, Footprint>();
    for (const i of stalls)
      if (random() < density)
        taken.set(
          i,
          stallFootprint(
            i,
            isAngled(i) ? pick([SUV, SEDAN]) : pick([VAN, VAN, SUV, SEDAN]),
          ),
        );
    const free = stalls.filter((i) => !taken.has(i));
    if (!free.length) continue;
    const stall = pick(free),
      v = isAngled(stall) ? pick([SUV, SEDAN]) : pick([VAN, VAN, SUV]),
      others = [...taken.values()];
    const inn = traffic.planIn(stall, v, others)!,
      out = traffic.planOut(stall, v, others, needsDockClear(stall))!;
    const gap = Math.min(inn.gap, out.gap);
    assert.ok(gap >= -0.3, `space ${stall}: ${gap.toFixed(2)}`);
    if (gap >= 0) clear++;
  }
  // Most states of the lot are driven clear; the overlaps are the packed corners.
  assert.ok(clear / runs > 0.7, `${clear} of ${runs} clear`);
});
