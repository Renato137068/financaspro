// backend/domain/repositories/account.repository.js
import prisma from '../../lib/db.js';

export const AccountRepository = {
  async findMany(userId) {
    return prisma.account.findMany({ where: { userId, active: true }, orderBy: { name: 'asc' } });
  },

  async findById(id, userId) {
    return prisma.account.findFirst({ where: { id, userId } });
  },

  async create(data) {
    return prisma.account.create({ data });
  },

  async update(id, data) {
    return prisma.account.update({ where: { id }, data });
  },

  async softDelete(id) {
    return prisma.account.update({ where: { id }, data: { active: false } });
  },
};
