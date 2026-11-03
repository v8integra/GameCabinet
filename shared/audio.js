// Synthesized sound effects (Web Audio) — no audio files needed.
// The mute setting lasts for the browser tab's visit only (sessionStorage).

const MASTER_VOLUME = 0.5;

let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = readMuted();
const listeners = new Set();

function readMuted() {
  try {
    return sessionStorage.getItem('gc-muted') === '1';
  } catch {
    return false;
  }
}

// Browsers only allow audio after a user gesture, so create the context lazily.
function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function unlock() {
  ensure();
  if (ctx && ctx.state === 'running') {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  }
}
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);

// pan: -1 (left) … 1 (right), for positional cues.
export function tone({ freq = 440, to = null, dur = 0.1, type = 'square', vol = 0.3, delay = 0, attack = 0.005, pan = 0 } = {}) {
  const c = ensure();
  if (!c || muted) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = gain;
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    gain.connect(p);
    out = p;
  }
  osc.connect(gain);
  out.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function noise({ dur = 0.2, vol = 0.3, delay = 0, freq = 1200, to = null, q = 1, filter = 'lowpass' } = {}) {
  const c = ensure();
  if (!c || muted) return;
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  f.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const notes = (freqs, { gap = 0.08, dur = 0.12, vol = 0.15, type = 'triangle' } = {}) =>
  freqs.forEach((freq, i) => tone({ freq, dur, vol, type, delay: i * gap }));

const PRESETS = {
  blip: () => tone({ freq: 660, dur: 0.06, vol: 0.12 }),
  select: () => notes([523, 784], { gap: 0.06, dur: 0.09 }),
  coin: () => notes([988, 1319], { gap: 0.07, dur: 0.16, type: 'square', vol: 0.12 }),
  bounce: () => tone({ freq: 300, to: 420, dur: 0.06, type: 'triangle', vol: 0.25 }),
  hit: () => tone({ freq: 220, to: 110, dur: 0.1, vol: 0.18 }),
  shoot: () => tone({ freq: 900, to: 200, dur: 0.12, vol: 0.1 }),
  jump: () => tone({ freq: 300, to: 700, dur: 0.15, vol: 0.12 }),
  explode: () => noise({ dur: 0.45, vol: 0.4, freq: 1800, to: 100 }),
  powerup: () => notes([440, 554, 659, 880], { gap: 0.07 }),
  hurt: () => {
    tone({ freq: 200, to: 80, dur: 0.25, type: 'sawtooth', vol: 0.16 });
    noise({ dur: 0.15, vol: 0.15, freq: 800 });
  },
  lose: () => notes([392, 330, 277, 196], { gap: 0.18, dur: 0.24 }),
  win: () => notes([523, 659, 784, 1047], { gap: 0.1, dur: 0.18 }),
};

export function sfx(name) {
  PRESETS[name]?.();
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = !!value;
  try {
    sessionStorage.setItem('gc-muted', muted ? '1' : '0');
  } catch {
    // Storage blocked: mute still works for this page.
  }
  if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
  listeners.forEach((fn) => fn(muted));
}

export const toggleMute = () => setMuted(!muted);

export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
