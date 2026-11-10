import { prisma } from './prisma.client.js';

export interface UnitOfWork {
  eventRepository: {
    create: (input: { eventId: string; eventType: string; orderId: string; receivedAt: Date; rawPayload?: Record<string, unknown> }) => Promise<{ eventId: string; status: string }>;
    markProcessing: (eventId: string) => Promise<void>;
    markCompleted: (eventId: string) => Promise<void>;
    markFailed: (eventId: string, errorMessage: string) => Promise<void>;
  };
  orderRepository: {
    upsert: (input: {
      id: string;
      brendiOrderId: string;
      consumerOrderId?: string;
      status: string;
      customer: Record<string, unknown>;
      items: unknown[];
      totals: Record<string, unknown>;
      delivery: Record<string, unknown>;
      payment: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      createdAt: Date;
    }) => Promise<{ id: string }>;
  };
}

export async function withUnitOfWork<T>(
  fn: (uow: UnitOfWork) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const uow: UnitOfWork = {
      eventRepository: {
        create: async (input) => {
          const event = await tx.processedEvent.create({
            data: {
              eventId: input.eventId,
              eventType: input.eventType,
              orderId: input.orderId,
              receivedAt: input.receivedAt,
              rawPayload: input.rawPayload as any,
              status: 'pending',
            },
            select: { eventId: true, status: true },
          });
          return event;
        },
        markProcessing: async (eventId) => {
          await tx.processedEvent.update({
            where: { eventId },
            data: { status: 'processing' },
          });
        },
        markCompleted: async (eventId) => {
          await tx.processedEvent.update({
            where: { eventId },
            data: { status: 'completed', processedAt: new Date() },
          });
        },
        markFailed: async (eventId, errorMessage) => {
          await tx.processedEvent.update({
            where: { eventId },
            data: { status: 'failed', processedAt: new Date(), errorMessage },
          });
        },
      },
      orderRepository: {
        upsert: async (input) => {
          const order = await tx.order.upsert({
            where: { id: input.id },
            update: {
              brendiOrderId: input.brendiOrderId,
              consumerOrderId: input.consumerOrderId,
              status: input.status,
              customer: input.customer as any,
              items: input.items as any,
              totals: input.totals as any,
              delivery: input.delivery as any,
              payment: input.payment as any,
              metadata: input.metadata as any,
              updatedAt: new Date(),
            },
            create: {
              id: input.id,
              brendiOrderId: input.brendiOrderId,
              consumerOrderId: input.consumerOrderId,
              status: input.status,
              customer: input.customer as any,
              items: input.items as any,
              totals: input.totals as any,
              delivery: input.delivery as any,
              payment: input.payment as any,
              metadata: input.metadata as any,
              createdAt: input.createdAt,
            },
            select: { id: true },
          });
          return order;
        },
      },
    };

    return fn(uow);
  });
}