/**
 * Tests for dados.js - Data persistence layer
 */

const CONFIG = require('../js/config.js');
const UTILS = require('../js/utils.js');
const DADOS = require('../js/dados.js');

describe('DADOS - Data Persistence', function() {

  beforeEach(function() {
    localStorage.clear();
    DADOS._initialized = false;
    DADOS.init();
  });

  describe('init()', function() {
    test('deve inicializar storage vazio', function() {
      expect(localStorage.getItem(CONFIG.STORAGE_TRANSACOES)).toBe('[]');
    });

    test('não deve reinicializar se já foi inicializado', function() {
      DADOS.init();
      var first = localStorage.getItem(CONFIG.STORAGE_TRANSACOES);
      DADOS.init();
      var second = localStorage.getItem(CONFIG.STORAGE_TRANSACOES);
      expect(first).toBe(second);
    });
  });

  describe('getTransacoes()', function() {
    test('deve retornar array vazio inicialmente', function() {
      var result = DADOS.getTransacoes();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('deve retornar [] em caso de erro de parse', function() {
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, 'invalid json');
      var result = DADOS.getTransacoes();
      expect(result).toEqual([]);
    });
  });

  describe('salvarTransacao()', function() {
    test('deve salvar nova transação com ID gerado', function() {
      var transacao = {
        tipo: 'despesa',
        categoria: 'alimentacao',
        valor: 50,
        descricao: 'Supermercado',
        data: '2026-05-03'
      };
      var resultado = DADOS.salvarTransacao(transacao);
      expect(resultado.id).toBeDefined();
      expect(resultado.dataCriacao).toBeDefined();
    });

    test('deve atualizar transação existente pelo ID', function() {
      var t1 = DADOS.salvarTransacao({
        tipo: 'despesa',
        categoria: 'alimentacao',
        valor: 50,
        data: '2026-05-03'
      });
      var id = t1.id;
      var t2 = DADOS.salvarTransacao({
        id: id,
        tipo: 'despesa',
        categoria: 'alimentacao',
        valor: 75,
        data: '2026-05-03'
      });
      var transacoes = DADOS.getTransacoes();
      expect(transacoes.length).toBe(1);
      expect(transacoes[0].valor).toBe(75);
    });
  });

  describe('deletarTransacao()', function() {
    test('deve deletar transação por ID', function() {
      var t = DADOS.salvarTransacao({
        tipo: 'despesa',
        categoria: 'alimentacao',
        valor: 50,
        data: '2026-05-03'
      });
      DADOS.deletarTransacao(t.id);
      var transacoes = DADOS.getTransacoes();
      expect(transacoes.length).toBe(0);
    });

    test('deve retornar false ao deletar ID inexistente', function() {
      var result = DADOS.deletarTransacao('inexistente');
      expect(result).toBe(false);
    });
  });

  describe('getConfig() / salvarConfig()', function() {
    test('deve salvar e recuperar configuração', function() {
      DADOS.salvarConfig({ nome: 'João', tema: 'dark' });
      var config = DADOS.getConfig();
      expect(config.nome).toBe('João');
      expect(config.tema).toBe('dark');
    });

    test('deve mesclar com config padrão', function() {
      DADOS.salvarConfig({ nome: 'João' });
      var config = DADOS.getConfig();
      expect(config.moeda).toBeDefined();
    });
  });

  describe('exportarDados()', function() {
    test('deve exportar transações e config com timestamp', function() {
      DADOS.salvarTransacao({
        tipo: 'receita',
        categoria: 'salario',
        valor: 5000,
        data: '2026-05-01'
      });
      var exported = DADOS.exportarDados();
      expect(exported.transacoes.length).toBe(1);
      expect(exported.config).toBeDefined();
      expect(exported.dataExportacao).toBeDefined();
    });
  });
});
