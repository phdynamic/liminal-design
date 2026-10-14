// The story around the day. Times are minutes after 9:00. Beats are scene captions: no choices.
export const INTRO = [
  'Harbor & Pine moves orders for stores across the region. Until last Friday, Dana Whitfield ran customer operations. Now she is the VP of Operations, and you have her old job.',
  'It is your first Monday as team lead. The quarter closes on Friday. Brightline Retail, the company\'s biggest client, is nervous after a rough month. Dana has told you she will be watching how you spend the day.',
  'Your team is small: Avery, Blake, and Casey. They are good, and they are watching you too. Your coffee is still hot, and your inbox is already filling.',
];

export const BEATS = [
  { at: 60, text: "Avery waves from across the room and mouths, 'You okay?' You nod." },
  { at: 90, text: 'Dana walks past your desk without stopping. She gives you one small nod.' },
  { at: 180, text: 'Someone has microwaved fish in the kitchen. Lunch is a luxury today.' },
  { at: 300, text: 'The Brightline account manager drops by the floor. He is smiling a little too hard.' },
  { at: 360, text: 'The light in the window has turned golden. Blake is quietly rewriting something on the whiteboard.' },
  { at: 420, text: 'Casey asks whether you will have time to talk about next quarter before you leave.' },
  { at: 465, text: 'People are packing up. Dana\'s door is open.' },
];

// Beats that fall after `from` and up to and including `to`. Each beat is returned once as time moves forward.
export function beatsBetween(from, to) {
  return BEATS.filter((b) => b.at > from && b.at <= to);
}

const TIERS = {
  high: "Dana stops by at 5:00. 'I watched you today,' she says. 'You did not get pulled around by whoever was loudest. I noticed.' Then she hands you Friday's agenda.",
  mid: "Dana stops by at 5:00. 'Rough in places,' she says, 'but you kept the day from getting away from you. Same time tomorrow.'",
  low: "Dana stops by at 5:00. 'That was a hard first day,' she says. 'Let's talk through what you would do differently. Everyone gets one of these.'",
};

const HABIT_NOTES = {
  rank: "She adds one thing: 'Ask what is at stake before you ask who is asking.'",
  quick: "She adds one thing: 'The small tasks will always be there. Make sure they do not crowd out the big ones.'",
  recency: "She adds one thing: 'Look at the whole inbox before you pick. The newest message is not always the most important.'",
  avoidance: "She adds one thing: 'The hard items do not get easier by waiting.'",
  delegation: "She adds one thing: 'Some things only you can sign off. Keep those, and hand off the rest.'",
};

export function epilogueFor(meter, tendencyKey = null) {
  const tier = meter >= 70 ? 'high' : meter >= 40 ? 'mid' : 'low';
  return { text: TIERS[tier], note: HABIT_NOTES[tendencyKey] ?? '' };
}
