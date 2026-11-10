import { logger } from '../logger/logger.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, shouldRetry, onRetry } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxRetries;
      const shouldRetryError = shouldRetry ? shouldRetry(error) : true;

      if (isLastAttempt || !shouldRetryError) {
        throw error;
      }

      // Exponential backoff with jitter
      const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = Math.random() * 0.3 * exponentialDelay;
      const delayMs = Math.floor(exponentialDelay + jitter);

      if (onRetry) {
        onRetry(error, attempt + 1, delayMs);
      } else {
        logger.warn(
          { attempt: attempt + 1, maxRetries, delayMs, error: String(error) },
          'Retrying operation'
        );
      }

      await sleep(delayMs);
    }
  }

  throw lastError;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Response) {
    return error.status >= 500 || error.status === 429;
  }
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status >= 500 || status === 429 || status === 0; // 0 = network error
  }
  // Network errors, timeouts
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRetryableAxiosErrorHandler() {
  return (error: unknown) => isRetryableError(error);
}