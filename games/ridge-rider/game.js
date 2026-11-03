// Ridge Rider — dirt bike hill racing with Planck.js physics. Race three bots, earn tokens,
// and spend them in the garage. Progress is saved in this browser (localStorage).

import { World, Vec2, Box, Circle, Chain, WheelJoint } from '../../vendor/planck.mjs';
import { createShell } from '../../shared/shell.js';
import { KEYS } from '../../shared/input.js';
import { sfx, tone, noise } from '../../shared/audio.js';
import { clamp, lerp, seeded, TAU } from '../../shared/util.js';

const W = 960;
const H = 540;
const SCALE = 38; // px per meter
const STEP = 1 / 60;

// ---------- Save data ----------

const SAVE_KEY = 'gc-ridge-rider';
const SAVE_VERSION = 1;
const MAX_LEVEL = 5;
const UPGRADE_COSTS = [40, 80, 140, 220, 320];
const UPGRADES = {
  engine: { name: 'Engine', desc: 'Top speed and pulling power' },
  grip: { name: 'Grip', desc: 'Tires that bite on steep climbs' },
  suspension: { name: 'Suspension', desc: 'Softer landings, better balance' },
  fuel: { name: 'Fuel Tank', desc: 'Ride longer between cans' },
};
const UPGRADE_KEYS = Object.keys(UPGRADES);

const defaultSave = () => ({ version: SAVE_VERSION, tokens: 0, upgrades: { engine: 0, grip: 0, suspension: 0, fuel: 0 }, tracksUnlocked: 1 });

function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || data.version !== SAVE_VERSION) return defaultSave();
    const base = defaultSave();
    return { ...base, ...data, upgrades: { ...base.upgrades, ...data.upgrades } };
  } catch {
    return defaultSave();
  }
}

let storageOk = true;
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    storageOk = true;
  } catch {
    storageOk = false; // progress still lasts for this visit
  }
}

// ---------- Tracks and racers ----------

const TRACKS = [
  { name: 'Meadow Run', length: 450, amps: [2.2, 0.9, 0.25], freqs: [0.035, 0.1, 0.27], seed: 3, sky: ['#3a7bd5', '#a8e0ff'], hills: '#5a9a6a', dirt: '#6a4a2a', grass: '#5ccc4a', bot: 1 },
  { name: 'Canyon Hops', length: 600, amps: [3.2, 1.8, 0.45], freqs: [0.03, 0.13, 0.32], seed: 11, sky: ['#d06a3a', '#ffd0a0'], hills: '#a05a3a', dirt: '#8a4a2a', grass: '#d0a050', bot: 2.5 },
  { name: 'Ridge Peaks', length: 750, amps: [6, 2.2, 0.5], freqs: [0.02, 0.075, 0.24], seed: 29, sky: ['#2a1a4a', '#ff8a5a'], hills: '#5a2a5a', dirt: '#3a2214', grass: '#7a5aa0', bot: 4 },
];
const PRIZES = [60, 35, 20, 10];
const RACERS = [
  { name: 'You', color: '#ff5a5a' },
  { name: 'Dusty', color: '#2de2e6' },
  { name: 'Rook', color: '#ffd23f' },
  { name: 'Vee', color: '#b26bff' },
];
const START_FLAT = 25; // meters of flat ground at the start
const COIN_EVERY = 14;
const FUEL_EVERY = 110;
const CHECKPOINT_EVERY = 50;
const FUEL_BURN = 4.5; // per second of throttle
const RESPAWN_TIME = 1.2;
const STUCK_TIME = 1.6;
const OUT_OF_FUEL_TIME = 3;
const RUBBER_BAND = 25; // meters

const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n] || 'th'}`;

function bikeStats(levels) {
  return {
    maxSpeed: 28 + levels.engine * 4, // wheel rad/s
    torque: 4 + levels.engine * 1.1,
    friction: 0.85 + levels.grip * 0.16,
    hz: 4 + levels.suspension * 0.45,
    damping: 0.55 + levels.suspension * 0.07,
    lean: 2.4 + levels.suspension * 0.3,
    tank: 100 * (1 + levels.fuel * 0.25),
  };
}

// ---------- State ----------

let save = loadSave();
let phase, selectedTrack, track, heightFn, world, racers, player, coins, fuelCans, camX, camY, countdown, finishTimer;
let resetArmed, garageMsg, time, results, particles;

const shell = createShell({
  title: 'Ridge Rider',
  tagline: 'Race the hills. Win tokens. Upgrade your bike.',
  width: W,
  height: H,
  accent: '#ff5a5a',
  help: [
    ['→ / D', 'Gas (leans back in the air)'],
    ['← / A', 'Brake / reverse (leans forward)'],
    ['1 – 4', 'Garage: buy upgrades'],
    ['Enter', 'Garage: start the race'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Hold the right side for gas, left side to brake',
  init,
  update,
  render,
});

function init() {
  save = loadSave();
  phase = 'garage';
  selectedTrack = Math.min(selectedTrack ?? 0, save.tracksUnlocked - 1);
  resetArmed = 0;
  garageMsg = null;
  time = 0;
  particles = [];
  world = null;
  updateStats();
}

function updateStats() {
  if (phase === 'race' || phase === 'countdown' || phase === 'finished') {
    const place = placeOf(player);
    shell.setStats({ Place: `${ordinal(place)}/4`, Tokens: save.tokens });
  } else {
    shell.setStats({ Tokens: save.tokens });
  }
}

// ---------- Track ----------

function makeHeightFn(t) {
  const rnd = seeded(t.seed);
  const phases = t.amps.map(() => rnd() * TAU);
  return (x) => {
    if (x < START_FLAT) return 0;
    const u = x - START_FLAT;
    const ramp = Math.min(1, u / 120) * 0.6 + 0.4;
    let y = 0;
    t.amps.forEach((a, i) => (y += a * Math.sin(u * t.freqs[i] + phases[i]) - a * Math.sin(phases[i])));
    // Blend in smoothly from the flat start.
    return y * ramp * Math.min(1, u / 15);
  };
}

function setupRace() {
  track = TRACKS[selectedTrack];
  heightFn = makeHeightFn(track);
  world = new World({ gravity: Vec2(0, -10) });

  const pts = [];
  for (let x = -40; x <= track.length + 80; x += 1) pts.push(Vec2(x, x < -30 ? 8 : heightFn(x)));
  const ground = world.createBody();
  ground.createFixture(new Chain(pts, false), { friction: 0.9, userData: { ground: true } });

  racers = RACERS.map((r, i) => {
    const levels = i === 0 ? save.upgrades : botLevels(i);
    const racer = { ...r, index: i, stats: bikeStats(levels), fuel: 0, crashed: 0, stuck: 0, outOfFuel: 0, finished: 0, coins: 0, checkpoint: 0 };
    racer.fuel = racer.stats.tank;
    createBike(racer, 4 - i * 2.4);
    return racer;
  });
  player = racers[0];

  world.on('begin-contact', (contact) => {
    for (const f of [contact.getFixtureA(), contact.getFixtureB()]) {
      const other = f === contact.getFixtureA() ? contact.getFixtureB() : contact.getFixtureA();
      const head = f.getUserData()?.head;
      if (head && other.getUserData()?.ground && !head.crashed && !head.finished) crash(head);
    }
  });

  coins = [];
  for (let x = 40; x < track.length - 10; x += COIN_EVERY) coins.push({ x, y: heightFn(x) + 1.3, taken: false });
  fuelCans = [];
  for (let x = FUEL_EVERY; x < track.length - 30; x += FUEL_EVERY) fuelCans.push({ x, y: heightFn(x) + 0.9, taken: false });

  camX = player.chassis.getPosition().x;
  camY = player.chassis.getPosition().y;
  countdown = 3;
  phase = 'countdown';
  finishTimer = 0;
  results = [];
  updateStats();
}

function botLevels(i) {
  const base = track.bot + (i - 2) * 0.6;
  const lv = clamp(Math.round(base), 0, MAX_LEVEL);
  return { engine: lv, grip: clamp(lv + 1, 0, MAX_LEVEL), suspension: lv, fuel: 0 };
}

const BIKE = { hx: 0.55, hy: 0.12, wheelR: 0.34, wheelX: 0.62, wheelY: -0.48 };

function createBike(racer, x) {
  const y = heightFn(x) + 1.05;
  const s = racer.stats;
  const filter = { filterGroupIndex: -1 }; // bikes never collide with each other
  const chassis = world.createDynamicBody({ position: Vec2(x, y) });
  chassis.createFixture(new Box(BIKE.hx, BIKE.hy), { density: 3.5, friction: 0.4, ...filter });
  chassis.createFixture(new Box(0.1, 0.27, Vec2(-0.12, 0.4), 0.2), { density: 0.4, ...filter });
  chassis.createFixture(new Circle(Vec2(-0.02, 0.8), 0.17), { density: 0.3, userData: { head: racer }, ...filter });
  const wheel = (dx) => {
    const b = world.createDynamicBody({ position: Vec2(x + dx, y + BIKE.wheelY) });
    b.createFixture(new Circle(BIKE.wheelR), { density: 1.1, friction: s.friction, restitution: 0.05, ...filter });
    return b;
  };
  const rear = wheel(-BIKE.wheelX);
  const front = wheel(BIKE.wheelX);
  const jointDef = { motorSpeed: 0, maxMotorTorque: s.torque, enableMotor: false, frequencyHz: s.hz, dampingRatio: s.damping };
  racer.rearJ = world.createJoint(new WheelJoint(jointDef, chassis, rear, rear.getPosition(), Vec2(0, 1)));
  racer.frontJ = world.createJoint(new WheelJoint({ ...jointDef, maxMotorTorque: s.torque * 0.6 }, chassis, front, front.getPosition(), Vec2(0, 1)));
  Object.assign(racer, { chassis, rear, front });
}

function placeBike(racer, x) {
  const y = heightFn(x) + 1.05;
  const slope = Math.atan2(heightFn(x + 0.6) - heightFn(x - 0.6), 1.2);
  const set = (body, dx, dy) => {
    body.setTransform(Vec2(x + dx * Math.cos(slope) - dy * Math.sin(slope), y + dx * Math.sin(slope) + dy * Math.cos(slope)), slope);
    body.setLinearVelocity(Vec2(0, 0));
    body.setAngularVelocity(0);
    body.setAwake(true);
  };
  set(racer.chassis, 0, 0);
  set(racer.rear, -BIKE.wheelX, BIKE.wheelY);
  set(racer.front, BIKE.wheelX, BIKE.wheelY);
}

function crash(racer) {
  racer.crashed = RESPAWN_TIME;
  if (racer === player) {
    sfx('hurt');
    noise({ dur: 0.3, vol: 0.2, freq: 900 });
  }
  const p = racer.chassis.getPosition();
  for (let i = 0; i < 12; i++) particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5, life: 0.8, color: racer.color });
}

const posX = (r) => r.chassis.getPosition().x;

function placeOf(racer) {
  // Finished racers rank by finish order, everyone else by distance.
  const sorted = [...racers].sort((a, b) => (a.finished && b.finished ? a.finished - b.finished : a.finished ? -1 : b.finished ? 1 : posX(b) - posX(a)));
  return sorted.indexOf(racer) + 1;
}

// ---------- Driving ----------

function drive(racer, gas, brake, leanInput) {
  const s = racer.stats;
  const rj = racer.rearJ;
  const fj = racer.frontJ;
  const canGas = gas && racer.fuel > 0;
  if (canGas) {
    rj.enableMotor(true);
    rj.setMotorSpeed(-s.maxSpeed * (racer.speedMul || 1));
    rj.setMaxMotorTorque(s.torque);
    fj.enableMotor(false);
  } else if (brake) {
    rj.enableMotor(true);
    rj.setMotorSpeed(s.maxSpeed * 0.35);
    rj.setMaxMotorTorque(s.torque * 0.8);
    fj.enableMotor(true);
    fj.setMotorSpeed(0);
    fj.setMaxMotorTorque(s.torque * 0.4);
  } else {
    rj.enableMotor(false);
    fj.enableMotor(false);
  }
  // Leaning is strong in the air and gentle with wheels on the ground.
  if (leanInput) racer.chassis.applyTorque(leanInput * s.lean * (onGround(racer) ? GROUND_LEAN : 1), true);
}

const GROUND_LEAN = 0.2;

function touching(body) {
  for (let ce = body.getContactList(); ce; ce = ce.next) if (ce.contact.isTouching()) return true;
  return false;
}

const onGround = (r) => touching(r.rear) || touching(r.front);

function botControl(r) {
  const p = r.chassis.getPosition();
  const angle = Math.atan2(Math.sin(r.chassis.getAngle()), Math.cos(r.chassis.getAngle()));
  const slope = Math.atan2(heightFn(p.x + 2) - heightFn(p.x - 1), 3);
  const diff = p.x - posX(player);
  // Rubber-banding keeps races close.
  r.speedMul = diff > RUBBER_BAND ? 0.8 : diff < -RUBBER_BAND ? 1.18 : 1;
  const tilt = angle - slope;
  const gas = tilt < 0.5;
  // Bots correct their balance directly toward the slope.
  r.chassis.applyTorque(clamp(-tilt * 6, -1, 1) * r.stats.lean, true);
  drive(r, gas, false, 0);
}

function updateRacer(r, dt) {
  if (r.finished) {
    drive(r, false, true, 0);
    return;
  }
  const p = r.chassis.getPosition();
  if (p.x > r.checkpoint + CHECKPOINT_EVERY) r.checkpoint = Math.floor(p.x / CHECKPOINT_EVERY) * CHECKPOINT_EVERY;

  if (r.crashed > 0) {
    drive(r, false, false, 0);
    r.crashed -= dt;
    if (r.crashed <= 0) {
      placeBike(r, Math.max(4, r.checkpoint || p.x - 4));
      r.crashed = 0;
      r.stuck = 0;
    }
    return;
  }

  // Upside-down and barely moving counts as a crash.
  const up = Math.cos(r.chassis.getAngle());
  const speed = r.chassis.getLinearVelocity().length();
  if (up < -0.2 && speed < 1.5) {
    r.stuck += dt;
    if (r.stuck > STUCK_TIME) crash(r);
  } else r.stuck = 0;

  if (p.x >= track.length) {
    r.finished = performance.now();
    if (r === player) {
      sfx('win');
      phase = 'finished';
      finishTimer = 1.6;
    }
  }
}

function update(dt) {
  const { input } = shell;
  time += dt;
  for (const q of particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy -= 12 * dt;
    q.life -= dt;
  }
  particles = particles.filter((q) => q.life > 0);

  if (phase === 'garage') return updateGarage();

  const p = input.pointer;
  const gas = input.down(KEYS.right) || (p.down && p.x > W / 2);
  const brake = input.down(KEYS.left) || (p.down && p.x <= W / 2);

  if (phase === 'countdown') {
    const before = Math.ceil(countdown);
    countdown -= dt;
    if (Math.ceil(countdown) !== before) tone({ freq: countdown <= 0 ? 880 : 440, dur: 0.18, type: 'square', vol: 0.1 });
    if (countdown <= 0) phase = 'race';
    world.step(STEP, 8, 3); // let suspensions settle on the grid
    return;
  }

  // Player
  if (!player.finished && !player.crashed) {
    const lean = gas && !brake ? 1 : brake && !gas ? -1 : 0;
    drive(player, gas, brake, lean);
    if (gas && player.fuel > 0) {
      player.fuel = Math.max(0, player.fuel - FUEL_BURN * dt);
      if (Math.floor(time * 12) % 2 === 0 && Math.floor((time - dt) * 12) % 2 === 1) {
        const v = Math.abs(player.rear.getAngularVelocity());
        tone({ freq: 60 + v * 4, dur: 0.07, type: 'sawtooth', vol: 0.04 });
      }
    }
  }
  for (const r of racers) {
    if (r !== player && !r.crashed && !r.finished) botControl(r);
    updateRacer(r, dt);
  }
  world.step(STEP, 8, 3);

  // Pickups (player only)
  const pp = player.chassis.getPosition();
  for (const c of coins) {
    if (!c.taken && Math.abs(c.x - pp.x) < 1 && Math.abs(c.y - pp.y) < 1.4) {
      c.taken = true;
      player.coins++;
      tone({ freq: 1200, to: 1600, dur: 0.08, type: 'square', vol: 0.06 });
    }
  }
  for (const f of fuelCans) {
    if (!f.taken && Math.abs(f.x - pp.x) < 1.2 && Math.abs(f.y - pp.y) < 1.6) {
      f.taken = true;
      player.fuel = player.stats.tank;
      sfx('powerup');
    }
  }

  // Out of fuel and rolled to a stop: race over.
  if (phase === 'race' && player.fuel <= 0 && !player.finished) {
    if (player.chassis.getLinearVelocity().length() < 0.6) player.outOfFuel += dt;
    else player.outOfFuel = 0;
    if (player.outOfFuel > OUT_OF_FUEL_TIME) return endRace(true);
  }

  if (phase === 'finished') {
    finishTimer -= dt;
    if (finishTimer <= 0) return endRace(false);
  }

  // Camera
  const target = { x: pp.x + 5, y: pp.y + 1.5 };
  camX = lerp(camX, target.x, Math.min(1, dt * 4));
  camY = lerp(camY, target.y, Math.min(1, dt * 3));
  updateStats();
}

function endRace(outOfFuel) {
  const place = outOfFuel ? 4 : placeOf(player);
  const prize = outOfFuel ? 5 : PRIZES[place - 1];
  const earned = prize + player.coins;
  save.tokens += earned;
  let unlocked = '';
  if (place === 1 && selectedTrack === save.tracksUnlocked - 1 && save.tracksUnlocked < TRACKS.length) {
    save.tracksUnlocked++;
    unlocked = ` New track unlocked: ${TRACKS[save.tracksUnlocked - 1].name}!`;
  }
  writeSave();
  shell.setScore(earned);
  updateStats();
  if (place === 1) sfx('win');
  else sfx(outOfFuel ? 'lose' : 'coin');
  shell.gameOver({
    title: outOfFuel ? 'Out of Fuel' : place === 1 ? 'You Win!' : `${ordinal(place)} Place`,
    win: place === 1 && !outOfFuel,
    message: `${track.name}: +${prize} prize${player.coins ? ` +${player.coins} coin${player.coins === 1 ? '' : 's'}` : ''} = ${earned} tokens (you have ${save.tokens}).${unlocked}${storageOk ? '' : ' Saving is blocked in this browser, so progress lasts this visit only.'}`,
  });
}

// ---------- Garage ----------

const GARAGE = {
  upgrade: (i) => ({ x: 500, y: 70 + i * 82, w: 430, h: 72 }),
  buy: (i) => ({ x: 790, y: 82 + i * 82, w: 128, h: 48 }),
  track: (i) => ({ x: 30 + i * 150, y: 372, w: 140, h: 96 }),
  race: { x: 720, y: 420, w: 210, h: 70 },
  reset: { x: 30, y: 492, w: 150, h: 30 },
};
const inBox = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

function tryUpgrade(key) {
  const lv = save.upgrades[key];
  if (lv >= MAX_LEVEL) return;
  const cost = UPGRADE_COSTS[lv];
  if (save.tokens < cost) {
    sfx('hit');
    garageMsg = { text: `Need ${cost - save.tokens} more tokens`, t: 1.6 };
    return;
  }
  save.tokens -= cost;
  save.upgrades[key]++;
  writeSave();
  sfx('powerup');
  garageMsg = { text: `${UPGRADES[key].name} upgraded to level ${save.upgrades[key]}!`, t: 1.6 };
  updateStats();
}

function updateGarage() {
  const { input } = shell;
  const p = input.pointer;
  if (garageMsg) {
    garageMsg.t -= STEP;
    if (garageMsg.t <= 0) garageMsg = null;
  }
  resetArmed = Math.max(0, resetArmed - STEP);
  UPGRADE_KEYS.forEach((k, i) => input.pressed(`Digit${i + 1}`) && tryUpgrade(k));
  if (input.pressed(KEYS.left)) selectedTrack = Math.max(0, selectedTrack - 1);
  if (input.pressed(KEYS.right)) selectedTrack = Math.min(save.tracksUnlocked - 1, selectedTrack + 1);
  if (input.pressed('Enter', 'Space')) return setupRace();

  if (!p.released) return;
  UPGRADE_KEYS.forEach((k, i) => inBox(p, GARAGE.buy(i)) && tryUpgrade(k));
  TRACKS.forEach((t, i) => {
    if (!inBox(p, GARAGE.track(i))) return;
    if (i < save.tracksUnlocked) {
      selectedTrack = i;
      sfx('blip');
    } else garageMsg = { text: `Win ${TRACKS[i - 1].name} to unlock`, t: 1.6 };
  });
  if (inBox(p, GARAGE.race)) return setupRace();
  if (inBox(p, GARAGE.reset)) {
    if (resetArmed > 0) {
      save = defaultSave();
      writeSave();
      selectedTrack = 0;
      resetArmed = 0;
      garageMsg = { text: 'Progress reset', t: 1.6 };
      updateStats();
    } else {
      resetArmed = 3;
      sfx('hit');
    }
  }
}

// ---------- Drawing ----------

function drawBikeAt(ctx, toScreen, chassisPos, chassisAngle, rearPos, frontPos, wheelAngle, color, scale) {
  const local = (lx, ly) => {
    const c = Math.cos(chassisAngle);
    const s = Math.sin(chassisAngle);
    return toScreen(chassisPos.x + lx * c - ly * s, chassisPos.y + lx * s + ly * c);
  };
  const wheel = (wp) => {
    const [x, y] = toScreen(wp.x, wp.y);
    const r = BIKE.wheelR * scale;
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = r * 0.35;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#9aa3c7';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const a = -wheelAngle + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.65, y + Math.sin(a) * r * 0.65);
      ctx.lineTo(x - Math.cos(a) * r * 0.65, y - Math.sin(a) * r * 0.65);
      ctx.stroke();
    }
    return [x, y];
  };
  const [rx, ry] = wheel(rearPos);
  const [fx, fy] = wheel(frontPos);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Frame
  const seat = local(-0.15, 0.12);
  const bars = local(0.45, 0.32);
  const engine = local(0.05, -0.1);
  ctx.strokeStyle = color;
  ctx.lineWidth = scale * 0.11;
  ctx.beginPath();
  ctx.moveTo(rx, ry);
  ctx.lineTo(...engine);
  ctx.lineTo(...bars);
  ctx.lineTo(fx, fy);
  ctx.moveTo(rx, ry);
  ctx.lineTo(...seat);
  ctx.lineTo(...engine);
  ctx.stroke();
  ctx.fillStyle = '#222';
  const [ex, ey] = engine;
  ctx.fillRect(ex - scale * 0.12, ey - scale * 0.08, scale * 0.24, scale * 0.16);
  // Rider
  const hip = local(-0.12, 0.2);
  const shoulder = local(-0.02, 0.6);
  const head = local(-0.02, 0.8);
  ctx.strokeStyle = '#ece9ff';
  ctx.lineWidth = scale * 0.13;
  ctx.beginPath();
  ctx.moveTo(...hip);
  ctx.lineTo(...shoulder);
  ctx.lineTo(...bars);
  ctx.moveTo(...hip);
  ctx.lineTo(...local(0.15, -0.05));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(head[0], head[1], scale * 0.17, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,20,40,0.8)';
  ctx.beginPath();
  ctx.arc(head[0] + scale * 0.06, head[1], scale * 0.08, -1, 1);
  ctx.fill();
}

function drawRacer(ctx, r, toScreen) {
  const blink = r.crashed > 0 && Math.floor(time * 10) % 2;
  if (blink) return;
  ctx.globalAlpha = r === player ? 1 : 0.85;
  drawBikeAt(ctx, toScreen, r.chassis.getPosition(), r.chassis.getAngle(), r.rear.getPosition(), r.front.getPosition(), r.rear.getAngle(), r.color, SCALE);
  ctx.globalAlpha = 1;
  if (r !== player) {
    const [x, y] = toScreen(r.chassis.getPosition().x, r.chassis.getPosition().y + 1.4);
    ctx.fillStyle = r.color;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(r.name, x, y);
  }
}

function drawSky(ctx, t, offset) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t.sky[0]);
  g.addColorStop(1, t.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,240,200,0.8)';
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.22, 34, 0, TAU);
  ctx.fill();
  for (const [depth, alpha, base, amp] of [[0.1, 0.5, H * 0.55, 50], [0.25, 0.85, H * 0.68, 36]]) {
    ctx.fillStyle = t.hills;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) {
      const wx = x + offset * depth * SCALE;
      ctx.lineTo(x, base - Math.sin(wx * 0.006) * amp - Math.sin(wx * 0.017) * amp * 0.4);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderRace(ctx) {
  const toScreen = (x, y) => [(x - camX) * SCALE + W * 0.4, H * 0.55 - (y - camY) * SCALE];
  drawSky(ctx, track, camX);

  // Terrain
  const x0 = camX - (W * 0.4) / SCALE - 2;
  const x1 = camX + (W * 0.6) / SCALE + 2;
  ctx.beginPath();
  ctx.moveTo(...toScreen(x0, camY - 40));
  for (let x = Math.floor(x0); x <= x1; x += 0.5) ctx.lineTo(...toScreen(x, heightFn(x)));
  ctx.lineTo(...toScreen(x1, camY - 40));
  ctx.closePath();
  const dirt = ctx.createLinearGradient(0, H * 0.4, 0, H);
  dirt.addColorStop(0, track.dirt);
  dirt.addColorStop(1, '#1a0e06');
  ctx.fillStyle = dirt;
  ctx.fill();
  ctx.strokeStyle = track.grass;
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let x = Math.floor(x0); x <= x1; x += 0.5) ctx[x === Math.floor(x0) ? 'moveTo' : 'lineTo'](...toScreen(x, heightFn(x)));
  ctx.stroke();

  // Checkpoints and finish
  for (let cx = CHECKPOINT_EVERY; cx < track.length; cx += CHECKPOINT_EVERY) {
    if (cx < x0 || cx > x1) continue;
    const [sx, sy] = toScreen(cx, heightFn(cx));
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(sx - 1, sy - 50, 2, 50);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(sx + 1, sy - 50, 16, 10);
  }
  if (track.length > x0 && track.length < x1 + 4) {
    const [sx, sy] = toScreen(track.length, heightFn(track.length));
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 3, sy - 110, 6, 110);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      ctx.fillRect(sx + 3 + j * 8, sy - 110 + i * 8, 8, 8);
    }
  }

  // Pickups
  for (const c of coins) {
    if (c.taken || c.x < x0 || c.x > x1) continue;
    const [sx, sy] = toScreen(c.x, c.y + Math.sin(time * 4 + c.x) * 0.1);
    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 8 * Math.abs(Math.cos(time * 3 + c.x)) + 2, 9, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (const f of fuelCans) {
    if (f.taken || f.x < x0 || f.x > x1) continue;
    const [sx, sy] = toScreen(f.x, f.y);
    ctx.fillStyle = '#e03a3a';
    ctx.beginPath();
    ctx.roundRect(sx - 10, sy - 13, 20, 26, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('F', sx, sy + 5);
  }

  for (const r of racers) if (r !== player) drawRacer(ctx, r, toScreen);
  drawRacer(ctx, player, toScreen);

  for (const q of particles) {
    const [sx, sy] = toScreen(q.x, q.y);
    ctx.globalAlpha = clamp(q.life * 1.5, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // HUD: progress bar with racer markers
  const barX = 200;
  const barW = W - 400;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(barX, 14, barW, 10, 5);
  ctx.fill();
  for (const r of [...racers].reverse()) {
    const t = clamp(posX(r) / track.length, 0, 1);
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(barX + t * barW, 19, r === player ? 8 : 6, 0, TAU);
    ctx.fill();
  }
  // Fuel gauge
  const fuelT = player.fuel / player.stats.tank;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.roundRect(16, H - 36, 180, 20, 6);
  ctx.fill();
  ctx.fillStyle = fuelT > 0.3 ? '#4dff88' : fuelT > 0.12 ? '#ffd23f' : '#ff5a5a';
  ctx.fillRect(20, H - 32, 172 * fuelT, 12);
  ctx.fillStyle = '#fff';
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('FUEL', 22, H - 42);
  // Speed + place
  const kmh = Math.round(player.chassis.getLinearVelocity().length() * 3.6);
  ctx.textAlign = 'right';
  ctx.font = '800 26px ui-monospace, monospace';
  ctx.fillText(`${kmh}`, W - 60, H - 18);
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText('km/h', W - 18, H - 20);
  ctx.textAlign = 'left';
  ctx.font = '900 30px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(ordinal(placeOf(player)), 16, 42);

  if (phase === 'countdown') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#ff5a5a';
    ctx.shadowBlur = 20;
    ctx.font = '900 90px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(Math.ceil(countdown), W / 2, H * 0.42);
    ctx.shadowBlur = 0;
  } else if (phase === 'race' && time < 0) {
    // (unused)
  }
  if (player.fuel <= 0 && phase === 'race') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5a5a';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillText('Out of fuel — coast for it!', W / 2, 70);
  }
  if (phase === 'finished') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 10;
    ctx.font = '900 54px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText('FINISH!', W / 2, H * 0.38);
    ctx.shadowBlur = 0;
  }
}

function button(ctx, b, label, { enabled = true, primary = false, color = '#ff5a5a' } = {}) {
  ctx.fillStyle = primary && enabled ? color : '#1c1838';
  ctx.strokeStyle = enabled ? (primary ? color : '#4a4386') : '#2a2650';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(b.x, b.y, b.w, b.h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = primary && enabled ? '#1a0a0a' : enabled ? '#ece9ff' : '#5a5480';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${primary ? 22 : 13}px system-ui, sans-serif`;
  ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
}

function renderGarage(ctx) {
  const t = TRACKS[selectedTrack];
  drawSky(ctx, t, time * 2);
  ctx.fillStyle = 'rgba(8,6,20,0.72)';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff5a5a';
  ctx.font = '900 34px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText('GARAGE', 30, 50);
  ctx.fillStyle = '#ffd23f';
  ctx.font = '800 22px ui-monospace, monospace';
  ctx.fillText(`${save.tokens} tokens`, 220, 48);

  // Bike preview on a little stand
  const pv = { x: 0, y: 0 };
  const toScreen = (x, y) => [210 + x * 110, 230 - y * 110];
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.ellipse(210, 300, 170, 18, 0, 0, TAU);
  ctx.fill();
  drawBikeAt(ctx, toScreen, pv, 0, { x: -BIKE.wheelX, y: BIKE.wheelY }, { x: BIKE.wheelX, y: BIKE.wheelY }, time * 2, '#ff5a5a', 110);
  const s = bikeStats(save.upgrades);
  ctx.fillStyle = '#9d97c9';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Top speed ${Math.round(s.maxSpeed * BIKE.wheelR * 3.6)} km/h · Tank ${Math.round(s.tank)}`, 210, 336);

  // Upgrades
  UPGRADE_KEYS.forEach((k, i) => {
    const b = GARAGE.upgrade(i);
    const lv = save.upgrades[k];
    ctx.fillStyle = 'rgba(28,24,56,0.9)';
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ece9ff';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillText(`${i + 1} · ${UPGRADES[k].name}`, b.x + 16, b.y + 26);
    ctx.fillStyle = '#9d97c9';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(UPGRADES[k].desc, b.x + 16, b.y + 45);
    for (let p = 0; p < MAX_LEVEL; p++) {
      ctx.fillStyle = p < lv ? '#ff5a5a' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.x + 16 + p * 26, b.y + 54, 22, 7);
    }
    const maxed = lv >= MAX_LEVEL;
    const cost = maxed ? 0 : UPGRADE_COSTS[lv];
    button(ctx, GARAGE.buy(i), maxed ? 'MAXED' : `Upgrade · ${cost}`, { enabled: !maxed && save.tokens >= cost });
  });

  // Tracks
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9d97c9';
  ctx.font = '700 12px ui-monospace, monospace';
  ctx.fillText('TRACK  (← →)', 30, 362);
  TRACKS.forEach((tr, i) => {
    const b = GARAGE.track(i);
    const locked = i >= save.tracksUnlocked;
    const sel = i === selectedTrack;
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, tr.sky[0]);
    g.addColorStop(1, tr.dirt);
    ctx.fillStyle = g;
    ctx.globalAlpha = locked ? 0.35 : 1;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = sel ? 3 : 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillText(tr.name, b.x + 10, b.y + 24);
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText(locked ? '🔒 Win the last track' : `${tr.length} m`, b.x + 10, b.y + 44);
  });

  button(ctx, GARAGE.race, 'RACE ▶', { primary: true });
  ctx.fillStyle = '#9d97c9';
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Enter / Space', GARAGE.race.x + GARAGE.race.w / 2, GARAGE.race.y + GARAGE.race.h + 18);

  ctx.textAlign = 'left';
  ctx.fillStyle = resetArmed > 0 ? '#ff5a5a' : 'rgba(157,151,201,0.7)';
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillText(resetArmed > 0 ? 'Click again to reset all progress' : 'Reset progress', GARAGE.reset.x, GARAGE.reset.y + 20);

  if (garageMsg) {
    ctx.globalAlpha = clamp(garageMsg.t * 2, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.fillText(garageMsg.text, 640, 400);
    ctx.globalAlpha = 1;
  }
}

function render(ctx) {
  if (phase === 'garage' || !world) renderGarage(ctx);
  else renderRace(ctx);
}

shell.debug = () => ({
  phase, save, player, racers, track,
  setTokens: (n) => { save.tokens = n; writeSave(); updateStats(); },
  teleport: (x) => placeBike(player, x),
});
shell.boot();
