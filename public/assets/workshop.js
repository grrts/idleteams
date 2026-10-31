// Idle Teams art workshop: draw a hat, hair, race feature, top, weapon or off-hand for the pixel renderer, see it on
// every race and in every rarity colour, and copy it out as a content/<pack>/art/*.json entry (see content/README.md).
// Drafts stay in this browser. Nothing here touches the server.
(function () {
  const W = (window.ITW = {});
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KINDS = {
    hat: { name: 'Hat', groups: ['layers', 'back'], space: 'head', slot: 'head' },
    hair: { name: 'Hair', groups: ['front', 'back'], space: 'head' },
    feature: { name: 'Race feature', groups: ['layers', 'back', 'over'], space: 'head' },
    weapon: { name: 'Weapon', groups: ['layers'], space: 'hand', slot: 'weapon' },
    offhand: { name: 'Off-hand', groups: ['layers'], space: 'hand', slot: 'offhand' },
    top: { name: 'Top', groups: ['layers'], space: 'torso', slot: 'top' },
  };
  // part space shown on the grid: [x0, y0, x1, y1, grid step]
  const SPACE = { head: [-22, -30, 22, 22, 1], hand: [-16, -40, 16, 16, 1], torso: [-1.4, -0.25, 1.4, 1.25, 0.05] };
  const COLOURS = ['dye1', 'dye2', 'metal', 'steel', 'iron', 'gold', 'wood', 'darkwood', 'leather', 'bone', 'paper', 'gem', 'skin', 'hair', 'eye', 'dark', 'white'];
  const GRIPS = ['sword', 'axe', 'hammer', 'spear', 'staff', 'wand', 'bow', 'daggers', 'pan', 'fish'];
  const BASES = ['tunic', 'plate', 'leather', 'robe', 'sweater'];
  const RACES = ['human', 'elf', 'dwarf', 'orc', 'felkin', 'draka'];
  const KEY = 'it-workshop';

  const blank = (kind) => ({ kind, id: 'myPart', name: 'My part', grip: 'sword', base: 'tunic', sleeve: '', covers: false, shine: true, races: ['human'], replaces: [], group: KINDS[kind].groups[0], sel: 0, parts: { layers: [], back: [], front: [], over: [] } });
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = () => { try { const all = load(); all.cur = W.st; if (W.st.id) (all.drafts = all.drafts || {})[W.st.kind + ':' + W.st.id] = W.st; localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* private window */ } };
  W.st = load().cur || blank('weapon');

  const layers = () => (W.st.parts[W.st.group] = W.st.parts[W.st.group] || []);
  const cur = () => layers()[W.st.sel];
  const fmt = (n) => +(+n).toFixed(W.st.kind === 'top' ? 3 : 2);

  // A path drawn on the grid is a list of points; a path with curves is edited as text.
  const pointsOf = (L) => { if (!L) return null; if (L[0] === 'poly') return L[1]; if (L[0] !== 'path' || /[QCqcz]/.test(L[1].replace(/Z\s*$/, '')) || /[a-y]/.test(L[1])) return null; const n = (L[1].match(/-?\d*\.?\d+/g) || []).map(Number); const out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
  const setPoints = (L, pts) => { if (L[0] === 'poly') L[1] = pts; else L[1] = pts.length ? 'M' + pts.map(([x, y]) => fmt(x) + ' ' + fmt(y)).join(' L ') + ' Z' : ''; };

  /** The part as it goes into a JSON file. */
  function part() {
    const s = W.st, p = { name: s.name };
    if (s.kind === 'weapon') p.grip = s.grip;
    if (s.kind === 'top') { p.base = s.base; if (s.sleeve) p.sleeve = s.sleeve; }
    if (s.kind === 'hat' && s.covers) p.covers = true;
    if (s.kind === 'hair') p.shine = !!s.shine;
    if (s.kind === 'feature') { p.races = s.races; if (s.replaces.length) p.replaces = s.replaces; }
    KINDS[s.kind].groups.forEach((g) => { const L = (s.parts[g] || []).filter((x) => x[0] !== 'path' || x[1]); if (L.length) p[g] = L; });
    return p;
  }
  function problems() {
    const s = W.st, out = [];
    if (!/^[a-z][a-zA-Z0-9]{1,23}$/.test(s.id)) out.push('The id must be 2 to 24 letters or digits and start with a lower-case letter.');
    if (!s.name.trim()) out.push('Give it a name.');
    if (!KINDS[s.kind].groups.some((g) => (s.parts[g] || []).length)) out.push('Add at least one layer.');
    if (s.kind === 'feature' && !s.races.length) out.push('Pick at least one race.');
    return out;
  }
  const json = () => JSON.stringify({ parts: { [W.st.kind]: { [W.st.id]: part() } } }, null, 1).replace(/\[\n\s+([^[\]{}]*?)\n\s+\]/g, (m, a) => '[' + a.replace(/\n\s+/g, ' ') + ']');

  // ------------------------------------------------------------------ view

  W.view = function () {
    const s = W.st, K = KINDS[s.kind], L = cur(), pts = pointsOf(L);
    const opt = (list, v) => list.map((x) => { const [val, lab] = Array.isArray(x) ? x : [x, x]; return '<option value="' + esc(val) + '"' + (val === v ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('');
    const existing = Object.entries((window.ITP.PARTS || {})[s.kind] || {}).map(([id, p]) => [id, p.name]);
    const drafts = Object.entries(load().drafts || {}).map(([k, d]) => [k, d.name + ' (' + KINDS[d.kind].name.toLowerCase() + ')']);
    const kindExtra = {
      weapon: '<label>Grip <select id="wsGrip" data-wsf="grip">' + opt(GRIPS, s.grip) + '</select></label>',
      top: '<label>Drawn over <select id="wsBase" data-wsf="base">' + opt(BASES, s.base) + '</select></label><label>Sleeves <select id="wsSleeve" data-wsf="sleeve">' + opt([['', 'as the base'], ...COLOURS], s.sleeve) + '</select></label>',
      hat: '<label class="chk"><input type="checkbox" id="wsCovers" data-wsf="covers"' + (s.covers ? ' checked' : '') + '> Hides the hair</label>',
      hair: '<label class="chk"><input type="checkbox" id="wsShine" data-wsf="shine"' + (s.shine ? ' checked' : '') + '> Shine on the crown</label>',
      feature: '<div class="ws-races">' + RACES.map((r) => '<label class="chk"><input type="checkbox" data-wsrace="' + r + '"' + (s.races.includes(r) ? ' checked' : '') + '> ' + r + '</label>').join('') + '</div><div class="ws-races">' + ['ears', 'horns'].map((r) => '<label class="chk"><input type="checkbox" data-wsrepl="' + r + '"' + (s.replaces.includes(r) ? ' checked' : '') + '> replaces ' + r + '</label>').join('') + '</div>',
    }[s.kind] || '';
    const layerRow = (X, i) => {
      const col = X[0] === 'ellipse' || X[0] === 'line' ? X[5] : X[0] === 'glow' ? X[4] : X[0] === 'dot' ? X[3] : X[2];
      const sw = col && col[0] === '#' ? col : window.ITP.colour(col || 'dye1', sample(0));
      return '<li class="' + (i === s.sel ? 'on' : '') + '"><a href="#" data-ws="sel" data-i="' + i + '"><i class="sw" style="background:' + esc(sw) + '"></i>' + esc(X[0]) + ' · ' + esc(col || '') + '</a></li>';
    };
    const layerEdit = L ? (() => {
      const t = L[0], ci = t === 'ellipse' || t === 'line' ? 5 : t === 'glow' ? 4 : t === 'dot' ? 3 : 2, col = L[ci], oi = t === 'ellipse' || t === 'line' ? 6 : t === 'dot' ? 4 : 3, o = L[oi] || {};
      const named = col && col[0] !== '#' ? col.replace(/[:+].*$/, '') : '#', shade = col && /[:+]/.test(col) ? col.match(/([:+])([\d.]+)/) : null;
      return '<div class="ws-layer"><div class="row"><label>Colour <select id="wsCol" data-wsf="col">' + opt([...COLOURS, ['#', 'exact colour…']], named) + '</select></label>' +
        (named === '#' ? '<input id="wsHex" data-wsf="hex" type="color" value="' + esc(col && col[0] === '#' ? col : '#c0392b') + '">' : '<label>Shade <select id="wsShade" data-wsf="shade">' + opt([['', 'as is'], [':0.2', 'darker'], [':0.4', 'much darker'], ['+0.25', 'lighter'], ['+0.5', 'much lighter']], shade ? shade[1] + shade[2] : '') + '</select></label>') +
        (t === 'path' || t === 'poly' || t === 'ellipse' ? '<label class="chk"><input type="checkbox" data-wsf="onface" id="wsOnFace"' + (o.on === 'face' ? ' checked' : '') + '> Only on the face</label>' : '') + '</div>' +
        '<label for="wsRaw">Layer (JSON)</label><textarea id="wsRaw" data-wsf="raw" rows="3" spellcheck="false">' + esc(JSON.stringify(L)) + '</textarea>' +
        '<div class="row">' + (pts ? '<span class="small muted">Click the grid to add a point; drag a point to move it; right-click a point to remove it.</span><button class="small" data-ws="undo">Undo point</button>' : '<span class="small muted">' + (t === 'path' ? 'This path has curves: edit it in the JSON above.' : 'Click the grid to place it.') + '</span>') +
        '<button class="small" data-ws="up">Up</button><button class="small" data-ws="down">Down</button><button class="small" data-ws="dup">Copy</button><button class="small danger" data-ws="del">Delete</button></div></div>';
    })() : '<p class="muted small">Add a layer to start drawing.</p>';
    const errs = problems();
    return '<div class="ws">' +
      '<p class="muted small">Draw a part for the pixel renderer and copy it into a file in <code>content/&lt;pack&gt;/art/</code>. Drafts stay in this browser.</p>' +
      '<div class="ws-top row"><label>Kind <select id="wsKind" data-wsf="kind">' + opt(Object.entries(KINDS).map(([k, v]) => [k, v.name]), s.kind) + '</select></label>' +
      '<label>Id <input id="wsId" data-wsf="id" value="' + esc(s.id) + '" size="12"></label><label>Name <input id="wsName" data-wsf="name" value="' + esc(s.name) + '" size="16"></label>' + kindExtra + '</div>' +
      '<div class="ws-top row"><label>Start from <select id="wsFrom" data-wsf="from"><option value="">…</option><optgroup label="In the game">' + opt(existing.map(([id, n]) => ['part:' + id, n]), '') + '</optgroup><optgroup label="Your drafts">' + opt(drafts.map(([k, n]) => ['draft:' + k, n]), '') + '</optgroup></select></label><button class="small" data-ws="new">New</button></div>' +
      '<div class="ws-main"><div class="ws-left"><canvas id="wsGrid" width="360" height="400"></canvas><div class="ws-groups">' + K.groups.map((g) => '<button class="small' + (g === s.group ? ' on' : '') + '" data-ws="group" data-g="' + g + '">' + ({ layers: 'Main', back: 'Behind the head', front: 'Front', over: 'Over hats' }[g] || g) + ' (' + (s.parts[g] || []).length + ')</button>').join('') + '</div></div>' +
      '<div class="ws-mid"><div class="row">' + ['path', 'ellipse', 'line', 'dot', 'glow'].concat(s.kind === 'top' ? ['poly'] : []).map((t) => '<button class="small" data-ws="add" data-t="' + t + '">+ ' + t + '</button>').join('') + '</div><ol class="ws-layers">' + layers().map(layerRow).join('') + '</ol>' + layerEdit + '</div>' +
      '<div class="ws-right"><div class="ws-prev" id="wsPrev"></div><div class="ws-icons" id="wsIcons"></div></div></div>' +
      '<h3>JSON</h3>' + (errs.length ? '<p class="small warn">' + errs.map(esc).join('<br>') + '</p>' : '') + '<textarea id="wsOut" rows="6" readonly spellcheck="false">' + esc(json()) + '</textarea><div class="row"><button data-ws="copy"' + (errs.length ? ' disabled' : '') + '>Copy JSON</button><button class="small" data-ws="save">Save draft</button></div></div>';
  };

  // colour sets for the preview: the hero's own, then a rare and an epic palette
  function sample(n) {
    return [{ dye1: '#2f6fd0', dye2: '#f1c40f', metal: '#b8c2cc', skin: '#eac0a2', hairColor: '#8a5a2b', eyeColor: '#2f7ae0' }, { dye1: '#2e8a7a', dye2: '#f1e6c8', metal: '#c8d2da', skin: '#d9a37f', hairColor: '#2a2220', eyeColor: '#3f9a4a' }, { dye1: '#6b3fa8', dye2: '#f0c23a', metal: '#b9a6d6', skin: '#7f9a5e', hairColor: '#e9e6e0', eyeColor: '#e0a02a' }][n % 3];
  }

  // ------------------------------------------------------------------ drawing

  function preview() {
    const s = W.st, ITP = window.ITP, host = document.getElementById('wsPrev');
    if (!host) return;
    const id = '__ws', K = KINDS[s.kind], p = part();
    ITP.PARTS[s.kind][id] = p;
    const races = s.kind === 'feature' ? (s.races.length ? s.races : ['human']) : RACES;
    host.innerHTML = '';
    races.slice(0, 6).forEach((race, n) => {
      const look = { race, ...sample(n), skin: n === 2 ? sample(n).skin : ITP.RACES[race].skins[1], hair: 'crop', eyes: 'round', mouth: 'smile', beard: 'none', acc: 'none', build: 1, height: 1, hat: 'none', top: 'tunic', bottom: 'pants', shoes: 'boots', gloves: 'none', cape: 'none', weapon: race === 'elf' ? 'bow' : 'sword', offhand: 'none', feature: 'none' };
      const key = { hat: 'hat', hair: 'hair', feature: 'feature', weapon: 'weapon', offhand: 'offhand', top: 'top' }[s.kind];
      look[key] = id;
      ['stand0', 'atk1'].forEach((pose) => {
        try {
          const c = ITP.sprite(look, pose), cv = document.createElement('canvas');
          cv.width = c.width * 2; cv.height = c.height * 2; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, cv.width, cv.height);
          host.appendChild(cv);
        } catch (e) { host.textContent = 'Could not draw: ' + e.message; }
      });
    });
    const icons = document.getElementById('wsIcons');
    if (icons) {
      icons.innerHTML = '';
      if (K.slot && window.ITA) ['common', 'rare', 'epic', 'legendary'].forEach((r, n) => {
        // the icon cache is keyed by base, so draw this one fresh
        const c = window.ITA.drawIconFresh ? window.ITA.drawIconFresh(K.slot, id, r, n + 1) : null;
        if (!c) return;
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, 64, 64); icons.appendChild(cv);
      });
    }
    delete ITP.PARTS[s.kind][id];
  }

  function gridView() {
    const s = W.st, cv = document.getElementById('wsGrid');
    if (!cv) return null;
    const [a0, b0, a1, b1] = SPACE[KINDS[s.kind].space], sc = Math.min(cv.width / (a1 - a0), cv.height / (b1 - b0));
    // centre the space; the grid runs to the canvas edges
    const x0 = a0 - (cv.width / sc - (a1 - a0)) / 2, y0 = b0 - (cv.height / sc - (b1 - b0)) / 2, x1 = x0 + cv.width / sc, y1 = y0 + cv.height / sc;
    return { cv, sc, x0, y0, x1, y1, X: (x) => (x - x0) * sc, Y: (y) => (y - y0) * sc, inv: (px, py) => [x0 + px / sc, y0 + py / sc] };
  }
  function grid() {
    const s = W.st, G = gridView();
    if (!G) return;
    const g = G.cv.getContext('2d'), ITP = window.ITP, step = SPACE[KINDS[s.kind].space][4];
    g.fillStyle = '#1d1726'; g.fillRect(0, 0, G.cv.width, G.cv.height);
    // grid lines, with the origin and the reference outline of the space
    g.lineWidth = 1;
    for (let x = Math.ceil(G.x0 / step) * step; x <= G.x1; x += step) { const major = Math.abs(Math.round(x / step / 5) * 5 * step - x) < step / 2; g.strokeStyle = Math.abs(x) < step / 2 ? '#8a7aa8' : major ? '#3a3050' : '#272034'; g.beginPath(); g.moveTo(G.X(x) + 0.5, 0); g.lineTo(G.X(x) + 0.5, G.cv.height); g.stroke(); }
    for (let y = Math.ceil(G.y0 / step) * step; y <= G.y1; y += step) { const major = Math.abs(Math.round(y / step / 5) * 5 * step - y) < step / 2; g.strokeStyle = Math.abs(y) < step / 2 ? '#8a7aa8' : major ? '#3a3050' : '#272034'; g.beginPath(); g.moveTo(0, G.Y(y) + 0.5); g.lineTo(G.cv.width, G.Y(y) + 0.5); g.stroke(); }
    g.strokeStyle = '#6a5a88'; g.setLineDash([4, 4]);
    const space = KINDS[s.kind].space;
    if (space === 'head') { g.beginPath(); g.ellipse(G.X(0), G.Y(0), 13 * G.sc, 12.6 * G.sc, 0, 0, Math.PI * 2); g.stroke(); }
    if (space === 'hand') { g.beginPath(); g.arc(G.X(0), G.Y(0), 2.5 * G.sc, 0, Math.PI * 2); g.stroke(); }
    if (space === 'torso') { g.strokeRect(G.X(-1), G.Y(0), 2 * G.sc, 1 * G.sc); }
    g.setLineDash([]);
    // every layer, the selected one on top with its points
    const all = KINDS[s.kind].groups.flatMap((gr) => (s.parts[gr] || []).map((L, i) => [gr, i, L]));
    const c = sample(0);
    all.forEach(([gr, i, L]) => {
      const on = gr === s.group && i === s.sel, a = gr === s.group ? 0.95 : 0.35;
      const col = window.ITP.colour((L[0] === 'ellipse' || L[0] === 'line' ? L[5] : L[0] === 'glow' ? L[4] : L[0] === 'dot' ? L[3] : L[2]) || 'dye1', c);
      g.globalAlpha = a; g.fillStyle = col; g.strokeStyle = on ? '#ffffff' : '#00000088';
      if (L[0] === 'path' && L[1]) { ITP.pathPolys(L[1], 0, 0, 1, 0).forEach((P) => { g.beginPath(); P.forEach(([x, y], k) => (k ? g.lineTo(G.X(x), G.Y(y)) : g.moveTo(G.X(x), G.Y(y)))); g.closePath(); g.fill(); g.stroke(); }); }
      if (L[0] === 'poly' && L[1].length) { g.beginPath(); L[1].forEach(([x, y], k) => (k ? g.lineTo(G.X(x), G.Y(y)) : g.moveTo(G.X(x), G.Y(y)))); g.closePath(); g.fill(); g.stroke(); }
      if (L[0] === 'ellipse') { g.beginPath(); g.ellipse(G.X(L[1]), G.Y(L[2]), Math.abs(L[3]) * G.sc, Math.abs(L[4]) * G.sc, 0, 0, Math.PI * 2); g.fill(); g.stroke(); }
      if (L[0] === 'line') { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(G.X(L[1]), G.Y(L[2])); g.lineTo(G.X(L[3]), G.Y(L[4])); g.stroke(); g.lineWidth = 1; }
      if (L[0] === 'dot') g.fillRect(G.X(L[1]) - 3, G.Y(L[2]) - 3, 6, 6);
      if (L[0] === 'glow') { g.globalAlpha = a * 0.35; g.beginPath(); g.arc(G.X(L[1]), G.Y(L[2]), L[3] * G.sc, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    });
    handles().forEach(([x, y], k) => { g.fillStyle = k === 0 ? '#ffd25a' : '#ffffff'; g.fillRect(G.X(x) - 3, G.Y(y) - 3, 6, 6); g.strokeStyle = '#000'; g.strokeRect(G.X(x) - 3.5, G.Y(y) - 3.5, 7, 7); });
  }
  // the selected layer's draggable points
  function handles() {
    const L = cur();
    if (!L) return [];
    const pts = pointsOf(L);
    if (pts) return pts;
    if (L[0] === 'ellipse') return [[L[1], L[2]], [L[1] + L[3], L[2] + L[4]]];
    if (L[0] === 'line') return [[L[1], L[2]], [L[3], L[4]]];
    if (L[0] === 'dot' || L[0] === 'glow') return [[L[1], L[2]]];
    return [];
  }
  function moveHandle(k, x, y) {
    const L = cur(), pts = pointsOf(L);
    if (pts) { pts[k] = [x, y]; setPoints(L, pts); return; }
    if (L[0] === 'ellipse') { if (k === 0) { L[1] = x; L[2] = y; } else { L[3] = fmt(Math.max(0.3, Math.abs(x - L[1]))); L[4] = fmt(Math.max(0.3, Math.abs(y - L[2]))); } return; }
    if (L[0] === 'line') { if (k === 0) { L[1] = x; L[2] = y; } else { L[3] = x; L[4] = y; } return; }
    L[1] = x; L[2] = y;
  }

  function refresh(full) {
    save();
    if (full) {
      const host = document.querySelector('.ws');
      if (host) { const y = host.closest('.win-body') ? host.closest('.win-body').scrollTop : 0; host.outerHTML = W.view(); const nb = document.querySelector('.ws'); if (nb && nb.closest('.win-body')) nb.closest('.win-body').scrollTop = y; }
    } else {
      const out = document.getElementById('wsOut'); if (out) out.value = json();
      const raw = document.getElementById('wsRaw'); if (raw && document.activeElement !== raw && cur()) raw.value = JSON.stringify(cur());
    }
    W.mount();
  }

  // ------------------------------------------------------------------ events

  // the grid: click to add a point, drag a point, right-click to remove one
  let drag = -1;
  function at(e) {
    const cv = document.getElementById('wsGrid'), G = gridView(), r = cv.getBoundingClientRect(), px = ((e.clientX - r.left) * cv.width) / r.width, py = ((e.clientY - r.top) * cv.height) / r.height;
    const [x, y] = G.inv(px, py), st = SPACE[KINDS[W.st.kind].space][4] / 2;
    return [fmt(Math.round(x / st) * st), fmt(Math.round(y / st) * st), G, px, py];
  }
  const hit = (e) => { const [, , G, px, py] = at(e); return handles().findIndex(([x, y]) => Math.abs(G.X(x) - px) < 6 && Math.abs(G.Y(y) - py) < 6); };
  window.addEventListener('mousemove', (e) => { if (drag < 0 || !document.getElementById('wsGrid')) return; const [x, y] = at(e); moveHandle(drag, x, y); grid(); });
  window.addEventListener('mouseup', () => { if (drag < 0) return; drag = -1; W.busy = false; refresh(false); });

  W.mount = function () {
    const root = document.querySelector('.ws');
    if (!root) return;
    grid(); preview();
    if (root._wired) return;
    root._wired = true;
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-ws]');
      if (!el) return;
      e.preventDefault();
      const s = W.st, L = layers(), a = el.dataset.ws;
      if (a === 'sel') s.sel = +el.dataset.i;
      if (a === 'group') { s.group = el.dataset.g; s.sel = 0; }
      if (a === 'add') {
        const t = el.dataset.t, sp = KINDS[s.kind].space, u = sp === 'torso' ? 0.3 : 3;
        L.push({ path: ['path', '', 'dye1'], poly: ['poly', [], 'dye2'], ellipse: ['ellipse', 0, 0, u, u, 'metal'], line: ['line', -u, 0, u, 0, 'dark'], dot: ['dot', 0, 0, 'white'], glow: ['glow', 0, 0, sp === 'torso' ? 0.5 : 6, '#fff6c0'] }[t]);
        s.sel = L.length - 1;
      }
      if (a === 'del' && L.length) { L.splice(s.sel, 1); s.sel = Math.max(0, s.sel - 1); }
      if (a === 'dup' && cur()) { L.splice(s.sel + 1, 0, JSON.parse(JSON.stringify(cur()))); s.sel++; }
      if (a === 'up' && s.sel > 0) { [L[s.sel - 1], L[s.sel]] = [L[s.sel], L[s.sel - 1]]; s.sel--; }
      if (a === 'down' && s.sel < L.length - 1) { [L[s.sel + 1], L[s.sel]] = [L[s.sel], L[s.sel + 1]]; s.sel++; }
      if (a === 'undo') { const pts = pointsOf(cur()); if (pts && pts.length) { pts.pop(); setPoints(cur(), pts); } }
      if (a === 'new') W.st = blank(s.kind);
      if (a === 'copy') { const t = document.getElementById('wsOut'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).catch(() => document.execCommand('copy')); el.textContent = 'Copied'; setTimeout(() => { el.textContent = 'Copy JSON'; }, 1500); return; }
      if (a === 'save') { save(); el.textContent = 'Saved'; setTimeout(() => { el.textContent = 'Save draft'; }, 1500); return; }
      refresh(true);
    });
    root.addEventListener('change', (e) => {
      const el = e.target, f = el.dataset.wsf, s = W.st, L = cur();
      if (el.dataset.wsrace) { const r = el.dataset.wsrace; s.races = el.checked ? [...new Set([...s.races, r])] : s.races.filter((x) => x !== r); refresh(true); return; }
      if (el.dataset.wsrepl) { const r = el.dataset.wsrepl; s.replaces = el.checked ? [...new Set([...s.replaces, r])] : s.replaces.filter((x) => x !== r); refresh(true); return; }
      if (!f) return;
      if (f === 'kind') { const keep = { id: s.id, name: s.name }; W.st = { ...blank(el.value), ...keep }; }
      else if (f === 'from') {
        const [src, key] = [el.value.slice(0, el.value.indexOf(':')), el.value.slice(el.value.indexOf(':') + 1)];
        if (src === 'draft') { const d = (load().drafts || {})[key]; if (d) W.st = JSON.parse(JSON.stringify(d)); }
        if (src === 'part') {
          const p = JSON.parse(JSON.stringify(window.ITP.PARTS[s.kind][key])), n = blank(s.kind);
          W.st = { ...n, id: key + 'Copy', name: p.name + ' (copy)', grip: p.grip || n.grip, base: p.base || n.base, sleeve: p.sleeve || '', covers: !!p.covers, shine: p.shine !== false, races: p.races || n.races, replaces: p.replaces || [], parts: { layers: p.layers || [], back: p.back || [], front: p.front || [], over: p.over || [] } };
        }
        W.st.group = KINDS[W.st.kind].groups.find((g) => (W.st.parts[g] || []).length) || KINDS[W.st.kind].groups[0];
        W.st.sel = 0;
      }
      else if (f === 'covers' || f === 'shine') s[f] = el.checked;
      else if (['grip', 'base', 'sleeve'].includes(f)) s[f] = el.value;
      else if (L && (f === 'col' || f === 'hex' || f === 'shade' || f === 'onface')) {
        const t = L[0], ci = t === 'ellipse' || t === 'line' ? 5 : t === 'glow' ? 4 : t === 'dot' ? 3 : 2, oi = t === 'ellipse' || t === 'line' ? 6 : t === 'dot' ? 4 : 3;
        const named = (L[ci] || '').replace(/[:+].*$/, ''), shade = ((L[ci] || '').match(/[:+][\d.]+$/) || [''])[0];
        if (f === 'col') L[ci] = el.value === '#' ? '#c0392b' : el.value + (named[0] === '#' ? '' : shade);
        if (f === 'hex') L[ci] = el.value;
        if (f === 'shade') L[ci] = named + el.value;
        if (f === 'onface') { const o = { ...(L[oi] || {}) }; if (el.checked) o.on = 'face'; else delete o.on; while (L.length < oi) L.push(t === 'ellipse' ? 1 : 0); if (Object.keys(o).length) L[oi] = o; else L.length = oi; }
      }
      else return;
      refresh(true);
    });
    root.addEventListener('input', (e) => {
      const el = e.target, f = el.dataset.wsf, s = W.st;
      if (f === 'id') { s.id = el.value.trim(); refresh(false); }
      if (f === 'name') { s.name = el.value; refresh(false); }
      if (f === 'raw') {
        try { const v = JSON.parse(el.value); if (!Array.isArray(v) || typeof v[0] !== 'string') throw new Error('A layer is a list that starts with its type.'); layers()[s.sel] = v; el.classList.remove('bad'); refresh(false); } catch (err) { el.classList.add('bad'); }
      }
    });
    root.addEventListener('mousedown', (e) => {
      if (e.target.id !== 'wsGrid' || e.button !== 0) return;
      const L = cur();
      if (!L) return;
      const k = hit(e);
      if (k >= 0) { drag = k; W.busy = true; return; }
      const [x, y] = at(e), pts = pointsOf(L);
      if (pts) { pts.push([x, y]); setPoints(L, pts); } else if (L[0] !== 'path') moveHandle(0, x, y);
      refresh(false);
    });
    root.addEventListener('contextmenu', (e) => {
      if (e.target.id !== 'wsGrid') return;
      const k = hit(e), L = cur(), pts = pointsOf(L);
      if (k < 0 || !pts) return;
      e.preventDefault(); pts.splice(k, 1); setPoints(L, pts); refresh(false);
    });
  };
})();
