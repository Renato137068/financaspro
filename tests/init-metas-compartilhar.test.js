/**
 * init-metas-compartilhar.test.js — botão "Compartilhar plano de metas".
 * @jest-environment node
 */
const INIT_METAS = require('../js/modules/init-metas.js');

let toasts;
beforeEach(function() {
  toasts = [];
  global.UTILS = { mostrarToast: function(msg, tipo) { toasts.push({ msg: msg, tipo: tipo }); } };
  global.PLANO_METAS = { texto: function() { return global.__texto; } };
  global.__texto = 'Meu plano de metas\n1. Viagem';
});
afterEach(function() {
  delete global.UTILS; delete global.PLANO_METAS; delete global.__texto; delete global.navigator;
});

describe('INIT_METAS.compartilharPlano', function() {
  test('usa navigator.share quando disponível', function() {
    var shared = null;
    global.navigator = { share: function(o) { shared = o; return Promise.resolve(); } };
    INIT_METAS.compartilharPlano();
    expect(shared).toEqual({ text: 'Meu plano de metas\n1. Viagem' });
  });

  test('sem share, copia para a área de transferência', function() {
    var copiado = null;
    global.navigator = { clipboard: { writeText: function(t) { copiado = t; return Promise.resolve(); } } };
    INIT_METAS.compartilharPlano();
    expect(copiado).toBe('Meu plano de metas\n1. Viagem');
  });

  test('sem metas avisa e não compartilha', function() {
    global.__texto = null;
    var chamou = false;
    global.navigator = { share: function() { chamou = true; return Promise.resolve(); } };
    INIT_METAS.compartilharPlano();
    expect(chamou).toBe(false);
    expect(toasts.some(function(t) { return /Crie uma meta/.test(t.msg); })).toBe(true);
  });

  test('cancelar o share (promise rejeitada) não estoura', function() {
    global.navigator = { share: function() { return Promise.reject(new Error('AbortError')); } };
    expect(function() { INIT_METAS.compartilharPlano(); }).not.toThrow();
  });
});
