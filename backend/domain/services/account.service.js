// backend/domain/services/account.service.js
import { AccountRepository } from '../repositories/account.repository.js';
import { LedgerService } from './ledger.service.js';
import { StateService } from './state.service.js';
import { AppError } from '../errors.js';
import { assertAccountCapacity } from '../../middleware/plan.js';

/** Rejeita accountId/targetAccountId que não pertençam ao usuário. */
async function assertAccountsOwned(userId, body) {
  const ids = [body?.accountId, body?.targetAccountId].filter(Boolean);
  for (const id of [...new Set(ids)]) {
    const ac = await AccountRepository.findById(id, userId);
    if (!ac) throw new AppError('Conta não encontrada ou sem permissão', 403);
  }
}

export const AccountService = {
  async assertAccountsOwned(userId, body) {
    return assertAccountsOwned(userId, body);
  },

  async list(userId) {
    const rows = await AccountRepository.findMany(userId);
    const enriched = await Promise.all(rows.map(async (ac) => ({
      ...ac,
      derivedBalance: await LedgerService.deriveBalance(userId, ac.id),
    })));
    return { data: enriched };
  },

  async getById(id, userId) {
    const account = await AccountRepository.findById(id, userId);
    if (!account) throw new AppError('Conta não encontrada', 404);
    return {
      ...account,
      derivedBalance: await LedgerService.deriveBalance(userId, id),
    };
  },

  async create(userId, body) {
    await assertAccountCapacity(userId);
    const account = await AccountRepository.create({ ...body, userId });
    StateService.invalidateCache(userId);
    return account;
  },

  async update(id, userId, body) {
    await this.getById(id, userId);
    const account = await AccountRepository.update(id, body);
    StateService.invalidateCache(userId);
    return account;
  },

  async remove(id, userId) {
    await this.getById(id, userId);
    await AccountRepository.softDelete(id);
    StateService.invalidateCache(userId);
  },
};
