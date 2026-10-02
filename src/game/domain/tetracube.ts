import { vec3, type Vec3 } from './vec3';

export const PIECE_KINDS = ['I', 'O', 'L', 'T', 'S', 'Branch', 'RightScrew', 'LeftScrew'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

export const CLASSIC_KINDS: readonly PieceKind[] = ['I', 'O', 'L', 'T', 'S'];
export const SPECIAL_KINDS: readonly PieceKind[] = ['Branch', 'RightScrew', 'LeftScrew'];

export type MaterialKind = 'glass' | 'metal' | 'jelly';

export interface PieceDefinition {
  kind: PieceKind;
  cells: readonly Vec3[];
  pivotIndex: number;
  color: string;
  material: MaterialKind;
}

/** J and Z are omitted on purpose: in 3D they are rotations of L and S. */
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
};

export const MATERIAL_IDS: Readonly<Record<MaterialKind, number>> = { glass: 0, metal: 1, jelly: 2 };
