// Research agent: returns 5 ranked niches, each with its evidence.
// v0 scores a fixed dataset with a transparent formula. Next: real trend + competitor data,
// with an LLM writing the summary. Owner: Person 3

import type { Agent } from '../contract/agents.ts';
import type { Evidence } from '../contract/actions.ts';
import type { Profile } from './onboarding.ts';

export interface NicheCandidate {
  id: string;
  name: string;
  tags: string[];
  trendGrowthPct: number;   // search interest, year over year
  competitorCount: number;  // stores selling close matches
  avgPriceCents: number;
  podCostCents: number;
  suppliers: string[];      // POD providers that print it
}

export interface RankedNiche extends NicheCandidate {
  score: number;            // 0-100
  marginPct: number;
  evidence: Evidence[];
}

// Sample data. Replace with live sources (Google Trends, competitor scrape, POD catalogs).
export const CANDIDATES: NicheCandidate[] = [
  { id: 'hiking', name: 'Retro hiking tees', tags: ['outdoors', 'hiking', 'art'], trendGrowthPct: 34, competitorCount: 120, avgPriceCents: 2899, podCostCents: 1250, suppliers: ['printful', 'printify'] },
  { id: 'plants', name: 'Plant-parent humor mugs', tags: ['plants', 'humor', 'home'], trendGrowthPct: 22, competitorCount: 210, avgPriceCents: 1899, podCostCents: 850, suppliers: ['printful', 'printify'] },
  { id: 'nurse', name: 'Night-shift nurse tees', tags: ['healthcare', 'humor'], trendGrowthPct: 15, competitorCount: 480, avgPriceCents: 2499, podCostCents: 1250, suppliers: ['printify'] },
  { id: 'climb', name: 'Minimal climbing hoodies', tags: ['outdoors', 'climbing', 'fitness'], trendGrowthPct: 28, competitorCount: 90, avgPriceCents: 4499, podCostCents: 2400, suppliers: ['printful'] },
  { id: 'cats', name: 'Cat-dad mugs', tags: ['pets', 'humor'], trendGrowthPct: 9, competitorCount: 650, avgPriceCents: 1799, podCostCents: 850, suppliers: ['printful', 'printify'] },
  { id: 'study', name: 'Study-planner printables', tags: ['students', 'digital', 'productivity'], trendGrowthPct: 41, competitorCount: 300, avgPriceCents: 799, podCostCents: 0, suppliers: ['digital'] },
  { id: 'gym', name: 'Gym-bro motivational tees', tags: ['fitness', 'humor'], trendGrowthPct: 6, competitorCount: 900, avgPriceCents: 2499, podCostCents: 1250, suppliers: ['printful', 'printify'] },
  { id: 'vinyl', name: 'Vinyl-collector posters', tags: ['music', 'art', 'home'], trendGrowthPct: 18, competitorCount: 140, avgPriceCents: 2999, podCostCents: 1100, suppliers: ['printful'] },
];

const norm = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

export const WEIGHTS = { trend: 0.35, competition: 0.25, margin: 0.25, fit: 0.15 };

export function rankNiches(profile: Pick<Profile, 'interests'> | null, candidates = CANDIDATES, top = 5): RankedNiche[] {
  const interests = new Set(profile?.interests ?? []);
  return candidates
    .map(c => {
      const marginPct = (c.avgPriceCents - c.podCostCents) / c.avgPriceCents;
      const fit = c.tags.filter(t => interests.has(t)).length / Math.max(1, Math.min(2, interests.size));
      const score = 100 * (
        WEIGHTS.trend * norm(c.trendGrowthPct, 0, 45) +
        WEIGHTS.competition * (1 - norm(Math.log10(c.competitorCount), 1.5, 3)) +
        WEIGHTS.margin * norm(marginPct, 0.3, 0.7) +
        WEIGHTS.fit * Math.min(1, fit));
      const evidence: Evidence[] = [
        { source: 'search_trends', summary: `+${c.trendGrowthPct}% search interest YoY` },
        { source: 'competitors', summary: `${c.competitorCount} stores selling close matches` },
        { source: 'margin', summary: `${Math.round(marginPct * 100)}% margin at $${(c.avgPriceCents / 100).toFixed(2)}` },
        { source: 'suppliers', summary: c.suppliers.join(', ') },
      ];
      return { ...c, score: Math.round(score), marginPct, evidence };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}

export function researchAgentFor(profile: Profile | null): Agent {
  return {
    name: 'research',
    tools: [],
    permissions: { allowedActions: ['research.rank_niches'] },
    async run(ctx) {
      const ranked = rankNiches(profile);
      return [{
        id: `research_${Date.now()}`, agent: 'research', subTeamId: ctx.subTeamId,
        type: 'research.rank_niches', costCents: 0,
        payload: { niches: ranked.map(r => ({ id: r.id, name: r.name, score: r.score })) },
        reasoning: `Ranked ${CANDIDATES.length} candidates on trend, competition, margin and fit with the user's interests.`,
        evidence: ranked[0].evidence,
      }];
    },
  };
}
