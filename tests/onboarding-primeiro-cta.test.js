/**
 * onboarding-primeiro-cta.test.js — instalação limpa: CTA não é engolido pelo tour
 */
/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadCoreModules, resetFixtures } = require('./load-sources');

var sandbox;

beforeAll(function() {
  loadCoreModules();

  sandbox = {
    document: document,
    window: window,
    console: console,
    setTimeout: function() { return global.setTimeout.apply(null, arguments); },
    clearTimeout: function() { return global.clearTimeout.apply(null, arguments); },
    UTILS: global.UTILS,
    DADOS: global.DADOS,
    TRANSACOES: global.TRANSACOES,
    FocusTrap: undefined,
    ariaLive: { announce: function() {} },
    renderLucideIconsNow: function() {},
    renderLucideIcons: function() {},
    mudarAba: null,
    INIT_NAVIGATION: null
  };
  sandbox.globalThis = sandbox;
  var ctx = vm.createContext(sandbox);
  var code = fs.readFileSync(path.join(__dirname, '..', 'js', 'onboarding.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: path.join(__dirname, '..', 'js', 'onboarding.js') });
  global.ONBOARDING = sandbox.ONBOARDING;
});

beforeEach(function() {
  resetFixtures();
  jest.useFakeTimers();
  document.body.innerHTML = '';
  sandbox.mudarAba = null;
  sandbox.INIT_NAVIGATION = null;
  if (global.DADOS && global.DADOS.salvarConfig) {
    global.DADOS.salvarConfig({ onboardingConcluido: false });
  }
});

afterEach(function() {
  if (global.ONBOARDING && global.ONBOARDING.encerrar) {
    global.ONBOARDING.encerrar(true);
  }
  jest.useRealTimers();
});

describe('primeiro CTA em instalação limpa', function() {
  test('iniciar() mostra convite, não abre tour automaticamente', function() {
    global.ONBOARDING.iniciar();
    jest.advanceTimersByTime(5000);

    var st = global.ONBOARDING._estado();
    expect(st.ativo).toBe(false);
    expect(st.convite).toBe(true);
    expect(document.getElementById('onboarding-overlay')).toBeNull();
    expect(document.getElementById('onboarding-invite')).not.toBeNull();
  });

  test('clicar Registrar Transação cancela convite e não abre tour', function() {
    global.ONBOARDING.iniciar();
    jest.advanceTimersByTime(3000);

    var liberou = global.ONBOARDING.registrarInteracao({ aba: 'novo' });
    expect(liberou).toBe(true);

    jest.advanceTimersByTime(5000);
    var st = global.ONBOARDING._estado();
    expect(st.ativo).toBe(false);
    expect(st.interagiu).toBe(true);
    expect(st.convite).toBe(false);
    expect(document.getElementById('onboarding-overlay')).toBeNull();
  });

  test('tour só abre com abrirTourExplicito', function() {
    global.ONBOARDING.iniciar();
    jest.advanceTimersByTime(3000);
    expect(global.ONBOARDING._estado().convite).toBe(true);

    global.ONBOARDING.abrirTourExplicito();
    expect(global.ONBOARDING._estado().ativo).toBe(true);
    expect(document.getElementById('onboarding-overlay')).not.toBeNull();
  });

  test('Agora não retoma a aba pendente', function() {
    var abas = [];
    sandbox.INIT_NAVIGATION = {
      mudarAba: function(aba) { abas.push(aba); }
    };

    global.ONBOARDING.registrarInteracao({ aba: 'novo' });
    expect(global.ONBOARDING._estado().pendente).toEqual({ aba: 'novo' });

    global.ONBOARDING.encerrar(false);
    expect(abas).toContain('novo');
    expect(abas).not.toContain('resumo');
  });
});
