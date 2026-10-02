import { shuffle, type RandomSource } from './random';
import { CLASSIC_KINDS, SPECIAL_KINDS, type PieceKind } from './tetracube';

/**
 * Bag randomizer: every classic shape appears once per bag (no droughts), and each 3D-only
 * shape joins the bag with the difficulty's probability.
 */
export class PieceRandomizer {
  private queue: PieceKind[] = [];

  constructor(
    private readonly random: RandomSource,
    private readonly specialChance: number,
    private readonly fixedSequence: readonly PieceKind[] | null = null,
  ) {
    if (fixedSequence) this.queue = [...fixedSequence];
  }

  peek(count: number): PieceKind[] {
    this.fillTo(count);
    return this.queue.slice(0, count);
  }

  next(): PieceKind | null {
    this.fillTo(1);
    return this.queue.shift() ?? null;
  }

  private fillTo(count: number): void {
    if (this.fixedSequence) return;
    while (this.queue.length < count) this.queue.push(...this.createBag());
  }

  private createBag(): PieceKind[] {
    const specials = SPECIAL_KINDS.filter(() => this.random() < this.specialChance);
    return shuffle([...CLASSIC_KINDS, ...specials], this.random);
  }
}
