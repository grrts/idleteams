// Idle Teams audio: sound effects and music, all synthesised with Web Audio at play time, so there are no
// audio files to ship. ITS.play(name, opts) fires one effect (opts.pan -1..1 places it left or right),
// ITS.scene('town' | 'battle' | 'boss') picks the music (the arena calls it every frame; without calls the
// tavern theme plays), and two buttons toggle music and sound, remembered per browser.
(function () {
  'use strict';
  const S = (window.ITS = {});
  let ctx = null, out = null, fxBus = null, musicBus = null, verb = null, verbSend = null, crush = null;
  const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } };
  let sfxOn = pref('it-sfx', true), musicOn = pref('it-music', true);
  const SFX_VOL = 0.75, MUSIC_VOL = 0.42;

  // ---------------------------------------------------------------- engine

  function boot() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // master: gentle glue compression, then a limiter so a boss fight never clips
    const glue = ctx.createDynamicsCompressor(); glue.threshold.value = -20; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -6; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
    out = ctx.createGain(); out.gain.value = 1;
    const trim = ctx.createGain(); trim.gain.value = 0.85;
    out.connect(glue).connect(lim).connect(trim).connect(ctx.destination);
    // a hall reverb from a generated impulse: decaying stereo noise, darker as it fades
    verb = ctx.createConvolver(); verb.buffer = impulse(2.6, 2.4);
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.55; verb.connect(verbOut).connect(out);
    verbSend = ctx.createGain(); verbSend.gain.value = 1; verbSend.connect(verb);
    fxBus = ctx.createGain(); fxBus.gain.value = sfxOn ? SFX_VOL : 0; fxBus.connect(out);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0; musicBus.connect(out);
    const mVerb = ctx.createGain(); mVerb.gain.value = 0.35; musicBus.connect(mVerb).connect(verbSend);
    // saturation for impacts and the boss bass
    crush = ctx.createWaveShaper(); crush.curve = drive(6); crush.oversample = '2x';
    return ctx;
  }
  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const k = i / n; lp += (Math.random() * 2 - 1 - lp) * (0.9 - 0.7 * k); d[i] = lp * Math.pow(1 - k, decay); } }
    return b;
  }
  function drive(k) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); } return c; }
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { boot(); if (ctx && ctx.state === 'suspended') ctx.resume(); }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });

  const T0 = () => ctx.currentTime;
  let noiseBuf = null;
  function noiseSrc() {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // an output chain for one sound: gain envelope -> pan -> bus, with an optional reverb send
  function chain(t, { bus, pan = 0, wet = 0.15, dist = false }) {
    const g = ctx.createGain(); g.gain.value = 0;
    let node = g;
    if (dist) { const ws = ctx.createWaveShaper(); ws.curve = crush.curve; g.connect(ws); node = ws; }
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
    node.connect(bus);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; node.connect(s).connect(verbSend); }
    return g;
  }
  function adsr(param, t, peak, a, d, s, r, len) {
    param.cancelScheduledValues(t); param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t + a + d);
    const end = Math.max(t + a + d, t + len);
    param.setValueAtTime(Math.max(0.0002, peak * s), end);
    param.exponentialRampToValueAtTime(0.0001, end + r);
    return end + r;
  }
  // oscillator voice with optional pitch glide, filter envelope and vibrato
  function osc(t, o) {
    const { type = 'sine', f, f2, glide = 0.1, vol = 0.3, a = 0.003, d = 0.1, s = 0.0001, r = 0.05, len = 0, bus = fxBus, pan, wet, dist, filter, detune = 0, vib } = o;
    const g = chain(t, { bus, pan, wet, dist }), v = ctx.createOscillator();
    v.type = type; v.frequency.setValueAtTime(f, t); v.detune.value = detune;
    if (f2) v.frequency.exponentialRampToValueAtTime(f2, t + glide);
    let src = v;
    if (filter) {
      const fl = ctx.createBiquadFilter(); fl.type = filter.type || 'lowpass'; fl.Q.value = filter.q || 0.8;
      fl.frequency.setValueAtTime(filter.f, t); if (filter.f2) fl.frequency.exponentialRampToValueAtTime(filter.f2, t + (filter.t || 0.2));
      v.connect(fl); src = fl;
    }
    if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vib.rate || 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vib.depth || 6, t + (vib.delay || 0.2)); l.connect(lg).connect(v.detune); l.start(t); l.stop(t + len + r + d + a + 0.5); }
    src.connect(g);
    const end = adsr(g.gain, t, vol, a, d, s, r, len);
    v.start(t); v.stop(end + 0.05);
    return v;
  }
  function noise(t, o) {
    const { vol = 0.3, a = 0.002, d = 0.1, s = 0.0001, r = 0.05, len = 0, type = 'bandpass', f = 1500, f2, ft = 0.2, q = 1, bus = fxBus, pan, wet, dist } = o;
    const g = chain(t, { bus, pan, wet, dist }), n = noiseSrc(), fl = ctx.createBiquadFilter();
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + ft);
    n.connect(fl).connect(g);
    const end = adsr(g.gain, t, vol, a, d, s, r, len);
    n.start(t, Math.random()); n.stop(end + 0.05);
  }
  // FM bell: carrier plus a modulator at a non-integer ratio, the index falling away
  function bell(t, o) {
    const { f, ratio = 3.5, index = 3, vol = 0.12, d = 1.2, bus = fxBus, pan, wet = 0.35 } = o;
    const g = chain(t, { bus, pan, wet }), c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain();
    c.frequency.value = f; m.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + d);
    m.connect(mg).connect(c.frequency); c.connect(g);
    const end = adsr(g.gain, t, vol, 0.002, d, 0.0001, 0.05, 0);
    c.start(t); m.start(t); c.stop(end + 0.05); m.stop(end + 0.05);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------- sound effects

  // Building blocks every impact shares: a fast whoosh, a low body, a crack and a short ring.
  const thump = (t, f, vol, pan, len = 0.14) => osc(t, { type: 'sine', f, f2: f * 0.3, glide: len, vol, d: len, pan, wet: 0.08 });
  const crack = (t, vol, pan, f = 2500) => noise(t, { vol, d: 0.05, type: 'highpass', f, q: 0.7, pan, dist: true, wet: 0.1 });
  const whoosh = (t, vol, pan, f = 700, f2 = 3200, d = 0.11) => noise(t, { vol, a: d * 0.6, d: d * 0.4, type: 'bandpass', f, f2, ft: d, q: 1.6, pan, wet: 0.05 });
  const ring = (t, f, vol, pan, d = 0.25) => [1, 2.76, 5.4].forEach((k, i) => osc(t, { type: 'sine', f: f * k, vol: vol / (i + 1), d: d / (i * 0.5 + 1), pan, wet: 0.2 }));
  const SFX = {
    hit: (t, o) => { const p = o.pan; whoosh(t, 0.16, p); thump(t + 0.03, rnd(140, 170), 0.55, p); crack(t + 0.03, 0.32, p); ring(t + 0.03, rnd(1700, 2100), 0.03, p, 0.12); },
    crit: (t, o) => { const p = o.pan; whoosh(t, 0.22, p, 900, 4200); thump(t + 0.03, 190, 0.75, p, 0.2); crack(t + 0.03, 0.5, p, 1800); ring(t + 0.03, 1320, 0.07, p, 0.35); [76, 79, 83].forEach((m) => osc(t + 0.05, { type: 'triangle', f: mtof(m), vol: 0.05, d: 0.35, pan: p, wet: 0.4 })); },
    mega: (t, o) => {
      const p = o.pan;
      noise(t, { vol: 0.25, a: 0.25, d: 0.02, type: 'highpass', f: 400, f2: 6000, ft: 0.27, wet: 0.2 });
      const h = t + 0.27;
      osc(h, { type: 'sine', f: 110, f2: 28, glide: 0.9, vol: 1, d: 0.9, wet: 0.2 });
      noise(h, { vol: 0.7, d: 0.9, type: 'lowpass', f: 5000, f2: 160, ft: 0.8, dist: true, pan: p, wet: 0.5 });
      for (let k = 0; k < 10; k++) crack(h + rnd(0.05, 0.6), rnd(0.05, 0.15), rnd(-0.8, 0.8), 3000);
      [64, 71, 76].forEach((m) => osc(h, { type: 'sawtooth', f: mtof(m), vol: 0.05, a: 0.01, d: 0.9, filter: { f: 4000, f2: 600, t: 0.8 }, wet: 0.6 }));
    },
    dot: (t, o) => noise(t, { vol: 0.12, d: 0.14, type: 'bandpass', f: 1800, f2: 700, q: 2, pan: o.pan, wet: 0.1 }),
    arrow: (t, o) => { osc(t, { type: 'sawtooth', f: 330, f2: 220, glide: 0.08, vol: 0.12, d: 0.12, filter: { f: 2400, f2: 500, t: 0.1 }, pan: o.pan }); whoosh(t + 0.02, 0.2, o.pan, 1200, 5000, 0.16); },
    orb: (t, o) => { const c = osc(t, { type: 'sine', f: 520, f2: 980, glide: 0.2, vol: 0.14, a: 0.01, d: 0.22, pan: o.pan, wet: 0.35 }); bell(t, { f: 1046, ratio: 2.01, index: 2, vol: 0.05, d: 0.3, pan: o.pan }); noise(t, { vol: 0.08, a: 0.05, d: 0.15, type: 'highpass', f: 5000, pan: o.pan }); return c; },
    spark: (t, o) => { bell(t, { f: rnd(1300, 1600), ratio: 3.01, index: 2.5, vol: 0.08, d: 0.35, pan: o.pan }); noise(t, { vol: 0.06, d: 0.1, type: 'highpass', f: 6000, pan: o.pan }); },
    leaf: (t, o) => { whoosh(t, 0.14, o.pan, 600, 2400, 0.18); osc(t + 0.1, { type: 'triangle', f: 700, f2: 400, glide: 0.06, vol: 0.08, d: 0.08, pan: o.pan }); },
    heal: (t, o) => [84, 88, 91, 96].forEach((m, k) => bell(t + k * 0.06, { f: mtof(m), ratio: 2, index: 1.2, vol: 0.06, d: 0.9, pan: o.pan, wet: 0.5 })),
    shield: (t, o) => { [2093, 2637, 3322, 3951].forEach((f, k) => osc(t + k * 0.02, { type: 'sine', f, vol: 0.04, a: 0.01, d: 0.9, pan: o.pan, wet: 0.6 })); noise(t, { vol: 0.08, a: 0.05, d: 0.4, type: 'highpass', f: 7000, pan: o.pan, wet: 0.5 }); },
    hurt: (t, o) => { const big = o.big ? 1.5 : 1; thump(t, 120, 0.5 * big, o.pan, 0.18); noise(t, { vol: 0.25 * big, d: 0.12, type: 'lowpass', f: 1400, f2: 300, pan: o.pan, dist: true }); osc(t, { type: 'sawtooth', f: 150, f2: 95, glide: 0.15, vol: 0.06 * big, d: 0.15, filter: { type: 'bandpass', f: 650, q: 3 }, pan: o.pan }); },
    block: (t, o) => { [1, 2.76, 5.4, 8.93].forEach((k, i) => osc(t, { type: i ? 'sine' : 'square', f: 420 * k, vol: 0.09 / (i + 1), d: 0.5 / (i * 0.4 + 1), pan: o.pan, wet: 0.3 })); crack(t, 0.35, o.pan, 3000); thump(t, 200, 0.3, o.pan, 0.08); },
    dodge: (t, o) => whoosh(t, 0.22, o.pan, 2600, 700, 0.16),
    cast: (t, o) => { osc(t, { type: 'sine', f: 400, f2: 1200, glide: 0.25, vol: 0.08, a: 0.05, d: 0.25, pan: o.pan, wet: 0.4 }); bell(t + 0.2, { f: 1568, vol: 0.05, d: 0.4, pan: o.pan }); },
    ultimate: (t) => {
      noise(t, { vol: 0.3, a: 0.7, d: 0.05, type: 'bandpass', f: 300, f2: 5000, ft: 0.75, q: 1.2, wet: 0.4 });
      [48, 55, 60, 64, 67].forEach((m) => osc(t, { type: 'sawtooth', f: mtof(m), vol: 0.05, a: 0.7, d: 0.05, filter: { f: 300, f2: 3000, t: 0.75 }, wet: 0.4 }));
      const h = t + 0.75;
      osc(h, { type: 'sine', f: 90, f2: 35, glide: 0.6, vol: 0.9, d: 0.6, wet: 0.3 });
      noise(h, { vol: 0.4, d: 0.6, type: 'lowpass', f: 6000, f2: 300, ft: 0.5, dist: true, wet: 0.6 });
      [60, 64, 67, 72].forEach((m) => osc(h, { type: 'sawtooth', f: mtof(m), vol: 0.05, a: 0.02, d: 1.4, len: 0.3, filter: { f: 2500, f2: 900, t: 1 }, vib: { depth: 8 }, wet: 0.7 }));
    },
    death: (t, o) => { thump(t, 90, 0.5, o.pan, 0.3); [67, 63, 60].forEach((m, k) => osc(t + k * 0.12, { type: 'triangle', f: mtof(m), f2: mtof(m - 1), glide: 0.3, vol: 0.08, d: 0.5, pan: o.pan, wet: 0.5 })); },
    revive: (t, o) => [60, 64, 67, 72, 76].forEach((m, k) => osc(t + k * 0.06, { type: 'sawtooth', f: mtof(m), vol: 0.035, a: 0.15, d: 1, filter: { type: 'bandpass', f: 900, q: 1.5 }, vib: { depth: 7 }, pan: o.pan, wet: 0.8 })),
    kill: (t, o) => { noise(t, { vol: 0.35, d: 0.18, type: 'lowpass', f: 3000, f2: 250, pan: o.pan, dist: true, wet: 0.2 }); osc(t, { type: 'square', f: 380, f2: 880, glide: 0.07, vol: 0.06, d: 0.08, filter: { f: 2500 }, pan: o.pan }); thump(t, 160, 0.35, o.pan, 0.12); },
    boss: (t) => {
      // gong: inharmonic partials with a long tail, a war drum and a low brass stab
      [1, 1.47, 2.09, 2.56, 3.1, 4.18].forEach((k, i) => osc(t, { type: 'sine', f: 82 * k, vol: 0.12 / (i * 0.6 + 1), a: 0.01, d: 3 - i * 0.3, wet: 0.6 }));
      noise(t, { vol: 0.25, d: 0.5, type: 'lowpass', f: 900, wet: 0.5 });
      [0, 0.32, 0.48].forEach((dt) => thump(t + dt, 100, 0.7, 0, 0.35));
      [36, 43, 48].forEach((m) => osc(t + 0.32, { type: 'sawtooth', f: mtof(m), vol: 0.09, a: 0.03, d: 0.8, filter: { f: 300, f2: 1600, t: 0.1 }, wet: 0.5 }));
    },
    pack: (t) => [0, 0.16, 0.48].forEach((dt, k) => { thump(t + dt, k === 2 ? 80 : 110, 0.6, k % 2 ? 0.3 : -0.3, 0.3); noise(t + dt, { vol: 0.12, d: 0.12, type: 'lowpass', f: 700 }); }),
    bossDown: (t) => {
      [[60, 0], [64, 0.12], [67, 0.24], [72, 0.36], [67, 0.6], [72, 0.72]].forEach(([m, dt], k) => [0, 12].forEach((o) => osc(t + dt, { type: 'sawtooth', f: mtof(m + o), vol: k > 3 ? 0.06 : 0.045, a: 0.02, d: k === 5 ? 1.2 : 0.18, filter: { f: 800, f2: 3000, t: 0.08 }, wet: 0.5 })));
      thump(t, 70, 0.8, 0, 0.5); SFX.coins(t + 0.8, {});
    },
    magma: (t) => { noise(t, { vol: 0.4, a: 0.3, d: 1.6, type: 'lowpass', f: 400, f2: 120, ft: 1.6, dist: true, wet: 0.4 }); for (let k = 0; k < 10; k++) osc(t + rnd(0, 1.4), { type: 'sine', f: rnd(120, 260), f2: rnd(300, 500), glide: 0.06, vol: 0.06, d: 0.08 }); },
    meteor: (t, o) => { osc(t, { type: 'sine', f: 1400, f2: 300, glide: 0.25, vol: 0.05, d: 0.25, pan: o.pan }); thump(t + 0.22, 90, 0.6, o.pan, 0.3); noise(t + 0.22, { vol: 0.35, d: 0.35, type: 'lowpass', f: 3000, f2: 200, pan: o.pan, dist: true, wet: 0.4 }); },
    shockwave: (t) => { osc(t, { type: 'sine', f: 70, f2: 24, glide: 1, vol: 1, d: 1.1, wet: 0.3 }); noise(t, { vol: 0.45, d: 0.9, type: 'lowpass', f: 2500, f2: 80, ft: 0.9, dist: true, wet: 0.6 }); },
    buster: (t) => { [0, 0.2, 0.4].forEach((dt) => osc(t + dt, { type: 'square', f: 988, vol: 0.06, d: 0.12, filter: { f: 3000 } })); osc(t, { type: 'sawtooth', f: 110, f2: 440, glide: 0.6, vol: 0.06, a: 0.1, d: 0.5, filter: { f: 600, f2: 2400, t: 0.6 } }); },
    enrage: (t) => { osc(t, { type: 'sawtooth', f: 55, f2: 130, glide: 1, vol: 0.25, a: 0.1, d: 1.1, dist: true, filter: { f: 300, f2: 1200, t: 1 }, vib: { rate: 9, depth: 40, delay: 0.1 }, wet: 0.4 }); noise(t, { vol: 0.3, a: 0.3, d: 0.9, type: 'bandpass', f: 250, f2: 900, ft: 1, q: 2.5, dist: true, wet: 0.5 }); },
    curse: (t, o) => [61, 62, 66, 67].forEach((m) => osc(t, { type: 'sine', f: mtof(m), f2: mtof(m - 5), glide: 0.9, vol: 0.05, a: 0.15, d: 0.9, vib: { rate: 7, depth: 30, delay: 0.1 }, pan: o.pan, wet: 0.8 })),
    shards: (t) => [88, 91, 95, 100, 96].forEach((m, k) => bell(t + k * 0.05, { f: mtof(m), ratio: 4.1, index: 2, vol: 0.05, d: 0.5, pan: rnd(-0.6, 0.6) })),
    // interface
    click: (t) => { osc(t, { type: 'sine', f: 1100, f2: 650, glide: 0.03, vol: 0.12, d: 0.04, wet: 0.02 }); noise(t, { vol: 0.05, d: 0.015, type: 'highpass', f: 4000, wet: 0 }); },
    coins: (t) => [88, 93, 96, 100, 96, 105].forEach((m, k) => bell(t + k * 0.055, { f: mtof(m), ratio: 1.41, index: 1.5, vol: 0.06, d: 0.4, pan: rnd(-0.5, 0.5) })),
    good: (t) => [79, 84, 88].forEach((m, k) => bell(t + k * 0.07, { f: mtof(m), ratio: 2, index: 1, vol: 0.07, d: 0.5 })),
    bad: (t) => osc(t, { type: 'square', f: 140, f2: 110, glide: 0.2, vol: 0.08, d: 0.22, filter: { f: 900 } }),
    levelup: (t) => { [60, 64, 67, 72, 76, 79, 84].forEach((m, k) => osc(t + k * 0.07, { type: 'square', f: mtof(m), vol: 0.05, d: 0.25, filter: { f: 3500 }, wet: 0.4 })); [72, 76, 79, 84].forEach((m) => osc(t + 0.5, { type: 'sawtooth', f: mtof(m), vol: 0.04, a: 0.05, d: 1.4, filter: { f: 2500, f2: 900, t: 1.2 }, vib: { depth: 8 }, wet: 0.7 })); noise(t + 0.5, { vol: 0.08, a: 0.1, d: 1, type: 'highpass', f: 7000, wet: 0.6 }); },
  };
  const GAP = { hit: 0.05, crit: 0.07, mega: 0.2, dot: 0.15, arrow: 0.07, orb: 0.08, spark: 0.08, leaf: 0.08, heal: 0.18, hurt: 0.07, block: 0.1, dodge: 0.12, shield: 0.25, cast: 0.15, meteor: 0.07, click: 0.03, kill: 0.08 };
  const last = {};
  let voices = 0;
  S.play = (name, opts = {}) => {
    if (!sfxOn || !SFX[name] || !boot() || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - (last[name] ?? -9) < (GAP[name] || 0.05)) return;
    if (voices > 18) return;
    last[name] = t; voices++; setTimeout(() => voices--, 350);
    try { SFX[name](t + 0.01, opts); } catch (e) { /* a bad node graph never breaks the game */ }
  };

  // ---------------------------------------------------------------- instruments for the music

  const INST = {
    // plucked lute: bright saw through a closing filter, plus a soft octave
    lute: (t, m, len, v) => { osc(t, { type: 'sawtooth', f: mtof(m), vol: 0.09 * v, d: 0.5, filter: { f: 3500, f2: 500, t: 0.3 }, bus: musicBus, wet: 0.2, pan: -0.25 }); osc(t, { type: 'triangle', f: mtof(m + 12), vol: 0.03 * v, d: 0.25, bus: musicBus, wet: 0.2, pan: -0.25 }); },
    // harp: a soft plucked tone with a warm body and a short shimmer, played an octave below the written line
    harp: (t, m, len, v) => { const f = mtof(m - 12); osc(t, { type: 'triangle', f, vol: 0.12 * v, a: 0.004, d: Math.min(1.4, len + 0.6), filter: { f: 2600, f2: 700, t: 0.6 }, bus: musicBus, wet: 0.4, pan: 0.2 }); osc(t, { type: 'sine', f: f * 2, vol: 0.035 * v, a: 0.004, d: 0.5, bus: musicBus, wet: 0.45, pan: 0.2 }); osc(t, { type: 'sine', f: f / 2, vol: 0.04 * v, a: 0.01, d: 0.6, bus: musicBus, wet: 0.2, pan: 0.2 }); },
    pad: (t, m, len, v) => [-7, 0, 7].forEach((dt) => osc(t, { type: 'sawtooth', f: mtof(m), detune: dt, vol: 0.022 * v, a: 0.4, d: 0.2, s: 0.8, r: 0.6, len, filter: { f: 900 }, bus: musicBus, wet: 0.5 })),
    strings: (t, m, len, v) => [-9, 0, 9].forEach((dt, k) => osc(t, { type: 'sawtooth', f: mtof(m), detune: dt, vol: 0.026 * v, a: 0.12, d: 0.2, s: 0.75, r: 0.3, len, filter: { f: 2200 }, vib: { rate: 5, depth: 5, delay: 0.25 }, bus: musicBus, wet: 0.45, pan: k - 1 })),
    lead: (t, m, len, v) => [-6, 6].forEach((dt, k) => osc(t, { type: 'sawtooth', f: mtof(m), detune: dt, vol: 0.05 * v, a: 0.015, d: 0.15, s: 0.7, r: 0.12, len, filter: { f: 1200, f2: 3200, t: 0.08, q: 2 }, vib: { rate: 5.8, depth: 12, delay: 0.2 }, bus: musicBus, wet: 0.35, pan: k ? 0.15 : -0.15 })),
    brass: (t, m, len, v) => [-5, 5].forEach((dt) => osc(t, { type: 'sawtooth', f: mtof(m), detune: dt, vol: 0.05 * v, a: 0.04, d: 0.2, s: 0.6, r: 0.15, len, filter: { f: 250, f2: 1800, t: 0.09, q: 1.5 }, bus: musicBus, wet: 0.35 })),
    choir: (t, m, len, v) => [700, 1150].forEach((fr) => [-8, 8].forEach((dt) => osc(t, { type: 'sawtooth', f: mtof(m), detune: dt, vol: 0.03 * v, a: 0.35, d: 0.2, s: 0.85, r: 0.5, len, filter: { type: 'bandpass', f: fr, q: 5 }, vib: { rate: 4.6, depth: 10, delay: 0.3 }, bus: musicBus, wet: 0.6 }))),
    arp: (t, m, len, v) => osc(t, { type: 'square', f: mtof(m), vol: 0.035 * v, d: 0.14, filter: { f: 2800, f2: 900, t: 0.12 }, bus: musicBus, wet: 0.3, pan: 0.35 }),
    bell: (t, m, len, v) => bell(t, { f: mtof(m), ratio: 3.5, index: 2, vol: 0.05 * v, d: 1.2, bus: musicBus, wet: 0.5, pan: -0.3 }),
    bass: (t, m, len, v) => { osc(t, { type: 'triangle', f: mtof(m), vol: 0.2 * v, a: 0.005, d: 0.1, s: 0.7, r: 0.06, len, bus: musicBus, wet: 0.02 }); osc(t, { type: 'sawtooth', f: mtof(m), vol: 0.05 * v, d: 0.12, s: 0.4, r: 0.05, len, filter: { f: 900, f2: 300, t: 0.1 }, bus: musicBus, wet: 0 }); },
    heavy: (t, m, len, v) => { osc(t, { type: 'sawtooth', f: mtof(m), vol: 0.11 * v, d: 0.08, s: 0.6, r: 0.05, len, dist: true, filter: { f: 1400, f2: 500, t: 0.1 }, bus: musicBus, wet: 0.05 }); osc(t, { type: 'sine', f: mtof(m - 12), vol: 0.18 * v, d: 0.1, s: 0.7, r: 0.05, len, bus: musicBus, wet: 0 }); },
    kick: (t, m, len, v) => { osc(t, { type: 'sine', f: 160, f2: 42, glide: 0.12, vol: 0.55 * v, d: 0.28, bus: musicBus, wet: 0.03 }); noise(t, { vol: 0.12 * v, d: 0.012, type: 'highpass', f: 3000, bus: musicBus, wet: 0 }); },
    snare: (t, m, len, v) => { noise(t, { vol: 0.2 * v, d: 0.16, type: 'bandpass', f: 2000, q: 0.7, bus: musicBus, wet: 0.3 }); osc(t, { type: 'triangle', f: 210, f2: 160, glide: 0.06, vol: 0.18 * v, d: 0.08, bus: musicBus, wet: 0.2 }); },
    hat: (t, m, len, v) => noise(t, { vol: 0.05 * v, d: m ? 0.18 : 0.035, type: 'highpass', f: 7500, bus: musicBus, wet: 0.05, pan: 0.3 }),
    shaker: (t, m, len, v) => noise(t, { vol: 0.035 * v, a: 0.01, d: 0.05, type: 'bandpass', f: 6500, q: 1.5, bus: musicBus, wet: 0.1, pan: 0.4 }),
    tom: (t, m, len, v) => { osc(t, { type: 'sine', f: mtof(m), f2: mtof(m) * 0.6, glide: 0.25, vol: 0.4 * v, d: 0.35, bus: musicBus, wet: 0.25 }); noise(t, { vol: 0.06 * v, d: 0.05, type: 'lowpass', f: 1500, bus: musicBus }); },
    crash: (t, m, len, v) => noise(t, { vol: 0.09 * v, d: 1.6, type: 'highpass', f: 4500, bus: musicBus, wet: 0.4 }),
  };

  // ---------------------------------------------------------------- the music

  // Notes are written as "D5:4" (pitch, length in 16th notes), "-:4" is a rest, "D5+F5:4" a chord.
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pitch = (s) => { const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  function seq(str) { const evs = []; let at = 0; str.trim().split(/\s+/).forEach((tok) => { const [n, l] = tok.split(':'), len = +l || 1; if (n !== '-') evs.push([at, n.split('+').map(pitch), len]); at += len; }); return { evs, steps: at }; }
  // drums: one character per 16th; x hit, X accent, o open hat
  function beat(str) { const evs = []; [...str.replace(/\|/g, '')].forEach((c, i) => { if (c !== '.') evs.push([i, [c === 'o' ? 1 : 0], 1, c === 'X' ? 1.3 : c === 'o' ? 1 : 1]); }); return { evs, steps: str.replace(/\|/g, '').length }; }
  // chord progression to pads, bass and arpeggios: one chord per bar
  const CH = { Dm: ['D', 'F', 'A'], D: ['D', 'F#', 'A'], G: ['G', 'B', 'D'], A: ['A', 'C#', 'E'], Bm: ['B', 'D', 'F#'], Em: ['E', 'G', 'B'], Bb: ['Bb', 'D', 'F'], C: ['C', 'E', 'G'], Am: ['A', 'C', 'E'], Gm: ['G', 'Bb', 'D'], F: ['F', 'A', 'C'], Cm: ['C', 'Eb', 'G'], Ab: ['Ab', 'C', 'Eb'], Fm: ['F', 'Ab', 'C'], Eb: ['Eb', 'G', 'Bb'] };
  const tone3 = (name, oct) => CH[name].map((n, i) => { const p = pitch(n + oct); return i && p < pitch(CH[name][0] + oct) ? p + 12 : p; });
  const padPart = (chords, oct = 4) => ({ evs: chords.map((c, i) => [i * 16, tone3(c, oct), 16]), steps: chords.length * 16 });
  const bassPart = (chords, pat, oct = 2) => { const evs = []; chords.forEach((c, i) => pat.forEach(([at, deg, len]) => { const r = tone3(c, oct); evs.push([i * 16 + at, [deg === 8 ? r[0] + 12 : r[deg]], len]); })); return { evs, steps: chords.length * 16 }; };
  const arpPart = (chords, order, oct = 5, every = 1) => { const evs = []; chords.forEach((c, i) => { const r = tone3(c, oct), all = [...r, r[0] + 12, r[1] + 12]; for (let s = 0; s < 16; s += every) evs.push([i * 16 + s, [all[order[(s / every) % order.length]]], every]); }); return { evs, steps: chords.length * 16 }; };

  const TRACKS = {
    // the tavern: an easy lute and harp tune in D major
    town: (() => {
      const ch = ['D', 'G', 'A', 'D', 'Bm', 'G', 'A', 'D'];
      return { bpm: 92, vol: 1, parts: [
        ['harp', seq('F#5:4 A5:4 D6:6 C#6:2 B5:4 A5:4 G5:4 F#5:4 E5:4 F#5:2 G5:2 A5:6 -:2 F#5:4 E5:4 D5:8 D5:4 F#5:4 B5:6 A5:2 G5:4 B5:4 D6:4 B5:4 A5:4 G5:2 F#5:2 E5:4 C#5:4 D5:12 -:4'), 0.9],
        ['lute', arpPart(ch, [0, 2, 1, 2, 3, 2, 1, 2], 4, 2), 0.8],
        ['pad', padPart(ch, 4), 0.8],
        ['bass', bassPart(ch, [[0, 0, 6], [8, 2, 6]]), 0.8],
        ['kick', beat('x.......x.......'), 0.5], ['shaker', beat('..x...x...x...x.'), 1], ['hat', beat('x.x.x.x.x.x.x.x.'), 0.5],
      ] };
    })(),
    // the dungeon: driving D minor with strings, brass lead and drums
    battle: (() => {
      const ch = ['Dm', 'Bb', 'C', 'Am', 'Dm', 'Bb', 'Gm', 'A'];
      return { bpm: 132, vol: 1, parts: [
        ['brass', seq('D5:3 E5:1 F5:4 A5:4 G5:2 F5:2 D5:4 F5:4 Bb5:6 A5:2 G5:3 A5:1 G5:4 E5:4 C5:4 E5:8 A4:4 C5:4 D5:3 E5:1 F5:4 A5:4 D6:4 C6:4 Bb5:4 A5:4 F5:4 G5:4 Bb5:4 D6:4 C6:2 Bb5:2 A5:8 C#6:4 E6:4'), 0.9],
        ['strings', padPart(ch, 4), 0.9],
        ['arp', arpPart(ch, [0, 1, 2, 3, 2, 1, 0, 1], 5, 1), 0.7],
        ['bass', bassPart(ch, [[0, 0, 2], [2, 0, 2], [4, 8, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, 8, 2], [14, 2, 2]]), 1],
        ['kick', beat('x.....x.x.......'), 1], ['snare', beat('....X.......X..x'), 0.9], ['hat', beat('x.xxx.xxx.xxx.xo'), 0.8], ['crash', { evs: [[0, [0], 1]], steps: 128 }, 1],
      ] };
    })(),
    // the boss: heavy C minor with choir, low brass, toms and a distorted bass
    boss: (() => {
      const ch = ['Cm', 'Ab', 'Bb', 'G', 'Cm', 'Ab', 'Fm', 'G'];
      return { bpm: 148, vol: 1, parts: [
        ['lead', seq('C5:6 D5:2 Eb5:4 G5:4 Ab5:6 G5:2 F5:4 Eb5:4 D5:6 Eb5:2 F5:4 Bb5:4 B4:8 D5:4 G5:4 C6:6 Bb5:2 G5:4 Eb5:4 F5:6 Eb5:2 C5:4 Ab4:4 F5:4 Ab5:4 C6:4 Ab5:4 G5:8 B5:4 D6:4'), 0.85],
        ['choir', padPart(ch, 4), 1],
        ['brass', { evs: ch.flatMap((c, i) => [[i * 16, tone3(c, 3), 3], [i * 16 + 6, tone3(c, 3), 2]]), steps: 128 }, 0.8],
        ['heavy', bassPart(ch, [[0, 0, 1], [2, 0, 1], [3, 0, 1], [6, 0, 1], [8, 0, 1], [10, 0, 1], [11, 0, 1], [14, 8, 2]]), 1],
        ['kick', beat('x.x.x.x.x.x.x.xx'), 0.9], ['snare', beat('....X.......X...'), 1], ['hat', beat('x.x.x.x.x.x.x.x.'), 0.7],
        ['tom', { evs: [[112, [45], 1], [114, [43], 1], [116, [40], 1], [118, [38], 1], [120, [45], 1], [122, [43], 1], [124, [40], 2]], steps: 128 }, 1],
        ['crash', { evs: [[0, [0], 1], [64, [0], 1]], steps: 128 }, 1],
        ['bell', { evs: [[0, [72], 4], [64, [72], 4]], steps: 128 }, 1],
      ] };
    })(),
  };

  // a look-ahead scheduler: every 25 ms, queue whatever falls in the next 150 ms
  let scene = 'town', playing = null, startAt = 0, nextStep = 0, trackGain = null, lastScene = 0;
  function startTrack(name) {
    const tr = TRACKS[name];
    if (trackGain) { const old = trackGain; old.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => old.disconnect(), 3000); }
    trackGain = ctx.createGain(); trackGain.gain.value = 0.0001; trackGain.connect(musicBus);
    trackGain.gain.setTargetAtTime(tr.vol, ctx.currentTime + 0.05, 0.6);
    playing = name; startAt = ctx.currentTime + 0.1; nextStep = 0;
  }
  function tick() {
    if (!ctx || ctx.state !== 'running' || !musicOn) return;
    const want = performance.now() - lastScene > 1500 ? 'town' : scene;
    if (want !== playing) startTrack(want);
    const tr = TRACKS[playing], sp = 60 / tr.bpm / 4, horizon = ctx.currentTime + 0.15;
    while (startAt + nextStep * sp < horizon) {
      const t = startAt + nextStep * sp;
      tr.parts.forEach(([inst, part, v]) => {
        const s = nextStep % part.steps;
        part.evs.forEach(([at, notes, len, acc]) => { if (at === s) notes.forEach((m) => { try { routeTo(INST[inst], t, m, len * sp, v * (acc || 1)); } catch (e) { /* skip a bad note */ } }); });
      });
      nextStep++;
    }
  }
  // instruments write to musicBus; for crossfades they go through the current track's gain instead
  function routeTo(fn, t, m, len, v) { const keep = musicBus; musicBus = trackGain; try { fn(t, m, len, v); } finally { musicBus = keep; } }
  setInterval(tick, 25);
  S.scene = (name) => { if (TRACKS[name]) { scene = name; lastScene = performance.now(); } };
  S.ambient = () => S.scene('battle');

  // ---------------------------------------------------------------- toggles and interface hooks

  function save() { try { localStorage.setItem('it-sfx', sfxOn ? '1' : '0'); localStorage.setItem('it-music', musicOn ? '1' : '0'); } catch (e) { /* private mode */ } }
  function paint() {
    const a = document.getElementById('sfx-toggle'), b = document.getElementById('music-toggle');
    if (a) { a.textContent = sfxOn ? '🔊' : '🔇'; a.title = sfxOn ? 'Sound effects on' : 'Sound effects off'; a.setAttribute('aria-pressed', String(sfxOn)); }
    if (b) { b.textContent = '♪'; b.style.opacity = musicOn ? '1' : '.45'; b.title = musicOn ? 'Music on' : 'Music off'; b.setAttribute('aria-pressed', String(musicOn)); }
  }
  S.muted = () => !sfxOn;
  S.musicOn = () => musicOn;
  S.setMuted = (m) => { sfxOn = !m; save(); if (fxBus) fxBus.gain.setTargetAtTime(sfxOn ? SFX_VOL : 0, ctx.currentTime, 0.05); paint(); };
  S.setMusic = (on) => { musicOn = !!on; save(); if (musicBus) musicBus.gain.setTargetAtTime(musicOn ? MUSIC_VOL : 0, ctx.currentTime, 0.3); if (!musicOn) playing = null; paint(); };
  function mount() {
    if (document.getElementById('sfx-toggle')) return;
    const wrap = document.createElement('div'); wrap.className = 'sfx-toggle';
    const mk = (id, fn) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'small'; b.addEventListener('click', (e) => { e.stopPropagation(); boot(); if (ctx && ctx.state === 'suspended') ctx.resume(); fn(); }); wrap.appendChild(b); };
    mk('music-toggle', () => S.setMusic(!musicOn));
    mk('sfx-toggle', () => { S.setMuted(sfxOn); S.play('click'); });
    document.body.appendChild(wrap); paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  document.addEventListener('click', (e) => { const el = e.target.closest && e.target.closest('button, .nav a, .choice, .race, .tile'); if (el && !el.closest('.sfx-toggle') && !el.disabled) S.play('click'); }, true);
  const watch = () => {
    const t = document.getElementById('toast'); if (!t) return;
    new MutationObserver(() => { if (t.hidden) return; const txt = t.textContent || ''; S.play(/level/i.test(txt) && t.classList.contains('ok') ? 'levelup' : t.classList.contains('ok') ? 'good' : 'bad'); }).observe(t, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
