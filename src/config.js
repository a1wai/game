/**
 * Tuning for the arena. Distances are world units; the camera decides how many
 * pixels a unit is worth.
 */

export const WORLD = Object.freeze({
  /** ~20x the area of the old arena. */
  radius: 6900,
  /** Band inside the rim where rivals turn back and the edge glows. */
  edgeWarning: 420,
});

/** Total snakes including you. Respawns keep the arena populated. */
export const SNAKE_COUNT = 16;

/** Hard floor on live snakes — dead rivals skip the queue to hold this. */
export const MIN_ALIVE = 10;

export const SNAKE = Object.freeze({
  baseRadius: 16,
  maxRadius: 34,
  radiusGrowth: 0.3, // radius = base + sqrt(extra length) * this

  speed: 235, // units per second
  boostSpeed: 420,
  turnRate: 3.15, // radians per second
  boostTurnRate: 2.6,

  startLength: 320, // body arc length
  pathStep: 3.5, // spacing of recorded trail points

  boostDrain: 62, // length burned per second while boosting
  minBoostLength: 360, // below this, boost simply won't engage
  boostCrumbEvery: 0.15, // seconds between dropped crumbs

  /** Bounding boxes refresh on this cadence (steps) for cheap view culling. */
  boundsEvery: 15,
});

export const FOOD = Object.freeze({
  count: 2800,
  /** Pellets gather in fields, so the open world still has places worth going. */
  clusters: 78,
  clusterRadius: [320, 640],
  /** Share of pellets scattered between the fields. */
  scatter: 0.14,

  magnetRadius: 84,
  magnetSpeed: 340,

  pellet: { radius: 7.5, value: 10, length: 24 },
  remains: { radius: 10.5, value: 16, length: 32 },
  crumb: { radius: 6, value: 5, length: 13 },
});

/** Pellet colours — luminous against the dark, but not fluorescent. */
export const FOOD_COLORS = Object.freeze([
  '#79d7c4',
  '#8fb8f0',
  '#f0c489',
  '#c3a9ee',
  '#8fd79a',
  '#f0a0b6',
]);

export const RESPAWN_DELAY = 1900;
export const COUNTDOWN = 1600;
export const MAX_PARTICLES = 520;
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
    tuning: { caution: 26, hunger: 16, aggression: 0.12, lookahead: 120, jitter: 7, boost: 0.15 },
  },
  normal: {
    label: 'Normal',
    speedScale: 1,
    tuning: { caution: 44, hunger: 22, aggression: 0.34, lookahead: 175, jitter: 4, boost: 0.35 },
  },
  brutal: {
    label: 'Brutal',
    speedScale: 1.1,
    tuning: { caution: 62, hunger: 26, aggression: 0.62, lookahead: 235, jitter: 2, boost: 0.6 },
  },
});

export const PLAYER_SKIN = Object.freeze({
  name: 'You',
  color: '#3fd3c6',
  soft: '#9df0e6',
});

/** Fifteen rivals, spaced around the hue wheel so heads stay tellable apart. */
export const RIVAL_SKINS = Object.freeze([
  { name: 'Marlow', color: '#f08a76', soft: '#f8c0b2' },
  { name: 'Juniper', color: '#7aa9f0', soft: '#b6cef7' },
  { name: 'Saffron', color: '#f0c070', soft: '#f7dcac' },
  { name: 'Iris', color: '#b9a3f0', soft: '#d8cdf8' },
  { name: 'Fern', color: '#86c98f', soft: '#bce0c1' },
  { name: 'Cinder', color: '#e8798f', soft: '#f5b3c1' },
  { name: 'Quill', color: '#6fc9d6', soft: '#aee3ea' },
  { name: 'Basil', color: '#a9c96f', soft: '#d2e3ac' },
  { name: 'Hazel', color: '#e0a06a', soft: '#f0cbab' },
  { name: 'Indigo', color: '#8f92e8', soft: '#c0c2f3' },
  { name: 'Willow', color: '#71cfab', soft: '#aee7d1' },
  { name: 'Pepper', color: '#e88fc4', soft: '#f4c2e0' },
  { name: 'Nimbus', color: '#9fb4d6', soft: '#c9d6e9' },
  { name: 'Rusk', color: '#d69c86', soft: '#ebc7b8' },
  { name: 'Onyx', color: '#8ea3b8', soft: '#bccada' },
]);

export const STORAGE_KEY = 'serpent-arena/v3';
