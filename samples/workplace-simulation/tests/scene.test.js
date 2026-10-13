import test from 'node:test';
import assert from 'node:assert/strict';
import { skyAt } from '../js/scene.js';
import { avatar } from '../js/avatar.js';
import { SENDERS } from '../js/data/items.js';
import { formatClock } from '../js/ui.js';

test('skyAt returns rgb strings and clamps outside the day', () => {
  const morning = skyAt(0), dusk = skyAt(480);
  assert.match(morning.top, /^rgb\(\d+, \d+, \d+\)$/);
  assert.deepEqual(skyAt(-50), morning);
  assert.deepEqual(skyAt(900), dusk);
  assert.notEqual(morning.top, dusk.top);
});

test('skyAt changes continuously through the day', () => {
  const seen = new Set();
  for (let m = 0; m <= 480; m += 40) seen.add(skyAt(m).top);
  assert.ok(seen.size >= 8);
});

test('avatars render for every sender and mood', () => {
  for (const sender of Object.values(SENDERS)) {
    for (const mood of ['neutral', 'relieved', 'tense']) {
      const svg = avatar(sender, mood);
      assert.ok(svg.startsWith('<svg') && svg.includes('aria-hidden="true"'));
      assert.ok(svg.includes(sender.skin));
    }
  }
});

test('formatClock shows the simulated time of day', () => {
  assert.equal(formatClock(0), '9:00 am');
  assert.equal(formatClock(180), '12:00 pm');
  assert.equal(formatClock(195), '12:15 pm');
  assert.equal(formatClock(480), '5:00 pm');
  assert.equal(formatClock(75), '10:15 am');
});
