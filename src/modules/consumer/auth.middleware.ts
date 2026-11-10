import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { CONSTANTS } from '../../config/constants.js';
import { logger } from '../../shared/logger/logger.js';
import { AppError } from '../../shared/errors/app.error.js';

const API_KEY_HEADER = 'x-api-key';

export function validateApiKey(apiKey: string): boolean {
  return CONSTANTS.CONSUMER.VALID_API_KEYS.has(apiKey);
}

export function extractApiKey(request: FastifyRequest): string | null {
  // Header principal
  const headerKey = request.headers[API_KEY_HEADER];
  if (headerKey && typeof headerKey === 'string') {
    return headerKey;
  }

  // Query param (fallback para testes)
  const queryKey = (request.query as Record<string, unknown>)?.api_key;
  if (queryKey && typeof queryKey === 'string') {
    return queryKey;
  }

  return null;
}

export async function consumerAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    logger.warn({ ip: request.ip, url: request.url }, 'Missing API Key');
    throw AppError.unauthorized('API Key required. Provide via X-API-Key header.');
  }

  if (!validateApiKey(apiKey)) {
    logger.warn({ ip: request.ip, url: request.url, keyPrefix: apiKey.slice(0, 8) }, 'Invalid API Key');
    throw AppError.unauthorized('Invalid API Key');
  }

  // Adicionar key info ao request para rate limiting/logging
  (request as FastifyRequest & { consumerApiKey: string }).consumerApiKey = apiKey;
}

export function registerConsumerAuth(app: FastifyInstance): void {
  app.addHook('preHandler', async (request, reply) => {
    // Aplicar apenas nas rotas /api/v1/orders*
    if (request.url.startsWith('/api/v1/orders')) {
      await consumerAuthMiddleware(request, reply);
    }
  });
}