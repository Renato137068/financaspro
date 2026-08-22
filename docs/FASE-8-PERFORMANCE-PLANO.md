# Fase 8 — Performance e escala ✅

## Escopo forense

| Item | Implementação | Status |
|------|---------------|--------|
| Paginação por cursor | `findManyCursor` + query `cursor` em `/transactions` | ✅ |
| Remover limite 1000 no snapshot | `/state` retorna `transactions: []` + meta.total | ✅ |
| Sync incremental paginado | `pullDelta` com `limit`, `nextCursor`, `hasMore` | ✅ |
| Janela localStorage | `DADOS.aplicarJanelaLocal()` — 24 meses default | ✅ |
| Métricas de bundle | `scripts/check-bundle-budget.cjs` (existente) | ✅ |
| Testes de carga (invariantes) | `tests/backend/load.perf.test.js` | ✅ |

## Arquivos

- `backend/lib/cursor-pagination.js`
- `backend/domain/repositories/transaction.repository.js`
- `backend/domain/services/state.service.js`, `sync.service.js`
- `backend/routes/sync.js`, `transactions.js`, `config.js`
- `js/core/sync-engine.js` (`pullAll`), `dados.js`, `config.js`
- `tests/backend/load.perf.test.js`, `cursor-pagination.test.js`, `state.service.test.js`

## Decisões

- **Snapshot v2:** contas, orçamentos, recorrentes e config no `/state`; histórico via `GET /sync` paginado.
- **Cursor estável:** `(date,id)` desc na listagem; `(updatedAt,id)` asc no delta.
- **localStorage:** após sync, mantém só 24 meses (+ pendentes na outbox). Histórico completo no servidor.

## Evidências (2026-08-22)

- Backend: **414 passed**
- Frontend: **1236 passed** (7 skipped)
- Bundle budget: `scripts/check-bundle-budget.cjs` (requer `npm run build`)
