/**
 * Four-oscillator-ish sound kit built straight on WebAudio — no asset loading,
 * no autoplay warnings. The context is created lazily on the first gesture
 * because browsers refuse to start audio before one.
 */

const VOICES = {
  eat: { freq: 620, to: 940, dur: 0.09, type: 'triangle', gain: 0.14 },
  bonus: { freq: 520, to: 1180, dur: 0.16, type: 'triangle', gain: 0.16 },
  kill: { freq: 320, to: 120, dur: 0.22, type: 'sawtooth', gain: 0.12 },
  die: { freq: 260, to: 55, dur: 0.5, type: 'sawtooth', gain: 0.18 },
  respawn: { freq: 180, to: 480, dur: 0.18, type: 'sine', gain: 0.1 },
  go: { freq: 440, to: 880, dur: 0.24, type: 'square', gain: 0.1 },
  ui: { freq: 700, to: 700, dur: 0.05, type: 'sine', gain: 0.08 },
};

export class Sound {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
  }

  /** Call from a click/keydown handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  play(name) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const voice = VOICES[name];
    if (!voice) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = voice.type;
    osc.frequency.setValueAtTime(voice.freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, voice.to), now + voice.dur);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(voice.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.dur);

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + voice.dur + 0.02);
  }
}
