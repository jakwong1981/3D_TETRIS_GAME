import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import {
  playerNameSchema,
  playerRoundsQuerySchema,
  rankingQuerySchema,
  submitRoundRequestSchema,
} from '../../shared/contracts';
import { ValidationError } from '../errors';
import type { RoundService } from '../services/round-service';

/** Routes only validate, delegate, and map status codes. */
export function registerRoundRoutes(
  app: FastifyInstance,
  service: RoundService,
  submitRateLimit: number,
): void {
  app.post(
    '/api/v1/rounds',
    { config: { rateLimit: { max: submitRateLimit, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parse(submitRoundRequestSchema, request.body);
      const saved = await service.submitRound(body);
      return reply.code(201).send(saved);
    },
  );

  app.get('/api/v1/rankings', async (request) =>
    service.getRanking(parse(rankingQuerySchema, request.query)),
  );

  app.get('/api/v1/players/:playerName/rounds', async (request) => {
    const { playerName } = request.params as { playerName: string };
    const name = parse(playerNameSchema, playerName);
    return service.getPlayerRounds(name, parse(playerRoundsQuerySchema, request.query));
  });
}

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      'Request validation failed',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}
