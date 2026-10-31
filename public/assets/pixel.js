// Idle Teams pixel sprite renderer.
// Chibi characters at 48 x 64 native pixels, facing left, feet on row 61.
// Every slot is drawn as its own part into an indexed buffer; a finishing pass
// then shades each part (light from the top left) and outlines the silhouette
// and the edges where parts overlap, so new gear only needs a shape and a dye.
(function () {
  const S = (window.ITP = window.ITP || {});

  // ---------- colour ----------
  const hx = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const toHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  const RAMPS = new Map();
  // highlight, base, shadow, deep, outline: shadows lean purple, highlights lean warm
  function ramp(c) {
    if (!RAMPS.has(c)) RAMPS.set(c, [mix(c, "#fff3cf", 0.38), c, mix(c, "#3b2a6a", 0.3), mix(c, "#24143a", 0.52), mix(c, "#120812", 0.74)].map(hx));
    return RAMPS.get(c);
  }

  // ---------- data ----------
  const RACES = {
    human: { name: "Human", leg: 8, torso: 10, tw: 4, head: 11, arm: 8, limb: 3, skins: ["#f6d7c3", "#eac0a2", "#d9a37f", "#bd8461", "#9a6646", "#7a4d33"] },
    elf: { name: "Elf", leg: 13, torso: 13, tw: 3.6, head: 10.4, arm: 11, limb: 2.6, ear: "elf", skins: ["#f8e2d2", "#efd0b6", "#d8b090", "#b98b6c", "#c9c3d8", "#a7b6c9"] },
    dwarf: { name: "Dwarf", leg: 3, torso: 8, tw: 6, head: 11, arm: 7, limb: 3.6, skins: ["#f3cfb6", "#e2b394", "#cc9474", "#b07656", "#8e5a3f"] },
    orc: { name: "Orc", leg: 15, torso: 17, tw: 7.6, head: 12.4, arm: 15, limb: 5, ear: "orc", tusks: true, skins: ["#9fb07a", "#7f9a5e", "#61804a", "#8a9a8c", "#a8876a"] },
    felkin: { name: "Felkin", leg: 7, torso: 10, tw: 3.8, head: 11, arm: 8, limb: 2.8, ear: "cat", tail: "cat", skins: ["#e9c9a0", "#c99b6a", "#8f6a4c", "#d8d2c8", "#5b4a43"] },
    draka: { name: "Draka", leg: 15, torso: 16, tw: 7, head: 12, arm: 14.5, limb: 4.6, ear: "fin", horns: true, tail: "dragon", skins: ["#c98d5e", "#a85f4a", "#7c8e6a", "#5f8a8a", "#6d6a8f"] },
  };
  const OPTIONS = {
    hair: { bald: "Bald", crop: "Crop", spiky: "Spiky", long: "Long", ponytail: "Ponytail", bob: "Bob", buns: "Twin buns", mohawk: "Mohawk" },
    eyes: { round: "Round", sharp: "Sharp", sleepy: "Sleepy", sparkle: "Sparkly" },
    mouth: { smile: "Smile", grin: "Grin", flat: "Serious", cat: "Cat", tongue: "Cheeky" },
    beard: { none: "None", stubble: "Stubble", moustache: "Moustache", full: "Full", braided: "Braided" },
    acc: { none: "None", glasses: "Round glasses", eyepatch: "Eyepatch", bandage: "Plaster", monocle: "Monocle" },
    hat: { none: "None", helm: "Iron helm", viking: "Horned helm", wizard: "Wizard hat", pot: "Cooking pot", frog: "Frog hood", crown: "Little crown", bandana: "Bandana", hood: "Hood" },
    top: { plate: "Plate", leather: "Leather vest", robe: "Robe", tunic: "Tunic", sweater: "Cozy sweater" },
    bottom: { pants: "Trousers", shorts: "Shorts", kilt: "Kilt", greaves: "Greaves" },
    shoes: { boots: "Boots", sabatons: "Sabatons", sandals: "Sandals", curly: "Curly shoes" },
    gloves: { none: "Bare hands", gauntlets: "Gauntlets", leather: "Leather gloves" },
    cape: { none: "None", cape: "Cape", scarf: "Long scarf" },
    weapon: { sword: "Sword", axe: "Axe", hammer: "Hammer", spear: "Spear", staff: "Staff", wand: "Wand", bow: "Bow", daggers: "Dagger", pan: "Frying pan", fish: "Fish" },
    offhand: { none: "None", shield: "Kite shield", buckler: "Buckler", book: "Spellbook" },
  };
  const DYES = ["#c0392b", "#e67e22", "#f1c40f", "#3aa655", "#1f8a8a", "#2f6fd0", "#5b3fa8", "#c2479a", "#ece4d4", "#3d3a44", "#8a5a34", "#5c7a3a"];
  const HAIRS = ["#2a2220", "#4a2f22", "#8a5a2b", "#d9a441", "#f0e2b0", "#c9502e", "#e9e6e0", "#8f8a85", "#4f6d9c", "#5f8f63", "#b05aa8", "#e88aa8"];
  const EYES = ["#5a3a26", "#8a5a30", "#3f9a4a", "#2f7ae0", "#7a8a96", "#e0a02a", "#d23b3b", "#8a4ad0"];
  const METALS = ["#b8c2cc", "#e0b04a", "#7d7f88", "#c58a5a"];

  // ---------- poses (same timing table as the vector prototype) ----------
  const SWING = ["sword", "axe", "hammer", "pan", "fish"];
  const standAngle = { sword: -62, axe: -62, hammer: -62, pan: -62, fish: -62, spear: -12, staff: -30, wand: -35, bow: 0, daggers: -100 };
  function pose(name, weapon) {
    const w = standAngle[weapon] ?? -60;
    const base = { dy: 0, fdx: 0, bdx: 0, aF: weapon === "staff" ? 30 : 8, aB: -6, wA: w, blink: false };
    switch (name) {
      case "stand1": return { ...base, dy: 1 };
      case "blink": return { ...base, blink: true };
      case "walk0": return { ...base, fdx: -2, bdx: 2, aF: -22, aB: 22 };
      case "walk1": return { ...base, dy: 1, aF: 0, aB: 0 };
      case "walk2": return { ...base, fdx: 2, bdx: -2, aF: 22, aB: -22 };
      case "walk3": return { ...base, dy: 1 };
      case "atk0":
        if (SWING.includes(weapon)) return { ...base, aF: -150, wA: 25, fdx: 1, bdx: -1 };
        if (weapon === "bow") return { ...base, aF: 88, aB: 70, wA: 0 };
        if (weapon === "staff" || weapon === "wand") return { ...base, aF: 135, wA: -25 };
        return { ...base, aF: 30, wA: -90 };
      case "atk1":
        if (SWING.includes(weapon)) return { ...base, aF: 50, wA: -105, fdx: -2, bdx: 1 };
        if (weapon === "bow") return { ...base, aF: 90, aB: 100, wA: 0 };
        if (weapon === "staff" || weapon === "wand") return { ...base, aF: 105, wA: -55, fdx: -1 };
        return { ...base, aF: 95, wA: -90, fdx: -2, bdx: 1 };
      case "atk2":
        if (SWING.includes(weapon)) return { ...base, aF: 85, wA: -150, fdx: -2, bdx: 1 };
        if (weapon === "bow") return { ...base, aF: 88, aB: 40, wA: 0 };
        if (weapon === "staff" || weapon === "wand") return { ...base, aF: 100, wA: -55 };
        return { ...base, aF: 70, wA: -90, fdx: -1 };
      default: return base;
    }
  }
  const POSES = ["stand0", "stand1", "blink", "walk0", "walk1", "walk2", "walk3", "atk0", "atk1", "atk2"];

  // ---------- indexed pixel buffer ----------
  // m: base colour, p: part id (draw order), f: 1 = flat (exact colour, no shading), s: forced ramp step
  function Buf(w, h) {
    this.w = w; this.h = h; this.n = w * h;
    this.m = new Array(this.n).fill(null); this.p = new Int16Array(this.n).fill(-1);
    this.f = new Uint8Array(this.n); this.s = new Int8Array(this.n).fill(-1);
    this.part = 0; this.fx = [];
  }
  const B = Buf.prototype;
  B.next = function () { this.part++; return this; };
  B.set = function (x, y, c, o) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const i = y * this.w + x;
    if (o && o.under && this.m[i]) return;
    if (o && o.on && this.p[i] !== o.on) return;
    this.m[i] = c; this.p[i] = o && o.part != null ? o.part : this.part;
    this.f[i] = o && o.flat ? 1 : 0; this.s[i] = o && o.step != null ? o.step : -1;
  };
  B.get = function (x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.m[y * this.w + x]; };
  B.partAt = function (x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.p[y * this.w + x]; };
  B.rect = function (x, y, w, h, c, o) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(Math.round(x) + i, Math.round(y) + j, c, o); };
  B.ellipse = function (cx, cy, rx, ry, c, o) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, c, o);
    }
  };
  // even-odd fill of one or more polygons, sampled at pixel centres
  B.poly = function (polys, c, o) {
    if (!polys.length) return;
    if (typeof polys[0][0] === "number") polys = [polys];
    let y0 = Infinity, y1 = -Infinity;
    polys.forEach((P) => P.forEach(([, y]) => { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }));
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const sy = y + 0.5, xs = [];
      polys.forEach((P) => {
        for (let i = 0; i < P.length; i++) {
          const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
          if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
        }
      });
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c, o);
    }
  };
  // capsule: every pixel whose centre is within w/2 of the segment
  B.cap = function (x1, y1, x2, y2, w, c, o) {
    const r = w / 2, dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y1, y2) - r - 1); y <= Math.max(y1, y2) + r + 1; y++) for (let x = Math.floor(Math.min(x1, x2) - r - 1); x <= Math.max(x1, x2) + r + 1; x++) {
      const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L2));
      const ex = px - (x1 + t * dx), ey = py - (y1 + t * dy);
      if (ex * ex + ey * ey <= r * r + 0.15) this.set(x, y, c, o);
    }
  };
  // 1 px line, used for flat details (strings, straps, glow cracks)
  B.line = function (x1, y1, x2, y2, c, o) {
    x1 = Math.round(x1); y1 = Math.round(y1); x2 = Math.round(x2); y2 = Math.round(y2);
    const dx = Math.abs(x2 - x1), dy = -Math.abs(y2 - y1), sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let e = dx + dy;
    for (;;) { this.set(x1, y1, c, o); if (x1 === x2 && y1 === y2) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x1 += sx; } if (e2 <= dx) { e += dx; y1 += sy; } }
  };
  // hand-drawn stamp: rows of characters looked up in a legend of colours
  B.stamp = function (rows, x, y, legend, o) {
    rows.forEach((r, j) => [...r].forEach((ch, i) => { const c = legend[ch]; if (c) this.set(x + i, y + j, c, { flat: true, part: this.part, ...o }); }));
  };
  // SVG path subset (M L Q C Z, absolute and relative) flattened to polygons, then transformed
  function pathPolys(d, tx, ty, s, rot) {
    const t = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g), polys = [];
    const ca = Math.cos(((rot || 0) * Math.PI) / 180), sa = Math.sin(((rot || 0) * Math.PI) / 180);
    const tf = (x, y) => [tx + (x * ca - y * sa) * s, ty + (x * sa + y * ca) * s];
    let i = 0, cmd = "", x = 0, y = 0, cur = null;
    const num = () => parseFloat(t[i++]);
    while (i < t.length) {
      if (/[a-zA-Z]/.test(t[i])) cmd = t[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === "M") { x = ox + num(); y = oy + num(); cur = [tf(x, y)]; polys.push(cur); cmd = rel ? "l" : "L"; }
      else if (C === "L") { x = ox + num(); y = oy + num(); cur.push(tf(x, y)); }
      else if (C === "Q") {
        const qx = ox + num(), qy = oy + num(), ex = ox + num(), ey = oy + num();
        for (let k = 1; k <= 6; k++) { const u = k / 6, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), cc = u * u; cur.push(tf(a * x + b * qx + cc * ex, a * y + b * qy + cc * ey)); }
        x = ex; y = ey;
      } else if (C === "C") {
        const ax = ox + num(), ay = oy + num(), bx = ox + num(), by = oy + num(), ex = ox + num(), ey = oy + num();
        for (let k = 1; k <= 8; k++) { const u = k / 8, v = 1 - u; cur.push(tf(v * v * v * x + 3 * v * v * u * ax + 3 * v * u * u * bx + u * u * u * ex, v * v * v * y + 3 * v * v * u * ay + 3 * v * u * u * by + u * u * u * ey)); }
        x = ex; y = ey;
      } else if (C === "Z") { if (cur) { x = cur[0] ? x : x; } }
      else i++;
    }
    return polys;
  }
  B.path = function (d, tx, ty, s, c, o, rot) { this.poly(pathPolys(d, tx, ty, s, rot), c, o); };

  // ---------- data parts (content/<pack>/art/*.json, see content/README.md) ----------
  // Parts drawn from layers: hair, hats and race features in head space, weapons and off-hands in hand space, tops in
  // torso space (u across the chest from -1 to 1, v from the shoulders at 0 to the hips at 1).
  const PARTS = { hair: {}, feature: {}, hat: {}, top: {}, weapon: {}, offhand: {} };
  const NAMED = { wood: "#8a5a34", darkwood: "#5e3b22", leather: "#6e4a31", steel: "#dfe6ec", iron: "#5b5f6b", bone: "#eadfc4", gold: "#f0c23a", paper: "#f2e8d0", dark: "#2a1e30", white: "#fbf6ee" };
  // "dye1", "metal:0.3" (darker), "steel+0.4" (lighter) or "#rrggbb"
  function colour(ref, c) {
    if (!ref) return null;
    if (ref[0] === "#") return ref;
    const m = ref.match(/^([a-z0-9]+)(?:([:+])([\d.]+))?$/i);
    if (!m) return "#ff00ff";
    const base = { metal: c.metal, dye1: c.dye1, dye2: c.dye2, skin: c.skin, hair: c.hairColor, eye: c.eyeColor, gem: mix(c.dye1 || "#8fd0ff", "#ffffff", 0.45) }[m[1]] || NAMED[m[1]] || "#ff00ff";
    return m[2] ? mix(base, m[2] === ":" ? "#2b2347" : "#ffffff", +m[3]) : base;
  }
  // tf maps part space to sprite pixels; sx and sy scale radii and line widths
  function drawLayers(b, layers, c, tf, sx, sy, face) {
    (layers || []).forEach((L) => {
      const [t] = L, opt = (o) => { const x = { ...(o || {}) }; if (x.on === "face") { if (face == null) return null; x.on = face; x.part = face; } else if (x.on === "self") { x.on = b.part; x.part = b.part; } return x; };
      if (t === "path") { const o = opt(L[3]); if (o === null) return; if (!o.on) b.next(); b.poly(pathPolys(L[1], 0, 0, 1, 0).map((P) => P.map(([x, y]) => tf(x, y))), colour(L[2], c), o); }
      else if (t === "poly") { const o = opt(L[3]); if (o === null) return; if (!o.on) b.next(); b.poly(L[1].map(([x, y]) => tf(x, y)), colour(L[2], c), o); }
      else if (t === "ellipse") { const o = opt(L[6]); if (o === null) return; if (!o.on) b.next(); const [x, y] = tf(L[1], L[2]); b.ellipse(x, y, Math.max(0.6, L[3] * sx), Math.max(0.6, L[4] * sy), colour(L[5], c), o); }
      else if (t === "line") { const o = opt(L[6]) || {}; const [x1, y1] = tf(L[1], L[2]), [x2, y2] = tf(L[3], L[4]); b.line(x1, y1, x2, y2, colour(L[5], c), { flat: true, ...o }); }
      else if (t === "dot") { const o = opt(L[4]) || {}; const [x, y] = tf(L[1], L[2]); b.set(x, y, colour(L[3], c), { flat: true, ...o }); }
      else if (t === "glow") { const [x, y] = tf(L[1], L[2]); b.glow(x, y, L[3] * sx, colour(L[4], c)); }
    });
  }
  const headTf = (hxC, hyC, k) => (x, y) => [hxC + x * k, hyC + y * k];
  const handTf = (x0, y0, k, rot) => { const a = ((rot || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a); return (x, y) => [x0 + (x * ca - y * sa) * k, y0 + (x * sa + y * ca) * k]; };
  // Add a catalogue ({parts, palettes}) to the renderer and the creator's option lists.
  function addArt(art) {
    if (!art) return;
    const OPT = { hair: "hair", hat: "hat", top: "top", weapon: "weapon", offhand: "offhand", feature: "feature" };
    for (const [kind, parts] of Object.entries(art.parts || {})) {
      if (!PARTS[kind]) continue;
      for (const [id, p] of Object.entries(parts || {})) { PARTS[kind][id] = p; (OPTIONS[OPT[kind]] = OPTIONS[OPT[kind]] || {})[id] = p.name; }
    }
    const pal = art.palettes || {};
    [[DYES, pal.dyes], [HAIRS, pal.hairs], [EYES, pal.eyes], [METALS, pal.metals]].forEach(([to, from]) => (from || []).forEach((x) => { if (!to.includes(x)) to.push(x); }));
    for (const r of Object.keys(RACES)) { const add = (pal.skins || {})[r] || []; add.forEach((x) => { if (!RACES[r].skins.includes(x)) RACES[r].skins.push(x); }); }
  }
  const featureOf = (c) => { const f = PARTS.feature[c.feature]; return f && (f.races || []).includes(c.race) ? f : null; };

  // finishing pass: shade each part, line the edges where a part sits behind another, outline the silhouette
  B.toCanvas = function () {
    const { w, h, m, p, f, s } = this, out = new Uint8ClampedArray(w * h * 4);
    const same = (i, x, y) => x >= 0 && y >= 0 && x < w && y < h && p[y * w + x] === p[i] && m[y * w + x] !== null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, c = m[i];
      let rgb;
      if (c === null) {
        // outline: empty pixel touching the sprite takes the darkest tone of what it touches
        let best = null;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) return;
          const j = Y * w + X;
          if (m[j] !== null && (best === null || p[j] > p[best])) best = j;
        });
        if (best === null) continue;
        rgb = f[best] ? hx(mix(m[best], "#120812", 0.72)) : ramp(m[best])[4];
      } else if (f[i] && s[i] < 0) rgb = hx(c);
      else {
        let st = s[i];
        if (st < 0) {
          const up = same(i, x, y - 1), dn = same(i, x, y + 1), rt = same(i, x + 1, y), lf = same(i, x - 1, y);
          st = 1;
          if (!up && (lf || !dn)) st = 0;
          else if (!rt || !dn) st = 2;
          // inner line where a part in front starts
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const X = x + dx, Y = y + dy;
            if (X < 0 || Y < 0 || X >= w || Y >= h) return false;
            const j = Y * w + X;
            if (m[j] !== null && p[j] > p[i] && !f[j]) { st = 3; return true; }
            return false;
          });
        }
        rgb = ramp(c)[st];
      }
      out.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
    }
    // glows and sparkles sit above the finished pixels without outlines
    this.fx.forEach(([x, y, c, a]) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4, rgb = hx(c), al = out[i + 3] ? a : a; out.set([rgb[0] * al + out[i] * (1 - al), rgb[1] * al + out[i + 1] * (1 - al), rgb[2] * al + out[i + 2] * (1 - al), Math.max(out[i + 3], Math.round(255 * al))], i); });
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d").putImageData(new ImageData(out, w, h), 0, 0);
    return cv;
  };
  B.glow = function (cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d < 1) this.fx.push([x, y, c, d < 0.45 ? 0.55 : d < 0.75 ? 0.3 : 0.14]);
    }
  };

  // ---------- face stamps (near eye 5 wide, far eye 3 wide, 5 tall) ----------
  // chibi eyes: big iris blocks with a heavy top lash, two catchlights and a lighter bottom
  const EYE = {
    round: [["KKKKKK", "DHHDD", "DHDDD", "DDDID", "IiiII", ".iii."], ["KKK", "HDD", "DDD", "DDI", "iiI", ".i."]],
    sparkle: [["KKKKKK", "DHHDD", "DHDDD", "DDHID", "IiiHI", ".iii."], ["KKK", "HDD", "DDD", "DHI", "iiI", ".i."]],
    sharp: [["...KKK", "KKKKK", "DHHDD", "DDDID", "IiiII", "....."], ["..K", "KKK", "HDD", "DDI", "iiI", "..."]],
    sleepy: [["......", "KKKKKK", "DDDDD", "DHDID", "IiiII", ".iii."], ["...", "KKK", "DDD", "HDI", "iiI", ".i."]],
    blink: [[".....", ".....", ".KKK.", "K...K", "....."], ["...", "...", ".K.", "K.K", "..."]],
  };
  const MOUTH = { smile: ["K.K", ".K."], grin: ["KKK", "KMK", ".K."], flat: ["KK"], cat: ["K.K.K", ".K.K."], tongue: ["KKK", ".T."] };

  function hatCoversHair(h) { return ["helm", "viking", "pot", "frog", "hood"].includes(h) || !!(PARTS.hat[h] && PARTS.hat[h].covers); }

  // the vector head art lives in a 12.5 radius space; reuse those shapes at pixel scale
  function head(b, c, R, hxC, hyC, layer) {
    const r = R.head, k = r / 12.5, P = (d, col, o, rot) => b.path(d, hxC, hyC, k, col, o, rot);
    const skin = c.skin, hcol = c.hairColor, metal = c.metal, d1 = c.dye1, d2 = c.dye2;
    const T = headTf(hxC, hyC, k), F = featureOf(c), HP = PARTS.hair[c.hair], HT = PARTS.hat[c.hat];
    if (layer === "back") {
      if (F && F.back) drawLayers(b, F.back, c, T, k, k);
      if (HT && HT.back) drawLayers(b, HT.back, c, T, k, k);
      if (HP && HP.back && !hatCoversHair(c.hat)) drawLayers(b, HP.back, c, T, k, k);
      if (c.hat === "hood") P("M-15 -1 Q-16 -17 0 -17 Q16 -17 15 0 Q16 12 10 16 L2 15 Q8 6 6 -2 Z", mix(d2, "#2b2347", 0.15));
      if (!hatCoversHair(c.hat)) {
        if (c.hair === "long") P("M-11 -7 Q-16 12 -10 22 L9 22 Q15 9 12 -7 Z", hcol);
        if (c.hair === "ponytail") P("M8 -9 Q21 -6 20 10 Q18 20 12 17 Q16 4 6 -1 Z", hcol);
        if (c.hair === "bob") P("M-13 -4 Q-15 11 -9 12 L10 12 Q15 10 13 -4 Z", hcol);
        if (c.hair === "buns") { b.ellipse(hxC + 2 * k, hyC - 14 * k, 4.6 * k, 4.2 * k, hcol); b.next(); b.ellipse(hxC + 10 * k, hyC - 9.5 * k, 4 * k, 3.8 * k, hcol); }
      }
      return;
    }
    // ears behind the face (a race feature may draw its own instead)
    const repl = (F && F.replaces) || [];
    if (repl.includes("ears")) {}
    else if (R.ear === "elf") P("M3 -1 L18 -10 L10 6 Z", skin);
    else if (R.ear === "orc") P("M3 -1 L14 -4 L10 6 Z", skin);
    else if (R.ear === "fin") P("M3 -2 L15 -7 L12 -1 L16 2 L9 6 Z", mix(skin, "#2b2347", 0.12));
    b.next();
    // face: round anime oval with a small chin toward the front
    const rr = (x0, y0, x1, y1, r) => `M${x0} ${y0 + r} Q${x0} ${y0} ${x0 + r} ${y0} L${x1 - r} ${y0} Q${x1} ${y0} ${x1} ${y0 + r} L${x1} ${y1 - r} Q${x1} ${y1} ${x1 - r} ${y1} L${x0 + r} ${y1} Q${x0} ${y1} ${x0} ${y1 - r} Z`;
    const jaw = rr(-13, -12.8, 13, 12.4, 7.2);
    P(jaw, skin);
    const face = b.part;
    if (R.ear !== "elf" && R.ear !== "orc" && R.ear !== "fin" && R.ear !== "cat") { b.next(); b.ellipse(hxC + 5.5 * k, hyC + 3 * k, 2 * k, 2.8 * k, skin); }
    // eyes, low on the face like the reference sheet
    const ex = Math.round(hxC - 5 * k), ey = Math.round(hyC + 0.4 * k), fx = Math.round(hxC - 11 * k);
    const ec = c.eyeColor, set = c._blink ? EYE.blink : EYE[c.eyes] || EYE.round;
    const L = { K: "#2a1418", D: mix(ec, "#1a0e20", 0.55), I: ec, i: mix(ec, "#ffffff", 0.35), H: "#ffffff", S: "#fbf6f0", M: "#9a2a3a", T: "#f07a8a", W: "#ffffff" };
    b.stamp(set[0], ex, ey, L, { part: face });
    b.stamp(set[1], fx, ey, L, { part: face });
    // blush and mouth
    [[ex + 1, "#f7a2a2"], [ex + 2, "#f28c92"], [ex + 3, "#f7a2a2"], [fx, "#f28c92"], [fx + 1, "#f7a2a2"]].forEach(([x, col]) => b.set(x, ey + 6, col, { flat: true, part: face }));
    const mx = Math.round(hxC - 8.2 * k), my = ey + 7;
    // facial hair, drawn before the mouth so the mouth always shows.
    // Sideburns start in front of the ear, the beard follows the jaw and hangs below the chin,
    // and the moustache sits on the upper lip. Unit space, facing left.
    const MOUSTACHE = "M-13.6 8.2 Q-13.2 5.4 -10.8 5.8 Q-8.8 6.2 -7.8 7.2 Q-6.6 5.8 -4.4 6 Q-2.8 6.4 -2.8 7.8 Q-5 7.4 -7.2 8.6 Q-10 9.8 -12.6 9.4 Q-13.4 9.2 -13.6 8.2 Z";
    const FULL = "M0.2 4 L2.6 4 Q3.4 7 2.8 10.6 Q0.8 17 -5 18 Q-12.2 17.6 -14 11.2 L-14 7.8 Q-11.8 10.8 -9 11 Q-6.4 11.2 -4.4 9.8 Q-2.2 8.8 -1.2 6.4 Q-0.4 5 0.2 4 Z";
    if (c.beard === "stubble") {
      const x0 = mx - 3, x1 = Math.round(hxC + 2.6 * k), y0 = my - 2, y1 = Math.round(hyC + 12.4 * k);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (b.partAt(x, y) !== face || b.f[y * b.w + x]) continue;
        // a soft shadow over the jaw and lip, with a light dither on top
        const lip = y <= my - 1 && x <= mx + 3;
        if (!lip && y < my) continue;
        b.set(x, y, mix(skin, hcol, (x + y) % 2 ? 0.16 : 0.32), { flat: true, part: face });
      }
    }
    if (c.beard === "full" || c.beard === "braided") {
      b.next(); P(FULL, hcol);
      const bp = b.part;
      // a few darker strands so the beard reads as hair, not a patch
      [[-10, 13, -9, 16], [-6, 12.6, -5.4, 16.4], [-1.6, 11, -1.4, 14.6]].forEach(([a, b1, c1, d]) => {
        b.line(hxC + a * k, hyC + b1 * k, hxC + c1 * k, hyC + d * k, mix(hcol, "#2b2347", 0.35), { flat: true, part: bp, on: bp });
      });
      if (c.beard === "braided") {
        [17.4, 20.6, 23.8].forEach((y, i) => { b.next(); b.ellipse(hxC - 5.6 * k, hyC + y * k, (2.6 - i * 0.3) * k, 1.9 * k, i % 2 ? mix(hcol, "#2b2347", 0.15) : hcol); });
        b.next(); P("M-7.8 19 L-3.4 19 L-3.6 20.4 L-7.6 20.4 Z", metal);
        b.next(); P("M-7.4 25.4 L-3.8 25.4 L-5.6 28 Z", hcol);
      }
    }
    if (c.beard === "moustache" || c.beard === "full" || c.beard === "braided") { b.next(); P(MOUSTACHE, c.beard === "moustache" ? hcol : mix(hcol, "#fff3cf", 0.12)); }
    b.stamp(MOUTH[c.mouth] || MOUTH.smile, mx, my, L, { part: face });
    if (R.tusks) { b.set(mx - 1, my - 1, "#f4ecd8", { flat: true, part: face }); b.set(mx + 3, my - 1, "#f4ecd8", { flat: true, part: face }); }
    if (c.race === "felkin") { b.set(fx - 1, ey + 5, "#e88aa0", { flat: true, part: face }); }
    if (F && F.layers) drawLayers(b, F.layers, c, T, k, k, face);
    // hair front: cap with pointed fringe locks and a ring of shine
    if (!hatCoversHair(c.hat) && c.hair !== "bald") {
      b.next();
      const hp = b.part;
      if (HP) {
        drawLayers(b, HP.front || HP.layers, c, T, k, k, face);
        const hp2 = b.part;
        if (HP.shine) for (let a = 200; a <= 300; a += 7) {
          if (Math.floor(a / 7) % 3 === 2) continue;
          const t = (a * Math.PI) / 180, x = Math.round(hxC + Math.cos(t) * r * 0.72), y = Math.round(hyC - 2 * k + Math.sin(t) * r * 0.7);
          b.set(x, y, hcol, { on: hp2, step: 0, part: hp2 });
        }
      } else if (c.hair === "mohawk") {
        P("M-7 -10 L-9.5 -19 L-4 -16 L-1.5 -23 L2.5 -16.5 L7 -21.5 L9.5 -14 L12 -9 Q2 -14 -7 -10 Z", hcol);
      } else {
        const fringe = "M-14.2 3 L-14.2 -6.8 Q-14.2 -15 -6 -15 L6 -15 Q14.2 -15 14.2 -6.8 L14.2 -1 Q14 5 10.6 8.6 L9.2 -3.4 L6.6 -1.4 L5.4 -6 L2 -2.6 L-0.6 -7.4 L-3.8 -2 L-6.4 -6.6 L-9.2 -1.6 L-10.8 -5.4 L-13.6 -1 Z";
        if (c.hair === "spiky") P("M-14 2 L-17 -8 L-11.5 -7.8 L-13 -16 L-6 -12 L-3 -19.5 L1 -13.6 L7.4 -18.4 L8.4 -11.4 L15.6 -12.4 L12.6 -5 L16 0.6 L10.4 4.4 L9 -3.6 L6.4 -1.6 L5 -6 L1.6 -2.6 L-1 -7 L-4 -2 L-6.6 -6.4 L-9.4 -1.6 L-10.8 -5.6 L-13.6 -1 Z", hcol);
        else P(fringe, hcol);
        // shine: a broken arc of highlight across the crown
        for (let a = 200; a <= 300; a += 7) {
          if (Math.floor(a / 7) % 3 === 2) continue;
          const t = (a * Math.PI) / 180, x = Math.round(hxC + Math.cos(t) * r * 0.72), y = Math.round(hyC - 2 * k + Math.sin(t) * r * 0.7);
          b.set(x, y, hcol, { on: hp, step: 0, part: hp });
        }
        // a few strand lines into the locks
        [[-6.4, -10, -5.4, -6], [1.6, -11, 1, -3], [7, -10, 7.4, -4]].forEach(([a1, b1, a2, b2]) => b.line(hxC + a1 * k, hyC + b1 * k, hxC + a2 * k, hyC + b2 * k, hcol, { on: hp, step: 2, part: hp }));
      }
      // brows peek over the fringe
      const bc = mix(hcol, "#1a0e14", 0.35), heavy = c.race === "dwarf" || c.race === "orc";
      if (heavy) { b.rect(ex, ey - 2, 4, 1, bc, { flat: true }); b.rect(fx, ey - 2, 3, 1, bc, { flat: true }); }
    }
    // cat ears and accessories
    if (R.ear === "cat" && !hatCoversHair(c.hat) && !repl.includes("ears")) {
      b.next(); P("M-9 -8 L-7 -21 L0 -12 Z", skin); b.next(); P("M2 -12 L8 -22 L11 -8 Z", skin);
      b.set(hxC - 6 * k, hyC - 15 * k, "#f2a6b4", { flat: true, part: b.part - 1 }); b.set(hxC + 7 * k, hyC - 15 * k, "#f2a6b4", { flat: true });
    }
    const A = (col) => ({ flat: true, part: b.part });
    if (c.acc === "glasses") { b.next(); const q = A(); for (let i = -1; i <= 4; i++) { b.set(ex + i, ey - 1, "#3a2a30", q); b.set(ex + i, ey + 5, "#3a2a30", q); } for (let j = 0; j <= 4; j++) { b.set(ex - 1, ey + j, "#3a2a30", q); b.set(ex + 4, ey + j, "#3a2a30", q); } }
    if (c.acc === "eyepatch") { b.next(); b.rect(ex, ey, 4, 5, "#2a2230"); b.line(ex - 2, ey - 3, ex + 10, ey - 5, "#2a2230", { flat: true }); }
    if (c.acc === "bandage") { b.next(); b.rect(ex + 1, ey + 6, 3, 2, "#f2e2c4"); }
    if (c.acc === "monocle") { b.next(); const q = A(); for (let i = -1; i <= 4; i++) { b.set(ex + i, ey - 1, "#e0b04a", q); b.set(ex + i, ey + 5, "#e0b04a", q); } for (let j = 0; j <= 4; j++) { b.set(ex - 1, ey + j, "#e0b04a", q); b.set(ex + 4, ey + j, "#e0b04a", q); } b.line(ex + 4, ey + 6, ex + 7, ey + 11, "#e0b04a", q); }
    // hats
    b.next();
    switch (c.hat) {
      case "helm": P("M-14.4 1.6 Q-15 -16 0 -16.6 Q15 -16 14.4 1.6 L10 1.6 L9 -4 L-9.5 -4 L-10.5 1.6 Z", metal); b.next(); P("M-2 -16 Q2 -25 11 -23 Q6 -19.6 4 -15.4 Z", d1); b.next(); P("M-12 -4.6 L-9.6 -4.6 L-9.6 4 L-12 4 Z", metal); break;
      case "viking": P("M-14.4 0 Q-15 -16.4 0 -17 Q15 -16.4 14.4 0 Q0 -4 -14.4 0 Z", metal); b.next(); P("M-14 -2 Q0 -6.4 14 -2 L14 1.4 Q0 -3 -14 1.4 Z", "#d4a94a"); b.next(); P("M-10 -10 Q-21 -12 -20 -26 Q-16 -17 -7 -15 Z", "#f2e8d0"); b.next(); P("M9 -11 Q20 -14 19 -27 Q15 -18 6 -15.4 Z", "#f2e8d0"); break;
      case "wizard": P("M-17 -6 Q1 -12 19 -6 Q20 -3 1 -4 Q-18 -3 -17 -6 Z", d1); b.next(); P("M-10 -8 Q-3 -32 17 -30 Q7 -23 11 -8 Z", d1); b.next(); P("M-9.6 -11 Q1 -14 11 -11.6 L11 -8.6 Q1 -11 -9.8 -8.4 Z", d2); b.set(hxC + 3 * k, hyC - 20 * k, "#ffe27a", { flat: true }); b.set(hxC + 4 * k, hyC - 20 * k, "#ffe27a", { flat: true }); break;
      case "pot": P("M-13.4 -6 L13.4 -6 L12.4 -20 Q0 -22 -12.4 -20 Z", "#5d6470"); b.next(); P("M12 -17 L22 -18 L22 -14.6 L12 -13.4 Z", "#3a3434"); break;
      case "frog": P("M-15.4 2 Q-16.4 -16.4 0 -16.4 Q16.4 -16.4 15.4 2 Q14 8 10 10 L8 2 Q0 -4 -10 -1 L-13 6 Z", "#6cbf4a"); b.next(); b.ellipse(hxC - 6 * k, hyC - 15.6 * k, 4.6 * k, 4.2 * k, "#6cbf4a"); b.next(); b.ellipse(hxC + 5 * k, hyC - 16.4 * k, 4.6 * k, 4.2 * k, "#6cbf4a");
        b.stamp(["HK", "HH"], Math.round(hxC - 7.4 * k), Math.round(hyC - 17 * k), { H: "#ffffff", K: "#1a1020" }); b.stamp(["HK", "HH"], Math.round(hxC + 3.6 * k), Math.round(hyC - 18 * k), { H: "#ffffff", K: "#1a1020" }); break;
      case "crown": P("M-7.4 -11 L-8.4 -20 L-4 -15.4 L-1 -22 L2 -15.4 L6.4 -20 L5.4 -11 Q-1 -12.8 -7.4 -11 Z", "#f0c23a"); b.set(hxC - 1 * k, hyC - 14.4 * k, "#e04a6a", { flat: true }); break;
      case "bandana": P("M-14 -3.6 Q0 -10.6 14 -5 L14.2 -0.4 Q0 -6 -14 0.6 Z", d1); b.next(); P("M13 -4 L20 -7 L19 -1 L22 1.4 L14 1.4 Z", d1); break;
      case "hood": P("M-15.6 2 Q-16.6 -17.6 0 -17.6 Q16.6 -17.6 15.6 0 L9.4 4 Q9.4 -8.4 -2 -9.4 Q-11.4 -9.4 -12.4 2 Z", d2); break;
      default: if (HT) drawLayers(b, HT.layers || HT.front, c, T, k, k);
    }
    if (F && F.over) drawLayers(b, F.over, c, T, k, k);
    if (R.horns && !repl.includes("horns")) { b.next(); P("M2 -9 Q8 -21 19 -21 Q11 -17.6 7 -8 Z", "#eadfc4"); b.next(); P("M-5 -10 Q-4 -20 4 -23 Q0 -16.4 0 -10 Z", "#eadfc4"); }
  }

  const gripOf = (w) => (PARTS.weapon[w] && PARTS.weapon[w].grip) || w;
  // ---------- weapons (vector shapes from the side-view prototype, in hand space) ----------
  function weapon(b, c, x, y, k, rot) {
    const m = c.metal, d1 = c.dye1, wood = "#8a5a34", steel = "#dfe6ec";
    const W = (d, col) => { b.next(); b.path(d, x, y, k, col, null, rot); };
    const at = (px, py) => { const a = (rot * Math.PI) / 180; return [x + (px * Math.cos(a) - py * Math.sin(a)) * k, y + (px * Math.sin(a) + py * Math.cos(a)) * k]; };
    switch (c.weapon) {
      case "sword": W("M-2 -3 L-2 -21 L0 -25 L2 -21 L2 -3 Z", steel); W("M-5.4 -5 L5.4 -5 L5 -2 L-5 -2 Z", m); W("M-1.4 -2 L1.4 -2 L1.4 4 L-1.4 4 Z", "#5a3a24"); break;
      case "axe": W("M-1.3 7 L-1.3 -19 L1.3 -19 L1.3 7 Z", wood); W("M-1 -18 Q-12 -22 -12 -12 Q-12 -5 -1 -8 Z", "#d6dde4"); break;
      case "hammer": W("M-1.3 7 L-1.3 -14 L1.3 -14 L1.3 7 Z", wood); W("M-7 -22 L7 -22 L7 -13 L-7 -13 Z", "#9aa3ad"); W("M-7 -19 L7 -19 L7 -16.6 L-7 -16.6 Z", m); break;
      case "spear": W("M-1.1 12 L-1.1 -27 L1.1 -27 L1.1 12 Z", wood); W("M0 -37 L3.2 -28 L0 -25 L-3.2 -28 Z", steel); W("M-2 -26 L2 -26 L1.6 -23.4 L-1.6 -23.4 Z", d1); break;
      case "staff": { W("M-1.3 13 L-1.4 -24 L1.4 -24 L1.3 13 Z", wood); W("M-1 -24 Q-7 -26 -6 -33 Q-2 -28.6 0 -28.6 Q2 -28.6 6 -33 Q7 -26 1 -24 Z", wood); b.next(); const [gx, gy] = at(0, -30); b.ellipse(gx, gy, 3.4 * k, 3.6 * k, mix(d1, "#ffffff", 0.45)); b.glow(gx, gy, 6 * k, "#fff6c0"); break; }
      case "wand": { W("M-1 3 L-1 -12 L1 -12 L1 3 Z", "#3b2a40"); W("M0 -19 L1.6 -15.6 L5 -15.2 L2.4 -13 L3.2 -9.6 L0 -11.4 L-3.2 -9.6 L-2.4 -13 L-5 -15.2 L-1.6 -15.6 Z", "#ffe27a"); const [gx, gy] = at(0, -15); b.glow(gx, gy, 7 * k, "#fff6c0"); break; }
      case "bow": W("M0 -18 Q-10 -9 -7.4 0 Q-10 9 0 18 L1.6 16.6 Q-6 9 -4.8 0 Q-6 -9 1.6 -16.6 Z", wood); { const [ax, ay] = at(0.8, -16.6), [bx, by] = at(0.8, 16.6); b.next(); b.line(ax, ay, bx, by, "#efe8d8", { flat: true }); } break;
      case "daggers": W("M-1.6 -2 L-1.6 -12 L0 -16 L1.6 -12 L1.6 -2 Z", steel); W("M-3.6 -3 L3.6 -3 L3.6 -0.8 L-3.6 -0.8 Z", m); break;
      case "pan": W("M-1.1 6 L-1.1 -8 L1.1 -8 L1.1 6 Z", "#3d2a1e"); b.next(); { const [px, py] = at(0, -15); b.ellipse(px, py, 7.4 * k, 7.4 * k, "#4a4a54"); } break;
      case "fish": W("M0 -23 Q6 -15 3.6 -6 Q2.4 -2 0 0 Q-2.4 -2 -3.6 -6 Q-6 -15 0 -23 Z", "#7fb6d8"); W("M0 0 L4 5 L-4 5 Z", "#5a96bc"); { const [ex, ey] = at(-1.4, -18); b.set(ex, ey, "#1a1020", { flat: true }); } break;
      default: if (PARTS.weapon[c.weapon]) drawLayers(b, PARTS.weapon[c.weapon].layers, c, handTf(x, y, k, rot), k, k);
    }
  }
  function offhand(b, c, x, y, k) {
    const m = c.metal, d1 = c.dye1, d2 = c.dye2;
    const O = (d, col) => { b.next(); b.path(d, x, y, k, col); };
    switch (c.offhand) {
      case "shield": O("M-7 -10 L7 -10 L7 0 Q7 8 0 12.4 Q-7 8 -7 0 Z", m); O("M-4.6 -7.6 L4.6 -7.6 L4.6 0 Q4.6 5.6 0 8.8 Q-4.6 5.6 -4.6 0 Z", d1); O("M0 -5 L2.4 -1 L0 3.4 L-2.4 -1 Z", d2); break;
      case "buckler": b.next(); b.ellipse(x, y, 7 * k, 7 * k, m); b.next(); b.ellipse(x, y, 4.6 * k, 4.6 * k, d1); b.next(); b.ellipse(x, y, 1.6 * k, 1.6 * k, m); break;
      case "book": O("M-5 -6.4 L5 -6.4 L5 6.4 L-5 6.4 Z", mix(d1, "#2b2347", 0.2)); O("M-4.4 4 L5 4 L5 6 L-4.4 6 Z", "#f2ead8"); b.set(x, y - 1, "#f0c23a", { flat: true }); break;
      default: if (PARTS.offhand[c.offhand]) drawLayers(b, PARTS.offhand[c.offhand].layers, c, handTf(x, y, k, 0), k, k);
    }
  }

  // ---------- full character ----------
  const SW = 48, SH = 76, FY = 73, CX = 25;
  function sprite(c, poseName) {
    const R = RACES[c.race], p = pose(poseName, gripOf(c.weapon)), cc = { ...c, _blink: p.blink };
    const bw = c.build || 1, hf = c.height || 1;
    const L = Math.round(R.leg * hf), T = Math.round(R.torso * hf), tw = R.tw * bw, lw = Math.max(2, R.limb * bw), A = R.arm * hf;
    const hip = FY - 2 - L, tt = hip - T + p.dy;
    // Each worn layer may carry its own colours (look.tint[layer] = [cloth, trim, metal]); otherwise the hero's own.
    const tn = c.tint || {}, tc = (layer) => (tn[layer] ? { dye1: tn[layer][0], dye2: tn[layer][1], metal: tn[layer][2] } : { dye1: c.dye1, dye2: c.dye2, metal: c.metal });
    const TOP = tc("top"), BOT = tc("bottom"), SHO = tc("shoes"), GLO = tc("gloves"), CAP = tc("cape");
    const skin = c.skin, d1 = TOP.dye1, d2 = TOP.dye2, metal = TOP.metal;
    const hxC = CX - 1, hyC = tt - R.head * 0.84, k = R.head / 12.5;
    const gk = 0.6 * Math.sqrt(A / 8); // gear scale follows arm length
    const TD = PARTS.top[c.top], top = TD ? TD.base : c.top, robe = top === "robe";
    const leather = mix(d1, "#6e4a31", 0.55);
    const sleeve = TD && TD.sleeve ? colour(TD.sleeve, { ...c, ...TOP }) : top === "plate" ? metal : top === "leather" ? skin : d1;
    const handC = c.gloves === "gauntlets" ? GLO.metal : c.gloves === "leather" ? "#6e4a31" : skin;
    const SF = [CX - tw * 0.4, tt + 2], SB = [CX + tw * 0.5, tt + 2];
    const hand = (s0, a) => [s0[0] - A * Math.sin((a * Math.PI) / 180), s0[1] + A * Math.cos((a * Math.PI) / 180)];
    const HF = hand(SF, p.aF), HB = hand(SB, p.aB);
    const b = new Buf(SW, SH);

    // cape, tail and hair behind the body
    if (c.cape === "cape") b.next().poly([[CX - tw * 0.3, tt + 1], [CX + tw * 0.9, tt + 1], [CX + tw + 6, hip + L * 0.5], [CX + tw + 7, FY - 3], [CX + 1, FY - 4]], mix(CAP.dye2, "#2b2347", 0.08));
    if (c.cape === "scarf") b.next().poly([[CX + 1, tt - 1], [CX + tw + 8, tt + 2], [CX + tw + 11, tt + 8], [CX + tw + 9, tt + 10], [CX + tw + 4, tt + 5], [CX, tt + 3]], CAP.dye2);
    if (R.tail === "cat") { b.next().cap(CX + tw * 0.7, hip - 2, CX + tw + 4, hip - 8, lw * 0.8, skin); b.cap(CX + tw + 4, hip - 8, CX + tw + 6, hip - 13, lw * 0.8, skin); }
    if (R.tail === "dragon") b.next().poly([[CX + tw * 0.5, hip - 4], [CX + tw + 6, hip], [CX + tw + 11, FY - 1], [CX + tw + 4, hip + 4], [CX + tw * 0.4, hip + 2]], skin);
    const hc = { ...cc, ...tc("hat") };
    b.next(); head(b, hc, R, hxC, hyC, "back");
    // back arm and offhand-free hand
    b.next().cap(SB[0], SB[1], HB[0], HB[1], lw * (robe ? 1.3 : 1), mix(sleeve, "#2b2347", 0.12));
    b.next().ellipse(HB[0], HB[1], lw * 0.62, lw * 0.62, mix(handC, "#2b2347", 0.12));
    // legs and shoes
    const legC = c.bottom === "greaves" ? BOT.metal : c.bottom === "shorts" || c.bottom === "kilt" ? skin : mix(BOT.dye2, "#2b2347", 0.25);
    const sc = c.shoes === "sabatons" ? SHO.metal : c.shoes === "sandals" ? "#a87a4a" : c.shoes === "curly" ? SHO.dye1 : "#5a3a24";
    [[CX + tw * 0.4, p.bdx, true], [CX - tw * 0.4, p.fdx, false]].forEach(([x, dx, back]) => {
      const sh = (col) => (back ? mix(col, "#2b2347", 0.14) : col);
      if (!robe) b.next().cap(x, hip, x + dx, FY - 2, lw * 1.1, sh(legC));
      if (c.bottom === "shorts" && !robe) b.next().cap(x, hip, x + dx * 0.4, hip + Math.max(2, L * 0.45), lw * 1.3, sh(mix(BOT.dye2, "#2b2347", 0.2)));
      const sx = Math.round(x + dx), sw = Math.max(2, Math.round(lw * 0.7));
      b.next();
      if (c.shoes === "curly") { b.rect(sx - sw - 1, FY - 2, sw * 2 + 1, 3, sh(sc)); b.set(sx - sw - 2, FY - 1, sh(sc)); b.set(sx - sw - 3, FY - 2, sh(sc)); b.set(sx - sw - 3, FY - 3, sh(sc)); }
      else { b.rect(sx - sw - 1, FY - 1, sw * 2 + 2, 2, sh(sc)); b.rect(sx - sw, FY - 3, sw * 2, 2, sh(sc)); }
      if (c.shoes === "sandals") b.set(sx - 1, FY - 2, "#5a3a24", { flat: true });
    });
    if (c.bottom === "kilt" && !robe) b.next().poly([[CX - tw * 0.95, hip - 1], [CX + tw * 0.95, hip - 1], [CX + tw * 1.1, hip + Math.max(3, L * 0.55)], [CX - tw * 1.1, hip + Math.max(3, L * 0.55)]], BOT.dye2);
    // torso
    b.next();
    const torsoBase = (bot) => [[CX - tw, tt + 1], [CX - tw + 1, tt], [CX + tw - 1, tt], [CX + tw, tt + 1], [CX + tw * 0.92, bot], [CX - tw * 0.92, bot]];
    if (robe) {
      // fitted at the waist, flaring to a scalloped hem, with folds, a hem band and a tied sash
      const hw = tw + L * 0.4 + 1, mid = hip + (FY - hip) * 0.5, n = Math.max(4, Math.round(hw / 1.5) * 2);
      const hem = (dy) => Array.from({ length: n + 1 }, (_, k) => [CX + hw - (2 * hw * k) / n, FY - (k % 2 ? 1 : 0) + dy]);
      b.poly([[CX - tw, tt + 1], [CX - tw + 1, tt], [CX + tw - 1, tt], [CX + tw, tt + 1], [CX + tw * 0.9, hip - 2], [CX + tw + (hw - tw) * 0.45, mid], ...hem(0), [CX - tw - (hw - tw) * 0.45, mid], [CX - tw * 0.9, hip - 2]], d1);
      const fold = mix(d1, "#2b2347", 0.35);
      [-0.55, 0.55].forEach((k) => b.line(CX + tw * 0.4 * Math.sign(k), hip + 1, CX + hw * k, FY - 2, fold, { flat: true }));
      b.next().poly([...hem(0), ...hem(-2).reverse()], d2);
      b.next().poly([[CX - 2, tt], [CX + 2, tt], [CX, tt + Math.max(2, T * 0.35)]], d2);
      b.next().rect(CX - tw, hip - 2, tw * 2, 2, d2);
      b.next().rect(CX + 1, hip, 1, Math.max(2, L * 0.3), d2);
    } else if (top === "plate") {
      b.poly(torsoBase(hip + 1), metal);
      b.next().poly([[CX - tw * 0.55, tt + 2], [CX + tw * 0.45, tt + 2], [CX + tw * 0.4, hip], [CX - tw * 0.05, hip + 2], [CX - tw * 0.5, hip]], d1);
      b.next().rect(CX - tw, hip - 2, tw * 2, 2, "#5a3a24");
    } else if (top === "leather") {
      b.poly(torsoBase(hip + 1), leather);
      b.next().poly([[CX - tw, tt + 1], [CX - tw * 0.1, tt + 1], [CX - tw * 0.4, tt + T * 0.65]], d1);
      b.next().line(CX - tw, tt + 2, CX + tw * 0.8, hip - 2, "#3d2a1e", { flat: true });
      b.next().rect(CX - tw, hip - 2, tw * 2, 2, "#3d2a1e"); b.set(CX, hip - 2, metal, { flat: true }); b.set(CX, hip - 1, metal, { flat: true });
    } else if (top === "sweater") {
      b.poly(torsoBase(hip + 1), d1);
      const sp = b.part; for (let y = tt + 3; y < hip; y += 3) for (let x = CX - tw; x <= CX + tw; x++) b.set(x, y, d2, { on: sp, part: sp, step: 1 });
    } else {
      b.poly(torsoBase(hip + Math.max(2, L * 0.35)), d1);
      b.next().rect(CX - tw, hip - 2, tw * 2, 2, d2);
      b.next().poly([[CX - 2, tt], [CX, tt + 3], [CX + 2, tt]], d2);
    }
    if (TD && TD.layers) drawLayers(b, TD.layers, { ...c, ...TOP }, (u, v) => [CX + u * tw, tt + v * (hip - tt)], tw, hip - tt);
    // offhand, head, weapon, then the front arm over the grip
    offhand(b, { ...c, ...tc("offhand") }, HB[0] - 1, HB[1] - 1, gk * 1.05);
    b.next(); head(b, hc, R, hxC, hyC, "front");
    weapon(b, { ...c, ...tc("weapon") }, HF[0], HF[1], gk, p.wA);
    b.next().cap(SF[0], SF[1], HF[0], HF[1], lw * (robe ? 1.35 : 1), sleeve);
    if (top === "plate") b.next().ellipse(SF[0] + 1, SF[1] - 0.5, tw * 0.45 + 0.6, tw * 0.36 + 0.6, metal);
    b.next().ellipse(HF[0], HF[1], lw * 0.66, lw * 0.66, handC);
    return b.toCanvas();
  }

  // ---------- boss: ember golem facing right, 60 x 56, feet on row 53 ----------
  function golem(frame) {
    const b = new Buf(60, 56), s = 0.5, oy = 2, stone = "#8b8079", moss = "#6aa84a";
    const T = (x, y) => [x * s, (y + 4) * s];
    const fist = frame === "raise" ? [96, 6] : frame === "slam" ? [112, 96] : [98, 74];
    b.next().cap(...T(34, 40), ...T(22, 78), 13 * s, mix(stone, "#2b2347", 0.15)); b.next().ellipse(...T(21, 82), 9 * s, 8 * s, mix(stone, "#2b2347", 0.15));
    b.next().path("M44 84 L44 102 L56 102 L56 84 Z", 0, oy, s, mix(stone, "#2b2347", 0.1)); b.next().path("M68 84 L68 102 L80 102 L80 84 Z", 0, oy, s, stone);
    b.next().path("M24 46 Q20 18 50 14 Q84 12 88 40 Q92 70 76 86 L36 86 Q20 74 24 46 Z", 0, oy, s, stone);
    const body = b.part;
    b.next().path("M34 20 Q46 10 62 14 Q54 20 44 22 Q38 24 34 20 Z", 0, oy, s, moss);
    [[46, 38, 54, 50], [54, 50, 48, 62], [66, 40, 62, 54], [62, 54, 70, 66], [52, 72, 58, 80]].forEach(([a, c2, d, e]) => b.line(...T(a, c2), ...T(d, e), "#ffb340", { flat: true, part: body }));
    b.next().path("M64 8 Q66 -2 82 0 Q96 4 94 18 Q90 28 76 28 Q64 26 64 8 Z", 0, oy, s, stone);
    b.rect(42, 6, 3, 2, "#ffd040", { flat: true }); b.set(43, 6, "#fff4c0", { flat: true });
    b.next().cap(...T(76, 36), ...T(fist[0], fist[1]), 14 * s, stone); b.next().ellipse(...T(fist[0], fist[1]), 10 * s, 9 * s, stone);
    return b.toCanvas();
  }

  // ---------- loot icons, 16 x 16 ----------
  function icon(kind, col) {
    const b = new Buf(16, 16).next();
    if (kind === "helm") b.path("M2 12 Q2 2 8 2 Q14 2 14 12 L11 12 L11 8 L5 8 L5 12 Z", 0, 0, 1, col || "#b8c2cc");
    if (kind === "potion") { b.path("M6 3 L10 3 L10 6 Q14 8 13 11 Q12 15 8 15 Q4 15 3 11 Q2 8 6 6 Z", 0, 0, 1, "#e04a6a"); b.next().rect(6, 1, 4, 2, "#8a5a34"); }
    if (kind === "coin") { b.ellipse(8, 8, 6, 6, "#f0c23a"); b.next().rect(7, 5, 2, 6, "#c8961a"); }
    if (kind === "gem") b.path("M8 2 L14 7 L8 14 L2 7 Z", 0, 0, 1, col || "#7a4ac0");
    return b.toCanvas();
  }

  // ---------- helpers for the page ----------
  const toImage = (x) => Promise.resolve(x);
  async function frames(c) { const out = {}; POSES.forEach((n) => { out[n] = sprite(c, n); }); return out; }
  function randomHero(rand) {
    rand = rand || Math.random;
    const pick = (a) => a[Math.floor(rand() * a.length)], keys = (o) => Object.keys(o);
    const race = pick(keys(RACES)), R = RACES[race];
    const role = pick(["tank", "healer", "dps", "dps"]);
    // data parts join the built-in ones: weapons by how they are held, tops by the garment they are drawn over
    const byGrip = (grips) => [...grips, ...keys(PARTS.weapon).filter((id) => grips.includes(PARTS.weapon[id].grip))];
    const byBase = (bases) => [...bases, ...keys(PARTS.top).filter((id) => bases.includes(PARTS.top[id].base))];
    const shields = ["shield", "buckler", ...keys(PARTS.offhand)];
    const kit = {
      tank: { top: pick(byBase(["plate"])), bottom: "greaves", shoes: "sabatons", gloves: "gauntlets", weapon: pick(byGrip(["sword", "axe", "hammer", "pan"])), offhand: pick(shields) },
      healer: { top: pick(byBase(["robe"])), bottom: "pants", shoes: pick(["sandals", "curly", "boots"]), gloves: "none", weapon: pick(byGrip(["staff", "wand"])), offhand: pick(["book", "none", ...keys(PARTS.offhand)]) },
      dps: { top: pick(byBase(["leather", "tunic", "sweater"])), bottom: pick(["pants", "shorts", "kilt"]), shoes: pick(["boots", "curly"]), gloves: pick(["leather", "none"]), weapon: pick(byGrip(["bow", "daggers", "spear", "fish", "sword"])), offhand: "none" },
    }[role];
    const feats = keys(PARTS.feature).filter((id) => PARTS.feature[id].races.includes(race));
    return {
      race, role, build: pick([0.92, 1, 1.1]), height: pick([0.95, 1, 1.05]), skin: pick(R.skins),
      hair: pick(keys(OPTIONS.hair)), hairColor: pick(HAIRS), eyes: pick(keys(OPTIONS.eyes)), eyeColor: pick(EYES), mouth: pick(keys(OPTIONS.mouth)),
      beard: race === "dwarf" ? pick(["full", "braided"]) : rand() < 0.15 ? pick(["moustache", "stubble"]) : "none",
      acc: rand() < 0.25 ? pick(["glasses", "eyepatch", "bandage", "monocle"]) : "none",
      hat: rand() < 0.6 ? pick(keys(OPTIONS.hat)) : "none", cape: pick(["none", "none", "cape", "scarf"]),
      feature: feats.length && rand() < 0.6 ? pick(feats) : "none",
      dye1: pick(DYES), dye2: pick(DYES), metal: pick(METALS), ...kit,
    };
  }

  Object.assign(S, { RACES, OPTIONS, DYES, HAIRS, EYES, METALS, POSES, sprite, golem, icon, toImage, frames, randomHero, mix, SIZE: [SW, SH], FEET: FY });
  // Drawing helpers shared with art.js (item icons, monsters, scenery), so everything gets the same outline and shading.
  Object.assign(S, { Buf, ramp, weapon, offhand, PARTS, addArt, colour, drawLayers, pathPolys });
})();
