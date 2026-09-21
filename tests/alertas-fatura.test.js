/**
 * alertas-fatura.test.js — fatura vencida sobe para o topo do dashboard.
 *
 * A seção de cartões fica no fim do dashboard; uma fatura vencida é obrigação
 * com prazo. ALERTAS puxa a pergunta "foi paga?" para o topo, como lembrete
 * BÁSICO (free), com ação que leva às faturas. Vencida sem resposta segue fora
 * do limite — o alerta é o empurrão para responder, não uma decisão do app.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAlertas(opts) {
  opts = opts || {};
  const naoConfirmadas = opts.naoConfirmadas || [];
  const canAdvanced = opts.canAdvanced !== false;
  const ctx = {
    BILLING: {
      canUse: function(f) { return f === 'advancedAlerts' ? canAdvanced : true; },
      isCloudUser: function() { return true; },
    },
    AI_ENGINE: {
      gerarAlertas: function() { return []; },
      detectarAnomalias: function() { return []; },
      detectarPadroesRecorrentes: function() { return []; },
    },
    CARTOES: {
      listarResumos: function() {
        return [{ nome: 'Nubank', naoConfirmadas: naoConfirmadas }];
      },
      _rotuloCompetencia: function(c) { return c; },
    },
    DADOS: { getTransacoes: function() { return [{ id: 1 }]; }, getConfig: function() { return {}; } },
    UTILS: {
      escapeHtml: function(s) { return String(s); },
      formatarMoeda: function(v) { return 'R$ ' + v; },
    },
    localStorage: { getItem: function() { return null; }, setItem: function() {} },
    module: { exports: {} },
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'alertas.js'), 'utf8'),
    ctx,
    { filename: path.join(__dirname, '..', 'js', 'alertas.js') },
  );
  return ctx.ALERTAS;
}

describe('ALERTAS — fatura vencida', function() {
  test('gera alerta quando há fatura vencida sem confirmação', function() {
    const A = loadAlertas({ naoConfirmadas: [{ competencia: '2026-06', vencimento: '2026-06-28', total: 1000 }] });
    const list = A.verificar(true);
    const fat = list.find(function(a) { return a.tipo === 'fatura'; });
    expect(fat).toBeTruthy();
    expect(fat.id).toBe('fatura-vencida-nubank-2026-06');
    expect(fat.acao).toBe('verFaturas');
    expect(fat.msg).toContain('Nubank');
  });

  test('sem faturas vencidas, não há alerta de fatura', function() {
    const A = loadAlertas({ naoConfirmadas: [] });
    const list = A.verificar(true);
    expect(list.some(function(a) { return a.tipo === 'fatura'; })).toBe(false);
  });

  test('é básico: o usuário FREE também vê', function() {
    const A = loadAlertas({
      canAdvanced: false,
      naoConfirmadas: [{ competencia: '2026-06', vencimento: '2026-06-28', total: 1000 }],
    });
    const list = A.verificar(true);
    expect(list.some(function(a) { return a.tipo === 'fatura'; })).toBe(true);
  });

  test('no máximo dois lembretes de fatura, dos mais recentes', function() {
    const A = loadAlertas({
      naoConfirmadas: [
        { competencia: '2026-04', vencimento: '2026-04-28', total: 100 },
        { competencia: '2026-05', vencimento: '2026-05-28', total: 200 },
        { competencia: '2026-06', vencimento: '2026-06-28', total: 300 },
      ],
    });
    const list = A.verificar(true);
    const fats = list.filter(function(a) { return a.tipo === 'fatura'; });
    expect(fats).toHaveLength(2);
    const comps = fats.map(function(a) { return a.id; });
    expect(comps).toContain('fatura-vencida-nubank-2026-06');
    expect(comps).toContain('fatura-vencida-nubank-2026-05');
    expect(comps).not.toContain('fatura-vencida-nubank-2026-04');
  });
});
