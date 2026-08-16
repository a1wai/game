# 🐍 Serpent Arena

Competitive snake. You against **five rival snakes** in one arena — and only one of
you stays dead.

Rivals hunt the same pellets you do, dodge, cut corners and fight over space. Touch
one of them, bite your own tail, or kiss a wall and the run is over. Kill a rival and
it drops its body as bonus food, then respawns to come after you again.

No frameworks, no build step, no dependencies — plain ES modules and one `<canvas>`.

---

## Play locally

The game uses ES modules, so it needs to be served over HTTP (opening
`index.html` from the file system won't work). Any static server will do:

```bash
# Python — already on most machines
python3 -m http.server 5173

# or Node
npx serve . --listen 5173
# or
npm run dev
```

Then open <http://localhost:5173>.

## Controls

| Action  | Keyboard                     | Touch              |
| ------- | ---------------------------- | ------------------ |
| Steer   | `W` `A` `S` `D` or arrow keys | Swipe or the d-pad |
| Pause   | `Space` / `Esc` / `P`         | ⏸ button           |
| Restart | `R`                           | ↻ button           |
| Mute    | `M`                           | 🔈 button          |

Two turns are buffered, so a fast "right then up" both register instead of the
second one being swallowed.

## Rules

- **Pellets** — `+10` and one extra segment.
- **Remains** — `+15`. Dropped by any snake that dies. Grab them before the rivals do.
- **Ramming a rival's body** — `+25` and a kill for you. They respawn after a couple of
  seconds. You don't.
- **A rival that dies keeps only half its score.** Rivals respawn forever, so without
  this the leaderboard would be unwinnable for a one-life player — and taking someone
  down would mean nothing.
- **Head-on collisions** — the longer snake survives. Equal length, both die.
- **Walls** — lethal by default. Flip on *wrap-around walls* on the start screen if you
  prefer the edges to teleport you.
- **Death** — walls, your own tail, or any part of a rival. One life, no continues.

Three difficulties change both the tick rate and how sharply the rivals play:

| Difficulty | Speed  | Rivals                                             |
| ---------- | ------ | -------------------------------------------------- |
| Chill      | 132 ms | Careless — they trap themselves fairly often        |
| Normal     | 104 ms | Play properly, mostly avoid head-on losses          |
| Brutal     | 82 ms  | Rarely misstep, plan around your head, contest food |

Best score is stored per difficulty in `localStorage`.

## How it fits together

```
index.html              markup + overlay screens
styles/main.css         layout, chrome, responsive rules
src/config.js           all tuning values (grid, speeds, colours, AI weights)
src/board.js            grid geometry, wrap-aware stepping
src/snake.js            one competitor
src/ai.js               rival brain
src/game.js             the simulation: ticks, collisions, food, scoring
src/renderer.js         canvas painting
src/input.js            keyboard, swipe, d-pad
src/audio.js            WebAudio sound kit (no asset files)
src/hud.js              live leaderboard + stats
src/main.js             wiring, screens, main loop
tests/simulation.test.js headless rule tests
```

Two design notes worth knowing if you want to extend it:

**The rival brain** (`src/ai.js`) runs one breadth-first search per candidate move
that answers two questions at once — how much open space is reachable that way, and
how far the nearest pellet is. Space is weighted far above hunger, which is what
stops them from diving into dead ends the way a naive "walk toward the food" snake
does. Difficulty tunes the weights plus a probability of playing a deliberately
random move.

**Movement is simultaneous.** Every snake commits to a direction from the same
snapshot of the board, then all heads resolve at once — so a tail that is about to
move out of a cell doesn't block you, and two heads entering the same cell is a real
head-on trade rather than a first-come-first-served race.

## Tests

```bash
npm test    # node tests/simulation.test.js
```

Covers spawning, 3000 ticks of invariants (nothing overlaps, nothing leaves the
board), wall/self/body/head-on deaths, rival respawn, wrap mode and the turn buffer.
`src/game.js` never touches the DOM, so the rules run headless in Node.

## Deploy

It's a static site — the repository root *is* the deployable artifact.

**GitHub Pages** — already wired up. Push to `main`, then set
*Settings → Pages → Source* to **GitHub Actions**. `.github/workflows/deploy.yml`
runs the tests and publishes.

**Netlify** — `netlify.toml` publishes the root with no build command. Connect the
repo, or `npx netlify deploy --prod`.

**Vercel** — `vercel.json` is included. Connect the repo, or `npx vercel --prod`
and accept the "no framework" detection.

**Anything else** — Cloudflare Pages, S3, nginx, a USB stick: copy the files and
serve them. No build, no server-side code.

## License

MIT
