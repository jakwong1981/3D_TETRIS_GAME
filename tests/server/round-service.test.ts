import { describe, expect, it } from 'vitest';
import { ImplausibleRoundError } from '../../src/server/errors';
import { findImplausibilities } from '../../src/server/services/plausibility';
import { RoundService } from '../../src/server/services/round-service';
import { validRound } from './fixtures';
import { InMemoryRoundRepository } from './in-memory-round-repository';

const NOW = new Date('2026-10-02T12:00:00Z');

describe('plausibility', () => {
  it('accepts an ordinary round', () => {
    expect(findImplausibilities(validRound())).toEqual([]);
  });

  it('rejects more layers than cubes could fill', () => {
    expect(
      findImplausibilities(validRound({ layersCleared: 50, linesCleared: 0, piecesPlaced: 10 })),
    ).toEqual(['More layers cleared than the placed cubes could fill']);
  });

  it('rejects more lines than cubes could fill', () => {
    // 10 pieces = 40 cubes; a 10-wide row needs at least 5.5 cubes, so 7 rows is the ceiling.
    expect(
      findImplausibilities(validRound({ layersCleared: 0, linesCleared: 7, piecesPlaced: 10, score: 0 })),
    ).toEqual([]);
    expect(
      findImplausibilities(validRound({ layersCleared: 0, linesCleared: 8, piecesPlaced: 10, score: 0 })),
    ).toContain('More lines cleared than the placed cubes could fill');
  });

  it('accepts a score boosted by the ×8 same-colour multiplier', () => {
    // One XYZ chain clearing 2 rows at level 15 with combo 0: (300)·15·8 = 36 000.
    expect(
      findImplausibilities(
        validRound({ layersCleared: 0, linesCleared: 2, piecesPlaced: 6, durationMs: 60_000, score: 36_000 }),
      ),
    ).toEqual([]);
  });

  it('rejects absurd scores and inhuman speed', () => {
    const reasons = findImplausibilities(validRound({ score: 9_000_000, durationMs: 100 }));
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a sprint marked complete early', () => {
    expect(
      findImplausibilities(validRound({ mode: 'sprint', layersCleared: 0, linesCleared: 12 })),
    ).toContain('Sprint marked complete before 20 lines');
  });
});

describe('RoundService', () => {
  it('stores a round with a lower-cased name and server timestamp', async () => {
    const repo = new InMemoryRoundRepository();
    const service = new RoundService(repo, () => NOW);
    const saved = await service.submitRound(validRound({ playerName: 'AdaL' }));
    expect(saved.playedAt).toBe(NOW.toISOString());
    expect(repo.rows[0]?.playerNameLower).toBe('adal');
  });

  it('throws ImplausibleRoundError for fabricated rounds', async () => {
    const service = new RoundService(new InMemoryRoundRepository(), () => NOW);
    await expect(service.submitRound(validRound({ score: 9_999_999 }))).rejects.toBeInstanceOf(
      ImplausibleRoundError,
    );
  });

  it('ranks marathon by score and pages with a cursor', async () => {
    const service = new RoundService(new InMemoryRoundRepository(), () => NOW);
    for (const [name, score] of [
      ['A', 100],
      ['B', 300],
      ['C', 200],
    ] as const) {
      await service.submitRound(validRound({ playerName: `${name}${name}`, score }));
    }
    const first = await service.getRanking({
      mode: 'marathon',
      difficulty: 'normal',
      period: 'all',
      limit: 2,
    });
    expect(first.entries.map((e) => [e.rank, e.score])).toEqual([
      [1, 300],
      [2, 200],
    ]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.getRanking({
      mode: 'marathon',
      difficulty: 'normal',
      period: 'all',
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.entries.map((e) => [e.rank, e.score])).toEqual([[3, 100]]);
    expect(second.nextCursor).toBeNull();
  });

  it('ranks sprint by fastest completed time only', async () => {
    const service = new RoundService(new InMemoryRoundRepository(), () => NOW);
    await service.submitRound(
      validRound({
        mode: 'sprint',
        layersCleared: 0,
        linesCleared: 20,
        piecesPlaced: 60,
        durationMs: 300_000,
      }),
    );
    await service.submitRound(
      validRound({
        mode: 'sprint',
        layersCleared: 0,
        linesCleared: 20,
        piecesPlaced: 60,
        durationMs: 200_000,
      }),
    );
    await service.submitRound(
      validRound({ mode: 'sprint', layersCleared: 0, linesCleared: 0, completed: false, durationMs: 10_000 }),
    );
    const page = await service.getRanking({ mode: 'sprint', difficulty: 'normal', period: 'all', limit: 10 });
    expect(page.entries.map((e) => e.durationMs)).toEqual([200_000, 300_000]);
  });

  it('filters the daily ranking by play time', async () => {
    let now = new Date('2026-09-01T00:00:00Z');
    const service = new RoundService(new InMemoryRoundRepository(), () => now);
    await service.submitRound(validRound({ score: 999 }));
    now = NOW;
    await service.submitRound(validRound({ score: 10 }));
    const page = await service.getRanking({
      mode: 'marathon',
      difficulty: 'normal',
      period: 'day',
      limit: 10,
    });
    expect(page.entries.map((e) => e.score)).toEqual([10]);
  });

  it('returns player history newest first with personal best', async () => {
    const service = new RoundService(new InMemoryRoundRepository(), () => NOW);
    await service.submitRound(validRound({ score: 500 }));
    await service.submitRound(validRound({ score: 50 }));
    const page = await service.getPlayerRounds('ADA', { limit: 10 });
    expect(page.rounds.map((r) => r.score)).toEqual([50, 500]);
    expect(page.personalBest?.score).toBe(500);
  });
});
