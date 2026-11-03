// Sky Reach — bounce ever upward on platforms while the glowing ground rises below.
// Springs, drifting clouds, crumbling ledges, super jump and speed boost power-ups.

import { createShell } from '../../shared/shell.js';
import { sfx, tone } from '../../shared/audio.js';
import { TAU, rand, clamp, lerp, seeded } from '../../shared/util.js';

const W = 480;
const H = 720;

const GRAVITY = 1700;
const BOUNCE_VY = -860;
const SPRING_VY = -1420;
const SUPER_FACTOR = 1.28;
const MOVE_SPEED = 320;
const BOOST_SPEED = 480;
const MOVE_ACCEL = 2600;
const PLAYER_W = 30;
const PLAYER_H = 32;

const POWER_TIME = 8;
const GROUND_START_SPEED = 26; // px/s
const GROUND_SPEED_GAIN = 1.6; // px/s per second
const GROUND_MAX_SPEED = 150;
const GROUND_LEASH = 320; // never more than this far below the screen
const PX_PER_METER = 10;
const GEM_POINTS = 25;

let player, platforms, items, camY, topY, groundY, groundSpeed, elapsed, maxHeight, gems;
let superTimer, speedTimer, particles, deadTimer, deathText, time, decor;

const shell = createShell({
  title: 'Sky Reach',
  tagline: 'Climb into the clouds. The ground is rising.',
  width: W,
  height: H,
  accent: '#5fd0ff',
  help: [
    ['← → / A D', 'Steer (you bounce automatically)'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Hold the left or right side to steer',
  init,
  update,
  render,
});

function init() {
  player = { x: W / 2, y: -PLAYER_H, vx: 0, vy: BOUNCE_VY, squash: 0, face: 1 };
  platforms = [{ x: 0, y: 0, w: W, type: 'base' }];
  items = [];
  particles = [];
  camY = -H * 0.7;
  topY = 0;
  groundY = 260;
  groundSpeed = GROUND_START_SPEED;
  elapsed = 0;
  maxHeight = 0;
  gems = 0;
  superTimer = 0;
  speedTimer = 0;
  deadTimer = 0;
  deathText = '';
  time = 0;
  const r = seeded(Math.floor(Math.random() * 1e6));
  decor = Array.from({ length: 14 }, () => ({ x: r() * W, y: r() * 2400, s: 0.5 + r() * 0.9, depth: 0.2 + r() * 0.4 }));
  generate();
  updateStats();
}

const heightM = () => Math.max(0, Math.floor(-player.y / PX_PER_METER));
const difficulty = () => clamp(-topY / 9000, 0, 1);

function updateStats() {
  shell.setStats({ Height: `${maxHeight}m`, Gems: gems });
  shell.setScore(maxHeight + gems * GEM_POINTS);
}

// Keep platforms generated a screen above the camera.
function generate() {
  while (topY > camY - H) {
    const d = difficulty();
    const gap = rand(62 + d * 40, 105 + d * 65);
    topY -= Math.min(gap, 175);
    const roll = Math.random();
    const type = roll < 0.12 + d * 0.25 ? 'cloud' : roll < 0.2 + d * 0.4 ? 'crumble' : 'normal';
    const w = type === 'cloud' ? 92 : type === 'crumble' ? 74 : rand(70, 92) - d * 10;
    const p = { x: rand(8, W - w - 8), y: topY, w, type, vx: 0, spring: false, broken: false, fall: 0 };
    if (type === 'cloud') p.vx = (Math.random() < 0.5 ? -1 : 1) * rand(40, 60 + d * 90);
    if (type === 'normal' && Math.random() < 0.09) p.spring = true;
    platforms.push(p);
    const itemRoll = Math.random();
    if (type !== 'crumble' && !p.spring) {
      const kind = itemRoll < 0.03 ? 'super' : itemRoll < 0.06 ? 'speed' : itemRoll < 0.18 ? 'gem' : null;
      if (kind) items.push({ kind, x: p.x + p.w / 2, y: p.y - 34, platform: p, bob: rand(TAU) });
    }
  }
  platforms = platforms.filter((p) => p.y < camY + H + 400);
  items = items.filter((it) => it.y < camY + H + 400 && !it.taken);
}

function burst(x, y, color, n = 12, speed = 180) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    const s = rand(speed * 0.3, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color });
  }
}

function die(text) {
  deathText = text;
  deadTimer = 1;
  sfx('hurt');
  sfx('lose');
  burst(player.x, player.y + PLAYER_H / 2, '#ff3d9a', 24, 240);
}

function update(dt) {
  const { input } = shell;
  time += dt;

  for (const q of particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += 500 * dt;
    q.life -= dt;
  }
  particles = particles.filter((q) => q.life > 0);

  if (deadTimer > 0) {
    deadTimer -= dt;
    groundY -= groundSpeed * dt;
    if (deadTimer <= 0) shell.gameOver({ title: deathText, message: `You reached ${maxHeight}m with ${gems} gem${gems === 1 ? '' : 's'}.` });
    return;
  }

  elapsed += dt;
  superTimer = Math.max(0, superTimer - dt);
  speedTimer = Math.max(0, speedTimer - dt);

  // Steering: keyboard, or hold either side of the screen.
  let dir = input.axisX();
  if (!dir && input.pointer.down) dir = input.pointer.x < W / 2 ? -1 : 1;
  const maxSpeed = speedTimer > 0 ? BOOST_SPEED : MOVE_SPEED;
  const target = dir * maxSpeed;
  const accel = MOVE_ACCEL * (speedTimer > 0 ? 1.4 : 1) * dt;
  player.vx += clamp(target - player.vx, -accel, accel);
  if (dir) player.face = dir;

  const prevBottom = player.y + PLAYER_H;
  player.vy += GRAVITY * dt;
  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.squash = Math.max(0, player.squash - dt * 4);
  // Wrap around the sides.
  if (player.x < -PLAYER_W / 2) player.x += W;
  if (player.x > W + PLAYER_W / 2) player.x -= W;

  for (const p of platforms) {
    if (p.type === 'cloud') {
      p.x += p.vx * dt;
      if (p.x < 0 || p.x + p.w > W) {
        p.vx = -p.vx;
        p.x = clamp(p.x, 0, W - p.w);
      }
    }
    if (p.broken) {
      p.fall += dt;
      p.y += 400 * dt * p.fall * 3;
    }
  }

  // Land only while falling, when the feet cross a platform's top this step.
  if (player.vy > 0) {
    const bottom = player.y + PLAYER_H;
    for (const p of platforms) {
      if (p.broken) continue;
      if (prevBottom <= p.y && bottom >= p.y && player.x + PLAYER_W * 0.35 > p.x && player.x - PLAYER_W * 0.35 < p.x + p.w) {
        player.y = p.y - PLAYER_H;
        const onSpring = p.spring && Math.abs(player.x - (p.x + p.w / 2)) < 20;
        let vy = onSpring ? SPRING_VY : BOUNCE_VY;
        if (superTimer > 0) vy *= SUPER_FACTOR;
        player.vy = vy;
        player.squash = 1;
        if (onSpring) {
          p.springPop = 0.25;
          tone({ freq: 300, to: 1200, dur: 0.22, type: 'square', vol: 0.12 });
        } else {
          tone({ freq: 260, to: 520, dur: 0.08, type: 'triangle', vol: 0.12 });
        }
        if (p.type === 'crumble') {
          p.broken = true;
          burst(p.x + p.w / 2, p.y, '#a0703a', 10, 120);
          sfx('hit');
        }
        break;
      }
    }
  }
  for (const p of platforms) if (p.springPop) p.springPop = Math.max(0, p.springPop - dt);

  for (const it of items) {
    if (it.taken) continue;
    if (it.platform && it.platform.type === 'cloud') it.x = it.platform.x + it.platform.w / 2;
    if (Math.abs(it.x - player.x) < 26 && Math.abs(it.y - (player.y + PLAYER_H / 2)) < 30) {
      it.taken = true;
      if (it.kind === 'gem') {
        gems++;
        sfx('coin');
        burst(it.x, it.y, '#5fd0ff', 10, 140);
      } else {
        if (it.kind === 'super') superTimer = POWER_TIME;
        else speedTimer = POWER_TIME;
        sfx('powerup');
        burst(it.x, it.y, it.kind === 'super' ? '#ffd23f' : '#4dff88', 16, 200);
      }
    }
  }

  // Camera only moves up.
  camY = Math.min(camY, player.y - H * 0.42);
  generate();

  const h = heightM();
  if (h > maxHeight) {
    maxHeight = h;
    updateStats();
  } else if (gems * GEM_POINTS + maxHeight !== shell.score) updateStats();

  // The ground rises faster over time, and never falls too far behind.
  groundSpeed = Math.min(GROUND_MAX_SPEED, GROUND_START_SPEED + elapsed * GROUND_SPEED_GAIN);
  groundY -= groundSpeed * dt;
  groundY = Math.min(groundY, camY + H + GROUND_LEASH);

  if (player.y + PLAYER_H > groundY + 6) return die('Caught by the Rise!');
  if (player.y > camY + H + 60) return die('Fell Away!');
}

// ---------- Drawing ----------

function skyColors() {
  // Day → sunset → night → space as you climb.
  const stops = [
    [0, [42, 108, 214], [159, 220, 255]],
    [600, [70, 60, 160], [255, 160, 120]],
    [1400, [20, 18, 70], [90, 60, 150]],
    [2400, [2, 2, 12], [20, 16, 50]],
  ];
  const m = maxHeight;
  let i = 0;
  while (i < stops.length - 2 && m > stops[i + 1][0]) i++;
  const [a, b] = [stops[i], stops[i + 1]];
  const t = clamp((m - a[0]) / (b[0] - a[0]), 0, 1);
  const mix = (c1, c2) => `rgb(${c1.map((v, k) => Math.round(lerp(v, c2[k], t))).join(',')})`;
  return [mix(a[1], b[1]), mix(a[2], b[2]), clamp((m - 900) / 1200, 0, 1)];
}

function drawPlatform(ctx, p, y) {
  if (p.type === 'base') {
    ctx.fillStyle = '#3a2a5a';
    ctx.fillRect(0, y, W, 400);
    ctx.fillStyle = '#5a4a8a';
    ctx.fillRect(0, y, W, 6);
    return;
  }
  ctx.globalAlpha = p.broken ? clamp(1 - p.fall * 2, 0, 1) : 1;
  if (p.type === 'cloud') {
    ctx.fillStyle = '#f4f7ff';
    ctx.beginPath();
    ctx.ellipse(p.x + p.w / 2, y + 8, p.w / 2, 11, 0, 0, TAU);
    ctx.ellipse(p.x + p.w * 0.32, y + 2, p.w * 0.22, 11, 0, 0, TAU);
    ctx.ellipse(p.x + p.w * 0.66, y, p.w * 0.25, 13, 0, 0, TAU);
    ctx.fill();
  } else {
    const crumble = p.type === 'crumble';
    ctx.fillStyle = crumble ? '#8a5a2a' : '#4c3a8a';
    ctx.beginPath();
    ctx.roundRect(p.x, y, p.w, 13, 6);
    ctx.fill();
    ctx.fillStyle = crumble ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)';
    if (crumble) {
      ctx.fillRect(p.x + p.w * 0.3, y + 2, 2, 9);
      ctx.fillRect(p.x + p.w * 0.62, y + 3, 2, 8);
    } else ctx.fillRect(p.x + 6, y + 2, p.w - 12, 2);
  }
  if (p.spring) {
    const cx = p.x + p.w / 2;
    const ext = p.springPop ? 10 : 0;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) ctx.lineTo(cx - 6 + (i % 2) * 12, y - i * (1.6 + ext / 6));
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(cx - 11, y - 12 - ext, 22, 4);
  }
  ctx.globalAlpha = 1;
}

function drawItem(ctx, it, y) {
  const by = y + Math.sin(time * 3 + it.bob) * 4;
  if (it.kind === 'gem') {
    ctx.shadowColor = '#5fd0ff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#9fe8ff';
    ctx.beginPath();
    ctx.moveTo(it.x, by - 10);
    ctx.lineTo(it.x + 8, by);
    ctx.lineTo(it.x, by + 10);
    ctx.lineTo(it.x - 8, by);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    return;
  }
  const color = it.kind === 'super' ? '#ffd23f' : '#4dff88';
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(it.x, by, 13, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1a1030';
  ctx.beginPath();
  if (it.kind === 'super') {
    // Up arrow
    ctx.moveTo(it.x, by - 8);
    ctx.lineTo(it.x + 7, by);
    ctx.lineTo(it.x + 3, by);
    ctx.lineTo(it.x + 3, by + 7);
    ctx.lineTo(it.x - 3, by + 7);
    ctx.lineTo(it.x - 3, by);
    ctx.lineTo(it.x - 7, by);
  } else {
    // Lightning bolt
    ctx.moveTo(it.x + 2, by - 9);
    ctx.lineTo(it.x - 5, by + 1);
    ctx.lineTo(it.x, by + 1);
    ctx.lineTo(it.x - 2, by + 9);
    ctx.lineTo(it.x + 5, by - 1);
    ctx.lineTo(it.x, by - 1);
  }
  ctx.closePath();
  ctx.fill();
}

function drawPlayer(ctx, x, y) {
  const s = player.squash;
  const sw = 1 + s * 0.25;
  const sh = 1 - s * 0.22;
  ctx.save();
  ctx.translate(x, y + PLAYER_H);
  ctx.scale(sw, sh);
  if (superTimer > 0 || speedTimer > 0) {
    ctx.shadowColor = superTimer > 0 ? '#ffd23f' : '#4dff88';
    ctx.shadowBlur = 20;
  } else {
    ctx.shadowColor = '#ff3d9a';
    ctx.shadowBlur = 10;
  }
  ctx.fillStyle = '#ff3d9a';
  ctx.beginPath();
  ctx.roundRect(-PLAYER_W / 2, -PLAYER_H, PLAYER_W, PLAYER_H, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  const look = player.face * 3;
  ctx.fillRect(-8 + look, -24, 6, 8);
  ctx.fillRect(2 + look, -24, 6, 8);
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(-6 + look + player.face, -21, 3, 4);
  ctx.fillRect(4 + look + player.face, -21, 3, 4);
  ctx.restore();
}

function render(ctx) {
  const [top, bottom, space] = skyColors();
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars fade in high up; soft clouds drift by lower down.
  if (space > 0) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) {
      const x = (i * 97) % W;
      const y = (((i * 53 - camY * 0.05) % H) + H) % H;
      ctx.globalAlpha = space * (0.4 + ((i * 7) % 6) / 10);
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - space)})`;
  for (const c of decor) {
    const y = ((((c.y - camY * c.depth) % 2400) + 2400) % 2400) - 200;
    if (y < -60 || y > H + 60) continue;
    ctx.beginPath();
    ctx.ellipse(c.x, y, 50 * c.s, 14 * c.s, 0, 0, TAU);
    ctx.ellipse(c.x + 28 * c.s, y - 9 * c.s, 30 * c.s, 13 * c.s, 0, 0, TAU);
    ctx.fill();
  }

  for (const p of platforms) {
    const y = p.y - camY;
    if (y > -40 && y < H + 20) drawPlatform(ctx, p, y);
  }
  for (const it of items) if (!it.taken) drawItem(ctx, it, it.y - camY);

  if (deadTimer <= 0) {
    const px = player.x;
    const py = player.y - camY;
    drawPlayer(ctx, px, py);
    // Draw a wrapped copy when straddling an edge.
    if (px < PLAYER_W) drawPlayer(ctx, px + W, py);
    if (px > W - PLAYER_W) drawPlayer(ctx, px - W, py);
  }

  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life * 2, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 2, q.y - camY - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // The rising glow.
  const gy = groundY - camY;
  if (gy < H + 40) {
    const g = ctx.createLinearGradient(0, gy - 40, 0, gy + 120);
    g.addColorStop(0, 'rgba(255,138,61,0)');
    g.addColorStop(0.3, 'rgba(255,138,61,0.55)');
    g.addColorStop(0.45, '#ff8a3d');
    g.addColorStop(1, '#5a1e0a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, gy + Math.sin(x * 0.04 + time * 3) * 6);
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,120,0.8)';
    for (let i = 0; i < 6; i++) {
      const bx = (i * 83 + time * 30) % W;
      const by = gy + 10 + Math.sin(time * 4 + i) * 6;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, TAU);
      ctx.fill();
    }
  }

  // Warning arrow when the rise is close but off-screen.
  if (gy > H && gy < H + 260 && shell.state === 'playing') {
    ctx.fillStyle = `rgba(255,138,61,${0.5 + Math.sin(time * 8) * 0.3})`;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 14, H - 26);
    ctx.lineTo(W / 2 + 14, H - 26);
    ctx.lineTo(W / 2, H - 10);
    ctx.fill();
  }

  // Power-up timers
  let row = 0;
  for (const [t, color, label] of [[superTimer, '#ffd23f', 'SUPER JUMP'], [speedTimer, '#4dff88', 'SPEED']]) {
    if (t <= 0) continue;
    ctx.fillStyle = color;
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, 12, 22 + row * 18);
    ctx.fillRect(90, 15 + row * 18, 80 * (t / POWER_TIME), 5);
    row++;
  }
}

shell.debug = () => ({ player, platforms, items, camY, groundY, maxHeight, gems, superTimer, setGround: (y) => (groundY = y) });
shell.boot();
