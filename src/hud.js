import { formatTime } from './utils.js';

/**
 * Live scoreboard. Rows are created once per round and then only reordered
 * (via flex `order`) and re-labelled, so ranking changes animate instead of
 * thrashing the DOM. A cheap signature check skips the work entirely on frames
 * where nothing visible changed.
 */
export class Hud {
  constructor(root = document) {
    this.el = {
      score: root.getElementById('stat-score'),
      best: root.getElementById('stat-best'),
      rank: root.getElementById('stat-rank'),
      alive: root.getElementById('stat-alive'),
      time: root.getElementById('stat-time'),
      board: root.getElementById('leaderboard'),
    };
    this.rows = new Map();
    this.signature = '';
  }

  mount(game) {
    this.el.board.replaceChildren();
    this.rows.clear();
    this.signature = '';

    for (const snake of game.snakes) {
      const row = document.createElement('li');
      row.className = 'lb-row';
      if (snake.isPlayer) row.dataset.you = 'true';
      row.style.setProperty('--dot', snake.color);
      row.innerHTML = `
        <span class="lb-rank"></span>
        <span class="lb-dot" aria-hidden="true"></span>
        <span class="lb-name"></span>
        <span class="lb-kills" title="Kills"></span>
        <span class="lb-len" title="Length"></span>
        <span class="lb-score"></span>
      `;
      row.querySelector('.lb-name').textContent = snake.name;
      this.el.board.append(row);
      this.rows.set(snake.id, row);
    }
  }

  update(game, best = 0) {
    const board = game.leaderboard();
    const signature = `${game.player.score}|${best}|${game.aliveCount}|${Math.floor(
      game.elapsed / 500,
    )}|${board.map((s) => `${s.id}:${s.score}:${s.length}:${s.kills}:${s.alive ? 1 : 0}`).join(',')}`;
    if (signature === this.signature) return;
    this.signature = signature;

    this.el.score.textContent = String(game.player.score);
    this.el.best.textContent = String(best);
    this.el.rank.textContent = `${game.rankOf(game.player)}/${game.snakes.length}`;
    this.el.alive.textContent = String(game.aliveCount);
    this.el.time.textContent = formatTime(game.elapsed);

    board.forEach((snake, index) => {
      const row = this.rows.get(snake.id);
      if (!row) return;
      row.style.order = String(index);
      row.dataset.dead = snake.alive ? 'false' : 'true';
      row.querySelector('.lb-rank').textContent = String(index + 1);
      row.querySelector('.lb-kills').textContent = snake.kills ? `${snake.kills}` : '';
      row.querySelector('.lb-len').textContent = snake.alive
        ? `${snake.length}`
        : snake.respawnIn > 0
          ? `${Math.max(1, Math.ceil(snake.respawnIn / 1000))}s`
          : '—';
      row.querySelector('.lb-score').textContent = String(snake.score);
    });
  }
}
