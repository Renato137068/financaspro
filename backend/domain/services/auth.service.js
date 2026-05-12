// backend/domain/services/auth.service.js
import { randomBytes, pbkdf2, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { UserRepository } from '../repositories/user.repository.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { signTokens, verifyRefreshToken, parseDurationMs } from '../../lib/jwt.js';
import { AppError } from '../errors.js';
import CONFIG from '../../config.js';
import logger from '../../lib/logger.js';

const { pbkdf2Iterations, saltLength, loginMaxAttempts, loginLockoutMs, refreshExpiresIn } = CONFIG.auth;
const pbkdf2Async = promisify(pbkdf2);
const sessionDurationMs = parseDurationMs(refreshExpiresIn);

// Rastreamento in-memory de tentativas de login falhadas por email
// Estrutura: Map<email, { count: number, lockedUntil: number | null }>
const _failedAttempts = new Map();

function isLockedOut(email) {
  const rec = _failedAttempts.get(email);
  if (!rec?.lockedUntil) return false;
  if (Date.now() < rec.lockedUntil) return true;
  // Lockout expirou — limpar
  _failedAttempts.delete(email);
  return false;
}

function recordFailedLogin(email) {
  const rec = _failedAttempts.get(email) ?? { count: 0, lockedUntil: null };
  rec.count++;
  if (rec.count >= loginMaxAttempts) {
    rec.lockedUntil = Date.now() + loginLockoutMs;
    rec.count = 0;
    logger.warn({ email }, 'Conta bloqueada temporariamente por tentativas excessivas');
  }
  _failedAttempts.set(email, rec);
}

function clearFailedLogin(email) {
  _failedAttempts.delete(email);
}

async function hashPassword(password, saltHex) {
  const buf = await pbkdf2Async(password, Buffer.from(saltHex, 'hex'), pbkdf2Iterations, 32, 'sha256');
  return buf.toString('hex');
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
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

    logger.info({ userId: user.id, email }, 'Novo usuário registrado');
    return publicUser(user);
  },

  async login(email, password, clientMeta) {
    // Verificar lockout antes de qualquer consulta ao banco
    if (isLockedOut(email)) {
      throw new AppError('Conta temporariamente bloqueada. Tente novamente em breve.', 429);
    }

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      recordFailedLogin(email);
      throw new AppError('Credenciais inválidas', 401);
    }
    if (!user.active) throw new AppError('Conta desativada', 403);

    const candidate = await hashPassword(password, user.passwordSalt);
    const valid = timingSafeEqual(
      Buffer.from(candidate, 'hex'),
      Buffer.from(user.passwordHash, 'hex'),
    );

    if (!valid) {
      recordFailedLogin(email);
      await AuditRepository.log({ userId: user.id, action: 'login_failed', resource: 'user', ...clientMeta });
      throw new AppError('Credenciais inválidas', 401);
    }

    clearFailedLogin(email);

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
      if (session) {
        // Token válido mas sessão revogada — possível reutilização; auditar
        await AuditRepository.log({
          userId: session.userId, action: 'refresh_reuse_detected', resource: 'session', resourceId: session.id, ...clientMeta,
        });
        logger.warn({ userId: session.userId, sessionId: session.id }, 'Possível reutilização de refresh token');
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
};
