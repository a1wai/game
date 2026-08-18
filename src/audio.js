/**
 * Four-oscillator-ish sound kit built straight on WebAudio — no asset loading,
 * no autoplay warnings. The context is created lazily on the first gesture
 * because browsers refuse to start audio before one.
 */

const VOICES = {
  eat: { freq: 640, to: 900, dur: 0.07, type: 'sine', gain: 0.1 },
  bonus: { freq: 540, to: 1080, dur: 0.14, type: 'triangle', gain: 0.12 },
  kill: { freq: 300, to: 140, dur: 0.2, type: 'triangle', gain: 0.1 },
  die: { freq: 280, to: 70, dur: 0.45, type: 'triangle', gain: 0.14 },
  respawn: { freq: 200, to: 460, dur: 0.16, type: 'sine', gain: 0.08 },
  go: { freq: 480, to: 820, dur: 0.2, type: 'sine', gain: 0.09 },
  ui: { freq: 680, to: 680, dur: 0.045, type: 'sine', gain: 0.06 },
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
