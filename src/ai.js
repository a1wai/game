import { DIRS, DIR_KEYS, OPPOSITE } from './board.js';

/**
 * Opponent brain.
 *
 * For each legal first move we run a single breadth-first search that answers
 * two questions at once:
 *   1. how much open space is reachable from there (don't seal yourself in), and
 *   2. how far is the nearest pellet.
 * Space is weighted far above hunger, so the snakes behave like players who
 * want to win rather than like pellet-seeking missiles.
 *
 * @param {import('./snake.js').Snake} snake
 * @param {{board: import('./board.js').Board, blocked: Uint8Array, risky: Uint8Array,
 *          food: Set<number>, tuning: object}} ctx
 * @returns {string} direction key
 */
export function decideDirection(snake, ctx) {
  const { board, blocked, risky, food, tuning } = ctx;
  const head = snake.head;
  const candidates = [];

  for (const dir of DIR_KEYS) {
    if (snake.length > 1 && dir === OPPOSITE[snake.dir]) continue;
    const cell = board.step(head.x, head.y, dir);
    if (!cell) continue;
    const i = board.index(cell.x, cell.y);
    if (blocked[i]) continue;
    const { area, foodDist } = explore(board, cell, blocked, food, tuning.areaCap);
    candidates.push({ dir, area, foodDist, risk: risky[i] });
  }

  // Boxed in: keep going and take it on the chin.
  if (candidates.length === 0) return snake.dir;

  // The occasional bad decision is what makes them feel like opponents.
  if (Math.random() > tuning.skill) {
    return candidates[Math.floor(Math.random() * candidates.length)].dir;
  }

  const needed = snake.length + tuning.safety;
  let best = candidates[0];
  let bestScore = -Infinity;

  for (const c of candidates) {
    let score = Math.min(c.area, needed) * 12;
    if (c.area < needed) score -= 260; // cul-de-sac
    score -= c.risk * tuning.riskWeight; // a rival head could arrive here
    score += c.foodDist === Infinity ? -70 : -c.foodDist * tuning.hunger;
    score += Math.random() * tuning.jitter;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best.dir;
}

/**
 * Flood fill from `start`, stopping once `cap` cells have been seen.
 * Returns the reachable area and the step distance to the closest pellet.
 */
function explore(board, start, blocked, food, cap) {
  const seen = new Set();
  const queue = [start.x, start.y, 0];
  seen.add(board.index(start.x, start.y));

  let area = 0;
  let foodDist = Infinity;

  for (let qi = 0; qi < queue.length; qi += 3) {
    const x = queue[qi];
    const y = queue[qi + 1];
    const dist = queue[qi + 2];
    area++;

    if (foodDist === Infinity && food.has(board.index(x, y))) foodDist = dist;
    if (area >= cap) break;

    for (const dir of DIR_KEYS) {
      const d = DIRS[dir];
      let nx = x + d.x;
      let ny = y + d.y;
      if (board.wrap) {
        nx = (nx + board.cols) % board.cols;
        ny = (ny + board.rows) % board.rows;
      } else if (!board.inBounds(nx, ny)) {
        continue;
      }
      const ni = board.index(nx, ny);
      if (blocked[ni] || seen.has(ni)) continue;
      seen.add(ni);
      queue.push(nx, ny, dist + 1);
    }
  }

  return { area, foodDist };
}
