// Idle Teams tale art: the pictures in the character creator. A night sky with the stars of each birth sign,
// and a small scene for every chapter of a life story, set in the home of each race. All drawn in code at low
// resolution and shown scaled up, so they sit next to the pixel heroes.
(function () {
  'use strict';
  const T = (window.ITT = {});
  const cache = new Map();
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const hex = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };

  function canvas(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
    const rect = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); };
    // two colours blended down the rows with ordered dithering, so gradients stay pixel art
    const band = (y0, y1, a, b, x0 = 0, x1 = w) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const t = (y - y0) / Math.max(1, y1 - y0 - 1) * 4; const k = Math.floor(t), f = t - k; px(x, y, mix(a, b, Math.min(1, (k + (f > BAYER[(y % 4) * 4 + (x % 4)] ? 1 : 0)) / 4))); } };
    const disc = (cx, cy, r, col) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(cx + x, cy + y, col); };
    const glow = (cx, cy, r, col, a) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a; g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2); g.globalAlpha = 1; };
    const line = (x1, y1, x2, y2, col) => { const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) || 1; for (let i = 0; i <= n; i++) px(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, col); };
    // a line of ground from a height function, filled to the bottom
    const ridge = (f, col, edge) => { for (let x = 0; x < w; x++) { const top = Math.round(f(x)); rect(x, top, 1, h - top, col); if (edge) px(x, top, edge); } };
    draw({ g, px, rect, band, disc, glow, line, ridge, w, h });
    return c;
  }
  const url = (key, make) => { if (!cache.has(key)) cache.set(key, make().toDataURL()); return cache.get(key); };

  // ------------------------------------------------------------------ birth signs

  // Each sign is a constellation: stars on a 48 x 48 sky, joined in order. A 0 in the list lifts the pen.
  const SIGNS = {
    anvil: [[6, 18], [14, 15], [40, 15], [40, 22], [31, 25], [37, 34], [13, 34], [19, 25], [14, 22], [6, 18]],
    lantern: [[24, 6], [20, 11], [28, 11], [24, 6], 0, [17, 16], [31, 16], [31, 34], [17, 34], [17, 16], 0, [24, 22], [24, 28]],
    comet: [[36, 12], [28, 20], [20, 28], [10, 38], 0, [36, 12], [31, 24], [22, 34], 0, [36, 12], [24, 18], [14, 24]],
    fox: [[12, 10], [18, 20], [30, 20], [36, 10], [36, 24], [24, 38], [12, 24], [12, 10]],
    oak: [[24, 42], [24, 28], 0, [24, 28], [14, 26], [10, 16], [18, 7], [30, 7], [38, 16], [34, 26], [24, 28]],
    bell: [[24, 7], [18, 14], [16, 26], [11, 34], [37, 34], [32, 26], [30, 14], [24, 7], 0, [24, 34], [24, 40]],
    tide: [[5, 30], [12, 22], [20, 25], [25, 16], [33, 12], [41, 18], [43, 28], 0, [5, 38], [16, 35], [28, 38], [42, 35]],
    hare: [[17, 5], [20, 20], 0, [27, 5], [25, 20], 0, [20, 20], [16, 26], [22, 30], [36, 30], [40, 38], [18, 40], [16, 26]],
    wolf: [[12, 9], [20, 14], [26, 10], [28, 18], [24, 28], [36, 30], [42, 38], [20, 40], [24, 28], 0, [20, 14], [15, 18]],
    hawk: [[5, 14], [16, 22], [24, 17], [32, 22], [43, 14], 0, [24, 17], [24, 34], [19, 41], 0, [24, 34], [29, 41]],
    ember: [[16, 40], [11, 28], [18, 18], [22, 24], [27, 7], [33, 18], [37, 28], [32, 40], [16, 40]],
    crown: [[11, 35], [11, 17], [18, 26], [24, 10], [30, 26], [37, 17], [37, 35], [11, 35]],
  };
  // the colour of each sign's sky, from deep winter blue round the year to the gold of the Crown
  const SIGN_SKY = { anvil: '#1a2a4a', lantern: '#1b1840', comet: '#24164a', fox: '#2a2040', oak: '#163a36', bell: '#2e1e3e', tide: '#123048', hare: '#2a2a46', wolf: '#2a1a34', hawk: '#33241e', ember: '#3a1a1e', crown: '#2e2614' };

  T.sign = (id) => url('sign:' + id, () => canvas(48, 48, ({ px, band, glow, line }) => {
    const sky = SIGN_SKY[id] || '#1b1840', pts = SIGNS[id] || [];
    band(0, 48, mix(sky, '#000000', 0.45), sky);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const r = hash(x + id.length * 31, y + id.charCodeAt(0)); if (r > 0.985) px(x, y, r > 0.996 ? '#c9c2e8' : '#5e5a86'); }
    glow(24, 24, 24, mix(sky, '#ffd25a', 0.35), 0.35);
    for (let i = 1; i < pts.length; i++) if (pts[i] && pts[i - 1]) line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 'rgba(255,226,160,.38)');
    pts.filter(Boolean).forEach(([x, y], i) => { glow(x + 0.5, y + 0.5, 4, '#ffe3a0', 0.5); if (i % 3 === 0) { px(x - 1, y, '#ffd25a'); px(x + 1, y, '#ffd25a'); px(x, y - 1, '#ffd25a'); px(x, y + 1, '#ffd25a'); } px(x, y, '#fffbe8'); });
  }));

  // ------------------------------------------------------------------ life story scenes

  // Where each race lives: the far land, the near ground, a tint over the sky and the colours of home.
  const LAND = {
    human: { far: '#5f8a56', near: '#3f6a34', tint: '#7fb0e0', home: 'house', wall: '#d8c8a8', roof: '#b0533a' },
    elf: { far: '#5d7f8e', near: '#2f5446', tint: '#9a8ad8', home: 'tree', wall: '#cdd8e4', roof: '#4f9a82' },
    dwarf: { far: '#7c7686', near: '#4a4652', tint: '#8a90a8', home: 'door', wall: '#6a6070', roof: '#e8eef4' },
    orc: { far: '#a0503a', near: '#7a3426', tint: '#e0703a', home: 'tent', wall: '#d9b48a', roof: '#8a4a2a' },
    felkin: { far: '#e0b36a', near: '#c99248', tint: '#f0c070', home: 'dome', wall: '#eadbb6', roof: '#c96a3a' },
    draka: { far: '#4e2a30', near: '#2e1a1e', tint: '#d0402a', home: 'nest', wall: '#3a2228', roof: '#ff6a2a' },
  };
  // The time of day of each chapter: [sky top, sky bottom, night?]
  const TIME = { family: ['#3a2a5a', '#e08a5a', 0], childhood: ['#5a9ad8', '#cfe6f2', 0], age: ['#0e0a1e', '#2c1f48', 1], setting: ['#4a5a9a', '#f2b070', 0], self: ['#0a0816', '#221a40', 1] };
  const INK = '#160c1a';

  function figure(rect, x, y, col, small) {
    // a little standing person, feet at (x, y)
    const s = small ? 0.7 : 1;
    rect(x - 1, y - Math.round(9 * s), 2, 2, col);
    rect(x - 1, y - Math.round(7 * s), 3, Math.round(4 * s), col);
    rect(x - 1, y - Math.round(3 * s), 1, Math.round(3 * s), col); rect(x + 1, y - Math.round(3 * s), 1, Math.round(3 * s), col);
  }
  function home(d, L, x, y, lit) {
    const { rect, px, disc, glow, line } = d, win = lit ? '#ffd25a' : '#2a2030';
    if (L.home === 'house') {
      rect(x, y - 12, 22, 12, L.wall); for (let i = 0; i < 8; i++) rect(x - 2 + i, y - 12 - i, 26 - i * 2, 1, L.roof);
      rect(x + 16, y - 22, 3, 6, '#6a5a50'); rect(x + 4, y - 9, 4, 4, win); rect(x + 12, y - 8, 4, 8, '#5a3a2a');
    } else if (L.home === 'tree') {
      rect(x + 7, y - 26, 8, 26, L.wall); disc(x + 11, y - 30, 11, L.roof); disc(x + 4, y - 24, 6, L.roof); disc(x + 18, y - 24, 6, L.roof);
      disc(x + 11, y - 12, 2, win); rect(x + 9, y - 6, 4, 6, '#3a4a50');
    } else if (L.home === 'door') {
      for (let i = 0; i < 18; i++) rect(x - 6 + i, y - 30 + Math.abs(i - 9) * 1.4, 1, 30, L.wall);
      rect(x + 1, y - 10, 6, 10, lit ? '#ffb340' : '#3a3040'); disc(x + 4, y - 10, 3, lit ? '#ffb340' : '#3a3040');
    } else if (L.home === 'tent') {
      for (let i = 0; i < 12; i++) rect(x + 11 - i, y - 14 + i, 2 + i * 2, 1, L.wall);
      line(x + 12, y - 18, x + 12, y - 14, '#5a3a2a'); line(x + 9, y - 17, x + 12, y - 14, '#5a3a2a');
      for (let i = 0; i < 5; i++) rect(x + 12 - i / 2, y - 5 + i, 1 + i, 1, lit ? '#ffb340' : '#3a2020');
      rect(x + 4, y - 9, 16, 1, L.roof);
    } else if (L.home === 'dome') {
      rect(x, y - 10, 20, 10, L.wall); disc(x + 10, y - 10, 8, L.wall); rect(x + 9, y - 21, 2, 4, L.roof);
      rect(x + 4, y - 7, 3, 3, win); rect(x + 12, y - 7, 4, 7, '#7a5030');
    } else {
      for (let i = 0; i < 20; i++) rect(x - 4 + i, y - 16 + Math.abs(i - 10) * 0.8, 1, 16, L.wall);
      disc(x + 6, y - 5, 5, '#140a0c'); disc(x + 6, y - 4, 2, '#e8c890'); if (lit) glow(x + 6, y - 5, 8, '#ff6a2a', 0.5);
    }
    if (lit) glow(x + 10, y - 8, 14, '#ffd25a', 0.18);
  }
  function far(d, L, race) {
    const { ridge, disc, glow, rect } = d;
    if (race === 'human') ridge((x) => 38 + 4 * Math.sin(x / 14) + 2 * Math.sin(x / 5), L.far);
    else if (race === 'elf') { ridge((x) => 42 + 2 * Math.sin(x / 9), L.far); for (let x = 4; x < 160; x += 11) { const hgt = 16 + ((x * 7) % 9); rect(x, 42 - hgt, 2, hgt, mix(L.wall, L.far, 0.4)); disc(x + 1, 42 - hgt, 4, mix(L.roof, L.far, 0.45)); } }
    else if (race === 'dwarf') ridge((x) => { const t = (x % 40) / 40; return 16 + Math.abs(t - 0.5) * 50 + ((x * 13) % 3); }, L.far, L.roof);
    else if (race === 'orc') { ridge((x) => 44 + Math.sin(x / 30), L.far); rect(20, 36, 18, 8, mix(L.far, '#000000', 0.15)); rect(120, 38, 24, 6, mix(L.far, '#000000', 0.15)); }
    else if (race === 'felkin') ridge((x) => 38 + 6 * Math.sin(x / 22) + 3 * Math.sin(x / 9), L.far, mix(L.far, '#ffffff', 0.3));
    else { ridge((x) => Math.max(20 + Math.abs(x - 46) * 0.9, 40 + Math.sin(x / 8)), L.far); glow(46, 20, 12, '#ff6a2a', 0.6); rect(43, 19, 7, 2, '#ff8a2a'); }
  }

  // A 160 x 64 scene: the race's land at the time of day of the chapter, with what happens in it.
  T.scene = (race, chapter) => url('scene:' + race + ':' + chapter, () => canvas(160, 64, (d) => {
    const { rect, px, band, disc, glow, line, ridge } = d, L = LAND[race] || LAND.human, [top, bot, night] = TIME[chapter] || TIME.family;
    band(0, 48, mix(top, L.tint, 0.18), mix(bot, L.tint, 0.18));
    if (night) for (let y = 0; y < 40; y++) for (let x = 0; x < 160; x++) { const r = hash(x + race.length * 17, y); if (r > 0.986) px(x, y, r > 0.996 ? '#fff4d0' : '#8a84b0'); }
    if (chapter === 'self') { disc(128, 13, 7, '#f4ecd2'); disc(131, 11, 6, mix(top, L.tint, 0.18)); }
    if (chapter === 'setting') { glow(80, 46, 30, '#ffd25a', 0.55); disc(80, 46, 7, '#ffe3a0'); }
    if (chapter === 'childhood') { disc(24, 12, 6, '#fff0b0'); rect(118, 10, 14, 2, '#ffffff'); rect(114, 12, 22, 2, '#f0f6fa'); line(100, 20, 108, 40, '#7a6a7a'); rect(97, 16, 5, 5, '#e05a5a'); }
    far(d, L, race);
    const nearC = night ? mix(L.near, '#0a0816', 0.45) : L.near;
    ridge((x) => 50 + Math.sin(x / 17) * 1.5, nearC, mix(nearC, '#ffffff', 0.12));
    for (let y = 51; y < 64; y++) for (let x = 0; x < 160; x++) if (hash(x, y + 99) > 0.93) px(x, y, mix(nearC, '#000000', 0.25));
    const ink = night ? '#06040a' : INK;
    if (chapter === 'family') {
      home(d, L, 104, 52, true); line(122, 28, 128, 14, 'rgba(220,210,220,.35)'); line(123, 22, 131, 10, 'rgba(220,210,220,.25)');
      figure(rect, 80, 54, ink); figure(rect, 88, 54, ink); figure(rect, 96, 54, ink, true);
    } else if (chapter === 'childhood') {
      home(d, L, 12, 52, false); figure(rect, 70, 55, ink, true); figure(rect, 86, 56, ink, true); line(87, 49, 100, 21, '#5a4a5a');
    } else if (chapter === 'age') {
      home(d, L, 120, 52, false); glow(70, 52, 22, '#ff8a2a', 0.55);
      rect(66, 53, 9, 2, '#5a3a22'); for (let i = 0; i < 6; i++) px(68 + (i % 3), 52 - Math.floor(i / 2), i < 3 ? '#ff8a2a' : '#ffd25a'); px(70, 48, '#fff0b0');
      figure(rect, 58, 56, '#2a1418'); rect(83, 51, 4, 5, '#2a1418'); rect(83, 48, 2, 2, '#2a1418');
    } else if (chapter === 'setting') {
      for (let y = 50; y < 64; y++) { const half = 1 + (y - 50) * 1.4; rect(80 - half, y, half * 2, 1, mix(nearC, '#d8c09a', 0.45)); }
      figure(rect, 82, 60, ink); rect(80, 52, 2, 4, '#5a3a22'); home(d, L, 12, 54, false);
    } else {
      ridge((x) => (x < 70 ? 40 + Math.pow(Math.abs(x - 34) / 6, 1.6) : 64), mix(nearC, '#000000', 0.3));
      figure(rect, 34, 40, '#000000'); line(37, 32, 39, 41, '#000000');
    }
  }));
})();
