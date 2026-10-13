const SKY = [
  { t: 0, top: [155, 181, 214], bottom: [242, 201, 160] },
  { t: 180, top: [111, 168, 232], bottom: [207, 230, 255] },
  { t: 300, top: [140, 184, 239], bottom: [246, 227, 184] },
  { t: 420, top: [233, 138, 91], bottom: [247, 192, 106] },
  { t: 480, top: [75, 79, 143], bottom: [232, 132, 92] },
];

const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

export function skyAt(minute) {
  const m = Math.max(0, Math.min(480, minute));
  let i = 0;
  while (i < SKY.length - 2 && m > SKY[i + 1].t) i++;
  const a = SKY[i], b = SKY[i + 1];
  const f = (m - a.t) / (b.t - a.t);
  const mix = (x, y) => x.map((v, k) => Math.round(v + (y[k] - v) * f));
  return { top: rgb(mix(a.top, b.top)), bottom: rgb(mix(a.bottom, b.bottom)) };
}

const ARC = Math.PI * 60;

const MARKUP = `
<svg viewBox="0 0 960 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop id="sky-top" offset="0" stop-color="#9bb5d6"/><stop id="sky-bottom" offset="1" stop-color="#f2c9a0"/></linearGradient>
    <clipPath id="cup-clip"><path d="M3 2 H41 L38 42 H6 Z"/></clipPath>
  </defs>
  <rect x="-800" width="2560" height="320" fill="#262850"/>
  <g transform="translate(60 30)">
    <rect width="520" height="200" fill="url(#sky)"/>
    <path d="M0 200 V140 h40 v-30 h30 v40 h50 v-60 h40 v70 h60 v-40 h40 v50 h60 v-80 h40 v90 h60 v-30 h40 v60 Z" fill="rgba(40,48,86,.42)"/>
    <path d="M0 200 V165 h60 v-35 h45 v45 h70 v-55 h35 v60 h80 v-40 h50 v50 h70 v-20 h110 Z" fill="rgba(24,28,56,.72)"/>
    <path d="M173 0 V200 M346 0 V200 M0 100 H520" stroke="#1b1d3a" stroke-width="8"/>
    <rect width="520" height="200" fill="none" stroke="#1b1d3a" stroke-width="10"/>
  </g>
  <g transform="translate(660 76)">
    <circle r="40" fill="#ece8f4" stroke="#1b1d3a" stroke-width="6"/>
    <g stroke="#13152b" stroke-width="3" stroke-linecap="round"><path d="M0 -34 V-28 M34 0 H28 M0 34 V28 M-34 0 H-28"/></g>
    <line id="hand-h" x1="0" y1="0" x2="0" y2="-20" stroke="#13152b" stroke-width="5" stroke-linecap="round"/>
    <line id="hand-m" x1="0" y1="0" x2="0" y2="-30" stroke="#13152b" stroke-width="3" stroke-linecap="round"/>
    <circle r="4" fill="#13152b"/>
  </g>
  <g transform="translate(760 40)">
    <rect width="170" height="130" rx="8" fill="#13152b" stroke="#3a3d6b" stroke-width="4"/>
    <text x="85" y="26" text-anchor="middle" fill="#abadcb" font-size="14" font-family="sans-serif">Team impact</text>
    <path d="M25 105 A60 60 0 0 1 145 105" fill="none" stroke="#3a3d6b" stroke-width="10" stroke-linecap="round"/>
    <path id="gauge-fill" d="M25 105 A60 60 0 0 1 145 105" fill="none" stroke="#ffd7a8" stroke-width="10" stroke-linecap="round" stroke-dasharray="94 188"/>
    <line id="needle" x1="85" y1="105" x2="85" y2="55" stroke="#ffd7a8" stroke-width="4" stroke-linecap="round" transform="rotate(0 85 105)"/>
    <circle cx="85" cy="105" r="6" fill="#ffd7a8"/>
    <text id="gauge-num" x="85" y="124" text-anchor="middle" fill="#ece8f4" font-size="16" font-weight="700" font-family="sans-serif">50</text>
    <text id="gauge-delta" x="150" y="44" text-anchor="end" fill="#ffd7a8" font-size="16" font-weight="700" font-family="sans-serif"></text>
  </g>
  <rect x="-800" y="250" width="2560" height="70" fill="#4a3a4e"/>
  <rect x="-800" y="244" width="2560" height="10" fill="#6b5468"/>
  <g transform="translate(400 188)"><rect width="150" height="58" rx="4" fill="#1b1d3a"/><rect x="8" y="8" width="134" height="42" fill="#262850"/><rect x="-10" y="58" width="170" height="8" rx="3" fill="#3a3d6b"/></g>
  <g transform="translate(290 158)"><path d="M0 90 L20 40 L50 20" stroke="#ffd7a8" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M40 14 L68 22 L56 42 Z" fill="#ffd7a8"/></g>
  <g transform="translate(120 190)"><path d="M0 54 H44 L38 90 H6 Z" fill="#a0524a"/><path d="M22 54 Q2 30 10 6 Q26 22 22 54 M22 54 Q44 36 40 10 Q22 24 22 54" fill="#4f8a55"/></g>
  <g transform="translate(610 204)">
    <path d="M0 0 H44 L40 44 H4 Z" fill="#ece8f4" fill-opacity=".14" stroke="#ece8f4" stroke-width="3"/>
    <rect id="cup-fill" x="0" y="2" width="44" height="40" fill="#8a5a3c" clip-path="url(#cup-clip)"/>
    <path d="M44 10 q14 0 14 12 t-14 12" fill="none" stroke="#ece8f4" stroke-width="3"/>
  </g>
</svg>`;

export function createScene(root) {
  root.innerHTML = MARKUP;
  const $ = (id) => root.querySelector(`#${id}`);
  const els = {
    skyTop: $('sky-top'), skyBottom: $('sky-bottom'), handH: $('hand-h'), handM: $('hand-m'),
    cup: $('cup-fill'), needle: $('needle'), fill: $('gauge-fill'), num: $('gauge-num'), delta: $('gauge-delta'),
  };
  let deltaTimer = null;

  return {
    setTime(minute) {
      const sky = skyAt(minute);
      els.skyTop.setAttribute('stop-color', sky.top);
      els.skyBottom.setAttribute('stop-color', sky.bottom);
      const hours = 9 + minute / 60;
      els.handH.setAttribute('transform', `rotate(${(hours % 12) * 30})`);
      els.handM.setAttribute('transform', `rotate(${(minute % 60) * 6})`);
    },
    setFocus(fraction) {
      const f = Math.max(0, Math.min(1, fraction));
      els.cup.setAttribute('y', String(2 + (1 - f) * 40));
      els.cup.setAttribute('height', String(f * 40));
    },
    setMeter(value, delta = 0) {
      const v = Math.max(0, Math.min(100, value));
      els.needle.setAttribute('transform', `rotate(${-90 + v * 1.8} 85 105)`);
      els.fill.setAttribute('stroke-dasharray', `${(v / 100) * ARC} ${ARC}`);
      els.num.textContent = String(Math.round(v));
      clearTimeout(deltaTimer);
      if (delta) {
        const shown = Math.round(Math.abs(delta) * 10) / 10;
        els.delta.textContent = `${delta > 0 ? '+' : '−'}${shown}`;
        deltaTimer = setTimeout(() => { els.delta.textContent = ''; }, 2500);
      } else {
        els.delta.textContent = '';
      }
    },
  };
}
