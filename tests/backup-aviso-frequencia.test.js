/**
 * backup-aviso-frequencia.test.js — o lembrete de backup não volta a cada abertura.
 *
 * Antes só o sessionStorage segurava o aviso: toda vez que o app abria, o
 * banner "Você tem N transações sem backup" voltava por cima do cabeçalho.
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

function armazenamento(inicial) {
  const dados = Object.assign({}, inicial);
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null; },
    setItem: function(k, v) { dados[k] = String(v); },
    _dados: dados,
  };
}

function carregar(local) {
  const banners = [];
  const ctx = {
    DADOS: {
      getConfig: function() { return {}; },
      getTransacoes: function() { return [1, 2, 3, 4, 5, 6].map(function(i) { return { id: i }; }); },
    },
    UTILS: { mostrarBanner: function(o) { banners.push(o); } },
    SESSION_LOG: {},
    PERSIST_QUEUE: {},
    FINANCE_RECONCILER: {},
    CONFIG_USER: {},
    INIT_MODALS: {},
    localStorage: local,
    sessionStorage: armazenamento(),
    setTimeout: function(fn) { fn(); },
    console: console,
    Date: Date,
    module: { exports: {} },
  };
  vm.createContext(ctx);
  rodarNoContexto(ctx, path.join(__dirname, '..', 'js', 'services', 'healthService.js'));
  return { H: ctx.HEALTH_SERVICE, banners: banners };
}

describe('lembrete de backup', function() {
  test('aparece na primeira abertura e grava quando avisou', function() {
    const local = armazenamento();
    const { H, banners } = carregar(local);
    expect(H.verificarBackupAutomatico()).toBe(true);
    expect(banners).toHaveLength(1);
    expect(Number(local.getItem('fp-lembrete-exportar-em'))).toBeGreaterThan(0);
  });

  test('não volta na abertura seguinte dentro de 7 dias', function() {
    const local = armazenamento({ 'fp-lembrete-exportar-em': String(Date.now() - 2 * 24 * 60 * 60 * 1000) });
    const { H, banners } = carregar(local);
    expect(H.verificarBackupAutomatico()).toBe(false);
    expect(banners).toHaveLength(0);
  });

  test('volta depois de 7 dias sem backup', function() {
    const local = armazenamento({ 'fp-lembrete-exportar-em': String(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    const { H, banners } = carregar(local);
    expect(H.verificarBackupAutomatico()).toBe(true);
    expect(banners).toHaveLength(1);
  });
});
