/**
 * finance.contract.test.js — contrato backend (Fase 2).
 */
import {
  isUuid,
  normalizeAccountId,
  assertTransferPayload,
  serializeTransaction,
  serializeAccount,
  serializeRecurring,
  serializeBudget,
  TX_TYPES,
} from '../../backend/domain/contracts/finance.contract.js';

const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UUID_B = '9c858901-8a57-4791-81fe-4c455b099bc9';

describe('finance.contract — backend', () => {
  test('TX_TYPES inclui transferencia', () => {
    expect(TX_TYPES).toContain('transferencia');
  });

  test('normalizeAccountId rejeita nome de banco', () => {
    expect(normalizeAccountId('Nubank')).toBeNull();
    expect(normalizeAccountId(UUID_A)).toBe(UUID_A);
  });

  test('assertTransferPayload exige UUIDs distintos', () => {
    expect(assertTransferPayload({
      type: 'transferencia', accountId: UUID_A, targetAccountId: UUID_B,
    })).toBeNull();
    expect(assertTransferPayload({
      type: 'transferencia', accountId: UUID_A,
    })).toMatch(/targetAccountId/);
    expect(assertTransferPayload({ type: 'despesa' })).toBeNull();
  });

  test('serializeTransaction inclui targetAccountId', () => {
    const row = serializeTransaction({
      id: '1', type: 'transferencia', amount: 100, description: 'T', category: 'transferencia',
      date: new Date('2026-08-05'), accountId: UUID_A, targetAccountId: UUID_B,
      tags: [], recurring: false, createdAt: new Date(), updatedAt: new Date(),
    });
    expect(row.targetAccountId).toBe(UUID_B);
  });
});

describe('finance.contract — isUuid e normalização de ramos', () => {
  test('isUuid rejeita não-string e formato inválido, aceita UUID', () => {
    expect(isUuid(123)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid('nao-uuid')).toBe(false);
    expect(isUuid(UUID_A)).toBe(true);
  });

  test('normalizeAccountId trata nulo e string vazia como null', () => {
    expect(normalizeAccountId(null)).toBeNull();
    expect(normalizeAccountId('')).toBeNull();
    expect(normalizeAccountId(UUID_A)).toBe(UUID_A);
  });

  test('assertTransferPayload cobre origem ausente e contas iguais', () => {
    expect(assertTransferPayload({ type: 'transferencia' })).toMatch(/accountId/);
    expect(assertTransferPayload({
      type: 'transferencia', accountId: UUID_A, targetAccountId: UUID_A,
    })).toMatch(/diferentes/);
  });
});

describe('finance.contract — serializadores cobrem ambos os ramos', () => {
  test('serializadores devolvem entrada falsy inalterada', () => {
    expect(serializeTransaction(null)).toBeNull();
    expect(serializeAccount(undefined)).toBeUndefined();
    expect(serializeRecurring(null)).toBeNull();
    expect(serializeBudget(undefined)).toBeUndefined();
  });

  test('serializeTransaction: ramos de string/null (sem Date, amount nulo, deletedAt string)', () => {
    const out = serializeTransaction({
      id: '2', type: 'despesa', amount: null, description: 'X', category: 'geral',
      date: '2026-08-05', accountId: UUID_A, // targetAccountId ausente -> null
      recurring: 1, // truthy -> !!
      createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z',
      deletedAt: '2026-08-06T00:00:00.000Z',
    });
    expect(out.amount).toBe(0);
    expect(out.targetAccountId).toBeNull();
    expect(out.tags).toEqual([]);
    expect(out.recurring).toBe(true);
    expect(out.date).toBe('2026-08-05');
    expect(out.deletedAt).toBe('2026-08-06T00:00:00.000Z');
  });

  test('serializeTransaction: deletedAt como Date é convertido; ausente vira null', () => {
    const comDate = serializeTransaction({ id: '3', deletedAt: new Date('2026-08-07') });
    expect(comDate.deletedAt).toBe('2026-08-07T00:00:00.000Z');
    const semDelete = serializeTransaction({ id: '4' });
    expect(semDelete.deletedAt).toBeNull();
  });

  test('serializeAccount: defaults e active=false', () => {
    const a = serializeAccount({
      id: 'a1', name: 'C', type: 'checking', balance: null, // -> 0
      active: false, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
    });
    expect(a.balance).toBe(0);
    expect(a.currency).toBe('BRL');
    expect(a.institution).toBeNull();
    expect(a.active).toBe(false);
    expect(a.createdAt).toBe('2026-01-01T00:00:00.000Z');

    const b = serializeAccount({
      id: 'a2', name: 'D', type: 'savings', balance: 50, currency: 'USD',
      institution: 'Banco', active: true, createdAt: '2026-01-01', updatedAt: '2026-01-02',
    });
    expect(b.currency).toBe('USD');
    expect(b.institution).toBe('Banco');
    expect(b.active).toBe(true);
    expect(b.createdAt).toBe('2026-01-01');
  });

  test('serializeRecurring: endDate presente (Date/string) e ausente', () => {
    const comData = serializeRecurring({
      id: 'r1', type: 'despesa', amount: null, frequency: 'monthly',
      startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      nextDue: new Date('2026-02-01'), active: false, createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
    expect(comData.amount).toBe(0);
    expect(comData.category).toBeNull();
    expect(comData.endDate).toBe('2026-12-31T00:00:00.000Z');
    expect(comData.active).toBe(false);

    const semFim = serializeRecurring({
      id: 'r2', type: 'receita', amount: 10, category: 'salario', frequency: 'monthly',
      startDate: '2026-01-01', endDate: null, nextDue: '2026-02-01', active: true,
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    });
    expect(semFim.category).toBe('salario');
    expect(semFim.endDate).toBeNull();
    expect(semFim.startDate).toBe('2026-01-01');
  });

  test('serializeBudget: defaults, active=false e datas Date/string', () => {
    const b1 = serializeBudget({
      id: 'b1', category: 'alimentacao', limit: null, active: false,
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
    });
    expect(b1.limit).toBe(0);
    expect(b1.period).toBe('monthly');
    expect(b1.active).toBe(false);
    expect(b1.createdAt).toBe('2026-01-01T00:00:00.000Z');

    const b2 = serializeBudget({
      id: 'b2', category: 'lazer', limit: 300, period: 'weekly', active: true,
      createdAt: '2026-01-01', updatedAt: '2026-01-02',
    });
    expect(b2.period).toBe('weekly');
    expect(b2.active).toBe(true);
    expect(b2.updatedAt).toBe('2026-01-02');
  });
});
