/**
 * automacao-real.test.js — anomalia e rascunho do módulo real.
 */
const AUTOMACAO = require('../js/automacao.js');

global.CONFIG = { STORAGE_RASCUNHO: 'fp-rascunho-test' };
global.UTILS = {
  labelCategoria: function(c) { return c; },
};
global.DADOS = {
  getTransacoes: function() {
    return [
      { tipo: 'despesa', valor: 100, categoria: 'lazer', data: '2026-06-01' },
      { tipo: 'despesa', valor: 120, categoria: 'lazer', data: '2026-07-01' },
      { tipo: 'despesa', valor: 110, categoria: 'lazer', data: '2026-08-01' },
    ];
  },
};
global.TRANSACOES = {
  obterResumoCategoriaMes: function(categoria) {
    if (categoria !== 'lazer') return 0;
    return 100;
  },
};

describe('AUTOMACAO.detectarAnomalia', function() {
  test('ignora receitas', function() {
    expect(AUTOMACAO.detectarAnomalia(9999, 'lazer', 'receita')).toBeNull();
  });

  test('detecta gasto bem acima da média', function() {
    var a = AUTOMACAO.detectarAnomalia(500, 'lazer', 'despesa');
    expect(a).toBeTruthy();
    expect(a.tipo).toBe('alerta');
    expect(a.mensagem).toMatch(/acima da média/i);
  });

  test('gasto normal não alerta', function() {
    expect(AUTOMACAO.detectarAnomalia(120, 'lazer', 'despesa')).toBeNull();
  });
});

describe('AUTOMACAO — rascunho', function() {
  beforeEach(function() {
    localStorage.clear();
    AUTOMACAO._rascunho = {};
  });

  test('salvar e limpar rascunho', function() {
    AUTOMACAO._rascunho = { descricao: 'teste' };
    AUTOMACAO.salvarRascunho();
    expect(localStorage.getItem(CONFIG.STORAGE_RASCUNHO)).toContain('teste');
    AUTOMACAO.limparRascunho();
    expect(localStorage.getItem(CONFIG.STORAGE_RASCUNHO)).toBeNull();
    expect(Object.keys(AUTOMACAO._rascunho).length).toBe(0);
  });
});
