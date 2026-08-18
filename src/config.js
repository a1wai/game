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

  speed: 280, // units per second
  boostSpeed: 500,
  turnRate: 3.7, // radians per second — the player's edge is agility
  boostTurnRate: 3.1,

  startLength: 320, // body arc length
  /**
   * Ceiling on body length. Radius stops growing long before this, so anything
   * beyond it is pure wall — a snake long enough to carpet the arena stops
   * being an opponent and starts being terrain.
   */
  maxLength: 6200,
  pathStep: 3.5, // spacing of recorded trail points

  /**
   * Boost is fuel, not a free button: it burns length fast enough that holding
   * it shrinks you visibly within a second or two.
   */
  boostDrain: 105, // length burned per second while boosting
  minBoostLength: 380, // below this, boost simply won't engage
  boostCrumbEvery: 0.12, // seconds between dropped crumbs

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

export const PLAYER_NAME = 'You';

/** Rival names. Their colours are generated fresh every round. */
export const RIVAL_NAMES = Object.freeze([
  'Marlow',
  'Juniper',
  'Saffron',
  'Iris',
  'Fern',
  'Cinder',
  'Quill',
  'Basil',
  'Hazel',
  'Indigo',
  'Willow',
  'Pepper',
  'Nimbus',
  'Rusk',
  'Onyx',
]);

export const STORAGE_KEY = 'serpent-arena/v4';
