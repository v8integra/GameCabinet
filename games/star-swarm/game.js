// Star Swarm — formation shooter. Waves swoop in, settle into formation, then dive.
// Every 5th wave is a mothership boss.

import { createShell } from '../../shared/shell.js';
import { KEYS } from '../../shared/input.js';
import { sfx, tone } from '../../shared/audio.js';
import { TAU, rand, clamp, choose, seeded } from '../../shared/util.js';

const W = 600;
const H = 760;

const PLAYER_Y = H - 64;
const PLAYER_SPEED = 380;
const PLAYER_R = 14;
const FIRE_COOLDOWN = 0.24;
const RAPID_COOLDOWN = 0.11;
const MAX_SHOTS = 3;
const RAPID_MAX_SHOTS = 7;
const SHOT_SPEED = 760;
const START_LIVES = 3;
const RESPAWN_TIME = 1.6;
const INVULN_TIME = 2.2;

const FORMATION_TOP = 96;
const SLOT_DX = 54;
const SLOT_DY = 46;
const ENTRY_TIME = 2.1;
const GROUP_GAP = 1.5;
const MEMBER_GAP = 0.13;
const JOIN_SPEED = 300;
const ENEMY_SHOT_SPEED = 270;

const POWER_TIME = 10;
const POWER_DROP = 0.09;
const POWER_FALL = 140;
const BOSS_EVERY = 5;

const TYPES = {
  elite: { color: '#ff3d9a', hurt: '#ff9dcb', hp: 2, points: 150, divePoints: 400, size: 1.25 },
  guard: { color: '#ffd23f', hp: 1, points: 80, divePoints: 160, size: 1.05 },
  drone: { color: '#2de2e6', hp: 1, points: 50, divePoints: 100, size: 1 },
};

// Formation rows, top to bottom: [type, columns used out of 8].
const ROWS = [
  ['elite', [2, 3, 4, 5]],
  ['guard', [0, 1, 2, 3, 4, 5, 6, 7]],
  ['drone', [0, 1, 2, 3, 4, 5, 6, 7]],
  ['drone', [0, 1, 2, 3, 4, 5, 6, 7]],
];

const POWERS = {
  spread: { label: 'S', color: '#ff8a3d' },
  rapid: { label: 'R', color: '#4dff88' },
  shield: { label: 'O', color: '#2de2e6' },
};

let player, shots, enemies, enemyShots, powers, particles, stars, boss;
let wave, lives, time, formationTime, diveTimer, fireCooldown, respawnTimer, waveTimer, banner;
let spreadTimer, rapidTimer, shield;

const shell = createShell({
  title: 'Star Swarm',
  tagline: 'Hold the line against the swarm.',
  width: W,
  height: H,
  accent: '#2de2e6',
  help: [
    ['← → / A D', 'Move'],
    ['Space (hold)', 'Fire'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Drag to move · fires automatically while touching',
  init,
  update,
  render,
});

function init() {
  wave = 0;
  lives = START_LIVES;
  time = 0;
  formationTime = 0;
  fireCooldown = 0;
  respawnTimer = 0;
  waveTimer = 0;
  spreadTimer = 0;
  rapidTimer = 0;
  shield = false;
  shots = [];
  enemies = [];
  enemyShots = [];
  powers = [];
  particles = [];
  boss = null;
  banner = null;
  player = { x: W / 2, alive: true, invuln: 0 };
  const r = seeded(5);
  stars = Array.from({ length: 110 }, () => ({ x: r() * W, y: r() * H, z: 0.3 + r() * 0.7 }));
  nextWave();
}

function updateStats() {
  shell.setStats({ Lives: lives, Wave: wave });
}

const speedFactor = () => 1 + Math.min(wave - 1, 12) * 0.07;

function slotPos(col, row) {
  const breathe = 1 + Math.sin(formationTime * 1.6) * 0.06;
  const sway = Math.sin(formationTime * 0.7) * 34;
  return { x: W / 2 + (col - 3.5) * SLOT_DX * breathe + sway, y: FORMATION_TOP + row * SLOT_DY };
}

function bezier(p, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
    y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
  };
}

function nextWave() {
  wave++;
  updateStats();
  diveTimer = 3;
  formationTime = 0;
  if (wave % BOSS_EVERY === 0) {
    spawnBoss();
    banner = { text: 'Mothership!', t: 2 };
    return;
  }
  banner = { text: `Wave ${wave}`, t: 1.6 };
  // Each row flies in as a group, alternating sides.
  ROWS.forEach(([type, cols], row) => {
    const fromLeft = row % 2 === 0;
    cols.forEach((col, k) => {
      const def = TYPES[type];
      enemies.push({
        type,
        hp: def.hp,
        col,
        row,
        x: -100,
        y: -100,
        state: 'wait',
        delay: row * GROUP_GAP + k * MEMBER_GAP,
        fromLeft,
        t: 0,
        path: null,
        heading: Math.PI / 2,
        flap: rand(TAU),
      });
    });
  });
}

function spawnBoss() {
  const hp = 30 + wave * 5;
  boss = { x: W / 2, y: -80, hp, maxHp: hp, t: 0, fire: 2, spawn: 3.5, flash: 0 };
}

function entryPath(e) {
  const side = e.fromLeft ? 1 : -1;
  const startX = e.fromLeft ? -40 : W + 40;
  const slot = slotPos(e.col, e.row);
  return [
    { x: startX, y: 150 + e.row * 14 },
    { x: W / 2 + side * 220, y: H * 0.62 },
    { x: W / 2 - side * 200, y: H * 0.42 },
    { x: slot.x, y: slot.y + 40 },
  ];
}

function startDive(e) {
  const side = e.x < W / 2 ? -1 : 1;
  const tx = player.x + rand(-90, 90);
  e.state = 'dive';
  e.t = 0;
  e.duration = rand(2.4, 3) / speedFactor();
  e.path = [
    { x: e.x, y: e.y },
    { x: e.x + side * 130, y: e.y - 70 },
    { x: tx - side * 60, y: H * 0.62 },
    { x: clamp(tx + rand(-160, 160), 20, W - 20), y: H + 40 },
  ];
  e.shotsLeft = wave >= 2 ? 2 : 1;
  e.nextShot = rand(0.3, 0.5);
  tone({ freq: 900, to: 300, dur: 0.35, type: 'triangle', vol: 0.06 });
}

function burst(x, y, color, n = 14, speed = 200) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    const s = rand(speed * 0.25, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), color });
  }
}

function killEnemy(e) {
  const def = TYPES[e.type];
  const diving = e.state === 'dive' || e.state === 'enter';
  shell.addScore(diving ? def.divePoints : def.points);
  burst(e.x, e.y, def.color);
  sfx('explode');
  enemies.splice(enemies.indexOf(e), 1);
  if (Math.random() < (diving ? POWER_DROP * 2 : POWER_DROP)) {
    powers.push({ kind: choose(Object.keys(POWERS)), x: e.x, y: e.y });
  }
}

function enemyFire(x, y, spreadAngle = 0) {
  const a = Math.atan2(PLAYER_Y - y, player.x - x) + spreadAngle;
  enemyShots.push({ x, y, vx: Math.cos(a) * ENEMY_SHOT_SPEED, vy: Math.sin(a) * ENEMY_SHOT_SPEED });
}

function hitPlayer() {
  if (!player.alive || player.invuln > 0) return;
  if (shield) {
    shield = false;
    player.invuln = 1;
    sfx('hit');
    burst(player.x, PLAYER_Y, '#2de2e6', 16, 160);
    return;
  }
  player.alive = false;
  lives--;
  updateStats();
  burst(player.x, PLAYER_Y, '#e9fdff', 30, 260);
  sfx('explode');
  sfx('hurt');
  spreadTimer = 0;
  rapidTimer = 0;
  respawnTimer = RESPAWN_TIME;
}

function update(dt) {
  const { input } = shell;
  time += dt;
  formationTime += dt;
  fireCooldown = Math.max(0, fireCooldown - dt);
  spreadTimer = Math.max(0, spreadTimer - dt);
  rapidTimer = Math.max(0, rapidTimer - dt);
  if (banner) {
    banner.t -= dt;
    if (banner.t <= 0) banner = null;
  }
  for (const s of stars) {
    s.y += (40 + s.z * 120) * dt;
    if (s.y > H) {
      s.y = 0;
      s.x = rand(W);
    }
  }

  // ----- Player -----
  const p = input.pointer;
  if (player.alive) {
    player.invuln = Math.max(0, player.invuln - dt);
    const axis = input.axisX();
    if (axis) player.x += axis * PLAYER_SPEED * dt;
    else if (p.down) player.x += clamp(p.x - player.x, -PLAYER_SPEED * dt * 1.4, PLAYER_SPEED * dt * 1.4);
    player.x = clamp(player.x, 22, W - 22);

    const maxShots = rapidTimer > 0 ? RAPID_MAX_SHOTS : MAX_SHOTS;
    if ((input.down(KEYS.action) || p.down) && fireCooldown <= 0 && shots.length < maxShots) {
      fireCooldown = rapidTimer > 0 ? RAPID_COOLDOWN : FIRE_COOLDOWN;
      const angles = spreadTimer > 0 ? [-0.22, 0, 0.22] : [0];
      for (const a of angles) shots.push({ x: player.x, y: PLAYER_Y - 18, vx: Math.sin(a) * SHOT_SPEED, vy: -Math.cos(a) * SHOT_SPEED });
      sfx('shoot');
    }
  } else {
    respawnTimer -= dt;
    if (respawnTimer <= 0) {
      if (lives <= 0) {
        sfx('lose');
        shell.gameOver({ message: `The swarm broke through on wave ${wave}.` });
        return;
      }
      player = { x: W / 2, alive: true, invuln: INVULN_TIME };
    }
  }

  for (const s of shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  shots = shots.filter((s) => s.y > -20 && s.x > -20 && s.x < W + 20);

  // ----- Enemies -----
  const inFormation = enemies.filter((e) => e.state === 'formation');
  for (const e of enemies) {
    const prevX = e.x;
    const prevY = e.y;
    e.flap += dt * 8;
    if (e.state === 'wait') {
      e.delay -= dt;
      if (e.delay <= 0) {
        e.state = 'enter';
        e.t = 0;
        e.path = entryPath(e);
      }
      continue;
    }
    if (e.state === 'enter' || e.state === 'dive') {
      const dur = e.state === 'enter' ? ENTRY_TIME : e.duration;
      e.t += dt / dur;
      const pt = bezier(e.path, Math.min(1, e.t));
      e.x = pt.x;
      e.y = pt.y;
      if (e.state === 'dive' && e.shotsLeft > 0 && player.alive) {
        e.nextShot -= dt;
        if (e.nextShot <= 0 && e.y < PLAYER_Y - 120) {
          e.shotsLeft--;
          e.nextShot = rand(0.25, 0.45);
          enemyFire(e.x, e.y);
        }
      }
      if (e.t >= 1) {
        if (e.temp) {
          e.gone = true; // boss-spawned drones don't rejoin a formation
          continue;
        }
        if (e.state === 'dive') {
          // Came out the bottom — re-enter from the top.
          e.x = slotPos(e.col, e.row).x;
          e.y = -30;
        }
        e.state = 'join';
      }
    } else if (e.state === 'join') {
      const slot = slotPos(e.col, e.row);
      const dx = slot.x - e.x;
      const dy = slot.y - e.y;
      const d = Math.hypot(dx, dy);
      const step = JOIN_SPEED * speedFactor() * dt;
      if (d <= step) e.state = 'formation';
      else {
        e.x += (dx / d) * step;
        e.y += (dy / d) * step;
      }
    }
    if (e.state === 'formation' && e.diveIn > 0) {
      e.diveIn -= dt;
      if (e.diveIn <= 0) startDive(e);
    }
    if (e.state === 'formation') {
      const slot = slotPos(e.col, e.row);
      e.x = slot.x;
      e.y = slot.y;
      e.heading += (Math.PI / 2 - e.heading) * Math.min(1, dt * 8);
    } else {
      const vx = e.x - prevX;
      const vy = e.y - prevY;
      if (vx || vy) e.heading = Math.atan2(vy, vx);
    }
  }
  enemies = enemies.filter((e) => !e.gone);

  // Dive attacks, more often in later waves. Elites sometimes bring escorts.
  if (!boss && inFormation.length && player.alive) {
    diveTimer -= dt;
    if (diveTimer <= 0) {
      diveTimer = Math.max(0.8, 2.6 - wave * 0.15) * rand(0.7, 1.3);
      const leader = choose(inFormation);
      startDive(leader);
      if (leader.type === 'elite' && wave >= 2) {
        const escorts = inFormation.filter((e) => e.row === 1 && Math.abs(e.col - leader.col) <= 1 && e !== leader).slice(0, 2);
        escorts.forEach((e, i) => (e.diveIn = (i + 1) * 0.12));
      }
    }
  }

  // ----- Boss -----
  if (boss) {
    boss.t += dt;
    boss.flash = Math.max(0, boss.flash - dt);
    const targetY = 150;
    boss.y += (targetY - boss.y) * Math.min(1, dt * 1.5);
    boss.x = W / 2 + Math.sin(boss.t * 0.8) * (W / 2 - 120);
    boss.fire -= dt;
    if (boss.fire <= 0 && player.alive) {
      boss.fire = Math.max(0.8, 1.6 - wave * 0.04);
      for (const a of [-0.36, -0.18, 0, 0.18, 0.36]) enemyFire(boss.x, boss.y + 30, a);
      tone({ freq: 220, to: 120, dur: 0.2, type: 'sawtooth', vol: 0.1 });
    }
    boss.spawn -= dt;
    if (boss.spawn <= 0 && enemies.length < 6) {
      boss.spawn = 3.2;
      for (const side of [-1, 1]) {
        const e = { type: 'drone', hp: 1, col: 0, row: 3, x: boss.x + side * 50, y: boss.y + 20, state: 'formation', heading: Math.PI / 2, flap: 0, temp: true };
        enemies.push(e);
        startDive(e);
      }
    }
  }

  // ----- Collisions -----
  for (const s of shots) {
    if (s.dead) continue;
    for (const e of enemies) {
      if (e.state === 'wait') continue;
      const r = 15 * TYPES[e.type].size;
      if (Math.abs(s.x - e.x) < r && Math.abs(s.y - e.y) < r) {
        s.dead = true;
        e.hp--;
        if (e.hp <= 0) killEnemy(e);
        else sfx('hit');
        break;
      }
    }
    if (!s.dead && boss && Math.abs(s.x - boss.x) < 80 && Math.abs(s.y - boss.y) < 32) {
      s.dead = true;
      boss.hp--;
      boss.flash = 0.06;
      sfx('hit');
      if (boss.hp <= 0) {
        shell.addScore(3000 * (wave / BOSS_EVERY));
        for (let i = 0; i < 6; i++) burst(boss.x + rand(-70, 70), boss.y + rand(-25, 25), choose(['#ff3d9a', '#ffd23f', '#b26bff']), 18, 280);
        sfx('explode');
        sfx('win');
        boss = null;
      }
    }
  }
  shots = shots.filter((s) => !s.dead);

  for (const s of enemyShots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (player.alive && Math.abs(s.x - player.x) < PLAYER_R - 2 && Math.abs(s.y - PLAYER_Y) < PLAYER_R) {
      s.dead = true;
      hitPlayer();
    }
  }
  enemyShots = enemyShots.filter((s) => !s.dead && s.y < H + 10 && s.y > -10 && s.x > -10 && s.x < W + 10);

  if (player.alive) {
    for (const e of enemies) {
      if ((e.state === 'dive' || e.state === 'join') && Math.hypot(e.x - player.x, e.y - PLAYER_Y) < PLAYER_R + 12) {
        if (player.invuln > 0) continue;
        killEnemy(e);
        hitPlayer();
        break;
      }
    }
  }

  for (const pw of powers) {
    pw.y += POWER_FALL * dt;
    if (player.alive && Math.abs(pw.x - player.x) < 24 && Math.abs(pw.y - PLAYER_Y) < 20) {
      pw.dead = true;
      shell.addScore(100);
      sfx('powerup');
      if (pw.kind === 'spread') spreadTimer = POWER_TIME;
      else if (pw.kind === 'rapid') rapidTimer = POWER_TIME;
      else shield = true;
    }
  }
  powers = powers.filter((pw) => !pw.dead && pw.y < H + 20);

  for (const q of particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vx *= 0.96;
    q.vy *= 0.96;
    q.life -= dt;
  }
  particles = particles.filter((q) => q.life > 0);

  // ----- Wave clear -----
  if (!enemies.length && !boss) {
    waveTimer += dt;
    if (waveTimer > 1.4) {
      waveTimer = 0;
      enemyShots = [];
      nextWave();
    }
  }
}

// ---------- Drawing ----------

function drawBug(ctx, e) {
  const def = TYPES[e.type];
  const s = def.size;
  const color = e.type === 'elite' && e.hp === 1 ? def.hurt : def.color;
  const wing = 1 + Math.sin(e.flap) * 0.18;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.heading - Math.PI / 2);
  ctx.scale(s, s);
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(6 * wing, 2);
  ctx.lineTo(14 * wing, 7);
  ctx.lineTo(13 * wing, -5);
  ctx.lineTo(5, -9);
  ctx.lineTo(0, -5);
  ctx.lineTo(-5, -9);
  ctx.lineTo(-13 * wing, -5);
  ctx.lineTo(-14 * wing, 7);
  ctx.lineTo(-6 * wing, 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#020414';
  ctx.fillRect(-4, 1, 3, 3);
  ctx.fillRect(1, 1, 3, 3);
  if (e.type === 'elite') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1, -12, 2, 5);
  }
  ctx.restore();
}

function drawPlayer(ctx) {
  if (!player.alive || (player.invuln > 0 && Math.floor(time * 12) % 2)) return;
  const x = player.x;
  const y = PLAYER_Y;
  ctx.shadowColor = '#2de2e6';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#e9fdff';
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x + 6, y - 4);
  ctx.lineTo(x + 16, y + 10);
  ctx.lineTo(x + 6, y + 8);
  ctx.lineTo(x, y + 14);
  ctx.lineTo(x - 6, y + 8);
  ctx.lineTo(x - 16, y + 10);
  ctx.lineTo(x - 6, y - 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff3d9a';
  ctx.fillRect(x - 2, y - 6, 4, 6);
  if (Math.floor(time * 20) % 2) {
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(x - 2, y + 14, 4, 5);
  }
  ctx.shadowBlur = 0;
  if (shield) {
    ctx.strokeStyle = `rgba(45,226,230,${0.5 + Math.sin(time * 6) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, TAU);
    ctx.stroke();
  }
}

function drawBoss(ctx) {
  const { x, y } = boss;
  ctx.save();
  ctx.shadowColor = '#b26bff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = boss.flash > 0 ? '#fff' : '#6a3bb0';
  ctx.beginPath();
  ctx.ellipse(x, y, 82, 26, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = boss.flash > 0 ? '#fff' : '#b26bff';
  ctx.beginPath();
  ctx.ellipse(x, y - 14, 40, 22, 0, Math.PI, 0);
  ctx.fill();
  ctx.shadowBlur = 0;
  for (let i = -3; i <= 3; i++) {
    ctx.fillStyle = Math.floor(time * 6 + i) % 2 ? '#ffd23f' : '#ff3d9a';
    ctx.beginPath();
    ctx.arc(x + i * 20, y + 8, 4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // Health bar
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(W / 2 - 150, 24, 300, 8);
  ctx.fillStyle = '#ff3d9a';
  ctx.fillRect(W / 2 - 150, 24, 300 * (boss.hp / boss.maxHp), 8);
}

function render(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#020414');
  bg.addColorStop(1, '#06102a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    ctx.globalAlpha = s.z;
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(s.x, s.y, s.z > 0.8 ? 2 : 1, s.z * 4);
  }
  ctx.globalAlpha = 1;

  if (boss) drawBoss(ctx);
  for (const e of enemies) if (e.state !== 'wait') drawBug(ctx, e);

  for (const pw of powers) {
    const def = POWERS[pw.kind];
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(pw.x, pw.y, 11, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#020414';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, pw.x, pw.y + 1);
  }

  ctx.shadowColor = '#ff3d9a';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff9dcb';
  for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 9, 3, 14);
  ctx.shadowColor = '#ffd23f';
  ctx.fillStyle = '#ffe9a0';
  for (const s of enemyShots) {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3.5, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  drawPlayer(ctx);

  for (const q of particles) {
    ctx.globalAlpha = clamp(q.life * 2, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - 2, q.y - 2, 3, 3);
  }
  ctx.globalAlpha = 1;

  // Power-up timers bottom-left
  let row = 0;
  for (const [t, color, label] of [[spreadTimer, '#ff8a3d', 'SPREAD'], [rapidTimer, '#4dff88', 'RAPID']]) {
    if (t <= 0) continue;
    ctx.fillStyle = color;
    ctx.font = '700 10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, 12, H - 30 - row * 16);
    ctx.fillRect(60, H - 34 - row * 16, 60 * (t / POWER_TIME), 4);
    row++;
  }

  if (banner && shell.state === 'playing') {
    ctx.globalAlpha = clamp(banner.t * 2, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e9fdff';
    ctx.shadowColor = '#2de2e6';
    ctx.shadowBlur = 18;
    ctx.font = '900 38px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(banner.text.toUpperCase(), W / 2, H * 0.5);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

shell.debug = () => ({ enemies, boss, player, wave, lives, powers, setWave: (n) => { wave = n - 1; enemies = []; boss = null; nextWave(); } });
shell.boot();
