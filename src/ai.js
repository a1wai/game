import { WORLD, SNAKE } from './config.js';
import { TAU, angleDiff, randRange } from './utils.js';

/**
 * Rival brain — a steering behaviour, not a path planner.
 *
 * The common case is simple: if the line to whatever it wants is clear, aim
 * straight at it and let the turn-rate limit do the smoothing. Only when
 * something is in the way does it fan out candidate headings, probe each one,
 * and take the best compromise. Doing it the other way round — always picking
 * from a fan — makes snakes saw back and forth, because the smallest offset the
 * fan can offer is still a hard turn.
 */

const FAN = [-1.15, -0.8, -0.5, -0.28, 0, 0.28, 0.5, 0.8, 1.15];

const PROBES = [
  { at: 0.35, weight: 3.2 },
  { at: 0.7, weight: 1.9 },
  { at: 1, weight: 1 },
];

export function steerRival(snake, ctx, dt) {
  const tuning = personalise(snake, ctx.tuning);
  ctx.tuned = tuning;

  const target = chooseTarget(snake, ctx);
  const bearing = target ? Math.atan2(target.y - snake.y, target.x - snake.x) : snake.angle;

  if (dangerAlong(snake, bearing, ctx) === 0) {
    // Clear run: commit to the real bearing and glide onto it.
    snake.targetAngle = bearing;
  } else {
    let bestAngle = snake.angle;
    let bestScore = -Infinity;
    for (const offset of FAN) {
      const angle = snake.angle + offset;
      let score = -dangerAlong(snake, angle, ctx) * tuning.caution;
      score += Math.cos(angleDiff(angle, bearing)) * tuning.hunger;
      score -= Math.abs(offset) * 11; // hold a line unless there's a reason not to
      score += Math.random() * tuning.jitter;
      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
      }
    }
    snake.targetAngle = bestAngle;
  }

  // Boost in bursts, to close on a cut-off.
  snake.boostTimer = (snake.boostTimer ?? 0) - dt;
  if (snake.boostTimer <= 0) {
    const chasing = snake.chaseUntil > 0 && Math.random() < tuning.boost;
    snake.wantsBoost = chasing && snake.length > SNAKE.minBoostLength * 1.4;
    snake.boostTimer = snake.wantsBoost ? randRange(0.4, 1.1) : randRange(0.6, 2.2);
  }
}

/**
 * Fold the snake's personality into the difficulty tuning. The result is cached
 * on the snake so this runs every step without allocating.
 */
function personalise(snake, base) {
  const type = snake.archetype;
  if (!type) return base;
  const t = snake.tuned ?? (snake.tuned = {});
  t.caution = base.caution * type.caution;
  t.hunger = base.hunger;
  t.aggression = base.aggression * type.aggression;
  t.lookahead = base.lookahead * type.lookahead;
  t.jitter = base.jitter * (type.id === 'weaver' ? 3.5 : 1);
  t.boost = base.boost * type.boost;
  return t;
}

/** Weighted count of trouble along a heading: bodies first, then the rim. */
function dangerAlong(snake, angle, ctx) {
  const { bodyGrid } = ctx;
  const tuning = ctx.tuned ?? ctx.tuning;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const clearance = snake.radius + 18;
  const rimLimit = WORLD.radius - WORLD.edgeWarning * 0.5;
  let danger = 0;

  for (const probe of PROBES) {
    const reach = tuning.lookahead * probe.at;
    const px = snake.x + cos * reach;
    const py = snake.y + sin * reach;

    const blocked = bodyGrid.forEachNear(px, py, clearance, (point) => {
      if (point.s === snake.id) return null; // a snake never blocks itself
      const dx = point.x - px;
      const dy = point.y - py;
      return dx * dx + dy * dy < clearance * clearance ? point : null;
    });
    if (blocked) danger += probe.weight;
    if (px * px + py * py > rimLimit * rimLimit) danger += probe.weight * 1.5;
  }
  return danger;
}

/**
 * What the snake is heading for right now: a rival worth cutting off, the
 * nearest reachable pellet, or — if the arena is empty around it — a wander
 * point it holds for a few seconds.
 */
function chooseTarget(snake, ctx) {
  const { foodGrid, snakes, clusters } = ctx;
  const tuning = ctx.tuned ?? ctx.tuning;
  const type = snake.archetype;

  snake.chaseUntil = (snake.chaseUntil ?? 0) - ctx.dt;
  snake.targetHold = (snake.targetHold ?? 0) - ctx.dt;

  // Skittish snakes drop everything and run from anything bigger. That's what
  // makes them hard to catch — and what makes driving them at the rim work.
  if (type && type.id === 'skittish') {
    const threat = nearestThreat(snake, snakes, 560);
    if (threat) {
      return { x: snake.x + (snake.x - threat.x) * 3, y: snake.y + (snake.y - threat.y) * 3 };
    }
  }

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
      const aim = {
        x: prey.x + Math.cos(prey.angle) * lead,
        y: prey.y + Math.sin(prey.angle) * lead,
      };
      if (!unreachable(snake, aim.x, aim.y)) return aim;
    }
    snake.chaseUntil = 0;
  }

  // Stick with the current pellet for a moment. Re-picking the nearest one
  // every step makes rivals wobble between two equally good crumbs.
  if (snake.foodTarget && !snake.foodTarget.gone && snake.targetHold > 0) {
    return snake.foodTarget;
  }

  // Otherwise: the closest pellet within sight that's actually reachable.
  let best = null;
  let bestCost = Infinity;
  foodGrid.forEachNear(snake.x, snake.y, 420, (item) => {
    if (item.gone) return null;
    const dx = item.x - snake.x;
    const dy = item.y - snake.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const turn = Math.abs(angleDiff(snake.angle, Math.atan2(dy, dx)));
    const cost = distance * (1 + 1.7 * (turn / Math.PI));
    if (cost >= bestCost) return null;
    if (unreachable(snake, item.x, item.y)) return null;
    bestCost = cost;
    best = item;
    return null;
  });
  if (best) {
    snake.foodTarget = best;
    snake.targetHold = 0.55;
    return best;
  }

  // Nothing nearby — cruise. Sentinels patrol one food field and never leave it;
  // everyone else picks a fresh spot across the arena.
  snake.wanderUntil = (snake.wanderUntil ?? 0) - ctx.dt;
  if (!snake.wander || snake.wanderUntil <= 0 || unreachable(snake, snake.wander.x, snake.wander.y)) {
    if (type && type.id === 'sentinel' && clusters && clusters.length) {
      if (!snake.home) snake.home = nearestCluster(snake, clusters);
      const spread = snake.home.radius * 0.9;
      snake.wander = {
        x: snake.home.x + randRange(-spread, spread),
        y: snake.home.y + randRange(-spread, spread),
      };
      snake.wanderUntil = randRange(1.5, 3);
    } else {
      const angle = Math.random() * TAU;
      const radius = Math.random() * WORLD.radius * 0.8;
      snake.wander = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      snake.wanderUntil = randRange(2, 4.5);
    }
  }
  return snake.wander;
}

function nearestThreat(snake, snakes, range) {
  let best = null;
  let bestDist = range * range;
  for (const other of snakes) {
    if (!other.alive || other === snake) continue;
    if (other.length < snake.length * 1.05) continue; // only worry about bigger
    const d = (other.x - snake.x) ** 2 + (other.y - snake.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function nearestCluster(snake, clusters) {
  let best = clusters[0];
  let bestDist = Infinity;
  for (const cluster of clusters) {
    const d = (cluster.x - snake.x) ** 2 + (cluster.y - snake.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = cluster;
    }
  }
  return best;
}

/**
 * True when a point sits inside one of the two circles the snake would trace
 * turning as hard as it can. Such points cannot be reached by steering — a
 * snake that keeps aiming at one just orbits it forever.
 */
function unreachable(snake, tx, ty) {
  const turnRadius = SNAKE.speed / SNAKE.turnRate;
  const cos = Math.cos(snake.angle);
  const sin = Math.sin(snake.angle);
  for (let side = -1; side <= 1; side += 2) {
    const cx = snake.x - sin * side * turnRadius;
    const cy = snake.y + cos * side * turnRadius;
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx * dx + dy * dy < turnRadius * turnRadius) return true;
  }
  return false;
}

function nearestPrey(snake, snakes) {
  let best = null;
  let bestDist = 520 * 520;
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
