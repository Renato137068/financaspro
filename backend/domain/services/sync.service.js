// backend/domain/services/sync.service.js
//
// Sync v2 — pull incremental + push com idempotência e tombstones.
import { resolveMutation } from './sync-conflict.service.js';
import {
  serializeTransaction,
  serializeAccount,
  serializeRecurring,
  serializeBudget,
  assertTransferPayload,
  normalizeAccountId,
  ACCOUNT_TYPES,
  RECURRING_FREQUENCIES,
} from '../contracts/finance.contract.js';
import { TransactionRepository } from '../repositories/transaction.repository.js';
import { AccountRepository } from '../repositories/account.repository.js';
import { RecurringRepository } from '../repositories/recurring.repository.js';
import { BudgetRepository } from '../repositories/budget.repository.js';
import { SyncOpRepository } from '../repositories/sync-op.repository.js';
import { AccountService } from './account.service.js';
import { StateService } from './state.service.js';
import CONFIG from '../../config.js';

function serializeTx(tx) {
  return serializeTransaction(tx);
}

function normalizeTxPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { amount, date, ...rest } = payload;
  return {
    ...rest,
    amount,
    date: date ? new Date(date) : undefined,
  };
}

function normalizeAccountPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const type = payload.type || 'checking';
  if (!ACCOUNT_TYPES.includes(type)) return null;
  if (payload.name == null || String(payload.name).trim() === '') return null;
  const balance = Number(payload.balance);
  if (!Number.isFinite(balance)) return null;
  return {
    name: String(payload.name).trim(),
    type,
    balance,
    currency: payload.currency || 'BRL',
    institution: payload.institution ?? null,
    active: payload.active !== false,
  };
}

function normalizeRecurringPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const type = payload.type;
  if (!type || !['receita', 'despesa', 'transferencia'].includes(type)) return null;
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount)) return null;
  const frequency = payload.frequency || 'monthly';
  if (!RECURRING_FREQUENCIES.includes(frequency)) return null;
  if (!payload.description || !payload.startDate || !payload.nextDue) return null;
  return {
    type,
    amount,
    description: String(payload.description),
    category: payload.category ?? null,
    frequency,
    startDate: new Date(payload.startDate),
    endDate: payload.endDate ? new Date(payload.endDate) : null,
    nextDue: new Date(payload.nextDue),
    active: payload.active !== false,
    accountId: normalizeAccountId(payload.accountId),
  };
}

function normalizeBudgetPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const category = payload.category != null ? String(payload.category).trim() : '';
  if (!category) return null;
  const limit = Number(payload.limit);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const period = payload.period || 'monthly';
  if (!['monthly', 'weekly', 'yearly'].includes(period)) return null;
  return {
    category,
    limit,
    period,
    active: payload.active !== false,
  };
}

function existingFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? (row.active === false ? row.updatedAt : null),
  };
}

export const SyncService = {
  async pullDelta(userId, since, { limit, cursor } = {}) {
    const sinceIso = since ? new Date(since).toISOString() : new Date(0).toISOString();
    const batch = limit ?? CONFIG.performance.syncDeltaBatchSize;

    const txPage = await TransactionRepository.findDelta(userId, sinceIso, { limit: batch, cursor });
    const acRows = await AccountRepository.findDelta(userId, sinceIso, { limit: 200 });
    const recRows = await RecurringRepository.findDelta(userId, sinceIso, { limit: 200 });
    const budRows = await BudgetRepository.findDelta(userId, sinceIso, { limit: 200 });

    const transactions = txPage.rows.map(serializeTx);
    const accounts = acRows.rows.map(serializeAccount);
    const recurringTransactions = recRows.rows.map(serializeRecurring);
    const budgets = budRows.rows.map(serializeBudget);

    const watermarks = [
      transactions.length ? transactions[transactions.length - 1].updatedAt : null,
      accounts.length ? accounts[accounts.length - 1].updatedAt : null,
      recurringTransactions.length ? recurringTransactions[recurringTransactions.length - 1].updatedAt : null,
      budgets.length ? budgets[budgets.length - 1].updatedAt : null,
    ].filter(Boolean);

    const watermark = watermarks.length
      ? watermarks.sort().slice(-1)[0]
      : (since || new Date(0).toISOString());

    return {
      cursor: watermark,
      nextCursor: txPage.hasMore ? txPage.nextCursor : null,
      hasMore: txPage.hasMore,
      transactions,
      accounts,
      recurringTransactions,
      budgets,
    };
  },

  async pushMutations(userId, mutations) {
    const results = [];
    let cacheDirty = false;

    for (const m of mutations || []) {
      const entity = m.entity || 'transaction';
      const claim = await SyncOpRepository.claim(m.opId, userId, {
        entity,
        resourceId: m.id,
      });

      if (!claim.claimed) {
        if (claim.existing?.resultJson) {
          results.push(JSON.parse(claim.existing.resultJson));
          continue;
        }
        if (claim.existing?.action === 'pending') {
          const again = await SyncOpRepository.findById(m.opId, userId);
          if (again?.resultJson) {
            results.push(JSON.parse(again.resultJson));
            continue;
          }
        }
      }

      const result = await this._applyOne(userId, m);
      results.push(result);
      cacheDirty = cacheDirty || ['create', 'apply', 'delete', 'create-tombstone'].includes(result.action);

      await SyncOpRepository.complete(m.opId, userId, result).catch(async () => {
        const cached = await SyncOpRepository.findById(m.opId, userId);
        if (cached?.resultJson) {
          return JSON.parse(cached.resultJson);
        }
        throw new Error('sync-op-complete-failed');
      });
    }

    if (cacheDirty) await StateService.invalidateCache(userId);
    return { results };
  },

  async _applyOne(userId, m) {
    const entity = m.entity || 'transaction';
    if (entity === 'account') return this._applyAccount(userId, m);
    if (entity === 'recurring') return this._applyRecurring(userId, m);
    if (entity === 'budget') return this._applyBudget(userId, m);
    if (entity !== 'transaction') {
      return { opId: m.opId, id: m.id, entity, action: 'reject', reason: 'entity-nao-suportada' };
    }
    return this._applyTransaction(userId, m);
  },

  async _applyTransaction(userId, m) {
    const base = { opId: m.opId, id: m.id, entity: 'transaction' };

    const existing = await TransactionRepository.findByIdIncludingDeleted(m.id, userId);
    if (!existing) {
      const foreign = await TransactionRepository.findOwnerById(m.id);
      if (foreign && foreign.userId !== userId) {
        return { ...base, action: 'reject', reason: 'id-em-uso' };
      }
    }
    const resolution = resolveMutation(
      existingFromRow(existing),
      { op: m.op, id: m.id, clientUpdatedAt: m.clientUpdatedAt, payload: m.payload },
    );

    try {
      switch (resolution.action) {
        case 'create': {
          const data = normalizeTxPayload(m.payload);
          if (!data || !data.type || data.amount == null || !data.description || !data.date) {
            return { ...base, action: 'reject', reason: 'payload-invalido' };
          }
          const transferErr = assertTransferPayload({ type: data.type, accountId: data.accountId, targetAccountId: data.targetAccountId });
          if (transferErr) return { ...base, action: 'reject', reason: 'payload-invalido' };
          try {
            await AccountService.assertAccountsOwned(userId, data);
          } catch {
            return { ...base, action: 'reject', reason: 'conta-nao-autorizada' };
          }
          const tx = await TransactionRepository.upsertSync(userId, m.id, { ...data, deletedAt: null });
          return { ...base, action: 'apply', record: serializeTx(tx) };
        }
        case 'apply': {
          const data = normalizeTxPayload(m.payload);
          if (!data) return { ...base, action: 'reject', reason: 'payload-invalido' };
          const transferErr = assertTransferPayload({ type: data.type, accountId: data.accountId, targetAccountId: data.targetAccountId });
          if (transferErr) return { ...base, action: 'reject', reason: 'payload-invalido' };
          try {
            await AccountService.assertAccountsOwned(userId, data);
          } catch {
            return { ...base, action: 'reject', reason: 'conta-nao-autorizada' };
          }
          const tx = await TransactionRepository.upsertSync(userId, m.id, { ...data, deletedAt: null });
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

  async _applyAccount(userId, m) {
    const base = { opId: m.opId, id: m.id, entity: 'account' };
    const existing = await AccountRepository.findByIdIncludingInactive(m.id, userId);
    if (!existing) {
      const foreign = await AccountRepository.findOwnerById(m.id);
      if (foreign && foreign.userId !== userId) {
        return { ...base, action: 'reject', reason: 'id-em-uso' };
      }
    }
    const resolution = resolveMutation(
      existingFromRow(existing),
      { op: m.op, id: m.id, clientUpdatedAt: m.clientUpdatedAt, payload: m.payload },
    );

    try {
      switch (resolution.action) {
        case 'create':
        case 'apply': {
          const data = normalizeAccountPayload(m.payload);
          if (!data) return { ...base, action: 'reject', reason: 'payload-invalido' };
          const ac = await AccountRepository.upsertSync(userId, m.id, data);
          return { ...base, action: 'apply', record: serializeAccount(ac) };
        }
        case 'delete': {
          let ac;
          if (existing) {
            ac = await AccountRepository.softDelete(m.id, userId, m.clientUpdatedAt);
          } else {
            ac = await AccountRepository.createInactiveTombstone(userId, m.id, m.clientUpdatedAt);
          }
          if (!ac) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'delete', record: serializeAccount(ac) };
        }
        case 'create-tombstone': {
          const ac = await AccountRepository.createInactiveTombstone(userId, m.id, m.clientUpdatedAt);
          if (!ac) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'create-tombstone', record: serializeAccount(ac) };
        }
        case 'server-wins':
          return { ...base, action: 'server-wins', status: 'stale', record: serializeAccount(existing) };
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

  async _applyRecurring(userId, m) {
    const base = { opId: m.opId, id: m.id, entity: 'recurring' };
    const existing = await RecurringRepository.findByIdIncludingInactive(m.id, userId);
    if (!existing) {
      const foreign = await RecurringRepository.findOwnerById(m.id);
      if (foreign && foreign.userId !== userId) {
        return { ...base, action: 'reject', reason: 'id-em-uso' };
      }
    }
    const resolution = resolveMutation(
      existingFromRow(existing),
      { op: m.op, id: m.id, clientUpdatedAt: m.clientUpdatedAt, payload: m.payload },
    );

    try {
      switch (resolution.action) {
        case 'create':
        case 'apply': {
          const data = normalizeRecurringPayload(m.payload);
          if (!data) return { ...base, action: 'reject', reason: 'payload-invalido' };
          await AccountService.assertAccountsOwned(userId, data);
          const rec = await RecurringRepository.upsertSync(userId, m.id, data);
          return { ...base, action: 'apply', record: serializeRecurring(rec) };
        }
        case 'delete': {
          let rec;
          if (existing) {
            rec = await RecurringRepository.softDelete(m.id, userId, m.clientUpdatedAt);
          } else {
            rec = await RecurringRepository.createInactiveTombstone(userId, m.id, m.clientUpdatedAt);
          }
          if (!rec) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'delete', record: serializeRecurring(rec) };
        }
        case 'create-tombstone': {
          const rec = await RecurringRepository.createInactiveTombstone(userId, m.id, m.clientUpdatedAt);
          if (!rec) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'create-tombstone', record: serializeRecurring(rec) };
        }
        case 'server-wins':
          return { ...base, action: 'server-wins', status: 'stale', record: serializeRecurring(existing) };
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

  async _applyBudget(userId, m) {
    const base = { opId: m.opId, id: m.id, entity: 'budget' };
    const existing = await BudgetRepository.findByIdIncludingInactive(m.id, userId);
    if (!existing) {
      const foreign = await BudgetRepository.findOwnerById(m.id);
      if (foreign && foreign.userId !== userId) {
        return { ...base, action: 'reject', reason: 'id-em-uso' };
      }
    }
    const resolution = resolveMutation(
      existingFromRow(existing),
      { op: m.op, id: m.id, clientUpdatedAt: m.clientUpdatedAt, payload: m.payload },
    );

    try {
      switch (resolution.action) {
        case 'create':
        case 'apply': {
          const data = normalizeBudgetPayload(m.payload);
          if (!data) return { ...base, action: 'reject', reason: 'payload-invalido' };
          const bud = await BudgetRepository.upsertSync(userId, m.id, data);
          return { ...base, action: 'apply', record: serializeBudget(bud) };
        }
        case 'delete': {
          let bud;
          if (existing) {
            bud = await BudgetRepository.softDelete(m.id, userId, m.clientUpdatedAt);
          } else {
            bud = await BudgetRepository.createInactiveTombstone(userId, m.id, m.clientUpdatedAt);
          }
          if (!bud) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'delete', record: serializeBudget(bud) };
        }
        case 'create-tombstone': {
          const bud = await BudgetRepository.createInactiveTombstone(userId, m.id, m.clientUpdatedAt);
          if (!bud) return { ...base, action: 'reject', reason: 'id-em-uso' };
          return { ...base, action: 'create-tombstone', record: serializeBudget(bud) };
        }
        case 'server-wins':
          return { ...base, action: 'server-wins', status: 'stale', record: serializeBudget(existing) };
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
