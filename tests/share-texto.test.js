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

  test('cancelar o share (AbortError) é silêncio — não copia nem avisa', function() {
    var copiou = false;
    var err = new Error('cancel'); err.name = 'AbortError';
    global.navigator = {
      share: function() { return Promise.reject(err); },
      clipboard: { writeText: function() { copiou = true; return Promise.resolve(); } },
    };
    compartilharTextoUI('oi', { copiado: 'Copiado' });
    return Promise.resolve().then(function() { return Promise.resolve(); }).then(function() {
      expect(copiou).toBe(false);
      expect(toasts.length).toBe(0);
    });
  });

  test('falha real do share cai para copiar', function() {
    var copiado = null;
    var err = new Error('no'); err.name = 'NotAllowedError';
    global.navigator = {
      share: function() { return Promise.reject(err); },
      clipboard: { writeText: function(t) { copiado = t; return Promise.resolve(); } },
    };
    compartilharTextoUI('oi', { copiado: 'Copiado' });
    return Promise.resolve().then(function() { return Promise.resolve(); }).then(function() {
      expect(copiado).toBe('oi');
    });
  });

  test('falha real sem clipboard avisa', function() {
    var err = new Error('no'); err.name = 'NotAllowedError';
    global.navigator = { share: function() { return Promise.reject(err); } };
    compartilharTextoUI('oi', {});
    return Promise.resolve().then(function() { return Promise.resolve(); }).then(function() {
      expect(toasts.some(function(t) { return /Não foi possível compartilhar/.test(t.msg); })).toBe(true);
    });
  });
});
