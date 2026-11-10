import { getEnv } from './env.js';

let constantsCache: ReturnType<typeof buildConstants> | null = null;

function buildConstants() {
  const env = getEnv();

  return {
    // Brendi
    BRENDI: {
      BASE_URL: env.BRENDI_BASE_URL,
      TOKEN_URL: env.BRENDI_TOKEN_URL,
      POLLING_ENDPOINT: '/v1/events:polling',
      ORDERS_ENDPOINT: '/v1/orders',
      POLLING_INTERVAL_MS: env.BRENDI_POLLING_INTERVAL_MS,
      CLIENT_ID: env.BRENDI_CLIENT_ID,
      CLIENT_SECRET: env.BRENDI_CLIENT_SECRET,
      TOKEN_BUFFER_MS: 60000, // Renovar 1 min antes de expirar
    },

    // Consumer
    CONSUMER: {
      VALID_API_KEYS: new Set(env.CONSUMER_API_KEYS),
      RATE_LIMIT_MAX: env.CONSUMER_RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS: 60000,
    },

    // Scheduler
    SCHEDULER: {
      POLLING_ENABLED: env.POLLING_ENABLED,
      INITIAL_DELAY_MS: env.POLLING_INITIAL_DELAY_MS,
      MAX_RETRIES: 3,
      RETRY_BASE_DELAY_MS: 5000,
      MAX_RETRY_DELAY_MS: 300000, // 5 min
    },

    // Database
    DB: {
      EVENT_TTL_DAYS: 30,
      ORDER_TTL_DAYS: 90,
      BATCH_SIZE: 100,
    },

    // HTTP
    HTTP: {
      TIMEOUT_MS: 30000,
      MAX_REDIRECTS: 5,
    },

    // App
    APP: {
      NAME: 'brendi-consumer-integration',
      VERSION: '1.0.0',
    },
  } as const;
}

export function getConstants() {
  if (!constantsCache) {
    constantsCache = buildConstants();
  }
  return constantsCache;
}

export function resetConstantsCache(): void {
  constantsCache = null;
}

// Backward compatibility - lazy getter
export const CONSTANTS = new Proxy({} as ReturnType<typeof buildConstants>, {
  get(_target, prop) {
    return getConstants()[prop as keyof ReturnType<typeof buildConstants>];
  },
});

export type Constants = ReturnType<typeof buildConstants>;