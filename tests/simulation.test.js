/**
 * Headless simulation checks — no DOM, no browser.
 * Run with: npm test
 *
 * The game module is deliberately free of DOM access so the rules can be
 * exercised like any other library.
 */
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { decideDirection } from '../src/ai.js';

let checks = 0;
const check = (label, fn) => {
  fn();
  checks++;
  console.log(`  ✓ ${label}`);
};

/** Drive the player with the same brain the rivals use, so rounds last. */
function autopilot(game) {
  const player = game.player;
  if (!player.alive) return;
  const dir = decideDirection(player, {
    board: game.board,
    blocked: game.buildOccupancy(),
    risky: game.buildRisk(player),
    food: new Set(game.food.keys()),
    tuning: game.difficulty.tuning,
  });
  game.queueTurn(dir);
}

function assertInvariants(game) {
  for (const snake of game.snakes) {
    if (!snake.alive) continue;
    const seen = new Set();
    for (const cell of snake.body) {
      assert.ok(
        game.board.inBounds(cell.x, cell.y),
        `${snake.name} left the board at ${cell.x},${cell.y}`,
      );
      const key = game.board.index(cell.x, cell.y);
      assert.ok(!seen.has(key), `${snake.name} overlaps itself at ${cell.x},${cell.y}`);
      seen.add(key);
    }
    assert.ok(snake.length >= 1, `${snake.name} has no body`);
  }
}

console.log('Serpent Arena — simulation');

check('a fresh round spawns six snakes and a full pantry', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  assert.equal(game.snakes.length, 6);
  assert.equal(game.snakes.filter((s) => s.alive).length, 6);
  assert.equal(game.food.size, 10);
  assert.equal(game.player.length, 4);
});

check('3000 ticks stay legal (no overlaps, nothing off-board)', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  for (let i = 0; i < 3000; i++) {
    autopilot(game);
    game.tick();
    assertInvariants(game);
    if (!game.running) game.start({ difficulty: 'normal' }); // player died, run another round
  }
});

check('snakes actually compete: food is eaten and rivals die', () => {
  const game = new Game();
  game.start({ difficulty: 'brutal' });
  game.countdown = 0;
  let deaths = 0;
  game.on('death', () => deaths++);
  for (let i = 0; i < 1500 && game.running; i++) {
    autopilot(game);
    game.tick();
  }
  const totalScore = game.snakes.reduce((sum, s) => sum + s.score, 0);
  assert.ok(totalScore > 0, 'nobody scored in 1500 ticks');
  assert.ok(deaths > 0, 'no snake ever died in 1500 ticks');
});

check('dead rivals respawn, the player does not', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  const rival = game.snakes[1];
  rival.score = 90;
  game.kill(rival, { cause: 'wall', killer: null });
  assert.equal(rival.alive, false);
  assert.equal(rival.score, 45, 'a dead rival should forfeit half its score');
  assert.ok(rival.respawnIn > 0);
  game.update(3000);
  assert.equal(rival.alive, true, 'rival should be back in the arena');

  game.kill(game.player, { cause: 'wall', killer: null });
  assert.equal(game.running, false);
  assert.equal(game.over, true);
  game.update(5000);
  assert.equal(game.player.alive, false, 'the player never respawns');
});

check('walls kill the player', () => {
  const game = new Game();
  game.start({ difficulty: 'normal', wrap: false });
  game.countdown = 0;
  let result = null;
  game.on('gameover', (r) => (result = r));
  game.player.body = [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 }];
  game.player.dir = 'left';
  game.tick(); // -> x = 0
  game.tick(); // -> off the board
  assert.ok(result, 'no gameover event');
  assert.equal(result.cause, 'wall');
});

check('wrap mode carries the player through the edge instead', () => {
  const game = new Game();
  game.start({ difficulty: 'normal', wrap: true });
  game.countdown = 0;
  game.player.body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
  game.player.dir = 'left';
  game.tick();
  assert.equal(game.player.alive, true);
  assert.equal(game.player.head.x, game.board.cols - 1);
});

check('biting your own body ends the run', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  let result = null;
  game.on('gameover', (r) => (result = r));
  game.player.body = [
    { x: 10, y: 10 },
    { x: 11, y: 10 },
    { x: 11, y: 11 },
    { x: 10, y: 11 },
    { x: 9, y: 11 },
  ];
  game.player.dir = 'down'; // straight into body[3]
  game.tick();
  assert.equal(result?.cause, 'self');
});

check('crashing into a rival ends the run and pays the rival', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  let result = null;
  game.on('gameover', (r) => (result = r));

  const rival = game.snakes[1];
  rival.autopilot = false; // steer it by hand instead of letting the brain dodge
  game.snakes.slice(2).forEach((s) => (s.alive = false));
  rival.body = [
    { x: 20, y: 10 },
    { x: 20, y: 11 },
    { x: 20, y: 12 },
    { x: 20, y: 13 },
  ];
  rival.dir = 'up';
  rival.score = 0;
  game.player.body = [
    { x: 19, y: 12 },
    { x: 18, y: 12 },
    { x: 17, y: 12 },
  ];
  game.player.dir = 'right';
  // 20,12 is mid-body for the rival — its tail is at 20,13 and won't free the cell.
  game.tick();
  assert.equal(result?.cause, 'body');
  assert.equal(result.killer, rival.name);
  assert.equal(rival.kills, 1);
  assert.ok(rival.score >= 25, 'kill bounty not paid');
});

check('head-on collisions go to the longer snake', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  game.snakes.slice(2).forEach((s) => (s.alive = false));

  const rival = game.snakes[1];
  rival.autopilot = false;
  // Player is longer by one segment, so it should survive the trade.
  game.player.body = [
    { x: 10, y: 5 },
    { x: 9, y: 5 },
    { x: 8, y: 5 },
    { x: 7, y: 5 },
  ];
  game.player.dir = 'right';
  rival.body = [
    { x: 12, y: 5 },
    { x: 13, y: 5 },
    { x: 14, y: 5 },
  ];
  rival.dir = 'left';
  game.tick(); // both aim at 11,5
  assert.equal(game.player.alive, true, 'longer snake should win the head-on');
  assert.equal(rival.alive, false);
  assert.equal(game.player.kills, 1);
});

check('turn buffer refuses reversals and holds at most two turns', () => {
  const game = new Game();
  game.start({ difficulty: 'normal' });
  game.countdown = 0;
  game.player.dir = 'right';
  game.queueTurn('left'); // reversal, ignored
  assert.equal(game.turnQueue.length, 0);
  game.queueTurn('up');
  game.queueTurn('left');
  game.queueTurn('down'); // reversal of the queued 'left', ignored
  game.queueTurn('up');
  assert.deepEqual(game.turnQueue, ['up', 'left']);
});

console.log(`\n${checks} checks passed\n`);
