/**
 * @jest-environment jsdom
 */
/**
 * mudar-aba-tipo-receita.test.js — passo "renda" (guia "Comece aqui" e aviso de renda
 * do saldo): 'mudar-aba' com data-tipo abre a aba Novo já em Receita.
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');
const { indexComTelas } = require('./helpers/index-com-telas.cjs');

const root = path.join(__dirname, '..');

test('mudar-aba com data-tipo="receita" abre o Novo já em Receita', () => {
  document.documentElement.innerHTML = indexComTelas();
  window.scrollTo = () => {};
  const sandbox = {
    window, document, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    localStorage: global.localStorage, navigator: window.navigator, location: window.location,
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    'var UTILS = { mostrarToast: function(){} };'
    + 'var DADOS = { getConfig: function(){ return {}; } };'
    + 'var TablistKeyboard, LAZY, CONTAS, HEALTH_SERVICE, FINANCE_RECONCILER, ALERTAS, CONFIG_USER, INIT_MODALS;',
    ctx,
    { filename: path.join(__dirname, 'stubs-mudar-aba.js') },
  );
  rodarNoContexto(ctx, path.join(root, 'js/modules/init-navigation.js'));

  const receita = document.querySelector('.tipo-btn[data-tipo="receita"]');
  expect(receita).not.toBeNull();
  let cliques = 0;
  receita.addEventListener('click', () => { cliques++; });

  const btn = document.createElement('button');
  btn.dataset.action = 'mudar-aba';
  btn.dataset.aba = 'novo';
  btn.dataset.tipo = 'receita';
  document.body.appendChild(btn);
  ctx.INIT_NAVIGATION.handleAction('mudar-aba', btn);

  expect(document.getElementById('aba-novo').classList.contains('ativo')).toBe(true);
  expect(document.getElementById('aba-resumo').classList.contains('ativo')).toBe(false);
  expect(cliques).toBe(1);
});

test('sem data-tipo o Novo abre como sempre (sem clicar em tipo)', () => {
  document.documentElement.innerHTML = indexComTelas();
  window.scrollTo = () => {};
  const sandbox = {
    window, document, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    localStorage: global.localStorage, navigator: window.navigator, location: window.location,
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    'var UTILS = { mostrarToast: function(){} };'
    + 'var DADOS = { getConfig: function(){ return {}; } };'
    + 'var TablistKeyboard, LAZY, CONTAS, HEALTH_SERVICE, FINANCE_RECONCILER, ALERTAS, CONFIG_USER, INIT_MODALS;',
    ctx,
    { filename: path.join(__dirname, 'stubs-mudar-aba.js') },
  );
  rodarNoContexto(ctx, path.join(root, 'js/modules/init-navigation.js'));
  let cliques = 0;
  document.querySelectorAll('.tipo-btn').forEach((b) => b.addEventListener('click', () => { cliques++; }));
  const btn = document.createElement('button');
  btn.dataset.aba = 'novo';
  ctx.INIT_NAVIGATION.handleAction('mudar-aba', btn);
  expect(document.getElementById('aba-novo').classList.contains('ativo')).toBe(true);
  expect(cliques).toBe(0);
});
