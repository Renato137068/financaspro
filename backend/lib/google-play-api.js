// backend/lib/google-play-api.js
//
// Cliente enxuto da Google Play Developer API (Android Publisher v3).
// Faz o fluxo OAuth2 de conta de serviço (JWT bearer) sem depender do
// pacote `googleapis` — usa apenas `jsonwebtoken` (já instalado) e o
// `fetch` nativo do Node 18+. Objetivo único: verificar assinaturas via
// `purchases.subscriptionsv2.get` para liberar entitlement no backend.
import jwt from 'jsonwebtoken';
import logger from './logger.js';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

// Cache de access token por client_email (evita 1 round-trip OAuth por verificação).
const _tokenCache = new Map();

function parseServiceAccount(raw) {
  if (!raw) return null;
  let json = raw;
  if (typeof raw === 'string') {
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!json || !json.client_email || !json.private_key) return null;
  return json;
}

/** Obtém (e cacheia) um access token OAuth2 a partir da conta de serviço. */
async function getAccessToken(sa) {
  const cached = _tokenCache.get(sa.client_email);
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;

  const tokenUri = sa.token_uri || DEFAULT_TOKEN_URI;
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: SCOPE,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: 'RS256' },
  );

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.error({ status: res.status, detail: detail.slice(0, 300) }, 'Falha ao obter token OAuth Google Play');
    const err = new Error('google-play-auth-falhou');
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const token = data.access_token;
  const expiresIn = Number(data.expires_in) || 3600;
  _tokenCache.set(sa.client_email, { token, exp: now + expiresIn });
  return token;
}

/**
 * Consulta o estado real de uma assinatura no Google Play.
 * @param {object} opts
 * @param {string|object} opts.serviceAccountJson  JSON da conta de serviço (string ou objeto)
 * @param {string} opts.packageName  ex.: com.financaspro.mobile
 * @param {string} opts.purchaseToken  token retornado pela compra no app
 * @returns {Promise<{ state: string, productId: string|null, expiryTime: string|null, entitled: boolean, raw: object }>}
 */
export async function getSubscriptionV2({ serviceAccountJson, packageName, purchaseToken }) {
  const sa = parseServiceAccount(serviceAccountJson);
  if (!sa) {
    const err = new Error('service-account-invalida');
    err.status = 500;
    throw err;
  }

  const accessToken = await getAccessToken(sa);
  const url = `${API_BASE}/applications/${encodeURIComponent(packageName)}`
    + `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404 || res.status === 410) {
    const err = new Error('assinatura-nao-encontrada');
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.error({ status: res.status, detail: detail.slice(0, 300) }, 'Falha na Google Play Developer API');
    const err = new Error('google-play-api-falhou');
    err.status = 502;
    throw err;
  }

  const raw = await res.json();
  const lineItems = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  // Maior expiryTime entre os itens da assinatura.
  let expiryTime = null;
  let productId = null;
  for (const item of lineItems) {
    if (item.productId && !productId) productId = item.productId;
    if (item.expiryTime && (!expiryTime || item.expiryTime > expiryTime)) {
      expiryTime = item.expiryTime;
    }
  }

  const state = raw.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED';
  return {
    state,
    productId,
    expiryTime,
    entitled: isEntitledState(state, expiryTime),
    cancelAtPeriodEnd: isCancelAtPeriodEnd(state, raw),
    raw,
  };
}

/**
 * Regra de acesso: concede se o período pago ainda não terminou e o estado
 * não é um bloqueio duro. CANCELED mantém acesso até o fim do ciclo já pago.
 */
export function isEntitledState(state, expiryTime) {
  const denied = new Set([
    'SUBSCRIPTION_STATE_EXPIRED',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_PAUSED',
    'SUBSCRIPTION_STATE_PENDING',
    'SUBSCRIPTION_STATE_UNSPECIFIED',
  ]);
  if (denied.has(state)) return false;
  if (!expiryTime) return false;
  return new Date(expiryTime).getTime() > Date.now();
}

/** Cancelou na loja / auto-renew off, mas ainda pode estar no período pago. */
export function isCancelAtPeriodEnd(state, raw) {
  if (state === 'SUBSCRIPTION_STATE_CANCELED') return true;
  if (raw && raw.canceledStateContext) return true;
  const lineItems = Array.isArray(raw && raw.lineItems) ? raw.lineItems : [];
  for (const item of lineItems) {
    const plan = item && item.autoRenewingPlan;
    if (plan && plan.autoRenewEnabled === false) return true;
  }
  return false;
}

// Exposto para testes.
export const _internal = { parseServiceAccount, isCancelAtPeriodEnd };
