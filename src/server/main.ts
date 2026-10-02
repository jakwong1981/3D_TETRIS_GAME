import { MongoClient } from 'mongodb';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { MongoRoundRepository } from './repositories/mongo-round-repository';
import { RoundService } from './services/round-service';

async function main(): Promise<void> {
  const env = loadEnv();
  const client = new MongoClient(env.MONGO_URI, { maxPoolSize: env.MONGO_MAX_POOL_SIZE });
  await client.connect();
  const repository = new MongoRoundRepository(client.db(env.MONGO_DB));
  await repository.ensureIndexes();

  const app = await buildApp({
    service: new RoundService(repository),
    corsOrigin: env.CORS_ORIGIN,
    submitRateLimit: env.RATE_LIMIT_PER_MINUTE,
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await client.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  process.stderr.write(`Server failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
