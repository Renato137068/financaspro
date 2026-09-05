/**
 * alertas-gating.test.js — FREE nuvem filtra avançados e mostra upsell.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAlertas(opts) {
  opts = opts || {};
  const canAdvanced = opts.canAdvanced !== false;
  const isCloud = opts.isCloud !== false;
  const ctx = {
    BILLING: {
      canUse: function(f) { return f === 'advancedAlerts' ? canAdvanced : true; },
      isCloudUser: function() { return isCloud; },
    },
    AI_ENGINE: {
      gerarAlertas: function() {
        return [
          { id: 's1', tipo: 'saldo', titulo: 'Saldo', msg: 'ok', gravidade: 'alta' },
          { id: 'p1', tipo: 'padrao', titulo: 'Padrão', msg: 'adv', gravidade: 'baixa' },
          { id: 'h1', tipo: 'habito', titulo: 'Hábito', msg: 'adv', gravidade: 'baixa' },
        ];
      },
      detectarAnomalias: function() { return []; },
      detectarPadroesRecorrentes: function() { return []; },
    },
    DADOS: { getTransacoes: function() { return [{ id: 1 }]; }, getConfig: function() { return {}; } },
    UTILS: {
      escapeHtml: function(s) { return String(s); },
      formatarMoeda: function(v) { return 'R$ ' + v; },
    },
    localStorage: {
      getItem: function() { return null; },
      setItem: function() {},
    },
    module: { exports: {} },
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'alertas.js'), 'utf8'),
    ctx,
    { filename: 'alertas.js' },
  );
  return ctx.ALERTAS;
}

describe('ALERTAS gating Pro', function() {
  test('FREE nuvem mantém básicos e injeta upsell', function() {
    const A = loadAlertas({ canAdvanced: false, isCloud: true });
    const list = A.verificar(true);
    const tipos = list.map(function(a) { return a.tipo; });
    expect(tipos).toContain('saldo');
    expect(tipos).not.toContain('padrao');
    expect(tipos).not.toContain('habito');
    expect(tipos).toContain('upsell');
    const up = list.find(function(a) { return a.tipo === 'upsell'; });
    expect(up.acao).toBe('abrirPaywall');
  });

  test('PRO mantém avançados sem upsell', function() {
    const A = loadAlertas({ canAdvanced: true, isCloud: true });
    const list = A.verificar(true);
    const tipos = list.map(function(a) { return a.tipo; });
    expect(tipos).toContain('padrao');
    expect(tipos).not.toContain('upsell');
  });

  test('FREE offline também vê o teaser de alertas avançados', function() {
    // Antes o teaser só existia na nuvem, e quem ficava no modo local nunca
    // descobria que o app tinha detectado algo. Ausência não converte: ninguém
    // sente falta do que não viu existir.
    const A = loadAlertas({ canAdvanced: false, isCloud: false });
    const list = A.verificar(true);
    expect(list.some(function(a) { return a.tipo === 'upsell'; })).toBe(true);
  });

  test('quem tem alertas avançados não vê teaser', function() {
    const A = loadAlertas({ canAdvanced: true, isCloud: true });
    const list = A.verificar(true);
    expect(list.some(function(a) { return a.tipo === 'upsell'; })).toBe(false);
  });
});
