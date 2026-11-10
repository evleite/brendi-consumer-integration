# Especificação da Integração Brendi → Consumer

## 1. Visão Geral

**Objetivo**: Middleware que sincroniza pedidos do Brendi (origem) para o Consumer (destino) de forma automática e confiável.

**Escopo do MVP (1-2 semanas)**:
- Polling no Brendi a cada 5 minutos
- Armazenamento temporário em PostgreSQL
- Endpoint REST para Consumer consultar pedidos pendentes
- Transformação de formato Brendi → Consumer
- Autenticação: OAuth 2.0 (Brendi) + API Key (Consumer)
- Deploy no Railway com PostgreSQL managed

---

## 2. Requisitos Funcionais

### RF01 - Polling Brendi
- **Frequência**: Configurável (default 5 min)
- **Endpoint**: `GET https://api.brendi.com.br/v1/events:polling`
- **Autenticação**: OAuth 2.0 Client Credentials
- **Filtro**: Buscar apenas eventos de "novo pedido" não processados
- **Idempotência**: Rastrear `event_id` processados para não duplicar

### RF02 - Busca de Detalhes do Pedido
- **Endpoint**: `GET https://api.brendi.com.br/v1/orders/:orderId`
- **Trigger**: Ao receber evento de novo pedido no polling
- **Armazenamento**: Salvar pedido completo transformado

### RF03 - Armazenamento Temporário
- **Tabela**: `orders` (pedidos transformados prontos para Consumer)
- **Tabela**: `processed_events` (controle de idempotência)
- **TTL**: Limpeza automática de pedidos > 30 dias ou já entregues ao Consumer

### RF04 - Endpoint para Consumer
- **GET /api/v1/orders/pending** - Lista pedidos pendentes (formato Consumer)
- **GET /api/v1/orders/:id** - Detalhes completos de um pedido
- **POST /api/v1/orders/:id/ack** - Consumer confirma recebimento
- **Autenticação**: API Key via header `X-API-Key`

### RF05 - Transformação de Dados
- Mapear campos Brendi → Consumer conforme documentação de ambos
- Tratar enums, formatos de data, moeda, endereços

---

## 3. Requisitos Não-Funcionais

| Requisito | Especificação |
|-----------|---------------|
| **Disponibilidade** | 99.5% (polling tolera falhas temporárias) |
| **Latência polling** | < 30s para processar lote de eventos |
| **Latência endpoint** | < 200ms (P95) |
| **Throughput** | 100 pedidos/min (muito acima do real) |
| **Segurança** | OAuth 2.0 + API Key, TLS, rate limiting, logs de auditoria |
| **Observabilidade** | Logs estruturados, health check, métricas básicas |
| **Recuperação** | Retry exponencial no polling, dead letter queue para falhas |

---

## 4. Critérios de Aceite (Gherkin)

```gherkin
Feature: Sincronização de pedidos Brendi → Consumer

  Scenario: Novo pedido no Brendi aparece no Consumer
    Given que existe um pedido "PED-123" no Brendi com status "confirmado"
    When o polling executa e busca eventos
    Then o pedido deve ser armazenado transformado no banco
    And o endpoint /orders/pending deve retornar o pedido no formato Consumer

  Scenario: Polling não duplica pedidos já processados
    Given que evento "evt-456" já foi processado anteriormente
    When o polling executa novamente e recebe o mesmo evento
    Then o pedido não deve ser duplicado no banco

  Scenario: Consumer consulta pedidos pendentes
    Given que existem 3 pedidos pendentes no banco
    When o Consumer faz GET /api/v1/orders/pending com API Key válida
    Then deve receber array com 3 pedidos no formato esperado

  Scenario: Consumer confirma recebimento
    Given que pedido "PED-123" está pendente
    When o Consumer faz POST /api/v1/orders/PED-123/ack
    Then o pedido deve ser marcado como "entregue" e não aparecer mais em /pending

  Scenario: Autenticação inválida rejeita acesso
    When Consumer faz requisição sem API Key ou com key inválida
    Then deve receber 401 Unauthorized

  Scenario: Falha no Brendi não quebra o sistema
    Given que API Brendi retorna 500
    When polling executa
    Then deve logar erro, agendar retry exponencial e não crashar
```

---

## 5. Definition of Ready (DoR)

- [x] História bem formada (INVEST)
- [x] Critérios de aceite em Gherkin
- [x] Dependências identificadas (credenciais OAuth, doc Consumer)
- [x] Arquitetura proposta e revisada
- [x] Stack definida (Node/TS/PostgreSQL/Railway)
- [ ] Credenciais de sandbox/mock disponíveis
- [ ] Ambiente Railway provisionado

---

## 6. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| API Brendi muda formato | Média | Alto | Versionamento no transformador, testes de contrato |
| Rate limit Brendi | Baixa | Médio | Backoff exponencial, cache de token OAuth |
| Consumer muda formato | Baixa | Alto | Versionamento na API (/v1/), transformador desacoplado |
| Perda de eventos | Baixa | Crítico | Idempotência por event_id, logs de auditoria |
| Deploy falha | Baixa | Médio | CI/CD automatizado, health checks, rollback rápido |