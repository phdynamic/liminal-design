import { startDay, act, wait, finishDay, openItems, creditFor, ACTIONS, CONFIG } from '../js/engine.js';
import { SENDERS } from '../js/data/items.js';

export function play(dayDef, choose) {
  const state = startDay(dayDef);
  let guard = 0;
  while (!state.ended && state.clock < CONFIG.DAY_MINUTES && guard++ < 500) {
    const open = openItems(state);
    const pick = open.length ? choose(state, open) : null;
    if (pick) act(state, pick.id, pick.action);
    else wait(state);
  }
  return finishDay(state);
}

// A player who reads impact and urgency: best rubric action, important and urgent first.
export function reasoned(state, open) {
  const priority = (rec) => rec.impact * 10 + (rec.deadline === null ? 0 : (CONFIG.DAY_MINUTES - rec.deadline) / 10);
  const rec = [...open].sort((a, b) => priority(b) - priority(a))[0];
  const best = ACTIONS
    .map((action) => ({ action, credit: creditFor(rec, action, { teammateFree: true }) }))
    .sort((x, y) => y.credit - x.credit)[0];
  return { id: rec.id, action: best.action };
}

// A player who answers the most senior sender first and does everything now.
export function reactive(state, open) {
  const rec = [...open].sort((a, b) => SENDERS[b.def.sender].rank - SENDERS[a.def.sender].rank || b.arrivedAt - a.arrivedAt)[0];
  return { id: rec.id, action: 'do_now' };
}
