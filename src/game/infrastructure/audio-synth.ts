import type { MaterialKind } from '../domain/tetracube';
import { MusicPlayer } from './music-player';

/** WebAudio oscillators only — no files, and the context is created on the first user gesture. */
export class AudioSynth {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: MusicPlayer | null = null;
  /** Whether the round wants music right now (playing, not paused / over). */
  private musicWanted = false;

  constructor(private musicEnabled: boolean) {}

  unlock(): void {
    if (this.context) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.context.destination);
    this.music = new MusicPlayer(this.context, this.master);
    this.syncMusic();
  }

  get isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  /** User preference (M key). Returns the new state. */
  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    this.syncMusic();
    return this.musicEnabled;
  }

  /** Game state: true while a round is running and not paused. */
  setMusicWanted(wanted: boolean): void {
    this.musicWanted = wanted;
    this.syncMusic();
  }

  setMusicLevel(level: number): void {
    this.music?.setLevel(level);
  }

  private syncMusic(): void {
    if (!this.music) return;
    if (this.musicEnabled && this.musicWanted) this.music.start();
    else this.music.stop();
  }

  move(): void {
    this.tone({ type: 'triangle', from: 880, to: 880, duration: 0.04, gain: 0.08 });
  }

  rotate(): void {
    this.tone({ type: 'sine', from: 1320, to: 1760, duration: 0.06, gain: 0.1 });
  }

  lock(material: MaterialKind): void {
    if (material === 'glass') {
      this.tone({ type: 'sine', from: 2400, to: 2380, duration: 0.25, gain: 0.18 });
      this.tone({ type: 'sine', from: 3610, to: 3600, duration: 0.18, gain: 0.08 });
    } else if (material === 'metal') {
      // Inharmonic partials (1 : 2.76 : 5.4) read as a struck bar rather than a musical note.
      for (const ratio of [1, 2.76, 5.4])
        this.tone({
          type: 'sine',
          from: 520 * ratio,
          to: 520 * ratio,
          duration: 0.35 / ratio + 0.1,
          gain: 0.1 / ratio,
        });
    } else {
      this.tone({ type: 'sine', from: 180, to: 520, duration: 0.18, gain: 0.25 });
    }
  }

  /** `size` = rows + 4·layers (bigger clears add chord notes); `multiplier` > 1 adds a rising sparkle. */
  clear(size: number, multiplier: number): void {
    const root = 392;
    [1, 1.25, 1.5, 2].slice(0, Math.min(4, size + 1)).forEach((ratio, i) =>
      this.tone({
        type: 'sawtooth',
        from: root * ratio,
        to: root * ratio * 1.01,
        duration: 0.5,
        gain: 0.07,
        delay: i * 0.06,
      }),
    );
    this.noise(0.4, 0.2);
    // One arpeggio octave per doubling: ×2 → 1, ×4 → 2, ×8 → 3.
    const octaves = Math.round(Math.log2(multiplier));
    for (let i = 0; i < octaves * 3; i++) {
      const f = 784 * 2 ** (i / 3);
      this.tone({ type: 'triangle', from: f, to: f, duration: 0.18, gain: 0.09, delay: 0.25 + i * 0.07 });
    }
  }

  gameOver(): void {
    this.tone({ type: 'triangle', from: 440, to: 110, duration: 0.9, gain: 0.2 });
  }

  private tone(o: {
    type: OscillatorType;
    from: number;
    to: number;
    duration: number;
    gain: number;
    delay?: number;
  }): void {
    if (!this.context || !this.master) return;
    const t0 = this.context.currentTime + (o.delay ?? 0);
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t0);
    osc.frequency.exponentialRampToValueAtTime(o.to, t0 + o.duration);
    env.gain.setValueAtTime(o.gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + o.duration + 0.02);
  }

  private noise(duration: number, gain: number): void {
    if (!this.context || !this.master) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    const env = this.context.createGain();
    env.gain.value = gain;
    source.buffer = buffer;
    source.connect(env).connect(this.master);
    source.start();
  }
}
