// Person 4: onboarding transcript -> profile, support triage
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeAdapters } from '../src/adapters/fake/index.ts';
import { parseTranscript, SAMPLE_TRANSCRIPT } from '../src/agents/onboarding.ts';
import { classifyEmail, supportAgent } from '../src/agents/support.ts';
import { EventBus } from '../src/core/eventBus.ts';
import { Orchestrator } from '../src/core/orchestrator.ts';
import { SpendGovernor } from '../src/core/spendGovernor.ts';

test('sample onboarding call fills every profile field and sets a $150 cap', () => {
  const p = parseTranscript(SAMPLE_TRANSCRIPT);
  assert.equal(p.lossCapCents, 15000);
  assert.equal(p.hoursPerWeek, 3);
  assert.equal(p.followers, 2400);
  assert.equal(p.persona, 'student');
  assert.equal(p.riskTolerance, 'low');
  assert.ok(p.interests.includes('hiking') && p.interests.includes('art'));
  assert.deepEqual(p.missing, []);
});

test('a call without a budget flags the loss cap as a needed follow-up', () => {
  const p = parseTranscript('User: I work a 9 to 5 and like plants. Maybe 2 hours a week.');
  assert.equal(p.lossCapCents, null);
  assert.ok(p.missing.includes('loss cap'));
});

test('only the user lines count, not the agent question', () => {
  const p = parseTranscript("Hive: Would you be okay losing $500?\nUser: No way, I'd cap it at $100.");
  assert.equal(p.lossCapCents, 10000);
});

test('emails are classified by intent', () => {
  assert.equal(classifyEmail('Where is my order?', ''), 'order_status');
  assert.equal(classifyEmail('Refund please', ''), 'refund');
  assert.equal(classifyEmail('Hi', 'it came in the wrong size'), 'return');
  assert.equal(classifyEmail('Bulk order', 'for my club'), 'other');
});

test('refunds up to $25 go through; bigger ones wait for the user', async () => {
  const orch = new Orchestrator('s', fakeAdapters(), new SpendGovernor(15000), new EventBus());
  await orch.runAgent(supportAgent, null);
  const refunds = orch.trace.filter(a => a.type === 'support.refund');
  assert.ok(refunds.some(r => r.costCents <= 2500 && r.verdict === 'PROCEED'));
  assert.ok(refunds.some(r => r.costCents > 2500 && r.verdict === 'ASK_HUMAN'));
});
