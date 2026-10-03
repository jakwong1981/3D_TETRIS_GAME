import type { SubmitRoundRequest } from '../../src/shared/contracts';

export function validRound(overrides: Partial<SubmitRoundRequest> = {}): SubmitRoundRequest {
  return {
    playerName: 'Ada',
    mode: 'marathon',
    difficulty: 'normal',
    dimension: '3d',
    score: 1200,
    layersCleared: 1,
    linesCleared: 14,
    piecesPlaced: 120,
    durationMs: 90_000,
    completed: true,
    seed: 123,
    clientVersion: '1.0.0',
    ...overrides,
  };
}
