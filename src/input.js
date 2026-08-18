/**
 * Steering, normalised into one direction vector and a boost flag.
 *
 * Desktop is keyboard: WASD/arrows aim, Space or Shift boosts.
 * Touch is a joystick and nothing else — the first finger down plants the
 * stick wherever you touched and steers at any angle; any *second* touch,
 * anywhere on the screen, holds boost.
 */

const KEY_VECTORS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const BOOST_KEYS = new Set(['Space', 'ShiftLeft', 'ShiftRight']);

const ACTION_KEYS = {
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
  KeyR: 'restart',
  KeyM: 'mute',
  KeyF: 'fullscreen',
  Tab: 'stats',
};

const JOY_RADIUS = 62;
const JOY_DEADZONE = 7;

export class Controls {
  constructor({ surface, joystick, onAction }) {
    this.keys = new Set();
    this.onAction = onAction;

    this.joystick = joystick;
    this.joyPointer = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyVector = { x: 0, y: 0 };
    this.boostPointers = new Set();

    this.bindKeyboard();
    this.bindTouch(surface);
  }

  /* ------------------------------------------------------------------ */

  bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (KEY_VECTORS[event.code] || BOOST_KEYS.has(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        return;
      }
      if (event.repeat) return;

      const action = ACTION_KEYS[event.code];
      if (!action) return;
      // Enter belongs to whatever button is focused, but only while it's visible.
      if (event.code === 'Enter') {
        const el = document.activeElement;
        const visible =
          typeof el?.checkVisibility === 'function'
            ? el.checkVisibility({ visibilityProperty: true })
            : true;
        if (el?.tagName === 'BUTTON' && visible) return;
      }
      event.preventDefault();
      this.onAction(action);
    });

    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    // Alt-tabbing away must not leave a key stuck down.
    window.addEventListener('blur', () => this.keys.clear());
  }

  bindTouch(surface) {
    surface.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;

      if (this.joyPointer === null) {
        this.joyPointer = event.pointerId;
        this.joyOrigin = { x: event.clientX, y: event.clientY };
        this.joyVector = { x: 0, y: 0 };
        this.showJoystick();
      } else {
        // Anything after the stick is a boost press.
        this.boostPointers.add(event.pointerId);
      }
    });

    surface.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.joyPointer) return;
      const dx = event.clientX - this.joyOrigin.x;
      const dy = event.clientY - this.joyOrigin.y;
      const distance = Math.hypot(dx, dy);

      if (distance > JOY_RADIUS) {
        // Drag the base along so the stick never runs out of travel.
        const excess = distance - JOY_RADIUS;
        this.joyOrigin.x += (dx / distance) * excess;
        this.joyOrigin.y += (dy / distance) * excess;
      }
      this.joyVector = {
        x: event.clientX - this.joyOrigin.x,
        y: event.clientY - this.joyOrigin.y,
      };
      this.showJoystick();
    });

    const release = (event) => {
      if (event.pointerId === this.joyPointer) {
        this.joyPointer = null;
        this.joyVector = { x: 0, y: 0 };
        this.hideJoystick();
      } else {
        this.boostPointers.delete(event.pointerId);
      }
    };
    surface.addEventListener('pointerup', release);
    surface.addEventListener('pointercancel', release);
  }

  /* ------------------------------------------------------------------ */

  showJoystick() {
    if (!this.joystick) return;
    const { x, y } = this.joyOrigin;
    this.joystick.style.transform = `translate(${x}px, ${y}px)`;
    this.joystick.dataset.active = 'true';
    const thumb = this.joystick.firstElementChild;
    if (thumb) {
      thumb.style.transform = `translate(${this.joyVector.x}px, ${this.joyVector.y}px)`;
    }
  }

  hideJoystick() {
    if (!this.joystick) return;
    this.joystick.dataset.active = 'false';
  }

  /** Unit vector the player is asking for, or null for "carry on". */
  get direction() {
    if (this.joyPointer !== null) {
      const { x, y } = this.joyVector;
      const distance = Math.hypot(x, y);
      if (distance < JOY_DEADZONE) return null;
      return { x: x / distance, y: y / distance };
    }

    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const vector = KEY_VECTORS[code];
      if (vector) {
        x += vector[0];
        y += vector[1];
      }
    }
    if (x === 0 && y === 0) return null;
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  }

  get boost() {
    if (this.boostPointers.size > 0) return true;
    for (const code of this.keys) if (BOOST_KEYS.has(code)) return true;
    return false;
  }

  /** Drop every held input — used when a round ends or the game pauses. */
  release() {
    this.keys.clear();
    this.boostPointers.clear();
    this.joyPointer = null;
    this.joyVector = { x: 0, y: 0 };
    this.hideJoystick();
  }
}
