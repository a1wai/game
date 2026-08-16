import {
  GRID,
  CELL,
  AI_COUNT,
  START_LENGTH,
  FOOD_TARGET,
  FOOD_TYPES,
  RESPAWN_DELAY,
  COUNTDOWN,
  MAX_PARTICLES,
  KILL_BOUNTY,
  DEATH_SCORE_KEPT,
  DIFFICULTY,
  PLAYER_SKIN,
  AI_SKINS,
  SPAWN_SLOTS,
} from './config.js';
import { Board, DIRS, DIR_KEYS, OPPOSITE } from './board.js';
import { Snake } from './snake.js';
import { decideDirection } from './ai.js';
import { randInt, pick } from './utils.js';

/**
 * The arena simulation. Pure state + logic: it never touches the DOM and never
 * draws anything, it just advances on a fixed timestep and emits events.
 */
export class Game {
  constructor() {
    this.board = new Board(GRID.cols, GRID.rows, false);
    this.snakes = [];
    this.food = new Map(); // board index -> { x, y, type, seed }
    this.particles = [];
    this.listeners = new Map();

    this.player = new Snake({ id: 0, ...PLAYER_SKIN, isPlayer: true });
    this.snakes.push(this.player);
    for (let i = 0; i < AI_COUNT; i++) {
      this.snakes.push(new Snake({ id: i + 1, ...AI_SKINS[i % AI_SKINS.length] }));
    }

    this.turnQueue = [];
    this.difficulty = DIFFICULTY.normal;
    this.difficultyKey = 'normal';
    this.tickMs = this.difficulty.tick;

    this.running = false;
    this.paused = false;
    this.over = false;
    this.countdown = 0;
    this.elapsed = 0;
    this.ticks = 0;
    this.acc = 0;
    this.alpha = 1;
    this.result = null;

    this._blocked = new Uint8Array(this.board.size);
    this._risky = new Uint8Array(this.board.size);
  }

  /* ------------------------------------------------------------------ *
   * events
   * ------------------------------------------------------------------ */

  on(event, handler) {
    const list = this.listeners.get(event) ?? [];
    list.push(handler);
    this.listeners.set(event, list);
    return this;
  }

  emit(event, payload) {
    const list = this.listeners.get(event);
    if (list) for (const fn of list) fn(payload);
  }

  /* ------------------------------------------------------------------ *
   * lifecycle
   * ------------------------------------------------------------------ */

  start({ difficulty = 'normal', wrap = false } = {}) {
    this.difficultyKey = DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.difficulty = DIFFICULTY[this.difficultyKey];
    this.tickMs = this.difficulty.tick;
    this.board.wrap = wrap;

    this.food.clear();
    this.particles.length = 0;
    this.turnQueue.length = 0;

    const slots = SPAWN_SLOTS.slice(0, this.snakes.length);
    this.snakes.forEach((snake, i) => {
      const slot = slots[i];
      const x = Math.round(slot.fx * (this.board.cols - 1));
      const y = Math.round(slot.fy * (this.board.rows - 1));
      snake.reset();
      snake.spawn(x, y, slot.dir, START_LENGTH);
    });

    this.replenishFood();

    this.running = true;
    this.paused = false;
    this.over = false;
    this.result = null;
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.ticks = 0;
    this.acc = 0;
    this.alpha = 1;

    this.emit('start', this);
  }

  togglePause(force) {
    if (!this.running) return;
    this.paused = force ?? !this.paused;
    this.acc = 0;
    this.emit('pause', this.paused);
  }

  /** Advance the world by `dt` milliseconds of wall clock. */
  update(dt) {
    this.stepParticles(dt);
    if (!this.running || this.paused) return;

    if (this.countdown > 0) {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.emit('go');
      }
      return;
    }

    this.elapsed += dt;

    for (const snake of this.snakes) {
      if (snake.alive || snake.isPlayer) continue;
      snake.respawnIn -= dt;
      if (snake.respawnIn <= 0) this.respawn(snake);
    }

    this.acc += dt;
    let guard = 0;
    while (this.acc >= this.tickMs && this.running && guard++ < 4) {
      this.acc -= this.tickMs;
      this.tick();
    }
    this.alpha = this.running ? Math.min(this.acc / this.tickMs, 1) : 1;
  }

  /* ------------------------------------------------------------------ *
   * simulation step
   * ------------------------------------------------------------------ */

  tick() {
    this.ticks++;
    const board = this.board;
    const alive = this.snakes.filter((s) => s.alive);

    // 1. Everyone commits to a direction from the same snapshot of the world.
    const blocked = this.buildOccupancy();
    const foodSet = new Set(this.food.keys());
    for (const snake of alive) {
      if (snake.autopilot) {
        snake.dir = decideDirection(snake, {
          board,
          blocked,
          risky: this.buildRisk(snake),
          food: foodSet,
          tuning: this.difficulty.tuning,
        });
      } else if (snake.isPlayer) {
        const next = this.turnQueue.shift();
        if (next) snake.dir = next;
      }
    }

    // 2. Where each head lands (null = off a solid edge).
    const nextHead = new Map();
    const willGrow = new Map();
    for (const snake of alive) {
      const cell = board.step(snake.head.x, snake.head.y, snake.dir);
      nextHead.set(snake, cell);
      willGrow.set(
        snake,
        snake.growth > 0 || (cell != null && this.food.has(board.index(cell.x, cell.y))),
      );
    }

    // 3. Cells that will still be solid after everyone has moved. A tail is
    //    only an obstacle if its owner is growing and therefore won't vacate it.
    const solid = new Map(); // index -> owning snake
    for (const snake of alive) {
      const last = snake.length - 1;
      for (let i = 0; i <= last; i++) {
        if (i === last && last > 0 && !willGrow.get(snake)) continue;
        solid.set(board.index(snake.body[i].x, snake.body[i].y), snake);
      }
    }

    // 4. Deaths: walls, bodies (yours or anyone's), then head-on trades.
    const deaths = new Map(); // snake -> { cause, killer }
    for (const snake of alive) {
      const cell = nextHead.get(snake);
      if (!cell) {
        deaths.set(snake, { cause: 'wall', killer: null });
        continue;
      }
      const owner = solid.get(board.index(cell.x, cell.y));
      if (owner) {
        deaths.set(snake, {
          cause: owner === snake ? 'self' : 'body',
          killer: owner === snake ? null : owner,
        });
      }
    }

    const contested = new Map(); // index -> snakes aiming at it
    for (const snake of alive) {
      const cell = nextHead.get(snake);
      if (!cell) continue;
      const key = board.index(cell.x, cell.y);
      const group = contested.get(key);
      if (group) group.push(snake);
      else contested.set(key, [snake]);
    }
    for (const group of contested.values()) {
      if (group.length < 2) continue;
      // Longest snake wins the exchange; a tie wipes out everyone involved.
      const longest = Math.max(...group.map((s) => s.length));
      const winners = group.filter((s) => s.length === longest);
      const winner = winners.length === 1 ? winners[0] : null;
      for (const snake of group) {
        if (snake === winner) continue;
        if (!deaths.has(snake)) deaths.set(snake, { cause: 'head', killer: winner });
      }
    }

    // 5. Survivors move and eat.
    for (const snake of alive) {
      if (deaths.has(snake)) continue;
      const cell = nextHead.get(snake);
      snake.lastTail = null;
      snake.body.unshift({ x: cell.x, y: cell.y });

      const key = board.index(cell.x, cell.y);
      const morsel = this.food.get(key);
      if (morsel) {
        const type = FOOD_TYPES[morsel.type];
        this.food.delete(key);
        snake.growth += type.grow;
        snake.score += type.value;
        this.burst(cell.x, cell.y, type.color, 12, 1.6);
        this.emit('eat', { snake, type: morsel.type });
      }

      if (snake.growth > 0) snake.growth--;
      else snake.lastTail = snake.body.pop();
    }

    // 6. Resolve the fallen.
    for (const [snake, info] of deaths) {
      this.kill(snake, info);
    }

    this.replenishFood();
    this.emit('tick', this);
  }

  kill(snake, info) {
    snake.alive = false;
    snake.deaths++;
    snake.lastTail = null;

    const killer = info.killer;
    if (killer && killer !== snake) {
      killer.kills++;
      killer.score += KILL_BOUNTY;
      this.emit('kill', { killer, victim: snake });
    }

    this.dropRemains(snake);
    const head = snake.body[0];
    if (head) this.burst(head.x, head.y, snake.color, 26, 2.6);

    this.emit('death', { snake, ...info });

    if (snake.isPlayer) {
      this.finish(info);
    } else {
      // Rivals come back, but a death costs them half the standings.
      snake.score = Math.floor(snake.score * DEATH_SCORE_KEPT);
      snake.respawnIn = RESPAWN_DELAY;
      snake.body = [];
    }
  }

  finish(info) {
    this.running = false;
    this.over = true;
    this.paused = false;
    this.alpha = 1;
    this.result = {
      score: this.player.score,
      rank: this.rankOf(this.player),
      total: this.snakes.length,
      kills: this.player.kills,
      length: this.player.length,
      time: this.elapsed,
      cause: info.cause,
      killer: info.killer ? info.killer.name : null,
      difficulty: this.difficultyKey,
    };
    this.emit('gameover', this.result);
  }

  respawn(snake) {
    const spot = this.findSpawn(START_LENGTH);
    if (!spot) {
      snake.respawnIn = 400; // arena is crowded, try again shortly
      return;
    }
    snake.spawn(spot.x, spot.y, spot.dir, START_LENGTH);
    this.burst(spot.x, spot.y, snake.color, 16, 1.8);
    this.emit('respawn', { snake });
  }

  /* ------------------------------------------------------------------ *
   * world helpers
   * ------------------------------------------------------------------ */

  /** Occupancy snapshot used for AI planning (tails about to move are free). */
  buildOccupancy() {
    const grid = this._blocked;
    grid.fill(0);
    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      const last = snake.length - 1;
      for (let i = 0; i <= last; i++) {
        if (i === last && last > 0 && snake.growth === 0) continue;
        grid[this.board.index(snake.body[i].x, snake.body[i].y)] = 1;
      }
    }
    return grid;
  }

  /** Cells a rival head (that would win or tie a head-on) can reach next tick. */
  buildRisk(self) {
    const grid = this._risky;
    grid.fill(0);
    for (const other of this.snakes) {
      if (!other.alive || other === self || other.length < self.length) continue;
      for (const dir of DIR_KEYS) {
        if (other.length > 1 && dir === OPPOSITE[other.dir]) continue;
        const cell = this.board.step(other.head.x, other.head.y, dir);
        if (cell) grid[this.board.index(cell.x, cell.y)] = 1;
      }
    }
    return grid;
  }

  isOccupied(x, y) {
    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      for (const cell of snake.body) {
        if (cell.x === x && cell.y === y) return true;
      }
    }
    return false;
  }

  replenishFood() {
    let pellets = 0;
    for (const item of this.food.values()) if (item.type === 'pellet') pellets++;
    let attempts = 0;
    while (pellets < FOOD_TARGET && attempts++ < 500) {
      const x = randInt(0, this.board.cols - 1);
      const y = randInt(0, this.board.rows - 1);
      const key = this.board.index(x, y);
      if (this.food.has(key) || this.isOccupied(x, y)) continue;
      this.food.set(key, { x, y, type: 'pellet', seed: Math.random() * 1000 });
      pellets++;
    }
  }

  /** A dead snake becomes a trail of bonus pellets — the reward for a kill. */
  dropRemains(snake) {
    let dropped = 0;
    for (let i = 0; i < snake.body.length && dropped < 12; i += 2) {
      const cell = snake.body[i];
      const key = this.board.index(cell.x, cell.y);
      if (this.food.has(key)) continue;
      this.food.set(key, { x: cell.x, y: cell.y, type: 'remains', seed: Math.random() * 1000 });
      dropped++;
    }
  }

  /** A free cell with a clear runway ahead, for respawning without instant death. */
  findSpawn(length) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const dir = pick(DIR_KEYS);
      const d = DIRS[dir];
      const x = randInt(3, this.board.cols - 4);
      const y = randInt(3, this.board.rows - 4);

      let ok = true;
      for (let i = -(length - 1); i <= 4 && ok; i++) {
        const cx = x + d.x * i;
        const cy = y + d.y * i;
        if (!this.board.inBounds(cx, cy)) ok = false;
        else if (this.isOccupied(cx, cy)) ok = false;
      }
      if (ok) return { x, y, dir };
    }
    return null;
  }

  rankOf(snake) {
    let rank = 1;
    for (const other of this.snakes) {
      if (other !== snake && other.score > snake.score) rank++;
    }
    return rank;
  }

  leaderboard() {
    return [...this.snakes].sort((a, b) => b.score - a.score || b.length - a.length);
  }

  get aliveCount() {
    return this.snakes.reduce((n, s) => n + (s.alive ? 1 : 0), 0);
  }

  /* ------------------------------------------------------------------ *
   * input
   * ------------------------------------------------------------------ */

  /**
   * Buffer a turn. Up to two are held so a fast double-tap (right → up) both
   * register instead of the second one being swallowed by the same tick.
   */
  queueTurn(dir) {
    if (!DIRS[dir] || !this.running || this.paused || !this.player.alive) return;
    if (this.turnQueue.length >= 2) return;
    const last = this.turnQueue.length ? this.turnQueue[this.turnQueue.length - 1] : this.player.dir;
    if (dir === last || dir === OPPOSITE[last]) return;
    this.turnQueue.push(dir);
  }

  /* ------------------------------------------------------------------ *
   * particles (pure eye candy, safe to starve)
   * ------------------------------------------------------------------ */

  burst(cellX, cellY, color, count, speed = 2) {
    if (this.particles.length > MAX_PARTICLES) return;
    const x = cellX * CELL + CELL / 2;
    const y = cellY * CELL + CELL / 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.35 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 340 + Math.random() * 420,
        maxLife: 760,
        size: 1.6 + Math.random() * 2.6,
        color,
      });
    }
  }

  stepParticles(dt) {
    const scale = dt / 16.67;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * scale;
      p.y += p.vy * scale;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
  }
}
