/**
 * backend-smoke-test.mjs — smoke HTTP do Express (sem PostgreSQL)
 */
import request from 'supertest';
import { createApp } from '../backend/app.js';
import { fetchSandboxTransactions, SANDBOX_PROVIDER } from '../backend/lib/open-finance/sandbox.js';

const app = createApp();
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`[ok] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[fail] ${name}:`, err.message || err);
  }
}

const items = fetchSandboxTransactions({ bankName: 'Smoke' });
if (items.length !== 3 || SANDBOX_PROVIDER !== 'sandbox') {
  console.error('[fail] sandbox provider');
  failed += 1;
} else {
  console.log('[ok] sandbox provider');
}

await check('GET /api/v1/open-finance/connections → 401', async () => {
  const res = await request(app).get('/api/v1/open-finance/connections');
  if (res.status !== 401) throw new Error(`status ${res.status}`);
});

await check('POST /api/v1/open-finance/connections/:id/sync → 401', async () => {
  const res = await request(app).post('/api/v1/open-finance/connections/abc/sync');
  if (res.status !== 401) throw new Error(`status ${res.status}`);
});

await check('POST /api/v1/auth/login vazio → 422', async () => {
  const res = await request(app).post('/api/v1/auth/login').send({});
  if (res.status !== 422) throw new Error(`status ${res.status}`);
});

await check('GET /api/v1/billing/:org/subscription → 401', async () => {
  const res = await request(app).get('/api/v1/billing/some-org/subscription');
  if (res.status !== 401) throw new Error(`status ${res.status}`);
});

process.exit(failed > 0 ? 1 : 0);
