import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, FOLLOW_UPS, SENDERS, TEAMMATES, POOL } from '../js/data/items.js';

const all = [...ITEMS, ...Object.values(FOLLOW_UPS)];
const has = (tag) => ITEMS.filter((i) => i.tags.includes(tag));

test('pool has 30 base items and 5 follow-ups with unique ids', () => {
  assert.equal(ITEMS.length, 30);
  assert.equal(Object.keys(FOLLOW_UPS).length, 5);
  assert.equal(new Set(all.map((i) => i.id)).size, all.length);
  assert.equal(POOL.items, ITEMS);
});

test('every item is well formed', () => {
  for (const i of all) {
    assert.ok(SENDERS[i.sender], `${i.id} sender`);
    assert.ok(i.subject && i.body, `${i.id} text`);
    assert.ok(i.impact >= 1 && i.impact <= 5, `${i.id} impact`);
    assert.ok(i.effort > 0, `${i.id} effort`);
    assert.ok(Array.isArray(i.tags), `${i.id} tags`);
    assert.ok(i.deadlineIn === null || i.deadlineIn > 0, `${i.id} deadlineIn`);
    assert.equal(i.arrivesAt, undefined, `${i.id} must not set arrivesAt`);
    if (i.delegable) assert.ok(TEAMMATES.some((t) => t.id === i.delegateTo), `${i.id} delegateTo`);
  }
});

test('every escalation target exists', () => {
  for (const i of ITEMS.filter((x) => x.escalatesTo)) {
    assert.ok(FOLLOW_UPS[i.escalatesTo], `${i.id} -> ${i.escalatesTo}`);
  }
});

test('tag minimums leave room for day-generation constraints', () => {
  assert.ok(has('hidden-critical').length >= 4);
  assert.ok(has('rank-pressure').length >= 4);
  assert.ok(has('escalates').length >= 4);
  assert.ok(has('quick-win').length >= 4);
});

test('hidden-critical items come from junior senders', () => {
  for (const i of has('hidden-critical')) assert.ok(SENDERS[i.sender].rank <= 2, i.id);
});
