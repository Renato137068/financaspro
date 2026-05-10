// backend/routes/recurring.js — CRUD de transações recorrentes
import { Router } from 'express';
import prisma from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, recurringSchema } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/recorrentes
router.get('/', requirePermission('recurring:read'), async (req, res) => {
  const items = await prisma.recurringTransaction.findMany({
    where: { userId: req.user.id, active: true },
    orderBy: { nextDue: 'asc' },
  });
  res.json({ data: items });
});

// POST /api/v1/recorrentes
router.post('/', requirePermission('recurring:write'), validateBody(recurringSchema), async (req, res) => {
  const { startDate, endDate, nextDue, ...rest } = req.body;
  const item = await prisma.recurringTransaction.create({
    data: {
      ...rest,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      nextDue: new Date(nextDue),
      userId: req.user.id,
    },
  });
  res.status(201).json({ data: item });
});

// GET /api/v1/recorrentes/:id
router.get('/:id', requirePermission('recurring:read'), async (req, res) => {
  const item = await prisma.recurringTransaction.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!item) return res.status(404).json({ error: 'Recorrente não encontrado' });
  res.json({ data: item });
});

// PATCH /api/v1/recorrentes/:id
router.patch('/:id', requirePermission('recurring:write'), validateBody(recurringSchema.partial()), async (req, res) => {
  const existing = await prisma.recurringTransaction.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Recorrente não encontrado' });

  const { startDate, endDate, nextDue, ...rest } = req.body;
  const item = await prisma.recurringTransaction.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(nextDue && { nextDue: new Date(nextDue) }),
    },
  });
  res.json({ data: item });
});

// DELETE /api/v1/recorrentes/:id — soft delete
router.delete('/:id', requirePermission('recurring:delete'), async (req, res) => {
  const existing = await prisma.recurringTransaction.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Recorrente não encontrado' });

  await prisma.recurringTransaction.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

export default router;
