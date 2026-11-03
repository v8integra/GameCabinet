// Block Drop — falling-block puzzle with its own piece set: 4-block shapes, 3-block shapes,
// and an occasional bomb that clears a 3×3 patch. Classic and Rising (garbage) modes.

import { createShell } from '../../shared/shell.js';
import { sfx, noise } from '../../shared/audio.js';
import { TAU, rand, clamp, shuffle } from '../../shared/util.js';

const W = 520;
const H = 660;
const COLS = 10;
const ROWS = 20;
const HIDDEN = 2; // spawn rows above the visible well
const CELL = 30;
const WELL_X = 24;
const WELL_Y = 30;
const PANEL_X = WELL_X + COLS * CELL + 28;

const LOCK_DELAY = 0.5;
const MAX_LOCK_RESETS = 15;
const DAS = 0.16; // hold time before auto-repeat
const ARR = 0.045; // auto-repeat interval
const SOFT_DROP_FACTOR = 20;
const CLEAR_TIME = 0.25;
const LINES_PER_LEVEL = 10;
const LINE_POINTS = [0, 100, 300, 500, 800];
const BOMB_EVERY = 24; // pieces
const BOMB_CELL_POINTS = 20;
const GARBAGE = '#3b3560';

const PIECES = {
  I: { color: '#2de2e6', cells: [[0, 1], [1, 1], [2, 1], [3, 1]], size: 4 },
  O: { color: '#ffd23f', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], size: 2 },
  T: { color: '#b26bff', cells: [[1, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  S: { color: '#4dff88', cells: [[1, 0], [2, 0], [0, 1], [1, 1]], size: 3 },
  Z: { color: '#ff3d9a', cells: [[0, 0], [1, 0], [1, 1], [2, 1]], size: 3 },
  L: { color: '#ff8a3d', cells: [[2, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  J: { color: '#7aa7ff', cells: [[0, 0], [0, 1], [1, 1], [2, 1]], size: 3 },
  i: { color: '#5fd0ff', cells: [[0, 1], [1, 1], [2, 1]], size: 3 },
  v: { color: '#ff6a6a', cells: [[0, 0], [0, 1], [1, 1]], size: 2 },
  bomb: { color: '#ffffff', cells: [[0, 0]], size: 1 },
};
const BAG = ['I', 'O', 'T', 'S', 'Z', 'L', 'J', 'i', 'v'];
const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

let board, piece, queue, bag, hold, holdUsed, level, lines, gravityAcc, lockTimer, lockResets;
let dasDir, dasTimer, clearing, clearTimer, garbageTimer, piecesDealt, particles, touch, time, flashes;

const shell = createShell({
  title: 'Block Drop',
  tagline: 'Fit the falling blocks. Clear lines. Mind the bombs.',
  width: W,
  height: H,
  accent: '#b26bff',
  help: [
    ['← →', 'Move'],
    ['↑ / X', 'Rotate right'],
    ['Z', 'Rotate left'],
    ['↓', 'Soft drop'],
    ['Space', 'Hard drop'],
    ['C / Shift', 'Hold'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Drag to move · tap to rotate · flick down to drop · flick up to hold',
  options: [{ key: 'mode', label: 'Mode', choices: [['classic', 'Classic'], ['rising', 'Rising']] }],
  init,
  update,
  render,
});

function init() {
  board = Array.from({ length: ROWS + HIDDEN }, () => Array(COLS).fill(null));
  bag = [];
  queue = [];
  hold = null;
  holdUsed = false;
  level = 1;
  lines = 0;
  gravityAcc = 0;
  lockTimer = 0;
  lockResets = 0;
  dasDir = 0;
  dasTimer = 0;
  clearing = null;
  clearTimer = 0;
  garbageTimer = garbageInterval();
  piecesDealt = 0;
  particles = [];
  flashes = [];
  touch = null;
  time = 0;
  while (queue.length < 4) queue.push(drawKind());
  spawn();
  updateStats();
}

function updateStats() {
  shell.setStats({ Lines: lines, Level: level });
}

const gravityInterval = () => Math.max(0.04, 0.8 * Math.pow(0.84, level - 1));
const garbageInterval = () => Math.max(4, 12 - level);

function drawKind() {
  piecesDealt++;
  if (piecesDealt % BOMB_EVERY === 0) return 'bomb';
  if (!bag.length) bag = shuffle([...BAG]);
  return bag.pop();
}

function makePiece(kind) {
  const def = PIECES[kind];
  return { kind, cells: def.cells.map(([x, y]) => [x, y]), size: def.size, x: Math.floor((COLS - def.size) / 2), y: HIDDEN - 1 };
}

function spawn(kind = null) {
  piece = makePiece(kind || queue.shift());
  if (!kind) queue.push(drawKind());
  lockTimer = 0;
  lockResets = 0;
  gravityAcc = 0;
  if (collides(piece.cells, piece.x, piece.y)) {
    piece.y--;
    if (collides(piece.cells, piece.x, piece.y)) return topOut();
  }
}

function topOut() {
  piece = null;
  sfx('lose');
  shell.gameOver({ message: `${lines} lines · level ${level}` });
}

function collides(cells, px, py) {
  for (const [cx, cy] of cells) {
    const x = px + cx;
    const y = py + cy;
    if (x < 0 || x >= COLS || y >= ROWS + HIDDEN) return true;
    if (y >= 0 && board[y][x]) return true;
  }
  return false;
}

function onGround() {
  return collides(piece.cells, piece.x, piece.y + 1);
}

function resetLock() {
  if (onGround() && lockResets < MAX_LOCK_RESETS) {
    lockTimer = 0;
    lockResets++;
  }
}

function tryMove(dx) {
  if (!piece || collides(piece.cells, piece.x + dx, piece.y)) return false;
  piece.x += dx;
  resetLock();
  return true;
}

function rotate(dir) {
  if (!piece || piece.kind === 'O' || piece.kind === 'bomb') return;
  const n = piece.size - 1;
  const rotated = piece.cells.map(([x, y]) => (dir > 0 ? [n - y, x] : [y, n - x]));
  for (const [kx, ky] of KICKS) {
    if (!collides(rotated, piece.x + kx, piece.y + ky)) {
      piece.cells = rotated;
      piece.x += kx;
      piece.y += ky;
      resetLock();
      sfx('blip');
      return;
    }
  }
}

function ghostY() {
  let y = piece.y;
  while (!collides(piece.cells, piece.x, y + 1)) y++;
  return y;
}

function hardDrop() {
  if (!piece) return;
  const target = ghostY();
  shell.addScore((target - piece.y) * 2);
  for (const [cx, cy] of piece.cells) flashes.push({ x: piece.x + cx, y0: piece.y + cy, y1: target + cy, t: 0.15 });
  piece.y = target;
  lock();
}

function doHold() {
  if (!piece || holdUsed) return;
  const current = piece.kind;
  if (hold) spawn(hold);
  else spawn();
  hold = current;
  holdUsed = true;
  sfx('select');
}

function burstCell(x, y, color, n = 6) {
  const px = WELL_X + (x + 0.5) * CELL;
  const py = WELL_Y + (y - HIDDEN + 0.5) * CELL;
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    const s = rand(60, 260);
    particles.push({ x: px, y: py, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.3, 0.7), color });
  }
}

function lock() {
  const color = PIECES[piece.kind].color;
  if (piece.kind === 'bomb') {
    const bx = piece.x;
    const by = piece.y;
    let cleared = 0;
    for (let y = by - 1; y <= by + 1; y++) {
      for (let x = bx - 1; x <= bx + 1; x++) {
        if (y < 0 || y >= ROWS + HIDDEN || x < 0 || x >= COLS) continue;
        if (board[y][x]) {
          burstCell(x, y, board[y][x], 8);
          board[y][x] = null;
          cleared++;
        }
      }
    }
    burstCell(bx, by, '#ffd23f', 24);
    shell.addScore(cleared * BOMB_CELL_POINTS * level);
    noise({ dur: 0.5, vol: 0.4, freq: 1600, to: 80 });
  } else {
    let above = false;
    for (const [cx, cy] of piece.cells) {
      const y = piece.y + cy;
      if (y < HIDDEN) above = true;
      board[y][piece.x + cx] = color;
    }
    sfx('hit');
    // Locking entirely above the visible well ends the game.
    if (above && piece.cells.every(([, cy]) => piece.y + cy < HIDDEN)) return topOut();
  }
  piece = null;
  holdUsed = false;

  const full = [];
  board.forEach((row, y) => row.every(Boolean) && full.push(y));
  if (full.length) {
    clearing = full;
    clearTimer = CLEAR_TIME;
    const n = Math.min(4, full.length);
    shell.addScore(LINE_POINTS[n] * level);
    sfx(n >= 4 ? 'win' : 'coin');
    for (const y of full) for (let x = 0; x < COLS; x++) burstCell(x, y, board[y][x], 2);
  } else {
    spawn();
  }
}

function finishClear() {
  for (const y of clearing) {
    board.splice(y, 1);
    board.unshift(Array(COLS).fill(null));
  }
  lines += clearing.length;
  const newLevel = 1 + Math.floor(lines / LINES_PER_LEVEL);
  if (newLevel > level) {
    level = newLevel;
    sfx('powerup');
  }
  clearing = null;
  updateStats();
  spawn();
}

function addGarbage() {
  if (board[0].some(Boolean)) return topOut();
  const hole = Math.floor(Math.random() * COLS);
  board.shift();
  board.push(Array.from({ length: COLS }, (_, x) => (x === hole ? null : GARBAGE)));
  if (piece && collides(piece.cells, piece.x, piece.y)) piece.y--;
  noise({ dur: 0.2, vol: 0.15, freq: 300 });
}

function handleTouch(dt) {
  const p = shell.input.pointer;
  if (p.pressed) touch = { x0: p.x, y0: p.y, t: 0, col0: piece ? piece.x : 0, moved: false, soft: false };
  if (!touch) return false;
  if (p.down) {
    touch.t += dt;
    const dx = Math.round((p.x - touch.x0) / CELL);
    if (piece && dx !== 0) {
      const target = touch.col0 + dx;
      while (piece.x < target && tryMove(1));
      while (piece.x > target && tryMove(-1));
      touch.moved = true;
    }
    touch.soft = p.y - touch.y0 > CELL * 2 && touch.t > 0.3;
    return touch.soft;
  }
  if (p.released) {
    const dy = p.y - touch.y0;
    if (dy > 60 && touch.t < 0.35) hardDrop();
    else if (dy < -60 && touch.t < 0.35) doHold();
    else if (!touch.moved && Math.abs(dy) < 14 && touch.t < 0.3) rotate(1);
    touch = null;
  }
  return false;
}

function update(dt) {
  const { input } = shell;
  time += dt;

  for (const q of particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += 600 * dt;
    q.life -= dt;
  }
  particles = particles.filter((q) => q.life > 0);
  for (const f of flashes) f.t -= dt;
  flashes = flashes.filter((f) => f.t > 0);

  if (shell.options.mode === 'rising') {
    garbageTimer -= dt;
    if (garbageTimer <= 0) {
      garbageTimer = garbageInterval();
      addGarbage();
      if (shell.state !== 'playing') return;
    }
  }

  if (clearing) {
    clearTimer -= dt;
    if (clearTimer <= 0) finishClear();
    return;
  }
  if (!piece) return;

  // Keyboard
  if (input.pressed('ArrowLeft', 'KeyA')) {
    tryMove(-1);
    dasDir = -1;
    dasTimer = 0;
  }
  if (input.pressed('ArrowRight', 'KeyD')) {
    tryMove(1);
    dasDir = 1;
    dasTimer = 0;
  }
  const held = (input.down('ArrowLeft', 'KeyA') ? -1 : 0) + (input.down('ArrowRight', 'KeyD') ? 1 : 0);
  if (held && held === dasDir) {
    dasTimer += dt;
    while (dasTimer >= DAS + ARR) {
      dasTimer -= ARR;
      if (!tryMove(dasDir)) break;
    }
  } else {
    dasDir = held;
    dasTimer = 0;
  }
  if (input.pressed('ArrowUp', 'KeyW', 'KeyX')) rotate(1);
  if (input.pressed('KeyZ')) rotate(-1);
  if (input.pressed('KeyC', 'ShiftLeft', 'ShiftRight')) doHold();
  if (input.pressed('Space')) return hardDrop();

  const touchSoft = handleTouch(dt);
  if (!piece) return;

  // Gravity
  const soft = input.down('ArrowDown', 'KeyS') || touchSoft;
  const interval = soft ? Math.min(gravityInterval(), gravityInterval() / SOFT_DROP_FACTOR + 0.02) : gravityInterval();
  gravityAcc += dt;
  while (gravityAcc >= interval) {
    gravityAcc -= interval;
    if (!onGround()) {
      piece.y++;
      if (soft) shell.addScore(1);
    } else break;
  }
  if (onGround()) {
    lockTimer += dt;
    if (lockTimer >= LOCK_DELAY) lock();
  } else {
    lockTimer = 0;
  }
}

// ---------- Drawing ----------

function drawCell(ctx, x, y, color, size = CELL, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x + 1, y + 1, size - 2, Math.max(2, size * 0.12));
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 1, y + size - 1 - Math.max(2, size * 0.1), size - 2, Math.max(2, size * 0.1));
  ctx.globalAlpha = 1;
}

function drawBomb(ctx, cx, cy, size) {
  ctx.shadowColor = '#ff8a3d';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#1a1028';
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.05, size * 0.36, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.05, size * 0.36, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = Math.floor(time * 8) % 2 ? '#ffd23f' : '#ff3d9a';
  ctx.beginPath();
  ctx.arc(cx + size * 0.22, cy - size * 0.32, size * 0.1, 0, TAU);
  ctx.fill();
}

function drawMini(ctx, kind, cx, cy, size) {
  const def = PIECES[kind];
  const xs = def.cells.map(([x]) => x);
  const ys = def.cells.map(([, y]) => y);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
  const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
  const ox = cx - w / 2 - Math.min(...xs) * size;
  const oy = cy - h / 2 - Math.min(...ys) * size;
  if (kind === 'bomb') return drawBomb(ctx, cx, cy, size * 1.4);
  for (const [x, y] of def.cells) drawCell(ctx, ox + x * size, oy + y * size, def.color, size);
}

function panelBox(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#0a0514';
  ctx.strokeStyle = '#3a2366';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9d97c9';
  ctx.font = '700 11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 12, y + 20);
}

function render(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d0618');
  bg.addColorStop(1, '#160a26');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Well
  ctx.fillStyle = '#0a0514';
  ctx.fillRect(WELL_X - 4, WELL_Y - 4, COLS * CELL + 8, ROWS * CELL + 8);
  ctx.strokeStyle = '#3a2366';
  ctx.lineWidth = 2;
  ctx.strokeRect(WELL_X - 4, WELL_Y - 4, COLS * CELL + 8, ROWS * CELL + 8);
  ctx.strokeStyle = 'rgba(178,107,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < COLS; x++) {
    ctx.moveTo(WELL_X + x * CELL, WELL_Y);
    ctx.lineTo(WELL_X + x * CELL, WELL_Y + ROWS * CELL);
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.moveTo(WELL_X, WELL_Y + y * CELL);
    ctx.lineTo(WELL_X + COLS * CELL, WELL_Y + y * CELL);
  }
  ctx.stroke();

  const flash = clearing ? clamp(clearTimer / CLEAR_TIME, 0, 1) : 0;
  for (let y = HIDDEN; y < ROWS + HIDDEN; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = board[y][x];
      if (!c) continue;
      const px = WELL_X + x * CELL;
      const py = WELL_Y + (y - HIDDEN) * CELL;
      if (clearing && clearing.includes(y)) {
        drawCell(ctx, px, py, '#ffffff', CELL, flash);
      } else drawCell(ctx, px, py, c);
    }
  }

  for (const f of flashes) {
    ctx.fillStyle = `rgba(255,255,255,${f.t * 1.2})`;
    const top = Math.max(f.y0, HIDDEN);
    if (f.y1 >= HIDDEN) ctx.fillRect(WELL_X + f.x * CELL + 6, WELL_Y + (top - HIDDEN) * CELL, CELL - 12, (f.y1 - top) * CELL);
  }

  if (piece) {
    const def = PIECES[piece.kind];
    const gy = ghostY();
    if (piece.kind !== 'bomb') {
      ctx.strokeStyle = `${def.color}88`;
      ctx.lineWidth = 2;
      for (const [cx, cy] of piece.cells) {
        const y = gy + cy - HIDDEN;
        if (y >= 0) ctx.strokeRect(WELL_X + (piece.x + cx) * CELL + 3, WELL_Y + y * CELL + 3, CELL - 6, CELL - 6);
      }
    } else if (gy - HIDDEN >= 0) {
      // Show the bomb's blast area where it will land.
      ctx.strokeStyle = 'rgba(255,138,61,0.45)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(WELL_X + (piece.x - 1) * CELL, WELL_Y + (gy - HIDDEN - 1) * CELL, CELL * 3, CELL * 3);
      ctx.setLineDash([]);
    }
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 10;
    for (const [cx, cy] of piece.cells) {
      const y = piece.y + cy - HIDDEN;
      if (y < 0) continue;
      const px = WELL_X + (piece.x + cx) * CELL;
      const py = WELL_Y + y * CELL;
      if (piece.kind === 'bomb') drawBomb(ctx, px + CELL / 2, py + CELL / 2, CELL);
      else drawCell(ctx, px, py, def.color, CELL, 1 - (lockTimer / LOCK_DELAY) * 0.35);
    }
    ctx.shadowBlur = 0;
  }

  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life * 2, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // Side panel
  const pw = W - PANEL_X - 20;
  panelBox(ctx, PANEL_X, WELL_Y - 4, pw, 250, 'NEXT');
  queue.slice(0, 3).forEach((k, i) => drawMini(ctx, k, PANEL_X + pw / 2, WELL_Y + 62 + i * 72, i === 0 ? 22 : 16));
  panelBox(ctx, PANEL_X, WELL_Y + 262, pw, 110, 'HOLD');
  if (hold) {
    ctx.globalAlpha = holdUsed ? 0.4 : 1;
    drawMini(ctx, hold, PANEL_X + pw / 2, WELL_Y + 330, 20);
    ctx.globalAlpha = 1;
  }

  if (shell.options.mode === 'rising') {
    panelBox(ctx, PANEL_X, WELL_Y + 384, pw, 70, 'RISING IN');
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(PANEL_X + 12, WELL_Y + 430, (pw - 24) * clamp(garbageTimer / garbageInterval(), 0, 1), 8);
  }
}

shell.debug = () => ({ board, piece, lines, level, queue, hold, setRow: (y, filledExcept) => {
  board[y] = Array.from({ length: COLS }, (_, x) => (x === filledExcept ? null : '#7aa7ff'));
} });
shell.boot();
