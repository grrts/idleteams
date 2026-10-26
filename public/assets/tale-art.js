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
  const canvases = new Map();
  const sceneCanvas = (race, chapter) => { const k = race + ':' + chapter; if (!canvases.has(k)) canvases.set(k, drawScene(race, chapter)); return canvases.get(k); };
  T.scene = (race, chapter) => url('scene:' + race + ':' + chapter, () => sceneCanvas(race, chapter));
  const drawScene = (race, chapter) => canvas(160, 64, (d) => {
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
  });

  // ------------------------------------------------------------------ the picture of each answer

  // Every life story answer gets an emblem drawn over its chapter's scene. Emblems are drawn with plain canvas
  // shapes on a 32 x 32 grid, then snapped to whole pixels, outlined and lit from the top left like the heroes.
  const OUT = '#1a0f14';
  function emblem(draw) {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    const fill = (col) => { g.fillStyle = col; g.fill(); };
    const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    const C = (x, y, r, col) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); fill(col); };
    const E = (x, y, rx, ry, col, rot) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); fill(col); };
    const P = (pts, col) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); fill(col); };
    const L = (x1, y1, x2, y2, w, col) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = col; g.stroke(); };
    const A = (x, y, r, a0, a1, w, col) => { g.beginPath(); g.arc(x, y, r, a0, a1); g.lineWidth = w; g.lineCap = 'round'; g.strokeStyle = col; g.stroke(); };
    const cut = (f) => { g.globalCompositeOperation = 'destination-out'; f(); g.globalCompositeOperation = 'source-over'; };
    draw({ g, R, C, E, P, L, A, cut });
    // snap to pixels, then light and outline
    const im = g.getImageData(0, 0, 32, 32), d = im.data, solid = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 32 && d[(y * 32 + x) * 4 + 3] >= 110;
    const keep = new Uint8Array(1024); for (let i = 0; i < 1024; i++) keep[i] = d[i * 4 + 3] >= 110 ? 1 : 0;
    const out = g.createImageData(32, 32), o = out.data;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const i = y * 32 + x, j = i * 4;
      if (keep[i]) {
        const a = d[j + 3] / 255; let r = d[j] / a, gg = d[j + 1] / a, b = d[j + 2] / a;
        const lit = !solid(x - 1, y) || !solid(x, y - 1), dark = !solid(x + 1, y) || !solid(x, y + 1);
        const k = lit && !dark ? 1.18 : dark && !lit ? 0.72 : 1;
        o[j] = Math.min(255, r * k); o[j + 1] = Math.min(255, gg * k); o[j + 2] = Math.min(255, b * k); o[j + 3] = 255;
      } else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) { const [r, gg, b] = hex(OUT); o[j] = r; o[j + 1] = gg; o[j + 2] = b; o[j + 3] = 255; }
    }
    g.clearRect(0, 0, 32, 32); g.putImageData(out, 0, 0);
    return c;
  }
  const GOLD = '#ffd25a', GOLD2 = '#e8b84a', IRON = '#a3abb5', WOOD = '#8a5a34', PAPER = '#f2e8d0', BONE = '#eadfc4', RED = '#d0443a';
  const EMBLEMS = {
    sword: ({ g, P, R, C }) => { g.translate(16, 16); g.rotate(-0.75); g.translate(-16, -16); P([[14.5, 1], [17.5, 1], [17.5, 20], [16, 22], [14.5, 20]], '#dfe5ee'); R(10, 20, 12, 3, GOLD2); R(14.5, 23, 3, 5, '#6a4028'); C(16, 29.5, 2, GOLD2); },
    shield: ({ P, R, C }) => { P([[5, 4], [27, 4], [27, 15], [16, 29], [5, 15]], '#3f6fb8'); P([[5, 4], [16, 4], [16, 29], [5, 15]], '#5a86cc'); C(16, 14, 3.5, GOLD2); },
    crown: ({ P, R, C }) => { P([[4, 25], [4, 9], [10, 17], [16, 6], [22, 17], [28, 9], [28, 25]], GOLD); R(4, 22, 24, 3, GOLD2); C(16, 19, 2, '#e05a5a'); C(10, 20, 1.6, '#4aa3ff'); C(22, 20, 1.6, '#4aa3ff'); },
    wheat: ({ L, E }) => { [[16, 7], [10, 9], [22, 9]].forEach(([x, y]) => { L(16, 29, x, y, 1.6, '#c9a040'); for (let i = 0; i < 4; i++) { const t = i / 4, px = x + (16 - x) * t * 0.4, py = y + t * 9; E(px - 1.6, py, 1.4, 2.4, '#e8c060', -0.5); E(px + 1.6, py, 1.4, 2.4, '#e8c060', 0.5); } }); L(12, 22, 20, 22, 2, WOOD); },
    ship: ({ P, L, R }) => { P([[3, 20], [29, 20], [24, 27], [8, 27]], WOOD); L(16, 3, 16, 20, 1.6, '#5e3b22'); P([[17.5, 4], [17.5, 18], [28, 18]], PAPER); P([[14.5, 6], [14.5, 18], [6, 18]], '#e2d6bc'); R(1, 27, 30, 2, '#4aa3ff'); R(5, 29, 22, 1, '#7fc0ff'); },
    staff: ({ L, C, R }) => { L(9, 30, 20, 9, 2.4, WOOD); C(21, 7, 4.5, '#9a7aff'); C(20, 6, 1.6, '#e0d4ff'); R(26, 3, 1, 1, '#e0d4ff'); R(27, 12, 1, 1, '#e0d4ff'); R(13, 4, 1, 1, '#e0d4ff'); },
    book: ({ P, L }) => { P([[4, 8], [16, 10], [28, 8], [28, 26], [16, 28], [4, 26]], '#8a3a3a'); P([[6, 9], [16, 11], [16, 26], [6, 24]], PAPER); P([[16, 11], [26, 9], [26, 24], [16, 26]], '#e6dcc4'); for (let i = 0; i < 4; i++) { L(8, 14 + i * 3, 14, 15 + i * 3, 0.8, '#8a7a6a'); L(18, 15 + i * 3, 24, 14 + i * 3, 0.8, '#8a7a6a'); } },
    mug: ({ R, C, A }) => { A(22, 18, 5, -1.4, 1.4, 2.6, '#c9a060'); R(7, 10, 15, 18, '#c9a060'); R(7, 13, 15, 2, '#7a5a3a'); R(7, 23, 15, 2, '#7a5a3a'); C(9, 10, 3, '#fff8e8'); C(14.5, 9, 3.6, '#fff8e8'); C(19.5, 10, 2.8, '#fff8e8'); },
    coin: ({ C, R, E }) => { E(12, 24, 8, 3, GOLD2); E(12, 21, 8, 3, GOLD); E(12, 18, 8, 3, GOLD2); C(21, 13, 8, GOLD); C(21, 13, 5.5, GOLD2); R(20, 9, 2, 8, GOLD); },
    heart: ({ C, P }) => { C(10.5, 12, 6.5, '#e0445a'); C(21.5, 12, 6.5, '#e0445a'); P([[4.4, 14], [27.6, 14], [16, 28]], '#e0445a'); C(9, 10, 2, '#ff9aa8'); },
    grave: ({ R, C, P }) => { R(8, 13, 16, 16, '#8a8494'); C(16, 13, 8, '#8a8494'); R(15, 9, 2, 12, '#5a5560'); R(11.5, 12, 9, 2, '#5a5560'); R(4, 28, 24, 2, '#4f7a3a'); C(7, 26, 1.8, '#e05a5a'); },
    beast: ({ E, C, P, R, L }) => { E(18, 19, 9, 5.5, '#a0703a'); C(8.5, 14, 5, '#a0703a'); P([[5, 11], [7, 5], [10, 10]], '#7a5028'); P([[3, 15], [0.5, 17], [4, 18]], '#7a5028'); R(11, 22, 2.5, 7, '#7a5028'); R(22, 22, 2.5, 7, '#7a5028'); L(26, 17, 30, 12, 2, '#a0703a'); },
    wolf: ({ E, C, P, R, L }) => { E(19, 19, 9, 5, '#8a8494'); P([[3, 15], [9, 9], [14, 13], [12, 18], [6, 18]], '#9a94a4'); P([[8, 10], [9, 3], [12, 9]], '#6a6474'); R(12, 21, 2.5, 8, '#6a6474'); R(23, 21, 2.5, 8, '#6a6474'); L(27, 17, 31, 21, 2.4, '#8a8494'); },
    cat: ({ E, C, P, A }) => { E(16, 22, 7.5, 8, '#d9a35a'); C(16, 11, 6.5, '#d9a35a'); P([[10, 9], [10, 2], [14.5, 6]], '#d9a35a'); P([[22, 9], [22, 2], [17.5, 6]], '#d9a35a'); A(25, 22, 5, -1.6, 1.2, 2.4, '#d9a35a'); C(13.5, 11, 1.2, '#2a6a3a'); C(18.5, 11, 1.2, '#2a6a3a'); },
    bird: ({ E, C, P }) => { E(16, 17, 8, 10, '#a0805a'); E(16, 20, 5, 6, '#d8c09a'); P([[9, 8], [11, 3], [13, 8]], '#a0805a'); P([[23, 8], [21, 3], [19, 8]], '#a0805a'); C(12.5, 13, 3, GOLD); C(19.5, 13, 3, GOLD); C(12.5, 13, 1.2, OUT); C(19.5, 13, 1.2, OUT); P([[15, 16], [17, 16], [16, 19]], '#e8a040'); },
    stag: ({ E, C, L }) => { [[-1, 1]].length; L(12, 12, 6, 3, 1.6, BONE); L(8, 7, 4, 7, 1.4, BONE); L(20, 12, 26, 3, 1.6, BONE); L(24, 7, 28, 7, 1.4, BONE); E(16, 17, 5, 7, '#f0ece4'); C(16, 25, 3.5, '#f0ece4'); C(13.5, 16, 1, OUT); C(18.5, 16, 1, OUT); },
    tree: ({ R, C }) => { R(14, 18, 4, 12, '#7a4e30'); C(16, 11, 9, '#4f9a5a'); C(9, 15, 5.5, '#4f9a5a'); C(23, 15, 5.5, '#4f9a5a'); C(13, 8, 3, '#7ac07a'); },
    star: ({ P, C }) => { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 5.5 : 14, t = -Math.PI / 2 + (i * Math.PI) / 5; pts.push([16 + r * Math.cos(t), 17 + r * Math.sin(t)]); } P(pts, GOLD); C(14, 14, 2, '#fff4c0'); },
    moon: ({ C, cut }) => { C(16, 16, 12, '#f4ecd2'); cut(() => C(22, 12, 10, '#000')); C(9, 19, 1.5, '#d8ccb0'); },
    sun: ({ C, L }) => { for (let i = 0; i < 8; i++) { const t = (i * Math.PI) / 4; L(16 + 9 * Math.cos(t), 16 + 9 * Math.sin(t), 16 + 14 * Math.cos(t), 16 + 14 * Math.sin(t), 2, GOLD2); } C(16, 16, 7.5, GOLD); },
    fire: ({ P }) => { P([[16, 2], [25, 14], [25, 22], [16, 30], [7, 22], [7, 15], [11, 9], [13, 15]], '#ff6a2a'); P([[16, 12], [21, 19], [20, 25], [16, 28], [12, 25], [11, 20]], GOLD); },
    anvil: ({ P, R }) => { P([[2, 11], [10, 10], [29, 10], [29, 15], [21, 17], [23, 24], [26, 24], [26, 28], [7, 28], [7, 24], [10, 24], [13, 17], [7, 15]], '#5b5f6b'); R(26, 5, 1, 1, GOLD); R(22, 3, 1, 1, '#ffb340'); R(28, 7, 1, 1, '#ffb340'); },
    hammer: ({ L, R }) => { L(9, 29, 18, 12, 2.6, WOOD); R(13, 4, 15, 8, IRON); R(13, 4, 15, 2, '#c9d0d8'); },
    gem: ({ P, L }) => { P([[16, 3], [26, 11], [16, 29], [6, 11]], '#4ad0e0'); P([[16, 3], [21, 11], [16, 29], [11, 11]], '#8aeaf4'); L(6, 11, 26, 11, 0.8, '#d0faff'); },
    pick: ({ L, P }) => { L(8, 29, 20, 9, 2.6, WOOD); P([[4, 12], [15, 4], [29, 9], [27, 11.5], [16, 7.5], [6, 13.5]], IRON); },
    mountain: ({ P }) => { P([[1, 29], [12, 7], [18, 15], [23, 10], [31, 29]], '#7c7686'); P([[9, 12], [12, 7], [15, 12], [13.5, 11], [12, 13], [10.5, 11]], '#eef2f6'); P([[21, 13], [23, 10], [25, 13]], '#eef2f6'); },
    song: ({ C, L, P }) => { L(13, 22, 13, 6, 1.6, GOLD); L(24, 19, 24, 3, 1.6, GOLD); P([[12.2, 5], [24.8, 2], [24.8, 6], [12.2, 9]], GOLD); C(10, 22, 3.6, GOLD); C(21, 19, 3.6, GOLD); },
    drum: ({ R, E, L }) => { R(7, 13, 18, 13, '#b0533a'); E(16, 26, 9, 3, '#b0533a'); E(16, 13, 9, 3.2, '#e9d8b0'); for (let i = 0; i < 4; i++) L(8 + i * 5, 16, 11 + i * 5, 25, 1, '#e9d8b0'); L(20, 10, 28, 3, 1.6, WOOD); L(12, 10, 5, 4, 1.6, WOOD); },
    bow: ({ A, L, P }) => { A(8, 16, 13, -1.05, 1.05, 2.6, WOOD); L(14.5, 4.8, 14.5, 27.2, 0.7, PAPER); L(4, 16, 27, 16, 1.4, '#e9e2cf'); P([[31, 16], [26, 13], [26, 19]], IRON); P([[4, 16], [1, 13], [2, 16], [1, 19]], '#c04040'); },
    dagger: ({ g, P, R }) => { g.translate(16, 16); g.rotate(0.75); g.translate(-16, -16); P([[14.8, 4], [17.2, 4], [17.2, 17], [16, 19.5], [14.8, 17]], '#dfe5ee'); R(11, 17, 10, 2.5, '#5a4a6a'); R(14.8, 19.5, 2.4, 6, '#2a2030'); },
    egg: ({ E, C, L }) => { E(16, 17, 9, 12, '#e8c890'); C(12, 13, 1.8, '#c97a4a'); C(19, 20, 2.2, '#c97a4a'); C(14, 24, 1.4, '#c97a4a'); L(18, 7, 15, 10, 0.9, '#7a4a2a'); L(15, 10, 18, 12, 0.9, '#7a4a2a'); },
    dragon: ({ P, C, L }) => { P([[2, 21], [12, 13], [15, 6], [19, 12], [29, 14], [28, 19], [18, 19], [12, 26]], '#c0402a'); P([[15, 6], [13, 1], [18, 8]], BONE); C(19, 14, 1.4, GOLD); L(26, 18, 29, 22, 1, '#ff8a2a'); },
    wing: ({ P, L }) => { P([[3, 26], [9, 7], [16, 14], [23, 5], [29, 24], [23, 19], [16, 24], [9, 20]], '#b0533a'); L(3, 26, 9, 7, 1.4, '#6a2a1a'); L(9, 7, 16, 14, 1.2, '#6a2a1a'); L(16, 14, 23, 5, 1.2, '#6a2a1a'); L(16, 14, 16, 24, 1, '#6a2a1a'); },
    storm: ({ C, R, P, L }) => { C(10, 11, 5.5, '#8a90a8'); C(17, 9, 6.5, '#9aa0b8'); C(23, 12, 5, '#8a90a8'); R(6, 11, 21, 6, '#8a90a8'); P([[17, 16], [12, 24], [16, 24], [13, 31], [21, 21], [17, 21], [20, 16]], GOLD); L(8, 20, 6, 25, 1, '#7fb8ff'); L(25, 20, 23, 25, 1, '#7fb8ff'); },
    scroll: ({ R, L, C }) => { R(8, 6, 16, 20, PAPER); R(6, 4, 20, 3, '#d8c09a'); R(6, 25, 20, 3, '#d8c09a'); for (let i = 0; i < 4; i++) L(10, 10 + i * 3.5, 21, 10 + i * 3.5, 0.8, '#8a7a6a'); C(20, 22, 2.6, RED); },
    signpost: ({ L, P }) => { L(16, 30, 16, 4, 2.6, '#7a4e30'); P([[16, 6], [28, 6], [31, 9], [28, 12], [16, 12]], '#b88a5a'); P([[16, 14], [4, 14], [1, 17], [4, 20], [16, 20]], '#a07a4a'); },
    cage: ({ R, A, L }) => { A(16, 12, 9, Math.PI, 0, 1.6, '#5b5f6b'); for (let x = 7; x <= 25; x += 4.5) L(x, 12, x, 28, 1.4, '#5b5f6b'); R(5, 27, 22, 3, '#5b5f6b'); R(15, 1, 2, 3, '#5b5f6b'); },
    skull: ({ C, R, P }) => { C(16, 13, 9, BONE); R(10.5, 18, 11, 7, BONE); C(12.5, 13, 2.6, OUT); C(19.5, 13, 2.6, OUT); P([[16, 16], [14.5, 19], [17.5, 19]], OUT); for (let i = 0; i < 3; i++) R(12.5 + i * 3, 22, 1, 3, '#a89e88'); },
    eye: ({ P, C }) => { P([[2, 16], [9, 10], [16, 8], [23, 10], [30, 16], [23, 22], [16, 24], [9, 22]], PAPER); C(16, 16, 6, '#7a4ad0'); C(16, 16, 2.6, OUT); C(14, 14, 1.2, '#ffffff'); },
    potion: ({ C, R }) => { C(16, 21, 9, '#cfe8f0'); C(16, 22, 7.5, '#7be07f'); R(12.5, 4, 7, 10, '#cfe8f0'); R(12, 2, 8, 3, WOOD); C(12, 18, 1.6, '#e8fff0'); },
    leaf: ({ L, E }) => { L(8, 29, 22, 6, 1.4, '#3a6a3a'); [[11, 22, -0.8], [16, 15, -0.8], [20, 9, -0.8]].forEach(([x, y, r]) => { E(x - 3, y, 2.4, 5, '#5fa05a', r); E(x + 3, y + 1, 2.4, 5, '#5fa05a', -r); }); },
    bell: ({ P, C, A }) => { A(16, 5, 2.6, 0, Math.PI * 2, 1.4, GOLD2); P([[9, 23], [10, 12], [16, 7], [22, 12], [23, 23], [26, 26], [6, 26]], GOLD2); C(16, 27.5, 2.2, '#a07a2a'); P([[11, 12], [16, 8], [14, 22], [11, 22]], GOLD); },
    ring: ({ A, C }) => { A(16, 19, 8, 0, Math.PI * 2, 3.2, GOLD2); C(16, 10, 4, '#e05a5a'); C(15, 9, 1.2, '#ffc0c0'); },
    tusk: ({ P, L }) => { L(4, 6, 28, 6, 1, '#7a4e30'); P([[10, 7], [14, 7], [17, 16], [16, 24], [12, 29], [13, 21], [12, 14]], BONE); P([[19, 7], [22, 7], [24, 13], [22, 19], [21, 13]], BONE); },
    drop: ({ P, C }) => { P([[16, 2], [23.5, 15], [24, 21], [21, 27], [16, 29], [11, 27], [8, 21], [8.5, 15]], '#4aa3ff'); C(12.5, 20, 1.8, '#c0e4ff'); },
    snow: ({ L }) => { for (let i = 0; i < 6; i++) { const t = (i * Math.PI) / 3, x = 16 + 13 * Math.cos(t), y = 16 + 13 * Math.sin(t); L(16, 16, x, y, 1.8, '#e8f4ff'); const mx = 16 + 8 * Math.cos(t), my = 16 + 8 * Math.sin(t); L(mx, my, mx + 4 * Math.cos(t + 0.8), my + 4 * Math.sin(t + 0.8), 1.2, '#e8f4ff'); L(mx, my, mx + 4 * Math.cos(t - 0.8), my + 4 * Math.sin(t - 0.8), 1.2, '#e8f4ff'); } },
    hourglass: ({ R, P }) => { R(7, 3, 18, 3, WOOD); R(7, 26, 18, 3, WOOD); P([[9, 6], [23, 6], [17, 16], [23, 26], [9, 26], [15, 16]], '#cfe8f0'); P([[11, 8], [21, 8], [16, 14]], '#e8c890'); P([[16, 19], [21, 26], [11, 26]], '#e8c890'); },
    flower: ({ L, C, E }) => { L(16, 30, 16, 14, 1.6, '#3a7a3a'); E(12, 23, 3.5, 1.8, '#5fa05a', -0.5); for (let i = 0; i < 5; i++) { const t = (i * 2 * Math.PI) / 5 - Math.PI / 2; C(16 + 5.5 * Math.cos(t), 11 + 5.5 * Math.sin(t), 3.8, '#e05a8a'); } C(16, 11, 3, GOLD); },
    fist: ({ R, C, L }) => { R(8, 11, 17, 14, '#c98a5a'); for (let i = 0; i < 4; i++) C(10 + i * 4.2, 11, 2.4, '#c98a5a'); R(5, 14, 5, 8, '#c98a5a'); R(10, 25, 13, 5, '#7a4e30'); for (let i = 0; i < 3; i++) L(12 + i * 4.2, 10, 12 + i * 4.2, 15, 0.8, '#8a5a3a'); },
    dove: ({ P, L, E }) => { P([[3, 15], [11, 12], [15, 4], [19, 12], [29, 9], [23, 16], [16, 22], [8, 19]], '#f4f0e8'); L(3, 15, 0, 17, 1.4, '#e8a040'); L(16, 22, 24, 28, 1.2, '#3a7a3a'); E(20, 26, 2.2, 1.2, '#5fa05a', 0.6); E(23, 28.5, 2.2, 1.2, '#5fa05a', 0.6); },
    house: ({ R, P }) => { R(7, 15, 18, 14, '#d8c8a8'); P([[4, 16], [16, 4], [28, 16]], '#b0533a'); R(21, 6, 3, 6, '#6a5a50'); R(14, 21, 5, 8, '#5a3a2a'); R(9, 18, 4, 4, GOLD); },
    kin: ({ C, P }) => { [[8, 13, 4, '#c9a080'], [24, 13, 4, '#b08a6a'], [16, 18, 3.2, '#e0b890']].forEach(([x, y, r, col]) => { C(x, y - r - 2, r, col); P([[x - r - 1.5, 30], [x - r + 0.5, y], [x + r - 0.5, y], [x + r + 1.5, 30]], col); }); },
    critter: ({ E, C, L }) => { for (let i = 0; i < 3; i++) { L(12 + i * 4, 18, 7 + i * 4, 26, 1.2, '#4a3a3a'); L(12 + i * 4, 18, 17 + i * 4, 26, 1.2, '#4a3a3a'); } E(16, 18, 9, 5, '#8a5a4a'); C(6, 16, 3.5, '#8a5a4a'); C(5, 15, 1, GOLD); L(25, 17, 30, 10, 1.8, '#8a5a4a'); },
    cup: ({ P, R, A }) => { A(8, 11, 4, 1.2, 4.8, 2, GOLD2); A(24, 11, 4, -1.6, 1.9, 2, GOLD2); P([[7, 5], [25, 5], [23, 15], [18, 19], [14, 19], [9, 15]], GOLD); R(14, 19, 4, 5, GOLD2); R(10, 24, 12, 4, GOLD2); },
    lantern: ({ R, C, P }) => { R(15, 1, 2, 4, '#5b5f6b'); P([[10, 6], [22, 6], [24, 10], [8, 10]], '#5b5f6b'); R(10, 10, 12, 14, '#ffd25a'); R(9, 10, 2, 14, '#5b5f6b'); R(21, 10, 2, 14, '#5b5f6b'); R(8, 24, 16, 3, '#5b5f6b'); C(16, 17, 3, '#fff4c0'); },
    chest: ({ R, P, C }) => { R(5, 15, 22, 13, WOOD); P([[5, 15], [7, 8], [25, 8], [27, 15]], '#a06a3e'); R(5, 14, 22, 2, '#5b5f6b'); R(14.5, 15, 3, 5, GOLD2); C(10, 8, 2, GOLD); C(16, 7.5, 2.4, GOLD); C(21, 8.5, 1.8, '#4ad0e0'); },
    mask: ({ P, C }) => { P([[3, 11], [16, 9], [29, 11], [27, 18], [20, 21], [16, 17], [12, 21], [5, 18]], '#2a2030'); C(10.5, 14.5, 2.4, '#ffd25a'); C(21.5, 14.5, 2.4, '#ffd25a'); },
  };
  // Which emblem an answer gets: the first rule that matches its words, else the question's own emblem.
  const RULES = [
    ['egg', /\b(egg|eggs|eggshell|clutch|hatch\w*)\b/], ['dragon', /\b(dragon\w*|wyvern|wyrm|sand-wyrm|scale)\b/], ['wing', /\b(flight|flew|fly|glid\w*|updraft|sky-rider|sky-hunters|wing\w*|in the air|grounded)\b/],
    ['lantern', /\blantern/], ['bell', /\bbell\b/], ['ring', /\b(ring|bead)\b/], ['tusk', /\b(tusk|fetish|totem)\b/], ['drum', /\bdrum\w*/], ['potion', /\b(heal\w*|healer|plague|fever|mend\w*|potion|pouch)\b/],
    ['leaf', /\b(herb\w*|leaf|sapling)\b/], ['flower', /\b(flower|bloom)\b/], ['mug', /\b(inn|tavern|brew\w*|drink\w*|flask|ale)\b/], ['song', /\b(song|choir|bard|saga\w*|story|storytellers|skald|composing|danc\w*)\b/],
    ['bow', /\b(arch\w*|arrow|bow\w*|bowstring)\b/], ['dagger', /\b(burglar\w*|thie\w*|pick\w* pockets|stole|steal\w*|pounced)\b/], ['mask', /\b(gang|outcasts|rival)\b/],
    ['crown', /\b(king|lord|crown|courtier|ambassador\w*|envoy|signet|warchief|heir|honou?r|name|war-name|remembered)\b/], ['shield', /\b(shield\w*|guard\w*|warden\w*|protect\w*|defend\w*|patrol)\b/],
    ['sword', /\b(knight\w*|squire\w*|sword|duel|sergeant|veteran|war|battle|raiders|fight\w*|glory|vengeance|whetstone|trial|sky-rider)\b/],
    ['staff', /\b(wizard\w*|mage|archmage|shaman\w*|priest\w*|spirit\w*|starweav\w*|flame-speak\w*|dragon-speak\w*|rune\w*|prophecy)\b/],
    ['book', /\b(scholar|book|lore\w*|read\w*|studied|stud\w*|letter|charts|knowing|learn)\b/], ['scroll', /\b(debt|map\w*|exile\w*|exiled)\b/],
    ['anvil', /\b(forge\w*|smith\w*|shieldwright\w*|masterwork|craft|iron|forge-coal|built)\b/], ['gem', /\b(gem\w*|mithril|crystal\w*|relic|shard|shin\w*)\b/], ['coin', /\b(gold|fortune|coin|merchant|trade\w*|peddl\w*|treasure|hoard\w*|rich|counting|spice)\b/],
    ['pick', /\b(mine\w*|miner\w*|tunnel\w*|dug|dig\w*|below|cave-in|delv\w*)\b/], ['mountain', /\b(mountain|earthquake|pass|cliff\w*|volcano\w*)\b/],
    ['fire', /\b(fire|flame|ember\w*|burn\w*|burned|eruption|ash|sparks|cold|hot)\b/], ['snow', /\b(snow\w*)\b/], ['storm', /\b(thunder|storm|rain|sandstorm|wind)\b/],
    ['ship', /\b(sail\w*|sea|ship|dock\w*|boat)\b/], ['drop', /\b(water|running dry|deep water)\b/], ['wheat', /\b(farm\w*|harvest|famine|fields|fed)\b/],
    ['star', /\b(star\w*|comet|stars|unknown|adventure)\b/], ['moon', /\b(moon\w*|night)\b/], ['sun', /\b(sun|sky)\b/],
    ['bird', /\b(owl|hawk|bird\w*)\b/], ['stag', /\b(stag)\b/], ['wolf', /\b(wolf|wolves|fox|fennec)\b/], ['cat', /\b(cat\w*|kit|kits|littermates?|runt|nine-lived|ghost-cat)\b/],
    ['beast', /\b(dog|pony|boar|beast\w*|beast-riders)\b/], ['critter', /\b(spider|scorpion|sand-scorpion|lizard|sand-lizard|salamander|fire-salamander|goblins|troll)\b/],
    ['tree', /\b(tree\w*|grove|forest\w*|dryad|canopy)\b/], ['cage', /\b(cag\w*|captured|prisoner)\b/], ['skull', /\b(dying|death|fallen|ghost|slew|lost control)\b/],
    ['dove', /\b(peace\w*|talked down|mercy|feud|saved|rescued)\b/], ['fist', /\b(wrestl\w*|brawl|temper|rage|fights|tournaments?|contest)\b/], ['cup', /\b(won|games|race|racing)\b/],
    ['hourglass', /\b(fading|haste|eternity|old|boredom|last life|forgotten|forgetting|silence)\b/], ['eye', /\b(curiosity|curious|watch)\b/],
    ['house', /\b(home|village|hold|nest|town|inn)\b/], ['heart', /\b(love|friend\w*|twin\w*|brother\w*|sister\w*|cousin\w*)\b/], ['kin', /\b(sibling\w*|family|parents|clan|litter|dozen)\b/], ['signpost', /\b(road|travel\w*|follow\w*|chased|left|leav\w*|caravan\w*)\b/],
  ];
  const BY_QUESTION = { grandparents: 'kin', parents: 'house', siblings: 'kin', birth: 'star', friend: 'heart', play: 'cup', teen: 'signpost', firstfight: 'sword', mentor: 'book', leaving: 'signpost', deed: 'cup', loss: 'grave', fear: 'eye', keepsake: 'chest', drive: 'star', home: 'house', youth: 'signpost' };
  T.motif = (qid, label, sentence) => {
    if (qid === 'loss' && /\b(nothing|none)\b/i.test(label)) return 'dove';
    if (qid === 'loss') return 'grave';
    const a = String(label).toLowerCase(), b = (label + ' ' + (sentence || '')).toLowerCase();
    for (const [m, re] of RULES) if (re.test(a)) return m;
    for (const [m, re] of RULES) if (re.test(b)) return m;
    return BY_QUESTION[qid] || 'star';
  };
  T.emblem = (m) => url('emblem:' + m, () => emblem(EMBLEMS[m] || EMBLEMS.star));
  // An answer's picture: the chapter scene, darkened round the edge, with the answer's emblem large in its sky.
  T.answer = (race, chapter, motif) => url('ans:' + race + ':' + chapter + ':' + motif, () => canvas(160, 64, ({ g, glow }) => {
    g.drawImage(sceneCanvas(race, chapter), 0, 0);
    g.fillStyle = 'rgba(10,6,14,.35)'; g.fillRect(0, 0, 160, 64);
    glow(80, 26, 30, '#ffe3a0', 0.45);
    const e = emblem(EMBLEMS[motif] || EMBLEMS.star); g.imageSmoothingEnabled = false; g.drawImage(e, 64, 6, 32, 32);
    g.globalAlpha = 0.35; g.drawImage(e, 64, 40, 32, -8); g.globalAlpha = 1;
  }));
})();
