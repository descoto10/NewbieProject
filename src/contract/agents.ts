// The agent interface: run(context) -> Action[]
// Each agent declares the tools (adapters) it may use and its permission limits.

import type { Action, ActionType } from './actions.ts';
import type { Adapters } from './adapters.ts';

export interface Permissions {
  allowedActions: ActionType[];
  maxCostPerActionCents?: number;   // e.g. support refunds up to $25 = 2500
  budgetScope?: 'sub_team' | 'store';
}

export interface AgentContext {
  storeId: string;
  subTeamId: string | null;
  remainingBudgetCents: number;
  adapters: Adapters;
  now: Date;
}

export interface Agent {
  name: string;
  tools: (keyof Adapters)[];
  permissions: Permissions;
  run(ctx: AgentContext): Promise<Action[]>;
}
