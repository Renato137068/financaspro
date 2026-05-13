// backend/routes/auth.js — registro, login, refresh, logout
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validateBody, registerSchema, loginSchema, refreshSchema } from '../middleware/validate.js';
import { AuthService } from '../domain/services/auth.service.js';

const router = Router();

function clientMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] ?? req.ip,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

// POST /api/v1/auth/register
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  const user = await AuthService.register(name, email, password, clientMeta(req));
  res.status(201).json({ data: user });
});

// POST /api/v1/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const result = await AuthService.login(email, password, clientMeta(req));
  res.json({ data: result });
});

// POST /api/v1/auth/refresh
router.post('/refresh', authLimiter, validateBody(refreshSchema), async (req, res) => {
  const tokens = await AuthService.refresh(req.body.refreshToken, clientMeta(req));
  res.json({ data: tokens });
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  await AuthService.logout(req.user.id, req.body.refreshToken, clientMeta(req));
  res.json({ ok: true });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req, res) => {
  const { id, name, email, role } = req.user;
  res.json({ data: { id, name, email, role } });
});

export default router;
