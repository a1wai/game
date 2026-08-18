import { formatTime } from './utils.js';

/**
 * Heads-up display: a small tab that shows just score and rank, and expands
 * into the full standings when pressed. Collapsed is the default so the arena
 * stays uncluttered.
 */
export class Hud {
  constructor(root = document) {
    this.el = {
      tab: root.getElementById('stat-tab'),
      tabScore: root.getElementById('tab-score'),
      tabRank: root.getElementById('tab-rank'),
      panel: root.getElementById('stat-panel'),
      board: root.getElementById('leaderboard'),
      time: root.getElementById('stat-time'),
      length: root.getElementById('stat-length'),
      kills: root.getElementById('stat-kills'),
      best: root.getElementById('stat-best'),
    };
    this.rows = new Map();
    this.signature = '';
    this.open = false;

    this.el.tab.addEventListener('click', () => this.toggle());
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.tab.setAttribute('aria-expanded', String(this.open));
    this.el.panel.hidden = !this.open;
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
        <span class="lb-score"></span>
      `;
      row.querySelector('.lb-name').textContent = snake.name;
      this.el.board.append(row);
      this.rows.set(snake.id, row);
    }
  }

  update(game, best = 0) {
    const rank = game.rankOf(game.player);
    const board = game.leaderboard();

    const signature = `${game.player.score}|${rank}|${best}|${Math.floor(game.elapsed / 500)}|${board
      .map((s) => `${s.id}:${s.score}:${s.alive ? 1 : 0}:${s.kills}`)
      .join(',')}`;
    if (signature === this.signature) return;
    this.signature = signature;

    this.el.tabScore.textContent = String(game.player.score);
    this.el.tabRank.textContent = `#${rank}`;

    if (!this.open) return; // nothing else is visible, so don't touch it

    this.el.time.textContent = formatTime(game.elapsed);
    this.el.length.textContent = String(Math.round(game.player.length));
    this.el.kills.textContent = String(game.player.kills);
    this.el.best.textContent = String(best);

    board.forEach((snake, index) => {
      const row = this.rows.get(snake.id);
      if (!row) return;
      row.style.order = String(index);
      row.dataset.dead = snake.alive ? 'false' : 'true';
      row.querySelector('.lb-rank').textContent = String(index + 1);
      row.querySelector('.lb-kills').textContent = snake.kills ? String(snake.kills) : '';
      row.querySelector('.lb-score').textContent = String(snake.score);
    });
  }
}
