// backend/domain/repositories/recurring.repository.js
import prisma from '../../lib/db.js';

export const RecurringRepository = {
  async findMany(userId) {
    return prisma.recurringTransaction.findMany({
      where: { userId, active: true },
      orderBy: { nextDue: 'asc' },
    });
  },

  async findById(id, userId) {
    return prisma.recurringTransaction.findFirst({ where: { id, userId } });
  },

  async create(data) {
    return prisma.recurringTransaction.create({ data });
  },

  async update(id, data) {
    return prisma.recurringTransaction.update({ where: { id }, data });
  },

  async softDelete(id) {
    return prisma.recurringTransaction.update({ where: { id }, data: { active: false } });
  },
};
