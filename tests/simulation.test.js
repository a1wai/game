/**
 * Headless simulation checks — no DOM, no browser.
 * Run with: npm test
 *
 * The game module never touches the DOM, so the rules can be exercised like
 * any other library.
 */
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { WORLD, SNAKE, SNAKE_COUNT, MIN_ALIVE, FOOD } from '../src/config.js';

let checks = 0;
const check = (label, fn) => {
  fn();
  checks++;
  console.log(`  ✓ ${label}`);
};

/**
 * A round with only the player in it, parked in the middle.
 * Food top-ups are switched off so each test controls exactly what is in the
 * arena — otherwise a pellet drifting into range quietly changes the length
 * these tests are measuring.
 */
function soloGame() {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  for (const snake of game.snakes) if (!snake.isPlayer) snake.alive = false;
  game.food.length = 0;
  game.replenishFood = () => {};
  game.player.spawn(0, 0, 0);
  game.rebuildBodyGrid();
  game.rebuildFoodGrid();
  return game;
}

function assertInvariants(game) {
  for (const snake of game.snakes) {
    if (!snake.alive) continue;
    assert.ok(Number.isFinite(snake.x) && Number.isFinite(snake.y), `${snake.name} has NaN position`);
    assert.ok(
      Math.hypot(snake.x, snake.y) <= WORLD.radius + 1,
      `${snake.name} is outside the arena`,
    );
    assert.ok(snake.length > 0, `${snake.name} has no length`);
    assert.ok(snake.path.length > 0, `${snake.name} has no body`);
  }
}

console.log('Serpent Arena — simulation');

check('a fresh round fills the arena with snakes and food', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  assert.equal(game.snakes.length, SNAKE_COUNT);
  assert.equal(game.aliveCount, SNAKE_COUNT);
  assert.ok(SNAKE_COUNT >= MIN_ALIVE, 'the roster must be able to satisfy the live minimum');
  assert.equal(game.food.length, FOOD.count);
  assert.equal(game.player.length, SNAKE.startLength);
  for (const snake of game.snakes) {
    assert.ok(Math.hypot(snake.x, snake.y) < WORLD.radius, `${snake.name} spawned outside`);
  }
});

check('sixty seconds of rivals-only play stays legal', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  for (let i = 0; i < 3600; i++) {
    game.update(16.67);
    if (i % 60 === 0) assertInvariants(game);
    if (!game.running) {
      game.start({ difficulty: 'normal' });
      game.countdown = 0;
    }
  }
});

check('the arena never drops below its minimum population', () => {
  const game = new Game();
  game.start({ difficulty: 'brutal' });
  game.countdown = 0;

  // Wipe out everyone but the player and check the queue refills fast.
  for (const snake of game.snakes) {
    if (!snake.isPlayer) game.kill(snake, { cause: 'edge', killer: null });
  }
  assert.equal(game.aliveCount, 1);

  let lowest = Infinity;
  for (let i = 0; i < 1800 && game.running; i++) {
    game.update(16.67);
    // Give the refill a moment before holding it to the floor.
    if (i > 120) lowest = Math.min(lowest, game.aliveCount);
  }
  assert.ok(
    lowest >= MIN_ALIVE,
    `population fell to ${lowest}, below the minimum of ${MIN_ALIVE}`,
  );
});

check('render interpolation state tracks the previous step', () => {
  const game = soloGame();
  game.setIntent(0.8, false);
  game.step(1 / 60);
  const { prevX, prevY, x, y } = game.player;
  assert.ok(prevX !== x || prevY !== y, 'previous pose should differ after a step');
  game.step(1 / 60);
  assert.equal(game.player.prevX, x, 'previous pose should be last step\'s position');
  assert.equal(game.player.prevY, y);
});

check('a snake can cross its own body without dying', () => {
  const game = soloGame();
  game.player.grow(1200); // long enough to lap its own turning circle
  let laps = 0;
  for (let i = 0; i < 600; i++) {
    // Hold a hard turn: the head sweeps back through its own trail.
    game.setIntent(game.player.angle + 1, false);
    game.step(1 / 60);
    laps++;
    if (!game.player.alive) break;
  }
  assert.equal(game.player.alive, true, `died on its own body after ${laps} steps`);
  assert.ok(game.player.length > 1400, 'should still be long');
});

check('the arena rim is fatal', () => {
  const game = soloGame();
  let result = null;
  game.on('gameover', (r) => (result = r));
  game.player.spawn(WORLD.radius - 40, 0, 0); // pointed straight out
  for (let i = 0; i < 60 && game.player.alive; i++) {
    game.setIntent(0, false);
    game.step(1 / 60);
  }
  assert.equal(result?.cause, 'edge');
  assert.equal(game.running, false);
});

check('running into a rival ends the run and pays the rival', () => {
  const game = soloGame();
  let result = null;
  game.on('gameover', (r) => (result = r));

  const rival = game.snakes[1];
  rival.autopilot = false; // steer it by hand instead of letting the brain dodge
  rival.alive = true;
  rival.spawn(0, 0, 0);
  rival.grow(1200);
  for (let i = 0; i < 240; i++) rival.advance(1 / 60); // lay down a long wall

  const wall = rival.path[Math.floor(rival.path.length / 2)];
  game.player.spawn(wall.x, wall.y - 70, Math.PI / 2); // approach it side-on
  game.rebuildBodyGrid();
  game.rebuildFoodGrid();

  for (let i = 0; i < 60 && game.player.alive; i++) {
    game.setIntent(Math.PI / 2, false);
    game.step(1 / 60);
  }
  assert.equal(result?.cause, 'body');
  assert.equal(result.killer, rival.name);
  assert.equal(rival.kills, 1);
  assert.ok(rival.score >= 25, 'kill bounty not paid');
});

check('head-on collisions go to the longer snake', () => {
  const game = soloGame();
  const rival = game.snakes[1];
  rival.autopilot = false;
  rival.alive = true;

  game.player.spawn(-60, 0, 0);
  game.player.grow(400); // clearly the longer of the two
  rival.spawn(60, 0, Math.PI);
  game.rebuildBodyGrid();
  game.rebuildFoodGrid();

  for (let i = 0; i < 60 && game.player.alive && rival.alive; i++) {
    game.setIntent(0, false);
    rival.targetAngle = Math.PI;
    game.step(1 / 60);
  }
  assert.equal(game.player.alive, true, 'the longer snake should win the trade');
  assert.equal(rival.alive, false);
  assert.equal(game.player.kills, 1);
});

check('eating grows the snake and scores', () => {
  const game = soloGame();
  const before = { length: game.player.length, score: game.player.score };
  game.addFood(game.player.x + 30, game.player.y, 'pellet');
  game.rebuildBodyGrid();
  game.rebuildFoodGrid();
  for (let i = 0; i < 30 && game.player.score === before.score; i++) {
    game.setIntent(0, false);
    game.step(1 / 60);
  }
  assert.equal(game.player.score, before.score + FOOD.pellet.value);
  assert.ok(game.player.length > before.length, 'eating should lengthen the snake');
});

check('boost burns length and sheds crumbs, and refuses when too short', () => {
  const game = soloGame();
  game.player.grow(600);
  const startLength = game.player.length;

  for (let i = 0; i < 60; i++) {
    game.setIntent(0, true);
    game.step(1 / 60);
  }
  const burned = startLength - game.player.length;
  assert.ok(burned > SNAKE.boostDrain * 0.8, `expected to burn length, burned ${burned.toFixed(1)}`);
  assert.ok(
    game.food.some((f) => f.kind === 'crumb'),
    'boosting should drop crumbs',
  );

  assert.ok(Number.isInteger(game.player.score), `score went fractional: ${game.player.score}`);

  // Too short to boost: the request is simply ignored.
  game.player.length = SNAKE.minBoostLength - 10;
  game.setIntent(0, true);
  game.step(1 / 60);
  assert.equal(game.player.boosting, false);
});

check('steering is free-angle and rate limited', () => {
  const game = soloGame();
  const target = 0.37; // not a multiple of 90 degrees
  let maxStep = 0;
  let previous = game.player.angle;

  for (let i = 0; i < 120; i++) {
    game.setIntent(target, false);
    game.step(1 / 60);
    maxStep = Math.max(maxStep, Math.abs(game.player.angle - previous));
    previous = game.player.angle;
  }
  assert.ok(Math.abs(game.player.angle - target) < 0.001, 'should settle on the exact angle asked for');
  assert.ok(
    maxStep <= SNAKE.turnRate / 60 + 1e-9,
    `turned ${maxStep.toFixed(4)} rad in one step, limit is ${(SNAKE.turnRate / 60).toFixed(4)}`,
  );
});

check('dead rivals respawn at half score, the player never does', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;

  const rival = game.snakes[1];
  rival.score = 90;
  game.kill(rival, { cause: 'edge', killer: null });
  assert.equal(rival.alive, false);
  assert.equal(rival.score, 45, 'a dead rival should forfeit half its score');
  assert.ok(rival.respawnIn > 0);
  game.update(3200);
  assert.equal(rival.alive, true, 'rival should be back in the arena');

  game.kill(game.player, { cause: 'edge', killer: null });
  assert.equal(game.running, false);
  assert.equal(game.over, true);
  game.update(6000);
  assert.equal(game.player.alive, false, 'the player never respawns');
});

console.log(`\n${checks} checks passed\n`);
