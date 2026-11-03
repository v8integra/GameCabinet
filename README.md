# Game Cabinet

A static website of small browser games. Open the cabinet, pick a game, play. No accounts, no
saved scores (Ridge Rider's garage is the one exception, kept in the player's own browser).

See [BUILD_PLAN.md](BUILD_PLAN.md) for the full plan and progress tracker.

## Run it locally

The games use JavaScript modules, so open them through a local server rather than by
double-clicking the HTML file:

```bash
node serve.js
```

Then visit http://localhost:8090. (`node serve.js 3000` picks another port.)

## Layout

```
index.html          Landing page (the cabinet)
shared/             Code and styles every game uses
  cabinet.css       Landing page + game shell styles
  shell.js          Game frame: top bar, scaling, title/pause/help/game-over screens, loop
  input.js          Keyboard / mouse / touch (incl. swipes)
  audio.js          Synthesized sound effects + mute
  loop.js           Fixed-timestep loop
  util.js           Math, random, collision helpers
  games.js          The list of games shown on the landing page
  thumbs.js         Procedural card art for each game
  landing.js        Builds the landing page
games/<id>/         One folder per game (index.html + game.js)
games/_template/    "Dot Dash" — a tiny game to copy when starting a new one
vendor/             Third-party libraries, stored locally (added when a game needs one)
```

## Adding a game

1. Copy `games/_template/` to `games/<id>/` (the id must match its entry in `shared/games.js`).
2. Edit `game.js`. The shell supplies everything around the game:

   ```js
   const shell = createShell({
     title, tagline, width, height, accent,
     help: [['Arrows', 'Move']],   // shown on the title and help screens
     touch: 'Swipe to move',       // optional touch hint
     init,    // reset state for a new run
     update,  // (dt) fixed 60 Hz, only while playing
     render,  // (ctx) every frame; draw in logical width × height units
   });
   // ...declare game state...
   shell.boot();
   ```

   During play: `shell.input` (`down`, `pressed`, `axisX`, `pointer`, `takeSwipe`),
   `shell.setScore` / `addScore`, `shell.setStats({ Lives: 3 })`, and
   `shell.gameOver({ title, message, win })` when the run ends.
   Sound: `sfx('coin')` from `shared/audio.js`. For 3D games pass `mode: 'custom'` and
   `onResize(w, h, dpr)`, then render into `shell.canvas` yourself.
3. Set `live: true` on the game's entry in `shared/games.js` once it passes the done checklist in
   the build plan.

## Hosting

The site is plain static files, so GitHub Pages can serve it from the repo root. The
`.nojekyll` file stops GitHub from hiding folders that start with `_`.
