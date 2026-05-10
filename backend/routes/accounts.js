// backend/routes/accounts.js — CRUD de contas bancárias
import { Router } from 'express';
import prisma from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, accountSchema } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/accounts
router.get('/', requirePermission('accounts:read'), async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.user.id, active: true },
    orderBy: { name: 'asc' },
  });
  res.json({ data: accounts });
});

// POST /api/v1/accounts
router.post('/', requirePermission('accounts:write'), validateBody(accountSchema), async (req, res) => {
  const account = await prisma.account.create({
    data: { ...req.body, userId: req.user.id },
  });
  res.status(201).json({ data: account });
});

// GET /api/v1/accounts/:id
router.get('/:id', requirePermission('accounts:read'), async (req, res) => {
  const account = await prisma.account.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!account) return res.status(404).json({ error: 'Conta não encontrada' });
  res.json({ data: account });
});

// PATCH /api/v1/accounts/:id
router.patch('/:id', requirePermission('accounts:write'), validateBody(accountSchema.partial()), async (req, res) => {
  const existing = await prisma.account.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

  const account = await prisma.account.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ data: account });
});

// DELETE /api/v1/accounts/:id — soft delete
router.delete('/:id', requirePermission('accounts:delete'), async (req, res) => {
  const existing = await prisma.account.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) return res.status(404).json({ error: 'Conta não encontrada' });

  await prisma.account.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ ok: true });
});

export default router;
