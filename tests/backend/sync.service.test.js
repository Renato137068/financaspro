/**
 * sync.service.test.js — push idempotente, tombstones e pull delta.
 */
import { jest } from '@jest/globals';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

const prisma = createPrismaFake();
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

const { SyncService } = await import('../../backend/domain/services/sync.service.js');

const USER = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const USER_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TX = '9c858901-8a57-4791-81fe-4c455b099bc9';
const T1 = '2026-07-09T10:00:00.000Z';
const T2 = '2026-07-09T11:00:00.000Z';

beforeEach(() => prisma.__reset());

function payload(over) {
  return {
    type: 'despesa',
    amount: 42.5,
    description: 'Teste sync',
    category: 'outro',
    date: T1,
    ...over,
  };
}

describe('SyncService.pushMutations', () => {
  test('create via upsert com id cliente', async () => {
    const opId = 'op-1';
    const out = await SyncService.pushMutations(USER, [{
      opId, entity: 'transaction', op: 'upsert', id: TX,
      clientUpdatedAt: T1, payload: payload(),
    }]);
    expect(out.results[0].action).toBe('apply');
    const row = await prisma.transaction.findFirst({ where: { id: TX } });
    expect(row).toBeTruthy();
    expect(Number(row.amount)).toBe(42.5);
  });

  test('idempotência — mesmo opId não duplica', async () => {
    const mut = {
      opId: 'op-dup', entity: 'transaction', op: 'upsert', id: TX,
      clientUpdatedAt: T1, payload: payload(),
    };
    await SyncService.pushMutations(USER, [mut]);
    await SyncService.pushMutations(USER, [mut]);
    const count = (await prisma.transaction.findMany({ where: { userId: USER } })).length;
    expect(count).toBe(1);
  });

  test('delete grava tombstone (soft delete)', async () => {
    await SyncService.pushMutations(USER, [{
      opId: 'op-c', entity: 'transaction', op: 'upsert', id: TX,
      clientUpdatedAt: T1, payload: payload(),
    }]);
    const rowBefore = await prisma.transaction.findFirst({ where: { id: TX } });
    const deleteAt = new Date(rowBefore.updatedAt.getTime() + 60000).toISOString();
    const out = await SyncService.pushMutations(USER, [{
      opId: 'op-d', entity: 'transaction', op: 'delete', id: TX,
      clientUpdatedAt: deleteAt,
    }]);
    expect(out.results[0].action).toBe('delete');
    const row = await prisma.transaction.findFirst({ where: { id: TX } });
    expect(row.deletedAt).toBeTruthy();
  });

  test('server-wins quando cliente mais antigo', async () => {
    prisma.transaction.create({
      data: {
        id: TX, userId: USER, type: 'despesa', amount: 10,
        description: 'Servidor', category: 'outro', date: new Date(T2), updatedAt: new Date(T2),
      },
    });
    const out = await SyncService.pushMutations(USER, [{
      opId: 'op-sw', entity: 'transaction', op: 'upsert', id: TX,
      clientUpdatedAt: T1, payload: payload({ amount: 99 }),
    }]);
    expect(out.results[0].action).toBe('server-wins');
    const row = await prisma.transaction.findFirst({ where: { id: TX } });
    expect(Number(row.amount)).toBe(10);
  });

  test('rejeita upsert com id de transação de outro usuário', async () => {
    prisma.user.create({
      data: { id: USER_B, name: 'B', email: 'b@test.com', role: 'USER', active: true },
    });
    prisma.transaction.create({
      data: {
        id: TX, userId: USER_B, type: 'despesa', amount: 7,
        description: 'De B', category: 'outro', date: new Date(T1),
      },
    });
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });

    const out = await SyncService.pushMutations(USER, [{
      opId: 'op-idor', entity: 'transaction', op: 'upsert', id: TX,
      clientUpdatedAt: T2, payload: payload({ amount: 99 }),
    }]);

    expect(out.results[0].action).toBe('reject');
    expect(out.results[0].reason).toBe('id-em-uso');
    const row = await prisma.transaction.findFirst({ where: { id: TX } });
    expect(row.userId).toBe(USER_B);
    expect(Number(row.amount)).toBe(7);
  });

  test('opId cache não vaza entre usuários', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    prisma.user.create({
      data: { id: USER_B, name: 'B', email: 'b2@test.com', role: 'USER', active: true },
    });
    const TX_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    await SyncService.pushMutations(USER, [{
      opId: 'op-shared', entity: 'transaction', op: 'upsert', id: TX,
      clientUpdatedAt: T1, payload: payload({ description: 'Segredo A' }),
    }]);

    const out = await SyncService.pushMutations(USER_B, [{
      opId: 'op-shared', entity: 'transaction', op: 'upsert', id: TX_B,
      clientUpdatedAt: T1, payload: payload({ description: 'De B' }),
    }]);

    expect(out.results[0].action).toBe('apply');
    expect(out.results[0].record.description).toBe('De B');
  });
});

describe('SyncService.pullDelta', () => {
  test('retorna delta incremental por updatedAt', async () => {
    prisma.transaction.create({
      data: {
        id: TX, userId: USER, type: 'despesa', amount: 5,
        description: 'Velha', category: 'outro', date: new Date(T1), updatedAt: new Date(T1),
      },
    });
    const delta = await SyncService.pullDelta(USER, T1);
    expect(delta.transactions.length).toBeGreaterThanOrEqual(0);
    expect(delta).toHaveProperty('hasMore');
  });

  test('pagina delta grande em lotes', async () => {
    for (let i = 0; i < 15; i++) {
      const d = new Date(Date.UTC(2026, 0, 1, 0, 0, i));
      await prisma.transaction.create({
        data: {
          userId: USER, type: 'despesa', amount: 1, description: `t${i}`,
          category: 'outro', date: d, updatedAt: d,
        },
      });
    }
    const p1 = await SyncService.pullDelta(USER, null, { limit: 10 });
    expect(p1.transactions).toHaveLength(10);
    expect(p1.hasMore).toBe(true);
    const p2 = await SyncService.pullDelta(USER, null, { limit: 10, cursor: p1.nextCursor });
    expect(p2.transactions).toHaveLength(5);
    expect(p2.hasMore).toBe(false);
  });
});

describe('SyncService — contas e recorrentes', () => {
  const AC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const REC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  beforeEach(() => prisma.__reset());

  test('upsert de conta via sync v2', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    const out = await SyncService.pushMutations(USER, [{
      opId: 'op-ac-1',
      entity: 'account',
      op: 'upsert',
      id: AC,
      clientUpdatedAt: T1,
      payload: { name: 'Nubank', type: 'checking', balance: 1500, currency: 'BRL' },
    }]);
    expect(out.results[0].action).toBe('apply');
    const row = await prisma.account.findFirst({ where: { id: AC } });
    expect(row.name).toBe('Nubank');
  });

  test('delete de conta grava inactive', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    await SyncService.pushMutations(USER, [{
      opId: 'op-ac-c', entity: 'account', op: 'upsert', id: AC,
      clientUpdatedAt: T1, payload: { name: 'Conta', type: 'checking', balance: 0 },
    }]);
    const rowBefore = await prisma.account.findFirst({ where: { id: AC } });
    const deleteAt = new Date(rowBefore.updatedAt.getTime() + 60000).toISOString();
    const out = await SyncService.pushMutations(USER, [{
      opId: 'op-ac-d', entity: 'account', op: 'delete', id: AC, clientUpdatedAt: deleteAt,
    }]);
    expect(out.results[0].action).toBe('delete');
    const row = await prisma.account.findFirst({ where: { id: AC } });
    expect(row.active).toBe(false);
  });

  test('pull inclui contas no delta', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    await prisma.account.create({
      data: {
        id: AC, userId: USER, name: 'Caixa', type: 'savings', balance: 200,
        updatedAt: new Date(T2),
      },
    });
    const delta = await SyncService.pullDelta(USER, T1);
    expect(delta.accounts.some((a) => a.id === AC)).toBe(true);
  });

  test('claim atômico de opId evita duplicar mutação', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    const mut = {
      opId: 'op-race', entity: 'account', op: 'upsert', id: AC,
      clientUpdatedAt: T1, payload: { name: 'Race', type: 'checking', balance: 1 },
    };
    await SyncService.pushMutations(USER, [mut]);
    await SyncService.pushMutations(USER, [mut]);
    expect((await prisma.account.findMany({ where: { userId: USER } })).length).toBe(1);
  });
});

describe('SyncService — orçamentos (budget)', () => {
  const BUD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  beforeEach(() => prisma.__reset());

  test('upsert de orçamento via sync v2', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    const out = await SyncService.pushMutations(USER, [{
      opId: 'op-bud-1',
      entity: 'budget',
      op: 'upsert',
      id: BUD,
      clientUpdatedAt: T1,
      payload: { category: 'alimentacao', limit: 800, period: 'monthly' },
    }]);
    expect(out.results[0].action).toBe('apply');
    const row = await prisma.budget.findFirst({ where: { id: BUD } });
    expect(Number(row.limit)).toBe(800);
  });

  test('delete de orçamento grava inactive', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    await SyncService.pushMutations(USER, [{
      opId: 'op-bud-c', entity: 'budget', op: 'upsert', id: BUD,
      clientUpdatedAt: T1, payload: { category: 'transporte', limit: 300, period: 'monthly' },
    }]);
    const rowBefore = await prisma.budget.findFirst({ where: { id: BUD } });
    const deleteAt = new Date(rowBefore.updatedAt.getTime() + 60000).toISOString();
    const out = await SyncService.pushMutations(USER, [{
      opId: 'op-bud-d', entity: 'budget', op: 'delete', id: BUD, clientUpdatedAt: deleteAt,
    }]);
    expect(out.results[0].action).toBe('delete');
    const row = await prisma.budget.findFirst({ where: { id: BUD } });
    expect(row.active).toBe(false);
  });

  test('pull inclui orçamentos no delta', async () => {
    prisma.user.create({
      data: { id: USER, name: 'A', email: 'a@test.com', role: 'USER', active: true },
    });
    await prisma.budget.create({
      data: {
        id: BUD, userId: USER, category: 'lazer', limit: 150, period: 'monthly',
        updatedAt: new Date(T2),
      },
    });
    const delta = await SyncService.pullDelta(USER, T1);
    expect(delta.budgets.some((b) => b.id === BUD)).toBe(true);
  });
});
