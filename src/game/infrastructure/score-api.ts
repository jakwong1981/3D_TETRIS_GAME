import type {
  ApiErrorResponse,
  Difficulty,
  Dimension,
  GameMode,
  PlayerRoundsPage,
  RankingPage,
  RankingPeriod,
  RoundResponse,
  SubmitRoundRequest,
} from '../../shared/contracts';
import { pendingRoundStorage } from './storage';

export class ScoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorResponse | null,
  ) {
    super(body?.message ?? `Score API request failed with status ${status}`);
  }
}

/** The only module that talks HTTP. Offline-first: failed submits are queued and flushed later. */
export class ScoreApi {
  constructor(private readonly baseUrl = '/api/v1') {}

  async submitRound(round: SubmitRoundRequest): Promise<RoundResponse | null> {
    await this.flushPending();
    try {
      return await this.request<RoundResponse>('/rounds', { method: 'POST', body: JSON.stringify(round) });
    } catch (error) {
      if (error instanceof ScoreApiError && error.status >= 400 && error.status < 500) throw error;
      pendingRoundStorage.write([...pendingRoundStorage.read(), round]);
      return null;
    }
  }

  async fetchRanking(params: {
    mode: GameMode;
    difficulty: Difficulty;
    dimension: Dimension;
    period: RankingPeriod;
    limit?: number;
  }): Promise<RankingPage> {
    const query = new URLSearchParams({
      mode: params.mode,
      difficulty: params.difficulty,
      dimension: params.dimension,
      period: params.period,
      limit: String(params.limit ?? 20),
    });
    return this.request<RankingPage>(`/rankings?${query.toString()}`);
  }

  async fetchPlayerRounds(playerName: string): Promise<PlayerRoundsPage> {
    return this.request<PlayerRoundsPage>(`/players/${encodeURIComponent(playerName)}/rounds?limit=10`);
  }

  async flushPending(): Promise<void> {
    const pending = pendingRoundStorage.read();
    if (pending.length === 0) return;
    const remaining: SubmitRoundRequest[] = [];
    for (const round of pending) {
      try {
        await this.request<RoundResponse>('/rounds', { method: 'POST', body: JSON.stringify(round) });
      } catch (error) {
        // 4xx means the server rejected it permanently; only network/5xx failures are kept.
        if (!(error instanceof ScoreApiError && error.status < 500)) remaining.push(round);
      }
    }
    pendingRoundStorage.write(remaining);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ScoreApiError(response.status, body);
    }
    return (await response.json()) as T;
  }
}
