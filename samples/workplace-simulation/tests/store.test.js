import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), raw: m };
};
const attempt = (meter) => ({ ts: meter, meter, tendencies: { rank: 90 }, decisions: [] });

test('saves and reads attempts in order', () => {
  const store = createStore(memory());
  assert.deepEqual(store.attempts(), []);
  assert.equal(store.save(attempt(40)), true);
  store.save(attempt(55));
  assert.deepEqual(store.attempts().map((a) => a.meter), [40, 55]);
});

test('keeps only the latest 20 attempts', () => {
  const store = createStore(memory());
  for (let i = 1; i <= 25; i++) store.save(attempt(i));
  const list = store.attempts();
  assert.equal(list.length, 20);
  assert.equal(list[0].meter, 6);
  assert.equal(list[19].meter, 25);
});

test('clear removes the history', () => {
  const store = createStore(memory());
  store.save(attempt(10));
  assert.equal(store.clear(), true);
  assert.deepEqual(store.attempts(), []);
});

test('corrupted JSON reads as empty and play can continue', () => {
  const storage = memory();
  storage.setItem('liminal-sim-v1', '{not json');
  const store = createStore(storage);
  assert.deepEqual(store.attempts(), []);
  assert.equal(store.save(attempt(30)), true);
  assert.equal(store.attempts().length, 1);
});

test('the wrong shape reads as empty and invalid entries are dropped', () => {
  const storage = memory();
  storage.setItem('liminal-sim-v1', JSON.stringify({ attempts: 'nope' }));
  assert.deepEqual(createStore(storage).attempts(), []);
  storage.setItem('liminal-sim-v1', JSON.stringify({ attempts: [attempt(10), { meter: 'x' }, null] }));
  assert.equal(createStore(storage).attempts().length, 1);
});

test('storage that throws never throws out of the store', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const store = createStore(broken);
  assert.equal(store.available(), false);
  assert.deepEqual(store.attempts(), []);
  assert.equal(store.save(attempt(1)), false);
  assert.equal(store.clear(), false);
});

test('missing storage is handled', () => {
  const store = createStore(undefined);
  assert.equal(store.available(), false);
  assert.deepEqual(store.attempts(), []);
  assert.equal(store.save(attempt(1)), false);
});

test('updateLast merges fields into the latest attempt and leaves the others alone', () => {
  const store = createStore(memory());
  store.save(attempt(40));
  store.save(attempt(55));
  assert.equal(store.updateLast({ commitment: { habit: 'rank', text: 'Ask first.' } }), true);
  const list = store.attempts();
  assert.deepEqual(list[1].commitment, { habit: 'rank', text: 'Ask first.' });
  assert.equal(list[0].commitment, undefined);
  assert.equal(list[1].meter, 55);
});

test('updateLast does nothing without attempts and survives broken storage', () => {
  assert.equal(createStore(memory()).updateLast({ x: 1 }), false);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  assert.equal(createStore(broken).updateLast({ x: 1 }), false);
});
