// backend/domain/services/sync.service.js
//
// Sync v2 — pull incremental + push com idempotência e tombstones.
import { resolveMutation } from './sync-conflict.service.js';
import { serializeTransaction } from '../contracts/finance.contract.js';
import { TransactionRepository } from '../repositories/transaction.repository.js';
import { SyncOpRepository } from '../repositories/sync-op.repository.js';
import { AccountService } from './account.service.js';
import { StateService } from './state.service.js';
import CONFIG from '../../config.js';

function serializeTx(tx) {
  return serializeTransaction(tx);
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { amount, date, ...rest } = payload;
  return {
    ...rest,
    amount,
    date: date ? new Date(date) : undefined,
  };
}

export const SyncService = {
  async pullDelta(userId, since, { limit, cursor } = {}) {
    const sinceIso = since ? new Date(since).toISOString() : new Date(0).toISOString();
    const batch = limit ?? CONFIG.performance.syncDeltaBatchSize;
    const { rows, hasMore, nextCursor } = await TransactionRepository.findDelta(
      userId, sinceIso, { limit: batch, cursor },
    );
    const transactions = rows.map(serializeTx);
    const watermark = transactions.length
      ? transactions[transactions.length - 1].updatedAt
      : (since || new Date(0).toISOString());
    return {
      cursor: watermark,
      nextCursor: hasMore ? nextCursor : null,
      hasMore,
      transactions,
    };
  },

  async pushMutations(userId, mutations) {
    const results = [];
    let cacheDirty = false;

    for (const m of mutations || []) {
      const cached = await SyncOpRepository.findById(m.opId, userId);
      if (cached && cached.resultJson) {
        results.push(JSON.parse(cached.resultJson));
        continue;
      }

      const result = await this._applyOne(userId, m);
      results.push(result);
      cacheDirty = cacheDirty || ['create', 'apply', 'delete', 'create-tombstone'].includes(result.action);

      await SyncOpRepository.record(m.opId, userId, {
        entity: m.entity || 'transaction',
        resourceId: m.id,
        action: result.action,
        resultJson: result,
      }).catch(() => { /* duplicate opId race — ok */ });
    }

    if (cacheDirty) await StateService.invalidateCache(userId);
    return { results };
  },

  async _applyOne(userId, m) {
    const base = { opId: m.opId, id: m.id, entity: m.entity || 'transaction' };

    if (m.entity && m.entity !== 'transaction') {
      return { ...base, action: 'reject', reason: 'entity-nao-suportada' };
    }

    const existing = await TransactionRepository.findByIdIncludingDeleted(m.id, userId);
    if (!existing) {
      const foreign = await TransactionRepository.findOwnerById(m.id);
      if (foreign && foreign.userId !== userId) {
        return { ...base, action: 'reject', reason: 'id-em-uso' };
      }
    }
    const resolution = resolveMutation(
      existing
        ? {
            id: existing.id,
            updatedAt: existing.updatedAt,
            deletedAt: existing.deletedAt,
          }
        : null,
      { op: m.op, id: m.id, clientUpdatedAt: m.clientUpdatedAt, payload: m.payload },
    );

    try {
      switch (resolution.action) {
        case 'create': {
          const data = normalizePayload(m.payload);
          if (!data || !data.type || data.amount == null || !data.description || !data.date) {
            return { ...base, action: 'reject', reason: 'payload-invalido' };
          }
          try {
            await AccountService.assertAccountsOwned(userId, data);
          } catch {
            return { ...base, action: 'reject', reason: 'conta-nao-autorizada' };
          }
          const tx = await TransactionRepository.upsertSync(userId, m.id, {
            ...data,
            deletedAt: null,
          });
          return { ...base, action: 'apply', record: serializeTx(tx) };
        }
        case 'apply': {
          const data = normalizePayload(m.payload);
          if (!data) return { ...base, action: 'reject', reason: 'payload-invalido' };
          try {
            await AccountService.assertAccountsOwned(userId, data);
          } catch {
            return { ...base, action: 'reject', reason: 'conta-nao-autorizada' };
          }
          const tx = await TransactionRepository.upsertSync(userId, m.id, {
            ...data,
            deletedAt: null,
          });
          return { ...base, action: 'apply', record: serializeTx(tx) };
        }
        case 'delete': {
          let tx;
          if (existing) {
            tx = await TransactionRepository.softDelete(m.id, userId, m.clientUpdatedAt);
          } else {
            tx = await TransactionRepository.createTombstone(userId, m.id, m.clientUpdatedAt);
          }
          if (!tx) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'delete', record: serializeTx(tx) };
        }
        case 'create-tombstone': {
          const tx = await TransactionRepository.createTombstone(userId, m.id, m.clientUpdatedAt);
          if (!tx) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'create-tombstone', record: serializeTx(tx) };
        }
        case 'server-wins':
          return {
            ...base,
            action: 'server-wins',
            status: 'stale',
            record: serializeTx(existing),
          };
        case 'reject':
        default:
          return { ...base, action: 'reject', reason: resolution.reason || 'rejeitado' };
      }
    } catch (err) {
      if (err?.code === 'ID_COLLISION') {
        return { ...base, action: 'reject', reason: 'id-em-uso' };
      }
      return { ...base, action: 'reject', reason: err.message || 'erro-aplicacao' };
    }
  },
};
