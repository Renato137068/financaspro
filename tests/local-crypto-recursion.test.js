/**
 * local-crypto-recursion.test.js — flag de cifragem at-rest em chave plana.
 *
 * Antes, LOCAL_CRYPTO.isEnabled() lia `cryptoAtRestEnabled` via DADOS.getConfig(),
 * que passa por _storageGetRaw() → isEnabled(): ciclo infinito (RangeError) no
 * boot. Agora o flag vive numa chave PLANA lida direto do localStorage, então
 * isEnabled() NÃO chama getConfig — o ciclo é impossível por construção. Estes
 * testes usam o LOCAL_CRYPTO real.
 */
const LOCAL_CRYPTO = require('../js/utilities/local-crypto.js');

const KEY = 'financaspro_crypto_enabled';

beforeEach(function() { global.localStorage.clear(); });
afterEach(function() { delete global.DADOS; global.localStorage.clear(); });

describe('LOCAL_CRYPTO — flag em chave plana (sem recursão)', function() {
  test('isEnabled() NÃO chama DADOS.getConfig — ciclo eliminado na raiz', function() {
    var calls = 0;
    global.DADOS = { getConfig: function() { calls++; return {}; } };
    LOCAL_CRYPTO.isEnabled();
    expect(calls).toBe(0);
  });

  test('getConfig que chama isEnabled termina sem recorrer', function() {
    var calls = 0;
    global.DADOS = {
      getConfig: function() {
        calls++;
        if (calls > 50) throw new Error('runaway recursion');
        return { cryptoAtRestEnabled: LOCAL_CRYPTO.isEnabled() };
      },
    };
    expect(function() { global.DADOS.getConfig(); }).not.toThrow();
    expect(calls).toBe(1);
  });

  test('setEnabled grava e remove a chave plana (fora do prefixo fp-)', function() {
    expect(KEY.indexOf('fp-')).toBe(-1); // não é cifrada pela própria camada
    LOCAL_CRYPTO.setEnabled(true);
    expect(global.localStorage.getItem(KEY)).toBe('1');
    LOCAL_CRYPTO.setEnabled(false);
    expect(global.localStorage.getItem(KEY)).toBeNull();
  });

  test('isEnabled reflete o flag (condicionado ao suporte a WebCrypto do ambiente)', function() {
    var hasWebCrypto = typeof crypto !== 'undefined' && !!crypto.subtle;
    LOCAL_CRYPTO.setEnabled(true);
    expect(LOCAL_CRYPTO.isEnabled()).toBe(hasWebCrypto);
    LOCAL_CRYPTO.setEnabled(false);
    expect(LOCAL_CRYPTO.isEnabled()).toBe(false);
  });

  test('isEnabled true com flag setado + WebCrypto disponível', function() {
    var orig = Object.getOwnPropertyDescriptor(global, 'crypto');
    Object.defineProperty(global, 'crypto', { value: { subtle: {} }, configurable: true, writable: true });
    try {
      LOCAL_CRYPTO.setEnabled(true);
      expect(LOCAL_CRYPTO.isEnabled()).toBe(true);
      LOCAL_CRYPTO.setEnabled(false);
      expect(LOCAL_CRYPTO.isEnabled()).toBe(false);
    } finally {
      if (orig) Object.defineProperty(global, 'crypto', orig);
      else delete global.crypto;
    }
  });

  test('isEncrypted detecta enc1 e enc2 (versões suportadas pelo decrypt)', function() {
    expect(LOCAL_CRYPTO.isEncrypted('enc1:abc:def')).toBe(true);
    expect(LOCAL_CRYPTO.isEncrypted('enc2:abc:def')).toBe(true);
    expect(LOCAL_CRYPTO.isEncrypted('{"nome":"texto puro"}')).toBe(false);
    expect(LOCAL_CRYPTO.isEncrypted('')).toBe(false);
    expect(LOCAL_CRYPTO.isEncrypted(null)).toBe(false);
    expect(LOCAL_CRYPTO.isEncrypted(undefined)).toBe(false);
  });

  test('sem WebCrypto, isEnabled é false mesmo com flag setado', function() {
    var orig = Object.getOwnPropertyDescriptor(global, 'crypto');
    Object.defineProperty(global, 'crypto', { value: undefined, configurable: true, writable: true });
    try {
      LOCAL_CRYPTO.setEnabled(true);
      expect(LOCAL_CRYPTO.isEnabled()).toBe(false);
    } finally {
      if (orig) Object.defineProperty(global, 'crypto', orig);
      else delete global.crypto;
    }
  });
});
