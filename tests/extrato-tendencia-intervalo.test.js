/**
 * extrato-tendencia-intervalo.test.js — roadmap da auditoria do Extrato:
 *   No mês CORRENTE, a tendência compara o MESMO intervalo (1..dia de hoje) dos
 *   dois lados — não o saldo parcial contra o mês anterior inteiro (que fazia o
 *   selo aparecer "pior" quase todo começo de mês). Em meses fechados, segue
 *   comparando cheio × cheio.
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

function montarDom() {
  document.body.innerHTML =
    '<div id="saldo-trend" style="display:none"><span id="trend-icon"></span>' +
    '<span id="trend-value"></span><span id="trend-label"></span></div>' +
    '<div id="saldo-valor"></div><div id="saldo-period"></div>' +
    '<span id="kpi-entradas"></span><span id="kpi-saidas"></span><span id="kpi-movimentacoes"></span>' +
    '<span id="extrato-resumo-anuncio"></span>';
}

function trendVisivel() {
  return document.getElementById('saldo-trend').style.display !== 'none';
}

// Data do sistema fixa: 13/09/2026 (dia 13) → mês corrente = setembro/2026,
// mês anterior comparado = agosto/2026, intervalo = dias 1..13.
beforeAll(function() { jest.useFakeTimers().setSystemTime(new Date(2026, 8, 13, 12, 0, 0)); });
afterAll(function() { jest.useRealTimers(); });

beforeEach(function() {
  montarDom();
  txsAnterior = [];
  INIT_EXTRATO._ultimoResumoAnunciado = null;
  INIT_EXTRATO.getExtratoMesAno = function() {
    return { date: new Date(2026, 8, 1), mes: 9, ano: 2026 };
  };
});

describe('mês corrente — comparação de mesmo intervalo', function() {
  test('mês anterior é recortado em 1..dia de hoje (ignora dias posteriores)', function() {
    txsAnterior = [
      { tipo: 'receita', valor: 1000, data: '2026-08-05' }, // dia 5 ≤ 13 → conta
      { tipo: 'receita', valor: 5000, data: '2026-08-25' }  // dia 25 > 13 → ignorado
    ]; // saldoAnterior de mesmo intervalo = 1000 (não 6000)
    INIT_EXTRATO.renderExtratoResumo([
      { tipo: 'receita', valor: 2000, data: '2026-09-10' }, // dia 10 ≤ 13 → conta
      { tipo: 'receita', valor: 8000, data: '2026-09-30' }  // futuro → fora da tendência
    ]);
    // Tendência usa mesmo intervalo: (2000 − 1000) / 1000 = +100,0%.
    expect(trendVisivel()).toBe(true);
    expect(document.getElementById('trend-value').textContent).toBe('+100.0%');
    // Sem o recorte, seria (10000 − 6000)/6000 ≈ +66,7% — prova que recorta.
    expect(document.getElementById('trend-value').textContent).not.toBe('+66.7%');
    // O rótulo deixa claro que é o mesmo período.
    expect(document.getElementById('trend-label').textContent).toBe('vs mesmo período');
    // O saldo do card continua sendo o total do período (inclui o futuro).
    expect(document.getElementById('saldo-valor').textContent).toBe('R$ 10000,00');
  });

  test('mês anterior sem lançamentos no intervalo → selo escondido', function() {
    txsAnterior = [
      { tipo: 'receita', valor: 5000, data: '2026-08-25' } // dia 25 > 13 → fora → base 0
    ];
    INIT_EXTRATO.renderExtratoResumo([{ tipo: 'receita', valor: 2000, data: '2026-09-10' }]);
    expect(trendVisivel()).toBe(false);
  });
});

describe('mês fechado — comparação cheio × cheio (sem recorte)', function() {
  test('período passado usa o mês anterior inteiro', function() {
    INIT_EXTRATO.getExtratoMesAno = function() {
      return { date: new Date(2026, 6, 1), mes: 7, ano: 2026 }; // julho (fechado)
    };
    txsAnterior = [
      { tipo: 'receita', valor: 1000, data: '2026-06-05' },
      { tipo: 'receita', valor: 5000, data: '2026-06-25' } // conta (mês fechado, sem recorte)
    ]; // saldoAnterior = 6000
    INIT_EXTRATO.renderExtratoResumo([
      { tipo: 'receita', valor: 12000, data: '2026-07-20' }
    ]); // (12000 − 6000)/6000 = +100,0%
    expect(trendVisivel()).toBe(true);
    expect(document.getElementById('trend-value').textContent).toBe('+100.0%');
    expect(document.getElementById('trend-label').textContent).toBe('vs mês anterior');
  });
});
