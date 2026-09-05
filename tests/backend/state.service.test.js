/**
 * state.service.test.js — snapshot sem limite rígido de transações.
 */
import { jest } from '@jest/globals';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

const prisma = createPrismaFake();

jest.unstable_mockModule('../../backend/lib/redis.js', () => ({
  default: { isAvailable: false, client: { get: jest.fn(), setex: jest.fn(), del: jest.fn() } },
}));
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

const { StateService } = await import('../../backend/domain/services/state.service.js');

const USER = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

beforeEach(() => {
  prisma.__reset();
  prisma.user.create({ data: { id: USER, name: 'U', email: 'u@test.com', role: 'USER', active: true } });
  prisma.account.create({ data: { userId: USER, name: 'Nubank', type: 'checking', balance: 100, active: true } });
  for (let i = 0; i < 5; i++) {
    prisma.transaction.create({
      data: {
        userId: USER, type: 'despesa', amount: 1, description: `t${i}`,
        category: 'outro', date: new Date(), updatedAt: new Date(Date.now() + i * 1000),
      },
    });
  }
});

describe('StateService.getSnapshot', () => {
  test('não embute transações — delega histórico ao sync pull', async () => {
    const snap = await StateService.getSnapshot(USER);

    expect(snap.transactions).toEqual([]);
    expect(snap.meta.transactions).toEqual({ total: 5, strategy: 'sync-pull' });
    expect(snap.accounts).toHaveLength(1);
  });

  test('inclui contas, orçamentos e config no payload leve', async () => {
    await prisma.userConfig.create({ data: { userId: USER, data: { nome: 'Ana' } } });
    const snap = await StateService.getSnapshot(USER);
    expect(snap.config.nome).toBe('Ana');
    expect(snap.meta.schemaVersion).toBe(2);
  });
});
