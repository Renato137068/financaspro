// backend/lib/finance-audit.js — auditoria de mutações financeiras (Fase 7)
import { AuditRepository } from '../domain/repositories/audit.repository.js';

/** Snapshot mínimo para auditoria — sem descrição livre (PII opcional). */
export function snapshotTransaction(tx) {
  if (!tx) return null;
  return {
    id: tx.id,
    type: tx.type,
    amount: Number(tx.amount),
    category: tx.category,
    accountId: tx.accountId ?? null,
    targetAccountId: tx.targetAccountId ?? null,
    date: tx.date instanceof Date ? tx.date.toISOString() : tx.date,
    deletedAt: tx.deletedAt instanceof Date ? tx.deletedAt.toISOString() : (tx.deletedAt ?? null),
  };
}

/**
 * Registra mutação financeira com valor anterior/novo e correlation ID.
 * @param {object} p
 * @param {string} p.userId
 * @param {string} p.action — transaction_create | transaction_update | transaction_delete
 * @param {string} p.resourceId
 * @param {object|null} p.previous
 * @param {object|null} p.next
 * @param {object} [p.origin] — ipAddress, userAgent, correlationId
 */
export async function logFinancialMutation({
  userId, action, resourceId, previous, next, origin,
}) {
  return AuditRepository.log({
    userId,
    action,
    resource: 'transaction',
    resourceId,
    ipAddress: origin?.ipAddress ?? null,
    userAgent: origin?.userAgent ?? null,
    metadata: {
      correlationId: origin?.correlationId ?? null,
      previous,
      next,
    },
  });
}
