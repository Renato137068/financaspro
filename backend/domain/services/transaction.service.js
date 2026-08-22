// backend/domain/services/transaction.service.js
import { TransactionRepository } from '../repositories/transaction.repository.js';
import { StateService } from './state.service.js';
import { AccountService } from './account.service.js';
import { AppError } from '../errors.js';
import { assertValidAmount } from '../../lib/money.js';
import { logFinancialMutation, snapshotTransaction } from '../../lib/finance-audit.js';

function normalizeAmount(body) {
  if (body.amount == null) return body;
  try {
    return { ...body, amount: assertValidAmount(body.amount) };
  } catch (e) {
    throw new AppError(e.message || 'Valor inválido', 422);
  }
}

export const TransactionService = {
  async list(userId, filters) {
    if (filters.cursor) {
      return TransactionRepository.findManyCursor(userId, filters);
    }
    return TransactionRepository.findMany(userId, filters);
  },

  async getById(id, userId) {
    const tx = await TransactionRepository.findById(id, userId);
    if (!tx) throw new AppError('Transação não encontrada', 404);
    return tx;
  },

  async create(userId, body, origin) {
    const normalized = normalizeAmount(body);
    await AccountService.assertAccountsOwned(userId, normalized);
    const { amount, date, ...rest } = normalized;
    const tx = await TransactionRepository.create({ ...rest, amount, date: new Date(date), userId });
    await logFinancialMutation({
      userId,
      action: 'transaction_create',
      resourceId: tx.id,
      previous: null,
      next: snapshotTransaction(tx),
      origin,
    });
    StateService.invalidateCache(userId);
    return tx;
  },

  async update(id, userId, body, origin) {
    const existing = await this.getById(id, userId);
    const normalized = body.amount != null ? normalizeAmount(body) : body;
    await AccountService.assertAccountsOwned(userId, normalized);
    const { date, ...rest } = normalized;
    const tx = await TransactionRepository.update(id, userId, { ...rest, ...(date && { date: new Date(date) }) });
    await logFinancialMutation({
      userId,
      action: 'transaction_update',
      resourceId: id,
      previous: snapshotTransaction(existing),
      next: snapshotTransaction(tx),
      origin,
    });
    StateService.invalidateCache(userId);
    return tx;
  },

  async remove(id, userId, origin) {
    const existing = await this.getById(id, userId);
    await TransactionRepository.softDelete(id, userId);
    await logFinancialMutation({
      userId,
      action: 'transaction_delete',
      resourceId: id,
      previous: snapshotTransaction(existing),
      next: null,
      origin,
    });
    StateService.invalidateCache(userId);
  },
};
