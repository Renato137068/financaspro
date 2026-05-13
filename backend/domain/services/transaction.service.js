// backend/domain/services/transaction.service.js
import { TransactionRepository } from '../repositories/transaction.repository.js';
import { StateService } from './state.service.js';
import { AppError } from '../errors.js';

export const TransactionService = {
  async list(userId, filters) {
    return TransactionRepository.findMany(userId, filters);
  },

  async getById(id, userId) {
    const tx = await TransactionRepository.findById(id, userId);
    if (!tx) throw new AppError('Transação não encontrada', 404);
    return tx;
  },

  async create(userId, body) {
    const { amount, date, ...rest } = body;
    const tx = await TransactionRepository.create({ ...rest, amount, date: new Date(date), userId });
    StateService.invalidateCache(userId);
    return tx;
  },

  async update(id, userId, body) {
    await this.getById(id, userId);
    const { date, ...rest } = body;
    const tx = await TransactionRepository.update(id, { ...rest, ...(date && { date: new Date(date) }) });
    StateService.invalidateCache(userId);
    return tx;
  },

  async remove(id, userId) {
    await this.getById(id, userId);
    await TransactionRepository.delete(id);
    StateService.invalidateCache(userId);
  },
};
