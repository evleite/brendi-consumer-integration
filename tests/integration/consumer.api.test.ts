import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerConsumerRoutes } from '@/modules/consumer/consumer.adapter.js';
import { registerConsumerAuth } from '@/modules/consumer/auth.middleware.js';
import { orderRepository } from '@/modules/persistence/repositories/order.repository.js';
import { errorHandler, notFoundHandler } from '@/shared/errors/error.handler.js';

vi.mock('@/modules/persistence/repositories/order.repository.js');

describe('Consumer API', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    app = Fastify({ logger: false });
    await app.register(import('@fastify/cors'));
    registerConsumerAuth(app);
    await registerConsumerRoutes(app);
    app.setErrorHandler(errorHandler);
    app.setNotFoundHandler(notFoundHandler);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const validApiKey = 'test-key-1';

  const mockOrder = {
    id: 'ord_123',
    brendiOrderId: 'ord_123',
    consumerOrderId: null,
    status: 'pending',
    cliente: { nome: 'João', telefone: '(11) 99999-8888', email: 'joao@email.com', documento: '12345678900' },
    itens: [{ produto_id: 'prod_1', nome: 'Pizza', quantidade: 1, preco_unitario: 3500, preco_total: 3500, observacoes: null, opcoes: [] }],
    totais: { subtotal: 3500, taxa_entrega: 500, desconto: 0, total: 4000 },
    entrega: { tipo: 'entrega', endereco: { logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'SP', estado: 'SP', cep: '01234-567' }, agendado_para: null, observacoes: null },
    pagamento: { forma: 'credito', status: 'aprovado', transacao_id: 'txn_1', parcelas: 1 },
    criado_em: '2024-01-15T10:30:00Z',
    metadata: { brendiStatus: 'confirmed' },
  };

  describe('GET /api/v1/orders/pending', () => {
    it('should return 401 without API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/pending',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid API key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/pending',
        headers: { 'x-api-key': 'invalid-key' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return pending orders with valid API key', async () => {
      (orderRepository.findPending as any).mockResolvedValue([mockOrder]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/pending',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.pedidos).toHaveLength(1);
      expect(body.pedidos[0].id).toBe('ord_123');
    });

    it('should support pagination', async () => {
      (orderRepository.findPending as any).mockResolvedValue([mockOrder, mockOrder, mockOrder]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/pending?limit=2&offset=1',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.pedidos).toHaveLength(2);
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should return 404 for non-existent order', async () => {
      (orderRepository.findById as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/non_existent',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return order details', async () => {
      (orderRepository.findById as any).mockResolvedValue(mockOrder);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/ord_123',
        headers: { 'x-api-key': validApiKey },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.pedido.id).toBe('ord_123');
    });
  });

  describe('POST /api/v1/orders/:id/ack', () => {
    it('should return 404 for non-existent order', async () => {
      (orderRepository.findById as any).mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/orders/non_existent/ack',
        headers: { 'x-api-key': validApiKey },
        payload: { consumer_order_id: 'CONS-123' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 409 if order not pending', async () => {
      (orderRepository.findById as any).mockResolvedValue({ ...mockOrder, status: 'delivered' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/orders/ord_123/ack',
        headers: { 'x-api-key': validApiKey },
        payload: { consumer_order_id: 'CONS-123' },
      });

      expect(response.statusCode).toBe(409);
    });

    it('should acknowledge order successfully', async () => {
      (orderRepository.findById as any).mockResolvedValue(mockOrder);
      (orderRepository.markDelivered as any).mockResolvedValue({ ...mockOrder, status: 'delivered', consumerOrderId: 'CONS-123', ack_em: new Date() });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/orders/ord_123/ack',
        headers: { 'x-api-key': validApiKey },
        payload: { consumer_order_id: 'CONS-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.acked_at).toBeDefined();
    });
  });

  describe('GET /api/v1/health', () => {
    it('should not require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('ok');
    });
  });
});