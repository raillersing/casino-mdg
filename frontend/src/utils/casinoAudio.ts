// High-performance Web Audio API synthesizer for Casino games (zero external asset latency)

class CasinoSoundEngine {
  private ctx: AudioContext | null = null;
  private anticipationOsc: OscillatorNode | null = null;
  private anticipationGain: GainNode | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (localStorage.getItem("mdg-poker-sound") === "off") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playSlotSpin() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(190, now + 0.1);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  playSlotStop(pitchMultiplier: number = 1.0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180 * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  startAnticipation() {
    const ctx = this.getContext();
    if (!ctx) return;
    this.stopAnticipation();
    const now = ctx.currentTime;
    this.anticipationOsc = ctx.createOscillator();
    this.anticipationGain = ctx.createGain();
    this.anticipationOsc.type = "triangle";
    this.anticipationOsc.frequency.setValueAtTime(320, now);
    this.anticipationOsc.frequency.linearRampToValueAtTime(680, now + 2.5);
    this.anticipationGain.gain.setValueAtTime(0.01, now);
    this.anticipationGain.gain.linearRampToValueAtTime(0.12, now + 2.5);
    this.anticipationOsc.connect(this.anticipationGain);
    this.anticipationGain.connect(ctx.destination);
    this.anticipationOsc.start(now);
  }

  stopAnticipation() {
    if (this.anticipationOsc && this.anticipationGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.anticipationGain.gain.setValueAtTime(
        this.anticipationGain.gain.value,
        now,
      );
      this.anticipationGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.1,
      );
      setTimeout(() => {
        try {
          this.anticipationOsc?.stop();
          this.anticipationOsc?.disconnect();
        } catch {
          // ignore
        }
        this.anticipationOsc = null;
        this.anticipationGain = null;
      }, 120);
    }
  }

  playHeartbeat() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.14].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(55, now + offset);
      gain.gain.setValueAtTime(0.2, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.1);
    });
  }

  playWheelTick() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.04);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  }

  playChestCrack() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playChestOpen() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.1, now + i * 0.04 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.4);
    });
  }

  playPaylineWin(lineIndex: number = 0) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const baseFreq = 440 + lineIndex * 70;
    [baseFreq, baseFreq * 1.25, baseFreq * 1.5, baseFreq * 2].forEach(
      (freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, now + i * 0.06);
        gain.gain.linearRampToValueAtTime(0.14, now + i * 0.06 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.35);
      },
    );
  }

  playCoinWin() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [987.77, 1318.51, 1567.98, 1975.53].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.14, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.45);
    });
  }

  playJackpot() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093.0, 2637.0,
    ];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  }

  playLudoDiceRoll() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Rattle of rolling dice (series of 5 tiny woody clicks)
    [0, 0.04, 0.09, 0.15, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140 + Math.random() * 180, now + offset);
      osc.frequency.exponentialRampToValueAtTime(60, now + offset + 0.035);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.035);
    });
  }

  playLudoPawnHop() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    // Playful snappy "tok" hop
    osc.frequency.setValueAtTime(460, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.055);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playLudoCapture() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Impact punch
    const impactOsc = ctx.createOscillator();
    const impactGain = ctx.createGain();
    impactOsc.type = "square";
    impactOsc.frequency.setValueAtTime(180, now);
    impactOsc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
    impactGain.gain.setValueAtTime(0.25, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    impactOsc.connect(impactGain);
    impactGain.connect(ctx.destination);
    impactOsc.start(now);
    impactOsc.stop(now + 0.14);

    // Comic descending slide
    const slideOsc = ctx.createOscillator();
    const slideGain = ctx.createGain();
    slideOsc.type = "sawtooth";
    slideOsc.frequency.setValueAtTime(580, now + 0.05);
    slideOsc.frequency.exponentialRampToValueAtTime(120, now + 0.32);
    slideGain.gain.setValueAtTime(0.15, now + 0.05);
    slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    slideOsc.connect(slideGain);
    slideGain.connect(ctx.destination);
    slideOsc.start(now + 0.05);
    slideOsc.stop(now + 0.35);
  }

  playLudoSixCelebration() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Bright celebratory 4-note ascending fanfare (C5, E5, G5, C6)
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = now + idx * 0.065;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }

  playLudoHomeWin() {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Sparkly victory chime
    [698.46, 880.0, 1046.5, 1318.51].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + idx * 0.07;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.45);
    });
  }
}

export const casinoAudio = new CasinoSoundEngine();
