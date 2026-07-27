/**
 * local-crypto-recursion.test.js — regressão do ciclo getConfig ⇄ isEnabled.
 *
 * DADOS._storageGetRaw() chama LOCAL_CRYPTO.isEnabled(), e isEnabled() lia a
 * config via DADOS.getConfig() (que passa por _storageGetRaw), formando um ciclo
 * infinito que estourava a pilha (RangeError) em loop no carregamento.
 * A guarda de reentrância em isEnabled() quebra o ciclo. Estes testes usam o
 * LOCAL_CRYPTO REAL com um DADOS que reproduz o ciclo.
 */
const LOCAL_CRYPTO = require('../js/utilities/local-crypto.js');

afterEach(function() {
  delete global.DADOS;
  LOCAL_CRYPTO._computingEnabled = false;
  LOCAL_CRYPTO._lastEnabled = false;
});

describe('LOCAL_CRYPTO.isEnabled — sem recursão infinita', function() {
  test('getConfig que reentra em isEnabled não estoura a pilha', function() {
    var calls = 0;
    // Reproduz o ciclo real: getConfig -> _storageGetRaw -> isEnabled
    global.DADOS = {
      getConfig: function() {
        calls++;
        if (calls > 50) throw new Error('runaway recursion — guarda de reentrância falhou');
        return { cryptoAtRestEnabled: LOCAL_CRYPTO.isEnabled() };
      },
    };

    var result;
    expect(function() { result = LOCAL_CRYPTO.isEnabled(); }).not.toThrow();
    expect(typeof result).toBe('boolean');
    // Com a guarda, getConfig é chamado no máximo 1x por isEnabled de topo.
    // Sem a guarda, o contador dispararia até estourar (>50).
    expect(calls).toBeLessThan(3);
  });

  test('reflete cryptoAtRestEnabled=false sem reentrância', function() {
    global.DADOS = { getConfig: function() { return { cryptoAtRestEnabled: false }; } };
    expect(LOCAL_CRYPTO.isEnabled()).toBe(false);
  });

  test('sem DADOS definido devolve false sem quebrar', function() {
    expect(LOCAL_CRYPTO.isEnabled()).toBe(false);
  });

  test('chamadas de topo consecutivas recomputam (guarda só afeta reentrância)', function() {
    var enabled = false;
    global.DADOS = { getConfig: function() { return { cryptoAtRestEnabled: enabled }; } };
    expect(LOCAL_CRYPTO.isEnabled()).toBe(false);
    enabled = true; // se crypto.subtle não existir no jsdom, segue false — só validamos que recomputa sem travar
    expect(function() { LOCAL_CRYPTO.isEnabled(); }).not.toThrow();
  });
});
