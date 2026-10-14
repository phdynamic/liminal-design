import {
  CONFIG, startDay, act, waitUntilNext, finishDay, openItems, focusLeft, crisisActive,
  detectTendencies, worstTendency, generateDay, FOCUS_TAG_FOR, TENDENCY_KEYS,
} from './engine.js';
import { POOL, SENDERS, TEAMMATES } from './data/items.js';
import { INTRO, beatsBetween, epilogueFor } from './data/story.js';
import { createStore } from './store.js';
import { createScene } from './scene.js';
import { createUi, formatClock } from './ui.js';
import { renderDebrief, renderIntroHistory, crisisReview } from './debrief.js';

let storage;
try { storage = window.localStorage; } catch { storage = undefined; }
const store = createStore(storage);

const $ = (id) => document.getElementById(id);
const app = $('game');
let state = null;
let scene = null;
let seen = 0;
let crisisAnnounced = false;

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
  const crisisSeed = Math.floor(Math.random() * 1e9);
  const history = store.attempts();
  if (!history.length) return generateDay(POOL, { seed: 1, crisisSeed });
  const focusKey = lowestTendency(history[history.length - 1].tendencies);
  const focusTag = focusKey ? FOCUS_TAG_FOR[focusKey] : null;
  return generateDay(POOL, { seed: (Date.now() % 1000000) + 2, focusTag, referenceImpact: reference, crisisSeed });
}

function refresh(delta = 0) {
  ui.renderInbox(state);
  ui.updateHud({ clock: state.clock, focusLeft: focusLeft(state), meter: state.meter, delta });
  scene.setTime(state.clock);
  scene.setFocus(focusLeft(state));
  scene.setMeter(state.meter, delta);
  const active = crisisActive(state);
  scene.setCrisis(active);
  ui.setCrisisBadge(active);
}

function processEvents(prevClock) {
  const fresh = state.events.slice(seen);
  seen = state.events.length;
  const notes = [];
  for (const ev of fresh) {
    const rec = state.items[ev.id];
    const subject = rec?.def.subject ?? '';
    if (ev.type === 'expired') { ui.showBubble(`Out of time: ${subject}`, 'tense'); notes.push(`Out of time: ${subject}.`); }
    if (ev.type === 'escalated') { ui.showBubble(`It got worse: ${subject}`, 'tense'); notes.push(`It got worse: ${subject}.`); }
    if (ev.type === 'crisis-break') { ui.showBubble('You stepped away while the crisis was open.', 'tense'); notes.push('Resting during the crisis cost you impact.'); }
    if (ev.type === 'arrival' && !rec.isFollowUp) notes.push(`New message from ${SENDERS[rec.def.sender].name}: ${subject}.`);
  }
  const crisis = state.crisis;
  if (crisis && !crisisAnnounced && state.clock >= crisis.startsAt) {
    crisisAnnounced = true;
    ui.showCaption(crisis.caption, 'crisis');
    notes.unshift(`Crisis: ${crisis.title}.`);
  }
  for (const beat of beatsBetween(prevClock, state.clock)) {
    ui.showCaption(beat.text, 'story');
    notes.push(beat.text);
  }
  return notes;
}

function handleAction(id, action) {
  if (!state || state.ended) return;
  const before = state.meter;
  const prevClock = state.clock;
  let result;
  try { result = act(state, id, action); } catch { return; }
  ui.showBubble(result.text, result.mood);
  const notes = processEvents(prevClock);
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
  const prevClock = state.clock;
  waitUntilNext(state);
  const notes = processEvents(prevClock);
  refresh(state.meter - before);
  const message = `You took a break. It is ${formatClock(state.clock)}. ${notes.join(' ')}`;
  if (state.clock >= CONFIG.DAY_MINUTES) endDay(message);
  else ui.announce(message);
}

function beginDay() {
  state = startDay(pickDay());
  seen = state.events.length;
  crisisAnnounced = false;
  showScreen('play');
  scene = createScene($('scene'));
  ui.resetKnown();
  ui.clearCaptions();
  refresh();
  ui.announce('Monday, 9:00 am. Your inbox is open.');
  $('inbox').focus();
}

function endDay(lastMessage = '') {
  const summary = finishDay(state);
  const tendencies = detectTendencies(summary.decisions, summary.items);
  const review = crisisReview(summary, state.crisis);
  const attempt = {
    ts: Date.now(),
    meter: summary.meter,
    tendencies: Object.fromEntries(tendencies.map((t) => [t.key, t.score])),
    crisis: review ? { id: state.crisis.id, score: review.score } : null,
    decisions: summary.decisions.map(({ id, action, minute, credit }) => ({ id, action, minute, credit })),
  };
  const previous = store.attempts();
  const saved = store.save(attempt);
  const epilogue = epilogueFor(summary.meter, worstTendency(tendencies)?.key ?? null);
  renderDebrief($('debrief'), { summary, tendencies, previous, attempt, saved, epilogue, crisis: review, onReplay: beginDay, onClear: clearHistory });
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
  $('intro-story').innerHTML = INTRO.map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('');
  renderIntroHistory($('intro-history'), store.attempts());
  const clear = $('clear-intro');
  if (clear) clear.addEventListener('click', clearHistory);
  showScreen('intro');
}

$('start').addEventListener('click', beginDay);
showIntro();
