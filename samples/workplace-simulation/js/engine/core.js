export const ACTIONS = ['do_now', 'delegate', 'schedule', 'decline'];

export const CONFIG = {
  DAY_MINUTES: 480,
  START_METER: 50,
  K: 1,
  EFFORT_SCALE: 1.5,
  FOCUS_CAPACITY: 300,
  FATIGUE_MULT: 1.5,
  COST: { delegate: 5, schedule: 2, decline: 1 },
  WAIT_MINUTES: 15,
  BREAK_CAP: 30,
  HOLD_COST: 3,
  HOLD_EXTENSION: 30,
  CRISIS_BREAK_PENALTY: 2,
  TEAMMATE_LOAD_LIMIT: 2,
  EXPIRY_PENALTY_PER_IMPACT: 1.5,
  ESCALATION_PENALTY: 3,
  ESCALATION_DELAY: 45,
};

const CREDIT = {
  'high-urgent': { do_now: 1.0, delegate: 0.7, schedule: 0.1, decline: 0.0 },
  'high-calm': { do_now: 0.8, delegate: 0.6, schedule: 0.9, decline: 0.0 },
  mid: { do_now: 0.6, delegate: 1.0, schedule: 0.7, decline: 0.3 },
  low: { do_now: 0.3, delegate: 0.5, schedule: 0.5, decline: 1.0 },
};

export function profileOf(rec) {
  const urgentToday = rec.deadline !== null && rec.deadline <= CONFIG.DAY_MINUTES;
  if (rec.impact >= 4) return urgentToday ? 'high-urgent' : 'high-calm';
  if (rec.impact >= 2) return 'mid';
  return 'low';
}

export function creditFor(rec, action, ctx = {}) {
  const profile = profileOf(rec);
  const table = rec.rubric ?? CREDIT[profile];
  let credit = table[action];
  if (action === 'delegate' && !rec.rubric) {
    const free = ctx.teammateFree !== false;
    if (profile === 'high-urgent') credit = rec.delegable && free ? 0.7 : 0.2;
    else if (profile === 'mid') credit = rec.delegable && free ? 1.0 : 0.5;
    else if (!rec.delegable || !free) credit *= 0.5;
  }
  return credit;
}

export function decisionDelta(rec, credit) {
  return (credit - 0.5) * 2 * rec.impact * CONFIG.K;
}

export function moodFor(credit) {
  if (credit >= 0.7) return 'relieved';
  if (credit >= 0.4) return 'neutral';
  return 'tense';
}

export function outcomeText(rec, action, credit) {
  const custom = rec.def?.outcomes?.[action];
  if (custom) return custom;
  if (credit >= 0.7) return 'That landed well.';
  if (credit >= 0.4) return 'That helped a little.';
  return "That didn't go the way you hoped.";
}

function makeRecord(def, arrivesAt) {
  return {
    def, id: def.id, impact: def.impact, effort: def.effort, tags: def.tags ?? [],
    delegable: !!def.delegable, rubric: def.rubric ?? null, arrivesAt,
    deadline: def.deadlineIn == null ? null : arrivesAt + def.deadlineIn,
    status: 'queued', arrivedAt: null, action: null, credit: null, isFollowUp: false,
  };
}

export function startDay(dayDef) {
  const items = {};
  for (const def of dayDef.items) items[def.id] = makeRecord(def, def.arrivesAt);
  const state = {
    clock: 0, meter: CONFIG.START_METER, focusUsed: 0, ended: false,
    items, followUps: dayDef.followUps ?? {},
    teammates: Object.fromEntries(dayDef.teammates.map((t) => [t.id, { ...t, load: 0 }])),
    decisions: [], events: [], crisis: dayDef.crisis ?? null,
  };
  tick(state, 0);
  return state;
}

function pushEvent(state, type, id, extra = {}) {
  state.events.push({ type, id, minute: state.clock, ...extra });
}

function adjustMeter(state, delta) {
  state.meter = Math.max(0, Math.min(100, state.meter + delta));
}

function nextEvent(state, target) {
  let best = null;
  for (const rec of Object.values(state.items)) {
    let cand = null;
    if (rec.status === 'queued' && rec.arrivesAt <= target) {
      cand = { type: 'arrival', time: rec.arrivesAt, rec };
    } else if ((rec.status === 'open' || rec.status === 'scheduled') && rec.deadline !== null && rec.deadline <= target) {
      cand = { type: 'expiry', time: Math.max(rec.deadline, state.clock), rec };
    }
    if (!cand) continue;
    if (!best || cand.time < best.time || (cand.time === best.time && cand.type === 'arrival' && best.type === 'expiry')) best = cand;
  }
  return best;
}

function escalate(state, rec) {
  const id = rec.def.escalatesTo;
  if (!id || !state.followUps[id] || state.items[id]) return;
  const arrivesAt = state.clock + (rec.def.escalationDelay ?? CONFIG.ESCALATION_DELAY);
  if (arrivesAt >= CONFIG.DAY_MINUTES) return;
  const fu = makeRecord(state.followUps[id], arrivesAt);
  fu.isFollowUp = true;
  state.items[id] = fu;
  pushEvent(state, 'escalation-scheduled', id, { from: rec.id });
}

function expire(state, rec) {
  const delta = -CONFIG.EXPIRY_PENALTY_PER_IMPACT * rec.impact;
  const neverActed = rec.action === null;
  rec.status = 'expired';
  if (neverActed) {
    rec.action = 'none';
    rec.credit = 0;
    state.decisions.push({ id: rec.id, action: 'none', minute: state.clock, credit: 0, delta, mood: 'tense', newest: false, openCount: 0, teammate: null });
  }
  adjustMeter(state, delta);
  pushEvent(state, 'expired', rec.id, { delta });
  escalate(state, rec);
}

function applyEvent(state, ev) {
  const { rec } = ev;
  state.clock = Math.max(state.clock, ev.time);
  if (ev.type === 'arrival') {
    rec.status = 'open';
    rec.arrivedAt = ev.time;
    pushEvent(state, 'arrival', rec.id);
    if (rec.isFollowUp) {
      adjustMeter(state, -CONFIG.ESCALATION_PENALTY);
      pushEvent(state, 'escalated', rec.id, { delta: -CONFIG.ESCALATION_PENALTY });
    }
  } else {
    expire(state, rec);
  }
}

export function tick(state, to) {
  const target = Math.min(to, CONFIG.DAY_MINUTES);
  let ev;
  while ((ev = nextEvent(state, target))) applyEvent(state, ev);
  state.clock = Math.max(state.clock, target);
}

export function openItems(state) {
  return Object.values(state.items)
    .filter((r) => r.status === 'open')
    .sort((a, b) => a.arrivedAt - b.arrivedAt || a.id.localeCompare(b.id));
}

export function scheduledItems(state) {
  return Object.values(state.items).filter((r) => r.status === 'scheduled');
}

export function focusLeft(state) {
  return Math.max(0, 1 - state.focusUsed / CONFIG.FOCUS_CAPACITY);
}

export function doNowCost(state, rec, effort = rec.effort) {
  const base = effort * CONFIG.EFFORT_SCALE;
  const fatigued = state.focusUsed >= CONFIG.FOCUS_CAPACITY;
  return Math.round(base * (fatigued ? CONFIG.FATIGUE_MULT : 1));
}

function leastLoaded(state) {
  return Object.values(state.teammates).sort((a, b) => a.load - b.load)[0];
}

// Who a delegated message would actually go to: its assigned teammate, or the least-loaded one.
export function delegateTarget(state, rec) {
  return state.teammates[rec.def.delegateTo] ?? leastLoaded(state);
}

// A quick "I'm on it" reply: the message stays open, and if it is due today the deadline moves back once.
function holdingReply(state, rec) {
  const eventsFrom = state.events.length;
  const minute = state.clock;
  const due = rec.deadline !== null && rec.deadline <= CONFIG.DAY_MINUTES;
  const extended = due && !rec.held;
  let text;
  if (rec.held) text = 'You have already replied to this one.';
  else if (extended) text = rec.def.holdText ?? 'You sent a quick reply. They know you are on it, and you bought some time.';
  else text = 'Nothing was due yet, so the reply bought you nothing.';
  if (extended) rec.deadline += CONFIG.HOLD_EXTENSION;
  rec.held = true;
  pushEvent(state, 'hold', rec.id, { extended });
  tick(state, state.clock + CONFIG.HOLD_COST);
  return { id: rec.id, action: 'reply', minute, delta: 0, credit: null, mood: 'neutral', extended, text, events: state.events.slice(eventsFrom) };
}

export function act(state, itemId, action) {
  if (state.ended) throw new Error('The day has ended.');
  const rec = state.items[itemId];
  if (!rec || rec.status !== 'open') throw new Error(`Item ${itemId} is not open.`);
  // A message with specific responses takes one of those; any other message takes a generic action.
  const choices = rec.def.choices ?? null;
  const choice = choices ? choices.find((c) => c.id === action) : null;
  if (choices && !choice) throw new Error(`Item ${itemId} needs one of its listed responses.`);
  if (!choices && !ACTIONS.includes(action) && action !== 'reply') throw new Error(`Unknown action: ${action}`);
  if (!choice && action === 'reply') return holdingReply(state, rec);
  const kind = choice ? choice.kind : action;

  const eventsFrom = state.events.length;
  const minute = state.clock;
  const open = openItems(state);
  const newest = open.length >= 2 && open.every((o) => o === rec || o.arrivedAt <= rec.arrivedAt);

  let cost;
  let teammate = null;
  const ctx = {};
  if (kind === 'do_now') {
    const effort = choice?.effort ?? rec.effort;
    cost = doNowCost(state, rec, effort);
    state.focusUsed += effort * CONFIG.EFFORT_SCALE;
  } else {
    cost = CONFIG.COST[kind];
  }
  if (kind === 'delegate' && !choice?.external) {
    teammate = delegateTarget(state, rec);
    ctx.teammateFree = teammate.load < CONFIG.TEAMMATE_LOAD_LIMIT;
    teammate.load += 1;
  }

  let credit;
  if (choice) credit = kind === 'delegate' && ctx.teammateFree === false ? choice.credit * 0.5 : choice.credit;
  else credit = creditFor(rec, kind, ctx);
  const delta = decisionDelta(rec, credit);
  adjustMeter(state, delta);
  rec.action = kind;
  rec.credit = credit;
  rec.status = kind === 'schedule' ? 'scheduled' : 'resolved';

  const mood = moodFor(credit);
  const text = choice ? choice.text : outcomeText(rec, kind, credit);
  const decision = { id: rec.id, action: kind, minute, credit, delta, mood, newest, openCount: open.length, teammate: teammate?.id ?? null, text };
  if (choice) { decision.choiceId = choice.id; decision.choiceLabel = choice.label; }
  state.decisions.push(decision);
  pushEvent(state, 'decision', rec.id, { action: kind, credit, delta, mood });
  if (kind === 'decline') escalate(state, rec);

  tick(state, state.clock + cost);
  return { ...decision, events: state.events.slice(eventsFrom) };
}

export function wait(state, minutes = CONFIG.WAIT_MINUTES) {
  if (state.ended) throw new Error('The day has ended.');
  const eventsFrom = state.events.length;
  state.focusUsed = Math.max(0, state.focusUsed - minutes);
  tick(state, state.clock + minutes);
  return { events: state.events.slice(eventsFrom) };
}

export function crisisActive(state) {
  if (!state.crisis || state.clock < state.crisis.startsAt) return false;
  return Object.values(state.items).some((r) => r.status === 'open' && r.tags.includes('crisis'));
}

// A break that jumps to the next arrival (never more than `cap` minutes), so one break always brings something.
// With nothing left to arrive, the rest of the day passes quietly.
export function waitUntilNext(state, cap = CONFIG.BREAK_CAP) {
  if (state.ended) throw new Error('The day has ended.');
  const upcoming = Object.values(state.items)
    .filter((r) => r.status === 'queued' && r.arrivesAt > state.clock)
    .map((r) => r.arrivesAt);
  const minutes = upcoming.length
    ? Math.max(1, Math.min(cap, Math.min(...upcoming) - state.clock))
    : CONFIG.DAY_MINUTES - state.clock;
  const penalized = crisisActive(state);
  const result = wait(state, minutes);
  if (penalized) {
    adjustMeter(state, -CONFIG.CRISIS_BREAK_PENALTY);
    pushEvent(state, 'crisis-break', null, { delta: -CONFIG.CRISIS_BREAK_PENALTY });
  }
  return { ...result, minutes, penalized };
}

// When the inbox is empty the day moves on to the next message by itself, so there are no dead moments.
export function idleSkip(state) {
  if (state.ended || state.clock >= CONFIG.DAY_MINUTES || openItems(state).length > 0) return null;
  return waitUntilNext(state);
}

function summarize(state) {
  const escalations = Object.values(state.items).filter((r) => r.isFollowUp && r.arrivedAt !== null).length;
  return { meter: Math.round(state.meter), decisions: state.decisions, items: state.items, focusUsed: state.focusUsed, escalations };
}

export function finishDay(state) {
  if (state.ended) return summarize(state);
  tick(state, CONFIG.DAY_MINUTES);
  for (const rec of Object.values(state.items)) {
    if (rec.status !== 'open') continue;
    const delta = decisionDelta(rec, 0);
    adjustMeter(state, delta);
    rec.status = 'unhandled';
    rec.action = 'none';
    rec.credit = 0;
    state.decisions.push({ id: rec.id, action: 'none', minute: CONFIG.DAY_MINUTES, credit: 0, delta, mood: 'tense', newest: false, openCount: 0, teammate: null });
  }
  state.ended = true;
  return summarize(state);
}
