// Support agent: reads the inbox, answers order-status questions, and issues refunds.
// Refunds up to $25 go through on their own; bigger ones go to the user's decision inbox
// (enforced by the risk layer through maxCostPerActionCents). Owner: Person 4

import { randomUUID } from 'node:crypto';
import type { Action } from '../contract/actions.ts';
import type { Agent } from '../contract/agents.ts';

export type Intent = 'order_status' | 'refund' | 'return' | 'other';

export function classifyEmail(subject: string, body: string): Intent {
  const t = `${subject} ${body}`.toLowerCase();
  if (/refund|money back|charge back|chargeback/.test(t)) return 'refund';
  if (/return|exchange|wrong size|doesn.t fit/.test(t)) return 'return';
  if (/where is|tracking|shipped|status|hasn.t arrived|not arrived/.test(t)) return 'order_status';
  return 'other';
}

export const REFUND_LIMIT_CENTS = 2500;

export const supportAgent: Agent = {
  name: 'support',
  tools: ['email', 'shopify'],
  permissions: { allowedActions: ['support.reply', 'support.refund'], maxCostPerActionCents: REFUND_LIMIT_CENTS },
  async run(ctx) {
    const [inbox, orders] = await Promise.all([ctx.adapters.email.inbox(), ctx.adapters.shopify.listOrders()]);
    const total = new Map(orders.map(o => [o.id, o.totalCents]));
    const id = () => randomUUID().slice(0, 8);

    return inbox.map((m): Action => {
      const intent = classifyEmail(m.subject, m.body);
      if ((intent === 'refund' || intent === 'return') && m.orderId) {
        return {
          id: id(), agent: 'support', subTeamId: null, type: 'support.refund',
          costCents: total.get(m.orderId) ?? 0,
          payload: { orderId: m.orderId, to: m.from, intent },
          reasoning: `${intent === 'return' ? 'Return' : 'Refund'} request: "${m.body}"`, evidence: [],
        };
      }
      return {
        id: id(), agent: 'support', subTeamId: null, type: 'support.reply', costCents: 0,
        payload: {
          to: m.from, subject: `Re: ${m.subject}`, intent,
          body: intent === 'order_status' ? 'Your order has shipped and should arrive in 2-3 days.' : 'Thanks for reaching out! A teammate will follow up shortly.',
        },
        reasoning: `Classified as ${intent}.`, evidence: [],
      };
    });
  },
};
