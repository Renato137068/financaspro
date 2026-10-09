/**
 * integridade-sync.test.js — o que muda sem rede chega à nuvem depois, e o que
 * foi excluído não volta (auditoria de integridade de dados, 2026-10-09).
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

function loadDados(opts) {
  opts = opts || {};
  const storage = new Map();
  const mockLs = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  };
  const toasts = [];
  const ctx = vm.createContext({
    localStorage: mockLs,
    setTimeout, clearTimeout, Promise,
    Date, Math, JSON, parseInt, parseFloat, isNaN, Object, Array, String, Number, Error,
    console: { warn() {}, error() {}, info() {}, log() {} },
    CONFIG: {
      STORAGE_TRANSACOES: 'fp-transacoes',
      STORAGE_CONFIG: 'fp-config',
      STORAGE_CONTAS: 'fp-contas',
      DEFAULT_CONFIG: { metas: [], contasPagar: [], assinaturas: [] },
    },
    UTILS: {
      gerarId: () => 'id-' + Math.random().toString(36).slice(2, 8),
      gerarUuid: () => '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      verificarStorageDisponivel: () => ({ disponivel: true }),
      mostrarToast: (m, t) => toasts.push({ m, t }),
    },
    APP_STORE: { dispatch: () => {}, hydrateFromDados: () => {} },
    ACTIONS: { TRANSACAO_CRIAR: 't/c', TRANSACAO_EDITAR: 't/e', TRANSACAO_DELETAR: 't/d', CONFIG_SALVAR: 'c/s', CONTAS_SALVAR: 'k/s' },
    module: { exports: {} },
  });
  ctx.SYNC_MERGE = carregarScript('js/core/sync-merge.js');
  ctx.FINANCE_CONTRACT = carregarScript('js/core/finance-contract.js');
  ['ORCAMENTO', 'LOCAL_CRYPTO', 'PERSIST_QUEUE', 'SESSION_LOG', 'INIT_MODALS', 'BILLING', 'OBS']
    .forEach((nome) => { ctx[nome] = undefined; });
  ctx.IDB_KV = opts.idb;
  rodarNoContexto(ctx, path.join(__dirname, '..', 'js', 'core', 'dados.js'));
  const D = ctx.DADOS;
  D._nuvemAtiva = () => opts.nuvem !== false;
  const enviados = [];
  ['_pushTransacaoApi', '_deleteTransacaoApi', '_pushContasApi', '_pushConfigApi', '_deleteOrcamentoApi'].forEach((nome) => {
    D[nome] = (arg) => { enviados.push({ nome, arg }); return Promise.resolve(arg); };
  });
  return { D, enviados, toasts, storage: mockLs };
}

const ANTES = '2026-07-01T10:00:00.000Z';

function txNuvem(id, extra) {
  return Object.assign({
    id, type: 'expense', amount: 10, description: 'Mercado', category: 'alimentacao',
    date: '2026-07-01T00:00:00.000Z', updatedAt: ANTES, deletedAt: null,
  }, extra || {});
}

describe('exclusão de lançamento com a nuvem ligada', () => {
  test('excluir sem rede não faz o lançamento voltar no pull seguinte', () => {
    const { D } = loadDados();
    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1')] });
    expect(D.getTransacoes()).toHaveLength(1);

    D.deletarTransacao('tx-1'); // o aviso à nuvem se perdeu (sem rede)
    expect(D.getTransacoes()).toHaveLength(0);

    const enviados = [];
    D._deleteTransacaoApi = (id) => { enviados.push(id); return Promise.resolve(true); };
    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1')] }); // nuvem ainda tem viva
    expect(D.getTransacoes()).toHaveLength(0);
    expect(enviados).toEqual(['tx-1']); // e o pull repete o aviso
  });

  test('marca de exclusão sai quando a nuvem confirma', () => {
    const { D } = loadDados();
    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1')] });
    D.deletarTransacao('tx-1');
    expect(D.getTransacoesRaw()).toHaveLength(1);
    D._mergeSnapshotLocal({
      transactions: [txNuvem('tx-1', { deletedAt: '2026-07-02T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' })],
    });
    expect(D.getTransacoesRaw()).toHaveLength(0);
  });

  test('exclusão feita em outro aparelho chega aqui', () => {
    const { D } = loadDados();
    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1'), txNuvem('tx-2')] });
    D._mergeSnapshotLocal({
      transactions: [txNuvem('tx-1', { deletedAt: '2026-07-03T00:00:00.000Z' }), txNuvem('tx-2')],
    });
    expect(D.getTransacoes().map((t) => t.id)).toEqual(['tx-2']);
  });

  test('sem nuvem, excluir continua tirando da lista na hora', () => {
    const { D } = loadDados({ nuvem: false });
    D.salvarTransacao({ id: 'tx-1', tipo: 'despesa', valor: 1, descricao: 'x', categoria: 'outro', data: '2026-07-09' });
    D.deletarTransacao('tx-1');
    expect(D.getTransacoesRaw()).toHaveLength(0);
  });
});

describe('edição feita sem rede', () => {
  test('lançamento editado aqui e mais novo que a nuvem é reenviado no pull', () => {
    const { D, enviados } = loadDados();
    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1')] });
    const tx = D.getTransacoes()[0];
    D.salvarTransacao(Object.assign({}, tx, { valor: 99 }));
    enviados.length = 0;

    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1')] });
    expect(D.getTransacoes()[0].valor).toBe(99);
    expect(enviados.filter((e) => e.nome === '_pushTransacaoApi').map((e) => e.arg.valor)).toEqual([99]);
  });

  test('nada é reenviado quando a nuvem já está em dia', () => {
    const { D, enviados } = loadDados();
    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1')] });
    D._mergeSnapshotLocal({ transactions: [txNuvem('tx-1')] });
    expect(enviados.filter((e) => e.nome !== '_pushConfigApi')).toEqual([]);
  });
});

describe('contas e orçamentos', () => {
  const conta = { id: 'c-1', name: 'Nubank', type: 'checking', balance: 0, active: true, updatedAt: ANTES };

  test('excluir conta a desativa e avisa a nuvem; o pull não a traz de volta', () => {
    const { D, enviados } = loadDados();
    D._mergeSnapshotLocal({ accounts: [conta] });
    expect(D.getContas()).toHaveLength(1);
    D.deletarConta('c-1');
    expect(D.getContas()).toHaveLength(0);
    const push = enviados.find((e) => e.nome === '_pushContasApi');
    expect(push.arg.ativo).toBe(false);

    D._mergeSnapshotLocal({ accounts: [conta] }); // nuvem ainda ativa (aviso perdido)
    expect(D.getContas()).toHaveLength(0);
  });

  test('editar conta existente sobe na hora', () => {
    const { D, enviados } = loadDados();
    D._mergeSnapshotLocal({ accounts: [conta] });
    D.upsertConta({ id: 'c-1', nome: 'Nubank PF' });
    expect(enviados.some((e) => e.nome === '_pushContasApi' && e.arg.nome === 'Nubank PF')).toBe(true);
  });

  test('excluir orçamento desativa a cópia da nuvem', () => {
    const { D, enviados } = loadDados();
    D.upsertOrcamento('lazer', 200);
    D.deletarOrcamento('lazer');
    expect(enviados.filter((e) => e.nome === '_deleteOrcamentoApi').map((e) => e.arg)).toEqual(['lazer']);
  });
});

describe('fila de gravação no IndexedDB', () => {
  function idbFalso(respostas) {
    const gravado = {};
    return {
      gravado,
      ultimoErro: null,
      isReady: () => true,
      init: () => Promise.resolve(true),
      get: (k) => Promise.resolve(gravado[k] || null),
      set(k, v) {
        const ok = respostas.length ? respostas.shift() : true;
        if (ok === 'rejeita') return Promise.reject(new Error('cifra falhou'));
        if (ok) gravado[k] = v; else this.ultimoErro = { name: 'QuotaExceededError' };
        return Promise.resolve(!!ok);
      },
    };
  }

  test('uma falha não trava as gravações seguintes e aguardarDisco a reporta', async () => {
    const idb = idbFalso(['rejeita', true]);
    const { D, toasts } = loadDados({ idb, nuvem: false });
    D._transacoesBackend = 'idb';
    D._transacoesCache = [];
    D.salvarTransacao({ id: 'a', tipo: 'despesa', valor: 1, descricao: 'a', categoria: 'outro', data: '2026-07-09' });
    expect(await D.aguardarDisco()).toBe(false);
    expect(toasts).toHaveLength(1);

    D.salvarTransacao({ id: 'b', tipo: 'despesa', valor: 2, descricao: 'b', categoria: 'outro', data: '2026-07-09' });
    expect(await D.aguardarDisco()).toBe(true);
    expect(JSON.parse(idb.gravado['fp-transacoes']).map((t) => t.id)).toEqual(['a', 'b']);
  });

  test('migração para o IndexedDB só troca o localStorage depois de gravar', async () => {
    const idb = idbFalso([false]);
    const { D, storage } = loadDados({ idb, nuvem: false });
    storage.setItem('fp-transacoes', '[{"id":"velho"}]');
    await D._ativarBackendIdbTransacoes([{ id: 'velho' }, { id: 'novo' }]);
    expect(storage.getItem('fp-transacoes')).toBe('[{"id":"velho"}]');
    expect(storage.getItem('fp-tx-backend')).toBeNull();

    await D._ativarBackendIdbTransacoes([{ id: 'velho' }, { id: 'novo' }]);
    expect(storage.getItem('fp-tx-backend')).toBe('idb');
    expect(storage.getItem('fp-transacoes')).toBe(D.TX_IDB_SENTINEL);
  });
});
