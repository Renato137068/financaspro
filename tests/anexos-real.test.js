/**
 * anexos-real.test.js — módulo real js/anexos.js (não cópia inline).
 */
const ANEXOS = require('../js/anexos.js');

describe('ANEXOS.validarArquivo', function() {
  test('aceita JPEG dentro do limite', function() {
    expect(ANEXOS.validarArquivo({ type: 'image/jpeg', size: 500000 })).toEqual({ valido: true });
  });

  test('rejeita tipo não permitido', function() {
    var r = ANEXOS.validarArquivo({ type: 'application/zip', size: 1000 });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/imagem|PDF/i);
  });

  test('rejeita arquivo acima de 2 MB', function() {
    var r = ANEXOS.validarArquivo({ type: 'image/png', size: 3 * 1024 * 1024 });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/2 MB/);
  });

  test('null é inválido', function() {
    expect(ANEXOS.validarArquivo(null).valido).toBe(false);
  });
});

describe('ANEXOS — base64 helpers', function() {
  test('roundtrip preserva bytes', function() {
    var original = new Uint8Array([1, 2, 3, 255, 0, 42]).buffer;
    var b64 = ANEXOS._arrayBufferToBase64(original);
    var decoded = new Uint8Array(ANEXOS._base64ToArrayBuffer(b64));
    expect(Array.from(decoded)).toEqual([1, 2, 3, 255, 0, 42]);
  });
});

describe('ANEXOS — constantes', function() {
  test('limites e MIME alinhados ao produto', function() {
    expect(ANEXOS.MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(ANEXOS.MAX_POR_TX).toBe(3);
    expect(ANEXOS.MIME_PERMITIDOS).toContain('application/pdf');
  });
});
