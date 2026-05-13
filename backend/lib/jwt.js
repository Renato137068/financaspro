// backend/lib/jwt.js — gestão de tokens JWT (access + refresh)
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import CONFIG from '../config.js';

const { accessSecret, refreshSecret, accessExpiresIn, refreshExpiresIn, issuer, audience } = CONFIG.auth;

// Converte strings como '7d', '15m', '1h' em milissegundos
export function parseDurationMs(str) {
  const units = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const match = String(str).match(/^(\d+)([smhd])$/);
  return match ? parseInt(match[1]) * units[match[2]] : 7 * 86_400_000;
}

/**
 * Gera um par de tokens para o usuário autenticado.
 * Access token inclui jti para rastreabilidade; refresh token é single-use via rotação de sessão.
 * @param {{ id: string, role: string }} user
 */
export function signTokens(user) {
  const jti = randomUUID();
  const payload = { sub: user.id, role: user.role, jti };

  const accessToken = jwt.sign(payload, accessSecret, {
    expiresIn: accessExpiresIn,
    algorithm: 'HS256',
    issuer,
    audience,
  });

  const refreshToken = jwt.sign({ sub: user.id }, refreshSecret, {
    expiresIn: refreshExpiresIn,
    algorithm: 'HS256',
    issuer,
  });

  return { accessToken, refreshToken };
}

/**
 * Verifica e decodifica um access token.
 * Valida algoritmo, issuer e audience — rejeita tokens de outros ambientes.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret, { algorithms: ['HS256'], issuer, audience });
}

/**
 * Verifica e decodifica um refresh token.
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, refreshSecret, { algorithms: ['HS256'], issuer });
}

/**
 * Retorna o timestamp (ms) de expiração do próximo refresh token.
 * Calculado direto a partir do config — sem assinar tokens dummy.
 */
export function refreshTokenExpiry() {
  return Date.now() + parseDurationMs(refreshExpiresIn);
}

/**
 * Retorna SHA-256 hex de um token.
 * Usado para armazenar refresh tokens sem expor o valor original no banco.
 */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
