// Synthesised sound: every effect and the music loop are built from WebAudio
// oscillators and filtered noise, so the game ships no audio files at all.
// Audio starts on the first user gesture (browsers require it).
var AudioSys = (function () {
  var ctx = null, master = null, musicGain = null, engineNodes = null;
  var musicTimer = null, musicStep = 0, muted = false;
  var sirenNodes = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    } catch (e) { ctx = null; }
    return !!ctx;
  }

  function noiseBuffer(seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, filterFreq, vol) {
    if (!ctx || muted) return;
    var t = ctx.currentTime;
    var src = ctx.createBufferSource(); src.buffer = noiseBuffer(dur);
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur);
  }

  // --- one-shot effects -------------------------------------------------
  function gunshot() { noiseBurst(0.14, 900, 0.5); blip(160, 0.1, 'square', 0.25, 50); }
  function punch() { noiseBurst(0.08, 500, 0.35); }
  function pickup() { blip(660, 0.09, 'sine', 0.22); setTimeout(function () { blip(990, 0.12, 'sine', 0.22); }, 70); }
  function coin() { blip(880, 0.08, 'triangle', 0.2); setTimeout(function () { blip(1318, 0.14, 'triangle', 0.2); }, 60); }
  function click() { blip(1200, 0.04, 'square', 0.12); }
  function error() { blip(220, 0.18, 'sawtooth', 0.2, 140); }
  function missionPass() {
    if (!ctx || muted) return;
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { blip(f, 0.22, 'triangle', 0.25); }, i * 110);
    });
  }
  function missionFail() {
    [392, 330, 262].forEach(function (f, i) {
      setTimeout(function () { blip(f, 0.25, 'sawtooth', 0.18); }, i * 140);
    });
  }
  function crash(intensity) { noiseBurst(0.3, 700, 0.25 + 0.4 * (intensity || 0.5)); }
  function door() { blip(300, 0.07, 'square', 0.12, 180); }

  // --- engine hum: two detuned oscillators through a low-pass filter ----
  function engineStart() {
    if (!ctx || engineNodes) return;
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    var f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square';
    o1.frequency.value = 55; o2.frequency.value = 82;
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 2;
    g.gain.value = 0.0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    o1.start(); o2.start();
    engineNodes = { o1: o1, o2: o2, f: f, g: g };
  }
  function engineSet(speedNorm, on) {
    if (!engineNodes || !ctx) return;
    var t = ctx.currentTime;
    var target = on ? 0.05 + 0.09 * speedNorm : 0.0;
    engineNodes.g.gain.setTargetAtTime(muted ? 0 : target, t, 0.1);
    engineNodes.o1.frequency.setTargetAtTime(50 + 130 * speedNorm, t, 0.08);
    engineNodes.o2.frequency.setTargetAtTime(75 + 190 * speedNorm, t, 0.08);
    engineNodes.f.frequency.setTargetAtTime(380 + 1400 * speedNorm, t, 0.1);
  }

  // --- police siren: two alternating tones ------------------------------
  function sirenStart() {
    if (!ctx || sirenNodes) return;
    var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 750;
    lfo.type = 'square'; lfo.frequency.value = 0.55;
    lg.gain.value = 170;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.0;
    o.connect(g); g.connect(master);
    o.start(); lfo.start();
    sirenNodes = { o: o, lfo: lfo, g: g };
  }
  function sirenSet(on, distance) {
    if (!sirenNodes || !ctx) return;
    var vol = on ? clamp(0.14 * (1 - distance / 120), 0, 0.14) : 0;
    sirenNodes.g.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, 0.3);
  }

  // --- music: a slow synthwave loop, Am - F - C - G --------------------
  var CHORDS = [
    [110.0, 130.8, 164.8, 220.0],
    [87.3, 110.0, 130.8, 174.6],
    [130.8, 164.8, 196.0, 261.6],
    [98.0, 123.5, 146.8, 196.0],
  ];
  var BASS = [55, 43.65, 65.4, 49];
  function musicNote(freq, dur, type, vol, when) {
    var t = ctx.currentTime + when;
    var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function musicTick() {
    if (!ctx || muted) return;
    var bar = Math.floor(musicStep / 8) % 4;
    var beat = musicStep % 8;
    if (beat === 0) musicNote(BASS[bar], 1.9, 'sawtooth', 0.5, 0);
    if (beat === 4) musicNote(BASS[bar] * 1.5, 0.9, 'sawtooth', 0.35, 0);
    if (beat % 2 === 0) {
      var chord = CHORDS[bar];
      musicNote(chord[beat / 2 % 4], 0.9, 'triangle', 0.12, 0);
    }
    if (beat === 2 || beat === 6) musicNote(220 * (bar + 1), 0.2, 'sine', 0.06, 0);
    musicStep++;
  }
  function musicStart() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(musicTick, 250);
  }

  return {
    unlock: function () { if (ensure()) { engineStart(); sirenStart(); musicStart(); } },
    gunshot: gunshot, punch: punch, pickup: pickup, coin: coin, click: click,
    error: error, missionPass: missionPass, missionFail: missionFail,
    crash: crash, door: door,
    engineSet: engineSet, sirenSet: sirenSet,
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted: function () { return muted; },
  };
})();
