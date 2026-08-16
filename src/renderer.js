import { GRID, CELL, COUNTDOWN, FOOD_TYPES } from './config.js';
import { DIRS } from './board.js';

const W = GRID.cols * CELL;
const H = GRID.rows * CELL;
const TAU = Math.PI * 2;

/**
 * Canvas painter. Draws the world at a fixed logical resolution (W x H) and
 * lets CSS scale it, so layout never has to care about the grid size.
 *
 * Snakes are drawn as one continuous rounded polyline rather than as a row of
 * squares, and the head/tail endpoints are interpolated with the tick
 * accumulator so movement looks smooth at 60fps despite a ~10Hz simulation.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.bg = document.createElement('canvas');
    this.dpr = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (dpr === this.dpr) return;
    this.dpr = dpr;
    for (const canvas of [this.canvas, this.bg]) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paintBackground();
  }

  /** The arena floor never changes, so it is painted once into an offscreen canvas. */
  paintBackground() {
    const ctx = this.bg.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const base = ctx.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#0a1120');
    base.addColorStop(0.5, '#070c17');
    base.addColorStop(1, '#0b1020');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    glow.addColorStop(0, 'rgba(56,245,200,0.055)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(148,180,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < GRID.cols; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, H);
    }
    for (let y = 1; y < GRID.rows; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(W, y * CELL + 0.5);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(120,160,255,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  draw(game, time) {
    const ctx = this.ctx;
    ctx.drawImage(this.bg, 0, 0, W, H);

    this.drawFood(game, time);

    for (const snake of game.snakes) {
      if (!snake.alive || snake.length === 0 || snake.isPlayer) continue;
      this.drawSnake(snake, game, time);
    }
    if (game.player.alive && game.player.length) {
      this.drawSnake(game.player, game, time);
    }

    this.drawParticles(game);
    if (game.countdown > 0) this.drawCountdown(game);
  }

  drawFood(game, time) {
    const ctx = this.ctx;
    ctx.save();
    for (const item of game.food.values()) {
      const type = FOOD_TYPES[item.type];
      const cx = item.x * CELL + CELL / 2;
      const cy = item.y * CELL + CELL / 2;
      const pulse = 1 + Math.sin(time / 260 + item.seed) * 0.15;
      const r = CELL * type.radius * pulse;

      ctx.shadowColor = type.color;
      ctx.shadowBlur = item.type === 'remains' ? 18 : 12;
      ctx.fillStyle = type.color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();

      if (item.type === 'remains') {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3.5, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawSnake(snake, game, time) {
    const ctx = this.ctx;
    const parts = this.polylines(snake, game.board, game.alpha);
    const headPoint = parts[0][0];

    const tailPart = parts[parts.length - 1];
    const tailPoint = tailPart[tailPart.length - 1];
    let body = snake.color;
    if (headPoint.x !== tailPoint.x || headPoint.y !== tailPoint.y) {
      const grad = ctx.createLinearGradient(headPoint.x, headPoint.y, tailPoint.x, tailPoint.y);
      grad.addColorStop(0, snake.color);
      grad.addColorStop(1, snake.dark);
      body = grad;
    }

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Outline pass keeps overlapping snakes readable against each other.
    ctx.strokeStyle = snake.dark;
    ctx.lineWidth = CELL * 0.88;
    for (const part of parts) this.tracePath(part, ctx.lineWidth);

    if (snake.isPlayer) {
      ctx.shadowColor = snake.color;
      ctx.shadowBlur = 16;
    }
    ctx.strokeStyle = body;
    ctx.lineWidth = CELL * 0.58;
    for (const part of parts) this.tracePath(part, ctx.lineWidth);
    ctx.restore();

    this.drawHead(snake, game, headPoint, time);
  }

  tracePath(points, width) {
    const ctx = this.ctx;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, width / 2, 0, TAU);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  drawHead(snake, game, point, time) {
    const ctx = this.ctx;
    const dir =
      snake.length > 1 ? game.board.delta(snake.body[1], snake.body[0]) : DIRS[snake.dir];

    ctx.save();
    if (snake.isPlayer) {
      // A soft ring so you can always find yourself in a crowded arena.
      const pulse = 1 + Math.sin(time / 300) * 0.08;
      ctx.strokeStyle = 'rgba(56,245,200,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, CELL * 0.78 * pulse, 0, TAU);
      ctx.stroke();
    }

    ctx.fillStyle = snake.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, CELL * 0.42, 0, TAU);
    ctx.fill();

    const px = -dir.y;
    const py = dir.x;
    for (const side of [-1, 1]) {
      const ex = point.x + dir.x * CELL * 0.13 + px * side * CELL * 0.19;
      const ey = point.y + dir.y * CELL * 0.13 + py * side * CELL * 0.19;
      ctx.fillStyle = '#f7fbff';
      ctx.beginPath();
      ctx.arc(ex, ey, CELL * 0.12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#0a0f1c';
      ctx.beginPath();
      ctx.arc(ex + dir.x * CELL * 0.045, ey + dir.y * CELL * 0.045, CELL * 0.062, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Convert a snake body into one or more polylines in pixel space.
   * Splits wherever consecutive cells are not neighbours, which is what happens
   * when a snake straddles the edge in wrap mode.
   */
  polylines(snake, board, alpha) {
    const t = alpha;
    const points = snake.body.map((c) => ({
      x: c.x * CELL + CELL / 2,
      y: c.y * CELL + CELL / 2,
    }));

    // The head slides out of the cell behind it over the course of one tick.
    const headDir =
      snake.length > 1 ? board.delta(snake.body[1], snake.body[0]) : DIRS[snake.dir];
    points[0] = {
      x: points[0].x - headDir.x * (1 - t) * CELL,
      y: points[0].y - headDir.y * (1 - t) * CELL,
    };

    // ...and the tail retracts out of the cell it just left.
    if (snake.lastTail) {
      const last = snake.body[snake.length - 1];
      const tailDir = board.delta(last, snake.lastTail);
      points.push({
        x: last.x * CELL + CELL / 2 + tailDir.x * (1 - t) * CELL,
        y: last.y * CELL + CELL / 2 + tailDir.y * (1 - t) * CELL,
      });
    }

    const parts = [];
    let current = [points[0]];
    const limit = CELL * 1.7;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (Math.abs(a.x - b.x) > limit || Math.abs(a.y - b.y) > limit) {
        parts.push(current);
        current = [b];
      } else {
        current.push(b);
      }
    }
    parts.push(current);
    return parts;
  }

  drawParticles(game) {
    const ctx = this.ctx;
    ctx.save();
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCountdown(game) {
    const ctx = this.ctx;
    const slice = COUNTDOWN / 3;
    const n = Math.max(1, Math.ceil(game.countdown / slice));
    const withinStep = (game.countdown % slice) / slice; // 1 -> 0 across each beat
    const scale = 1.35 - withinStep * 0.35;

    ctx.save();
    ctx.fillStyle = 'rgba(5,8,16,0.45)';
    ctx.fillRect(0, 0, W, H);

    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, 0.35 + withinStep);
    ctx.fillStyle = '#e8fbff';
    ctx.shadowColor = '#38f5c8';
    ctx.shadowBlur = 30;
    ctx.font = '700 92px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }
}
