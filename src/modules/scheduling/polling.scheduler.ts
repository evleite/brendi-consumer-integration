import cron from 'node-cron';
import { logger } from '../../shared/logger/logger.js';
import { CONSTANTS } from '../../config/constants.js';
import { pollingService } from '../brendi/polling.service.js';
import { sessionRepository } from '../persistence/repositories/session.repository.js';
import { eventRepository } from '../persistence/repositories/event.repository.js';
import { orderRepository } from '../persistence/repositories/order.repository.js';

export class PollingScheduler {
  private task: cron.ScheduledTask | null = null;
  private cleanupTask: cron.ScheduledTask | null = null;

  start(): void {
    if (!CONSTANTS.SCHEDULER.POLLING_ENABLED) {
      logger.info('Polling disabled via config');
      return;
    }

    // Agendar polling recorrente
    const intervalMinutes = Math.round(CONSTANTS.BRENDI.POLLING_INTERVAL_MS / 60000);
    const cronExpression = `*/${intervalMinutes} * * * *`;

    logger.info({ cronExpression, intervalMinutes }, 'Starting polling scheduler');

    this.task = cron.schedule(cronExpression, async () => {
      await this.runPollingCycle();
    });

    // Agendar limpeza diária (às 03:00)
    this.cleanupTask = cron.schedule('0 3 * * *', async () => {
      await this.runCleanup();
    });

    // Executar primeira vez após delay inicial
    setTimeout(() => {
      this.runPollingCycle().catch((error) => {
        logger.error({ err: error }, 'Initial polling cycle failed');
      });
    }, CONSTANTS.SCHEDULER.INITIAL_DELAY_MS);
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Polling scheduler stopped');
    }
    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
    }
  }

  async runPollingCycle(): Promise<void> {
    const { isRunning } = pollingService.getStatus();
    if (isRunning) {
      logger.warn('Polling cycle skipped - previous cycle still running');
      return;
    }

    try {
      const result = await pollingService.execute();

      logger.info(
        {
          sessionId: result.sessionId,
          eventsFetched: result.eventsFetched,
          eventsProcessed: result.eventsProcessed,
          eventsFailed: result.eventsFailed,
          durationMs: result.durationMs,
        },
        'Polling cycle completed'
      );
    } catch (error) {
      logger.error({ err: error }, 'Polling cycle failed');
    }
  }

  async runCleanup(): Promise<void> {
    logger.info('Running scheduled cleanup');

    try {
      const [eventsCleaned, ordersCleaned, stuckSessions] = await Promise.all([
        eventRepository.cleanupOldEvents(),
        orderRepository.cleanupOldOrders(),
        sessionRepository.cleanupStuckSessions(),
      ]);

      logger.info(
        { eventsCleaned, ordersCleaned, stuckSessions },
        'Scheduled cleanup completed'
      );
    } catch (error) {
      logger.error({ err: error }, 'Scheduled cleanup failed');
    }
  }

  getStatus(): { polling: boolean; cleanup: boolean } {
    return {
      polling: this.task !== null,
      cleanup: this.cleanupTask !== null,
    };
  }
}

export const pollingScheduler = new PollingScheduler();