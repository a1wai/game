import { WORLD, SNAKE, COUNTDOWN } from './config.js';
import { TAU, clamp, mulberry32 } from './utils.js';

/**
 * Canvas painter.
 *
 * The look is illustrated paper rather than arcade neon: an off-white sheet,
 * pale watercolour washes, a faint dot lattice and a grain overlay. Everything
 * that moves is drawn as translucent glass — bodies let the background through,
 * and only a few things (pellets, boosting snakes, the rim) carry a soft halo.
 */

const PAPER = '#e9edf4';
const ARENA = '#fcfdff';
const DOT = 'rgba(38, 54, 82, 0.075)';
const INK = 'rgba(48, 63, 92, 0.62)';
const RIM = 'rgba(196, 108, 88, 1)';

const WASH = [
  'rgba(255, 214, 199, ALPHA)',
  'rgba(199, 226, 246, ALPHA)',
  'rgba(214, 240, 213, ALPHA)',
  'rgba(230, 220, 246, ALPHA)',
  'rgba(255, 240, 209, ALPHA)',
  'rgba(252, 216, 228, ALPHA)',
];

const DOT_SPACING = 96;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.width = 0;
    this.height = 0;

    this.washes = buildWashes();
    this.washGradients = null; // built lazily, once, in world space
    this.glows = new Map(); // colour -> unit-radius radial gradient
    this.grain = null;
    this.grainPattern = null;
  }

  resize(width, height) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  draw(game, camera, time) {
    const ctx = this.ctx;
    const { width, height, dpr } = this;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    this.drawArena(ctx, camera, time);
    this.drawFood(game, camera, time);
    this.drawSnakes(game, camera, time);
    this.drawParticles(game);
    this.drawRim(ctx, time);

    ctx.restore();

    this.drawGrain(ctx);
    this.drawMinimap(ctx, game);
    if (game.countdown > 0) this.drawCountdown(ctx, game);
  }

  /* ------------------------------------------------------------------ *
   * background
   * ------------------------------------------------------------------ */

  drawArena(ctx, camera, time) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, WORLD.radius, 0, TAU);
    ctx.fillStyle = ARENA;
    ctx.fill();
    ctx.clip();

    // Watercolour washes — built once in world space, so they scroll with the map.
    if (!this.washGradients) {
      this.washGradients = this.washes.map((w) => {
        const grad = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.radius);
        grad.addColorStop(0, w.color.replace('ALPHA', w.alpha.toFixed(2)));
        grad.addColorStop(0.65, w.color.replace('ALPHA', (w.alpha * 0.45).toFixed(2)));
        grad.addColorStop(1, w.color.replace('ALPHA', '0'));
        return { grad, ...w };
      });
    }
    const view = camera.visibleRect(220);
    for (const wash of this.washGradients) {
      if (
        wash.x + wash.radius < view.minX ||
        wash.x - wash.radius > view.maxX ||
        wash.y + wash.radius < view.minY ||
        wash.y - wash.radius > view.maxY
      ) {
        continue;
      }
      ctx.fillStyle = wash.grad;
      ctx.fillRect(
        wash.x - wash.radius,
        wash.y - wash.radius,
        wash.radius * 2,
        wash.radius * 2,
      );
    }

    this.drawDots(ctx, view);
    ctx.restore();
  }

  drawDots(ctx, view) {
    const startX = Math.floor(view.minX / DOT_SPACING) * DOT_SPACING;
    const startY = Math.floor(view.minY / DOT_SPACING) * DOT_SPACING;
    ctx.fillStyle = DOT;
    ctx.beginPath();
    for (let x = startX; x <= view.maxX; x += DOT_SPACING) {
      for (let y = startY; y <= view.maxY; y += DOT_SPACING) {
        ctx.moveTo(x + 1.8, y);
        ctx.arc(x, y, 1.8, 0, TAU);
      }
    }
    ctx.fill();
  }

  /** A soft warning band and a hairline where the world stops. */
  drawRim(ctx, time) {
    const band = ctx.createRadialGradient(
      0,
      0,
      WORLD.radius - WORLD.edgeWarning,
      0,
      0,
      WORLD.radius,
    );
    band.addColorStop(0, 'rgba(196, 108, 88, 0)');
    band.addColorStop(1, 'rgba(196, 108, 88, 0.16)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, WORLD.radius, 0, TAU);
    ctx.fillStyle = band;
    ctx.fill();

    const pulse = 0.34 + Math.sin(time / 900) * 0.06;
    ctx.strokeStyle = RIM.replace('1)', `${pulse.toFixed(2)})`);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  drawGrain(ctx) {
    if (!this.grainPattern) {
      this.grain = buildGrain();
      this.grainPattern = ctx.createPattern(this.grain, 'repeat');
    }
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   * food
   * ------------------------------------------------------------------ */

  glowFor(ctx, color) {
    let grad = this.glows.get(color);
    if (!grad) {
      grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      grad.addColorStop(0, hexToRgba(color, 0.42));
      grad.addColorStop(0.45, hexToRgba(color, 0.16));
      grad.addColorStop(1, hexToRgba(color, 0));
      this.glows.set(color, grad);
    }
    return grad;
  }

  drawFood(game, camera, time) {
    const ctx = this.ctx;
    const view = camera.visibleRect(40);

    for (const item of game.food) {
      if (item.x < view.minX || item.x > view.maxX || item.y < view.minY || item.y > view.maxY) {
        continue;
      }
      const pulse = 1 + Math.sin(time / 420 + item.seed) * 0.12;
      const r = item.radius * pulse;

      // Soft halo — this is the "glow", kept gentle so it reads as light, not neon.
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.scale(r * 3.1, r * 3.1);
      ctx.fillStyle = this.glowFor(ctx, item.color);
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.globalAlpha = 0.62;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(item.x, item.y, r, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(item.x - r * 0.3, item.y - r * 0.34, r * 0.28, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ------------------------------------------------------------------ *
   * snakes
   * ------------------------------------------------------------------ */

  drawSnakes(game, camera, time) {
    for (const snake of game.snakes) {
      if (!snake.alive || snake.path.length < 2 || snake.isPlayer) continue;
      this.drawSnake(snake, camera, time);
    }
    if (game.player.alive && game.player.path.length >= 2) {
      this.drawSnake(game.player, camera, time);
    }
  }

  drawSnake(snake, camera, time) {
    const ctx = this.ctx;
    const points = snake.outline();
    const r = snake.radius;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    };

    // 1. Grounding shadow, so the glass body sits on the paper.
    ctx.save();
    ctx.translate(0, r * 0.34);
    ctx.strokeStyle = 'rgba(43, 58, 86, 0.10)';
    ctx.lineWidth = r * 2;
    trace();
    ctx.restore();

    // 2. Halo. Always soft; brighter while boosting.
    ctx.globalAlpha = snake.boosting ? 0.3 + Math.sin(time / 90) * 0.06 : 0.16;
    ctx.strokeStyle = snake.soft;
    ctx.lineWidth = r * 2 + (snake.boosting ? 22 : 13);
    trace();

    // 3. Glass body: a stronger rim colour with a softer fill inside it.
    ctx.globalAlpha = 0.58;
    ctx.strokeStyle = snake.color;
    ctx.lineWidth = r * 2;
    trace();

    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = snake.soft;
    ctx.lineWidth = Math.max(2, r * 2 - 5.5);
    trace();

    // 4. Specular line down the middle.
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, r * 0.62);
    trace();

    ctx.globalAlpha = 1;
    this.drawHead(snake, camera, time);
  }

  drawHead(snake, camera, time) {
    const ctx = this.ctx;
    const r = snake.radius;
    const cos = Math.cos(snake.angle);
    const sin = Math.sin(snake.angle);

    if (snake.isPlayer) {
      const pulse = 1 + Math.sin(time / 420) * 0.05;
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = snake.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(snake.x, snake.y, r * 1.75 * pulse, 0, TAU);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = snake.color;
    ctx.beginPath();
    ctx.arc(snake.x, snake.y, r * 1.04, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = snake.soft;
    ctx.beginPath();
    ctx.arc(snake.x, snake.y, r * 0.82, 0, TAU);
    ctx.fill();

    // Glass highlight, up and to the left like a lit sphere.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(snake.x - r * 0.3, snake.y - r * 0.36, r * 0.3, 0, TAU);
    ctx.fill();

    // Eyes, looking where the snake is going.
    const px = -sin;
    const py = cos;
    ctx.globalAlpha = 1;
    for (const side of [-1, 1]) {
      const ex = snake.x + cos * r * 0.34 + px * side * r * 0.52;
      const ey = snake.y + sin * r * 0.34 + py * side * r * 0.52;
      ctx.fillStyle = '#fdfeff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.29, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(38, 50, 74, 0.9)';
      ctx.beginPath();
      ctx.arc(ex + cos * r * 0.1, ey + sin * r * 0.1, r * 0.15, 0, TAU);
      ctx.fill();
    }

    // Name tag — keeps a constant size on screen regardless of zoom.
    const scale = 1 / camera.zoom;
    ctx.save();
    ctx.translate(snake.x, snake.y + r * 2.5);
    ctx.scale(scale, scale);
    ctx.font = '600 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = INK;
    ctx.fillText(snake.name, 0, 0);
    ctx.restore();
  }

  drawParticles(game) {
    const ctx = this.ctx;
    for (const p of game.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1) * 0.6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * screen-space overlays
   * ------------------------------------------------------------------ */

  drawMinimap(ctx, game) {
    const size = Math.min(96, Math.max(64, this.width * 0.08));
    const margin = 18;
    const cx = this.width - margin - size / 2;
    const cy = this.height - margin - size / 2;
    const scale = size / 2 / WORLD.radius;

    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(48, 63, 92, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.globalAlpha = 1;
    for (const snake of game.snakes) {
      if (!snake.alive) continue;
      ctx.fillStyle = snake.color;
      ctx.globalAlpha = snake.isPlayer ? 1 : 0.65;
      ctx.beginPath();
      ctx.arc(cx + snake.x * scale, cy + snake.y * scale, snake.isPlayer ? 3.4 : 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCountdown(ctx, game) {
    const slice = COUNTDOWN / 3;
    const n = Math.max(1, Math.ceil(game.countdown / slice));
    const within = (game.countdown % slice) / slice;

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(1.3 - within * 0.3, 1.3 - within * 0.3);
    ctx.globalAlpha = Math.min(1, 0.3 + within);
    ctx.fillStyle = 'rgba(48, 63, 92, 0.72)';
    ctx.font = '700 96px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }
}

/* -------------------------------------------------------------------- *
 * one-off assets
 * -------------------------------------------------------------------- */

/** Stable pastel washes scattered across the arena. */
function buildWashes() {
  const random = mulberry32(20260818);
  const washes = [];
  for (let i = 0; i < 12; i++) {
    const angle = random() * TAU;
    const radius = Math.sqrt(random()) * WORLD.radius * 0.92;
    washes.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      radius: 420 + random() * 760,
      color: WASH[Math.floor(random() * WASH.length)],
      alpha: 0.14 + random() * 0.16,
    });
  }
  return washes;
}

/** A small tile of paper grain, repeated across the viewport. */
function buildGrain() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = mulberry32(7);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 140 + random() * 115;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 12;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const num = parseInt(full, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}
