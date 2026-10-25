// Idle Teams sound: every effect is synthesised with Web Audio at play time, so there are no sound files to
// ship. window.ITS.play(name, opts) plays one effect, ITS.ambient() keeps the dungeon bed running while a
// battle is on screen, and a small speaker button toggles sound (remembered per browser).
(function () {
  'use strict';
  const S = (window.ITS = {});
  let ctx = null, master = null, fx = null, amb = null, ambNodes = null, lastAmb = 0;
  let muted = false;
  try { muted = localStorage.getItem('it-muted') === '1'; } catch (e) { /* private mode */ }
  const last = {};
  let voices = 0;

  function boot() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    // a gentle compressor keeps a big fight from clipping
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    fx = ctx.createGain(); fx.gain.value = 0.7; fx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0; amb.connect(master);
    return ctx;
  }
  // Browsers only start audio after a gesture, so the first tap or key wakes it.
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { boot(); if (ctx && ctx.state === 'suspended') ctx.resume(); }, { capture: true, passive: true }));

  // ---------------------------------------------------------------- building blocks

  const now = () => ctx.currentTime;
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  }
  // envelope on a gain node: quick attack, exponential decay
  function env(gain, t, peak, attack, decay) { gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(peak, t + attack); gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); }
  function tone({ type = 'sine', f0, f1, t = 0, dur = 0.2, vol = 0.3, attack = 0.005, filter, q = 1, dest = fx }) {
    const T = now() + t, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, T); if (f1) o.frequency.exponentialRampToValueAtTime(f1, T + dur);
    let out = o;
    if (filter) { const fl = ctx.createBiquadFilter(); fl.type = filter[0]; fl.frequency.value = filter[1]; fl.Q.value = q; o.connect(fl); out = fl; }
    out.connect(g).connect(dest); env(g, T, vol, attack, dur);
    o.start(T); o.stop(T + attack + dur + 0.05);
  }
  function hiss({ t = 0, dur = 0.15, vol = 0.3, type = 'bandpass', f0 = 1200, f1, q = 1, attack = 0.004, dest = fx }) {
    const T = now() + t, s = noise(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, T); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, T + dur);
    s.connect(fl).connect(g).connect(dest); env(g, T, vol, attack, dur);
    s.start(T, Math.random()); s.stop(T + attack + dur + 0.05);
  }
  const vary = (x, k = 0.08) => x * (1 + (Math.random() * 2 - 1) * k);

  // ---------------------------------------------------------------- the effects

  const SFX = {
    // melee hit: a thump under a short crack
    hit: (o) => { tone({ type: 'triangle', f0: vary(150), f1: 60, dur: 0.09, vol: 0.28 * (o.vol || 1) }); hiss({ dur: 0.05, vol: 0.18 * (o.vol || 1), f0: vary(2400), q: 0.8 }); },
    crit: () => { tone({ type: 'square', f0: vary(220), f1: 70, dur: 0.12, vol: 0.2, filter: ['lowpass', 1800] }); hiss({ dur: 0.08, vol: 0.28, f0: 3200, f1: 1200, q: 1.2 }); tone({ f0: 1320, dur: 0.12, vol: 0.06, t: 0.02 }); },
    mega: () => { tone({ type: 'sawtooth', f0: 90, f1: 35, dur: 0.5, vol: 0.35, filter: ['lowpass', 900] }); hiss({ dur: 0.45, vol: 0.3, type: 'lowpass', f0: 3000, f1: 200 }); [880, 1320, 1760].forEach((f, k) => tone({ f0: f, dur: 0.4, vol: 0.05, t: 0.05 + k * 0.04 })); },
    dot: () => hiss({ dur: 0.12, vol: 0.08, type: 'highpass', f0: 2500 }),
    // ranged attacks: whoosh for arrows, zaps for spells
    arrow: () => hiss({ dur: 0.18, vol: 0.12, f0: 900, f1: 3500, q: 2 }),
    orb: () => tone({ type: 'sine', f0: vary(520), f1: 880, dur: 0.18, vol: 0.09 }),
    spark: () => { tone({ type: 'triangle', f0: vary(1200), f1: 1800, dur: 0.12, vol: 0.06 }); },
    leaf: () => hiss({ dur: 0.16, vol: 0.08, f0: 1600, f1: 700, q: 3 }),
    heal: () => [523, 659, 784].forEach((f, k) => tone({ f0: vary(f, 0.01), dur: 0.22, vol: 0.05, t: k * 0.05, attack: 0.02 })),
    shield: () => { tone({ f0: 1046, dur: 0.35, vol: 0.06, attack: 0.01 }); tone({ f0: 1568, dur: 0.3, vol: 0.04, t: 0.03 }); },
    hurt: (o) => { tone({ type: 'sine', f0: vary(110), f1: 45, dur: 0.14, vol: 0.25 * (o.big ? 1.6 : 1) }); hiss({ dur: 0.07, vol: 0.12, type: 'lowpass', f0: 900 }); },
    block: () => { tone({ type: 'square', f0: vary(620), f1: 480, dur: 0.12, vol: 0.08, filter: ['bandpass', 1400], q: 6 }); hiss({ dur: 0.06, vol: 0.14, f0: 4000, q: 3 }); },
    dodge: () => hiss({ dur: 0.14, vol: 0.08, f0: 2400, f1: 900, q: 1.5 }),
    cast: () => tone({ type: 'sine', f0: 392, f1: 784, dur: 0.16, vol: 0.06 }),
    ultimate: () => { [262, 330, 392, 523].forEach((f, k) => tone({ type: 'sawtooth', f0: f, dur: 1.1, vol: 0.05, attack: 0.25, t: k * 0.02, filter: ['lowpass', 1600] })); hiss({ dur: 0.9, vol: 0.12, f0: 400, f1: 5000, q: 0.7, attack: 0.3 }); },
    death: () => { tone({ type: 'triangle', f0: 392, f1: 98, dur: 0.6, vol: 0.14 }); tone({ type: 'triangle', f0: 311, f1: 78, dur: 0.6, vol: 0.1, t: 0.08 }); },
    revive: () => [392, 523, 659, 784].forEach((f, k) => tone({ f0: f, dur: 0.3, vol: 0.06, t: k * 0.07, attack: 0.02 })),
    kill: () => { tone({ type: 'square', f0: 660, f1: 990, dur: 0.08, vol: 0.05, filter: ['lowpass', 2500] }); hiss({ dur: 0.18, vol: 0.12, type: 'lowpass', f0: 1800, f1: 300 }); },
    // the boss arrives: a low drum and a horn
    boss: () => { tone({ type: 'sine', f0: 70, f1: 40, dur: 0.6, vol: 0.4 }); hiss({ dur: 0.3, vol: 0.15, type: 'lowpass', f0: 400 }); [[147, 0.15], [220, 0.15]].forEach(([f, t]) => tone({ type: 'sawtooth', f0: f, dur: 0.9, vol: 0.07, t, attack: 0.08, filter: ['lowpass', 900] })); },
    pack: () => { tone({ type: 'sine', f0: 90, f1: 50, dur: 0.3, vol: 0.25 }); tone({ type: 'sine', f0: 90, f1: 50, dur: 0.3, vol: 0.2, t: 0.18 }); },
    bossDown: () => { [523, 659, 784, 1046].forEach((f, k) => tone({ type: 'square', f0: f, dur: 0.25, vol: 0.05, t: k * 0.09, filter: ['lowpass', 3000] })); SFX.coins(); },
    magma: () => { hiss({ dur: 1.4, vol: 0.22, type: 'lowpass', f0: 500, f1: 150, attack: 0.2 }); tone({ type: 'sawtooth', f0: 55, dur: 1.2, vol: 0.08, attack: 0.2, filter: ['lowpass', 200] }); },
    meteor: () => { hiss({ dur: 0.25, vol: 0.14, type: 'lowpass', f0: 1400, f1: 200 }); tone({ f0: vary(80), f1: 40, dur: 0.2, vol: 0.18 }); },
    shockwave: () => { tone({ type: 'sine', f0: 60, f1: 28, dur: 0.8, vol: 0.45 }); hiss({ dur: 0.6, vol: 0.2, type: 'lowpass', f0: 1200, f1: 100 }); },
    buster: () => [0, 0.18, 0.36].forEach((t) => tone({ type: 'square', f0: 880, dur: 0.1, vol: 0.05, t, filter: ['lowpass', 2000] })),
    enrage: () => { tone({ type: 'sawtooth', f0: 60, f1: 180, dur: 1.2, vol: 0.12, filter: ['lowpass', 700], attack: 0.1 }); hiss({ dur: 1, vol: 0.12, type: 'bandpass', f0: 300, f1: 900, q: 2 }); },
    curse: () => { tone({ type: 'sine', f0: 466, f1: 233, dur: 0.6, vol: 0.06 }); tone({ type: 'sine', f0: 494, f1: 247, dur: 0.6, vol: 0.05 }); },
    shards: () => [1760, 2093, 2637].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 0.2, vol: 0.04, t: k * 0.05 })),
    // interface
    click: () => tone({ type: 'square', f0: 1200, f1: 900, dur: 0.035, vol: 0.035, filter: ['lowpass', 3000] }),
    coins: () => [1568, 2093, 2637, 2093, 3136].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 0.12, vol: 0.05, t: k * 0.05 })),
    good: () => [659, 988].forEach((f, k) => tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.06, t: k * 0.07 })),
    bad: () => tone({ type: 'square', f0: 180, f1: 140, dur: 0.18, vol: 0.05, filter: ['lowpass', 900] }),
    levelup: () => [523, 659, 784, 1046, 784, 1046].forEach((f, k) => tone({ type: 'square', f0: f, dur: 0.18, vol: 0.05, t: k * 0.08, filter: ['lowpass', 3200] })),
  };
  // how often each effect may fire, so a burst of hits stays readable
  const GAP = { hit: 0.045, crit: 0.06, dot: 0.12, arrow: 0.06, orb: 0.06, spark: 0.06, leaf: 0.06, heal: 0.1, hurt: 0.06, block: 0.08, dodge: 0.1, shield: 0.15, cast: 0.12, meteor: 0.08, click: 0.03 };

  S.play = (name, opts = {}) => {
    if (muted || !SFX[name] || !boot() || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - (last[name] || -9) < (GAP[name] || 0.05)) return;
    if (voices > 24) return;
    last[name] = t; voices++; setTimeout(() => voices--, 400);
    try { SFX[name](opts); } catch (e) { /* a bad node graph never breaks the game */ }
  };

  // ---------------------------------------------------------------- ambient bed

  // A low drone, wind through the halls and the odd drip. The arena calls ambient() every frame; when the
  // calls stop (another screen), the bed fades out.
  function startBed() {
    const d1 = ctx.createOscillator(), d2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), dg = ctx.createGain();
    d1.type = d2.type = 'sawtooth'; d1.frequency.value = 55; d2.frequency.value = 55.6; lp.type = 'lowpass'; lp.frequency.value = 160; dg.gain.value = 0.05;
    d1.connect(lp); d2.connect(lp); lp.connect(dg).connect(amb); d1.start(); d2.start();
    const wind = noise(), wf = ctx.createBiquadFilter(), wg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6; wg.gain.value = 0.035; lfo.frequency.value = 0.07; lg.gain.value = 260;
    lfo.connect(lg).connect(wf.frequency); wind.connect(wf).connect(wg).connect(amb); wind.start(); lfo.start();
    ambNodes = { stop: () => [d1, d2, wind, lfo].forEach((n) => { try { n.stop(); } catch (e) { /* already stopped */ } }) };
    const drip = () => { if (!ambNodes) return; if (amb.gain.value > 0.05) tone({ f0: 1400 + Math.random() * 900, f1: 600, dur: 0.12, vol: 0.03, dest: amb }); setTimeout(drip, 2500 + Math.random() * 6000); };
    setTimeout(drip, 3000);
  }
  S.ambient = () => {
    lastAmb = performance.now();
    if (muted || !ctx || ctx.state !== 'running') return;
    if (!ambNodes) startBed();
    if (amb.gain.value < 0.01) amb.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
  };
  setInterval(() => { if (ctx && amb && performance.now() - lastAmb > 1200 && amb.gain.value > 0.001) amb.gain.setTargetAtTime(0, ctx.currentTime, 0.6); }, 500);

  // ---------------------------------------------------------------- mute toggle and interface hooks

  S.muted = () => muted;
  S.setMuted = (m) => {
    muted = !!m;
    try { localStorage.setItem('it-muted', muted ? '1' : '0'); } catch (e) { /* private mode */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
    const b = document.getElementById('sfx-toggle'); if (b) { b.textContent = muted ? '🔇' : '🔊'; b.title = muted ? 'Sound off' : 'Sound on'; b.setAttribute('aria-pressed', String(!muted)); }
  };
  function mountToggle() {
    if (document.getElementById('sfx-toggle')) return;
    const b = document.createElement('button');
    b.id = 'sfx-toggle'; b.className = 'sfx-toggle small'; b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); boot(); if (ctx && ctx.state === 'suspended') ctx.resume(); S.setMuted(!muted); if (!muted) S.play('click'); });
    document.body.appendChild(b); S.setMuted(muted);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToggle); else mountToggle();
  // every button and nav link clicks
  document.addEventListener('click', (e) => { const el = e.target.closest && e.target.closest('button, .nav a, .choice, .race, .tile'); if (el && el.id !== 'sfx-toggle' && !el.disabled) S.play('click'); }, true);
  // toasts: a chime for good news, a buzz for errors, a fanfare for a level up
  const watch = () => {
    const t = document.getElementById('toast'); if (!t) return;
    new MutationObserver(() => { if (t.hidden) return; const txt = t.textContent || ''; S.play(/level/i.test(txt) && t.classList.contains('ok') ? 'levelup' : t.classList.contains('ok') ? 'good' : 'bad'); }).observe(t, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
