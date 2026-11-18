// Person 2: loss-cap invariant, allocator, kill rule, P&L
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocate, newArm, shouldKill } from '../src/core/allocator.ts';
import { computePnL } from '../src/core/pnl.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { SpendGovernor } from '../src/core/spendGovernor.ts';
import { randomMarket, runMarket } from '../src/sim/market.ts';

export const FUZZ_RUNS = 1000;

test(`loss cap is never breached across ${FUZZ_RUNS} randomized markets`, () => {
  const breaches = [];
  for (let seed = 1; seed <= FUZZ_RUNS; seed++) {
    const cfg = randomMarket(seed);
    const r = runMarket(cfg);
    if (r.breached) breaches.push({ seed, cap: cfg.lossCapCents, maxLoss: r.maxLossCents });
  }
  assert.deepEqual(breaches, []);
});

test('the fuzz test has teeth: a naive governor that trusts unsettled profit breaches', () => {
  let breaches = 0;
  for (let seed = 1; seed <= 200; seed++) if (runMarket(randomMarket(seed, true)).breached) breaches++;
  assert.ok(breaches > 0, 'expected the naive governor to break the cap at least once');
});

test('pending orders are only trusted at their worst case', () => {
  const g = new SpendGovernor(10000, new Map(), { settleDays: 7 });
  g.recordOrder('o1', 3000, 1200);
  assert.equal(g.availableCents, 10000 - 1200);        // pending: assume refund
  g.setDay(7);
  assert.equal(g.availableCents, 10000 + 1800);        // settled: real margin
});

test('Thompson sampling sends most budget to the better arm', () => {
  const rng = mulberry32(1);
  const good = { ...newArm('good', 't', 50, 1500), clicks: 200, purchases: 14 };
  const bad = { ...newArm('bad', 't', 50, 1500), clicks: 200, purchases: 1 };
  const split = allocate([good, bad], 10000, rng);
  assert.ok(split.get('good')! > 0.9 * 10000);
});

test('kill rule stops an arm that clearly cannot break even, but not before enough data', () => {
  const rng = mulberry32(2);
  assert.equal(shouldKill({ ...newArm('a', 't', 50, 1500), clicks: 20, purchases: 0 }, rng), false);
  assert.equal(shouldKill({ ...newArm('a', 't', 50, 1500), clicks: 300, purchases: 1 }, rng), true);
  assert.equal(shouldKill({ ...newArm('a', 't', 50, 1500), clicks: 300, purchases: 20 }, rng), false);
});

test('P&L adds up', () => {
  const p = computePnL([
    { kind: 'revenue', amountCents: 10000 }, { kind: 'pod_cost', amountCents: 4000 },
    { kind: 'ad_spend', amountCents: 3000 }, { kind: 'refund', amountCents: 2500 }, { kind: 'fee', amountCents: 330 },
  ]);
  assert.equal(p.netCents, 170);
  assert.equal(p.roas!.toFixed(2), '3.33');
});
