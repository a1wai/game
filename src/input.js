/** Keyboard, swipe and on-screen d-pad, normalised into two callbacks. */

const KEY_DIRS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

const KEY_ACTIONS = {
  Space: 'pause',
  KeyP: 'pause',
  Escape: 'pause',
  Enter: 'confirm',
  KeyR: 'restart',
  KeyM: 'mute',
};

const SWIPE_THRESHOLD = 24;

/**
 * @param {{surface: HTMLElement, pad: HTMLElement|null,
 *          onTurn: (dir: string) => void, onAction: (action: string) => void}} opts
 */
export function bindInput({ surface, pad, onTurn, onAction }) {
  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;

    const dir = KEY_DIRS[event.code];
    if (dir) {
      event.preventDefault();
      onTurn(dir);
      return;
    }

    const action = KEY_ACTIONS[event.code];
    if (action) {
      // Space/Enter belong to whatever control is focused — but only while that
      // control is actually on screen. A button inside a hidden overlay keeps
      // focus, and must not swallow the pause key mid-game.
      if (event.code === 'Space' || event.code === 'Enter') {
        const el = document.activeElement;
        const tag = el?.tagName;
        const onScreen =
          typeof el?.checkVisibility === 'function'
            ? el.checkVisibility({ visibilityProperty: true })
            : true;
        if ((tag === 'BUTTON' || tag === 'INPUT') && onScreen) return;
      }
      event.preventDefault();
      onAction(action);
    }
  });

  let startX = 0;
  let startY = 0;
  let tracking = false;

  surface.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') return;
      tracking = true;
      startX = event.clientX;
      startY = event.clientY;
    },
    { passive: true },
  );

  const finishSwipe = (event) => {
    if (!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    onTurn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };

  surface.addEventListener('pointerup', finishSwipe, { passive: true });
  surface.addEventListener('pointercancel', () => (tracking = false), { passive: true });

  if (pad) {
    pad.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('[data-dir]');
      if (!button) return;
      event.preventDefault();
      onTurn(button.dataset.dir);
    });
  }
}
