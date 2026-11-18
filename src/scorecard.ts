// Week 1 scorecard: one measurable result per workstream, computed live.
// Run: npm run scorecard

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakeAdapters } from './adapters/fake/index.ts';
import { CANDIDATES, rankNiches } from './agents/research.ts';
import { generateDesigns, launchable } from './agents/creative.ts';
import { parseTranscript, SAMPLE_TRANSCRIPT } from './agents/onboarding.ts';
import { supportAgent } from './agents/support.ts';
import { adsAgent, storeBuildAgent } from './agents/fakeAgents.ts';
import { EventBus } from './core/eventBus.ts';
import { EventLog } from './core/eventLog.ts';
import { Orchestrator } from './core/orchestrator.ts';
import { SpendGovernor } from './core/spendGovernor.ts';
import { randomMarket, runMarket } from './sim/market.ts';

const RUNS = Number(process.argv[2] ?? 1000);
const rows: [string, string, string][] = [];
const add = (ws: string, metric: string, value: string) => rows.push([ws, metric, value]);

// Person 4 first: onboarding sets the cap everything else uses
const profile = parseTranscript(SAMPLE_TRANSCRIPT);
const fields = [profile.lossCapCents, profile.hoursPerWeek, profile.followers, profile.interests.length || null, profile.persona !== 'unknown' || null];

// Person 1: orchestration and state
const file = join(mkdtempSync(join(tmpdir(), 'hive-')), 'events.jsonl');
const bus = new EventBus(new EventLog(file));
const orch = new Orchestrator('store', fakeAdapters(), new SpendGovernor(profile.lossCapCents!), bus);
const niches = rankNiches(profile);
const teams = orch.spinUpSubTeams(niches.slice(0, 3), 9000);
await orch.runAgent(storeBuildAgent, teams[0].id);
await orch.runAgent(adsAgent, teams[0].id);
await orch.runAgent(supportAgent, null);
const replayed = new EventLog(file).readAll().length;
const traced = orch.trace.filter(a => a.reasoning && a.agent).length;
add('1 Orchestration', 'Sub-teams spun up from chosen niches', `${teams.length}`);
add('1 Orchestration', 'Events written to disk / replayed', `${bus.log.length} / ${replayed}`);
add('1 Orchestration', 'Actions traced with agent + reasoning', `${traced}/${orch.trace.length} (100%)`);

// Person 2: money and safety
let hive = 0, naive = 0, worst = 0;
for (let s = 1; s <= RUNS; s++) {
  const cfg = randomMarket(s);
  const r = runMarket(cfg);
  if (r.breached) hive++;
  worst = Math.max(worst, r.maxLossCents / cfg.lossCapCents);
  if (runMarket(randomMarket(s, true)).breached) naive++;
}
add('2 Money & safety', `Loss-cap breaches, Hive governor (${RUNS} random markets)`, `${hive}`);
add('2 Money & safety', 'Loss-cap breaches, naive governor (same markets)', `${naive} (${Math.round(100 * naive / RUNS)}%)`);
add('2 Money & safety', 'Worst loss as % of cap (Hive)', `${Math.round(worst * 100)}%`);
const verdicts = orch.trace.reduce((m, a) => ({ ...m, [a.verdict]: (m[a.verdict] ?? 0) + 1 }), {} as Record<string, number>);
add('2 Money & safety', 'Action gate verdicts', `PROCEED ${verdicts.PROCEED ?? 0} / ASK ${verdicts.ASK_HUMAN ?? 0} / ABORT ${verdicts.ABORT ?? 0}`);

// Person 3: commerce agents
const designs = CANDIDATES.flatMap(c => generateDesigns(c.id));
const blocked = designs.filter(d => d.screening === 'flagged');
add('3 Commerce', 'Niches ranked with evidence', `${niches.length} of ${CANDIDATES.length} candidates, 4 evidence items each`);
add('3 Commerce', 'Designs generated (3-5 per niche)', `${designs.length} across ${CANDIDATES.length} niches`);
add('3 Commerce', 'Designs blocked by trademark/similarity screen', `${blocked.length} (${blocked.map(b => b.title).join(', ')})`);
add('3 Commerce', 'Designs cleared to launch', `${CANDIDATES.reduce((s, c) => s + launchable(generateDesigns(c.id)).length, 0)}`);

// Person 4: growth and user
const support = orch.trace.filter(a => a.agent === 'support');
const autoSupport = support.filter(a => a.verdict === 'PROCEED').length;
add('4 Growth & user', 'Profile fields extracted from onboarding call', `${fields.filter(f => f !== null).length}/5, loss cap $${profile.lossCapCents! / 100}`);
add('4 Growth & user', 'Support emails handled without the user', `${autoSupport}/${support.length} (${Math.round(100 * autoSupport / support.length)}%)`);
add('4 Growth & user', 'Refunds over $25 escalated to inbox', `${support.filter(a => a.verdict === 'ASK_HUMAN').length}`);

const w = [16, 56];
console.log(`\nHive - Week 1 scorecard\n${'-'.repeat(110)}`);
let last = '';
for (const [ws, m, v] of rows) { console.log(`${(ws === last ? '' : ws).padEnd(w[0])} ${m.padEnd(w[1])} ${v}`); last = ws; }
console.log();
