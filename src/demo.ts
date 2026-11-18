// End-to-end demo on fake adapters: agents propose actions -> risk layer -> events.
// Run: npm run demo   (Node 22.18+, no install needed)

import { fakeAdapters } from './adapters/fake/index.ts';
import { adsAgent, researchAgent, storeBuildAgent, supportAgent } from './agents/fakeAgents.ts';
import { EventBus } from './core/eventBus.ts';
import { Orchestrator } from './core/orchestrator.ts';
import { SpendGovernor } from './core/spendGovernor.ts';

const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
const icon: Record<string, string> = {
  'action.proposed': '•', 'action.executed': '✓', 'action.aborted': '✗',
  'approval.requested': '?', 'approval.decided': '→', 'ledger.updated': '$',
};

const bus = new EventBus();
bus.subscribe(e => console.log(`  ${icon[e.name] ?? ' '} ${e.name.padEnd(19)} ${JSON.stringify(e.payload)}`));

const SUB_TEAM = 'team_hiking';
const governor = new SpendGovernor(20000 /* $200 loss cap from onboarding */, new Map([[SUB_TEAM, 10000]]));
const orch = new Orchestrator('store_demo', fakeAdapters(), governor, bus);

console.log(`\nLoss cap ${$(governor.lossCapCents)} | sub-team "${SUB_TEAM}" budget $100.00\n`);

for (const [agent, team] of [
  [researchAgent, null], [storeBuildAgent, SUB_TEAM], [adsAgent, SUB_TEAM], [supportAgent, null],
] as const) {
  console.log(`▶ ${agent.name} agent`);
  await orch.runAgent(agent, team);
}

console.log(`\nDecision inbox (${orch.pendingApprovals.length} waiting):`);
for (const a of orch.pendingApprovals) console.log(`  [${a.id}] ${a.type} ${$(a.costCents)} — ${a.verdictReason}`);

console.log('\nUser approves the ad campaign, denies the refund:');
for (const a of [...orch.pendingApprovals]) await orch.decide(a.id, a.type === 'ads.launch_campaign');

const s = governor.snapshot();
console.log(`\nSpent ${$(s.spentCents)} of ${$(s.lossCapCents)} cap | ${orch.trace.length} actions traced | ${bus.log.length} events\n`);
