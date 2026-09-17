/**
 * calendario.test.js — agenda financeira do mês (feature nova).
 *
 * Consolida numa linha do tempo os vencimentos do mês: contas a pagar
 * pendentes + faturas de cartão. Módulo puro; aqui os módulos de origem são
 * stubados para provar só a consolidação (ordem, dedup, total em centavos).
 */
const CALENDARIO = require('../js/calendario.js');

beforeEach(function() {
  global.UTILS = {
    paraCentavos: function(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) : 0; },
    diasAte: function() { return null; }, // neutro salvo override no teste
  };
  delete global.CONTAS_PAGAR;
  delete global.CARTOES;
});

afterEach(function() {
  delete global.CONTAS_PAGAR;
  delete global.CARTOES;
  delete global.UTILS;
});

describe('CALENDARIO.agendaDoMes', function() {
  test('consolida contas a pagar e faturas de cartão, ordenado por data', function() {
    global.CONTAS_PAGAR = {
      listarNoMes: function() {
        return [
          { descricao: 'Luz', valor: 120, vencimento: '2026-09-20', status: 'pendente' },
          { descricao: 'Água', valor: 80, vencimento: '2026-09-05', status: 'pendente' },
        ];
      },
      situacao: function(c) { return c.status; },
    };
    global.CARTOES = {
      listarResumos: function() {
        return [{
          nome: 'Nubank',
          faturaAtual: { competencia: '2026-09', total: 500, vencimento: '2026-09-10' },
          proximaFatura: { competencia: '2026-10', total: 300, vencimento: '2026-10-10' }, // fora do mês
        }];
      },
    };

    var r = CALENDARIO.agendaDoMes(9, 2026);
    expect(r.quantidade).toBe(3); // Água, Fatura Nubank, Luz (out fica de fora)
    expect(r.eventos.map(function(e) { return e.data; })).toEqual(['2026-09-05', '2026-09-10', '2026-09-20']);
    expect(r.eventos[1].tipo).toBe('cartao');
    expect(r.eventos[1].titulo).toBe('Fatura Nubank');
    expect(r.total).toBe(700); // 120 + 80 + 500
  });

  test('total soma em centavos exatos', function() {
    global.CONTAS_PAGAR = {
      listarNoMes: function() {
        return [
          { descricao: 'A', valor: 0.10, vencimento: '2026-09-01', status: 'pendente' },
          { descricao: 'B', valor: 0.20, vencimento: '2026-09-02', status: 'pendente' },
        ];
      },
      situacao: function() { return 'pendente'; },
    };
    expect(CALENDARIO.agendaDoMes(9, 2026).total).toBe(0.30); // não 0.30000000000000004
  });

  test('fatura sem valor (total 0) ou fora do mês não entra', function() {
    global.CARTOES = {
      listarResumos: function() {
        return [{
          nome: 'Vazio',
          faturaAtual: { competencia: '2026-09', total: 0, vencimento: '2026-09-10' },
          proximaFatura: { competencia: '2026-08', total: 400, vencimento: '2026-08-10' },
        }];
      },
    };
    expect(CALENDARIO.agendaDoMes(9, 2026).quantidade).toBe(0);
  });

  test('não duplica quando fatura atual e próxima caem no mesmo mês/competência', function() {
    global.CARTOES = {
      listarResumos: function() {
        var f = { competencia: '2026-09', total: 500, vencimento: '2026-09-10' };
        return [{ nome: 'Dup', faturaAtual: f, proximaFatura: f }];
      },
    };
    expect(CALENDARIO.agendaDoMes(9, 2026).quantidade).toBe(1);
  });

  test('sem módulos de origem devolve agenda vazia, sem estourar', function() {
    var r = CALENDARIO.agendaDoMes(9, 2026);
    expect(r).toEqual({ eventos: [], total: 0, quantidade: 0 });
  });

  test('dias até o vencimento vêm de UTILS.diasAte quando disponível', function() {
    global.UTILS.diasAte = function(data) { return data === '2026-09-20' ? 5 : -1; };
    global.CONTAS_PAGAR = {
      listarNoMes: function() {
        return [{ descricao: 'Luz', valor: 10, vencimento: '2026-09-20', status: 'pendente' }];
      },
      situacao: function() { return 'pendente'; },
    };
    expect(CALENDARIO.agendaDoMes(9, 2026).eventos[0].dias).toBe(5);
  });
});
