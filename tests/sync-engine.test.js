/**
 * sync-engine.test.js — outbox, retry, pull merge e persistência (Fase 1).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

function loadEngine(deps) {
  const ctx = vm.createContext({
    Date, Math, Number, String, Array, Object, isNaN, setTimeout, clearTimeout,
    CONFIG: deps.CONFIG,
    SYNC_MERGE: deps.SYNC_MERGE,
    UTILS: deps.UTILS,
    DADOS: deps.DADOS,
    APP_STORE: deps.APP_STORE,
    ACTIONS: deps.ACTIONS,
    module: { exports: {} },
  });
  // SYNC_MERGE entra pelo contexto (deps.SYNC_MERGE), já carregado via require.
  //
  // Antes o arquivo era TAMBÉM executado aqui dentro do vm, e o `var
  // SYNC_MERGE` dessa execução sobrescrevia a instância injetada. FinançasProvam
  // duas cópias instrumentadas do mesmo caminho absoluto: a do vm, usada de
  // fato, e a do require, nunca chamada. O provider v8 mesclava as duas e
  // reportava sync-merge.js com 66% de linhas e 54% de funções — quando os
  // testes cobrem o módulo inteiro. O piso de 95% do jest.config falhava por
  // ruído de medição, não por falta de teste.
  const engineFile = path.join(__dirname, '..', 'js', 'core', 'sync-engine.js');
  vm.runInContext(fs.readFileSync(engineFile, 'utf8'), ctx, { filename: engineFile });
  const engine = ctx.SYNC_ENGINE;
  engine._storage = deps.storage;
  engine._reset();
  return engine;
}

const CONFIG = {
  STORAGE_OUTBOX: 'fp-outbox',
  STORAGE_SYNC_CURSOR: 'fp-sync-cursor',
  STORAGE_TRANSACOES: 'fp-transacoes',
};
const SM = require('../js/core/sync-merge.js');
const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const T1 = '2026-07-09T10:00:00.000Z';
const T2 = '2026-07-09T11:00:00.000Z';

describe('SYNC_ENGINE — Fase 1', () => {
  let storage;
  let transacoes;
  let engine;

  beforeEach(() => {
    storage = mockStorage();
    transacoes = [];
    const DADOS = {
      getTransacoesRaw: () => transacoes.slice(),
      getTransacoes: () => transacoes.filter((t) => !t.deletedAt),
      _storageSetTransacoes: (list) => { transacoes = list.slice(); storage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes)); },
      _txPtToEn: (tx) => ({ type: tx.tipo, amount: tx.valor, description: tx.descricao, category: tx.categoria, date: tx.data + 'T00:00:00.000Z' }),
      _txEnToPt: (tx) => ({ id: tx.id, tipo: tx.type, valor: Number(tx.amount), descricao: tx.description, categoria: tx.category, data: tx.date.slice(0, 10), updatedAt: tx.updatedAt, deletedAt: tx.deletedAt }),
      getConfig: () => ({ recorrentes: [] }),
      salvarConfig: (cfg) => cfg,
      _storageSetRaw: (k, v) => storage.setItem(k, v),
      getContasRaw: () => [],
    };
    engine = loadEngine({
      CONFIG, SYNC_MERGE: SM, UTILS: { gerarUuid: () => UUID },
      DADOS, storage, APP_STORE: null, ACTIONS: null,
    });
  });

  test('criação offline enfileira na outbox e persiste após reload simulado', () => {
    const tx = { id: UUID, tipo: 'despesa', valor: 50, descricao: 'Cafe', categoria: 'alimentacao', data: '2026-07-09', updatedAt: T1 };
    engine.enqueueTransaction('upsert', tx);
    expect(engine.outboxCount()).toBe(1);
    const reloaded = loadEngine({ CONFIG, SYNC_MERGE: SM, UTILS: { gerarUuid: () => UUID }, DADOS: { getTransacoesRaw: () => [], _storageSetTransacoes: () => {}, _txPtToEn: () => ({}), _txEnToPt: (x) => x }, storage, APP_STORE: null, ACTIONS: null });
    expect(reloaded.outboxCount()).toBe(1);
  });

  test('edição antes da sync deduplica outbox', () => {
    const tx = { id: UUID, tipo: 'despesa', valor: 10, descricao: 'v1', updatedAt: T1 };
    engine.enqueueTransaction('upsert', tx);
    engine.enqueueTransaction('upsert', { ...tx, valor: 20, descricao: 'v2', updatedAt: T2 });
    expect(engine.loadOutbox()).toHaveLength(1);
    expect(engine.loadOutbox()[0].payload.amount).toBe(20);
  });

  test('exclusão offline enfileira delete', () => {
    engine.enqueueTransaction('delete', { id: UUID, updatedAt: T2, deletedAt: T2 });
    expect(engine.loadOutbox()[0].op).toBe('delete');
  });

  test('pull não sobrescreve registro pendente (D1)', () => {
    transacoes = [{ id: UUID, tipo: 'despesa', valor: 99, descricao: 'local', updatedAt: T2 }];
    engine.enqueueTransaction('upsert', transacoes[0]);
    const apiFetch = () => Promise.resolve({
      data: { cursor: T2, transactions: [{ id: UUID, type: 'despesa', amount: 1, description: 'servidor', category: 'outro', date: T1, updatedAt: T2 }] },
    });
    return engine.pull(apiFetch).then(() => {
      expect(transacoes[0].descricao).toBe('local');
    });
  });

  test('falha de rede mantém outbox', () => {
    engine.enqueueTransaction('upsert', { id: UUID, tipo: 'despesa', valor: 1, descricao: 'x', updatedAt: T1 });
    const apiFetch = () => Promise.reject(new Error('network'));
    return engine.flush(apiFetch).then((r) => {
      expect(r.ok).toBe(false);
      expect(engine.outboxCount()).toBe(1);
    });
  });

  test('flush bem-sucedido remove da outbox', () => {
    engine.enqueueTransaction('upsert', { id: UUID, tipo: 'despesa', valor: 1, descricao: 'x', updatedAt: T1 });
    const apiFetch = () => Promise.resolve({
      data: { results: [{ opId: engine.loadOutbox()[0].opId, id: UUID, action: 'apply' }] },
    });
    return engine.flush(apiFetch).then((r) => {
      expect(r.ok).toBe(true);
      expect(engine.outboxCount()).toBe(0);
    });
  });

  // Regressão: mutação enfileirada DURANTE o POST em voo não pode ser apagada
  // ao salvar a outbox reconciliada (perda de registro financeiro).
  function engineComUuidsUnicos(store) {
    var n = 0;
    return loadEngine({
      CONFIG, SYNC_MERGE: SM, UTILS: { gerarUuid: function() { return 'op-' + (++n); } },
      DADOS: {
        getTransacoesRaw: () => [], getTransacoes: () => [],
        _txPtToEn: (tx) => ({ type: tx.tipo, amount: tx.valor, description: tx.descricao, category: tx.categoria, date: (tx.data || '2026-07-09') + 'T00:00:00.000Z' }),
        _txEnToPt: (x) => x, getConfig: () => ({ recorrentes: [] }), salvarConfig: (c) => c,
      },
      storage: store, APP_STORE: null, ACTIONS: null,
    });
  }

  test('enqueue durante flush em voo sobrevive (sucesso)', () => {
    const eng = engineComUuidsUnicos(mockStorage());
    eng.enqueueTransaction('upsert', { id: 'id-A', tipo: 'despesa', valor: 1, descricao: 'A', data: '2026-07-09', updatedAt: T1 });
    const opIdA = eng.loadOutbox()[0].opId;
    const apiFetch = () => {
      // Concorrente: chega enquanto o POST de A está em voo.
      eng.enqueueTransaction('upsert', { id: 'id-B', tipo: 'despesa', valor: 2, descricao: 'B', data: '2026-07-09', updatedAt: T2 });
      return Promise.resolve({ data: { results: [{ opId: opIdA, id: 'id-A', action: 'apply' }] } });
    };
    return eng.flush(apiFetch).then(() => {
      const fila = eng.loadOutbox();
      expect(fila).toHaveLength(1);       // antes do fix: 0 (B perdida)
      expect(fila[0].id).toBe('id-B');    // A foi ackada; B sobreviveu
    });
  });

  test('enqueue durante flush em voo sobrevive (falha de rede)', () => {
    const eng = engineComUuidsUnicos(mockStorage());
    eng.enqueueTransaction('upsert', { id: 'id-A', tipo: 'despesa', valor: 1, descricao: 'A', data: '2026-07-09', updatedAt: T1 });
    const apiFetch = () => {
      eng.enqueueTransaction('upsert', { id: 'id-B', tipo: 'despesa', valor: 2, descricao: 'B', data: '2026-07-09', updatedAt: T2 });
      return Promise.reject(new Error('network'));
    };
    return eng.flush(apiFetch).then(() => {
      const fila = eng.loadOutbox();
      expect(fila).toHaveLength(2);       // antes do fix: 1 (B perdida)
      const a = fila.find((m) => m.id === 'id-A');
      const b = fila.find((m) => m.id === 'id-B');
      expect(a.attempts).toBe(1);         // a tentada teve attempts bumpado
      expect(b.attempts).toBe(0);         // a concorrente não
    });
  });

  test('orçamento legado sem id sobrevive ao apply de delta (não é apagado)', () => {
    var cfg = { orcamentos: { alimentacao: { limite: 500, definidoEm: T1 } }, recorrentes: [] };
    const eng = loadEngine({
      CONFIG, SYNC_MERGE: SM, UTILS: { gerarUuid: () => UUID },
      DADOS: {
        getConfig: () => cfg,
        salvarConfig: (c) => { cfg = c; return c; },
        getTransacoesRaw: () => [], getTransacoes: () => [],
        _txPtToEn: (x) => x, _txEnToPt: (x) => x,
      },
      storage: mockStorage(), APP_STORE: null, ACTIONS: null,
    });
    // Delta vazio: mesmo assim, o orçamento legado (sem id) não pode sumir.
    eng._applyBudgetsDelta([]);
    expect(cfg.orcamentos.alimentacao).toBeTruthy();
    expect(cfg.orcamentos.alimentacao.limite).toBe(500);
  });

  test('delta de orçamento do servidor prevalece sobre o legado da mesma categoria', () => {
    var cfg = { orcamentos: { alimentacao: { limite: 500, definidoEm: T1 } }, recorrentes: [] };
    const eng = loadEngine({
      CONFIG, SYNC_MERGE: SM, UTILS: { gerarUuid: () => UUID },
      DADOS: {
        getConfig: () => cfg,
        salvarConfig: (c) => { cfg = c; return c; },
        getTransacoesRaw: () => [], getTransacoes: () => [],
        _txPtToEn: (x) => x, _txEnToPt: (x) => x,
      },
      storage: mockStorage(), APP_STORE: null, ACTIONS: null,
    });
    // Sem FINANCE_CONTRACT no ctx de teste, _budgetEnToPt é identidade — então
    // o delta já vem em campos PT (categoria/limite).
    eng._applyBudgetsDelta([{ id: 'srv-1', categoria: 'alimentacao', limite: 800, updatedAt: T2 }]);
    expect(cfg.orcamentos.alimentacao.limite).toBe(800); // servidor autoritativo
  });

  test('retry re-enfileira rejeitados', () => {
    const mut = { id: UUID, tipo: 'despesa', valor: 1, descricao: 'x', updatedAt: T1 };
    engine.enqueueTransaction('upsert', mut);
    const opId = engine.loadOutbox()[0].opId;
    const apiFetch = () => Promise.resolve({
      data: { results: [{ opId, id: UUID, action: 'reject', reason: 'payload-invalido' }] },
    });
    return engine.flush(apiFetch).then(() => {
      expect(engine.outboxCount()).toBe(1);
      expect(engine.loadOutbox()[0].attempts).toBeGreaterThan(0);
    });
  });

  test('conflito server-wins dispara sem esvaziar local pendente', () => {
    transacoes = [{ id: UUID, descricao: 'local', updatedAt: T2 }];
    engine.enqueueTransaction('upsert', transacoes[0]);
    const opId = engine.loadOutbox()[0].opId;
    const apiFetch = () => Promise.resolve({
      data: { results: [{ opId, id: UUID, action: 'server-wins', status: 'stale', record: { id: UUID, description: 'srv' } }] },
    });
    return engine.flush(apiFetch).then(() => {
      expect(engine.outboxCount()).toBe(0);
    });
  });

  test('pullAll consome todas as páginas do delta', () => {
    var calls = 0;
    const apiFetch = () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          data: {
            hasMore: true,
            nextCursor: 'page2',
            cursor: T1,
            transactions: [{ id: UUID, type: 'despesa', amount: 1, description: 'a', category: 'outro', date: T1, updatedAt: T1 }],
          },
        });
      }
      return Promise.resolve({
        data: {
          hasMore: false,
          cursor: T2,
          transactions: [{ id: 'other-id', type: 'despesa', amount: 2, description: 'b', category: 'outro', date: T2, updatedAt: T2 }],
        },
      });
    };
    return engine.pullAll(apiFetch, null).then((r) => {
      expect(calls).toBe(2);
      expect(r.ok).toBe(true);
      expect(r.delta).toBe(2);
      expect(transacoes.length).toBeGreaterThanOrEqual(1);
    });
  });
});
