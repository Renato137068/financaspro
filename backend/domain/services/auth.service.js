// backend/domain/services/auth.service.js
import { randomBytes, pbkdf2, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { UserRepository } from '../repositories/user.repository.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { VerificationTokenRepository } from '../repositories/verification-token.repository.js';
import { signTokens, verifyRefreshToken, parseDurationMs } from '../../lib/jwt.js';
import { AppError } from '../errors.js';
import CONFIG from '../../config.js';
import logger from '../../lib/logger.js';
import redis from '../../lib/redis.js';
import { enqueue, QUEUES } from '../../lib/queue.js';
import { TotpService } from './totp.service.js';

const RESET_TTL_MS = 60 * 60 * 1000;        // 1 hora
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;  // 24 horas

const { pbkdf2Iterations, saltLength, loginMaxAttempts, loginLockoutMs, refreshExpiresIn } = CONFIG.auth;
const pbkdf2Async = promisify(pbkdf2);
const sessionDurationMs = parseDurationMs(refreshExpiresIn);

// Lockout de login: usa Redis quando disponível (distribuído e persistente
// entre instâncias/restart) e cai para um Map em memória como fallback.
const _failedAttempts = new Map();
const LOCK_PREFIX = 'lockout:';
const FAIL_PREFIX = 'login_fail:';

function _redis() {
  return redis.isAvailable ? redis.client : null;
}

async function isLockedOut(email) {
  const r = _redis();
  if (r) {
    try { return (await r.exists(LOCK_PREFIX + email)) === 1; } catch { /* fallback memória */ }
  }
  const rec = _failedAttempts.get(email);
  if (!rec?.lockedUntil) return false;
  if (Date.now() < rec.lockedUntil) return true;
  _failedAttempts.delete(email);
  return false;
}

async function recordFailedLogin(email) {
  const r = _redis();
  if (r) {
    try {
      const count = await r.incr(FAIL_PREFIX + email);
      if (count === 1) await r.pexpire(FAIL_PREFIX + email, loginLockoutMs);
      if (count >= loginMaxAttempts) {
        await r.set(LOCK_PREFIX + email, '1', 'PX', loginLockoutMs);
        await r.del(FAIL_PREFIX + email);
        logger.warn({ email }, 'Conta bloqueada temporariamente por tentativas excessivas');
      }
      return;
    } catch { /* fallback memória */ }
  }
  const rec = _failedAttempts.get(email) ?? { count: 0, lockedUntil: null };
  rec.count++;
  if (rec.count >= loginMaxAttempts) {
    rec.lockedUntil = Date.now() + loginLockoutMs;
    rec.count = 0;
    logger.warn({ email }, 'Conta bloqueada temporariamente por tentativas excessivas');
  }
  _failedAttempts.set(email, rec);
}

async function clearFailedLogin(email) {
  const r = _redis();
  if (r) {
    try { await r.del(FAIL_PREFIX + email, LOCK_PREFIX + email); } catch { /* ignore */ }
  }
  _failedAttempts.delete(email);
}

const LEGACY_ITERATIONS = 100000;

// Deriva o hash hex puro (PBKDF2-SHA256, 32 bytes) com um nº de iterações explícito.
async function deriveHex(password, saltHex, iterations) {
  const buf = await pbkdf2Async(password, Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256');
  return buf.toString('hex');
}

// Formato armazenado: "<iterations>:<hex>". Hashes legados (hex puro, sem ":")
// são tratados como 100k iterações, permitindo re-hash transparente no login.
async function hashPassword(password, saltHex) {
  const hex = await deriveHex(password, saltHex, pbkdf2Iterations);
  return `${pbkdf2Iterations}:${hex}`;
}

function parseStoredHash(stored) {
  const idx = String(stored).indexOf(':');
  if (idx === -1) return { iterations: LEGACY_ITERATIONS, hex: String(stored) };
  const iterations = parseInt(stored.slice(0, idx), 10) || LEGACY_ITERATIONS;
  return { iterations, hex: stored.slice(idx + 1) };
}

// Verifica a senha contra o hash armazenado (qualquer formato) em tempo constante.
// Retorna { valid, needsRehash } — needsRehash indica hash abaixo do alvo atual.
async function verifyPassword(password, saltHex, stored) {
  const { iterations, hex } = parseStoredHash(stored);
  const candidate = await deriveHex(password, saltHex, iterations);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hex, 'hex');
  const valid = a.length === b.length && timingSafeEqual(a, b);
  return { valid, needsRehash: valid && iterations < pbkdf2Iterations };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    totpEnabled: !!user.totpEnabled,
  };
}

export const AuthService = {
  async register(name, email, password, clientMeta) {
    const existing = await UserRepository.findByEmail(email);
    if (existing) throw new AppError('Email já cadastrado', 409);

    const salt = randomBytes(saltLength).toString('hex');
    const user = await UserRepository.create({
      name,
      email,
      passwordSalt: salt,
      passwordHash: await hashPassword(password, salt),
    });

    await AuditRepository.log({
      userId: user.id, action: 'register', resource: 'user', resourceId: user.id, ...clientMeta,
    });

    // Envia e-mail de verificação (não bloqueia o cadastro se a fila/SMTP falhar).
    try {
      await this.sendVerificationEmail(user);
    } catch (err) {
      logger.warn({ userId: user.id, err }, 'Falha ao enfileirar e-mail de verificação');
    }

    logger.info({ userId: user.id, email }, 'Novo usuário registrado');
    return publicUser(user);
  },

  async login(email, password, clientMeta) {
    // Verificar lockout antes de qualquer consulta ao banco
    if (await isLockedOut(email)) {
      throw new AppError('Conta temporariamente bloqueada. Tente novamente em breve.', 429);
    }

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      await recordFailedLogin(email);
      throw new AppError('Credenciais inválidas', 401);
    }
    if (!user.active) throw new AppError('Conta desativada', 403);

    const { valid, needsRehash } = await verifyPassword(password, user.passwordSalt, user.passwordHash);

    if (!valid) {
      await recordFailedLogin(email);
      await AuditRepository.log({ userId: user.id, action: 'login_failed', resource: 'user', ...clientMeta });
      throw new AppError('Credenciais inválidas', 401);
    }

    await clearFailedLogin(email);

    // Upgrade transparente do hash (ex.: 100k → 600k iterações) após login válido.
    if (needsRehash) {
      try {
        await UserRepository.update(user.id, { passwordHash: await hashPassword(password, user.passwordSalt) });
      } catch (err) {
        logger.warn({ userId: user.id, err }, 'Falha ao re-hashear senha (não bloqueia login)');
      }
    }

    if (user.totpEnabled && user.totpSecret) {
      return TotpService.createPendingLogin(user);
    }

    const tokens = signTokens(user);
    const expiresAt = new Date(Date.now() + sessionDurationMs);

    await SessionRepository.create({ userId: user.id, refreshToken: tokens.refreshToken, expiresAt, ...clientMeta });
    await AuditRepository.log({ userId: user.id, action: 'login', resource: 'user', ...clientMeta });

    logger.info({ userId: user.id }, 'Login realizado');
    return { ...tokens, user: publicUser(user) };
  },

  async refresh(refreshToken, clientMeta) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AppError('Refresh token inválido ou expirado', 401);
    }

    const session = await SessionRepository.findByToken(refreshToken);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      if (session && session.revokedAt) {
        // Token já revogado sendo reutilizado → forte indício de roubo.
        // Revoga TODA a família de sessões do usuário (defesa de rotação).
        await SessionRepository.revokeAllForUser(session.userId);
        await AuditRepository.log({
          userId: session.userId, action: 'refresh_reuse_detected', resource: 'session', resourceId: session.id, ...clientMeta,
        });
        logger.warn({ userId: session.userId, sessionId: session.id }, 'Reutilização de refresh token — todas as sessões revogadas');
      }
      throw new AppError('Sessão inválida', 401);
    }

    const user = await UserRepository.findById(payload.sub);
    if (!user || !user.active) throw new AppError('Usuário inativo', 401);

    const tokens = signTokens(user);
    const expiresAt = new Date(Date.now() + sessionDurationMs);

    await SessionRepository.rotateToken(session.id, {
      userId: user.id, refreshToken: tokens.refreshToken, expiresAt, ...clientMeta,
    });

    return tokens;
  },

  async logout(userId, refreshToken, clientMeta) {
    if (refreshToken) {
      await SessionRepository.revokeByUserAndToken(userId, refreshToken);
    }
    await AuditRepository.log({ userId, action: 'logout', resource: 'user', ...clientMeta });
  },

  /** Confirma a senha de um usuário autenticado (ex.: antes de exclusão de conta). */
  async checkPassword(userId, password) {
    const user = await UserRepository.findById(userId);
    if (!user) return false;
    const { valid } = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    return valid;
  },

  /**
   * Troca de senha autenticada: valida a senha atual, aplica hash forte e
   * revoga todas as sessões (força novo login em todos os dispositivos).
   */
  async changePassword(userId, currentPassword, newPassword, clientMeta) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError('Usuário não encontrado', 404);

    const { valid } = await verifyPassword(currentPassword, user.passwordSalt, user.passwordHash);
    if (!valid) throw new AppError('Senha atual incorreta', 401);

    const salt = randomBytes(saltLength).toString('hex');
    await UserRepository.update(userId, {
      passwordSalt: salt,
      passwordHash: await hashPassword(newPassword, salt),
    });

    await SessionRepository.revokeAllForUser(userId);
    await AuditRepository.log({ userId, action: 'password_changed', resource: 'user', ...clientMeta });
    logger.info({ userId }, 'Senha alterada');
  },

  // ─── Reset de senha ──────────────────────────────────────────
  /**
   * Inicia o fluxo de reset. Resposta SEMPRE genérica no chamador
   * (não revela se o e-mail existe). Enfileira e-mail com token de 1h.
   */
  async requestPasswordReset(email, clientMeta) {
    const user = await UserRepository.findByEmail(email);
    if (!user || !user.active) return; // silencioso — evita enumeração de contas

    await VerificationTokenRepository.deleteForUser(user.id, 'password_reset');
    const token = randomBytes(32).toString('hex');
    await VerificationTokenRepository.create({
      token, type: 'password_reset', userId: user.id,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });

    await enqueue(QUEUES.EMAIL, 'password-reset', {
      to: user.email,
      templateName: 'password-reset',
      data: { name: user.name, url: `${CONFIG.appUrl}/redefinir-senha?token=${token}`, expiresMin: 60 },
    });
    await AuditRepository.log({ userId: user.id, action: 'password_reset_requested', resource: 'user', ...clientMeta });
  },

  /** Conclui o reset: valida o token de uso único, troca a senha e revoga sessões. */
  async resetPassword(token, newPassword, clientMeta) {
    const rec = await VerificationTokenRepository.findValid(token, 'password_reset');
    if (!rec) throw new AppError('Token inválido ou expirado', 400);

    const salt = randomBytes(saltLength).toString('hex');
    await UserRepository.update(rec.userId, {
      passwordSalt: salt,
      passwordHash: await hashPassword(newPassword, salt),
    });
    await VerificationTokenRepository.consume(rec.id);
    await SessionRepository.revokeAllForUser(rec.userId);
    await AuditRepository.log({ userId: rec.userId, action: 'password_reset', resource: 'user', ...clientMeta });
    logger.info({ userId: rec.userId }, 'Senha redefinida via token');
  },

  // ─── Verificação de e-mail ───────────────────────────────────
  async sendVerificationEmail(user) {
    await VerificationTokenRepository.deleteForUser(user.id, 'email_verify');
    const token = randomBytes(32).toString('hex');
    await VerificationTokenRepository.create({
      token, type: 'email_verify', userId: user.id,
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    });
    await enqueue(QUEUES.EMAIL, 'email-verify', {
      to: user.email,
      templateName: 'email-verify',
      data: { name: user.name, url: `${CONFIG.appUrl}/verificar-email?token=${token}`, expiresHours: 24 },
    });
  },

  async verifyEmail(token) {
    const rec = await VerificationTokenRepository.findValid(token, 'email_verify');
    if (!rec) throw new AppError('Token inválido ou expirado', 400);
    await UserRepository.update(rec.userId, { emailVerified: true });
    await VerificationTokenRepository.consume(rec.id);
    logger.info({ userId: rec.userId }, 'E-mail verificado');
    return { verified: true };
  },
};
