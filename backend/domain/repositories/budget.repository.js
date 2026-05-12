// backend/domain/repositories/budget.repository.js
import prisma from '../../lib/db.js';

export const BudgetRepository = {
  async findMany(userId) {
    return prisma.budget.findMany({ where: { userId, active: true }, orderBy: { category: 'asc' } });
  },

  async findById(id, userId) {
    return prisma.budget.findFirst({ where: { id, userId } });
  },

  async upsert(userId, category, period, data) {
    return prisma.budget.upsert({
      where: { userId_category_period: { userId, category, period } },
      update: { ...data, active: true },
      create: { userId, category, period, ...data },
    });
  },

  async update(id, data) {
    return prisma.budget.update({ where: { id }, data });
  },

  async softDelete(id) {
    return prisma.budget.update({ where: { id }, data: { active: false } });
  },
};
