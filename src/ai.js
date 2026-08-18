import { WORLD, SNAKE } from './config.js';
import { TAU, angleDiff, randRange } from './utils.js';

/**
 * Rival brain — a steering behaviour, not a path planner.
 *
 * Each step it fans out a handful of candidate headings, probes along each one
 * for bodies and for the arena rim, and scores them against where it wants to
 * go. Survival outweighs appetite, so rivals arc around obstacles instead of
 * driving through them, and the whole thing costs a few dozen grid lookups.
 */

const FAN = [-0.95, -0.62, -0.34, -0.14, 0, 0.14, 0.34, 0.62, 0.95];
const PROBES = [
  { at: 0.35, weight: 3.2 },
  { at: 0.7, weight: 1.9 },
  { at: 1, weight: 1 },
];

export function steerRival(snake, ctx, dt) {
  const { bodyGrid, foodGrid, snakes, tuning } = ctx;

  const target = chooseTarget(snake, ctx);
  const targetAngle = target ? Math.atan2(target.y - snake.y, target.x - snake.x) : snake.angle;

  let bestAngle = snake.angle;
  let bestScore = -Infinity;

  for (const offset of FAN) {
    const angle = snake.angle + offset;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let score = 0;

    for (const probe of PROBES) {
      const reach = tuning.lookahead * probe.at;
      const px = snake.x + cos * reach;
      const py = snake.y + sin * reach;

      // Something solid in the way?
      const clearance = snake.radius + 18;
      const blocked = bodyGrid.forEachNear(px, py, clearance, (point) => {
        if (point.s === snake.id) return null; // a snake never blocks itself
        const dx = point.x - px;
        const dy = point.y - py;
        return dx * dx + dy * dy < clearance * clearance ? point : null;
      });
      if (blocked) score -= tuning.caution * probe.weight;

      // The rim is just as fatal as a rival.
      const fromCentre = Math.hypot(px, py);
      if (fromCentre > WORLD.radius - WORLD.edgeWarning * 0.5) {
        score -= tuning.caution * probe.weight * 1.5;
      }
    }

    // Pull toward whatever we're currently interested in.
    score += Math.cos(angleDiff(angle, targetAngle)) * tuning.hunger;
    // Mild preference for holding a line — keeps them from wiggling.
    score -= Math.abs(offset) * 3;
    score += Math.random() * tuning.jitter;

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }

  snake.targetAngle = bestAngle;

  // Boost in bursts: to close on a cut-off, or to break away from trouble.
  snake.boostTimer = (snake.boostTimer ?? 0) - dt;
  if (snake.boostTimer <= 0) {
    const wantsChase = snake.chaseUntil > 0 && Math.random() < tuning.boost;
    snake.wantsBoost = wantsChase && snake.length > SNAKE.minBoostLength * 1.4;
    snake.boostTimer = snake.wantsBoost ? randRange(0.4, 1.1) : randRange(0.6, 2.2);
  }
}

/**
 * What the snake is heading for right now: a rival worth cutting off, the
 * nearest pellet, or — if the arena is empty around it — a wander point.
 */
function chooseTarget(snake, ctx) {
  const { foodGrid, snakes, tuning } = ctx;

  snake.chaseUntil = (snake.chaseUntil ?? 0) - ctx.dt;

  // Aggression: aim at where a smaller rival is about to be, not where it is.
  if (snake.chaseUntil <= 0 && Math.random() < tuning.aggression * ctx.dt * 2) {
    const prey = nearestPrey(snake, snakes);
    if (prey) {
      snake.chaseUntil = randRange(1.2, 2.6);
      snake.chaseId = prey.id;
    }
  }
  if (snake.chaseUntil > 0) {
    const prey = snakes.find((s) => s.id === snake.chaseId && s.alive);
    if (prey) {
      const lead = 90 + Math.hypot(prey.x - snake.x, prey.y - snake.y) * 0.25;
      return { x: prey.x + Math.cos(prey.angle) * lead, y: prey.y + Math.sin(prey.angle) * lead };
    }
    snake.chaseUntil = 0;
  }

  // Otherwise: the closest pellet within sight.
  let best = null;
  let bestDist = Infinity;
  foodGrid.forEachNear(snake.x, snake.y, 340, (item) => {
    const d = (item.x - snake.x) ** 2 + (item.y - snake.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
    return null;
  });
  if (best) return best;

  // Nothing nearby — pick a spot and cruise, refreshed every couple of seconds.
  snake.wanderUntil = (snake.wanderUntil ?? 0) - ctx.dt;
  if (!snake.wander || snake.wanderUntil <= 0) {
    const angle = Math.random() * TAU;
    const radius = Math.random() * WORLD.radius * 0.8;
    snake.wander = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    snake.wanderUntil = randRange(2, 4.5);
  }
  return snake.wander;
}

function nearestPrey(snake, snakes) {
  let best = null;
  let bestDist = 420 * 420;
  for (const other of snakes) {
    if (!other.alive || other === snake) continue;
    if (other.length > snake.length * 0.95) continue; // don't pick fights we lose
    const d = (other.x - snake.x) ** 2 + (other.y - snake.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}
