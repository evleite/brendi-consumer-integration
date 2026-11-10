import { buildApp } from './app.js';
import { connectDatabase } from './modules/persistence/prisma.client.js';
import { pollingScheduler } from './modules/scheduling/polling.scheduler.js';
import { logger } from './shared/logger/logger.js';
import { getEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = getEnv();

  logger.info({ env: env.NODE_ENV, version: '1.0.0' }, 'Starting Brendi Consumer Integration');

  try {
    // Conectar banco de dados
    await connectDatabase();

    // Construir aplicação
    const app = await buildApp();

    // Iniciar scheduler
    pollingScheduler.start();

    // Iniciar servidor
    await app.listen({ port: env.PORT, host: '0.0.0.0' });

    logger.info({ port: env.PORT }, 'Server started successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

main();