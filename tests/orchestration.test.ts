// Person 1: event log durability + sub-team spin-up
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fakeAdapters } from '../src/adapters/fake/index.ts';
import { supportAgent } from '../src/agents/support.ts';
import { EventBus } from '../src/core/eventBus.ts';
import { EventLog } from '../src/core/eventLog.ts';
import { Orchestrator } from '../src/core/orchestrator.ts';
import { SpendGovernor } from '../src/core/spendGovernor.ts';

test('events persist to disk and replay rebuilds the same state', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'hive-')), 'events.jsonl');
  const bus = new EventBus(new EventLog(file));
  const orch = new Orchestrator('s', fakeAdapters(), new SpendGovernor(15000), bus);
  orch.spinUpSubTeams([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 6000);
  orch.killSubTeam('team_b', 'test');
  await orch.runAgent(supportAgent, null);

  // A fresh process reading the same file sees identical history.
  const reloaded = new EventLog(file);
  const state = reloaded.replay((s, e) => {
    if (e.name === 'subteam.created') s.teams.add(e.payload.id as string);
    if (e.name === 'subteam.killed') s.teams.delete(e.payload.id as string);
    if (e.name === 'action.proposed') s.actions++;
    return s;
  }, { teams: new Set<string>(), actions: 0 });

  assert.equal(reloaded.readAll().length, bus.log.length);
  assert.deepEqual([...state.teams], ['team_a']);
  assert.equal(state.actions, orch.trace.length);
});

test('orchestrator creates one sub-team per niche with an equal budget slice', () => {
  const orch = new Orchestrator('s', fakeAdapters(), new SpendGovernor(15000), new EventBus());
  const teams = orch.spinUpSubTeams([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }, { id: 'z', name: 'Z' }], 9000);
  assert.equal(teams.length, 3);
  assert.ok(teams.every(t => t.budgetCents === 3000 && t.status === 'testing'));
});
