import { SNAKE } from './config.js';
import { TAU, clamp, turnToward } from './utils.js';

/**
 * A snake is a head with a trail. The body isn't a list of segments — it's the
 * path the head has already travelled, trimmed to the snake's current length.
 * Eating extends the length; boosting burns it.
 *
 * `path[0]` is the most recent recorded point. Points are plain {x, y, s}
 * objects where `s` is the owner id, so the collision grid can store the very
 * same objects without allocating anything per frame.
 */
export class Snake {
  constructor({ id, name, color, soft, isPlayer = false }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.soft = soft;
    this.isPlayer = isPlayer;
    /** Who steers: the rival brain, or something outside the simulation. */
    this.autopilot = !isPlayer;

    this.x = 0;
    this.y = 0;
    this.angle = 0;
    this.targetAngle = 0;
    this.path = [];
    this.pathLength = 0;
    this.length = SNAKE.startLength;

    this.alive = false;
    this.wantsBoost = false;
    this.boosting = false;
    this.crumbTimer = 0;

    this.score = 0;
    /** Fractional part of an in-progress boost drain; score itself stays whole. */
    this.scoreDebt = 0;
    this.kills = 0;
    this.deaths = 0;
    this.respawnIn = 0;
  }

  /** Body half-width. Grows with length, but sub-linearly so giants stay agile. */
  get radius() {
    const extra = Math.max(0, this.length - SNAKE.startLength);
    return Math.min(SNAKE.maxRadius, SNAKE.baseRadius + Math.sqrt(extra) * SNAKE.radiusGrowth);
  }

  spawn(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.targetAngle = angle;
    this.length = SNAKE.startLength;
    this.alive = true;
    this.wantsBoost = false;
    this.boosting = false;
    this.crumbTimer = 0;
    this.respawnIn = 0;

    // Lay the starting body out behind the head so it looks travelled-in.
    this.path = [];
    this.pathLength = 0;
    const back = { x: -Math.cos(angle), y: -Math.sin(angle) };
    const points = Math.ceil(this.length / SNAKE.pathStep);
    for (let i = 0; i < points; i++) {
      this.path.push({
        x: x + back.x * i * SNAKE.pathStep,
        y: y + back.y * i * SNAKE.pathStep,
        s: this.id,
      });
    }
    this.pathLength = (points - 1) * SNAKE.pathStep;
  }

  reset() {
    this.score = 0;
    this.scoreDebt = 0;
    this.kills = 0;
    this.deaths = 0;
    this.alive = false;
    this.path = [];
    this.pathLength = 0;
    this.length = SNAKE.startLength;
  }

  /** Steer, move, and record the trail. Returns true if boost actually engaged. */
  advance(dt, speedScale = 1) {
    const boosting = this.wantsBoost && this.length > SNAKE.minBoostLength;
    this.boosting = boosting;

    const turnRate = boosting ? SNAKE.boostTurnRate : SNAKE.turnRate;
    this.angle = turnToward(this.angle, this.targetAngle, turnRate * dt);
    if (this.angle > Math.PI) this.angle -= TAU;
    else if (this.angle < -Math.PI) this.angle += TAU;

    const speed = (boosting ? SNAKE.boostSpeed : SNAKE.speed) * speedScale;
    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;

    this.recordPath();
    return boosting;
  }

  recordPath() {
    const head = this.path[0];
    if (!head) {
      this.path.unshift({ x: this.x, y: this.y, s: this.id });
      return;
    }
    const step = Math.hypot(this.x - head.x, this.y - head.y);
    if (step >= SNAKE.pathStep) {
      this.path.unshift({ x: this.x, y: this.y, s: this.id });
      this.pathLength += step;
    }
    this.trim();
  }

  /** Drop trail points the body has outgrown. */
  trim() {
    while (this.path.length > 2) {
      const a = this.path[this.path.length - 1];
      const b = this.path[this.path.length - 2];
      const seg = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pathLength - seg < this.length) break;
      this.path.pop();
      this.pathLength -= seg;
    }
  }

  grow(amount) {
    this.length += amount;
  }

  shrink(amount) {
    this.length = Math.max(SNAKE.startLength * 0.6, this.length - amount);
    this.trim();
  }

  /**
   * Body centreline from head to tail, in world space. The final point is
   * interpolated so the tail slides instead of popping a whole step at a time.
   */
  outline() {
    const points = [{ x: this.x, y: this.y }];
    for (let i = 0; i < this.path.length; i++) points.push(this.path[i]);

    const overflow = this.pathLength - this.length;
    if (overflow > 0 && points.length > 2) {
      const tail = points[points.length - 1];
      const prev = points[points.length - 2];
      const seg = Math.hypot(tail.x - prev.x, tail.y - prev.y);
      if (seg > 0.001) {
        const t = clamp(overflow / seg, 0, 1);
        points[points.length - 1] = {
          x: tail.x + (prev.x - tail.x) * t,
          y: tail.y + (prev.y - tail.y) * t,
        };
      }
    }
    return points;
  }
}
