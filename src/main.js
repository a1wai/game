import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';
import { bindInput } from './input.js';
import { STORAGE_KEY, DIFFICULTY } from './config.js';
import { readStore, writeStore, formatTime } from './utils.js';

const $ = (id) => document.getElementById(id);

const overlay = $('overlay');
const canvas = $('board');
const surface = $('surface');

const settings = readStore(STORAGE_KEY, {
  difficulty: 'normal',
  wrap: false,
  sound: true,
  best: { chill: 0, normal: 0, brutal: 0 },
});

const game = new Game();
const renderer = new Renderer(canvas);
const hud = new Hud(document);
const sound = new Sound(settings.sound);

/* ------------------------------------------------------------------ *
 * screens
 * ------------------------------------------------------------------ */

/** @param {'start'|'pause'|'over'|'none'} name */
function setScreen(name) {
  overlay.dataset.screen = name;
  document.body.dataset.playing = String(name === 'none');
  if (name === 'none') {
    // Hand the keyboard back to the game, otherwise the button that started the
    // round keeps focus and eats Space.
    if (overlay.contains(document.activeElement)) document.activeElement.blur();
    return;
  }
  const focus = overlay.querySelector(`#screen-${name} [data-autofocus]`);
  focus?.focus({ preventScroll: true });
}

function startGame() {
  sound.unlock();
  game.start({ difficulty: settings.difficulty, wrap: settings.wrap });
  hud.mount(game);
  setScreen('none');
}

function pauseGame() {
  if (!game.running || game.paused) return;
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
  setScreen('start');
}

/* ------------------------------------------------------------------ *
 * settings
 * ------------------------------------------------------------------ */

function persist() {
  writeStore(STORAGE_KEY, settings);
}

function syncSettingsUi() {
  const radio = document.querySelector(`input[name="difficulty"][value="${settings.difficulty}"]`);
  if (radio) radio.checked = true;
  $('opt-wrap').checked = settings.wrap;
  $('btn-sound').setAttribute('aria-pressed', String(settings.sound));
  $('best-label').textContent = `${DIFFICULTY[settings.difficulty].label} best: ${
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

document.querySelectorAll('input[name="difficulty"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    settings.difficulty = input.value;
    persist();
    syncSettingsUi();
    sound.play('ui');
  });
});

$('opt-wrap').addEventListener('change', (event) => {
  settings.wrap = event.target.checked;
  persist();
});

$('btn-play').addEventListener('click', startGame);
$('btn-again').addEventListener('click', startGame);
$('btn-resume').addEventListener('click', resumeGame);
$('btn-menu').addEventListener('click', openMenu);
$('btn-menu-over').addEventListener('click', openMenu);
$('btn-restart').addEventListener('click', () => {
  if (game.running || game.over) startGame();
});
$('btn-pause').addEventListener('click', () => {
  if (!game.running) return;
  game.paused ? resumeGame() : pauseGame();
});
$('btn-sound').addEventListener('click', () => toggleSound());

bindInput({
  surface,
  pad: $('dpad'),
  onTurn: (dir) => game.queueTurn(dir),
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
      default:
        break;
    }
  },
});

window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
window.addEventListener('blur', () => pauseGame());

/* ------------------------------------------------------------------ *
 * game events -> sound + end screen
 * ------------------------------------------------------------------ */

game.on('go', () => sound.play('go'));
game.on('eat', ({ snake, type }) => {
  if (snake.isPlayer) sound.play(type === 'remains' ? 'bonus' : 'eat');
});
game.on('kill', ({ killer }) => {
  if (killer.isPlayer) sound.play('bonus');
});
game.on('death', ({ snake }) => {
  sound.play(snake.isPlayer ? 'die' : 'kill');
});
game.on('respawn', () => sound.play('respawn'));

const CAUSE_TEXT = {
  wall: () => 'You slammed into the wall.',
  self: () => 'You bit your own tail.',
  body: (killer) => `You crashed into ${killer ?? 'another snake'}.`,
  head: (killer) =>
    killer ? `${killer} out-sized you in a head-on hit.` : 'Head-on collision — nobody walked away.',
};

game.on('gameover', (result) => {
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
  const dt = Math.min(now - last, 100);
  last = now;

  game.update(dt);
  renderer.draw(game, now);
  hud.update(game, settings.best[settings.difficulty] ?? 0);

  requestAnimationFrame(frame);
}

hud.mount(game);
syncSettingsUi();
setScreen('start');
requestAnimationFrame(frame);
