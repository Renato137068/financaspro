/**
 * init-relatorios-compartilhar.test.js — botão "Compartilhar meu mês".
 * @jest-environment node
 */
const INIT_RELATORIOS = require('../js/modules/init-relatorios.js');

let toasts;
beforeEach(function() {
  toasts = [];
  global.UTILS = { mostrarToast: function(msg, tipo) { toasts.push({ msg: msg, tipo: tipo }); } };
  global.RESUMO_MENSAL = { texto: function() { return global.__texto; } };
  global.__texto = 'Meu mês em números — Setembro de 2026';
});
afterEach(function() {
  delete global.UTILS; delete global.RESUMO_MENSAL; delete global.__texto; delete global.navigator;
});

describe('INIT_RELATORIOS.compartilhar', function() {
  test('usa navigator.share quando disponível', function() {
    var shared = null;
    global.navigator = { share: function(o) { shared = o; return Promise.resolve(); } };
    INIT_RELATORIOS.compartilhar();
    expect(shared).toEqual({ text: 'Meu mês em números — Setembro de 2026' });
  });

  test('sem share, copia para a área de transferência', function() {
    var copiado = null;
    global.navigator = { clipboard: { writeText: function(t) { copiado = t; return Promise.resolve(); } } };
    INIT_RELATORIOS.compartilhar();
    expect(copiado).toBe('Meu mês em números — Setembro de 2026');
  });

  test('mês sem dados avisa e não compartilha', function() {
    global.__texto = null;
    var chamou = false;
    global.navigator = { share: function() { chamou = true; return Promise.resolve(); } };
    INIT_RELATORIOS.compartilhar();
    expect(chamou).toBe(false);
    expect(toasts.some(function(t) { return /Sem lançamentos/.test(t.msg); })).toBe(true);
  });

  test('cancelar o share (promise rejeitada) não estoura', function() {
    global.navigator = { share: function() { return Promise.reject(new Error('AbortError')); } };
    expect(function() { INIT_RELATORIOS.compartilhar(); }).not.toThrow();
  });
});
