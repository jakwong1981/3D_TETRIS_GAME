import type { NewRoundRecord, RoundRecord } from '../../src/server/domain/round';
import {
  rankingSortsAscending,
  type HistoryFilter,
  type RankingFilter,
  type RoundRepository,
} from '../../src/server/repositories/round-repository';

/** Test double with the same ordering semantics as the Mongo repository. */
export class InMemoryRoundRepository implements RoundRepository {
  readonly rows: RoundRecord[] = [];
  private nextId = 1;

  async insert(round: NewRoundRecord): Promise<RoundRecord> {
    const record = { ...round, id: (this.nextId++).toString(16).padStart(24, '0') };
    this.rows.push(record);
    return record;
  }

  async findRanking(filter: RankingFilter): Promise<RoundRecord[]> {
    const asc = rankingSortsAscending(filter.mode);
    const key = (r: RoundRecord): number => (asc ? r.durationMs : r.score);
    const sorted = this.rows
      .filter((r) => r.mode === filter.mode && r.difficulty === filter.difficulty && !r.flagged)
      .filter((r) => r.dimension === filter.dimension)
      .filter((r) => !asc || r.completed)
      .filter((r) => !filter.since || r.playedAt >= filter.since)
      .sort((a, b) =>
        asc ? key(a) - key(b) || a.id.localeCompare(b.id) : key(b) - key(a) || b.id.localeCompare(a.id),
      );
    const after = filter.after;
    const start = after ? sorted.findIndex((r) => r.id === after.id) + 1 : 0;
    return sorted.slice(start, start + filter.limit);
  }

  async findHistory(filter: HistoryFilter): Promise<RoundRecord[]> {
    return this.rows
      .filter((r) => r.playerNameLower === filter.playerNameLower)
      .filter((r) => !filter.beforeId || r.id < filter.beforeId)
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, filter.limit);
  }

  async findPersonalBest(playerNameLower: string): Promise<RoundRecord | null> {
    const rows = this.rows.filter((r) => r.playerNameLower === playerNameLower && !r.flagged);
    return rows.sort((a, b) => b.score - a.score)[0] ?? null;
  }
}
