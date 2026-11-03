// Brickfall — brick breaker. 10 hand-built levels, multi-ball, wide paddle, lasers.

import { createShell } from '../../shared/shell.js';
import { KEYS } from '../../shared/input.js';
import { sfx } from '../../shared/audio.js';
import { TAU, rand, clamp, circleRect, rectsOverlap, choose } from '../../shared/util.js';

const W = 720;
const H = 540;

const COLS = 12;
const BRICK_W = 56;
const BRICK_H = 20;
const GAP = 2;
const GRID_X = (W - COLS * (BRICK_W + GAP) + GAP) / 2;
const GRID_Y = 56;

const PADDLE_Y = H - 40;
const PADDLE_W = 100;
const PADDLE_WIDE = 150;
const PADDLE_H = 14;
const PADDLE_SPEED = 560;
const MAX_BOUNCE_ANGLE = Math.PI / 3; // 60° from vertical at the paddle's edge

const BALL_R = 7;
const BALL_BASE_SPEED = 340;
const BALL_SPEED_PER_LEVEL = 12;
const BALL_SPEED_PER_HIT = 3;
const BALL_MAX_SPEED = 640;
const MAX_BALLS = 8;

const START_LIVES = 3;
const MAX_LIVES = 5;
const DROP_CHANCE = 0.14;
const POWER_FALL = 150;
const WIDE_TIME = 15;
const LASER_TIME = 12;
const LASER_COOLDOWN = 0.28;
const LASER_SPEED = 640;
const LEVEL_CLEAR_BONUS = 500;

// a–e: normal bricks (1 hit) · s: steel (2 hits) · x: unbreakable · .: empty
const BRICK_TYPES = {
  a: { color: '#ff3d9a', hp: 1, points: 50 },
  b: { color: '#ff8a3d', hp: 1, points: 40 },
  c: { color: '#ffd23f', hp: 1, points: 30 },
  d: { color: '#4dff88', hp: 1, points: 20 },
  e: { color: '#2de2e6', hp: 1, points: 10 },
  s: { color: '#9aa3c7', hp: 2, points: 80 },
  x: { color: '#3b3560', hp: Infinity, points: 0 },
};

const LEVELS = [
  { name: 'Warm-up', map: ['............', 'aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc', 'dddddddddddd', 'eeeeeeeeeeee'] },
  { name: 'Pyramid', map: ['.....aa.....', '....bbbb....', '...cccccc...', '..dddddddd..', '.eeeeeeeeee.', 'ssssssssssss'] },
  { name: 'Checkers', map: ['a.a.a.a.a.a.', '.b.b.b.b.b.b', 'c.c.c.c.c.c.', '.d.d.d.d.d.d', 'e.e.e.e.e.e.', '.s.s.s.s.s.s'] },
  { name: 'Fortress', map: ['x..........x', 'xaaaaaaaaaax', 'xbbbbbbbbbbx', 'xccssssssccx', 'xddddddddddx', 'xxxx....xxxx'] },
  { name: 'Invader', map: ['..a......a..', '...b....b...', '..cccccccc..', '.cc.cccc.cc.', 'dddddddddddd', 'd.dddddddd.d', 'd.e......e.d', '...ee..ee...'] },
  { name: 'Columns', map: ['ss.ss..ss.ss', 'aa.bb..cc.dd', 'aa.bb..cc.dd', 'bb.cc..dd.ee', 'bb.cc..dd.ee', 'cc.dd..ee.aa', 'cc.dd..ee.aa', 'xx.xx..xx.xx'] },
  { name: 'Diamond', map: ['.....aa.....', '....abba....', '...abccba...', '..abcddcba..', '.abcdssdcba.', '..abcddcba..', '...abccba...', '....abba....', '.....aa.....'] },
  { name: 'Steel Rain', map: ['s.s.s.s.s.s.', 'aaaaaaaaaaaa', '.s.s.s.s.s.s', 'bbbbbbbbbbbb', 's.s.s.s.s.s.', 'cccccccccccc', 'x...x..x...x'] },
  { name: 'The Gate', map: ['eeeeeeeeeeee', 'dddddddddddd', 'cccccccccccc', 'xxxxx..xxxxx', 'bbbbbbbbbbbb', '..aaaaaaaa..', '............', '...xx..xx...'] },
  { name: 'Finale', map: ['sxsxsxsxsxsx', 'eeeeeeeeeeee', 'dsdsdsdsdsds', 'cccccccccccc', 'bsbsbsbsbsbs', 'aaaaaaaaaaaa', 'x..x....x..x', '............', '..ssssssss..'] },
];

const POWERS = {
  multi: { label: 'M', color: '#2de2e6', weight: 3 },
  wide: { label: 'W', color: '#4dff88', weight: 3 },
  laser: { label: 'L', color: '#ff3d9a', weight: 2 },
  slow: { label: 'S', color: '#ffd23f', weight: 2 },
  life: { label: '+', color: '#ff5a5a', weight: 1 },
};
const POWER_BAG = Object.entries(POWERS).flatMap(([k, p]) => Array(p.weight).fill(k));

let levelIndex, lives, bricks, balls, paddle, powers, bolts, particles;
let wideTimer, laserTimer, laserCooldown, banner, lastPointerX, time, shake;

const shell = createShell({
  title: 'Brickfall',
  tagline: 'Smash every brick. Catch the power-ups.',
  width: W,
  height: H,
  accent: '#ff3d9a',
  help: [
    ['← → / A D', 'Move paddle'],
    ['Mouse', 'Move paddle'],
    ['Space / Click', 'Launch · fire lasers'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Drag to move · tap to launch',
  init,
  update,
  render,
});

function init() {
  levelIndex = 0;
  lives = START_LIVES;
  time = 0;
  shake = 0;
  particles = [];
  lastPointerX = null;
  paddle = { x: W / 2, w: PADDLE_W };
  loadLevel();
}

function loadLevel() {
  bricks = [];
  LEVELS[levelIndex].map.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const type = BRICK_TYPES[ch];
      if (!type) return;
      bricks.push({
        x: GRID_X + c * (BRICK_W + GAP),
        y: GRID_Y + r * (BRICK_H + GAP),
        w: BRICK_W,
        h: BRICK_H,
        ch,
        hp: type.hp,
        flash: 0,
      });
    })
  );
  resetRound();
  banner = { text: `Level ${levelIndex + 1}`, sub: LEVELS[levelIndex].name, t: 2 };
  updateStats();
}

function resetRound() {
  balls = [newBall()];
  powers = [];
  bolts = [];
  wideTimer = 0;
  laserTimer = 0;
  laserCooldown = 0;
  paddle.w = PADDLE_W;
}

function levelSpeed() {
  return BALL_BASE_SPEED + levelIndex * BALL_SPEED_PER_LEVEL;
}

function newBall() {
  return { x: paddle.x, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, speed: levelSpeed(), stuck: true, offset: rand(-20, 20) };
}

function updateStats() {
  shell.setStats({ Lives: lives, Level: `${levelIndex + 1}/${LEVELS.length}` });
}

function launch(ball) {
  ball.stuck = false;
  const angle = clamp(ball.offset / (paddle.w / 2), -1, 1) * MAX_BOUNCE_ANGLE * 0.6;
  ball.vx = Math.sin(angle) * ball.speed;
  ball.vy = -Math.cos(angle) * ball.speed;
  sfx('blip');
}

function setVelocity(ball, angle) {
  ball.vx = Math.sin(angle) * ball.speed;
  ball.vy = -Math.cos(angle) * ball.speed;
}

function burst(x, y, color, n = 10, speed = 180) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU);
    const s = rand(speed * 0.3, speed);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color });
  }
}

function hitBrick(brick) {
  if (brick.hp === Infinity) {
    brick.flash = 0.12;
    sfx('hit');
    return;
  }
  brick.hp--;
  brick.flash = 0.12;
  const type = BRICK_TYPES[brick.ch];
  if (brick.hp > 0) {
    sfx('hit');
    return;
  }
  shell.addScore(type.points);
  sfx('bounce');
  shake = Math.max(shake, 0.08);
  burst(brick.x + brick.w / 2, brick.y + brick.h / 2, type.color, 12);
  bricks.splice(bricks.indexOf(brick), 1);
  if (Math.random() < DROP_CHANCE) {
    powers.push({ kind: choose(POWER_BAG), x: brick.x + brick.w / 2, y: brick.y + brick.h / 2 });
  }
}

function applyPower(kind) {
  shell.addScore(50);
  sfx('powerup');
  if (kind === 'multi') {
    const extra = [];
    for (const b of balls) {
      if (b.stuck) continue;
      for (const turn of [-0.35, 0.35]) {
        if (balls.length + extra.length >= MAX_BALLS) break;
        const angle = Math.atan2(b.vx, -b.vy) + turn;
        const nb = { ...b };
        setVelocity(nb, angle);
        extra.push(nb);
      }
    }
    balls.push(...extra);
  } else if (kind === 'wide') {
    wideTimer = WIDE_TIME;
  } else if (kind === 'laser') {
    laserTimer = LASER_TIME;
  } else if (kind === 'slow') {
    for (const b of balls) {
      b.speed = Math.max(levelSpeed() * 0.75, b.speed * 0.7);
      if (!b.stuck) setVelocity(b, Math.atan2(b.vx, -b.vy));
    }
  } else if (kind === 'life') {
    lives = Math.min(MAX_LIVES, lives + 1);
    updateStats();
  }
}

function moveBall(ball, dt) {
  const dist = ball.speed * dt;
  const steps = Math.max(1, Math.ceil(dist / 4));
  const sdt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.vx * sdt;
    ball.y += ball.vy * sdt;

    if (ball.x < BALL_R) {
      ball.x = BALL_R;
      ball.vx = Math.abs(ball.vx);
      sfx('blip');
    } else if (ball.x > W - BALL_R) {
      ball.x = W - BALL_R;
      ball.vx = -Math.abs(ball.vx);
      sfx('blip');
    }
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
      sfx('blip');
    }

    // Paddle: the bounce angle depends on where the ball lands.
    const pad = { x: paddle.x - paddle.w / 2, y: PADDLE_Y, w: paddle.w, h: PADDLE_H };
    if (ball.vy > 0 && circleRect({ x: ball.x, y: ball.y, r: BALL_R }, pad)) {
      const rel = clamp((ball.x - paddle.x) / (paddle.w / 2), -1, 1);
      ball.y = PADDLE_Y - BALL_R;
      setVelocity(ball, rel * MAX_BOUNCE_ANGLE);
      sfx('bounce');
      continue;
    }

    for (const brick of bricks) {
      if (!circleRect({ x: ball.x, y: ball.y, r: BALL_R }, brick)) continue;
      // Reflect on whichever axis the ball came in from.
      const wasOutsideX = px < brick.x || px > brick.x + brick.w;
      const wasOutsideY = py < brick.y || py > brick.y + brick.h;
      if (wasOutsideX && !wasOutsideY) ball.vx = -ball.vx;
      else if (wasOutsideY && !wasOutsideX) ball.vy = -ball.vy;
      else {
        ball.vx = -ball.vx;
        ball.vy = -ball.vy;
      }
      ball.x = px;
      ball.y = py;
      if (brick.hp !== Infinity) {
        ball.speed = Math.min(BALL_MAX_SPEED, ball.speed + BALL_SPEED_PER_HIT);
        setVelocity(ball, Math.atan2(ball.vx, -ball.vy));
      }
      hitBrick(brick);
      break;
    }

    // Never let the ball settle into a near-horizontal path.
    if (Math.abs(ball.vy) < ball.speed * 0.2) {
      ball.vy = Math.sign(ball.vy || -1) * ball.speed * 0.2;
      ball.vx = Math.sign(ball.vx || 1) * Math.sqrt(ball.speed ** 2 - ball.vy ** 2);
    }
  }
}

function update(dt) {
  const { input } = shell;
  time += dt;
  if (banner) {
    banner.t -= dt;
    if (banner.t <= 0) banner = null;
  }
  shake = Math.max(0, shake - dt);
  for (const b of bricks) b.flash = Math.max(0, b.flash - dt);

  // Paddle: keyboard, or follow the mouse / finger when it moves.
  const axis = input.axisX();
  if (axis) {
    paddle.x += axis * PADDLE_SPEED * dt;
  } else if (input.pointer.x !== lastPointerX && lastPointerX !== null) {
    paddle.x = input.pointer.x;
  }
  lastPointerX = input.pointer.x;
  const targetW = wideTimer > 0 ? PADDLE_WIDE : PADDLE_W;
  paddle.w += (targetW - paddle.w) * Math.min(1, dt * 10);
  paddle.x = clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

  wideTimer = Math.max(0, wideTimer - dt);
  laserTimer = Math.max(0, laserTimer - dt);
  laserCooldown = Math.max(0, laserCooldown - dt);

  const fire = input.pressed(KEYS.action) || (input.pointer.pressed && input.pointer.button === 0);
  const fireHeld = input.down(KEYS.action) || input.pointer.down;
  if (fire) for (const b of balls) if (b.stuck) launch(b);
  if (laserTimer > 0 && fireHeld && laserCooldown <= 0 && !balls.some((b) => b.stuck)) {
    laserCooldown = LASER_COOLDOWN;
    for (const side of [-1, 1]) bolts.push({ x: paddle.x + side * (paddle.w / 2 - 8), y: PADDLE_Y - 4 });
    sfx('shoot');
  }

  for (const ball of balls) {
    if (ball.stuck) {
      ball.x = paddle.x + ball.offset;
      ball.y = PADDLE_Y - BALL_R - 1;
    } else {
      moveBall(ball, dt);
    }
  }

  for (const bolt of bolts) {
    bolt.y -= LASER_SPEED * dt;
    const hit = bricks.find((b) => rectsOverlap({ x: bolt.x - 2, y: bolt.y - 10, w: 4, h: 12 }, b));
    if (hit) {
      bolt.dead = true;
      hitBrick(hit);
    }
    if (bolt.y < -20) bolt.dead = true;
  }
  bolts = bolts.filter((b) => !b.dead);

  for (const p of powers) {
    p.y += POWER_FALL * dt;
    if (rectsOverlap({ x: p.x - 14, y: p.y - 8, w: 28, h: 16 }, { x: paddle.x - paddle.w / 2, y: PADDLE_Y, w: paddle.w, h: PADDLE_H })) {
      p.dead = true;
      applyPower(p.kind);
    }
    if (p.y > H + 20) p.dead = true;
  }
  powers = powers.filter((p) => !p.dead);

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  // Lost balls.
  balls = balls.filter((b) => b.y < H + BALL_R * 2);
  if (!balls.length) {
    lives--;
    updateStats();
    sfx('hurt');
    if (lives <= 0) {
      sfx('lose');
      shell.gameOver({ message: `You reached level ${levelIndex + 1}: ${LEVELS[levelIndex].name}.` });
      return;
    }
    resetRound();
    banner = { text: `${lives} ${lives === 1 ? 'ball' : 'balls'} left`, sub: '', t: 1.2 };
  }

  if (!bricks.some((b) => b.hp !== Infinity)) {
    shell.addScore(LEVEL_CLEAR_BONUS * (levelIndex + 1));
    sfx('win');
    if (levelIndex === LEVELS.length - 1) {
      shell.gameOver({ title: 'You Win!', win: true, message: `All ${LEVELS.length} levels cleared with ${lives} ${lives === 1 ? 'life' : 'lives'} to spare.` });
      return;
    }
    levelIndex++;
    loadLevel();
  }
}

// ---------- Drawing ----------

function drawBrick(ctx, b) {
  const type = BRICK_TYPES[b.ch];
  ctx.save();
  if (b.ch === 'x') {
    ctx.fillStyle = type.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let sx = b.x - b.h; sx < b.x + b.w; sx += 10) {
      ctx.moveTo(Math.max(sx, b.x), b.y + b.h - Math.max(0, b.x - sx));
      ctx.lineTo(Math.min(sx + b.h, b.x + b.w), b.y + Math.max(0, sx + b.h - (b.x + b.w)));
    }
    ctx.stroke();
  } else {
    ctx.shadowColor = type.color;
    ctx.shadowBlur = 8;
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, type.color);
    g.addColorStop(1, b.ch === 's' ? '#5d6488' : `${type.color}aa`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 3);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(b.x + 4, b.y + 2, b.w - 8, 2);
    if (b.ch === 's') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (const rx of [b.x + 5, b.x + b.w - 7]) ctx.fillRect(rx, b.y + b.h / 2 - 1, 2, 2);
      if (b.hp === 1) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + 18, b.y);
        ctx.lineTo(b.x + 24, b.y + 9);
        ctx.lineTo(b.x + 20, b.y + 13);
        ctx.lineTo(b.x + 30, b.y + b.h);
        ctx.stroke();
      }
    }
  }
  if (b.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${b.flash * 5})`;
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.restore();
}

function drawPaddle(ctx) {
  const x = paddle.x - paddle.w / 2;
  ctx.shadowColor = '#2de2e6';
  ctx.shadowBlur = 18;
  const g = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
  g.addColorStop(0, '#a8fbff');
  g.addColorStop(1, '#1aa8b0');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, PADDLE_Y, paddle.w, PADDLE_H, 7);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (laserTimer > 0) {
    ctx.fillStyle = '#ff3d9a';
    for (const side of [-1, 1]) ctx.fillRect(paddle.x + side * (paddle.w / 2 - 8) - 3, PADDLE_Y - 6, 6, 8);
  }
  // Timers for active power-ups, as thin bars under the paddle.
  let row = 0;
  for (const [t, max, color] of [[wideTimer, WIDE_TIME, '#4dff88'], [laserTimer, LASER_TIME, '#ff3d9a']]) {
    if (t <= 0) continue;
    ctx.fillStyle = color;
    ctx.fillRect(x, PADDLE_Y + PADDLE_H + 4 + row * 4, paddle.w * (t / max), 2);
    row++;
  }
}

function render(ctx) {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-3, 3), rand(-3, 3));

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#12061f');
  bg.addColorStop(1, '#1d0a2e');
  ctx.fillStyle = bg;
  ctx.fillRect(-10, -10, W + 20, H + 20);
  ctx.strokeStyle = 'rgba(255,61,154,0.05)';
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

  for (const b of bricks) drawBrick(ctx, b);

  for (const p of powers) {
    const def = POWERS[p.kind];
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(p.x - 14, p.y - 8, 28, 16, 8);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#12061f';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label, p.x, p.y + 1);
  }

  ctx.fillStyle = '#ff9dcb';
  ctx.shadowColor = '#ff3d9a';
  ctx.shadowBlur = 10;
  for (const bolt of bolts) ctx.fillRect(bolt.x - 2, bolt.y - 10, 4, 12);
  ctx.shadowBlur = 0;

  drawPaddle(ctx);

  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#fff';
  for (const ball of balls) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (banner && shell.state === 'playing') {
    ctx.globalAlpha = clamp(banner.t * 2, 0, 1);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#ff3d9a';
    ctx.shadowBlur = 16;
    ctx.font = '900 40px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(banner.text.toUpperCase(), W / 2, H * 0.62);
    ctx.shadowBlur = 0;
    if (banner.sub) {
      ctx.fillStyle = '#ffd23f';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(banner.sub, W / 2, H * 0.62 + 34);
    }
    ctx.globalAlpha = 1;
  }
  if (shell.state === 'playing' && balls.some((b) => b.stuck)) {
    ctx.fillStyle = `rgba(236,233,255,${0.55 + Math.sin(time * 4) * 0.25})`;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText('Space, click or tap to launch', W / 2, PADDLE_Y - 40);
  }
}

shell.debug = () => ({ levelIndex, lives, bricks, balls, paddle, powers });
shell.boot();
