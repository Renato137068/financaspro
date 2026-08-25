// backend/routes/sync.js — sync v2 incremental + push idempotente
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { SyncService } from '../domain/services/sync.service.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authenticate);

const pullQuerySchema = z.object({
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().max(256).optional(),
});

const txPayloadSchema = z.object({
  type: z.enum(['receita', 'despesa', 'transferencia']).optional(),
  amount: z.number().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  date: z.string().datetime().optional(),
  accountId: z.string().uuid().optional().nullable(),
  targetAccountId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  recurring: z.boolean().optional(),
});

const accountPayloadSchema = z.object({
  name: z.string().optional(),
  type: z.enum(['checking', 'savings', 'credit', 'investment']).optional(),
  balance: z.number().optional(),
  currency: z.string().optional(),
  institution: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

const recurringPayloadSchema = z.object({
  type: z.enum(['receita', 'despesa', 'transferencia']).optional(),
  amount: z.number().optional(),
  description: z.string().optional(),
  category: z.string().optional().nullable(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional().nullable(),
  nextDue: z.string().datetime().optional(),
  active: z.boolean().optional(),
});

const budgetPayloadSchema = z.object({
  category: z.string().optional(),
  limit: z.number().optional(),
  period: z.enum(['monthly', 'weekly', 'yearly']).optional(),
  active: z.boolean().optional(),
});

const mutationSchema = z.object({
  opId: z.string().min(1).max(80),
  entity: z.enum(['transaction', 'account', 'recurring', 'budget']).default('transaction'),
  op: z.enum(['upsert', 'delete']),
  id: z.string().uuid(),
  clientUpdatedAt: z.string().datetime(),
  payload: z.union([txPayloadSchema, accountPayloadSchema, recurringPayloadSchema, budgetPayloadSchema]).optional(),
});

const pushBodySchema = z.object({
  mutations: z.array(mutationSchema).max(100),
});

router.get(
  '/',
  requirePermission('transactions:read'),
  validateQuery(pullQuerySchema),
  asyncHandler(async (req, res) => {
    const delta = await SyncService.pullDelta(req.user.id, req.query.since, {
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    res.json({ data: delta });
  }),
);

router.post(
  '/',
  requirePermission('transactions:write'),
  validateBody(pushBodySchema),
  asyncHandler(async (req, res) => {
    const out = await SyncService.pushMutations(req.user.id, req.body.mutations);
    res.json({ data: out });
  }),
);

export default router;
