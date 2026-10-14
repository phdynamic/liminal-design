import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, BEATS, beatsBetween, epilogueFor } from '../js/data/story.js';
import { crisisReview } from '../js/debrief.js';
import { TENDENCY_KEYS } from '../js/engine.js';

test('the opening story has several paragraphs and names the key people', () => {
  assert.ok(INTRO.length >= 3);
  const text = INTRO.join(' ');
  for (const name of ['Dana', 'Brightline', 'Avery', 'Blake', 'Casey']) assert.ok(text.includes(name), name);
});

test('beats are in time order, inside the working day, with text', () => {
  const times = BEATS.map((b) => b.at);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(BEATS.length >= 5);
  for (const b of BEATS) assert.ok(b.at > 0 && b.at < 480 && b.text.length > 20, `${b.at}`);
});

test('beatsBetween returns each beat exactly once as time moves forward', () => {
  const seen = [];
  let clock = 0;
  for (const step of [10, 55, 20, 130, 5, 300]) {
    const next = Math.min(480, clock + step);
    seen.push(...beatsBetween(clock, next).map((b) => b.at));
    clock = next;
  }
  assert.deepEqual(seen, BEATS.map((b) => b.at));
});

test('beatsBetween excludes the start and includes the end of the interval', () => {
  const first = BEATS[0].at;
  assert.equal(beatsBetween(first, first + 1).length, 0);
  assert.equal(beatsBetween(first - 1, first)[0].at, first);
  assert.deepEqual(beatsBetween(5, 5), []);
});

test('the epilogue has three tiers with clear boundaries', () => {
  const high = epilogueFor(70).text, mid = epilogueFor(69).text, midLow = epilogueFor(40).text, low = epilogueFor(39).text;
  assert.notEqual(high, mid);
  assert.equal(mid, midLow);
  assert.notEqual(midLow, low);
  for (const t of [high, mid, low]) assert.ok(t.includes('Dana'));
});

test('the epilogue adds a note for a detected habit and none otherwise', () => {
  assert.equal(epilogueFor(80, null).note, '');
  assert.equal(epilogueFor(80, 'not-a-key').note, '');
  const notes = new Set(TENDENCY_KEYS.map((k) => epilogueFor(80, k).note));
  assert.equal(notes.size, TENDENCY_KEYS.length);
  assert.ok([...notes].every((n) => n.length > 10));
});

const rec = (id, tags) => ({ id, tags, def: { subject: id } });
const dec = (id, action, credit, delta) => ({ id, action, credit, delta, minute: 0 });

test('crisisReview is null when there was no crisis', () => {
  const summary = { items: { a: rec('a', []) }, decisions: [dec('a', 'do_now', 1, 2)] };
  assert.equal(crisisReview(summary, null), null);
});

test('crisisReview scores the crisis messages only, counting unhandled as zero', () => {
  const summary = {
    items: { a: rec('a', []), c1: rec('c1', ['crisis']), c2: rec('c2', ['crisis']), c3: rec('c3', ['crisis']), c4: rec('c4', ['crisis']) },
    decisions: [dec('a', 'decline', 0, -3), dec('c1', 'do_now', 1, 5), dec('c2', 'do_now', 0.8, 4), dec('c3', 'none', 0, -4), dec('c4', 'delegate', 0.6, 1)],
  };
  const r = crisisReview(summary, { id: 'outage', title: 'The warehouse system goes down' });
  assert.equal(r.score, Math.round(100 * (1 + 0.8 + 0 + 0.6) / 4));
  assert.equal(r.handled, 3);
  assert.equal(r.missed, 1);
  assert.equal(r.delta, 5 + 4 - 4 + 1);
  assert.ok(r.text.length > 20 && r.title.includes('warehouse'));
});

test('crisisReview wording changes with the score', () => {
  const mk = (credit) => ({ items: { c1: rec('c1', ['crisis']) }, decisions: [dec('c1', 'do_now', credit, 0)] });
  const c = { id: 'x', title: 'T' };
  const texts = new Set([1, 0.5, 0].map((cr) => crisisReview(mk(cr), c).text));
  assert.equal(texts.size, 3);
});
