// Hollow Maze — a foggy 3D maze chase. Collect every orb while four hunters stalk you;
// power orbs turn the tables. A new maze is generated every level, and the hunters'
// look changes with the holiday calendar (see events.js / themes.js).

import * as THREE from '../../vendor/three.module.min.js';
import { createShell } from '../../shared/shell.js';
import { KEYS } from '../../shared/input.js';
import { sfx, tone } from '../../shared/audio.js';
import { clamp, lerp, shuffle } from '../../shared/util.js';
import { chooseEvent, EVENTS } from './events.js';
import { THEMES, CHARACTERS, buildCharacter, orbGeometry, part } from './themes.js';

const EVENT_ID = chooseEvent();
const THEME = THEMES[EVENT_ID];
const EVENT_NAME = EVENTS.find((e) => e.id === EVENT_ID)?.name;

const W = 960;
const H = 600;
const CELLS = 9; // maze cells per side
const N = CELLS * 2 + 1; // tiles per side (walls + cells)
const CENTER = Math.floor(N / 2);
const WALL_H = 1.5;
const EXTRA_LOOPS = 0.1; // chance to knock out an inner wall for extra routes

const PLAYER_R = 0.26;
const TURN_SPEED = 2.9; // rad/s
const BACK_FACTOR = 0.6;
const ALIGN_PULL = 7; // keeps the player centered in corridors
const CAM_DIST = 2.3;
const CAM_HEIGHT = 1.3;
const CAM_HIGH = 1.15; // camera height when pulled in tight (always below the walls)
const FIRST_PERSON = 0.75; // closer than this, hide the player model

const HUNTER_SPEED = 2.7; // tiles/s
const FRIGHT_SPEED = 1.7;
const EATEN_SPEED = 6;
const LEVEL_SPEEDUP = 0.06;
const RELEASE_TIMES = [0.5, 3, 6, 9];
const PHASES = [['scatter', 7], ['chase', 20], ['scatter', 7], ['chase', 20], ['scatter', 5], ['chase', Infinity]];
const POWER_TIME = 7;
const CATCH_DIST = 0.55;
const HEAR_RANGE = 7; // tiles
const START_LIVES = 3;
const ORB_POINTS = 10;
const POWER_POINTS = 50;
const EAT_POINTS = 200;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CORNERS = [[N - 2, 1], [1, 1], [N - 2, N - 2], [1, N - 2]];

let renderer, scene, camera, light, levelGroup, playerMesh;
let grid, orbs, orbMesh, orbsLeft, powerOrbs, player, hunters, level, lives, phaseIndex, phaseTime;
let powerTimer, eatChain, dying, time, camPos, glFailed, pendingSize, touch;

const tagline =
  EVENT_ID === 'none'
    ? 'Lost in the fog. Something is hunting you.'
    : `${THEME.emoji} ${THEME.hunters} are loose — ${EVENT_NAME} event!`;

const shell = createShell({
  title: 'Hollow Maze',
  tagline,
  width: W,
  height: H,
  accent: '#9b7bff',
  mode: 'custom',
  help: [
    ['↑ / W', 'Walk forward'],
    ['↓ / S', 'Step back'],
    ['← → / A D', 'Turn'],
    ['Scout', 'Lantern lights farther'],
    ['Bolt', 'Runs faster'],
    ['Rue', 'Hears hunters sooner'],
    ['Wisp', 'Power orbs last longer'],
    ['Esc / P', 'Pause'],
  ],
  touch: 'Hold to walk · drag sideways to turn',
  options: [{ key: 'character', label: 'Character', choices: Object.entries(CHARACTERS).map(([k, c]) => [k, c.name]) }],
  onResize,
  init,
  update,
  render,
});

// ---------- Renderer ----------

try {
  renderer = new THREE.WebGLRenderer({ canvas: shell.canvas, antialias: true });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, W / H, 0.05, 60);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  scene.add(new THREE.HemisphereLight(THEME.edge, THEME.floor, 0.25));
  light = new THREE.PointLight(THEME.light, 4, 6, 1);
  scene.add(light);
  scene.background = new THREE.Color(THEME.fog);
  if (pendingSize) onResize(...pendingSize);
} catch {
  glFailed = true;
}

function onResize(w, h, dpr) {
  if (!renderer) {
    pendingSize = [w, h, dpr];
    return;
  }
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---------- Maze ----------

const isOpen = (x, z) => x >= 0 && z >= 0 && x < N && z < N && grid[z][x] === 0;
const inHome = (x, z) => Math.abs(x - CENTER) <= 1 && Math.abs(z - CENTER) <= 1;

function generateMaze() {
  grid = Array.from({ length: N }, () => Array(N).fill(1));
  // Depth-first carve between cells (odd tiles).
  const stack = [[1, 1]];
  grid[1][1] = 0;
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const options = shuffle(DIRS.map(([dx, dz]) => [x + dx * 2, z + dz * 2, x + dx, z + dz])).filter(
      ([nx, nz]) => nx > 0 && nz > 0 && nx < N - 1 && nz < N - 1 && grid[nz][nx] === 1
    );
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, nz, wx, wz] = options[0];
    grid[wz][wx] = 0;
    grid[nz][nx] = 0;
    stack.push([nx, nz]);
  }
  // Extra loops, so the hunters can be dodged.
  for (let z = 1; z < N - 1; z++) {
    for (let x = 1; x < N - 1; x++) {
      const between = (x % 2 === 0) !== (z % 2 === 0);
      if (grid[z][x] === 1 && between && Math.random() < EXTRA_LOOPS) grid[z][x] = 0;
    }
  }
  // No dead ends: open one more wall from any cell with a single exit.
  for (let z = 1; z < N - 1; z += 2) {
    for (let x = 1; x < N - 1; x += 2) {
      const exits = DIRS.filter(([dx, dz]) => grid[z + dz][x + dx] === 0).length;
      if (exits > 1) continue;
      const walls = shuffle(DIRS.filter(([dx, dz]) => grid[z + dz][x + dx] === 1 && x + dx * 2 > 0 && z + dz * 2 > 0 && x + dx * 2 < N - 1 && z + dz * 2 < N - 1));
      if (walls.length) grid[z + walls[0][1]][x + walls[0][0]] = 0;
    }
  }
  // The hunters' den in the middle.
  for (let z = CENTER - 1; z <= CENTER + 1; z++) for (let x = CENTER - 1; x <= CENTER + 1; x++) grid[z][x] = 0;
}

// Tile space: tile (x, z) covers [x, x+1). World space centers the maze on the origin.
const toWorld = (v) => v - N / 2;

function disposeGroup(g) {
  g.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

function buildLevel() {
  if (!scene) return;
  if (levelGroup) {
    scene.remove(levelGroup);
    disposeGroup(levelGroup);
  }
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  generateMaze();

  const ch = CHARACTERS[shell.options.character];
  scene.fog = new THREE.Fog(THEME.fog, 0.6, ch.fog);
  light.distance = ch.light;

  const floor = part(new THREE.PlaneGeometry(N, N), THEME.floor, { rough: 0.95 });
  floor.rotation.x = -Math.PI / 2;
  levelGroup.add(floor);

  // Walls and their glowing top trim, instanced.
  const wallTiles = [];
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (grid[z][x] === 1) wallTiles.push([x, z]);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_H, 1), new THREE.MeshStandardMaterial({ color: THEME.wall, roughness: 0.85 }), wallTiles.length);
  // A glowing band wrapped around each wall just below its top edge.
  const trim = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.012, 0.05, 1.012),
    new THREE.MeshStandardMaterial({ color: THEME.edge, emissive: THEME.edge, emissiveIntensity: 0.6 }),
    wallTiles.length
  );
  const m = new THREE.Matrix4();
  wallTiles.forEach(([x, z], i) => {
    m.makeTranslation(toWorld(x + 0.5), WALL_H / 2, toWorld(z + 0.5));
    walls.setMatrixAt(i, m);
    m.makeTranslation(toWorld(x + 0.5), WALL_H - 0.12, toWorld(z + 0.5));
    trim.setMatrixAt(i, m);
  });
  levelGroup.add(walls, trim);

  // Orbs on every open tile outside the den and the start.
  const spawn = [CENTER, N - 2];
  const powerSpots = new Set(CORNERS.map(([x, z]) => `${x},${z}`));
  orbs = [];
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      if (grid[z][x] !== 0 || inHome(x, z) || (x === spawn[0] && z === spawn[1]) || powerSpots.has(`${x},${z}`)) continue;
      orbs.push({ x, z, taken: false });
    }
  }
  orbMesh = new THREE.InstancedMesh(
    orbGeometry(THEME.orb.shape),
    new THREE.MeshStandardMaterial({ color: THEME.orb.color, emissive: THEME.orb.color, emissiveIntensity: 1.1 }),
    orbs.length
  );
  orbs.forEach((o, i) => {
    m.makeTranslation(toWorld(o.x + 0.5), 0.35, toWorld(o.z + 0.5));
    orbMesh.setMatrixAt(i, m);
  });
  levelGroup.add(orbMesh);

  powerOrbs = CORNERS.map(([x, z]) => {
    const mesh = part(new THREE.SphereGeometry(0.16, 16, 12), 0xffffff, { emissive: THEME.edge, glow: 2.5 });
    mesh.position.set(toWorld(x + 0.5), 0.4, toWorld(z + 0.5));
    levelGroup.add(mesh);
    return { x, z, taken: false, mesh };
  });
  orbsLeft = orbs.length + powerOrbs.length;

  playerMesh = buildCharacter(shell.options.character);
  levelGroup.add(playerMesh);

  hunters = THEME.build.map((build, role) => {
    const body = build();
    const fright = part(new THREE.SphereGeometry(0.4, 16, 12), 0x3a5aff, { emissive: 0x2a4aff, glow: 1, opacity: 0.75 });
    fright.position.y = 0.5;
    fright.visible = false;
    const eyesOnly = new THREE.Group();
    for (const s of [-1, 1]) {
      const e = part(new THREE.SphereGeometry(0.07, 8, 6), 0xffffff, { emissive: 0xffffff, glow: 1 });
      e.position.set(s * 0.1, 0.6, 0.1);
      eyesOnly.add(e);
    }
    eyesOnly.visible = false;
    const g = new THREE.Group();
    g.add(body, fright, eyesOnly);
    levelGroup.add(g);
    return { role, body, fright, eyesOnly, group: g };
  });
  resetPositions();
}

function resetPositions() {
  player = { x: CENTER + 0.5, z: N - 2 + 0.5, a: -Math.PI / 2, moving: false, bob: 0 };
  const homeSpots = [[CENTER, CENTER - 1], [CENTER - 1, CENTER], [CENTER + 1, CENTER], [CENTER, CENTER + 1]];
  hunters.forEach((h, i) => {
    const [x, z] = homeSpots[i];
    Object.assign(h, { tile: [x, z], next: [x, z], t: 1, dir: [0, -1], mode: 'home', release: RELEASE_TIMES[i], voice: 0.5 + i * 0.4 });
  });
  phaseIndex = 0;
  phaseTime = PHASES[0][1];
  powerTimer = 0;
  camPos = null;
}

// ---------- Run setup ----------

function init() {
  level = 1;
  lives = START_LIVES;
  time = 0;
  dying = 0;
  eatChain = 0;
  touch = null;
  buildLevel();
  updateStats();
}

function updateStats() {
  const stats = { Level: level, Lives: lives, Orbs: orbsLeft };
  if (powerTimer > 0) stats.Power = `${Math.ceil(powerTimer)}s`;
  shell.setStats(stats);
}

// ---------- Hunters ----------

function bfsFrom([tx, tz]) {
  const distMap = Array.from({ length: N }, () => Array(N).fill(Infinity));
  if (!isOpen(tx, tz)) return distMap;
  distMap[tz][tx] = 0;
  const queue = [[tx, tz]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, z] = queue[qi];
    for (const [dx, dz] of DIRS) {
      const nx = x + dx;
      const nz = z + dz;
      if (isOpen(nx, nz) && distMap[nz][nx] === Infinity) {
        distMap[nz][nx] = distMap[z][x] + 1;
        queue.push([nx, nz]);
      }
    }
  }
  return distMap;
}

function nearestOpen(x, z) {
  x = clamp(Math.round(x), 1, N - 2);
  z = clamp(Math.round(z), 1, N - 2);
  if (isOpen(x, z)) return [x, z];
  for (let r = 1; r < N; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (isOpen(x + dx, z + dz)) return [x + dx, z + dz];
  }
  return [CENTER, CENTER];
}

function huntTarget(h) {
  const px = Math.floor(player.x);
  const pz = Math.floor(player.z);
  const fx = Math.round(Math.cos(player.a));
  const fz = Math.round(Math.sin(player.a));
  if (PHASES[phaseIndex][0] === 'scatter' && h.role !== 3) return CORNERS[h.role];
  switch (h.role) {
    case 1: // ambusher: aim ahead of the player
      return nearestOpen(px + fx * 4, pz + fz * 4);
    case 2: {
      // flanker: mirror the chaser through a point ahead of the player
      const chaser = hunters[0].tile;
      return nearestOpen(px + fx * 2 + (px + fx * 2 - chaser[0]), pz + fz * 2 + (pz + fz * 2 - chaser[1]));
    }
    case 3: {
      // wanderer: roams its corner until the player is close, then rushes
      const d = Math.hypot(h.tile[0] - px, h.tile[1] - pz);
      return d < 7 ? [px, pz] : CORNERS[(Math.floor(time / 9) + 3) % 4];
    }
    default:
      return [px, pz];
  }
}

function chooseNext(h) {
  const [x, z] = h.tile;
  let options = DIRS.filter(([dx, dz]) => isOpen(x + dx, z + dz));
  const forward = options.filter(([dx, dz]) => !(dx === -h.dir[0] && dz === -h.dir[1]));
  if (forward.length) options = forward;
  let pick;
  if (h.mode === 'fright') {
    pick = options[Math.floor(Math.random() * options.length)];
  } else {
    const target = h.mode === 'eaten' ? [CENTER, CENTER] : huntTarget(h);
    const distMap = bfsFrom(target);
    pick = options.reduce((best, d) => (distMap[z + d[1]][x + d[0]] < distMap[z + best[1]][x + best[0]] ? d : best), options[0]);
  }
  h.dir = pick;
  h.next = [x + pick[0], z + pick[1]];
  h.t = 0;
}

function updateHunter(h, dt) {
  const mul = 1 + (level - 1) * LEVEL_SPEEDUP;
  if (h.mode === 'home') {
    h.release -= dt;
    if (h.release <= 0) {
      h.mode = powerTimer > 0 ? 'fright' : 'normal';
      chooseNext(h);
    }
    return;
  }
  const speed = (h.mode === 'eaten' ? EATEN_SPEED : h.mode === 'fright' ? FRIGHT_SPEED : HUNTER_SPEED) * mul;
  h.t += speed * dt;
  while (h.t >= 1) {
    h.tile = h.next;
    if (h.mode === 'eaten' && h.tile[0] === CENTER && h.tile[1] === CENTER) {
      h.mode = 'normal';
      tone({ freq: 300, to: 600, dur: 0.2, type: 'triangle', vol: 0.06 });
    }
    const leftover = h.t - 1;
    chooseNext(h);
    h.t = leftover;
  }

  // Positional "voice": louder when close, panned to the side it's on.
  if (h.mode !== 'eaten') {
    h.voice -= dt;
    if (h.voice <= 0) {
      h.voice = 1.1 + Math.random() * 0.6;
      const [hx, hz] = hunterPos(h);
      const dx = hx - player.x;
      const dz = hz - player.z;
      const d = Math.hypot(dx, dz);
      const range = HEAR_RANGE * CHARACTERS[shell.options.character].hear;
      if (d < range) {
        const rightX = -Math.sin(player.a);
        const rightZ = Math.cos(player.a);
        const pan = d > 0.01 ? (dx * rightX + dz * rightZ) / d : 0;
        const vol = 0.13 * Math.pow(1 - d / range, 1.5);
        const v = THEME.voice;
        tone({ freq: v.freq * (1 + h.role * 0.12), to: v.freq * 0.8, dur: 0.22, type: v.type, vol, pan });
      }
    }
  }
}

function hunterPos(h) {
  if (h.mode === 'home') return [h.tile[0] + 0.5, h.tile[1] + 0.5];
  return [lerp(h.tile[0], h.next[0], h.t) + 0.5, lerp(h.tile[1], h.next[1], h.t) + 0.5];
}

// ---------- Player ----------

function blockedAt(x, z) {
  for (let tz = Math.floor(z - PLAYER_R); tz <= Math.floor(z + PLAYER_R); tz++) {
    for (let tx = Math.floor(x - PLAYER_R); tx <= Math.floor(x + PLAYER_R); tx++) {
      if (isOpen(tx, tz)) continue;
      const nx = clamp(x, tx, tx + 1);
      const nz = clamp(z, tz, tz + 1);
      if ((x - nx) ** 2 + (z - nz) ** 2 < PLAYER_R * PLAYER_R) return true;
    }
  }
  return false;
}

function movePlayer(dt) {
  const { input } = shell;
  const ch = CHARACTERS[shell.options.character];
  let turn = input.axisX();
  let fwd = -input.axisY();
  const p = input.pointer;
  if (p.pressed) touch = { lastX: p.x };
  if (touch && p.down) {
    fwd = 1;
    player.a += (p.x - touch.lastX) * 0.012;
    touch.lastX = p.x;
  } else touch = null;

  player.a += turn * TURN_SPEED * dt;
  const step = fwd * (fwd < 0 ? ch.speed * BACK_FACTOR : ch.speed) * dt;
  const dx = Math.cos(player.a) * step;
  const dz = Math.sin(player.a) * step;
  if (!blockedAt(player.x + dx, player.z)) player.x += dx;
  if (!blockedAt(player.x, player.z + dz)) player.z += dz;
  player.moving = fwd !== 0;

  // Corridor assist: drift toward the center line of the corridor you're walking along.
  if (fwd) {
    const alongX = Math.abs(Math.cos(player.a)) > Math.abs(Math.sin(player.a));
    const k = Math.min(1, ALIGN_PULL * dt);
    if (alongX) {
      const cz = Math.floor(player.z) + 0.5;
      const nz = lerp(player.z, cz, k);
      if (!blockedAt(player.x, nz)) player.z = nz;
    } else {
      const cx = Math.floor(player.x) + 0.5;
      const nx = lerp(player.x, cx, k);
      if (!blockedAt(nx, player.z)) player.x = nx;
    }
  }
  if (player.moving) player.bob += dt * 12;
}

function collect() {
  const tx = Math.floor(player.x);
  const tz = Math.floor(player.z);
  const m = new THREE.Matrix4().makeScale(0, 0, 0);
  orbs.forEach((o, i) => {
    if (o.taken || Math.hypot(o.x + 0.5 - player.x, o.z + 0.5 - player.z) > 0.42) return;
    o.taken = true;
    orbMesh.setMatrixAt(i, m);
    orbMesh.instanceMatrix.needsUpdate = true;
    orbsLeft--;
    shell.addScore(ORB_POINTS);
    tone({ freq: orbsLeft % 2 ? 760 : 900, dur: 0.05, type: 'square', vol: 0.04 });
  });
  for (const po of powerOrbs) {
    if (po.taken || po.x !== tx || po.z !== tz) continue;
    po.taken = true;
    po.mesh.visible = false;
    orbsLeft--;
    shell.addScore(POWER_POINTS);
    const ch = CHARACTERS[shell.options.character];
    powerTimer = Math.max(3, POWER_TIME * ch.power - (level - 1) * 0.5);
    eatChain = 0;
    sfx('powerup');
    for (const h of hunters) {
      if (h.mode === 'normal') {
        h.mode = 'fright';
        // Turn around on the spot.
        [h.tile, h.next] = [h.next, h.tile];
        h.t = 1 - h.t;
        h.dir = [-h.dir[0], -h.dir[1]];
      }
    }
  }
  updateStats();
}

// ---------- Main loop ----------

function update(dt) {
  if (glFailed) return;
  time += dt;

  if (dying > 0) {
    dying -= dt;
    player.a += dt * 6;
    if (dying <= 0) {
      if (lives <= 0) {
        sfx('lose');
        shell.gameOver({ message: `Caught on level ${level}.` });
        return;
      }
      resetPositions();
    }
    return;
  }

  movePlayer(dt);
  collect();

  if (powerTimer > 0) {
    const before = Math.ceil(powerTimer);
    powerTimer -= dt;
    if (powerTimer <= 0) for (const h of hunters) if (h.mode === 'fright') h.mode = 'normal';
    if (Math.ceil(powerTimer) !== before) updateStats();
  } else {
    phaseTime -= dt;
    if (phaseTime <= 0 && phaseIndex < PHASES.length - 1) {
      phaseIndex++;
      phaseTime = PHASES[phaseIndex][1];
    }
  }

  for (const h of hunters) updateHunter(h, dt);

  for (const h of hunters) {
    if (h.mode === 'home' || h.mode === 'eaten') continue;
    const [hx, hz] = hunterPos(h);
    if (Math.hypot(hx - player.x, hz - player.z) > CATCH_DIST) continue;
    if (h.mode === 'fright') {
      h.mode = 'eaten';
      const pts = EAT_POINTS * 2 ** eatChain;
      eatChain = Math.min(eatChain + 1, 3);
      shell.addScore(pts);
      sfx('coin');
      tone({ freq: 400, to: 1400, dur: 0.3, type: 'square', vol: 0.08 });
    } else {
      lives--;
      dying = 1.3;
      powerTimer = 0;
      sfx('hurt');
      updateStats();
      return;
    }
  }

  if (orbsLeft <= 0) {
    level++;
    sfx('win');
    buildLevel();
    updateStats();
  }
}

function syncScene() {
  const ch = CHARACTERS[shell.options.character];
  // Player model
  const bob = player.moving ? Math.abs(Math.sin(player.bob)) * 0.05 : 0;
  playerMesh.position.set(toWorld(player.x), bob, toWorld(player.z));
  playerMesh.rotation.y = Math.atan2(Math.cos(player.a), Math.sin(player.a));
  light.position.set(toWorld(player.x + Math.cos(player.a) * 0.4), 1.25, toWorld(player.z + Math.sin(player.a) * 0.4));
  light.distance = ch.light;

  // Hunters
  for (const h of hunters) {
    const [x, z] = hunterPos(h);
    h.group.position.set(toWorld(x), 0, toWorld(z));
    h.group.rotation.y = Math.atan2(h.dir[0], h.dir[1]);
    const frightened = h.mode === 'fright';
    const flashing = frightened && powerTimer < 2 && Math.floor(time * 6) % 2;
    h.body.visible = h.mode !== 'eaten' && !frightened;
    h.fright.visible = frightened;
    h.fright.material.color.setHex(flashing ? 0xffffff : 0x3a5aff);
    h.eyesOnly.visible = h.mode === 'eaten';
    h.group.position.y = h.mode === 'home' ? Math.abs(Math.sin(time * 3 + h.role)) * 0.1 : Math.sin(time * 4 + h.role) * 0.04;
    if (h.body.userData.spin) h.body.rotation.y = time * 2;
    if (h.body.userData.flap) h.body.children.forEach((c, i) => i > 0 && i < 3 && (c.rotation.z = (i === 1 ? -1 : 1) * (0.3 + Math.sin(time * 14) * 0.5)));
  }
  for (const po of powerOrbs) po.mesh.scale.setScalar(1 + Math.sin(time * 5) * 0.2);

  // Chase camera: pulled in when a wall is behind the player.
  const bx = -Math.cos(player.a);
  const bz = -Math.sin(player.a);
  let d = 0;
  while (d < CAM_DIST && isOpen(Math.floor(player.x + bx * (d + 0.05)), Math.floor(player.z + bz * (d + 0.05)))) d += 0.05;
  // When a wall pushes the camera in, it rises over the player's shoulder instead.
  const dist = Math.max(0.3, d - 0.18);
  const close = 1 - dist / CAM_DIST;
  const height = lerp(CAM_HEIGHT, CAM_HIGH, close);
  const target = new THREE.Vector3(toWorld(player.x + bx * dist), height, toWorld(player.z + bz * dist));
  if (!camPos || dying > 0) camPos = target.clone();
  else camPos.lerp(target, 0.25);
  camera.position.copy(camPos);
  camera.lookAt(toWorld(player.x - bx * 1.6), lerp(0.35, 0.6, close), toWorld(player.z - bz * 1.6));
  playerMesh.visible = dist > FIRST_PERSON;
}

function render() {
  if (glFailed || !renderer || !playerMesh) return;
  syncScene();
  renderer.render(scene, camera);
}

shell.debug = () => ({
  event: EVENT_ID, player, hunters, orbsLeft, level, lives, grid, powerTimer, renderer,
  collectAll: () => { orbs.forEach((o) => (o.taken = true)); powerOrbs.forEach((p) => (p.taken = true)); orbsLeft = 0; },
  teleport: (x, z) => { player.x = x + 0.5; player.z = z + 0.5; },
  touchHunter: (i) => { [player.x, player.z] = hunterPos(hunters[i]); },
});
shell.boot();
