/**
 * projecao-contas-abertas.test.js — saldo do mês depois das contas em aberto.
 *
 * Módulo puro PROJECAO.doMes (js/projecao.js): saldo realizado − contas a pagar
 * em aberto. RELATORIOS e CONTAS_PAGAR são stubados para provar a fórmula, a
 * soma em centavos e o comportamento sem módulos de origem. Cartão fica fora de
 * propósito (a compra já entra como despesa na data da compra).
 *
 * Distinto de projecao.test.js, que cobre AI_ENGINE.projetarFimMes (por ritmo).
 */
const PROJECAO = require('../js/projecao.js');

beforeEach(function() {
  global.UTILS = {
    paraCentavos: function(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) : 0; },
  };
  delete global.RELATORIOS;
  delete global.CONTAS_PAGAR;
});

afterEach(function() {
  delete global.RELATORIOS;
  delete global.CONTAS_PAGAR;
  delete global.UTILS;
});

describe('PROJECAO.doMes', function() {
  test('projeta saldo realizado menos contas a pagar em aberto', function() {
    global.RELATORIOS = { resumoMes: function() { return { saldo: 1000 }; } };
    global.CONTAS_PAGAR = {
      listarNoMes: function() {
        return [{ valor: 300 }, { valor: 200 }];
      },
    };
    var r = PROJECAO.doMes(9, 2026);
    expect(r.saldoAtual).toBe(1000);
    expect(r.aPagar).toBe(500);
    expect(r.projetado).toBe(500);
    expect(r.contasEmAberto).toBe(2);
    expect(r.positivo).toBe(true);
  });

  test('projeção negativa quando o que falta pagar supera o saldo', function() {
    global.RELATORIOS = { resumoMes: function() { return { saldo: 100 }; } };
    global.CONTAS_PAGAR = { listarNoMes: function() { return [{ valor: 250 }]; } };
    var r = PROJECAO.doMes(9, 2026);
    expect(r.projetado).toBe(-150);
    expect(r.positivo).toBe(false);
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    global.RELATORIOS = { resumoMes: function() { return { saldo: 0.30 }; } };
    global.CONTAS_PAGAR = {
      listarNoMes: function() { return [{ valor: 0.10 }, { valor: 0.20 }]; },
    };
    var r = PROJECAO.doMes(9, 2026);
    expect(r.aPagar).toBe(0.30); // não 0.30000000000000004
    expect(r.projetado).toBe(0); // 0.30 − 0.30
  });

  test('sem contas a pagar, projeção iguala o saldo realizado', function() {
    global.RELATORIOS = { resumoMes: function() { return { saldo: 742.55 }; } };
    var r = PROJECAO.doMes(9, 2026);
    expect(r.aPagar).toBe(0);
    expect(r.projetado).toBe(742.55);
    expect(r.contasEmAberto).toBe(0);
    expect(r.temDados).toBe(true);
  });

  test('sem RELATORIOS devolve saldo zero e temDados false, sem estourar', function() {
    global.CONTAS_PAGAR = { listarNoMes: function() { return [{ valor: 50 }]; } };
    var r = PROJECAO.doMes(9, 2026);
    expect(r.saldoAtual).toBe(0);
    expect(r.aPagar).toBe(50);
    expect(r.projetado).toBe(-50);
    expect(r.temDados).toBe(false);
  });

  test('sem nenhum módulo de origem devolve projeção zerada', function() {
    var r = PROJECAO.doMes(9, 2026);
    expect(r).toEqual({
      saldoAtual: 0, aPagar: 0, projetado: 0,
      contasEmAberto: 0, positivo: true, temDados: false,
    });
  });
});
