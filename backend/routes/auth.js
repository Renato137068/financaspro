// backend/routes/auth.js — registro, login, refresh, logout
import { Router } from 'express';
import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import prisma from '../lib/db.js';
import { signTokens, verifyRefreshToken } from '../lib/jwt.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validateBody, registerSchema, loginSchema, refreshSchema } from '../middleware/validate.js';
import CONFIG from '../config.js';
import logger from '../lib/logger.js';

const router = Router();
const { pbkdf2Iterations, saltLength } = CONFIG.auth;

function hashPassword(password, saltHex) {
  return pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), pbkdf2Iterations, 32, 'sha256').toString('hex');
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function clientMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] ?? req.ip,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

// POST /api/v1/auth/register
router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: 'Email já cadastrado' });

  const salt = randomBytes(saltLength).toString('hex');
  const user = await prisma.user.create({
    data: { name, email, passwordSalt: salt, passwordHash: hashPassword(password, salt) },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: 'register', resource: 'user', resourceId: user.id, ...clientMeta(req) },
  });

  logger.info({ userId: user.id, email }, 'Novo usuário registrado');
  res.status(201).json({ data: publicUser(user) });
});

// POST /api/v1/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (!user.active) return res.status(403).json({ error: 'Conta desativada' });

  const candidate = hashPassword(password, user.passwordSalt);
  const valid = timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(user.passwordHash, 'hex'));
  if (!valid) {
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'login_failed', resource: 'user', ...clientMeta(req) },
    });
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const { accessToken, refreshToken } = signTokens(user);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { userId: user.id, refreshToken, expiresAt, ...clientMeta(req) },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: 'login', resource: 'user', ...clientMeta(req) },
  });

  logger.info({ userId: user.id }, 'Login realizado');
  res.json({ data: { accessToken, refreshToken, user: publicUser(user) } });
});

// POST /api/v1/auth/refresh
router.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado' });
  }

  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Sessão inválida' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.active) return res.status(401).json({ error: 'Usuário inativo' });

  // Rotaciona o refresh token (revoga o antigo, cria novo)
  const tokens = signTokens(user);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    prisma.session.create({ data: { userId: user.id, refreshToken: tokens.refreshToken, expiresAt, ...clientMeta(req) } }),
  ]);

  res.json({ data: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } });
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.session.updateMany({
      where: { userId: req.user.id, refreshToken },
      data: { revokedAt: new Date() },
    });
  }
  await prisma.auditLog.create({
    data: { userId: req.user.id, action: 'logout', resource: 'user', ...clientMeta(req) },
  });
  res.json({ ok: true });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ data: publicUser(req.user) });
});

export default router;
