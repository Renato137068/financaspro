/**
 * crypto-migration.test.js — DADOS.aplicarCriptografia() migra dados existentes
 * com segurança ao ligar/desligar a cifragem at-rest.
 *
 * Usa o WebCrypto REAL do Node (jsdom não expõe crypto.subtle) e carrega os
 * módulos reais config.js + local-crypto.js + dados.js num contexto vm.
 */
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

const ROOT = path.join(__dirname, '..');

let cryptoDescriptor;

beforeAll(function() {
  cryptoDescriptor = Object.getOwnPropertyDescriptor(global, 'crypto');
  Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true, writable: true });
});
afterAll(function() {
  if (cryptoDescriptor) Object.defineProperty(global, 'crypto', cryptoDescriptor);
  else delete global.crypto;
});

function freshContext() {
  global.localStorage.clear();
  // Sandbox próprio com os globais de HOST injetados como propriedades próprias
  // (crypto, TextEncoder/Decoder, localStorage, console). No Node 18, o
  // vm.createContext(global) não projeta esses globais como identificador nu; um
  // sandbox com propriedades próprias resolve em todas as versões.
  var sandbox = {
    window: global,
    // O grafo do DADOS inclui a UI (RENDER, INIT_MODALS…), que toca o DOM ao carregar.
    document: global.document,
    localStorage: global.localStorage,
    console: global.console,
    crypto: webcrypto,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    setTimeout: function() { return global.setTimeout.apply(null, arguments); },
    clearTimeout: function() { return global.clearTimeout.apply(null, arguments); },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  // dados.js (ES Module) traz config, local-crypto e o cliente Express pelo
  // grafo de imports; o que o sandbox já tem (o IDB_KV em memória) é dublê.
  rodarNoContexto(ctx, path.join(ROOT, 'js/core/dados.js'));
  // Expõe ao global para os testes acessarem global.DADOS/LOCAL_CRYPTO/CONFIG.
  ['CONFIG', 'LOCAL_CRYPTO', 'DADOS'].forEach(function(k) {
    if (typeof sandbox[k] !== 'undefined') global[k] = sandbox[k];
  });
  return ctx;
}

describe('DADOS.aplicarCriptografia — migração segura', function() {
  const TX = JSON.stringify([{ id: '1', valor: 10, categoria: 'alimentacao' }]);
  const CFG = JSON.stringify({ nome: 'Teste', moeda: 'BRL' });

  beforeEach(function() { freshContext(); global.LOCAL_CRYPTO.setEnabled(false); });
  afterEach(function() { global.localStorage.clear(); });

  test('WebCrypto real disponível no teste', function() {
    expect(!!(global.crypto && global.crypto.subtle)).toBe(true);
  });

  test('ligar cifra os dados existentes (enc3) e mantém legíveis via decrypt', async function() {
    global.localStorage.setItem('fp-transacoes', TX);
    global.localStorage.setItem('fp-config', CFG);

    const enabled = await global.DADOS.aplicarCriptografia(true);
    expect(enabled).toBe(true);

    // Armazenado cifrado, no formato ATUAL (600k iterações de PBKDF2)
    expect(global.localStorage.getItem('fp-transacoes').indexOf('enc3:')).toBe(0);
    expect(global.localStorage.getItem('fp-config').indexOf('enc3:')).toBe(0);

    // Decifra de volta ao original
    expect(await global.LOCAL_CRYPTO.decrypt(global.localStorage.getItem('fp-transacoes'))).toBe(TX);
    expect(await global.LOCAL_CRYPTO.decrypt(global.localStorage.getItem('fp-config'))).toBe(CFG);
  });

  test('desligar decifra de volta para texto puro (sem perder dados)', async function() {
    global.localStorage.setItem('fp-transacoes', TX);
    await global.DADOS.aplicarCriptografia(true);
    expect(global.localStorage.getItem('fp-transacoes').indexOf('enc3:')).toBe(0);

    const disabled = await global.DADOS.aplicarCriptografia(false);
    expect(disabled).toBe(false);
    // Volta ao texto puro idêntico ao original
    expect(global.localStorage.getItem('fp-transacoes')).toBe(TX);
  });

  test('round-trip completo preserva o conteúdo', async function() {
    global.localStorage.setItem('fp-contas', JSON.stringify([{ id: 'c1', nome: 'Nubank' }]));
    const original = global.localStorage.getItem('fp-contas');
    await global.DADOS.aplicarCriptografia(true);
    await global.DADOS.aplicarCriptografia(false);
    expect(global.localStorage.getItem('fp-contas')).toBe(original);
  });

  test('chaves ausentes não quebram a migração', async function() {
    // Sem nenhuma chave setada
    await expect(global.DADOS.aplicarCriptografia(true)).resolves.toBe(true);
    await expect(global.DADOS.aplicarCriptografia(false)).resolves.toBe(false);
  });

  test('invalida o cache em memória ao migrar', async function() {
    global.localStorage.setItem('fp-transacoes', TX);
    global.DADOS._plainCache['fp-transacoes'] = 'valor-velho';
    await global.DADOS.aplicarCriptografia(true);
    expect(global.DADOS._plainCache['fp-transacoes']).toBeUndefined();
  });
  /**
   * O ponto que torna a mudança de 100k para 600k iterações segura: um valor
   * já gravado como enc2 PRECISA continuar legível. Sem este teste, subir as
   * iterações "no lugar" tornaria ilegível todo dado de quem tinha a cifragem
   * ligada — perda silenciosa, descoberta só pelo usuário.
   */
  test('dado antigo em enc2 (100k) continua legível depois da subida para enc3', async function() {
    const LC = global.LOCAL_CRYPTO;
    LC.setEnabled(true);

    // Cifra manualmente no formato antigo, usando a MESMA rotina de derivação
    // com a versão enc2 — é exatamente o que a versão anterior gravava.
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const key = await LC._deriveKey('enc2');
    const buf = await global.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(TX),
    );
    const hex = function(bytes) {
      return Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    };
    const antigo = 'enc2:' + hex(iv) + ':' + hex(new Uint8Array(buf));

    expect(LC.isEncrypted(antigo)).toBe(true);
    expect(await LC.decrypt(antigo)).toBe(TX);
  });

  test('encrypt sempre grava na versão atual, nunca na antiga', async function() {
    global.LOCAL_CRYPTO.setEnabled(true);
    const cifrado = await global.LOCAL_CRYPTO.encrypt(TX);
    expect(cifrado.indexOf('enc3:')).toBe(0);
    expect(await global.LOCAL_CRYPTO.decrypt(cifrado)).toBe(TX);
  });
});
