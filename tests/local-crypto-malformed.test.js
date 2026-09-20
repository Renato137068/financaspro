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
});
