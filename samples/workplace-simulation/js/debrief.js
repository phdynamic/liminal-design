import { CONFIG } from './engine.js';
import { formatClock } from './ui.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ACTION_NAME = { do_now: 'Did it now', delegate: 'Delegated', schedule: 'Scheduled', decline: 'Declined', none: 'Not handled' };
const FILL = (credit) => (credit >= 0.7 ? '#7FD1AE' : credit >= 0.4 ? '#F2C46D' : '#F08A72');
const FILL_WORD = (credit) => (credit >= 0.7 ? 'strong' : credit >= 0.4 ? 'mixed' : 'weak');

export function urgencyOf(rec) {
  if (rec.deadline === null || rec.deadline > CONFIG.DAY_MINUTES) return 0.1;
  const window = rec.deadline - rec.arrivesAt;
  return Math.max(0.15, Math.min(1, 1 - window / 480));
}

export function trendOf(current, previous) {
  if (previous == null) return { arrow: '', text: 'First attempt' };
  const diff = Math.round(current - previous);
  if (diff > 0) return { arrow: '▲', text: `up ${diff} since your last attempt` };
  if (diff < 0) return { arrow: '▼', text: `down ${Math.abs(diff)} since your last attempt` };
  return { arrow: '–', text: 'unchanged since your last attempt' };
}

export function crisisReview(summary, crisis) {
  if (!crisis) return null;
  const rows = summary.decisions
    .map((d) => ({ d, rec: summary.items[d.id] }))
    .filter((r) => r.rec && r.rec.tags.includes('crisis'));
  if (!rows.length) return null;
  const score = Math.round(100 * rows.reduce((s, r) => s + r.d.credit, 0) / rows.length);
  const handled = rows.filter((r) => r.d.action !== 'none').length;
  const text = score >= 70
    ? 'You triaged the crisis well: the urgent items got the right response, and the rest did not pull you off course.'
    : score >= 40
      ? 'The crisis was mixed. Some of it was handled well, but at least one important message got less than it needed.'
      : 'The crisis got away from you. With four things at once, the order matters: start with what only you can do.';
  return { title: crisis.title, score, handled, missed: rows.length - handled, delta: rows.reduce((s, r) => s + r.d.delta, 0), text };
}

export function sparkline(values) {
  if (values.length < 2) return '';
  const W = 240, H = 60, P = 6;
  const pts = values.map((v, i) => {
    const x = P + (i / (values.length - 1)) * (W - 2 * P);
    const y = H - P - (Math.max(0, Math.min(100, v)) / 100) * (H - 2 * P);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = pts[pts.length - 1].split(',');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend across your attempts: ${values.map(Math.round).join(', ')}">`
    + `<polyline points="${pts.join(' ')}" fill="none" stroke="#FFD7A8" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#FFD7A8"/></svg>`;
}

function shapeFor(action, x, y, fill) {
  const s = `fill="${fill}" stroke="#13152B" stroke-width="2"`;
  if (action === 'do_now') return `<circle cx="${x}" cy="${y}" r="11" ${s}/>`;
  if (action === 'delegate') return `<rect x="${x - 10}" y="${y - 10}" width="20" height="20" ${s}/>`;
  if (action === 'schedule') return `<polygon points="${x},${y - 12} ${x + 12},${y + 10} ${x - 12},${y + 10}" ${s}/>`;
  if (action === 'decline') return `<polygon points="${x},${y - 12} ${x + 12},${y} ${x},${y + 12} ${x - 12},${y}" ${s}/>`;
  return `<path d="M${x - 9} ${y - 9} L${x + 9} ${y + 9} M${x + 9} ${y - 9} L${x - 9} ${y + 9}" stroke="${fill}" stroke-width="5" stroke-linecap="round"/>`;
}

function matrix(summary) {
  const W = 560, H = 360, L = 56, R = 20, T = 20, B = 48;
  const rows = summary.decisions.map((d, i) => ({ d, rec: summary.items[d.id], i })).filter((r) => r.rec);
  const dots = rows.map(({ d, rec, i }) => {
    const x = Math.round(L + 24 + ((rec.impact - 1) / 4) * (W - L - R - 48) + (((i * 37) % 13) - 6) * 2.5);
    const y = Math.round(T + (1 - urgencyOf(rec)) * (H - T - B) + (((i * 53) % 11) - 5) * 2.5);
    const label = `${i + 1}. ${rec.def.subject}: ${ACTION_NAME[d.action]}, ${FILL_WORD(d.credit)} result`;
    return `<g><title>${esc(label)}</title>${shapeFor(d.action, x, y, FILL(d.credit))}<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#13152B" font-family="sans-serif">${i + 1}</text></g>`;
  }).join('');
  const mx = L + (W - L - R) / 2, my = T + (H - T - B) / 2;
  return `<svg class="matrix" viewBox="0 0 ${W} ${H}" role="img" aria-label="Priority matrix of your decisions. Impact runs left to right, urgency runs bottom to top. The table below lists every decision.">
    <rect x="${mx}" y="${T}" width="${W - R - mx}" height="${my - T}" fill="rgba(255,215,168,.1)"/>
    <path d="M${L} ${T} V${H - B} H${W - R}" fill="none" stroke="#ABADCB" stroke-width="1.5"/>
    <path d="M${mx} ${T} V${H - B} M${L} ${my} H${W - R}" stroke="#ABADCB" stroke-width="1" stroke-dasharray="4 4"/>
    <text x="${W - R - 6}" y="${T + 16}" text-anchor="end" font-size="13" fill="#FFD7A8" font-family="sans-serif">Important and urgent</text>
    <text x="${(L + W - R) / 2}" y="${H - 12}" text-anchor="middle" font-size="13" fill="#ABADCB" font-family="sans-serif">Impact (low to high)</text>
    <text transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="#ABADCB" font-family="sans-serif">Urgency (low to high)</text>
    ${dots}</svg>`;
}

function timelineTable(summary) {
  const body = summary.decisions.map((d, i) => {
    const rec = summary.items[d.id];
    if (!rec) return '';
    const sign = d.delta >= 0 ? '+' : '−';
    return `<tr><td>${i + 1}</td><td>${formatClock(d.minute)}</td><td>${esc(rec.def.subject)}</td><td>${ACTION_NAME[d.action]}</td><td>${FILL_WORD(d.credit)}</td><td>${sign}${Math.abs(Math.round(d.delta * 10) / 10)}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><caption class="sr-only">Every decision, in order</caption><thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col">Message</th><th scope="col">What you did</th><th scope="col">Result</th><th scope="col">Impact</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function callouts(tendencies, summary) {
  const fired = tendencies.filter((t) => t.fired);
  if (!fired.length) {
    return '<p>No strong pattern showed up today. Replay for a tougher mix of messages.</p>';
  }
  return fired.map((t) => {
    const subjects = t.evidence.map((id) => summary.items[id]?.def.subject).filter(Boolean);
    return `<div class="callout"><h3>${esc(t.label)}</h3>
      <p>${esc(t.suggestion)}</p>
      ${subjects.length ? `<p class="muted">Where it showed up: ${subjects.map(esc).join('; ')}.</p>` : ''}</div>`;
  }).join('');
}

function storyPanel(data) {
  if (!data.epilogue) return '';
  return `<div class="panel story"><h2>Dana's note</h2><p>${esc(data.epilogue.text)}</p>${data.epilogue.note ? `<p>${esc(data.epilogue.note)}</p>` : ''}</div>`;
}

function crisisPanel(data) {
  const review = data.crisis;
  if (!review) return '';
  const last = [...data.previous].reverse().find((a) => a.crisis && typeof a.crisis.score === 'number');
  const tr = trendOf(review.score, last?.crisis?.score);
  const sign = review.delta >= 0 ? '+' : '−';
  return `<div class="panel"><h2>How you handled the crisis</h2>
    <p><strong>${esc(review.title)}</strong></p>
    <p class="big" aria-label="Crisis score ${review.score} out of 100">${review.score}</p>
    <p class="trend">${tr.arrow} ${esc(tr.text)}</p>
    <p>${esc(review.text)}</p>
    <p class="muted">You handled ${review.handled} of ${review.handled + review.missed} crisis messages. Team impact from the crisis: ${sign}${Math.abs(Math.round(review.delta * 10) / 10)}.</p></div>`;
}

function indexPanel(data) {
  const { attempt, previous, tendencies } = data;
  const last = previous[previous.length - 1];
  const overall = trendOf(attempt.meter, last?.meter);
  const history = [...previous.map((a) => a.meter), attempt.meter];
  const rows = tendencies.map((t) => {
    const tr = trendOf(t.score, last?.tendencies?.[t.key]);
    return `<div><strong>${esc(t.label)}</strong> <span class="muted">${t.score}/100 ${tr.arrow} ${esc(tr.text)}</span>
      <div class="bar" aria-hidden="true"><span style="width:${t.score}%"></span></div></div>`;
  }).join('');
  return `<div class="panel"><h3>Judgment index</h3>
    <p class="big">${attempt.meter}</p>
    <p class="trend">${overall.arrow} ${esc(overall.text)}</p>
    ${sparkline(history)}
    <h3 style="margin-top:1rem">By tendency</h3>
    <p class="muted">100 means no bias showed up.</p>${rows}
    ${data.saved ? '' : '<p class="muted">Your browser blocked saving, so this attempt will not be remembered.</p>'}</div>`;
}

export function renderDebrief(root, data) {
  const { summary } = data;
  root.innerHTML = `
    <h1 id="debrief-h" style="font-size:clamp(2.5rem,7vw,4rem)">The day is over</h1>
    <p class="lede muted" style="margin-top:.75rem">Your team impact finished at <strong>${summary.meter}</strong> out of 100. Here is what your choices looked like.</p>
    <div style="margin-top:1.5rem">${storyPanel(data)}</div>
    <div class="grid" style="margin-top:1rem">
      <div>
        <div class="panel"><h2>Priority matrix</h2>${matrix(summary)}
          <p class="legend"><span>Circle: did it now</span><span>Square: delegated</span><span>Triangle: scheduled</span><span>Diamond: declined</span><span>Cross: not handled</span></p>
          <p class="legend"><span>Green: strong result</span><span>Amber: mixed</span><span>Red: weak</span></p></div>
        <div class="panel"><h2>Your day, in order</h2>${timelineTable(summary)}</div>
      </div>
      <div>
        ${indexPanel(data)}
        ${crisisPanel(data)}
        <div class="panel"><h2>What showed up</h2>${callouts(data.tendencies, summary)}</div>
      </div>
    </div>
    <div class="row-actions">
      <button id="replay" class="btn btn-light" type="button">Play a tuned replay</button>
      <button id="clear" class="btn btn-line" type="button">Clear my history</button>
      <a class="btn btn-line" href="../../index.html#work">Back to the portfolio</a>
    </div>`;
  root.querySelector('#replay').addEventListener('click', () => data.onReplay());
  root.querySelector('#clear').addEventListener('click', () => data.onClear());
  root.querySelector('#debrief-h').setAttribute('tabindex', '-1');
}

export function renderIntroHistory(root, attempts) {
  if (!attempts.length) { root.innerHTML = ''; return; }
  const last = attempts[attempts.length - 1];
  root.innerHTML = `<div class="panel"><h2 style="font-size:1.4rem">Your history</h2>
    <p>${attempts.length} attempt${attempts.length === 1 ? '' : 's'} so far. Last judgment index: <strong>${last.meter}</strong>.</p>
    ${sparkline(attempts.map((a) => a.meter))}
    <p class="muted">Your next day is tuned to the pattern from your last attempt. Your data stays in this browser.</p>
    <button id="clear-intro" class="btn btn-line" type="button">Clear my history</button></div>`;
}
