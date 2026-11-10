import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderTransformer } from '@/modules/transform/order.transformer.js';
import { BrendiOrder } from '@/modules/brendi/brendi.types.js';

const createMockBrendiOrder = (overrides: Partial<BrendiOrder> = {}): BrendiOrder => ({
  id: 'ord_test123',
  status: 'confirmed',
  customer: {
    id: 'cust_123',
    name: 'João Silva',
    email: 'joao@email.com',
    phone: '11999998888',
    document: '123.456.789-00',
    created_at: '2024-01-15T10:00:00Z',
  },
  items: [
    {
      id: 'item_1',
      product_id: 'prod_pizza1',
      name: 'Pizza Margherita',
      quantity: 2,
      unit_price: 3500,
      total_price: 7000,
      observations: 'Sem cebola',
      options: [
        { id: 'opt_1', name: 'Borda', value: 'Recheada', price: 500 },
      ],
    },
  ],
  totals: {
    subtotal: 7000,
    delivery_fee: 500,
    discount: 0,
    total: 7500,
  },
  delivery: {
    type: 'delivery',
    address: {
      street: 'Rua das Flores',
      number: '123',
      complement: 'Apto 45',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zip_code: '01234567',
    },
    scheduled_for: '2024-01-15T19:30:00Z',
    instructions: 'Interfone 45',
  },
  payment: {
    method: 'credit_card',
    status: 'approved',
    transaction_id: 'txn_abc123',
    installments: 1,
    card_brand: 'visa',
    card_last4: '1234',
  },
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-15T10:35:00Z',
  confirmed_at: '2024-01-15T10:32:00Z',
  metadata: { source: 'web' },
  ...overrides,
});

describe('OrderTransformer', () => {
  it('should transform a complete Brendi order to Consumer format', () => {
    const brendiOrder = createMockBrendiOrder();
    const result = orderTransformer.transform(brendiOrder);

    expect(result.id).toBe('ord_test123');
    expect(result.brendiOrderId).toBe('ord_test123');
    expect(result.status).toBe('pending');
    expect(result.cliente.nome).toBe('João Silva');
    expect(result.cliente.telefone).toBe('(11) 99999-8888');
    expect(result.cliente.email).toBe('joao@email.com');
    expect(result.cliente.documento).toBe('12345678900');
    expect(result.itens).toHaveLength(1);
    expect(result.itens[0].produto_id).toBe('prod_pizza1');
    expect(result.itens[0].quantidade).toBe(2);
    expect(result.itens[0].preco_unitario).toBe(3500);
    expect(result.totais.subtotal).toBe(7000);
    expect(result.totais.taxa_entrega).toBe(500);
    expect(result.totais.total).toBe(7500);
    expect(result.entrega.tipo).toBe('entrega');
    expect(result.entrega.endereco?.logradouro).toBe('Rua das Flores');
    expect(result.entrega.endereco?.cep).toBe('01234-567');
    expect(result.pagamento.forma).toBe('credito');
    expect(result.pagamento.status).toBe('aprovado');
    expect(result.criado_em).toBe('2024-01-15T10:30:00Z');
  });

  it('should map status correctly', () => {
    const statusMap: Record<string, string> = {
      pending: 'pending',
      confirmed: 'pending',
      preparing: 'pending',
      ready: 'pending',
      delivered: 'delivered',
      cancelled: 'cancelled',
    };

    for (const [brendiStatus, expectedStatus] of Object.entries(statusMap)) {
      const order = createMockBrendiOrder({ status: brendiStatus as BrendiOrder['status'] });
      const result = orderTransformer.transform(order);
      expect(result.status).toBe(expectedStatus);
    }
  });

  it('should handle pickup delivery type', () => {
    const order = createMockBrendiOrder({
      delivery: {
        type: 'pickup',
        instructions: 'Retirar no balcão',
      },
    });

    const result = orderTransformer.transform(order);

    expect(result.entrega.tipo).toBe('retirada');
    expect(result.entrega.endereco).toBeUndefined();
    expect(result.entrega.observacoes).toBe('Retirar no balcão');
  });

  it('should format phone numbers correctly', () => {
    const testCases = [
      { input: '11999998888', expected: '(11) 99999-8888' },
      { input: '1199998888', expected: '(11) 9999-8888' },
      { input: '(11) 99999-8888', expected: '(11) 99999-8888' },
      { input: '11 99999 8888', expected: '(11) 99999-8888' },
    ];

    for (const { input, expected } of testCases) {
      const order = createMockBrendiOrder({ customer: { ...createMockBrendiOrder().customer, phone: input } });
      const result = orderTransformer.transform(order);
      expect(result.cliente.telefone).toBe(expected);
    }
  });

  it('should format CEP correctly', () => {
    const order = createMockBrendiOrder({
      delivery: {
        ...createMockBrendiOrder().delivery,
        address: { ...createMockBrendiOrder().delivery.address!, zip_code: '01234567' },
      },
    });

    const result = orderTransformer.transform(order);
    expect(result.entrega.endereco?.cep).toBe('01234-567');
  });

  it('should clean document numbers', () => {
    const order = createMockBrendiOrder({
      customer: { ...createMockBrendiOrder().customer, document: '12.345.678/0001-90' },
    });

    const result = orderTransformer.transform(order);
    expect(result.cliente.documento).toBe('12345678000190');
  });

  it('should map payment methods correctly', () => {
    const methodMap: Record<string, string> = {
      credit_card: 'credito',
      debit_card: 'debito',
      pix: 'pix',
      cash: 'dinheiro',
      online: 'online',
    };

    for (const [brendiMethod, expectedMethod] of Object.entries(methodMap)) {
      const order = createMockBrendiOrder({
        payment: { ...createMockBrendiOrder().payment, method: brendiMethod as BrendiOrder['payment']['method'] },
      });
      const result = orderTransformer.transform(order);
      expect(result.pagamento.forma).toBe(expectedMethod);
    }
  });

  it('should map payment statuses correctly', () => {
    const statusMap: Record<string, string> = {
      pending: 'pendente',
      approved: 'aprovado',
      refused: 'recusado',
      refunded: 'estornado',
    };

    for (const [brendiStatus, expectedStatus] of Object.entries(statusMap)) {
      const order = createMockBrendiOrder({
        payment: { ...createMockBrendiOrder().payment, status: brendiStatus as BrendiOrder['payment']['status'] },
      });
      const result = orderTransformer.transform(order);
      expect(result.pagamento.status).toBe(expectedStatus);
    }
  });

  it('should include metadata with original Brendi info', () => {
    const order = createMockBrendiOrder({
      metadata: { custom_field: 'value', utm_source: 'google' },
    });

    const result = orderTransformer.transform(order);

    expect(result.metadata.brendiStatus).toBe('confirmed');
    expect(result.metadata.custom_field).toBe('value');
    expect(result.metadata.utm_source).toBe('google');
  });
});