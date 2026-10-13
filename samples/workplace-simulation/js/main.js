import {
  CONFIG, startDay, act, wait, finishDay, openItems, focusLeft,
  detectTendencies, generateDay, FOCUS_TAG_FOR, TENDENCY_KEYS,
} from './engine.js';
import { POOL, SENDERS, TEAMMATES } from './data/items.js';
import { createStore } from './store.js';
import { createScene } from './scene.js';
import { createUi, formatClock } from './ui.js';
import { renderDebrief, renderIntroHistory } from './debrief.js';

let storage;
try { storage = window.localStorage; } catch { storage = undefined; }
const store = createStore(storage);

const $ = (id) => document.getElementById(id);
const app = $('game');
let state = null;
let scene = null;
let seen = 0;

const ui = createUi({
  senders: SENDERS,
  teammates: TEAMMATES,
  onAction: (id, action) => handleAction(id, action),
  onWait: () => handleWait(),
  onEnd: () => { if (window.confirm('End the day now? Anything still in your inbox counts as unhandled.')) endDay(); },
});

function showScreen(name) {
  for (const id of ['intro', 'play', 'debrief']) $(id).hidden = id !== name;
  app.dataset.screen = name;
  window.scrollTo(0, 0);
}

function lowestTendency(map) {
  let best = null;
  for (const key of TENDENCY_KEYS) {
    const v = map?.[key];
    if (typeof v === 'number' && v < 100 && (best === null || v < map[best])) best = key;
  }
  return best;
}

function pickDay() {
  const reference = generateDay(POOL, { seed: 1 }).impactSum;
  const history = store.attempts();
  if (!history.length) return generateDay(POOL, { seed: 1 });
  const focusKey = lowestTendency(history[history.length - 1].tendencies);
  const focusTag = focusKey ? FOCUS_TAG_FOR[focusKey] : null;
  return generateDay(POOL, { seed: (Date.now() % 1000000) + 2, focusTag, referenceImpact: reference });
}

function refresh(delta = 0) {
  ui.renderInbox(state);
  ui.updateHud({ clock: state.clock, focusLeft: focusLeft(state), meter: state.meter, delta });
  scene.setTime(state.clock);
  scene.setFocus(focusLeft(state));
  scene.setMeter(state.meter, delta);
}

function processEvents() {
  const fresh = state.events.slice(seen);
  seen = state.events.length;
  const notes = [];
  for (const ev of fresh) {
    const rec = state.items[ev.id];
    const subject = rec?.def.subject ?? '';
    if (ev.type === 'expired') { ui.showBubble(`Out of time: ${subject}`, 'tense'); notes.push(`Out of time: ${subject}.`); }
    if (ev.type === 'escalated') { ui.showBubble(`It got worse: ${subject}`, 'tense'); notes.push(`It got worse: ${subject}.`); }
    if (ev.type === 'arrival' && !rec.isFollowUp) notes.push(`New message from ${SENDERS[rec.def.sender].name}: ${subject}.`);
  }
  return notes;
}

function handleAction(id, action) {
  if (!state || state.ended) return;
  const before = state.meter;
  let result;
  try { result = act(state, id, action); } catch { return; }
  ui.showBubble(result.text, result.mood);
  const notes = processEvents();
  const net = state.meter - before;
  refresh(net);
  const dir = net >= 0 ? 'up' : 'down';
  const message = `${result.text} ${notes.join(' ')} Team impact ${Math.round(state.meter)}, ${dir} ${Math.abs(Math.round(net * 10) / 10)}. It is ${formatClock(state.clock)}.`;
  if (state.clock >= CONFIG.DAY_MINUTES) {
    endDay(message);
  } else {
    ui.announce(message);
    $('inbox').focus();
  }
}

function handleWait() {
  if (!state || state.ended) return;
  const before = state.meter;
  wait(state);
  const notes = processEvents();
  refresh(state.meter - before);
  ui.announce(`You took a break. It is ${formatClock(state.clock)}. ${notes.join(' ')}`);
  if (state.clock >= CONFIG.DAY_MINUTES) endDay();
}

function beginDay() {
  state = startDay(pickDay());
  seen = state.events.length;
  showScreen('play');
  scene = createScene($('scene'));
  ui.resetKnown();
  refresh();
  ui.announce('Monday, 9:00 am. Your inbox is open.');
  $('inbox').focus();
}

function endDay(lastMessage = '') {
  const summary = finishDay(state);
  const tendencies = detectTendencies(summary.decisions, summary.items);
  const attempt = {
    ts: Date.now(),
    meter: summary.meter,
    tendencies: Object.fromEntries(tendencies.map((t) => [t.key, t.score])),
    decisions: summary.decisions.map(({ id, action, minute, credit }) => ({ id, action, minute, credit })),
  };
  const previous = store.attempts();
  const saved = store.save(attempt);
  renderDebrief($('debrief'), { summary, tendencies, previous, attempt, saved, onReplay: beginDay, onClear: clearHistory });
  showScreen('debrief');
  $('debrief-h').focus();
  ui.announce(`${lastMessage} The day is over. Your team impact finished at ${summary.meter} out of 100.`.trim());
}

function clearHistory() {
  if (!window.confirm('Clear your saved attempts in this browser?')) return;
  store.clear();
  showIntro();
}

function showIntro() {
  renderIntroHistory($('intro-history'), store.attempts());
  const clear = $('clear-intro');
  if (clear) clear.addEventListener('click', clearHistory);
  showScreen('intro');
}

$('start').addEventListener('click', beginDay);
showIntro();
