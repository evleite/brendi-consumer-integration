import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { logger } from './shared/logger/logger.js';
import { CONSTANTS } from './config/constants.js';
import { errorHandler, notFoundHandler } from './shared/errors/error.handler.js';
import { registerConsumerRoutes } from './modules/consumer/consumer.adapter.js';
import { registerConsumerAuth } from './modules/consumer/auth.middleware.js';
import { pollingScheduler } from './modules/scheduling/polling.scheduler.js';
import { connectDatabase, disconnectDatabase, healthCheckDatabase } from './modules/persistence/prisma.client.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Usamos nosso próprio logger
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1024 * 1024, // 1MB
  });

  // Plugins de segurança
  await app.register(helmet, {
    contentSecurityPolicy: false, // API não serve HTML
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cors, {
    origin: true, // Configurar origins específicos em produção
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Request-Id', 'X-Correlation-Id'],
  });

  await app.register(rateLimit, {
    global: false, // Aplicar por rota
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // Health check público (sem rate limit estrito)
  app.get('/health', async () => {
    const dbHealthy = await healthCheckDatabase();
    return {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: CONSTANTS.APP.NAME,
      version: CONSTANTS.APP.VERSION,
      database: dbHealthy ? 'connected' : 'disconnected',
    };
  });

  // Health check detalhado (protegido)
  app.get('/health/detailed', async () => {
    const dbHealthy = await healthCheckDatabase();
    const [eventStats, orderStats, sessionStats] = await Promise.all([
      import('./modules/persistence/repositories/event.repository.js').then((m) => m.eventRepository.getStats()),
      import('./modules/persistence/repositories/order.repository.js').then((m) => m.orderRepository.getStats()),
      import('./modules/persistence/repositories/session.repository.js').then((m) => m.sessionRepository.getStats()),
    ]);

    return {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: CONSTANTS.APP.NAME,
      version: CONSTANTS.APP.VERSION,
      database: dbHealthy ? 'connected' : 'disconnected',
      stats: {
        events: eventStats,
        orders: orderStats,
        sessions: sessionStats,
      },
      scheduler: pollingScheduler.getStatus(),
    };
  });

  // Registrar autenticação Consumer
  registerConsumerAuth(app);

  // Registrar rotas Consumer
  await registerConsumerRoutes(app);

  // Error handlers
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    pollingScheduler.stop();
    await disconnectDatabase();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return app;
}