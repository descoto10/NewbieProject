// Person 3: research ranking + design screening
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateDesigns, launchable, screenDesign } from '../src/agents/creative.ts';
import { CANDIDATES, rankNiches } from '../src/agents/research.ts';

test('research returns exactly 5 niches, sorted, each with 4 pieces of evidence', () => {
  const r = rankNiches({ interests: ['hiking', 'art'] });
  assert.equal(r.length, 5);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  assert.ok(r.every(n => n.evidence.length === 4));
});

test("the user's interests change the ranking", () => {
  const outdoors = rankNiches({ interests: ['climbing', 'outdoors'] }).map(n => n.id);
  const pets = rankNiches({ interests: ['pets', 'humor'] }).map(n => n.id);
  assert.notDeepEqual(outdoors, pets);
});

test('trademarks and look-alikes are blocked before launch', () => {
  assert.equal(screenDesign('Just Do It Again').ok, false);
  assert.equal(screenDesign('The North Face Of Monday').ok, false);
  assert.equal(screenDesign('Crazy Plant Lady').ok, false);
  assert.equal(screenDesign('Sunset Switchback Club').ok, true);
});

test('3-5 designs per niche, and flagged designs never reach launch', () => {
  for (const c of CANDIDATES) {
    const d = generateDesigns(c.id);
    assert.ok(d.length >= 3 && d.length <= 5, `${c.id} has ${d.length}`);
    assert.ok(launchable(d).every(x => x.screening === 'passed'));
  }
});
