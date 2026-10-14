import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG, creditFor, profileOf, startDay, tick, act, wait, finishDay,
  openItems, doNowCost, focusLeft,
} from '../js/engine.js';

// Pin tunable values so tuning in calibration never breaks these unit tests.
CONFIG.K = 1;
CONFIG.EFFORT_SCALE = 1;

function item(over = {}) {
  return {
    id: 'a', sender: 's1', subject: 'S', body: 'B', arrivesAt: 0, deadlineIn: null,
    impact: 3, effort: 20, tags: [], delegable: true, delegateTo: 't1', ...over,
  };
}
const TEAM = [{ id: 't1', name: 'Avery' }, { id: 't2', name: 'Blake' }];
const day = (items, followUps = {}) => startDay({ items, followUps, teammates: TEAM });

test('profileOf classifies items', () => {
  assert.equal(profileOf({ impact: 5, deadline: 100 }), 'high-urgent');
  assert.equal(profileOf({ impact: 4, deadline: null }), 'high-calm');
  assert.equal(profileOf({ impact: 3, deadline: null }), 'mid');
  assert.equal(profileOf({ impact: 1, deadline: null }), 'low');
});

test('creditFor follows the default table', () => {
  const hu = { impact: 5, deadline: 100, delegable: true };
  assert.equal(creditFor(hu, 'do_now'), 1);
  assert.equal(creditFor(hu, 'decline'), 0);
  assert.equal(creditFor(hu, 'delegate', { teammateFree: true }), 0.7);
  assert.equal(creditFor(hu, 'delegate', { teammateFree: false }), 0.2);
  assert.equal(creditFor({ ...hu, delegable: false }, 'delegate', { teammateFree: true }), 0.2);
  const low = { impact: 1, deadline: null, delegable: false };
  assert.equal(creditFor(low, 'decline'), 1);
  const mid = { impact: 3, deadline: null, delegable: true };
  assert.equal(creditFor(mid, 'delegate', { teammateFree: true }), 1);
  assert.equal(creditFor(mid, 'delegate', { teammateFree: false }), 0.5);
  assert.equal(creditFor({ ...mid, delegable: false }, 'delegate', { teammateFree: true }), 0.5);
});

test('a per-item rubric overrides the table', () => {
  const rec = { impact: 2, deadline: null, delegable: false, rubric: { do_now: 1, delegate: 0.5, schedule: 0.4, decline: 0 } };
  assert.equal(creditFor(rec, 'schedule'), 0.4);
});

test('items arrive at their time', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 }), item({ id: 'b', arrivesAt: 30 })]);
  assert.deepEqual(openItems(s).map((r) => r.id), ['a']);
  tick(s, 30);
  assert.deepEqual(openItems(s).map((r) => r.id), ['a', 'b']);
});

test('do_now advances the clock by effort and drains focus', () => {
  const s = day([item({ effort: 40 })]);
  act(s, 'a', 'do_now');
  assert.equal(s.clock, 40);
  assert.equal(s.items.a.status, 'resolved');
  assert.ok(focusLeft(s) < 1);
});

test('fatigue multiplies do_now cost once focus is spent', () => {
  const s = day([item({ id: 'a', effort: 200 }), item({ id: 'b', effort: 200 }), item({ id: 'c', effort: 20 })]);
  act(s, 'a', 'do_now');
  assert.equal(s.clock, 200);
  act(s, 'b', 'do_now');
  assert.equal(s.clock, 400);
  assert.equal(doNowCost(s, s.items.c), Math.round(20 * CONFIG.FATIGUE_MULT));
  act(s, 'c', 'do_now');
  assert.equal(s.clock, 430);
});

test('delegate costs 5 minutes and overloads a busy teammate', () => {
  const s = day([item({ id: 'a', impact: 2 }), item({ id: 'b', impact: 2 }), item({ id: 'c', impact: 2 })]);
  const r1 = act(s, 'a', 'delegate');
  assert.equal(s.clock, 5);
  assert.equal(r1.credit, 1);
  assert.equal(act(s, 'b', 'delegate').credit, 1);
  assert.equal(act(s, 'c', 'delegate').credit, 0.5);
});

test('schedule and decline cost fixed minutes', () => {
  const s = day([item({ id: 'a', impact: 1 }), item({ id: 'b', impact: 1 })]);
  act(s, 'a', 'schedule');
  assert.equal(s.clock, 2);
  assert.equal(s.items.a.status, 'scheduled');
  act(s, 'b', 'decline');
  assert.equal(s.clock, 3);
});

test('best action on a high-impact urgent item raises the meter', () => {
  const s = day([item({ impact: 5, deadlineIn: 100 })]);
  const r = act(s, 'a', 'do_now');
  assert.equal(r.delta, 5);
  assert.equal(s.meter, CONFIG.START_METER + 5);
});

test('an item that expires costs points and escalates', () => {
  const fu = item({ id: 'f1', impact: 5, effort: 30, deadlineIn: 60, tags: ['follow-up'] });
  const s = day([item({ impact: 4, deadlineIn: 60, tags: ['escalates'], escalatesTo: 'f1' })], { f1: fu });
  tick(s, 60);
  assert.equal(s.items.a.status, 'expired');
  assert.equal(s.meter, CONFIG.START_METER - CONFIG.EXPIRY_PENALTY_PER_IMPACT * 4);
  assert.equal(s.items.f1.status, 'queued');
  assert.equal(s.decisions[0].action, 'none');
  tick(s, 60 + CONFIG.ESCALATION_DELAY);
  assert.equal(s.items.f1.status, 'open');
  assert.equal(s.meter, CONFIG.START_METER - CONFIG.EXPIRY_PENALTY_PER_IMPACT * 4 - CONFIG.ESCALATION_PENALTY);
});

test('declining an escalating item queues its follow-up', () => {
  const fu = item({ id: 'f1', impact: 4, deadlineIn: 60 });
  const s = day([item({ impact: 3, tags: ['escalates'], escalatesTo: 'f1' })], { f1: fu });
  act(s, 'a', 'decline');
  assert.equal(s.items.f1.status, 'queued');
  assert.equal(s.items.f1.isFollowUp, true);
});

test('acting twice on one item throws and does not double-count', () => {
  const s = day([item({ impact: 5, deadlineIn: 100 })]);
  act(s, 'a', 'do_now');
  const meter = s.meter;
  assert.throws(() => act(s, 'a', 'do_now'));
  assert.equal(s.meter, meter);
  assert.equal(s.decisions.length, 1);
});

test('unknown actions and unknown items throw', () => {
  const s = day([item()]);
  assert.throws(() => act(s, 'a', 'shout'));
  assert.throws(() => act(s, 'zzz', 'do_now'));
});

test('wait moves time forward and restores some focus', () => {
  const s = day([item({ effort: 40 })]);
  act(s, 'a', 'do_now');
  const used = s.focusUsed;
  wait(s);
  assert.equal(s.clock, 40 + CONFIG.WAIT_MINUTES);
  assert.equal(s.focusUsed, used - CONFIG.WAIT_MINUTES);
  const empty = day([]);
  wait(empty);
  assert.equal(empty.clock, CONFIG.WAIT_MINUTES);
});

test('finishDay penalizes unhandled items and is idempotent', () => {
  const s = day([item({ impact: 3 })]);
  const summary = finishDay(s);
  assert.equal(summary.meter, Math.round(CONFIG.START_METER - 3));
  assert.equal(s.decisions[0].action, 'none');
  assert.equal(finishDay(s).meter, summary.meter);
  assert.throws(() => act(s, 'a', 'do_now'));
});

test('the meter is clamped and the clock never passes 480', () => {
  const items = Array.from({ length: 12 }, (_, i) => item({ id: `u${i}`, impact: 5 }));
  const s = day(items);
  const summary = finishDay(s);
  assert.equal(summary.meter, 0);
  assert.equal(s.clock, CONFIG.DAY_MINUTES);
});

test('work that overruns 17:00 stops the clock at 480', () => {
  const s = day([item({ effort: 700 })]);
  act(s, 'a', 'do_now');
  assert.equal(s.clock, CONFIG.DAY_MINUTES);
});

test('an item arriving exactly at 480 is handled at the boundary', () => {
  const s = day([item({ id: 'late', arrivesAt: 480, impact: 2 })]);
  const summary = finishDay(s);
  assert.equal(s.clock, CONFIG.DAY_MINUTES);
  assert.ok(summary.meter >= 0 && summary.meter <= 100);
});

// ---- break pacing and crisis rules ----
import { waitUntilNext, crisisActive } from '../js/engine.js';

test('a break jumps to the next arrival instead of a fixed 15 minutes', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 }), item({ id: 'b', arrivesAt: 20 })]);
  act(s, 'a', 'decline');
  assert.equal(s.clock, 1);
  waitUntilNext(s);
  assert.equal(s.clock, 20);
  assert.deepEqual(openItems(s).map((r) => r.id), ['b']);
});

test('a break never lasts longer than the cap', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 }), item({ id: 'b', arrivesAt: 200 })]);
  act(s, 'a', 'decline');
  waitUntilNext(s);
  assert.equal(s.clock, 1 + CONFIG.BREAK_CAP);
  assert.equal(openItems(s).length, 0);
});

test('a break with nothing left to arrive carries on to the end of the day', () => {
  const s = day([item({ id: 'a', arrivesAt: 0, effort: 40 })]);
  act(s, 'a', 'do_now');
  waitUntilNext(s);
  assert.equal(s.clock, CONFIG.DAY_MINUTES);
});

test('a break refills focus in proportion to the rest', () => {
  const s = day([item({ id: 'a', arrivesAt: 0, effort: 40 }), item({ id: 'b', arrivesAt: 500 - 60 })]);
  act(s, 'a', 'do_now');
  const used = s.focusUsed;
  waitUntilNext(s);
  assert.equal(s.focusUsed, Math.max(0, used - CONFIG.BREAK_CAP));
});

test('a break always moves time forward by at least a minute', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 }), item({ id: 'b', arrivesAt: 1 })]);
  act(s, 'a', 'decline');
  const before = s.clock;
  waitUntilNext(s);
  assert.ok(s.clock > before || openItems(s).length > 0);
});

test('a break taken while a crisis message is open costs team impact', () => {
  const crisis = item({ id: 'c1', tags: ['crisis'], impact: 5, deadlineIn: 200 });
  const later = item({ id: 'later', arrivesAt: 300 });
  const s = startDay({ items: [crisis, later], followUps: {}, teammates: TEAM, crisis: { id: 'x', startsAt: 0 } });
  assert.equal(crisisActive(s), true);
  const before = s.meter;
  waitUntilNext(s);
  assert.equal(s.meter, before - CONFIG.CRISIS_BREAK_PENALTY);
});

test('a break outside a crisis costs nothing', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 })]);
  const before = s.meter;
  assert.equal(crisisActive(s), false);
  waitUntilNext(s);
  assert.equal(s.meter, before);
});

test('crisisActive is false before the crisis starts and after its messages are handled', () => {
  const crisis = item({ id: 'c1', arrivesAt: 100, tags: ['crisis'], impact: 5, deadlineIn: 200 });
  const s = startDay({ items: [crisis], followUps: {}, teammates: TEAM, crisis: { id: 'x', startsAt: 100 } });
  assert.equal(crisisActive(s), false);
  tick(s, 100);
  assert.equal(crisisActive(s), true);
  act(s, 'c1', 'do_now');
  assert.equal(crisisActive(s), false);
});
