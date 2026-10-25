// The battle arena: replays a run the server simulated, in step with the clock, as a full scene. Heroes on the
// left, the dungeon's monsters on the right, a scrolling cave between fights, and every hit, heal and boss
// mechanic drawn as an effect. The art comes from pixel.js (heroes) and art.js (monsters and scenery).
(function () {
  'use strict';
  const P = window.ITP, ART = window.ITA;
  const W = 960, H = 540, FLOOR = 450;
  const FONT = '"Lilita One", "Trebuchet MS", system-ui, sans-serif';
  const CLASS_COL = { guardian: '#6fb7ff', warden: '#7ad0c0', cleric: '#ffe27a', druid: '#7be07f', ranger: '#c8e070', mage: '#c084ff', rogue: '#ff8a6b' };
  const RANGED = { ranger: 'arrow', mage: 'orb', cleric: 'spark', druid: 'leaf' };
  // Where each hero stands: tank in front, healer at the back, damage between. [x, feet y]
  const SPOTS = [[375, 492], [95, 498], [270, 462], [208, 512], [145, 458]];
  const rand = (a, b) => a + Math.random() * (b - a);
  const fmt = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));
  const ease = (t) => 1 - (1 - t) * (1 - t);
  const sfx = (name, opts) => { if (window.ITS) window.ITS.play(name, opts); };

  class Arena {
    constructor(canvas, hooks) {
      this.cv = canvas; this.g = canvas.getContext('2d'); this.hooks = hooks || {};
      this.sprites = new Map(); this.reset(null);
    }
    reset(battleId) {
      Object.assign(this, {
        battleId, shown: -1, lastSim: -1, enemies: {}, at: 0, wing: 0, label: '', walkFrom: null, phaseReal: 0, boss: null,
        nums: [], parts: [], projs: [], rings: [], beams: [], banners: [], callouts: [], meteors: [], shake: 0, flash: null,
        act: {}, hurtAt: {}, enemyAct: {}, combo: 0, comboAt: 0, dmgLog: [], mechText: '', mechUntil: 0, enraged: false, embers: [],
      });
    }
    now() { return performance.now() / 1000; }
    sprite(look, pose) {
      const key = JSON.stringify(look) + pose;
      if (!this.sprites.has(key)) {
        const c = P.sprite(look, pose), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let top = 0;
        find: for (; top < c.height; top++) for (let x = 0; x < c.width; x++) if (d[(top * c.width + x) * 4 + 3] > 0) break find;
        c._top = top; // first opaque row, so bars and names sit just above each hero's head
        this.sprites.set(key, c);
      }
      return this.sprites.get(key);
    }

    // ------------------------------------------------------------ events

    update(cur, tl, simT) {
      if (this.battleId !== cur.id) this.reset(cur.id);
      const names = cur.roster.map((r) => r.name), log = this.hooks.log || (() => {});
      const live = simT - this.lastSim < 3, t = this.now();
      let budget = 40; // cap effects per frame when a lot happens at once
      for (let i = this.shown + 1; i < tl.ev.length && tl.ev[i].t <= simT; i++) {
        const e = tl.ev[i];
        this.shown = i;
        const fresh = live && simT - e.t < 2 && budget-- > 0;
        switch (e.type) {
          case 'phase': {
            if (e.dst !== 2) { this.enemies = {}; this.phaseReal = t; this.enraged = false; }
            this.walkFrom = null; this.at = e.src;
            Object.values(e.x.enemies).forEach(([id, kind, name, max], k) => { if (!this.enemies[id]) this.enemies[id] = { id, kind, name, max, hp: 1000, slot: k, born: t, dead: 0 }; });
            if (e.dst !== 2) {
              this.wing = e.x.wing; this.label = e.x.name;
              const bossy = e.dst === 1;
              if (fresh) sfx(bossy ? 'boss' : 'pack');
              if (fresh) this.banner(bossy ? e.x.name : e.x.name, bossy ? 'Boss · wing ' + (e.x.wing + 1) : 'Wing ' + (e.x.wing + 1) + ' · ' + ART.WINGS[e.x.wing].name, bossy ? '#ff8a3a' : '#ffd25a');
              log(e.t, bossy ? '<b>Boss: ' + esc(e.x.name) + '</b>' : esc(e.x.name), bossy ? 'gold' : '');
            }
            break;
          }
          case 'walk': this.enemies = {}; this.walkFrom = e.t; this.at = e.src; this.label = 'On to the ' + (e.x.to || 'next fight'); break;
          case 'spawn': this.enemies[e.src] = { id: e.src, kind: 'shard', name: 'Ember Shard', max: e.amt, hp: 1000, slot: Object.keys(this.enemies).length, born: t, dead: 0 }; if (fresh) this.burst(660, 300, '#ffb340', 18, 220); break;
          case 'hit': {
            if (e.src >= 0) this.act[e.src] = t;
            if (e.amt > 0) { this.dmgLog.push([e.t, e.amt]); if (t - this.comboAt < 2.5) this.combo++; else this.combo = 1; this.comboAt = t; }
            if (fresh && e.amt > 0) this.heroHit(cur, e);
            break;
          }
          case 'heal': if (fresh && e.amt > 0) { sfx('heal'); const p = this.heroPos(e.dst); this.beams.push({ x: p[0], y: p[1], col: '#7dff8a', t, life: 0.5, w: e.flags & 1 ? 26 : 16 }); this.num(p[0] + rand(-14, 14), p[1] - 150, '+' + fmt(e.amt), '#7dff8a', e.flags & 1 ? 30 : 22); this.burst(p[0], p[1] - 60, '#9dffa8', 4, 60, -40); } break;
          case 'hurt': {
            this.hurtAt[e.dst] = t;
            if (e.src != null && e.src >= 0) this.enemyAct[e.src] = t;
            if (fresh && e.amt > 0) {
              sfx(e.flags & 1 ? 'block' : 'hurt', { big: e.flags & 2 });
              const p = this.heroPos(e.dst);
              this.num(p[0] + rand(-12, 12), p[1] - 130, '-' + fmt(e.amt), e.flags & 4 ? '#ffa04a' : '#ff6464', e.flags & 2 ? 34 : 22);
              if (e.flags & 2) { this.shake = Math.max(this.shake, 14); this.burst(p[0], p[1] - 70, '#ffd25a', 22, 260); this.rings.push({ x: p[0], y: p[1] - 70, col: '#ff5a3a', t, life: 0.45, r: 90, w: 6 }); }
              else if (e.flags & 4) this.burst(p[0], p[1] - 50, '#ff8a2a', 8, 140, -80);
              else this.burst(p[0] - 10, p[1] - 80, '#ff8080', 4, 120);
              if (e.flags & 1) this.callout(e.dst, 'Blocked', '#b8d8ff');
            }
            break;
          }
          case 'dodge': if (fresh) sfx('dodge'); if (fresh) this.callout(e.dst, 'Dodge', '#a9c4ff'); break;
          case 'shield': if (fresh) { sfx('shield'); const ids = e.dst >= 0 ? [e.dst] : cur.roster.map((_, k) => k); ids.forEach((k) => { const p = this.heroPos(k); this.rings.push({ x: p[0], y: p[1] - 70, col: '#cfe4ff', t, life: 0.5, r: 60, w: 3 }); }); } break;
          case 'cast': {
            this.act[e.src] = t;
            if (e.flags & 1) {
              log(e.t, '<b>' + esc(names[e.src]) + '</b> used ' + esc(e.x.name) + '!', 'gold');
              if (fresh) { sfx('ultimate'); const p = this.heroPos(e.src); this.beams.push({ x: p[0], y: p[1], col: CLASS_COL[cur.roster[e.src].cls], t, life: 1.1, w: 60, pillar: true }); this.banner(e.x.name, names[e.src] + "'s ultimate", CLASS_COL[cur.roster[e.src].cls]); this.flash = { col: CLASS_COL[cur.roster[e.src].cls], t, life: 0.35 }; }
            } else if (fresh) { sfx('cast'); this.callout(e.src, e.x.name, CLASS_COL[cur.roster[e.src].cls]); }
            break;
          }
          case 'mech': {
            const n = e.x.name;
            log(e.t, '<b class="bad">' + esc(n) + '</b>' + (e.dst >= 0 ? ' on ' + esc(names[e.dst]) : ''), e.flags & 1 ? 'good' : '');
            if (!fresh) break;
            this.mechText = n; this.mechUntil = t + 2;
            sfx(e.flags & 1 ? 'revive' : { 'Magma Rain': 'magma', 'Tank Buster': 'buster', Shockwave: 'shockwave', Enrage: 'enrage', 'Smouldering Curse': 'curse', 'Ember Shards': 'shards' }[n] || 'cast');
            if (e.flags & 1) { const p = this.heroPos(e.dst); this.beams.push({ x: p[0], y: p[1], col: '#fff2a0', t, life: 0.9, w: 40, pillar: true }); this.callout(e.dst, n, '#fff2a0'); break; }
            if (n === 'Magma Rain') { for (let k = 0; k < 9; k++) this.meteors.push({ x: rand(40, 440), t: t + k * 0.12, life: 0.55 }); this.flash = { col: '#ff5a1a', t, life: 0.25 }; }
            else if (n === 'Tank Buster') { const p = this.heroPos(e.dst); this.rings.push({ x: p[0], y: p[1] - 70, col: '#ff2a2a', t, life: 1.2, r: 70, w: 5, target: true }); this.banner('Tank Buster', 'on ' + names[e.dst], '#ff5a5a', 1.2); }
            else if (n === 'Shockwave') { this.rings.push({ x: 710, y: FLOOR + 20, col: '#ffb340', t, life: 0.8, r: 760, w: 10, flat: true }); this.shake = Math.max(this.shake, 18); }
            else if (n === 'Enrage') { this.enraged = true; this.banner('Enrage!', 'The boss hits three times as hard', '#ff3a3a', 2); this.flash = { col: '#ff0000', t, life: 0.5 }; }
            else if (n === 'Smouldering Curse') { const p = this.heroPos(e.dst); this.callout(e.dst, 'Cursed', '#c084ff'); this.burst(p[0], p[1] - 120, '#a060ff', 14, 90, -30); }
            else if (n === 'Ember Shards') this.banner('Ember Shards', 'Kill them before they reach the healer', '#ffb340', 1.4);
            break;
          }
          case 'death': { log(e.t, '<b>' + esc(names[e.dst]) + '</b> fell to ' + esc(e.x.what) + '.', 'bad'); if (fresh) { sfx('death'); const p = this.heroPos(e.dst); this.burst(p[0], p[1] - 70, '#d0c8e0', 18, 120, -60); this.callout(e.dst, 'Down!', '#ff6464'); } break; }
          case 'revive': log(e.t, esc(names[e.src]) + ' is back on their feet.', 'good'); if (fresh) { sfx('revive'); const p = this.heroPos(e.src); this.beams.push({ x: p[0], y: p[1], col: '#fff2a0', t, life: 1, w: 50, pillar: true }); } break;
          case 'kill': {
            const en = this.enemies[e.dst];
            if (!en) break;
            en.hp = 0; en.dead = t;
            if (fresh) sfx(en.kind === 'boss' ? 'bossDown' : 'kill');
            if (fresh) { const p = this.enemyPos(en); this.burst(p[0], p[1] - 30, '#ffb340', en.kind === 'boss' ? 60 : 16, en.kind === 'boss' ? 420 : 200); }
            if (en.kind === 'boss') {
              log(e.t, 'The ' + esc(en.name) + ' is down!', 'good');
              if (fresh) { this.banner(en.name + ' defeated!', 'The chest may hold something', '#ffd25a', 2.4); this.shake = 20; for (let k = 0; k < 30; k++) this.parts.push({ x: 710, y: 380, vx: rand(-260, 200), vy: rand(-520, -220), col: '#f0c23a', t, life: 1.6, size: 6, grav: 900, coin: true }); }
            }
            break;
          }
        }
      }
      this.lastSim = simT;
      // party DPS over the last 10 seconds of the run
      while (this.dmgLog.length && this.dmgLog[0][0] < simT - 10) this.dmgLog.shift();
    }
    heroHit(cur, e) {
      const t = this.now(), en = this.enemies[e.dst]; if (!en) return;
      const to = this.enemyPos(en), crit = e.flags & 1, mega = e.flags & 2, dot = e.flags & 16, pet = e.flags & 8;
      const size = mega ? 44 : crit ? 32 : dot ? 16 : e.flags & 4 ? 18 : 22, col = mega ? '#ff5cf0' : crit ? '#ffd040' : dot ? '#ffa04a' : '#ffffff';
      const tx = to[0] + rand(-24, 24), ty = to[1] + rand(-30, 30), text = (mega ? 'MEGA ' : '') + fmt(e.amt) + (crit && !mega ? '!' : '');
      if (dot) { sfx('dot'); this.num(tx, ty, text, col, size); this.burst(tx, ty + 20, '#ff8a2a', 2, 60, -60); return; }
      const hero = cur.roster[e.src], kind = pet ? 'paw' : hero ? RANGED[hero.cls] : null;
      if (kind && kind !== 'paw') {
        const from = this.heroPos(e.src);
        sfx(kind);
        this.projs.push({ kind, x0: from[0] + 30, y0: from[1] - 95, x1: tx, y1: ty, t, dur: kind === 'arrow' ? 0.22 : 0.3, col: CLASS_COL[hero.cls], done: () => { sfx(mega ? 'mega' : crit ? 'crit' : 'hit', { vol: 0.6 }); this.num(tx, ty, text, col, size); this.impact(tx, ty, CLASS_COL[hero.cls], crit || mega); if (mega) this.megaHit(tx, ty); } });
      } else {
        this.rings.push({ x: tx, y: ty, col: pet ? '#c89a6a' : '#ffffff', t, life: 0.18, r: crit ? 46 : 32, w: 4, slash: true, a: rand(-0.6, 0.6) });
        sfx(mega ? 'mega' : crit ? 'crit' : 'hit'); this.num(tx, ty, text, col, size); this.impact(tx, ty, '#ffffff', crit || mega); if (mega) this.megaHit(tx, ty);
      }
    }
    impact(x, y, col, big) { this.burst(x, y, col, big ? 12 : 5, big ? 260 : 150); if (big) this.shake = Math.max(this.shake, 5); }
    megaHit(x, y) { this.shake = Math.max(this.shake, 16); this.rings.push({ x, y, col: '#ff5cf0', t: this.now(), life: 0.5, r: 160, w: 8 }); this.flash = { col: '#ff5cf0', t: this.now(), life: 0.18 }; }
    num(x, y, text, col, size) { this.nums.push({ x, y, text, col, size, t: this.now(), life: size > 30 ? 1.3 : 0.9, vx: rand(-20, 20) }); if (this.nums.length > 70) this.nums.shift(); }
    burst(x, y, col, n, spd, vyBias = 0) { const t = this.now(); for (let k = 0; k < n; k++) { const a = rand(0, Math.PI * 2), v = rand(0.3, 1) * spd; this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + vyBias, col, t, life: rand(0.35, 0.8), size: rand(3, 6), grav: 380 }); } if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500); }
    banner(text, sub, col, life = 1.8) { this.banners = [{ text, sub, col, t: this.now(), life }]; }
    callout(i, text, col) { const p = this.heroPos(i); this.callouts.push({ x: p[0], y: p[1] - 168, text, col, t: this.now(), life: 1 }); if (this.callouts.length > 12) this.callouts.shift(); }
    heroPos(i) { return SPOTS[i] || SPOTS[0]; }
    // Feet position of an enemy: bosses in the middle, packs in a loose formation, adds and shards beside the boss.
    enemyFeet(en) {
      if (en.kind === 'boss') return [725, 492];
      if (en.kind === 'shard') return [550 - (en.slot % 3) * 46, 330 - (en.slot % 2) * 44];
      const withBoss = Object.values(this.enemies).some((e) => e.kind === 'boss');
      const spots = withBoss ? [[530, 498], [555, 452], [490, 470], [580, 500]] : [[630, 494], [720, 456], [790, 506], [860, 462], [560, 452]];
      return spots[en.slot % spots.length];
    }
    enemyPos(en) {
      const [x, y] = this.enemyFeet(en), img = ART.monster(en.kind, en.name, 'idle0');
      return [x, y - img.height * ART.monsterScale(en.kind, en.name) * 0.55];
    }

    // ------------------------------------------------------------ drawing

    draw(cur, tl, simT, snap) {
      const g = this.g, t = this.now(), dt = Math.min(0.05, t - (this.lastDraw || t)); this.lastDraw = t;
      if (window.ITS) window.ITS.ambient();
      if (snap) snap[3].forEach(([id, hp]) => { if (this.enemies[id] && !this.enemies[id].dead) this.enemies[id].hp = hp; });
      g.save();
      g.imageSmoothingEnabled = false;
      this.shake *= Math.pow(0.02, dt);
      if (this.shake > 0.5) g.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake) * 0.6);
      const walking = this.walkFrom != null;
      // The cave scrolls while the group walks to the next fight.
      const scroll = (walking ? (simT - this.walkFrom) * 26 : 0) + this.at * 210;
      this.drawBackdrop(scroll, t);
      // enemies, back to front
      const foes = Object.values(this.enemies).filter((e) => !e.dead || t - e.dead < 0.6).sort((a, b) => this.enemyFeet(a)[1] - this.enemyFeet(b)[1]);
      foes.forEach((en) => this.drawEnemy(en, t));
      // heroes, back to front
      cur.roster.map((r, i) => i).sort((a, b) => this.heroPos(a)[1] - this.heroPos(b)[1]).forEach((i) => this.drawHero(cur.roster[i], i, snap, t, walking));
      this.drawEffects(t, dt);
      g.restore();
      this.drawHud(cur, simT, t);
    }
    drawBackdrop(scroll, t) {
      const g = this.g, w = this.wing || 0, pal = ART.WINGS[w];
      [[0, 0.25], [1, 0.6], [2, 1]].forEach(([l, speed]) => {
        const img = ART.layer(w, l), off = -((scroll * speed) % 640) * 3;
        for (let x = off; x < W; x += 1920) g.drawImage(img, x, 0, 1920, 540);
      });
      // lava glow along the floor, flickering
      const fl = 0.5 + 0.12 * Math.sin(t * 3.1) + 0.06 * Math.sin(t * 7.3);
      let gr = g.createLinearGradient(0, FLOOR - 160, 0, H);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, hexA(pal.glow, 0.22 * fl));
      g.fillStyle = gr; g.fillRect(0, FLOOR - 160, W, H);
      if (pal.prop === 'lava') {
        // two lava falls in front of the far wall
        [[120, 26], [905, 20]].forEach(([x, w2], k) => {
          const xx = x - ((scroll * 0.6 * 3) % 1920) + (k ? 0 : 0);
          for (const X of [xx, xx + 1920]) { if (X < -60 || X > W + 60) continue; g.fillStyle = '#ff7a1a'; g.fillRect(X, 0, w2, FLOOR - 10); g.fillStyle = '#ffd060'; for (let y = (t * 240) % 30; y < FLOOR; y += 30) g.fillRect(X + 4 + ((y * 7) % (w2 - 8)), y, 4, 12); g.fillStyle = 'rgba(255,120,30,0.18)'; g.fillRect(X - 30, 0, w2 + 60, FLOOR); }
        });
      }
      // ambient embers
      if (this.embers.length < 40) this.embers.push({ x: rand(0, W), y: H + 10, vy: rand(-60, -25), vx: rand(-10, 10), s: rand(2, 4), ph: rand(0, 6) });
      g.fillStyle = pal.glow;
      this.embers.forEach((e) => { e.y += e.vy / 60; e.x += (e.vx + Math.sin(t * 2 + e.ph) * 12) / 60; g.globalAlpha = Math.max(0, Math.min(1, e.y / H)) * 0.8; g.fillRect(e.x, e.y, e.s, e.s); });
      g.globalAlpha = 1;
      this.embers = this.embers.filter((e) => e.y > -10);
      // vignette
      gr = g.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.75);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    drawEnemy(en, t) {
      const g = this.g, [x, y] = this.enemyFeet(en), sc = ART.monsterScale(en.kind, en.name);
      const attacking = this.enemyAct[en.id] != null && t - this.enemyAct[en.id] < 0.35;
      const frame = attacking ? 'atk' : Math.floor(t * 2 + en.slot) % 2 ? 'idle1' : 'idle0';
      const img = ART.monster(en.kind, en.name, frame), w = img.width * sc, h = img.height * sc;
      const enter = Math.min(1, (t - en.born) / 0.6), dx = (1 - ease(enter)) * 260;
      const dying = en.dead ? Math.min(1, (t - en.dead) / 0.6) : 0;
      const fy = en.kind === 'shard' ? y + Math.sin(t * 4 + en.slot) * 8 : y;
      // shadow
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(x + dx, (en.kind === 'shard' ? FLOOR + 10 : fy) - 2, w * 0.36, 10, 0, 0, Math.PI * 2); g.fill();
      g.save();
      g.globalAlpha = 1 - dying;
      if (en.kind === 'boss' && this.enraged) g.filter = 'saturate(1.6) hue-rotate(-15deg) brightness(1.15)';
      flipped(g, img, Math.round(x + dx), Math.round(fy - h + dying * 30), w, h);
      g.restore();
      if (en.kind !== 'boss' && !en.dead) bar(g, x + dx - 40, fy - h - 14, 80, en.hp / 1000, '#ff5a3a');
    }
    drawHero(r, i, snap, t, walking) {
      const g = this.g, [x, y] = this.heroPos(i), hp = snap ? snap[1][i] : 1000, dead = hp <= 0;
      const a = this.act[i], since = a != null ? t - a : 9;
      const pose = dead ? 'stand0' : walking ? 'walk' + (Math.floor(t * 7 + i) % 4) : since < 0.08 ? 'atk0' : since < 0.18 ? 'atk1' : since < 0.3 ? 'atk2' : Math.floor(t * 1.6 + i * 0.7) % 7 === 0 ? 'blink' : Math.floor(t * 2 + i) % 2 ? 'stand1' : 'stand0';
      const img = this.sprite(r.look, pose), S = 2, w = img.width * S, h = img.height * S, feet = P.FEET * S;
      const tier = r.level >= 40 ? '#ff7ad8' : r.level >= 30 ? '#ffa040' : r.level >= 20 ? '#5ae0ff' : null;
      g.fillStyle = 'rgba(0,0,0,0.38)'; g.beginPath(); g.ellipse(x, y, 30, 8, 0, 0, Math.PI * 2); g.fill();
      if (tier && !dead) { const p = 0.5 + 0.2 * Math.sin(t * 3 + i); const gr = g.createRadialGradient(x, y - 4, 4, x, y - 4, 46); gr.addColorStop(0, hexA(tier, 0.55 * p)); gr.addColorStop(1, hexA(tier, 0)); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y - 4, 48, 16, 0, 0, Math.PI * 2); g.fill(); }
      const lunge = !dead && !walking && since < 0.25 && !RANGED[r.cls] ? 10 * Math.sin((since / 0.25) * Math.PI) : 0;
      const hurt = this.hurtAt[i] != null && t - this.hurtAt[i] < 0.12;
      g.save();
      if (dead) { g.globalAlpha = 0.55; g.translate(x, y - 12); g.scale(-1, 1); g.rotate(-Math.PI / 2); g.drawImage(img, -feet + 10, -w / 2 - 10, w, h); }
      else { if (hurt) g.filter = 'brightness(1.8) saturate(0.4)'; flipped(g, img, Math.round(x + lunge), Math.round(y - feet), w, h); }
      g.restore();
      if (snap && snap[4][i] > 0 && !dead) { g.strokeStyle = 'rgba(200,225,255,0.75)'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y - 70, 40, 82, 0, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(160,200,255,0.10)'; g.fill(); }
      const head = y - feet + (this.sprite(r.look, 'stand0')._top || 0) * S;
      if (!dead) bar(this.g, x - 26, head - 12, 52, hp / 1000, hp < 350 ? '#ff5a5a' : '#62e070');
      g.font = '13px ' + FONT; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = '#120812'; g.fillStyle = CLASS_COL[r.cls];
      g.strokeText(r.name, x, head - 18); g.fillText(r.name, x, head - 18);
    }
    drawEffects(t, dt) {
      const g = this.g;
      // meteors from Magma Rain
      this.meteors = this.meteors.filter((m) => t < m.t + m.life + 0.4);
      this.meteors.forEach((m) => {
        const k = (t - m.t) / m.life; if (k < 0) return;
        if (k < 1) { const x = m.x + 120 * (1 - k), y = -40 + (FLOOR + 10) * k; g.fillStyle = '#ff7a1a'; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffe080'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(255,140,40,0.5)'; g.lineWidth = 8; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 50, y - 160); g.stroke(); }
        else if (!m.boom) { m.boom = true; sfx('meteor'); this.burst(m.x, FLOOR, '#ff8a2a', 14, 260, -120); this.shake = Math.max(this.shake, 6); }
      });
      // projectiles
      this.projs = this.projs.filter((p) => {
        const k = (t - p.t) / p.dur;
        if (k >= 1) { p.done(); return false; }
        const x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * (p.kind === 'arrow' ? 50 : 20);
        if (p.kind === 'arrow') { const ang = Math.atan2(p.y1 - p.y0 - Math.cos(k * Math.PI) * 50 * Math.PI, p.x1 - p.x0); g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#e8dcc0'; g.fillRect(-22, -1.5, 26, 3); g.fillStyle = '#dfe6ec'; g.fillRect(4, -3.5, 7, 7); g.fillStyle = p.col; g.fillRect(-24, -4, 6, 8); g.restore(); }
        else { const r = p.kind === 'orb' ? 9 : 7; g.fillStyle = hexA(p.col, 0.35); g.beginPath(); g.arc(x, y, r * 2, 0, Math.PI * 2); g.fill(); g.fillStyle = p.col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill(); if (Math.random() < 0.6) this.parts.push({ x, y, vx: rand(-30, 30), vy: rand(-30, 30), col: p.col, t, life: 0.3, size: 3, grav: 0 }); }
        return true;
      });
      // heal beams and ultimate pillars
      this.beams = this.beams.filter((b) => t < b.t + b.life);
      this.beams.forEach((b) => {
        const k = (t - b.t) / b.life, a = Math.sin(k * Math.PI);
        const gr = g.createLinearGradient(0, b.pillar ? 0 : b.y - 180, 0, b.y);
        gr.addColorStop(0, hexA(b.col, 0)); gr.addColorStop(1, hexA(b.col, 0.55 * a));
        g.fillStyle = gr; g.fillRect(b.x - b.w / 2, b.pillar ? 0 : b.y - 180, b.w, b.pillar ? b.y : 180);
        if (b.pillar) { g.fillStyle = hexA('#ffffff', 0.5 * a); g.fillRect(b.x - b.w / 6, 0, b.w / 3, b.y); }
      });
      // rings, slashes and target markers
      this.rings = this.rings.filter((r) => t < r.t + r.life);
      this.rings.forEach((r) => {
        const k = (t - r.t) / r.life; if (k < 0) return; g.strokeStyle = hexA(r.col, 1 - k); g.lineWidth = r.w * (1 - k * 0.5);
        g.beginPath();
        if (r.slash) { g.save(); g.translate(r.x, r.y); g.rotate(r.a); g.arc(0, 0, r.r * (0.6 + k * 0.6), -2.2, -0.6); g.restore(); }
        else if (r.flat) g.ellipse(r.x, r.y, r.r * k, r.r * k * 0.12, 0, 0, Math.PI * 2);
        else if (r.target) { const rr = r.r * (1.2 - 0.4 * Math.min(1, k * 2)); g.arc(r.x, r.y, rr, 0, Math.PI * 2); g.moveTo(r.x - rr - 10, r.y); g.lineTo(r.x - rr + 14, r.y); g.moveTo(r.x + rr - 14, r.y); g.lineTo(r.x + rr + 10, r.y); }
        else g.arc(r.x, r.y, r.r * ease(k), 0, Math.PI * 2);
        g.stroke();
      });
      // particles
      this.parts = this.parts.filter((p) => t < p.t + p.life);
      this.parts.forEach((p) => { p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; const a = 1 - (t - p.t) / p.life; g.globalAlpha = a; g.fillStyle = p.col; if (p.coin) { g.fillRect(p.x - 4, p.y - 4, 8, 8); g.fillStyle = '#fff4c0'; g.fillRect(p.x - 2, p.y - 3, 2, 2); } else g.fillRect(p.x, p.y, p.size, p.size); });
      g.globalAlpha = 1;
      // skill callouts above heads
      this.callouts = this.callouts.filter((c) => t < c.t + c.life);
      g.textAlign = 'center';
      this.callouts.forEach((c) => { const k = (t - c.t) / c.life; g.globalAlpha = 1 - k * k; g.font = '17px ' + FONT; g.lineWidth = 4; g.strokeStyle = '#120812'; g.strokeText(c.text, c.x, c.y - k * 20); g.fillStyle = c.col; g.fillText(c.text, c.x, c.y - k * 20); });
      g.globalAlpha = 1;
      // damage and heal numbers
      this.nums = this.nums.filter((n) => t < n.t + n.life);
      this.nums.forEach((n) => {
        const k = (t - n.t) / n.life, pop = k < 0.12 ? 1 + (0.12 - k) * 4 : 1;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = Math.round(n.size * pop) + 'px ' + FONT; g.lineWidth = Math.max(4, n.size / 5); g.strokeStyle = '#120812';
        const x = n.x + n.vx * k, y = n.y - 50 * ease(k);
        g.strokeText(n.text, x, y); g.fillStyle = n.col; g.fillText(n.text, x, y);
      });
      g.globalAlpha = 1;
      if (this.flash) { const k = (t - this.flash.t) / this.flash.life; if (k < 1) { g.fillStyle = hexA(this.flash.col, 0.28 * (1 - k)); g.fillRect(-20, -20, W + 40, H + 40); } else this.flash = null; }
    }
    drawHud(cur, simT, t) {
      const g = this.g, boss = Object.values(this.enemies).find((e) => e.kind === 'boss' && !e.dead);
      g.textAlign = 'left';
      // boss bar across the top, in segments of 10%
      if (boss) {
        const x = 200, y = 18, w = 560, h = 26, f = boss.hp / 1000;
        g.fillStyle = 'rgba(12,6,14,0.82)'; g.fillRect(x - 70, y - 8, w + 130, 70);
        g.font = '22px ' + FONT; g.fillStyle = '#ffd25a'; g.fillText('Lv ' + cur.dungeonLevel, x - 58, y + 21);
        g.fillStyle = '#2a1418'; g.fillRect(x, y, w, h);
        const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, this.enraged ? '#ff4a3a' : '#7a6aff'); gr.addColorStop(1, this.enraged ? '#a01a1a' : '#4a3ac0');
        g.fillStyle = gr; g.fillRect(x, y, w * f, h);
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w * f, 4);
        g.fillStyle = 'rgba(0,0,0,0.35)'; for (let k = 1; k < 10; k++) g.fillRect(x + (w * k) / 10, y, 2, h);
        g.strokeStyle = '#120812'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
        g.font = '17px ' + FONT; g.textAlign = 'center'; g.lineWidth = 4;
        const hpText = fmt((boss.max * boss.hp) / 1000) + ' / ' + fmt(boss.max);
        g.strokeText(hpText, x + w / 2, y + 19); g.fillStyle = '#ffffff'; g.fillText(hpText, x + w / 2, y + 19);
        const sub = boss.name + (t < this.mechUntil ? '  ·  ' + this.mechText : '') + (this.enraged ? '  ·  ENRAGED' : '');
        g.font = '16px ' + FONT; g.strokeText(sub, x + w / 2, y + 48); g.fillStyle = this.enraged || t < this.mechUntil ? '#ffb090' : '#efe7ff'; g.fillText(sub, x + w / 2, y + 48);
      }
      // left: where the group is
      g.textAlign = 'left'; g.font = '24px ' + FONT; g.lineWidth = 5; g.strokeStyle = '#120812';
      const where = this.walkFrom != null ? 'Moving on' : boss ? 'Boss fight' : this.label || '';
      g.strokeText(where, 22, boss ? 112 : 40); g.fillStyle = '#ffffff'; g.fillText(where, 22, boss ? 112 : 40);
      g.font = '16px ' + FONT;
      const lines = [ART.WINGS[this.wing || 0].name + ' · wing ' + ((this.wing || 0) + 1), 'Dungeon level ' + cur.dungeonLevel, 'Party DPS ' + fmt(this.dmgLog.reduce((s, d) => s + d[1], 0) / 10)];
      lines.forEach((l, k) => { const yy = (boss ? 136 : 64) + k * 21; g.strokeText(l, 22, yy); g.fillStyle = k === 2 ? '#ffd25a' : '#d8c8e8'; g.fillText(l, 22, yy); });
      // right: combo counter
      if (t - this.comboAt < 2.5 && this.combo >= 5) {
        g.textAlign = 'right'; g.font = '40px ' + FONT; g.lineWidth = 6; g.strokeText(String(this.combo), W - 24, boss ? 120 : 56); g.fillStyle = '#ffffff'; g.fillText(String(this.combo), W - 24, boss ? 120 : 56);
        g.font = '15px ' + FONT; g.lineWidth = 4; g.strokeText('HIT COMBO', W - 24, boss ? 140 : 76); g.fillStyle = '#ffd25a'; g.fillText('HIT COMBO', W - 24, boss ? 140 : 76);
      }
      // banner
      const b = this.banners[0];
      if (b) {
        const k = (t - b.t) / b.life;
        if (k >= 1) this.banners = [];
        else {
          const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1, s = k < 0.15 ? 1.3 - k * 2 : 1;
          g.globalAlpha = a; g.textAlign = 'center';
          g.fillStyle = 'rgba(12,6,14,0.6)'; g.fillRect(0, 205, W, 92);
          g.font = Math.round(46 * s) + 'px ' + FONT; g.lineWidth = 7; g.strokeText(b.text, W / 2, 255); g.fillStyle = b.col; g.fillText(b.text, W / 2, 255);
          if (b.sub) { g.font = '18px ' + FONT; g.lineWidth = 4; g.strokeText(b.sub, W / 2, 282); g.fillStyle = '#efe7ff'; g.fillText(b.sub, W / 2, 282); }
          g.globalAlpha = 1;
        }
      }
    }
  }

  // Art is drawn with heroes facing left and monsters facing right; the arena puts the party on the left, so both flip.
  function flipped(g, img, cx, top, w, h) { g.save(); g.translate(cx, 0); g.scale(-1, 1); g.drawImage(img, -w / 2, top, w, h); g.restore(); }
  function bar(g, x, y, w, f, col) {
    g.fillStyle = '#120812'; g.fillRect(x - 2, y - 2, w + 4, 10);
    g.fillStyle = '#3a1418'; g.fillRect(x, y, w, 6);
    g.fillStyle = col; g.fillRect(x, y, Math.round(w * Math.max(0, f)), 6);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, y, Math.round(w * Math.max(0, f)), 2);
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  window.ITArena = { Arena, W, H };
})();
