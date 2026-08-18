# 🐍 Serpent Arena

Competitive snake, played the way slither.io plays: a vast dark arena, free-angle
steering, boost, and **fifteen rival snakes** hunting the same food you do — each
of them a different kind of opponent.

Every round generates its own colour scheme, so no two sessions look alike.

You are the only one who stays dead. Rivals respawn seconds after they die, and
the arena is held at a minimum population, so it never empties out — you get one
life. Your own body is harmless; everyone else's is not.

No frameworks, no build step, no dependencies — plain ES modules and one
fullscreen `<canvas>`, running at a locked 60fps.

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
- **Boost is fuel, not a button.** It burns length fast enough that you shrink
  visibly within a second, and sheds that length back into the arena as crumbs
  for someone else to eat. The ring around your head is what's left; it turns red
  when you're nearly out, and boost refuses to engage below the floor. Holding it
  down is how you lose a lead.
- **You never collide with yourself.** Loop through your own body as much as you
  like — the only lethal things are rival bodies and the rim.
- **Ramming a rival's body** is `+25` and a kill. They drop their whole body as
  bonus food.
- **Head-on hits** go to the longer snake. Near-equal lengths take each other out.
- **A rival that dies keeps only half its score.** They respawn forever, so
  without this the standings would be unwinnable for a one-life player — and
  taking someone down would mean nothing.
- **At least ten snakes are always alive.** If deaths outpace the respawn queue,
  whoever is next skips the wait.

Difficulty changes rival speed and how sharply they steer:

| Difficulty | Rivals                                                        |
| ---------- | ------------------------------------------------------------- |
| Chill      | Slower, careless, rarely come after you                        |
| Normal     | Steer properly, cut you off now and then                       |
| Brutal     | Faster, probe much further ahead, hunt shorter snakes on sight |

Rivals aim straight at what they want whenever the line is clear, and only fan
out to compare headings when something is in the way. They also refuse targets
that sit inside their own turning circle — aim at one of those and a snake
orbits it forever, which is exactly how the early builds ended up drawing
circles in the middle of the map.

Best score is stored per difficulty in `localStorage`.

## Know your rivals

Every rival is one of five personalities, and they play genuinely differently —
not just faster or slower. Each has a matching weakness, so taking one down is a
different problem depending on who it is. They're named on screen and listed in
the menu.

| Rival    | Plays like                                | How you beat it                                        |
| -------- | ----------------------------------------- | ------------------------------------------------------ |
| Hunter   | Comes straight for you and commits        | It turns wide — bait it in, then cut back hard          |
| Glutton  | Eats everything and gets enormous         | Length is its problem; loop tight around its head       |
| Skittish | Bolts from anything bigger                | It flees in a straight line — drive it into the rim     |
| Weaver   | Wanders and jinks, never holds a line     | It stays short; meet it head-on and length wins         |
| Sentinel | Holds one food field, rarely errs         | It won't leave its field — cut through and force it in  |

Those aren't labels on identical code. Over 150-second rounds the profiles come
out clearly:

| Rival    | Avg length | Deaths |
| -------- | ---------- | ------ |
| Glutton  | 4430       | 14     |
| Sentinel | 4348       | 15     |
| Skittish | 3545       | 14     |
| Hunter   | 2383       | 33     |
| Weaver   | 2345       | 32     |

Gluttons and Sentinels are simply better snakes; Hunters take risks and pay for
them. Body length is capped — past a point a snake stops being an opponent and
starts being terrain.

## Interface

The canvas fills the window (`F` for real fullscreen). The only permanent UI is
a small tab in the corner showing score and rank — **press it** (or `Tab`) for
the standings, length, kills, time and best.

Because the arena is big enough to lose people in, three things keep you
oriented: a minimap bottom-right showing the food fields and everyone's
position, coloured dots at the screen edge pointing at rivals just out of view,
and a short kill feed for takedowns near you or at the top of the board.

## How it fits together

```
index.html               markup + overlay screens
styles/main.css          chrome around the canvas
src/config.js            every tuning value (world, speeds, AI weights)
src/palette.js           the per-round colour scheme
src/archetypes.js        rival personalities and their weaknesses
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

**The look** is high contrast on near-black: solid, saturated bodies with a dark
casing so they separate where they cross, a bright filament down the middle, and
an additive halo along the length. Colours are generated per round from a random
base hue, spaced around the wheel by the golden angle so no two rivals are ever
confusable — and the menu picks up the same accent.

**On three.js:** it isn't used here, and I'd advise against it for this game.
Three.js is a scene graph for 3D; this is 2D, and the renderer is already pinned
to vsync with roughly 2x headroom *on a software rasteriser with no GPU at all*
(measurements below). Adding it would mean ~600KB of dependency and a full
renderer rewrite to buy performance that isn't missing. The one thing WebGL would
genuinely give — real bloom — is already here as a cheap Canvas2D pass. If you
want the port anyway, say so and I'll do it.

## Performance

The target was a locked 60fps with sixteen snakes and a few thousand pellets, and
it holds — measured in Chromium at 1600x900 and on a phone-sized touch viewport:
**p50 16.7ms, p95 16.7ms, and effectively zero dropped frames**, with roughly 2x
headroom left over on a software rasteriser with no GPU at all.

**Quality auto-tunes.** Bloom — a blurred copy of the frame added back over
itself — looks superb on a GPU and is far too expensive on a software rasteriser,
where it halved the framerate. So the renderer times its own draw calls and
switches bloom off if a frame is costing too much. Frame *interval* can't be used
for this: vsync pins it at 16.7ms and hides how much headroom is left. With bloom
off the additive halo along each body keeps the glow, so nothing looks broken —
it just costs less.

The rest, roughly in order of impact:

- **Nothing full-screen is drawn twice.** The arena floor — disc, colour clouds
  and rim band — is baked once into a single texture and blitted; soft gradients
  upscale invisibly. The vignette and grain are baked into a second screen-sized
  layer at resize. Painting those live cost more than everything else combined.
- **The simulation is interpolated, not sampled.** Physics runs on a fixed 60Hz
  step; every snake keeps its previous pose, and the renderer draws between the
  two. The camera follows the interpolated head, otherwise it puts the judder
  straight back.
- **The hot loops allocate nothing.** Bodies are traced directly into a `Path2D`
  and stroked four times rather than built into arrays; trail points are stored
  by reference in the collision grid; eaten pellets are swap-popped. No garbage
  means no GC pauses.
- **Everything off screen is skipped.** Snakes carry a periodically refreshed
  bounding box, pellets are culled per frame, and trail points are strided so
  they never land closer than about two pixels.
- **Pellets are sprites.** One pre-rendered image per colour, blitted — no
  per-pellet gradients.

The simulation itself costs about 0.14ms per frame, roughly 1% of the budget, so
the headroom is real.

## Tests

```bash
npm test    # node tests/simulation.test.js
```

Twelve checks: spawning, sixty seconds of invariants, the minimum population
holding, interpolation state, self-overlap being survivable, the lethal rim,
body and head-on kills, eating, boost mechanics, rate-limited free-angle
steering, and rival respawn. `src/game.js` never touches the DOM, so the rules
run headless in Node.

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
