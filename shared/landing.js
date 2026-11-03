// Builds the cabinet landing page from games.js.

import { GAMES, GENRES } from './games.js';
import { drawThumb } from './thumbs.js';

const CONTROL_ICONS = {
  keyboard:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  mouse: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  touch:
    '<path d="M9 11V5a1.5 1.5 0 013 0v5"/><path d="M12 10V8.5a1.5 1.5 0 013 0V11"/><path d="M15 10.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-4.7-2.3L4 15.5a1.5 1.5 0 012.3-1.9L9 16"/>',
};
const CONTROL_LABELS = { keyboard: 'Keyboard', mouse: 'Mouse', touch: 'Touch' };

function controlIcon(kind) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${CONTROL_LABELS[kind]}"><title>${CONTROL_LABELS[kind]}</title>${CONTROL_ICONS[kind]}</svg>`;
}

function card(game, index) {
  const el = document.createElement(game.live ? 'a' : 'div');
  el.className = `card${game.live ? '' : ' is-soon'}`;
  el.style.setProperty('--card-accent', game.accent);
  el.dataset.genres = game.genres.join('|');
  if (game.live) el.href = `games/${game.id}/`;
  else el.setAttribute('aria-disabled', 'true');

  const no = String(index + 1).padStart(2, '0');
  el.innerHTML = `
    <div class="card-thumb">
      <canvas aria-hidden="true"></canvas>
      <span class="card-no">No. ${no}</span>
      <span class="card-badge ${game.live ? 'is-live' : 'is-soon'}">${game.live ? 'Play' : 'Coming soon'}</span>
    </div>
    <div class="card-body">
      <h3 class="card-title"></h3>
      <p class="card-hook"></p>
      <div class="card-meta">
        ${game.genres.map((g) => `<span class="tag">${g}</span>`).join('')}
        <span class="ctrls">${game.controls.map(controlIcon).join('')}</span>
      </div>
    </div>`;
  el.querySelector('.card-title').textContent = game.title;
  el.querySelector('.card-hook').textContent = game.hook;
  drawThumb(el.querySelector('canvas'), game.id);
  return el;
}

const grid = document.getElementById('grid');
grid.append(...GAMES.map(card));

const live = GAMES.filter((g) => g.live).length;
document.getElementById('count').textContent =
  live === GAMES.length ? `${GAMES.length} games ready to play` : `${live} of ${GAMES.length} games playable · more coming`;

// Genre filter chips.
const filters = document.getElementById('filters');
const chips = ['All', ...GENRES].map((name) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = name;
  b.setAttribute('aria-pressed', String(name === 'All'));
  b.addEventListener('click', () => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    for (const c of grid.children) {
      c.hidden = name !== 'All' && !c.dataset.genres.split('|').includes(name);
    }
  });
  return b;
});
filters.append(...chips);
