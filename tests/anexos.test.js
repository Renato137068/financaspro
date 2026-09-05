/**
 * anexos.test.js — aponta para o módulo real (evita teste-cópia).
 * Cobertura detalhada em anexos-real.test.js.
 */
const ANEXOS = require('../js/anexos.js');

describe('Anexos — validação (módulo real)', function() {
  test('aceita JPEG dentro do limite', function() {
    expect(ANEXOS.validarArquivo({ type: 'image/jpeg', size: 500000 }).valido).toBe(true);
  });

  test('rejeita tipo não permitido', function() {
    expect(ANEXOS.validarArquivo({ type: 'application/zip', size: 1000 }).valido).toBe(false);
  });

  test('rejeita arquivo acima de 2 MB', function() {
    expect(ANEXOS.validarArquivo({ type: 'image/png', size: 3 * 1024 * 1024 }).valido).toBe(false);
  });
});
