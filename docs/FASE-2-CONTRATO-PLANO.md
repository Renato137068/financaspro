# Fase 2 — Contrato frontend / API / banco (plano)

## Objetivo

Um único modelo oficial para transações, contas e recorrentes, com mapeamento PT↔EN centralizado e referência de contas por **UUID**.

## Arquivos

| Camada | Arquivo | Papel |
|--------|---------|-------|
| Backend | `backend/domain/contracts/finance.contract.js` | Constantes + helpers EN |
| Backend | `backend/middleware/validate.js` | Schemas Zod (fonte da verdade API) |
| Backend | `prisma/schema.prisma` | `Transaction.targetAccountId` |
| Frontend | `js/core/finance-contract.js` | Mappers PT↔EN únicos |
| Frontend | `js/core/dados.js` | Delega conversões ao contrato |
| Frontend | `js/core/sync-engine.js` | Usa contrato no payload sync |
| Docs | `docs/openapi.json` | Gerado de validate.js |

## Decisões

1. **API fala EN** (`type`, `accountId`, `targetAccountId`, `frequency: monthly`).
2. **localStorage fala PT** (`tipo`, `banco`, `contaDestino`, `frequencia: mensal`).
3. **UUID obrigatório na API**; local pode manter nome legível — o mapper resolve via lista de contas.
4. **`transferencia`** é tipo válido na API; exige `targetAccountId` quando `type === transferencia`.
5. Recorrentes: corrigir bug `inicio`/`proxima` → `dataInicio`/`proximoVencimento`.
