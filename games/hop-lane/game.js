// Hop Lane — endless road crosser. Hop over roads, ride logs across rivers, dodge trains.
// The camera creeps forward, so standing still eventually catches up with you.

import { createShell } from '../../shared/shell.js';
import { sfx, tone, noise } from '../../shared/audio.js';
import { TAU, rand, randInt, clamp, choose } from '../../shared/util.js';

const CELL = 48;
const COLS = 12;
const VISIBLE = 15;
const W = COLS * CELL;
const H = VISIBLE * CELL;

const HOP_TIME = 0.11;
const START_SAFE_ROWS = 4;
const CAMERA_LEAD = 4; // rows kept below the player
const CREEP_START = 0.22; // rows/s the camera advances on its own
const CREEP_MAX = 0.75;
const WRAP_PAD = 3; // cells beyond each edge that moving things travel through
const LOOP = COLS + WRAP_PAD * 2;
const TRAIN_SPEED = 28; // cells/s
const TRAIN_LEN = 10;
const TRAIN_WARN = 1.2;
const DEATH_PAUSE = 0.9;

const CAR_COLORS = ['#ff3d9a', '#ffd23f', '#2de2e6', '#ff8a3d', '#b26bff', '#7aa7ff'];
const KEYMAP = { ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };

let rows, player, cam, started, segType, segLeft, deadTimer, deathReason, particles, time, best, queued;

const shell = createShell({
  title: 'Hop Lane',
  tagline: 'Hop across. Don’t get squashed. Don’t dawdle.',
  width: W,
  height: H,
  accent: '#8be04e',
  help: [
    ['↑ / W', 'Hop forward'],
    ['← → ↓', 'Hop sideways / back'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Tap to hop forward · swipe to hop sideways or back',
  init,
  update,
  render,
});

function init() {
  rows = new Map();
  segType = 'grass';
  segLeft = 0;
  cam = 0;
  started = false;
  deadTimer = 0;
  deathReason = '';
  particles = [];
  time = 0;
  best = 0;
  queued = null;
  player = { x: Math.floor(COLS / 2), row: 1, hop: null, facing: [0, 1], dead: null, squash: 0 };
  ensureRows();
  shell.setScore(0);
}

// ---------- World generation ----------

const difficulty = (r) => clamp(r / 300, 0, 1);

function nextSegment(r) {
  const prev = segType;
  if (prev !== 'grass' && Math.random() < 0.6) {
    segType = 'grass';
    segLeft = randInt(1, 2);
    return;
  }
  const d = difficulty(r);
  const pick = Math.random();
  if (pick < 0.42) {
    segType = 'road';
    segLeft = randInt(1, 3 + Math.round(d));
  } else if (pick < 0.7) {
    segType = 'river';
    segLeft = randInt(1, 2 + Math.round(d * 2));
  } else if (pick < 0.85) {
    segType = 'rail';
    segLeft = randInt(1, 2);
  } else {
    segType = 'grass';
    segLeft = randInt(1, 2);
  }
}

function makeRow(r) {
  if (r < START_SAFE_ROWS) {
    const trees = new Set();
    if (r < 0) for (let c = 0; c < COLS; c++) trees.add(c);
    else if (r > 0) [0, COLS - 1].forEach((c) => trees.add(c));
    return { type: 'grass', trees, shade: r % 2 };
  }
  if (segLeft <= 0) nextSegment(r);
  segLeft--;
  const d = difficulty(r);
  const dir = Math.random() < 0.5 ? -1 : 1;

  if (segType === 'grass') {
    const trees = new Set();
    const count = randInt(0, 3 + Math.round(d * 2));
    for (let i = 0; i < count; i++) trees.add(randInt(0, COLS - 1));
    return { type: 'grass', trees, shade: r % 2 };
  }

  if (segType === 'road') {
    const truck = Math.random() < 0.3;
    const len = truck ? 2.4 : 1.4;
    const speed = rand(1.5, 2.6) + d * 2.6;
    const count = truck ? randInt(1, 2) : randInt(2, 3);
    return { type: 'road', dir, speed, items: spread(count, len, 2.6, () => ({ color: choose(CAR_COLORS), truck })) };
  }

  if (segType === 'river') {
    const speed = rand(1, 2) + d * 1.6;
    const len = clamp(rand(2.2, 4) - d, 1.8, 4);
    return { type: 'river', dir, speed, items: spread(randInt(3, 4), len, 1.4, () => ({})) };
  }

  return { type: 'rail', dir, timer: rand(2, 6), train: null };
}

// Place `count` items of length `len` around the wrapping loop with at least `minGap` between them.
function spread(count, len, minGap, extra) {
  const slack = LOOP - count * (len + minGap);
  const items = [];
  let x = -WRAP_PAD + rand(0, 2);
  for (let i = 0; i < count; i++) {
    items.push({ x, len, ...extra() });
    x += len + minGap + rand(0, Math.max(0, slack / count));
  }
  return items;
}

function ensureRows() {
  const top = Math.ceil(cam) + VISIBLE + 2;
  for (let r = Math.floor(cam) - 2; r <= top; r++) {
    if (!rows.has(r)) rows.set(r, { ...makeRow(r), r });
  }
  for (const r of rows.keys()) if (r < cam - 3) rows.delete(r);
}

// ---------- Movement ----------

function tryHop([dx, dy]) {
  if (player.hop || player.dead) return;
  const toRow = player.row + dy;
  const target = rows.get(toRow);
  if (!target) return;
  let toX = player.x + dx;
  // On solid ground snap to the grid; on water keep the offset you rode in with.
  if (target.type !== 'river') toX = Math.round(toX);
  if (toX < -0.01 || toX > COLS - 0.99) return;
  if (toRow < Math.floor(cam)) return;
  if (target.type === 'grass' && target.trees.has(Math.round(toX))) {
    tone({ freq: 160, dur: 0.06, type: 'square', vol: 0.06 });
    player.facing = [dx, dy];
    return;
  }
  player.hop = { fromX: player.x, fromRow: player.row, toX, toRow, t: 0 };
  player.facing = [dx, dy];
  started = true;
  tone({ freq: 380, to: 620, dur: 0.07, type: 'square', vol: 0.06 });
}

function overlaps(px, item) {
  return px + 0.78 > item.x && px + 0.22 < item.x + item.len;
}

function die(reason, kind) {
  player.dead = kind;
  deathReason = reason;
  deadTimer = DEATH_PAUSE;
  const cx = (player.x + 0.5) * CELL;
  const cy = rowToY(player.row) + CELL / 2;
  if (kind === 'splash') {
    noise({ dur: 0.4, vol: 0.3, freq: 900, to: 200 });
    for (let i = 0; i < 18; i++) {
      const a = rand(TAU);
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * rand(40, 160), vy: Math.sin(a) * rand(40, 160), life: rand(0.4, 0.8), color: '#9fdcff' });
    }
  } else {
    sfx('hurt');
    for (let i = 0; i < 14; i++) {
      const a = rand(TAU);
      particles.push({ x: cx, y: cy, vx: Math.cos(a) * rand(60, 200), vy: Math.sin(a) * rand(60, 200), life: rand(0.3, 0.7), color: '#b8f56a' });
    }
  }
  sfx('lose');
}

function update(dt) {
  const { input } = shell;
  time += dt;

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  // Moving things keep moving even after you're caught.
  for (const row of rows.values()) {
    if (row.type === 'road' || row.type === 'river') {
      for (const it of row.items) {
        it.x += row.dir * row.speed * dt;
        if (row.dir > 0 && it.x > COLS + WRAP_PAD) it.x -= LOOP;
        if (row.dir < 0 && it.x + it.len < -WRAP_PAD) it.x += LOOP;
      }
    } else if (row.type === 'rail') {
      if (row.train) {
        row.train.x += row.dir * TRAIN_SPEED * dt;
        if (row.train.x > COLS + TRAIN_LEN + 2 || row.train.x < -TRAIN_LEN * 2 - 2) {
          row.train = null;
          row.timer = rand(3, 7);
        }
      } else {
        const before = row.timer;
        row.timer -= dt;
        if (before > TRAIN_WARN && row.timer <= TRAIN_WARN && Math.abs(rowY(row) - player.row) < 6) {
          tone({ freq: 1200, dur: 0.12, type: 'square', vol: 0.05 });
          tone({ freq: 1200, dur: 0.12, type: 'square', vol: 0.05, delay: 0.3 });
        }
        if (row.timer <= 0) {
          row.train = { x: row.dir > 0 ? -TRAIN_LEN - 1 : COLS + 1, len: TRAIN_LEN };
          if (Math.abs(rowY(row) - player.row) < 6) noise({ dur: 0.6, vol: 0.15, freq: 400 });
        }
      }
    }
  }

  if (player.dead) {
    deadTimer -= dt;
    if (deadTimer <= 0) shell.gameOver({ title: deathReason, message: `You reached row ${best}.` });
    return;
  }

  // Input (one hop can be queued while mid-hop).
  for (const [code, dir] of Object.entries(KEYMAP)) if (input.pressed(code)) queued = dir;
  const swipe = input.takeSwipe();
  if (swipe) queued = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] }[swipe];
  else if (input.pointer.released) queued = [0, 1]; // a plain tap hops forward
  if (queued && !player.hop) {
    tryHop(queued);
    queued = null;
  }

  // Hop animation.
  if (player.hop) {
    player.hop.t += dt / HOP_TIME;
    if (player.hop.t >= 1) {
      player.x = player.hop.toX;
      player.row = player.hop.toRow;
      player.hop = null;
      if (player.row > best) {
        best = player.row;
        shell.setScore(best);
      }
    }
  }

  const row = rows.get(player.row);
  if (!player.hop && row) {
    if (row.type === 'river') {
      const log = row.items.find((it) => player.x + 0.5 > it.x && player.x + 0.5 < it.x + it.len);
      if (!log) return die('Splash!', 'splash');
      player.x += row.dir * row.speed * dt;
      if (player.x < -0.45 || player.x > COLS - 0.55) return die('Swept Away!', 'splash');
    }
  }
  // Traffic can hit you mid-hop too, on whichever row you're mostly over.
  const overRow = player.hop ? (player.hop.t < 0.5 ? player.hop.fromRow : player.hop.toRow) : player.row;
  const over = rows.get(overRow);
  const px = player.hop ? player.hop.fromX + (player.hop.toX - player.hop.fromX) * player.hop.t : player.x;
  if (over?.type === 'road' && over.items.some((it) => overlaps(px, it))) return die('Squashed!', 'squash');
  if (over?.type === 'rail' && over.train && overlaps(px, over.train)) return die('Train!', 'squash');

  // Camera: follow the player, and creep forward on its own once you've started.
  const target = player.row - CAMERA_LEAD;
  if (target > cam) cam += (target - cam) * Math.min(1, dt * 6);
  if (started) cam += (CREEP_START + (CREEP_MAX - CREEP_START) * difficulty(best)) * dt;
  ensureRows();
  if (player.row + 0.6 < cam) return die('Too Slow!', 'squash');
}

// ---------- Drawing ----------

const rowY = (row) => row.r;
const rowToY = (r) => H - (r - cam + 1) * CELL;

function drawTree(ctx, x, y) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + CELL / 2 + 4, y + CELL * 0.62, CELL * 0.36, CELL * 0.16, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#2f6b2a';
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL * 0.45, CELL * 0.36, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3f8a3a';
  ctx.beginPath();
  ctx.arc(x + CELL * 0.42, y + CELL * 0.38, CELL * 0.2, 0, TAU);
  ctx.fill();
}

function drawCar(ctx, it, y, dir) {
  const x = it.x * CELL;
  const w = it.len * CELL;
  const h = CELL * 0.62;
  const top = y + (CELL - h) / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 4, top + 6, w, h);
  ctx.shadowColor = it.color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = it.color;
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, 8);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(10,10,30,0.45)';
  if (it.truck) {
    ctx.fillRect(dir > 0 ? x + w - 22 : x + 8, top + 5, 14, h - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(dir > 0 ? x + 6 : x + 28, top + 6, w - 40, h - 12);
  } else {
    ctx.fillRect(x + w * 0.3, top + 5, w * 0.4, h - 10);
  }
  ctx.fillStyle = '#ffe9a0';
  const hx = dir > 0 ? x + w - 4 : x;
  ctx.fillRect(hx, top + 4, 4, 6);
  ctx.fillRect(hx, top + h - 10, 4, 6);
}

function drawPlayer(ctx) {
  let x = player.x;
  let r = player.row;
  let lift = 0;
  if (player.hop) {
    const t = player.hop.t;
    x = player.hop.fromX + (player.hop.toX - player.hop.fromX) * t;
    r = player.hop.fromRow + (player.hop.toRow - player.hop.fromRow) * t;
    lift = Math.sin(t * Math.PI) * 12;
  }
  if (player.dead === 'splash') return;
  const cx = (x + 0.5) * CELL;
  const cy = rowToY(r) + CELL / 2 - lift;
  const squashed = player.dead === 'squash';
  const sw = squashed ? 1.6 : 1;
  const sh = squashed ? 0.3 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, rowToY(r) + CELL * 0.78, 14, 5, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sw, sh);
  ctx.shadowColor = '#b8f56a';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#b8f56a';
  ctx.beginPath();
  ctx.roundRect(-15, -14, 30, 28, 10);
  ctx.fill();
  ctx.shadowBlur = 0;
  const [fx, fy] = player.facing;
  ctx.fillStyle = '#fff';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 6 + fx * 3, -5 - fy * 3, 4.5, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = '#111';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 6 + fx * 4.5, -5 - fy * 4.5, 2.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function render(ctx) {
  const first = Math.floor(cam) - 1;
  for (let r = first; r <= first + VISIBLE + 2; r++) {
    const row = rows.get(r);
    if (!row) continue;
    const y = rowToY(r);
    if (row.type === 'grass') {
      ctx.fillStyle = row.shade ? '#4c9a3a' : '#539f40';
      ctx.fillRect(0, y, W, CELL);
    } else if (row.type === 'road') {
      ctx.fillStyle = '#2c2c34';
      ctx.fillRect(0, y, W, CELL);
      const below = rows.get(r - 1);
      if (below?.type === 'road') {
        ctx.fillStyle = 'rgba(233,225,160,0.5)';
        for (let x = 8; x < W; x += 48) ctx.fillRect(x, y + CELL - 2, 24, 3);
      }
    } else if (row.type === 'river') {
      ctx.fillStyle = '#2a5d8f';
      ctx.fillRect(0, y, W, CELL);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      const off = (time * row.speed * row.dir * 18) % 60;
      for (let x = -60; x < W + 60; x += 60) ctx.fillRect(x + off, y + 12 + ((x / 60) % 2) * 18, 22, 2);
    } else if (row.type === 'rail') {
      ctx.fillStyle = '#3a3240';
      ctx.fillRect(0, y, W, CELL);
      ctx.fillStyle = '#5a4a3a';
      for (let x = 4; x < W; x += 20) ctx.fillRect(x, y + 6, 8, CELL - 12);
      ctx.fillStyle = '#9aa3c7';
      ctx.fillRect(0, y + 13, W, 3);
      ctx.fillRect(0, y + CELL - 16, W, 3);
    }
  }

  // Things on each row, drawn top to bottom so nearer rows overlap farther ones.
  for (let r = first + VISIBLE + 2; r >= first; r--) {
    const row = rows.get(r);
    if (!row) continue;
    const y = rowToY(r);
    if (row.type === 'grass') {
      for (const c of row.trees) drawTree(ctx, c * CELL, y);
    } else if (row.type === 'road') {
      for (const it of row.items) drawCar(ctx, it, y, row.dir);
    } else if (row.type === 'river') {
      for (const it of row.items) {
        ctx.fillStyle = '#7a4e2a';
        ctx.beginPath();
        ctx.roundRect(it.x * CELL, y + 7, it.len * CELL, CELL - 14, 12);
        ctx.fill();
        ctx.fillStyle = '#9a6a3a';
        ctx.fillRect(it.x * CELL + 10, y + 12, it.len * CELL - 20, 4);
        ctx.fillStyle = '#c99a5b';
        ctx.beginPath();
        ctx.ellipse(it.x * CELL + 8, y + CELL / 2, 5, (CELL - 14) / 2 - 2, 0, 0, TAU);
        ctx.fill();
      }
    } else if (row.type === 'rail') {
      const warn = !row.train && row.timer < TRAIN_WARN;
      ctx.fillStyle = warn && Math.floor(time * 6) % 2 ? '#ff3d3d' : '#4a2020';
      ctx.beginPath();
      ctx.arc(W - 14, y + 10, 6, 0, TAU);
      ctx.fill();
      if (row.train) {
        const t = row.train;
        ctx.shadowColor = '#ff8a3d';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(t.x * CELL, y + 4, t.len * CELL, CELL - 8);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffe9a0';
        for (let k = 0; k < t.len; k += 1.5) ctx.fillRect((t.x + k) * CELL + 10, y + 12, 26, 10);
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(row.dir > 0 ? (t.x + t.len) * CELL - 6 : t.x * CELL, y + 8, 6, CELL - 16);
      }
    }
    if (r === Math.round(player.hop ? player.hop.toRow : player.row)) drawPlayer(ctx);
  }

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  if (shell.state === 'playing' && !started) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(W / 2 - 150, H - 120, 300, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText('Press ↑ or tap to hop', W / 2, H - 94);
  }
}

shell.debug = () => ({ player, rows, cam, best, started });
shell.boot();
