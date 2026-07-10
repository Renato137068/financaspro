// backend/lib/open-finance/belvo.js — adapter Belvo (Open Finance LATAM)
import CONFIG from '../../config.js';
import { AppError } from '../../domain/errors.js';

export function getBelvoBaseUrl() {
  const env = CONFIG.openFinance?.belvoEnvironment || 'sandbox';
  return env === 'production' ? 'https://api.belvo.com' : 'https://sandbox.belvo.com';
}

function authHeader() {
  const id = CONFIG.openFinance?.belvoSecretId;
  const pass = CONFIG.openFinance?.belvoSecretPassword;
  if (!id || !pass) return null;
  const token = Buffer.from(id + ':' + pass).toString('base64');
  return 'Basic ' + token;
}

export function isBelvoConfigured() {
  return !!(CONFIG.openFinance?.belvoSecretId && CONFIG.openFinance?.belvoSecretPassword);
}

/**
 * Token de acesso para o Hosted Widget Belvo.
 * @returns {Promise<{ access: string, widgetUrl: string }>}
 */
export async function createBelvoWidgetToken(userId) {
  const auth = authHeader();
  if (!auth) throw new AppError('Belvo não configurado (BELVO_SECRET_ID/PASSWORD)', 503);

  const base = getBelvoBaseUrl();
  const appUrl = (CONFIG.appUrl || 'http://localhost:4000').replace(/\/$/, '');

  const res = await fetch(base + '/api/token/', {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scopes: 'read_institutions,write_links,read_consents,write_consents',
      fetch_resources: ['ACCOUNTS', 'TRANSACTIONS'],
      stale_in: '300d',
      external_id: userId,
      widget: {
        purpose: 'Controle financeiro pessoal e importação de transações no FinançasPro.',
        openfinance_feature: 'consent_link_creation',
        locale: 'pt',
        country_codes: ['BR'],
        callback_urls: {
          success: appUrl + '/?belvo=success',
          exit: appUrl + '/?belvo=exit',
          event: appUrl + '/?belvo=event',
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError('Falha ao gerar token Belvo: ' + body.slice(0, 200), 502);
  }

  const data = await res.json();
  if (!data.access) throw new AppError('Resposta Belvo sem access token', 502);

  return {
    access: data.access,
    widgetUrl: buildBelvoWidgetUrl(data.access, userId),
  };
}

export function buildBelvoWidgetUrl(accessToken, userId) {
  const params = new URLSearchParams({
    access_token: accessToken,
    locale: 'pt',
    country_codes: 'BR',
    access_mode: 'recurrent',
    external_id: String(userId),
  });
  return 'https://widget.belvo.io/?' + params.toString();
}

/**
 * Remove link Belvo ao desconectar.
 */
export async function deleteBelvoLink(linkId) {
  const auth = authHeader();
  if (!auth || !linkId) return;
  const base = getBelvoBaseUrl();
  await fetch(base + '/api/links/' + encodeURIComponent(linkId) + '/', {
    method: 'DELETE',
    headers: { Authorization: auth },
  }).catch(function() { /* best-effort */ });
}

/**
 * Busca transações de um link Belvo e normaliza para importação.
 */
export async function fetchBelvoTransactions(linkId) {
  const auth = authHeader();
  if (!auth) throw new AppError('Belvo não configurado', 503);

  const base = getBelvoBaseUrl();
  const url = base + '/api/transactions/?link=' + encodeURIComponent(linkId);
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new AppError('Falha ao buscar transações Belvo', 502);

  const payload = await res.json();
  const rows = Array.isArray(payload) ? payload : (payload.results || []);

  return rows.map(function(row) {
    return {
      externalId: String(row.id),
      type: Number(row.amount) < 0 ? 'despesa' : 'receita',
      amount: Math.abs(Number(row.amount) || 0),
      category: row.category || 'outro',
      date: String(row.value_date || row.accounting_date || '').slice(0, 10),
      description: row.description || row.merchant?.name || 'Belvo',
    };
  }).filter(function(t) { return t.date && t.amount > 0; });
}

export const BELVO_PROVIDER = 'belvo';
