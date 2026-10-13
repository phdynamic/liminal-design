import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDay, mulberry32, DAY_SIZE, FOCUS_TAG_FOR } from '../js/engine.js';
import { POOL } from '../js/data/items.js';

const count = (day, tag) => day.items.filter((i) => i.tags.includes(tag)).length;

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(5), b = mulberry32(5);
  for (let i = 0; i < 20; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('the same seed gives the same day', () => {
  const a = generateDay(POOL, { seed: 7 });
  const b = generateDay(POOL, { seed: 7 });
  assert.deepEqual(a.items.map((i) => [i.id, i.arrivesAt]), b.items.map((i) => [i.id, i.arrivesAt]));
});

test('every generated day satisfies the constraints', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const day = generateDay(POOL, { seed });
    assert.equal(day.items.length, DAY_SIZE);
    assert.equal(new Set(day.items.map((i) => i.id)).size, DAY_SIZE);
    assert.ok(count(day, 'hidden-critical') >= 3, `seed ${seed} hidden-critical`);
    assert.ok(count(day, 'escalates') >= 2, `seed ${seed} escalates`);
    assert.ok(count(day, 'rank-pressure') >= 2, `seed ${seed} rank-pressure`);
    assert.ok(day.items.every((i) => i.arrivesAt >= 0 && i.arrivesAt < 420), `seed ${seed} arrivals`);
    assert.equal(day.items.filter((i) => i.arrivesAt === 0).length >= 2, true);
  }
});

test('follow-ups match the escalating items chosen', () => {
  const day = generateDay(POOL, { seed: 3 });
  const wanted = day.items.map((i) => i.escalatesTo).filter(Boolean).sort();
  assert.deepEqual(Object.keys(day.followUps).sort(), wanted);
});

test('with no focus tag the generator still returns a valid day', () => {
  const day = generateDay(POOL, { seed: 11, focusTag: null });
  assert.equal(day.items.length, DAY_SIZE);
});

test('a focus tag raises how often that tag appears', () => {
  let plain = 0, focused = 0;
  for (let seed = 1; seed <= 100; seed++) {
    plain += count(generateDay(POOL, { seed }), 'quick-win');
    focused += count(generateDay(POOL, { seed, focusTag: FOCUS_TAG_FOR.quick }), 'quick-win');
  }
  assert.ok(focused > plain, `focused ${focused} should exceed plain ${plain}`);
});

test('a reference impact keeps replays within 10 percent for most seeds', () => {
  const reference = generateDay(POOL, { seed: 1 }).impactSum;
  let inBand = 0;
  for (let seed = 2; seed <= 41; seed++) {
    const sum = generateDay(POOL, { seed, focusTag: 'rank-pressure', referenceImpact: reference }).impactSum;
    if (sum >= reference * 0.9 && sum <= reference * 1.1) inBand++;
  }
  assert.ok(inBand >= 36, `only ${inBand}/40 in band`);
});
