/**
 * backend-integration-test.mjs — testes com PostgreSQL (CI ou INTEGRATION_TEST_DATABASE_URL)
 */
import { execSync } from 'child_process';
import request from 'supertest';

const dbUrl = process.env.INTEGRATION_TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl || process.env.SKIP_INTEGRATION === '1') {
  console.log('[integration] pulado — defina INTEGRATION_TEST_DATABASE_URL ou SKIP_INTEGRATION=1');
  process.exit(0);
}

process.env.DATABASE_URL = dbUrl;

let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log('[integration ok]', name);
  } catch (err) {
    failed += 1;
    console.error('[integration fail]', name, err.message || err);
  }
}

try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
} catch (err) {
  console.error('[integration] migrate deploy falhou:', err.message);
  process.exit(1);
}

const { createApp } = await import('../backend/app.js');
const prisma = (await import('../backend/lib/db.js')).default;

const app = createApp();
const stamp = Date.now();
const email = 'int-' + stamp + '@financaspro.test';
const password = 'SenhaForte123!';

await check('registro + login com cookies', async () => {
  const agent = request.agent(app);
  const reg = await agent.post('/api/v1/auth/register').send({
    name: 'Integração',
    email,
    password,
  });
  if (reg.status !== 201) throw new Error('register ' + reg.status);

  const login = await agent.post('/api/v1/auth/login').send({ email, password });
  if (login.status !== 200) throw new Error('login ' + login.status);
  if (!login.body?.data?.user?.id) throw new Error('sem user no login');
});

await check('config rejeita campos PIN no servidor', async () => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email, password });
  const res = await agent.put('/api/v1/users/me/config').send({
    nome: 'Teste',
    pinHash: 'hack',
    pinAtivo: true,
  });
  if (res.status !== 200) throw new Error('config ' + res.status);
  if (res.body?.data?.pinHash) throw new Error('pinHash não deveria persistir');
});

await check('open finance providers e sandbox sync', async () => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email, password });

  const providers = await agent.get('/api/v1/open-finance/providers');
  if (providers.status !== 200) throw new Error('providers ' + providers.status);
  if (!providers.body?.data?.sandbox) throw new Error('sandbox ausente');

  const conn = await agent.post('/api/v1/open-finance/connections').send({
    bankName: 'Banco Teste',
    provider: 'sandbox',
  });
  if (conn.status !== 201) throw new Error('connect ' + conn.status);

  const id = conn.body?.data?.id;
  const sync = await agent.post('/api/v1/open-finance/connections/' + id + '/sync').send({});
  if (sync.status !== 200) throw new Error('sync ' + sync.status);
  if ((sync.body?.data?.imported ?? 0) < 1) throw new Error('nenhuma transação importada');
});

await check('belvo widget-token retorna 503 sem credenciais', async () => {
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ email, password });
  const res = await agent.post('/api/v1/open-finance/belvo/widget-token').send({});
  if (res.status !== 503) throw new Error('esperado 503, obteve ' + res.status);
});

await check('billing lista planos', async () => {
  const agent = request.agent(app);
  const plans = await agent.get('/api/v1/billing/plans');
  if (plans.status !== 200) throw new Error('plans ' + plans.status);
});

await prisma.$disconnect();
process.exit(failed > 0 ? 1 : 0);
