import type { GameSession } from '../application/game-session';
import type { ColourBonus } from '../domain/colour-bonus';
import type { ClearPlan } from '../domain/grid';
import { PIECE_DEFINITIONS, type PieceKind } from '../domain/tetracube';
import { byId, formatDuration } from './dom';

export class HudView {
  private readonly root = byId('hud', HTMLElement);
  private readonly movePad = byId('move-pad', HTMLElement);
  private readonly score = byId('hud-score', HTMLElement);
  private readonly level = byId('hud-level', HTMLElement);
  private readonly lines = byId('hud-lines', HTMLElement);
  private readonly layers = byId('hud-layers', HTMLElement);
  private readonly banner = byId('clear-banner', HTMLElement);
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly time = byId('hud-time', HTMLElement);
  private readonly piecesRow = byId('hud-pieces-row', HTMLElement);
  private readonly pieces = byId('hud-pieces', HTMLElement);
  private readonly next = byId('hud-next', HTMLOListElement);
  private readonly holdSlot = byId('hud-hold', HTMLElement);
  private readonly preset = byId('hud-preset', HTMLElement);
  private lastQueueKey = '';

  show(presetName: string): void {
    this.root.hidden = false;
    this.movePad.hidden = false;
    this.preset.textContent = presetName;
    this.lastQueueKey = '';
  }

  update(session: GameSession): void {
    this.score.textContent = session.score.toLocaleString();
    this.level.textContent = String(session.level);
    this.lines.textContent = String(session.linesCleared);
    this.layers.textContent = String(session.layersCleared);
    this.time.textContent = formatDuration(session.elapsed * 1000);
    const remaining = session.piecesRemaining;
    this.piecesRow.hidden = remaining === null;
    if (remaining !== null) this.pieces.textContent = String(remaining);

    const queue = session.nextKinds;
    const key = `${queue.join()}|${session.heldKind ?? ''}`;
    if (key === this.lastQueueKey) return;
    this.lastQueueKey = key;
    this.next.replaceChildren(...queue.map((kind) => pieceLabel(kind, 'li')));
    this.holdSlot.replaceChildren(session.heldKind ? pieceLabel(session.heldKind, 'span') : '—');
  }

  /** Short centre banner: what cleared, the same-colour multiplier and the points earned. */
  showClear(plan: ClearPlan, bonus: ColourBonus, points: number): void {
    const parts: string[] = [];
    if (plan.layers.length) parts.push(`${plan.layers.length} LAYER${plan.layers.length > 1 ? 'S' : ''}`);
    if (plan.lines) parts.push(`${plan.lines} LINE${plan.lines > 1 ? 'S' : ''}`);
    if (bonus.multiplier > 1)
      parts.push(`SAME COLOUR ${bonus.axes.join('').toUpperCase()} ×${bonus.multiplier}`);
    parts.push(`+${points.toLocaleString()}`);
    this.banner.textContent = parts.join(' · ');
    this.banner.classList.toggle('bonus', bonus.multiplier > 1);
    this.banner.hidden = false;
    // Restart the CSS pop animation even if the previous banner is still showing.
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = '';
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.banner.hidden = true;
    }, 1600);
  }
}

function pieceLabel(kind: PieceKind, tag: 'li' | 'span'): HTMLElement {
  const element = document.createElement(tag);
  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = PIECE_DEFINITIONS[kind].color;
  element.append(swatch, kind.replace(/([a-z])([A-Z])/g, '$1 $2'));
  return element;
}
