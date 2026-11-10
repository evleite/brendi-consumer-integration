import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../logger/logger.js';
import { AppError, isAppError } from './app.error.js';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = request.id;
  const correlationId = request.headers['x-correlation-id'] as string | undefined;

  const logContext = {
    requestId,
    correlationId,
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
  };

  if (isAppError(error)) {
    const logLevel = error.isOperational ? 'warn' : 'error';
    logger[logLevel]({ ...logContext, error: error.toJSON() }, error.message);

    reply.status(error.statusCode).send(error.toJSON());
    return;
  }

  // Validation errors from Zod/Fastify
  if (error.validation) {
    logger.warn({ ...logContext, validation: error.validation }, 'Validation error');
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        statusCode: 400,
        details: error.validation,
      },
    });
    return;
  }

  // Unexpected errors
  logger.error({ ...logContext, err: error }, 'Unexpected error');

  // Don't leak internal details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction ? 'Internal server error' : error.message;

  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message,
      statusCode: 500,
    },
  });
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  logger.warn({ requestId: request.id, url: request.url }, 'Route not found');
  reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    },
  });
}