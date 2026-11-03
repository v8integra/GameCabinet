// Putt Park — 9 holes of top-down mini golf with our own ball physics:
// walls, bumpers, sand, water, slopes and a windmill.

import { createShell } from '../../shared/shell.js';
import { sfx, tone, noise } from '../../shared/audio.js';
import { TAU, clamp, lerp } from '../../shared/util.js';

const W = 800;
const H = 560;

const BALL_R = 7;
const HOLE_R = 11;
const MAX_SHOT = 900; // px/s at full power
const AIM_RANGE = 160; // drag distance for full power
const ROLL_FRICTION = 170; // px/s²
const SAND_FRICTION = 720;
const LINEAR_DAMP = 0.35; // per second
const WALL_BOUNCE = 0.72;
const BUMPER_BOUNCE = 1.15;
const BUMPER_MIN_OUT = 260;
const DOOR_SHUT = 0.5; // fraction of each windmill turn the door is closed
const STOP_SPEED = 9;
const SINK_SPEED = 430; // faster than this rolls over the cup
const CUP_PULL = 900;
const MAX_STROKES = 8;

const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const HOLES = [
  { name: 'Straight Start', par: 2, tee: [160, 280], cup: [640, 280], walls: rect(100, 200, 700, 360) },
  { name: 'Dogleg', par: 3, tee: [200, 140], cup: [650, 405], walls: [[80, 80], [320, 80], [320, 330], [720, 330], [720, 480], [80, 480]] },
  {
    name: 'Sand Trap', par: 3, tee: [140, 280], cup: [660, 280], walls: rect(80, 140, 720, 420),
    sand: [[[330, 205], [470, 205], [505, 280], [470, 355], [330, 355], [295, 280]]],
  },
  {
    name: 'The Pond', par: 3, tee: [140, 400], cup: [660, 160], walls: rect(80, 100, 720, 460),
    water: [[[300, 180], [500, 180], [530, 380], [270, 380]]],
  },
  {
    name: 'Bumper Alley', par: 3, tee: [400, 460], cup: [400, 100], walls: rect(160, 50, 640, 510),
    bumpers: [[320, 330, 16], [400, 280, 16], [480, 330, 16], [350, 190, 16], [450, 190, 16]],
  },
  {
    // The windmill's door (gap y0–y1 in the wall at x) opens and shuts as the blades turn.
    name: 'The Windmill', par: 3, tee: [140, 280], cup: [660, 280], walls: rect(80, 200, 720, 360),
    inner: [[400, 200, 400, 255], [400, 305, 400, 360]], windmill: { x: 400, y0: 255, y1: 305, speed: 0.45 },
  },
  {
    name: 'Hills', par: 3, tee: [140, 180], cup: [660, 380], walls: rect(80, 120, 720, 440),
    slopes: [{ r: [250, 120, 120, 320], ax: 0, ay: 260 }, { r: [430, 120, 120, 320], ax: 0, ay: -260 }],
  },
  {
    name: 'Zigzag', par: 5, tee: [160, 120], cup: [640, 120], walls: rect(80, 60, 720, 500),
    inner: [[240, 60, 240, 380], [400, 180, 400, 500], [560, 60, 560, 380]],
  },
  {
    name: 'Grand Finale', par: 4, tee: [130, 280], cup: [680, 280], walls: rect(60, 60, 740, 500),
    water: [[[280, 60], [380, 60], [380, 320], [280, 320]]],
    sand: [[[280, 410], [380, 410], [380, 500], [280, 500]]],
    inner: [[560, 60, 560, 255], [560, 305, 560, 500]],
    windmill: { x: 560, y0: 255, y1: 305, speed: 0.6 },
    bumpers: [[460, 160, 16], [460, 420, 16]],
  },
];

let holeIndex, hole, segments, ball, phase, strokes, card, lastRest, aim, windAngle, banner, stopTimer, splashTimer, sinkT, time, ripples;

const shell = createShell({
  title: 'Putt Park',
  tagline: 'Nine holes. One very rude windmill.',
  width: W,
  height: H,
  accent: '#3ddc84',
  help: [
    ['Drag back', 'Aim — pull away from where you want to putt'],
    ['Release', 'Putt (longer pull = harder)'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Drag back from anywhere and release to putt',
  init,
  update,
  render,
});

function init() {
  holeIndex = 0;
  card = [];
  time = 0;
  ripples = [];
  loadHole();
}

function loadHole() {
  hole = HOLES[holeIndex];
  segments = [];
  const pts = hole.walls;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    segments.push([x1, y1, x2, y2]);
  }
  for (const s of hole.inner || []) segments.push(s);
  ball = { x: hole.tee[0], y: hole.tee[1], vx: 0, vy: 0, scale: 1 };
  lastRest = { x: ball.x, y: ball.y };
  phase = 'aim';
  strokes = 0;
  aim = null;
  windAngle = 0;
  banner = { text: `Hole ${holeIndex + 1}`, sub: `${hole.name} · Par ${hole.par}`, t: 1.8 };
  stopTimer = 0;
  splashTimer = 0;
  sinkT = 0;
  updateStats();
}

function totalVsPar() {
  const strokesSoFar = card.reduce((a, c) => a + c.strokes, 0);
  const parSoFar = card.reduce((a, c) => a + c.par, 0);
  return strokesSoFar - parSoFar;
}

const fmtPar = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

function updateStats() {
  shell.setStats({ Hole: `${holeIndex + 1}/9`, Par: hole.par, Strokes: strokes, Total: fmtPar(totalVsPar()) });
}

// ---------- Geometry ----------

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRect(x, y, [rx, ry, rw, rh]) {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

// Push the ball out of a segment and bounce it.
function collideSegment(x1, y1, x2, y2, bounce) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = clamp(((ball.x - x1) * dx + (ball.y - y1) * dy) / len2, 0, 1);
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  let nx = ball.x - cx;
  let ny = ball.y - cy;
  const d = Math.hypot(nx, ny);
  if (d >= BALL_R || d === 0) return false;
  nx /= d;
  ny /= d;
  ball.x = cx + nx * BALL_R;
  ball.y = cy + ny * BALL_R;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + bounce) * vn * nx;
    ball.vy -= (1 + bounce) * vn * ny;
    if (Math.abs(vn) > 60) tone({ freq: 180 + Math.min(400, Math.abs(vn) * 0.3), dur: 0.05, type: 'triangle', vol: clamp(Math.abs(vn) / 2500, 0.03, 0.15) });
  }
  return true;
}

// windAngle counts windmill turns; the door is shut for the first part of each turn.
const doorShut = () => hole.windmill && ((windAngle % 1) + 1) % 1 < DOOR_SHUT;

// ---------- Simulation ----------

function onSurface(polys) {
  return (polys || []).some((p) => pointInPoly(ball.x, ball.y, p));
}

function stepBall(dt) {
  const speed = Math.hypot(ball.vx, ball.vy);
  const friction = onSurface(hole.sand) ? SAND_FRICTION : ROLL_FRICTION;
  if (speed > 0) {
    const drop = Math.min(speed, friction * dt);
    ball.vx -= (ball.vx / speed) * drop;
    ball.vy -= (ball.vy / speed) * drop;
  }
  ball.vx *= 1 - LINEAR_DAMP * dt;
  ball.vy *= 1 - LINEAR_DAMP * dt;
  for (const s of hole.slopes || []) {
    if (inRect(ball.x, ball.y, s.r)) {
      ball.vx += s.ax * dt;
      ball.vy += s.ay * dt;
    }
  }

  // The cup pulls a slow ball in.
  const [hx, hy] = hole.cup;
  const dh = Math.hypot(hx - ball.x, hy - ball.y);
  if (dh < HOLE_R + 4 && Math.hypot(ball.vx, ball.vy) < SINK_SPEED) {
    ball.vx += ((hx - ball.x) / (dh || 1)) * CUP_PULL * dt;
    ball.vy += ((hy - ball.y) / (dh || 1)) * CUP_PULL * dt;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  for (const [x1, y1, x2, y2] of segments) collideSegment(x1, y1, x2, y2, WALL_BOUNCE);

  const m = hole.windmill;
  if (m && doorShut()) collideSegment(m.x, m.y0, m.x, m.y1, WALL_BOUNCE);

  for (const [bx, by, br] of hole.bumpers || []) {
    const dx = ball.x - bx;
    const dy = ball.y - by;
    const d = Math.hypot(dx, dy);
    if (d < br + BALL_R && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      ball.x = bx + nx * (br + BALL_R);
      ball.y = by + ny * (br + BALL_R);
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) {
        ball.vx -= (1 + BUMPER_BOUNCE) * vn * nx;
        ball.vy -= (1 + BUMPER_BOUNCE) * vn * ny;
        const out = Math.hypot(ball.vx, ball.vy);
        if (out < BUMPER_MIN_OUT) {
          ball.vx *= BUMPER_MIN_OUT / out;
          ball.vy *= BUMPER_MIN_OUT / out;
        }
        tone({ freq: 660, to: 990, dur: 0.08, type: 'square', vol: 0.1 });
      }
    }
  }
}

function shoot(power, dirX, dirY) {
  ball.vx = dirX * power * MAX_SHOT;
  ball.vy = dirY * power * MAX_SHOT;
  lastRest = { x: ball.x, y: ball.y };
  strokes++;
  phase = 'rolling';
  stopTimer = 0;
  updateStats();
  tone({ freq: 220 + power * 300, dur: 0.06, type: 'triangle', vol: 0.18 });
  noise({ dur: 0.05, vol: 0.12, freq: 3000 });
}

function scoreHole() {
  const diff = strokes - hole.par;
  let label;
  let points;
  if (strokes === 1) [label, points] = ['Hole in One!', 1000];
  else if (diff <= -2) [label, points] = ['Eagle!', 500];
  else if (diff === -1) [label, points] = ['Birdie!', 300];
  else if (diff === 0) [label, points] = ['Par', 200];
  else if (diff === 1) [label, points] = ['Bogey', 100];
  else if (diff === 2) [label, points] = ['Double Bogey', 50];
  else [label, points] = [fmtPar(diff), 20];
  return { label, points };
}

function finishHole(pickedUp = false) {
  if (pickedUp) strokes = MAX_STROKES;
  card.push({ par: hole.par, strokes });
  const { label, points } = pickedUp ? { label: 'Picked Up', points: 0 } : scoreHole();
  shell.addScore(points);
  banner = { text: label, sub: `${strokes} stroke${strokes === 1 ? '' : 's'} · par ${hole.par}`, t: 2 };
  phase = 'sunk';
  updateStats();
  if (!pickedUp) sfx(strokes <= hole.par ? 'win' : 'coin');
  else sfx('hit');
}

function update(dt) {
  const { input } = shell;
  const p = input.pointer;
  time += dt;
  if (hole.windmill) windAngle += hole.windmill.speed * dt;
  if (banner) banner.t -= dt;
  for (const r of ripples) r.t += dt;
  ripples = ripples.filter((r) => r.t < 1);

  if (phase === 'aim') {
    if (p.pressed) aim = { x: p.x, y: p.y };
    if (aim) {
      aim.x = p.x;
      aim.y = p.y;
      if (p.released) {
        const dx = ball.x - aim.x;
        const dy = ball.y - aim.y;
        const len = Math.hypot(dx, dy);
        const power = clamp(len / AIM_RANGE, 0, 1);
        if (power > 0.05) shoot(power, dx / len, dy / len);
        aim = null;
      }
    }
  } else if (phase === 'rolling') {
    const speed = Math.hypot(ball.vx, ball.vy);
    const steps = clamp(Math.ceil((speed * dt) / 3), 1, 40);
    for (let i = 0; i < steps; i++) stepBall(dt / steps);

    if (onSurface(hole.water)) {
      phase = 'splash';
      splashTimer = 0.7;
      ripples.push({ x: ball.x, y: ball.y, t: 0 });
      noise({ dur: 0.45, vol: 0.3, freq: 1200, to: 200 });
      strokes++; // penalty stroke
      updateStats();
      return;
    }

    const [hx, hy] = hole.cup;
    if (Math.hypot(hx - ball.x, hy - ball.y) < HOLE_R - 3 && Math.hypot(ball.vx, ball.vy) < SINK_SPEED) {
      phase = 'sinking';
      sinkT = 0;
      tone({ freq: 400, to: 200, dur: 0.2, type: 'sine', vol: 0.2 });
      return;
    }

    const onSlope = (hole.slopes || []).some((s) => inRect(ball.x, ball.y, s.r));
    if (Math.hypot(ball.vx, ball.vy) < STOP_SPEED) {
      stopTimer += dt;
      if (stopTimer > (onSlope ? 0.4 : 0.05)) {
        ball.vx = 0;
        ball.vy = 0;
        if (strokes >= MAX_STROKES) finishHole(true);
        else phase = 'aim';
      }
    } else stopTimer = 0;
  } else if (phase === 'splash') {
    splashTimer -= dt;
    if (splashTimer <= 0) {
      ball.x = lastRest.x;
      ball.y = lastRest.y;
      ball.vx = 0;
      ball.vy = 0;
      if (strokes >= MAX_STROKES) finishHole(true);
      else phase = 'aim';
    }
  } else if (phase === 'sinking') {
    sinkT += dt;
    ball.x = lerp(ball.x, hole.cup[0], Math.min(1, dt * 12));
    ball.y = lerp(ball.y, hole.cup[1], Math.min(1, dt * 12));
    ball.scale = Math.max(0, 1 - sinkT * 4);
    if (sinkT > 0.3) finishHole();
  } else if (phase === 'sunk') {
    if (banner.t <= 0) {
      if (holeIndex === HOLES.length - 1) {
        const total = card.reduce((a, c) => a + c.strokes, 0);
        const par = card.reduce((a, c) => a + c.par, 0);
        shell.gameOver({ title: 'Round Complete!', win: true, message: `${total} strokes on a par ${par} course (${fmtPar(total - par)}).` });
        return;
      }
      holeIndex++;
      loadHole();
    }
  }
}

// ---------- Drawing ----------

function polyPath(ctx, poly) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
  ctx.closePath();
}

function render(ctx) {
  ctx.fillStyle = '#0b2a1a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 0; x < W; x += 24) for (let y = (x / 24) % 2 ? 12 : 0; y < H; y += 24) ctx.fillRect(x, y, 3, 3);

  // Green with mowing stripes.
  ctx.save();
  polyPath(ctx, hole.walls);
  ctx.fillStyle = '#2fbf6a';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = -H; x < W; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 28, 0);
    ctx.lineTo(x + 28 + H, H);
    ctx.lineTo(x + H, H);
    ctx.fill();
  }

  for (const s of hole.slopes || []) {
    const [rx, ry, rw, rh] = s.r;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(rx, ry, rw, rh);
    // Chevrons drift in the downhill direction.
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 3;
    const dir = Math.sign(s.ay || s.ax);
    const off = ((time * 30 * dir) % 40 + 40) % 40;
    for (let y = ry - 40 + off; y < ry + rh + 40; y += 40) {
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.3, y - dir * 8);
      ctx.lineTo(rx + rw * 0.5, y + dir * 8);
      ctx.lineTo(rx + rw * 0.7, y - dir * 8);
      ctx.stroke();
    }
  }
  for (const s of hole.sand || []) {
    polyPath(ctx, s);
    ctx.fillStyle = '#e6cf8a';
    ctx.fill();
    ctx.fillStyle = 'rgba(160,120,60,0.35)';
    const [x0, y0] = s[0];
    for (let i = 0; i < 40; i++) ctx.fillRect(x0 + ((i * 37) % 140) - 10, y0 + ((i * 53) % 140) - 5, 2, 2);
  }
  for (const s of hole.water || []) {
    polyPath(ctx, s);
    ctx.fillStyle = '#2a8ad0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    const xs = s.map(([x]) => x);
    const ys = s.map(([, y]) => y);
    for (let y = Math.min(...ys) + 16; y < Math.max(...ys); y += 26) {
      const x = Math.min(...xs) + 20 + ((y * 7 + time * 20) % 60);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 8, y - 4, x + 16, y);
      ctx.stroke();
    }
  }
  ctx.restore();

  for (const r of ripples) {
    ctx.strokeStyle = `rgba(255,255,255,${1 - r.t})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 6 + r.t * 30, 0, TAU);
    ctx.stroke();
  }

  // Walls
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 10;
  polyPath(ctx, hole.walls.map(([x, y]) => [x + 2, y + 3]));
  ctx.stroke();
  ctx.strokeStyle = '#ece3c8';
  ctx.lineWidth = 8;
  polyPath(ctx, hole.walls);
  ctx.stroke();
  for (const [x1, y1, x2, y2] of hole.inner || []) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  for (const [bx, by, br] of hole.bumpers || []) {
    ctx.shadowColor = '#ff3d9a';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff3d9a';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffd1e6';
    ctx.beginPath();
    ctx.arc(bx, by, br * 0.45, 0, TAU);
    ctx.fill();
  }

  // Cup and flag
  const [hx, hy] = hole.cup;
  ctx.fillStyle = '#0a1a10';
  ctx.beginPath();
  ctx.arc(hx, hy, HOLE_R, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  const near = Math.hypot(ball.x - hx, ball.y - hy) < 70 && phase !== 'aim';
  ctx.globalAlpha = near ? 0.35 : 1;
  ctx.fillStyle = '#eee';
  ctx.fillRect(hx - 1, hy - 46, 2, 46);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(hx + 1, hy - 46);
  ctx.lineTo(hx + 22 + Math.sin(time * 4) * 2, hy - 39);
  ctx.lineTo(hx + 1, hy - 32);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Tee
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(hole.tee[0] - 12, hole.tee[1] - 2, 24, 4);

  // Windmill
  const m = hole.windmill;
  if (m) {
    // Door: a glowing bar when shut, a faint dashed line when open.
    if (doorShut()) {
      ctx.strokeStyle = '#ff3d9a';
      ctx.shadowColor = '#ff3d9a';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y0);
      ctx.lineTo(m.x, m.y1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y0);
      ctx.lineTo(m.x, m.y1);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // The house sits on the wall above the door; blades spin over it.
    const hx = m.x;
    const hy = m.y0 - 34;
    ctx.fillStyle = '#a0522d';
    ctx.beginPath();
    ctx.roundRect(hx - 20, hy - 18, 40, 36, 4);
    ctx.fill();
    ctx.fillStyle = '#7a3a1d';
    ctx.beginPath();
    ctx.moveTo(hx - 24, hy - 16);
    ctx.lineTo(hx, hy - 32);
    ctx.lineTo(hx + 24, hy - 16);
    ctx.fill();
    ctx.strokeStyle = '#f4f0e0';
    ctx.lineWidth = 6;
    // Blades are lined up with the door: one points straight down while it's shut.
    const spin = windAngle * Math.PI * 2 * 0.25;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 2 - Math.PI * 0.25 * DOOR_SHUT + spin + (k * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(a) * 44, hy + Math.sin(a) * 44);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff3d9a';
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, TAU);
    ctx.fill();
  }

  // Aim guide
  if (phase === 'aim' && aim && shell.state === 'playing') {
    const dx = ball.x - aim.x;
    const dy = ball.y - aim.y;
    const len = Math.hypot(dx, dy);
    const power = clamp(len / AIM_RANGE, 0, 1);
    if (len > 2) {
      const ux = dx / len;
      const uy = dy / len;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(ball.x + ux * (30 + power * 200), ball.y + uy * (30 + power * 200));
      ctx.stroke();
      ctx.setLineDash([]);
      const color = power < 0.5 ? '#4dff88' : power < 0.8 ? '#ffd23f' : '#ff3d9a';
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 16, -Math.PI / 2, -Math.PI / 2 + TAU * power);
      ctx.stroke();
    }
  }

  // Ball
  if (phase !== 'splash' && ball.scale > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 3, BALL_R * ball.scale, BALL_R * 0.7 * ball.scale, 0, 0, TAU);
    ctx.fill();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R * ball.scale, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (phase === 'aim' && !aim && shell.state === 'playing' && strokes === 0 && holeIndex === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Drag back from the ball direction, then let go', W / 2, H - 22);
  }

  if (banner && banner.t > 0 && shell.state === 'playing') {
    ctx.globalAlpha = clamp(banner.t * 2, 0, 1);
    ctx.fillStyle = 'rgba(6,20,12,0.7)';
    ctx.beginPath();
    ctx.roundRect(W / 2 - 190, 18, 380, 70, 14);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.font = '900 28px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(banner.text, W / 2, 44);
    ctx.fillStyle = '#d8f5e2';
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(banner.sub, W / 2, 72);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }
}

shell.debug = () => ({ ball, phase, strokes, holeIndex, hole, card, shoot, setHole: (i) => { holeIndex = i; loadHole(); } });
shell.boot();
