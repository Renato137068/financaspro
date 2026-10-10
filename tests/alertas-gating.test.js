/**
 * alertas-gating.test.js — FREE nuvem filtra avançados e mostra upsell.
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

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
        if (opts.alertas) return opts.alertas;
        return [
          { id: 's1', tipo: 'saldo', titulo: 'Saldo', msg: 'ok', gravidade: 'alta' },
          { id: 'p1', tipo: 'padrao', titulo: 'Padrão', msg: 'adv', gravidade: 'baixa' },
          { id: 'h1', tipo: 'habito', titulo: 'Hábito', msg: 'adv', gravidade: 'baixa' },
        ];
      },
      detectarAnomalias: function() { return opts.anomalias || []; },
      detectarPadroesRecorrentes: function() { return []; },
    },
    CARTOES: undefined,
    mudarAba: undefined,
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
  if (opts.container) {
    ctx.document = { getElementById: function(id) { return id === 'dashboard-alertas' ? opts.container : null; } };
  }
  vm.createContext(ctx);
  // ES Module: UTILS, CARTOES, AI_ENGINE e mudarAba do ctx substituem os imports.
  rodarNoContexto(ctx, path.join(__dirname, '..', 'js', 'alertas.js'));
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

  test('lembrete de hábito sozinho não vira "detectou algo fora do padrão"', function() {
    // Conta nova, sem nada detectado: o único alerta avançado é "Sem
    // lançamentos hoje". O teaser afirmaria uma detecção que não existe.
    const A = loadAlertas({
      canAdvanced: false,
      alertas: [{ id: 'sem-lancamento', tipo: 'habito', titulo: 'Sem lançamentos hoje', msg: 'x', gravidade: 'baixa' }],
    });
    const list = A.verificar(true);
    expect(list.some(function(a) { return a.tipo === 'upsell'; })).toBe(false);
  });

  test('gasto incomum escondido no FREE aciona o teaser', function() {
    const A = loadAlertas({ canAdvanced: false, alertas: [], anomalias: [{ transacao: { id: 't1' } }] });
    const list = A.verificar(true);
    expect(list.some(function(a) { return a.tipo === 'upsell'; })).toBe(true);
  });
});

describe('ALERTAS — papel para o leitor de tela', function() {
  function renderizar(alertas, canAdvanced) {
    const el = { innerHTML: '', addEventListener: function() {}, removeEventListener: function() {} };
    const A = loadAlertas({ canAdvanced: canAdvanced, alertas: alertas, container: el });
    A.renderizar();
    return el.innerHTML;
  }

  test('convite ao Pro não interrompe o TalkBack (status, não alert)', function() {
    const html = renderizar([{ id: 'p1', tipo: 'padrao', titulo: 'P', msg: 'x', gravidade: 'baixa' }], false);
    expect(html).toMatch(/O app detectou algo fora do padrão/);
    expect(html).not.toMatch(/role="alert"/);
    expect(html).toMatch(/role="status"/);
  });

  test('só o alerta crítico interrompe', function() {
    const html = renderizar([
      { id: 'c1', tipo: 'saldo', titulo: 'Saldo negativo', msg: 'x', gravidade: 'critica' },
      { id: 'm1', tipo: 'saldo', titulo: 'Quase no limite', msg: 'x', gravidade: 'media' },
    ], true);
    expect(html.match(/role="alert"/g)).toHaveLength(1);
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });
});
