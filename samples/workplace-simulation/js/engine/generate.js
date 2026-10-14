export const DAY_SIZE = 16;
export const FOCUS_TAG_FOR = {
  rank: 'rank-pressure',
  quick: 'quick-win',
  recency: 'hidden-critical',
  avoidance: 'escalates',
  delegation: 'hidden-critical',
};

const REQUIRED = [['hidden-critical', 3], ['escalates', 2], ['rank-pressure', 2]];
const MAX_TRIES = 300;
const CRISIS_WINDOW = [150, 330];
const ARRIVAL_SPACING = 28;
const ARRIVAL_JITTER = 3;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick(rng, candidates, weight) {
  const total = candidates.reduce((s, c) => s + weight(c), 0);
  let r = rng() * total;
  for (const c of candidates) {
    r -= weight(c);
    if (r < 0) return c;
  }
  return candidates[candidates.length - 1];
}

function select(pool, rng, focusTag) {
  const weight = (i) => 1 + (focusTag && i.tags.includes(focusTag) ? 2 : 0);
  const chosen = [];
  const remaining = () => pool.items.filter((i) => !chosen.includes(i));
  for (const [tag, min] of REQUIRED) {
    while (chosen.filter((i) => i.tags.includes(tag)).length < min) {
      const options = remaining().filter((i) => i.tags.includes(tag));
      if (!options.length) throw new Error(`Pool cannot satisfy ${min} items tagged ${tag}.`);
      chosen.push(weightedPick(rng, options, weight));
    }
  }
  while (chosen.length < DAY_SIZE) chosen.push(weightedPick(rng, remaining(), weight));
  return chosen;
}

const sumImpact = (items) => items.reduce((s, i) => s + i.impact, 0);

function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickCrisis(pool, crisisSeed) {
  if (!pool.crises || !pool.crises.length) return null;
  const rng = mulberry32(crisisSeed);
  const def = pool.crises[Math.floor(rng() * pool.crises.length)];
  const startsAt = CRISIS_WINDOW[0] + Math.floor(rng() * (CRISIS_WINDOW[1] - CRISIS_WINDOW[0] + 1));
  const items = def.items.map(({ offset, ...item }) => ({ ...item, arrivesAt: startsAt + offset }));
  return { items, summary: { id: def.id, title: def.title, caption: def.caption, startsAt } };
}

export function generateDay(pool, { seed = 1, focusTag = null, referenceImpact = null, crisisSeed = seed * 7919 + 17, withCrisis = true } = {}) {
  const rng = mulberry32(seed);
  let best = null;
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const chosen = select(pool, rng, focusTag);
    const sum = sumImpact(chosen);
    const distance = referenceImpact == null ? 0 : Math.abs(sum - referenceImpact);
    if (!best || distance < best.distance) best = { chosen, sum, distance };
    if (referenceImpact == null || (sum >= referenceImpact * 0.9 && sum <= referenceImpact * 1.1)) break;
  }
  const ordered = shuffle(rng, best.chosen);
  const items = ordered.map((item, i) => {
    const slot = i < 2 ? 0 : (i - 1) * ARRIVAL_SPACING + Math.floor(rng() * ARRIVAL_JITTER);
    return { ...item, arrivesAt: slot };
  });
  const followUps = {};
  for (const item of items) if (item.escalatesTo) followUps[item.escalatesTo] = pool.followUps[item.escalatesTo];
  const crisis = withCrisis ? pickCrisis(pool, crisisSeed) : null;
  return {
    items: crisis ? [...items, ...crisis.items] : items,
    followUps,
    teammates: pool.teammates,
    impactSum: best.sum,
    crisis: crisis ? crisis.summary : null,
  };
}
