import test from 'node:test';
import assert from 'node:assert/strict';
import { CHOICES } from '../js/data/choices.js';
import { ITEMS, SENDERS } from '../js/data/items.js';
import { ACTIONS } from '../js/engine.js';

const KEY_IDS = ['i01', 'i02', 'i03', 'i08', 'i09', 'i13', 'i17', 'i20', 'i21', 'i22', 'i24', 'i27'];
const TRAPS = ['rank', 'quick', 'recency', 'avoidance', 'delegation'];

test('exactly the twelve tagged messages have specific responses, and they are the tagged ones', () => {
  assert.deepEqual(Object.keys(CHOICES).sort(), [...KEY_IDS].sort());
  for (const id of KEY_IDS) {
    const item = ITEMS.find((i) => i.id === id);
    assert.ok(item.choices && item.choices.length === 4, `${id} choices merged into the item`);
    assert.ok(item.why && item.why.length > 30, `${id} why`);
    assert.ok(['hidden-critical', 'escalates', 'rank-pressure'].some((t) => item.tags.includes(t)), `${id} is a tagged message`);
  }
});

test('every message has four distinct, well-formed responses with one clearly strongest', () => {
  for (const id of KEY_IDS) {
    const { choices } = CHOICES[id];
    assert.deepEqual(choices.map((c) => c.id), ['a', 'b', 'c', 'd'], id);
    assert.equal(new Set(choices.map((c) => c.label)).size, 4, `${id} labels distinct`);
    for (const c of choices) {
      assert.ok(c.label.length > 15 && c.text.length > 20, `${id}${c.id} text`);
      assert.ok(ACTIONS.includes(c.kind), `${id}${c.id} kind ${c.kind}`);
      assert.ok(c.credit >= 0 && c.credit <= 1, `${id}${c.id} credit`);
    }
    const best = choices.filter((c) => c.credit === 1);
    assert.equal(best.length, 1, `${id} has exactly one strongest response`);
    assert.ok(choices.every((c) => c === best[0] || c.credit <= 0.8), `${id} no close rival to the strongest`);
  }
});

test('every message has a valid alternative, a tempting mistake tied to a habit, and a weak response', () => {
  for (const id of KEY_IDS) {
    const { choices } = CHOICES[id];
    assert.ok(choices.some((c) => c.credit >= 0.5 && c.credit <= 0.8), `${id} valid alternative`);
    const traps = choices.filter((c) => c.trap);
    assert.ok(traps.length >= 1, `${id} has a trap`);
    for (const t of traps) {
      assert.ok(TRAPS.includes(t.trap), `${id}${t.id} trap name`);
      assert.ok(t.credit <= 0.4, `${id}${t.id} traps score low`);
    }
    assert.ok(choices.some((c) => c.credit <= 0.2), `${id} weak response`);
  }
});

test('the responses sit in varied positions so the strongest one is not always first', () => {
  const positions = new Set(KEY_IDS.map((id) => CHOICES[id].choices.findIndex((c) => c.credit === 1)));
  assert.ok(positions.size >= 3, `strongest response positions: ${[...positions]}`);
});

test('responses that decline or ignore an escalating message are the ones that escalate it', () => {
  for (const id of KEY_IDS) {
    const item = ITEMS.find((i) => i.id === id);
    if (!item.escalatesTo) continue;
    assert.ok(CHOICES[id].choices.some((c) => c.kind === 'decline' || c.kind === 'schedule'), `${id} has a way to let it escalate`);
  }
});

test('no sender data is needed to read a response', () => {
  assert.ok(SENDERS.dana);
});
