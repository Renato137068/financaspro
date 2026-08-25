/**
 * routes.http.test.js — a cadeia de middlewares exercitada de ponta a ponta.
 *
 * Os testes de serviço provam que a regra de negócio está certa. Estes provam
 * que ela é *alcançada na ordem correta*: autenticar antes de autorizar,
 * autorizar antes de validar, validar antes de tocar o banco. Erros de ordem
 * não aparecem em teste de unidade — aparecem como bypass em produção.
 *
 * Roda contra a pilha Express real com um Prisma em memória
 * (scripts/lib/prisma-fake.mjs), o mesmo duplo usado pelos testes de
 * integração HTTP. Sem Postgres, sem Docker.
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

// Precisa estar montado antes de qualquer import do backend: CONFIG é lido uma
// única vez, no import.
process.env.RATE_LIMIT_MAX = '100000';
process.env.RATE_LIMIT_AUTH_MAX = '100000';
process.env.LOGIN_MAX_ATTEMPTS = '10000';

const prisma = createPrismaFake();

// Substitui o singleton inteiro em vez de injetar em globalThis: backend/lib/db.js
// importa @prisma/client no topo, e esse pacote só existe depois de um
// `prisma generate` — dependência que travaria a suíte unitária num binário
// nativo baixado da internet.
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

const { createApp } = await import('../../backend/app.js');
const { signTokens } = await import('../../backend/lib/jwt.js');

const app = createApp();

const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UUID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';

/** Cria o usuário no store e devolve o header Authorization já montado. */
function comoUsuario({ id = UUID_A, role = 'USER', active = true } = {}) {
  prisma.user.create({
    data: { id, name: 'Teste', email: `${id}@example.com`, role, active },
  });
  const { accessToken } = signTokens({ id, role });
  return `Bearer ${accessToken}`;
}

beforeEach(() => {
  prisma.__reset();
});

// ─── autenticação ────────────────────────────────────────────────────────────
describe('cadeia de middlewares — autenticação', () => {
  const protegidas = [
    ['get', '/api/v1/transactions'],
    ['post', '/api/v1/transactions'],
    ['get', '/api/v1/accounts'],
    ['get', '/api/v1/budgets'],
    ['get', '/api/v1/recorrentes'],
    ['get', '/api/v1/state'],
    ['get', '/api/v1/users/me'],
    ['get', '/api/v1/orgs'],
  ];

  test.each(protegidas)('%s %s exige token', async (metodo, rota) => {
    const res = await request(app)[metodo](rota);
    expect(res.status).toBe(401);
  });

  test('token malformado é rejeitado', async () => {
    const res = await request(app).get('/api/v1/transactions').set('Authorization', 'Bearer nao-e-jwt');
    expect(res.status).toBe(401);
  });

  test('token assinado com outro segredo é rejeitado', async () => {
    // Simula token de outro ambiente apontando para a mesma API.
    const alheio = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4In0.assinatura-errada';
    const res = await request(app).get('/api/v1/transactions').set('Authorization', alheio);
    expect(res.status).toBe(401);
  });

  test('usuário do token que não existe mais devolve 401', async () => {
    const { accessToken } = signTokens({ id: UUID_B, role: 'USER' });
    const res = await request(app).get('/api/v1/transactions').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });

  test('conta desativada devolve 403, não 401', async () => {
    const auth = comoUsuario({ active: false });
    const res = await request(app).get('/api/v1/transactions').set('Authorization', auth);
    expect(res.status).toBe(403);
  });
});

// ─── ordem: auth antes de validação ──────────────────────────────────────────
describe('cadeia de middlewares — ordem de execução', () => {
  test('corpo inválido SEM token devolve 401, não 422', async () => {
    // Se a validação rodasse antes da autenticação, um anônimo conseguiria
    // mapear o schema da API testando payloads.
    const res = await request(app).post('/api/v1/transactions').send({ lixo: true });
    expect(res.status).toBe(401);
  });

  test('path param inválido SEM token devolve 401, não 400', async () => {
    const res = await request(app).get('/api/v1/transactions/nao-e-uuid');
    expect(res.status).toBe(401);
  });

  test('permissão insuficiente é checada antes da validação do corpo', async () => {
    // VIEWER mandando corpo inválido deve levar 403 (autorização), não 422.
    const auth = comoUsuario({ role: 'VIEWER' });
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({ lixo: true });
    expect(res.status).toBe(403);
  });
});

// ─── autorização (RBAC) ──────────────────────────────────────────────────────
describe('cadeia de middlewares — RBAC', () => {
  test('VIEWER lê transações', async () => {
    const auth = comoUsuario({ role: 'VIEWER' });
    const res = await request(app).get('/api/v1/transactions').set('Authorization', auth);
    expect(res.status).toBe(200);
  });

  test('VIEWER não escreve transações', async () => {
    const auth = comoUsuario({ role: 'VIEWER' });
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({
      type: 'despesa', amount: 10, description: 'x', category: 'y',
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(403);
    expect(res.body.required).toBe('transactions:write');
  });

  test('VIEWER não deleta', async () => {
    const auth = comoUsuario({ role: 'VIEWER' });
    const res = await request(app).delete(`/api/v1/transactions/${UUID_B}`).set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  test('USER comum não acessa a listagem administrativa', async () => {
    const auth = comoUsuario({ role: 'USER' });
    const res = await request(app).get('/api/v1/users').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  test('ADMIN acessa a listagem administrativa', async () => {
    const auth = comoUsuario({ role: 'ADMIN' });
    const res = await request(app).get('/api/v1/users').set('Authorization', auth);
    expect(res.status).toBe(200);
  });
});

// ─── validação de path param ─────────────────────────────────────────────────
describe('cadeia de middlewares — path params', () => {
  const rotasComId = [
    ['get', '/api/v1/transactions'],
    ['get', '/api/v1/accounts'],
    ['get', '/api/v1/budgets'],
    ['get', '/api/v1/recorrentes'],
  ];

  test.each(rotasComId)('%s %s/:id rejeita id não-UUID com 400', async (metodo, base) => {
    const auth = comoUsuario();
    const res = await request(app)[metodo](`${base}/../../etc/passwd`).set('Authorization', auth);
    expect([400, 404]).toContain(res.status);
  });

  test('id numérico devolve 400 com detalhe do campo', async () => {
    const auth = comoUsuario();
    const res = await request(app).get('/api/v1/transactions/12345').set('Authorization', auth);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/i);
    expect(res.body.fields.id).toBeDefined();
  });

  test('UUID válido passa da validação (404 do serviço, não 400)', async () => {
    const auth = comoUsuario();
    const res = await request(app).get(`/api/v1/transactions/${UUID_B}`).set('Authorization', auth);

    expect(res.status).not.toBe(400);
  });
});

// ─── validação de corpo ──────────────────────────────────────────────────────
describe('cadeia de middlewares — corpo', () => {
  let auth;
  beforeEach(() => { auth = comoUsuario(); });

  test('corpo vazio devolve 422 com campos faltantes', async () => {
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({});

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Dados inválidos');
    expect(Object.keys(res.body.fields).length).toBeGreaterThan(0);
  });

  test('valor negativo é recusado', async () => {
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({
      type: 'despesa', amount: -50, description: 'x', category: 'y',
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(422);
    expect(res.body.fields.amount).toBeDefined();
  });

  test('transferencia válida é criada com accountId e targetAccountId', async () => {
    const ACC_ORIGEM = '11111111-1111-4111-8111-111111111111';
    const ACC_DESTINO = '22222222-2222-4222-8222-222222222222';
    prisma.account.create({
      data: { id: ACC_ORIGEM, userId: UUID_A, name: 'Corrente', type: 'checking' },
    });
    prisma.account.create({
      data: { id: ACC_DESTINO, userId: UUID_A, name: 'Poupança', type: 'savings' },
    });
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({
      type: 'transferencia', amount: 100, description: 'Transferência', category: 'transferencia',
      accountId: ACC_ORIGEM, targetAccountId: ACC_DESTINO,
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('transferencia');
  });

  test('tipo fora do domínio é recusado', async () => {
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({
      type: 'investimento', amount: 10, description: 'x', category: 'y',
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(422);
  });

  test('transação válida é criada e devolve 201', async () => {
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({
      type: 'despesa', amount: 25.5, description: 'Café', category: 'alimentacao',
      date: new Date().toISOString(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toEqual(expect.any(String));
  });

  test('campos desconhecidos não chegam ao banco', async () => {
    const res = await request(app).post('/api/v1/transactions').set('Authorization', auth).send({
      type: 'despesa', amount: 10, description: 'x', category: 'y',
      date: new Date().toISOString(),
      userId: UUID_B,            // tentativa de escrever em nome de outro
      isAdmin: true,             // campo inventado
    });

    expect(res.status).toBe(201);
    expect(res.body.data.isAdmin).toBeUndefined();
    expect(res.body.data.userId).toBe(UUID_A); // dono é sempre o do token
  });
});

// ─── isolamento entre usuários ───────────────────────────────────────────────
describe('isolamento horizontal', () => {
  test('usuário não lê transação de outro usuário', async () => {
    const authA = comoUsuario({ id: UUID_A });
    const criada = await request(app).post('/api/v1/transactions').set('Authorization', authA).send({
      type: 'despesa', amount: 10, description: 'privada', category: 'x',
      date: new Date().toISOString(),
    });
    const id = criada.body.data.id;

    const authB = comoUsuario({ id: UUID_B });
    const res = await request(app).get(`/api/v1/transactions/${id}`).set('Authorization', authB);

    expect([403, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('privada');
  });

  test('listagem só devolve o que é do próprio usuário', async () => {
    const authA = comoUsuario({ id: UUID_A });
    await request(app).post('/api/v1/transactions').set('Authorization', authA).send({
      type: 'despesa', amount: 10, description: 'do A', category: 'x',
      date: new Date().toISOString(),
    });

    const authB = comoUsuario({ id: UUID_B });
    const res = await request(app).get('/api/v1/transactions').set('Authorization', authB);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('do A');
  });

  test('accountId de outro usuário é rejeitado', async () => {
    const ACC_A = '33333333-3333-4333-8333-333333333333';
    prisma.account.create({
      data: { id: ACC_A, userId: UUID_A, name: 'Conta A', type: 'checking' },
    });

    const authB = comoUsuario({ id: UUID_B });
    const res = await request(app).post('/api/v1/transactions').set('Authorization', authB).send({
      type: 'despesa', amount: 10, description: 'ataque', category: 'x',
      accountId: ACC_A,
      date: new Date().toISOString(),
    });

    expect(res.status).toBe(403);
  });

  test('sync não sobrescreve transação de outro usuário pelo mesmo id', async () => {
    const authA = comoUsuario({ id: UUID_A });
    const criada = await request(app).post('/api/v1/transactions').set('Authorization', authA).send({
      type: 'despesa', amount: 10, description: 'protegida', category: 'x',
      date: new Date().toISOString(),
    });
    const txId = criada.body.data.id;

    const authB = comoUsuario({ id: UUID_B });
    const res = await request(app).post('/api/v1/sync').set('Authorization', authB).send({
      mutations: [{
        opId: 'op-idor',
        entity: 'transaction',
        op: 'upsert',
        id: txId,
        clientUpdatedAt: new Date().toISOString(),
        payload: {
          type: 'despesa', amount: 999, description: 'hackeada', category: 'x',
          date: new Date().toISOString(),
        },
      }],
    });

    expect(res.status).toBe(200);
    expect(res.body.data.results[0].action).toBe('reject');
    expect(res.body.data.results[0].reason).toBe('id-em-uso');

    const original = await prisma.transaction.findFirst({ where: { id: txId } });
    expect(original.userId).toBe(UUID_A);
    expect(Number(original.amount)).toBe(10);
  });
});

// ─── paginação ───────────────────────────────────────────────────────────────
describe('validação de query', () => {
  let auth;
  beforeEach(() => { auth = comoUsuario(); });

  test('limite acima do teto devolve 422', async () => {
    const res = await request(app).get('/api/v1/transactions?limit=999999').set('Authorization', auth);
    expect(res.status).toBe(422);
  });

  test('offset negativo devolve 422', async () => {
    const res = await request(app).get('/api/v1/transactions?offset=-1').set('Authorization', auth);
    expect(res.status).toBe(422);
  });

  test('sem query aplica defaults e devolve meta', async () => {
    const res = await request(app).get('/api/v1/transactions').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ limit: 50, offset: 0 });
  });

  test('filtro de data inválido devolve 422', async () => {
    const res = await request(app).get('/api/v1/transactions?dateFrom=01/2026').set('Authorization', auth);
    expect(res.status).toBe(422);
  });
});

// ─── erros e superfície pública ──────────────────────────────────────────────
describe('superfície de erro', () => {
  test('rota de API inexistente devolve 404 em JSON, não HTML', async () => {
    const res = await request(app).get('/api/v1/nao-existe');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  test('health responde sem autenticação', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  test('helmet aplica cabeçalhos de segurança', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  test('resposta de erro nunca vaza stack trace', async () => {
    const auth = comoUsuario();
    const res = await request(app).get('/api/v1/transactions/12345').set('Authorization', auth);

    const corpo = JSON.stringify(res.body);
    expect(corpo).not.toMatch(/at\s+\w+\s+\(/);
    expect(corpo).not.toContain('node_modules');
  });

  test('corpo JSON malformado devolve 4xx sem derrubar o processo', async () => {
    const auth = comoUsuario();
    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', auth)
      .set('Content-Type', 'application/json')
      .send('{"quebrado":');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

/**
 * A raiz estática de desenvolvimento é a raiz do PROJETO. Servi-la inteira
 * publicava .env, backend/, prisma/ e o .jks de assinatura da Play Store para
 * quem alcançasse a porta — um `npm run backend:dev` numa rede compartilhada
 * bastava. Estes testes prendem a allowlist no lugar.
 */
describe('raiz estática em desenvolvimento', () => {
  const proibidos = [
    '/.env',
    '/package.json',
    '/backend/config.js',
    '/prisma/schema.prisma',
    '/scripts/harden-csp.cjs',
    '/financaspro-upload.jks',
  ];

  test.each(proibidos)('não serve %s como arquivo estático', async (caminho) => {
    const res = await request(app).get(caminho);

    // O fallback de SPA responde index.html (200 text/html) para rota
    // desconhecida — o que importa é NUNCA devolver o conteúdo do arquivo.
    expect(res.headers['content-type'] || '').toMatch(/text\/html/);
    expect(res.text || '').not.toMatch(/JWT_ACCESS_SECRET|PrismaClient|generator client/);
  });

  test('continua servindo os assets públicos', async () => {
    const res = await request(app).get('/js/pin-guard.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type'] || '').toMatch(/javascript/);
  });
});

/**
 * Compressão HTTP.
 *
 * O build ficou meses sendo servido cru: 460 KB de app.bundle.js e 252 KB de
 * CSS atravessando a rede sem Content-Encoding. Nenhum check pegava, porque
 * todos mediam bytes em disco. Medido em Chromium com CPU 4x e ~1,6 Mbps, a
 * diferença era LCP de 5,1 s contra 2,2 s — o maior ganho por linha do
 * projeto. Este teste existe para que remover o compression() quebre o CI, e
 * não a experiência de quem abre o app no celular.
 */
describe('compressão de resposta', () => {
  test('asset estático sai comprimido quando o cliente aceita', async () => {
    const res = await request(app)
      .get('/js/pin-guard.js')
      .set('Accept-Encoding', 'gzip');

    expect(res.headers['content-encoding']).toBe('gzip');
  });

  test('resposta pequena NÃO é comprimida — comprimir custaria mais que economiza', async () => {
    // O compression() só age acima de ~1 KB. O JSON do /health tem algumas
    // centenas de bytes: gzipar aqui gastaria CPU no servidor e no cliente
    // para talvez aumentar o payload. O teste documenta que isso é escolha,
    // não esquecimento.
    const res = await request(app)
      .get('/health')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  test('cliente que não aceita gzip recebe o conteúdo cru, não um erro', async () => {
    const res = await request(app)
      .get('/js/pin-guard.js')
      .set('Accept-Encoding', 'identity');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});

/**
 * Cache-Control.
 *
 * Assets do Vite têm hash no nome: mudar o conteúdo muda o nome, então podem
 * ser imutáveis por um ano. index.html e sw.js NÃO podem — são o ponto de
 * entrada que descobre os hashes novos, e um cache longo neles prenderia o
 * usuário numa versão antiga até o cache expirar sozinho.
 */
describe('política de cache dos estáticos', () => {
  test('index.html nunca é cacheado sem revalidar', async () => {
    const res = await request(app).get('/index.html');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  test('sw.js nunca é cacheado sem revalidar', async () => {
    const res = await request(app).get('/sw.js');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  test('asset sem hash usa cache curto', async () => {
    const res = await request(app).get('/js/pin-guard.js');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });
});

