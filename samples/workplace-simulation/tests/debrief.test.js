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
