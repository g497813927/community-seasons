import type { SceneKind } from './scenes';

// Four original seasonal scores, synthesized locally without audio downloads.
// Eighth-note patterns keep the arrangement small while each season has its own
// harmony, pace, phrasing and instrument balance.
interface Score {
  bpm: number;
  melody: readonly (readonly (number | null)[])[];
  chords: readonly (readonly number[])[];
  lead: OscillatorType;
  leadLength: number;
  leadAttack: number;
  leadVolume: number;
  overtone: number;
  bassVolume: number;
  padVolume: number;
  bassBeats: readonly number[];
  kickBeats: readonly number[];
  shakerBeats: readonly number[];
  kickVolume: number;
  shakerVolume: number;
}

const SCORES: Record<SceneKind, Score> = {
  spring: {
    bpm: 108,
    melody: [
      [74, null, 78, 81, null, 78, 76, null],
      [74, 76, null, 78, 81, null, 78, 74],
      [79, null, 83, 86, null, 83, 81, null],
      [79, 81, null, 83, 86, null, 83, 79],
      [78, null, 74, 71, null, 74, 78, null],
      [81, null, 78, 74, null, 71, 74, 78],
      [76, null, 73, 69, null, 73, 76, null],
      [76, 78, null, 81, 78, 76, 73, null],
    ],
    chords: [
      [50, 54, 57],
      [55, 59, 62],
      [47, 50, 54],
      [45, 49, 52],
    ],
    lead: 'sine',
    leadLength: 0.82,
    leadAttack: 0.008,
    leadVolume: 0.031,
    overtone: 12,
    bassVolume: 0.038,
    padVolume: 0.005,
    bassBeats: [0, 4],
    kickBeats: [0, 4],
    shakerBeats: [3, 7],
    kickVolume: 0.037,
    shakerVolume: 0.01,
  },
  summer: {
    bpm: 128,
    melody: [
      [67, null, 71, 74, null, 71, 74, 76],
      [74, 71, null, 67, 69, null, 71, 74],
      [72, null, 76, 79, null, 76, 79, 81],
      [79, 76, null, 72, 74, null, 76, 79],
      [71, null, 67, 64, null, 67, 71, 74],
      [76, 74, 71, null, 67, null, 71, 74],
      [74, null, 78, 81, null, 78, 76, 74],
      [78, 76, null, 74, 69, null, 71, 74],
    ],
    chords: [
      [43, 47, 50],
      [48, 52, 55],
      [40, 43, 47],
      [50, 54, 57],
    ],
    lead: 'triangle',
    leadLength: 0.59,
    leadAttack: 0.005,
    leadVolume: 0.028,
    overtone: 0,
    bassVolume: 0.046,
    padVolume: 0.003,
    bassBeats: [0, 3, 4, 7],
    kickBeats: [0, 4, 6],
    shakerBeats: [1, 3, 5, 7],
    kickVolume: 0.05,
    shakerVolume: 0.015,
  },
  autumn: {
    bpm: 94,
    melody: [
      [69, null, null, 72, 76, null, 72, null],
      [71, 69, null, 67, null, 64, null, null],
      [69, null, 72, null, 77, null, 76, 72],
      [69, null, null, 65, null, 69, null, null],
      [67, null, 72, 76, null, null, 74, null],
      [72, null, 67, null, 64, null, null, null],
      [71, null, 74, null, 79, null, 77, 74],
      [71, null, null, 67, null, 69, null, null],
    ],
    chords: [
      [45, 48, 52],
      [41, 45, 48],
      [48, 52, 55],
      [43, 47, 50],
    ],
    lead: 'triangle',
    leadLength: 1.18,
    leadAttack: 0.025,
    leadVolume: 0.029,
    overtone: 0,
    bassVolume: 0.036,
    padVolume: 0.007,
    bassBeats: [0, 4],
    kickBeats: [0],
    shakerBeats: [3, 7],
    kickVolume: 0.026,
    shakerVolume: 0.007,
  },
  winter: {
    bpm: 76,
    melody: [
      [76, null, null, 83, null, null, 79, null],
      [78, null, null, null, 76, null, null, null],
      [79, null, null, 86, null, null, 83, null],
      [81, null, null, null, 79, null, null, null],
      [76, null, null, 79, null, null, 84, null],
      [83, null, null, null, 79, null, null, null],
      [78, null, null, 83, null, null, 86, null],
      [81, null, null, null, 78, null, null, null],
    ],
    chords: [
      [52, 55, 59],
      [55, 59, 62],
      [48, 52, 55],
      [47, 50, 54],
    ],
    lead: 'sine',
    leadLength: 1.85,
    leadAttack: 0.012,
    leadVolume: 0.026,
    overtone: 24,
    bassVolume: 0.025,
    padVolume: 0.006,
    bassBeats: [0],
    kickBeats: [],
    shakerBeats: [7],
    kickVolume: 0,
    shakerVolume: 0.004,
  },
};

const FADE_SECONDS = 0.04;
const STOP_GAP = 0.005;
const LEAD_SECONDS = 0.03;
const MASTER_VOLUME = 0.42;
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

export class BackgroundMusic {
  private readonly master: GainNode;
  private readonly noise: AudioBuffer;
  private readonly voices = new Map<
    AudioScheduledSourceNode,
    { start: number; stop: number }
  >();
  private scene: SceneKind = 'spring';
  private playing = false;
  private disposed = false;
  private step = 0;
  private nextAt = 0;
  private silentAfter = 0;

  constructor(private readonly context: AudioContext) {
    this.master = context.createGain();
    this.master.gain.value = 0;
    this.master.connect(context.destination);
    this.noise = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.12),
      context.sampleRate,
    );
    const samples = this.noise.getChannelData(0);
    let seed = 6241;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = ((seed / 0xffffffff) * 2 - 1) * (1 - i / samples.length);
    }
  }

  // Safe to call from every frame. A paused/hidden/muted transport stays paused.
  setScene(scene: SceneKind) {
    if (this.disposed || scene === this.scene) return;
    this.scene = scene;
    this.step = 0;
    if (this.playing) this.restart();
  }

  play(reset = false) {
    if (this.disposed) return;
    if (reset) {
      this.step = 0;
      if (this.playing) {
        this.restart();
        return;
      }
    }
    if (this.playing) return;
    this.playing = true;
    // A quick pause/resume must still let the old voices finish fading first.
    this.nextAt = Math.max(
      this.context.currentTime + LEAD_SECONDS,
      this.silentAfter + STOP_GAP,
    );
    this.fadeIn(this.nextAt);
    this.tick();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.stopScore();
  }

  // The game's animation loop supplies the clock. No independent timer keeps
  // playing after the game is hidden, paused, or unmounted.
  tick() {
    if (!this.playing || this.disposed || this.context.state !== 'running')
      return;
    const now = this.context.currentTime;
    if (this.nextAt < now - 0.3) this.nextAt = now + LEAD_SECONDS;
    const stepSeconds = 60 / SCORES[this.scene].bpm / 2;
    while (this.nextAt < now + 0.18) {
      this.schedule(this.step, this.nextAt);
      this.step = (this.step + 1) % 128;
      this.nextAt += stepSeconds;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.master.disconnect();
  }

  private restart() {
    this.stopScore();
    this.nextAt = this.silentAfter + STOP_GAP;
    this.fadeIn(this.nextAt);
    this.tick();
  }

  private stopScore() {
    const now = this.context.currentTime;
    const gain = this.master.gain;
    const currentVolume = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(currentVolume, now);
    gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    this.silentAfter = now + FADE_SECONDS + STOP_GAP;
    for (const [voice, window] of this.voices) {
      // Repeated stop() calls replace a source's deadline. Never extend an
      // earlier fade, and cancel obsolete notes that have not started yet.
      window.stop =
        window.start >= now ? now : Math.min(window.stop, this.silentAfter);
      try {
        voice.stop(window.stop);
      } catch {
        /* Already ended. */
      }
    }
  }

  private fadeIn(at: number) {
    // Preserve the preceding fade-out. New-theme notes start only after every
    // old source's stop deadline, so two seasonal scores never play together.
    this.master.gain.setValueAtTime(0, at);
    this.master.gain.linearRampToValueAtTime(MASTER_VOLUME, at + FADE_SECONDS);
  }

  private connect(
    source: AudioScheduledSourceNode,
    gain: GainNode,
    at: number,
    length: number,
  ) {
    source.connect(gain);
    gain.connect(this.master);
    this.voices.set(source, { start: at, stop: at + length });
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    source.start(at);
    source.stop(at + length);
  }

  private note(
    note: number,
    at: number,
    length: number,
    volume: number,
    type: OscillatorType = 'triangle',
    attack = 0.008,
  ) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency(note), at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    this.connect(oscillator, gain, at, length + 0.02);
  }

  private percussion(at: number, strong: boolean, score: Score) {
    if (strong) {
      const drum = this.context.createOscillator();
      const gain = this.context.createGain();
      drum.type = 'sine';
      drum.frequency.setValueAtTime(score.bpm, at);
      drum.frequency.exponentialRampToValueAtTime(48, at + 0.13);
      gain.gain.setValueAtTime(score.kickVolume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
      this.connect(drum, gain, at, 0.19);
    } else {
      const shaker = this.context.createBufferSource();
      const gain = this.context.createGain();
      shaker.buffer = this.noise;
      gain.gain.setValueAtTime(score.shakerVolume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      this.connect(shaker, gain, at, 0.09);
    }
  }

  private schedule(step: number, at: number) {
    const score = SCORES[this.scene];
    const stepSeconds = 60 / score.bpm / 2;
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const chord = score.chords[Math.floor(bar / 2) % score.chords.length];
    const melody = score.melody[bar % score.melody.length][beat];
    if (melody !== null) {
      this.note(
        melody,
        at,
        stepSeconds * score.leadLength,
        score.leadVolume,
        score.lead,
        score.leadAttack,
      );
      if (score.overtone) {
        this.note(
          melody + score.overtone,
          at,
          stepSeconds * 0.5,
          score.leadVolume * 0.16,
          'sine',
        );
      }
    }
    if (score.bassBeats.includes(beat)) {
      this.note(
        chord[0] - 12,
        at,
        stepSeconds * 1.65,
        score.bassVolume,
        'sine',
      );
    }
    if (score.kickBeats.includes(beat)) this.percussion(at, true, score);
    if (score.shakerBeats.includes(beat)) this.percussion(at, false, score);
    if (beat === 0) {
      for (const note of chord)
        this.note(
          note + 12,
          at,
          stepSeconds * 7.5,
          score.padVolume,
          'sine',
          0.3,
        );
    }
  }
}
