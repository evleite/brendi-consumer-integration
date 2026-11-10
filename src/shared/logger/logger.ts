import pino from 'pino';
import type { Logger, LoggerOptions } from 'pino';
import { getEnv } from '../../config/env.js';

function createLogger(): Logger {
  const env = getEnv();

  const isDevelopment = env.NODE_ENV === 'development';

  const loggerConfig: LoggerOptions = {
    level: env.LOG_LEVEL,
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    base: {
      service: 'brendi-consumer-integration',
    },
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  const pinoFactory = pino as unknown as (options?: LoggerOptions) => Logger;
  return pinoFactory(loggerConfig);
}

let loggerInstance: Logger | null = null;

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

// Export a proxy that lazily initializes the logger
export const logger = new Proxy({} as Logger, {
  get(_target, prop) {
    return getLogger()[prop as keyof Logger];
  },
});

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}

export function resetLogger(): void {
  loggerInstance = null;
}