// backend/lib/billing-urls.js — validação de URLs de retorno do Stripe (anti-open-redirect)
import CONFIG from '../config.js';
import { AppError } from '../domain/errors.js';

function normalizeOrigin(raw) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Origens permitidas para successUrl, cancelUrl e returnUrl. */
export function allowedBillingOrigins() {
  const origins = new Set();
  const appUrl = process.env.APP_URL || CONFIG.appUrl;
  const base = normalizeOrigin(appUrl);
  if (base) origins.add(base);

  const extra = process.env.BILLING_ALLOWED_ORIGINS || '';
  extra.split(',').map((s) => s.trim()).filter(Boolean).forEach((entry) => {
    const o = normalizeOrigin(entry);
    if (o) origins.add(o);
  });

  return [...origins];
}

/**
 * Rejeita URLs de redirecionamento fora dos domínios configurados.
 * @param {string} url
 */
export function assertAllowedRedirectUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ''));
  } catch {
    throw new AppError('URL de retorno inválida', 400);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AppError('URL de retorno deve ser HTTP(S)', 400);
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  if (!allowedBillingOrigins().includes(origin)) {
    throw new AppError('URL de retorno não permitida para esta aplicação', 400);
  }
}
