// P&L from the ledger: orders, ad spend, POD costs, refunds and fees.
// Owner: Person 2

export interface LedgerEntry {
  kind: 'revenue' | 'ad_spend' | 'pod_cost' | 'refund' | 'fee';
  amountCents: number; // positive number; kind decides the sign
  subTeamId?: string;
}

export interface PnL {
  revenueCents: number;
  podCents: number;
  adSpendCents: number;
  refundCents: number;
  feeCents: number;
  netCents: number;
  roas: number | null; // revenue / ad spend
}

export const SHOPIFY_FEE = (priceCents: number) => Math.round(priceCents * 0.029) + 30;

export function computePnL(entries: LedgerEntry[], subTeamId?: string): PnL {
  const sum = (k: LedgerEntry['kind']) => entries
    .filter(e => e.kind === k && (!subTeamId || e.subTeamId === subTeamId))
    .reduce((s, e) => s + e.amountCents, 0);
  const revenueCents = sum('revenue'), podCents = sum('pod_cost'), adSpendCents = sum('ad_spend');
  const refundCents = sum('refund'), feeCents = sum('fee');
  return {
    revenueCents, podCents, adSpendCents, refundCents, feeCents,
    netCents: revenueCents - podCents - adSpendCents - refundCents - feeCents,
    roas: adSpendCents ? revenueCents / adSpendCents : null,
  };
}
