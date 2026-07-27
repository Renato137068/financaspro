/**
 * store-real.test.js — exercita js/core/store.js REAL (APP_STORE + APP_STATE)
 * Cobre: get/set/patch, subscribe/once/notify, ações (dispatch), persistência,
 *        deepMerge, reset, sub-APIs ui/form/cache/sync, auto-save e adaptador.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(function() { loadCoreModules(); });

beforeEach(function() {
  resetFixtures();
  global.localStorage.clear();
  var S = global.APP_STORE;
  S._subscribers.clear();
  S._actionHandlers = {};
  S._actionLog = [];
  S.stopAutoSave();
  S.reset();
  S._subscribers.clear(); // reset dispara _notify; limpa de novo
});

function S() { return global.APP_STORE; }

describe('APP_STORE.get / set', function() {
  test('get sem path devolve estado completo clonado', function() {
    var st = S().get();
    expect(st.ui.abaAtiva).toBe('resumo');
    st.ui.abaAtiva = 'mutado';
    expect(S().get('ui.abaAtiva')).toBe('resumo'); // clone, não referência
  });
  test('get por path aninhado', function() {
    expect(S().get('ui.filtros.tipo')).toBe('todos');
  });
  test('get de path inexistente devolve undefined', function() {
    expect(S().get('ui.naoexiste.foo')).toBeUndefined();
  });
  test('set cria caminho e devolve novo valor', function() {
    expect(S().set('ui.abaAtiva', 'extrato')).toBe('extrato');
    expect(S().get('ui.abaAtiva')).toBe('extrato');
  });
  test('set cria objetos intermediários ausentes', function() {
    S().set('cache.novo.sub', 42);
    expect(S().get('cache.novo.sub')).toBe(42);
  });
  test('set silencioso não notifica', function() {
    var chamado = false;
    S().subscribe('ui.abaAtiva', function() { chamado = true; });
    S().set('ui.abaAtiva', 'x', { silent: true });
    expect(chamado).toBe(false);
  });
});

describe('APP_STORE.patch', function() {
  test('aplica múltiplos paths e devolve estado', function() {
    var st = S().patch({ 'ui.abaAtiva': 'metas', 'sync.online': true });
    expect(st.ui.abaAtiva).toBe('metas');
    expect(st.sync.online).toBe(true);
  });
});

describe('APP_STORE.subscribe / once / _notify', function() {
  test('subscribe recebe newValue/oldValue e unsubscribe para', function() {
    var eventos = [];
    var unsub = S().subscribe('ui.abaAtiva', function(nv, ov) { eventos.push([nv, ov]); });
    S().set('ui.abaAtiva', 'a');
    S().set('ui.abaAtiva', 'b');
    unsub();
    S().set('ui.abaAtiva', 'c');
    expect(eventos).toHaveLength(2);
    expect(eventos[1][0]).toBe('b');
    expect(eventos[1][1]).toBe('a');
  });
  test('callback não-função devolve no-op sem quebrar', function() {
    expect(typeof S().subscribe('x', null)).toBe('function');
  });
  test('subscriber curinga * recebe qualquer mudança', function() {
    var n = 0;
    S().subscribe('*', function() { n++; });
    S().set('ui.abaAtiva', 'z');
    expect(n).toBeGreaterThan(0);
  });
  test('notifica ancestral quando filho muda', function() {
    var n = 0;
    S().subscribe('ui.filtros', function() { n++; });
    S().set('ui.filtros.tipo', 'receita');
    expect(n).toBe(1);
  });
  test('subscriber que lança é desativado e não derruba o notify', function() {
    S().subscribe('ui.abaAtiva', function() { throw new Error('boom'); });
    expect(function() { S().set('ui.abaAtiva', 'q'); }).not.toThrow();
  });
  test('once dispara uma vez e só quando a condição passa', function() {
    var vistos = [];
    S().once('sync.pending', function(v) { vistos.push(v); }, function(v) { return v === true; });
    S().set('sync.pending', false); // condição falsa: não dispara
    S().set('sync.pending', true);  // dispara e desassina
    S().set('sync.pending', true);
    expect(vistos).toEqual([true]);
  });
});

describe('APP_STORE — ações (dispatch)', function() {
  test('handler registrado recebe payload e retorna valor', function() {
    var recebido = null;
    S().registerActionHandler('TESTE', function(p) { recebido = p; return 'ok'; });
    expect(S().dispatch('TESTE', { a: 1 })).toBe('ok');
    expect(recebido).toEqual({ a: 1 });
  });
  test('ação sem handler notifica e não lança', function() {
    var n = 0;
    S().subscribe('*', function() { n++; });
    expect(function() { S().dispatch('SEM_HANDLER', 1); }).not.toThrow();
    expect(n).toBeGreaterThan(0);
  });
  test('handler síncrono que lança propaga', function() {
    S().registerActionHandler('ERRO', function() { throw new Error('x'); });
    expect(function() { S().dispatch('ERRO', {}); }).toThrow();
  });
  test('handler async rejeitado propaga rejeição', async function() {
    S().registerActionHandler('ASYNC', function() { return Promise.reject(new Error('falha')); });
    await expect(S().dispatch('ASYNC', {})).rejects.toThrow('falha');
  });
  test('getActionLog registra e respeita limite circular', function() {
    S()._actionLogMaxSize = 3;
    S().dispatch('A', 1); S().dispatch('B', 2); S().dispatch('C', 3); S().dispatch('D', 4);
    var log = S().getActionLog();
    expect(log.length).toBe(3);
    expect(log[log.length - 1].type).toBe('D');
  });
});

describe('APP_STORE.select / snapshot / reset', function() {
  test('select projeta estado', function() {
    S().set('ui.abaAtiva', 'relatorios');
    expect(S().select(function(st) { return st.ui.abaAtiva; })).toBe('relatorios');
  });
  test('snapshot devolve cópia', function() {
    var snap = S().snapshot();
    snap.ui.abaAtiva = 'mut';
    expect(S().get('ui.abaAtiva')).not.toBe('mut');
  });
  test('reset volta aos padrões', function() {
    S().set('ui.abaAtiva', 'x');
    S().reset();
    expect(S().get('ui.abaAtiva')).toBe('resumo');
  });
});

describe('APP_STORE — persistência e deepMerge', function() {
  test('persiste ui e recarrega com deep merge', function() {
    S().set('ui.abaAtiva', 'metas'); // persiste (path ui.*)
    var salvo = JSON.parse(global.localStorage.getItem('fp-store-v2'));
    expect(salvo.ui.abaAtiva).toBe('metas');
    // simula reload: muta só a memória (sem persistir) e recarrega do storage.
    // Usar reset() aqui não serve porque reset() re-persiste 'resumo' por cima.
    S()._state.ui.abaAtiva = 'outro';
    S()._carregarUIPersistido();
    expect(S().get('ui.abaAtiva')).toBe('metas');
  });
  test('estado persistido expirado (>7 dias) é ignorado', function() {
    var antigo = { ui: { abaAtiva: 'velho' }, timestamp: Date.now() - 8 * 24 * 3600 * 1000 };
    global.localStorage.setItem('fp-store-v2', JSON.stringify(antigo));
    S().reset();
    S()._carregarUIPersistido();
    expect(S().get('ui.abaAtiva')).toBe('resumo'); // não aplicou o expirado
  });
});

describe('APP_STORE — auto-save (fake timers)', function() {
  test('_setupAutoSave grava periodicamente e stopAutoSave interrompe', function() {
    jest.useFakeTimers();
    try {
      global.localStorage.removeItem('fp-store-v2');
      S()._setupAutoSave();
      jest.advanceTimersByTime(30000);
      expect(global.localStorage.getItem('fp-store-v2')).not.toBeNull();
      S().stopAutoSave();
      expect(S()._autoSaveInterval).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('APP_STORE — sub-APIs ui/form/cache/sync', function() {
  test('ui.setAba/getAba/limparFiltros', function() {
    S().ui.setAba('contas');
    expect(S().ui.getAba()).toBe('contas');
    S().ui.setFiltro('categoria', 'lazer');
    expect(S().ui.getFiltros().categoria).toBe('lazer');
    S().ui.limparFiltros();
    expect(S().ui.getFiltros().categoria).toBeNull();
  });
  test('form.setRascunho/getRascunho/edicao/limpar', function() {
    S().form.setRascunho({ valor: 10 });
    expect(S().form.getRascunho().valor).toBe(10);
    S().form.setEdicao('id-1');
    expect(S().form.getEdicao()).toBe('id-1');
    S().form.limpar();
    expect(S().form.getRascunho()).toEqual({});
    expect(S().form.getEdicao()).toBeNull();
  });
  test('cache.set/get e expiração por maxAge', function() {
    S().cache.set('transacoes', [1, 2, 3]);
    expect(S().cache.get('transacoes')).toEqual([1, 2, 3]);
    // maxAge 0 força expiração relativa? usa ultimaAtualizacao recente:
    expect(S().cache.get('transacoes', -1)).toBeNull(); // já "expirado"
    S().cache.invalidar('transacoes');
    expect(S().cache.get('transacoes')).toBeNull();
  });
  test('cache.invalidar sem tipo limpa tudo', function() {
    S().cache.set('config', { a: 1 });
    S().cache.invalidar();
    expect(S().cache.get('config')).toBeNull();
  });
  test('sync.setOnline/setPending/setLastSync/getStatus', function() {
    S().sync.setOnline(true);
    S().sync.setPending(true);
    S().sync.setLastSync(12345);
    var st = S().sync.getStatus();
    expect(st.online).toBe(true);
    expect(st.pending).toBe(true);
    expect(st.lastSyncAt).toBe(12345);
  });
});

describe('APP_STATE — adaptador de compatibilidade', function() {
  test('setState grava sessao/sync e getState lê da fonte', function() {
    global.APP_STATE.setState({ sessao: { token: 't', user: { id: 1 } }, sync: { online: true } });
    var st = global.APP_STATE.getState();
    expect(st.sessao.token).toBe('t');
    expect(Array.isArray(st.transacoes)).toBe(true);
  });
  test('subscribe delega ao APP_STORE', function() {
    var unsub = global.APP_STATE.subscribe(function() {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
  test('hydrateFromDados não quebra sem getSessao', function() {
    expect(function() { global.APP_STATE.hydrateFromDados(); }).not.toThrow();
  });
});
