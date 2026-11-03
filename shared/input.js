// Keyboard, mouse and touch input in one place.
// Keys use KeyboardEvent.code ("ArrowLeft", "KeyA", "Space").
// "pressed" is true for exactly one update step after the key goes down.

export const KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  action: ['Space'],
  confirm: ['Enter', 'Space'],
};

// Keys that would otherwise scroll the page.
const BLOCKED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
const SWIPE_MIN = 30; // logical px
const SWIPE_MAX_MS = 600;

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function createInput({ canvas, width, height }) {
  const held = new Set();
  const pressed = new Set();
  const released = new Set();
  const pointer = { x: 0, y: 0, down: false, pressed: false, released: false, type: 'mouse' };
  let swipe = null;
  let swipeStart = null;

  window.addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    // Buttons and links still need Space/Enter to activate.
    if (BLOCKED.has(e.code) && !e.target?.closest?.('button, a')) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    held.delete(e.code);
    released.add(e.code);
  });
  // Releasing a key while the window is unfocused never fires keyup.
  window.addEventListener('blur', () => held.clear());

  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) * width) / r.width;
    pointer.y = ((e.clientY - r.top) * height) / r.height;
    pointer.type = e.pointerType || 'mouse';
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    toLocal(e);
    pointer.down = true;
    pointer.pressed = true;
    swipeStart = { x: pointer.x, y: pointer.y, t: performance.now() };
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', toLocal);
  const end = (e) => {
    toLocal(e);
    if (!pointer.down) return;
    pointer.down = false;
    pointer.released = true;
    if (swipeStart && performance.now() - swipeStart.t < SWIPE_MAX_MS) {
      const dx = pointer.x - swipeStart.x;
      const dy = pointer.y - swipeStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_MIN) {
        swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
    }
    swipeStart = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function endFrame() {
    pressed.clear();
    released.clear();
    pointer.pressed = false;
    pointer.released = false;
  }

  return {
    down: (...codes) => codes.flat().some((c) => held.has(c)),
    pressed: (...codes) => codes.flat().some((c) => pressed.has(c)),
    released: (...codes) => codes.flat().some((c) => released.has(c)),
    // -1, 0 or 1 from arrow keys / WASD.
    axisX: () => (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0),
    axisY: () => (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0) - (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0),
    pointer,
    // Returns 'up' | 'down' | 'left' | 'right' once per swipe, else null.
    takeSwipe() {
      const s = swipe;
      swipe = null;
      return s;
    },
    endFrame,
    reset() {
      held.clear();
      endFrame();
      swipe = null;
      swipeStart = null;
      pointer.down = false;
    },
  };
}
