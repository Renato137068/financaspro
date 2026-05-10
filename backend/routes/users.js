// backend/routes/users.js — perfil do usuário e configurações
import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../lib/rbac.js';
import { validateBody } from '../middleware/validate.js';

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
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: req.body,
  });
  res.json({ data: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// GET /api/v1/users/me/config
router.get('/me/config', async (req, res) => {
  const config = await prisma.userConfig.findUnique({ where: { userId: req.user.id } });
  res.json({ data: config?.data ?? {} });
});

// PUT /api/v1/users/me/config
router.put('/me/config', validateBody(configSchema), async (req, res) => {
  const config = await prisma.userConfig.upsert({
    where: { userId: req.user.id },
    update: { data: req.body },
    create: { userId: req.user.id, data: req.body },
  });
  res.json({ data: config.data });
});

// GET /api/v1/users — listagem (apenas ADMIN)
router.get('/', requireRole('ADMIN'), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: users });
});

// PATCH /api/v1/users/:id — gerenciar usuários (apenas ADMIN)
router.patch('/:id', requireRole('ADMIN'), validateBody(z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(['ADMIN', 'USER', 'VIEWER']).optional(),
  active: z.boolean().optional(),
})), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const updated = await prisma.user.update({ where: { id: req.params.id }, data: req.body });
  res.json({ data: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active } });
});

export default router;
