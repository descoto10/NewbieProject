// Action risk layer: classify -> simulate -> route to PROCEED / ASK_HUMAN / ABORT.
// Owner: Person 2

import type { Action, ClassifiedAction, RiskTier } from '../contract/actions.ts';
import type { Permissions } from '../contract/agents.ts';
import type { SpendGovernor } from './spendGovernor.ts';

const HIGH_RISK = new Set(['ads.launch_campaign', 'team.kill']);
const MEDIUM_RISK = new Set(['ads.adjust_budget', 'support.refund', 'product.create']);

export function classify(action: Action): RiskTier {
  if (HIGH_RISK.has(action.type) || action.costCents >= 5000) return 'high';
  if (MEDIUM_RISK.has(action.type) || action.costCents > 0) return 'medium';
  return 'low';
}

export function evaluate(
  action: Action,
  perms: Permissions,
  governor: SpendGovernor,
): ClassifiedAction {
  const riskTier = classify(action);
  const out = (verdict: ClassifiedAction['verdict'], verdictReason: string): ClassifiedAction =>
    ({ ...action, riskTier, verdict, verdictReason });

  // 1. Permission check: agent may only take actions it declared.
  if (!perms.allowedActions.includes(action.type))
    return out('ABORT', `agent "${action.agent}" is not permitted to ${action.type}`);

  // 2. Simulate the money effect against hard caps.
  if (action.costCents > governor.availableCents)
    return out('ABORT', `would exceed loss cap (available $${(governor.availableCents / 100).toFixed(2)})`);
  if (action.subTeamId && action.costCents > governor.subTeamRemaining(action.subTeamId))
    return out('ABORT', 'would exceed sub-team budget');

  // 3. Per-agent spending limit (e.g. support refunds up to $25): over it -> human decides.
  if (perms.maxCostPerActionCents !== undefined && action.costCents > perms.maxCostPerActionCents)
    return out('ASK_HUMAN', `$${(action.costCents / 100).toFixed(2)} is over this agent's $${(perms.maxCostPerActionCents / 100).toFixed(2)} limit`);

  // 4. Route by tier.
  if (riskTier === 'high') return out('ASK_HUMAN', 'high-risk action needs approval');
  return out('PROCEED', `${riskTier} risk, within limits`);
}
