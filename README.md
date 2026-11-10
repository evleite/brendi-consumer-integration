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
- **Idempotência**: Garante que nenhum pedido seja processado duplicadamente
- **Transformação de Dados**: Mapeia campos do formato Brendi para o formato Consumer
- **API para Consumer**: Endpoints REST para listar/consultar/confirmar pedidos
- **Autenticação Dupla**: OAuth 2.0 (Brendi) + API Key (Consumer)
- **Observabilidade**: Logs estruturados, health checks, métricas de polling
- **Resiliência**: Retry exponencial, circuit breaker, dead letter queue

## 🛠 Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Runtime | Node.js 20 LTS + TypeScript |
| Framework | Fastify |
| Database | PostgreSQL 16 (Prisma ORM) |
| Scheduler | node-cron |
| HTTP Client | Axios |
| Validation | Zod |
| Logs | Pino |
| Testes | Vitest + Supertest |
| Deploy | Railway (Docker) |

## 📦 Pré-requisitos

- Node.js 20+
- PostgreSQL 16+ (ou Docker)
- Credenciais OAuth 2.0 do Brendi
- API Keys do Consumer

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

## 🔧 Configuração

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `NODE_ENV` | Ambiente (development/production/test) | development |
| `PORT` | Porta do servidor | 3000 |
| `LOG_LEVEL` | Nível de log | info |

**Brendi (OAuth 2.0):**
| Variável | Descrição |
|----------|-----------|
| `BRENDI_CLIENT_ID` | Client ID OAuth |
| `BRENDI_CLIENT_SECRET` | Client Secret OAuth |
| `BRENDI_BASE_URL` | Base URL da API Brendi |
| `BRENDI_TOKEN_URL` | URL do endpoint de token |
| `BRENDI_POLLING_INTERVAL_MS` | Intervalo de polling (ms) | 300000 (5min) |

**Consumer:**
| Variável | Descrição |
|----------|-----------|
| `CONSUMER_API_KEYS` | CSV de API Keys válidas |
| `CONSUMER_RATE_LIMIT_MAX` | Max requests/min por key | 100 |

**Database:**
| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string PostgreSQL |

**Scheduler:**
| Variável | Descrição |
|----------|-----------|
| `POLLING_ENABLED` | Habilitar polling automático | true |
| `POLLING_INITIAL_DELAY_MS` | Delay inicial após start | 10000 |

## 📚 API Endpoints

### Health Checks (Público)
```
GET  /health              # Health check básico
GET  /health/detailed     # Health check com stats
```

### Consumer API (Requer `X-API-Key`)

```
GET  /api/v1/orders/pending           # Lista pedidos pendentes
     Query: limit, offset

GET  /api/v1/orders/:id               # Detalhes de um pedido

POST /api/v1/orders/:id/ack           # Confirma recebimento
     Body: { "consumer_order_id": "CONS-123" }
```

### Formato de Resposta - Pedido Pendente

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

## 🧪 Testes

```bash
# Executar todos os testes
npm test

# Com coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🐳 Docker

### Desenvolvimento
```bash
docker-compose up -d
```

### Produção
```bash
docker build -t brendi-consumer-integration .
docker run -p 3000:3000 --env-file .env brendi-consumer-integration
```

## ☁️ Deploy no Railway

1. Conecte o repositório no Railway
2. Adicione um serviço PostgreSQL
3. Configure as variáveis de ambiente
4. O `railway.toml` já configura o build via Dockerfile
5. Deploy automático no push para `main`

### Variáveis no Railway

Todas as variáveis do `.env` + `DATABASE_URL` (fornecido automaticamente pelo Railway PostgreSQL)

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

### Métricas Importantes
- `polling.session.duration` - Duração do ciclo
- `polling.events.fetched` - Eventos buscados
- `polling.events.processed` - Eventos processados com sucesso
- `polling.events.failed` - Eventos com falha
- `orders.pending` - Pedidos aguardando Consumer
- `orders.delivered` - Pedidos confirmados pelo Consumer

## 🔒 Segurança

- **OAuth 2.0 Client Credentials** para Brendi (tokens em memória, renovação automática)
- **API Keys** para Consumer (validação em middleware, rate limiting)
- **Helmet.js** para headers de segurança
- **CORS** configurado
- **Rate limiting** por IP e por API Key
- **Validação Zod** em todas entradas
- **Prisma** previne SQL Injection
- **Non-root Docker user**
- **TLS** obrigatório em produção (Railway fornece)

## 📁 Estrutura do Projeto

```
src/
├── config/
│   ├── env.ts              # Validação de variáveis de ambiente
│   └── constants.ts        # Constantes centralizadas
├── modules/
│   ├── brendi/
│   │   ├── brendi.adapter.ts      # Cliente HTTP Brendi
│   │   ├── brendi.types.ts        # Schemas Zod Brendi
│   │   ├── oauth.service.ts       # Gestão token OAuth
│   │   └── polling.service.ts     # Orquestração do polling
│   ├── consumer/
│   │   ├── consumer.adapter.ts    # Endpoints REST Consumer
│   │   ├── consumer.types.ts      # Schemas Zod Consumer
│   │   └── auth.middleware.ts     # Validação API Key
│   ├── transform/
│   │   └── order.transformer.ts   # Brendi → Consumer
│   ├── persistence/
│   │   ├── prisma.client.ts       # Singleton Prisma
│   │   ├── repositories/          # Data access
│   │   └── unit-of-work.ts        # Transações
│   └── scheduling/
│       └── polling.scheduler.ts   # Cron jobs
├── shared/
│   ├── errors/
│   │   ├── app.error.ts           # Erros customizados
│   │   └── error.handler.ts       # Handler global
│   ├── logger/
│   │   └── logger.ts              # Pino logger
│   └── utils/
│       ├── retry.ts               # Retry com backoff
│       └── date.ts                # Utilitários de data
├── app.ts                        # Fastify setup
└── server.ts                     # Entry point
```

## 🛠 Desenvolvimento

### Comandos Úteis

```bash
# Lint
npm run lint

# Format
npm run format

# Database
npm run db:studio        # Prisma Studio
npm run db:migrate       # Criar migração
npm run db:push          # Push schema (dev)

# Build
npm run build
npm start                # Produção (requer build)
```

### Adicionando Novos Campos na Transformação

1. Atualize schemas em `src/modules/brendi/brendi.types.ts` e `src/modules/consumer/consumer.types.ts`
2. Adicione mapeamento em `src/modules/transform/order.transformer.ts`
3. Adicione testes em `tests/unit/order.transformer.test.ts`
4. Execute `npm test`

## 📝 Troubleshooting

### Polling não executa
- Verifique `POLLING_ENABLED=true`
- Confira logs: `grep "Polling" logs/`
- Verifique credenciais Brendi

### Pedidos não aparecem no Consumer
- Confira se status Brendi é `confirmed`/`preparing`/`ready`
- Verifique `/health/detailed` para stats de orders
- Confira se Consumer está consultando endpoint correto

### Erro de autenticação Brendi
- Verifique `BRENDI_CLIENT_ID` e `BRENDI_CLIENT_SECRET`
- Confira se token endpoint está correto
- Logs mostram `Fetching new OAuth token`

### Rate limit Consumer
- Ajuste `CONSUMER_RATE_LIMIT_MAX`
- Verifique headers `X-RateLimit-*` nas respostas

## 🤝 Contribuição

1. Fork o projeto
2. Crie branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit (`git commit -am 'Adiciona nova funcionalidade'`)
4. Push (`git push origin feature/nova-funcionalidade`)
5. Abra Pull Request

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 📞 Suporte

Para dúvidas ou problemas:
- Abra uma issue no GitHub
- Consulte logs em `/health/detailed`
- Verifique documentação das APIs Brendi e Consumer