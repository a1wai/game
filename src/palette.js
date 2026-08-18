/**
 * Every session gets its own colour scheme.
 *
 * A random base hue seeds the player, and rivals are spaced around the wheel by
 * the golden angle so no two are ever confusable. Everything is generated at
 * high chroma against a near-black arena, which is where the contrast comes
 * from — no muted pastels.
 */

const GOLDEN_ANGLE = 137.508;

function hsl(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * @param {number} rivalCount
 * @returns {{player: object, rivals: object[], food: string[], accent: string,
 *            accentSoft: string, hue: number}}
 */
export function makePalette(rivalCount) {
  const hue = Math.random() * 360;

  const player = {
    hue,
    color: hsl(hue, 92, 60),
    soft: hsl(hue, 96, 76),
    core: hsl(hue, 100, 88),
  };

  const rivals = [];
  for (let i = 0; i < rivalCount; i++) {
    const h = hue + GOLDEN_ANGLE * (i + 1);
    // Alternate lightness a little so neighbouring hues stay tellable apart.
    const light = 58 + (i % 3) * 5;
    rivals.push({
      hue: h,
      color: hsl(h, 84, light),
      soft: hsl(h, 90, light + 16),
      core: hsl(h, 96, light + 28),
    });
  }

  // Pellets pick up the same family, kept bright so they read as light.
  const food = [];
  for (let i = 0; i < 6; i++) {
    food.push(hsl(hue + 40 + i * 47, 88, 66));
  }

  return { hue, player, rivals, food, accent: player.color, accentSoft: player.soft };
}
