// Flutter — one-button flapper. Endless pillars; each run gets a random sky theme.

import { createShell } from '../../shared/shell.js';
import { KEYS } from '../../shared/input.js';
import { sfx, tone } from '../../shared/audio.js';
import { TAU, rand, clamp, choose, seeded } from '../../shared/util.js';

const W = 480;
const H = 640;
const GROUND_H = 70;
const FLOOR = H - GROUND_H;

const BIRD_X = 130;
const BIRD_R = 15;
const GRAVITY = 1500;
const FLAP_VY = -430;
const MAX_FALL = 720;

const PILLAR_W = 70;
const PILLAR_SPACING = 230;
const GAP_START = 175;
const GAP_MIN = 135;
const GAP_SHRINK = 2; // px per point
const SPEED_START = 170;
const SPEED_MAX = 250;
const SPEED_GAIN = 2; // px/s per point
const GAP_MARGIN = 100;
const MAX_GAP_SHIFT = 170;
const DEATH_PAUSE = 0.7;

const THEMES = [
  { name: 'day', sky: ['#1b6f8a', '#9fdcff'], far: '#5a9fb0', near: '#3f8a5a', pillar: ['#2a7a3a', '#3fa152'], ground: '#c99a5b', grass: '#8fd060', stars: false },
  { name: 'dusk', sky: ['#2a1a4a', '#f6a37a'], far: '#5a2a5a', near: '#3a2050', pillar: ['#5a2f7a', '#8a4ab0'], ground: '#6a3a2a', grass: '#c0603a', stars: false },
  { name: 'night', sky: ['#05051a', '#1a1a4a'], far: '#1a2050', near: '#101640', pillar: ['#1f4a6a', '#2d7aa0'], ground: '#2a2440', grass: '#4a4aa0', stars: true },
];

let bird, pillars, phase, speed, scroll, deadTimer, theme, particles, time, stars, clouds;

const shell = createShell({
  title: 'Flutter',
  tagline: 'One button. Endless gaps.',
  width: W,
  height: H,
  accent: '#ffb347',
  help: [
    ['Space / ↑ / Click', 'Flap'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Tap to flap',
  init,
  update,
  render,
});

function init() {
  theme = choose(THEMES);
  bird = { y: H * 0.42, vy: 0, rot: 0, wing: 0 };
  pillars = [];
  phase = 'ready';
  speed = SPEED_START;
  scroll = 0;
  deadTimer = 0;
  particles = [];
  time = 0;
  const r = seeded(Math.floor(Math.random() * 1e6));
  stars = Array.from({ length: 60 }, () => ({ x: r() * W, y: r() * FLOOR * 0.7, a: 0.3 + r() * 0.7 }));
  clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 120 + r() * 60, y: 40 + r() * 160, s: 0.6 + r() * 0.8 }));
  let x = W + 120;
  let gapY = FLOOR / 2;
  for (let i = 0; i < 4; i++) {
    gapY = nextGapY(gapY);
    pillars.push({ x, gapY, gap: GAP_START, scored: false });
    x += PILLAR_SPACING;
  }
}

function nextGapY(prev) {
  const lo = Math.max(GAP_MARGIN, prev - MAX_GAP_SHIFT);
  const hi = Math.min(FLOOR - GAP_MARGIN, prev + MAX_GAP_SHIFT);
  return rand(lo, hi);
}

function flap() {
  bird.vy = FLAP_VY;
  bird.wing = 1;
  tone({ freq: 520, to: 780, dur: 0.08, type: 'triangle', vol: 0.12 });
  for (let i = 0; i < 4; i++) particles.push({ x: BIRD_X - 10, y: bird.y + 6, vx: rand(-90, -30), vy: rand(20, 90), life: 0.35, color: 'rgba(255,255,255,0.8)' });
}

function die() {
  phase = 'dead';
  sfx('hurt');
  for (let i = 0; i < 18; i++) {
    const a = rand(TAU);
    particles.push({ x: BIRD_X, y: bird.y, vx: Math.cos(a) * rand(60, 200), vy: Math.sin(a) * rand(60, 200), life: rand(0.4, 0.8), color: '#ffd23f' });
  }
}

function update(dt) {
  const { input } = shell;
  time += dt;
  const tapped = input.pressed(KEYS.action, KEYS.up) || (input.pointer.pressed && input.pointer.button === 0);

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
  bird.wing = Math.max(0, bird.wing - dt * 5);

  if (phase === 'ready') {
    bird.y = H * 0.42 + Math.sin(time * 4) * 8;
    scroll += SPEED_START * 0.5 * dt;
    if (tapped) {
      phase = 'flying';
      flap();
    }
    return;
  }

  // Bird physics run while flying and while falling after a crash.
  bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * dt);
  bird.y += bird.vy * dt;
  const targetRot = clamp(bird.vy / 600, -0.5, 1.3);
  bird.rot += (targetRot - bird.rot) * Math.min(1, dt * 10);

  if (phase === 'dead') {
    if (bird.y >= FLOOR - BIRD_R) {
      bird.y = FLOOR - BIRD_R;
      bird.vy = 0;
      deadTimer += dt;
      if (deadTimer >= DEATH_PAUSE) {
        sfx('lose');
        const n = shell.score;
        shell.gameOver({ message: n === 0 ? 'Not a single gap. Try a gentler tap.' : `You cleared ${n} gap${n === 1 ? '' : 's'}.` });
      }
    }
    return;
  }

  if (tapped) flap();
  if (bird.y < BIRD_R) {
    bird.y = BIRD_R;
    bird.vy = Math.max(0, bird.vy);
  }

  scroll += speed * dt;
  for (const p of pillars) {
    p.x -= speed * dt;
    if (!p.scored && p.x + PILLAR_W < BIRD_X - BIRD_R) {
      p.scored = true;
      shell.addScore(1);
      sfx('coin');
      speed = Math.min(SPEED_MAX, speed + SPEED_GAIN);
    }
  }
  if (pillars[0].x < -PILLAR_W) {
    pillars.shift();
    const last = pillars[pillars.length - 1];
    const gap = Math.max(GAP_MIN, GAP_START - shell.score * GAP_SHRINK);
    pillars.push({ x: last.x + PILLAR_SPACING, gapY: nextGapY(last.gapY), gap, scored: false });
  }

  // Collision: circle vs the two pillar rectangles, and the ground.
  const r = BIRD_R - 3; // a little forgiveness
  for (const p of pillars) {
    if (BIRD_X + r < p.x || BIRD_X - r > p.x + PILLAR_W) continue;
    const top = p.gapY - p.gap / 2;
    const bottom = p.gapY + p.gap / 2;
    const nx = clamp(BIRD_X, p.x, p.x + PILLAR_W);
    for (const [y0, y1] of [[-100, top], [bottom, FLOOR]]) {
      const ny = clamp(bird.y, y0, y1);
      if ((BIRD_X - nx) ** 2 + (bird.y - ny) ** 2 < r * r) return die();
    }
  }
  if (bird.y + BIRD_R >= FLOOR) die();
}

// ---------- Drawing ----------

function drawHills(ctx, color, base, amp, freq, offset) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR);
  for (let x = 0; x <= W; x += 8) {
    const t = (x + offset) * freq;
    ctx.lineTo(x, base - Math.sin(t) * amp - Math.sin(t * 2.3) * amp * 0.4);
  }
  ctx.lineTo(W, FLOOR);
  ctx.fill();
}

function drawPillar(ctx, p) {
  const top = p.gapY - p.gap / 2;
  const bottom = p.gapY + p.gap / 2;
  const [body, cap] = theme.pillar;
  const g = ctx.createLinearGradient(p.x, 0, p.x + PILLAR_W, 0);
  g.addColorStop(0, body);
  g.addColorStop(0.45, cap);
  g.addColorStop(1, body);
  ctx.fillStyle = g;
  ctx.fillRect(p.x, -10, PILLAR_W, top + 10);
  ctx.fillRect(p.x, bottom, PILLAR_W, FLOOR - bottom);
  ctx.fillStyle = cap;
  ctx.fillRect(p.x - 5, top - 22, PILLAR_W + 10, 22);
  ctx.fillRect(p.x - 5, bottom, PILLAR_W + 10, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(p.x + 8, -10, 5, top - 12);
  ctx.fillRect(p.x + 8, bottom + 22, 5, FLOOR - bottom - 22);
  ctx.fillRect(p.x - 1, top - 20, PILLAR_W + 2, 3);
  ctx.fillRect(p.x - 1, bottom + 2, PILLAR_W + 2, 3);
}

function drawBird(ctx) {
  ctx.save();
  ctx.translate(BIRD_X, bird.y);
  ctx.rotate(bird.rot);
  ctx.shadowColor = '#ffb347';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_R + 2, BIRD_R - 1, 0, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Wing flicks up on each flap.
  const flapAngle = phase === 'ready' ? Math.sin(time * 14) * 0.5 : -bird.wing * 1.1 + 0.3;
  ctx.save();
  ctx.translate(-4, 3);
  ctx.rotate(flapAngle);
  ctx.fillStyle = '#ff9a2a';
  ctx.beginPath();
  ctx.ellipse(-4, 0, 10, 6, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(7, -5, 5.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(8.5, -5, phase === 'dead' ? 1.2 : 2.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff6a3d';
  ctx.beginPath();
  ctx.moveTo(14, -1);
  ctx.lineTo(25, 2);
  ctx.lineTo(14, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function render(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (theme.stars) {
    for (const s of stars) {
      ctx.globalAlpha = s.a * (0.7 + Math.sin(time * 2 + s.x) * 0.3);
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f4f0d0';
    ctx.beginPath();
    ctx.arc(W - 90, 90, 28, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (const c of clouds) {
      const x = ((c.x - scroll * 0.1 * c.s) % (W + 160) + W + 160) % (W + 160) - 80;
      ctx.beginPath();
      ctx.ellipse(x, c.y, 36 * c.s, 12 * c.s, 0, 0, TAU);
      ctx.ellipse(x + 20 * c.s, c.y - 8 * c.s, 24 * c.s, 12 * c.s, 0, 0, TAU);
      ctx.fill();
    }
  }

  drawHills(ctx, theme.far, FLOOR - 120, 34, 0.012, scroll * 0.2);
  drawHills(ctx, theme.near, FLOOR - 50, 20, 0.025, scroll * 0.45);

  for (const p of pillars) drawPillar(ctx, p);

  // Ground with scrolling stripes
  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, FLOOR, W, GROUND_H);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  const off = scroll % 40;
  for (let x = -off; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR + 14);
    ctx.lineTo(x + 20, FLOOR + 14);
    ctx.lineTo(x + 6, FLOOR + GROUND_H);
    ctx.lineTo(x - 14, FLOOR + GROUND_H);
    ctx.fill();
  }
  ctx.fillStyle = theme.grass;
  ctx.fillRect(0, FLOOR, W, 10);

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2.5, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  drawBird(ctx);

  // Big in-game score
  if (shell.state === 'playing' && phase !== 'ready') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 54px "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(shell.score, W / 2, 70);
    ctx.fillStyle = '#fff';
    ctx.fillText(shell.score, W / 2, 70);
  }
  if (shell.state === 'playing' && phase === 'ready') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText('Tap, click or press Space to flap', W / 2, H * 0.6);
  }
}

shell.debug = () => ({ bird, pillars, phase, speed, theme: theme.name });
shell.boot();
