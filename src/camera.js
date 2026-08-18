import { SNAKE } from './config.js';
import { clamp, lerp } from './utils.js';

/**
 * Follows the player and decides how many pixels a world unit is worth.
 *
 * Three things stop it feeling stiff: it leads slightly in the direction of
 * travel, it pulls back a touch while boosting, and it takes a small decaying
 * knock when something dies nearby. All easing is frame-rate independent.
 */
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.width = 1;
    this.height = 1;
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /** Screen-fit factor before any growth adjustment. */
  get fit() {
    return clamp(Math.hypot(this.width, this.height) / 2300, 0.42, 1.15);
  }

  targetZoom(snake) {
    const growth = clamp(SNAKE.baseRadius / snake.radius, 0.6, 1);
    return this.fit * growth * (snake.boosting ? 0.94 : 1);
  }

  /** Where the camera wants to sit: slightly ahead of the snake. */
  targetPoint(snake, rx, ry) {
    const lead = Math.min((snake.speed ?? SNAKE.speed) * 0.3, 130);
    return { x: rx + Math.cos(snake.angle) * lead, y: ry + Math.sin(snake.angle) * lead };
  }

  snapTo(snake) {
    const point = this.targetPoint(snake, snake.x, snake.y);
    this.x = point.x;
    this.y = point.y;
    this.zoom = this.targetZoom(snake);
    this.shake = 0;
  }

  /**
   * @param {number} ms frame time
   * @param {number} rx interpolated head x
   * @param {number} ry interpolated head y
   */
  follow(snake, ms, rx = snake.x, ry = snake.y) {
    const dt = ms / 1000;
    const point = this.targetPoint(snake, rx, ry);

    // Exponential easing, corrected for frame time so it behaves the same at
    // 60 and 144 Hz.
    const move = 1 - Math.exp(-7.5 * dt);
    const zoomEase = 1 - Math.exp(-2.4 * dt);
    this.x = lerp(this.x, point.x, move);
    this.y = lerp(this.y, point.y, move);
    this.zoom = lerp(this.zoom, this.targetZoom(snake), zoomEase);

    this.shake *= Math.exp(-6 * dt);
    if (this.shake < 0.05) this.shake = 0;
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;
  }

  knock(amount) {
    this.shake = Math.min(18, this.shake + amount);
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
