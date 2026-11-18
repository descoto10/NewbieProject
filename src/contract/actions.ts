// The Action interface: the one shape every agent produces.
// Owner: Person 2 (Money & Safety) has final say on tiers and verdicts.

export type RiskTier = 'low' | 'medium' | 'high';
export type Verdict = 'PROCEED' | 'ASK_HUMAN' | 'ABORT';

export type ActionType =
  | 'research.rank_niches'
  | 'store.create_page'
  | 'product.create'
  | 'creative.generate'
  | 'ads.launch_campaign'
  | 'ads.adjust_budget'
  | 'support.reply'
  | 'support.refund'
  | 'team.kill';

export interface Evidence {
  source: string;   // e.g. "google_trends", "competitor:shop.example.com"
  summary: string;
}

export interface Action {
  id: string;
  agent: string;            // agent name, e.g. "ads"
  subTeamId: string | null;
  type: ActionType;
  payload: Record<string, unknown>;
  costCents: number;        // money this action would spend (0 if none)
  reasoning: string;        // why the agent wants this (stored for tracing)
  evidence: Evidence[];
}

export interface ClassifiedAction extends Action {
  riskTier: RiskTier;
  verdict: Verdict;
  verdictReason: string;
}
