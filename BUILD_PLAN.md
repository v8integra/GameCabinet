# Game Cabinet — Build Plan

A static website with a landing page ("the cabinet") linking 14 small browser games.
Pick a game, it opens and plays in the browser. Built for fun; hosted later on GitHub Pages.

Last updated: 2026-11-02 (Phase 2 complete)

---

## 1. Decisions

| Topic | Decision |
|---|---|
| Game count | 14 (the original 12 + Maze Chase 3D + Tower Defense) |
| Saving | Nothing is saved or recorded, **except** Ridge Rider (dirt bike), which saves tokens and upgrades to the player's browser (`localStorage`). No accounts, no leaderboards, no analytics. |
| Originality | Every game is "in the style of" a genre. Its name, art, sounds and twists are our own; no copied names, characters, levels or look. |
| Names | All names below are **working names**. Check "Sky Reach" (and any other name) before any Steam or commercial use. |
| Tech | Plain HTML + CSS + JavaScript (ES modules). No build step, no framework. |
| Libraries | Only where they pay for themselves: **Three.js** (Maze Chase 3D) and **Planck.js** (2D physics for Ridge Rider and Mini Golf). Library files live **inside the repo** (`vendor/`), with no CDN at runtime, so the site works offline and moves cleanly into a desktop wrapper later. |
| Art & sound | Made in code: vector shapes, procedural pixel art, and synthesized sound effects through the Web Audio API. No external asset files needed for v1. |
| Platforms | **Desktop browsers first** (keyboard/mouse). Touch controls are added per game where they fit naturally. *(Open: confirm whether full phone support is a goal.)* |
| Hosting | GitHub Pages (static). The user creates the repo and commits. |

---

## 2. Folder structure

```
GameCabinet/
├── index.html              # The cabinet landing page
├── BUILD_PLAN.md           # This file
├── README.md               # How to run locally + how to add a game
├── serve.js                # Zero-dependency local dev server (node serve.js)
├── .nojekyll               # Lets GitHub Pages serve folders starting with "_"
├── shared/
│   ├── cabinet.css         # Landing page + shared in-game UI styles
│   ├── shell.js            # Shared game shell (pause, mute, back, fullscreen, help, loop)
│   ├── input.js            # Keyboard / mouse / touch helpers (incl. swipes)
│   ├── audio.js            # Synth sound-effect helper (Web Audio)
│   ├── loop.js             # Fixed-timestep game loop
│   ├── util.js             # Math, random, collision helpers
│   ├── games.js            # Game list for the landing page (flip `live: true` when done)
│   ├── thumbs.js           # Procedural card art per game
│   └── landing.js          # Builds the landing page
├── vendor/                 # Added when needed
│   ├── three.module.min.js
│   └── planck.min.js
└── games/
    ├── _template/          # "Dot Dash" starter game
    ├── serpent/            # One folder per game: index.html + game.js
    └── ...
```

Each game is a self-contained folder: `index.html` + `game.js` (+ more modules if needed).
Run locally with any static server (ES modules don't load from `file://`).

---

## 3. Shared shell (built first, used by every game)

Every game page gets the same frame so the cabinet feels like one product:

- **Top bar:** back to cabinet · game title · score · pause · mute · fullscreen · help (`?`)
- **Title screen** → **Play** → **Game over** screen with "Play again" / "Back to cabinet"
- **Pause** on `Esc` / `P`, and automatically when the tab loses focus
- **Help overlay** listing controls
- **Responsive canvas** that scales to the window and keeps its aspect ratio
- **Mute** setting kept for the visit only (not saved)

### Landing page
- Grid of game "cabinet cards": title, procedurally drawn thumbnail/art, one-line hook, control icons (keyboard / mouse / touch)
- Filter chips: All · Action · Puzzle · Arcade · 3D
- Arcade-cabinet look (dark background, neon accents, a light CRT glow), with motion that respects `prefers-reduced-motion`

---

## 4. Build order (easiest → hardest)

Each phase ends with something playable. A game counts as "done" once it passes the
checklist in section 6.

### Phase 0 — Foundation ✅ (2026-11-02)
- [x] Folder structure, README, local run instructions (`node serve.js` → http://localhost:8090)
- [x] Shared shell (`shell.js`, `input.js`, `audio.js`, `loop.js`, `util.js`)
- [x] Landing page with placeholder cards for all 14 games (procedural art in `thumbs.js`, list in `games.js`)
- [x] A local preview config so Claude can test in the browser pane (`.claude/launch.json`)
- [x] `games/_template/` ("Dot Dash"): a tiny playable game that exercises the shell; copy it to start each game
- Vendor libraries (Three.js, Planck.js) are added when the first game needs them, not up front.

### Phase 1 — Classic warm-ups (prove out the shell) ✅ (2026-11-02)

Built as planned, with these details:
- **Serpent:** Classic / Wrap / Maze modes, with a bonus star after every 5 apples. Obstacle layouts are covered by Maze mode.
- **Brickfall:** 10 levels; power-ups are Multi-ball, Wide, Laser, Slow and Extra life. Moving bricks were not added (still a stretch goal).
- **Merge Up:** 4×4 / 5×5, **3 undos per game** (changed from "undo once"), and a "2048! Keep going" banner instead of ending the game.
- **Sapper:** Easy 9×9 / Medium 16×16 / Hard 30×16, safe first click, chording, and long-press to flag on touch. Hard is tiny on phones (it is meant for desktop). The hex grid was not added (still a stretch goal).
- Shell additions: title-screen **options** (`options: [...]` → `shell.options`), `pointer.button` for right-click, and a `?debug` URL hook (`window.gcShell`, `shell.debug()`) for automated tests.

| # | Working name | Style | Core features | Stretch |
|---|---|---|---|---|
| 1 | **Serpent** | Snake | Grid movement, growth, speed ramps up | Wrap/no-wrap modes, obstacle layouts |
| 2 | **Brickfall** | Brick breaker | Paddle physics with angle control, 10 hand-made levels, multi-ball, wide paddle, laser | Unbreakable/moving bricks |
| 3 | **Merge Up** | 2048-style | 4×4 merge, swipe + arrows, smooth tile animation | 5×5 mode, undo once |
| 4 | **Sapper** | Minesweeper-style | 3 difficulties, flagging, safe first click, chording | Hex-grid mode |

### Phase 2 — Arcade action ✅ (2026-11-02)

Built as planned, with these details:
- **Rock Drift:** waves of splitting rocks, hyperspace on a 3s cooldown, an extra life every 10,000 points. The UFO stretch goal is included: saucers appear from wave 2, and from wave 4 the small ones aim at you.
- **Star Swarm:** 28-enemy formation (elites take 2 hits). Rows fly in on curved paths, then dive and shoot; elites bring escorts from wave 2. Power-ups: Spread, Rapid, Shield. A **mothership boss every 5th wave** fires spreads and launches drones. The capture twist was not added.
- **Block Drop:** our own piece set: the 7 four-block shapes, two 3-block shapes (straight and corner), and a **bomb every 24 pieces** that clears 3×3. Also hold, 3-piece preview, ghost piece, lock delay, and auto-repeat on held arrow keys. **Rising mode** (garbage rows) is included.
- **Flutter:** speed and gap tightening ramp up per point. Each run picks a random day, dusk or night theme (covers the cosmetic-themes stretch goal).

| # | Working name | Style | Core features | Stretch |
|---|---|---|---|---|
| 5 | **Rock Drift** | Asteroids-style | Inertia ship, wraparound edges, splitting rocks, hyperspace | UFO enemies |
| 6 | **Star Swarm** | Galaga-style shooter | Enemies swoop into formation and dive, waves, a boss every 5 waves, power-ups (spread, rapid, shield) | Capture-and-rescue twist of our own |
| 7 | **Block Drop** | Falling-block puzzle | Our own piece set/rules, hold, preview, line clears, levels | Garbage-rise challenge mode |
| 8 | **Flutter** | One-button flapper/runner | One key/tap, procedural gaps, speed ramp | Unlockable-free cosmetic themes per run |

### Phase 3 — Bigger 2D games
| # | Working name | Style | Core features | Stretch |
|---|---|---|---|---|
| 9 | **Hop Lane** | Road crosser | Procedural endless rows: roads, rivers with logs, trains | Day/night cycle |
| 10 | **Sky Reach** | Vertical platformer | Ground slowly rises; procedural platforms; springs, moving clouds, crumbling platforms; power-ups: super jump, speed boost | Jetpack, biomes as you climb |
| 11 | **Putt Park** | Mini golf | Drag-to-putt, 9 holes, bumpers, ramps, windmill, sand, water; par scoring | Second 9-hole course |

### Phase 4 — Systems-heavy games
| # | Working name | Style | Core features | Stretch |
|---|---|---|---|---|
| 12 | **Bastion** | Tower defense | 1 map with a path, 4 tower types with 2 upgrade tiers, 15 waves, gold economy | 2 more maps, fast-forward |
| 13 | **Hollow Maze** | 3D maze chase | Third-person chase-cam 3D maze (Three.js); character select (4 characters); collect orbs; 4 hunters with different behaviors; limited view (fog, tall walls); power orb lets you chase them; **holiday calendar swaps the hunters** (see section 5) | Procedural mazes, more characters, more events |
| 14 | **Ridge Rider** | Dirt bike hill racer | 2D physics bike (suspension, lean, flips), race 3 bots, tokens for finishing, upgrade engine/grip/suspension/fuel, **saved to browser** | More tracks, trick bonuses |

**Why this order:** Phase 1 has simple rules and no physics, so the shared shell gets proven
without much else to debug. Each later phase adds one new hard thing: real-time action, then
procedural levels and physics, then AI pathing, 3D and save data. Ridge Rider is last because it
combines the hardest physics with the only save system.

---

## 5. Game-specific notes

- **Hollow Maze:** see the full spec in section 5a below.
- **Ridge Rider:** Save data = `{ version, tokens, upgrades: {engine, grip, suspension, fuel}, tracksUnlocked }`
  under one `localStorage` key, read/written inside try/catch. If storage is blocked, the game
  still plays and progress lasts for the visit. Include a "Reset progress" button in settings.
- **Bot racers (Ridge Rider):** Bots ride the same physics with tuned inputs and a little rubber-banding so races stay close.
- **Sky Reach:** The rising ground speeds up gradually. Power-ups are time-limited and shown in the top bar.
- **Bastion:** Enemies follow a fixed path for v1 (no maze-building), so the game stays small.

---

## 5a. Hollow Maze — full spec

### Camera & feel
- The fun comes from *not* seeing the whole maze: tall walls, fog and short sight lines.
- **Third-person, low over-the-shoulder chase camera** (changed from first-person so the chosen
  character is actually visible). The camera pulls in close in tight corridors.
- Hunters can be **heard before they're seen** (positional audio, a different sound per event).
- Low-poly geometry built in code, so it runs well on laptops.

### Characters (pick one on the title screen)
Each has one small perk so the choice matters without breaking balance. The choice lasts for the
visit only (not saved).

| Character | Look | Perk |
|---|---|---|
| **Scout** | Explorer with a lantern | Slightly wider light radius (sees a bit farther in the fog) |
| **Bolt** | Small round robot | Slightly faster movement |
| **Rue** | Fox | Hunters' sounds carry farther (earlier warning) |
| **Wisp** | Little hooded mage | Power orbs last a little longer |

### Hunters: one behavior set, many skins
There are always **4 hunters**, each with a fixed **behavior role**:

| Role | Behavior |
|---|---|
| Chaser | Heads straight for the player |
| Ambusher | Aims a few tiles ahead of where the player is going |
| Flanker | Tries to cut off the player from the opposite side |
| Wanderer | Roams, then rushes when close |

An **event set** only reskins them: hunter models, colors, sounds, maze lighting/tint, and the
collectible look. Gameplay stays identical, so every event works without extra balancing.

### Event calendar
- Each event is active from **7 days before through 7 days after** its event day (15 days total).
- Uses the **player's local date**.
- **Overlap rule:** if two windows overlap, the event whose day is **closest** to today wins
  (tie → the upcoming event).
- Outside every window, the **default set** is used.
- **Testing override:** `?event=easter` (any event id) in the URL forces an event, and `?event=none` forces the default set.
- A small banner on the title screen shows the active event (e.g. "🐰 Undead Bunnies are loose — Easter event").

| Event (id) | Event day | Hunters | Collectibles / theme |
|---|---|---|---|
| Default (`none`) | — | Hollow shades (ghostly shapes) | Glowing orbs, cold blue fog |
| New Year (`newyear`) | Jan 1 | Confetti poltergeists | Sparklers, gold/midnight |
| Valentine's (`valentine`) | Feb 14 | Heartbroken cupids | Candy hearts, pink haze |
| St. Patrick's (`stpatricks`) | Mar 17 | Leprechauns | Gold coins, green fog |
| Easter (`easter`) | Easter Sunday (computed each year) | Undead bunnies | Painted eggs, pastel gloom |
| Summer Solstice (`solstice`) | Jun 21 | Insects: giant firefly, mantis, beetle, wasp (one per role) | Pollen orbs, warm dusk light |
| Independence Day (`july4`) | Jul 4 | Firework sprites | Sparks, red/white/blue glow |
| Halloween (`halloween`) | Oct 31 | Jack-o'-lantern heads, witch, skeleton, bat (one per role) | Candy corn, orange fog |
| Thanksgiving (`thanksgiving`) | 4th Thursday of Nov (computed) | Rogue turkeys | Corn kernels, autumn leaves |
| Winter Holidays (`winter`) | Dec 25 | Evil snowmen | Snowflakes, icy blue/red lights |

Date rules: Easter uses the standard Gregorian computus (the anonymous Gregorian algorithm).
Thanksgiving uses the 4th Thursday of November. All other days are fixed. The calendar is a
single data table, so adding an event means adding one row and one skin set.

Known overlaps the closest-day rule handles: Summer Solstice / July 4 (Jun 27–28), Winter
Holidays / New Year (Dec 25–Jan 1). Easter can also overlap St. Patrick's in years when Easter
falls in late March.

Possible later events: Lunar New Year (needs a date lookup table), Friday the 13th (a one-day
special), Earth Day.

### Done-checks specific to Hollow Maze
- [ ] Unit check: event chosen correctly for sample dates (each window edge, each overlap, Easter for several years)
- [ ] Every event set loads via `?event=` and looks distinct
- [ ] All 4 characters playable, with their perk working

---

## 6. "Done" checklist (per game)

- [ ] Plays start → game over → replay with no console errors
- [ ] Uses the shared shell (back, pause, mute, help, fullscreen)
- [ ] Controls listed in the help overlay and on its cabinet card
- [ ] Holds ~60 fps on a mid-range laptop; pauses when the tab is hidden
- [ ] Has sound effects (and mute works)
- [ ] Scales correctly in small and large windows
- [ ] Touch controls, if this game supports touch
- [ ] Tested by Claude in the browser pane (screenshot taken), then played by the user for "feel"
- [ ] Cabinet card updated from placeholder to live

---

## 7. Progress tracker

| # | Game | Status |
|---|---|---|
| 0 | Foundation (shell + landing page) | ✅ Done 2026-11-02 |
| 1 | Serpent | ✅ Live 2026-11-02 |
| 2 | Brickfall | ✅ Live 2026-11-02 |
| 3 | Merge Up | ✅ Live 2026-11-02 |
| 4 | Sapper | ✅ Live 2026-11-02 |
| 5 | Rock Drift | ✅ Live 2026-11-02 |
| 6 | Star Swarm | ✅ Live 2026-11-02 |
| 7 | Block Drop | ✅ Live 2026-11-02 |
| 8 | Flutter | ✅ Live 2026-11-02 |
| 9 | Hop Lane | Not started |
| 10 | Sky Reach | Not started |
| 11 | Putt Park | Not started |
| 12 | Bastion | Not started |
| 13 | Hollow Maze | Not started |
| 14 | Ridge Rider | Not started |

---

## 8. Later: Steam desktop game (separate project)

Not part of this build; kept here so it isn't lost.
- Pick one simple game idea (possibly one that grows out of a cabinet game).
- Engine: Godot, or a web game wrapped with Electron/Tauri.
- Steam basics to research: Steamworks account and the one-time app fee, store page assets, the review process, and a "Coming Soon" page live for a while before launch.
- Run a name/trademark check before committing to a title.

## 9. Open questions

- Full phone support for every game, or desktop-first with touch where easy?
- Final names for each game (working names are fine until launch).
