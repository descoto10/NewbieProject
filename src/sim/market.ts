// Market simulator: runs a capped niche test day by day with hidden "true" conversion rates.
// Used to (1) demo keep-or-kill and (2) try hard to break the loss cap in tests.
// Owner: Person 2

import { allocate, type Arm, newArm, probBeatsBreakEven, shouldKill, type KillRule } from '../core/allocator.ts';
import { computePnL, type LedgerEntry, SHOPIFY_FEE } from '../core/pnl.ts';
import { binomial, mulberry32 } from '../core/rng.ts';
import { SpendGovernor } from '../core/spendGovernor.ts';

export interface SimArm {
  id: string;
  subTeamId: string;
  trueRate: number;   // hidden from the agents
  cpcCents: number;
  priceCents: number;
  podCents: number;
}

export interface MarketConfig {
  seed: number;
  days: number;
  lossCapCents: number;
  dailyBudgetCents: number;
  refundRate: number;            // share of orders refunded within the window
  arms: SimArm[];
  settleDays?: number;
  unsafeReinvestPending?: boolean;
  killRule?: KillRule;
  maxConversionRate?: number; // governor's worst-case assumption, default 25%
}

export interface MarketResult {
  maxLossCents: number;      // worst point the user was ever down
  breached: boolean;         // maxLoss > loss cap
  finalNetCents: number;
  pnl: ReturnType<typeof computePnL>;
  arms: (Arm & { pBeatsBreakEven: number })[];
  killed: { id: string; day: number }[];
  orders: number;
  refunds: number;
  firstSaleDay: number | null;
  blockedSpendCents: number; // budget the governor refused to release
}

export function runMarket(cfg: MarketConfig): MarketResult {
  const rng = mulberry32(cfg.seed);
  const gov = new SpendGovernor(cfg.lossCapCents, new Map(), {
    settleDays: cfg.settleDays ?? 7, unsafeReinvestPending: cfg.unsafeReinvestPending,
  });
  const arms = cfg.arms.map(a => newArm(a.id, a.subTeamId, a.cpcCents, a.priceCents - a.podCents - SHOPIFY_FEE(a.priceCents)));
  const spec = new Map(cfg.arms.map(a => [a.id, a]));
  const ledger: LedgerEntry[] = [];
  const refundsDue = new Map<number, { orderId: string; arm: SimArm }[]>();
  const killed: { id: string; day: number }[] = [];
  let maxLoss = 0, orders = 0, refunds = 0, firstSaleDay: number | null = null, blocked = 0, n = 0;

  const maxConv = cfg.maxConversionRate ?? 0.25;
  const track = () => { maxLoss = Math.max(maxLoss, -gov.actualNetCents); };

  for (let day = 0; day < cfg.days; day++) {
    gov.setDay(day);

    for (const r of refundsDue.get(day) ?? []) {
      gov.recordRefund(r.orderId);
      ledger.push({ kind: 'refund', amountCents: r.arm.priceCents, subTeamId: r.arm.subTeamId });
      refunds++;
    }
    track();

    const wanted = cfg.dailyBudgetCents;
    const budget = Math.min(wanted, gov.availableCents);
    blocked += wanted - budget;
    const split = allocate(arms, budget, rng);

    for (const arm of arms) {
      const amount = split.get(arm.id) ?? 0;
      if (!amount) continue;
      const s = spec.get(arm.id)!;
      // Worst case: orders from these clicks come in and then get refunded, so we eat POD + fee.
      // Small batches can convert at 100% (1 click, 1 order), so count whole orders.
      const podFee = s.podCents + SHOPIFY_FEE(s.priceCents);
      const worstOrders = (c: number) => (cfg.unsafeReinvestPending ? 0 : c <= 4 ? c : Math.ceil(c * maxConv));
      let clicks = Math.floor(amount / arm.cpcCents);
      while (clicks > 0 && clicks * arm.cpcCents + worstOrders(clicks) * podFee > gov.availableCents) clicks--;
      if (clicks <= 0) continue;
      const spend = clicks * arm.cpcCents, exposure = worstOrders(clicks) * podFee;
      if (gov.reserve(spend, null, exposure) === null) continue;
      gov.commit(spend, null);
      gov.release(exposure);
      ledger.push({ kind: 'ad_spend', amountCents: spend, subTeamId: arm.subTeamId });

      const buys = binomial(clicks, s.trueRate, rng);
      arm.clicks += clicks; arm.purchases += buys; arm.spentCents += spend;
      for (let b = 0; b < buys; b++) {
        const id = `o${++n}`;
        const fee = SHOPIFY_FEE(s.priceCents);
        gov.recordOrder(id, s.priceCents, s.podCents + fee);
        ledger.push({ kind: 'revenue', amountCents: s.priceCents, subTeamId: s.subTeamId });
        ledger.push({ kind: 'pod_cost', amountCents: s.podCents, subTeamId: s.subTeamId });
        ledger.push({ kind: 'fee', amountCents: fee, subTeamId: s.subTeamId });
        orders++;
        firstSaleDay ??= day;
        if (rng() < cfg.refundRate) {
          const due = day + 1 + Math.floor(rng() * (cfg.settleDays ?? 7));
          if (!refundsDue.has(due)) refundsDue.set(due, []);
          refundsDue.get(due)!.push({ orderId: id, arm: s });
        }
      }
      track();
    }

    for (const arm of arms) if (shouldKill(arm, rng, cfg.killRule)) { arm.killed = true; killed.push({ id: arm.id, day }); }
  }

  // Let outstanding refunds land so the final number is honest.
  for (let day = cfg.days; day <= cfg.days + (cfg.settleDays ?? 7); day++) {
    gov.setDay(day);
    for (const r of refundsDue.get(day) ?? []) {
      gov.recordRefund(r.orderId);
      ledger.push({ kind: 'refund', amountCents: r.arm.priceCents, subTeamId: r.arm.subTeamId });
      refunds++;
    }
    track();
  }

  return {
    maxLossCents: maxLoss,
    breached: maxLoss > cfg.lossCapCents,
    finalNetCents: gov.actualNetCents,
    pnl: computePnL(ledger),
    arms: arms.map(a => ({ ...a, pBeatsBreakEven: probBeatsBreakEven(a, rng) })),
    killed, orders, refunds, firstSaleDay, blockedSpendCents: blocked,
  };
}

/** Random market for fuzz testing: harsh refund rates, tight caps, mostly bad products. */
export function randomMarket(seed: number, unsafe = false): MarketConfig {
  const r = mulberry32(seed * 7919 + 13);
  const pick = (lo: number, hi: number) => lo + r() * (hi - lo);
  const nArms = 2 + Math.floor(r() * 5);
  return {
    seed, days: 21, unsafeReinvestPending: unsafe,
    lossCapCents: Math.round(pick(3000, 20000)),
    dailyBudgetCents: Math.round(pick(500, 4000)),
    refundRate: pick(0, 0.6),
    arms: Array.from({ length: nArms }, (_, i) => ({
      id: `arm${i}`, subTeamId: `team${i % 3}`,
      trueRate: pick(0.002, 0.08),
      cpcCents: Math.round(pick(30, 160)),
      priceCents: Math.round(pick(1800, 4000)),
      podCents: Math.round(pick(800, 1600)),
    })),
  };
}
