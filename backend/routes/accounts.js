// backend/routes/accounts.js — CRUD de contas bancárias
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, accountSchema } from '../middleware/validate.js';
import { AccountService } from '../domain/services/account.service.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/accounts
router.get('/', requirePermission('accounts:read'), async (req, res) => {
  const result = await AccountService.list(req.user.id);
  res.json(result);
});

// POST /api/v1/accounts
router.post('/', requirePermission('accounts:write'), validateBody(accountSchema), async (req, res) => {
  const account = await AccountService.create(req.user.id, req.body);
  res.status(201).json({ data: account });
});

// GET /api/v1/accounts/:id
router.get('/:id', requirePermission('accounts:read'), async (req, res) => {
  const account = await AccountService.getById(req.params.id, req.user.id);
  res.json({ data: account });
});

// PATCH /api/v1/accounts/:id
router.patch('/:id', requirePermission('accounts:write'), validateBody(accountSchema.partial()), async (req, res) => {
  const account = await AccountService.update(req.params.id, req.user.id, req.body);
  res.json({ data: account });
});

// DELETE /api/v1/accounts/:id — soft delete
router.delete('/:id', requirePermission('accounts:delete'), async (req, res) => {
  await AccountService.remove(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
