/**
 * Tests for transacoes.js - Transaction logic
 */

const CONFIG = require('../js/config.js');
const UTILS = require('../js/utils.js');
const DADOS = require('../js/dados.js');
const TRANSACOES = require('../js/transacoes.js');

describe('TRANSACOES - Transaction Logic', function() {

  beforeEach(function() {
    localStorage.clear();
    DADOS._initialized = false;
    DADOS.init();
    TRANSACOES.init();
  });

  describe('obterResumoMes()', function() {
    test('deve retornar saldo 0 sem transações', function() {
      var resumo = TRANSACOES.obterResumoMes(5, 2026);
      expect(resumo.receitas).toBe(0);
      expect(resumo.despesas).toBe(0);
      expect(resumo.saldo).toBe(0);
    });

    test('deve calcular receitas e despesas corretamente', function() {
      DADOS.salvarTransacao({
        tipo: 'receita',
        categoria: 'salario',
        valor: 5000,
        data: '2026-05-01'
      });
      DADOS.salvarTransacao({
        tipo: 'despesa',
        categoria: 'alimentacao',
        valor: 500,
        data: '2026-05-15'
      });
      TRANSACOES.init();
      var resumo = TRANSACOES.obterResumoMes(5, 2026);
      expect(resumo.receitas).toBe(5000);
      expect(resumo.despesas).toBe(500);
      expect(resumo.saldo).toBe(4500);
    });

    test('deve ignorar transações de outros meses', function() {
      DADOS.salvarTransacao({
        tipo: 'receita',
        categoria: 'salario',
        valor: 5000,
        data: '2026-04-01'
      });
      TRANSACOES.init();
      var resumo = TRANSACOES.obterResumoMes(5, 2026);
      expect(resumo.receitas).toBe(0);
      expect(resumo.saldo).toBe(0);
    });
  });

  describe('obterPorCategoria()', function() {
    test('deve agrupar despesas por categoria', function() {
      DADOS.salvarTransacao({
        tipo: 'despesa',
        categoria: 'alimentacao',
        valor: 200,
        data: '2026-05-01'
      });
      DADOS.salvarTransacao({
        tipo: 'despesa',
        categoria: 'alimentacao',
        valor: 150,
        data: '2026-05-02'
      });
      DADOS.salvarTransacao({
        tipo: 'despesa',
        categoria: 'transporte',
        valor: 100,
        data: '2026-05-03'
      });
      TRANSACOES.init();
      var porCat = TRANSACOES.obterPorCategoria(5, 2026);
      expect(porCat.alimentacao).toBe(350);
      expect(porCat.transporte).toBe(100);
    });
  });

  describe('validações de transação', function() {
    test('deve rejeitar valor zero ou negativo', function() {
      var t = { valor: 0, tipo: 'despesa', categoria: 'alimentacao', data: '2026-05-01' };
      var result = UTILS.validarTransacao(t);
      expect(result.valido).toBe(false);
    });

    test('deve rejeitar tipo inválido', function() {
      var t = { valor: 100, tipo: 'invalido', categoria: 'alimentacao', data: '2026-05-01' };
      var result = UTILS.validarTransacao(t);
      expect(result.valido).toBe(false);
    });

    test('deve aceitar transação válida', function() {
      var t = {
        valor: 100,
        tipo: 'despesa',
        categoria: 'alimentacao',
        data: '2026-05-01'
      };
      var result = UTILS.validarTransacao(t);
      expect(result.valido).toBe(true);
    });
  });
});
