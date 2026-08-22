/**
 * openapi-coverage.test.js — a referência da API não pode ficar para trás do código.
 *
 * O spec era mantido à mão e cobria 17 dos 74 endpoints: toda a superfície SaaS
 * (/orgs, /billing, /open-finance) ficava de fora, justamente a parte que um
 * integrador consumiria. Ninguém percebeu porque nada comparava as duas coisas.
 *
 * Este teste compara. Rota nova sem entrada no spec derruba o CI no mesmo PR
 * que a introduz — que é o único momento em que documentar custa barato.
 */
import { readFileSync } from 'fs';
import { listarRotas, paraOpenApi } from '../../scripts/lib/api-routes.mjs';

const spec = JSON.parse(readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8'));
const rotas = listarRotas();

/** "GET /orgs/{orgId}" — como aparece nas mensagens de erro. */
const rotulo = (r) => `${r.method} ${r.path}`;

const documentadas = new Set(
  Object.entries(spec.paths).flatMap(([caminho, ops]) =>
    Object.keys(ops).map((m) => `${m.toUpperCase()} ${caminho}`)),
);

describe('cobertura do OpenAPI', () => {
  test('o inventário de rotas não veio vazio (a regex ainda casa o código)', () => {
    // Se a forma de declarar rotas mudar, o extrator devolveria zero e este
    // arquivo passaria a aprovar tudo em silêncio — pior que não existir.
    expect(rotas.length).toBeGreaterThan(60);
  });

  test('toda rota da API está documentada em docs/openapi.json', () => {
    const faltando = rotas.filter((r) => !documentadas.has(rotulo(r))).map(rotulo);

    expect(faltando).toEqual([]);
  });

  test('o spec não documenta rota que não existe mais', () => {
    const reais = new Set(rotas.map(rotulo));
    const fantasmas = [...documentadas].filter((d) => !reais.has(d));

    expect(fantasmas).toEqual([]);
  });

  test('paraOpenApi converte parâmetros de caminho do Express', () => {
    expect(paraOpenApi('/orgs/:orgId/members/:userId')).toBe('/orgs/{orgId}/members/{userId}');
    expect(paraOpenApi('/transactions')).toBe('/transactions');
  });

  test('todo endpoint autenticado declara o esquema de segurança', () => {
    // Rotas públicas por natureza: entrar, recuperar senha, listar planos, ver
    // saúde. Qualquer outra sem `security` no spec é sinal de doc errada — ou,
    // pior, de rota que esqueceram de proteger.
    const PUBLICAS = new Set([
      'POST /auth/register', 'POST /auth/login', 'POST /auth/refresh', 'POST /auth/logout',
      'POST /auth/forgot-password', 'POST /auth/reset-password', 'POST /auth/verify-email',
      'POST /auth/resend-verification', 'POST /auth/totp/verify',
      'GET /billing/plans', 'GET /health',
    ]);

    const semSeguranca = [];
    for (const [caminho, ops] of Object.entries(spec.paths)) {
      for (const [m, op] of Object.entries(ops)) {
        const id = `${m.toUpperCase()} ${caminho}`;
        if (PUBLICAS.has(id)) continue;
        if (!op.security) semSeguranca.push(id);
      }
    }

    expect(semSeguranca).toEqual([]);
  });
});
