import { prisma } from '../prisma.client.js';
import { logger } from '../../../shared/logger/logger.js';
import { CONSTANTS } from '../../../config/constants.js';
import type { JsonValue } from '@prisma/client/runtime/library.js';

export interface ProcessedEventRecord {
  id: string;
  eventId: string;
  eventType: string;
  orderId: string;
  receivedAt: Date;
  processedAt: Date | null;
  status: string;
  errorMessage: string | null;
  rawPayload: Record<string, unknown> | null;
}

export interface CreateEventInput {
  eventId: string;
  eventType: string;
  orderId: string;
  receivedAt: Date;
  rawPayload?: Record<string, unknown>;
}

function toRecord(value: JsonValue | null): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

export class EventRepository {
  async findByEventId(eventId: string): Promise<ProcessedEventRecord | null> {
    const event = await prisma.processedEvent.findUnique({
      where: { eventId },
    });
    if (!event) return null;
    return { ...event, rawPayload: toRecord(event.rawPayload) };
  }

  async isProcessed(eventId: string): Promise<boolean> {
    const event = await prisma.processedEvent.findUnique({
      where: { eventId },
      select: { status: true },
    });
    return event?.status === 'completed';
  }

  async isProcessing(eventId: string): Promise<boolean> {
    const event = await prisma.processedEvent.findUnique({
      where: { eventId },
      select: { status: true },
    });
    return event?.status === 'processing';
  }

  async create(input: CreateEventInput): Promise<ProcessedEventRecord> {
    const event = await prisma.processedEvent.create({
      data: {
        eventId: input.eventId,
        eventType: input.eventType,
        orderId: input.orderId,
        receivedAt: input.receivedAt,
        rawPayload: input.rawPayload as any,
        status: 'pending',
      },
    });
    return { ...event, rawPayload: toRecord(event.rawPayload) };
  }

  async markProcessing(eventId: string): Promise<void> {
    await prisma.processedEvent.update({
      where: { eventId },
      data: { status: 'processing' },
    });
  }

  async markCompleted(eventId: string): Promise<void> {
    await prisma.processedEvent.update({
      where: { eventId },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
    });
  }

  async markFailed(eventId: string, errorMessage: string): Promise<void> {
    await prisma.processedEvent.update({
      where: { eventId },
      data: {
        status: 'failed',
        processedAt: new Date(),
        errorMessage,
      },
    });
  }

  async getPendingEvents(limit: number = CONSTANTS.DB.BATCH_SIZE): Promise<ProcessedEventRecord[]> {
    const events = await prisma.processedEvent.findMany({
      where: { status: 'pending' },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
    return events.map((e) => ({ ...e, rawPayload: toRecord(e.rawPayload) }));
  }

  async getFailedEvents(limit: number = CONSTANTS.DB.BATCH_SIZE): Promise<ProcessedEventRecord[]> {
    const events = await prisma.processedEvent.findMany({
      where: { status: 'failed' },
      orderBy: { receivedAt: 'asc' },
      take: limit,
    });
    return events.map((e) => ({ ...e, rawPayload: toRecord(e.rawPayload) }));
  }

  async cleanupOldEvents(olderThanDays: number = CONSTANTS.DB.EVENT_TTL_DAYS): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.processedEvent.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        processedAt: { lt: cutoffDate },
      },
    });

    logger.info({ deletedCount: result.count, olderThanDays }, 'Cleaned up old processed events');
    return result.count;
  }

  async getStats(): Promise<{ pending: number; processing: number; completed: number; failed: number }> {
    const [pending, processing, completed, failed] = await Promise.all([
      prisma.processedEvent.count({ where: { status: 'pending' } }),
      prisma.processedEvent.count({ where: { status: 'processing' } }),
      prisma.processedEvent.count({ where: { status: 'completed' } }),
      prisma.processedEvent.count({ where: { status: 'failed' } }),
    ]);

    return { pending, processing, completed, failed };
  }
}

export const eventRepository = new EventRepository();