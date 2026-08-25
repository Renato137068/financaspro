/**
 * finance.contract.test.js — contrato backend (Fase 2).
 */
import {
  normalizeAccountId,
  assertTransferPayload,
  serializeTransaction,
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
