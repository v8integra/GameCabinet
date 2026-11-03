// Hollow Maze looks: one theme per calendar event, plus the four playable characters.
// Hunters are built from simple primitives; each theme supplies one builder per role
// (0 chaser, 1 ambusher, 2 flanker, 3 wanderer). Gameplay never changes between themes.

import * as THREE from '../../vendor/three.module.min.js';

export function part(geometry, color, { emissive = 0x000000, glow = 0, rough = 0.6, opacity = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: glow, roughness: rough, transparent: opacity < 1, opacity });
  const mesh = new THREE.Mesh(geometry, mat);
  return mesh;
}

const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);

function at(mesh, x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

function group(...children) {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}

// Glowing eyes facing +z (the direction a figure moves).
function eyes(y, z, spread, color = 0xff2a2a, r = 0.035) {
  return [-1, 1].map((s) => at(part(sphere(r, 8, 6), color, { emissive: color, glow: 2 }), s * spread, y, z));
}

// ---------- Hunter builders ----------

function ghost(color) {
  return () =>
    group(
      at(part(sphere(0.28), color, { emissive: color, glow: 0.6, opacity: 0.85 }), 0, 0.62, 0),
      at(part(cyl(0.28, 0.32, 0.4, 14), color, { emissive: color, glow: 0.6, opacity: 0.85 }), 0, 0.4, 0),
      ...eyes(0.66, 0.24, 0.1, 0xffffff)
    );
}

function poltergeist(color) {
  return () => {
    const g = ghost(color)();
    const colors = [0xff3d9a, 0xffd23f, 0x2de2e6, 0x4dff88];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(at(part(box(0.06, 0.02, 0.06), colors[i % 4], { emissive: colors[i % 4], glow: 1 }), Math.cos(a) * 0.42, 0.5 + (i % 3) * 0.12, Math.sin(a) * 0.42, { ry: a }));
    }
    g.userData.spin = true;
    return g;
  };
}

function cupid(color) {
  return () =>
    group(
      at(part(sphere(0.22), 0xffd8c8), 0, 0.62, 0),
      at(part(sphere(0.24), color), 0, 0.36, 0, { sy: 0.9 }),
      at(part(box(0.32, 0.02, 0.18), 0xffffff, { emissive: 0xffffff, glow: 0.3 }), -0.28, 0.5, -0.05, { rz: 0.5 }),
      at(part(box(0.32, 0.02, 0.18), 0xffffff, { emissive: 0xffffff, glow: 0.3 }), 0.28, 0.5, -0.05, { rz: -0.5 }),
      at(part(sphere(0.07), 0xff3d6e, { emissive: 0xff3d6e, glow: 1.2 }), 0, 0.38, 0.24, { sx: 1.3 }),
      ...eyes(0.66, 0.2, 0.07, 0x330011)
    );
}

function leprechaun(coat) {
  return () =>
    group(
      at(part(cyl(0.2, 0.26, 0.42), coat), 0, 0.3, 0),
      at(part(sphere(0.17), 0xffd8b0), 0, 0.62, 0),
      at(part(cone(0.16, 0.22), 0xd2691e), 0, 0.5, 0.12, { rx: Math.PI }),
      at(part(cyl(0.22, 0.22, 0.03), 0x0a5a1a), 0, 0.76, 0),
      at(part(cyl(0.13, 0.15, 0.24), 0x0a5a1a), 0, 0.89, 0),
      at(part(box(0.27, 0.05, 0.27), 0xffd23f, { emissive: 0xffd23f, glow: 0.5 }), 0, 0.8, 0, { sx: 0.6, sz: 0.6 }),
      ...eyes(0.66, 0.15, 0.06, 0x00ff66)
    );
}

function bunny(color) {
  return () =>
    group(
      at(part(sphere(0.26), color), 0, 0.32, 0, { sy: 1.1 }),
      at(part(sphere(0.19), color), 0, 0.66, 0.05),
      at(part(box(0.07, 0.36, 0.04), color), -0.08, 0.98, 0, { rz: 0.15 }),
      at(part(box(0.07, 0.3, 0.04), color), 0.09, 0.92, 0, { rz: -0.6 }),
      at(part(sphere(0.06), 0xffffff), 0, 0.3, -0.27),
      ...eyes(0.7, 0.2, 0.07)
    );
}

const firefly = () =>
  group(
    at(part(sphere(0.18), 0x3a2a10), 0, 0.6, 0.1, { sz: 1.3 }),
    at(part(sphere(0.2), 0xfff36b, { emissive: 0xfff36b, glow: 2 }), 0, 0.5, -0.2),
    at(part(box(0.5, 0.01, 0.16), 0xddeeff, { opacity: 0.5 }), 0, 0.72, 0.05),
    ...eyes(0.64, 0.3, 0.07, 0x88ff88)
  );
const mantis = () =>
  group(
    at(part(cyl(0.05, 0.08, 0.6), 0x5fd06a), 0, 0.5, 0, { rx: 0.3 }),
    at(part(cone(0.14, 0.2, 3), 0x7ae07a), 0, 0.85, 0.12, { rx: Math.PI / 2 }),
    at(part(cyl(0.03, 0.03, 0.35), 0x5fd06a), -0.12, 0.6, 0.2, { rx: 1.2 }),
    at(part(cyl(0.03, 0.03, 0.35), 0x5fd06a), 0.12, 0.6, 0.2, { rx: 1.2 }),
    ...eyes(0.88, 0.2, 0.08, 0xffee00, 0.045)
  );
const beetle = () =>
  group(
    at(part(new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x1a6a8a, { rough: 0.2, emissive: 0x0a3a5a, glow: 0.4 }), 0, 0.2, 0, { sz: 1.3 }),
    at(part(box(0.02, 0.2, 0.7), 0x0a2a3a), 0, 0.42, 0),
    at(part(sphere(0.13), 0x0a2a3a), 0, 0.25, 0.38),
    ...eyes(0.3, 0.48, 0.07, 0xff6a00)
  );
const wasp = () => {
  const g = group(at(part(sphere(0.16), 0x222222), 0, 0.62, 0.18));
  for (let i = 0; i < 3; i++) g.add(at(part(cyl(0.2 - i * 0.03, 0.2 - i * 0.03, 0.1), i % 2 ? 0x222222 : 0xffc400), 0, 0.55, -0.05 - i * 0.1, { rx: Math.PI / 2 }));
  g.add(at(part(cone(0.06, 0.15), 0x222222), 0, 0.55, -0.38, { rx: -Math.PI / 2 }));
  g.add(at(part(box(0.55, 0.01, 0.14), 0xddeeff, { opacity: 0.45 }), 0, 0.74, 0));
  g.add(...eyes(0.66, 0.32, 0.08, 0xff2200));
  return g;
};

function sprite(color) {
  return () => {
    const g = group(
      at(part(cone(0.22, 0.5, 6), color, { emissive: color, glow: 0.8 }), 0, 0.42, 0),
      at(part(sphere(0.15), 0xffffff, { emissive: color, glow: 1.5 }), 0, 0.75, 0),
      ...eyes(0.78, 0.13, 0.06, 0x111133)
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(at(part(sphere(0.04, 6, 4), 0xffffff, { emissive: 0xffd23f, glow: 2 }), Math.cos(a) * 0.32, 0.9 + (i % 2) * 0.1, Math.sin(a) * 0.32));
    }
    g.userData.spin = true;
    return g;
  };
}

const pumpkin = () =>
  group(
    at(part(sphere(0.3), 0xff7a1a, { rough: 0.5 }), 0, 0.45, 0, { sy: 0.85 }),
    at(part(cyl(0.04, 0.05, 0.12), 0x3a5a1a), 0, 0.75, 0),
    at(part(cone(0.07, 0.08, 3), 0xffd23f, { emissive: 0xffaa00, glow: 3 }), -0.11, 0.52, 0.27, { rx: Math.PI / 2 }),
    at(part(cone(0.07, 0.08, 3), 0xffd23f, { emissive: 0xffaa00, glow: 3 }), 0.11, 0.52, 0.27, { rx: Math.PI / 2 }),
    at(part(box(0.24, 0.05, 0.04), 0xffd23f, { emissive: 0xffaa00, glow: 3 }), 0, 0.36, 0.28)
  );
const witch = () =>
  group(
    at(part(cone(0.3, 0.6, 12), 0x2a1040), 0, 0.3, 0),
    at(part(sphere(0.15), 0x7ad07a), 0, 0.68, 0),
    at(part(cyl(0.3, 0.3, 0.02), 0x1a0a2a), 0, 0.78, 0),
    at(part(cone(0.15, 0.4), 0x1a0a2a), 0, 0.98, 0, { rz: 0.15 }),
    ...eyes(0.7, 0.13, 0.05, 0xffee00)
  );
const skeleton = () => {
  const bone = 0xf0ecd8;
  return group(
    at(part(sphere(0.17), bone), 0, 0.82, 0),
    at(part(cyl(0.04, 0.04, 0.4), bone), 0, 0.5, 0),
    ...[0.6, 0.52, 0.44].map((y) => at(part(box(0.3, 0.025, 0.12), bone), 0, y, 0)),
    at(part(cyl(0.03, 0.03, 0.35), bone), -0.08, 0.15, 0),
    at(part(cyl(0.03, 0.03, 0.35), bone), 0.08, 0.15, 0),
    ...eyes(0.84, 0.14, 0.06, 0x66ccff, 0.04)
  );
};
const bat = () => {
  const g = group(at(part(sphere(0.16), 0x2a1a2a), 0, 0.7, 0, { sy: 1.2 }));
  for (const s of [-1, 1]) g.add(at(part(box(0.42, 0.02, 0.22), 0x3a2a3a), s * 0.3, 0.75, 0, { rz: s * -0.3 }));
  g.add(at(part(cone(0.05, 0.12, 3), 0x2a1a2a), -0.07, 0.92, 0), at(part(cone(0.05, 0.12, 3), 0x2a1a2a), 0.07, 0.92, 0));
  g.add(...eyes(0.74, 0.14, 0.05));
  g.userData.flap = true;
  return g;
};

function turkey(body) {
  return () => {
    const g = group(
      at(part(sphere(0.26), body), 0, 0.35, 0, { sy: 0.9 }),
      at(part(sphere(0.12), 0x8a5a3a), 0, 0.62, 0.18),
      at(part(cone(0.04, 0.1), 0xffaa00), 0, 0.62, 0.32, { rx: Math.PI / 2 }),
      at(part(sphere(0.04), 0xff2a2a), 0.02, 0.55, 0.28, { sy: 1.6 }),
      ...eyes(0.66, 0.27, 0.05, 0x111111)
    );
    const feathers = [0xb04a1a, 0xd2691e, 0xf0b040, 0x8a3a1a];
    for (let i = 0; i < 7; i++) {
      const a = -0.9 + (i / 6) * 1.8;
      g.add(at(part(box(0.1, 0.5, 0.02), feathers[i % 4]), Math.sin(a) * 0.25, 0.55 + Math.cos(a) * 0.15, -0.22, { rz: -a }));
    }
    return g;
  };
}

function snowman(scarf) {
  return () =>
    group(
      at(part(sphere(0.28), 0xf4f8ff, { emissive: 0xaaccff, glow: 0.15 }), 0, 0.28, 0),
      at(part(sphere(0.2), 0xf4f8ff, { emissive: 0xaaccff, glow: 0.15 }), 0, 0.62, 0),
      at(part(sphere(0.14), 0xf4f8ff, { emissive: 0xaaccff, glow: 0.15 }), 0, 0.88, 0),
      at(part(cyl(0.16, 0.16, 0.06), scarf), 0, 0.76, 0),
      at(part(cone(0.03, 0.16), 0xff7a1a), 0, 0.87, 0.18, { rx: Math.PI / 2 }),
      ...eyes(0.93, 0.12, 0.05, 0xff2222)
    );
}

// ---------- Themes ----------

export const THEMES = {
  none: {
    hunters: 'Hollow shades', emoji: '👻', fog: 0x120c28, floor: 0x14102a, wall: 0x2a2052, edge: 0x9b7bff, light: 0xffe0a0,
    orb: { shape: 'orb', color: 0xe4dcff }, voice: { freq: 180, type: 'sine' },
    build: [ghost(0xff5a7a), ghost(0xff9dd8), ghost(0x6ad8ff), ghost(0xffb347)],
  },
  newyear: {
    hunters: 'Confetti poltergeists', emoji: '🎉', fog: 0x0a0a20, floor: 0x101020, wall: 0x1a1a3a, edge: 0xffd23f, light: 0xfff0c0,
    orb: { shape: 'spark', color: 0xffd23f }, voice: { freq: 880, type: 'triangle' },
    build: [poltergeist(0xffd23f), poltergeist(0xff3d9a), poltergeist(0x2de2e6), poltergeist(0xb26bff)],
  },
  valentine: {
    hunters: 'Heartbroken cupids', emoji: '💘', fog: 0x2a0a1a, floor: 0x2a1020, wall: 0x4a1a34, edge: 0xff6aa8, light: 0xffd0e0,
    orb: { shape: 'heart', color: 0xff6aa8 }, voice: { freq: 660, type: 'sine' },
    build: [cupid(0xff3d6e), cupid(0xff9dc8), cupid(0xd04aa0), cupid(0xffffff)],
  },
  stpatricks: {
    hunters: 'Leprechauns', emoji: '🍀', fog: 0x0a2a14, floor: 0x0c2414, wall: 0x14402a, edge: 0x4dff88, light: 0xeaffd0,
    orb: { shape: 'coin', color: 0xffd23f }, voice: { freq: 520, type: 'square' },
    build: [leprechaun(0x1a8a3a), leprechaun(0x2aaa4a), leprechaun(0x0a6a2a), leprechaun(0x3ac05a)],
  },
  easter: {
    hunters: 'Undead bunnies', emoji: '🐰', fog: 0x2a2440, floor: 0x241f34, wall: 0x3a3454, edge: 0xb8f5d0, light: 0xfff0f8,
    orb: { shape: 'egg', color: 0xffb8e0 }, voice: { freq: 140, type: 'sawtooth' },
    build: [bunny(0x9aa890), bunny(0xb0a0b8), bunny(0x8a9a8a), bunny(0xc0b8a0)],
  },
  solstice: {
    hunters: 'Giant insects', emoji: '🦗', fog: 0x2a1a0a, floor: 0x241a0c, wall: 0x3a2a14, edge: 0xffb347, light: 0xffe0a0,
    orb: { shape: 'pollen', color: 0xfff36b }, voice: { freq: 300, type: 'sawtooth' },
    build: [firefly, mantis, beetle, wasp],
  },
  july4: {
    hunters: 'Firework sprites', emoji: '🎆', fog: 0x0a0c24, floor: 0x0c0e22, wall: 0x14183a, edge: 0xff4d4d, light: 0xf0f0ff,
    orb: { shape: 'spark', color: 0xff4d4d }, voice: { freq: 1000, type: 'triangle' },
    build: [sprite(0xff3b3b), sprite(0xffffff), sprite(0x3b6bff), sprite(0xffd23f)],
  },
  halloween: {
    hunters: 'Jack-o’-lanterns and friends', emoji: '🎃', fog: 0x1a0c06, floor: 0x160c08, wall: 0x2a1610, edge: 0xff7a1a, light: 0xffc080,
    orb: { shape: 'candycorn', color: 0xffa020 }, voice: { freq: 110, type: 'sawtooth' },
    build: [pumpkin, witch, skeleton, bat],
  },
  thanksgiving: {
    hunters: 'Rogue turkeys', emoji: '🦃', fog: 0x2a1a0c, floor: 0x24180c, wall: 0x3a2814, edge: 0xd2691e, light: 0xffe0b0,
    orb: { shape: 'kernel', color: 0xffd23f }, voice: { freq: 420, type: 'square' },
    build: [turkey(0x6a3a1a), turkey(0x8a4a2a), turkey(0x5a2a10), turkey(0x7a4a2a)],
  },
  winter: {
    hunters: 'Evil snowmen', emoji: '☃️', fog: 0x0c1a2a, floor: 0x10202e, wall: 0x1a3048, edge: 0x9fd8ff, light: 0xe0f0ff,
    orb: { shape: 'snowflake', color: 0xe0f4ff }, voice: { freq: 240, type: 'triangle' },
    build: [snowman(0xd0202a), snowman(0x2a8a3a), snowman(0x2a4ad0), snowman(0xffd23f)],
  },
};

// Collectible geometry per theme.
export function orbGeometry(shape) {
  switch (shape) {
    case 'egg':
      return new THREE.SphereGeometry(0.075, 10, 8).scale(1, 1.35, 1);
    case 'coin':
      return new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14).rotateX(Math.PI / 2);
    case 'heart':
      return new THREE.SphereGeometry(0.075, 10, 8).scale(1.2, 1, 0.8);
    case 'snowflake':
      return new THREE.OctahedronGeometry(0.09);
    case 'candycorn':
      return new THREE.ConeGeometry(0.06, 0.16, 8).rotateX(Math.PI);
    case 'kernel':
      return new THREE.SphereGeometry(0.06, 8, 6).scale(1, 1.2, 0.7);
    case 'pollen':
      return new THREE.IcosahedronGeometry(0.07);
    case 'spark':
      return new THREE.OctahedronGeometry(0.07).scale(1, 1.6, 1);
    default:
      return new THREE.SphereGeometry(0.065, 10, 8);
  }
}

// ---------- Characters ----------

export const CHARACTERS = {
  scout: { name: 'Scout', perk: 'Wider light', speed: 3.6, light: 7.5, fog: 8.5, hear: 1, power: 1 },
  bolt: { name: 'Bolt', perk: 'Faster', speed: 4.1, light: 5.5, fog: 6.5, hear: 1, power: 1 },
  rue: { name: 'Rue', perk: 'Hears hunters sooner', speed: 3.6, light: 5.5, fog: 6.5, hear: 1.7, power: 1 },
  wisp: { name: 'Wisp', perk: 'Longer power orbs', speed: 3.6, light: 5.5, fog: 6.5, hear: 1, power: 1.5 },
};

export function buildCharacter(id) {
  if (id === 'bolt') {
    const g = group(
      at(part(sphere(0.24), 0x9aa8c8, { rough: 0.3 }), 0, 0.36, 0),
      at(part(box(0.3, 0.08, 0.06), 0x2de2e6, { emissive: 0x2de2e6, glow: 2 }), 0, 0.42, 0.21),
      at(part(cyl(0.015, 0.015, 0.2), 0x9aa8c8), 0, 0.68, 0),
      at(part(sphere(0.04), 0xff3d9a, { emissive: 0xff3d9a, glow: 2 }), 0, 0.8, 0),
      at(part(cyl(0.12, 0.14, 0.08), 0x5a6888), 0, 0.08, 0)
    );
    return g;
  }
  if (id === 'rue') {
    return group(
      at(part(sphere(0.2), 0xff7a2a), 0, 0.3, 0, { sz: 1.5 }),
      at(part(sphere(0.15), 0xff7a2a), 0, 0.5, 0.22),
      at(part(cone(0.06, 0.08, 4), 0x1a1a1a), 0, 0.47, 0.38, { rx: Math.PI / 2 }),
      at(part(cone(0.06, 0.14, 4), 0xff7a2a), -0.08, 0.66, 0.2),
      at(part(cone(0.06, 0.14, 4), 0xff7a2a), 0.08, 0.66, 0.2),
      at(part(cone(0.1, 0.38, 8), 0xff7a2a), 0, 0.38, -0.36, { rx: -Math.PI / 2.4 }),
      at(part(sphere(0.06), 0xffffff), 0, 0.5, -0.52)
    );
  }
  if (id === 'wisp') {
    return group(
      at(part(cone(0.24, 0.6, 12), 0x5a3ab0), 0, 0.3, 0),
      at(part(sphere(0.14), 0x3a2470), 0, 0.64, 0),
      at(part(cone(0.16, 0.24, 12), 0x5a3ab0), 0, 0.8, -0.02),
      at(part(cyl(0.015, 0.015, 0.7), 0x8a6a4a), 0.22, 0.38, 0.08),
      at(part(sphere(0.06), 0x9fe8ff, { emissive: 0x9fe8ff, glow: 3 }), 0.22, 0.76, 0.08)
    );
  }
  // Scout (default)
  return group(
    at(part(cyl(0.16, 0.2, 0.45), 0x3a6a8a), 0, 0.28, 0),
    at(part(sphere(0.14), 0xffd8b0), 0, 0.62, 0),
    at(part(cyl(0.24, 0.24, 0.02), 0x8a6a3a), 0, 0.72, 0),
    at(part(cyl(0.12, 0.14, 0.14), 0x8a6a3a), 0, 0.79, 0),
    at(part(sphere(0.07), 0xffd23f, { emissive: 0xffc040, glow: 3 }), 0.22, 0.35, 0.12)
  );
}
