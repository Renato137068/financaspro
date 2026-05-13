// backend/domain/services/state.service.js
import prisma from '../../lib/db.js';
import redis from '../../lib/redis.js';

const STATE_TTL_SECONDS = 30;

const TX_SELECT = {
  id: true, type: true, amount: true, description: true,
  category: true, subcategory: true, date: true,
  accountId: true, tags: true, notes: true, recurring: true, createdAt: true,
};

const ACCOUNT_SELECT = {
  id: true, name: true, type: true, balance: true,
  currency: true, institution: true, active: true, createdAt: true,
};

const BUDGET_SELECT = {
  id: true, category: true, limit: true, period: true, active: true, updatedAt: true,
};

const RECURRING_SELECT = {
  id: true, type: true, amount: true, description: true,
  category: true, frequency: true, startDate: true, endDate: true, nextDue: true,
};

export const StateService = {
  _cacheKey(userId) { return `state:v1:${userId}`; },

  async invalidateCache(userId) {
    if (redis.isAvailable) {
      await redis.client.del(this._cacheKey(userId)).catch(() => {});
    }
  },

  async getSnapshot(userId) {
    const cacheKey = this._cacheKey(userId);

    // Tenta servir do cache Redis
    if (redis.isAvailable) {
      try {
        const cached = await redis.client.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch { /* ignora */ }
    }

    const [transactions, accounts, budgets, recurring, config] = await prisma.$transaction([
      prisma.transaction.findMany({
        where: { userId },
        select: TX_SELECT,
        orderBy: { date: 'desc' },
        take: 1000,
      }),
      prisma.account.findMany({
        where: { userId, active: true },
        select: ACCOUNT_SELECT,
        orderBy: { name: 'asc' },
      }),
      prisma.budget.findMany({
        where: { userId, active: true },
        select: BUDGET_SELECT,
        orderBy: { category: 'asc' },
      }),
      prisma.recurringTransaction.findMany({
        where: { userId, active: true },
        select: RECURRING_SELECT,
        orderBy: { nextDue: 'asc' },
      }),
      prisma.userConfig.findUnique({ where: { userId }, select: { data: true } }),
    ]);

    const snapshot = {
      meta: { syncedAt: new Date().toISOString(), schemaVersion: 2 },
      transactions,
      accounts,
      budgets,
      recurringTransactions: recurring,
      config: config?.data ?? {},
    };

    // Salva no cache com TTL curto
    if (redis.isAvailable) {
      redis.client.setex(cacheKey, STATE_TTL_SECONDS, JSON.stringify(snapshot)).catch(() => {});
    }

    return snapshot;
  },
};
