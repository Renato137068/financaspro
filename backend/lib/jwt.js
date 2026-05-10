// backend/lib/jwt.js — gestão de tokens JWT (access + refresh)
import jwt from 'jsonwebtoken';
import CONFIG from '../config.js';

const { accessSecret, refreshSecret, accessExpiresIn, refreshExpiresIn } = CONFIG.auth;

/**
 * Gera um par de tokens para o usuário autenticado.
 * @param {{ id: string, role: string }} user
 */
export function signTokens(user) {
  const payload = { sub: user.id, role: user.role };

  const accessToken = jwt.sign(payload, accessSecret, {
    expiresIn: accessExpiresIn,
    algorithm: 'HS256',
  });

  const refreshToken = jwt.sign({ sub: user.id }, refreshSecret, {
    expiresIn: refreshExpiresIn,
    algorithm: 'HS256',
  });

  return { accessToken, refreshToken };
}

/**
 * Verifica e decodifica um access token.
 * Lança erro se inválido ou expirado.
 */
export function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret, { algorithms: ['HS256'] });
}

/**
 * Verifica e decodifica um refresh token.
 * Lança erro se inválido ou expirado.
 */
export function verifyRefreshToken(token) {
  return jwt.verify(token, refreshSecret, { algorithms: ['HS256'] });
}

/**
 * Retorna a data de expiração do refresh token em milissegundos.
 */
export function refreshTokenExpiry() {
  const decoded = jwt.decode(jwt.sign({}, refreshSecret, { expiresIn: refreshExpiresIn }));
  return decoded.exp * 1000;
}
