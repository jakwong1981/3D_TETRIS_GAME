import { vec3, type Vec3 } from './vec3';

// Order matters: cell value = index + 1, so new kinds are only ever appended.
export const PIECE_KINDS = ['I', 'O', 'L', 'T', 'S', 'Branch', 'RightScrew', 'LeftScrew', 'J', 'Z'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** 3D bag: J and Z are rotations of L and S in 3D, so only five classic shapes. */
export const CLASSIC_KINDS: readonly PieceKind[] = ['I', 'O', 'L', 'T', 'S'];
export const SPECIAL_KINDS: readonly PieceKind[] = ['Branch', 'RightScrew', 'LeftScrew'];
/** 2D bag: the seven classic tetrominoes; in a flat board mirror images are different pieces. */
export const TETROMINO_KINDS: readonly PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export type MaterialKind = 'glass' | 'metal' | 'jelly';

export interface PieceDefinition {
  kind: PieceKind;
  cells: readonly Vec3[];
  pivotIndex: number;
  color: string;
  material: MaterialKind;
}

/** Shapes are drawn in the x-y plane; spawn turns them upright when the board is 2D. */
export const PIECE_DEFINITIONS: Readonly<Record<PieceKind, PieceDefinition>> = {
  I: {
    kind: 'I',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), vec3(3, 0, 0)],
    pivotIndex: 1,
    color: '#00e5ff',
    material: 'glass',
  },
  O: {
    kind: 'O',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 1, 0)],
    pivotIndex: 0,
    color: '#ffd400',
    material: 'metal',
  },
  L: {
    kind: 'L',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), vec3(2, 1, 0)],
    pivotIndex: 1,
    color: '#ff8a00',
    material: 'jelly',
  },
  T: {
    kind: 'T',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), vec3(1, 1, 0)],
    pivotIndex: 1,
    color: '#c040ff',
    material: 'glass',
  },
  S: {
    kind: 'S',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(2, 1, 0)],
    pivotIndex: 1,
    color: '#38ff6a',
    material: 'jelly',
  },
  Branch: {
    kind: 'Branch',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(0, 0, 1)],
    pivotIndex: 0,
    color: '#ff2d55',
    material: 'metal',
  },
  RightScrew: {
    kind: 'RightScrew',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(1, 1, 0), vec3(1, 1, 1)],
    pivotIndex: 1,
    color: '#2f6bff',
    material: 'glass',
  },
  LeftScrew: {
    kind: 'LeftScrew',
    cells: [vec3(0, 0, 1), vec3(1, 0, 1), vec3(1, 1, 1), vec3(1, 1, 0)],
    pivotIndex: 1,
    color: '#ff4fd8',
    material: 'jelly',
  },
  J: {
    kind: 'J',
    cells: [vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), vec3(0, 1, 0)],
    pivotIndex: 1,
    color: '#3d7bff',
    material: 'metal',
  },
  Z: {
    kind: 'Z',
    cells: [vec3(0, 1, 0), vec3(1, 1, 0), vec3(1, 0, 0), vec3(2, 0, 0)],
    pivotIndex: 2,
    color: '#ff3b3b',
    material: 'glass',
  },
};

export const MATERIAL_IDS: Readonly<Record<MaterialKind, number>> = { glass: 0, metal: 1, jelly: 2 };
