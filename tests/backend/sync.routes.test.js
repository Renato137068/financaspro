/**
 * sync.routes.test.js — HTTP sync v2 com prisma-fake.
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

process.env.RATE_LIMIT_MAX = '100000';
process.env.RATE_LIMIT_AUTH_MAX = '100000';

const prisma = createPrismaFake();
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

const { createApp } = await import('../../backend/app.js');
const { signTokens } = await import('../../backend/lib/jwt.js');

const app = createApp();
const USER = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const TX = '9c858901-8a57-4791-81fe-4c455b099bc9';

function auth() {
  prisma.user.create({ data: { id: USER, name: 'Sync', email: 'sync@test.com', role: 'USER', active: true } });
  const { accessToken } = signTokens({ id: USER, role: 'USER' });
  return `Bearer ${accessToken}`;
}

beforeEach(() => prisma.__reset());

describe('GET /api/v1/sync', () => {
  test('exige autenticação', async () => {
    const res = await request(app).get('/api/v1/sync');
    expect(res.status).toBe(401);
  });

  test('retorna delta vazio inicial', async () => {
    const res = await request(app).get('/api/v1/sync').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('transactions');
  });
});

describe('POST /api/v1/sync', () => {
  test('aplica upsert idempotente', async () => {
    const header = auth();
    const body = {
      mutations: [{
        opId: 'route-op-1',
        entity: 'transaction',
        op: 'upsert',
        id: TX,
        clientUpdatedAt: '2026-07-09T10:00:00.000Z',
        payload: {
          type: 'despesa', amount: 15, description: 'HTTP', category: 'outro',
          date: '2026-07-09T10:00:00.000Z',
        },
      }],
    };
    const r1 = await request(app).post('/api/v1/sync').set('Authorization', header).send(body);
    const r2 = await request(app).post('/api/v1/sync').set('Authorization', header).send(body);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body.data.results[0].action).toBe('apply');
    const rows = await prisma.transaction.findMany({ where: { userId: USER } });
    expect(rows).toHaveLength(1);
  });
});
