import { SPRINT_TARGET_LINES, type Difficulty, type Dimension } from '../../shared/contracts';

export const CLIENT_VERSION = '1.0.0';

export const TUNING = {
  simHz: 60,
  wellHeight: 10,
  /** Multiplies the guideline fall curve; 2 = every level falls half as fast. */
  fallSlowdown: 2,
  softDropFactor: 20,
  lockDelay: 0.5,
  maxLockResets: 15,
  das: 0.17,
  arr: 0.05,
  clearAnimSeconds: 0.45,
  linesPerLevel: 10,
  maxLevel: 15,
  /** Sprint finishes at this many rows; a full layer counts as wellWidth rows. */
  sprintTargetLines: SPRINT_TARGET_LINES,
  squashStiffness: 300,
  squashDamping: 18,
  squashImpulse: 2.2,
  camLag: 0.12,
  camPitchMin: (15 * Math.PI) / 180,
  camPitchMax: (75 * Math.PI) / 180,
  camDragSens: 0.005,
  fov: 50,
  shakeAmplitude: 0.18,
  shakeDecay: 7,
  particleGravity: 9.8,
  particleDrag: 1.6,
  particleLife: 1.6,
} as const;

export interface DifficultyProfile {
  wellSize: number;
  startLevel: number;
  specialPieceChance: number;
}

/** Board shape per view. 2D is the classic 10 wide × 20 tall board, one cell deep. */
export const BOARD_SHAPES: Readonly<Record<Dimension, { width: number; depth: number; height: number }>> = {
  '3d': { width: 10, depth: 10, height: TUNING.wellHeight },
  '2d': { width: 10, depth: 1, height: 20 },
};

export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = {
  easy: { wellSize: 10, startLevel: 1, specialPieceChance: 0.1 },
  normal: { wellSize: 10, startLevel: 3, specialPieceChance: 0.35 },
  hard: { wellSize: 10, startLevel: 6, specialPieceChance: 0.7 },
};
