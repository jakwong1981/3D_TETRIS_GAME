/**
 * "Korobeiniki" (Коробейники, 1861 Russian folk song, public domain): the melody best known as
 * the Tetris theme. Synthesised live: square-wave lead + octave-bouncing triangle bass, no files.
 *
 * Scheduling uses the standard WebAudio look-ahead pattern: a coarse JS timer wakes every 25 ms
 * and books every note that starts in the next 120 ms on the sample-accurate audio clock, so
 * timing never depends on frame rate or timer jitter.
 */

type Note = readonly [name: string, beats: number];

// Theme A, 8 bars of 4/4 in A minor. '-' = rest.
const MELODY: readonly Note[] = [
  ['E5', 1],
  ['B4', 0.5],
  ['C5', 0.5],
  ['D5', 1],
  ['C5', 0.5],
  ['B4', 0.5],
  ['A4', 1],
  ['A4', 0.5],
  ['C5', 0.5],
  ['E5', 1],
  ['D5', 0.5],
  ['C5', 0.5],
  ['B4', 1.5],
  ['C5', 0.5],
  ['D5', 1],
  ['E5', 1],
  ['C5', 1],
  ['A4', 1],
  ['A4', 1],
  ['-', 1],
  ['-', 0.5],
  ['D5', 1],
  ['F5', 0.5],
  ['A5', 1],
  ['G5', 0.5],
  ['F5', 0.5],
  ['E5', 1.5],
  ['C5', 0.5],
  ['E5', 1],
  ['D5', 0.5],
  ['C5', 0.5],
  ['B4', 1],
  ['B4', 0.5],
  ['C5', 0.5],
  ['D5', 1],
  ['E5', 1],
  ['C5', 1],
  ['A4', 1],
  ['A4', 1],
  ['-', 1],
];

// One root per half bar; each is played as 4 eighth notes alternating root / octave.
const BASS_ROOTS: readonly string[] = [
  'E2',
  'E2',
  'A2',
  'A2',
  'G#2',
  'G#2',
  'A2',
  'A2',
  'D2',
  'D2',
  'C2',
  'C2',
  'B1',
  'E2',
  'A2',
  'A2',
];

const LOOP_BEATS = 32;
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
const BASE_BPM = 132;
const MAX_BPM = 200;

const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Equal temperament: f = 440 · 2^((midi − 69) / 12). */
export function noteFrequency(name: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name);
  if (!match) throw new Error(`Bad note ${name}`);
  const [, letter = 'A', sharp, octave = '4'] = match;
  const midi = 12 * (Number(octave) + 1) + (SEMITONES[letter] ?? 0) + (sharp ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

interface ScheduledEvent {
  beat: number;
  beats: number;
  frequency: number;
  voice: 'lead' | 'bass';
}

/** Melody + bass flattened into one beat-sorted list for the scheduler. */
function buildScore(): ScheduledEvent[] {
  const events: ScheduledEvent[] = [];
  let beat = 0;
  for (const [name, beats] of MELODY) {
    if (name !== '-') events.push({ beat, beats, frequency: noteFrequency(name), voice: 'lead' });
    beat += beats;
  }
  BASS_ROOTS.forEach((root, half) => {
    const low = noteFrequency(root);
    for (let i = 0; i < 4; i++) {
      events.push({ beat: half * 2 + i * 0.5, beats: 0.5, frequency: i % 2 ? low * 2 : low, voice: 'bass' });
    }
  });
  return events.sort((a, b) => a.beat - b.beat);
}

export class MusicPlayer {
  private readonly score = buildScore();
  private readonly bus: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private bpm = BASE_BPM;
  /** Audio-clock time of beat 0 of the current loop, and the next event index to book. */
  private loopStart = 0;
  private cursor = 0;
  /** Tempo of the loop being played; `bpm` changes are picked up at the next loop boundary. */
  private loopSecondsPerBeat = 60 / BASE_BPM;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
  ) {
    this.bus = context.createGain();
    this.bus.gain.value = 0.16;
    this.bus.connect(destination);
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.loopStart = this.context.currentTime + 0.05;
    this.loopSecondsPerBeat = 60 / this.bpm;
    this.cursor = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Classic feel: the loop speeds up with the level (applied from the next loop). */
  setLevel(level: number): void {
    this.bpm = Math.min(MAX_BPM, BASE_BPM + (level - 1) * 5);
  }

  private tick(): void {
    const horizon = this.context.currentTime + LOOKAHEAD_S;
    for (;;) {
      const event = this.score[this.cursor];
      if (!event) {
        // Loop: next loop starts where this one ends; tempo changes land here.
        this.loopStart += LOOP_BEATS * this.loopSecondsPerBeat;
        this.loopSecondsPerBeat = 60 / this.bpm;
        this.cursor = 0;
        continue;
      }
      const at = this.loopStart + event.beat * this.loopSecondsPerBeat;
      if (at > horizon) return;
      this.cursor++;
      if (at < this.context.currentTime - 0.02) continue; // tab was asleep: skip, don't burst
      this.play(event, at, event.beats * this.loopSecondsPerBeat);
    }
  }

  private play(event: ScheduledEvent, at: number, duration: number): void {
    const osc = this.context.createOscillator();
    const env = this.context.createGain();
    const lead = event.voice === 'lead';
    osc.type = lead ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(event.frequency, at);
    // Short attack, held at 70 %, released before the next note so repeated notes re-articulate.
    const peak = lead ? 0.22 : 0.4;
    const release = Math.max(0.03, duration * 0.85);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.008);
    env.gain.setValueAtTime(peak * 0.7, at + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, at + release);
    osc.connect(env).connect(this.bus);
    osc.start(at);
    osc.stop(at + release + 0.02);
  }
}
