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

// ---- delegate target and idle skip ----
import { delegateTarget, idleSkip } from '../js/engine.js';

test('delegateTarget uses the assigned teammate when the message has one', () => {
  const s = day([item({ id: 'a', delegateTo: 't2' })]);
  assert.equal(delegateTarget(s, s.items.a).id, 't2');
});

test('delegateTarget picks the least-loaded teammate when none is assigned, and act uses the same one', () => {
  const s = day([
    item({ id: 'a', delegateTo: 't1' }), item({ id: 'b', delegateTo: 't1' }),
    item({ id: 'c', delegable: false, delegateTo: undefined }),
  ]);
  act(s, 'a', 'delegate');
  act(s, 'b', 'delegate');
  assert.equal(s.teammates.t1.load, 2);
  const target = delegateTarget(s, s.items.c);
  assert.equal(target.id, 't2');
  const result = act(s, 'c', 'delegate');
  assert.equal(result.teammate, 't2');
  assert.equal(s.teammates.t2.load, 1);
  assert.equal(s.teammates.t1.load, 2);
});

test('idleSkip does nothing while the inbox has something in it', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 }), item({ id: 'b', arrivesAt: 50 })]);
  const before = s.clock;
  assert.equal(idleSkip(s), null);
  assert.equal(s.clock, before);
});

test('idleSkip jumps to the next message when the inbox is empty', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 }), item({ id: 'b', arrivesAt: 20 })]);
  act(s, 'a', 'decline');
  const r = idleSkip(s);
  assert.equal(s.clock, 20);
  assert.equal(r.minutes, 19);
  assert.deepEqual(openItems(s).map((x) => x.id), ['b']);
});

test('idleSkip never charges the crisis rest penalty and does nothing after the day ends', () => {
  const s = day([item({ id: 'a', arrivesAt: 0 }), item({ id: 'b', arrivesAt: 20 })]);
  act(s, 'a', 'decline');
  const meter = s.meter;
  idleSkip(s);
  assert.equal(s.meter, meter);
  finishDay(s);
  assert.equal(idleSkip(s), null);
});

// ---- holding reply ----
test('a holding reply costs 3 minutes, keeps the message open, and extends a deadline once', () => {
  const s = day([item({ id: 'a', impact: 4, deadlineIn: 60 })]);
  const result = act(s, 'a', 'reply');
  assert.equal(s.clock, CONFIG.HOLD_COST);
  assert.equal(s.items.a.status, 'open');
  assert.equal(s.items.a.deadline, 60 + CONFIG.HOLD_EXTENSION);
  assert.equal(result.extended, true);
  assert.equal(result.delta, 0);
  assert.equal(s.decisions.length, 0);
  const meter = s.meter;
  const again = act(s, 'a', 'reply');
  assert.equal(again.extended, false);
  assert.equal(s.items.a.deadline, 60 + CONFIG.HOLD_EXTENSION);
  assert.equal(s.meter, meter);
});

test('a holding reply saves a message that would otherwise expire', () => {
  const fu = item({ id: 'f1', impact: 4, deadlineIn: 60 });
  const s = day([item({ id: 'a', impact: 4, deadlineIn: 40, tags: ['escalates'], escalatesTo: 'f1' })], { f1: fu });
  act(s, 'a', 'reply');
  tick(s, 60);
  assert.equal(s.items.a.status, 'open');
  assert.equal(s.items.f1, undefined);
  tick(s, 40 + CONFIG.HOLD_EXTENSION);
  assert.equal(s.items.a.status, 'expired');
});

test('a holding reply on a message with nothing due buys nothing', () => {
  const s = day([item({ id: 'a', impact: 3, deadlineIn: null })]);
  const result = act(s, 'a', 'reply');
  assert.equal(result.extended, false);
  assert.equal(s.items.a.deadline, null);
  assert.equal(s.items.a.status, 'open');
  assert.match(result.text, /nothing was due/i);
});

test('a message can still be handled normally after a holding reply', () => {
  const s = day([item({ id: 'a', impact: 5, deadlineIn: 80 })]);
  act(s, 'a', 'reply');
  const r = act(s, 'a', 'do_now');
  assert.equal(r.action, 'do_now');
  assert.equal(s.items.a.status, 'resolved');
  assert.equal(s.decisions.length, 1);
});

test('the day summary counts escalations that actually arrived', () => {
  const fu = item({ id: 'f1', impact: 4, deadlineIn: 60 });
  const s = day([item({ id: 'a', impact: 3, tags: ['escalates'], escalatesTo: 'f1' })], { f1: fu });
  act(s, 'a', 'decline');
  tick(s, 200);
  const summary = finishDay(s);
  assert.equal(summary.escalations, 1);
  const clean = finishDay(day([item({ id: 'z' })]));
  assert.equal(clean.escalations, 0);
});

// ---- specific responses (choices) ----
function choiceItem(over = {}) {
  return item({
    id: 'k', impact: 4, deadlineIn: 120, delegable: true, delegateTo: 't1', effort: 20,
    why: 'Because it matters.',
    choices: [
      { id: 'a', kind: 'do_now', credit: 1, label: 'Do the strong thing.', text: 'It worked.' },
      { id: 'b', kind: 'delegate', credit: 0.6, label: 'Hand it off.', text: 'It mostly worked.' },
      { id: 'c', kind: 'schedule', credit: 0.3, trap: 'avoidance', label: 'Put it off.', text: 'It slipped.' },
      { id: 'd', kind: 'decline', credit: 0, label: 'Ignore it.', text: 'It got worse.' },
    ],
    ...over,
  });
}

test('choosing a response applies its credit, text, and the cost of its kind', () => {
  const s = day([choiceItem()]);
  const r = act(s, 'k', 'a');
  assert.equal(r.credit, 1);
  assert.equal(r.text, 'It worked.');
  assert.equal(r.action, 'do_now');
  assert.equal(r.delta, (1 - 0.5) * 2 * 4 * CONFIG.K);
  assert.equal(s.clock, 20);
  assert.equal(s.items.k.status, 'resolved');
});

test('the decision records which response was chosen, its label and text', () => {
  const s = day([choiceItem()]);
  act(s, 'k', 'c');
  const d = s.decisions[0];
  assert.equal(d.choiceId, 'c');
  assert.equal(d.choiceLabel, 'Put it off.');
  assert.equal(d.text, 'It slipped.');
  assert.equal(d.action, 'schedule');
  assert.equal(s.items.k.status, 'scheduled');
});

test('a delegating response uses teammate load, and an overloaded teammate halves its credit', () => {
  const s = day([choiceItem({ id: 'k1' }), choiceItem({ id: 'k2' }), choiceItem({ id: 'k3' })]);
  assert.equal(act(s, 'k1', 'b').credit, 0.6);
  assert.equal(act(s, 'k2', 'b').credit, 0.6);
  assert.equal(act(s, 'k3', 'b').credit, 0.3);
  assert.equal(s.teammates.t1.load, 3);
});

test('a response that declines an escalating message queues the follow-up', () => {
  const fu = item({ id: 'f1', impact: 4, deadlineIn: 60 });
  const s = day([choiceItem({ tags: ['escalates'], escalatesTo: 'f1' })], { f1: fu });
  act(s, 'k', 'd');
  assert.equal(s.items.f1.status, 'queued');
});

test('an unanswered message with responses still expires and escalates', () => {
  const fu = item({ id: 'f1', impact: 4, deadlineIn: 60 });
  const s = day([choiceItem({ deadlineIn: 30, tags: ['escalates'], escalatesTo: 'f1' })], { f1: fu });
  tick(s, 30);
  assert.equal(s.items.k.status, 'expired');
  assert.equal(s.decisions[0].action, 'none');
  assert.equal(s.items.f1.status, 'queued');
});

test('a message with responses rejects generic actions, the holding reply, and unknown response ids', () => {
  const s = day([choiceItem()]);
  assert.throws(() => act(s, 'k', 'do_now'));
  assert.throws(() => act(s, 'k', 'reply'));
  assert.throws(() => act(s, 'k', 'z'));
  assert.equal(s.decisions.length, 0);
  assert.equal(s.clock, 0);
});

test('a plain message still takes generic actions, and rejects response ids', () => {
  const s = day([item({ id: 'p' })]);
  assert.throws(() => act(s, 'p', 'a'));
  assert.equal(act(s, 'p', 'decline').action, 'decline');
});

test('a response can override the effort of a do_now', () => {
  const s = day([choiceItem({ effort: 20, choices: [
    { id: 'a', kind: 'do_now', credit: 1, effort: 50, label: 'Take the long way.', text: 'It took a while.' },
    { id: 'b', kind: 'decline', credit: 0, label: 'Skip it.', text: 'Skipped.' },
  ] })]);
  act(s, 'k', 'a');
  assert.equal(s.clock, 50);
});

test('a response that hands the task to someone outside the team does not load a teammate', () => {
  const s = day([choiceItem({ choices: [
    { id: 'a', kind: 'delegate', external: true, credit: 0.6, label: 'Ask the client contact to sort it out.', text: 'They sorted it.' },
    { id: 'b', kind: 'do_now', credit: 1, label: 'Do it yourself.', text: 'Done.' },
  ] })]);
  const r = act(s, 'k', 'a');
  assert.equal(r.credit, 0.6);
  assert.equal(r.teammate, null);
  assert.equal(s.teammates.t1.load, 0);
  assert.equal(s.teammates.t2.load, 0);
});
