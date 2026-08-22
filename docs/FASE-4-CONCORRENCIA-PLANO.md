# Fase 4 — Concorrência e idempotência (plano)

## Escopo desta fase

Corrigir condições de corrida em operações críticas sem reescrever a arquitetura.

| Área | Estratégia |
|------|------------|
| Worker de recorrentes | `updateMany` condicional (`id + nextDue`) antes de criar transação |
| Refresh token | Rotação só se `revokedAt IS NULL`; falha → revoga família |
| Reset / verify token | `consume` via `updateMany WHERE usedAt IS NULL` |
| Open Finance sync | Tratar `P2002` em `(userId, openFinanceId)` como skip |
| Stripe webhooks | Tabela `StripeWebhookEvent` + `claimWebhookEvent`; invoice via upsert |
| Org / invite / subscription | Org+FREE subscription na mesma transação; aceite atômico de convite |

## Arquivos (esta entrega)

- `backend/workers/recurring.worker.js`
- `backend/domain/repositories/session.repository.js`
- `backend/domain/repositories/verification-token.repository.js`
- `backend/domain/services/auth.service.js`
- `backend/domain/services/open-finance.service.js`
- `tests/backend/workers.test.js`
- `tests/backend/repositories.test.js`
- `tests/backend/concorrencia.test.js`

## Status: concluída (unit + prisma-fake)

Pendente apenas: testes de corrida com PostgreSQL/Redis real (CI opcional).
