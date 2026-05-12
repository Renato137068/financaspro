// backend/domain/services/recurring.service.js
import { RecurringRepository } from '../repositories/recurring.repository.js';
import { AppError } from '../errors.js';

export const RecurringService = {
  async list(userId) {
    return { data: await RecurringRepository.findMany(userId) };
  },

  async getById(id, userId) {
    const item = await RecurringRepository.findById(id, userId);
    if (!item) throw new AppError('Recorrente não encontrado', 404);
    return item;
  },

  async create(userId, body) {
    const { startDate, endDate, nextDue, ...rest } = body;
    return RecurringRepository.create({
      ...rest,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      nextDue: new Date(nextDue),
      userId,
    });
  },

  async update(id, userId, body) {
    await this.getById(id, userId);
    const { startDate, endDate, nextDue, ...rest } = body;
    return RecurringRepository.update(id, {
      ...rest,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(nextDue && { nextDue: new Date(nextDue) }),
    });
  },

  async remove(id, userId) {
    await this.getById(id, userId);
    await RecurringRepository.softDelete(id);
  },
};
