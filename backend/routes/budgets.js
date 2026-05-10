// backend/routes/budgets.js — CRUD de orçamentos por categoria
import { Router } from 'express';
import prisma from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, budgetSchema } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/budgets
router.get('/', requirePermission('budgets:read'), async (req, res) => {
  const budgets = await prisma.budget.findMany({
    where: { userId: req.user.id, active: true },
    orderBy: { category: 'asc' },
  });
  res.json({ data: budgets });
});

// POST /api/v1/budgets — upsert por category+period
router.post('/', requirePermission('budgets:write'), validateBody(budgetSchema), async (req, res) => {
  const { category, period = 'monthly', ...rest } = req.body;
  const budget = await prisma.budget.upsert({
    where: { userId_category_period: { userId: req.user.id, category, period } },
    update: { ...rest, active: true },
    create: { userId: req.user.id, category, period, ...rest },
  });
  res.status(201).json({ data: budget });
});

// GET /api/v1/budgets/:id
router.get('/:id', requirePermission('budgets:read'), async (req, res) => {
  const budget = await prisma.budget.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!budget) return res.status(404).json({ error: 'Orçamento não encontrado' });
  res.json({ data: budget });
});

// PATCH /api/v1/budgets/:id
router.patch('/:id', requirePermission('budgets:write'), validateBody(budgetSchema.partial()), async (req, res) => {
  const existing = await prisma.budget.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado' });

  const budget = await prisma.budget.update({ where: { id: req.params.id }, data: req.body });
  res.json({ data: budget });
});

// DELETE /api/v1/budgets/:id — soft delete
router.delete('/:id', requirePermission('budgets:delete'), async (req, res) => {
  const existing = await prisma.budget.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Orçamento não encontrado' });

  await prisma.budget.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

export default router;
