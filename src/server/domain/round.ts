import type { Difficulty, GameMode } from '../../shared/contracts';

export interface RoundRecord {
  id: string;
  playerName: string;
  playerNameLower: string;
  mode: GameMode;
  difficulty: Difficulty;
  score: number;
  layersCleared: number;
  /** Absent on documents written before row clears existed; read as 0. */
  linesCleared: number;
  piecesPlaced: number;
  durationMs: number;
  completed: boolean;
  seed: number;
  clientVersion: string;
  playedAt: Date;
  flagged: boolean;
}

export type NewRoundRecord = Omit<RoundRecord, 'id'>;

/** Marathon and sprint wells are 10×10 on every difficulty; puzzles use their own small wells. */
export const WELL_LAYER_AREA = 10 * 10;
export const PUZZLE_LAYER_AREA: Readonly<Record<Difficulty, number>> = { easy: 9, normal: 16, hard: 25 };
export const WELL_HEIGHT = 10;
