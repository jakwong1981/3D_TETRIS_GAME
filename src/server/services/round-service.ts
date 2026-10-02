import type {
  PlayerRoundsPage,
  PlayerRoundsQuery,
  RankingPage,
  RankingPeriod,
  RankingQuery,
  RoundResponse,
  SubmitRoundRequest,
} from '../../shared/contracts';
import type { RoundRecord } from '../domain/round';
import { ImplausibleRoundError, ValidationError } from '../errors';
import { rankingSortsAscending, type RoundRepository } from '../repositories/round-repository';
import { decodeCursor, encodeCursor, objectIdPattern } from './cursor';
import { findImplausibilities } from './plausibility';

const PERIOD_MS: Readonly<Record<Exclude<RankingPeriod, 'all'>, number>> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

export class RoundService {
  constructor(
    private readonly repository: RoundRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submitRound(request: SubmitRoundRequest): Promise<RoundResponse> {
    const reasons = findImplausibilities(request);
    if (reasons.length > 0) throw new ImplausibleRoundError(reasons);
    const saved = await this.repository.insert({
      ...request,
      playerNameLower: request.playerName.toLowerCase(),
      playedAt: this.now(),
      flagged: false,
    });
    return toResponse(saved);
  }

  async getRanking(query: RankingQuery): Promise<RankingPage> {
    const after = decodeCursor(query.cursor);
    const since = query.period === 'all' ? null : new Date(this.now().getTime() - PERIOD_MS[query.period]);
    const rows = await this.repository.findRanking({
      mode: query.mode,
      difficulty: query.difficulty,
      since,
      limit: query.limit + 1,
      after,
    });
    const page = rows.slice(0, query.limit);
    const startRank = after?.rank ?? 0;
    const entries = page.map((row, i) => ({
      rank: startRank + i + 1,
      playerName: row.playerName,
      score: row.score,
      layersCleared: row.layersCleared,
      linesCleared: row.linesCleared,
      durationMs: row.durationMs,
      playedAt: row.playedAt.toISOString(),
    }));
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > query.limit && last
        ? encodeCursor({
            value: rankingSortsAscending(query.mode) ? last.durationMs : last.score,
            id: last.id,
            rank: startRank + page.length,
          })
        : null;
    return { entries, nextCursor };
  }

  async getPlayerRounds(playerName: string, query: PlayerRoundsQuery): Promise<PlayerRoundsPage> {
    if (query.cursor && !objectIdPattern.test(query.cursor)) throw new ValidationError('Invalid cursor');
    const playerNameLower = playerName.toLowerCase();
    const [rows, best] = await Promise.all([
      this.repository.findHistory({
        playerNameLower,
        limit: query.limit + 1,
        beforeId: query.cursor ?? null,
      }),
      this.repository.findPersonalBest(playerNameLower),
    ]);
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      rounds: page.map(toResponse),
      personalBest: best ? toResponse(best) : null,
      nextCursor: rows.length > query.limit && last ? last.id : null,
    };
  }
}

function toResponse(record: RoundRecord): RoundResponse {
  return {
    id: record.id,
    playerName: record.playerName,
    mode: record.mode,
    difficulty: record.difficulty,
    score: record.score,
    layersCleared: record.layersCleared,
    linesCleared: record.linesCleared,
    piecesPlaced: record.piecesPlaced,
    durationMs: record.durationMs,
    completed: record.completed,
    playedAt: record.playedAt.toISOString(),
  };
}
