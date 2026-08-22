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

const mutationSchema = z.object({
  opId: z.string().min(1).max(80),
  entity: z.enum(['transaction']).default('transaction'),
  op: z.enum(['upsert', 'delete']),
  id: z.string().uuid(),
  clientUpdatedAt: z.string().datetime(),
  payload: z.object({
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
  }).optional(),
});

const pushBodySchema = z.object({
  mutations: z.array(mutationSchema).max(100),
});

// GET /api/v1/sync?since=ISO — delta incremental de transações
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

// POST /api/v1/sync — aplica mutações idempotentes (opId)
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
