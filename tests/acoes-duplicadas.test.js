/**
 * acoes-duplicadas.test.js — garante que um clique dispara UMA ação.
 *
 * O app tem dois sistemas de delegação de `data-action` rodando ao mesmo tempo:
 *
 *   - EVENT_BUS/EVENT_INIT (js/core/event-bus.js), com listeners por container
 *     (#main-content, #form-transacao, #aba-extrato, ...);
 *   - INIT_NAVIGATION (js/modules/init-navigation.js), com um listener no
 *     `document`.
 *
 * Como o clique borbulha do container até o document, os dois veem o mesmo
 * evento. Dezenove ações estavam declaradas nos dois — e para várias delas
 * executar duas vezes não é inofensivo:
 *
 *   navegar-periodo   -> anda dois meses por clique
 *   toggle-graficos   -> abre e fecha, o painel nunca aparece
 *   exportar-excel    -> dois downloads
 *
 * Este teste monta o index.html real e compara os dois mapas de ações. É o tipo
 * de bug que passa despercebido em revisão porque cada arquivo, lido isolado,
 * está correto.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const SONDA = path.join(__dirname, 'acoes-duplicadas.probe.js');

function carregarApp() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  document.documentElement.innerHTML = html;

  const sandbox = {
    window,
    document,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    localStorage: global.localStorage,
    navigator: window.navigator,
    location: window.location,
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  // Dependências mínimas: só o suficiente para os dois sistemas de delegação se
  // ligarem. Os handlers reais são substituídos pelos espiões dos testes.
  vm.runInContext(
    'var UTILS = { mostrarToast: function(){}, comCarregamento: function(b, fn){ return fn(); } };'
    + 'var DADOS = { getConfig: function(){ return {}; } };'
    + 'var mudarAba = function(){};',
    ctx,
    { filename: path.join(__dirname, 'acoes-duplicadas.fixtures.js') },
  );

  ['js/core/event-bus.js', 'js/modules/init-navigation.js'].forEach((rel) => {
    vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, {
      filename: path.join(root, rel),
    });
  });

  return ctx;
}

describe('delegação de data-action', () => {
  let ctx;

  beforeEach(() => {
    ctx = carregarApp();
  });

  test('os dois sistemas de delegação existem (o teste não pode virar no-op)', () => {
    expect(vm.runInContext('typeof EVENT_INIT', ctx, { filename: SONDA })).toBe('object');
    expect(vm.runInContext('typeof INIT_NAVIGATION', ctx, { filename: SONDA })).toBe('object');
  });

  test('nenhuma ação é tratada pelos dois sistemas ao mesmo tempo', () => {
    const doEventBus = vm.runInContext(
      'Object.keys(EVENT_HANDLERS).reduce(function(acc, ns) {'
      + '  return acc.concat(Object.keys(EVENT_HANDLERS[ns]));'
      + '}, [])',
      ctx,
      { filename: SONDA },
    );

    // INIT_NAVIGATION monta o mapa de ações dentro de handleAction; extraímos os
    // nomes do fonte, que é como eles são declarados.
    const fonteNav = fs.readFileSync(
      path.join(root, 'js/modules/init-navigation.js'), 'utf8',
    );
    const doNav = [...fonteNav.matchAll(/'([a-z-]+)':\s*function/g)].map((m) => m[1]);

    const duplicadas = doEventBus.filter((a) => doNav.includes(a)).sort();

    expect(duplicadas).toEqual([]);
  });

  test('todo namespace registrado no EVENT_INIT tem handlers', () => {
    // Um namespace apontando para um mapa inexistente fazia `handlers[action]`
    // estourar a cada clique dentro do container — um erro por clique, sem nada
    // visível na tela.
    const namespacesComHandlers = vm.runInContext(
      'Object.keys(EVENT_HANDLERS)',
      ctx,
      { filename: SONDA },
    );

    const fonteBus = fs.readFileSync(path.join(root, 'js/core/event-bus.js'), 'utf8');
    const setup = fonteBus.slice(fonteBus.indexOf('setup: function'));
    const registrados = [...setup.matchAll(/EVENT_HANDLERS\.(\w+)/g)].map((m) => m[1]);

    expect(registrados.length).toBeGreaterThan(0);

    const orfaos = registrados.filter((ns) => !namespacesComHandlers.includes(ns));
    expect(orfaos).toEqual([]);
  });
});
