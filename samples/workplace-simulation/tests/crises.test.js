import test from 'node:test';
import assert from 'node:assert/strict';
import { CRISES } from '../js/data/crises.js';
import { SENDERS, TEAMMATES, ITEMS, FOLLOW_UPS } from '../js/data/items.js';

const baseIds = new Set([...ITEMS.map((i) => i.id), ...Object.keys(FOLLOW_UPS)]);

test('there are three crises with distinct ids and a caption', () => {
  assert.equal(CRISES.length, 3);
  assert.equal(new Set(CRISES.map((c) => c.id)).size, 3);
  for (const c of CRISES) assert.ok(c.title && c.caption && c.caption.length > 20, c.id);
});

test('each crisis is a burst of four connected messages inside about ten minutes', () => {
  for (const c of CRISES) {
    assert.equal(c.items.length, 4, c.id);
    const offsets = c.items.map((i) => i.offset);
    assert.equal(Math.min(...offsets), 0, `${c.id} starts at offset 0`);
    assert.ok(Math.max(...offsets) <= 12, `${c.id} burst length`);
  }
});

test('every crisis message is well formed, tagged, urgent, and uniquely identified', () => {
  const seen = new Set();
  for (const c of CRISES) {
    for (const i of c.items) {
      assert.ok(!baseIds.has(i.id) && !seen.has(i.id), `${i.id} unique`);
      seen.add(i.id);
      assert.ok(SENDERS[i.sender], `${i.id} sender`);
      assert.ok(i.subject && i.body, `${i.id} text`);
      assert.ok(i.tags.includes('crisis'), `${i.id} tagged crisis`);
      assert.ok(i.impact >= 2 && i.impact <= 5, `${i.id} impact`);
      assert.ok(i.effort > 0, `${i.id} effort`);
      assert.ok(i.deadlineIn > 0 && i.deadlineIn <= 120, `${i.id} deadline is short`);
      assert.equal(i.arrivesAt, undefined, `${i.id} must not set arrivesAt`);
      if (i.delegable) assert.ok(TEAMMATES.some((t) => t.id === i.delegateTo), `${i.id} delegateTo`);
    }
  }
});

test('the three crises are matched in difficulty so attempts stay comparable', () => {
  const sums = CRISES.map((c) => c.items.reduce((s, i) => s + i.impact, 0));
  assert.deepEqual(sums, [15, 15, 15]);
  const top = CRISES.map((c) => Math.max(...c.items.map((i) => i.impact)));
  assert.deepEqual(top, [5, 5, 5]);
});
