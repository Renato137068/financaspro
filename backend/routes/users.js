// backend/routes/users.js — perfil do usuário e configurações
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../lib/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { UserService } from '../domain/services/user.service.js';
import { AuthService } from '../domain/services/auth.service.js';
import { clearAuthCookies } from '../lib/authCookies.js';

const router = Router();
router.use(authenticate);

function clientMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] ?? req.ip,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
});

const configSchema = z.record(z.unknown());

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(128, 'Senha muito longa')
    .regex(
      /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
      'Senha deve conter pelo menos um número ou caractere especial',
    ),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

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

// POST /api/v1/users/me/password — troca de senha autenticada
router.post('/me/password', validateBody(changePasswordSchema), async (req, res) => {
  await AuthService.changePassword(
    req.user.id,
    req.body.currentPassword,
    req.body.newPassword,
    clientMeta(req),
  );
  clearAuthCookies(res); // sessões revogadas → força novo login
  res.json({ ok: true, message: 'Senha alterada. Faça login novamente.' });
});

// GET /api/v1/users/me/export — LGPD: portabilidade dos dados
router.get('/me/export', async (req, res) => {
  const data = await UserService.exportData(req.user.id);
  res.setHeader('Content-Disposition', 'attachment; filename="financaspro-meus-dados.json"');
  res.json(data);
});

// DELETE /api/v1/users/me — LGPD: exclusão de conta (confirma com senha)
router.delete('/me', validateBody(deleteAccountSchema), async (req, res) => {
  const ok = await AuthService.checkPassword(req.user.id, req.body.password);
  if (!ok) return res.status(401).json({ error: 'Senha incorreta' });
  await UserService.deleteAccount(req.user.id);
  clearAuthCookies(res);
  res.json({ ok: true, message: 'Conta e dados excluídos.' });
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
