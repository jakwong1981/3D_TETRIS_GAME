import type { PieceKind } from './tetracube';

/**
 * Layers are listed bottom-up; each layer is rows of y, each row a string over x.
 * 'X' = prefilled, '.' = empty. Every puzzle is solvable with the given sequence.
 */
export interface PuzzleDefinition {
  name: string;
  size: number;
  layers: readonly (readonly string[])[];
  pieces: readonly PieceKind[];
}

export const PUZZLES: readonly PuzzleDefinition[] = [
  { name: 'Corner', size: 3, layers: [['...', 'XX.', 'XXX']], pieces: ['L'] },
  { name: 'Notch', size: 3, layers: [['...', 'X.X', 'XXX']], pieces: ['T'] },
  {
    name: 'Twin Squares',
    size: 3,
    layers: [
      ['..X', '..X', 'XXX'],
      ['..X', '..X', 'XXX'],
    ],
    pieces: ['O', 'O'],
  },
  {
    name: 'Tripod',
    size: 3,
    // Needs X pressed twice so the tripod's leg points down into the lower hole.
    layers: [
      ['XXX', '.XX', 'XXX'],
      ['.XX', '..X', 'XXX'],
    ],
    pieces: ['Branch'],
  },
  {
    name: 'Double Lane',
    size: 4,
    layers: [
      ['....', 'XXXX', 'XXXX', 'XXXX'],
      ['....', 'XXXX', 'XXXX', 'XXXX'],
    ],
    pieces: ['I', 'I'],
  },
];

/** Far above any piece's cell value (index + 1), so new piece kinds never collide with it. */
export const PUZZLE_PREFILL_VALUE = 200;
