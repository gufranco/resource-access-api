import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5000),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  CACHE_ENABLED: booleanFromString.default(true),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(30),

  CORS_ORIGINS: z.string().default('*'),
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  PAGINATION_DEFAULT_LIMIT: z.coerce.number().int().positive().default(20),
  PAGINATION_MAX_LIMIT: z.coerce.number().int().positive().default(100),

  AUTH_MODE: z.enum(['header', 'jwt']).default('header'),
  JWT_JWKS_URL: z.url().optional(),
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
  JWT_SECRET: z.string().optional(),

  METRICS_ENABLED: booleanFromString.default(true),
  OTEL_ENABLED: booleanFromString.default(false),
  OTEL_SERVICE_NAME: z.string().default('resource-access-api'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),

  SEED_SCALE: z.coerce.number().int().positive().default(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  return envSchema.parse(raw);
}
