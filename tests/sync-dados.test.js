/**
 * sync-dados.test.js — dados locais não desaparecem com snapshot remoto (Fase 1).
 *
 * O snapshot é o que o pull do Supabase traz (SUPA_SYNC.pull →
 * DADOS._mergeSnapshotLocal, em js/core/dados-nuvem.js).
 */
const { carregarScript } = require('./helpers/carregar-script.cjs');
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

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
      DEFAULT_CONFIG: {
        metas: [], contasPagar: [], assinaturas: [],
        patrimonio: { ativos: [], dividas: [] }, openFinance: { connections: [] },
      },
    },
    UTILS: {
      gerarId: () => 'legacy-id',
      gerarUuid: () => '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      verificarStorageDisponivel: () => ({ disponivel: true }),
    },
    APP_STORE: { dispatch: (a) => dispatchLog.push(a), hydrateFromDados: () => {} },
    ACTIONS: { TRANSACAO_CRIAR: 't/c', TRANSACAO_EDITAR: 't/e', TRANSACAO_DELETAR: 't/d', SYNC_PENDENTE: 's/p', CONFIG_SALVAR: 'c/s', CONTAS_SALVAR: 'k/s' },
    module: { exports: {} },
  });

  ctx.SYNC_MERGE = carregarScript('js/core/sync-merge.js');
  ctx.FINANCE_CONTRACT = carregarScript('js/core/finance-contract.js');

  // ES Modules: o que o ctx tem (APP_STORE, ACTIONS, UTILS…) entra como
  // dublê dos imports; ORCAMENTO e os vizinhos do DADOS que este teste nunca
  // teve (cifragem, IndexedDB, fila, modais, billing) ficam ausentes.
  ['ORCAMENTO', 'LOCAL_CRYPTO', 'IDB_KV', 'PERSIST_QUEUE', 'SESSION_LOG', 'INIT_MODALS', 'BILLING']
    .forEach((nome) => { ctx[nome] = undefined; });
  rodarNoContexto(ctx, path.join(__dirname, '..', 'js', 'core', 'dados.js'));
  const D = ctx.DADOS;
  // Transporte de nuvem gravado: o que o supabase-sync receberia.
  const enviados = [];
  ['_pushTransacaoApi', '_deleteTransacaoApi', '_pushContasApi', '_pushConfigApi'].forEach((nome) => {
    D[nome] = (arg) => { enviados.push({ nome, arg }); return Promise.resolve(arg); };
  });
  return { D, storage: mockLs, enviados };
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

  test('excluir lançamento tira do aparelho e manda a exclusão para a nuvem', () => {
    const { D, enviados } = loadDados();
    D.salvarTransacao({ id: 'tx-1', tipo: 'despesa', valor: 1, descricao: 'x', categoria: 'outro', data: '2026-07-09' });
    expect(D.deletarTransacao('tx-1')).toBe(true);
    expect(D.getTransacoes()).toHaveLength(0);
    expect(enviados.map((e) => e.nome)).toEqual(['_pushTransacaoApi', '_deleteTransacaoApi']);
    expect(enviados[1].arg).toBe('tx-1');
  });

  test('snapshot remoto não substitui contas locais inteiras', () => {
    const { D } = loadDados();
    D.upsertConta({
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
      nome: 'Poupança local',
      tipo: 'poupanca',
      saldo: 100,
      moeda: 'BRL',
      ativo: true,
      updatedAt: '2026-07-01T00:00:00.000Z',
    });

    D._mergeSnapshotLocal({
      accounts: [{
        id: 'remote-conta-1',
        name: 'Conta remota',
        type: 'checking',
        balance: 500,
        currency: 'BRL',
        active: true,
        updatedAt: '2026-07-09T12:00:00.000Z',
      }],
    });

    const contas = D.getContas();
    expect(contas.some((c) => c.nome === 'Poupança local')).toBe(true);
    expect(contas.some((c) => c.nome === 'Conta remota')).toBe(true);
  });

  test('orçamento vive no config e sobe com ele', () => {
    const { D, enviados } = loadDados();
    D.upsertOrcamento('alimentacao', 500);
    const cfg = D.getConfig();
    expect(cfg.orcamentos.alimentacao.limite).toBe(500);
    expect(cfg.orcamentos.alimentacao.id).toBeTruthy();
    const config = enviados.filter((e) => e.nome === '_pushConfigApi').pop();
    expect(config.arg.orcamentos.alimentacao.limite).toBe(500);
  });

  test('snapshot com orçamentos mescla por id, sem apagar os locais que a nuvem não tem', () => {
    const { D } = loadDados();
    D.upsertOrcamento('lazer', 200);
    D._mergeSnapshotLocal({
      budgets: [{ id: 'b-nuvem', category: 'alimentacao', limit: 800, period: 'monthly', updatedAt: '2026-07-09T12:00:00.000Z' }],
    });
    const orc = D.getConfig().orcamentos;
    expect(orc.alimentacao.limite).toBe(800);
    expect(orc.lazer.limite).toBe(200);
  });

  test('snapshot vazio ou ausente não mexe em nada', () => {
    const { D } = loadDados();
    D.salvarTransacao({ id: 'tx-1', tipo: 'despesa', valor: 1, descricao: 'x', categoria: 'outro', data: '2026-07-09' });
    D._mergeSnapshotLocal(null);
    D._mergeSnapshotLocal('x');
    expect(D.getTransacoes()).toHaveLength(1);
  });
});
