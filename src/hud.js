import { formatTime } from './utils.js';

/** Rivals shown in the standings before the list is trimmed. */
const BOARD_LIMIT = 8;

/** How long a kill-feed line stays up. */
const FEED_TTL = 3600;

/**
 * Heads-up display: a small tab showing score and rank that expands into the
 * full standings when pressed, plus a short-lived feed of what just happened.
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
      alive: root.getElementById('stat-alive'),
      feed: root.getElementById('feed'),
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
    this.signature = ''; // force a repaint of whatever just became visible
  }

  mount(game) {
    this.el.board.replaceChildren();
    this.rows.clear();
    this.signature = '';
    this.clearFeed();

    for (const snake of game.snakes) {
      const row = document.createElement('li');
      row.className = 'lb-row';
      if (snake.isPlayer) row.dataset.you = 'true';
      row.style.setProperty('--dot', snake.color);
      row.innerHTML = `
        <span class="lb-rank"></span>
        <span class="lb-dot" aria-hidden="true"></span>
        <span class="lb-name"></span>
        <span class="lb-type"></span>
        <span class="lb-kills" title="Kills"></span>
        <span class="lb-score"></span>
      `;
      row.querySelector('.lb-name').textContent = snake.name;
      row.querySelector('.lb-type').textContent = snake.archetype ? snake.archetype.label : '';
      this.el.board.append(row);
      this.rows.set(snake.id, row);
    }
  }

  update(game, best = 0) {
    const rank = game.rankOf(game.player);

    // The tab is always visible, so keep it cheap: only the two numbers.
    if (this.tabScore !== game.player.score || this.tabRank !== rank) {
      this.tabScore = game.player.score;
      this.tabRank = rank;
      this.el.tabScore.textContent = String(game.player.score);
      this.el.tabRank.textContent = `#${rank}`;
    }

    if (!this.open) return; // nothing else is on screen

    const board = game.leaderboard();
    const signature = `${game.player.score}|${rank}|${best}|${game.aliveCount}|${Math.floor(
      game.elapsed / 500,
    )}|${board.map((s) => `${s.id}:${s.score}:${s.alive ? 1 : 0}:${s.kills}`).join(',')}`;
    if (signature === this.signature) return;
    this.signature = signature;

    this.el.time.textContent = formatTime(game.elapsed);
    this.el.length.textContent = String(Math.round(game.player.length));
    this.el.kills.textContent = String(game.player.kills);
    this.el.best.textContent = String(best);
    this.el.alive.textContent = String(game.aliveCount);

    board.forEach((snake, index) => {
      const row = this.rows.get(snake.id);
      if (!row) return;
      // Sixteen rows is a wall — show the leaders, and always you.
      row.hidden = index >= BOARD_LIMIT && !snake.isPlayer;
      if (row.hidden) return;
      row.style.order = String(index);
      row.dataset.dead = snake.alive ? 'false' : 'true';
      row.querySelector('.lb-rank').textContent = String(index + 1);
      row.querySelector('.lb-kills').textContent = snake.kills ? String(snake.kills) : '';
      row.querySelector('.lb-score').textContent = String(snake.score);
    });
  }

  /* ------------------------------------------------------------------ *
   * kill feed
   * ------------------------------------------------------------------ */

  notify(html, tone = 'neutral') {
    const line = document.createElement('p');
    line.className = 'feed-line';
    line.dataset.tone = tone;
    line.innerHTML = html;
    this.el.feed.append(line);

    while (this.el.feed.childElementCount > 4) this.el.feed.firstElementChild.remove();

    setTimeout(() => {
      line.dataset.leaving = 'true';
      setTimeout(() => line.remove(), 400);
    }, FEED_TTL);
  }

  clearFeed() {
    this.el.feed.replaceChildren();
  }
}

/** Escape a snake name before it goes near innerHTML. */
export function safeName(name) {
  return String(name).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
