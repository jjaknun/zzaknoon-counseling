// Retro 8-bit Sound Synthesizer via Web Audio API
class RetroSound {
  constructor() {
    this.ctx = null;
    this.enabled = localStorage.getItem('zzaknoon_sound_enabled') !== 'false';
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('zzaknoon_sound_enabled', this.enabled);
    if (this.enabled) {
      this.init();
      this.playBeep();
    }
    return this.enabled;
  }

  playTone(freq, type = 'square', duration = 0.08, gainVal = 0.08) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio not allowed yet
    }
  }

  playClick() {
    this.playTone(480, 'triangle', 0.05, 0.06);
  }

  playBeep() {
    this.playTone(700, 'square', 0.06, 0.05);
    setTimeout(() => this.playTone(880, 'square', 0.07, 0.05), 60);
  }

  playSelect() {
    this.playTone(523.25, 'sine', 0.06, 0.06); // C5
    setTimeout(() => this.playTone(659.25, 'sine', 0.08, 0.06), 70); // E5
  }

  playSuccess() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [
      { f: 523.25, d: 0.1 },  // C5
      { f: 659.25, d: 0.1 },  // E5
      { f: 783.99, d: 0.1 },  // G5
      { f: 1046.50, d: 0.3 }  // C6
    ];

    let t = 0;
    notes.forEach((n, i) => {
      setTimeout(() => {
        this.playTone(n.f, 'square', n.d, 0.07);
      }, t);
      t += n.d * 900;
    });
  }

  playNotify() {
    this.playTone(880, 'sine', 0.1, 0.08);
    setTimeout(() => this.playTone(1320, 'sine', 0.2, 0.08), 120);
  }
}

window.retroSound = new RetroSound();
