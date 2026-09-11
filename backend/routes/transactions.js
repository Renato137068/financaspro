// backend/routes/transactions.js — CRUD de transações
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, validateQuery, transactionSchema, transactionPatchSchema, paginationSchema, validateParams, idParamSchema } from '../middleware/validate.js';
import { TransactionService } from '../domain/services/transaction.service.js';
import { injectPlan, checkTransactionLimit } from '../middleware/plan.js';
import { asyncHandler } from '../lib/async-handler.js';
import { clientMetaFromRequest } from '../lib/client-meta.js';

const router = Router();
router.use(authenticate);

const listQuerySchema = paginationSchema.extend({
  cursor: z.string().max(256).optional(),
  type: z.enum(['receita', 'despesa']).optional(),
  category: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  accountId: z.string().uuid().optional(),
}).refine(
  (q) => !q.cursor || q.offset === 0,
  { message: 'Use cursor ou offset, não ambos', path: ['cursor'] },
);

// GET /api/v1/transactions
router.get('/', requirePermission('transactions:read'), validateQuery(listQuerySchema), asyncHandler(async (req, res) => {
  const result = await TransactionService.list(req.user.id, req.query);
  res.json(result);
}));

// POST /api/v1/transactions
router.post('/', requirePermission('transactions:write'), injectPlan(), checkTransactionLimit, validateBody(transactionSchema), asyncHandler(async (req, res) => {
  const tx = await TransactionService.create(req.user.id, req.body, clientMetaFromRequest(req));
  res.status(201).json({ data: tx });
}));

// GET /api/v1/transactions/:id
router.get('/:id', validateParams(idParamSchema), requirePermission('transactions:read'), asyncHandler(async (req, res) => {
  const tx = await TransactionService.getById(req.params.id, req.user.id);
  res.json({ data: tx });
}));

// PATCH /api/v1/transactions/:id
router.patch('/:id', validateParams(idParamSchema), requirePermission('transactions:write'), validateBody(transactionPatchSchema), asyncHandler(async (req, res) => {
  const tx = await TransactionService.update(req.params.id, req.user.id, req.body, clientMetaFromRequest(req));
  res.json({ data: tx });
}));

// DELETE /api/v1/transactions/:id
router.delete('/:id', validateParams(idParamSchema), requirePermission('transactions:delete'), asyncHandler(async (req, res) => {
  await TransactionService.remove(req.params.id, req.user.id, clientMetaFromRequest(req));
  res.json({ ok: true });
}));

export default router;
