// Stub agents with hard-coded logic. Each owner replaces theirs with an LLM-backed version
// that keeps the same interface. Research/store = Person 3, Ads/support = Person 4.

import { randomUUID } from 'node:crypto';
import type { Action } from '../contract/actions.ts';
import type { Agent } from '../contract/agents.ts';

const act = (a: Omit<Action, 'id'>): Action => ({ id: randomUUID().slice(0, 8), ...a });

export const researchAgent: Agent = {
  name: 'research',
  tools: [],
  permissions: { allowedActions: ['research.rank_niches'] },
  async run(ctx) {
    return [act({
      agent: 'research', subTeamId: ctx.subTeamId, type: 'research.rank_niches', costCents: 0,
      payload: { niches: [
        { name: 'Retro hiking tees', score: 82 },
        { name: 'Cat-dad humor mugs', score: 77 },
        { name: 'Minimalist climbing hoodies', score: 71 },
      ] },
      reasoning: 'Rising search interest, low competitor saturation, POD-friendly.',
      evidence: [{ source: 'google_trends', summary: '"hiking shirt" +34% YoY' }],
    })];
  },
};

export const storeBuildAgent: Agent = {
  name: 'store_build',
  tools: ['shopify'],
  permissions: { allowedActions: ['store.create_page', 'product.create'] },
  async run(ctx) {
    return [
      act({ agent: 'store_build', subTeamId: ctx.subTeamId, type: 'store.create_page', costCents: 0,
        payload: { title: 'About Trailhead Supply', body: 'Gear-inspired designs for weekend hikers.' },
        reasoning: 'Every store needs an About page for trust.', evidence: [] }),
      act({ agent: 'store_build', subTeamId: ctx.subTeamId, type: 'product.create', costCents: 0,
        payload: { title: 'Sunset Switchback Tee', priceCents: 2899 },
        reasoning: 'Top-scoring design from creative agent.', evidence: [] }),
    ];
  },
};

export const adsAgent: Agent = {
  name: 'ads',
  tools: ['ads'],
  permissions: { allowedActions: ['ads.launch_campaign', 'ads.adjust_budget'], budgetScope: 'sub_team' },
  async run(ctx) {
    return [
      act({ agent: 'ads', subTeamId: ctx.subTeamId, type: 'ads.launch_campaign', costCents: 3000,
        payload: { name: 'Hiking tees – test A', dailyBudgetCents: 1000 },
        reasoning: '3-day test at $10/day to measure CTR and CPA.',
        evidence: [{ source: 'creative_score', summary: 'Top ad image scored 0.81' }] }),
      // Deliberately over budget: shows the safety layer aborting it.
      act({ agent: 'ads', subTeamId: ctx.subTeamId, type: 'ads.adjust_budget', costCents: 25000,
        payload: { campaignId: 'camp_?', dailyBudgetCents: 25000 },
        reasoning: 'Scale aggressively.', evidence: [] }),
    ];
  },
};

export const supportAgent: Agent = {
  name: 'support',
  tools: ['email', 'shopify'],
  permissions: { allowedActions: ['support.reply', 'support.refund'], maxCostPerActionCents: 2500 },
  async run(ctx) {
    const inbox = await ctx.adapters.email.inbox();
    return inbox.map(m => m.subject.toLowerCase().includes('refund')
      ? act({ agent: 'support', subTeamId: null, type: 'support.refund', costCents: 3499,
          payload: { orderId: m.orderId, to: m.from },
          reasoning: `Customer requested refund: "${m.body}"`, evidence: [] })
      : act({ agent: 'support', subTeamId: null, type: 'support.reply', costCents: 0,
          payload: { to: m.from, subject: `Re: ${m.subject}`, body: 'Your order shipped and arrives in 2 days.' },
          reasoning: 'Order status question; tracking shows in transit.', evidence: [] }));
  },
};
