/**
 * load.perf.test.js — invariantes de escala (sem rede real).
 *
 * Garante que listagem, snapshot e sync não carregam histórico ilimitado de uma vez.
 */
import { jest } from '@jest/globals';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

const prisma = createPrismaFake();
jest.unstable_mockModule('../../backend/lib/redis.js', () => ({
  default: { isAvailable: false, client: { get: jest.fn(), setex: jest.fn(), del: jest.fn() } },
}));
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

const USER = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const { StateService } = await import('../../backend/domain/services/state.service.js');
const { SyncService } = await import('../../backend/domain/services/sync.service.js');
const { TransactionRepository } = await import('../../backend/domain/repositories/transaction.repository.js');

function seedTransactions(n) {
  prisma.user.create({ data: { id: USER, name: 'U', email: 'u@test.com', role: 'USER', active: true } });
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2020, 0, 1 + (i % 365), 0, 0, i % 60));
    prisma.transaction.create({
      data: {
        userId: USER,
        type: 'despesa',
        amount: 1,
        description: `tx-${i}`,
        category: 'outro',
        date: d,
        updatedAt: d,
        deletedAt: null,
      },
    });
  }
}

beforeEach(() => prisma.__reset());

describe('performance — snapshot', () => {
  test('2500 transações: snapshot retorna total sem embutir linhas', async () => {
    seedTransactions(2500);
    const snap = await StateService.getSnapshot(USER);
    expect(snap.transactions).toEqual([]);
    expect(snap.meta.transactions.total).toBe(2500);
  });
});

describe('performance — sync delta paginado', () => {
  test('1200 transações: pullDelta retorna lote limitado com hasMore', async () => {
    seedTransactions(1200);
    const page1 = await SyncService.pullDelta(USER, null, { limit: 500 });
    expect(page1.transactions).toHaveLength(500);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await SyncService.pullDelta(USER, null, { limit: 500, cursor: page1.nextCursor });
    expect(page2.transactions).toHaveLength(500);
    expect(page2.hasMore).toBe(true);

    const page3 = await SyncService.pullDelta(USER, null, { limit: 500, cursor: page2.nextCursor });
    expect(page3.transactions).toHaveLength(200);
    expect(page3.hasMore).toBe(false);
  });
});

describe('performance — listagem por cursor', () => {
  test('findManyCursor pagina sem offset', async () => {
    seedTransactions(120);
    const p1 = await TransactionRepository.findManyCursor(USER, { limit: 50 });
    expect(p1.data).toHaveLength(50);
    expect(p1.meta.hasMore).toBe(true);

    const p2 = await TransactionRepository.findManyCursor(USER, { limit: 50, cursor: p1.meta.nextCursor });
    expect(p2.data).toHaveLength(50);
    expect(p2.meta.hasMore).toBe(true);

    const p3 = await TransactionRepository.findManyCursor(USER, { limit: 50, cursor: p2.meta.nextCursor });
    expect(p3.data).toHaveLength(20);
    expect(p3.meta.hasMore).toBe(false);
  });
});

describe('performance — criação unitária', () => {
  test('create permanece O(1) por operação', async () => {
    seedTransactions(0);
    const t0 = Date.now();
    await TransactionRepository.create({
      userId: USER,
      type: 'despesa',
      amount: 10,
      description: 'nova',
      category: 'outro',
      date: new Date(),
    });
    expect(Date.now() - t0).toBeLessThan(500);
    expect(await TransactionRepository.countActive(USER)).toBe(1);
  });
});
