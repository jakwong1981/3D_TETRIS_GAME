import { z } from 'zod';

export const GAME_MODES = ['marathon', 'sprint', 'puzzle'] as const;
export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export const RANKING_PERIODS = ['all', 'week', 'day'] as const;

export const DIMENSIONS = ['3d', '2d'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type GameMode = (typeof GAME_MODES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

/** Rows needed to finish a sprint (client goal and server plausibility check share it). */
export const SPRINT_TARGET_LINES = 20;

export const PLAYER_NAME_PATTERN = /^[\p{L}\p{N}_\- ]{2,16}$/u;

export const playerNameSchema = z
  .string()
  .trim()
  .regex(PLAYER_NAME_PATTERN, 'Name must be 2-16 letters, digits, space, _ or -');

export const submitRoundRequestSchema = z.object({
  playerName: playerNameSchema,
  mode: z.enum(GAME_MODES),
  difficulty: z.enum(DIFFICULTIES),
  /** 3D well or classic 2D board; defaults to 3D for clients that predate the 2D mode. */
  dimension: z.enum(DIMENSIONS).default('3d'),
  score: z.number().int().min(0).max(10_000_000),
  layersCleared: z.number().int().min(0).max(100_000),
  /** Rows cleared, with each full layer credited as wellWidth rows. Defaults for pre-rows clients. */
  linesCleared: z.number().int().min(0).max(1_000_000).default(0),
  piecesPlaced: z.number().int().min(1).max(100_000),
  durationMs: z
    .number()
    .int()
    .min(1)
    .max(24 * 60 * 60 * 1000),
  completed: z.boolean(),
  seed: z.number().int().min(0).max(0xffffffff),
  clientVersion: z.string().min(1).max(20),
});

export type SubmitRoundRequest = z.infer<typeof submitRoundRequestSchema>;

export interface RoundResponse {
  id: string;
  playerName: string;
  mode: GameMode;
  difficulty: Difficulty;
  dimension: Dimension;
  score: number;
  layersCleared: number;
  linesCleared: number;
  piecesPlaced: number;
  durationMs: number;
  completed: boolean;
  playedAt: string;
}

export const rankingQuerySchema = z.object({
  mode: z.enum(GAME_MODES),
  difficulty: z.enum(DIFFICULTIES),
  dimension: z.enum(DIMENSIONS).default('3d'),
  period: z.enum(RANKING_PERIODS).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});

export type RankingQuery = z.infer<typeof rankingQuerySchema>;

export interface RankingEntry {
  rank: number;
  playerName: string;
  score: number;
  layersCleared: number;
  linesCleared: number;
  durationMs: number;
  playedAt: string;
}

export interface RankingPage {
  entries: RankingEntry[];
  nextCursor: string | null;
}

export const playerRoundsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});

export type PlayerRoundsQuery = z.infer<typeof playerRoundsQuerySchema>;

export interface PlayerRoundsPage {
  rounds: RoundResponse[];
  personalBest: RoundResponse | null;
  nextCursor: string | null;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  data: unknown;
  timestamp: string;
}
