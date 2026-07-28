/**
 * crypto-migration.test.js — DADOS.aplicarCriptografia() migra dados existentes
 * com segurança ao ligar/desligar a cifragem at-rest.
 *
 * Usa o WebCrypto REAL do Node (jsdom não expõe crypto.subtle) e carrega os
 * módulos reais config.js + local-crypto.js + dados.js num contexto vm.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder, TextDecoder } = require('util');

const ROOT = path.join(__dirname, '..');

function loadInto(context, rel) {
  let code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  code = code.replace(/\bconst (CONFIG) =/g, 'var $1 ='); // expõe como global do contexto
  vm.runInContext(code, context, { filename: rel });
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

function freshContext() {
  global.localStorage.clear();
  // Sandbox próprio com os globais de HOST injetados como propriedades próprias
  // (crypto, TextEncoder/Decoder, localStorage, console). No Node 18, o
  // vm.createContext(global) não projeta esses globais como identificador nu; um
  // sandbox com propriedades próprias resolve em todas as versões.
  var sandbox = {
    window: global,
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
  loadInto(ctx, 'js/core/config.js');
  loadInto(ctx, 'js/utilities/local-crypto.js');
  loadInto(ctx, 'js/core/dados.js');
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

  test('ligar cifra os dados existentes (enc2) e mantém legíveis via decrypt', async function() {
    global.localStorage.setItem('fp-transacoes', TX);
    global.localStorage.setItem('fp-config', CFG);

    const enabled = await global.DADOS.aplicarCriptografia(true);
    expect(enabled).toBe(true);

    // Armazenado cifrado
    expect(global.localStorage.getItem('fp-transacoes').indexOf('enc2:')).toBe(0);
    expect(global.localStorage.getItem('fp-config').indexOf('enc2:')).toBe(0);

    // Decifra de volta ao original
    expect(await global.LOCAL_CRYPTO.decrypt(global.localStorage.getItem('fp-transacoes'))).toBe(TX);
    expect(await global.LOCAL_CRYPTO.decrypt(global.localStorage.getItem('fp-config'))).toBe(CFG);
  });

  test('desligar decifra de volta para texto puro (sem perder dados)', async function() {
    global.localStorage.setItem('fp-transacoes', TX);
    await global.DADOS.aplicarCriptografia(true);
    expect(global.localStorage.getItem('fp-transacoes').indexOf('enc2:')).toBe(0);

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
});
