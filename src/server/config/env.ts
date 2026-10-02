import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGO_URI: z.string().url().default('mongodb://localhost:27017'),
  MONGO_DB: z.string().min(1).default('tetracube'),
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(10),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(30),
});

export type ServerEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}
