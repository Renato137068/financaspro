/**
 * extrato-saldo-centavos.test.js — o saldo/KPIs do extrato somam em centavos.
 *
 * Regressão: renderExtratoResumo somava t.valor em reais com += float. 0,10 +
 * 0,20 virava 0,30000000000000004 e, acumulado, o card de saldo do extrato
 * divergia do resumo por centavos. Aqui o formatarMoeda stub devolve o número
 * cru (sem toFixed) justamente para expor qualquer deriva.
 * @jest-environment jsdom
 */
const INIT_EXTRATO = require('../js/modules/init-extrato.js');

global.CONFIG = Object.assign(global.CONFIG || {}, { TIPO_RECEITA: 'receita', TIPO_DESPESA: 'despesa' });
// formatarMoeda cru: NÃO arredonda, então float drift apareceria no texto.
global.UTILS = Object.assign(global.UTILS || {}, {
  formatarMoeda: function(v) { return 'R$ ' + v; }
});

var txsAnterior = [];
global.TRANSACOES = Object.assign(global.TRANSACOES || {}, {
  obter: function() { return txsAnterior; }
});

INIT_EXTRATO.getExtratoMesAno = function() {
  return { date: new Date(2026, 7, 1), mes: 8, ano: 2026 };
};

function montarDom() {
  document.body.innerHTML =
    '<div id="saldo-trend"><span id="trend-icon"></span><span id="trend-value"></span></div>' +
    '<div id="saldo-valor"></div><div id="saldo-period"></div>' +
    '<span id="kpi-entradas"></span><span id="kpi-saidas"></span><span id="kpi-movimentacoes"></span>' +
    '<span id="extrato-resumo-anuncio"></span>';
}

beforeEach(function() {
  montarDom();
  txsAnterior = [];
  INIT_EXTRATO._ultimoResumoAnunciado = null;
});

describe('extrato — saldo e KPIs somam em centavos exatos', function() {
  test('receitas fracionadas não acumulam deriva de float', function() {
    INIT_EXTRATO.renderExtratoResumo([
      { tipo: 'receita', valor: 0.10, data: '2026-08-01' },
      { tipo: 'receita', valor: 0.20, data: '2026-08-02' }
    ]);
    expect(document.getElementById('kpi-entradas').textContent).toBe('R$ 0.3'); // não 0.30000000000000004
    expect(document.getElementById('saldo-valor').textContent).toBe('R$ 0.3');
  });

  test('saldo = receitas − despesas ao centavo', function() {
    INIT_EXTRATO.renderExtratoResumo([
      { tipo: 'receita', valor: 0.30, data: '2026-08-01' },
      { tipo: 'despesa', valor: 0.10, data: '2026-08-02' },
      { tipo: 'despesa', valor: 0.20, data: '2026-08-03' }
    ]);
    expect(document.getElementById('kpi-saidas').textContent).toBe('R$ 0.3');
    expect(document.getElementById('saldo-valor').textContent).toBe('R$ 0'); // 0,30 − 0,30
  });

  test('transferência não entra em receitas nem despesas', function() {
    INIT_EXTRATO.renderExtratoResumo([
      { tipo: 'receita', valor: 100, data: '2026-08-01' },
      { tipo: 'transferencia', valor: 999, data: '2026-08-02' }
    ]);
    expect(document.getElementById('kpi-entradas').textContent).toBe('R$ 100');
    expect(document.getElementById('saldo-valor').textContent).toBe('R$ 100');
  });
});
