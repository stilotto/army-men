// Synthesised sound effects (no audio files): gunfire, rockets, the mortar
// whistle, flame roar, dice clattering on linoleum and plastic taps.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  noiseSrc(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 1, attack = 0.002, decay = dur, freqEnd } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  tone(t, dur, { freq = 200, freqEnd, type = 'sine', gain = 0.5, attack = 0.005 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, opts = {}) {
    if (this.muted || !this.ensure()) return;
    const t = this.ctx.currentTime + 0.01;
    const fn = this[`sfx_${name}`];
    if (fn) fn.call(this, t, opts);
  }

  sfx_rifle(t) {
    this.noiseSrc(t, 0.35, { freq: 1800, q: 0.7, gain: 0.9, decay: 0.25 });
    this.noiseSrc(t, 0.5, { type: 'lowpass', freq: 400, gain: 0.8, decay: 0.4 });
    this.tone(t, 0.12, { freq: 140, freqEnd: 50, gain: 0.6 });
  }

  sfx_pistol(t) {
    this.noiseSrc(t, 0.25, { freq: 2400, q: 0.8, gain: 0.7, decay: 0.18 });
    this.tone(t, 0.08, { freq: 180, freqEnd: 70, gain: 0.4 });
  }

  sfx_mg(t) {
    for (let i = 0; i < 6; i++) {
      const s = t + i * 0.085;
      this.noiseSrc(s, 0.18, { freq: 1500, q: 0.8, gain: 0.7, decay: 0.12 });
      this.tone(s, 0.07, { freq: 120, freqEnd: 50, gain: 0.45 });
    }
  }

  sfx_bazooka(t) {
    this.noiseSrc(t, 0.9, { freq: 600, freqEnd: 3000, q: 0.6, gain: 0.6, attack: 0.02, decay: 0.8 });
    this.tone(t, 0.2, { freq: 90, freqEnd: 40, gain: 0.5 });
  }

  sfx_boom(t, { size = 1 } = {}) {
    this.noiseSrc(t, 1.6, { type: 'lowpass', freq: 900, freqEnd: 120, gain: 1, decay: 1.4 * size });
    this.noiseSrc(t, 0.3, { freq: 2500, q: 0.5, gain: 0.5, decay: 0.2 });
    this.tone(t, 0.8, { freq: 70, freqEnd: 28, gain: 0.9 });
  }

  sfx_mortar(t) {
    this.tone(t, 0.25, { freq: 160, freqEnd: 60, gain: 0.7 });
    this.noiseSrc(t, 0.3, { type: 'lowpass', freq: 500, gain: 0.6, decay: 0.25 });
    this.tone(t + 0.35, 0.95, { freq: 1500, freqEnd: 500, type: 'sine', gain: 0.12, attack: 0.2 });
  }

  sfx_flame(t) {
    this.noiseSrc(t, 1.3, { type: 'lowpass', freq: 700, gain: 0.8, attack: 0.08, decay: 1.25 });
    this.noiseSrc(t, 1.3, { freq: 3000, q: 2, gain: 0.15, attack: 0.1, decay: 1.2 });
    for (let i = 0; i < 12; i++) this.noiseSrc(t + Math.random() * 1.1, 0.04, { freq: 4000, q: 3, gain: 0.25, decay: 0.03 });
  }

  sfx_dice(t, { h = 1 } = {}) {
    // A plastic clack on the linoleum, quieter each bounce.
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.025 + Math.random() * 0.03);
      this.noiseSrc(s, 0.05, { type: 'bandpass', freq: 2800 + Math.random() * 1500, q: 6, gain: 0.35 * Math.max(0.15, h), decay: 0.04 });
      this.tone(s, 0.03, { freq: 900 + Math.random() * 400, gain: 0.08 * Math.max(0.2, h) });
    }
  }

  sfx_tap(t) {
    this.noiseSrc(t, 0.05, { freq: 2000, q: 4, gain: 0.25, decay: 0.04 });
    this.tone(t, 0.04, { freq: 600, gain: 0.08 });
  }

  sfx_lift(t) {
    this.noiseSrc(t, 0.05, { freq: 5000, q: 2, gain: 0.04, decay: 0.04 });
  }

  sfx_topple(t) {
    this.noiseSrc(t + 0.3, 0.06, { freq: 1700, q: 5, gain: 0.35, decay: 0.05 });
    this.noiseSrc(t + 0.42, 0.06, { freq: 2100, q: 5, gain: 0.2, decay: 0.05 });
    this.noiseSrc(t + 0.5, 0.05, { freq: 2500, q: 5, gain: 0.1, decay: 0.04 });
  }

  sfx_ricochet(t) {
    this.tone(t, 0.35, { freq: 2600, freqEnd: 900, type: 'triangle', gain: 0.07 });
  }

  sfx_select(t) {
    this.tone(t, 0.08, { freq: 880, gain: 0.05, type: 'triangle' });
  }

  sfx_turn(t) {
    this.tone(t, 0.12, { freq: 523, gain: 0.07, type: 'square' });
    this.tone(t + 0.12, 0.12, { freq: 659, gain: 0.07, type: 'square' });
    this.tone(t + 0.24, 0.25, { freq: 784, gain: 0.07, type: 'square' });
  }
}
