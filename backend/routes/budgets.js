// backend/routes/budgets.js — CRUD de orçamentos por categoria
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { validateBody, budgetSchema } from '../middleware/validate.js';
import { BudgetService } from '../domain/services/budget.service.js';

const router = Router();
router.use(authenticate);

// GET /api/v1/budgets
router.get('/', requirePermission('budgets:read'), async (req, res) => {
  const result = await BudgetService.list(req.user.id);
  res.json(result);
});

// POST /api/v1/budgets — upsert por category+period
router.post('/', requirePermission('budgets:write'), validateBody(budgetSchema), async (req, res) => {
  const budget = await BudgetService.upsert(req.user.id, req.body);
  res.status(201).json({ data: budget });
});

// GET /api/v1/budgets/:id
router.get('/:id', requirePermission('budgets:read'), async (req, res) => {
  const budget = await BudgetService.getById(req.params.id, req.user.id);
  res.json({ data: budget });
});

// PATCH /api/v1/budgets/:id
router.patch('/:id', requirePermission('budgets:write'), validateBody(budgetSchema.partial()), async (req, res) => {
  const budget = await BudgetService.update(req.params.id, req.user.id, req.body);
  res.json({ data: budget });
});

// DELETE /api/v1/budgets/:id — soft delete
router.delete('/:id', requirePermission('budgets:delete'), async (req, res) => {
  await BudgetService.remove(req.params.id, req.user.id);
  res.json({ ok: true });
});

export default router;
