import test from 'node:test';
import assert from 'node:assert/strict';
import { urgencyOf, trendOf, sparkline } from '../js/debrief.js';

test('urgencyOf is low without a deadline and higher for tighter windows', () => {
  assert.equal(urgencyOf({ deadline: null, arrivesAt: 0 }), 0.1);
  assert.equal(urgencyOf({ deadline: 999, arrivesAt: 0 }), 0.1);
  assert.ok(urgencyOf({ deadline: 60, arrivesAt: 0 }) > urgencyOf({ deadline: 240, arrivesAt: 0 }));
  assert.ok(urgencyOf({ deadline: 30, arrivesAt: 0 }) <= 1);
});

test('trendOf describes change against the previous attempt', () => {
  assert.deepEqual(trendOf(60, null), { arrow: '', text: 'First attempt' });
  assert.equal(trendOf(70, 60).arrow, '\u25B2');
  assert.match(trendOf(70, 60).text, /up 10/);
  assert.equal(trendOf(50, 60).arrow, '\u25BC');
  assert.match(trendOf(50, 60).text, /down 10/);
  assert.equal(trendOf(60, 60).arrow, '\u2013');
});

test('sparkline needs two points and stays inside its box', () => {
  assert.equal(sparkline([40]), '');
  const svg = sparkline([40, 60, 55]);
  assert.ok(svg.startsWith('<svg') && svg.includes('<polyline'));
});

import { highStakes, commitmentCheck } from '../js/debrief.js';

const hsRec = (id, impact, tags = []) => ({ id, impact, tags, def: { subject: id } });

test('highStakes counts impact 4 and 5 messages handled well, and crisis messages too', () => {
  const summary = {
    items: { a: hsRec('a', 5), b: hsRec('b', 4), c: hsRec('c', 4, ['crisis']), d: hsRec('d', 2), e: hsRec('e', 5) },
    decisions: [
      { id: 'a', action: 'do_now', credit: 1 }, { id: 'b', action: 'schedule', credit: 0.9 },
      { id: 'c', action: 'none', credit: 0 }, { id: 'd', action: 'do_now', credit: 1 }, { id: 'e', action: 'decline', credit: 0.5 },
    ],
    escalations: 2,
  };
  assert.deepEqual(highStakes(summary), { handled: 2, total: 4, escalations: 2 });
});

test('highStakes handles a day with no high-stakes messages', () => {
  assert.deepEqual(highStakes({ items: { d: hsRec('d', 2) }, decisions: [{ id: 'd', action: 'do_now', credit: 1 }], escalations: 0 }), { handled: 0, total: 0, escalations: 0 });
});

test('commitmentCheck says nothing without a saved commitment', () => {
  assert.equal(commitmentCheck(null, { rank: 70 }), '');
  assert.equal(commitmentCheck({ commitment: null }, { rank: 70 }), '');
});

test('commitmentCheck compares the chosen habit with last time', () => {
  const last = { tendencies: { rank: 60, quick: 100 }, commitment: { habit: 'rank', text: 'Ask what is at stake first.' } };
  assert.match(commitmentCheck(last, { rank: 100, quick: 100 }), /improved/i);
  assert.match(commitmentCheck(last, { rank: 60, quick: 100 }), /same/i);
  assert.match(commitmentCheck(last, { rank: 40, quick: 100 }), /slipped|lower/i);
  assert.ok(commitmentCheck(last, { rank: 100 }).includes('Rank bias'));
});

import { keyDecisions } from '../js/debrief.js';

const kdItem = (id, trapKey) => ({
  id, impact: 4, tags: [],
  def: {
    subject: `Subject ${id}`, why: 'Because it matters.',
    choices: [
      { id: 'a', kind: 'do_now', credit: 1, label: 'The strong move.', text: 'Strong result.' },
      { id: 'b', kind: 'decline', credit: 0.1, trap: trapKey, label: 'The tempting move.', text: 'Weak result.' },
    ],
  },
});

test('keyDecisions lists decisions on messages with specific responses, in order, with the strongest response', () => {
  const summary = {
    items: { k1: kdItem('k1', 'rank'), k2: kdItem('k2', 'avoidance'), p: { id: 'p', impact: 2, tags: [], def: { subject: 'Plain' } } },
    decisions: [
      { id: 'k1', action: 'decline', credit: 0.1, choiceId: 'b', choiceLabel: 'The tempting move.', text: 'Weak result.', minute: 10 },
      { id: 'p', action: 'do_now', credit: 1, minute: 20 },
      { id: 'k2', action: 'do_now', credit: 1, choiceId: 'a', choiceLabel: 'The strong move.', text: 'Strong result.', minute: 30 },
    ],
  };
  const rows = keyDecisions(summary);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.subject), ['Subject k1', 'Subject k2']);
  assert.equal(rows[0].chosen, 'The tempting move.');
  assert.equal(rows[0].strongest, 'The strong move.');
  assert.equal(rows[0].result, 'weak');
  assert.equal(rows[0].habit, 'Rank bias');
  assert.equal(rows[1].result, 'strong');
  assert.equal(rows[1].habit, null);
  assert.equal(rows[0].why, 'Because it matters.');
});

test('keyDecisions reports a message nobody answered in time', () => {
  const summary = {
    items: { k1: kdItem('k1', 'rank') },
    decisions: [{ id: 'k1', action: 'none', credit: 0, minute: 90 }],
  };
  const [row] = keyDecisions(summary);
  assert.match(row.chosen, /no response/i);
  assert.match(row.text, /nobody|no one/i);
  assert.equal(row.result, 'weak');
  assert.equal(row.strongest, 'The strong move.');
});

test('keyDecisions is empty when no message had specific responses', () => {
  assert.deepEqual(keyDecisions({ items: { p: { id: 'p', def: { subject: 'x' } } }, decisions: [{ id: 'p', action: 'do_now', credit: 1 }] }), []);
});
