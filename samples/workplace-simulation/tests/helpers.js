import { startDay, act, waitUntilNext, finishDay, openItems, creditFor, ACTIONS, CONFIG } from '../js/engine.js';
import { SENDERS } from '../js/data/items.js';

export function play(dayDef, choose) {
  const state = startDay(dayDef);
  let guard = 0;
  while (!state.ended && state.clock < CONFIG.DAY_MINUTES && guard++ < 500) {
    const open = openItems(state);
    const pick = open.length ? choose(state, open) : null;
    if (pick) act(state, pick.id, pick.action);
    else waitUntilNext(state);
  }
  return finishDay(state);
}

// A player who reads impact and urgency: best response, important and urgent first.
export function reasoned(state, open) {
  const priority = (rec) => rec.impact * 10 + (rec.deadline === null ? 0 : (CONFIG.DAY_MINUTES - rec.deadline) / 10);
  const rec = [...open].sort((a, b) => priority(b) - priority(a))[0];
  if (rec.def.choices) {
    const best = [...rec.def.choices].sort((x, y) => y.credit - x.credit)[0];
    return { id: rec.id, action: best.id };
  }
  const best = ACTIONS
    .map((action) => ({ action, credit: creditFor(rec, action, { teammateFree: true }) }))
    .sort((x, y) => y.credit - x.credit)[0];
  return { id: rec.id, action: best.action };
}

// A player who answers the most senior sender first, does everything now, and falls for the rank and quick-win traps.
export function reactive(state, open) {
  const rec = [...open].sort((a, b) => SENDERS[b.def.sender].rank - SENDERS[a.def.sender].rank || b.arrivedAt - a.arrivedAt)[0];
  if (rec.def.choices) {
    const pick = rec.def.choices.find((c) => c.trap === 'rank' || c.trap === 'quick') ?? rec.def.choices.find((c) => c.kind === 'do_now') ?? rec.def.choices[0];
    return { id: rec.id, action: pick.id };
  }
  return { id: rec.id, action: 'do_now' };
}
