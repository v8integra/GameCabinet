// Sapper — minesweeper-style logic puzzle. Three sizes, safe first click, chording.

import { createShell } from '../../shared/shell.js';
import { sfx } from '../../shared/audio.js';
import { TAU, rand, clamp } from '../../shared/util.js';

const W = 800;
const H = 560;
const MAX_CELL = 52;
const LONG_PRESS = 0.4; // seconds to flag on touch
const END_PAUSE_LOSE = 1.4;
const END_PAUSE_WIN = 1;

const DIFFICULTIES = {
  easy: { label: 'Easy', cols: 9, rows: 9, mines: 10, perCell: 1, bonus: 1000, par: 120 },
  medium: { label: 'Medium', cols: 16, rows: 16, mines: 40, perCell: 2, bonus: 4000, par: 360 },
  hard: { label: 'Hard', cols: 30, rows: 16, mines: 99, perCell: 3, bonus: 10000, par: 900 },
};

const NUM_COLORS = ['', '#7aa7ff', '#4dff88', '#ff8a3d', '#b26bff', '#ff3d9a', '#2de2e6', '#ffd23f', '#ece9ff'];

let diff, cols, rows, cell, ox, oy, grid, phase, minesPlaced, opened, flags, timer, endTimer, press, hover, boomCell, particles;

const shell = createShell({
  title: 'Sapper',
  tagline: 'Read the numbers. Flag the mines. Clear the field.',
  width: W,
  height: H,
  accent: '#7aa7ff',
  help: [
    ['Left click', 'Reveal a cell'],
    ['Right click', 'Place / remove a flag'],
    ['Click a number', 'Reveal its neighbors once all its mines are flagged'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Tap to reveal · long-press to flag',
  options: [{ key: 'difficulty', label: 'Difficulty', choices: Object.entries(DIFFICULTIES).map(([k, d]) => [k, d.label]) }],
  init,
  update,
  render,
});

function init() {
  diff = DIFFICULTIES[shell.options.difficulty];
  ({ cols, rows } = diff);
  cell = Math.min(MAX_CELL, Math.floor(Math.min((W - 24) / cols, (H - 24) / rows)));
  ox = Math.floor((W - cols * cell) / 2);
  oy = Math.floor((H - rows * cell) / 2);
  grid = Array.from({ length: cols * rows }, (_, i) => ({ i, x: i % cols, y: Math.floor(i / cols), mine: false, n: 0, open: false, flag: false, wrong: false }));
  phase = 'ready';
  minesPlaced = false;
  opened = 0;
  flags = 0;
  timer = 0;
  endTimer = 0;
  press = null;
  hover = null;
  boomCell = null;
  particles = [];
  updateStats();
}

function updateStats() {
  shell.setStats({ Mines: diff.mines - flags, Time: formatTime(timer) });
}

function formatTime(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const at = (x, y) => (x >= 0 && y >= 0 && x < cols && y < rows ? grid[y * cols + x] : null);

function neighbors(c) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) {
        const n = at(c.x + dx, c.y + dy);
        if (n) out.push(n);
      }
    }
  }
  return out;
}

function cellAtPoint(px, py) {
  const x = Math.floor((px - ox) / cell);
  const y = Math.floor((py - oy) / cell);
  return at(x, y);
}

// Mines are placed after the first click so it (and its neighbors) are always safe.
function placeMines(safe) {
  const banned = new Set([safe.i, ...neighbors(safe).map((n) => n.i)]);
  const candidates = grid.filter((c) => !banned.has(c.i));
  for (let k = 0; k < diff.mines; k++) {
    const j = k + Math.floor(Math.random() * (candidates.length - k));
    [candidates[k], candidates[j]] = [candidates[j], candidates[k]];
    candidates[k].mine = true;
  }
  for (const c of grid) c.n = neighbors(c).filter((n) => n.mine).length;
  minesPlaced = true;
}

function reveal(start) {
  if (start.open || start.flag) return;
  if (!minesPlaced) {
    placeMines(start);
    phase = 'playing';
  }
  if (start.mine) return lose(start);

  const stack = [start];
  let count = 0;
  while (stack.length) {
    const c = stack.pop();
    if (c.open || c.flag) continue;
    c.open = true;
    count++;
    if (c.n === 0) for (const n of neighbors(c)) if (!n.open && !n.flag && !n.mine) stack.push(n);
  }
  opened += count;
  shell.addScore(count * diff.perCell);
  sfx(count > 1 ? 'select' : 'blip');
  if (opened === cols * rows - diff.mines) win();
}

function chord(c) {
  if (!c.open || c.n === 0) return;
  const around = neighbors(c);
  if (around.filter((n) => n.flag).length !== c.n) {
    sfx('hit');
    return;
  }
  for (const n of around) {
    if (phase !== 'playing') return;
    reveal(n);
  }
}

function toggleFlag(c) {
  if (c.open || phase === 'won' || phase === 'lost') return;
  c.flag = !c.flag;
  flags += c.flag ? 1 : -1;
  sfx(c.flag ? 'bounce' : 'blip');
  updateStats();
}

function lose(c) {
  phase = 'lost';
  boomCell = c;
  for (const g of grid) {
    if (g.mine && !g.flag) g.open = true;
    if (g.flag && !g.mine) g.wrong = true;
  }
  const cx = ox + (c.x + 0.5) * cell;
  const cy = oy + (c.y + 0.5) * cell;
  for (let k = 0; k < 40; k++) {
    const a = rand(TAU);
    const s = rand(60, 320);
    particles.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 1), color: k % 3 ? '#ff8a3d' : '#ffd23f' });
  }
  sfx('explode');
  sfx('lose');
  endTimer = END_PAUSE_LOSE;
}

function win() {
  phase = 'won';
  for (const g of grid) {
    if (g.mine && !g.flag) {
      g.flag = true;
      flags++;
    }
  }
  const bonus = Math.round(diff.bonus * clamp(1.5 - timer / diff.par, 0.25, 1));
  shell.addScore(bonus);
  updateStats();
  sfx('win');
  endTimer = END_PAUSE_WIN;
}

function update(dt) {
  const p = shell.input.pointer;

  for (const q of particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += 240 * dt;
    q.life -= dt;
  }
  particles = particles.filter((q) => q.life > 0);

  if (phase === 'won' || phase === 'lost') {
    endTimer -= dt;
    if (endTimer <= 0) {
      if (phase === 'won') {
        shell.gameOver({ title: 'Field Cleared!', win: true, message: `${diff.label} cleared in ${formatTime(timer)}.` });
      } else {
        shell.gameOver({ title: 'Boom!', message: `${opened} of ${cols * rows - diff.mines} safe cells cleared.` });
      }
    }
    return;
  }

  if (phase === 'playing') {
    const before = Math.floor(timer);
    timer += dt;
    if (Math.floor(timer) !== before) updateStats();
  }

  hover = p.type === 'mouse' ? cellAtPoint(p.x, p.y) : null;

  if (p.pressed) press = { cell: cellAtPoint(p.x, p.y), t: 0, button: p.button, handled: false };
  if (press && p.down) {
    press.t += dt;
    if (p.type !== 'mouse' && !press.handled && press.t >= LONG_PRESS && press.cell) {
      press.handled = true;
      toggleFlag(press.cell);
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(15); // haptic tick for long-press
    }
  }
  if (press && p.released) {
    const c = cellAtPoint(p.x, p.y);
    if (!press.handled && c && c === press.cell) {
      if (press.button === 2) toggleFlag(c);
      else if (press.button === 1 || c.open) chord(c);
      else reveal(c);
    }
    press = null;
  }
}

// ---------- Drawing ----------

function drawFlag(ctx, x, y, s) {
  ctx.fillStyle = '#d8dcf0';
  ctx.fillRect(x + s * 0.36, y + s * 0.2, Math.max(2, s * 0.06), s * 0.6);
  ctx.fillStyle = '#ff3d9a';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.4, y + s * 0.2);
  ctx.lineTo(x + s * 0.74, y + s * 0.34);
  ctx.lineTo(x + s * 0.4, y + s * 0.48);
  ctx.fill();
  ctx.fillStyle = '#d8dcf0';
  ctx.fillRect(x + s * 0.26, y + s * 0.76, s * 0.3, Math.max(2, s * 0.06));
}

function drawMine(ctx, cx, cy, s) {
  ctx.strokeStyle = '#0a0d18';
  ctx.lineWidth = Math.max(2, s * 0.07);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * s * 0.32, cy - Math.sin(a) * s * 0.32);
    ctx.lineTo(cx + Math.cos(a) * s * 0.32, cy + Math.sin(a) * s * 0.32);
    ctx.stroke();
  }
  ctx.fillStyle = '#0a0d18';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.22, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(cx - s * 0.07, cy - s * 0.07, s * 0.05, 0, TAU);
  ctx.fill();
}

function render(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c1222');
  bg.addColorStop(1, '#131c33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#0a0f1d';
  ctx.beginPath();
  ctx.roundRect(ox - 6, oy - 6, cols * cell + 12, rows * cell + 12, 10);
  ctx.fill();

  const pad = cell >= 30 ? 1.5 : 1;
  const pressing = press && !press.handled && shell.input.pointer.down ? press.cell : null;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(cell * 0.56)}px system-ui, sans-serif`;

  for (const c of grid) {
    const x = ox + c.x * cell;
    const y = oy + c.y * cell;
    const s = cell;
    if (c.open) {
      ctx.fillStyle = c === boomCell ? '#8a1a2e' : c.mine ? '#3a1622' : '#18213a';
      ctx.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      if (c.mine) {
        if (c === boomCell) {
          ctx.shadowColor = '#ff4d4d';
          ctx.shadowBlur = 16;
        }
        drawMine(ctx, x + s / 2, y + s / 2, s);
        ctx.shadowBlur = 0;
      } else if (c.n) {
        ctx.fillStyle = NUM_COLORS[c.n];
        ctx.fillText(c.n, x + s / 2, y + s / 2 + 1);
      }
    } else {
      const lit = c === hover && phase !== 'won' && phase !== 'lost';
      const down = c === pressing && !c.flag;
      ctx.fillStyle = down ? '#24305a' : lit ? '#3a4c85' : '#2c3a63';
      ctx.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      if (!down) {
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fillRect(x + pad, y + pad, s - pad * 2, Math.max(2, s * 0.1));
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x + pad, y + s - pad - Math.max(2, s * 0.08), s - pad * 2, Math.max(2, s * 0.08));
      }
      if (c.flag) {
        drawFlag(ctx, x, y, s);
        if (c.wrong) {
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = Math.max(2, s * 0.08);
          ctx.beginPath();
          ctx.moveTo(x + s * 0.22, y + s * 0.22);
          ctx.lineTo(x + s * 0.78, y + s * 0.78);
          ctx.moveTo(x + s * 0.78, y + s * 0.22);
          ctx.lineTo(x + s * 0.22, y + s * 0.78);
          ctx.stroke();
        }
      }
    }
  }

  // Long-press progress ring on touch.
  if (press && !press.handled && shell.input.pointer.down && shell.input.pointer.type !== 'mouse' && press.cell && !press.cell.open) {
    const t = clamp(press.t / LONG_PRESS, 0, 1);
    if (t > 0.15) {
      ctx.strokeStyle = '#ff3d9a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ox + (press.cell.x + 0.5) * cell, oy + (press.cell.y + 0.5) * cell, cell * 0.62, -Math.PI / 2, -Math.PI / 2 + TAU * t);
      ctx.stroke();
    }
  }

  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life * 1.5, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  if (phase === 'ready' && shell.state === 'playing') {
    ctx.fillStyle = 'rgba(236,233,255,0.75)';
    ctx.font = '600 14px system-ui, sans-serif';
    const below = oy + rows * cell;
    ctx.fillText('Your first click is always safe', W / 2, below + (H - below) / 2);
  }
}

shell.debug = () => ({ grid, phase, opened, flags, cols, rows, cell, ox, oy, mines: diff.mines });
shell.boot();
