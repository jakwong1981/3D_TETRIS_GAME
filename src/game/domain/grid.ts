import type { Vec3 } from './vec3';

export const EMPTY_CELL = 0;

/** Cell value 0 = empty, otherwise (pieceKindIndex + 1). Index = x + W·(y + D·z). */
export class Grid {
  private readonly cells: Uint8Array;

  constructor(
    readonly width: number,
    readonly depth: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * depth * height);
  }

  get layerArea(): number {
    return this.width * this.depth;
  }

  isInside(p: Vec3): boolean {
    return p.x >= 0 && p.x < this.width && p.y >= 0 && p.y < this.depth && p.z >= 0 && p.z < this.height;
  }

  /** Cells above the well top count as free so pieces can rotate while partly above it. */
  isFree(p: Vec3): boolean {
    if (p.x < 0 || p.x >= this.width || p.y < 0 || p.y >= this.depth || p.z < 0) return false;
    if (p.z >= this.height) return true;
    return this.get(p) === EMPTY_CELL;
  }

  get(p: Vec3): number {
    return this.cells[this.index(p)] ?? EMPTY_CELL;
  }

  set(p: Vec3, value: number): void {
    this.cells[this.index(p)] = value;
  }

  isLayerFull(z: number): boolean {
    const start = z * this.layerArea;
    for (let i = start; i < start + this.layerArea; i++) if (this.cells[i] === EMPTY_CELL) return false;
    return true;
  }

  findFullLayers(): number[] {
    const full: number[] = [];
    for (let z = 0; z < this.height; z++) if (this.isLayerFull(z)) full.push(z);
    return full;
  }

  /**
   * Everything that clears after a lock. A full layer clears whole and counts as a layer. With
   * `rowClears`, each full row along X (fixed y) or along Y (fixed x) on any other layer clears
   * too. Crossing rows share their corner cell, so `cells` is the de-duplicated union. `rows`
   * lists every full row (also those inside full layers) for the same-colour bonus.
   */
  findClears(rowClears: boolean): ClearPlan {
    const layers: number[] = [];
    const rows: ClearedRow[] = [];
    const marked = new Set<number>();
    let lines = 0;
    for (let z = 0; z < this.height; z++) {
      const layerFull = this.isLayerFull(z);
      if (!layerFull && !rowClears) continue;
      if (layerFull) layers.push(z);
      for (let y = 0; y < this.depth; y++) {
        const row = this.fullRow(
          'x',
          Array.from({ length: this.width }, (_, x) => ({ x, y, z })),
        );
        if (row) rows.push(row);
      }
      for (let x = 0; x < this.width; x++) {
        const row = this.fullRow(
          'y',
          Array.from({ length: this.depth }, (_, y) => ({ x, y, z })),
        );
        if (row) rows.push(row);
      }
      if (layerFull) {
        for (let i = z * this.layerArea; i < (z + 1) * this.layerArea; i++) marked.add(i);
      } else {
        for (const row of rows) if (row.z === z) lines++;
        for (const row of rows) if (row.z === z) for (const c of row.cells) marked.add(this.index(c));
      }
    }
    const cells = [...marked].sort((a, b) => a - b).map((i) => this.cellAt(i));
    return { layers, lines, cells, rows };
  }

  /**
   * Removes cells and lets each column settle: a cube drops by the number of removed cells
   * beneath it in its own (x, y) column. Clearing a full layer is the special case where
   * every column loses the same z.
   */
  removeCells(cells: readonly Vec3[]): void {
    const removed = new Set(cells.map((c) => this.index(c)));
    for (let y = 0; y < this.depth; y++) {
      for (let x = 0; x < this.width; x++) {
        let writeZ = 0;
        for (let readZ = 0; readZ < this.height; readZ++) {
          const from = this.index({ x, y, z: readZ });
          if (removed.has(from)) continue;
          this.cells[this.index({ x, y, z: writeZ })] = this.cells[from] ?? EMPTY_CELL;
          writeZ++;
        }
        for (let z = writeZ; z < this.height; z++) this.cells[this.index({ x, y, z })] = EMPTY_CELL;
      }
    }
  }

  /** Removes layers and lets everything above fall by the number of removed layers below it. */
  removeLayers(layers: readonly number[]): void {
    const removed = new Set(layers);
    let writeZ = 0;
    for (let readZ = 0; readZ < this.height; readZ++) {
      if (removed.has(readZ)) continue;
      if (writeZ !== readZ) {
        this.cells.copyWithin(writeZ * this.layerArea, readZ * this.layerArea, (readZ + 1) * this.layerArea);
      }
      writeZ++;
    }
    this.cells.fill(EMPTY_CELL, writeZ * this.layerArea);
  }

  isEmpty(): boolean {
    return this.cells.every((c) => c === EMPTY_CELL);
  }

  forEachFilled(visit: (x: number, y: number, z: number, value: number) => void): void {
    for (let i = 0; i < this.cells.length; i++) {
      const value = this.cells[i] ?? EMPTY_CELL;
      if (value === EMPTY_CELL) continue;
      const x = i % this.width;
      const y = Math.floor(i / this.width) % this.depth;
      const z = Math.floor(i / this.layerArea);
      visit(x, y, z, value);
    }
  }

  /** Flat cell index, also used by the renderer as a cheap set key. */
  index(p: Vec3): number {
    return p.x + this.width * (p.y + this.depth * p.z);
  }

  private cellAt(i: number): Vec3 {
    return {
      x: i % this.width,
      y: Math.floor(i / this.width) % this.depth,
      z: Math.floor(i / this.layerArea),
    };
  }

  /** The row if every cell is filled; `colour` is the shared cell value, or null if mixed. */
  private fullRow(axis: RowAxis, cells: Vec3[]): ClearedRow | null {
    const first = cells[0];
    if (!first) return null;
    const firstValue = this.get(first);
    let colour: number | null = firstValue;
    for (const c of cells) {
      const value = this.get(c);
      if (value === EMPTY_CELL) return null;
      if (value !== firstValue) colour = null;
    }
    return { axis, z: first.z, cells, colour };
  }
}

export type RowAxis = 'x' | 'y';

export interface ClearedRow {
  /** Direction the row runs in. */
  axis: RowAxis;
  z: number;
  cells: Vec3[];
  /** Cell value shared by the whole row, or null when the row mixes colours. */
  colour: number | null;
}

export interface ClearPlan {
  /** Heights of layers that were completely full. */
  layers: number[];
  /** Full rows on the non-full layers (X rows + Y rows); full layers are counted in `layers`. */
  lines: number;
  /** Every cell that will be removed, without duplicates. */
  cells: Vec3[];
  /** Every full row that is being removed, including the rows inside full layers. */
  rows: ClearedRow[];
}
