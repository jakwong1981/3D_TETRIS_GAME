import type { Difficulty, Dimension, GameMode } from '../../shared/contracts';

export interface RoundRecord {
  id: string;
  playerName: string;
  playerNameLower: string;
  mode: GameMode;
  difficulty: Difficulty;
  /** Absent on documents written before the 2D mode existed; read as '3d'. */
  dimension: Dimension;
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

/** Board shape per dimension; mirrors src/game/config/tuning.ts. */
export interface WellShape {
  /** Cells in one full row. */
  rowLength: number;
  /** Cells in one full layer (3D only; a 2D layer is just a row). */
  layerArea: number;
  height: number;
}

export const WELL_SHAPES: Readonly<Record<Dimension, WellShape>> = {
  '3d': { rowLength: 10, layerArea: 10 * 10, height: 10 },
  '2d': { rowLength: 10, layerArea: 10, height: 20 },
};

/** Puzzles are 3D only and use their own small wells. */
export const PUZZLE_LAYER_AREA: Readonly<Record<Difficulty, number>> = { easy: 9, normal: 16, hard: 25 };
