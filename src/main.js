import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { Hud, safeName } from './hud.js';
import { Sound } from './audio.js';
import { Controls } from './input.js';
import { STORAGE_KEY, DIFFICULTY } from './config.js';
import { lerp } from './utils.js';
import { readStore, writeStore, formatTime } from './utils.js';

const $ = (id) => document.getElementById(id);

const canvas = $('stage');
const overlay = $('overlay');

const settings = readStore(STORAGE_KEY, {
  difficulty: 'normal',
  sound: true,
  best: { chill: 0, normal: 0, brutal: 0 },
});

const game = new Game();
const camera = new Camera();
const renderer = new Renderer(canvas);
const hud = new Hud(document);
const sound = new Sound(settings.sound);

/* ------------------------------------------------------------------ *
 * layout
 * ------------------------------------------------------------------ */

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.resize(width, height);
  camera.resize(width, height);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
document.addEventListener('fullscreenchange', () => {
  setTimeout(resize, 60);
  $('btn-full').setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
});
resize();

/* ------------------------------------------------------------------ *
 * screens
 * ------------------------------------------------------------------ */

/** @param {'start'|'pause'|'over'|'none'} name */
function setScreen(name) {
  overlay.dataset.screen = name;
  document.body.dataset.playing = String(name === 'none');
  if (name === 'none') {
    // Hand the keyboard back to the game.
    if (overlay.contains(document.activeElement)) document.activeElement.blur();
    return;
  }
  overlay.querySelector(`#screen-${name} [data-autofocus]`)?.focus({ preventScroll: true });
}

function startGame() {
  sound.unlock();
  controls.release();
  game.start({ difficulty: settings.difficulty });
  camera.snapTo(game.player);
  hud.mount(game);
  hud.toggle(false);
  setScreen('none');
}

function pauseGame() {
  if (!game.running || game.paused) return;
  controls.release();
  game.togglePause(true);
  setScreen('pause');
}

function resumeGame() {
  if (!game.running) return;
  game.togglePause(false);
  setScreen('none');
  sound.play('ui');
}

function openMenu() {
  game.running = false;
  game.paused = false;
  controls.release();
  setScreen('start');
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* denied or unsupported — the canvas already fills the viewport */
  }
}

/* ------------------------------------------------------------------ *
 * settings
 * ------------------------------------------------------------------ */

const persist = () => writeStore(STORAGE_KEY, settings);

function syncSettingsUi() {
  const radio = document.querySelector(`input[name="difficulty"][value="${settings.difficulty}"]`);
  if (radio) radio.checked = true;
  $('btn-sound').setAttribute('aria-pressed', String(settings.sound));
  $('best-label').textContent = `${DIFFICULTY[settings.difficulty].label} best · ${
    settings.best[settings.difficulty] ?? 0
  }`;
}

function toggleSound(force) {
  settings.sound = force ?? !settings.sound;
  sound.enabled = settings.sound;
  if (settings.sound) {
    sound.unlock();
    sound.play('ui');
  }
  persist();
  syncSettingsUi();
}

/* ------------------------------------------------------------------ *
 * wiring
 * ------------------------------------------------------------------ */

const controls = new Controls({
  surface: canvas,
  joystick: $('joystick'),
  onAction: (action) => {
    const screen = overlay.dataset.screen;
    switch (action) {
      case 'pause':
        if (screen === 'none') pauseGame();
        else if (screen === 'pause') resumeGame();
        break;
      case 'confirm':
        if (screen === 'start' || screen === 'over') startGame();
        else if (screen === 'pause') resumeGame();
        break;
      case 'restart':
        if (screen !== 'start') startGame();
        break;
      case 'mute':
        toggleSound();
        break;
      case 'fullscreen':
        toggleFullscreen();
        break;
      case 'stats':
        hud.toggle();
        break;
      default:
        break;
    }
  },
});

document.querySelectorAll('input[name="difficulty"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    settings.difficulty = input.value;
    persist();
    syncSettingsUi();
    sound.play('ui');
  });
});

$('btn-play').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-menu').addEventListener('click', openMenu);
$('btn-menu-over').addEventListener('click', openMenu);
$('btn-sound').addEventListener('click', () => toggleSound());
$('btn-full').addEventListener('click', toggleFullscreen);
$('btn-pause').addEventListener('click', () => {
  if (!game.running) return;
  game.paused ? resumeGame() : pauseGame();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

/* ------------------------------------------------------------------ *
 * game events
 * ------------------------------------------------------------------ */

game.on('go', () => sound.play('go'));
game.on('eat', ({ snake, kind }) => {
  if (snake.isPlayer) sound.play(kind === 'remains' ? 'bonus' : 'eat');
});
game.on('kill', ({ killer }) => {
  if (killer.isPlayer) sound.play('bonus');
});
game.on('death', ({ snake, killer }) => {
  sound.play(snake.isPlayer ? 'die' : 'kill');
  if (snake.isPlayer) {
    camera.knock(16);
    return;
  }
  if (killer?.isPlayer) {
    camera.knock(7);
    hud.notify(`You took out <b>${safeName(snake.name)}</b>`, 'good');
    return;
  }

  // In an arena this size most deaths happen out of sight. Report the ones
  // near enough to matter, and the ones that shift the top of the board.
  const near = Math.hypot(snake.x - game.player.x, snake.y - game.player.y) < 3500;
  const rank = game.rankOf(snake);
  if (!near && rank > 3) return;

  const by = killer ? ` by <b>${safeName(killer.name)}</b>` : '';
  const where = near ? '' : ` <span class="feed-rank">#${rank}</span>`;
  hud.notify(`<b>${safeName(snake.name)}</b>${where} went down${by}`);
});
game.on('respawn', () => sound.play('respawn'));

const CAUSE_TEXT = {
  edge: () => 'You drifted over the rim of the arena.',
  body: (killer) => `You ran into ${killer ?? 'another snake'}.`,
  head: (killer) =>
    killer ? `${killer} was longer in a head-on hit.` : 'Head-on collision — nobody walked away.',
};

game.on('gameover', (result) => {
  controls.release();

  const previousBest = settings.best[result.difficulty] ?? 0;
  const isRecord = result.score > previousBest;
  if (isRecord) {
    settings.best[result.difficulty] = result.score;
    persist();
  }
  syncSettingsUi();

  $('over-title').textContent =
    result.rank === 1 ? 'Arena champion' : result.rank <= 3 ? 'So close' : 'Game over';
  $('over-cause').textContent = (CAUSE_TEXT[result.cause] ?? (() => 'You died.'))(result.killer);
  $('over-score').textContent = String(result.score);
  $('over-rank').textContent = `${result.rank} / ${result.total}`;
  $('over-kills').textContent = String(result.kills);
  $('over-length').textContent = String(result.length);
  $('over-time').textContent = formatTime(result.time);
  $('over-best').textContent = String(Math.max(previousBest, result.score));
  $('over-record').hidden = !isRecord;

  setScreen('over');
});

/* ------------------------------------------------------------------ *
 * main loop
 * ------------------------------------------------------------------ */

let last = performance.now();

function frame(now) {
  const ms = Math.min(now - last, 100);
  last = now;

  const direction = controls.direction;
  game.setIntent(direction ? Math.atan2(direction.y, direction.x) : null, controls.boost);
  game.update(ms);

  // Follow the interpolated head, not the last simulation step, or the camera
  // reintroduces the judder the interpolation just removed.
  const player = game.player;
  const rx = lerp(player.prevX, player.x, game.alpha);
  const ry = lerp(player.prevY, player.y, game.alpha);
  if (!game.paused) camera.follow(player, ms, rx, ry);

  renderer.draw(game, camera, now);
  hud.update(game, settings.best[settings.difficulty] ?? 0);

  requestAnimationFrame(frame);
}

// Show a still of the arena behind the start screen rather than blank paper.
game.preview();
game.player.x = 0;
game.player.y = 0;
camera.snapTo(game.player);
hud.mount(game);
syncSettingsUi();
setScreen('start');
requestAnimationFrame(frame);
