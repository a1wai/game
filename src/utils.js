/** Tiny helpers shared across modules. No dependencies, no surprises. */

export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const randRange = (min, max) => min + Math.random() * (max - min);

export const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Shortest signed distance from angle `a` to angle `b`, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotate `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current, target, maxStep) {
  return current + clamp(angleDiff(current, target), -maxStep, maxStep);
}

/** Squared distance — avoids a sqrt in hot comparison loops. */
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** 01:07 style clock from milliseconds. */
export function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Deterministic PRNG, so the illustrated background looks the same every load. */
export function mulberry32(seed) {
  return function random() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
