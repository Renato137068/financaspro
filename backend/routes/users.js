// backend/routes/users.js — perfil do usuário e configurações
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../lib/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { UserService } from '../domain/services/user.service.js';

const router = Router();
router.use(authenticate);

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

const configSchema = z.record(z.unknown());

// GET /api/v1/users/me
router.get('/me', (req, res) => {
  const { id, name, email, role, createdAt } = req.user;
  res.json({ data: { id, name, email, role, createdAt } });
});

// PATCH /api/v1/users/me
router.patch('/me', validateBody(updateProfileSchema), async (req, res) => {
  const user = await UserService.updateProfile(req.user.id, req.body);
  res.json({ data: user });
});

// GET /api/v1/users/me/config
router.get('/me/config', async (req, res) => {
  const data = await UserService.getConfig(req.user.id);
  res.json({ data });
});

// PUT /api/v1/users/me/config
router.put('/me/config', validateBody(configSchema), async (req, res) => {
  const data = await UserService.updateConfig(req.user.id, req.body);
  res.json({ data });
});

// GET /api/v1/users — listagem (apenas ADMIN)
router.get('/', requireRole('ADMIN'), async (_req, res) => {
  const users = await UserService.listAll();
  res.json({ data: users });
});

// PATCH /api/v1/users/:id — gerenciar usuários (apenas ADMIN)
router.patch('/:id', requireRole('ADMIN'), validateBody(z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(['ADMIN', 'USER', 'VIEWER']).optional(),
  active: z.boolean().optional(),
})), async (req, res) => {
  const user = await UserService.updateById(req.params.id, req.body);
  res.json({ data: user });
});

export default router;
