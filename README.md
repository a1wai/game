# 🐍 Serpent Arena

Competitive snake, played the way slither.io plays: an open arena, free-angle
steering, boost, and **five rival snakes** that hunt the same food you do.

You are the only one who stays dead. Rivals respawn a couple of seconds after
they die — you get one life. Your own body is harmless; everyone else's is not.

No frameworks, no build step, no dependencies — plain ES modules and one
fullscreen `<canvas>`.

---

## Play locally

ES modules need to be served over HTTP (opening `index.html` from disk won't
work). Any static server will do:

```bash
python3 -m http.server 5173      # already on most machines
npx serve . --listen 5173        # or: npm run dev
```

Then open <http://localhost:5173>.

## Controls

**Keyboard** — the snake turns toward whatever direction you hold, at a limited
turn rate, so paths are curves rather than right angles.

| Action     | Key                            |
| ---------- | ------------------------------ |
| Steer      | `W` `A` `S` `D` or arrow keys  |
| Boost      | `Space` or `Shift` (hold)      |
| Standings  | `Tab`                          |
| Pause      | `Esc` or `P`                   |
| Restart    | `R`                            |
| Fullscreen | `F`                            |
| Mute       | `M`                            |

**Touch** — a joystick and nothing else. Put a finger down anywhere and the
stick plants itself there; drag to steer at any angle. While steering, a
**second finger anywhere on the screen holds boost**. Lift the stick and the
snake keeps its heading.

## Rules

- **Pellets** are `+10` and a little length. They're pulled in as you pass, so
  you don't have to hit them dead on.
- **Boost** burns length as fuel and sheds it back into the arena as crumbs. It
  won't engage once you're short.
- **You never collide with yourself.** Loop through your own body as much as you
  like — the only lethal things are rival bodies and the rim.
- **Ramming a rival's body** is `+25` and a kill. They drop their whole body as
  bonus food.
- **Head-on hits** go to the longer snake. Near-equal lengths take each other out.
- **A rival that dies keeps only half its score.** They respawn forever, so
  without this the standings would be unwinnable for a one-life player — and
  taking someone down would mean nothing.

Difficulty changes rival speed and how sharply they steer:

| Difficulty | Rivals                                                        |
| ---------- | ------------------------------------------------------------- |
| Chill      | Slower, careless, rarely come after you                        |
| Normal     | Steer properly, cut you off now and then                       |
| Brutal     | Faster, probe much further ahead, hunt shorter snakes on sight |

Best score is stored per difficulty in `localStorage`.

## Interface

The canvas fills the window (`F` for real fullscreen). The only permanent UI is
a small tab in the corner showing score and rank — **press it** for the full
standings, length, kills, time and best. A minimap sits bottom-right.

## How it fits together

```
index.html               markup + overlay screens
styles/main.css          chrome around the canvas
src/config.js            every tuning value (world, speeds, colours, AI weights)
src/snake.js             one competitor: a head plus the trail behind it
src/grid.js              uniform spatial hash, rebuilt each step
src/ai.js                rival steering brain
src/game.js              the simulation: movement, collisions, food, scoring
src/camera.js            follow camera and zoom
src/renderer.js          canvas painting
src/input.js             keyboard, joystick, boost
src/audio.js             WebAudio sound kit (no asset files)
src/hud.js               collapsible standings tab
src/main.js              wiring, screens, main loop
tests/simulation.test.js headless rule tests
```

Three things worth knowing before extending it:

**A snake is its own trail.** There's no list of body segments — the body *is*
the path the head has already travelled, trimmed to the snake's current length.
Eating extends the length, boosting burns it, and the tail point is interpolated
so it slides instead of popping.

**Collision is a spatial hash, rebuilt every step.** Trail points are inserted by
reference (they already exist), so the grid allocates nothing per frame. Points
near a snake's own head are skipped — that region is covered by the head-to-head
check instead, which is what makes "longer snake wins" possible.

**The rival brain is a steering behaviour, not a planner.** Each step it fans out
candidate headings, probes each one for bodies and for the rim, and scores them
against its current target — the nearest pellet, a rival worth cutting off, or a
wander point. Survival outweighs appetite, so they arc around obstacles instead
of driving through them.

**The look** is deliberately not neon: off-white paper, pale watercolour washes, a
faint dot lattice and a grain overlay, with every moving thing drawn as
translucent glass. Only pellets, boosting snakes and the rim carry a halo.

## Tests

```bash
npm test    # node tests/simulation.test.js
```

Covers spawning, sixty seconds of invariants, self-overlap being survivable, the
lethal rim, body and head-on kills, eating, boost mechanics, rate-limited
free-angle steering, and rival respawn. `src/game.js` never touches the DOM, so
the rules run headless in Node.

## Deploy

It's a static site — the repository root *is* the deployable artifact.

**GitHub Pages** — already wired up. Push to `main`, then set
*Settings → Pages → Source* to **GitHub Actions**. `.github/workflows/deploy.yml`
runs the tests and publishes.

**Netlify** — `netlify.toml` publishes the root with no build command.

**Vercel** — `vercel.json` is included; accept the "no framework" detection.

**Anything else** — Cloudflare Pages, S3, nginx: copy the files and serve them.

## License

MIT
