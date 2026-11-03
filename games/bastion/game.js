// Bastion — tower defense. Four towers with two upgrades each, fifteen waves, one road.

import { createShell } from '../../shared/shell.js';
import { sfx, tone, noise } from '../../shared/audio.js';
import { TAU, rand, clamp, dist } from '../../shared/util.js';

const W = 800;
const H = 600;
const CELL = 40;
const COLS = 20;
const ROWS = 12;
const MAP_H = ROWS * CELL;

const START_GOLD = 150;
const START_LIVES = 20;
const SELL_RATE = 0.7;
const AUTO_START = 20; // seconds between waves before the next starts on its own
const WAVE_BONUS = (n) => 25 + n * 5;

// Road waypoints in cell coordinates (enters left, exits right).
const ROAD = [[-1, 2], [4, 2], [4, 8], [10, 8], [10, 3], [15, 3], [15, 9], [20, 9]];

const TOWERS = {
  bolt: { name: 'Bolt', color: '#2de2e6', cost: 50, dmg: [8, 14, 22], rate: [0.5, 0.4, 0.3], range: [100, 115, 130], desc: 'Fast single shots' },
  cannon: { name: 'Cannon', color: '#ff8a3d', cost: 80, dmg: [20, 35, 55], rate: [1.4, 1.25, 1.1], range: [95, 105, 115], splash: [40, 48, 56], desc: 'Splash damage' },
  frost: { name: 'Frost', color: '#9fd8ff', cost: 70, dmg: [3, 5, 8], rate: [0.8, 0.7, 0.6], range: [90, 100, 110], slow: [0.4, 0.5, 0.6], desc: 'Slows enemies' },
  spire: { name: 'Spire', color: '#ff3d9a', cost: 120, dmg: [45, 80, 130], rate: [1.6, 1.4, 1.2], range: [170, 190, 210], desc: 'Long-range sniper' },
};
const TOWER_KEYS = Object.keys(TOWERS);
const UPGRADE_COST = (t, tier) => Math.round(TOWERS[t].cost * (tier === 1 ? 0.8 : 1.4));
const SLOW_TIME = 1.5;

const ENEMIES = {
  swarm: { hp: 18, speed: 85, bounty: 3, size: 7, color: '#b8f56a', leak: 1, gap: 0.35 },
  runner: { hp: 30, speed: 70, bounty: 6, size: 9, color: '#ffd23f', leak: 1, gap: 0.6 },
  grunt: { hp: 70, speed: 45, bounty: 8, size: 11, color: '#ff5a5a', leak: 1, gap: 0.8 },
  brute: { hp: 220, speed: 30, bounty: 18, size: 15, color: '#b26bff', leak: 2, gap: 1.4 },
  boss: { hp: 1500, speed: 25, bounty: 150, size: 22, color: '#ff3d9a', leak: 10, gap: 3 },
};

// Each wave: [type, count] groups, spawned in order.
const WAVES = [
  [['grunt', 8]],
  [['grunt', 12]],
  [['runner', 10], ['grunt', 4]],
  [['grunt', 14], ['brute', 2]],
  [['swarm', 20], ['grunt', 6]],
  [['runner', 10], ['brute', 4]],
  [['grunt', 16], ['runner', 8]],
  [['swarm', 30], ['brute', 4]],
  [['brute', 8], ['grunt', 10]],
  [['grunt', 10], ['boss', 1]],
  [['runner', 20], ['brute', 6]],
  [['swarm', 40], ['runner', 10]],
  [['brute', 12], ['grunt', 16]],
  [['runner', 20], ['swarm', 20], ['brute', 6]],
  [['brute', 10], ['boss', 2]],
];

// Bottom panel layout
const PANEL_Y = MAP_H;
const BUILD_BTN = (i) => ({ x: 12 + i * 94, y: PANEL_Y + 12, w: 86, h: 96 });
const UPGRADE_BTN = { x: 396, y: PANEL_Y + 66, w: 118, h: 42 };
const SELL_BTN = { x: 522, y: PANEL_Y + 66, w: 108, h: 42 };
const WAVE_BTN = { x: 652, y: PANEL_Y + 12, w: 136, h: 50 };
const SPEED_BTN = { x: 652, y: PANEL_Y + 68, w: 136, h: 40 };

const inBox = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

let path, pathLen, roadCells, towers, enemies, shots, beams, particles, floaters;
let gold, lives, wave, waveRunning, spawnQueue, spawnTimer, betweenTimer, building, selected, hover, speed, time, won;

const shell = createShell({
  title: 'Bastion',
  tagline: 'Hold the road for fifteen waves.',
  width: W,
  height: H,
  accent: '#ff8a3d',
  help: [
    ['1 – 4', 'Choose a tower to build'],
    ['Click grass', 'Build the chosen tower'],
    ['Click a tower', 'Select it to upgrade or sell'],
    ['Right click', 'Cancel building'],
    ['Space', 'Send the next wave now'],
    ['F', 'Toggle fast-forward'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Tap a tower button, then tap the grass to build',
  init,
  update,
  render,
});

function init() {
  // Path in pixels through cell centers.
  path = ROAD.map(([c, r]) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 }));
  pathLen = [0];
  for (let i = 1; i < path.length; i++) pathLen.push(pathLen[i - 1] + dist(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y));
  roadCells = new Set();
  for (let i = 1; i < ROAD.length; i++) {
    const [c0, r0] = ROAD[i - 1];
    const [c1, r1] = ROAD[i];
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) roadCells.add(`${c},${r}`);
  }
  towers = [];
  enemies = [];
  shots = [];
  beams = [];
  particles = [];
  floaters = [];
  gold = START_GOLD;
  lives = START_LIVES;
  wave = 0;
  waveRunning = false;
  spawnQueue = [];
  spawnTimer = 0;
  betweenTimer = AUTO_START;
  building = null;
  selected = null;
  hover = null;
  speed = 1;
  time = 0;
  won = false;
  updateStats();
}

function updateStats() {
  shell.setStats({ Wave: `${wave}/${WAVES.length}`, Lives: lives, Gold: gold });
}

function posAt(d) {
  let i = 1;
  while (i < pathLen.length - 1 && pathLen[i] < d) i++;
  const a = path[i - 1];
  const b = path[i];
  const t = clamp((d - pathLen[i - 1]) / (pathLen[i] - pathLen[i - 1]), 0, 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function startWave() {
  if (waveRunning || wave >= WAVES.length) return;
  wave++;
  waveRunning = true;
  spawnQueue = [];
  for (const [type, count] of WAVES[wave - 1]) for (let i = 0; i < count; i++) spawnQueue.push(type);
  spawnTimer = 0;
  updateStats();
  tone({ freq: 330, to: 660, dur: 0.3, type: 'sawtooth', vol: 0.08 });
}

function spawnEnemy(type) {
  const def = ENEMIES[type];
  const hp = Math.round(def.hp * (1 + 0.12 * (wave - 1)));
  enemies.push({ type, hp, maxHp: hp, d: 0, slow: 0, slowAmt: 0, ...posAt(0), wobble: rand(TAU) });
}

function canBuild(c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  if (roadCells.has(`${c},${r}`)) return false;
  return !towers.some((t) => t.c === c && t.r === r);
}

function build(type, c, r) {
  const def = TOWERS[type];
  if (gold < def.cost || !canBuild(c, r)) {
    sfx('hit');
    return;
  }
  gold -= def.cost;
  const t = { type, c, r, x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, tier: 0, cooldown: 0, angle: -Math.PI / 2, invested: def.cost };
  towers.push(t);
  selected = t;
  updateStats();
  tone({ freq: 440, to: 880, dur: 0.12, type: 'square', vol: 0.08 });
}

function upgrade(t) {
  if (t.tier >= 2) return;
  const cost = UPGRADE_COST(t.type, t.tier + 1);
  if (gold < cost) {
    sfx('hit');
    return;
  }
  gold -= cost;
  t.invested += cost;
  t.tier++;
  updateStats();
  sfx('powerup');
}

function sell(t) {
  gold += Math.floor(t.invested * SELL_RATE);
  towers.splice(towers.indexOf(t), 1);
  selected = null;
  updateStats();
  sfx('coin');
}

function damage(e, amount) {
  if (e.hp <= 0) return;
  e.hp -= amount;
  if (e.hp <= 0) {
    const def = ENEMIES[e.type];
    gold += def.bounty;
    shell.addScore(def.bounty * 10);
    floaters.push({ x: e.x, y: e.y - 10, text: `+${def.bounty}`, t: 0.8 });
    for (let i = 0; i < 8 + def.size; i++) {
      const a = rand(TAU);
      particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * rand(40, 140), vy: Math.sin(a) * rand(40, 140), life: rand(0.3, 0.6), color: def.color });
    }
    if (e.type === 'boss') sfx('explode');
    else tone({ freq: 500, to: 200, dur: 0.08, type: 'square', vol: 0.05 });
    updateStats();
  }
}

function fire(t) {
  const def = TOWERS[t.type];
  const range = def.range[t.tier];
  // Target the enemy furthest along the road.
  let target = null;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    if (dist(t.x, t.y, e.x, e.y) <= range && (!target || e.d > target.d)) target = e;
  }
  if (!target) return false;
  t.angle = Math.atan2(target.y - t.y, target.x - t.x);
  const dmg = def.dmg[t.tier];
  if (t.type === 'spire') {
    damage(target, dmg);
    beams.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, t: 0.12 });
    tone({ freq: 1400, to: 500, dur: 0.12, type: 'sawtooth', vol: 0.05 });
  } else {
    shots.push({ type: t.type, tier: t.tier, x: t.x + Math.cos(t.angle) * 14, y: t.y + Math.sin(t.angle) * 14, target, tx: target.x, ty: target.y, dmg });
    if (t.type === 'cannon') noise({ dur: 0.15, vol: 0.1, freq: 600 });
    else tone({ freq: t.type === 'frost' ? 1200 : 900, dur: 0.04, type: 'triangle', vol: 0.04 });
  }
  return true;
}

function handleInput() {
  const { input } = shell;
  const p = input.pointer;
  hover = p.y < MAP_H ? { c: Math.floor(p.x / CELL), r: Math.floor(p.y / CELL) } : null;

  TOWER_KEYS.forEach((k, i) => {
    if (input.pressed(`Digit${i + 1}`)) building = building === k ? null : k;
  });
  if (input.pressed('Space')) startWave();
  if (input.pressed('KeyF')) speed = speed === 1 ? 2 : 1;
  if (input.pressed('KeyU') && selected) upgrade(selected);

  if (p.pressed && p.button === 2) {
    building = null;
    selected = null;
    return;
  }
  if (!p.released || p.button === 2) return;

  if (p.y >= MAP_H) {
    TOWER_KEYS.forEach((k, i) => {
      if (inBox(p, BUILD_BTN(i))) {
        building = building === k ? null : k;
        selected = null;
        sfx('blip');
      }
    });
    if (selected && inBox(p, UPGRADE_BTN)) upgrade(selected);
    if (selected && inBox(p, SELL_BTN)) sell(selected);
    if (inBox(p, WAVE_BTN)) startWave();
    if (inBox(p, SPEED_BTN)) {
      speed = speed === 1 ? 2 : 1;
      sfx('blip');
    }
    return;
  }

  const { c, r } = hover;
  const clicked = towers.find((t) => t.c === c && t.r === r);
  if (clicked) {
    selected = clicked;
    building = null;
    sfx('blip');
  } else if (building) {
    build(building, c, r);
  } else {
    selected = null;
  }
}

function simulate(dt) {
  time += dt;

  if (waveRunning) {
    spawnTimer -= dt;
    if (spawnQueue.length && spawnTimer <= 0) {
      const type = spawnQueue.shift();
      spawnEnemy(type);
      spawnTimer = ENEMIES[type].gap;
    }
  } else if (wave < WAVES.length) {
    betweenTimer -= dt;
    if (betweenTimer <= 0) startWave();
  }

  for (const e of enemies) {
    const def = ENEMIES[e.type];
    e.slow = Math.max(0, e.slow - dt);
    const sp = def.speed * (e.slow > 0 ? 1 - e.slowAmt : 1);
    e.d += sp * dt;
    Object.assign(e, posAt(e.d));
    e.wobble += dt * 8;
    if (e.d >= pathLen[pathLen.length - 1]) {
      e.leaked = true;
      lives = Math.max(0, lives - def.leak);
      sfx('hurt');
      updateStats();
    }
  }
  enemies = enemies.filter((e) => e.hp > 0 && !e.leaked);

  if (lives <= 0) {
    sfx('lose');
    shell.gameOver({ title: 'The Road Fell', message: `You held out until wave ${wave}.` });
    return;
  }

  for (const t of towers) {
    t.cooldown -= dt;
    if (t.cooldown <= 0 && fire(t)) t.cooldown = TOWERS[t.type].rate[t.tier];
  }

  for (const s of shots) {
    // Shots home in on their target; if it's gone they finish at its last position.
    if (s.target.hp > 0) {
      s.tx = s.target.x;
      s.ty = s.target.y;
    }
    const sp = s.type === 'cannon' ? 320 : 520;
    const dx = s.tx - s.x;
    const dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);
    if (d <= sp * dt + 4) {
      s.done = true;
      if (s.type === 'cannon') {
        const radius = TOWERS.cannon.splash[s.tier];
        for (const e of enemies) if (dist(e.x, e.y, s.tx, s.ty) <= radius) damage(e, s.dmg);
        for (let i = 0; i < 14; i++) {
          const a = rand(TAU);
          particles.push({ x: s.tx, y: s.ty, vx: Math.cos(a) * rand(30, radius * 3), vy: Math.sin(a) * rand(30, radius * 3), life: rand(0.2, 0.45), color: '#ffb36b' });
        }
      } else if (s.target.hp > 0) {
        damage(s.target, s.dmg);
        if (s.type === 'frost') {
          s.target.slow = SLOW_TIME;
          s.target.slowAmt = Math.max(s.target.slow > 0 ? s.target.slowAmt : 0, TOWERS.frost.slow[s.tier]);
        }
      }
    } else {
      s.x += (dx / d) * sp * dt;
      s.y += (dy / d) * sp * dt;
    }
  }
  shots = shots.filter((s) => !s.done);
  enemies = enemies.filter((e) => e.hp > 0);

  for (const b of beams) b.t -= dt;
  beams = beams.filter((b) => b.t > 0);
  for (const q of particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vx *= 0.92;
    q.vy *= 0.92;
    q.life -= dt;
  }
  particles = particles.filter((q) => q.life > 0);
  for (const f of floaters) {
    f.y -= 30 * dt;
    f.t -= dt;
  }
  floaters = floaters.filter((f) => f.t > 0);

  if (waveRunning && !spawnQueue.length && !enemies.length) {
    waveRunning = false;
    const bonus = WAVE_BONUS(wave);
    gold += bonus;
    shell.addScore(100 * wave);
    updateStats();
    if (wave >= WAVES.length) {
      won = true;
      shell.addScore(lives * 100);
      sfx('win');
      shell.gameOver({ title: 'Bastion Holds!', win: true, message: `All ${WAVES.length} waves stopped with ${lives} ${lives === 1 ? 'life' : 'lives'} left.` });
      return;
    }
    floaters.push({ x: W / 2, y: MAP_H / 2, text: `Wave cleared! +${bonus} gold`, t: 1.6, big: true });
    sfx('coin');
    betweenTimer = AUTO_START;
  }
}

function update(dt) {
  handleInput();
  // Fast-forward runs the simulation twice per tick so physics stays stable.
  for (let i = 0; i < speed && shell.state === 'playing'; i++) simulate(dt);
}

// ---------- Drawing ----------

function drawTower(ctx, t) {
  const def = TOWERS[t.type];
  ctx.fillStyle = '#2a2640';
  ctx.beginPath();
  ctx.roundRect(t.x - 16, t.y - 16, 32, 32, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.shadowColor = def.color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = def.color;
  if (t.type === 'cannon') {
    ctx.fillRect(0, -5, 17, 10);
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, TAU);
    ctx.fill();
  } else if (t.type === 'spire') {
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-8, 8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, -8);
    ctx.closePath();
    ctx.fill();
  } else if (t.type === 'frost') {
    for (let k = 0; k < 6; k++) {
      ctx.rotate(Math.PI / 3);
      ctx.fillRect(0, -2, 11, 4);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillRect(0, -3, 16, 6);
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.shadowBlur = 0;
  // Tier pips
  for (let k = 0; k <= t.tier; k++) {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(t.x - 12 + k * 9, t.y + 11, 6, 3);
  }
}

function drawEnemy(ctx, e) {
  const def = ENEMIES[e.type];
  const s = def.size;
  const bob = Math.sin(e.wobble) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(e.x, e.y + s * 0.8, s, s * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.shadowColor = def.color;
  ctx.shadowBlur = e.type === 'boss' ? 18 : 8;
  ctx.fillStyle = e.slow > 0 ? '#bfe9ff' : def.color;
  ctx.beginPath();
  if (e.type === 'brute' || e.type === 'boss') ctx.roundRect(e.x - s, e.y - s + bob, s * 2, s * 2, s * 0.4);
  else ctx.arc(e.x, e.y + bob, s, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#1a1030';
  ctx.fillRect(e.x - s * 0.45, e.y - s * 0.3 + bob, s * 0.25, s * 0.3);
  ctx.fillRect(e.x + s * 0.2, e.y - s * 0.3 + bob, s * 0.25, s * 0.3);
  if (e.hp < e.maxHp) {
    const w = Math.max(18, s * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w / 2, e.y - s - 9, w, 4);
    ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#4dff88' : e.hp / e.maxHp > 0.25 ? '#ffd23f' : '#ff5a5a';
    ctx.fillRect(e.x - w / 2, e.y - s - 9, w * (e.hp / e.maxHp), 4);
  }
}

function button(ctx, b, label, sub, { enabled = true, active = false, color = '#ff8a3d' } = {}) {
  ctx.fillStyle = active ? `${color}33` : '#1c1838';
  ctx.strokeStyle = active ? color : enabled ? '#3d3672' : '#2a2650';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = enabled ? '#ece9ff' : '#5a5480';
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 - (sub ? 8 : 0));
  if (sub) {
    ctx.fillStyle = enabled ? '#ffd23f' : '#5a5480';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(sub, b.x + b.w / 2, b.y + b.h / 2 + 10);
  }
}

function drawPanel(ctx) {
  ctx.fillStyle = '#100d22';
  ctx.fillRect(0, PANEL_Y, W, H - PANEL_Y);
  ctx.fillStyle = '#2b2652';
  ctx.fillRect(0, PANEL_Y, W, 2);

  TOWER_KEYS.forEach((k, i) => {
    const def = TOWERS[k];
    const b = BUILD_BTN(i);
    const affordable = gold >= def.cost;
    const active = building === k;
    ctx.fillStyle = active ? `${def.color}2a` : '#1c1838';
    ctx.strokeStyle = active ? def.color : '#3d3672';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = affordable ? 1 : 0.4;
    drawTower(ctx, { type: k, x: b.x + b.w / 2, y: b.y + 30, tier: -1, angle: -Math.PI / 4 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ece9ff';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillText(`${i + 1} · ${def.name}`, b.x + b.w / 2, b.y + 62);
    ctx.fillStyle = '#ffd23f';
    ctx.font = '700 12px ui-monospace, monospace';
    ctx.fillText(`${def.cost}g`, b.x + b.w / 2, b.y + 81);
    ctx.globalAlpha = 1;
  });

  // Selected tower info
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const info = selected || (building && { type: building, tier: 0, preview: true });
  if (info) {
    const def = TOWERS[info.type];
    ctx.fillStyle = def.color;
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillText(`${def.name}${info.preview ? '' : ` · tier ${info.tier + 1}`}`, 396, PANEL_Y + 28);
    ctx.fillStyle = '#9d97c9';
    ctx.font = '500 12px system-ui, sans-serif';
    const extra = def.splash ? ` · splash ${def.splash[info.tier]}` : def.slow ? ` · slow ${Math.round(def.slow[info.tier] * 100)}%` : '';
    ctx.fillText(`${def.desc} · dmg ${def.dmg[info.tier]} · range ${def.range[info.tier]}${extra}`, 396, PANEL_Y + 50);
    if (selected) {
      const maxed = selected.tier >= 2;
      const cost = maxed ? 0 : UPGRADE_COST(selected.type, selected.tier + 1);
      button(ctx, UPGRADE_BTN, maxed ? 'Maxed' : 'Upgrade (U)', maxed ? '' : `${cost}g`, { enabled: !maxed && gold >= cost });
      button(ctx, SELL_BTN, 'Sell', `+${Math.floor(selected.invested * SELL_RATE)}g`);
    } else {
      ctx.fillStyle = '#ece9ff';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('Click the grass to build · right-click to cancel', 396, PANEL_Y + 88);
    }
  } else {
    ctx.fillStyle = '#9d97c9';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillText('Pick a tower, then click the grass.', 396, PANEL_Y + 40);
    ctx.fillText('Click a built tower to upgrade or sell it.', 396, PANEL_Y + 62);
  }

  const done = wave >= WAVES.length;
  const waveLabel = waveRunning ? `Wave ${wave} running` : done ? 'Final wave' : `Send wave ${wave + 1}`;
  const waveSub = waveRunning ? `${spawnQueue.length + enemies.length} left` : done ? '' : `auto in ${Math.ceil(betweenTimer)}s`;
  button(ctx, WAVE_BTN, waveLabel, waveSub, { enabled: !waveRunning && !done, active: !waveRunning && !done });
  button(ctx, SPEED_BTN, speed === 2 ? '▶▶ 2× speed' : '▶ 1× speed', '', { active: speed === 2, color: '#2de2e6' });
}

function render(ctx) {
  // Grass
  ctx.fillStyle = '#25421d';
  ctx.fillRect(0, 0, W, MAP_H);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if ((c + r) % 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }
  }
  // Road
  ctx.strokeStyle = '#5e4630';
  ctx.lineWidth = CELL + 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'square';
  ctx.beginPath();
  path.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x, p.y));
  ctx.stroke();
  ctx.strokeStyle = '#8a6a42';
  ctx.lineWidth = CELL - 4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 14]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Exit gate
  const end = path[path.length - 1];
  ctx.fillStyle = '#3a3550';
  ctx.fillRect(W - 14, end.y - 26, 14, 52);
  ctx.fillStyle = lives > 5 ? '#4dff88' : '#ff5a5a';
  ctx.fillRect(W - 10, end.y - 20, 6, 40 * (lives / START_LIVES));

  // Placement preview
  if (building && hover && hover.r < ROWS) {
    const ok = canBuild(hover.c, hover.r) && gold >= TOWERS[building].cost;
    const cx = hover.c * CELL + CELL / 2;
    const cy = hover.r * CELL + CELL / 2;
    ctx.fillStyle = ok ? 'rgba(77,255,136,0.12)' : 'rgba(255,90,90,0.15)';
    ctx.strokeStyle = ok ? 'rgba(77,255,136,0.5)' : 'rgba(255,90,90,0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, TOWERS[building].range[0], 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ok ? 'rgba(77,255,136,0.35)' : 'rgba(255,90,90,0.35)';
    ctx.fillRect(hover.c * CELL + 2, hover.r * CELL + 2, CELL - 4, CELL - 4);
  }
  if (selected) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(selected.x, selected.y, TOWERS[selected.type].range[selected.tier], 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  for (const t of towers) drawTower(ctx, t);
  for (const e of enemies) drawEnemy(ctx, e);

  for (const s of shots) {
    const color = TOWERS[s.type].color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.type === 'cannon' ? 5 : 3, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  for (const b of beams) {
    ctx.strokeStyle = `rgba(255,61,154,${b.t * 8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
  }
  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life * 2.5, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.t * 2, 0, 1);
    ctx.fillStyle = '#ffd23f';
    ctx.font = f.big ? '900 26px "Trebuchet MS", system-ui, sans-serif' : '700 12px system-ui, sans-serif';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  drawPanel(ctx);
}

shell.debug = () => ({
  towers, enemies, gold, lives, wave, waveRunning, build, upgrade, startWave,
  setGold: (g) => { gold = g; updateStats(); },
  setLives: (n) => { lives = n; updateStats(); },
  setWave: (n) => { wave = n; updateStats(); },
});
shell.boot();
