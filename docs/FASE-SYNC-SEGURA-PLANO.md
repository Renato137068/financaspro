# Fase 1 — Sincronização segura (plano técnico)

Prioridade: **integridade dos dados financeiros**. Nunca substituir localStorage por snapshot remoto sem merge.

## Problema atual

| Arquivo | Bug |
|---------|-----|
| `js/core/dados.js` | `_mergeSnapshotLocal()` faz full-replace destrutivo |
| `js/core/dados.js` | `_pushTransacaoApi` / `_deleteTransacaoApi` tratam falha como sucesso (`.catch → ok`) |
| `js/core/dados.js` | Sem outbox durável; operações offline se perdem no reload |
| `js/core/utils.js` | `gerarId()` não é UUID — incompatível com API |
| Backend | DELETE físico — impossível propagar tombstones |
| Backend | Sem endpoint incremental nem idempotência (`opId`) |

## Solução (sync v2)

```
Cliente                          Servidor
───────                          ────────
salvar/deletar → outbox (localStorage fp-outbox)
       ↓
flush → POST /api/v1/sync  →  resolveBatch + SyncOp (idempotência)
       ↓
pull  ← GET /api/v1/sync?since=  ← delta por updatedAt (+ tombstones)
       ↓
SYNC_MERGE.mergeDelta(local, pendingIds, delta)  →  nunca full-replace
```

## Arquivos envolvidos

### Schema / migration
- `prisma/schema.prisma` — `Transaction.deletedAt`, modelo `SyncOp`, índice `[userId, updatedAt]`
- `prisma/migrations/20260822120000_sync_v2/migration.sql`

### Backend
- `backend/domain/repositories/transaction.repository.js` — delta, upsert, soft delete
- `backend/domain/repositories/sync-op.repository.js` — idempotência por `opId`
- `backend/domain/services/sync.service.js` — pull + push
- `backend/routes/sync.js` — GET/POST `/api/v1/sync`
- `backend/routes/index.js` — registrar rota
- `backend/middleware/validate.js` — schemas Zod
- `backend/domain/services/transaction.service.js` — soft delete
- `backend/domain/services/state.service.js` — excluir tombstones do snapshot

### Frontend
- `js/core/sync-engine.js` — outbox, flush com backoff, pull incremental (**novo**)
- `js/core/sync-merge.js` — já existe (D1/D2/D3)
- `js/core/dados.js` — integrar sync v2; corrigir `.catch` silencioso
- `js/core/config.js` — chaves `STORAGE_OUTBOX`, `STORAGE_SYNC_CURSOR`, `syncV2Enabled`
- `js/core/utils.js` — `gerarUuid()`
- `js/services/actions.js` — `SYNC_PENDENTE`, `SYNC_CONFLITO`
- `js/core/store.js` — `sync.outboxCount`, `sync.conflicts`
- `js/utilities/sync-indicator.js` — feedback pendente/conflito
- `index.html` — carregar `sync-merge.js` + `sync-engine.js` antes de `dados.js`

### Testes
- `tests/sync-merge.test.js` — já existe (14)
- `tests/sync-engine.test.js` — offline, retry, reload, conflito (**novo**)
- `tests/sync-dados.test.js` — dados locais não desaparecem (**novo**)
- `tests/backend/sync.service.test.js` — resolver + idempotência (**novo**)
- `tests/backend/sync.routes.test.js` — HTTP com prisma-fake (**novo**)
- `scripts/lib/prisma-fake.mjs` — defaults `deletedAt`

## Feature flag

`config.syncV2Enabled` (default `true` quando API ativa). Caminho legado (`/state` full-replace) permanece se `false`.

## Decisões conservadoras

1. LWW por **registro inteiro** (já em `sync-conflict.service.js`) — sem merge parcial de campos.
2. Registros com mutação na outbox **nunca** são sobrescritos pelo pull (D1).
3. Tombstone local + servidor — delete offline enfileira `op:delete`; pull com `deletedAt` remove do cache.
4. UUID v4 desde criação local (`UTILS.gerarUuid`) quando sync v2 ativo.
5. Snapshot `/state` continua existindo só como bootstrap inicial mergeado, não como replace.

## Critérios de aceite (testes)

- [ ] Criação offline persiste após reload
- [ ] Edição antes da sync não é sobrescrita
- [ ] Exclusão offline propaga tombstone
- [ ] Conflito local/remoto → servidor vence se mais novo; UI mostra conflito
- [ ] Falha de rede mantém outbox
- [ ] Retry com backoff reenvia pendentes
- [ ] POST/PATCH/DELETE falho **não** tratado como sucesso
