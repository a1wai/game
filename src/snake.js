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
 *
 * Rendering never allocates either: the previous step's pose is kept so the
 * renderer can interpolate between steps, and the body is traced straight into
 * a Path2D rather than built into an array first.
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

    // Pose at the end of the previous step, for render interpolation.
    this.prevX = 0;
    this.prevY = 0;
    this.prevAngle = 0;

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

    // Conservative bounding box, refreshed periodically for view culling.
    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
  }

  /** Body half-width. Grows with length, but sub-linearly so giants stay agile. */
  get radius() {
    const extra = Math.max(0, this.length - SNAKE.startLength);
    return Math.min(SNAKE.maxRadius, SNAKE.baseRadius + Math.sqrt(extra) * SNAKE.radiusGrowth);
  }

  spawn(x, y, angle) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.angle = angle;
    this.prevAngle = angle;
    this.targetAngle = angle;
    this.length = SNAKE.startLength;
    this.alive = true;
    this.wantsBoost = false;
    this.boosting = false;
    this.crumbTimer = 0;
    this.respawnIn = 0;

    // Lay the starting body out behind the head so it looks travelled-in.
    this.path = [];
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
    this.updateBounds();
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

  /** Steer, move, and record the trail. */
  advance(dt, speedScale = 1) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevAngle = this.angle;

    const boosting = this.wantsBoost && this.length > SNAKE.minBoostLength;
    this.boosting = boosting;

    const turnRate = boosting ? SNAKE.boostTurnRate : SNAKE.turnRate;
    this.angle = turnToward(this.angle, this.targetAngle, turnRate * dt);
    if (this.angle > Math.PI) this.angle -= TAU;
    else if (this.angle < -Math.PI) this.angle += TAU;

    this.speed = (boosting ? SNAKE.boostSpeed : SNAKE.speed) * speedScale;
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    this.recordPath();
  }

  recordPath() {
    const head = this.path[0];
    if (!head) {
      this.path.unshift({ x: this.x, y: this.y, s: this.id });
      return;
    }
    const dx = this.x - head.x;
    const dy = this.y - head.y;
    const step = Math.sqrt(dx * dx + dy * dy);
    if (step >= SNAKE.pathStep) {
      this.path.unshift({ x: this.x, y: this.y, s: this.id });
      this.pathLength += step;
    }
    this.trim();
  }

  /**
   * Drop trail points the body has outgrown. The live head-to-path[0] stub
   * counts toward the total, so the stored trail matches what gets drawn to
   * within one step — you can't be killed by a tail that isn't on screen.
   */
  trim() {
    const head = this.path[0];
    if (!head) return;
    const hdx = this.x - head.x;
    const hdy = this.y - head.y;
    const stub = Math.sqrt(hdx * hdx + hdy * hdy);

    while (this.path.length > 2) {
      const a = this.path[this.path.length - 1];
      const b = this.path[this.path.length - 2];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const seg = Math.sqrt(dx * dx + dy * dy);
      if (this.pathLength + stub - seg < this.length) break;
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

  /** Cheap conservative box around the whole body, for view culling. */
  updateBounds() {
    let minX = this.x;
    let maxX = this.x;
    let minY = this.y;
    let maxY = this.y;
    for (let i = 0; i < this.path.length; i += 8) {
      const p = this.path[i];
      if (p.x < minX) minX = p.x;
      else if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      else if (p.y > maxY) maxY = p.y;
    }
    this.minX = minX;
    this.minY = minY;
    this.maxX = maxX;
    this.maxY = maxY;
  }

  /**
   * Trace the body centreline into a Path2D, from an interpolated head back
   * along exactly `length` of trail. Allocates nothing.
   *
   * @param {Path2D} path
   * @param {number} hx interpolated head x
   * @param {number} hy interpolated head y
   * @param {number} stride skip trail points when they'd land sub-pixel apart
   */
  traceInto(path, hx, hy, stride = 1) {
    const points = this.path;
    if (points.length === 0) return;

    path.moveTo(hx, hy);

    // Interpolating the head backwards can leave it behind the newest trail
    // point; skip anything that now sits in front of it.
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    let start = 0;
    while (
      start < points.length - 1 &&
      (points[start].x - hx) * cos + (points[start].y - hy) * sin > 0
    ) {
      start++;
    }

    let remaining = this.length;
    let px = hx;
    let py = hy;

    for (let i = start; i < points.length; i += stride) {
      const p = points[i];
      const dx = p.x - px;
      const dy = p.y - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= remaining) {
        const t = d > 0 ? remaining / d : 0;
        path.lineTo(px + dx * t, py + dy * t);
        return;
      }
      path.lineTo(p.x, p.y);
      remaining -= d;
      px = p.x;
      py = p.y;
    }
  }
}
