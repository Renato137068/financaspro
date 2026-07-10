// backend/domain/services/totp.service.js
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { pbkdf2 } from 'crypto';
import { UserRepository } from '../repositories/user.repository.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { AuditRepository } from '../repositories/audit.repository.js';
import { AppError } from '../errors.js';
import CONFIG from '../../config.js';
import logger from '../../lib/logger.js';
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  qrDataUrl,
  verifyTotpCode,
} from '../../lib/totp.js';
import { encryptField, decryptField } from '../../lib/field-crypto.js';
import { signTokens, parseDurationMs } from '../../lib/jwt.js';

const pbkdf2Async = promisify(pbkdf2);
const { accessSecret, pbkdf2Iterations, refreshExpiresIn, issuer, audience } = CONFIG.auth;
const sessionDurationMs = parseDurationMs(refreshExpiresIn);

async function hashPassword(password, saltHex) {
  const buf = await pbkdf2Async(password, Buffer.from(saltHex, 'hex'), pbkdf2Iterations, 32, 'sha256');
  return buf.toString('hex');
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

function signPendingTotpToken(userId) {
  return jwt.sign(
    { sub: userId, purpose: 'totp_pending' },
    accessSecret,
    { expiresIn: '5m', algorithm: 'HS256', issuer, audience },
  );
}

function verifyPendingTotpToken(token) {
  const payload = jwt.verify(token, accessSecret, { algorithms: ['HS256'], issuer, audience });
  if (payload.purpose !== 'totp_pending') throw new AppError('Token inválido', 401);
  return payload.sub;
}

function readTotpSecret(user) {
  return decryptField(user?.totpSecret);
}

export const TotpService = {
  async getStatus(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError('Usuário não encontrado', 404);
    return { enabled: !!user.totpEnabled, pendingSetup: !!(user.totpSecret && !user.totpEnabled) };
  },

  async setup(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError('Usuário não encontrado', 404);
    if (user.totpEnabled) throw new AppError('2FA já está ativo', 400);

    const secret = generateTotpSecret();
    await UserRepository.update(userId, { totpSecret: encryptField(secret), totpEnabled: false });

    const otpauthUrl = buildOtpAuthUrl(user.email, secret);
    const qrCode = await qrDataUrl(otpauthUrl);

    return { secret, otpauthUrl, qrCode };
  },

  async enable(userId, code) {
    const user = await UserRepository.findById(userId);
    if (!user?.totpSecret) throw new AppError('Configure o 2FA antes de ativar', 400);
    const secret = readTotpSecret(user);
    if (!verifyTotpCode(secret, code)) {
      throw new AppError('Código inválido ou expirado', 401);
    }

    await UserRepository.update(userId, { totpEnabled: true });
    await AuditRepository.log({ userId, action: 'totp_enabled', resource: 'user', resourceId: userId });
    logger.info({ userId }, '2FA TOTP ativado');
    return { enabled: true };
  },

  async disable(userId, code, password) {
    const user = await UserRepository.findById(userId);
    if (!user?.totpEnabled) throw new AppError('2FA não está ativo', 400);

    const candidate = await hashPassword(password, user.passwordSalt);
    const valid = timingSafeEqual(
      Buffer.from(candidate, 'hex'),
      Buffer.from(user.passwordHash, 'hex'),
    );
    if (!valid) throw new AppError('Senha incorreta', 401);
    if (!verifyTotpCode(readTotpSecret(user), code)) {
      throw new AppError('Código inválido ou expirado', 401);
    }

    await UserRepository.update(userId, { totpEnabled: false, totpSecret: null });
    await AuditRepository.log({ userId, action: 'totp_disabled', resource: 'user', resourceId: userId });
    return { enabled: false };
  },

  createPendingLogin(user) {
    return {
      requiresTotp: true,
      pendingToken: signPendingTotpToken(user.id),
      user: publicUser(user),
    };
  },

  async verifyLogin(pendingToken, code, clientMeta) {
    const userId = verifyPendingTotpToken(pendingToken);
    const user = await UserRepository.findById(userId);
    if (!user?.active || !user.totpEnabled || !user.totpSecret) {
      throw new AppError('Sessão inválida', 401);
    }
    if (!verifyTotpCode(readTotpSecret(user), code)) {
      await AuditRepository.log({ userId, action: 'totp_login_failed', resource: 'user', ...clientMeta });
      throw new AppError('Código inválido ou expirado', 401);
    }

    const tokens = signTokens(user);
    const expiresAt = new Date(Date.now() + sessionDurationMs);
    await SessionRepository.create({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      expiresAt,
      ...clientMeta,
    });
    await AuditRepository.log({ userId, action: 'login', resource: 'user', ...clientMeta });

    return { ...tokens, user: publicUser(user) };
  },
};
