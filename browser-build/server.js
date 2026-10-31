// The Symfony API (src/Service/*.php and src/Controller/*.php) ported to run inside the page, so the proof of
// concept plays without a server. The client calls IT_SERVER.handle() instead of fetch(); the world is kept in
// localStorage. Demo heroes are seeded the same way app:demo:seed does it.
(function () {
  'use strict';
  const D = window.IT_DATA, C = D.C, E = window.IT_ENGINE;
  const { Rules: R, Items: I, Stats: S, Combatants: Cb, Talents: T, Heritage: H, TreeMap: TM, Simulator, Rng, Dungeons: Dg, Legends: LG, Modes: Md } = E;
  const BATTLE_SECONDS = 150, CHEST_SECONDS = 90, OFFLINE_CAP = 43200, MAX_CATCH_UP = 12, PARTY_SIZE = 5, GUILD_MAX = 100, MAX_TEMPER = 15;
  const BOSS_DROP = [0.35, 0.45, 0.6];
  const KEY = 'idleteams-play-v1';
  const keys = Object.keys, sum = (a) => a.reduce((x, y) => x + y, 0);
  const time = () => Math.floor(Date.now() / 1000);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const uniq = (a) => [...new Set(a)];
  const clone = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
  const round1 = (x) => Math.round(x * 10) / 10;
  class GameError extends Error { constructor(m, status = 400) { super(m); this.status = status; } }
  const fail = (m) => { throw new GameError(m); };

  // ------------------------------------------------------------------ storage

  let db = null;
  const fresh = () => ({ seq: {}, users: [], heroes: [], items: [], parties: [], requests: [], posts: [], guilds: [], battles: [], chat: [], me: null });
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) { db = JSON.parse(raw); migrate(); return; } } catch (e) { /* storage blocked: play in memory */ }
    db = fresh(); seed(); save();
  }
  /** Saves from before talents and Heritage get the new fields; saves from the small trees get their points back. */
  function migrate() {
    for (const h of db.heroes) {
      h.talents = TM.clean(T.tree(h.cls), h.talents); h.heritage = TM.clean(H.tree(h.race), h.heritage); h.culture = h.culture || null; h.renown = h.renown || 0; h.backstory = h.backstory || null; h.story = h.story && h.story.answers ? h.story : null;
      if (!keys(h.talents).length) { const avail = Cb.available(h.cls, h.level, h.path); h.loadout = (h.loadout || []).filter((id) => avail[id]); }
    }
  }
  function save() {
    // Keep the save small: recent chat and finished battles only.
    for (const ch of uniq(db.chat.map((m) => m.channel))) { const list = db.chat.filter((m) => m.channel === ch); if (list.length > 120) { const drop = new Set(list.slice(0, list.length - 120)); db.chat = db.chat.filter((m) => !drop.has(m)); } }
    const done = db.battles.filter((b) => b.state === 'done'); if (done.length > 10) { const drop = new Set(done.slice(0, done.length - 10)); db.battles = db.battles.filter((b) => !drop.has(b)); }
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* memory only */ }
  }
  const ins = (t, o) => { o.id = db.seq[t] = (db.seq[t] || 0) + 1; db[t].push(o); return o; };
  const del = (t, o) => { const i = db[t].indexOf(o); if (i >= 0) db[t].splice(i, 1); };
  const find = (t, id) => db[t].find((x) => x.id === +id) || null;
  const must = (t, id) => find(t, id) || fail('Not found.');
  const userOf = (h) => find('users', h.user);
  const isDemo = (h) => !!userOf(h).demo;
  const members = (p) => db.heroes.filter((h) => h.party === p.id);
  const partyOf = (h) => (h.party ? find('parties', h.party) : null);
  const guildOf = (h) => (h.guild ? find('guilds', h.guild) : null);
  const guildMembers = (g) => db.heroes.filter((h) => h.guild === g.id);
  const role = (h) => R.role(h.cls);
  const totalPoints = (h) => (h.level - 1) * C.POINTS_PER_LEVEL;
  const unspent = (h) => totalPoints(h) - sum(Object.values(h.spent));
  const talentPoints = (h) => T.points(h.level) - sum(Object.values(h.talents));
  const heritageRank = (h) => H.rank(h.renown);
  const heritagePoints = (h) => H.points(heritageRank(h)) - sum(Object.values(h.heritage));
  const talentResetCost = (h) => 25 * h.level;
  const skillPoints = (h) => h.level - 1 - sum(Object.values(h.skillRanks).map((r) => Math.max(0, r - 1)));
  const heroChannel = (h) => (h.guild ? 'guild:' + h.guild : 'tavern');
  const itemRecord = (spec) => Object.assign(clone(I.fromSpec(spec)), { createdAt: time() });

  // ------------------------------------------------------------------ Game

  const equipped = (h) => db.items.filter((i) => i.owner === h.id && i.equipped);
  const build = (h) => ({ race: h.race, cls: h.cls, origin: h.origin, level: h.level, spent: h.spent, path: h.path, legend: h.legend || null, keystones: h.keystones, talents: h.talents, heritage: h.heritage, culture: h.culture, backstory: h.backstory, story: h.story, items: equipped(h).map(I.spec) });
  function loadout(h) {
    const avail = Cb.available(h.cls, h.level, h.path, h.talents);
    const ids = h.loadout.filter((id) => avail[id]);
    return ids.length ? ids : Cb.defaultLoadout(h.cls, h.level, h.path, h.talents);
  }
  const combatant = (h) => {
    const c = Cb.make(build(h), h.id, h.name, loadout(h), h.skillRanks);
    if (h.signature) c.signature = { id: h.signature, name: h.signatureName || null, mastery: R.signatureMastery(h.signatureXp || 0) };
    return c;
  };

  function progress(p, now = time()) {
    for (let n = 0; n < MAX_CATCH_UP; ++n) {
      const running = db.battles.find((b) => b.party === p.id && b.state === 'running');
      if (running && running.endsAt <= now) {
        finish(running);
        const next = running.endsAt;
        if (canStart(p) && withinOfflineCap(p, next)) start(p, next);
        continue;
      }
      if (!running && canStart(p) && withinOfflineCap(p, now)) start(p, now);
      break;
    }
    for (const b of db.battles.filter((x) => x.party === p.id && x.state === 'chest')) settleChest(b, now);
  }
  const canStart = (p) => p.running && members(p).length === PARTY_SIZE;
  function withinOfflineCap(p, at) {
    let last = 0;
    for (const m of members(p)) { const u = userOf(m); last = Math.max(last, u.demo ? 0 : u.lastSeenAt); }
    return at < last + OFFLINE_CAP;
  }
  function medianLevel(p) {
    const levels = members(p).map((h) => h.level).sort((a, b) => a - b);
    return levels.length ? levels[Math.floor(levels.length / 2)] : 1;
  }
  // Level bands: a group may run every dungeon whose band starts at or below its median level.
  const unlocked = (level) => Object.values(D.DUNGEONS).filter((d) => d.levels[0] <= Math.max(1, level));
  const newest = (level) => { const open = unlocked(level); return open[open.length - 1] || Dg.get(null); };
  function dungeonFor(p) {
    const open = unlocked(medianLevel(p));
    return open.find((d) => d.id === p.dungeon) || open[open.length - 1] || Dg.get(null);
  }
  const clampLevel = (d, level) => Math.max(d.levels[0], d.levels[1] > 0 ? Math.min(d.levels[1], level) : level);
  function dungeonLevel(p) {
    return Md.level(dungeonFor(p), Math.max(1, medianLevel(p) + p.dungeonOffset), modeFor(p)[0]);
  }
  // [mode, tier] the next run uses: the leader's pick while the group qualifies for it, else normal.
  function modeFor(p) {
    const median = medianLevel(p);
    if (p.difficulty === 'mythic' && Md.mythicOpen(median)) return ['mythic', Math.max(1, Math.min(p.mythicTier || 1, (p.mythicBest || 0) + 1))];
    if (p.difficulty === 'heroic' && Md.heroicOpen(dungeonFor(p), median)) return ['heroic', 0];
    return ['normal', 0];
  }
  function start(p, at) {
    const [mode, tier] = modeFor(p), affixes = Md.affixes(mode, tier, Md.week(at));
    const b = { party: p.id, state: 'running', seed: rnd(1, 2000000000), dungeonLevel: dungeonLevel(p), dungeon: dungeonFor(p).id, mode, tier, affixes, startedAt: at, endsAt: at + BATTLE_SECONDS, chestClosesAt: 0, roster: [], timeline: null, report: {}, chest: [] };
    const order = ['tank', 'healer', 'dps'];
    const heroes = members(p).sort((a, c) => order.indexOf(role(a)) - order.indexOf(role(c)) || a.id - c.id);
    const combatants = heroes.map(combatant);
    // Heroes above the dungeon's level band are scaled down to it.
    combatants.forEach((c, k) => {
      if (c.level > b.dungeonLevel + 5) c.stats = Cb.make(Object.assign(build(heroes[k]), { level: b.dungeonLevel + 5 }), c.id, c.name, c.loadout, c.ranks).stats;
    });
    const result = new Simulator().run(combatants, b.dungeonLevel, b.seed, Dg.get(b.dungeon), Md.mods(mode, tier, affixes));
    b.timeline = result.timeline;
    b.report = Object.assign(result.report, { mode, tier });
    b.roster = heroes.map((h, k) => ({ id: h.id, name: h.name, cls: h.cls, race: h.race, level: h.level, role: role(h), look: look(h), resource: combatants[k].stats.resource, maxHp: Math.trunc(combatants[k].stats.maxHp) }));
    return ins('battles', b);
  }
  function look(h) {
    const out = Object.assign({ race: h.race, hat: 'none', top: 'tunic', bottom: 'pants', shoes: 'boots', gloves: 'none', cape: 'none', weapon: 'sword', offhand: 'none' }, h.look);
    out.race = h.race;
    let hasWeapon = false;
    const tint = {};
    for (const i of equipped(h)) {
      const layer = (D.SLOTS[i.equipped] || [])[1];
      if (layer) { out[layer] = i.base; const t = I.tint(I.spec(i)); if (t) tint[layer] = t; hasWeapon = hasWeapon || layer === 'weapon'; }
    }
    if (!hasWeapon) out.weapon = D.CLASSES[h.cls].kit.weapon;
    // The wardrobe: a chosen look shows instead of what is worn, and head and back can be hidden.
    for (const [slot, key] of Object.entries(h.outfit || {})) {
      const layer = (D.SLOTS[slot] || [])[1];
      if (!layer) continue;
      if (key === 'hidden') { out[layer] = 'none'; delete tint[layer]; }
      else if ((h.wardrobe || []).includes(key)) { const [, base, d1, d2, m] = key.split('|'); out[layer] = base; if (d1) tint[layer] = [d1, d2, m]; else delete tint[layer]; }
    }
    out.tint = tint;
    return out;
  }
  function collectLook(h, i) {
    if (!(D.SLOTS[i.slot] || [])[1]) return;
    const key = I.lookKey(I.spec(i));
    if (!(h.wardrobe || []).includes(key)) h.wardrobe = [...(h.wardrobe || []), key];
  }
  function wardrobeView(h) {
    const out = {};
    for (const key of h.wardrobe || []) { const [slot, base, d1, d2, m] = key.split('|'); (out[slot] = out[slot] || []).push({ key, base, name: (D.BASES[slot] || {})[base] || base, tint: d1 ? [d1, d2, m] : null }); }
    return out;
  }
  function dye(h, i, d) {
    if (!(D.SLOTS[i.slot] || [])[1]) fail('Only things you can see can be dyed.');
    if (d) {
      d = [].concat(d);
      if (d.length !== 3 || !D.DYES.includes(d[0]) || !D.DYES.includes(d[1]) || !D.METALS.includes(d[2])) fail('Pick two dyes and a metal from the dye table.');
      if (h.materials < D.DYE_COST) fail('Dyeing costs ' + D.DYE_COST + ' materials.');
      h.materials -= D.DYE_COST;
    }
    i.dye = d || null;
    collectLook(h, i);
  }
  function setOutfit(h, slot, key) {
    if (!(D.SLOTS[slot] || [])[1]) fail('That slot has no look.');
    const out = Object.assign({}, h.outfit || {});
    if (!key) delete out[slot];
    else if (key === 'hidden') { if (!['head', 'cape'].includes(slot)) fail('Only the head and back can be hidden.'); out[slot] = 'hidden'; }
    else { if (!(h.wardrobe || []).includes(key) || key.split('|')[0] !== slot) fail('That look is not in your wardrobe for this slot.'); out[slot] = key; }
    h.outfit = out;
  }

  function finish(b) {
    const rep = b.report, dl = b.dungeonLevel, r = new Rng(b.seed ^ 0x5bd1e995), p = find('parties', b.party);
    const heroes = b.roster.map((row) => find('heroes', row.id)).filter(Boolean);
    // Rewards follow how far the group got: packs count 1, bosses 2, 3 and 4. A full run is 15.
    const dungeon = Dg.get(b.dungeon), plan = dungeon.plan, done = rep.encountersDone, bossCount = Dg.bossCount(dungeon);
    const mode = b.mode || 'normal', tier = b.tier || 0, reward = Md.reward(mode, tier);
    const title = dungeon.name + (Md.label(mode, tier) ? ' (' + Md.label(mode, tier) + ')' : '');
    let units = 0;
    plan.forEach(([kind], n) => {
      const w = kind === 'boss' ? 1 + plan.slice(0, n + 1).filter((x) => x[0] === 'boss').length : 1;
      if (n < done) units += w; else if (n === done && rep.wiped) units += w / 2;
    });
    units *= reward.units;
    const keenEye = heroes.some((h) => h.cls === 'rogue');
    const group = heroes.map((h) => ({ race: h.race, real: !(userOf(h) || {}).demo }));
    const newcomers = heroes.filter((h) => isNewcomer(h, b.endsAt)).length;
    heroes.forEach((h, k) => {
      const stats = S.derive(build(h)), row = rep.heroes[k] || {};
      const xp = Math.round(10.5 * dl ** 1.5 * units * (h.race === 'human' ? 1.05 : 1) * (1 + 0.01 * Math.min(10, p.battlesTogether)) * (1 + stats.xpBonus));
      // Heritage: Renown for running with your own race, twice for your own culture.
      const kin = H.kin(h.race, h.culture, heroes.filter((o) => o !== h).map((o) => [o.race, o.culture, o.backstory]), h.backstory);
      const renown = H.renownGain(units, kin, stats.renownBonus), rankBefore = heritageRank(h);
      h.renown += renown;
      if (heritageRank(h) > rankBefore) post(heroChannel(h), h.name + "'s " + D.RACES[h.race].name + ' Heritage reached rank ' + heritageRank(h) + '.', { type: 'hero', hero: h.id });
      Object.assign(row, { renown, kin });
      let gold = Math.round(5 * 1.045 ** (2 * dl) * units * stats.fortune);
      let mats = Math.round((3 + 0.5 * units) * (1 + dl / 10) * stats.fortune);
      // Mentors: veterans running with a new hero earn a bit more of everything.
      const mentor = newcomers > 0 && h.level >= C.MENTOR_LEVEL && !isNewcomer(h, b.endsAt);
      if (mentor) { gold = Math.round(gold * (1 + C.MENTOR_BONUS)); mats = Math.round(mats * (1 + C.MENTOR_BONUS)); row.mentor = true; }
      h.gold += gold; h.materials += mats;
      const c = Object.assign({ battles: 0, dungeons: 0, bossKills: 0, deaths: 0 }, h.career);
      c.battles++; c.dungeons += rep.wiped ? 0 : 1; c.bossKills += rep.bossesKilled; c.deaths += row.deaths || 0;
      if (mentor) c.mentored = (c.mentored || 0) + 1;
      if (!rep.wiped) {
        c.cleared = uniq([...(c.cleared || []), dungeon.id]);
        if (mode === 'heroic') c.heroic = uniq([...(c.heroic || []), dungeon.id]);
        if (mode === 'mythic') c.mythicBest = Math.max(c.mythicBest || 0, tier);
      }
      h.career = c;
      Object.assign(row, { xp, gold, materials: mats });
      for (const w of equipped(h)) collectLook(h, w);
      addXp(h, xp);
      if (h.signature && row.sigXp > 0) {
        const before = R.signatureMastery(h.signatureXp || 0);
        h.signatureXp = (h.signatureXp || 0) + row.sigXp;
        const now = R.signatureMastery(h.signatureXp);
        if (Math.floor(now / 10) > Math.floor(before / 10)) post(heroChannel(h), h.name + "'s " + (h.signatureName || R.classSkills(h.cls)[h.signature][0]) + ' reached Mastery ' + now + '.', { type: 'hero', hero: h.id });
      }
      const newMarks = earnMarks(h, k, rep, group, dungeon.id);
      const g = guildOf(h);
      if (g) { g.xp += Math.round(units); guildProgress(h, GH.gains(rep, mode, tier, heroes.filter((o) => o.guild === h.guild).length, newMarks), b.endsAt); }
    });
    p.battlesTogether++;

    // The group chest: each boss may drop an item, the later ones more often. Never guaranteed.
    const chest = [];
    plan.filter((x) => x[0] === 'boss').slice(0, rep.bossesKilled).forEach(([, bossId], n) => {
      const boss = dungeon.bosses[bossId].name;
      if (r.getFloat(0, 1) < BOSS_DROP[n === bossCount - 1 ? 2 : Math.min(n, 1)] + reward.drop) chest.push({ spec: I.generate(r, 2 * dl + reward.ilvl, I.rollRarity(r, (keenEye ? 0.08 : 0) + reward.luck)), rolls: {}, winner: null, from: boss });
      if (dl >= 15 && r.getFloat(0, 1) < 0.2) chest.push({ spec: I.glyph(r, 2 * dl + reward.ilvl), rolls: {}, winner: null, from: boss });
    });
    b.chest = chest; b.report = rep; b.state = 'chest'; b.chestClosesAt = b.endsAt + CHEST_SECONDS; b.timeline = null;
    const loot = chest.length ? ' The chest holds ' + chest.length + ' item' + (chest.length === 1 ? '' : 's') + '.' : ' No loot this time, only materials.';
    let line = rep.wiped ? title + ': the group fell after ' + rep.bossesKilled + ' of ' + bossCount + ' bosses. ' + rep.cause + loot : title + ' cleared!' + loot;
    if (mode === 'mythic' && !rep.wiped) {
      // The ladder: a clear opens the next tier and the group moves up to it.
      const best = p.mythicBest || 0;
      p.mythicBest = Math.max(best, tier); p.mythicTier = Math.min(tier + 1, p.mythicBest + 1);
      for (const h of heroes) {
        const g = guildOf(h);
        if (g && ((g.trophies || {}).bestMythic || [0])[0] < tier) g.trophies = Object.assign({ heroic: 0, bosses: 0, goals: 0 }, g.trophies, { bestMythic: [tier, dungeon.name, heroes.filter((o) => o.guild === h.guild).map((o) => o.name)] });
      }
      line += ' Next: Mythic ' + p.mythicTier + '.';
      if (p.mythicBest > best && p.mythicBest % 5 === 0) {
        const byGuild = {};
        for (const h of heroes) if (h.guild) (byGuild[h.guild] = byGuild[h.guild] || []).push(h.name);
        for (const [gid, names] of Object.entries(byGuild)) post('guild:' + gid, names.join(', ') + ' cleared ' + dungeon.name + ' on Mythic ' + tier + '.');
      }
    }
    // A wipe stops the chain: the group rests until someone comes back, changes what they need and sends it in.
    if (rep.wiped) { p.running = false; line += ' The group rests until someone sends it back in.'; }
    post('party:' + p.id, line, { type: 'report', battle: b.id });
    for (const h of heroes) if (isDemo(h)) chest.forEach((_, idx) => autoRoll(b, h, idx));
  }
  function addXp(h, xp) {
    let total = h.xp + xp;
    while (total >= R.xpForLevel(h.level)) {
      total -= R.xpForLevel(h.level);
      ++h.level;
      if (h.level === C.OATH_LEVEL && !h.oathTaken) takeOath(h);
      if ([C.PATH_LEVEL, 50, 100].includes(h.level) || h.level % 25 === 0) post(heroChannel(h), h.name + ' reached level ' + h.level + '.', { type: 'hero', hero: h.id });
    }
    h.xp = total;
  }
  function takeOath(h) {
    h.oathTaken = true; h.carved = clone(h.spent); h.marks = uniq([...h.marks, 'oathsworn']);
    const what = h.path ? D.CLASSES[h.cls].paths[h.path][0] : 'their Path';
    post(heroChannel(h), 'Oath Day: ' + h.name + ' swore to ' + what + '.', { type: 'hero', hero: h.id });
  }
  // ------------------------------------------------------------------ guild hall (src/Game/GuildHall.php, GuildActions.php)
  const GH = {
    ROOMS: [[1, 'hall', 'Great hall', 'The roster, the guild channel and the bank.'], [2, 'notice', 'Notice board', 'The leader and officers pin a notice every member sees.'], [3, 'trophies', 'Trophy wall', "The guild's records: its best Mythic, its Heroic clears and its boss count."], [4, 'vault', 'Deep vault', 'The bank grows by 10 slots at every guild level from here.'], [6, 'banners', 'Banner hall', "The guild tag shows beside members' names in chat."], [8, 'gallery', 'Mythic gallery', "Every member's best Mythic tier, ranked."]],
    MEMBER_WITHDRAWALS: 2, LOG_SIZE: 30,
    GOALS: { clears: ['Clear {n} dungeons', 3, 10], bosses: ['Defeat {n} bosses', 8, 25], heroic: ['Clear {n} Heroic or Mythic runs', 1, 3], mythic: ['Clear {n} Mythic tiers (a tier 4 clear counts 4)', 2, 6], together: ['Run {n} times with three or more guildmates in the group', 1, 3], marks: ['Earn {n} Marks', 1, 4] },
    opened: (level) => GH.ROOMS.filter((r) => r[0] <= level).map((r) => r[1]),
    bankSize: (level) => Math.min(100, 20 + 10 * Math.max(0, level - 3)),
    goals(week, gid, n) {
      const r = new Rng(week * 7919 + gid), ids = keys(GH.GOALS);
      for (let i = ids.length - 1; i > 0; i--) { const j = r.getInt(0, i); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      return ids.slice(0, 3).sort().map((id) => ({ id, target: Math.max(GH.GOALS[id][2], GH.GOALS[id][1] * n), progress: 0, done: false }));
    },
    label: (g) => GH.GOALS[g.id][0].replace('{n}', g.target),
    reward: (level) => ({ gold: Math.round(40 * 1.045 ** (2 * level)), materials: 20 + level, guildXp: 60 }),
    gains: (rep, mode, tier, mates, marks) => ({ clears: rep.wiped ? 0 : 1, bosses: rep.bossesKilled, heroic: !rep.wiped && mode !== 'normal' ? 1 : 0, mythic: !rep.wiped && mode === 'mythic' ? tier : 0, together: mates >= 3 ? 1 : 0, marks }),
  };
  function guildWeek(g, now = time()) {
    const week = Md.week(now);
    if (g.week !== week || !g.goals) { g.week = week; g.goals = GH.goals(week, g.id, Math.max(1, guildMembers(g).length)); g.helpers = {}; }
  }
  function guildProgress(h, gains, at) {
    const g = guildOf(h); guildWeek(g, at);
    const t = Object.assign({ heroic: 0, bosses: 0, goals: 0, bestMythic: null }, g.trophies);
    t.heroic += gains.heroic; t.bosses += gains.bosses;
    for (const goal of g.goals) {
      const add = gains[goal.id] || 0;
      if (goal.done || add <= 0) continue;
      goal.progress = Math.min(goal.target, goal.progress + add);
      g.helpers[h.id] = (g.helpers[h.id] || 0) + add;
      if (goal.progress >= goal.target) {
        goal.done = true; t.goals++; g.xp += GH.reward(1).guildXp;
        const paid = guildMembers(g).filter((m) => g.helpers[m.id]);
        for (const m of paid) { const pay = GH.reward(m.level); m.gold += pay.gold; m.materials += pay.materials; }
        post('guild:' + g.id, 'Weekly goal done: ' + GH.label(goal) + '. ' + paid.length + ' helped and were paid.');
      }
    }
    g.trophies = t;
  }
  function guildLog(g, h, what, detail) { g.bankLog = [[time(), h.name, h.id, what, detail], ...(g.bankLog || [])].slice(0, GH.LOG_SIZE); }
  const takenToday = (g, h) => (g.bankLog || []).filter((e) => e[0] >= time() - 86400 && e[2] === h.id && e[3] === 'out').length;
  function guildBank(h, action, b) {
    const g = guildOf(h) || fail('You are not in a guild.'), officer = h.guildRank !== 'member';
    if (action === 'deposit') {
      const i = must('items', b.id);
      if (i.owner !== h.id) fail('That is not yours.');
      if (db.items.filter((x) => x.bank === g.id).length >= GH.bankSize(guildLevel(g.xp))) fail("The bank is full. It grows with the guild's level.");
      Object.assign(i, { equipped: null, price: null, owner: null, bank: g.id }); guildLog(g, h, 'in', I.name(I.spec(i)));
    } else if (action === 'withdraw') {
      const i = must('items', b.id);
      if (i.bank !== g.id) fail("That is not in your guild's bank.");
      if (!officer && takenToday(g, h) >= GH.MEMBER_WITHDRAWALS) fail('Members may take ' + GH.MEMBER_WITHDRAWALS + ' items a day; officers and the leader have no limit.');
      Object.assign(i, { bank: null, owner: h.id }); guildLog(g, h, 'out', I.name(I.spec(i)));
    } else if (action === 'goldIn') {
      const gold = Math.trunc(+b.gold || 0);
      if (gold < 1 || h.gold < gold) fail('You do not have that much gold.');
      h.gold -= gold; g.bankGold = (g.bankGold || 0) + gold; guildLog(g, h, 'goldIn', String(gold));
    } else if (action === 'goldOut') {
      const gold = Math.trunc(+b.gold || 0);
      if (!officer) fail('Only the leader and officers can do that.');
      if (gold < 1 || (g.bankGold || 0) < gold) fail('The bank does not hold that much gold.');
      g.bankGold -= gold; h.gold += gold; guildLog(g, h, 'goldOut', String(gold));
    } else fail('Not found.');
  }
  function guildNotice(h, text) {
    const g = guildOf(h) || fail('You are not in a guild.');
    if (h.guildRank === 'member') fail('Only the leader and officers can do that.');
    if (!GH.opened(guildLevel(g.xp)).includes('notice')) fail('The notice board opens at guild level 2.');
    g.notice = String(text || '').trim().slice(0, 400);
  }
  function guildRank(leader, who, rank) {
    const g = guildOf(leader) || fail('You are not in a guild.');
    if (leader.guildRank !== 'leader') fail('Only the leader changes ranks.');
    if (who.guild !== g.id || who === leader) fail('Pick another member of your guild.');
    if (!['leader', 'officer', 'member'].includes(rank)) fail('Ranks are leader, officer and member.');
    who.guildRank = rank; if (rank === 'leader') leader.guildRank = 'officer';
    post('guild:' + g.id, who.name + ' is now ' + (rank === 'leader' ? 'the guild leader' : rank === 'officer' ? 'an officer' : 'a member') + '.');
  }

  function earnMarks(h, k, rep, group, dungeon) {
    const fresh = uniq(E.Marks.fromBattle({ level: h.level, career: h.career }, k, rep, group, dungeon, Object.keys(D.DUNGEONS))).filter((m) => !h.marks.includes(m));
    h.marks = [...h.marks, ...fresh];
    // New marks are shown off where the hero's people will see them: the guild, else the group.
    const channel = h.guild ? 'guild:' + h.guild : h.party ? 'party:' + h.party : null;
    if (channel && !(userOf(h) || {}).demo) for (const m of fresh) post(channel, h.name + ' earned the mark ' + (D.MARKS[m] || [m])[0] + '.', { type: 'mark', hero: h.id, mark: m });
    return fresh.length;
  }

  function roll(b, h, idx, choice) {
    if (b.state !== 'chest' || !b.chest[idx] || !['need', 'greed', 'pass'].includes(choice)) return;
    if (!b.roster.some((x) => x.id === h.id)) return;
    b.chest[idx].rolls[h.id] = choice;
    settleChest(b, time());
  }
  function autoRoll(b, h, idx) {
    const spec = b.chest[idx].spec;
    b.chest[idx].rolls[h.id] = h.lootPolicy === 'pass' ? 'pass' : h.lootPolicy === 'greed' ? 'greed' : isUpgrade(h, spec) ? 'need' : 'greed';
  }
  function isUpgrade(h, spec) {
    if (spec.slot === 'glyph') return true;
    const slots = spec.slot === 'ring1' ? ['ring1', 'ring2'] : [spec.slot];
    const worn = equipped(h).filter((i) => slots.includes(i.equipped));
    if (!worn.length || (spec.slot === 'ring1' && worn.length < 2)) return true;
    return S.itemScore(spec, h.cls) > Math.min(...worn.map((i) => S.itemScore(I.spec(i), h.cls)));
  }
  /** Hand out items once everyone has rolled, or when the chest closes (absent players roll by their loot policy). */
  function settleChest(b, now) {
    if (b.state !== 'chest') return;
    const ids = b.roster.map((x) => x.id), closing = now >= b.chestClosesAt;
    for (let idx = 0; idx < b.chest.length; idx++) {
      const entry = b.chest[idx];
      if (keys(entry.rolls).length >= ids.length) continue;
      if (!closing) return;
      for (const id of ids) { const h = find('heroes', id); if (entry.rolls[id] === undefined && h) autoRoll(b, h, idx); }
    }
    const r = new Rng(b.seed ^ 0x1234567);
    // Scarce-role bonus: these heroes roll twice on every item in this chest and keep the higher.
    const twice = ids.map((id) => find('heroes', id)).filter((h) => h && h.bonusRolls > 0);
    const twiceIds = new Set(twice.map((h) => String(h.id)));
    for (const entry of b.chest) {
      let best = null, rolls = {};
      for (const tier of ['need', 'greed']) {
        for (const [id, choice] of Object.entries(entry.rolls)) if (choice === tier) { rolls[id] = r.getInt(1, 100); if (twiceIds.has(String(id))) rolls[id] = Math.max(rolls[id], r.getInt(1, 100)); }
        if (keys(rolls).length) { let top = -1; for (const [id, n] of Object.entries(rolls)) if (n > top) { top = n; best = +id; } break; }
      }
      entry.numbers = rolls; entry.winner = best;
      const spec = entry.spec, winner = best ? find('heroes', best) : null;
      if (winner) {
        ins('items', Object.assign(itemRecord(spec), { owner: winner.id }));
        if (spec.power) {
          winner.codex = uniq([...winner.codex, spec.power]); winner.marks = uniq([...winner.marks, 'legendFound']);
          post(heroChannel(winner), winner.name + ' found a legendary: ' + I.name(spec) + '!', { type: 'item', spec });
        }
      } else {
        // Nobody wanted it: everyone gets a share of Essence instead.
        for (const id of ids) { const h = find('heroes', id); if (h) h.essence += Math.max(1, Math.floor(I.salvageValue(spec) / 2)); }
      }
    }
    if (b.chest.length) for (const h of twice) h.bonusRolls--;
    b.state = 'done';
  }
  function post(channel, body, card = null, author = null) {
    return ins('chat', { channel, body: String(body).slice(0, 500), card, author: author ? author.id : null, createdAt: time() });
  }

  // ------------------------------------------------------------------ Present

  function config() {
    const classes = {};
    for (const [id, c] of Object.entries(D.CLASSES)) classes[id] = Object.assign({}, c, { allSkills: R.classSkills(id) });
    return {
      attributes: D.ATTRIBUTES, races: D.RACES, origins: D.ORIGINS, originPoints: C.ORIGIN_POINTS, classes, keystones: D.KEYSTONES, slots: D.SLOTS, bases: D.BASES, art: D.ART,
      rarities: D.RARITIES, glyphs: D.GLYPHS, powers: D.POWERS, caps: D.CAPS, pointsPerLevel: C.POINTS_PER_LEVEL, softCapShare: C.SOFT_CAP_SHARE, oathLevel: C.OATH_LEVEL,
      pathLevel: C.PATH_LEVEL, keystoneLevels: C.KEYSTONE_LEVELS, ultimateLevel: C.ULTIMATE_LEVEL, signatureLevel: C.SIGNATURE_LEVEL, signatureTraits: C.SIGNATURE_TRAITS, legendLevel: C.LEGEND_LEVEL, scarceRolls: C.SCARCE_ROLLS, dyes: D.DYES, metals: D.METALS, dyeCost: D.DYE_COST, mentorLevel: C.MENTOR_LEVEL, mentorBonus: C.MENTOR_BONUS, reforgeLevel: C.REFORGE_LEVEL, loadoutSize: C.LOADOUT_SIZE, maxSkillRank: D.MAX_RANK,
      dungeon: D.DUNGEON_VIEWS[D.DEFAULT_DUNGEON], dungeons: D.DUNGEON_VIEWS, battleSeconds: BATTLE_SECONDS, partySize: PARTY_SIZE, marks: D.MARKS,
      guildHall: { rooms: GH.ROOMS, memberWithdrawals: GH.MEMBER_WITHDRAWALS },
      modes: { affixes: D.MODE_AFFIXES, mythicLevel: Md.MYTHIC_LEVEL, secondAt: Md.SECOND_AT, weekly: Md.weekly(Md.week(time())) },
      cultures: Object.fromEntries(Object.entries(D.HERITAGE_TREES).map(([r, t]) => [r, Object.fromEntries(Object.entries(t.cultures).map(([c, x]) => [c, x[0]]))])),
      talentPointsPerLevel: D.TALENT.POINTS_PER_LEVEL, treeShape: { talent: D.TALENT.SHAPE, heritage: D.HERITAGE.SHAPE },
      cultureInfo: Object.fromEntries(Object.entries(D.HERITAGE_TREES).map(([r, t]) => [r, Object.fromEntries(Object.entries(t.cultures).map(([c, x]) => [c, [x[0], x[1]]]))])),
      lifeStory: { chapters: D.LIFE_STORY.CHAPTERS, questions: D.LIFE_STORY.QUESTIONS, scenes: D.LIFE_STORY.SCENES, tale: D.LIFE_STORY.TALE, notesMax: D.LIFE_STORY.NOTES_MAX, lean: [D.LIFE_STORY.LEAN_ATTRS, D.LIFE_STORY.LEAN_POINTS] },
      backstories: D.HERITAGE.BACKSTORY_INFO, backstoryNodes: D.HERITAGE.BACKSTORY_NODES, backstoryRenown: D.HERITAGE.BACKSTORY_RENOWN,
      renown: { alone: D.HERITAGE.RENOWN_ALONE, perKin: D.HERITAGE.RENOWN_PER_KIN, swapGold: D.HERITAGE.CULTURE_SWAP_GOLD },
    };
  }
  function heroCard(h) {
    const g = guildOf(h);
    return {
      id: h.id, name: h.name, race: h.race, culture: h.culture, backstory: h.backstory, heritageRank: heritageRank(h), cls: h.cls, origin: h.origin, path: h.path, legend: h.legend || null, title: (LG.get(h.path, h.legend) || [null])[0], newcomer: isNewcomer(h), role: role(h), level: h.level, look: look(h), marks: h.marks,
      guild: g ? { id: g.id, name: g.name, tag: g.tag } : null, party: h.party, keystones: h.keystones, codex: h.codex.length, demo: isDemo(h),
    };
  }
  function keystoneLevels(level) {
    const out = C.KEYSTONE_LEVELS.filter((l) => l <= level);
    for (let l = 75; l <= level; l += 25) out.push(l);
    return out;
  }
  function presentHero(h) {
    const b = build(h), attrs = S.attributes(b), stats = S.derive(b), L = h.level, curves = {};
    for (const [stat, attr] of Object.entries({ crit: 'precision', haste: 'swiftness', cdr: 'focus', dodge: 'agility', resist: 'resolve', mega: 'ferocity' })) curves[stat] = { attr, points: round1(attrs.total[attr]) };
    const avail = Cb.available(h.cls, L, h.path, h.talents), skills = [], teachers = {};
    for (const [nid, n] of Object.entries(T.tree(h.cls).nodes)) if (n.effect.grant) teachers[n.effect.grant] = nid;
    for (const [id, s] of Object.entries(R.classSkills(h.cls))) {
      skills.push({ id, name: s[0], level: s[1], type: s[2], mult: s[3], cost: s[4], cd: s[5], opts: s[6], source: s[7], rank: Math.max(1, h.skillRanks[id] || 1), talent: teachers[id] || null, talentName: teachers[id] ? T.tree(h.cls).nodes[teachers[id]].name : null, unlocked: s[7] === 'ultimate' ? L >= C.ULTIMATE_LEVEL : !!avail[id] });
    }
    const p = partyOf(h), rank = heritageRank(h), twists = {};
    const others = p ? members(p).filter((m) => m !== h).map((m) => [m.race, m.culture, m.backstory]) : [];
    for (const [a, [now, per]] of Object.entries(S.twists(h.cls, S.effective(attrs.total), L))) twists[a] = { per, now: D.TWISTS[h.cls][a].as ? per : T.describe(now) };
    return Object.assign(heroCard(h), {
      xp: h.xp, xpNext: R.xpForLevel(L), oathTaken: h.oathTaken,
      points: { total: totalPoints(h), unspent: unspent(h), spent: h.spent, carved: h.carved },
      attributes: attrs.total, sources: attrs.sources, effective: S.effective(attrs.total), stats, k: S.k(L), curves,
      skills, skillPoints: skillPoints(h), loadout: loadout(h), openKeystones: keystoneLevels(L).filter((kl) => h.keystones[kl] === undefined), signature: signatureView(h), legendForm: legendView(h), bonusRolls: h.bonusRolls || 0, wardrobe: wardrobeView(h), outfit: h.outfit || {}, prologue: !h.prologueDone && h.level <= 2 && !((h.career || {}).battles),
      codexPowers: h.codex, career: h.career, gold: h.gold, materials: h.materials, essence: h.essence, lootPolicy: h.lootPolicy,
      resonance: S.resonance(b.items), guildRank: h.guildRank,
      twists, talents: h.talents, talentPoints: { total: T.points(L), free: talentPoints(h) }, talentResetCost: talentResetCost(h), heritage: h.heritage,
      story: h.story || null, biography: h.story ? E.LifeStory.biography(h.race, h.name, h.story) : [],
      talentTotal: T.describe(T.total(T.tree(h.cls), h.talents), 1, h.cls), heritageTotal: T.describe(T.total(H.tree(h.race), h.heritage)), treeVersion: D.TALENT.VERSION,
      renown: { total: h.renown, rank, from: H.renownFor(rank), to: H.renownFor(rank + 1), free: heritagePoints(h), kin: H.kin(h.race, h.culture, others, h.backstory) },
    });
  }
  function presentItem(i, viewer = null) {
    const spec = I.spec(i), owner = i.owner ? find('heroes', i.owner) : null;
    const out = Object.assign({}, spec, { name: I.name(spec), tint: I.tint(spec), owner: owner ? { id: owner.id, name: owner.name } : null });
    if (viewer && i.slot !== 'glyph') {
      out.score = S.itemScore(spec, viewer.cls);
      out.base_stats = Object.fromEntries(Object.entries(S.itemBase(spec)).map(([k, v]) => [k, round1(v)]));
    }
    return out;
  }
  const inventory = (h) => db.items.filter((i) => i.owner === h.id).sort((a, b) => b.id - a.id).map((i) => presentItem(i, h));
  function presentParty(p, viewer) {
    if (!p) return null;
    const requests = db.requests.filter((r) => r.party === p.id).map(presentRequest);
    return {
      id: p.id, name: p.name, leader: p.leader, dungeonOffset: p.dungeonOffset, running: p.running, battlesTogether: p.battlesTogether, dungeonLevel: dungeonLevel(p),
      dungeon: dungeonFor(p).id, dungeonPick: p.dungeon || null, unlocked: unlocked(medianLevel(p)).map((d) => d.id),
      difficulty: p.difficulty || 'normal', mode: modeFor(p), mythicTier: p.mythicTier || 1, mythicBest: p.mythicBest || 0, heroicOpen: Md.heroicOpen(dungeonFor(p), medianLevel(p)), mythicOpen: Md.mythicOpen(medianLevel(p)),
      members: members(p).map(heroCard), requests: p.leader === viewer.id ? requests : requests.filter((r) => r.hero.id === viewer.id),
    };
  }
  function presentRequest(r) {
    const p = find('parties', r.party);
    return { id: r.id, kind: r.kind, message: r.message, party: { id: p.id, name: p.name, size: members(p).length }, hero: heroCard(find('heroes', r.hero)), createdAt: r.createdAt };
  }
  function presentPost(t) {
    const p = t.party ? find('parties', t.party) : null;
    return { id: t.id, kind: t.kind, text: t.text, roles: t.roles, createdAt: t.createdAt, author: heroCard(find('heroes', t.author)), party: p ? { id: p.id, name: p.name, members: members(p).map(heroCard) } : null };
  }
  const guildLevel = (xp) => 1 + Math.floor(Math.sqrt(xp / 20));
  function presentGuild(g, roster = false, viewer = null) {
    const ms = guildMembers(g), level = guildLevel(g.xp), out = { id: g.id, name: g.name, tag: g.tag, motto: g.motto, xp: g.xp, level, size: ms.length, max: GUILD_MAX, nextLevelXp: 20 * level ** 2 };
    if (roster) {
      out.members = ms.sort((a, b) => b.level - a.level).map((m) => Object.assign(heroCard(m), { rank: m.guildRank, lastSeen: isDemo(m) ? null : userOf(m).lastSeenAt, mythicBest: (m.career || {}).mythicBest || 0 }));
      guildWeek(g);
      const rooms = GH.opened(level);
      out.hall = {
        rooms, notice: rooms.includes('notice') ? g.notice || '' : null,
        bank: db.items.filter((i) => i.bank === g.id).sort((a, b) => b.id - a.id).map((i) => presentItem(i, viewer)), bankSize: GH.bankSize(level), bankGold: g.bankGold || 0,
        log: g.bankLog || [], taken: viewer ? takenToday(g, viewer) : 0,
        goals: g.goals.map((x) => Object.assign({}, x, { label: GH.label(x) })), helped: viewer ? (g.helpers || {})[viewer.id] || 0 : 0,
        reward: viewer ? GH.reward(viewer.level) : null, weekEnds: (Md.week(time()) + 1) * 604800 + 345600,
        trophies: rooms.includes('trophies') ? Object.assign({ heroic: 0, bosses: 0, goals: 0, bestMythic: null }, g.trophies) : null,
      };
    }
    return out;
  }
  // Inspect (Present::inspect): locked choices, carved attributes, key stats, gear, marks and career.
  function inspect(h) {
    const b = build(h), attrs = S.attributes(b), st = S.derive(b), skills = R.classSkills(h.cls), lf = LG.get(h.path, h.legend);
    return Object.assign(heroCard(h), {
      classPath: h.path ? D.CLASSES[h.cls].paths[h.path][0] : null, oathTaken: !!h.oathTaken,
      keystoneList: Object.entries(h.keystones || {}).map(([lvl, id]) => { const k = (D.KEYSTONES[role(h)] || {})[id] || [id, '']; return { level: +lvl, name: k[0], text: k[1] }; }),
      signature: h.signature ? { name: h.signatureName || skills[h.signature][0], skill: skills[h.signature][0], mastery: R.signatureMastery(h.signatureXp || 0) } : null,
      legendForm: lf ? { title: lf[0], capstone: lf[2], text: T.describe({ stat: lf[3] }) } : null,
      carved: h.carved || {}, spent: h.spent || {}, attributes: Object.fromEntries(Object.entries(attrs.total).map(([k, v]) => [k, round1(v)])),
      stats: { maxHp: Math.trunc(st.maxHp), power: Math.trunc(Math.max(st.might, st.arcana, st.spirit)), crit: st.crit, haste: st.haste, dodge: st.dodge, dr: st.dr, block: st.block },
      talentsTaken: sum(Object.values(h.talents || {})), career: h.career || {}, gear: equipped(h).map((i) => presentItem(i)),
      biography: h.story ? E.LifeStory.biography(h.race, h.name, h.story).slice(0, 2) : [],
    });
  }
  const heroChip = (h) => (h ? { id: h.id, name: h.name, level: h.level, cls: h.cls, title: (LG.get(h.path, h.legend) || [null])[0], look: look(h) } : null);
  function presentChat(m) {
    const a = m.author ? find('heroes', m.author) : null;
    let card = m.card;
    if (card && (card.type === 'hero' || card.type === 'mark') && card.hero) card = Object.assign({}, card, { chip: heroChip(find('heroes', card.hero)) });
    if (card && card.type === 'mark') card = Object.assign({}, card, { markName: (D.MARKS[card.mark] || [card.mark])[0], markText: (D.MARKS[card.mark] || ['', ''])[1] });
    if (card && card.type === 'item' && card.spec) card = Object.assign({}, card, { spec: Object.assign({}, card.spec, { tint: I.tint(card.spec) }) });
    return { id: m.id, channel: m.channel, body: m.body, card, at: m.createdAt, author: a ? { id: a.id, name: a.name, cls: a.cls, tag: a.guild && GH.opened(guildLevel((find('guilds', a.guild) || { xp: 0 }).xp)).includes('banners') ? find('guilds', a.guild).tag : null } : null };
  }
  function presentBattle(b, viewer, withTimeline) {
    const chest = b.chest.map((c, idx) => ({
      idx, item: Object.assign({}, c.spec, { name: I.name(c.spec), tint: I.tint(c.spec), score: viewer && c.spec.slot !== 'glyph' ? S.itemScore(c.spec, viewer.cls) : null }),
      upgrade: viewer ? isUpgrade(viewer, c.spec) : false, rolls: c.rolls, numbers: c.numbers || {}, winner: c.winner,
    }));
    return {
      id: b.id, state: b.state, dungeon: b.dungeon || D.DEFAULT_DUNGEON, dungeonLevel: b.dungeonLevel, mode: b.mode || 'normal', tier: b.tier || 0, affixes: b.affixes || [], startedAt: b.startedAt, endsAt: b.endsAt, chestClosesAt: b.chestClosesAt, roster: b.roster,
      report: b.state === 'running' ? null : b.report, timeline: withTimeline && b.state === 'running' ? b.timeline : null, chest: b.state === 'running' ? [] : chest,
    };
  }

  // ------------------------------------------------------------------ HeroActions

  const LOOK = ['skin', 'hair', 'hairColor', 'eyes', 'eyeColor', 'mouth', 'beard', 'acc', 'build', 'height', 'dye1', 'dye2', 'metal', 'feature'];
  function createHero(u, input) {
    if (db.heroes.some((h) => h.user === u.id)) fail('You already have a hero.');
    const name = String(input.name || '').trim();
    if (!/^[\p{L}][\p{L}' -]{2,19}$/u.test(name)) fail('Names are 3 to 20 letters (spaces, hyphens and apostrophes are fine).');
    if (db.heroes.some((h) => h.name === name)) fail('That name is taken.');
    for (const [k, list] of [['race', D.RACES], ['cls', D.CLASSES], ['origin', D.ORIGINS]]) if (!list[input[k]]) fail('Pick a ' + k + '.');
    let story;
    try { story = E.LifeStory.clean(input.race, input.story); } catch (e) { fail(e.message); }
    const lk = {};
    for (const k of LOOK) { const v = (input.look || {})[k]; if ((typeof v === 'string' && /^[#a-zA-Z0-9]{1,16}$/.test(v)) || typeof v === 'number') lk[k] = v; }
    for (const [k, v] of Object.entries({ skin: '#e2b394', hairColor: '#5a3a22', eyeColor: '#3a6ea5', dye1: '#2f6fd0', dye2: '#f1c40f', metal: '#b8c2cc' })) if (lk[k] === undefined) lk[k] = v;
    const h = ins('heroes', {
      user: u.id, name, race: input.race, cls: input.cls, origin: input.origin, path: null, oathTaken: false, look: lk, level: 1, xp: 0, spent: {}, carved: {}, skillRanks: {},
      loadout: [], keystones: {}, talents: {}, heritage: {}, culture: null, renown: 0, codex: [], marks: [], career: {}, gold: 0, materials: 0, essence: 0, lootPolicy: 'upgrades', party: null, guild: null, guildRank: 'member', createdAt: time(),
    });
    h.story = story;
    startBackstory(h, story.answers.youth);
    h.marks = ['storyteller'];
    // Starter kit: plain commons in the class's own style. Everything after this drops, gets crafted or traded.
    const c = D.CLASSES[h.cls], r = new Rng(E.crc(name));
    for (const [slot, base] of Object.entries(c.kit)) {
      if (base === 'none') continue;
      collectLook(h, ins('items', Object.assign(itemRecord(I.generate(r, 1, 'common', slot, base, keys(c.suggest))), { owner: h.id, equipped: slot })));
    }
    post('tavern', name + ' the ' + D.RACES[h.race].name + ' ' + c.name + ' arrived at the tavern.');
    return h;
  }
  function spend(h, delta) {
    const spent = Object.assign({}, h.spent);
    for (const [attr, n] of Object.entries(delta)) {
      if (!D.ATTRIBUTES[attr] || !Number.isInteger(n)) fail('Unknown attribute.');
      const v = (spent[attr] || 0) + n;
      if (v < (h.carved[attr] || 0)) fail(D.ATTRIBUTES[attr][0] + ' points spent before your Oath are carved in.');
      spent[attr] = v;
    }
    for (const a of keys(spent)) if (!spent[a]) delete spent[a];
    if (sum(Object.values(spent)) > totalPoints(h)) fail('Not enough unspent points.');
    h.spent = spent;
  }
  function choosePath(h, path) {
    if (h.level < C.PATH_LEVEL) fail('Paths open at level ' + C.PATH_LEVEL + '.');
    if (h.oathTaken) fail('Your Oath sealed your Path.');
    if (!D.CLASSES[h.cls].paths[path]) fail('Unknown Path.');
    h.path = path; h.loadout = Cb.defaultLoadout(h.cls, h.level, path, h.talents);
  }
  function signatureView(h) {
    if (!h.signature) return h.level >= C.SIGNATURE_LEVEL ? { open: true } : null;
    const m = R.signatureMastery(h.signatureXp || 0), base = R.classSkills(h.cls)[h.signature][0], tr = R.signatureTraits(m);
    return { open: false, skill: h.signature, skillName: base, name: h.signatureName || base, mastery: m, xp: h.signatureXp || 0, from: R.signatureXpFor(m), next: R.signatureXpFor(m + 1),
      traits: tr, power: Math.round(((1 + 0.01 * m) * 1.1 ** tr.potent - 1) * 1000) / 1000, inLoadout: [...loadout(h), D.CLASSES[h.cls].ultimate[0]].includes(h.signature) };
  }
  function chooseSignature(h, skill, name) {
    if (h.level < C.SIGNATURE_LEVEL) fail('The Signature skill opens at level ' + C.SIGNATURE_LEVEL + '.');
    if (h.signature) fail('Your Signature is chosen for good.');
    const avail = Cb.available(h.cls, h.level, h.path, h.talents), ult = D.CLASSES[h.cls].ultimate[0];
    if (!avail[skill] && skill !== ult) fail('Pick a skill you have.');
    name = String(name || '').replace(/\s+/g, ' ').trim();
    if (name && !/^\p{L}[\p{L}' -]{2,29}$/u.test(name)) fail('A Signature name is 3 to 30 letters, spaces or apostrophes.');
    h.signature = skill; h.signatureName = name || null; h.signatureXp = 0;
    h.marks = uniq([...h.marks, 'signature']);
    const base = R.classSkills(h.cls)[skill][0];
    post(heroChannel(h), h.name + ' made ' + base + " their Signature: " + h.name + "'s " + (name || base) + '.', { type: 'hero', hero: h.id });
  }
  // The prologue: four guides, the first wing, always a clear, no rewards (Prologue.php).
  function prologue(h) {
    const P = D.PROLOGUE, rl = role(h), dg = Object.assign({}, Dg.get(P.DUNGEON));
    dg.plan = dg.plan.slice(0, P.ENCOUNTERS);
    const me = Object.assign(combatant(h), { level: P.LEVEL });
    const seats = [{ c: me, look: look(h), role: rl, race: h.race, level: h.level }];
    let n = 0;
    for (const [seat, [name, race, cls, glook]] of Object.entries(P.GUIDES)) {
      if (seat === (rl === 'dps' ? 'dps3' : rl)) continue;
      const b = E.Reference.build(cls, P.LEVEL + 1); b.race = race;
      const kit = Object.fromEntries(Object.entries(D.CLASSES[cls].kit).filter(([, x]) => x !== 'none'));
      seats.push({ c: Cb.make(b, -(++n), name), look: Object.assign({}, glook, kit, { race, hat: 'none', gloves: 'none', cape: 'none', offhand: kit.offhand || 'none' }), role: D.CLASSES[cls].role, race, level: P.LEVEL + 1 });
    }
    const order = ['tank', 'healer', 'dps'];
    seats.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    let res;
    for (let seed = 1; seed <= 40; seed++) { res = new Simulator().run(seats.map((x) => x.c), 2, seed, dg); if (!res.report.wiped) break; }
    const now = time();
    return { current: { id: 'prologue', state: 'running', prologue: true, dungeon: P.DUNGEON, dungeonLevel: 2, startedAt: now, endsAt: now + P.SECONDS, chestClosesAt: null,
      roster: seats.map((x) => ({ id: x.c.id, name: x.c.name, cls: x.c.cls, race: x.race, level: x.level, role: x.role, look: x.look, resource: x.c.stats.resource, maxHp: Math.trunc(x.c.stats.maxHp) })),
      report: null, timeline: res.timeline, chest: [], plan: dg.plan } };
  }
  function legendView(h) {
    if (h.level < C.LEGEND_LEVEL || !h.path) return null;
    const view = (id, f) => ({ id, title: f[0], titled: LG.titled(h.name, h.path, id), flavour: f[1], capstone: f[2], capstoneText: T.describe({ stat: f[3] }),
      ultimate: f[4], ultimateText: T.describe({ skill: LG.effect(h.cls, h.path, id).skill }, 1, h.cls) });
    const f = LG.get(h.path, h.legend);
    if (f) return { open: false, form: view(h.legend, f) };
    return { open: true, forms: Object.entries(D.LEGENDS[h.path] || {}).map(([id, x]) => view(id, x)) };
  }
  function chooseLegend(h, form) {
    if (h.level < C.LEGEND_LEVEL) fail('Legend forms open at level ' + C.LEGEND_LEVEL + '.');
    if (h.legend) fail('Your Legend form is taken for good.');
    const f = LG.get(h.path, form);
    if (!f) fail('Pick one of the two forms of your Path.');
    h.legend = form;
    h.marks = uniq([...h.marks, 'legend']);
    post('tavern', h.name + ' has become a Legend: ' + LG.titled(h.name, h.path, form) + '. ' + f[1], { type: 'hero', hero: h.id });
  }
  function chooseKeystone(h, level, id) {
    if (!keystoneLevels(h.level).includes(level)) fail('That Keystone level is not open yet.');
    if (h.keystones[level] !== undefined) fail('That Keystone is already chosen.');
    if (!D.KEYSTONES[role(h)][id] || Object.values(h.keystones).includes(id)) fail('Pick a Keystone you do not have yet.');
    h.keystones = Object.assign({}, h.keystones, { [level]: id });
    if (keys(h.keystones).length === 1) post(heroChannel(h), h.name + ' chose the ' + D.KEYSTONES[role(h)][id][0] + ' Keystone.');
  }
  function rankUp(h, skill) {
    const all = R.classSkills(h.cls), s = all[skill];
    if (!s) fail('Unknown skill.');
    const taught = s[7] === 'talent' && !!T.grants(h.cls, h.talents)[skill];
    if (s[1] > h.level || (s[7] !== 'core' && s[7] !== 'ultimate' && s[7] !== h.path && !taught)) fail('You have not unlocked that skill.');
    if (skillPoints(h) < 1) fail('No skill points left. You get one per level.');
    const rank = Math.max(1, h.skillRanks[skill] || 1);
    if (rank >= D.MAX_RANK) fail('That skill is at its highest rank.');
    h.skillRanks = Object.assign({}, h.skillRanks, { [skill]: rank + 1 });
  }
  function resetRanks(h) {
    const cost = 10 * h.level;
    if (h.gold < cost) fail('Resetting skill ranks costs ' + cost + ' gold.');
    h.gold -= cost; h.skillRanks = {};
  }
  function setLoadout(h, ids) {
    const avail = Cb.available(h.cls, h.level, h.path, h.talents);
    ids = uniq(ids.filter((x) => typeof x === 'string'));
    if (ids.length > C.LOADOUT_SIZE) fail('Your loadout holds ' + C.LOADOUT_SIZE + ' skills.');
    for (const id of ids) if (!avail[id]) fail('You cannot slot that skill.');
    h.loadout = ids;
  }
  /** Learns class talents in order (a whole path at once): all of them or none. */
  function learnTalent(h, nodes) {
    const tree = T.tree(h.cls), t = Object.assign({}, h.talents);
    let free = talentPoints(h);
    if (!nodes.length) fail('Pick a talent.');
    for (const node of nodes) {
      const err = T.check(tree, t, node, free);
      if (err) fail(err === 'No points left.' ? 'Not enough talent points. You get two per level.' : err);
      t[node] = 1; --free;
    }
    h.talents = t;
    for (const node of nodes) { const n = tree.nodes[node]; if (n.kind === 'capstone' || n.kind === 'keystone') post(heroChannel(h), h.name + ' mastered ' + n.name + '.', { type: 'hero', hero: h.id }); }
  }
  function resetTalents(h) {
    const cost = talentResetCost(h);
    if (h.gold < cost) fail('Resetting talents costs ' + cost + ' gold.');
    h.gold -= cost; h.talents = {};
    const avail = Cb.available(h.cls, h.level, h.path);
    h.loadout = h.loadout.filter((id) => avail[id]);
  }
  /** A backstory sets the culture, a head start of Renown and the first nodes along its branch. */
  function startBackstory(h, id) {
    h.backstory = id;
    h.culture = H.backstories(h.race)[id][1];
    h.renown = Math.max(h.renown, D.HERITAGE.BACKSTORY_RENOWN);
    h.heritage = H.backstoryStart(h.race, id);
  }
  /** Heroes made before life stories write theirs once; nodes outside the culture that raised them and the trunk come back as points. */
  function writeStory(h, input) {
    if (h.story) fail('Your story is already written.');
    let story;
    try { story = E.LifeStory.clean(h.race, input); } catch (e) { fail(e.message); }
    const tree = H.tree(h.race), culture = story.answers.home;
    h.story = story;
    h.backstory = story.answers.youth;
    h.marks = uniq([...h.marks, 'storyteller']);
    h.culture = culture;
    h.renown += D.HERITAGE.BACKSTORY_RENOWN;
    h.heritage = Object.fromEntries(Object.entries(h.heritage).filter(([n]) => tree.nodes[n] && [null, culture].includes(tree.nodes[n].culture)));
    post(heroChannel(h), h.name + ' told the tavern their life story.', { type: 'hero', hero: h.id });
  }
  function chooseCulture(h, culture) {
    const tree = H.tree(h.race);
    if (!tree.cultures[culture]) fail('Unknown culture.');
    if ((h.heritage.root || 0) < 1) fail('Learn ' + tree.nodes.root.name + ' first.');
    if (h.culture === culture) return;
    if (h.culture !== null) {
      const cost = D.HERITAGE.CULTURE_SWAP_GOLD * h.level;
      if (h.gold < cost) fail('Following another culture costs ' + cost + ' gold.');
      h.gold -= cost;
      h.heritage = Object.fromEntries(Object.entries(h.heritage).filter(([id]) => tree.nodes[id].culture === null));
    }
    h.culture = culture;
    post(heroChannel(h), h.name + ' now follows the ways of ' + tree.cultures[culture][0] + '.', { type: 'hero', hero: h.id });
  }
  /** Learns Heritage nodes in order (a whole path at once): all of them or none. */
  function learnHeritage(h, nodes) {
    const tree = H.tree(h.race), t = Object.assign({}, h.heritage);
    let free = heritagePoints(h);
    if (!nodes.length) fail('Pick a node.');
    for (const node of nodes) {
      const err = T.check(tree, t, node, free, h.culture);
      if (err) fail(err === 'No points left.' ? 'Not enough Heritage points. Run dungeons with your own race to earn Renown.' : err);
      t[node] = 1; --free;
    }
    h.heritage = t;
  }
  function setLootPolicy(h, policy) {
    if (!['upgrades', 'greed', 'pass'].includes(policy)) fail('Unknown loot setting.');
    h.lootPolicy = policy;
  }
  function autoSpend(h) {
    let left = unspent(h);
    if (left <= 0) return;
    const w = D.CLASSES[h.cls].suggest, total = sum(Object.values(w)), spent = Object.assign({}, h.spent), target = sum(Object.values(spent)) + left;
    for (const [a, n] of Object.entries(w)) {
      const want = Math.floor((target * n) / total), add = Math.max(0, Math.min(left, want - (spent[a] || 0)));
      spent[a] = (spent[a] || 0) + add; left -= add;
    }
    const first = keys(w)[0]; spent[first] = (spent[first] || 0) + left;
    for (const a of keys(spent)) if (!spent[a]) delete spent[a];
    h.spent = spent;
  }
  const bag = (h) => db.items.filter((i) => i.owner === h.id && !i.equipped && i.price === null);

  // ------------------------------------------------------------------ GearActions

  function own(h, id) { const i = find('items', id); if (!i || i.owner !== h.id) fail('That item is not yours.'); return i; }
  const worn = (h, slot) => db.items.find((i) => i.owner === h.id && i.equipped === slot) || null;
  function equip(h, i, target = null) {
    if (i.slot === 'glyph') fail('Glyphs go into sockets, not slots.');
    if (i.price !== null) fail('Take the item off the market first.');
    target = target || i.slot;
    if (i.slot === 'ring1') {
      if (!['ring1', 'ring2'].includes(target)) target = 'ring1';
      if (target === 'ring1' && worn(h, 'ring1') && !worn(h, 'ring2')) target = 'ring2';
    } else if (target !== i.slot) fail('That item does not fit there.');
    const old = worn(h, target); if (old) old.equipped = null;
    i.equipped = target;
    collectLook(h, i);
  }
  function pay(h, gold, materials, essence = 0) {
    if (h.gold < gold) fail('That costs ' + gold + ' gold.');
    if (h.materials < materials) fail('That needs ' + materials + ' materials.');
    if (h.essence < essence) fail('That needs ' + essence + ' essence.');
    h.gold -= gold; h.materials -= materials; h.essence -= essence;
  }
  function temper(h, i) {
    if (i.slot === 'glyph') fail('Glyphs cannot be tempered.');
    if (i.temper >= MAX_TEMPER) fail('That item is fully tempered.');
    const cost = I.temperCost(I.spec(i), h.origin === 'anvil');
    pay(h, cost.gold, cost.materials); ++i.temper;
  }
  function socket(h, i, glyph, s) {
    if (glyph.slot !== 'glyph') fail('That is not a glyph.');
    if (s < 0 || s >= i.sockets) fail('That socket does not exist.');
    if (i.glyphs[s]) unsocket(h, i, s);
    const glyphs = [...i.glyphs]; glyphs[s] = [glyph.base, Math.trunc((glyph.affixes[0] || [])[1] || 3)];
    i.glyphs = glyphs; del('items', glyph);
  }
  function unsocket(h, i, s) {
    const gl = i.glyphs[s];
    if (!gl) fail('That socket is empty.');
    ins('items', { owner: h.id, slot: 'glyph', base: gl[0], rarity: 'rare', ilvl: i.ilvl, affixes: [[D.GLYPHS[gl[0]][1], gl[1]]], sockets: 0, glyphs: [], power: null, imprint: null, temper: 0, seed: rnd(1, 999999), equipped: null, price: null, createdAt: time() });
    const glyphs = [...i.glyphs]; glyphs[s] = null; i.glyphs = glyphs;
  }
  function imprint(h, i, power) {
    if (!h.codex.includes(power)) fail('That power is not in your Codex yet.');
    if (i.slot === 'glyph') fail('Glyphs cannot hold a power.');
    pay(h, 0, 0, 20); i.imprint = power;
  }
  function reforge(h, i, affix, attr) {
    if (h.level < C.REFORGE_LEVEL) fail('Reforging opens at level ' + C.REFORGE_LEVEL + '.');
    if (!i.affixes[affix] || !D.ATTRIBUTES[attr] || i.slot === 'glyph') fail('Pick an affix and an attribute.');
    i.affixes.forEach(([a], k) => { if (a === attr && k !== affix) fail('The item already has that attribute.'); });
    pay(h, 50 * i.ilvl, 0, 10);
    const affixes = clone(i.affixes); affixes[affix] = [attr, I.affixValue(i.ilvl, Math.random())]; i.affixes = affixes;
  }
  function salvage(h, i) {
    if (i.equipped) fail('Take the item off first.');
    const gain = { essence: I.salvageValue(I.spec(i)), materials: 1 + Math.floor(i.ilvl / 10) };
    h.essence += gain.essence; h.materials += gain.materials;
    i.glyphs.forEach((gl, k) => { if (gl) unsocket(h, i, k); });
    del('items', i);
    return gain;
  }
  const craftCost = (level) => ({ gold: Math.round(20 * 1.045 ** (2 * level)), materials: 4 + Math.floor(level / 4) });
  function craft(h, slot, base) {
    if (!D.BASES[slot] || slot === 'ring2') fail('Pick a slot.');
    if (base !== null && !D.BASES[slot][base]) fail('Pick a style for that slot.');
    const cost = craftCost(h.level); pay(h, cost.gold, cost.materials);
    const r = new Rng(rnd(1, 2000000000)), x = r.getFloat(0, 1), rarity = x < 0.03 ? 'epic' : x < 0.25 ? 'rare' : 'common';
    return ins('items', Object.assign(itemRecord(I.generate(r, 2 * h.level, rarity, slot, base)), { owner: h.id }));
  }
  function give(from, i, to) {
    if (to === from) fail('That is you.');
    i.equipped = null; i.price = null; i.owner = to.id;
    post(from.party && from.party === to.party ? 'party:' + from.party : 'tavern', from.name + ' gave ' + I.name(I.spec(i)) + ' to ' + to.name + '.', { type: 'item', spec: I.spec(i) });
  }
  function sell(i, price) {
    if (!(price >= 1 && price <= 10000000)) fail('Set a price between 1 and 10,000,000 gold.');
    i.equipped = null; i.price = price;
  }
  function buy(buyer, id) {
    const i = find('items', id);
    if (!i || i.price === null || !i.owner) fail('That listing is gone.');
    if (i.owner === buyer.id) fail('That is your own listing.');
    const price = i.price; pay(buyer, price, 0);
    find('heroes', i.owner).gold += price;
    i.owner = buyer.id; i.price = null;
    return i;
  }

  // ------------------------------------------------------------------ Social

  function leading(h) { const p = partyOf(h); if (!p || p.leader !== h.id) fail('Only the group leader can do that.'); return p; }
  function createParty(h, name) {
    if (h.party) fail('Leave your group first.');
    name = String(name).trim() || h.name + "'s group";
    const p = ins('parties', { name: name.slice(0, 40), leader: h.id, dungeonOffset: 0, running: true, battlesTogether: 0, createdAt: time() });
    join(h, p, false);
    return p;
  }
  function join(h, p, answered = true) {
    if (members(p).length >= PARTY_SIZE) fail('That group is full.');
    const scarce = answered && (scarcity()[dungeonFor(p).id] || {}).role === role(h) && time() - (h.scarceAt || 0) >= 86400;
    h.party = p.id;
    db.requests = db.requests.filter((r) => r.hero !== h.id);
    db.posts = db.posts.filter((t) => !(t.author === h.id && t.kind === 'lfg'));
    if (members(p).length >= PARTY_SIZE) { db.posts = db.posts.filter((t) => t.party !== p.id); db.requests = db.requests.filter((r) => r.party !== p.id); }
    post('party:' + p.id, h.name + ' joined the group.');
    if (scarce) {
      h.bonusRolls = C.SCARCE_ROLLS; h.scarceAt = time();
      post('party:' + p.id, h.name + ' answered the call as a scarce ' + (role(h) === 'dps' ? 'damage dealer' : role(h)) + ': they roll twice on their next ' + C.SCARCE_ROLLS + ' chests.');
    }
  }
  // The scarcest role per dungeon tier on the tavern board (Social::scarcity).
  function scarcity() {
    const wanted = {}, offered = {}, out = {};
    for (const t of db.posts) {
      if (t.kind === 'lfm' && t.party) { const p = find('parties', t.party); if (!p) continue; const tier = dungeonFor(p).id; wanted[tier] = wanted[tier] || {}; for (const r of t.roles) wanted[tier][r] = (wanted[tier][r] || 0) + 1; }
      else if (t.kind === 'lfg') { const a = find('heroes', t.author); if (!a) continue; const tier = newest(a.level).id, r = role(a); offered[tier] = offered[tier] || {}; offered[tier][r] = (offered[tier][r] || 0) + 1; }
    }
    for (const [tier, roles] of Object.entries(wanted)) {
      let best = null;
      for (const r of ['tank', 'healer', 'dps']) { const gap = (roles[r] || 0) - ((offered[tier] || {})[r] || 0); if (gap > 0 && (!best || gap > best[1])) best = [r, gap]; }
      if (best) out[tier] = { role: best[0], wanted: roles[best[0]], offered: (offered[tier] || {})[best[0]] || 0 };
    }
    return out;
  }
  const isNewcomer = (h, now) => !(userOf(h) || {}).demo && h.level < C.NEWCOMER_LEVEL && (now || time()) - (h.createdAt || 0) < C.NEWCOMER_DAYS * 86400;
  function leave(h) {
    const p = partyOf(h) || fail('You are not in a group.');
    h.party = null;
    const rest = members(p);
    if (!rest.length) {
      for (const b of db.battles.filter((x) => x.party === p.id && x.state === 'chest')) settleChest(b, Infinity);
      db.battles = db.battles.filter((x) => x.party !== p.id);
      db.requests = db.requests.filter((r) => r.party !== p.id);
      db.posts = db.posts.filter((t) => t.party !== p.id);
      del('parties', p);
      return;
    }
    if (p.leader === h.id) p.leader = rest[0].id;
    post('party:' + p.id, h.name + ' left the group.');
  }
  function kick(leader, target) {
    const p = leading(leader);
    if (target.party !== p.id || target === leader) fail('They are not in your group.');
    leave(target);
  }
  function settings(leader, input) {
    const p = leading(leader);
    if (input.dungeonOffset !== undefined) p.dungeonOffset = Math.max(-3, Math.min(5, Math.trunc(+input.dungeonOffset) || 0));
    if (input.dungeon !== undefined) {
      const pick = input.dungeon || null;
      if (pick && !unlocked(medianLevel(p)).some((d) => d.id === pick)) fail('Your group has not reached that dungeon yet.');
      p.dungeon = pick;
    }
    if (input.difficulty !== undefined) {
      const mode = String(input.difficulty), median = medianLevel(p);
      if (!['normal', 'heroic', 'mythic'].includes(mode)) fail('Pick normal, heroic or mythic.');
      if (mode === 'heroic' && !Md.heroicOpen(dungeonFor(p), median)) fail('Heroic opens once your group outgrows this dungeon (its top level).');
      if (mode === 'mythic' && !Md.mythicOpen(median)) fail('Mythic opens at level ' + Md.MYTHIC_LEVEL + '.');
      p.difficulty = mode;
    }
    if (input.mythicTier !== undefined) {
      const tier = Math.trunc(+input.mythicTier), best = p.mythicBest || 0;
      if (!(tier >= 1 && tier <= best + 1)) fail('Pick a tier from 1 to ' + (best + 1) + ': one above the best your group has cleared.');
      p.mythicTier = tier;
    }
    if (input.running !== undefined) p.running = !!input.running;
    if (input.name !== undefined && String(input.name).trim() !== '') p.name = String(input.name).trim().slice(0, 40);
  }
  function request(p, h, kind, message) {
    const existing = db.requests.find((r) => r.party === p.id && r.hero === h.id);
    if (existing) return existing;
    return ins('requests', { party: p.id, hero: h.id, kind, message: String(message).trim().slice(0, 200), createdAt: time() });
  }
  function apply(h, p, message) {
    if (h.party) fail('Leave your group first.');
    if (members(p).length >= PARTY_SIZE) fail('That group is full.');
    const r = request(p, h, 'application', message), leader = find('heroes', p.leader);
    if (leader && isDemo(leader)) accept(leader, r);
    return r;
  }
  function invite(leader, target, message) {
    const p = leading(leader);
    if (target.party) fail(target.name + ' is already in a group.');
    if (members(p).length >= PARTY_SIZE) fail('Your group is full.');
    const r = request(p, target, 'invite', message);
    if (isDemo(target)) accept(target, r);
    return r;
  }
  function mayAnswer(actor, r) {
    const ok = r.kind === 'invite' ? r.hero === actor.id : find('parties', r.party).leader === actor.id;
    if (!ok) fail('That request is not yours to answer.');
  }
  function accept(actor, r) {
    mayAnswer(actor, r);
    const h = find('heroes', r.hero);
    del('requests', r);
    if (h.party) fail(h.name + ' already joined another group.');
    join(h, find('parties', r.party));
  }
  function decline(actor, r) { if (r.hero !== actor.id) mayAnswer(actor, r); del('requests', r); }
  function postTavern(h, kind, text, roles) {
    if (kind === 'lfm') { const p = leading(h); if (members(p).length >= PARTY_SIZE) fail('Your group is full.'); }
    else if (kind === 'lfg') { if (h.party) fail('You are already in a group.'); }
    else fail('Post as looking for group or looking for members.');
    db.posts = db.posts.filter((t) => t.author !== h.id);
    const picked = ['tank', 'healer', 'dps'].filter((x) => roles.includes(x));
    return ins('posts', { author: h.id, party: kind === 'lfm' ? h.party : null, kind, text: String(text).trim().slice(0, 200), roles: picked.length ? picked : kind === 'lfg' ? [role(h)] : ['tank', 'healer', 'dps'], createdAt: time() });
  }
  function removeTavern(h, t) { if (t.author !== h.id) fail('That is not your post.'); del('posts', t); }
  function createGuild(h, input) {
    if (h.guild) fail('Leave your guild first.');
    const name = String(input.name || '').trim(), tag = String(input.tag || '').trim().toUpperCase();
    if (name.length < 3 || name.length > 32 || !/^[A-Z0-9]{2,4}$/.test(tag)) fail('A guild needs a name of 3 to 32 characters and a tag of 2 to 4 letters or digits.');
    if (db.guilds.some((g) => g.name === name)) fail('That guild name is taken.');
    if (h.gold < 100) fail('Founding a guild costs 100 gold.');
    h.gold -= 100;
    const g = ins('guilds', { name, tag, motto: String(input.motto || '').trim().slice(0, 160), xp: 0, createdAt: time() });
    h.guild = g.id; h.guildRank = 'leader'; h.marks = uniq([...h.marks, 'founder', 'bannerBearer']);
    post('tavern', h.name + ' founded the guild ' + name + ' [' + tag + '].');
    return g;
  }
  function joinGuild(h, g) {
    if (h.guild) fail('Leave your guild first.');
    if (guildMembers(g).length >= GUILD_MAX) fail('That guild is full.');
    h.guild = g.id; h.guildRank = 'member'; h.marks = uniq([...h.marks, 'bannerBearer']);
    post('guild:' + g.id, h.name + ' joined the guild. Say hello!');
  }
  function leaveGuild(h) {
    const g = guildOf(h) || fail('You are not in a guild.');
    h.guild = null;
    const rest = guildMembers(g);
    if (h.guildRank === 'leader' && rest.length) rest[0].guildRank = 'leader';
    h.guildRank = 'member';
    if (!rest.length) { for (const i of db.items.filter((x) => x.bank === g.id)) Object.assign(i, { bank: null, owner: h.id }); h.gold += g.bankGold || 0; del('guilds', g); } else post('guild:' + g.id, h.name + ' left the guild.');
  }
  function channels(h) {
    const out = { tavern: 'Tavern' };
    if (h.guild) out['guild:' + h.guild] = 'Guild';
    if (h.party) out['party:' + h.party] = 'Group';
    return out;
  }
  function readChat(h, channel, after = 0, limit = 60) {
    if (!channels(h)[channel]) fail('You cannot read that channel.');
    const blocked = new Set(userOf(h).blocked || []);
    return db.chat.filter((m) => m.channel === channel && (after <= 0 || m.id > after) && !(m.author && blocked.has(m.author))).slice(-limit);
  }
  // Moderation in the playable build: block works, reports are accepted (there is no moderator here).
  const userCard = (u) => ({ username: u.username, email: null, emailVerified: false, admin: false, mutedUntil: 0, reports: 0, blocked: (u.blocked || []).map((id) => db.heroes.find((x) => x.id === id)).filter(Boolean).map((x) => ({ id: x.id, name: x.name })) });
  function block(h, other) {
    if (other.id === h.id) fail('You cannot block yourself.');
    const u = userOf(h); u.blocked = uniq([...(u.blocked || []), other.id]);
    return { blocked: userCard(u).blocked };
  }
  function say(h, channel, body, card = null) {
    if (!channels(h)[channel]) fail('You cannot write to that channel.');
    body = String(body).trim();
    if (body === '' && !card) fail('Say something.');
    return post(channel, body, card, h);
  }

  // ------------------------------------------------------------------ Bots

  const LINES = ['gg everyone', 'that golem hits hard', 'anyone need a ring? got a spare', 'tank, you are a hero', 'nice heals', 'I got a new glyph, going for Ember Resonance',
    'one more level and I can pick my Keystone', 'who wants to push the dungeon level up?', 'brb, making tea', 'loot was kind today'];
  function think(h) {
    if (!isDemo(h)) return;
    autoSpend(h);
    const paths = keys(D.CLASSES[h.cls].paths);
    if (!h.path && h.level >= C.PATH_LEVEL && !h.oathTaken) h.path = paths[h.id % paths.length];
    const options = keys(D.KEYSTONES[role(h)]);
    for (const lvl of keystoneLevels(h.level)) {
      if (h.keystones[lvl] === undefined) { const free = options.filter((o) => !Object.values(h.keystones).includes(o)); h.keystones = Object.assign({}, h.keystones, { [lvl]: free[(h.id + lvl) % free.length] }); }
    }
    // Talents and Heritage follow a fixed plan per hero, so the demo heroes grow like players would.
    h.talents = T.auto(h.cls, T.points(h.level), h.id);
    const cultures = keys(H.tree(h.race).cultures);
    h.culture = h.culture || cultures[h.id % cultures.length];
    h.backstory = h.backstory || Object.entries(H.backstories(h.race)).find(([, b]) => b[1] === h.culture)[0];
    h.story = h.story || E.LifeStory.example(h.race, h.backstory, h.id);
    h.heritage = H.auto(h.race, h.culture, heritageRank(h));
    h.loadout = Cb.defaultLoadout(h.cls, h.level, h.path, h.talents);
    let i = 0;
    while (skillPoints(h) > 0 && i++ < 200) { const s = h.loadout[i % h.loadout.length]; if ((h.skillRanks[s] || 1) < D.MAX_RANK) rankUp(h, s); }
    for (const item of bag(h)) {
      if (item.slot === 'glyph') socketGlyph(h, item);
      else if (isUpgrade(h, I.spec(item))) equip(h, item);
    }
  }
  function socketGlyph(h, glyph) {
    for (const w of equipped(h)) for (let s = 0; s < w.sockets; s++) if (!w.glyphs[s]) { socket(h, w, glyph, s); return; }
  }
  function chatter() {
    if (Math.random() > 0.006) return;
    const demo = db.heroes.filter((h) => isDemo(h) && h.guild);
    if (demo.length) { const h = demo[rnd(0, demo.length - 1)]; post('guild:' + h.guild, LINES[rnd(0, LINES.length - 1)], null, h); }
  }

  // ------------------------------------------------------------------ demo seed (app:demo:seed)

  function seed() {
    const HEROES = [['Brannoc', 'dwarf', 'guardian', 'anvil', true], ['Sela', 'elf', 'cleric', 'lantern', true], ['Kira', 'felkin', 'rogue', 'fox', true], ['Ozric', 'draka', 'mage', 'ember', true],
      ['Thorn', 'orc', 'warden', 'wolf', false], ['Fen', 'elf', 'druid', 'tide', false], ['Ash', 'human', 'ranger', 'hawk', false], ['Mira', 'human', 'cleric', 'crown', false], ['Grub', 'orc', 'guardian', 'bell', false]];
    const SKINS = { human: ['#f6d7c3', '#eac0a2', '#d9a37f', '#bd8461', '#9a6646'], elf: ['#f8e2d2', '#efd0b6', '#c9c3d8', '#a7b6c9'], dwarf: ['#f3cfb6', '#e2b394', '#cc9474'],
      orc: ['#9fb07a', '#7f9a5e', '#61804a'], felkin: ['#e9c9a0', '#c99b6a', '#d8d2c8'], draka: ['#c98d5e', '#7c8e6a', '#5f8a8a', '#6d6a8f'] };
    const r = new Rng(7), pick = (a) => a[r.getInt(0, a.length - 1)], made = {};
    for (const [n, [name, race, cls, origin]] of HEROES.entries()) {
      const u = ins('users', { username: 'demo-' + name.toLowerCase(), demo: true, createdAt: time(), lastSeenAt: 0 });
      const lk = {
        skin: pick(SKINS[race]), hair: pick(['crop', 'spiky', 'long', 'ponytail', 'bob', 'buns', 'mohawk', 'bald']), hairColor: pick(['#2a2220', '#8a5a2b', '#d9a441', '#c9502e', '#e9e6e0', '#4f6d9c', '#b05aa8']),
        eyes: pick(['round', 'sharp', 'sleepy', 'sparkle']), eyeColor: pick(['#5a3a26', '#3f9a4a', '#2f7ae0', '#e0a02a']), mouth: pick(['smile', 'grin', 'flat', 'cat']), beard: race === 'dwarf' ? 'braided' : 'none',
        acc: pick(['none', 'none', 'glasses', 'eyepatch']), build: pick([0.92, 1, 1.1]), height: pick([0.95, 1, 1.05]), dye1: pick(['#c0392b', '#2f6fd0', '#3aa655', '#5b3fa8', '#e67e22']),
        dye2: pick(['#ece4d4', '#3d3a44', '#f1c40f']), metal: pick(['#b8c2cc', '#e0b04a', '#c58a5a']),
      };
      made[name] = createHero(u, { name, race, cls, origin, look: lk, story: E.LifeStory.example(race, keys(H.backstories(race))[(n * 4) % 9], n) });
    }
    const leader = made.Brannoc; leader.gold = 500;
    const guild = createGuild(leader, { name: 'Lantern Keepers', tag: 'LANT', motto: 'Nobody adventures alone.' });
    for (const h of Object.values(made)) if (h !== leader) joinGuild(h, guild);
    const party = createParty(leader, 'The Ember Watch');
    for (const [name, , , , inGroup] of HEROES) if (inGroup && made[name] !== leader) invite(leader, made[name], '');
    postTavern(leader, 'lfm', 'One seat open for the Ember Golem. Any role, all welcome!', ['tank', 'healer', 'dps']);
    for (const [name, text] of [['Thorn', 'Warden tank, steady and patient.'], ['Fen', 'Druid healer looking for a cozy group.'], ['Ash', 'Ranger, I bring my own arrows.']]) postTavern(made[name], 'lfg', text, []);
    const sellers = Object.values(made);
    for (let n = 1; n <= 8; n++) {
      const spec = I.generate(r, r.getInt(2, 8), n % 4 === 0 ? 'epic' : 'rare');
      ins('items', Object.assign(itemRecord(spec), { owner: sellers[n % sellers.length].id, price: spec.rarity === 'epic' ? 60 + 10 * n : 15 + 3 * n }));
    }
    for (const h of sellers) { h.gold = Math.max(h.gold, 40); think(h); }
    post('guild:' + guild.id, 'Welcome to the Lantern Keepers! Group up at the tavern, the golem awaits.', null, leader);
    post('tavern', 'The Ember Watch has one open seat. Apply from the tavern board!', null, leader);
    void party;
  }

  // ------------------------------------------------------------------ routes (src/Controller)

  function me() {
    // The browser build has one local player and no passwords: the account is made on first visit.
    let u = db.me ? find('users', db.me) : null;
    if (!u) { u = ins('users', { username: 'player', demo: false, createdAt: time(), lastSeenAt: time() }); db.me = u.id; }
    return u;
  }
  const hero = () => db.heroes.find((h) => h.user === me().id) || fail('Create a hero first.');
  function heroByName(name) { name = String(name).trim(); return db.heroes.find((h) => h.name === name) || fail('No hero called ' + name + '.'); }
  const int = (x, d = 0) => { const n = parseInt(x, 10); return Number.isNaN(n) ? d : n; };

  function state() {
    const u = me(); u.lastSeenAt = time();
    const h = db.heroes.find((x) => x.user === u.id);
    if (!h) return { serverTime: time(), user: userCard(u), hero: null };
    // What app:tick does on the server: move groups along and let the demo heroes play.
    for (const p of [...db.parties]) if (find('parties', p.id)) progress(p);
    for (const d of db.heroes) think(d);
    chatter();
    const p = partyOf(h);
    const battle = p ? db.battles.find((b) => b.party === p.id && b.state === 'running') : null;
    let pendingRolls = 0;
    if (p) for (const b of db.battles.filter((x) => x.party === p.id && x.state === 'chest')) for (const c of b.chest) if (b.roster.some((x) => x.id === h.id) && c.rolls[h.id] === undefined) ++pendingRolls;
    return {
      serverTime: time(), user: userCard(u), hero: presentHero(h), inventory: inventory(h), party: presentParty(p, h),
      invites: db.requests.filter((r) => r.hero === h.id).map(presentRequest),
      battle: battle ? { id: battle.id, startedAt: battle.startedAt, endsAt: battle.endsAt, dungeon: battle.dungeon || D.DEFAULT_DUNGEON, dungeonLevel: battle.dungeonLevel } : null,
      pendingRolls, channels: channels(h),
    };
  }
  function battles(q) {
    const h = hero(), out = { serverTime: time(), current: null, chests: [], recent: [] }, p = partyOf(h);
    if (!p) return out;
    const mine = db.battles.filter((b) => b.party === p.id), cur = mine.find((b) => b.state === 'running');
    if (cur) out.current = presentBattle(cur, h, int(q.get('have')) !== cur.id);
    out.chests = mine.filter((b) => b.state === 'chest').reverse().map((b) => presentBattle(b, h, false));
    out.recent = mine.filter((b) => b.state === 'done').reverse().slice(0, 8).map((b) => presentBattle(b, h, false));
    return out;
  }
  function heroAct(input) {
    const h = hero();
    const acts = {
      spend: () => spend(h, Object.fromEntries(Object.entries(input.points || {}).map(([k, v]) => [k, int(v)]))),
      autoSpend: () => autoSpend(h), path: () => choosePath(h, String(input.path || '')),
      keystone: () => chooseKeystone(h, int(input.level), String(input.keystone || '')), rankUp: () => rankUp(h, String(input.skill || '')), signature: () => chooseSignature(h, String(input.skill || ''), input.name), legend: () => chooseLegend(h, String(input.form || '')),
      resetRanks: () => resetRanks(h), loadout: () => setLoadout(h, [].concat(input.skills || [])), lootPolicy: () => setLootPolicy(h, String(input.policy || '')),
      talent: () => learnTalent(h, [].concat(input.nodes || input.node || []).map(String)), resetTalents: () => resetTalents(h),
      culture: () => chooseCulture(h, String(input.culture || '')), story: () => writeStory(h, input.story), heritage: () => learnHeritage(h, [].concat(input.nodes || input.node || []).map(String)),
    };
    (acts[input.action] || (() => fail('Unknown action.')))();
    return presentHero(h);
  }
  function itemAct(id, action, input) {
    const h = hero(), i = own(h, id);
    let result = null;
    const acts = {
      equip: () => equip(h, i, input.slot || null), unequip: () => { i.equipped = null; }, temper: () => temper(h, i),
      socket: () => socket(h, i, own(h, int(input.glyph)), int(input.socket, -1)), unsocket: () => unsocket(h, i, int(input.socket, -1)),
      imprint: () => imprint(h, i, String(input.power || '')), reforge: () => reforge(h, i, int(input.affix, -1), String(input.attr || '')),
      dye: () => dye(h, i, Array.isArray(input.dye) ? input.dye : null),
      salvage: () => { result = salvage(h, i); }, give: () => give(h, i, heroByName(input.to || '')), sell: () => sell(i, int(input.price)), unlist: () => { i.price = null; },
    };
    (acts[action] || (() => fail('Unknown action.')))();
    return { ok: true, result };
  }
  function partyAct(action, input) {
    const h = hero();
    const acts = {
      create: () => createParty(h, input.name || ''), leave: () => leave(h), kick: () => kick(h, must('heroes', input.hero)), settings: () => settings(h, input), resume: () => { if (!h.party) fail('You are not in a group.'); find('parties', h.party).running = true; },
      invite: () => invite(h, input.hero !== undefined ? must('heroes', input.hero) : heroByName(input.name || ''), input.message || ''),
      apply: () => apply(h, must('parties', input.party), input.message || ''),
    };
    (acts[action] || (() => fail('Unknown action.')))();
    return { ok: true };
  }

  const ROUTES = [
    ['GET', /^\/config$/, () => config()],
    ['GET', /^\/lore$/, () => D.LORE],
    ['GET', /^\/tree\/(talent|heritage)\/([a-z]+)$/, (m) => (m[1] === 'talent' ? T.tree(m[2]) : H.tree(m[2])) || fail('Unknown map.')],
    ['POST', /^\/logout$/, () => { db = fresh(); seed(); return { ok: true }; }],
    ['GET', /^\/state$/, () => state()],
    ['GET', /^\/battle$/, (m, b, q) => battles(q)],
    ['POST', /^\/outfit$/, (m, b) => { const h = hero(); setOutfit(h, String(b.slot || ''), b.look == null ? null : String(b.look)); return presentHero(h); }],
    ['GET', /^\/prologue$/, () => prologue(hero())],
    ['POST', /^\/prologue\/done$/, () => { const h = hero(); h.prologueDone = true; return presentHero(h); }],
    ['POST', /^\/battle\/(\d+)\/roll$/, (m, b) => { const h = hero(), bt = must('battles', m[1]); roll(bt, h, int(b.idx, -1), String(b.choice || '')); return presentBattle(bt, h, false); }],
    ['POST', /^\/hero$/, (m, b) => presentHero(createHero(me(), b))],
    ['GET', /^\/hero\/(\d+)$/, (m) => inspect(must('heroes', m[1]))],
    ['POST', /^\/hero\/act$/, (m, b) => heroAct(b)],
    ['POST', /^\/item\/(\d+)\/(\w+)$/, (m, b) => itemAct(+m[1], m[2], b)],
    ['POST', /^\/craft$/, (m, b) => { const h = hero(); return presentItem(craft(h, String(b.slot || ''), b.base ? String(b.base) : null), h); }],
    ['GET', /^\/craft\/cost$/, () => craftCost(hero().level)],
    ['GET', /^\/market$/, (m, b, q) => {
      const h = hero(), slot = q.get('slot'), rarity = q.get('rarity');
      return db.items.filter((i) => i.price !== null && (!slot || i.slot === slot) && (!rarity || i.rarity === rarity)).sort((a, c) => c.id - a.id).slice(0, 80).map((i) => presentItem(i, h));
    }],
    ['POST', /^\/market\/(\d+)\/buy$/, (m) => { const h = hero(); return presentItem(buy(h, +m[1]), h); }],
    ['POST', /^\/party\/(create|leave|kick|settings|resume|invite|apply)$/, (m, b) => partyAct(m[1], b)],
    ['POST', /^\/request\/(\d+)\/(accept|decline)$/, (m) => { const h = hero(), r = find('requests', m[1]) || fail('That request is gone.'); m[2] === 'accept' ? accept(h, r) : decline(h, r); return { ok: true }; }],
    ['GET', /^\/tavern$/, () => {
      const h = hero();
      return { posts: [...db.posts].reverse().slice(0, 100).map(presentPost), freeHeroes: db.heroes.filter((x) => !x.party && x !== h).sort((a, c) => c.level - a.level).slice(0, 40).map(heroCard),
        scarcity: scarcity(), myTier: h.party ? dungeonFor(find('parties', h.party)).id : newest(h.level).id };
    }],
    ['POST', /^\/tavern$/, (m, b) => presentPost(postTavern(hero(), String(b.kind || ''), String(b.text || ''), [].concat(b.roles || [])))],
    ['DELETE', /^\/tavern\/(\d+)$/, (m) => { removeTavern(hero(), must('posts', m[1])); return { ok: true }; }],
    ['GET', /^\/guilds$/, () => { const h = hero(), g = guildOf(h); return { mine: g ? presentGuild(g, true, h) : null, all: [...db.guilds].sort((a, c) => c.xp - a.xp).slice(0, 50).map((x) => presentGuild(x)) }; }],
    ['POST', /^\/guild\/create$/, (m, b) => { createGuild(hero(), b); return { ok: true }; }],
    ['POST', /^\/guild\/(\d+)\/join$/, (m) => { joinGuild(hero(), must('guilds', m[1])); return { ok: true }; }],
    ['POST', /^\/guild\/leave$/, () => { leaveGuild(hero()); return { ok: true }; }],
    ['POST', /^\/guild\/bank\/(deposit|withdraw|goldIn|goldOut)$/, (m, b) => { guildBank(hero(), m[1], b); return { ok: true }; }],
    ['POST', /^\/guild\/notice$/, (m, b) => { guildNotice(hero(), b.notice); return { ok: true }; }],
    ['POST', /^\/guild\/rank$/, (m, b) => { guildRank(hero(), must('heroes', b.hero), String(b.rank || '')); return { ok: true }; }],
    ['GET', /^\/chat$/, (m, b, q) => readChat(hero(), q.get('channel') || 'tavern', int(q.get('after'))).map(presentChat)],
    ['POST', /^\/chat\/(\d+)\/report$/, (m) => { hero(); must('chat', m[1]); return { ok: true }; }],
    ['POST', /^\/block$/, (m, b) => { const h = hero(); return block(h, b.hero !== undefined ? must('heroes', b.hero) : (db.heroes.find((x) => x.name === String(b.name || '').trim()) || fail('No hero called ' + b.name + '.'))); }],
    ['DELETE', /^\/block\/(\d+)$/, (m) => { const u = userOf(hero()); u.blocked = (u.blocked || []).filter((id) => id !== int(m[1])); return { blocked: userCard(u).blocked }; }],
    ['POST', /^\/chat$/, (m, b) => {
      const h = hero();
      let card = null;
      if (b.item !== undefined) { const i = own(h, int(b.item)); card = { type: 'item', spec: I.spec(i) }; }
      else if (b.hero) card = { type: 'hero', hero: h.id };
      return presentChat(say(h, String(b.channel || 'tavern'), String(b.body || ''), card));
    }],
  ];

  window.IT_SERVER = {
    /** Same contract as fetch('/api' + path): resolves with the JSON body, or throws an error carrying a status. */
    handle(method, path, body) {
      if (!db) load();
      const [p, qs] = path.split('?'), q = new URLSearchParams(qs || '');
      for (const [verb, re, fn] of ROUTES) {
        const m = verb === method && p.match(re);
        if (!m) continue;
        // Work on a copy so a failed action leaves the world as it was, like a rolled back transaction.
        const before = JSON.stringify(db);
        try {
          const out = clone(fn(m, body || {}, q));
          if (method !== 'GET' || p === '/state') save();
          return out;
        } catch (e) {
          db = JSON.parse(before);
          if (e instanceof GameError) throw e;
          console.error(e);
          throw new GameError('Something went wrong: ' + e.message, 500);
        }
      }
      throw new GameError('Not found.', 404);
    },
  };
})();
