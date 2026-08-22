/**
 * finance.contract.js — contrato financeiro oficial (API / EN).
 * Fonte única de constantes e normalização no backend.
 */

export const TX_TYPES = Object.freeze(['receita', 'despesa', 'transferencia']);

export const ACCOUNT_TYPES = Object.freeze(['checking', 'savings', 'credit', 'investment']);

export const RECURRING_FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Normaliza referência de conta — só UUID passa para a API. */
export function normalizeAccountId(value) {
  if (value == null || value === '') return null;
  return isUuid(String(value)) ? String(value) : null;
}

export function assertTransferPayload(body) {
  if (body?.type !== 'transferencia') return null;
  if (!normalizeAccountId(body.accountId)) {
    return 'Transferência exige accountId (conta origem) como UUID';
  }
  if (!normalizeAccountId(body.targetAccountId)) {
    return 'Transferência exige targetAccountId (conta destino) como UUID';
  }
  if (body.accountId === body.targetAccountId) {
    return 'Origem e destino devem ser contas diferentes';
  }
  return null;
}

export function serializeTransaction(row) {
  if (!row) return row;
  return {
    id: row.id,
    type: row.type,
    amount: row.amount != null ? Number(row.amount) : 0,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
    accountId: row.accountId,
    targetAccountId: row.targetAccountId ?? null,
    tags: row.tags || [],
    notes: row.notes,
    recurring: !!row.recurring,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    deletedAt: row.deletedAt
      ? (row.deletedAt instanceof Date ? row.deletedAt.toISOString() : row.deletedAt)
      : null,
  };
}

export default {
  TX_TYPES,
  ACCOUNT_TYPES,
  RECURRING_FREQUENCIES,
  isUuid,
  normalizeAccountId,
  assertTransferPayload,
  serializeTransaction,
};
