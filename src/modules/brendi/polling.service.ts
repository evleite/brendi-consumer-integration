import { logger } from '../../shared/logger/logger.js';
import { CONSTANTS } from '../../config/constants.js';
import { brendiAdapter } from './brendi.adapter.js';
import { eventRepository } from '../persistence/repositories/event.repository.js';
import { orderRepository } from '../persistence/repositories/order.repository.js';
import { sessionRepository } from '../persistence/repositories/session.repository.js';
import { orderTransformer } from '../transform/order.transformer.js';

export interface PollingResult {
  sessionId: string;
  eventsFetched: number;
  eventsProcessed: number;
  eventsFailed: number;
  durationMs: number;
  error?: string;
}

export class PollingService {
  private isRunning = false;

  async execute(): Promise<PollingResult> {
    if (this.isRunning) {
      logger.warn('Polling already running, skipping');
      return {
        sessionId: '',
        eventsFetched: 0,
        eventsProcessed: 0,
        eventsFailed: 0,
        durationMs: 0,
        error: 'Polling already running',
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const startedAt = new Date();

    let sessionId = '';
    let eventsFetched = 0;
    let eventsProcessed = 0;
    let eventsFailed = 0;
    let error: string | undefined;

    try {
      // Criar sessão de polling
      const session = await sessionRepository.create({ startedAt });
      sessionId = session.id;
      logger.info({ sessionId }, 'Started polling session');

      // Buscar último evento processado para usar como cursor
      const lastEvent = await this.getLastProcessedEvent();

      // Polling de eventos
      const eventsResponse = await brendiAdapter.pollEvents({
        since: lastEvent,
        limit: CONSTANTS.DB.BATCH_SIZE,
      });

      eventsFetched = eventsResponse.events.length;
      logger.info({ sessionId, eventsFetched }, 'Events fetched from Brendi');

      // Processar cada evento
      for (const event of eventsResponse.events) {
        try {
          await this.processEvent(event, sessionId);
          eventsProcessed++;
        } catch (eventError) {
          eventsFailed++;
          logger.error({ sessionId, eventId: event.event_id, err: eventError }, 'Failed to process event');
        }
      }

      // Atualizar sessão como completada
      await sessionRepository.update(sessionId, {
        completedAt: new Date(),
        status: 'completed',
        eventsFetched,
        eventsProcessed,
        eventsFailed,
      });

      logger.info(
        { sessionId, eventsFetched, eventsProcessed, eventsFailed, durationMs: Date.now() - startTime },
        'Polling session completed'
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ sessionId, err, durationMs: Date.now() - startTime }, 'Polling session failed');

      if (sessionId) {
        await sessionRepository.update(sessionId, {
          completedAt: new Date(),
          status: 'failed',
          eventsFetched,
          eventsProcessed,
          eventsFailed,
          errorMessage: error,
        });
      }
    } finally {
      this.isRunning = false;
    }

    return {
      sessionId,
      eventsFetched,
      eventsProcessed,
      eventsFailed,
      durationMs: Date.now() - startTime,
      error,
    };
  }

  private async getLastProcessedEvent(): Promise<Date | undefined> {
    // Buscar a data do último evento processado com sucesso
    const stats = await eventRepository.getStats();
    if (stats.completed === 0) {
      return undefined; // Primeira execução, buscar todos
    }

    // Buscar o evento mais recente completado
    // Nota: Em produção, seria melhor manter um cursor persistente
    // Por simplicidade, buscamos eventos das últimas 24h
    const since = new Date();
    since.setHours(since.getHours() - 24);
    return since;
  }

  private async processEvent(event: { event_id: string; event_type: string; resource_id: string; created_at: string }, sessionId: string): Promise<void> {
    const { event_id, event_type, resource_id, created_at } = event;

    logger.debug({ sessionId, eventId: event_id, eventType: event_type, orderId: resource_id }, 'Processing event');

    // Verificar idempotência
    const isProcessed = await eventRepository.isProcessed(event_id);
    if (isProcessed) {
      logger.debug({ eventId: event_id }, 'Event already processed, skipping');
      return;
    }

    const isProcessing = await eventRepository.isProcessing(event_id);
    if (isProcessing) {
      logger.warn({ eventId: event_id }, 'Event already being processed, skipping');
      return;
    }

    // Marcar como processing
    await eventRepository.markProcessing(event_id);

    try {
      switch (event_type) {
        case 'order.created':
        case 'order.updated':
          await this.processOrderEvent(event_id, resource_id, created_at, event);
          break;

        case 'order.cancelled':
          await this.processCancellationEvent(event_id, resource_id);
          break;

        case 'order.delivered':
          // O Consumer que confirma via ACK, não o Brendi
          logger.info({ eventId: event_id, orderId: resource_id }, 'Order delivered event received (informational)');
          break;

        default:
          logger.warn({ eventId: event_id, eventType: event_type }, 'Unknown event type, marking as completed');
      }

      // Marcar como completado
      await eventRepository.markCompleted(event_id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await eventRepository.markFailed(event_id, errorMessage);
      throw error;
    }
  }

  private async processOrderEvent(
    eventId: string,
    orderId: string,
    createdAt: string,
    rawEvent: object
  ): Promise<void> {
    // Buscar detalhes completos do pedido
    const brendiOrder = await brendiAdapter.getOrder(orderId);

    // Verificar se o pedido está em status que deve ser sincronizado
    if (!this.shouldSyncOrder(brendiOrder.status)) {
      logger.info({ orderId, status: brendiOrder.status }, 'Order status not syncable, skipping');
      return;
    }

    // Transformar para formato Consumer
    const transformedOrder = orderTransformer.transform(brendiOrder);

    // Salvar/atualizar pedido
    await orderRepository.upsert({
      id: transformedOrder.id,
      brendiOrderId: transformedOrder.brendiOrderId,
      status: transformedOrder.status,
      cliente: transformedOrder.cliente,
      itens: transformedOrder.itens,
      totais: transformedOrder.totais,
      entrega: transformedOrder.entrega,
      pagamento: transformedOrder.pagamento,
      metadata: transformedOrder.metadata,
      criado_em: new Date(transformedOrder.criado_em),
    });

    logger.info({ eventId, orderId: transformedOrder.id }, 'Order processed and stored');
  }

  private async processCancellationEvent(eventId: string, orderId: string): Promise<void> {
    const existingOrder = await orderRepository.findByBrendiOrderId(orderId);

    if (existingOrder && existingOrder.status === 'pending') {
      await orderRepository.markCancelled(existingOrder.id);
      logger.info({ eventId, orderId }, 'Order marked as cancelled');
    } else if (existingOrder) {
      logger.info({ eventId, orderId, currentStatus: existingOrder.status }, 'Order already in non-pending status, not cancelling');
    } else {
      logger.warn({ eventId, orderId }, 'Cancellation event for unknown order');
    }
  }

  private shouldSyncOrder(status: string): boolean {
    // Sincronizar apenas pedidos confirmados ou em preparação
    return ['confirmed', 'preparing', 'ready'].includes(status);
  }

  getStatus(): { isRunning: boolean } {
    return { isRunning: this.isRunning };
  }
}

export const pollingService = new PollingService();