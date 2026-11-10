# Arquitetura da Solução - Brendi → Consumer Middleware

## 1. Visão Geral da Arquitetura

```
┌─────────────┐     Polling (5min)      ┌──────────────────┐
│   Brendi    │ ──────────────────────▶ │  Middleware API  │
│  (Origem)   │   OAuth 2.0 + REST      │  (Node.js/TS)    │
└─────────────┘                         │                  │
                                        │  ┌────────────┐  │
                                        │  │ Brendi     │  │
                                        │  │ Adapter    │  │
                                        │  └─────┬──────┘  │
                                        │        │         │
                                        │  ┌─────▼──────┐  │
                                        │  │ Transform  │  │
                                        │  │ Service    │  │
                                        │  └─────┬──────┘  │
                                        │        │         │
                    ┌───────────────────┐ │  ┌─────▼──────┐  │
                    │   PostgreSQL      │ │  │ Consumer   │  │
                    │   (Railway)       │ │  │ Adapter    │  │
                    │                   │ │  └─────┬──────┘  │
                    │  • processed_     │ │        │         │
                    │    events         │ │  ┌─────▼──────┐  │
                    │  • orders         │ │  │   Auth     │  │
                    │  • polling_       │ │  │  (API Key) │  │
                    │    sessions       │ │  └────────────┘  │
                    └───────────────────┘ └──────────────────┘
                                              │
                                    Polling (Consumer) │
                                              ▼
                                    ┌──────────────────┐
                                    │     Consumer     │
                                    │   (Destino)      │
                                    └──────────────────┘
```

---

## 2. Stack Tecnológica

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| **Runtime** | Node.js 20 LTS + TypeScript | Ecossistema maduro, tipagem, deploy simples |
| **Framework** | Fastify | Performance, schema validation nativo, plugins |
| **Database** | PostgreSQL 16 (Railway managed) | Relacional, ACID, JSONB para flexibilidade, free tier |
| **ORM** | Prisma | Type-safe, migrations, DX excelente |
| **Scheduler** | node-cron | Simples, confiável para polling |
| **HTTP Client** | axios + interceptors | Retry, auth, logging automáticos |
| **Validation** | Zod | Schema validation runtime + TypeScript types |
| **Config** | dotenv + zod-config | Validação de env no startup |
| **Logs** | pino | JSON structured, fast, pretty dev |
| **Tests** | Vitest + Supertest | Fast, ESM native, integração fácil |
| **CI/CD** | GitHub Actions → Railway | Automático, preview deploys |
| **Observabilidade** | pino + health checks | Suficiente para MVP |

---

## 3. Estrutura do Projeto

```
brendi-consumer-integration/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD pipeline
├── prisma/
│   ├── schema.prisma           # Schema do banco
│   └── migrations/             # Migrações
├── src/
│   ├── config/
│   │   ├── env.ts              # Validação de variáveis de ambiente
│   │   └── constants.ts        # Constantes da aplicação
│   ├── modules/
│   │   ├── brendi/
│   │   │   ├── brendi.adapter.ts      # Cliente HTTP Brendi
│   │   │   ├── brendi.types.ts        # Tipos/Zod schemas Brendi
│   │   │   ├── polling.service.ts     # Lógica de polling
│   │   │   └── oauth.service.ts       # Gestão de token OAuth
│   │   ├── consumer/
│   │   │   ├── consumer.adapter.ts    # Endpoints para Consumer
│   │   │   ├── consumer.types.ts      # Tipos/Zod schemas Consumer
│   │   │   └── auth.middleware.ts     # API Key validation
│   │   ├── transform/
│   │   │   ├── order.transformer.ts   # Brendi → Consumer
│   │   │   └── mappers/               # Mappers por campo
│   │   ├── persistence/
│   │   │   ├── prisma.client.ts       # Prisma singleton
│   │   │   ├── repositories/
│   │   │   │   ├── event.repository.ts
│   │   │   │   ├── order.repository.ts
│   │   │   │   └── session.repository.ts
│   │   │   └── unit-of-work.ts        # Transações
│   │   └── scheduling/
│   │       └── polling.scheduler.ts   # Cron job orchestrator
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── app.error.ts
│   │   │   └── error.handler.ts
│   │   ├── logger/
│   │   │   └── logger.ts
│   │   └── utils/
│   │       ├── retry.ts
│   │       └── date.ts
│   ├── app.ts                    # Fastify app setup
│   └── server.ts                 # Entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│       ├── brendi-events.json
│       ├── brendi-order.json
│       └── consumer-order.json
├── docker-compose.yml            # Dev local com Postgres
├── Dockerfile                    # Multi-stage build
├── railway.toml                  # Config Railway
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 4. Fluxo de Dados Detalhado

### 4.1 Polling Brendi (a cada 5 min)

```
1. Scheduler acorda → cria PollingSession (status: running)
2. OAuthService.getValidToken() → renova se expirado
3. BrendiAdapter.pollEvents(since=lastProcessedEventAt)
4. Para cada evento:
   a. EventRepository.isProcessed(eventId)?
      - Sim: pula (idempotência)
      - Não: marca 'processing'
   b. BrendiAdapter.getOrder(orderId)
   c. OrderTransformer.transform(brendiOrder)
   d. OrderRepository.upsert(transformedOrder)
   e. EventRepository.markCompleted(eventId)
5. Atualiza PollingSession (completed/failed)
6. Log métricas: eventos processados, falhas, duração
```

### 4.2 Consumer Consulta Pedidos

```
1. Consumer → GET /api/v1/orders/pending + X-API-Key
2. AuthMiddleware.validateApiKey(key)
3. OrderRepository.findPending()
4. Retorna array OrderConsumerFormat[]
```

### 4.3 Consumer Confirma Recebimento (ACK)

```
1. Consumer → POST /api/v1/orders/:id/ack + X-API-Key
2. AuthMiddleware.validateApiKey(key)
3. OrderRepository.findById(id)
4. Se status === 'pending':
   - order.status = 'delivered'
   - order.consumerOrderId = body.consumer_order_id
   - order.ackAt = now()
   - order.deliveredAt = now()
   - salva
5. Retorna 200 { success: true, ackedAt }
```

---

## 5. Segurança (OWASP Top 10:2025)

| Ameaça | Mitigação |
|--------|-----------|
| **A01 Broken Access Control** | API Key validation em middleware, deny by default, rate limiting por key |
| **A02 Security Misconfiguration** | Helmet, CORS restrito, env validation no startup, non-root Docker |
| **A03 Supply Chain** | `npm audit` no CI, lockfile commitado, dependabot, versões fixas |
| **A04 Cryptographic Failures** | TLS obrigatório (Railway), tokens OAuth em memória, API Keys hash no log |
| **A05 Injection** | Prisma (parametrizado), Zod validation em todas entradas |
| **A06 Insecure Design** | Threat modeling no DOMAIN.md, idempotência, fail-closed |
| **A07 Auth Failures** | OAuth 2.0 Client Credentials (Brendi), API Key rotacionável (Consumer) |
| **A08 Integrity Failures** | Verificação de assinatura webhook (futuro), checksums |
| **A09 Logging Failures** | Pino structured logs, correlation IDs, audit trail de eventos |
| **A10 Exception Handling** | Global error handler, nunca vaza stack trace, retry com circuit breaker |

---

## 6. Variáveis de Ambiente

```env
# App
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Brendi OAuth
BRENDI_CLIENT_ID=
BRENDI_CLIENT_SECRET=
BRENDI_BASE_URL=https://api.brendi.com.br
BRENDI_TOKEN_URL=https://api.brendi.com.br/oauth/token
BRENDI_POLLING_INTERVAL_MS=300000  # 5 min

# Consumer
CONSUMER_API_KEYS=key1,key2,key3  # CSV de keys válidas (hash no futuro)
CONSUMER_RATE_LIMIT_MAX=100       # req/min por key

# Database (Railway fornece DATABASE_URL)
DATABASE_URL=postgresql://...

# Scheduler
POLLING_ENABLED=true
POLLING_INITIAL_DELAY_MS=10000    # 10s após start
```

---

## 7. CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_PASSWORD: test }
        ports: [5432:5432]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npm run build
      - uses: docker/build-push-action@v5
        with: { push: false, tags: app:test }

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: railway/deploy-action@v1
        with: { token: ${{ secrets.RAILWAY_TOKEN }} }
```

---

## 8. Estimativa de Esforço (1-2 semanas)

| Fase | Atividade | Estimativa |
|------|-----------|------------|
| **Setup** | Repo, CI, Docker, Prisma, Railway | 0.5 dia |
| **Config** | Env validation, logger, errors, constants | 0.5 dia |
| **Brendi Adapter** | OAuth, polling, getOrder, types, tests | 1.5 dias |
| **Transform** | Mappers, validação, testes de contrato | 1 dia |
| **Persistence** | Repositories, UoW, migrações, seed | 1 dia |
| **Consumer API** | Endpoints, auth, rate limit, OpenAPI | 1.5 dias |
| **Scheduler** | Cron, session mgmt, retry, métricas | 0.5 dia |
| **Integração** | E2E tests, docker-compose, docs | 1 dia |
| **Deploy** | Railway, secrets, health checks, smoke | 0.5 dia |
| **Buffer** | Imprevistos, ajustes, code review | 1-2 dias |
| **Total** | | **8-10 dias úteis** |

---

## 9. Próximos Passos

1. ✅ Especificação (SPEC.md)
2. ✅ Modelo de Domínio (DOMAIN.md)
3. ✅ Arquitetura (este doc)
4. **Próximo**: Implementação via TDD (Fase 4)
   - Configurar projeto (package.json, tsconfig, eslint, prettier)
   - Testes de contrato (schemas Zod)
   - Brendi Adapter (OAuth + polling) com mocks
   - Transformers com testes unitários
   - Persistence + Repositories
   - Consumer API endpoints
   - Scheduler + integração completa
5. Revisão de segurança (Fase 5)
6. Evidências e deploy (Fase 6-7)