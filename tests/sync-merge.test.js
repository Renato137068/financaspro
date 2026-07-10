/**
 * sync-merge.test.js — fusão de delta + outbox no cliente (#2, §7).
 * Prova que os bugs de perda de dados D1/D2/D3 ficam resolvidos.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Object, isNaN });
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'sync-merge.js' });
  return ctx.SYNC_MERGE;
}
const SM = load();
const T1 = '2026-07-09T10:00:00Z';
const T2 = '2026-07-09T11:00:00Z';

describe('SYNC_MERGE.mergeDelta', () => {
  test('D1: registro pendente NÃO é sobrescrito pelo servidor', () => {
    const local = [{ id: 'a', descricao: 'local não sincronizado', updatedAt: T1 }];
    const delta = [{ id: 'a', descricao: 'versão servidor', updatedAt: T2 }];
    const r = SM.mergeDelta(local, ['a'], delta);
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe('local não sincronizado'); // protegido
  });

  test('D2: tombstone remove do cache (sem ressurreição)', () => {
    const local = [{ id: 'b', descricao: 'gasto', updatedAt: T1 }];
    const delta = [{ id: 'b', deletedAt: T2 }];
    expect(SM.mergeDelta(local, [], delta)).toEqual([]);
  });

  test('D2b: tombstone de item pendente é ignorado (pendente vence)', () => {
    const local = [{ id: 'b', descricao: 'editado offline', updatedAt: T2 }];
    const delta = [{ id: 'b', deletedAt: T1 }];
    const r = SM.mergeDelta(local, ['b'], delta);
    expect(r).toHaveLength(1);
  });

  test('D3: merge por registro — delta mais novo sobrescreve', () => {
    const local = [{ id: 'c', valor: 10, updatedAt: T1 }];
    const delta = [{ id: 'c', valor: 20, updatedAt: T2 }];
    expect(SM.mergeDelta(local, [], delta)[0].valor).toBe(20);
  });

  test('D3b: delta mais antigo NÃO sobrescreve local mais novo', () => {
    const local = [{ id: 'c', valor: 99, updatedAt: T2 }];
    const delta = [{ id: 'c', valor: 5, updatedAt: T1 }];
    expect(SM.mergeDelta(local, [], delta)[0].valor).toBe(99);
  });

  test('registro novo do servidor é adicionado', () => {
    const r = SM.mergeDelta([], [], [{ id: 'd', valor: 1, updatedAt: T1 }]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('d');
  });

  test('tombstone de item inexistente é no-op', () => {
    expect(SM.mergeDelta([], [], [{ id: 'z', deletedAt: T1 }])).toEqual([]);
  });

  test('não muda nada com delta vazio', () => {
    const local = [{ id: 'a', updatedAt: T1 }];
    expect(SM.mergeDelta(local, [], [])).toHaveLength(1);
  });

  test('aceita Set em pendingIds', () => {
    const local = [{ id: 'a', v: 'local', updatedAt: T1 }];
    const delta = [{ id: 'a', v: 'srv', updatedAt: T2 }];
    const r = SM.mergeDelta(local, new Set(['a']), delta);
    expect(r[0].v).toBe('local');
  });
});

describe('SYNC_MERGE.outboxEnqueue', () => {
  test('deduplica upserts do mesmo registro (mantém o último)', () => {
    let fila = [];
    fila = SM.outboxEnqueue(fila, { opId: '1', entity: 'tx', id: 'a', op: 'upsert', payload: { v: 1 } });
    fila = SM.outboxEnqueue(fila, { opId: '2', entity: 'tx', id: 'a', op: 'upsert', payload: { v: 2 } });
    expect(fila).toHaveLength(1);
    expect(fila[0].payload.v).toBe(2);
  });

  test('delete suprime upsert anterior do mesmo id', () => {
    let fila = SM.outboxEnqueue([], { opId: '1', entity: 'tx', id: 'a', op: 'upsert' });
    fila = SM.outboxEnqueue(fila, { opId: '2', entity: 'tx', id: 'a', op: 'delete' });
    expect(fila).toHaveLength(1);
    expect(fila[0].op).toBe('delete');
  });

  test('mantém mutações de ids diferentes', () => {
    let fila = SM.outboxEnqueue([], { opId: '1', entity: 'tx', id: 'a', op: 'upsert' });
    fila = SM.outboxEnqueue(fila, { opId: '2', entity: 'tx', id: 'b', op: 'upsert' });
    expect(fila).toHaveLength(2);
  });
});

describe('SYNC_MERGE.outboxAckRemove', () => {
  test('remove confirmados por opId, mantém não confirmados', () => {
    const fila = [
      { opId: '1', id: 'a' },
      { opId: '2', id: 'b' },
      { opId: '3', id: 'c' },
    ];
    const results = [{ opId: '1', action: 'apply' }, { opId: '2', action: 'server-wins' }];
    const r = SM.outboxAckRemove(fila, results);
    expect(r.map((m) => m.opId)).toEqual(['3']);
  });

  test('fila vazia / results vazios', () => {
    expect(SM.outboxAckRemove([], [])).toEqual([]);
    expect(SM.outboxAckRemove([{ opId: '1' }], []).length).toBe(1);
  });
});
