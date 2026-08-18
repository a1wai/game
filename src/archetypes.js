/**
 * Rival personalities.
 *
 * Every rival is one of these, and they play genuinely differently — not just
 * faster or slower. Each has a matching weakness, so taking one down is a
 * different problem depending on who it is. The weakness text is shown in the
 * menu and in the standings, because a technique you can't learn isn't a
 * technique.
 *
 * Multipliers scale the difficulty tuning rather than replacing it, so
 * Chill/Normal/Brutal still mean something on top.
 */
export const ARCHETYPES = Object.freeze([
  {
    id: 'hunter',
    label: 'Hunter',
    threat: 4,
    blurb: 'Comes straight for you and commits.',
    weakness: 'It turns wide. Bait it in, then cut back hard — it cannot follow.',
    speed: 1.14,
    turn: 0.8,
    caution: 0.65,
    aggression: 2.6,
    lookahead: 1.3,
    boost: 1.8,
    greed: 0.85,
  },
  {
    id: 'glutton',
    label: 'Glutton',
    threat: 3,
    blurb: 'Eats everything and gets enormous.',
    weakness: 'Length is its problem. Once it is long, loop tight around its head.',
    speed: 0.92,
    turn: 0.68,
    caution: 1.0,
    aggression: 0.5,
    lookahead: 1.0,
    boost: 0.4,
    greed: 1.7,
  },
  {
    id: 'skittish',
    label: 'Skittish',
    threat: 2,
    blurb: 'Bolts from anything bigger than it.',
    weakness: 'It flees in a straight line. Drive it at the rim and let the edge finish it.',
    speed: 1.08,
    turn: 1.2,
    caution: 1.9,
    aggression: 0.05,
    lookahead: 1.5,
    boost: 1.3,
    greed: 1,
  },
  {
    id: 'weaver',
    label: 'Weaver',
    threat: 2,
    blurb: 'Wanders, jinks, never holds a line.',
    weakness: 'It stays short. Meet it head-on — length wins that trade.',
    speed: 1.02,
    turn: 1.3,
    caution: 0.8,
    aggression: 0.9,
    lookahead: 0.8,
    boost: 0.9,
    greed: 0.65,
  },
  {
    id: 'sentinel',
    label: 'Sentinel',
    threat: 5,
    blurb: 'Holds one food field and rarely makes a mistake.',
    weakness: 'It will not leave its field. Cut through the middle and force it into you.',
    speed: 0.98,
    turn: 0.95,
    caution: 1.6,
    aggression: 1.3,
    lookahead: 1.6,
    boost: 0.6,
    greed: 1.35,
  },
]);

export const ARCHETYPE_BY_ID = Object.freeze(
  Object.fromEntries(ARCHETYPES.map((a) => [a.id, a])),
);

/** Deal archetypes round-robin so every kind shows up in every round. */
export function assignArchetype(index) {
  return ARCHETYPES[index % ARCHETYPES.length];
}
