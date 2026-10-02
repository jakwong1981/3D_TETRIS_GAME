import { describe, expect, it } from 'vitest';
import { colourBonus } from '../../src/game/domain/colour-bonus';
import { Grid } from '../../src/game/domain/grid';
import { vec3 } from '../../src/game/domain/vec3';

const NONE = new Set<number>();

function fillRow(grid: Grid, axis: 'x' | 'y', fixed: number, z: number, colour: number): void {
  for (let t = 0; t < grid.width; t++) grid.set(axis === 'x' ? vec3(t, fixed, z) : vec3(fixed, t, z), colour);
}

function bonusOf(grid: Grid, excluded: ReadonlySet<number> = NONE) {
  return colourBonus(grid.findClears(true).rows, excluded);
}

describe('colourBonus', () => {
  it('gives nothing for a mixed-colour row', () => {
    const grid = new Grid(3, 3, 3);
    fillRow(grid, 'x', 0, 0, 1);
    grid.set(vec3(1, 0, 0), 2);
    expect(bonusOf(grid)).toEqual({ axes: [], multiplier: 1 });
  });

  it('doubles a single same-colour row', () => {
    const grid = new Grid(3, 3, 3);
    fillRow(grid, 'x', 0, 0, 1);
    expect(bonusOf(grid)).toEqual({ axes: ['x'], multiplier: 2 });
  });

  it('gives ×4 when same-colour X and Y rows cross', () => {
    const grid = new Grid(3, 3, 3);
    fillRow(grid, 'x', 0, 0, 1);
    fillRow(grid, 'y', 0, 0, 1);
    expect(bonusOf(grid)).toEqual({ axes: ['x', 'y'], multiplier: 4 });
  });

  it('gives ×8 when the XY chain also continues to the next layer', () => {
    const grid = new Grid(3, 3, 3);
    fillRow(grid, 'x', 0, 0, 1);
    fillRow(grid, 'y', 0, 0, 1);
    fillRow(grid, 'x', 0, 1, 1); // directly above the z=0 X row
    expect(bonusOf(grid)).toEqual({ axes: ['x', 'y', 'z'], multiplier: 8 });
  });

  it('does not chain rows of different colours', () => {
    const grid = new Grid(3, 3, 3);
    fillRow(grid, 'x', 0, 0, 1);
    fillRow(grid, 'y', 2, 0, 2); // crosses (2,0,0), which is now colour 2
    // The X row now mixes colours, so only the Y row is mono.
    expect(bonusOf(grid)).toEqual({ axes: ['y'], multiplier: 2 });
  });

  it('does not chain same-colour rows that do not touch', () => {
    const grid = new Grid(3, 3, 4);
    fillRow(grid, 'x', 0, 0, 1);
    fillRow(grid, 'y', 2, 2, 1); // two layers up: no shared column across one step
    expect(bonusOf(grid).multiplier).toBe(2);
  });

  it('ignores excluded (puzzle prefill) colours', () => {
    const grid = new Grid(3, 3, 3);
    fillRow(grid, 'x', 0, 0, 9);
    expect(bonusOf(grid, new Set([9])).multiplier).toBe(1);
  });
});
