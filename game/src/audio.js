// Fully synthesised WebAudio: no audio files. Engine hum, sirens, gunshots,
// pickups, mission jingles and a synthwave loop, all generated at runtime.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;

  // A minor-key synthwave bassline + sparkle, one bar per timer tick.
  const BASS = [55, 55, 65.41, 49, 55, 55, 82.41, 73.42];
  const LEAD = [220, 261.63, 329.63, 392, 329.63, 261.63, 220, 196];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.12;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineOsc.connect(engineGain);
      engineOsc.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  function musicTick() {
    if (!ctx || muted) return;
    const bar = step % 8;
    tone(BASS[bar], 0.42, 'triangle', 0.5);
    tone(BASS[bar] * 2, 0.2, 'square', 0.08);
    if (step % 2 === 0) tone(LEAD[bar], 0.22, 'sine', 0.12);
    if (step % 4 === 2) noise(0.05, 0.06, 6000); // hat
    step += 1;
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && !musicTimer) musicTimer = window.setInterval(musicTick, 240);
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() { return muted; },
    setEngine(rpm01, on) {
      if (!ctx) return;
      engineGain.gain.setTargetAtTime(on ? 0.05 + rpm01 * 0.06 : 0, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(45 + rpm01 * 110, ctx.currentTime, 0.1);
    },
    setSiren(on, wanted) {
      if (!ctx) return;
      sirenGain.gain.setTargetAtTime(on ? 0.03 + wanted * 0.008 : 0, ctx.currentTime, 0.2);
      const t = ctx.currentTime;
      sirenOsc.frequency.cancelScheduledValues(t);
      sirenOsc.frequency.setValueAtTime(650, t);
      sirenOsc.frequency.linearRampToValueAtTime(950, t + 0.5);
      sirenOsc.frequency.linearRampToValueAtTime(650, t + 1.0);
    },
    shot() { noise(0.12, 0.5, 3000); tone(180, 0.08, 'square', 0.25, 0, 60); },
    punch() { noise(0.08, 0.35, 900); },
    crash() { noise(0.3, 0.5, 700); tone(90, 0.25, 'sawtooth', 0.3, 0, 40); },
    pickup() { tone(660, 0.1, 'sine', 0.3); tone(990, 0.16, 'sine', 0.3, 0.09); },
    coin() { tone(880, 0.09, 'sine', 0.3); tone(1318, 0.2, 'sine', 0.3, 0.08); },
    horn() { tone(370, 0.25, 'square', 0.15); tone(466, 0.25, 'square', 0.12); },
    sirenBlip() { tone(700, 0.15, 'sine', 0.2, 0, 1100); tone(1100, 0.15, 'sine', 0.2, 0.15, 700); },
    missionStart() { [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.3, i * 0.11)); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.32, i * 0.12)); },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.2, i * 0.16)); },
    click() { tone(1200, 0.05, 'sine', 0.2); },
  };
}
