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

  // Item icons get their own renderer: every shape is shaded by how far each pixel sits from its edge and which
  // way that edge faces the light (top left), with ordered dithering between tones. That gives rounded, soft
  // forms instead of flat cut-outs. Each shape carries a material, which sets contrast, texture and shine.
  const MAT = {
    metal: { k: 1.15, spec: 0.5, tex: 0 },
    gem: { k: 1.2, spec: 0.7, tex: 0 },
    cloth: { k: 0.8, spec: 0, tex: 0.015 },
    leather: { k: 0.85, spec: 0.1, tex: 0.035 },
    wood: { k: 0.8, spec: 0, tex: 0.03, grain: true },
    bone: { k: 0.9, spec: 0.15, tex: 0.04 },
    skin: { k: 0.8, spec: 0.1, tex: 0.02 },
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const RAMP5 = new Map();
  function ramp5(c, mat) {
    const key = c + mat;
    if (!RAMP5.has(key)) {
      const hi = mat === 'metal' || mat === 'gem' ? 0.62 : 0.36;
      RAMP5.set(key, [mix(c, '#140a22', 0.55), mix(c, '#2a1c4a', 0.32), c, mix(c, '#fff1d0', hi * 0.55), mix(c, '#ffffff', hi)].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))));
    }
    return RAMP5.get(key);
  }
  function softCanvas(b) {
    const { w, h, m, p, f } = b, n = w * h, mats = b.mats || {};
    // distance (in pixels) from each pixel to the edge of its own shape
    const d = new Float32Array(n).fill(99);
    const q = [];
    for (let i = 0; i < n; i++) {
      if (m[i] === null) continue;
      const x = i % w, y = (i / w) | 0;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X < 0 || Y < 0 || X >= w || Y >= h || m[Y * w + X] === null || p[Y * w + X] !== p[i]; });
      if (edge) { d[i] = 1; q.push(i); }
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % w, y = (i / w) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) return; const j = Y * w + X; if (m[j] !== null && p[j] === p[i] && d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); } });
    }
    // bounding box per shape, for the broad light falloff across it
    const box = {};
    for (let i = 0; i < n; i++) { if (m[i] === null) continue; const x = i % w, y = (i / w) | 0, bb = box[p[i]] || (box[p[i]] = [x, y, x, y]); bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); }
    const D = (x, y, i) => { if (x < 0 || y < 0 || x >= w || y >= h) return 0; const j = y * w + x; return m[j] === null || p[j] !== p[i] ? 0 : d[j]; };
    const out = new Uint8ClampedArray(n * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = m[i];
      let rgb;
      if (c === null) {
        let best = -1;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) return; const j = Y * w + X; if (m[j] !== null && (best < 0 || p[j] > p[best])) best = j; });
        if (best < 0) continue;
        // softer outline on the lit side
        const lit = (x < best % w) || (y < ((best / w) | 0));
        rgb = [1, 3, 5].map((k) => parseInt(mix(m[best], '#12081a', lit ? 0.68 : 0.8).slice(k, k + 2), 16));
      } else if (f[i]) rgb = [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
      else {
        const mt = mats[p[i]] || 'cloth', M = MAT[mt] || MAT.cloth;
        const gx = D(x + 1, y, i) - D(x - 1, y, i), gy = D(x, y + 1, i) - D(x, y - 1, i), gl = Math.hypot(gx, gy) || 1;
        const nx = -gx / gl, ny = -gy / gl, light = (nx * -0.6 + ny * -0.8) * (gx || gy ? 1 : 0);
        const rim = Math.max(0, 1 - (d[i] - 1) / 2.6);
        const bb = box[p[i]], bw = Math.max(1, bb[2] - bb[0]), bh = Math.max(1, bb[3] - bb[1]);
        const broad = 0.5 - ((x - bb[0]) / bw) * 0.5 - ((y - bb[1]) / bh) * 0.5;
        let v = (broad * 0.55 + light * rim * 0.75) * M.k;
        if (M.spec && light > 0.55 && rim > 0.6 && broad > -0.1) v += M.spec;
        if (M.tex) v += (hash(x, y) - 0.5) * M.tex * 2;
        if (M.grain && hash(Math.round((x - y) / 3), 7) > 0.6) v -= 0.18;
        // ambient occlusion where a shape in front starts
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) return false; const j = Y * w + X; return m[j] !== null && p[j] > p[i] && !f[j]; })) v -= 0.45;
        const lv = Math.max(0, Math.min(4, 2 + v * 2)), lo = Math.floor(lv), fr = lv - lo;
        // dither only in the middle of a tone change, so flat areas stay clean
        const up = fr < 0.3 ? 0 : fr > 0.7 ? 1 : (fr - 0.3) / 0.4 > BAYER[(y % 4) * 4 + (x % 4)] ? 1 : 0;
        const step = Math.min(4, lo + up);
        rgb = ramp5(c, mt)[step];
      }
      out.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
    b.fx.forEach(([x, y, c, a]) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4, rgb = [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16)); out.set([rgb[0] * a + out[i] * (1 - a), rgb[1] * a + out[i + 1] * (1 - a), rgb[2] * a + out[i + 2] * (1 - a), Math.max(out[i + 3], Math.round(255 * a))], i); });
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    return cv;
  }

  // Shapes for each base, in a 32 px box centred on 0,0. Weapons are drawn upright and turned 45 degrees.
  // Each entry: [path, colour role, material]. Colour roles come from the rarity tier (metal, cloth, trim, gem)
  // or are literal colours.
  const WOOD = '#8a5a34', DARKWOOD = '#5e3b22', LEATHER = '#7a4e30', IRON = '#5b5f6b', BONE = '#eadfc4', PAPER = '#f2e8d0';
  const SHAPES = {
    weapon: {
      sword: [['M-1.6 6 L1.6 6 L1.6 12 L-1.6 12 Z', LEATHER, 'leather'], ['M-2.6 -13 L0 -16 L2.6 -13 L2.6 4.5 L-2.6 4.5 Z', 'metal', 'metal'], ['M-8 3.5 Q0 1.5 8 3.5 L8 6.5 Q0 5 -8 6.5 Z', 'trim', 'metal'], ['M-2.6 11.5 Q0 10.5 2.6 11.5 Q3.6 15 0 15.6 Q-3.6 15 -2.6 11.5 Z', 'trim', 'metal']],
      axe: [['M-1.4 -12 L1.4 -12 L1.6 15.5 L-1.6 15.5 Z', WOOD, 'wood'], ['M0.5 -12 Q12 -16 13.5 -4 Q12 6 0.5 1.5 Z', 'metal', 'metal'], ['M-0.5 -10.5 L-7 -7.5 L-0.5 -3.5 Z', 'metal', 'metal'], ['M-2 -13.5 L2 -13.5 L2 2 L-2 2 Z', 'trim', 'metal']],
      hammer: [['M-1.4 -6 L1.4 -6 L1.6 15.5 L-1.6 15.5 Z', WOOD, 'wood'], ['M-9 -15 L9 -15 Q10.5 -10 9 -4.5 L-9 -4.5 Q-10.5 -10 -9 -15 Z', 'metal', 'metal'], ['M-2.4 -15.5 L2.4 -15.5 L2.4 -4 L-2.4 -4 Z', 'trim', 'metal'], ['M-2.2 9 L2.2 9 L2.2 12 L-2.2 12 Z', LEATHER, 'leather']],
      spear: [['M-1 -6 L1 -6 L1.2 16 L-1.2 16 Z', WOOD, 'wood'], ['M0 -16.5 Q4.6 -11 2.4 -5.5 L-2.4 -5.5 Q-4.6 -11 0 -16.5 Z', 'metal', 'metal'], ['M-2 -6 L2 -6 L2 -3 L-2 -3 Z', 'trim', 'metal'], ['M1.4 -4 Q6 -1 4 4 Q3 0 1.2 -1.5 Z', 'cloth', 'cloth']],
      staff: [['M-1.6 -7 Q-2.6 4 -1.4 16 L1.4 16 Q2.4 4 1.6 -7 Z', WOOD, 'wood'], ['M-1.6 -6 Q-7 -9 -5 -15 Q-3.6 -10 -0.6 -9.5 Z', DARKWOOD, 'wood'], ['M1.6 -6 Q7 -9 5 -15 Q3.6 -10 0.6 -9.5 Z', DARKWOOD, 'wood']],
      wand: [['M-1.1 -4 L1.1 -4 L1.6 15 L-1.6 15 Z', DARKWOOD, 'wood'], ['M-2 7 L2 7 L2 13 L-2 13 Z', 'trim', 'metal'], ['M-3 -5.5 L3 -5.5 L2 -3 L-2 -3 Z', 'trim', 'metal']],
      bow: [['M-3 -16 Q10 0 -3 16 L-5.4 15 Q6 0 -5.4 -15 Z', WOOD, 'wood'], ['M0.4 -3 L4 -3 L4 3 L0.4 3 Z', LEATHER, 'leather']],
      daggers: [['M-1.4 5 L1.4 5 L1.4 11 L-1.4 11 Z', LEATHER, 'leather'], ['M-2.4 -10 Q1 -15 2.6 -14 Q3.2 -6 2.4 3.5 L-2.4 3.5 Z', 'metal', 'metal'], ['M-6 3 L6 3 L6 5.6 L-6 5.6 Z', 'trim', 'metal'], ['M-2.2 10.6 L2.2 10.6 L1.6 13.6 L-1.6 13.6 Z', 'trim', 'metal']],
      pan: [['M-1.4 1 L1.4 1 L1.8 15.5 L-1.8 15.5 Z', DARKWOOD, 'wood'], ['M0 -16 Q9.5 -15.5 9.5 -6.5 Q9.5 2.5 0 2.5 Q-9.5 2.5 -9.5 -6.5 Q-9.5 -15.5 0 -16 Z', IRON, 'metal']],
      fish: [['M0 -16 Q8 -6 3.4 8 L0 11 L-3.4 8 Q-8 -6 0 -16 Z', '#6fa8d8', 'skin'], ['M0 9.5 L6 16 Q0 14 -6 16 Z', '#4f86b8', 'skin'], ['M3.5 -2 L8 1 L3.5 3 Z', '#4f86b8', 'skin'], ['M-3.5 -2 L-8 1 L-3.5 3 Z', '#4f86b8', 'skin']],
    },
    offhand: {
      shield: [['M-12 -13 Q0 -16.5 12 -13 L12 -2 Q11 9.5 0 15.5 Q-11 9.5 -12 -2 Z', 'metal', 'metal'], ['M-9.4 -10.6 Q0 -13.4 9.4 -10.6 L9.4 -2 Q8.4 7 0 12 Q-8.4 7 -9.4 -2 Z', 'cloth', 'cloth'], ['M-9.4 -3 L0 3 L9.4 -3 L9.4 1 L0 7 L-9.4 1 Z', 'trim', 'metal']],
      buckler: [['M0 -14 Q14 -14 14 0 Q14 14 0 14 Q-14 14 -14 0 Q-14 -14 0 -14 Z', 'metal', 'metal'], ['M0 -10.6 Q10.6 -10.6 10.6 0 Q10.6 10.6 0 10.6 Q-10.6 10.6 -10.6 0 Q-10.6 -10.6 0 -10.6 Z', WOOD, 'wood'], ['M0 -4.6 Q4.6 -4.6 4.6 0 Q4.6 4.6 0 4.6 Q-4.6 4.6 -4.6 0 Q-4.6 -4.6 0 -4.6 Z', 'metal', 'metal']],
      book: [['M-10 -13.5 L9 -13.5 Q11.5 -13.5 11.5 -11 L11.5 12 Q11.5 14.5 9 14.5 L-10 14.5 Z', 'cloth', 'leather'], ['M7.5 -11.5 L11.5 -11.5 L11.5 12.5 L7.5 12.5 Z', PAPER, 'cloth'], ['M-12 -14 L-7 -14 L-7 15 L-12 15 Z', 'cloth', 'leather'], ['M-4 -7 L5 -7 L5 7 L-4 7 Z', 'trim', 'metal'], ['M-2.4 -5.4 L3.4 -5.4 L3.4 5.4 L-2.4 5.4 Z', 'cloth', 'leather']],
    },
    head: {
      helm: [['M-12 5 Q-13 -12 0 -12.5 Q13 -12 12 5 Z', 'metal', 'metal'], ['M-12.6 0 L12.6 0 L12.6 4.5 L-12.6 4.5 Z', 'trim', 'metal'], ['M-1.8 -1 L1.8 -1 L1.4 11 L-1.4 11 Z', 'metal', 'metal'], ['M-1 -12 Q3 -20 13 -17.5 Q7 -15 4.6 -10.6 Z', 'cloth', 'cloth']],
      viking: [['M-11 4 Q-12 -12 0 -12.5 Q12 -12 11 4 Z', 'metal', 'metal'], ['M-12 0.5 L12 0.5 L12 5 L-12 5 Z', 'trim', 'metal'], ['M-9.5 -4 Q-17.5 -5 -16 -17 Q-13 -9.5 -7.5 -8 Z', BONE, 'bone'], ['M9.5 -4 Q17.5 -5 16 -17 Q13 -9.5 7.5 -8 Z', BONE, 'bone']],
      wizard: [['M-15 7 Q0 1 15 7 Q15 10.5 0 9.5 Q-15 10.5 -15 7 Z', 'cloth', 'cloth'], ['M-8.5 6 Q-4 -10 10 -16 Q4 -7 8.5 6 Z', 'cloth', 'cloth'], ['M-8.6 2.4 Q0 0 8.4 2.4 L8.6 5.6 Q0 3.4 -8.6 5.6 Z', 'trim', 'cloth']],
      pot: [['M-11 -4 L11 -4 L10 8 Q0 11.5 -10 8 Z', IRON, 'metal'], ['M-12.6 -7 L12.6 -7 L12.6 -3.5 L-12.6 -3.5 Z', '#6f7480', 'metal'], ['M11 -2 L16 -3 L16 0.6 L11 1.6 Z', DARKWOOD, 'wood'], ['M-2.5 -10 L2.5 -10 L2.5 -7 L-2.5 -7 Z', '#6f7480', 'metal']],
      frog: [['M-12.5 8 Q-13.5 -8 0 -9 Q13.5 -8 12.5 8 Q8 3.5 0 3.5 Q-8 3.5 -12.5 8 Z', '#6cbf4a', 'cloth'], ['M-9.5 -13 Q-6 -16 -2.6 -13 Q-2 -7.5 -6 -7 Q-10 -7.5 -9.5 -13 Z', '#6cbf4a', 'cloth'], ['M9.5 -13 Q6 -16 2.6 -13 Q2 -7.5 6 -7 Q10 -7.5 9.5 -13 Z', '#6cbf4a', 'cloth']],
      crown: [['M-12 -1 L-12 -12 L-6 -5 L0 -15 L6 -5 L12 -12 L12 -1 Z', '#f0c23a', 'metal'], ['M-12.5 -2 L12.5 -2 L12.5 5 L-12.5 5 Z', '#f0c23a', 'metal'], ['M-11 5 L11 5 L11 7.5 L-11 7.5 Z', '#c0392b', 'cloth']],
      bandana: [['M-13 2 Q-13 -11 0 -11.5 Q13 -11 13 2 Q0 -1.5 -13 2 Z', 'cloth', 'cloth'], ['M-13.4 -0.5 Q0 -4.5 13.4 -0.5 L13.4 3.5 Q0 0 -13.4 3.5 Z', 'cloth', 'cloth'], ['M12 0 L17 -4.5 L16 2 L18.5 5.5 L13 4.5 Z', 'cloth', 'cloth']],
      hood: [['M-13 12 Q-15 -13 0 -14 Q15 -13 13 12 L8 12 Q9 -2 0 -3 Q-9 -2 -8 12 Z', 'cloth', 'cloth'], ['M-8 12 Q-9 -2 0 -3 Q9 -2 8 12 Z', '#1d1226', 'cloth'], ['M-13.2 9.5 L-8 9.5 L-8 12.5 L-13.2 12.5 Z', 'trim', 'cloth'], ['M8 9.5 L13.2 9.5 L13.2 12.5 L8 12.5 Z', 'trim', 'cloth']],
    },
    top: {
      plate: [['M-15 -11 Q-11 -15.5 -6 -12 L-7 -4 L-15 -5 Z', 'metal', 'metal'], ['M15 -11 Q11 -15.5 6 -12 L7 -4 L15 -5 Z', 'metal', 'metal'], ['M-10 -12 L10 -12 L11.5 -3 L10 9 Q0 14 -10 9 L-11.5 -3 Z', 'metal', 'metal'], ['M-10.6 6 L10.6 6 L10.4 9.4 Q0 13.6 -10.4 9.4 Z', 'trim', 'metal']],
      leather: [['M-11 -12 L-3.5 -12 L0 -5 L3.5 -12 L11 -12 L12.5 13 L-12.5 13 Z', LEATHER, 'leather'], ['M-12 -12 L-3.5 -12 L-2 -9 L-11 -6 Z', 'cloth', 'cloth'], ['M12 -12 L3.5 -12 L2 -9 L11 -6 Z', 'cloth', 'cloth'], ['M-12.4 7 L12.4 7 L12.5 10 L-12.5 10 Z', '#3d2a1e', 'leather']],
      robe: [['M-8.5 -11 Q-13.5 -8 -15.5 2.5 Q-12.5 5 -9.5 3.5 Q-9.5 -3 -7.5 -6 Z', 'cloth', 'cloth'], ['M8.5 -11 Q13.5 -8 15.5 2.5 Q12.5 5 9.5 3.5 Q9.5 -3 7.5 -6 Z', 'cloth', 'cloth'], ['M-6 -14 L6 -14 Q9 -12 9.5 -8 L7.5 -1 Q11 6 13.5 13 Q10 15.2 6.5 13.6 Q3 15.6 0 14.2 Q-3 15.6 -6.5 13.6 Q-10 15.2 -13.5 13 Q-11 6 -7.5 -1 L-9.5 -8 Q-9 -12 -6 -14 Z', 'cloth', 'cloth'], ['M-13.5 13 Q-10 15.2 -6.5 13.6 Q-3 15.6 0 14.2 Q3 15.6 6.5 13.6 Q10 15.2 13.5 13 L12.8 10.8 Q10 12.8 6.5 11.4 Q3 13.2 0 12 Q-3 13.2 -6.5 11.4 Q-10 12.8 -12.8 10.8 Z', 'trim', 'cloth'], ['M-15.5 2.5 Q-12.5 5 -9.5 3.5 L-9.6 1.4 Q-12.4 2.8 -15 0.6 Z', 'trim', 'cloth'], ['M15.5 2.5 Q12.5 5 9.5 3.5 L9.6 1.4 Q12.4 2.8 15 0.6 Z', 'trim', 'cloth'], ['M-4.6 -14 L0 -6 L4.6 -14 L2.6 -14 L0 -9.4 L-2.6 -14 Z', 'trim', 'cloth'], ['M-7.9 -2.8 Q0 -0.8 7.9 -2.8 L7.9 0.6 Q0 2.6 -7.9 0.6 Z', 'trim', 'cloth'], ['M0.6 0.4 L3.4 0.4 L4.6 7.5 L1.8 7.5 Z', 'trim', 'cloth']],
      tunic: [['M-12 -11 L-4 -13.5 Q0 -10 4 -13.5 L12 -11 L15.5 -2 L11 0 L10.5 13 L-10.5 13 L-11 0 L-15.5 -2 Z', 'cloth', 'cloth'], ['M-4 -13.5 Q0 -6 4 -13.5 L2.4 -13.5 Q0 -9 -2.4 -13.5 Z', 'trim', 'cloth'], ['M-10.8 6 L10.8 6 L10.7 9 L-10.7 9 Z', LEATHER, 'leather'], ['M-2 5.4 L2 5.4 L2 9.6 L-2 9.6 Z', 'trim', 'metal']],
      sweater: [['M-12 -11 L-4.5 -13 Q0 -11 4.5 -13 L12 -11 L15.5 -1 L11 1 L10.5 13 L-10.5 13 L-11 1 L-15.5 -1 Z', 'cloth', 'cloth'], ['M-5 -13.4 Q0 -10.6 5 -13.4 L5 -11 Q0 -8.4 -5 -11 Z', 'trim', 'cloth'], ['M-10.6 10 L10.6 10 L10.5 13.5 L-10.5 13.5 Z', 'trim', 'cloth']],
    },
    bottom: {
      pants: [['M-9.5 -11 L9.5 -11 L10.5 14 L2 14 L0 -1 L-2 14 L-10.5 14 Z', 'cloth', 'cloth'], ['M-9.8 -13 L9.8 -13 L9.8 -9 L-9.8 -9 Z', LEATHER, 'leather'], ['M-1.8 -13.4 L1.8 -13.4 L1.8 -8.6 L-1.8 -8.6 Z', 'trim', 'metal']],
      shorts: [['M-10 -6 L10 -6 L11.5 8 L1.5 8 L0 2 L-1.5 8 L-11.5 8 Z', 'cloth', 'cloth'], ['M-10.2 -8.5 L10.2 -8.5 L10.2 -4.5 L-10.2 -4.5 Z', LEATHER, 'leather'], ['M-1.8 -9 L1.8 -9 L1.8 -4 L-1.8 -4 Z', 'trim', 'metal']],
      kilt: [['M-10 -9 L10 -9 L14 9 Q0 11.5 -14 9 Z', 'cloth', 'cloth'], ['M-10.4 -12 L10.4 -12 L10.4 -8 L-10.4 -8 Z', LEATHER, 'leather'], ['M-3.4 -4 L3.4 -4 L3 4 L-3 4 Z', '#a8763a', 'leather']],
      greaves: [['M-10.5 -13 L-1 -13 L-1.5 14 L-9.5 14 Z', 'metal', 'metal'], ['M1 -13 L10.5 -13 L9.5 14 L1.5 14 Z', 'metal', 'metal'], ['M-10.6 -2.5 Q-6 -5.5 -1.2 -2.5 L-1.2 2 Q-6 -1 -10.6 2 Z', 'trim', 'metal'], ['M1.2 -2.5 Q6 -5.5 10.6 -2.5 L10.6 2 Q6 -1 1.2 2 Z', 'trim', 'metal']],
    },
    shoes: {
      boots: [['M-7 -13 L5 -13 L5 3 Q13 4 14 10 L14 12 L-7.5 12 Z', LEATHER, 'leather'], ['M-7.6 11 L14.4 11 L14.4 14.5 L-7.6 14.5 Z', '#3d2a1e', 'leather'], ['M-8 -14.5 L6 -14.5 L6 -10 L-8 -10 Z', 'trim', 'leather']],
      sabatons: [['M-7 -13 L5 -13 L5.5 3 Q13 3 14.5 10 L14.5 12 L-7.5 12 Z', 'metal', 'metal'], ['M-7.6 11 L14.6 11 L14.6 14 L-7.6 14 Z', IRON, 'metal'], ['M-7.6 -14.5 L5.6 -14.5 L5.6 -10.5 L-7.6 -10.5 Z', 'trim', 'metal']],
      sandals: [['M-13 9 Q-14 4.5 -9 4 L10 4 Q15.5 4.5 14.5 9.5 Q13.5 13 8 13 L-9 13 Q-13 13 -13 9 Z', '#a87a4a', 'leather'], ['M-7 4.5 L-3.4 4.5 L3 -6 L-0.6 -6 Z', '#6a4428', 'leather'], ['M3.4 4.5 L7 4.5 L0.6 -6 L-3 -6 Z', '#6a4428', 'leather'], ['M-5 -10 L5 -10 L5 -6.5 L-5 -6.5 Z', '#6a4428', 'leather']],
      curly: [['M-5 -13 L5 -13 L5 3 L10 3 Q16 3 15 -3 Q19 1 16 7 Q14 12 8 12 L-6.5 12 L-6.5 3 Z', 'cloth', 'cloth'], ['M-7 11 L13 11 L12 14 L-7 14 Z', '#3d2a1e', 'leather'], ['M-6 -14.5 L6 -14.5 L6 -10.5 L-6 -10.5 Z', 'trim', 'cloth']],
    },
    cape: {
      cape: [['M-8 -13 L8 -13 Q12 0 15 14 Q7.5 10.5 0 14.5 Q-7.5 10.5 -15 14 Q-12 0 -8 -13 Z', 'cloth', 'cloth'], ['M-9 -15 L9 -15 L9 -11 L-9 -11 Z', 'trim', 'cloth']],
      scarf: [['M-1.5 -3 L4 -3 L1.5 12 L-4.5 11 Z', 'cloth', 'cloth'], ['M-13 -7 Q-12 -15 0 -15 Q12 -15 13 -7 Q12 0 0 0 Q-12 0 -13 -7 Z', 'cloth', 'cloth'], ['M-7 -8.5 Q0 -12 7 -8.5 Q7 -5.5 0 -5.5 Q-7 -5.5 -7 -8.5 Z', '#1d1226', 'cloth'], ['M2.5 -2 L8.5 -2 L11 13 L5 14 Z', 'cloth', 'cloth']],
    },
  };
  const ROLE = (T, c) => (T[c] !== undefined ? T[c] || T.metal : c);

  function drawIcon(slot, base, rarity, seed) {
    const T = TIER[rarity] || TIER.common, b = new Buf(32, 32);
    b.mats = {};
    const col = (c) => ROLE(T, c);
    const shape = (d, c, mat, tx = 16, ty = 16, s = 1, rot = 0) => { b.next(); b.mats[b.part] = mat; b.path(d, tx, ty, s, col(c), null, rot); };
    const blob = (cx, cy, rx, ry, c, mat) => { b.next(); b.mats[b.part] = mat; b.ellipse(cx, cy, rx, ry, col(c)); };
    // a detail pixel keeps the shape it sits on, so it does not cut that shape's shading
    const dot = (x, y, c) => { x = Math.round(x); y = Math.round(y); const i = y * 32 + x; if (x < 0 || y < 0 || x > 31 || y > 31) return; b.set(x, y, c, { flat: true, part: b.m[i] !== null ? b.p[i] : b.part }); };
    // a small faceted gem: shaded body, white glint, dark lower facet
    const gem = (x, y, r = 2, c = T.gem) => { if (!c) return; blob(x, y, r, r, c, 'gem'); dot(Math.round(x - r / 2), Math.round(y - r / 2), '#ffffff'); if (r >= 2) dot(Math.round(x + r / 2 - 0.5), Math.round(y + r / 2 - 0.5), mix(c, '#140a22', 0.5)); };
    const rivet = (x, y, c) => { const k = col(c); dot(x, y, mix(k, '#ffffff', 0.55)); dot(x + 1, y + 1, mix(k, '#140a22', 0.45)); };
    // dashed stitching along a line, on whatever shape is under it
    const stitch = (x1, y1, x2, y2, c) => { const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); for (let k = 0; k <= n; k += 2) dot(Math.round(x1 + ((x2 - x1) * k) / n), Math.round(y1 + ((y2 - y1) * k) / n), c); };
    const S = (SHAPES[slot] || {})[base];
    const turn = slot === 'weapon' ? (base === 'bow' ? 30 : 45) : 0;
    // rotate a local weapon point into icon space
    const at = (x, y) => { const a = (turn * Math.PI) / 180; return [16 + x * Math.cos(a) - y * Math.sin(a), 16 + x * Math.sin(a) + y * Math.cos(a)]; };
    if (S) S.forEach(([d, c, mat]) => shape(d, c, mat, 16, 16, 1, turn));
    const trimLight = mix(col('trim'), '#ffffff', 0.35), clothDark = mix(col('cloth'), '#140a22', 0.4), clothLight = mix(col('cloth'), '#fff1d0', 0.4);
    switch (slot) {
      case 'weapon': {
        if (base === 'sword') { for (let y = -11; y <= 2; y++) { const [x, yy] = at(0, y); dot(x, yy, mix(col('metal'), '#140a22', 0.3)); } for (let y = 7; y <= 11; y += 2) { const [x, yy] = at(0, y); dot(x, yy, '#3d2a1e'); } const g = at(0, 13.4); gem(g[0], g[1], 1.6); }
        else if (base === 'axe') { const g = at(0, -5.5); gem(g[0], g[1], 1.6); }
        else if (base === 'hammer') { [[-6.5, -12.5], [6.5, -12.5], [-6.5, -7], [6.5, -7]].forEach(([x, y]) => { const p = at(x, y); rivet(Math.round(p[0]), Math.round(p[1]), 'metal'); }); const g = at(0, -9.8); gem(g[0], g[1], 1.8); }
        else if (base === 'spear') { const g = at(0, -4.5); gem(g[0], g[1], 1.4); for (let y = -14; y <= -7; y++) { const [x, yy] = at(0, y); dot(x, yy, mix(col('metal'), '#140a22', 0.25)); } }
        else if (base === 'staff') { const o = at(0, -12); blob(o[0], o[1], 4.4, 4.4, T.gem || '#8fd0ff', 'gem'); dot(Math.round(o[0] - 2), Math.round(o[1] - 2), '#ffffff'); b.glow(o[0], o[1], 7, T.gem || '#8fd0ff'); const r = at(0, 2); stitch(r[0] - 1, r[1] - 1, r[0] + 1, r[1] + 1, '#3d2a1e'); }
        else if (base === 'wand') { const o = at(0, -9.5); shape('M0 -6 L3.6 0 L0 6 L-3.6 0 Z', T.gem || '#b8e0ff', 'gem', o[0], o[1], 1, turn); dot(Math.round(o[0] - 1), Math.round(o[1] - 2), '#ffffff'); b.glow(o[0], o[1], 6, T.gem || '#cfe8ff'); }
        else if (base === 'bow') { const a = at(-4.6, -14.5), z = at(-4.6, 14.5); b.next(); b.line(a[0], a[1], z[0], z[1], '#efe7d8', { flat: true }); const g = at(2.2, 0); gem(g[0], g[1], 1.4); }
        else if (base === 'daggers') { for (let y = -9; y <= 1; y++) { const [x, yy] = at(0.4, y); dot(x, yy, mix(col('metal'), '#ffffff', 0.45)); } const g = at(0, 12); gem(g[0], g[1], 1.3); }
        else if (base === 'pan') { const c = at(0, -6.5); blob(c[0], c[1], 7, 7, '#3a3e48', 'metal'); if (rarity === 'legendary' || rarity === 'epic') { blob(c[0] + 0.5, c[1], 4, 3.6, '#fbf6ea', 'cloth'); blob(c[0] + 0.5, c[1], 1.8, 1.8, '#ffb52a', 'gem'); } }
        else if (base === 'fish') { const e = at(-0.5, -10); dot(Math.round(e[0]), Math.round(e[1]), '#1a1020'); dot(Math.round(e[0]) - 1, Math.round(e[1]) - 1, '#ffffff'); for (let y = -6; y <= 6; y += 3) for (let x = -2; x <= 2; x += 2) { const p = at(x + (y % 2 ? 1 : 0), y); dot(Math.round(p[0]), Math.round(p[1]), '#9ccbee'); } if (T.gem) { const g = at(0, 4); gem(g[0], g[1], 1.4); } }
        break;
      }
      case 'offhand':
        if (base === 'shield') { [[-9, -11], [9, -11], [-8, 2], [8, 2]].forEach(([x, y]) => rivet(16 + x, 16 + y, 'metal')); gem(16, 19.5, 2.2, T.gem || col('metal')); stitch(9, 5, 23, 5, clothLight); }
        else if (base === 'buckler') { for (let a = 0; a < 360; a += 45) { const t = (a * Math.PI) / 180; rivet(Math.round(16 + Math.cos(t) * 12.2), Math.round(16 + Math.sin(t) * 12.2), 'metal'); } gem(16, 16, 2.2); }
        else { for (let y = 5; y <= 27; y += 2) dot(25, y, '#c9bea6'); [[5, 2], [5, 29]].forEach(([x, y]) => { b.next(); b.mats[b.part] = 'metal'; b.rect(x - 1, y - 1, 3, 3, col('trim')); }); stitch(6, 3, 6, 29, mix(col('cloth'), '#fff1d0', 0.5)); gem(16.5, 16, 2, T.gem || col('trim')); }
        break;
      case 'head':
        if (base === 'helm') { for (let x = -10; x <= 10; x += 5) rivet(16 + x, 18, 'trim'); for (let y = 6; y <= 14; y++) dot(16, y, mix(col('metal'), '#ffffff', 0.4)); gem(16, 18.5, 1.6); }
        else if (base === 'viking') { for (let x = -9; x <= 9; x += 4.5) rivet(Math.round(16 + x), 18, 'trim'); for (let y = 6; y <= 15; y++) dot(16, y, mix(col('metal'), '#ffffff', 0.4)); [[-14, -12], [14, -12]].forEach(([x, y]) => dot(16 + x, 16 + y, '#c9b88f')); gem(16, 18.5, 1.6); }
        else if (base === 'wizard') { [[-2, -4], [3, -9], [1, 1], [6, -1]].forEach(([x, y], k) => { const c = T.gem || '#ffe27a'; dot(16 + x, 16 + y, c); if (k % 2) { dot(15 + x, 16 + y, c); dot(17 + x, 16 + y, c); dot(16 + x, 15 + y, c); dot(16 + x, 17 + y, c); } }); }
        else if (base === 'pot') { for (let x = 5; x <= 27; x += 1) if (x % 3) dot(x, 10, '#a8aebb'); dot(8, 13, '#c9cdd6'); dot(9, 13, '#c9cdd6'); }
        else if (base === 'frog') { [[-6, -10.5], [6, -10.5]].forEach(([x, y]) => { blob(16 + x, 16 + y, 2.2, 2.2, '#fbf6ea', 'gem'); dot(16 + x, 16 + y, '#1a1020'); dot(16 + x - 1, 15 + y, '#1a1020'); }); dot(9, 19, '#ff9ab0'); dot(23, 19, '#ff9ab0'); for (let x = 12; x <= 20; x++) dot(x, 22 + (x === 12 || x === 20 ? -1 : 0), '#3f7a2a'); }
        else if (base === 'crown') { [[-12, -12.5], [0, -15.5], [12, -12.5]].forEach(([x, y]) => blob(16 + x, 16 + y, 1.6, 1.6, '#fbf6ea', 'gem')); gem(16, 17.5, 2.2, T.gem || '#c0392b'); gem(9, 17.5, 1.5, '#4aa3ff'); gem(23, 17.5, 1.5, '#3aa655'); }
        else if (base === 'bandana') { for (let y = 7; y <= 15; y += 3) for (let x = 6 + (y % 2) * 2; x <= 26; x += 4) dot(x, y, clothLight); }
        else if (base === 'hood') { stitch(6, 6, 3, 26, clothDark); stitch(26, 6, 29, 26, clothDark); dot(13, 22, T.gem || '#ffd25a'); dot(19, 22, T.gem || '#ffd25a'); }
        break;
      case 'top':
        if (base === 'plate') { for (let y = 6; y <= 20; y++) dot(16, y, mix(col('metal'), '#ffffff', 0.45)); [[9, 7], [23, 7], [7, 18], [25, 18]].forEach(([x, y]) => rivet(x, y, 'metal')); gem(16, 11, 2); for (let x = 7; x <= 25; x += 3) dot(x, 23, trimLight); }
        else if (base === 'leather') { for (let y = 13; y <= 21; y += 2) { dot(15, y, '#e6d2a8'); dot(17, y + 1, '#e6d2a8'); } stitch(5, 6, 4, 22, '#c99a6a'); stitch(27, 6, 28, 22, '#c99a6a'); { b.next(); b.mats[b.part] = 'leather'; b.rect(6, 15, 5, 4, mix(LEATHER, '#140a22', 0.2)); } dot(8, 15, '#e6d2a8'); gem(16, 24, 1.4, T.gem || '#c0c6d0'); }
        else if (base === 'robe') { for (const [x1, x2] of [[13, 9], [19, 23], [16, 16]]) for (let y = 19; y <= 26; y++) dot(Math.round(x1 + ((x2 - x1) * (y - 19)) / 7), y, clothDark); for (const [x1, x2] of [[5, 3], [27, 29]]) for (let y = 9; y <= 14; y++) dot(Math.round(x1 + ((x2 - x1) * (y - 9)) / 5), y, clothDark); gem(16, 8, 1.4); gem(16, 16.5, 1.6); }
        else if (base === 'tunic') { gem(16, 4, 1.3); }
        else { [12, 13, 19, 20].forEach((y) => { for (let x = 6; x <= 26; x++) if (b.m[y * 32 + x] !== null) dot(x, y, y % 7 === 5 || y % 7 === 6 ? col('trim') : col('trim')); }); for (let x = 7; x <= 25; x += 2) dot(x, 25, clothDark); [1, 2].forEach((k) => { dot(2 + k, 15, col('trim')); dot(29 - k, 15, col('trim')); }); }
        break;
      case 'bottom':
        if (base === 'pants') { for (let y = 6; y <= 14; y++) dot(16, y, clothDark); { b.next(); b.mats[b.part] = 'cloth'; b.rect(7, 19, 5, 4, mix(col('cloth'), '#8a5a34', 0.35)); } }
        else if (base === 'shorts') { for (let y = 11; y <= 17; y++) dot(16, y, clothDark); }
        else if (base === 'kilt') { for (let x = 5; x <= 27; x += 4) for (let y = 8; y <= 24; y++) dot(x + Math.round(((y - 8) * (x - 16)) / 55), y, clothDark); for (const y of [13, 19]) for (let x = 4; x <= 28; x++) if (b.m[y * 32 + x] !== null && b.p[y * 32 + x] === b.p[13 * 32 + 6]) dot(x, y, col('trim')); dot(16, 15, '#e6d2a8'); }
        else { [[8, 7], [8, 25], [24, 7], [24, 25]].forEach(([x, y]) => rivet(x, y, 'metal')); for (const y of [9, 23]) { for (let x = 7; x <= 14; x++) dot(x, y, '#5a3a24'); for (let x = 18; x <= 25; x++) dot(x, y, '#5a3a24'); } gem(10, 16, 1.4); gem(22, 16, 1.4); }
        break;
      case 'shoes':
        if (base === 'boots') { for (let y = 6; y <= 16; y += 3) { dot(18, y, '#e6d2a8'); dot(20, y + 1, '#e6d2a8'); } stitch(10, 7, 10, 25, '#c99a6a'); }
        else if (base === 'sabatons') { for (let k = 0; k < 4; k++) for (let x = 9 + k * 2; x <= 21 + k * 2; x++) dot(x, 8 + k * 4, mix(col('metal'), '#140a22', 0.35)); rivet(11, 4, 'metal'); rivet(19, 4, 'metal'); gem(15, 3.5, 1.3); }
        else if (base === 'sandals') { for (let x = 4; x <= 29; x += 2) dot(x, 27, '#5a3a24'); gem(16, 12, 1.6, T.gem || '#c9cdd6'); }
        else { blob(31, 13, 1.6, 1.6, 'trim', 'cloth'); stitch(11, 8, 11, 25, clothLight); gem(16, 4, 1.4, T.gem || col('trim')); }
        break;
      case 'gloves': {
        const c = base === 'gauntlets' ? 'metal' : LEATHER, mat = base === 'gauntlets' ? 'metal' : 'leather';
        blob(16, 19, 7.6, 7, c, mat);
        [[-5.2, -1, 9], [-1.8, -3, 11], [1.8, -2.4, 10], [5, -0.6, 8]].forEach(([x, y, l]) => { b.next(); b.mats[b.part] = mat; b.cap(16 + x, 16 + y, 16 + x * 1.1, 16 + y - l, 3.4, col(c)); });
        b.next(); b.mats[b.part] = mat; b.cap(22, 20, 28, 13, 3.4, col(c));
        shape('M-8.5 9 L8.5 9 L9 15 L-9 15 Z', base === 'gauntlets' ? 'trim' : 'cloth', base === 'gauntlets' ? 'metal' : 'cloth');
        if (base === 'gauntlets') { for (let x = 10; x <= 22; x += 4) rivet(x, 17, 'metal'); gem(16, 27.5, 1.6); } else { stitch(9, 18, 23, 18, '#c99a6a'); }
        break;
      }
      case 'cape':
        if (base === 'scarf') { for (const [x0, y0] of [[22, 22], [12, 21]]) for (let y = y0; y <= y0 + 2; y++) for (let x = x0 - 2; x <= x0 + 4; x++) if (b.m[y * 32 + x] !== null) dot(x, y, col('trim')); for (let x = 21; x <= 27; x += 2) { b.next(); b.mats[b.part] = 'cloth'; b.rect(x, 30, 1, 2, col('trim')); } for (let x = 11; x <= 16; x += 2) { b.next(); b.mats[b.part] = 'cloth'; b.rect(x, 28, 1, 2, col('trim')); } }
        else { for (const [x1, x2] of [[11, 7], [21, 25]]) for (let y = 7; y <= 27; y++) dot(Math.round(x1 + ((x2 - x1) * (y - 7)) / 20), y, clothDark); gem(16, 3, 2.2, T.gem || col('metal')); }
        break;
      case 'ring1': case 'ring2': {
        blob(16, 20, 10, 8.4, 'metal', 'metal');
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const dx = (x + 0.5 - 16) / 6.6, dy = (y + 0.5 - 21) / 5; if (dx * dx + dy * dy <= 1) b.m[y * 32 + x] = null; }
        shape('M-5 -7 L5 -7 L3.5 -2 L-3.5 -2 Z', 'metal', 'metal', 16, 16);
        gem(16, 8.5, 4.4, T.gem || '#8fb8c8');
        for (let a = 0; a < 360; a += 90) { const t = ((a + 45) * Math.PI) / 180; dot(Math.round(16 + Math.cos(t) * 4.4), Math.round(8.5 + Math.sin(t) * 4.4), mix(col('metal'), '#ffffff', 0.4)); }
        break;
      }
      case 'amulet':
        for (let a = 10; a <= 170; a += 9) { const t = (a * Math.PI) / 180; dot(Math.round(16 + Math.cos(t) * 12), Math.round(2 + Math.sin(t) * 13), a % 18 ? mix(col('metal'), '#ffffff', 0.35) : mix(col('metal'), '#140a22', 0.3)); }
        shape('M0 -8 Q8 -8 8.5 1 Q8 10 0 13.5 Q-8 10 -8.5 1 Q-8 -8 0 -8 Z', 'metal', 'metal', 16, 15);
        shape('M0 -5.5 Q5.6 -5.5 5.8 1 Q5.6 7.5 0 10 Q-5.6 7.5 -5.8 1 Q-5.6 -5.5 0 -5.5 Z', 'trim', 'metal', 16, 15);
        gem(16, 16.5, 3.6, T.gem || '#5fb3a8');
        break;
      case 'trinket': {
        const k = (seed || 0) % 3;
        if (k === 0) { shape('M-8 -12 L8 -12 L1.8 0 L8 12 L-8 12 L-1.8 0 Z', '#cfe6f2', 'gem'); shape('M-9.5 -14.5 L9.5 -14.5 L9.5 -11 L-9.5 -11 Z', 'metal', 'metal'); shape('M-9.5 11 L9.5 11 L9.5 14.5 L-9.5 14.5 Z', 'metal', 'metal'); b.next(); b.mats[b.part] = 'cloth'; b.ellipse(16, 25, 5, 2.4, '#f0d890'); b.rect(15, 15, 2, 9, '#f0d890'); b.ellipse(16, 10.5, 4.6, 1.8, '#f0d890'); gem(16, 3, 1.4); }
        else if (k === 1) { b.glow(16, 13, 13, T.gem || '#6fb7ff'); blob(16, 13, 9.5, 9.5, T.gem || '#6fb7ff', 'gem'); dot(12, 8, '#ffffff'); dot(13, 8, '#ffffff'); dot(12, 9, '#ffffff'); shape('M-9 7 L9 7 L6.5 14 L-6.5 14 Z', 'metal', 'metal', 16, 15); rivet(12, 25, 'metal'); rivet(19, 25, 'metal'); }
        else { shape('M-10 -3 Q-10 -14 0 -14 Q10 -14 10 -3 L10 5 Q8 9 5 9 L5 13 L-5 13 L-5 9 Q-8 9 -10 5 Z', BONE, 'bone', 16, 15); blob(11.5, 15, 3, 3.2, '#1d1226', 'cloth'); blob(20.5, 15, 3, 3.2, '#1d1226', 'cloth'); dot(11, 15, T.gem || '#ff5a3a'); dot(20, 15, T.gem || '#ff5a3a'); for (let x = 12; x <= 20; x += 2) dot(x, 25, '#8a7a5c'); shape('M-1.4 0 L0 -2.4 L1.4 0 Z', '#1d1226', 'cloth', 16, 21); }
        break;
      }
      case 'glyph': {
        const g = (window.IT_GLYPH_COLORS || {})[base] || '#c9a8ff';
        shape('M-12 -8 L-8.5 -13 L8.5 -13 L12 -8 L12 8 L8.5 13 L-8.5 13 L-12 8 Z', '#4a4458', 'bone');
        shape('M-9 -6 L-6.5 -10 L6.5 -10 L9 -6 L9 6 L6.5 10 L-6.5 10 L-9 6 Z', '#3a3546', 'bone');
        b.glow(16, 16, 12, g);
        const rune = { ember: 'M0 -8 L4 0 L0 8 L-4 0 Z M0 -3 L0 3', frost: 'M0 -8 L0 8 M-7 -4 L7 4 M-7 4 L7 -4', thorn: 'M0 -8 L0 8 M0 -2 L5 -6 M0 3 L-5 -1', tide: 'M-7 -2 Q-3 -7 0 -2 Q3 3 7 -2 M-7 4 Q-3 -1 0 4 Q3 9 7 4', storm: 'M2 -8 L-4 1 L1 1 L-2 8 L5 -2 L0 -2 Z', shadow: 'M-6 -6 Q6 -8 6 0 Q6 8 -6 6 Q2 3 2 0 Q2 -4 -6 -6 Z', light: 'M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z', stone: 'M-6 6 L-6 -2 L0 -8 L6 -2 L6 6 Z' }[base] || 'M-5 -5 L5 5 M5 -5 L-5 5';
        b.next(); rune.split(' M').forEach((seg, n) => { const pts = (n ? 'M' + seg : seg).match(/-?\d+(\.\d+)?/g).map(Number); for (let i = 0; i + 3 < pts.length; i += 2) b.line(16 + pts[i], 16 + pts[i + 1], 16 + pts[i + 2], 16 + pts[i + 3], mix(g, '#ffffff', 0.35), { flat: true }); });
        break;
      }
    }
    if (T.glow && slot !== 'glyph') for (let i = 0; i < 4; i++) { const r = ((seed || 7) * (i + 3) * 7919) % 1000; b.glow(4 + (r % 24), 4 + (((r / 24) | 0) % 24), 1.6, '#ffffff'); }
    return softCanvas(b);
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
      case 'lore': path('M-7 -5 Q-3.5 -7 0 -5 L0 6 Q-3.5 4 -7 6 Z', '#f2ead8'); path('M0 -5 Q3.5 -7 7 -5 L7 6 Q3.5 4 0 6 Z', '#e0d4bc'); path('M-0.6 -5 L0.6 -5 L0.6 6 L-0.6 6 Z', '#8a5a34'); path('M3 -4 L4.5 -4 L4.5 2 L3.75 1 L3 2 Z', '#c0392b'); break;
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
  // Sprites by art key. A dungeon file names the key for each enemy and boss (content/<pack>/dungeons/*.json).
  const SPRITES = {
    hound: (frame) => hound(frame),
    matron: (frame) => matron(frame),
    golem: (frame) => P.golem(frame === 'atk' ? 'slam' : frame === 'idle1' ? 'raise' : 'idle'),
    imp: (frame) => imp(frame, '#c8462a', '#ffb070', false),
    brute: (frame) => imp(frame, '#9a3a2a', '#d88a5a', true),
    shard: (frame) => shard(frame),
  };
  A.SPRITES = SPRITES;
  // name -> { art, scale } for the dungeon being shown; set by A.setDungeon from the server's config.
  let cast = {};
  A.monster = (kind, name, frame) => memo(['m', kind, name, frame].join(':'), () => {
    const key = (cast[name] && cast[name].art) || (kind === 'boss' ? 'golem' : kind === 'brute' || kind === 'shard' ? kind : 'imp');
    return (SPRITES[key] || SPRITES.imp)(frame);
  });
  // Scale each piece of art is drawn at in the arena.
  A.monsterScale = (kind, name) => (cast[name] && cast[name].scale) || (kind === 'boss' ? 3.4 : 2.6);

  // ------------------------------------------------------------------ dungeon scenery

  // Each wing of Ember Hollow has its own palette and props. Layers are tall strips drawn once at 1/3 scale
  // and scrolled at different speeds while the group walks.
  let WINGS = [
    { name: 'Cinder Halls', sky: ['#1a0d14', '#2c1218'], rock: '#3a1e22', rock2: '#4c2826', floor: '#3b2224', floor2: '#4a2c2a', glow: '#ff6a1a', accent: '#ff9a3a', prop: 'lava' },
    { name: 'Slag Pools', sky: ['#0f1220', '#1a2032'], rock: '#232a40', rock2: '#2f3852', floor: '#262a3a', floor2: '#323850', glow: '#ff8a2a', accent: '#5fd0ff', prop: 'crystal' },
    { name: 'Golem Forge', sky: ['#170d0a', '#2a1610'], rock: '#3a2618', rock2: '#4e3420', floor: '#3a2a20', floor2: '#4c382a', glow: '#ffb340', accent: '#ffd25a', prop: 'forge' },
  ];
  A.WINGS = WINGS;
  // The dungeon's wings (names and scenery palettes) and its enemies' art come from its data file.
  A.setDungeon = (d) => {
    if (!d || A.dungeon === d.id) return;
    A.dungeon = d.id;
    WINGS = A.WINGS = d.wings.map((w) => Object.assign({ name: w.name }, w.scene));
    cast = {};
    for (const e of Object.values(d.enemies || {})) cast[e.name] = { art: e.art };
    for (const b of Object.values(d.bosses || {})) cast[b.name] = { art: b.art, scale: b.scale };
    for (const k of [...cache.keys()]) if (/^(L:|m:|u:m:)/.test(k)) cache.delete(k);
  };
  const rnd = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  // Three parallax strips per wing, 640 x 180 pixels, shown at 3x. They tile sideways, so anything that
  // crosses the edge is drawn again on the other side. Layer 0 is the far cave, 1 the pillars and props,
  // 2 the floor.
  function layer(w, which) {
    const W = 640, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), r = rnd(which * 97 + w * 13 + 5), P2 = WINGS[w];
    const px = (x, y, ww, hh, col) => { g.fillStyle = col; x = Math.round(x); y = Math.round(y); ww = Math.round(ww); hh = Math.round(hh); g.fillRect(x, y, ww, hh); if (x + ww > W) g.fillRect(x - W, y, ww, hh); if (x < 0) g.fillRect(x + W, y, ww, hh); };
    const poly = (pts, col) => { [0, -W, W].forEach((o) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x + o, y) : g.moveTo(x + o, y))); g.closePath(); g.fill(); }); };
    const halo = (x, y, rad, col, a) => [0, -W, W].forEach((o) => { const gr = g.createRadialGradient(x + o, y, 0, x + o, y, rad); gr.addColorStop(0, hexA(col, a)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(x + o - rad, y - rad, rad * 2, rad * 2); });
    const dk = (col, k) => mix(col, '#05020a', k), lt = (col, k) => mix(col, '#fff1d0', k);
    // a stone block with a lit top-left edge, a dark bottom-right edge and the odd crack
    const block = (x, y, ww, hh, col) => { px(x, y, ww, hh, col); px(x, y, ww, 1, lt(col, 0.14)); px(x, y, 1, hh, lt(col, 0.08)); px(x, y + hh - 1, ww, 1, dk(col, 0.35)); px(x + ww - 1, y, 1, hh, dk(col, 0.3)); if (r() < 0.25) { let cx = x + 2 + r() * (ww - 4), cy = y + 1; for (let k = 0; k < hh - 2; k++) { px(cx, cy + k, 1, 1, dk(col, 0.45)); cx += r() < 0.3 ? (r() < 0.5 ? -1 : 1) : 0; } } };
    if (which === 0) {
      // banded, dithered gradient: deep at the top, warm toward the floor
      const bands = [dk(P2.sky[0], 0.3), P2.sky[0], mix(P2.sky[0], P2.sky[1], 0.5), P2.sky[1], mix(P2.sky[1], P2.glow, 0.12)];
      for (let y = 0; y < H; y++) { const f = (y / H) * (bands.length - 1), i = Math.floor(f), fr = f - i; for (let x = 0; x < W; x++) if (fr < 0.5 || (x + y) % 2) { g.fillStyle = bands[i]; g.fillRect(x, y, 1, 1); } else { g.fillStyle = bands[Math.min(bands.length - 1, i + 1)]; g.fillRect(x, y, 1, 1); } }
      // two ranges of far rock, the nearer one darker and lit from below
      [[0.5, 70, 40], [0.25, 95, 34]].forEach(([k, base, amp], n) => {
        const col = mix(P2.rock, P2.sky[1], k), pts = [[0, H]];
        for (let x = 0; x <= W; x += 8) pts.push([x, base + Math.sin((x / W) * Math.PI * 2 * (3 + n)) * amp * 0.4 + (r() - 0.5) * amp * 0.5]);
        pts[pts.length - 1][1] = pts[1][1]; pts.push([W, H]);
        g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
        for (let x = 0; x < W; x += 2) { const y = pts[Math.min(pts.length - 2, 1 + Math.floor(x / 8))][1]; px(x, y, 2, 1, lt(col, 0.12)); }
      });
      if (P2.prop === 'lava') {
        // ruined arches against a lava-lit horizon
        halo(320, 175, 260, P2.glow, 0.28);
        for (let n = 0; n < 3; n++) { const x = 60 + n * 220 + r() * 40, top = 52 + r() * 14, col = mix(P2.rock, P2.sky[1], 0.15); px(x, top, 12, 120, col); px(x + 58, top + 8, 12, 112, col); for (let a = 0; a <= 20; a++) { const t = (a / 20) * Math.PI, ax = x + 35 - Math.cos(t) * 29, ay = top + 8 - Math.sin(t) * 20; px(ax - 4, ay, 8, 8, col); } px(x - 2, top - 3, 16, 4, lt(col, 0.1)); if (r() < 0.7) px(x + 58, top + 3, 14, 6, col); }
      } else if (P2.prop === 'crystal') {
        // glowing crystals hanging in the dark and mist over the pools
        for (let n = 0; n < 14; n++) { const x = r() * W, len = 14 + r() * 34, wv = 3 + r() * 5; poly([[x - wv, 0], [x + wv, 0], [x, len]], mix(P2.accent, P2.sky[0], 0.55)); px(x - 1, len * 0.4, 1, len * 0.4, mix(P2.accent, '#ffffff', 0.2)); if (r() < 0.5) halo(x, len, 18, P2.accent, 0.18); }
        for (let k = 0; k < 3; k++) { const y = 120 + k * 16; for (let x = 0; x < W; x += 4) if ((x / 4 + k) % 3) px(x, y + Math.sin(x / 40 + k) * 3, 4, 1, hexA('#a8d8ff', 0.08 + k * 0.03)); }
      } else {
        // the forge: huge cogs and lit furnace windows far off
        halo(320, 150, 280, P2.glow, 0.2);
        for (let n = 0; n < 3; n++) { const cx = 90 + n * 210 + r() * 40, cy = 60 + r() * 30, R = 26 + r() * 16, col = mix(P2.rock, P2.sky[1], 0.2); for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; px(cx + Math.cos(t) * (R + 3) - 3, cy + Math.sin(t) * (R + 3) - 3, 7, 7, col); } [0, -W, W].forEach((o) => { g.fillStyle = col; g.beginPath(); g.arc(cx + o, cy, R, 0, Math.PI * 2); g.fill(); g.fillStyle = P2.sky[1]; g.beginPath(); g.arc(cx + o, cy, R * 0.35, 0, Math.PI * 2); g.fill(); }); }
        for (let n = 0; n < 9; n++) { const x = r() * W, y = 96 + r() * 30; px(x, y, 6, 9, dk(P2.rock, 0.3)); px(x + 1, y + 1, 4, 7, mix(P2.glow, '#ffe0a0', 0.3)); px(x + 1, y + 4, 4, 1, dk(P2.rock, 0.3)); halo(x + 3, y + 5, 14, P2.glow, 0.25); }
      }
      // stalactites along the ceiling with a lit edge
      for (let x = 0; x < W; x += 6 + r() * 16) { const h = 10 + r() * 30, wv = 5 + r() * 9, col = dk(P2.rock, 0.25); poly([[x, 0], [x + wv, 0], [x + wv * 0.45, h]], col); poly([[x, 0], [x + 2, 0], [x + wv * 0.45, h]], lt(col, 0.1)); }
    } else if (which === 1) {
      // pillars of fitted stone with capitals, bases and per-block shading
      for (let n = 0; n < 4; n++) {
        const x = n * 160 + 16 + r() * 60, pw = 22 + Math.round(r() * 8), col = P2.rock2;
        for (let y = 10, row = 0; y < 140; y += 10, row++) { const off = row % 2 ? pw / 2 : 0; block(x + off - (off ? pw / 2 : 0), y, off ? pw / 2 : pw, 10, mix(col, '#000000', r() * 0.08)); if (off) block(x + pw / 2, y, pw / 2, 10, mix(col, '#000000', r() * 0.08)); }
        block(x - 5, 2, pw + 10, 9, lt(col, 0.05)); block(x - 3, 0, pw + 6, 3, dk(col, 0.1));
        block(x - 6, 138, pw + 12, 10, dk(col, 0.05)); block(x - 3, 134, pw + 6, 5, col);
        px(x + pw, 10, 3, 124, hexA('#000000', 0.25));
        // wing touches on the pillars
        if (P2.prop === 'crystal' && r() < 0.8) { const cx = x + (r() < 0.5 ? -4 : pw + 2), cy = 40 + r() * 60; for (let k = 0; k < 4; k++) poly([[cx, cy + k * 3], [cx + (k % 2 ? 9 : -9), cy - 6 + k * 5], [cx + (k % 2 ? 4 : -4), cy + 6 + k * 3]], mix(P2.accent, '#ffffff', k * 0.12)); halo(cx, cy + 4, 24, P2.accent, 0.25); }
        if (P2.prop !== 'crystal') {
          // a torch in an iron bracket, flame and warm halo
          const tx = x + pw / 2, ty = 62 + (n % 2) * 14;
          halo(tx, ty - 4, 46, P2.glow, 0.32);
          px(tx - 4, ty + 4, 8, 3, '#2a2228'); px(tx - 1, ty, 2, 8, '#4a3a2a'); px(tx - 2, ty - 2, 4, 3, '#2a2228');
          px(tx - 2, ty - 8, 4, 6, P2.glow); px(tx - 1, ty - 11, 2, 4, mix(P2.glow, '#ffe080', 0.5)); px(tx - 1, ty - 6, 2, 3, '#fff2b0');
        }
      }
      // banners and chains between the pillars
      for (let n = 0; n < 4; n++) {
        const x = n * 160 + 100 + r() * 30;
        if (P2.prop === 'forge') { for (let y = 0; y < 50 + r() * 40; y += 4) { px(x + (y / 4) % 2, y, 3, 3, '#5a5058'); px(x + (y / 4) % 2, y, 1, 1, '#8a8088'); } px(x - 2, 94, 7, 3, '#5a5058'); px(x + 3, 97, 2, 5, '#5a5058'); }
        else { const bw = 18, bh = 44 + r() * 14, cl = w === 0 ? '#7a1e22' : '#1e3a6a'; px(x - 2, 14, bw + 4, 3, '#5a3a24'); poly([[x, 17], [x + bw, 17], [x + bw, 17 + bh], [x + bw / 2, 17 + bh - 8], [x, 17 + bh]], cl); px(x, 17, 2, bh - 2, lt(cl, 0.15)); px(x + bw - 2, 17, 2, bh - 2, dk(cl, 0.3)); poly([[x + bw / 2, 30], [x + bw / 2 + 5, 38], [x + bw / 2, 46], [x + bw / 2 - 5, 38]], '#f0c23a'); px(x + bw / 2 - 1, 36, 2, 4, '#fff0b0'); }
      }
      // ground props in front of the wall
      for (let n = 0; n < 5; n++) {
        const x = r() * W;
        if (P2.prop === 'lava') { poly([[x, 150], [x + 6, 126 + r() * 6], [x + 22, 120 + r() * 6], [x + 36, 132], [x + 40, 150]], dk(P2.rock, 0.1)); px(x + 8, 128, 10, 1, lt(P2.rock, 0.1)); }
        else if (P2.prop === 'crystal') { for (let k = 0; k < 4; k++) { const cx = x + k * 6, ht = 12 + r() * 20; poly([[cx, 150], [cx + 3, 150 - ht], [cx + 6, 150]], mix(P2.accent, '#0a1430', 0.25 + k * 0.08)); px(cx + 2, 150 - ht + 4, 1, ht * 0.5, mix(P2.accent, '#ffffff', 0.4)); } halo(x + 12, 140, 30, P2.accent, 0.2); }
        else { px(x, 136, 26, 6, '#2a2020'); px(x + 4, 130, 18, 6, '#4a4048'); px(x + 4, 130, 18, 1, '#6a6068'); px(x + 9, 142, 8, 8, '#2a2020'); if (r() < 0.5) { px(x + 34, 128, 14, 22, '#3a2c22'); px(x + 34, 128, 14, 2, '#5a4632'); px(x + 36, 134, 10, 1, '#2a2018'); px(x + 36, 142, 10, 1, '#2a2018'); } }
      }
    } else {
      // the floor: a lit lip, then uneven flagstones with cracks, pebbles and the wing's seams
      const ledge = mix(P2.floor2, '#000000', 0.2);
      px(0, 146, W, 4, ledge); px(0, 146, W, 1, lt(ledge, 0.2)); px(0, 150, W, 2, dk(ledge, 0.5));
      for (let y = 152, row = 0; y < H; row++) {
        const hh = 7 + row * 2; let x = -r() * 20;
        while (x < W) { const ww = 14 + Math.round(r() * 18) + row * 3, col = r() < 0.3 ? P2.floor2 : mix(P2.floor, P2.floor2, r() * 0.5); block(x, y, ww - 1, hh - 1, col); x += ww; }
        y += hh;
      }
      for (let k = 0; k < 40; k++) { const x = r() * W, y = 154 + r() * 24; px(x, y, 2, 1, lt(P2.floor2, 0.15)); px(x, y + 1, 2, 1, dk(P2.floor, 0.4)); }
      if (P2.prop === 'lava' || P2.prop === 'forge') for (let k = 0; k < 10; k++) { const x = r() * W, y = 156 + r() * 20, len = 8 + r() * 18; for (let i = 0; i < len; i++) { const yy = y + Math.round(Math.sin(i * 0.7 + k) * 1.2); px(x + i, yy, 1, 1, mix(P2.glow, '#ffe080', 0.3)); } halo(x + len / 2, y, 12, P2.glow, 0.22); }
      if (P2.prop === 'crystal') for (let k = 0; k < 6; k++) { const x = r() * W, y = 158 + r() * 16, ww = 22 + r() * 30; px(x + 2, y, ww - 4, 1, hexA('#9ad8ff', 0.4)); px(x, y + 1, ww, 3, hexA('#2a4a7a', 0.7)); px(x + 3, y + 1, ww * 0.4, 1, hexA('#cfeaff', 0.6)); }
      if (P2.prop === 'forge') for (let k = 0; k < 3; k++) { const x = r() * W; px(x, 160, 30, 12, '#2a2226'); for (let i = 2; i < 30; i += 4) px(x + i, 162, 2, 8, mix(P2.glow, '#000000', 0.4)); px(x, 160, 30, 1, '#5a5058'); }
    }
    return c;
  }
  function hexA(hex, a) { if (hex.startsWith('rgba')) return hex; const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  A.layer = (wing, which) => memo('L:' + wing + ':' + which, () => layer(wing, which));

  // ------------------------------------------------------------------ UI skin

  // Pixel frames, buttons and textures for the interface, drawn once and handed to the stylesheet as CSS
  // variables (--ui-*). Frames are 9-slice images: app.css shows them at 2x through border-image.
  function canvasOf(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }); return c.toDataURL(); }
  // frame: outline, bevelled rim, inner shadow line and studs in the corners
  function frame(size, rim, stud, inner) {
    return canvasOf(size, size, (g, px) => {
      const s = size, e = s - 1;
      px(0, 0, s, s, '#110b06');
      px(1, 1, s - 2, s - 2, rim);
      px(1, 1, s - 2, 1, mix(rim, '#fff1d0', 0.35)); px(1, 1, 1, s - 2, mix(rim, '#fff1d0', 0.2));
      px(1, e - 1, s - 2, 1, mix(rim, '#090603', 0.45)); px(e - 1, 1, 1, s - 2, mix(rim, '#090603', 0.35));
      px(2, 2, s - 4, 1, mix(rim, '#fff1d0', 0.12)); px(2, 3, s - 4, 1, rim);
      px(4, 4, s - 8, s - 8, '#110b06');
      px(5, 5, s - 10, 1, mix(inner, '#090603', 0.5));
      g.clearRect(5, 6, s - 10, s - 11); g.clearRect(6, 5, s - 12, 1);
      if (stud) [[1, 1], [e - 5, 1], [1, e - 5], [e - 5, e - 5]].forEach(([x, y]) => { px(x, y, 5, 5, '#110b06'); px(x + 1, y + 1, 3, 3, stud); px(x + 1, y + 1, 2, 1, mix(stud, '#ffffff', 0.55)); px(x + 3, y + 3, 1, 1, mix(stud, '#090603', 0.45)); });
      // keep the four corner pixels empty for a softer, chipped look
      [[0, 0], [e, 0], [0, e], [e, e]].forEach(([x, y]) => g.clearRect(x, y, 1, 1));
    });
  }
  // button: 12 px 9-slice, filled, lighter top half, dark lip under it
  function button(face, edge) {
    return canvasOf(12, 12, (g, px) => {
      px(1, 0, 10, 12, '#110b06'); px(0, 1, 12, 10, '#110b06');
      px(1, 1, 10, 9, face); px(1, 1, 10, 4, mix(face, '#fff1d0', 0.18)); px(1, 1, 10, 1, mix(face, '#fff1d0', 0.5));
      px(1, 9, 10, 2, edge); px(1, 1, 1, 8, mix(face, '#fff1d0', 0.3)); px(10, 1, 1, 8, mix(face, '#090603', 0.25));
    });
  }
  // stone wall for the page and a dark, slightly mottled panel fill
  function wall() {
    return canvasOf(64, 48, (g, px) => {
      const r = rnd(4242);
      px(0, 0, 64, 48, '#191109');
      for (let y = 0, row = 0; y < 48; y += 12, row++) for (let x = row % 2 ? -16 : 0; x < 64; x += 32) {
        const col = mix('#2a1d10', '#352516', r());
        px(x + 1, y + 1, 30, 10, col); px(x + 1, y + 1, 30, 1, mix(col, '#fff1d0', 0.06)); px(x + 1, y + 10, 30, 1, mix(col, '#090603', 0.35));
        if (x < 0) { px(x + 65, y + 1, 30, 10, col); px(x + 65, y + 1, 30, 1, mix(col, '#fff1d0', 0.06)); px(x + 65, y + 10, 30, 1, mix(col, '#090603', 0.35)); }
        for (let k = 0; k < 6; k++) px(x + 2 + Math.floor(r() * 28), y + 2 + Math.floor(r() * 8), 1, 1, mix(col, r() < 0.5 ? '#090603' : '#fff1d0', 0.12));
      }
    });
  }
  function grain(base) {
    return canvasOf(32, 32, (g, px) => { const r = rnd(77); px(0, 0, 32, 32, base); for (let k = 0; k < 90; k++) px(Math.floor(r() * 32), Math.floor(r() * 32), 1, 1, mix(base, r() < 0.5 ? '#090603' : '#fff1d0', 0.05 + r() * 0.04)); });
  }
  // a small gold ornament for headings
  function ornament() {
    return canvasOf(11, 7, (g, px) => { px(5, 0, 1, 7, '#110b06'); px(4, 1, 3, 5, '#110b06'); px(3, 2, 5, 3, '#110b06'); px(0, 3, 11, 1, '#110b06'); px(5, 1, 1, 5, '#ffd25a'); px(4, 2, 3, 3, '#ffd25a'); px(5, 2, 1, 1, '#fff4c0'); px(1, 3, 2, 1, '#c9952a'); px(8, 3, 2, 1, '#c9952a'); });
  }
  A.applyTheme = () => {
    const vars = {
      '--ui-frame': frame(24, '#5f4a35', '#c9952a', '#2a1d10'),
      '--ui-frame-gold': frame(24, '#8a6a2a', '#ffd25a', '#2a1d10'),
      '--ui-frame-ember': frame(24, '#8a3a1a', '#ffb340', '#2a1d10'),
      '--ui-slot': frame(12, '#4e3b28', null, '#1a130b'),
      '--ui-btn': button('#634c35', '#3e2d1d'),
      '--ui-btn-hover': button('#775c41', '#3e2d1d'),
      '--ui-btn-primary': button('#e86a1e', '#8a3410'),
      '--ui-btn-primary-hover': button('#ff8a2a', '#8a3410'),
      '--ui-btn-on': button('#d9a53a', '#7a5414'),
      '--ui-wall': wall(),
      '--ui-panel': grain('#2a1d10'),
      '--ui-panel2': grain('#382818'),
      '--ui-ornament': ornament(),
    };
    const st = document.documentElement.style;
    Object.entries(vars).forEach(([k, v]) => st.setProperty(k, 'url("' + v + '")'));
  };
  try { A.applyTheme(); } catch (e) { /* the plain theme still works without the skin */ }
})();
