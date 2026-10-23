// Idle Teams game client. Plain JavaScript, no build step: the server owns every rule and number,
// this file only shows state and sends the player's choices to /api.
(function () {
  'use strict';
  const ITP = window.ITP;
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '' : Math.round(n).toLocaleString('en-US'));
  const pct = (p, d = 1) => (p * 100).toFixed(d) + '%';
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
  const clock = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  const S = {
    cfg: null, st: null, view: 'battle', sel: null, timelines: {}, battle: null, chat: { channel: 'tavern', msgs: {}, last: {} },
    creator: null, skew: 0, tavern: null, guilds: null, market: null, marketFilter: { slot: '', rarity: '' }, attrOpen: null, chatOpen: false,
  };

  // ------------------------------------------------------------------ api

  async function api(method, path, body) {
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
  function modal(html) { const m = $('#modal'); m.innerHTML = '<div class="panel">' + html + '</div>'; m.hidden = false; hydrate(m); }
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
  const spr = (look, scale = 2, pose = 'stand0') => '<img class="spr" alt="" width="' + ITP.SIZE[0] * scale + '" height="' + ITP.SIZE[1] * scale + '" data-look="' + esc(JSON.stringify(look)) + '" data-pose="' + pose + '">';
  function hydrate(root) {
    root.querySelectorAll('img.spr[data-look]').forEach((img) => { img.src = spriteURL(JSON.parse(img.dataset.look), img.dataset.pose); img.removeAttribute('data-look'); });
    root.querySelectorAll('canvas.curve[data-curve]').forEach(drawCurve);
  }

  // ------------------------------------------------------------------ text helpers

  const rarityName = (r) => (S.cfg.rarities[r] || [cap(r)])[0];
  const attrName = (a) => (S.cfg.attributes[a] || [cap(a)])[0];
  const className = (c) => S.cfg.classes[c].name;
  const role = (r) => '<span class="pill ' + r + '">' + r + '</span>';

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
      return '<div>+' + (it.value ?? (it.affixes[0] || [])[1]) + ' ' + attrName(g[1]) + '</div><div class="muted">Resonance (3/6/9 of a theme): ' + esc(g[3]) + '</div>';
    }
    let h = '';
    if (it.base_stats) {
      const b = it.base_stats, parts = [];
      if (b.damage) parts.push(fmt(b.damage) + ' damage');
      if (b.health) parts.push(fmt(b.health) + ' health');
      if (b.armor) parts.push(fmt(b.armor) + ' armor');
      if (b.block) parts.push(fmt(b.block) + ' block');
      if (parts.length) h += '<div class="muted">' + parts.join(' · ') + '</div>';
    }
    const t = 1 + 0.03 * (it.temper || 0);
    (it.affixes || []).forEach(([a, v]) => { h += '<div>+' + Math.round(v * t) + ' ' + attrName(a) + '</div>'; });
    if (it.power) h += '<div class="r-legendary">★ ' + esc(S.cfg.powers[it.power][0]) + ': ' + esc(S.cfg.powers[it.power][1]) + '</div>';
    if (it.imprint) h += '<div class="r-epic">✦ Imprint: ' + esc(S.cfg.powers[it.imprint][0]) + '</div>';
    if (it.sockets) h += '<div>' + sockets(it) + '</div>';
    return h;
  }
  function itemCard(it, extra = '', attrs = '') {
    const slot = it.slot === 'glyph' ? 'Glyph' : (S.cfg.slots[it.slot] || [cap(it.slot)])[0];
    return '<div class="item b-' + it.rarity + '" ' + attrs + '><div class="nm r-' + it.rarity + '">' + esc(itemName(it)) + '</div><div class="muted small">' + rarityName(it.rarity) + ' ' + slot + ' · item level ' + it.ilvl + (it.price != null ? ' · <span class="gold">' + fmt(it.price) + 'g</span>' : '') + '</div>' + itemLines(it) + extra + '</div>';
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

  // ------------------------------------------------------------------ boot and polling

  async function boot() {
    S.cfg = await get('/config');
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
    pollChat();
  }
  async function loadBattle() {
    const have = S.battle && S.battle.current && S.timelines[S.battle.current.id] ? S.battle.current.id : 0;
    try {
      const b = await get('/battle?have=' + have);
      if (b.current && b.current.timeline) S.timelines[b.current.id] = prepTimeline(b.current.timeline);
      S.battle = b;
      if (S.view === 'battle') render();
    } catch (e) { /* shown on the next refresh */ }
  }
  async function loadMarket() {
    const q = new URLSearchParams(S.marketFilter).toString();
    S.market = await get('/market?' + q).catch(() => []);
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
    return '<div class="auth panel stack"><h1 class="center gold">Idle Teams</h1><p class="muted center">Five heroes, one long battle, loot for the group.</p>' +
      '<div class="tabs"><button class="' + (!reg ? 'on' : '') + '" data-act="authMode" data-mode="login">Log in</button><button class="' + (reg ? 'on' : '') + '" data-act="authMode" data-mode="register">Create account</button></div>' +
      '<form data-form="' + (reg ? 'register' : 'login') + '"><label>Username</label><input name="username" autocomplete="username" required style="width:100%"><label>Password</label><input name="password" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" required style="width:100%">' +
      '<div style="margin-top:12px"><button class="primary" type="submit">' + (reg ? 'Create account' : 'Log in') + '</button></div></form></div>';
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
  const plain = (c) => ({ ...c.look, race: c.race, hat: 'none', top: 'tunic', bottom: 'pants', shoes: 'boots', gloves: 'none', cape: 'none', weapon: 'none', offhand: 'none' });

  function creatorView() {
    const c = creatorState(), cfg = S.cfg, R = ITP.RACES[c.race];
    const start = {};
    const add = (a, n) => { start[a] = (start[a] || 0) + n; };
    Object.entries(cfg.races[c.race].points).forEach(([a, n]) => add(a, n));
    Object.entries(cfg.classes[c.cls].points).forEach(([a, n]) => add(a, n));
    add(cfg.origins[c.origin][1], cfg.originPoints);
    const choice = (kind, id, title, body, on) => '<div class="choice ' + (on ? 'on' : '') + '" data-act="pick" data-kind="' + kind + '" data-id="' + id + '"><b>' + esc(title) + '</b>' + body + '</div>';
    const pts = (o) => Object.entries(o).map(([a, n]) => '+' + n + ' ' + attrName(a)).join(', ');
    const opt = (key, values) => '<label>' + cap(key) + '</label><select data-look="' + key + '">' + Object.entries(values).map(([v, n]) => '<option value="' + v + '"' + (String(c.look[key]) === String(v) ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>';
    const sw = (key, list) => '<label>' + ({ skin: 'Skin', hairColor: 'Hair colour', eyeColor: 'Eye colour', dye1: 'Main dye', dye2: 'Second dye', metal: 'Metal' }[key]) + '</label><div class="swatches">' + list.map((v) => '<span class="sw ' + (c.look[key] === v ? 'on' : '') + '" style="background:' + v + '" data-act="look" data-key="' + key + '" data-v="' + v + '"></span>').join('') + '</div>';
    return '<div class="main" style="max-width:1200px;margin:0 auto"><h1 class="gold">Create your hero</h1><p class="muted">Race, class and Origin are permanent. Each one comes with points already spent and a passive bonus. The look is yours to keep; everything you wear later comes from playing.</p>' +
      '<div class="grid2" style="grid-template-columns: 280px 1fr">' +
      '<div class="stack"><div class="preview">' + spr(plain(c), 4) + '</div>' +
      '<div class="panel tight"><label>Name</label><input id="cname" value="' + esc(c.name) + '" maxlength="20" style="width:100%" placeholder="3 to 20 letters">' +
      '<h4 style="margin-top:10px">Starting attributes</h4><div class="small">' + Object.entries(start).sort((a, b) => b[1] - a[1]).map(([a, n]) => attrName(a) + ' ' + n).join(' · ') + '</div>' +
      '<div style="margin-top:12px"><button class="primary" data-act="create">Create hero</button></div></div></div>' +
      '<div class="stack"><div class="panel"><h3>Race</h3><div class="choices">' + Object.entries(cfg.races).map(([id, r]) => choice('race', id, r.name, '<div class="muted">' + pts(r.points) + '</div><div>' + esc(r.passive[1]) + ': ' + esc(r.passive[2]) + '</div>', c.race === id)).join('') + '</div></div>' +
      '<div class="panel"><h3>Class</h3><div class="choices">' + Object.entries(cfg.classes).map(([id, k]) => choice('cls', id, k.name, '<div>' + role(k.role) + ' <span class="pill">' + k.resource + '</span></div><div class="muted">' + pts(k.points) + '</div><div>' + esc(k.passive[1]) + ': ' + esc(k.passive[2]) + '</div>', c.cls === id)).join('') + '</div></div>' +
      '<div class="panel"><h3>Origin</h3><div class="choices">' + Object.entries(cfg.origins).map(([id, o]) => choice('origin', id, o[0], '<div class="muted">+' + cfg.originPoints + ' ' + attrName(o[1]) + '</div><div>' + esc(o[2]) + '</div>', c.origin === id)).join('') + '</div></div>' +
      '<div class="panel"><div class="row between"><h3>Look</h3><button class="small" data-act="randomLook">Surprise me</button></div><div class="grid3">' +
      '<div>' + sw('skin', R.skins) + sw('hairColor', ITP.HAIRS) + sw('eyeColor', ITP.EYES) + '</div>' +
      '<div>' + opt('hair', ITP.OPTIONS.hair) + opt('eyes', ITP.OPTIONS.eyes) + opt('mouth', ITP.OPTIONS.mouth) + opt('beard', ITP.OPTIONS.beard) + opt('acc', ITP.OPTIONS.acc) + '</div>' +
      '<div>' + opt('build', { 0.92: 'Slim', 1: 'Average', 1.1: 'Broad' }) + opt('height', { 0.95: 'Short', 1: 'Average', 1.05: 'Tall' }) + sw('dye1', ITP.DYES) + sw('dye2', ITP.DYES) + sw('metal', ITP.METALS) + '</div>' +
      '</div></div></div></div></div>';
  }

  // ------------------------------------------------------------------ shell

  function shell() {
    const h = S.st.hero, views = [['battle', 'Battle'], ['hero', 'Hero'], ['skills', 'Skills'], ['gear', 'Gear'], ['group', 'Group'], ['guild', 'Guild'], ['market', 'Market']];
    const dots = { battle: S.st.pendingRolls, hero: h.points.unspent + h.openKeystones.length + (h.level >= S.cfg.pathLevel && !h.path ? 1 : 0), skills: h.skillPoints, group: S.st.invites.length + (S.st.party ? S.st.party.requests.filter((r) => r.kind === 'application').length : 0) };
    const nav = views.map(([id, n]) => '<a href="#/' + id + '" class="' + (S.view === id ? 'on' : '') + '">' + n + (dots[id] ? '<span class="dot">' + dots[id] + '</span>' : '') + '</a>').join('') + '<a href="#" data-act="toggleChat" class="chat-link">Chat</a>';
    const views2 = { battle: battleView, hero: heroView, skills: skillsView, gear: gearView, group: groupView, guild: guildView, market: marketView };
    return '<div class="shell' + (S.chatOpen ? ' chat-open' : '') + '"><div class="top"><span class="logo">Idle Teams</span><span class="who">' + spr(h.look, 0.5) + '<b>' + esc(h.name) + '</b> <span class="muted">Lv ' + h.level + ' ' + className(h.cls) + '</span></span>' +
      '<span class="xpbar" title="' + fmt(h.xp) + ' / ' + fmt(h.xpNext) + ' XP"><i style="width:' + Math.min(100, (100 * h.xp) / h.xpNext) + '%"></i></span>' +
      '<span class="cur"><span class="gold" title="Gold">' + fmt(h.gold) + 'g</span><span title="Materials">⚒ ' + fmt(h.materials) + '</span><span title="Essence" class="r-epic">✦ ' + fmt(h.essence) + '</span><button class="small" data-act="logout">Log out</button></span></div>' +
      '<nav class="nav">' + nav + '</nav><main class="main">' + (views2[S.view] || battleView)() + '</main><aside class="side">' + chatView() + '</aside></div>';
  }

  // ------------------------------------------------------------------ battle

  function battleView() {
    const st = S.st, p = st.party;
    if (!p) return '<div class="panel stack"><h2>No group yet</h2><p>Battles are fought by a group of five real heroes. Find one on the tavern board, or start your own and invite people.</p><a href="#/group"><button class="primary">Go to the tavern</button></a></div>' + reportsView();
    let head = '';
    if (p.members.length < S.cfg.partySize) head = '<div class="panel"><b>' + esc(p.name) + '</b> has ' + p.members.length + ' of ' + S.cfg.partySize + ' heroes. The next battle starts as soon as the group is full. <a href="#/group">Invite people</a></div>';
    else if (!p.running) head = '<div class="panel"><b>' + esc(p.name) + '</b> is resting. The leader can send the group back in from the Group page.</div>';
    const cur = S.battle && S.battle.current;
    let scene = '';
    if (cur) {
      scene = '<div class="scene-wrap"><canvas class="scene" id="scene" width="384" height="168"></canvas><div class="hud"><span id="hud-l"></span><span id="hud-r"></span></div><div class="banner" id="banner"></div></div>' +
        '<div class="track" id="track">' + S.cfg.dungeon.plan.map(([kind, name], n) => '<span class="' + kind + '" data-n="' + n + '" title="' + esc(name) + '">' + (kind === 'boss' ? esc(name) : '') + '</span>').join('') + '</div>' +
        '<div class="frames" id="frames">' + cur.roster.map((r, i) => '<div class="frame" id="fr' + i + '"><div class="nm">' + esc(r.name) + '</div><div class="muted">' + className(r.cls) + ' ' + r.level + '</div><div class="bar"><i class="hp" style="width:100%"></i><i class="abs" style="width:0"></i></div><div class="bar res"><i class="' + r.resource + '" style="width:100%"></i></div></div>').join('') + '</div>' +
        '<div class="row between" style="margin-top:8px"><h4>Battle log</h4><span class="muted small">' + esc(S.cfg.dungeon.name) + ' · dungeon level ' + cur.dungeonLevel + ' · results land when the run ends</span></div><div class="log" id="blog"></div>';
    } else if (p.members.length === S.cfg.partySize && p.running) {
      scene = '<div class="panel">The next battle is about to start…</div>';
    }
    return '<div class="stack">' + head + scene + chestsView() + reportsView() + '</div>';
  }

  function chestsView() {
    const b = S.battle;
    if (!b || !b.chests.length) return '';
    const me = S.st.hero.id;
    return b.chests.map((c) => {
      const names = Object.fromEntries(c.roster.map((r) => [r.id, r.name]));
      const items = c.chest.length ? c.chest.map((e) => {
        const mine = e.rolls[me];
        const others = Object.entries(e.rolls).map(([id, ch]) => esc(names[id] || '?') + ': ' + ch).join(', ');
        const buttons = mine ? '<div class="small">You chose <b>' + mine + '</b></div>' : '<div class="row" style="margin-top:4px"><button class="small primary" data-act="roll" data-b="' + c.id + '" data-i="' + e.idx + '" data-c="need">Need</button><button class="small" data-act="roll" data-b="' + c.id + '" data-i="' + e.idx + '" data-c="greed">Greed</button><button class="small" data-act="roll" data-b="' + c.id + '" data-i="' + e.idx + '" data-c="pass">Pass</button></div>';
        return itemCard(e.item, (e.upgrade ? '<div class="up">Upgrade for you</div>' : '') + buttons + (others ? '<div class="muted small">' + others + '</div>' : ''));
      }).join('') : '<p class="muted">No loot this time, only materials. Loot is never guaranteed.</p>';
      return '<div class="panel"><div class="row between"><h3>Group chest</h3><span class="muted small">Closes in ' + clock(c.chestClosesAt - now()) + '. Anyone who has not rolled by then rolls by their loot setting.</span></div><div class="grid3">' + items + '</div></div>';
    }).join('');
  }

  function reportsView() {
    const b = S.battle;
    if (!b) return '';
    const list = [...b.chests, ...b.recent];
    if (!list.length) return '';
    return '<div class="panel"><h3>Recent battles</h3>' + list.slice(0, 6).map((x) => {
      const r = x.report;
      const won = !r.wiped;
      const rows = r.heroes.map((h) => '<tr><td>' + esc(h.name) + '</td><td class="n">' + fmt(h.damage) + '</td><td class="n">' + fmt(h.healing) + '</td><td class="n">' + fmt(h.taken) + '</td><td class="n">' + fmt(h.absorbed) + '</td><td class="n">' + h.deaths + '</td><td class="n">' + fmt(h.xp) + '</td><td class="n gold">' + fmt(h.gold) + '</td><td class="n">' + fmt(h.materials) + '</td></tr>').join('');
      const fellAt = r.wiped ? r.plan[r.encountersDone] : null;
      const loot = x.chest.filter((e) => e.winner).map((e) => '<span class="r-' + e.item.rarity + '">' + esc(e.item.name) + '</span> → ' + esc((x.roster.find((r) => r.id === e.winner) || {}).name || '?')).join(', ');
      return '<details' + (x === list[0] ? ' open' : '') + '><summary><b class="' + (won ? 'good' : 'bad') + '">' + (won ? 'Cleared ' + esc(r.dungeon) : 'Fell at the ' + esc(fellAt[1])) + '</b> · ' + r.bossesKilled + ' of 3 bosses · dungeon level ' + x.dungeonLevel + ' · ' + new Date(x.endsAt * 1000).toLocaleTimeString() + '</summary>' +
        (r.cause ? '<p class="bad small">' + esc(r.cause) + '</p>' : '') +
        '<table class="t"><tr><th>Hero</th><th class="n">Damage</th><th class="n">Healing</th><th class="n">Taken</th><th class="n">Shielded</th><th class="n">Deaths</th><th class="n">XP</th><th class="n">Gold</th><th class="n">⚒</th></tr>' + rows + '</table>' +
        (loot ? '<p class="small">Loot: ' + loot + '</p>' : x.state === 'done' ? '<p class="small muted">No loot this time, only materials.</p>' : '') + '</details>';
    }).join('') + '</div>';
  }

  // ---------- playback: the battle was simulated on the server; we replay it in step with the clock

  function prepTimeline(t) {
    // Index events by time and remember who the enemies are at each phase.
    t.ev = t.events.map((e) => ({ t: e[0] / 10, type: e[1], src: e[2], dst: e[3], amt: e[4], flags: e[5], x: e[6] }));
    return t;
  }
  const scn = { floaters: [], shown: -1, lastSim: -1, enemies: {}, banner: '', bannerUntil: 0, log: [], act: {}, phaseLabel: '', at: 0, walkFrom: null };

  function setupScene() {
    const cur = S.battle && S.battle.current;
    if (!cur || !S.timelines[cur.id]) return;
    if (scn.battleId !== cur.id) { Object.assign(scn, { battleId: cur.id, floaters: [], shown: -1, lastSim: -1, enemies: {}, banner: '', log: [], act: {}, phaseLabel: '', at: 0, walkFrom: null }); }
    else scn.redrawLog = true;
  }
  function simTime(cur, tl) {
    const span = cur.endsAt - cur.startedAt;
    return Math.min(tl.length, Math.max(0, ((now() - cur.startedAt) / span) * tl.length));
  }
  function logLine(t, text, cls) { scn.log.push('<div class="' + (cls || '') + '"><span class="muted">' + clock(t) + '</span> ' + text + '</div>'); if (scn.log.length > 80) scn.log.shift(); scn.logDirty = true; }

  function processEvents(cur, tl, simT) {
    const names = cur.roster.map((r) => r.name);
    const live = simT - scn.lastSim < 2; // skip floaters when jumping forward
    for (let i = scn.shown + 1; i < tl.ev.length && tl.ev[i].t <= simT; i++) {
      const e = tl.ev[i];
      scn.shown = i;
      const fresh = live && simT - e.t < 1.5;
      switch (e.type) {
        case 'phase': {
          if (e.dst !== 2) scn.enemies = {};
          scn.walkFrom = null;
          scn.at = e.src;
          Object.values(e.x.enemies).forEach(([id, kind, name, max]) => { if (!scn.enemies[id]) scn.enemies[id] = { id, kind, name, max, hp: 1000 }; });
          if (e.dst !== 2) {
            scn.phaseLabel = 'Wing ' + (e.x.wing + 1) + ': ' + e.x.name;
            if (fresh) banner(e.dst === 1 ? 'Boss: ' + e.x.name : e.x.name);
            logLine(e.t, e.dst === 1 ? '<b>Boss: ' + esc(e.x.name) + '</b>' : esc(e.x.name), e.dst === 1 ? 'gold' : '');
          }
          break;
        }
        case 'walk': scn.enemies = {}; scn.walkFrom = e.t; scn.at = e.src; scn.phaseLabel = 'Moving on…'; break;
        case 'spawn': scn.enemies[e.src] = { id: e.src, kind: 'shard', name: 'Ember Shard', max: e.amt, hp: 1000 }; break;
        case 'hit': if (fresh && !(e.flags & 16) && e.amt > 0) floater('enemy', e.dst, fmt(e.amt), e.flags & 2 ? '#ff5cf0' : e.flags & 1 ? '#ffd040' : '#ffffff', e.flags & 3 ? 1.5 : 1); if (e.src >= 0) scn.act[e.src] = e.t; break;
        case 'heal': if (fresh && e.amt > 0) floater('hero', e.dst, '+' + fmt(e.amt), '#7be07f', e.flags & 1 ? 1.4 : 1); break;
        case 'hurt': if (fresh && e.amt > 0) floater('hero', e.dst, '-' + fmt(e.amt), e.flags & 4 ? '#ff9a3d' : '#ff6b6b', e.flags & 2 ? 1.4 : 1); break;
        case 'dodge': if (fresh) floater('hero', e.dst, 'dodge', '#a9c4ff', 1); break;
        case 'shield': if (fresh) floater('hero', e.dst >= 0 ? e.dst : e.src, 'shield', '#e0e8ff', 1); break;
        case 'cast': scn.act[e.src] = e.t; if (e.flags & 1) { logLine(e.t, '<b>' + esc(names[e.src]) + '</b> used ' + esc(e.x.name) + '!', 'gold'); if (fresh) banner(e.x.name); } break;
        case 'mech': logLine(e.t, '<b class="bad">' + esc(e.x.name) + '</b>' + (e.dst >= 0 ? ' on ' + esc(names[e.dst]) : ''), e.flags & 1 ? 'good' : ''); if (fresh && e.x.name !== 'Curse resisted') banner(e.x.name); break;
        case 'death': logLine(e.t, '<b>' + esc(names[e.dst]) + '</b> fell to ' + esc(e.x.what) + '.', 'bad'); break;
        case 'revive': logLine(e.t, esc(names[e.src]) + ' is back on their feet.', 'good'); break;
        case 'kill': if (scn.enemies[e.dst]) { scn.enemies[e.dst].hp = 0; if (scn.enemies[e.dst].kind === 'boss') { logLine(e.t, 'The ' + esc(scn.enemies[e.dst].name) + ' is down!', 'good'); if (fresh) banner(scn.enemies[e.dst].name + ' defeated!'); } } break;
      }
    }
    scn.lastSim = simT;
  }
  function banner(text) { scn.banner = text; scn.bannerUntil = performance.now() + 1800; }
  function floater(side, who, text, color, size) { scn.floaters.push({ side, who, text, color, size, born: performance.now(), dx: (Math.random() - 0.5) * 18 }); if (scn.floaters.length > 60) scn.floaters.shift(); }

  function snapAt(tl, simT) {
    const s = tl.snaps; if (!s.length) return null;
    let lo = 0, hi = s.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid][0] <= simT) lo = mid; else hi = mid - 1; }
    return s[lo];
  }

  const imgCache = new Map();
  function cachedCanvas(key, make) { if (!imgCache.has(key)) imgCache.set(key, make()); return imgCache.get(key); }
  // Colours a sprite's pixels while keeping its shading, so one piece of art can serve several enemies.
  function tint(src, color) {
    if (!color) return src;
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.45; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function imp(color) {
    const c = document.createElement('canvas'); c.width = 20; c.height = 20; const g = c.getContext('2d');
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    px(5, 4, 10, 12, '#2a1418'); px(6, 5, 8, 10, color); px(4, 2, 3, 4, '#2a1418'); px(13, 2, 3, 4, '#2a1418'); px(5, 3, 1, 2, color); px(14, 3, 1, 2, color);
    px(7, 8, 2, 2, '#fff4c0'); px(11, 8, 2, 2, '#fff4c0'); px(8, 12, 4, 1, '#2a1418'); px(6, 16, 3, 2, '#2a1418'); px(11, 16, 3, 2, '#2a1418');
    return c;
  }

  function drawScene(cur, tl, simT) {
    const cv = $('#scene'); if (!cv) return;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const W = cv.width, H = cv.height, ground = 140;
    // backdrop: a cave with lava glow
    g.fillStyle = '#1a1222'; g.fillRect(0, 0, W, H);
    // The cave scrolls while the group walks to the next fight.
    const walking = scn.walkFrom != null;
    const scroll = Math.round((walking ? simT - scn.walkFrom : 0) * 40 + scn.at * 160);
    g.fillStyle = '#231a2e'; for (let x = -(scroll % 24) - 24; x < W; x += 24) { const k = Math.floor((x + scroll) / 24); g.fillRect(x, 20 + ((((k * 7) % 18) + 18) % 18), 18, 6); }
    g.fillStyle = '#2a2034'; for (let x = -(scroll % 96) - 96; x < W; x += 96) { const k = ((Math.floor((x + scroll) / 96) % 3) + 3) % 3; g.fillRect(x + 30, ground - 50 - k * 8, 14, 50 + k * 8); }
    g.fillStyle = '#2d2238'; g.fillRect(0, ground, W, H - ground);
    g.fillStyle = '#3a2c48'; for (let x = -(scroll % 16); x < W; x += 16) g.fillRect(x, ground, 10, 2);
    g.fillStyle = 'rgba(255,120,40,0.10)'; g.fillRect(0, ground - 30, 150, 30);
    const snap = snapAt(tl, simT);
    if (snap) snap[3].forEach(([id, hp]) => { if (scn.enemies[id]) scn.enemies[id].hp = hp; });
    // enemies on the left, facing right
    const foes = Object.values(scn.enemies).filter((e) => e.hp > 0);
    const pos = {};
    let ex = 30;
    foes.forEach((e, k) => {
      if (e.kind === 'boss') {
        // Three bosses share the golem art for now: size and colour tell them apart.
        const swing = Math.floor(performance.now() / 600) % 3;
        const look = { 'Cinder Hound': [0.7, '#d0502a'], 'Slag Matron': [0.85, '#4a70d8'] }[e.name] || [1, null];
        const img = cachedCanvas('golem' + swing + look[1], () => tint(ITP.golem(['idle', 'raise', 'slam'][swing]), look[1]));
        const w = 120 * look[0], hgt = 112 * look[0];
        g.drawImage(img, 40, ground - hgt + 8, w, hgt);
        pos[e.id] = [40 + w / 2, ground - hgt + 2];
        bar(g, 50, ground - hgt - 4, 100, e.hp / 1000, '#e05a3a');
      } else if (e.kind === 'brute') {
        const img = cachedCanvas('brute', () => imp('#a8402a'));
        const bob = Math.round(Math.sin(performance.now() / 300 + k) * 2);
        g.drawImage(img, ex, ground - 60 + bob, 60, 60); pos[e.id] = [ex + 30, ground - 64 + bob]; bar(g, ex + 4, ground - 66 + bob, 52, e.hp / 1000, '#e05a3a');
        ex += 66;
      } else {
        const img = cachedCanvas(e.kind, () => imp(e.kind === 'shard' ? '#ffb340' : '#e0583a'));
        const bob = Math.round(Math.sin(performance.now() / 250 + k) * 2);
        const x = e.kind === 'shard' ? 160 + k * 4 : ex, y = ground - 40 + bob - (e.kind === 'shard' ? 30 : 0);
        g.drawImage(img, x, y, 40, 40); pos[e.id] = [x + 20, y - 4]; bar(g, x + 2, y - 6, 36, e.hp / 1000, '#e05a3a');
        ex += 46;
      }
    });
    // heroes on the right, facing left
    cur.roster.forEach((r, i) => {
      const hp = snap ? snap[1][i] : 1000;
      const x = 196 + i * 37, y = ground - 76 + (i % 2) * 4;
      const acted = scn.act[i] != null && simT - scn.act[i] < 0.4;
      const pose = hp <= 0 ? 'stand0' : walking ? 'walk' + (Math.floor(performance.now() / 150 + i) % 4) : acted ? (simT - scn.act[i] < 0.2 ? 'atk1' : 'atk2') : (Math.floor(performance.now() / 500 + i) % 2 ? 'stand1' : 'stand0');
      const img = cachedCanvas(JSON.stringify(r.look) + pose, () => ITP.sprite(r.look, pose));
      if (hp <= 0) { g.save(); g.globalAlpha = 0.45; g.translate(x + 24, ground - 6); g.rotate(-Math.PI / 2); g.drawImage(img, -10, -24); g.restore(); }
      else g.drawImage(img, x, y);
      if (snap && snap[4][i] > 0) { g.strokeStyle = 'rgba(220,235,255,0.7)'; g.strokeRect(x + 8, y + 10, 32, 64); }
      pos['h' + i] = [x + 24, y + 6];
      updateFrame(i, snap, r);
    });
    // floating numbers
    const t = performance.now();
    g.textAlign = 'center';
    scn.floaters = scn.floaters.filter((f) => t - f.born < 1100);
    scn.floaters.forEach((f) => {
      const p = f.side === 'hero' ? pos['h' + f.who] : pos[f.who];
      if (!p) return;
      const age = (t - f.born) / 1100;
      g.font = Math.round(9 * f.size) + 'px "Pixelify Sans", monospace';
      g.fillStyle = '#000'; g.fillText(f.text, p[0] + f.dx + 1, p[1] - age * 26 + 1);
      g.fillStyle = f.color; g.fillText(f.text, p[0] + f.dx, p[1] - age * 26);
    });
  }
  function bar(g, x, y, w, frac, col) { g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, w + 2, 5); g.fillStyle = '#3a1418'; g.fillRect(x, y, w, 3); g.fillStyle = col; g.fillRect(x, y, Math.round(w * frac), 3); }
  function updateFrame(i, snap, r) {
    const el = document.getElementById('fr' + i); if (!el || !snap) return;
    const hp = snap[1][i], res = snap[2][i], ab = snap[4][i];
    const bars = el.querySelectorAll('i');
    bars[0].style.width = hp / 10 + '%'; bars[0].className = 'hp' + (hp < 350 ? ' low' : '');
    bars[1].style.width = Math.min(100, ab / 10) + '%';
    bars[2].style.width = res / 10 + '%';
    el.classList.toggle('dead', hp <= 0);
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!S.st || !S.st.hero || S.view !== 'battle') return;
    const cur = S.battle && S.battle.current; const tl = cur && S.timelines[cur.id];
    if (!cur || !tl) return;
    const simT = simTime(cur, tl);
    processEvents(cur, tl, simT);
    drawScene(cur, tl, simT);
    const l = $('#hud-l'), r = $('#hud-r'), b = $('#banner'), log = $('#blog');
    if (l) l.textContent = scn.phaseLabel;
    const track = $('#track');
    if (track && track.dataset.at !== String(scn.at)) { track.dataset.at = scn.at; track.querySelectorAll('span').forEach((el) => { const n = +el.dataset.n; el.classList.toggle('done', n < scn.at); el.classList.toggle('now', n === scn.at); }); }
    if (r) r.textContent = 'Ends in ' + clock(cur.endsAt - now());
    if (b) b.textContent = performance.now() < scn.bannerUntil ? scn.banner : '';
    if (log && (scn.logDirty || scn.redrawLog)) { log.innerHTML = scn.log.slice().reverse().join(''); scn.logDirty = false; scn.redrawLog = false; }
    if (now() > cur.endsAt + 2 && !scn.reloading) { scn.reloading = true; setTimeout(async () => { await refresh(); await loadBattle(); scn.reloading = false; }, 1500); }
  }

  // ------------------------------------------------------------------ hero sheet

  function heroView() {
    const h = S.st.hero, cfg = S.cfg, st = h.stats;
    const groups = {};
    Object.entries(cfg.attributes).forEach(([a, d]) => { (groups[d[1]] = groups[d[1]] || []).push(a); });
    const carved = h.points.carved || {}, spent = h.points.spent || {};
    let attrs = '';
    Object.entries(groups).forEach(([g, list]) => {
      attrs += '<div class="grp">' + g + '</div>';
      list.forEach((a) => {
        const mine = spent[a] || 0, lock = carved[a] || 0;
        attrs += '<div class="attr"><span data-act="attrOpen" data-a="' + a + '" style="cursor:pointer"><b>' + attrName(a) + '</b>' + (mine ? ' <span class="muted small">(' + mine + ' yours' + (lock ? ', ' + lock + ' carved' : '') + ')</span>' : '') + '</span>' +
          '<span class="v">' + fmt(h.attributes[a]) + '</span><span class="row" style="gap:2px"><button class="small" data-act="spend" data-a="' + a + '" data-n="-1" ' + (mine > lock ? '' : 'disabled') + '>−</button><button class="small" data-act="spend" data-a="' + a + '" data-n="1" ' + (h.points.unspent > 0 ? '' : 'disabled') + '>+</button><button class="small" data-act="spend" data-a="' + a + '" data-n="5" ' + (h.points.unspent >= 5 ? '' : 'disabled') + '>+5</button></span>' +
          '<span class="d">' + esc(cfg.attributes[a][2]) + (S.attrOpen === a ? '<br>' + (h.sources[a] || []).map(([f, n]) => esc(f) + ' +' + n).join(' · ') + (Math.abs(h.effective[a] - h.attributes[a]) > 0.5 ? '<br><span class="bad">Past the soft cap: counts as ' + fmt(h.effective[a]) + '</span>' : '') : '') + '</span></div>';
      });
    });
    const res = { mana: 'Mana', energy: 'Energy', rage: 'Rage' }[st.resource];
    const stat = (n, v, tip) => '<div title="' + esc(tip || '') + '"><span class="muted">' + n + '</span><b>' + v + '</b></div>';
    const stats = stat('Max health', fmt(st.maxHp)) + stat('Weapon damage', fmt(st.weaponDamage)) + stat('Physical power', fmt(st.might)) + stat('Spell power', fmt(st.arcana)) + stat('Healing power', fmt(st.spirit)) +
      stat('Crit chance', pct(st.crit), 'Precision, curve') + stat('MEGA crit', pct(st.mega), 'Ferocity, curve') + stat('Crit damage', '×' + st.critMult.toFixed(2)) + stat('Haste', '+' + pct(st.haste - 1), 'Swiftness, curve') +
      stat('Cooldowns', '−' + pct(st.cdr), 'Focus, curve') + stat('Dodge', pct(st.dodge), 'Agility, curve') + stat('Damage reduction', pct(st.dr), 'Guard and armor, curve') + stat('Block', pct(st.block)) + stat('Resist', pct(st.resist), 'Resolve, curve') +
      stat('Regen', fmt(st.regen) + '/s') + stat('Healing received', '+' + pct(st.healRecv - 1)) + stat('Threat', '×' + st.threat.toFixed(2)) + stat('Buff strength', '×' + st.command.toFixed(2)) + stat('Fortune', '×' + st.fortune.toFixed(2)) +
      stat(res, fmt(st.resMax) + (st.resRegen ? ' (+' + st.resRegen.toFixed(1) + '/s)' : ' (+' + st.rageGain.toFixed(1) + ' per hit)'));
    const curves = Object.entries(h.curves).map(([k, c]) => '<div><div class="small">' + ({ crit: 'Crit', haste: 'Haste', cdr: 'Cooldowns', dodge: 'Dodge', resist: 'Resist', mega: 'MEGA crit' })[k] + ' from ' + attrName(c.attr) + ': <b>' + fmt(c.points) + '</b> points</div><canvas class="curve" width="220" height="90" data-curve=\'' + JSON.stringify({ k: h.k, p: c.points, cap: cfg.caps[k] || 0.95, half: k === 'mega' }) + '\'></canvas></div>').join('');

    // Path and Keystones: the locked-in choices
    const cls = cfg.classes[h.cls];
    let path = '';
    if (h.level < cfg.pathLevel) path = '<p class="muted">Your Path opens at level ' + cfg.pathLevel + '. Until the Oath at level ' + cfg.oathLevel + ' you can change it; the Oath seals it with every point spent so far.</p>';
    else path = '<div class="choices">' + Object.entries(cls.paths).map(([id, p]) => '<div class="choice ' + (h.path === id ? 'on' : '') + '" ' + (h.oathTaken ? '' : 'data-act="path" data-id="' + id + '"') + '><b>' + esc(p[0]) + '</b>' + esc(p[1]) + '<div class="muted">Skill: ' + Object.values(p[2]).map((s) => esc(s[0])).join(', ') + '</div></div>').join('') + '</div>' +
      (h.oathTaken ? '<p class="small gold">Oathsworn: your Path and the points spent before level ' + cfg.oathLevel + ' are carved in.</p>' : '<p class="small muted">The Oath at level ' + cfg.oathLevel + ' seals your Path and carves in the points you have spent by then.</p>');
    const ks = cfg.keystones[h.role];
    const chosen = Object.entries(h.keystones).map(([lvl, id]) => '<div class="choice on"><b>' + esc(ks[id][0]) + '</b><span class="muted">Level ' + lvl + '</span><div>' + esc(ks[id][1]) + '</div></div>').join('');
    const open = h.openKeystones.length ? '<h4 style="margin-top:8px">Choose your level ' + h.openKeystones[0] + ' Keystone (permanent)</h4><div class="choices">' + Object.entries(ks).filter(([id]) => !Object.values(h.keystones).includes(id)).map(([id, k]) => '<div class="choice" data-act="keystone" data-l="' + h.openKeystones[0] + '" data-id="' + id + '"><b>' + esc(k[0]) + '</b>' + esc(k[1]) + '</div>').join('') + '</div>' : '';
    const race = cfg.races[h.race], origin = cfg.origins[h.origin];
    const marks = h.marks.map((m) => '<span class="pill" title="' + esc((cfg.marks[m] || ['', ''])[1]) + '">' + esc((cfg.marks[m] || [m])[0]) + '</span>').join(' ');
    const career = h.career || {};

    return '<div class="stack"><div class="panel row" style="align-items:flex-start;gap:16px">' + spr(h.look, 3) + '<div class="stack" style="flex:1;min-width:220px"><div><h2>' + esc(h.name) + '</h2><div>Level ' + h.level + ' ' + race.name + ' ' + cls.name + (h.path ? ' of the ' + esc(cls.paths[h.path][0]) : '') + ' ' + role(h.role) + '</div><div class="muted small">Origin: ' + esc(origin[0]) + (h.guild ? ' · [' + esc(h.guild.tag) + '] ' + esc(h.guild.name) : '') + '</div></div>' +
      '<div class="small"><b>' + esc(race.passive[1]) + '</b>: ' + esc(race.passive[2]) + '<br><b>' + esc(cls.passive[1]) + '</b>: ' + esc(cls.passive[2]) + '<br><b>' + esc(origin[0]) + '</b>: ' + esc(origin[2]) + '</div>' +
      '<div>' + (marks || '<span class="muted small">No Marks yet. Marks are earned in battle and shown on your card.</span>') + '</div>' +
      '<div class="small muted">Runs ' + (career.battles || 0) + ' · dungeons cleared ' + (career.dungeons || 0) + ' · bosses ' + (career.bossKills || 0) + ' · deaths ' + (career.deaths || 0) + ' · Codex ' + h.codexPowers.length + ' of ' + Object.keys(cfg.powers).length + '</div></div></div>' +
      '<div class="panel"><div class="row between"><h3>Attributes</h3><div class="row"><span><b class="gold">' + h.points.unspent + '</b> unspent of ' + h.points.total + ' (' + cfg.pointsPerLevel + ' per level)</span><button class="small" data-act="autoSpend" ' + (h.points.unspent ? '' : 'disabled') + '>Spend the suggested way</button></div></div>' +
      '<p class="small muted">Everything comes from attributes and gear. Percentage stats follow a curve that gets steep around 50% and never reaches 100%. A single attribute above ' + Math.round(cfg.softCapShare * 100) + '% of all your points counts half past that line. Click an attribute to see where its points come from.</p><div class="attrs">' + attrs + '</div></div>' +
      '<div class="grid2"><div class="panel"><h3>Combat stats</h3><div class="stats">' + stats + '</div></div><div class="panel"><h3>Curves</h3><p class="small muted">Points needed = K × p / (1 − p)², with K = ' + h.k.toFixed(1) + ' at your level. The dot is you.</p><div class="grid3">' + curves + '</div></div></div>' +
      '<div class="panel"><h3>Path</h3>' + path + '</div>' +
      '<div class="panel"><h3>Keystones</h3><p class="small muted">Keystones open at levels ' + cfg.keystoneLevels.join(', ') + ', then every 25 levels after 50. Each choice is permanent.</p>' + (chosen ? '<div class="choices">' + chosen + '</div>' : '') + open + (!chosen && !open ? '<p class="muted">Your first Keystone opens at level ' + cfg.keystoneLevels[0] + '.</p>' : '') + '</div>' +
      '<div class="panel"><h3>Loot setting</h3><p class="small muted">When you are away, the server rolls for you this way when a chest closes.</p><select data-act-change="lootPolicy">' + [['upgrades', 'Need on upgrades, greed on the rest'], ['greed', 'Greed on everything'], ['pass', 'Pass on everything']].map(([v, n]) => '<option value="' + v + '"' + (h.lootPolicy === v ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div></div>';
  }

  function drawCurve(cv) {
    const d = JSON.parse(cv.dataset.curve); cv.removeAttribute('data-curve');
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    const pts = (p) => (d.k * p) / ((1 - p) ** 2);
    const curve = (x) => { if (x <= 0) return 0; const b = 2 * x + d.k; return (b - Math.sqrt(b * b - 4 * x * x)) / (2 * x); };
    const maxX = Math.max(pts(0.75), d.p * 1.3);
    g.fillStyle = '#120e19'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#4a3d63'; g.beginPath(); g.moveTo(0, H - 0.5 * H * 0.9 - 4); g.lineTo(W, H - 0.5 * H * 0.9 - 4); g.stroke();
    g.fillStyle = '#ffc94a';
    for (let x = 0; x < W; x++) { const p = Math.min(d.cap, curve((x / W) * maxX)) * (d.half ? 0.5 : 1); g.fillRect(x, Math.round(H - 4 - p * H * 0.9), 1, 2); }
    const me = Math.min(d.cap, curve(d.p)) * (d.half ? 0.5 : 1), mx = Math.min(W - 3, (d.p / maxX) * W);
    g.fillStyle = '#6fd97a'; g.fillRect(Math.round(mx) - 2, Math.round(H - 4 - me * H * 0.9) - 2, 5, 5);
    g.fillStyle = '#a99cc2'; g.font = '10px monospace'; g.fillText(pct(me), Math.min(W - 40, mx + 6), Math.max(12, H - 8 - me * H * 0.9)); g.fillText('50%', 2, H - 0.5 * H * 0.9 - 7);
  }

  // ------------------------------------------------------------------ skills

  function skillsView() {
    const h = S.st.hero, cfg = S.cfg;
    const inLoadout = new Set(h.loadout);
    const card = (s) => {
      const locked = !s.unlocked, isUlt = s.source === 'ultimate';
      const src = s.source === 'core' ? '' : isUlt ? '<span class="pill gold">ultimate</span> ' : '<span class="pill">' + esc(cfg.classes[h.cls].paths[s.source][0]) + ' path</span> ';
      return '<div class="panel tight' + (locked ? ' muted' : '') + '"><div class="row between"><b class="' + (inLoadout.has(s.id) ? 'gold' : '') + '">' + esc(s.name) + '</b><span class="small">Rank ' + s.rank + '/' + cfg.maxSkillRank + '</span></div>' +
        '<div class="small">' + src + (locked ? 'Unlocks at level ' + s.level + (s.source !== 'core' && !isUlt ? ' on this Path' : '') : s.type) + (s.cost ? ' · costs ' + s.cost + ' ' + cfg.classes[h.cls].resource : '') + (s.cd ? ' · ' + s.cd + 's cooldown' : '') + '</div>' +
        '<div class="small" style="margin:4px 0">' + esc(skillText(s)) + ' Each rank adds strength.</div>' +
        (locked ? '' : '<div class="row">' + (isUlt ? '<span class="small muted">Always slotted</span>' : '<button class="small ' + (inLoadout.has(s.id) ? 'on' : '') + '" data-act="slot" data-id="' + s.id + '">' + (inLoadout.has(s.id) ? 'In loadout' : 'Add to loadout') + '</button>') + '<button class="small" data-act="rankUp" data-id="' + s.id + '" ' + (h.skillPoints > 0 && s.rank < cfg.maxSkillRank ? '' : 'disabled') + '>Rank up</button></div>') + '</div>';
    };
    return '<div class="stack"><div class="panel row between"><div><h3>Skills</h3><span class="small muted">One skill point per level. Your loadout holds ' + cfg.loadoutSize + ' skills; your ultimate joins it at level ' + cfg.ultimateLevel + '.</span></div><div class="row"><span><b class="gold">' + h.skillPoints + '</b> skill points</span><button class="small" data-act="resetRanks">Reset ranks (' + 10 * h.level + 'g)</button></div></div>' +
      '<div class="panel"><h4>Loadout</h4><div class="row">' + h.loadout.map((id) => { const s = h.skills.find((x) => x.id === id); return '<span class="pill gold">' + esc(s ? s.name : id) + '</span>'; }).join('') + '</div></div>' +
      '<div class="grid2">' + h.skills.map(card).join('') + '</div></div>';
  }

  // ------------------------------------------------------------------ gear

  function gearView() {
    const h = S.st.hero, inv = S.st.inventory, cfg = S.cfg;
    const worn = {}; inv.forEach((i) => { if (i.equipped) worn[i.equipped] = i; });
    const slots = Object.keys(cfg.slots);
    const doll = slots.map((s) => { const i = worn[s]; return '<div class="slot ' + (i ? 'filled' : '') + (i && S.sel === i.id ? ' sel' : '') + '" ' + (i ? 'data-act="sel" data-id="' + i.id + '"' : '') + '><div class="muted small">' + cfg.slots[s][0] + '</div>' + (i ? '<div class="r-' + i.rarity + '">' + esc(i.name) + '</div><div class="small muted">ilvl ' + i.ilvl + ' ' + sockets(i) + '</div>' : '<div class="muted small">Empty</div>') + '</div>'; }).join('');
    const bag = inv.filter((i) => !i.equipped && i.price == null);
    const res = h.resonance;
    const resTxt = Object.entries(res.counts).map(([t, n]) => '<div class="small"><span class="sock" style="background:' + cfg.glyphs[t][2] + '"></span>' + cfg.glyphs[t][0] + ' ' + n + '/9' + (res.tiers[t] ? ' · <b class="gold">tier ' + res.tiers[t] + '</b>: ' + esc(cfg.glyphs[t][3]) : '') + '</div>').join('') || '<p class="small muted">Socket 3, 6 or 9 glyphs of one theme to wake its Resonance.</p>';
    const sel = inv.find((i) => i.id === S.sel);
    const cost = S.craftCost;
    return '<div class="grid2" style="grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr)"><div class="stack"><div class="panel"><div class="row" style="align-items:flex-start">' + spr(h.look, 2) + '<div style="flex:1"><h3>Worn</h3><p class="small muted">Nothing binds and nothing has requirements: wear, trade or sell anything.</p></div></div><div class="doll">' + doll + '</div></div>' +
      '<div class="panel"><h3>Resonance</h3>' + resTxt + '</div>' +
      '<div class="panel"><h3>Craft</h3><p class="small muted">A fresh item at item level ' + 2 * h.level + '. Usually common, sometimes rare, rarely epic.</p><div class="row"><select id="craftSlot">' + slots.filter((s) => s !== 'ring2').map((s) => '<option value="' + s + '">' + cfg.slots[s][0] + '</option>').join('') + '</select><button data-act="craft">Craft' + (cost ? ' (' + fmt(cost.gold) + 'g, ' + cost.materials + ' ⚒)' : '') + '</button></div></div></div>' +
      '<div class="stack">' + (sel ? itemDetail(sel, worn) : '<div class="panel muted">Pick an item to see what you can do with it.</div>') +
      '<div class="panel"><h3>Bag (' + bag.length + ')</h3><div class="grid3">' + bag.map((i) => itemCard(i, i.score != null && betterThanWorn(i, worn) ? '<div class="up">▲ Upgrade</div>' : '', 'data-act="sel" data-id="' + i.id + '"' + (S.sel === i.id ? ' style="border-color:var(--accent)"' : ''))).join('') + '</div>' + (bag.length ? '' : '<p class="muted">Empty. Loot comes from the group chest, crafting and the market.</p>') + '</div></div></div>';
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
      actions += '<button data-act="item" data-a="temper" data-id="' + i.id + '" title="+3% to everything on the item per step">Temper +' + (i.temper + 1) + '</button>';
      if (h.codexPowers.length) actions += '<select id="imprintPower">' + h.codexPowers.map((p) => '<option value="' + p + '">' + esc(cfg.powers[p][0]) + '</option>').join('') + '</select><button data-act="imprint" data-id="' + i.id + '">Imprint (20 ✦)</button>';
      if (h.level >= cfg.reforgeLevel && i.affixes.length) actions += '<select id="reforgeAffix">' + i.affixes.map(([a], k) => '<option value="' + k + '">' + attrName(a) + '</option>').join('') + '</select>→<select id="reforgeAttr">' + Object.keys(cfg.attributes).map((a) => '<option value="' + a + '">' + attrName(a) + '</option>').join('') + '</select><button data-act="reforge" data-id="' + i.id + '">Reforge</button>';
    }
    let sock = '';
    if (i.sockets) {
      sock = '<h4 style="margin-top:8px">Sockets</h4>' + i.glyphs.map((g, k) => g ? '<div class="row small"><span class="sock" style="background:' + cfg.glyphs[g[0]][2] + '"></span>' + cfg.glyphs[g[0]][0] + ' +' + g[1] + ' <button class="small" data-act="item" data-a="unsocket" data-id="' + i.id + '" data-socket="' + k + '">Take out</button></div>' : '<div class="row small"><span class="sock"></span>Empty ' + (bagGlyphs.length ? '<select id="glyph' + k + '">' + bagGlyphs.map((x) => '<option value="' + x.id + '">' + esc(x.name) + ' +' + x.value + '</option>').join('') + '</select><button class="small" data-act="socket" data-id="' + i.id + '" data-socket="' + k + '">Socket</button>' : '<span class="muted">(no glyphs in your bag)</span>') + '</div>').join('');
    }
    const trade = i.equipped ? '' : '<hr><div class="row"><input id="giveTo" placeholder="Hero name" style="width:130px"><button data-act="give" data-id="' + i.id + '">Give</button></div><div class="row" style="margin-top:6px"><input id="sellPrice" type="number" min="1" placeholder="Price" style="width:100px"><button data-act="sell" data-id="' + i.id + '">Sell on market</button><button class="danger" data-act="salvage" data-id="' + i.id + '">Salvage</button></div>';
    return '<div class="panel stack">' + itemCard(i) + compare + '<div class="row">' + actions + '</div>' + sock + trade + '</div>';
  }

  // ------------------------------------------------------------------ group and tavern

  function groupView() {
    const st = S.st, h = st.hero, p = st.party, tv = S.tavern;
    let mine = '';
    if (p) {
      const lead = p.leader === h.id;
      const members = p.members.map((m) => '<div class="panel tight row" style="gap:10px">' + spr(m.look, 1) + '<div style="flex:1"><b>' + esc(m.name) + '</b>' + (m.id === p.leader ? ' <span class="pill gold">leader</span>' : '') + '<div class="small">Lv ' + m.level + ' ' + className(m.cls) + ' ' + role(m.role) + '</div>' + (m.demo ? '<div class="small muted">demo hero</div>' : '') + '</div>' + (lead && m.id !== h.id ? '<button class="small danger" data-act="kick" data-id="' + m.id + '">Remove</button>' : '') + '</div>').join('');
      const reqs = p.requests.map((r) => '<div class="row small">' + (r.kind === 'application' ? '<b>' + esc(r.hero.name) + '</b> (Lv ' + r.hero.level + ' ' + className(r.hero.cls) + ') wants to join' + (r.message ? ': “' + esc(r.message) + '”' : '') + (lead ? ' <button class="small primary" data-act="answer" data-id="' + r.id + '" data-a="accept">Accept</button><button class="small" data-act="answer" data-id="' + r.id + '" data-a="decline">Decline</button>' : '') : 'Invited <b>' + esc(r.hero.name) + '</b>, waiting for an answer') + '</div>').join('');
      mine = '<div class="panel stack"><div class="row between"><h2>' + esc(p.name) + '</h2><span class="muted small">' + p.battlesTogether + ' battles together · bond +' + Math.min(10, p.battlesTogether) + '% XP</span></div><div class="grid3">' + members + '</div>' + (reqs ? '<div>' + reqs + '</div>' : '') +
        (lead ? '<div class="row"><label style="margin:0">Dungeon level</label><select data-act-change="offset">' + [-3, -2, -1, 0, 1, 2, 3, 4, 5].map((o) => '<option value="' + o + '"' + (o === p.dungeonOffset ? ' selected' : '') + '>' + (o > 0 ? '+' : '') + o + (o === 0 ? ' (median level)' : '') + '</option>').join('') + '</select><span class="small muted">Now level ' + p.dungeonLevel + '. Higher is harder, with better XP and item levels.</span></div>' +
          '<div class="row"><button data-act="running">' + (p.running ? 'Rest after this battle' : 'Send the group back in') + '</button>' + (p.members.length < S.cfg.partySize ? '<input id="inviteName" placeholder="Invite hero by name" style="width:170px"><button data-act="invite">Invite</button><button data-act="postLfm">Post on the tavern board</button>' : '') + '</div>' : '<p class="small muted">The leader picks the dungeon level and when to rest.</p>') +
        '<div><button class="danger small" data-act="leaveParty">Leave group</button></div></div>';
    } else {
      mine = '<div class="panel stack"><h2>You are not in a group</h2><p class="small">A group is five real heroes who picked each other. Battles run while you are away, up to the offline limit, and the loot is shared through the group chest.</p><div class="row"><input id="partyName" placeholder="Group name" style="width:200px"><button class="primary" data-act="createParty">Start a group</button></div>' +
        '<div class="row"><input id="lfgText" placeholder="Say what you bring, e.g. steady healer, EU evenings" style="flex:1;min-width:200px"><button data-act="postLfg">Post that I am looking</button></div></div>' +
        (st.invites.length ? '<div class="panel"><h3>Invites</h3>' + st.invites.map((r) => '<div class="row">' + (r.kind === 'invite' ? '<b>' + esc(r.party.name) + '</b> (' + r.party.size + '/5) invited you' + (r.message ? ': “' + esc(r.message) + '”' : '') + ' <button class="small primary" data-act="answer" data-id="' + r.id + '" data-a="accept">Join</button><button class="small" data-act="answer" data-id="' + r.id + '" data-a="decline">No thanks</button>' : 'You applied to <b>' + esc(r.party.name) + '</b>, waiting for the leader <button class="small" data-act="answer" data-id="' + r.id + '" data-a="decline">Withdraw</button>') + '</div>').join('') + '</div>' : '');
    }
    const lead = p && p.leader === h.id;
    let board = '<div class="panel"><h3>Tavern board</h3><p class="muted">Loading…</p></div>';
    if (tv) {
      const lfm = tv.posts.filter((x) => x.kind === 'lfm'), lfg = tv.posts.filter((x) => x.kind === 'lfg');
      board = '<div class="panel stack"><div class="row between"><h3>Tavern board</h3><button class="small" data-act="reloadTavern">Refresh</button></div>' +
        '<h4>Groups looking for heroes</h4>' + (lfm.map((x) => '<div class="panel tight"><div class="row between"><b>' + esc(x.party ? x.party.name : '') + '</b><span class="small">wants ' + x.roles.map(role).join(' ') + '</span></div><div class="small">“' + esc(x.text) + '”</div><div class="row" style="margin-top:4px">' + (x.party ? x.party.members.map((m) => spr(m.look, 0.75)).join('') : '') + '<span class="small muted">' + (x.party ? x.party.members.length : 0) + '/5</span>' + (!p ? '<button class="small primary" data-act="apply" data-id="' + x.party.id + '">Ask to join</button>' : '') + (x.author.id === h.id ? '<button class="small" data-act="unpost" data-id="' + x.id + '">Remove</button>' : '') + '</div></div>').join('') || '<p class="small muted">No groups posted right now.</p>') +
        '<h4>Heroes looking for a group</h4>' + (lfg.map((x) => '<div class="panel tight row">' + spr(x.author.look, 0.75) + '<div style="flex:1"><b>' + esc(x.author.name) + '</b> <span class="small">Lv ' + x.author.level + ' ' + className(x.author.cls) + ' ' + role(x.author.role) + '</span><div class="small">“' + esc(x.text) + '”</div></div>' + (lead ? '<button class="small primary" data-act="inviteId" data-id="' + x.author.id + '">Invite</button>' : '') + (x.author.id === h.id ? '<button class="small" data-act="unpost" data-id="' + x.id + '">Remove</button>' : '') + '</div>').join('') || '<p class="small muted">Nobody posted.</p>') +
        (lead && tv.freeHeroes.length ? '<h4>Other heroes without a group</h4><div class="row">' + tv.freeHeroes.map((x) => '<span class="pill">' + esc(x.name) + ' · ' + x.level + ' ' + className(x.cls) + ' <a href="#" data-act="inviteId" data-id="' + x.id + '">invite</a></span>').join(' ') + '</div>' : '') + '</div>';
    }
    return '<div class="stack">' + mine + board + '</div>';
  }

  // ------------------------------------------------------------------ guild

  function guildView() {
    const g = S.guilds;
    if (!g) return '<div class="panel muted">Loading…</div>';
    if (g.mine) {
      const m = g.mine;
      return '<div class="stack"><div class="panel"><div class="row between"><h2>[' + esc(m.tag) + '] ' + esc(m.name) + '</h2><span>Guild level <b class="gold">' + m.level + '</b> · ' + m.size + '/' + m.max + ' members</span></div><p class="muted">' + esc(m.motto) + '</p><p class="small muted">Guild XP comes from every clear by every member. Guild levels unlock looks, never combat power.</p><button class="small danger" data-act="leaveGuild">Leave guild</button></div>' +
        '<div class="panel"><h3>Members</h3><div class="grid3">' + m.members.map((x) => '<div class="panel tight row">' + spr(x.look, 0.75) + '<div><b>' + esc(x.name) + '</b>' + (x.rank === 'leader' ? ' <span class="pill gold">leader</span>' : '') + '<div class="small">Lv ' + x.level + ' ' + className(x.cls) + ' ' + role(x.role) + '</div><div class="small muted">' + (x.party ? 'in a group' : 'looking for a group') + '</div></div></div>').join('') + '</div></div></div>';
    }
    return '<div class="stack"><div class="panel"><h2>Guilds</h2><p class="small">Guilds are where people meet, chat and form groups. Join one, or found your own for 100 gold.</p>' +
      g.all.map((x) => '<div class="row between panel tight"><div><b>[' + esc(x.tag) + '] ' + esc(x.name) + '</b> <span class="small muted">level ' + x.level + ' · ' + x.size + '/' + x.max + '</span><div class="small">' + esc(x.motto) + '</div></div><button class="small primary" data-act="joinGuild" data-id="' + x.id + '">Join</button></div>').join('') + '</div>' +
      '<div class="panel"><h3>Found a guild</h3><div class="row"><input id="gName" placeholder="Name" style="width:180px"><input id="gTag" placeholder="Tag" maxlength="4" style="width:70px"><input id="gMotto" placeholder="Motto" style="flex:1;min-width:150px"><button data-act="createGuild">Found (100g)</button></div></div></div>';
  }

  // ------------------------------------------------------------------ market

  function marketView() {
    const cfg = S.cfg, f = S.marketFilter, h = S.st.hero;
    const mine = S.st.inventory.filter((i) => i.price != null);
    const list = S.market == null ? '<p class="muted">Loading…</p>' : S.market.filter((i) => i.owner && i.owner.id !== h.id).map((i) => itemCard(i, '<div class="row" style="margin-top:4px"><span class="small muted">from ' + esc(i.owner.name) + '</span><button class="small primary" data-act="buy" data-id="' + i.id + '" ' + (h.gold >= i.price ? '' : 'disabled') + '>Buy</button></div>')).join('') || '<p class="muted">Nothing listed.</p>';
    return '<div class="stack"><div class="panel"><div class="row between"><h2>Market</h2><div class="row"><select data-act-change="mSlot"><option value="">All slots</option>' + Object.keys(cfg.slots).filter((s) => s !== 'ring2').map((s) => '<option value="' + s + '"' + (f.slot === s ? ' selected' : '') + '>' + cfg.slots[s][0] + '</option>').join('') + '<option value="glyph"' + (f.slot === 'glyph' ? ' selected' : '') + '>Glyphs</option></select><select data-act-change="mRarity"><option value="">Any rarity</option>' + Object.keys(cfg.rarities).map((r) => '<option value="' + r + '"' + (f.rarity === r ? ' selected' : '') + '>' + rarityName(r) + '</option>').join('') + '</select></div></div><p class="small muted">Every item can be traded, legendaries included. Sell from the Gear page.</p><div class="grid3">' + list + '</div></div>' +
      (mine.length ? '<div class="panel"><h3>Your listings</h3><div class="grid3">' + mine.map((i) => itemCard(i, '<button class="small" data-act="item" data-a="unlist" data-id="' + i.id + '">Take back</button>')).join('') + '</div></div>' : '') + '</div>';
  }

  // ------------------------------------------------------------------ chat

  function chatView() {
    const chans = S.st.channels, ch = chans[S.chat.channel] ? S.chat.channel : 'tavern';
    S.chat.channel = ch;
    const msgs = (S.chat.msgs[ch] || []).map((m) => {
      const card = m.card && m.card.type === 'item' && m.card.spec ? ' <span class="card r-' + m.card.spec.rarity + '">' + esc(itemName(m.card.spec)) + '</span>' : '';
      return m.author ? '<div class="msg"><span class="a">' + esc(m.author.name) + '</span> ' + esc(m.body) + card + '</div>' : '<div class="msg sys">' + esc(m.body) + card + '</div>';
    }).join('');
    return '<div class="chat-tabs">' + Object.entries(chans).map(([id, n]) => '<button class="' + (id === ch ? 'on' : '') + '" data-act="chan" data-id="' + id + '">' + n + '</button>').join('') + '<button class="small chat-close" data-act="toggleChat" title="Close">✕</button></div><div class="msgs">' + (msgs || '<p class="muted small">Nothing said yet.</p>') + '</div><form class="chat-in" data-form="chat"><input id="chatBody" name="body" maxlength="500" placeholder="Say something" autocomplete="off"><button type="submit">Send</button></form>';
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
    pick: (d) => { const c = creatorState(); c[d.kind] = d.id; if (d.kind === 'race') c.look.skin = ITP.RACES[d.id].skins[1]; c.name = $('#cname').value; render(); },
    look: (d) => { const c = creatorState(); c.look[d.key] = d.v; c.name = $('#cname').value; render(); },
    randomLook: () => { const c = creatorState(), r = ITP.randomHero(); c.name = $('#cname').value; Object.assign(c.look, { skin: ITP.RACES[c.race].skins[Math.floor(Math.random() * ITP.RACES[c.race].skins.length)], hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, eyeColor: r.eyeColor, mouth: r.mouth, beard: r.beard, acc: r.acc, build: r.build, height: r.height, dye1: r.dye1, dye2: r.dye2, metal: r.metal }); render(); },
    create: async () => { const c = creatorState(); c.name = $('#cname').value.trim(); try { await post('/hero', c); S.creator = null; location.hash = '#/hero'; await refresh(); toast('Welcome, ' + c.name + '! Head to the Group page to find your party.', true); } catch (e) { toast(e.message); } },
    logout: async () => { await post('/logout').catch(() => null); S.st = null; S.chat = { channel: 'tavern', msgs: {}, last: {} }; render(); },
    toggleChat: () => { S.chatOpen = !S.chatOpen; render(); },
    chan: (d) => { S.chat.channel = d.id; S.chatJump = true; render(); pollChat(); },
    modalYes: () => { const f = S.modalYes; closeModal(); if (f) f(); },
    closeModal,
    // hero
    spend: (d) => act(() => post('/hero/act', { action: 'spend', points: { [d.a]: +d.n } })),
    autoSpend: () => act(() => post('/hero/act', { action: 'autoSpend' })),
    attrOpen: (d) => { S.attrOpen = S.attrOpen === d.a ? null : d.a; render(); },
    path: (d) => act(() => post('/hero/act', { action: 'path', path: d.id }), 'Path chosen. You can still change it until the Oath.'),
    keystone: (d) => confirmBox('Take <b>' + esc(S.cfg.keystones[S.st.hero.role][d.id][0]) + '</b> as your level ' + d.l + ' Keystone? This is permanent.', () => act(() => post('/hero/act', { action: 'keystone', level: +d.l, keystone: d.id }), 'Keystone chosen.')),
    rankUp: (d) => act(() => post('/hero/act', { action: 'rankUp', skill: d.id })),
    resetRanks: () => confirmBox('Reset all skill ranks for ' + 10 * S.st.hero.level + ' gold?', () => act(() => post('/hero/act', { action: 'resetRanks' }))),
    slot: (d) => { let l = S.st.hero.loadout.slice(); l = l.includes(d.id) ? l.filter((x) => x !== d.id) : [...l, d.id]; if (l.length > S.cfg.loadoutSize) { toast('Your loadout holds ' + S.cfg.loadoutSize + ' skills. Take one out first.'); return; } act(() => post('/hero/act', { action: 'loadout', skills: l })); },
    // gear
    sel: async (d) => { S.sel = +d.id; if (!S.craftCost) S.craftCost = await get('/craft/cost').catch(() => null); render(); },
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
    invite: () => act(() => post('/party/invite', { name: $('#inviteName').value }), 'Invite sent.').then(reloadTavern),
    inviteId: (d) => act(() => post('/party/invite', { hero: +d.id }), 'Invite sent.').then(reloadTavern),
    apply: (d) => act(() => post('/party/apply', { party: +d.id }), 'Request sent.').then(reloadTavern),
    answer: (d) => act(() => post('/request/' + d.id + '/' + d.a)).then(reloadTavern),
    postLfm: () => modal('<h3>Post on the tavern board</h3><label>What are you looking for?</label><input id="lfmText" style="width:100%" placeholder="e.g. healer for evening runs"><label>Roles</label><div class="row">' + ['tank', 'healer', 'dps'].map((r) => '<label style="margin:0"><input type="checkbox" class="lfmRole" value="' + r + '" checked> ' + r + '</label>').join('') + '</div><div class="row" style="margin-top:10px"><button class="primary" data-act="postLfmGo">Post</button><button data-act="closeModal">Cancel</button></div>'),
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
    if (el.dataset.look) { const c = creatorState(); c.look[el.dataset.look] = isNaN(+el.value) ? el.value : +el.value; c.name = $('#cname').value; render(); return; }
    const a = el.dataset.actChange;
    if (a === 'lootPolicy') act(() => post('/hero/act', { action: 'lootPolicy', policy: el.value }), 'Saved.');
    if (a === 'offset') act(() => post('/party/settings', { dungeonOffset: +el.value }), 'The next battle uses the new level.');
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
