import { prisma } from '../prisma.client.js';
import { logger } from '../../../shared/logger/logger.js';

export interface PollingSessionRecord {
  id: string;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  eventsFetched: number;
  eventsProcessed: number;
  eventsFailed: number;
  errorMessage: string | null;
}

export interface CreateSessionInput {
  startedAt: Date;
}

export interface UpdateSessionInput {
  completedAt?: Date;
  status?: string;
  eventsFetched?: number;
  eventsProcessed?: number;
  eventsFailed?: number;
  errorMessage?: string;
}

export class SessionRepository {
  async create(input: CreateSessionInput): Promise<PollingSessionRecord> {
    const session = await prisma.pollingSession.create({
      data: {
        startedAt: input.startedAt,
        status: 'running',
      },
    });
    return session;
  }

  async update(id: string, input: UpdateSessionInput): Promise<PollingSessionRecord> {
    const session = await prisma.pollingSession.update({
      where: { id },
      data: input,
    });
    return session;
  }

  async findLatestCompleted(limit = 10): Promise<PollingSessionRecord[]> {
    return prisma.pollingSession.findMany({
      where: { status: 'completed' },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  async getStats(): Promise<{ total: number; completed: number; failed: number; running: number }> {
    const [total, completed, failed, running] = await Promise.all([
      prisma.pollingSession.count(),
      prisma.pollingSession.count({ where: { status: 'completed' } }),
      prisma.pollingSession.count({ where: { status: 'failed' } }),
      prisma.pollingSession.count({ where: { status: 'running' } }),
    ]);

    return { total, completed, failed, running };
  }

  async cleanupStuckSessions(olderThanMinutes: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanMinutes * 60000);

    const result = await prisma.pollingSession.updateMany({
      where: {
        status: 'running',
        startedAt: { lt: cutoffDate },
      },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Session stuck - marked as failed by cleanup',
      },
    });

    if (result.count > 0) {
      logger.warn({ count: result.count }, 'Cleaned up stuck polling sessions');
    }

    return result.count;
  }
}

export const sessionRepository = new SessionRepository();