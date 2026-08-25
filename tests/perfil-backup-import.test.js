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
