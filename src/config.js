/**
 * Static tuning for the arena.
 * Everything gameplay-facing lives here so balance changes never touch logic.
 */

export const GRID = Object.freeze({ cols: 42, rows: 28 });

/** Logical pixel size of one grid cell. The canvas is scaled with CSS. */
export const CELL = 22;

export const AI_COUNT = 5;
export const START_LENGTH = 4;
export const FOOD_TARGET = 10;

/** ms an AI snake stays dead before it slithers back in. */
export const RESPAWN_DELAY = 2400;

/** ms of "3 · 2 · 1" before the first tick of a round. */
export const COUNTDOWN = 1900;

export const MAX_PARTICLES = 420;

/** Score awarded to the snake you crash into. Crime pays. */
export const KILL_BOUNTY = 25;

/**
 * Fraction of its score a rival keeps when it dies. Rivals respawn forever, so
 * without this they'd out-accumulate a one-life player no matter how well you
 * play — and taking someone down would mean nothing in the standings.
 */
export const DEATH_SCORE_KEPT = 0.5;

export const FOOD_TYPES = Object.freeze({
  pellet: { value: 10, grow: 1, radius: 0.3, color: '#7cffb2' },
  remains: { value: 15, grow: 1, radius: 0.36, color: '#ffd166' },
});

/**
 * tick      — ms per simulation step (lower = faster arena)
 * tuning    — AI brain parameters, see src/ai.js
 *   skill      probability the AI plays its best move instead of a random legal one
 *   hunger     how strongly it beelines for food
 *   safety     extra free cells it wants beyond its own length before committing
 *   riskWeight how much it avoids cells a rival head could reach next tick
 *   jitter     random tiebreak noise, keeps rounds from looking scripted
 *   areaCap    flood-fill budget per candidate move
 */
export const DIFFICULTY = Object.freeze({
  chill: {
    label: 'Chill',
    tick: 132,
    tuning: { skill: 0.72, hunger: 6, safety: 1, riskWeight: 40, jitter: 34, areaCap: 220 },
  },
  normal: {
    label: 'Normal',
    tick: 104,
    tuning: { skill: 0.9, hunger: 9, safety: 3, riskWeight: 70, jitter: 16, areaCap: 320 },
  },
  brutal: {
    label: 'Brutal',
    tick: 82,
    tuning: { skill: 0.99, hunger: 12, safety: 5, riskWeight: 110, jitter: 6, areaCap: 460 },
  },
});

export const PLAYER_SKIN = Object.freeze({
  name: 'You',
  color: '#38f5c8',
  dark: '#0b5f4e',
});

export const AI_SKINS = Object.freeze([
  { name: 'Vyper', color: '#ff5d8f', dark: '#6d1934' },
  { name: 'Cobalt', color: '#5b8cff', dark: '#1c3475' },
  { name: 'Ember', color: '#ff9f45', dark: '#6f4111' },
  { name: 'Mamba', color: '#b47cff', dark: '#3e2570' },
  { name: 'Krait', color: '#ffe45e', dark: '#6f610f' },
]);

/** Head positions (as a fraction of the board) used at round start. */
export const SPAWN_SLOTS = Object.freeze([
  { fx: 0.18, fy: 0.5, dir: 'right' },
  { fx: 0.82, fy: 0.5, dir: 'left' },
  { fx: 0.5, fy: 0.16, dir: 'down' },
  { fx: 0.5, fy: 0.84, dir: 'up' },
  { fx: 0.24, fy: 0.18, dir: 'right' },
  { fx: 0.76, fy: 0.82, dir: 'left' },
]);

export const STORAGE_KEY = 'serpent-arena/v1';
