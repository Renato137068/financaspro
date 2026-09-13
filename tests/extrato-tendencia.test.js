/**
 * extrato-tendencia.test.js — selo de tendência do Extrato (auditoria da aba)
 *
 * Correção #1: sem base de comparação (mês anterior sem lançamentos, ou saldo
 * líquido exatamente zero) não dá para calcular variação percentual. Antes o
 * app mostrava "+0,0% vs mês anterior" — estabilidade contra um mês que não
 * existiu. Agora o selo é escondido nesses casos.
 * @jest-environment jsdom
 */
const INIT_EXTRATO = require('../js/modules/init-extrato.js');

global.CONFIG = Object.assign(global.CONFIG || {}, { TIPO_RECEITA: 'receita', TIPO_DESPESA: 'despesa' });
global.UTILS = Object.assign(global.UTILS || {}, {
  formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
});

var txsAnterior = [];
global.TRANSACOES = Object.assign(global.TRANSACOES || {}, {
  obter: function() { return txsAnterior; }
});

// Período atual fixo: agosto/2026 → mês anterior consultado = julho/2026.
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

function trendVisivel() {
  return document.getElementById('saldo-trend').style.display !== 'none';
}

beforeEach(function() {
  montarDom();
  txsAnterior = [];
  INIT_EXTRATO._ultimoResumoAnunciado = null;
});

describe('selo de tendência — só com base de comparação', function() {
  test('mês anterior com saldo → selo visível com a variação', function() {
    txsAnterior = [{ tipo: 'receita', valor: 1000 }]; // saldoAnterior = 1000
    INIT_EXTRATO.renderExtratoResumo([
      { tipo: 'receita', valor: 3000 },
      { tipo: 'despesa', valor: 1000 }
    ]); // saldo atual = 2000 → (2000-1000)/1000 = +100%
    expect(trendVisivel()).toBe(true);
    expect(document.getElementById('trend-value').textContent).toBe('+100.0%');
  });

  test('mês anterior SEM lançamentos → selo escondido (nada de +0,0%)', function() {
    txsAnterior = [];
    INIT_EXTRATO.renderExtratoResumo([{ tipo: 'receita', valor: 500 }]);
    expect(trendVisivel()).toBe(false);
  });

  test('mês anterior com saldo líquido zero → selo escondido', function() {
    txsAnterior = [
      { tipo: 'receita', valor: 500 },
      { tipo: 'despesa', valor: 500 }
    ]; // saldoAnterior = 0 → variação indefinida
    INIT_EXTRATO.renderExtratoResumo([{ tipo: 'despesa', valor: 200 }]);
    expect(trendVisivel()).toBe(false);
  });

  test('queda vs mês anterior → selo visível com sinal negativo', function() {
    txsAnterior = [{ tipo: 'receita', valor: 2000 }]; // saldoAnterior = 2000
    INIT_EXTRATO.renderExtratoResumo([
      { tipo: 'receita', valor: 1000 },
      { tipo: 'despesa', valor: 500 }
    ]); // saldo = 500 → (500-2000)/2000 = -75%
    expect(trendVisivel()).toBe(true);
    expect(document.getElementById('trend-value').textContent).toBe('-75.0%');
  });
});
