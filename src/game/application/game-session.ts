import type { Difficulty, GameMode } from '../../shared/contracts';
import { DIFFICULTY_PROFILES, TUNING } from '../config/tuning';
import { ActivePiece } from '../domain/active-piece';
import { colourBonus, NO_COLOUR_BONUS, type ColourBonus } from '../domain/colour-bonus';
import { Grid, type ClearPlan } from '../domain/grid';
import { PUZZLES, PUZZLE_PREFILL_VALUE, type PuzzleDefinition } from '../domain/puzzles';
import { createSeededRandom } from '../domain/random';
import { PieceRandomizer } from '../domain/randomizer';
import type { Axis, Direction } from '../domain/rotation';
import {
  HARD_DROP_POINTS_PER_CELL,
  SOFT_DROP_POINTS_PER_CELL,
  clearPoints,
  lineCredit,
  levelFor,
  secondsPerCell,
} from '../domain/scoring';
import type { PieceKind } from '../domain/tetracube';
import { vec3, type Vec3 } from '../domain/vec3';

export type SessionPhase = 'falling' | 'clearing' | 'paused' | 'over';

export type SessionEvent =
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'lock'; cells: Vec3[]; kind: PieceKind; hardDropped: boolean }
  | { type: 'clearStart'; plan: ClearPlan; bonus: ColourBonus; points: number }
  | { type: 'clearEnd'; plan: ClearPlan }
  | { type: 'hold' }
  | { type: 'over'; result: RoundResult };

export interface SessionConfig {
  mode: GameMode;
  difficulty: Difficulty;
  seed: number;
  puzzleIndex: number;
}

export interface RoundResult {
  mode: GameMode;
  difficulty: Difficulty;
  score: number;
  layersCleared: number;
  linesCleared: number;
  piecesPlaced: number;
  durationMs: number;
  completed: boolean;
  seed: number;
}

const NO_CLEAR: ClearPlan = { layers: [], lines: 0, cells: [], rows: [] };
const PREFILL_COLOURS: ReadonlySet<number> = new Set([PUZZLE_PREFILL_VALUE]);

export interface SessionCommands {
  move(dx: number, dy: number): void;
  rotate(axis: Axis, dir: Direction): void;
  hardDrop(): void;
  hold(): void;
}

export class GameSession implements SessionCommands {
  readonly grid: Grid;
  phase: SessionPhase = 'falling';
  piece: ActivePiece | null = null;
  heldKind: PieceKind | null = null;
  score = 0;
  /** Full layers cleared. */
  layersCleared = 0;
  /** Rows cleared, a full layer counting as grid.width rows; drives level and sprint. */
  linesCleared = 0;
  piecesPlaced = 0;
  combo = 0;
  elapsed = 0;
  softDropping = false;
  /** What is flashing right now (empty outside the 'clearing' phase). */
  clearing: ClearPlan = NO_CLEAR;
  /** Same-colour bonus of the most recent clear (kept after the flash so the HUD can show it). */
  lastBonus: ColourBonus = NO_COLOUR_BONUS;
  clearTimer = 0;

  private readonly randomizer: PieceRandomizer;
  private readonly startLevel: number;
  private readonly puzzle: PuzzleDefinition | null;
  private readonly listeners: ((e: SessionEvent) => void)[] = [];
  private fallTimer = 0;
  private lockTimer = 0;
  private lockResets = 0;
  private holdUsed = false;
  private pausedFrom: SessionPhase = 'falling';

  constructor(readonly config: SessionConfig) {
    const profile = DIFFICULTY_PROFILES[config.difficulty];
    this.puzzle = config.mode === 'puzzle' ? (PUZZLES[config.puzzleIndex] ?? PUZZLES[0] ?? null) : null;
    const size = this.puzzle?.size ?? profile.wellSize;
    this.grid = new Grid(size, size, TUNING.wellHeight);
    this.startLevel = profile.startLevel;
    this.randomizer = new PieceRandomizer(
      createSeededRandom(config.seed),
      profile.specialPieceChance,
      this.puzzle?.pieces ?? null,
    );
    if (this.puzzle) fillPuzzle(this.grid, this.puzzle);
    this.spawnNext();
  }

  onEvent(listener: (e: SessionEvent) => void): void {
    this.listeners.push(listener);
  }

  get level(): number {
    return levelFor(this.startLevel, this.linesCleared);
  }

  get nextKinds(): PieceKind[] {
    return this.randomizer.peek(3);
  }

  get ghostPiece(): ActivePiece | null {
    if (!this.piece) return null;
    return this.piece.translated(vec3(0, 0, -this.piece.dropDistance(this.grid)));
  }

  get piecesRemaining(): number | null {
    if (!this.puzzle) return null;
    return this.puzzle.pieces.length - this.piecesPlaced;
  }

  fixedUpdate(dt: number): void {
    if (this.phase === 'paused' || this.phase === 'over') return;
    this.elapsed += dt;
    if (this.phase === 'clearing') {
      this.updateClearing(dt);
      return;
    }
    this.updateFalling(dt);
  }

  togglePause(): void {
    if (this.phase === 'over') return;
    if (this.phase === 'paused') {
      this.phase = this.pausedFrom;
      return;
    }
    this.pausedFrom = this.phase;
    this.phase = 'paused';
  }

  move(dx: number, dy: number): void {
    if (!this.canControl() || !this.piece) return;
    const moved = this.piece.tryMove(vec3(dx, dy, 0), this.grid);
    if (!moved) return;
    this.piece = moved;
    this.resetLockOnMotion();
    this.emit({ type: 'move' });
  }

  rotate(axis: Axis, dir: Direction): void {
    if (!this.canControl() || !this.piece) return;
    const rotated = this.piece.tryRotate(axis, dir, this.grid);
    if (!rotated) return;
    this.piece = rotated;
    this.resetLockOnMotion();
    this.emit({ type: 'rotate' });
  }

  hardDrop(): void {
    if (!this.canControl() || !this.piece) return;
    const distance = this.piece.dropDistance(this.grid);
    this.piece = this.piece.translated(vec3(0, 0, -distance));
    this.score += distance * HARD_DROP_POINTS_PER_CELL;
    this.lockPiece(true);
  }

  hold(): void {
    if (!this.canControl() || !this.piece || this.holdUsed || this.puzzle) return;
    const current = this.piece.kind;
    const swapped = this.heldKind;
    this.heldKind = current;
    this.holdUsed = true;
    if (swapped) this.spawn(swapped);
    else this.spawnNext();
    this.emit({ type: 'hold' });
  }

  private canControl(): boolean {
    return this.phase === 'falling';
  }

  private updateFalling(dt: number): void {
    if (!this.piece) return;
    const interval = secondsPerCell(this.level) / (this.softDropping ? TUNING.softDropFactor : 1);
    const grounded = this.piece.dropDistance(this.grid) === 0;
    if (grounded) {
      this.lockTimer += dt;
      if (this.lockTimer >= TUNING.lockDelay) this.lockPiece(false);
      return;
    }
    this.lockTimer = 0;
    this.fallTimer += dt;
    while (this.fallTimer >= interval && this.piece) {
      this.fallTimer -= interval;
      const moved = this.piece.tryMove(vec3(0, 0, -1), this.grid);
      if (!moved) break;
      this.piece = moved;
      if (this.softDropping) this.score += SOFT_DROP_POINTS_PER_CELL;
    }
  }

  private resetLockOnMotion(): void {
    if (this.lockTimer > 0 && this.lockResets < TUNING.maxLockResets) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  private lockPiece(hardDropped: boolean): void {
    if (!this.piece) return;
    const piece = this.piece;
    const toppedOut = piece.isAboveWell(this.grid);
    piece.lockInto(this.grid);
    this.piecesPlaced++;
    this.piece = null;
    this.emit({ type: 'lock', cells: piece.worldCells, kind: piece.kind, hardDropped });
    if (toppedOut) {
      this.finish(false);
      return;
    }
    // Puzzles are designed around whole layers, so row clears only apply to marathon and sprint.
    const plan = this.grid.findClears(!this.puzzle);
    if (plan.cells.length === 0) {
      this.combo = 0;
      this.afterSettle();
      return;
    }
    const bonus = colourBonus(plan.rows, PREFILL_COLOURS);
    const points = clearPoints(plan.lines, plan.layers.length, this.level, this.combo, bonus.multiplier);
    this.score += points;
    this.combo++;
    this.clearing = plan;
    this.lastBonus = bonus;
    this.clearTimer = 0;
    this.phase = 'clearing';
    this.emit({ type: 'clearStart', plan, bonus, points });
  }

  private updateClearing(dt: number): void {
    this.clearTimer += dt;
    if (this.clearTimer < TUNING.clearAnimSeconds) return;
    const plan = this.clearing;
    this.grid.removeCells(plan.cells);
    this.layersCleared += plan.layers.length;
    this.linesCleared += lineCredit(plan.lines, plan.layers.length, this.grid.width);
    this.clearing = NO_CLEAR;
    this.phase = 'falling';
    this.emit({ type: 'clearEnd', plan });
    this.afterSettle();
  }

  private afterSettle(): void {
    if (this.config.mode === 'sprint' && this.linesCleared >= TUNING.sprintTargetLines) {
      this.finish(true);
      return;
    }
    if (this.puzzle && this.grid.isEmpty()) {
      this.finish(true);
      return;
    }
    if (this.puzzle && this.piecesRemaining === 0) {
      this.finish(false);
      return;
    }
    this.spawnNext();
  }

  private spawnNext(): void {
    const kind = this.randomizer.next();
    if (!kind) {
      this.finish(false);
      return;
    }
    this.spawn(kind);
  }

  private spawn(kind: PieceKind): void {
    const piece = ActivePiece.spawn(kind, this.grid);
    this.fallTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    if (!piece.fits(this.grid)) {
      this.piece = null;
      this.finish(false);
      return;
    }
    this.piece = piece;
  }

  private finish(completed: boolean): void {
    this.phase = 'over';
    this.piece = null;
    this.emit({ type: 'over', result: this.result(completed) });
  }

  private result(completed: boolean): RoundResult {
    return {
      mode: this.config.mode,
      difficulty: this.config.difficulty,
      score: this.score,
      layersCleared: this.layersCleared,
      linesCleared: this.linesCleared,
      piecesPlaced: this.piecesPlaced,
      durationMs: Math.max(1, Math.round(this.elapsed * 1000)),
      completed: completed || this.config.mode === 'marathon',
      seed: this.config.seed,
    };
  }

  private emit(e: SessionEvent): void {
    if (e.type === 'lock') this.holdUsed = false;
    for (const listener of this.listeners) listener(e);
  }
}

function fillPuzzle(grid: Grid, puzzle: PuzzleDefinition): void {
  puzzle.layers.forEach((rows, z) =>
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === 'X') grid.set(vec3(x, y, z), PUZZLE_PREFILL_VALUE);
      }),
    ),
  );
}
