# Brendi → Consumer Integration Middleware

Middleware para sincronização automática de pedidos do **Brendi** (plataforma de vendas online) para o **Consumer** (sistema de gestão interno).

## 📋 Visão Geral

```
Brendi (Origem)          Middleware                    Consumer (Destino)
     │                      │                              │
     │  Polling 5min       │                              │
     ├────────────────────▶│                              │
     │  OAuth 2.0          │                              │
     │                      │  Transformação              │
     │                      │  Brendi → Consumer          │
     │                      │                              │
     │                      │  Armazenamento              │
     │                      │  PostgreSQL                 │
     │                      │                              │
     │                      │◀─────────────────────────────┤
     │                      │  Polling Consumer           │
     │                      │  API Key                    │
     │                      │                              │
     │                      │  ACK Recebimento            │
     │                      │────────────────────────────▶│
```

## ✨ Funcionalidades

- **Polling Automático**: Consulta a API do Brendi a cada 5 minutos (configurável)
- **Idempotência**: Garante que nenhum pedido seja processado duplicadamente (rastreamento por `event_id`)
- **Transformação de Dados**: Mapeia campos do formato Brendi para o formato Consumer (português)
- **API para Consumer**: Endpoints REST para listar/consultar/confirmar pedidos
- **Autenticação Dupla**: OAuth 2.0 Client Credentials (Brendi) + API Key (Consumer)
- **Observabilidade**: Logs estruturados (JSON), health checks, métricas de polling
- **Resiliência**: Retry exponencial com jitter, circuit breaker implícito, dead letter queue (eventos failed)
- **Limpeza Automática**: TTL configurável para eventos/pedidos antigos, sessões travadas

## 🛠 Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Runtime | Node.js 20 LTS + TypeScript |
| Framework | Fastify |
| Database | PostgreSQL 16 (Prisma ORM) |
| Scheduler | node-cron |
| HTTP Client | Axios (com interceptors para OAuth) |
| Validation | Zod (runtime + TypeScript types) |
| Logs | Pino (structured JSON + pretty dev) |
| Testes | Vitest + Supertest |
| Deploy | Railway (Docker multi-stage) |
| CI/CD | GitHub Actions |

## 📦 Pré-requisitos

- Node.js 20+
- PostgreSQL 16+ (ou Docker)
- Credenciais OAuth 2.0 do Brendi (Client ID + Secret)
- API Keys do Consumer

---

## 🚀 Início Rápido

### 1. Clone e instale dependências

```bash
git clone <repo-url>
cd brendi-consumer-integration
npm install
```

### 2. Configure variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas credenciais
```

### 3. Suba o banco local (Docker)

```bash
docker-compose up -d
```

### 4. Execute migrações e gere client Prisma

```bash
npm run db:generate
npm run db:push
```

### 5. Inicie em desenvolvimento

```bash
npm run dev
```

O servidor estará disponível em `http://localhost:3000`

---

## 🔄 Fluxo Operacional Detalhado

### Inicialização (`npm start`)

```
1. Conecta no PostgreSQL (DATABASE_URL)
2. Inicia Fastify server na porta 3000
3. Inicia scheduler (node-cron) - aguarda 10s (POLLING_INITIAL_DELAY_MS)
4. Primeira execução de polling
5. Health checks disponíveis em /health e /health/detailed
```

### Ciclo de Polling (a cada 5 min - `BRENDI_POLLING_INTERVAL_MS`)

```
┌─────────────────────────────────────────────────────────────┐
│                    POLLING CYCLE                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Cria PollingSession (status: running)                   │
│ 2. OAuthService.getValidToken() → renova se expirado       │
│    (token em memória, renova 1min antes de expirar)        │
│ 3. BrendiAdapter.pollEvents(since=último processado)       │
│ 4. Para CADA evento retornado:                              │
│    a. eventRepository.isProcessed(event_id)? → sim: PULA   │
│    b. Marca event como 'processing'                        │
│    c. BrendiAdapter.getOrder(order_id)                     │
│    d. OrderTransformer.transform(brendiOrder)              │
│       - Mapeia: status, cliente, itens, totais, entrega,   │
│         pagamento, metadata                                 │
│    e. OrderRepository.upsert(transformedOrder)             │
│    f. Marca event como 'completed'                         │
│ 5. Atualiza PollingSession (completed/failed + métricas)   │
│ 6. Log estruturado com: eventsFetched, processed, failed  │
└─────────────────────────────────────────────────────────────┘
```

### Filtro de Status (quais pedidos sincronizar)

Apenas pedidos Brendi com status:
- `confirmed` → vira `pending` no Consumer
- `preparing` → vira `pending` no Consumer
- `ready` → vira `pending` no Consumer
- `delivered` → vira `delivered` (informativo)
- `cancelled` → marca como `cancelled` se ainda `pending`

### Consumer Consome Pedidos

```bash
# Lista pendentes (com paginação)
GET /api/v1/orders/pending?limit=50&offset=0
Headers: X-API-Key: sua-key

# Detalhes de um pedido
GET /api/v1/orders/ord_abc123
Headers: X-API-Key: sua-key

# Confirma recebimento (ACK) - remove da lista de pendentes
POST /api/v1/orders/ord_abc123/ack
Headers: X-API-Key: sua-key
Body: { "consumer_order_id": "CONS-456" }
```

### Limpeza Automática (diária às 03:00 via cron)

| Tabela | Critério | Ação |
|--------|----------|------|
| `processed_events` | status completed/failed > 30 dias | DELETE |
| `orders` | status delivered/cancelled > 90 dias | DELETE |
| `polling_sessions` | running > 30 min (travada) | marca failed |

---

## 🔧 Configuração

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `NODE_ENV` | Ambiente (development/production/test) | development |
| `PORT` | Porta do servidor | 3000 |
| `LOG_LEVEL` | Nível de log (fatal/error/warn/info/debug/trace/silent) | info |

**Brendi (OAuth 2.0):**
| Variável | Descrição |
|----------|-----------|
| `BRENDI_CLIENT_ID` | Client ID OAuth |
| `BRENDI_CLIENT_SECRET` | Client Secret OAuth |
| `BRENDI_BASE_URL` | Base URL da API Brendi | `https://api.brendi.com.br` |
| `BRENDI_TOKEN_URL` | URL do endpoint de token |
| `BRENDI_POLLING_INTERVAL_MS` | Intervalo de polling (ms) | 300000 (5min) |

**Consumer:**
| Variável | Descrição |
|----------|-----------|
| `CONSUMER_API_KEYS` | CSV de API Keys válidas (ex: `key1,key2,key3`) |
| `CONSUMER_RATE_LIMIT_MAX` | Max requests/min por key | 100 |

**Database:**
| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string PostgreSQL |

**Scheduler:**
| Variável | Descrição |
|----------|-----------|
| `POLLING_ENABLED` | Habilitar polling automático | true |
| `POLLING_INITIAL_DELAY_MS` | Delay inicial após start (ms) | 10000 |

---

## 📚 API Endpoints

### Health Checks (Público - sem auth)

```
GET  /health              # Health check básico (para load balancer)
GET  /health/detailed     # Health check com stats completas
```

**Resposta `/health`:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "service": "brendi-consumer-integration",
  "version": "1.0.0",
  "database": "connected"
}
```

**Resposta `/health/detailed`:**
```json
{
  "status": "healthy",
  "database": "connected",
  "stats": {
    "events": { "pending": 0, "processing": 0, "completed": 150, "failed": 2 },
    "orders": { "pending": 5, "delivered": 145, "failed": 1, "cancelled": 3 },
    "sessions": { "total": 288, "completed": 285, "failed": 3, "running": 0 }
  },
  "scheduler": { "polling": true, "cleanup": true }
}
```

### Consumer API (Requer `X-API-Key` header)

```
GET  /api/v1/orders/pending           # Lista pedidos pendentes
     Query: limit (max 200, default 50), offset (default 0)

GET  /api/v1/orders/:id               # Detalhes de um pedido

POST /api/v1/orders/:id/ack           # Confirma recebimento
     Body: { "consumer_order_id": "CONS-123" }
```

**Resposta `/api/v1/orders/pending`:**
```json
{
  "pedidos": [
    {
      "id": "ord_abc123",
      "cliente": {
        "nome": "João Silva",
        "telefone": "(11) 99999-8888",
        "email": "joao@email.com",
        "documento": "12345678900"
      },
      "itens": [
        {
          "produto_id": "prod_pizza1",
          "nome": "Pizza Margherita",
          "quantidade": 2,
          "preco_unitario": 3500,
          "preco_total": 7000,
          "observacoes": "Sem cebola",
          "opcoes": [{ "nome": "Borda", "valor": "Recheada", "preco": 500 }]
        }
      ],
      "totais": {
        "subtotal": 7000,
        "taxa_entrega": 500,
        "desconto": 0,
        "total": 7500
      },
      "entrega": {
        "tipo": "entrega",
        "endereco": {
          "logradouro": "Rua das Flores",
          "numero": "123",
          "complemento": "Apto 45",
          "bairro": "Centro",
          "cidade": "São Paulo",
          "estado": "SP",
          "cep": "01234-567"
        },
        "agendado_para": "2024-01-15T19:30:00.000Z",
        "observacoes": "Interfone 45"
      },
      "pagamento": {
        "forma": "credito",
        "status": "aprovado",
        "transacao_id": "txn_abc123",
        "parcelas": 1
      },
      "criado_em": "2024-01-15T10:30:00.000Z",
      "metadata": { "brendiStatus": "confirmed" }
    }
  ]
}
```

**Resposta `/api/v1/orders/:id/ack`:**
```json
{
  "success": true,
  "acked_at": "2024-01-15T10:35:00.000Z"
}
```

**Códigos de Erro:**
| Código | HTTP | Descrição |
|--------|------|-----------|
| `UNAUTHORIZED` | 401 | API Key ausente ou inválida |
| `NOT_FOUND` | 404 | Pedido não existe |
| `CONFLICT` | 409 | Pedido não está `pending` (já delivered/cancelled) |
| `TOO_MANY_REQUESTS` | 429 | Rate limit excedido |
| `INTERNAL_ERROR` | 500 | Erro interno |

---

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Com coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

**Cobertura atual:** 91% statements, 81% branches, 81% functions (módulos testados)

**Suites:**
- `tests/unit/order.transformer.test.ts` (9 testes) - Transformação completa
- `tests/integration/polling.service.test.ts` (5 testes) - Polling, idempotência, falhas
- `tests/integration/consumer.api.test.ts` (10 testes) - Auth, CRUD, ACK

---

## 🐳 Docker

### Desenvolvimento
```bash
docker-compose up -d
# Inclui PostgreSQL + App com hot reload
```

### Produção
```bash
docker build -t brendi-consumer-integration .
docker run -p 3000:3000 --env-file .env brendi-consumer-integration
```

**Multi-stage build:** builder (compile + prisma generate) → runner (non-root user, healthcheck)

---

## ☁️ Deploy no Railway

### Passo a Passo

1. **Conecte o repositório** no Railway (GitHub)
2. **Adicione serviço PostgreSQL** (Database → Add PostgreSQL)
3. **Configure variáveis de ambiente** no Railway Dashboard:
   - `BRENDI_CLIENT_ID`, `BRENDI_CLIENT_SECRET`, `BRENDI_TOKEN_URL`
   - `CONSUMER_API_KEYS`, `CONSUMER_RATE_LIMIT_MAX`
   - `POLLING_ENABLED=true`, `BRENDI_POLLING_INTERVAL_MS=300000`
   - `LOG_LEVEL=info`
   - `DATABASE_URL` é **injetado automaticamente** pelo Railway PostgreSQL
4. **Deploy automático** no push para `main`
5. **SSL/HTTPS** automático

### railway.toml (já configurado)
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

---

## 📊 Monitoramento

### Logs Estruturados (JSON)

```json
{
  "level": 30,
  "time": "2024-01-15T10:30:00.123Z",
  "service": "brendi-consumer-integration",
  "requestId": "abc-123",
  "sessionId": "session_1",
  "eventsFetched": 5,
  "eventsProcessed": 5,
  "eventsFailed": 0,
  "durationMs": 1250,
  "msg": "Polling session completed"
}
```

**Níveis:** `fatal` (60), `error` (50), `warn` (30), `info` (20), `debug` (10), `trace` (10)

### Métricas Importantes

| Métrica | Descrição | Alerta Sugerido |
|---------|-----------|-----------------|
| `polling.session.duration` | Duração do ciclo (ms) | > 30s |
| `polling.events.fetched` | Eventos buscados do Brendi | - |
| `polling.events.processed` | Processados com sucesso | - |
| `polling.events.failed` | Falhas no processamento | > 0 |
| `orders.pending` | Aguardando Consumer | Crescendo consistentemente |
| `orders.delivered` | Confirmados pelo Consumer | - |
| `health.database` | Status conexão DB | ≠ connected |

### Health Checks para Load Balancer

```bash
# Kubernetes/Docker/Railway
livenessProbe:  /health
readinessProbe: /health
```

---

## 🔒 Segurança

| Camada | Implementação |
|--------|---------------|
| **Brendi Auth** | OAuth 2.0 Client Credentials (token em memória, auto-renovação 1min antes expirar) |
| **Consumer Auth** | API Key via header `X-API-Key` + validação em middleware |
| **Rate Limiting** | 100 req/min por IP (global) + 100 req/min por API Key (Consumer) |
| **Headers** | Helmet.js (CSP, HSTS, X-Content-Type-Options, X-Frame-Options) |
| **CORS** | Configurável (origins específicas em produção) |
| **Validação** | Zod em todas entradas (body, query, params, headers) |
| **Banco** | Prisma (previne SQL injection via prepared statements) |
| **Container** | Non-root user (UID 1001), read-only filesystem onde possível |
| **Transporte** | TLS 1.2+ obrigatório (Railway fornece certificado) |
| **Secrets** | Apenas via env vars (nunca no código), `.env.example` sem valores reais |

---

## 📁 Estrutura do Projeto

```
src/
├── config/
│   ├── env.ts              # Validação Zod de env vars + cache
│   └── constants.ts        # Constantes centralizadas (lazy proxy)
├── modules/
│   ├── brendi/
│   │   ├── brendi.adapter.ts      # Cliente HTTP Axios + interceptors OAuth
│   │   ├── brendi.types.ts        # Schemas Zod Brendi (eventos, pedidos, token)
│   │   ├── oauth.service.ts       # Gestão token (cache + renovação)
│   │   └── polling.service.ts     # Orquestração polling + idempotência
│   ├── consumer/
│   │   ├── consumer.adapter.ts    # Endpoints REST Fastify
│   │   ├── consumer.types.ts      # Schemas Zod Consumer (português)
│   │   └── auth.middleware.ts     # Validação API Key + rate limit
│   ├── transform/
│   │   └── order.transformer.ts   # Brendi → Consumer (mapeamento campos)
│   ├── persistence/
│   │   ├── prisma.client.ts       # Singleton Prisma + health check
│   │   ├── repositories/          # Data access (Event, Order, Session)
│   │   └── unit-of-work.ts        # Transações atômicas
│   └── scheduling/
│       └── polling.scheduler.ts   # Cron jobs (polling + cleanup)
├── shared/
│   ├── errors/
│   │   ├── app.error.ts           # AppError classes (operational vs bug)
│   │   └── error.handler.ts       # Handler global Fastify
│   ├── logger/
│   │   └── logger.ts              # Pino logger (lazy init)
│   └── utils/
│       ├── retry.ts               # Retry exponencial + jitter
│       └── date.ts                # Utilitários data/ISO
├── app.ts                        # Fastify setup (plugins, routes, hooks)
└── server.ts                     # Entry point (graceful shutdown)
```

---

## 🛠 Desenvolvimento

### Comandos Úteis

```bash
# Lint
npm run lint

# Format
npm run format

# Database
npm run db:studio        # Prisma Studio (UI)
npm run db:migrate       # Criar migração nomeada
npm run db:push          # Push schema direto (dev)

# Build
npm run build
npm start                # Produção (requer build)

# Testes
npm test                 # Roda tudo
npm run test:coverage    # Com coverage
npm run test:watch       # Watch mode
```

### Adicionando Novos Campos na Transformação

1. Atualize schemas em `src/modules/brendi/brendi.types.ts` e `src/modules/consumer/consumer.types.ts`
2. Adicione mapeamento em `src/modules/transform/order.transformer.ts`
3. Adicione testes em `tests/unit/order.transformer.test.ts`
4. Execute `npm test`

---

## 📝 Troubleshooting

| Sintoma | Causa Provável | Ação |
|---------|----------------|------|
| Polling não roda | `POLLING_ENABLED=false` | Verificar env var |
| Pedidos não aparecem no Consumer | Status Brendi ≠ confirmed/preparing/ready | Verificar `shouldSyncOrder()` |
| 401 no Consumer | API Key inválida/ausente | Verificar `CONSUMER_API_KEYS` |
| Erro OAuth | Credenciais erradas/token endpoint | Verificar `BRENDI_CLIENT_ID/SECRET/TOKEN_URL` |
| Banco desconectado | `DATABASE_URL` errada | Railway: verificar service PostgreSQL |
| Rate limit Consumer | Muitas requisições | Aumentar `CONSUMER_RATE_LIMIT_MAX` |
| `eventsFailed` > 0 | Erro na API Brendi ou transformação | Verificar logs da sessão failed |
| Pedidos `pending` crescendo | Consumer não está consumindo/ACK | Verificar se Consumer faz polling + ACK |

### Debug Rápido

```bash
# Ver logs de polling
grep "Polling session" logs/

# Ver saúde do banco
curl https://app.railway.app/health/detailed

# Ver stats de pedidos
curl -H "X-API-Key: key" https://app.railway.app/api/v1/orders/pending

# Testar ACK manual
curl -X POST -H "X-API-Key: key" -d '{"consumer_order_id":"TEST-123"}' \
  https://app.railway.app/api/v1/orders/ord_xxx/ack
```

---

## ✅ Checklist de Go-Live

- [ ] `.env` configurado com credenciais **produção**
- [ ] `CONSUMER_API_KEYS` compartilhadas com time do Consumer
- [ ] Railway PostgreSQL provisionado e `DATABASE_URL` injetado
- [ ] Deploy passou no CI/CD (GitHub Actions verde ✅)
- [ ] Health check `/health` retorna `healthy`
- [ ] Primeiro polling executado (logs mostram `eventsFetched` > 0)
- [ ] Consumer consegue consultar `/orders/pending` (200 OK)
- [ ] Consumer consegue fazer ACK `/orders/:id/ack` (200 OK)
- [ ] Logs estruturados aparecendo no Railway/observabilidade
- [ ] Alertas configurados (falhas de polling, banco down, orders.pending crescendo)
- [ ] Documentação da API Consumer compartilhada com time de integração

---

## 🔄 Atualizações Futuras Comuns

| Mudança | Onde Ajustar |
|---------|--------------|
| Novo campo no Brendi | `brendi.types.ts` + `order.transformer.ts` + testes |
| Novo campo no Consumer | `consumer.types.ts` + `order.transformer.ts` + testes |
| Intervalo de polling | `BRENDI_POLLING_INTERVAL_MS` (env var, sem deploy) |
| Nova API Key Consumer | Adicionar em `CONSUMER_API_KEYS` (CSV, sem deploy) |
| Webhook no lugar de polling | Nova rota + `BrendiAdapter` + desabilitar scheduler |
| Novo status de pedido | `shouldSyncOrder()` + `mapStatus()` + `consumer.types.ts` |

---

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

---

## 📞 Suporte

Para dúvidas ou problemas:
- Abra uma issue no GitHub
- Consulte logs em `/health/detailed`
- Verifique documentação das APIs Brendi e Consumer
- Documentação técnica: `SPEC.md`, `DOMAIN.md`, `ARCHITECTURE.md`