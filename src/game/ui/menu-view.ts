import { playerNameSchema, type Difficulty, type GameMode } from '../../shared/contracts';
import { PUZZLES } from '../domain/puzzles';
import {
  BACKGROUND_IMAGES,
  PROCEDURAL_BACKDROP,
  RANDOM_BACKDROP,
  isKnownBackdrop,
  type BackdropChoice,
} from '../presentation/background-images';
import { byId } from './dom';

export interface MenuChoice {
  playerName: string;
  mode: GameMode;
  difficulty: Difficulty;
  puzzleIndex: number;
  backdrop: BackdropChoice;
}

export class MenuView {
  private readonly root = byId('menu', HTMLElement);
  private readonly form = byId('menu-form', HTMLFormElement);
  private readonly name = byId('player-name', HTMLInputElement);
  private readonly nameError = byId('name-error', HTMLElement);
  private readonly mode = byId('mode', HTMLSelectElement);
  private readonly difficulty = byId('difficulty', HTMLSelectElement);
  private readonly difficultyField = byId('difficulty-field', HTMLElement);
  private readonly puzzle = byId('puzzle', HTMLSelectElement);
  private readonly puzzleField = byId('puzzle-field', HTMLElement);
  private readonly backdrop = byId('backdrop', HTMLSelectElement);

  constructor(
    initialName: string,
    initialBackdrop: BackdropChoice,
    handlers: { onStart: (choice: MenuChoice) => void; onRanking: (choice: MenuChoice) => void },
  ) {
    this.name.value = initialName;
    this.backdrop.replaceChildren(
      ...BACKGROUND_IMAGES.map((image) => new Option(image.name, image.id)),
      new Option('Hong Kong skyline (shader)', PROCEDURAL_BACKDROP),
      new Option('Random', RANDOM_BACKDROP),
    );
    this.backdrop.value = isKnownBackdrop(initialBackdrop) ? initialBackdrop : RANDOM_BACKDROP;
    this.puzzle.replaceChildren(
      ...PUZZLES.map((p, i) => new Option(`${i + 1}. ${p.name} (${p.size}×${p.size})`, String(i))),
    );
    this.mode.addEventListener('change', () => this.syncModeFields());
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const choice = this.readValidChoice();
      if (choice) handlers.onStart(choice);
    });
    byId('open-ranking', HTMLButtonElement).addEventListener('click', () =>
      handlers.onRanking(this.readChoice()),
    );
    this.syncModeFields();
  }

  show(): void {
    this.root.hidden = false;
    this.name.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  readChoice(): MenuChoice {
    return {
      playerName: this.name.value.trim(),
      mode: this.mode.value as GameMode,
      difficulty: this.difficulty.value as Difficulty,
      puzzleIndex: Number(this.puzzle.value),
      backdrop: this.backdrop.value,
    };
  }

  private readValidChoice(): MenuChoice | null {
    const parsed = playerNameSchema.safeParse(this.name.value);
    this.nameError.textContent = parsed.success ? '' : (parsed.error.issues[0]?.message ?? 'Invalid name');
    if (!parsed.success) return null;
    return { ...this.readChoice(), playerName: parsed.data };
  }

  private syncModeFields(): void {
    const isPuzzle = this.mode.value === 'puzzle';
    this.puzzleField.hidden = !isPuzzle;
    this.difficultyField.hidden = isPuzzle;
  }
}
