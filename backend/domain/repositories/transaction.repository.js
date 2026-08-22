// backend/domain/repositories/transaction.repository.js
import prisma from '../../lib/db.js';
import CONFIG from '../../config.js';
import {
  encodeCursor, decodeCursor, cursorWhereDateDesc, cursorWhereUpdatedAsc,
} from '../../lib/cursor-pagination.js';

const NOT_DELETED = { deletedAt: null };

function baseFilters({ type, category, accountId, dateFrom, dateTo }) {
  return {
    ...(type && { type }),
    ...(category && { category }),
    ...(accountId && { accountId }),
    ...(dateFrom || dateTo
      ? { date: { ...(dateFrom && { gte: new Date(dateFrom) }), ...(dateTo && { lte: new Date(dateTo) }) } }
      : {}),
  };
}

export const TransactionRepository = {
  async findMany(userId, { type, category, accountId, dateFrom, dateTo, limit, offset }) {
    const where = {
      userId,
      ...NOT_DELETED,
      ...baseFilters({ type, category, accountId, dateFrom, dateTo }),
    };

    const [data, total] = await prisma.$transaction([
      prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, skip: offset, take: limit }),
      prisma.transaction.count({ where }),
    ]);

    return { data, meta: { total, limit, offset, hasMore: offset + limit < total } };
  },

  /** Paginação por cursor (date desc, id desc) — preferida para listagens grandes. */
  async findManyCursor(userId, { type, category, accountId, dateFrom, dateTo, limit, cursor }) {
    const decoded = decodeCursor(cursor);
    const where = {
      userId,
      ...NOT_DELETED,
      ...baseFilters({ type, category, accountId, dateFrom, dateTo }),
      ...(decoded ? cursorWhereDateDesc(decoded) : {}),
    };
    const take = limit + 1;
    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take,
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && data.length
      ? encodeCursor({ date: data[data.length - 1].date, id: data[data.length - 1].id })
      : null;
    return { data, meta: { limit, hasMore, nextCursor } };
  },

  async countActive(userId) {
    return prisma.transaction.count({ where: { userId, ...NOT_DELETED } });
  },

  async findById(id, userId) {
    return prisma.transaction.findFirst({ where: { id, userId, ...NOT_DELETED } });
  },

  /** Inclui tombstones — usado pelo sync. */
  async findByIdIncludingDeleted(id, userId) {
    return prisma.transaction.findFirst({ where: { id, userId } });
  },

  /** Dono do registro — detecta colisão de id entre usuários no sync. */
  async findOwnerById(id) {
    return prisma.transaction.findUnique({
      where: { id },
      select: { id: true, userId: true, updatedAt: true, deletedAt: true },
    });
  },

  async findByOpenFinanceId(userId, openFinanceId) {
    if (!openFinanceId) return null;
    return prisma.transaction.findFirst({ where: { userId, openFinanceId, ...NOT_DELETED } });
  },

  /**
   * Delta incremental paginado por updatedAt asc.
   * @returns {{ rows, hasMore, nextCursor }}
   */
  async findDelta(userId, since, { limit, cursor } = {}) {
    const batchSize = limit ?? CONFIG.performance.syncDeltaBatchSize;
    const decoded = decodeCursor(cursor);
    const where = {
      userId,
      ...cursorWhereUpdatedAsc(since, decoded),
    };
    const take = batchSize + 1;
    const rows = await prisma.transaction.findMany({
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

  async create(data) {
    return prisma.transaction.create({ data });
  },

  async update(id, userId, data) {
    const { count } = await prisma.transaction.updateMany({ where: { id, userId }, data });
    if (count === 0) return null;
    return prisma.transaction.findFirst({ where: { id, userId } });
  },

  async upsertSync(userId, id, data) {
    const { deletedAt, ...rest } = data;
    const owned = await prisma.transaction.findFirst({ where: { id, userId } });
    if (owned) {
      return prisma.transaction.update({
        where: { id },
        data: { ...rest, deletedAt: deletedAt ?? null },
      });
    }
    const foreign = await prisma.transaction.findUnique({ where: { id }, select: { userId: true } });
    if (foreign) {
      const err = new Error('id-em-uso');
      err.code = 'ID_COLLISION';
      throw err;
    }
    return prisma.transaction.create({
      data: { id, userId, deletedAt: deletedAt || null, ...rest },
    });
  },

  async softDelete(id, userId, deletedAt) {
    const when = deletedAt ? new Date(deletedAt) : new Date();
    const { count } = await prisma.transaction.updateMany({
      where: { id, userId },
      data: { deletedAt: when },
    });
    if (count === 0) return null;
    return prisma.transaction.findFirst({ where: { id, userId } });
  },

  async createTombstone(userId, id, clientUpdatedAt) {
    const when = new Date(clientUpdatedAt);
    const owned = await prisma.transaction.findFirst({ where: { id, userId } });
    if (owned) {
      return prisma.transaction.update({ where: { id }, data: { deletedAt: when } });
    }
    const foreign = await prisma.transaction.findUnique({ where: { id }, select: { userId: true } });
    if (foreign) {
      const err = new Error('id-em-uso');
      err.code = 'ID_COLLISION';
      throw err;
    }
    return prisma.transaction.create({
      data: {
        id,
        userId,
        type: 'despesa',
        amount: 0,
        description: '[deleted]',
        category: 'outro',
        date: when,
        deletedAt: when,
      },
    });
  },

  /** @deprecated Prefer softDelete — mantido para compatibilidade interna. */
  async delete(id, userId) {
    return this.softDelete(id, userId);
  },
};
