// Template game ("Dot Dash"): copy this folder to start a new cabinet game.
// Collect dots, dodge the bouncers. Exercises the shell, input, audio and loop.

import { createShell } from '../../shared/shell.js';
import { KEYS } from '../../shared/input.js';
import { sfx } from '../../shared/audio.js';
import { TAU, rand, clamp, circlesOverlap } from '../../shared/util.js';

const W = 800;
const H = 500;
const PLAYER_SPEED = 260;
const DOTS_PER_HAZARD = 4;

let player, dot, hazards, particles, collected, time;

const shell = createShell({
  title: 'Dot Dash',
  tagline: 'Grab the dots. Dodge the bouncers.',
  width: W,
  height: H,
  accent: '#2de2e6',
  help: [
    ['Arrows / WASD', 'Move'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Drag to steer',
  init,
  update,
  render,
});

function init() {
  player = { x: W / 2, y: H / 2, r: 12 };
  hazards = [];
  particles = [];
  collected = 0;
  time = 0;
  dot = spawnDot();
  addHazard();
  shell.setStats({ Dots: 0, Bouncers: hazards.length });
}

function spawnDot() {
  let d;
  do {
    d = { x: rand(30, W - 30), y: rand(30, H - 30), r: 8 };
  } while (Math.hypot(d.x - player.x, d.y - player.y) < 120);
  return d;
}

function addHazard() {
  // Spawn along an edge, away from the player.
  const angle = rand(TAU);
  const speed = rand(120, 180) + collected * 4;
  const left = player.x > W / 2;
  hazards.push({ x: left ? 40 : W - 40, y: rand(40, H - 40), r: 14, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
}

function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    const s = rand(60, 220);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color });
  }
}

function update(dt) {
  const { input } = shell;
  time += dt;

  let dx = input.axisX();
  let dy = input.axisY();
  if (input.pointer.down) {
    const px = input.pointer.x - player.x;
    const py = input.pointer.y - player.y;
    const len = Math.hypot(px, py);
    if (len > 6) {
      dx = px / len;
      dy = py / len;
    }
  } else if (dx && dy) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  player.x = clamp(player.x + dx * PLAYER_SPEED * dt, player.r, W - player.r);
  player.y = clamp(player.y + dy * PLAYER_SPEED * dt, player.r, H - player.r);

  if (circlesOverlap(player, dot)) {
    collected++;
    shell.addScore(10);
    sfx('coin');
    burst(dot.x, dot.y, '#ffd23f');
    dot = spawnDot();
    if (collected % DOTS_PER_HAZARD === 0) {
      addHazard();
      sfx('powerup');
    }
    shell.setStats({ Dots: collected, Bouncers: hazards.length });
  }

  for (const z of hazards) {
    z.x += z.vx * dt;
    z.y += z.vy * dt;
    if (z.x < z.r || z.x > W - z.r) {
      z.vx *= -1;
      z.x = clamp(z.x, z.r, W - z.r);
      sfx('bounce');
    }
    if (z.y < z.r || z.y > H - z.r) {
      z.vy *= -1;
      z.y = clamp(z.y, z.r, H - z.r);
      sfx('bounce');
    }
    if (circlesOverlap(player, { x: z.x, y: z.y, r: z.r - 3 })) {
      burst(player.x, player.y, '#ff3d9a', 30);
      sfx('hurt');
      sfx('lose');
      shell.gameOver({ message: `You grabbed ${collected} dot${collected === 1 ? '' : 's'}.` });
      return;
    }
  }

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  if (input.pressed(KEYS.action)) burst(player.x, player.y, '#2de2e6', 6);
}

function render(ctx) {
  ctx.fillStyle = '#07060f';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(45,226,230,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  const pulse = 1 + Math.sin(time * 6) * 0.15;
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#ffd23f';
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(dot.x, dot.y, dot.r * pulse, 0, TAU);
  ctx.fill();

  ctx.shadowColor = '#ff3d9a';
  ctx.fillStyle = '#ff3d9a';
  for (const z of hazards) {
    ctx.beginPath();
    ctx.roundRect(z.x - z.r, z.y - z.r, z.r * 2, z.r * 2, 4);
    ctx.fill();
  }

  if (shell.state !== 'over') {
    ctx.shadowColor = '#2de2e6';
    ctx.fillStyle = '#2de2e6';
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

shell.boot();
