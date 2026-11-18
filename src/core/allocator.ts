// Thompson sampling allocator + kill rule over product-creative pairs ("arms").
// Owner: Person 2
//
// Each arm keeps a Beta posterior over its conversion rate (purchases / clicks).
// Budget is handed out $1 at a time to whichever arm's sampled profit-per-click is best,
// so promising arms get more spend while uncertain ones still get explored.
// An arm is killed once it is very unlikely to ever break even.

import { type Rng, sampleBeta } from './rng.ts';

export interface Arm {
  id: string;
  subTeamId: string;
  cpcCents: number;      // cost per click
  marginCents: number;   // price - POD cost
  clicks: number;
  purchases: number;
  spentCents: number;
  killed: boolean;
}

export interface KillRule {
  minClicks: number;   // don't judge an arm on less data than this
  threshold: number;   // kill if P(beats break-even) drops below this
}

export const DEFAULT_KILL_RULE: KillRule = { minClicks: 40, threshold: 0.05 };

export function newArm(id: string, subTeamId: string, cpcCents: number, marginCents: number): Arm {
  return { id, subTeamId, cpcCents, marginCents, clicks: 0, purchases: 0, spentCents: 0, killed: false };
}

/** Conversion rate at which an arm exactly pays for its clicks. */
export function breakEvenRate(arm: Arm): number {
  return arm.cpcCents / arm.marginCents;
}

const posterior = (arm: Arm, rng: Rng) => sampleBeta(1 + arm.purchases, 1 + arm.clicks - arm.purchases, rng);

/** Monte Carlo estimate of P(true conversion rate > break-even). */
export function probBeatsBreakEven(arm: Arm, rng: Rng, samples = 400): number {
  const be = breakEvenRate(arm);
  let wins = 0;
  for (let i = 0; i < samples; i++) if (posterior(arm, rng) > be) wins++;
  return wins / samples;
}

/** Split a budget across live arms with Thompson sampling, in $1 chunks. */
export function allocate(arms: Arm[], budgetCents: number, rng: Rng, chunkCents = 100): Map<string, number> {
  const live = arms.filter(a => !a.killed);
  const out = new Map<string, number>(live.map(a => [a.id, 0]));
  if (!live.length) return out;
  for (let left = budgetCents; left >= chunkCents; left -= chunkCents) {
    let best = live[0], bestScore = -Infinity;
    for (const a of live) {
      const score = posterior(a, rng) * a.marginCents - a.cpcCents; // sampled profit per click
      if (score > bestScore) { bestScore = score; best = a; }
    }
    out.set(best.id, out.get(best.id)! + chunkCents);
  }
  return out;
}

export function shouldKill(arm: Arm, rng: Rng, rule: KillRule = DEFAULT_KILL_RULE): boolean {
  return !arm.killed && arm.clicks >= rule.minClicks && probBeatsBreakEven(arm, rng) < rule.threshold;
}
