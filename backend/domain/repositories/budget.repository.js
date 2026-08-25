// backend/domain/repositories/budget.repository.js
import prisma from '../../lib/db.js';
import CONFIG from '../../config.js';
import {
  encodeCursor, decodeCursor, cursorWhereUpdatedAsc,
} from '../../lib/cursor-pagination.js';

export const BudgetRepository = {
  async findMany(userId) {
    return prisma.budget.findMany({ where: { userId, active: true }, orderBy: { category: 'asc' } });
  },

  async findById(id, userId) {
    return prisma.budget.findFirst({ where: { id, userId, active: true } });
  },

  async findByIdIncludingInactive(id, userId) {
    return prisma.budget.findFirst({ where: { id, userId } });
  },

  async findOwnerById(id) {
    return prisma.budget.findUnique({ where: { id }, select: { userId: true } });
  },

  async findDelta(userId, since, { limit, cursor } = {}) {
    const batchSize = limit ?? CONFIG.performance.syncDeltaBatchSize;
    const decoded = decodeCursor(cursor);
    const where = {
      userId,
      ...cursorWhereUpdatedAsc(since, decoded),
    };
    const take = batchSize + 1;
    const rows = await prisma.budget.findMany({
      where,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take,
    });
    const hasMore = rows.length > batchSize;
    const data = hasMore ? rows.slice(0, batchSize) : rows;
    const nextCursor = hasMore && data.length
      ? encodeCursor({ updatedAt: data[data.length - 1].updatedAt, id: data[data.length - 1].id })
      : null;
    return { rows: data, hasMore, nextCursor };
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

  async upsertSync(userId, id, data) {
    const owned = await prisma.budget.findFirst({ where: { id, userId } });
    if (owned) {
      return prisma.budget.update({
        where: { id },
        data: { ...data, active: data.active !== false },
      });
    }
    const foreign = await prisma.budget.findUnique({ where: { id }, select: { userId: true } });
    if (foreign) {
      const err = new Error('id-em-uso');
      err.code = 'ID_COLLISION';
      throw err;
    }
    return prisma.budget.create({
      data: { id, userId, active: data.active !== false, ...data },
    });
  },

  async softDelete(id, userId, clientUpdatedAt) {
    if (arguments.length === 1) {
      return prisma.budget.update({ where: { id }, data: { active: false } });
    }
    const when = clientUpdatedAt ? new Date(clientUpdatedAt) : new Date();
    const { count } = await prisma.budget.updateMany({
      where: { id, userId },
      data: { active: false, updatedAt: when },
    });
    if (count === 0) return null;
    return prisma.budget.findFirst({ where: { id, userId } });
  },

  async createInactiveTombstone(userId, id, clientUpdatedAt) {
    const when = new Date(clientUpdatedAt);
    const owned = await prisma.budget.findFirst({ where: { id, userId } });
    if (owned) {
      return prisma.budget.update({ where: { id }, data: { active: false, updatedAt: when } });
    }
    const foreign = await prisma.budget.findUnique({ where: { id }, select: { userId: true } });
    if (foreign) {
      const err = new Error('id-em-uso');
      err.code = 'ID_COLLISION';
      throw err;
    }
    return prisma.budget.create({
      data: {
        id,
        userId,
        category: '[deleted]',
        limit: 0,
        period: 'monthly',
        active: false,
        updatedAt: when,
      },
    });
  },
};
