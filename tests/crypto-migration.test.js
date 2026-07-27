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
  // Injeta TextEncoder/TextDecoder como propriedades planas — os getters
  // não-enumeráveis não resolvem como identificador nu dentro do sandbox vm.
  global.__TE = TextEncoder;
  global.__TD = TextDecoder;
  const ctx = vm.createContext(global);
  // Property access (globalThis.X) em vez de nome nu: robusto no Node 18, onde
  // propriedades adicionadas ao global após createContext não resolvem por nome.
  // Bindamos crypto/localStorage também porque os módulos os usam como nome nu.
  vm.runInContext(
    'var window = globalThis;'
    + ' var TextEncoder = globalThis.__TE; var TextDecoder = globalThis.__TD;'
    + ' var crypto = globalThis.crypto; var localStorage = globalThis.localStorage;',
    ctx,
  );
  loadInto(ctx, 'js/core/config.js');
  loadInto(ctx, 'js/utilities/local-crypto.js');
  loadInto(ctx, 'js/core/dados.js');
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
