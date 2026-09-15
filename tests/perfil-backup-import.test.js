/**
 * perfil-backup-import.test.js — P1.1 / P1.2 backup e importação da aba Perfil
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'modules', 'init-config.js'), 'utf8');

function carregarInitConfig(extra) {
  var storedConfig = {
    nome: 'Renato',
    tema: 'light',
    pinAtivo: true,
    pinHash: 'hash-local',
    pinSalt: 'salt-local',
    pinAlgoritmo: 'PBKDF2',
    pinTentativas: 0,
    pinBloqueadoAte: 0,
    plano: 'free',
    alertaOrcamento: true
  };
  var outboxSaved = null;
  var cursorSaved = null;

  var sandbox = Object.assign({
    window: window,
    document: document,
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: { VERSION: '11.0.0' },
    UTILS: {
      escapeHtml: function(s) { return String(s); },
      formatarMoeda: function(v) { return String(v); },
      mostrarToast: function() {}
    },
    DADOS: {
      getConfig: function() { return Object.assign({}, storedConfig); },
      salvarConfig: function(partial) {
        if (partial && typeof partial === 'object') {
          Object.keys(partial).forEach(function(k) { storedConfig[k] = partial[k]; });
        }
      },
      getContas: function() { return []; },
      getTransacoesRaw: function() { return []; },
      salvarTransacao: function() {}
    },
    TRANSACOES: { obter: function() { return []; } },
    ORCAMENTO: { definirLimite: function() {}, obterStatus: function() { return null; } },
    SYNC_ENGINE: {
      saveOutbox: function(o) { outboxSaved = o; },
      setCursor: function(c) { cursorSaved = c; },
      loadOutbox: function() { return []; },
      getCursor: function() { return null; }
    },
    INIT_MODALS: {},
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Blob: function(parts) { this.parts = parts; this.size = String(parts[0] || '').length; },
    URL: { createObjectURL: function() { return 'blob:test'; } }
  }, extra || {});
  sandbox.globalThis = sandbox;
  sandbox._getStored = function() { return storedConfig; };
  sandbox._getOutbox = function() { return outboxSaved; };
  sandbox._getCursor = function() { return cursorSaved; };
  sandbox._setStored = function(c) { storedConfig = Object.assign(storedConfig, c); };

  var code = src.replace(/\bconst INIT_CONFIG =/, 'var INIT_CONFIG =');
  vm.runInContext(code, vm.createContext(sandbox), {
    filename: path.join(root, 'js', 'modules', 'init-config.js')
  });
  return sandbox;
}

describe('P1.1 — backup sem hash/salt do PIN', function() {
  test('_configParaExportacao remove campos de _IMPORT_CONFIG_BLOCKED', function() {
    var sb = carregarInitConfig();
    var cfg = sb.INIT_CONFIG._configParaExportacao();
    expect(cfg.pinHash).toBeUndefined();
    expect(cfg.pinSalt).toBeUndefined();
    expect(cfg.pinAlgoritmo).toBeUndefined();
    expect(cfg.pinTentativas).toBeUndefined();
    expect(cfg.pinBloqueadoAte).toBeUndefined();
    expect(cfg.pinAtivo).toBeUndefined();
    expect(cfg.nome).toBe('Renato');
    // localStorage/config em memória intacto
    expect(sb._getStored().pinHash).toBe('hash-local');
  });
});

describe('P1.2 — whitelist na importação de config', function() {
  test('chave fora da whitelist (apiBaseUrl) é ignorada', function() {
    var sb = carregarInitConfig();
    sb._setStored({ apiBaseUrl: 'https://legitimo.example' });
    var merged = sb.INIT_CONFIG._mergeImportedConfig({
      nome: 'Novo Nome',
      apiBaseUrl: 'https://atacante.evil',
      syncV2Enabled: false,
      tema: 'dark',
      pinHash: 'hash-malicioso'
    });
    expect(merged.nome).toBe('Novo Nome');
    expect(merged.tema).toBe('dark');
    expect(merged.apiBaseUrl).toBe('https://legitimo.example');
    expect(merged.syncV2Enabled).toBeUndefined();
    expect(merged.pinHash).toBe('hash-local');
  });

  test('outbox e cursor malformados são ignorados', function() {
    var sb = carregarInitConfig();
    sb.INIT_CONFIG.importarDados({
      config: { nome: 'Ok' },
      outbox: { not: 'array' },
      sync_cursor: { evil: true }
    });
    expect(sb._getOutbox()).toBeNull();
    expect(sb._getCursor()).toBeNull();
    expect(sb._getStored().nome).toBe('Ok');
  });

  test('outbox válido é restaurado', function() {
    var sb = carregarInitConfig();
    var op = { opId: 'a', entity: 'transaction', id: 'tx1', op: 'upsert' };
    sb.INIT_CONFIG.importarDados({ outbox: [op, { broken: true }], sync_cursor: 'cur-1' });
    expect(sb._getOutbox()).toEqual([op]);
    expect(sb._getCursor()).toBe('cur-1');
  });
});

describe('backup — orçamentos de todas as categorias entram no export', function() {
  // ORCAMENTO com limites em categorias FORA da antiga lista fixa de 5
  // (alimentacao/transporte/moradia/saude/lazer). Se o export percorresse a
  // lista fixa, educação, viagem e pet sumiriam do backup.
  function orcamentoStub(limites) {
    return {
      obterTodos: function() {
        var r = {};
        Object.keys(limites).forEach(function(c) { r[c] = { limite: limites[c] }; });
        return r;
      },
      obterStatus: function(cat) {
        if (limites[cat] == null) return null;
        return { categoria: cat, limite: limites[cat], gasto: 0 };
      },
      definirLimite: function() {}
    };
  }

  test('exporta orçamentos de categorias não-padrão (educacao, viagem, pet)', function() {
    var sb = carregarInitConfig({
      ORCAMENTO: orcamentoStub({ educacao: 300, viagem: 800, pet: 150, alimentacao: 1000 })
    });
    var orc = sb.INIT_CONFIG.getOrcamentosData();
    expect(Object.keys(orc).sort()).toEqual(['alimentacao', 'educacao', 'pet', 'viagem']);
    expect(orc.educacao.limite).toBe(300);
    expect(orc.viagem.limite).toBe(800);
    expect(orc.pet.limite).toBe(150);
  });

  test('periodo é o mês/ano corrente, não "undefined/undefined"', function() {
    var sb = carregarInitConfig({ ORCAMENTO: orcamentoStub({ educacao: 300 }) });
    var hoje = new Date();
    var esperado = (hoje.getMonth() + 1) + '/' + hoje.getFullYear();
    expect(sb.INIT_CONFIG.getOrcamentosData().educacao.periodo).toBe(esperado);
  });

  test('categoria sem limite não entra', function() {
    var sb = carregarInitConfig({ ORCAMENTO: orcamentoStub({}) });
    expect(sb.INIT_CONFIG.getOrcamentosData()).toEqual({});
  });
});

describe('editarCartao — atualiza limite e ciclo, preserva o nome', function() {
  function utilsStub() {
    return {
      escapeHtml: function(s) { return String(s); },
      formatarMoeda: function(v) { return 'R$ ' + v; },
      mostrarToast: function() {},
      bindCampoMoeda: function() {},
      parseMoeda: function(v) {
        var n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
        return isFinite(n) ? n : 0;
      }
    };
  }
  function setup() {
    var sb = carregarInitConfig({ UTILS: utilsStub() });
    sb._setStored({ cartoes: [{ nome: 'Nubank', bandeira: 'Visa', limite: 1000, fechamento: 10, vencimento: 20 }] });
    return sb;
  }

  test('_salvarEdicaoCartao grava novos valores mantendo o nome', function() {
    var sb = setup();
    document.body.innerHTML =
      '<select id="cartao-edit-bandeira"><option value="Mastercard" selected>Mastercard</option></select>' +
      '<input id="cartao-edit-limite" value="2.500,00">' +
      '<input id="cartao-edit-fech" value="15">' +
      '<input id="cartao-edit-venc" value="25">';
    sb.INIT_CONFIG._salvarEdicaoCartao({ remove: function() {} }, 0);

    var c = sb._getStored().cartoes[0];
    expect(c.nome).toBe('Nubank');        // nome preservado (chave de faturas/lançamentos)
    expect(c.bandeira).toBe('Mastercard');
    expect(c.limite).toBe(2500);
    expect(c.fechamento).toBe(15);
    expect(c.vencimento).toBe(25);
  });

  test('dias inválidos e limite vazio viram null (cartão sem ciclo)', function() {
    var sb = setup();
    document.body.innerHTML =
      '<select id="cartao-edit-bandeira"><option value="Visa" selected>Visa</option></select>' +
      '<input id="cartao-edit-limite" value="">' +
      '<input id="cartao-edit-fech" value="0">' +
      '<input id="cartao-edit-venc" value="40">';
    sb.INIT_CONFIG._salvarEdicaoCartao({ remove: function() {} }, 0);

    var c = sb._getStored().cartoes[0];
    expect(c.fechamento).toBeNull();
    expect(c.vencimento).toBeNull();
    expect(c.limite).toBeNull();
  });

  test('índice inexistente não quebra e não cria cartão', function() {
    var sb = setup();
    document.body.innerHTML =
      '<select id="cartao-edit-bandeira"><option value="Visa" selected>Visa</option></select>' +
      '<input id="cartao-edit-limite" value=""><input id="cartao-edit-fech" value="5"><input id="cartao-edit-venc" value="10">';
    expect(function() { sb.INIT_CONFIG._salvarEdicaoCartao({ remove: function() {} }, 9); }).not.toThrow();
    expect(sb._getStored().cartoes).toHaveLength(1);
  });
});
