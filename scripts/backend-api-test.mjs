/**
 * backend-api-test.mjs — testes de integração HTTP da API.
 *
 * Exercita a pilha Express real (roteamento, helmet, CORS, rate limit, auth,
 * validação Zod, RBAC, tratamento de erro) contra um Prisma em memória, então
 * roda em qualquer máquina — sem PostgreSQL, sem Docker.
 *
 * Complementa, e não substitui, backend-integration-test.mjs, que valida SQL,
 * constraints e migrações contra um Postgres de verdade no CI.
 *
 * Uso: node scripts/backend-api-test.mjs
 */

// A configuração é lida uma única vez, no import — então o ambiente precisa
// estar montado antes de qualquer import do backend.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';          // o que importa aqui é o resultado das asserções
process.env.RATE_LIMIT_MAX = '10000';      // limite global fora do caminho dos testes
process.env.RATE_LIMIT_AUTH_MAX = '5';     // baixo de propósito: exercita o limiter de auth
process.env.LOGIN_MAX_ATTEMPTS = '1000';   // lockout desligado p/ não se confundir com o 429 do rate limit
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

import request from 'supertest';
import assert from 'assert/strict';
import { installPrismaFake } from './lib/prisma-fake.mjs';

const prisma = installPrismaFake();
const { createApp } = await import('../backend/app.js');
const app = createApp();

let passed = 0;
let failed = 0;
let currentTest = null;
const rejections = [];

// Handlers async do Express 4 que lançam viram unhandledRejection — e
// backend/server.js responde a isso com process.exit(1). Sem este guard a
// suíte morreria no meio, sem relatório. Registramos e seguimos, para que a
// falha apareça como teste vermelho em vez de derrubar o runner.
process.on('unhandledRejection', (reason) => {
  rejections.push({ test: currentTest, message: reason?.message ?? String(reason) });
});

const CASE_TIMEOUT_MS = 8000;

/**
 * Um handler que lança nunca envia resposta, e a requisição fica pendurada para
 * sempre. Sem este teto a suíte travaria em vez de acusar o problema.
 */
function comTimeout(promise, name) {
  let timer;
  const limite = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`sem resposta em ${CASE_TIMEOUT_MS}ms — requisição pendurada em "${name}"`)),
      CASE_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, limite]).finally(() => clearTimeout(timer));
}

async function test(name, fn) {
  currentTest = name;
  const antes = rejections.length;
  try {
    await comTimeout(fn(), name);
    // Dá um tick para que rejeições disparadas pela requisição sejam contabilizadas.
    await new Promise((r) => setImmediate(r));
    if (rejections.length > antes) {
      throw new Error(`unhandledRejection durante o caso: ${rejections[antes].message}`);
    }
    passed += 1;
    console.log(`[ok] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[fail] ${name}\n       ${err.message}`);
  } finally {
    currentTest = null;
  }
}

const PASSWORD = 'SenhaForte123!';
let emailSeq = 0;
/** E-mail único por caso: a chave do rate limit de auth é `ip:email`. */
function freshEmail(tag = 'u') {
  emailSeq += 1;
  return `${tag}${emailSeq}@financaspro.test`;
}

/** Registra e loga um usuário, devolvendo um agent com os cookies de sessão. */
async function createUser({ email = freshEmail(), role, active } = {}) {
  const agent = request.agent(app);
  const reg = await agent.post('/api/v1/auth/register').send({ name: 'Teste', email, password: PASSWORD });
  assert.equal(reg.status, 201, `setup: register retornou ${reg.status}`);

  if (role || active === false) {
    const user = await prisma.user.findUnique({ where: { email } });
    await prisma.user.update({ where: { id: user.id }, data: { ...(role && { role }), ...(active === false && { active: false }) } });
  }

  const login = await agent.post('/api/v1/auth/login').send({ email, password: PASSWORD });
  return { agent, email, login };
}

// ─── Autenticação: fluxo feliz ────────────────────────────────────────────────

await test('register cria usuário e retorna 201', async () => {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Novo', email: freshEmail(), password: PASSWORD });
  assert.equal(res.status, 201);
  assert.ok(!res.body?.data?.passwordHash, 'hash de senha não pode vazar na resposta');
  assert.ok(!res.body?.data?.passwordSalt, 'salt não pode vazar na resposta');
});

await test('register rejeita e-mail duplicado com 409', async () => {
  const email = freshEmail();
  await request(app).post('/api/v1/auth/register').send({ name: 'A', email, password: PASSWORD });
  const dup = await request(app).post('/api/v1/auth/register').send({ name: 'B', email, password: PASSWORD });
  assert.equal(dup.status, 409);
});

await test('login válido retorna 200 e emite cookies', async () => {
  const { login } = await createUser();
  assert.equal(login.status, 200);
  assert.ok(login.body?.data?.user?.id, 'resposta sem usuário');
  const cookies = String(login.headers['set-cookie'] ?? '');
  assert.ok(cookies.includes('HttpOnly'), 'cookie de sessão deve ser HttpOnly');
});

await test('GET /auth/me autenticado retorna o usuário', async () => {
  const { agent, email } = await createUser();
  const me = await agent.get('/api/v1/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body?.data?.email, email);
});

await test('GET /auth/me sem token retorna 401', async () => {
  const res = await request(app).get('/api/v1/auth/me');
  assert.equal(res.status, 401);
});

await test('GET /auth/me com token forjado retorna 401', async () => {
  const res = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.assinatura-invalida');
  assert.equal(res.status, 401);
});

// ─── Regressão P2a: enumeração de contas no login ─────────────────────────────
// As três respostas de falha precisam ser indistinguíveis para quem não sabe a
// senha; qualquer divergência de status revela se o e-mail existe.

await test('P2a: e-mail inexistente e senha errada retornam o MESMO 401', async () => {
  const { email } = await createUser();

  const inexistente = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: freshEmail('naoexiste'), password: PASSWORD });

  const senhaErrada = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'SenhaErrada123!' });

  assert.equal(inexistente.status, 401, 'e-mail inexistente deveria ser 401');
  assert.equal(senhaErrada.status, 401, 'senha errada deveria ser 401');
  assert.equal(
    inexistente.body?.error, senhaErrada.body?.error,
    'mensagens diferentes permitem enumerar contas',
  );
});

await test('P2a: conta desativada + senha ERRADA retorna 401, não 403', async () => {
  const { email } = await createUser({ active: false });
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: 'SenhaErrada123!' });
  assert.equal(res.status, 401, 'um 403 aqui confirmaria que a conta existe');
});

await test('P2a: conta desativada + senha CORRETA retorna 403', async () => {
  const { email } = await createUser({ active: false });
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  assert.equal(res.status, 403, 'quem provou a senha merece saber que a conta está desativada');
});

// ─── Regressão P1: rate limit no login ────────────────────────────────────────

await test('P1: login bloqueia com 429 após exceder o limite', async () => {
  const email = freshEmail('brute');
  const max = Number(process.env.RATE_LIMIT_AUTH_MAX);
  const statuses = [];

  for (let i = 0; i < max + 3; i += 1) {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'ChutandoSenha1!' });
    statuses.push(res.status);
  }

  const bloqueadas = statuses.filter((s) => s === 429).length;
  assert.ok(bloqueadas >= 3, `esperado >=3 respostas 429, obtido ${bloqueadas} (statuses: ${statuses.join(',')})`);
});

// ─── Validação de entrada ─────────────────────────────────────────────────────

await test('login com corpo vazio retorna 422', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({});
  assert.equal(res.status, 422);
  assert.ok(res.body?.fields, 'resposta 422 deve detalhar os campos');
});

await test('register com senha fraca retorna 422', async () => {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'X', email: freshEmail(), password: 'curta' });
  assert.equal(res.status, 422);
});

await test('register com e-mail malformado retorna 422', async () => {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'X', email: 'nao-e-email', password: PASSWORD });
  assert.equal(res.status, 422);
});

await test('transação com valor negativo retorna 422', async () => {
  const { agent } = await createUser();
  const res = await agent.post('/api/v1/transactions').send({
    type: 'despesa',
    amount: -50,
    description: 'Valor invalido',
    category: 'mercado',
    date: new Date().toISOString(),
  });
  assert.equal(res.status, 422);
});

await test('transação com tipo desconhecido retorna 422', async () => {
  const { agent } = await createUser();
  const res = await agent.post('/api/v1/transactions').send({
    type: 'transferencia',
    amount: 10,
    description: 'Tipo invalido',
    category: 'mercado',
    date: new Date().toISOString(),
  });
  assert.equal(res.status, 422);
});

// ─── Isolamento entre usuários (IDOR) ─────────────────────────────────────────

await test('usuário não acessa transação de outro usuário', async () => {
  const alice = await createUser({ email: freshEmail('alice') });
  const bob = await createUser({ email: freshEmail('bob') });

  const criada = await alice.agent.post('/api/v1/transactions').send({
    type: 'despesa',
    amount: 99.9,
    description: 'Segredo da Alice',
    category: 'mercado',
    date: new Date().toISOString(),
  });
  assert.equal(criada.status, 201, `setup: criação retornou ${criada.status}`);
  const id = criada.body?.data?.id;
  assert.ok(id, 'setup: transação sem id');

  const roubo = await bob.agent.get(`/api/v1/transactions/${id}`);
  assert.notEqual(roubo.status, 200, 'Bob conseguiu LER a transação da Alice');

  const corpo = JSON.stringify(roubo.body ?? {});
  assert.ok(!corpo.includes('Segredo da Alice'), 'dados da Alice vazaram no corpo da resposta');
});

await test('usuário não apaga transação de outro usuário', async () => {
  const alice = await createUser({ email: freshEmail('alice') });
  const bob = await createUser({ email: freshEmail('bob') });

  const criada = await alice.agent.post('/api/v1/transactions').send({
    type: 'receita',
    amount: 1200,
    description: 'Salario da Alice',
    category: 'salario',
    date: new Date().toISOString(),
  });
  const id = criada.body?.data?.id;

  const del = await bob.agent.delete(`/api/v1/transactions/${id}`);
  assert.notEqual(del.status, 200, 'Bob conseguiu APAGAR a transação da Alice');

  // O registro precisa continuar existindo para a Alice.
  const aindaLa = await alice.agent.get(`/api/v1/transactions/${id}`);
  assert.equal(aindaLa.status, 200, 'transação da Alice sumiu após tentativa do Bob');
});

await test('listagem só devolve transações do próprio usuário', async () => {
  const alice = await createUser({ email: freshEmail('alice') });
  const bob = await createUser({ email: freshEmail('bob') });

  await alice.agent.post('/api/v1/transactions').send({
    type: 'despesa', amount: 10, description: 'Item da Alice',
    category: 'mercado', date: new Date().toISOString(),
  });

  const lista = await bob.agent.get('/api/v1/transactions');
  assert.equal(lista.status, 200);
  const corpo = JSON.stringify(lista.body ?? {});
  assert.ok(!corpo.includes('Item da Alice'), 'listagem do Bob incluiu dados da Alice');
});

// ─── RBAC ─────────────────────────────────────────────────────────────────────

await test('VIEWER pode ler mas não pode criar transação', async () => {
  const { agent } = await createUser({ role: 'VIEWER' });

  const leitura = await agent.get('/api/v1/transactions');
  assert.equal(leitura.status, 200, 'VIEWER deveria conseguir ler');

  const escrita = await agent.post('/api/v1/transactions').send({
    type: 'despesa', amount: 10, description: 'Nao permitido',
    category: 'mercado', date: new Date().toISOString(),
  });
  assert.equal(escrita.status, 403, 'VIEWER não pode escrever');
});

// ─── Sessão ───────────────────────────────────────────────────────────────────

await test('logout invalida o acesso à rota protegida', async () => {
  const { agent } = await createUser();
  assert.equal((await agent.get('/api/v1/auth/me')).status, 200);

  const out = await agent.post('/api/v1/auth/logout').send({});
  assert.ok(out.status < 400, `logout retornou ${out.status}`);

  const depois = await agent.get('/api/v1/auth/me');
  assert.equal(depois.status, 401, 'sessão continuou válida após logout');
});

// ─── Cabeçalhos de segurança e rotas desconhecidas ────────────────────────────

await test('helmet aplica cabeçalhos de segurança', async () => {
  const res = await request(app).get('/api/v1/auth/me');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(!res.headers['x-powered-by'], 'x-powered-by não deveria ser exposto');
});

await test('GET /health responde 200 com o banco acessível', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200, `health degradado: ${JSON.stringify(res.body)}`);
});

await test('fallback de SPA continua servindo index.html fora de /api', async () => {
  const res = await request(app).get('/dashboard');
  assert.equal(res.status, 200);
  assert.ok(
    String(res.text ?? '').includes('<'),
    'rota de app deveria devolver o index.html do SPA',
  );
});

await test('rota de API inexistente responde 404 em JSON', async () => {
  const res = await request(app).get('/api/v1/nao-existe');
  assert.equal(res.status, 404);
  // O guard de SPA em app.js protege /api/ corretamente, então a requisição cai
  // no finalhandler do Express — que responde HTML. Um cliente de API que faz
  // res.json() nesse corpo quebra com erro de parse em vez de ver o 404.
  assert.ok(
    String(res.headers['content-type'] ?? '').includes('application/json'),
    `404 de API deveria ser JSON, veio "${res.headers['content-type']}"`,
  );
});

// ─── Resultado ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
