/**
 * finance-audit.test.js — snapshot e registro de mutações financeiras.
 */
import { jest } from '@jest/globals';

const auditLogMock = jest.fn();

jest.unstable_mockModule('../../backend/domain/repositories/audit.repository.js', () => ({
  AuditRepository: { log: auditLogMock },
}));

const { snapshotTransaction, logFinancialMutation } = await import('../../backend/lib/finance-audit.js');

describe('finance-audit', () => {
  beforeEach(() => {
    auditLogMock.mockReset();
    auditLogMock.mockResolvedValue({ id: 'audit-1' });
  });

  test('snapshotTransaction captura campos mínimos sem PII livre', () => {
    const snap = snapshotTransaction({
      id: 'tx-1',
      type: 'despesa',
      amount: 42.5,
      category: 'Alimentação',
      accountId: 'acc-1',
      targetAccountId: null,
      date: new Date('2026-01-15T12:00:00.000Z'),
      deletedAt: null,
      description: 'Mercado do bairro',
    });

    expect(snap).toEqual({
      id: 'tx-1',
      type: 'despesa',
      amount: 42.5,
      category: 'Alimentação',
      accountId: 'acc-1',
      targetAccountId: null,
      date: '2026-01-15T12:00:00.000Z',
      deletedAt: null,
    });
    expect(snap.description).toBeUndefined();
  });

  test('logFinancialMutation persiste previous/next e correlationId', async () => {
    const previous = { id: 'tx-1', amount: 10 };
    const next = { id: 'tx-1', amount: 20 };

    await logFinancialMutation({
      userId: 'user-1',
      action: 'transaction_update',
      resourceId: 'tx-1',
      previous,
      next,
      origin: { ipAddress: '127.0.0.1', userAgent: 'jest', correlationId: 'trace-abc' },
    });

    expect(auditLogMock).toHaveBeenCalledWith({
      userId: 'user-1',
      action: 'transaction_update',
      resource: 'transaction',
      resourceId: 'tx-1',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      metadata: { correlationId: 'trace-abc', previous, next },
    });
  });
});
