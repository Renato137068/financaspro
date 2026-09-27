/**
 * idb-cifragem.test.js — o blob de lançamentos no IndexedDB segue a opção
 * "cifrar dados", como as chaves do localStorage.
 *
 * Antes, quem passava de ~2.500 lançamentos (backend 'idb') tinha a lista
 * gravada em texto puro no IndexedDB mesmo com a cifragem ligada. Estes testes
 * carregam os módulos reais (config + local-crypto + dados) num contexto vm,
 * com WebCrypto real do Node e um IDB_KV em memória.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');
const { executarModulo } = require('./helpers/esm-como-script.cjs');

const ROOT = path.join(__dirname, '..');
const TX_KEY = 'fp-transacoes';
const LISTA = [
  { id: 't1', tipo: 'despesa', valor: 42.5, categoria: 'alimentacao', data: '2026-09-10', descricao: 'Mercado' },
  { id: 't2', tipo: 'receita', valor: 5000, categoria: 'salario', data: '2026-09-05', descricao: 'Salário' },
];

function loadInto(context, rel) {
  const arquivo = path.join(ROOT, rel);
  // config.js é ES Module (ADR 0005): o conversor deixa CONFIG como global do contexto.
  if (/^(import|export)\b/m.test(fs.readFileSync(arquivo, 'utf8'))) { executarModulo(context, arquivo); return; }
  vm.runInContext(fs.readFileSync(arquivo, 'utf8'), context, { filename: rel });
}

function criarIdbFake() {
  const mapa = new Map();
  return {
    mapa: mapa,
    isReady: function() { return true; },
    init: function() { return Promise.resolve(true); },
    get: function(k) { return Promise.resolve(mapa.has(k) ? String(mapa.get(k)) : null); },
    set: function(k, v) { mapa.set(k, v); return Promise.resolve(true); },
    remove: function(k) { mapa.delete(k); return Promise.resolve(true); },
  };
}

let cryptoDescriptor;
beforeAll(function() {
  cryptoDescriptor = Object.getOwnPropertyDescriptor(global, 'crypto');
  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true, writable: true });
});
afterAll(function() {
  if (cryptoDescriptor) Object.defineProperty(global, 'crypto', cryptoDescriptor);
  else delete global.crypto;
});

function contexto(extras) {
  global.localStorage.clear();
  const idb = criarIdbFake();
  const sandbox = {
    window: global,
    localStorage: global.localStorage,
    console: global.console,
    crypto: webcrypto,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    IDB_KV: idb,
    setTimeout: function() { return global.setTimeout.apply(null, arguments); },
    clearTimeout: function() { return global.clearTimeout.apply(null, arguments); },
  };
  Object.assign(sandbox, extras || {});
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  loadInto(ctx, 'js/core/config.js');
  loadInto(ctx, 'js/utilities/local-crypto.js');
  executarModulo(ctx, path.join(ROOT, 'js/core/dados-express.js'));
  loadInto(ctx, 'js/core/dados.js');
  return { DADOS: sandbox.DADOS, LC: sandbox.LOCAL_CRYPTO, idb: idb };
}

/** Coloca o DADOS no backend 'idb' com a lista em memória, sem gravar nada. */
function usarBackendIdb(DADOS, lista) {
  DADOS._transacoesBackend = 'idb';
  DADOS._transacoesCache = lista.slice();
}

describe('IndexedDB de lançamentos respeita "cifrar dados"', function() {
  afterEach(function() { global.localStorage.clear(); });

  test('com a cifragem ligada, a gravação no IDB sai cifrada (enc3) e volta legível', async function() {
    const { DADOS, LC, idb } = contexto();
    LC.setEnabled(true);
    usarBackendIdb(DADOS, []);

    DADOS._storageSetTransacoes(LISTA);
    await DADOS._idbWriteChain;

    const gravado = idb.mapa.get(TX_KEY);
    expect(gravado.indexOf('enc3:')).toBe(0);
    expect(gravado).not.toContain('Mercado');
    expect(JSON.parse(await DADOS._idbLerTransacoes())).toEqual(LISTA);
  });

  test('com a cifragem desligada, o IDB continua em texto puro (sem mudança de formato)', async function() {
    const { DADOS, LC, idb } = contexto();
    LC.setEnabled(false);
    usarBackendIdb(DADOS, []);

    DADOS._storageSetTransacoes(LISTA);
    await DADOS._idbWriteChain;

    expect(idb.mapa.get(TX_KEY)).toBe(JSON.stringify(LISTA));
  });

  test('migração para o IDB (acima do limiar) já grava cifrado', async function() {
    const { DADOS, LC, idb } = contexto();
    LC.setEnabled(true);

    await DADOS._ativarBackendIdbTransacoes(LISTA);

    expect(idb.mapa.get(TX_KEY).indexOf('enc3:')).toBe(0);
    expect(DADOS._transacoesBackend).toBe('idb');
  });

  test('ligar a cifragem recifra o blob existente; desligar devolve ao texto puro', async function() {
    const { DADOS, LC, idb } = contexto();
    LC.setEnabled(false);
    usarBackendIdb(DADOS, LISTA);
    idb.mapa.set(TX_KEY, JSON.stringify(LISTA));

    await expect(DADOS.aplicarCriptografia(true)).resolves.toBe(true);
    expect(idb.mapa.get(TX_KEY).indexOf('enc3:')).toBe(0);
    expect(JSON.parse(await DADOS._idbLerTransacoes())).toEqual(LISTA);

    await expect(DADOS.aplicarCriptografia(false)).resolves.toBe(false);
    expect(idb.mapa.get(TX_KEY)).toBe(JSON.stringify(LISTA));
  });

  test('a migração não perde lançamento salvo enquanto ela acontece', async function() {
    const { DADOS, LC, idb } = contexto();
    LC.setEnabled(false);
    usarBackendIdb(DADOS, LISTA);
    idb.mapa.set(TX_KEY, JSON.stringify(LISTA));

    const migrando = DADOS.aplicarCriptografia(true);
    const novo = { id: 't3', tipo: 'despesa', valor: 12, categoria: 'transporte', data: '2026-09-11', descricao: 'Ônibus' };
    DADOS._storageSetTransacoes(LISTA.concat([novo]));
    await migrando;
    await DADOS._idbWriteChain;

    const ids = JSON.parse(await DADOS._idbLerTransacoes()).map(function(t) { return t.id; });
    expect(ids).toEqual(['t1', 't2', 't3']);
  });

  test('blob que não decifra é preservado antes de qualquer sobrescrita', async function() {
    const { DADOS, LC, idb } = contexto();
    LC.setEnabled(true);
    usarBackendIdb(DADOS, []);
    DADOS._storageSetTransacoes(LISTA);
    await DADOS._idbWriteChain;
    const cifradoOriginal = idb.mapa.get(TX_KEY);

    // Troca o segredo do aparelho: a chave derivada muda e o blob deixa de decifrar.
    global.localStorage.setItem('financaspro_ckey_dev', 'outro-segredo-qualquer');
    global.localStorage.setItem(DADOS.TX_BACKEND_KEY, 'idb');
    DADOS._transacoesCache = null;
    DADOS._registrarFalhaLeitura = function() { DADOS._falhou = true; };

    await DADOS._prepararStorageTransacoes();

    expect(DADOS._falhou).toBe(true);
    expect(DADOS._transacoesCache).toEqual([]);
    expect(idb.mapa.get(TX_KEY + '-ilegivel')).toBe(cifradoOriginal);
  });
});

describe('localStorage: gravação comum de lançamentos', function() {
  test('_storageSetTransacoes grava e libera o sync entre abas sem erro', async function() {
    // Stub mínimo do UTILS (o contexto não carrega utils.js).
    const { DADOS, LC } = contexto({
      UTILS: { verificarStorageDisponivel: function() { return { disponivel: true }; } },
    });
    LC.setEnabled(false);
    DADOS._transacoesBackend = 'localStorage';

    expect(function() { DADOS._storageSetTransacoes(LISTA); }).not.toThrow();
    expect(global.localStorage.getItem(TX_KEY)).toBe(JSON.stringify(LISTA));
    await new Promise(function(r) { setTimeout(r, 5); });
    expect(DADOS._ignorarStorageSync).toBe(false);
  });
});

describe('localStorage: merge multi-aba passa pelo wrapper de cifragem', function() {
  test('_persistirTransacoesLista cifra quando a opção está ligada', async function() {
    const { DADOS, LC } = contexto();
    LC.setEnabled(true);
    DADOS._transacoesBackend = 'localStorage';

    DADOS._persistirTransacoesLista(LISTA);
    await DADOS._diskWriteChain;

    const gravado = global.localStorage.getItem(TX_KEY);
    expect(gravado.indexOf('enc3:')).toBe(0);
    expect(await LC.decrypt(gravado)).toBe(JSON.stringify(LISTA));
  });
});
