import { SPRINT_TARGET_LINES, type SubmitRoundRequest } from '../../shared/contracts';
import { PUZZLE_LAYER_AREA, WELL_HEIGHT, WELL_LAYER_AREA } from '../domain/round';

const MAX_LEVEL = 15;
const MAX_DROP_POINTS_PER_PIECE = WELL_HEIGHT * 2 + WELL_HEIGHT * 20; // hard drop + soft-drop ceiling
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
  const area = round.mode === 'puzzle' ? PUZZLE_LAYER_AREA[round.difficulty] : WELL_LAYER_AREA;
  const side = Math.sqrt(area);
  const cubes = round.piecesPlaced * 4 + (round.mode === 'puzzle' ? MAX_PUZZLE_PREFILL_CELLS : 0);
  if (round.layersCleared * area > cubes) {
    reasons.push('More layers cleared than the placed cubes could fill');
  }
  // Rows crossing on one layer share corners; the cheapest layout (W−1 rows × W−1 columns)
  // still needs (W+1)/2 cubes per row. Full layers are credited W rows of W cubes each.
  if ((round.linesCleared * (side + 1)) / 2 > cubes) {
    reasons.push('More lines cleared than the placed cubes could fill');
  }
  const clears = round.linesCleared + round.layersCleared;
  const maxClearPoints =
    (MAX_POINTS_PER_ROW * round.linesCleared +
      LAYER_CLEAR_BONUS * round.layersCleared +
      COMBO_BONUS * clears * clears) *
    MAX_LEVEL *
    MAX_COLOUR_MULTIPLIER;
  const maxScore = round.piecesPlaced * MAX_DROP_POINTS_PER_PIECE + maxClearPoints;
  if (round.score > maxScore) reasons.push('Score exceeds the maximum possible for this round');
  if (round.durationMs < round.piecesPlaced * MIN_MS_PER_PIECE)
    reasons.push('Pieces placed faster than humanly possible');
  if (round.mode === 'sprint' && round.completed && round.linesCleared < SPRINT_TARGET_LINES) {
    reasons.push(`Sprint marked complete before ${SPRINT_TARGET_LINES} lines`);
  }
  return reasons;
}
