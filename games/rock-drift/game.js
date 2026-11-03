// Rock Drift — inertia ship, wraparound space, splitting rocks, hyperspace, saucers.

import { createShell } from '../../shared/shell.js';
import { KEYS } from '../../shared/input.js';
import { sfx, tone, noise } from '../../shared/audio.js';
import { TAU, rand, randInt, clamp, wrap, seeded } from '../../shared/util.js';

const W = 800;
const H = 600;

const SHIP_R = 12;
const TURN_SPEED = 4.6; // rad/s
const THRUST = 330; // px/s²
const DRAG = 0.55; // fraction of speed lost per second
const MAX_SPEED = 420;
const BULLET_SPEED = 540;
const BULLET_LIFE = 0.85;
const MAX_BULLETS = 5;
const FIRE_COOLDOWN = 0.16;
const HYPER_COOLDOWN = 3;
const RESPAWN_SAFE = 2.5;
const START_LIVES = 3;
const EXTRA_LIFE_EVERY = 10000;

const ROCKS = {
  3: { r: 46, points: 20, speed: [30, 70] },
  2: { r: 25, points: 50, speed: [50, 110] },
  1: { r: 13, points: 100, speed: [70, 150] },
};

const SAUCER_FIRST = 2; // first wave with saucers
const SAUCER_INTERVAL = [14, 24];
const SAUCER_SPEED = 120;
const SAUCER_SHOT_EVERY = 1.3;

let ship, bullets, rocks, saucer, saucerShots, saucerTimer, particles, debris;
let wave, lives, nextLifeAt, fireCooldown, hyperCooldown, waveDelay, deadTimer, time, thrustSound, stars;

const shell = createShell({
  title: 'Rock Drift',
  tagline: 'Drift, blast, and don’t get flattened.',
  width: W,
  height: H,
  accent: '#c9c3ff',
  help: [
    ['← → / A D', 'Rotate'],
    ['↑ / W', 'Thrust'],
    ['Space', 'Fire'],
    ['↓ / S / Shift', 'Hyperspace (random jump)'],
    ['Esc / P', 'Pause'],
  ],
  init,
  update,
  render,
});

function init() {
  wave = 0;
  lives = START_LIVES;
  nextLifeAt = EXTRA_LIFE_EVERY;
  bullets = [];
  rocks = [];
  particles = [];
  debris = [];
  saucer = null;
  saucerShots = [];
  saucerTimer = rand(...SAUCER_INTERVAL);
  fireCooldown = 0;
  hyperCooldown = 0;
  deadTimer = 0;
  time = 0;
  thrustSound = 0;
  const r = seeded(11);
  stars = Array.from({ length: 120 }, () => ({ x: r() * W, y: r() * H, s: r() < 0.15 ? 2 : 1, a: 0.25 + r() * 0.6 }));
  spawnShip();
  nextWave();
}

function spawnShip() {
  ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, safe: RESPAWN_SAFE, thrusting: false };
}

function updateStats() {
  shell.setStats({ Lives: lives, Wave: wave });
}

function makeRock(size, x, y) {
  const def = ROCKS[size];
  const a = rand(TAU);
  const speed = rand(...def.speed) * (1 + Math.min(wave, 10) * 0.05);
  const n = randInt(9, 12);
  const shape = Array.from({ length: n }, (_, i) => ({ a: (i / n) * TAU, d: def.r * rand(0.72, 1.08) }));
  return { size, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: def.r, rot: rand(TAU), spin: rand(-1, 1), shape };
}

function nextWave() {
  wave++;
  waveDelay = 0;
  const count = Math.min(4 + wave - 1, 11);
  for (let i = 0; i < count; i++) {
    // Spawn along the edges, never on top of the ship.
    let x, y;
    do {
      x = rand(W);
      y = rand(H);
    } while (Math.hypot(x - ship.x, y - ship.y) < 180);
    rocks.push(makeRock(3, x, y));
  }
  updateStats();
}

// Distance on a wrapping screen.
function wrapDist(ax, ay, bx, by) {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > W / 2) dx = W - dx;
  if (dy > H / 2) dy = H - dy;
  return Math.hypot(dx, dy);
}

function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    const s = rand(speed * 0.2, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.9), color });
  }
}

function breakRock(rock, byPlayer) {
  rocks.splice(rocks.indexOf(rock), 1);
  if (byPlayer) addScore(ROCKS[rock.size].points);
  burst(rock.x, rock.y, '#c9c3ff', 6 + rock.size * 5, 60 + rock.size * 30);
  noise({ dur: 0.12 + rock.size * 0.12, vol: 0.18 + rock.size * 0.07, freq: 2600 - rock.size * 600, to: 120 });
  if (rock.size > 1) {
    for (let i = 0; i < 2; i++) rocks.push(makeRock(rock.size - 1, rock.x, rock.y));
  }
}

function addScore(n) {
  shell.addScore(n);
  if (shell.score >= nextLifeAt) {
    nextLifeAt += EXTRA_LIFE_EVERY;
    lives++;
    sfx('powerup');
    updateStats();
  }
}

function killShip() {
  sfx('explode');
  sfx('hurt');
  // Ship breaks into its three line segments.
  const pts = shipPoints();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    debris.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, len: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), vx: ship.vx * 0.3 + rand(-60, 60), vy: ship.vy * 0.3 + rand(-60, 60), spin: rand(-4, 4), life: 1.6 });
  }
  burst(ship.x, ship.y, '#2de2e6', 20, 160);
  lives--;
  updateStats();
  ship = null;
  deadTimer = 1.8;
}

function spawnSaucer() {
  const small = wave >= 4 && Math.random() < 0.5;
  const fromLeft = Math.random() < 0.5;
  saucer = {
    x: fromLeft ? -30 : W + 30,
    y: rand(60, H - 60),
    vx: (fromLeft ? 1 : -1) * SAUCER_SPEED * (small ? 1.3 : 1),
    vy: 0,
    r: small ? 11 : 18,
    small,
    shot: SAUCER_SHOT_EVERY,
    turn: rand(0.8, 1.6),
  };
}

function update(dt) {
  const { input } = shell;
  time += dt;
  fireCooldown = Math.max(0, fireCooldown - dt);
  hyperCooldown = Math.max(0, hyperCooldown - dt);

  // ----- Ship -----
  if (ship) {
    ship.a += input.axisX() * TURN_SPEED * dt;
    ship.thrusting = input.down(KEYS.up);
    if (ship.thrusting) {
      ship.vx += Math.cos(ship.a) * THRUST * dt;
      ship.vy += Math.sin(ship.a) * THRUST * dt;
      thrustSound -= dt;
      if (thrustSound <= 0) {
        thrustSound = 0.11;
        noise({ dur: 0.12, vol: 0.06, freq: 500 });
      }
    }
    const drag = Math.pow(1 - DRAG, dt);
    ship.vx *= drag;
    ship.vy *= drag;
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > MAX_SPEED) {
      ship.vx *= MAX_SPEED / speed;
      ship.vy *= MAX_SPEED / speed;
    }
    ship.x = wrap(ship.x + ship.vx * dt, W);
    ship.y = wrap(ship.y + ship.vy * dt, H);
    ship.safe = Math.max(0, ship.safe - dt);

    if (input.down(KEYS.action) && fireCooldown <= 0 && bullets.length < MAX_BULLETS) {
      fireCooldown = FIRE_COOLDOWN;
      bullets.push({
        x: ship.x + Math.cos(ship.a) * SHIP_R,
        y: ship.y + Math.sin(ship.a) * SHIP_R,
        vx: Math.cos(ship.a) * BULLET_SPEED + ship.vx,
        vy: Math.sin(ship.a) * BULLET_SPEED + ship.vy,
        life: BULLET_LIFE,
      });
      sfx('shoot');
    }

    if (input.pressed(KEYS.down, 'ShiftLeft', 'ShiftRight') && hyperCooldown <= 0) {
      hyperCooldown = HYPER_COOLDOWN;
      burst(ship.x, ship.y, '#b26bff', 14, 120);
      ship.x = rand(40, W - 40);
      ship.y = rand(40, H - 40);
      ship.vx = 0;
      ship.vy = 0;
      ship.safe = 0.4;
      burst(ship.x, ship.y, '#b26bff', 14, 120);
      tone({ freq: 200, to: 1600, dur: 0.25, type: 'sine', vol: 0.15 });
    }
  } else if (deadTimer > 0) {
    deadTimer -= dt;
    if (deadTimer <= 0) {
      if (lives <= 0) {
        sfx('lose');
        shell.gameOver({ message: `You made it to wave ${wave}.` });
        return;
      }
      // Wait for a clear patch in the middle before respawning.
      if (rocks.some((r) => wrapDist(r.x, r.y, W / 2, H / 2) < r.r + 90)) deadTimer = 0.1;
      else spawnShip();
    }
  }

  // ----- Bullets -----
  for (const b of bullets) {
    b.x = wrap(b.x + b.vx * dt, W);
    b.y = wrap(b.y + b.vy * dt, H);
    b.life -= dt;
  }

  // ----- Rocks -----
  for (const r of rocks) {
    r.x = wrap(r.x + r.vx * dt, W);
    r.y = wrap(r.y + r.vy * dt, H);
    r.rot += r.spin * dt;
  }

  for (const b of bullets) {
    if (b.life <= 0) continue;
    const hit = rocks.find((r) => wrapDist(b.x, b.y, r.x, r.y) < r.r);
    if (hit) {
      b.life = 0;
      breakRock(hit, true);
      continue;
    }
    if (saucer && Math.hypot(b.x - saucer.x, b.y - saucer.y) < saucer.r + 2) {
      b.life = 0;
      addScore(saucer.small ? 1000 : 200);
      burst(saucer.x, saucer.y, '#ff3d9a', 24, 200);
      sfx('explode');
      saucer = null;
    }
  }
  bullets = bullets.filter((b) => b.life > 0);

  if (ship && ship.safe <= 0) {
    const hit = rocks.find((r) => wrapDist(ship.x, ship.y, r.x, r.y) < r.r + SHIP_R * 0.75);
    if (hit) {
      breakRock(hit, true);
      killShip();
    }
  }

  // ----- Saucer -----
  if (wave >= SAUCER_FIRST && !saucer) {
    saucerTimer -= dt;
    if (saucerTimer <= 0) {
      saucerTimer = rand(...SAUCER_INTERVAL);
      spawnSaucer();
    }
  }
  if (saucer) {
    saucer.x += saucer.vx * dt;
    saucer.y = wrap(saucer.y + saucer.vy * dt, H);
    saucer.turn -= dt;
    if (saucer.turn <= 0) {
      saucer.turn = rand(0.8, 1.6);
      saucer.vy = choose3() * SAUCER_SPEED * 0.6;
    }
    saucer.shot -= dt;
    if (saucer.shot <= 0 && ship) {
      saucer.shot = SAUCER_SHOT_EVERY;
      // Small saucers aim; big ones fire randomly.
      const aim = Math.atan2(ship.y - saucer.y, ship.x - saucer.x);
      const a = saucer.small ? aim + rand(-0.15, 0.15) : rand(TAU);
      saucerShots.push({ x: saucer.x, y: saucer.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 1.6 });
      tone({ freq: 700, to: 300, dur: 0.1, type: 'sawtooth', vol: 0.08 });
    }
    if (Math.floor(time * 6) % 2 === 0 && Math.floor((time - dt) * 6) % 2 !== 0) tone({ freq: saucer.small ? 1100 : 600, dur: 0.08, type: 'triangle', vol: 0.04 });
    if (saucer.x < -60 || saucer.x > W + 60) saucer = null;
    else {
      const hitRock = rocks.find((r) => Math.hypot(saucer.x - r.x, saucer.y - r.y) < r.r + saucer.r);
      if (hitRock) {
        breakRock(hitRock, false);
        burst(saucer.x, saucer.y, '#ff3d9a', 20, 180);
        saucer = null;
      } else if (ship && ship.safe <= 0 && Math.hypot(ship.x - saucer.x, ship.y - saucer.y) < saucer.r + SHIP_R) {
        saucer = null;
        killShip();
      }
    }
  }
  for (const s of saucerShots) {
    s.x = wrap(s.x + s.vx * dt, W);
    s.y = wrap(s.y + s.vy * dt, H);
    s.life -= dt;
    if (ship && ship.safe <= 0 && Math.hypot(s.x - ship.x, s.y - ship.y) < SHIP_R) {
      s.life = 0;
      killShip();
    }
  }
  saucerShots = saucerShots.filter((s) => s.life > 0);

  // ----- Effects -----
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const d of debris) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.a += d.spin * dt;
    d.life -= dt;
  }
  debris = debris.filter((d) => d.life > 0);

  // ----- Wave clear -----
  if (!rocks.length) {
    waveDelay += dt;
    if (waveDelay > 1.5) {
      sfx('win');
      nextWave();
    }
  }
}

const choose3 = () => [-1, 0, 1][Math.floor(Math.random() * 3)];

// ---------- Drawing ----------

function shipPoints(s = ship) {
  const pts = [
    [SHIP_R * 1.4, 0],
    [-SHIP_R, SHIP_R * 0.85],
    [-SHIP_R * 0.55, 0],
    [-SHIP_R, -SHIP_R * 0.85],
  ];
  const c = Math.cos(s.a);
  const n = Math.sin(s.a);
  return pts.map(([x, y]) => ({ x: s.x + x * c - y * n, y: s.y + x * n + y * c }));
}

// Draw at every wrapped copy that could be visible near an edge.
function drawWrapped(x, y, r, fn) {
  const xs = [x];
  const ys = [y];
  if (x < r) xs.push(x + W);
  if (x > W - r) xs.push(x - W);
  if (y < r) ys.push(y + H);
  if (y > H - r) ys.push(y - H);
  for (const ox of xs) for (const oy of ys) fn(ox - x, oy - y);
}

function render(ctx) {
  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    ctx.globalAlpha = s.a * (0.75 + Math.sin(time * 2 + s.x) * 0.25);
    ctx.fillStyle = '#fff';
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Rocks
  ctx.strokeStyle = '#c9c3ff';
  ctx.shadowColor = '#8f86ff';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  for (const r of rocks) {
    drawWrapped(r.x, r.y, r.r, (dx, dy) => {
      ctx.beginPath();
      r.shape.forEach((p, i) => {
        const x = r.x + dx + Math.cos(p.a + r.rot) * p.d;
        const y = r.y + dy + Math.sin(p.a + r.rot) * p.d;
        ctx[i ? 'lineTo' : 'moveTo'](x, y);
      });
      ctx.closePath();
      ctx.stroke();
    });
  }

  // Saucer
  if (saucer) {
    const { x, y, r } = saucer;
    ctx.strokeStyle = '#ff3d9a';
    ctx.shadowColor = '#ff3d9a';
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.5, r * 0.55, 0, 0, TAU);
    ctx.moveTo(x - r * 0.7, y - r * 0.35);
    ctx.quadraticCurveTo(x, y - r * 1.3, x + r * 0.7, y - r * 0.35);
    ctx.stroke();
  }

  // Ship
  if (ship && !(ship.safe > 0 && Math.floor(time * 10) % 2)) {
    drawWrapped(ship.x, ship.y, SHIP_R * 1.5, (dx, dy) => {
      const pts = shipPoints({ ...ship, x: ship.x + dx, y: ship.y + dy });
      if (ship.thrusting && Math.floor(time * 30) % 2 === 0) {
        const c = Math.cos(ship.a);
        const n = Math.sin(ship.a);
        const bx = ship.x + dx - c * SHIP_R * 0.7;
        const by = ship.y + dy - n * SHIP_R * 0.7;
        ctx.strokeStyle = '#ff8a3d';
        ctx.shadowColor = '#ff8a3d';
        ctx.beginPath();
        ctx.moveTo(bx - n * 5, by + c * 5);
        ctx.lineTo(bx - c * rand(14, 22), by - n * rand(14, 22));
        ctx.lineTo(bx + n * 5, by - c * 5);
        ctx.stroke();
      }
      ctx.strokeStyle = '#e9fdff';
      ctx.shadowColor = '#2de2e6';
      ctx.beginPath();
      pts.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y));
      ctx.closePath();
      ctx.stroke();
    });
  }

  // Debris from a destroyed ship
  ctx.strokeStyle = '#e9fdff';
  ctx.shadowColor = '#2de2e6';
  for (const d of debris) {
    ctx.globalAlpha = clamp(d.life, 0, 1);
    ctx.beginPath();
    ctx.moveTo(d.x - (Math.cos(d.a) * d.len) / 2, d.y - (Math.sin(d.a) * d.len) / 2);
    ctx.lineTo(d.x + (Math.cos(d.a) * d.len) / 2, d.y + (Math.sin(d.a) * d.len) / 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Bullets
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#2de2e6';
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.2, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#ff9dcb';
  ctx.shadowColor = '#ff3d9a';
  for (const s of saucerShots) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 1.5, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  ctx.globalAlpha = 1;

  // HUD: hyperspace charge
  if (shell.state === 'playing') {
    ctx.fillStyle = 'rgba(178,107,255,0.25)';
    ctx.fillRect(12, H - 18, 80, 5);
    ctx.fillStyle = hyperCooldown > 0 ? '#6a4a9a' : '#b26bff';
    ctx.fillRect(12, H - 18, 80 * (1 - hyperCooldown / HYPER_COOLDOWN), 5);
    ctx.fillStyle = 'rgba(201,195,255,0.6)';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillText('HYPER', 12, H - 24);

    if (!rocks.length && waveDelay > 0) {
      ctx.fillStyle = '#c9c3ff';
      ctx.font = '900 34px "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`WAVE ${wave + 1}`, W / 2, H / 2 - 40);
      ctx.textAlign = 'left';
    }
  }
}

shell.debug = () => ({ ship, rocks, bullets, saucer, wave, lives });
shell.boot();
