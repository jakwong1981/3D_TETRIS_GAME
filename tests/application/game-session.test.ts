import { describe, expect, it } from 'vitest';
import { GameSession, type SessionEvent } from '../../src/game/application/game-session';
import { PUZZLES } from '../../src/game/domain/puzzles';
import { vec3 } from '../../src/game/domain/vec3';

function puzzleSession(index: number): { session: GameSession; events: SessionEvent[] } {
  const session = new GameSession({
    mode: 'puzzle',
    difficulty: 'easy',
    dimension: '3d',
    seed: 1,
    puzzleIndex: index,
  });
  const events: SessionEvent[] = [];
  session.onEvent((e) => events.push(e));
  return { session, events };
}

function runClearAnimation(session: GameSession): void {
  for (let i = 0; i < 60 && session.phase === 'clearing'; i++) session.fixedUpdate(1 / 60);
}

describe('GameSession', () => {
  it('solves the Corner puzzle with one hard drop', () => {
    const { session, events } = puzzleSession(0);
    session.hardDrop();
    expect(session.phase).toBe('clearing');
    runClearAnimation(session);
    const over = events.find((e) => e.type === 'over');
    expect(over?.type === 'over' && over.result.completed).toBe(true);
    expect(session.grid.isEmpty()).toBe(true);
  });

  it('every puzzle preset is solvable with the given pieces', () => {
    PUZZLES.forEach((_, index) => {
      const { session } = puzzleSession(index);
      for (let guard = 0; guard < 10 && session.phase !== 'over'; guard++) {
        if (index === 3) {
          session.rotate('x', 1);
          session.rotate('x', 1);
          for (let i = 0; i < 4; i++) session.move(-1, 0);
        }
        if (index === 3 || index === 4) {
          for (let i = 0; i < 4; i++) session.move(0, -1);
        }
        session.hardDrop();
        runClearAnimation(session);
      }
      expect(session.grid.isEmpty()).toBe(true);
    });
  });

  it('clears a same-colour row in marathon with the ×2 bonus and credits a line', () => {
    const session = new GameSession({
      mode: 'marathon',
      difficulty: 'easy',
      dimension: '3d',
      seed: 5,
      puzzleIndex: 0,
    });
    const events: SessionEvent[] = [];
    session.onEvent((e) => events.push(e));
    // A full single-colour X row on the floor at the back edge, away from where pieces land.
    const y = session.grid.depth - 1;
    for (let x = 0; x < session.grid.width; x++) session.grid.set(vec3(x, y, 0), 1);

    session.hardDrop();
    const start = events.find((e) => e.type === 'clearStart');
    expect(start?.type === 'clearStart' && start.bonus.multiplier).toBe(2);
    expect(start?.type === 'clearStart' && start.plan.lines).toBeGreaterThanOrEqual(1);
    runClearAnimation(session);
    expect(session.linesCleared).toBeGreaterThanOrEqual(1);
    for (let x = 0; x < session.grid.width; x++) expect(session.grid.get(vec3(x, y, 0))).not.toBe(1);
  });

  it('ends a marathon when the stack tops out', () => {
    const session = new GameSession({
      mode: 'marathon',
      difficulty: 'easy',
      dimension: '3d',
      seed: 3,
      puzzleIndex: 0,
    });
    for (let i = 0; i < 200 && session.phase !== 'over'; i++) {
      session.hardDrop();
      runClearAnimation(session);
    }
    expect(session.phase).toBe('over');
    expect(session.piecesPlaced).toBeGreaterThan(0);
  });

  it('pauses and resumes without advancing time', () => {
    const session = new GameSession({
      mode: 'marathon',
      difficulty: 'normal',
      dimension: '3d',
      seed: 3,
      puzzleIndex: 0,
    });
    session.togglePause();
    session.fixedUpdate(1);
    expect(session.elapsed).toBe(0);
    session.togglePause();
    session.fixedUpdate(0.5);
    expect(session.elapsed).toBeCloseTo(0.5);
  });

  it('allows one hold per piece', () => {
    const session = new GameSession({
      mode: 'marathon',
      difficulty: 'normal',
      dimension: '3d',
      seed: 9,
      puzzleIndex: 0,
    });
    const first = session.piece?.kind;
    session.hold();
    const second = session.piece?.kind;
    session.hold();
    expect(session.heldKind).toBe(first);
    expect(session.piece?.kind).toBe(second);
  });
});
