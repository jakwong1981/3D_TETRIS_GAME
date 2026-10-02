import { TUNING } from '../config/tuning';
import type { Axis, Direction } from '../domain/rotation';

export interface InputActions {
  shift(right: number, away: number): void;
  rotate(axis: Axis, dir: Direction): void;
  hardDrop(): void;
  hold(): void;
  setSoftDrop(active: boolean): void;
  snapCamera(dir: 1 | -1): void;
  reset(): void;
  togglePause(): void;
  toggleMusic(): void;
  firstGesture(): void;
}

const SHIFT_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/** A / S / Z sit under the left hand while the right hand stays on the arrows. */
const ROTATE_KEYS: Readonly<Record<string, Axis>> = { KeyA: 'x', KeyS: 'y', KeyZ: 'z' };

/** Keyboard → game verbs. Arrow keys repeat with DAS/ARR, sampled in fixedUpdate. */
export class InputMapper {
  private heldShift: string | null = null;
  private heldTime = 0;
  private repeatTimer = 0;
  enabled = true;

  constructor(private readonly actions: InputActions) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('pointerdown', this.onGesture, { once: true });
  }

  fixedUpdate(dt: number): void {
    if (!this.heldShift || !this.enabled) return;
    this.heldTime += dt;
    if (this.heldTime < TUNING.das) return;
    this.repeatTimer += dt;
    while (this.repeatTimer >= TUNING.arr) {
      this.repeatTimer -= TUNING.arr;
      this.fireShift(this.heldShift);
    }
  }

  dispose(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
  }

  /**
   * On-screen arrow pad: every `button[data-shift]` acts exactly like holding that arrow key,
   * including DAS/ARR auto-repeat. Pointer capture keeps the hold alive if the finger slides.
   */
  bindPad(pad: HTMLElement): void {
    for (const button of pad.querySelectorAll<HTMLButtonElement>('button[data-shift]')) {
      const code = button.dataset['shift'] ?? '';
      if (!(code in SHIFT_KEYS)) continue;
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault(); // keep keyboard focus on the game, no text selection / double-tap zoom
        this.actions.firstGesture();
        if (!this.enabled) return;
        button.setPointerCapture(e.pointerId);
        this.beginShift(code);
      });
      const release = (): void => this.endShift(code);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  private readonly onGesture = (): void => this.actions.firstGesture();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    this.actions.firstGesture();
    if (e.code === 'Escape') return this.actions.togglePause();
    if (e.code === 'KeyM' && !e.repeat) return this.actions.toggleMusic();
    if (!this.enabled) return;
    if (e.code in SHIFT_KEYS || e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    if (e.code in SHIFT_KEYS) return this.beginShift(e.code);
    const axis = ROTATE_KEYS[e.code];
    if (axis) return this.actions.rotate(axis, e.shiftKey ? -1 : 1);
    switch (e.code) {
      case 'ShiftLeft':
      case 'ShiftRight':
        return this.actions.setSoftDrop(true);
      case 'Space':
        return this.actions.hardDrop();
      case 'KeyC':
        return this.actions.hold();
      case 'KeyQ':
        return this.actions.snapCamera(-1);
      case 'KeyE':
        return this.actions.snapCamera(1);
      case 'KeyR':
        return this.actions.reset();
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.endShift(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.actions.setSoftDrop(false);
  };

  private beginShift(code: string): void {
    this.heldShift = code;
    this.heldTime = 0;
    this.repeatTimer = 0;
    this.fireShift(code);
  }

  private endShift(code: string): void {
    if (code === this.heldShift) this.heldShift = null;
  }

  private fireShift(code: string): void {
    const step = SHIFT_KEYS[code];
    if (step) this.actions.shift(step[0], step[1]);
  }
}
