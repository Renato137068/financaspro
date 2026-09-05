/**
 * cursor-pagination.test.js — codificação e filtros de cursor.
 */
import {
  encodeCursor, decodeCursor, cursorWhereUpdatedAsc,
} from '../../backend/lib/cursor-pagination.js';

describe('cursor-pagination', () => {
  test('encode/decode round-trip por data', () => {
    const raw = encodeCursor({ date: '2026-01-15T00:00:00.000Z', id: 'tx-1' });
    const decoded = decodeCursor(raw);
    expect(decoded.kind).toBe('d');
    expect(decoded.id).toBe('tx-1');
    expect(decoded.ts.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  test('encode/decode round-trip por updatedAt', () => {
    const raw = encodeCursor({ updatedAt: '2026-02-01T12:00:00.000Z', id: 'tx-2' });
    const decoded = decodeCursor(raw);
    expect(decoded.kind).toBe('u');
    expect(decoded.id).toBe('tx-2');
  });

  test('cursor inválido retorna null', () => {
    expect(decodeCursor('%%%')).toBeNull();
  });

  test('cursorWhereUpdatedAsc combina since com paginação', () => {
    const since = '2026-01-01T00:00:00.000Z';
    const base = cursorWhereUpdatedAsc(since, null);
    expect(base.updatedAt.gt).toEqual(new Date(since));

    const cur = decodeCursor(encodeCursor({ updatedAt: since, id: 'a' }));
    const paged = cursorWhereUpdatedAsc(since, cur);
    expect(paged.AND).toHaveLength(2);
  });
});
