/** Procedural ambient music and action tones; silence until explicit player opt-in. */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = false;
  private lastSound = -Infinity;
  private voices = new Set<OscillatorNode>();
  private pad: { oscillator: OscillatorNode; gain: GainNode }[] = [];
  private chord = 0;
  private ambientTimer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (on) {
      try {
        if (!this.context) {
          this.context = new AudioContext();
          this.master = this.context.createGain();
          this.master.gain.value = 0;
          this.master.connect(this.context.destination);
        }
        const context = this.context;
        void context
          .resume()
          .then(() => {
            // A rapid off/on or destroy must not resurrect an old context.
            if (!this.enabled || this.context !== context) return;
            this.fadeMaster(0.75, 0.6);
            this.startAmbient();
          })
          .catch(() => {
            if (this.context === context) this.enabled = false;
          });
      } catch {
        this.enabled = false;
      }
    } else {
      this.stopAmbientTimer();
      this.fadeMaster(0, 0.15);
      const context = this.context;
      if (context)
        this.suspendTimer = setTimeout(() => {
          this.suspendTimer = null;
          if (!this.enabled && this.context === context) void context.suspend().catch(() => {});
        }, 180);
    }
  }

  private fadeMaster(value: number, seconds: number): void {
    const context = this.context,
      master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(value, now + seconds);
  }

  private startAmbient(): void {
    const context = this.context,
      master = this.master;
    if (!context || !master) return;
    if (!this.pad.length) {
      for (let i = 0; i < 3; i++) {
        const oscillator = context.createOscillator(),
          gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.detune.value = (i - 1) * 3;
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(master);
        this.voices.add(oscillator);
        oscillator.onended = () => {
          this.voices.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start();
        this.pad.push({ oscillator, gain });
      }
      this.evolveChord(true);
    }
    if (this.ambientTimer === null)
      this.ambientTimer = setInterval(() => this.evolveChord(false), 16000);
  }

  private evolveChord(first: boolean): void {
    const context = this.context;
    if (!context || !this.enabled) return;
    // Cmaj / Am / Fmaj / Gsus: a quiet, unresolved bed for an open-ended world.
    const chords = [
      [130.813, 164.814, 195.998],
      [110, 164.814, 220],
      [130.813, 174.614, 220],
      [146.832, 195.998, 261.626],
    ];
    const notes = chords[this.chord++ % chords.length],
      now = context.currentTime;
    this.pad.forEach(({ oscillator, gain }, i) => {
      oscillator.frequency.cancelScheduledValues(now);
      if (first) oscillator.frequency.setValueAtTime(notes[i], now);
      else {
        oscillator.frequency.setValueAtTime(oscillator.frequency.value, now);
        oscillator.frequency.exponentialRampToValueAtTime(notes[i], now + 7 + i);
      }
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.014 : 0.01, now + 5);
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.01 : 0.007, now + 15);
    });
  }

  private stopAmbientTimer(): void {
    if (this.ambientTimer !== null) clearInterval(this.ambientTimer);
    this.ambientTimer = null;
  }

  play(kind: string): void {
    const ctx = this.context;
    if (
      !this.enabled ||
      !ctx ||
      !this.master ||
      ctx.state !== 'running' ||
      ctx.currentTime - this.lastSound < 0.065
    )
      return;
    this.lastSound = ctx.currentTime;
    const disaster = ['meteor', 'lightning', 'earthquake', 'fire'].includes(kind);
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = disaster ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(
      disaster ? 130 : kind === 'blessing' ? 660 : kind === 'spawn' ? 440 : 300,
      ctx.currentTime,
    );
    osc.frequency.exponentialRampToValueAtTime(disaster ? 35 : 600, ctx.currentTime + 0.24);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.055, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (disaster ? 0.5 : 0.25));
    osc.connect(gain);
    gain.connect(this.master);
    this.voices.add(osc);
    osc.onended = () => {
      this.voices.delete(osc);
      osc.disconnect();
      gain.disconnect();
    };
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  }

  destroy(): void {
    this.enabled = false;
    this.stopAmbientTimer();
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    const context = this.context;
    if (!context) return;
    this.fadeMaster(0, 0.04);
    for (const voice of this.voices) {
      try {
        voice.stop(context.currentTime + 0.05);
      } catch {
        voice.disconnect();
      }
    }
    this.voices.clear();
    this.pad = [];
    this.context = null;
    this.master = null;
    this.lastSound = -Infinity;
    // Let the envelope finish before closing to avoid an audible cutoff.
    setTimeout(() => {
      void context.close().catch(() => {});
    }, 80);
  }
}
