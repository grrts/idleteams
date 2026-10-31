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
  const TIPS = [];
  function tile(it, opts = {}) {
    if (!it) return '<div class="tile empty"><span>' + esc(opts.label || '') + '</span></div>';
    return '<div class="tile ' + it.rarity + (opts.sel ? ' sel' : '') + (opts.big ? ' big' : '') + '"' + (opts.act === false ? '' : ' data-act="sel" data-id="' + it.id + '"') + ' data-tip="' + (TIPS.push(it) - 1) + '" aria-label="' + esc(itemName(it)) + '"><img alt="" src="' + ITA.icon(it) + '">' + (opts.up ? '<span class="up">▲</span>' : '') + (opts.tag ? '<span class="tag">' + opts.tag + '</span>' : '') + '</div>';
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
    ITA.setDungeon(S.cfg.dungeon);
    // Links from mails: #/verify?t=… and #/reset?u=…&t=…
    const link = location.hash.match(/^#\/(verify|reset)\?(.*)$/), q = link ? new URLSearchParams(link[2]) : null;
    if (link) history.replaceState(null, '', location.pathname + '#/battle');
    if (link && link[1] === 'reset') S.reset = { u: q.get('u') || '', t: q.get('t') || '' };
    window.addEventListener('hashchange', () => { S.view = location.hash.slice(2) || 'battle'; S.sel = null; if (S.view === 'settings') S.reports = null; render(); loadView(); });
    S.view = location.hash.slice(2) || 'battle';
    await refresh();
    if (link && link[1] === 'verify') {
      if (!S.st) toast('Log in first, then open the link from the mail again.');
      else { try { await post('/account/verify', { token: q.get('t') || '' }); await refresh(); toast('Your email is confirmed.', true); } catch (e) { toast(e.message); } }
    }
    loadView();
    pushInit();
    setInterval(() => { if (S.st && S.st.hero && !document.hidden) refresh(); }, 5000);
    setInterval(() => { if (S.st && S.st.hero && !document.hidden) pollChat(); }, 4000);
    setInterval(() => { if (S.st && S.st.hero && S.st.party && !document.hidden) loadBattle(); }, 15000);
    requestAnimationFrame(frame);
  }

  async function refresh() {
    try {
      const st = await get('/state');
      S.skew = st.serverTime - Date.now() / 1000;
      const prevBattle = S.st && S.st.battle && S.st.battle.id, prevLevel = S.st && S.st.hero && S.st.hero.level;
      S.st = st;
      if (st.hero && st.battle && st.battle.id !== prevBattle) loadBattle();
      if (prevLevel && st.hero && st.hero.level > prevLevel) celebrate.level(st.hero);
    } catch (e) {
      if (e.status === 401) S.st = null; else { toast(e.message); return; }
    }
    render();
  }
  const now = () => Date.now() / 1000 + S.skew;

  async function loadView() {
    if (!S.st || !S.st.hero) return;
    if (S.st.party) loadBattle();
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
      celebrate.run(b);
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
    const keepWin = $('.win-body') && S.lastWin === S.view ? $('.win-body').scrollTop : 0; S.lastWin = S.view;
    TIPS.length = 0;
    keepInputs(app, () => {
      if (!S.st) app.innerHTML = authView();
      else if (!S.st.hero) app.innerHTML = creatorView();
      else app.innerHTML = shell();
    });
    hydrate(app);
    mountMaps();
    const msgs = $('.msgs');
    if (msgs) msgs.scrollTop = keepScroll != null && !S.chatJump ? keepScroll : msgs.scrollHeight;
    if (keepWin && $('.win-body')) $('.win-body').scrollTop = keepWin;
    S.chatJump = false;
    if (S.st && S.st.hero) setupScene();
  }

  function authView() {
    const logo = '<div class="logo center" style="font-size:2.4rem">Idle <span>Teams</span></div>';
    if (S.reset) return '<div class="auth panel stack">' + logo + '<p class="center">Choose a new password for <b>' + esc(S.reset.u) + '</b>.</p><form data-form="reset"><label for="pw">New password</label><input id="pw" name="password" type="password" minlength="8" autocomplete="new-password" required style="width:100%"><div style="margin-top:14px"><button class="primary" type="submit">Save and log in</button></div></form></div>';
    if (S.authMode === 'forgot') return '<div class="auth panel stack">' + logo + '<p class="muted center">Enter the email on your account and we will send a link to choose a new password.</p><form data-form="forgot"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required style="width:100%"><div class="row between" style="margin-top:14px"><button class="primary" type="submit">Send the link</button><button type="button" class="ghost small" data-act="authMode" data-mode="login">Back to log in</button></div></form></div>';
    const reg = S.authMode === 'register';
    return '<div class="auth panel stack"><div class="logo center" style="font-size:2.4rem">Idle <span>Teams</span></div><p class="muted center">Five heroes, one long dungeon run, loot for the group.</p>' +
      '<div class="tabs"><button class="' + (!reg ? 'on' : '') + '" data-act="authMode" data-mode="login">Log in</button><button class="' + (reg ? 'on' : '') + '" data-act="authMode" data-mode="register">Create account</button></div>' +
      '<form data-form="' + (reg ? 'register' : 'login') + '"><label for="u">Username</label><input id="u" name="username" autocomplete="username" required style="width:100%"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required style="width:100%">' +
      '<div class="row between" style="margin-top:14px"><button class="primary" type="submit">' + (reg ? 'Create account' : 'Log in') + '</button>' + (reg || window.IT_SERVER ? '' : '<button type="button" class="ghost small" data-act="authMode" data-mode="forgot">Forgot your password?</button>') + '</div></form></div>';
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
  // The name field only exists on the last step, so creator actions copy it before re-rendering.
  const keepName = () => { const el = $('#cname'); if (el && S.creator) S.creator.name = el.value; };
  const stepDone = (c, s) => (s === 'story' ? storyDone(c.race, c.story) : s === 'name' ? c.name.trim().length >= 3 : !!(S.creatorSeen || {})[s]);

  // ------------------------------------------------------------------ life story

  // The questions of a race in chapter order: [id, chapter title, question, options [[value, label, sentence, note]]].
  function storyQuestions(race, story) {
    const L = S.cfg.lifeStory, q = L.questions[race], cult = S.cfg.cultures[race], bs = S.cfg.backstories[race], out = [];
    Object.values(L.chapters).forEach(([title, ids]) => ids.forEach((id) => {
      if (id === 'home') out.push([id, title, q.home, Object.entries(cult).map(([cid, n]) => [cid, n, '', '']), null]);
      else if (id === 'youth') out.push([id, title, q.youth, Object.entries(bs).filter(([, b]) => b[1] === story.answers.home).map(([bid, b]) => [bid, b[0], b[3], '']), story.answers.home ? null : 'Answer where you were raised first.']);
      else out.push([id, title, q[id][0], q[id][1].map((o, i) => [i, o[0], o[1], '']), null]);
    }));
    return out;
  }
  const storyDone = (race, story) => storyQuestions(race, story).every(([id]) => story.answers[id] !== undefined && story.answers[id] !== null);
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
    const threads = typeof loreThreads === 'function' ? loreThreads(storyLoreKeys(race, story)) : [];
    const answered = qs.filter(([id]) => story.answers[id] !== undefined).length, who = name && name.trim() ? name.trim() : null;
    const bar = '<div class="tellbar"><span class="bar"><i style="width:' + (100 * answered) / qs.length + '%"></i></span><span class="small muted">' + answered + ' of ' + qs.length + '</span>' +
      (answered < qs.length ? '<button class="small ghost" data-act="storyRandom" data-ctx="' + ctx + '">Tell the rest for me</button>' : '') + '</div>';
    const back = at > 0 ? '<button class="small ghost" data-act="storyAt" data-ctx="' + ctx + '" data-i="' + (at - 1) + '">← Back</button>' : '<span></span>';
    if (at >= qs.length) {
      const bio = namedBio(race, who, story), done = storyDone(race, story);
      return '<div class="tell enter">' + bar + '<div class="tellpage">' + (ctx === 'creator' ? '' : taleArt(race, 'setting')) + '<div class="eyebrow">The tale so far</div><div class="storybio book">' + bioHtml(bio) + '</div>' +
        '<div class="storyq"><div class="qtext">Anything the tale left out? A secret, a name, a promise. (optional)</div><textarea id="storynotes" data-ctx="' + ctx + '" maxlength="' + L.notesMax + '" rows="3">' + esc(story.notes || '') + '</textarea></div>' +
        (threads.length ? '<div class="loresee threads"><span class="eyebrow">' + ico('lore') + ' Threads of this tale in the lore book</span>' + threads.map((k) => loreLink(k, null, 'chip lorechip')).join('') + '</div>' : '') +
        (done ? '' : '<p class="small bad">Some of the tale is still untold. Go back and answer the open questions.</p>') +
        '<div class="row between tellnav">' + back + (done ? finish : '<button class="small" data-act="storyAt" data-ctx="' + ctx + '" data-i="' + qs.findIndex(([id]) => story.answers[id] === undefined) + '">Answer what is left</button>') + '</div></div></div>';
    }
    const [id, title, text, opts, blocked] = qs[at], first = at === 0 || qs[at - 1][1] !== title;
    const later = qs.findIndex(([q], i) => i > at && story.answers[q] === undefined), nextOpen = later >= 0 ? later : qs.findIndex(([q]) => story.answers[q] === undefined) >= 0 ? qs.findIndex(([q]) => story.answers[q] === undefined) : qs.length;
    const chKey = Object.keys(L.chapters).find((k) => L.chapters[k][0] === title), chNo = Object.keys(L.chapters).indexOf(chKey) + 1;
    const scene = first ? '<p class="scene">' + esc(L.scenes[race][chKey]) + '</p>' : '';
    const beat = (sentence) => (who ? sentence.split('{name}').join(who) : sentence.replace(/^\{name\}/, 'Your hero').split('{name}').join('your hero'));
    const prev = !first && story.answers[qs[at - 1][0]] !== undefined ? namedBio(race, who, { answers: { [qs[at - 1][0]]: story.answers[qs[at - 1][0]], home: story.answers.home }, notes: '' }).filter(([t]) => t).map(([, p]) => p).join(' ') : '';
    const picked = story.answers[id], moment = picked !== undefined && window.ITT ? '<figure class="moment"><img class="taleart" alt="" src="' + ITT.answer(race, chKey, answerMotif(race, qs[at], picked)) + '"></figure>' : '';
    return '<div class="tell enter">' + bar + '<div class="tellpage">' + (moment || (ctx === 'creator' ? '' : taleArt(race, chKey))) + '<div class="eyebrow">Chapter ' + chNo + ' · ' + esc(title) + '</div>' + scene +
      (prev ? '<p class="prevbeat">' + esc(prev.split('. ').slice(-1)[0]) + '</p>' : '') +
      '<h3 class="tellq">' + esc(text) + '</h3>' +
      (blocked ? '<p class="small muted">' + esc(blocked) + '</p>' : '<div class="beats">' + opts.map(([v, label, sentence, note]) => {
        const line = sentence ? beat(sentence) : id === 'home' ? (who || 'Your hero') + ' was raised among the ' + label + ': ' + S.cfg.cultureInfo[race][v][1].charAt(0).toLowerCase() + S.cfg.cultureInfo[race][v][1].slice(1) + '.' : '';
        const emb = window.ITT ? '<img class="emb" alt="" src="' + ITT.emblem(answerMotif(race, qs[at], v)) + '">' : '';
        return '<button class="beat' + (emb ? ' has-emb' : '') + (story.answers[id] === v ? ' on' : '') + '" data-act="ans" data-ctx="' + ctx + '" data-q="' + id + '" data-v="' + v + '">' + emb + '<b>' + esc(label) + '</b>' + (line ? '<span>' + esc(line) + '</span>' : '') + (note ? '<small>' + esc(note) + '</small>' : '') + '</button>';
      }).join('') + '</div>') +
      '<div class="row between tellnav">' + back + (story.answers[id] !== undefined ? '<button class="primary" data-act="storyAt" data-ctx="' + ctx + '" data-i="' + nextOpen + '">Continue →</button>' : '<span class="small muted">Choose what happened.</span>') + '</div></div></div>';
  }

  // The creator is one tale told in order. Each step finishes a sentence: [step, the words that lead into it].
  const STEPS = [['race', 'There once was'], ['cls', 'who would one day answer the call of'], ['origin', 'But first they had to be born, under the sign of'], ['story', 'And this is how they grew up'], ['look', 'Anyone who met them on the road would have seen'], ['name', 'And their name was']];
  // Story words only: what each race, calling and sign is in the tale, never what it does in a fight.
  // [the words that finish the sentence, the rest of it]; anything missing falls back to the plain name.
  const TALE = {
    race: {
      human: ['a human', 'one of the many-handed, short-lived and stubborn, from the towns that rebuilt the world after the Breaking'],
      elf: ['an elf', 'one of the long-lived, who woke first under the stars and never forget anything'],
      dwarf: ['a dwarf', 'short, broad and patient as stone, from the deep halls under the Greyteeth'],
      orc: ['an orc', 'big, proud and loud, a child of the drum from the red steppe'],
      felkin: ['a felkin', 'quick and curious, from the dunes and the rooftops, who always landed on their feet'],
      draka: ['a draka', 'hatched in the fire peaks of Kaldera, with a flame inside and dragons for ancestors'],
    },
    cls: {
      guardian: ['the shield', 'and stand between their friends and whatever came out of the dark', 'Guardian'],
      warden: ['the wild roads', 'and let the forest wear them like armour, bark for skin and thorns for anyone too close', 'Warden'],
      cleric: ['the Undying Light', 'and carry it into the Hollows, to mend the wounded and burn away what does not belong', 'Cleric'],
      druid: ['the Green', 'and learn to heal the way spring does: slowly, then all at once', 'Druid'],
      ranger: ['the bow', 'and roam the far edges with the Wayfarers, very rarely wrong about where to shoot', 'Ranger'],
      mage: ['the weave', 'and pull fire, frost and raw force out of the world itself', 'Mage'],
      rogue: ['the quiet knife', 'and learn from the Quiet Hand to be somewhere else before anyone struck back', 'Rogue'],
    },
    origin: {
      anvil: ['the Anvil', 'in the first frost of winter, and they were patient and good with their hands from the start'],
      lantern: ['the Lantern', 'on the longest night of the year, when every window kept a light burning for them'],
      comet: ['the Comet', 'the year a wandering star crossed the sky, and nothing about them was ever predictable again'],
      fox: ['the Fox', 'at the thaw, clever from their first day and never quite where anyone was looking'],
      oak: ['the Oak', 'in the spring rains, rooted and very hard to knock down'],
      bell: ['the Bell', 'in the season of the muster, and they were loud from their very first breath'],
      tide: ['the Tide', 'at midsummer, calm and deep as the sea'],
      hare: ['the Hare', 'in high summer, and they were running before they could walk'],
      wolf: ['the Wolf', 'in late summer, fierce and loyal to their own'],
      hawk: ['the Hawk', 'at the harvest, sharp-eyed from the cradle'],
      ember: ['the Ember', 'by the light of the autumn fires, hot-blooded and bright'],
      crown: ['the Crown', "at the year's end, proud and generous, as if they were born to lead"],
    },
  };
  // Each calling's starting gear (Rules::CLASSES kit), so the calling page shows the hero dressed for it.
  const KIT = {
    guardian: { weapon: 'sword', offhand: 'shield', top: 'plate', bottom: 'greaves', shoes: 'sabatons' }, warden: { weapon: 'hammer', offhand: 'buckler', top: 'leather', bottom: 'kilt', shoes: 'boots' },
    cleric: { weapon: 'wand', offhand: 'book', top: 'robe', bottom: 'pants', shoes: 'boots' }, druid: { weapon: 'staff', offhand: 'none', top: 'robe', bottom: 'pants', shoes: 'sandals' },
    ranger: { weapon: 'bow', offhand: 'none', top: 'leather', bottom: 'pants', shoes: 'boots' }, mage: { weapon: 'staff', offhand: 'book', top: 'robe', bottom: 'pants', shoes: 'curly' }, rogue: { weapon: 'daggers', offhand: 'none', top: 'tunic', bottom: 'shorts', shoes: 'boots' },
  };
  // A picture from the tale art kit (tale-art.js), or nothing when it is not loaded.
  const taleArt = (race, chapter) => (window.ITT ? '<img class="taleart" alt="" src="' + ITT.scene(race, chapter) + '">' : '');
  // The emblem of one answer: [id, chapter, question, options] and the value picked.
  function answerMotif(race, q, v) {
    const o = q[3].find(([x]) => x === v); if (!o) return 'star';
    return ITT.motif(q[0], o[1], o[2] || (q[0] === 'home' ? S.cfg.cultureInfo[race][v][1] : ''));
  }
  // The scene behind each page of the creator: the race's homeland at the hour that suits the step.
  function taleBackdrop(c, step) {
    if (!window.ITT) return '';
    let ch = { race: 'setting', cls: 'age', origin: 'self', look: 'childhood', name: 'setting' }[step];
    if (step === 'origin' && (stepDone(c, 'origin') || (S.creatorPicked || {}).origin)) return ' style="--tale-bg:url(\'' + ITT.sign(c.origin) + '\')"';
    if (step === 'story') { const qs = storyQuestions(c.race, c.story), at = (S.storyAt || {}).creator || 0, L = S.cfg.lifeStory; ch = at >= qs.length ? 'setting' : Object.keys(L.chapters).find((k) => L.chapters[k][0] === qs[at][1]); }
    return ' style="--tale-bg:url(\'' + ITT.scene(c.race, ch) + '\')"';
  }
  const taleBit = (kind, id) => TALE[kind][id] || [kind === 'race' ? S.cfg.races[id].name : kind === 'cls' ? S.cfg.classes[id].name : S.cfg.origins[id][0], '', ''];
  // The opening of the tale as far as it has been told, one sentence per step: [step, sentence].
  function taleOpening(c, upTo) {
    const out = [], r = taleBit('race', c.race), k = taleBit('cls', c.cls), o = taleBit('origin', c.origin), seen = (s) => stepDone(c, s) || STEPS.findIndex(([x]) => x === s) < upTo;
    if (seen('race')) out.push(['race', 'There once was ' + r[0] + (r[1] ? ', ' + r[1] : '') + '.']);
    if (seen('cls')) out.push(['cls', 'One day they would answer the call of ' + k[0] + (k[1] ? ', ' + k[1] : '') + (k[2] ? '. They would be a ' + k[2] : '') + '.']);
    if (seen('origin')) out.push(['origin', 'But first they had to be born, under the sign of ' + o[0] + (o[1] ? ', ' + o[1] : '') + '.']);
    return out;
  }

  // The whole tale as the name page tells it: the opening, then the life story with the name in it.
  const wholeTale = (c) => bioHtml(taleOpening(c, STEPS.length).map(([, l]) => ['', l])) + bioHtml(namedBio(c.race, c.name, c.story));

  function creatorView() {
    const c = creatorState(), cfg = S.cfg, R = ITP.RACES[c.race], step = S.creatorStep, idx = STEPS.findIndex(([s]) => s === step);
    const sw = (key, list, title) => '<div><label>' + title + '</label><div class="swatches">' + list.map((v) => '<span class="sw ' + (String(c.look[key]) === String(v) ? 'on' : '') + '" style="background:' + v + '" data-act="look" data-key="' + key + '" data-v="' + v + '" title="' + v + '"></span>').join('') + '</div></div>';
    const seg = (key, values, title) => '<div><label>' + title + '</label><div class="seg">' + Object.entries(values).map(([v, n]) => '<button class="small ' + (String(c.look[key]) === String(v) ? 'on' : '') + '" data-act="look" data-key="' + key + '" data-v="' + v + '">' + esc(n) + '</button>').join('') + '</div></div>';
    // a choice is the next words of the sentence, with the rest of it underneath; a calling also shows its role
    const words = (kind, list) => '<div class="words' + (list.some((x) => x[4]) ? ' cards' : '') + '">' + list.map(([id, w, rest, tag, art]) => '<button class="word' + (c[kind] === id && chosen(kind) ? ' on' : '') + '" data-act="pick" data-kind="' + kind + '" data-id="' + id + '">' + (art ? '<span class="art">' + art + '</span>' : '') + '<span class="wtxt"><b>' + esc(w) + '</b>' + (tag || '') + (rest ? '<em class="rest">' + esc(rest) + '</em>' : '') + '</span></button>').join('') + '</div>';
    const chosen = (s) => stepDone(c, s) || !!(S.creatorPicked || {})[s];
    // what has been told so far; each sentence turns back to its page
    const told = (n) => { const t = taleOpening(c, n).filter(([s]) => STEPS.findIndex(([x]) => x === s) < n); return t.length ? '<p class="told">' + t.map(([s, line]) => '<a href="#" data-act="cstep" data-s="' + s + '" title="Tell this part again">' + esc(line) + '</a>').join(' ') + '</p>' : ''; };
    const lead = () => '<h2 class="lead">' + (step === 'cls' ? '…' : '') + esc(STEPS[idx][1]) + '…</h2>';
    let body = '';
    if (step === 'race') body = lead() + words('race', Object.keys(cfg.races).map((id) => [id, ...taleBit('race', id), '', spr(plain(c, id), 2.5, 'idle')]));
    else if (step === 'cls') body = told(idx) + lead() + words('cls', Object.keys(cfg.classes).map((id) => { const t = taleBit('cls', id); return [id, t[0], (t[1] ? t[1].charAt(4).toUpperCase() + t[1].slice(5) + '.' : '') + (t[2] ? ' A ' + t[2] + '.' : ''), role(cfg.classes[id].role), spr({ ...plain(c), ...(KIT[id] || {}) }, 2.5, 'idle')]; }));
    else if (step === 'origin') body = told(idx) + lead() + words('origin', Object.keys(cfg.origins).map((id) => { const t = taleBit('origin', id); return [id, t[0], t[1] ? t[1].charAt(0).toUpperCase() + t[1].slice(1) + '.' : '', '', window.ITT ? '<img class="signart" alt="" src="' + ITT.sign(id) + '">' : '']; }));
    else if (step === 'story') body = storyWizard(c.race, c.name, c.story, 'creator', '<button class="primary" data-act="cstep" data-s="look">Go on →</button>');
    else if (step === 'look') {
      const tab = S.lookTab || 'face', TABS = { face: 'Face', hair: 'Hair', body: 'Body', clothes: 'Clothes' };
      const opts = {
        face: () => sw('skin', R.skins, 'Skin') + sw('eyeColor', ITP.EYES, 'Eye colour') + seg('eyes', ITP.OPTIONS.eyes, 'Eyes') + seg('mouth', ITP.OPTIONS.mouth, 'Expression') + seg('acc', ITP.OPTIONS.acc, 'Accessory'),
        hair: () => sw('hairColor', ITP.HAIRS, 'Hair colour') + seg('hair', ITP.OPTIONS.hair, 'Hair') + seg('beard', ITP.OPTIONS.beard, 'Facial hair'),
        body: () => seg('build', { 0.92: 'Slim', 1: 'Average', 1.1: 'Broad' }, 'Build') + seg('height', { 0.95: 'Short', 1: 'Average', 1.05: 'Tall' }, 'Height'),
        clothes: () => sw('dye1', ITP.DYES, 'Clothes') + sw('dye2', ITP.DYES, 'Trim') + sw('metal', ITP.METALS, 'Buckles'),
      };
      body = lead() + '<div class="likeness"><div class="stage' + (S.faceLeft ? ' left' : '') + '">' + spr(plain(c), 7, 'idle') +
        '<div class="row stagebtns"><button class="small" data-act="faceTurn" title="Turn around">' + (S.faceLeft ? '→ Face right' : '← Face left') + '</button><button class="small ghost" data-act="randomLook">Someone else</button></div></div>' +
        '<div class="lookui"><div class="seg looktabs">' + Object.entries(TABS).map(([t, n]) => '<button class="small' + (t === tab ? ' on' : '') + '" data-act="lookTab" data-t="' + t + '">' + n + '</button>').join('') + '</div><div class="lookgrid">' + opts[tab]() + '</div></div></div>';
    } else {
      const ok = storyDone(c.race, c.story);
      body = lead() + '<input id="cname" class="bigname" value="' + esc(c.name) + '" maxlength="20" placeholder="…" autocomplete="off" aria-label="Their name">' +
        (ok ? '<div class="storybio book namebio">' + wholeTale(c) + '</div>' : '<p class="told">Their life story is not finished yet. <a href="#" data-act="cstep" data-s="story">Finish it</a></p>') +
        '<p class="small muted">Once their tale is told it stays told. Only their looks can change later.</p>';
    }
    const prev = STEPS[idx - 1];
    // the choice pages keep the chosen words and the way on in a bar at the bottom, so they stay in view on a phone
    const pickStep = ['race', 'cls', 'origin'].includes(step), line = pickStep && chosen(step) ? (taleOpening(c, idx + 1).find(([s]) => s === step) || [])[1] : '';
    const nav = '<div class="row between cnav' + (pickStep ? ' choosebar' : '') + '">' + (prev ? '<button class="ghost" data-act="cstep" data-s="' + prev[0] + '">← Back</button>' : '<span></span>') +
      (pickStep ? '<p class="chosen">' + (line ? esc(line) : '<span class="muted">Choose how the tale goes on.</span>') + '</p>' + (line ? '<button class="primary" data-act="cstep" data-s="' + STEPS[idx + 1][0] + '">Continue →</button>' : '<span></span>') : '') +
      (step === 'look' ? '<button class="primary" data-act="cstep" data-s="name">Continue →</button>' : step === 'name' ? '<button class="primary big" data-act="create">Begin their tale</button>' : '') + '</div>';
    const doneN = STEPS.filter(([s]) => stepDone(c, s)).length, anim = S.creatorAnim ? ' enter ' + S.creatorAnim : '';
    S.creatorAnim = null;
    return '<div class="creator tale"' + taleBackdrop(c, step) + '><div class="logo">Idle <span>Teams</span></div><div class="panel cmain"><span class="bar cprogress"><i style="width:' + (100 * doneN) / STEPS.length + '%"></i></span>' +
      '<div class="cbody' + anim + '">' + body + '</div>' + (step === 'story' ? (prev ? '<div class="row between cnav"><button class="ghost" data-act="cstep" data-s="' + prev[0] + '">← Back a page</button><span></span></div>' : '') : nav) + '</div></div>';
  }

  // ------------------------------------------------------------------ shell

  // [view, title, icon, hotkey]. The battle view is the open scene; every other view opens as a window over it.
  const VIEWS = [['battle', 'Dungeon', 'battle', '1'], ['hero', 'Hero', 'hero', '2'], ['skills', 'Skills', 'skills', '3'], ['talents', 'Talents', 'talents', '4'], ['heritage', 'Heritage', 'heritage', '5'], ['gear', 'Gear', 'gear', '6'], ['group', 'Group', 'group', '7'], ['guild', 'Guild', 'guild', '8'], ['market', 'Market', 'market', '9'], ['runs', 'Runs', 'chest', '0'], ['lore', 'Lore', 'lore', 'l']];
  const WIN_TITLE = { story: ['Life story', 'heritage'], settings: ['Settings', 'hero'] };
  function shell() {
    const h = S.st.hero, p = S.st.party, cur = S.battle && S.battle.current, cfg = S.cfg;
    if (S.chatInit == null) { S.chatInit = 1; S.chatOpen = window.innerWidth > 1100; }
    const dots = { battle: 0, runs: S.st.pendingRolls, hero: h.points.unspent + h.openKeystones.length + (h.level >= cfg.pathLevel && !h.path ? 1 : 0), skills: h.skillPoints, talents: h.talentPoints.free, heritage: h.renown.free, group: S.st.invites.length + (p ? p.requests.filter((r) => r.kind === 'application').length : 0) };
    const views = { battle: battleView, hero: heroView, skills: skillsView, talents: talentsView, heritage: heritageView, story: storyView, gear: gearView, group: groupView, guild: guildView, market: marketView, runs: runsView, lore: loreView, settings: settingsView };
    const isWin = S.view !== 'battle' && views[S.view];
    // top: who you are, where the run is, what you carry
    const plate = '<a class="plate" href="#/hero" title="Hero (2)">' + por(h.look, 'pframe') + '<b class="lv">' + h.level + '</b><span class="pl-txt"><b>' + esc(h.name) + '</b><span>' + esc(className(h.cls)) + '</span><span class="xpbar" title="' + fmt(h.xp) + ' / ' + fmt(h.xpNext) + ' XP"><i style="width:' + Math.min(100, (100 * h.xp) / h.xpNext) + '%"></i><em>' + fmt(h.xp) + ' / ' + fmt(h.xpNext) + ' XP</em></span></span></a>';
    const center = cur ? '<div class="runbar"><div class="rb-title">' + esc(cfg.dungeon.name) + ' <span>· level ' + cur.dungeonLevel + '</span></div><div class="track" id="track">' + cfg.dungeon.plan.map(([kind, name], n) => '<span class="node ' + kind + '" data-n="' + n + '" title="' + esc(name) + '">' + (kind === 'boss' ? esc(name) : '') + '</span>').join('') + '</div><div class="clock" id="clock"></div></div>'
      : '<div class="runbar idle"><div class="rb-title">' + (p ? esc(p.name) : 'The tavern camp') + '</div><div class="small">' + (p ? (p.running ? 'Between runs' : 'Resting at camp') : 'No group yet') + '</div></div>';
    const purse = '<div class="purse"><span class="coin" title="Gold">' + ico('gold') + '<b>' + fmt(h.gold) + '</b></span><span class="coin" title="Materials">' + ico('materials') + '<b>' + fmt(h.materials) + '</b></span><span class="coin ess" title="Essence">' + ico('essence') + '<b>' + fmt(h.essence) + '</b></span><a class="small cog btn" href="#/settings" title="Settings, account and moderation">⚙<span class="lbl"> Settings</span>' + (S.st.user && S.st.user.admin && S.st.user.reports ? ' <span class="gem">' + S.st.user.reports + '</span>' : '') + '</a></div>';
    // left: the group's unit frames, live during a run
    const roster = cur ? cur.roster : p ? p.members.map((m) => ({ id: m.id, name: m.name, cls: m.cls, level: m.level, look: m.look, resource: cfg.classes[m.cls].resource, role: m.role })) : [{ id: h.id, name: h.name, cls: h.cls, level: h.level, look: h.look, resource: cfg.classes[h.cls].resource }];
    const frames = '<div class="hud-party">' + roster.map((r, i) => '<div class="uf' + (r.id === h.id ? ' me' : '') + '" id="fr' + i + '">' + por(r.look, 'pframe sm') + '<div class="uf-body"><div class="uf-nm"><b>' + esc(r.name) + '</b><span>' + r.level + '</span></div><div class="bar"><i class="hp" style="width:100%"></i><i class="abs" style="width:0"></i></div><div class="bar res"><i class="' + r.resource + '" style="width:100%"></i></div></div></div>').join('') +
      (p && p.members.length < cfg.partySize && !cur ? '<a class="uf open" href="#/group"><span class="pframe sm"></span><div class="uf-body"><b>' + (cfg.partySize - p.members.length) + ' open seat' + (cfg.partySize - p.members.length === 1 ? '' : 's') + '</b><span class="small">Find heroes</span></div></a>' : '') + '</div>';
    // bottom: health orb, the action bar, resource orb
    const res = cfg.classes[h.cls].resource;
    const slots = VIEWS.map(([id, n, i, key]) => '<a href="#/' + id + '" class="slot' + (S.view === id ? ' on' : '') + '" title="' + n + ' (' + key + ')">' + ico(i, '') + '<span class="lbl">' + n + '</span><kbd>' + key + '</kbd>' + (dots[id] ? '<span class="gem">' + dots[id] + '</span>' : '') + '</a>').join('') +
      '<a href="#" class="slot chat-slot' + (S.chatOpen ? ' on' : '') + '" data-act="toggleChat" title="Chat (Enter)">' + ico('chat', '') + '<span class="lbl">Chat</span><kbd>↵</kbd></a>';
    const bar = '<nav class="hud-bar"><div class="orb hp" id="orbHp" title="Health"><i style="height:100%"></i><span>100%</span></div><div class="slots">' + slots + '</div><div class="orb ' + res + '" id="orbRes" title="' + esc(res) + '"><i style="height:100%"></i><span>' + esc(res) + '</span></div></nav>';
    const log = cur ? '<div class="hud-log' + (S.logShut ? ' shut' : '') + '"><div class="hud-tt"><span>' + ico('battle') + 'Battle log</span><button class="small" data-act="toggleLog" aria-label="Toggle log">' + (S.logShut ? '▴' : '▾') + '</button></div><div class="log" id="blog"></div></div>' : '';
    const me = h.id, rolls = S.battle && S.battle.chests.some((c) => c.chest.some((e) => !e.rolls[me]));
    const loot = rolls && !isWin ? '<div class="hud-loot">' + chestsView() + '</div>' : '';
    const card = !isWin ? battleView() : '';
    const title = isWin ? (VIEWS.find(([id]) => id === S.view) || [S.view, ...(WIN_TITLE[S.view] || [S.view, 'star'])]) : null;
    const win = isWin ? '<a class="win-shade" href="#/battle" aria-label="Close"></a><section class="win" role="dialog" aria-label="' + esc(title[1]) + '"><header class="win-hd"><span class="win-ic">' + ico(title[2], '') + '</span><h2>' + esc(title[1]) + '</h2><a class="win-x" href="#/battle" title="Close (Esc)">✕</a></header><div class="win-body">' + views[S.view]() + '</div></section>' : '';
    // entrance animations play when the screen changes, not on every refresh
    const fresh = S.hudView !== S.view || S.hudRun !== !!cur; S.hudView = S.view; S.hudRun = !!cur;
    return '<div class="hud' + (isWin ? ' has-win' : '') + (cur ? ' in-run' : '') + (fresh ? ' fresh' : '') + '"><div class="hud-stage"><canvas id="scene" width="960" height="540"></canvas></div>' +
      '<header class="hud-top">' + plate + center + purse + '</header>' + frames + (card ? '<div class="hud-card">' + card + '</div>' : '') + loot + log +
      '<aside class="side hud-chat' + (S.chatOpen ? ' open' : '') + '">' + chatView() + '</aside>' + bar + win + '</div>';
  }

  // ------------------------------------------------------------------ battle

  function battleView() {
    const st = S.st, p = st.party;
    if (!p) {
      return '<div class="camp"><div class="eyebrow">' + esc(S.cfg.dungeon.name) + '</div><h1>No group yet</h1><p class="muted" style="max-width:52ch;margin:8px auto 0">Dungeons are run by a group of five real heroes. Find one on the tavern board, or start your own and invite people.</p>' +
        '<div style="margin-top:16px"><a href="#/group"><button class="primary big">Go to the tavern</button></a></div></div>';
    }
    const cur = S.battle && S.battle.current;
    if (cur) return '';
    const last = S.battle ? [...S.battle.chests, ...S.battle.recent].sort((a, c) => c.endsAt - a.endsAt)[0] : null;
    const wiped = !p.running && p.members.length === S.cfg.partySize && last && last.report.wiped;
    if (wiped) {
      const r = last.report;
      return '<div class="camp wipe"><div class="eyebrow">' + esc(S.cfg.dungeon.name) + ' · level ' + last.dungeonLevel + '</div><h1>' + ico('skull', 'ico lg') + ' The group fell</h1>' +
        '<p style="margin-top:6px">' + esc(r.cause || 'The group wiped.') + '</p><p class="muted small">Battles stop after a wipe. Change gear, skills or attributes, ask in group chat, and send everyone back in when you are ready.</p>' +
        '<div class="row" style="margin-top:16px;justify-content:center"><button class="primary big" data-act="resume">Back into the dungeon</button><a href="#/gear"><button>Gear</button></a><a href="#/skills"><button>Skills</button></a><a href="#/hero"><button>Attributes</button></a>' + (p.leader === st.hero.id ? '<a href="#/group"><button>Change difficulty</button></a>' : '') + '</div></div>';
    }
    const why = p.members.length < S.cfg.partySize ? 'The group needs ' + (S.cfg.partySize - p.members.length) + ' more hero' + (S.cfg.partySize - p.members.length === 1 ? '' : 'es') + '. The next run starts as soon as it is full.' : !p.running ? 'The group is resting. The leader can send it back in from the Group window.' : 'The next run is about to start…';
    return '<div class="camp"><div class="eyebrow">' + esc(S.cfg.dungeon.name) + '</div><h1>' + esc(p.name) + '</h1><p class="muted" style="margin-top:6px">' + why + '</p>' +
      (p.members.length < S.cfg.partySize ? '<div style="margin-top:14px"><a href="#/group"><button class="primary big">Find heroes</button></a></div>' : '') + '</div>';
  }
  function runsView() {
    const html = chestsView() + reportsView();
    return html ? '<div class="stack">' + html + '</div>' : '<p class="muted">No runs yet. When your group finishes a run, the report and the group chest land here.</p>';
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
    if (!cv) return;
    if (!scn.camp) scn.camp = new window.ITArena.Camp(cv);
    scn.camp.cv = cv; scn.camp.g = cv.getContext('2d');
    if (!cur) return;
    if (!scn.arena) scn.arena = new window.ITArena.Arena(cv, { log: logLine, hud: true });
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
  function updateFrame(i, snap, mine) {
    const el = document.getElementById('fr' + i); if (!el || !snap) return;
    if (mine) {
      const o = $('#orbHp'), r = $('#orbRes'), hp = Math.max(0, snap[1][i] / 10), rs = snap[2][i] / 10;
      if (o) { o.firstChild.style.height = hp + '%'; o.lastChild.textContent = Math.round(hp) + '%'; o.classList.toggle('low', hp < 35); }
      if (r) { r.firstChild.style.height = rs + '%'; }
    }
    const hp = snap[1][i], res = snap[2][i], ab = snap[4][i];
    const bars = el.querySelectorAll('.bar i');
    bars[0].style.width = hp / 10 + '%'; bars[0].className = 'hp' + (hp < 350 ? ' low' : '');
    bars[1].style.width = Math.min(100, ab / 10) + '%';
    bars[2].style.width = res / 10 + '%';
    el.classList.toggle('dead', hp <= 0);
  }
  function frame() {
    requestAnimationFrame(frame);
    if (!S.st || !S.st.hero || !$('#scene')) return;
    const cur = S.battle && S.battle.current; const tl = cur && S.timelines[cur.id];
    // a phone with a window open covers the scene, so skip the drawing there
    if (S.view !== 'battle' && window.innerWidth <= 900) return;
    if (!cur || !tl || !scn.arena) {
      if (scn.camp) { const p = S.st.party, h = S.st.hero; scn.camp.draw(p ? p.members : [{ name: h.name, cls: h.cls, look: h.look }], 0); if (window.ITS) window.ITS.scene('town'); }
      return;
    }
    const simT = simTime(cur, tl), snap = snapAt(tl, simT);
    scn.arena.update(cur, tl, simT);
    scn.arena.draw(cur, tl, simT, snap);
    cur.roster.forEach((r, i) => updateFrame(i, snap, r.id === S.st.hero.id));
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
    g.fillStyle = '#140e07'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#513c27'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(0, Y(0.5)); g.lineTo(W, Y(0.5)); g.stroke(); g.setLineDash([]);
    g.beginPath(); for (let x = 0; x <= W; x++) { const p = Math.min(d.cap, curve((x / W) * maxX)) * (d.half ? 0.5 : 1); if (x) g.lineTo(x, Y(p)); else g.moveTo(x, Y(p)); }
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = 'rgba(255,138,42,0.15)'; g.fill();
    g.beginPath(); for (let x = 0; x <= W; x++) { const p = Math.min(d.cap, curve((x / W) * maxX)) * (d.half ? 0.5 : 1); if (x) g.lineTo(x, Y(p)); else g.moveTo(x, Y(p)); }
    g.strokeStyle = '#ff8a2a'; g.lineWidth = 2; g.stroke();
    const me = Math.min(d.cap, curve(d.p)) * (d.half ? 0.5 : 1), mx = Math.min(W - 4, (d.p / maxX) * W);
    g.fillStyle = '#7be07f'; g.beginPath(); g.arc(mx, Y(me), 5, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#140e07'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#f4ead8'; g.font = '13px "Lilita One", sans-serif'; g.fillText(pct(me), Math.min(W - 44, mx + 8), Math.max(14, Y(me) - 6));
    g.fillStyle = '#9e8d74'; g.font = '11px Nunito, sans-serif'; g.fillText('50%', 4, Y(0.5) - 4);
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
    return '<div class="stack"><div class="panel"><h2>Write your life story</h2><p class="muted">Every ' + esc(S.cfg.races[h.race].name) + ' has a story before the tavern. Tell ' + esc(h.name) + "'s, one moment at a time. It is written once.</p>" +
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
      '<div class="panel"><div class="head"><h2>Bag</h2><span class="muted small">' + bag.length + ' items</span></div><div class="bag slots-grid">' + bag.map((i) => tile(i, { sel: S.sel === i.id, up: i.score != null && betterThanWorn(i, worn) })).join('') + Array.from({ length: Math.ceil(Math.max(24, bag.length + 1) / 6) * 6 - bag.length }, () => '<div class="tile empty"></div>').join('') + '</div>' + (bag.length ? '' : '<p class="muted small" style="margin-top:8px">Loot comes from the group chest, crafting and the market.</p>') + '</div></div></div>';
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
      if (!m.author) return '<div class="msg sys">' + esc(m.body) + card + '</div>';
      const who = m.author.id === S.st.hero.id ? '<span class="a">' + esc(m.author.name) + '</span>' : '<button class="a who" data-act="chatWho" data-id="' + m.id + '" title="Report or block">' + esc(m.author.name) + '</button>';
      return '<div class="msg">' + who + esc(m.body) + card + '</div>';
    }).join('');
    return '<div class="chat-tabs">' + Object.entries(chans).map(([id, n]) => '<button class="' + (id === ch ? 'on' : '') + '" data-act="chan" data-id="' + id + '">' + n + '</button>').join('') + '<button class="small chat-close" data-act="toggleChat" aria-label="Close chat">✕</button></div><div class="msgs">' + (msgs || '<p class="muted small">Nothing said yet.</p>') + '</div>' + chatInput() + '';
  }
  function chatInput() {
    const mute = S.st.user && S.st.user.mutedUntil;
    if (mute) return '<form class="chat-in" data-form="chat"><input disabled placeholder="Muted until ' + new Date(mute * 1000).toLocaleString([], mute - Date.now() / 1000 > 72000 ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }) + '" title="A moderator muted this account" aria-label="Message"><button type="submit" disabled>Send</button></form>';
    return '<form class="chat-in" data-form="chat"><input id="chatBody" name="body" maxlength="500" placeholder="Say something" autocomplete="off" aria-label="Message"><button type="submit">Send</button></form>';
  }
  const REPORT_REASONS = [['abuse', 'Abuse or harassment'], ['spam', 'Spam or selling gold'], ['cheat', 'Cheating'], ['other', 'Something else']];
  function chatWho(id) {
    const m = Object.values(S.chat.msgs).flat().find((x) => x.id === +id);
    if (!m || !m.author) return;
    modal('<h3>' + esc(m.author.name) + '</h3><p class="small muted">“' + esc(m.body) + '”</p>' +
      '<div class="eyebrow">Report this line</div><div class="row wrap">' + REPORT_REASONS.map(([k, n]) => '<button class="small" data-act="report" data-id="' + m.id + '" data-r="' + k + '">' + n + '</button>').join('') + '</div>' +
      '<div class="eyebrow">Or stop seeing them</div><div class="row"><button class="small" data-act="blockHero" data-hid="' + m.author.id + '">Block ' + esc(m.author.name) + '</button><button class="small ghost" data-act="closeModal">Cancel</button></div>' +
      '<p class="small muted">Blocked heroes\' lines disappear from your chat. You can unblock them in Settings.</p>');
  }

  // ------------------------------------------------------------------ settings, account and moderation

  function settingsView() {
    const u = S.st.user || {}, blocked = u.blocked || [];
    const email = window.IT_SERVER ? '<p class="small muted">Email and password reset need the real server; this playable build keeps everything in your browser.</p>'
      : '<form data-form="email" class="row wrap"><input name="email" type="email" required placeholder="you@example.com" value="' + esc(u.email || '') + '" style="flex:1;min-width:200px" autocomplete="email"><button type="submit">' + (u.email ? 'Change' : 'Add email') + '</button></form>' +
        (u.email ? '<p class="small ' + (u.emailVerified ? 'good' : 'muted') + '">' + (u.emailVerified ? '✓ Confirmed. You can reset your password with it.' : 'Not confirmed yet: open the link in the mail we sent.') + '</p>' : '<p class="small muted">Add an address so you can reset your password if you forget it. It is never shown to other players.</p>');
    const mod = u.admin ? '<div class="panel"><h3>Moderation</h3>' + modView() + '</div>' : '';
    return '<div class="stack"><div class="panel"><h3>Account</h3><p class="small">Logged in as <b>' + esc(u.username || '') + '</b></p>' + email + '</div>' + pushView() +
      '<div class="panel"><h3>Blocked heroes</h3>' + (blocked.length ? blocked.map((b) => '<div class="row between"><span>' + esc(b.name) + '</span><button class="small" data-act="unblock" data-hid="' + b.id + '">Unblock</button></div>').join('') : '<p class="small muted">Nobody. To block someone, tap their name in chat.</p>') + '</div>' +
      mod + '<div class="row"><button data-act="logout">' + (window.IT_SERVER ? 'New game' : 'Log out') + '</button></div></div>';
  }
  function modView() {
    if (!S.reports) { loadReports(); return '<p class="small muted">Loading reports…</p>'; }
    if (!S.reports.length) return '<p class="small muted">No open reports.</p>';
    return S.reports.map((r) => '<div class="report"><div class="small muted">' + esc(r.reporter) + ' reported <b>' + esc(r.author.hero || r.author.user) + '</b> (' + esc(r.author.user) + ') for ' + esc(r.reason) + (r.author.mutedUntil ? ' · muted now' : '') + '</div><p>“' + esc(r.body) + '”</p>' +
      '<div class="row wrap"><button class="small" data-act="modDo" data-id="' + r.id + '" data-o="dismiss">Nothing wrong</button><button class="small" data-act="modDo" data-id="' + r.id + '" data-o="remove">Remove line</button><button class="small" data-act="modDo" data-id="' + r.id + '" data-o="mute" data-h="24">Remove and mute 24h</button><button class="small" data-act="modDo" data-id="' + r.id + '" data-o="mute" data-h="168">Mute a week</button></div></div>').join('');
  }
  async function loadReports() {
    try { S.reports = await get('/admin/reports'); } catch (e) { S.reports = []; toast(e.message); }
    if (S.view === 'settings') render();
  }

  // ------------------------------------------------------------------ notifications (Web Push)

  // S.push: null while unknown, else { ok: can this browser do it, on: subscribed here, busy }
  function pushSupported() { return !window.IT_SERVER && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  async function pushInit() {
    if (!pushSupported()) { S.push = { ok: false, on: false }; return; }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      S.push = { ok: !!S.cfg.pushKey, on: !!sub };
      // Keep the server's copy fresh: a browser may rotate the address.
      if (sub && S.st) post('/push/subscribe', { endpoint: sub.endpoint }).catch(() => null);
    } catch (e) { S.push = { ok: false, on: false }; }
    if (S.view === 'settings') render();
  }
  function b64ToBytes(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
  async function pushOn() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(perm === 'denied' ? 'Notifications are blocked for this site in your browser settings.' : 'No notifications then.'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(S.cfg.pushKey) });
    await post('/push/subscribe', { endpoint: sub.endpoint });
    S.push.on = true; toast('Notifications are on for this device.', true);
  }
  async function pushOff() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => null); await sub.unsubscribe(); }
    if (S.push) S.push.on = false;
  }
  function pushView() {
    const p = S.push;
    let body;
    if (window.IT_SERVER) body = '<p class="small muted">Notifications need the real server; this playable build only runs while the page is open.</p>';
    else if (!p) body = '<p class="small muted">Checking this browser…</p>';
    else if (!pushSupported()) body = '<p class="small muted">This browser cannot show notifications. On iPhone, add Idle Teams to your home screen first.</p>';
    else if (!p.ok) body = '<p class="small muted">Notifications are not set up on this server yet.</p>';
    else body = '<p class="small">' + (p.on ? '✓ On for this device. ' : '') + 'We tell you when your group falls, when there is loot to roll on, when you level up and when someone invites you. Only while you are away from the game.</p>' +
      '<div class="row"><button data-act="push" data-on="' + (p.on ? 0 : 1) + '"' + (p.busy ? ' disabled' : '') + '>' + (p.on ? 'Turn off' : 'Turn on notifications') + '</button></div>';
    return '<div class="panel"><h3>Notifications</h3>' + body + '</div>';
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

  // ------------------------------------------------------------------ HUD feel

  // Hovering an item shows its card, with how it compares to what you wear.
  const tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.hidden = true; document.body.appendChild(tipEl);
  function showTip(el, x, y) {
    const it = TIPS[+el.dataset.tip]; if (!it) return;
    let cmp = '';
    if (S.st && S.st.inventory && it.slot !== 'glyph' && it.score != null && !it.equipped) {
      const worn = S.st.inventory.find((w) => w.equipped === it.slot || (it.slot === 'ring1' && w.equipped === 'ring2'));
      cmp = worn && worn.id !== it.id ? '<div class="tip-cmp ' + (it.score >= worn.score ? 'good' : 'bad') + '">' + (it.score >= worn.score ? '▲ +' : '▼ ') + (it.score - worn.score).toFixed(1) + ' rating vs ' + esc(itemName(worn)) + '</div>' : worn ? '' : '<div class="tip-cmp good">▲ Fills an empty slot</div>';
    }
    tipEl.innerHTML = itemCard(it) + cmp; tipEl.className = 'tip t-' + it.rarity; tipEl.hidden = false;
    const r = tipEl.getBoundingClientRect(), pad = 14;
    tipEl.style.left = Math.min(window.innerWidth - r.width - 8, x + pad) + 'px';
    tipEl.style.top = Math.max(8, Math.min(window.innerHeight - r.height - 8, y + pad)) + 'px';
  }
  document.addEventListener('mouseover', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else tipEl.hidden = true; });
  document.addEventListener('mousemove', (e) => { if (!tipEl.hidden) { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); } });
  window.addEventListener('hashchange', () => { tipEl.hidden = true; });

  // Reward popups: a finished run, loot you won, a new level. They sit outside #app so a re-render keeps them.
  const celebrate = {
    el: null,
    show(html, kind) {
      this.close();
      const el = document.createElement('div'); el.className = 'reward ' + (kind ? 'rw-' + kind : ''); el.innerHTML = '<div class="reward-box"><div class="rays"></div>' + html + '<button class="primary big" data-act="rewardClose">Continue</button></div>';
      el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
      document.body.appendChild(el); hydrate(el); this.el = el;
      el.querySelectorAll('[data-count]').forEach((n) => { const to = +n.dataset.count, t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 900); n.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); });
    },
    close() { if (this.el) { this.el.remove(); this.el = null; } },
    // a run you were in finished since you last looked
    run(b) {
      const h = S.st && S.st.hero; if (!h) return;
      const list = [...b.chests, ...b.recent].sort((a, c) => c.endsAt - a.endsAt), last = list[0]; if (!last) return;
      const key = 'it-seen-run-' + h.id; let seen = null;
      try { seen = localStorage.getItem(key); localStorage.setItem(key, String(last.id)); } catch (e) { /* private mode */ }
      if (seen == null || seen === String(last.id)) return;
      const r = last.report, mine = r.heroes.find((x) => x.name === h.name); if (!mine) return;
      const won = !r.wiped, loot = last.chest.filter((e) => e.winner === h.id);
      const stat = (icon, n, label) => '<div class="rw-stat">' + ico(icon, 'ico lg') + '<b data-count="' + n + '">0</b><span>' + label + '</span></div>';
      this.show('<div class="eyebrow">' + esc(r.dungeon) + ' · level ' + last.dungeonLevel + '</div><h1 class="rw-title">' + (won ? 'Victory!' : 'Defeat') + '</h1><p class="muted">' + (won ? 'The group cleared the dungeon.' : esc(r.cause || 'The group fell.')) + ' ' + r.bossesKilled + '/3 bosses down.</p>' +
        '<div class="rw-stats">' + stat('xp', mine.xp, 'XP') + stat('gold', mine.gold, 'Gold') + stat('materials', mine.materials, 'Materials') + stat('heritage', mine.renown, 'Renown') + '</div>' +
        (loot.length ? '<div class="rw-loot">' + loot.map((e) => tile(e.item, { act: false, big: true })).join('') + '</div>' : last.chest.some((e) => !e.rolls[h.id]) ? '<p class="small">The group chest is open. Roll for loot before it closes.</p>' : ''), won ? 'win' : 'lose');
      if (window.ITS) window.ITS.play(won ? 'bossDown' : 'death');
    },
    level(h) {
      this.show('<div class="eyebrow">' + esc(h.name) + '</div><h1 class="rw-title">Level ' + h.level + '!</h1><p>New attribute points, skill points and talent points are waiting.</p><div class="row" style="justify-content:center;margin-top:10px"><a href="#/hero"><button>Attributes</button></a><a href="#/skills"><button>Skills</button></a><a href="#/talents"><button>Talents</button></a></div>', 'level');
      if (window.ITS) window.ITS.play('levelup');
    },
  };

  // Hotkeys: 1-0 open windows, Esc closes, Enter opens chat.
  document.addEventListener('keydown', (e) => {
    if (!S.st || !S.st.hero || e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { if (celebrate.el) celebrate.close(); else if (typing) e.target.blur(); else if (S.view !== 'battle') location.hash = '#/battle'; return; }
    if (typing) return;
    const v = VIEWS.find((x) => x[3] === e.key);
    if (v) { e.preventDefault(); location.hash = '#/' + (S.view === v[0] ? 'battle' : v[0]); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (!S.chatOpen) handlers.toggleChat(); else { const c = $('#chatBody'); if (c) c.focus(); } }
  });

  // Click sparks: a few pixels fly off every button and slot you press.
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('button, .slot, .tile[data-act], .choice, .storyopt');
    if (!el || el.disabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let k = 0; k < 7; k++) {
      const sp = document.createElement('i'); sp.className = 'spark';
      const a = (Math.PI * 2 * k) / 7 + Math.random() * 0.5, d = 18 + Math.random() * 22;
      sp.style.left = e.clientX + 'px'; sp.style.top = e.clientY + 'px'; sp.style.setProperty('--dx', Math.cos(a) * d + 'px'); sp.style.setProperty('--dy', Math.sin(a) * d - 10 + 'px');
      document.body.appendChild(sp); setTimeout(() => sp.remove(), 520);
    }
  }, { passive: true });

  // ------------------------------------------------------------------ events

  const handlers = {
    authMode: (d) => { S.authMode = d.mode; render(); },
    cstep: (d) => {
      keepName();
      const from = STEPS.findIndex(([x]) => x === S.creatorStep), to = STEPS.findIndex(([x]) => x === d.s);
      if (to > from) (S.creatorSeen = S.creatorSeen || {})[S.creatorStep] = true;
      if (from === to) { render(); return; }
      S.creatorAnim = to > from ? 'fwd' : 'back'; S.creatorStep = d.s; render();
      window.scrollTo(0, 0);
      if (d.s === 'name') { const n = $('#cname'); if (n) n.focus(); }
    },
    storyAt: (d) => { (S.storyAt = S.storyAt || {})[d.ctx] = +d.i; keepName(); render(); const t = $('.tell'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); },
    pick: (d) => { const c = creatorState(); if (d.kind === 'race' && c.race !== d.id) c.story = { answers: {}, notes: '' }; c[d.kind] = d.id; if (d.kind === 'race') { c.look.skin = ITP.RACES[d.id].skins[1]; (S.storyAt = S.storyAt || {}).creator = 0; } keepName(); (S.creatorPicked = S.creatorPicked || {})[d.kind] = true; render(); },
    ans: (d) => {
      const story = d.ctx === 'creator' ? creatorState().story : storyDraft(), v = /^\d+$/.test(d.v) ? +d.v : d.v;
      const race = d.ctx === 'creator' ? creatorState().race : S.st.hero.race;
      story.answers[d.q] = v;
      if (d.q === 'home') { const y = story.answers.youth; if (y && S.cfg.backstories[race][y][1] !== v) delete story.answers.youth; }
      // the answer shows its picture first; Continue moves the tale on
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
    lookTab: (d) => { keepName(); S.lookTab = d.t; render(); },
    faceTurn: () => { S.faceLeft = !S.faceLeft; render(); },
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
      if (S.push && S.push.on) await pushOff().catch(() => null);
      await post('/logout').catch(() => null);
      if (window.IT_SERVER) { location.hash = ''; location.reload(); return; }
      S.st = null; S.chat = { channel: 'tavern', msgs: {}, last: {} }; render();
    },
    push: async (d) => {
      S.push.busy = true; render();
      try { if (d.on === '1') await pushOn(); else { await pushOff(); toast('Notifications are off for this device.', true); } } catch (e) { toast('Could not change notifications: ' + e.message); }
      S.push.busy = false; render();
    },
    chatWho: (d) => chatWho(d.id),
    report: async (d) => { try { await post('/chat/' + d.id + '/report', { reason: d.r }); closeModal(); toast('Thanks. A moderator will look at it.', true); } catch (e) { toast(e.message); } },
    blockHero: async (d) => { try { await post('/block', { hero: +d.hid }); closeModal(); S.chat.msgs = {}; S.chat.last = {}; await refresh(); await pollChat(); toast('Blocked. Their lines are hidden now.', true); } catch (e) { toast(e.message); } },
    unblock: async (d) => { try { await api('DELETE', '/block/' + d.hid); S.chat.msgs = {}; S.chat.last = {}; await refresh(); render(); pollChat(); } catch (e) { toast(e.message); } },
    modDo: async (d) => { try { await post('/admin/reports/' + d.id, { outcome: d.o, hours: +(d.h || 24) }); S.reports = null; render(); } catch (e) { toast(e.message); } },
    toggleChat: () => { S.chatOpen = !S.chatOpen; render(); if (S.chatOpen) { const c = $('#chatBody'); if (c && window.innerWidth > 900) c.focus(); } },
    toggleLog: () => { S.logShut = !S.logShut; render(); },
    rewardClose: () => celebrate.close(),
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
    if (e.target.id === 'cname') { keepName(); const nb = $('.namebio'); if (nb) nb.innerHTML = wholeTale(creatorState()); return; }
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
    if (f.dataset.form === 'forgot') {
      try { await post('/password/forgot', data); S.authMode = 'login'; render(); toast('If that address belongs to an account, a mail is on its way.', true); } catch (err) { toast(err.message); }
      return;
    }
    if (f.dataset.form === 'reset') {
      try { await post('/password/reset', { username: S.reset.u, token: S.reset.t, password: data.password }); S.reset = null; location.hash = '#/battle'; await refresh(); render(); toast('Password changed. Welcome back!', true); } catch (err) { toast(err.message); }
      return;
    }
    if (f.dataset.form === 'email') {
      try { await post('/account/email', data); await refresh(); render(); toast('Check your inbox for the confirmation link.', true); } catch (err) { toast(err.message); }
      return;
    }
    try { await post('/' + f.dataset.form, data); await refresh(); loadView(); } catch (err) { toast(err.message); }
  });

  boot().catch((e) => { $('#app').innerHTML = '<div class="boot">Could not reach the server: ' + esc(e.message) + '</div>'; });
})();
