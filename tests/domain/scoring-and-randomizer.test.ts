import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/game/config/tuning';
import { createSeededRandom } from '../../src/game/domain/random';
import { PieceRandomizer } from '../../src/game/domain/randomizer';
import { clearPoints, levelFor, lineCredit, secondsPerCell } from '../../src/game/domain/scoring';
import { CLASSIC_KINDS } from '../../src/game/domain/tetracube';

describe('scoring', () => {
  it('follows the guideline row table scaled by level', () => {
    expect(clearPoints(1, 0, 1, 0)).toBe(100);
    expect(clearPoints(4, 0, 2, 0)).toBe(1600);
  });

  it('extends past four rows and adds combo bonus', () => {
    expect(clearPoints(5, 0, 1, 0)).toBe(1200);
    expect(clearPoints(1, 0, 1, 2)).toBe(200);
  });

  it('pays the flat layer bonus on top of rows', () => {
    expect(clearPoints(0, 1, 1, 0)).toBe(2000);
    expect(clearPoints(2, 1, 3, 0)).toBe((300 + 2000) * 3);
  });

  it('applies the same-colour multiplier to the whole clear', () => {
    expect(clearPoints(1, 0, 1, 0, 2)).toBe(200);
    expect(clearPoints(2, 0, 2, 1, 8)).toBe((300 + 50) * 2 * 8);
  });

  it('scores nothing when nothing clears', () => {
    expect(clearPoints(0, 0, 5, 3, 8)).toBe(0);
  });

  it('credits a full layer as one row per X-row', () => {
    expect(lineCredit(3, 2, 10)).toBe(23);
  });

  it('speeds up monotonically with level', () => {
    expect(secondsPerCell(1)).toBe(TUNING.fallSlowdown);
    for (let level = 2; level <= 15; level++)
      expect(secondsPerCell(level)).toBeLessThan(secondsPerCell(level - 1));
  });

  it('levels up every 10 lines and caps at 15', () => {
    expect(levelFor(3, 9)).toBe(3);
    expect(levelFor(3, 10)).toBe(4);
    expect(levelFor(1, 1000)).toBe(15);
  });
});

describe('PieceRandomizer', () => {
  it('is deterministic for a seed', () => {
    const a = new PieceRandomizer(createSeededRandom(42), 0.5);
    const b = new PieceRandomizer(createSeededRandom(42), 0.5);
    expect(a.peek(20)).toEqual(b.peek(20));
  });

  it('puts every classic shape in each bag when specials are disabled', () => {
    const randomizer = new PieceRandomizer(createSeededRandom(7), 0);
    const bag = Array.from({ length: CLASSIC_KINDS.length }, () => randomizer.next());
    expect(new Set(bag)).toEqual(new Set(CLASSIC_KINDS));
  });

  it('runs out after a fixed puzzle sequence', () => {
    const randomizer = new PieceRandomizer(createSeededRandom(1), 0, ['L', 'T']);
    expect([randomizer.next(), randomizer.next(), randomizer.next()]).toEqual(['L', 'T', null]);
  });
});
