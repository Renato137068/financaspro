// backend/routes/auth.js — registro, login, refresh, logout
import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validateBody, registerSchema, loginSchema } from '../middleware/validate.js';
import { AuthService } from '../domain/services/auth.service.js';
import { TotpService } from '../domain/services/totp.service.js';
import { setAuthCookies, clearAuthCookies, getRefreshToken, getAccessToken } from '../lib/authCookies.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();

const totpVerifyLoginSchema = z.object({
  pendingToken: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
});

const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
});

const totpDisableSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
});

const strongPassword = z
  .string()
  .min(8, 'Senha deve ter pelo menos 8 caracteres')
  .max(128, 'Senha muito longa')
  .regex(
    /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
    'Senha deve conter pelo menos um número ou caractere especial',
  );

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: strongPassword,
});

const tokenSchema = z.object({
  token: z.string().min(10),
});

function clientMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] ?? req.ip,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

// POST /api/v1/auth/forgot-password — inicia reset (resposta sempre genérica)
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), asyncHandler(async (req, res) => {
  await AuthService.requestPasswordReset(req.body.email, clientMeta(req));
  res.json({ ok: true, message: 'Se o e-mail existir, enviaremos instruções de redefinição.' });
}));

// POST /api/v1/auth/reset-password — conclui reset com token de uso único
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), asyncHandler(async (req, res) => {
  await AuthService.resetPassword(req.body.token, req.body.newPassword, clientMeta(req));
  res.json({ ok: true, message: 'Senha redefinida. Faça login com a nova senha.' });
}));

// POST /api/v1/auth/verify-email — confirma e-mail via token
router.post('/verify-email', validateBody(tokenSchema), asyncHandler(async (req, res) => {
  const result = await AuthService.verifyEmail(req.body.token);
  res.json({ data: result });
}));

// POST /api/v1/auth/resend-verification — reenvia e-mail de verificação (autenticado)
router.post('/resend-verification', authenticate, asyncHandler(async (req, res) => {
  await AuthService.sendVerificationEmail(req.user);
  res.json({ ok: true, message: 'E-mail de verificação reenviado.' });
}));

// POST /api/v1/auth/register
router.post('/register', authLimiter, validateBody(registerSchema), asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const user = await AuthService.register(name, email, password, clientMeta(req));
  res.status(201).json({ data: user });
}));

// POST /api/v1/auth/login
router.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await AuthService.login(email, password, clientMeta(req));

  if (result.requiresTotp) {
    return res.json({ data: result });
  }

  setAuthCookies(res, result);
  res.json({
    data: {
      user: result.user,
      accessToken: null,
      refreshToken: null,
    },
  });
}));

// POST /api/v1/auth/refresh
router.post('/refresh', authLimiter, asyncHandler(async (req, res) => {
  const refreshToken = getRefreshToken(req);
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token ausente' });
  }
  const tokens = await AuthService.refresh(refreshToken, clientMeta(req));
  setAuthCookies(res, tokens);
  res.json({
    data: {
      accessToken: null,
      refreshToken: null,
    },
  });
}));

// POST /api/v1/auth/logout — limpa cookies mesmo sem sessão válida
router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = getRefreshToken(req);
  try {
    const accessToken = getAccessToken(req);
    if (accessToken && refreshToken) {
      const payload = verifyAccessToken(accessToken);
      await AuthService.logout(payload.sub, refreshToken, clientMeta(req));
    }
  } catch {
    // Sessão já expirada — apenas limpar cookies.
  }
  clearAuthCookies(res);
  res.json({ ok: true });
}));

// GET /api/v1/auth/me
router.get('/me', authenticate, (req, res) => {
  const { id, name, email, role, totpEnabled, emailVerified } = req.user;
  res.json({ data: { id, name, email, role, totpEnabled: !!totpEnabled, emailVerified: !!emailVerified } });
});

// ─── 2FA TOTP ─────────────────────────────────────────────────────────────────
router.post('/totp/verify', authLimiter, validateBody(totpVerifyLoginSchema), async (req, res, next) => {
  try {
    const result = await TotpService.verifyLogin(
      req.body.pendingToken,
      req.body.code,
      clientMeta(req),
    );
    setAuthCookies(res, result);
    res.json({
      data: { user: result.user, accessToken: null, refreshToken: null },
    });
  } catch (err) { next(err); }
});

router.get('/totp/status', authenticate, async (req, res, next) => {
  try {
    const status = await TotpService.getStatus(req.user.id);
    res.json({ data: status });
  } catch (err) { next(err); }
});

router.post('/totp/setup', authenticate, async (req, res, next) => {
  try {
    const data = await TotpService.setup(req.user.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/totp/enable', authenticate, validateBody(totpCodeSchema), async (req, res, next) => {
  try {
    const data = await TotpService.enable(req.user.id, req.body.code);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/totp/disable', authenticate, validateBody(totpDisableSchema), async (req, res, next) => {
  try {
    const data = await TotpService.disable(req.user.id, req.body.code, req.body.password);
    res.json({ data });
  } catch (err) { next(err); }
});

export default router;
