import { WORLD, SNAKE, FOOD, COUNTDOWN } from './config.js';
import { TAU, clamp, lerp, mulberry32 } from './utils.js';

/**
 * Canvas painter, dark build.
 *
 * Performance notes, because this runs at 60fps with sixteen snakes and a few
 * thousand pellets on screen-sized canvases:
 *   - Pellets are pre-rendered to sprites, one per colour, and blitted. No
 *     per-pellet gradients or path work.
 *   - Each body is traced once into a Path2D and stroked four times, and trail
 *     points are skipped when they'd land less than a pixel or two apart.
 *   - Snakes and pellets outside the view are culled before any drawing.
 *   - Nothing here allocates per frame: no arrays, no objects, no closures in
 *     the hot loops.
 * Positions are interpolated between simulation steps, so a 60Hz simulation
 * stays smooth on any display.
 */

const VOID = '#03050b';
const ARENA = '#070c18';
const DOT = 'rgba(150, 180, 255, 0.07)';
const INK = 'rgba(226, 238, 255, 0.7)';

/** Deep colour clouds, drawn additively so they read as light, not paint. */
const WASH = [
  'rgba(64, 118, 224, ALPHA)',
  'rgba(52, 186, 176, ALPHA)',
  'rgba(146, 96, 220, ALPHA)',
  'rgba(220, 126, 104, ALPHA)',
  'rgba(72, 156, 232, ALPHA)',
  'rgba(198, 92, 152, ALPHA)',
];

const DOT_SPACING = 130;
const DUST_SPACING = 170;
const DUST_PARALLAX = 0.55;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.width = 0;
    this.height = 0;

    this.washes = buildWashes();
    this.nebula = null;
    this.sprites = new Map();
    this.overlay = null;
    this.bloom = null;
    this.bloomCtx = null;

    /**
     * Quality auto-tunes to the machine. Bloom is gorgeous on a GPU and far too
     * expensive on a software rasteriser, so it's switched on the measured cost
     * of drawing a frame rather than assumed. Frame *interval* can't be used —
     * vsync pins it at 16.7ms and hides how much headroom is left.
     */
    this.drawCost = 4;
    this.bloomOn = true;
    this.bloomTrials = 0;
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
    this.overlay = null;

    // Quarter-resolution bloom buffer. Downscaling is the blur; scaling it back
    // up and adding it is the glow. Two blits, and it makes everything pop.
    const bw = Math.max(1, Math.round((width * dpr) / BLOOM_DIVISOR));
    const bh = Math.max(1, Math.round((height * dpr) / BLOOM_DIVISOR));
    if (!this.bloom) this.bloom = document.createElement('canvas');
    this.bloom.width = bw;
    this.bloom.height = bh;
    this.bloomCtx = this.bloom.getContext('2d');
  }

  /* ------------------------------------------------------------------ *
   * frame
   * ------------------------------------------------------------------ */

  draw(game, camera, time) {
    const started = performance.now();
    this.paint(game, camera, time);

    // Rolling average of what a frame actually costs us.
    this.drawCost += (performance.now() - started - this.drawCost) * 0.06;
    if (this.bloomOn && this.drawCost > 9 && ++this.bloomTrials > 45) {
      this.bloomOn = false; // this machine can't afford it; everything else stays
      this.bloomTrials = 0;
      this.drawCost = 4;
    }
  }

  paint(game, camera, time) {
    const ctx = this.ctx;
    const { width, height, dpr } = this;
    const alpha = game.alpha;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, width, height);

    this.drawDust(ctx, camera);

    ctx.save();
    ctx.translate(width / 2 + camera.shakeX, height / 2 + camera.shakeY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    this.drawArena(ctx, camera);
    this.drawFood(ctx, game, camera, time);
    this.drawSnakes(ctx, game, camera, time, alpha);
    this.drawParticles(ctx, game);
    this.drawShockwaves(ctx, game);
    this.drawRim(ctx, camera, time);

    ctx.restore();

    if (this.bloomOn) this.applyBloom(ctx);
    this.drawOverlay(ctx);
    this.drawOffscreenMarkers(ctx, game, camera, alpha);
    this.drawMinimap(ctx, game, camera);
    if (game.countdown > 0) this.drawCountdown(ctx, game);
  }

  /* ------------------------------------------------------------------ *
   * background
   * ------------------------------------------------------------------ */

  /** Slow-moving dust, one parallax layer behind the world, for depth. */
  drawDust(ctx, camera) {
    const { width, height, dpr } = this;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(width / 2 + camera.shakeX, height / 2 + camera.shakeY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x * DUST_PARALLAX, -camera.y * DUST_PARALLAX);

    const halfW = width / 2 / camera.zoom;
    const halfH = height / 2 / camera.zoom;
    const cx = camera.x * DUST_PARALLAX;
    const cy = camera.y * DUST_PARALLAX;
    const minX = Math.floor((cx - halfW) / DUST_SPACING);
    const maxX = Math.ceil((cx + halfW) / DUST_SPACING);
    const minY = Math.floor((cy - halfH) / DUST_SPACING);
    const maxY = Math.ceil((cy + halfH) / DUST_SPACING);

    // Three brightness tiers, one path each — cheaper than per-dot styling.
    for (let tier = 0; tier < 2; tier++) {
      ctx.fillStyle = `rgba(180, 205, 255, ${0.06 + tier * 0.06})`;
      ctx.beginPath();
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gy = minY; gy <= maxY; gy++) {
          const h = hash2(gx, gy);
          if (h % 2 !== tier) continue;
          const x = (gx + ((h >>> 8) & 255) / 255) * DUST_SPACING;
          const y = (gy + ((h >>> 16) & 255) / 255) * DUST_SPACING;
          const r = 0.8 + (((h >>> 24) & 255) / 255) * 1.7;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
      }
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * The arena floor — disc, colour clouds and rim band — is baked once into a
   * single texture and blitted. Soft gradients tolerate upscaling perfectly, so
   * this trades a few full-screen gradient fills per frame for one image copy.
   */
  drawArena(ctx, camera) {
    const R = WORLD.radius;
    if (!this.nebula) this.nebula = buildNebula(this.washes);

    const view = camera.visibleRect(0);
    const x0 = Math.max(view.minX, -R);
    const x1 = Math.min(view.maxX, R);
    const y0 = Math.max(view.minY, -R);
    const y1 = Math.min(view.maxY, R);
    if (x1 > x0 && y1 > y0) {
      const toTex = NEBULA_SIZE / (2 * R);
      ctx.drawImage(
        this.nebula,
        (x0 + R) * toTex,
        (y0 + R) * toTex,
        (x1 - x0) * toTex,
        (y1 - y0) * toTex,
        x0,
        y0,
        x1 - x0,
        y1 - y0,
      );
    }

    // The lattice stays vector so it's crisp at any zoom.
    const startX = Math.floor(view.minX / DOT_SPACING) * DOT_SPACING;
    const startY = Math.floor(view.minY / DOT_SPACING) * DOT_SPACING;
    const limit = (R - 6) * (R - 6);
    ctx.fillStyle = DOT;
    ctx.beginPath();
    for (let x = startX; x <= view.maxX; x += DOT_SPACING) {
      for (let y = startY; y <= view.maxY; y += DOT_SPACING) {
        if (x * x + y * y > limit) continue;
        ctx.moveTo(x + 1.7, y);
        ctx.arc(x, y, 1.7, 0, TAU);
      }
    }
    ctx.fill();
  }

  drawRim(ctx, camera, time) {
    const view = camera.visibleRect(0);
    const nearest = Math.min(
      Math.hypot(view.minX, view.minY),
      Math.hypot(view.maxX, view.minY),
      Math.hypot(view.minX, view.maxY),
      Math.hypot(view.maxX, view.maxY),
    );
    if (nearest > WORLD.radius) return; // the edge line is off screen

    const pulse = 0.42 + Math.sin(time / 900) * 0.08;
    ctx.strokeStyle = `rgba(240, 138, 118, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, WORLD.radius, 0, TAU);
    ctx.stroke();
  }

  /* ------------------------------------------------------------------ *
   * food
   * ------------------------------------------------------------------ */

  /** One pre-rendered sprite per colour: glow, body and highlight baked in. */
  spriteFor(color) {
    let sprite = this.sprites.get(color);
    if (sprite) return sprite;

    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');
    const mid = size / 2;
    const bodyR = mid / SPRITE_SCALE;

    const glow = c.createRadialGradient(mid, mid, 0, mid, mid, mid);
    glow.addColorStop(0, rgba(color, 0.5));
    glow.addColorStop(0.3, rgba(color, 0.18));
    glow.addColorStop(1, rgba(color, 0));
    c.fillStyle = glow;
    c.fillRect(0, 0, size, size);

    c.fillStyle = rgba(color, 0.92);
    c.beginPath();
    c.arc(mid, mid, bodyR, 0, TAU);
    c.fill();

    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.beginPath();
    c.arc(mid - bodyR * 0.3, mid - bodyR * 0.32, bodyR * 0.34, 0, TAU);
    c.fill();

    sprite = canvas;
    this.sprites.set(color, sprite);
    return sprite;
  }

  drawFood(ctx, game, camera, time) {
    const view = camera.visibleRect(60);
    const food = game.food;

    for (let i = 0; i < food.length; i++) {
      const item = food[i];
      if (item.x < view.minX || item.x > view.maxX || item.y < view.minY || item.y > view.maxY) {
        continue;
      }
      const pulse = 1 + Math.sin(time / 420 + item.seed) * 0.1;
      const size = item.radius * 2 * SPRITE_SCALE * pulse;
      ctx.drawImage(this.spriteFor(item.color), item.x - size / 2, item.y - size / 2, size, size);
    }
  }

  /* ------------------------------------------------------------------ *
   * snakes
   * ------------------------------------------------------------------ */

  drawSnakes(ctx, game, camera, time, alpha) {
    const view = camera.visibleRect(120);
    // Long snakes can move a fair way between bounds refreshes.
    const slack = SNAKE.boostSpeed * (SNAKE.boundsEvery / 60) + SNAKE.maxRadius;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const snake of game.snakes) {
      if (!snake.alive || snake.path.length < 2 || snake.isPlayer) continue;
      if (
        snake.maxX + slack < view.minX ||
        snake.minX - slack > view.maxX ||
        snake.maxY + slack < view.minY ||
        snake.minY - slack > view.maxY
      ) {
        continue;
      }
      this.drawSnake(ctx, snake, camera, time, alpha);
    }

    if (game.player.alive && game.player.path.length >= 2) {
      this.drawSnake(ctx, game.player, camera, time, alpha);
    }
  }

  drawSnake(ctx, snake, camera, time, alpha) {
    const rx = lerp(snake.prevX, snake.x, alpha);
    const ry = lerp(snake.prevY, snake.y, alpha);
    const r = snake.radius;

    // Skip trail points that would land closer than ~2px on screen.
    const stride = clamp(Math.round(2.2 / (SNAKE.pathStep * camera.zoom)), 1, 4);
    const path = new Path2D();
    snake.traceInto(path, rx, ry, stride);

    // 1. Dark casing. On a near-black floor this is what separates one snake
    //    from another where they cross, and it makes the colour read as solid.
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = CASING;
    ctx.lineWidth = r * 2 + 7;
    ctx.stroke(path);

    // 2. Halo, additive but only along the body — this is the glow that
    //    survives when bloom is off, and it swells while boosting.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = snake.boosting ? 0.3 : 0.16;
    ctx.strokeStyle = snake.soft;
    ctx.lineWidth = r * 2 + (snake.boosting ? 24 : 13);
    ctx.stroke(path);
    ctx.globalCompositeOperation = 'source-over';

    // 3. Body, at high opacity — contrast over glassiness.
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = snake.color;
    ctx.lineWidth = r * 2;
    ctx.stroke(path);

    // 4. Lighter inner band for volume.
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = snake.soft;
    ctx.lineWidth = Math.max(2, r * 1.15);
    ctx.stroke(path);

    // 5. Bright filament down the middle. This is what the bloom picks up.
    ctx.globalAlpha = snake.boosting ? 1 : 0.85;
    ctx.strokeStyle = snake.core;
    ctx.lineWidth = Math.max(1.4, r * (snake.boosting ? 0.45 : 0.32));
    ctx.stroke(path);

    ctx.globalAlpha = 1;
    this.drawHead(ctx, snake, camera, time, rx, ry, alpha);
  }

  drawHead(ctx, snake, camera, time, rx, ry, alpha) {
    const r = snake.radius;
    const angle = lerp(snake.prevAngle, snake.angle, alpha);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = CASING;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 1.16, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = snake.color;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 1.04, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = snake.core;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 0.62, 0, TAU);
    ctx.fill();

    // Boost fuel, as a ring that empties while you hold it down.
    if (snake.isPlayer) {
      const energy = snake.energy;
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = snake.soft;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx, ry, r * 2, 0, TAU);
      ctx.stroke();

      if (energy > 0) {
        ctx.globalAlpha = snake.boosting ? 1 : 0.75;
        ctx.strokeStyle = energy < 0.25 ? LOW_FUEL : snake.core;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(rx, ry, r * 2, -Math.PI / 2, -Math.PI / 2 + TAU * energy);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
    for (let side = -1; side <= 1; side += 2) {
      const ex = rx + cos * r * 0.34 - sin * side * r * 0.5;
      const ey = ry + sin * r * 0.34 + cos * side * r * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = CASING;
      ctx.beginPath();
      ctx.arc(ex + cos * r * 0.12, ey + sin * r * 0.12, r * 0.16, 0, TAU);
      ctx.fill();
    }

    // Name, and for rivals the personality you're up against.
    const scale = 1 / camera.zoom;
    ctx.save();
    ctx.translate(rx, ry + r * 2.5);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '700 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = INK;
    ctx.fillText(snake.name, 0, 0);
    if (snake.archetype) {
      ctx.font = '600 10px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = snake.soft;
      ctx.globalAlpha = 0.75;
      ctx.fillText(snake.archetype.label, 0, 14);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** Expanding rings from kills and spawns. */
  drawShockwaves(ctx, game) {
    for (const w of game.shockwaves) {
      const t = 1 - w.life / w.maxLife;
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = Math.max(1, 7 * (1 - t));
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius * (0.2 + t * 0.9), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx, game) {
    const particles = game.particles;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1) * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ *
   * screen-space overlays
   * ------------------------------------------------------------------ */

  /** Where the rivals you can't see are — essential in an arena this size. */
  drawOffscreenMarkers(ctx, game, camera, alpha) {
    const player = game.player;
    if (!player.alive) return;

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const inset = 26;
    const range = 3400;

    for (const snake of game.snakes) {
      if (!snake.alive || snake.isPlayer) continue;
      const sx = lerp(snake.prevX, snake.x, alpha);
      const sy = lerp(snake.prevY, snake.y, alpha);
      const dx = sx - camera.x;
      const dy = sy - camera.y;

      const screenX = dx * camera.zoom;
      const screenY = dy * camera.zoom;
      if (Math.abs(screenX) < halfW - inset && Math.abs(screenY) < halfH - inset) continue;

      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;

      // Push the marker onto the screen border along the same bearing.
      const scale = Math.min(
        (halfW - inset) / Math.max(1, Math.abs(screenX)),
        (halfH - inset) / Math.max(1, Math.abs(screenY)),
      );
      const mx = halfW + screenX * scale;
      const my = halfH + screenY * scale;
      const fade = clamp(1 - distance / range, 0.12, 0.75);

      ctx.globalAlpha = fade;
      ctx.fillStyle = snake.color;
      ctx.beginPath();
      ctx.arc(mx, my, 4.5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = fade * 0.35;
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Add a blurred copy of the frame back over itself. Everything bright — cores,
   * pellets, shockwaves — blooms; the near-black floor contributes almost
   * nothing, which is what keeps the contrast high.
   */
  applyBloom(ctx) {
    const bctx = this.bloomCtx;
    if (!bctx) return;
    const bw = this.bloom.width;
    const bh = this.bloom.height;

    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = 'copy'; // overwrites, so no clear needed
    bctx.drawImage(this.canvas, 0, 0, bw, bh);

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = BLOOM_STRENGTH;
    ctx.drawImage(this.bloom, 0, 0, this.width, this.height);
    ctx.restore();
  }

  /**
   * Vignette and film grain never change, so they're baked into one screen-sized
   * layer at resize and blitted once per frame. A repeating pattern fill over
   * the whole viewport every frame is one of the most expensive things you can
   * ask a rasteriser to do.
   */
  drawOverlay(ctx) {
    if (!this.overlay) this.overlay = buildOverlay(this.width, this.height, this.dpr);
    ctx.drawImage(this.overlay, 0, 0, this.width, this.height);
  }

  drawMinimap(ctx, game, camera) {
    const size = clamp(this.width * 0.09, 76, 118);
    const margin = 18;
    const cx = this.width - margin - size / 2;
    const cy = this.height - margin - size / 2;
    const scale = size / 2 / WORLD.radius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, TAU);
    ctx.fillStyle = 'rgba(10, 16, 32, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 180, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.clip();

    // Food fields, so the map hints at where it's worth going.
    ctx.fillStyle = 'rgba(120, 210, 190, 0.16)';
    ctx.beginPath();
    for (const cluster of game.clusters) {
      const r = Math.max(1.2, cluster.radius * scale);
      ctx.moveTo(cx + cluster.x * scale + r, cy + cluster.y * scale);
      ctx.arc(cx + cluster.x * scale, cy + cluster.y * scale, r, 0, TAU);
    }
    ctx.fill();

    // What the camera can currently see.
    const viewW = (this.width / camera.zoom) * scale;
    const viewH = (this.height / camera.zoom) * scale;
    ctx.strokeStyle = 'rgba(214, 228, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx + camera.x * scale - viewW / 2, cy + camera.y * scale - viewH / 2, viewW, viewH);

    for (const snake of game.snakes) {
      if (!snake.alive) continue;
      ctx.fillStyle = snake.color;
      ctx.globalAlpha = snake.isPlayer ? 1 : 0.7;
      ctx.beginPath();
      ctx.arc(cx + snake.x * scale, cy + snake.y * scale, snake.isPlayer ? 3.4 : 2.1, 0, TAU);
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
    ctx.fillStyle = 'rgba(226, 238, 255, 0.9)';
    ctx.font = '700 104px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }
}

/* -------------------------------------------------------------------- *
 * one-off assets
 * -------------------------------------------------------------------- */

/** Sprite radius as a multiple of the pellet's own radius. */
const SPRITE_SCALE = 3.2;

/** Bloom buffer is 1/N the size of the canvas; N is also the blur radius. */
const BLOOM_DIVISOR = 6;
const BLOOM_STRENGTH = 0.62;

/** Casing colour behind every body, for separation where snakes cross. */
const CASING = '#03050b';
const LOW_FUEL = '#ff6b5e';

/** Edge of the baked arena texture, in pixels. */
const NEBULA_SIZE = 2048;

/** Paint the whole arena floor once, at a resolution soft clouds can afford. */
function buildNebula(washes) {
  const canvas = document.createElement('canvas');
  canvas.width = NEBULA_SIZE;
  canvas.height = NEBULA_SIZE;
  const ctx = canvas.getContext('2d');

  const scale = NEBULA_SIZE / (2 * WORLD.radius);
  ctx.setTransform(scale, 0, 0, scale, NEBULA_SIZE / 2, NEBULA_SIZE / 2);

  ctx.beginPath();
  ctx.arc(0, 0, WORLD.radius, 0, TAU);
  ctx.fillStyle = ARENA;
  ctx.fill();
  ctx.clip();

  ctx.globalCompositeOperation = 'lighter';
  for (const wash of washes) {
    const grad = ctx.createRadialGradient(wash.x, wash.y, 0, wash.x, wash.y, wash.radius);
    grad.addColorStop(0, wash.color.replace('ALPHA', wash.alpha.toFixed(3)));
    grad.addColorStop(0.55, wash.color.replace('ALPHA', (wash.alpha * 0.4).toFixed(3)));
    grad.addColorStop(1, wash.color.replace('ALPHA', '0'));
    ctx.fillStyle = grad;
    ctx.fillRect(wash.x - wash.radius, wash.y - wash.radius, wash.radius * 2, wash.radius * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  const band = ctx.createRadialGradient(
    0,
    0,
    WORLD.radius - WORLD.edgeWarning,
    0,
    0,
    WORLD.radius,
  );
  band.addColorStop(0, 'rgba(232, 116, 96, 0)');
  band.addColorStop(1, 'rgba(232, 116, 96, 0.22)');
  ctx.fillStyle = band;
  ctx.fillRect(-WORLD.radius, -WORLD.radius, WORLD.radius * 2, WORLD.radius * 2);

  return canvas;
}

function buildWashes() {
  const random = mulberry32(20260818);
  const washes = [];
  for (let i = 0; i < 46; i++) {
    const angle = random() * TAU;
    const radius = Math.sqrt(random()) * WORLD.radius * 0.95;
    washes.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      radius: 900 + random() * 1700,
      color: WASH[Math.floor(random() * WASH.length)],
      alpha: 0.05 + random() * 0.07,
    });
  }
  return washes;
}

/** Screen-sized vignette + grain, baked once per resize. */
function buildOverlay(width, height, dpr) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const radius = Math.hypot(width, height) / 2;
  const grad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    radius * 0.45,
    width / 2,
    height / 2,
    radius,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const pattern = ctx.createPattern(buildGrain(), 'repeat');
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

function buildGrain() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = mulberry32(7);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = random() * 255;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 10;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Stable per-cell noise for the dust lattice. */
function hash2(x, y) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return (h ^ (h >>> 13)) >>> 0;
}

function rgba(hex, alpha) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const num = parseInt(full, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}
