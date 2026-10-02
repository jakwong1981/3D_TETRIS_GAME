import { describe, expect, it } from 'vitest';
import { ActivePiece } from '../../src/game/domain/active-piece';
import { Grid } from '../../src/game/domain/grid';
import { rotateOffset } from '../../src/game/domain/rotation';
import { vec3 } from '../../src/game/domain/vec3';

describe('rotateOffset', () => {
  it('rotates +x to +y around z', () => {
    expect(rotateOffset(vec3(1, 0, 0), 'z', 1)).toEqual(vec3(-0, 1, 0));
  });

  it('returns to the start after four quarter turns on every axis', () => {
    const p = vec3(1, 2, 3);
    for (const axis of ['x', 'y', 'z'] as const) {
      let r = p;
      for (let i = 0; i < 4; i++) r = rotateOffset(r, axis, 1);
      expect(r.x + 0).toBe(p.x);
      expect(r.y + 0).toBe(p.y);
      expect(r.z + 0).toBe(p.z);
    }
  });

  it('undoes a turn with the opposite direction', () => {
    const p = vec3(2, -1, 1);
    const back = rotateOffset(rotateOffset(p, 'x', 1), 'x', -1);
    expect([back.x + 0, back.y + 0, back.z + 0]).toEqual([2, -1, 1]);
  });
});

describe('Grid layers', () => {
  it('detects a full layer and drops the layers above it', () => {
    const grid = new Grid(2, 2, 4);
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) grid.set(vec3(x, y, 0), 1);
    grid.set(vec3(1, 1, 1), 3);

    expect(grid.findFullLayers()).toEqual([0]);
    grid.removeLayers([0]);

    expect(grid.get(vec3(1, 1, 0))).toBe(3);
    expect(grid.get(vec3(1, 1, 1))).toBe(0);
    expect(grid.findFullLayers()).toEqual([]);
  });

  it('clears a full X row without a full layer and settles each column', () => {
    const grid = new Grid(3, 3, 4);
    for (let x = 0; x < 3; x++) grid.set(vec3(x, 1, 0), 1); // row along X at y=1
    grid.set(vec3(0, 0, 0), 2); // unrelated cube on the same layer
    grid.set(vec3(2, 1, 1), 3); // sits on the row
    grid.set(vec3(2, 1, 2), 4); // stacked above

    const plan = grid.findClears(true);
    expect(plan).toMatchObject({ layers: [], lines: 1 });
    expect(plan.cells).toHaveLength(3);
    grid.removeCells(plan.cells);

    expect(grid.get(vec3(0, 0, 0))).toBe(2);
    expect(grid.get(vec3(2, 1, 0))).toBe(3);
    expect(grid.get(vec3(2, 1, 1))).toBe(4);
    expect(grid.get(vec3(2, 1, 2))).toBe(0);
    expect(grid.get(vec3(0, 1, 0))).toBe(0);
  });

  it('counts crossing X and Y rows separately but removes their shared cube once', () => {
    const grid = new Grid(3, 3, 2);
    for (let t = 0; t < 3; t++) {
      grid.set(vec3(t, 0, 0), 1);
      grid.set(vec3(0, t, 0), 1);
    }
    const plan = grid.findClears(true);
    expect(plan.lines).toBe(2);
    expect(plan.cells).toHaveLength(5);
  });

  it('treats a full layer as a layer, and ignores rows when row clears are off', () => {
    const grid = new Grid(2, 2, 3);
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) grid.set(vec3(x, y, 0), 1);
    grid.set(vec3(0, 0, 1), 1);
    grid.set(vec3(1, 0, 1), 1);

    expect(grid.findClears(true)).toMatchObject({ layers: [0], lines: 1 });
    const layerOnly = grid.findClears(false);
    expect(layerOnly).toMatchObject({ layers: [0], lines: 0 });
    expect(layerOnly.cells).toHaveLength(4);
  });

  it('treats cells above the well as free but walls and floor as solid', () => {
    const grid = new Grid(3, 3, 5);
    expect(grid.isFree(vec3(1, 1, 7))).toBe(true);
    expect(grid.isFree(vec3(-1, 1, 1))).toBe(false);
    expect(grid.isFree(vec3(1, 1, -1))).toBe(false);
  });
});

describe('ActivePiece', () => {
  it('spawns the I piece upright in a 3×3 well because it cannot lie flat', () => {
    const grid = new Grid(3, 3, 15);
    const piece = ActivePiece.spawn('I', grid);
    expect(piece.fits(grid)).toBe(true);
    const xs = new Set(piece.worldCells.map((c) => c.x));
    const ys = new Set(piece.worldCells.map((c) => c.y));
    expect(xs.size === 1 || ys.size === 1).toBe(true);
    expect(piece.worldCells.every((c) => c.x < 3 && c.y < 3)).toBe(true);
  });

  it('hard-drop distance lands on the floor of an empty well', () => {
    const grid = new Grid(4, 4, 15);
    const piece = ActivePiece.spawn('O', grid);
    const landed = piece.translated(vec3(0, 0, -piece.dropDistance(grid)));
    expect(Math.min(...landed.worldCells.map((c) => c.z))).toBe(0);
  });

  it('refuses to move through a wall', () => {
    const grid = new Grid(4, 4, 15);
    let piece: ActivePiece | null = ActivePiece.spawn('O', grid);
    for (let i = 0; i < 10 && piece; i++) piece = piece.tryMove(vec3(-1, 0, 0), grid) ?? null;
    expect(piece).toBeNull();
  });

  it('kicks a rotation away from the wall instead of failing', () => {
    const grid = new Grid(5, 5, 15);
    let piece = ActivePiece.spawn('L', grid);
    while (true) {
      const moved = piece.tryMove(vec3(1, 0, 0), grid);
      if (!moved) break;
      piece = moved;
    }
    const rotated = piece.tryRotate('z', 1, grid);
    expect(rotated).not.toBeNull();
    expect(rotated?.fits(grid)).toBe(true);
  });
});
