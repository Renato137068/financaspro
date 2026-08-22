// backend/lib/cursor-pagination.js — codificação de cursor estável (date/id ou updatedAt/id)

/** @param {{ date?: Date|string, updatedAt?: Date|string, id: string }} fields */
export function encodeCursor(fields) {
  const payload = {
    d: fields.updatedAt != null
      ? (fields.updatedAt instanceof Date ? fields.updatedAt.toISOString() : fields.updatedAt)
      : (fields.date instanceof Date ? fields.date.toISOString() : fields.date),
    i: fields.id,
    k: fields.updatedAt != null ? 'u' : 'd',
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** @returns {{ ts: Date, id: string, kind: 'u'|'d' }|null} */
export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const { d, i, k } = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!d || !i) return null;
    return { ts: new Date(d), id: i, kind: k === 'u' ? 'u' : 'd' };
  } catch {
    return null;
  }
}

/** Paginação por data decrescente (listagem de extrato). */
export function cursorWhereDateDesc(cursor) {
  if (!cursor || cursor.kind !== 'd') return {};
  return {
    OR: [
      { date: { lt: cursor.ts } },
      { date: cursor.ts, id: { lt: cursor.id } },
    ],
  };
}

/** Paginação por updatedAt crescente (delta de sync). */
export function cursorWhereUpdatedAsc(since, cursor) {
  const sinceDate = since ? new Date(since) : new Date(0);
  const base = { updatedAt: { gt: sinceDate } };
  if (!cursor || cursor.kind !== 'u') return base;
  return {
    AND: [
      base,
      {
        OR: [
          { updatedAt: { gt: cursor.ts } },
          { updatedAt: cursor.ts, id: { gt: cursor.id } },
        ],
      },
    ],
  };
}
