// backend/domain/services/state.service.js
import prisma from '../../lib/db.js';

export const StateService = {
  async getSnapshot(userId) {
    const [transactions, accounts, budgets, recurring, config] = await prisma.$transaction([
      prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.account.findMany({ where: { userId, active: true }, orderBy: { name: 'asc' } }),
      prisma.budget.findMany({ where: { userId, active: true }, orderBy: { category: 'asc' } }),
      prisma.recurringTransaction.findMany({ where: { userId, active: true }, orderBy: { nextDue: 'asc' } }),
      prisma.userConfig.findUnique({ where: { userId } }),
    ]);

    return {
      meta: { syncedAt: new Date().toISOString(), schemaVersion: 2 },
      transactions,
      accounts,
      budgets,
      recurringTransactions: recurring,
      config: config?.data ?? {},
    };
  },
};
