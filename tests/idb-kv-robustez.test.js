/**
 * idb-kv-robustez.test.js — toda gravação no IndexedDB termina e diz a verdade.
 *
 * Origem: auditoria de integridade de dados (2026-10-09). Cota cheia aborta a
 * transação sem `error`; a promessa do set() nunca resolvia e a fila de
 * gravação dos lançamentos parava. Conexão fechada pelo sistema fazia o set()
 * rejeitar fora do contrato.
 */
const { IDBFactory } = require('fake-indexeddb');
const { carregarScript } = require('./helpers/carregar-script.cjs');

// O jsdom do Jest não tem structuredClone, que o fake-indexeddb usa.
if (typeof global.structuredClone !== 'function') {
  const v8 = require('v8');
  global.structuredClone = (v) => v8.deserialize(v8.serialize(v));
}

function carregar() {
  global.indexedDB = new IDBFactory();
  return carregarScript('js/core/idb-kv.js');
}

afterEach(() => { delete global.indexedDB; });

describe('IDB_KV', () => {
  test('grava e lê', async () => {
    const kv = carregar();
    expect(await kv.set('k', 'v')).toBe(true);
    expect(await kv.get('k')).toBe('v');
    expect(await kv.remove('k')).toBe(true);
    expect(await kv.get('k')).toBeNull();
  });

  test('conexão fechada pelo sistema: reabre e grava', async () => {
    const kv = carregar();
    await kv.init();
    kv._db.close(); // o WebView fechou o banco em segundo plano
    expect(await kv.set('k', 'v2')).toBe(true);
    expect(await kv.get('k')).toBe('v2');
  });

  test('transação abortada (cota cheia) resolve false com o motivo', async () => {
    const kv = carregar();
    await kv.init();
    const erro = { name: 'QuotaExceededError' };
    kv._db.transaction = () => {
      const tx = { error: erro, objectStore: () => ({ put() {} }) };
      setTimeout(() => tx.onabort && tx.onabort(), 0);
      return tx;
    };
    expect(await kv.set('k', 'v')).toBe(false);
    expect(kv.ultimoErro).toBe(erro);
  });

  test('sem IndexedDB: false, sem exceção', async () => {
    const kv = carregarScript('js/core/idb-kv.js');
    expect(await kv.set('k', 'v')).toBe(false);
    expect(await kv.get('k')).toBeNull();
  });
});
