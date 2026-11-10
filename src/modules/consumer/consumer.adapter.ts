import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { orderRepository } from '../persistence/repositories/order.repository.js';
import { logger } from '../../shared/logger/logger.js';
import { AppError } from '../../shared/errors/app.error.js';
import { validateConsumerAckRequest } from './consumer.types.js';

interface AuthenticatedRequest extends FastifyRequest {
  consumerApiKey: string;
}

export async function registerConsumerRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/orders/pending - Lista pedidos pendentes
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/api/v1/orders/pending', async (request, reply) => {
    const { limit = '50', offset = '0' } = request.query;
    const limitNum = Math.min(parseInt(limit, 10), 200);
    const offsetNum = parseInt(offset, 10);

    const orders = await orderRepository.findPending(limitNum + offsetNum);
    const paginatedOrders = orders.slice(offsetNum, offsetNum + limitNum);

    const formattedOrders = paginatedOrders.map((order) => formatOrderForConsumer(order));

    logger.info(
      { count: formattedOrders.length, limit: limitNum, offset: offsetNum, apiKey: (request as AuthenticatedRequest).consumerApiKey },
      'Consumer fetched pending orders'
    );

    return reply.send({ pedidos: formattedOrders });
  });

  // GET /api/v1/orders/:id - Detalhes de um pedido
  app.get<{
    Params: { id: string };
  }>('/api/v1/orders/:id', async (request, reply) => {
    const { id } = request.params;

    const order = await orderRepository.findById(id);

    if (!order) {
      throw AppError.notFound(`Order ${id} not found`);
    }

    logger.info({ orderId: id, apiKey: (request as AuthenticatedRequest).consumerApiKey }, 'Consumer fetched order details');

    return reply.send({ pedido: formatOrderForConsumer(order) });
  });

  // POST /api/v1/orders/:id/ack - Consumer confirma recebimento
  app.post<{
    Params: { id: string };
    Body: { consumer_order_id: string };
  }>('/api/v1/orders/:id/ack', async (request, reply) => {
    const { id } = request.params;
    const body = validateConsumerAckRequest(request.body);

    const order = await orderRepository.findById(id);

    if (!order) {
      throw AppError.notFound(`Order ${id} not found`);
    }

    if (order.status !== 'pending') {
      throw AppError.conflict(`Order ${id} is not pending (current: ${order.status})`);
    }

    const updatedOrder = await orderRepository.markDelivered(id, body.consumer_order_id);

    if (!updatedOrder) {
      throw AppError.internal('Failed to update order status');
    }

    logger.info(
      { orderId: id, consumerOrderId: body.consumer_order_id, apiKey: (request as AuthenticatedRequest).consumerApiKey },
      'Consumer acknowledged order'
    );

    return reply.send({
      success: true,
      acked_at: updatedOrder.ack_em!.toISOString(),
    });
  });

  // GET /api/v1/health - Health check público (sem auth)
  app.get('/api/v1/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}

function formatOrderForConsumer(order: {
  id: string;
  cliente: Record<string, unknown>;
  itens: unknown[];
  totais: Record<string, unknown>;
  entrega: Record<string, unknown>;
  pagamento: Record<string, unknown>;
  criado_em: string | Date;
  metadata?: Record<string, unknown> | null;
}): {
  id: string;
  cliente: Record<string, unknown>;
  itens: unknown[];
  totais: Record<string, unknown>;
  entrega: Record<string, unknown>;
  pagamento: Record<string, unknown>;
  criado_em: string;
  metadata?: Record<string, unknown>;
} {
  return {
    id: order.id,
    cliente: order.cliente,
    itens: order.itens,
    totais: order.totais,
    entrega: order.entrega,
    pagamento: order.pagamento,
    criado_em: order.criado_em instanceof Date ? order.criado_em.toISOString() : order.criado_em,
    metadata: order.metadata ?? undefined,
  };
}