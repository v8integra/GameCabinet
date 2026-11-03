// Procedural cabinet-card art. Each function draws a 400×250 scene for one game.

import { TAU, seeded } from './util.js';

export const THUMB_W = 400;
export const THUMB_H = 250;

const W = THUMB_W;
const H = THUMB_H;

function vgrad(ctx, top, bottom, y0 = 0, y1 = H) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

function fillBg(ctx, top, bottom) {
  ctx.fillStyle = vgrad(ctx, top, bottom);
  ctx.fillRect(0, 0, W, H);
}

function stars(ctx, seed, count, color = '#fff') {
  const r = seeded(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.3 + r() * 0.7;
    const s = r() < 0.15 ? 2 : 1;
    ctx.fillRect(Math.floor(r() * W), Math.floor(r() * H), s, s);
  }
  ctx.globalAlpha = 1;
}

function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function noGlow(ctx) {
  ctx.shadowBlur = 0;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const DRAW = {
  serpent(ctx) {
    fillBg(ctx, '#06160d', '#0a2216');
    ctx.strokeStyle = 'rgba(77,255,136,0.07)';
    for (let x = 0; x <= W; x += 25) ctx.strokeRect(x, -1, 0, H + 2);
    for (let y = 0; y <= H; y += 25) ctx.strokeRect(-1, y, W + 2, 0);
    const path = [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [6, 6], [6, 5], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5], [10, 6], [11, 6], [12, 6]];
    path.forEach(([cx, cy], i) => {
      const t = i / (path.length - 1);
      ctx.fillStyle = `hsl(140, 100%, ${30 + t * 35}%)`;
      if (i === path.length - 1) glow(ctx, '#4dff88', 14);
      rrect(ctx, cx * 25 + 2, cy * 25 + 2, 21, 21, 6);
      ctx.fill();
    });
    noGlow(ctx);
    ctx.fillStyle = '#06160d';
    ctx.fillRect(12 * 25 + 15, 6 * 25 + 6, 4, 4);
    ctx.fillRect(12 * 25 + 15, 6 * 25 + 15, 4, 4);
    glow(ctx, '#ff4d4d', 16);
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(14 * 25 + 12.5, 6 * 25 + 13.5, 9, 0, TAU);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#4dff88';
    ctx.fillRect(14 * 25 + 12, 6 * 25 + 1, 6, 4);
  },

  brickfall(ctx) {
    fillBg(ctx, '#12061f', '#1d0a2e');
    const colors = ['#ff3d9a', '#ff8a3d', '#ffd23f', '#4dff88', '#2de2e6'];
    const gone = new Set(['1,3', '2,3', '2,4', '3,2', '3,3', '3,4', '3,5', '4,1', '4,4', '4,6']);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        if (gone.has(`${row},${col}`)) continue;
        ctx.fillStyle = colors[row];
        glow(ctx, colors[row], 8);
        rrect(ctx, 14 + col * 47.5, 22 + row * 20, 42, 14, 3);
        ctx.fill();
      }
    }
    noGlow(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(196, 216);
    ctx.lineTo(250, 150);
    ctx.stroke();
    ctx.setLineDash([]);
    glow(ctx, '#fff', 14);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(254, 145, 7, 0, TAU);
    ctx.fill();
    glow(ctx, '#2de2e6', 16);
    ctx.fillStyle = '#2de2e6';
    rrect(ctx, 150, 222, 96, 12, 6);
    ctx.fill();
    noGlow(ctx);
  },

  'merge-up'(ctx) {
    fillBg(ctx, '#1a1406', '#2a1e08');
    const vals = [[2, 4, 8, 2], [0, 16, 32, 4], [2, 64, 128, 8], [0, 4, 256, 512]];
    const colors = { 2: '#4a3c1c', 4: '#5c4a1e', 8: '#ff8a3d', 16: '#ff6a3d', 32: '#ff4d4d', 64: '#ff3d9a', 128: '#ffd23f', 256: '#ffe066', 512: '#fff2a8' };
    const size = 52;
    const gap = 6;
    const bw = size * 4 + gap * 5;
    const ox = (W - bw) / 2;
    const oy = (H - bw) / 2;
    ctx.fillStyle = '#3a2e12';
    rrect(ctx, ox, oy, bw, bw, 10);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    vals.forEach((row, r) =>
      row.forEach((v, c) => {
        const x = ox + gap + c * (size + gap);
        const y = oy + gap + r * (size + gap);
        ctx.fillStyle = v ? colors[v] : '#2c230e';
        if (v >= 128) glow(ctx, '#ffd23f', 14);
        rrect(ctx, x, y, size, size, 7);
        ctx.fill();
        noGlow(ctx);
        if (v) {
          ctx.fillStyle = v >= 128 ? '#2a1e08' : '#fff';
          ctx.font = `800 ${v >= 100 ? 18 : 22}px system-ui, sans-serif`;
          ctx.fillText(v, x + size / 2, y + size / 2 + 1);
        }
      })
    );
  },

  sapper(ctx) {
    fillBg(ctx, '#0c1222', '#131c33');
    const cell = 28;
    const cols = 13;
    const rows = 8;
    const ox = (W - cols * cell) / 2;
    const oy = (H - rows * cell) / 2;
    const open = ['00010000000000', '01111100000000', '01223110000000', '0112F211000000', '00123M21000000', '00011221100000', '00000011000000', '00000000000000'];
    const numColor = ['', '#7aa7ff', '#4dff88', '#ff8a3d', '#ff3d9a'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px system-ui, sans-serif';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = open[r][c];
        const x = ox + c * cell;
        const y = oy + r * cell;
        const revealed = ch !== '0' && ch !== 'F' && ch !== 'M';
        ctx.fillStyle = revealed ? '#1b2540' : ch === 'M' ? '#5a1424' : '#2c3a63';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        if (!revealed && ch !== 'M') {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + 1, y + 1, cell - 2, 3);
        }
        if (revealed) {
          ctx.fillStyle = numColor[+ch];
          ctx.fillText(ch, x + cell / 2, y + cell / 2 + 1);
        } else if (ch === 'F') {
          ctx.fillStyle = '#ff3d9a';
          ctx.beginPath();
          ctx.moveTo(x + 11, y + 6);
          ctx.lineTo(x + 21, y + 10);
          ctx.lineTo(x + 11, y + 14);
          ctx.fill();
          ctx.fillStyle = '#ddd';
          ctx.fillRect(x + 10, y + 6, 2, 16);
        } else if (ch === 'M') {
          glow(ctx, '#ff4d4d', 10);
          ctx.fillStyle = '#111';
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, 7, 0, TAU);
          ctx.fill();
          noGlow(ctx);
        }
      }
    }
  },

  'rock-drift'(ctx) {
    fillBg(ctx, '#03030a', '#0a0a1a');
    stars(ctx, 7, 90);
    const r = seeded(42);
    const rocks = [[70, 60, 34], [320, 70, 26], [300, 190, 40], [110, 190, 18], [190, 40, 12], [360, 140, 14]];
    ctx.strokeStyle = '#c9c3ff';
    ctx.lineWidth = 2;
    glow(ctx, '#8f86ff', 8);
    for (const [x, y, size] of rocks) {
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const d = size * (0.7 + r() * 0.35);
        ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(200, 128);
    ctx.rotate(-0.5);
    glow(ctx, '#ff8a3d', 12);
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.moveTo(-10, 6);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-10, -6);
    ctx.fill();
    glow(ctx, '#2de2e6', 10);
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, -11);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fff';
    for (const [x, y] of [[226, 112], [246, 101], [266, 90]]) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, TAU);
      ctx.fill();
    }
    noGlow(ctx);
    ctx.lineWidth = 1;
  },

  'star-swarm'(ctx) {
    fillBg(ctx, '#020414', '#06102a');
    stars(ctx, 3, 70, '#9fd8ff');
    const bug = (x, y, color, s = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      glow(ctx, color, 8);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(7, -2);
      ctx.lineTo(13, -6);
      ctx.lineTo(12, 4);
      ctx.lineTo(5, 8);
      ctx.lineTo(0, 4);
      ctx.lineTo(-5, 8);
      ctx.lineTo(-12, 4);
      ctx.lineTo(-13, -6);
      ctx.lineTo(-7, -2);
      ctx.closePath();
      ctx.fill();
      noGlow(ctx);
      ctx.fillStyle = '#020414';
      ctx.fillRect(-4, -3, 3, 3);
      ctx.fillRect(1, -3, 3, 3);
      ctx.restore();
    };
    const rowColors = ['#ff3d9a', '#ffd23f', '#2de2e6'];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if (row === 2 && col === 6) continue;
        bug(60 + col * 40, 34 + row * 30, rowColors[row]);
      }
    }
    ctx.strokeStyle = 'rgba(45,226,230,0.35)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(300, 94);
    ctx.bezierCurveTo(360, 140, 330, 190, 270, 165);
    ctx.stroke();
    ctx.setLineDash([]);
    bug(268, 164, '#2de2e6', 1.1);
    glow(ctx, '#ff3d9a', 10);
    ctx.fillStyle = '#ff3d9a';
    ctx.fillRect(199, 150, 3, 16);
    ctx.fillRect(199, 112, 3, 16);
    glow(ctx, '#fff', 12);
    ctx.fillStyle = '#e9fdff';
    ctx.beginPath();
    ctx.moveTo(200, 196);
    ctx.lineTo(214, 228);
    ctx.lineTo(200, 222);
    ctx.lineTo(186, 228);
    ctx.closePath();
    ctx.fill();
    noGlow(ctx);
  },

  'block-drop'(ctx) {
    fillBg(ctx, '#0d0618', '#160a26');
    const cell = 19;
    const cols = 10;
    const rows = 12;
    const ox = 105;
    const oy = 11;
    ctx.fillStyle = '#0a0514';
    ctx.fillRect(ox - 3, oy - 3, cols * cell + 6, rows * cell + 6);
    ctx.strokeStyle = '#3a2366';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 3, oy - 3, cols * cell + 6, rows * cell + 6);
    const colors = ['#b26bff', '#2de2e6', '#ffd23f', '#ff3d9a', '#4dff88', '#ff8a3d'];
    const stack = ['..........', '..........', '..........', '..........', '..........', '..........', '..........', '......3...', '.....331..', '4.22.1111.', '4422550000', '4425550033'];
    const block = (c, r, color) => {
      const x = ox + c * cell;
      const y = oy + r * cell;
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + 1, y + 1, cell - 2, 3);
    };
    stack.forEach((row, r) => [...row].forEach((ch, c) => ch !== '.' && block(c, r, colors[+ch])));
    glow(ctx, '#2de2e6', 12);
    [[3, 2], [4, 2], [5, 2], [4, 3]].forEach(([c, r]) => block(c, r, '#2de2e6'));
    noGlow(ctx);
    ctx.fillStyle = '#9d97c9';
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.fillText('NEXT', 318, 30);
    [[0, 0], [1, 0], [1, 1], [2, 1]].forEach(([c, r]) => {
      ctx.fillStyle = '#ff3d9a';
      ctx.fillRect(318 + c * 14, 40 + r * 14, 12, 12);
    });
    ctx.lineWidth = 1;
  },

  flutter(ctx) {
    fillBg(ctx, '#1b6f8a', '#f6a37a');
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const [x, y, s] of [[60, 50, 1], [250, 30, 0.8], [340, 80, 1.2]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 30 * s, 10 * s, 0, 0, TAU);
      ctx.ellipse(x + 18 * s, y - 6 * s, 20 * s, 10 * s, 0, 0, TAU);
      ctx.fill();
    }
    const pillar = (x, gapY) => {
      ctx.fillStyle = '#2a7a3a';
      ctx.fillRect(x, 0, 46, gapY - 45);
      ctx.fillRect(x, gapY + 45, 46, H);
      ctx.fillStyle = '#3fa152';
      ctx.fillRect(x - 4, gapY - 61, 54, 16);
      ctx.fillRect(x - 4, gapY + 45, 54, 16);
    };
    pillar(150, 110);
    pillar(320, 150);
    ctx.fillStyle = '#c99a5b';
    ctx.fillRect(0, 225, W, 25);
    ctx.fillStyle = '#8fd060';
    ctx.fillRect(0, 222, W, 6);
    ctx.save();
    ctx.translate(90, 118);
    ctx.rotate(-0.25);
    glow(ctx, '#ffb347', 12);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, TAU);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.ellipse(-5, 3, 9, 6, -0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(7, -4, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(8.5, -4, 2.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff6a3d';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(24, 3);
    ctx.lineTo(14, 6);
    ctx.fill();
    ctx.restore();
  },

  'hop-lane'(ctx) {
    const bands = [
      [0, 40, '#4c9a3a'],
      [40, 70, '#2a5d8f'],
      [110, 22, '#4c9a3a'],
      [132, 76, '#2c2c34'],
      [208, 42, '#4c9a3a'],
    ];
    for (const [y, h, c] of bands) {
      ctx.fillStyle = c;
      ctx.fillRect(0, y, W, h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let x = 0; x < W; x += 30) ctx.fillRect(x + (x / 30) % 2 * 8, 48 + ((x / 30) % 3) * 22, 14, 2);
    ctx.fillStyle = '#8a5a32';
    for (const [x, y, w] of [[20, 46, 110], [210, 46, 90], [90, 76, 120], [290, 76, 100]]) {
      rrect(ctx, x, y, w, 24, 8);
      ctx.fill();
    }
    ctx.fillStyle = '#e9e1a0';
    for (let x = 6; x < W; x += 40) ctx.fillRect(x, 169, 22, 3);
    const car = (x, y, color, dir) => {
      glow(ctx, color, 8);
      ctx.fillStyle = color;
      rrect(ctx, x, y, 58, 26, 6);
      ctx.fill();
      noGlow(ctx);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + (dir > 0 ? 34 : 8), y + 4, 14, 18);
      ctx.fillStyle = '#ffe9a0';
      ctx.fillRect(x + (dir > 0 ? 54 : 0), y + 4, 4, 5);
      ctx.fillRect(x + (dir > 0 ? 54 : 0), y + 17, 4, 5);
    };
    car(40, 138, '#ff3d9a', 1);
    car(250, 138, '#ffd23f', 1);
    car(140, 178, '#2de2e6', -1);
    car(330, 178, '#ff8a3d', -1);
    ctx.fillStyle = '#b8f56a';
    glow(ctx, '#b8f56a', 10);
    rrect(ctx, 186, 214, 28, 26, 9);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#111';
    ctx.fillRect(192, 219, 5, 5);
    ctx.fillRect(203, 219, 5, 5);
  },

  'sky-reach'(ctx) {
    fillBg(ctx, '#2a6cd6', '#9fdcff');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [x, y, s] of [[70, 40, 1], [300, 60, 1.3], [190, 120, 0.7]]) {
      ctx.beginPath();
      ctx.arc(x, y, 14 * s, 0, TAU);
      ctx.arc(x + 16 * s, y - 6 * s, 16 * s, 0, TAU);
      ctx.arc(x + 34 * s, y, 13 * s, 0, TAU);
      ctx.fill();
    }
    const plat = (x, y, w, color = '#4c3a8a') => {
      ctx.fillStyle = color;
      rrect(ctx, x, y, w, 12, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x + 6, y + 2, w - 12, 2);
    };
    plat(40, 180, 90);
    plat(230, 150, 80);
    plat(120, 96, 70);
    plat(280, 56, 90, '#2b9d6a');
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(262, 140, 18, 4);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) ctx.lineTo(265 + (i % 2) * 12, 150 - i * 1.6);
    ctx.stroke();
    ctx.lineWidth = 1;
    glow(ctx, '#ffd23f', 14);
    ctx.fillStyle = '#fff36b';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 10;
      const d = i % 2 ? 5 : 11;
      ctx.lineTo(320 + Math.cos(a) * d, 30 + Math.sin(a) * d);
    }
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#ff3d9a';
    glow(ctx, '#ff3d9a', 10);
    rrect(ctx, 150, 112, 22, 26, 10);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#fff';
    ctx.fillRect(156, 119, 4, 5);
    ctx.fillRect(164, 119, 4, 5);
    const g = vgrad(ctx, '#ff8a3d', '#5a1e0a', 210, H);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 214 + Math.sin(x * 0.05) * 5);
    ctx.lineTo(W, H);
    ctx.fill();
  },

  'putt-park'(ctx) {
    fillBg(ctx, '#0b2a1a', '#0e3622');
    ctx.fillStyle = '#3ddc84';
    ctx.beginPath();
    ctx.moveTo(40, 200);
    ctx.bezierCurveTo(30, 120, 120, 150, 160, 90);
    ctx.bezierCurveTo(200, 30, 340, 20, 360, 80);
    ctx.bezierCurveTo(380, 140, 300, 160, 280, 210);
    ctx.bezierCurveTo(260, 240, 60, 250, 40, 200);
    ctx.fill();
    ctx.strokeStyle = '#ece3c8';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#e6cf8a';
    ctx.beginPath();
    ctx.ellipse(250, 170, 34, 18, 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3aa0e0';
    ctx.beginPath();
    ctx.ellipse(170, 130, 28, 14, -0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff3d9a';
    glow(ctx, '#ff3d9a', 10);
    ctx.beginPath();
    ctx.arc(230, 75, 9, 0, TAU);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#0a1a10';
    ctx.beginPath();
    ctx.ellipse(320, 70, 8, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#eee';
    ctx.fillRect(319, 30, 2, 40);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(321, 30);
    ctx.lineTo(340, 37);
    ctx.lineTo(321, 44);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(90, 200);
    ctx.lineTo(150, 170);
    ctx.stroke();
    ctx.setLineDash([]);
    glow(ctx, '#fff', 10);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(88, 202, 6, 0, TAU);
    ctx.fill();
    noGlow(ctx);
  },

  bastion(ctx) {
    fillBg(ctx, '#203a1a', '#2a4a20');
    const r = seeded(9);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 60; i++) ctx.fillRect(r() * W, r() * H, 3, 3);
    ctx.strokeStyle = '#8a6a42';
    ctx.lineWidth = 28;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, 60);
    ctx.lineTo(130, 60);
    ctx.lineTo(130, 180);
    ctx.lineTo(280, 180);
    ctx.lineTo(280, 80);
    ctx.lineTo(410, 80);
    ctx.stroke();
    ctx.lineWidth = 1;
    const tower = (x, y, color, range) => {
      ctx.strokeStyle = `${color}55`;
      ctx.fillStyle = `${color}14`;
      ctx.beginPath();
      ctx.arc(x, y, range, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3a3550';
      rrect(ctx, x - 14, y - 14, 28, 28, 6);
      ctx.fill();
      glow(ctx, color, 12);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, TAU);
      ctx.fill();
      noGlow(ctx);
    };
    tower(200, 130, '#ff8a3d', 56);
    tower(70, 120, '#2de2e6', 44);
    tower(340, 140, '#ff3d9a', 48);
    for (const [x, y, c] of [[130, 120, '#ff5a5a'], [175, 180, '#ff5a5a'], [230, 180, '#ffd23f'], [280, 140, '#ff5a5a']]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#4dff88';
      ctx.fillRect(x - 8, y - 14, 16 * (0.4 + ((x * 7) % 6) / 10), 3);
    }
    glow(ctx, '#ff8a3d', 10);
    ctx.strokeStyle = '#ffcf8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(200, 130);
    ctx.lineTo(228, 176);
    ctx.stroke();
    noGlow(ctx);
    ctx.lineWidth = 1;
  },

  'hollow-maze'(ctx) {
    fillBg(ctx, '#05030c', '#0d0820');
    const cx = W / 2;
    const cy = 112;
    const depths = 6;
    for (let i = depths; i >= 0; i--) {
      const s = Math.pow(0.62, i);
      const hw = 230 * s;
      const hh = 150 * s;
      const fog = i / depths;
      ctx.fillStyle = `rgb(${Math.round(24 + fog * 30)}, ${Math.round(18 + fog * 20)}, ${Math.round(60 + fog * 50)})`;
      // Left and right walls of this segment.
      const n = Math.pow(0.62, i + 1);
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy - hh);
      ctx.lineTo(cx - 230 * n, cy - 150 * n);
      ctx.lineTo(cx - 230 * n, cy + 150 * n);
      ctx.lineTo(cx - hw, cy + hh);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + hw, cy - hh);
      ctx.lineTo(cx + 230 * n, cy - 150 * n);
      ctx.lineTo(cx + 230 * n, cy + 150 * n);
      ctx.lineTo(cx + hw, cy + hh);
      ctx.fill();
      ctx.strokeStyle = 'rgba(155,123,255,0.25)';
      ctx.strokeRect(cx - hw, cy - hh, hw * 2, hh * 2);
    }
    const fog = ctx.createRadialGradient(cx, cy, 4, cx, cy, 120);
    fog.addColorStop(0, 'rgba(120,100,200,0.55)');
    fog.addColorStop(1, 'rgba(120,100,200,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, H);
    glow(ctx, '#9b7bff', 12);
    ctx.fillStyle = '#e4dcff';
    for (let i = 1; i < 6; i++) {
      const s = Math.pow(0.62, i);
      ctx.beginPath();
      ctx.arc(cx, cy + 120 * s, 5 * s + 1, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(230,220,255,0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy - 6, 11, Math.PI, 0);
    ctx.lineTo(cx + 11, cy + 12);
    ctx.lineTo(cx + 5, cy + 8);
    ctx.lineTo(cx, cy + 12);
    ctx.lineTo(cx - 5, cy + 8);
    ctx.lineTo(cx - 11, cy + 12);
    ctx.fill();
    glow(ctx, '#ff3d9a', 8);
    ctx.fillStyle = '#ff3d9a';
    ctx.fillRect(cx - 6, cy - 8, 4, 4);
    ctx.fillRect(cx + 2, cy - 8, 4, 4);
    noGlow(ctx);
    ctx.fillStyle = '#0a0716';
    ctx.beginPath();
    ctx.ellipse(cx - 40, 238, 30, 42, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - 40, 190, 17, 0, TAU);
    ctx.fill();
    glow(ctx, '#ffd23f', 22);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(cx - 6, 206, 6, 0, TAU);
    ctx.fill();
    noGlow(ctx);
  },

  'ridge-rider'(ctx) {
    fillBg(ctx, '#2a1a4a', '#ff8a5a');
    glow(ctx, '#ffd23f', 30);
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(310, 110, 30, 0, TAU);
    ctx.fill();
    noGlow(ctx);
    ctx.fillStyle = '#5a2a5a';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) ctx.lineTo(x, 150 + Math.sin(x * 0.02) * 22 + Math.sin(x * 0.05) * 8);
    ctx.lineTo(W, H);
    ctx.fill();
    const ground = (x) => 200 - Math.sin((x - 40) * 0.012) * 40;
    ctx.fillStyle = '#3a2214';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, ground(x));
    ctx.lineTo(W, H);
    ctx.fill();
    ctx.strokeStyle = '#6a4a2a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) ctx.lineTo(x, ground(x));
    ctx.stroke();
    const bx = 170;
    const by = ground(bx) - 16;
    const slope = Math.atan2(ground(bx + 20) - ground(bx - 20), 40);
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(slope - 0.12);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 5;
    for (const wx of [-24, 24]) {
      ctx.beginPath();
      ctx.arc(wx, 4, 13, 0, TAU);
      ctx.stroke();
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff5a5a';
    glow(ctx, '#ff5a5a', 8);
    ctx.beginPath();
    ctx.moveTo(-24, 4);
    ctx.lineTo(-6, -10);
    ctx.lineTo(16, -12);
    ctx.lineTo(24, 4);
    ctx.moveTo(-6, -10);
    ctx.lineTo(6, 2);
    ctx.lineTo(16, -12);
    ctx.stroke();
    noGlow(ctx);
    ctx.strokeStyle = '#ece9ff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(-2, -30);
    ctx.lineTo(14, -22);
    ctx.stroke();
    ctx.fillStyle = '#2de2e6';
    ctx.beginPath();
    ctx.arc(0, -38, 8, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(200,150,100,0.5)';
    for (const [x, y, s] of [[136, 198, 5], [124, 192, 4], [112, 200, 3], [102, 194, 2]]) {
      ctx.beginPath();
      ctx.arc(x, ground(x) - (200 - y), s, 0, TAU);
      ctx.fill();
    }
  },
};

export function drawThumb(canvas, id) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  (DRAW[id] || ((c) => fillBg(c, '#111', '#222')))(ctx);
}
