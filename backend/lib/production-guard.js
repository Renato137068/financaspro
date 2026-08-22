// backend/lib/production-guard.js — validações de boot em produção
import CONFIG from '../config.js';

const DEV_SECRETS = new Set([
  'dev-access-secret',
  'dev-refresh-secret',
]);

/** Piso de comprimento para segredo HS256 — 32 chars ≈ 256 bits. */
const MIN_SECRET_LENGTH = 32;

/**
 * Falha cedo se produção estiver com defaults inseguros.
 * @throws {Error}
 */
export function assertProductionReady() {
  if (!CONFIG.isProd) return;

  if (!CONFIG.cors.origin || CONFIG.cors.origin === '*') {
    throw new Error('CORS_ORIGIN deve ser uma origem explícita em produção (sem wildcard)');
  }

  if (DEV_SECRETS.has(CONFIG.auth.accessSecret) || DEV_SECRETS.has(CONFIG.auth.refreshSecret)) {
    throw new Error('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET não podem usar valores de desenvolvimento em produção');
  }

  // Recusar os dois valores de dev pelo nome não impede o pior caso real:
  // alguém trocar por "senha123" e passar no guard. HS256 assina com o segredo
  // literal, então um segredo curto é quebrável por força bruta offline — quem
  // tiver um único token capturado forja qualquer outro, para qualquer usuário.
  // 32 caracteres é o piso prático para 256 bits de material.
  for (const [nome, valor] of [
    ['JWT_ACCESS_SECRET', CONFIG.auth.accessSecret],
    ['JWT_REFRESH_SECRET', CONFIG.auth.refreshSecret],
  ]) {
    if (!valor || String(valor).length < MIN_SECRET_LENGTH) {
      throw new Error(`${nome} deve ter ao menos ${MIN_SECRET_LENGTH} caracteres em produção`);
    }
  }

  // Segredos iguais fazem um refresh token valer como access token: o
  // `verifyAccessToken` só confere assinatura, issuer e audience, e o refresh
  // já carrega o mesmo `sub`. São dois segredos justamente para que o
  // vazamento de um não vire acesso completo.
  if (CONFIG.auth.accessSecret === CONFIG.auth.refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes entre si');
  }

  if (CONFIG.requireRedis && !process.env.REDIS_URL) {
    throw new Error('REDIS_URL obrigatório em produção');
  }
}

export default assertProductionReady;
