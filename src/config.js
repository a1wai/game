/**
 * Tuning for the arena. Distances are world units; the camera decides how many
 * pixels one unit is worth.
 */

export const WORLD = Object.freeze({
  radius: 1550,
  /** Band inside the rim where rivals turn back and the edge fades in. */
  edgeWarning: 220,
});

export const RIVAL_COUNT = 5;

export const SNAKE = Object.freeze({
  baseRadius: 14,
  maxRadius: 30,
  radiusGrowth: 0.3, // radius = base + sqrt(extra length) * this

  speed: 190, // units per second
  boostSpeed: 340,
  turnRate: 3.0, // radians per second
  boostTurnRate: 2.5,

  startLength: 300, // body arc length
  pathStep: 3.5, // spacing of recorded trail points

  boostDrain: 55, // length burned per second while boosting
  minBoostLength: 340, // below this, boost simply won't engage
  boostCrumbEvery: 0.16, // seconds between dropped crumbs
});

export const FOOD = Object.freeze({
  count: 340,
  magnetRadius: 78,
  magnetSpeed: 320,

  pellet: { radius: 7, value: 10, length: 22 },
  remains: { radius: 10, value: 16, length: 30 },
  crumb: { radius: 5.5, value: 5, length: 12 },
});

/** Soft, illustrated pellet colours — pastel, never fluorescent. */
export const FOOD_COLORS = Object.freeze([
  '#f0a89c',
  '#a8c6e8',
  '#f2cf94',
  '#bfb2e0',
  '#a9cfae',
  '#eeb7c8',
]);

export const RESPAWN_DELAY = 2600;
export const COUNTDOWN = 1600;
export const MAX_PARTICLES = 380;
export const KILL_BOUNTY = 25;

/** Fraction of its score a rival keeps when it dies. Rivals respawn; you don't. */
export const DEATH_SCORE_KEPT = 0.5;

/**
 * Difficulty changes rival speed and how they steer.
 *   caution    weight of "something is in the way"
 *   hunger     weight of "food is that way"
 *   aggression how often they try to cut across your path
 *   lookahead  how far ahead they probe, in world units
 *   jitter     random tiebreak, keeps them from looking scripted
 */
export const DIFFICULTY = Object.freeze({
  chill: {
    label: 'Chill',
    speedScale: 0.9,
    tuning: { caution: 26, hunger: 16, aggression: 0.12, lookahead: 100, jitter: 7, boost: 0.15 },
  },
  normal: {
    label: 'Normal',
    speedScale: 1,
    tuning: { caution: 44, hunger: 22, aggression: 0.34, lookahead: 150, jitter: 4, boost: 0.35 },
  },
  brutal: {
    label: 'Brutal',
    speedScale: 1.1,
    tuning: { caution: 62, hunger: 26, aggression: 0.62, lookahead: 205, jitter: 2, boost: 0.6 },
  },
});

/** Muted, illustrated palette — reads well as translucent glass over paper. */
export const PLAYER_SKIN = Object.freeze({
  name: 'You',
  color: '#0f9c98',
  soft: '#8ed6d3',
});

export const RIVAL_SKINS = Object.freeze([
  { name: 'Marlow', color: '#d9705e', soft: '#f0b3a7' },
  { name: 'Juniper', color: '#5f8fc9', soft: '#adc7e6' },
  { name: 'Saffron', color: '#d09a41', soft: '#eccf9b' },
  { name: 'Iris', color: '#9483c9', soft: '#c7bee6' },
  { name: 'Fern', color: '#67a471', soft: '#b0d3b6' },
]);

export const STORAGE_KEY = 'serpent-arena/v2';
