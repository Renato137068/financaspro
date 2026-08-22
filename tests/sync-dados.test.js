/**
 * sync-dados.test.js — dados locais não desaparecem com snapshot remoto (Fase 1).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadDados() {
  const storage = new Map();
  const mockLs = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const dispatchLog = [];

  const ctx = vm.createContext({
    localStorage: mockLs,
    setTimeout, clearTimeout,
    Date, Math, JSON, parseInt, parseFloat, isNaN, Object, Array, String, Number,
    CONFIG: {
      STORAGE_TRANSACOES: 'fp-transacoes',
      STORAGE_CONFIG: 'fp-config',
      STORAGE_CONTAS: 'fp-contas',
      STORAGE_OUTBOX: 'fp-outbox',
      DEFAULT_CONFIG: {
        syncV2Enabled: true, metas: [], contasPagar: [], assinaturas: [],
        patrimonio: { ativos: [], dividas: [] }, openFinance: { connections: [] },
      },
    },
    UTILS: {
      gerarId: () => 'legacy-id',
      gerarUuid: () => '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      verificarStorageDisponivel: () => ({ disponivel: true }),
    },
    APP_STORE: { dispatch: (a) => dispatchLog.push(a), hydrateFromDados: () => {} },
    ACTIONS: { TRANSACAO_CRIAR: 't/c', TRANSACAO_EDITAR: 't/e', TRANSACAO_DELETAR: 't/d', SYNC_PENDENTE: 's/p' },
    module: { exports: {} },
  });

  // SYNC_MERGE entra como objeto já carregado, em vez de ser executado de novo
  // dentro deste vm. Cada execução extra do mesmo arquivo cria outra cópia
  // instrumentada do mesmo caminho absoluto; o provider v8 mescla todas e o
  // relatório passa a mostrar como "sem cobertura" o que só não foi exercitado
  // NAQUELA cópia. Uma instância compartilhada mede o módulo, não o arranjo.
  ctx.SYNC_MERGE = require('../js/core/sync-merge.js');

  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'sync-engine.js'), 'utf8'), ctx, {
    filename: path.join(__dirname, '..', 'js', 'core', 'sync-engine.js'),
  });

  const dadosFile = path.join(__dirname, '..', 'js', 'core', 'dados.js');
  vm.runInContext(fs.readFileSync(dadosFile, 'utf8'), ctx, { filename: dadosFile });
  const D = ctx.DADOS;
  D._apiBaseUrl = () => 'http://localhost:4000';
  ctx.SYNC_ENGINE._storage = mockLs;
  return { D, storage, SYNC_ENGINE: ctx.SYNC_ENGINE };
}

describe('DADOS — merge seguro (Fase 1)', () => {
  test('snapshot remoto não apaga transação local pendente', () => {
    const { D } = loadDados();
    D.salvarTransacao({ tipo: 'despesa', valor: 100, descricao: 'Local offline', categoria: 'outro', data: '2026-07-09' });
    expect(D.getTransacoes()).toHaveLength(1);

    D._mergeSnapshotLocal({
      transactions: [{
        id: '9c858901-8a57-4791-81fe-4c455b099bc9',
        type: 'despesa', amount: 999, description: 'Remoto', category: 'outro',
        date: '2026-07-09T00:00:00.000Z', updatedAt: '2026-07-09T12:00:00.000Z',
      }],
    });

    const txs = D.getTransacoes();
    expect(txs.some((t) => t.descricao === 'Local offline')).toBe(true);
    expect(txs.some((t) => t.descricao === 'Remoto')).toBe(true);
  });

  test('getTransacoes oculta tombstones locais', () => {
    const { D } = loadDados();
    D.salvarTransacao({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', tipo: 'despesa', valor: 1, descricao: 'x', categoria: 'outro', data: '2026-07-09' });
    D.deletarTransacao('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(D.getTransacoes()).toHaveLength(0);
    expect(D.getTransacoesRaw().some((t) => t.deletedAt)).toBe(true);
  });
});
