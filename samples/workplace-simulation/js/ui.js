import { CONFIG, ACTIONS, doNowCost, openItems, delegateTarget } from './engine.js';
import { avatar } from './avatar.js';

const LABEL = { do_now: 'Do it now', delegate: 'Delegate', schedule: 'Schedule', decline: 'Decline', reply: 'Send a holding reply' };
const ALL_ACTIONS = [...ACTIONS, 'reply'];

export function formatClock(minute) {
  const total = 9 * 60 + Math.max(0, Math.round(minute));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// Blocks rapid repeats (double clicks, held keys) so an action never lands on a message the learner has not read.
export function createGate(ms = 350, now = () => Date.now()) {
  let last = -Infinity;
  return {
    allow() {
      const t = now();
      if (t - last < ms) return false;
      last = t;
      return true;
    },
    reset() {
      last = -Infinity;
    },
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createUi({ senders, teammates, onSelect, onAction, onWait, onEnd }) {
  const $ = (id) => document.getElementById(id);
  let selectedId = null;
  let lastState = null;
  const known = new Set();
  const gate = createGate();

  function actionNote(state, rec, action) {
    if (action === 'do_now') return `Takes about ${doNowCost(state, rec)} min`;
    if (action === 'delegate') {
      const mate = delegateTarget(state, rec);
      const busy = mate.load >= CONFIG.TEAMMATE_LOAD_LIMIT;
      return `${CONFIG.COST.delegate} min. ${mate.name} ${busy ? 'is already swamped' : `has ${mate.load} task${mate.load === 1 ? '' : 's'}`}`;
    }
    if (action === 'reply') return rec.held ? 'You have already replied' : `${CONFIG.HOLD_COST} min. Tell them you are on it and ask for a little time`;
    if (action === 'schedule') return `${CONFIG.COST.schedule} min. Deal with it later`;
    return `${CONFIG.COST.decline} min. Close it without acting`;
  }

  function renderReader(state, rec) {
    const reader = $('reader-item');
    if (!rec) {
      reader.hidden = true;
      $('reader-empty').hidden = false;
      return;
    }
    const sender = senders[rec.def.sender];
    $('reader-empty').hidden = true;
    reader.hidden = false;
    $('reader-avatar').innerHTML = avatar(sender, 'neutral');
    $('reader-sender').textContent = sender.name;
    $('reader-role').textContent = sender.role;
    $('reader-subject').textContent = rec.def.subject;
    $('reader-body').textContent = rec.def.body;
    $('reader-actions').innerHTML = ALL_ACTIONS.map((action, i) => `
      <button type="button" class="action" data-action="${action}"${action === 'reply' && rec.held ? ' disabled' : ''}>
        <span class="action-name"><kbd aria-hidden="true">${i + 1}</kbd>${LABEL[action]}</span>
        <span class="action-note">${esc(actionNote(state, rec, action))}</span>
      </button>`).join('');
  }

  function select(id) {
    selectedId = id;
    gate.reset();
    if (lastState) {
      for (const li of $('inbox').children) li.setAttribute('aria-selected', String(li.dataset.id === id));
      $('inbox').setAttribute('aria-activedescendant', id ? `card-${id}` : '');
      renderReader(lastState, id ? lastState.items[id] : null);
      const card = id ? $(`card-${id}`) : null;
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'nearest' });
    }
    if (id && onSelect) onSelect(id);
  }

  function renderInbox(state) {
    lastState = state;
    const open = openItems(state);
    if (!open.some((r) => r.id === selectedId)) selectedId = open[0]?.id ?? null;
    $('inbox').innerHTML = open.map((rec) => {
      const sender = senders[rec.def.sender];
      const fresh = known.has(rec.id) ? '' : ' is-new';
      known.add(rec.id);
      return `<li class="card${fresh}" role="option" id="card-${rec.id}" data-id="${rec.id}" aria-selected="${rec.id === selectedId}">
        <span class="avatar">${avatar(sender, 'neutral')}</span>
        <span><span class="card-sender">${esc(sender.name)}</span><br>
        <span class="card-subject">${esc(rec.def.subject)}</span><br>
        <span class="card-time">${formatClock(rec.arrivedAt)}</span></span>
      </li>`;
    }).join('');
    $('inbox-count').textContent = open.length ? `(${open.length})` : '';
    $('inbox-empty').hidden = open.length > 0;
    $('inbox').setAttribute('aria-activedescendant', selectedId ? `card-${selectedId}` : '');
    renderReader(state, selectedId ? state.items[selectedId] : null);
  }

  function updateHud({ clock, focusLeft, meter, delta = 0 }) {
    $('clock-text').textContent = formatClock(clock);
    $('focus-text').textContent = `${Math.round(focusLeft * 100)}%`;
    $('meter-text').textContent = String(Math.round(meter));
    $('meter-arrow').textContent = delta > 0 ? '▲' : delta < 0 ? '▼' : '';
  }

  function showBubble(text, mood = 'neutral') {
    const el = document.createElement('div');
    el.className = `bubble mood-${mood}`;
    el.textContent = text;
    $('bubbles').appendChild(el);
    while ($('bubbles').children.length > 2) $('bubbles').firstChild.remove();
    setTimeout(() => el.remove(), 4500);
  }

  function announce(text) {
    const live = $('live');
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 40);
  }

  $('inbox').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (card) select(card.dataset.id);
  });

  $('inbox').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const ids = [...$('inbox').children].map((li) => li.dataset.id);
    if (!ids.length) return;
    e.preventDefault();
    const i = Math.max(0, ids.indexOf(selectedId));
    select(ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]);
  });

  $('reader-actions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn && selectedId && gate.allow()) onAction(selectedId, btn.dataset.action);
  });

  document.addEventListener('keydown', (e) => {
    if ($('play').hidden || $('guide').open || e.metaKey || e.ctrlKey || e.altKey) return;
    const i = ['1', '2', '3', '4', '5'].indexOf(e.key);
    if (i >= 0 && selectedId) {
      e.preventDefault();
      if (!e.repeat && gate.allow()) onAction(selectedId, ALL_ACTIONS[i]);
    }
  });

  $('open-guide').addEventListener('click', () => $('guide').showModal());
  $('wait').addEventListener('click', () => onWait());
  $('end-day').addEventListener('click', () => onEnd());

  function showCaption(text, kind = 'story') {
    const list = $('captions');
    const li = document.createElement('li');
    li.className = `caption caption-${kind}`;
    li.textContent = text;
    list.prepend(li);
    while (list.children.length > 3) list.lastChild.remove();
  }

  function clearCaptions() {
    $('captions').innerHTML = '';
  }

  function setCrisisBadge(on) {
    $('crisis-badge').hidden = !on;
  }

  return { renderInbox, updateHud, showBubble, announce, showCaption, clearCaptions, setCrisisBadge, getSelectedId: () => selectedId, resetKnown: () => known.clear() };
}
