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
