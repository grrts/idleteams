// Idle Teams game client. Plain JavaScript, no build step: the server owns every rule and number,
// this file only shows state and sends the player's choices to /api. Art comes from pixel.js (heroes),
// art.js (items, monsters, icons, scenery) and arena.js (the battle scene).
(function () {
  'use strict';
  const ITP = window.ITP, ITA = window.ITA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-US'));
  const pct = (p, d = 1) => (p * 100).toFixed(d) + '%';
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const clock = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  const ico = (k, cls) => ITA.img(k, cls || 'ico');

  const S = {
    cfg: null, st: null, view: 'battle', sel: null, timelines: {}, battle: null, chat: { channel: 'tavern', msgs: {}, last: {} },
    creator: null, creatorStep: 'race', skew: 0, tavern: null, guilds: null, market: null, marketFilter: { slot: '', rarity: '' }, attrOpen: null, chatOpen: false,
  };

  // ------------------------------------------------------------------ api

  async function api(method, path, body) {
    // Browser build: the game server runs inside the page (server.js).
    if (window.IT_SERVER) {
      try { return window.IT_SERVER.handle(method, path, body ? JSON.parse(JSON.stringify(body)) : null); } catch (e) { const err = new Error(e.message); err.status = e.status || 400; throw err; }
    }
    const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) { const err = new Error((data && (data.error || data.message)) || 'Something went wrong (' + res.status + ')'); err.status = res.status; throw err; }
    return data;
  }
  const get = (p) => api('GET', p);
  const post = (p, b) => api('POST', p, b || {});

  function toast(msg, ok) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (ok ? ' ok' : ''); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
  }
  async function act(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg, true); await refresh(); return r; } catch (e) { toast(e.message); return null; }
  }
  function modal(html) { const m = $('#modal'); m.innerHTML = '<div class="panel stack">' + html + '</div>'; m.hidden = false; hydrate(m); }
  function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  function confirmBox(text, yes) {
    modal('<p>' + text + '</p><div class="row"><button class="primary" data-act="modalYes">Yes</button><button data-act="closeModal">Cancel</button></div>');
    S.modalYes = yes;
  }

  // ------------------------------------------------------------------ sprites

  const spriteCache = new Map();
  function spriteURL(look, pose) {
    const key = JSON.stringify(look) + pose;
    if (!spriteCache.has(key)) {
      try { spriteCache.set(key, ITP.sprite(look, pose || 'stand0').toDataURL()); } catch (e) { spriteCache.set(key, ''); }
    }
    return spriteCache.get(key);
  }
  // anim: "idle" breathes and blinks, "walk" loops the walk cycle.
  const spr = (look, scale = 2, anim = '') => '<img class="spr" alt="" width="' + ITP.SIZE[0] * scale + '" height="' + ITP.SIZE[1] * scale + '" data-look="' + esc(JSON.stringify(look)) + '"' + (anim ? ' data-anim="' + anim + '"' : '') + '>';
  // Portrait: a square crop around the head, found from the top of the sprite so short and tall races both fit.
  function portraitURL(look) {
    const key = JSON.stringify(look) + '#por';
    if (!spriteCache.has(key)) {
      let url = '';
      try {
        const src = ITP.sprite(look, 'stand0'), d = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
        let top = 0;
        find: for (; top < src.height; top++) for (let x = 0; x < src.width; x++) if (d[(top * src.width + x) * 4 + 3] > 0) break find;
        const N = 34, c = document.createElement('canvas'); c.width = c.height = N;
        c.getContext('2d').drawImage(src, Math.round(src.width / 2 - N / 2), Math.max(0, top - 1), N, N, 0, 0, N, N);
        url = c.toDataURL();
      } catch (e) { /* fall back to an empty portrait */ }
      spriteCache.set(key, url);
    }
    return spriteCache.get(key);
  }
  const por = (look, cls = 'por') => '<span class="' + cls + '"><img class="pimg" alt="" src="' + portraitURL(look) + '"></span>';
  function hydrate(root) {
    root.querySelectorAll('img.spr[data-look]').forEach((img) => {
      img._look = JSON.parse(img.dataset.look);
      img.src = spriteURL(img._look, 'stand0'); img.removeAttribute('data-look');
    });
    root.querySelectorAll('canvas.curve[data-curve]').forEach(drawCurve);
  }
  let animTick = 0;
  setInterval(() => {
    animTick++;
    document.querySelectorAll('img.spr[data-anim]').forEach((img, k) => {
      if (!img._look) return;
      const walk = img.dataset.anim === 'walk';
      const pose = walk ? 'walk' + (animTick % 4) : (animTick + k) % 13 === 0 ? 'blink' : Math.floor((animTick + k) / 3) % 2 ? 'stand1' : 'stand0';
      const u = spriteURL(img._look, pose); if (img.src !== u) img.src = u;
    });
  }, 160);

  // ------------------------------------------------------------------ text helpers

  const rarityName = (r) => (S.cfg.rarities[r] || [cap(r)])[0];
  const attrName = (a) => (S.cfg.attributes[a] || [cap(a)])[0];
  const className = (c) => S.cfg.classes[c].name;
  const ROLE = { tank: 'Tank', healer: 'Healer', dps: 'Damage' };
  const role = (r) => '<span class="chip ' + r + '">' + ico(r) + ROLE[r] + '</span>';

  function itemName(it) {
    if (it.name) return it.name;
    if (it.slot === 'glyph') return S.cfg.glyphs[it.base][0] + ' Glyph';
    return (S.cfg.bases[it.slot] || {})[it.base] || it.base;
  }
  function sockets(it) {
    let h = '';
    (it.glyphs || []).forEach((g) => { h += '<span class="sock" title="' + (g ? esc(S.cfg.glyphs[g[0]][0] + ' +' + g[1]) : 'Empty socket') + '"' + (g ? ' style="background:' + S.cfg.glyphs[g[0]][2] + '"' : '') + '></span>'; });
    return h;
  }
  function itemLines(it) {
    if (it.slot === 'glyph') {
      const g = S.cfg.glyphs[it.base];
      return '<div>+' + (it.value ?? (it.affixes[0] || [])[1]) + ' ' + attrName(g[1]) + '</div><div class="base">Resonance at 3, 6 and 9: ' + esc(g[3]) + '</div>';
    }
    let h = '';
    if (it.base_stats) {
      const b = it.base_stats, parts = [];
      if (b.damage) parts.push(fmt(b.damage) + ' damage');
      if (b.health) parts.push(fmt(b.health) + ' health');
      if (b.armor) parts.push(fmt(b.armor) + ' armor');
      if (b.block) parts.push(fmt(b.block) + ' block');
      if (parts.length) h += '<div class="base">' + parts.join(' · ') + '</div>';
    }
    const t = 1 + 0.03 * (it.temper || 0);
    (it.affixes || []).forEach(([a, v]) => { h += '<div>+' + Math.round(v * t) + ' ' + attrName(a) + '</div>'; });
    if (it.power) h += '<div class="r-legendary">★ ' + esc(S.cfg.powers[it.power][0]) + ': ' + esc(S.cfg.powers[it.power][1]) + '</div>';
    if (it.imprint) h += '<div class="r-epic">✦ Imprint: ' + esc(S.cfg.powers[it.imprint][0]) + '</div>';
    if (it.sockets) h += '<div>' + sockets(it) + '</div>';
    return h;
  }
  const slotName = (it) => (it.slot === 'glyph' ? 'Glyph' : (S.cfg.slots[it.slot] || [cap(it.slot)])[0]);
  function tile(it, opts = {}) {
    if (!it) return '<div class="tile empty"><span>' + esc(opts.label || '') + '</span></div>';
    return '<div class="tile ' + it.rarity + (opts.sel ? ' sel' : '') + (opts.big ? ' big' : '') + '"' + (opts.act === false ? '' : ' data-act="sel" data-id="' + it.id + '"') + ' title="' + esc(itemName(it)) + '"><img alt="" src="' + ITA.icon(it) + '">' + (opts.up ? '<span class="up">▲</span>' : '') + (opts.tag ? '<span class="tag">' + opts.tag + '</span>' : '') + '</div>';
  }
  function itemCard(it, extra = '', attrs = '') {
    return '<div class="item ' + it.rarity + '" ' + attrs + '>' + tile(it, { act: false }) + '<div><div class="nm r-' + it.rarity + '">' + esc(itemName(it)) + '</div><div class="sub">' + rarityName(it.rarity) + ' ' + slotName(it) + ' · item level ' + it.ilvl + '</div>' +
      (it.price != null ? '<div class="price">' + ico('gold') + fmt(it.price) + '</div>' : '') + '</div><div class="lines">' + itemLines(it) + '</div>' + (extra ? '<div class="act">' + extra + '</div>' : '') + '</div>';
  }

  function skillText(s) {
    const o = s.opts || {}, m = Math.round(s.mult * 100), dur = o.dur ? ' for ' + o.dur + 's' : '', grp = o.party ? 'the whole group' : null;
    switch (s.type) {
      case 'strike': return 'Hits one enemy for ' + m + '% of your power.';
      case 'aoe': return 'Hits every enemy for ' + m + '% of your power.';
      case 'heal': return 'Heals the most hurt ally for ' + m + '% of your Spirit power.';
      case 'groupheal': return 'Heals the whole group for ' + m + '% of your Spirit power.';
      case 'hot': return 'Heals ' + (o.self ? 'you' : grp || 'an ally') + (o.ofHp ? ' for ' + m + '% of max health' : ' for ' + m + '% of Spirit power') + ' over ' + (o.dur || 10) + 's.';
      case 'shield': return 'Shields ' + (o.self ? 'you' : grp || (o.tank ? 'the tank' : 'an ally')) + (o.ofHp ? ' for ' + m + '% of max health.' : ' for ' + m + '% of Spirit power.');
      case 'taunt': return 'Forces enemies to attack you for a few seconds.';
      case 'wall': return (grp ? 'The whole group takes ' : 'You take ') + m + '% less damage' + dur + '.';
      case 'buff': return 'Your damage is ' + m + '% higher' + dur + '.';
      case 'mark': return 'The target takes ' + m + '% more damage' + dur + (o.slow ? ' and attacks slower' : '') + '.';
      case 'slow': return 'Enemies attack ' + m + '% slower' + dur + '.';
      case 'vanish': return 'Drops your threat so enemies look elsewhere.';
      case 'dot': return 'Burns the target for ' + m + '% of your power over ' + (o.dur || 8) + 's.';
      case 'pet': return 'Calls a companion that attacks for ' + m + '% of your power' + dur + '.';
      default: return s.type;
    }
  }
  const SKILL_COL = { strike: ['#ff8a6b', '#8a2a1a'], aoe: ['#ff9a3a', '#8a3a0a'], heal: ['#7be07f', '#1f6a2a'], groupheal: ['#9ff0a0', '#2a7a3a'], hot: ['#7ad0a0', '#1f5a4a'], shield: ['#b8d8ff', '#2f4f8a'], taunt: ['#ffd25a', '#8a5a0a'], wall: ['#6fb7ff', '#1f4a8a'], buff: ['#ffb340', '#8a4a0a'], mark: ['#ff6a8a', '#7a1a3a'], slow: ['#7fd4ff', '#1a5a7a'], vanish: ['#a090c0', '#3a2a5a'], dot: ['#ff7a2a', '#7a2a0a'], pet: ['#c8a070', '#5a3a1a'] };
  function skillIcon(s, rank) {
    const c = SKILL_COL[s.type] || ['#c084ff', '#4a1a7a'];
    return '<span class="sk" style="background:linear-gradient(145deg,' + c[0] + ',' + c[1] + ')" title="' + esc(s.name) + '"><img alt="" src="' + ITA.skill(s.type) + '">' + (rank ? '<span class="rk">' + rank + '</span>' : '') + '</span>';
  }

  // ------------------------------------------------------------------ boot and polling

  async function boot() {
    S.cfg = await get('/config');
    window.IT_GLYPH_COLORS = Object.fromEntries(Object.entries(S.cfg.glyphs).map(([k, g]) => [k, g[2]]));
    window.addEventListener('hashchange', () => { S.view = location.hash.slice(2) || 'battle'; S.sel = null; render(); loadView(); });
    S.view = location.hash.slice(2) || 'battle';
    await refresh();
    loadView();
    setInterval(() => { if (S.st && S.st.hero && !document.hidden) refresh(); }, 5000);
    setInterval(() => { if (S.st && S.st.hero && !document.hidden) pollChat(); }, 4000);
    setInterval(() => { if (S.view === 'battle' && S.st && S.st.hero && !document.hidden) loadBattle(); }, 15000);
    requestAnimationFrame(frame);
  }

  async function refresh() {
    try {
      const st = await get('/state');
      S.skew = st.serverTime - Date.now() / 1000;
      const prevBattle = S.st && S.st.battle && S.st.battle.id;
      S.st = st;
      if (st.hero && st.battle && st.battle.id !== prevBattle && S.view === 'battle') loadBattle();
    } catch (e) {
      if (e.status === 401) S.st = null; else { toast(e.message); return; }
    }
    render();
  }
  const now = () => Date.now() / 1000 + S.skew;

  async function loadView() {
    if (!S.st || !S.st.hero) return;
    if (S.view === 'battle') loadBattle();
    if (S.view === 'group') { S.tavern = await get('/tavern').catch(() => null); render(); }
    if (S.view === 'guild') { S.guilds = await get('/guilds').catch(() => null); render(); }
    if (S.view === 'market') loadMarket();
    if (S.view === 'gear' && !S.craftCost) { S.craftCost = await get('/craft/cost').catch(() => null); render(); }
    pollChat();
  }
  async function loadBattle() {
    const cur = S.battle && S.battle.current;
    const have = cur && S.timelines[cur.id] ? cur.id : 0;
    try {
      const b = await get('/battle?have=' + have);
      if (b.current && b.current.timeline) S.timelines[b.current.id] = prepTimeline(b.current.timeline);
      S.battle = b;
      render();
    } catch (e) { /* not in a group */ }
  }
  async function loadMarket() {
    const f = S.marketFilter;
    S.market = await get('/market?slot=' + encodeURIComponent(f.slot) + '&rarity=' + encodeURIComponent(f.rarity)).catch(() => []);
    render();
  }

  // ------------------------------------------------------------------ render

  // Re-rendering replaces the DOM, so typed text, focus and the open item survive by element id.
  function keepInputs(root, paint) {
    const vals = {}, active = document.activeElement && document.activeElement.id;
    root.querySelectorAll('input[id], textarea[id]').forEach((el) => { if (el.type !== 'checkbox') vals[el.id] = el.value; });
    const caret = active && document.activeElement.selectionStart;
    paint();
    Object.entries(vals).forEach(([id, v]) => { const el = document.getElementById(id); if (el && v && !el.value) el.value = v; });
    if (active) { const el = document.getElementById(active); if (el) { el.focus(); try { el.setSelectionRange(caret, caret); } catch (e) { /* not a text field */ } } }
  }

  function render() {
    const app = $('#app');
    const keepScroll = $('.msgs') ? $('.msgs').scrollTop : null;
    keepInputs(app, () => {
      if (!S.st) app.innerHTML = authView();
      else if (!S.st.hero) app.innerHTML = creatorView();
      else app.innerHTML = shell();
    });
    hydrate(app);
    const msgs = $('.msgs');
    if (msgs) msgs.scrollTop = keepScroll != null && !S.chatJump ? keepScroll : msgs.scrollHeight;
    S.chatJump = false;
    if (S.st && S.st.hero && S.view === 'battle') setupScene();
  }

  function authView() {
    const reg = S.authMode === 'register';
    return '<div class="auth panel stack"><div class="logo center" style="font-size:2.4rem">Idle <span>Teams</span></div><p class="muted center">Five heroes, one long dungeon run, loot for the group.</p>' +
      '<div class="tabs"><button class="' + (!reg ? 'on' : '') + '" data-act="authMode" data-mode="login">Log in</button><button class="' + (reg ? 'on' : '') + '" data-act="authMode" data-mode="register">Create account</button></div>' +
      '<form data-form="' + (reg ? 'register' : 'login') + '"><label for="u">Username</label><input id="u" name="username" autocomplete="username" required style="width:100%"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required style="width:100%">' +
      '<div style="margin-top:14px"><button class="primary" type="submit">' + (reg ? 'Create account' : 'Log in') + '</button></div></form></div>';
  }

  // ------------------------------------------------------------------ creator

  function creatorState() {
    if (!S.creator) {
      const r = ITP.randomHero();
      S.creator = { name: '', race: 'human', cls: 'guardian', origin: 'anvil', look: { skin: ITP.RACES.human.skins[1], hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, eyeColor: r.eyeColor, mouth: r.mouth, beard: 'none', acc: 'none', build: 1, height: 1, dye1: r.dye1, dye2: r.dye2, metal: r.metal } };
    }
    return S.creator;
  }
  // The creator shows the hero in plain clothes: gear comes from play, not from the creator.
  const plain = (c, race) => ({ ...c.look, race: race || c.race, skin: race && race !== c.race ? ITP.RACES[race].skins[1] : c.look.skin, hat: 'none', top: 'tunic', bottom: 'pants', shoes: 'boots', gloves: 'none', cape: 'none', weapon: 'none', offhand: 'none' });
  const STEPS = [['race', 'Race'], ['cls', 'Class'], ['origin', 'Origin'], ['look', 'Look']];

  function creatorView() {
    const c = creatorState(), cfg = S.cfg, R = ITP.RACES[c.race], step = S.creatorStep;
    const start = {};
    const add = (a, n) => { start[a] = (start[a] || 0) + n; };
    Object.entries(cfg.races[c.race].points).forEach(([a, n]) => add(a, n));
    Object.entries(cfg.classes[c.cls].points).forEach(([a, n]) => add(a, n));
    add(cfg.origins[c.origin][1], cfg.originPoints);
    const maxStart = Math.max(...Object.values(start));
    const pts = (o) => Object.entries(o).map(([a, n]) => '+' + n + ' ' + attrName(a)).join(' · ');
    const choice = (kind, id, title, body, on) => '<div class="choice ' + (on ? 'on' : '') + '" data-act="pick" data-kind="' + kind + '" data-id="' + id + '"><b>' + esc(title) + '</b>' + body + '</div>';
    const sw = (key, list, title) => '<div><label>' + title + '</label><div class="swatches">' + list.map((v) => '<span class="sw ' + (String(c.look[key]) === String(v) ? 'on' : '') + '" style="background:' + v + '" data-act="look" data-key="' + key + '" data-v="' + v + '" title="' + v + '"></span>').join('') + '</div></div>';
    const seg = (key, values, title) => '<div><label>' + title + '</label><div class="seg">' + Object.entries(values).map(([v, n]) => '<button class="small ' + (String(c.look[key]) === String(v) ? 'on' : '') + '" data-act="look" data-key="' + key + '" data-v="' + v + '">' + esc(n) + '</button>').join('') + '</div></div>';
    let body = '';
    if (step === 'race') {
      const r = cfg.races[c.race];
      body = '<h2>Choose a race</h2><p class="muted">Races come in real sizes, from stout dwarves to towering orcs and draka. Every race can play every role.</p><div class="races" style="margin-top:12px">' +
        Object.entries(cfg.races).map(([id, x]) => '<div class="race ' + (c.race === id ? 'on' : '') + '" data-act="pick" data-kind="race" data-id="' + id + '">' + spr(plain(c, id), 1.5) + '<b>' + esc(x.name) + '</b></div>').join('') + '</div>' +
        '<div class="detail"><b class="title">' + esc(r.name) + '</b><div><b class="gold">' + esc(r.passive[1]) + '.</b> ' + esc(r.passive[2]) + '</div><div class="muted small">Starting points: ' + pts(r.points) + '</div></div>';
    } else if (step === 'cls') {
      body = '<h2>Choose a class</h2><p class="muted">Your class sets your role in the group, your skills and the resource they spend. It is permanent.</p><div class="choices" style="margin-top:12px">' +
        Object.entries(cfg.classes).map(([id, k]) => choice('cls', id, k.name, '<div class="row">' + role(k.role) + '<span class="chip">' + ico(k.resource) + k.resource + '</span></div><div><b class="gold">' + esc(k.passive[1]) + '.</b> ' + esc(k.passive[2]) + '</div><div class="muted small">' + pts(k.points) + '</div>', c.cls === id)).join('') + '</div>';
    } else if (step === 'origin') {
      body = '<h2>Choose an Origin</h2><p class="muted">Where your hero comes from: ' + cfg.originPoints + ' points in one attribute and a small edge of its own.</p><div class="choices" style="margin-top:12px">' +
        Object.entries(cfg.origins).map(([id, o]) => choice('origin', id, o[0], '<div class="muted small">+' + cfg.originPoints + ' ' + attrName(o[1]) + '</div><div>' + esc(o[2]) + '</div>', c.origin === id)).join('') + '</div>';
    } else {
      body = '<div class="head"><h2>Make them yours</h2><button class="small" data-act="randomLook">Randomise look</button></div><p class="muted">Build and height change the silhouette only. Your two clothes colours become the dyes on every piece of gear you earn later.</p><div class="lookgrid" style="margin-top:6px">' +
        sw('skin', R.skins, 'Skin') + sw('hairColor', ITP.HAIRS, 'Hair colour') + seg('hair', ITP.OPTIONS.hair, 'Hair') + sw('eyeColor', ITP.EYES, 'Eye colour') + seg('eyes', ITP.OPTIONS.eyes, 'Eyes') + seg('mouth', ITP.OPTIONS.mouth, 'Expression') +
        seg('beard', ITP.OPTIONS.beard, 'Facial hair') + seg('acc', ITP.OPTIONS.acc, 'Accessory') + seg('build', { 0.92: 'Slim', 1: 'Average', 1.1: 'Broad' }, 'Build') + seg('height', { 0.95: 'Short', 1: 'Average', 1.05: 'Tall' }, 'Height') +
        sw('dye1', ITP.DYES, 'Main dye') + sw('dye2', ITP.DYES, 'Second dye') + sw('metal', ITP.METALS, 'Metal') + '</div>';
    }
    const idx = STEPS.findIndex(([s]) => s === step);
    const nav = '<div class="row between" style="margin-top:16px">' + (idx > 0 ? '<button data-act="cstep" data-s="' + STEPS[idx - 1][0] + '">Back</button>' : '<span></span>') + (idx < STEPS.length - 1 ? '<button class="primary" data-act="cstep" data-s="' + STEPS[idx + 1][0] + '">Next</button>' : '<button class="primary" data-act="create">Create hero</button>') + '</div>';
    const k = cfg.classes[c.cls];
    return '<div class="creator"><div class="row between"><div class="logo">Idle <span>Teams</span></div><span class="muted small">Race, class and Origin are permanent. The look is yours to keep.</span></div><div class="cols">' +
      '<div class="stagebox stack"><div class="panel stack"><div class="portrait" style="aspect-ratio:4/4.4">' + spr(plain(c), 4, 'idle') + '</div>' +
      '<div><label for="cname">Name</label><input id="cname" value="' + esc(c.name) + '" maxlength="20" style="width:100%" placeholder="3 to 20 letters"></div>' +
      '<div class="row"><b class="num" style="font-size:1.2rem">' + esc(ITP.RACES[c.race].name + ' ' + k.name) + '</b>' + role(k.role) + '</div>' +
      '<div><div class="eyebrow">Starting attributes</div><div class="startbars" style="margin-top:6px">' + Object.entries(start).sort((a, b) => b[1] - a[1]).map(([a, n]) => '<div><span>' + attrName(a) + '</span><span class="bar"><i style="width:' + (100 * n) / maxStart + '%"></i></span><b class="num">' + n + '</b></div>').join('') + '</div></div>' +
      '<button class="primary" data-act="create">Create hero</button></div></div>' +
      '<div class="panel"><div class="steps">' + STEPS.map(([s, n], i) => '<button class="' + (s === step ? 'on' : '') + '" data-act="cstep" data-s="' + s + '"><i>' + (i + 1) + '</i>' + n + '</button>').join('') + '</div>' + body + nav + '</div></div></div>';
  }

  // ------------------------------------------------------------------ shell

  const VIEWS = [['battle', 'Battle', 'battle'], ['hero', 'Hero', 'hero'], ['skills', 'Skills', 'skills'], ['gear', 'Gear', 'gear'], ['group', 'Group', 'group'], ['guild', 'Guild', 'guild'], ['market', 'Market', 'market']];
  function shell() {
    const h = S.st.hero;
    const dots = { battle: S.st.pendingRolls, hero: h.points.unspent + h.openKeystones.length + (h.level >= S.cfg.pathLevel && !h.path ? 1 : 0), skills: h.skillPoints, group: S.st.invites.length + (S.st.party ? S.st.party.requests.filter((r) => r.kind === 'application').length : 0) };
    const nav = VIEWS.map(([id, n, i]) => '<a href="#/' + id + '" class="' + (S.view === id ? 'on' : '') + '">' + ico(i, '') + '<span>' + n + '</span>' + (dots[id] ? '<span class="badge">' + dots[id] + '</span>' : '') + '</a>').join('') + '<a href="#" data-act="toggleChat" class="chat-link">' + ico('chat', '') + '<span>Chat</span></a>';
    const views = { battle: battleView, hero: heroView, skills: skillsView, gear: gearView, group: groupView, guild: guildView, market: marketView };
    return '<div class="shell' + (S.chatOpen ? ' chat-open' : '') + '"><header class="top"><span class="logo">Idle <span>Teams</span></span>' +
      '<span class="who">' + por(h.look) + '<span><b>' + esc(h.name) + '</b> <span class="muted small">Lv ' + h.level + ' ' + className(h.cls) + '</span></span></span>' +
      '<span class="xp" title="' + fmt(h.xp) + ' / ' + fmt(h.xpNext) + ' XP"><span class="tiny muted">' + ico('xp') + ' ' + fmt(h.xp) + ' / ' + fmt(h.xpNext) + ' XP</span><span class="bar"><i class="xpf" style="width:' + Math.min(100, (100 * h.xp) / h.xpNext) + '%"></i></span></span>' +
      '<span class="cur"><span class="gold" title="Gold">' + ico('gold') + fmt(h.gold) + '</span><span title="Materials">' + ico('materials') + fmt(h.materials) + '</span><span class="r-epic" title="Essence">' + ico('essence') + fmt(h.essence) + '</span><button class="small" data-act="logout">' + (window.IT_SERVER ? 'New game' : 'Log out') + '</button></span></header>' +
      '<nav class="nav">' + nav + '</nav><main class="main">' + (views[S.view] || battleView)() + '</main><aside class="side">' + chatView() + '</aside></div>';
  }

  // ------------------------------------------------------------------ battle

  function battleView() {
    const st = S.st, p = st.party;
    if (!p) {
      return '<div class="stack"><div class="camp"><h1>No group yet</h1><p class="muted" style="max-width:56ch;margin:8px auto 0">Dungeons are run by a group of five real heroes. Find one on the tavern board, or start your own and invite people.</p>' +
        '<div class="lineup"><div class="seat">' + spr(st.hero.look, 1.5, 'idle') + '<b>' + esc(st.hero.name) + '</b></div>' + [1, 2, 3, 4].map(() => '<div class="seat"><div class="empty">Open seat</div></div>').join('') + '</div>' +
        '<div style="margin-top:16px"><a href="#/group"><button class="primary">Go to the tavern</button></a></div></div>' + reportsView() + '</div>';
    }
    const cur = S.battle && S.battle.current;
    if (!cur) {
      const last = S.battle ? [...S.battle.chests, ...S.battle.recent].sort((a, c) => c.endsAt - a.endsAt)[0] : null;
      const wiped = !p.running && p.members.length === S.cfg.partySize && last && last.report.wiped;
      if (wiped) {
        const r = last.report;
        return '<div class="stack"><div class="camp wipe"><div class="eyebrow">' + esc(S.cfg.dungeon.name) + ' · level ' + last.dungeonLevel + '</div><h1>' + ico('skull', 'ico lg') + ' The group fell</h1>' +
          '<p style="margin-top:6px">' + esc(r.cause || 'The group wiped.') + '</p><p class="muted small">Battles stop after a wipe. Change gear, skills or attributes, ask in group chat, and send everyone back in when you are ready.</p>' +
          '<div class="lineup">' + p.members.map((m) => '<div class="seat down">' + spr(m.look, 1.5) + '<b>' + esc(m.name) + '</b>' + role(m.role) + '</div>').join('') + '</div>' +
          '<div class="row" style="margin-top:16px;justify-content:center"><button class="primary" data-act="resume">Back into the dungeon</button><a href="#/gear"><button>Gear</button></a><a href="#/skills"><button>Skills</button></a><a href="#/hero"><button>Attributes</button></a>' + (p.leader === st.hero.id ? '<a href="#/group"><button>Change difficulty</button></a>' : '') + '</div></div>' + chestsView() + reportsView() + '</div>';
      }
      const why = p.members.length < S.cfg.partySize ? 'The group needs ' + (S.cfg.partySize - p.members.length) + ' more hero' + (S.cfg.partySize - p.members.length === 1 ? '' : 'es') + '. The next run starts as soon as it is full.' : !p.running ? 'The group is resting. The leader can send it back in from the Group page.' : 'The next run is about to start…';
      return '<div class="stack"><div class="camp"><div class="eyebrow">' + esc(S.cfg.dungeon.name) + '</div><h1>' + esc(p.name) + '</h1><p class="muted" style="margin-top:6px">' + why + '</p>' +
        '<div class="lineup">' + p.members.map((m) => '<div class="seat">' + spr(m.look, 1.5, 'idle') + '<b>' + esc(m.name) + '</b>' + role(m.role) + '</div>').join('') + Array.from({ length: S.cfg.partySize - p.members.length }, () => '<div class="seat"><div class="empty">Open seat</div></div>').join('') + '</div>' +
        (p.members.length < S.cfg.partySize ? '<div style="margin-top:16px"><a href="#/group"><button class="primary">Find heroes</button></a></div>' : '') + '</div>' + chestsView() + reportsView() + '</div>';
    }
    const plan = S.cfg.dungeon.plan;
    const side = chestsView() + reportsView();
    const log = '<div class="panel"><div class="head"><h3>Battle log</h3><span class="muted small">' + esc(S.cfg.dungeon.name) + ' · level ' + cur.dungeonLevel + ' · rewards land when the run ends</span></div><div class="log" id="blog"></div></div>';
    return '<div class="stack"><div><div class="arena"><canvas id="scene" width="960" height="540"></canvas><div class="clock" id="clock"></div></div>' +
      '<div class="track" id="track">' + plan.map(([kind, name], n) => '<span class="node ' + kind + '" data-n="' + n + '" title="' + esc(name) + '">' + (kind === 'boss' ? esc(name) : '') + '</span>').join('') + '</div>' +
      '<div class="frames">' + cur.roster.map((r, i) => '<div class="frame" id="fr' + i + '">' + por(r.look) + '<div class="nm">' + esc(r.name) + '</div><div class="cl">' + className(r.cls) + ' · ' + r.level + '</div><div><div class="bar"><i class="hp" style="width:100%"></i><i class="abs" style="width:0"></i></div><div class="bar res"><i class="' + r.resource + '" style="width:100%"></i></div></div></div>').join('') + '</div></div>' +
      (side ? '<div class="grid2">' + log + '<div class="stack">' + side + '</div></div>' : log) + '</div>';
  }

  function chestsView() {
    const b = S.battle;
    if (!b || !b.chests.length) return '';
    const me = S.st.hero.id;
    return b.chests.map((c) => {
      const names = Object.fromEntries(c.roster.map((r) => [r.id, r.name]));
      const items = c.chest.length ? '<div class="chest-items">' + c.chest.map((e) => {
        const mine = e.rolls[me];
        const others = Object.entries(e.rolls).map(([id, ch]) => '<span class="chip">' + esc(names[id] || '?') + ': ' + ch + '</span>').join('');
        const buttons = mine ? '<div class="small">You chose <b>' + mine + '</b></div>' : '<div class="row"><button class="small primary" data-act="roll" data-b="' + c.id + '" data-i="' + e.idx + '" data-c="need">Need</button><button class="small" data-act="roll" data-b="' + c.id + '" data-i="' + e.idx + '" data-c="greed">Greed</button><button class="small" data-act="roll" data-b="' + c.id + '" data-i="' + e.idx + '" data-c="pass">Pass</button></div>';
        return itemCard(e.item, (e.upgrade ? '<div class="upgrade">▲ Upgrade for you</div>' : '') + buttons + (others ? '<div class="rolls">' + others + '</div>' : ''));
      }).join('') + '</div>' : '<p class="muted">No loot this time, only materials. Loot is never guaranteed.</p>';
      return '<div class="panel" style="border-color:rgba(255,210,90,.5)"><div class="head"><h3>' + ico('chest', 'ico lg') + ' Group chest</h3><span class="muted small">Closes in ' + clock(c.chestClosesAt - now()) + '. Anyone who has not rolled by then rolls by their loot setting.</span></div>' + items + '</div>';
    }).join('');
  }

  function reportsView() {
    const b = S.battle;
    if (!b) return '';
    const list = [...b.chests, ...b.recent];
    if (!list.length) return '';
    return '<div class="panel"><h3>Recent runs</h3>' + list.slice(0, 6).map((x) => {
      const r = x.report, won = !r.wiped, top = Math.max(1, ...r.heroes.map((h) => h.damage));
      const rows = r.heroes.map((h) => '<tr><td><b>' + esc(h.name) + '</b><div class="bar meter" style="width:110px"><i style="width:' + (100 * h.damage) / top + '%"></i></div></td><td class="n">' + fmt(h.damage) + '</td><td class="n">' + fmt(h.healing) + '</td><td class="n">' + fmt(h.taken) + '</td><td class="n">' + h.deaths + '</td><td class="n">' + fmt(h.xp) + '</td><td class="n gold">' + fmt(h.gold) + '</td><td class="n">' + fmt(h.materials) + '</td></tr>').join('');
      const fellAt = r.wiped ? r.plan[r.encountersDone] : null;
      const loot = x.chest.filter((e) => e.winner).map((e) => '<span class="row" style="gap:6px">' + tile(e.item, { act: false }) + '<span><span class="r-' + e.item.rarity + '"><b>' + esc(e.item.name) + '</b></span><br><span class="small muted">won by ' + esc((x.roster.find((q) => q.id === e.winner) || {}).name || '?') + '</span></span></span>').join('');
      return '<details class="run"' + (x === list[0] ? ' open' : '') + '><summary><b class="' + (won ? 'good' : 'bad') + '">' + (won ? 'Cleared ' + esc(r.dungeon) : 'Fell at the ' + esc(fellAt[1])) + '</b><span class="chip">' + r.bossesKilled + '/3 bosses</span><span class="chip">level ' + x.dungeonLevel + '</span><span class="small muted">' + new Date(x.endsAt * 1000).toLocaleTimeString() + '</span></summary>' +
        (r.cause ? '<p class="bad small" style="margin-top:8px">' + esc(r.cause) + '</p>' : '') +
        '<div class="scroll-x" style="margin-top:8px"><table class="t"><tr><th>Hero</th><th class="n">Damage</th><th class="n">Healing</th><th class="n">Taken</th><th class="n">Deaths</th><th class="n">XP</th><th class="n">Gold</th><th class="n">Mats</th></tr>' + rows + '</table></div>' +
        (loot ? '<div class="row" style="margin-top:10px;gap:14px">' + loot + '</div>' : x.state === 'done' ? '<p class="small muted" style="margin-top:8px">No loot this time, only materials.</p>' : '') + '</details>';
    }).join('') + '</div>';
  }

  // ---------- playback: the battle was simulated on the server; we replay it in step with the clock

  function prepTimeline(t) {
    t.ev = t.events.map((e) => ({ t: e[0] / 10, type: e[1], src: e[2], dst: e[3], amt: e[4], flags: e[5], x: e[6] }));
    return t;
  }
  const scn = { log: [], logDirty: false, arena: null };
  function setupScene() {
    const cur = S.battle && S.battle.current, cv = $('#scene');
    if (!cur || !cv) return;
    if (!scn.arena) scn.arena = new window.ITArena.Arena(cv, { log: logLine });
    scn.arena.cv = cv; scn.arena.g = cv.getContext('2d');
    if (scn.battleId !== cur.id) { scn.battleId = cur.id; scn.log = []; }
    scn.redrawLog = true;
  }
  function simTime(cur, tl) {
    const span = cur.endsAt - cur.startedAt;
    return Math.min(tl.length, Math.max(0, ((now() - cur.startedAt) / span) * tl.length));
  }
  function logLine(t, text, cls) { scn.log.push('<div class="' + (cls || '') + '"><span class="t">' + clock(t) + '</span>' + text + '</div>'); if (scn.log.length > 100) scn.log.shift(); scn.logDirty = true; }
  function snapAt(tl, simT) {
    const s = tl.snaps; if (!s.length) return null;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid][0] <= simT) lo = mid; else hi = mid - 1; }
    return s[lo];
  }
  function updateFrame(i, snap) {
    const el = document.getElementById('fr' + i); if (!el || !snap) return;
    const hp = snap[1][i], res = snap[2][i], ab = snap[4][i];
    const bars = el.querySelectorAll('.bar i');
    bars[0].style.width = hp / 10 + '%'; bars[0].className = 'hp' + (hp < 350 ? ' low' : '');
    bars[1].style.width = Math.min(100, ab / 10) + '%';
    bars[2].style.width = res / 10 + '%';
    el.classList.toggle('dead', hp <= 0);
  }
  function frame() {
    requestAnimationFrame(frame);
    if (!S.st || !S.st.hero || S.view !== 'battle') return;
    const cur = S.battle && S.battle.current; const tl = cur && S.timelines[cur.id];
    if (!cur || !tl || !scn.arena) return;
    const simT = simTime(cur, tl), snap = snapAt(tl, simT);
    scn.arena.update(cur, tl, simT);
    scn.arena.draw(cur, tl, simT, snap);
    cur.roster.forEach((r, i) => updateFrame(i, snap));
    const c = $('#clock'); if (c) c.textContent = 'Run ends in ' + clock(cur.endsAt - now());
    const track = $('#track'), at = scn.arena.at;
    if (track && track.dataset.at !== String(at)) { track.dataset.at = at; track.querySelectorAll('.node').forEach((el) => { const n = +el.dataset.n; el.classList.toggle('done', n < at); el.classList.toggle('now', n === at); }); }
    const log = $('#blog');
    if (log && (scn.logDirty || scn.redrawLog)) { log.innerHTML = scn.log.slice().reverse().join(''); scn.logDirty = false; scn.redrawLog = false; }
    if (now() > cur.endsAt + 2 && !scn.reloading) { scn.reloading = true; setTimeout(async () => { await refresh(); await loadBattle(); scn.reloading = false; }, 1500); }
  }

  // ------------------------------------------------------------------ hero sheet

  function heroView() {
    const h = S.st.hero, cfg = S.cfg, st = h.stats;
    const groups = {};
    Object.entries(cfg.attributes).forEach(([a, d]) => { (groups[d[1]] = groups[d[1]] || []).push(a); });
    const carved = h.points.carved || {}, spent = h.points.spent || {};
    const maxA = Math.max(1, ...Object.values(h.attributes));
    let attrs = '';
    Object.entries(groups).forEach(([g, list]) => {
      attrs += '<div class="grp">' + g + '</div>';
      list.forEach((a) => {
        const mine = spent[a] || 0, lock = carved[a] || 0, over = Math.abs(h.effective[a] - h.attributes[a]) > 0.5;
        attrs += '<div class="attr"><span class="n" data-act="attrOpen" data-a="' + a + '">' + attrName(a) + (mine ? ' <small>(' + mine + ' yours' + (lock ? ', ' + lock + ' carved' : '') + ')</small>' : '') + '</span>' +
          '<span class="v' + (over ? ' bad' : '') + '">' + fmt(h.attributes[a]) + '</span><span class="btns"><button class="small" data-act="spend" data-a="' + a + '" data-n="-1" ' + (mine > lock ? '' : 'disabled') + ' aria-label="Take a point back">−</button><button class="small" data-act="spend" data-a="' + a + '" data-n="1" ' + (h.points.unspent > 0 ? '' : 'disabled') + ' aria-label="Spend a point">+</button><button class="small" data-act="spend" data-a="' + a + '" data-n="5" ' + (h.points.unspent >= 5 ? '' : 'disabled') + '>+5</button></span>' +
          '<span class="bar"><i style="width:' + (100 * h.attributes[a]) / maxA + '%;background:linear-gradient(90deg,var(--ember2),var(--ember))"></i></span>' +
          '<span class="d">' + esc(cfg.attributes[a][2]) + (S.attrOpen === a ? '<br>' + (h.sources[a] || []).map(([f, n]) => esc(f) + ' +' + n).join(' · ') + (over ? '<br><span class="bad">Past the soft cap: counts as ' + fmt(h.effective[a]) + '</span>' : '') : '') + '</span></div>';
      });
    });
    const res = { mana: 'Mana', energy: 'Energy', rage: 'Rage' }[st.resource];
    const stat = (n, v, tip) => '<div class="stat" title="' + esc(tip || '') + '"><div class="k">' + n + '</div><div class="v">' + v + '</div></div>';
    const key = stat('Health', fmt(st.maxHp)) + stat(h.role === 'healer' ? 'Healing power' : st.arcana > st.might ? 'Spell power' : 'Power', fmt(h.role === 'healer' ? st.spirit : Math.max(st.might, st.arcana))) + stat('Crit', pct(st.crit)) + stat('Haste', '+' + pct(st.haste - 1)) + stat(h.role === 'tank' ? 'Damage cut' : 'Dodge', pct(h.role === 'tank' ? st.dr : st.dodge)) + stat(res, fmt(st.resMax));
    const stats = stat('Max health', fmt(st.maxHp)) + stat('Weapon damage', fmt(st.weaponDamage)) + stat('Physical power', fmt(st.might)) + stat('Spell power', fmt(st.arcana)) + stat('Healing power', fmt(st.spirit)) +
      stat('Crit chance', pct(st.crit), 'Precision, curve') + stat('MEGA crit', pct(st.mega), 'Ferocity, curve') + stat('Crit damage', '×' + st.critMult.toFixed(2)) + stat('Haste', '+' + pct(st.haste - 1), 'Swiftness, curve') +
      stat('Cooldowns', '−' + pct(st.cdr), 'Focus, curve') + stat('Dodge', pct(st.dodge), 'Agility, curve') + stat('Damage cut', pct(st.dr), 'Guard and armor, curve') + stat('Block', pct(st.block)) + stat('Resist', pct(st.resist), 'Resolve, curve') +
      stat('Regen', fmt(st.regen) + '/s') + stat('Healing taken', '+' + pct(st.healRecv - 1)) + stat('Threat', '×' + st.threat.toFixed(2)) + stat('Buff strength', '×' + st.command.toFixed(2)) + stat('Fortune', '×' + st.fortune.toFixed(2)) +
      stat(res, fmt(st.resMax) + (st.resRegen ? ' +' + st.resRegen.toFixed(1) + '/s' : ''));
    const curves = Object.entries(h.curves).map(([k, c]) => '<div><div class="small"><b>' + ({ crit: 'Crit', haste: 'Haste', cdr: 'Cooldowns', dodge: 'Dodge', resist: 'Resist', mega: 'MEGA crit' })[k] + '</b> <span class="muted">from ' + attrName(c.attr) + ' ' + fmt(c.points) + '</span></div><canvas class="curve" width="260" height="110" data-curve=\'' + JSON.stringify({ k: h.k, p: c.points, cap: cfg.caps[k] || 0.95, half: k === 'mega' }) + '\'></canvas></div>').join('');

    const cls = cfg.classes[h.cls];
    let path = '';
    if (h.level < cfg.pathLevel) path = '<p class="muted">Your Path opens at level ' + cfg.pathLevel + '. You can change it until the Oath at level ' + cfg.oathLevel + ', which seals it with every point spent so far.</p>';
    else path = '<div class="choices">' + Object.entries(cls.paths).map(([id, p]) => '<div class="choice ' + (h.path === id ? 'on' : '') + (h.oathTaken ? ' locked' : '') + '" ' + (h.oathTaken ? '' : 'data-act="path" data-id="' + id + '"') + '><b>' + esc(p[0]) + '</b>' + esc(p[1]) + '<div class="muted small">Skills: ' + Object.values(p[2]).map((s) => esc(s[0])).join(', ') + '</div></div>').join('') + '</div>' +
      (h.oathTaken ? '<p class="small gold" style="margin-top:8px">' + ico('lock') + ' Oathsworn: your Path and the points spent before level ' + cfg.oathLevel + ' are carved in.</p>' : '<p class="small muted" style="margin-top:8px">The Oath at level ' + cfg.oathLevel + ' seals your Path and carves in the points you have spent by then.</p>');
    const ks = cfg.keystones[h.role];
    const chosen = Object.entries(h.keystones).map(([lvl, id]) => '<div class="choice on locked"><span class="eyebrow">' + ico('lock') + ' Level ' + lvl + '</span><b>' + esc(ks[id][0]) + '</b><div>' + esc(ks[id][1]) + '</div></div>').join('');
    const open = h.openKeystones.length ? '<h4 style="margin-top:12px">Choose your level ' + h.openKeystones[0] + ' Keystone. This is permanent.</h4><div class="choices" style="margin-top:8px">' + Object.entries(ks).filter(([id]) => !Object.values(h.keystones).includes(id)).map(([id, k]) => '<div class="choice" data-act="keystone" data-l="' + h.openKeystones[0] + '" data-id="' + id + '"><b>' + esc(k[0]) + '</b>' + esc(k[1]) + '</div>').join('') + '</div>' : '';
    const race = cfg.races[h.race], origin = cfg.origins[h.origin];
    const marks = h.marks.map((m) => '<span class="chip gold" title="' + esc((cfg.marks[m] || ['', ''])[1]) + '">' + ico('star') + esc((cfg.marks[m] || [m])[0]) + '</span>').join(' ');
    const career = h.career || {};

    return '<div class="stack"><div class="hero-top"><div class="portrait"><span class="lvl">Level ' + h.level + '</span>' + spr(h.look, 4, 'idle') + '</div>' +
      '<div class="stack tight"><div><div class="eyebrow">' + esc(race.name) + ' · Origin: ' + esc(origin[0]) + (h.guild ? ' · [' + esc(h.guild.tag) + '] ' + esc(h.guild.name) : '') + '</div><h1>' + esc(h.name) + '</h1>' +
      '<div class="row title-line">' + esc(cls.name) + (h.path ? ' of the ' + esc(cls.paths[h.path][0]) : '') + role(h.role) + (h.oathTaken ? '<span class="chip gold">' + ico('lock') + 'Oathsworn</span>' : '') + '</div></div>' +
      '<div><div class="small muted" style="margin-bottom:4px">' + ico('xp') + ' ' + fmt(h.xp) + ' / ' + fmt(h.xpNext) + ' XP to level ' + (h.level + 1) + '</div><div class="bar"><i class="xpf" style="width:' + Math.min(100, (100 * h.xp) / h.xpNext) + '%"></i></div></div>' +
      '<div class="statstrip">' + key + '</div>' +
      '<div class="passives"><div class="passive"><b>' + esc(race.passive[1]) + '</b> · ' + esc(race.passive[2]) + '</div><div class="passive"><b>' + esc(cls.passive[1]) + '</b> · ' + esc(cls.passive[2]) + '</div><div class="passive"><b>' + esc(origin[0]) + '</b> · ' + esc(origin[2]) + '</div></div>' +
      '<div class="row">' + (marks || '<span class="muted small">No Marks yet. Marks are earned in battle and shown on your card.</span>') + '</div>' +
      '<div class="small muted">' + (career.battles || 0) + ' runs · ' + (career.dungeons || 0) + ' clears · ' + (career.bossKills || 0) + ' bosses · ' + (career.deaths || 0) + ' deaths · Codex ' + h.codexPowers.length + ' of ' + Object.keys(cfg.powers).length + '</div></div></div>' +
      '<div class="panel"><div class="head"><h2>Attributes</h2><div class="row"><span class="num" style="font-size:1.2rem"><span class="gold">' + h.points.unspent + '</span> <span class="muted small">unspent of ' + h.points.total + '</span></span><button class="small' + (h.points.unspent ? ' primary' : '') + '" data-act="autoSpend" ' + (h.points.unspent ? '' : 'disabled') + '>Spend the suggested way</button></div></div>' +
      '<p class="small muted">Everything comes from attributes and gear, ' + cfg.pointsPerLevel + ' points per level. Percentage stats follow a curve that gets steep around 50% and never reaches 100%. One attribute above ' + Math.round(cfg.softCapShare * 100) + '% of all your points counts half past that line. Tap an attribute to see where its points come from.</p><div class="attrs">' + attrs + '</div></div>' +
      '<div class="panel"><h2>Combat stats</h2><div class="statstrip">' + stats + '</div></div>' +
      '<div class="panel"><div class="head"><h2>Curves</h2><span class="small muted">Points needed = K × p / (1 − p)², K = ' + h.k.toFixed(1) + ' at your level. The green dot is you.</span></div><div class="grid2" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))">' + curves + '</div></div>' +
      '<div class="panel"><h2>Path</h2>' + path + '</div>' +
      '<div class="panel"><div class="head"><h2>Keystones</h2><span class="small muted">Levels ' + cfg.keystoneLevels.join(', ') + ', then every 25 after 50. Each choice is permanent.</span></div>' + (chosen ? '<div class="choices">' + chosen + '</div>' : '') + open + (!chosen && !open ? '<p class="muted">Your first Keystone opens at level ' + cfg.keystoneLevels[0] + '.</p>' : '') + '</div>' +
      '<div class="panel"><h2>Loot setting</h2><p class="small muted">When you are away, the game rolls for you this way when a chest closes.</p><div class="seg" style="margin-top:8px">' + [['upgrades', 'Need on upgrades, greed on the rest'], ['greed', 'Greed on everything'], ['pass', 'Pass on everything']].map(([v, n]) => '<button class="' + (h.lootPolicy === v ? 'on' : '') + '" data-act="lootPolicy" data-v="' + v + '">' + n + '</button>').join('') + '</div></div></div>';
  }

  function drawCurve(cv) {
    const d = JSON.parse(cv.dataset.curve); cv.removeAttribute('data-curve');
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const pts = (p) => (d.k * p) / ((1 - p) ** 2);
    const curve = (x) => { if (x <= 0) return 0; const b = 2 * x + d.k; return (b - Math.sqrt(b * b - 4 * x * x)) / (2 * x); };
    const maxX = Math.max(pts(0.75), d.p * 1.3), Y = (p) => H - 8 - p * (H - 16);
    g.fillStyle = '#120812'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#3e2b4d'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(0, Y(0.5)); g.lineTo(W, Y(0.5)); g.stroke(); g.setLineDash([]);
    g.beginPath(); for (let x = 0; x <= W; x++) { const p = Math.min(d.cap, curve((x / W) * maxX)) * (d.half ? 0.5 : 1); if (x) g.lineTo(x, Y(p)); else g.moveTo(x, Y(p)); }
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = 'rgba(255,138,42,0.15)'; g.fill();
    g.beginPath(); for (let x = 0; x <= W; x++) { const p = Math.min(d.cap, curve((x / W) * maxX)) * (d.half ? 0.5 : 1); if (x) g.lineTo(x, Y(p)); else g.moveTo(x, Y(p)); }
    g.strokeStyle = '#ff8a2a'; g.lineWidth = 2; g.stroke();
    const me = Math.min(d.cap, curve(d.p)) * (d.half ? 0.5 : 1), mx = Math.min(W - 4, (d.p / maxX) * W);
    g.fillStyle = '#7be07f'; g.beginPath(); g.arc(mx, Y(me), 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#120812'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#f4ead8'; g.font = '13px "Lilita One", sans-serif'; g.fillText(pct(me), Math.min(W - 44, mx + 8), Math.max(14, Y(me) - 6));
    g.fillStyle = '#8a7a98'; g.font = '11px Nunito, sans-serif'; g.fillText('50%', 4, Y(0.5) - 4);
  }

  // ------------------------------------------------------------------ skills

  function skillsView() {
    const h = S.st.hero, cfg = S.cfg;
    const inLoadout = new Set(h.loadout), byId = Object.fromEntries(h.skills.map((s) => [s.id, s]));
    const ult = h.skills.find((s) => s.source === 'ultimate');
    const bar = h.loadout.map((id) => byId[id]).filter(Boolean).map((s) => '<div class="aslot">' + skillIcon(s, s.rank) + esc(s.name) + '</div>').join('') +
      Array.from({ length: Math.max(0, cfg.loadoutSize - h.loadout.length) }, () => '<div class="aslot"><span class="sk empty">+</span>Empty</div>').join('') +
      (ult ? '<div class="aslot">' + (ult.unlocked ? skillIcon(ult, ult.rank) : '<span class="sk empty">' + ico('lock') + '</span>') + '<span class="gold">' + esc(ult.name) + '</span></div>' : '');
    const card = (s) => {
      const locked = !s.unlocked, isUlt = s.source === 'ultimate';
      const src = s.source === 'core' ? '' : isUlt ? '<span class="chip gold">Ultimate</span>' : '<span class="chip">' + esc(cfg.classes[h.cls].paths[s.source][0]) + ' path</span>';
      return '<div class="panel tight skill' + (locked ? ' locked' : '') + '">' + skillIcon(s) + '<div class="info"><div class="row between"><b class="' + (inLoadout.has(s.id) ? 'gold' : '') + '">' + esc(s.name) + '</b>' + src + '</div>' +
        '<div class="small muted">' + (locked ? ico('lock') + ' Unlocks at level ' + s.level + (s.source !== 'core' && !isUlt ? ' on this Path' : '') : cap(s.type)) + (s.cost ? ' · ' + s.cost + ' ' + cfg.classes[h.cls].resource : '') + (s.cd ? ' · ' + s.cd + 's cooldown' : '') + '</div>' +
        '<div class="small">' + esc(skillText(s)) + ' Each rank adds strength.</div><div class="row"><span class="pips">' + Array.from({ length: cfg.maxSkillRank }, (_, k) => '<i class="' + (k < s.rank ? 'on' : '') + '"></i>').join('') + '</span><span class="tiny muted">Rank ' + s.rank + '/' + cfg.maxSkillRank + '</span></div></div>' +
        (locked ? '' : '<div class="row act">' + (isUlt ? '<span class="small muted">Always slotted</span>' : '<button class="small ' + (inLoadout.has(s.id) ? 'on' : '') + '" data-act="slot" data-id="' + s.id + '">' + (inLoadout.has(s.id) ? 'In loadout' : 'Add to loadout') + '</button>') + '<button class="small" data-act="rankUp" data-id="' + s.id + '" ' + (h.skillPoints > 0 && s.rank < cfg.maxSkillRank ? '' : 'disabled') + '>Rank up</button></div>') + '</div>';
    };
    return '<div class="stack"><div class="panel"><div class="head"><h2>Loadout</h2><div class="row"><span class="num" style="font-size:1.2rem"><span class="gold">' + h.skillPoints + '</span> <span class="muted small">skill points</span></span><button class="small" data-act="resetRanks">Reset ranks (' + 10 * h.level + 'g)</button></div></div>' +
      '<p class="small muted" style="margin-bottom:12px">One skill point per level. Your loadout holds ' + cfg.loadoutSize + ' skills, and your ultimate joins it at level ' + cfg.ultimateLevel + '.</p><div class="actionbar">' + bar + '</div></div>' +
      '<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))">' + h.skills.map(card).join('') + '</div></div>';
  }

  // ------------------------------------------------------------------ gear

  function gearView() {
    const h = S.st.hero, inv = S.st.inventory, cfg = S.cfg;
    const worn = {}; inv.forEach((i) => { if (i.equipped) worn[i.equipped] = i; });
    const slotTile = (s) => tile(worn[s], { label: cfg.slots[s][0], sel: worn[s] && S.sel === worn[s].id });
    const doll = '<div class="doll"><div class="col">' + ['head', 'top', 'bottom', 'shoes', 'cape'].map(slotTile).join('') + '</div>' +
      '<div class="mid"><div class="stage">' + spr(h.look, 3, 'idle') + '</div><div class="bottomrow">' + ['weapon', 'offhand'].map(slotTile).join('') + '</div></div>' +
      '<div class="col">' + ['gloves', 'ring1', 'ring2', 'amulet', 'trinket'].map(slotTile).join('') + '</div></div>';
    const bag = inv.filter((i) => !i.equipped && i.price == null);
    const res = h.resonance;
    const resTxt = Object.entries(res.counts).map(([t, n]) => '<div class="row small"><span class="sock" style="background:' + cfg.glyphs[t][2] + '"></span><b>' + cfg.glyphs[t][0] + '</b> ' + n + '/9' + (res.tiers[t] ? '<span class="chip gold">tier ' + res.tiers[t] + '</span><span>' + esc(cfg.glyphs[t][3]) + '</span>' : '') + '</div>').join('') || '<p class="small muted">Socket 3, 6 or 9 glyphs of one theme to wake its Resonance.</p>';
    const sel = inv.find((i) => i.id === S.sel);
    const cost = S.craftCost;
    return '<div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr))"><div class="stack"><div class="panel"><div class="head"><h2>Worn</h2><span class="small muted">Nothing binds. Wear, trade or sell anything.</span></div>' + doll + '</div>' +
      '<div class="panel"><h3>Resonance</h3>' + resTxt + '</div>' +
      '<div class="panel"><div class="head"><h3>Craft</h3><span class="small muted">Item level ' + 2 * h.level + '. Usually common, sometimes rare, rarely epic.</span></div><div class="row"><select id="craftSlot" aria-label="Slot">' + Object.keys(cfg.slots).filter((s) => s !== 'ring2').map((s) => '<option value="' + s + '">' + cfg.slots[s][0] + '</option>').join('') + '</select><button class="primary" data-act="craft">Craft' + (cost ? ' · ' + fmt(cost.gold) + 'g · ' + cost.materials + ' mats' : '') + '</button></div></div></div>' +
      '<div class="stack">' + (sel ? itemDetail(sel, worn) : '<div class="panel muted">Pick an item to see what you can do with it.</div>') +
      '<div class="panel"><div class="head"><h2>Bag</h2><span class="muted small">' + bag.length + ' items</span></div><div class="bag">' + bag.map((i) => tile(i, { sel: S.sel === i.id, up: i.score != null && betterThanWorn(i, worn) })).join('') + '</div>' + (bag.length ? '' : '<p class="muted">Empty. Loot comes from the group chest, crafting and the market.</p>') + '</div></div></div>';
  }
  function betterThanWorn(i, worn) {
    if (i.slot === 'glyph') return false;
    const targets = i.slot === 'ring1' ? ['ring1', 'ring2'] : [i.slot];
    const scores = targets.map((s) => (worn[s] ? worn[s].score : -1));
    return i.score > Math.min(...scores);
  }
  function itemDetail(i, worn) {
    const h = S.st.hero, cfg = S.cfg, bagGlyphs = S.st.inventory.filter((x) => x.slot === 'glyph' && !x.equipped && x.price == null);
    let compare = '';
    if (i.slot !== 'glyph' && !i.equipped) {
      const w = worn[i.slot] || (i.slot === 'ring1' ? worn.ring2 : null);
      compare = w ? '<div class="small">Compared with ' + esc(w.name) + ': <b class="' + (i.score >= w.score ? 'good' : 'bad') + '">' + (i.score >= w.score ? '+' : '') + (i.score - w.score).toFixed(1) + '</b> rating for a ' + cfg.classes[h.cls].name + '</div>' : '<div class="small good">That slot is empty.</div>';
    }
    let actions = '';
    if (i.slot === 'glyph') actions += '<p class="small muted">Pick a worn item with an empty socket, then use Socket there.</p>';
    else {
      actions += i.equipped ? '<button data-act="item" data-a="unequip" data-id="' + i.id + '">Take off</button>' : '<button class="primary" data-act="item" data-a="equip" data-id="' + i.id + '">Wear</button>';
      actions += '<button data-act="item" data-a="temper" data-id="' + i.id + '" title="+3% to everything on the item per step">Temper to +' + (i.temper + 1) + '</button>';
      if (h.codexPowers.length) actions += '<select id="imprintPower" aria-label="Codex power">' + h.codexPowers.map((p) => '<option value="' + p + '">' + esc(cfg.powers[p][0]) + '</option>').join('') + '</select><button data-act="imprint" data-id="' + i.id + '">Imprint (20 essence)</button>';
      if (h.level >= cfg.reforgeLevel && i.affixes.length) actions += '<select id="reforgeAffix" aria-label="Affix">' + i.affixes.map(([a], k) => '<option value="' + k + '">' + attrName(a) + '</option>').join('') + '</select>→<select id="reforgeAttr" aria-label="New attribute">' + Object.keys(cfg.attributes).map((a) => '<option value="' + a + '">' + attrName(a) + '</option>').join('') + '</select><button data-act="reforge" data-id="' + i.id + '">Reforge</button>';
    }
    let sock = '';
    if (i.sockets) {
      sock = '<div><h4>Sockets</h4>' + i.glyphs.map((g, k) => g ? '<div class="row small"><span class="sock" style="background:' + cfg.glyphs[g[0]][2] + '"></span>' + cfg.glyphs[g[0]][0] + ' +' + g[1] + ' <button class="small" data-act="item" data-a="unsocket" data-id="' + i.id + '" data-socket="' + k + '">Take out</button></div>' : '<div class="row small"><span class="sock"></span>Empty ' + (bagGlyphs.length ? '<select id="glyph' + k + '" aria-label="Glyph">' + bagGlyphs.map((x) => '<option value="' + x.id + '">' + esc(x.name) + ' +' + x.value + '</option>').join('') + '</select><button class="small" data-act="socket" data-id="' + i.id + '" data-socket="' + k + '">Socket</button>' : '<span class="muted">(no glyphs in your bag)</span>') + '</div>').join('') + '</div>';
    }
    const trade = i.equipped ? '' : '<hr><div class="row"><input id="giveTo" placeholder="Hero name" style="width:140px" aria-label="Give to"><button data-act="give" data-id="' + i.id + '">Give</button></div><div class="row" style="margin-top:8px"><input id="sellPrice" type="number" min="1" placeholder="Price" style="width:110px" aria-label="Price"><button data-act="sell" data-id="' + i.id + '">Sell on market</button><button class="danger" data-act="salvage" data-id="' + i.id + '">Salvage</button></div>';
    return '<div class="panel stack tight">' + itemCard(i) + compare + '<div class="row">' + actions + '</div>' + sock + trade + '</div>';
  }

  // ------------------------------------------------------------------ group and tavern

  function memberCard(m, extra) {
    return '<div class="panel tight member">' + por(m.look) + '<div style="flex:1;min-width:0"><b>' + esc(m.name) + '</b><div class="row" style="gap:6px"><span class="small muted">Lv ' + m.level + ' ' + className(m.cls) + '</span>' + role(m.role) + '</div>' + (extra || '') + '</div></div>';
  }
  function groupView() {
    const st = S.st, h = st.hero, p = st.party, tv = S.tavern;
    let mine = '';
    if (p) {
      const lead = p.leader === h.id;
      const reqs = p.requests.map((r) => '<div class="row small">' + (r.kind === 'application' ? '<b>' + esc(r.hero.name) + '</b> (Lv ' + r.hero.level + ' ' + className(r.hero.cls) + ') wants to join' + (r.message ? ': “' + esc(r.message) + '”' : '') + (lead ? ' <button class="small primary" data-act="answer" data-id="' + r.id + '" data-a="accept">Accept</button><button class="small" data-act="answer" data-id="' + r.id + '" data-a="decline">Decline</button>' : '') : 'Invited <b>' + esc(r.hero.name) + '</b>, waiting for an answer') + '</div>').join('');
      mine = '<div class="camp" style="text-align:left"><div class="head"><div><div class="eyebrow">Your group</div><h1>' + esc(p.name) + '</h1></div><span class="chip gold">' + p.battlesTogether + ' runs together · bond +' + Math.min(10, p.battlesTogether) + '% XP</span></div>' +
        '<div class="lineup">' + p.members.map((m) => '<div class="seat">' + spr(m.look, 1.5, 'idle') + '<b>' + esc(m.name) + '</b><span class="row" style="gap:4px;justify-content:center">' + role(m.role) + (m.id === p.leader ? '<span class="chip gold">Leader</span>' : '') + '</span>' + (lead && m.id !== h.id ? '<button class="small danger" data-act="kick" data-id="' + m.id + '">Remove</button>' : '') + '</div>').join('') +
        Array.from({ length: S.cfg.partySize - p.members.length }, () => '<div class="seat"><div class="empty">Open seat</div></div>').join('') + '</div></div>' +
        '<div class="panel stack tight">' + (reqs ? '<div>' + reqs + '</div>' : '') +
        (lead ? '<div class="row"><label style="margin:0" for="offset">Dungeon level</label><select id="offset" data-act-change="offset">' + [-3, -2, -1, 0, 1, 2, 3, 4, 5].map((o) => '<option value="' + o + '"' + (o === p.dungeonOffset ? ' selected' : '') + '>' + (o > 0 ? '+' : '') + o + (o === 0 ? ' (median level)' : '') + '</option>').join('') + '</select><span class="small muted">Now level ' + p.dungeonLevel + '. Higher is harder, with more XP and better item levels.</span></div>' +
          '<div class="row"><button data-act="running">' + (p.running ? 'Rest after this run' : 'Send the group back in') + '</button>' + (p.members.length < S.cfg.partySize ? '<input id="inviteName" placeholder="Invite hero by name" style="width:180px" aria-label="Hero name"><button data-act="invite">Invite</button><button data-act="postLfm">Post on the tavern board</button>' : '') + '</div>' : '<p class="small muted">The leader picks the dungeon level and when to rest.</p>') +
        '<div><button class="danger small" data-act="leaveParty">Leave group</button></div></div>';
    } else {
      mine = '<div class="panel stack tight"><h2>You are not in a group</h2><p class="small">A group is five real heroes who picked each other. Runs continue while you are away, up to the offline limit, until the group wipes. Loot is shared through the group chest.</p><div class="row"><input id="partyName" placeholder="Group name" style="width:220px" aria-label="Group name"><button class="primary" data-act="createParty">Start a group</button></div>' +
        '<div class="row"><input id="lfgText" placeholder="Say what you bring, e.g. steady healer, evenings" style="flex:1;min-width:200px" aria-label="Your post"><button data-act="postLfg">Post that I am looking</button></div></div>' +
        (st.invites.length ? '<div class="panel"><h3>Invites</h3>' + st.invites.map((r) => '<div class="row">' + (r.kind === 'invite' ? '<b>' + esc(r.party.name) + '</b> (' + r.party.size + '/5) invited you' + (r.message ? ': “' + esc(r.message) + '”' : '') + ' <button class="small primary" data-act="answer" data-id="' + r.id + '" data-a="accept">Join</button><button class="small" data-act="answer" data-id="' + r.id + '" data-a="decline">No thanks</button>' : 'You asked to join <b>' + esc(r.party.name) + '</b>, waiting for the leader <button class="small" data-act="answer" data-id="' + r.id + '" data-a="decline">Withdraw</button>') + '</div>').join('') + '</div>' : '');
    }
    const lead = p && p.leader === h.id;
    let board = '<div class="panel"><h2>Tavern board</h2><p class="muted">Loading…</p></div>';
    if (tv) {
      const lfm = tv.posts.filter((x) => x.kind === 'lfm'), lfg = tv.posts.filter((x) => x.kind === 'lfg');
      board = '<div class="panel stack"><div class="head"><h2>Tavern board</h2><button class="small" data-act="reloadTavern">Refresh</button></div>' +
        '<h4>Groups looking for heroes</h4><div class="cards">' + (lfm.map((x) => '<div class="panel tight post"><div class="head"><b class="num" style="font-size:1.1rem">' + esc(x.party ? x.party.name : '') + '</b><span class="small muted">' + (x.party ? x.party.members.length : 0) + '/5</span></div><div class="minis">' + (x.party ? x.party.members.map((m) => spr(m.look, 0.75)).join('') : '') + '</div><q>' + esc(x.text) + '</q><div class="row">wants ' + x.roles.map(role).join('') + '</div><div class="row">' + (!p ? '<button class="small primary" data-act="apply" data-id="' + x.party.id + '">Ask to join</button>' : '') + (x.author.id === h.id ? '<button class="small" data-act="unpost" data-id="' + x.id + '">Remove</button>' : '') + '</div></div>').join('') || '<p class="small muted">No groups posted right now.</p>') + '</div>' +
        '<h4>Heroes looking for a group</h4><div class="cards">' + (lfg.map((x) => memberCard(x.author, '<q class="small">' + esc(x.text) + '</q>' + (lead ? '<div style="margin-top:6px"><button class="small primary" data-act="inviteId" data-id="' + x.author.id + '">Invite</button></div>' : '') + (x.author.id === h.id ? '<div style="margin-top:6px"><button class="small" data-act="unpost" data-id="' + x.id + '">Remove</button></div>' : ''))).join('') || '<p class="small muted">Nobody posted.</p>') + '</div>' +
        (lead && tv.freeHeroes.length ? '<h4>Other heroes without a group</h4><div class="cards">' + tv.freeHeroes.map((x) => memberCard(x, '<div style="margin-top:6px"><button class="small" data-act="inviteId" data-id="' + x.id + '">Invite</button></div>')).join('') + '</div>' : '') + '</div>';
    }
    return '<div class="stack">' + mine + board + '</div>';
  }

  // ------------------------------------------------------------------ guild

  function guildView() {
    const g = S.guilds;
    if (!g) return '<div class="panel muted">Loading…</div>';
    if (g.mine) {
      const m = g.mine;
      return '<div class="stack"><div class="panel banner-head"><div class="crest">' + esc(m.tag) + '</div><div class="stack tight"><div class="eyebrow">Guild level ' + m.level + ' · ' + m.size + '/' + m.max + ' members</div><h1>' + esc(m.name) + '</h1><p class="muted"><q>' + esc(m.motto) + '</q></p><p class="small muted">Guild XP comes from every run by every member. Guild levels unlock looks, never combat power.</p><div><button class="small danger" data-act="leaveGuild">Leave guild</button></div></div></div>' +
        '<div class="panel"><h2>Members</h2><div class="cards">' + m.members.map((x) => memberCard(x, '<div class="row" style="gap:6px;margin-top:4px">' + (x.rank === 'leader' ? '<span class="chip gold">Leader</span>' : '') + '<span class="tiny muted">' + (x.party ? 'In a group' : 'Looking for a group') + '</span></div>')).join('') + '</div></div></div>';
    }
    return '<div class="stack"><div class="panel"><h2>Guilds</h2><p class="small" style="margin-bottom:10px">Guilds are where people meet, chat and form groups. Join one, or found your own for 100 gold.</p><div class="cards">' +
      g.all.map((x) => '<div class="panel tight banner-head" style="grid-template-columns:auto minmax(0,1fr)"><div class="crest" style="width:52px;height:64px;font-size:1rem">' + esc(x.tag) + '</div><div class="stack tight"><b class="num" style="font-size:1.1rem">' + esc(x.name) + '</b><span class="small muted">Level ' + x.level + ' · ' + x.size + '/' + x.max + '</span><span class="small">' + esc(x.motto) + '</span><div><button class="small primary" data-act="joinGuild" data-id="' + x.id + '">Join</button></div></div></div>').join('') + '</div></div>' +
      '<div class="panel"><h3>Found a guild</h3><div class="row"><input id="gName" placeholder="Name" style="width:200px" aria-label="Guild name"><input id="gTag" placeholder="Tag" maxlength="4" style="width:80px" aria-label="Tag"><input id="gMotto" placeholder="Motto" style="flex:1;min-width:160px" aria-label="Motto"><button class="primary" data-act="createGuild">Found (100g)</button></div></div></div>';
  }

  // ------------------------------------------------------------------ market

  function marketView() {
    const cfg = S.cfg, f = S.marketFilter, h = S.st.hero;
    const mine = S.st.inventory.filter((i) => i.price != null);
    const list = S.market == null ? '<p class="muted">Loading…</p>' : S.market.filter((i) => i.owner && i.owner.id !== h.id).map((i) => itemCard(i, '<div class="row between"><span class="small muted">Sold by ' + esc(i.owner.name) + '</span><button class="small primary" data-act="buy" data-id="' + i.id + '" ' + (h.gold >= i.price ? '' : 'disabled') + '>Buy</button></div>')).join('') || '<p class="muted">Nothing listed.</p>';
    return '<div class="stack"><div class="panel"><div class="head"><h2>Market</h2><div class="row"><select data-act-change="mSlot" aria-label="Slot"><option value="">All slots</option>' + Object.keys(cfg.slots).filter((s) => s !== 'ring2').map((s) => '<option value="' + s + '"' + (f.slot === s ? ' selected' : '') + '>' + cfg.slots[s][0] + '</option>').join('') + '<option value="glyph"' + (f.slot === 'glyph' ? ' selected' : '') + '>Glyphs</option></select><select data-act-change="mRarity" aria-label="Rarity"><option value="">Any rarity</option>' + Object.keys(cfg.rarities).map((r) => '<option value="' + r + '"' + (f.rarity === r ? ' selected' : '') + '>' + rarityName(r) + '</option>').join('') + '</select></div></div><p class="small muted" style="margin-bottom:12px">Every item can be traded, legendaries included. Sell from the Gear page.</p><div class="market">' + list + '</div></div>' +
      (mine.length ? '<div class="panel"><h3>Your listings</h3><div class="market">' + mine.map((i) => itemCard(i, '<button class="small" data-act="item" data-a="unlist" data-id="' + i.id + '">Take back</button>')).join('') + '</div></div>' : '') + '</div>';
  }

  // ------------------------------------------------------------------ chat

  function chatView() {
    const chans = S.st.channels, ch = chans[S.chat.channel] ? S.chat.channel : 'tavern';
    S.chat.channel = ch;
    const msgs = (S.chat.msgs[ch] || []).map((m) => {
      const card = m.card && m.card.type === 'item' && m.card.spec ? ' <span class="card r-' + m.card.spec.rarity + '"><img class="ico" alt="" src="' + ITA.icon(m.card.spec) + '">' + esc(itemName(m.card.spec)) + '</span>' : '';
      return m.author ? '<div class="msg"><span class="a">' + esc(m.author.name) + '</span>' + esc(m.body) + card + '</div>' : '<div class="msg sys">' + esc(m.body) + card + '</div>';
    }).join('');
    return '<div class="chat-tabs">' + Object.entries(chans).map(([id, n]) => '<button class="' + (id === ch ? 'on' : '') + '" data-act="chan" data-id="' + id + '">' + n + '</button>').join('') + '<button class="small chat-close" data-act="toggleChat" aria-label="Close chat">✕</button></div><div class="msgs">' + (msgs || '<p class="muted small">Nothing said yet.</p>') + '</div><form class="chat-in" data-form="chat"><input id="chatBody" name="body" maxlength="500" placeholder="Say something" autocomplete="off" aria-label="Message"><button type="submit">Send</button></form>';
  }
  async function pollChat() {
    const ch = S.chat.channel;
    try {
      const after = S.chat.last[ch] || 0;
      const list = await get('/chat?channel=' + encodeURIComponent(ch) + '&after=' + after);
      if (list.length) {
        S.chat.msgs[ch] = [...(S.chat.msgs[ch] || []), ...list].slice(-150);
        S.chat.last[ch] = list[list.length - 1].id;
        const box = $('.msgs');
        const atBottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
        const side = $('.side');
        if (side) { keepInputs(side, () => { side.innerHTML = chatView(); }); const b2 = $('.msgs'); if (atBottom && b2) b2.scrollTop = b2.scrollHeight; }
      }
    } catch (e) { /* channel may have closed */ }
  }

  // ------------------------------------------------------------------ events

  const handlers = {
    authMode: (d) => { S.authMode = d.mode; render(); },
    cstep: (d) => { const c = creatorState(); c.name = $('#cname').value; S.creatorStep = d.s; render(); },
    pick: (d) => { const c = creatorState(); c[d.kind] = d.id; if (d.kind === 'race') c.look.skin = ITP.RACES[d.id].skins[1]; c.name = $('#cname').value; render(); },
    look: (d) => { const c = creatorState(); c.look[d.key] = isNaN(+d.v) || d.v.startsWith('#') ? d.v : +d.v; c.name = $('#cname').value; render(); },
    randomLook: () => { const c = creatorState(), r = ITP.randomHero(); c.name = $('#cname').value; Object.assign(c.look, { skin: ITP.RACES[c.race].skins[Math.floor(Math.random() * ITP.RACES[c.race].skins.length)], hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, eyeColor: r.eyeColor, mouth: r.mouth, beard: r.beard, acc: r.acc, build: r.build, height: r.height, dye1: r.dye1, dye2: r.dye2, metal: r.metal }); render(); },
    create: async () => { const c = creatorState(); c.name = $('#cname').value.trim(); if (!c.name) { toast('Give your hero a name first.'); $('#cname').focus(); return; } try { await post('/hero', c); S.creator = null; location.hash = '#/hero'; await refresh(); toast('Welcome, ' + c.name + '! Head to the Group page to find your party.', true); } catch (e) { toast(e.message); } },
    logout: async () => {
      if (window.IT_SERVER && !S.sureNew) { confirmBox('Start over with a new hero? This clears your saved game in this browser.', () => { S.sureNew = true; handlers.logout(); }); return; }
      S.sureNew = false;
      await post('/logout').catch(() => null);
      if (window.IT_SERVER) { location.hash = ''; location.reload(); return; }
      S.st = null; S.chat = { channel: 'tavern', msgs: {}, last: {} }; render();
    },
    toggleChat: () => { S.chatOpen = !S.chatOpen; render(); },
    chan: (d) => { S.chat.channel = d.id; S.chatJump = true; render(); pollChat(); },
    modalYes: () => { const f = S.modalYes; closeModal(); if (f) f(); },
    closeModal,
    // hero
    spend: (d) => act(() => post('/hero/act', { action: 'spend', points: { [d.a]: +d.n } })),
    autoSpend: () => act(() => post('/hero/act', { action: 'autoSpend' })),
    attrOpen: (d) => { S.attrOpen = S.attrOpen === d.a ? null : d.a; render(); },
    lootPolicy: (d) => act(() => post('/hero/act', { action: 'lootPolicy', policy: d.v }), 'Saved.'),
    path: (d) => act(() => post('/hero/act', { action: 'path', path: d.id }), 'Path chosen. You can still change it until the Oath.'),
    keystone: (d) => confirmBox('Take <b>' + esc(S.cfg.keystones[S.st.hero.role][d.id][0]) + '</b> as your level ' + d.l + ' Keystone? This is permanent.', () => act(() => post('/hero/act', { action: 'keystone', level: +d.l, keystone: d.id }), 'Keystone chosen.')),
    rankUp: (d) => act(() => post('/hero/act', { action: 'rankUp', skill: d.id })),
    resetRanks: () => confirmBox('Reset all skill ranks for ' + 10 * S.st.hero.level + ' gold?', () => act(() => post('/hero/act', { action: 'resetRanks' }))),
    slot: (d) => { let l = S.st.hero.loadout.slice(); l = l.includes(d.id) ? l.filter((x) => x !== d.id) : [...l, d.id]; if (l.length > S.cfg.loadoutSize) { toast('Your loadout holds ' + S.cfg.loadoutSize + ' skills. Take one out first.'); return; } act(() => post('/hero/act', { action: 'loadout', skills: l })); },
    // gear
    sel: async (d) => { S.sel = +d.id; if (S.view !== 'gear') location.hash = '#/gear'; if (!S.craftCost) S.craftCost = await get('/craft/cost').catch(() => null); render(); },
    item: (d) => act(() => post('/item/' + d.id + '/' + d.a, { socket: d.socket != null ? +d.socket : undefined })),
    socket: (d) => act(() => post('/item/' + d.id + '/socket', { socket: +d.socket, glyph: +$('#glyph' + d.socket).value }), 'Glyph socketed.'),
    imprint: (d) => act(() => post('/item/' + d.id + '/imprint', { power: $('#imprintPower').value }), 'Imprinted.'),
    reforge: (d) => act(() => post('/item/' + d.id + '/reforge', { affix: +$('#reforgeAffix').value, attr: $('#reforgeAttr').value }), 'Reforged.'),
    salvage: (d) => confirmBox('Salvage this item for essence and materials? Socketed glyphs come back to your bag.', async () => { const r = await act(() => post('/item/' + d.id + '/salvage')); if (r) { S.sel = null; toast('+' + r.result.essence + ' essence, +' + r.result.materials + ' materials', true); } }),
    give: (d) => { const to = $('#giveTo').value.trim(); if (to) act(() => post('/item/' + d.id + '/give', { to }), 'Given to ' + to + '.').then(() => { S.sel = null; }); },
    sell: (d) => { const price = +$('#sellPrice').value; act(() => post('/item/' + d.id + '/sell', { price }), 'Listed on the market.'); },
    craft: async () => { const it = await act(() => post('/craft', { slot: $('#craftSlot').value }), null); if (it) { S.sel = it.id; toast('Crafted ' + it.name + ' (' + rarityName(it.rarity) + ')', true); S.craftCost = await get('/craft/cost').catch(() => null); render(); } },
    buy: (d) => act(() => post('/market/' + d.id + '/buy'), 'Bought. It is in your bag.').then(loadMarket),
    // group
    createParty: () => act(() => post('/party/create', { name: $('#partyName').value }), 'Group started. Invite people or post on the tavern board.').then(reloadTavern),
    leaveParty: () => confirmBox('Leave your group?', () => act(() => post('/party/leave')).then(reloadTavern)),
    kick: (d) => confirmBox('Remove this hero from the group?', () => act(() => post('/party/kick', { hero: +d.id }))),
    running: () => act(() => post('/party/settings', { running: !S.st.party.running })),
    resume: () => act(() => post('/party/resume', {}), 'The group heads back in.'),
    invite: () => act(() => post('/party/invite', { name: $('#inviteName').value }), 'Invite sent.').then(reloadTavern),
    inviteId: (d) => act(() => post('/party/invite', { hero: +d.id }), 'Invite sent.').then(reloadTavern),
    apply: (d) => act(() => post('/party/apply', { party: +d.id }), 'Request sent.').then(reloadTavern),
    answer: (d) => act(() => post('/request/' + d.id + '/' + d.a)).then(reloadTavern),
    postLfm: () => modal('<h3>Post on the tavern board</h3><label for="lfmText">What are you looking for?</label><input id="lfmText" style="width:100%" placeholder="e.g. healer for evening runs"><label>Roles</label><div class="row">' + ['tank', 'healer', 'dps'].map((r) => '<label style="margin:0;text-transform:none;letter-spacing:0"><input type="checkbox" class="lfmRole" value="' + r + '" checked> ' + ROLE[r] + '</label>').join('') + '</div><div class="row"><button class="primary" data-act="postLfmGo">Post</button><button data-act="closeModal">Cancel</button></div>'),
    postLfmGo: () => { const roles = [...document.querySelectorAll('.lfmRole:checked')].map((x) => x.value); const text = $('#lfmText').value; closeModal(); act(() => post('/tavern', { kind: 'lfm', text, roles }), 'Posted.').then(reloadTavern); },
    postLfg: () => act(() => post('/tavern', { kind: 'lfg', text: $('#lfgText').value }), 'Posted on the tavern board.').then(reloadTavern),
    unpost: (d) => act(() => api('DELETE', '/tavern/' + d.id)).then(reloadTavern),
    reloadTavern: () => reloadTavern(),
    // guild
    joinGuild: (d) => act(() => post('/guild/' + d.id + '/join'), 'Welcome to the guild!').then(reloadGuilds),
    leaveGuild: () => confirmBox('Leave your guild?', () => act(() => post('/guild/leave')).then(reloadGuilds)),
    createGuild: () => act(() => post('/guild/create', { name: $('#gName').value, tag: $('#gTag').value, motto: $('#gMotto').value }), 'Guild founded.').then(reloadGuilds),
    // chest
    roll: (d) => act(() => post('/battle/' + d.b + '/roll', { idx: +d.i, choice: d.c })).then(loadBattle),
  };
  async function reloadTavern() { S.tavern = await get('/tavern').catch(() => S.tavern); render(); }
  async function reloadGuilds() { S.guilds = await get('/guilds').catch(() => S.guilds); render(); }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    const a = el.dataset.actChange;
    if (a === 'offset') act(() => post('/party/settings', { dungeonOffset: +el.value }), 'The next run uses the new level.');
    if (a === 'mSlot') { S.marketFilter.slot = el.value; loadMarket(); }
    if (a === 'mRarity') { S.marketFilter.rarity = el.value; loadMarket(); }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    if (f.dataset.form === 'chat') {
      if (!data.body.trim()) return;
      try { await post('/chat', { channel: S.chat.channel, body: data.body }); f.reset(); S.chatJump = true; await pollChat(); const b = $('.msgs'); if (b) b.scrollTop = b.scrollHeight; const inp = $('#chatBody'); if (inp) { inp.value = ''; inp.focus(); } } catch (err) { toast(err.message); }
      return;
    }
    try { await post('/' + f.dataset.form, data); await refresh(); loadView(); } catch (err) { toast(err.message); }
  });

  boot().catch((e) => { $('#app').innerHTML = '<div class="boot">Could not reach the server: ' + esc(e.message) + '</div>'; });
})();
