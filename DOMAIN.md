# Modelo de Domínio - Integração Brendi ↔ Consumer

## 1. Linguagem Ubíqua

| Termo | Definição |
|-------|-----------|
| **Evento Brendi** | Notificação de mudança de estado (novo pedido, cancelamento, etc.) vinda da API `/events:polling` |
| **Pedido Bruto** | Resposta completa da API `GET /v1/orders/:id` do Brendi |
| **Pedido Transformado** | Pedido no formato esperado pelo Consumer, pronto para entrega |
| **Evento Processado** | Registro de idempotência (event_id + timestamp) |
| **ACK Consumer** | Confirmação de que o Consumer recebeu e processou o pedido |
| **Polling Cycle** | Uma execução completa: buscar eventos → buscar detalhes → transformar → armazenar |

---

## 2. Agregados e Entidades

### Agregado: `PollingSession`
```
PollingSession
├── id: UUID
├── startedAt: DateTime
├── completedAt: DateTime?
├── status: 'running' | 'completed' | 'failed'
├── eventsFetched: number
├── eventsProcessed: number
├── eventsFailed: number
└── errorMessage: string?
```

### Entidade: `BrendiEvent` (Value Object para idempotência)
```
BrendiEvent
├── eventId: string (PK - vem do Brendi)
├── eventType: 'order.created' | 'order.updated' | 'order.cancelled'
├── orderId: string
├── receivedAt: DateTime
├── processedAt: DateTime?
├── status: 'pending' | 'processing' | 'completed' | 'failed'
└── errorMessage: string?
```

### Agregado: `Order` (Pedido Transformado - pronto para Consumer)
```
Order
├── id: string (PK - orderId do Brendi)
├── brendiOrderId: string
├── consumerOrderId: string? (gerado pelo Consumer no ACK)
├── status: 'pending' | 'delivered' | 'failed' | 'cancelled'
├── customer: CustomerData
├── items: OrderItem[]
├── totals: OrderTotals
├── delivery: DeliveryData
├── payment: PaymentData
├── metadata: Record<string, any> (dados extras Brendi)
├── createdAt: DateTime (do Brendi)
├── updatedAt: DateTime
├── deliveredAt: DateTime?
└── ackAt: DateTime?
```

### Value Objects

```
CustomerData
├── name: string
├── phone: string
├── email: string?
├── document: string? (CPF/CNPJ)

OrderItem
├── productId: string
├── name: string
├── quantity: number
├── unitPrice: number (centavos)
├── totalPrice: number (centavos)
├── observations: string?
└── options: OrderItemOption[]

OrderItemOption
├── name: string
├── value: string
├── price: number (centavos)

OrderTotals
├── subtotal: number (centavos)
├── deliveryFee: number (centavos)
├── discount: number (centavos)
├── total: number (centavos)

DeliveryData
├── type: 'delivery' | 'pickup'
├── address: Address?
├── scheduledFor: DateTime?
├── instructions: string?

Address
├── street: string
├── number: string
├── complement: string?
├── neighborhood: string
├── city: string
├── state: string
├── zipCode: string

PaymentData
├── method: 'credit_card' | 'debit_card' | 'pix' | 'cash' | 'online'
├── status: 'pending' | 'approved' | 'refused' | 'refunded'
├── transactionId: string?
├── installments: number
```

---

## 3. Eventos de Domínio

```
OrderReceivedFromBrendi
├── orderId: string
├── brendiEventId: string
├── rawPayload: object
├── timestamp: DateTime

OrderTransformed
├── orderId: string
├── transformedOrder: Order
├── timestamp: DateTime

OrderDeliveredToConsumer
├── orderId: string
├── consumerOrderId: string
├── timestamp: DateTime

PollingCompleted
├── sessionId: UUID
├── eventsProcessed: number
├── eventsFailed: number
├── timestamp: DateTime

PollingFailed
├── sessionId: UUID
├── error: string
├── timestamp: DateTime
```

---

## 4. Bounded Contexts

```
┌─────────────────────────────────────────────────────────────┐
│                    INTEGRATION CONTEXT                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Brendi       │  │ Transform    │  │ Consumer         │  │
│  │ Adapter      │──▶│ Service      │──▶│ Adapter          │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                   │                    │           │
│         ▼                   ▼                    ▼           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Persistence (PostgreSQL)                 │   │
│  │  - processed_events  - orders  - polling_sessions     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Regras de Negócio

1. **Idempotência**: Mesmo `eventId` nunca processa duas vezes
2. **Ordem**: Eventos processados sequencialmente por `receivedAt`
3. **Filtro**: Apenas eventos `order.created` e `order.updated` (status confirmado) geram pedidos
4. **Cancelamento**: Evento `order.cancelled` marca pedido como `cancelled` se ainda `pending`
5. **TTL**: Pedidos `delivered` ou `cancelled` > 30 dias são arquivados (soft delete)
6. **Retry**: Falha na transformação → retry 3x com backoff → dead letter queue
7. **Rate Limit**: Máx 10 req/s no Brendi, 100 req/s no Consumer

---

## 6. Contratos de API (OpenAPI 3.0)

### Brendi Adapter (Entrada)
```yaml
# GET /v1/events:polling?since=2024-01-01T00:00:00Z
# Response:
events:
  - event_id: "evt_abc123"
    event_type: "order.created"
    resource_id: "ord_xyz789"
    created_at: "2024-01-15T10:30:00Z"

# GET /v1/orders/ord_xyz789
# Response: (ver BrendiOrder schema abaixo)
```

### Consumer Adapter (Saída)
```yaml
# GET /api/v1/orders/pending
# Headers: X-API-Key: <key>
# Response:
orders:
  - id: "ord_xyz789"
    customer: {...}
    items: [...]
    totals: {...}
    delivery: {...}
    payment: {...}
    created_at: "2024-01-15T10:30:00Z"

# GET /api/v1/orders/ord_xyz789
# Response: Order completo

# POST /api/v1/orders/ord_xyz789/ack
# Body: { "consumer_order_id": "CONS-456" }
# Response: { "success": true, "acked_at": "2024-01-15T10:35:00Z" }
```