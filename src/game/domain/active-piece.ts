import type { Grid } from './grid';
import { KICK_OFFSETS, rotateCells, type Axis, type Direction } from './rotation';
import { PIECE_DEFINITIONS, PIECE_KINDS, type PieceKind } from './tetracube';
import { addVec3, vec3, type Vec3 } from './vec3';

const ROTATION_AXES: readonly Axis[] = ['z', 'x', 'y'];

/** Immutable: every move returns a new piece, so a failed move leaves the old one intact. */
export class ActivePiece {
  private constructor(
    readonly kind: PieceKind,
    readonly localCells: readonly Vec3[],
    readonly position: Vec3,
  ) {}

  static spawn(kind: PieceKind, grid: Grid): ActivePiece {
    const definition = PIECE_DEFINITIONS[kind];
    const local = fitOrientation(normalize(definition.cells), grid);
    const size = bounds(local);
    const position = vec3(
      Math.floor((grid.width - size.x) / 2),
      Math.floor((grid.depth - size.y) / 2),
      grid.height - size.z,
    );
    return new ActivePiece(kind, local, position);
  }

  get cellValue(): number {
    return PIECE_KINDS.indexOf(this.kind) + 1;
  }

  get worldCells(): Vec3[] {
    return this.localCells.map((c) => addVec3(c, this.position));
  }

  fits(grid: Grid): boolean {
    return this.worldCells.every((c) => grid.isFree(c));
  }

  translated(offset: Vec3): ActivePiece {
    return new ActivePiece(this.kind, this.localCells, addVec3(this.position, offset));
  }

  tryMove(offset: Vec3, grid: Grid): ActivePiece | null {
    const moved = this.translated(offset);
    return moved.fits(grid) ? moved : null;
  }

  tryRotate(axis: Axis, dir: Direction, grid: Grid): ActivePiece | null {
    const pivot = this.localCells[PIECE_DEFINITIONS[this.kind].pivotIndex] ?? vec3(0, 0, 0);
    const rotated = new ActivePiece(this.kind, rotateCells(this.localCells, axis, dir, pivot), this.position);
    for (const kick of KICK_OFFSETS) {
      const candidate = rotated.translated(kick);
      if (candidate.fits(grid)) return candidate;
    }
    return null;
  }

  dropDistance(grid: Grid): number {
    let distance = 0;
    while (this.translated(vec3(0, 0, -(distance + 1))).fits(grid)) distance++;
    return distance;
  }

  lockInto(grid: Grid): void {
    for (const c of this.worldCells) if (grid.isInside(c)) grid.set(c, this.cellValue);
  }

  isAboveWell(grid: Grid): boolean {
    return this.worldCells.some((c) => c.z >= grid.height);
  }
}

function normalize(cells: readonly Vec3[]): Vec3[] {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const minZ = Math.min(...cells.map((c) => c.z));
  return cells.map((c) => vec3(c.x - minX, c.y - minY, c.z - minZ));
}

function bounds(cells: readonly Vec3[]): Vec3 {
  return vec3(
    Math.max(...cells.map((c) => c.x)) + 1,
    Math.max(...cells.map((c) => c.y)) + 1,
    Math.max(...cells.map((c) => c.z)) + 1,
  );
}

/** A 4-long I cannot lie flat in a 3×3 well, so spawn tries quarter turns until the shape fits. */
function fitOrientation(cells: Vec3[], grid: Grid): Vec3[] {
  const fitsFootprint = (c: Vec3[]): boolean => {
    const b = bounds(c);
    return b.x <= grid.width && b.y <= grid.depth;
  };
  if (fitsFootprint(cells)) return cells;
  for (const axis of ROTATION_AXES) {
    const turned = normalize(rotateCells(cells, axis, 1, vec3(0, 0, 0)));
    if (fitsFootprint(turned)) return turned;
  }
  throw new Error(`Piece does not fit a ${grid.width}x${grid.depth} well in any orientation`);
}
