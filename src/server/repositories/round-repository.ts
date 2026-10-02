import type { Difficulty, GameMode } from '../../shared/contracts';
import type { NewRoundRecord, RoundRecord } from '../domain/round';

/** Keyset position: the last row's sort value and id. Avoids skip() scans on deep pages. */
export interface RankingCursor {
  value: number;
  id: string;
  rank: number;
}

export interface RankingFilter {
  mode: GameMode;
  difficulty: Difficulty;
  since: Date | null;
  limit: number;
  after: RankingCursor | null;
}

export interface HistoryFilter {
  playerNameLower: string;
  limit: number;
  beforeId: string | null;
}

export interface RoundRepository {
  insert(round: NewRoundRecord): Promise<RoundRecord>;
  findRanking(filter: RankingFilter): Promise<RoundRecord[]>;
  findHistory(filter: HistoryFilter): Promise<RoundRecord[]>;
  findPersonalBest(playerNameLower: string): Promise<RoundRecord | null>;
}

/** Sprint ranks by fastest time; every other mode by highest score. */
export function rankingSortsAscending(mode: GameMode): boolean {
  return mode === 'sprint';
}
