// backend/routes/recurring.js — CRUD de transações recorrentes
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, recurringSchema } from '../middleware/validate.js';
import { RecurringService } from '../domain/services/recurring.service.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/recorrentes
router.get('/', requirePermission('recurring:read'), async (req, res) => {
  const result = await RecurringService.list(req.user.id);
  res.json(result);
});

// POST /api/v1/recorrentes
router.post('/', requirePermission('recurring:write'), validateBody(recurringSchema), async (req, res) => {
  const item = await RecurringService.create(req.user.id, req.body);
  res.status(201).json({ data: item });
});

// GET /api/v1/recorrentes/:id
router.get('/:id', requirePermission('recurring:read'), async (req, res) => {
  const item = await RecurringService.getById(req.params.id, req.user.id);
  res.json({ data: item });
});

// PATCH /api/v1/recorrentes/:id
router.patch('/:id', requirePermission('recurring:write'), validateBody(recurringSchema.partial()), async (req, res) => {
  const item = await RecurringService.update(req.params.id, req.user.id, req.body);
  res.json({ data: item });
});

// DELETE /api/v1/recorrentes/:id — soft delete
router.delete('/:id', requirePermission('recurring:delete'), async (req, res) => {
  await RecurringService.remove(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
