import type { Difficulty, GameMode, RankingPeriod } from '../../shared/contracts';
import type { ScoreApi } from '../infrastructure/score-api';
import { byId, formatDuration } from './dom';

export class RankingView {
  private readonly root = byId('ranking', HTMLElement);
  private readonly mode = byId('rank-mode', HTMLSelectElement);
  private readonly difficulty = byId('rank-difficulty', HTMLSelectElement);
  private readonly period = byId('rank-period', HTMLSelectElement);
  private readonly body = byId('rank-body', HTMLTableSectionElement);
  private readonly metric = byId('rank-metric', HTMLElement);
  private readonly status = byId('rank-status', HTMLElement);
  private readonly history = byId('history', HTMLUListElement);
  private playerName = '';
  private onClose: () => void = () => undefined;

  constructor(private readonly api: ScoreApi) {
    for (const select of [this.mode, this.difficulty, this.period])
      select.addEventListener('change', () => void this.load());
    byId('close-ranking', HTMLButtonElement).addEventListener('click', () => this.close());
  }

  open(params: { mode: GameMode; difficulty: Difficulty; playerName: string; onClose: () => void }): void {
    this.mode.value = params.mode;
    this.difficulty.value = params.difficulty;
    this.playerName = params.playerName;
    this.onClose = params.onClose;
    this.root.hidden = false;
    void this.load();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  close(): void {
    this.root.hidden = true;
    this.onClose();
  }

  private async load(): Promise<void> {
    const mode = this.mode.value as GameMode;
    this.metric.textContent = mode === 'sprint' ? 'Time' : 'Score';
    this.status.textContent = 'Loading…';
    try {
      const page = await this.api.fetchRanking({
        mode,
        difficulty: this.difficulty.value as Difficulty,
        period: this.period.value as RankingPeriod,
      });
      this.body.replaceChildren(
        ...page.entries.map((entry) => {
          const row = document.createElement('tr');
          if (entry.playerName.toLowerCase() === this.playerName.toLowerCase()) row.className = 'me';
          const metric = mode === 'sprint' ? formatDuration(entry.durationMs) : entry.score.toLocaleString();
          const cells = [
            String(entry.rank),
            entry.playerName,
            metric,
            String(entry.linesCleared),
            String(entry.layersCleared),
          ];
          for (const value of cells) {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.append(cell);
          }
          return row;
        }),
      );
      this.status.textContent = page.entries.length === 0 ? 'No rounds yet. Be the first.' : '';
    } catch {
      this.body.replaceChildren();
      this.status.textContent = 'Ranking server unreachable. Your rounds are saved and will upload later.';
    }
    await this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    if (!this.playerName) {
      this.history.replaceChildren();
      return;
    }
    try {
      const page = await this.api.fetchPlayerRounds(this.playerName);
      this.history.replaceChildren(
        ...page.rounds.map((round) => {
          const item = document.createElement('li');
          const best = page.personalBest?.id === round.id ? ' ★ best' : '';
          item.textContent = `${round.mode} · ${round.difficulty} · ${round.score.toLocaleString()} pts · ${round.linesCleared} lines · ${round.layersCleared} layers · ${new Date(round.playedAt).toLocaleString()}${best}`;
          return item;
        }),
      );
    } catch {
      this.history.replaceChildren();
    }
  }
}
