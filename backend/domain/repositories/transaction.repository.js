// backend/domain/repositories/transaction.repository.js
import prisma from '../../lib/db.js';

export const TransactionRepository = {
  async findMany(userId, { type, category, accountId, dateFrom, dateTo, limit, offset }) {
    const where = {
      userId,
      ...(type && { type }),
      ...(category && { category }),
      ...(accountId && { accountId }),
      ...(dateFrom || dateTo
        ? { date: { ...(dateFrom && { gte: new Date(dateFrom) }), ...(dateTo && { lte: new Date(dateTo) }) } }
        : {}),
    };

    const [data, total] = await prisma.$transaction([
      prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, skip: offset, take: limit }),
      prisma.transaction.count({ where }),
    ]);

    return { data, meta: { total, limit, offset, hasMore: offset + limit < total } };
  },

  async findById(id, userId) {
    return prisma.transaction.findFirst({ where: { id, userId } });
  },

  async create(data) {
    return prisma.transaction.create({ data });
  },

  async update(id, data) {
    return prisma.transaction.update({ where: { id }, data });
  },

  async delete(id) {
    return prisma.transaction.delete({ where: { id } });
  },
};
