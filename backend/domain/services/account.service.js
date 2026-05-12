// backend/domain/services/account.service.js
import { AccountRepository } from '../repositories/account.repository.js';
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
    return AccountRepository.create({ ...body, userId });
  },

  async update(id, userId, body) {
    await this.getById(id, userId);
    return AccountRepository.update(id, body);
  },

  async remove(id, userId) {
    await this.getById(id, userId);
    await AccountRepository.softDelete(id);
  },
};
