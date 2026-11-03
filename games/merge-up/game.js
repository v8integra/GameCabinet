// Merge Up — slide-and-merge number puzzle (4×4 or 5×5), with a few undos.

import { createShell } from '../../shared/shell.js';
import { sfx } from '../../shared/audio.js';
import { clamp, lerp } from '../../shared/util.js';

const W = 500;
const H = 580;
const BOARD = 460;
const BOARD_X = (W - BOARD) / 2;
const BOARD_Y = 20;
const SLIDE_TIME = 0.1;
const POP_TIME = 0.14;
const UNDOS_PER_GAME = 3;
const GOAL = 2048;
const UNDO_BTN = { x: BOARD_X, y: 500, w: 150, h: 54 };

const TILE_COLORS = {
  2: ['#3d3354', '#ece9ff'],
  4: ['#4a3c6b', '#ece9ff'],
  8: ['#ff8a3d', '#fff'],
  16: ['#ff6a3d', '#fff'],
  32: ['#ff4d4d', '#fff'],
  64: ['#ff3d9a', '#fff'],
  128: ['#ffd23f', '#2a1e08'],
  256: ['#ffe066', '#2a1e08'],
  512: ['#fff2a8', '#2a1e08'],
  1024: ['#4dff88', '#06140d'],
  2048: ['#2de2e6', '#04181a'],
};
const BIG_TILE = ['#b26bff', '#fff'];

const DIR_KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
};

let N, cells, ghosts, nextId, since, undo, undosLeft, reachedGoal, toast, pendingOver, best;

const shell = createShell({
  title: 'Merge Up',
  tagline: `Slide tiles together. Reach ${GOAL} — then keep going.`,
  width: W,
  height: H,
  accent: '#ffd23f',
  help: [
    ['Arrows / WASD', 'Slide all tiles'],
    ['U / Z', `Undo last move (${UNDOS_PER_GAME} per game)`],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Swipe to slide · tap Undo',
  options: [{ key: 'size', label: 'Board', choices: [[4, '4 × 4'], [5, '5 × 5']] }],
  init,
  update,
  render,
});

function init() {
  N = shell.options.size;
  cells = Array(N * N).fill(null);
  ghosts = [];
  nextId = 1;
  since = 1;
  undo = null;
  undosLeft = UNDOS_PER_GAME;
  reachedGoal = false;
  toast = null;
  pendingOver = false;
  best = 0;
  spawn();
  spawn();
  for (const t of cells) if (t) t.bornAt = -1; // no pop on the first frame
  updateStats();
}

function updateStats() {
  best = Math.max(0, ...cells.map((t) => (t ? t.v : 0)));
  shell.setStats({ 'Best tile': best, Undos: undosLeft });
}

function spawn() {
  const empty = [];
  cells.forEach((t, i) => !t && empty.push(i));
  if (!empty.length) return;
  const i = empty[Math.floor(Math.random() * empty.length)];
  const r = Math.floor(i / N);
  const c = i % N;
  cells[i] = { id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r, c, fr: r, fc: c, bornAt: SLIDE_TIME };
}

function lineCells(dir, line) {
  const out = [];
  for (let k = 0; k < N; k++) {
    if (dir === 'left') out.push([line, k]);
    else if (dir === 'right') out.push([line, N - 1 - k]);
    else if (dir === 'up') out.push([k, line]);
    else out.push([N - 1 - k, line]);
  }
  return out;
}

function canMove() {
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const t = cells[r * N + c];
      if (!t) return true;
      if (c + 1 < N && cells[r * N + c + 1]?.v === t.v) return true;
      if (r + 1 < N && cells[(r + 1) * N + c]?.v === t.v) return true;
    }
  }
  return false;
}

function move(dir) {
  const snapshot = { values: cells.map((t) => (t ? t.v : 0)), score: shell.score };
  const next = Array(N * N).fill(null);
  const newGhosts = [];
  let moved = false;
  let gained = 0;
  let biggestMerge = 0;

  for (let line = 0; line < N; line++) {
    const slots = lineCells(dir, line);
    const placed = []; // { tile, merged }
    for (const [r, c] of slots) {
      const t = cells[r * N + c];
      if (!t) continue;
      const last = placed[placed.length - 1];
      if (last && !last.merged && last.tile.v === t.v) {
        // Both tiles slide into the slot, then a doubled tile pops in their place.
        const [tr, tc] = slots[placed.length - 1];
        Object.assign(t, { fr: r, fc: c, r: tr, c: tc });
        newGhosts.push(last.tile, t);
        const v = t.v * 2;
        last.tile = { id: nextId++, v, r: tr, c: tc, fr: tr, fc: tc, bornAt: SLIDE_TIME, merged: true };
        last.merged = true;
        gained += v;
        biggestMerge = Math.max(biggestMerge, v);
        moved = true;
      } else {
        const [tr, tc] = slots[placed.length];
        if (tr !== r || tc !== c) moved = true;
        Object.assign(t, { fr: r, fc: c, r: tr, c: tc, bornAt: -1, merged: false });
        placed.push({ tile: t, merged: false });
      }
    }
    placed.forEach((p, k) => {
      const [r, c] = slots[k];
      next[r * N + c] = p.tile;
    });
  }

  if (!moved) return;
  undo = snapshot;
  cells = next;
  ghosts = newGhosts;
  since = 0;
  shell.addScore(gained);
  spawn();
  updateStats();

  if (biggestMerge >= 128) sfx('coin');
  else if (gained) sfx('select');
  else sfx('blip');

  if (!reachedGoal && best >= GOAL) {
    reachedGoal = true;
    toast = { text: `${GOAL}! Keep going`, t: 2.5 };
    sfx('win');
  }
  if (!canMove()) pendingOver = true;
}

function doUndo() {
  if (!undo || undosLeft <= 0) {
    sfx('hit');
    return;
  }
  undosLeft--;
  cells = undo.values.map((v, i) => {
    if (!v) return null;
    const r = Math.floor(i / N);
    const c = i % N;
    return { id: nextId++, v, r, c, fr: r, fc: c, bornAt: -1 };
  });
  shell.setScore(undo.score);
  undo = null;
  ghosts = [];
  since = 1;
  pendingOver = false;
  updateStats();
  sfx('blip');
}

function update(dt) {
  const { input } = shell;
  since += dt;
  if (toast) {
    toast.t -= dt;
    if (toast.t <= 0) toast = null;
  }

  if (pendingOver) {
    if (since > SLIDE_TIME + POP_TIME + 0.5) {
      sfx('lose');
      shell.gameOver({ title: 'No Moves Left', message: `Best tile: ${best}` });
    }
    return;
  }

  let dir = null;
  for (const [code, d] of Object.entries(DIR_KEYS)) if (input.pressed(code)) dir = d;
  dir = input.takeSwipe() || dir;
  if (dir) move(dir);

  const p = input.pointer;
  const onUndo = p.x >= UNDO_BTN.x && p.x <= UNDO_BTN.x + UNDO_BTN.w && p.y >= UNDO_BTN.y && p.y <= UNDO_BTN.y + UNDO_BTN.h;
  if (input.pressed('KeyU', 'KeyZ') || (p.released && onUndo)) doUndo();
}

// ---------- Drawing ----------

const easeOut = (t) => 1 - (1 - t) ** 3;

function cellRect(r, c) {
  const gap = N === 4 ? 12 : 10;
  const size = (BOARD - gap * (N + 1)) / N;
  return { x: BOARD_X + gap + c * (size + gap), y: BOARD_Y + gap + r * (size + gap), size };
}

function drawTile(ctx, t, x, y, size, scale = 1) {
  const [bg, fg] = TILE_COLORS[t.v] || BIG_TILE;
  const s = size * scale;
  const ox = x + (size - s) / 2;
  const oy = y + (size - s) / 2;
  if (t.v >= 128) {
    ctx.shadowColor = bg;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(ox, oy, s, s, 10 * scale);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(ox + 8, oy + 5, s - 16, 3 * scale);
  const digits = String(t.v).length;
  const font = size * (digits <= 2 ? 0.42 : digits === 3 ? 0.36 : digits === 4 ? 0.29 : 0.24) * scale;
  ctx.fillStyle = fg;
  ctx.font = `800 ${font}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t.v, ox + s / 2, oy + s / 2 + 2);
}

function render(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1406');
  bg.addColorStop(1, '#241a08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#3a2e12';
  ctx.beginPath();
  ctx.roundRect(BOARD_X, BOARD_Y, BOARD, BOARD, 14);
  ctx.fill();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const { x, y, size } = cellRect(r, c);
      ctx.fillStyle = '#2c230e';
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 10);
      ctx.fill();
    }
  }

  const slide = easeOut(clamp(since / SLIDE_TIME, 0, 1));
  if (since < SLIDE_TIME) {
    for (const g of ghosts) {
      const a = cellRect(g.fr, g.fc);
      const b = cellRect(g.r, g.c);
      drawTile(ctx, g, lerp(a.x, b.x, slide), lerp(a.y, b.y, slide), a.size);
    }
  }
  for (const t of cells) {
    if (!t) continue;
    const a = cellRect(t.fr, t.fc);
    const b = cellRect(t.r, t.c);
    if (t.bornAt >= 0) {
      const age = since - t.bornAt;
      if (age < 0) continue;
      const p = clamp(age / POP_TIME, 0, 1);
      // New tiles grow in; merged tiles overshoot a little.
      const scale = t.merged ? 1 + Math.sin(p * Math.PI) * 0.15 : easeOut(p);
      drawTile(ctx, t, b.x, b.y, b.size, scale);
    } else {
      drawTile(ctx, t, lerp(a.x, b.x, slide), lerp(a.y, b.y, slide), a.size);
    }
  }

  // Undo button.
  const usable = undo && undosLeft > 0 && shell.state === 'playing';
  ctx.fillStyle = usable ? '#3a2e12' : '#2a210c';
  ctx.strokeStyle = usable ? '#ffd23f' : '#4a3c1c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(UNDO_BTN.x, UNDO_BTN.y, UNDO_BTN.w, UNDO_BTN.h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = usable ? '#ffd23f' : '#6a5a30';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`↶ Undo (${undosLeft})`, UNDO_BTN.x + UNDO_BTN.w / 2, UNDO_BTN.y + UNDO_BTN.h / 2 + 1);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#9d8a5a';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('BEST TILE', BOARD_X + BOARD, UNDO_BTN.y + 14);
  ctx.fillStyle = '#ffd23f';
  ctx.font = '800 26px ui-monospace, Consolas, monospace';
  ctx.fillText(best, BOARD_X + BOARD, UNDO_BTN.y + 40);

  if (toast) {
    ctx.globalAlpha = clamp(toast.t * 2, 0, 1);
    ctx.fillStyle = 'rgba(10,8,2,0.75)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 150, BOARD_Y + BOARD / 2 - 34, 300, 68, 14);
    ctx.fill();
    ctx.fillStyle = '#2de2e6';
    ctx.shadowColor = '#2de2e6';
    ctx.shadowBlur = 16;
    ctx.font = '900 28px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(toast.text, W / 2, BOARD_Y + BOARD / 2 + 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

shell.debug = () => ({ N, cells, undosLeft, best, pendingOver, setValues: (vals) => {
  cells = vals.map((v, i) => (v ? { id: nextId++, v, r: Math.floor(i / N), c: i % N, fr: Math.floor(i / N), fc: i % N, bornAt: -1 } : null));
  updateStats();
} });
shell.boot();
