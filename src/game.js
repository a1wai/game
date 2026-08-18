import {
  WORLD,
  RIVAL_COUNT,
  SNAKE,
  FOOD,
  FOOD_COLORS,
  DIFFICULTY,
  PLAYER_SKIN,
  RIVAL_SKINS,
  RESPAWN_DELAY,
  COUNTDOWN,
  MAX_PARTICLES,
  KILL_BOUNTY,
  DEATH_SCORE_KEPT,
} from './config.js';
import { Snake } from './snake.js';
import { SpatialGrid } from './grid.js';
import { steerRival } from './ai.js';
import { TAU, clamp, pick, randRange } from './utils.js';

/** Simulation runs on a fixed step so physics stays identical at any framerate. */
const STEP = 1 / 60;

/** Every Nth trail point goes into the collision grid — they overlap anyway. */
const COLLIDE_SAMPLE = 3;

/** Trail points this close to the head are covered by the head circle instead. */
const NECK_POINTS = 6;

/**
 * The arena simulation. Pure state and rules: it never touches the DOM and
 * never draws, so the whole thing runs headless under Node.
 */
export class Game {
  constructor() {
    this.snakes = [];
    this.player = new Snake({ id: 0, ...PLAYER_SKIN, isPlayer: true });
    this.snakes.push(this.player);
    for (let i = 0; i < RIVAL_COUNT; i++) {
      this.snakes.push(new Snake({ id: i + 1, ...RIVAL_SKINS[i % RIVAL_SKINS.length] }));
    }

    this.food = [];
    this.particles = [];
    this.bodyGrid = new SpatialGrid(64);
    this.foodGrid = new SpatialGrid(96);
    this.listeners = new Map();

    /** What the player is asking for this frame. */
    this.intent = { angle: null, boost: false };

    this.difficulty = DIFFICULTY.normal;
    this.difficultyKey = 'normal';
    this.running = false;
    this.paused = false;
    this.over = false;
    this.countdown = 0;
    this.elapsed = 0;
    this.acc = 0;
    this.result = null;
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

  start({ difficulty = 'normal' } = {}) {
    this.difficultyKey = DIFFICULTY[difficulty] ? difficulty : 'normal';
    this.difficulty = DIFFICULTY[this.difficultyKey];

    this.food.length = 0;
    this.particles.length = 0;
    this.intent = { angle: null, boost: false };

    // Spread everyone evenly around a ring, facing the middle.
    this.snakes.forEach((snake, i) => {
      const angle = (i / this.snakes.length) * TAU + randRange(-0.2, 0.2);
      const radius = WORLD.radius * 0.55;
      snake.reset();
      snake.spawn(Math.cos(angle) * radius, Math.sin(angle) * radius, angle + Math.PI);
    });

    this.replenishFood(true);
    this.rebuildGrids();

    this.running = true;
    this.paused = false;
    this.over = false;
    this.result = null;
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.acc = 0;

    this.emit('start', this);
  }

  /**
   * Populate the arena without starting a round, so the menu has a real scene
   * behind it instead of a blank sheet. Nothing moves until start().
   */
  preview() {
    this.food.length = 0;
    this.snakes.forEach((snake, i) => {
      const angle = (i / this.snakes.length) * TAU;
      const radius = WORLD.radius * 0.5;
      snake.reset();
      snake.spawn(Math.cos(angle) * radius, Math.sin(angle) * radius, angle + Math.PI * 0.8);
      snake.grow(200 + i * 90);
      for (let step = 0; step < 90; step++) snake.advance(1 / 60);
    });
    this.replenishFood(true);
    this.rebuildGrids();
  }

  togglePause(force) {
    if (!this.running) return;
    this.paused = force ?? !this.paused;
    this.acc = 0;
    this.emit('pause', this.paused);
  }

  setIntent(angle, boost) {
    this.intent.angle = angle;
    this.intent.boost = boost;
  }

  /** Advance by `ms` of wall clock, in fixed simulation steps. */
  update(ms) {
    this.stepParticles(ms);
    if (!this.running || this.paused) return;

    if (this.countdown > 0) {
      this.countdown -= ms;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.emit('go');
      }
      return;
    }

    this.elapsed += ms;
    for (const snake of this.snakes) {
      if (snake.alive || snake.isPlayer) continue;
      snake.respawnIn -= ms;
      if (snake.respawnIn <= 0) this.respawn(snake);
    }

    this.acc += ms / 1000;
    let guard = 0;
    while (this.acc >= STEP && this.running && guard++ < 5) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }

  /* ------------------------------------------------------------------ *
   * one simulation step
   * ------------------------------------------------------------------ */

  step(dt) {
    const alive = this.snakes.filter((s) => s.alive);

    // 1. Intent. Rivals think; the player's steering arrives from outside.
    const ctx = {
      bodyGrid: this.bodyGrid,
      foodGrid: this.foodGrid,
      snakes: this.snakes,
      tuning: this.difficulty.tuning,
      dt,
    };
    for (const snake of alive) {
      if (snake.autopilot) {
        steerRival(snake, ctx, dt);
      } else if (snake.isPlayer) {
        if (this.intent.angle !== null) snake.targetAngle = this.intent.angle;
        snake.wantsBoost = this.intent.boost;
      }
    }

    // 2. Move, and pay for any boosting.
    for (const snake of alive) {
      snake.advance(dt, this.difficulty.speedScale);
      if (snake.boosting) this.payForBoost(snake, dt);
    }

    // 3. Refresh the lookup grids against the new positions.
    this.rebuildGrids();

    // 4. Eat.
    for (const snake of alive) this.feed(snake, dt);

    // 5. Work out who died, then apply it all at once so ties are fair.
    const deaths = this.collide(alive);
    for (const [snake, info] of deaths) this.kill(snake, info);

    this.replenishFood(false);
  }

  payForBoost(snake, dt) {
    const burn = SNAKE.boostDrain * dt;
    snake.shrink(burn);

    // Length burns continuously, but score is a whole number — bank the
    // fraction and spend it a point at a time.
    snake.scoreDebt += burn * (FOOD.pellet.value / FOOD.pellet.length);
    const points = Math.floor(snake.scoreDebt);
    if (points > 0) {
      snake.scoreDebt -= points;
      snake.score = Math.max(0, snake.score - points);
    }

    // Boosting sheds mass into the world — that's what makes it a real cost.
    snake.crumbTimer -= dt;
    if (snake.crumbTimer <= 0) {
      snake.crumbTimer = SNAKE.boostCrumbEvery;
      const tail = snake.path[snake.path.length - 1];
      if (tail) {
        this.addFood(
          tail.x + randRange(-6, 6),
          tail.y + randRange(-6, 6),
          'crumb',
          snake.soft,
        );
      }
    }
  }

  /** Pull nearby pellets in, swallow the ones that reach the head. */
  feed(snake, dt) {
    const reach = FOOD.magnetRadius + snake.radius;
    let eaten = 0;

    this.foodGrid.forEachNear(snake.x, snake.y, reach, (item) => {
      if (item.gone) return null;
      const dx = snake.x - item.x;
      const dy = snake.y - item.y;
      const d = Math.hypot(dx, dy);

      if (d < snake.radius + item.radius) {
        item.gone = true;
        eaten++;
        snake.grow(item.length);
        snake.score += item.value;
        this.burst(item.x, item.y, item.color, 5, 40);
        this.emit('eat', { snake, kind: item.kind });
        return null;
      }
      if (d < reach && d > 0.001) {
        const pull = FOOD.magnetSpeed * dt * (1 - d / reach);
        item.x += (dx / d) * pull;
        item.y += (dy / d) * pull;
      }
      return null;
    });

    if (eaten) this.food = this.food.filter((f) => !f.gone);
  }

  /**
   * Deaths, decided from the post-move state.
   * A snake never collides with itself — only rivals and the rim are lethal.
   */
  collide(alive) {
    const deaths = new Map();

    // Head to head: the longer snake wins, equal lengths take each other out.
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const reach = a.radius * 0.9 + b.radius * 0.9;
        if (Math.hypot(a.x - b.x, a.y - b.y) > reach) continue;
        if (a.length > b.length * 1.02) deaths.set(b, { cause: 'head', killer: a });
        else if (b.length > a.length * 1.02) deaths.set(a, { cause: 'head', killer: b });
        else {
          deaths.set(a, { cause: 'head', killer: null });
          deaths.set(b, { cause: 'head', killer: null });
        }
      }
    }

    for (const snake of alive) {
      if (deaths.has(snake)) continue;

      if (Math.hypot(snake.x, snake.y) > WORLD.radius) {
        deaths.set(snake, { cause: 'edge', killer: null });
        continue;
      }

      const hit = this.bodyGrid.forEachNear(snake.x, snake.y, snake.radius + SNAKE.maxRadius, (point) => {
        if (point.s === snake.id) return null; // you cannot run into yourself
        const other = this.snakes[point.s];
        if (!other || !other.alive) return null;
        const reach = snake.radius * 0.82 + other.radius * 0.86;
        const dx = point.x - snake.x;
        const dy = point.y - snake.y;
        return dx * dx + dy * dy < reach * reach ? other : null;
      });
      if (hit) deaths.set(snake, { cause: 'body', killer: hit });
    }

    return deaths;
  }

  kill(snake, info) {
    if (!snake.alive) return;
    snake.alive = false;
    snake.deaths++;
    snake.wantsBoost = false;
    snake.boosting = false;

    const killer = info.killer;
    if (killer && killer !== snake) {
      killer.kills++;
      killer.score += KILL_BOUNTY;
      this.emit('kill', { killer, victim: snake });
    }

    this.dropRemains(snake);
    this.burst(snake.x, snake.y, snake.color, 26, 150);
    this.emit('death', { snake, ...info });

    if (snake.isPlayer) {
      this.finish(info);
    } else {
      // Rivals come back, but a death costs them half the standings.
      snake.score = Math.floor(snake.score * DEATH_SCORE_KEPT);
      snake.respawnIn = RESPAWN_DELAY;
      snake.path = [];
      snake.pathLength = 0;
    }
  }

  finish(info) {
    this.running = false;
    this.over = true;
    this.paused = false;
    this.result = {
      score: this.player.score,
      rank: this.rankOf(this.player),
      total: this.snakes.length,
      kills: this.player.kills,
      length: Math.round(this.player.length),
      time: this.elapsed,
      cause: info.cause,
      killer: info.killer ? info.killer.name : null,
      difficulty: this.difficultyKey,
    };
    this.emit('gameover', this.result);
  }

  respawn(snake) {
    const spot = this.findSpawn();
    if (!spot) {
      snake.respawnIn = 500; // crowded right now, try again shortly
      return;
    }
    snake.spawn(spot.x, spot.y, spot.angle);
    this.burst(spot.x, spot.y, snake.soft, 14, 70);
    this.emit('respawn', { snake });
  }

  /** Somewhere with elbow room: no body within `clear` units. */
  findSpawn(clear = 220) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * WORLD.radius * 0.82;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const blocked = this.bodyGrid.forEachNear(x, y, clear, (point) => {
        const dx = point.x - x;
        const dy = point.y - y;
        return dx * dx + dy * dy < clear * clear ? point : null;
      });
      if (!blocked) return { x, y, angle: Math.atan2(-y, -x) };
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * world upkeep
   * ------------------------------------------------------------------ */

  rebuildGrids() {
    this.bodyGrid.clear();
    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      for (let i = NECK_POINTS; i < snake.path.length; i += COLLIDE_SAMPLE) {
        const point = snake.path[i];
        this.bodyGrid.insert(point.x, point.y, point);
      }
    }

    this.foodGrid.clear();
    for (const item of this.food) this.foodGrid.insert(item.x, item.y, item);
  }

  addFood(x, y, kind, color) {
    const spec = FOOD[kind];
    const item = {
      x,
      y,
      kind,
      radius: spec.radius,
      value: spec.value,
      length: spec.length,
      color: color ?? pick(FOOD_COLORS),
      seed: Math.random() * 1000,
      gone: false,
    };
    this.food.push(item);
    return item;
  }

  replenishFood(fill) {
    let pellets = 0;
    for (const item of this.food) if (item.kind === 'pellet') pellets++;

    // Trickle new pellets in during play; fill the arena at round start.
    let budget = fill ? FOOD.count : Math.min(3, FOOD.count - pellets);
    while (pellets < FOOD.count && budget-- > 0) {
      const angle = Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * WORLD.radius * 0.97;
      this.addFood(Math.cos(angle) * radius, Math.sin(angle) * radius, 'pellet');
      pellets++;
    }
  }

  /** A dead snake becomes a trail of food — the reward for taking someone out. */
  dropRemains(snake) {
    const points = snake.outline();
    const spacing = Math.max(3, Math.round(22 / SNAKE.pathStep));
    let dropped = 0;
    for (let i = 0; i < points.length && dropped < 140; i += spacing) {
      const p = points[i];
      this.addFood(p.x + randRange(-5, 5), p.y + randRange(-5, 5), 'remains', snake.soft);
      dropped++;
    }
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
   * particles (pure eye candy, safe to starve)
   * ------------------------------------------------------------------ */

  burst(x, y, color, count, speed) {
    if (this.particles.length > MAX_PARTICLES) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const velocity = speed * (0.35 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: 380 + Math.random() * 420,
        maxLife: 800,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  stepParticles(ms) {
    const dt = ms / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= ms;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
  }
}
