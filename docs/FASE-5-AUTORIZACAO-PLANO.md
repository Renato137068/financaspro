# Fase 5 — Autorização e isolamento (plano)

## Decisão: sem RLS PostgreSQL (nesta entrega)

Isolamento consistente na **camada de serviço/repositório** com `userId` em toda leitura/escrita. RLS documentado como evolução futura se multi-tenant org-level for ativado.

## Implementado

| Área | Proteção |
|------|----------|
| Transações REST | Escopo por `userId` em list/get/update/delete |
| `accountId` / `targetAccountId` | `AccountService.assertAccountsOwned()` antes de create/update |
| Sync v2 | Rejeita UUID de transação de outro usuário (`id-em-uso`) |
| Sync opId | Cache de idempotência escopado por `userId` |
| Repositório TX | `update`/`softDelete`/`upsertSync` com `{ id, userId }` |

## Testes negativos

- `tests/backend/routes.http.test.js` — isolamento horizontal, accountId cross-user, sync IDOR
- `tests/backend/sync.service.test.js` — UUID cross-user, opId entre usuários

## Risco restante

- Modelo org (`orgId` em schema) ainda não isola dados financeiros por organização — API usa `userId` pessoal
- Open Finance: RBAC por permissão org não exercitado em todos os caminhos
- `AccountRepository.update(id)` sem `userId` no where — mitigado por `getById` prévio no serviço

## Próximo (Fase 6)

Billing Stripe idempotente completo, enforcement de limites de plano.
