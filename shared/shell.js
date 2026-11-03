// The shared game frame: top bar, scaled canvas, title / pause / help / game-over screens,
// and the game loop. Every cabinet game is built with createShell().
//
//   const shell = createShell({ title, width, height, help, init, update, render });
//   ...declare game state...
//   shell.boot();
//
// init(shell)            — reset game state; called once at boot and on every new game
// update(dt, shell)      — called at a fixed 60 Hz, only while playing
// render(ctx, shell)     — called every frame in every state (draws behind overlays)
// mode: 'custom'         — no 2D context; the game owns the canvas (e.g. Three.js) and
//                          receives onResize(widthPx, heightPx, dpr)

import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { isMuted, toggleMute, onMuteChange } from './audio.js';

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.3M12 17.2v.1"/>',
};

const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Tiny element builder: h('div', { class: 'x', onclick: fn }, child, 'text')
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) el.append(c);
  }
  return el;
}

export function createShell(opts) {
  const {
    title,
    tagline = '',
    width = 800,
    height = 600,
    help = [],
    touch = '',
    accent,
    mode = '2d',
    back = '../../index.html',
    init = () => {},
    update = () => {},
    render = () => {},
    onResize = () => {},
    muteKey = 'KeyM',
  } = opts;

  if (accent) document.documentElement.style.setProperty('--accent', accent);
  document.title = `${title} · Game Cabinet`;

  // ---------- DOM ----------
  const barButton = (name, label, onclick) =>
    h('button', {
      class: 'gc-icon-btn',
      type: 'button',
      'aria-label': label,
      title: label,
      html: icon(name),
      onclick: (e) => {
        onclick();
        e.currentTarget.blur(); // keep Space/Enter for the game
      },
    });

  const scoreValue = h('b', {}, '0');
  const stats = h('div', { class: 'gc-stats' });
  const pauseBtn = barButton('pause', 'Pause (Esc)', () => (state === 'playing' ? pause() : state === 'paused' && resume()));
  const muteBtn = barButton(isMuted() ? 'muted' : 'sound', 'Mute (M)', toggleMute);
  const fullBtn = barButton('fullscreen', 'Fullscreen', toggleFullscreen);
  const helpBtn = barButton('help', 'Controls', () => showHelp());

  const bar = h(
    'header',
    { class: 'gc-bar' },
    h('a', { class: 'gc-back', href: back, html: `${icon('back')}<span>Cabinet</span>` }),
    h('h1', { class: 'gc-title' }, title),
    h('div', { class: 'gc-score', 'aria-live': 'polite' }, h('span', {}, 'Score'), scoreValue),
    stats,
    h('div', { class: 'gc-tools' }, pauseBtn, muteBtn, document.fullscreenEnabled ? fullBtn : null, helpBtn)
  );

  const canvas = h('canvas', { class: 'gc-canvas', 'aria-label': `${title} game screen` });
  const overlay = h('div', { class: 'gc-overlay', role: 'dialog', 'aria-modal': 'false' });
  const frame = h('div', { class: 'gc-frame' }, canvas);
  // The overlay covers the whole stage, so menus fit even when the game frame is small.
  const stage = h('main', { class: 'gc-stage' }, frame, overlay);
  const app = h('div', { class: 'gc-app' }, bar, stage);
  document.body.classList.add('gc-body');
  document.body.append(app);

  const ctx = mode === '2d' ? canvas.getContext('2d') : null;
  const input = createInput({ canvas, width, height });

  // ---------- Scaling ----------
  let dpr = 1;
  function fit() {
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const scale = Math.min(availW / width, availH / height);
    const fw = Math.max(1, Math.floor(width * scale));
    const fh = Math.max(1, Math.floor(height * scale));
    frame.style.width = `${fw}px`;
    frame.style.height = `${fh}px`;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (ctx) {
      canvas.width = Math.round(fw * dpr);
      canvas.height = Math.round(fh * dpr);
      // Games always draw in logical units (width × height).
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      ctx.imageSmoothingEnabled = true;
    }
    onResize(fw, fh, dpr);
  }
  new ResizeObserver(fit).observe(stage);

  // ---------- State ----------
  let state = 'title'; // title | playing | paused | over
  let score = 0;
  let best = 0; // this page visit only
  let helpReturn = null;

  function setScore(n) {
    score = n;
    scoreValue.textContent = Math.floor(n).toLocaleString();
  }

  // setStats({ Lives: 3, Level: 2 }) — small labelled readouts in the bar.
  function setStats(obj) {
    const keys = Object.keys(obj);
    if (stats.dataset.keys !== keys.join('|')) {
      stats.dataset.keys = keys.join('|');
      stats.replaceChildren(...keys.map((k) => h('div', { class: 'gc-stat' }, h('span', {}, k), h('b', { 'data-k': k }))));
    }
    for (const k of keys) stats.querySelector(`[data-k="${CSS.escape(k)}"]`).textContent = obj[k];
  }

  function controlsList() {
    const rows = help.map(([keys, action]) => h('div', { class: 'gc-row' }, h('kbd', {}, keys), h('span', {}, action)));
    if (touch) rows.push(h('div', { class: 'gc-row' }, h('kbd', {}, 'Touch'), h('span', {}, touch)));
    return h('div', { class: 'gc-controls' }, rows);
  }

  function showPanel(kind, ...content) {
    overlay.dataset.kind = kind;
    overlay.replaceChildren(h('div', { class: 'gc-panel' }, content));
    overlay.hidden = false;
    overlay.querySelector('.gc-btn-primary')?.focus({ preventScroll: true });
  }

  function hidePanel() {
    overlay.hidden = true;
    overlay.replaceChildren();
    document.activeElement?.blur?.();
  }

  const btn = (label, onclick, primary = false) =>
    h('button', { class: primary ? 'gc-btn gc-btn-primary' : 'gc-btn', type: 'button', onclick }, label);
  const backLink = () => h('a', { class: 'gc-btn', href: back }, 'Back to cabinet');

  function showTitle() {
    state = 'title';
    setPauseIcon();
    showPanel(
      'title',
      h('h2', { class: 'gc-panel-title' }, title),
      tagline ? h('p', { class: 'gc-tagline' }, tagline) : null,
      controlsList(),
      h('div', { class: 'gc-actions' }, btn('Play', start, true)),
      h('p', { class: 'gc-hint' }, 'Press Enter to play')
    );
  }

  function showHelp() {
    if (overlay.dataset.kind === 'help') return;
    if (state === 'playing') pause();
    helpReturn = state;
    showPanel(
      'help',
      h('h2', { class: 'gc-panel-title' }, 'Controls'),
      controlsList(),
      h('p', { class: 'gc-hint' }, 'Esc / P pause · M mute'),
      h('div', { class: 'gc-actions' }, btn('Close', closeHelp, true))
    );
  }

  function closeHelp() {
    const to = helpReturn;
    helpReturn = null;
    if (to === 'title') showTitle();
    else if (to === 'over') showOver(lastOver);
    else showPaused();
  }

  function showPaused() {
    showPanel(
      'paused',
      h('h2', { class: 'gc-panel-title' }, 'Paused'),
      h('div', { class: 'gc-actions' }, btn('Resume', resume, true), btn('Restart', start)),
      h('p', { class: 'gc-hint' }, 'Press Esc or P to resume')
    );
  }

  let lastOver = {};
  function showOver(o) {
    lastOver = o;
    showPanel(
      'over',
      h('h2', { class: `gc-panel-title${o.win ? ' is-win' : ''}` }, o.title || 'Game Over'),
      o.message ? h('p', { class: 'gc-tagline' }, o.message) : null,
      h(
        'div',
        { class: 'gc-results' },
        h('div', {}, h('span', {}, 'Score'), h('b', {}, Math.floor(score).toLocaleString())),
        h('div', {}, h('span', {}, 'Best this visit'), h('b', {}, Math.floor(best).toLocaleString()))
      ),
      h('div', { class: 'gc-actions' }, btn('Play again', start, true), backLink()),
      h('p', { class: 'gc-hint' }, 'Press Enter to play again')
    );
  }

  function setPauseIcon() {
    pauseBtn.innerHTML = icon(state === 'paused' ? 'play' : 'pause');
    pauseBtn.disabled = !(state === 'playing' || state === 'paused');
  }

  // ---------- Transitions ----------
  function start() {
    setScore(0);
    init(shell);
    input.reset();
    hidePanel();
    state = 'playing';
    setPauseIcon();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    input.reset();
    setPauseIcon();
    showPaused();
  }

  function resume() {
    if (state !== 'paused') return;
    hidePanel();
    input.reset();
    state = 'playing';
    setPauseIcon();
  }

  // gameOver({ title, message, win }) — call from the game when a run ends.
  function gameOver(o = {}) {
    if (state !== 'playing') return;
    state = 'over';
    best = Math.max(best, score);
    setPauseIcon();
    showOver(o);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else app.requestFullscreen?.().catch(() => {});
  }

  onMuteChange((m) => (muteBtn.innerHTML = icon(m ? 'muted' : 'sound')));

  // Shell shortcuts. Registered after the input module, so input.reset() in start()
  // clears the Enter/Space that started the game.
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const confirm = e.code === 'Enter' || e.code === 'Space';
    const pauseKey = e.code === 'Escape' || e.code === 'KeyP';
    if (muteKey && e.code === muteKey) return toggleMute();
    if (overlay.dataset.kind === 'help' && !overlay.hidden) {
      if (confirm || e.code === 'Escape') {
        e.preventDefault();
        closeHelp();
      }
      return;
    }
    // Let Enter/Space activate a focused overlay button instead of double-firing.
    if (confirm && document.activeElement?.closest?.('.gc-overlay')) return;
    if ((state === 'title' || state === 'over') && confirm) {
      e.preventDefault();
      start();
    } else if (state === 'playing' && pauseKey) pause();
    else if (state === 'paused' && (pauseKey || confirm)) {
      e.preventDefault();
      resume();
    }
  });

  // Auto-pause when the player leaves the tab or window.
  document.addEventListener('visibilitychange', () => document.hidden && pause());
  window.addEventListener('blur', pause);

  const loop = createLoop({
    update(dt) {
      if (state !== 'playing') return;
      update(dt, shell);
      input.endFrame();
    },
    render() {
      render(ctx, shell);
    },
  });

  const shell = {
    canvas,
    ctx,
    frame,
    input,
    width,
    height,
    get state() {
      return state;
    },
    get score() {
      return score;
    },
    get dpr() {
      return dpr;
    },
    setScore,
    addScore: (n) => setScore(score + n),
    setStats,
    gameOver,
    pause,
    resume,
    restart: start,
    boot() {
      fit();
      init(shell);
      showTitle();
      loop.start();
    },
  };
  return shell;
}
