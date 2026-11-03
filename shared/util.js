// Small math, random and collision helpers shared by every game.

export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// rand() → [0,1)   rand(max) → [0,max)   rand(min, max) → [min,max)
export function rand(a = 1, b) {
  return b === undefined ? Math.random() * a : a + Math.random() * (b - a);
}

// Inclusive integer in [min, max].
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deterministic PRNG (mulberry32) for repeatable levels and thumbnails.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rects are {x, y, w, h}; circles are {x, y, r}.
export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circlesOverlap(a, b) {
  const r = a.r + b.r;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy < r * r;
}

export function circleRect(c, rect) {
  const nx = clamp(c.x, rect.x, rect.x + rect.w);
  const ny = clamp(c.y, rect.y, rect.y + rect.h);
  const dx = c.x - nx;
  const dy = c.y - ny;
  return dx * dx + dy * dy < c.r * c.r;
}

// Wrap a value into [0, max) — for screen-wrapping games.
export const wrap = (v, max) => ((v % max) + max) % max;
