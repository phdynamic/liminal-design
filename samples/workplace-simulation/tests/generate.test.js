import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDay, mulberry32, DAY_SIZE, FOCUS_TAG_FOR } from '../js/engine.js';
import { POOL } from '../js/data/items.js';
import { CRISES } from '../js/data/crises.js';

const isBase = (i) => !i.tags.includes('crisis');
const baseOf = (day) => day.items.filter(isBase);

const count = (day, tag) => baseOf(day).filter((i) => i.tags.includes(tag)).length;

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
    assert.equal(baseOf(day).length, DAY_SIZE);
    assert.equal(new Set(day.items.map((i) => i.id)).size, day.items.length);
    assert.ok(count(day, 'hidden-critical') >= 3, `seed ${seed} hidden-critical`);
    assert.ok(count(day, 'escalates') >= 2, `seed ${seed} escalates`);
    assert.ok(count(day, 'rank-pressure') >= 2, `seed ${seed} rank-pressure`);
    assert.ok(day.items.every((i) => i.arrivesAt >= 0 && i.arrivesAt < 420), `seed ${seed} arrivals`);
    assert.equal(baseOf(day).filter((i) => i.arrivesAt === 0).length >= 2, true);
  }
});

test('follow-ups match the escalating items chosen', () => {
  const day = generateDay(POOL, { seed: 3 });
  const wanted = baseOf(day).map((i) => i.escalatesTo).filter(Boolean).sort();
  assert.deepEqual(Object.keys(day.followUps).sort(), wanted);
});

test('with no focus tag the generator still returns a valid day', () => {
  const day = generateDay(POOL, { seed: 11, focusTag: null });
  assert.equal(baseOf(day).length, DAY_SIZE);
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

test('every day contains exactly one crisis: four tagged messages arriving in a burst', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const day = generateDay(POOL, { seed });
    const crisisItems = day.items.filter((i) => i.tags.includes('crisis'));
    assert.equal(crisisItems.length, 4, `seed ${seed}`);
    assert.ok(day.crisis && day.crisis.id && day.crisis.caption, `seed ${seed} crisis summary`);
    const arrivals = crisisItems.map((i) => i.arrivesAt);
    assert.equal(Math.min(...arrivals), day.crisis.startsAt);
    assert.ok(Math.max(...arrivals) - day.crisis.startsAt <= 12);
  }
});

test('the crisis starts in the late-morning to mid-afternoon window', () => {
  for (let seed = 1; seed <= 80; seed++) {
    const { crisis } = generateDay(POOL, { seed });
    assert.ok(crisis.startsAt >= 150 && crisis.startsAt <= 330, `seed ${seed}: ${crisis.startsAt}`);
  }
});

test('crisis type and time vary across seeds and cover every crisis', () => {
  const ids = new Set(), times = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const { crisis } = generateDay(POOL, { seed });
    ids.add(crisis.id);
    times.add(crisis.startsAt);
  }
  assert.equal(ids.size, CRISES.length);
  assert.ok(times.size >= 20);
});

test('a separate crisisSeed changes the crisis without changing the rest of the day', () => {
  const a = generateDay(POOL, { seed: 5, crisisSeed: 1 });
  const b = generateDay(POOL, { seed: 5, crisisSeed: 2 });
  assert.deepEqual(baseOf(a).map((i) => [i.id, i.arrivesAt]), baseOf(b).map((i) => [i.id, i.arrivesAt]));
  const sig = (d) => `${d.crisis.id}@${d.crisis.startsAt}`;
  const seen = new Set();
  for (let cs = 1; cs <= 12; cs++) seen.add(sig(generateDay(POOL, { seed: 5, crisisSeed: cs })));
  assert.ok(seen.size > 3);
});

test('the crisis can be switched off', () => {
  const day = generateDay(POOL, { seed: 5, withCrisis: false });
  assert.equal(day.crisis, null);
  assert.equal(day.items.length, DAY_SIZE);
});

test('base arrivals are spaced so the inbox is rarely empty', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const arrivals = baseOf(generateDay(POOL, { seed })).map((i) => i.arrivesAt).sort((a, b) => a - b);
    for (let i = 1; i < arrivals.length; i++) assert.ok(arrivals[i] - arrivals[i - 1] <= 30, `seed ${seed} gap`);
  }
});

test('a day has sixteen base messages', () => {
  assert.equal(DAY_SIZE, 16);
});

test('responses are shuffled per day, deterministically, and each message strongest response moves around', () => {
  const choiceItems = (day) => baseOf(day).filter((i) => i.choices);
  const a = generateDay(POOL, { seed: 9 }), b = generateDay(POOL, { seed: 9 });
  assert.deepEqual(choiceItems(a).map((i) => i.choices.map((c) => c.id)), choiceItems(b).map((i) => i.choices.map((c) => c.id)));
  const seen = new Map();
  for (let seed = 1; seed <= 80; seed++) {
    for (const i of choiceItems(generateDay(POOL, { seed }))) {
      if (!seen.has(i.id)) seen.set(i.id, { positions: new Set(), count: 0 });
      const rec = seen.get(i.id);
      rec.positions.add(i.choices.findIndex((c) => c.credit === 1));
      rec.count++;
    }
  }
  for (const [id, rec] of seen) {
    if (rec.count >= 25) assert.ok(rec.positions.size >= 3, `${id}: only ${[...rec.positions]} over ${rec.count} days`);
  }
});

test('shuffling responses does not change which messages, or when, a day contains', () => {
  const ids = (day) => baseOf(day).map((i) => [i.id, i.arrivesAt]);
  const day = generateDay(POOL, { seed: 12 });
  for (const i of baseOf(day).filter((x) => x.choices)) assert.deepEqual(i.choices.map((c) => c.id).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(ids(day).length, DAY_SIZE);
});
