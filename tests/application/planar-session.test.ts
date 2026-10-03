import { describe, expect, it } from 'vitest';
import { GameSession, type SessionEvent } from '../../src/game/application/game-session';
import { Grid } from '../../src/game/domain/grid';
import { PLANAR_CLOCKWISE, rotateOffset } from '../../src/game/domain/rotation';
import { TETROMINO_KINDS } from '../../src/game/domain/tetracube';
import { vec3 } from '../../src/game/domain/vec3';

function planarSession(seed = 4): GameSession {
  return new GameSession({ mode: 'marathon', difficulty: 'easy', dimension: '2d', seed, puzzleIndex: 0 });
}

function runClearAnimation(session: GameSession): void {
  for (let i = 0; i < 60 && session.phase === 'clearing'; i++) session.fixedUpdate(1 / 60);
}

describe('2D mode', () => {
  it('uses a classic 10 × 20 board one cell deep', () => {
    const session = planarSession();
    expect([session.grid.width, session.grid.depth, session.grid.height]).toEqual([10, 1, 20]);
  });

  it('deals only the seven tetrominoes, each once per bag', () => {
    const session = planarSession(11);
    const kinds = new Set<string>();
    for (let i = 0; i < 7 && session.piece; i++) {
      kinds.add(session.piece.kind);
      session.hardDrop();
      runClearAnimation(session);
    }
    expect(kinds).toEqual(new Set(TETROMINO_KINDS));
  });

  it('spawns every piece upright in the board plane', () => {
    for (let seed = 1; seed <= 7; seed++) {
      const piece = planarSession(seed).piece;
      expect(piece?.worldCells.every((c) => c.y === 0)).toBe(true);
    }
  });

  it('turns clockwise as seen from the front', () => {
    const top = rotateOffset(vec3(0, 0, 1), PLANAR_CLOCKWISE.axis, PLANAR_CLOCKWISE.dir);
    expect([top.x + 0, top.y + 0, top.z + 0]).toEqual([1, 0, 0]);
    const session = planarSession();
    session.rotate(PLANAR_CLOCKWISE.axis, PLANAR_CLOCKWISE.dir);
    expect(session.piece?.worldCells.every((c) => c.y === 0)).toBe(true);
  });

  it('clears a full row as one line (no 3D layer bonus) and drops the rows above', () => {
    const session = planarSession();
    const events: SessionEvent[] = [];
    session.onEvent((e) => events.push(e));
    // Slide the piece to the right wall, then fill the bottom row everywhere its landing spot
    // doesn't cover, so the drop completes exactly that row. One cube sits above, on the left.
    for (let i = 0; i < 10; i++) session.move(1, 0);
    const landing = session.ghostPiece?.worldCells ?? [];
    const gaps = new Set(landing.filter((c) => c.z === 0).map((c) => c.x));
    for (let x = 0; x < 10; x++) if (!gaps.has(x)) session.grid.set(vec3(x, 0, 0), x % 2 ? 1 : 2);
    session.grid.set(vec3(0, 0, 1), 3);
    session.hardDrop();

    const start = events.find((e) => e.type === 'clearStart');
    if (start?.type !== 'clearStart') throw new Error('expected a clear');
    expect(start.plan.layers).toEqual([]);
    expect(start.plan.lines).toBeGreaterThanOrEqual(1);
    runClearAnimation(session);
    expect(session.layersCleared).toBe(0);
    expect(session.linesCleared).toBe(start.plan.lines);
    expect(session.grid.get(vec3(0, 0, 0))).toBe(3); // the cube above fell into the cleared row
  });

  it('gives ×2 for a single-colour row and never counts one-cell depth "rows"', () => {
    const grid = new Grid(4, 1, 4);
    for (let x = 0; x < 4; x++) grid.set(vec3(x, 0, 0), 5);
    grid.set(vec3(0, 0, 1), 5);
    const plan = grid.findClears(true);
    expect(plan.rows.map((r) => r.axis)).toEqual(['x']);
    expect(plan.lines).toBe(1);
    expect(plan.cells).toHaveLength(4);
  });

  it('reports dimension in the round result', () => {
    const session = planarSession();
    const events: SessionEvent[] = [];
    session.onEvent((e) => events.push(e));
    for (let i = 0; i < 400 && session.phase !== 'over'; i++) {
      session.hardDrop();
      runClearAnimation(session);
    }
    const over = events.find((e) => e.type === 'over');
    expect(over?.type === 'over' && over.result.dimension).toBe('2d');
  });
});
