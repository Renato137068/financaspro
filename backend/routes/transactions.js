// backend/routes/transactions.js — CRUD de transações
import { Router } from 'express';
import prisma from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import {
  validateBody,
  validateQuery,
  transactionSchema,
  transactionPatchSchema,
  paginationSchema,
} from '../middleware/validate.js';
import { z } from 'zod';

const router = Router();
router.use(authenticate);

const listQuerySchema = paginationSchema.extend({
  type: z.enum(['receita', 'despesa']).optional(),
  category: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  accountId: z.string().uuid().optional(),
});

// GET /api/v1/transactions
router.get('/', requirePermission('transactions:read'), validateQuery(listQuerySchema), async (req, res) => {
  const { limit, offset, type, category, dateFrom, dateTo, accountId } = req.query;

  const where = {
    userId: req.user.id,
    ...(type && { type }),
    ...(category && { category }),
    ...(accountId && { accountId }),
    ...(dateFrom || dateTo
      ? { date: { ...(dateFrom && { gte: new Date(dateFrom) }), ...(dateTo && { lte: new Date(dateTo) }) } }
      : {}),
  };

  const [data, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ data, meta: { total, limit, offset, hasMore: offset + limit < total } });
});

// POST /api/v1/transactions
router.post('/', requirePermission('transactions:write'), validateBody(transactionSchema), async (req, res) => {
  const { amount, date, ...rest } = req.body;
  const tx = await prisma.transaction.create({
    data: { ...rest, amount, date: new Date(date), userId: req.user.id },
  });
  res.status(201).json({ data: tx });
});

// GET /api/v1/transactions/:id
router.get('/:id', requirePermission('transactions:read'), async (req, res) => {
  const tx = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!tx) return res.status(404).json({ error: 'Transação não encontrada' });
  res.json({ data: tx });
});

// PATCH /api/v1/transactions/:id
router.patch('/:id', requirePermission('transactions:write'), validateBody(transactionPatchSchema), async (req, res) => {
  const existing = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Transação não encontrada' });

  const { date, ...rest } = req.body;
  const tx = await prisma.transaction.update({
    where: { id: req.params.id },
    data: { ...rest, ...(date && { date: new Date(date) }) },
  });
  res.json({ data: tx });
});

// DELETE /api/v1/transactions/:id
router.delete('/:id', requirePermission('transactions:delete'), async (req, res) => {
  const existing = await prisma.transaction.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Transação não encontrada' });

  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
