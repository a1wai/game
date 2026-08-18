import { SNAKE } from './config.js';
import { clamp } from './utils.js';

/**
 * Follows the player around the world and decides how many pixels a world unit
 * is worth. Zoom eases out as the snake grows, so a long snake still fits on
 * screen, and the whole thing is framed off the viewport diagonal so phones and
 * ultrawide monitors both see a sensible slice of the arena.
 */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.width = 1;
    this.height = 1;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Screen-fit factor before any growth adjustment. */
  get fit() {
    return clamp(Math.hypot(this.width, this.height) / 1750, 0.45, 1.25);
  }

  targetZoom(snake) {
    const growth = clamp(SNAKE.baseRadius / snake.radius, 0.62, 1);
    return this.fit * growth;
  }

  snapTo(snake) {
    this.x = snake.x;
    this.y = snake.y;
    this.zoom = this.targetZoom(snake);
  }

  follow(snake, ms) {
    const dt = ms / 1000;
    // Frame-rate independent exponential easing.
    const move = 1 - Math.exp(-9 * dt);
    const zoomEase = 1 - Math.exp(-2.2 * dt);
    this.x += (snake.x - this.x) * move;
    this.y += (snake.y - this.y) * move;
    this.zoom += (this.targetZoom(snake) - this.zoom) * zoomEase;
  }

  /** World-space rectangle currently on screen, grown by `margin` units. */
  visibleRect(margin = 0) {
    const halfW = this.width / 2 / this.zoom + margin;
    const halfH = this.height / 2 / this.zoom + margin;
    return {
      minX: this.x - halfW,
      maxX: this.x + halfW,
      minY: this.y - halfH,
      maxY: this.y + halfH,
    };
  }
}
