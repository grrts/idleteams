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
    [S.cfg, S.lore] = await Promise.all([get('/config'), get('/lore').catch(() => null)]);
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
    // Mid-drag on a map: wait, so the page does not move under the finger.
    if (S.mapDrag) { S.renderPending = true; return; }
    S.renderPending = false;
    const app = $('#app');
    const keepScroll = $('.msgs') ? $('.msgs').scrollTop : null;
    keepInputs(app, () => {
      if (!S.st) app.innerHTML = authView();
      else if (!S.st.hero) app.innerHTML = creatorView();
      else app.innerHTML = shell();
    });
    hydrate(app);
    mountMaps();
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

  // ------------------------------------------------------------------ lore

  // The lore book (GET /lore): every pack merged, entries keyed "kind:id". Each choice in the game has a key, so
  // showing lore is a lookup: loreKey('answer', race, question, index) and so on. Missing entries show nothing.
  const loreKey = (kind, ...parts) => kind + ':' + parts.join('.');
  const lore = (key) => (S.lore && S.lore.entries[key]) || null;
  const loreShelf = (key) => (S.lore && S.lore.shelves[key.split(':')[0]]) || { title: '' };
  const loreLink = (key, label, cls) => (lore(key) ? '<a href="#" class="' + (cls || 'lorelink') + '" data-act="lore" data-k="' + esc(key) + '">' + esc(label || lore(key).title) + '</a>' : esc(label || ''));
  // Lore text links to other entries as [[kind:id]] or [[kind:id|words]].
  const LINK = /\[\[([a-z]+:[A-Za-z0-9_.-]+)(?:\|([^\]]*))?\]\]/g;
  const loreText = (t) => esc(t).replace(LINK, (m, key, label) => loreLink(key, label));
  const lorePlain = (t) => String(t || '').replace(LINK, (m, key, label) => label || (lore(key) ? lore(key).title : key));
  const packName = (id) => (S.lore.packs[id] || { name: id }).name;
  const corePack = (id) => !S.lore.packs[id] || S.lore.packs[id].core;

  function loreEntry(key) {
    const e = lore(key);
    if (!e) return '<p class="muted">Nothing is written about this yet. More of the world comes with every expansion.</p>';
    const shelf = loreShelf(key), sections = e.sections || [];
    const extra = (e.packs || []).filter((p) => !corePack(p));
    return '<article class="loreentry"><div class="eyebrow">' + esc(shelf.title) + (e.kicker ? ' · ' + esc(e.kicker) : '') + '</div><h2>' + esc(e.title || shelf.title) + '</h2>' +
      '<p class="lede">' + loreText(e.summary) + '</p>' +
      (e.facts && e.facts.length ? '<dl class="lorefacts">' + e.facts.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + loreText(v) + '</dd>').join('') + '</dl>' : '') +
      sections.map((s) => '<section><h4>' + esc(s.title) + (corePack(s.pack) ? '' : ' <span class="chip gold">' + esc(packName(s.pack)) + '</span>') + '</h4><p>' + loreText(s.text) + '</p></section>').join('') +
      (e.quote ? '<blockquote class="lorequote">“' + esc(e.quote[0]) + '”' + (e.quote[1] ? '<cite>' + esc(e.quote[1]) + '</cite>' : '') + '</blockquote>' : '') +
      (e.see && e.see.length ? '<div class="loresee"><span class="eyebrow">See also</span>' + e.see.filter(lore).map((k) => loreLink(k, null, 'chip lorechip')).join('') + '</div>' : '') +
      (extra.length ? '<p class="tiny muted">Expanded in ' + extra.map((p) => esc(packName(p))).join(', ') + '.</p>' : '') + '</article>';
  }
  // A short card for one choice: what the lore book says, a few facts and a way into the full entry.
  function loreCard(key, opts = {}) {
    const e = lore(key);
    if (!e) return '';
    const first = (e.sections || [])[0];
    return '<div class="lorecard"><div class="row between"><span class="eyebrow">' + ico('lore') + ' From the lore book' + (e.kicker ? ' · ' + esc(e.kicker) : '') + '</span><button class="small ghost" data-act="lore" data-k="' + esc(key) + '">Read more</button></div>' +
      (opts.title === false ? '' : '<b class="title">' + esc(e.title) + '</b>') + '<p>' + loreText(e.summary) + '</p>' +
      (opts.facts !== false && e.facts && e.facts.length ? '<dl class="lorefacts small">' + e.facts.slice(0, 4).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + loreText(v) + '</dd>').join('') + '</dl>' : '') +
      (opts.section && first ? '<p class="small">' + loreText(first.text) + '</p>' : '') + (opts.more || '') + '</div>';
  }
  // The lore book in a window, with a way back along the links followed.
  function openLore(key, fresh) {
    S.loreTrail = fresh || !S.loreTrail || $('#modal').hidden ? [key] : [...S.loreTrail, key];
    const trail = S.loreTrail, back = trail.length > 1 ? '<button class="small ghost" data-act="loreBack">← ' + esc((lore(trail[trail.length - 2]) || {}).title || 'Back') + '</button>' : '<span></span>';
    modal('<div class="row between">' + back + '<span class="row">' + (S.st && S.st.hero ? '<a href="#/lore" data-act="loreBook" data-k="' + esc(key) + '" class="small">Open the lore book</a>' : '') + '<button class="small" data-act="closeModal">Close</button></span></div>' + loreEntry(key));
    $('#modal > div').classList.add('lorebox');
    $('#modal > div').scrollTop = 0;
  }
  // Every entry a set of answers points to, for the "threads of your tale" list.
  function loreThreads(keys) {
    const seen = new Set();
    keys.forEach((k) => { const e = lore(k); if (!e) return; if (e.title) seen.add(k); (e.see || []).forEach((s) => lore(s) && seen.add(s)); });
    return [...seen];
  }
  function storyLoreKeys(race, story) {
    const a = story.answers || {}, keys = [];
    if (a.home) keys.push(loreKey('culture', race, a.home));
    if (a.youth) keys.push(loreKey('backstory', race, a.youth));
    Object.entries(a).forEach(([q, v]) => { if (typeof v === 'number') keys.push(loreKey('answer', race, q, v)); });
    return keys;
  }

  // The lore book page: shelves, a search and one entry at a time.
  function loreView() {
    if (!S.lore) return '<div class="panel">The lore book could not be loaded.</div>';
    const shelves = Object.entries(S.lore.shelves).filter(([, s]) => !s.hidden), key = S.loreKey && lore(S.loreKey) ? S.loreKey : null;
    const shelf = S.loreShelf || (key ? key.split(':')[0] : 'world');
    const count = (k) => Object.keys(S.lore.entries).filter((e) => e.startsWith(k + ':')).length;
    const h = S.st.hero, mine = [loreKey('race', h.race), loreKey('class', h.cls), loreKey('origin', h.origin), h.culture && loreKey('culture', h.race, h.culture), h.backstory && loreKey('backstory', h.race, h.backstory), h.path && loreKey('path', h.cls, h.path)].filter((k) => k && lore(k));
    return '<div class="lorebook"><div class="stack"><div class="panel tight"><h3>The lore book</h3><input id="loreq" placeholder="Search the lore" value="' + esc(S.loreQ || '') + '" aria-label="Search the lore" autocomplete="off">' +
      '<div class="shelves">' + shelves.map(([k, s]) => '<button class="small' + (shelf === k && !S.loreQ ? ' on' : '') + '" data-act="loreShelf" data-k="' + k + '" title="' + esc(s.blurb) + '">' + esc(s.title) + ' <span class="muted">' + count(k) + '</span></button>').join('') + '</div></div>' +
      '<div class="panel tight"><div class="eyebrow">Your hero</div><div class="loresee">' + mine.map((k) => '<a href="#" class="chip lorechip" data-act="loreGo" data-k="' + k + '">' + esc(lore(k).title) + '</a>').join('') + '</div></div>' +
      '<div class="panel tight"><div class="eyebrow">Lore packs</div>' + Object.entries(S.lore.packs).map(([, p]) => '<p class="small"><b>' + esc(p.name) + '</b>' + (p.core ? ' <span class="chip">base game</span>' : ' <span class="chip gold">expansion</span>') + '<br><span class="muted">' + esc(p.description) + '</span></p>').join('') + '</div></div>' +
      '<div class="stack">' + (key ? '<div class="panel"><div class="row between"><button class="small ghost" data-act="loreGo" data-k="">← ' + esc(loreShelf(key).title) + '</button></div>' + loreEntry(key).replace(/data-act="lore"/g, 'data-act="loreGo"') + '</div>' : '<div class="panel"><div class="lorelist">' + loreList(shelf) + '</div></div>') + '</div></div>';
  }
  function loreList(shelf) {
    const q = (S.loreQ || '').trim().toLowerCase(), all = Object.entries(S.lore.entries).filter(([k]) => !loreShelf(k).hidden);
    const hits = q ? all.filter(([, e]) => [e.title, e.kicker, e.summary, ...(e.sections || []).map((s) => s.text)].join(' ').toLowerCase().includes(q)) : all.filter(([k]) => k.startsWith((shelf || S.loreShelf || 'world') + ':'));
    const s = S.lore.shelves[shelf || S.loreShelf || 'world'] || {};
    return (q ? '<h2>' + hits.length + ' found</h2>' : '<h2>' + esc(s.title) + '</h2><p class="muted">' + esc(s.blurb) + '</p>') +
      '<div class="lorecards">' + hits.slice(0, 120).map(([k, e]) => '<a href="#" class="loreitem" data-act="loreGo" data-k="' + k + '"><span class="eyebrow">' + esc(q ? loreShelf(k).title : e.kicker || '') + '</span><b>' + esc(e.title) + '</b><span class="small">' + esc(lorePlain(e.summary)) + '</span></a>').join('') + '</div>';
  }

  // ------------------------------------------------------------------ creator

  function creatorState() {
    if (!S.creator) {
      const r = ITP.randomHero();
      S.creator = { name: '', race: 'human', story: { answers: {}, notes: '' }, cls: 'guardian', origin: 'anvil', look: { skin: ITP.RACES.human.skins[1], hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, eyeColor: r.eyeColor, mouth: r.mouth, beard: 'none', acc: 'none', build: 1, height: 1, dye1: r.dye1, dye2: r.dye2, metal: r.metal } };
    }
    return S.creator;
  }
  // The creator shows the hero in plain clothes: gear comes from play, not from the creator.
  const plain = (c, race) => ({ ...c.look, race: race || c.race, skin: race && race !== c.race ? ITP.RACES[race].skins[1] : c.look.skin, hat: 'none', top: 'tunic', bottom: 'pants', shoes: 'boots', gloves: 'none', cape: 'none', weapon: 'none', offhand: 'none' });
  const STEPS = [['race', 'Race'], ['cls', 'Class'], ['origin', 'Origin'], ['story', 'Life story'], ['look', 'Look'], ['name', 'Name']];
  // The name field only exists on the last step, so creator actions copy it before re-rendering.
  const keepName = () => { const el = $('#cname'); if (el && S.creator) S.creator.name = el.value; };
  const stepDone = (c, s) => (s === 'story' ? storyDone(c.race, c.story) : s === 'name' ? c.name.trim().length >= 3 : !!(S.creatorSeen || {})[s]);

  // ------------------------------------------------------------------ life story

  // The questions of a race in chapter order: [id, chapter title, question, options [[value, label, sentence, note]]].
  function storyQuestions(race, story) {
    const L = S.cfg.lifeStory, q = L.questions[race], cult = S.cfg.cultures[race], bs = S.cfg.backstories[race], out = [];
    Object.values(L.chapters).forEach(([title, ids]) => ids.forEach((id) => {
      if (id === 'home') out.push([id, title, q.home, Object.entries(cult).map(([cid, n]) => [cid, n, '', '']), null]);
      else if (id === 'youth') out.push([id, title, q.youth, Object.entries(bs).filter(([, b]) => b[1] === story.answers.home).map(([bid, b]) => [bid, b[0], b[3], 'Starts in ' + b[5] + ' · ' + b[4]]), story.answers.home ? null : 'Answer where you were raised first.']);
      else out.push([id, title, q[id][0], q[id][1].map((o, i) => [i, o[0], '', attrName(o[2])]), null]);
    }));
    return out;
  }
  const storyDone = (race, story) => storyQuestions(race, story).every(([id]) => story.answers[id] !== undefined && story.answers[id] !== null);
  // Same rule as LifeStory::lean: the three attributes the answers name most, earliest first on a tie.
  function storyLean(race, story) {
    const q = S.cfg.lifeStory.questions[race], count = new Map();
    Object.values(S.cfg.lifeStory.chapters).flatMap((c) => c[1]).forEach((id) => { const a = story.answers[id]; if (typeof a === 'number' && q[id]) { const at = q[id][1][a][2]; count.set(at, (count.get(at) || 0) + 1); } });
    const order = [...count.keys()];
    return [...count.entries()].sort((x, y) => y[1] - x[1] || order.indexOf(x[0]) - order.indexOf(y[0])).slice(0, S.cfg.lifeStory.lean[0]).map(([a]) => a);
  }
  // Same prose as LifeStory::biography.
  function storyBio(race, name, story) {
    const L = S.cfg.lifeStory, q = L.questions[race], home = S.cfg.cultureInfo[race][story.answers.home];
    const tale = (t) => t.split('{name}').join(name).split('{culture}').join(home ? home[0] : S.cfg.races[race].name);
    const out = [];
    if (story.answers.home) out.push(['', tale(L.tale[race][0])]);
    Object.values(L.chapters).forEach(([title, ids]) => {
      const lines = [];
      ids.forEach((id) => {
        const a = story.answers[id];
        if (id === 'home' && S.cfg.cultures[race][a]) { const t = S.cfg.cultureInfo[race][a]; lines.push(name + ' was raised among the ' + t[0] + ': ' + t[1].charAt(0).toLowerCase() + t[1].slice(1) + '.'); }
        else if (id === 'youth' && S.cfg.backstories[race][a]) { const b = S.cfg.backstories[race][a]; lines.push('Everyone in ' + S.cfg.cultures[race][b[1]] + ' knew ' + name + ' as the ' + b[0] + epithet(b[3])); }
        else if (typeof a === 'number' && q[id]) lines.push(q[id][1][a][1].split('{name}').join(name));
      });
      if (lines.length) out.push([title, lines.join(' ')]);
    });
    if (storyDone(race, story)) out.push(['', tale(L.tale[race][1])]);
    if (story.notes) out.push(['In their own words', story.notes]);
    return out;
  }
  // Same as LifeStory::epithet.
  function epithet(blurb) {
    const s = blurb.replace(/\byour\b/g, 'their').replace(/\byou (could|can|were|are|had|have|did)\b/g, 'they $1').replace(/\byou\b/g, 'them'), first = s.split(/[ ,]/)[0];
    if (['Every', 'Everyone'].includes(first)) return '. ' + s;
    return ', who ' + (['Raised', 'Born', 'Fostered', 'Hatched', 'Sworn', 'Bound', 'Heir', 'Once', 'One'].includes(first) ? 'was ' : '') + s.charAt(0).toLowerCase() + s.slice(1);
  }
  const bioHtml = (bio) => bio.map(([t, p]) => '<div class="biopara' + (t ? '' : ' tale') + '">' + (t ? '<div class="eyebrow">' + esc(t) + '</div>' : '') + '<p>' + esc(p) + '</p></div>').join('');
  // Until the hero has a name the tale says "your hero", capitalised where a sentence starts.
  function namedBio(race, name, story) {
    if (name && name.trim()) return storyBio(race, name.trim(), story);
    return storyBio(race, '\u0001', story).map(([t, p]) => [t, p.replace(/(^|[.!?:]\s+)\u0001/g, '$1Your hero').split('\u0001').join('your hero')]);
  }

  /**
   * The life story, told one question at a time. Each chapter opens with a scene, every answer is a beat of the
   * tale, and picking one moves on. ctx is 'creator' or 'hero' (an older hero writing theirs once); the position
   * is S.storyAt[ctx], and one past the last question is the closing page with the whole tale.
   */
  function storyWizard(race, name, story, ctx, finish) {
    const qs = storyQuestions(race, story), at = Math.min((S.storyAt || {})[ctx] || 0, qs.length), L = S.cfg.lifeStory;
    const threads = loreThreads(storyLoreKeys(race, story));
    const answered = qs.filter(([id]) => story.answers[id] !== undefined).length, who = name && name.trim() ? name.trim() : null;
    const bar = '<div class="tellbar"><span class="bar"><i style="width:' + (100 * answered) / qs.length + '%"></i></span><span class="small muted">' + answered + ' of ' + qs.length + '</span>' +
      (answered < qs.length ? '<button class="small ghost" data-act="storyRandom" data-ctx="' + ctx + '">Tell the rest for me</button>' : '') + '</div>';
    const back = at > 0 ? '<button class="small ghost" data-act="storyAt" data-ctx="' + ctx + '" data-i="' + (at - 1) + '">← Back</button>' : '<span></span>';
    if (at >= qs.length) {
      const bio = namedBio(race, who, story), done = storyDone(race, story);
      return '<div class="tell enter">' + bar + '<div class="tellpage"><div class="eyebrow">The tale so far</div><div class="storybio book">' + bioHtml(bio) + '</div>' +
        '<div class="storyq"><div class="qtext">Anything the tale left out? A secret, a name, a promise. (optional)</div><textarea id="storynotes" data-ctx="' + ctx + '" maxlength="' + L.notesMax + '" rows="3">' + esc(story.notes || '') + '</textarea></div>' +
        (threads.length ? '<div class="loresee threads"><span class="eyebrow">' + ico('lore') + ' Threads of this tale in the lore book</span>' + threads.map((k) => loreLink(k, null, 'chip lorechip')).join('') + '</div>' : '') +
        (done ? '' : '<p class="small bad">Some of the tale is still untold. Go back and answer the open questions.</p>') +
        '<div class="row between tellnav">' + back + (done ? finish : '<button class="small" data-act="storyAt" data-ctx="' + ctx + '" data-i="' + qs.findIndex(([id]) => story.answers[id] === undefined) + '">Answer what is left</button>') + '</div></div></div>';
    }
    const [id, title, text, opts, blocked] = qs[at], first = at === 0 || qs[at - 1][1] !== title;
    const chKey = Object.keys(L.chapters).find((k) => L.chapters[k][0] === title), chNo = Object.keys(L.chapters).indexOf(chKey) + 1;
    const scene = first ? '<p class="scene">' + esc(L.scenes[race][chKey]) + '</p>' : '';
    const beat = (sentence) => (who ? sentence.split('{name}').join(who) : sentence.replace(/^\{name\}/, 'Your hero').split('{name}').join('your hero'));
    const prev = !first && story.answers[qs[at - 1][0]] !== undefined ? namedBio(race, who, { answers: { [qs[at - 1][0]]: story.answers[qs[at - 1][0]], home: story.answers.home }, notes: '' }).filter(([t]) => t).map(([, p]) => p).join(' ') : '';
    return '<div class="tell enter">' + bar + '<div class="tellpage"><div class="eyebrow">Chapter ' + chNo + ' · ' + esc(title) + '</div>' + scene +
      (prev ? '<p class="prevbeat">' + esc(prev.split('. ').slice(-1)[0]) + '</p>' : '') +
      '<h3 class="tellq">' + esc(text) + '</h3>' +
      (blocked ? '<p class="small muted">' + esc(blocked) + '</p>' : '<div class="beats">' + opts.map(([v, label, sentence, note]) => {
        const line = sentence ? beat(sentence) : id === 'home' ? (who || 'Your hero') + ' was raised among the ' + label + ': ' + S.cfg.cultureInfo[race][v][1].charAt(0).toLowerCase() + S.cfg.cultureInfo[race][v][1].slice(1) + '.' : '';
        const le = lore(id === 'home' ? loreKey('culture', race, v) : id === 'youth' ? loreKey('backstory', race, v) : loreKey('answer', race, id, v));
        return '<button class="beat' + (story.answers[id] === v ? ' on' : '') + '" data-act="ans" data-ctx="' + ctx + '" data-q="' + id + '" data-v="' + v + '"><b>' + esc(label) + '</b>' + (line ? '<span>' + esc(line) + '</span>' : '') + (note ? '<small>' + esc(note) + '</small>' : '') + (le ? '<em class="lorenote">' + ico('lore') + esc(lorePlain(le.summary)) + '</em>' : '') + '</button>';
      }).join('') + '</div>') +
      '<div class="row between tellnav">' + back + (story.answers[id] !== undefined ? '<button class="small" data-act="storyAt" data-ctx="' + ctx + '" data-i="' + (at + 1) + '">Next →</button>' : '<span></span>') + '</div></div></div>';
  }

  function creatorView() {
    const c = creatorState(), cfg = S.cfg, R = ITP.RACES[c.race], step = S.creatorStep;
    const start = {};
    const add = (a, n) => { start[a] = (start[a] || 0) + n; };
    Object.entries(cfg.races[c.race].points).forEach(([a, n]) => add(a, n));
    Object.entries(cfg.classes[c.cls].points).forEach(([a, n]) => add(a, n));
    add(cfg.origins[c.origin][1], cfg.originPoints);
    storyLean(c.race, c.story).forEach((a) => add(a, cfg.lifeStory.lean[1]));
    const maxStart = Math.max(...Object.values(start));
    const pts = (o) => Object.entries(o).map(([a, n]) => '+' + n + ' ' + attrName(a)).join(' · ');
    const choice = (kind, id, title, body, on) => '<div class="choice ' + (on ? 'on' : '') + '" data-act="pick" data-kind="' + kind + '" data-id="' + id + '"><b>' + esc(title) + '</b>' + body + '</div>';
    const sw = (key, list, title) => '<div><label>' + title + '</label><div class="swatches">' + list.map((v) => '<span class="sw ' + (String(c.look[key]) === String(v) ? 'on' : '') + '" style="background:' + v + '" data-act="look" data-key="' + key + '" data-v="' + v + '" title="' + v + '"></span>').join('') + '</div></div>';
    const seg = (key, values, title) => '<div><label>' + title + '</label><div class="seg">' + Object.entries(values).map(([v, n]) => '<button class="small ' + (String(c.look[key]) === String(v) ? 'on' : '') + '" data-act="look" data-key="' + key + '" data-v="' + v + '">' + esc(n) + '</button>').join('') + '</div></div>';
    const k = cfg.classes[c.cls];
    let body = '';
    if (step === 'race') {
      const r = cfg.races[c.race];
      body = '<h2>Choose a race</h2><p class="muted">Races come in real sizes, from stout dwarves to towering orcs and draka. Every race can play every role.</p><div class="races" style="margin-top:12px">' +
        Object.entries(cfg.races).map(([id, x]) => '<div class="race ' + (c.race === id ? 'on' : '') + '" data-act="pick" data-kind="race" data-id="' + id + '">' + spr(plain(c, id), 1.5) + '<b>' + esc(x.name) + '</b></div>').join('') + '</div>' +
        '<div class="detail"><b class="title">' + esc(r.name) + '</b><div><b class="gold">' + esc(r.passive[1]) + '.</b> ' + esc(r.passive[2]) + '</div><div class="muted small">Starting points: ' + pts(r.points) + '</div></div>' +
        loreCard(loreKey('race', c.race), { title: false, section: true, more: '<div class="loresee"><span class="eyebrow">Their homelands</span>' + Object.keys(cfg.cultures[c.race]).map((cid) => loreLink(loreKey('culture', c.race, cid), null, 'chip lorechip')).join('') + loreLink('world:valdren', 'The world', 'chip lorechip') + '</div>' });
    } else if (step === 'story') {
      body = '<h2>Their life story</h2><p class="muted">Every ' + esc(cfg.races[c.race].name) + ' has a story before the tavern. Tell it one moment at a time. Where they were raised sets their culture, what they were known for starts their Heritage at rank 3, and the three attributes the tale names most get +' + cfg.lifeStory.lean[1] + ' each.</p>' +
        storyWizard(c.race, c.name, c.story, 'creator', '<button class="primary" data-act="cstep" data-s="look">Now, how do they look? →</button>');
    } else if (step === 'cls') {
      body = '<h2>Choose a class</h2><p class="muted">Your class sets your role in the group, your skills and the resource they spend. It is permanent.</p><div class="choices" style="margin-top:12px">' +
        Object.entries(cfg.classes).map(([id, k]) => choice('cls', id, k.name, '<div class="row">' + role(k.role) + '<span class="chip">' + ico(k.resource) + k.resource + '</span></div><div><b class="gold">' + esc(k.passive[1]) + '.</b> ' + esc(k.passive[2]) + '</div><div class="muted small">' + pts(k.points) + '</div>', c.cls === id)).join('') + '</div>' +
        loreCard(loreKey('class', c.cls), { section: true, more: '<div class="lorepaths">' + Object.entries(k.paths).map(([pid, p]) => { const e = lore(loreKey('path', c.cls, pid)); return '<div><b>' + esc(p[0]) + '</b> <span class="muted small">Path at level ' + cfg.pathLevel + '</span><p class="small">' + (e ? loreText(e.summary) : esc(p[1])) + '</p></div>'; }).join('') + '</div>' });
    } else if (step === 'origin') {
      body = '<h2>Choose an Origin</h2><p class="muted">Where your hero comes from: ' + cfg.originPoints + ' points in one attribute and a small edge of its own.</p><div class="choices" style="margin-top:12px">' +
        Object.entries(cfg.origins).map(([id, o]) => choice('origin', id, o[0], '<div class="muted small">+' + cfg.originPoints + ' ' + attrName(o[1]) + '</div><div>' + esc(o[2]) + '</div>', c.origin === id)).join('') + '</div>' +
        loreCard(loreKey('origin', c.origin), { section: true, more: '<div class="loresee">' + loreLink('world:wheel', 'The Wheel of Signs', 'chip lorechip') + '</div>' });
    } else if (step === 'look') {
      body = '<div class="head"><h2>Make them yours</h2><button class="small" data-act="randomLook">Randomise look</button></div><p class="muted">Build and height change the silhouette only. Your two clothes colours become the dyes on every piece of gear you earn later.</p><div class="lookgrid" style="margin-top:6px">' +
        sw('skin', R.skins, 'Skin') + sw('hairColor', ITP.HAIRS, 'Hair colour') + seg('hair', ITP.OPTIONS.hair, 'Hair') + sw('eyeColor', ITP.EYES, 'Eye colour') + seg('eyes', ITP.OPTIONS.eyes, 'Eyes') + seg('mouth', ITP.OPTIONS.mouth, 'Expression') +
        seg('beard', ITP.OPTIONS.beard, 'Facial hair') + seg('acc', ITP.OPTIONS.acc, 'Accessory') + seg('build', { 0.92: 'Slim', 1: 'Average', 1.1: 'Broad' }, 'Build') + seg('height', { 0.95: 'Short', 1: 'Average', 1.05: 'Tall' }, 'Height') +
        sw('dye1', ITP.DYES, 'Main dye') + sw('dye2', ITP.DYES, 'Second dye') + sw('metal', ITP.METALS, 'Metal') + '</div>';
    } else {
      const ok = storyDone(c.race, c.story);
      body = '<h2>And their name?</h2><p class="muted">Three to twenty letters. Your group, your guild and the market will know them by it.</p>' +
        '<input id="cname" class="bigname" value="' + esc(c.name) + '" maxlength="20" placeholder="Name" autocomplete="off">' +
        '<div class="summary">' + [[cfg.races[c.race].name, loreKey('race', c.race)], [k.name, loreKey('class', c.cls)], [cfg.origins[c.origin][0] + ' Origin', loreKey('origin', c.origin)], c.story.answers.home ? [cfg.cultures[c.race][c.story.answers.home], loreKey('culture', c.race, c.story.answers.home)] : null, c.story.answers.youth ? [cfg.backstories[c.race][c.story.answers.youth][0], loreKey('backstory', c.race, c.story.answers.youth)] : null].filter(Boolean).map(([x, key]) => lore(key) ? loreLink(key, x, 'chip lorechip') : '<span class="chip">' + esc(x) + '</span>').join('') + '</div>' +
        (ok ? '<div class="storybio book namebio">' + bioHtml(namedBio(c.race, c.name, c.story)) + '</div>' : '<div class="detail">Their life story is not finished yet. <button class="small" data-act="cstep" data-s="story">Finish it</button></div>');
    }
    const idx = STEPS.findIndex(([s]) => s === step), next = STEPS[idx + 1];
    const nav = step === 'story' ? '' : '<div class="row between cnav">' + (idx > 0 ? '<button data-act="cstep" data-s="' + STEPS[idx - 1][0] + '">← ' + STEPS[idx - 1][1] + '</button>' : '<span></span>') + (next ? '<button class="primary" data-act="cstep" data-s="' + next[0] + '">' + next[1] + ' →</button>' : '<button class="primary big" data-act="create">Create hero</button>') + '</div>';
    const doneN = STEPS.filter(([s]) => stepDone(c, s)).length, anim = S.creatorAnim ? ' enter ' + S.creatorAnim : '';
    S.creatorAnim = null;
    return '<div class="creator"><div class="row between"><div class="logo">Idle <span>Teams</span></div><span class="muted small">Race, class, Origin and life story are permanent. The look is yours to keep.</span></div><div class="cols">' +
      '<div class="stagebox"><div class="panel cside"><div class="portrait">' + spr(plain(c), 4, 'idle') + '</div><div class="stack tight">' +
      '<div><b class="cname-show">' + esc(c.name.trim() || 'Unnamed hero') + '</b><div class="row" style="margin-top:4px"><span class="num">' + esc(ITP.RACES[c.race].name + ' ' + k.name) + '</span>' + role(k.role) + '</div></div>' +
      (c.story.answers.youth ? '<div class="small"><span class="muted">Known as</span> <b>' + esc(cfg.backstories[c.race][c.story.answers.youth][0]) + '</b> of ' + esc(cfg.cultures[c.race][c.story.answers.home]) + '</div>' : '') +
      '<div class="startwrap"><div class="eyebrow">Starting attributes</div><div class="startbars" style="margin-top:6px">' + Object.entries(start).sort((a, b) => b[1] - a[1]).map(([a, n]) => '<div><span>' + attrName(a) + '</span><span class="bar"><i style="width:' + (100 * n) / maxStart + '%"></i></span><b class="num">' + n + '</b></div>').join('') + '</div></div>' +
      (doneN === STEPS.length ? '<button class="primary" data-act="create">Create hero</button>' : '') + '</div></div></div>' +
      '<div class="panel cmain"><div class="steps">' + STEPS.map(([s, n], i) => '<button class="' + (s === step ? 'on' : '') + (stepDone(c, s) ? ' done' : '') + '" data-act="cstep" data-s="' + s + '"><i>' + (stepDone(c, s) && s !== step ? '✓' : i + 1) + '</i><span>' + n + '</span></button>').join('') + '</div>' +
      '<span class="bar cprogress"><i style="width:' + (100 * doneN) / STEPS.length + '%"></i></span><div class="cbody' + anim + '">' + body + '</div>' + nav + '</div></div></div>';
  }

  // ------------------------------------------------------------------ shell

  const VIEWS = [['battle', 'Battle', 'battle'], ['hero', 'Hero', 'hero'], ['skills', 'Skills', 'skills'], ['talents', 'Talents', 'talents'], ['heritage', 'Heritage', 'heritage'], ['gear', 'Gear', 'gear'], ['group', 'Group', 'group'], ['guild', 'Guild', 'guild'], ['market', 'Market', 'market'], ['lore', 'Lore', 'lore']];
  function shell() {
    const h = S.st.hero;
    const dots = { battle: S.st.pendingRolls, hero: h.points.unspent + h.openKeystones.length + (h.level >= S.cfg.pathLevel && !h.path ? 1 : 0), skills: h.skillPoints, talents: h.talentPoints.free, heritage: h.renown.free, group: S.st.invites.length + (S.st.party ? S.st.party.requests.filter((r) => r.kind === 'application').length : 0) };
    const nav = VIEWS.map(([id, n, i]) => '<a href="#/' + id + '" class="' + (S.view === id ? 'on' : '') + '">' + ico(i, '') + '<span>' + n + '</span>' + (dots[id] ? '<span class="badge">' + dots[id] + '</span>' : '') + '</a>').join('') + '<a href="#" data-act="toggleChat" class="chat-link">' + ico('chat', '') + '<span>Chat</span></a>';
    const views = { battle: battleView, hero: heroView, skills: skillsView, talents: talentsView, heritage: heritageView, story: storyView, gear: gearView, group: groupView, guild: guildView, market: marketView, lore: loreView };
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
      const rows = r.heroes.map((h) => '<tr><td><b>' + esc(h.name) + '</b><div class="bar meter" style="width:110px"><i style="width:' + (100 * h.damage) / top + '%"></i></div></td><td class="n">' + fmt(h.damage) + '</td><td class="n">' + fmt(h.healing) + '</td><td class="n">' + fmt(h.taken) + '</td><td class="n">' + h.deaths + '</td><td class="n">' + fmt(h.xp) + '</td><td class="n gold">' + fmt(h.gold) + '</td><td class="n">' + fmt(h.materials) + '</td><td class="n" title="' + (h.kin ? h.kin + ' kin in the group' : 'No kin in the group') + '">' + fmt(h.renown) + (h.kin ? ' <span class="r-epic">×' + h.kin + '</span>' : '') + '</td></tr>').join('');
      const fellAt = r.wiped ? r.plan[r.encountersDone] : null;
      const loot = x.chest.filter((e) => e.winner).map((e) => '<span class="row" style="gap:6px">' + tile(e.item, { act: false }) + '<span><span class="r-' + e.item.rarity + '"><b>' + esc(e.item.name) + '</b></span><br><span class="small muted">won by ' + esc((x.roster.find((q) => q.id === e.winner) || {}).name || '?') + '</span></span></span>').join('');
      return '<details class="run"' + (x === list[0] ? ' open' : '') + '><summary><b class="' + (won ? 'good' : 'bad') + '">' + (won ? 'Cleared ' + esc(r.dungeon) : 'Fell at the ' + esc(fellAt[1])) + '</b><span class="chip">' + r.bossesKilled + '/3 bosses</span><span class="chip">level ' + x.dungeonLevel + '</span><span class="small muted">' + new Date(x.endsAt * 1000).toLocaleTimeString() + '</span></summary>' +
        (r.cause ? '<p class="bad small" style="margin-top:8px">' + esc(r.cause) + '</p>' : '') +
        '<div class="scroll-x" style="margin-top:8px"><table class="t"><tr><th>Hero</th><th class="n">Damage</th><th class="n">Healing</th><th class="n">Taken</th><th class="n">Deaths</th><th class="n">XP</th><th class="n">Gold</th><th class="n">Mats</th><th class="n">Renown</th></tr>' + rows + '</table></div>' +
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
          '<span class="d">' + esc(cfg.attributes[a][2]) + (h.twists && h.twists[a] ? '<span class="twist"> · ' + esc(className(h.cls)) + ': ' + esc(h.twists[a].per) + (S.attrOpen === a && h.twists[a].now !== h.twists[a].per && h.twists[a].now ? '. Now ' + esc(h.twists[a].now) : '') + '</span>' : '') + (S.attrOpen === a ? '<br>' + (h.sources[a] || []).map(([f, n]) => esc(f) + ' +' + n).join(' · ') + (over ? '<br><span class="bad">Past the soft cap: counts as ' + fmt(h.effective[a]) + '</span>' : '') : '') + '</span></div>';
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
      '<div class="stack tight"><div><div class="eyebrow">' + esc(race.name) + ' · Origin: ' + esc(origin[0]) + (h.backstory ? ' · ' + esc(S.cfg.backstories[h.race][h.backstory][0]) : '') + (h.guild ? ' · [' + esc(h.guild.tag) + '] ' + esc(h.guild.name) : '') + '</div><h1>' + esc(h.name) + '</h1>' +
      '<div class="row title-line">' + esc(cls.name) + (h.path ? ' of the ' + esc(cls.paths[h.path][0]) : '') + role(h.role) + (h.oathTaken ? '<span class="chip gold">' + ico('lock') + 'Oathsworn</span>' : '') + '</div></div>' +
      '<div><div class="small muted" style="margin-bottom:4px">' + ico('xp') + ' ' + fmt(h.xp) + ' / ' + fmt(h.xpNext) + ' XP to level ' + (h.level + 1) + '</div><div class="bar"><i class="xpf" style="width:' + Math.min(100, (100 * h.xp) / h.xpNext) + '%"></i></div></div>' +
      '<div class="statstrip">' + key + '</div>' +
      '<div class="passives"><div class="passive"><b>' + esc(race.passive[1]) + '</b> · ' + esc(race.passive[2]) + '</div><div class="passive"><b>' + esc(cls.passive[1]) + '</b> · ' + esc(cls.passive[2]) + '</div><div class="passive"><b>' + esc(origin[0]) + '</b> · ' + esc(origin[2]) + '</div></div>' +
      '<div class="row">' + (marks || '<span class="muted small">No Marks yet. Marks are earned in battle and shown on your card.</span>') + '</div>' +
      '<div class="small muted">' + (career.battles || 0) + ' runs · ' + (career.dungeons || 0) + ' clears · ' + (career.bossKills || 0) + ' bosses · ' + (career.deaths || 0) + ' deaths · Codex ' + h.codexPowers.length + ' of ' + Object.keys(cfg.powers).length + '</div></div></div>' +
      '<div class="panel"><div class="head"><h2>Attributes</h2><div class="row"><span class="num" style="font-size:1.2rem"><span class="gold">' + h.points.unspent + '</span> <span class="muted small">unspent of ' + h.points.total + '</span></span><button class="small' + (h.points.unspent ? ' primary' : '') + '" data-act="autoSpend" ' + (h.points.unspent ? '' : 'disabled') + '>Spend the suggested way</button></div></div>' +
      '<p class="small muted">Everything comes from attributes and gear, ' + cfg.pointsPerLevel + ' points per level. Percentage stats follow a curve that gets steep around 50% and never reaches 100%. One attribute above ' + Math.round(cfg.softCapShare * 100) + '% of all your points counts half past that line. Every attribute also does something for your class, shown in gold, so none is wasted on you. Tap an attribute to see where its points come from and what its class effect gives you now.</p><div class="attrs">' + attrs + '</div></div>' +
      (h.story ? '<div class="panel"><div class="head"><h2>Life story</h2><a class="small" href="#/story">Read it all</a></div><div class="storybio short">' + bioHtml(h.biography.slice(0, 2)) + '</div></div>' : '<div class="panel row between"><span class="small muted">' + esc(h.name) + ' has no life story yet.</span><a href="#/story"><button class="small primary">Write it</button></a></div>') +
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
      const tnode = s.talent ? { name: s.talentName } : null;
      const src = s.source === 'core' ? '' : isUlt ? '<span class="chip gold">Ultimate</span>' : s.source === 'talent' ? '<span class="chip talent" data-act="tjump" data-id="' + s.talent + '">' + ico('talents') + 'Talent</span>' : '<span class="chip">' + esc(cfg.classes[h.cls].paths[s.source][0]) + ' path</span>';
      return '<div class="panel tight skill' + (locked ? ' locked' : '') + '">' + skillIcon(s) + '<div class="info"><div class="row between"><b class="' + (inLoadout.has(s.id) ? 'gold' : '') + '">' + esc(s.name) + '</b>' + src + '</div>' +
        '<div class="small muted">' + (locked ? ico('lock') + (tnode ? ' Learn ' + esc(tnode.name) + ' in your talents' : ' Unlocks at level ' + s.level + (s.source !== 'core' && !isUlt ? ' on this Path' : '')) : cap(s.type)) + (s.cost ? ' · ' + s.cost + ' ' + cfg.classes[h.cls].resource : '') + (s.cd ? ' · ' + s.cd + 's cooldown' : '') + '</div>' +
        '<div class="small">' + esc(skillText(s)) + ' Each rank adds strength.</div><div class="row"><span class="pips">' + Array.from({ length: cfg.maxSkillRank }, (_, k) => '<i class="' + (k < s.rank ? 'on' : '') + '"></i>').join('') + '</span><span class="tiny muted">Rank ' + s.rank + '/' + cfg.maxSkillRank + '</span></div></div>' +
        (locked ? '' : '<div class="row act">' + (isUlt ? '<span class="small muted">Always slotted</span>' : '<button class="small ' + (inLoadout.has(s.id) ? 'on' : '') + '" data-act="slot" data-id="' + s.id + '">' + (inLoadout.has(s.id) ? 'In loadout' : 'Add to loadout') + '</button>') + '<button class="small" data-act="rankUp" data-id="' + s.id + '" ' + (h.skillPoints > 0 && s.rank < cfg.maxSkillRank ? '' : 'disabled') + '>Rank up</button></div>') + '</div>';
    };
    return '<div class="stack"><div class="panel"><div class="head"><h2>Loadout</h2><div class="row"><span class="num" style="font-size:1.2rem"><span class="gold">' + h.skillPoints + '</span> <span class="muted small">skill points</span></span><button class="small" data-act="resetRanks">Reset ranks (' + 10 * h.level + 'g)</button></div></div>' +
      '<p class="small muted" style="margin-bottom:12px">One skill point per level. Your loadout holds ' + cfg.loadoutSize + ' skills, and your ultimate joins it at level ' + cfg.ultimateLevel + '. Capstones in your talent tree teach more skills.</p><div class="actionbar">' + bar + '</div></div>' +
      '<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))">' + h.skills.map(card).join('') + '</div></div>';
  }

  // ------------------------------------------------------------------ talent and heritage maps

  // One pixel glyph per node, picked from what the node does.
  const ATTR_GLYPH = { offense: 'strike', tempo: 'buff', defense: 'wall', sustain: 'heal', resources: 'hot', group: 'taunt' };
  const STAT_GLYPH = { dmg: 'strike', crit: 'mark', critDmg: 'strike', heal: 'heal', healRecv: 'heal', regen: 'hot', hp: 'wall', taken: 'wall', block: 'wall', dodge: 'vanish', threat: 'taunt', haste: 'buff', cdr: 'buff', resRegen: 'hot', rageGain: 'dot', fortune: 'mark', xp: 'mark', lifesteal: 'dot' };
  function nodeGlyph(n, cls) {
    const e = n.effect, all = (S.cfg.classes[cls] || {}).allSkills || {};
    if (e.grant) return (all[e.grant] || [])[2] || 'strike';
    if (e.skill) return (all[Object.keys(e.skill)[0]] || [])[2] || 'strike';
    if (e.type) return Object.keys(e.type)[0];
    if (e.kin) return 'groupheal';
    if (e.cost) return 'buff';
    if (e.stat) return STAT_GLYPH[Object.keys(e.stat)[0]] || 'buff';
    if (e.attr) return ATTR_GLYPH[S.cfg.attributes[Object.keys(e.attr)[0]][1]] || 'buff';
    return 'buff';
  }
  const KIND = { root: 'Root', minor: 'Minor', notable: 'Notable', capstone: 'Capstone', keystone: 'Keystone' };
  const learned = (have, id) => (have[id] || 0) > 0;
  const cultureOk = (n, culture) => n.culture === null || n.culture === culture;
  // Open: can be learned right now (touches something learned, or is the root of an empty map).
  function nodeOpen(tree, have, id, culture) {
    const n = tree.nodes[id];
    if (learned(have, id) || !cultureOk(n, culture)) return false;
    return id === tree.root ? true : n.links.some((l) => learned(have, l));
  }
  // The shortest run of unlearned nodes from what is learned to the target (TreeMap::path on the server).
  function mapPath(tree, have, target, culture) {
    if (!tree.nodes[target]) return null;
    if (learned(have, target)) return [];
    const prev = new Map(), queue = Object.keys(have).filter((id) => learned(have, id) && tree.nodes[id]);
    queue.forEach((id) => prev.set(id, false));
    if (!queue.length) { if (target === tree.root) return [tree.root]; prev.set(tree.root, false); queue.push(tree.root); }
    for (let i = 0; i < queue.length; i++) {
      for (const l of tree.nodes[queue[i]].links) {
        if (prev.has(l) || !cultureOk(tree.nodes[l], culture)) continue;
        prev.set(l, queue[i]);
        if (l === target) { const p = []; for (let x = l; x !== false && !learned(have, x); x = prev.get(x)) p.push(x); return p.reverse(); }
        queue.push(l);
      }
    }
    return null;
  }

  // Maps hold over a thousand nodes, so each is drawn once into an SVG that is kept between renders and only
  // repainted: classes change, the DOM does not. Pan by dragging, zoom with the wheel, pinch or the buttons.
  const MAPS = {};
  async function loadMap(kind, key) {
    const id = kind + ':' + key;
    if (MAPS[id] || MAPS[id + '?']) return;
    MAPS[id + '?'] = true;
    try { MAPS[id] = buildMap(kind, await get('/tree/' + kind + '/' + key + '?v=' + (S.st.hero.treeVersion || 1))); } catch (e) { toast(e.message); } finally { delete MAPS[id + '?']; }
    render();
  }
  const SHAPE = {
    root: (c) => '<circle r="26" class="mb"/>',
    minor: () => '<circle r="7" class="mb"/>',
    notable: () => '<circle r="12" class="mb"/>',
    capstone: () => '<polygon class="mb" points="' + Array.from({ length: 6 }, (_, k) => { const t = (Math.PI / 3) * k + Math.PI / 6; return (Math.cos(t) * 18).toFixed(1) + ',' + (Math.sin(t) * 18).toFixed(1); }).join(' ') + '"/>',
    keystone: () => '<rect class="mb" x="-12" y="-12" width="24" height="24" rx="3" transform="rotate(45)"/>',
  };
  const ICON = { root: 30, notable: 15, capstone: 22, keystone: 18 };
  function buildMap(kind, tree) {
    const size = tree.size, cls = S.st.hero.cls, col = { root: '#ffd25a' }, branchOf = {};
    tree.branches.forEach((b) => b[5].forEach((id) => { col[id] = b[3]; branchOf[id] = b; }));
    const shape = S.cfg.treeShape[kind], nb = tree.branches.length;
    let deco = '', edges = '', nodes = '', labels = '';
    for (let d = shape.hub; d <= shape.depth; d += shape.hub) deco += '<circle class="mring" r="' + (70 + 34 * d) + '"/>';
    tree.branches.forEach((b, k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / nb, half = Math.PI / nb, r0 = 60, r1 = size - 40;
      const p = (r, t) => (Math.cos(t) * r).toFixed(0) + ' ' + (Math.sin(t) * r).toFixed(0);
      deco += '<path class="mwedge" style="--c:' + b[3] + '" d="M' + p(r0, a - half) + ' L' + p(r1, a - half) + ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + p(r1, a + half) + ' L' + p(r0, a + half) + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + p(r0, a - half) + 'Z" data-tint="' + b[0] + '"/>';
      const lr = size - 22, lx = Math.cos(a) * lr, ly = Math.sin(a) * lr;
      labels += '<text class="mlab" x="' + lx.toFixed(0) + '" y="' + (ly + 8).toFixed(0) + '" style="--c:' + b[3] + '" data-branch="' + b[0] + '">' + esc(b[1]) + '</text>';
    });
    const edgeList = [];
    for (const [id, n] of Object.entries(tree.nodes)) {
      for (const l of n.links) {
        if (id > l) continue;
        const m = tree.nodes[l];
        edgeList.push([id, l]);
        edges += '<line class="me" x1="' + n.x + '" y1="' + n.y + '" x2="' + m.x + '" y2="' + m.y + '" style="--c:' + (col[l] || col[id]) + '"/>';
      }
      const ic = ICON[n.kind];
      nodes += '<g class="mn ' + n.kind + '" data-id="' + id + '" transform="translate(' + n.x + ' ' + n.y + ')" style="--c:' + col[id] + '"><title>' + esc(n.name + ': ' + n.desc) + '</title>' + SHAPE[n.kind]() +
        (ic ? '<image href="' + ITA.skill(nodeGlyph(n, kind === 'talent' ? cls : null)) + '" x="' + -ic / 2 + '" y="' + -ic / 2 + '" width="' + ic + '" height="' + ic + '"/>' : '') + '</g>';
    }
    const host = document.createElement('div');
    host.innerHTML = '<svg class="msvg" viewBox="' + -size + ' ' + -size + ' ' + 2 * size + ' ' + 2 * size + '" role="group" aria-label="' + (kind === 'talent' ? 'Talent map' : 'Heritage map') + '">' +
      '<defs><radialGradient id="mglow-' + kind + '"><stop offset="0" stop-color="#ff8a2a" stop-opacity=".20"/><stop offset=".5" stop-color="#ff8a2a" stop-opacity=".05"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient></defs>' +
      '<g class="vp"><circle r="' + size + '" fill="url(#mglow-' + kind + ')"/>' + deco + '<g class="medges">' + edges + '</g><g class="mnodes">' + nodes + '</g>' + labels + '</g></svg>';
    const svg = host.firstChild, map = { kind, tree, svg, vp: svg.querySelector('.vp'), size, branchOf, view: { x: 0, y: 0, z: 2.4 }, els: {}, edges: [] };
    svg.querySelectorAll('.mn').forEach((g) => { map.els[g.dataset.id] = g; });
    svg.querySelectorAll('.me').forEach((el, k) => map.edges.push([el, ...edgeList[k]]));
    map.tints = {}; svg.querySelectorAll('[data-tint]').forEach((el) => { map.tints[el.dataset.tint] = el; });
    wireMap(map);
    applyView(map);
    return map;
  }
  function applyView(map) {
    const v = map.view;
    map.vp.setAttribute('transform', 'translate(' + v.x.toFixed(1) + ' ' + v.y.toFixed(1) + ') scale(' + v.z.toFixed(3) + ')');
    map.svg.classList.toggle('far', v.z < 1.6);
  }
  function zoomAt(map, sx, sy, f) {
    const v = map.view, z = Math.min(9, Math.max(0.9, v.z * f));
    v.x = sx - ((sx - v.x) * z) / v.z; v.y = sy - ((sy - v.y) * z) / v.z; v.z = z;
    applyView(map);
  }
  function centerOn(map, id, z) {
    const n = map.tree.nodes[id];
    if (!n) return;
    if (z) map.view.z = z;
    map.view.x = -n.x * map.view.z; map.view.y = -n.y * map.view.z;
    applyView(map);
  }
  function svgPoint(map, cx, cy) {
    const m = map.svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function wireMap(map) {
    const svg = map.svg, pts = new Map();
    let moved = 0, down = null, pinch = null;
    svg.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, svgPoint(map, e.clientX, e.clientY));
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
      if (pts.size === 1) { moved = 0; down = e.target.closest('[data-id],[data-branch]'); }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: map.view.z }; }
      S.mapDrag = true;
    });
    svg.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = svgPoint(map, e.clientX, e.clientY), last = pts.get(e.pointerId);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        map.view.x += p.x - last.x; map.view.y += p.y - last.y; moved += Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
        applyView(map);
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(map, (a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.z * d) / pinch.d / map.view.z);
        moved += 99;
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size) return;
      S.mapDrag = false;
      // Units are the map's own, so the click allowance grows when zoomed out.
      if (moved < 12 && down && e.type === 'pointerup') {
        if (down.dataset.id) mapSelect(map, down.dataset.id);
        else if (down.dataset.branch) { const b = map.tree.branches.find((x) => x[0] === down.dataset.branch); if (b) { mapSelect(map, b[5][0]); centerOn(map, b[5][0], 2.6); } }
      } else if (S.renderPending) render();
      down = null;
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const p = svgPoint(map, e.clientX, e.clientY); zoomAt(map, p.x, p.y, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
  }
  function mapSelect(map, id) {
    if (map.kind === 'talent') S.tsel = id; else S.hsel = id;
    render();
  }
  // Classes from the hero's state: learned, open, on the planned path, a search hit, another culture, selected.
  function paintMap(map, have, culture, sel, path, query) {
    const tree = map.tree, onPath = new Set(path || []), q = (query || '').trim().toLowerCase(), hits = [];
    for (const [id, g] of Object.entries(map.els)) {
      const n = tree.nodes[id], on = learned(have, id);
      let c = 'mn ' + n.kind + (on ? ' on' : nodeOpen(tree, have, id, culture) ? ' open' : '') + (onPath.has(id) ? ' path' : '') + (id === sel ? ' sel' : '') + (cultureOk(n, culture) ? '' : ' oc');
      if (q && (n.name.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q))) { c += ' hit'; hits.push(id); }
      if (g.getAttribute('class') !== c) g.setAttribute('class', c);
    }
    for (const [el, a, b] of map.edges) {
      const la = learned(have, a), lb = learned(have, b);
      const c = 'me' + (la && lb ? ' lit' : (la || onPath.has(a)) && (lb || onPath.has(b)) ? ' path' : '');
      if (el.getAttribute('class') !== c) el.setAttribute('class', c);
    }
    for (const [bid, el] of Object.entries(map.tints)) el.classList.toggle('oc', !!map.tree.branches.find((b) => b[0] === bid && b[4] !== null && b[4] !== culture));
    map.svg.classList.toggle('searching', !!q);
    return hits;
  }
  // Puts the kept SVG into the freshly rendered page.
  function mountMaps() {
    const host = $('#maphost');
    if (!host) return;
    const map = MAPS[host.dataset.map];
    if (!map) return;
    const h = S.st.hero, talent = map.kind === 'talent', have = (talent ? h.talents : h.heritage) || {}, sel = talent ? S.tsel : S.hsel;
    const path = sel && !learned(have, sel) ? mapPath(map.tree, have, sel, talent ? null : h.culture) : null;
    map.hits = paintMap(map, have, talent ? null : h.culture, sel, path, S.mapQuery && S.mapQuery[map.kind]);
    host.appendChild(map.svg);
    if (!map.placed) {
      map.placed = true;
      const any = Object.keys(have).find((id) => learned(have, id) && id !== map.tree.root);
      centerOn(map, sel && map.tree.nodes[sel] ? sel : 'root', any ? 2.4 : 2.0);
    }
    if (S.mapFocus && map.tree.nodes[S.mapFocus]) { centerOn(map, S.mapFocus, Math.max(map.view.z, 2.6)); S.mapFocus = null; }
    const cnt = $('#mapHits');
    if (cnt) cnt.textContent = S.mapQuery && S.mapQuery[map.kind] ? map.hits.length + ' found' : '';
  }

  function grantText(n) {
    const sk = n.effect.grant && S.cfg.classes[S.st.hero.cls].allSkills[n.effect.grant];
    if (!sk) return '';
    const o = { name: sk[0], type: sk[2], mult: sk[3], cost: sk[4], cd: sk[5], opts: sk[6] };
    return '<div class="row" style="margin-top:8px;gap:10px;align-items:flex-start">' + skillIcon(o) + '<div class="small"><b>' + esc(o.name) + '</b> · ' + cap(o.type) + (o.cost ? ' · ' + o.cost + ' ' + S.cfg.classes[S.st.hero.cls].resource : '') + (o.cd ? ' · ' + o.cd + 's cooldown' : '') + '<br>' + esc(skillText(o)) + '</div></div>';
  }
  // The selected node: what it does, and the button that learns it (or the whole path to it).
  function nodeDetail(map, have, id, free, culture, act) {
    const tree = map.tree, n = tree.nodes[id], b = map.branchOf[id], col = b ? b[3] : '#ffd25a', on = learned(have, id);
    const path = on ? [] : mapPath(tree, have, id, culture);
    let why = '', btn = '';
    if (on) why = ico('star') + ' Learned.';
    else if (!cultureOk(n, culture)) why = ico('lock') + ' Follow ' + esc(tree.cultures[n.culture][0]) + ' to learn this.';
    else if (!path) why = ico('lock') + ' Out of reach.';
    else {
      const need = path.length;
      btn = '<button class="primary" style="margin-top:12px;width:100%" data-act="' + act + '" data-ids="' + path.join(' ') + '" ' + (need <= free ? '' : 'disabled') + '>' + (need === 1 ? 'Learn · 1 point' : 'Learn the path · ' + need + ' points') + '</button>';
      if (need > free) why = ico('lock') + ' ' + (need === 1 ? 'Needs a point' : 'The path takes ' + need + ' points') + '; you have ' + free + '.';
      else if (need > 1) why = 'Lights the ' + (need - 1) + ' node' + (need === 2 ? '' : 's') + ' on the way, shown on the map.';
    }
    return '<div class="tdetail"><div class="row" style="gap:12px;align-items:center"><span class="tmedal ' + n.kind + (on ? ' full' : path && path.length === 1 ? ' open' : '') + '" style="--c:' + col + '"><img alt="" src="' + ITA.skill(nodeGlyph(n, map.kind === 'talent' ? S.st.hero.cls : null)) + '"></span><div style="min-width:0"><div class="eyebrow">' + KIND[n.kind] + ' · ' + esc(b ? b[1] : 'Where every branch starts') + '</div><h3>' + esc(n.name) + '</h3></div></div>' +
      '<p style="margin-top:10px">' + esc(n.desc) + '.</p>' + grantText(n) + (why ? '<p class="small muted" style="margin-top:8px">' + why + '</p>' : '') + btn +
      '<button class="small" style="margin-top:8px" data-act="mapCenter" data-id="' + id + '">Show on map</button></div>';
  }
  function mapPanel(kind, key, legend, detail) {
    const q = (S.mapQuery && S.mapQuery[kind]) || '';
    return '<div class="panel mapwrap"><div class="mapbar"><input id="mapq" data-map="' + kind + '" placeholder="Find: block, threat, Fireball…" value="' + esc(q) + '" aria-label="Find on the map"><span class="tiny muted" id="mapHits"></span>' +
      '<button class="small" data-act="mapNext" data-map="' + kind + '" aria-label="Next match">Next</button><span style="flex:1"></span><button class="small" data-act="mapZoom" data-f="1.4" aria-label="Zoom in">+</button><button class="small" data-act="mapZoom" data-f="0.7" aria-label="Zoom out">−</button><button class="small" data-act="mapHome">Center</button></div>' +
      '<div class="maphost" id="maphost" data-map="' + kind + ':' + key + '">' + (MAPS[kind + ':' + key] ? '' : '<div class="boot">Drawing the map…</div>') + (detail ? '<div class="mapdetail">' + detail + '</div>' : '') + '</div>' +
      '<div class="maplegend tiny muted">' + legend + '</div></div>';
  }
  const LEGEND = '<span><i class="lg minor"></i>Minor</span><span><i class="lg notable"></i>Notable</span><span><i class="lg capstone"></i>Capstone</span><span><i class="lg on"></i>Learned</span><span><i class="lg open"></i>Can learn now</span><span><i class="lg path"></i>Path to the selected node</span>';

  function talentsView() {
    const h = S.st.hero, cfg = S.cfg, have = h.talents || {}, free = h.talentPoints.free, map = MAPS['talent:' + h.cls];
    if (!map) loadMap('talent', h.cls);
    const spent = Object.values(have).reduce((a, b) => a + b, 0), count = map ? Object.keys(map.tree.nodes).length : 0;
    const sel = map && map.tree.nodes[S.tsel] ? S.tsel : 'root';
    let side = '', detail = '';
    if (map) {
      const branchList = map.tree.branches.map(([bid, name, theme, col, , ids]) => {
        const pts = ids.reduce((t, id) => t + (learned(have, id) ? 1 : 0), 0);
        return '<button class="tbranch' + (map.branchOf[sel] && map.branchOf[sel][0] === bid ? ' on' : '') + '" style="--c:' + col + '" data-act="mapBranch" data-id="' + ids[0] + '"><i></i><span><b>' + esc(name) + '</b><span class="tiny muted">' + esc(theme) + '</span></span><span class="num small">' + pts + '/' + ids.length + '</span></button>';
      }).join('');
      detail = nodeDetail(map, have, sel, free, null, 'talent');
      side = '<div class="panel tight"><h3 style="margin-bottom:6px">Your talents</h3><p class="small">' + (spent ? esc(h.talentTotal) + '.' : 'Nothing learned yet. Start at the root in the middle.') + '</p></div>' +
        '<div class="panel tight"><h3 style="margin-bottom:8px">Branches</h3><div class="tbranches">' + branchList + '</div></div>';
    }
    return '<div class="stack"><div class="panel"><div class="head"><h2>' + esc(cfg.classes[h.cls].name) + ' talents</h2><div class="row"><span class="num" style="font-size:1.2rem"><span class="gold">' + free + '</span> <span class="muted small">talent points · ' + spent + ' of ' + fmt(count) + ' learned</span></span><button class="small" data-act="resetTalents" ' + (spent ? '' : 'disabled') + '>Reset (' + fmt(h.talentResetCost) + 'g)</button></div></div>' +
      '<p class="small muted">Two points per level from level 2. Everything grows out of the root: ten branches, each a spine with six lanes forking off it. A node opens once a node linked to it is learned, and every fifth ring lanes and branches link across. Halfway out each spine teaches a skill or holds a capstone, and the outer lanes end in keystones: big, with a cost. Pick any node and learn the whole path to it at once.</p></div>' +
      '<div class="tgrid">' + mapPanel('talent', h.cls, LEGEND + '<span><i class="lg keystone"></i>Keystone: big, with a cost</span>', detail) + '<div class="stack">' + side + '</div></div></div>';
  }

  function heritageView() {
    const h = S.st.hero, cfg = S.cfg, have = h.heritage || {}, rn = h.renown, free = rn.free, map = MAPS['heritage:' + h.race];
    if (!map) loadMap('heritage', h.race);
    const race = cfg.races[h.race], tree = map && map.tree, sel = tree && tree.nodes[S.hsel] ? S.hsel : 'root';
    const pctDone = Math.min(100, (100 * (rn.total - rn.from)) / Math.max(1, rn.to - rn.from));
    const p = S.st.party, kinList = p ? p.members.filter((m) => m.id !== h.id && m.race === h.race) : [];
    const kinText = !p ? 'You are not in a group yet.' : rn.kin ? kinList.map((m) => esc(m.name) + (h.backstory && m.culture === h.culture && m.backstory === h.backstory ? ' (same upbringing, counts three times)' : h.culture && m.culture === h.culture ? ' (same culture, counts twice)' : '')).join(', ') + (kinList.length === 1 ? ' shares' : ' share') + ' your heritage: every run pays ' + (cfg.renown.alone + cfg.renown.perKin * rn.kin) + ' Renown per reward unit instead of ' + cfg.renown.alone + '.' : 'Nobody in your group is ' + esc(race.name) + ', so runs only pay a trickle of Renown (' + cfg.renown.alone + ' per reward unit). Each ' + esc(race.name) + ' groupmate adds ' + cfg.renown.perKin + ', twice that if they follow your culture.';
    let cultures = '', side = '', detail = '';
    if (tree) {
      cultures = Object.entries(tree.cultures).map(([cid, [name, theme, col, bids]]) => {
        const mine = h.culture === cid, ids = tree.branches.filter((b) => bids.includes(b[0])).flatMap((b) => b[5]), pts = ids.filter((id) => learned(have, id)).length;
        const btn = mine ? '<span class="chip solid">' + ico('star') + 'Your culture</span>' : '<button class="small" data-act="culture" data-id="' + cid + '" ' + (learned(have, 'root') ? '' : 'disabled') + '>' + (h.culture ? 'Follow (' + fmt(cfg.renown.swapGold * h.level) + 'g)' : 'Follow') + '</button>';
        return '<div class="culture' + (mine ? ' mine' : h.culture ? ' other' : '') + '" style="--c:' + col + '"><div class="ccrest"><span class="cpennant"><img alt="" src="' + ITA.ui('heritage') + '"></span><div style="min-width:0"><h3>' + esc(name) + '</h3><div class="small muted">' + esc(theme) + '</div></div></div>' +
          '<div class="row" style="margin-top:8px;justify-content:space-between">' + btn + '<span class="num small muted">' + pts + '/' + fmt(ids.length) + '</span></div>' +
          '<div class="tiny muted" style="margin-top:6px">' + tree.branches.filter((b) => bids.includes(b[0])).map((b) => '<a href="#/heritage" data-act="mapBranch" data-id="' + b[5][0] + '">' + esc(b[1]) + '</a>').join(' · ') + '</div>' +
          (lore(loreKey('culture', h.race, cid)) ? '<div class="tiny" style="margin-top:6px">' + loreLink(loreKey('culture', h.race, cid), 'Lore of ' + name) + '</div>' : '') + '</div>';
      }).join('');
      detail = nodeDetail(map, have, sel, free, h.culture, 'heritage');
      const branch = sel === 'root' ? null : tree.branches.find((b) => b[5].includes(sel)), bkey = branch ? loreKey('heritage', h.race, branch[0]) : loreKey('heritage', h.race);
      const story = h.backstory && cfg.backstories[h.race][h.backstory];
      side = (story ? '<div class="panel tight"><div class="eyebrow">Known as</div><h3 style="margin-bottom:6px">' + esc(story[0]) + '</h3><p class="small">' + esc(story[3]) + '</p><p class="small muted">' + esc(story[4]) + (h.culture !== story[1] ? '. The Renown comes back if you follow ' + esc(cfg.cultures[h.race][story[1]]) + ' again.' : '.') + '</p><div class="row small"><a href="#/heritage" data-act="mapBranch" data-id="' + story[2] + '.2.1">Show my branch: ' + esc(story[5]) + '</a><a href="#/story">Read my life story</a></div></div>' : '') +
        (lore(bkey) ? '<div class="panel tight">' + loreCard(bkey) + '</div>' : '') +
        '<div class="panel tight"><h3 style="margin-bottom:6px">Your heritage</h3><p class="small">' + (Object.keys(have).length ? esc(h.heritageTotal) + '.' : 'Nothing learned yet. The root in the middle is free at rank 1.') + '</p></div>';
    }
    const count = tree ? Object.keys(tree.nodes).length : 0;
    return '<div class="stack"><div class="panel heritage-top"><div class="hbadge"><span class="eyebrow">Heritage rank</span><span class="big num">' + rn.rank + '</span></div><div style="flex:1;min-width:0"><div class="eyebrow">' + esc(race.name) + (h.culture && tree ? ' · ' + esc(tree.cultures[h.culture][0]) : '') + '</div><h2>' + esc(race.name) + ' Heritage</h2>' +
      '<div class="small muted" style="margin:6px 0 4px">' + fmt(rn.total) + ' Renown · ' + fmt(rn.to - rn.total) + ' to rank ' + (rn.rank + 1) + '</div><div class="bar"><i class="renf" style="width:' + pctDone + '%"></i></div>' +
      '<p class="small" style="margin-top:8px">' + ico('group') + ' ' + kinText + '</p></div><div class="num" style="font-size:1.2rem;align-self:center"><span class="gold">' + free + '</span> <span class="muted small">points</span></div></div>' +
      '<p class="small muted">Renown grows by running dungeons with groupmates of your race. Every Heritage rank gives two points to spend on a map of ' + fmt(count) + ' nodes: three trunk branches every ' + esc(race.name) + ' shares, and three cultures of three branches each. Follow one culture: only its branches can be learned, and kin who follow it too count twice, for Renown and for the kinship bonus in battle.</p>' +
      (h.story ? '' : '<div class="panel row between"><div><h3>Write your life story</h3><p class="small muted">Your hero was made before life stories. Write it once: you follow the culture that raised you and gain ' + fmt(cfg.backstoryRenown) + ' Renown.</p></div><a class="btnlike" href="#/story"><button class="primary">Write it</button></a></div>') +
      (cultures ? '<div class="cultures">' + cultures + '</div>' : '') +
      '<div class="tgrid">' + mapPanel('heritage', h.race, LEGEND + '<span><i class="lg oc"></i>Another culture</span>', detail) + '<div class="stack">' + side + '</div></div></div>';
  }

  // ------------------------------------------------------------------ life story page

  const storyDraft = () => (S.storyDraft = S.storyDraft || { answers: {}, notes: '' });
  // What the lore book says about a hero's choices: people, calling, Sign, culture, backstory and the tale's threads.
  function heroLore(h, story) {
    const keys = [loreKey('race', h.race), loreKey('class', h.cls), loreKey('origin', h.origin), h.culture && loreKey('culture', h.race, h.culture), h.backstory && loreKey('backstory', h.race, h.backstory)].filter((k) => k && lore(k));
    const threads = story ? loreThreads(storyLoreKeys(h.race, story)).filter((k) => !keys.includes(k)) : [];
    return '<div class="panel"><div class="head"><h2>In the lore book</h2><a href="#/lore" class="small">Open the lore book</a></div><div class="lorecards">' + keys.map((k) => '<a href="#" class="loreitem" data-act="lore" data-k="' + k + '"><span class="eyebrow">' + esc(loreShelf(k).title) + '</span><b>' + esc(lore(k).title) + '</b><span class="small">' + esc(lorePlain(lore(k).summary)) + '</span></a>').join('') + '</div>' +
      (threads.length ? '<div class="loresee threads"><span class="eyebrow">Threads of their tale</span>' + threads.map((k) => loreLink(k, null, 'chip lorechip')).join('') + '</div>' : '') + '</div>';
  }
  function storyView() {
    const h = S.st.hero;
    if (h.story) return '<div class="stack"><div class="panel"><div class="eyebrow">' + esc(S.cfg.races[h.race].name) + ' · ' + esc(S.cfg.cultures[h.race][h.story.answers.home]) + '</div><h2>The life of ' + esc(h.name) + '</h2><div class="storybio" style="margin-top:10px">' + bioHtml(h.biography) + '</div></div>' + heroLore(h, h.story) + '</div>';
    const d = storyDraft();
    return '<div class="stack"><div class="panel"><h2>Write your life story</h2><p class="muted">Every ' + esc(S.cfg.races[h.race].name) + ' has a story before the tavern. Tell ' + esc(h.name) + "'s, one moment at a time. Where they were raised sets their culture, what they were known for starts them along one of its branches, and you write it once.</p>" +
      storyWizard(h.race, h.name, d, 'hero', '<button class="primary" data-act="storySave">Write it into the tale</button>') + '</div></div>';
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

  // Groupmates of your race: more Renown from every run together, and a kinship bonus in battle once learned.
  function kinChip(m) {
    const h = S.st && S.st.hero;
    if (!h || m.id === h.id || m.race !== h.race) return '';
    const twice = h.culture && m.culture === h.culture, cult = m.culture ? S.cfg.cultures[m.race][m.culture] : null;
    return '<span class="chip kin" title="' + esc((cult ? cult + '. ' : '') + 'Same race: more Renown from every run together' + (twice ? ', twice for your culture' : '')) + '">' + ico('heritage') + (twice ? 'Kin ×2' : 'Kin') + '</span>';
  }
  function memberCard(m, extra) {
    return '<div class="panel tight member">' + por(m.look) + '<div style="flex:1;min-width:0"><b>' + esc(m.name) + '</b><div class="row" style="gap:6px"><span class="small muted">Lv ' + m.level + ' ' + className(m.cls) + '</span>' + role(m.role) + kinChip(m) + '</div>' + (extra || '') + '</div></div>';
  }
  function groupView() {
    const st = S.st, h = st.hero, p = st.party, tv = S.tavern;
    let mine = '';
    if (p) {
      const lead = p.leader === h.id;
      const reqs = p.requests.map((r) => '<div class="row small">' + (r.kind === 'application' ? '<b>' + esc(r.hero.name) + '</b> (Lv ' + r.hero.level + ' ' + className(r.hero.cls) + ') wants to join' + (r.message ? ': “' + esc(r.message) + '”' : '') + (lead ? ' <button class="small primary" data-act="answer" data-id="' + r.id + '" data-a="accept">Accept</button><button class="small" data-act="answer" data-id="' + r.id + '" data-a="decline">Decline</button>' : '') : 'Invited <b>' + esc(r.hero.name) + '</b>, waiting for an answer') + '</div>').join('');
      mine = '<div class="camp" style="text-align:left"><div class="head"><div><div class="eyebrow">Your group</div><h1>' + esc(p.name) + '</h1></div><span class="chip gold">' + p.battlesTogether + ' runs together · bond +' + Math.min(10, p.battlesTogether) + '% XP</span></div>' +
        '<div class="lineup">' + p.members.map((m) => '<div class="seat">' + spr(m.look, 1.5, 'idle') + '<b>' + esc(m.name) + '</b><span class="row" style="gap:4px;justify-content:center">' + role(m.role) + (m.id === p.leader ? '<span class="chip gold">Leader</span>' : '') + '</span>' + kinChip(m) + (lead && m.id !== h.id ? '<button class="small danger" data-act="kick" data-id="' + m.id + '">Remove</button>' : '') + '</div>').join('') +
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
    return '<div class="stack"><div class="panel"><div class="head"><h2>Market</h2><div class="row"><select data-act-change="mSlot" aria-label="Slot"><option value="">All slots</option>' + Object.keys(cfg.slots).filter((s) => s !== 'ring2').map((s) => '<option value="' + s + '"' + (f.slot === s ? ' selected' : '') + '>' + cfg.slots[s][0] + '</option>').join('') + '<option value="glyph"' + (f.slot === 'glyph' ? ' selected' : '') + '>Glyphs</option></select><select data-act-change="mRarity" aria-label="Rarity"><option value="">Any rarity</option>' + Object.keys(cfg.rarities).map((r) => '<option value="' + r + '"' + (f.rarity === r ? ' selected' : '') + '>' + rarityName(r) + '</option>').join('') + '</select></div></div><p class="small muted" style="margin-bottom:12px">Player to player only: every listing is another hero\'s item and the gold goes to them. There are no shop vendors. Every item can be traded, legendaries included; list yours from the Gear page.</p><div class="market">' + list + '</div></div>' +
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
    cstep: (d) => {
      keepName();
      const from = STEPS.findIndex(([x]) => x === S.creatorStep), to = STEPS.findIndex(([x]) => x === d.s);
      if (to > from) (S.creatorSeen = S.creatorSeen || {})[S.creatorStep] = true;
      if (from === to) return;
      S.creatorAnim = to > from ? 'fwd' : 'back'; S.creatorStep = d.s; render();
      const top = $('.creator .cmain'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
      if (d.s === 'name') { const n = $('#cname'); if (n) n.focus(); }
    },
    storyAt: (d) => { (S.storyAt = S.storyAt || {})[d.ctx] = +d.i; keepName(); render(); const t = $('.tell'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); },
    pick: (d) => { const c = creatorState(); if (d.kind === 'race' && c.race !== d.id) c.story = { answers: {}, notes: '' }; c[d.kind] = d.id; if (d.kind === 'race') { c.look.skin = ITP.RACES[d.id].skins[1]; (S.storyAt = S.storyAt || {}).creator = 0; } keepName(); render(); },
    ans: (d) => {
      const story = d.ctx === 'creator' ? creatorState().story : storyDraft(), v = /^\d+$/.test(d.v) ? +d.v : d.v;
      const race = d.ctx === 'creator' ? creatorState().race : S.st.hero.race;
      story.answers[d.q] = v;
      if (d.q === 'home') { const y = story.answers.youth; if (y && S.cfg.backstories[race][y][1] !== v) delete story.answers.youth; }
      // the tale moves on to the next untold moment, or to the closing page once everything is told
      const qs = storyQuestions(race, story), at = qs.findIndex(([id]) => id === d.q), open = qs.findIndex(([id], i) => i > at && story.answers[id] === undefined);
      (S.storyAt = S.storyAt || {})[d.ctx] = open >= 0 ? open : storyDone(race, story) ? qs.length : at + 1;
      render(); const t = $('.tell'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' });
    },
    storyRandom: (d) => {
      const race = d.ctx === 'creator' ? creatorState().race : S.st.hero.race, story = d.ctx === 'creator' ? creatorState().story : storyDraft();
      for (let guard = 0; guard < 3; guard++) storyQuestions(race, story).forEach(([id, , , opts, blocked]) => { if (story.answers[id] === undefined && !blocked && opts.length) story.answers[id] = opts[Math.floor(Math.random() * opts.length)][0]; });
      (S.storyAt = S.storyAt || {})[d.ctx] = storyQuestions(race, story).length; render();
    },
    storySave: () => {
      const h = S.st.hero, story = storyDraft();
      if (!storyDone(h.race, story)) { toast('Answer every question first.'); return; }
      confirmBox('Write this as ' + esc(h.name) + "'s life story? You will follow <b>" + esc(S.cfg.cultures[h.race][story.answers.home]) + '</b> and gain ' + fmt(S.cfg.backstoryRenown) + ' Renown. It cannot be rewritten.', () => act(() => post('/hero/act', { action: 'story', story }), 'Your story is written.'));
    },
    look: (d) => { const c = creatorState(); c.look[d.key] = isNaN(+d.v) || d.v.startsWith('#') ? d.v : +d.v; keepName(); render(); },
    randomLook: () => { const c = creatorState(), r = ITP.randomHero(); keepName(); Object.assign(c.look, { skin: ITP.RACES[c.race].skins[Math.floor(Math.random() * ITP.RACES[c.race].skins.length)], hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, eyeColor: r.eyeColor, mouth: r.mouth, beard: r.beard, acc: r.acc, build: r.build, height: r.height, dye1: r.dye1, dye2: r.dye2, metal: r.metal }); render(); },
    create: async () => {
      const c = creatorState(); keepName(); c.name = c.name.trim();
      if (!storyDone(c.race, c.story)) { toast('Finish their life story first.'); S.creatorStep = 'story'; render(); return; }
      if (c.name.length < 3) { toast('Give your hero a name of 3 to 20 letters.'); S.creatorStep = 'name'; render(); const n = $('#cname'); if (n) n.focus(); return; }
      try { await post('/hero', c); S.creator = null; S.storyAt = {}; location.hash = '#/hero'; await refresh(); toast('Welcome, ' + c.name + '! Head to the Group page to find your party.', true); } catch (e) { toast(e.message); }
    },
    logout: async () => {
      if (window.IT_SERVER && !S.sureNew) { confirmBox('Start over with a new hero? This clears your saved game in this browser.', () => { S.sureNew = true; handlers.logout(); }); return; }
      S.sureNew = false;
      await post('/logout').catch(() => null);
      if (window.IT_SERVER) { location.hash = ''; location.reload(); return; }
      S.st = null; S.chat = { channel: 'tavern', msgs: {}, last: {} }; render();
    },
    toggleChat: () => { S.chatOpen = !S.chatOpen; render(); },
    chan: (d) => { S.chat.channel = d.id; S.chatJump = true; render(); pollChat(); },
    lore: (d) => openLore(d.k),
    loreBack: () => { const t = S.loreTrail || []; if (t.length > 1) { S.loreTrail = t.slice(0, -2); openLore(t[t.length - 2]); } },
    loreBook: (d) => { closeModal(); S.loreKey = d.k; S.loreQ = ''; location.hash = '#/lore'; render(); },
    loreGo: (d) => { S.loreKey = d.k || null; S.loreQ = ''; render(); const top = $('.lorebook'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' }); },
    loreShelf: (d) => { S.loreShelf = d.k; S.loreKey = null; S.loreQ = ''; render(); },
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
    tsel: (d) => { S.tsel = d.id; render(); },
    tjump: (d) => { S.tsel = d.id; S.mapFocus = d.id; location.hash = '#/talents'; },
    talent: (d) => act(() => post('/hero/act', { action: 'talent', nodes: d.ids.split(' ') }), d.ids.includes(' ') ? 'Learned ' + d.ids.split(' ').length + ' talents.' : null),
    mapCenter: (d) => { const m = MAPS[$('#maphost').dataset.map]; if (m) centerOn(m, d.id, Math.max(m.view.z, 2.6)); },
    mapBranch: (d) => { const m = MAPS[$('#maphost').dataset.map]; if (m) { centerOn(m, d.id, 2.6); mapSelect(m, d.id); } },
    mapZoom: (d) => { const m = MAPS[$('#maphost').dataset.map]; if (m) zoomAt(m, 0, 0, +d.f); },
    mapHome: () => { const m = MAPS[$('#maphost').dataset.map]; if (m) centerOn(m, 'root', 2.0); },
    mapNext: () => {
      const m = MAPS[$('#maphost').dataset.map];
      if (!m || !m.hits || !m.hits.length) return;
      m.hitAt = ((m.hitAt ?? -1) + 1) % m.hits.length;
      const id = m.hits[m.hitAt];
      S.mapFocus = id; mapSelect(m, id);
    },
    resetTalents: () => confirmBox('Reset all talents for ' + fmt(S.st.hero.talentResetCost) + ' gold? Skills they taught leave your loadout.', () => act(() => post('/hero/act', { action: 'resetTalents' }), 'Talents reset.')),
    hsel: (d) => { S.hsel = d.id; render(); },
    heritage: (d) => act(() => post('/hero/act', { action: 'heritage', nodes: d.ids.split(' ') })),
    culture: (d) => { const t = MAPS['heritage:' + S.st.hero.race].tree.cultures[d.id][0]; confirmBox(S.st.hero.culture ? 'Follow the ways of <b>' + esc(t) + '</b> for ' + fmt(S.cfg.renown.swapGold * S.st.hero.level) + ' gold? Points in your old culture come back.' : 'Follow the ways of <b>' + esc(t) + '</b>? You can change later for gold.', () => act(() => post('/hero/act', { action: 'culture', culture: d.id }), 'You follow the ways of ' + t + '.')); },
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
  // Finding on a map repaints it in place, so typing stays smooth.
  document.addEventListener('input', (e) => {
    if (e.target.id === 'cname') { keepName(); const show = $('.cname-show'); if (show) show.textContent = e.target.value.trim() || 'Unnamed hero'; const nb = $('.namebio'); if (nb) { const c = creatorState(); nb.innerHTML = bioHtml(namedBio(c.race, c.name, c.story)); } return; }
    if (e.target.id === 'loreq') { S.loreQ = e.target.value; S.loreKey = null; const box = $('.lorelist'); if (box) box.innerHTML = loreList(); else render(); return; }
    if (e.target.id === 'storynotes') { (e.target.dataset.ctx === 'creator' ? creatorState().story : storyDraft()).notes = e.target.value; return; }
    if (e.target.id !== 'mapq') return;
    const host = $('#maphost'), map = host && MAPS[host.dataset.map];
    (S.mapQuery = S.mapQuery || {})[e.target.dataset.map] = e.target.value;
    if (map) { map.hitAt = -1; mountMaps(); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'storynotes') { const y = window.scrollY; render(); window.scrollTo(0, y); } });
  document.addEventListener('keydown', (e) => { if (e.target.id === 'mapq' && e.key === 'Enter') { e.preventDefault(); handlers.mapNext(); } if (e.target.id === 'cname' && e.key === 'Enter') { e.preventDefault(); handlers.create(); } });
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
