import { describe, expect, it } from 'vitest';
import { noteFrequency } from '../../src/game/infrastructure/music-player';

describe('noteFrequency', () => {
  it('uses A4 = 440 Hz equal temperament', () => {
    expect(noteFrequency('A4')).toBe(440);
    expect(noteFrequency('A5')).toBeCloseTo(880);
    expect(noteFrequency('E5')).toBeCloseTo(659.255, 2);
    expect(noteFrequency('G#2')).toBeCloseTo(103.826, 2);
  });

  it('rejects malformed note names', () => {
    expect(() => noteFrequency('H4')).toThrow();
  });
});
