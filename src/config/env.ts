import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Brendi OAuth
  BRENDI_CLIENT_ID: z.string().min(1),
  BRENDI_CLIENT_SECRET: z.string().min(1),
  BRENDI_BASE_URL: z.string().url().default('https://api.brendi.com.br'),
  BRENDI_TOKEN_URL: z.string().url(),
  BRENDI_POLLING_INTERVAL_MS: z.coerce.number().positive().default(300000),

  // Consumer
  CONSUMER_API_KEYS: z.string().transform((s) => s.split(',').map((k) => k.trim()).filter(Boolean)),
  CONSUMER_RATE_LIMIT_MAX: z.coerce.number().positive().default(100),

  // Database
  DATABASE_URL: z.string().url(),

  // Scheduler
  POLLING_ENABLED: z.coerce.boolean().default(true),
  POLLING_INITIAL_DELAY_MS: z.coerce.number().positive().default(10000),
});

export type Env = z.infer<typeof envSchema>;
export type RawEnv = z.input<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const errorMessage = `Invalid environment variables: ${JSON.stringify(errors)}`;
    if (process.env.NODE_ENV === 'test') {
      // In tests, throw instead of exiting to allow mocking
      throw new Error(errorMessage);
    }
    console.error('❌ Invalid environment variables:');
    console.error(errors);
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export function setEnvForTest(rawEnv: Partial<RawEnv>): void {
  const merged = { ...getDefaultTestEnv(), ...rawEnv };
  const result = envSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(`Invalid test env: ${JSON.stringify(result.error.flatten().fieldErrors)}`);
  }
  cachedEnv = result.data;
}

function getDefaultTestEnv(): Partial<RawEnv> {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    BRENDI_CLIENT_ID: 'test-client-id',
    BRENDI_CLIENT_SECRET: 'test-client-secret',
    BRENDI_BASE_URL: 'https://api.brendi.com.br',
    BRENDI_TOKEN_URL: 'https://api.brendi.com.br/oauth/token',
    BRENDI_POLLING_INTERVAL_MS: 300000,
    CONSUMER_API_KEYS: 'test-key-1,test-key-2',
    CONSUMER_RATE_LIMIT_MAX: 100,
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    POLLING_ENABLED: false,
    POLLING_INITIAL_DELAY_MS: 10000,
  };
}

export function resetEnvCache(): void {
  cachedEnv = null;
}