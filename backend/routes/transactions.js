// backend/routes/transactions.js — CRUD de transações
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, validateQuery, transactionSchema, transactionPatchSchema, paginationSchema } from '../middleware/validate.js';
import { TransactionService } from '../domain/services/transaction.service.js';

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
  const result = await TransactionService.list(req.user.id, req.query);
  res.json(result);
});

// POST /api/v1/transactions
router.post('/', requirePermission('transactions:write'), validateBody(transactionSchema), async (req, res) => {
  const tx = await TransactionService.create(req.user.id, req.body);
  res.status(201).json({ data: tx });
});

// GET /api/v1/transactions/:id
router.get('/:id', requirePermission('transactions:read'), async (req, res) => {
  const tx = await TransactionService.getById(req.params.id, req.user.id);
  res.json({ data: tx });
});

// PATCH /api/v1/transactions/:id
router.patch('/:id', requirePermission('transactions:write'), validateBody(transactionPatchSchema), async (req, res) => {
  const tx = await TransactionService.update(req.params.id, req.user.id, req.body);
  res.json({ data: tx });
});

// DELETE /api/v1/transactions/:id
router.delete('/:id', requirePermission('transactions:delete'), async (req, res) => {
  await TransactionService.remove(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
