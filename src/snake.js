import { START_LENGTH } from './config.js';
import { DIRS } from './board.js';

/**
 * A single competitor. `body[0]` is the head; cells are plain {x, y} objects.
 *
 * `growth` is a debt counter: while it is positive the tail stays put after a
 * move, which is how eating lengthens the snake over several ticks.
 * `lastTail` remembers the cell the tail just vacated so the renderer can
 * animate the retraction instead of popping a segment out of existence.
 */
export class Snake {
  constructor({ id, name, color, dark, isPlayer = false }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.dark = dark;
    this.isPlayer = isPlayer;
    /** Who steers: the AI brain, or something outside the simulation. */
    this.autopilot = !isPlayer;

    this.body = [];
    this.dir = 'right';
    this.alive = false;
    this.growth = 0;
    this.lastTail = null;

    this.score = 0;
    this.kills = 0;
    this.deaths = 0;
    this.respawnIn = 0;
  }

  get head() {
    return this.body[0];
  }

  get length() {
    return this.body.length;
  }

  /** Place the snake with its head at (x, y) and its body trailing behind. */
  spawn(x, y, dir, length = START_LENGTH) {
    const d = DIRS[dir];
    this.body = [];
    for (let i = 0; i < length; i++) {
      this.body.push({ x: x - d.x * i, y: y - d.y * i });
    }
    this.dir = dir;
    this.alive = true;
    this.growth = 0;
    this.lastTail = null;
    this.respawnIn = 0;
  }

  /** Reset the persistent stats too — used at the start of a fresh round. */
  reset() {
    this.score = 0;
    this.kills = 0;
    this.deaths = 0;
    this.body = [];
    this.alive = false;
  }
}
