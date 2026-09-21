/**
 * share-texto.test.js — helper compartilhado de compartilhamento.
 * @jest-environment node
 */
const compartilharTextoUI = require('../js/utilities/share-texto.js');

let toasts;
beforeEach(function() {
  toasts = [];
  global.UTILS = { mostrarToast: function(msg, tipo) { toasts.push({ msg: msg, tipo: tipo }); } };
});
afterEach(function() { delete global.UTILS; delete global.navigator; });

describe('compartilharTextoUI', function() {
  test('usa navigator.share quando disponível', function() {
    var shared = null;
    global.navigator = { share: function(o) { shared = o; return Promise.resolve(); } };
    compartilharTextoUI('oi', { copiado: 'Copiado' });
    expect(shared).toEqual({ text: 'oi' });
  });

  test('sem share, copia e avisa com a mensagem dada', function() {
    var copiado = null;
    global.navigator = { clipboard: { writeText: function(t) { copiado = t; return Promise.resolve(); } } };
    return Promise.resolve()
      .then(function() { compartilharTextoUI('oi', { copiado: 'Resumo copiado' }); })
      .then(function() { return Promise.resolve(); })
      .then(function() {
        expect(copiado).toBe('oi');
        expect(toasts.some(function(t) { return t.msg === 'Resumo copiado'; })).toBe(true);
      });
  });

  test('texto vazio dispara o toast opts.vazio e não compartilha', function() {
    var chamou = false;
    global.navigator = { share: function() { chamou = true; return Promise.resolve(); } };
    compartilharTextoUI(null, { vazio: 'Nada a compartilhar' });
    expect(chamou).toBe(false);
    expect(toasts.some(function(t) { return t.msg === 'Nada a compartilhar'; })).toBe(true);
  });

  test('sem share nem clipboard avisa indisponível', function() {
    global.navigator = {};
    compartilharTextoUI('oi', {});
    expect(toasts.some(function(t) { return /indisponível/i.test(t.msg); })).toBe(true);
  });

  test('cancelar o share não estoura', function() {
    global.navigator = { share: function() { return Promise.reject(new Error('AbortError')); } };
    expect(function() { compartilharTextoUI('oi', {}); }).not.toThrow();
  });
});
