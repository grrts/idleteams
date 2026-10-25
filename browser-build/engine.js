// Idle Teams game rules, ported line for line from the Symfony app (src/Game/*.php) so the proof of concept
// can run entirely in the browser. The PHP code stays the source of truth; game data comes from data.js,
// which is dumped straight from Rules.php.
(function () {
  'use strict';
  const D = window.IT_DATA, C = D.C;
  const E = (window.IT_ENGINE = {});

  // ---------- seeded randomness (stands in for PHP's Mt19937 Randomizer)
  class Rng {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() { let t = (this.s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    getFloat(a, b) { return a + (b - a) * this.next(); }
    getInt(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  }
  E.Rng = Rng;
  const crc = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  E.crc = crc;
  const round = (x, d = 0) => { const m = 10 ** d; return Math.sign(x) * Math.round(Math.abs(x) * m) / m; };
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const keys = Object.keys;

  // ---------- Rules
  const R = (E.Rules = {
    xpForLevel(level) { let base = 160 * level ** 1.5; if (level >= 50) base = 160 * 50 ** 1.5 * 1.08 ** (level - 50); return Math.round(base); },
    role: (cls) => D.CLASSES[cls].role,
    classSkills(cls) {
      const c = D.CLASSES[cls], out = {};
      for (const [id, s] of Object.entries(c.skills)) out[id] = [...s, 'core'];
      for (const [pid, p] of Object.entries(c.paths)) for (const [id, s] of Object.entries(p[2])) out[id] = [...s, pid];
      const [uid, uname, ulvl, utype, umult, ucost, ucd, uopts] = c.ultimate;
      out[uid] = [uname, ulvl, utype, umult, ucost, ucd, uopts, 'ultimate'];
      for (const [id, s] of Object.entries(D.TALENT_SKILLS[cls] || {})) out[id] = [...s, 'talent'];
      return out;
    },
  });

  // ---------- Talent and Heritage maps (src/Game/TreeMap.php, Talents.php, Heritage.php); maps come prebuilt in data.js
  const round4 = (v) => Math.round(v * 1e4) / 1e4;
  const TM = (E.TreeMap = {
    merge(...effects) {
      const out = {};
      for (const e of effects) for (const [k, v] of Object.entries(e)) {
        if (k === 'grant') out.grant = v;
        else if (v && typeof v === 'object') { out[k] = out[k] || {}; for (const [x, n] of Object.entries(v)) out[k][x] = round4((out[k][x] || 0) + n); }
        else out[k] = round4((out[k] || 0) + v);
      }
      return out;
    },
    check(tree, have, id, free, culture = null) {
      const n = tree.nodes[id];
      if (!n) return 'Unknown talent.';
      if ((have[id] || 0) >= n.max) return 'You already have that.';
      if (n.culture !== null && n.culture !== culture) return 'That belongs to another culture. Follow it first.';
      if (id !== tree.root && !n.links.some((l) => (have[l] || 0) > 0)) return 'Connect it to something you have learned first.';
      if (free < 1) return 'No points left.';
      return null;
    },
    path(tree, have, target, culture = null) {
      if (!tree.nodes[target]) return null;
      if ((have[target] || 0) > 0) return [];
      const ok = (id) => tree.nodes[id].culture === null || tree.nodes[id].culture === culture, prev = new Map(), queue = [];
      for (const [id, r] of Object.entries(have)) if (r > 0 && tree.nodes[id]) { prev.set(id, false); queue.push(id); }
      if (!queue.length) { prev.set('root', false); queue.push('root'); if (target === 'root') return ['root']; }
      for (let i = 0; i < queue.length; i++) {
        for (const l of tree.nodes[queue[i]].links) {
          if (prev.has(l) || !ok(l)) continue;
          prev.set(l, queue[i]);
          if (l === target) { const path = []; for (let x = l; x !== false && !((have[x] || 0) > 0); x = prev.get(x)) path.push(x); return path.reverse(); }
          queue.push(l);
        }
      }
      return null;
    },
    auto(tree, plan, points, culture = null) {
      const have = {};
      for (const id of plan) { if (points < 1) break; if (TM.check(tree, have, id, points, culture) === null) { have[id] = 1; --points; } }
      return have;
    },
    clean: (tree, have) => Object.fromEntries(Object.entries(have || {}).filter(([id, r]) => r > 0 && tree.nodes[id])),
  });
  const plans = {};
  const T = (E.Talents = {
    points: (level) => D.TALENT.POINTS_PER_LEVEL * Math.max(0, level - 1),
    tree: (cls) => D.TALENT_TREES[cls],
    grants(cls, talents) {
      const out = {}, nodes = T.tree(cls).nodes;
      for (const [id, r] of Object.entries(talents)) if (r > 0 && nodes[id] && nodes[id].effect.grant) out[nodes[id].effect.grant] = id;
      return out;
    },
    check: (tree, have, id, free, culture = null) => TM.check(tree, have, id, free, culture),
    plan(cls, offset = 0) {
      const key = 't:' + cls + ':' + (offset % 3);
      if (plans[key]) return plans[key];
      let order = D.TALENT.BRANCHES[cls];
      if (offset) { const k = offset % 3; order = [...order.slice(k, k + 1), ...order.slice(0, k), ...order.slice(k + 1)]; }
      const s = D.TALENT.SHAPE.starts, depth = D.TALENT.SHAPE.depth, at = D.TALENT.SKILL_AT, plan = ['root'];
      const lane = (bid, j, from, to) => { for (let d = Math.max(from, s[j]); d <= to; d++) plan.push(bid + '.' + j + '.' + d); };
      for (let g = 0; g < order.length; g += 3) {
        const group = order.slice(g, g + 3);
        for (const bid of group) lane(bid, 3, 1, at);
        for (const bid of group) lane(bid, 3, at + 1, depth);
        for (const bid of group) for (const j of [2, 4, 1, 5, 0, 6]) lane(bid, j, 1, depth);
      }
      return (plans[key] = plan);
    },
    auto: (cls, points, offset = 0) => TM.auto(T.tree(cls), T.plan(cls, offset), points),
    total(tree, have) {
      const parts = [];
      for (const [id, r] of Object.entries(have || {})) if (r > 0 && tree.nodes[id]) { const e = { ...tree.nodes[id].effect }; delete e.grant; parts.push(e); }
      return TM.merge(...parts);
    },
    mods(build) {
      const m = { attrs: [], stat: {}, type: {}, skill: {}, cost: 0, kin: 0, renown: 0 }, sets = [];
      if (build.talents && keys(build.talents).length && D.TALENT_TREES[build.cls]) sets.push([T.tree(build.cls), build.talents, 'Talent']);
      if (build.heritage && keys(build.heritage).length && D.HERITAGE_TREES[build.race]) sets.push([D.HERITAGE_TREES[build.race], build.heritage, 'Heritage']);
      const story = build.backstory && D.HERITAGE.BACKSTORY_INFO[build.race]?.[build.backstory];
      if (story) sets.push([{ nodes: { b: { name: story[0], max: 1, effect: H.backstoryEffect(build.race, build.backstory, build.culture || null) } } }, { b: 1 }, 'Backstory']);
      for (const [tree, have, label] of sets) {
        for (const [id, r] of Object.entries(have)) {
          const n = tree.nodes[id];
          if (!n || r < 1) continue;
          const rank = Math.min(r, n.max), e = n.effect;
          for (const [a, v] of Object.entries(e.attr || {})) m.attrs.push([a, v * rank, label + ': ' + n.name]);
          for (const k of ['stat', 'type', 'skill']) for (const [x, v] of Object.entries(e[k] || {})) m[k][x] = (m[k][x] || 0) + v * rank;
          for (const k of ['cost', 'kin', 'renown']) m[k] += (e[k] || 0) * rank;
        }
      }
      return m;
    },
    STAT_TEXT: {
      dmg: '%s damage', heal: '%s healing', hp: '%s max health', threat: '%s threat', taken: '%s less damage taken', crit: '%s crit chance', critDmg: '%s crit damage', haste: '%s haste', cdr: '%s faster cooldowns',
      dodge: '%s dodge', block: '%s block', regen: '%s health regen', resRegen: '%s mana and energy regen', rageGain: '%s rage from hits', healRecv: '%s healing received', fortune: '%s gold and materials', xp: '%s XP', lifesteal: '%s lifesteal',
    },
    TYPE_TEXT: { strike: 'single-target skills', aoe: 'area skills', heal: 'direct heals', groupheal: 'group heals', hot: 'heals over time', shield: 'shields', wall: 'walls', mark: 'marks', slow: 'slows', dot: 'damage over time', pet: 'companions', buff: 'self buffs' },
    /** Plain words for an effect (Talents::describe). */
    describe(e, max = 1, cls = null) {
      const num = (v) => { const t = (Math.round(Math.abs(v) * 1000 + 1e-7) / 10).toFixed(1); return t.endsWith('.0') ? t.slice(0, -2) : t; };
      const p = (v) => (v >= 0 ? '+' : '−') + num(v) + '%', u = (v) => num(v) + '%', parts = [], sub = (f, x) => f.replace('%s', x);
      const LESS = ['threat', 'hp', 'dmg', 'heal', 'haste', 'crit', 'critDmg', 'dodge', 'healRecv', 'xp', 'fortune'];
      for (const [a, v] of Object.entries(e.attr || {})) parts.push('+' + Math.trunc(v) + ' ' + D.ATTRIBUTES[a][0]);
      for (const [k, v] of Object.entries(e.stat || {})) {
        if (k === 'taken') parts.push(v >= 0 ? u(v) + ' less damage taken' : u(v) + ' more damage taken');
        else if (v < 0 && LESS.includes(k)) parts.push(sub(T.STAT_TEXT[k].replace('%s ', '%s less '), u(v)));
        else parts.push(sub(T.STAT_TEXT[k] || '%s ' + k, p(v)));
      }
      for (const [k, v] of Object.entries(e.type || {})) parts.push(v < 0 ? u(v) + ' less from ' + (T.TYPE_TEXT[k] || k) : p(v) + ' to ' + (T.TYPE_TEXT[k] || k));
      for (const [k, v] of Object.entries(e.skill || {})) parts.push(p(v) + ' to ' + (cls ? (R.classSkills(cls)[k] || [k])[0] : k));
      if (e.cost) parts.push('skills cost ' + u(e.cost) + ' less');
      if (e.kin) parts.push(p(e.kin) + ' damage and healing for each groupmate of your race (twice for your culture)');
      if (e.renown) parts.push(p(e.renown) + ' Renown from every run');
      if (e.grant && cls) parts.push('Teaches ' + D.TALENT_SKILLS[cls][e.grant][0]);
      const text = parts.join(', '), t = text.charAt(0).toUpperCase() + text.slice(1);
      return max > 1 ? t + ' per rank' : t;
    },
  });
  // ---------- Life story (src/Game/LifeStory.php)
  const LS = (E.LifeStory = {
    ids: () => Object.values(D.LIFE_STORY.CHAPTERS).flatMap((c) => c[1]),
    clean(race, story) {
      const q = D.LIFE_STORY.QUESTIONS[race], answers = story && typeof story.answers === 'object' && story.answers ? story.answers : {}, out = {};
      if (!q) throw new Error('Pick a race.');
      for (const id of LS.ids()) {
        const a = answers[id];
        if (id === 'home') { if (typeof a !== 'string' || !D.HERITAGE_TREES[race].cultures[a]) throw new Error('Tell your story: ' + q.home); }
        else if (id === 'youth') { const b = typeof a === 'string' ? H.backstories(race)[a] : null; if (!b || b[1] !== out.home) throw new Error('Tell your story: ' + q.youth); }
        else if (!Number.isInteger(a) || !q[id][1][a]) throw new Error('Tell your story: ' + q[id][0]);
        out[id] = a;
      }
      const notes = String((story && typeof story.notes === 'string' && story.notes) || '').replace(/<[^>]*>/g, '').replace(/\s+/gu, ' ').trim();
      return { answers: out, notes: [...notes].slice(0, D.LIFE_STORY.NOTES_MAX).join('') };
    },
    lean(race, story) {
      const count = new Map();
      for (const [id, a] of Object.entries(story.answers || {})) { const o = Number.isInteger(a) && D.LIFE_STORY.QUESTIONS[race][id] ? D.LIFE_STORY.QUESTIONS[race][id][1][a] : null; if (o) count.set(o[2], (count.get(o[2]) || 0) + 1); }
      const order = [...count.keys()];
      return Object.fromEntries([...count.entries()].sort((x, y) => y[1] - x[1] || order.indexOf(x[0]) - order.indexOf(y[0])).slice(0, D.LIFE_STORY.LEAN_ATTRS).map(([a]) => [a, D.LIFE_STORY.LEAN_POINTS]));
    },
    biography(race, name, story) {
      const q = D.LIFE_STORY.QUESTIONS[race], cult = D.HERITAGE_TREES[race].cultures, out = [];
      for (const [title, ids] of Object.values(D.LIFE_STORY.CHAPTERS)) {
        const lines = [];
        for (const id of ids) {
          const a = (story.answers || {})[id];
          if (id === 'home' && typeof a === 'string' && cult[a]) lines.push(name + ' was raised among the ' + cult[a][0] + ': ' + cult[a][1].charAt(0).toLowerCase() + cult[a][1].slice(1) + '.');
          else if (id === 'youth' && typeof a === 'string' && H.backstories(race)[a]) { const b = H.backstories(race)[a]; lines.push('Everyone in ' + cult[b[1]][0] + ' knew ' + name + ' as the ' + b[0] + '. ' + b[3]); }
          else if (Number.isInteger(a) && q[id] && q[id][1][a]) lines.push(q[id][1][a][1].split('{name}').join(name));
        }
        if (lines.length) out.push([title, lines.join(' ')]);
      }
      if (story.notes) out.push(['In their own words', story.notes]);
      return out;
    },
    example(race, backstory, seed = 0) {
      const answers = {};
      LS.ids().forEach((id, i) => { answers[id] = id === 'home' ? H.backstories(race)[backstory][1] : id === 'youth' ? backstory : (seed + i * 3) % 4; });
      return { answers, notes: '' };
    },
  });
  const H = (E.Heritage = {
    tree: (race) => D.HERITAGE_TREES[race],
    renownFor: (rank) => 20 * (rank - 1) * rank,
    points: (rank) => Math.max(0, 2 * rank - 1),
    rank(renown) { let r = 1; while (renown >= H.renownFor(r + 1)) ++r; return r; },
    /** Same race counts once, same culture twice, same culture and backstory three times. others: [[race, culture, backstory]]. */
    kin(race, culture, others, backstory = null) { let n = 0; for (const [r, c, b] of others) if (r === race) n += culture !== null && c === culture ? (backstory !== null && b === backstory ? 3 : 2) : 1; return n; },
    backstories: (race) => D.HERITAGE.BACKSTORY_INFO[race] || {},
    backstoryStart(race, id) { const bid = H.backstories(race)[id][2], nodes = { root: 1 }; for (let d = 1; d <= D.HERITAGE.BACKSTORY_NODES; ++d) nodes[bid + '.2.' + d] = 1; return nodes; },
    backstoryEffect(race, id, culture) {
      const b = H.backstories(race)[id || ''];
      if (!b) return {};
      const e = D.HERITAGE.BACKSTORY_BASE[race][id];
      return culture === b[1] ? TM.merge(e, { renown: D.HERITAGE.BACKSTORY_RENOWN_BONUS }) : e;
    },
    renownGain: (units, kin, bonus) => Math.round(units * (D.HERITAGE.RENOWN_ALONE + D.HERITAGE.RENOWN_PER_KIN * kin) * (1 + bonus)),
    plan(race, culture) {
      const key = 'h:' + race + ':' + culture;
      if (plans[key]) return plans[key];
      const tree = H.tree(race), s = D.HERITAGE.SHAPE.starts, depth = D.HERITAGE.SHAPE.depth, mine = [...tree.cultures[culture][3], 'trunk0', 'trunk1', 'trunk2'], plan = ['root'];
      for (let d = 1; d <= depth; d++) for (const bid of mine) plan.push(bid + '.2.' + d);
      for (const bid of mine) for (const j of [1, 3, 0, 4]) for (let d = s[j]; d <= depth; d++) plan.push(bid + '.' + j + '.' + d);
      return (plans[key] = plan);
    },
    auto: (race, culture, rank) => TM.auto(H.tree(race), H.plan(race, culture), H.points(rank), culture),
  });

  // ---------- Items
  const I = (E.Items = {
    name(item) {
      if (item.slot === 'glyph') return D.GLYPHS[item.base][0] + ' Glyph';
      const pre = []; let suf = null;
      for (const [a] of item.affixes) { const [kind, word] = D.AFFIXES[a]; if (kind === 'pre' && pre.length < 1) pre.push(word); else if (kind === 'suf' && !suf) suf = word; }
      const base = (D.BASES[item.slot] || {})[item.base] || item.base[0].toUpperCase() + item.base.slice(1);
      let name = (pre.join(' ') + ' ' + base + (suf ? ' ' + suf : '')).trim();
      if ((item.temper || 0) > 0) name += ' +' + item.temper;
      return name;
    },
    affixValue: (ilvl, roll) => Math.max(1, Math.round((2 + ilvl * 0.18) * (0.7 + 0.6 * roll))),
    rollRarity(r, bonus = 0) {
      let x = r.getFloat(0, 100); x -= bonus * x; let acc = 0;
      for (const id of keys(D.RARITIES).reverse()) { acc += D.RARITIES[id][3]; if (x < acc) return id; }
      return 'common';
    },
    generate(r, ilvl, rarity, slot = null, base = null, prefer = []) {
      const slots = keys(D.SLOTS);
      slot = slot || slots[r.getInt(0, slots.length - 1)];
      const bases = keys(D.BASES[slot]);
      base = base || bases[r.getInt(0, bases.length - 1)];
      let [, nAffix, sockets] = D.RARITIES[rarity];
      if (['ring1', 'ring2', 'amulet', 'trinket'].includes(slot)) nAffix = Math.min(4, nAffix + 1);
      const pool = keys(D.ATTRIBUTES), chosen = [];
      for (const a of prefer) if (chosen.length < nAffix && !chosen.includes(a)) chosen.push(a);
      while (chosen.length < nAffix) { const a = pool[r.getInt(0, pool.length - 1)]; if (!chosen.includes(a)) chosen.push(a); }
      const affixes = chosen.map((a) => [a, I.affixValue(ilvl, prefer.length ? 0.5 : r.getFloat(0, 1))]);
      const powers = keys(D.POWERS);
      return { slot: slot === 'ring2' ? 'ring1' : slot, base, rarity, ilvl, affixes, sockets, glyphs: Array(sockets).fill(null), power: rarity === 'legendary' ? powers[r.getInt(0, powers.length - 1)] : null, imprint: null, temper: 0, seed: r.getInt(1, 999999) };
    },
    glyph(r, ilvl, theme = null) {
      const themes = keys(D.GLYPHS); theme = theme || themes[r.getInt(0, themes.length - 1)];
      return { slot: 'glyph', base: theme, rarity: 'rare', ilvl, value: Math.round(3 + ilvl * 0.12), affixes: [], sockets: 0, glyphs: [], power: null, imprint: null, temper: 0, seed: r.getInt(1, 999999) };
    },
    // An item record as stored: glyph items keep their attribute in affixes, like the PHP entity.
    fromSpec(s) { return { slot: s.slot, base: s.base, rarity: s.rarity, ilvl: s.ilvl, affixes: s.slot === 'glyph' ? [[D.GLYPHS[s.base][1], s.value]] : s.affixes, sockets: s.sockets, glyphs: s.glyphs, power: s.power, imprint: s.imprint || null, temper: s.temper || 0, seed: s.seed, equipped: null, price: null, owner: null }; },
    spec(i) { return { id: i.id, slot: i.slot, base: i.base, rarity: i.rarity, ilvl: i.ilvl, affixes: i.affixes, sockets: i.sockets, glyphs: i.glyphs, power: i.power, imprint: i.imprint, temper: i.temper, seed: i.seed, equipped: i.equipped, price: i.price, value: i.slot === 'glyph' ? (i.affixes[0] || [])[1] || 0 : null }; },
    temperCost(item, anvil) { const t = item.temper, m = anvil ? 0.9 : 1; return { gold: Math.round((15 + 4 * item.ilvl) * 1.35 ** t * m), materials: Math.round((2 + item.ilvl / 20) * 1.3 ** t * m) }; },
    salvageValue: (item) => ({ common: 1, rare: 3, epic: 8, legendary: 25 }[item.rarity] || 1) + Math.floor(item.ilvl / 20),
  });

  // ---------- Stats
  const S = (E.Stats = {
    CAPS: D.CAPS,
    k: (level) => 6 + 1.2 * Math.max(1, level),
    curve(points, level) { if (points <= 0) return 0; const k = S.k(level), b = 2 * points + k; return (b - Math.sqrt(b * b - 4 * points * points)) / (2 * points); },
    pointsFor(p, level) { p = Math.min(0.999, Math.max(0, p)); return (S.k(level) * p) / (1 - p) ** 2; },
    temperMult: (item) => 1 + 0.03 * (item.temper || 0),
    itemBase(item) {
      const t = S.temperMult(item), i = item.ilvl, g = 1.045 ** i;
      switch (item.slot) {
        case 'weapon': return { damage: 8 * g * t };
        case 'offhand': return item.base === 'shield' ? { armor: i * 0.6 * t, block: i * 0.5 * t, health: 10 * g * t } : item.base === 'buckler' ? { armor: i * 0.3 * t, block: i * 0.6 * t, health: 6 * g * t } : { damage: 2.5 * g * t };
        case 'top': case 'bottom': return { health: 20 * g * t, armor: i * 0.15 * t };
        case 'head': case 'shoes': case 'gloves': case 'cape': return { health: 12 * g * t, armor: i * 0.08 * t };
        default: return {};
      }
    },
    attributes(build) {
      const tot = Object.fromEntries(keys(D.ATTRIBUTES).map((a) => [a, 0])), src = {};
      const add = (a, n, from) => { if (n == 0) return; tot[a] += n; (src[a] = src[a] || []).push([from, round(n, 1)]); };
      const race = D.RACES[build.race]; for (const [a, n] of Object.entries(race.points)) add(a, n, race.name);
      const cls = D.CLASSES[build.cls]; for (const [a, n] of Object.entries(cls.points)) add(a, n, cls.name);
      const origin = D.ORIGINS[build.origin]; add(origin[1], C.ORIGIN_POINTS, 'Origin: ' + origin[0]);
      if (build.story && build.story.answers) for (const [a, n] of Object.entries(E.LifeStory.lean(build.race, build.story))) add(a, n, 'Life story');
      for (const [a, n] of Object.entries(build.spent || {})) add(a, n, 'Your points');
      for (const item of build.items || []) {
        const t = S.temperMult(item);
        for (const [a, v] of item.affixes) add(a, v * t, I.name(item));
        for (const gl of item.glyphs || []) if (gl) add(D.GLYPHS[gl[0]][1], gl[1], D.GLYPHS[gl[0]][0] + ' glyph');
      }
      for (const [a, n, from] of T.mods(build).attrs) add(a, n, from);
      if (Object.values(build.keystones || {}).includes('unmovable')) add('resolve', tot.resolve * 0.2, 'Keystone: Unmovable');
      if (build.race === 'draka') add('recovery', tot.recovery * 0.1, 'Ember Heart');
      // Class twists that let one attribute count as another, read from the totals before any of them apply.
      const base = { ...tot };
      for (const [a, tw] of Object.entries(D.TWISTS[build.cls] || {})) for (const [to, f] of Object.entries(tw.as || {})) add(to, base[a] * f, D.CLASSES[build.cls].name + ': ' + D.ATTRIBUTES[a][0]);
      return { total: tot, sources: src };
    },
    twistScale(points, level) { const x = Math.max(0, points) / (5 + level); return (2 * x) / (1 + x); },
    twists(cls, eff, level) {
      const out = {};
      for (const [a, tw] of Object.entries(D.TWISTS[cls] || {})) {
        const x = S.twistScale(eff[a] || 0, level);
        if (tw.as) { const to = keys(tw.as)[0]; out[a] = [tw, Math.round(tw.as[to] * 100) + '% of it also counts as ' + D.ATTRIBUTES[to][0]]; continue; }
        const now = {};
        for (const k of ['stat', 'type']) for (const [key, v] of Object.entries(tw[k] || {})) (now[k] = now[k] || {})[key] = v * x;
        out[a] = [now, T.describe(tw) + ' at one point per level (up to twice that)'];
      }
      return out;
    },
    effective(tot) { const s = Math.max(1, sum(Object.values(tot))), cap = C.SOFT_CAP_SHARE * s, eff = {}; for (const [a, n] of Object.entries(tot)) eff[a] = n <= cap ? n : cap + (n - cap) / 2; return eff; },
    resonance(items) {
      const count = {}; for (const it of items) for (const gl of it.glyphs || []) if (gl) count[gl[0]] = (count[gl[0]] || 0) + 1;
      const tiers = {}; for (const [t, n] of Object.entries(count)) { const tier = Math.min(3, Math.floor(n / 3)); if (tier > 0) tiers[t] = tier; }
      return { counts: count, tiers };
    },
    powers(items) { const p = new Set(); for (const it of items) for (const x of [it.power, it.imprint]) if (x) p.add(x); return [...p]; },
    derive(build) {
      const L = build.level, attrs = S.attributes(build), tot = attrs.total, e = S.effective(tot), items = build.items || [], powers = S.powers(items);
      let damage = 0, health = 0, armor = 0, block = 0;
      for (const it of items) { const b = S.itemBase(it); damage += b.damage || 0; health += b.health || 0; armor += b.armor || 0; block += b.block || 0; }
      damage = Math.max(3, damage); if (powers.includes('titanGrip')) damage *= 1.25; health += 30;
      const resource = D.CLASSES[build.cls].resource;
      const [resMax, resRegen] = resource === 'mana' ? [30 * e.wisdom, 0.45 * e.wisdom] : resource === 'energy' ? [12 * e.stamina, 0.9 * e.stamina] : [10 * e.fury, 0];
      // Talents, Heritage and class twists: percentage bonuses on top of what attributes give.
      const m = T.mods(build);
      for (const [tw] of Object.values(S.twists(build.cls, e, L))) for (const k of ['stat', 'type']) for (const [key, v] of Object.entries(tw[k] || {})) m[k][key] = (m[k][key] || 0) + v;
      const t = (k) => m.stat[k] || 0, power = 1 + e.insight / (10 + 4 * L), lore = e.lore / (10 + 4 * L);
      const haste = 1 + S.curve(tot.swiftness, L) + t('haste'), crit = Math.min(S.CAPS.crit, S.curve(tot.precision, L) + t('crit'));
      const maxHp = (health * (1 + e.vitality / 20) + 20 * e.vitality) * (1 + t('hp')), dmg = 1 + t('dmg');
      return {
        level: L, maxHp, weaponDamage: damage, might: damage * (1 + e.might / 10) * dmg * power, arcana: damage * (1 + e.arcana / 10) * dmg * power, spirit: damage * (1 + e.spirit / 10) * (1 + t('heal')) * power,
        crit, mega: Math.min(S.CAPS.mega, S.curve(tot.ferocity, L) * 0.5), critMult: (2 + e.ferocity / (10 + 4 * L)) * (1 + t('critDmg')), haste,
        cdr: Math.min(S.CAPS.cdr, S.curve(tot.focus, L) + t('cdr')), dodge: Math.min(S.CAPS.dodge, S.curve(tot.agility, L) + t('dodge')), dr: Math.min(S.CAPS.dr, S.curve(tot.guard + armor, L)),
        block: Math.min(S.CAPS.block, S.curve(0.4 * tot.guard + block, L) + t('block')), resist: Math.min(S.CAPS.resist, S.curve(tot.resolve, L)),
        regen: maxHp * 0.0004 * e.recovery * (1 + t('regen')), healRecv: (1 + (0.5 * e.recovery) / (e.recovery + 10 + 2 * L)) * (1 + t('healRecv')), threat: (1 + e.presence / (2 + 0.8 * L)) * Math.max(0.2, 1 + t('threat')),
        command: 1 + e.command / (10 + 4 * L), fortune: (1 + e.fortune / (5 + 2 * L)) * (1 + t('fortune')), resource, resMax, resRegen: resRegen * (1 + t('resRegen')), rageGain: (3 + 0.3 * e.fury) * (1 + t('rageGain')),
        taken: Math.max(0.5, (1 - t('taken')) * (1 - 0.5 * S.curve(tot.tenacity, L))), lifesteal: Math.min(0.3, 0.5 * S.curve(tot.hunger, L) + t('lifesteal')),
        costMult: Math.max(0.5, (1 - m.cost) * (1 - 0.5 * S.curve(tot.thrift, L))), xpBonus: t('xp') + lore, renownBonus: m.renown + lore, kin: m.kin, typeMult: m.type, skillMult: m.skill,
        costScale: resource === 'rage' ? 1 + 0.02 * (L - 1) : resource === 'energy' ? 1 + 0.03 * (L - 1) : 1 + 0.1 * (L - 1),
        powers, resonance: S.resonance(items).tiers,
      };
    },
    itemScore(item, cls) {
      if (item.slot === 'glyph') return item.value || 0;
      const w = D.CLASSES[cls].suggest, t = S.temperMult(item); let s = 0;
      for (const [a, v] of item.affixes) s += v * t * ((w[a] || 0) + 0.3);
      const b = S.itemBase(item), role = R.role(cls), g = 1.045 ** item.ilvl;
      s += (((b.damage || 0) * (role === 'tank' ? 0.5 : 1.2)) / g) * item.ilvl * 0.1;
      s += ((b.health || 0) / g) * item.ilvl * (role === 'tank' ? 0.04 : 0.02);
      s += (b.armor || 0) * (role === 'tank' ? 1 : 0.3) + (b.block || 0) * (role === 'tank' ? 0.8 : 0);
      s += (item.glyphs || []).length * 2 + (item.power ? 30 : 0);
      return round(s, 1);
    },
  });

  // ---------- Combatants
  const Cb = (E.Combatants = {
    available(cls, level, path, talents = {}) {
      const out = {}, taught = keys(talents).length ? T.grants(cls, talents) : {};
      for (const [id, sk] of Object.entries(R.classSkills(cls))) {
        if (sk[7] === 'ultimate' || sk[1] > level) continue;
        if (sk[7] === 'talent' ? !taught[id] : sk[7] !== 'core' && sk[7] !== path) continue;
        out[id] = sk;
      }
      return out;
    },
    defaultLoadout(cls, level, path, talents = {}) {
      // Path skill first so a new Path is felt right away, then core skills, then skills talents teach.
      const all = R.classSkills(cls), ids = keys(Cb.available(cls, level, path, talents)), rank = (id) => ({ core: 1, talent: 2 })[all[id][7]] || 0;
      ids.sort((a, b) => rank(a) - rank(b));
      return ids.slice(0, C.LOADOUT_SIZE);
    },
    make(build, id, name, loadout = null, ranks = {}) {
      loadout = loadout || Cb.defaultLoadout(build.cls, build.level, build.path || null, build.talents || {});
      return { id, name, cls: build.cls, race: build.race, culture: build.culture || null, backstory: build.backstory || null, origin: build.origin, level: build.level, path: build.path || null, keystones: Object.values(build.keystones || {}), loadout, ranks, stats: S.derive(build) };
    },
  });

  // ---------- Reference group
  const refCache = {};
  const Ref = (E.Reference = {
    COMP: ['guardian', 'cleric', 'ranger', 'mage', 'rogue'],
    build(cls, level, quality = null) {
      const c = D.CLASSES[cls], points = (level - 1) * C.POINTS_PER_LEVEL, w = c.suggest, sumW = sum(Object.values(w)), spent = {};
      for (const [a, n] of Object.entries(w)) spent[a] = Math.floor((points * n) / sumW);
      quality = quality || (level < 15 ? 'common' : 'rare');
      const ilvl = Math.max(1, Math.round(1.5 * level - 0.5)), r = new Rng(level * 31 + crc(cls)), prefer = keys(w);
      const kit = Object.fromEntries(Object.entries(c.kit).filter(([, b]) => b !== 'none'));
      let extra = Math.floor(level / 2); const items = [];
      for (const slot of keys(D.SLOTS)) {
        const base = kit[slot] || null;
        if (base === null) { if (slot === 'offhand' || extra <= 0) continue; --extra; }
        const k = items.length % 3, shift = [...prefer.slice(k), ...prefer.slice(0, k)];
        items.push(I.generate(r, ilvl, base !== null && level === 1 ? 'common' : quality, slot, base, shift));
      }
      return { race: 'human', cls, origin: 'anvil', level, spent, path: null, keystones: {}, items, talents: T.auto(cls, T.points(level)) };
    },
    forLevel(level) {
      if (refCache[level]) return refCache[level];
      const s = {}; for (const cls of Ref.COMP) s[cls] = S.derive(Ref.build(cls, level));
      const party = Ref.COMP.map((cls, n) => { const b = Ref.build(cls, level); b.path = level >= C.PATH_LEVEL ? keys(D.CLASSES[cls].paths)[0] : null; return Cb.make(b, n + 1, cls); });
      const dps = new Simulator().measureDps(party);
      const druid = S.derive(Ref.build('druid', level));
      const hps = ((s.cleric.spirit * s.cleric.haste + druid.spirit * druid.haste) / 2) * 1.3;
      const all = Object.values(s);
      return (refCache[level] = { dps, hps, tankHp: s.guardian.maxHp, tankDr: s.guardian.dr, avgHp: sum(all.map((x) => x.maxHp)) / 5, avgDr: sum(all.map((x) => x.dr)) / 5 });
    },
  });

  // ---------- Simulator
  const DT = 0.5, WALK = 4;
  const rd2 = (x) => Math.round(x * 100) / 100;
  class Simulator {
    constructor() { Object.assign(this, { t: 0, h: [], e: {}, clear: 0, wing: 0, phaseStart: 0, phase: 'pack', ev: [], snap: [], report: [], enemySeq: 0, dungeonLevel: 1, mech: {}, enrageAt: 0, enraged: false, shardsSpawned: false, wipe: null, lastDeath: [], oomAt: {} }); }
    newReport() { return { damage: 0, healing: 0, overheal: 0, taken: 0, absorbed: 0, deaths: 0, mechanics: {}, casts: 0 }; }
    measureDps(heroes, seconds = 90) {
      this.r = new Rng(12345);
      this.ref = { dps: 1, hps: 0, tankHp: 1, tankDr: 0, avgHp: 1, avgDr: 0 };
      heroes.forEach((x, i) => { this.h[i] = this.initHero(i, x); this.report[i] = this.newReport(); });
      this.applyKin();
      this.phase = 'boss'; this.mech = { buster: 1e9, rain: 1e9, shock: 1e9, curse: 1e9 }; this.enrageAt = 1e9; this.shardsSpawned = true;
      this.spawn('boss', 'Target Dummy', 1e15, 0, 2);
      for (const h of this.h) this.e[this.enemySeq].threat[h.i] = h.role === 'tank' ? 10 : 0;
      while (this.t < seconds) { this.t = rd2(this.t + DT); this.tick(); }
      return sum(this.report.map((r) => r.damage)) / seconds;
    }
    run(heroes, dungeonLevel, seed) {
      this.r = new Rng(seed);
      this.dungeonLevel = Math.max(1, dungeonLevel);
      this.ref = Ref.forLevel(this.dungeonLevel);
      heroes.forEach((x, i) => { this.h[i] = this.initHero(i, x); this.report[i] = this.newReport(); });
      this.applyKin();
      let done = 0, bosses = 0;
      for (let c = 0; c < D.DUNGEON.length; c++) {
        const [kind, name, wing] = D.DUNGEON[c];
        this.clear = c; this.wing = wing;
        if (c > 0) this.walk();
        for (const hero of this.h) { if (hero.dead) { hero.dead = false; hero.hp = hero.s.maxHp * 0.4; this.emit('revive', hero.i, -1, 0, 0); } hero.lastRite = false; }
        if (!this.fight(kind, name)) break;
        done++; if (kind === 'boss') bosses++;
      }
      const report = { dungeon: D.DUNGEON_NAME, plan: D.DUNGEON.map((x) => [x[0], x[1]]), encountersDone: done, bossesKilled: bosses, wiped: !!this.wipe, cause: this.wipe ? this.explain() : null, length: round(this.t, 1), dungeonLevel, heroes: [] };
      this.h.forEach((hero, i) => {
        const r = {}; for (const [k, v] of Object.entries(this.report[i])) r[k] = typeof v === 'number' ? Math.round(v) : v;
        report.heroes[i] = { ...r, id: hero.id, name: hero.name, cls: hero.cls };
      });
      return { report, timeline: { events: this.ev, snaps: this.snap, length: round(this.t, 1) } };
    }
    /** Heritage: heroes fight harder beside their own race, twice as much beside their own culture. */
    applyKin() {
      for (const h of this.h) {
        if (!(h.s.kin > 0)) continue;
        const f = 1 + Math.min(D.HERITAGE.KIN_CAP, h.s.kin * H.kin(h.race, h.culture, this.h.filter((x) => x !== h).map((x) => [x.race, x.culture, x.backstory || null]), h.backstory || null));
        h.s = Object.assign({}, h.s, { might: h.s.might * f, arcana: h.s.arcana * f, spirit: h.s.spirit * f });
      }
    }
    initHero(i, x) {
      const s = x.stats, all = R.classSkills(x.cls), skills = {};
      for (const id of x.loadout) if (all[id]) skills[id] = all[id];
      const ult = D.CLASSES[x.cls].ultimate[0];
      if (x.level >= C.ULTIMATE_LEVEL) skills[ult] = all[ult];
      return {
        i, id: x.id, name: x.name, cls: x.cls, role: R.role(x.cls), race: x.race, culture: x.culture || null, backstory: x.backstory || null, origin: x.origin, level: x.level, ks: Object.values(x.keystones || []), s,
        school: D.CLASSES[x.cls].school, passive: D.CLASSES[x.cls].passive[0], skills, ult, ranks: x.ranks || {},
        hp: s.maxHp, res: s.resource === 'rage' ? 0 : s.resMax, absorb: 0, cd: {}, gcd: 0, swing: 0, dead: false, knock: 0,
        walls: [], buffs: [], hots: [], pets: [], curse: null, nineLives: false, phoenix: false, lastRite: false, secondWind: false,
        stack: 0, stackTarget: null, forceCrit: false, firstHeal: true, firstBossHit: true, firstPackHit: true, oom: false,
      };
    }
    ks(h, id) { return h.ks.includes(id); }
    res(h, theme) { return h.s.resonance[theme] || 0; }
    power(h, id) { return h.s.powers.includes(id); }
    enemyList() { return Object.values(this.e).map((e) => [e.id, e.kind, e.name, Math.trunc(e.max)]); }
    snapshot() {
      this.snap.push([Math.round(this.t), this.h.map((h) => (h.dead ? 0 : Math.round((1000 * h.hp) / h.s.maxHp))), this.h.map((h) => (h.s.resMax > 0 ? Math.round((1000 * h.res) / h.s.resMax) : 0)),
        Object.values(this.e).map((e) => [e.id, Math.max(0, Math.round((1000 * e.hp) / e.max))]), this.h.map((h) => (h.absorb > 0 ? Math.round(1000 * Math.min(1, h.absorb / h.s.maxHp)) : 0))]);
    }
    walk() {
      this.e = {};
      this.emit('walk', this.clear, -1, 0, 0, { to: D.DUNGEON[this.clear][1] });
      const end = this.t + WALK;
      while (this.t < end) { this.t = rd2(this.t + DT); if (Math.abs(this.t - Math.round(this.t)) < 0.01) this.snapshot(); }
    }
    fight(phase, name = 'Ember Golem') {
      this.phase = phase; const f = this.difficulty(), ref = this.ref;
      this.e = {}; this.shardsSpawned = false; this.enraged = false;
      const hitDmg = (ref.hps * 0.14 * 2 * f) / (1 - ref.tankDr);
      if (phase === 'pack' && name === 'Brute pack') {
        for (let k = 0; k < 2; k++) this.spawn('add', 'Ember Imp', (ref.dps * 11 * f) / 4, hitDmg, 2);
        this.spawn('brute', 'Ember Brute', (ref.dps * 11 * f) / 2, hitDmg * 1.8, 2.5);
      } else if (phase === 'pack') {
        for (let k = 0; k < 3; k++) this.spawn('add', 'Ember Imp', (ref.dps * 11 * f) / 3, hitDmg, 2);
      } else {
        const [hpShare, dmgShare, mechs, enrage, hit] = D.BOSSES[name];
        this.spawn('boss', name, ref.dps * 46 * f * hpShare, (ref.hps * 0.46 * 2 * f * dmgShare) / (1 - ref.tankDr), 2);
        this.e[this.enemySeq].hit = hit;
        const on = (m, at) => (mechs.includes(m) ? at : 1e9);
        this.mech = { buster: on('buster', 12), rain: on('rain', 6), shock: on('shock', 25), curse: on('curse', 18) };
        this.shardsSpawned = !mechs.includes('adds');
        this.enrageAt = enrage;
      }
      this.phaseStart = this.t;
      this.emit('phase', this.clear, phase === 'boss' ? 1 : 0, 0, 0, { name, wing: this.wing, enemies: this.enemyList() });
      for (const h of this.h) {
        if (h.dead) continue;
        const s = h.s;
        if (s.resource === 'rage' && h.origin !== 'wolf') h.res = 0;
        if (s.resource === 'energy' && h.origin === 'hare') h.res = s.resMax;
        if (s.resource === 'mana') h.res = Math.min(s.resMax, h.res + s.resRegen * 3 * (h.origin === 'tide' ? 2 : 1));
        if (h.origin === 'oak') h.absorb += s.maxHp * 0.08;
        Object.assign(h, { secondWind: false, firstPackHit: true, firstBossHit: true, stack: 0, gcd: this.t, swing: this.t + (0.5 * h.i) / 5 });
      }
      for (const e of Object.values(this.e)) for (const h of this.h) e.threat[h.i] = h.role === 'tank' && !h.dead ? 10 : 0;
      const limit = this.t + (phase === 'boss' ? 160 : 90);
      for (;;) {
        this.t = rd2(this.t + DT); this.tick();
        if (!this.aliveEnemies().length) return true;
        if (!this.aliveHeroes().length) { this.wipe = this.wipe || { t: this.t, clear: this.clear, phase, enraged: this.enraged }; return false; }
        if (this.t > limit) { this.wipe = { t: this.t, clear: this.clear, phase, enraged: true, timeout: true }; return false; }
      }
    }
    difficulty() { return Math.min(1, 0.5 + 0.04 * this.dungeonLevel) * (1 + 0.15 * this.wing); }
    spawn(kind, name, hp, dmg, swing) {
      const id = ++this.enemySeq;
      this.e[id] = { id, kind, name, hp, max: hp, dmg, swingEvery: swing, swing: this.t + 1, threat: {}, taunt: null, tauntUntil: 0, slows: [], marks: [], dots: {} };
    }
    tick() {
      const t = this.t, whole = Math.abs(t - Math.round(t)) < 0.01;
      for (const h of this.h) {
        if (h.dead) continue;
        const s = h.s;
        if (s.resource !== 'rage') h.res = Math.min(s.resMax, h.res + s.resRegen * DT * (this.ks(h, 'deepWell') ? 1.3 : 1));
        const regen = s.regen + (h.passive === 'deepRoots' ? s.maxHp * 0.012 : 0);
        h.hp = Math.min(s.maxHp, h.hp + regen * DT);
      }
      if (whole) { this.tickHots(); this.tickDots(); }
      for (let i = 0; i < this.h.length; i++) {
        if (this.h[i].dead || this.h[i].knock > t) continue;
        if (t >= this.h[i].swing) this.autoAttack(i);
        if (t >= this.h[i].gcd) this.act(i);
        this.h[i].pets = this.h[i].pets.filter((pet) => {
          if (pet.until < t) return false;
          if (whole) this.hit(i, this.focusTarget(i), pet.mult, pet.school, { pet: true });
          return true;
        });
        if (!this.aliveEnemies().length) return;
      }
      for (const id of keys(this.e)) {
        const e = this.e[id];
        if (!e || e.hp <= 0) continue;
        let slow = 0; for (const sl of e.slows) if (sl[1] > t) slow = Math.max(slow, sl[0]);
        if (t >= e.swing) {
          const target = this.enemyTarget(e.id);
          if (target !== null) this.damageHero(target, e.dmg * (this.enraged && e.kind === 'boss' ? 3 : 1), { melee: true, src: e.id, what: e.hit || e.name });
          e.swing = t + e.swingEvery * (1 + slow) * (this.enraged && e.kind === 'boss' ? 0.6 : 1);
        }
      }
      if (this.phase === 'boss') this.bossMechanics();
      if (whole) this.snapshot();
    }
    bossMechanics() {
      const t = this.t - this.phaseStart;
      let boss = null; for (const e of Object.values(this.e)) if (e.kind === 'boss' && e.hp > 0) boss = e;
      if (!boss) return;
      const f = this.difficulty(), ref = this.ref, m = this.enraged ? 2 : 1;
      const mech = (i, k) => { const r = this.report[i].mechanics; r[k] = (r[k] || 0) + 1; };
      if (t >= this.mech.buster) {
        this.mech.buster += 15;
        const target = this.enemyTarget(boss.id);
        if (target !== null) { this.emit('mech', -1, target, 0, 0, { name: 'Tank Buster' }); this.damageHero(target, (ref.tankHp * 0.3 * f * m) / (1 - ref.tankDr), { melee: true, src: boss.id, what: 'Tank Buster', big: true }); }
      }
      if (t >= this.mech.rain) {
        this.mech.rain += 9;
        this.emit('mech', -1, -1, 0, 0, { name: 'Magma Rain' });
        // Scaled from healing, but never past a share of a hero's health: big heals must not mean one-shots.
        const rain = (Math.min((ref.hps * 0.3 * 9) / 5, ref.avgHp * 0.35 * (1 - ref.avgDr * 0.5)) * f * m) / (1 - ref.avgDr * 0.5);
        this.h.forEach((h, i) => { if (!h.dead) this.damageHero(i, rain, { fire: true, magic: true, src: boss.id, what: 'Magma Rain' }); });
      }
      if (t >= this.mech.shock) {
        this.mech.shock += 30;
        this.emit('mech', -1, -1, 0, 0, { name: 'Shockwave' });
        this.h.forEach((h, i) => {
          if (h.dead) return;
          const immune = h.race === 'dwarf' || this.ks(h, 'unmovable') || this.r.getFloat(0, 1) < h.s.resist;
          if (immune) mech(i, 'shockResisted'); else { h.knock = this.t + 2; mech(i, 'knockedBack'); }
        });
      }
      if (t >= this.mech.curse) {
        this.mech.curse += 30;
        const alive = this.h.filter((h) => !h.dead && h.role !== 'tank').map((h) => h.i);
        if (alive.length) {
          const i = alive[this.r.getInt(0, alive.length - 1)];
          if (this.r.getFloat(0, 1) < this.h[i].s.resist) { this.emit('mech', -1, i, 0, 1, { name: 'Curse resisted' }); mech(i, 'curseResisted'); }
          else { this.emit('mech', -1, i, 0, 0, { name: 'Smouldering Curse' }); this.h[i].curse = { until: this.t + 10, dps: this.h[i].s.maxHp * 0.035 }; }
        }
      }
      if (!this.shardsSpawned && boss.hp < boss.max * 0.5) {
        this.shardsSpawned = true;
        this.emit('mech', -1, -1, 0, 0, { name: 'Ember Shards' });
        for (let k = 0; k < 2; k++) {
          this.spawn('shard', 'Ember Shard', ref.dps * 3.5 * f, (ref.hps * 0.1 * 2 * f) / (1 - ref.tankDr), 2);
          const id = this.enemySeq;
          this.emit('spawn', id, -1, Math.trunc(this.e[id].max), 0, { enemy: [id, 'shard', 'Ember Shard', Math.trunc(this.e[id].max)] });
          for (const h of this.h) this.e[id].threat[h.i] = h.role === 'healer' ? 5 : 0;
        }
        this.emit('phase', this.clear, 2, 0, 0, { enemies: this.enemyList() });
      }
      if (!this.enraged && t >= this.enrageAt) { this.enraged = true; this.emit('mech', -1, -1, 0, 0, { name: 'Enrage' }); }
    }
    act(i) {
      const h = this.h[i];
      const choice = h.role === 'tank' ? this.chooseTank(i) : h.role === 'healer' ? this.chooseHealer(i) : this.chooseDps(i);
      if (!choice) { h.gcd = this.t + 0.5; return; }
      const [id, target] = choice;
      this.cast(i, id, target);
      if (this.power(h, 'echo') && h.skills[id][2] !== 'taunt' && this.r.getFloat(0, 1) < 0.2) this.cast(i, id, target, true);
    }
    ready(i, id) { const h = this.h[i]; if (!h.skills[id]) return false; if ((h.cd[id] || 0) > this.t) return false; return h.res >= this.cost(i, id) - 0.001; }
    rank(i, id) { return Math.max(1, Math.trunc(this.h[i].ranks[id] || 1)); }
    cost(i, id) {
      const h = this.h[i], sk = h.skills[id];
      if (sk[7] === 'ultimate') return 0;
      let c = sk[4] * h.s.costScale * Math.max(0.5, 1 - 0.02 * Math.max(0, this.rank(i, id) - 5)) * (h.s.costMult ?? 1);
      if (h.role === 'healer' && this.ks(h, 'frugal') && ['heal', 'groupheal', 'hot', 'shield'].includes(sk[2])) c *= 0.75;
      return c;
    }
    skillsOfType(i, types) {
      const h = this.h[i], out = [];
      for (const [id, sk] of Object.entries(h.skills)) if (types.includes(sk[2]) && id !== h.ult && this.ready(i, id)) out.push(id);
      out.sort((a, b) => h.skills[b][3] - h.skills[a][3]);
      return out;
    }
    chooseTank(i) {
      const h = this.h[i], hpPct = h.hp / h.s.maxHp, ult = h.ult; let ids;
      if (hpPct < 0.4 && this.ready(i, ult)) return [ult, i];
      for (const e of Object.values(this.e)) if (e.hp > 0 && this.enemyTarget(e.id) !== i && (ids = this.skillsOfType(i, ['taunt'])).length) return [ids[0], e.id];
      const busterSoon = this.phase === 'boss' && (this.mech.buster ?? 1e9) - (this.t - this.phaseStart) < 2.5;
      if (busterSoon && (ids = this.skillsOfType(i, ['wall', 'shield'])).length) return [ids[0], i];
      const rageFull = h.s.resource === 'rage' && h.res >= 0.8 * h.s.resMax && this.phase === 'boss';
      if ((hpPct < 0.65 || rageFull) && (ids = this.skillsOfType(i, ['wall'])).length) return [ids[0], i];
      if (hpPct < 0.75 && (ids = this.skillsOfType(i, ['shield', 'hot'])).length) return [ids[0], i];
      if (this.aliveEnemies().length >= 2 && (ids = this.skillsOfType(i, ['aoe'])).length) return [ids[0], null];
      if ((ids = this.skillsOfType(i, ['strike'])).length) return [ids[0], this.focusTarget(i)];
      return null;
    }
    chooseHealer(i) {
      const pct = (x) => x.hp / x.s.maxHp;
      const alive = this.h.filter((x) => !x.dead).sort((a, b) => pct(a) - pct(b));
      const lowest = alive.length ? alive[0].i : null, low = alive.filter((x) => pct(x) < 0.7).length;
      let tank = null; for (const x of alive) if (x.role === 'tank') tank = x.i;
      const me = this.h[i], ult = me.ult; let ids;
      if (low >= 3 && this.ready(i, ult)) return [ult, null];
      if (low >= 3 && (ids = this.skillsOfType(i, ['groupheal'])).length) return [ids[0], null];
      for (const [id, sk] of Object.entries(me.skills)) if (low >= 2 && ['hot', 'shield'].includes(sk[2]) && sk[6].party && this.ready(i, id)) return [id, null];
      if (lowest !== null && pct(this.h[lowest]) < 0.5 && (ids = this.skillsOfType(i, ['heal'])).length) return [ids[0], lowest];
      if (tank !== null && this.h[tank].absorb <= 0) for (const [id, sk] of Object.entries(me.skills)) if (sk[2] === 'shield' && !sk[6].party && this.ready(i, id)) return [id, tank];
      for (const who of [tank, lowest]) {
        if (who === null || pct(this.h[who]) > 0.95) continue;
        if (!this.h[who].hots.some((h) => h.src === i)) for (const [id, sk] of Object.entries(me.skills)) if (sk[2] === 'hot' && !sk[6].party && !sk[6].self && this.ready(i, id)) return [id, who];
      }
      if (lowest !== null && pct(this.h[lowest]) < 0.8 && (ids = this.skillsOfType(i, ['heal'])).length) return [ids[ids.length - 1], lowest];
      if (low >= 2 && (ids = this.skillsOfType(i, ['groupheal'])).length) return [ids[0], null];
      if (me.res > me.s.resMax * 0.6 && (lowest === null || pct(this.h[lowest]) > 0.85)) {
        if ((ids = this.skillsOfType(i, ['pet'])).length) return [ids[0], null];
        if ((ids = this.skillsOfType(i, ['strike'])).length) return [ids[0], this.focusTarget(i)];
      }
      return null;
    }
    chooseDps(i) {
      const h = this.h[i]; let boss = null, ids;
      for (const e of Object.values(this.e)) if (e.kind === 'boss' && e.hp > 0) boss = e;
      if (this.ready(i, h.ult) && (boss ? boss.hp < boss.max * 0.9 : this.aliveEnemies().length >= 3)) return [h.ult, this.focusTarget(i)];
      for (const e of Object.values(this.e)) if (e.hp > 0 && this.enemyTarget(e.id) === i && (ids = this.skillsOfType(i, ['vanish'])).length) return [ids[0], null];
      if (boss) {
        for (const type of ['mark', 'buff', 'slow', 'pet']) if ((ids = this.skillsOfType(i, [type])).length) return [ids[0], boss.id];
        const target = this.focusTarget(i);
        if (target && !this.e[target].dots[i] && (ids = this.skillsOfType(i, ['dot'])).length) return [ids[0], target];
      }
      const focus = this.focusTarget(i);
      if (focus !== null && this.closeToPulling(i, focus)) return null;
      const n = this.aliveEnemies().length;
      if ((n >= 3 || (n >= 2 && this.ks(h, 'shrapnel'))) && (ids = this.skillsOfType(i, ['aoe'])).length) return [ids[0], null];
      if (!boss && n >= 2 && (ids = this.skillsOfType(i, ['slow', 'pet'])).length) return [ids[0], this.focusTarget(i)];
      if ((ids = this.skillsOfType(i, ['strike'])).length) return [ids[0], this.focusTarget(i)];
      if ((ids = this.skillsOfType(i, ['aoe', 'dot'])).length) return [ids[0], this.focusTarget(i)];
      return null;
    }
    cast(i, id, target, echo = false) {
      const h = this.h[i], sk = h.skills[id];
      let [name, , type, mult, , cd, opts] = sk;
      opts = Array.isArray(opts) ? {} : opts;
      if (!echo) {
        h.res -= this.cost(i, id);
        if (h.res < h.s.resMax * 0.05 && h.s.resource === 'mana' && !h.oom) { h.oom = true; if (!this.oomAt[i]) this.oomAt[i] = { t: this.t, clear: this.clear }; }
        let cdm = (1 - h.s.cdr) * Math.max(0.5, 1 - 0.02 * Math.max(0, this.rank(i, id) - 5));
        if (h.role === 'healer' && this.ks(h, 'quickened') && ['heal', 'groupheal', 'hot', 'shield'].includes(type)) cdm *= 0.7;
        if (type === 'taunt' && h.origin === 'bell') cdm *= 0.8;
        h.cd[id] = this.t + cd * cdm;
        h.gcd = this.t + 1.5 / h.s.haste;
        this.report[i].casts++;
      }
      const rankMult = 1 + 0.1 * (Math.min(5, this.rank(i, id)) - 1);
      mult *= rankMult * (1 + ((h.s.typeMult || {})[type] || 0) + ((h.s.skillMult || {})[id] || 0));
      const school = opts.school || (['heal', 'groupheal', 'hot', 'shield'].includes(type) ? 'spirit' : h.school);
      const cmd = h.s.command, dur = (opts.dur ?? 8) + (h.origin === 'crown' ? 2 : 0);
      if (sk[7] === 'ultimate' || type === 'taunt' || type === 'wall') this.emit('cast', i, Number.isInteger(target) ? target : -1, 0, sk[7] === 'ultimate' ? 1 : 0, { name });
      const liveIdx = () => this.h.filter((x) => !x.dead).map((x) => x.i);
      switch (type) {
        case 'strike': this.hit(i, target ?? this.focusTarget(i), mult, school, { threat: opts.threat ?? 1, fire: !!opts.fire, single: true }); break;
        case 'aoe': for (const eid of this.aliveEnemies()) this.hit(i, eid, mult * (this.ks(h, 'shrapnel') ? 1.4 : 1), school, { threat: opts.threat ?? 1, fire: !!opts.fire }); break;
        case 'dot': if (target && this.e[target]) this.e[target].dots[i] = { until: this.t + dur, tick: (this.powerOf(i, school) * mult) / dur }; break;
        case 'taunt':
          for (const eid of this.aliveEnemies()) { const e = this.e[eid], top = Math.max(0, ...Object.values(e.threat)); e.threat[i] = top * 1.1 + 1; e.taunt = i; e.tauntUntil = this.t + 4; }
          break;
        case 'wall': {
          const p = Math.min(0.7, (mult / rankMult) * (this.ks(h, 'ironWill') ? 1.3 : 1) * (1 + (cmd - 1) * 0.5));
          for (const w of opts.party ? this.h.map((x) => x.i) : [i]) this.h[w].walls.push([p, this.t + dur]);
          break;
        }
        case 'shield': {
          let amount = opts.ofHp ? h.s.maxHp * mult : this.powerOf(i, 'spirit') * mult;
          amount *= (this.ks(h, 'ironWill') ? 1.3 : 1) * cmd;
          const who = opts.party ? liveIdx() : [opts.self ? i : target ?? i];
          for (const w of who) this.h[w].absorb += amount;
          this.emit('shield', i, who.length > 1 ? -1 : who[0], Math.trunc(amount), 0);
          break;
        }
        case 'heal': this.heal(i, target ?? i, this.powerOf(i, 'spirit') * mult); break;
        case 'groupheal': this.h.forEach((x, w) => { if (!x.dead) this.heal(i, w, this.powerOf(i, 'spirit') * mult); }); break;
        case 'hot': {
          const amount = opts.ofHp ? h.s.maxHp * mult : this.powerOf(i, 'spirit') * mult;
          for (const w of opts.party ? liveIdx() : [opts.self ? i : target ?? i]) this.h[w].hots.push({ src: i, until: this.t + dur, tick: amount / dur });
          break;
        }
        case 'buff': h.buffs.push([mult, this.t + dur]); break;
        case 'mark':
          if (target && this.e[target]) {
            this.e[target].marks.push([mult * cmd, this.t + dur]);
            if (opts.slow) this.e[target].slows.push([opts.slow, this.t + dur]);
            if (this.ks(h, 'teamPlayer')) for (const x of this.h) x.buffs.push([0.05 * cmd, this.t + dur]);
          }
          break;
        case 'slow':
          for (const eid of opts.aoeMult ? this.aliveEnemies() : [target ?? this.focusTarget(i)]) {
            if (eid && this.e[eid]) { this.e[eid].slows.push([Math.min(0.6, (mult / rankMult) * cmd), this.t + dur]); if (opts.aoeMult) this.hit(i, eid, opts.aoeMult * rankMult, school, {}); }
          }
          break;
        case 'vanish': for (const e of Object.values(this.e)) e.threat[i] = (e.threat[i] || 0) * mult; break;
        case 'pet':
          h.pets.push({ until: this.t + dur, mult, school });
          if (h.role === 'healer') { h.hots.push({ src: i, until: this.t + dur, tick: 0 }); this.h.forEach((x) => { if (!x.dead) x.hots.push({ src: i, until: this.t + dur, tick: (this.powerOf(i, 'spirit') * mult * 0.6) / dur }); }); }
          break;
      }
    }
    powerOf(i, school) {
      const h = this.h[i]; let p = h.s[school] ?? h.s.might;
      if (h.race === 'orc' && h.hp < h.s.maxHp * 0.5 && school !== 'spirit') p *= 1.1;
      let buff = 0; for (const b of h.buffs) if (b[1] > this.t) buff += b[0];
      return p * (1 + buff);
    }
    autoAttack(i) {
      const h = this.h[i], target = this.focusTarget(i);
      h.swing = this.t + 2 / h.s.haste;
      if (target === null) return;
      this.hit(i, target, h.role === 'healer' ? 0.25 : 0.55, h.role === 'healer' ? 'arcana' : h.school, { threat: h.role === 'tank' ? 6 : 1, auto: true });
    }
    focusTarget(i) {
      const alive = this.aliveEnemies(); if (!alive.length) return null;
      const h = this.h[i];
      if (h.role === 'tank') for (const eid of alive) if (this.enemyTarget(eid) !== i) return eid;
      let best = null;
      for (const eid of alive) { const e = this.e[eid]; if (best === null || (e.kind !== 'boss' && this.e[best].kind === 'boss') || (e.kind === this.e[best].kind && e.hp < this.e[best].hp)) best = eid; }
      return best;
    }
    hit(i, eid, mult, school, o) {
      if (eid === null || eid === undefined || !this.e[eid] || this.e[eid].hp <= 0) return;
      const h = this.h[i], e = this.e[eid];
      let dmg = this.powerOf(i, school) * mult;
      if (o.single && this.ks(h, 'shrapnel')) dmg *= 0.9;
      let mark = 0; for (const mk of e.marks) if (mk[1] > this.t) mark = Math.max(mark, mk[0]);
      dmg *= 1 + mark;
      if (h.passive === 'steadyAim') { h.stack = h.stackTarget === eid ? Math.min(10, h.stack + 1) : 0; h.stackTarget = eid; dmg *= 1 + 0.03 * h.stack; }
      if (this.ks(h, 'executioner') && e.hp < e.max * 0.25) dmg *= 1.5;
      let crit = this.r.getFloat(0, 1) < h.s.crit || h.forceCrit;
      if (e.kind === 'boss' && h.firstBossHit) { crit = crit || h.origin === 'hawk' || this.ks(h, 'patientHunter'); h.firstBossHit = false; }
      if (e.kind !== 'boss' && h.firstPackHit) { crit = crit || this.ks(h, 'patientHunter'); h.firstPackHit = false; }
      h.forceCrit = false;
      let mega = false;
      if (crit) {
        mega = this.r.getFloat(0, 1) < h.s.mega;
        dmg *= mega ? 8 : h.s.critMult;
        if (h.passive === 'overcharge' && h.s.resource === 'mana') h.res = Math.min(h.s.resMax, h.res + h.s.resMax * 0.02);
        if (h.race === 'elf') h.res = Math.min(h.s.resMax, h.res + h.s.resMax * 0.015);
      }
      if (h.s.resource === 'rage') h.res = Math.min(h.s.resMax, h.res + h.s.rageGain * 0.5);
      dmg = Math.max(1, dmg);
      e.hp -= dmg;
      this.report[i].damage += dmg;
      let threat = dmg * (o.threat ?? 1) * h.s.threat * (h.role === 'tank' ? 2 : 1);
      if (this.ks(h, 'provoker')) threat *= 1.5;
      if (this.ks(h, 'quietBlade')) threat *= 0.6;
      threat *= 1 - 0.2 * this.res(h, 'shadow');
      e.threat[i] = (e.threat[i] || 0) + threat;
      this.emit('hit', i, eid, Math.round(dmg), (crit ? 1 : 0) | (mega ? 2 : 0) | (o.auto ? 4 : 0) | (o.pet ? 8 : 0));
      const frost = this.res(h, 'frost'); if (frost) e.slows.push([0.03 * frost, this.t + 3]);
      let burn = crit && h.origin === 'ember' && school === 'arcana' ? 0.3 : 0;
      burn += crit ? 0.2 * this.res(h, 'ember') : 0;
      if (burn > 0) e.dots['burn' + i] = { until: this.t + 4, tick: (dmg * burn) / 4, src: i };
      // Lifesteal heals quietly: no event per hit, so the timeline stays small.
      if (h.s.lifesteal > 0 && !h.dead) { const ls = Math.min(h.s.maxHp - h.hp, dmg * h.s.lifesteal * h.s.healRecv); h.hp += ls; this.report[i].healing += ls; }
      const bt = this.ks(h, 'bloodthirst') && crit ? dmg * 0.05 : 0, bc = this.ks(h, 'battleCleric') && !o.auto ? dmg * 0.5 : 0;
      if (bt > 0) this.heal(i, i, bt, false);
      if (bc > 0) this.heal(i, this.lowestAlly(), bc, false);
      const storm = this.res(h, 'storm');
      if (crit && storm && !o.chain) for (const other of this.aliveEnemies()) if (other !== eid) { this.hit(i, other, mult * 0.3 * storm, school, { chain: true }); break; }
      if (mega && this.power(h, 'starfall') && !o.chain) for (const other of this.aliveEnemies()) if (other !== eid) this.hit(i, other, mult, school, { chain: true });
      if (this.e[eid] && this.e[eid].hp <= 0) this.emit('kill', i, eid, 0, 0);
    }
    heal(src, w, amount, canCrit = true) {
      if (w === null || w === undefined || this.h[w].dead) return;
      const h = this.h[src], t = this.h[w];
      if (h.passive === 'seasons') amount *= 1 + 0.01 * ((this.t - this.phaseStart) / 5);
      if (t.hp / t.s.maxHp < 0.3) amount *= 1 + (this.ks(h, 'guardianAngel') ? 0.4 : 0) + 0.2 * this.res(h, 'light');
      let crit = false;
      if (canCrit) { crit = this.r.getFloat(0, 1) < h.s.crit || (h.origin === 'lantern' && h.firstHeal); h.firstHeal = false; if (crit) amount *= h.s.critMult; }
      amount *= t.s.healRecv;
      const done = Math.min(t.s.maxHp - t.hp, amount), over = amount - done;
      t.hp += done;
      this.report[src].healing += done; this.report[src].overheal += over;
      if (over > 0 && this.ks(h, 'overflow')) t.absorb += over * 0.5;
      const tide = this.res(h, 'tide');
      if (over > 0 && tide) this.h[this.lowestAlly() ?? w].absorb += over * 0.2 * tide;
      if (this.power(h, 'everbloom') && canCrit) t.hots.push({ src, until: this.t + 6, tick: (amount * 0.3) / 6 });
      const alive = this.aliveEnemies(), n = Math.max(1, keys(this.e).length);
      for (const eid of alive) this.e[eid].threat[src] = (this.e[eid].threat[src] || 0) + (done * 0.3) / n;
      if (done > 0 || crit) this.emit('heal', src, w, Math.round(done), crit ? 1 : 0);
    }
    damageHero(i, raw, o) {
      const h = this.h[i]; if (h.dead) return;
      const s = h.s, what = o.what || 'an attack', mech = (k) => { const r = this.report[i].mechanics; r[k] = (r[k] || 0) + 1; };
      if (o.melee && this.r.getFloat(0, 1) < s.dodge) { this.emit('dodge', -1, i, 0, 0); if (h.origin === 'fox') h.forceCrit = true; if (o.big) mech('busterDodged'); return; }
      let dmg = raw, blocked = false;
      if (o.melee && this.r.getFloat(0, 1) < s.block) { dmg *= 0.5; blocked = true; if (o.big) mech('busterBlocked'); }
      dmg *= (1 - s.dr * (o.magic ? 0.5 : 1)) * (s.taken ?? 1);
      h.walls = h.walls.filter((w) => w[1] > this.t);
      let wall = 0; for (const w of h.walls) wall = Math.max(wall, w[0]);
      dmg *= 1 - wall;
      if (o.fire && h.race === 'draka') dmg *= 0.5;
      if (this.h.some((x) => !x.dead && x.role === 'tank' && this.ks(x, 'rallyingWall'))) dmg *= 0.95;
      const absorbed = Math.min(h.absorb, dmg);
      h.absorb -= absorbed; dmg -= absorbed; h.hp -= dmg;
      this.report[i].taken += dmg + absorbed; this.report[i].absorbed += absorbed;
      if (s.resource === 'rage') h.res = Math.min(s.resMax, h.res + s.rageGain);
      this.emit('hurt', o.src ?? -1, i, Math.round(dmg + absorbed), (blocked ? 1 : 0) | (o.big ? 2 : 0) | (o.fire ? 4 : 0));
      const thorn = this.res(h, 'thorn'), spiked = blocked && this.ks(h, 'spikedGuard'), stone = blocked ? this.res(h, 'stone') : 0;
      if (h.role === 'tank' && this.ks(h, 'secondWind') && !h.secondWind && h.hp > 0 && h.hp < s.maxHp * 0.3) { h.secondWind = true; h.absorb += s.maxHp * 0.2; }
      if (h.hp <= 0) this.onLethal(i, what);
      const src = o.src;
      if (src && this.e[src] && o.melee && (thorn || spiked)) this.hit(i, src, 0.15 * thorn + (spiked ? 0.4 : 0), h.school, { chain: true });
      let low; if (stone && (low = this.lowestAlly()) !== null) this.h[low].absorb += this.h[low].s.maxHp * 0.04 * stone;
    }
    onLethal(i, what) {
      const h = this.h[i];
      if (h.race === 'felkin' && !h.nineLives) { h.nineLives = true; h.hp = 1; this.emit('mech', -1, i, 0, 1, { name: 'Nine Lives' }); return; }
      for (const x of this.h) if (!x.dead && x.i !== i && x.passive === 'lastRite' && !x.lastRite) { x.lastRite = true; h.hp = h.s.maxHp * 0.2; this.emit('mech', x.i, i, 0, 1, { name: 'Last Rite' }); return; }
      if (this.power(h, 'phoenixRite') && !h.phoenix) { h.phoenix = true; h.hp = h.s.maxHp * 0.5; this.emit('mech', -1, i, 0, 1, { name: 'Phoenix Rite' }); return; }
      Object.assign(h, { dead: true, hp: 0, hots: [], absorb: 0 });
      this.report[i].deaths++;
      let pulled = false;
      if (h.role !== 'tank') for (const e of Object.values(this.e)) if (e.hp > 0 && this.enemyTarget(e.id) === i && e.kind === 'boss' && this.h.some((x) => x.role === 'tank' && !x.dead)) pulled = true;
      this.lastDeath.push({ i, role: h.role, what, t: this.t, clear: this.clear, pulled, phase: this.phase });
      this.emit('death', -1, i, 0, 0, { what });
    }
    tickHots() {
      this.h.forEach((x, w) => {
        if (x.dead) return;
        if (x.curse && x.curse.until > this.t) { x.hp -= x.curse.dps; this.report[w].taken += x.curse.dps; if (x.hp <= 0) this.onLethal(w, 'Smouldering Curse'); }
        x.hots = x.hots.filter((o) => o.until > this.t);
        for (const o of x.hots.slice()) if (o.tick > 0 && !this.h[o.src].dead) this.heal(o.src, w, o.tick, false);
      });
    }
    tickDots() {
      for (const e of Object.values(this.e)) {
        if (e.hp <= 0) continue;
        for (const [k, d] of Object.entries(e.dots)) {
          if (d.until < this.t) { delete e.dots[k]; continue; }
          const src = d.src ?? +k;
          e.hp -= d.tick; this.report[src].damage += d.tick; e.threat[src] = (e.threat[src] || 0) + d.tick;
          this.emit('hit', src, e.id, Math.round(d.tick), 16);
        }
      }
    }
    enemyTarget(eid) {
      const e = this.e[eid];
      if (e.taunt !== null && e.tauntUntil > this.t && !this.h[e.taunt].dead) return e.taunt;
      let best = null, top = -1;
      for (const [i, v] of Object.entries(e.threat)) if (!this.h[i].dead && v > top) { top = v; best = +i; }
      return best;
    }
    closeToPulling(i, eid) { const e = this.e[eid], mine = e.threat[i] || 0; for (const x of this.h) if (x.role === 'tank' && !x.dead) return mine > 0.9 * (e.threat[x.i] || 0); return false; }
    aliveEnemies() { return Object.values(this.e).filter((e) => e.hp > 0).map((e) => e.id); }
    aliveHeroes() { return this.h.filter((h) => !h.dead).map((h) => h.i); }
    lowestAlly() { let best = null; for (const h of this.h) if (!h.dead && (best === null || h.hp / h.s.maxHp < this.h[best].hp / this.h[best].s.maxHp)) best = h.i; return best; }
    emit(type, src, dst, amount, flags, extra = null) { const row = [Math.round(this.t * 10), type, src, dst, amount, flags]; if (extra) row.push(extra); this.ev.push(row); }
    explain() {
      const w = this.wipe, clock = Math.floor(w.t / 60) + ':' + String(Math.floor(w.t) % 60).padStart(2, '0');
      const where = (c) => (D.DUNGEON[c][0] === 'boss' ? 'the ' + D.DUNGEON[c][1] : 'a ' + D.DUNGEON[c][1].toLowerCase() + ' in wing ' + (D.DUNGEON[c][2] + 1));
      const at = where(w.clear) + ' at ' + clock, name = (i) => this.h[i].name;
      if (w.timeout) return 'The fight against ' + at + " ran too long: the group couldn't finish it.";
      if (w.enraged) return 'The ' + D.DUNGEON[w.clear][1] + ' enraged at ' + clock + ": the group's damage was too low to kill it in time.";
      for (const [i, o] of Object.entries(this.oomAt)) if (this.h[i].role === 'healer' && o.clear === w.clear) return name(i) + ' ran out of mana against ' + where(o.clear) + ': more Wisdom or a mana affix would keep the heals going.';
      for (const d of this.lastDeath) {
        if (d.clear !== w.clear) continue;
        if (d.pulled) return name(d.i) + ' pulled threat from the tank and died to ' + d.what + ' against ' + at + '.';
        if (d.role === 'tank') return name(d.i) + ' (tank) died to ' + d.what + ' against ' + at + ': more Vitality, Guard or a wall before the big hits.';
        if (d.role === 'healer') return name(d.i) + ' (healer) died to ' + d.what + ' against ' + at + ', and nobody could keep the group up after that.';
      }
      const d = this.lastDeath[0];
      return d ? name(d.i) + ' died first, to ' + d.what + ', and the group fell apart against ' + at + '.' : 'The group wiped against ' + at + '.';
    }
  }
  E.Simulator = Simulator;
})();
