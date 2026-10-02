import { TUNING } from '../config/tuning';

const LINE_CLEAR_BASE = [0, 100, 300, 500, 800] as const;
const EXTRA_LINE_BONUS = 400;
/** A full layer is much harder than a row, so it pays a flat bonus instead of its rows. */
export const LAYER_CLEAR_BONUS = 2000;
export const COMBO_BONUS = 50;

export const SOFT_DROP_POINTS_PER_CELL = 1;
export const HARD_DROP_POINTS_PER_CELL = 2;

/** Largest same-colour multiplier: a chain across X, Y and Z = 2³. */
export const MAX_COLOUR_MULTIPLIER = 8;

/**
 * Points for one lock that clears `lines` rows and `layers` full layers:
 * (lineTable(lines) + 2000·layers + 50·combo)·level·colourMultiplier. The row table is the
 * guideline 100/300/500/800, extended by 400 per extra row because 3D locks can finish many rows.
 */
export function clearPoints(
  lines: number,
  layers: number,
  level: number,
  combo: number,
  colourMultiplier = 1,
): number {
  if (lines <= 0 && layers <= 0) return 0;
  const lineBase = lines <= 0 ? 0 : (LINE_CLEAR_BASE[lines] ?? 800 + (lines - 4) * EXTRA_LINE_BONUS);
  return (lineBase + LAYER_CLEAR_BONUS * layers + COMBO_BONUS * combo) * level * colourMultiplier;
}

/** Progress (level, sprint) is counted in rows; a full layer counts as one row per X-row it holds. */
export function lineCredit(lines: number, layers: number, wellWidth: number): number {
  return lines + layers * wellWidth;
}

/** Tetris Guideline fall curve, slowed: seconds per cell = k·(0.8 − 0.007·(n−1))^(n−1). */
export function secondsPerCell(level: number): number {
  const n = Math.min(Math.max(level, 1), TUNING.maxLevel);
  return TUNING.fallSlowdown * Math.pow(0.8 - (n - 1) * 0.007, n - 1);
}

export function levelFor(startLevel: number, linesCleared: number): number {
  return Math.min(startLevel + Math.floor(linesCleared / TUNING.linesPerLevel), TUNING.maxLevel);
}
