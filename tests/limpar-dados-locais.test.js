/**
 * limpar-dados-locais.test.js — "Apagar todos os dados" apaga mesmo tudo.
 *
 * Origem: a auditoria de privacidade de 06/10/2026 achou que DADOS.limparTodos
 * removia só lançamentos e configuração. Ficavam no aparelho as contas, os
 * comprovantes (IndexedDB) e o histórico do aprendizado, com palavras das
 * descrições, banco, cartão e valor médio por categoria, enquanto a tela
 * dizia "Não sobrou nada neste aparelho". A política de privacidade promete o
 * mesmo (seção 8).
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

const root = path.join(__dirname, '..');

function carregarDadosReal(indexedDB) {
  const sandbox = {
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    sessionStorage: global.sessionStorage,
    indexedDB,
    console: global.console,
    setTimeout: (...a) => global.setTimeout(...a),
    clearTimeout: (...a) => global.clearTimeout(...a),
    fetch: (...a) => global.fetch(...a),
    UTILS: { mostrarToast: () => {}, mostrarBanner: () => {}, gerarId: () => 'id' },
  };
  sandbox.globalThis = sandbox;
  rodarNoContexto(vm.createContext(sandbox), path.join(root, 'js/core/dados.js'));
  return sandbox;
}

describe('DADOS.limparTodos', () => {
  let sandbox;
  let apagados;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apagados = [];
    sandbox = carregarDadosReal({
      deleteDatabase: (nome) => { apagados.push(nome); },
      // O DADOS.init() que segue a limpeza reabre o banco; aqui ele falha e o
      // app cai no localStorage, como num navegador sem IndexedDB.
      open: () => {
        const req = {};
        setTimeout(() => { if (req.onerror) req.onerror(new Error('sem idb')); }, 0);
        return req;
      },
    });
  });

  afterEach(() => {
    delete global.window.ANEXOS;
  });

  test('não sobra nenhuma chave de dado no localStorage', () => {
    const dadosPessoais = {
      'fp-transacoes': '[{"descricao":"Mercado"}]',
      'fp-config': '{"nome":"Ana"}',
      'fp-contas': '[{"nome":"Nubank"}]',
      aprendizado_historico: '{"mercado":{"categoria":"alimentacao","mediaValor":312}}',
      'fp-store-v2': '{}',
      extrato_filtros: '{"busca":"farmacia"}',
      'fp-contas-notif-dia': '2026-10-06',
      financaspro_pin_locked: '1',
      'chave-que-ainda-nao-existe': 'x',
    };
    Object.entries(dadosPessoais).forEach(([k, v]) => localStorage.setItem(k, v));

    sandbox.DADOS.limparTodos();

    Object.keys(dadosPessoais).forEach((k) => {
      expect([k, localStorage.getItem(k)]).toEqual([k, null]);
    });
  });

  test('preserva a sessão de login, a biometria e as chaves da cifragem local', () => {
    const preservadas = sandbox.DADOS.CHAVES_PRESERVADAS_AO_LIMPAR;
    preservadas.forEach((k) => localStorage.setItem(k, 'v'));

    sandbox.DADOS.limparTodos();

    preservadas.forEach((k) => expect(localStorage.getItem(k)).toBe('v'));
    expect(preservadas).toEqual(expect.arrayContaining([
      'fp-supabase-auth', 'financaspro_ckey_salt', 'financaspro_ckey_dev',
    ]));
  });

  test('apaga os bancos IndexedDB de lançamentos e de comprovantes', () => {
    sandbox.DADOS.limparTodos();
    expect(apagados).toEqual(expect.arrayContaining(['financaspro-kv', 'financaspro-anexos']));
  });

  test('fecha a conexão aberta dos comprovantes antes de apagar', () => {
    const fechar = jest.fn();
    global.window.ANEXOS = { _db: { close: fechar } };

    sandbox.DADOS.limparTodos();

    expect(fechar).toHaveBeenCalled();
    expect(global.window.ANEXOS._db).toBeNull();
  });

  test('limpa o sessionStorage', () => {
    sessionStorage.setItem('qualquer', '1');
    sandbox.DADOS.limparTodos();
    expect(sessionStorage.getItem('qualquer')).toBeNull();
  });
});
