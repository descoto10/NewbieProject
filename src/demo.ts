// Hive end-to-end demo on fake adapters, following the PRD user journey:
// onboarding call -> 5 ranked niches -> sub-team per niche -> designs -> capped test
// -> keep-or-kill -> daily ops (support) through the action gate.
// Run: npm run demo

import { fakeAdapters } from './adapters/fake/index.ts';
import { generateDesigns, launchable } from './agents/creative.ts';
import { adsAgent, storeBuildAgent } from './agents/fakeAgents.ts';
import { parseTranscript, SAMPLE_TRANSCRIPT } from './agents/onboarding.ts';
import { rankNiches } from './agents/research.ts';
import { supportAgent } from './agents/support.ts';
import { EventBus } from './core/eventBus.ts';
import { Orchestrator } from './core/orchestrator.ts';
import { SpendGovernor } from './core/spendGovernor.ts';
import { newArm, probBeatsBreakEven } from './core/allocator.ts';
import { mulberry32 } from './core/rng.ts';
import { runMarket, type SimArm } from './sim/market.ts';

const $ = (c: number) => `${c < 0 ? '-' : ''}$${(Math.abs(c) / 100).toFixed(2)}`;
const h = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// 1. Onboarding
h('1. Onboarding call -> profile');
const profile = parseTranscript(SAMPLE_TRANSCRIPT);
console.log(`  persona=${profile.persona}  interests=${profile.interests.join(',')}  hours=${profile.hoursPerWeek}/wk  followers=${profile.followers}  risk=${profile.riskTolerance}`);
console.log(`  loss cap set to ${$(profile.lossCapCents!)}${profile.missing.length ? `  (follow-ups needed: ${profile.missing.join(', ')})` : ''}`);

// 2. Research
h('2. Research agent: 5 ranked niches');
const ranked = rankNiches(profile);
for (const [i, n] of ranked.entries()) console.log(`  ${i + 1}. ${n.name.padEnd(28)} score ${n.score}  | ${n.evidence.slice(0, 3).map(e => e.summary).join(' | ')}`);
const chosen = ranked.slice(0, 3);
console.log(`  user picks: ${chosen.map(c => c.name).join(', ')}`);

// 3. Sub-teams
h('3. Orchestrator spins up one sub-team per niche');
const bus = new EventBus();
const governor = new SpendGovernor(profile.lossCapCents!);
const orch = new Orchestrator('store_demo', fakeAdapters(), governor, bus);
const teams = orch.spinUpSubTeams(chosen, 9000);
for (const t of teams) console.log(`  ${t.id.padEnd(14)} budget ${$(t.budgetCents)}  agents: ${t.agents.join(', ')}`);

// 4. Designs
h('4. Creative agent: designs per niche, trademark-screened');
for (const n of chosen) {
  const d = generateDesigns(n.id);
  const flagged = d.filter(x => x.screening === 'flagged');
  console.log(`  ${n.name}: ${d.length} designs, ${launchable(d).length} launchable${flagged.length ? `, blocked: ${flagged.map(f => `"${f.title}" (${f.flagReason})`).join('; ')}` : ''}`);
}

// 5. Capped test (simulated market, 10 days)
h('5. Capped test: Thompson sampling + spend governor, 10 simulated days');
const TRUE_RATE: Record<string, number> = { hiking: 0.05, study: 0.012, climb: 0.022, vinyl: 0.03, plants: 0.03 };
const arms: SimArm[] = chosen.flatMap(n => ['A', 'B'].map((v, i) => ({
  id: `${n.id}_${v}`, subTeamId: `team_${n.id}`,
  trueRate: (TRUE_RATE[n.id] ?? 0.015) * (i ? 0.7 : 1),
  cpcCents: 45, priceCents: n.avgPriceCents, podCents: n.podCostCents,
})));
const sim = runMarket({ seed: 7, days: 10, lossCapCents: profile.lossCapCents!, dailyBudgetCents: 900, refundRate: 0.08, arms });
for (const a of sim.arms) console.log(`  ${a.id.padEnd(9)} spent ${$(a.spentCents).padStart(7)}  clicks ${String(a.clicks).padStart(3)}  orders ${a.purchases}  P(break even)=${a.pBeatsBreakEven.toFixed(2)}  ${a.killed ? 'KILLED by governor' : ''}`);
console.log(`  net ${$(sim.finalNetCents)}  | worst point ${$(-sim.maxLossCents)} vs cap ${$(profile.lossCapCents!)}  | breached: ${sim.breached}`);

// 6. Keep or kill
h('6. Keep-or-kill recommendation');
// Pool each sub-team's arms and ask: how likely is this niche to beat break-even?
const rng = mulberry32(99);
const verdicts = teams.map(t => {
  const mine = sim.arms.filter(a => a.subTeamId === t.id);
  const pooled = newArm(t.id, t.id, mine[0].cpcCents, mine[0].marginCents);
  for (const a of mine) { pooled.clicks += a.clicks; pooled.purchases += a.purchases; pooled.spentCents += a.spentCents; }
  return { t, pooled, p: probBeatsBreakEven(pooled, rng) };
}).sort((a, b) => b.p - a.p);
for (const [i, v] of verdicts.entries()) {
  const keep = i === 0 && v.p >= 0.5;
  if (keep) v.t.status = 'scaling'; else orch.killSubTeam(v.t.id, `P(break even) ${v.p.toFixed(2)}`);
  console.log(`  ${keep ? 'KEEP' : 'KILL'}  ${v.t.nicheName.padEnd(26)} ${v.pooled.purchases} orders / ${v.pooled.clicks} clicks, spent ${$(v.pooled.spentCents)}, P(break even) ${v.p.toFixed(2)}`);
}
console.log(`  note: governor kill rule fired on ${sim.killed.length} arms mid-test. At ~$30 per niche, clicks are too few for 95% confidence;`);
console.log(`        the PRD's shared priors across stores are what make earlier kills possible.`);
const winner = verdicts[0].t.id;

// 7. Daily ops: store build, ads, support through the action gate
h('7. Daily ops through the action gate');
await orch.runAgent(storeBuildAgent, winner);
await orch.runAgent(adsAgent, winner);
await orch.runAgent(supportAgent, null);
const auto = orch.trace.filter(a => a.verdict === 'PROCEED').length;
for (const a of orch.trace) console.log(`  ${a.verdict.padEnd(9)} ${a.agent.padEnd(11)} ${a.type.padEnd(20)} ${$(a.costCents).padStart(7)}  ${a.verdictReason}`);
console.log(`\n  decision inbox: ${orch.pendingApprovals.length} waiting | autonomy rate ${Math.round(100 * auto / orch.trace.length)}% | ${bus.log.length} events logged\n`);
