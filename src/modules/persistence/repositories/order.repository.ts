import { prisma } from '../prisma.client.js';
import { logger } from '../../../shared/logger/logger.js';
import { CONSTANTS } from '../../../config/constants.js';
import type { JsonValue } from '@prisma/client/runtime/library.js';

export interface OrderRecord {
  id: string;
  brendiOrderId: string;
  consumerOrderId: string | null;
  status: string;
  cliente: Record<string, unknown>;
  itens: unknown[];
  totais: Record<string, unknown>;
  entrega: Record<string, unknown>;
  pagamento: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  criado_em: Date;
  updatedAt: Date;
  entregue_em: Date | null;
  ack_em: Date | null;
}

export interface UpsertOrderInput {
  id: string;
  brendiOrderId: string;
  consumerOrderId?: string;
  status: string;
  cliente: Record<string, unknown>;
  itens: unknown[];
  totais: Record<string, unknown>;
  entrega: Record<string, unknown>;
  pagamento: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  criado_em: Date;
}

function toRecord(value: JsonValue | null): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function toArray(value: JsonValue | null): unknown[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [];
}

function mapOrder(order: {
  id: string;
  brendiOrderId: string;
  consumerOrderId: string | null;
  status: string;
  customer: JsonValue;
  items: JsonValue;
  totals: JsonValue;
  delivery: JsonValue;
  payment: JsonValue;
  metadata: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
  ackAt: Date | null;
}): OrderRecord {
  return {
    id: order.id,
    brendiOrderId: order.brendiOrderId,
    consumerOrderId: order.consumerOrderId,
    status: order.status,
    cliente: toRecord(order.customer)!,
    itens: toArray(order.items),
    totais: toRecord(order.totals)!,
    entrega: toRecord(order.delivery)!,
    pagamento: toRecord(order.payment)!,
    metadata: toRecord(order.metadata),
    criado_em: order.createdAt,
    updatedAt: order.updatedAt,
    entregue_em: order.deliveredAt,
    ack_em: order.ackAt,
  };
}

export class OrderRepository {
  async findById(id: string): Promise<OrderRecord | null> {
    const order = await prisma.order.findUnique({
      where: { id },
    });
    return order ? mapOrder(order) : null;
  }

  async findByBrendiOrderId(brendiOrderId: string): Promise<OrderRecord | null> {
    const order = await prisma.order.findUnique({
      where: { brendiOrderId },
    });
    return order ? mapOrder(order) : null;
  }

  async findByConsumerOrderId(consumerOrderId: string): Promise<OrderRecord | null> {
    const order = await prisma.order.findUnique({
      where: { consumerOrderId },
    });
    return order ? mapOrder(order) : null;
  }

  async upsert(input: UpsertOrderInput): Promise<OrderRecord> {
    const order = await prisma.order.upsert({
      where: { id: input.id },
      update: {
        brendiOrderId: input.brendiOrderId,
        consumerOrderId: input.consumerOrderId,
        status: input.status,
        customer: input.cliente as any,
        items: input.itens as any,
        totals: input.totais as any,
        delivery: input.entrega as any,
        payment: input.pagamento as any,
        metadata: input.metadata as any,
        updatedAt: new Date(),
      },
      create: {
        id: input.id,
        brendiOrderId: input.brendiOrderId,
        consumerOrderId: input.consumerOrderId,
        status: input.status,
        customer: input.cliente as any,
        items: input.itens as any,
        totals: input.totais as any,
        delivery: input.entrega as any,
        payment: input.pagamento as any,
        metadata: input.metadata as any,
        createdAt: input.criado_em,
      },
    });
    return mapOrder(order);
  }

  async findPending(limit: number = CONSTANTS.DB.BATCH_SIZE): Promise<OrderRecord[]> {
    const orders = await prisma.order.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return orders.map(mapOrder);
  }

  async findByStatus(status: string, limit: number = CONSTANTS.DB.BATCH_SIZE): Promise<OrderRecord[]> {
    const orders = await prisma.order.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return orders.map(mapOrder);
  }

  async markDelivered(
    id: string,
    consumerOrderId: string
  ): Promise<OrderRecord | null> {
    const order = await prisma.order.update({
      where: { id },
      data: {
        status: 'delivered',
        consumerOrderId,
        deliveredAt: new Date(),
        ackAt: new Date(),
      },
    });
    return mapOrder(order);
  }

  async markCancelled(id: string): Promise<OrderRecord | null> {
    const order = await prisma.order.update({
      where: { id },
      data: {
        status: 'cancelled',
        updatedAt: new Date(),
      },
    });
    return mapOrder(order);
  }

  async markFailed(id: string, errorMessage: string): Promise<OrderRecord | null> {
    const order = await prisma.order.update({
      where: { id },
      data: {
        status: 'failed',
        metadata: { error: errorMessage } as any,
        updatedAt: new Date(),
      },
    });
    return mapOrder(order);
  }

  async cleanupOldOrders(olderThanDays: number = CONSTANTS.DB.ORDER_TTL_DAYS): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.order.deleteMany({
      where: {
        status: { in: ['delivered', 'cancelled'] },
        updatedAt: { lt: cutoffDate },
      },
    });

    logger.info({ deletedCount: result.count, olderThanDays }, 'Cleaned up old orders');
    return result.count;
  }

  async getStats(): Promise<Record<string, number>> {
    const statuses = ['pending', 'delivered', 'failed', 'cancelled'];
    const stats: Record<string, number> = {};

    for (const status of statuses) {
      stats[status] = await prisma.order.count({ where: { status } });
    }

    return stats;
  }
}

export const orderRepository = new OrderRepository();