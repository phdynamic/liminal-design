import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTendencies, worstTendency, TENDENCY_KEYS } from '../js/engine.js';

const rec = (id, over = {}) => ({ id, def: { subject: id }, tags: [], impact: 3, effort: 20, delegable: true, ...over });
const dec = (id, action, credit, over = {}) => ({ id, action, credit, minute: 0, newest: false, openCount: 1, ...over });
const byKey = (list, key) => list.find((t) => t.key === key);

test('returns five tendencies in a stable order', () => {
  const list = detectTendencies([], {});
  assert.deepEqual(list.map((t) => t.key), TENDENCY_KEYS);
  assert.ok(list.every((t) => t.fired === false && t.score === 100));
});

test('rank bias fires when rank-pressure items get do_now and hidden-critical items are missed', () => {
  const items = {
    r1: rec('r1', { tags: ['rank-pressure'], impact: 1 }), r2: rec('r2', { tags: ['rank-pressure'], impact: 1 }),
    c1: rec('c1', { tags: ['hidden-critical'], impact: 4 }), c2: rec('c2', { tags: ['hidden-critical'], impact: 4 }),
  };
  const decisions = [dec('r1', 'do_now', 0.3), dec('r2', 'do_now', 0.3), dec('c1', 'decline', 0), dec('c2', 'none', 0)];
  const t = byKey(detectTendencies(decisions, items), 'rank');
  assert.equal(t.fired, true);
  assert.ok(t.score < 100);
  assert.ok(t.evidence.includes('r1') && t.evidence.includes('c1'));
});

test('rank bias stays quiet when the learner handled the quiet critical items well', () => {
  const items = {
    r1: rec('r1', { tags: ['rank-pressure'] }), r2: rec('r2', { tags: ['rank-pressure'] }),
    c1: rec('c1', { tags: ['hidden-critical'], impact: 4 }), c2: rec('c2', { tags: ['hidden-critical'], impact: 4 }),
  };
  const decisions = [dec('r1', 'decline', 1), dec('r2', 'decline', 1), dec('c1', 'do_now', 0.8), dec('c2', 'schedule', 0.9)];
  assert.equal(byKey(detectTendencies(decisions, items), 'rank').fired, false);
});

test('quick-win bias fires when easy items are done and important ones are dropped', () => {
  const items = {
    q1: rec('q1', { tags: ['quick-win'], impact: 1, effort: 3 }), q2: rec('q2', { tags: ['quick-win'], impact: 1, effort: 3 }),
    h1: rec('h1', { impact: 5 }), h2: rec('h2', { impact: 4 }),
  };
  const decisions = [dec('q1', 'do_now', 0.3), dec('q2', 'do_now', 0.3), dec('h1', 'schedule', 0.1), dec('h2', 'decline', 0)];
  assert.equal(byKey(detectTendencies(decisions, items), 'quick').fired, true);
});

test('recency bias fires when the newest item is always handled first and credit is low', () => {
  const items = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((id) => [id, rec(id)]));
  const decisions = ['a', 'b', 'c', 'd', 'e'].map((id) => dec(id, 'do_now', 0.3, { newest: true, openCount: 3 }));
  assert.equal(byKey(detectTendencies(decisions, items), 'recency').fired, true);
});

test('avoidance fires when heavy high-impact urgent items are repeatedly scheduled', () => {
  const items = { a: rec('a', { impact: 5, effort: 40 }), b: rec('b', { impact: 4, effort: 45 }) };
  const decisions = [dec('a', 'schedule', 0.1), dec('b', 'schedule', 0.1)];
  assert.equal(byKey(detectTendencies(decisions, items), 'avoidance').fired, true);
});

test('over-delegation fires on delegating non-delegable or critical work', () => {
  const items = { a: rec('a', { delegable: false, impact: 5 }), b: rec('b', { delegable: false, impact: 4 }), c: rec('c', { impact: 2 }) };
  const decisions = [dec('a', 'delegate', 0.2), dec('b', 'delegate', 0.2), dec('c', 'delegate', 1)];
  const t = byKey(detectTendencies(decisions, items), 'delegation');
  assert.equal(t.fired, true);
  assert.deepEqual(t.evidence.sort(), ['a', 'b']);
});

test('worstTendency picks the fired tendency with the lowest score, or null', () => {
  assert.equal(worstTendency([{ key: 'rank', fired: false, score: 20 }]), null);
  const list = [
    { key: 'rank', fired: true, score: 60 }, { key: 'quick', fired: true, score: 30 }, { key: 'recency', fired: false, score: 10 },
  ];
  assert.equal(worstTendency(list).key, 'quick');
});
