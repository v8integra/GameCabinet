// Serpent — grid snake. Eat, grow, speed up; three modes (Classic, Wrap, Maze).

import { createShell } from '../../shared/shell.js';
import { sfx } from '../../shared/audio.js';
import { TAU, rand, clamp, lerp } from '../../shared/util.js';

const COLS = 24;
const ROWS = 16;
const CELL = 30;
const W = COLS * CELL;
const H = ROWS * CELL;

const START_INTERVAL = 0.14; // seconds per step
const MIN_INTERVAL = 0.06;
const SPEEDUP_PER_APPLE = 0.003;
const APPLES_PER_LEVEL = 5;
const BONUS_LIFE = 6; // seconds a bonus star stays
const DEATH_PAUSE = 0.9;

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};

const key = (x, y) => `${x},${y}`;

function mazeWalls() {
  const cells = [];
  const block = (x0, y0, x1, y1) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) cells.push([x, y]);
  };
  block(5, 3, 5, 6);
  block(5, 9, 5, 12);
  block(18, 3, 18, 6);
  block(18, 9, 18, 12);
  block(9, 3, 14, 3);
  block(9, 12, 14, 12);
  return cells;
}

let snake, prev, dir, queue, walls, wallList, food, bonus, grow, eaten, interval, acc, dying, particles, time;

const shell = createShell({
  title: 'Serpent',
  tagline: 'Eat, grow, and don’t bite your own tail.',
  width: W,
  height: H,
  accent: '#4dff88',
  help: [
    ['Arrows / WASD', 'Turn'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Swipe to turn',
  options: [{ key: 'mode', label: 'Mode', choices: [['classic', 'Classic'], ['wrap', 'Wrap'], ['maze', 'Maze']] }],
  init,
  update,
  render,
});

function init() {
  snake = [{ x: 6, y: 8 }, { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }];
  prev = snake.map((s) => ({ ...s }));
  dir = 'right';
  queue = [];
  wallList = shell.options.mode === 'maze' ? mazeWalls() : [];
  walls = new Set(wallList.map(([x, y]) => key(x, y)));
  grow = 0;
  eaten = 0;
  interval = START_INTERVAL;
  acc = 0;
  dying = 0;
  particles = [];
  time = 0;
  bonus = null;
  food = spawnCell();
  updateStats();
}

const level = () => 1 + Math.floor(eaten / APPLES_PER_LEVEL);

function updateStats() {
  shell.setStats({ Length: snake.length, Level: level() });
}

function isFree(x, y) {
  if (walls.has(key(x, y))) return false;
  if (snake.some((s) => s.x === x && s.y === y)) return false;
  if (food && food.x === x && food.y === y) return false;
  if (bonus && bonus.x === x && bonus.y === y) return false;
  return true;
}

function spawnCell() {
  const free = [];
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if (isFree(x, y)) free.push({ x, y });
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

function burst(x, y, color, n = 12, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    const s = rand(speed * 0.3, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color });
  }
}

function queueTurn(d) {
  const last = queue.length ? queue[queue.length - 1] : dir;
  if (d === last || d === OPPOSITE[last] || queue.length >= 2) return;
  queue.push(d);
}

function die() {
  dying = DEATH_PAUSE;
  sfx('hurt');
  sfx('lose');
  for (const s of snake) burst((s.x + 0.5) * CELL, (s.y + 0.5) * CELL, '#4dff88', 4, 120);
}

function step() {
  if (queue.length) dir = queue.shift();
  const [dx, dy] = DIRS[dir];
  const head = snake[0];
  let nx = head.x + dx;
  let ny = head.y + dy;

  if (shell.options.mode === 'wrap') {
    nx = (nx + COLS) % COLS;
    ny = (ny + ROWS) % ROWS;
  } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
    return die();
  }
  if (walls.has(key(nx, ny))) return die();

  const eatsFood = food && food.x === nx && food.y === ny;
  const eatsBonus = bonus && bonus.x === nx && bonus.y === ny;
  // The tail moves out of the way this step unless the snake is growing.
  const tailStays = grow > 0 || eatsFood || eatsBonus;
  const body = tailStays ? snake : snake.slice(0, -1);
  if (body.some((s) => s.x === nx && s.y === ny)) return die();

  prev = snake.map((s) => ({ ...s }));
  snake.unshift({ x: nx, y: ny });

  if (eatsFood) {
    eaten++;
    grow++;
    shell.addScore(10 * level());
    sfx('coin');
    burst((nx + 0.5) * CELL, (ny + 0.5) * CELL, '#ff4d4d');
    interval = Math.max(MIN_INTERVAL, START_INTERVAL - eaten * SPEEDUP_PER_APPLE);
    food = spawnCell();
    if (eaten % APPLES_PER_LEVEL === 0) {
      const cell = spawnCell();
      if (cell) bonus = { ...cell, t: BONUS_LIFE };
    }
  }
  if (eatsBonus) {
    grow++;
    shell.addScore(50 * level());
    sfx('powerup');
    burst((nx + 0.5) * CELL, (ny + 0.5) * CELL, '#ffd23f', 24, 220);
    bonus = null;
  }

  if (grow > 0) grow--;
  else snake.pop();
  updateStats();

  if (!food) {
    // Board is full — a rare, glorious win.
    sfx('win');
    shell.gameOver({ title: 'Board Cleared!', win: true, message: `Length ${snake.length}. Nowhere left to go.` });
  }
}

function update(dt) {
  const { input } = shell;
  time += dt;

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.93;
    p.vy *= 0.93;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  if (dying > 0) {
    dying -= dt;
    if (dying <= 0) shell.gameOver({ message: `Length ${snake.length} · Level ${level()}` });
    return;
  }

  for (const [code, d] of Object.entries(KEYMAP)) if (input.pressed(code)) queueTurn(d);
  const swipe = input.takeSwipe();
  if (swipe) queueTurn(swipe);

  if (bonus) {
    bonus.t -= dt;
    if (bonus.t <= 0) bonus = null;
  }

  acc += dt;
  while (acc >= interval && dying <= 0) {
    acc -= interval;
    step();
  }
}

// ---------- Drawing ----------

function drawBoard(ctx) {
  ctx.fillStyle = '#06140d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(77,255,136,0.025)';
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) if ((x + y) % 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  if (shell.options.mode !== 'wrap') {
    ctx.strokeStyle = 'rgba(77,255,136,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  } else {
    ctx.strokeStyle = 'rgba(77,255,136,0.15)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.setLineDash([]);
  }
  for (const [x, y] of wallList) {
    ctx.fillStyle = '#123a24';
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = 'rgba(77,255,136,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * CELL + 3.5, y * CELL + 3.5, CELL - 7, CELL - 7);
  }
}

function drawApple(ctx, cx, cy) {
  const r = CELL * 0.34 * (1 + Math.sin(time * 5) * 0.06);
  ctx.shadowColor = '#ff4d4d';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath();
  ctx.arc(cx, cy + 1, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.3, r * 0.25, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#4dff88';
  ctx.beginPath();
  ctx.ellipse(cx + 3, cy - r - 1, 5, 2.5, -0.5, 0, TAU);
  ctx.fill();
}

function drawStar(ctx, cx, cy, t) {
  if (t < 2 && Math.floor(t * 8) % 2) return; // blink before vanishing
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 2);
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 10;
    const d = i % 2 ? 5 : 12;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,210,63,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL * 0.48, -Math.PI / 2, -Math.PI / 2 + TAU * (t / BONUS_LIFE));
  ctx.stroke();
}

// Segment positions in pixels, eased between the last two steps for smooth motion.
function segmentPoints() {
  const t = dying > 0 ? 1 : clamp(acc / interval, 0, 1);
  return snake.map((s, i) => {
    const from = prev[Math.min(i, prev.length - 1)];
    const jump = Math.abs(from.x - s.x) > 1 || Math.abs(from.y - s.y) > 1; // wrapped edge
    const x = jump ? s.x : lerp(from.x, s.x, t);
    const y = jump ? s.y : lerp(from.y, s.y, t);
    return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
  });
}

function drawSnake(ctx) {
  const pts = segmentPoints();
  const dead = dying > 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = CELL * 0.72;
  for (let i = pts.length - 1; i > 0; i--) {
    const a = pts[i];
    const b = pts[i - 1];
    if (Math.abs(a.x - b.x) > CELL * 1.5 || Math.abs(a.y - b.y) > CELL * 1.5) continue; // across a wrap
    const light = 28 + (1 - i / pts.length) * 30;
    ctx.strokeStyle = dead ? `hsl(0, 70%, ${light}%)` : `hsl(140, 95%, ${light}%)`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const head = pts[0];
  ctx.shadowColor = dead ? '#ff4d4d' : '#4dff88';
  ctx.shadowBlur = 14;
  ctx.fillStyle = dead ? '#ff6b6b' : '#7dffaa';
  ctx.beginPath();
  ctx.arc(head.x, head.y, CELL * 0.42, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  const [dx, dy] = DIRS[dir];
  const px = -dy;
  const py = dx;
  for (const side of [-1, 1]) {
    const ex = head.x + dx * 5 + px * side * 6;
    const ey = head.y + dy * 5 + py * side * 6;
    ctx.fillStyle = '#06140d';
    ctx.beginPath();
    ctx.arc(ex, ey, dead ? 2 : 3, 0, TAU);
    ctx.fill();
  }
}

function render(ctx) {
  drawBoard(ctx);
  if (food) drawApple(ctx, (food.x + 0.5) * CELL, (food.y + 0.5) * CELL);
  if (bonus) drawStar(ctx, (bonus.x + 0.5) * CELL, (bonus.y + 0.5) * CELL, bonus.t);
  drawSnake(ctx);
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

shell.debug = () => ({ snake, food, bonus, dir, dying, eaten });
shell.boot();
