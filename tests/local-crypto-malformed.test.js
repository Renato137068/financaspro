/**
 * local-crypto-malformed.test.js — valor cifrado corrompido não derruba a leitura.
 *
 * Regressão: decrypt() chamava _hexToBytes() SÍNCRONO antes da cadeia de
 * promise; um segmento hex vazio/ inválido (ex.: 'enc3::') fazia match()
 * devolver null e null.map lançar — fora do alcance do .catch —, estourando a
 * leitura do armazenamento em vez de devolver o valor.
 */
const LOCAL_CRYPTO = require('../js/utilities/local-crypto.js');

beforeEach(function() { global.localStorage.clear(); });
afterEach(function() { delete global.DADOS; global.localStorage.clear(); });

describe('LOCAL_CRYPTO — valor corrompido', function() {
  test('_hexToBytes é robusto a entrada vazia/nula (não lança)', function() {
    expect(Array.from(LOCAL_CRYPTO._hexToBytes(''))).toEqual([]);
    expect(Array.from(LOCAL_CRYPTO._hexToBytes(null))).toEqual([]);
    expect(Array.from(LOCAL_CRYPTO._hexToBytes(undefined))).toEqual([]);
    expect(Array.from(LOCAL_CRYPTO._hexToBytes('61'))).toEqual([0x61]);
  });

  test('decrypt("enc3::") não lança síncrono e resolve para o valor', function() {
    LOCAL_CRYPTO.setEnabled(true); // efetivo só com WebCrypto; o caminho é seguro nos dois casos
    var malformado = 'enc3::';
    var p;
    expect(function() { p = LOCAL_CRYPTO.decrypt(malformado); }).not.toThrow();
    return expect(p).resolves.toBe(malformado);
  });

  test('decrypt de hex ímpar/curto não derruba, devolve o valor', function() {
    LOCAL_CRYPTO.setEnabled(true);
    var malformado = 'enc3:abc:def01';
    var p;
    expect(function() { p = LOCAL_CRYPTO.decrypt(malformado); }).not.toThrow();
    return expect(p).resolves.toBe(malformado);
  });

  test('_deriveKey não cacheia rejeição permanente — permite nova tentativa', async function() {
    if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.importKey !== 'function') {
      return; // sem WebCrypto no ambiente: nada a exercitar
    }
    LOCAL_CRYPTO.setEnabled(true);
    LOCAL_CRYPTO._keyPromises = null; // zera cache
    LOCAL_CRYPTO._keyMats = null;

    var real = crypto.subtle.importKey.bind(crypto.subtle);
    var writable = true;
    var calls = 0;
    try {
      crypto.subtle.importKey = function() {
        calls++;
        if (calls === 1) return Promise.reject(new Error('falha transitória'));
        return real.apply(crypto.subtle, arguments);
      };
    } catch (e) { writable = false; }
    if (!writable || crypto.subtle.importKey === real) return; // não dá para stubar aqui

    try {
      await expect(LOCAL_CRYPTO._deriveKey('enc3')).rejects.toBeTruthy();
      // 2ª chamada: se a rejeição tivesse ficado cacheada, reusaria e rejeitaria
      // de novo; com o cache limpo, deriva com sucesso.
      var key = await LOCAL_CRYPTO._deriveKey('enc3');
      expect(key).toBeTruthy();
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      crypto.subtle.importKey = real;
      LOCAL_CRYPTO._keyPromises = null;
      LOCAL_CRYPTO._keyMats = null;
    }
  });
});
