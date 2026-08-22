// backend/middleware/csrf.js — defesa em profundidade contra CSRF
import CONFIG from '../config.js';
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from '../lib/authCookies.js';

/**
 * Bloqueia requisições que alteram estado quando a autenticação vem de COOKIE
 * e a origem não é confiável.
 *
 * Por que não basta SameSite=Lax:
 *   1. Lax permite navegação de topo com GET — e qualquer rota que altere
 *      estado por GET (ou um redirect mal configurado) fica exposta.
 *   2. Navegadores antigos ainda em uso ignoram o atributo por completo.
 *   3. Subdomínios do mesmo site são "same-site" para o cookie, mas podem ser
 *      controlados por terceiros (páginas de cliente, previews, CDN).
 * Verificar Origin/Referer contra a allowlist fecha os três casos com uma
 * checagem barata, feita inteiramente no servidor.
 *
 * Requisições autenticadas por `Authorization: Bearer` são liberadas: o
 * navegador não anexa esse header automaticamente, então não há CSRF possível
 * — é o mesmo motivo pelo qual APIs puramente Bearer dispensam token CSRF.
 */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Origens aceitas: a allowlist de CORS mais a própria URL pública do app. */
function origensPermitidas() {
  const lista = new Set();
  const cors = CONFIG.cors.origin;

  if (cors && cors !== '*') {
    String(cors).split(',').map(s => s.trim()).filter(Boolean).forEach(o => lista.add(o));
  }
  for (const key of ['appUrl', 'publicUrl']) {
    const raw = CONFIG[key];
    if (!raw) continue;
    try { lista.add(new URL(raw).origin); } catch { /* URL inválida no env */ }
  }
  return lista;
}

/** Deriva a origem da requisição a partir de Origin ou, na falta, do Referer. */
export function origemDaRequisicao(req) {
  const origin = req.headers.origin;
  if (origin && origin !== 'null') return origin;

  const referer = req.headers.referer || req.headers.referrer;
  if (!referer) return null;
  try { return new URL(referer).origin; } catch { return null; }
}

/** true quando o pedido carrega cookie de sessão (e portanto é atacável por CSRF). */
export function autenticadoPorCookie(req) {
  const cookies = parseCookies(req);
  return Boolean(cookies[ACCESS_COOKIE] || cookies[REFRESH_COOKIE]);
}

export function csrfGuard(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  // Bearer explícito: sem risco de CSRF, o navegador não o envia sozinho.
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ') && !autenticadoPorCookie(req)) return next();

  if (!autenticadoPorCookie(req)) return next();

  const permitidas = origensPermitidas();

  // Em desenvolvimento a allowlist costuma ser '*'; não faz sentido bloquear
  // o próprio ambiente local do desenvolvedor.
  if (!permitidas.size) {
    if (!CONFIG.isProd) return next();
    return res.status(403).json({ error: 'Origem não confiável' });
  }

  const origem = origemDaRequisicao(req);

  // Sem Origin nem Referer com cookie de sessão: em produção, recusa.
  // Navegadores enviam Origin em toda requisição cross-site que altera estado,
  // então a ausência é anômala o bastante para tratar como hostil.
  if (!origem) {
    if (!CONFIG.isProd) return next();
    return res.status(403).json({ error: 'Origem ausente em requisição autenticada por cookie' });
  }

  if (!permitidas.has(origem)) {
    return res.status(403).json({ error: 'Origem não confiável' });
  }

  return next();
}

export default csrfGuard;
