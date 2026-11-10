import axios, { AxiosInstance } from 'axios';
import { logger } from '../../shared/logger/logger.js';
import { CONSTANTS } from '../../config/constants.js';
import { withRetry, isRetryableError } from '../../shared/utils/retry.js';
import { oauthService } from './oauth.service.js';
import {
  BrendiEvent,
  BrendiEventsResponse,
  BrendiOrder,
  validateBrendiEvents,
  validateBrendiOrder,
} from './brendi.types.js';

export interface PollEventsParams {
  since?: Date;
  limit?: number;
}

export class BrendiAdapter {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: CONSTANTS.BRENDI.BASE_URL,
      timeout: CONSTANTS.HTTP.TIMEOUT_MS,
      headers: {
        Accept: 'application/json',
      },
    });

    // Interceptor para adicionar token OAuth
    this.client.interceptors.request.use(async (config) => {
      const token = await oauthService.getValidToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Interceptor para tratar 401 (token expirado)
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          logger.warn('Token expired, fetching new token and retrying');

          oauthService.clearCache();
          const newToken = await oauthService.getValidToken();
          originalRequest.headers.Authorization = `Bearer ${newToken}`;

          return this.client(originalRequest);
        }

        return Promise.reject(error);
      }
    );
  }

  async pollEvents(params: PollEventsParams = {}): Promise<BrendiEventsResponse> {
    const { since, limit = 100 } = params;

    const queryParams = new URLSearchParams({
      limit: limit.toString(),
    });

    if (since) {
      queryParams.append('since', since.toISOString());
    }

    logger.debug({ since: since?.toISOString(), limit }, 'Polling Brendi events');

    return withRetry(
      async () => {
        const response = await this.client.get<BrendiEventsResponse>(
          `${CONSTANTS.BRENDI.POLLING_ENDPOINT}?${queryParams.toString()}`
        );
        return validateBrendiEvents(response.data);
      },
      {
        maxRetries: CONSTANTS.SCHEDULER.MAX_RETRIES,
        baseDelayMs: CONSTANTS.SCHEDULER.RETRY_BASE_DELAY_MS,
        maxDelayMs: CONSTANTS.SCHEDULER.MAX_RETRY_DELAY_MS,
        shouldRetry: isRetryableError,
        onRetry: (error, attempt, delayMs) => {
          logger.warn({ attempt, delayMs, error: String(error) }, 'Retrying Brendi pollEvents');
        },
      }
    );
  }

  async getOrder(orderId: string): Promise<BrendiOrder> {
    logger.debug({ orderId }, 'Fetching order details from Brendi');

    return withRetry(
      async () => {
        const response = await this.client.get<BrendiOrder>(
          `${CONSTANTS.BRENDI.ORDERS_ENDPOINT}/${orderId}`
        );
        return validateBrendiOrder(response.data);
      },
      {
        maxRetries: CONSTANTS.SCHEDULER.MAX_RETRIES,
        baseDelayMs: CONSTANTS.SCHEDULER.RETRY_BASE_DELAY_MS,
        maxDelayMs: CONSTANTS.SCHEDULER.MAX_RETRY_DELAY_MS,
        shouldRetry: isRetryableError,
        onRetry: (error, attempt, delayMs) => {
          logger.warn({ orderId, attempt, delayMs, error: String(error) }, 'Retrying Brendi getOrder');
        },
      }
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

export const brendiAdapter = new BrendiAdapter();