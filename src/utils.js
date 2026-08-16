/** Tiny helpers shared across modules. No dependencies, no surprises. */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

/** Random integer in [min, max] inclusive. */
export const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** 01:07 style clock from milliseconds. */
export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** localStorage that never throws (private mode, disabled storage, quota). */
export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

export function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — scores just won't persist */
  }
}
