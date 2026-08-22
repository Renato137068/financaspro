/**
 * csrf.test.js — guarda de origem para requisições autenticadas por cookie.
 *
 * A pergunta que cada teste responde: "um site hostil consegue disparar esta
 * requisição no navegador da vítima e ter o cookie de sessão anexado?"
 */
import { jest } from '@jest/globals';
import { mockRes } from './helpers/mocks.js';

const ORIGEM_BOA = 'https://app.financaspro.com';
const ORIGEM_MA = 'https://site-malicioso.example';

let csrfGuard, origemDaRequisicao, autenticadoPorCookie;

/** Recarrega o middleware com uma allowlist de CORS específica. */
async function carregarCom({ corsOrigin, isProd = false }) {
  jest.resetModules();
  process.env.CORS_ORIGIN = corsOrigin;
  process.env.NODE_ENV = isProd ? 'production' : 'test';
  if (isProd) {
    process.env.DATABASE_URL = 'postgresql://x:y@localhost:5432/z';
    process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
  }
  ({ csrfGuard, origemDaRequisicao, autenticadoPorCookie } = await import('../../backend/middleware/csrf.js'));
}

/** Requisição sintética no formato que o Express entrega ao middleware. */
function req({ method = 'POST', origin, referer, cookie, authorization } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (referer) headers.referer = referer;
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  return { method, headers };
}

function run(r) {
  const res = mockRes();
  const next = jest.fn();
  csrfGuard(r, res, next);
  return { res, next, passou: next.mock.calls.length === 1 };
}

const COOKIE_SESSAO = 'fp_access_token=abc123';

afterAll(() => {
  delete process.env.CORS_ORIGIN;
  process.env.NODE_ENV = 'test';
});

describe('csrfGuard — métodos seguros', () => {
  beforeEach(() => carregarCom({ corsOrigin: ORIGEM_BOA }));

  test.each(['GET', 'HEAD', 'OPTIONS'])('%s passa sem checagem de origem', method => {
    expect(run(req({ method, cookie: COOKIE_SESSAO, origin: ORIGEM_MA })).passou).toBe(true);
  });
});

describe('csrfGuard — autenticação por cookie', () => {
  beforeEach(() => carregarCom({ corsOrigin: ORIGEM_BOA }));

  test('POST de origem confiável passa', () => {
    expect(run(req({ origin: ORIGEM_BOA, cookie: COOKIE_SESSAO })).passou).toBe(true);
  });

  test('POST de origem hostil é bloqueado com 403', () => {
    const { res, passou } = run(req({ origin: ORIGEM_MA, cookie: COOKIE_SESSAO }));

    expect(passou).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/não confiável/i);
  });

  test.each(['PUT', 'PATCH', 'DELETE'])('%s de origem hostil é bloqueado', method => {
    expect(run(req({ method, origin: ORIGEM_MA, cookie: COOKIE_SESSAO })).passou).toBe(false);
  });

  test('cookie de refresh também conta como sessão', () => {
    expect(run(req({ origin: ORIGEM_MA, cookie: 'fp_refresh_token=xyz' })).passou).toBe(false);
  });

  test('cai para o Referer quando não há Origin', () => {
    expect(run(req({ referer: `${ORIGEM_MA}/pagina`, cookie: COOKIE_SESSAO })).passou).toBe(false);
    expect(run(req({ referer: `${ORIGEM_BOA}/dashboard`, cookie: COOKIE_SESSAO })).passou).toBe(true);
  });

  test('Origin "null" (sandbox de iframe) não é aceito como válido', () => {
    // Um <iframe sandbox> hostil envia Origin: null — tratar como ausente
    // faz o fluxo cair na regra mais restritiva.
    const { passou } = run(req({ origin: 'null', referer: `${ORIGEM_MA}/x`, cookie: COOKIE_SESSAO }));
    expect(passou).toBe(false);
  });
});

describe('csrfGuard — autenticação por Bearer', () => {
  beforeEach(() => carregarCom({ corsOrigin: ORIGEM_BOA }));

  test('Bearer puro passa mesmo sem Origin — navegador não o envia sozinho', () => {
    expect(run(req({ authorization: 'Bearer token-abc' })).passou).toBe(true);
  });

  test('Bearer de origem hostil passa (não há CSRF sem cookie)', () => {
    expect(run(req({ authorization: 'Bearer token-abc', origin: ORIGEM_MA })).passou).toBe(true);
  });

  test('Bearer ACOMPANHADO de cookie ainda é verificado', () => {
    // Cenário real: o navegador anexa o cookie automaticamente e o atacante
    // não controla o header. Se o cookie está presente, a checagem vale.
    const { passou } = run(req({
      authorization: 'Bearer token-abc', origin: ORIGEM_MA, cookie: COOKIE_SESSAO,
    }));
    expect(passou).toBe(false);
  });

  test('requisição anônima (sem cookie e sem Bearer) passa — 401 é problema do auth', () => {
    expect(run(req({ origin: ORIGEM_MA })).passou).toBe(true);
  });
});

describe('csrfGuard — ausência de Origin e Referer', () => {
  test('em desenvolvimento, passa (curl e testes locais não enviam Origin)', async () => {
    await carregarCom({ corsOrigin: ORIGEM_BOA, isProd: false });
    expect(run(req({ cookie: COOKIE_SESSAO })).passou).toBe(true);
  });

  test('em produção, recusa requisição com cookie e sem origem', async () => {
    await carregarCom({ corsOrigin: ORIGEM_BOA, isProd: true });
    const { res, passou } = run(req({ cookie: COOKIE_SESSAO }));

    expect(passou).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});

describe('csrfGuard — allowlist com múltiplas origens', () => {
  beforeEach(() => carregarCom({ corsOrigin: `${ORIGEM_BOA},https://admin.financaspro.com` }));

  test('aceita qualquer origem da lista', () => {
    expect(run(req({ origin: ORIGEM_BOA, cookie: COOKIE_SESSAO })).passou).toBe(true);
    expect(run(req({ origin: 'https://admin.financaspro.com', cookie: COOKIE_SESSAO })).passou).toBe(true);
  });

  test('subdomínio fora da lista continua bloqueado', () => {
    // "same-site" para o cookie, mas não confiável: previews e páginas de
    // cliente em subdomínios são um vetor real.
    expect(run(req({ origin: 'https://preview.financaspro.com', cookie: COOKIE_SESSAO })).passou).toBe(false);
  });
});

describe('helpers exportados', () => {
  beforeEach(() => carregarCom({ corsOrigin: ORIGEM_BOA }));

  test('origemDaRequisicao prioriza Origin sobre Referer', () => {
    expect(origemDaRequisicao(req({ origin: ORIGEM_BOA, referer: `${ORIGEM_MA}/x` }))).toBe(ORIGEM_BOA);
  });

  test('origemDaRequisicao devolve null sem nenhum dos dois', () => {
    expect(origemDaRequisicao(req({}))).toBeNull();
  });

  test('origemDaRequisicao ignora Referer malformado', () => {
    expect(origemDaRequisicao(req({ referer: 'nao-e-url' }))).toBeNull();
  });

  test('autenticadoPorCookie detecta o cookie no meio de outros', () => {
    expect(autenticadoPorCookie(req({ cookie: 'tema=dark; fp_access_token=abc; lang=pt' }))).toBe(true);
    expect(autenticadoPorCookie(req({ cookie: 'tema=dark; lang=pt' }))).toBe(false);
    expect(autenticadoPorCookie(req({}))).toBe(false);
  });
});
