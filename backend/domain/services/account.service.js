// backend/domain/services/account.service.js
import { AccountRepository } from '../repositories/account.repository.js';
import { StateService } from './state.service.js';
import { AppError } from '../errors.js';

export const AccountService = {
  async list(userId) {
    return { data: await AccountRepository.findMany(userId) };
  },

  async getById(id, userId) {
    const account = await AccountRepository.findById(id, userId);
    if (!account) throw new AppError('Conta não encontrada', 404);
    return account;
  },

  async create(userId, body) {
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
