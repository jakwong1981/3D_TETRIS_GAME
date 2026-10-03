import { SPRINT_TARGET_LINES, type SubmitRoundRequest } from '../../shared/contracts';
import { PUZZLE_LAYER_AREA, WELL_SHAPES } from '../domain/round';

const MAX_LEVEL = 15;
const SOFT_DROP_POINTS_PER_CELL = 1;
const HARD_DROP_POINTS_PER_CELL = 2;
// Mirrors src/game/domain/scoring.ts: per lock (rowTable + 2000·layers + 50·combo)·level·colour.
// The row table never exceeds 400 points per row, the colour multiplier is at most 2³, and the
// combo counter can't exceed the number of clears.
const MAX_POINTS_PER_ROW = 400;
const LAYER_CLEAR_BONUS = 2000;
const COMBO_BONUS = 50;
const MAX_COLOUR_MULTIPLIER = 8;
const MIN_MS_PER_PIECE = 60;
const MAX_PUZZLE_PREFILL_CELLS = 40;

/**
 * Cheap sanity bounds derived from the scoring rules. They cannot prove a score is honest
 * (v1 has no auth), but they reject obviously fabricated payloads.
 */
export function findImplausibilities(round: SubmitRoundRequest): string[] {
  const reasons: string[] = [];
  const shape = WELL_SHAPES[round.dimension];
  const puzzle = round.mode === 'puzzle';
  const area = puzzle ? PUZZLE_LAYER_AREA[round.difficulty] : shape.layerArea;
  const cubes = round.piecesPlaced * 4 + (puzzle ? MAX_PUZZLE_PREFILL_CELLS : 0);

  if (round.dimension === '2d' && (puzzle || round.layersCleared > 0)) {
    reasons.push('2D rounds have no puzzles or layer clears');
  }
  if (round.layersCleared * area > cubes) {
    reasons.push('More layers cleared than the placed cubes could fill');
  }
  // 3D rows crossing on one layer share corners; the cheapest layout (W−1 rows × W−1 columns)
  // still needs (W+1)/2 cubes per row. A 2D row shares nothing, so it needs all W cubes.
  const side = puzzle ? Math.sqrt(area) : shape.rowLength;
  const cubesPerRow = round.dimension === '2d' ? side : (side + 1) / 2;
  if (round.linesCleared * cubesPerRow > cubes) {
    reasons.push('More lines cleared than the placed cubes could fill');
  }

  const clears = round.linesCleared + round.layersCleared;
  const maxClearPoints =
    (MAX_POINTS_PER_ROW * round.linesCleared +
      LAYER_CLEAR_BONUS * round.layersCleared +
      COMBO_BONUS * clears * clears) *
    MAX_LEVEL *
    MAX_COLOUR_MULTIPLIER;
  // A piece can fall at most the well height plus its own height; hard drop pays more per cell.
  // ×10 headroom covers kicks and lock-delay stalling that can add a few extra soft-drop cells.
  const maxDropPerPiece =
    (shape.height + 4) * Math.max(SOFT_DROP_POINTS_PER_CELL, HARD_DROP_POINTS_PER_CELL) * 10;
  const maxScore = round.piecesPlaced * maxDropPerPiece + maxClearPoints;
  if (round.score > maxScore) reasons.push('Score exceeds the maximum possible for this round');
  if (round.durationMs < round.piecesPlaced * MIN_MS_PER_PIECE)
    reasons.push('Pieces placed faster than humanly possible');
  if (round.mode === 'sprint' && round.completed && round.linesCleared < SPRINT_TARGET_LINES) {
    reasons.push(`Sprint marked complete before ${SPRINT_TARGET_LINES} lines`);
  }
  return reasons;
}
