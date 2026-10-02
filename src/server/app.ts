import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { ApiErrorResponse } from '../shared/contracts';
import { AppError } from './errors';
import { registerRoundRoutes } from './routes/round-routes';
import type { RoundService } from './services/round-service';

export interface AppOptions {
  service: RoundService;
  corsOrigin: string;
  submitRateLimit: number;
  logger?: boolean;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: (req) => {
      const header = req.headers['x-trace-id'];
      return typeof header === 'string' && header.length <= 64 ? header : randomUUID();
    },
    requestIdLogLabel: 'traceId',
    bodyLimit: 4 * 1024,
  });

  await app.register(helmet);
  await app.register(cors, { origin: options.corsOrigin.split(',').map((o) => o.trim()) });
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-trace-id', request.id);
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const isApp = error instanceof AppError;
    const status = isApp ? error.statusCode : (error.statusCode ?? 500);
    if (status >= 500) request.log.error({ err: error }, 'Unhandled error');
    else
      request.log.warn({ code: isApp ? error.code : error.code, message: error.message }, 'Request rejected');
    const body: ApiErrorResponse = {
      code: isApp
        ? error.code
        : status === 429
          ? 'RATE_LIMITED'
          : status >= 500
            ? 'INTERNAL_ERROR'
            : 'BAD_REQUEST',
      message: status >= 500 ? 'Internal server error' : error.message,
      data: isApp ? error.data : null,
      timestamp: new Date().toISOString(),
    };
    return reply.code(status).send(body);
  });

  app.get('/api/v1/health', async () => ({ status: 'ok' }));
  registerRoundRoutes(app, options.service, options.submitRateLimit);
  return app;
}
