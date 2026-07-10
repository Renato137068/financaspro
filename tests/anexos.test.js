/**
 * anexos.test.js — Validação de anexos
 */

var ANEXOS_RULES = {
  MAX_BYTES: 2 * 1024 * 1024,
  MIME_PERMITIDOS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
};

function validarAnexo(file) {
  if (!file) return { valido: false, erro: 'Arquivo inválido' };
  if (ANEXOS_RULES.MIME_PERMITIDOS.indexOf(file.type) === -1) {
    return { valido: false, erro: 'Tipo não permitido' };
  }
  if (file.size > ANEXOS_RULES.MAX_BYTES) {
    return { valido: false, erro: 'Arquivo muito grande' };
  }
  return { valido: true };
}

describe('Anexos — validação', function() {
  test('aceita JPEG dentro do limite', function() {
    var r = validarAnexo({ type: 'image/jpeg', size: 500000 });
    expect(r.valido).toBe(true);
  });

  test('rejeita tipo não permitido', function() {
    var r = validarAnexo({ type: 'application/zip', size: 1000 });
    expect(r.valido).toBe(false);
  });

  test('rejeita arquivo acima de 2 MB', function() {
    var r = validarAnexo({ type: 'image/png', size: 3 * 1024 * 1024 });
    expect(r.valido).toBe(false);
  });
});

function arrayBufferToBase64(bytes) {
  var binary = '';
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(b64) {
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('Anexos — base64 roundtrip', function() {
  test('preserva bytes após encode/decode', function() {
    var original = new Uint8Array([1, 2, 3, 255, 0, 42]);
    var b64 = arrayBufferToBase64(original);
    var decoded = base64ToArrayBuffer(b64);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });
});
