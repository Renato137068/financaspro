// backend/domain/repositories/open-finance.repository.js
import prisma from '../../lib/db.js';

export const OpenFinanceRepository = {
  async listByUser(userId) {
    return prisma.openFinanceConnection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findById(id, userId) {
    return prisma.openFinanceConnection.findFirst({ where: { id, userId } });
  },

  async create(data) {
    return prisma.openFinanceConnection.create({ data });
  },

  async delete(id, userId) {
    return prisma.openFinanceConnection.deleteMany({ where: { id, userId } });
  },

  async updateLastSync(id, lastSyncAt) {
    return prisma.openFinanceConnection.update({
      where: { id },
      data: { lastSyncAt },
    });
  },
};
