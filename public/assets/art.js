// Idle Teams art kit: item icons, monsters, UI icons and dungeon scenery, all drawn in code with the same
// pixel buffer as the heroes (pixel.js), so every piece gets the same outline and three-tone shading.
(function () {
  'use strict';
  const P = window.ITP, { Buf, mix } = P;
  const A = (window.ITA = {});
  const cache = new Map();
  const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  const url = (key, make) => memo('u:' + key, () => memo(key, make).toDataURL());

  // ------------------------------------------------------------------ palettes

  // Gear tiers change the look: plain iron and leather at common, coloured trim at rare, gems and tinted
  // metal at epic, gold with a glow at legendary.
  const TIER = {
    common: { metal: '#a3abb5', cloth: '#8c6a4c', trim: '#6e5440', gem: null, glow: null },
    rare: { metal: '#bfcadb', cloth: '#3f6fb8', trim: '#e9e2cf', gem: '#4aa3ff', glow: null },
    epic: { metal: '#b9a6d6', cloth: '#6b3fa8', trim: '#f0c23a', gem: '#e05aff', glow: '#c084ff' },
    legendary: { metal: '#e8b84a', cloth: '#b8401a', trim: '#fff0b0', gem: '#ff6a2a', glow: '#ffb340' },
  };
  A.TIER = TIER;

  // ------------------------------------------------------------------ item icons (32 x 32)

  const HATS = {
    helm: [['M-14.4 1.6 Q-15 -16 0 -16.6 Q15 -16 14.4 1.6 L10 1.6 L9 -4 L-9.5 -4 L-10.5 1.6 Z', 'metal'], ['M-2 -16 Q2 -25 11 -23 Q6 -19.6 4 -15.4 Z', 'cloth'], ['M-12 -4.6 L-9.6 -4.6 L-9.6 4 L-12 4 Z', 'metal']],
    viking: [['M-14.4 0 Q-15 -16.4 0 -17 Q15 -16.4 14.4 0 Q0 -4 -14.4 0 Z', 'metal'], ['M-14 -2 Q0 -6.4 14 -2 L14 1.4 Q0 -3 -14 1.4 Z', 'trim'], ['M-10 -10 Q-21 -12 -20 -26 Q-16 -17 -7 -15 Z', '#f2e8d0'], ['M9 -11 Q20 -14 19 -27 Q15 -18 6 -15.4 Z', '#f2e8d0']],
    wizard: [['M-17 -6 Q1 -12 19 -6 Q20 -3 1 -4 Q-18 -3 -17 -6 Z', 'cloth'], ['M-10 -8 Q-3 -32 17 -30 Q7 -23 11 -8 Z', 'cloth'], ['M-9.6 -11 Q1 -14 11 -11.6 L11 -8.6 Q1 -11 -9.8 -8.4 Z', 'trim']],
    pot: [['M-13.4 -6 L13.4 -6 L12.4 -20 Q0 -22 -12.4 -20 Z', '#5d6470'], ['M12 -17 L22 -18 L22 -14.6 L12 -13.4 Z', '#3a3434']],
    frog: [['M-15.4 2 Q-16.4 -16.4 0 -16.4 Q16.4 -16.4 15.4 2 Q14 8 10 10 L8 2 Q0 -4 -10 -1 L-13 6 Z', '#6cbf4a']],
    crown: [['M-7.4 -11 L-8.4 -20 L-4 -15.4 L-1 -22 L2 -15.4 L6.4 -20 L5.4 -11 Q-1 -12.8 -7.4 -11 Z', '#f0c23a']],
    bandana: [['M-14 -3.6 Q0 -10.6 14 -5 L14.2 -0.4 Q0 -6 -14 0.6 Z', 'cloth'], ['M13 -4 L20 -7 L19 -1 L22 1.4 L14 1.4 Z', 'cloth']],
    hood: [['M-15.6 2 Q-16.6 -17.6 0 -17.6 Q16.6 -17.6 15.6 0 L9.4 4 Q9.4 -8.4 -2 -9.4 Q-11.4 -9.4 -12.4 2 Z', 'cloth']],
  };

  function drawIcon(slot, base, rarity, seed) {
    const T = TIER[rarity] || TIER.common, b = new Buf(32, 32);
    const col = (c) => (T[c] !== undefined ? T[c] || T.metal : c);
    const path = (d, c, tx = 16, ty = 16, s = 1, rot = 0) => { b.next(); b.path(d, tx, ty, s, col(c), null, rot); };
    const gem = (x, y, r = 1.6) => { if (!T.gem) return; b.next(); b.ellipse(x, y, r, r, T.gem); b.set(Math.round(x - 0.5), Math.round(y - 0.5), '#ffffff', { flat: true }); };
    const look = { metal: T.metal, dye1: T.cloth, dye2: T.trim };
    switch (slot) {
      case 'weapon':
        P.weapon(b, Object.assign({ weapon: base }, look), base === 'bow' ? 15 : base === 'daggers' || base === 'wand' ? 10 : 8, base === 'bow' ? 16 : base === 'daggers' || base === 'wand' ? 23 : 25, { spear: 0.66, staff: 0.72, bow: 1.15, daggers: 1.45, wand: 1.4, pan: 1.1 }[base] || 1.05, base === 'bow' ? 30 : 45);
        if (T.gem && base !== 'bow') gem(base === 'staff' || base === 'wand' ? 23 : 10, base === 'staff' || base === 'wand' ? 8 : 21, 1.4);
        break;
      case 'offhand': P.offhand(b, Object.assign({ offhand: base }, look), 16, 15, base === 'book' ? 2 : 1.35); if (base !== 'book') gem(16, 14, 1.6); break;
      case 'head': (HATS[base] || HATS.helm).forEach(([d, c]) => path(d, c, 16, base === 'wizard' ? 26 : 22, base === 'wizard' ? 0.82 : 0.95)); if (base === 'helm' || base === 'viking') gem(16, 14); break;
      case 'top':
        if (base === 'robe') { path('M-7 -12 L7 -12 L9 -9 L12 13 L-12 13 L-9 -9 Z', 'cloth'); path('M-1.5 -12 L1.5 -12 L1.5 13 L-1.5 13 Z', 'trim'); path('M-8 -2 L8 -2 L8 0.5 L-8 0.5 Z', 'trim'); }
        else if (base === 'plate') { path('M-11 -11 L11 -11 L10 6 Q0 13 -10 6 Z', 'metal'); path('M-6 -9 L6 -9 L5 4 Q0 8 -5 4 Z', 'cloth'); path('M-14 -12 Q-11 -15 -7 -12 L-8 -6 L-14 -7 Z', 'metal'); path('M14 -12 Q11 -15 7 -12 L8 -6 L14 -7 Z', 'metal'); gem(16, 11); }
        else if (base === 'leather') { path('M-10 -11 L10 -11 L10 11 L-10 11 Z', '#7a5236'); path('M-10 -11 L-1 -11 L-5 3 Z', 'cloth'); path('M-10 6 L10 6 L10 8.5 L-10 8.5 Z', '#3d2a1e'); b.next(); b.line(6, 6, 24, 23, '#3d2a1e', { flat: true }); }
        else { path('M-13 -11 L13 -11 L15 -2 L11 -1 L10 12 L-10 12 L-11 -1 L-15 -2 Z', 'cloth'); path('M-3 -11 L0 -7 L3 -11 Z', 'trim'); if (base === 'sweater') for (let y = 8; y < 28; y += 4) { b.next(); b.rect(7, y, 18, 1, col('trim')); } else path('M-10 6 L10 6 L10 8 L-10 8 Z', 'trim'); }
        break;
      case 'bottom':
        if (base === 'kilt') { path('M-10 -10 L10 -10 L13 6 L-13 6 Z', 'cloth'); path('M-10 -10 L10 -10 L10 -7 L-10 -7 Z', '#3d2a1e'); b.next(); for (let x = -9; x < 12; x += 4) b.line(16 + x, 10, 16 + x * 1.25, 21, col('trim'), { flat: true }); }
        else if (base === 'shorts') { path('M-10 -9 L10 -9 L11 3 L1 3 L0 -2 L-1 3 L-11 3 Z', 'cloth'); path('M-10 -9 L10 -9 L10 -6.5 L-10 -6.5 Z', '#3d2a1e'); }
        else { const c = base === 'greaves' ? 'metal' : 'cloth'; path('M-9 -12 L9 -12 L9 13 L2 13 L0 -3 L-2 13 L-9 13 Z', c); path('M-9 -12 L9 -12 L9 -9 L-9 -9 Z', base === 'greaves' ? 'cloth' : '#3d2a1e'); if (base === 'greaves') { path('M-8 2 L-3 2 L-3 5 L-8 5 Z', 'trim'); path('M3 2 L8 2 L8 5 L3 5 Z', 'trim'); } }
        break;
      case 'shoes': {
        const c = base === 'sabatons' ? 'metal' : base === 'sandals' ? '#a87a4a' : base === 'curly' ? 'cloth' : '#6a4428';
        if (base === 'curly') path('M-3 -10 L5 -10 L5 4 L10 4 L10 9 L-12 9 Q-16 9 -15 4 Q-14 1 -11 3 L-3 3 Z', c);
        else path('M-3 -11 L6 -11 L6 3 Q11 4 11 9 L-11 9 Q-12 4 -3 3 Z', c);
        if (base === 'sandals') { b.next(); b.line(13, 8, 21, 8, '#5a3a24', { flat: true }); b.line(13, 14, 21, 14, '#5a3a24', { flat: true }); }
        else path('M-3 -11 L6 -11 L6 -8 L-3 -8 Z', base === 'sabatons' ? 'cloth' : 'trim');
        break;
      }
      case 'gloves': { const c = base === 'gauntlets' ? 'metal' : '#7a5236'; path('M-7 -2 L7 -2 L7 12 L-7 12 Z', c); path('M-7 -12 L-3 -12 L-3 -1 L-7 -1 Z', c); path('M-2.5 -14 L1.5 -14 L1.5 -1 L-2.5 -1 Z', c); path('M2 -12 L6 -12 L6 -1 L2 -1 Z', c); path('M7 -4 L12 -9 L14 -6 L8 2 Z', c); path('M-8 8 L8 8 L8 12 L-8 12 Z', base === 'gauntlets' ? 'cloth' : 'trim'); break; }
      case 'cape': if (base === 'scarf') { path('M-12 -10 Q0 -14 12 -10 L12 -5 Q0 -9 -12 -5 Z', 'cloth'); path('M4 -7 L10 -7 L12 14 L6 14 Z', 'cloth'); path('M6 10 L12 10 L12 12 L6 12 Z', 'trim'); }
        else { path('M-6 -13 L6 -13 L12 13 Q0 10 -12 13 Z', 'cloth'); path('M-7 -14 L7 -14 L7 -11 L-7 -11 Z', 'trim'); gem(16, 4); }
        break;
      case 'ring1': case 'ring2': b.next(); b.ellipse(16, 19, 9, 8, col('metal')); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const dx = (x + 0.5 - 16) / 5.5, dy = (y + 0.5 - 19.5) / 4.5; if (dx * dx + dy * dy <= 1) { b.m[y * 32 + x] = null; } } b.next(); b.ellipse(16, 10, 4, 4, T.gem || '#8fb8c8'); b.set(15, 8, '#ffffff', { flat: true }); break;
      case 'amulet': b.next(); for (let a = 0; a <= 180; a += 6) { const t = (a * Math.PI) / 180; b.set(16 + Math.cos(t) * 11, 6 + Math.sin(t) * 10, col('metal')); } path('M0 -2 L7 5 L0 14 L-7 5 Z', 'metal', 16, 12); b.next(); b.ellipse(16, 18, 3, 3.5, T.gem || '#5fb3a8'); b.set(15, 17, '#ffffff', { flat: true }); break;
      case 'trinket': {
        const k = (seed || 0) % 3;
        if (k === 0) { path('M-7 -12 L7 -12 L1.5 0 L7 12 L-7 12 L-1.5 0 Z', 'metal'); b.next(); b.rect(12, 8, 8, 2, '#f0d890'); b.rect(14, 20, 4, 3, '#f0d890'); }
        else if (k === 1) { b.next(); b.ellipse(16, 15, 9, 9, T.gem || '#6fb7ff'); b.glow(16, 15, 12, T.gem || '#6fb7ff'); path('M-8 8 L8 8 L6 13 L-6 13 Z', 'metal'); }
        else { path('M-9 -4 Q-9 -13 0 -13 Q9 -13 9 -4 L9 6 Q0 14 -9 6 Z', '#e8e0cc'); b.next(); b.rect(11, 13, 3, 3, '#2a1418'); b.rect(18, 13, 3, 3, '#2a1418'); gem(16, 21, 1.4); }
        break;
      }
      case 'glyph': {
        const g = (window.IT_GLYPH_COLORS || {})[base] || '#c9a8ff';
        path('M-11 -8 L-8 -12 L8 -12 L11 -8 L11 8 L8 12 L-8 12 L-11 8 Z', '#4a4458');
        b.next(); b.glow(16, 16, 11, g);
        const rune = { ember: 'M0 -8 L4 0 L0 8 L-4 0 Z M0 -3 L0 3', frost: 'M0 -8 L0 8 M-7 -4 L7 4 M-7 4 L7 -4', thorn: 'M0 -8 L0 8 M0 -2 L5 -6 M0 3 L-5 -1', tide: 'M-7 -2 Q-3 -7 0 -2 Q3 3 7 -2 M-7 4 Q-3 -1 0 4 Q3 9 7 4', storm: 'M2 -8 L-4 1 L1 1 L-2 8 L5 -2 L0 -2 Z', shadow: 'M-6 -6 Q6 -8 6 0 Q6 8 -6 6 Q2 3 2 0 Q2 -4 -6 -6 Z', light: 'M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z', stone: 'M-6 6 L-6 -2 L0 -8 L6 -2 L6 6 Z' }[base] || 'M-5 -5 L5 5 M5 -5 L-5 5';
        b.next(); rune.split(' M').forEach((seg, n) => { const pts = (n ? 'M' + seg : seg).match(/-?\d+(\.\d+)?/g).map(Number); for (let i = 0; i + 3 < pts.length; i += 2) b.line(16 + pts[i], 16 + pts[i + 1], 16 + pts[i + 2], 16 + pts[i + 3], mix(g, '#ffffff', 0.3), { flat: true }); });
        break;
      }
      default: path('M-8 -8 L8 -8 L8 8 L-8 8 Z', 'metal');
    }
    if (T.glow && slot !== 'glyph') { for (let i = 0; i < 4; i++) { const r = ((seed || 7) * (i + 3) * 7919) % 1000; b.glow(4 + (r % 24), 4 + ((r / 24) | 0) % 24, 1.6, '#ffffff'); } }
    return b.toCanvas();
  }
  A.iconCanvas = (it) => memo(['i', it.slot, it.base, it.rarity, (it.seed || 0) % 3].join(':'), () => drawIcon(it.slot === 'ring2' ? 'ring1' : it.slot, it.base, it.rarity, it.seed));
  A.icon = (it) => url(['i', it.slot, it.base, it.rarity, (it.seed || 0) % 3].join(':'), () => A.iconCanvas(it));

  // ------------------------------------------------------------------ UI icons (16 x 16)

  function ui(kind) {
    const b = new Buf(16, 16), path = (d, c, rot = 0, tx = 8, ty = 8, s = 1) => { b.next(); b.path(d, tx, ty, s, c, null, rot); };
    switch (kind) {
      case 'gold': b.next(); b.ellipse(8, 9, 6, 5.5, '#f0c23a'); b.next(); b.rect(7, 6, 2, 6, '#b8861a'); b.set(5, 6, '#fff4c0', { flat: true }); break;
      case 'materials': path('M-6 0 L-3 -4 L7 -4 L4 0 Z', '#b8c2cc'); path('M-6 0 L4 0 L4 4 L-6 4 Z', '#8a939e'); path('M4 0 L7 -4 L7 0 L4 4 Z', '#6a7380'); break;
      case 'essence': path('M0 -7 L5 -1 L0 7 L-5 -1 Z', '#c084ff'); b.next(); b.glow(8, 8, 7, '#e0c0ff'); break;
      case 'xp': path('M0 -7 L2 -2 L7 -2 L3 1.5 L4.5 7 L0 3.6 L-4.5 7 L-3 1.5 L-7 -2 L-2 -2 Z', '#ffd25a'); break;
      case 'tank': path('M-6 -6 L6 -6 L6 0 Q6 5 0 7.5 Q-6 5 -6 0 Z', '#6fb7ff'); path('M-3 -3.5 L3 -3.5 L3 0 Q3 3 0 4.5 Q-3 3 -3 0 Z', '#2f5fa8'); break;
      case 'healer': path('M-2 -7 L2 -7 L2 -2 L7 -2 L7 2 L2 2 L2 7 L-2 7 L-2 2 L-7 2 L-7 -2 L-2 -2 Z', '#6fd97a'); break;
      case 'dps': path('M-1.2 3 L-1.2 -7 L0 -9 L1.2 -7 L1.2 3 Z', '#e6ecf2', 45); path('M-4 3 L4 3 L4 5 L-4 5 Z', '#ff8a6b', 45); path('M-1 5 L1 5 L1 8 L-1 8 Z', '#6a4428', 45); break;
      case 'battle': path('M-1 4 L-1 -8 L0 -9 L1 -8 L1 4 Z', '#e6ecf2', 45); path('M-1 4 L-1 -8 L0 -9 L1 -8 L1 4 Z', '#e6ecf2', -45); path('M-3.5 4 L3.5 4 L3.5 5.5 L-3.5 5.5 Z', '#f0c23a', 45); path('M-3.5 4 L3.5 4 L3.5 5.5 L-3.5 5.5 Z', '#f0c23a', -45); break;
      case 'hero': path('M-6 3 Q-6.5 -6 0 -6.5 Q6.5 -6 6 3 L4 3 L3.5 -1 L-3.5 -1 L-4 3 Z', '#b8c2cc'); path('M-1 -6.5 Q1 -10 5 -9 Q3 -7.5 2 -6 Z', '#ff8a6b'); path('M-5 4 L5 4 L5 7 L-5 7 Z', '#3f6fb8'); break;
      case 'skills': path('M-6 -6 L6 -6 L6 7 L-6 7 Z', '#6b3fa8'); path('M-4.5 -6 L6 -6 L6 5 L-4.5 5 Z', '#f2ead8'); b.next(); b.glow(9, 7, 4, '#ffd25a'); b.set(9, 7, '#ffb340', { flat: true }); break;
      case 'gear': path('M-6 -6 L6 -6 L5.5 3 Q0 7.5 -5.5 3 Z', '#b8c2cc'); path('M-3 -5 L3 -5 L2.6 2 Q0 4 -2.6 2 Z', '#ff8a6b'); path('M-8 -6.5 Q-6 -8.5 -3.5 -6.5 L-4 -3 L-8 -3.5 Z', '#b8c2cc'); path('M8 -6.5 Q6 -8.5 3.5 -6.5 L4 -3 L8 -3.5 Z', '#b8c2cc'); break;
      case 'group': [[-4, '#6fb7ff'], [4, '#ff8a6b'], [0, '#6fd97a']].forEach(([x, c]) => { b.next(); b.ellipse(8 + x, x ? 6 : 5, 2.4, 2.4, '#f3cfb6'); b.next(); b.ellipse(8 + x, x ? 12 : 11, 3.2, 3, c); }); break;
      case 'guild': path('M-5 -7 L-3.5 -7 L-3.5 8 L-5 8 Z', '#8a5a34'); path('M-3.5 -6 L6 -6 L4 -2 L6 2 L-3.5 2 Z', '#c0392b'); b.next(); b.set(9, 6, '#f0c23a', { flat: true }); b.set(8, 6, '#f0c23a', { flat: true }); break;
      case 'market': path('M-6 -1 Q-7 7 0 7 Q7 7 6 -1 Q4 -4 0 -4 Q-4 -4 -6 -1 Z', '#a8763a'); path('M-2.5 -4 L-1.5 -7 L1.5 -7 L2.5 -4 Z', '#8a5a34'); b.next(); b.ellipse(8, 11, 2, 2, '#f0c23a'); break;
      case 'chat': path('M-7 -6 L7 -6 L7 3 L-1 3 L-5 7 L-4 3 L-7 3 Z', '#efe7ff'); b.next(); [5, 8, 11].forEach((x) => b.set(x, 6, '#5f4f80', { flat: true })); break;
      case 'chest': path('M-7 -2 L7 -2 L7 6 L-7 6 Z', '#8a5a34'); path('M-7 -2 Q-7 -7 0 -7 Q7 -7 7 -2 Z', '#a8763a'); path('M-1.5 -3 L1.5 -3 L1.5 2 L-1.5 2 Z', '#f0c23a'); break;
      case 'skull': path('M-5 0 Q-6 -7 0 -7 Q6 -7 5 0 L4 4 L-4 4 Z', '#efe7d8'); b.next(); b.rect(4, 7, 3, 2, '#2a1418'); b.rect(9, 7, 3, 2, '#2a1418'); break;
      case 'lock': path('M-5 -1 L5 -1 L5 7 L-5 7 Z', '#f0c23a'); b.next(); for (let a = 180; a <= 360; a += 10) { const t = (a * Math.PI) / 180; b.set(8 + Math.cos(t) * 3.4, 7 + Math.sin(t) * 4.4, '#b8c2cc'); b.set(8 + Math.cos(t) * 3.4, 6 + Math.sin(t) * 4.4, '#b8c2cc'); } break;
      case 'star': path('M0 -7 L2 -2 L7 -2 L3 1.5 L4.5 7 L0 3.6 L-4.5 7 L-3 1.5 L-7 -2 L-2 -2 Z', '#ffd25a'); break;
      case 'rage': path('M0 -7 Q6 -1 3 5 Q0 8 -3 5 Q-6 -1 0 -7 Z', '#ff5a3a'); break;
      case 'mana': path('M0 -7 Q6 0 4 4 Q2 7 0 7 Q-2 7 -4 4 Q-6 0 0 -7 Z', '#4aa3ff'); break;
      case 'talents': b.next(); b.line(8, 14, 8, 8, '#8a5a34', { flat: true }); b.line(8, 8, 3, 3, '#8a5a34', { flat: true }); b.line(8, 8, 13, 3, '#8a5a34', { flat: true }); b.line(8, 10, 12, 7, '#8a5a34', { flat: true });
        [[3, 3, '#ffd25a'], [13, 3, '#ff8a6b'], [12, 7, '#6fd97a'], [8, 8, '#c084ff']].forEach(([x, y, c]) => { b.next(); b.ellipse(x, y, 1.8, 1.8, c); }); break;
      case 'heritage': path('M-5 -7 L5 -7 L5 5 L0 2 L-5 5 Z', '#c0392b'); path('M-5 -7 L5 -7 L5 -4 L-5 -4 Z', '#f0c23a'); path('M0 -2 L2 0 L0 2 L-2 0 Z', '#f0c23a'); break;
      case 'energy': path('M2 -7 L-4 1 L0 1 L-2 7 L5 -1 L1 -1 Z', '#ffd25a'); break;
    }
    return b.toCanvas();
  }
  A.ui = (kind) => url('ui:' + kind, () => ui(kind));
  A.uiCanvas = (kind) => memo('ui:' + kind, () => ui(kind));
  // ------------------------------------------------------------------ skill glyphs (24 x 24)

  // One pixel glyph per skill type, drawn light so it reads on the coloured skill tile.
  function skillGlyph(type) {
    const b = new Buf(24, 24), W = '#fff6e6', S = '#ffd9a8';
    const path = (d, c = W, rot = 0) => { b.next(); b.path(d, 12, 12, 1.25, c, null, rot); };
    switch (type) {
      case 'strike': path('M-1.2 4 L-1.2 -8 L0 -9.5 L1.2 -8 L1.2 4 Z', W, 45); path('M-4 4 L4 4 L4 5.6 L-4 5.6 Z', S, 45); path('M-1 5.6 L1 5.6 L1 8.5 L-1 8.5 Z', '#8a5a34', 45); break;
      case 'aoe': path('M0 -8 L2 -3 L8 -4 L4 0 L8 4 L2 3 L0 8 L-2 3 L-8 4 L-4 0 L-8 -4 L-2 -3 Z', S); b.next(); b.ellipse(12, 12, 2.6, 2.6, W); break;
      case 'heal': path('M-2 -7 L2 -7 L2 -2 L7 -2 L7 2 L2 2 L2 7 L-2 7 L-2 2 L-7 2 L-7 -2 L-2 -2 Z'); break;
      case 'groupheal': path('M-1.4 -8 L1.4 -8 L1.4 -5 L4.4 -5 L4.4 -2.2 L1.4 -2.2 L1.4 0.8 L-1.4 0.8 L-1.4 -2.2 L-4.4 -2.2 L-4.4 -5 L-1.4 -5 Z'); [-5, 5].forEach((x) => { b.next(); b.ellipse(12 + x * 1.25, 19, 2.6, 2.6, S); }); b.next(); b.ellipse(12, 19.5, 2.6, 2.6, W); break;
      case 'hot': path('M-6 6 Q-7 -6 7 -7 Q7 6 -6 6 Z', W); b.next(); b.line(6, 18, 17, 7, '#3f8a5a', { flat: true }); break;
      case 'shield': b.next(); for (let a = 0; a < 360; a += 8) { const t = (a * Math.PI) / 180; b.set(12 + Math.cos(t) * 8, 12 + Math.sin(t) * 8, W); } b.next(); b.ellipse(12, 12, 4, 4, S); b.set(10, 10, W, { flat: true }); break;
      case 'taunt': path('M-1.8 -8 L1.8 -8 L1.2 3 L-1.2 3 Z'); b.next(); b.ellipse(12, 18, 2, 2, W); path('M-8 -4 L-5 -2 L-8 0 Z', S); path('M8 -4 L5 -2 L8 0 Z', S); break;
      case 'wall': path('M-7 -8 L7 -8 L7 1 Q7 6 0 9 Q-7 6 -7 1 Z'); path('M-1.2 -6 L1.2 -6 L1.2 6 L-1.2 6 Z', S); path('M-5 -1 L5 -1 L5 1 L-5 1 Z', S); break;
      case 'buff': path('M0 -8 L7 0 L3 0 L3 8 L-3 8 L-3 0 L-7 0 Z'); break;
      case 'mark': b.next(); for (let a = 0; a < 360; a += 8) { const t = (a * Math.PI) / 180; b.set(12 + Math.cos(t) * 7, 12 + Math.sin(t) * 7, W); } path('M-1 -9 L1 -9 L1 -3 L-1 -3 Z'); path('M-1 3 L1 3 L1 9 L-1 9 Z'); path('M-9 -1 L-3 -1 L-3 1 L-9 1 Z'); path('M3 -1 L9 -1 L9 1 L3 1 Z'); b.next(); b.ellipse(12, 12, 1.6, 1.6, S); break;
      case 'slow': b.next(); [0, 60, 120].forEach((a) => { const t = (a * Math.PI) / 180; b.line(12 - Math.cos(t) * 9, 12 - Math.sin(t) * 9, 12 + Math.cos(t) * 9, 12 + Math.sin(t) * 9, W, { flat: true }); }); b.ellipse(12, 12, 2, 2, S); break;
      case 'vanish': path('M-8 2 Q-8 -4 -3 -4 Q-1 -9 4 -7 Q9 -6 8 0 Q9 5 4 5 L-5 5 Q-8 5 -8 2 Z', W); b.next(); b.rect(7, 19, 10, 1, S); b.rect(9, 21, 6, 1, S); break;
      case 'dot': path('M0 -9 Q8 -1 5 5 Q2 9 0 9 Q-2 9 -5 5 Q-8 -1 -2 -5 Q-1 -1 1 0 Q2 -5 0 -9 Z', S); path('M0 -1 Q4 3 2 6 Q0 8 -2 6 Q-3 3 0 -1 Z', W); break;
      case 'pet': b.next(); b.ellipse(12, 15, 4.5, 3.8, W); [[-6, -1], [-2.4, -5.5], [2.4, -5.5], [6, -1]].forEach(([x, y]) => { b.next(); b.ellipse(12 + x, 12 + y, 1.9, 2.2, W); }); break;
      default: path('M0 -8 L2 -2 L8 -2 L3 1.5 L5 8 L0 4 L-5 8 L-3 1.5 L-8 -2 L-2 -2 Z', S);
    }
    return b.toCanvas();
  }
  A.skill = (type) => url('sk:' + type, () => skillGlyph(type));

  A.img = (kind, cls = 'ico') => '<img class="' + cls + '" alt="" src="' + A.ui(kind) + '">';

  // ------------------------------------------------------------------ monsters (facing right)

  function imp(frame, body, belly, big) {
    const W = big ? 44 : 30, H = big ? 46 : 32, b = new Buf(W, H), s = big ? 1.45 : 1, ox = big ? 4 : 2, oy = big ? 2 : 1;
    const T = (x, y) => [ox + x * s, oy + y * s], E = (x, y, rx, ry, c) => { b.next(); b.ellipse(...T(x, y), rx * s, ry * s, c); };
    const up = frame === 'idle1' ? -0.6 : 0, lunge = frame === 'atk' ? 2 : 0;
    // wings behind
    b.next(); b.path('M10 12 L1 4 L3 11 L0 15 L8 16 Z', ox, oy + up * s, s, mix(body, '#2b2347', 0.35));
    // tail
    b.next(); b.cap(...T(8, 22), ...T(2, 25 + up), 1.6 * s, body); b.next(); b.path('M-1 24 L3 21 L3 27 Z', ox, oy + up * s, s, belly);
    // legs
    E(11, 26.5, 2.6, 2.2, mix(body, '#2b2347', 0.2)); E(17, 26.5, 2.6, 2.2, body);
    // body and head
    E(14 + lunge * 0.4, 18 + up, 7, 7, body); E(15.5 + lunge * 0.4, 20 + up, 4, 4, belly);
    E(17 + lunge, 9 + up, 7, 6.4, body);
    b.next(); b.path('M12 5 L9 -1 L15 3 Z', ox + lunge * s, oy + up * s, s, '#f2e8d0'); b.next(); b.path('M20 4 L23 -2 L23 5 Z', ox + lunge * s, oy + up * s, s, '#f2e8d0');
    // eyes and mouth
    const hx = ox + (17 + lunge) * s, hy = oy + (9 + up) * s;
    b.rect(hx + 1 * s, hy - 1 * s, 2 * s, 2 * s, '#fff2a0', { flat: true }); b.rect(hx + 4.5 * s, hy - 1 * s, 1.6 * s, 2 * s, '#fff2a0', { flat: true });
    b.rect(hx + 1 * s, hy + 3 * s, 4 * s, 1, '#2a1418', { flat: true });
    // arm with claws
    const arm = frame === 'atk' ? [27, 14] : [22, 21 + up];
    b.next(); b.cap(...T(17, 16 + up), ...T(arm[0], arm[1]), 2.4 * s, body);
    if (big) { b.next(); b.cap(...T(arm[0] - 2, arm[1] + 4), ...T(arm[0] + 3, arm[1] - 9), 3.2 * s, '#6a4428'); b.next(); b.ellipse(...T(arm[0] + 3, arm[1] - 9), 3.4 * s, 3.4 * s, '#7a5236'); }
    b.glow(hx + 2 * s, hy, 3 * s, '#ffcf60');
    return b.toCanvas();
  }
  function hound(frame) {
    const b = new Buf(70, 46), up = frame === 'idle1' ? -1 : 0, bite = frame === 'atk';
    const fur = '#4a2a26', ember = '#ff7a2a', E = (x, y, rx, ry, c) => { b.next(); b.ellipse(x, y, rx, ry, c); };
    // back legs, tail
    b.next(); b.path('M10 22 Q0 12 2 4 Q6 14 14 18 Z', 0, up, 1, ember);
    const leg = (x, dx, c) => { b.next(); b.cap(x, 30, x + dx, 42, 5, c); b.next(); b.ellipse(x + dx + 1, 43, 3.6, 2, c); };
    leg(16, -3 * (up ? -1 : 1), mix(fur, '#1a0e14', 0.3)); leg(44, 2, mix(fur, '#1a0e14', 0.3));
    // body
    E(30, 27 + up, 19, 10, fur);
    b.next(); b.path('M16 18 L20 10 L24 17 L28 8 L32 16 L36 7 L40 16 L44 10 L46 19 Z', 0, up, 1, ember);
    leg(22, 3 * (up ? -1 : 1), fur); leg(40, bite ? 4 : -2, fur);
    // head
    const hx = bite ? 56 : 54, hy = 20 + up;
    E(hx, hy, 9, 8, fur);
    b.next(); b.path(bite ? 'M0 0 L14 -3 L14 3 Z M0 4 L13 9 L11 12 L0 8 Z' : 'M0 0 L13 1 L12 6 L0 7 Z', hx + 4, hy - 1, 1, mix(fur, '#ffb38a', 0.15));
    b.next(); b.path('M-4 -6 L-2 -15 L3 -7 Z', hx, hy, 1, fur);
    b.rect(hx + 2, hy - 3, 3, 2, '#ffe060', { flat: true });
    b.glow(hx + 3, hy - 2, 4, '#ffb340'); b.glow(30, 14 + up, 10, '#ff8a2a');
    return b.toCanvas();
  }
  function matron(frame) {
    const b = new Buf(64, 70), up = frame === 'idle1' ? -1 : 0, slap = frame === 'atk';
    const slag = '#4a5a78', hot = '#ff8a2a', E = (x, y, rx, ry, c) => { b.next(); b.ellipse(x, y, rx, ry, c); };
    // molten skirt pooling on the floor
    b.next(); b.path('M8 66 Q6 44 18 36 L44 36 Q58 44 58 66 Z', 0, 0, 1, mix(slag, '#2b2347', 0.2));
    b.next(); for (let x = 10; x < 58; x += 6) b.line(x, 60, x + 2, 66, hot, { flat: true });
    // torso
    E(32, 30 + up, 13, 13, slag);
    b.next(); b.path('M24 24 L40 24 L38 38 L26 38 Z', 0, up, 1, '#2f3a52');
    b.next(); b.line(28, 26 + up, 32, 34 + up, hot, { flat: true }); b.line(36, 27 + up, 33, 33 + up, hot, { flat: true });
    // head and slag crown
    E(36, 12 + up, 8, 8, slag);
    b.next(); b.path('M28 7 L29 -2 L32 4 L35 -4 L38 4 L42 -1 L43 8 Z', 0, up, 1, '#2f3a52');
    b.rect(38, 10 + up, 3, 2, '#ffe060', { flat: true }); b.rect(43, 10 + up, 2, 2, '#ffe060', { flat: true });
    // arms: one raised for the slap
    const hand = slap ? [58, 10] : [52, 40];
    b.next(); b.cap(42, 24 + up, hand[0], hand[1], 5, slag); E(hand[0], hand[1], 5, 5, '#2f3a52');
    b.next(); b.cap(22, 24 + up, 14, 40, 5, mix(slag, '#2b2347', 0.2));
    b.glow(39, 11 + up, 4, '#ffcf60'); b.glow(32, 31 + up, 8, '#ff8a2a'); b.glow(hand[0], hand[1], 5, '#ff8a2a');
    return b.toCanvas();
  }
  function shard(frame) {
    const b = new Buf(20, 26), up = frame === 'idle1' ? -1 : 0;
    b.next(); b.path('M10 1 L17 10 L12 24 L8 24 L3 10 Z', 0, up, 1, '#ffb340');
    b.next(); b.path('M10 4 L13 10 L10 20 Z', 0, up, 1, '#fff0a0');
    b.glow(10, 12 + up, 9, '#ff8a2a');
    return b.toCanvas();
  }
  // Enemy art by kind and name. Bosses each have their own sprite; the golem is the original boss art.
  A.monster = (kind, name, frame) => memo(['m', kind, name, frame].join(':'), () => {
    if (kind === 'boss') {
      if (name === 'Cinder Hound') return hound(frame);
      if (name === 'Slag Matron') return matron(frame);
      return P.golem(frame === 'atk' ? 'slam' : frame === 'idle1' ? 'raise' : 'idle');
    }
    if (kind === 'brute') return imp(frame, '#9a3a2a', '#d88a5a', true);
    if (kind === 'shard') return shard(frame);
    return imp(frame, '#c8462a', '#ffb070', false);
  });
  // Scale each piece of art is drawn at in the arena.
  A.monsterScale = (kind, name) => (kind === 'boss' ? (name === 'Ember Golem' ? 4 : 3.4) : kind === 'brute' ? 2.6 : kind === 'shard' ? 2.6 : 2.6);

  // ------------------------------------------------------------------ dungeon scenery

  // Each wing of Ember Hollow has its own palette and props. Layers are tall strips drawn once at 1/3 scale
  // and scrolled at different speeds while the group walks.
  const WINGS = [
    { name: 'Cinder Halls', sky: ['#1a0d14', '#2c1218'], rock: '#3a1e22', rock2: '#4c2826', floor: '#3b2224', floor2: '#4a2c2a', glow: '#ff6a1a', accent: '#ff9a3a', prop: 'lava' },
    { name: 'Slag Pools', sky: ['#0f1220', '#1a2032'], rock: '#232a40', rock2: '#2f3852', floor: '#262a3a', floor2: '#323850', glow: '#ff8a2a', accent: '#5fd0ff', prop: 'crystal' },
    { name: 'Golem Forge', sky: ['#170d0a', '#2a1610'], rock: '#3a2618', rock2: '#4e3420', floor: '#3a2a20', floor2: '#4c382a', glow: '#ffb340', accent: '#ffd25a', prop: 'forge' },
  ];
  A.WINGS = WINGS;
  const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  function layer(w, which) {
    const W = 640, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = rnd(which * 97 + w * 13 + 5), P2 = WINGS[w];
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); };
    if (which === 0) {
      // far wall: gradient, brick courses and hanging stalactites
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P2.sky[0]); gr.addColorStop(1, P2.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let y = 18; y < 130; y += 9) for (let x = (y / 9) % 2 ? -10 : 0; x < W; x += 20) if (r() < 0.55) px(x + 1, y, 18, 7, mix(P2.rock, P2.sky[0], 0.45 + r() * 0.2));
      for (let x = 0; x < W; x += 6 + r() * 14) { const h = 8 + r() * 26, wv = 4 + r() * 8; g.fillStyle = mix(P2.rock, '#000000', 0.35); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + wv, 0); g.lineTo(x + wv / 2, h); g.closePath(); g.fill(); }
    } else if (which === 1) {
      // middle: pillars and wing props
      for (let n = 0; n < 5; n++) {
        const x = n * 128 + 20 + r() * 50, w2 = 16 + r() * 10;
        px(x, 0, w2, 150, P2.rock2); px(x + w2 - 4, 0, 4, 150, mix(P2.rock2, '#000000', 0.3)); px(x, 0, 3, 150, mix(P2.rock2, '#ffffff', 0.08));
        for (let y = 8; y < 150; y += 14) px(x, y, w2, 2, mix(P2.rock2, '#000000', 0.2));
        px(x - 3, 142, w2 + 6, 8, mix(P2.rock2, '#000000', 0.15));
        if (P2.prop === 'crystal') { const cx = x + w2 + 14 + r() * 20; for (let k = 0; k < 3; k++) { g.fillStyle = mix(P2.accent, '#ffffff', k * 0.15); g.beginPath(); g.moveTo(cx + k * 5, 150); g.lineTo(cx + k * 5 + 3, 128 - k * 6 - r() * 8); g.lineTo(cx + k * 5 + 6, 150); g.fill(); } }
        if (P2.prop === 'forge' && n % 2 === 0) { const cx = x + w2 + 20; px(cx, 136, 22, 6, '#2a2020'); px(cx + 4, 130, 14, 6, '#4a4048'); px(cx + 7, 142, 8, 8, '#2a2020'); g.strokeStyle = '#5a5058'; g.beginPath(); g.moveTo(cx + 11, 0); g.lineTo(cx + 11, 40 + r() * 30); g.stroke(); }
        if (P2.prop === 'lava' && n % 2 === 1) { px(x + w2 + 6, 120, 30, 30, mix(P2.rock, '#000000', 0.2)); px(x + w2 + 9, 116, 24, 6, mix(P2.rock, '#000000', 0.1)); }
      }
    } else {
      // floor: tiles with cracks; lava seams glow in wing 1 and 3
      px(0, 0, W, H, 'rgba(0,0,0,0)');
      for (let y = 150; y < H; y += 6) for (let x = ((y - 150) / 6) % 2 ? -8 : 0; x < W; x += 16) { px(x, y, 15, 5, (x / 16 + y / 6) % 3 ? P2.floor : P2.floor2); px(x, y, 15, 1, mix(P2.floor2, '#ffffff', 0.08)); }
      px(0, 148, W, 3, mix(P2.floor2, '#000000', 0.35));
      for (let k = 0; k < 14; k++) { const x = r() * W, y = 154 + r() * 22; g.fillStyle = mix(P2.glow, '#ffffff', 0.1); for (let i = 0; i < 6 + r() * 10; i++) g.fillRect(Math.round(x + i), Math.round(y + Math.sin(i * 1.3 + k) * 1.5), 1, 1); }
    }
    return c;
  }
  A.layer = (wing, which) => memo('L:' + wing + ':' + which, () => layer(wing, which));
})();
