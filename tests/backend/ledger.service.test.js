/**
 * ledger.service.test.js — saldo derivado do ledger (Fase 3).
 */
import { jest } from '@jest/globals';
import { createPrismaFake } from '../../scripts/lib/prisma-fake.mjs';

const prisma = createPrismaFake();
jest.unstable_mockModule('../../backend/lib/db.js', () => ({ default: prisma }));

const { LedgerService } = await import('../../backend/domain/services/ledger.service.js');

const USER = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ACC_A = '9c858901-8a57-4791-81fe-4c455b099bc9';
const ACC_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

beforeEach(() => prisma.__reset());

describe('LedgerService.deriveBalance', () => {
  test('saldo = inicial + receitas - despesas', async () => {
    prisma.account.create({
      data: { id: ACC_A, userId: USER, name: 'A', type: 'checking', balance: 1000 },
    });
    prisma.transaction.create({
      data: {
        id: 't1', userId: USER, type: 'receita', amount: 500, description: 'r', date: new Date(),
        accountId: ACC_A,
      },
    });
    prisma.transaction.create({
      data: {
        id: 't2', userId: USER, type: 'despesa', amount: 200, description: 'd', date: new Date(),
        accountId: ACC_A,
      },
    });

    expect(await LedgerService.deriveBalance(USER, ACC_A)).toBe(1300);
  });

  test('transferência debita origem e credita destino', async () => {
    prisma.account.create({
      data: { id: ACC_A, userId: USER, name: 'A', type: 'checking', balance: 0 },
    });
    prisma.account.create({
      data: { id: ACC_B, userId: USER, name: 'B', type: 'checking', balance: 0 },
    });
    prisma.transaction.create({
      data: {
        id: 't3', userId: USER, type: 'receita', amount: 1000, description: 'r', date: new Date(),
        accountId: ACC_A,
      },
    });
    prisma.transaction.create({
      data: {
        id: 't4', userId: USER, type: 'transferencia', amount: 400, description: 't', date: new Date(),
        accountId: ACC_A, targetAccountId: ACC_B,
      },
    });

    expect(await LedgerService.deriveBalance(USER, ACC_A)).toBe(600);
    expect(await LedgerService.deriveBalance(USER, ACC_B)).toBe(400);
  });
});

describe('LedgerService.deriveNetWorthDelta', () => {
  test('transferência não altera patrimônio líquido', async () => {
    prisma.transaction.create({
      data: {
        id: 't5', userId: USER, type: 'receita', amount: 1000, description: 'r', date: new Date(),
        accountId: ACC_A,
      },
    });
    prisma.transaction.create({
      data: {
        id: 't6', userId: USER, type: 'transferencia', amount: 400, description: 't', date: new Date(),
        accountId: ACC_A, targetAccountId: ACC_B,
      },
    });

    expect(await LedgerService.deriveNetWorthDelta(USER)).toBe(1000);
  });
});
