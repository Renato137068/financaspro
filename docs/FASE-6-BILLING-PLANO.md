# Fase 6 — Billing (plano)

## Escopo

| Item | Implementação |
|------|---------------|
| Webhook idempotente | `StripeWebhookEvent` + claim (Fase 4) |
| Invoice replay | `upsertInvoice` + skip se já existe |
| Subscription única por org | `upsertSubscription(orgId)` |
| URLs Stripe | `assertAllowedRedirectUrl` — `APP_URL` + `BILLING_ALLOWED_ORIGINS` |
| Limites de plano | contas, orçamentos, transações/mês, membros+convites |
| Reconciliação | `BillingService.reconcileAll()` + worker semanal |

## Arquivos

- `backend/lib/billing-urls.js`
- `backend/middleware/plan.js`
- `backend/domain/services/billing.service.js`
- `backend/domain/repositories/billing.repository.js`
- `backend/domain/services/account.service.js`
- `backend/domain/services/budget.service.js`
- `backend/domain/services/org.service.js`
- `backend/workers/billing-reconcile.worker.js`
## Status: concluída (unit)

Pendente: testes de integração com Stripe test mode + enforcement via sync offline.
