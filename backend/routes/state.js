// backend/routes/state.js — estado completo do app para sincronização frontend
import { Router } from 'express';
import prisma from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/state — retorna snapshot completo do estado do usuário
router.get('/', async (req, res) => {
  const userId = req.user.id;

  const [transactions, accounts, budgets, recurring, config] = await prisma.$transaction([
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
    prisma.account.findMany({ where: { userId, active: true }, orderBy: { name: 'asc' } }),
    prisma.budget.findMany({ where: { userId, active: true }, orderBy: { category: 'asc' } }),
    prisma.recurringTransaction.findMany({ where: { userId, active: true }, orderBy: { nextDue: 'asc' } }),
    prisma.userConfig.findUnique({ where: { userId } }),
  ]);

  res.json({
    meta: { syncedAt: new Date().toISOString(), schemaVersion: 2 },
    transactions,
    accounts,
    budgets,
    recurringTransactions: recurring,
    config: config?.data ?? {},
  });
});

export default router;
