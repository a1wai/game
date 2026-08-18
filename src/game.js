import {
  WORLD,
  SNAKE_COUNT,
  MIN_ALIVE,
  SNAKE,
  FOOD,
  FOOD_COLORS,
  DIFFICULTY,
  PLAYER_NAME,
  RIVAL_NAMES,
  RESPAWN_DELAY,
  COUNTDOWN,
  MAX_PARTICLES,
  KILL_BOUNTY,
  DEATH_SCORE_KEPT,
} from './config.js';
import { Snake } from './snake.js';
import { SpatialGrid } from './grid.js';
import { steerRival } from './ai.js';
import { makePalette } from './palette.js';
import { assignArchetype } from './archetypes.js';
import { TAU, pick, randRange } from './utils.js';

/** Simulation runs on a fixed step so physics stays identical at any framerate. */
const STEP = 1 / 60;

/** Every Nth trail point goes into the collision grid — they overlap anyway. */
const COLLIDE_SAMPLE = 3;

/** Trail points this close to the head are covered by the head circle instead. */
const NECK_POINTS = 6;

/**
 * Food barely moves, so its grid is rebuilt a few times a second instead of
 * every step. Queries are widened to cover anything a magnet dragged in the
 * meantime.
 */
const FOOD_GRID_EVERY = 4;
const FOOD_GRID_SLACK = 28;

/**
 * The arena simulation. Pure state and rules: it never touches the DOM and
 * never draws, so the whole thing runs headless under Node.
 */
export class Game {
  constructor() {
    this.snakes = [];
    this.player = new Snake({ id: 0, name: PLAYER_NAME, isPlayer: true });
    this.snakes.push(this.player);
    for (let i = 0; i < SNAKE_COUNT - 1; i++) {
      this.snakes.push(new Snake({ id: i + 1, name: RIVAL_NAMES[i % RIVAL_NAMES.length] }));
    }
    /** Regenerated every round, so no two sessions look alike. */
    this.palette = makePalette(SNAKE_COUNT - 1);
    this.dress();

    this.food = [];
    this.clusters = [];
    this.particles = [];
    /** Expanding rings from kills and spawns — the "pop". */
    this.shockwaves = [];
    this.bodyGrid = new SpatialGrid(96);
    this.foodGrid = new SpatialGrid(160);
    this.listeners = new Map();

    /** What the player is asking for this frame. */
    this.intent = { angle: null, boost: false };
    /** Scratch list reused every step so the hot loop allocates nothing. */
    this._alive = [];

    this.difficulty = DIFFICULTY.normal;
    this.difficultyKey = 'normal';
    this.running = false;
    this.paused = false;
    this.over = false;
    this.countdown = 0;
    this.elapsed = 0;
    this.acc = 0;
    this.steps = 0;
    /** Progress through the current step, for render interpolation. */
    this.alpha = 1;
    this.result = null;
  }

  /** Hand out fresh colours and personalities. */
  dress(newPalette = false) {
    if (newPalette) this.palette = makePalette(SNAKE_COUNT - 1);
    this.player.dress(this.palette.player, null);
    let rival = 0;
    for (const snake of this.snakes) {
      if (snake.isPlayer) continue;
      snake.dress(this.palette.rivals[rival], assignArchetype(rival));
      snake.home = null;
      rival++;
    }
    this.foodColors = this.palette.food;
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
    this.shockwaves.length = 0;
    this.intent = { angle: null, boost: false };
    this.dress(true); // new colours every round
    this.seedClusters();

    // Scatter everyone across the arena with room to breathe.
    const placed = [];
    for (const snake of this.snakes) {
      const spot = this.spreadSpawn(placed, 900);
      snake.reset();
      snake.spawn(spot.x, spot.y, spot.angle);
      placed.push(spot);
    }

    this.replenishFood(true);
    this.rebuildBodyGrid();
    this.rebuildFoodGrid();

    this.running = true;
    this.paused = false;
    this.over = false;
    this.result = null;
    this.countdown = COUNTDOWN;
    this.elapsed = 0;
    this.acc = 0;
    this.steps = 0;
    this.alpha = 1;

    this.emit('start', this);
  }

  /**
   * Populate the arena without starting a round, so the menu has a real scene
   * behind it instead of a blank sheet. Nothing moves until start().
   */
  preview() {
    this.dress(true);
    this.seedClusters();
    this.food.length = 0;
    const placed = [];
    this.snakes.forEach((snake, i) => {
      const angle = (i / this.snakes.length) * TAU;
      const radius = 520 + (i % 3) * 260;
      snake.reset();
      snake.spawn(Math.cos(angle) * radius, Math.sin(angle) * radius, angle + Math.PI * 0.8);
      snake.grow(220 + i * 60);
      // Curve them as they lay their bodies down — straight sticks make a
      // dull backdrop.
      const bend = (i % 2 ? 1 : -1) * randRange(0.4, 1.1);
      for (let step = 0; step < 130; step++) {
        snake.targetAngle = snake.angle + bend;
        snake.advance(1 / 60);
      }
      snake.updateBounds();
      placed.push(snake);
    });
    // A pocket of food around the menu view, plus the usual fields.
    for (let i = 0; i < 220; i++) {
      const angle = Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * 1400;
      this.addFood(Math.cos(angle) * radius, Math.sin(angle) * radius, 'pellet');
    }
    this.replenishFood(true);
    this.rebuildBodyGrid();
    this.rebuildFoodGrid();
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
    this.handleRespawns(ms);

    this.acc += ms / 1000;
    let guard = 0;
    while (this.acc >= STEP && this.running && guard++ < 5) {
      this.acc -= STEP;
      this.step(STEP);
    }
    this.alpha = this.running ? Math.min(this.acc / STEP, 1) : 1;
  }

  handleRespawns(ms) {
    for (const snake of this.snakes) {
      if (snake.alive || snake.isPlayer) continue;
      snake.respawnIn -= ms;
      if (snake.respawnIn <= 0) this.respawn(snake);
    }

    // Hold the arena at a minimum population: whoever is next in the queue
    // skips the wait rather than leaving the world feeling empty.
    if (this.aliveCount >= MIN_ALIVE) return;
    let soonest = null;
    for (const snake of this.snakes) {
      if (snake.alive || snake.isPlayer) continue;
      if (!soonest || snake.respawnIn < soonest.respawnIn) soonest = snake;
    }
    if (soonest) this.respawn(soonest);
  }

  /* ------------------------------------------------------------------ *
   * one simulation step
   * ------------------------------------------------------------------ */

  step(dt) {
    this.steps++;

    const alive = this._alive;
    alive.length = 0;
    for (const snake of this.snakes) if (snake.alive) alive.push(snake);

    // 1. Intent. Rivals think; the player's steering arrives from outside.
    const ctx = {
      bodyGrid: this.bodyGrid,
      foodGrid: this.foodGrid,
      snakes: this.snakes,
      clusters: this.clusters,
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

    // 3. Refresh the lookup structures against the new positions.
    this.rebuildBodyGrid();
    if (this.steps % FOOD_GRID_EVERY === 0) this.rebuildFoodGrid();
    if (this.steps % SNAKE.boundsEvery === 0) {
      for (const snake of alive) snake.updateBounds();
    }

    // 4. Eat.
    for (const snake of alive) this.feed(snake, dt);

    // 5. Work out who died, then apply it all at once so ties are fair.
    const deaths = this.collide(alive);
    if (deaths) for (const [snake, info] of deaths) this.kill(snake, info);

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
        this.addFood(tail.x + randRange(-6, 6), tail.y + randRange(-6, 6), 'crumb', snake.soft);
      }
    }
  }

  /** Pull nearby pellets in, swallow the ones that reach the head. */
  feed(snake, dt) {
    const reach = FOOD.magnetRadius + snake.radius;
    let eaten = 0;

    this.foodGrid.forEachNear(snake.x, snake.y, reach + FOOD_GRID_SLACK, (item) => {
      if (item.gone) return null;
      const dx = snake.x - item.x;
      const dy = snake.y - item.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < snake.radius + item.radius) {
        item.gone = true;
        eaten++;
        const greed = snake.archetype ? snake.archetype.greed : 1;
        snake.grow(item.length * greed);
        snake.score += item.value;
        this.burst(item.x, item.y, item.color, 4, 45);
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

    if (eaten) this.compactFood();
  }

  /** Swap-pop the eaten pellets — no array churn on a list this size. */
  compactFood() {
    for (let i = this.food.length - 1; i >= 0; i--) {
      if (!this.food[i].gone) continue;
      this.food[i] = this.food[this.food.length - 1];
      this.food.pop();
    }
  }

  /**
   * Deaths, decided from the post-move state.
   * A snake never collides with itself — only rivals and the rim are lethal.
   */
  collide(alive) {
    let deaths = null;
    const add = (snake, info) => {
      if (!deaths) deaths = new Map();
      if (!deaths.has(snake)) deaths.set(snake, info);
    };

    // Head to head: the longer snake wins, equal lengths take each other out.
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i];
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j];
        const reach = a.radius * 0.9 + b.radius * 0.9;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (a.length > b.length * 1.02) add(b, { cause: 'head', killer: a });
        else if (b.length > a.length * 1.02) add(a, { cause: 'head', killer: b });
        else {
          add(a, { cause: 'head', killer: null });
          add(b, { cause: 'head', killer: null });
        }
      }
    }

    for (const snake of alive) {
      if (deaths?.has(snake)) continue;

      if (snake.x * snake.x + snake.y * snake.y > WORLD.radius * WORLD.radius) {
        add(snake, { cause: 'edge', killer: null });
        continue;
      }

      const hit = this.bodyGrid.forEachNear(
        snake.x,
        snake.y,
        snake.radius + SNAKE.maxRadius,
        (point) => {
          if (point.s === snake.id) return null; // you cannot run into yourself
          const other = this.snakes[point.s];
          if (!other || !other.alive) return null;
          const reach = snake.radius * 0.82 + other.radius * 0.86;
          const dx = point.x - snake.x;
          const dy = point.y - snake.y;
          return dx * dx + dy * dy < reach * reach ? other : null;
        },
      );
      if (hit) add(snake, { cause: 'body', killer: hit });
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
    this.burst(snake.x, snake.y, snake.core, 42, 260);
    this.shockwave(snake.x, snake.y, snake.color, snake.radius * 9);
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
    this.alpha = 1;
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
      snake.respawnIn = 400; // crowded right now, try again shortly
      return;
    }
    snake.spawn(spot.x, spot.y, spot.angle);
    this.burst(spot.x, spot.y, snake.soft, 16, 90);
    this.shockwave(spot.x, spot.y, snake.soft, snake.radius * 5);
    this.emit('respawn', { snake });
  }

  /* ------------------------------------------------------------------ *
   * world upkeep
   * ------------------------------------------------------------------ */

  rebuildBodyGrid() {
    this.bodyGrid.clear();
    for (const snake of this.snakes) {
      if (!snake.alive) continue;
      const path = snake.path;
      for (let i = NECK_POINTS; i < path.length; i += COLLIDE_SAMPLE) {
        const point = path[i];
        this.bodyGrid.insert(point.x, point.y, point);
      }
    }
  }

  rebuildFoodGrid() {
    this.foodGrid.clear();
    for (const item of this.food) this.foodGrid.insert(item.x, item.y, item);
  }

  /** Food gathers in fields, so an open world still has places worth going. */
  seedClusters() {
    this.clusters.length = 0;
    for (let i = 0; i < FOOD.clusters; i++) {
      const angle = Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * WORLD.radius * 0.94;
      this.clusters.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        radius: randRange(FOOD.clusterRadius[0], FOOD.clusterRadius[1]),
      });
    }
  }

  /** A point inside a random field, or loose in the open. */
  scatterPoint() {
    if (this.clusters.length === 0 || Math.random() < FOOD.scatter) {
      const angle = Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * WORLD.radius * 0.97;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    }
    const cluster = pick(this.clusters);
    const angle = Math.random() * TAU;
    const radius = Math.sqrt(Math.random()) * cluster.radius;
    return { x: cluster.x + Math.cos(angle) * radius, y: cluster.y + Math.sin(angle) * radius };
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
      color: color ?? pick(this.foodColors ?? FOOD_COLORS),
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
    let budget = fill ? FOOD.count : Math.min(4, FOOD.count - pellets);
    while (pellets < FOOD.count && budget-- > 0) {
      const spot = this.scatterPoint();
      this.addFood(spot.x, spot.y, 'pellet');
      pellets++;
    }
    if (fill) this.rebuildFoodGrid();
  }

  /** A dead snake becomes a trail of food — the reward for taking someone out. */
  dropRemains(snake) {
    const path = snake.path;
    const spacing = Math.max(3, Math.round(24 / SNAKE.pathStep));
    let dropped = 0;
    for (let i = 0; i < path.length && dropped < 160; i += spacing) {
      const p = path[i];
      this.addFood(p.x + randRange(-6, 6), p.y + randRange(-6, 6), 'remains', snake.soft);
      dropped++;
    }
  }

  /** Somewhere with elbow room: no body within `clear` units. */
  findSpawn(clear = 260) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const angle = Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * WORLD.radius * 0.88;
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

  /** Round-start placement: far from everyone already placed. */
  spreadSpawn(placed, clear) {
    let best = null;
    let bestGap = -1;
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = Math.random() * TAU;
      const radius = Math.sqrt(Math.random()) * WORLD.radius * 0.85;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      let gap = Infinity;
      for (const other of placed) {
        const d = Math.hypot(other.x - x, other.y - y);
        if (d < gap) gap = d;
      }
      if (gap > bestGap) {
        bestGap = gap;
        best = { x, y, angle: Math.atan2(-y, -x) };
      }
      if (gap >= clear) break;
    }
    return best;
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
    let n = 0;
    for (const snake of this.snakes) if (snake.alive) n++;
    return n;
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

  shockwave(x, y, color, radius) {
    if (this.shockwaves.length > 24) return;
    this.shockwaves.push({ x, y, color, radius, life: 620, maxLife: 620 });
  }

  stepParticles(ms) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      w.life -= ms;
      if (w.life <= 0) {
        this.shockwaves[i] = this.shockwaves[this.shockwaves.length - 1];
        this.shockwaves.pop();
      }
    }

    const dt = ms / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= ms;
      if (p.life <= 0) {
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
  }
}
