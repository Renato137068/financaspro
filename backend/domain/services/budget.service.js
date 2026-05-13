// backend/domain/services/budget.service.js
import { BudgetRepository } from '../repositories/budget.repository.js';
import { StateService } from './state.service.js';
import { AppError } from '../errors.js';

export const BudgetService = {
  async list(userId) {
    return { data: await BudgetRepository.findMany(userId) };
  },

  async getById(id, userId) {
    const budget = await BudgetRepository.findById(id, userId);
    if (!budget) throw new AppError('Orçamento não encontrado', 404);
    return budget;
  },

  async upsert(userId, body) {
    const { category, period = 'monthly', ...rest } = body;
    return BudgetRepository.upsert(userId, category, period, rest);
  },

  async update(id, userId, body) {
    await this.getById(id, userId);
    return BudgetRepository.update(id, body);
  },

  async remove(id, userId) {
    await this.getById(id, userId);
    await BudgetRepository.softDelete(id);
  },
};
