/** Grid geometry: indexing, stepping and wrap-aware direction math. */

export const DIRS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
});

export const DIR_KEYS = Object.freeze(Object.keys(DIRS));

export const OPPOSITE = Object.freeze({
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
});

export class Board {
  /**
   * @param {number} cols
   * @param {number} rows
   * @param {boolean} wrap true = edges teleport, false = edges kill
   */
  constructor(cols, rows, wrap = false) {
    this.cols = cols;
    this.rows = rows;
    this.size = cols * rows;
    this.wrap = wrap;
  }

  index(x, y) {
    return y * this.cols + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  /**
   * One cell along `dir` from (x, y).
   * @returns {{x:number,y:number}|null} null when the move leaves a solid-walled board.
   */
  step(x, y, dir) {
    const d = DIRS[dir];
    let nx = x + d.x;
    let ny = y + d.y;
    if (this.wrap) {
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
      return { x: nx, y: ny };
    }
    return this.inBounds(nx, ny) ? { x: nx, y: ny } : null;
  }

  /**
   * Unit vector from `from` to an adjacent `to`, shortest way around the wrap.
   * Used by the renderer so a wrapping snake doesn't smear across the board.
   */
  delta(from, to) {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    if (this.wrap) {
      if (dx > 1) dx -= this.cols;
      else if (dx < -1) dx += this.cols;
      if (dy > 1) dy -= this.rows;
      else if (dy < -1) dy += this.rows;
    }
    return { x: Math.sign(dx), y: Math.sign(dy) };
  }
}
