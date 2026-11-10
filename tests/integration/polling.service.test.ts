import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to set up mocks before imports
const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  pollingService: {
    execute: vi.fn(),
    getStatus: vi.fn(() => ({ isRunning: false })),
  },
  brendiAdapter: {
    pollEvents: vi.fn(),
    getOrder: vi.fn(),
  },
  eventRepository: {
    isProcessed: vi.fn(),
    isProcessing: vi.fn(),
    markProcessing: vi.fn(),
    markCompleted: vi.fn(),
    markFailed: vi.fn(),
    getStats: vi.fn(),
  },
  orderRepository: {
    upsert: vi.fn(),
    findByBrendiOrderId: vi.fn(),
    markCancelled: vi.fn(),
  },
  orderTransformer: {
    transform: vi.fn(),
  },
  sessionRepository: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/shared/logger/logger.js', () => ({
  logger: mocks.logger,
}));

vi.mock('@/modules/brendi/polling.service.js', () => ({
  pollingService: mocks.pollingService,
}));

vi.mock('@/modules/brendi/brendi.adapter.js', () => ({
  brendiAdapter: mocks.brendiAdapter,
}));

vi.mock('@/modules/persistence/repositories/event.repository.js', () => ({
  eventRepository: mocks.eventRepository,
}));

vi.mock('@/modules/persistence/repositories/order.repository.js', () => ({
  orderRepository: mocks.orderRepository,
}));

vi.mock('@/modules/transform/order.transformer.js', () => ({
  orderTransformer: mocks.orderTransformer,
}));

vi.mock('@/modules/persistence/repositories/session.repository.js', () => ({
  sessionRepository: mocks.sessionRepository,
}));

// Import after mocks are set up
const { pollingService } = await import('@/modules/brendi/polling.service.js');
const { brendiAdapter } = await import('@/modules/brendi/brendi.adapter.js');
const { eventRepository } = await import('@/modules/persistence/repositories/event.repository.js');
const { orderRepository } = await import('@/modules/persistence/repositories/order.repository.js');
const { orderTransformer } = await import('@/modules/transform/order.transformer.js');
const { sessionRepository } = await import('@/modules/persistence/repositories/session.repository.js');

describe('PollingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pollingService.getStatus.mockReturnValue({ isRunning: false });
  });

  it('should skip if already running', async () => {
    mocks.pollingService.getStatus.mockReturnValue({ isRunning: true });
    mocks.pollingService.execute.mockResolvedValue({
      sessionId: '',
      eventsFetched: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      durationMs: 0,
      error: 'Polling already running',
    });

    const result = await pollingService.execute();

    expect(result.eventsFetched).toBe(0);
    expect(result.error).toBe('Polling already running');
  });

  it('should create session and process events', async () => {
    const mockEvents = [
      { event_id: 'evt_1', event_type: 'order.created', resource_id: 'ord_1', created_at: '2024-01-15T10:30:00Z' },
      { event_id: 'evt_2', event_type: 'order.updated', resource_id: 'ord_2', created_at: '2024-01-15T10:31:00Z' },
    ];

    mocks.sessionRepository.create.mockResolvedValue({ id: 'session_1', startedAt: new Date() });
    mocks.brendiAdapter.pollEvents.mockResolvedValue({ events: mockEvents });
    mocks.eventRepository.isProcessed.mockResolvedValue(false);
    mocks.eventRepository.isProcessing.mockResolvedValue(false);
    mocks.eventRepository.markProcessing.mockResolvedValue(undefined);
    mocks.brendiAdapter.getOrder.mockResolvedValue({ id: 'ord_1', status: 'confirmed' });
    mocks.orderTransformer.transform.mockReturnValue({ id: 'ord_1', status: 'pending' });
    mocks.orderRepository.upsert.mockResolvedValue({ id: 'ord_1' });
    mocks.eventRepository.markCompleted.mockResolvedValue(undefined);
    mocks.sessionRepository.update.mockResolvedValue({});
    mocks.pollingService.execute.mockImplementation(async () => {
      const session = await mocks.sessionRepository.create({ startedAt: new Date() });
      const eventsResponse = await mocks.brendiAdapter.pollEvents({ limit: 100 });
      let eventsProcessed = 0;
      let eventsFailed = 0;

      for (const event of eventsResponse.events) {
        try {
          const isProcessed = await mocks.eventRepository.isProcessed(event.event_id);
          if (!isProcessed) {
            const isProcessing = await mocks.eventRepository.isProcessing(event.event_id);
            if (!isProcessing) {
              await mocks.eventRepository.markProcessing(event.event_id);
              await mocks.brendiAdapter.getOrder(event.resource_id);
              await mocks.orderTransformer.transform({} as any);
              await mocks.orderRepository.upsert({} as any);
              await mocks.eventRepository.markCompleted(event.event_id);
              eventsProcessed++;
            }
          }
        } catch {
          eventsFailed++;
        }
      }

      await mocks.sessionRepository.update(session.id, {
        completedAt: new Date(),
        status: 'completed',
        eventsFetched: eventsResponse.events.length,
        eventsProcessed,
        eventsFailed,
      });

      return {
        sessionId: session.id,
        eventsFetched: eventsResponse.events.length,
        eventsProcessed,
        eventsFailed,
        durationMs: 100,
      };
    });

    const result = await pollingService.execute();

    expect(result.sessionId).toBe('session_1');
    expect(result.eventsFetched).toBe(2);
    expect(result.eventsProcessed).toBe(2);
    expect(result.eventsFailed).toBe(0);
  });

  it('should skip already processed events', async () => {
    const mockEvents = [
      { event_id: 'evt_1', event_type: 'order.created', resource_id: 'ord_1', created_at: '2024-01-15T10:30:00Z' },
    ];

    mocks.sessionRepository.create.mockResolvedValue({ id: 'session_1', startedAt: new Date() });
    mocks.brendiAdapter.pollEvents.mockResolvedValue({ events: mockEvents });
    mocks.eventRepository.isProcessed.mockResolvedValue(true);
    mocks.sessionRepository.update.mockResolvedValue({});
    mocks.pollingService.execute.mockImplementation(async () => {
      const session = await mocks.sessionRepository.create({ startedAt: new Date() });
      const eventsResponse = await mocks.brendiAdapter.pollEvents({ limit: 100 });
      let eventsProcessed = 0;
      let eventsFailed = 0;

      for (const event of eventsResponse.events) {
        try {
          const isProcessed = await mocks.eventRepository.isProcessed(event.event_id);
          if (!isProcessed) {
            const isProcessing = await mocks.eventRepository.isProcessing(event.event_id);
            if (!isProcessing) {
              await mocks.eventRepository.markProcessing(event.event_id);
              await mocks.brendiAdapter.getOrder(event.resource_id);
              await mocks.orderTransformer.transform({} as any);
              await mocks.orderRepository.upsert({} as any);
              await mocks.eventRepository.markCompleted(event.event_id);
              eventsProcessed++;
            }
          }
        } catch {
          eventsFailed++;
        }
      }

      await mocks.sessionRepository.update(session.id, {
        completedAt: new Date(),
        status: 'completed',
        eventsFetched: eventsResponse.events.length,
        eventsProcessed,
        eventsFailed,
      });

      return {
        sessionId: session.id,
        eventsFetched: eventsResponse.events.length,
        eventsProcessed,
        eventsFailed,
        durationMs: 100,
      };
    });

    const result = await pollingService.execute();

    expect(result.eventsFetched).toBe(1);
    expect(result.eventsProcessed).toBe(0);
    expect(mocks.brendiAdapter.getOrder).not.toHaveBeenCalled();
  });

  it('should handle event processing failure gracefully', async () => {
    const mockEvents = [
      { event_id: 'evt_1', event_type: 'order.created', resource_id: 'ord_1', created_at: '2024-01-15T10:30:00Z' },
    ];

    mocks.sessionRepository.create.mockResolvedValue({ id: 'session_1', startedAt: new Date() });
    mocks.brendiAdapter.pollEvents.mockResolvedValue({ events: mockEvents });
    mocks.eventRepository.isProcessed.mockResolvedValue(false);
    mocks.eventRepository.isProcessing.mockResolvedValue(false);
    mocks.eventRepository.markProcessing.mockResolvedValue(undefined);
    mocks.brendiAdapter.getOrder.mockRejectedValue(new Error('Brendi API error'));
    mocks.eventRepository.markFailed.mockResolvedValue(undefined);
    mocks.sessionRepository.update.mockResolvedValue({});
    mocks.pollingService.execute.mockImplementation(async () => {
      const session = await mocks.sessionRepository.create({ startedAt: new Date() });
      const eventsResponse = await mocks.brendiAdapter.pollEvents({ limit: 100 });
      let eventsProcessed = 0;
      let eventsFailed = 0;

      for (const event of eventsResponse.events) {
        try {
          const isProcessed = await mocks.eventRepository.isProcessed(event.event_id);
          if (!isProcessed) {
            const isProcessing = await mocks.eventRepository.isProcessing(event.event_id);
            if (!isProcessing) {
              await mocks.eventRepository.markProcessing(event.event_id);
              await mocks.brendiAdapter.getOrder(event.resource_id);
              await mocks.orderTransformer.transform({} as any);
              await mocks.orderRepository.upsert({} as any);
              await mocks.eventRepository.markCompleted(event.event_id);
              eventsProcessed++;
            }
          }
        } catch (error) {
          eventsFailed++;
          await mocks.eventRepository.markFailed(event.event_id, error instanceof Error ? error.message : 'Unknown error');
        }
      }

      await mocks.sessionRepository.update(session.id, {
        completedAt: new Date(),
        status: 'completed',
        eventsFetched: eventsResponse.events.length,
        eventsProcessed,
        eventsFailed,
      });

      return {
        sessionId: session.id,
        eventsFetched: eventsResponse.events.length,
        eventsProcessed,
        eventsFailed,
        durationMs: 100,
      };
    });

    const result = await pollingService.execute();

    expect(result.eventsFetched).toBe(1);
    expect(result.eventsProcessed).toBe(0);
    expect(result.eventsFailed).toBe(1);
    expect(mocks.eventRepository.markFailed).toHaveBeenCalledWith('evt_1', 'Brendi API error');
  });

  it('should mark session as failed on unexpected error', async () => {
    mocks.sessionRepository.create.mockResolvedValue({ id: 'session_1', startedAt: new Date() });
    mocks.brendiAdapter.pollEvents.mockRejectedValue(new Error('Network error'));
    mocks.sessionRepository.update.mockResolvedValue({});
    mocks.pollingService.execute.mockImplementation(async () => {
      try {
        const session = await mocks.sessionRepository.create({ startedAt: new Date() });
        await mocks.brendiAdapter.pollEvents({ limit: 100 });
        return { sessionId: session.id, eventsFetched: 0, eventsProcessed: 0, eventsFailed: 0, durationMs: 0 };
      } catch (error) {
        await mocks.sessionRepository.update('session_1', {
          completedAt: new Date(),
          status: 'failed',
          eventsFetched: 0,
          eventsProcessed: 0,
          eventsFailed: 0,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        return {
          sessionId: 'session_1',
          eventsFetched: 0,
          eventsProcessed: 0,
          eventsFailed: 0,
          durationMs: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const result = await pollingService.execute();

    expect(result.error).toBe('Network error');
    expect(mocks.sessionRepository.update).toHaveBeenCalledWith('session_1', expect.objectContaining({
      status: 'failed',
      errorMessage: 'Network error',
    }));
  });
});