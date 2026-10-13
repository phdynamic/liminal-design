import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDay } from '../js/engine.js';
import { POOL } from '../js/data/items.js';
import { play, reasoned, reactive } from './helpers.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const run = (strategy) => SEEDS.map((seed) => play(generateDay(POOL, { seed }), strategy).meter);

test('a reasoned playthrough averages 78 to 92', () => {
  const scores = run(reasoned);
  assert.ok(avg(scores) >= 78 && avg(scores) <= 92, `average ${avg(scores).toFixed(1)} from ${scores.join(', ')}`);
  assert.ok(Math.min(...scores) >= 65, `lowest ${Math.min(...scores)}`);
});

test('a reactive, rank-driven playthrough averages 22 to 42', () => {
  const scores = run(reactive);
  assert.ok(avg(scores) >= 22 && avg(scores) <= 42, `average ${avg(scores).toFixed(1)} from ${scores.join(', ')}`);
  assert.ok(Math.max(...scores) <= 55, `highest ${Math.max(...scores)}`);
});

test('reasoned beats reactive on every seed by a clear margin', () => {
  const good = run(reasoned), poor = run(reactive);
  good.forEach((g, i) => assert.ok(g - poor[i] >= 25, `seed ${SEEDS[i]}: ${g} vs ${poor[i]}`));
});
