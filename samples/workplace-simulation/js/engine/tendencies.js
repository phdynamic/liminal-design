export const TENDENCY_KEYS = ['rank', 'quick', 'recency', 'avoidance', 'delegation'];
export const TENDENCY_LABELS = { rank: 'Rank bias', quick: 'Quick-win bias', recency: 'Recency bias', avoidance: 'Avoidance', delegation: 'Over-delegation' };

const mean = (list) => (list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0);
const score = (share, m) => Math.max(0, Math.min(100, Math.round(100 * (1 - share * (1 - m)))));

function result(key, label, fired, share, m, evidence, suggestion) {
  return { key, label, fired, score: fired ? score(share, m) : 100, evidence: fired ? evidence : [], suggestion };
}

function rankBias(rows) {
  const rank = rows.filter((r) => r.rec.tags.includes('rank-pressure'));
  const crit = rows.filter((r) => r.rec.tags.includes('hidden-critical'));
  const doNow = rank.filter((r) => r.action === 'do_now');
  const share = rank.length ? doNow.length / rank.length : 0;
  const critMean = crit.length ? mean(crit.map((r) => r.credit)) : 1;
  const fired = rank.length >= 2 && crit.length >= 2 && share >= 0.5 && critMean < 0.5;
  return result('rank', 'Rank bias', fired, share, critMean,
    [...doNow.map((r) => r.id), ...crit.filter((r) => r.credit < 0.5).map((r) => r.id)],
    'Ask what is at stake before you ask who is asking. A senior sender is a reason to reply promptly, not a reason to drop everything.');
}

function quickWinBias(rows) {
  const quick = rows.filter((r) => r.rec.tags.includes('quick-win'));
  const high = rows.filter((r) => r.rec.impact >= 4);
  const doNow = quick.filter((r) => r.action === 'do_now');
  const share = quick.length ? doNow.length / quick.length : 0;
  const highMean = high.length ? mean(high.map((r) => r.credit)) : 1;
  const fired = quick.length >= 2 && high.length >= 2 && share >= 0.5 && highMean < 0.6;
  return result('quick', 'Quick-win bias', fired, share, highMean,
    [...doNow.map((r) => r.id), ...high.filter((r) => r.credit < 0.6).map((r) => r.id)],
    'Small tasks feel productive, but they spend the hours the big ones need. Do the high-impact work first, then clear the small items in a batch.');
}

function recencyBias(rows) {
  const eligible = rows.filter((r) => r.action !== 'none' && r.openCount >= 2);
  const newest = eligible.filter((r) => r.newest);
  const share = eligible.length ? newest.length / eligible.length : 0;
  const m = mean(eligible.map((r) => r.credit));
  const fired = eligible.length >= 4 && share >= 0.6 && m < 0.6;
  return result('recency', 'Recency bias', fired, share, m, newest.map((r) => r.id),
    'The newest message is not the most important one. Scan the whole inbox before you pick.');
}

function avoidance(rows) {
  const heavy = rows.filter((r) => r.rec.impact >= 4 && r.rec.effort >= 30);
  const scheduled = heavy.filter((r) => r.action === 'schedule');
  const share = heavy.length ? scheduled.length / heavy.length : 0;
  const m = mean(heavy.map((r) => r.credit));
  const fired = heavy.length >= 2 && share >= 0.5 && m < 0.6;
  return result('avoidance', 'Avoidance', fired, share, m, scheduled.map((r) => r.id),
    'Putting off the hard, important items made them harder. If it matters and it is due soon, do it first.');
}

function overDelegation(rows) {
  const delegated = rows.filter((r) => r.action === 'delegate');
  const bad = delegated.filter((r) => !r.rec.delegable || (r.rec.impact >= 4 && r.credit < 0.7));
  const share = delegated.length ? bad.length / delegated.length : 0;
  const m = mean(bad.map((r) => r.credit));
  const fired = bad.length >= 2;
  return result('delegation', 'Over-delegation', fired, share, m, bad.map((r) => r.id),
    'Delegate work a teammate can finish well. Keep the items that need your judgment or your authority.');
}

const DETECTORS = [rankBias, quickWinBias, recencyBias, avoidance, overDelegation];

export function detectTendencies(decisions, items) {
  const rows = decisions.map((d) => ({ ...d, rec: items[d.id] })).filter((r) => r.rec);
  return DETECTORS.map((fn) => fn(rows));
}

export function worstTendency(list) {
  return list.filter((t) => t.fired).sort((a, b) => a.score - b.score)[0] ?? null;
}
