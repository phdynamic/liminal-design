const MOUTH = {
  relieved: 'M24 41 Q32 48 40 41',
  neutral: 'M26 43 L38 43',
  tense: 'M25 45 Q32 40 39 45',
};

const HAIR = {
  short: (c) => `<path d="M17 29 Q16 8 32 8 Q48 8 47 29 Q40 18 32 18 Q24 18 17 29Z" fill="${c}"/>`,
  long: (c) => `<path d="M15 32 Q12 7 32 7 Q52 7 49 32 L49 50 L43 50 L43 27 Q32 18 21 27 L21 50 L15 50Z" fill="${c}"/>`,
  bun: (c) => `<circle cx="32" cy="6" r="6" fill="${c}"/><path d="M17 29 Q16 9 32 9 Q48 9 47 29 Q40 19 32 19 Q24 19 17 29Z" fill="${c}"/>`,
  bald: () => '',
};

export function avatar(sender, mood = 'neutral') {
  const hair = (HAIR[sender.hairStyle] ?? HAIR.short)(sender.hair);
  const brows = mood === 'tense'
    ? '<path d="M20 26 L28 28 M44 26 L36 28" stroke="#1c1c28" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M20 28 L28 26 M44 28 L36 26" stroke="#1c1c28" stroke-width="2" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">`
    + `<path d="M6 64 Q6 51 32 51 Q58 51 58 64Z" fill="${sender.shirt}"/>`
    + `<circle cx="32" cy="32" r="15" fill="${sender.skin}"/>`
    + hair
    + `<circle cx="26" cy="33" r="1.9" fill="#1c1c28"/><circle cx="38" cy="33" r="1.9" fill="#1c1c28"/>`
    + brows
    + `<path d="${MOUTH[mood] ?? MOUTH.neutral}" fill="none" stroke="#1c1c28" stroke-width="2" stroke-linecap="round"/>`
    + `</svg>`;
}
